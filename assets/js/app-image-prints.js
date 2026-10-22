/* LCNDA — 🔍 Empreintes d'images : le moteur commun de la recherche d'images semblables et des 👯 doublons d'images.
 * window.LCNDA_IMGPRINT (aussi require() dans Node). Tout se calcule sur cet ordinateur, rien n'est envoyé ailleurs.
 *
 * Une empreinte (fromPixels, sur l'image ramenée à 512 px de côté au plus) :
 *  - a, d, p : hachages perceptuels 64 bits (moyenne aHash, différences dHash, cosinus pHash) de l'image en gris ;
 *  - hist : 64 cases de couleurs (4 niveaux par canal), lum / sat : luminosité et saturation moyennes ;
 *  - kp : jusqu'à 128 points caractéristiques (coins FAST-9 sur 4 échelles, répartis sur l'image) avec un descripteur
 *    binaire BRIEF de 256 bits, pour reconnaître la même photo recadrée ou zoomée (appariement + RANSAC d'une
 *    homothétie : échelle et décalage, sans rotation).
 * compare(a, b) → {kind: identique | proche | recadree | ressemblante | null, sub, score 0–100, map, zone, n}.
 * search(q, liste), duplicates(liste) : la recherche inversée et les groupes de doublons. Mode d'emploi : docs/UI.md.
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else root.LCNDA_IMGPRINT = m;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const ALGO = 1, SIDE = 512, KP_BUDGET = [56, 44, 36, 24], KP_BYTES = 37, PATCH = 13, MARGIN = 16, TG = 48, TC = 16;

    /* ═════ petits outils ═════ */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function popcnt(v) { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
    const hexOf = (hi, lo) => (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
    const hexWords = h => [parseInt(String(h).slice(0, 8), 16) >>> 0, parseInt(String(h).slice(8, 16), 16) >>> 0];
    function ham64(x, y) { if (!x || !y) return 64; const a = hexWords(x), b = hexWords(y); return popcnt(a[0] ^ b[0]) + popcnt(a[1] ^ b[1]); }
    function bits64(arr) { let hi = 0, lo = 0; for (let i = 0; i < 64; i++) { if (!arr[i]) continue; if (i < 32) hi |= 1 << (31 - i); else lo |= 1 << (63 - i); } return hexOf(hi, lo); }
    function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
    function b64dec(s) { let bin = ''; try { bin = atob(String(s || '')); } catch (_) { bin = ''; } const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

    /** réduit une image en gris (moyenne des pixels couverts ; agrandit en bilinéaire) */
    function resample(src, sw, sh, dw, dh) {
        const pass = (inp, iw, ih, ow, horiz) => {
            const n = horiz ? iw : ih, m = horiz ? ow : ih, out = new Float32Array(horiz ? ow * ih : iw * ow), f = n / (horiz ? ow : ow);
            const rows = horiz ? ih : iw;
            for (let k = 0; k < (horiz ? ow : ow); k++) {
                const a = k * f, b = a + f;
                for (let r = 0; r < rows; r++) {
                    let s = 0;
                    if (f >= 1) { for (let i = Math.floor(a); i < Math.min(n, Math.ceil(b)); i++) { const w = Math.min(b, i + 1) - Math.max(a, i); s += (horiz ? inp[r * iw + i] : inp[i * iw + r]) * w; } s /= f; }
                    else { const c = clamp(a + f / 2 - .5, 0, n - 1), i0 = Math.floor(c), i1 = Math.min(n - 1, i0 + 1), t = c - i0; s = (horiz ? inp[r * iw + i0] * (1 - t) + inp[r * iw + i1] * t : inp[i0 * iw + r] * (1 - t) + inp[i1 * iw + r] * t); }
                    if (horiz) out[r * ow + k] = s; else out[k * iw + r] = s;
                }
            }
            return out;
        };
        const h1 = pass(src, sw, sh, dw, true);
        return pass(h1, dw, sh, dh, false);
    }
    /** flou (deux boîtes de 5) : le descripteur supporte la recompression et le changement de taille */
    function blur(src, w, h) {
        const tmp = new Float32Array(w * h), out = new Float32Array(w * h), r = 2;
        for (let pass = 0; pass < 2; pass++) {
            const inp = pass ? out.slice() : src;
            for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += inp[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * r + 1); s += inp[y * w + Math.min(w - 1, x + r + 1)] - inp[y * w + Math.max(0, x - r)]; } }
            for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
        }
        return out;
    }

    /* ═════ hachages perceptuels ═════ */
    const COS = (() => { const t = new Float32Array(8 * 32); for (let u = 0; u < 8; u++) for (let x = 0; x < 32; x++) t[u * 32 + x] = Math.cos((2 * x + 1) * u * Math.PI / 64); return t; })();
    function hashes(gray, w, h) {
        const g8 = resample(gray, w, h, 8, 8); let mean = 0; for (const v of g8) mean += v; mean /= 64;
        const a = bits64(Array.from(g8, v => v > mean));
        const g9 = resample(gray, w, h, 9, 8), db = [];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) db.push(g9[y * 9 + x] > g9[y * 9 + x + 1]);
        const g32 = resample(gray, w, h, 32, 32), R = new Float32Array(32 * 8), C = new Float32Array(64);
        for (let y = 0; y < 32; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 32; x++) s += g32[y * 32 + x] * COS[u * 32 + x]; R[y * 8 + u] = s; }
        for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let y = 0; y < 32; y++) s += R[y * 8 + u] * COS[v * 32 + y]; C[v * 8 + u] = s; }
        const ac = Array.from(C).slice(1).sort((x, y) => x - y), med = (ac[31] + ac[32]) / 2;
        return {a, d: bits64(db), p: bits64(Array.from(C, (v, i) => i > 0 && v > med))};
    }

    /* ═════ points caractéristiques : FAST-9 + BRIEF-256 ═════ */
    const CIRCLE = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];
    const PAIRS = (() => { // 256 paires fixes, tirées une fois pour toutes (graine fixe) selon une loi normale
        let s = 0x2545F491; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const g = () => clamp(Math.round(Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd()) * 31 / 5), -PATCH, PATCH);
        const p = new Int8Array(256 * 4); for (let i = 0; i < 256 * 4; i++) p[i] = g(); return p;
    })();
    function fast(img, w, h, t) {
        const off = CIRCLE.map(([dx, dy]) => dy * w + dx), score = new Float32Array(w * h), cand = [];
        const st = new Int8Array(16);
        for (let y = MARGIN; y < h - MARGIN; y++) for (let x = MARGIN; x < w - MARGIN; x++) {
            const i = y * w + x, c = img[i], hi = c + t, lo = c - t;
            let nb = 0, nd = 0;
            for (const k of [0, 4, 8, 12]) { const v = img[i + off[k]]; if (v > hi) nb++; else if (v < lo) nd++; }
            if (nb < 2 && nd < 2) continue;
            for (let k = 0; k < 16; k++) { const v = img[i + off[k]]; st[k] = v > hi ? 1 : v < lo ? -1 : 0; }
            let best = 0;
            for (const sgn of [1, -1]) { let run = 0; for (let k = 0; k < 25; k++) { if (st[k & 15] === sgn) { run++; if (run > best) best = run; } else run = 0; } }
            if (best < 9) continue;
            let s = 0; for (let k = 0; k < 16; k++) { const d = Math.abs(img[i + off[k]] - c) - t; if (d > 0) s += d; }
            score[i] = s; cand.push(i);
        }
        const out = [];
        for (const i of cand) { const s = score[i]; let ok = true; for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { if ((dx || dy) && score[i + dy * w + dx] > s) { ok = false; break; } } if (ok) out.push([i % w, (i / w) | 0, s]); }
        return out;
    }
    function keypoints(gray, w, h) {
        const kps = [];
        let lw = w, lh = h, img = gray;
        for (let l = 0; l < KP_BUDGET.length; l++) {
            if (l) { const nw = Math.max(1, Math.round(w / Math.pow(Math.SQRT2, l))), nh = Math.max(1, Math.round(h / Math.pow(Math.SQRT2, l))); img = resample(gray, w, h, nw, nh); lw = nw; lh = nh; }
            if (lw < 2 * MARGIN + 8 || lh < 2 * MARGIN + 8) break;
            let pts = [];
            for (const t of [18, 10, 6]) { pts = fast(img, lw, lh, t); if (pts.length >= KP_BUDGET[l] * 1.5) break; }
            if (!pts.length) continue;
            // répartis sur toute l'image : une grille 4 × 4, au plus deux fois la part de chaque case, puis les plus forts
            const budget = KP_BUDGET[l], G = 4, cap = Math.ceil(budget / (G * G) * 2), per = new Map(), keep = [], rest = [];
            pts.sort((p, q) => q[2] - p[2]);
            for (const p of pts) { const cell = Math.min(G - 1, (p[0] * G / lw) | 0) * G + Math.min(G - 1, (p[1] * G / lh) | 0), n = per.get(cell) || 0; if (n < cap) { per.set(cell, n + 1); keep.push(p); } else rest.push(p); }
            const chosen = keep.slice(0, budget); if (chosen.length < budget) chosen.push(...rest.slice(0, budget - chosen.length));
            const sm = blur(img, lw, lh), sx = w / lw, sy = h / lh;
            for (const [x, y] of chosen) {
                const d = new Uint32Array(8);
                for (let b = 0; b < 256; b++) { const q = b * 4; if (sm[(y + PAIRS[q + 1]) * lw + x + PAIRS[q]] < sm[(y + PAIRS[q + 3]) * lw + x + PAIRS[q + 2]]) d[b >> 5] |= 1 << (b & 31); }
                kps.push({x: (x + .5) * sx, y: (y + .5) * sy, l, d});
            }
        }
        return kps;
    }
    function packKp(kps) {
        const u = new Uint8Array(kps.length * KP_BYTES), dv = new DataView(u.buffer);
        kps.forEach((k, i) => { const o = i * KP_BYTES; dv.setUint16(o, Math.round(clamp(k.x, 0, 1300) * 50), true); dv.setUint16(o + 2, Math.round(clamp(k.y, 0, 1300) * 50), true); u[o + 4] = k.l; for (let j = 0; j < 8; j++) dv.setUint32(o + 5 + j * 4, k.d[j], true); });
        return b64enc(u);
    }
    function unpackKp(s) {
        const u = b64dec(s), n = Math.floor(u.length / KP_BYTES), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), xy = new Float32Array(n * 2), desc = new Uint32Array(n * 8), lv = new Uint8Array(n);
        for (let i = 0; i < n; i++) { const o = i * KP_BYTES; xy[i * 2] = dv.getUint16(o, true) / 50; xy[i * 2 + 1] = dv.getUint16(o + 2, true) / 50; lv[i] = u[o + 4]; for (let j = 0; j < 8; j++) desc[i * 8 + j] = dv.getUint32(o + 5 + j * 4, true); }
        return {n, xy, desc, lv};
    }

    /* ═════ l'empreinte d'une image ═════ */
    /** rgba : pixels RVBA (Uint8ClampedArray) de l'image déjà ramenée à SIDE px au plus ; orig : {w, h} taille d'origine */
    function fromPixels(rgba, w, h, orig = {}) {
        const n = w * h, gray = new Float32Array(n), hist = new Float64Array(64), ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
        let lum = 0, sat = 0, tot = 0;
        for (let i = 0; i < n; i++) {
            const a = rgba[i * 4 + 3] / 255, r = rgba[i * 4] * a + 255 * (1 - a), g = rgba[i * 4 + 1] * a + 255 * (1 - a), b = rgba[i * 4 + 2] * a + 255 * (1 - a);
            const v = .299 * r + .587 * g + .114 * b; gray[i] = v; lum += v; ch[0][i] = r; ch[1][i] = g; ch[2][i] = b;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx ? (mx - mn) / mx * 255 : 0;
            hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)] += 1; tot++;
        }
        const hb = new Uint8Array(64); for (let i = 0; i < 64; i++) hb[i] = Math.round(hist[i] / (tot || 1) * 255);
        // petites vignettes pour vérifier une correspondance : gris 48 × 48, couleurs 16 × 16
        const gt = Uint8Array.from(resample(gray, w, h, TG, TG), v => clamp(Math.round(v), 0, 255));
        const cs = ch.map(c => resample(c, w, h, TC, TC)), ct = new Uint8Array(TC * TC * 3);
        for (let i = 0; i < TC * TC; i++) for (let k = 0; k < 3; k++) ct[i * 3 + k] = clamp(Math.round(cs[k][i]), 0, 255);
        const hs = hashes(gray, w, h), kps = keypoints(gray, w, h);
        return {nw: w, nh: h, w: orig.w || w, h: orig.h || h, ...hs, hist: b64enc(hb), lum: Math.round(lum / (n || 1) * 10) / 10, sat: Math.round(sat / (n || 1) * 10) / 10, g: b64enc(gt), c: b64enc(ct), kp: packKp(kps)};
    }
    /** la taille de travail : 512 px pour le plus grand côté (une petite image est agrandie) */
    function workSize(w, h) { const s = SIDE / Math.max(1, w, h); return {w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s))}; }

    /** prépare une empreinte rangée (texte) pour comparer vite : mots, points, couleurs */
    function prepare(item) {
        if (!item || item._prep) return item;
        const p = item.print || item;
        const g = b64dec(p.g || ''), c = b64dec(p.c || '');
        const P = {a: p.a, d: p.d, p: p.p, hist: b64dec(p.hist), lum: Number(p.lum) || 0, sat: Number(p.sat) || 0, nw: Number(p.nw) || 1, nh: Number(p.nh) || 1, kp: unpackKp(p.kp || ''),
            g: g.length === TG * TG ? Float32Array.from(g) : null, c: c.length === TC * TC * 3 ? c : null, mono: true};
        if (P.c) { // une photo en noir et blanc ou en sépia : sa teinte ne change presque pas
            let m1 = 0, m2 = 0, q1 = 0, q2 = 0; const N = TC * TC;
            for (let i = 0; i < N; i++) { const r = P.c[i * 3], gg = P.c[i * 3 + 1], b = P.c[i * 3 + 2], x = r - gg, y = (r + gg) / 2 - b; m1 += x; m2 += y; q1 += x * x; q2 += y * y; }
            m1 /= N; m2 /= N; P.mono = Math.sqrt(Math.max(0, q1 / N - m1 * m1)) < 9 && Math.sqrt(Math.max(0, q2 / N - m2 * m2)) < 9;
            P.neutral = P.mono && Math.abs(m1) < 10 && Math.abs(m2) < 10; // noir et blanc (gris)
        }
        item._prep = P;
        return item;
    }
    const bil = (T, S, fx, fy, k = 0, ch = 1) => { const x = clamp(fx * S - .5, 0, S - 1), y = clamp(fy * S - .5, 0, S - 1), x0 = x | 0, y0 = y | 0, x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1), u = x - x0, v = y - y0, at = (xx, yy) => T[(yy * S + xx) * ch + k]; return at(x0, y0) * (1 - u) * (1 - v) + at(x1, y0) * u * (1 - v) + at(x0, y1) * (1 - u) * v + at(x1, y1) * u * v; };
    /** vérifie une correspondance (pa = s · pb + t) sur les petites vignettes : forme (corrélation des gris, insensible à la
     *  luminosité et au contraste) et couleurs (écart de teinte) ; rend {ok, ncc, col, mono} */
    function verify(A, B, s, tx, ty) {
        if (!A.g || !B.g) return {ok: true, ncc: .9, col: 0, mono: true, unknown: true};
        const N = 12, va = [], vb = [], grid = [];
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            let sa = 0, sb = 0, ok = true;
            for (const [di, dj] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) {
                const u = (i + di) / N, v = (j + dj) / N, xa = (s * u * B.nw + tx) / A.nw, ya = (s * v * B.nh + ty) / A.nh;
                if (xa < 0 || xa > 1 || ya < 0 || ya > 1) { ok = false; break; }
                sa += bil(A.g, TG, xa, ya); sb += bil(B.g, TG, u, v);
            }
            if (ok) { va.push(sa / 4); vb.push(sb / 4); grid.push(j * N + i); } else grid.push(-1);
        }
        if (va.length < 24) return {ok: false, ncc: 0, det: 0, col: 0, mono: A.mono || B.mono};
        // les détails (chaque case moins ses voisines) : un dégradé lisse n'en a pas, une vraie photo si
        const da = [], db = [], at = new Map(); grid.forEach((g, k) => { if (g >= 0) at.set(g, at.size); });
        for (const [g, k] of at) { const i = g % N, j = (g / N) | 0, nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && at.has(y * N + x)).map(([x, y]) => at.get(y * N + x)); if (nb.length < 3) continue; let ma = 0, mb = 0; for (const q of nb) { ma += va[q]; mb += vb[q]; } da.push(va[k] - ma / nb.length); db.push(vb[k] - mb / nb.length); }
        let dab = 0, daa = 0, dbb = 0; for (let k = 0; k < da.length; k++) { dab += da[k] * db[k]; daa += da[k] * da[k]; dbb += db[k] * db[k]; }
        const flat = Math.sqrt(daa / (da.length || 1)) < 1.2 || Math.sqrt(dbb / (db.length || 1)) < 1.2, det = flat || da.length < 16 ? 0 : dab / (Math.sqrt(daa * dbb) || 1);
        const m = arr => arr.reduce((x, y) => x + y, 0) / arr.length, ma = m(va), mb = m(vb);
        let sab = 0, saa = 0, sbb = 0; for (let k = 0; k < va.length; k++) { const x = va[k] - ma, y = vb[k] - mb; sab += x * y; saa += x * x; sbb += y * y; }
        const sda = Math.sqrt(saa / va.length), sdb = Math.sqrt(sbb / vb.length);
        const ncc = sda < 4 && sdb < 4 ? (Math.abs(ma - mb) < 30 ? .9 : 0) : sab / (Math.sqrt(saa * sbb) || 1);
        let col = 0, nc = 0;
        if (A.c && B.c) for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
            const u = (i + .5) / 8, v = (j + .5) / 8, xa = (s * u * B.nw + tx) / A.nw, ya = (s * v * B.nh + ty) / A.nh;
            if (xa < 0 || xa > 1 || ya < 0 || ya > 1) continue;
            const ca = [0, 1, 2].map(k => bil(A.c, TC, xa, ya, k, 3)), cb = [0, 1, 2].map(k => bil(B.c, TC, u, v, k, 3));
            col += (Math.abs((ca[0] - ca[1]) - (cb[0] - cb[1])) + Math.abs(((ca[0] + ca[1]) / 2 - ca[2]) - ((cb[0] + cb[1]) / 2 - cb[2]))) / 2; nc++;
        }
        return {ok: true, ncc, det, flat, col: nc ? col / nc : 0, mono: A.mono || B.mono, toned: A.mono !== B.mono || !!(A.neutral || B.neutral), both: A.mono && B.mono};
    }
    function histInter(a, b) { let s = 0; for (let i = 0; i < 64; i++) s += Math.min(a[i] || 0, b[i] || 0); return s / 255; }

    /** appariement des points de b vers a (test du rapport) puis RANSAC : pa = s · pb + t */
    function geometry(A, B) {
        const ka = A.kp, kb = B.kp; if (ka.n < 6 || kb.n < 6) return null;
        const da = ka.desc, db = kb.desc, M = [];
        for (let j = 0; j < kb.n; j++) {
            let b1 = 999, b2 = 999, bi = -1; const o = j * 8;
            for (let i = 0; i < ka.n; i++) { const q = i * 8; let d = 0; for (let w = 0; w < 8 && d < b2; w++) d += popcnt(da[q + w] ^ db[o + w]); if (d < b1) { b2 = b1; b1 = d; bi = i; } else if (d < b2) b2 = d; }
            if (bi >= 0 && b1 <= 64 && b1 < .86 * b2) M.push([bi, j, b1]);
        }
        if (M.length < 4) return {n: 0, matches: M.length};
        const P = M.map(([i, j]) => [ka.xy[i * 2], ka.xy[i * 2 + 1], kb.xy[j * 2], kb.xy[j * 2 + 1], i]);
        const tol = 8;
        const inl = (s, tx, ty) => { const used = new Set(), list = []; for (const p of P) { const ex = s * p[2] + tx - p[0], ey = s * p[3] + ty - p[1]; if (ex * ex + ey * ey <= tol * tol && !used.has(p[4])) { used.add(p[4]); list.push(p); } } return list; };
        let best = null, bestN = 0;
        const tries = [];
        if (P.length <= 45) { for (let i = 0; i < P.length; i++) for (let k = i + 1; k < P.length; k++) tries.push([i, k]); }
        else { let s = 12345; const r = n => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; }; for (let t = 0; t < 900; t++) { const i = r(P.length), k = r(P.length); if (i !== k) tries.push([i, k]); } }
        for (const [i, k] of tries) {
            const p = P[i], q = P[k], bx = q[2] - p[2], by = q[3] - p[3], ax = q[0] - p[0], ay = q[1] - p[1], lb = Math.hypot(bx, by), la = Math.hypot(ax, ay);
            if (lb < 12 || la < 6) continue;
            const s = la / lb; if (s < .2 || s > 5) continue;
            if ((ax * bx + ay * by) / (la * lb) < .97) continue; // pas de rotation
            const tx = p[0] - s * p[2], ty = p[1] - s * p[3], n = inl(s, tx, ty).length;
            if (n > bestN) { bestN = n; best = [s, tx, ty]; }
        }
        if (!best || bestN < 4) return {n: 0, matches: M.length};
        // affiner (moindres carrés sur les bons points)
        let list = inl(...best);
        for (let it = 0; it < 2 && list.length >= 3; it++) {
            let mx = 0, my = 0, nx = 0, ny = 0; for (const p of list) { mx += p[0]; my += p[1]; nx += p[2]; ny += p[3]; }
            mx /= list.length; my /= list.length; nx /= list.length; ny /= list.length;
            let num = 0, den = 0; for (const p of list) { num += (p[2] - nx) * (p[0] - mx) + (p[3] - ny) * (p[1] - my); den += (p[2] - nx) ** 2 + (p[3] - ny) ** 2; }
            if (den <= 0) break;
            const s = num / den; if (s < .2 || s > 5) break;
            const cand = [s, mx - s * nx, my - s * ny], l2 = inl(...cand);
            if (l2.length >= list.length) { best = cand; list = l2; } else break;
        }
        return {n: list.length, matches: M.length, ...cover(A, B, best[0], best[1], best[2])};
    }
    /** où tombe b dans a, pour pa = s · pb + t : part de a couverte (covA), part de b visible (covB), la zone sur a */
    function cover(A, B, s, tx, ty) {
        const x0 = tx, y0 = ty, x1 = tx + s * B.nw, y1 = ty + s * B.nh;
        const ix = Math.max(0, Math.min(A.nw, x1) - Math.max(0, x0)), iy = Math.max(0, Math.min(A.nh, y1) - Math.max(0, y0)), inter = ix * iy;
        return {s, tx, ty, covA: inter / (A.nw * A.nh), covB: inter / ((x1 - x0) * (y1 - y0) || 1),
            zone: {x: clamp(x0 / A.nw, 0, 1), y: clamp(y0 / A.nh, 0, 1), w: clamp(Math.min(A.nw, x1) / A.nw, 0, 1) - clamp(x0 / A.nw, 0, 1), h: clamp(Math.min(A.nh, y1) / A.nh, 0, 1) - clamp(y0 / A.nh, 0, 1)}};
    }
    /** les points dans les deux sens (b dans a, puis a dans b) : on garde le meilleur, toujours écrit pa = s · pb + t */
    function bestGeometry(A, B) {
        const g1 = geometry(A, B);
        if (g1 && g1.n >= 12) return g1;
        const g2 = geometry(B, A);
        if (g2 && g2.n && (!g1 || g2.n > g1.n)) return {n: g2.n, matches: g2.matches, rev: true, ...cover(A, B, 1 / g2.s, -g2.tx / g2.s, -g2.ty / g2.s)};
        return g1;
    }

    const KINDS = {
        identique: {label: 'Identique', icon: '＝', badge: 'green'},
        proche: {label: 'Très proche', icon: '≈', badge: 'blue'},
        recadree: {label: 'Recadrée / zoomée', icon: '⬚', badge: 'yellow'},
        ressemblante: {label: 'Ressemblante', icon: '～', badge: 'grey'},
    };
    const SUBS = {parfait: 'même fichier', format: 'autre format', taille: 'redimensionnée', retouche: 'retouchée', recompresse: 'ré-enregistrée', zoom: 'zoomée', recadre: 'recadrée', partiel: 'en partie la même', prise: 'autre prise', couleurs: 'autres couleurs'};
    const sameExt = (x, y) => { const n = e => String(e || '').toLowerCase().replace('jpeg', 'jpg').replace('tiff', 'tif'); return n(x) === n(y); };

    /**
     * Compare deux photos (objets {print, sha1, w, h, ext}). sens : sensibilité 0–1 (0,5 par défaut).
     * Rend {kind, sub, score, map (coordonnées de b → a), zone (où est b dans a, ou a dans b si part = 'a_in_b'), part, n}.
     * Une correspondance trouvée (hachages ou points) est toujours vérifiée sur les petites vignettes (forme, couleurs).
     */
    function compare(a, b, o = {}) {
        prepare(a); prepare(b);
        const A = a._prep, B = b._prep, sens = clamp(o.sens ?? .5, 0, 1);
        const idMap = {s: A.nw / B.nw, tx: 0, ty: 0, ow: B.nw, oh: B.nh, kw: A.nw, kh: A.nh};
        if (a.sha1 && a.sha1 === b.sha1) return {kind: 'identique', sub: 'parfait', score: 100, map: idMap, n: 0};
        const dp = ham64(A.p, B.p), dd = ham64(A.d, B.d), hi = histInter(A.hist, B.hist), dl = Math.abs(A.lum - B.lum);
        const arA = (a.w || A.nw) / (a.h || A.nh), arB = (b.w || B.nw) / (b.h || B.nh), sameAspect = Math.abs(Math.log(arA / arB)) < .035;
        const subOf = () => !sameExt(a.ext, b.ext) ? 'format' : (Math.abs((a.w || 0) - (b.w || 0)) > .02 * Math.max(a.w || 1, b.w || 1) ? 'taille' : (dp > 3 || dl > 5 || hi < .85 ? 'retouche' : 'recompresse'));
        // les couleurs : un écart est permis entre une version en couleurs et une en noir et blanc ou en sépia, pas entre deux teintes franches
        const colorOk = v => v.unknown || v.col <= 38 || v.toned || (v.both && v.col <= 60);
        const out = r => ({n: 0, dp, dd, ...r});
        let g = null; const geo = () => (g === null ? (g = o.global ? false : bestGeometry(A, B) || false) : g);
        // une autre prise (rafale, deux appareils côte à côte) : même échelle, mais tout est décalé
        const otherShot = x => x && x.n >= 10 && Math.abs(x.s * B.nw / A.nw - 1) < .06 && Math.hypot(x.tx / A.nw, x.ty / A.nh) > .025;
        // 1. le même cadrage (hachages perceptuels proches)
        if (sameAspect && dp <= 4 + 6 * sens && dd <= 8 + 10 * sens) {
            const v = verify(A, B, idMap.s, 0, 0);
            if (v.ok && v.ncc >= .75 && v.det >= .8) {
                if (!colorOk(v)) return out({kind: 'ressemblante', sub: 'couleurs', score: 55});
                if (dp > 2 && otherShot(geo())) return out({kind: 'ressemblante', sub: 'prise', score: Math.round(60 + 10 * Math.min(1, g.n / 40)), n: g.n});
                return out({kind: 'proche', sub: subOf(), score: Math.round(clamp(100 - 1.4 * dp - .5 * dd - 8 * (1 - hi) - 25 * (1 - v.det), 80, 99)), map: idMap});
            }
        }
        // 2. les points caractéristiques (recadrée, zoomée…), confirmés sur les vignettes
        const kmin = Math.round(16 - 9 * sens);
        if (geo() && g.n >= 4) {
            const v = verify(A, B, g.s, g.tx, g.ty);
            // peu de points (photo très agrandie, floue) : seulement si les vignettes se ressemblent presque parfaitement, sur une zone assez grande
            if ((g.n >= kmin && v.ok && v.ncc >= .6 && v.det >= .75) || (v.ok && g.n >= 5 && v.ncc >= .95 && v.det >= .9 && Math.min(g.covA, g.covB) >= .06)) {
                const map = {s: g.s, tx: g.tx, ty: g.ty, ow: B.nw, oh: B.nh, kw: A.nw, kh: A.nh}, conf = clamp(Math.min(1, g.n / 30) * .5 + clamp((v.det - .75) / .23, 0, 1) * .5, 0, 1);
                if (!colorOk(v)) return out({kind: 'ressemblante', sub: 'couleurs', score: 52, map, zone: g.zone, n: g.n});
                if (g.covA >= .85 && g.covB >= .85) {
                    if (otherShot(g) && g.covA < .97) return out({kind: 'ressemblante', sub: 'prise', score: Math.round(60 + 10 * conf), map, n: g.n});
                    return out({kind: 'proche', sub: subOf() === 'recompresse' ? 'retouche' : subOf(), score: Math.round(78 + 17 * conf), map, n: g.n});
                }
                if (g.covB >= .8) return out({kind: 'recadree', sub: g.covA < .36 ? 'zoom' : 'recadre', part: 'b_in_a', score: Math.round(68 + 26 * conf - (g.covA < .12 ? 8 : 0)), map, zone: g.zone, cover: g.covA, n: g.n});
                if (g.covA >= .8) { // a est un morceau de b : la zone est donnée sur b
                    const zi = {x: clamp(-g.tx / g.s / B.nw, 0, 1), y: clamp(-g.ty / g.s / B.nh, 0, 1)}; zi.w = clamp(A.nw / g.s / B.nw, 0, 1 - zi.x); zi.h = clamp(A.nh / g.s / B.nh, 0, 1 - zi.y);
                    return out({kind: 'recadree', sub: g.covB < .36 ? 'zoom' : 'recadre', part: 'a_in_b', score: Math.round(68 + 26 * conf - (g.covB < .12 ? 8 : 0)), map, zone: zi, cover: g.covB, n: g.n});
                }
                return out({kind: 'ressemblante', sub: 'partiel', score: Math.round(52 + 18 * conf), map, zone: g.zone, n: g.n});
            }
        }
        // 3. seulement des airs de famille
        if (dp <= 12 + 6 * sens || (hi >= .9 && dp <= 18)) return out({kind: 'ressemblante', sub: '', score: Math.round(clamp(72 - 2.2 * dp + 10 * (hi - .7), 25, 70)), n: g ? g.n : 0});
        return out({kind: null, sub: '', score: Math.round(clamp(40 - dp, 0, 30)), n: g ? g.n : 0});
    }

    /* ═════ index des descripteurs (recherche dans une grande base) ═════ */
    function buildIndex(list) {
        const map = new Map();
        list.forEach((it, idx) => { prepare(it); const k = it._prep.kp; for (let i = 0; i < k.n; i++) for (let t = 0; t < 4; t++) { const key = t * 65536 + (k.desc[i * 8 + t * 2] & 0xffff); let arr = map.get(key); if (!arr) map.set(key, arr = []); if (arr[arr.length - 1] !== idx) arr.push(idx); } });
        return map;
    }
    function coHits(q, index, size) {
        const hits = new Uint16Array(size), k = q._prep.kp;
        for (let i = 0; i < k.n; i++) for (let t = 0; t < 4; t++) { const arr = index.get(t * 65536 + (k.desc[i * 8 + t * 2] & 0xffff)); if (!arr || arr.length > Math.max(40, size / 8)) continue; for (const j of arr) hits[j]++; }
        return hits;
    }
    const tick = () => new Promise(r => setTimeout(r, 0));

    /** recherche inversée : q contre toute la liste → [{item, ...compare}] du plus ressemblant au moins ressemblant */
    async function search(q, list, {sens = .6, min = 30, exclude = null, onProgress = null} = {}) {
        prepare(q);
        const pool = list.filter(it => it && it !== q && (exclude == null || Number(it.id) !== Number(exclude)));
        let deep = new Set(pool.map((_, i) => i));
        if (pool.length > 600) { // grande base : les points en commun d'abord, puis les 250 meilleures
            const idx = buildIndex(pool), hits = coHits(q, idx, pool.length);
            deep = new Set([...hits.keys()].filter(i => hits[i] >= 2).sort((x, y) => hits[y] - hits[x]).slice(0, 250));
        }
        const out = [];
        for (let i = 0; i < pool.length; i++) {
            const r = compare(pool[i], q, {sens, global: !deep.has(i)});
            if (r.kind && r.score >= min) out.push({item: pool[i], ...r});
            if (i % 40 === 39) { onProgress?.(i + 1, pool.length); await tick(); }
        }
        const rank = {identique: 0, proche: 1, recadree: 2, ressemblante: 3};
        return out.sort((x, y) => rank[x.kind] - rank[y.kind] || y.score - x.score);
    }

    const DUP_KINDS = ['identique', 'proche', 'recadree'];
    /** la catégorie d'une paire de doublons (filtres de la fenêtre 👯) */
    function dupCat(r) { return r.kind === 'identique' ? 'parfaits' : r.kind === 'recadree' ? 'recadres' : r.sub === 'format' ? 'format' : r.sub === 'taille' ? 'taille' : 'retouches'; }

    /**
     * Les groupes de doublons d'une liste : [{items: [..], pairs: [{a, b, r}], cats: Set, best}]
     * dismissed : Set de « a:b » (a < b) à ne plus proposer ; sens : sensibilité 0–1.
     */
    async function duplicates(list, {sens = .5, dismissed = new Set(), onProgress = null} = {}) {
        list.forEach(prepare);
        const n = list.length, cand = new Map(), key = (i, j) => i < j ? i * n + j : j * n + i;
        const pid = (i, j) => { const x = Number(list[i].id), y = Number(list[j].id); return x < y ? `${x}:${y}` : `${y}:${x}`; };
        const W = list.map(it => [...hexWords(it._prep.p), ...hexWords(it._prep.d)]);
        const dpMax = 4 + 6 * sens + 6, ddMax = 8 + 10 * sens + 6;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (list[i].sha1 && list[i].sha1 === list[j].sha1) { cand.set(key(i, j), [i, j]); continue; }
                const dp = popcnt(W[i][0] ^ W[j][0]) + popcnt(W[i][1] ^ W[j][1]); if (dp > dpMax) continue;
                if (popcnt(W[i][2] ^ W[j][2]) + popcnt(W[i][3] ^ W[j][3]) <= ddMax) cand.set(key(i, j), [i, j]);
            }
            if (i % 200 === 199) await tick();
        }
        const idx = buildIndex(list);
        for (let i = 0; i < n; i++) {
            const hits = coHits(list[i], idx, n);
            const top = [...hits.keys()].filter(j => j !== i && hits[j] >= 3).sort((x, y) => hits[y] - hits[x]).slice(0, 12);
            for (const j of top) cand.set(key(i, j), i < j ? [i, j] : [j, i]);
            if (i % 50 === 49) { onProgress?.(i + 1, n * 2); await tick(); }
        }
        const parent = list.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
        const pairs = []; let c = 0;
        for (const [i, j] of cand.values()) {
            if (dismissed.has(pid(i, j))) continue;
            // la plus grande en premier : la zone est donnée sur elle
            const [x, y] = (list[i].w * list[i].h >= list[j].w * list[j].h) ? [i, j] : [j, i];
            const r = compare(list[x], list[y], {sens});
            if (r.kind && DUP_KINDS.includes(r.kind)) { pairs.push({a: x, b: y, r}); parent[find(x)] = find(y); }
            if (++c % 30 === 0) { onProgress?.(n + Math.round(c / cand.size * n), n * 2); await tick(); }
        }
        const groups = new Map();
        pairs.forEach(p => { const g = find(p.a); if (!groups.has(g)) groups.set(g, {members: new Set(), pairs: []}); const G = groups.get(g); G.members.add(p.a); G.members.add(p.b); G.pairs.push(p); });
        const out = [...groups.values()].map(G => {
            const items = [...G.members].map(i => list[i]);
            const best = items.slice().sort((p, q) => (q.w * q.h) - (p.w * p.h) || (Number(q.links?.n) || 0) - (Number(p.links?.n) || 0) || Number(p.id) - Number(q.id))[0];
            return {items, pairs: G.pairs.map(p => ({a: list[p.a], b: list[p.b], r: p.r})), cats: new Set(G.pairs.map(p => dupCat(p.r))), best};
        });
        onProgress?.(n * 2, n * 2);
        const prio = g => g.cats.has('recadres') ? 3 : g.cats.has('retouches') || g.cats.has('format') || g.cats.has('taille') ? 2 : 1;
        return out.sort((x, y) => y.items.length - x.items.length || prio(x) - prio(y));
    }

    return {ALGO, SIDE, KINDS, SUBS, workSize, fromPixels, prepare, compare, geometry, bestGeometry, verify, search, duplicates, dupCat, ham64, histInter, b64enc, b64dec, unpackKp};
});
