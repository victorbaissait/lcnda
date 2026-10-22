/* LCNDA — 🗺️ Diagrammes « Cartes » (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  - choropleth : carte colorée par zones (départements, régions, provinces, cantons, régions NUTS, pays, continents),
 *    dégradé ou classes, légende, étiquettes, valeur au survol ;
 *  - flowmap : carte des migrations, flèches courbes d'un lieu à un autre, plus épaisses quand il y a plus de personnes ;
 *  - bubblemap : carte à symboles proportionnels, un rond par lieu (ou par zone) dont la surface suit le chiffre,
 *    légende en ronds emboîtés.
 * Fonds de carte : assets/data/geo/<fond>.json (TopoJSON simplifié, licences dans assets/data/geo/LICENCES.txt), chargés
 * seulement quand une carte est dessinée ; niveau « Communes (villes) » (France, Belgique, Suisse, Luxembourg) :
 * <pays>-communes.json.gz (scripts/build-geo-communes.js), décompressé ici, communes retrouvées par code puis par
 * nom + département (homonymes refusés), limites des départements tirées des communes. Encart zoomé sur
 * l'Île-de-France (spec.o.idf) dans un coin libre, ou sous la carte quand il n'y en a pas. Projections : Equal Earth, Robinson (monde), Lambert azimutale équivalente,
 * Lambert conique conforme (Europe, pays), Mercator. Cadrage libre (molette, glisser, cadre tracé) enregistré dans
 * spec.o.view, ou cadrages tout faits (spec.o.frame).
 * Branchements (heritage-diagrams.js) : kind.resolve(spec) → Promise<spec> (fond chargé, chiffres de l'app relus),
 * kind.afterDraw(aperçu, api) (cadrage à la souris dans l'éditeur), kind.appPane(boîte, api) (onglet « Depuis l'app »).
 * Données de l'app : api.php?action=diagram_geo (lib/diagram_cartes.php).
 * Onglet Données (kind.dataPane) : la case « Zone » propose, au fil de la frappe, les zones de chaque niveau de la carte et
 * les communes ; une ville choisie est retenue avec sa position (spec.places) et compte dans son département, sa région…
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const DR = ext.diagramRender; if (!DR?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = DR.num, color = DR.color;
    // fonctions mathématiques gardées sous la main : les tracés des communes en appellent des millions de fois
    const msin = Math.sin, mcos = Math.cos, msqrt = Math.sqrt, mround = Math.round, mabs = Math.abs, isF = Number.isFinite, MPI = Math.PI;
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
    const GEO_DIR = 'assets/data/geo/', GEO_V = 2;
    const ATTR = {ne: 'Fond : Natural Earth', ign: 'Fond : IGN Admin Express (Licence Ouverte)', nuts: 'Fond : © EuroGeographics (Eurostat GISCO)', osm: 'Fond : © contributeurs OpenStreetMap (ODbL)',
        frc: 'Fond : IGN Admin Express, INSEE COG 2025 (Licence Ouverte)', bec: 'Fond : IGN-NGI, Statbel (CC BY 4.0)', chc: 'Fond : © swisstopo (Opendata BY)', luc: 'Fond : ACT Luxembourg (CC0)'};
    const FILES = {'monde-110m': 'ne', 'monde-50m': 'ne', continents: 'ne', 'fr-departements': 'ign', 'fr-regions': 'ign', 'be-provinces': 'nuts', 'be-regions': 'nuts', 'ch-cantons': 'nuts', 'ch-regions': 'nuts', 'lu-cantons': 'osm', 'eu-nuts1': 'nuts', 'eu-nuts2': 'nuts',
        'fr-communes': 'frc', 'be-communes': 'bec', 'ch-communes': 'chc', 'lu-communes': 'luc'};
    // les communes : gros fichiers livrés compressés (gzip), chargés seulement quand on choisit ce niveau
    const GZ = new Set(['fr-communes', 'be-communes', 'ch-communes', 'lu-communes']);
    // pays de chaque fond des communes (un lieu d'un autre pays n'y est pas cherché par son nom)
    const COUNTRY = {'fr-communes': ['france', 'fr', 'fra', 'guadeloupe', 'martinique', 'guyane', 'guyane francaise', 'la reunion', 'reunion', 'mayotte'], 'be-communes': ['belgique', 'belgium', 'belgie', 'belgien', 'be', 'bel'],
        'ch-communes': ['suisse', 'switzerland', 'schweiz', 'svizzera', 'ch', 'che'], 'lu-communes': ['luxembourg', 'luxemburg', 'letzebuerg', 'lu', 'lux']};
    const PARENT_WORD = {'fr-communes': 'le département', 'be-communes': 'la province', 'ch-communes': 'le canton', 'lu-communes': 'le canton'};
    const DOM = {971: 'Guadeloupe', 972: 'Martinique', 973: 'Guyane', 974: 'La Réunion', 976: 'Mayotte'};
    // les cartes, leurs niveaux de détail [niveau, fond, nom] et leur cadrage de départ [ouest, sud, est, nord]
    const MAPS = {
        fr: {label: 'France', levels: [['dep', 'fr-departements', 'Départements'], ['reg', 'fr-regions', 'Régions'], ['com', 'fr-communes', 'Communes (villes)']], view: [-5.2, 41.3, 9.6, 51.15], ctx: true, insets: true, zoneBase: 'fr-departements', zoneWord: ['un département', 'Département', 'des départements', '35, Gers, Côtes-d’Armor…']},
        be: {label: 'Belgique', levels: [['prov', 'be-provinces', 'Provinces'], ['reg', 'be-regions', 'Régions'], ['com', 'be-communes', 'Communes (villes)']], view: [2.5, 49.47, 6.43, 51.53], ctx: true, zoneBase: 'be-provinces', zoneWord: ['une province', 'Province', 'des provinces', 'Liège, Anvers, Hainaut…']},
        ch: {label: 'Suisse', levels: [['cant', 'ch-cantons', 'Cantons'], ['reg', 'ch-regions', 'Grandes régions'], ['com', 'ch-communes', 'Communes (villes)']], view: [5.92, 45.8, 10.52, 47.84], ctx: true, zoneBase: 'ch-cantons', zoneWord: ['un canton', 'Canton', 'des cantons', 'Vaud, VD, Berne…']},
        lu: {label: 'Luxembourg', levels: [['cant', 'lu-cantons', 'Cantons'], ['com', 'lu-communes', 'Communes (villes)']], view: [5.72, 49.43, 6.55, 50.19], ctx: true, zoneBase: 'lu-cantons', zoneWord: ['un canton', 'Canton', 'des cantons', 'Clervaux, Esch-sur-Alzette…']},
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
    /** clé d'un nom de commune : sans accents ni tirets, « St » = « Saint » */
    const nameKey = s => fold(s).replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint');
    const ARTICLE = /^(le|la|les|l|de|het|den|d) /;
    function decode(raw, id) {
        const t0 = raw?.topo; if (!t0 || !Array.isArray(t0.arcs) || !t0.objects?.z || !Array.isArray(t0.objects.z.geometries)) throw new Error('Fond de carte illisible.');
        const communes = /-communes$/.test(id), zones = [], lines = [];
        // une topologie (plus, pour les communes, une par département d'outre-mer : « more »)
        [t0, ...(Array.isArray(raw.more) ? raw.more : [])].forEach(t => {
            if (!Array.isArray(t?.arcs) || !Array.isArray(t.objects?.z?.geometries)) return;
            const [sx, sy] = t.transform?.scale || [1, 1], [tx, ty] = t.transform?.translate || [0, 0];
            const arcs = t.arcs.map(a => { let x = 0, y = 0; const out = new Float64Array(a.length * 2); for (let i = 0; i < a.length; i++) { x += a[i][0]; y += a[i][1]; out[i * 2] = x * sx + tx; out[i * 2 + 1] = y * sy + ty; } return out; });
            const ring = idx => { let n = 0; for (const i of idx) { const a = arcs[i < 0 ? ~i : i]; if (a) n += a.length / 2; } const pts = new Float64Array(n * 2); let m = 0;
                for (const i of idx) { const a = arcs[i < 0 ? ~i : i]; if (!a) continue; const k = a.length / 2; for (let j = 0; j < k; j++) { if (j === 0 && m) continue; const q = i < 0 ? k - 1 - j : j; pts[m++] = a[q * 2]; pts[m++] = a[q * 2 + 1]; } } return pts.subarray(0, m); };
            const arcOwner = communes ? new Map() : null; // arc → parent de la 1re commune qui l'emprunte (limites des départements, plus bas)
            t.objects.z.geometries.forEach(g => {
                const p = g.properties || {}, refs = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [], polys = refs.map(pp => pp.map(ring));
                let b = [Infinity, Infinity, -Infinity, -Infinity]; polys.forEach(pp => { const r = pp[0]; if (!r) return; for (let i = 0; i < r.length; i += 2) { if (r[i] < b[0]) b[0] = r[i]; if (r[i] > b[2]) b[2] = r[i]; if (r[i + 1] < b[1]) b[1] = r[i + 1]; if (r[i + 1] > b[3]) b[3] = r[i + 1]; } });
                const code = String(p.i ?? ''), parent = String(p.p ?? (raw.parentFromCode && code ? (/^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2)) : ''));
                if (!polys.length || !polys[0][0]?.length) return;
                zones.push({i: zones.length, id: code, name: String(p.n ?? p.i ?? ''), alt: Array.isArray(p.a) ? p.a.map(String) : [], parent, label: Array.isArray(p.l) ? p.l.map(Number) : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], outre: !!p.o, old: !!p.x, polys, bbox: b});
                if (arcOwner) refs.flat(2).forEach(i => { const k = i < 0 ? ~i : i, o = arcOwner.get(k); if (o === undefined) arcOwner.set(k, {p: parent, n: 1, outre: !!p.o}); else { o.n++; if (o.p !== parent) o.diff = true; } });
            });
            // les limites des départements (ou provinces, cantons), tirées des communes elles-mêmes : exactement sur leurs limites
            if (arcOwner) arcOwner.forEach((o, k) => { if (o.diff) { const a = arcs[k]; let b0 = Infinity, b1 = Infinity, b2 = -Infinity, b3 = -Infinity; for (let i = 0; i < a.length; i += 2) { if (a[i] < b0) b0 = a[i]; if (a[i] > b2) b2 = a[i]; if (a[i + 1] < b1) b1 = a[i + 1]; if (a[i + 1] > b3) b3 = a[i + 1]; } lines.push({a, outre: o.outre, bbox: [b0, b1, b2, b3]}); } });
        });
        const index = new Map(), add = (k, z) => { const f = fold(k); if (f && !index.has(f)) index.set(f, z); };
        const pfx = String(raw.pfx || '');
        if (!communes) { zones.forEach(z => { add(z.id, z); if (/^0\d$/.test(z.id)) add(z.id.slice(1), z); }); zones.forEach(z => z.alt.forEach(a => add(a, z))); zones.forEach(z => add(z.name, z)); }
        // communes : les codes (et anciens codes) d'un côté, les noms (souvent les mêmes pour des centaines de communes) de l'autre
        const byName = new Map(), byAlt = new Map(), push = (m, k, z) => { if (!k) return; const l = m.get(k); if (!l) m.set(k, [z]); else if (!l.includes(z)) l.push(z); };
        if (communes) zones.forEach(z => {
            add(z.id, z); if (pfx) add(pfx + z.id, z); if (/^\d+$/.test(z.id) && pfx) add(pfx + String(Number(z.id)), z);
            const k = nameKey(z.name); push(byName, k, z); if (ARTICLE.test(k)) push(byName, k.replace(ARTICLE, ''), z);
            z.alt.forEach(a => { if (/^\d[\dAB]\d{2,6}$/i.test(a)) add(a, z); else { const ka = nameKey(a); push(byAlt, ka, z); if (ARTICLE.test(ka)) push(byAlt, ka.replace(ARTICLE, ''), z);
                const arr = ka.match(/^(.+ \d+)(e|er) arrondissement$/); if (arr) { push(byAlt, arr[1] + arr[2], z); push(byAlt, arr[1], z); } } }); // « Paris 12e », « Lyon 3 »
        });
        const dupNames = new Set(); const seen = new Set(); zones.forEach(z => { const f = fold(z.name); if (seen.has(f)) dupNames.add(f); seen.add(f); });
        return {id, name: String(raw.name || id), attr: ATTR[FILES[id]] || '', zones, index, dupNames, bbox: raw.bbox, communes, byName, byAlt, lines, pfx, parentBase: String(raw.parentBase || ''), country: COUNTRY[id] || []};
    }
    /** un fichier compressé (gzip) : décompressé ici, sans dépendre du serveur */
    async function readGeo(r, gz) {
        if (!gz) return r.json();
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf)); // déjà décompressé en route
        if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas ouvrir ce fond de carte.');
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(id) {
        if (!FILES[id]) return Promise.reject(new Error('Fond de carte inconnu.'));
        const hit = store.get(id); if (hit?.data) return Promise.resolve(hit.data); if (hit?.promise) return hit.promise;
        const promise = fetch(`${GEO_DIR}${id}.json${GZ.has(id) ? '.gz' : ''}?v=${GEO_V}`, {credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error('Fond de carte introuvable.'); return readGeo(r, GZ.has(id)); })
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
            // la même, sans créer de tableau (des centaines de milliers de points pour les communes)
            fq: (l, p, o) => { let dl = l - lam0; if (dl > MPI || dl < -MPI) dl = wrap(dl); const cp = mcos(p), sp = msin(p), cl = mcos(dl), d = 1 + sp0 * sp + cp0 * cp * cl, k = msqrt(2 / (d > 1e-9 ? d : 1e-9)); o[0] = k * cp * msin(dl); o[1] = k * (cp0 * sp - sp0 * cp * cl); },
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
        const fq = P.fq || ((l, p, o) => { const r = P.f(l, p); o[0] = r[0]; o[1] = r[1]; });
        return {h, k, kind, view,
            p: (lo, la) => { const [x, y] = P.f(lo * RAD, la * RAD); return [ox + (x - x0) * k, oy + (y1 - y) * k]; },
            q: (lo, la) => { fq(lo * RAD, la * RAD, PQ); PQ[0] = ox + (PQ[0] - x0) * k; PQ[1] = oy + (y1 - PQ[1]) * k; }, // résultat dans PQ
            inv: (px, py) => { const [l, p] = P.inv((px - ox) / k + x0, y1 - (py - oy) / k); return [clamp(l / RAD, -540, 540), clamp(p / RAD, -90, 90)]; }};
    }

    /* ── les tracés en SVG (mémoire des derniers dessins : les mêmes zones ne sont pas recalculées) ── */
    const pathMem = new Map(), PQ = new Float64Array(2);
    function zonePath(z, pr, w, h, cull = true) {
        let d = ''; const jump = Math.max(w, h) * .55;
        for (const poly of z.polys) for (const r of poly) {
            let s = '', n = 0, lx = NaN, ly = NaN, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, off = 0, plo = NaN;
            for (let i = 0; i < r.length; i += 2) {
                // un contour qui passe la ligne des 180° (Russie, Fidji…) : longitudes suivies d'un seul tenant (190° au lieu de -170°)
                if (r[i] - plo > 180) off -= 360; else if (r[i] - plo < -180) off += 360; plo = r[i];
                pr.q(r[i] + off, r[i + 1]); const x = PQ[0], y = PQ[1]; if (!isF(x) || !isF(y)) continue;
                if (n && mabs(x - lx) > jump) { n = -1; break; } // un anneau qui saute d'un bord à l'autre (180°) : pas dessiné
                if (n && mabs(x - lx) < .5 && mabs(y - ly) < .5 && i < r.length - 2) continue;
                s += (n ? 'L' : 'M') + mround(x * 10) / 10 + ' ' + mround(y * 10) / 10; n++; lx = x; ly = y;
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
        if (o.frame === 'zone' && M.zoneBase) { // un département, une province, un canton : sa boîte, avec une marge
            const zb = loaded(M.zoneBase), z = zb && String(o.frameZone ?? '').trim() ? matchZone(zb, o.frameZone) : null;
            if (z) { const b = z.bbox, mx = Math.max(.04, (b[2] - b[0]) * .06), my = Math.max(.03, (b[3] - b[1]) * .06); return [b[0] - mx, b[1] - my, b[2] + mx, b[3] + my]; }
        }
        const f = framesOf(mapOf(o)).find(x => x[0] === o.frame); if (f) return f[2];
        return auto || M.view;
    }
    const baseIdOf = (o, view) => { const id = levelOf(o)[1]; return id === 'monde' ? (view[2] - view[0] > 70 ? 'monde-110m' : 'monde-50m') : id; };
    /** le fond des départements (provinces, cantons) : pour cadrer sur l'un d'eux, et lire « Saint-Martin (Gers) » */
    const zoneBaseOf = o => { const M = MAPS[mapOf(o)]; return M.zoneBase && (o.frame === 'zone' || levelOf(o)[0] === 'com') ? M.zoneBase : ''; };
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
    const PARENT_LINE = '#4a4f57'; // limites des départements par-dessus les communes
    const SEA = '#e3edf6', LAND = '#f1f0ec', LAND_LINE = '#c9c6bd';
    /** le dessin du fond : mer, pays autour, zones (remplies par fillOf), encarts d'outre-mer */
    function drawBase(spec, base, ctx, pr, w, h, fillOf, uid) {
        const o = spec.o || {}, key = `${pr.kind}|${pr.view.join(',')}|${Math.round(w)}x${Math.round(h)}`;
        const line = color(o.borderColor, '#ffffff'), lw = clamp(num(o.borderWidth) || (base.communes ? .2 : .8), .1, 6); // communes : traits fins
        let svg = `<defs><clipPath id="${uid}c"><rect width="${r1(w)}" height="${r1(h)}"/></clipPath></defs><g clip-path="url(#${uid}c)">`;
        if (o.sea !== false) svg += `<rect width="${r1(w)}" height="${r1(h)}" fill="${color(o.seaColor, SEA)}"/>`;
        if (ctx) { const cp = pathsOf(ctx, pr, w, h, key); svg += `<path d="${cp.join('')}" fill="${color(o.landColor, LAND)}" stroke="${LAND_LINE}" stroke-width=".6" stroke-linejoin="round"/>`; }
        const paths = pathsOf(base, pr, w, h, key), zones = [];
        base.zones.forEach((z, i) => { if (!paths[i] || (z.outre && !pr.allOutre)) return; const f = fillOf(z); zones.push({z, d: paths[i], f}); });
        // les zones sans chiffre d'abord, en un seul tracé ; puis chaque zone avec sa couleur et sa bulle
        const plain = zones.filter(x => !x.f.title).map(x => x.d).join('');
        if (plain) svg += `<path d="${plain}" fill="${zones.find(x => !x.f.title)?.f.fill || '#e8e8e8'}" stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"/>`;
        // le trait est porté par le groupe (35 000 communes : des mégaoctets de moins à lire pour le navigateur)
        const titled = zones.filter(x => x.f.title);
        if (titled.length) svg += `<g stroke="${line}" stroke-width="${lw}" stroke-linejoin="round">${titled.map(x => `<path class="dgm-z" d="${x.d}" fill="${x.f.fill}"><title>${esc(x.f.title)}</title></path>`).join('')}</g>`;
        if (base.communes && o.parentLines !== false) { const d = linesPath(base, pr, w, h, key, !!pr.allOutre); if (d) svg += `<path d="${d}" fill="none" stroke="${PARENT_LINE}" stroke-opacity=".7" stroke-width="${r2(clamp(lw * 4 * Math.sqrt(Math.min(1, w / 900)), .4, 3))}" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`; }
        svg += '</g>';
        return {svg, zones};
    }
    /** les limites des départements (provinces, cantons), par-dessus les communes */
    function linesPath(base, pr, w, h, key, outre, filter = null) {
        const k = `${base.id}|L|${key}|${outre ? 1 : 0}`; let d = filter ? null : pathMem.get(k); if (d !== undefined && d !== null) return d;
        const v = pr.view, mx = (v[2] - v[0]) * .05, my = (v[3] - v[1]) * .05; d = '';
        for (const ln of base.lines) {
            if ((ln.outre && !outre) || ln.bbox[2] < v[0] - mx || ln.bbox[0] > v[2] + mx || ln.bbox[3] < v[1] - my || ln.bbox[1] > v[3] + my || (filter && !filter(ln))) continue;
            const a = ln.a; let s = '', n = 0, lx = NaN, ly = NaN;
            for (let i = 0; i < a.length; i += 2) { pr.q(a[i], a[i + 1]); const x = PQ[0], y = PQ[1]; if (!isF(x) || !isF(y)) continue; if (n && mabs(x - lx) < .5 && mabs(y - ly) < .5 && i < a.length - 2) continue; s += (n ? 'L' : 'M') + mround(x * 10) / 10 + ' ' + mround(y * 10) / 10; n++; lx = x; ly = y; }
            if (n > 1) d += s;
        }
        if (!filter) { pathMem.set(k, d); if (pathMem.size > 16) pathMem.delete(pathMem.keys().next().value); }
        return d;
    }
    /** les encarts d'outre-mer (France) : 2 colonnes en bas à gauche */
    function insetsOf(spec, base, w, h, fillOf) {
        const out = base.zones.filter(z => z.outre); if (!out.length) return {svg: '', zones: []};
        // un encart par département d'outre-mer (au niveau des communes, toutes ses communes dedans)
        const groups = new Map(); out.forEach(z => { const k = base.communes ? z.parent : z.id; const g = groups.get(k); if (g) g.push(z); else groups.set(k, [z]); });
        const list = [...groups].map(([k, zs]) => ({k, name: base.communes ? DOM[k] || k : zs[0].name, zs, bbox: zs.reduce((b, z) => [Math.min(b[0], z.bbox[0]), Math.min(b[1], z.bbox[1]), Math.max(b[2], z.bbox[2]), Math.max(b[3], z.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity])}));
        const s = Math.min(w * .1, h * .12, 120), gap = Math.max(3, s * .08), cols = 2, rowsN = Math.ceil(list.length / cols), fsz = clamp(s / 8, 7, 12);
        const line = color(spec.o?.borderColor, '#ffffff'), lw = base.communes ? .25 : .7;
        let svg = ''; const placed = [];
        list.forEach((G, i) => {
            const cx = (i % cols) * (s + gap), cy = h - (rowsN - Math.floor(i / cols)) * (s + gap + fsz) + gap, b = G.bbox;
            const pad = 4, pr = fitProj('laea', [b[0] - .05, b[1] - .05, b[2] + .05, b[3] + .05], s - pad * 2, s - pad * 2 - fsz, false);
            let plain = '', plainFill = '', inner = '';
            G.zs.forEach(z => { const f = fillOf(z), d = zonePath(z, pr, s, s, false); if (!d) return; if (f.title) inner += `<path class="dgm-z" d="${d}" fill="${f.fill}" stroke="${line}" stroke-width="${lw}"><title>${esc(f.title)}</title></path>`; else { plain += d; plainFill = f.fill; } });
            if (plain) inner = `<path d="${plain}" fill="${plainFill}" stroke="${line}" stroke-width="${lw}"/>` + inner;
            if (base.communes && spec.o?.parentLines !== false) { const d = linesPath(base, pr, s, s, '', true, ln => ln.outre && ln.bbox[0] >= b[0] - .01 && ln.bbox[2] <= b[2] + .01 && ln.bbox[1] >= b[1] - .01 && ln.bbox[3] <= b[3] + .01); if (d) inner += `<path d="${d}" fill="none" stroke="${PARENT_LINE}" stroke-opacity=".6" stroke-width=".6" pointer-events="none"/>`; }
            const nf = Math.max(5, Math.min(fsz, (s - 4) / Math.max(1, textW(G.name, 1)))); // le nom tient dans son cadre (rien de collé au voisin)
            svg += `<g transform="translate(${r1(cx)} ${r1(cy)})"><rect width="${r1(s)}" height="${r1(s)}" fill="${color(spec.o?.seaColor, SEA)}" stroke="#9aa3ad" stroke-width=".8" rx="3"/>${T(s / 2, fsz * .8, G.name, {anchor: 'middle', size: nf, fill: '#444'})}<g transform="translate(${pad} ${r1(pad + fsz)})">${inner}</g></g>`;
            placed.push([cx, cy, s, s]);
        });
        return {svg, boxes: placed};
    }

    /* ── l'encart zoomé sur l'Île-de-France (Paris et petite couronne, ou toute la région) ── */
    const IDF = {pc: ['Paris et petite couronne', [2.06, 48.66, 2.64, 49.02]], idf: ['Île-de-France', [1.42, 48.1, 3.58, 49.26]]};
    const idfOf = o => { const l = levelOf(o)[0], v = o.idf ?? (l === 'reg' ? 'none' : 'pc'); return mapOf(o) === 'fr' && IDF[v] ? v : ''; };
    function idfInset(spec, base, pr, w, h, fillOf, avoid, lf, byZone, uid) {
        const o = spec.o || {}, kind = idfOf(o); if (!kind) return null;
        const [title, T0] = IDF[kind], v = pr.view;
        if (!(v[0] < 2.35 && v[2] > 2.35 && v[1] < 48.86 && v[3] > 48.86)) return null; // le cadrage ne montre pas Paris
        const a = pr.p(T0[0], T0[1]), b = pr.p(T0[2], T0[3]), tx0 = Math.min(a[0], b[0]), tx1 = Math.max(a[0], b[0]), ty0 = Math.min(a[1], b[1]), ty1 = Math.max(a[1], b[1]);
        // un coin libre : le plus grand encart possible qui ne cache (presque) rien du pays, ni l'outre-mer, ni la zone agrandie
        const land = base.parentBase && loaded(base.parentBase) || base, mainland = land.zones.filter(z => !z.outre);
        const covered = (x, y, S, H) => { let n = 0; for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const [lo, la] = pr.inv(x + S * (i + .5) / 7, y + H * (j + .5) / 7); if (mainland.some(z => inZone(z, lo, la))) n++; } return n / 49; };
        const m = 6, rects = [[tx0 - 4, ty0 - 4, tx1 + 4, ty1 + 4], ...avoid.map(([ax, ay, aw, ah]) => [ax - 3, ay - 3, ax + aw + 3, ay + ah + 3])];
        let pick = null;
        const sized = S => { const cap = clamp(S / 13, 8, 12), ipr = fitProj('laea', T0, S, S * 1.2, true); return {S, cap, ipr, ih: ipr.h, H: ipr.h + cap * 1.7}; };
        if (Math.min(w * .27, 260) / Math.max(1, tx1 - tx0, ty1 - ty0) < 1.8) return null; // déjà assez grand sur la carte (on zoome dessus)
        for (const f of [.27, .24, .21, .18, .15]) {
            const S = Math.min(w * f, h * f * 1.1, 260); if (S < 80) break;
            const z = sized(S);
            for (const [x, y] of [[m, m], [w - S - m, m], [w - S - m, h - z.H - m - 14], [m, h - z.H - m]]) {
                if (rects.some(r => !(x + S < r[0] || x > r[2] || y + z.H < r[1] || y > r[3]))) continue;
                if (covered(x, y, S, z.H) <= .02) { pick = {...z, x, y}; break; }
            }
            if (pick) break;
        }
        // aucun coin libre (téléphone, carte serrée) : l'encart se met sous la carte, en entier
        if (!pick) { const z = sized(clamp(w * .62, 150, 260)); if (z.S > w - 8) return null; pick = {...z, x: (w - z.S) / 2, y: h + 8, below: true}; }
        const {x: x0, y: y0, S, cap, ipr, ih, H} = pick, line = color(o.borderColor, '#ffffff'), lw = clamp(num(o.borderWidth) || (base.communes ? .35 : .8), .1, 6);
        const paths = pathsOf(base, ipr, S, ih, `idf|${kind}|${Math.round(S)}`);
        let plain = '', plainFill = '', zs = '';
        base.zones.forEach((z, i) => { const d = paths[i]; if (!d || z.outre) return; const f = fillOf(z); if (f.title) zs += `<path class="dgm-z" d="${d}" fill="${f.fill}" stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"><title>${esc(f.title)}</title></path>`; else { plain += d; plainFill = f.fill; } });
        if (plain) zs = `<path d="${plain}" fill="${plainFill}" stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"/>` + zs;
        if (base.communes && o.parentLines !== false) { const d = linesPath(base, ipr, S, ih, `idf|${kind}|${Math.round(S)}`, false); if (d) zs += `<path d="${d}" fill="none" stroke="${PARENT_LINE}" stroke-opacity=".6" stroke-width="${r2(clamp(lw * 2.5, .7, 3))}" pointer-events="none"/>`; }
        // étiquettes de l'encart : le nom s'il tient, sinon le numéro (75, 92…), avec le chiffre
        let labs = ''; const placed = [], ilf = clamp(lf * .9, 7, 13), lab = o.labels || 'auto';
        if (lab !== 'none') base.zones.map((z, i) => paths[i] && !z.outre ? z : null).filter(Boolean).map(z => { const [lx, ly] = ipr.p(z.label[0], z.label[1]), p0 = ipr.p(z.bbox[0], z.bbox[1]), p1 = ipr.p(z.bbox[2], z.bbox[3]); return {z, lx, ly, area: Math.abs((p1[0] - p0[0]) * (p1[1] - p0[1]))}; })
            .filter(x => x.lx > 2 && x.lx < S - 2 && x.ly > 2 && x.ly < ih - 2 && (!base.communes || lab !== 'auto' || byZone.get(x.z)?.has)).sort((p, q) => q.area - p.area).slice(0, 120).forEach(x => {
                const e = byZone.get(x.z), fit = t => textW(t, ilf) <= Math.sqrt(x.area) * 1.15;
                const nm = lab === 'value' ? '' : fit(x.z.name) || lab !== 'auto' ? x.z.name : !base.communes && x.z.id && fit(x.z.id) ? x.z.id : ''; // 75, 92… (pas les codes INSEE)
                const lines = [nm, (lab === 'value' || lab === 'both' || lab === 'auto') && e?.has ? fmt(e.v) : ''].filter(Boolean); if (!lines.length) return;
                const tw = Math.max(...lines.map(t => textW(t, ilf))), th = lines.length * ilf * 1.15, box = [x.lx - tw / 2 - 1, x.ly - th / 2, x.lx + tw / 2 + 1, x.ly + th / 2];
                if (box[0] < 0 || box[2] > S || placed.some(q => !(box[2] < q[0] || box[0] > q[2] || box[3] < q[1] || box[1] > q[3]))) return; placed.push(box);
                const fc = contrast(fillOf(x.z).fill), halo = fc === '#ffffff' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.7)';
                lines.forEach((t, i) => { labs += T(x.lx, x.ly - th / 2 + ilf * .58 + i * ilf * 1.15, t, {anchor: 'middle', size: i ? ilf * .92 : ilf, weight: i ? 400 : 600, fill: fc, halo}); });
            });
        const cid = `${uid}i`, cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2, ex = x0 + S / 2 < cx ? x0 + S : x0, ey = y0 + H / 2 < cy ? y0 + H : y0;
        const link = `<rect x="${r1(tx0)}" y="${r1(ty0)}" width="${r1(Math.max(2, tx1 - tx0))}" height="${r1(Math.max(2, ty1 - ty0))}" fill="none" stroke="#3a3f45" stroke-width=".9" rx="1.5" pointer-events="none"/>` + (pick.below ? '' : `<line x1="${r1(ex)}" y1="${r1(ey)}" x2="${r1(ex === x0 ? tx0 : tx1)}" y2="${r1(ey === y0 ? ty0 : ty1)}" stroke="#3a3f45" stroke-width=".7" stroke-opacity=".7" pointer-events="none"/>`);
        const svg = `${link}<g data-geo-inset="idf" transform="translate(${r1(x0)} ${r1(y0)})"><defs><clipPath id="${cid}"><rect width="${r1(S)}" height="${r1(ih)}" rx="3"/></clipPath></defs><rect width="${r1(S)}" height="${r1(H)}" rx="4" fill="#ffffff" stroke="#3a3f45" stroke-width="1"/>`
            + `<g transform="translate(0 ${r1(cap * 1.7)})"><g clip-path="url(#${cid})"><rect width="${r1(S)}" height="${r1(ih)}" fill="${color(o.seaColor, SEA)}"/>${zs}${labs}</g></g>${T(S / 2, cap * .95, title, {anchor: 'middle', size: cap, weight: 600, fill: '#333'})}</g>`;
        return {svg, box: [x0, y0, S, H], below: pick.below ? H + 12 : 0, geo: {x: x0, y: y0 + cap * 1.7, w: S, h: ih, pr: ipr}};
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
        if (base?.communes) return matchCommune(base, raw).z;
        const s = String(raw ?? '').trim(); if (!s) return null;
        let z = base.index.get(fold(s)); if (z) return z;
        const numOk = c => base.id !== 'fr-regions' || !/^\d+$/.test(fold(c)); // « Montreuil (93) » : 93 est un département, pas la région n°93
        const par = s.match(/\(([^()]{1,12})\)\s*$/); if (par && numOk(par[1]) && (z = base.index.get(fold(par[1])))) return z;
        const strip = fold(s).replace(/^(departement|dept|dep|region|province|prov|canton|pays|land|comte) (de la |de l |de |du |des |d )?/, '').trim(); if ((z = base.index.get(strip))) return z;
        const first = fold(s.split(',')[0]); if (first && (z = base.index.get(first))) return z;
        const lead = s.match(/^\s*(\d{2,3}|2[ab])\b/i); if (lead && numOk(lead[1]) && (z = base.index.get(fold(lead[1])))) return z;
        return null;
    }
    /** les parents (départements, provinces, cantons) que désigne un indice : « 32 », « Gers », « 32000 », « (Ille-et-Vilaine) » */
    function parentsOf(base, hint) {
        const out = new Set(), h = String(hint ?? '').trim(); if (!h) return out;
        const f = fold(h), pb = base.parentBase ? loaded(base.parentBase) : null;
        if (pb) { const z = matchZone(pb, h); if (z) out.add(z.id); }
        if (base.id === 'fr-communes') {
            if (/^(\d{2}|2[ab]|97\d)$/.test(f)) out.add(f.toUpperCase()); // numéro du département
            else if (/^\d$/.test(f)) out.add('0' + f);
            else if (/^\d{5}$/.test(f)) { if (/^97/.test(f)) out.add(f.slice(0, 3)); else if (/^20/.test(f)) { out.add('2A'); out.add('2B'); } else out.add(f.slice(0, 2)); } // code postal
        }
        if (!out.size) { const up = h.toUpperCase(); if (base.zones.some(z => z.parent === up)) out.add(up); }
        return out;
    }
    /** une commune d'après son code, ou son nom (+ département, province ou canton pour départager les homonymes) :
     *  {z} ou {z: null, why: 'homonymes' | ''} */
    function matchCommune(base, raw, hints = []) {
        const s = String(raw ?? '').trim().slice(0, 120); if (!s) return {z: null, why: ''};
        let z = base.index.get(fold(s)); if (z) return {z};
        const par = s.match(/^(.*?)\s*\(([^()]{1,40})\)\s*$/);
        if (par && (z = base.index.get(fold(par[2])))) return {z};
        // les découpages possibles : « nom », « nom (indice) », « nom, indice », « nom indice »
        const tries = [[s, '']]; if (par) tries.push([par[1], par[2]]);
        const comma = s.split(','); if (comma.length > 1) tries.push([comma[0], comma.slice(1).join(',')]);
        const words = s.replace(/\(.*\)$/, '').trim().split(/\s+/); for (let k = 1; k <= Math.min(3, words.length - 1); k++) tries.push([words.slice(0, -k).join(' '), words.slice(-k).join(' ')]);
        const extra = hints.map(h => String(h ?? '').trim()).filter(Boolean);
        let homonym = false; const named = new Set(); // un nom porté par des communes : pas cherché dans les autres noms (« Montreuil » n'est pas Montreuil-sur-Mer)
        for (const map of [base.byName, base.byAlt]) for (const [name, hint] of tries) {
            const nk = nameKey(name), list = map.get(nk); if (!list?.length || (map === base.byAlt && named.has(nk))) continue;
            if (map === base.byName) named.add(nk);
            const hs = [hint, ...(hint ? [] : extra)].filter(Boolean);
            if (hs.length) {
                for (const hh of hs) { const ps = parentsOf(base, hh); if (!ps.size) continue; const f = list.filter(c => ps.has(c.parent)); if (f.length === 1) return {z: f[0]}; if (f.length > 1) { const cur = f.filter(c => !c.old); if (cur.length === 1) return {z: cur[0]}; homonym = true; } }
                if (hint) continue; // l'indice ne désigne rien : on essaie un autre découpage
            }
            if (list.length === 1) return {z: list[0]};
            const cur = list.filter(c => !c.old); if (cur.length === 1) return {z: cur[0]};
            homonym = true;
        }
        return {z: null, why: homonym ? 'homonymes' : ''};
    }
    /** la zone du fond qui contient un point (une ville choisie dans la liste compte dans son département, sa région…) */
    function zoneAtPoint(base, lon, lat) {
        if (!isF(lon) || !isF(lat)) return null;
        if (base.communes) return zoneAt(base, lon, lat);
        let best = null, area = Infinity;
        for (const z of base.zones) { if (lon < z.bbox[0] || lon > z.bbox[2] || lat < z.bbox[1] || lat > z.bbox[3]) continue; if (inZone(z, lon, lat)) return z; const a = (z.bbox[2] - z.bbox[0]) * (z.bbox[3] - z.bbox[1]); if (a < area) { area = a; best = z; } } // tracé simplifié : la plus petite boîte
        return best;
    }
    /** un lieu choisi dans la liste du champ « Zone » (spec.places : nom écrit → position, sorte) */
    const pickedOf = (spec, label) => { const P = spec?.places && typeof spec.places === 'object' ? spec.places[fold(label)] : null; return P && isF(Number(P.lat)) && isF(Number(P.lon)) && Math.abs(P.lat) <= 90 && Math.abs(P.lon) <= 180 ? P : null; };
    /** une ligne du tableau → sa zone sur ce fond : {z} ou {z: null, why} ; un lieu choisi dans la liste l'emporte (par sa position) */
    function zoneOfRow(spec, base, label) {
        const P = pickedOf(spec, label);
        if (P && !base.communes) { const z = zoneAtPoint(base, Number(P.lon), Number(P.lat)); if (z) return {z, via: P.k || 'lieu'}; }
        const m = base.communes ? matchCommune(base, label) : {z: matchZone(base, label)}; if (m.z) return m;
        if (P) { const z = zoneAtPoint(base, Number(P.lon), Number(P.lat)); if (z) return {z, via: P.k || 'lieu'}; }
        return m;
    }
    function joinRows(spec, base) {
        const byZone = new Map(), missing = [];
        rowsOf(spec, base.communes ? 40000 : 5000).forEach(r => { // une ligne par commune : jusqu'à 40 000
            const label = r.label ?? r.zone; if (String(label ?? '').trim() === '') return;
            const m = zoneOfRow(spec, base, label), z = m.z;
            if (!z) { if (missing.length < 40) { const cb = !base.communes && !m.why ? comFor(base.id) : null, why = m.why || (cb && matchCommune(cb, label).why) || ''; // une ville tapée : homonymes ?
                missing.push(String(label).slice(0, 40) + (why === 'homonymes' ? (base.communes ? ` (homonymes : précise ${PARENT_WORD[base.id] || 'le département'})` : ' (plusieurs villes de ce nom : choisis-en une)') : '')); } return; }
            const blankV = r.s0 === undefined || r.s0 === null || String(r.s0).trim() === '';
            const e = byZone.get(z) || {v: 0, has: false, notes: []}; if (!blankV) { e.v += num(r.s0); e.has = true; } if (r.note) e.notes.push(String(r.note).slice(0, 120)); byZone.set(z, e);
        });
        [...byZone].forEach(([z, e]) => { if (!e.has && !e.notes.length) byZone.delete(z); });
        return {byZone, missing};
    }

    /* ═════════ 🗺️ Carte colorée par zones ═════════ */
    function choropleth(spec, W, fs) {
        const o0 = spec.o || {}, zb = zoneBaseOf(o0); if (zb) { const w0 = needBases(spec, W, [zb]); if (w0) return w0; } // le cadrage peut dépendre d'un département
        const o = o0, view = viewOf(o), baseId = baseIdOf(o, view), ctxId = ctxIdOf(o, baseId, view);
        const wait = needBases(spec, W, [baseId, ctxId]); if (wait) return wait;
        const base = loaded(baseId), ctx = ctxId ? loaded(ctxId) : null, uid = 'dgm' + (++uidSeq);
        const legPos = o.legend === 'none' ? 'none' : o.legend === 'right' ? 'right' : 'bottom';
        const legW = legPos === 'right' ? clamp(W * .24, 110, 220) : 0, w = W - legW - (legW ? fs : 0);
        const pr = fitProj(o.proj && o.proj !== 'auto' ? o.proj : autoProj(view), view, w, clamp(num(o.height) || 2400, 120, 3000), !num(o.height));
        const h = pr.h, unit = o.unit ? ' ' + String(o.unit).slice(0, 30) : '', series = String(spec.series?.[0]?.name || '').slice(0, 60);
        const {byZone, missing} = joinRows(spec, base);
        const vals = [...byZone.values()].filter(e => e.has).map(e => e.v), sc = vals.length ? scaleOf(vals, o) : null, noData = color(o.noData, '#e4e4e7');
        const hoverAll = o.hoverAll ?? !base.communes; // 35 000 bulles : seulement si on le demande
        const nameOf = z => `${z.name}${z.id && !/^x-/.test(z.id) ? ` (${z.old ? 'ancienne commune, ' : ''}${z.id})` : ''}`;
        const fillOf = z => { const e = byZone.get(z); if (!e) return {fill: noData, title: hoverAll ? `${nameOf(z)} : pas de chiffre` : ''};
            return {fill: e.has && sc ? sc.color(e.v) : noData, title: `${nameOf(z)} : ${e.has ? fmt(e.v) + unit : 'pas de chiffre'}${series && e.has ? ' — ' + series : ''}${e.notes.length ? '\n' + e.notes.join('\n') : ''}`, v: e.has ? e.v : null}; };
        pr.allOutre = o.frame === 'custom' || (o.frame && o.frame !== '') || !MAPS[mapOf(o)].insets || o.insets === false;
        const B = drawBase(spec, base, ctx, pr, w, h, fillOf, uid);
        let svg = `<g data-geo-map="${uid}">${B.svg}`, boxes = [];
        if (!pr.allOutre) { const I = insetsOf(spec, base, w, h, fillOf); svg += I.svg; boxes = I.boxes || []; }
        const lab = o.labels || 'auto', lf = clamp(fs * .78 * (num(o.labelSize) || 1), 6, 40), insetGeo = []; let belowSvg = '';
        const idf = idfInset(spec, base, pr, w, h, fillOf, boxes, lf, byZone, uid); // l'Île-de-France en grand, dans un coin libre
        if (idf) { if (idf.below) belowSvg = idf.svg; else { svg += idf.svg; boxes = [...boxes, idf.box]; } insetGeo.push(idf.geo); }
        // étiquettes : les plus grandes zones d'abord, sans se chevaucher (communes : seulement celles qui ont un chiffre, en automatique)
        if (lab !== 'none') {
            const placed = [...boxes.map(([x, y, bw, bh]) => [x, y, x + bw, y + bh])];
            const cand = B.zones.filter(x => (!x.z.outre || pr.allOutre) && (!base.communes || lab !== 'auto' || byZone.get(x.z)?.has)).map(x => { const [lx, ly] = pr.p(x.z.label[0], x.z.label[1]); const bb = [pr.p(x.z.bbox[0], x.z.bbox[1]), pr.p(x.z.bbox[2], x.z.bbox[3])]; return {...x, lx, ly, area: Math.abs((bb[1][0] - bb[0][0]) * (bb[1][1] - bb[0][1]))}; })
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
        const below = belowSvg ? idf.below : 0; // l'encart sous la carte (téléphone)
        let out = svg + belowSvg, H = h + below;
        if (leg) { if (legPos === 'right') out += `<g transform="translate(${r1(w + fs)} ${r1(Math.max(0, h / 2 - legH / 2))})">${leg}</g>`; else { out += `<g transform="translate(0 ${r1(h + below + fs * .9)})">${leg}</g>`; H = h + below + fs * .9 + legH; } }
        if (missing.length && o.showMissing !== false) { out += T(0, H + fs * .9, `⚠ Pas trouvé sur ce fond : ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`, {size: fs * .78, fill: '#a5552a'}); H += fs * 1.6; }
        if (!rowsOf(spec).length) { out += T(w / 2, h / 2, 'Ajoute des zones et leurs chiffres (onglet Données ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'}); }
        return {h: H, svg: out, geo: {uid, pr, w, h, insets: insetGeo}};
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
        const o = spec.o || {}, M = MAPS[mapOf(o)], zb = zoneBaseOf(o); if (zb) { const w0 = needBases(spec, W, [zb]); if (w0) return w0; }
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

    /* ═════════ ⚪ Carte à symboles proportionnels : un rond par lieu (ou par zone), sa surface suit le chiffre ═════════ */
    /** les ronds : [lon, lat, nom, valeur, notes] ; par zone (département…) quand o.byZone, au centre de la zone */
    function bubblesOf(spec, bases, base) {
        const agg = new Map(), unknown = [];
        rowsOf(spec).forEach(r => {
            const label = String(r.label ?? '').trim(), v = num(r.s0); if (!label || !(v > 0)) return;
            const p = placeOf(spec, label, bases); if (!p) { if (unknown.length < 40) unknown.push(label.slice(0, 40)); return; }
            let key = fold(p[2]), at = p;
            if (spec.o?.byZone && base) { const z = base.zones.find(zz => inZone(zz, p[0], p[1])) || matchZone(base, label); if (z) { key = 'z:' + z.i; at = [z.label[0], z.label[1], z.name]; } }
            const e = agg.get(key) || {p: at, v: 0, notes: [], n: 0}; e.v += v; e.n++; if (r.note) e.notes.push(String(r.note).slice(0, 80)); agg.set(key, e);
        });
        return {pts: [...agg.values()].sort((a, b) => b.v - a.v).slice(0, 3000), unknown};
    }
    function bubblemap(spec, W, fs) {
        const o = spec.o || {}, M = MAPS[mapOf(o)], zb = zoneBaseOf(o); if (zb) { const w0 = needBases(spec, W, [zb]); if (w0) return w0; }
        const pre = viewOf(o), baseId0 = baseIdOf(o, pre), ctx0 = mapOf(o) === 'monde' || mapOf(o) === 'eu' ? 'monde-50m' : ctxIdOf(o, baseId0, pre);
        const wait0 = needBases(spec, W, [baseId0, ctx0, 'monde-110m']); if (wait0) return wait0;
        const bases = [loaded(baseId0), ctx0 ? loaded(ctx0) : null, loaded('monde-110m')].filter(Boolean);
        const B0 = bubblesOf(spec, bases, loaded(baseId0)), auto = (!o.frame || o.frame === '') && o.fit !== false ? fitView(B0.pts, o) : null;
        const view = viewOf(o, auto || M.view), baseId = baseIdOf(o, view), ctxId = ctxIdOf(o, baseId, view);
        const wait = needBases(spec, W, [baseId, ctxId]); if (wait) return wait;
        const base = loaded(baseId), ctx = ctxId ? loaded(ctxId) : null, uid = 'dgm' + (++uidSeq);
        const F = baseId === baseId0 ? B0 : bubblesOf(spec, bases, base);
        const w = W, pr = fitProj(o.proj && o.proj !== 'auto' ? o.proj : autoProj(view), view, w, clamp(num(o.height) || 2400, 120, 3000), !num(o.height)), h = pr.h; pr.allOutre = true;
        const zoneFill = color(o.zoneColor, LAND), Bd = drawBase({...spec, o: {...o, borderColor: o.borderColor || '#cfcabe'}}, base, ctx, pr, w, h, () => ({fill: zoneFill, title: ''}), uid);
        const max = Math.max(1, ...F.pts.map(p => p.v)), maxR = clamp(num(o.maxRadius) || Math.min(w, h) * .07, 3, 200), unit = String(o.unit || '').slice(0, 30), c0 = color(o.bubbleColor, '#e15759'), opa = clamp(num(o.opacity) || 60, 10, 100) / 100;
        const rad = v => Math.max(1.5, maxR * Math.sqrt(v / max));
        let svg = `<g data-geo-map="${uid}">${Bd.svg}<g clip-path="url(#${uid}c)">`;
        const pts = F.pts.map(p => { const [x, y] = pr.p(p.p[0], p.p[1]); return {...p, x, y, r: rad(p.v)}; }).filter(p => Number.isFinite(p.x) && p.x > -p.r && p.x < w + p.r && p.y > -p.r && p.y < h + p.r);
        pts.forEach(p => { svg += `<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${r1(p.r)}" fill="${c0}" fill-opacity="${r2(opa)}" stroke="#ffffff" stroke-width="1" class="dgm-b"><title>${esc(`${p.p[2]} : ${fmt(p.v)}${unit ? ' ' + unitFor(p.v, unit) : ''}${p.notes.length ? '\n' + p.notes.slice(0, 6).join('\n') : ''}`)}</title></circle>`; });
        const placed = [], lf = clamp(fs * .78 * (num(o.labelSize) || 1), 6, 40);
        if (o.placeLabels !== 'none') pts.slice(0, o.placeLabels === 'all' ? 200 : 15).forEach(p => {
            const t = o.valueLabels === false ? p.p[2] : `${p.p[2]} ${fmt(p.v)}`, tw = textW(t, lf), box = [p.x - tw / 2, p.y - lf * .6, p.x + tw / 2, p.y + lf * .6];
            if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return; placed.push(box);
            svg += T(p.x, p.y, t, {size: lf, anchor: 'middle', weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'}); });
        svg += `</g><text x="${r1(w - 4)}" y="${r1(h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(attrOf(base, ctx))}</text><rect data-geo-hit="1" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        let H = h;
        if (o.legend !== 'none' && pts.length) { // ronds emboîtés : trois valeurs rondes
            const nice = v => { const m = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].map(k => k * m).filter(x => x <= v).pop() || v; };
            const vals = [...new Set([nice(max), nice(max / 4), nice(max / 16)])].filter(v => v >= 1 || max < 1).slice(0, 3), R0 = rad(vals[0]), cx = R0 + 4, by = h + fs * .8 + R0 * 2;
            let leg = '';
            vals.forEach(v => { const r = rad(v); leg += `<circle cx="${r1(cx)}" cy="${r1(by - r)}" r="${r1(r)}" fill="none" stroke="#55606e" stroke-width="1"/><line x1="${r1(cx)}" x2="${r1(cx + R0 + 10)}" y1="${r1(by - 2 * r)}" y2="${r1(by - 2 * r)}" stroke="#55606e" stroke-dasharray="2 2" stroke-width=".8"/>` + T(cx + R0 + 14, by - 2 * r, `${fmt(v)}${unit ? ' ' + unitFor(v, unit) : ''}`, {size: fs * .82}); });
            const title = String(spec.series?.[0]?.name || o.legendTitle || '').slice(0, 60); if (title) leg += T(cx + R0 * 2 + fs * 5, by - R0, title, {size: fs * .9, weight: 600});
            svg += `<g data-dgm-legend="">${leg}</g>`; H = by + fs * .6;
        }
        if (F.unknown.length && o.showMissing !== false) { svg += T(0, H + fs * .7, `⚠ Lieux sans position : ${F.unknown.slice(0, 10).join(', ')}${F.unknown.length > 10 ? '…' : ''} — tape « Nom 48.11, -1.68 » ou « Depuis l’app »`, {size: fs * .78, fill: '#a5552a'}); H += fs * 1.5; }
        if (!F.pts.length) svg += T(w / 2, h / 2, 'Ajoute des lieux (ou des zones) et leurs chiffres.', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        return {h: H, svg, geo: {uid, pr, w, h}, desc: `Carte à symboles proportionnels : ${pts.length} ronds, le plus gros vaut ${fmt(max)}.`};
    }

    /* ═════════ Réglages, exemples ═════════ */
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const mapOpts = () => [
        C('map', 'Carte', 'select', {choices: Object.entries(MAPS).map(([k, m]) => [k, m.label]), def: 'fr'}),
        ...Object.entries(MAPS).filter(([, m]) => m.levels.length > 1).map(([k, m]) => C('level', 'Niveau de détail', 'select', {choices: m.levels.map(([l, , n]) => [l, n]), when: s => mapOf(s.o || {}) === k})),
        ...Object.keys(MAPS).map(k => C('frame', 'Partie de la carte (cadrage)', 'select', {choices: [['', k === 'fr' ? 'France entière' : k === 'monde' ? 'Le monde entier' : `${MAPS[k].label} entière`], ...framesOf(k).map(([f, n]) => [f, n]),
            ...(MAPS[k].zoneWord ? [['zone', `📍 Zoomer sur ${MAPS[k].zoneWord[0]}…`]] : []), ['custom', '✋ Mon cadrage (souris ou cadre tracé)']], when: s => mapOf(s.o || {}) === k})),
        ...Object.entries(MAPS).filter(([, m]) => m.zoneWord).map(([k, m]) => C('frameZone', `${m.zoneWord[1]} (nom ou numéro : ${m.zoneWord[3]})`, 'text', {when: s => mapOf(s.o || {}) === k && s.o?.frame === 'zone'})),
        C('view', 'Mon cadrage : ouest, sud, est, nord (degrés)', 'text', {when: s => s.o?.frame === 'custom'}),
        C('proj', 'Projection', 'select', {choices: [['', 'Automatique'], ['equalearth', 'Equal Earth (monde, surfaces justes)'], ['robinson', 'Robinson (monde)'], ['laea', 'Lambert azimutale équivalente (Europe, pays)'], ['lambert', 'Lambert conique conforme'], ['mercator', 'Mercator']]}),
        C('insets', 'Outre-mer en encarts', 'check', {def: true, when: s => mapOf(s.o || {}) === 'fr' && !s.o?.frame}),
        ...[['pc', l => l !== 'reg'], ['none', l => l === 'reg']].map(([def, ok]) => C('idf', 'Encart zoomé sur l’Île-de-France', 'select', {choices: [['none', 'Aucun'], ['pc', 'Paris et petite couronne'], ['idf', 'Toute l’Île-de-France']], def, when: s => mapOf(s.o || {}) === 'fr' && ok(levelOf(s.o || {})[0])})),
        ...Object.entries(MAPS).filter(([, m]) => m.zoneWord).map(([k, m]) => C('parentLines', `Limites ${m.zoneWord[2]} par-dessus les communes`, 'check', {def: true, when: s => mapOf(s.o || {}) === k && levelOf(s.o || {})[0] === 'com'})),
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
        C('noData', 'Couleur des zones sans chiffre', 'color', {def: '#e4e4e7'}), C('borderColor', 'Couleur des limites', 'color', {def: '#ffffff'}),
        C('borderWidth', 'Épaisseur des limites', 'range', {min: .1, max: 4, step: .1, def: .8, when: s => levelOf(s.o || {})[0] !== 'com'}), C('borderWidth', 'Épaisseur des limites des communes', 'range', {min: .1, max: 2, step: .05, def: .2, when: s => levelOf(s.o || {})[0] === 'com'}),
        C('labels', 'Étiquettes', 'select', {choices: [['', 'Automatiques (là où il y a la place)'], ['name', 'Noms des zones'], ['value', 'Chiffres'], ['both', 'Noms et chiffres'], ['none', 'Aucune']]}),
        C('labelSize', 'Taille des étiquettes', 'range', {min: .5, max: 2.5, step: .1, def: 1}), C('unit', 'Unité (ex. : naissances, %)'),
        C('hoverAll', 'Bulle aussi sur les zones sans chiffre', 'check', {def: true, when: s => levelOf(s.o || {})[0] !== 'com'}), C('hoverAll', 'Bulle aussi sur les communes sans chiffre (plus lent)', 'check', {def: false, when: s => levelOf(s.o || {})[0] === 'com'}), C('showMissing', 'Signaler les lignes pas trouvées sur la carte', 'check', {def: true})];
    const FLOW_OPTS = [...mapOpts(), C('fit', 'Cadrer tout seul sur les lieux', 'check', {def: true, when: s => !s.o?.frame}),
        C('maxWidth', 'Épaisseur du plus gros flux', 'range', {min: 2, max: 50, def: 14}), C('minWidth', 'Épaisseur du plus petit flux', 'range', {min: .3, max: 10, step: .1, def: 1.2}),
        C('curve', 'Courbure des flèches', 'range', {unit: '%', min: 0, max: 60, def: 25}), C('arrows', 'Pointes de flèche', 'check', {def: true}), C('opacity', 'Opacité des flèches', 'range', {unit: '%', min: 10, max: 100, def: 75}),
        C('colorBy', 'Couleur des flèches', 'select', {choices: [['', 'Une seule couleur'], ['origin', 'Selon le lieu de départ'], ['dest', 'Selon le lieu d’arrivée']]}), C('flowColor', 'Couleur des flèches', 'color', {def: '#c0392b', when: s => !s.o?.colorBy}),
        C('dots', 'Ronds sur les lieux', 'check', {def: true}), C('dotSize', 'Taille des ronds', 'range', {min: 1, max: 30, def: 7}), C('dotColor', 'Couleur du tour des ronds', 'color', {def: '#1d1d1f'}),
        C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Tous (sans se chevaucher)'], ['big', 'Les 12 plus importants'], ['none', 'Aucun']]}), C('labelSize', 'Taille des noms', 'range', {min: .5, max: 2.5, step: .1, def: 1}),
        C('zoneColor', 'Couleur des terres', 'color', {def: LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('unit', 'Unité (ex. : personnes)'), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const BUBBLE_OPTS = [...mapOpts(), C('fit', 'Cadrer tout seul sur les lieux', 'check', {def: true, when: s => !s.o?.frame}), C('byZone', 'Regrouper par zone (un rond au centre de chaque zone du fond)', 'check'),
        C('maxRadius', 'Rayon du plus gros rond (px, vide = auto)', 'number', {min: 3, max: 200}), C('bubbleColor', 'Couleur des ronds', 'color', {def: '#e15759'}), C('opacity', 'Opacité des ronds', 'range', {unit: '%', min: 10, max: 100, def: 60}),
        C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Les 15 plus gros (sans se chevaucher)'], ['all', 'Tous (sans se chevaucher)'], ['none', 'Aucun']]}), C('valueLabels', 'Chiffre à côté du nom', 'check', {def: true}), C('labelSize', 'Taille des noms', 'range', {min: .5, max: 2.5, step: .1, def: 1}),
        C('zoneColor', 'Couleur des terres', 'color', {def: LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('unit', 'Unité (ex. : naissances)'), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const BUBBLE_SAMPLE = () => ({o: {title: 'Où sont nés mes ancêtres', subtitle: 'un rond par commune', map: 'fr', level: 'dep', unit: 'naissances'}, series: [{name: 'Naissances'}],
        places: Object.fromEntries(Object.entries(CITY).map(([n, [lat, lon]]) => [fold(n), {lat, lon, n}])),
        rows: [['Rennes', 46], ['Vitré', 28], ['Fougères', 17], ['Nantes', 12], ['Laval', 9], ['Saint-Brieuc', 7], ['Paris', 6], ['Brest', 3], ['Le Havre', 2], ['Lyon', 1]].map(([label, s0]) => ({label, s0}))});
    const CHORO_SAMPLE = () => ({o: {title: 'Où sont nés mes ancêtres', subtitle: 'naissances par département', map: 'fr', level: 'dep', unit: 'naissances', colorMode: 'classes', classes: 5, ramp: 'oranges', labels: ''},
        series: [{name: 'Naissances'}], rows: [['Ille-et-Vilaine', 42], ['Côtes-d’Armor', 25], ['Morbihan', 18], ['Loire-Atlantique', 15], ['Finistère', 12], ['Paris', 11], ['Mayenne', 9], ['Manche', 7], ['Maine-et-Loire', 6], ['Calvados', 3], ['Sarthe', 4], ['Gironde', 3], ['Rhône', 2], ['Bouches-du-Rhône', 2], ['Nord', 1], ['Guadeloupe', 1]].map(([label, s0]) => ({label, s0}))});
    const CITY = {Rennes: [48.1147, -1.6794], Paris: [48.8566, 2.3522], Nantes: [47.2184, -1.5536], 'Vitré': [48.1236, -1.2094], 'Saint-Brieuc': [48.5136, -2.7653], Brest: [48.3904, -4.4861], 'Le Havre': [49.4944, .1079], 'Fougères': [48.3525, -1.1986], Laval: [48.0707, -.7734], Lyon: [45.764, 4.8357]};
    const FLOW_SAMPLE = () => ({o: {title: 'Les migrations de la famille', subtitle: 'du lieu de naissance au lieu de décès', map: 'fr', level: 'dep', unit: 'personnes'},
        places: Object.fromEntries(Object.entries(CITY).map(([n, [lat, lon]]) => [fold(n), {lat, lon, n}])),
        rows: [['Vitré', 'Rennes', 15], ['Rennes', 'Paris', 12], ['Rennes', 'Nantes', 8], ['Saint-Brieuc', 'Rennes', 6], ['Fougères', 'Rennes', 5], ['Nantes', 'Paris', 5], ['Laval', 'Paris', 4], ['Brest', 'Le Havre', 3], ['Rennes', 'Lyon', 2]].map(([from, to, value]) => ({from, to, value}))});

    /* ═════════ Les chiffres pris dans l'app (api diagram_geo) ═════════ */
    // « Quoi » : [groupe, [[sorte, nom]]] ; « Une sorte d'événement… » ouvre une seconde liste (les sortes de la base)
    const SRC_GROUPS = [['Événements', [['births', 'Naissances (ou baptêmes)'], ['deaths', 'Décès (ou sépultures)'], ['marriages', 'Mariages'], ['all', 'Naissances, mariages et décès'], ['baptisms', 'Baptêmes seuls'], ['burials', 'Sépultures seules'],
            ['residences', 'Résidences'], ['census', 'Recensements (personnes recensées)'], ['occupations', 'Métiers (lieux où on les exerçait)'], ['departures', 'Départs (nés ici, morts ailleurs)'], ['arrivals', 'Arrivées (nés ailleurs, morts ici)']]],
        ['Personnes', [['people', 'Personnes différentes'], ['surnames', 'Familles (patronymes différents)']]],
        ['Valeurs', [['age_death', 'Âge moyen au décès (en années)']]],
        ['Autres', [['sourced', 'Actes trouvés (événements avec une source ou un document)'], ['type', 'Une sorte d’événement…']]]];
    const SRC_ZONES = SRC_GROUPS.flatMap(g => g[1]);
    /** les sortes d'événements de la base (pour « Une sorte d'événement… ») : les plus utilisées d'abord, puis par nom */
    let TYPES = null; // lues sur le serveur (api diagram_geo&list=types : nombre d'événements qui ont un lieu), sinon celles de l'app
    const loadTypes = () => TYPES ? Promise.resolve(TYPES) : A().api('diagram_geo', {list: 'types'}).then(r => (TYPES = Array.isArray(r?.types) ? r.types : null) || []).catch(() => []);
    const eventTypes = () => (TYPES || A()?.state?.bootstrap?.eventTypes || []).filter(t => t && Number(t.id) > 0 && Number(t.is_active ?? 1) !== 0)
        .map(t => ({id: Number(t.id), label: String(t.label || ''), scope: t.scope, n: Number(t.usage_count) || 0, ic: A()?.typeGlyph ? A().typeGlyph(t.icon, t.gedcom_tag) : '◆'}))
        .sort((a, b) => (b.n > 0) - (a.n > 0) || a.label.localeCompare(b.label, 'fr', {sensitivity: 'base'}));
    const srcLabel = q => q.what === 'type' ? (eventTypes().find(t => t.id === Number(q.type))?.label || 'Une sorte d’événement') : (SRC_ZONES.find(x => x[0] === q.what)?.[1] || SRC_FLOWS.find(x => x[0] === q.what)?.[1] || '');
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
    /** la commune sous un point : grille de 0,1° (35 000 communes, des milliers de lieux) */
    function zoneAt(base, x, y) {
        if (!base.grid) { const g = new Map(); base.zones.forEach(z => { for (let i = Math.floor(z.bbox[0] * 10); i <= Math.floor(z.bbox[2] * 10); i++) for (let j = Math.floor(z.bbox[1] * 10); j <= Math.floor(z.bbox[3] * 10); j++) { const k = i + ':' + j, l = g.get(k); if (l) l.push(z); else g.set(k, [z]); } }); base.grid = g; }
        return (base.grid.get(Math.floor(x * 10) + ':' + Math.floor(y * 10)) || []).find(z => inZone(z, x, y)) || null;
    }
    /** la commune d'un lieu de la base : code INSEE (ou officiel), puis nom + département, province ou canton, puis coordonnées */
    function communeOfPlace(base, pl, why) {
        const code = String(pl.insee ?? '').trim(); let z = code ? base.index.get(fold(code)) : null; if (z) return z;
        const hasXY = pl.lat !== null && pl.lon !== null && Number.isFinite(pl.lat) && Number.isFinite(pl.lon), at = hasXY ? zoneAt(base, pl.lon, pl.lat) : null;
        const ctry = fold(pl.country), here = !ctry || base.country.includes(ctry);
        const m = here && pl.name ? matchCommune(base, pl.name, [pl.code, pl.county, pl.state]) : {z: null, why: ''};
        if (m.z && (!at || m.z === at)) return m.z;
        if (m.z && at) { const b = m.z.bbox, d = .02; return pl.lon >= b[0] - d && pl.lon <= b[2] + d && pl.lat >= b[1] - d && pl.lat <= b[3] + d ? m.z : at; } // limite simplifiée : le nom l'emporte s'il est tout près
        if (at) return at;
        if (why && m.why) why.why = m.why;
        return null;
    }
    function zoneOfPlace(base, pl, why) {
        if (base.communes) return communeOfPlace(base, pl, why);
        if (pl.lat !== null && pl.lon !== null && Number.isFinite(pl.lat) && Number.isFinite(pl.lon)) { const z = base.zones.find(zz => inZone(zz, pl.lon, pl.lat)); if (z) return z; }
        for (const k of [pl.code, pl.county, pl.state, pl.country]) { const z = k && matchZone(base, k); if (z) return z; }
        return null;
    }
    const zoneLabel = (base, z) => base.dupNames.has(fold(z.name)) ? `${z.name} (${z.id})` : z.name;
    async function fillZones(spec, q) {
        const o = spec.o || {}, view = viewOf(o), base = await load(baseIdOf(o, view)), r = await fetchGeo(q);
        const sums = new Map(); let lost = 0, lostN = 0; const lostNames = [];
        if (base.parentBase) await load(base.parentBase).catch(() => {}); // pour lire « Gers », « Liège »… à côté du nom
        // un nombre : additionné ; une moyenne (âge au décès) : pondérée par le nombre de personnes ; des personnes (ou patronymes) différentes : réunies par zone
        const avg = !!r.avg, distinct = !!r.distinct;
        (r.places || []).slice(0, 6000).forEach(pl => { const n = Number(pl.n) || 0, w = avg ? Number(pl.w) || 0 : 1; if (!n || !w) return; const why = {}; const z = zoneOfPlace(base, pl, why); if (!z) { lost++; lostN += n; if (lostNames.length < 8) lostNames.push(pl.name + (why.why === 'homonymes' ? ' (homonymes)' : '')); return; }
            const e = sums.get(z) || {n: 0, w: 0, k: distinct ? new Set() : null}; e.n += avg ? n * w : n; e.w += w; if (e.k) (pl.k || []).forEach(x => e.k.add(x)); sums.set(z, e); });
        const val = e => avg ? Math.round(e.n / e.w * 10) / 10 : e.k ? e.k.size : e.n;
        spec.rows = [...sums].map(([z, e]) => [z, val(e), e.w]).sort((a, b) => b[1] - a[1]).map(([z, n, w]) => ({label: zoneLabel(base, z), s0: n, ...(avg ? {note: pl(w, 'personne')} : {})}));
        const name = q.what === 'type' ? (r.type?.label || srcLabel(q)) : srcLabel(q) || 'Nombre';
        spec.series = [{...(spec.series?.[0] || {}), name: name.replace(/ \(.*\)$/, '').replace(/…$/, '')}];
        spec.o = spec.o || {}; if (avg) spec.o.unit = r.unit || 'ans'; else if (spec.o.unit === 'ans') spec.o.unit = '';
        return {zones: sums.size, places: (r.places || []).length, lost, lostN, lostNames, avg, people: avg ? [...sums.values()].reduce((t, e) => t + e.w, 0) : 0};
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
    /** ⚪ un rond par lieu de la base (coordonnées gardées dans spec.places ; sans coordonnées : le nom cherché sur le fond) */
    async function fillBubbles(spec, q) {
        const r = await fetchGeo(q), names = new Map(); (r.places || []).forEach(p => { const f = fold(p.name); names.set(f, (names.get(f) || 0) + 1); });
        const label = p => names.get(fold(p.name)) > 1 && (p.county || p.state || p.code) ? `${p.name} (${p.county || p.state || p.code})` : p.name;
        // comme fillZones : âge moyen = moyenne pondérée par le nombre de personnes ; personnes ou patronymes différents : chacun une fois par lieu
        const avg = !!r.avg, distinct = !!r.distinct, sums = new Map(), places = {}; let lost = 0;
        (r.places || []).slice(0, 6000).forEach(p => { const n = Number(p.n) || 0, w = avg ? Number(p.w) || 0 : 1; if (!n || !w || !String(p.name || '').trim()) return; const l = String(label(p)).slice(0, 80);
            const e = sums.get(l) || {n: 0, w: 0, k: distinct ? new Set() : null}; e.n += avg ? n * w : n; e.w += w; if (e.k) (p.k || []).forEach(x => e.k.add(x)); sums.set(l, e); if (p.lat !== null && p.lon !== null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))) places[fold(l)] = {lat: Number(p.lat), lon: Number(p.lon), n: l}; else lost++; });
        const val = e => avg ? Math.round(e.n / e.w * 10) / 10 : e.k ? e.k.size : e.n;
        spec.rows = [...sums].map(([l, e]) => [l, val(e), e.w]).sort((a, b) => b[1] - a[1]).map(([l, n, w]) => ({label: l, s0: n, ...(avg ? {note: pl(w, 'personne')} : {})}));
        spec.places = places; spec.o = spec.o || {}; if (avg) spec.o.unit = r.unit || 'ans'; else if (spec.o.unit === 'ans') spec.o.unit = '';
        spec.series = [{...(spec.series?.[0] || {}), name: (srcLabel(q) || 'Nombre').replace(/ \(.*\)$/, '').replace(/…$/, '')}];
        return {points: spec.rows.length, lost};
    }
    /** chiffres « tenus à jour » : spec.live = {key: 'geo:<sorte>:<ancêtres 0|1>:<de>:<à>[:<sorte d'événement>]', label} (la fin, seulement pour « type » : les anciennes clés restent bonnes) */
    const parseLive = key => { const m = String(key || '').match(/^geo:([a-z_]+):([01]):(-?\d*):(-?\d*)(?::(\d{1,9}))?$/); if (!m || ![...SRC_ZONES, ...SRC_FLOWS].some(x => x[0] === m[1])) return null; if ((m[1] === 'type') !== !!m[5]) return null;
        const q = {what: m[1]}; if (m[2] === '1') q.ancestors = 1; if (m[3] !== '') q.from = Number(m[3]); if (m[4] !== '') q.to = Number(m[4]); if (m[5]) q.type = Number(m[5]); return q; };
    const liveKey = q => `geo:${q.what}:${q.ancestors ? 1 : 0}:${q.from ?? ''}:${q.to ?? ''}${q.what === 'type' ? ':' + (Number(q.type) || 0) : ''}`;

    /** avant le dessin : le fond (et le fond autour) chargés, les chiffres tenus à jour relus */
    async function resolve(spec) {
        const s = JSON.parse(JSON.stringify(spec || {})), o = s.o || {}, q0 = parseLive(s.live?.key), q = q0 && s.live?.dg && typeof s.live.dg === 'object' ? {...q0, ...Object.fromEntries(Object.entries(s.live.dg).filter(([k, v]) => /^dg_[a-z]+$/.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length <= 4000))} : q0; // dg : le groupe de personnes gardé avec « Tenir à jour »
        if (q) { try { if (s.kind === 'flowmap') await fillFlows(s, q); else if (s.kind === 'bubblemap') await fillBubbles(s, q); else await fillZones(s, q); } catch (_) {} }
        if (MAPS[mapOf(o)].zoneBase) await load(MAPS[mapOf(o)].zoneBase).catch(() => {}); // cadrage sur un département, « nom (département) »
        const view = viewOf(o), ids = [baseIdOf(o, view), ctxIdOf(o, baseIdOf(o, view), view)];
        const pts = s.kind === 'flowmap' || s.kind === 'bubblemap';
        if (pts) ids.push('monde-110m', mapOf(o) === 'monde' || mapOf(o) === 'eu' ? 'monde-50m' : '');
        await Promise.all(ids.filter(Boolean).map(id => load(id).catch(() => {})));
        if (pts) { // le cadrage automatique peut demander un autre fond (plus détaillé, ou le monde)
            const bases = ids.filter(Boolean).map(loaded).filter(Boolean), F = s.kind === 'flowmap' ? flowsOf(s, bases).points : bubblesOf(s, bases, loaded(baseIdOf(o, view))).pts, v2 = (!o.frame && o.fit !== false && fitView(F, o)) || view;
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
            bar.innerHTML = `<span class="dgm-bar-t">🗺 Cadrage</span><button type="button" class="icon-button small" data-dgm="in" title="Zoomer" aria-label="Zoomer">＋</button><button type="button" class="icon-button small" data-dgm="out" title="Dézoomer" aria-label="Dézoomer">−</button><button type="button" class="button small secondary" data-dgm="box" aria-pressed="false" title="Tracer un cadre sur la carte (ou Maj + glisser)">▭ Tracer un cadre</button><button type="button" class="button small secondary" data-dgm="reset" title="Revenir au cadrage de départ">↺ Remettre comme au départ</button><small class="muted dgm-bar-h">Molette : zoomer · glisser : déplacer · Maj + glisser : tracer un cadre</small>`;
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
        // un point de l'encart de l'Île-de-France → le même lieu sur la grande carte (la molette zoome là où l'on montre)
        const toMain = (g, [x, y]) => { const i = (g.insets || []).find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); if (!i) return [x, y]; const [lo, la] = i.pr.inv(x - i.x, y - i.y); return g.pr.p(lo, la); };
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
            const [x, y] = toMain(g, pt(g, e)); wheelAt = wheelAt || [x, y, g]; wheelK *= e.deltaY < 0 ? 1.15 : 1 / 1.15; wheelK = clamp(wheelK, 1 / 12, 40);
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
    const typeOptions = sel => eventTypes().map(t => `<option value="${t.id}" ${Number(sel) === t.id ? 'selected' : ''}>${esc(t.ic)} ${esc(t.label)}${t.scope === 'family' ? ' (famille)' : ''}${t.n ? ` — ${t.n}` : ' — pas encore utilisée'}</option>`).join('') || '<option value="">Chargement des sortes d’événements…</option>';
    function appPane(box, api) {
        const put = s => (api.set || api.apply)(s);
        const spec = api.spec(), flows = spec.kind === 'flowmap', bub = spec.kind === 'bubblemap', srcs = flows ? SRC_FLOWS : SRC_ZONES, cur = parseLive(spec.live?.key) || {};
        const P = window.LCNDA_PICKER;
        box.innerHTML = `<h4>📍 ${flows ? 'Les migrations de ton arbre' : 'Les lieux de ton arbre'}</h4>
            <p class="muted">${bub ? 'Chaque lieu de ta base devient un rond, plus gros quand plus de personnes y sont nées (mariées, décédées). Les lieux avec des coordonnées sont placés exactement ; les autres sont cherchés par leur nom sur la carte. Le tableau est remplacé.' : flows ? 'Chaque personne relie deux lieux de ta base (ceux qui ont des coordonnées, ou une zone de la carte reconnue). Le tableau est remplacé.' : 'Chaque lieu de ta base est rattaché à sa zone (d’après ses coordonnées, sinon son département, sa région ou son pays ; pour les communes : son code INSEE, puis son nom et son département), puis les zones sont comptées. Le tableau est remplacé.'}</p>
            <div class="dgm-form"><label>Quoi<select data-dgm-what>${flows ? srcs.map(([k, l]) => `<option value="${k}" ${cur.what === k ? 'selected' : ''}>${esc(l)}</option>`).join('')
                : SRC_GROUPS.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([k, l]) => `<option value="${k}" ${cur.what === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></label>
            ${flows ? '' : `<label data-dgm-typebox ${cur.what === 'type' ? '' : 'hidden'}>Quelle sorte d’événement<select data-dgm-type>${typeOptions(cur.type)}</select></label>`}
            <label class="checkbox-line"><input type="checkbox" data-dgm-anc ${cur.ancestors ? 'checked' : ''}> Seulement mes ancêtres (lignée Sosa)</label>
            <span class="dgm-period"><label>De l’année<input type="number" inputmode="numeric" data-dgm-from value="${esc(cur.from ?? '')}" placeholder="ex. 1700" min="-3000" max="3000"></label><label>à l’année<input type="number" inputmode="numeric" data-dgm-to value="${esc(cur.to ?? '')}" placeholder="ex. 1900" min="-3000" max="3000"></label></span>
            <label class="checkbox-line"><input type="checkbox" data-dgm-live ${spec.live?.key && cur.what ? 'checked' : ''}> 🔄 Tenir à jour (relire l’arbre à chaque affichage)</label>
            <button type="button" class="button small" data-dgm-go>Prendre ces chiffres</button><p class="dgm-msg" data-dgm-msg role="status"></p></div>
            ${flows ? `<h4>＋ Ajouter un flux</h4><div class="dgm-form dgm-addflow"><span class="pk-lab">Départ</span><div data-dgm-pa>${P.pickerField({name: '', hiddenName: false, kind: 'place', inline: true})}</div><span class="pk-lab">Arrivée</span><div data-dgm-pb>${P.pickerField({name: '', hiddenName: false, kind: 'place', inline: true})}</div><label>Combien<input type="number" inputmode="decimal" min="0" value="1" data-dgm-n></label><button type="button" class="button small" data-dgm-addflow>＋ Ajouter ce flux</button></div>
            <h4>📍 Les lieux du tableau</h4><p class="muted">Un lieu sans position (⚠) : choisis-le dans ta base ou dans les communes et villes du monde, ou tape ses coordonnées dans le tableau (« Rennes 48.11, -1.68 »).</p><div data-dgm-places></div><button type="button" class="button small secondary" data-dgm-find>🔎 Retrouver les lieux sans position</button>` : ''}`;
        const msg = t => { box.querySelector('[data-dgm-msg]').textContent = t; };
        if (!flows) loadTypes().then(() => { const sel = box.querySelector('[data-dgm-type]'); if (sel && box.isConnected) { const v = sel.value || cur.type; sel.innerHTML = typeOptions(v); } });
        box.querySelector('[data-dgm-what]').addEventListener('change', e => { const tb = box.querySelector('[data-dgm-typebox]'); if (tb) tb.hidden = e.target.value !== 'type'; });
        const query = () => { const q = {what: box.querySelector('[data-dgm-what]').value}; if (q.what === 'type') q.type = Number(box.querySelector('[data-dgm-type]')?.value) || 0; if (box.querySelector('[data-dgm-anc]').checked) q.ancestors = 1; const f = box.querySelector('[data-dgm-from]').value.trim(), t = box.querySelector('[data-dgm-to]').value.trim(); if (/^-?\d{1,4}$/.test(f)) q.from = Number(f); if (/^-?\d{1,4}$/.test(t)) q.to = Number(t); return {...q, ...(window.LCNDA_EXT?.diagramAppOpts?.extra() || {})}; }; // + le groupe de personnes commun (heritage-diagram-options.js)
        box.querySelector('[data-dgm-go]').addEventListener('click', async e => {
            const b = e.currentTarget, q = query(); if (q.what === 'type' && !q.type) return msg('Choisis d’abord une sorte d’événement.');
            b.disabled = true; msg('⏳ Lecture de l’arbre…');
            try {
                const s = api.spec(), prevLabel = box._lastLabel || s.live?.label || '', label = srcLabel(q).replace(/…$/, '') + (q.ancestors ? ' (mes ancêtres)' : '') + (q.from || q.to ? ` ${q.from ?? '…'}–${q.to ?? '…'}` : '');
                const rep = flows ? await fillFlows(s, q) : bub ? await fillBubbles(s, q) : await fillZones(s, q);
                if (box.querySelector('[data-dgm-live]').checked) { const dg = Object.fromEntries(Object.entries(q).filter(([k]) => k.startsWith('dg_'))); s.live = {key: liveKey(q), label, ...(Object.keys(dg).length ? {dg} : {})}; } else delete s.live;
                const smp = (flows ? FLOW_SAMPLE() : bub ? BUBBLE_SAMPLE() : CHORO_SAMPLE()).o; if (!s.o.title || s.o.title === smp.title || (prevLabel && s.o.title === prevLabel)) s.o.title = label; box._lastLabel = label; if (s.o.subtitle === smp.subtitle) s.o.subtitle = ''; if (s.o.unit === smp.unit && !flows) s.o.unit = '';
                if (bub) msg(rep.points ? `✓ ${pl(rep.points, 'lieu')} pris dans l’arbre.${rep.lost ? ` ${pl(rep.lost, 'lieu sans coordonnées', 'lieux sans coordonnées')} : cherché${rep.lost > 1 ? 's' : ''} par leur nom sur la carte.` : ''}` : 'Aucun lieu dans ton arbre pour ce choix.');
                else if (flows) { if (!rep.flows) { msg('Aucun déplacement trouvé (il faut deux lieux différents pour une même personne).'); } else msg(`✓ ${pl(rep.flows, 'flux')} pris dans l’arbre.${rep.lost ? ` ${pl(rep.lost, 'lieu sans coordonnées', 'lieux sans coordonnées')} : voir « Les lieux du tableau ».` : ''}`); }
                else msg(rep.zones ? `✓ ${pl(rep.places - rep.lost, 'lieu rattaché', 'lieux rattachés')} à ${pl(rep.zones, 'zone')}${rep.avg ? ` (âge moyen sur ${pl(rep.people, 'personne')} ; la carte montre des années, pas un nombre)` : ''}.${rep.lost ? ` ${pl(rep.lost, 'lieu', 'lieux')} hors de cette carte ou sans position (${rep.lostNames.join(', ')}${rep.lost > rep.lostNames.length ? '…' : ''}).` : ''}` : 'Aucun lieu de ton arbre ne tombe sur cette carte : change de carte ou de niveau dans Réglages.');
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

    /* ═════════ Le champ « Zone » du tableau : une liste de choix au fil de la frappe ═════════
     * Mélange les zones de la carte à chaque niveau (départements, régions, provinces, cantons, pays, NUTS…) et, pour la
     * France, la Belgique, la Suisse et le Luxembourg, les communes (fichier chargé à la demande, dès 2 lettres).
     * Choisir écrit une valeur sans ambiguïté (« Montreuil (93) », « Ille-et-Vilaine », « BE-46030 »…) ; une ville (ou une
     * zone plus fine que le niveau de la carte) est retenue avec sa position (spec.places) : elle compte dans son
     * département, sa région… tant que la carte n'est pas au niveau des communes. Pastille orange : ligne ambiguë ou inconnue. */
    // niveau → [mot, finesse (0 = commune), « son … », « leur … », un/une]
    const LV = {com: ['ville', 0, 'sa commune', 'leur commune', 'une ville'], dep: ['département', 1, 'son département', 'leur département', 'un département'], prov: ['province', 1, 'sa province', 'leur province', 'une province'],
        cant: ['canton', 1, 'son canton', 'leur canton', 'un canton'], nuts2: ['région', 1, 'sa région', 'leur région', 'une région'], reg: ['région', 2, 'sa région', 'leur région', 'une région'],
        nuts1: ['grande région', 2, 'sa grande région', 'leur grande région', 'une grande région'], pays: ['pays', 3, 'son pays', 'leur pays', 'un pays'], cont: ['continent', 4, 'son continent', 'leur continent', 'un continent']};
    const levelWord = (map, lv) => map === 'ch' && lv === 'reg' ? LV.nuts1 : LV[lv] || ['zone', 1, 'sa zone', 'leur zone', 'une zone'];
    const ICON = lv => lv === 'com' ? '🏘' : lv === 'pays' || lv === 'cont' ? '🌍' : '🏛';
    /** les niveaux de la carte choisie, avec leur fond ; here = le niveau dessiné, com = celui des communes (ou null) */
    function zoneCtx(spec) {
        const o = spec.o || {}, map = mapOf(o), M = MAPS[map], cur = levelOf(o)[0];
        const levels = M.levels.map(([lv, id, name]) => ({lv, id: lv === cur ? baseIdOf(o, viewOf(o)) : id === 'monde' ? 'monde-110m' : id, name, word: levelWord(map, lv), cur: lv === cur}));
        return {o, map, M, levels, here: levels.find(l => l.cur), com: levels.find(l => l.lv === 'com') || null};
    }
    /** la ville (communes) de la carte qui contient ce fond, si son fichier est déjà chargé */
    const comFor = id => { for (const M of Object.values(MAPS)) { if (!M.levels.some(l => l[1] === id)) continue; const c = M.levels.find(l => l[0] === 'com'); if (c) return loaded(c[1]); } return null; };
    const suggIndex = b => b.sugg || (b.sugg = b.zones.map(z => ({z, k: nameKey(z.name), a: z.alt.filter(a => !/^\d/.test(a)).map(a => [nameKey(a), a]), c: fold(z.id).replace(/ /g, '')})));
    const parentZone = (C, it) => { // le département (province, canton…) d'une commune, la région d'un département…
        const ids = it.L.lv === 'com' ? [C.M.zoneBase] : C.levels.filter(l => l.word[1] > it.L.word[1] && l.lv !== 'com').map(l => l.id).concat(['continents']);
        for (const id of ids) { const b = id && loaded(id), p = b && b.zones.find(z => z.id === it.z.parent); if (p) return p; } return null; };
    /** ce qu'on écrit dans la case : la plus courte valeur qui retrouve cette zone (ou cette commune) sans ambiguïté */
    function valueOf(C, it, pz) {
        const {b, z} = it;
        if (!b.communes) { for (const v of [z.name, `${z.name} (${z.id})`]) if (matchZone(b, v) === z) return v; return z.id; }
        const tok = b.id === 'fr-communes' ? z.parent : b.id === 'ch-communes' ? (pz?.alt.find(a => /^[A-Z]{2}$/.test(a)) || pz?.name) : pz?.name || z.parent;
        for (const v of [z.name, tok && `${z.name} (${tok})`]) if (v && matchCommune(b, v).z === z) return v;
        return (b.pfx || '') + z.id;
    }
    /** les propositions pour un texte tapé : [{value, title, meta, kind, icon, L, b, z, remember, coarse}] */
    function zoneSuggest(spec, q, max = 14) {
        const C = zoneCtx(spec), qk = nameKey(q), qc = fold(q).replace(/ /g, ''); if (!qk) return [];
        // « Saint-Martin 32 », « Montreuil (62) » : le nom, puis le département (province, canton) qui départage
        const hm = String(q).match(/^(.+?)[\s,(]+([^\s,()]+)\)?\s*$/), head = hm ? nameKey(hm[1]) : '', cb = C.com && loaded(C.com.id), hp = hm && cb ? parentsOf(cb, hm[2]) : new Set();
        const sc = (k, x) => k === x ? 0 : k.startsWith(x) ? 1 : k.includes(' ' + x) ? 2 : 9, out = [];
        for (const L of C.levels) {
            const b = loaded(L.id); if (!b || (b.communes && qk.length < 2)) continue;
            for (const e of suggIndex(b)) {
                let s = sc(e.k, qk), alt = '';
                if (s > 0) for (const [ak, a] of e.a) { const s2 = sc(ak, qk) + .5; if (s2 < s) { s = s2; alt = a; } }
                if (e.c && (e.c === qc ? 0 : /\d/.test(qc) && (qc.length >= 3 || !b.communes) && e.c.startsWith(qc) ? 1.5 : 9) < s) { s = e.c === qc ? 0 : 1.5; alt = ''; }
                if (s > 2.5 && b.communes && hp.size && hp.has(e.z.parent) && sc(e.k, head) < 9) s = sc(e.k, head) - .2; // le nom et son département
                if (s < 9) out.push({L, b, z: e.z, s, alt, tier: L.cur ? 0 : b.communes ? 2 : 1});
            }
        }
        out.sort((x, y) => x.s - y.s || x.tier - y.tier || (x.z.old ? 1 : 0) - (y.z.old ? 1 : 0) || x.z.name.length - y.z.name.length || x.z.name.localeCompare(y.z.name, 'fr') || x.z.parent.localeCompare(y.z.parent, 'fr', {numeric: true}));
        return out.slice(0, max).map(it => {
            const pz = parentZone(C, it), value = valueOf(C, it, pz), com = it.L.lv === 'com', coarse = !com && it.L.word[1] > C.here.word[1];
            const ppz = com && pz && C.map === 'fr' ? loaded('fr-regions')?.zones.find(z => z.id === pz.parent) : null;
            const meta = com ? [pz?.name, ppz?.name, it.alt ? `aussi « ${it.alt} »` : ''].filter(Boolean).join(' · ')
                : [it.z.id && !/^x-/.test(it.z.id) && fold(it.z.id) !== fold(it.z.name) ? it.z.id : '', pz?.name, it.alt ? `aussi « ${it.alt} »` : '', coarse ? `autre niveau : « ${it.L.name} »` : ''].filter(Boolean).join(' · ');
            return {value, title: com ? (value === (it.b.pfx || '') + it.z.id ? `${it.z.name} — ${value}` : value) : it.z.name, meta, kind: com && it.z.old ? 'ancienne commune' : it.L.word[0], icon: ICON(it.L.lv), L: it.L, b: it.b, z: it.z, cur: it.L.cur, coarse, remember: com || (!it.L.cur && !coarse)};
        });
    }
    /** une ville (ou une zone plus fine) choisie : sa position, pour la compter dans sa zone à tous les niveaux */
    function rememberPick(spec, value, it) {
        spec.places = {...(spec.places && typeof spec.places === 'object' ? spec.places : {})};
        spec.places[fold(value)] = {lat: Math.round(it.z.label[1] * 1e5) / 1e5, lon: Math.round(it.z.label[0] * 1e5) / 1e5, n: String(value).slice(0, 80), k: it.L.lv};
        prunePlaces(spec);
    }
    /** les positions retenues qui ne servent plus à aucune ligne s'en vont */
    function prunePlaces(spec) {
        if (!spec.places || typeof spec.places !== 'object') return;
        const used = new Set(rowsOf(spec, 40000).map(r => fold(r.label ?? r.zone)));
        Object.keys(spec.places).forEach(k => { if (!used.has(k)) delete spec.places[k]; }); if (!Object.keys(spec.places).length) delete spec.places;
    }
    const homonymsMsg = (b, s) => { const head = String(s).replace(/\(.*\)\s*$/, '').split(',')[0].trim(), n = (b.byName.get(nameKey(head)) || []).filter(z => !z.old).length;
        return `Plusieurs villes s’appellent ${head}${n > 1 ? ` (${n})` : ''} : choisis-en une dans la liste.`; };
    /** l'état d'une ligne : {ok} ; {auto} (une ville, ou une zone plus fine, à retenir) ; {why, msg} (homonymes, autre niveau, inconnue) */
    function rowStatus(spec, raw) {
        const C = zoneCtx(spec), base = loaded(C.here.id), s = String(raw ?? '').trim();
        if (!s || !base) return {ok: true};
        const m = zoneOfRow(spec, base, s); if (m.z) return {ok: true, z: m.z, via: m.via};
        const cb = C.com && loaded(C.com.id);
        if (base.communes && m.why === 'homonymes') return {why: 'homonymes', msg: homonymsMsg(base, s)};
        // une zone d'un autre niveau (le nom exact d'une zone l'emporte sur une commune du même nom : « Bretagne »)
        for (const L of C.levels) {
            if (L.cur || L.lv === 'com') continue; const b = loaded(L.id), z = b && matchZone(b, s); if (!z) continue;
            if (L.word[1] < C.here.word[1]) return {auto: {L, b, z}}; // plus fin que la carte : compte dans sa zone
            return {why: 'niveau', msg: `${z.name} est ${L.word[4]}, mais la carte montre le niveau « ${C.here.name} » : choisis ${C.here.word[4]} dans la liste, ou change le niveau de détail (Réglages).`};
        }
        if (cb && !base.communes) { const mc = matchCommune(cb, s); if (mc.z) return {auto: {L: C.com, b: cb, z: mc.z}}; if (mc.why === 'homonymes') return {why: 'homonymes', msg: homonymsMsg(cb, s)}; }
        return {why: 'inconnu', msg: `Pas trouvé sur cette carte : vérifie l’orthographe, ou choisis dans la liste.`, pending: !!(C.com && !cb && /[a-z]{2}/i.test(fold(s)))};
    }
    /** les pastilles orange (lignes ambiguës ou inconnues) et la phrase « N villes comptent dans leur département » */
    async function refreshZoneCells(pane, api) {
        const spec = api.spec(); if (spec.kind !== 'choropleth') return;
        const C = zoneCtx(spec);
        await Promise.all([...C.levels.filter(L => L.lv !== 'com' || L.cur).map(L => L.id), C.M.zoneBase].filter(Boolean).map(id => load(id).catch(() => {})));
        if (api.spec() !== spec) return;
        let changed = false, pending = false, viaCom = 0;
        pane.querySelectorAll('input[data-dgm-zone]').forEach(inp => {
            let st = rowStatus(spec, inp.value);
            if (st.auto) { rememberPick(spec, inp.value.trim(), st.auto); changed = true; st = rowStatus(spec, inp.value); } // une ville tapée à la main : retenue comme si on l'avait choisie
            if (st.via === 'com' && C.here.lv !== 'com') viaCom++;
            if (st.pending) pending = true;
            const dot = inp.parentElement.querySelector('[data-dgm-dot]'); if (!dot) return;
            dot.hidden = !st.why; inp.classList.toggle('dgm-zbad', !!st.why);
            if (st.why) { dot.title = st.msg; dot.setAttribute('aria-label', st.msg); dot.dataset.why = st.why; }
        });
        const hint = pane.querySelector('[data-dgm-zhint]');
        if (hint) { hint.hidden = !viaCom; if (viaCom) hint.innerHTML = `🏘 ${viaCom > 1 ? `${viaCom} villes comptent dans ${esc(C.here.word[3])}` : `1 ville compte dans ${esc(C.here.word[2])}`} sur cette carte (niveau « ${esc(C.here.name)} »).${C.com ? ` <button type="button" class="link-button" data-dgm-tocom>Colorer les villes elles-mêmes</button>` : ''}`; }
        if (changed) api.changed();
        if (pending && C.com && !store.get(C.com.id)?.error) load(C.com.id).then(() => { if (pane.isConnected) refreshZoneCells(pane, api); }).catch(() => {});
    }
    /* la liste qui s'ouvre sous la case (fixée à la fenêtre : le tableau défile dans sa boîte) */
    let AC = null, acSeq = 0, escAt = 0;
    function acClose() { if (!AC) return; AC.input.setAttribute('aria-expanded', 'false'); AC.input.removeAttribute('aria-activedescendant'); AC.el.remove(); AC = null; }
    function acPlace() {
        if (!AC) return; if (!AC.input.isConnected) return acClose();
        const r = AC.input.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, w = Math.min(vw - 16, Math.max(r.width + 40, 380));
        const left = clamp(r.left, 8, Math.max(8, vw - w - 8)), below = vh - r.bottom, up = below < 280 && r.top > below;
        Object.assign(AC.el.style, {left: left + 'px', width: w + 'px', top: up ? '' : (r.bottom + 4) + 'px', bottom: up ? (vh - r.top + 4) + 'px' : ''});
        AC.el.querySelector('.pk-list').style.maxHeight = Math.max(160, Math.min(380, (up ? r.top : below) - 16)) + 'px';
    }
    const hl = (t, q) => { const i = String(t).toLowerCase().indexOf(String(q).trim().toLowerCase()); return i < 0 || !String(q).trim() ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + String(q).trim().length)) + '</mark>' + esc(t.slice(i + String(q).trim().length)); };
    function acRender(input, items, {loading, C, q}) {
        const host = input.closest('dialog') || document.body;
        if (!AC || AC.input !== input) { acClose(); const el = document.createElement('div'); el.className = 'pk dgm-ac'; el.innerHTML = '<div class="pk-list is-static"></div>'; host.appendChild(el);
            el.addEventListener('mousedown', e => e.preventDefault()); // la case garde la main
            el.addEventListener('click', e => { const it = e.target.closest('[data-i]'); if (it) acPick(Number(it.dataset.i)); const b = e.target.closest('[data-dgm-tocom]'); if (b) toCommunes(); });
            AC = {el, input, items: [], on: 0}; input.setAttribute('aria-expanded', 'true'); }
        AC.on = !items.length ? -1 : AC.q !== q || AC.on < 0 ? 0 : Math.min(AC.on, items.length - 1); AC.items = items; AC.q = q; AC.C = C; // nouveau texte : le premier choix
        const lid = 'dgm-ac-' + (input.dataset.r || 0), hasCom = items.some(it => it.L.lv === 'com');
        AC.el.querySelector('.pk-list').innerHTML = `<div class="pk-scroll" role="listbox" id="${lid}" aria-label="Zones proposées">${items.map((it, i) => `<div class="pk-item${i === AC.on ? ' on' : ''}" role="option" id="${lid}-${i}" data-i="${i}" aria-selected="${i === AC.on}">
                <span class="pk-ic dgm-ac-ic" aria-hidden="true">${it.icon}</span><span class="pk-txt"><span class="pk-name">${hl(it.title, String(q).replace(/\s*[(,].*$/, ''))}</span>${it.meta ? `<span class="pk-meta">${esc(it.meta)}</span>` : ''}</span>
                <span class="pk-badge2${it.cur ? ' blue' : ''}">${esc(it.kind)}</span></div>`).join('')}
            ${!items.length && !loading ? '<div class="pk-empty">Rien de ce nom sur cette carte.</div>' : ''}</div>
            ${loading ? '<div class="pk-loading" data-dgm-acload><span class="pk-spin"></span> chargement des communes…</div>' : ''}
            <div class="pk-hint">${hasCom && C.here.lv !== 'com' ? `🏘 Une ville compte dans ${esc(C.here.word[2])} sur cette carte. <button type="button" class="link-button" data-dgm-tocom>Colorer les villes elles-mêmes</button>` : '↑ ↓ pour choisir · Entrée pour valider · Échap pour fermer'}</div>`;
        input.setAttribute('aria-controls', lid); if (AC.on >= 0) input.setAttribute('aria-activedescendant', `${lid}-${AC.on}`); else input.removeAttribute('aria-activedescendant');
        acPlace();
    }
    async function acOpen(input, pane, api) {
        const q = input.value.trim(), spec = api.spec(), tok = ++acSeq; if (!q) return acClose();
        const C = zoneCtx(spec);
        await Promise.all([...C.levels.filter(L => L.lv !== 'com').map(L => L.id), C.M.zoneBase, C.map === 'fr' ? 'fr-regions' : ''].filter(Boolean).map(id => load(id).catch(() => {})));
        if (tok !== acSeq || document.activeElement !== input) return;
        const wantCom = !!C.com && (/[a-z]{2}/.test(fold(q)) || /^\d{3,}/.test(q)), loading = wantCom && !loaded(C.com.id) && !store.get(C.com.id)?.error;
        if (loading) load(C.com.id).then(() => { if (AC?.input === input && document.activeElement === input) acOpen(input, pane, api); refreshZoneCells(pane, api); }).catch(() => { if (AC?.input === input) acOpen(input, pane, api); });
        acRender(input, zoneSuggest(spec, q), {loading, C, q});
    }
    function acMove(d) { if (!AC?.items.length) return; AC.on = (AC.on + d + AC.items.length) % AC.items.length; AC.el.querySelectorAll('.pk-item').forEach((el, i) => { el.classList.toggle('on', i === AC.on); el.setAttribute('aria-selected', String(i === AC.on)); if (i === AC.on) el.scrollIntoView({block: 'nearest'}); }); AC.input.setAttribute('aria-activedescendant', `${AC.input.getAttribute('aria-controls')}-${AC.on}`); }
    let picking = false, zonePane = null;
    function acPick(i, next = false) {
        const it = AC?.items[i]; if (!it || !zonePane) return; const input = AC.input, api = zonePane._dgmZApi, spec = api.spec();
        picking = true; input.value = it.value; input.dispatchEvent(new Event('input', {bubbles: true})); picking = false; // le tableau (et le dessin) suivent
        if (it.remember) rememberPick(spec, it.value, it); else prunePlaces(spec);
        api.changed(); acClose(); refreshZoneCells(zonePane, api);
        if (next) input.closest('tr')?.querySelector('input.is-num')?.focus();
    }
    function toCommunes() { if (!zonePane) return; const api = zonePane._dgmZApi; acClose(); api.set({level: 'com'}); setTimeout(() => refreshZoneCells(zonePane, api), 0); A()?.toast?.('Niveau « Communes » : chaque ville a sa couleur.'); }
    /** l'onglet Données de la carte colorée : chaque case « Zone » devient un champ à propositions */
    function dataPane(pane, api) {
        acClose();
        if (api.spec().kind !== 'choropleth') return;
        pane._dgmZApi = api; zonePane = pane;
        const sec = pane.querySelector('[data-grid="0"]'); if (!sec) return;
        sec.querySelectorAll('input[data-k="label"]').forEach(inp => {
            Object.assign(inp.dataset, {dgmZone: '1'}); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
            if (!inp.placeholder) inp.placeholder = 'Tape un nom ou un code…';
            const td = inp.parentElement; td.classList.add('dgm-zcell'); td.insertAdjacentHTML('beforeend', '<button type="button" class="dgm-zdot" data-dgm-dot hidden></button>');
        });
        sec.querySelector('.h-dg-tablewrap')?.insertAdjacentHTML('beforebegin', '<p class="dgm-zhint" data-dgm-zhint hidden></p>');
        if (!pane._dgmZBound) {
            pane._dgmZBound = true;
            const zin = e => e.target?.matches?.('input[data-dgm-zone]') && pane._dgmZApi?.spec().kind === 'choropleth' ? e.target : null;
            pane.addEventListener('input', e => { const inp = zin(e); if (inp && !picking) acOpen(inp, pane, pane._dgmZApi); });
            pane.addEventListener('keydown', e => {
                const inp = zin(e); if (!inp) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (AC?.input === inp) acMove(e.key === 'ArrowDown' ? 1 : -1); else acOpen(inp, pane, pane._dgmZApi); }
                else if (e.key === 'Enter' && AC?.input === inp && AC.on >= 0) { e.preventDefault(); acPick(AC.on, true); }
                else if (e.key === 'Escape' && AC?.input === inp) { e.preventDefault(); e.stopPropagation(); escAt = Date.now(); acClose(); }
                else if (e.key === 'Tab') acClose();
            });
            pane.addEventListener('focusout', e => { const inp = zin(e); if (!inp) return; setTimeout(() => { if (document.activeElement === inp) return; if (AC?.input === inp) acClose(); if (pane.isConnected) refreshZoneCells(pane, pane._dgmZApi); }, 150); });
            pane.addEventListener('click', e => {
                const dot = e.target.closest('[data-dgm-dot]'); if (dot) { const inp = dot.parentElement.querySelector('input[data-dgm-zone]'); if (inp) { inp.focus(); acOpen(inp, pane, pane._dgmZApi); } return; }
                if (e.target.closest('[data-dgm-tocom]')) toCommunes();
            });
            pane.addEventListener('scroll', acPlace, true); window.addEventListener('resize', acPlace);
            // Échap ferme la liste, pas l'éditeur
            pane.closest('dialog')?.addEventListener('cancel', e => { if (Date.now() - escAt < 300) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
        }
        refreshZoneCells(pane, api);
    }

    /* ═════════ L'enregistrement des deux sortes ═════════ */
    const KINDS = {
        choropleth: {icon: '🗺️', label: 'Carte colorée par zones (départements, régions, pays…)', group: 'Cartes', render: remember(choropleth), noLegend: true,
            grids: [{key: 'rows', label: 'Les zones et leurs chiffres', series: 1, cols: [C('label', 'Zone (nom ou code : 35, FRH03, BE, Vaud…)'), C('note', 'Note (dans la bulle)')]}],
            options: CHORO_OPTS, sample: CHORO_SAMPLE, resolve, afterDraw, fromApp: FROM_APP, dataPane,
            describe: spec => `Carte colorée : ${rowsOf(spec).length} zones (${MAPS[mapOf(spec.o || {})].label}, ${levelOf(spec.o || {})[2].toLowerCase()}).`},
        flowmap: {icon: '🧭', label: 'Carte des migrations (flèches d’un lieu à un autre)', group: 'Cartes', render: remember(flowmap), noLegend: true,
            grids: [{key: 'rows', label: 'Les flux (départ → arrivée)', cols: [C('from', 'Départ (lieu)'), C('to', 'Arrivée (lieu)'), C('value', 'Combien', 'number'), C('color', 'Couleur', 'color')]}],
            options: FLOW_OPTS, sample: FLOW_SAMPLE, resolve, afterDraw, fromApp: FROM_APP,
            describe: spec => `Carte des migrations : ${rowsOf(spec).length} flux.`},
        bubblemap: {icon: '⚪', label: 'Carte à symboles proportionnels (ronds par lieu)', group: 'Cartes', render: remember(bubblemap), noLegend: true,
            grids: [{key: 'rows', label: 'Les lieux (ou zones) et leurs chiffres', series: 1, cols: [C('label', 'Lieu ou zone (« Rennes », « Rennes 48.11, -1.68 », « 35 »…)'), C('note', 'Note (dans la bulle)')]}],
            options: BUBBLE_OPTS, sample: BUBBLE_SAMPLE, resolve, afterDraw, fromApp: FROM_APP,
            describe: spec => `Carte à symboles proportionnels : ${rowsOf(spec).length} lieux.`},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (!DR.KINDS[k]) DR.KINDS[k] = kind; }
    ext.diagramCartes = {MAPS, FRAMES_WORLD, FRAMES_FR, load, loaded, decode, makeProj, fitProj, matchZone, matchCommune, joinRows, zoneOfRow, zoneSuggest, rowStatus, rememberPick, zoneOfPlace, placeOf, flowsOf, breaksOf, scaleOf, resolve, parseLive, liveKey, inZone, idfOf, SRC_GROUPS, bubblesOf,
        // pour les cartes de heritage-diagram-cartes2.js (points, hexagones, cartogramme, carte qui raconte) : mêmes fonds, mêmes projections
        mapOf, levelOf, viewOf, baseIdOf, ctxIdOf, needBases, drawBase, attrOf, autoProj, fitView, mapOpts, remember, afterDraw, fillZones, communeOfPlace, zoneAt, RAMPS, rampAt, SEA, LAND, FROM_APP};
})();
