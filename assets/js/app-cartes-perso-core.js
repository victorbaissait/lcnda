/* LCNDA — 🗺 Mes cartes : les calculs sans écran (aussi require() dans Node, tests/test-cartes-perso.js).
 * Définition d'une carte : {v, bg, legend, view: {lat, lon, zoom} | null, time: {from, to, mode: 'cumul'|'window', win, secs},
 *   layers: [{id, kind, name, visible, f: {filtres}, s: {style}}]} — mêmes règles que mcp_clean_def (lib/cartes_perso.php).
 * Formes rendues par le serveur : {g: 'p'|'l'|'z', c, y, y1, ys, t, s, lab, p, pl, m, img, k (certitude 0–1), cone: [angle, ouverture, km], cat, grp, h, n, arrow}.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LCNDA_CARTES_PERSO = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    /** [clé, icône, nom, couleur, forme, aide] — même liste que MCP_KINDS (lib/cartes_perso.php) */
    const KINDS = [
        ['births', '👶', 'Naissances', '#2b8a3e', 'circle', 'Naissances et baptêmes.'],
        ['marriages', '💍', 'Mariages', '#c2255c', 'diamond', 'Mariages, contrats et fiançailles.'],
        ['deaths', '✝', 'Décès', '#495057', 'square', 'Les lieux de décès.'],
        ['burials', '⚱', 'Inhumations et tombes', '#7048e8', 'square', 'Inhumations, crémations et tombes placées (GPS).'],
        ['residences', '🏠', 'Résidences', '#1971c2', 'circle', 'Les lieux où ils ont habité.'],
        ['census', '📋', 'Recensements', '#0b7285', 'triangle', 'Les foyers recensés.'],
        ['events', '📅', 'Événements (choisis)', '#e8590c', 'circle', 'Les sortes d’événements que tu choisis.'],
        ['moves', '➜', 'Migrations et voyages', '#d9480f', 'circle', 'De la naissance au décès, et les voyages notés.'],
        ['life', '🧭', 'Lieux de vie d’une personne', '#f08c00', 'circle', 'Les étapes d’une ou plusieurs vies, dans l’ordre.'],
        ['surnames', '🔤', 'Patronymes', '#5f3dc4', 'circle', 'Où sont nés ceux qui portent ces noms.'],
        ['trades', '🔨', 'Métiers', '#c2611a', 'square', 'Les professions notées, à leur lieu.'],
        ['houses', '🏡', 'Maisons', '#8a6a2f', 'pin', 'Les maisons de famille.'],
        ['placeimages', '🖼', 'Images de lieux', '#0ca678', 'pin', 'Photos et cartes postales de lieux : points, zones, hypothèses, angle de vue.'],
        ['monuments', '🎖', 'Monuments aux morts', '#b42318', 'star', 'Les morts pour la France, au monument de leur commune.'],
        ['sources', '📚', 'Sources', '#364fc7', 'square', 'Où les sources citées ont été trouvées.'],
        ['media', '📷', 'Médias placés', '#1098ad', 'pin', 'Photos avec une position GPS ou rangées sur un lieu.'],
        ['animals', '🐾', 'Animaux suivis', '#2f9e44', 'circle', 'Observations et trajets GPS.'],
        ['history', '🏛', 'Événements historiques', '#862e9c', 'star', 'Les événements de l’histoire placés sur un lieu.'],
        ['drawn', '✏️', 'Mes couches dessinées ou importées', '#d9480f', 'circle', 'Zones, itinéraires et points de « ✏️ Mes couches » (GeoJSON, KML).'],
    ];
    const KIND = Object.fromEntries(KINDS.map(([key, icon, name, color, shape, help]) => [key, {key, icon, name, color, shape, help}]));
    const SHAPES = [['circle', '● Rond'], ['square', '■ Carré'], ['diamond', '◆ Losange'], ['triangle', '▲ Triangle'], ['star', '★ Étoile'], ['pin', '📍 Épingle'], ['cross', '✚ Croix']];
    const CERT_EVENTS = [['certain', 'Certain'], ['deduced', 'Déduit'], ['estimated', 'Estimé'], ['doubt', 'Douteux'], ['unknown', 'Non précisé']];
    const CERT_IMAGES = [['certain', 'Certain'], ['probable', 'Probable'], ['possible', 'Possible'], ['verify', 'À vérifier']];
    const CERT_KEYS = ['certain', 'deduced', 'estimated', 'doubt', 'unknown', 'probable', 'possible', 'verify'];
    /** les filtres utiles pour chaque sorte (les autres ne sont pas montrés) */
    const FILTERS = {
        persons: ['births', 'marriages', 'deaths', 'burials', 'residences', 'census', 'events', 'moves', 'life', 'surnames', 'trades', 'monuments', 'sources', 'media'],
        cert: ['births', 'marriages', 'deaths', 'burials', 'residences', 'events', 'placeimages'],
        types: ['events'], text: ['surnames', 'trades'], pets: ['animals'], layers: ['drawn'], voyages: ['moves'], retained: ['placeimages'],
    };
    const has = (kind, filter) => (FILTERS[filter] || []).includes(kind);
    const PALETTE = ['#1971c2', '#e8590c', '#2b8a3e', '#c2255c', '#7048e8', '#0b7285', '#f08c00', '#5c940d', '#862e9c', '#d9480f', '#364fc7', '#a61e4d'];

    const isF = Number.isFinite;
    const clamp = (v, a, b, d) => { const n = Number(v); return isF(n) ? Math.max(a, Math.min(b, n)) : d; };
    const text = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
    const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
    const ids = (v, max = 200) => [...new Set((Array.isArray(v) ? v : []).slice(0, max).map(x => Math.trunc(Number(x && typeof x === 'object' ? x.id : x))).filter(n => n > 0))];

    /** années d'un texte de date (C4) → [de, à] */
    function yearsOf(t) {
        t = String(t || '').toLowerCase().trim();
        if (!t) return [null, null];
        const ys = (t.match(/(?<!\d)\d{3,4}(?!\d)/g) || []).map(Number);
        if (!ys.length) return [null, null];
        if (/^(avant|av\.?|jusqu)/.test(t)) return [null, ys[0]];
        if (/^(apr[eè]s|ap\.?|depuis|à partir)/.test(t)) return [ys[0], null];
        return [Math.min(...ys), Math.max(...ys)];
    }
    /** « Du … au … » → [de, à] (même règle que mcp_range) */
    function range(from, to) {
        from = String(from || ''); to = String(to || '');
        const [a0, a1] = yearsOf(from), [b0, b1] = yearsOf(to);
        let hi = null;
        if (from && (a0 === null || a1 !== a0 || /\b(entre|et)\b|[–-]/.test(from))) hi = a1;
        if (to) hi = b1 ?? b0;
        return [a0, hi];
    }

    function cleanLayer(l, i = 0) {
        if (!l || typeof l !== 'object' || !KIND[l.kind]) return null;
        const K = KIND[l.kind], f = l.f && typeof l.f === 'object' ? l.f : {}, s = l.s && typeof l.s === 'object' ? l.s : {};
        return {
            id: typeof l.id === 'string' && /^[a-z0-9_-]{1,24}$/i.test(l.id) ? l.id : `l${i + 1}`,
            kind: l.kind, name: text(l.name, 80) || K.name, visible: l.visible !== false,
            f: {from: text(f.from, 60), to: text(f.to, 60), undated: f.undated !== false, persons: ids(f.persons), rel: ['self', 'asc', 'desc', 'both'].includes(f.rel) ? f.rel : 'self',
                gens: Math.round(clamp(f.gens, 1, 40, 4)), sosa: !!f.sosa, sosaGens: Math.round(clamp(f.sosaGens, 0, 40, 0)), branch: Math.round(clamp(f.branch, 0, 1e12, 0)),
                side: ['', 'father', 'mother'].includes(f.side) ? f.side : '', labels: ids(f.labels, 40), gender: ['', 'male', 'female', 'unknown'].includes(f.gender) ? f.gender : '',
                place: Math.round(clamp(f.place, 0, 1e12, 0)), radius: clamp(f.radius, 0.1, 2000, 15), zone: Math.round(clamp(f.zone, 0, 1e12, 0)),
                cert: (Array.isArray(f.cert) ? f.cert : []).filter(c => CERT_KEYS.includes(c)), types: ids(f.types, 80), text: text(f.text, 120), pets: ids(f.pets, 80),
                layers: ids(f.layers, 80), retained: !!f.retained, voyages: f.voyages !== false},
            s: {color: color(s.color, K.color), shape: SHAPES.some(x => x[0] === s.shape) ? s.shape : K.shape, size: Math.round(clamp(s.size, 4, 40, 10)), opacity: Math.round(clamp(s.opacity, 10, 100, 90)),
                cluster: s.cluster !== false, heat: !!s.heat, labels: !!s.labels, byCat: !!s.byCat, lines: s.lines !== false, cones: s.cones !== false},
        };
    }
    function cleanDef(d) {
        d = d && typeof d === 'object' ? d : {};
        const v = d.view && isF(Number(d.view.lat)) && isF(Number(d.view.lon)) ? {lat: clamp(d.view.lat, -85, 85, 46.7), lon: clamp(d.view.lon, -180, 180, 2.3), zoom: Math.round(clamp(d.view.zoom, 2, 19, 6))} : null;
        const t = d.time && typeof d.time === 'object' ? d.time : {};
        const layers = (Array.isArray(d.layers) ? d.layers : []).slice(0, 24).map(cleanLayer).filter(Boolean);
        // deux couches ne partagent jamais le même identifiant
        const seen = new Set(); layers.forEach((l, i) => { while (seen.has(l.id)) l.id = `l${i + 1}${Math.random().toString(36).slice(2, 5)}`; seen.add(l.id); });
        return {v: 1, bg: typeof d.bg === 'string' && /^[a-z0-9_-]{1,40}$/.test(d.bg) ? d.bg : '', legend: d.legend !== false, view: v,
            time: {from: text(t.from, 60), to: text(t.to, 60), mode: t.mode === 'window' ? 'window' : 'cumul', win: Math.round(clamp(t.win, 1, 200, 10)), secs: Math.round(clamp(t.secs, 3, 120, 12))}, layers};
    }
    /** une couche neuve de cette sorte (identifiant libre dans la carte) */
    function newLayer(kind, def) {
        const used = new Set((def?.layers || []).map(l => l.id)); let n = (def?.layers || []).length + 1;
        while (used.has(`l${n}`)) n++;
        return cleanLayer({kind, id: `l${n}`}, n - 1);
    }
    /** la définition sans ce qui n'est que pour l'écran (pour le serveur) */
    const forServer = def => cleanDef(def);

    /** l'étendue des années d'une carte : la période choisie, sinon celle des données */
    function yearsSpan(def, data) {
        const [a, b] = range(def?.time?.from, def?.time?.to);
        const d = data?.years || null;
        const lo = a ?? d?.[0] ?? null, hi = b ?? d?.[1] ?? null;
        if (lo === null || hi === null) return null;
        return lo <= hi ? [lo, hi] : [hi, lo];
    }
    /** une forme au temps t du curseur : null = cachée ; une ligne avec des années par sommet est coupée là où on en est */
    function atTime(ft, t, mode = 'cumul', win = 10) {
        if (t === null || t === undefined) return ft;
        const y = isF(ft.y) ? ft.y : null, y1 = isF(ft.y1) ? ft.y1 : y;
        if (y === null) return ft; // sans date : toujours là
        const lo = mode === 'window' ? t - win : -Infinity;
        if (y > t || (y1 !== null && y1 < lo)) return null;
        if (ft.g === 'l' && Array.isArray(ft.ys) && ft.ys.length === ft.c.length) {
            let k = 0; while (k < ft.c.length && (ft.ys[k] === null || ft.ys[k] <= t)) k++;
            if (k < 2) return null;
            if (k < ft.c.length) return {...ft, c: ft.c.slice(0, k), ys: ft.ys.slice(0, k), _cut: true};
        }
        return ft;
    }
    /** combien de formes de chaque couche sont visibles au temps t (légende, test) */
    function countAt(def, data, t) {
        const out = {};
        (def?.layers || []).forEach(l => { const d = (data?.layers || []).find(x => x.id === l.id); out[l.id] = (d?.features || []).filter(f => atTime(f, t, def.time?.mode, def.time?.win)).length; });
        return out;
    }

    /** regroupement des points proches à l'écran (grille de cellPx pixels) → [{x, y, items}] */
    function cluster(points, cellPx = 44) {
        const cells = new Map();
        points.forEach(p => { const k = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`; let c = cells.get(k); if (!c) { c = {sx: 0, sy: 0, items: []}; cells.set(k, c); } c.sx += p.x; c.sy += p.y; c.items.push(p); });
        return [...cells.values()].map(c => ({x: c.sx / c.items.length, y: c.sy / c.items.length, items: c.items}));
    }
    /** le chemin SVG d'un symbole */
    function shapePath(shape, x, y, r) {
        const f = n => Math.round(n * 10) / 10;
        if (shape === 'square') return `M${f(x - r)} ${f(y - r)}h${f(2 * r)}v${f(2 * r)}h${f(-2 * r)}Z`;
        if (shape === 'diamond') return `M${f(x)} ${f(y - r * 1.25)}L${f(x + r * 1.25)} ${f(y)}L${f(x)} ${f(y + r * 1.25)}L${f(x - r * 1.25)} ${f(y)}Z`;
        if (shape === 'triangle') return `M${f(x)} ${f(y - r * 1.3)}L${f(x + r * 1.2)} ${f(y + r * .9)}L${f(x - r * 1.2)} ${f(y + r * .9)}Z`;
        if (shape === 'star') { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .5 : r * 1.3; d += `${i ? 'L' : 'M'}${f(x + Math.cos(a) * rr)} ${f(y + Math.sin(a) * rr)}`; } return d + 'Z'; }
        if (shape === 'pin') return `M${f(x)} ${f(y)}C${f(x - r * .3)} ${f(y - r * .9)} ${f(x - r * 1.1)} ${f(y - r * 1.2)} ${f(x - r * 1.1)} ${f(y - r * 2)}A${f(r * 1.1)} ${f(r * 1.1)} 0 1 1 ${f(x + r * 1.1)} ${f(y - r * 2)}C${f(x + r * 1.1)} ${f(y - r * 1.2)} ${f(x + r * .3)} ${f(y - r * .9)} ${f(x)} ${f(y)}Z`;
        if (shape === 'cross') { const t = r * .38; return `M${f(x - t)} ${f(y - r)}h${f(2 * t)}v${f(r - t)}h${f(r - t)}v${f(2 * t)}h${f(t - r)}v${f(r - t)}h${f(-2 * t)}v${f(t - r)}h${f(t - r)}v${f(-2 * t)}h${f(r - t)}Z`; }
        return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
    }
    /** le cône de prise de vue : [lon, lat] du point, angle (0 = nord), ouverture (degrés), portée (km) → anneau [lon, lat] */
    function cone(lon, lat, bearing, fov = 50, km = .35) {
        const out = [[lon, lat]], k = Math.cos(lat * Math.PI / 180) || 1e-6, n = 12;
        for (let i = 0; i <= n; i++) {
            const a = (bearing - fov / 2 + fov * i / n) * Math.PI / 180;
            out.push([lon + Math.sin(a) * km / (111.32 * k), lat + Math.cos(a) * km / 111.32]);
        }
        out.push([lon, lat]);
        return out;
    }
    /** la couleur d'une catégorie (« colorer par sorte ») */
    function catColors(features) {
        const m = new Map(); features.forEach(f => { if (f.cat && !m.has(f.cat)) m.set(f.cat, PALETTE[m.size % PALETTE.length]); });
        return m;
    }
    /** la légende : une ligne par couche visible (et ses catégories si elle est colorée par sorte) */
    function legend(def, data, t = null) {
        const counts = countAt(def, data, t);
        return (def?.layers || []).filter(l => l.visible !== false).map(l => {
            const d = (data?.layers || []).find(x => x.id === l.id);
            const cats = l.s.byCat ? [...catColors(d?.features || []).entries()].slice(0, 12).map(([name, c]) => ({name, color: c})) : [];
            return {id: l.id, kind: l.kind, icon: KIND[l.kind]?.icon || '', name: l.name, color: l.s.color, shape: l.s.shape, n: counts[l.id] || 0, cats, heat: l.s.heat, note: d?.note || ''};
        });
    }

    /** ⤓ GeoJSON : une collection, chaque forme avec sa couche, ses années, sa certitude et les couleurs « simplestyle » */
    function toGeoJSON(def, data, {name = ''} = {}) {
        const features = [];
        (def?.layers || []).filter(l => l.visible !== false).forEach(l => {
            const d = (data?.layers || []).find(x => x.id === l.id); if (!d) return;
            const cc = l.s.byCat ? catColors(d.features) : null;
            d.features.forEach(f => {
                const col = f.col || (cc && cc.get(f.cat)) || l.s.color;
                const geometry = f.g === 'p' ? {type: 'Point', coordinates: f.c} : f.g === 'l' ? {type: 'LineString', coordinates: f.c} : {type: 'Polygon', coordinates: f.c};
                const props = {layer: l.name, kind: l.kind, name: f.t || '', description: [f.s, f.lab].filter(Boolean).join(' · '), year: f.y ?? null, year_end: f.y1 ?? null,
                    category: f.cat || '', certainty: f.k ?? null, status: f.h || '', 'marker-color': col, stroke: col, fill: col, 'fill-opacity': f.g === 'z' ? +(0.25 * (f.k ?? 1)).toFixed(2) : undefined};
                Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);
                features.push({type: 'Feature', geometry, properties: props});
                if (f.cone && f.g === 'p' && l.s.cones) features.push({type: 'Feature', geometry: {type: 'Polygon', coordinates: [cone(f.c[0], f.c[1], f.cone[0], f.cone[1], f.cone[2])]}, properties: {layer: l.name, kind: 'cone', name: `Angle de vue · ${f.t || ''}`, fill: col, 'fill-opacity': 0.18, stroke: col}});
            });
        });
        return {type: 'FeatureCollection', name: name || 'Ma carte', features};
    }
    /** pour ⤓ KML (app-cartes-outils-core.js : toKML) : une couche « Mes couches » par couche de la carte */
    function toLayers(def, data) {
        return (def?.layers || []).filter(l => l.visible !== false).map(l => {
            const d = (data?.layers || []).find(x => x.id === l.id) || {features: []};
            return {name: l.name, color: l.s.color, features: d.features.map(f => ({type: 'Feature',
                geometry: f.g === 'p' ? {type: 'Point', coordinates: f.c} : f.g === 'l' ? {type: 'LineString', coordinates: f.c} : {type: 'Polygon', coordinates: f.c},
                properties: {kind: f.g === 'p' ? 'point' : f.g === 'l' ? 'route' : 'zone', name: f.t || '', note: [f.s, f.lab, f.y ? String(f.y) : ''].filter(Boolean).join(' · '), color: f.col || ''}}))};
        });
    }
    /** l'emprise [ouest, sud, est, nord] des formes visibles */
    function bounds(def, data) {
        let b = null;
        const add = ([x, y]) => { if (!isF(x) || !isF(y)) return; b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y]; };
        (def?.layers || []).filter(l => l.visible !== false).forEach(l => (data?.layers || []).find(x => x.id === l.id)?.features.forEach(f => { if (f.g === 'p') add(f.c); else if (f.g === 'l') f.c.forEach(add); else f.c[0].forEach(add); }));
        return b;
    }
    return {KINDS, KIND, SHAPES, CERT_EVENTS, CERT_IMAGES, FILTERS, has, PALETTE, yearsOf, range, cleanDef, cleanLayer, newLayer, forServer, yearsSpan, atTime, countAt, cluster, shapePath, cone, catColors, legend, toGeoJSON, toLayers, bounds};
});
