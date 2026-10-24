/**
 * ✏️ Vectoriel — deux aides de dessin (branchées par ext.vectorPlus dans heritage-vector.js) :
 *  - 📏 Cote (outil, touche D) : on tire entre deux points ; une ligne de cote avec ses flèches, deux petits traits de rappel et
 *    la longueur écrite au milieu, dans l'unité du document (cm, mm, pouces ou px ; 96 px = 2,54 cm), le texte tourné dans le
 *    sens de la ligne et toujours lisible ; c'est un groupe (on peut le déplacer, le dégrouper, changer la couleur) ;
 *  - 📐 Grille de perspective (menu Affichage) : à 1 ou 2 points de fuite, sur une ligne d'horizon ; des lignes de fuite par-dessus
 *    le dessin (pas imprimées) ; la ligne et la cote s'alignent toutes seules sur une ligne de fuite, une verticale ou
 *    l'horizontale quand on en est près (⌘ ou Ctrl : sans).
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
    ext.vectorPlus = {lenLabel, dimObj, cleanPersp, perspPath, perspSnap, perspDialog};
    if (typeof module === 'object' && module.exports) module.exports = {lenLabel, dimObj, cleanPersp, perspPath, perspSnap};
    if (typeof document === 'undefined' || document.getElementById('vx-plus-css')) return;
    const st = document.createElement('style'); st.id = 'vx-plus-css';
    st.textContent = '.vx-pp{display:grid;gap:2px;margin:8px 0}.vx-pp span{display:flex;justify-content:space-between}.vx-pp-row{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;margin:6px 0}';
    document.head.appendChild(st);
})(typeof window !== 'undefined' ? window : globalThis);
