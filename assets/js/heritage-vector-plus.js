/**
 * ✏️ Vectoriel — deux aides de dessin (branchées par ext.vectorPlus dans heritage-vector.js) :
 *  - 📏 Cote (outil, touche D) : on tire entre deux points ; une ligne de cote avec ses flèches, deux petits traits de rappel et
 *    la longueur écrite au milieu, dans l'unité du document (cm, mm, pouces ou px ; 96 px = 2,54 cm), le texte tourné dans le
 *    sens de la ligne et toujours lisible ; c'est un groupe (on peut le déplacer, le dégrouper, changer la couleur) ;
 *  - 📐 Grille de perspective (menu Affichage) : à 1 ou 2 points de fuite, sur une ligne d'horizon ; des lignes de fuite par-dessus
 *    le dessin (pas imprimées) ; la ligne et la cote s'alignent toutes seules sur une ligne de fuite, une verticale ou
 *    l'horizontale quand on en est près (⌘ ou Ctrl : sans).
 *  - 〰 Largeur variable (Propriétés d'un trait) : effilé, plume, s'affinant, s'épaississant, pinceau ; dessiné comme une forme.
 *  - ⧉ Mélange de deux formes (menu Objet) : des étapes entre elles (forme, couleurs, épaisseur, opacité), en groupe.
 * Purs (Node, essais) : ext.vectorPlus = {lenLabel, dimObj, cleanPersp, perspPath, perspSnap}.
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const MM = 96 / 25.4, n2 = v => Math.round(v * 100) / 100;
    const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d), clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ═════════ 📏 La cote ═════════ */
    /** la longueur (en px du document) dans l'unité voulue, à la française : « 12,5 cm » */
    function lenLabel(px, unit = 'cm') {
        const v = unit === 'px' ? px : unit === 'mm' ? px / MM : unit === 'in' ? px / 96 : px / MM / 10;
        const d = unit === 'px' || unit === 'mm' ? (v >= 100 ? 0 : 1) : v >= 100 ? 1 : 2;
        return `${v.toFixed(d).replace(/\.?0+$/, '').replace('.', ',')} ${unit === 'in' ? 'po' : unit}`;
    }
    let seq = 0; const uid0 = () => 'd' + Date.now().toString(36) + (seq++).toString(36);
    /** le groupe d'une cote de (x0, y0) à (x1, y1) ; null si trop courte */
    function dimObj(x0, y0, x1, y1, {unit = 'cm', color = '#c4161c', sw = 1.5, uid = uid0, size = 0} = {}) {
        const L = Math.hypot(x1 - x0, y1 - y0); if (L < 4) return null;
        const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux, ah = clamp(L / 6, 4, 10 + sw * 2), aw = ah * 0.38, ext2 = 6 + sw * 2;
        const P = (x, y) => ({x: n2(x), y: n2(y)});
        const arrow = (x, y, d) => ({id: uid(), type: 'path', name: 'Flèche', closed: true, fill: color, stroke: 'none', sw: 0,
            pts: [P(x, y), P(x - d * ux * ah + nx * aw, y - d * uy * ah + ny * aw), P(x - d * ux * ah - nx * aw, y - d * uy * ah - ny * aw)]});
        const tick = (x, y) => ({id: uid(), type: 'path', name: 'Rappel', closed: false, fill: 'none', stroke: color, sw: n2(sw * 0.7), pts: [P(x - nx * ext2, y - ny * ext2), P(x + nx * ext2, y + ny * ext2)]});
        let a = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI; if (a > 90) a -= 180; if (a <= -90) a += 180; // le texte reste lisible (jamais la tête en bas)
        const fs = size || clamp(L / 9, 10, 28), off = fs * 0.45 + sw, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, side = (a === Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI) ? -1 : 1;
        const text = {id: uid(), type: 'text', name: 'Mesure', text: lenLabel(L, unit), x: n2(mx + nx * off * side), y: n2(my + ny * off * side + fs * 0.35), size: n2(fs), font: 'Helvetica, Arial, sans-serif', align: 'middle', fill: color, sw: 0, ...(Math.abs(a) > 0.5 ? {rot: n2(a)} : {})};
        return {id: uid(), type: 'group', name: `Cote ${text.text}`, dim: {x0: n2(x0), y0: n2(y0), x1: n2(x1), y1: n2(y1), unit}, children: [
            {id: uid(), type: 'path', name: 'Ligne de cote', closed: false, fill: 'none', stroke: color, sw: n2(sw), pts: [P(x0 + ux * ah * 0.9, y0 + uy * ah * 0.9), P(x1 - ux * ah * 0.9, y1 - uy * ah * 0.9)]},
            arrow(x0, y0, -1), arrow(x1, y1, 1), tick(x0, y0), tick(x1, y1), text]};
    }

    /* ═════════ 📐 La perspective ═════════ */
    /** {on, n (1 ou 2 points), hy (hauteur de l'horizon, 0…1), v1, v2 (places des points de fuite sur l'horizon, en part de la largeur), k (nombre de lignes)} */
    const cleanPersp = p => ({on: !!p?.on, n: num(p?.n, 2) === 1 ? 1 : 2, hy: clamp(num(p?.hy, 0.45), -1, 2), v1: clamp(num(p?.v1, -0.1), -3, 4), v2: clamp(num(p?.v2, 1.1), -3, 4), k: clamp(Math.round(num(p?.k, 16)), 4, 60)});
    const vps = (d, p) => p.n === 1 ? [[d.w * (p.v1 + p.v2) / 2, d.h * p.hy]] : [[d.w * p.v1, d.h * p.hy], [d.w * p.v2, d.h * p.hy]];
    /** le tracé (en coordonnées du document) : l'horizon, puis des lignes de fuite qui partent de chaque point vers le bord */
    function perspPath(d, p0) {
        const p = cleanPersp(p0); if (!p.on) return ''; const W = d.w, H = d.h, R = 3 * Math.max(W, H);
        let s = `M${n2(-R)} ${n2(H * p.hy)}H${n2(W + R)}`;
        for (const [vx, vy] of vps(d, p)) {
            // les angles qui touchent le plan de travail : du coin le plus « haut » au plus « bas » vus du point
            const angs = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.atan2(y - vy, x - vx)); let lo = Math.min(...angs), hi = Math.max(...angs);
            if (hi - lo > Math.PI) { const pos = angs.map(a => (a < 0 ? a + 2 * Math.PI : a)); lo = Math.min(...pos); hi = Math.max(...pos); }
            for (let i = 0; i <= p.k; i++) { const a = lo + (hi - lo) * i / p.k; s += `M${n2(vx)} ${n2(vy)}L${n2(vx + Math.cos(a) * R)} ${n2(vy + Math.sin(a) * R)}`; }
        }
        if (p.n === 2) for (let i = 1; i < p.k / 2; i++) { const x = W * i / (p.k / 2); s += `M${n2(x)} 0V${n2(H)}`; } // les verticales (perspective à 2 points)
        return s;
    }
    /** l'extrémité (x1, y1) d'une ligne partie de (x0, y0), recalée sur la direction de perspective la plus proche (à moins de 7°) */
    function perspSnap(d, p0, x0, y0, x1, y1) {
        const p = cleanPersp(p0); if (!p.on) return [x1, y1]; const L = Math.hypot(x1 - x0, y1 - y0); if (L < 3) return [x1, y1];
        const a = Math.atan2(y1 - y0, x1 - x0), dirs = [0, Math.PI / 2, ...vps(d, p).map(([vx, vy]) => Math.atan2(vy - y0, vx - x0))];
        let best = null, bd = 7 * Math.PI / 180;
        for (const b of dirs) for (const c of [b, b + Math.PI]) { let e = Math.abs(((a - c) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); if (e < bd) { bd = e; best = c; } }
        if (best === null) return [x1, y1]; const k = Math.cos(a - best) * L; return [n2(x0 + Math.cos(best) * k), n2(y0 + Math.sin(best) * k)];
    }
    /** la fenêtre de réglage (les changements se voient tout de suite ; « Annuler » remet comme avant) */
    function perspDialog(doc, {redraw, commit}) {
        const p0 = cleanPersp(doc.persp), p = {...p0, on: true}, rng = (k, l, a, b, s, v, f) => `<label class="vx-pp"><span>${l} <output data-pp-o="${k}">${f(v)}</output></span><input type="range" name="${k}" min="${a}" max="${b}" step="${s}" value="${v}"></label>`;
        const pct = v => `${Math.round(v * 100)} %`; let ok = false;
        ext.openDialog({eyebrow: 'AFFICHAGE', title: '📐 Grille de perspective', submitLabel: 'OK',
            body: `<p class="muted">Des lignes de fuite par-dessus le dessin (elles ne s’impriment pas). Avec ╱ Ligne et 📏 Cote, le trait s’aligne sur la ligne de fuite, la verticale ou l’horizontale la plus proche (⌘ ou Ctrl : sans).</p>
                <div class="vx-pp-row"><label class="ui-toggle"><input type="checkbox" name="on" checked><i></i>Montrer la grille</label>
                <label><input type="radio" name="n" value="1" ${p.n === 1 ? 'checked' : ''}> 1 point de fuite (une rue vue de face)</label><label><input type="radio" name="n" value="2" ${p.n === 2 ? 'checked' : ''}> 2 points (une maison vue de l’angle)</label></div>
                ${rng('hy', 'Ligne d’horizon (hauteur)', -0.5, 1.5, 0.01, p.hy, pct)}${rng('v1', 'Point de fuite gauche', -2, 3, 0.01, p.v1, pct)}${rng('v2', 'Point de fuite droit', -2, 3, 0.01, p.v2, pct)}${rng('k', 'Nombre de lignes', 4, 60, 1, p.k, v => String(v))}`,
            onOpen: dl => {
                const read = () => { const f = dl.querySelector('form') || dl; p.on = f.querySelector('[name=on]').checked; p.n = Number(f.querySelector('[name=n]:checked')?.value || 2); ['hy', 'v1', 'v2', 'k'].forEach(k => { p[k] = Number(f.querySelector(`[name=${k}]`).value); const o = f.querySelector(`[data-pp-o="${k}"]`); if (o) o.textContent = k === 'k' ? String(p[k]) : pct(p[k]); });
                    doc.persp = cleanPersp(p); redraw(); };
                dl.addEventListener('input', read); dl.addEventListener('change', read); read();
                dl.addEventListener('close', () => { if (!ok) { doc.persp = p0; redraw(); } }); // fermée sans OK : comme avant
            },
            onSubmit: () => { ok = true; commit(doc.persp.on ? 'Grille de perspective' : 'Grille de perspective cachée'); }});
    }
    /* ═════════ 〰 Largeur variable : un trait (chemin ouvert) devient une forme remplie, plus épaisse ici, plus fine là ═════════ */
    const PROFILES = [['', 'Uniforme'], ['taper', 'Effilé aux deux bouts'], ['swell', 'Plume (épais au milieu)'], ['thin', 'S’affinant (fin au bout)'], ['thick', 'S’épaississant'], ['brush', 'Pinceau (irrégulier)']];
    /** la largeur relative au point t (0…1) du trait */
    function widthAt(p, t) {
        if (p === 'taper') return Math.min(1, Math.sin(Math.PI * t) * 1.6) ** 0.8;
        if (p === 'swell') return 0.15 + 0.85 * Math.sin(Math.PI * t);
        if (p === 'thin') return 1 - 0.92 * t;
        if (p === 'thick') return 0.08 + 0.92 * t;
        if (p === 'brush') return Math.max(0.15, (0.75 + 0.25 * Math.sin(t * 23.7) * Math.cos(t * 9.1)) * Math.min(1, Math.sin(Math.PI * t) * 3));
        return 1;
    }
    /** {...o} d'un chemin ouvert avec o.wp → un chemin fermé rempli de la couleur du trait ; null si rien à faire */
    function vary(o) {
        if (!o || o.type !== 'path' || o.closed || !o.wp || !(Number(o.sw) > 0) || !Array.isArray(o.pts) || o.pts.length < 2 || !o.stroke || o.stroke === 'none') return null;
        const pts = []; // échantillonnage des courbes de Bézier (12 points par morceau)
        for (let i = 0; i < o.pts.length - 1; i++) {
            const a = o.pts[i], b = o.pts[i + 1], c1 = a.o || [a.x, a.y], c2 = b.i || [b.x, b.y];
            for (let k = i ? 1 : 0; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y]); }
        }
        const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const tot = L.at(-1) || 1, left = [], right = [];
        pts.forEach((q, i) => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, w = Number(o.sw) * widthAt(o.wp, L[i] / tot) / 2;
            left.push({x: n2(q[0] - dy / n * w), y: n2(q[1] + dx / n * w)}); right.push({x: n2(q[0] + dy / n * w), y: n2(q[1] - dx / n * w)});
        });
        const v = {...o, pts: [...left, ...right.reverse()], closed: true, fill: o.stroke, stroke: 'none', sw: 0}; delete v.wp; delete v.grad; delete v.pat; delete v.dash; return v;
    }
    /* ═════════ ⧉ Mélange de deux formes : des étapes entre elles (forme, couleurs, épaisseur, opacité) ═════════ */
    /** les points d'un chemin (avec ses courbes), régulièrement espacés : M points */
    function resample(o, M) {
        const raw = [], P = o.pts || [], segs = o.closed ? P.length : P.length - 1;
        for (let i = 0; i < segs; i++) { const a = P[i], b = P[(i + 1) % P.length], c1 = a.o || [a.x, a.y], c2 = b.i || [b.x, b.y];
            for (let k = i ? 1 : 0; k <= 16; k++) { const t = k / 16, u = 1 - t; raw.push([u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y]); } }
        if (raw.length < 2) return raw.length ? Array(M).fill(raw[0]) : null;
        const L = [0]; for (let i = 1; i < raw.length; i++) L.push(L[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
        const tot = L.at(-1) || 1, out = []; let j = 0;
        for (let k = 0; k < M; k++) { const want = tot * k / (o.closed ? M : M - 1); while (j < L.length - 2 && L[j + 1] < want) j++; const f = (want - L[j]) / ((L[j + 1] - L[j]) || 1); out.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f]); }
        return out;
    }
    const hexOf = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)) : null);
    const mixC = (a, b, t) => { const x = hexOf(a), y = hexOf(b); if (!x || !y) return t < 0.5 ? a : b; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
    /** a, b : deux chemins (toPath) ; n étapes entre les deux → n chemins */
    function blend(a, b, n, uid = uid0) {
        const M = 96, closed = !!(a.closed && b.closed), pa = resample({...a, closed}, M), pb0 = resample({...b, closed}, M); if (!pa || !pb0) return [];
        // le départ et le sens de la 2e forme qui collent le mieux à la 1re (sinon le mélange se tord)
        const ca = pa.reduce((s, p) => [s[0] + p[0] / M, s[1] + p[1] / M], [0, 0]), cb = pb0.reduce((s, p) => [s[0] + p[0] / M, s[1] + p[1] / M], [0, 0]);
        let best = pb0, bd = Infinity;
        for (const cand of [pb0, [...pb0].reverse()]) for (let r = 0; r < (closed ? M : 1); r += closed ? 2 : 1) { let d = 0; for (let k = 0; k < M; k++) { const q = cand[(k + r) % M]; d += (pa[k][0] - ca[0] - q[0] + cb[0]) ** 2 + (pa[k][1] - ca[1] - q[1] + cb[1]) ** 2; } if (d < bd) { bd = d; best = cand.map((_, k) => cand[(k + r) % M]); } }
        const out = [];
        for (let s = 1; s <= n; s++) { const t = s / (n + 1);
            out.push({id: uid(), type: 'path', name: `Étape ${s}`, closed, pts: pa.map((p, k) => ({x: n2(p[0] + (best[k][0] - p[0]) * t), y: n2(p[1] + (best[k][1] - p[1]) * t)})),
                fill: mixC(a.fill || 'none', b.fill || 'none', t), stroke: mixC(a.stroke || 'none', b.stroke || 'none', t), sw: n2(num(a.sw) + (num(b.sw) - num(a.sw)) * t), ...(a.op !== undefined || b.op !== undefined ? {op: n2(num(a.op, 1) + (num(b.op, 1) - num(a.op, 1)) * t)} : {})}); }
        return out;
    }
    ext.vectorPlus = {lenLabel, dimObj, cleanPersp, perspPath, perspSnap, perspDialog, vary, widthAt, PROFILES, blend};
    if (typeof module === 'object' && module.exports) module.exports = {lenLabel, dimObj, cleanPersp, perspPath, perspSnap, vary, widthAt, blend};
    if (typeof document === 'undefined' || document.getElementById('vx-plus-css')) return;
    const st = document.createElement('style'); st.id = 'vx-plus-css';
    st.textContent = '.vx-pp{display:grid;gap:2px;margin:8px 0}.vx-pp span{display:flex;justify-content:space-between}.vx-pp-row{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;margin:6px 0}';
    document.head.appendChild(st);
})(typeof window !== 'undefined' ? window : globalThis);
