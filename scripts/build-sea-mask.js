'use strict';
/**
 * Fabrique assets/data/sea-mask.bin : la carte terre / mer du monde utilisée pour tracer les traversées en bateau
 * (trajets qui ne passent que par la mer).
 *   node scripts/build-sea-mask.js chemin/vers/land-50m.json
 * Source : Natural Earth 1:50m (domaine public), au format TopoJSON du paquet npm « world-atlas » (licence ISC).
 * Grille de 0,2° (1800 × 900 cases) ; 1 bit par case, 1 = mer. Ligne 0 = 90° N, colonne 0 = 180° O.
 * Les détroits trop étroits pour la grille sont ouverts à la main ; les canaux (Suez, Kiel, Panama) ne le sont pas :
 * l'application les ouvre selon l'année du voyage (voir assets/js/heritage.js).
 */
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
if (!src) { console.error('Usage : node scripts/build-sea-mask.js land-50m.json'); process.exit(2); }
const topo = JSON.parse(fs.readFileSync(src, 'utf8'));
const STEP = 0.2, COLS = 360 / STEP, ROWS = 180 / STEP;
const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
const ring = idx => idx.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
const polygons = [];
for (const g of topo.objects.land.geometries) {
    if (g.type === 'Polygon') polygons.push(g.arcs.map(ring));
    if (g.type === 'MultiPolygon') g.arcs.forEach(p => polygons.push(p.map(ring)));
}
const land = new Uint8Array(COLS * ROWS);
for (const poly of polygons) {
    const edges = [];
    let minLat = 90, maxLat = -90;
    for (const r of poly) {
        // Un contour qui passe la ligne de changement de date (Russie, Antarctique, Fidji) saute de +180° à −180° :
        // on enlève ce saut et on referme chaque morceau le long du méridien, des deux côtés
        const cross = [];
        for (let i = 0; i < r.length - 1; i++) {
            if (Math.abs(r[i + 1][0] - r[i][0]) > 180) { cross.push((r[i][1] + r[i + 1][1]) / 2); continue; }
            edges.push([r[i], r[i + 1]]); minLat = Math.min(minLat, r[i][1]); maxLat = Math.max(maxLat, r[i][1]);
        }
        cross.sort((x, y) => x - y);
        for (let k = 0; k + 1 < cross.length; k += 2) for (const x of [180, -180]) edges.push([[x, cross[k]], [x, cross[k + 1]]]);
    }
    const r0 = Math.max(0, Math.floor((90 - maxLat) / STEP)), r1 = Math.min(ROWS - 1, Math.ceil((90 - minLat) / STEP));
    for (let row = r0; row <= r1; row++) {
        const lat = 90 - (row + 0.5) * STEP, xs = [];
        for (const [[x1, y1], [x2, y2]] of edges) { if ((y1 <= lat) !== (y2 <= lat)) xs.push(x1 + (lat - y1) / (y2 - y1) * (x2 - x1)); }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const c0 = Math.max(0, Math.ceil((xs[k] + 180) / STEP - 0.5)), c1 = Math.min(COLS - 1, Math.floor((xs[k + 1] + 180) / STEP - 0.5));
            for (let c = c0; c <= c1; c++) land[row * COLS + c] = 1;
        }
    }
}
// Détroits toujours ouverts (plus étroits que la grille) : [lat, lon] → [lat, lon]
const STRAITS = [
    [[36.05, -6.2], [35.95, -5.0]],   // Gibraltar
    [[51.15, 1.2], [50.85, 1.8]],     // Pas-de-Calais
    [[40.0, 26.15], [40.45, 26.75], [40.75, 27.6], [41.0, 28.95], [41.25, 29.1]], // Dardanelles, mer de Marmara, Bosphore
    [[45.15, 36.45], [45.45, 36.6]],  // Kertch
    [[55.5, 12.75], [56.1, 12.6]],    // Øresund
    [[54.95, 10.9], [55.6, 10.95]],   // Grand Belt
    [[38.1, 15.6], [38.3, 15.65]],    // Messine
    [[41.3, 9.15], [41.4, 9.3]],      // Bonifacio
    [[12.4, 43.25], [12.7, 43.5]],    // Bab-el-Mandeb
    [[1.15, 103.5], [1.25, 104.1]],   // Singapour
    [[-10.6, 142.2], [-10.4, 142.5]], // Torres
    [[-53.0, -70.9], [-53.6, -70.9], [-53.9, -71.2]], // Magellan
    [[26.55, 56.2], [26.3, 56.6]],    // Ormuz
    [[47.0, -61.0], [47.3, -61.6]],   // golfe du Saint-Laurent (détroit de Canso / passage)
    [[29.95, 32.56], [29.5, 32.62], [29.0, 32.85], [28.5, 33.15], [28.0, 33.6], [27.5, 34.0]], // golfe de Suez (étroit pour la grille)
    [[37.75, -122.35], [37.81, -122.48], [37.79, -122.6]],  // Golden Gate (San Francisco)
    [[35.45, 139.65], [35.3, 139.75], [35.15, 139.75], [34.95, 139.8]], // baie de Tokyo (Yokohama)
    // Fleuves des grands ports d'émigration (trop étroits pour la grille) : le navire en sort par l'estuaire
    [[53.54, 9.97], [53.57, 9.7], [53.75, 9.35], [53.88, 9.0], [53.95, 8.6]],   // Elbe (Hambourg)
    [[53.08, 8.8], [53.3, 8.5], [53.55, 8.55], [53.75, 8.4]],                  // Weser (Brême, Bremerhaven)
    [[51.23, 4.4], [51.35, 4.25], [51.42, 3.9], [51.45, 3.55]],                // Escaut (Anvers)
    [[51.9, 4.45], [51.95, 4.15], [51.98, 4.0]],                               // Nouvelle Meuse (Rotterdam)
    [[49.44, 1.1], [49.43, 0.75], [49.45, 0.35], [49.47, 0.05]],               // Seine (Rouen)
    [[51.5, -0.05], [51.47, 0.4], [51.48, 0.8], [51.5, 1.1]],                   // Tamise (Londres)
    [[44.84, -0.55], [45.05, -0.65], [45.35, -0.85], [45.6, -1.05]],           // Garonne, Gironde (Bordeaux)
    [[47.21, -1.55], [47.25, -1.9], [47.28, -2.2]],                             // Loire (Nantes)
    [[45.5, -73.55], [46.0, -73.1], [46.35, -72.5], [46.81, -71.2], [47.3, -70.5]], // Saint-Laurent (Montréal, Québec)
    [[39.95, -75.15], [39.6, -75.55], [39.2, -75.3], [38.85, -75.05]],          // Delaware (Philadelphie)
    [[29.95, -90.05], [29.6, -89.6], [29.25, -89.35], [29.0, -89.2]],          // Mississippi (La Nouvelle-Orléans)
    [[55.86, -4.3], [55.92, -4.6], [55.95, -4.85]],                             // Clyde (Glasgow)
];
const open = (path, grid) => {
    for (let i = 0; i + 1 < path.length; i++) {
        const [la1, lo1] = path[i], [la2, lo2] = path[i + 1], n = Math.ceil(Math.max(Math.abs(la2 - la1), Math.abs(lo2 - lo1)) / (STEP / 3)) + 1;
        for (let k = 0; k <= n; k++) {
            const la = la1 + (la2 - la1) * k / n, lo = lo1 + (lo2 - lo1) * k / n;
            const r = Math.floor((90 - la) / STEP), c = Math.floor((lo + 180) / STEP);
            for (const [dr, dc] of [[0, 0], [0, 1], [1, 0]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) grid[rr * COLS + cc] = 0; }
        }
    }
};
STRAITS.forEach(s => open(s, land));
const bits = new Uint8Array(Math.ceil(COLS * ROWS / 8));
for (let i = 0; i < COLS * ROWS; i++) if (!land[i]) bits[i >> 3] |= 1 << (i & 7);
const out = path.join(__dirname, '..', 'assets', 'data', 'sea-mask.bin');
fs.writeFileSync(out, bits);
console.log(`${out} : ${COLS}×${ROWS}, ${bits.length} octets, ${polygons.length} terres, mer = ${(100 * (1 - land.reduce((a, b) => a + b, 0) / land.length)).toFixed(1)} %`);
