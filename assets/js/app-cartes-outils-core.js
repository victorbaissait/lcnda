/* LCNDA — 🧭 Cartes : les calculs sans écran (aussi pour Node : require()).
 *  - distances (grand cercle) et temps de trajet d'autrefois : à pied, à cheval, en diligence, en bateau (rivière, mer),
 *    en train, selon l'année ; vitesses historiques sourcées (SOURCES), réglables (settings) ; phrase
 *    « Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 » ; étapes d'une vie (legs) ;
 *  - grande carte à imprimer : formats A3 → A0, pixels bornés (posterPixels) ;
 *  - mes couches : nettoyage (cleanLayer), GeoJSON et KML dans les deux sens (toGeoJSON, fromGeoJSON, toKML, fromKML).
 * Utilisé par assets/js/heritage-cartes-outils.js ; essayé par tests/test-cartes-plus-2.js.
 */
(function (root) {
    'use strict';
    const R = 6371.0088;
    const RAD = Math.PI / 180;
    const isF = Number.isFinite;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const NF0 = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 0});
    const NF1 = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1});

    /** distance à vol d'oiseau (km), formule de haversine */
    function km(a, b) {
        const la1 = Number(a?.lat), lo1 = Number(a?.lon), la2 = Number(b?.lat), lo2 = Number(b?.lon);
        if (![la1, lo1, la2, lo2].every(isF)) return null;
        const dLa = (la2 - la1) * RAD, dLo = (lo2 - lo1) * RAD;
        const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dLo / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    const fmtKm = n => !isF(n) ? '' : n < 10 ? `${NF1.format(n)} km` : `${NF0.format(Math.round(n))} km`;

    /* ═════════ Les vitesses d'autrefois (ordres de grandeur, France et Europe de l'Ouest) ═════════ */
    const SOURCES = {
        braudel: 'Fernand Braudel, « Civilisation matérielle, économie et capitalisme » (1979) et « L’identité de la France » (1986) : à pied, 30 à 40 km par jour ; à cheval, 50 à 60 km par jour pour un voyageur qui garde sa monture.',
        etape: 'Règlements militaires (XVIIIᵉ–XIXᵉ s.) : l’étape ordinaire d’une troupe à pied est de 24 à 28 km par jour ; un marcheur seul fait davantage.',
        arbellot: 'Guy Arbellot, « La grande mutation des routes de France au milieu du XVIIIᵉ siècle », Annales ESC, 1973, et « Atlas de la Révolution française », t. 1 « Routes et communications » (1987) : les temps de parcours depuis Paris sont presque divisés par deux entre 1765 et 1780 (turgotines).',
        studeny: 'Christophe Studeny, « L’invention de la vitesse. France, XVIIIᵉ–XXᵉ siècle » (Gallimard, 1995) : diligences des Messageries roulant jour et nuit vers 1830, malles-poste à près de 10 km/h vers 1845.',
        caron: 'François Caron, « Histoire des chemins de fer en France », t. 1 (1997) : première ligne de voyageurs en 1837 (Paris – Saint-Germain), grandes lignes ouvertes de 1840 à 1860, environ 40 km/h de moyenne arrêts compris vers 1860.',
        mer: 'Traversées de l’Atlantique Nord : 30 à 45 jours à la voile ; 12 à 14 jours en vapeur vers 1860 ; 6 à 7 jours vers 1900 ; 4 à 5 jours pour les grands paquebots des années 1930.',
        riviere: 'Coches d’eau et halage : 20 à 40 km par jour en remontant, davantage en descendant ; premiers bateaux à vapeur sur la Saône et le Rhône vers 1830.',
    };
    /* chaque moyen : [année, km/h en roulant, km par jour de voyage] ; entre deux années, on interpole ; avant la première, pas encore là */
    const MODES = [
        {id: 'pied', icon: '🚶', label: 'à pied', name: 'À pied', route: 'road', from: -9999, table: [[-9999, 4.5, 35]], src: ['braudel', 'etape'],
            note: '4 à 5 km/h, 8 heures de marche par jour'},
        {id: 'cheval', icon: '🐎', label: 'à cheval', name: 'À cheval', route: 'road', from: -9999, table: [[-9999, 7, 55]], src: ['braudel'],
            note: 'au pas et au trot, en ménageant sa monture (un courrier qui change de cheval aux relais va deux fois plus loin)'},
        {id: 'diligence', icon: '🐴', label: 'en diligence', name: 'En diligence', route: 'road', from: 1600,
            table: [[1600, 3.5, 40], [1700, 4, 45], [1765, 4.5, 60], [1780, 6, 90], [1814, 6.5, 100], [1830, 8, 150], [1848, 9.5, 190]], src: ['arbellot', 'studeny'],
            note: 'coches puis diligences et malles-poste ; on roule de plus en plus la nuit'},
        {id: 'riviere', icon: '🛶', label: 'en bateau sur la rivière', name: 'Bateau (rivière)', route: 'river', from: -9999,
            table: [[-9999, 3, 30], [1830, 6, 60], [1900, 10, 100]], src: ['riviere'], note: 'coche d’eau, halage, puis bateaux à vapeur'},
        {id: 'mer', icon: '⛵', label: 'en bateau', name: 'Bateau (mer)', route: 'sea', from: -9999,
            table: [[-9999, 5, 120], [1800, 6.5, 150], [1840, 12, 280], [1870, 18, 420], [1900, 25, 600], [1930, 38, 900], [1960, 40, 950]], src: ['mer'],
            note: 'à la voile jusque vers 1840, puis à la vapeur'},
        {id: 'train', icon: '🚂', label: 'en train', name: 'En train', route: 'rail', from: 1837,
            table: [[1837, 30, 450], [1860, 40, 600], [1890, 50, 750], [1914, 60, 900], [1938, 75, 1100], [1960, 90, 1300], [1981, 140, 1800], [2000, 180, 2200]], src: ['caron'],
            note: 'selon les lignes ouvertes : grandes lignes de 1840 à 1860, petites lignes jusque vers 1910'},
    ];
    const ROUTES = {road: ['par la route', 1.25], river: ['par la rivière', 1.4], sea: ['par la mer', 1.15], rail: ['par le rail', 1.2]};
    const DEFAULTS = {speeds: {}, detour: {road: 1.25, river: 1.4, sea: 1.15, rail: 1.2}};
    /** les réglages remis d'aplomb : vitesses (km par jour, vide = selon l'époque) et détours (×1 à ×3) */
    function cleanSettings(s) {
        const out = {speeds: {}, detour: {...DEFAULTS.detour}};
        const sp = s && typeof s === 'object' ? s.speeds : null, dt = s && typeof s === 'object' ? s.detour : null;
        MODES.forEach(m => { const v = Number(sp?.[m.id]); if (isF(v) && v >= 1 && v <= 5000) out.speeds[m.id] = Math.round(v); });
        Object.keys(ROUTES).forEach(k => { const v = Number(dt?.[k]); if (isF(v) && v >= 1 && v <= 3) out.detour[k] = Math.round(v * 100) / 100; });
        return out;
    }
    const modeOf = id => MODES.find(m => m.id === id) || null;
    /** {kmh, kmDay, available, custom} pour un moyen et une année */
    function speedAt(mode, year, settings) {
        const m = typeof mode === 'string' ? modeOf(mode) : mode; if (!m) return null;
        const y = isF(Number(year)) && year !== null && year !== '' ? Number(year) : new Date().getFullYear();
        const t = m.table; let kmh = t[0][1], kmDay = t[0][2];
        if (y >= t[t.length - 1][0]) { kmh = t[t.length - 1][1]; kmDay = t[t.length - 1][2]; }
        else for (let i = 0; i < t.length - 1; i++) if (y >= t[i][0] && y < t[i + 1][0]) { const f = (y - t[i][0]) / (t[i + 1][0] - t[i][0]); kmh = t[i][1] + (t[i + 1][1] - t[i][1]) * f; kmDay = t[i][2] + (t[i + 1][2] - t[i][2]) * f; break; }
        const st = cleanSettings(settings), custom = st.speeds[m.id];
        if (custom) { const k = custom / kmDay; kmDay = custom; kmh = kmh * k; }
        return {kmh, kmDay, available: y >= m.from, custom: !!custom};
    }
    /** le texte d'une durée : « ≈ 40 min », « ≈ 3 h », « ≈ 1 jour et demi », « ≈ 6 semaines » */
    function durationText(hours, days) {
        if (!isF(hours) || !isF(days)) return '';
        if (days < 0.8) { if (hours < 1) return `≈ ${Math.max(5, Math.round(hours * 60 / 5) * 5)} min`; const h = Math.round(hours * 2) / 2; return `≈ ${NF1.format(h)} h`; }
        if (days < 14) { const d = Math.max(1, Math.round(days * 2) / 2), whole = Math.floor(d), half = d - whole >= .5; return `≈ ${whole} jour${whole > 1 ? 's' : ''}${half ? ' et demi' : ''}`; }
        const d = Math.round(days); return d >= 21 ? `≈ ${d} jours (${Math.round(d / 7)} semaines)` : `≈ ${d} jours`;
    }
    /** un trajet : {mode, km (vol d'oiseau), routeKm, hours, days, text, available} */
    function travel(distKm, year, modeId, settings) {
        const m = modeOf(modeId), sp = m && speedAt(m, year, settings); if (!m || !sp || !isF(distKm)) return null;
        const st = cleanSettings(settings), routeKm = distKm * (st.detour[m.route] || 1);
        const hours = routeKm / sp.kmh, days = routeKm / sp.kmDay;
        return {mode: m.id, icon: m.icon, name: m.name, label: m.label, km: distKm, routeKm, hours, days, kmh: sp.kmh, kmDay: sp.kmDay, available: sp.available, custom: sp.custom, text: durationText(hours, days)};
    }
    const allModes = (distKm, year, settings) => MODES.map(m => travel(distKm, year, m.id, settings)).filter(Boolean);
    /** le moyen le plus probable sur la terre ferme : le train s'il existe (assez loin), sinon la diligence, sinon à cheval ; à pied pour un petit trajet */
    function best(distKm, year, settings) {
        if (!isF(distKm)) return null;
        if (distKm < 12) return travel(distKm, year, 'pied', settings);
        const y = isF(Number(year)) ? Number(year) : new Date().getFullYear();
        if (y >= 1850 && distKm >= 25) return travel(distKm, y, 'train', settings);
        if (y >= 1600 && distKm >= 25) return travel(distKm, y, 'diligence', settings);
        return travel(distKm, y, distKm < 25 ? 'pied' : 'cheval', settings);
    }
    /** « Il fallait environ 4 jours pour aller de Tulle à Paris en 1820 (en diligence, ≈ 480 km de route). » */
    function sentence({from, to, year, distKm, mode = '', settings} = {}) {
        if (!isF(distKm)) return '';
        const t = mode ? travel(distKm, year, mode, settings) : best(distKm, year, settings); if (!t) return '';
        const y = isF(Number(year)) && year !== null && year !== '' ? Number(year) : null, now = new Date().getFullYear();
        const verb = y === null || y >= now - 30 ? 'Il faut' : 'Il fallait';
        const dur = t.text.replace(/^≈ /, '');
        const what = t.mode === 'mer' || t.mode === 'riviere' ? `${fmtKm(t.routeKm)} sur l’eau` : t.mode === 'train' ? `${fmtKm(t.routeKm)} de voie` : `${fmtKm(t.routeKm)} de route`;
        return `${verb} environ ${dur} pour aller ${de(from)} ${a(to)}${y !== null ? ` en ${y}` : ''} (${t.label}, ≈ ${what}).`;
    }
    // « de Tulle », « d’Auch », « du Havre » ; « à Paris », « au Havre »
    const de = n => { n = String(n || 'ce lieu'); if (/^le\s/i.test(n)) return 'du ' + n.slice(3); if (/^les\s/i.test(n)) return 'des ' + n.slice(4); return /^[aeiouyhâéèêîôûœ]/i.test(n) ? `d’${n}` : `de ${n}`; };
    const a = n => { n = String(n || 'ce lieu'); if (/^le\s/i.test(n)) return 'au ' + n.slice(3); if (/^les\s/i.test(n)) return 'aux ' + n.slice(4); return `à ${n}`; };
    /** les étapes d'une vie : événements (lat, lon, year, place) rangés → déplacements d'un lieu à un autre */
    function legs(events, settings, {minKm = 2} = {}) {
        const pts = (events || []).filter(e => isF(Number(e.lat ?? e.latitude)) && isF(Number(e.lon ?? e.longitude)))
            .map(e => ({...e, lat: Number(e.lat ?? e.latitude), lon: Number(e.lon ?? e.longitude), year: isF(Number(e.year)) && e.year !== null && e.year !== '' ? Number(e.year) : null}))
            .sort((p, q) => (p.year ?? 99999) - (q.year ?? 99999));
        const out = []; let prev = null;
        for (const p of pts) {
            if (prev) { const d = km(prev, p); if (d !== null && d >= minKm) out.push({from: prev, to: p, km: d, year: p.year ?? prev.year, best: best(d, p.year ?? prev.year, settings)}); }
            if (!prev || km(prev, p) >= minKm) prev = p;
        }
        return out;
    }

    /* ═════════ Grande carte à imprimer ═════════ */
    const PAPERS = {A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189]};
    /** la taille en pixels d'une affiche : le nombre de points par pouce est baissé si l'image dépasse maxPx pixels (mémoire du navigateur) */
    function posterPixels(paper, orientation, dpi = 300, maxPx = 48e6) {
        const [w0, h0] = PAPERS[paper] || PAPERS.A3, land = orientation === 'landscape', wmm = land ? h0 : w0, hmm = land ? w0 : h0;
        let d = clamp(Number(dpi) || 300, 36, 600);
        const px = dd => [Math.round(wmm / 25.4 * dd), Math.round(hmm / 25.4 * dd)];
        let [w, h] = px(d);
        if (w * h > maxPx) { d = Math.floor(Math.sqrt(maxPx / (wmm * hmm)) * 25.4); [w, h] = px(d); }
        if (Math.max(w, h) > 16000) { d = Math.floor(16000 / Math.max(wmm, hmm) * 25.4); [w, h] = px(d); }
        return {w, h, dpi: d, reduced: d < (Number(dpi) || 300), mm: [wmm, hmm]};
    }
    /** une échelle « ronde » (1, 2, 5 × 10ⁿ km) qui fait environ la longueur voulue */
    function niceScale(kmLen) { if (!isF(kmLen) || kmLen <= 0) return 1; const p = 10 ** Math.floor(Math.log10(kmLen)), f = kmLen / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; }

    /* ═════════ Mes couches : formes gardées, GeoJSON et KML ═════════ */
    const KINDS = {point: 'Point', note: 'Point', route: 'LineString', zone: 'Polygon'};
    const LIMITS = {features: 5000, coords: 20000, name: 200, note: 2000, layers: 200};
    const hex6 = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '';
    const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
    const pt = c => { if (!Array.isArray(c)) return null; const lon = Number(c[0]), lat = Number(c[1]); return isF(lon) && isF(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6] : null; };
    /** une forme remise d'aplomb (ou null) : Point, LineString (2 points au moins), Polygon (anneau extérieur fermé, 3 points au moins) */
    function cleanFeature(f, fallbackColor = '') {
        if (!f || typeof f !== 'object' || !f.geometry) return null;
        const g = f.geometry, p = f.properties && typeof f.properties === 'object' ? f.properties : {};
        let kind = ['point', 'note', 'route', 'zone'].includes(p.kind) ? p.kind : '', coordinates = null;
        if (g.type === 'Point') { coordinates = pt(g.coordinates); if (!coordinates) return null; if (kind !== 'note') kind = 'point'; }
        else if (g.type === 'LineString') { const c = (Array.isArray(g.coordinates) ? g.coordinates : []).slice(0, LIMITS.coords).map(pt).filter(Boolean); if (c.length < 2) return null; coordinates = c; kind = 'route'; }
        else if (g.type === 'Polygon') { let c = (Array.isArray(g.coordinates?.[0]) ? g.coordinates[0] : []).slice(0, LIMITS.coords).map(pt).filter(Boolean); if (c.length >= 2 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c = c.slice(0, -1); if (c.length < 3) return null; coordinates = [[...c, c[0]]]; kind = 'zone'; }
        else return null;
        const color = hex6(p.color) || hex6(p.stroke) || hex6(p['marker-color']) || hex6(p.fill) || hex6(fallbackColor);
        return {type: 'Feature', geometry: {type: KINDS[kind], coordinates}, properties: {kind, name: txt(p.name ?? p.title, LIMITS.name), note: txt(p.note ?? p.description, LIMITS.note), color}};
    }
    /** une couche remise d'aplomb : {name, color, visible, features} */
    function cleanLayer(l) {
        const color = hex6(l?.color) || '#d9480f';
        const feats = (Array.isArray(l?.features) ? l.features : []).slice(0, LIMITS.features).map(f => cleanFeature(f)).filter(Boolean);
        return {name: txt(l?.name, 80) || 'Ma couche', color, visible: l?.visible === false || l?.visible === 0 ? false : true, features: feats};
    }
    const BBOX = f => { const c = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0]; return c; };
    /** GeoJSON (FeatureCollection) : propriétés « simplestyle » (stroke, fill, marker-color) pour les autres logiciels */
    function toGeoJSON(layers) {
        const features = [];
        (layers || []).forEach(l0 => { const l = cleanLayer(l0); l.features.forEach(f => { const c = f.properties.color || l.color; features.push({type: 'Feature', geometry: f.geometry, properties: {layer: l.name, kind: f.properties.kind, name: f.properties.name, ...(f.properties.note ? {description: f.properties.note} : {}), color: c, ...(f.properties.kind === 'zone' ? {stroke: c, fill: c, 'fill-opacity': 0.25} : f.properties.kind === 'route' ? {stroke: c, 'stroke-width': 3} : {'marker-color': c})}}); }); });
        return {type: 'FeatureCollection', name: 'LCNDA — mes couches', features};
    }
    /** GeoJSON → couches (rangées par la propriété « layer » quand elle existe) */
    function fromGeoJSON(obj, defName = 'Couche importée') {
        if (typeof obj === 'string') obj = JSON.parse(obj);
        const list = obj?.type === 'FeatureCollection' ? obj.features : obj?.type === 'Feature' ? [obj] : Array.isArray(obj) ? obj : null;
        if (!Array.isArray(list)) throw new Error('Ce fichier n’est pas un GeoJSON (il faut une « FeatureCollection »).');
        const byName = new Map();
        const push = (name, f) => { const k = txt(name, 80) || defName; if (!byName.has(k)) byName.set(k, {name: k, color: '', features: []}); const L = byName.get(k); if (L.features.length < LIMITS.features) L.features.push(f); };
        list.slice(0, LIMITS.features * 2).forEach(f => {
            if (!f?.geometry) return;
            const g = f.geometry, p = f.properties || {};
            const parts = g.type === 'MultiPoint' ? g.coordinates.map(c => ({type: 'Point', coordinates: c})) : g.type === 'MultiLineString' ? g.coordinates.map(c => ({type: 'LineString', coordinates: c})) : g.type === 'MultiPolygon' ? g.coordinates.map(c => ({type: 'Polygon', coordinates: c})) : g.type === 'GeometryCollection' ? (g.geometries || []) : [g];
            parts.forEach(gg => { const cf = cleanFeature({geometry: gg, properties: p}); if (cf) push(p.layer, cf); });
        });
        const layers = [...byName.values()].slice(0, LIMITS.layers).map(l => { const c = l.features.find(f => f.properties.color)?.properties.color || '#d9480f'; return cleanLayer({...l, color: c}); }).filter(l => l.features.length);
        return layers;
    }
    const xmlEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
    const kmlColor = (hex, alpha = 'ff') => { const h = hex6(hex) || '#d9480f'; return alpha + h.slice(5, 7) + h.slice(3, 5) + h.slice(1, 3); };
    const kmlCoords = list => list.map(c => `${c[0]},${c[1]}`).join(' ');
    /** KML 2.2 : un dossier par couche, un style par forme (couleur), nom et description */
    function toKML(layers) {
        const body = (layers || []).map(l0 => { const l = cleanLayer(l0); return `<Folder><name>${xmlEsc(l.name)}</name>${l.features.map(f => {
            const c = f.properties.color || l.color, g = f.geometry;
            const style = `<Style><IconStyle><color>${kmlColor(c)}</color></IconStyle><LineStyle><color>${kmlColor(c)}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor(c, '55')}</color></PolyStyle></Style>`;
            const geo = g.type === 'Point' ? `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>` : g.type === 'LineString' ? `<LineString><tessellate>1</tessellate><coordinates>${kmlCoords(g.coordinates)}</coordinates></LineString>` : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
            return `<Placemark><name>${xmlEsc(f.properties.name)}</name>${f.properties.note ? `<description>${xmlEsc(f.properties.note)}</description>` : ''}<ExtendedData><Data name="kind"><value>${f.properties.kind}</value></Data></ExtendedData>${style}${geo}</Placemark>`;
        }).join('')}</Folder>`; }).join('');
        return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>LCNDA — mes couches</name>${body}</Document></kml>\n`;
    }
    const unXml = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({lt: '<', gt: '>', quot: '"', apos: "'", amp: '&'}[e.toLowerCase()] ?? (e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16) || 32) : String.fromCodePoint(Number(e.slice(1)) || 32)))).replace(/\s+/g, ' ').trim();
    const tag = (s, name) => { const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i').exec(s); return m ? m[1] : null; };
    const tags = (s, name) => { const out = [], re = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'gi'); let m; while ((m = re.exec(s)) && out.length < LIMITS.features * 2) out.push(m[1]); return out; };
    const parseCoords = s => String(s || '').trim().split(/\s+/).slice(0, LIMITS.coords).map(t => t.split(',').map(Number)).filter(c => c.length >= 2);
    const fromKmlColor = s => { const m = /^\s*([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\s*$/i.exec(String(s || '')); return m ? `#${m[4]}${m[3]}${m[2]}`.toLowerCase() : ''; };
    /** KML → couches : lu comme du texte (pas de lecteur XML : rien n'est exécuté, DOCTYPE et ENTITY refusés) */
    function fromKML(text, defName = 'Couche importée') {
        text = String(text || '');
        if (text.length > 30e6) throw new Error('Fichier KML trop gros (30 Mo au plus).');
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Ce fichier KML contient des déclarations interdites (DOCTYPE ou ENTITY).');
        if (!/<(\w+:)?kml\b/i.test(text)) throw new Error('Ce fichier n’est pas un KML.');
        const folders = tags(text, 'Folder'), groups = folders.length ? folders.map(f => ({name: unXml(tag(f.replace(/<(?:\w+:)?Placemark[\s\S]*$/i, ''), 'name')) || defName, body: f})) : [{name: unXml(tag(text.replace(/<(?:\w+:)?Placemark[\s\S]*$/i, ''), 'name')) || defName, body: text}];
        const layers = [];
        groups.forEach(gr => {
            const feats = [];
            tags(gr.body, 'Placemark').forEach(pm => {
                const props = {name: unXml(tag(pm, 'name')), note: unXml(tag(pm, 'description')), color: fromKmlColor(tag(tag(pm, 'LineStyle') || '', 'color')) || fromKmlColor(tag(tag(pm, 'IconStyle') || '', 'color')) || fromKmlColor(tag(tag(pm, 'PolyStyle') || '', 'color'))};
                const kindM = /<Data\s+name="kind"\s*>\s*<value>\s*(point|note|route|zone)\s*<\/value>/i.exec(pm); if (kindM) props.kind = kindM[1].toLowerCase();
                tags(pm, 'Point').forEach(p => { const c = parseCoords(tag(p, 'coordinates'))[0]; const f = c && cleanFeature({geometry: {type: 'Point', coordinates: c}, properties: props}); if (f) feats.push(f); });
                tags(pm, 'LineString').forEach(p => { const f = cleanFeature({geometry: {type: 'LineString', coordinates: parseCoords(tag(p, 'coordinates'))}, properties: props}); if (f) feats.push(f); });
                tags(pm, 'Polygon').forEach(p => { const f = cleanFeature({geometry: {type: 'Polygon', coordinates: [parseCoords(tag(tag(p, 'outerBoundaryIs') || p, 'coordinates'))]}, properties: props}); if (f) feats.push(f); });
            });
            if (feats.length) layers.push(cleanLayer({name: gr.name, color: feats.find(f => f.properties.color)?.properties.color || '#d9480f', features: feats}));
        });
        return layers.slice(0, LIMITS.layers);
    }
    /** un fichier lu → couches (GeoJSON ou KML, d'après le nom et le contenu) */
    function readLayersFile(name, text) {
        const base = String(name || '').replace(/\.[^.]+$/, '') || 'Couche importée';
        const t = String(text || '').trim();
        if (/\.kml$/i.test(name) || t.startsWith('<')) return fromKML(t, base);
        let obj; try { obj = JSON.parse(t); } catch (_) { throw new Error('Fichier illisible : il faut un GeoJSON (.geojson, .json) ou un KML (.kml).'); }
        return fromGeoJSON(obj, base);
    }
    /** le cadrage (ouest, sud, est, nord) d'un ensemble de formes ou de points {lat, lon} */
    function bounds(list) {
        let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
        (list || []).forEach(it => { const cs = it?.geometry ? BBOX(it) : [[Number(it?.lon), Number(it?.lat)]]; cs.forEach(([lo, la]) => { if (!isF(lo) || !isF(la)) return; w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la); }); });
        return isF(w) ? [w, s, e, n] : null;
    }

    const api = {R, km, fmtKm, SOURCES, MODES, ROUTES, DEFAULTS, cleanSettings, modeOf, speedAt, durationText, travel, allModes, best, sentence, legs,
        PAPERS, posterPixels, niceScale, LIMITS, cleanFeature, cleanLayer, toGeoJSON, fromGeoJSON, toKML, fromKML, readLayersFile, bounds, hex6};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LCNDA_CARTES_OUTILS = api;
})(typeof window !== 'undefined' ? window : null);
