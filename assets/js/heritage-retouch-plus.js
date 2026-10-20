/**
 * 🎚️ Retouche — trois outils de plus (menu Image de la retouche) :
 *   ☁️ Remplacer le ciel : le ciel est repéré (clair ou bleu, lisse, relié au haut de la photo), affiné le long de l'horizon,
 *      puis remplacé par un ciel dessiné (bleu, nuages, coucher de soleil, couvert, orageux) ou une image ; c'est un calque
 *      « Ciel » avec son masque (à corriger au pinceau) et un calque de réglage qui accorde les couleurs du premier plan.
 *   ✂️ Détourer une personne : pas de modèle d'intelligence artificielle (tout reste sur l'ordinateur) — une segmentation
 *      itérative façon GrabCut : couleurs du sujet et du fond apprises dans le rectangle et autour, lissage qui suit les
 *      contours, puis bord affiné ; ensuite fond transparent, flou, uni, ou personne sur son calque. À corriger au pinceau.
 *   🔍 Agrandir ×2 / ×4 : rééchantillonnage Lanczos 3, netteté qui suit les contours (sans halo), lissage du grain au choix ;
 *      calculé par bandes dans un fil à part (la page reste libre), avec un aperçu à 100 % avant / après.
 * (🧩 Le panorama est dans l'assemblage de photos : heritage-assemble.js.)
 * Les calculs sont dans ext.rtPlus.algo (purs, testés par tests/test-retouche-more.js).
 * La retouche (heritage-studio.js) appelle ext.rtPlus.sky(ctx), .cutout(ctx), .upscale(ctx) avec ses outils (ctx).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const tick = () => new Promise(r => setTimeout(r, 30));
    const blank = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    /** Une copie réduite (au plus maxSide de côté) : {W, H, d (RGBA), k (réduction)} */
    function small(src, maxSide, blurPx = 0) {
        const W0 = src.width, H0 = src.height, k = Math.min(1, maxSide / Math.max(W0, H0)), W = Math.max(4, Math.round(W0 * k)), H = Math.max(4, Math.round(H0 * k));
        const c = blank(W, H), g = c.getContext('2d', {willReadFrequently: true}); g.imageSmoothingQuality = 'high'; if (blurPx) g.filter = `blur(${blurPx}px)`; g.drawImage(src, 0, 0, W, H);
        return {W, H, d: g.getImageData(0, 0, W, H).data, k: W / W0};
    }
    /** Moyenne dans une boîte de rayon r (images intégrales) */
    function boxMean(a, W, H, r) {
        const I = new Float64Array((W + 1) * (H + 1)), o = new Float32Array(W * H);
        for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += a[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
        for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1); for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
            o[y * W + x] = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
        return o;
    }
    /** Filtre guidé (He et al.) : le masque p épouse les contours de l'image guide I (tout en 0 à 1) */
    function guided(I, p, W, H, r, eps) {
        const N = W * H, Ip = new Float32Array(N), II = new Float32Array(N);
        for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
        const mI = boxMean(I, W, H, r), mp = boxMean(p, W, H, r), mIp = boxMean(Ip, W, H, r), mII = boxMean(II, W, H, r), a = new Float32Array(N), b = new Float32Array(N);
        for (let i = 0; i < N; i++) { const v = mII[i] - mI[i] * mI[i], cv = mIp[i] - mI[i] * mp[i]; a[i] = cv / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
        const ma = boxMean(a, W, H, r), mb = boxMean(b, W, H, r), q = new Float32Array(N);
        for (let i = 0; i < N; i++) q[i] = ma[i] * I[i] + mb[i];
        return q;
    }
    /** Un masque binaire (petite taille) remis à la taille de la photo, bord affiné sur ses contours ; renvoie un canvas (alpha) */
    function refineUp(bin, W, H, src, {radius = 0, eps = 0.001, lo = 0.12, hi = 0.88} = {}) {
        const W0 = src.width, H0 = src.height;
        const sc = blank(W, H), sg = sc.getContext('2d'), sd = sg.createImageData(W, H); for (let i = 0; i < W * H; i++) { sd.data[i * 4 + 3] = Math.round(bin[i] * 255); } sg.putImageData(sd, 0, 0);
        const up = blank(W0, H0), ug = up.getContext('2d', {willReadFrequently: true}); ug.imageSmoothingQuality = 'high'; ug.drawImage(sc, 0, 0, W0, H0);
        const ud = ug.getImageData(0, 0, W0, H0), N = W0 * H0, p = new Float32Array(N), I = new Float32Array(N);
        const gd = src.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W0, H0).data;
        for (let i = 0; i < N; i++) { p[i] = ud.data[i * 4 + 3] / 255; I[i] = (0.299 * gd[i * 4] + 0.587 * gd[i * 4 + 1] + 0.114 * gd[i * 4 + 2]) / 255; }
        const r = radius || Math.max(2, Math.round(W0 / W * 1.3)), q = guided(I, p, W0, H0, r, eps);
        let sum = 0;
        for (let i = 0; i < N; i++) { const a = clamp01((q[i] - lo) / (hi - lo)); ud.data[i * 4] = ud.data[i * 4 + 1] = ud.data[i * 4 + 2] = 0; ud.data[i * 4 + 3] = Math.round(a * 255); sum += a; }
        ug.putImageData(ud, 0, 0);
        return {mask: up, coverage: sum / N};
    }
    /** Les morceaux reliés (4-voisins) d'un masque : étiquettes et tailles */
    function components(on, W, H) {
        const N = W * H, lab = new Int32Array(N), sizes = [0], touch = [false], st = []; let n = 0;
        for (let p0 = 0; p0 < N; p0++) { if (!on[p0] || lab[p0]) continue; n++; let sz = 0, t = false; lab[p0] = n; st.push(p0);
            while (st.length) { const p = st.pop(), x = p % W, y = (p - x) / W; sz++; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) t = true;
                if (x > 0 && on[p - 1] && !lab[p - 1]) { lab[p - 1] = n; st.push(p - 1); } if (x < W - 1 && on[p + 1] && !lab[p + 1]) { lab[p + 1] = n; st.push(p + 1); }
                if (y > 0 && on[p - W] && !lab[p - W]) { lab[p - W] = n; st.push(p - W); } if (y < H - 1 && on[p + W] && !lab[p + W]) { lab[p + W] = n; st.push(p + W); } }
            sizes.push(sz); touch.push(t); }
        return {lab, sizes, touch, n};
    }

    /* ═══════════ ☁️ Le ciel ═══════════ */
    /** Repérer le ciel : clair ou bleuté, lisse (peu de texture), pas vert, et relié au haut de la photo de proche en proche.
        Les petits trous (oiseau, fil, nuage plus marqué) sont bouchés ; le bord est ensuite affiné sur les contours de la photo. */
    function skyMask(src) {
        const s = small(src, 320, 0.6), {W, H, d} = s, N = W * H;
        const L = new Float32Array(N), blue = new Float32Array(N), green = new Float32Array(N), sat = new Float32Array(N);
        for (let p = 0, i = 0; p < N; p++, i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            L[p] = (0.299 * r + 0.587 * g + 0.114 * b) / 255; blue[p] = (b - (r + g) / 2) / 255; green[p] = (g - (r + b) / 2) / 255; sat[p] = mx ? (mx - mn) / mx : 0; }
        const grad = new Float32Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x, xl = x ? p - 1 : p, xr = x < W - 1 ? p + 1 : p, yu = y ? p - W : p, yd = y < H - 1 ? p + W : p; grad[p] = Math.abs(L[xr] - L[xl]) + Math.abs(L[yd] - L[yu]); }
        const T = boxMean(grad, W, H, 2);
        const band = Math.max(2, Math.round(H * 0.04)), top = []; for (let p = 0; p < band * W; p++) top.push(T[p]); top.sort((a, b) => a - b);
        const tex = Math.min(0.09, Math.max(0.035, top[Math.floor(top.length * 0.5)] * 2.5));
        const skyLike = p => T[p] < tex && green[p] < 0.07 && L[p] > 0.16 && (blue[p] > 0.015 || L[p] > 0.5 || (sat[p] < 0.25 && L[p] > 0.35) || (d[p * 4] > d[p * 4 + 2] + 25 && L[p] > 0.35));
        const sky = new Uint8Array(N), st = [];
        for (let p = 0; p < band * W; p++) if (skyLike(p)) { sky[p] = 1; st.push(p); }
        if (st.length < W * 0.15) return {found: false, coverage: 0};
        const step = (p, q) => (Math.abs(d[p * 4] - d[q * 4]) + Math.abs(d[p * 4 + 1] - d[q * 4 + 1]) + Math.abs(d[p * 4 + 2] - d[q * 4 + 2])) / 255;
        while (st.length) { const p = st.pop(), x = p % W;
            for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) { if (q < 0 || q >= N || sky[q]) continue; if (skyLike(q) && step(p, q) < 0.11) { sky[q] = 1; st.push(q); } } }
        // trous bouchés : ce qui n'est pas du ciel, petit, et ne touche pas les bords de la photo
        const holes = components(sky.map(v => v ? 0 : 1), W, H), maxHole = N * 0.04;
        for (let p = 0; p < N; p++) { const l = holes.lab[p]; if (l && !holes.touch[l] && holes.sizes[l] < maxHole) sky[p] = 1; }
        // un peu de lissage (vote à 3 × 3)
        const sm = new Float32Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let c = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; c += sky[yy * W + xx]; n++; } sm[y * W + x] = c / n > 0.5 ? 1 : 0; }
        const r = refineUp(sm, W, H, src, {eps: 0.0008, lo: 0.2, hi: 0.8});
        return {found: r.coverage > 0.01, mask: r.mask, coverage: r.coverage};
    }
    /** La hauteur de l'horizon (0 à 1) : en moyenne, jusqu'où descend le ciel dans chaque colonne */
    function horizonOf(mask) {
        const s = small(mask, 200), {W, H, d} = s; let sum = 0, n = 0;
        for (let x = 0; x < W; x++) { let low = -1; for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 127) low = y; if (low >= 0) { sum += (low + 1) / H; n++; } }
        return n ? Math.min(1, Math.max(0.15, sum / n)) : 0.5;
    }
    /** Bruit doux (valeurs aléatoires lissées, plusieurs octaves) : toujours le même pour une même graine */
    function makeNoise(seed = 7) {
        let s = seed >>> 0 || 1; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
        const perm = new Uint16Array(512), val = new Float32Array(256); const P = Array.from({length: 256}, (_, i) => i);
        for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 512; i++) perm[i] = P[i & 255]; for (let i = 0; i < 256; i++) val[i] = R();
        const h = (x, y) => val[perm[(perm[x & 255] + y) & 255]], sm = t => t * t * (3 - 2 * t);
        const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi), a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), e = h(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy; };
        return (x, y, oct = 5) => { let a = 0.5, f = 1, sum = 0, t = 0; for (let o = 0; o < oct; o++) { sum += a * n(x * f + o * 17.3, y * f - o * 9.1); t += a; a *= 0.5; f *= 2.03; } return sum / t; };
    }
    const hexRgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
    const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    /** Un dégradé à plusieurs arrêts : [[0, '#…'], [0.6, '#…'], [1, '#…']] */
    const grad = stops => { const S = stops.map(([p, c]) => [p, hexRgb(c)]); return t => { t = clamp01(t); for (let i = 1; i < S.length; i++) if (t <= S[i][0]) return mixC(S[i - 1][1], S[i][1], (t - S[i - 1][0]) / Math.max(1e-6, S[i][0] - S[i - 1][0])); return S[S.length - 1][1]; }; };
    const SKIES = [['clear', '☀️ Bleu dégagé'], ['clouds', '⛅ Beaux nuages'], ['sunset', '🌇 Coucher de soleil'], ['overcast', '☁️ Couvert'], ['storm', '⛈️ Ciel orageux']];
    /** Un ciel dessiné, de W × H points ; horizon (0 à 1) : là où le ciel touche la terre (le dégradé s'y éclaircit) */
    function makeSky(kind, W, H, horizon = 0.6, seed = 11) {
        const c = blank(W, H), g = c.getContext('2d'), im = g.createImageData(c.width, c.height), o = im.data; W = c.width; H = c.height;
        const nz = makeNoise(seed), hz = Math.max(0.12, horizon), asp = W / H;
        const G = {clear: grad([[0, '#1f57ad'], [0.55, '#5f95d6'], [1, '#d4e6f6']]), clouds: grad([[0, '#2a64b5'], [0.6, '#76a7dc'], [1, '#d9e9f7']]),
            sunset: grad([[0, '#1d2552'], [0.35, '#5b3b78'], [0.62, '#c65a5e'], [0.82, '#f2954a'], [1, '#ffd89a']]), overcast: grad([[0, '#727a84'], [1, '#c5c9ce']]), storm: grad([[0, '#2b3442'], [0.7, '#5d6875'], [1, '#9aa4ad']])}[kind] || null;
        const base = G || grad([[0, '#1f57ad'], [1, '#d4e6f6']]);
        for (let y = 0; y < H; y++) {
            const t = Math.min(1, (y / H) / hz), col = base(t);
            for (let x = 0; x < W; x++) {
                let [r, gg, b] = col; const u = x / W, v = y / H;
                if (kind === 'clear') { const k = 1 - 0.06 * Math.abs(u - 0.5); r *= k; gg *= k; b *= k; }
                if (kind === 'clouds') { const n = nz(u * 4 * asp, v * 9 / hz, 6), cl = smooth(0.52, 0.72, n) * (0.55 + 0.45 * smooth(0, 0.8, t)); const sh = 0.78 + 0.22 * nz(u * 9 * asp + 3, v * 16 / hz, 3); r += (255 * sh - r) * cl; gg += (252 * sh - gg) * cl; b += (250 * sh - b) * cl; }
                if (kind === 'sunset') { const dx = (u - 0.5) * asp, dy = (v - hz) * 1.6, dd = Math.sqrt(dx * dx + dy * dy), glow = Math.exp(-dd * dd * 9) * 0.9; r += (255 - r) * glow; gg += (220 - gg) * glow * 0.8; b += (150 - b) * glow * 0.5;
                    const n = nz(u * 3 * asp, v * 14 / hz, 5), cl = smooth(0.55, 0.75, n) * smooth(0.25, 0.85, t); r += (120 - r) * cl * 0.55; gg += (60 - gg) * cl * 0.55; b += (90 - b) * cl * 0.5; }
                if (kind === 'overcast') { const n = nz(u * 3 * asp, v * 6 / hz, 5) - 0.5; r += n * 34; gg += n * 34; b += n * 32; }
                if (kind === 'storm') { const n = nz(u * 2.5 * asp, v * 7 / hz, 6), m = smooth(0.35, 0.8, n), lit = smooth(0.62, 0.7, n) - smooth(0.7, 0.85, n); r = r * (1 - m * 0.55) + lit * 70; gg = gg * (1 - m * 0.55) + lit * 70; b = b * (1 - m * 0.5) + lit * 75; }
                const i = (y * W + x) * 4; o[i] = r; o[i + 1] = gg; o[i + 2] = b; o[i + 3] = 255;
            }
        }
        g.putImageData(im, 0, 0); return c;
    }
    /** Une image (ciel photographié) posée sur la zone du ciel : elle la couvre jusqu'à l'horizon, sans être déformée */
    function imageSky(im, W, H, horizon) {
        const c = blank(W, H), g = c.getContext('2d'), iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, zh = Math.max(1, H * Math.min(1, horizon * 1.08));
        const k = Math.max(W / iw, zh / ih), w = iw * k, h = ih * k; g.imageSmoothingQuality = 'high';
        g.drawImage(im, (W - w) / 2, 0, w, h); if (h < H) g.drawImage(c, 0, h - 2, W, 2, 0, h - 1, W, H - h + 1);
        return c;
    }
    /** La couleur moyenne d'un canvas, pondérée par l'alpha d'un masque (ou des lignes du haut jusqu'à « rows ») */
    function meanColor(src, mask = null, rows = 1) {
        const s = small(src, 160), m = mask ? small(mask, 160) : null; let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < Math.round(s.H * rows); y++) for (let x = 0; x < s.W; x++) { const i = (y * s.W + x) * 4, w = m ? m.d[((Math.min(m.H - 1, y) * m.W) + Math.min(m.W - 1, x)) * 4 + 3] / 255 : 1; if (!w) continue; r += s.d[i] * w; g += s.d[i + 1] * w; b += s.d[i + 2] * w; n += w; }
        return n ? [r / n, g / n, b / n] : [128, 128, 128];
    }

    /* ═══════════ ✂️ Détourer (GrabCut allégé) ═══════════ */
    /** rect : {x, y, w, h} en points de src (ou null : toute la photo, sauf une fine bordure). Renvoie {mask (canvas, alpha), coverage} */
    function cutout(src, rect = null, {iters = 5} = {}) {
        const s = small(src, 300, 0.5), {W, H, d} = s, N = W * H, k = s.k;
        let rx0, ry0, rx1, ry1;
        if (rect && rect.w > 4 && rect.h > 4) { rx0 = Math.max(0, Math.floor(rect.x * k)); ry0 = Math.max(0, Math.floor(rect.y * k)); rx1 = Math.min(W - 1, Math.ceil((rect.x + rect.w) * k)); ry1 = Math.min(H - 1, Math.ceil((rect.y + rect.h) * k)); }
        else { const m = Math.max(3, Math.round(Math.min(W, H) * 0.06)); rx0 = m; ry0 = m; rx1 = W - 1 - m; ry1 = H - 1 - m; }
        const inR = new Uint8Array(N); for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) inR[y * W + x] = 1;
        // liens entre voisins : forts entre couleurs proches, faibles à travers un contour
        const dist2 = (p, q) => { const a = p * 4, b = q * 4; return (d[a] - d[b]) ** 2 + (d[a + 1] - d[b + 1]) ** 2 + (d[a + 2] - d[b + 2]) ** 2; };
        let mean = 0, cnt = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (x < W - 1) { mean += dist2(p, p + 1); cnt++; } if (y < H - 1) { mean += dist2(p, p + W); cnt++; } }
        const beta = 1 / (2 * Math.max(1, mean / cnt)), wR = new Float32Array(N), wD = new Float32Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (x < W - 1) wR[p] = Math.exp(-beta * dist2(p, p + 1)); if (y < H - 1) wD[p] = Math.exp(-beta * dist2(p, p + W)); }
        const bin = new Uint16Array(N); for (let p = 0; p < N; p++) bin[p] = ((d[p * 4] >> 4) << 8) | ((d[p * 4 + 1] >> 4) << 4) | (d[p * 4 + 2] >> 4);
        // départ : le sujet occupe le milieu du rectangle (un peu plus probable au centre)
        const q = new Float32Array(N), cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2, hw = Math.max(1, (rx1 - rx0) / 2), hh = Math.max(1, (ry1 - ry0) / 2);
        const prior = new Float32Array(N);
        for (let p = 0; p < N; p++) { if (!inR[p]) continue; const x = p % W, y = (p - x) / W, e = ((x - cx) / hw) ** 2 + ((y - cy) / hh) ** 2; prior[p] = 1 - Math.min(1, e); q[p] = 0.45 + 0.5 * (1 - Math.min(1, e)); }
        const blur3 = h => { // histogramme 16³ adouci (les couleurs voisines comptent un peu)
            const o = new Float32Array(4096);
            for (let r = 0; r < 16; r++) for (let g = 0; g < 16; g++) for (let b = 0; b < 16; b++) { let s2 = 0; for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) { const R = r + dr, G = g + dg, B = b + db; if (R < 0 || G < 0 || B < 0 || R > 15 || G > 15 || B > 15) continue; s2 += h[(R << 8) | (G << 4) | B] * (dr || dg || db ? 0.35 : 1); } o[(r << 8) | (g << 4) | b] = s2; }
            return o; };
        const U = new Float32Array(N), lam = 1.4;
        for (let it = 0; it < iters; it++) {
            const hf = new Float32Array(4096), hb = new Float32Array(4096); let nf = 0, nb = 0;
            for (let p = 0; p < N; p++) { if (inR[p]) { const w2 = q[p] * q[p]; hf[bin[p]] += w2; nf += w2; } const wb = inR[p] ? (1 - q[p]) * 0.6 : 1; hb[bin[p]] += wb; nb += wb; }
            const Hf = blur3(hf), Hb = blur3(hb), ef = Math.max(1, nf) * 1e-4, eb = Math.max(1, nb) * 1e-4;
            for (let p = 0; p < N; p++) { if (!inR[p]) { U[p] = -12; continue; } const lf = Math.log((Hf[bin[p]] + ef) / (nf + ef)), lb = Math.log((Hb[bin[p]] + eb) / (nb + eb)); U[p] = Math.max(-6, Math.min(6, lf - lb)) + prior[p] * (it ? 0.15 : 0.6); }
            for (let k2 = 0; k2 < 8; k2++) { // champ moyen : chaque point suit sa couleur et ses voisins (sauf à travers un contour)
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!inR[p]) { q[p] = 0; continue; }
                    let m = U[p]; if (x > 0) m += lam * wR[p - 1] * (2 * q[p - 1] - 1); if (x < W - 1) m += lam * wR[p] * (2 * q[p + 1] - 1); if (y > 0) m += lam * wD[p - W] * (2 * q[p - W] - 1); if (y < H - 1) m += lam * wD[p] * (2 * q[p + W] - 1);
                    q[p] = 1 / (1 + Math.exp(-m)); }
            }
        }
        // on garde le gros morceau (et ceux d'au moins 15 % de lui), on bouche les petits trous
        const on = new Uint8Array(N); for (let p = 0; p < N; p++) on[p] = q[p] > 0.5 ? 1 : 0;
        const comp = components(on, W, H); let big = 0; for (let i = 1; i <= comp.n; i++) if (comp.sizes[i] > big) big = comp.sizes[i];
        if (!big) return {found: false, coverage: 0};
        for (let p = 0; p < N; p++) if (on[p] && comp.sizes[comp.lab[p]] < big * 0.15) on[p] = 0;
        const holes = components(on.map(v => v ? 0 : 1), W, H);
        for (let p = 0; p < N; p++) { const l = holes.lab[p]; if (l && !holes.touch[l] && holes.sizes[l] < big * 0.02) on[p] = 1; }
        const r = refineUp(Float32Array.from(on), W, H, src, {eps: 0.002, lo: 0.25, hi: 0.75});
        return {found: true, mask: r.mask, coverage: r.coverage};
    }

    /* ═══════════ 🔍 Agrandir : Lanczos 3 par bandes (le même code dans le fil à part et, à défaut, ici) ═══════════ */
    function rtUpCore() {
        const lanczos = x => { if (x === 0) return 1; if (x <= -3 || x >= 3) return 0; const p = Math.PI * x; return 3 * Math.sin(p) * Math.sin(p / 3) / (p * p); };
        const phases = k => Array.from({length: k}, (_, ph) => { const xs = (ph + 0.5) / k - 0.5, f = Math.floor(xs), w = []; let s = 0; for (let t = -2; t <= 3; t++) { const v = lanczos(xs - (f + t)); w.push(v); s += v; } return {f, w: w.map(v => v / s)}; });
        /** lissage du grain : chaque point devient la moyenne de ses voisins proches en couleur (les contours restent) */
        function denoise(src, W, H, thr = 16) {
            const o = new Uint8ClampedArray(src);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
                for (let c = 0; c < 3; c++) { const v = src[i + c]; let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const u = src[(yy * W + xx) * 4 + c]; if (Math.abs(u - v) <= thr) { s += u; n++; } } } o[i + c] = s / n; } }
            return o;
        }
        /** générateur : une bande de lignes agrandies à la fois {y0, h, data} */
        function* upscale(src, W, H, k, {sharp = 0.5, grain = false, band = 96} = {}) {
            if (grain) src = denoise(src, W, H);
            const W2 = W * k, H2 = H * k, P = phases(k), S = new Float32Array(W * H * 4);
            for (let i = 0; i < W * H; i++) { const a = src[i * 4 + 3] / 255; S[i * 4] = src[i * 4] * a; S[i * 4 + 1] = src[i * 4 + 1] * a; S[i * 4 + 2] = src[i * 4 + 2] * a; S[i * 4 + 3] = src[i * 4 + 3]; }
            const cl = (v, n) => v < 0 ? 0 : v >= n ? n - 1 : v;
            for (let oy0 = 0; oy0 < H2; oy0 += band) {
                const oy1 = Math.min(H2, oy0 + band), e0 = Math.max(0, oy0 - 1), e1 = Math.min(H2, oy1 + 1);
                const sy0 = cl(Math.floor((e0 + 0.5) / k - 0.5) - 2, H), sy1 = cl(Math.floor((e1 - 1 + 0.5) / k - 0.5) + 3, H), nr = sy1 - sy0 + 1;
                const Hh = new Float32Array(nr * W2 * 4); // 1. sur la largeur
                for (let r = 0; r < nr; r++) { const row = (sy0 + r) * W * 4, out = r * W2 * 4;
                    for (let X = 0; X < W; X++) for (let ph = 0; ph < k; ph++) { const {f, w} = P[ph], o = out + (X * k + ph) * 4; let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
                        for (let t = 0; t < 6; t++) { const j = row + cl(X + f + t - 2, W) * 4, ww = w[t]; a0 += S[j] * ww; a1 += S[j + 1] * ww; a2 += S[j + 2] * ww; a3 += S[j + 3] * ww; }
                        Hh[o] = a0; Hh[o + 1] = a1; Hh[o + 2] = a2; Hh[o + 3] = a3; } }
                const nh = e1 - e0, V = new Float32Array(nh * W2 * 4); // 2. sur la hauteur
                for (let oy = e0; oy < e1; oy++) { const Y = Math.floor(oy / k), {f, w} = P[oy % k], out = (oy - e0) * W2 * 4;
                    const rows = [0, 1, 2, 3, 4, 5].map(t => (cl(Y + f + t - 2, H) - sy0) * W2 * 4);
                    for (let x = 0; x < W2 * 4; x++) { let a = 0; for (let t = 0; t < 6; t++) a += Hh[rows[t] + x] * w[t]; V[out + x] = a; } }
                // 3. netteté qui suit les contours : renforcée sur les bords, douce sur les aplats, bornée par les voisins (pas de halo)
                const h = oy1 - oy0, data = new Uint8ClampedArray(W2 * h * 4), amt = Math.max(0, sharp) * 1.5;
                for (let oy = oy0; oy < oy1; oy++) { const r0 = (oy - e0), up = Math.max(0, r0 - 1), dn = Math.min(nh - 1, r0 + 1);
                    for (let x = 0; x < W2; x++) { const i = (r0 * W2 + x) * 4, o = ((oy - oy0) * W2 + x) * 4, xl = Math.max(0, x - 1), xr = Math.min(W2 - 1, x + 1), al = V[i + 3];
                        for (let c = 0; c < 3; c++) { let v = V[i + c];
                            if (amt > 0) { let mn = Infinity, mx = -Infinity, s = 0; for (const rr of [up, r0, dn]) for (const xx of [xl, x, xr]) { const u = V[(rr * W2 + xx) * 4 + c]; s += u; if (u < mn) mn = u; if (u > mx) mx = u; }
                                const g = mx - mn, e = amt * (0.3 + 0.7 * Math.min(1, g / 40)); v = v + e * (v - s / 9); const m = g * 0.08; if (v < mn - m) v = mn - m; if (v > mx + m) v = mx + m; }
                            data[o + c] = al > 0.5 ? v * 255 / al : v; }
                        data[o + 3] = al; } }
                yield {y0: oy0, h, data, W2, H2};
            }
        }
        return {upscale, denoise};
    }
    const UP = rtUpCore();
    const MAX_SIDE = 12000, MAX_PIXELS = 100e6;
    /** Agrandir un canvas (×k) : dans un fil à part (bandes), sinon par petits morceaux ici. onProgress(0…1) ; renvoie {promise, cancel} */
    function upscaleCanvas(src, k, opt = {}, onProgress = null) {
        const W = src.width, H = src.height, W2 = W * k, H2 = H * k;
        if (Math.max(W2, H2) > MAX_SIDE || W2 * H2 > MAX_PIXELS) throw new Error(`Trop grande : ${W2} × ${H2} points. L’agrandissement est limité à ${MAX_SIDE.toLocaleString('fr-FR')} points de côté (et ${MAX_PIXELS / 1e6} millions de points).`);
        const data = src.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data;
        const out = blank(W2, H2), og = out.getContext('2d');
        let cancel = () => {}, stopped = false;
        const put = b => { og.putImageData(new ImageData(b.data, W2, b.h), 0, b.y0); onProgress?.(Math.min(1, (b.y0 + b.h) / H2)); };
        const promise = new Promise((res, rej) => {
            let w = null, url = '';
            if (!opt.noWorker) try { url = URL.createObjectURL(new Blob([`const C=(${rtUpCore.toString()})();onmessage=e=>{const m=e.data;try{for(const b of C.upscale(m.src,m.W,m.H,m.k,m.opt))postMessage(b,[b.data.buffer]);postMessage({done:true});}catch(err){postMessage({error:String(err&&err.message||err)});}};`], {type: 'text/javascript'})); w = new Worker(url); } catch (_) { w = null; }
            if (w) {
                cancel = () => { stopped = true; w.terminate(); URL.revokeObjectURL(url); rej(new Error('Agrandissement arrêté.')); };
                w.onmessage = e => { const m = e.data; if (m.error) { w.terminate(); URL.revokeObjectURL(url); rej(new Error(m.error)); return; } if (m.done) { w.terminate(); URL.revokeObjectURL(url); res(out); return; } put(m); };
                w.onerror = e => { w.terminate(); URL.revokeObjectURL(url); rej(new Error(e.message || 'Fil de calcul en panne.')); };
                const copy = new Uint8ClampedArray(data); w.postMessage({src: copy, W, H, k, opt}, [copy.buffer]);
            } else { // sans fil à part : une bande, puis on rend la main à la page
                const it = UP.upscale(data, W, H, k, opt);
                cancel = () => { stopped = true; rej(new Error('Agrandissement arrêté.')); };
                const step = () => { if (stopped) return; try { const t0 = performance.now(); let r; do { r = it.next(); if (!r.done) put(r.value); } while (!r.done && performance.now() - t0 < 30); if (r.done) res(out); else setTimeout(step, 0); } catch (err) { rej(err); } };
                setTimeout(step, 0);
            }
        });
        return {promise, cancel: () => cancel()};
    }
    /** Un petit morceau agrandi (pour l'aperçu à 100 %), calculé tout de suite */
    function upscaleCrop(src, k, cx, cy, size, opt) {
        const sw = Math.ceil(size / k) + 8, x0 = Math.max(0, Math.min(src.width - sw, Math.round(cx - sw / 2))), y0 = Math.max(0, Math.min(src.height - sw, Math.round(cy - sw / 2)));
        const w = Math.min(sw, src.width), h = Math.min(sw, src.height), d = src.getContext('2d', {willReadFrequently: true}).getImageData(x0, y0, w, h).data;
        const out = blank(w * k, h * k), g = out.getContext('2d'); for (const b of UP.upscale(d, w, h, k, {...opt, band: 512})) g.putImageData(new ImageData(b.data, w * k, b.h), 0, b.y0);
        return {canvas: out, x0, y0, w, h};
    }

    ext.rtPlus = ext.rtPlus || {};
    ext.rtPlus.algo = {skyMask, horizonOf, makeSky, imageSky, cutout, upscaleCore: rtUpCore, upscaleCanvas, upscaleCrop, guided, SKIES, MAX_SIDE, MAX_PIXELS};

    /* ═══════════ Les fenêtres dans la retouche ═══════════ */
    /** Le petit panneau flottant sur la photo (comme les filtres) */
    function panel(c, cls, title, sub, html) {
        c.dlg.querySelector('.h-rt-fxpanel')?.remove();
        const pn = document.createElement('div'); pn.className = `h-rt-fxpanel h-rt-plus ${cls}`;
        pn.innerHTML = `<header><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</header>${html}`;
        c.left.appendChild(pn); return pn;
    }
    const slider = (k, label, mn, mx, v, unit = '', help = '') => `<label class="h-rt-slider"><span${help ? ` data-help="${esc(help)}"` : ''}>${esc(label)} <output data-o="${k}">${v}${unit}</output></span><input type="range" min="${mn}" max="${mx}" value="${v}" data-p="${k}" data-unit="${unit}"></label>`;
    const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible.')); i.src = src; });
    const blurCanvas = (src, r) => { const c = blank(src.width, src.height), g = c.getContext('2d'); if (r > 0.3) g.filter = `blur(${r}px)`; g.drawImage(src, 0, 0); return c; };

    /** ☁️ Remplacer le ciel. Une sélection en cours est prise comme ciel (pour corriger ce que l'app a mal vu). */
    ext.rtPlus.sky = async c => {
        const {pw, ph} = c;
        c.busy('Recherche du ciel…'); await tick();
        let mask = null, cov = 0, fromSel = false;
        const sm = c.selMask();
        try {
            if (sm) { mask = blurCanvas(sm, 0); cov = (() => { const s = small(sm, 200); let a = 0; for (let i = 3; i < s.d.length; i += 4) a += s.d[i]; return a / 255 / (s.W * s.H); })(); fromSel = true; }
            else { const r = skyMask(c.photo()); if (!r.found || r.coverage < 0.02) { c.busy(''); return toast('Je ne trouve pas de ciel : il doit toucher le haut de la photo et être assez uni. Sélectionne-le toi-même (🪄 baguette, ➰ lasso), puis recommence : ta sélection sera prise comme ciel.', 'error'); } mask = r.mask; cov = r.coverage; }
        } finally { c.busy(''); }
        const horizon = horizonOf(mask), rawId = c.addMask(mask), oldMean = meanColor(c.photo(), mask);
        const adj = c.aboveP(() => c.newAdjust('Harmonisation du premier plan'));
        adj.mask = [{type: 'sel', mask: rawId, invert: true}];
        const lay = c.newLayer('Ciel');
        const SW = Math.min(1400, pw), SH = Math.max(1, Math.round(SW * ph / pw)), skyCache = new Map(), featherCache = new Map();
        const o = {kind: 'clouds', scale: 100, pos: 0, xpos: 50, feather: 30, harmon: 50, opacity: 100};
        let userImg = null, userName = '';
        const skyCanvas = () => { const key = o.kind === 'image' ? 'image:' + userName : o.kind; if (!skyCache.has(key)) { const cv = o.kind === 'image' && userImg ? imageSky(userImg, SW, SH, horizon) : makeSky(o.kind, SW, SH, horizon); skyCache.set(key, {id: c.addMask(cv), mean: meanColor(cv, null, Math.min(1, horizon))}); } return skyCache.get(key); };
        // le fondu reste du côté du ciel : le masque est d'abord un peu rétréci, puis adouci (pas de halo clair sur les collines)
        const shrink = (src, r) => { const b = blurCanvas(src, r), g = b.getContext('2d', {willReadFrequently: true}), id = g.getImageData(0, 0, b.width, b.height); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > 235 ? 255 : 0; g.putImageData(id, 0, 0); return b; };
        const featherId = () => { const r = Math.round(o.feather / 100 * pw * 0.025 * 10) / 10; if (!featherCache.has(r)) featherCache.set(r, c.addMask(r > 0.3 ? blurCanvas(shrink(mask, r * 0.6), r * 0.7) : mask)); return featherCache.get(r); };
        const apply = () => {
            const sk = skyCanvas(), s = o.scale / 100;
            lay.ops = [{type: 'image', mask: sk.id, x: (1 - s) * o.xpos / 100, y: (1 - s) * o.pos / 100, w: s, h: s, rot: 0, opacity: o.opacity / 100}];
            const extra = (lay.mask || []).slice(1); lay.mask = [{type: 'sel', mask: featherId()}, ...extra];
            // le premier plan prend un peu de la lumière du nouveau ciel (plus chaud au coucher du soleil, plus gris sous un ciel couvert)
            const dr = sk.mean[0] - oldMean[0], dg = sk.mean[1] - oldMean[1], db = sk.mean[2] - oldMean[2], dl = (dr * 0.299 + dg * 0.587 + db * 0.114);
            const sat = v => { const mx = Math.max(...v), mn = Math.min(...v); return mx ? (mx - mn) / mx : 0; };
            Object.assign(adj.st, {warmth: Math.max(-60, Math.min(60, Math.round((dr - db) / 2 * 0.35 / 0.35 * 0.6))), brightness: Math.max(-40, Math.min(40, Math.round(dl * 0.3 / 1.2))), saturation: Math.max(-40, Math.min(30, Math.round((sat(sk.mean) - sat(oldMean)) * 60)))});
            adj.opacity = o.harmon / 100; adj.visible = o.harmon > 0;
            c.renderLayer(lay); c.refresh();
        };
        const thumbs = SKIES.map(([k, l]) => { const t = makeSky(k, 72, 44, 0.95, 5); return `<button type="button" class="h-rt-skybtn${k === o.kind ? ' is-on' : ''}" data-sky="${k}" title="${esc(l)}"><img src="${t.toDataURL()}" alt=""><span>${esc(l)}</span></button>`; }).join('');
        const pn = panel(c, 'h-rt-skypanel', '☁️ Remplacer le ciel', `${fromSel ? 'Ta sélection est prise comme ciel' : `Ciel trouvé : <b data-sky-cov>${Math.round(cov * 100)} %</b> de la photo`} · calques « Ciel » et « Harmonisation »`,
            `<div class="h-rt-skies">${thumbs}<button type="button" class="h-rt-skybtn" data-sky-img title="Une photo de ciel : de la base, ou de l’ordinateur"><span class="h-rt-skyico">🖼</span><span>Une image…</span></button></div>
            ${slider('scale', 'Taille du nouveau ciel', 100, 300, o.scale, ' %')}${slider('pos', 'Position verticale', 0, 100, o.pos, ' %', 'Avec une taille au-dessus de 100 % : quelle partie du ciel se voit (0 = le haut).')}${slider('xpos', 'Position horizontale', 0, 100, o.xpos, ' %')}
            ${slider('feather', 'Fondu à l’horizon', 0, 100, o.feather, '', 'Adoucit la limite entre le ciel et la terre (arbres, toits) : plus haut, plus fondu.')}${slider('harmon', 'Harmoniser le premier plan', 0, 100, o.harmon, ' %', 'Le paysage prend un peu la couleur et la lumière du nouveau ciel, pour que tout aille ensemble.')}${slider('opacity', 'Opacité du ciel', 10, 100, o.opacity, ' %')}
            <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-sky-brush title="Peindre le masque du calque « Ciel » : ⬛ cacher (là où le ciel ne doit pas passer), ⬜ montrer">🖌 Corriger le masque</button></div>
            <div class="h-rt-fxbtns"><span class="spacer"></span><button type="button" class="button small secondary" data-sky-cancel>Annuler</button><button type="button" class="button small" data-sky-ok>✓ OK</button></div>
            <small class="muted">Rien n’est détruit : le ciel est un calque avec un masque. Si un bout de ciel manque ou déborde : « Corriger le masque », ou sélectionne le ciel toi-même (🪄, ➰) et relance.</small>`);
        pn.dataset.coverage = cov.toFixed(4);
        let tm = 0;
        pn.addEventListener('input', e => { const k = e.target.dataset.p; if (!k) return; o[k] = Number(e.target.value); pn.querySelector(`[data-o="${k}"]`).textContent = e.target.value + (e.target.dataset.unit || ''); clearTimeout(tm); tm = setTimeout(apply, k === 'feather' ? 160 : 40); });
        pn.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.sky) { o.kind = b.dataset.sky; pn.querySelectorAll('[data-sky],[data-sky-img]').forEach(x => x.classList.toggle('is-on', x === b)); apply(); return; }
            if (b.hasAttribute('data-sky-img')) {
                const it = await window.LCNDA_PICKER?.openMediaPicker?.({types: ['image'], eyebrow: 'CIEL', title: 'Une photo de ciel', okLabel: 'Prendre ce ciel', intro: 'Une photo de la base, ou une image de l’ordinateur (elle entre dans les médias).'});
                if (!it?.filename) return;
                try { userImg = await loadImg(`media/${encodeURIComponent(it.filename)}`); userName = it.filename; o.kind = 'image'; pn.querySelectorAll('[data-sky],[data-sky-img]').forEach(x => x.classList.toggle('is-on', x === b)); apply(); } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (b.hasAttribute('data-sky-brush')) { c.setMaskEdit(lay.id); c.setMode('brush'); c.showTab('layers'); toast('Tu peins le masque du ciel : ⬛ cacher là où le ciel déborde (feuillage, toits), ⬜ montrer là où il manque. Puis « ✓ OK ».'); return; }
            if (b.hasAttribute('data-sky-cancel')) { pn.remove(); c.removeNode(lay.id); c.removeNode(adj.id); c.setMaskEdit(''); c.refresh(); return; }
            if (b.hasAttribute('data-sky-ok')) { pn.remove(); c.setMaskEdit(''); c.setMode('adjust'); c.refresh(); c.commit(`Ciel remplacé (${o.kind === 'image' ? 'image' : SKIES.find(s => s[0] === o.kind)?.[1].replace(/^\S+\s/, '') || o.kind})`); toast('Ciel remplacé : calques « Ciel » et « Harmonisation du premier plan » (opacité, masque, 👁 pour comparer).'); }
        });
        apply(); c.showTab('layers');
    };

    /** ✂️ Détourer une personne : rectangle (la sélection en cours) ou toute la photo, puis le fond au choix */
    ext.rtPlus.cutout = async c => {
        const {pw, ph} = c;
        const pn = panel(c, 'h-rt-cutpanel', '✂️ Détourer une personne', 'Sans intelligence artificielle : tout se calcule ici',
            `<p class="muted">1. Trace un rectangle autour de la personne (⬚), pas trop serré — ou laisse tout : la photo entière sert de cadre.<br>2. « Détourer » : l’app apprend les couleurs de la personne (dans le rectangle) et du fond (autour), puis suit les contours.</p>
            <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-cut-rect>⬚ Tracer un rectangle</button><button type="button" class="button small" data-cut-run>✂️ Détourer</button></div>
            <div data-cut-out hidden>
                <fieldset class="h-rt-cutbg"><legend>Le fond</legend>
                    <label class="checkbox-line"><input type="radio" name="rt-cutbg" value="transparent" checked> <span>Fond transparent (image en PNG)</span></label>
                    <label class="checkbox-line"><input type="radio" name="rt-cutbg" value="blur"> <span>Fond flou</span></label>
                    <label class="checkbox-line"><input type="radio" name="rt-cutbg" value="color"> <span>Fond uni</span> <input type="color" value="#f2efe8" data-cut-color></label>
                    <label class="checkbox-line"><input type="radio" name="rt-cutbg" value="layer"> <span>Garder la personne sur un calque à part</span></label></fieldset>
                ${slider('blur', 'Flou du fond', 1, 60, 14)}
                <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-cut-brush title="Peindre le masque : ⬛ cacher, ⬜ montrer">🖌 Retoucher le contour</button></div>
            </div>
            <div class="h-rt-fxbtns"><span class="spacer"></span><button type="button" class="button small secondary" data-cut-cancel>Annuler</button><button type="button" class="button small" data-cut-ok disabled>✓ OK</button></div>
            <small class="muted">Marche bien quand la personne se détache de son fond (couleurs différentes, fond assez simple). Cheveux fins, fond chargé ou vêtements de la couleur du fond : il faudra retoucher au pinceau (« Retoucher le contour »).</small>`);
        const P = c.photoNode(), prevMask = P.mask ? JSON.parse(JSON.stringify(P.mask)) : null;
        let cutId = '', fullId = '', node = null, target = '', choice = 'transparent';
        const o = {blur: 14, color: '#f2efe8'};
        // les retouches au pinceau, gardées « du point de vue de la personne » quand on change de fond
        const subjOps = () => { const t = target === 'photo' ? P : c.nodeById(target); const m = t?.mask || []; const inv = m.findIndex(x => x.type === 'invert'); if (inv < 0) return m.slice(1); return [...m.slice(1, inv), ...m.slice(inv + 1).map(x => x.points ? {...x, mode: x.mode === 'hide' ? 'show' : 'hide'} : x)]; };
        const undo = () => { if (node) { c.removeNode(node.id); node = null; } P.mask = prevMask ? JSON.parse(JSON.stringify(prevMask)) : null; };
        const apply = () => {
            if (!cutId) return;
            const ops = target ? subjOps() : [];
            undo();
            const subj = [{type: 'sel', mask: cutId}, ...ops], bg = [...subj, {type: 'invert'}];
            if (choice === 'transparent') { P.mask = subj; target = 'photo'; }
            else if (choice === 'blur') { node = c.aboveP(() => c.newAdjust('Fond flou')); node.st.filters = {chain: [{t: 'gauss', r: o.blur}]}; node.mask = bg; target = node.id; }
            else if (choice === 'color') { node = c.aboveP(() => c.newLayer('Fond uni')); node.ops = [{type: 'shape', kind: 'rect', x1: 0, y1: 0, x2: 1, y2: 1, fill: o.color, color: o.color, size: 0, opacity: 1}]; node.mask = bg; target = node.id; c.renderLayer(node); }
            else { if (!fullId) { const f = c.blankMask(); const g = f.getContext('2d'); g.fillRect(0, 0, pw, ph); fullId = c.addMask(f); } c.setActive(''); node = c.newLayer('Personne détourée'); node.ops = [{type: 'pixels', mask: fullId, dx: 0, dy: 0, opacity: 1}]; node.mask = subj; target = node.id; c.renderLayer(node); }
            c.refresh();
        };
        const sel = () => { const m = c.selMask(); return m ? c.maskBox(m) : null; };
        pn.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-cut-rect')) { c.setMode('marquee'); toast('Trace un rectangle autour de la personne (en laissant un peu de fond tout autour), puis « ✂️ Détourer ».'); return; }
            if (b.hasAttribute('data-cut-run')) {
                const r = sel(); b.disabled = true; c.busy('Détourage…'); await tick();
                let res; try { res = cutout(c.photo(), r); } finally { c.busy(''); b.disabled = false; }
                if (!res.found || res.coverage < 0.005) return toast('Personne introuvable : trace le rectangle plus près d’elle, puis recommence.', 'error');
                cutId = c.addMask(res.mask); pn.dataset.coverage = res.coverage.toFixed(4); target = '';
                pn.querySelector('[data-cut-out]').hidden = false; pn.querySelector('[data-cut-ok]').disabled = false; b.textContent = '✂️ Détourer à nouveau';
                if (c.selMask()) c.clearSel();
                c.setMode('adjust'); apply(); toast(`Personne détourée${r ? ' (dans ton rectangle)' : ''} : choisis le fond ; « Retoucher le contour » pour corriger au pinceau.`); return;
            }
            if (b.hasAttribute('data-cut-brush')) { if (!target) return; c.setMaskEdit(target); c.setMode('brush'); c.showTab('layers'); toast(choice === 'transparent' || choice === 'layer' ? 'Tu peins le masque de la personne : ⬛ cacher (du fond resté), ⬜ montrer (un bout de la personne oublié).' : 'Tu peins le masque du fond : ⬛ cacher (là c’est la personne), ⬜ montrer (là c’est du fond).'); return; }
            if (b.hasAttribute('data-cut-cancel')) { undo(); pn.remove(); c.setMaskEdit(''); c.refresh(); return; }
            if (b.hasAttribute('data-cut-ok')) { pn.remove(); c.setMaskEdit(''); c.setMode('adjust'); c.refresh(); c.commit({transparent: 'Détourage : fond transparent', blur: 'Détourage : fond flou', color: 'Détourage : fond uni', layer: 'Détourage : personne sur un calque'}[choice]); toast(choice === 'transparent' ? 'Fond rendu transparent (masque de la photo) : l’image sera enregistrée en PNG.' : 'Détourage fait : tout est sur des calques, avec des masques à retoucher au besoin.'); }
        });
        pn.addEventListener('change', e => { if (e.target.name === 'rt-cutbg') { choice = e.target.value; apply(); } if (e.target.matches('[data-cut-color]')) { o.color = e.target.value; if (choice !== 'color') { choice = 'color'; pn.querySelector('input[value=color]').checked = true; } apply(); } });
        let tm = 0; pn.addEventListener('input', e => { if (e.target.dataset.p === 'blur') { o.blur = Number(e.target.value); pn.querySelector('[data-o="blur"]').textContent = e.target.value; if (node && choice === 'blur') { clearTimeout(tm); tm = setTimeout(() => { node.st.filters = {chain: [{t: 'gauss', r: o.blur}]}; c.refresh(); }, 120); } } });
        if (!c.selMask()) toast('Trace un rectangle autour de la personne (⬚), ou « ✂️ Détourer » directement pour toute la photo.');
    };

    /** 🔍 Agrandir ×2 / ×4 : l'image entière (calques compris, recadrée), une nouvelle version ou une copie */
    ext.rtPlus.upscale = async c => {
        c.busy('Préparation de l’image en pleine taille…'); await tick();
        let src; try { src = await c.renderFull(); } catch (err) { c.busy(''); return toast(err.message, 'error'); } finally { c.busy(''); }
        const W = src.width, H = src.height, ok = k => Math.max(W, H) * k <= MAX_SIDE && W * H * k * k <= MAX_PIXELS;
        const fmt = n => n.toLocaleString('fr-FR');
        const pn = panel(c, 'h-rt-uppanel', '🔍 Agrandir l’image', `${fmt(W)} × ${fmt(H)} points aujourd’hui`,
            `<div class="h-rt-upk">${[2, 4].map(k => `<label class="checkbox-line"><input type="radio" name="rt-upk" value="${k}" ${ok(k) ? '' : 'disabled'} ${k === 2 && ok(2) ? 'checked' : ''}> <span>×${k} → ${fmt(W * k)} × ${fmt(H * k)}</span></label>`).join('')}</div>
            ${!ok(2) ? `<p class="h-rt-upwarn">Cette image est déjà grande : l’agrandissement est limité à ${fmt(MAX_SIDE)} points de côté.</p>` : !ok(4) ? `<p class="muted">×4 donnerait plus de ${fmt(MAX_SIDE)} points de côté : seulement ×2.</p>` : ''}
            ${slider('sharp', 'Netteté des contours', 0, 100, 50, '', 'Renforce les contours sans faire de halo ; les aplats (ciel, peau) restent doux.')}
            <label class="checkbox-line" data-help="Avant d’agrandir, adoucit le grain et le bruit (les contours restent) : utile pour une photo scannée granuleuse."><input type="checkbox" data-up-grain> <span>Lissage du grain</span></label>
            <div class="h-rt-upprev"><canvas data-up-map title="Clique pour choisir l’endroit de l’aperçu"></canvas><figure><canvas data-up-before width="180" height="180"></canvas><figcaption>Avant (agrandi simplement)</figcaption></figure><figure><canvas data-up-after width="180" height="180"></canvas><figcaption>Après, à 100 %</figcaption></figure></div>
            <div class="h-rt-upprog" data-up-prog hidden><progress max="100" value="0"></progress> <output>0 %</output></div>
            <div class="h-rt-fxbtns h-rt-upbtns">${c.fresh ? '' : '<button type="button" class="button small" data-up-go="version" title="Une nouvelle version de la photo, affichée partout (l’original reste)">Agrandir → nouvelle version</button><button type="button" class="button small secondary" data-up-go="copy" title="Un autre média, rattaché aux mêmes fiches">→ copie séparée</button>'}${c.fresh ? '<button type="button" class="button small" data-up-go="copy">Agrandir → dans les médias</button>' : ''}<button type="button" class="button small secondary" data-up-go="download">⤓ Télécharger</button></div>
            <div class="h-rt-fxbtns"><span class="spacer"></span><button type="button" class="button small secondary" data-up-cancel>Fermer</button></div>
            <small class="muted">Agrandir ne retrouve pas les détails qui n’ont jamais été photographiés : l’image est plus grande et plus nette, pas plus précise.</small>`);
        const kOf = () => Number(pn.querySelector('input[name=rt-upk]:checked')?.value || 0), opt = () => ({sharp: Number(pn.querySelector('[data-p=sharp]').value) / 100, grain: pn.querySelector('[data-up-grain]').checked});
        const map = pn.querySelector('[data-up-map]'), mk = Math.min(1, 160 / Math.max(W, H)); map.width = Math.max(1, Math.round(W * mk)); map.height = Math.max(1, Math.round(H * mk));
        let cx = W / 2, cy = H / 2;
        const preview = () => {
            const mg = map.getContext('2d'); mg.drawImage(src, 0, 0, map.width, map.height);
            const k = kOf(); if (!k) return; const S = 180, sw = S / k; mg.strokeStyle = '#e33'; mg.lineWidth = 2; mg.strokeRect((cx - sw / 2) * mk, (cy - sw / 2) * mk, Math.max(3, sw * mk), Math.max(3, sw * mk));
            const r = upscaleCrop(src, k, cx, cy, S, opt()), off = 4 * k, sx = (cx - sw / 2 - r.x0) * k;
            const bg = pn.querySelector('[data-up-before]').getContext('2d'), ag = pn.querySelector('[data-up-after]').getContext('2d');
            bg.clearRect(0, 0, S, S); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'low'; bg.drawImage(src, cx - sw / 2, cy - sw / 2, sw, sw, 0, 0, S, S);
            ag.clearRect(0, 0, S, S); ag.drawImage(r.canvas, Math.max(0, sx || off), Math.max(0, (cy - sw / 2 - r.y0) * k), S, S, 0, 0, S, S);
        };
        map.addEventListener('click', e => { const rc = map.getBoundingClientRect(); cx = (e.clientX - rc.left) / rc.width * W; cy = (e.clientY - rc.top) / rc.height * H; preview(); });
        let tm = 0;
        pn.addEventListener('input', e => { if (e.target.dataset.p) pn.querySelector(`[data-o="${e.target.dataset.p}"]`).textContent = e.target.value; clearTimeout(tm); tm = setTimeout(preview, 120); });
        pn.addEventListener('change', () => { clearTimeout(tm); tm = setTimeout(preview, 60); });
        let job = null;
        pn.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-up-cancel')) { job?.cancel(); pn.remove(); return; }
            const go = b.dataset.upGo; if (!go || job) return;
            const k = kOf(); if (!k) return toast('Cette image est déjà trop grande pour être agrandie.', 'error');
            const prog = pn.querySelector('[data-up-prog]'), bar = prog.querySelector('progress'), out = prog.querySelector('output');
            prog.hidden = false; pn.querySelectorAll('[data-up-go]').forEach(x => { x.disabled = true; }); pn.querySelector('[data-up-cancel]').textContent = 'Arrêter';
            const t0 = performance.now();
            try {
                job = upscaleCanvas(src, k, opt(), p => { bar.value = Math.round(p * 100); out.textContent = Math.round(p * 100) + ' %'; });
                const big = await job.promise;
                out.textContent = 'Enregistrement…';
                const type = c.hasAlpha() ? 'image/png' : 'image/jpeg';
                const blob = await new Promise((res, rej) => big.toBlob(x => (x ? res(x) : rej(new Error('Image trop grande pour le navigateur.'))), type, 0.92));
                const name = `${String(c.title() || 'photo').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)} (x${k})`;
                if (go === 'download') { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.${type === 'image/png' ? 'png' : 'jpg'}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(`Image agrandie téléchargée (${fmt(big.width)} × ${fmt(big.height)}).`); }
                else if (c.fresh || go === 'copy') { const r = c.fresh ? await ext.rtUploadCopy(blob, {title: name}) : await ext.rtUploadCopy(blob, {mediaId: c.mediaId, title: name}); pn.dataset.saved = String(r?.media_id || r?.id || 1); toast(`Image agrandie ×${k} (${fmt(big.width)} × ${fmt(big.height)}) rangée dans les médias.`); }
                else { const fd = new FormData(); fd.append('file', blob, 'agrandie.' + (type === 'image/png' ? 'png' : 'jpg')); fd.append('media_id', c.mediaId); fd.append('mode', 'version'); fd.append('show', '1'); fd.append('csrf', A().state.csrf);
                    const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                    if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                    pn.dataset.saved = j.result?.filename || '1'; c.applyShown?.(j.result?.filename); toast(`Nouvelle version agrandie ×${k} (${fmt(big.width)} × ${fmt(big.height)}) affichée ; l’original reste dans les versions.`); }
                pn.dataset.size = `${big.width}x${big.height}`; pn.dataset.ms = String(Math.round(performance.now() - t0));
                out.textContent = '✓ Fait';
            } catch (err) { toast(err.message, 'error'); out.textContent = ''; }
            finally { job = null; pn.querySelectorAll('[data-up-go]').forEach(x => { x.disabled = false; }); const cb = pn.querySelector('[data-up-cancel]'); if (cb) cb.textContent = 'Fermer'; }
        });
        requestAnimationFrame(preview);
    };
})();
