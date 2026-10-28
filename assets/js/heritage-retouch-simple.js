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
        const img0 = new Image(); img0.decoding = 'async';
        img0.src = `media/${encodeURIComponent(from)}?v=${item._cacheBust || ''}`;
        try { await img0.decode(); } catch (_) { return toast('Impossible d’ouvrir cette image.', 'error'); }
        let img = img0; // ↺ ↻ : l'image de départ tournée (st.docXf, même moteur que la retouche complète : heritage-retouch-rotation.js)
        const st = rtDefault(); let channel = 'rgb';
        const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
        let pw = Math.max(1, Math.round(img.naturalWidth * scale)), ph = Math.max(1, Math.round(img.naturalHeight * scale));
        const work = document.createElement('canvas'); work.width = pw; work.height = ph;
        const wctx = work.getContext('2d', {willReadFrequently: true}); wctx.drawImage(img, 0, 0, pw, ph);
        let srcData = wctx.getImageData(0, 0, pw, ph);
        const hist = new Array(256).fill(0); for (let i = 0; i < srcData.data.length; i += 4) hist[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++;
        const hmax = Math.max(...hist.slice(2, 254), 1);
        const histPath = 'M0,256 ' + hist.map((h, x) => `L${x},${256 - Math.min(256, h / hmax * 230)}`).join(' ') + ' L255,256 Z';
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-retouch-simple';
        const UI = window.LCNDA_UI, sec = (title, key, body, open = true) => UI?.panelSection ? UI.panelSection({title, key, open, body}) : `<details ${open ? 'open' : ''}><summary>${esc(title)}</summary>${body}</details>`;
        // E1 : icône · nom · ↶ ↷ · … · ✓ Enregistré · ⚙️ Personnaliser · ⤓ Exporter ▾ · 💾 Enregistrer · ⛶ · ×
        dlg.innerHTML = `<div class="h-rs-head h-rt-topbar"><span class="ui-topbar-icon" aria-hidden="true">🎚️</span><input class="ui-topbar-name" data-rs-name value="${esc(item.title || item.filename || 'Photo')}" maxlength="200" aria-label="Nom de la photo retouchée" title="Le nom de la copie et des fichiers exportés">
                <nav class="h-rs-menus" data-rs-menus data-tb="rs-menus" data-tb-label="Menus du haut"></nav><span class="ui-topbar-hist"><button type="button" class="icon-button small" data-rs-undo disabled title="Annuler (⌘Z)" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-rs-redo disabled title="Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z">↷</button></span>
                <button type="button" class="button small secondary" data-rs-advanced title="La retouche complète : calques, sélections, masques, texte, formes, filtres, projets">🎛️ Retouche complète</button><button type="button" class="button small secondary" data-rs-restoreall title="Débruitage, poussières, plis, contraste, netteté et colorisation d’un coup (dans la retouche complète)">✨ Restaurer en une fois</button>
                <span class="spacer"></span><span class="ui-status" data-ui-status data-rs-status></span>${ext.tbButton ? ext.tbButton('retouch-simple') : ''}
                <details class="h-rt-menu h-rt-exportmenu"><summary title="Exporter : la photo retouchée (PNG, JPG, imprimer) ou l’avant / après">⤓ Exporter ▾</summary><div class="h-rt-menulist"><button type="button" data-rs-export="image"><span>🖼 La photo retouchée (PNG, JPG, imprimer)…</span></button><button type="button" data-rs-export="ba"><span>◧ Avant / après (côte à côte ou rideau)…</span></button></div></details>
                <button type="button" class="button small" data-rs-topsave data-ui-cmd="save" data-shortcut="⌘S" title="Enregistrer et afficher cette version de la photo (l’original est gardé)">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('retouch-simple') : ''}<button type="button" class="icon-button" data-rs-close aria-label="Fermer" title="Fermer">×</button></div>
            <div class="h-rs-paint" data-tbg="rs-paint" data-tbg-label="Barre des outils">
                <label class="h-rs-size" hidden>Taille <input type="range" min="3" max="120" value="18" data-rs-size> <output data-rs-size-out>18</output></label>
                </div>
            <div class="h-rs-body"><nav class="h-rs-rail" data-tbg="rs-modes" data-tbg-label="Colonne d’outils">${[['adjust', '🎚', 'Réglages : couleur, lumière, courbe', 'A'], ['heal', '🩹', 'Correcteur de taches : clique sur une tache, une poussière, une rayure', 'J'], ['clone', '🧬', `Tampon de duplication : ${/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⌥' : 'Alt'} + clic sur l’endroit à recopier, puis peins sur la zone à couvrir`, 'S']].map(([k, i, l, sc]) => `<button type="button" class="${k === 'adjust' ? 'is-active' : ''}" data-rs-mode="${k}" title="${esc(l)}" aria-label="${esc(l.split(' :')[0])}" data-shortcut="${sc}">${i}</button>`).join('')}<button type="button" data-rs-rot="ccw" title="Faire pivoter de 90° vers la gauche (antihoraire)" aria-label="Pivoter à gauche">↺</button><button type="button" data-rs-rot="cw" title="Faire pivoter de 90° vers la droite (horaire)" aria-label="Pivoter à droite">↻</button><button type="button" data-rs-railcmd="advanced" title="Retouche complète : calques, sélections, masques, texte, filtres" aria-label="Retouche complète">🎛️</button></nav><div class="h-rs-stage"><canvas data-rs-canvas width="${pw}" height="${ph}"></canvas><span class="h-rs-brush" data-rs-brush hidden></span><span class="h-rs-src" data-rs-src hidden></span>${ext.rtBaButtons ? ext.rtBaButtons('rs') : '<button type="button" class="button small secondary h-rs-before" data-rs-before title="Garder appuyé pour voir l’original">👁 Avant / après</button>'}</div>
            <div class="h-rs-tools" data-tbg="rs-tools" data-tbg-label="Panneau de droite"><div class="h-rs-presets" data-tb-label="Préréglages">${RT_PRESETS.map(([l], i) => `<button type="button" class="button small secondary" data-rs-preset="${i}"${i === 0 ? ' data-help="Auto : les points les plus sombres deviennent noirs et les plus clairs blancs ; cliquer une 2ᵉ fois revient à l’état d’avant."' : ''}>${esc(l)}</button>`).join('')}</div>
                ${sec('Couleur', 'rs-color', `${RT_SLIDERS.map(([k, l, mn, mx]) => `<label class="h-rs-slider"><span${k === 'shadows' ? ' data-help="Éclaircit seulement les parties sombres (ou les assombrit vers la gauche), sans toucher aux claires."' : ''}>${esc(l)} <output data-rs-out="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rs="${k}"></label>`).join('')}
                <div class="h-rs-toggles"><label class="ui-toggle"><input type="checkbox" data-rs-t="bw"><i></i>Noir et blanc</label><label class="ui-toggle"><input type="checkbox" data-rs-t="sepia"><i></i>Sépia</label><label class="ui-toggle"><input type="checkbox" data-rs-t="invert" data-help="Pour un négatif photographié ou scanné : les clairs et les sombres s’échangent."><i></i>Négatif</label></div>`)}
                ${sec('Courbe', 'rs-curve', `<div class="h-rs-curve-head"><strong data-help="Monter la courbe éclaircit, la creuser assombrit, un « S » donne du contraste. Rouge, vert, bleu : corriger une dominante de couleur.">Courbe</strong><span>${RT_CHANNELS.map(([k, l]) => `<button type="button" class="h-rs-ch ${k === 'rgb' ? 'is-active' : ''}" data-rs-ch="${k}">${l}</button>`).join('')}</span></div>
                <svg class="h-rs-curve" viewBox="-6 -6 268 268" data-rs-curve><path class="h-rs-hist" d="${histPath}"/><g class="h-rs-grid">${[64, 128, 192].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="256"/><line x1="0" y1="${v}" x2="256" y2="${v}"/>`).join('')}<line x1="0" y1="256" x2="256" y2="0" class="h-rs-diag"/></g><path class="h-rs-line" data-rs-line/><g data-rs-points></g></svg>
                <div class="h-rs-curve-tools"><button type="button" class="button small secondary" data-rs-ptdel disabled>Enlever le point</button></div>
                <p class="muted h-rs-help">Clic sur la courbe : ajouter un point · glisser : le déplacer · pour l’enlever : le choisir puis « Enlever le point » (ou la touche ⌫), ou le glisser hors du cadre.</p>`)}
                <button type="button" class="link-button" data-rs-reset>↺ Remettre comme au départ</button></div></div>
            <section class="h-rs-versions" data-rs-versions></section>
            <div class="modal-actions ed-old-hidden" aria-hidden="true"><span class="spacer"></span><button type="button" class="button secondary" data-rs-close>Annuler</button><button type="button" class="button secondary" data-rs-save="copy" title="Un autre média, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-rs-save="keep" title="Gardée dans les versions, la photo affichée ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-rs-save="show">Enregistrer et afficher cette version</button></div>
            <p class="muted h-rs-note">L’original n’est jamais modifié : chaque retouche est une version de la photo, et tu choisis celle qui s’affiche partout.</p>`;
        document.body.appendChild(dlg);
        ext.rtEnsureCss?.();
        ext.tbApply?.(dlg, 'retouch-simple'); // ⚙️ Personnaliser : boutons rangés, montrés ou cachés
        UI?.harmonizeTopbar?.(dlg.querySelector('.h-rs-head'));
        ext.fullInit?.(dlg, 'retouch-simple');
        dlg.addEventListener('close', () => dlg.remove());
        let saved = false;
        const askClose = async () => { if (!saved && hpos > 0 && !await A().confirmBox('Les retouches en cours seront perdues.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; saved = true; dlg.close(); };
        dlg.querySelectorAll('[data-rs-close]').forEach(b => b.addEventListener('click', askClose));
        dlg.addEventListener('cancel', e => { if (e.target !== dlg) return; if (!saved && hpos > 0) { e.preventDefault(); askClose(); } });
        const toAdvanced = async (opts = {}) => {
            if (!saved && hpos > 0 && !await A().confirmBox('Les corrections en cours seront perdues.', {title: 'Passer à la retouche complète ?', okLabel: 'Passer sans enregistrer', danger: true})) return;
            try { localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {}
            saved = true; dlg.close(); ext.openRetouch?.(source, null, {advanced: true, ...opts});
        };
        dlg.querySelector('[data-rs-advanced]').addEventListener('click', () => toAdvanced());
        dlg.querySelector('[data-rs-restoreall]').addEventListener('click', () => toAdvanced({restoreAll: true}));
        const canvas = dlg.querySelector('[data-rs-canvas]'), ctx = canvas.getContext('2d'); let out = ctx.createImageData(pw, ph);
        let raf = 0, showBefore = false, selPt = -1, outside = -1;
        let baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); // l'image d'origine (avant / après, annuler)
        const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (showBefore) ctx.putImageData(baseData, 0, 0); else ctx.putImageData(rtApply(srcData, out, st), 0, 0); }); };
        // ── Correcteur de taches et tampon ──
        st.strokes = [];
        let mode = 'adjust', brush = 18, cloneOff = null, painting = null;
        const brushEl = dlg.querySelector('[data-rs-brush]'), srcEl = dlg.querySelector('[data-rs-src]'), undoBtn = dlg.querySelector('[data-rs-undo]'), redoBtn = dlg.querySelector('[data-rs-redo]'), statusEl = dlg.querySelector('[data-rs-status]');
        let steps = [], hpos = -1;
        const snap = () => JSON.stringify({st: {...st, strokes: undefined}, strokes: st.strokes});
        const syncHist = () => { undoBtn.disabled = hpos <= 0; redoBtn.disabled = hpos >= steps.length - 1; if (hpos > 0) UI?.savedStatus?.(statusEl, 'dirty'); else statusEl.textContent = ''; };
        const commit = () => { const s0 = snap(); if (hpos >= 0 && steps[hpos] === s0) return; steps = steps.slice(0, hpos + 1); steps.push(s0); if (steps.length > 150) steps.shift(); hpos = steps.length - 1; syncHist(); };
        const goHist = i => {
            if (i < 0 || i >= steps.length) return; hpos = i; const o = JSON.parse(steps[i]), strokes = o.strokes || [];
            Object.keys(st).forEach(k => delete st[k]); Object.assign(st, rtDefault(), o.st, {strokes});
            setDoc(st.docXf); // ↺ ↻ : l'image tournée de cette étape
            srcData.data.set(baseData.data); if (strokes.length) rtReplayStrokes(srcData, strokes); activePreset = -1; markPreset(); syncControls(); syncHist();
        };
        let sbar = null; // K18 : la barre du bas commune (la photo · l'aide de l'outil · le zoom)
        const MODE_NAME = {adjust: 'Réglages', heal: 'Correcteur de taches', clone: 'Tampon'};
        const HELP = {adjust: 'Règle la couleur et la lumière à droite · garde « 👁 Avant / après » appuyé pour comparer', heal: 'Clique sur une tache, une poussière ou une rayure : elle est remplacée par ce qui l’entoure. Pour une rayure, glisse le long.', clone: (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⌥' : 'Alt') + ' + clic pour choisir l’endroit à recopier, puis peins sur la zone à couvrir.'};
        // l'image est centrée dans le cadre (marges sur les côtés ou en haut et en bas) : on en tient compte
        const fit = () => { const r = canvas.getBoundingClientRect(), k = Math.min(r.width / pw, r.height / ph); return {r, k, ox: r.left + (r.width - pw * k) / 2, oy: r.top + (r.height - ph * k) / 2}; };
        const toCanvas = e => { const f = fit(); return [(e.clientX - f.ox) / f.k, (e.clientY - f.oy) / f.k, f]; };
        const setMode = m => {
            mode = m; cloneOff = m === 'clone' ? cloneOff : null;
            dlg.querySelectorAll('[data-rs-mode]').forEach(b => { b.classList.toggle('is-active', b.dataset.rsMode === m); b.setAttribute('aria-pressed', b.dataset.rsMode === m ? 'true' : 'false'); });
            dlg.querySelector('.h-rs-size').hidden = m === 'adjust'; sbar?.setHelp(HELP[m]); sbar?.setWhere(`${img.naturalWidth} × ${img.naturalHeight} px · ${MODE_NAME[m]}`);
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
        const endPaint = () => { if (!painting) return; if (painting.dabs.length) { st.strokes.push({tool: painting.tool, dabs: painting.dabs}); commit(); } painting = null; };
        canvas.addEventListener('pointerup', endPaint); canvas.addEventListener('pointercancel', endPaint);
        undoBtn.addEventListener('click', () => goHist(hpos - 1));
        redoBtn.addEventListener('click', () => goHist(hpos + 1));
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
        dlg.addEventListener('change', e => { if (e.target.dataset.rs) commit(); const k = e.target.dataset.rsT; if (k) { st[k] = e.target.checked; manualEdit(); if (k === 'bw' && st.bw) st.sepia = false; if (k === 'sepia' && st.sepia) st.bw = false; syncControls(); commit(); } });
        dlg.querySelectorAll('[data-rs-ch]').forEach(b => b.addEventListener('click', () => { channel = b.dataset.rsCh; selPt = -1; dlg.querySelectorAll('[data-rs-ch]').forEach(x => x.classList.toggle('is-active', x === b)); drawCurve(); }));
        // un préréglage cliqué une 2e fois : retour à l'état d'avant (ex. « Négatif → positif » puis à nouveau → le négatif d'origine)
        let activePreset = -1, beforePreset = null;
        const markPreset = () => dlg.querySelectorAll('[data-rs-preset]').forEach(x => { const on = Number(x.dataset.rsPreset) === activePreset; x.classList.toggle('secondary', !on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); x.title = on ? 'Cliquer à nouveau pour revenir à l’état d’avant' : ''; });
        const manualEdit = () => { if (activePreset >= 0) { activePreset = -1; markPreset(); } }; // un curseur touché à la main : le préréglage n'est plus « actif » (un 2e clic le réappliquera)
        dlg.querySelectorAll('[data-rs-preset]').forEach(b => b.addEventListener('click', () => {
            const i = Number(b.dataset.rsPreset);
            if (activePreset === i && beforePreset) { Object.assign(st, JSON.parse(beforePreset), {strokes: st.strokes}); activePreset = -1; markPreset(); syncControls(); commit(); return; }
            if (activePreset < 0) beforePreset = JSON.stringify({...st, strokes: undefined});
            const keep = {bw: false, sepia: false, invert: false, strokes: st.strokes}; Object.assign(st, rtDefault(), keep); RT_PRESETS[i][1](st); if (st._auto) { delete st._auto; rtAuto(srcData, st); }
            activePreset = i; markPreset(); syncControls(); commit(); }));
        // zoom : « Ajusté » (toute l'image) ou un facteur ; ⌘/Ctrl + molette ; l'aperçu défile quand il dépasse
        let zoom = 0; const stage = canvas.parentElement;
        const fitK = () => { const r = stage.getBoundingClientRect(); return Math.min(1, (r.width - 4) / pw, (r.height - 4) / ph) || 1; };
        const setZoom = z => { zoom = z ? Math.max(.1, Math.min(8, z)) : 0; stage.classList.toggle('is-zoomed', !!zoom); canvas.style.width = zoom ? `${Math.round(pw * zoom)}px` : ''; canvas.style.height = zoom ? `${Math.round(ph * zoom)}px` : ''; sbar?.sync(); requestAnimationFrame(() => curtain?.place()); };
        // K18 : la barre du bas (taille de la photo et outil · aide · zoom) ; 100 % = un point de l'écran pour un point de la photo
        if (UI?.editorStatus) {
            sbar = UI.editorStatus({zoom: {get: () => (zoom || fitK()) * scale, set: k => setZoom(k / scale <= fitK() * 1.001 && k / scale >= fitK() * .999 ? 0 : k / scale), fit: () => setZoom(0), min: .1 * scale, max: 8 * scale}});
            dlg.appendChild(sbar); setMode(mode); addEventListener('resize', () => sbar.sync()); 
        }
        UI?.editorRail?.(dlg.querySelector('.h-rs-rail'), {breaks: ['[data-rs-rot="ccw"]', '[data-rs-railcmd]']}); // K19 : colonne de 36 px
        /* ↺ ↻ Faire pivoter la photo (et les symétries) : le même moteur que Image → Rotation de l'image de la retouche complète ;
           les corrections de taches et du tampon tournent avec elle ; une étape d'historique ; l'enregistrement reste une nouvelle version */
        const docCache = new Map(); let docKey = '[]';
        const docImage = xf => { const key = JSON.stringify(xf || []); if (key === '[]' || !ext.rtOrient) return img0; let c = docCache.get(key); if (!c) { c = ext.rtOrient.applySteps(img0, xf); docCache.set(key, c); if (docCache.size > 6) docCache.delete(docCache.keys().next().value); } return c; };
        function setDoc(xf) {
            const key = JSON.stringify(ext.rtOrient ? ext.rtOrient.cleanList(xf) : []); if (key === docKey) return false;
            docKey = key; img = docImage(JSON.parse(key));
            pw = Math.max(1, Math.round(img.naturalWidth * scale)); ph = Math.max(1, Math.round(img.naturalHeight * scale));
            work.width = pw; work.height = ph; wctx.drawImage(img, 0, 0, pw, ph);
            srcData = wctx.getImageData(0, 0, pw, ph); baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); out = ctx.createImageData(pw, ph);
            canvas.width = pw; canvas.height = ph; curtain?.setBefore?.(baseData); setMode(mode); setZoom(zoom);
            return true;
        }
        const rotate = (step, label = '') => {
            const OR = ext.rtOrient, s = OR?.clean(step); if (!s || s.p) return;
            painting = null; cloneOff = null; delete canvas.dataset.cloneFrom;
            const W0 = pw, H0 = ph, im1 = docImage(OR.push(st.docXf, s)), W1 = Math.max(1, Math.round(im1.naturalWidth * scale)), H1 = Math.max(1, Math.round(im1.naturalHeight * scale));
            const res = OR.doc({st: JSON.parse(JSON.stringify({...st, strokes: undefined})), strokes: st.strokes, layers: [], selId: null}, s, {W0, H0, W1, H1});
            Object.keys(st).forEach(k => delete st[k]); Object.assign(st, res.st, {strokes: res.strokes}); if (!st.docXf?.length) delete st.docXf;
            setDoc(st.docXf); srcData.data.set(baseData.data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes);
            draw(); commit(); sbar?.flash?.(label || OR.label(s));
        };
        dlg.querySelectorAll('[data-rs-rot]').forEach(b => b.addEventListener('click', () => rotate({r: b.dataset.rsRot === 'cw' ? 90 : -90})));
        ext.rsRotate = rotate; // pour les essais
        stage.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const z = zoom || fitK(); setZoom(e.deltaY < 0 ? z * 1.12 : (z / 1.12 <= fitK() ? 0 : z / 1.12)); }, {passive: false});
        dlg.querySelector('[data-rs-reset]').addEventListener('click', () => { Object.assign(st, rtDefault(), {strokes: st.strokes}); activePreset = -1; markPreset(); syncControls(); commit(); }); // les corrections de taches restent (↶ pour les défaire)
        const before = dlg.querySelector('[data-rs-before]');
        const setBefore = v => { showBefore = v; before.classList.toggle('is-active', v); draw(); };
        before.addEventListener('pointerdown', () => setBefore(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => before.addEventListener(t, () => showBefore && setBefore(false)));
        // Courbe : ajouter, déplacer, enlever des points
        const rawPoint = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 268 - 6, 256 - ((e.clientY - r.top) / r.height * 268 - 6)]; };
        const svgPoint = e => rawPoint(e).map(v => Math.round(clamp255(v)));
        const removePoint = i => { const pts = st.curves[channel]; if (i < 0 || pts.length <= 2) return; pts.splice(i, 1); selPt = -1; drawCurve(); draw(); commit(); };
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
        const release = () => { if (dragging >= 0 && outside === dragging) { outside = -1; removePoint(dragging); } else if (dragging >= 0) commit(); dragging = -1; outside = -1; drawCurve(); };
        svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
        // ⌫ / Suppr enlève le point choisi (écouté sur toute la page : un clic sur la courbe ne lui donne pas le clavier)
        const onKey = e => {
            if (!dlg.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dlg || e.target.closest?.('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable]')) return;
            const mod = (e.metaKey || e.ctrlKey) && !e.altKey, k = e.key.toLowerCase();
            if (mod && k === 'z') { e.preventDefault(); e.stopImmediatePropagation(); goHist(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (mod && k === 's') { e.preventDefault(); e.stopImmediatePropagation(); dlg.querySelector('[data-rs-save="show"]').click(); return; }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selPt >= 0) { e.preventDefault(); removePoint(selPt); return; }
            const tk = !mod && !e.altKey && !e.shiftKey && ({a: 'adjust', j: 'heal', s: 'clone'})[k]; if (tk && e.target.closest?.('dialog') === dlg) { e.preventDefault(); setMode(tk); }
        };
        window.addEventListener('keydown', onKey, true); dlg.addEventListener('close', () => window.removeEventListener('keydown', onKey, true));
        svg.addEventListener('contextmenu', e => { const hit = e.target.closest('[data-rs-pt]'); if (!hit) return; e.preventDefault(); const i = Number(hit.dataset.rsPt); if (!window.LCNDA_UI?.contextMenu) return removePoint(i); window.LCNDA_UI.contextMenu(e, [{icon: '🗑', label: 'Supprimer ce point', shortcut: '⌫', danger: true, run: () => removePoint(i)}], {title: 'Point de la courbe'}); }); // K14 : le menu de l'app
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
            box.innerHTML = `<h3>Versions de la photo</h3><div class="h-rs-vlist">${versions.map(v => `<figure class="${v.shown ? 'is-shown' : ''} ${v.filename === from ? 'is-source' : ''}"><img src="media/${encodeURIComponent(v.filename)}" alt="" loading="lazy"><figcaption><strong>${esc(v.label)}</strong>${v.shown ? '<span class="h-rs-badge">affichée</span>' : ''}
                ${v.filename !== from ? `<button type="button" class="link-button" data-rs-vfrom="${esc(v.filename)}">Retoucher celle-ci</button>` : '<small>en cours de retouche</small>'}</figcaption></figure>`).join('')}</div>${item.id ? '<p class="ui-vers-line"><button type="button" class="button small secondary" data-rs-vwin title="Voir, comparer, revenir, renommer, supprimer">🕘 Versions…</button><small>l’original est toujours gardé</small></p>' : ''}`;
            box.querySelector('[data-rs-vwin]')?.addEventListener('click', () => {
                if (!window.LCNDA_UI?.openMediaVersions) return;
                window.LCNDA_UI.openMediaVersions(item, {kind: 'image', tool: 'Retouche rapide', onShown: (file, vs) => { versions = vs; applyShown(file); drawVersions(); },
                    actions: [{icon: '🖌', label: 'Retoucher celle-ci', when: v => v.filename !== from, run: async (v, w) => { if (!saved && hpos > 0 && !await A().confirmBox('Les retouches en cours seront perdues.', {title: 'Quitter cette retouche sans l’enregistrer ?', okLabel: 'Quitter sans enregistrer', danger: true})) return false; saved = true; w.close(); dlg.close(); openRetouchSimple(v.filename); return 'close'; }}]});
            });
            box.querySelectorAll('[data-rs-vfrom]').forEach(b => b.addEventListener('click', async () => { if (!saved && hpos > 0 && !await A().confirmBox('Les retouches en cours seront perdues.', {title: 'Quitter cette retouche sans l’enregistrer ?', okLabel: 'Quitter sans enregistrer', danger: true})) return; saved = true; dlg.close(); openRetouchSimple(b.dataset.rsVfrom); })); // comme la retouche complète : on demande avant de perdre le travail
        };
        drawVersions();
        dlg.querySelectorAll('[data-rs-save]').forEach(b => b.addEventListener('click', async () => {
            const mode = b.dataset.rsSave, label0 = b.textContent;
            const mpx = img.naturalWidth * img.naturalHeight / 1e6;
            if (mpx > 60 && !await A().confirmBox(`Cette image est très grande (${Math.round(mpx)} millions de points) : l’enregistrement peut être long, voire échouer.`, {title: 'Enregistrer quand même ?', okLabel: 'Enregistrer'})) return;
            dlg.querySelectorAll('.modal-actions button').forEach(x => { x.disabled = true; });
            b.textContent = 'Enregistrement…';
            try {
                const full = renderFull();
                const ext0 = String(from || '').split('.').pop().toLowerCase();
                const type = ext0 === 'png' ? 'image/png' : ext0 === 'webp' ? 'image/webp' : ext0 === 'gif' ? 'image/png' : 'image/jpeg';
                const blob = await new Promise(res => full.toBlob(res, type, 0.93));
                if (!blob) throw new Error('Image trop grande pour être enregistrée par le navigateur.');
                const fd = new FormData(); fd.append('file', blob, 'retouche.' + (type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1])); fd.append('media_id', item.id); fd.append('mode', mode === 'copy' ? 'copy' : 'version'); fd.append('show', mode === 'show' ? '1' : '0'); fd.append('csrf', A().state.csrf);
                if (mode === 'copy') fd.append('title', `${docTitle()} (retouchée)`);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                saved = true;
                if (mode === 'copy') { toast('Copie retouchée ajoutée aux mêmes fiches.'); dlg.close(); refreshAfter(); return; }
                if (mode === 'show') { applyShown(j.result.filename); toast('Nouvelle version affichée. L’original est gardé dans les versions.'); dlg.close(); return; }
                versions = j.result.versions; toast('Version enregistrée (non affichée).'); dlg.close();
            } catch (error) {
                toast(error.message, 'error');
                dlg.querySelectorAll('.modal-actions button').forEach(x => { x.disabled = false; });
                b.textContent = label0;
            }
        }));
        /** L'image en pleine taille, retouchée avec les mêmes réglages que l'aperçu (taches et tampon rejoués en pleine taille) */
        function renderFull() {
            const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
            const fctx = full.getContext('2d', {willReadFrequently: true}); fctx.drawImage(img, 0, 0);
            const data = fctx.getImageData(0, 0, full.width, full.height);
            if (st.strokes.length) rtReplayStrokes(data, st.strokes);
            fctx.putImageData(rtApply(data, data, st), 0, 0);
            return full;
        }
        const docTitle = () => (dlg.querySelector('[data-rs-name]').value || '').trim() || item.title || 'photo';
        // ⤓ Exporter (E3) : la photo retouchée, ou l'avant / après (une copie peut aller dans les médias)
        dlg.addEventListener('click', e => {
            const x = e.target.closest('[data-rs-export]'); if (!x) return; x.closest('details')?.removeAttribute('open');
            if (x.dataset.rsExport === 'ba') return ext.rtBeforeAfterExport?.({title: docTitle(), mediaId: item.id || 0, pos: curtain?.pos ?? 0.5, vertical: curtain?.vertical !== false, getBefore: async () => img, getAfter: async () => renderFull()});
            ext.rtExportImage?.({title: docTitle(), mediaId: item.id || 0, copyTitle: `${docTitle()} (retouchée)`, render: async () => renderFull()});
        });
        dlg.querySelector('[data-rs-topsave]').addEventListener('click', () => dlg.querySelector('[data-rs-save="show"]').click());
        const press = sel0 => () => dlg.querySelector(sel0)?.click();
        const saveItems = () => [{icon: '💾', label: 'Enregistrer et afficher cette version', shortcut: '⌘S', run: press('[data-rs-save="show"]')}, {icon: '🗂', label: 'Enregistrer sans l’afficher (gardée dans les versions)', run: press('[data-rs-save="keep"]')}, {icon: '⧉', label: 'Copie séparée (un autre média, relié aux mêmes fiches)', run: press('[data-rs-save="copy"]')}];
        UI?.saveMenu?.(dlg.querySelector('[data-rs-topsave]'), () => saveItems().slice(1));
        UI?.editorMenus?.(dlg.querySelector('[data-rs-menus]'), {
            Fichier: () => [...saveItems(), '-', {icon: '⤓', label: 'Exporter la photo retouchée (PNG, JPG, imprimer)…', run: press('[data-rs-export="image"]')}, {icon: '⤓', label: 'Exporter l’avant / après…', run: press('[data-rs-export="ba"]')}, '-', {icon: '🎛️', label: 'Passer à la retouche complète', run: press('[data-rs-advanced]')}, {icon: '✨', label: 'Restaurer en une fois…', run: press('[data-rs-restoreall]')}, '-', {icon: '×', label: 'Fermer', run: press('[data-rs-close]')}],
            Édition: () => [{icon: '↶', label: 'Annuler', shortcut: '⌘Z', disabled: hpos <= 0, run: () => goHist(hpos - 1)}, {icon: '↷', label: 'Rétablir', shortcut: '⇧⌘Z', disabled: hpos >= steps.length - 1, run: () => goHist(hpos + 1)}, '-', {icon: '↺', label: 'Remettre comme au départ', run: press('[data-rs-reset]')}],
            Image: () => [{icon: '↻', label: 'Pivoter de 90° à droite (horaire)', run: () => rotate({r: 90})}, {icon: '↺', label: 'Pivoter de 90° à gauche (antihoraire)', run: () => rotate({r: -90})}, {label: 'Pivoter de 180°', run: () => rotate({r: 180})}, '-', {icon: '⇆', label: 'Symétrie horizontale de l’image', run: () => rotate({f: 'h'})}, {icon: '⇅', label: 'Symétrie verticale de l’image', run: () => rotate({f: 'v'})}],
            Outils: () => [['adjust', '🎚', 'A'], ['heal', '🩹', 'J'], ['clone', '🧬', 'S']].map(([k, i, sc]) => ({icon: i, label: MODE_NAME[k] + (mode === k ? ' ✓' : ''), shortcut: sc, run: () => setMode(k)})),
            Affichage: () => [{icon: '⤢', label: 'Ajuster à la fenêtre', shortcut: '⌘0', run: () => sbar?.zoom.fit()}, {label: '100 %', shortcut: '⌘1', run: () => sbar?.zoom.actual()}, {icon: '＋', label: 'Zoom avant', shortcut: '⌘+', run: () => sbar?.zoom.in()}, {icon: '−', label: 'Zoom arrière', shortcut: '⌘−', run: () => sbar?.zoom.out()}, '-', {icon: '◧', label: 'Avant / après en rideau', run: press('[data-rs-curtain]')}]});
        dlg.querySelector('[data-rs-railcmd="advanced"]')?.addEventListener('click', press('[data-rs-advanced]'));
        // ◧ Avant / après en rideau
        const curtain = ext.rtCurtain ? ext.rtCurtain({host: stage, target: canvas, before: baseData, onChange: S0 => { const q = s0 => dlg.querySelector(s0); q('[data-rs-curtain]').classList.toggle('is-active', S0.on); q('[data-rs-curdir]').hidden = q('[data-rs-curexp]').hidden = !S0.on; q('[data-rs-curdir]').textContent = S0.vertical ? '⇅' : '⇆'; }}) : null;
        dlg.querySelector('[data-rs-curtain]')?.addEventListener('click', () => curtain?.toggle());
        dlg.querySelector('[data-rs-curdir]')?.addEventListener('click', () => curtain?.setVertical(!curtain.vertical));
        dlg.querySelector('[data-rs-curexp]')?.addEventListener('click', () => dlg.querySelector('[data-rs-export="ba"]').click());
        // E4 : une photo glissée ou collée sur l'image entre dans les médias, et on peut la retoucher à la place
        UI?.bindFileDrop?.(stage, async files => {
            const f = files[0]; if (!f) return;
            if (!await A().confirmBox('La photo est ajoutée aux médias (sans fiche). Les réglages en cours sur cette photo-ci sont abandonnés.', {title: `Retoucher « ${f.name} » à la place ?`, okLabel: 'Retoucher cette photo'})) return;
            try { const r = await ext.rtImportImage(f); saved = true; dlg.close(); const s0 = A().state; s0.lightboxMedia = [{id: r.media_id, filename: r.filename, thumbnail: r.filename, title: f.name.replace(/\.[a-z0-9]{2,5}$/i, ''), media_type: 'image'}]; s0.lightboxIndex = 0; openRetouchSimple(); }
            catch (err) { toast(err.message, 'error'); }
        }, {accept: 'image/*'});
        dlg.showModal(); stage.tabIndex = -1; stage.focus({preventScroll: true}); // pas dans la case du nom : ⌘Z, ⌘S marchent tout de suite
        syncControls(); commit(); requestAnimationFrame(() => sbar?.sync());
    }

    ext.openRetouchSimple = openRetouchSimple;
})();
