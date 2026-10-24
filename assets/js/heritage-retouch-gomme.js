/**
 * 🎚️ Retouche — 🪄 Gomme magique (menu Image) : un clic sur le fond (papier d'un document scanné, ciel uni, mur) le rend
 * transparent. Tolérance réglable, « zone voisine seulement » ou « partout cette couleur », bord adouci (pas d'escalier) ;
 * plusieurs clics s'ajoutent, ↶ annule le dernier. « Appliquer » pose le résultat en masque de la photo (rien n'est effacé
 * pour de bon : le masque se retouche au pinceau, ou s'enlève) ; l'image s'enregistre alors en PNG transparent.
 * Pur et testé (tests/test-retouche-gomme.js) : ext.rtPlus.magicAlgo.erase(rgba, W, H, x, y, {tol, contiguous}) → Uint8Array (0…255 effacé).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};

    /** ce qui part (255 = effacé) en cliquant en (x, y) ; tol de 0 à 100 */
    function erase(d, W, H, x, y, {tol = 30, contiguous = true} = {}) {
        const sx = Math.max(0, Math.min(W - 1, Math.round(x))), sy = Math.max(0, Math.min(H - 1, Math.round(y))), k = (sy * W + sx) * 4;
        const r0 = d[k], g0 = d[k + 1], b0 = d[k + 2], t1 = tol * 4.42, t2 = t1 * 1.35 + 8, out = new Uint8Array(W * H);
        const dist = p => { const i = p * 4, dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0; return Math.sqrt(dr * dr + dg * dg + db * db); };
        const val = e => (e <= t1 ? 255 : e >= t2 ? 0 : Math.round(255 * (t2 - e) / (t2 - t1)));
        if (!contiguous) { for (let p = 0; p < W * H; p++) out[p] = val(dist(p)); return out; }
        const seen = new Uint8Array(W * H), stack = [sy * W + sx]; seen[sy * W + sx] = 1;
        while (stack.length) {
            const p = stack.pop(), e = dist(p), v = val(e); out[p] = v; if (e > t1) continue; // un point du bord : adouci, mais on ne s'étend pas au-delà
            const px = p % W, py = (p - px) / W;
            if (px > 0 && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
            if (px < W - 1 && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
            if (py > 0 && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
            if (py < H - 1 && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
        }
        return out;
    }
    ext.rtPlus = ext.rtPlus || {};
    ext.rtPlus.magicAlgo = {erase};
    if (typeof module === 'object' && module.exports) module.exports = {erase};
    if (typeof document === 'undefined') return;

    const A = () => root.LCNDA_APP;
    ext.rtPlus.magicErase = async c => {
        const ph = c.photo(), W = ph.width, H = ph.height, src = ph.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data;
        const gone = new Uint8Array(W * H), hist = [];
        c.dlg.querySelector('.h-rt-liq')?.remove();
        const pn = document.createElement('div'); pn.className = 'h-rt-liq h-rt-magic';
        pn.innerHTML = `<header><b>🪄 Gomme magique</b><small>Clique sur le fond à rendre transparent (plusieurs clics s’ajoutent)</small></header>
            <div class="h-rt-liq-opts"><label>Tolérance <input type="range" data-mg="tol" min="0" max="100" value="30"><output data-mg-o="tol">30</output></label><label class="ui-toggle"><input type="checkbox" data-mg="cont" checked><i></i>Zone voisine seulement (sinon : cette couleur partout)</label></div>
            <div class="h-rt-liq-tools"></div>
            <div class="h-rt-liq-stage"><canvas data-mg-canvas width="${W}" height="${H}" style="cursor:crosshair"></canvas></div>
            <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-mg-undo disabled>↶ Annuler le clic</button><button type="button" class="button small secondary" data-mg-reset>Tout remettre</button><span style="flex:1"></span><button type="button" class="button small secondary" data-mg-cancel>Annuler</button><button type="button" class="button small" data-mg-ok disabled>✓ Appliquer (masque de la photo)</button></div>`;
        c.left.appendChild(pn);
        const cv = pn.querySelector('[data-mg-canvas]'), g = cv.getContext('2d'), img = new ImageData(new Uint8ClampedArray(src), W, H);
        const paint = () => { for (let p = 0; p < W * H; p++) img.data[p * 4 + 3] = Math.round(src[p * 4 + 3] * (255 - gone[p]) / 255); g.clearRect(0, 0, W, H); g.putImageData(img, 0, 0); pn.querySelector('[data-mg-ok]').disabled = !gone.some(v => v); pn.querySelector('[data-mg-undo]').disabled = !hist.length; };
        paint();
        const val = k => pn.querySelector(`[data-mg="${k}"]`);
        pn.addEventListener('input', e => { if (e.target.dataset.mg === 'tol') pn.querySelector('[data-mg-o="tol"]').textContent = e.target.value; });
        cv.addEventListener('click', e => {
            const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
            const m = erase(src, W, H, x, y, {tol: Number(val('tol').value), contiguous: val('cont').checked});
            hist.push(gone.slice()); if (hist.length > 30) hist.shift(); for (let p = 0; p < m.length; p++) if (m[p] > gone[p]) gone[p] = m[p]; paint();
        });
        const close = () => pn.remove();
        pn.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-mg-undo')) { const h = hist.pop(); if (h) gone.set(h); return paint(); }
            if (b.hasAttribute('data-mg-reset')) { hist.push(gone.slice()); gone.fill(0); return paint(); }
            if (b.hasAttribute('data-mg-cancel')) return close();
            if (b.hasAttribute('data-mg-ok')) {
                const P = c.photoNode();
                if (P.mask?.length && !await A().confirmBox('La photo a déjà un masque : la gomme magique le remplace.', {title: 'Remplacer le masque de la photo ?', okLabel: 'Remplacer'})) return;
                const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d'), id = mg.createImageData(W, H);
                for (let p = 0; p < W * H; p++) { id.data[p * 4] = id.data[p * 4 + 1] = id.data[p * 4 + 2] = 255; id.data[p * 4 + 3] = 255 - gone[p]; }
                mg.putImageData(id, 0, 0); P.mask = [{type: 'sel', mask: c.addMask(m)}];
                close(); c.refresh(); c.commit('Gomme magique'); A().toast('🪄 Fond rendu transparent (masque de la photo, à retoucher au pinceau) : l’image s’enregistre en PNG.', 'success');
            }
        });
    };
})(typeof window !== 'undefined' ? window : globalThis);
