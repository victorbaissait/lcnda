'use strict';
/**
 * Fonds de carte « Un autre pays… » des diagrammes « Cartes » (voisin de scripts/build-geo-maps.js) :
 *   NODE_PATH=chemin/node_modules node scripts/build-geo-pays.js dossier-des-sources
 * Modules npm (dans NODE_PATH) : topojson-server 3.0.1, topojson-simplify 3.0.3, topojson-client 3.1.0 (ISC),
 *   us-atlas 3.0.1 (ISC, d'après les fichiers du Census Bureau), i18n-iso-countries 7.14.0 (MIT, noms des pays).
 * Fichiers du dossier des sources (téléchargés tels quels) :
 *   ne_10m_admin1.geojson ← https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
 *   nuts-10M-3.json       ← https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2024/4326/10M/nutsrg_3.json
 *
 * Licences (lues le 26/11/2026, recopiées dans assets/data/geo/LICENCES.txt, point 6) :
 *  - Natural Earth, Admin 1 – States, Provinces (1:10m), LICENSE.md du dépôt natural-earth-vector :
 *    « All versions of Natural Earth raster + vector map data found on this website are in the public domain. You may
 *    use the maps in any manner, including modifying the content and design, electronic dissemination, and offset
 *    printing. » — « No permission is needed to use Natural Earth. Crediting the authors is unnecessary. »
 *  - us-atlas 3.0.1 (README) : « a convenient redistribution of the Census Bureau's cartographic boundary shapefiles,
 *    2017 edition as TopoJSON » ; code ISC (Copyright 2013-2019 Michael Bostock). Les fichiers du Census Bureau sont une
 *    œuvre du gouvernement fédéral des États-Unis, sans droit d'auteur (17 U.S.C. § 105) : domaine public.
 *    (La page census.gov des « cartographic boundary files » n'était pas joignable depuis la machine de construction.)
 *  - Eurostat GISCO, NUTS 2024 (via Nuts2json, README « Copyright ») : « The Eurostat NUTS dataset is copyrighted.
 *    There are specific provisions for the usage of this dataset which must be respected » ; mention à afficher :
 *    « © EuroGeographics for the administrative boundaries » — mêmes conditions que eu-nuts1 / eu-nuts2 (LICENCES.txt, point 3).
 *
 * Sortie (JSON compressé en gzip, même forme que les autres fonds : {v, id, name, attr, codes, bbox, view, country, topo}) :
 *   assets/data/geo/pays/index.json           la liste des pays : [{c, n, a, v, k, r, nuts, cty}]
 *   assets/data/geo/pays/adm1-<XX>.json.gz    les régions, États, provinces d'un pays (Natural Earth admin-1)
 *   assets/data/geo/pays/reg-<XX>.json.gz     les grandes régions (champ « region » de Natural Earth, provinces fondues)
 *   assets/data/geo/eu-nuts3.json.gz          Europe, NUTS 3 (départements, Kreise, provinces…)
 *   assets/data/geo/us-comtes.json.gz         États-Unis, comtés (Census 2017, 1:10 000 000, via us-atlas)
 * Aucun tracé n'est inventé : tout vient des sources ci-dessus, seulement simplifié (topojson-simplify) et quantifié.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {topology} = require('topojson-server');
const {presimplify, simplify, quantile} = require('topojson-simplify');
const {feature, merge, quantize} = require('topojson-client');
const iso = require('i18n-iso-countries');
const LANGS = ['fr', 'en', 'de', 'it', 'es', 'pt', 'pl', 'nl'];
LANGS.forEach(l => iso.registerLocale(require(`i18n-iso-countries/langs/${l}.json`)));

const SRC = process.argv[2];
if (!SRC) { console.error('Usage : NODE_PATH=… node scripts/build-geo-pays.js dossier-des-sources'); process.exit(1); }
const OUT = path.resolve(__dirname, '..', 'assets', 'data', 'geo'), OUT_P = path.join(OUT, 'pays');
fs.mkdirSync(OUT_P, {recursive: true});
const readJson = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const uniq = a => [...new Set(a.filter(x => x !== undefined && x !== null && String(x).trim() !== '').map(x => String(x).trim()))];
const r2 = v => Math.round(v * 100) / 100;

/* ── outils géométriques (en degrés), comme scripts/build-geo-maps.js ── */
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h));
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y); }
function labelPoint(g, n = 20) {
    const polys = polysOf(g); if (!polys.length) return null;
    const big = polys.map(p => [p, Math.abs(ringArea(p[0]))]).sort((a, b) => b[1] - a[1])[0][0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; big[0].forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180) || 1; let best = null, bd = -1;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const x = x0 + (x1 - x0) * (i + .5) / (n + 1), y = y0 + (y1 - y0) * (j + .5) / (n + 1); if (!inPoly(x, y, big)) continue;
        let d = Infinity; big.forEach(r => { for (let a = 0, b = r.length - 1; a < r.length; b = a++) d = Math.min(d, segDist(x * k, y, r[a][0] * k, r[a][1], r[b][0] * k, r[b][1])); });
        if (d > bd) { bd = d; best = [x, y]; }
    }
    return (best || [(x0 + x1) / 2, (y0 + y1) / 2]).map(v => Math.round(v * 1000) / 1000);
}
const bboxOf = feats => { let b = [Infinity, Infinity, -Infinity, -Infinity]; feats.forEach(f => polysOf(f.geometry).forEach(p => p[0].forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }))); return b.map(r2); };
/** le cadrage de départ d'un pays : la terre principale et les îles proches (pas les îles lointaines : Açores, Canaries, Hawaï…), avec une marge */
function viewOf(feats) {
    const t = topology({z: {type: 'FeatureCollection', features: feats.filter(f => f.geometry)}}, 1e5), m = merge(t, t.objects.z.geometries);
    const parts = polysOf(m).map(p => { let b = [Infinity, Infinity, -Infinity, -Infinity]; p[0].forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }); return {b, a: Math.abs(ringArea(p[0]))}; });
    const max = Math.max(...parts.map(x => x.a)), sum = parts.reduce((s, x) => s + x.a, 0);
    let b = [Infinity, Infinity, -Infinity, -Infinity]; const grow = q => { b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; };
    parts.filter(x => x.a >= max * .1).forEach(x => grow(x.b));
    const diag = Math.hypot(b[2] - b[0], b[3] - b[1]), near = q => Math.max(b[0] - q[2], q[0] - b[2], 0) + Math.max(b[1] - q[3], q[1] - b[3], 0) < diag * .25;
    parts.filter(x => x.a >= sum * .002 && near(x.b)).forEach(x => grow(x.b));
    const mx = Math.max(.15, (b[2] - b[0]) * .05), my = Math.max(.1, (b[3] - b[1]) * .05);
    return [Math.max(-180, b[0] - mx), Math.max(-85, b[1] - my), Math.min(180, b[2] + mx), Math.min(85, b[3] + my)].map(r2);
}
const VIEW = {US: [-125, 24, -66.5, 49.6], RU: [26, 41, 180, 78], FJ: [176.8, -19.3, 180, -16], NZ: [166, -47.5, 179, -34], KI: [-160, -5, -150, 4.7]};

