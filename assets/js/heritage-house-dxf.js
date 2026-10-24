/* LCNDA — 🏠 Plan de maison : ⤒ Importer et ⤓ Exporter au format DXF (AutoCAD, LibreCAD, DraftSight, QCAD, FreeCAD…).
 *  - export (DXF R12, lu partout) : un étage en centimètres, rangé par calques : MURS (le contour de chaque mur), MURS_AXES (leur axe),
 *    PIECES (contours, noms et surfaces), OUVERTURES (portes, fenêtres), MOBILIER, TEXTES, COTES ;
 *  - import : les lignes et polylignes deviennent des murs, les polylignes fermées des calques « pièce / room » deviennent des pièces
 *    (nommées par le texte posé dedans), les autres textes des étiquettes ; unité lue dans le fichier ($INSUNITS) ou devinée ;
 *    on choisit les calques à prendre. Arcs, cercles, blocs et hachures ne sont pas repris (le nombre en est dit).
 * Fonctions pures (aussi `require()` dans Node pour les tests) : toDxf, parseDxf, unitsGuess, toFloor.
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const r3 = v => Math.round(v * 1000) / 1000;
    const area = pts => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); };
    const centroid = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const pointIn = (poly, [x, y]) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) ins = !ins; } return ins; };
    /** un texte DXF : ASCII seulement, le reste en \U+XXXX (compris par AutoCAD et les autres) */
    const dxfStr = s => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, c => `\\U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).slice(0, 250);

    /* ═════════ Export ═════════ */
    const LAYERS = [['MURS', 7], ['MURS_AXES', 8], ['PIECES', 3], ['OUVERTURES', 4], ['MOBILIER', 6], ['TEXTES', 2], ['COTES', 5]];
    /** le DXF d'un étage ; « wallPts(w) » (facultatif) donne les points d'un mur courbe */
    function toDxf(f, {name = 'Maison', wallPts = null} = {}) {
        const out = [], P = (...a) => { for (let i = 0; i < a.length; i += 2) out.push(String(a[i]), String(a[i + 1])); };
        const Y = y => -y; // le plan descend vers le bas, le DXF monte
        const line = (layer, a, b) => P(0, 'LINE', 8, layer, 10, r3(a[0]), 20, r3(Y(a[1])), 30, 0, 11, r3(b[0]), 21, r3(Y(b[1])), 31, 0);
        const poly = (layer, pts, closed) => { P(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 1 : 0); pts.forEach(p => P(0, 'VERTEX', 8, layer, 10, r3(p[0]), 20, r3(Y(p[1])), 30, 0)); P(0, 'SEQEND', 8, layer); };
        const text = (layer, [x, y], s, h, center = false) => { if (!String(s ?? '').trim()) return; P(0, 'TEXT', 8, layer, 10, r3(x), 20, r3(Y(y)), 30, 0, 40, r3(h), 1, dxfStr(s)); if (center) P(72, 1, 11, r3(x), 21, r3(Y(y)), 31, 0); };
        P(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 5, 0, 'ENDSEC');
        P(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, LAYERS.length); LAYERS.forEach(([n, c]) => P(0, 'LAYER', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS')); P(0, 'ENDTAB', 0, 'ENDSEC');
        P(0, 'SECTION', 2, 'ENTITIES');
        const T0 = Number(f.wallT) || 20;
        (f.walls || []).forEach(w => {
            const pts = wallPts && w.bulge ? wallPts(w, 16) : [w.a, w.b], t = (Number(w.t) || T0) / 2;
            poly('MURS_AXES', pts, false);
            const side = s => pts.map((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], L = Math.hypot(dx, dy) || 1; return [p[0] - dy / L * t * s, p[1] + dx / L * t * s]; });
            poly('MURS', [...side(1), ...side(-1).reverse()], true);
        });
        (f.rooms || []).forEach(rm => { if (!rm.pts?.length) return; poly('PIECES', rm.pts, true); const c = centroid(rm.pts), fs = Math.max(12, Math.min(40, Math.sqrt(area(rm.pts)) / 12));
            if (!rm.void) { text('PIECES', c, rm.name || 'Pièce', fs, true); text('PIECES', [c[0], c[1] + fs * 1.4], `${String(Math.round(area(rm.pts) / 1000) / 10).replace('.', ',')} m²`, fs * .65, true); } });
        (f.openings || []).forEach(o => { const w = (f.walls || []).find(q => q.id === o.wall); if (!w) return; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, c = (Number(o.pos) || .5) * L, hw = (Number(o.w) || 90) / 2, t = (Number(w.t) || T0) / 2;
            const at = (d, s) => [w.a[0] + ux * (c + d) - uy * t * s, w.a[1] + uy * (c + d) + ux * t * s];
            poly('OUVERTURES', [at(-hw, 1), at(hw, 1), at(hw, -1), at(-hw, -1)], true); if (o.type === 'window') line('OUVERTURES', at(-hw, 0), at(hw, 0)); });
        (f.items || []).forEach(it => { const a = (Number(it.rot) || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), hw = (Number(it.w) || 50) / 2, hd = (Number(it.d) || 50) / 2;
            poly('MOBILIER', [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [it.x + x * cs - y * sn, it.y + x * sn + y * cs]), true);
            if (it.name) text('MOBILIER', [it.x, it.y], it.name, 8, true); });
        (f.labels || []).forEach(lb => text('TEXTES', [lb.x, lb.y], lb.text, Number(lb.size) || 24));
        (f.dims || []).forEach(dm => { line('COTES', dm.a, dm.b); const m = [(dm.a[0] + dm.b[0]) / 2, (dm.a[1] + dm.b[1]) / 2]; text('COTES', [m[0], m[1] - 6], `${String(Math.round(Math.hypot(dm.b[0] - dm.a[0], dm.b[1] - dm.a[1])) / 100).replace('.', ',')} m`, 10, true); });
        text('TEXTES', [0, -60], `${name} - ${f.name || ''} (cm)`, 20);
        P(0, 'ENDSEC', 0, 'EOF');
        return out.join('\r\n') + '\r\n';
    }

    /* ═════════ Import ═════════ */
    const deU = s => String(s ?? '').replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').trim();
    /** lire un DXF texte : {units (code $INSUNITS ou 0), lines, polys [{layer, pts, closed}], texts [{layer, x, y, text, h}], skipped {ARC: n…}, layers} — y vers le haut, comme dans le fichier */
    function parseDxf(src) {
        const L = String(src || '').split(/\r\n|\r|\n/), pairs = [];
        for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i].trim(), 10), L[i + 1]]);
        const res = {units: 0, lines: [], polys: [], texts: [], skipped: {}, layers: []}, lay = new Set();
        let i = 0, section = '';
        const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
        while (i < pairs.length) {
            const [c, v0] = pairs[i], v = String(v0 ?? '').trim();
            if (c === 0 && v === 'SECTION') { section = String(pairs[i + 1]?.[1] || '').trim(); i += 2; continue; }
            if (c === 0 && v === 'ENDSEC') { section = ''; i++; continue; }
            if (section === 'HEADER' && c === 9 && v === '$INSUNITS') { res.units = parseInt(String(pairs[i + 1]?.[1] || '0').trim(), 10) || 0; i += 2; continue; }
            if (section !== 'ENTITIES' || c !== 0) { i++; continue; }
            // une entité : ses codes jusqu'au prochain 0
            const type = v; let j = i + 1; const g = []; while (j < pairs.length && pairs[j][0] !== 0) { g.push(pairs[j]); j++; }
            const get = (k, d = '') => { const p = g.find(q => q[0] === k); return p ? String(p[1]).trim() : d; }, layer = get(8, '0'); lay.add(layer);
            if (type === 'LINE') res.lines.push({layer, a: [num(get(10)), num(get(20))], b: [num(get(11)), num(get(21))]});
            else if (type === 'LWPOLYLINE') { const pts = []; g.forEach(([k, val]) => { if (k === 10) pts.push([num(val), 0]); else if (k === 20 && pts.length) pts[pts.length - 1][1] = num(val); }); if (pts.length > 1) res.polys.push({layer, pts, closed: (parseInt(get(70, '0'), 10) & 1) === 1}); }
            else if (type === 'POLYLINE') { const closed = (parseInt(get(70, '0'), 10) & 1) === 1, pts = []; let k = j;
                while (k < pairs.length && String(pairs[k][1]).trim() !== 'SEQEND') { if (pairs[k][0] === 0 && String(pairs[k][1]).trim() === 'VERTEX') { let m = k + 1, x = 0, y = 0; while (m < pairs.length && pairs[m][0] !== 0) { if (pairs[m][0] === 10) x = num(pairs[m][1]); if (pairs[m][0] === 20) y = num(pairs[m][1]); m++; } pts.push([x, y]); k = m; } else k++; }
                if (pts.length > 1) res.polys.push({layer, pts, closed}); j = k + 1; while (j < pairs.length && pairs[j][0] !== 0) j++; }
            else if (type === 'TEXT' || type === 'MTEXT') { const t = deU(type === 'MTEXT' ? g.filter(q => q[0] === 3 || q[0] === 1).map(q => q[1]).join('') : get(1)); const al = get(72, '0') !== '0' && get(11) !== '';
                if (t) res.texts.push({layer, x: num(get(al ? 11 : 10)), y: num(get(al ? 21 : 20)), text: t.slice(0, 200), h: num(get(40, '10'))}); }
            else if (!['SEQEND', 'VERTEX', 'ENDSEC', 'EOF'].includes(type)) res.skipped[type] = (res.skipped[type] || 0) + 1;
            i = j;
        }
        res.layers = [...lay];
        return res;
    }
    /** combien de centimètres dans une unité du fichier : $INSUNITS, sinon devinée d'après la taille du dessin */
    function unitsGuess(d) {
        const by = {1: 2.54, 2: 30.48, 4: .1, 5: 1, 6: 100};
        if (by[d.units]) return by[d.units];
        const xs = [...d.lines.flatMap(l => [l.a[0], l.b[0]]), ...d.polys.flatMap(p => p.pts.map(q => q[0]))], ys = [...d.lines.flatMap(l => [l.a[1], l.b[1]]), ...d.polys.flatMap(p => p.pts.map(q => q[1]))];
        if (!xs.length) return 1; const big = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        return big > 8000 ? .1 : big < 80 ? 100 : 1; // un plan de maison : en mm il dépasse 8000, en m il tient sous 80
    }
    const ROOMY = /pi[eè]ce|room|surface|espace|local|zone/i;
    /** de quoi remplir un étage (en cm, y vers le bas, coin en haut à gauche à 0, 0) : {walls, rooms, labels} */
    function toFloor(d, {scale = 1, layers = null, wallT = 20, uid = p => p + Math.random().toString(36).slice(2, 9)} = {}) {
        const keep = x => !layers || layers.includes(x.layer), S = p => [p[0] * scale, -p[1] * scale];
        const segs = [], rooms = [], texts = d.texts.filter(keep).map(t => ({...t, p: S([t.x, t.y])}));
        d.lines.filter(keep).forEach(l => segs.push([S(l.a), S(l.b)]));
        d.polys.filter(keep).forEach(p => { const pts = p.pts.map(S); if (p.closed && ROOMY.test(p.layer) && pts.length >= 3) { rooms.push(pts); return; }
            for (let k = 0; k + 1 < pts.length; k++) segs.push([pts[k], pts[k + 1]]); if (p.closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]); });
        const shapes = [...segs.flat(), ...rooms.flat()], all = shapes.length ? shapes : texts.map(t => t.p); if (!all.length) return {walls: [], rooms: [], labels: []}; // le coin du dessin (les textes suivent)
        const ox = Math.min(...all.map(p => p[0])), oy = Math.min(...all.map(p => p[1])), M = p => [Math.round((p[0] - ox) * 10) / 10, Math.round((p[1] - oy) * 10) / 10];
        const seen = new Set(), walls = [];
        segs.forEach(([a, b]) => { const A = M(a), B = M(b); if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 3) return; const k = [A.join(','), B.join(',')].sort().join('|'); if (seen.has(k)) return; seen.add(k); walls.push({id: uid('w'), a: A, b: B, t: wallT}); });
        const used = new Set();
        const rms = rooms.map(r => { const pts = r.map(M), name = texts.find((t, i) => !used.has(i) && !/m²|m2\b/i.test(t.text) && pointIn(pts, M(t.p)) && used.add(i)); texts.forEach((t, i) => { if (/m²|m2\b/i.test(t.text) && pointIn(pts, M(t.p))) used.add(i); });
            return {id: uid('r'), name: (name?.text || 'Pièce').slice(0, 60), pts}; });
        const labels = texts.filter((t, i) => !used.has(i) && !/\(cm\)$/.test(t.text)).slice(0, 300).map(t => { const p = M(t.p); return {id: uid('l'), x: p[0], y: p[1], text: t.text.slice(0, 120), size: Math.max(10, Math.min(80, Math.round(t.h * scale) || 24))}; });
        return {walls: walls.slice(0, 5000), rooms: rms.slice(0, 500), labels};
    }
    const api = {toDxf, parseDxf, unitsGuess, toFloor, dxfStr};
    ext.houseDxf = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
