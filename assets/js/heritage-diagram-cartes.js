/* LCNDA — 🗺️ Diagrammes « Cartes » (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  - choropleth : carte colorée par zones (départements, régions, provinces, cantons, régions NUTS, pays, continents),
 *    dégradé ou classes, légende, étiquettes, valeur au survol ;
 *  - flowmap : carte des migrations, flèches courbes d'un lieu à un autre, plus épaisses quand il y a plus de personnes.
 * Fonds de carte : assets/data/geo/<fond>.json (TopoJSON simplifié, licences dans assets/data/geo/LICENCES.txt), chargés
 * seulement quand une carte est dessinée. Projections : Equal Earth, Robinson (monde), Lambert azimutale équivalente,
 * Lambert conique conforme (Europe, pays), Mercator. Cadrage libre (molette, glisser, cadre tracé) enregistré dans
 * spec.o.view, ou cadrages tout faits (spec.o.frame).
 * Branchements (heritage-diagrams.js) : kind.resolve(spec) → Promise<spec> (fond chargé, chiffres de l'app relus),
 * kind.afterDraw(aperçu, api) (cadrage à la souris dans l'éditeur), kind.appPane(boîte, api) (onglet « Depuis l'app »).
 * Données de l'app : api.php?action=diagram_geo (lib/diagram_cartes.php).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const DR = ext.diagramRender; if (!DR?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = DR.num, color = DR.color;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2}); // un seul formateur : toLocaleString à chaque nombre est lent
    const fmt = n => NF.format(Number.isFinite(n) ? n : 0);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', style = '', halo = ''} = {}) =>
        `<text x="${r1(x)}" y="${r1(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${style ? ` font-style="${style}"` : ''}${halo ? ` stroke="${halo}" stroke-width="${r2(size / 4)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
    const contrast = c => { const m = String(c).match(/^#([0-9a-f]{6}|[0-9a-f]{3})\b/i); if (!m) return '#1d1d1f'; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#1d1d1f' : '#ffffff'; };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const rowsOf = (spec, max = 5000) => (Array.isArray(spec.rows) ? spec.rows : []).filter(r => r && typeof r === 'object').slice(0, max);
    const pl = (n, one, many = '') => A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const hex6 = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : '';

    /* ═════════ Les fonds de carte ═════════ */
    const GEO_DIR = 'assets/data/geo/', GEO_V = 1;
    const ATTR = {ne: 'Fond : Natural Earth', ign: 'Fond : IGN Admin Express (Licence Ouverte)', nuts: 'Fond : © EuroGeographics (Eurostat GISCO)', osm: 'Fond : © contributeurs OpenStreetMap (ODbL)'};
    const FILES = {'monde-110m': 'ne', 'monde-50m': 'ne', continents: 'ne', 'fr-departements': 'ign', 'fr-regions': 'ign', 'be-provinces': 'nuts', 'be-regions': 'nuts', 'ch-cantons': 'nuts', 'ch-regions': 'nuts', 'lu-cantons': 'osm', 'eu-nuts1': 'nuts', 'eu-nuts2': 'nuts'};
    // les cartes, leurs niveaux de détail [niveau, fond, nom] et leur cadrage de départ [ouest, sud, est, nord]
    const MAPS = {
        fr: {label: 'France', levels: [['dep', 'fr-departements', 'Départements'], ['reg', 'fr-regions', 'Régions']], view: [-5.2, 41.3, 9.6, 51.15], ctx: true, insets: true},
        be: {label: 'Belgique', levels: [['prov', 'be-provinces', 'Provinces'], ['reg', 'be-regions', 'Régions']], view: [2.5, 49.47, 6.43, 51.53], ctx: true},
        ch: {label: 'Suisse', levels: [['cant', 'ch-cantons', 'Cantons'], ['reg', 'ch-regions', 'Grandes régions']], view: [5.92, 45.8, 10.52, 47.84], ctx: true},
        lu: {label: 'Luxembourg', levels: [['cant', 'lu-cantons', 'Cantons']], view: [5.72, 49.43, 6.55, 50.19], ctx: true},
        eu: {label: 'Europe', levels: [['pays', 'monde-50m', 'Pays'], ['nuts1', 'eu-nuts1', 'Grandes régions (NUTS 1)'], ['nuts2', 'eu-nuts2', 'Régions (NUTS 2)']], view: [-24.5, 34.3, 44.8, 71.3], ctx: true},
        monde: {label: 'Monde', levels: [['pays', 'monde', 'Pays'], ['cont', 'continents', 'Continents']], view: [-180, -57, 180, 83.7]},
    };
    // cadrages tout faits [clé, nom, [ouest, sud, est, nord]]
    const FRAMES_WORLD = [['monde', 'Le monde entier', [-180, -57, 180, 83.7]], ['europe', 'Europe', [-24.5, 34.3, 44.8, 71.3]], ['euouest', 'Europe de l’Ouest', [-11, 35.6, 17.5, 59.5]], ['france', 'France et voisins', [-6.5, 41, 11, 51.8]],
        ['ilesbrit', 'Îles Britanniques', [-11, 49.7, 2.3, 59.4]], ['iberique', 'Péninsule Ibérique', [-10, 35.8, 4.5, 44]], ['italie', 'Italie', [6.5, 36.4, 18.6, 47.2]], ['allemagne', 'Allemagne et Benelux', [2.4, 47.1, 15.2, 55.1]],
        ['scandinavie', 'Scandinavie', [4, 54.4, 31.8, 71.3]], ['eucentrale', 'Europe centrale', [8.5, 45, 25, 55.5]], ['balkans', 'Balkans', [13, 35.5, 30, 48.5]], ['med', 'Méditerranée', [-10, 29.5, 37, 47.5]],
        ['afnord', 'Afrique du Nord', [-17.5, 18, 37, 38.5]], ['afouest', 'Afrique de l’Ouest', [-18, 3.5, 16, 25]], ['afrique', 'Afrique', [-19, -35.5, 52.5, 38]], ['moyenorient', 'Proche et Moyen-Orient', [25, 12, 63, 42.5]],
        ['ocindien', 'Océan Indien', [28, -38, 100, 26]], ['asie', 'Asie', [25, -11, 150, 56]], ['asiesudest', 'Asie du Sud-Est', [92, -11, 141, 29]], ['oceanie', 'Océanie', [110, -48, 180, 0]],
        ['atlantique', 'Atlantique Nord (vers l’Amérique)', [-100, 15, 20, 62]], ['amnord', 'Amérique du Nord', [-168, 14, -52, 72]], ['quebec', 'Québec et Acadie', [-80, 42, -57, 53]], ['usa', 'États-Unis', [-125, 24, -66, 50]],
        ['antilles', 'Antilles et Caraïbes', [-86, 9.5, -59, 24.5]], ['amcentrale', 'Amérique centrale', [-118, 6, -59, 33]], ['amsud', 'Amérique du Sud', [-82, -56, -34, 13]]];
    const FRAMES_FR = [['nordouest', 'Bretagne, Normandie, Pays de la Loire', [-5.2, 46.2, 1.9, 50.1]], ['nord', 'Nord, Picardie, Île-de-France', [0.8, 48, 4.4, 51.15]], ['est', 'Grand Est, Bourgogne, Franche-Comté', [2.8, 46.1, 8.3, 50.2]],
        ['centre', 'Centre et Massif central', [-0.5, 44.2, 4.9, 48.6]], ['sudouest', 'Sud-Ouest', [-2, 42.3, 3.3, 47]], ['sudest', 'Sud-Est et Alpes', [2.7, 42.9, 7.8, 46.6]], ['idf', 'Île-de-France', [1.4, 48.1, 3.6, 49.25]], ['corse', 'Corse', [8.4, 41.3, 9.7, 43.1]]];
    const framesOf = map => map === 'fr' ? FRAMES_FR : map === 'eu' || map === 'monde' ? FRAMES_WORLD : [];

    const store = new Map(); // fond → {data} | {promise} | {error}
    const waiting = new Map(); // jeton → {spec, width} : dessins à refaire quand leur fond arrive
    let waitSeq = 0, uidSeq = 0;
    function decode(raw, id) {
        const t = raw?.topo; if (!t || !Array.isArray(t.arcs) || !t.objects?.z || !Array.isArray(t.objects.z.geometries)) throw new Error('Fond de carte illisible.');
        const [sx, sy] = t.transform?.scale || [1, 1], [tx, ty] = t.transform?.translate || [0, 0];
        const arcs = t.arcs.map(a => { let x = 0, y = 0; const out = new Float64Array(a.length * 2); for (let i = 0; i < a.length; i++) { x += a[i][0]; y += a[i][1]; out[i * 2] = x * sx + tx; out[i * 2 + 1] = y * sy + ty; } return out; });
        const ring = idx => { const pts = []; for (const i of idx) { const a = arcs[i < 0 ? ~i : i]; if (!a) continue; const n = a.length / 2; for (let j = 0; j < n; j++) { if (j === 0 && pts.length) continue; const k = i < 0 ? n - 1 - j : j; pts.push(a[k * 2], a[k * 2 + 1]); } } return Float64Array.from(pts); };
        const zones = t.objects.z.geometries.map((g, gi) => {
            const p = g.properties || {}, polys = (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []).map(pp => pp.map(ring));
            let b = [Infinity, Infinity, -Infinity, -Infinity]; polys.forEach(pp => { const r = pp[0]; for (let i = 0; i < r.length; i += 2) { if (r[i] < b[0]) b[0] = r[i]; if (r[i] > b[2]) b[2] = r[i]; if (r[i + 1] < b[1]) b[1] = r[i + 1]; if (r[i + 1] > b[3]) b[3] = r[i + 1]; } });
            return {i: gi, id: String(p.i ?? ''), name: String(p.n ?? p.i ?? ''), alt: Array.isArray(p.a) ? p.a.map(String) : [], parent: String(p.p ?? ''), label: Array.isArray(p.l) ? p.l.map(Number) : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], outre: !!p.o, polys, bbox: b};
        }).filter(z => z.polys.length);
        const index = new Map(), add = (k, z) => { const f = fold(k); if (f && !index.has(f)) index.set(f, z); };
        zones.forEach(z => { add(z.id, z); if (/^0\d$/.test(z.id)) add(z.id.slice(1), z); }); zones.forEach(z => z.alt.forEach(a => add(a, z))); zones.forEach(z => add(z.name, z));
        const dupNames = new Set(); const seen = new Set(); zones.forEach(z => { const f = fold(z.name); if (seen.has(f)) dupNames.add(f); seen.add(f); });
        return {id, name: String(raw.name || id), attr: ATTR[FILES[id]] || '', zones, index, dupNames, bbox: raw.bbox};
    }
    function load(id) {
        if (!FILES[id]) return Promise.reject(new Error('Fond de carte inconnu.'));
        const hit = store.get(id); if (hit?.data) return Promise.resolve(hit.data); if (hit?.promise) return hit.promise;
        const promise = fetch(`${GEO_DIR}${id}.json?v=${GEO_V}`, {credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error('Fond de carte introuvable.'); return r.json(); })
            .then(raw => { const data = decode(raw, id); store.set(id, {data}); redrawWaiting(); return data; })
            .catch(e => { store.set(id, {error: e.message || 'Fond de carte indisponible.'}); redrawWaiting(); throw e; });
        store.set(id, {promise}); return promise;
    }
    const loaded = id => store.get(id)?.data || null;
    function redrawWaiting() {
        clearTimeout(redrawWaiting.t); redrawWaiting.t = setTimeout(() => {
            if (typeof document === 'undefined') return;
            document.querySelectorAll('[data-geo-wait]').forEach(el => { const w = waiting.get(el.getAttribute('data-geo-wait')); const root = el.closest('svg'); if (!w || !root?.parentNode) return; if (w.needs.some(n => store.get(n)?.promise)) return; waiting.delete(el.getAttribute('data-geo-wait')); try { root.outerHTML = DR.svg(w.spec, w.width); } catch (_) {} });
            if (waiting.size > 300) [...waiting.keys()].slice(0, waiting.size - 300).forEach(k => waiting.delete(k));
        }, 30);
    }

    /* ═════════ Les projections : (λ, φ en radians) → (x, y) ; y vers le haut ═════════ */
    const RAD = Math.PI / 180;
    const wrap = l => { while (l > Math.PI) l -= 2 * Math.PI; while (l < -Math.PI) l += 2 * Math.PI; return l; };
    const EE = {A1: 1.340264, A2: -0.081106, A3: 0.000893, A4: 0.003796, M: Math.sqrt(3) / 2};
    const ROB_X = [1, .9986, .9954, .99, .9822, .973, .96, .9427, .9216, .8962, .8679, .835, .7986, .7597, .7186, .6732, .6213, .5722, .5322];
    const ROB_Y = [0, .062, .124, .186, .248, .31, .372, .434, .4958, .5571, .6176, .6769, .7346, .7903, .8435, .8936, .9394, .9761, 1];
    const robI = (tab, d) => { const a = clamp(Math.abs(d) / 5, 0, 18), i = Math.min(17, Math.floor(a)), f = a - i; return tab[i] + (tab[i + 1] - tab[i]) * f; };
    function makeProj(kind, view) {
        const [w, s, e, n] = view, lam0 = ((w + e) / 2) * RAD, phi0 = clamp((s + n) / 2, -89, 89) * RAD;
        if (kind === 'equalearth') return {
            f: (l, p) => { l = l - lam0; const t = Math.asin(EE.M * Math.sin(p)), t2 = t * t, t6 = t2 * t2 * t2; return [l * Math.cos(t) / (EE.M * (EE.A1 + 3 * EE.A2 * t2 + t6 * (7 * EE.A3 + 9 * EE.A4 * t2))), t * (EE.A1 + EE.A2 * t2 + t6 * (EE.A3 + EE.A4 * t2))]; },
            inv: (x, y) => { let t = y, t2, t6, fy, fpy; for (let i = 0; i < 12; i++) { t2 = t * t; t6 = t2 * t2 * t2; fy = t * (EE.A1 + EE.A2 * t2 + t6 * (EE.A3 + EE.A4 * t2)) - y; fpy = EE.A1 + 3 * EE.A2 * t2 + t6 * (7 * EE.A3 + 9 * EE.A4 * t2); t -= fy / fpy; if (Math.abs(fy) < 1e-9) break; } t2 = t * t; t6 = t2 * t2 * t2; return [lam0 + EE.M * x * (EE.A1 + 3 * EE.A2 * t2 + t6 * (7 * EE.A3 + 9 * EE.A4 * t2)) / Math.cos(t), Math.asin(clamp(Math.sin(t) / EE.M, -1, 1))]; }};
        if (kind === 'robinson') return {
            f: (l, p) => { l = l - lam0; const d = p / RAD; return [.8487 * robI(ROB_X, d) * l, 1.3523 * robI(ROB_Y, d) * Math.sign(d)]; },
            inv: (x, y) => { const yy = clamp(Math.abs(y) / 1.3523, 0, 1); let i = 0; while (i < 17 && ROB_Y[i + 1] < yy) i++; const d = (i + (yy - ROB_Y[i]) / ((ROB_Y[i + 1] - ROB_Y[i]) || 1)) * 5; return [lam0 + x / (.8487 * robI(ROB_X, d)), Math.sign(y) * d * RAD]; }};
        if (kind === 'mercator') return {
            f: (l, p) => [l - lam0, Math.log(Math.tan(Math.PI / 4 + clamp(p, -1.48, 1.48) / 2))],
            inv: (x, y) => [lam0 + x, 2 * Math.atan(Math.exp(y)) - Math.PI / 2]};
        if (kind === 'lambert') {
            const p1 = (s + (n - s) / 6) * RAD, p2 = (n - (n - s) / 6) * RAD;
            if (Math.abs(p1 + p2) > 4 * RAD && Math.abs(p1) < 1.5 && Math.abs(p2) < 1.5) {
                const tn = p => Math.tan(Math.PI / 4 + p / 2), nn = Math.abs(p1 - p2) < 1e-6 ? Math.sin(p1) : Math.log(Math.cos(p1) / Math.cos(p2)) / Math.log(tn(p2) / tn(p1));
                const F = Math.cos(p1) * Math.pow(tn(p1), nn) / nn, rho = p => F / Math.pow(tn(clamp(p, -1.5, 1.5)), nn), rho0 = rho(phi0);
                return {f: (l, p) => { const r = rho(p), t = nn * wrap(l - lam0); return [r * Math.sin(t), rho0 - r * Math.cos(t)]; },
                    inv: (x, y) => { const dy = rho0 - y, r = Math.sign(nn) * Math.sqrt(x * x + dy * dy), t = Math.atan2(nn < 0 ? -x : x, nn < 0 ? -dy : dy); return [lam0 + t / nn, 2 * Math.atan(Math.pow(F / r, 1 / nn)) - Math.PI / 2]; }};
            }
        }
        // Lambert azimutale équivalente, centrée sur le cadrage (comme la projection officielle européenne ETRS89-LAEA)
        const sp0 = Math.sin(phi0), cp0 = Math.cos(phi0);
        return {
            f: (l, p) => { const dl = wrap(l - lam0), cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(dl), k = Math.sqrt(2 / Math.max(1e-9, 1 + sp0 * sp + cp0 * cp * cl)); return [k * cp * Math.sin(dl), k * (cp0 * sp - sp0 * cp * cl)]; },
            inv: (x, y) => { const r = Math.sqrt(x * x + y * y); if (r < 1e-12) return [lam0, phi0]; const c = 2 * Math.asin(clamp(r / 2, -1, 1)), sc = Math.sin(c), cc = Math.cos(c); return [lam0 + Math.atan2(x * sc, r * cp0 * cc - y * sp0 * sc), Math.asin(clamp(cc * sp0 + y * sc * cp0 / r, -1, 1))]; }};
    }
    const autoProj = view => (view[2] - view[0] > 100 || view[3] - view[1] > 80) ? 'equalearth' : 'laea';
    /** projection ajustée à une boîte de w × h pixels (le cadrage tient en entier, centré) */
    function fitProj(kind, view, w, hMax, hAuto) {
        const P = makeProj(kind, view), pts = [];
        for (let i = 0; i <= 24; i++) { const lo = view[0] + (view[2] - view[0]) * i / 24, la = view[1] + (view[3] - view[1]) * i / 24; pts.push([lo, view[1]], [lo, view[3]], [view[0], la], [view[2], la], [lo, (view[1] + view[3]) / 2]); }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        pts.forEach(([lo, la]) => { const [x, y] = P.f(lo * RAD, la * RAD); if (!Number.isFinite(x) || !Number.isFinite(y)) return; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
        const bw = Math.max(1e-9, x1 - x0), bh = Math.max(1e-9, y1 - y0);
        const h = hAuto ? clamp(w * bh / bw, w * .3, Math.min(hMax, w * 1.6)) : hMax;
        const k = Math.min(w / bw, h / bh), ox = (w - bw * k) / 2, oy = (h - bh * k) / 2;
        return {h, k, kind, view,
            p: (lo, la) => { const [x, y] = P.f(lo * RAD, la * RAD); return [ox + (x - x0) * k, oy + (y1 - y) * k]; },
            inv: (px, py) => { const [l, p] = P.inv((px - ox) / k + x0, y1 - (py - oy) / k); return [clamp(l / RAD, -540, 540), clamp(p / RAD, -90, 90)]; }};
    }

    /* ── les tracés en SVG (mémoire des derniers dessins : les mêmes zones ne sont pas recalculées) ── */
    const pathMem = new Map();
    function zonePath(z, pr, w, h, cull = true) {
        let d = ''; const jump = Math.max(w, h) * .55;
        for (const poly of z.polys) for (const r of poly) {
            let s = '', n = 0, lx = NaN, ly = NaN, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, off = 0, plo = NaN;
            for (let i = 0; i < r.length; i += 2) {
                // un contour qui passe la ligne des 180° (Russie, Fidji…) : longitudes suivies d'un seul tenant (190° au lieu de -170°)
                if (r[i] - plo > 180) off -= 360; else if (r[i] - plo < -180) off += 360; plo = r[i];
                const [x, y] = pr.p(r[i] + off, r[i + 1]); if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (n && Math.abs(x - lx) > jump) { n = -1; break; } // un anneau qui saute d'un bord à l'autre (180°) : pas dessiné
                if (n && Math.abs(x - lx) < .5 && Math.abs(y - ly) < .5 && i < r.length - 2) continue;
                s += (n ? 'L' : 'M') + r1(x) + ' ' + r1(y); n++; lx = x; ly = y;
                if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
            }
            if (n < 3 || (bx1 - bx0 < .4 && by1 - by0 < .4)) continue;
            if (cull && (bx1 < -20 || by1 < -20 || bx0 > w + 20 || by0 > h + 20)) continue;
            d += s + 'Z';
        }
        return d;
    }
    function pathsOf(base, pr, w, h, key) {
        const k = `${base.id}|${key}`; let m = pathMem.get(k);
        if (m) { pathMem.delete(k); pathMem.set(k, m); return m; }
        const v = pr.view, mx = (v[2] - v[0]) * .25 + 1, my = (v[3] - v[1]) * .25 + 1, all = v[2] - v[0] > 300;
        m = base.zones.map(z => (!all && (z.bbox[2] < v[0] - mx || z.bbox[0] > v[2] + mx || z.bbox[3] < v[1] - my || z.bbox[1] > v[3] + my)) ? '' : zonePath(z, pr, w, h));
        pathMem.set(k, m); if (pathMem.size > 16) pathMem.delete(pathMem.keys().next().value);
        return m;
    }

    /* ── ce que dessine une carte : fond, cadrage, projection ── */
    const mapOf = o => MAPS[o.map] ? o.map : 'fr';
    const levelOf = o => { const M = MAPS[mapOf(o)], l = M.levels.find(x => x[0] === o.level); return l || M.levels[0]; };
    const parseView = v => { const a = String(v || '').split(/[\s,;]+/).map(Number); return a.length === 4 && a.every(Number.isFinite) && a[2] > a[0] && a[3] > a[1] ? [clamp(a[0], -180, 180), clamp(a[1], -85, 85), clamp(a[2], -180, 180), clamp(a[3], -85, 85)] : null; };
    function viewOf(o, auto = null) {
        const M = MAPS[mapOf(o)];
        if (o.frame === 'custom') { const v = parseView(o.view); if (v) return v; }
        const f = framesOf(mapOf(o)).find(x => x[0] === o.frame); if (f) return f[2];
        return auto || M.view;
    }
    const baseIdOf = (o, view) => { const id = levelOf(o)[1]; return id === 'monde' ? (view[2] - view[0] > 70 ? 'monde-110m' : 'monde-50m') : id; };
    const ctxIdOf = (o, baseId, view) => MAPS[mapOf(o)].ctx && o.context !== false && !baseId.startsWith('monde') ? (view[2] - view[0] > 70 ? 'monde-110m' : 'monde-50m') : '';
    /** le fond (et le fond autour) : déjà là, ou un dessin d'attente qui se refera tout seul */
    function needBases(spec, W, ids) {
        const miss = ids.filter(id => id && !loaded(id));
        if (!miss.length) return null;
        const err = miss.map(id => store.get(id)?.error).find(Boolean);
        if (err) return {h: 80, svg: T(W / 2, 40, `🗺️ ${err}`, {anchor: 'middle', size: 13, fill: '#a33'})};
        miss.forEach(id => load(id).catch(() => {}));
        const tok = 'g' + (++waitSeq); waiting.set(tok, {spec: {...spec}, width: W + 32, needs: miss});
        const h = Math.round(W * .62);
        return {h, svg: `<g data-geo-wait="${tok}"><rect width="${r1(W)}" height="${h}" rx="10" fill="#eef2f6"/>${T(W / 2, h / 2, '🗺️ Chargement du fond de carte…', {anchor: 'middle', size: Math.max(11, W / 40), fill: '#667'})}</g>`};
    }
    const attrOf = (base, ctx) => ctx && ctx.attr && ctx.attr !== base.attr ? `${base.attr} ; ${ctx.attr.replace(/^Fond : /, '')}` : base.attr;
    const unitFor = (v, unit) => Math.abs(v) < 2 ? String(unit).replace(/(\S)s\b/g, '$1') : unit; // « 1 personne », « 6 personnes »
    const SEA = '#e3edf6', LAND = '#f1f0ec', LAND_LINE = '#c9c6bd';
    /** le dessin du fond : mer, pays autour, zones (remplies par fillOf), encarts d'outre-mer */
    function drawBase(spec, base, ctx, pr, w, h, fillOf, uid) {
        const o = spec.o || {}, key = `${pr.kind}|${pr.view.join(',')}|${Math.round(w)}x${Math.round(h)}`;
        const line = color(o.borderColor, '#ffffff'), lw = clamp(num(o.borderWidth) || .8, .1, 6);
        let svg = `<defs><clipPath id="${uid}c"><rect width="${r1(w)}" height="${r1(h)}"/></clipPath></defs><g clip-path="url(#${uid}c)">`;
        if (o.sea !== false) svg += `<rect width="${r1(w)}" height="${r1(h)}" fill="${color(o.seaColor, SEA)}"/>`;
        if (ctx) { const cp = pathsOf(ctx, pr, w, h, key); svg += `<path d="${cp.join('')}" fill="${color(o.landColor, LAND)}" stroke="${LAND_LINE}" stroke-width=".6" stroke-linejoin="round"/>`; }
        const paths = pathsOf(base, pr, w, h, key), zones = [];
        base.zones.forEach((z, i) => { if (!paths[i] || (z.outre && !pr.allOutre)) return; const f = fillOf(z); zones.push({z, d: paths[i], f}); });
        // les zones sans chiffre d'abord, en un seul tracé ; puis chaque zone avec sa couleur et sa bulle
        const plain = zones.filter(x => !x.f.title).map(x => x.d).join('');
        if (plain) svg += `<path d="${plain}" fill="${zones.find(x => !x.f.title)?.f.fill || '#e8e8e8'}" stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"/>`;
        zones.filter(x => x.f.title).forEach(x => { svg += `<path class="dgm-z" d="${x.d}" fill="${x.f.fill}" stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"><title>${esc(x.f.title)}</title></path>`; });
        svg += '</g>';
        return {svg, zones};
    }
    /** les encarts d'outre-mer (France) : 2 colonnes en bas à gauche */
    function insetsOf(spec, base, w, h, fillOf) {
        const out = base.zones.filter(z => z.outre); if (!out.length) return {svg: '', zones: []};
        const s = Math.min(w * .1, h * .12, 120), gap = Math.max(3, s * .08), cols = 2, rowsN = Math.ceil(out.length / cols), fsz = clamp(s / 8, 7, 12);
        let svg = ''; const placed = [];
        out.forEach((z, i) => {
            const cx = (i % cols) * (s + gap), cy = h - (rowsN - Math.floor(i / cols)) * (s + gap + fsz) + gap;
            const pad = 4, pr = fitProj('laea', [z.bbox[0] - .05, z.bbox[1] - .05, z.bbox[2] + .05, z.bbox[3] + .05], s - pad * 2, s - pad * 2 - fsz, false);
            const f = fillOf(z), d = zonePath(z, pr, s, s, false);
            svg += `<g transform="translate(${r1(cx)} ${r1(cy)})"><rect width="${r1(s)}" height="${r1(s)}" fill="${color(spec.o?.seaColor, SEA)}" stroke="#9aa3ad" stroke-width=".8" rx="3"/>${T(s / 2, fsz * .8, z.name, {anchor: 'middle', size: fsz, fill: '#444'})}<g transform="translate(${pad} ${r1(pad + fsz)})"><path class="dgm-z" d="${d}" fill="${f.fill}" stroke="${color(spec.o?.borderColor, '#ffffff')}" stroke-width=".7">${f.title ? `<title>${esc(f.title)}</title>` : ''}</path></g></g>`;
            placed.push([cx, cy, s, s]);
        });
        return {svg, boxes: placed};
    }

    /* ═════════ Couleurs : dégradés et classes ═════════ */
    const RAMPS = {bleus: ['#eef4fb', '#9ecae1', '#2171b5', '#08306b'], verts: ['#f1f9ec', '#a1d99b', '#31a354', '#00441b'], oranges: ['#fff3e6', '#fdae6b', '#e6550d', '#7f2704'], rouges: ['#fff0ec', '#fc9272', '#de2d26', '#67000d'],
        violets: ['#f6f2fa', '#bcbddc', '#756bb1', '#3f007d'], jaunerouge: ['#ffffcc', '#feb24c', '#f03b20', '#800026'], bleurouge: ['#2166ac', '#92c5de', '#f7f7f7', '#f4a582', '#b2182b'], sepia: ['#f7efe0', '#d9bf94', '#a67c45', '#5c3d1e'], gris: ['#f2f2f2', '#bdbdbd', '#737373', '#252525']};
    const rgb = c => { const h = hex6(c) || '#888888'; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const toHex = a => '#' + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
    function rampAt(stops, t) { t = clamp(t, 0, 1); const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i, a = rgb(stops[i]), b = rgb(stops[i + 1]); return toHex(a.map((v, j) => v + (b[j] - v) * f)); }
    const rampOf = o => o.ramp === 'perso' ? [hex6(o.lowColor) || '#eef4fb', hex6(o.highColor) || '#08306b'] : RAMPS[o.ramp] || RAMPS.bleus;
    /** les seuils des classes (n classes → n − 1 seuils) */
    function breaksOf(vals, o) {
        const n = clamp(Math.round(num(o.classes) || 5), 2, 9), s = [...vals].sort((a, b) => a - b), lo = s[0], hi = s[s.length - 1];
        if (o.method === 'manual') { const b = String(o.breaks || '').split(/[;\s]+/).filter(x => /^-?\d[\d.,]*$/.test(x)).map(x => num(x)).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b).slice(0, 8); if (b.length) return b; }
        const ints = s.every(Number.isInteger), nice = v => { if (ints) return Math.ceil(v); const m = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1)) - 1); return Math.round(v / m) * m; };
        if (o.method === 'equal' || s.length < n) return [...new Set(Array.from({length: n - 1}, (_, i) => nice(lo + (hi - lo) * (i + 1) / n)))].filter(v => v > lo && v <= hi).concat(hi > lo ? [] : [hi]).filter((v, i, x) => x.indexOf(v) === i).slice(0, 8);
        const out = []; for (let i = 1; i < n; i++) { const q = s[Math.min(s.length - 1, Math.floor(s.length * i / n))]; if ((!out.length || q > out[out.length - 1]) && q > lo) out.push(q); }
        return out.length ? out : [lo + (hi - lo) / 2];
    }
    function scaleOf(vals, o) {
        const stops = rampOf(o), lo = Math.min(...vals), hi = Math.max(...vals);
        if (o.colorMode === 'classes') {
            const br = breaksOf(vals, o), n = br.length + 1, cols = Array.from({length: n}, (_, i) => rampAt(stops, n === 1 ? 1 : i / (n - 1)));
            return {classes: true, br, cols, lo, hi, color: v => { let i = 0; while (i < br.length && v >= br[i]) i++; return cols[i]; }};
        }
        const log = o.logScale && lo > 0, L = v => log ? Math.log(v) : v, a = L(lo), b = L(hi);
        return {classes: false, lo, hi, log, stops, color: v => rampAt(stops, b > a ? (L(v) - a) / (b - a) : 1)};
    }

    /** les lignes du tableau rattachées aux zones du fond : {byZone: Map(zone → {v, notes}), missing: [noms]} */
    function matchZone(base, raw) {
        const s = String(raw ?? '').trim(); if (!s) return null;
        let z = base.index.get(fold(s)); if (z) return z;
        const par = s.match(/\(([^()]{1,12})\)\s*$/); if (par && (z = base.index.get(fold(par[1])))) return z;
        const strip = fold(s).replace(/^(departement|dept|dep|region|province|prov|canton|pays|land|comte) (de la |de l |de |du |des |d )?/, '').trim(); if ((z = base.index.get(strip))) return z;
        const first = fold(s.split(',')[0]); if (first && (z = base.index.get(first))) return z;
        const lead = s.match(/^\s*(\d{2,3}|2[ab])\b/i); if (lead && (z = base.index.get(fold(lead[1])))) return z;
        return null;
    }
    function joinRows(spec, base) {
        const byZone = new Map(), missing = [];
        rowsOf(spec).forEach(r => {
            const label = r.label ?? r.zone; if (String(label ?? '').trim() === '') return;
            const z = matchZone(base, label); if (!z) { if (missing.length < 40) missing.push(String(label).slice(0, 40)); return; }
            const blankV = r.s0 === undefined || r.s0 === null || String(r.s0).trim() === '';
            const e = byZone.get(z) || {v: 0, has: false, notes: []}; if (!blankV) { e.v += num(r.s0); e.has = true; } if (r.note) e.notes.push(String(r.note).slice(0, 120)); byZone.set(z, e);
        });
        [...byZone].forEach(([z, e]) => { if (!e.has && !e.notes.length) byZone.delete(z); });
        return {byZone, missing};
    }

    /* ═════════ 🗺️ Carte colorée par zones ═════════ */
    function choropleth(spec, W, fs) {
        const o = spec.o || {}, view = viewOf(o), baseId = baseIdOf(o, view), ctxId = ctxIdOf(o, baseId, view);
        const wait = needBases(spec, W, [baseId, ctxId]); if (wait) return wait;
        const base = loaded(baseId), ctx = ctxId ? loaded(ctxId) : null, uid = 'dgm' + (++uidSeq);
        const legPos = o.legend === 'none' ? 'none' : o.legend === 'right' ? 'right' : 'bottom';
        const legW = legPos === 'right' ? clamp(W * .24, 110, 220) : 0, w = W - legW - (legW ? fs : 0);
        const pr = fitProj(o.proj && o.proj !== 'auto' ? o.proj : autoProj(view), view, w, clamp(num(o.height) || 2400, 120, 3000), !num(o.height));
        const h = pr.h, unit = o.unit ? ' ' + String(o.unit).slice(0, 30) : '', series = String(spec.series?.[0]?.name || '').slice(0, 60);
        const {byZone, missing} = joinRows(spec, base);
        const vals = [...byZone.values()].filter(e => e.has).map(e => e.v), sc = vals.length ? scaleOf(vals, o) : null, noData = color(o.noData, '#e4e4e7');
        const fillOf = z => { const e = byZone.get(z); if (!e) return {fill: noData, title: o.hoverAll !== false ? `${z.name}${z.id && !/^x-/.test(z.id) ? ` (${z.id})` : ''} : pas de chiffre` : ''};
            return {fill: e.has && sc ? sc.color(e.v) : noData, title: `${z.name}${z.id && !/^x-/.test(z.id) ? ` (${z.id})` : ''} : ${e.has ? fmt(e.v) + unit : 'pas de chiffre'}${series && e.has ? ' — ' + series : ''}${e.notes.length ? '\n' + e.notes.join('\n') : ''}`, v: e.has ? e.v : null}; };
        pr.allOutre = o.frame === 'custom' || (o.frame && o.frame !== '') || !MAPS[mapOf(o)].insets || o.insets === false;
        const B = drawBase(spec, base, ctx, pr, w, h, fillOf, uid);
        let svg = `<g data-geo-map="${uid}">${B.svg}`, boxes = [];
        if (!pr.allOutre) { const I = insetsOf(spec, base, w, h, fillOf); svg += I.svg; boxes = I.boxes || []; }
        // étiquettes : les plus grandes zones d'abord, sans se chevaucher
        const lab = o.labels || 'auto';
        if (lab !== 'none') {
            const lf = clamp(fs * .78 * (num(o.labelSize) || 1), 6, 40), placed = [...boxes.map(([x, y, bw, bh]) => [x, y, x + bw, y + bh])];
            const cand = B.zones.filter(x => !x.z.outre || pr.allOutre).map(x => { const [lx, ly] = pr.p(x.z.label[0], x.z.label[1]); const bb = [pr.p(x.z.bbox[0], x.z.bbox[1]), pr.p(x.z.bbox[2], x.z.bbox[3])]; return {...x, lx, ly, area: Math.abs((bb[1][0] - bb[0][0]) * (bb[1][1] - bb[0][1]))}; })
                .filter(x => x.lx > 0 && x.lx < w && x.ly > 0 && x.ly < h).sort((a, b) => b.area - a.area).slice(0, 400);
            cand.forEach(x => {
                const e = byZone.get(x.z), hasV = e?.has, lines = [];
                if (lab !== 'value') lines.push(x.z.name);
                if ((lab === 'value' || lab === 'both' || lab === 'auto') && hasV) lines.push(fmt(e.v) + (lab === 'auto' ? '' : unit));
                if (!lines.length) return;
                const tw = Math.max(...lines.map(t => textW(t, lf))), th = lines.length * lf * 1.15;
                if (lab === 'auto' && (tw > Math.sqrt(x.area) * 1.15 || th > Math.sqrt(x.area) * .9)) return;
                const box = [x.lx - tw / 2 - 1, x.ly - th / 2, x.lx + tw / 2 + 1, x.ly + th / 2];
                if (box[0] < 0 || box[2] > w || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return;
                placed.push(box);
                const fc = contrast(x.f.fill), halo = fc === '#ffffff' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.7)';
                lines.forEach((t, i) => { svg += T(x.lx, x.ly - th / 2 + lf * .58 + i * lf * 1.15, t, {anchor: 'middle', size: i ? lf * .92 : lf, weight: i ? 400 : 600, fill: fc, halo}); });
            });
        }
        svg += `<text x="${r1(w - 4)}" y="${r1(h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(attrOf(base, ctx))}</text>`;
        svg += `<rect data-geo-hit="1" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        // légende
        let legH = 0, leg = '';
        if (legPos !== 'none' && sc) {
            const title = [series, o.unit && !fold(series).includes(fold(o.unit)) && !fold(o.unit).includes(fold(series)) ? `(${String(o.unit).slice(0, 30)})` : ''].filter(Boolean).join(' ');
            const hasNo = B.zones.some(x => !byZone.get(x.z)?.has);
            if (sc.classes) {
                const items = sc.cols.map((c, i) => ({c, t: i === 0 ? `moins de ${fmt(sc.br[0])}` : i === sc.cols.length - 1 ? `${fmt(sc.br[i - 1])} et plus` : `de ${fmt(sc.br[i - 1])} à moins de ${fmt(sc.br[i])}`}));
                if (hasNo) items.push({c: noData, t: 'pas de chiffre'});
                if (legPos === 'right') { let y = 0; if (title) { leg += T(0, fs * .7, title, {size: fs * .9, weight: 600}); y = fs * 1.6; } items.forEach(it => { leg += `<rect x="0" y="${r1(y)}" width="${r1(fs * 1.4)}" height="${r1(fs)}" rx="2" fill="${it.c}" stroke="#0002"/>` + T(fs * 1.8, y + fs / 2, it.t, {size: fs * .85}); y += fs * 1.55; }); legH = y; }
                else { let x = 0, y = title ? fs * 1.6 : 0; if (title) leg += T(0, fs * .7, title, {size: fs * .9, weight: 600}); items.forEach(it => { const iw = fs * 1.9 + textW(it.t, fs * .85) + fs; if (x > 0 && x + iw > W) { x = 0; y += fs * 1.6; } leg += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(fs * 1.4)}" height="${r1(fs)}" rx="2" fill="${it.c}" stroke="#0002"/>` + T(x + fs * 1.8, y + fs / 2, it.t, {size: fs * .85}); x += iw; }); legH = y + fs * 1.4; }
            } else {
                const gid = uid + 'g', bw = legPos === 'right' ? fs * 1.3 : Math.min(W * .6, 360), bh = legPos === 'right' ? Math.min(h * .6, 260) : fs * 1.1;
                const stops = sc.stops.map((c, i) => `<stop offset="${r2(i / (sc.stops.length - 1) * 100)}%" stop-color="${c}"/>`).join('');
                const ticks = DR.ticks ? DR.ticks(sc.lo, sc.hi, 4).ticks.filter(t => t >= sc.lo - 1e-9 && t <= sc.hi + 1e-9) : [sc.lo, sc.hi];
                const tv = [...new Set([sc.lo, ...ticks, sc.hi])].slice(0, 7), pos = v => sc.hi > sc.lo ? (sc.log ? (Math.log(v) - Math.log(sc.lo)) / (Math.log(sc.hi) - Math.log(sc.lo)) : (v - sc.lo) / (sc.hi - sc.lo)) : 1;
                if (legPos === 'right') {
                    leg += `<defs><linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0">${stops}</linearGradient></defs>`; let y0 = 0; if (title) { leg += T(0, fs * .7, title, {size: fs * .9, weight: 600}); y0 = fs * 1.6; }
                    leg += `<rect x="0" y="${r1(y0)}" width="${r1(bw)}" height="${r1(bh)}" fill="url(#${gid})" stroke="#0002"/>`;
                    tv.forEach(v => { const y = y0 + bh * (1 - pos(v)); leg += `<line x1="${r1(bw)}" x2="${r1(bw + 4)}" y1="${r1(y)}" y2="${r1(y)}" stroke="currentColor" stroke-opacity=".5"/>` + T(bw + 7, y, fmt(v), {size: fs * .8}); });
                    legH = y0 + bh; if (hasNo) { leg += `<rect x="0" y="${r1(legH + fs * .8)}" width="${r1(bw)}" height="${r1(fs)}" fill="${noData}" stroke="#0002"/>` + T(bw + 7, legH + fs * 1.3, 'pas de chiffre', {size: fs * .8}); legH += fs * 2; }
                } else {
                    leg += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`; const x0 = (W - bw) / 2; let y0 = 0;
                    if (title) { leg += T(W / 2, fs * .7, title, {size: fs * .9, weight: 600, anchor: 'middle'}); y0 = fs * 1.6; }
                    leg += `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(bw)}" height="${r1(bh)}" fill="url(#${gid})" stroke="#0002"/>`;
                    tv.forEach(v => { const x = x0 + bw * pos(v); leg += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${r1(y0 + bh)}" y2="${r1(y0 + bh + 4)}" stroke="currentColor" stroke-opacity=".5"/>` + T(x, y0 + bh + fs * .95, fmt(v), {size: fs * .8, anchor: 'middle'}); });
                    legH = y0 + bh + fs * 1.6;
                    if (hasNo) { leg += `<rect x="${r1(x0 + bw + fs)}" y="${r1(y0)}" width="${r1(fs * 1.3)}" height="${r1(bh)}" fill="${noData}" stroke="#0002"/>` + T(x0 + bw + fs * 2.6, y0 + bh / 2, 'pas de chiffre', {size: fs * .8}); }
                }
            }
        }
        let out = svg, H = h;
        if (leg) { if (legPos === 'right') out += `<g transform="translate(${r1(w + fs)} ${r1(Math.max(0, h / 2 - legH / 2))})">${leg}</g>`; else { out += `<g transform="translate(0 ${r1(h + fs * .9)})">${leg}</g>`; H = h + fs * .9 + legH; } }
        if (missing.length && o.showMissing !== false) { out += T(0, H + fs * .9, `⚠ Pas trouvé sur ce fond : ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`, {size: fs * .78, fill: '#a5552a'}); H += fs * 1.6; }
        if (!rowsOf(spec).length) { out += T(w / 2, h / 2, 'Ajoute des zones et leurs chiffres (onglet Données ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'}); }
        return {h: H, svg: out, geo: {uid, pr, w, h}};
    }

    /* ═════════ 🧭 Carte des migrations ═════════ */
    /** un lieu → [lon, lat, nom] : coordonnées tapées, lieux choisis (spec.places), ou centre d'une zone du fond */
    function placeOf(spec, name, bases) {
        const s = String(name ?? '').trim(); if (!s) return null;
        const m = s.match(/(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*\)?\s*$/);
        if (m) { const la = num(m[1]), lo = num(m[2]); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return [lo, la, s.replace(/\(?\s*-?\d{1,2}(?:[.,]\d+)?\s*[,;\s]\s*-?\d{1,3}(?:[.,]\d+)?\s*\)?\s*$/, '').trim() || s]; }
        const P = spec.places && typeof spec.places === 'object' ? spec.places[fold(s)] : null;
        if (P && Number.isFinite(Number(P.lat)) && Number.isFinite(Number(P.lon)) && Math.abs(P.lat) <= 90 && Math.abs(P.lon) <= 180) return [Number(P.lon), Number(P.lat), s];
        for (const b of bases) { const z = b && matchZone(b, s); if (z) return [z.label[0], z.label[1], s]; }
        return null;
    }
    function flowsOf(spec, bases) {
        const agg = new Map(), unknown = new Set(), pts = new Map();
        rowsOf(spec).forEach(r => {
            const v = Math.max(0, num(r.value)); if (!v) return;
            const a = placeOf(spec, r.from, bases), b = placeOf(spec, r.to, bases);
            if (!a && String(r.from ?? '').trim()) unknown.add(String(r.from).slice(0, 40)); if (!b && String(r.to ?? '').trim()) unknown.add(String(r.to).slice(0, 40));
            if (!a || !b) return; const ka = fold(a[2]), kb = fold(b[2]); if (ka === kb) return;
            const k = ka + '>' + kb, e = agg.get(k) || {a, b, v: 0, color: ''}; e.v += v; if (hex6(r.color)) e.color = r.color; agg.set(k, e);
            [[ka, a], [kb, b]].forEach(([kk, p]) => { const q = pts.get(kk) || {p, out: 0, in: 0}; pts.set(kk, q); }); pts.get(ka).out += v; pts.get(kb).in += v;
        });
        return {flows: [...agg.values()].sort((x, y) => y.v - x.v).slice(0, 500), points: [...pts.values()].slice(0, 2000), unknown: [...unknown]};
    }
    /** le cadrage qui montre tous les lieux (avec une marge), sinon celui de la carte */
    function fitView(points, o) {
        if (!points.length) return null;
        let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; points.forEach(({p}) => { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); });
        const dx = Math.max(1.2, (e - w) * .18), dy = Math.max(.8, (n - s) * .18);
        return [clamp(w - dx, -180, 180), clamp(s - dy, -85, 85), clamp(e + dx, -180, 180), clamp(n + dy, -85, 85)];
    }
    function flowmap(spec, W, fs) {
        const o = spec.o || {}, M = MAPS[mapOf(o)];
        // le fond et le fond autour sont nécessaires avant même de placer les lieux (les zones servent de lieux)
        const pre = viewOf(o), baseId0 = baseIdOf(o, pre), ctx0 = mapOf(o) === 'monde' || mapOf(o) === 'eu' ? 'monde-50m' : ctxIdOf(o, baseId0, pre);
        const wait0 = needBases(spec, W, [baseId0, ctx0, 'monde-110m']); if (wait0) return wait0;
        const bases = [loaded(baseId0), ctx0 ? loaded(ctx0) : null, loaded('monde-110m')].filter(Boolean);
        const F = flowsOf(spec, bases), auto = (!o.frame || o.frame === '') && o.fit !== false ? fitView(F.points, o) : null;
        let view = viewOf(o, auto || M.view);
        const baseId = baseIdOf(o, view), ctxId = ctxIdOf(o, baseId, view);
        const wait = needBases(spec, W, [baseId, ctxId]); if (wait) return wait;
        const base = loaded(baseId), ctx = ctxId ? loaded(ctxId) : null, uid = 'dgm' + (++uidSeq);
        const w = W, pr = fitProj(o.proj && o.proj !== 'auto' ? o.proj : autoProj(view), view, w, clamp(num(o.height) || 2400, 120, 3000), !num(o.height)), h = pr.h;
        pr.allOutre = true;
        const zoneFill = color(o.zoneColor, LAND), B = drawBase({...spec, o: {...o, borderColor: o.borderColor || '#cfcabe'}}, base, ctx, pr, w, h, () => ({fill: zoneFill, title: ''}), uid);
        let svg = `<g data-geo-map="${uid}">${B.svg}<g clip-path="url(#${uid}c)">`;
        const max = Math.max(1, ...F.flows.map(f => f.v)), maxW = clamp(num(o.maxWidth) || 14, 1, 60), minW = clamp(num(o.minWidth) || 1.2, .3, maxW), curve = clamp(num(o.curve ?? 25), 0, 80) / 100;
        const base0 = color(o.flowColor, '#c0392b'), pal = DR.PALETTES[o.palette] || DR.PALETTES.vive, unit = String(o.unit || 'personnes').slice(0, 30), opa = clamp(num(o.opacity) || 75, 10, 100) / 100;
        const originIdx = new Map(); F.flows.forEach(f => { const k = fold(f.a[2]); if (!originIdx.has(k)) originIdx.set(k, originIdx.size); });
        const destIdx = new Map(); F.flows.forEach(f => { const k = fold(f.b[2]); if (!destIdx.has(k)) destIdx.set(k, destIdx.size); });
        const colOf = f => hex6(f.color) || (o.colorBy === 'origin' ? pal[originIdx.get(fold(f.a[2])) % pal.length] : o.colorBy === 'dest' ? pal[destIdx.get(fold(f.b[2])) % pal.length] : base0);
        // les plus gros flux d'abord : les petits restent visibles par-dessus
        F.flows.forEach(f => {
            const [x1, y1] = pr.p(f.a[0], f.a[1]), [x2, y2] = pr.p(f.b[0], f.b[1]); if (![x1, y1, x2, y2].every(Number.isFinite)) return;
            const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); if (len < 1) return;
            const sw = Math.max(minW, maxW * f.v / max), cx = (x1 + x2) / 2 - dy * curve, cy = (y1 + y2) / 2 + dx * curve, c = colOf(f);
            const head = o.arrows === false ? 0 : Math.min(len * .45, Math.max(6, sw * 2.2)), t1 = clamp(1 - head / (len * 1.05), .05, 1);
            const q = t => [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2];
            const [ex, ey] = q(t1), [qx, qy] = [(1 - t1) * x1 + t1 * cx, (1 - t1) * y1 + t1 * cy]; // point de contrôle de la courbe raccourcie (de Casteljau)
            const tip = `${f.a[2]} → ${f.b[2]} : ${fmt(f.v)} ${unitFor(f.v, unit)}`;
            svg += `<g class="dgm-f"><title>${esc(tip)}</title><path d="M${r1(x1)} ${r1(y1)}Q${r1(qx)} ${r1(qy)} ${r1(ex)} ${r1(ey)}" fill="none" stroke="${c}" stroke-opacity="${r2(opa)}" stroke-width="${r2(sw)}" stroke-linecap="round"/>`;
            if (head) { const tx = x2 - ex, ty = y2 - ey, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, hw = Math.max(sw * 1.1, head * .55);
                svg += `<path d="M${r1(x2)} ${r1(y2)}L${r1(ex - uy * hw)} ${r1(ey + ux * hw)}L${r1(ex + uy * hw)} ${r1(ey - ux * hw)}Z" fill="${c}" fill-opacity="${r2(Math.min(1, opa + .1))}"/>`; }
            svg += '</g>';
        });
        // les lieux : un rond (plus gros quand plus de monde part ou arrive) et leur nom
        const maxP = Math.max(1, ...F.points.map(p => p.in + p.out)), placed = [], lf = clamp(fs * .8 * (num(o.labelSize) || 1), 6, 40), dotC = color(o.dotColor, '#1d1d1f');
        const pts = F.points.map(p => { const [x, y] = pr.p(p.p[0], p.p[1]); return {...p, x, y, r: o.dots === false ? 0 : 2 + Math.sqrt((p.in + p.out) / maxP) * clamp(num(o.dotSize) || 7, 1, 30)}; }).filter(p => Number.isFinite(p.x) && p.x >= -5 && p.x <= w + 5 && p.y >= -5 && p.y <= h + 5).sort((a, b) => (b.in + b.out) - (a.in + a.out));
        pts.forEach(p => { if (p.r) svg += `<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${r1(p.r)}" fill="#ffffff" stroke="${dotC}" stroke-width="1.2"><title>${esc(`${p.p[2]} : ${fmt(p.out)} départ${p.out > 1 ? 's' : ''}, ${fmt(p.in)} arrivée${p.in > 1 ? 's' : ''}`)}</title></circle>`; });
        if (o.placeLabels !== 'none') pts.forEach((p, i) => {
            if (i >= (o.placeLabels === 'big' ? 12 : 150) || placed.length > 120) return; // au plus 150 noms essayés : rien ne fige
            const t = p.p[2], tw = textW(t, lf); let bx = p.x + p.r + 3, anchor = 'start'; if (bx + tw > w - 2) { bx = p.x - p.r - 3; anchor = 'end'; }
            const box = anchor === 'start' ? [bx, p.y - lf * .6, bx + tw, p.y + lf * .6] : [bx - tw, p.y - lf * .6, bx, p.y + lf * .6];
            if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return; placed.push(box);
            svg += T(bx, p.y, t, {size: lf, anchor, weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'});
        });
        svg += `</g><text x="${r1(w - 4)}" y="${r1(h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(attrOf(base, ctx))}</text><rect data-geo-hit="1" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        let H = h;
        if (o.legend !== 'none' && F.flows.length) { // trois épaisseurs et leur nombre
            const vals = [...new Set([max, Math.round(max / 2), Math.max(1, Math.round(max / 6))])].filter(v => v > 0);
            let x = 0, leg = '', y = Math.max(fs * .9, maxW / 2 + 1);
            vals.forEach(v => { const sw = Math.max(minW, maxW * v / max); leg += `<line x1="${r1(x + sw / 2)}" x2="${r1(x + fs * 3 + sw / 2)}" y1="${r1(y)}" y2="${r1(y)}" stroke="${base0}" stroke-opacity="${r2(opa)}" stroke-width="${r2(sw)}" stroke-linecap="round"/>` + T(x + fs * 3 + sw + 6, y, `${fmt(v)} ${unitFor(v, unit)}`, {size: fs * .85}); x += fs * 3 + sw + 6 + textW(`${fmt(v)} ${unitFor(v, unit)}`, fs * .85) + fs * 1.4; });
            svg += `<g transform="translate(${r1(Math.max(0, (W - x) / 2))} ${r1(h + fs * .6)})">${leg}</g>`; H += y * 2 + fs * .8;
        }
        if (F.unknown.length && o.showMissing !== false) { svg += T(0, H + fs * .7, `⚠ Lieux sans position : ${F.unknown.slice(0, 10).join(', ')}${F.unknown.length > 10 ? '…' : ''} — « Depuis l’app » → Lieux`, {size: fs * .78, fill: '#a5552a'}); H += fs * 1.5; }
        if (!F.flows.length) svg += T(w / 2, h / 2, 'Ajoute des flux : départ, arrivée, combien.', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        return {h: H, svg, geo: {uid, pr, w, h}};
    }

    /* ═════════ Réglages, exemples ═════════ */
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const mapOpts = () => [
        C('map', 'Carte', 'select', {choices: Object.entries(MAPS).map(([k, m]) => [k, m.label]), def: 'fr'}),
        ...Object.entries(MAPS).filter(([, m]) => m.levels.length > 1).map(([k, m]) => C('level', 'Niveau de détail', 'select', {choices: m.levels.map(([l, , n]) => [l, n]), when: s => mapOf(s.o || {}) === k})),
        ...Object.keys(MAPS).map(k => C('frame', 'Partie de la carte (cadrage)', 'select', {choices: [['', k === 'fr' ? 'France entière' : k === 'monde' ? 'Le monde entier' : `${MAPS[k].label} entière`], ...framesOf(k).map(([f, n]) => [f, n]), ['custom', '✋ Mon cadrage (souris ou cadre tracé)']], when: s => mapOf(s.o || {}) === k})),
        C('view', 'Mon cadrage : ouest, sud, est, nord (degrés)', 'text', {when: s => s.o?.frame === 'custom'}),
        C('proj', 'Projection', 'select', {choices: [['', 'Automatique'], ['equalearth', 'Equal Earth (monde, surfaces justes)'], ['robinson', 'Robinson (monde)'], ['laea', 'Lambert azimutale équivalente (Europe, pays)'], ['lambert', 'Lambert conique conforme'], ['mercator', 'Mercator']]}),
        C('insets', 'Outre-mer en encarts', 'check', {def: true, when: s => mapOf(s.o || {}) === 'fr' && !s.o?.frame}),
        C('context', 'Pays voisins en gris', 'check', {def: true, when: s => !!MAPS[mapOf(s.o || {})].ctx}),
        C('sea', 'Mer en couleur', 'check', {def: true}), C('seaColor', 'Couleur de la mer', 'color', {def: SEA, when: s => s.o?.sea !== false}),
        C('height', 'Hauteur du dessin (px, vide = selon la carte)', 'number', {min: 120, max: 3000})];
    const CHORO_OPTS = [...mapOpts(),
        C('colorMode', 'Couleurs', 'select', {choices: [['', 'Dégradé continu'], ['classes', 'Par classes (tranches)']]}),
        C('ramp', 'Gamme de couleurs', 'select', {choices: [['', 'Bleus'], ['verts', 'Verts'], ['oranges', 'Oranges'], ['rouges', 'Rouges'], ['violets', 'Violets'], ['jaunerouge', 'Du jaune au rouge'], ['bleurouge', 'Du bleu au rouge (écarts)'], ['sepia', 'Sépia (ancien)'], ['gris', 'Gris'], ['perso', 'Mes deux couleurs…']]}),
        C('lowColor', 'Couleur des petits chiffres', 'color', {def: '#eef4fb', when: s => s.o?.ramp === 'perso'}), C('highColor', 'Couleur des grands chiffres', 'color', {def: '#08306b', when: s => s.o?.ramp === 'perso'}),
        C('classes', 'Nombre de classes', 'range', {min: 2, max: 9, def: 5, when: s => s.o?.colorMode === 'classes'}),
        C('method', 'Découpage des classes', 'select', {choices: [['', 'Autant de zones dans chaque classe (quantiles)'], ['equal', 'Classes de même largeur'], ['manual', 'Mes seuils…']], when: s => s.o?.colorMode === 'classes'}),
        C('breaks', 'Mes seuils (ex. 5; 10; 50)', 'text', {when: s => s.o?.colorMode === 'classes' && s.o?.method === 'manual'}),
        C('logScale', 'Échelle logarithmique (très grands écarts)', 'check', {when: s => s.o?.colorMode !== 'classes'}),
        C('noData', 'Couleur des zones sans chiffre', 'color', {def: '#e4e4e7'}), C('borderColor', 'Couleur des limites', 'color', {def: '#ffffff'}), C('borderWidth', 'Épaisseur des limites', 'range', {min: .1, max: 4, step: .1, def: .8}),
        C('labels', 'Étiquettes', 'select', {choices: [['', 'Automatiques (là où il y a la place)'], ['name', 'Noms des zones'], ['value', 'Chiffres'], ['both', 'Noms et chiffres'], ['none', 'Aucune']]}),
        C('labelSize', 'Taille des étiquettes', 'range', {min: .5, max: 2.5, step: .1, def: 1}), C('unit', 'Unité (ex. : naissances, %)'),
        C('hoverAll', 'Bulle aussi sur les zones sans chiffre', 'check', {def: true}), C('showMissing', 'Signaler les lignes pas trouvées sur la carte', 'check', {def: true})];
    const FLOW_OPTS = [...mapOpts(), C('fit', 'Cadrer tout seul sur les lieux', 'check', {def: true, when: s => !s.o?.frame}),
        C('maxWidth', 'Épaisseur du plus gros flux', 'range', {min: 2, max: 50, def: 14}), C('minWidth', 'Épaisseur du plus petit flux', 'range', {min: .3, max: 10, step: .1, def: 1.2}),
        C('curve', 'Courbure des flèches (%)', 'range', {min: 0, max: 60, def: 25}), C('arrows', 'Pointes de flèche', 'check', {def: true}), C('opacity', 'Opacité des flèches (%)', 'range', {min: 10, max: 100, def: 75}),
        C('colorBy', 'Couleur des flèches', 'select', {choices: [['', 'Une seule couleur'], ['origin', 'Selon le lieu de départ'], ['dest', 'Selon le lieu d’arrivée']]}), C('flowColor', 'Couleur des flèches', 'color', {def: '#c0392b', when: s => !s.o?.colorBy}),
        C('dots', 'Ronds sur les lieux', 'check', {def: true}), C('dotSize', 'Taille des ronds', 'range', {min: 1, max: 30, def: 7}), C('dotColor', 'Couleur du tour des ronds', 'color', {def: '#1d1d1f'}),
        C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Tous (sans se chevaucher)'], ['big', 'Les 12 plus importants'], ['none', 'Aucun']]}), C('labelSize', 'Taille des noms', 'range', {min: .5, max: 2.5, step: .1, def: 1}),
        C('zoneColor', 'Couleur des terres', 'color', {def: LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('unit', 'Unité (ex. : personnes)'), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const CHORO_SAMPLE = () => ({o: {title: 'Où sont nés mes ancêtres', subtitle: 'naissances par département', map: 'fr', level: 'dep', unit: 'naissances', colorMode: 'classes', classes: 5, ramp: 'oranges', labels: ''},
        series: [{name: 'Naissances'}], rows: [['Ille-et-Vilaine', 42], ['Côtes-d’Armor', 25], ['Morbihan', 18], ['Loire-Atlantique', 15], ['Finistère', 12], ['Paris', 11], ['Mayenne', 9], ['Manche', 7], ['Maine-et-Loire', 6], ['Calvados', 3], ['Sarthe', 4], ['Gironde', 3], ['Rhône', 2], ['Bouches-du-Rhône', 2], ['Nord', 1], ['Guadeloupe', 1]].map(([label, s0]) => ({label, s0}))});
    const CITY = {Rennes: [48.1147, -1.6794], Paris: [48.8566, 2.3522], Nantes: [47.2184, -1.5536], 'Vitré': [48.1236, -1.2094], 'Saint-Brieuc': [48.5136, -2.7653], Brest: [48.3904, -4.4861], 'Le Havre': [49.4944, .1079], 'Fougères': [48.3525, -1.1986], Laval: [48.0707, -.7734], Lyon: [45.764, 4.8357]};
    const FLOW_SAMPLE = () => ({o: {title: 'Les migrations de la famille', subtitle: 'du lieu de naissance au lieu de décès', map: 'fr', level: 'dep', unit: 'personnes'},
        places: Object.fromEntries(Object.entries(CITY).map(([n, [lat, lon]]) => [fold(n), {lat, lon, n}])),
        rows: [['Vitré', 'Rennes', 15], ['Rennes', 'Paris', 12], ['Rennes', 'Nantes', 8], ['Saint-Brieuc', 'Rennes', 6], ['Fougères', 'Rennes', 5], ['Nantes', 'Paris', 5], ['Laval', 'Paris', 4], ['Brest', 'Le Havre', 3], ['Rennes', 'Lyon', 2]].map(([from, to, value]) => ({from, to, value}))});

    /* ═════════ Les chiffres pris dans l'app (api diagram_geo) ═════════ */
    const SRC_ZONES = [['births', 'Naissances (ou baptêmes)'], ['deaths', 'Décès (ou sépultures)'], ['marriages', 'Mariages'], ['all', 'Naissances, mariages et décès']];
    const SRC_FLOWS = [['birth_death', 'Lieu de naissance → lieu de décès'], ['birth_marriage', 'Lieu de naissance → lieu du mariage'], ['generation', 'D’une génération à l’autre (naissance du parent → de l’enfant)']];
    const geoMem = new Map();
    function fetchGeo(q) {
        const key = JSON.stringify(q), hit = geoMem.get(key);
        if (hit && Date.now() - hit.t < 60000) return hit.p;
        const p = A().api('diagram_geo', q).catch(e => { geoMem.delete(key); throw e; }); geoMem.set(key, {t: Date.now(), p}); if (geoMem.size > 20) geoMem.delete(geoMem.keys().next().value);
        return p;
    }
    function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
    const inZone = (z, x, y) => x >= z.bbox[0] && x <= z.bbox[2] && y >= z.bbox[1] && y <= z.bbox[3] && z.polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(hh => inRing(x, y, hh)));
    /** la zone d'un lieu de la base : par ses coordonnées, sinon par son département, sa région ou son pays */
    function zoneOfPlace(base, pl) {
        if (pl.lat !== null && pl.lon !== null && Number.isFinite(pl.lat) && Number.isFinite(pl.lon)) { const z = base.zones.find(zz => inZone(zz, pl.lon, pl.lat)); if (z) return z; }
        for (const k of [pl.code, pl.county, pl.state, pl.country]) { const z = k && matchZone(base, k); if (z) return z; }
        return null;
    }
    const zoneLabel = (base, z) => base.dupNames.has(fold(z.name)) ? `${z.name} (${z.id})` : z.name;
    async function fillZones(spec, q) {
        const o = spec.o || {}, view = viewOf(o), base = await load(baseIdOf(o, view)), r = await fetchGeo(q);
        const sums = new Map(); let lost = 0, lostN = 0; const lostNames = [];
        (r.places || []).slice(0, 6000).forEach(pl => { const n = Number(pl.n) || 0; if (!n) return; const z = zoneOfPlace(base, pl); if (!z) { lost++; lostN += n; if (lostNames.length < 8) lostNames.push(pl.name); return; } sums.set(z, (sums.get(z) || 0) + n); });
        spec.rows = [...sums].sort((a, b) => b[1] - a[1]).map(([z, n]) => ({label: zoneLabel(base, z), s0: n}));
        spec.series = [{...(spec.series?.[0] || {}), name: (SRC_ZONES.find(x => x[0] === q.what)?.[1] || 'Nombre').replace(/ \(.*\)$/, '')}];
        return {zones: sums.size, places: (r.places || []).length, lost, lostN, lostNames};
    }
    async function fillFlows(spec, q) {
        const r = await fetchGeo(q), byId = new Map((r.places || []).map(p => [p.id, p]));
        const names = new Map(); (r.places || []).forEach(p => { const f = fold(p.name); names.set(f, (names.get(f) || 0) + 1); });
        const label = p => names.get(fold(p.name)) > 1 && (p.county || p.state || p.code) ? `${p.name} (${p.county || p.state || p.code})` : p.name;
        const places = {}; let lost = 0;
        spec.rows = (r.pairs || []).slice(0, 500).map(([a, b, n]) => { const A0 = byId.get(a), B0 = byId.get(b); if (!A0 || !B0) return null; [A0, B0].forEach(p => { if (p.lat !== null && p.lon !== null) places[fold(label(p))] = {lat: p.lat, lon: p.lon, n: label(p)}; else lost++; }); return {from: label(A0), to: label(B0), value: n}; }).filter(Boolean);
        spec.places = {...(spec.places || {}), ...places};
        return {flows: spec.rows.length, lost};
    }
    /** chiffres « tenus à jour » : spec.live = {key: 'geo:<sorte>[:a][:de:à]', label} */
    const parseLive = key => { const m = String(key || '').match(/^geo:([a-z_]+):([01]):(-?\d*):(-?\d*)$/); if (!m || ![...SRC_ZONES, ...SRC_FLOWS].some(x => x[0] === m[1])) return null; const q = {what: m[1]}; if (m[2] === '1') q.ancestors = 1; if (m[3] !== '') q.from = Number(m[3]); if (m[4] !== '') q.to = Number(m[4]); return q; };
    const liveKey = q => `geo:${q.what}:${q.ancestors ? 1 : 0}:${q.from ?? ''}:${q.to ?? ''}`;

    /** avant le dessin : le fond (et le fond autour) chargés, les chiffres tenus à jour relus */
    async function resolve(spec) {
        const s = JSON.parse(JSON.stringify(spec || {})), o = s.o || {}, q = parseLive(s.live?.key);
        if (q) { try { if (s.kind === 'flowmap') await fillFlows(s, q); else await fillZones(s, q); } catch (_) {} }
        const view = viewOf(o), ids = [baseIdOf(o, view), ctxIdOf(o, baseIdOf(o, view), view)];
        if (s.kind === 'flowmap') ids.push('monde-110m', mapOf(o) === 'monde' || mapOf(o) === 'eu' ? 'monde-50m' : '');
        await Promise.all(ids.filter(Boolean).map(id => load(id).catch(() => {})));
        if (s.kind === 'flowmap') { // le cadrage automatique peut demander un autre fond (plus détaillé, ou le monde)
            const bases = ids.filter(Boolean).map(loaded).filter(Boolean), F = flowsOf(s, bases), v2 = (!o.frame && o.fit !== false && fitView(F.points, o)) || view;
            await Promise.all([baseIdOf(o, v2), ctxIdOf(o, baseIdOf(o, v2), v2)].filter(Boolean).map(id => load(id).catch(() => {})));
        }
        return s;
    }

    /* ═════════ Dans l'éditeur : le cadrage à la souris ═════════ */
    const geoReg = new Map(); // uid → {pr, w, h} (pour retrouver les degrés sous la souris)
    function remember(fn) { return (spec, W, fs) => { const out = fn(spec, W, fs); if (out.geo) { geoReg.set(out.geo.uid, out.geo); if (geoReg.size > 60) geoReg.delete(geoReg.keys().next().value); } return out; }; }
    function afterDraw(prev, api) {
        prev._dgmApi = api;
        let bar = prev.parentElement?.querySelector(':scope > .dgm-bar');
        if (!bar && prev.parentElement) {
            bar = document.createElement('div'); bar.className = 'dgm-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Cadrage de la carte');
            bar.innerHTML = `<span class="dgm-bar-t">🗺 Cadrage</span><button type="button" class="icon-button small" data-dgm="in" title="Zoomer" aria-label="Zoomer">＋</button><button type="button" class="icon-button small" data-dgm="out" title="Dézoomer" aria-label="Dézoomer">−</button><button type="button" class="button small secondary" data-dgm="box" aria-pressed="false" title="Tracer un cadre sur la carte (ou Maj + glisser)">▭ Tracer un cadre</button><button type="button" class="button small secondary" data-dgm="reset" title="Revenir au cadrage de départ">↺ Comme au départ</button><small class="muted dgm-bar-h">Molette : zoomer · glisser : déplacer · Maj + glisser : tracer un cadre</small>`;
            prev.before(bar);
            bar.addEventListener('click', e => { const b = e.target.closest('[data-dgm]'); if (!b) return; const a = prev._dgmApi; if (!a) return;
                if (b.dataset.dgm === 'reset') return a.set({frame: '', view: ''});
                if (b.dataset.dgm === 'box') { prev._dgmBox = !prev._dgmBox; b.setAttribute('aria-pressed', String(!!prev._dgmBox)); b.classList.toggle('is-active', !!prev._dgmBox); return; }
                const g = geoOf(prev); if (!g) return; zoomAt(prev, g, g.w / 2, g.h / 2, b.dataset.dgm === 'in' ? 1.6 : 1 / 1.6); });
            new MutationObserver(() => { bar.hidden = !prev.querySelector('[data-geo-map]'); }).observe(prev, {childList: true});
        }
        if (bar) bar.hidden = !prev.querySelector('[data-geo-map]');
        if (prev._dgmBound) return; prev._dgmBound = true;
        let drag = null, wheelT = 0, wheelK = 1, wheelAt = null;
        const pt = (g, e) => { const r = g.hit.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * g.w, (e.clientY - r.top) / r.height * g.h, r]; };
        prev.addEventListener('pointerdown', e => {
            const g = geoOf(prev); if (!g || e.button !== 0 || !e.target.closest?.('[data-geo-map]')) return;
            const [x, y] = pt(g, e); drag = {g, x, y, x0: e.clientX, y0: e.clientY, box: e.shiftKey || !!prev._dgmBox, moved: false};
            try { prev.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
        });
        prev.addEventListener('pointermove', e => {
            if (!drag) return; const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
            if (drag.box) { let r = prev.querySelector('.dgm-rubber'); if (!r) { r = document.createElement('div'); r.className = 'dgm-rubber'; prev.appendChild(r); } const pr0 = prev.getBoundingClientRect();
                Object.assign(r.style, {left: Math.min(e.clientX, drag.x0) - pr0.left + prev.scrollLeft + 'px', top: Math.min(e.clientY, drag.y0) - pr0.top + prev.scrollTop + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px'}); }
            else drag.g.el.style.transform = `translate(${dx}px, ${dy}px)`;
        });
        const end = e => {
            if (!drag) return; const d = drag; drag = null; prev.querySelector('.dgm-rubber')?.remove();
            if (!d.moved) { d.g.el.style.transform = ''; return; }
            const [x, y] = pt(d.g, e), api2 = prev._dgmApi; if (!api2) return;
            if (d.box) { const a = d.g.pr.inv(Math.min(x, d.x), Math.max(y, d.y)), b = d.g.pr.inv(Math.max(x, d.x), Math.min(y, d.y)); if (Math.abs(x - d.x) < 8 || Math.abs(y - d.y) < 8) return; setView(api2, [a[0], a[1], b[0], b[1]]);
                prev._dgmBox = false; prev.parentElement?.querySelector('[data-dgm="box"]')?.classList.remove('is-active'); return; }
            const v = d.g.pr.view, c0 = d.g.pr.inv(d.g.w / 2, d.g.h / 2), c1 = d.g.pr.inv(d.g.w / 2 - (x - d.x), d.g.h / 2 - (y - d.y));
            setView(api2, [v[0] + c1[0] - c0[0], v[1] + c1[1] - c0[1], v[2] + c1[0] - c0[0], v[3] + c1[1] - c0[1]]);
        };
        prev.addEventListener('pointerup', end); prev.addEventListener('pointercancel', () => { if (drag) drag.g.el.style.transform = ''; drag = null; prev.querySelector('.dgm-rubber')?.remove(); });
        prev.addEventListener('wheel', e => {
            const g = geoOf(prev); if (!g || !e.target.closest?.('[data-geo-map]')) return; e.preventDefault();
            const [x, y] = pt(g, e); wheelAt = wheelAt || [x, y, g]; wheelK *= e.deltaY < 0 ? 1.15 : 1 / 1.15; wheelK = clamp(wheelK, 1 / 12, 40);
            g.el.style.transformOrigin = `${wheelAt[0] / g.w * 100}% ${wheelAt[1] / g.h * 100}%`; g.el.style.transform = `scale(${wheelK})`;
            clearTimeout(wheelT); wheelT = setTimeout(() => { const [wx, wy, wg] = wheelAt, k = wheelK; wheelAt = null; wheelK = 1; zoomAt(prev, wg, wx, wy, k); }, 260);
        }, {passive: false});
    }
    function geoOf(prev) { const el = prev.querySelector('[data-geo-map]'); const g = el && geoReg.get(el.getAttribute('data-geo-map')); const hit = el?.querySelector('[data-geo-hit]'); return g && hit ? {...g, el, hit} : null; }
    function zoomAt(prev, g, x, y, k) {
        const api = prev._dgmApi; if (!api) return;
        const [lo, la] = g.pr.inv(x, y), v = g.pr.view;
        setView(api, [lo - (lo - v[0]) / k, la - (la - v[1]) / k, lo + (v[2] - lo) / k, la + (v[3] - la) / k]);
    }
    function setView(api, v) {
        let [w, s, e, n] = v; if (e - w < .05) { const c = (w + e) / 2; w = c - .025; e = c + .025; } if (n - s < .05) { const c = (s + n) / 2; s = c - .025; n = c + .025; }
        if (e - w > 360) { w = -180; e = 180; } if (w < -180) { e += -180 - w; w = -180; } if (e > 180) { w -= e - 180; e = 180; }
        s = clamp(s, -85, 85); n = clamp(n, -85, 85); if (n - s < .05) n = Math.min(85, s + .05);
        api.set({frame: 'custom', view: [w, s, e, n].map(x => Math.round(x * 1000) / 1000).join(', ')});
    }

    /* ═════════ L'onglet « Depuis l'app » ═════════ */
    function appPane(box, api) {
        const put = s => (api.set || api.apply)(s);
        const spec = api.spec(), flows = spec.kind === 'flowmap', srcs = flows ? SRC_FLOWS : SRC_ZONES, cur = parseLive(spec.live?.key) || {};
        const P = window.LCNDA_PICKER;
        box.innerHTML = `<h4>📍 ${flows ? 'Les migrations de ton arbre' : 'Les lieux de ton arbre'}</h4>
            <p class="muted">${flows ? 'Chaque personne relie deux lieux de ta base (ceux qui ont des coordonnées, ou une zone de la carte reconnue). Le tableau est remplacé.' : 'Chaque lieu de ta base est rattaché à sa zone (d’après ses coordonnées, sinon son département, sa région ou son pays), puis les zones sont comptées. Le tableau est remplacé.'}</p>
            <div class="dgm-form"><label>Quoi<select data-dgm-what>${srcs.map(([k, l]) => `<option value="${k}" ${cur.what === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="checkbox-line"><input type="checkbox" data-dgm-anc ${cur.ancestors ? 'checked' : ''}> Seulement mes ancêtres (lignée Sosa)</label>
            <span class="dgm-period"><label>De l’année<input type="number" inputmode="numeric" data-dgm-from value="${esc(cur.from ?? '')}" placeholder="ex. 1700" min="-3000" max="3000"></label><label>à l’année<input type="number" inputmode="numeric" data-dgm-to value="${esc(cur.to ?? '')}" placeholder="ex. 1900" min="-3000" max="3000"></label></span>
            <label class="checkbox-line"><input type="checkbox" data-dgm-live ${spec.live?.key && cur.what ? 'checked' : ''}> 🔄 Tenir à jour (relire l’arbre à chaque affichage)</label>
            <button type="button" class="button small" data-dgm-go>Prendre ces chiffres</button><p class="dgm-msg" data-dgm-msg role="status"></p></div>
            ${flows ? `<h4>🧭 Ajouter un flux</h4><div class="dgm-form dgm-addflow"><span class="pk-lab">Départ</span><div data-dgm-pa>${P.pickerField({name: '', hiddenName: false, kind: 'place', inline: true})}</div><span class="pk-lab">Arrivée</span><div data-dgm-pb>${P.pickerField({name: '', hiddenName: false, kind: 'place', inline: true})}</div><label>Combien<input type="number" inputmode="decimal" min="0" value="1" data-dgm-n></label><button type="button" class="button small" data-dgm-addflow>＋ Ajouter ce flux</button></div>
            <h4>📍 Les lieux du tableau</h4><p class="muted">Un lieu sans position (⚠) : choisis-le dans ta base ou dans les communes et villes du monde, ou tape ses coordonnées dans le tableau (« Rennes 48.11, -1.68 »).</p><div data-dgm-places></div><button type="button" class="button small secondary" data-dgm-find>🔎 Retrouver les lieux sans position</button>` : ''}`;
        const msg = t => { box.querySelector('[data-dgm-msg]').textContent = t; };
        const query = () => { const q = {what: box.querySelector('[data-dgm-what]').value}; if (box.querySelector('[data-dgm-anc]').checked) q.ancestors = 1; const f = box.querySelector('[data-dgm-from]').value.trim(), t = box.querySelector('[data-dgm-to]').value.trim(); if (/^-?\d{1,4}$/.test(f)) q.from = Number(f); if (/^-?\d{1,4}$/.test(t)) q.to = Number(t); return q; };
        box.querySelector('[data-dgm-go]').addEventListener('click', async e => {
            const b = e.currentTarget, q = query(); b.disabled = true; msg('⏳ Lecture de l’arbre…');
            try {
                const s = api.spec(), label = (srcs.find(x => x[0] === q.what)?.[1] || '') + (q.ancestors ? ' (mes ancêtres)' : '') + (q.from || q.to ? ` ${q.from ?? '…'}–${q.to ?? '…'}` : '');
                const rep = flows ? await fillFlows(s, q) : await fillZones(s, q);
                if (box.querySelector('[data-dgm-live]').checked) s.live = {key: liveKey(q), label}; else delete s.live;
                const smp = (flows ? FLOW_SAMPLE() : CHORO_SAMPLE()).o; if (!s.o.title || s.o.title === smp.title) s.o.title = label; if (s.o.subtitle === smp.subtitle) s.o.subtitle = ''; if (s.o.unit === smp.unit && !flows) s.o.unit = '';
                if (flows) { if (!rep.flows) { msg('Aucun déplacement trouvé (il faut deux lieux différents pour une même personne).'); } else msg(`✓ ${pl(rep.flows, 'flux')} pris dans l’arbre.${rep.lost ? ` ${pl(rep.lost, 'lieu sans coordonnées', 'lieux sans coordonnées')} : voir « Les lieux du tableau ».` : ''}`); }
                else msg(rep.zones ? `✓ ${pl(rep.places - rep.lost, 'lieu rattaché', 'lieux rattachés')} à ${pl(rep.zones, 'zone')}.${rep.lost ? ` ${pl(rep.lost, 'lieu', 'lieux')} hors de cette carte ou sans position (${rep.lostNames.join(', ')}${rep.lost > rep.lostNames.length ? '…' : ''}).` : ''}` : 'Aucun lieu de ton arbre ne tombe sur cette carte : change de carte ou de niveau dans Réglages.');
                put(s);
            } catch (err) { msg('⛔ ' + (err.message || 'Lecture impossible.')); } finally { b.disabled = false; }
        });
        if (!flows) return;
        const paintPlaces = async () => {
            const s = api.spec(), o = s.o || {}, list = box.querySelector('[data-dgm-places]');
            const ids = [baseIdOf(o, viewOf(o)), 'monde-110m']; await Promise.all(ids.map(id => load(id).catch(() => {}))); const bases = ids.map(loaded).filter(Boolean);
            const names = [...new Set(rowsOf(s).flatMap(r => [r.from, r.to]).map(x => String(x ?? '').trim()).filter(Boolean))].slice(0, 200);
            list.innerHTML = names.length ? `<ul class="dgm-places">${names.map((n, i) => { const p = placeOf(s, n, bases); return `<li data-i="${i}"><span class="dgm-pl-n">${p ? '📍' : '⚠️'} ${esc(n)}</span>${p ? `<small class="muted">${r2(p[1])}, ${r2(p[0])}</small>` : `<span class="dgm-pl-pk" data-dgm-pk="${esc(n)}">${window.LCNDA_PICKER.pickerField({name: '', hiddenName: false, kind: 'place', inline: true, placeholder: `Où est « ${n.slice(0, 30)} » ?`})}</span>`}</li>`; }).join('')}</ul>` : '<p class="muted">Le tableau n’a pas encore de lieux.</p>';
        };
        const setPlace = (s, name, it) => { const lat = Number(it?.lat), lon = Number(it?.lon); if (it?.lat === null || it?.lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) { A().toast('Ce lieu n’a pas de coordonnées : choisis-en un autre, ou tape ses coordonnées dans le tableau.', 'error'); return false; } s.places = {...(s.places || {}), [fold(name)]: {lat, lon, n: String(it.title || name).slice(0, 80)}}; return true; };
        box.querySelector('[data-dgm-places]').addEventListener('picker-change', e => { const host = e.target.closest('[data-dgm-pk]'); const it = e.detail?.item; if (!host || !it) return; const s = api.spec(); if (setPlace(s, host.dataset.dgmPk, it)) { put(s); paintPlaces(); } });
        box.querySelector('[data-dgm-find]').addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true; let found = 0;
            try { const s = api.spec(), o = s.o || {}, bases = [baseIdOf(o, viewOf(o)), 'monde-110m'].map(loaded).filter(Boolean);
                const miss = [...new Set(rowsOf(s).flatMap(r => [r.from, r.to]).map(x => String(x ?? '').trim()).filter(n => n && !placeOf(s, n, bases)))].slice(0, 40);
                for (const n of miss) { try { const r = await A().api('picker_search', {kind: 'place', q: n.replace(/\(.*\)$/, '').trim(), limit: 5}); const it = (r.groups || []).flatMap(g => g.items || []).find(x => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon)) && x.lat !== null); if (it) { s.places = {...(s.places || {}), [fold(n)]: {lat: Number(it.lat), lon: Number(it.lon), n: String(it.title || n).slice(0, 80)}}; found++; } } catch (_) {} }
                A().toast(found ? `${pl(found, 'lieu retrouvé', 'lieux retrouvés')} : vérifie-les sur la carte.` : 'Aucun lieu retrouvé : choisis-les un par un.'); if (found) put(s); paintPlaces();
            } finally { b.disabled = false; }
        });
        box.querySelector('[data-dgm-addflow]').addEventListener('click', () => {
            const a = box._pa, b = box._pb;
            if (!a || !b) return A().toast('Choisis le lieu de départ et le lieu d’arrivée.', 'error');
            const n = Math.max(0, num(box.querySelector('[data-dgm-n]').value)) || 1, s = api.spec();
            if (!setPlace(s, a.title, a) || !setPlace(s, b.title, b)) return;
            s.rows = [...rowsOf(s), {from: String(a.title).slice(0, 80), to: String(b.title).slice(0, 80), value: n}]; delete s.live;
            [box.querySelector('[data-dgm-pa] .pk'), box.querySelector('[data-dgm-pb] .pk')].forEach(f => { try { window.LCNDA_PICKER.pickerSet(f, null); } catch (_) {} }); box._pa = box._pb = null;
            put(s); paintPlaces(); A().toast('Flux ajouté.');
        });
        box.querySelector('[data-dgm-pa]').addEventListener('picker-change', e => { box._pa = e.detail?.item || null; });
        box.querySelector('[data-dgm-pb]').addEventListener('picker-change', e => { box._pb = e.detail?.item || null; });
        paintPlaces();
    }

    // l'onglet « Depuis l'app » de l'éditeur (kind.fromApp : html, puis bind avec {spec, apply, set})
    const FROM_APP = {html: () => '<div class="h-dg-app dgm-app" data-dgm-app></div>', bind: (pane, api) => { const box = pane.querySelector('[data-dgm-app]'); if (box) appPane(box, api); }};

    /* ═════════ L'enregistrement des deux sortes ═════════ */
    const KINDS = {
        choropleth: {icon: '🗺️', label: 'Carte colorée par zones (départements, régions, pays…)', group: 'Cartes', render: remember(choropleth), noLegend: true,
            grids: [{key: 'rows', label: 'Les zones et leurs chiffres', series: 1, cols: [C('label', 'Zone (nom ou code : 35, FRH03, BE, Vaud…)'), C('note', 'Note (dans la bulle)')]}],
            options: CHORO_OPTS, sample: CHORO_SAMPLE, resolve, afterDraw, fromApp: FROM_APP,
            describe: spec => `Carte colorée : ${rowsOf(spec).length} zones (${MAPS[mapOf(spec.o || {})].label}, ${levelOf(spec.o || {})[2].toLowerCase()}).`},
        flowmap: {icon: '🧭', label: 'Carte des migrations (flèches d’un lieu à un autre)', group: 'Cartes', render: remember(flowmap), noLegend: true,
            grids: [{key: 'rows', label: 'Les flux (départ → arrivée)', cols: [C('from', 'Départ (lieu)'), C('to', 'Arrivée (lieu)'), C('value', 'Combien', 'number'), C('color', 'Couleur', 'color')]}],
            options: FLOW_OPTS, sample: FLOW_SAMPLE, resolve, afterDraw, fromApp: FROM_APP,
            describe: spec => `Carte des migrations : ${rowsOf(spec).length} flux.`},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (!DR.KINDS[k]) DR.KINDS[k] = kind; }
    ext.diagramCartes = {MAPS, FRAMES_WORLD, FRAMES_FR, load, loaded, decode, makeProj, fitProj, matchZone, joinRows, zoneOfPlace, placeOf, flowsOf, breaksOf, scaleOf, resolve, parseLive, liveKey, inZone};
})();
