'use strict';
/**
 * Fonds de carte « Communes (villes) » des diagrammes « Cartes » (voisin de scripts/build-geo-maps.js) :
 *   NODE_PATH=chemin/node_modules node scripts/build-geo-communes.js dossier-des-sources [fr be ch lu]
 * Modules npm (dans NODE_PATH) : topojson-server, topojson-simplify, topojson-client (ISC). Node 22 (node:sqlite).
 * Fichiers du dossier des sources (téléchargés tels quels, voir assets/data/geo/LICENCES.txt) :
 *   fr-communes-avec-outre-mer.geojson ← github.com/gregoiredavid/france-geojson (IGN Admin Express COG 2018, Licence Ouverte)
 *   cog-communes.json                  ← npm @etalab/decoupage-administratif 6.0.0, data/communes.json (INSEE, COG 2025, Licence Ouverte)
 *   geo-be.sqlite.gz, geo-ch.sqlite.gz, geo-lu.sqlite.gz ← data/reference/ de LCNDA (scripts/build-reference-europe.php :
 *       Belgique IGN-NGI 2025 licence ouverte ; Suisse swissBOUNDARIES3D 2026 © swisstopo Opendata BY ;
 *       Luxembourg Administration du cadastre et de la topographie CC0 ; lieux GeoNames CC BY 4.0)
 *   be-municipalities.json             ← npm be-legal-data 0.2.0, data/municipalities.json (© Statbel, CC BY 4.0)
 * Sortie : assets/data/geo/<pays>-communes.json.gz (JSON compressé en gzip), même forme que les autres fonds ({v, id, name, attr, codes, bbox, topo}),
 * plus « more » (une topologie par département d'outre-mer, pour garder la précision) et « pfx » (préfixe des codes
 * de l'app : « BE-57081 »). Chaque commune : i (code INSEE ou officiel), n (nom), a (autres noms et anciens codes),
 * p (département, province, canton ; pour la France, déduit du code INSEE quand il manque), l (point d'étiquette,
 * seulement quand le centre de la boîte tombe mal), o (1 = outre-mer, dessiné en encart).
 * France : les tracés 2018 sont fondus (topojson merge, aucun tracé nouveau) en communes au 1er janvier 2025 d'après le COG ;
 * les communes déléguées ou associées et les arrondissements de Paris, Lyon et Marseille deviennent des « autres noms ».
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {topology} = require('topojson-server');
const {presimplify, simplify, quantile} = require('topojson-simplify');
const {feature, merge, neighbors, quantize} = require('topojson-client');

const SRC = process.argv[2];
if (!SRC) { console.error('Usage : NODE_PATH=… node scripts/build-geo-communes.js dossier-des-sources [fr be ch lu]'); process.exit(1); }
const ONLY = process.argv.slice(3);
const want = c => !ONLY.length || ONLY.includes(c);
const OUT = path.resolve(__dirname, '..', 'assets', 'data', 'geo');
const readJson = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const r3 = v => Math.round(v * 1000) / 1000;

/* ── outils géométriques (en degrés) ── */
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h));
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y); }
const bboxOfGeom = g => { const b = [Infinity, Infinity, -Infinity, -Infinity]; polysOf(g).forEach(p => p[0].forEach(([x, y]) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; })); return b; };
/** point d'étiquette : dans la plus grande partie, le plus loin des bords (grille 14 × 14) ; null si le centre de la boîte convient */
function labelPoint(g) {
    const polys = polysOf(g); if (!polys.length) return null;
    const big = polys.map(p => [p, Math.abs(ringArea(p[0]))]).sort((a, b) => b[1] - a[1])[0][0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; big[0].forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180) || 1;
    const dist = (x, y) => { let d = Infinity; big.forEach(r => { for (let a = 0, b = r.length - 1; a < r.length; b = a++) d = Math.min(d, segDist(x * k, y, r[a][0] * k, r[a][1], r[b][0] * k, r[b][1])); }); return d; };
    let best = null, bd = -1;
    for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
        const x = x0 + (x1 - x0) * (i + .5) / 14, y = y0 + (y1 - y0) * (j + .5) / 14; if (!inPoly(x, y, big)) continue;
        const d = dist(x, y); if (d > bd) { bd = d; best = [x, y]; }
    }
    // le centre de la boîte entière (ce que l'app prend sans « l ») : gardé s'il est dedans et presque aussi loin des bords
    const gb = bboxOfGeom(g), cx = (gb[0] + gb[2]) / 2, cy = (gb[1] + gb[3]) / 2;
    if (inPoly(cx, cy, big) && (!best || dist(cx, cy) >= bd * .6)) return null;
    return best ? best.map(r3) : null;
}

