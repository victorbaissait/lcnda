/**
 * 🎬 Montage — des outils d'étalonnage et de son en plus (branchés par ext.montage* dans heritage-studio-av.js) :
 *  - 🎨 Roues de couleur : ombres, tons moyens, hautes lumières ; on tire le point vers une couleur (au centre : rien),
 *    double-clic pour revenir au centre. Dessinées sur l'image par le moteur (aperçu et export identiques) ;
 *  - 🎯 Vectorscope et histogramme : les couleurs de l'image (teinte autour, saturation vers le bord) avec les repères
 *    R, Mg, B, Cy, V, J et la ligne des tons chair ; la lumière de sombre à clair ; suit la lecture ;
 *  - 🟩 Fond vert : la couleur du fond (vert, bleu, au choix) devient transparente, avec bord adouci et reflet retiré ;
 *  - 🎯 Suivre ce qui bouge : un titre ou une incrustation suit un point de la vidéo (suivi par corrélation, image par image) ;
 *  - 🎥 Plusieurs caméras : calées entre elles par le son, montées en passant de l'une à l'autre (qui parle, ou à tour de rôle) ;
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

    /* ═════════ 🟩 Fond vert (incrustation par couleur) : ce qui a la couleur choisie devient transparent ═════════ */
    const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x00ff00; return [n >> 16, n >> 8 & 255, n & 255]; };
    const cbcr = (r, g, b) => [(-0.168736 * r - 0.331264 * g + 0.5 * b) / 255, (0.5 * r - 0.418688 * g - 0.081312 * b) / 255];
    /** RGBA en place : k = {color, tol (0…1), soft (0…1), spill (bool)} ; la distance se mesure dans les couleurs (pas la lumière) :
     *  une ombre sur le fond vert part aussi ; la couleur du fond qui « bave » sur le sujet (cheveux, bords) est retirée */
    function keyPixels(d, k = {}) {
        const kc = hexRgb(k.color), [kb, kr] = cbcr(...kc), tol = Math.max(0, Math.min(1, k.tol ?? 0.3)) * 0.6, soft = Math.max(0.005, Math.min(1, k.soft ?? 0.15) * 0.4);
        const dom = kc.indexOf(Math.max(...kc)), o1 = (dom + 1) % 3, o2 = (dom + 2) % 3, spill = k.spill !== false;
        for (let i = 0; i < d.length; i += 4) {
            const [b, r] = cbcr(d[i], d[i + 1], d[i + 2]), dist = Math.hypot(b - kb, r - kr);
            if (dist < tol + soft) { const t = Math.max(0, (dist - tol) / soft), a = t * t * (3 - 2 * t); d[i + 3] = Math.round(d[i + 3] * a); }
            if (spill && dist < tol + soft * 4) { const lim = Math.max(d[i + o1], d[i + o2]); if (d[i + dom] > lim) d[i + dom] = lim; }
        }
        return d;
    }
    const keyCache = new WeakMap();
    /** l'image du moment détourée (au plus 960 px de côté, pour rester fluide) : {canvas, w, h} */
    function keyFrame(el, vw, vh, k) {
        const s = Math.min(1, 960 / Math.max(vw, vh)), w = Math.max(1, Math.round(vw * s)), h = Math.max(1, Math.round(vh * s));
        let cv = keyCache.get(el); if (!cv) { cv = document.createElement('canvas'); keyCache.set(el, cv); }
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        const g = cv.getContext('2d', {willReadFrequently: true}); g.clearRect(0, 0, w, h); g.drawImage(el, 0, 0, w, h);
        const id = g.getImageData(0, 0, w, h); keyPixels(id.data, k); g.putImageData(id, 0, 0); return {canvas: cv, w, h};
    }
    /** le réglage dans l'inspecteur d'un morceau (rng, chk : les aides de l'inspecteur du montage) */
    const keyHtml = (c, rng, chk) => { const k = c.key || {}; return `<details class="h-mt-isec h-mt-key" ${k.on ? 'open' : ''}><summary><b>🟩 Fond vert (incrustation)</b></summary>
        ${chk('key.on', 'Rendre transparente la couleur du fond (fond vert ou bleu) : ce qui est dessous se voit', k.on)}
        <label class="h-avx-row">Couleur du fond <input type="color" data-mt-k="key.color" value="${/^#[0-9a-f]{6}$/i.test(k.color || '') ? k.color : '#00ff00'}"></label>
        <div class="h-mt-quick"><button type="button" data-mt-keycol="#00ff00">Vert</button><button type="button" data-mt-keycol="#0047bb">Bleu</button></div>
        ${rng('key.tol', 'Tolérance', 0, 1, 0.01, k.tol ?? 0.3, '%')}${rng('key.soft', 'Bord adouci', 0, 1, 0.01, k.soft ?? 0.15, '%')}${chk('key.spill', 'Enlever le reflet vert sur le sujet (cheveux, bords)', k.spill !== false)}
        <p class="muted">Mets la vidéo du fond vert au-dessus (incrustation, tout l’écran), et le décor (photo d’archive, autre vidéo) dessous, sur la piste 1.</p></details>`; };
    ext.montageKey = {keyPixels, frame: keyFrame, html: keyHtml};

    /* ═════════ 🎯 Suivi d'un point : un titre ou une incrustation qui suit ce qui bouge dans la vidéo ═════════ */
    /** la place (en % de l'écran) au temps t (secondes depuis le début de l'élément) ; track : [{t, x, y}] trié */
    function trackAt(track, t) {
        if (!track?.length) return null; if (t <= track[0].t) return track[0]; const L = track.at(-1); if (t >= L.t) return L;
        let i = 1; while (track[i].t < t) i++; const a = track[i - 1], b = track[i], f = (t - a.t) / ((b.t - a.t) || 1);
        return {t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f};
    }
    /** frames : [{d (gris, W × H), W, H}] ; (x0, y0) en pixels de la 1re image → [[x, y], …] ; un carré de 2R+1 cherché à S près,
     *  par la plus petite somme des écarts (le modèle se renouvelle doucement : il suit un visage qui tourne un peu) */
    const OFFS = S => { const l = []; for (let sy = -S; sy <= S; sy++) for (let sx = -S; sx <= S; sx++) l.push([sx, sy]); return l.sort((a, b) => Math.hypot(...a) - Math.hypot(...b)); };
    function trackPoints(frames, x0, y0, {R = 8, S = 16} = {}) {
        const out = [[x0, y0]]; if (!frames.length) return out;
        const {W, H} = frames[0], tpl = new Float32Array((2 * R + 1) ** 2);
        const grab = (f, cx, cy, into) => { let k = 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = Math.max(0, Math.min(W - 1, Math.round(cx + dx))), y = Math.max(0, Math.min(H - 1, Math.round(cy + dy))); into[k++] = f.d[y * W + x]; } return into; };
        grab(frames[0], x0, y0, tpl); let x = x0, y = y0; const cur = new Float32Array(tpl.length);
        for (let i = 1; i < frames.length; i++) {
            let best = Infinity, bx = x, by = y; // à égalité, on reste sur place (pas de glissement sur une image unie)
            for (const [sx, sy] of OFFS(S)) { grab(frames[i], x + sx, y + sy, cur); let e = 0; for (let k = 0; k < tpl.length && e < best; k++) e += Math.abs(cur[k] - tpl[k]); if (e < best) { best = e; bx = x + sx; by = y + sy; } }
            x = Math.max(0, Math.min(W - 1, bx)); y = Math.max(0, Math.min(H - 1, by)); out.push([x, y]);
            grab(frames[i], x, y, cur); for (let k = 0; k < tpl.length; k++) tpl[k] = tpl[k] * 0.8 + cur[k] * 0.2;
        }
        return out;
    }
    /** dans le navigateur : la vidéo src lue de « from » à « to » (temps de la source), tous les dt ; (fx, fy) : le point (0…1 de l'image) */
    async function trackVideo(src, from, to, fx, fy, {dt = 0.1, onStep, cancelled} = {}) {
        const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous'; v.src = src;
        await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('vidéo illisible')); setTimeout(() => rej(new Error('vidéo trop longue à charger')), 20000); });
        const W = 320, H = Math.max(16, Math.round(W * (v.videoHeight || 9) / (v.videoWidth || 16))), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', {willReadFrequently: true});
        const frames = [], times = [], n = Math.max(1, Math.min(3000, Math.ceil((to - from) / dt)));
        for (let i = 0; i <= n; i++) {
            if (cancelled?.()) throw new Error('arrêté'); const t = Math.min(to, from + i * dt);
            await new Promise(res => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 3000); });
            await new Promise(res => (v.requestVideoFrameCallback && i ? (v.requestVideoFrameCallback(() => res()), setTimeout(res, 120)) : setTimeout(res, 20))); // l'image décodée, pas la précédente
            g.drawImage(v, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data, gray = new Float32Array(W * H); for (let k = 0; k < W * H; k++) gray[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
            frames.push({d: gray, W, H}); times.push(t); onStep?.(i / n * 0.8);
        }
        const pts = trackPoints(frames, fx * W, fy * H); onStep?.(1); v.removeAttribute('src');
        return pts.map(([x, y], i) => ({t: times[i], fx: x / W, fy: y / H}));
    }
    const trackHtml = c => `<details class="h-mt-isec h-mt-trk" ${c.track?.length ? 'open' : ''}><summary><b>🎯 Suivre ce qui bouge</b></summary><p class="muted">L’élément suit un point de la vidéo de la piste 1 (un visage, une voiture, un bateau) : clique « Choisir le point », puis sur ce point dans l’image.</p>
        <div class="h-mt-quick"><button type="button" data-mt-trk="pick">🎯 Choisir le point à suivre</button>${c.track?.length ? '<button type="button" data-mt-trk="off">✕ Ne plus suivre</button>' : ''}</div>${c.track?.length ? `<p class="muted">Suivi sur ${c.track.length} positions.</p>` : ''}</details>`;
    ext.montageTrack = {trackAt, trackPoints, trackVideo, html: trackHtml};

    /* ═════════ 🎥 Plusieurs caméras : synchronisées par le son, puis montées en passant de l'une à l'autre ═════════ */
    const HOP = 0.02; // une valeur d'enveloppe toutes les 20 ms
    /** l'enveloppe du son (moyenne des carrés par tranche de 20 ms), sans la moyenne : ce qui se corrèle d'une caméra à l'autre */
    function envelope(x, sr) {
        const h = Math.max(1, Math.round(sr * HOP)), n = Math.floor(x.length / h), e = new Float32Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let k = i * h; k < (i + 1) * h; k++) s += x[k] * x[k]; e[i] = Math.sqrt(s / h); }
        return e;
    }
    /** le décalage (en tranches) tel que b[t] ressemble à a[t + lag] ; corrélation normalisée, de −maxLag à +maxLag */
    function bestLag(a, b, maxLag) {
        const ma = a.reduce((s, v) => s + v, 0) / (a.length || 1), mb = b.reduce((s, v) => s + v, 0) / (b.length || 1);
        let best = -Infinity, lag = 0;
        for (let L = -maxLag; L <= maxLag; L++) {
            let s = 0, sa = 0, sb = 0, n = 0;
            for (let t = Math.max(0, -L); t < b.length && t + L < a.length; t++) { const x = a[t + L] - ma, y = b[t] - mb; s += x * y; sa += x * x; sb += y * y; n++; }
            if (n < 50) continue; const r = s / Math.sqrt((sa || 1) * (sb || 1)); if (r > best) { best = r; lag = L; }
        }
        return {lag, score: best};
    }
    /** le plan de montage : cams [{off (s : temps de la 1re = temps de celle-ci + off), dur, env}] ; mode 'loud' (la caméra où le son
     *  est le plus fort, à niveau égalisé) ou 'turn' (à tour de rôle, toutes les « every » secondes) → [{cam, a, b}] en temps de la 1re */
    function plan(cams, {mode = 'loud', every = 5, minShot = 2} = {}) {
        const start = Math.max(...cams.map(c => c.off)), end = Math.min(...cams.map(c => c.off + c.dur)); if (!(end - start > 0.5)) return [];
        if (mode === 'turn') { const out = []; for (let t = start, i = 0; t < end - 0.05; t += every, i++) out.push({cam: i % cams.length, a: t, b: Math.min(end, t + every)}); return out; }
        const med = cams.map(c => { const v = Array.from(c.env).filter(x => x > 0).sort((x, y) => x - y); return v[Math.floor(v.length / 2)] || 1e-6; });
        const W = 0.5, picks = [];
        for (let t = start; t < end - 1e-6; t += W) picks.push(cams.map((c, i) => { const k0 = Math.floor((t - c.off) / HOP), k1 = Math.floor((Math.min(end, t + W) - c.off) / HOP); let s = 0, n = 0; for (let k = Math.max(0, k0); k < Math.min(c.env.length, k1); k++) { s += c.env[k]; n++; } return n ? s / n / med[i] : 0; }).reduce((bi, v, i, arr) => (v > arr[bi] * 1.15 ? i : bi), 0));
        const out = [];
        picks.forEach((cam, i) => { const a = start + i * W, b = Math.min(end, a + W), last = out.at(-1); if (last && (last.cam === cam || b - last.a <= minShot && last.b - last.a < minShot)) last.b = b; else out.push({cam, a, b}); });
        for (let i = out.length - 1; i > 0; i--) if (out[i].b - out[i].a < minShot) { out[i - 1].b = out[i].b; out.splice(i, 1); } // pas de plan trop court
        return out.reduce((acc, x) => { const l = acc.at(-1); if (l && l.cam === x.cam) l.b = x.b; else acc.push({...x}); return acc; }, []);
    }
    async function decodeMono(src, sr = 8000) {
        const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, ab = await (await fetch(src)).arrayBuffer(), b = await new OAC(1, 1, sr).decodeAudioData(ab);
        const x = new Float32Array(b.length); for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / b.numberOfChannels; } return {x, sr: b.sampleRate};
    }
    /** la fenêtre : choisir 2 à 4 vidéos des rushes, synchroniser, monter (ajouté à la fin de la piste 1, le son d'une caméra à part) */
    function multiDialog({P, nid, done}) {
        const vids = P.sources.map((so, i) => ({so, i})).filter(x => x.so.kind === 'video');
        if (vids.length < 2) return root.LCNDA_APP.toast('Importe d’abord au moins deux vidéos de la même scène (onglet 🎞️ Rushes).', 'error');
        const e2 = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
        ext.openDialog({eyebrow: 'MONTAGE', title: '🎥 Plusieurs caméras', submitLabel: 'Synchroniser et monter', wide: true,
            body: `<p class="muted">Deux téléphones (ou plus) ont filmé la même scène — un entretien, un repas de famille. L’app les cale entre elles grâce au son, puis monte en passant de l’une à l’autre. Le résultat va à la fin de la piste 1 ; le son vient d’une seule caméra (sur une piste son).</p>
                <fieldset><legend>Les caméras (2 à 4)</legend>${vids.map((v, k) => `<label class="checkbox-line"><input type="checkbox" name="cam" value="${v.i}" ${k < 2 ? 'checked' : ''}> ${e2(v.so.title || 'Vidéo')} <small class="muted">${Math.round(v.so.dur || 0)} s</small></label>`).join('')}</fieldset>
                <div class="form-grid"><label>Passer d’une caméra à l’autre<select name="mode"><option value="loud">quand quelqu’un parle plus près d’une autre caméra</option><option value="turn">à tour de rôle</option></select></label>
                <label>Toutes les (à tour de rôle)<input name="every" type="number" min="1" max="120" value="5" data-unit="s"></label><label>Plan le plus court<input name="min" type="number" min="0.5" max="30" step="0.5" value="2" data-unit="s"></label></div>
                <p class="muted" data-mc-msg></p>`,
            onSubmit: async f => {
                const ids = [...f.querySelectorAll('[name=cam]:checked')].map(i => Number(i.value)); const msg = f.querySelector('[data-mc-msg]');
                if (ids.length < 2 || ids.length > 4) { root.LCNDA_APP.toast('Coche 2 à 4 caméras.', 'error'); return false; }
                try {
                    msg.textContent = 'Lecture des sons…'; const snd = []; for (const i of ids) snd.push(await decodeMono(P.sources[i].src));
                    const envs = snd.map(s => envelope(s.x, s.sr)), cams = [{i: ids[0], off: 0, dur: snd[0].x.length / snd[0].sr, env: envs[0]}];
                    for (let k = 1; k < ids.length; k++) { msg.textContent = `Synchronisation ${k}/${ids.length - 1}…`; await new Promise(r => setTimeout(r, 0)); const {lag, score} = bestLag(envs[0], envs[k], Math.round(Math.min(120, Math.max(cams[0].dur, snd[k].x.length / snd[k].sr)) / HOP));
                        if (score < 0.3) { root.LCNDA_APP.toast(`« ${P.sources[ids[k]].title} » ne se cale pas sur le son de la 1re : ce n’est peut-être pas la même scène.`, 'error'); return false; }
                        cams.push({i: ids[k], off: lag * HOP, dur: snd[k].x.length / snd[k].sr, env: envs[k]}); }
                    const pl = plan(cams, {mode: f.elements.mode.value, every: Number(f.elements.every.value) || 5, minShot: Number(f.elements.min.value) || 2});
                    if (!pl.length) { root.LCNDA_APP.toast('Les vidéos ne se recouvrent pas dans le temps.', 'error'); return false; }
                    const at0 = (P.v1 || []).reduce((s, c) => s + (c.to - c.from) / Math.max(0.1, Math.min(10, Number(c.speed) || 1)), 0);
                    pl.forEach(x => { const c = cams[x.cam]; P.v1.push({id: nid('v'), s: c.i, from: Math.round((x.a - c.off) * 1000) / 1000, to: Math.round((x.b - c.off) * 1000) / 1000, tr: {type: 'none', d: 1}, look: {}, vol: 1, mute: true, multicam: true}); });
                    const a = pl[0].a, b = pl.at(-1).b; P.audio.push({id: nid('a'), s: cams[0].i, from: Math.round(a * 1000) / 1000, to: Math.round(b * 1000) / 1000, at: Math.round(at0 * 1000) / 1000, vol: 1, voice: true, track: (P.tracks.find(t => t.kind === 'a') || {}).id});
                    done?.(pl.length, cams.map(c => c.off));
                } catch (err) { root.LCNDA_APP.toast(`Impossible : ${err.message}`, 'error'); return false; }
            }});
    }
    ext.montageMulti = {envelope, bestLag, plan, dialog: multiDialog, HOP};

    if (typeof module === 'object' && module.exports) module.exports = {lufs, kWeights, parse, color, scopeXY, keyPixels, trackAt, trackPoints, envelope, bestLag, plan};
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