/** des zones GeoJSON → un fichier .json.gz (TopoJSON quantifié et simplifié : « points » points gardés en tout) */
function write(file, meta, feats, {points = 8000, q = 1e5} = {}) {
    feats = feats.filter(f => f.geometry && polysOf(f.geometry).length);
    let topo = topology({z: {type: 'FeatureCollection', features: feats}}, q);
    const total = topo.arcs.reduce((n, a) => n + a.length, 0), keep = Math.min(1, Math.max(.004, points / Math.max(1, total)));
    if (keep < 1) { topo = presimplify(topo); topo = simplify(topo, quantile(topo, keep)); topo = quantize(topo, q); }
    const simple = feature(topo, topo.objects.z).features;
    topo.objects.z.geometries.forEach((g, i) => { const p = g.properties || {}; const l = labelPoint(simple[i]?.geometry); if (l) p.l = l; Object.keys(p).forEach(k => { if (p[k] === undefined || p[k] === '' || (Array.isArray(p[k]) && !p[k].length)) delete p[k]; }); g.properties = p; delete g.id; });
    topo.objects.z.geometries = topo.objects.z.geometries.filter(g => g.type);
    const out = {v: 1, ...meta, bbox: bboxOf(feats), topo}, buf = zlib.gzipSync(JSON.stringify(out), {level: 9});
    fs.writeFileSync(file, buf);
    return {zones: topo.objects.z.geometries.length, size: buf.length};
}