/** des zones GeoJSON → une topologie quantifiée et simplifiée (garde « keep » des points) */
function topoOf(feats, keep, q) {
    let topo = topology({z: {type: 'FeatureCollection', features: feats}}, q);
    if (keep < 1) { topo = presimplify(topo); topo = simplify(topo, quantile(topo, keep)); topo = quantize(topo, q); }
    const simple = feature(topo, topo.objects.z).features;
    topo.objects.z.geometries.forEach((g, i) => {
        const p = g.properties || {}; const l = labelPoint(simple[i]?.geometry); if (l) p.l = l;
        Object.keys(p).forEach(k => { if (p[k] === undefined || p[k] === '' || (Array.isArray(p[k]) && !p[k].length)) delete p[k]; });
        g.properties = p; delete g.id;
    });
    topo.objects.z.geometries = topo.objects.z.geometries.filter(g => g.type);
    return topo;
}
function write(id, meta, topos) {
    const [topo, ...more] = topos;
    const out = {v: 1, id, ...meta, topo}; if (more.length) out.more = more;
    // compressé (gzip) : l'app le décompresse elle-même (DecompressionStream), sans rien demander au serveur
    const file = path.join(OUT, id + '.json.gz'), json = JSON.stringify(out);
    fs.writeFileSync(file, zlib.gzipSync(json, {level: 9}));
    const n = topos.reduce((s, t) => s + t.objects.z.geometries.length, 0);
    console.log(`${id} : ${n} communes, ${(json.length / 1024).toFixed(0)} Ko décompressé, ${(fs.statSync(file).size / 1024).toFixed(0)} Ko livré (gzip)`);
}
/** les zones d'un fond déjà fabriqué (pour trouver la province ou le canton d'une commune) */
function zonesOfBase(id) {
    const raw = JSON.parse(fs.readFileSync(path.join(OUT, id + '.json'), 'utf8'));
    return feature(raw.topo, raw.topo.objects.z).features.map(f => ({id: String(f.properties.i), keys: [f.properties.n, ...(f.properties.a || [])].map(fold), geom: f.geometry, bbox: bboxOfGeom(f.geometry)}));
}
/** la province ou le canton : d'abord d'après les lieux GeoNames de la commune (nom de la province ou du canton), sinon
 *  le fond des provinces (point dans le contour, sinon la plus proche) */
function parentOf(zones, names, [x, y]) {
    for (const n of names) { const z = zones.find(zz => zz.keys.includes(fold(n))); if (z) return z.id; }
    const hit = zones.find(z => x >= z.bbox[0] && x <= z.bbox[2] && y >= z.bbox[1] && y <= z.bbox[3] && polysOf(z.geom).some(p => inPoly(x, y, p))); if (hit) return hit.id;
    let best = '', bd = Infinity; zones.forEach(z => polysOf(z.geom).forEach(p => p[0].forEach(([px, py]) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = z.id; } }))); return best;
}
/** un point sûr de la commune (pour la rattacher à sa province) */
const anyInside = g => { const b = bboxOfGeom(g), big = polysOf(g).sort((a, c) => Math.abs(ringArea(c[0])) - Math.abs(ringArea(a[0])))[0]; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const x = b[0] + (b[2] - b[0]) * (i + .5) / 12, y = b[1] + (b[3] - b[1]) * (j + .5) / 12; if (big && inPoly(x, y, big)) return [x, y]; } return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
const uniq = (list, not = []) => { const seen = new Set(not.map(fold)); return list.filter(x => { const f = fold(x); if (!x || !f || seen.has(f)) return false; seen.add(f); return true; }); };

