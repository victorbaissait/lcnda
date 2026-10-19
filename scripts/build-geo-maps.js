'use strict';
/**
 * Fonds de carte des diagrammes « Cartes » (carte colorée par zones, carte des migrations) :
 *   NODE_PATH=chemin/node_modules node scripts/build-geo-maps.js dossier-des-sources
 * Modules npm (dans NODE_PATH) : world-atlas@2.0.2 (ISC, Natural Earth = domaine public), i18n-iso-countries (MIT,
 * noms français des pays), countries-list (MIT, continent de chaque pays), topojson-server / -simplify / -client (ISC).
 * Fichiers du dossier des sources (téléchargés tels quels, voir assets/data/geo/LICENCES.txt) :
 *   fr-departements-avec-outre-mer.geojson, fr-regions-avec-outre-mer.geojson  ← github.com/gregoiredavid/france-geojson (IGN Admin Express, Licence Ouverte)
 *   nuts-10M-1.json, nuts-10M-2.json, nuts-10M-3.json, nuts-03M-2.json, nuts-03M-3.json  ← github.com/eurostat/Nuts2json, 2024/4326 (© EuroGeographics, Eurostat GISCO)
 *   lux-geoBoundaries-LUX-ADM1_simplified.geojson  ← geoBoundaries (OpenStreetMap, ODbL)
 * Sortie : assets/data/geo/<fond>.json = {v, id, name, attr, codes, bbox, topo} ; topo = TopoJSON quantifié, objet « z »,
 * chaque zone : i (code), n (nom français), a (autres codes et noms), p (zone parente), l ([lon, lat] pour l'étiquette),
 * o (1 = outre-mer, dessiné en encart). Aucun tracé n'est inventé : tout vient des sources ci-dessus, seulement simplifié.
 */
const fs = require('node:fs');
const path = require('node:path');
const {topology} = require('topojson-server');
const {presimplify, simplify, quantile} = require('topojson-simplify');
const {feature, merge, quantize} = require('topojson-client');
const iso = require('i18n-iso-countries');
iso.registerLocale(require('i18n-iso-countries/langs/fr.json'));
iso.registerLocale(require('i18n-iso-countries/langs/en.json'));
const {countries: CL} = require('countries-list');

const SRC = process.argv[2];
if (!SRC) { console.error('Usage : NODE_PATH=… node scripts/build-geo-maps.js dossier-des-sources'); process.exit(1); }
const OUT = path.resolve(__dirname, '..', 'assets', 'data', 'geo');
fs.mkdirSync(OUT, {recursive: true});
const readJson = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/* ── outils géométriques (en degrés) ── */
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h));
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y); }
/** un point bien à l'intérieur de la plus grande partie (pour l'étiquette) : grille de 30 × 30, le plus loin des bords */
function labelPoint(g) {
    const polys = polysOf(g); if (!polys.length) return null;
    const big = polys.map(p => [p, Math.abs(ringArea(p[0]))]).sort((a, b) => b[1] - a[1])[0][0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; big[0].forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180) || 1;
    let best = null, bd = -1;
    for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) {
        const x = x0 + (x1 - x0) * (i + .5) / 31, y = y0 + (y1 - y0) * (j + .5) / 31; if (!inPoly(x, y, big)) continue;
        let d = Infinity; big.forEach(r => { for (let a = 0, b = r.length - 1; a < r.length; b = a++) d = Math.min(d, segDist(x * k, y, r[a][0] * k, r[a][1], r[b][0] * k, r[b][1])); });
        if (d > bd) { bd = d; best = [x, y]; }
    }
    if (!best) best = [(x0 + x1) / 2, (y0 + y1) / 2];
    return best.map(v => Math.round(v * 1000) / 1000);
}
const bboxOf = feats => { let b = [Infinity, Infinity, -Infinity, -Infinity]; feats.forEach(f => polysOf(f.geometry).forEach(p => p[0].forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }))); return b.map(v => Math.round(v * 100) / 100); };

