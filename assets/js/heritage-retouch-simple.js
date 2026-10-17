/**
 * 🎚️ Retouche simple : la retouche des photos de la version 0.5.0 (réglages, courbe, correcteur de taches, tampon,
 * versions), à côté de la retouche façon Photoshop (heritage-studio.js). On passe de l'une à l'autre par un bouton ;
 * le dernier choix est retenu (localStorage « genealogie-retouch-mode »).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = value => A().escapeHtml(value ?? '');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);

    /* ═══════════════════════ 🎚️ RETOUCHE DES PHOTOS (visionneuse → « Retoucher ») ═══════════════════════ */

    const RT_SLIDERS = [
        ['exposure', 'Exposition', -100, 100], ['brightness', 'Luminosité', -100, 100], ['contrast', 'Contraste', -100, 100],
        ['shadows', 'Ombres', -100, 100], ['highlights', 'Hautes lumières', -100, 100], ['saturation', 'Saturation', -100, 100], ['warmth', 'Chaleur', -100, 100],
    ];
    const RT_CHANNELS = [['rgb', 'RVB'], ['r', 'Rouge'], ['g', 'Vert'], ['b', 'Bleu']];
    const rtDefault = () => ({exposure: 0, brightness: 0, contrast: 0, shadows: 0, highlights: 0, saturation: 0, warmth: 0, bw: false, sepia: false, invert: false,
        curves: {rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]]}});
    const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
    /** Courbe lisse qui passe par les points sans faire de bosses (interpolation monotone de Fritsch-Carlson). */
    function curveLut(points) {
        const p = [...points].sort((a, b) => a[0] - b[0]).filter((q, i, arr) => i === 0 || q[0] !== arr[i - 1][0]);
        const lut = new Float32Array(256);
        if (p.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
        const n = p.length, d = [], m = new Array(n).fill(0);
        for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
            if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
        }
        for (let x = 0; x < 256; x++) {
            if (x <= p[0][0]) { lut[x] = p[0][1]; continue; }
            if (x >= p[n - 1][0]) { lut[x] = p[n - 1][1]; continue; }
            let k = 0; while (x > p[k + 1][0]) k++;
            const h = p[k + 1][0] - p[k][0], t = (x - p[k][0]) / h, t2 = t * t, t3 = t2 * t;
            lut[x] = (2 * t3 - 3 * t2 + 1) * p[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * p[k + 1][1] + (t3 - t2) * h * m[k + 1];
        }
        return lut;
    }
    /** Les trois tables (rouge, vert, bleu) qui donnent la valeur retouchée de chaque niveau. */
    function rtLuts(st) {
        const base = new Float32Array(256);
        const exp = Math.pow(2, st.exposure / 50), c = (259 * (st.contrast * 1.275 + 255)) / (255 * (259 - st.contrast * 1.275));
        for (let i = 0; i < 256; i++) {
            let v = st.invert ? 255 - i : i;
            v = v * exp + st.brightness * 1.2;
            v = c * (v - 128) + 128;
            if (v < 128) v += st.shadows * 0.6 * Math.pow(1 - Math.max(0, v) / 128, 2);
            else v += st.highlights * 0.6 * Math.pow((Math.min(255, v) - 128) / 127, 2);
            base[i] = clamp255(v);
        }
        const master = curveLut(st.curves.rgb);
        return ['r', 'g', 'b'].map(ch => { const own = curveLut(st.curves[ch]), lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = own[Math.round(clamp255(master[Math.round(base[i])]))]; return lut; });
    }
    function rtApply(src, dst, st) {
        const [lr, lg, lb] = rtLuts(st), sat = 1 + st.saturation / 100, warm = st.warmth * 0.35;
        const a = src.data, o = dst.data, plain = sat === 1 && !warm && !st.bw && !st.sepia;
        for (let i = 0; i < a.length; i += 4) {
            let r = lr[a[i]], g = lg[a[i + 1]], b = lb[a[i + 2]];
            if (!plain) {
                if (sat !== 1) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
                if (warm) { r += warm; b -= warm; }
                if (st.bw || st.sepia) { const y = 0.299 * r + 0.587 * g + 0.114 * b; if (st.sepia) { r = y * 1.07 + 18; g = y * 0.92 + 8; b = y * 0.72; } else { r = g = b = y; } }
            }
            o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = a[i + 3];
        }
        return dst;
    }
    /** Réglage automatique : les 0,5 % les plus sombres deviennent noirs, les 0,5 % les plus clairs deviennent blancs. */
    function rtAuto(img, st) {
        const hist = new Array(256).fill(0); let n = 0;
        for (let i = 0; i < img.data.length; i += 16) { hist[Math.round(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2])]++; n++; }
        let lo = 0, hi = 255, acc = 0;
        while (lo < 254 && (acc += hist[lo]) < n * 0.005) lo++;
        acc = 0; while (hi > lo + 1 && (acc += hist[hi]) < n * 0.005) hi--;
        Object.assign(st, rtDefault(), {bw: st.bw, sepia: st.sepia, invert: st.invert, strokes: st.strokes || []});
        if (hi - lo < 8) return; // image presque d'une seule teinte : rien à étirer
        st.curves.rgb = [[lo, 0], [Math.round((lo + hi) / 2), 128], [hi, 255]];
    }
    const RT_PRESETS = [
        ['Auto', st => st._auto = true],
        ['Vieille photo ravivée', st => Object.assign(st, {contrast: 22, shadows: 18, highlights: -12, saturation: 18, warmth: -8, curves: {...rtDefault().curves, rgb: [[0, 0], [70, 58], [190, 205], [255, 255]]}})],
        ['Document lisible', st => Object.assign(st, {bw: true, contrast: 45, brightness: 12, curves: {...rtDefault().curves, rgb: [[0, 0], [90, 40], [200, 245], [255, 255]]}})],
        ['Sépia doux', st => Object.assign(st, {sepia: true, contrast: 10, shadows: 10})],
        ['Négatif → positif', st => Object.assign(st, {invert: true, contrast: 15})],
    ];
    const mediaSrc = m => `media/${encodeURIComponent(m.filename)}?v=${m._cacheBust || ''}`;

    /* ── Correcteur de taches et tampon de duplication ──
       Chaque coup est noté en coordonnées relatives (0 à 1) : on le rejoue sur l'aperçu puis, à l'enregistrement, sur l'image en pleine taille. */
    /** Copie un disque de (sx,sy) vers (cx,cy), bord adouci ; `offset` corrige la teinte (correcteur). Lit dans `from`, écrit dans `data`. */
    function rtDab(data, from, W, H, cx, cy, sx, sy, r, offset = null, hard = 0.55) {
        const r2 = r * r, x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
        const dx = Math.round(sx - cx), dy = Math.round(sy - cy);
        for (let y = y0; y <= y1; y++) {
            const syy = y + dy; if (syy < 0 || syy >= H) continue;
            for (let x = x0; x <= x1; x++) {
                const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (d2 > r2) continue;
                const sxx = x + dx; if (sxx < 0 || sxx >= W) continue;
                const t = Math.sqrt(d2) / r, a = t <= hard ? 1 : 1 - (t - hard) / (1 - hard), w = a * a * (3 - 2 * a);
                const i = (y * W + x) * 4, j = (syy * W + sxx) * 4;
                for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - w) + (from[j + c] + (offset ? offset[c] : 0)) * w;
            }
        }
    }
    /** Pour une tache en (cx,cy) : la zone voisine dont le pourtour ressemble le plus au pourtour de la tache, et l'écart de teinte à corriger. */
    function rtHealSource(from, W, H, cx, cy, r) {
        const ring = []; for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; for (const f of [1.15, 1.45]) ring.push([Math.cos(a) * r * f, Math.sin(a) * r * f]); }
        const px = (x, y) => { x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y))); return (y * W + x) * 4; };
        let best = null;
        for (const dist of [2.4, 3.2, 4.4]) for (let k = 0; k < 16; k++) {
            const a = k / 16 * Math.PI * 2, sx = cx + Math.cos(a) * r * dist, sy = cy + Math.sin(a) * r * dist;
            if (sx - r < 0 || sy - r < 0 || sx + r >= W || sy + r >= H) continue;
            let ssd = 0; for (const [ox, oy] of ring) { const i = px(cx + ox, cy + oy), j = px(sx + ox, sy + oy); for (let c = 0; c < 3; c++) { const d = from[i + c] - from[j + c]; ssd += d * d; } }
            if (!best || ssd < best.ssd) best = {sx, sy, ssd};
        }
        if (!best) return null;
        const off = [0, 0, 0]; for (const [ox, oy] of ring) { const i = px(cx + ox, cy + oy), j = px(best.sx + ox, best.sy + oy); for (let c = 0; c < 3; c++) off[c] += from[i + c] - from[j + c]; }
        return {sx: best.sx, sy: best.sy, offset: off.map(v => v / ring.length)};
    }
    /** Rejoue les coups (groupes d'un même geste) sur une image : correcteur et tampon. */
    function rtReplayStrokes(img, strokes) {
        const W = img.width, H = img.height, data = img.data;
        for (const g of strokes) {
            const from = new Uint8ClampedArray(data); // chaque geste copie depuis l'état d'avant lui (pas de trainée qui se recopie)
            for (const d of g.dabs) {
                const cx = d.x * W, cy = d.y * H, r = Math.max(1, d.r * W);
                if (g.tool === 'heal') { const h = rtHealSource(from, W, H, cx, cy, r); if (h) rtDab(data, from, W, H, cx, cy, h.sx, h.sy, r, h.offset, 0.35); }
                else rtDab(data, from, W, H, cx, cy, cx + d.ox * W, cy + d.oy * H, r);
            }
        }
        return img;
    }
    /** Retouche d'une photo : on part de la version affichée (ou d'une autre, `source`), le résultat devient une nouvelle version. */
    async function openRetouchSimple(source = '') {
        const st0 = A().state, item = st0.lightboxMedia?.[st0.lightboxIndex];
        if (!item) return;
        let versions = [];
        try { versions = (await api('media_versions', {id: item.id})).versions || []; } catch (_) {}
        const from = source || item.filename;
        const img = new Image(); img.decoding = 'async';
        img.src = `media/${encodeURIComponent(from)}?v=${item._cacheBust || ''}`;
        try { await img.decode(); } catch (_) { return toast('Impossible d’ouvrir cette image.', 'error'); }
        const st = rtDefault(); let channel = 'rgb';
        const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
        const pw = Math.max(1, Math.round(img.naturalWidth * scale)), ph = Math.max(1, Math.round(img.naturalHeight * scale));
        const work = document.createElement('canvas'); work.width = pw; work.height = ph;
        const wctx = work.getContext('2d', {willReadFrequently: true}); wctx.drawImage(img, 0, 0, pw, ph);
        const srcData = wctx.getImageData(0, 0, pw, ph);
        const hist = new Array(256).fill(0); for (let i = 0; i < srcData.data.length; i += 4) hist[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++;
        const hmax = Math.max(...hist.slice(2, 254), 1);
        const histPath = 'M0,256 ' + hist.map((h, x) => `L${x},${256 - Math.min(256, h / hmax * 230)}`).join(' ') + ' L255,256 Z';
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-retouch-simple';
        dlg.innerHTML = `<div class="h-rs-head"><div><span class="eyebrow">RETOUCHE</span><h2>${esc(item.title || item.filename || 'Photo')}</h2></div><span class="h-rs-headbtns"><button type="button" class="button small secondary" data-rs-advanced title="La retouche complète : calques, sélections, masques, texte, formes, filtres, projets">🎛️ Retouche complète</button><button type="button" class="icon-button" data-rs-close aria-label="Fermer">×</button></span></div>
            <div class="h-rs-paint"><span class="h-rs-modes">${[['adjust', '🎚 Réglages'], ['heal', '🩹 Correcteur de taches'], ['clone', '🧬 Tampon de duplication']].map(([k, l]) => `<button type="button" class="button small ${k === 'adjust' ? '' : 'secondary'}" data-rs-mode="${k}">${l}</button>`).join('')}</span>
                <label class="h-rs-size" hidden>Taille <input type="range" min="3" max="120" value="18" data-rs-size> <output data-rs-size-out>18</output></label>
                <button type="button" class="button small secondary" data-rs-undo disabled>↶ Annuler la dernière correction</button>
                <span class="h-rs-zoom" title="Zoom"><span class="muted">🔍</span><button type="button" class="button small secondary" data-rs-zoom="out" title="Dézoomer (⌘/Ctrl + molette)">−</button><button type="button" class="button small secondary" data-rs-zoom="fit" title="Toute l’image (clic : 100 %)" data-rs-zoom-label>Ajusté</button><button type="button" class="button small secondary" data-rs-zoom="in" title="Zoomer (⌘/Ctrl + molette)">+</button></span>
                <small class="muted" data-rs-paint-help></small></div>
            <div class="h-rs-body"><div class="h-rs-stage"><canvas data-rs-canvas width="${pw}" height="${ph}"></canvas><span class="h-rs-brush" data-rs-brush hidden></span><span class="h-rs-src" data-rs-src hidden></span><button type="button" class="button small secondary h-rs-before" data-rs-before title="Garder appuyé pour voir l’original">👁 Avant / après</button></div>
            <div class="h-rs-tools"><div class="h-rs-presets">${RT_PRESETS.map(([l], i) => `<button type="button" class="button small secondary" data-rs-preset="${i}">${esc(l)}</button>`).join('')}</div>
                ${RT_SLIDERS.map(([k, l, mn, mx]) => `<label class="h-rs-slider"><span>${esc(l)} <output data-rs-out="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rs="${k}"></label>`).join('')}
                <div class="h-rs-toggles"><label class="checkbox-line"><input type="checkbox" data-rs-t="bw"> Noir et blanc</label><label class="checkbox-line"><input type="checkbox" data-rs-t="sepia"> Sépia</label><label class="checkbox-line"><input type="checkbox" data-rs-t="invert"> Négatif</label></div>
                <div class="h-rs-curve-head"><strong>Courbe</strong><span>${RT_CHANNELS.map(([k, l]) => `<button type="button" class="h-rs-ch ${k === 'rgb' ? 'is-active' : ''}" data-rs-ch="${k}">${l}</button>`).join('')}</span></div>
                <svg class="h-rs-curve" viewBox="-6 -6 268 268" data-rs-curve><path class="h-rs-hist" d="${histPath}"/><g class="h-rs-grid">${[64, 128, 192].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="256"/><line x1="0" y1="${v}" x2="256" y2="${v}"/>`).join('')}<line x1="0" y1="256" x2="256" y2="0" class="h-rs-diag"/></g><path class="h-rs-line" data-rs-line/><g data-rs-points></g></svg>
                <div class="h-rs-curve-tools"><button type="button" class="button small secondary" data-rs-ptdel disabled>Enlever le point</button></div>
                <p class="muted h-rs-help">Clic sur la courbe : ajouter un point · glisser : le déplacer · pour l’enlever : le choisir puis « Enlever le point » (ou la touche ⌫), ou le glisser hors du cadre. Monter la courbe éclaircit, la creuser assombrit, un « S » donne du contraste.</p>
                <button type="button" class="link-button" data-rs-reset>Tout remettre à zéro</button></div></div>
            <section class="h-rs-versions" data-rs-versions></section>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-rs-close>Annuler</button><button type="button" class="button secondary" data-rs-save="copy" title="Un autre média, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-rs-save="keep" title="Gardée dans les versions, la photo affichée ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-rs-save="show">Enregistrer et afficher cette version</button></div>
            <p class="muted h-rs-note">L’original n’est jamais modifié : chaque retouche est une version de la photo, et tu choisis celle qui s’affiche partout.</p>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelectorAll('[data-rs-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
        dlg.querySelector('[data-rs-advanced]').addEventListener('click', () => {
            if (st.strokes.length && !confirm('Passer à la retouche avancée ? Les corrections en cours seront perdues.')) return;
            try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {}
            dlg.close(); ext.openRetouch?.(source, null, {advanced: true});
        });
        const canvas = dlg.querySelector('[data-rs-canvas]'), ctx = canvas.getContext('2d'), out = ctx.createImageData(pw, ph);
        let raf = 0, showBefore = false, selPt = -1, outside = -1;
        const baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); // l'image d'origine (avant / après, annuler)
        const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (showBefore) ctx.putImageData(baseData, 0, 0); else ctx.putImageData(rtApply(srcData, out, st), 0, 0); }); };
        // ── Correcteur de taches et tampon ──
        st.strokes = [];
        let mode = 'adjust', brush = 18, cloneOff = null, painting = null;
        const brushEl = dlg.querySelector('[data-rs-brush]'), srcEl = dlg.querySelector('[data-rs-src]'), help = dlg.querySelector('[data-rs-paint-help]'), undoBtn = dlg.querySelector('[data-rs-undo]');
        const HELP = {adjust: '', heal: 'Clique sur une tache, une poussière ou une rayure : elle est remplacée par ce qui l’entoure. Pour une rayure, glisse le long.', clone: 'Alt + clic (⌥ + clic sur Mac) pour choisir l’endroit à recopier, puis peins sur la zone à couvrir.'};
        // l'image est centrée dans le cadre (marges sur les côtés ou en haut et en bas) : on en tient compte
        const fit = () => { const r = canvas.getBoundingClientRect(), k = Math.min(r.width / pw, r.height / ph); return {r, k, ox: r.left + (r.width - pw * k) / 2, oy: r.top + (r.height - ph * k) / 2}; };
        const toCanvas = e => { const f = fit(); return [(e.clientX - f.ox) / f.k, (e.clientY - f.oy) / f.k, f]; };
        const setMode = m => {
            mode = m; cloneOff = m === 'clone' ? cloneOff : null;
            dlg.querySelectorAll('[data-rs-mode]').forEach(b => b.classList.toggle('secondary', b.dataset.rsMode !== m));
            dlg.querySelector('.h-rs-size').hidden = m === 'adjust'; help.textContent = HELP[m];
            canvas.classList.toggle('is-painting', m !== 'adjust'); brushEl.hidden = true; srcEl.hidden = true;
        };
        dlg.querySelectorAll('[data-rs-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.rsMode)));
        dlg.querySelector('[data-rs-size]').addEventListener('input', e => { brush = Number(e.target.value); dlg.querySelector('[data-rs-size-out]').textContent = brush; });
        const showBrush = e => {
            if (mode === 'adjust') { brushEl.hidden = true; return; }
            const [x, y, f] = toCanvas(e), k = f.k, stage = canvas.parentElement.getBoundingClientRect();
            Object.assign(brushEl.style, {width: brush * 2 * k + 'px', height: brush * 2 * k + 'px', left: (f.ox - stage.left + x * k - brush * k) + 'px', top: (f.oy - stage.top + y * k - brush * k) + 'px'}); brushEl.hidden = false;
            if (mode === 'clone' && cloneOff) { Object.assign(srcEl.style, {left: (f.ox - stage.left + (x + cloneOff[0]) * k) + 'px', top: (f.oy - stage.top + (y + cloneOff[1]) * k) + 'px'}); srcEl.hidden = false; }
        };
        const dabAt = (x, y) => {
            const g = painting, d = g.dabs, last = d[d.length - 1];
            if (last && Math.hypot(x - last.x * pw, y - last.y * ph) < Math.max(1, brush / 4)) return;
            const rec = {x: x / pw, y: y / ph, r: brush / pw};
            if (g.tool === 'heal') { const h = rtHealSource(g.from, pw, ph, x, y, brush); if (!h) return; rtDab(srcData.data, g.from, pw, ph, x, y, h.sx, h.sy, brush, h.offset, 0.35); }
            else { rec.ox = cloneOff[0] / pw; rec.oy = cloneOff[1] / ph; rtDab(srcData.data, g.from, pw, ph, x, y, x + cloneOff[0], y + cloneOff[1], brush); }
            d.push(rec); draw();
        };
        canvas.addEventListener('pointerdown', e => {
            if (mode === 'adjust') return;
            e.preventDefault();
            const [x, y] = toCanvas(e);
            if (mode === 'clone') {
                // Alt + clic : l'endroit à recopier ; le clic suivant fixe le décalage, gardé ensuite comme dans Photoshop
                if (e.altKey) { cloneOff = null; painting = null; canvas.dataset.cloneFrom = JSON.stringify([x, y]); toast('Endroit à recopier choisi : peins maintenant sur la zone à couvrir.'); return; }
                if (canvas.dataset.cloneFrom) { const [fx, fy] = JSON.parse(canvas.dataset.cloneFrom); cloneOff = [fx - x, fy - y]; delete canvas.dataset.cloneFrom; }
                if (!cloneOff) { toast('Choisis d’abord l’endroit à recopier : Alt + clic (⌥ + clic sur Mac).', 'error'); return; }
            }
            painting = {tool: mode, dabs: [], from: new Uint8ClampedArray(srcData.data)};
            canvas.setPointerCapture(e.pointerId); dabAt(x, y);
        });
        canvas.addEventListener('pointermove', e => { showBrush(e); if (painting) { const [x, y] = toCanvas(e); dabAt(x, y); } });
        canvas.addEventListener('pointerleave', () => { brushEl.hidden = true; srcEl.hidden = true; });
        const endPaint = () => { if (!painting) return; if (painting.dabs.length) { st.strokes.push({tool: painting.tool, dabs: painting.dabs}); undoBtn.disabled = false; } painting = null; };
        canvas.addEventListener('pointerup', endPaint); canvas.addEventListener('pointercancel', endPaint);
        undoBtn.addEventListener('click', () => {
            st.strokes.pop(); srcData.data.set(baseData.data); rtReplayStrokes(srcData, st.strokes); undoBtn.disabled = !st.strokes.length; draw();
        });
        const svg = dlg.querySelector('[data-rs-curve]');
        const drawCurve = () => {
            const lut = curveLut(st.curves[channel]);
            dlg.querySelector('[data-rs-line]').setAttribute('d', 'M' + Array.from(lut, (v, x) => `${x},${256 - v}`).join(' L'));
            dlg.querySelector('[data-rs-line]').dataset.ch = channel;
            const pts = st.curves[channel];
            if (selPt >= pts.length) selPt = -1;
            dlg.querySelector('[data-rs-points]').innerHTML = pts.map(([x, y], i) => `<circle cx="${x}" cy="${256 - y}" r="${i === selPt ? 7 : 5.5}" data-rs-pt="${i}" class="${i === selPt ? 'is-sel' : ''}${i === outside ? ' is-out' : ''}"/>`).join('');
            const del = dlg.querySelector('[data-rs-ptdel]'); if (del) del.disabled = !(selPt >= 0 && pts.length > 2);
        };
        const syncControls = () => {
            RT_SLIDERS.forEach(([k]) => { dlg.querySelector(`[data-rs="${k}"]`).value = st[k]; dlg.querySelector(`[data-rs-out="${k}"]`).textContent = st[k] > 0 ? '+' + st[k] : st[k]; });
            ['bw', 'sepia', 'invert'].forEach(k => { dlg.querySelector(`[data-rs-t="${k}"]`).checked = !!st[k]; });
            drawCurve(); draw();
        };
        dlg.addEventListener('input', e => { const k = e.target.dataset.rs; if (k) { st[k] = Number(e.target.value); manualEdit(); dlg.querySelector(`[data-rs-out="${k}"]`).textContent = st[k] > 0 ? '+' + st[k] : st[k]; draw(); } });
        dlg.addEventListener('change', e => { const k = e.target.dataset.rsT; if (k) { st[k] = e.target.checked; manualEdit(); if (k === 'bw' && st.bw) st.sepia = false; if (k === 'sepia' && st.sepia) st.bw = false; syncControls(); } });
        dlg.querySelectorAll('[data-rs-ch]').forEach(b => b.addEventListener('click', () => { channel = b.dataset.rsCh; selPt = -1; dlg.querySelectorAll('[data-rs-ch]').forEach(x => x.classList.toggle('is-active', x === b)); drawCurve(); }));
        // un préréglage cliqué une 2e fois : retour à l'état d'avant (ex. « Négatif → positif » puis à nouveau → le négatif d'origine)
        let activePreset = -1, beforePreset = null;
        const markPreset = () => dlg.querySelectorAll('[data-rs-preset]').forEach(x => { const on = Number(x.dataset.rsPreset) === activePreset; x.classList.toggle('secondary', !on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); x.title = on ? 'Cliquer à nouveau pour revenir à l’état d’avant' : ''; });
        const manualEdit = () => { if (activePreset >= 0) { activePreset = -1; markPreset(); } }; // un curseur touché à la main : le préréglage n'est plus « actif » (un 2e clic le réappliquera)
        dlg.querySelectorAll('[data-rs-preset]').forEach(b => b.addEventListener('click', () => {
            const i = Number(b.dataset.rsPreset);
            if (activePreset === i && beforePreset) { Object.assign(st, JSON.parse(beforePreset), {strokes: st.strokes}); activePreset = -1; markPreset(); syncControls(); return; }
            if (activePreset < 0) beforePreset = JSON.stringify({...st, strokes: undefined});
            const keep = {bw: false, sepia: false, invert: false, strokes: st.strokes}; Object.assign(st, rtDefault(), keep); RT_PRESETS[i][1](st); if (st._auto) { delete st._auto; rtAuto(srcData, st); }
            activePreset = i; markPreset(); syncControls(); }));
        // zoom : « Ajusté » (toute l'image) ou un facteur ; ⌘/Ctrl + molette ; l'aperçu défile quand il dépasse
        let zoom = 0; const stage = canvas.parentElement, zLabel = dlg.querySelector('[data-rs-zoom-label]');
        const fitK = () => { const r = stage.getBoundingClientRect(); return Math.min(1, (r.width - 4) / pw, (r.height - 4) / ph) || 1; };
        const setZoom = z => { zoom = z ? Math.max(.1, Math.min(8, z)) : 0; stage.classList.toggle('is-zoomed', !!zoom); canvas.style.width = zoom ? `${Math.round(pw * zoom)}px` : ''; canvas.style.height = zoom ? `${Math.round(ph * zoom)}px` : ''; zLabel.textContent = zoom ? `${Math.round(zoom * 100 / scale)} %` : 'Ajusté'; };
        dlg.querySelectorAll('[data-rs-zoom]').forEach(b => b.addEventListener('click', () => { const z = zoom || fitK(), k = b.dataset.rsZoom; setZoom(k === 'in' ? z * 1.25 : k === 'out' ? (z / 1.25 <= fitK() ? 0 : z / 1.25) : (zoom ? 0 : scale)); }));
        stage.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const z = zoom || fitK(); setZoom(e.deltaY < 0 ? z * 1.12 : (z / 1.12 <= fitK() ? 0 : z / 1.12)); }, {passive: false});
        dlg.querySelector('[data-rs-reset]').addEventListener('click', () => { Object.assign(st, rtDefault(), {strokes: st.strokes}); activePreset = -1; markPreset(); syncControls(); }); // les corrections de taches ont leur propre « Annuler »
        const before = dlg.querySelector('[data-rs-before]');
        const setBefore = v => { showBefore = v; before.classList.toggle('is-active', v); draw(); };
        before.addEventListener('pointerdown', () => setBefore(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => before.addEventListener(t, () => showBefore && setBefore(false)));
        // Courbe : ajouter, déplacer, enlever des points
        const rawPoint = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 268 - 6, 256 - ((e.clientY - r.top) / r.height * 268 - 6)]; };
        const svgPoint = e => rawPoint(e).map(v => Math.round(clamp255(v)));
        const removePoint = i => { const pts = st.curves[channel]; if (i < 0 || pts.length <= 2) return; pts.splice(i, 1); selPt = -1; drawCurve(); draw(); };
        let dragging = -1;
        svg.setAttribute('tabindex', '0');
        svg.addEventListener('pointerdown', e => {
            const pts = st.curves[channel], hit = e.target.closest('[data-rs-pt]');
            if (hit) dragging = Number(hit.dataset.rsPt);
            else { const [x, y] = svgPoint(e); if (pts.some(p => Math.abs(p[0] - x) < 6)) return; pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); dragging = pts.findIndex(p => p[0] === x); }
            selPt = dragging; outside = -1; svg.focus(); svg.setPointerCapture(e.pointerId); drawCurve(); draw();
        });
        svg.addEventListener('pointermove', e => {
            if (dragging < 0) return;
            const pts = st.curves[channel], [rx, ry] = rawPoint(e), [x, y] = svgPoint(e);
            // Glissé bien hors du cadre : le point sera enlevé au lâcher (il devient gris)
            outside = pts.length > 2 && (rx < -30 || rx > 286 || ry < -30 || ry > 286) ? dragging : -1;
            const lo = dragging > 0 ? pts[dragging - 1][0] + 1 : 0, hi = dragging < pts.length - 1 ? pts[dragging + 1][0] - 1 : 255;
            if (outside < 0) pts[dragging] = [Math.min(hi, Math.max(lo, x)), y];
            drawCurve(); draw();
        });
        const release = () => { if (dragging >= 0 && outside === dragging) { outside = -1; removePoint(dragging); } dragging = -1; outside = -1; drawCurve(); };
        svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
        // ⌫ / Suppr enlève le point choisi (écouté sur toute la page : un clic sur la courbe ne lui donne pas le clavier)
        const onKey = e => { if (dlg.open && (e.key === 'Delete' || e.key === 'Backspace') && selPt >= 0 && !e.target.closest?.('input, textarea, select, [contenteditable]')) { e.preventDefault(); removePoint(selPt); } };
        document.addEventListener('keydown', onKey); dlg.addEventListener('close', () => document.removeEventListener('keydown', onKey));
        svg.addEventListener('contextmenu', e => { const hit = e.target.closest('[data-rs-pt]'); if (hit) { e.preventDefault(); removePoint(Number(hit.dataset.rsPt)); } });
        dlg.querySelector('[data-rs-ptdel]').addEventListener('click', () => removePoint(selPt));
        // Tout ce qui montrait l'ancien fichier (fiche, liste des médias…) est redessiné
        const refreshAfter = async () => {
            const state = A().state;
            try {
                if (state.module === 'listes') await A().renderList();
                else if (state.currentPersonId && state.module === 'personnes') await A().selectPerson(state.currentPersonId, false);
                else ext.refreshView?.();
            } catch (_) {}
        };
        // Les versions : l'original, puis les retouches ; on choisit celle qui s'affiche par défaut
        const applyShown = file => { if (file && file !== item.filename) { item.filename = item.thumbnail = file; item._cacheBust = Date.now(); A().renderLightboxItem?.(); refreshAfter(); } };
        const drawVersions = () => {
            const box = dlg.querySelector('[data-rs-versions]');
            box.innerHTML = `<h3>Versions de la photo</h3><div class="h-rs-vlist">${versions.map(v => `<figure class="${v.shown ? 'is-shown' : ''} ${v.filename === from ? 'is-source' : ''}"><img src="media/${encodeURIComponent(v.filename)}" alt="" loading="lazy"><figcaption><strong>${esc(v.label)}</strong>${v.shown ? '<span class="h-rs-badge">affichée</span>' : (v.id ? `<button type="button" class="link-button" data-rs-vshow="${v.id}">Afficher par défaut</button>` : '')}
                ${v.filename !== from ? `<button type="button" class="link-button" data-rs-vfrom="${esc(v.filename)}">Retoucher celle-ci</button>` : '<small>en cours de retouche</small>'}${!v.is_original && v.id ? `<button type="button" class="link-button danger" data-rs-vdel="${v.id}">Supprimer</button>` : ''}</figcaption></figure>`).join('')}</div>`;
            box.querySelectorAll('[data-rs-vshow]').forEach(b => b.addEventListener('click', async () => {
                try { const r = await api('retouch_show_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rsVshow}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version affichée par défaut changée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rs-vdel]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm('Supprimer cette version retouchée ? L’original et les autres versions restent.')) return;
                try { const r = await api('retouch_delete_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rsVdel}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version supprimée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rs-vfrom]').forEach(b => b.addEventListener('click', () => { dlg.close(); openRetouchSimple(b.dataset.rsVfrom); }));
        };
        drawVersions();
        dlg.querySelectorAll('[data-rs-save]').forEach(b => b.addEventListener('click', async () => {
            const mode = b.dataset.rsSave, label0 = b.textContent;
            const mpx = img.naturalWidth * img.naturalHeight / 1e6;
            if (mpx > 60 && !confirm(`Cette image est très grande (${Math.round(mpx)} millions de points) : l’enregistrement peut être long, voire échouer. Continuer ?`)) return;
            dlg.querySelectorAll('.modal-actions button').forEach(x => { x.disabled = true; });
            b.textContent = 'Enregistrement…';
            try {
                // L'image en pleine taille, retouchée avec les mêmes réglages que l'aperçu
                const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
                const fctx = full.getContext('2d', {willReadFrequently: true}); fctx.drawImage(img, 0, 0);
                const data = fctx.getImageData(0, 0, full.width, full.height);
                if (st.strokes.length) rtReplayStrokes(data, st.strokes); // taches et tampon, rejoués en pleine taille
                fctx.putImageData(rtApply(data, data, st), 0, 0);
                const ext0 = String(from || '').split('.').pop().toLowerCase();
                const type = ext0 === 'png' ? 'image/png' : ext0 === 'webp' ? 'image/webp' : ext0 === 'gif' ? 'image/png' : 'image/jpeg';
                const blob = await new Promise(res => full.toBlob(res, type, 0.93));
                if (!blob) throw new Error('Image trop grande pour être enregistrée par le navigateur.');
                const fd = new FormData(); fd.append('file', blob, 'retouche.' + (type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1])); fd.append('media_id', item.id); fd.append('mode', mode === 'copy' ? 'copy' : 'version'); fd.append('show', mode === 'show' ? '1' : '0'); fd.append('csrf', A().state.csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                if (mode === 'copy') { toast('Copie retouchée ajoutée aux mêmes fiches.'); dlg.close(); refreshAfter(); return; }
                if (mode === 'show') { applyShown(j.result.filename); toast('Nouvelle version affichée. L’original est gardé dans les versions.'); dlg.close(); return; }
                versions = j.result.versions; toast('Version enregistrée (non affichée).'); dlg.close();
            } catch (error) {
                toast(error.message, 'error');
                dlg.querySelectorAll('.modal-actions button').forEach(x => { x.disabled = false; });
                b.textContent = label0;
            }
        }));
        dlg.showModal();
        syncControls();
    }

    ext.openRetouchSimple = openRetouchSimple;
})();
