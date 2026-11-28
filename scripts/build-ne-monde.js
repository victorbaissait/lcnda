'use strict';
/**
 * 🌍 Carte du monde hors ligne (fond « Hors ligne ») :
 *   node scripts/build-ne-monde.js chemin/vers/countries-50m.json
 * Entrée : world-atlas 2.0.2 (npm, licence ISC), redistribution TopoJSON de Natural Earth 4.1.0, pays au 1/50 000 000.
 * Natural Earth est dans le domaine public (https://www.naturalearthdata.com/about/terms-of-use/).
 * Sortie : assets/data/ne-monde-50m.json.gz = pour chaque pays : nom, rectangle englobant et anneaux en centièmes de degré
 * (≈ 1 km), lus par lib/offline_map.php pour dessiner les tuiles hors ligne. Rien d'autre n'est changé.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const src = process.argv[2];
if (!src) { console.error('Usage : node scripts/build-ne-monde.js countries-50m.json'); process.exit(1); }
const topo = JSON.parse(fs.readFileSync(src, 'utf8'));
const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
const ring = idx => { const pts = []; idx.forEach(i => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; a.forEach((p, j) => { if (j || !pts.length) pts.push(p); }); }); return pts; };
const countries = [];
for (const g of topo.objects.countries.geometries) {
    if (!g.arcs) continue;
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    const rings = [];
    // un anneau qui passe la ligne de changement de date (180°) : longitudes « déroulées » (190° plutôt que -170°),
    // puis une 2e copie décalée de 360° pour que les deux bords de la carte soient remplis
    const unwrap = pts => { let prev = null, off = 0; return pts.map(([lon, lat]) => { if (prev !== null) { const d = lon + off - prev; if (d > 180) off -= 360; else if (d < -180) off += 360; } prev = lon + off; return [prev, lat]; }); };
    const copies = pts => { const lons = pts.map(p => p[0]), mx = Math.max(...lons), mn = Math.min(...lons); return mx > 180 ? [pts, pts.map(([a, b]) => [a - 360, b])] : mn < -180 ? [pts, pts.map(([a, b]) => [a + 360, b])] : [pts]; };
    polys.forEach(poly => poly.forEach(r => copies(unwrap(ring(r))).forEach(pts => {
        const flat = []; let lx = null, ly = null;
        pts.forEach(([lon, lat]) => {
            const x = Math.round(lon * 100), y = Math.round(Math.max(-85, Math.min(85, lat)) * 100);
            if (x === lx && y === ly) return; flat.push(x, y); lx = x; ly = y;
            b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
        });
        if (flat.length >= 6) rings.push(flat);
    })));
    if (rings.length) countries.push({n: g.properties?.name || '', b, r: rings});
}
const out = path.resolve(__dirname, '..', 'assets', 'data', 'ne-monde-50m.json.gz');
const json = JSON.stringify({source: 'Natural Earth 4.1.0 (1:50m, Admin 0 – Countries), via world-atlas 2.0.2', licence: 'Domaine public — https://www.naturalearthdata.com/about/terms-of-use/', unit: 'centièmes de degré', countries});
fs.writeFileSync(out, zlib.gzipSync(json, {level: 9}));
console.log(`${countries.length} pays, ${(json.length / 1024).toFixed(0)} Ko → ${(fs.statSync(out).size / 1024).toFixed(0)} Ko gz → ${out}`);