/* ═════════ Les noms des pays (français d'abord) ═════════ */
const FR_NAME = {US: 'États-Unis', CI: 'Côte d’Ivoire', CD: 'Congo (RDC)', CG: 'Congo', KR: 'Corée du Sud', KP: 'Corée du Nord', GB: 'Royaume-Uni', VA: 'Vatican', MK: 'Macédoine du Nord', FM: 'Micronésie', BA: 'Bosnie-Herzégovine', IR: 'Iran', SY: 'Syrie', LA: 'Laos', VN: 'Viêt Nam', RU: 'Russie', MD: 'Moldavie', TZ: 'Tanzanie', BO: 'Bolivie', VE: 'Venezuela', TW: 'Taïwan', CZ: 'Tchéquie', PS: 'Palestine', XK: 'Kosovo'};
const countryName = cc => FR_NAME[cc] || iso.getName(cc, 'fr') || cc;
/** les noms d'un pays, pour reconnaître le pays d'un lieu (« Italia », « Italy », « ITA »…) — en minuscules sans accents */
const countryWords = (cc, extra = []) => uniq([cc, iso.alpha2ToAlpha3(cc), countryName(cc), ...LANGS.flatMap(l => { const n = iso.getName(cc, l, {select: 'all'}); return Array.isArray(n) ? n : [n]; }), ...extra]).map(fold).filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i);

/* ═════════ Les grandes régions en français (champ « region » de Natural Earth, souvent dans la langue du pays) ═════════ */
const REG_FR = {
    IT: {"Valle d'Aosta": 'Vallée d’Aoste', Piemonte: 'Piémont', Lombardia: 'Lombardie', 'Trentino-Alto Adige': 'Trentin-Haut-Adige', Liguria: 'Ligurie', 'Emilia-Romagna': 'Émilie-Romagne', Marche: 'Marches', Veneto: 'Vénétie', 'Friuli-Venezia Giulia': 'Frioul-Vénétie Julienne',
        Abruzzo: 'Abruzzes', Molise: 'Molise', Apulia: 'Pouilles', Basilicata: 'Basilicate', Calabria: 'Calabre', Campania: 'Campanie', Lazio: 'Latium', Toscana: 'Toscane', Sicily: 'Sicile', Sardegna: 'Sardaigne', Umbria: 'Ombrie'},
    ES: {Ceuta: 'Ceuta', Melilla: 'Melilla', 'Foral de Navarra': 'Navarre', 'País Vasco': 'Pays basque', 'Aragón': 'Aragon', 'Cataluña': 'Catalogne', Extremadura: 'Estrémadure', 'Andalucía': 'Andalousie', Galicia: 'Galice', 'Castilla y León': 'Castille-et-León', Valenciana: 'Communauté valencienne',
        Murcia: 'Région de Murcie', Asturias: 'Asturies', Cantabria: 'Cantabrie', 'Canary Is.': 'Îles Canaries', 'Islas Baleares': 'Îles Baléares', 'La Rioja': 'La Rioja', 'Castilla-La Mancha': 'Castille-La Manche', Madrid: 'Communauté de Madrid'},
    US: {West: 'Ouest', Midwest: 'Midwest', Northeast: 'Nord-Est', South: 'Sud'},
    RU: {Siberian: 'Sibérie', Northwestern: 'Nord-Ouest', Volga: 'Volga', Central: 'Centre', 'Far Eastern': 'Extrême-Orient', Urals: 'Oural'},
    IE: {Border: 'Border', Dublin: 'Dublin', 'Mid-East': 'Centre-Est', 'South-East': 'Sud-Est', 'South-West': 'Sud-Ouest', 'Mid-West': 'Centre-Ouest', West: 'Ouest', Midlands: 'Midlands'},
    CA: {'Western Canada': 'Ouest canadien', 'Eastern Canada': 'Est canadien', 'Northern Canada': 'Nord canadien'},
};
const NO_REGION = new Set(['GB', 'PT', 'FR']); // régions mélangées (NUTS 1 et 2) ou déjà dans l'app

