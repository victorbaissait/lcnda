/**
 * 🔄 Image → Rotation de l'image (comme Photoshop) : le document entier tourne d'un bloc — 90° horaire, 90° antihoraire, 180°,
 * un angle libre (la zone de travail s'agrandit, coins transparents ou d'une couleur), symétrie horizontale ou verticale.
 * Un seul moteur pour la Retouche complète (heritage-studio.js) et la Retouche rapide (heritage-retouch-simple.js) :
 *   - les étapes (`st.docXf`) : [{r: degrés, sens horaire, bg?}, {f: 'h'|'v'}, {p: 4 coins}] appliquées à l'image de départ
 *     (l'original n'est jamais touché ; ↶ ↷ et les projets rejouent ces étapes) ; 4 × 90° = aucune étape (même image, au point près) ;
 *   - le reste suit : calques (pixels, textes, formes, images placées, dégradés, motifs, traits), masques, sélection, retouches
 *     de la photo (taches, tampon, réparer), perspective, recadrage, zone de travail, taille finale, centres des filtres
 *     (coordonnées 0 à 1 → `doc()` ; les toiles des masques → `canvasStep()`) ;
 *   - l'orientation Exif d'une photo de téléphone (`exifState`) : « ↻ Remettre droite » si le navigateur ne l'a pas appliquée.
 * Sans écran : aussi require() dans Node pour les essais (tests/test-retouche-rotation.js).
 */