/* ═════════ France ═════════ */
if (want('fr')) {
    const geo = readJson('fr-communes-avec-outre-mer.geojson').features.filter(f => f.geometry && polysOf(f.geometry).length);
    const cog = readJson('cog-communes.json');
    const act = new Map(cog.filter(x => x.type === 'commune-actuelle').map(x => [x.code, x]));
    const deleg = new Map(); cog.filter(x => x.type === 'commune-deleguee' || x.type === 'commune-associee').forEach(x => { if (!deleg.has(x.code)) deleg.set(x.code, x); });
    const arrMun = cog.filter(x => x.type === 'arrondissement-municipal');
    const delegOf = new Map(); deleg.forEach(d => { if (d.chefLieu) (delegOf.get(d.chefLieu) || delegOf.set(d.chefLieu, []).get(d.chefLieu)).push(d); });
    const ARTICLE = /^(le|la|les|l)\s/;
    // chaque tracé 2018 → la commune d'aujourd'hui qui le contient
    const targetOf = code => act.has(code) ? code : deleg.has(code) && act.has(deleg.get(code).chefLieu) ? deleg.get(code).chefLieu : '';
    const parts = new Map(); // code d'aujourd'hui → [indices des tracés 2018]
    const orphans = [];
    geo.forEach((f, i) => { const t = targetOf(String(f.properties.code)); if (t) (parts.get(t) || parts.set(t, []).get(t)).push(i); else orphans.push(i); });
    // tracés dont le code a disparu sans commune déléguée : rattachés à la commune voisine issue d'une fusion
    {
        const topo0 = topology({z: {type: 'FeatureCollection', features: geo.map(f => ({type: 'Feature', geometry: f.geometry, properties: {}}))}}, 1e6);
        const nb = neighbors(topo0.objects.z.geometries), tgt = new Map(); parts.forEach((ix, t) => ix.forEach(i => tgt.set(i, t)));
        let kept = 0;
        for (const i of orphans) {
            // la voisine dont le nom d'aujourd'hui contient l'ancien nom (Courcouronnes → Évry-Courcouronnes), sinon une
            // voisine née d'une fusion (elle a des communes déléguées) ; sinon l'ancienne commune reste seule, marquée « x »
            const dep = String(geo[i].properties.code).slice(0, 2), cands = [...new Set((nb[i] || []).map(j => tgt.get(j)).filter(t => t && t.slice(0, 2) === dep))];
            const old = fold(geo[i].properties.nom), named = cands.filter(t => fold(act.get(t)?.nom).includes(old));
            const merged = cands.filter(t => delegOf.has(t));
            const t = named[0] || (merged.length === 1 ? merged[0] : '');
            if (t) { parts.get(t).push(i); tgt.set(i, t); } else { kept++; parts.set(String(geo[i].properties.code), [i]); }
        }
        console.log(`France : ${geo.length} tracés 2018, ${parts.size} communes 2025 dessinées, ${orphans.length} anciens codes rattachés à une voisine (${kept} laissés seuls)`);
    }
    // les communes d'aujourd'hui : tracés fondus, nom du COG, anciens noms et codes
    const quant = 1e6, byDep = new Map();
    const topoAll = topology({z: {type: 'FeatureCollection', features: geo.map(f => ({type: 'Feature', geometry: f.geometry, properties: {}}))}}, quant);
    for (const [code, ix] of parts) {
        const now = act.get(code), name = now?.nom || deleg.get(code)?.nom || geo[ix[0]].properties.nom;
        const geometry = ix.length === 1 ? geo[ix[0]].geometry : merge(topoAll, ix.map(i => topoAll.objects.z.geometries[i]));
        const olds = ix.map(i => String(geo[i].properties.code)).filter(c => c !== code);
        const oldNames = ix.map(i => deleg.get(String(geo[i].properties.code))?.nom || (String(geo[i].properties.code) !== code ? geo[i].properties.nom : '')).filter(Boolean);
        const dele = (delegOf.get(code) || []).filter(d => d.code !== code); // communes déléguées sans tracé 2018 à elles
        const arr = arrMun.filter(a => a.commune === code);
        const noArt = n => fold(n).replace(ARTICLE, '');
        const alt = [...new Set([...olds, ...dele.map(d => d.code), ...arr.map(a => a.code)])].filter(c => c !== code)
            .concat(uniq([...oldNames, ...dele.map(d => d.nom), ...arr.map(a => a.nom), geo[ix[0]].properties.nom].filter(n => noArt(n) !== noArt(name)), [name]));
        const dep = code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2), outre = dep.length === 3;
        const props = {i: code, n: name, a: alt.length ? alt : undefined, o: outre ? 1 : undefined};
        if (!act.has(code)) props.x = 1; // ancienne commune sans successeur trouvé
        (byDep.get(outre ? dep : 'metro') || byDep.set(outre ? dep : 'metro', []).get(outre ? dep : 'metro')).push({type: 'Feature', geometry, properties: props});
    }
    const KEEP = Number(process.env.FR_KEEP || .085), Q = Number(process.env.FR_Q || 4e4);
    const metro = topoOf(byDep.get('metro'), KEEP, Q);
    const doms = [...byDep.keys()].filter(k => k !== 'metro').sort().map(k => topoOf(byDep.get(k), Math.min(1, KEEP * 2.5), 8e3));
    write('fr-communes', {name: 'France — communes', attr: 'IGN Admin Express COG 2018 (tracés), INSEE COG 2025 (communes), Licence Ouverte Etalab, via france-geojson et @etalab/decoupage-administratif',
        codes: 'INSEE (35238…) ; anciens codes et arrondissements municipaux en autres noms', parentFromCode: 1, parentBase: 'fr-departements', bbox: [-5.15, 41.33, 9.57, 51.09]}, [metro, ...doms]);
}

