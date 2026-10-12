'use strict';
/**
 * Fond de carte du monde pour « Cartes d'électeur → le droit de vote dans le monde » :
 *   node scripts/build-world-map.js chemin/vers/countries-110m.json
 * Entrée : world-atlas (npm, licence ISC, d'après Natural Earth, domaine public), pays au 1/110 000 000.
 * Sortie : assets/data/world-110m.json = un tracé SVG par pays (code ISO numérique), projection Natural Earth,
 * sans l'Antarctique. Les micro-États absents de ce fond restent dans la liste déroulante.
 */
const fs = require('node:fs');
const path = require('node:path');

const src = process.argv[2];
if (!src) { console.error('Usage : node scripts/build-world-map.js countries-110m.json'); process.exit(1); }
const topo = JSON.parse(fs.readFileSync(src, 'utf8'));
const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
const rad = Math.PI / 180;
const project = (lon, lat) => { // Natural Earth I (même formule que d3-geo)
  const l = lon * rad, p = lat * rad, p2 = p * p, p4 = p2 * p2;
  return [l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))), p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))];
};
const W = 1000, [maxX] = project(180, 0), [, maxY] = project(0, 84), [, minY] = project(0, -58);
const k = W / (2 * maxX), H = Math.round((maxY - minY) * k);
const xy = ([lon, lat]) => { const [x, y] = project(lon, Math.max(-58, Math.min(84, lat))); return [(x + maxX) * k, (maxY - y) * k]; };
const ring = idx => { const pts = []; idx.forEach(i => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; a.forEach((p, j) => { if (j || !pts.length) pts.push(p); }); }); return pts; };
// Un anneau qui saute d'un bord à l'autre de la carte (ligne de changement de date) : on lève le crayon
const pathOf = rings => rings.map(r => {
  let last = '', prevLon = null, out = '', n = 0;
  r.forEach(p => {
    const [x, y] = xy(p), s = `${x.toFixed(1)},${y.toFixed(1)}`;
    const jump = prevLon !== null && Math.abs(p[0] - prevLon) > 180;
    if (s !== last) { out += (n === 0 || jump ? 'M' : 'L') + s; n++; }
    last = s; prevLon = p[0];
  });
  return n > 2 ? out + 'Z' : '';
}).join('');
const countries = [];
for (const g of topo.objects.countries.geometries) {
  if (g.id === '010' || !g.arcs) continue; // Antarctique
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  const d = polys.map(p => pathOf(p.map(ring))).join('');
  if (d) countries.push({ id: g.id || '', name: g.properties?.name || '', d });
}
const out = path.resolve(__dirname, '..', 'assets', 'data', 'world-110m.json');
fs.writeFileSync(out, JSON.stringify({ width: W, height: H, source: 'Natural Earth via world-atlas (domaine public / ISC)', countries }));
console.log(`${countries.length} pays, ${W}×${H}, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko → ${out}`);
