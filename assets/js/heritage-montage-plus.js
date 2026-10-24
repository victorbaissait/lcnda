/**
 * 🎬 Montage — des outils d'étalonnage et de son en plus (branchés par ext.montage* dans heritage-studio-av.js) :
 *  - 🎨 Roues de couleur : ombres, tons moyens, hautes lumières ; on tire le point vers une couleur (au centre : rien),
 *    double-clic pour revenir au centre. Dessinées sur l'image par le moteur (aperçu et export identiques) ;
 *  - 🎯 Vectorscope et histogramme : les couleurs de l'image (teinte autour, saturation vers le bord) avec les repères
 *    R, Mg, B, Cy, V, J et la ligne des tons chair ; la lumière de sombre à clair ; suit la lecture ;
 *  - 📢 Volume standard à l'export (LUFS, norme UIT-R BS.1770) : le montage est d'abord mélangé hors ligne et mesuré, puis
 *    enregistré au bon niveau (−14 internet, −16 balado, −23 télévision), sans dépasser −1 dB de crête.
 * Sans écran (Node, essais) : ext.montageLoud = {lufs, kWeights, gainFor} et ext.montageWheels = {parse, color, scopeXY}.
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};

    /* ═════════ 📢 La sonie intégrée (LUFS), selon UIT-R BS.1770-4 ═════════ */
    /** Les deux filtres de la pondération K (plateau aigu + passe-haut), recalculés pour la fréquence donnée */
    function kWeights(sr) {
        let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / sr);
        const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
        const shelf = {b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]};
        f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr);
        const a1 = 1 + K / Q + K * K;
        const hp = {b: [1, -2, 1], a: [2 * (K * K - 1) / a1, (1 - K / Q + K * K) / a1]};
        return [shelf, hp];
    }
    const biquad = (x, {b, a}) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
    /** chans : des Float32Array (une par voie) ; rend {lufs, peak} (lufs = -Infinity pour un silence) */
    function lufs(chans, sr) {
        const [sh, hp] = kWeights(sr), n = chans[0]?.length || 0; let peak = 0;
        const w = chans.map(c => { for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; } return biquad(biquad(c, sh), hp); });
        const B = Math.round(sr * 0.4), step = Math.round(sr * 0.1), z = [];
        // les carrés cumulés : chaque bloc de 400 ms (pas de 100 ms) se lit d'un coup
        const cum = w.map(c => { const s = new Float64Array(c.length + 1); for (let i = 0; i < c.length; i++) s[i + 1] = s[i] + c[i] * c[i]; return s; });
        for (let i = 0; i + B <= n; i += step) z.push(cum.reduce((t, s) => t + (s[i + B] - s[i]) / B, 0));
        if (!z.length && n) z.push(cum.reduce((t, s) => t + s[n] / n, 0));
        const L = v => -0.691 + 10 * Math.log10(v), mean = a => a.reduce((t, v) => t + v, 0) / a.length;
        const g1 = z.filter(v => v > 0 && L(v) > -70); if (!g1.length) return {lufs: -Infinity, peak};
        const rel = L(mean(g1)) - 10, g2 = g1.filter(v => L(v) > rel);
        return {lufs: L(mean(g2.length ? g2 : g1)), peak};
    }

    /** Le mélange du montage, hors ligne (approché : volumes, vitesses, fondus du son ; sans les effets) — 2 voies à 24 kHz */
    async function mixMontage(P, {onStep, sr = 24000} = {}) {
        const spd = c => Math.max(0.1, Math.min(10, Number(c?.speed) || 1)), clen = c => (c.to - c.from) / spd(c);
        let t = 0; const items = [];
        P.v1.forEach((c, k) => { const len = clen(c), d = k && c.tr?.type && c.tr.type !== 'none' && !/^(black|white|color)$/.test(c.tr.type) ? Math.min(c.tr.d || 1, len / 2) : 0; const at = Math.max(0, t - d); t = at + len; if (!c.mute && (c.vol ?? 1) > 0) items.push({c, at, vol: c.vol ?? 1}); });
        (P.v2 || []).forEach(c => { if (!c.mute && (c.vol ?? 1) > 0 && P.sources[c.s]?.kind === 'video') items.push({c, at: c.at, vol: c.vol ?? 1}); });
        (P.audio || []).forEach(c => { if ((c.vol ?? 1) > 0) items.push({c, at: c.at, vol: c.vol ?? 1, fade: true}); });
        const end = Math.max(0.1, ...items.map(x => x.at + clen(x.c)), ...(P.texts || []).map(x => x.at + x.dur)), N = Math.ceil(end * sr);
        const out = [new Float32Array(N), new Float32Array(N)], cache = new Map(), OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
        const decode = async src => { if (cache.has(src)) return cache.get(src); let b = null; try { const ab = await (await fetch(src)).arrayBuffer(); b = await new OAC(2, 1, sr).decodeAudioData(ab); } catch (_) { b = null; } cache.set(src, b); return b; };
        for (const [n, it] of items.entries()) {
            onStep?.(n / items.length); const so = P.sources[it.c.s]; if (!so || so.kind === 'image') continue;
            const b = await decode(so.src); if (!b) continue;
            const ch = [0, 1].map(i => b.getChannelData(Math.min(i, b.numberOfChannels - 1))), s = spd(it.c), len = clen(it.c), i0 = Math.round(it.at * sr), m = Math.min(N - i0, Math.round(len * sr));
            for (let i = 0; i < m; i++) {
                const j = Math.floor((it.c.from + i / sr * s) * b.sampleRate); if (j >= ch[0].length) break; let v = it.vol;
                if (it.fade) { const x = i / sr; if (it.c.fadeIn && x < it.c.fadeIn) v *= x / it.c.fadeIn; if (it.c.fadeOut && len - x < it.c.fadeOut) v *= Math.max(0, (len - x) / it.c.fadeOut); }
                out[0][i0 + i] += ch[0][j] * v; out[1][i0 + i] += ch[1][j] * v;
            }
        }
        const fv = P.fx?.mute ? 0 : (P.fx?.volume ?? 1); if (fv !== 1) out.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= fv; });
        return {chans: out, sr};
    }
    /** Le gain à appliquer pour atteindre la cible (en LUFS), plafonné pour garder −1 dB de crête : {gain, lufs, after, limited} */
    async function gainFor(P, target, opts = {}) {
        const {chans, sr} = await mixMontage(P, opts), m = lufs(chans, sr);
        if (!isFinite(m.lufs)) return {gain: 1, lufs: m.lufs, after: m.lufs, limited: false};
        let gain = Math.pow(10, (target - m.lufs) / 20); const cap = m.peak > 0 ? Math.pow(10, -1 / 20) / m.peak : Infinity, limited = gain > cap;
        // au-delà de la crête, le limiteur du moteur prend le relais : on s'autorise 6 dB de plus, pas davantage
        gain = Math.min(gain, cap * 2, 16);
        return {gain, lufs: m.lufs, after: m.lufs + 20 * Math.log10(gain), limited};
    }
    ext.montageLoud = {lufs, kWeights, gainFor, mixMontage, TARGETS: [[0, 'Comme il est (pas de changement)'], [-14, '−14 LUFS · internet (YouTube, réseaux)'], [-16, '−16 LUFS · balado, voix'], [-23, '−23 LUFS · télévision (EBU R128)']]};

    /* ═════════ 🎨 Les roues de couleur ═════════ */
    const ZONES = [['sh', 'Ombres'], ['mid', 'Tons moyens'], ['hi', 'Hautes lumières']];
    /** « x,y » (ou [x, y]) → [x, y] dans le disque unité */
    const parse = v => { const a = Array.isArray(v) ? v : String(v ?? '').split(','); let x = Number(a[0]) || 0, y = Number(a[1]) || 0; const r = Math.hypot(x, y); if (r > 1) { x /= r; y /= r; } return [x, y]; };
    /** la couleur d'un point de la roue (teinte = angle, 0° = rouge en haut à droite comme un vectorscope) et sa force (0…1) */
    function color([x, y]) {
        const r = Math.min(1, Math.hypot(x, y)); if (r < 0.01) return null;
        const h = ((Math.atan2(-y, x) * 180 / Math.PI) + 360) % 360;
        const f = n => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); };
        return {r: f(5), g: f(3), b: f(1), s: r, h};
    }
    /** les roues d'un morceau et du film s'ajoutent */
    const merged = (a, b) => ZONES.map(([z]) => { const p = parse(a?.cw?.[z]), q = parse(b?.cw?.[z]); return [z, [p[0] + q[0], p[1] + q[1]]]; });
    /** Le moteur appelle ceci après avoir posé l'image d'un morceau : ombres en « écran », tons moyens en « lumière douce »,
     *  hautes lumières en « produit » (chacun touche surtout sa zone de lumière) */
    function paint(g, W, H, look, filmLook, clip, alpha = 1) {
        const zs = merged(look, filmLook).map(([z, p]) => [z, color(parse(p))]).filter(([, c]) => c); if (!zs.length) return;
        g.save(); clip?.();
        for (const [z, c] of zs) {
            if (z === 'sh') { g.globalCompositeOperation = 'screen'; g.globalAlpha = alpha * c.s * 0.32; g.fillStyle = `rgb(${c.r},${c.g},${c.b})`; }
            else if (z === 'mid') { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = alpha * c.s * 0.7; g.fillStyle = `rgb(${c.r},${c.g},${c.b})`; }
            else { const k = c.s * 0.45, mix = v => Math.round(255 - (255 - v) * k); g.globalCompositeOperation = 'multiply'; g.globalAlpha = alpha; g.fillStyle = `rgb(${mix(c.r)},${mix(c.g)},${mix(c.b)})`; }
            g.fillRect(0, 0, W, H);
        }
        g.restore();
    }
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** Le HTML des trois roues (dans l'onglet Couleurs) : chaque roue garde sa valeur dans un champ caché data-mt-k="<scope>.cw.<zone>" */
    const html = (cw, scope) => `<div class="h-mt-wheels"><b>Roues de couleur</b><span class="muted"> · tire le point vers une couleur, double-clic pour revenir</span><div class="h-mt-wheelrow">${ZONES.map(([z, l]) => { const [x, y] = parse(cw?.[z]);
        return `<div class="h-mt-wheel" data-mt-wheel="${scope}.cw.${z}"><div class="h-mt-wheel-disc"><i style="left:${50 + x * 50}%;top:${50 + y * 50}%"></i></div><span>${esc(l)}</span><input type="hidden" data-mt-k="${scope}.cw.${z}" value="${x ? `${x.toFixed(3)},${y.toFixed(3)}` : ''}"></div>`; }).join('')}</div></div>`;
    /** Fait marcher les roues d'une fenêtre (une seule fois par fenêtre) */
    function bind(dl) {
        if (!dl || dl.dataset.mtWheels) return; dl.dataset.mtWheels = '1';
        const set = (w, x, y) => { const r = Math.hypot(x, y); if (r > 1) { x /= r; y /= r; } if (r < 0.04) { x = 0; y = 0; } const dot = w.querySelector('i'); dot.style.left = `${50 + x * 50}%`; dot.style.top = `${50 + y * 50}%`;
            const inp = w.querySelector('input'); inp.value = x || y ? `${x.toFixed(3)},${y.toFixed(3)}` : ''; inp.dispatchEvent(new Event('input', {bubbles: true})); };
        const at = (w, e) => { const b = w.querySelector('.h-mt-wheel-disc').getBoundingClientRect(); return [(e.clientX - b.left) / b.width * 2 - 1, (e.clientY - b.top) / b.height * 2 - 1]; };
        dl.addEventListener('pointerdown', e => { const d = e.target.closest('.h-mt-wheel-disc'); if (!d) return; const w = d.closest('[data-mt-wheel]'); e.preventDefault(); d.setPointerCapture?.(e.pointerId);
            const mv = ev => set(w, ...at(w, ev)), up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); };
            d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up); mv(e); });
        dl.addEventListener('dblclick', e => { const w = e.target.closest('[data-mt-wheel]'); if (w) set(w, 0, 0); });
    }
    /** La place d'une couleur sur le vectorscope (Cb, Cr de BT.601, de −0,5 à 0,5) : [x, y] dans le disque unité */
    const scopeXY = (r, g, b) => { const cb = (-0.168736 * r - 0.331264 * g + 0.5 * b) / 255, cr = (0.5 * r - 0.418688 * g - 0.081312 * b) / 255; return [cb * 2, -cr * 2]; };
    ext.montageWheels = {parse, color, paint, html, bind, scopeXY, ZONES};

    /* ═════════ 🎯 Vectorscope et histogramme (un petit panneau sur l'aperçu) ═════════ */
    function scope(dl, cv) {
        const old = dl.querySelector('.h-mt-scope'); if (old) { old.remove(); return; }
        const box = document.createElement('div'); box.className = 'h-mt-scope';
        box.innerHTML = `<div class="h-mt-scope-head"><b>🎯 Vectorscope</b><button type="button" class="icon-button small" data-mt-scopex aria-label="Fermer">×</button></div><canvas width="200" height="200" data-v></canvas><canvas width="200" height="60" data-h></canvas><small class="muted">Teinte autour, saturation vers le bord · ligne : tons chair · dessous : du sombre au clair</small>`;
        dl.appendChild(box); box.querySelector('[data-mt-scopex]').onclick = () => box.remove();
        const vg = box.querySelector('[data-v]').getContext('2d'), hg = box.querySelector('[data-h]').getContext('2d');
        const sm = document.createElement('canvas'), SW = 120; const sg = sm.getContext('2d', {willReadFrequently: true});
        // les repères : les six couleurs à 75 %, et la ligne des tons chair
        const marks = [['R', 191, 0, 0], ['Mg', 191, 0, 191], ['B', 0, 0, 191], ['Cy', 0, 191, 191], ['V', 0, 191, 0], ['J', 191, 191, 0]];
        const skin = scopeXY(224, 172, 138), sa = Math.atan2(skin[1], skin[0]);
        let last = 0;
        const frame = now => {
            if (!box.isConnected || !dl.isConnected) return; requestAnimationFrame(frame); if (now - last < 160) return; last = now;
            if (!cv.width || !cv.height) return; const SH = Math.max(1, Math.round(SW * cv.height / cv.width)); sm.width = SW; sm.height = SH;
            try { sg.drawImage(cv, 0, 0, SW, SH); } catch (_) { return; }
            let px; try { px = sg.getImageData(0, 0, SW, SH).data; } catch (_) { return; }
            const R = 92, C = 100; vg.fillStyle = '#0d0f12'; vg.fillRect(0, 0, 200, 200);
            vg.strokeStyle = 'rgba(255,255,255,.18)'; vg.lineWidth = 1; [1, 0.5].forEach(k => { vg.beginPath(); vg.arc(C, C, R * k, 0, Math.PI * 2); vg.stroke(); });
            vg.beginPath(); vg.moveTo(C - R, C); vg.lineTo(C + R, C); vg.moveTo(C, C - R); vg.lineTo(C, C + R); vg.stroke();
            vg.strokeStyle = 'rgba(255,190,140,.55)'; vg.beginPath(); vg.moveTo(C, C); vg.lineTo(C + Math.cos(sa) * R, C + Math.sin(sa) * R); vg.stroke();
            vg.font = '10px system-ui, sans-serif'; vg.textAlign = 'center'; vg.textBaseline = 'middle';
            marks.forEach(([l, r, g, b]) => { const [x, y] = scopeXY(r, g, b); vg.strokeStyle = `rgba(${r + 40},${g + 40},${b + 40},.8)`; vg.strokeRect(C + x * R - 5, C + y * R - 5, 10, 10); vg.fillStyle = 'rgba(255,255,255,.7)'; vg.fillText(l, C + x * R * 1.18, C + y * R * 1.18); });
            vg.globalCompositeOperation = 'lighter'; const hist = new Uint32Array(64);
            for (let i = 0; i < px.length; i += 4) {
                const r = px[i], g = px[i + 1], b = px[i + 2], [x, y] = scopeXY(r, g, b);
                vg.fillStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},.22)`; vg.fillRect(C + x * R, C + y * R, 1.4, 1.4);
                hist[Math.min(63, (0.299 * r + 0.587 * g + 0.114 * b) / 4 | 0)]++;
            }
            vg.globalCompositeOperation = 'source-over';
            hg.fillStyle = '#0d0f12'; hg.fillRect(0, 0, 200, 60); const mx = Math.max(1, ...hist); hg.fillStyle = 'rgba(220,226,235,.85)';
            hist.forEach((v, i) => { const h = Math.round(Math.sqrt(v / mx) * 56); hg.fillRect(i * 200 / 64, 60 - h, 200 / 64 - 0.5, h); });
        };
        requestAnimationFrame(frame);
    }
    ext.montageScope = scope;

    if (typeof module === 'object' && module.exports) module.exports = {lufs, kWeights, parse, color, scopeXY};
    if (typeof document === 'undefined' || document.getElementById('h-mt-plus-css')) return;
    const st = document.createElement('style'); st.id = 'h-mt-plus-css'; st.textContent = `
.h-mt-wheels{margin:10px 0 4px}.h-mt-wheelrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
.h-mt-wheel{display:grid;justify-items:center;gap:3px;font-size:12px}
.h-mt-wheel-disc{position:relative;width:100%;max-width:92px;aspect-ratio:1;border-radius:50%;cursor:crosshair;touch-action:none;
 background:radial-gradient(circle,#808080 0,rgba(128,128,128,0) 72%),conic-gradient(from 90deg,#ff3b3b,#ff3bff,#3b3bff,#3bffff,#3bff3b,#ffff3b,#ff3b3b);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.h-mt-wheel-disc i{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;border:2px solid #222;pointer-events:none}
.h-mt-scope{position:absolute;right:14px;top:70px;z-index:30;background:#16191e;color:#e8ecf2;border-radius:10px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:grid;gap:6px;width:216px}
.h-mt-scope canvas{display:block;border-radius:6px;width:200px}.h-mt-scope .muted{color:#a9b0bb;font-size:11px;line-height:1.3}
.h-mt-scope-head{display:flex;align-items:center;justify-content:space-between}.h-mt-scope-head .icon-button{color:inherit}`;
    document.head.appendChild(st);
})(typeof window !== 'undefined' ? window : globalThis);