/* ═════════ Belgique, Suisse, Luxembourg (fichiers de référence de LCNDA) ═════════ */
function refDb(cc) {
    const tmp = path.join(os.tmpdir(), `lcnda-geo-${cc}-${process.pid}.sqlite`);
    fs.writeFileSync(tmp, zlib.gunzipSync(fs.readFileSync(path.join(SRC, `geo-${cc}.sqlite.gz`))));
    const {DatabaseSync} = require('node:sqlite'); const db = new DatabaseSync(tmp, {readOnly: true});
    return {db, done: () => { db.close(); fs.unlinkSync(tmp); }};
}
// noms français des grandes villes suisses (le nom officiel reste celui de swisstopo)
const CH_FR = {Bern: 'Berne', Basel: 'Bâle', Luzern: 'Lucerne', Solothurn: 'Soleure', Schaffhausen: 'Schaffhouse', 'St. Gallen': 'Saint-Gall', Chur: 'Coire', Thun: 'Thoune', Sion: 'Sitten', Fribourg: 'Freiburg',
    'Biel/Bienne': 'Bienne', Neuchâtel: 'Neuenburg', Lugano: 'Lugano', Zug: 'Zoug', Glarus: 'Glaris', Schwyz: 'Schwytz', Altdorf: 'Altdorf (Uri)', Sarnen: 'Sarnen', Stans: 'Stans', Aarau: 'Aarau', Liestal: 'Liestal', Frauenfeld: 'Frauenfeld', Herisau: 'Herisau', Bellinzona: 'Bellinzone', Locarno: 'Locarno'};