/** des zones GeoJSON → un fichier : TopoJSON quantifié et simplifié (garde « keep » des points) */
function write(id, meta, feats, {keep = .3, q = 1e5} = {}) {
    feats = feats.filter(f => f.geometry && polysOf(f.geometry).length);
    let topo = topology({z: {type: 'FeatureCollection', features: feats}}, q);
    if (keep < 1) { topo = presimplify(topo); topo = simplify(topo, quantile(topo, keep)); topo = quantize(topo, q); } // quantile(…, p) : la part p des points est gardée
    // les étiquettes d'après le tracé simplifié (celui qui est dessiné)
    const simple = feature(topo, topo.objects.z).features;
    topo.objects.z.geometries.forEach((g, i) => { const p = g.properties || {}; const l = labelPoint(simple[i]?.geometry); if (l) p.l = l; Object.keys(p).forEach(k => { if (p[k] === undefined || p[k] === '' || (Array.isArray(p[k]) && !p[k].length)) delete p[k]; }); g.properties = p; delete g.id; });
    topo.objects.z.geometries = topo.objects.z.geometries.filter(g => g.type);
    const out = {v: 1, id, ...meta, bbox: bboxOf(feats), topo};
    const file = path.join(OUT, id + '.json');
    fs.writeFileSync(file, JSON.stringify(out));
    console.log(`${id} : ${topo.objects.z.geometries.length} zones, ${(fs.statSync(file).size / 1024).toFixed(0)} Ko`);
}

