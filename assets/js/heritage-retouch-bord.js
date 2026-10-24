/**
 * 🎚️ Retouche — ✨ Affiner le bord du masque (menu Image) : pour un détourage, une sélection ou une gomme magique dont le
 * bord est grossier. Le masque du calque choisi (sinon celui de la photo) est recalculé :
 *  - Rayon intelligent : près du bord, le masque épouse les contours de la photo (cheveux, feuillage, poils) — filtre guidé ;
 *  - Lisser : enlève les escaliers et les petits trous ;
 *  - Contraste : bord plus net ou plus doux ;
 *  - Décaler le bord : rentre (enlève un liseré du fond) ou sort.
 * Aperçu en direct (sur damier, ou le masque seul) ; « Appliquer » remplace le masque (↶ pour revenir).
 * Pur et testé (tests/test-retouche-bord.js) : ext.rtPlus.refineAlgo.refine(mask, gray, W, H, opts) → Float32Array.
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    /** moyenne dans un carré de rayon r (images intégrales) */
    function boxMean(a, W, H, r) {
        if (r < 1) return Float32Array.from(a);
        const I = new Float64Array((W + 1) * (H + 1)), o = new Float32Array(W * H);
        for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += a[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
        for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1); for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
            o[y * W + x] = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
        return o;
    }
    /** filtre guidé (He et al.) : p épouse les contours de I */
    function guided(I, p, W, H, r, eps) {
        const N = W * H, Ip = new Float32Array(N), II = new Float32Array(N); for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
        const mI = boxMean(I, W, H, r), mp = boxMean(p, W, H, r), mIp = boxMean(Ip, W, H, r), mII = boxMean(II, W, H, r), a = new Float32Array(N), b = new Float32Array(N);
        for (let i = 0; i < N; i++) { const v = mII[i] - mI[i] * mI[i]; a[i] = (mIp[i] - mI[i] * mp[i]) / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
        const ma = boxMean(a, W, H, r), mb = boxMean(b, W, H, r), q = new Float32Array(N); for (let i = 0; i < N; i++) q[i] = ma[i] * I[i] + mb[i]; return q;
    }
    const cl = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    /** mask, gray : 0…1 ; {smart (px), smooth (px), contrast (0…100), shift (−30…30 px)} */
    function refine(mask, gray, W, H, {smart = 0, smooth = 0, contrast = 0, shift = 0} = {}) {
        let m = Float32Array.from(mask);
        if (smooth >= 1) m = boxMean(boxMean(m, W, H, Math.round(smooth / 2)), W, H, Math.round(smooth / 2));
        if (smart >= 1) { const q = guided(gray, m, W, H, Math.round(smart), 1e-3), near = boxMean(m.map(v => (v > 0.02 && v < 0.98 ? 1 : 0)), W, H, Math.round(smart)), edge = boxMean(m, W, H, Math.round(smart));
            for (let i = 0; i < m.length; i++) { const isEdge = near[i] > 0 || (edge[i] > 0.01 && edge[i] < 0.99); if (isEdge) m[i] = cl(q[i]); } } // le guidé ne touche que la bande du bord
        if (shift) { const r = Math.round(Math.abs(shift)), n = 2 * r + 1, b = boxMean(m, W, H, r); for (let i = 0; i < m.length; i++) m[i] = shift > 0 ? cl(b[i] * n) : cl((b[i] - 1) * n + 1); } // le bord bouge d'environ r points
        if (contrast > 0) { const k = 1 + contrast / 12; for (let i = 0; i < m.length; i++) m[i] = cl((m[i] - 0.5) * k + 0.5); }
        return m;
    }
    ext.rtPlus = ext.rtPlus || {};
    ext.rtPlus.refineAlgo = {refine, guided, boxMean};
    if (typeof module === 'object' && module.exports) module.exports = {refine, guided, boxMean};
    if (typeof document === 'undefined') return;

    const A = () => root.LCNDA_APP;
    ext.rtPlus.refineEdge = async c => {
        const act = c.activeNode(), node = act?.mask?.length ? act : c.photoNode().mask?.length ? c.photoNode() : null;
        if (!node) return A().toast('Il n’y a pas encore de masque : détoure (✂️), gomme le fond (🪄) ou ajoute un masque à un calque, puis affine son bord.', 'error');
        const ph = c.photo(), W = ph.width, H = ph.height, pd = ph.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data;
        const mc = c.maskCanvas(node), md = mc.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data;
        const mask = new Float32Array(W * H), gray = new Float32Array(W * H); for (let i = 0; i < W * H; i++) { mask[i] = md[i * 4 + 3] / 255; gray[i] = (0.299 * pd[i * 4] + 0.587 * pd[i * 4 + 1] + 0.114 * pd[i * 4 + 2]) / 255; }
        c.dlg.querySelector('.h-rt-liq')?.remove();
        const pn = document.createElement('div'); pn.className = 'h-rt-liq h-rt-refine';
        const sl = (k, l, a, b, v, u = '') => `<label>${l} <input type="range" data-rf="${k}" min="${a}" max="${b}" value="${v}"><output data-rf-o="${k}">${v}${u}</output></label>`;
        pn.innerHTML = `<header><b>✨ Affiner le bord</b><small>Masque de « ${String(node.name || 'Photo').replace(/[<>&"]/g, '')} »</small></header>
            <div class="h-rt-liq-opts">${sl('smart', 'Rayon intelligent', 0, 40, 8, ' px')}${sl('smooth', 'Lisser', 0, 20, 2, ' px')}${sl('contrast', 'Contraste', 0, 100, 10, ' %')}${sl('shift', 'Décaler le bord', -20, 20, 0, ' px')}</div>
            <div class="h-rt-liq-tools"><label class="ui-toggle"><input type="checkbox" data-rf-view><i></i>Voir le masque seul (blanc : gardé)</label></div>
            <div class="h-rt-liq-stage"><canvas data-rf-canvas width="${W}" height="${H}"></canvas></div>
            <div class="h-rt-fxbtns"><span style="flex:1"></span><button type="button" class="button small secondary" data-rf-cancel>Annuler</button><button type="button" class="button small" data-rf-ok>✓ Appliquer</button></div>`;
        c.left.appendChild(pn);
        const cv = pn.querySelector('[data-rf-canvas]'), g = cv.getContext('2d'), img = g.createImageData(W, H); let cur = mask, tm = 0;
        const opts = () => Object.fromEntries([...pn.querySelectorAll('[data-rf]')].map(i => [i.dataset.rf, Number(i.value)]));
        const draw = () => { const alone = pn.querySelector('[data-rf-view]').checked; for (let i = 0; i < W * H; i++) { const a = cur[i]; if (alone) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(a * 255); img.data[i * 4 + 3] = 255; } else { img.data.set([pd[i * 4], pd[i * 4 + 1], pd[i * 4 + 2]], i * 4); img.data[i * 4 + 3] = Math.round(a * pd[i * 4 + 3]); } } g.clearRect(0, 0, W, H); g.putImageData(img, 0, 0); };
        const run = () => { cur = refine(mask, gray, W, H, opts()); draw(); };
        run();
        pn.addEventListener('input', e => { const k = e.target.dataset.rf; if (k) { pn.querySelector(`[data-rf-o="${k}"]`).textContent = e.target.value + ({smart: ' px', smooth: ' px', contrast: ' %', shift: ' px'}[k]); clearTimeout(tm); tm = setTimeout(run, 120); } else if (e.target.matches('[data-rf-view]')) draw(); });
        pn.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-rf-cancel')) return pn.remove();
            if (b.hasAttribute('data-rf-ok')) {
                clearTimeout(tm); cur = refine(mask, gray, W, H, opts());
                const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d'), id = mg.createImageData(W, H);
                for (let i = 0; i < W * H; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = Math.round(cur[i] * 255); }
                mg.putImageData(id, 0, 0); node.mask = [{type: 'sel', mask: c.addMask(m)}];
                pn.remove(); if (node !== c.photoNode()) c.renderLayer(node); c.refresh(); c.commit('Bord du masque affiné'); A().toast('✨ Bord affiné (↶ pour revenir ; le pinceau corrige le reste).', 'success');
            }
        });
    };
})(typeof window !== 'undefined' ? window : globalThis);