const LATIN = /^[\p{Script=Latin}][\p{Script=Latin}\s'’.\-]{1,39}$/u;
/** autres noms d'une commune : ses langues (lignes principales GeoNames) et ses anciennes communes ou sections peuplées */
function altNames(db, code, name, withLangs) {
    const rows = db.prepare("SELECT name, subdivision, alternate_names AS alt, feature_code AS fc, population AS pop FROM geo_places WHERE admin4_code=?").all(code);
    const langs = rows.filter(r => !r.subdivision && /^(PPLA\d?|PPLC|ADM\d?)$/.test(r.fc || '')).flatMap(r => String(r.alt || '').split(',')).map(s => s.trim()).filter(s => LATIN.test(s) && /^\p{Lu}/u.test(s));
    const subs = rows.filter(r => r.subdivision && Number(r.pop) > 0 && /^(PPL|PPLA\d?|PPLX)$/.test(r.fc || '')).sort((a, b) => b.pop - a.pop)
        .map(r => String(r.subdivision).replace(/^.*\s\/\s/, '').replace(/\s*\(.*\)\s*$/, '').trim()).filter(s => LATIN.test(s));
    // langues : seulement au Luxembourg (français, allemand, luxembourgeois), noms d'un seul tenant
    const own = withLangs ? langs.filter(s => !/\s/.test(s) && s.length >= 4 && s !== s.toUpperCase()).slice(0, 3) : [];
    return uniq([...own, ...subs.slice(0, 10)], [name]);
}
function country(cc, {name, attr, codes, parentBase, parentCol, pfx, keep, q, nameOf}) {
    const {db, done} = refDb(cc), parents = zonesOfBase(parentBase);
    const feats = db.prepare('SELECT insee_code AS code, name, geometry_json AS g FROM commune_contours ORDER BY insee_code').all().map(r => {
        const geometry = JSON.parse(r.g), code = String(r.code).replace(/^[A-Z]{2}-/, ''), [n, more] = nameOf ? nameOf(code, r.name) : [r.name, CH_FR[r.name] ? [CH_FR[r.name]] : []];
        const a = uniq([...more, ...String(r.name).split(/\s*\/\s*/), ...altNames(db, r.code, n, cc === 'lu')], [n]).filter(x => x !== code);
        const homes = db.prepare(`SELECT ${parentCol} AS k, COUNT(*) AS c FROM geo_places WHERE admin4_code=? AND ${parentCol}<>'' GROUP BY 1 ORDER BY 2 DESC`).all(r.code).map(x => String(x.k));
        return {type: 'Feature', geometry, properties: {i: code, n, a, p: parentOf(parents, homes, anyInside(geometry))}};
    });
    done();
    write(`${cc}-communes`, {name, attr, codes, pfx, parentBase}, [topoOf(feats, keep, q)]);
}
if (want('be')) {
    const st = new Map(readJson('be-municipalities.json').map(m => [String(m.refnis), m.name || {}]));
    country('be', {name: 'Belgique — communes', attr: 'IGN-NGI 2025 (licence ouverte) ; noms Statbel (CC BY 4.0) ; anciennes communes GeoNames (CC BY 4.0)', codes: 'INS / REFNIS (46030…), « BE-46030 »',
        parentBase: 'be-provinces', parentCol: 'county', pfx: 'BE-', keep: .35, q: 3e4, nameOf: (code, n) => { const s = st.get(code) || {}; const fr = s.fr || n; return [fr, uniq([s.nl, s.de, n].filter(Boolean), [fr])]; }});
}
if (want('ch')) country('ch', {name: 'Suisse — communes', attr: '© swisstopo, swissBOUNDARIES3D 2026 (Opendata BY) ; anciennes communes GeoNames (CC BY 4.0)', codes: 'n° OFS (5586…), « CH-5586 »', parentBase: 'ch-cantons', parentCol: 'state', pfx: 'CH-', keep: .3, q: 3e4});
if (want('lu')) country('lu', {name: 'Luxembourg — communes', attr: 'Administration du cadastre et de la topographie (data.public.lu, CC0) ; noms GeoNames (CC BY 4.0)', codes: 'code LAU (0304…), « LU-0304 »', parentBase: 'lu-cantons', parentCol: 'county', pfx: 'LU-', keep: .5, q: 2e4});
