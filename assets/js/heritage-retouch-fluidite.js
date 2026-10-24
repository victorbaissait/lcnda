/**
 * 🎚️ Retouche — 💧 Fluidité (menu Image) : on déforme la photo au pinceau, comme une pâte souple.
 *   ➡ Pousser (l'image suit la main), ⊕ Gonfler, ⊖ Dégonfler (pincer), ↻ ↺ Tourbillon, ↩ Reconstruire (revenir par endroits) ;
 *   taille et force du pinceau ; ↶ annule le dernier coup ; « Appliquer » pose le résultat sur un calque « Fluidité »
 *   (la photo reste dessous, intacte : 👁 pour comparer, masque et opacité comme tout calque).
 * Le calcul : un champ de déplacements (pour chaque point, d'où vient sa couleur) et un rendu bilinéaire ; seule la zone touchée
 * est recalculée pendant qu'on peint. Purs et testés (tests/test-retouche-fluidite.js) : ext.rtPlus.liquifyAlgo.
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};

    /* ═════════ Le calcul ═════════ */
    const field = (W, H) => ({W, H, dx: new Float32Array(W * H), dy: new Float32Array(W * H)});
    const copy = f => ({W: f.W, H: f.H, dx: new Float32Array(f.dx), dy: new Float32Array(f.dy)});
    /** la valeur du champ en un point quelconque (bilinéaire, bords tenus) */
    function at(f, x, y) {
        const {W, H} = f; x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
        const x0 = x | 0, y0 = y | 0, ax = x - x0, ay = y - y0, i = y0 * W + x0;
        const lerp = a => (a[i] * (1 - ax) + a[i + 1] * ax) * (1 - ay) + (a[i + W] * (1 - ax) + a[i + W + 1] * ax) * ay;
        return [lerp(f.dx), lerp(f.dy)];
    }
    /** Un coup de pinceau au point (cx, cy), rayon r, force k (0…1) ; pour « push » : (mx, my) le déplacement de la main.
     *  Rend la boîte touchée {x0, y0, x1, y1}. Le champ dit d'où vient chaque point : sortie(p) = image(p + d(p)). */
    function brush(f, op, cx, cy, r, k, mx = 0, my = 0) {
        const {W, H} = f, x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
        if (x1 < x0 || y1 < y0) return null;
        const src = op === 'push' ? copy(f) : null, r2 = r * r;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const ex = x - cx, ey = y - cy, d2 = ex * ex + ey * ey; if (d2 >= r2) continue;
            const t = 1 - d2 / r2, w = t * t * k, i = y * W + x;
            if (op === 'push') { // le point prend ce qui était un peu en arrière de la main
                const [ddx, ddy] = at(src, x - mx * w, y - my * w); f.dx[i] = ddx - mx * w; f.dy[i] = ddy - my * w;
            } else if (op === 'bloat' || op === 'pinch') { const s = (op === 'bloat' ? -0.12 : 0.12) * w; f.dx[i] += ex * s; f.dy[i] += ey * s; }
            else if (op === 'twirl' || op === 'twirlL') { const s = (op === 'twirl' ? 0.08 : -0.08) * w; f.dx[i] += -ey * s; f.dy[i] += ex * s; }
            else if (op === 'restore') { const s = 1 - Math.min(1, w * 0.6); f.dx[i] *= s; f.dy[i] *= s; }
        }
        return {x0, y0, x1, y1};
    }
    /** Le rendu (RGBA) de la boîte b (tout si absente) : out(p) = src(p + d(p)), bilinéaire */
    function render(src, f, out, b = null) {
        const {W, H} = f, X0 = b ? b.x0 : 0, Y0 = b ? b.y0 : 0, X1 = b ? b.x1 : W - 1, Y1 = b ? b.y1 : H - 1;
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
            const i = y * W + x, o = i * 4, dx = f.dx[i], dy = f.dy[i];
            if (dx === 0 && dy === 0) { out[o] = src[o]; out[o + 1] = src[o + 1]; out[o + 2] = src[o + 2]; out[o + 3] = src[o + 3]; continue; }
            let sx = x + dx, sy = y + dy; sx = sx < 0 ? 0 : sx > W - 1.001 ? W - 1.001 : sx; sy = sy < 0 ? 0 : sy > H - 1.001 ? H - 1.001 : sy;
            const x0 = sx | 0, y0 = sy | 0, ax = sx - x0, ay = sy - y0, p = (y0 * W + x0) * 4, q = p + W * 4;
            for (let c = 0; c < 4; c++) out[o + c] = (src[p + c] * (1 - ax) + src[p + 4 + c] * ax) * (1 - ay) + (src[q + c] * (1 - ax) + src[q + 4 + c] * ax) * ay;
        }
    }
    const moved = f => { for (let i = 0; i < f.dx.length; i++) if (f.dx[i] || f.dy[i]) return true; return false; };
    ext.rtPlus = ext.rtPlus || {};
    ext.rtPlus.liquifyAlgo = {field, brush, render, at, moved};
    if (typeof module === 'object' && module.exports) module.exports = {field, brush, render, at, moved};
    if (typeof document === 'undefined') return;

    /* ═════════ La fenêtre, posée sur la photo de la retouche ═════════ */
    const A = () => root.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
    const TOOLS = [['push', '➡', 'Pousser', 'L’image suit la main'], ['bloat', '⊕', 'Gonfler', 'Agrandit sous le pinceau (garder appuyé)'], ['pinch', '⊖', 'Dégonfler', 'Rétrécit sous le pinceau (garder appuyé)'],
        ['twirl', '↻', 'Tourbillon', 'Fait tourner dans le sens des aiguilles d’une montre'], ['twirlL', '↺', 'Tourbillon inverse', 'Fait tourner dans l’autre sens'], ['restore', '↩', 'Reconstruire', 'Ramène peu à peu l’image d’origine']];
    ext.rtPlus.liquify = async c => {
        const ph0 = c.photo(), W = ph0.width, H = ph0.height;
        if (W * H > 4.2e6) return A().toast('Image trop grande pour la Fluidité.', 'error');
        const src = ph0.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data;
        const F = field(W, H), img = new ImageData(new Uint8ClampedArray(src), W, H), hist = [];
        c.dlg.querySelector('.h-rt-liq')?.remove();
        const pn = document.createElement('div'); pn.className = 'h-rt-liq';
        pn.innerHTML = `<header><b>💧 Fluidité</b><small>Peins sur la photo pour la déformer, comme une pâte souple</small></header>
            <div class="h-rt-liq-tools" role="radiogroup">${TOOLS.map(([k, ic, l, h], i) => `<button type="button" class="button small secondary${i ? '' : ' is-on'}" data-lq-tool="${k}" title="${esc(h)}" aria-pressed="${i ? 'false' : 'true'}">${ic} ${esc(l)}</button>`).join('')}</div>
            <div class="h-rt-liq-opts"><label>Taille <input type="range" data-lq="size" min="5" max="400" value="${Math.round(Math.max(W, H) / 10)}"><output data-lq-o="size"></output></label><label>Force <input type="range" data-lq="force" min="5" max="100" value="70"><output data-lq-o="force"></output></label></div>
            <div class="h-rt-liq-stage"><canvas data-lq-canvas width="${W}" height="${H}"></canvas><i class="h-rt-liq-ring" hidden></i></div>
            <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-lq-undo disabled>↶ Annuler le coup</button><button type="button" class="button small secondary" data-lq-reset>Tout remettre</button><span style="flex:1"></span><button type="button" class="button small secondary" data-lq-cancel>Annuler</button><button type="button" class="button small" data-lq-ok>✓ Appliquer (calque « Fluidité »)</button></div>`;
        c.left.appendChild(pn);
        const cv = pn.querySelector('[data-lq-canvas]'), g = cv.getContext('2d'), ring = pn.querySelector('.h-rt-liq-ring'), stage = pn.querySelector('.h-rt-liq-stage');
        g.putImageData(img, 0, 0);
        let tool = 'push';
        const val = k => Number(pn.querySelector(`[data-lq="${k}"]`).value);
        const outs = () => { pn.querySelector('[data-lq-o="size"]').textContent = val('size') + ' px'; pn.querySelector('[data-lq-o="force"]').textContent = val('force') + ' %'; };
        outs();
        const scaleOf = () => cv.getBoundingClientRect().width / W;
        const toImg = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
        const paint = b => { if (!b) return; render(src, F, img.data, b); g.putImageData(img, 0, 0, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); };
        const showRing = e => { const r = cv.getBoundingClientRect(), s = stage.getBoundingClientRect(), d = val('size') * scaleOf(); ring.hidden = false; ring.style.width = ring.style.height = `${d}px`; ring.style.left = `${e.clientX - s.left - d / 2}px`; ring.style.top = `${e.clientY - s.top - d / 2}px`; void r; };
        let down = null, timer = 0;
        const step = (x, y, mx = 0, my = 0) => paint(brush(F, tool, x, y, val('size') / 2, val('force') / 100, mx, my));
        cv.addEventListener('pointerdown', e => {
            e.preventDefault(); cv.setPointerCapture?.(e.pointerId); hist.push(copy(F)); if (hist.length > 20) hist.shift(); pn.querySelector('[data-lq-undo]').disabled = false;
            const [x, y] = toImg(e); down = {x, y};
            if (tool !== 'push') { step(x, y); clearInterval(timer); timer = setInterval(() => down && step(down.x, down.y), 40); } // gonfler, pincer, tourner : ça agit tant qu'on appuie
        });
        cv.addEventListener('pointermove', e => {
            showRing(e); if (!down) return; const [x, y] = toImg(e);
            if (tool === 'push') { const mx = x - down.x, my = y - down.y, n = Math.max(1, Math.ceil(Math.hypot(mx, my) / Math.max(2, val('size') / 8))); for (let s = 1; s <= n; s++) step(down.x + mx * (s - 1) / n, down.y + my * (s - 1) / n, mx / n, my / n); }
            else step(x, y);
            down = {x, y};
        });
        const up = () => { down = null; clearInterval(timer); };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', () => { ring.hidden = true; });
        pn.addEventListener('input', e => { if (e.target.dataset.lq) outs(); });
        const close = () => { up(); pn.remove(); };
        pn.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.lqTool) { tool = b.dataset.lqTool; pn.querySelectorAll('[data-lq-tool]').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); }); return; }
            if (b.hasAttribute('data-lq-undo')) { const h = hist.pop(); if (h) { F.dx.set(h.dx); F.dy.set(h.dy); paint({x0: 0, y0: 0, x1: W - 1, y1: H - 1}); } b.disabled = !hist.length; return; }
            if (b.hasAttribute('data-lq-reset')) { hist.push(copy(F)); F.dx.fill(0); F.dy.fill(0); paint({x0: 0, y0: 0, x1: W - 1, y1: H - 1}); pn.querySelector('[data-lq-undo]').disabled = false; return; }
            if (b.hasAttribute('data-lq-cancel')) return close();
            if (b.hasAttribute('data-lq-ok')) {
                if (!moved(F)) { close(); return A().toast('Rien n’a été déformé.'); }
                const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').putImageData(img, 0, 0);
                c.setActive(''); const node = c.newLayer('Fluidité'); node.ops = [{type: 'image', mask: c.addMask(out), x: 0, y: 0, w: 1, h: 1, rot: 0, opacity: 1}]; c.renderLayer(node);
                close(); c.refresh(); c.commit('Fluidité'); A().toast('💧 Fluidité appliquée sur le calque « Fluidité » (la photo reste dessous : 👁 pour comparer).', 'success');
            }
        });
        pn.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    };

    if (document.getElementById('h-rt-liq-css')) return;
    const st = document.createElement('style'); st.id = 'h-rt-liq-css'; st.textContent = `
.h-rt-liq{position:absolute;inset:8px;z-index:20;display:grid;grid-template-rows:auto auto auto 1fr auto;gap:8px;padding:10px 12px;border-radius:10px;background:var(--card-bg,#fff);color:var(--text,#111);box-shadow:0 8px 28px rgba(0,0,0,.28)}
.h-rt-liq header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.h-rt-liq header small{opacity:.7}
.h-rt-liq-tools,.h-rt-liq-opts{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}.h-rt-liq-tools .is-on{outline:2px solid #2a7de1;outline-offset:1px}
.h-rt-liq-opts label{display:flex;align-items:center;gap:6px;font-size:13px}.h-rt-liq-opts output{min-width:52px;font-variant-numeric:tabular-nums}
.h-rt-liq-stage{position:relative;min-height:0;display:grid;place-items:center;overflow:hidden;background:repeating-conic-gradient(#ddd 0 25%,#f4f4f4 0 50%) 0 0/16px 16px;border-radius:6px}
.h-rt-liq-stage canvas{max-width:100%;max-height:100%;cursor:none;touch-action:none}
.h-rt-liq-ring{position:absolute;border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none}`;
    document.head.appendChild(st);
})(typeof window !== 'undefined' ? window : globalThis);