/* ═════════ Monde : pays (110m et 50m), continents ═════════ */
const NE_ATTR = 'Natural Earth (domaine public), via world-atlas';
const FR_NAME = {US: 'États-Unis', CI: 'Côte d’Ivoire', CD: 'Congo (RDC)', CG: 'Congo', KR: 'Corée du Sud', KP: 'Corée du Nord', GB: 'Royaume-Uni', VA: 'Vatican', MK: 'Macédoine du Nord', FM: 'Micronésie', BA: 'Bosnie-Herzégovine', IR: 'Iran', SY: 'Syrie', LA: 'Laos', VN: 'Viêt Nam', RU: 'Russie', MD: 'Moldavie', TZ: 'Tanzanie', BO: 'Bolivie', VE: 'Venezuela', TW: 'Taïwan', CZ: 'Tchéquie', PS: 'Palestine', FK: 'Îles Malouines', TF: 'Terres australes françaises'};
const NO_ISO = {'Kosovo': ['XK', 'Kosovo', 'EU'], 'N. Cyprus': ['', 'Chypre du Nord', 'AS'], 'Somaliland': ['', 'Somaliland', 'AF'], 'Indian Ocean Ter.': ['', 'Territoires australiens de l’océan Indien', 'AS'], 'Siachen Glacier': ['', 'Glacier de Siachen', 'AS']};
const CONT = {AF: 'Afrique', AN: 'Antarctique', AS: 'Asie', EU: 'Europe', NA: 'Amérique du Nord', OC: 'Océanie', SA: 'Amérique du Sud'};
const CONT_CODE = {AF: '002', AN: '010', AS: '142', EU: '150', NA: '003', OC: '009', SA: '005'};
function worldFeatures(file) {
    const w = require(file);
    return feature(w, w.objects.countries).features.map(f => {
        const en = f.properties?.name || '', a2 = f.id ? iso.numericToAlpha2(f.id) : (NO_ISO[en]?.[0] || '');
        const fr = a2 && FR_NAME[a2] ? FR_NAME[a2] : a2 && iso.getName(a2, 'fr') ? iso.getName(a2, 'fr') : (NO_ISO[en]?.[1] || en);
        const cont = (a2 && CL[a2]?.continent) || NO_ISO[en]?.[2] || '';
        const a3 = a2 ? iso.alpha2ToAlpha3(a2) || '' : '';
        const alts = [...new Set([a3, f.id ? String(f.id) : '', en, a2 && iso.getName(a2, 'en'), a2 && iso.getName(a2, 'fr', {select: 'official'})].filter(x => x && x !== a2 && x !== fr))];
        return {type: 'Feature', geometry: f.geometry, properties: {i: a2 || ('x-' + fold(en).replace(/ /g, '-')), n: fr, a: alts, p: cont}};
    });
}
const w110 = worldFeatures('world-atlas/countries-110m.json'), w50 = worldFeatures('world-atlas/countries-50m.json');
write('monde-110m', {name: 'Monde — pays', attr: NE_ATTR, codes: 'ISO 3166 (2 lettres, 3 lettres, numérique)'}, w110, {keep: .7, q: 1e5});
write('monde-50m', {name: 'Monde — pays (détaillé)', attr: NE_ATTR, codes: 'ISO 3166 (2 lettres, 3 lettres, numérique)'}, w50, {keep: .22, q: 1e5});
{   // continents : les pays du même continent fondus ensemble (topojson merge, sans nouveau tracé)
    const w = require('world-atlas/countries-50m.json');
    const byCont = {}; w.objects.countries.geometries.forEach(g => { const en = g.properties?.name || '', a2 = g.id ? iso.numericToAlpha2(g.id) : (NO_ISO[en]?.[0] || ''); const c = (a2 && CL[a2]?.continent) || NO_ISO[en]?.[2]; if (c) (byCont[c] = byCont[c] || []).push(g); });
    const feats = Object.entries(byCont).map(([c, geoms]) => ({type: 'Feature', geometry: merge(w, geoms), properties: {i: c, n: CONT[c], a: [CONT_CODE[c], {AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America'}[c]]}}));
    write('continents', {name: 'Monde — continents', attr: NE_ATTR + ' (pays regroupés par continent d’après countries-list)', codes: 'AF, AS, EU, NA, SA, OC, AN'}, feats, {keep: .2, q: 1e5});
}

/* ═════════ France : départements et régions (IGN Admin Express via france-geojson) ═════════ */
const FR_ATTR = 'IGN Admin Express (Licence Ouverte Etalab), via france-geojson';
const REG_NUTS = {11: 'FR1', 24: 'FRB', 27: 'FRC', 28: 'FRD', 32: 'FRE', 44: 'FRF', 52: 'FRG', 53: 'FRH', 75: 'FRI', 76: 'FRJ', 84: 'FRK', 93: 'FRL', 94: 'FRM', '01': 'FRY1', '02': 'FRY2', '03': 'FRY3', '04': 'FRY4', '06': 'FRY5'};
const frReg = readJson('fr-regions-avec-outre-mer.geojson').features;
const nuts3 = readJson('nuts-10M-3.json'), nuts3f = feature(nuts3, nuts3.objects.nutsrg).features;
const nuts3FR = new Map(nuts3f.filter(f => /^FR/.test(f.properties.id)).map(f => [fold(f.properties.na), f.properties.id]));
const regOf = f => { const l = labelPoint(f.geometry); const r = l && frReg.find(r => polysOf(r.geometry).some(p => inPoly(l[0], l[1], p))); return r ? String(r.properties.code) : ''; };
const frDep = readJson('fr-departements-avec-outre-mer.geojson').features.map(f => {
    const c = String(f.properties.code), n = f.properties.nom;
    return {type: 'Feature', geometry: f.geometry, properties: {i: c, n, a: [nuts3FR.get(fold(n)) || ''].filter(Boolean), p: regOf(f), o: c.length === 3 ? 1 : undefined}};
});
write('fr-departements', {name: 'France — départements', attr: FR_ATTR, codes: 'INSEE (35, 2A…), NUTS 3'}, frDep, {keep: .07, q: 1e5});
write('fr-regions', {name: 'France — régions', attr: FR_ATTR, codes: 'INSEE (53…), NUTS 1'}, frReg.map(f => { const c = String(f.properties.code); return {type: 'Feature', geometry: f.geometry, properties: {i: c, n: f.properties.nom, a: [REG_NUTS[c] || ''].filter(Boolean), o: c.length === 2 && c[0] === '0' ? 1 : undefined}}; }), {keep: .07, q: 1e5});

/* ═════════ Europe : NUTS (Eurostat GISCO via Nuts2json, version 2024) ═════════ */
const NUTS_ATTR = '© EuroGeographics pour les limites administratives (Eurostat GISCO, NUTS 2024, via Nuts2json)';
// noms français (les autres gardent leur nom latin officiel)
const NUTS_FR = {
    // NUTS 1
    PT1: 'Portugal continental', PT2: 'Açores', PT3: 'Madère', ES1: 'Nord-Ouest (Espagne)', ES2: 'Nord-Est (Espagne)', ES3: 'Communauté de Madrid', ES4: 'Centre (Espagne)', ES5: 'Est (Espagne)', ES6: 'Sud (Espagne)', ES7: 'Îles Canaries',
    ITC: 'Nord-Ouest (Italie)', ITH: 'Nord-Est (Italie)', ITI: 'Centre (Italie)', ITF: 'Sud (Italie)', ITG: 'Îles (Italie)', CH0: 'Suisse', LI0: 'Liechtenstein', LU0: 'Luxembourg', IE0: 'Irlande', IS0: 'Islande', DK0: 'Danemark', NO0: 'Norvège', CY0: 'Chypre', MT0: 'Malte', AL0: 'Albanie', MK0: 'Macédoine du Nord', XK0: 'Kosovo', ME0: 'Monténégro', BA0: 'Bosnie-Herzégovine', HR0: 'Croatie', SI0: 'Slovénie', SK0: 'Slovaquie', CZ0: 'Tchéquie', LT0: 'Lituanie', LV0: 'Lettonie', EE0: 'Estonie',
    DE1: 'Bade-Wurtemberg', DE2: 'Bavière', DE3: 'Berlin', DE4: 'Brandebourg', DE5: 'Brême', DE6: 'Hambourg', DE7: 'Hesse', DE8: 'Mecklembourg-Poméranie-Occidentale', DE9: 'Basse-Saxe', DEA: 'Rhénanie-du-Nord-Westphalie', DEB: 'Rhénanie-Palatinat', DEC: 'Sarre', DED: 'Saxe', DEE: 'Saxe-Anhalt', DEF: 'Schleswig-Holstein', DEG: 'Thuringe',
    AT1: 'Autriche orientale', AT2: 'Autriche méridionale', AT3: 'Autriche occidentale', BE1: 'Région de Bruxelles-Capitale', BE2: 'Région flamande', BE3: 'Région wallonne', NL1: 'Pays-Bas du Nord', NL2: 'Pays-Bas de l’Est', NL3: 'Pays-Bas de l’Ouest', NL4: 'Pays-Bas du Sud',
    FR1: 'Île-de-France', FRB: 'Centre-Val de Loire', FI1: 'Finlande continentale', FI2: 'Åland', SE1: 'Suède orientale', SE2: 'Suède méridionale', SE3: 'Suède septentrionale', EL3: 'Attique', EL4: 'Îles de la mer Égée, Crète', EL5: 'Grèce du Nord', EL6: 'Grèce centrale', HU1: 'Hongrie centrale', HU2: 'Transdanubie', HU3: 'Grande Plaine et Nord', TR1: 'Istanbul', RS1: 'Serbie du Nord', RS2: 'Serbie du Sud', BG3: 'Bulgarie du Nord et du Sud-Est', BG4: 'Bulgarie du Sud-Ouest et du Centre-Sud',
    PL2: 'Pologne du Sud', PL4: 'Pologne du Nord-Ouest', PL5: 'Pologne du Sud-Ouest', PL6: 'Pologne du Nord', PL7: 'Pologne centrale', PL8: 'Pologne de l’Est', PL9: 'Mazovie', RO1: 'Roumanie, macrorégion 1', RO2: 'Roumanie, macrorégion 2', RO3: 'Roumanie, macrorégion 3', RO4: 'Roumanie, macrorégion 4',
    // NUTS 2
    AT11: 'Burgenland', AT12: 'Basse-Autriche', AT13: 'Vienne', AT21: 'Carinthie', AT22: 'Styrie', AT31: 'Haute-Autriche', AT32: 'Salzbourg', AT33: 'Tyrol', AT34: 'Vorarlberg',
    BE10: 'Bruxelles-Capitale', BE21: 'Anvers', BE22: 'Limbourg (Belgique)', BE23: 'Flandre-Orientale', BE24: 'Brabant flamand', BE25: 'Flandre-Occidentale', BE31: 'Brabant wallon', BE32: 'Hainaut', BE33: 'Liège', BE34: 'Luxembourg (Belgique)', BE35: 'Namur',
    CH01: 'Région lémanique', CH02: 'Espace Mittelland', CH03: 'Suisse du Nord-Ouest', CH04: 'Zurich', CH05: 'Suisse orientale', CH06: 'Suisse centrale', CH07: 'Tessin',
    CY00: 'Chypre', CZ01: 'Prague', CZ02: 'Bohême centrale', CZ03: 'Sud-Ouest (Tchéquie)', CZ04: 'Nord-Ouest (Tchéquie)', CZ05: 'Nord-Est (Tchéquie)', CZ06: 'Sud-Est (Tchéquie)', CZ07: 'Moravie centrale', CZ08: 'Moravie-Silésie',
    DE11: 'Stuttgart', DE12: 'Karlsruhe', DE13: 'Fribourg-en-Brisgau', DE14: 'Tübingen', DE21: 'Haute-Bavière', DE22: 'Basse-Bavière', DE23: 'Haut-Palatinat', DE24: 'Haute-Franconie', DE25: 'Moyenne-Franconie', DE26: 'Basse-Franconie', DE27: 'Souabe', DE30: 'Berlin', DE40: 'Brandebourg', DE50: 'Brême', DE60: 'Hambourg', DE80: 'Mecklembourg-Poméranie-Occidentale', DE92: 'Hanovre', DEA2: 'Cologne', DEB1: 'Coblence', DEB2: 'Trèves', DEB3: 'Hesse rhénane-Palatinat', DEC0: 'Sarre', DED2: 'Dresde', DED5: 'Leipzig', DEE0: 'Saxe-Anhalt', DEF0: 'Schleswig-Holstein', DEG0: 'Thuringe',
    DK01: 'Hovedstaden (Copenhague)', DK02: 'Seeland', DK03: 'Danemark du Sud', DK04: 'Jutland central', DK05: 'Jutland du Nord', EE00: 'Estonie',
    EL30: 'Attique', EL41: 'Égée-Septentrionale', EL42: 'Égée-Méridionale', EL43: 'Crète', EL51: 'Macédoine-Orientale-et-Thrace', EL52: 'Macédoine-Centrale', EL53: 'Macédoine-Occidentale', EL54: 'Épire', EL61: 'Thessalie', EL62: 'Îles Ioniennes', EL63: 'Grèce-Occidentale', EL64: 'Grèce-Centrale', EL65: 'Péloponnèse',
    ES11: 'Galice', ES12: 'Asturies', ES13: 'Cantabrie', ES21: 'Pays basque', ES22: 'Navarre', ES23: 'La Rioja', ES24: 'Aragon', ES30: 'Communauté de Madrid', ES41: 'Castille-et-León', ES42: 'Castille-La Manche', ES43: 'Estrémadure', ES51: 'Catalogne', ES52: 'Communauté valencienne', ES53: 'Îles Baléares', ES61: 'Andalousie', ES62: 'Région de Murcie', ES63: 'Ceuta', ES64: 'Melilla', ES70: 'Îles Canaries',
    FI19: 'Finlande occidentale', FI1B: 'Helsinki-Uusimaa', FI1C: 'Finlande méridionale', FI1D: 'Finlande du Nord et de l’Est', FI20: 'Åland',
    FR10: 'Île-de-France', FRB0: 'Centre-Val de Loire', FRD1: 'Basse-Normandie', FRD2: 'Haute-Normandie', FRE1: 'Nord-Pas-de-Calais',
    HR02: 'Croatie pannonienne', HR03: 'Croatie adriatique', HR05: 'Zagreb', HR06: 'Croatie du Nord', HU11: 'Budapest', HU21: 'Transdanubie centrale', HU22: 'Transdanubie occidentale', HU23: 'Transdanubie méridionale', HU31: 'Hongrie du Nord', HU32: 'Grande Plaine du Nord', HU33: 'Grande Plaine du Sud',
    IE04: 'Irlande du Nord et de l’Ouest', IE05: 'Irlande du Sud', IE06: 'Irlande de l’Est et des Midlands', IS00: 'Islande',
    ITC1: 'Piémont', ITC2: 'Vallée d’Aoste', ITC3: 'Ligurie', ITC4: 'Lombardie', ITF1: 'Abruzzes', ITF2: 'Molise', ITF3: 'Campanie', ITF4: 'Pouilles', ITF5: 'Basilicate', ITF6: 'Calabre', ITG1: 'Sicile', ITG2: 'Sardaigne', ITH1: 'Province de Bolzano', ITH2: 'Province de Trente', ITH3: 'Vénétie', ITH4: 'Frioul-Vénétie Julienne', ITH5: 'Émilie-Romagne', ITI1: 'Toscane', ITI2: 'Ombrie', ITI3: 'Marches', ITI4: 'Latium',
    LI00: 'Liechtenstein', LT01: 'Région de la capitale (Lituanie)', LT02: 'Lituanie centrale et occidentale', LU00: 'Luxembourg', LV00: 'Lettonie', ME00: 'Monténégro', MK00: 'Macédoine du Nord', MT00: 'Malte', XK00: 'Kosovo',
    NL11: 'Groningue', NL12: 'Frise', NL13: 'Drenthe', NL21: 'Overijssel', NL22: 'Gueldre', NL23: 'Flevoland', NL32: 'Hollande-Septentrionale', NL34: 'Zélande', NL35: 'Utrecht', NL36: 'Hollande-Méridionale', NL41: 'Brabant-Septentrional', NL42: 'Limbourg (Pays-Bas)',
    NO02: 'Innlandet', NO06: 'Trøndelag', NO07: 'Norvège du Nord', NO08: 'Oslo et Viken', NO09: 'Agder et Sør-Østlandet', NO0A: 'Vestlandet', NO0B: 'Svalbard et Jan Mayen',
    PL21: 'Petite-Pologne', PL22: 'Silésie', PL41: 'Grande-Pologne', PL42: 'Poméranie-Occidentale', PL43: 'Lubusz', PL51: 'Basse-Silésie', PL52: 'Opole', PL61: 'Couïavie-Poméranie', PL62: 'Varmie-Mazurie', PL63: 'Poméranie', PL71: 'Łódź', PL72: 'Sainte-Croix', PL81: 'Lublin', PL82: 'Basses-Carpates', PL84: 'Podlachie', PL91: 'Varsovie-capitale', PL92: 'Mazovie régionale',
    PT11: 'Nord (Portugal)', PT15: 'Algarve', PT19: 'Centre (Portugal)', PT1A: 'Grand Lisbonne', PT1B: 'Péninsule de Setúbal', PT1C: 'Alentejo', PT1D: 'Ouest et vallée du Tage', PT20: 'Açores', PT30: 'Madère',
    RO11: 'Nord-Ouest (Roumanie)', RO12: 'Centre (Roumanie)', RO21: 'Nord-Est (Roumanie)', RO22: 'Sud-Est (Roumanie)', RO31: 'Sud-Munténie', RO32: 'Bucarest-Ilfov', RO41: 'Sud-Ouest Olténie', RO42: 'Ouest (Roumanie)',
    RS11: 'Belgrade', RS12: 'Voïvodine', RS21: 'Choumadie et Serbie occidentale', RS22: 'Serbie méridionale et orientale', SE11: 'Stockholm', SE12: 'Suède centrale orientale', SE21: 'Småland et les îles', SE22: 'Suède du Sud', SE23: 'Suède occidentale', SE31: 'Suède centrale du Nord', SE32: 'Norrland central', SE33: 'Haut-Norrland',
    SI03: 'Slovénie orientale', SI04: 'Slovénie occidentale', SK01: 'Région de Bratislava', SK02: 'Slovaquie occidentale', SK03: 'Slovaquie centrale', SK04: 'Slovaquie orientale', BA01: 'Fédération de Bosnie-et-Herzégovine', BA02: 'République serbe de Bosnie', BA03: 'District de Brčko', AL01: 'Albanie du Nord', AL02: 'Albanie centrale', AL03: 'Albanie du Sud',
    BG31: 'Nord-Ouest (Bulgarie)', BG32: 'Centre-Nord (Bulgarie)', BG33: 'Nord-Est (Bulgarie)', BG34: 'Sud-Est (Bulgarie)', BG41: 'Sud-Ouest (Bulgarie)', BG42: 'Centre-Sud (Bulgarie)', TR10: 'Istanbul', TR31: 'Izmir', TR51: 'Ankara',
};
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^Prov\. /, '').trim();
const nutsName = f => NUTS_FR[f.properties.id] || clean(f.properties.na);
const nutsFeats = (file, filter = () => true) => { const t = readJson(file); return feature(t, t.objects.nutsrg).features.filter(filter); };
const nutsZone = f => ({type: 'Feature', geometry: f.geometry, properties: {i: f.properties.id, n: nutsName(f), a: [clean(f.properties.na)].filter(x => x !== nutsName(f)), p: f.properties.id.slice(0, 2)}});
write('eu-nuts1', {name: 'Europe — grandes régions (NUTS 1)', attr: NUTS_ATTR, codes: 'NUTS 1'}, nutsFeats('nuts-10M-1.json').map(nutsZone), {keep: .6, q: 1e5});
write('eu-nuts2', {name: 'Europe — régions (NUTS 2)', attr: NUTS_ATTR, codes: 'NUTS 2'}, nutsFeats('nuts-10M-2.json').map(nutsZone), {keep: .5, q: 1e5});

/* ═════════ Belgique, Suisse (NUTS, échelle 1:3 000 000) ═════════ */
const BE_ISO = {BE10: 'BRU', BE21: 'VAN', BE22: 'VLI', BE23: 'VOV', BE24: 'VBR', BE25: 'VWV', BE31: 'WBR', BE32: 'WHT', BE33: 'WLG', BE34: 'WLX', BE35: 'WNA'};
write('be-provinces', {name: 'Belgique — provinces', attr: NUTS_ATTR, codes: 'NUTS 2, ISO 3166-2:BE'}, nutsFeats('nuts-03M-2.json', f => /^BE/.test(f.properties.id)).map(f => { const z = nutsZone(f); z.properties.n = NUTS_FR[f.properties.id].replace(/ \(Belgique\)$/, ''); z.properties.a.push(BE_ISO[f.properties.id], NUTS_FR[f.properties.id]); z.properties.p = f.properties.id.slice(0, 3); return z; }), {keep: .45, q: 1e5});
write('be-regions', {name: 'Belgique — régions', attr: NUTS_ATTR, codes: 'NUTS 1'}, (() => { const t = readJson('nuts-03M-2.json'); const g = t.objects.nutsrg.geometries.filter(x => /^BE/.test(x.properties.id)); return ['BE1', 'BE2', 'BE3'].map(c => ({type: 'Feature', geometry: merge(t, g.filter(x => x.properties.id.startsWith(c))), properties: {i: c, n: {BE1: 'Bruxelles-Capitale', BE2: 'Flandre', BE3: 'Wallonie'}[c], a: [{BE1: 'Région de Bruxelles-Capitale', BE2: 'Région flamande', BE3: 'Région wallonne'}[c]]}})); })(), {keep: .45, q: 1e5});
const CH_FR = {CH011: ['Vaud', 'VD'], CH012: ['Valais', 'VS'], CH013: ['Genève', 'GE'], CH021: ['Berne', 'BE'], CH022: ['Fribourg', 'FR'], CH023: ['Soleure', 'SO'], CH024: ['Neuchâtel', 'NE'], CH025: ['Jura', 'JU'], CH031: ['Bâle-Ville', 'BS'], CH032: ['Bâle-Campagne', 'BL'], CH033: ['Argovie', 'AG'], CH040: ['Zurich', 'ZH'],
    CH051: ['Glaris', 'GL'], CH052: ['Schaffhouse', 'SH'], CH053: ['Appenzell Rhodes-Extérieures', 'AR'], CH054: ['Appenzell Rhodes-Intérieures', 'AI'], CH055: ['Saint-Gall', 'SG'], CH056: ['Grisons', 'GR'], CH057: ['Thurgovie', 'TG'], CH061: ['Lucerne', 'LU'], CH062: ['Uri', 'UR'], CH063: ['Schwytz', 'SZ'], CH064: ['Obwald', 'OW'], CH065: ['Nidwald', 'NW'], CH066: ['Zoug', 'ZG'], CH070: ['Tessin', 'TI']};
write('ch-cantons', {name: 'Suisse — cantons', attr: NUTS_ATTR, codes: 'NUTS 3, abréviation du canton (VD, GE…)'}, nutsFeats('nuts-03M-3.json', f => /^CH/.test(f.properties.id)).map(f => { const [n, ab] = CH_FR[f.properties.id]; return {type: 'Feature', geometry: f.geometry, properties: {i: f.properties.id, n, a: [ab, 'CH-' + ab, ...clean(f.properties.na).split(' / ')].filter(x => x !== n), p: f.properties.id.slice(0, 4)}}; }), {keep: .45, q: 1e5});
write('ch-regions', {name: 'Suisse — grandes régions', attr: NUTS_ATTR, codes: 'NUTS 2'}, nutsFeats('nuts-03M-2.json', f => /^CH/.test(f.properties.id)).map(nutsZone), {keep: .45, q: 1e5});

/* ═════════ Luxembourg : cantons (geoBoundaries, d'après OpenStreetMap — ODbL) ═════════ */
write('lu-cantons', {name: 'Luxembourg — cantons', attr: '© les contributeurs d’OpenStreetMap (ODbL), via geoBoundaries', codes: 'ISO 3166-2:LU (LU-CA…)'},
    readJson('lux-geoBoundaries-LUX-ADM1_simplified.geojson').features.map(f => { const n = String(f.properties.shapeName).replace(/^Canton /, ''); return {type: 'Feature', geometry: f.geometry, properties: {i: f.properties.shapeISO, n, a: [f.properties.shapeISO.slice(3), 'Canton ' + n]}}; }), {keep: .35, q: 1e5});