(function (root, factory) {
    const O = factory();
    if (typeof module === 'object' && module.exports) module.exports = O;
    if (typeof window !== 'undefined') { window.LCNDA_EXT = window.LCNDA_EXT || {}; window.LCNDA_EXT.rtOrient = O; }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const norm = a => { let v = ((Number(a) || 0) % 360 + 360) % 360; if (v > 180) v -= 360; return Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6; };
    const isFlip = s => s && (s.f === 'h' || s.f === 'v');
    const isRot = s => s && typeof s.r === 'number' && Number.isFinite(s.r);
    const isQuarter = s => isFlip(s) || (isRot(s) && Math.abs(norm(s.r) % 90) < 1e-9);
    const quarterOf = s => (Math.round(norm(s.r) / 90) % 4 + 4) % 4; // 0 : rien, 1 : 90° horaire, 2 : 180°, 3 : 90° antihoraire
    const BG_RX = /^#[0-9a-f]{6}$/i;

    /** Une étape propre (bornée) ou null */
    function clean(s) {
        if (!s || typeof s !== 'object') return null;
        if (s.f === 'h' || s.f === 'v') return {f: s.f};
        if (Array.isArray(s.p) && s.p.length === 4 && s.p.every(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) return {p: s.p.map(([x, y]) => [Math.max(-2, Math.min(3, x)), Math.max(-2, Math.min(3, y))])};
        if (isRot(s)) { const r = norm(s.r); if (!r) return null; const o = {r}; if (Math.abs(r % 90) > 1e-9) o.bg = BG_RX.test(s.bg || '') ? s.bg.toLowerCase() : 'transparent'; return o; }
        return null;
    }
    const cleanList = list => (Array.isArray(list) ? list : []).slice(0, 40).map(clean).filter(Boolean);

    /** La taille après une étape (en points) */
    function dims(W, H, s) {
        if (isFlip(s) || s.p) return [W, H];
        if (isQuarter(s)) return quarterOf(s) % 2 ? [H, W] : [W, H];
        const a = s.r * Math.PI / 180, c = Math.abs(Math.cos(a)), n = Math.abs(Math.sin(a));
        return [Math.max(1, Math.round(W * c + H * n)), Math.max(1, Math.round(W * n + H * c))];
    }
    /** La matrice (a, b, c, d, e, f) d'une étape : point de l'image d'avant (W0 × H0) → point de l'image d'après (W1 × H1) */
    function matrix(W0, H0, W1, H1, s) {
        if (s.f === 'h') return [-1, 0, 0, 1, W0, 0];
        if (s.f === 'v') return [1, 0, 0, -1, 0, H0];
        let co, si;
        if (isQuarter(s)) { const q = quarterOf(s); co = [1, 0, -1, 0][q]; si = [0, 1, 0, -1][q]; }
        else { const a = s.r * Math.PI / 180; co = Math.cos(a); si = Math.sin(a); }
        return [co, si, -si, co, W1 / 2 - co * W0 / 2 + si * H0 / 2, H1 / 2 - si * W0 / 2 - co * H0 / 2];
    }

    /** Ajoute une étape à la liste : les rotations de 90° et les symétries qui se suivent se combinent (4 × 90° = rien) */
    function push(list, step) {
        const s = clean(step), L = cleanList(list); if (!s) return L;
        if (!isQuarter(s)) return [...L, s];
        let i = L.length; while (i > 0 && isQuarter(L[i - 1])) i--;
        let q = 0, m = false; // p ↦ R(90° × q) · (symétrie horizontale si m) · p
        for (const t of [...L.slice(i), s]) {
            if (t.f === 'h') { q = (4 - q) % 4; m = !m; }
            else if (t.f === 'v') { q = (6 - q) % 4; m = !m; }
            else q = (q + quarterOf(t)) % 4;
        }
        const tail = []; if (m) tail.push({f: 'h'}); if (q) tail.push({r: [0, 90, 180, -90][q]});
        return [...L.slice(0, i), ...tail];
    }

    /** Les coordonnées relatives (0 à 1) d'une image à l'autre */
    function mapper(s, W0, H0, W1, H1) {
        const M = matrix(W0, H0, W1, H1, s), quarter = isQuarter(s), q = isRot(s) ? quarterOf(s) : 0;
        const pt = quarter ? (s.f === 'h' ? ([x, y]) => [1 - x, y] : s.f === 'v' ? ([x, y]) => [x, 1 - y] : [p => p, ([x, y]) => [1 - y, x], ([x, y]) => [1 - x, 1 - y], ([x, y]) => [y, 1 - x]][q])
            : ([x, y]) => { const X = x * W0, Y = y * H0; return [(M[0] * X + M[2] * Y + M[4]) / W1, (M[1] * X + M[3] * Y + M[5]) / H1]; };
        const vec = quarter ? (s.f === 'h' ? ([x, y]) => [-x, y] : s.f === 'v' ? ([x, y]) => [x, -y] : [p => p, ([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x]][q])
            : ([x, y]) => { const X = x * W0, Y = y * H0; return [(M[0] * X + M[2] * Y) / W1, (M[1] * X + M[3] * Y) / H1]; };
        // l'orientation d'un élément (angle r en degrés, retourné m) : une rotation l'ajoute, une symétrie la retourne
        const orient = (r = 0, m = false) => s.f === 'h' ? [norm(-r), !m] : s.f === 'v' ? [norm(180 - r), !m] : [norm(r + s.r), !!m];
        const swap = quarter && !isFlip(s) && q % 2 === 1;
        return {pt, vec, orient, quarter, swap, theta: isRot(s) ? norm(s.r) : 0, flip: s.f || '', kW: W0 / W1, kH: H0 / H1, W0, H0, W1, H1, M};
    }

    const num = v => typeof v === 'number' && Number.isFinite(v);
    const scaleKeys = (o, keys, k) => keys.forEach(key => { if (num(o[key])) o[key] *= k; });
    const TEXT_W = ['size', 'lead', 'shift', 'il', 'ir', 'fi', 'sb', 'sa', 'boxW'];
    const setOrient = (o, key, r, m) => { if (r) o[key] = r; else delete o[key]; if (m) o.mirror = true; else delete o.mirror; };

    /** Un élément d'un calque (ou d'un masque) : ses coordonnées, ses tailles, son angle, ses toiles (masques) */
    function xfOp(op, X, mask) {
        if (!op || typeof op !== 'object') return op;
        const o = {...op}; delete o._bb; delete o._editing;
        const P = (kx, ky) => { if (num(o[kx]) && num(o[ky])) [o[kx], o[ky]] = X.pt([o[kx], o[ky]]); };
        const doc = k => { if (typeof o[k] === 'string') o[k] = mask(o[k], 'doc'); };
        if (o.type === 'pattern') { // ▩ origine, angle, échelle gardée en points, retourné
            P('ox', 'oy'); const [r, m] = X.orient(o.angle || 0, o.mirror); setOrient(o, 'angle', r, m); o.refW = (num(o.refW) ? o.refW : X.W0) / X.kW; doc('clip'); return o;
        }
        if (o.type === 'gradient') { P('x1', 'y1'); P('x2', 'y2'); doc('clip'); return o; }
        if (o.type === 'shape') {
            if (o.kind === 'line' || o.kind === 'arrow') { P('x1', 'y1'); P('x2', 'y2'); }
            else { // rectangle, ellipse : le centre suit, la taille en points reste, l'angle s'ajoute (droit après 90°)
                const [cx, cy] = X.pt([(o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2]); let hw = Math.abs(o.x2 - o.x1) * X.W0 / 2, hh = Math.abs(o.y2 - o.y1) * X.H0 / 2;
                let [r] = X.orient(o.rot || 0, false); if (Math.abs(Math.abs(r) - 90) < 1e-9) { [hw, hh] = [hh, hw]; r = 0; } else if (Math.abs(Math.abs(r) - 180) < 1e-9) r = 0;
                o.x1 = cx - hw / X.W1; o.x2 = cx + hw / X.W1; o.y1 = cy - hh / X.H1; o.y2 = cy + hh / X.H1; if (r) o.rot = r; else delete o.rot;
            }
            scaleKeys(o, ['size'], X.kW); return o;
        }
        if (o.type === 'image') { // 🖼️ une image placée : centre, taille en points gardée, rotation, retournée ; son image ne change pas
            const [cx, cy] = X.pt([o.x + o.w / 2, o.y + o.h / 2]); o.w *= X.kW; o.h *= X.kH; o.x = cx - o.w / 2; o.y = cy - o.h / 2;
            const [r, m] = X.orient(o.rot || 0, o.mirror); o.rot = r; if (m) o.mirror = true; else delete o.mirror; return o;
        }
        if (o.type === 'fillmask' || o.type === 'pixels') { doc('mask'); if (num(o.dx) || num(o.dy)) [o.dx, o.dy] = X.vec([o.dx || 0, o.dy || 0]); return o; }
        if (o.type === 'text') { P('x', 'y'); scaleKeys(o, TEXT_W, X.kW); const [r, m] = X.orient(o.rot || 0, o.mirror); setOrient(o, 'rot', r, m); return o; }
        // dans un masque : sélection, tout, inverser, contour progressif
        if (o.type === 'sel') { doc('mask'); return o; }
        if (o.type === 'refine') { scaleKeys(o, ['feather'], X.kW); return o; }
        if (o.type === 'all' || o.type === 'invert') return o;
        if (Array.isArray(o.points)) { // un trait (pinceau, gomme, masque)
            o.points = o.points.map(p => (Array.isArray(p) && num(p[0]) && num(p[1]) ? [...X.pt(p), ...p.slice(2)] : p)); scaleKeys(o, ['size'], X.kW);
            if (o.tip && typeof o.tip === 'object' && !o.tip.follow) { const [r] = X.orient(o.tip.angle || 0, false); o.tip = {...o.tip, angle: r}; }
        }
        return o;
    }
    /** Une retouche de la photo (taches, tampon, réparer, remplir, effacer, poser ailleurs) */
    function xfStroke(g, X, mask) {
        if (!g || typeof g !== 'object') return g;
        const o = {...g};
        if (typeof o.mask === 'string') o.mask = mask(o.mask, 'doc');
        if (o.tool === 'patch' && (num(o.dx) || num(o.dy))) [o.dx, o.dy] = X.vec([o.dx || 0, o.dy || 0]);
        if (Array.isArray(o.dabs)) o.dabs = o.dabs.map(d => { if (!d || !num(d.x)) return d; const e = {...d}; [e.x, e.y] = X.pt([d.x, d.y]); if (num(d.r)) e.r = d.r * X.kW; if (num(d.ox) || num(d.oy)) [e.ox, e.oy] = X.vec([d.ox || 0, d.oy || 0]); return e; });
        return o;
    }
    /** Les centres et positions des filtres (en %) */
    function xfFilters(f, X) {
        if (!f || typeof f !== 'object' || !Array.isArray(f.chain)) return f;
        return {...f, chain: f.chain.map(step => {
            if (!step || typeof step !== 'object') return step; const o = {...step};
            for (const [kx, ky] of [['cx', 'cy'], ['x', 'y']]) if (num(o[kx]) && num(o[ky])) { const [x, y] = X.pt([o[kx] / 100, o[ky] / 100]); o[kx] = Math.round(Math.max(0, Math.min(100, x * 100)) * 100) / 100; o[ky] = Math.round(Math.max(0, Math.min(100, y * 100)) * 100) / 100; }
            return o;
        })};
    }
    function xfNode(n, X, mask) {
        if (!n || typeof n !== 'object') return n;
        const o = {...n};
        if (Array.isArray(o.mask)) o.mask = o.mask.map(m => xfOp(m, X, mask));
        if (Array.isArray(o.ops)) o.ops = o.ops.map(op => xfOp(op, X, mask));
        if (Array.isArray(o.children)) o.children = o.children.map(c => xfNode(c, X, mask));
        if (o.st && typeof o.st === 'object') o.st = {...o.st, filters: xfFilters(o.st.filters, X)};
        return o;
    }
    /** Les coins de la perspective : les mêmes points, rangés pour la nouvelle image (haut gauche, haut droit, bas droit, bas gauche) */
    function xfPersp(q, X) {
        if (!Array.isArray(q) || q.length !== 4 || !X.quarter) return q;
        const C = [[0, 0], [1, 0], [1, 1], [0, 1]], moved = C.map(c => X.pt(c));
        return C.map(c => { const j = moved.findIndex(m => Math.abs(m[0] - c[0]) < 1e-6 && Math.abs(m[1] - c[1]) < 1e-6); return X.pt(q[j < 0 ? 0 : j]); });
    }
    /** Le recadrage (x, y, w, h relatifs ; a : redressement autour du centre de l'image) */
    function xfCrop(c, X) {
        if (!c || !X.quarter) return null; // un angle libre : le cadre d'avant ne tient plus (on le refait, ou « Recadrer » de la fenêtre)
        const [cx, cy] = X.pt([c.x + c.w / 2, c.y + c.h / 2]), w = X.swap ? c.h : c.w, h = X.swap ? c.w : c.h;
        return {...c, x: cx - w / 2, y: cy - h / 2, w, h, a: X.flip ? norm(-(c.a || 0)) : (c.a || 0)};
    }

    /**
     * Tout le document d'un coup (données seulement) : {st, strokes, layers, selId} → le même, tourné.
     * mask(id, sorte) rend l'identifiant de la toile tournée (sorte 'doc' : un masque à la taille de l'image).
     */
    function doc(snap, step, {W0, H0, W1, H1, mask = id => id} = {}) {
        const s = clean(step); if (!s || s.p) return snap;
        if (!W1 || !H1) [W1, H1] = dims(W0, H0, s);
        const X = mapper(s, W0, H0, W1, H1), memo = new Map(), mk = (id, kind) => { const key = kind + ':' + id; if (!memo.has(key)) memo.set(key, mask(id, kind)); return memo.get(key); };
        const st = {...(snap.st || {})}, notes = [];
        if (st.persp) { if (X.quarter) st.persp = xfPersp(st.persp, X); else notes.push('persp'); }
        if (st.crop) { const c = xfCrop(st.crop, X); if (!c) notes.push('crop'); st.crop = c; }
        if (st.board) { const b = {...st.board}; if (X.swap) [b.w, b.h] = [b.h, b.w]; if (X.quarter) [b.ax, b.ay] = X.pt([b.ax ?? 0.5, b.ay ?? 0.5]); st.board = b; }
        if (st.size) { const z = {...st.size}; if (X.swap) [z.w, z.h] = [z.h, z.w]; else if (!X.quarter) { z.w = Math.max(1, Math.round(z.w / X.kW)); z.h = Math.max(1, Math.round(z.h / X.kH)); } st.size = z; }
        if (st.filters) st.filters = xfFilters(st.filters, X);
        st.docXf = push(st.docXf, s);
        const strokes = (snap.strokes || []).map(g => xfStroke(g, X, mk));
        const layers = (snap.layers || []).map(n => xfNode(n, X, mk));
        const selId = snap.selId ? mk(snap.selId, 'doc') : snap.selId;
        return {...snap, st, strokes, layers, selId, notes};
    }

    /** Le plus grand rectangle droit dans l'image tournée de θ (pour « Recadrer sans coins vides »), en points */
    function innerRect(w, h, deg) {
        const a = Math.abs(deg) * Math.PI / 180, si = Math.abs(Math.sin(a)), co = Math.abs(Math.cos(a));
        if (w <= 0 || h <= 0) return [0, 0];
        const long = Math.max(w, h), short = Math.min(w, h);
        if (short <= 2 * si * co * long || Math.abs(si - co) < 1e-10) { const x = short / 2; return w >= h ? [x / si, x / co] : [x / co, x / si]; }
        const c2 = co * co - si * si; return [(w * co - h * si) / c2, (h * co - w * si) / c2];
    }

    /* ── Les toiles (navigateur) ── */
    const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const sizeOf = src => [src.naturalWidth || src.width, src.naturalHeight || src.height];
    /**
     * Une toile tournée par une étape. W1 × H1 : la taille voulue (sinon celle de dims) ; ref : la taille de référence de la toile
     * (une sélection plus petite que l'image se tourne comme l'image). Les rotations de 90° et les symétries gardent chaque point.
     */
    function canvasStep(src, step, {W1, H1, ref = null, bg = null} = {}) {
        const s = clean(step); const [w, h] = sizeOf(src); if (!s || s.p) return src;
        const [W0, H0] = ref || [w, h]; if (!W1 || !H1) [W1, H1] = dims(W0, H0, s);
        const out = mkCanvas(W1, H1), g = out.getContext('2d'), M = matrix(W0, H0, W1, H1, s), fill = bg ?? s.bg;
        if (fill && fill !== 'transparent') { g.fillStyle = fill; g.fillRect(0, 0, W1, H1); }
        g.imageSmoothingEnabled = !isQuarter(s); if (g.imageSmoothingEnabled) g.imageSmoothingQuality = 'high';
        g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); g.drawImage(src, 0, 0, W0, H0);
        return out;
    }
    /** L'image de départ avec toutes ses étapes (warp : la perspective figée, fournie par la retouche) ; garde naturalWidth / naturalHeight */
    function applySteps(src, steps, {warp = null} = {}) {
        let c = src;
        for (const s of cleanList(steps)) c = s.p ? (warp ? warp(c, s.p) : c) : canvasStep(c, s);
        if (c !== src) { c.naturalWidth = c.width; c.naturalHeight = c.height; }
        return c;
    }

    /* ── 📱 L'orientation Exif (photo de téléphone) ── */
    const u8 = b => (b instanceof Uint8Array ? b : new Uint8Array(b));
    function exifOrientation(bytes) {
        const B = (typeof window !== 'undefined' && window.LCNDA_BATCH) || (typeof require === 'function' ? (() => { try { return require('./app-lot-engine.js'); } catch (_) { return null; } })() : null);
        try { return B?.exifInfo ? B.exifInfo(u8(bytes)).orientation || 1 : 1; } catch (_) { return 1; }
    }
    /** La taille enregistrée dans le JPEG (avant toute orientation) : [largeur, hauteur] ou null */
    function jpegSize(bytes) {
        const u = u8(bytes); if (u[0] !== 0xff || u[1] !== 0xd8) return null;
        let i = 2;
        while (i + 9 < u.length) {
            if (u[i] !== 0xff) { i++; continue; }
            const m = u[i + 1]; if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
            if (m === 0xd9 || m === 0xda) break;
            const len = (u[i + 2] << 8) | u[i + 3];
            if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(u[i + 7] << 8) | u[i + 8], (u[i + 5] << 8) | u[i + 6]];
            i += 2 + len;
        }
        return null;
    }
    /** Les étapes qui remettent droite une photo d'orientation o (1 à 8) */
    const EXIF_STEPS = {1: [], 2: [{f: 'h'}], 3: [{r: 180}], 4: [{f: 'v'}], 5: [{f: 'h'}, {r: -90}], 6: [{r: 90}], 7: [{f: 'h'}, {r: 90}], 8: [{r: -90}]};
    const exifSteps = o => (EXIF_STEPS[o] || []).map(s => ({...s}));
    /**
     * Ce qu'il faut faire d'une photo à l'ouverture : {o, applied, steps}. applied : le navigateur l'a déjà affichée droite
     * (la taille lue est celle d'après l'orientation, ou le navigateur sait le faire) ; sinon « ↻ Remettre droite » propose steps.
     */
    function exifState(bytes, shownW, shownH, {browserApplies = null} = {}) {
        const o = exifOrientation(bytes); if (o <= 1 || o > 8) return {o: 1, applied: true, steps: []};
        const raw = jpegSize(bytes), swapping = o >= 5;
        let applied;
        if (swapping && raw && raw[0] !== raw[1]) applied = shownW === raw[1] && shownH === raw[0];
        else applied = browserApplies ?? (typeof CSS !== 'undefined' && CSS.supports ? CSS.supports('image-orientation', 'from-image') : false);
        return {o, applied, steps: exifSteps(o)};
    }

    const label = s => { const c = clean(s); if (!c) return ''; if (c.f) return c.f === 'h' ? 'Symétrie horizontale de l’image' : 'Symétrie verticale de l’image'; if (c.p) return 'Perspective figée';
        const q = isQuarter(c) ? quarterOf(c) : -1; return q === 1 ? 'Rotation de l’image : 90° horaire' : q === 3 ? 'Rotation de l’image : 90° antihoraire' : q === 2 ? 'Rotation de l’image : 180°' : `Rotation de l’image : ${String(Math.abs(c.r)).replace('.', ',')}° ${c.r > 0 ? 'horaire' : 'antihoraire'}`; };

    return {norm, clean, cleanList, isQuarter, dims, matrix, push, mapper, xfOp, xfStroke, xfNode, xfFilters, xfPersp, xfCrop, doc, innerRect,
        canvasStep, applySteps, exifOrientation, jpegSize, exifSteps, exifState, label};
});
