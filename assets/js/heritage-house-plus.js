/* LCNDA — 🏠 Plan de maison, les outils en plus (onglet « 🏠 Maison » → « 🧰 Outils de la maison ») :
 *  M2 combles (plafond en pente, hauteur sous plafond) · M3 coupe · M4 surfaces (habitable, Carrez < 1,80 m) et Tableur · M13 vérifier le plan ·
 *  M5 curseur des années · M7 visite guidée · M8 photos d'époque · M9 le hameau (autres bâtiments du terrain) · M11 partager la visite.
 * Les calculs sont des fonctions pures (aussi `require()` dans Node pour les tests) ; les fenêtres et boutons reçoivent un « ctx » de l'éditeur
 * (heritage-house.js : {H, F, fi, name, setFloor, select, render, commit, paint, status, planSvg, view3d, toggle3d, houseId}).
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const V = () => ext.houseVoids || (typeof require === 'function' ? require('./heritage-house-vides.js') : null);
    const A = () => root.LCNDA_APP;
    const UI = () => root.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r1 = v => Math.round(v * 10) / 10;
    const m2 = cm2 => String(r1(cm2 / 10000)).replace('.', ',');
    const sortedF = H => [...(H?.floors || [])].sort((a, b) => a.level - b.level);
    const slab = H => { const n = Number(H?.slab); return n >= 0 && n <= 120 ? n : 20; };
    /** la hauteur (cm) du bas d'un étage au-dessus du sol (comme floorBase de la 3D, en cm) */
    function baseOf(H, f) { const fl = sortedF(H); let y = 0; if (f.level >= 0) { for (const q of fl) if (q.level >= 0 && q.level < f.level) y += Number(q.height || 270) + slab(H); } else { for (const q of fl) if (q.level < 0 && q.level >= f.level) y -= Number(q.height || 270) + slab(H); } return y; }
    const area = pts => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); };
    const pointIn = (poly, [x, y]) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) ins = !ins; } return ins; };

    /* ═════════ M2 · Combles : plafond en pente sous le toit ═════════ */
    /** l'étage sous le toit (le plus haut qui a des murs) */
    const topFloor = H => sortedF(H).filter(f => (f.walls || []).length).pop() || null;
    /** la forme du toit posé sur « top » : pente, forme, et ses rectangles (un seul, ou un par aile) ; null sans toit en pente */
    function roofGeom(H, top) {
        const r = H?.roof || {}; if (!top || !r.on || r.shape === 'flat') return null;
        const rects = (r.wings ? roofWings(top, 20, H) : null) || [], xs = (top.walls || []).flatMap(w => [w.a[0], w.b[0]]), ys = (top.walls || []).flatMap(w => [w.a[1], w.b[1]]); if (!xs.length) return null;
        const boxes = rects.length > 1 ? rects : [{x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)}];
        return {pitch: clamp(Number(r.pitch ?? 40), 2, 75), shape: r.shape || 'gable', rects: boxes.map(box => { const longX = box.x1 - box.x0 >= box.y1 - box.y0; return {box, along: r.axis === 'short' ? !longX : r.axis === 'x' ? true : r.axis === 'z' ? false : longX}; })};
    }
    /** les combles : l'étage le plus haut, coché « Combles », avec un toit en pente ; {knee, pitch, shape, rects, box} */
    function atticOf(H, f) {
        if (!f?.attic || topFloor(H) !== f) return null; const g = roofGeom(H, f); if (!g) return null;
        const all = g.rects.map(q => q.box); return {...g, knee: clamp(Number(f.knee ?? 100), 0, 300), box: {x0: Math.min(...all.map(q => q.x0)), x1: Math.max(...all.map(q => q.x1)), y0: Math.min(...all.map(q => q.y0)), y1: Math.max(...all.map(q => q.y1))}};
    }
    /** la hauteur du toit (cm au-dessus du plancher) en un point, d'après sa géométrie et la hauteur des murs bas ; le plus haut des toits des ailes */
    function slopeH({rects, pitch, shape}, knee, [x, y]) {
        const t = Math.tan(pitch * Math.PI / 180); let best = -Infinity, any = false;
        rects.forEach(({box, along}) => { if (x < box.x0 - .5 || x > box.x1 + .5 || y < box.y0 - .5 || y > box.y1 + .5) return; any = true;
            const dAcross = along ? Math.min(y - box.y0, box.y1 - y) : Math.min(x - box.x0, box.x1 - x), dAlong = along ? Math.min(x - box.x0, box.x1 - x) : Math.min(y - box.y0, box.y1 - y);
            let d = dAcross; if (shape === 'hip' || shape === 'pyramid') d = Math.min(dAcross, dAlong); if (shape === 'shed') d = along ? y - box.y0 : x - box.x0; d = Math.max(0, d);
            let h; if (shape === 'mansard') { const low = Math.tan(Math.max(pitch, 60) * Math.PI / 180), inset = Math.min((box.y1 - box.y0) / 2, (box.x1 - box.x0) / 2) * .28;
                h = d < inset ? knee + d * low : knee + inset * low + (d - inset) * Math.tan(Math.min(pitch, 30) * Math.PI / 180); } // comme la 3D : un brisis raide, puis un terrasson
            else h = knee + d * t;
            best = Math.max(best, h); });
        return any ? best : knee;
    }
    /** la hauteur sous plafond (cm) en un point du plan : celle de l'étage, ou sous la pente des combles (« at » : atticOf déjà calculé) */
    function heightAt(H, f, p, at = atticOf(H, f)) { const full = Number(f?.height || 270); return at ? Math.min(full, slopeH(at, at.knee, p)) : full; }
    /** surface d'une pièce (cm²) et surface « loi Carrez » (hauteur ≥ 1,80 m), sur une grille de 10 cm */
    function roomSurfaces(H, f, rm) {
        const pts = roomOutline(f, rm), tot = area(pts); if (rm.void) return {area: 0, carrez: 0, hmin: 0, hmax: 0};
        const at = atticOf(H, f), full = Number(f.height || 270); if (!at) return {area: tot, carrez: full >= 180 ? tot : 0, hmin: full, hmax: full};
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), step = 10; let n = 0, ok = 0, hmin = Infinity, hmax = 0;
        for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) { if (!pointIn(pts, [x, y])) continue; n++; const h = heightAt(H, f, [x, y], at); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); if (h >= 180) ok++; }
        return {area: tot, carrez: n ? tot * ok / n : 0, hmin: n ? hmin : full, hmax: n ? hmax : full};
    }
    /** les bandes de moins de 1,80 m (plan des combles) : des carrés de 20 cm, regroupés par ligne */
    function lowZones(H, f, step = 20) {
        const at = atticOf(H, f); if (!at) return [];
        const out = [], {box} = at;
        for (let y = box.y0; y < box.y1; y += step) { let run = null; for (let x = box.x0; x <= box.x1; x += step) { const low = x < box.x1 && heightAt(H, f, [x + step / 2, y + step / 2], at) < 180; if (low && !run) run = [x, y]; if (!low && run) { out.push([run[0], y, x - run[0], step]); run = null; } } }
        return out;
    }

    /* ═════════ M2 · Murs courbes : une courbe de Bézier (le point de contrôle à deux fois la flèche), la même en 2D et en 3D ═════════ */
    /** la flèche d'un mur (cm, + à gauche du sens a → b), bornée à la moitié de sa longueur */
    const bulgeOf = w => { const b = Number(w?.bulge) || 0, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); return Math.abs(b) < 1 ? 0 : clamp(b, -L / 2, L / 2); };
    const ctrlOf = w => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, b = bulgeOf(w), nx = -(w.b[1] - w.a[1]) / L, ny = (w.b[0] - w.a[0]) / L; return [(w.a[0] + w.b[0]) / 2 + nx * 2 * b, (w.a[1] + w.b[1]) / 2 + ny * 2 * b]; };
    /** le point du mur au paramètre t (0 = a, 1 = b) */
    function bez(w, t) { if (!bulgeOf(w)) return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t]; const c = ctrlOf(w), u = 1 - t; return [u * u * w.a[0] + 2 * u * t * c[0] + t * t * w.b[0], u * u * w.a[1] + 2 * u * t * c[1] + t * t * w.b[1]]; }
    /** les points du mur, tous les « step » cm environ (2 points pour un mur droit) */
    function wallPts(w, step = 25) { if (!bulgeOf(w)) return [[...w.a], [...w.b]]; const L = arcLen(w), n = clamp(Math.ceil(L / step), 6, 80); return Array.from({length: n + 1}, (_, i) => bez(w, i / n)); }
    function arcLen(w) { if (!bulgeOf(w)) return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); let L = 0, p = w.a; for (let i = 1; i <= 24; i++) { const q = bez(w, i / 24); L += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; } return L; }
    /** la direction du mur au paramètre t (unitaire) */
    const tangentAt = (w, t) => { const p = bez(w, clamp(t - .01, 0, 1)), q = bez(w, clamp(t + .01, 0, 1)), L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; };
    /** le contour d'une pièce dont un côté est un mur courbe : ce côté suit la courbe (plan, sol et plafond 3D, surfaces) */
    function roomOutline(f, rm) {
        const pts = rm?.pts || [], curved = (f?.walls || []).filter(w => bulgeOf(w)); if (!curved.length || pts.length < 3) return pts;
        const near = (p, q) => Math.abs(p[0] - q[0]) < 3 && Math.abs(p[1] - q[1]) < 3, out = [];
        pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; out.push(p); const w = curved.find(c => (near(c.a, p) && near(c.b, q)) || (near(c.a, q) && near(c.b, p))); if (!w) return;
            const mid = wallPts(w, 20).slice(1, -1); out.push(...(near(w.a, p) ? mid : mid.reverse())); });
        return out;
    }
    /** le chemin SVG d'un mur courbe (ou droit) */
    const wallD = w => { if (!bulgeOf(w)) return `M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}`; const c = ctrlOf(w); return `M${w.a[0]} ${w.a[1]}Q${r1(c[0])} ${r1(c[1])} ${w.b[0]} ${w.b[1]}`; };

    /* ═════════ M1 · Toit en plusieurs ailes (maison en L, en T, en U) : un toit par rectangle, à la même pente (les noues se font toutes seules) ═════════ */
    function roofWings(f, cell = 20, H = null) {
        const rooms = (H ? sortedF(H).filter(q => q.level >= 0) : [f]).flatMap(q => (q.rooms || []).filter(r => !r.void && r.pts?.length > 2)), walls = f.walls || []; if (!walls.length) return []; // l'emprise : les pièces de tous les étages
        const xs = walls.flatMap(w => [w.a[0], w.b[0]]), ys = walls.flatMap(w => [w.a[1], w.b[1]]), X0 = Math.min(...xs), Y0 = Math.min(...ys), nx = Math.ceil((Math.max(...xs) - X0) / cell), ny = Math.ceil((Math.max(...ys) - Y0) / cell);
        const whole = [{x0: X0, y0: Y0, x1: Math.max(...xs), y1: Math.max(...ys)}]; if (!rooms.length || nx * ny > 250000) return whole;
        const g = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = [X0 + (i + .5) * cell, Y0 + (j + .5) * cell]; if (rooms.some(r => pointIn(r.pts, p))) g[j * nx + i] = 1; }
        let filled = 0; g.forEach(v => { filled += v; }); if (filled > .9 * nx * ny) return whole; // presque un rectangle : un seul toit
        /** le plus grand rectangle de cases à 1 (histogramme) */
        const best = (want) => { const h = new Int32Array(nx); let bA = 0, bR = null;
            for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) h[i] = want(i, j) ? h[i] + 1 : 0; const st = [];
                for (let i = 0; i <= nx; i++) { const hi = i < nx ? h[i] : 0; let s0 = i; while (st.length && st[st.length - 1][1] >= hi) { const [si, sh] = st.pop(); const a = sh * (i - si); if (a > bA) { bA = a; bR = {i0: si, i1: i, j0: j - sh + 1, j1: j + 1}; } s0 = si; } st.push([s0, hi]); } }
            return bR && bA ? bR : null; };
        const used = new Uint8Array(nx * ny), out = [];
        for (let k = 0; k < 4; k++) {
            const r = best((i, j) => g[j * nx + i] && !used[j * nx + i]); if (!r || (r.i1 - r.i0) * (r.j1 - r.j0) * cell * cell < 40000) break; // 4 m² au moins
            for (let j = r.j0; j < r.j1; j++) for (let i = r.i0; i < r.i1; i++) used[j * nx + i] = 1;
            const rc = {x0: X0 + r.i0 * cell, x1: X0 + r.i1 * cell, y0: Y0 + r.j0 * cell, y1: Y0 + r.j1 * cell};
            // une aile qui touche un toit déjà posé : prolongée jusqu'au faîtage de celui-ci (le bout de son toit disparaît dans l'autre)
            out.forEach(o => { const ridgeX = o.x1 - o.x0 < o.y1 - o.y0, mx = (o.x0 + o.x1) / 2, my = (o.y0 + o.y1) / 2, ovX = rc.x0 < o.x1 && rc.x1 > o.x0, ovY = rc.y0 < o.y1 && rc.y1 > o.y0;
                if (ovX && Math.abs(rc.y1 - o.y0) < cell * 1.5 && !ridgeX) rc.y1 = Math.max(rc.y1, my); else if (ovX && Math.abs(rc.y0 - o.y1) < cell * 1.5 && !ridgeX) rc.y0 = Math.min(rc.y0, my);
                else if (ovY && Math.abs(rc.x1 - o.x0) < cell * 1.5 && ridgeX) rc.x1 = Math.max(rc.x1, mx); else if (ovY && Math.abs(rc.x0 - o.x1) < cell * 1.5 && ridgeX) rc.x0 = Math.min(rc.x0, mx); });
            out.push(rc);
        }
        return out.length ? out : whole;
    }

    /* ═════════ M4 · Surfaces ═════════ */
    function surfaces(H) {
        const rows = [], floors = [];
        sortedF(H).forEach(f => { let a = 0, c = 0; (f.rooms || []).filter(r => !r.void && r.pts?.length > 2).forEach(rm => { const s = roomSurfaces(H, f, rm); a += s.area; c += s.carrez; rows.push({floor: f.name, room: rm.name || 'Pièce', area: s.area, carrez: s.carrez, hmin: s.hmin, hmax: s.hmax}); }); floors.push({floor: f.name, area: a, carrez: c}); });
        return {rows, floors, area: floors.reduce((s, f) => s + f.area, 0), carrez: floors.reduce((s, f) => s + f.carrez, 0)};
    }
    function surfacesWorkbook(H, name) {
        const S = root.LCNDA_SHEET; if (!S) return null; const s = surfaces(H), num = v => Math.round(v / 100) / 100;
        const rows = [['Étage', 'Pièce', 'Surface (m²)', 'Loi Carrez ≥ 1,80 m (m²)', 'Hauteur mini (cm)', 'Hauteur maxi (cm)'], ...s.rows.map(r => [r.floor, r.room, num(r.area), num(r.carrez), Math.round(r.hmin), Math.round(r.hmax)])];
        const n = rows.length; rows.push([], ['Total', '', `=SOMME(C2:C${n})`, `=SOMME(D2:D${n})`]);
        const wb = S.newWorkbook(), sh = S.newSheet('Surfaces'); sh.cells = S.rowsToCells(rows); sh.freeze = {r: 1, c: 0}; sh.cols = {A: {w: 140}, B: {w: 170}, C: {w: 110}, D: {w: 170}, E: {w: 120}, F: {w: 120}}; wb.sheets = [sh];
        return S.normalize(wb);
    }

    /* ═════════ M13 · Vérifier le plan (comme le Contrôle de la base) ═════════ */
    const wallLen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    /** les murs posés sur le contour d'une pièce */
    const roomWallsOf = (f, rm) => (f.walls || []).filter(w => rm.pts.some((a, i) => { const b = rm.pts[(i + 1) % rm.pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, off = P => Math.abs((P[0] - a[0]) * dy - (P[1] - a[1]) * dx) / L, k = P => ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / (L * L);
        const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]; return off(w.a) < 6 && off(w.b) < 6 && k(mid) > -.01 && k(mid) < 1.01; }));
    function checks(H) {
        const out = [], Vd = V(), fl = sortedF(H), add = (level, kind, text, f, type, id, x, y) => out.push({level, kind, text, floor: f.name, fid: f.id, type, id, x, y});
        fl.forEach(f => {
            const wh = w => Number(w.h || f.height || 270);
            (f.walls || []).forEach(w => { if (wallLen(w) < 5) add('orange', 'Mur', 'Un mur de moins de 5 cm (un double-clic de trop ?)', f, 'wall', w.id, w.a[0], w.a[1]); });
            (f.openings || []).forEach(o => { const w = (f.walls || []).find(q => q.id === o.wall), nm = o.type === 'window' ? 'Une fenêtre' : 'Une porte';
                if (!w) return add('red', 'Ouverture', `${nm} est posée sur un mur qui n’existe plus`, f, 'opening', o.id);
                const mx = w.a[0] + (w.b[0] - w.a[0]) * o.pos, my = w.a[1] + (w.b[1] - w.a[1]) * o.pos;
                if (o.w > wallLen(w) - 2) add('red', 'Ouverture', `${nm} est plus large que son mur`, f, 'opening', o.id, mx, my);
                const top = (o.type === 'window' ? Number(o.sill ?? 90) : 0) + Number(o.h || 0); if (top > wh(w)) add('orange', 'Ouverture', `${nm} dépasse le plafond (${Math.round(top)} cm pour ${Math.round(wh(w))} cm de mur) : elle est coupée par le plancher`, f, 'opening', o.id, mx, my);
                const at = atticOf(H, f); if (at && heightAt(H, f, [mx, my]) < top) add('yellow', 'Combles', `${nm} passe sous la pente du toit à cet endroit`, f, 'opening', o.id, mx, my); });
            (f.rooms || []).filter(rm => !rm.void && rm.pts?.length > 2).forEach(rm => { const rw = roomWallsOf(f, rm); const [cx, cy] = rm.pts.reduce((s, p) => [s[0] + p[0] / rm.pts.length, s[1] + p[1] / rm.pts.length], [0, 0]);
                if (rw.length >= 3 && !(f.openings || []).some(o => o.type !== 'window' && rw.some(w => w.id === o.wall)) && !/cour|jardin|potager|terrasse|basse-cour|grenier|cave/i.test(rm.name || '')) add('yellow', 'Pièce', `« ${rm.name || 'Pièce'} » n’a pas de porte`, f, 'room', rm.id, cx, cy); });
            if (Vd) (f.items || []).filter(it => Vd.isStair(it)).forEach(it => { const b = Vd.blondel(H, f, it), above = Vd.floorAbove(H, f);
                if (b && b.level === 'steep') add('orange', 'Escalier', `Escalier un peu raide : ${b.n} marches de ${String(r1(b.rise)).replace('.', ',')} cm, giron ${Math.round(b.going)} cm (2 h + g = ${Math.round(b.sum)} cm)`, f, 'item', it.id, it.x, it.y);
                if (!above) add('yellow', 'Escalier', 'Un escalier sans étage au-dessus', f, 'item', it.id, it.x, it.y);
                else if (it.open !== true) add('yellow', 'Escalier', `L’escalier ne perce pas le plancher de « ${above.name} » (Propriétés → « Ouvrir le plancher au-dessus »)`, f, 'item', it.id, it.x, it.y); });
            if (Vd) Vd.voidsOf(f).forEach(rm => { if (!Vd.floorBelow(H, f)) add('orange', 'Vide', 'Un vide à l’étage le plus bas : il n’ouvre sur rien', f, 'room', rm.id); });
            if ((f.rooms || []).length && !(f.walls || []).length) add('yellow', 'Étage', 'Des pièces sans aucun mur', f, null, null);
        });
        const rank = {red: 0, orange: 1, yellow: 2}; return out.sort((a, b) => rank[a.level] - rank[b.level]);
    }

    /** M1/M3 : les lucarnes, fenêtres de toit, verrières… en plan (cm) : {it, type, poly, base (le bas, cm au-dessus du sol), top, flat} — les mêmes places que la 3D */
    function roofItemsPlan(H) {
        const r = H?.roof || {}, tf = topFloor(H); if (!r.on || !tf || !(r.items || []).length) return [];
        const flat = r.shape === 'flat', rg = flat ? null : roofGeom(H, tf), at = atticOf(H, tf), knee = at ? at.knee : Number(tf.height || 270), b0 = baseOf(H, tf);
        const xs = (tf.walls || []).flatMap(w => [w.a[0], w.b[0]]), ys = (tf.walls || []).flatMap(w => [w.a[1], w.b[1]]); if (!xs.length) return [];
        const rects = flat ? [{box: {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)}, along: Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)}] : (rg?.rects || []);
        return (r.items || []).slice(0, 40).map(it => {
            const rc = rects[Number(it.wing) || 0] || rects[0]; if (!rc) return null; const {box, along} = rc, L = along ? box.x1 - box.x0 : box.y1 - box.y0, S = along ? box.y1 - box.y0 : box.x1 - box.x0, half = S / 2;
            const u = (along ? box.x0 : box.y0) + clamp(L * clamp(Number(it.pos ?? 50), 0, 100) / 100, 30, Math.max(30, L - 30)), cA = (along ? box.y0 : box.x0) + half, s = r.shape === 'shed' ? -1 : it.side === 'b' ? 1 : -1;
            const P2 = (uu, a) => along ? [uu, cA + a] : [cA + a, uu], rectP = (u0, u1, a0, a1) => [P2(u0, a0), P2(u1, a0), P2(u1, a1), P2(u0, a1)];
            if (flat) { const w = clamp(Number(it.w) || (it.type === 'velux' ? 120 : it.type === 'shed' ? 100 : 160), 30, 600), ln = clamp(Number(it.h) || (it.type === 'dormer' ? 160 : 120), 30, 600), a = (clamp(Number(it.at ?? 50), 5, 95) / 100 * 2 - 1) * Math.max(10, half - 30), top0 = b0 + Number(tf.height || 270) + 25;
                return {it, type: it.type, flat: true, poly: rectP(u - w / 2, u + w / 2, a - ln / 2, a + ln / 2), base: top0, top: top0 + (it.type === 'dormer' ? 220 : it.type === 'shed' ? 18 + Math.min(w, ln) * .55 : 25)}; }
            const hA = a => slopeH(rg, knee, P2(u, s * a)), w = clamp(Number(it.w) || (it.type === 'velux' ? 78 : 110), 30, 600);
            if (it.type === 'velux') { const a = clamp(Number(it.at ?? 50), 5, 95) / 100 * half, ln = clamp(Number(it.h) || 98, 30, 300) * Math.cos(rg.pitch * Math.PI / 180); return {it, type: 'velux', poly: rectP(u - w / 2, u + w / 2, s * (a - ln / 2), s * (a + ln / 2)), base: b0 + hA(a), top: b0 + hA(a - ln / 2)}; }
            const aF = Math.max(40, half - 5), yW = hA(aF), yT = yW + clamp(Number(it.h) || 120, 60, 260); let lo = 0, hi = aF; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (hA(m) > yT) lo = m; else hi = m; } const aB = Math.max(25, (lo + hi) / 2);
            return aF - aB < 30 ? null : {it, type: it.type, poly: rectP(u - w / 2, u + w / 2, s * aB, s * aF), base: b0 + yW, top: b0 + yT + (it.type === 'shed' ? 10 : w / 2 * Math.tan(Math.max(35, rg.pitch) * Math.PI / 180))};
        }).filter(Boolean);
    }

    /* ═════════ M3 · Coupe ═════════ */
    /** les intervalles [u0, u1] (cm le long de la coupe) où la ligne traverse un polygone */
    function crossPoly(poly, a, dir, L) {
        const ts = []; poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], den = dir[0] * ey - dir[1] * ex; if (Math.abs(den) < 1e-9) return;
            const u = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, s = ((p[0] - a[0]) * dir[1] - (p[1] - a[1]) * dir[0]) / den; if (s >= -1e-6 && s <= 1 + 1e-6) ts.push(u); });
        ts.sort((x, y) => x - y); const out = []; for (let i = 0; i + 1 < ts.length; i += 2) { const u0 = clamp(ts[i], 0, L), u1 = clamp(ts[i + 1], 0, L); if (u1 - u0 > .5) out.push([u0, u1]); } return out;
    }
    function sectionSvg(H, cut, {title = ''} = {}) {
        if (!cut?.a || !cut?.b) return null; const a = cut.a, b = cut.b, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 20) return null;
        const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], fl = sortedF(H), Vd = V(), sl = slab(H);
        const top = fl.length ? Math.max(...fl.map(f => baseOf(H, f) + Number(f.height || 270))) : 300, bottom = fl.length ? Math.min(0, ...fl.map(f => baseOf(H, f))) - sl : -sl;
        let roofTop = top; const roof = H.roof?.on && topFloor(H) ? H.roof : null, tf = topFloor(H);
        const rg = roof ? roofGeom(H, tf) : null, atT = atticOf(H, tf), kneeT = atT ? atT.knee : Number(tf?.height || 270);
        const roofAt = u => { if (!rg) return null; const p = [a[0] + dir[0] * u, a[1] + dir[1] * u]; if (!rg.rects.some(({box}) => p[0] >= box.x0 - 1 && p[0] <= box.x1 + 1 && p[1] >= box.y0 - 1 && p[1] <= box.y1 + 1)) return null; return baseOf(H, tf) + slopeH(rg, kneeT, p); };
        if (roof && roof.shape !== 'flat') for (let i = 0; i <= 80; i++) { const h = roofAt(L * i / 80); if (h != null) roofTop = Math.max(roofTop, h); }
        const rItems = roofItemsPlan(H).map(x => ({...x, cr: crossPoly(x.poly, a, dir, L)})).filter(x => x.cr.length); rItems.forEach(x => { roofTop = Math.max(roofTop, x.top); });
        if (roof?.shape === 'flat' && tf) roofTop = Math.max(roofTop, baseOf(H, tf) + Number(tf.height || 270) + 70);
        const pad = 120, W = L + 2 * pad, Ht = roofTop - bottom + 2 * pad, X = u => pad + u, Y = h => pad + (roofTop - h);
        let s = `<rect x="0" y="0" width="${W}" height="${Ht}" fill="#fbf8f2"/><defs><pattern id="cuthatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#d9cfbf"/><path d="M0 0V12" stroke="#8a7a66" stroke-width="2"/></pattern></defs>`;
        s += `<path d="M0 ${Y(0)}H${W}" stroke="#6a8a4a" stroke-width="3"/><rect x="0" y="${Y(0)}" width="${W}" height="${Ht - Y(0)}" fill="#e7e1d2" opacity=".55"/>`;
        fl.forEach(f => { const y0 = baseOf(H, f), fh = Number(f.height || 270);
            // le plancher : là où la coupe traverse une pièce (pas un vide ni une trémie)
            const holes = Vd ? Vd.holesOf(H, f) : [];
            (f.rooms || []).filter(r => !r.void && r.pts?.length > 2).forEach(rm => crossPoly(rm.pts, a, dir, L).forEach(([u0, u1]) => { let segs = [[u0, u1]]; holes.forEach(hp => crossPoly(hp, a, dir, L).forEach(([h0, h1]) => { segs = segs.flatMap(([s0, s1]) => h1 <= s0 || h0 >= s1 ? [[s0, s1]] : [[s0, Math.max(s0, h0)], [Math.min(s1, h1), s1]].filter(([p, q]) => q - p > .5)); }));
                segs.forEach(([s0, s1]) => { s += `<rect x="${X(s0)}" y="${Y(y0)}" width="${s1 - s0}" height="${sl}" fill="url(#cuthatch)" stroke="#3a3530" stroke-width="1.5"/>`; }); }));
            // les murs coupés (pleins), percés là où la coupe passe dans une porte ou une fenêtre
            (f.walls || []).forEach(w => { const t = Number(w.t || f.wallT || 20), wl = arcLen(w); if (wl < 1) return; const wp = wallPts(w, 20), n = wp.length - 1;
                for (let i = 0; i < n; i++) { const p0 = wp[i], p1 = wp[i + 1], sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (sl < .1) continue; const ux = (p1[0] - p0[0]) / sl, uy = (p1[1] - p0[1]) / sl, nx = -uy * t / 2, ny = ux * t / 2, ex = n > 1 ? ux * 1 : 0, ey = n > 1 ? uy * 1 : 0;
                const poly = [[p0[0] + nx - ex, p0[1] + ny - ey], [p1[0] + nx + ex, p1[1] + ny + ey], [p1[0] - nx + ex, p1[1] - ny + ey], [p0[0] - nx - ex, p0[1] - ny - ey]];
                crossPoly(poly, a, dir, L).forEach(([u0, u1]) => { const um = (u0 + u1) / 2, p = [a[0] + dir[0] * um, a[1] + dir[1] * um], k = (i + clamp(((p[0] - p0[0]) * ux + (p[1] - p0[1]) * uy) / sl, 0, 1)) / n, wh = Math.min(Number(w.h || fh), heightAt(H, f, p));
                    const o = (f.openings || []).find(q => q.wall === w.id && Math.abs(k * wl - q.pos * wl) <= q.w / 2);
                    const pieces = !o ? [[0, wh]] : (() => { const s0 = o.type === 'window' ? Number(o.sill ?? 90) : 0, s1 = Math.min(wh, s0 + Number(o.h || 0)); return [[0, s0], [s1, wh]].filter(([p0b, p1b]) => p1b - p0b > .5); })();
                    pieces.forEach(([h0, h1]) => { s += `<rect x="${X(u0)}" y="${Y(y0 + h1)}" width="${Math.max(2, u1 - u0)}" height="${h1 - h0}" fill="#4a423a" stroke="#2a2420" stroke-width="1"/>`; });
                    if (o?.type === 'window') s += `<rect x="${X(u0)}" y="${Y(y0 + Math.min(wh, Number(o.sill ?? 90) + Number(o.h || 0)))}" width="${Math.max(2, u1 - u0)}" height="${Math.min(wh, Number(o.sill ?? 90) + Number(o.h || 0)) - Number(o.sill ?? 90)}" fill="#bcd8e8" stroke="#5a8aa8"/>`; }); } });
            // les escaliers traversés : une pente de marches
            if (Vd) (f.items || []).filter(it => Vd.isStair(it)).forEach(it => { const poly = Vd.itemPoly(it), cr = crossPoly(poly, a, dir, L); if (!cr.length) return; const hh = Vd.stairH(H, f, it), [lo, hi] = [Vd.rotPt(it, 0, it.d / 2), Vd.rotPt(it, 0, -it.d / 2)], ul = (lo[0] - a[0]) * dir[0] + (lo[1] - a[1]) * dir[1], uh = (hi[0] - a[0]) * dir[0] + (hi[1] - a[1]) * dir[1];
                if (Math.abs(uh - ul) > 20) { const n = Math.max(6, Math.round(hh / 18)); let d = `M${X(ul)} ${Y(y0)}`; for (let i = 0; i < n; i++) { const u2 = ul + (uh - ul) * (i + 1) / n; d += `V${Y(y0 + hh * (i + 1) / n)}H${X(u2)}`; } s += `<path d="${d}" fill="none" stroke="#7a4f2a" stroke-width="3"/>`; }
                else s += `<rect x="${X(cr[0][0])}" y="${Y(y0 + hh)}" width="${cr[0][1] - cr[0][0]}" height="${hh}" fill="none" stroke="#7a4f2a" stroke-width="2" stroke-dasharray="8 5"/>`; });
            // la hauteur sous plafond et le nom de l'étage
            s += `<g font-family="Helvetica, sans-serif" font-size="22" fill="#3a3530"><text x="${X(-pad + 10)}" y="${Y(y0 + fh / 2)}">${esc(f.name || '')}</text><text x="${X(-pad + 10)}" y="${Y(y0 + fh / 2) + 26}" fill="#6a6560" font-size="18">${String(r1(fh / 100)).replace('.', ',')} m</text></g>`;
            s += `<path d="M${X(-18)} ${Y(y0)}V${Y(y0 + fh)}" stroke="#2a7de1" stroke-width="2" marker-start="url(#carr)" marker-end="url(#carr)"/>`; });
        // le toit plat (dalle et acrotère), puis les lucarnes, fenêtres de toit, verrières, lanterneaux et édicules coupés
        if (roof?.shape === 'flat' && tf) { const xs = tf.walls.flatMap(w => [w.a[0], w.b[0]]), ys = tf.walls.flatMap(w => [w.a[1], w.b[1]]), y1 = baseOf(H, tf) + Number(tf.height || 270);
            crossPoly([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], a, dir, L).forEach(([u0, u1]) => { s += `<rect x="${X(u0)}" y="${Y(y1 + 25)}" width="${u1 - u0}" height="25" fill="#8a4b3a"/>`; if (roof.parapet !== false) [u0, u1 - 12].forEach(u => { s += `<rect x="${X(u)}" y="${Y(y1 + 70)}" width="12" height="45" fill="#4a423a"/>`; }); }); }
        rItems.forEach(x => x.cr.forEach(([u0, u1]) => { const wd = Math.max(2, u1 - u0);
            if (x.type === 'velux' && !x.flat) { s += `<path d="M${X(u0)} ${Y(roofAt(u0) ?? x.base)}L${X(u1)} ${Y(roofAt(u1) ?? x.top)}" stroke="#2b3f4f" stroke-width="12"/>`; return; }
            if (x.flat) { s += x.type === 'dormer' ? `<rect x="${X(u0)}" y="${Y(x.top)}" width="${wd}" height="${x.top - x.base}" fill="#e9e1cf" stroke="#4a423a" stroke-width="2"/><rect x="${X(u0)}" y="${Y(x.top) - 6}" width="${wd}" height="8" fill="#6b6f73"/>`
                : x.type === 'shed' ? `<path d="M${X(u0)} ${Y(x.base + 18)}L${X((u0 + u1) / 2)} ${Y(x.top)}L${X(u1)} ${Y(x.base + 18)}Z" fill="#a9cde0" stroke="#5a8aa8" stroke-width="2"/><rect x="${X(u0)}" y="${Y(x.base + 18)}" width="${wd}" height="18" fill="#6b6f73"/>` : `<rect x="${X(u0)}" y="${Y(x.top)}" width="${wd}" height="${x.top - x.base}" fill="#a9cde0" stroke="#5a8aa8" stroke-width="2"/>`; return; }
            const hW = (x.top - x.base) * .55; s += `<rect x="${X(u0)}" y="${Y(x.base + hW + 20)}" width="${wd}" height="${hW + 20}" fill="#e9e1cf" stroke="#4a423a" stroke-width="2"/><rect x="${X(u0) + wd * .2}" y="${Y(x.base + hW)}" width="${wd * .6}" height="${hW * .7}" fill="#bcd8e8" stroke="#5a8aa8"/><path d="M${X(u0) - 10} ${Y(x.base + hW + 20)}L${X((u0 + u1) / 2)} ${Y(x.top)}L${X(u1) + 10} ${Y(x.base + hW + 20)}" fill="none" stroke="#8a4b3a" stroke-width="6"/>`; }));
        if (roof && roof.shape !== 'flat') { let d = '', pen = false; for (let i = 0; i <= 120; i++) { const u = L * i / 120, h = roofAt(u); if (h == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(u)} ${Y(h)}`; pen = true; } if (d) s += `<path d="${d}" fill="none" stroke="#8a4b3a" stroke-width="8" stroke-linejoin="round"/>`; }
        s = `<defs><marker id="carr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2a7de1"/></marker></defs>` + s;
        if (title) s += `<text x="${W / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#3a3530">${esc(title)}</text>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(W)} ${Math.round(Ht)}" width="${Math.round(W)}" height="${Math.round(Ht)}">${s}</svg>`;
    }

    /* ═════════ M11 · Partager la visite ═════════ */
    /** la maison sans ce qui touche aux personnes (habitants, souvenirs, recensements, notes) : une copie à envoyer */
    function stripHouse(H) {
        const h = JSON.parse(JSON.stringify(H || {})); delete h.meta; delete h.versions; delete h.site; delete h.ref;
        (h.floors || []).forEach(f => { (f.rooms || []).forEach(r => { delete r.people; delete r.mem; delete r.note; delete r.period; }); (f.items || []).forEach(it => { delete it.mem; delete it.note; if (it.model) delete it.model; }); (f.labels || []).forEach(l => { l.text = String(l.text || '').slice(0, 200); }); });
        (h.tour || []).forEach(t => { t.text = String(t.text || '').slice(0, 2000); }); delete h.oldPhotos;
        return h;
    }
    async function shareHtml(H, {name = 'Maison', plans = []} = {}) {
        const get = async u => { const r = await fetch(u, {cache: 'no-store'}); if (!r.ok) throw new Error(`Impossible de lire ${u}`); return r.text(); };
        const [three, ...libs] = await Promise.all(['assets/vendor/three.module.js', 'assets/js/heritage-house-vides.js', 'assets/js/heritage-house-plus.js', 'assets/js/heritage-house.js', 'assets/js/heritage-house-lib.js', 'assets/js/heritage-house-more.js', 'assets/js/heritage-house-metiers.js', 'assets/js/heritage-house3d.js'].map(get));
        const h3d = libs.pop(), css = typeof ext.houseCss === 'function' ? ext.houseCss() : '';
        const house = JSON.stringify(stripHouse(H)).replace(/</g, '\\u003c'), safe = s => s.replace(/<\/script/gi, '<\\/script');
        const h3 = safe(h3d.replace("import('../vendor/three.module.js')", 'import(window.__LCNDA_THREE)'));
        const plansHtml = plans.map(p => `<figure><figcaption>${esc(p.name)}</figcaption>${String(p.svg || '').replace(/<script[\s\S]*?<\/script>/gi, '')}</figure>`).join('');
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; worker-src blob:">
<title>${esc(name)}</title><style>${css.replace(/<\/style/gi, '')}</style><style>[hidden]{display:none!important}body{margin:0;font:16px/1.4 Helvetica,Arial,sans-serif;background:#f4f1ea;color:#222}header{padding:12px 16px;background:#fff;border-bottom:2px solid #222}h1{margin:0;font-size:22px}
.tabs{display:flex;gap:6px;padding:10px 16px}.tabs button{font:inherit;padding:8px 14px;border:2px solid #222;background:#fff;cursor:pointer}.tabs button.on{background:#0b5fff;color:#fff;border-color:#0b5fff}
#v3d{position:relative;height:72vh;min-height:360px;background:#dfe8ef}#v3d canvas{display:block;width:100%!important;height:100%!important}#plans{display:none;padding:16px}#plans figure{margin:0 0 24px;background:#fff;border:1px solid #ccc;padding:10px}#plans svg{max-width:100%;height:auto}
.note{padding:8px 16px;color:#555;font-size:14px}</style></head><body><header><h1>🏠 ${esc(name)}</h1></header>
<div class="tabs"><button type="button" class="on" data-t="3d">Vue 3D</button><button type="button" data-t="plans">Plans</button>${(H.tour || []).length ? '<button type="button" data-t="tour">▶ Visite guidée</button>' : ''}</div>
<div id="v3d"></div><div id="plans">${plansHtml}</div><p class="note">Visite en lecture seule, ouverte sans l’application. Souris ou doigt pour tourner, molette pour zoomer, « 🚶 Visiter » pour marcher (Z Q S D ou flèches).</p>
<script type="text/plain" id="three-src">${safe(three)}</script>
<script>window.__LCNDA_THREE=URL.createObjectURL(new Blob([document.getElementById('three-src').textContent],{type:'text/javascript'}));window.LCNDA_EXT={};</script>
${libs.map(t => `<script>try{${safe(t)}\n}catch(e){console.warn(e)}</script>`).join('')}<script>${h3}</script>
<script>(function(){var H=${house};document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){if(b.dataset.t==='tour'){document.querySelector('[data-t="3d"]').click();if(window.__v3)window.__v3.playTour();return;}document.querySelectorAll('.tabs button').forEach(function(x){x.classList.toggle('on',x===b);});document.getElementById('v3d').style.display=b.dataset.t==='3d'?'':'none';document.getElementById('plans').style.display=b.dataset.t==='plans'?'block':'none';};});
var fi=0;(H.floors||[]).forEach(function(f,i){if(f.level===0)fi=i;});window.LCNDA_EXT.house3d.mount(document.getElementById('v3d'),H,fi,{share:true}).then(function(v){window.__v3=v;});})();</script></body></html>`;
    }

    /* ═════════ L'onglet « 🏠 Maison » : la section « 🧰 Outils de la maison » ═════════ */
    function paneHouse(ctx) {
        const H = ctx.H, n = checks(H), s = surfaces(H), red = n.filter(x => x.level === 'red').length, tour = H.tour || [], ph = H.oldPhotos || [], site = H.site || [];
        const vl = (H.versions || []).map(v => (String(v.date || '').match(/\d{4}/) || [])[0]).filter(Boolean).map(Number), y0 = vl.length ? Math.min(...vl) : 0, y1 = vl.length ? Math.max(...vl) : 0;
        const sec = ctx.sec || ((t, k, b) => `<details class="ui-section" open><summary>${esc(t)}</summary><div class="ui-section-body">${b}</div></details>`);
        return sec('🧰 Outils de la maison', 'h-plus', `<div class="h-hs-plus">
            <p class="small"><b>📐 Surfaces</b> : ${m2(s.area)} m² au sol${Math.abs(s.carrez - s.area) > 1 ? ` · ${m2(s.carrez)} m² loi Carrez (hauteur ≥ 1,80 m)` : ''}</p>
            <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="plus:surfaces">📐 Surfaces par pièce</button><button type="button" class="button small secondary" data-hs-cmd="plus:sheet" title="Le tableau des surfaces, ouvert dans le 🧾 Tableur">🧾 Dans le tableur</button></div>
            <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="plus:cutline" title="Clique deux points sur le plan : la ligne de coupe">✂ Tracer la ligne de coupe</button>${H.cut ? '<button type="button" class="button small secondary" data-hs-cmd="plus:cut">✂ Voir la coupe</button>' : ''}</div>
            <div class="h-hs-row"><button type="button" class="button small ${red ? '' : 'secondary'}" data-hs-cmd="plus:check">⚠️ Vérifier le plan${n.length ? ` (${n.length})` : ' ✓'}</button></div>
            ${y1 > y0 ? `<label><span data-help="Glisse : la maison prend l’époque la plus proche de l’année (avant ou égale)." data-help-faq="époques de la maison">🕰 L’année</span><input type="range" min="${y0}" max="${y1}" step="1" value="${Number(ctx.year) || y1}" data-hs-plus="year" data-ui-off><small class="muted" data-hs-plus-out="year">${Number(ctx.year) || y1}</small></label><label class="ui-toggle" title="Pendant que tu glisses l’année, l’époque d’avant reste visible en pointillés sépia"><input type="checkbox" data-hs-plus="epghost" ${H.verGhost === 'prev' ? 'checked' : ''}><i></i>👻 Voir l’époque d’avant en fantôme</label>` : ''}
            <p class="small"><b>🗺 Visite guidée</b> : ${tour.length ? `${tour.length} arrêt${tour.length > 1 ? 's' : ''}` : 'aucun arrêt'} · <b>📷 Photos d’époque</b> : ${ph.length}</p>
            <div class="h-hs-row">${tour.length ? '<button type="button" class="button small secondary" data-hs-cmd="plus:tourplay">▶ Visite guidée</button><button type="button" class="button small secondary" data-hs-cmd="plus:tourlist">✎ Les arrêts</button><button type="button" class="button small secondary" data-hs-cmd="plus:tourvideo" title="La visite guidée en vidéo, toute faite : on glisse d’un arrêt à l’autre, le texte en sous-titre">🎬 Vidéo de la visite…</button><button type="button" class="button small secondary" data-hs-cmd="plus:tourshots" title="Une image par arrêt et les textes, dans un fichier .zip : à glisser dans le 🎬 Montage">⤓ Images de la visite</button>' : ''}<button type="button" class="button small secondary" data-hs-cmd="plus:tourhelp" title="Les arrêts et les photos se posent pendant la visite (🚶 Visiter, vue 3D)">＋ Arrêt, 📷 photo…</button></div>
            ${ph.length ? `<ul class="h-hs-people">${ph.map((p, i) => `<li><button type="button" class="link-button" data-hs-cmd="plus:photo:${i}">📷 ${esc(p.title || 'Photo')}</button><button type="button" class="icon-button" data-hs-cmd="plus:photodel:${i}" title="Retirer">×</button></li>`).join('')}</ul>` : ''}
            <p class="small"><b>🏘 Le hameau</b> : ${site.length ? site.map(x => esc(x.name || 'Bâtiment')).join(', ') : 'cette maison seule'}${H.meta?.foyer ? ` · foyer n° ${esc(H.meta.foyer)}` : ''}</p>
            <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="plus:site">🏘 Bâtiments du terrain…</button></div>
            <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-cmd="plus:share" title="Un fichier .html à envoyer : la maison en 3D et ses plans, sans l’app, en lecture seule (sans personnes ni souvenirs)">📤 Partager la visite</button></div></div>`, true);
    }

    /* ═════════ Les commandes ═════════ */
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const slugOf = s => String(s || 'maison').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'maison';
    async function cmd(name, ctx) {
        const H = ctx.H, [k, arg] = name.split(':'), open = ext.openDialog, toast = (...x) => A()?.toast?.(...x);
        if (k === 'surfaces') { const s = surfaces(H);
            return open({eyebrow: 'MAISON', title: '📐 Surfaces', submitLabel: 'Fermer', body: `<table class="data-table"><thead><tr><th>Étage</th><th>Pièce</th><th>Surface</th><th>Loi Carrez</th><th>Hauteur</th></tr></thead><tbody>${s.rows.map(r => `<tr><td>${esc(r.floor)}</td><td>${esc(r.room)}</td><td>${m2(r.area)} m²</td><td>${m2(r.carrez)} m²</td><td>${r.hmin === r.hmax ? `${String(r1(r.hmax / 100)).replace('.', ',')} m` : `${String(r1(r.hmin / 100)).replace('.', ',')} à ${String(r1(r.hmax / 100)).replace('.', ',')} m`}</td></tr>`).join('') || '<tr><td colspan="5">Aucune pièce dessinée.</td></tr>'}</tbody>
                <tfoot>${s.floors.map(f => `<tr><th colspan="2">${esc(f.floor)}</th><th>${m2(f.area)} m²</th><th>${m2(f.carrez)} m²</th><th></th></tr>`).join('')}<tr><th colspan="2">Toute la maison</th><th>${m2(s.area)} m²</th><th>${m2(s.carrez)} m²</th><th></th></tr></tfoot></table>
                <p class="muted small">Loi Carrez : seules comptent les parties où l’on tient debout (hauteur sous plafond d’au moins 1,80 m, combles comprises). Les vides et les escaliers ne comptent pas.</p><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-plus-sheet>🧾 Ouvrir dans le tableur</button></div>`,
                onOpen: dg => dg.querySelector('[data-hs-plus-sheet]')?.addEventListener('click', () => cmd('sheet', ctx))}); }
        if (k === 'sheet') { const wb = surfacesWorkbook(H, ctx.name); if (!wb || !ext.openSheetEditor) return toast('Le Tableur n’est pas prêt.', 'error'); return ext.openSheetEditor({data: wb, name: `Surfaces — ${ctx.name || 'Maison'}`}); }
        if (k === 'check') { const list = checks(H), ic = {red: '🔴', orange: '🟠', yellow: '🟡'};
            return open({eyebrow: 'MAISON', title: '⚠️ Vérifier le plan', submitLabel: 'Fermer', body: list.length ? `<p class="muted small">${A()?.plural ? A().plural(list.length, 'chose à vérifier', 'choses à vérifier') : list.length + ' à vérifier'} · un clic : aller à l’endroit</p><ul class="h-hs-checks">${list.map((x, i) => `<li><button type="button" class="link-button" data-hs-plus-go="${i}">${ic[x.level]} <b>${esc(x.kind)}</b> · ${esc(x.text)} <small class="muted">(${esc(x.floor)})</small></button></li>`).join('')}</ul>`
                : (A()?.empty ? A().empty('Rien à signaler : portes, fenêtres, escaliers et pièces sont cohérents.', {icon: '✓'}) : '<p>✓ Rien à signaler.</p>'),
                onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-hs-plus-go]'); if (!b) return; const x = list[Number(b.dataset.hsPlusGo)]; dg.close(); ctx.goto?.(x); })}); }
        if (k === 'cutline') return ctx.pickTwo?.('✂ Clique les deux bouts de la ligne de coupe sur le plan').then(pts => { if (!pts) return; H.cut = {a: pts[0], b: pts[1]}; ctx.commit('Ligne de coupe'); cmd('cut', ctx); });
        if (k === 'cut') { const svg = sectionSvg(H, H.cut, {title: `${ctx.name || 'Maison'} — coupe`}); if (!svg) return toast('Trace d’abord la ligne de coupe sur le plan.', 'error');
            return open({eyebrow: 'MAISON', title: '✂ Coupe de la maison', submitLabel: 'Fermer', className: 'modal-l', body: `<div class="h-hs-cutview">${svg}</div><div class="h-hs-row"><button type="button" class="button small secondary" data-hs-plus-cut="print">🖨 Imprimer…</button><button type="button" class="button small secondary" data-hs-plus-cut="svg">⤓ Exporter en SVG</button><button type="button" class="button small secondary" data-hs-plus-cut="png">⤓ Exporter en PNG</button></div>`,
                onOpen: dg => dg.addEventListener('click', async e => { const b = e.target.closest('[data-hs-plus-cut]'); if (!b) return; const w = b.dataset.hsPlusCut, fname = `${slugOf(ctx.name)}-coupe`;
                    if (w === 'print') return UI().openPrintDialog ? UI().openPrintDialog({title: `${ctx.name || 'Maison'} — coupe`, html: `<div style="text-align:center">${svg}</div>`, orientation: 'landscape'}) : null;
                    if (w === 'svg') return download(new Blob([svg], {type: 'image/svg+xml'}), `${fname}.svg`);
                    const img = new Image(); img.onload = () => { const c = document.createElement('canvas'), k2 = Math.min(1, 4000 / img.width); c.width = img.width * k2; c.height = img.height * k2; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob(bl => download(bl, `${fname}.png`), 'image/png'); };
                    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); })}); }
        if (k === 'tourhelp') return toast('Ouvre la vue 3D, puis « 🚶 Visiter » : en bas de la visite, « 📍 Arrêt ici » pose un arrêt (avec un texte lu à voix haute) et « 📷 Photo d’époque ici » pose une photo prise de cet endroit.');
        if (k === 'tourplay') { await ctx.toggle3d?.(true); return ctx.view3d?.()?.playTour?.(); }
        if (k === 'tourlist') { const tour = H.tour || [];
            return open({eyebrow: 'MAISON', title: '🗺 Les arrêts de la visite guidée', submitLabel: 'Fermer', body: `<ol class="h-hs-tourlist">${tour.map((t, i) => `<li data-i="${i}"><textarea rows="2" data-hs-tour="${i}" aria-label="Texte de l’arrêt ${i + 1}">${esc(t.text || '')}</textarea><span class="h-hs-row"><button type="button" class="icon-button small" data-hs-tourmv="${i}:-1" title="Monter" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-hs-tourmv="${i}:1" title="Descendre" aria-label="Descendre">↓</button><button type="button" class="icon-button small" data-hs-tourdel="${i}" title="Retirer" aria-label="Retirer">×</button></span></li>`).join('')}</ol>`,
                onOpen: dg => { dg.addEventListener('input', e => { const i = e.target.dataset?.hsTour; if (i == null) return; tour[Number(i)].text = e.target.value.slice(0, 2000); ctx.quiet?.('Texte de l’arrêt'); });
                    dg.addEventListener('click', e => { const mv = e.target.closest('[data-hs-tourmv]'), del = e.target.closest('[data-hs-tourdel]'); if (!mv && !del) return;
                        if (del) { tour.splice(Number(del.dataset.hsTourdel), 1); ctx.commit('Arrêt retiré'); } else { const [i, d] = mv.dataset.hsTourmv.split(':').map(Number), j = i + d; if (j < 0 || j >= tour.length) return; [tour[i], tour[j]] = [tour[j], tour[i]]; ctx.commit('Arrêts rangés'); }
                        dg.close(); cmd('tourlist', ctx); }); }}); }
        if (k === 'tourshots') { await ctx.toggle3d?.(true); const v3 = ctx.view3d?.(); if (!v3?.tourShots || !root.LCNDA_SHEET?.makeZip) return toast('Impossible de faire les images.', 'error'); toast('Une image par arrêt…');
            const shots = await v3.tourShots(); v3.stopWalk?.(); if (!shots.length) return; const files = []; for (let i = 0; i < shots.length; i++) files.push({name: `${String(i + 1).padStart(2, '0')}-arret.jpg`, data: new Uint8Array(await shots[i].blob.arrayBuffer())});
            files.push({name: 'textes.txt', data: new TextEncoder().encode(shots.map((x, i) => `${i + 1}. ${x.text}`).join('\n\n'))});
            download(await root.LCNDA_SHEET.makeZip(files), `${slugOf(ctx.name)}-visite-guidee.zip`); return toast(`✓ ${shots.length} image${shots.length > 1 ? 's' : ''} : à glisser dans le 🎬 Montage pour en faire un film (avec les textes en voix off).`); }
        if (k === 'tourvideo') { const n = (H.tour || []).length; if (!n) return toast('Pose d’abord des arrêts : vue 3D → 🚶 Visiter → 📍 Arrêt ici.', 'error');
            const mimeOk = typeof MediaRecorder !== 'undefined', mp4 = mimeOk && ['video/mp4;codecs=avc1.42E01E', 'video/mp4'].some(m => MediaRecorder.isTypeSupported?.(m));
            return open({eyebrow: 'MAISON', title: '🎬 La vidéo de la visite guidée', submitLabel: `⤓ Exporter la vidéo en ${mp4 ? 'MP4' : 'WebM'}`, body: `<p class="muted small">${n} arrêt${n > 1 ? 's' : ''} : la caméra glisse de l’un à l’autre, et le texte de chaque arrêt s’affiche en sous-titre. La vidéo se fait en temps réel (environ ${Math.round((H.tour || []).reduce((a, t) => a + Math.max(3.5, String(t.text || '').length * .065) + 1.6, 2.2))} secondes) : laisse la fenêtre ouverte.</p>
                <div class="form-grid"><label>Format<select name="size"><option value="1280x720">Paysage 1280 × 720 (écran)</option><option value="1080x1080">Carré 1080 × 1080 (messages)</option><option value="720x1280">Portrait 720 × 1280 (téléphone)</option></select></label>
                <label>Titre au début<input name="title" maxlength="80" value="${esc(ctx.name || 'Maison de famille')}"></label></div>
                <label class="checkbox-line"><input type="checkbox" name="keep" checked> Ranger aussi une copie dans les médias</label>${mimeOk ? '' : '<p class="small">⛔ Ce navigateur ne sait pas enregistrer de vidéo : garde « ⤓ Images de la visite ».</p>'}
                <div class="h-progress" hidden data-hs-vprog><span></span></div><p class="muted small" data-hs-vstat></p>`,
                onSubmit: async form => { if (!mimeOk) return false; const [w, h] = form.querySelector('[name=size]').value.split('x').map(Number), keep = form.querySelector('[name=keep]').checked, title = form.querySelector('[name=title]').value.trim().slice(0, 80);
                    const bar = form.querySelector('[data-hs-vprog]'), st = form.querySelector('[data-hs-vstat]'); bar.hidden = false; st.textContent = '🔴 Enregistrement de la visite…'; form.querySelectorAll('button, input, select').forEach(b => { b.disabled = true; });
                    try { await ctx.toggle3d?.(true); const v3 = ctx.view3d?.(); if (!v3?.recordTour) throw new Error('Vue 3D indisponible.');
                        const blob = await v3.recordTour({w, h, title, onProgress: k2 => { bar.querySelector('span').style.width = `${Math.round(k2 * 100)}%`; }}); v3.stopWalk?.();
                        const ext2 = /mp4/.test(blob.type) ? 'mp4' : 'webm', fname = `${slugOf(ctx.name)}-visite-guidee.${ext2}`; download(blob, fname);
                        if (keep) { const imp = root.LCNDA_MEDIA_PICKER?.importMediaFile || root.LCNDA_PICKER?.importMediaFile || A()?.importMediaFile; try { if (!imp) throw new Error('fenêtre des médias indisponible'); await imp(new File([blob], fname, {type: blob.type}), ['video']); toast('✓ Vidéo exportée, et une copie rangée dans les médias.'); } catch (e) { toast(`Vidéo exportée, mais pas rangée dans les médias : ${e.message}`, 'error'); } }
                        else toast('✓ Vidéo exportée.');
                        return true; }
                    catch (e) { st.textContent = `⛔ ${e.message}`; form.querySelectorAll('button, input, select').forEach(b => { b.disabled = false; }); return false; } }}); }
        if (k === 'photo') { await ctx.toggle3d?.(true); return ctx.view3d?.()?.showPhoto?.(Number(arg)); }
        if (k === 'photodel') { (H.oldPhotos || []).splice(Number(arg), 1); ctx.commit('Photo retirée'); return ctx.paint?.(); }
        if (k === 'site') return siteDialog(ctx);
        if (k === 'share') { try { toast('Préparation du fichier…'); const plans = sortedF(H).map(f => ({name: f.name, svg: ctx.planSvg?.(f)})).filter(p => p.svg); const html = await shareHtml(H, {name: ctx.name || 'Maison', plans}); download(new Blob([html], {type: 'text/html'}), `${slugOf(ctx.name)}-visite.html`); toast('Fichier prêt : envoie-le, il s’ouvre d’un double-clic dans un navigateur, sans l’app.'); } catch (e) { toast(e.message, 'error'); } return; }
    }
    /** 🏘 les autres bâtiments du terrain (d'autres maisons de la liste, posées à côté) et le n° de foyer du recensement */
    function siteDialog(ctx) {
        const H = ctx.H, P = root.LCNDA_PICKER || A(); H.site = Array.isArray(H.site) ? H.site : [];
        const rows = () => H.site.map((s, i) => `<li><b>🏠 ${esc(s.name || 'Bâtiment')}</b><span class="h-hs-g3c"><label>Décalage X<input data-unit="cm" type="number" data-hs-site="${i}:dx" value="${Math.round(s.dx || 0)}" step="10"></label><label>Décalage Y<input data-unit="cm" type="number" data-hs-site="${i}:dy" value="${Math.round(s.dy || 0)}" step="10"></label><label>Rotation<input data-unit="°" type="number" data-hs-site="${i}:rot" value="${Math.round(s.rot || 0)}" step="5"></label></span><button type="button" class="icon-button" data-hs-sitedel="${i}" title="Retirer du terrain" aria-label="Retirer">×</button></li>`).join('');
        return ext.openDialog({eyebrow: 'MAISON', title: '🏘 Le hameau : les bâtiments du terrain', submitLabel: 'Fermer', body: `<p class="muted small">La ferme, la grange, le four, le puits, les maisons voisines : chacune est une maison de la liste « 🏠 Maisons de famille », posée ici à côté (en 3D et en pointillés sur le plan).</p>
            <ul class="h-hs-site" data-hs-sitelist>${rows()}</ul><div class="h-pk-solo"><span class="pk-lab">＋ Ajouter un bâtiment</span><div data-hs-sitepk>${P.pickerField ? P.pickerField({name: 'hs_site', kind: 'house', allowCreate: false}) : ''}</div></div>
            <label>N° de foyer au recensement (facultatif)<input data-hs-foyer value="${esc(H.meta?.foyer || '')}" placeholder="ex. 12" maxlength="20"></label>`,
            onOpen: dg => {
                dg.addEventListener('picker-change', e => { const it = e.detail?.item || (Array.isArray(e.detail?.items) ? e.detail.items[0] : null); const id = Number(it?.id); if (!id || id === Number(ctx.houseId) || H.site.some(s => Number(s.id) === id)) return; H.site.push({id, name: String(it.title || it.name || 'Bâtiment').slice(0, 120), dx: 1500 * H.site.length + 1500, dy: 0, rot: 0}); ctx.commit('Bâtiment ajouté'); dg.querySelector('[data-hs-sitelist]').innerHTML = rows(); const pk = dg.querySelector('[data-hs-sitepk]'); if (pk && P.pickerField) pk.innerHTML = P.pickerField({name: 'hs_site', kind: 'house', allowCreate: false}); ctx.refreshSite?.(); });
                dg.addEventListener('input', e => { const t = e.target; if (t.dataset.hsFoyer !== undefined) { H.meta = H.meta || {}; H.meta.foyer = t.value.slice(0, 20); ctx.quiet?.('N° de foyer'); return; } const k = t.dataset.hsSite; if (!k) return; const [i, f] = k.split(':'); H.site[Number(i)][f] = Number(t.value) || 0; ctx.quiet?.('Bâtiment déplacé'); ctx.refreshSite?.(); });
                dg.addEventListener('click', e => { const b = e.target.closest('[data-hs-sitedel]'); if (!b) return; H.site.splice(Number(b.dataset.hsSitedel), 1); ctx.commit('Bâtiment retiré'); dg.querySelector('[data-hs-sitelist]').innerHTML = rows(); ctx.refreshSite?.(); });
            }});
    }
    /** M5 : l'époque d'une année (la plus récente avant ou égale ; sinon la plus ancienne) */
    function versionForYear(H, year) {
        const vs = (H.versions || []).map(v => ({v, y: Number((String(v.date || '').match(/\d{4}/) || [])[0])})).filter(x => x.y).sort((a, b) => a.y - b.y); if (!vs.length) return null;
        let best = vs[0].v; vs.forEach(x => { if (x.y <= year) best = x.v; }); return best;
    }
    /** 🕰 une autre époque en fantôme (H.verGhost : 'prev', 'next' ou l'id d'une époque) : {v, floors, before} ou null */
    const verKey = v => { const t = String(v.date || ''), iso = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/), fr = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/), y = t.match(/\d{4}/); return iso ? +iso[1] * 1e4 + +iso[2] * 100 + +iso[3] : fr ? +fr[3] * 1e4 + +fr[2] * 100 + +fr[1] : y ? +y[0] * 1e4 : 9e8; }; // sans date : à la fin
    const epochList = H => (H.versions || []).map((v, i) => [v, i]).sort((a, b) => verKey(a[0]) - verKey(b[0]) || a[1] - b[1]).map(x => x[0]);
    function epochGhost(H, mode = H.verGhost) {
        if (!mode || (H.versions || []).length < 2) return null; const l = epochList(H), i = l.findIndex(v => v.id === H.ver); if (i < 0) return null;
        const v = mode === 'prev' ? l[i - 1] : mode === 'next' ? l[i + 1] : l.find(q => q.id === mode && q.id !== H.ver);
        return v && Array.isArray(v.floors) ? {v, floors: v.floors, before: l.indexOf(v) < i} : null;
    }
    /** les murs de fa absents de fb (added) et ceux de fb absents de fa (gone) : par segments, à quelques cm près */
    function epochDiff(fa, fb, tol = 6) {
        const segD = (p, w) => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L2, 0, 1); return Math.hypot(p[0] - w.a[0] - dx * t, p[1] - w.a[1] - dy * t); };
        const dir = w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
        const covered = (w, set) => { const d0 = dir(w), pts = [0, .25, .5, .75, 1].map(t => [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t]);
            return pts.every(p => set.some(q => { const d1 = dir(q); return Math.abs(d0[0] * d1[1] - d0[1] * d1[0]) < .05 && segD(p, q) <= tol; })); };
        const A = (fa?.walls || []).filter(w => w?.a && w?.b), B = (fb?.walls || []).filter(w => w?.a && w?.b);
        return {added: A.filter(w => !covered(w, B)), gone: B.filter(w => !covered(w, A))};
    }
    /** M6 : les personnes de la pièce où l'on est (visite) */
    const roomAt = (f, x, y) => (f?.rooms || []).find(r => !r.void && r.pts?.length > 2 && pointIn(r.pts, [x, y])) || null;

    ext.housePlus = {tangentAt, roomOutline, roofItemsPlan, roofGeom, slopeH, bulgeOf, bez, wallPts, arcLen, wallD, roofWings, topFloor, atticOf, heightAt, roomSurfaces, lowZones, surfaces, surfacesWorkbook, checks, sectionSvg, stripHouse, shareHtml, paneHouse, cmd, versionForYear, verKey, epochList, epochGhost, epochDiff, roomAt, baseOf, crossPoly};
    if (typeof module !== 'undefined' && module.exports) module.exports = ext.housePlus;
})();
