/* LCNDA — 🏠 Plan de maison : les vides (trémies, mezzanines, doubles hauteurs), les garde-corps et les escaliers qui percent le plancher.
 * Une seule géométrie, partagée par le plan 2D (heritage-house.js), la vue 3D et la visite (heritage-house3d.js) — et chargeable dans Node (tests).
 *  - Un vide : une pièce avec `void: true` (« Pas de plancher : vide sur l'étage du dessous ») ; son garde-corps `rail` (bois, metal, verre, muret, none)
 *    et sa hauteur `railH` (cm, 100 par défaut), posé tout seul le long des bords qui ne touchent pas un mur.
 *  - Un escalier (droit, tournant, colimaçon, échelle de meunier, échelle) avec `open: true` ouvre la trémie dans le plancher de l'étage du dessus :
 *    sa boîte vue de dessus, garde-corps autour sauf du côté de l'arrivée (le haut de l'escalier = le côté « −d/2 » de l'objet, où pointe la flèche).
 *  - La hauteur d'un escalier suit celle de l'étage + l'épaisseur du plancher (H.slab), sauf si on l'a fixée (`hFix`).
 * Coordonnées : celles du plan, en centimètres ; rotation de l'objet en degrés, comme `rotate()` du SVG (et −rot autour de y en 3D).
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const RAILS = [['bois', 'Barreaux de bois'], ['metal', 'Métal (barreaux fins)'], ['verre', 'Verre'], ['muret', 'Muret plein'], ['none', 'Aucun']];
    const RAIL_KEYS = RAILS.map(r => r[0]);
    const railOf = o => (RAIL_KEYS.includes(o?.rail) ? o.rail : 'bois');
    const railHOf = o => { const n = Number(o?.railH); return n >= 30 && n <= 200 ? n : 100; };
    /** la forme d'un escalier : 'stairs' (droit, échelle de meunier), 'stairsL' (quart tournant), 'spiral' (colimaçon), 'ladder' (échelle) ; '' si ce n'est pas un escalier */
    const STAIR_KIND = {escalier: 'stairs', meunier: 'stairs', escaliert: 'stairsL', colimacon: 'spiral', echelle: 'ladder'};
    const STAIR_SHAPE = new Set(['stairs', 'stairsL', 'spiral', 'ladder']);
    const stairShape = it => { if (!it) return ''; const k = STAIR_KIND[it.kind]; if (k) return k; return STAIR_SHAPE.has(it.s2) ? it.s2 : ''; };
    const isStair = it => !!stairShape(it);
    const DEG = Math.PI / 180;
    /** un point du repère de l'objet (lx, ly en cm, depuis son centre) → le plan */
    const rotPt = (it, lx, ly) => { const a = (Number(it.rot) || 0) * DEG, c = Math.cos(a), s = Math.sin(a); return [it.x + lx * c - ly * s, it.y + lx * s + ly * c]; };
    /** la boîte de l'objet vue de dessus : 4 coins ; le côté 0 (coins 0 → 1) est l'arrivée de l'escalier (le haut) */
    const itemPoly = it => [[-it.w / 2, -it.d / 2], [it.w / 2, -it.d / 2], [it.w / 2, it.d / 2], [-it.w / 2, it.d / 2]].map(([x, y]) => rotPt(it, x, y));
    const sorted = H => [...(H?.floors || [])].sort((a, b) => a.level - b.level);
    const floorBelow = (H, f) => { const l = sorted(H), i = l.indexOf(f); return i > 0 ? l[i - 1] : null; };
    const floorAbove = (H, f) => { const l = sorted(H), i = l.indexOf(f); return i >= 0 && i < l.length - 1 ? l[i + 1] : null; };
    const slabOf = H => { const n = Number(H?.slab); return n >= 0 && n <= 120 ? n : 20; };
    /** la hauteur d'un escalier suit-elle l'étage ? oui, sauf si on l'a fixée (hFix) ou si elle n'est plus celle du catalogue */
    const stairAuto = (it, libH) => isStair(it) && it.hFix !== true && (it.h == null || libH == null || Number(it.h) === Number(libH));
    const stairH = (H, f, it, libH) => stairAuto(it, libH) ? Number(f?.height || 270) + slabOf(H) : Number(it.h ?? libH ?? 280);
    /** la règle de Blondel (2 h + g ≈ 63 cm, confortable entre 60 et 66) : nombre de marches, hauteur, giron */
    function blondel(H, f, it, libH) {
        const shape = stairShape(it); if (!shape || shape === 'ladder') return null;
        const tot = stairH(H, f, it, libH), n = shape === 'stairs' ? Math.max(6, Math.round(tot / 18)) : shape === 'stairsL' ? Math.max(6, Math.round(tot / 18)) : Math.max(8, Math.round(tot / 19));
        const rise = tot / n, run = shape === 'stairs' ? it.d : shape === 'stairsL' ? (it.w + it.d) / 2 : Math.PI * Math.min(it.w, it.d) * .65 * .75, going = run / Math.max(1, n - 1), sum = 2 * rise + going;
        const level = rise > 21 || sum < 57 ? 'steep' : sum > 68 ? 'long' : 'ok';
        return {n, rise, going, sum, level, height: tot};
    }
    /* ── polygones ── */
    const area = pts => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return a / 2; };
    const pointIn = (poly, [x, y]) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) ins = !ins; } return ins; };
    const isConvex = poly => { if (poly.length < 4) return true; let sign = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length], z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(z) < 1e-6) continue; const s = Math.sign(z); if (sign && s !== sign) return false; sign = s; } return true; };
    /** Sutherland–Hodgman : la partie de `subj` qui est dans `clip` (convexe) */
    function clipConvex(subj, clip) {
        const ccw = area(clip) > 0, inside = (p, a, b) => { const z = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? z >= -1e-6 : z <= 1e-6; };
        const cross = (p, q, a, b) => { const A1 = q[1] - p[1], B1 = p[0] - q[0], C1 = A1 * p[0] + B1 * p[1], A2 = b[1] - a[1], B2 = a[0] - b[0], C2 = A2 * a[0] + B2 * a[1], D = A1 * B2 - A2 * B1; return Math.abs(D) < 1e-9 ? p : [(B2 * C1 - B1 * C2) / D, (A1 * C2 - A2 * C1) / D]; };
        let out = subj.map(p => [...p]);
        for (let i = 0; i < clip.length && out.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length], inp = out; out = [];
            for (let j = 0; j < inp.length; j++) { const p = inp[j], q = inp[(j + 1) % inp.length], pin = inside(p, a, b), qin = inside(q, a, b);
                if (pin) { out.push(p); if (!qin) out.push(cross(p, q, a, b)); } else if (qin) out.push(cross(p, q, a, b)); } }
        return out;
    }
    /** les trous à faire dans le sol d'une pièce : chaque trou rogné à la pièce ; `full` si la pièce est presque entièrement percée */
    function holesForRoom(pts, holes) {
        const A = Math.abs(area(pts)), conv = isConvex(pts), out = []; let cut = 0;
        holes.forEach(h => { let q = null; if (conv) q = clipConvex(h, pts); else if (h.every(p => pointIn(pts, p))) q = h; if (!q || q.length < 3) return; const a = Math.abs(area(q)); if (a < 1) return; cut += a; out.push(q); });
        return {holes: out, full: A > 0 && cut >= A * .985};
    }
    /* ── les vides et les trémies d'un étage ── */
    const voidsOf = f => (f?.rooms || []).filter(r => r.void && Array.isArray(r.pts) && r.pts.length > 2);
    /** les escaliers de l'étage du dessous qui ouvrent le plancher de cet étage */
    const openingsOf = (H, f) => { const b = floorBelow(H, f); return b ? (b.items || []).filter(it => isStair(it) && it.open === true && it.w > 5 && it.d > 5).map(it => ({it, poly: itemPoly(it)})) : []; };
    /** les trous du plancher de cet étage (son sol ; et le plafond de l'étage du dessous) */
    const holesOf = (H, f) => [...voidsOf(f).map(r => r.pts), ...openingsOf(H, f).map(o => o.poly)];
    /** ce côté (a → b) est-il posé contre un mur de l'étage ? */
    function alongWall(f, a, b) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return true;
        const near = p => (f?.walls || []).some(w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], l2 = dx * dx + dy * dy; if (l2 < 1) return false; const k = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / l2)), qx = w.a[0] + dx * k, qy = w.a[1] + dy * k; return Math.hypot(p[0] - qx, p[1] - qy) <= (Number(w.t || f.wallT || 20)) / 2 + 4; });
        return [.2, .5, .8].every(t => near([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
    /** enlève d'un côté (a → b) les morceaux [t0, t1] (0…1) : les arrivées d'escalier */
    function cutSeg(a, b, gaps) {
        const g = gaps.map(([t0, t1]) => [Math.max(0, Math.min(t0, t1)), Math.min(1, Math.max(t0, t1))]).filter(([t0, t1]) => t1 - t0 > .001).sort((x, y) => x[0] - y[0]);
        const out = [], P = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; let s = 0;
        g.forEach(([t0, t1]) => { if (t0 > s + .002) out.push([P(s), P(t0)]); s = Math.max(s, t1); }); if (s < .998) out.push([P(s), b]);
        return out;
    }
    /** l'arrivée d'un escalier posée sur ce côté : l'intervalle qu'elle occupe (0…1), ou null */
    function arrivalGap(a, b, it) {
        const [p, q] = itemPoly(it), L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return null;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, off = P => Math.abs((P[0] - a[0]) * uy - (P[1] - a[1]) * ux), along = P => ((P[0] - a[0]) * ux + (P[1] - a[1]) * uy) / L;
        if (off(p) > 8 || off(q) > 8) return null; const t0 = along(p), t1 = along(q); if (Math.max(t0, t1) < 0 || Math.min(t0, t1) > 1) return null; return [t0, t1];
    }
    /** les garde-corps de l'étage : [{a, b, style, h, src}] — les bords des vides (sauf contre un mur et à l'arrivée d'un escalier) et le tour des trémies (sauf l'arrivée) */
    function railsOf(H, f, {all = false} = {}) {
        const out = [], voids = voidsOf(f), ops = openingsOf(H, f);
        const inVoid = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return voids.some(v => pointIn(v.pts, m) && !onEdge(v.pts, m)); };
        voids.forEach(v => { const style = railOf(v); if (style === 'none' && !all) return;
            v.pts.forEach((a, i) => { const b = v.pts[(i + 1) % v.pts.length]; if (alongWall(f, a, b)) return;
                // un bord partagé avec un autre vide : pas de garde-corps (les deux vides n'en font qu'un)
                if (voids.some(o => o !== v && onEdge(o.pts, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))) return;
                const gaps = ops.map(o => arrivalGap(a, b, o.it)).filter(Boolean); cutSeg(a, b, gaps).filter(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 15).forEach(([p, q]) => out.push({a: p, b: q, style, h: railHOf(v), src: 'void:' + v.id})); }); }); // un bout de moins de 15 cm (contre un mur) : rien
        ops.forEach(({it, poly}) => { const style = railOf(it); if (style === 'none' && !all) return;
            [1, 2, 3].forEach(i => { const a = poly[i], b = poly[(i + 1) % 4]; if (alongWall(f, a, b) || inVoid(a, b)) return; out.push({a, b, style, h: railHOf(it), src: 'stair:' + it.id}); }); });
        return out;
    }
    const onEdge = (poly, p) => poly.some((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; if (l2 < 1) return false; const k = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; if (k < -.01 || k > 1.01) return false; return Math.hypot(p[0] - (a[0] + dx * k), p[1] - (a[1] + dy * k)) < 3; });
    /** la visite : on ne marche pas dans le vide (les mêmes bords que les garde-corps, même « aucun ») ; en cm */
    const blockersOf = (H, f) => railsOf(H, f, {all: true}).map(r => [r.a, r.b]);
    /** le nom de la pièce de l'étage du dessous sous ce point (« vide sur séjour ») */
    const roomUnder = (H, f, p) => { const b = floorBelow(H, f); if (!b) return null; return (b.rooms || []).find(r => !r.void && r.pts?.length > 2 && pointIn(r.pts, p)) || null; };
    /** l'endroit où l'on arrive en haut d'un escalier (un peu au-delà de la dernière marche), et l'endroit où l'on se pose pour descendre */
    const stairTop = (it, beyond = 35) => rotPt(it, 0, -it.d / 2 - beyond);
    ext.houseVoids = {RAILS, RAIL_KEYS, railOf, railHOf, stairShape, isStair, rotPt, itemPoly, floorBelow, floorAbove, slabOf, stairAuto, stairH, blondel,
        area, pointIn, isConvex, clipConvex, holesForRoom, voidsOf, openingsOf, holesOf, alongWall, cutSeg, arrivalGap, railsOf, blockersOf, roomUnder, stairTop};
    if (typeof module !== 'undefined' && module.exports) module.exports = ext.houseVoids;
})();