/* ═════════ Natural Earth admin-1 : un fichier par pays ═════════ */
const NE_ATTR = 'Natural Earth (domaine public), Admin 1 – States, Provinces 1:10m';
const ne = readJson('ne_10m_admin1.geojson').features;
const byCountry = new Map(); ne.forEach(f => { const cc = String(f.properties.iso_a2 || ''); if (!/^[A-Z]{2}$/.test(cc)) return; if (!byCountry.has(cc)) byCountry.set(cc, []); byCountry.get(cc).push(f); });
const nuts = readJson('nuts-10M-3.json').features;
const NUTS_CC = c => (c === 'EL' ? 'GR' : c);
const nutsCountries = new Set(nuts.map(f => NUTS_CC(f.properties.id.slice(0, 2))));
const index = [];
let total = 0;
for (const [cc, list] of [...byCountry].sort()) {
    if (list.length < 2) continue; // un pays d'une seule zone : rien à colorer de plus que la carte du monde
    const P = list.map(f => f.properties), dupFr = new Set(), seen = new Set();
    P.forEach(p => { const k = fold(p.name_fr); if (k && seen.has(k)) dupFr.add(k); seen.add(k); });
    const regFr = r => (REG_FR[cc] && REG_FR[cc][r]) || r;
    const ids = new Set();
    const zoneName = p => {
        let fr = String(p.name_fr || '').trim(); const nm = String(p.name || '').trim();
        if (/^d['’]/i.test(fr) && !/^d['’]/i.test(nm)) fr = fr.replace(/^d['’]\s*/i, ''); // « d'Ourense »
        if (!fr || dupFr.has(fold(fr))) return nm || fr;
        if (p.region && fold(fr) === fold(regFr(p.region)) && fold(nm) !== fold(p.region)) return nm; // « Genova » nommée « Ligurie » : le nom de la région, pas de la province
        return fr;
    };
    const regions = P.every(p => p.region) && !NO_REGION.has(cc) ? uniq(P.map(p => p.region)) : [];
    const hasReg = regions.length >= 3 && regions.length <= P.length * .6;
    const feats = list.map(f => {
        const p = f.properties, n = zoneName(p);
        let id = String(p.iso_3166_2 || ''); if (!id || /-99$|~/.test(id) || ids.has(id)) id = String(p.adm1_code || id); ids.add(id);
        const alts = uniq([p.name, p.name_en, p.name_local, p.gn_name, p.woe_name, p.name_fr, p.name_de, p.name_it, p.name_es, p.name_pt, p.name_pl, p.name_nl, ...(String(p.name_alt || '').split('|')),
            p.iso_3166_2 && !/-99$|~/.test(p.iso_3166_2) ? p.iso_3166_2.replace(/^[A-Z]{2}-/, '') : '', p.postal, p.code_hasc, p.abbrev]).filter(x => x !== n && x !== id && x.length < 60);
        return {type: 'Feature', geometry: f.geometry, properties: {i: id, n, a: alts, p: hasReg ? 'r-' + fold(p.region).replace(/ /g, '-') : undefined}};
    });
    const words = countryWords(cc), view = VIEW[cc] || viewOf(list), name = countryName(cc);
    const pts = Math.max(2500, Math.min(30000, list.length * 160));
    const a = write(path.join(OUT_P, `adm1-${cc}.json.gz`), {id: `adm1-${cc}`, name: `${name} — régions, États, provinces`, attr: NE_ATTR, codes: 'ISO 3166-2', view, country: words, cc}, feats, {points: pts});
    total += a.size;
    let r = 0;
    if (hasReg) { // les provinces fondues par grande région (topojson merge : aucun tracé nouveau)
        const t = topology({z: {type: 'FeatureCollection', features: feats}}, 1e5);
        const rf = regions.map(rg => ({type: 'Feature', geometry: merge(t, t.objects.z.geometries.filter((g, i) => list[i].properties.region === rg)),
            properties: {i: 'r-' + fold(rg).replace(/ /g, '-'), n: regFr(rg), a: uniq([rg]).filter(x => x !== regFr(rg))}}));
        const b = write(path.join(OUT_P, `reg-${cc}.json.gz`), {id: `reg-${cc}`, name: `${name} — grandes régions`, attr: NE_ATTR + ' (provinces regroupées par le champ « region »)', codes: '', view, country: words, cc}, rf, {points: Math.max(2500, pts * .6)});
        total += b.size; r = b.zones;
    }
    index.push({c: cc, n: name, a: words.filter(w => w !== fold(name) && w.length > 2).slice(0, 12), v: view, k: a.zones, ...(r ? {r} : {}), ...(nutsCountries.has(cc) ? {nuts: 1} : {}), ...(cc === 'US' ? {cty: 1} : {})});
}
index.sort((x, y) => x.n.localeCompare(y.n, 'fr'));
fs.writeFileSync(path.join(OUT_P, 'index.json'), JSON.stringify({v: 1, attr: NE_ATTR, countries: index}));
console.log(`pays : ${index.length} pays, ${(total / 1024).toFixed(0)} Ko compressés, index ${(fs.statSync(path.join(OUT_P, 'index.json')).size / 1024).toFixed(0)} Ko`);

/* ═════════ Europe : NUTS 3 (Eurostat GISCO, version 2024) ═════════ */
{
    const NUTS_ATTR = '© EuroGeographics pour les limites administratives (Eurostat GISCO, NUTS 2024, via Nuts2json)';
    const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^Prov\. /, '').trim();
    const feats = nuts.map(f => { const id = f.properties.id, n = clean(f.properties.na).split(' / ')[0]; return {type: 'Feature', geometry: f.geometry, properties: {i: id, n, a: uniq(clean(f.properties.na).split(' / ')).filter(x => x !== n), p: NUTS_CC(id.slice(0, 2))}}; });
    const r = write(path.join(OUT, 'eu-nuts3.json.gz'), {id: 'eu-nuts3', name: 'Europe — NUTS 3', attr: NUTS_ATTR, codes: 'NUTS 3'}, feats, {points: 60000});
    console.log(`eu-nuts3 : ${r.zones} zones, ${(r.size / 1024).toFixed(0)} Ko`);
}

/* ═════════ États-Unis : comtés (Census Bureau 2017, via us-atlas) ═════════ */
{
    const us = require('us-atlas/counties-10m.json');
    const ST = {'01': ['AL', 'Alabama'], '02': ['AK', 'Alaska'], '04': ['AZ', 'Arizona'], '05': ['AR', 'Arkansas'], '06': ['CA', 'Californie', 'California'], '08': ['CO', 'Colorado'], '09': ['CT', 'Connecticut'], '10': ['DE', 'Delaware'], '11': ['DC', 'District de Columbia', 'District of Columbia'],
        '12': ['FL', 'Floride', 'Florida'], '13': ['GA', 'Géorgie', 'Georgia'], '15': ['HI', 'Hawaï', 'Hawaii'], '16': ['ID', 'Idaho'], '17': ['IL', 'Illinois'], '18': ['IN', 'Indiana'], '19': ['IA', 'Iowa'], '20': ['KS', 'Kansas'], '21': ['KY', 'Kentucky'], '22': ['LA', 'Louisiane', 'Louisiana'],
        '23': ['ME', 'Maine'], '24': ['MD', 'Maryland'], '25': ['MA', 'Massachusetts'], '26': ['MI', 'Michigan'], '27': ['MN', 'Minnesota'], '28': ['MS', 'Mississippi'], '29': ['MO', 'Missouri'], '30': ['MT', 'Montana'], '31': ['NE', 'Nebraska'], '32': ['NV', 'Nevada'],
        '33': ['NH', 'New Hampshire'], '34': ['NJ', 'New Jersey'], '35': ['NM', 'Nouveau-Mexique', 'New Mexico'], '36': ['NY', 'État de New York', 'New York'], '37': ['NC', 'Caroline du Nord', 'North Carolina'], '38': ['ND', 'Dakota du Nord', 'North Dakota'], '39': ['OH', 'Ohio'], '40': ['OK', 'Oklahoma'],
        '41': ['OR', 'Oregon'], '42': ['PA', 'Pennsylvanie', 'Pennsylvania'], '44': ['RI', 'Rhode Island'], '45': ['SC', 'Caroline du Sud', 'South Carolina'], '46': ['SD', 'Dakota du Sud', 'South Dakota'], '47': ['TN', 'Tennessee'], '48': ['TX', 'Texas'], '49': ['UT', 'Utah'], '50': ['VT', 'Vermont'],
        '51': ['VA', 'Virginie', 'Virginia'], '53': ['WA', 'État de Washington', 'Washington'], '54': ['WV', 'Virginie-Occidentale', 'West Virginia'], '55': ['WI', 'Wisconsin'], '56': ['WY', 'Wyoming'], '60': ['AS', 'Samoa américaines'], '66': ['GU', 'Guam'], '69': ['MP', 'Îles Mariannes du Nord'], '72': ['PR', 'Porto Rico', 'Puerto Rico'], '78': ['VI', 'Îles Vierges des États-Unis']};
    const feats = feature(us, us.objects.counties).features.map(f => {
        const id = String(f.id), st = ST[id.slice(0, 2)] || ['', ''], n = String(f.properties?.name || id), names = st.slice(1);
        const word = st[0] === 'LA' ? 'Parish' : st[0] === 'AK' ? 'Borough' : 'County';
        return {type: 'Feature', geometry: f.geometry, properties: {i: id, n, a: uniq([`${n} ${word}`, ...names.flatMap(s => [`${n}, ${s}`, `${n} ${word}, ${s}`]), `${n}, ${st[0]}`, `${n} ${word}, ${st[0]}`, `${n} (${st[0]})`, 'US-' + id]), p: st[0] ? 'US-' + st[0] : ''}};
    });
    const r = write(path.join(OUT, 'us-comtes.json.gz'), {id: 'us-comtes', name: 'États-Unis — comtés', attr: 'U.S. Census Bureau, cartographic boundary files 2017 (domaine public), via us-atlas', codes: 'FIPS (5 chiffres)', view: VIEW.US, country: countryWords('US', ['usa', 'u s a', 'etats unis d amerique'])}, feats, {points: 70000});
    console.log(`us-comtes : ${r.zones} zones, ${(r.size / 1024).toFixed(0)} Ko`);
}
