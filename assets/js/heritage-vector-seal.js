/* LCNDA — 🔤 Calligraphie et sceaux : la signature d'un ancêtre détourée sur l'image d'un acte (le papier, les taches et les
 * lignes s'effacent, l'encre devient des tracés vectoriels nets) ; des monogrammes (initiales entrelacées), des cachets de cire,
 * des tampons et des ex-libris, avec une légende qui tourne autour. Tout s'ouvre dans le dessin vectoriel pour être retouché,
 * puis imprimé, exporté ou rangé dans les médias d'une fiche. Listes → Outils de modification → « 🔤 Signatures et sceaux ».
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;
    let seq = 0; const uid = () => 's' + Date.now().toString(36) + (++seq).toString(36);

    const INKS = [['#1b1a2e', 'Encre noire'], ['#4a2e1a', 'Sépia (encre ferro-gallique)'], ['#1f3a7a', 'Encre bleue'], ['#6b1a1a', 'Encre rouge'], ['orig', 'Couleur d’origine']];

    /* ═════════ ✍️ La signature : l'encre séparée du papier ═════════ */
    // le seuil d'Otsu : la valeur qui sépare le mieux l'encre (foncée) du papier (clair)
    function otsu(v) {
        const h = new Array(256).fill(0); v.forEach(x => h[x]++);
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
        let sB = 0, wB = 0, best = 0, thr = 128; const tot = v.length;
        for (let i = 0; i < 256; i++) { wB += h[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += i * h[i]; const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) ** 2; if (b > best) { best = b; thr = i; } }
        return thr;
    }
    /** l'image recadrée → niveaux de gris « aplatis » (le fond du papier, taché ou jauni, ramené au blanc) */
    function flatten(img, crop) {
        const k = clamp(900 / Math.max(crop.w, crop.h), .5, 4), W = Math.max(8, Math.round(crop.w * k)), H = Math.max(8, Math.round(crop.h * k));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true});
        g.imageSmoothingQuality = 'high'; g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
        const px = g.getImageData(0, 0, W, H).data;
        // le fond : l'image réduite fortement puis agrandie (l'encre, fine, disparaît ; le papier reste)
        const s = document.createElement('canvas'), sw = Math.max(2, Math.round(W / 24)), sh = Math.max(2, Math.round(H / 24)); s.width = sw; s.height = sh;
        const sg = s.getContext('2d', {willReadFrequently: true}); sg.imageSmoothingQuality = 'high'; sg.filter = 'blur(1px)'; sg.drawImage(c, 0, 0, sw, sh);
        const b = document.createElement('canvas'); b.width = W; b.height = H; const bg = b.getContext('2d', {willReadFrequently: true}); bg.imageSmoothingQuality = 'high'; bg.drawImage(s, 0, 0, W, H);
        const bp = bg.getImageData(0, 0, W, H).data, gray = new Uint8Array(W * H), rgb = new Uint8ClampedArray(W * H * 3);
        for (let i = 0; i < W * H; i++) {
            const l = .299 * px[i * 4] + .587 * px[i * 4 + 1] + .114 * px[i * 4 + 2], lb = Math.max(40, .299 * bp[i * 4] + .587 * bp[i * 4 + 1] + .114 * bp[i * 4 + 2]);
            gray[i] = clamp(Math.round(l / lb * 255), 0, 255); rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2];
        }
        return {W, H, gray, rgb, k};
    }
    /** le masque de l'encre : seuil, petites taches enlevées, traits épaissis ou affinés */
    function inkMask(f, {thr, speck = 12, grow = 0, lines = false}) {
        const {W, H, gray} = f, n = W * H; let m = new Uint8Array(n);
        for (let i = 0; i < n; i++) m[i] = gray[i] < thr ? 1 : 0;
        // les lignes réglées du registre : une rangée presque entièrement foncée, très longue et fine
        // (une rangée où l'encre couvre plus du tiers de la largeur, même coupée par la signature) ; on garde ce qui la traverse
        if (lines) { const dense = new Uint8Array(H); for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += m[y * W + x]; dense[y] = c > W * .35 ? 1 : 0; }
            const near = (y, d) => { for (let k = 1; k <= 5; k++) { const yy = y + d * k; if (yy < 0 || yy >= H) return -1; if (!dense[yy]) return yy; } return -1; }, src = m.slice();
            for (let y = 0; y < H; y++) if (dense[y]) { const ya = near(y, -1), yb = near(y, 1); for (let x = 0; x < W; x++) if (!(ya >= 0 && yb >= 0 && src[ya * W + x] && src[yb * W + x])) m[y * W + x] = 0; } }
        // les taches isolées (poussière, moisissure, points du papier) : composantes trop petites
        const lab = new Int32Array(n), stack = []; let id = 0;
        for (let i = 0; i < n; i++) {
            if (!m[i] || lab[i]) continue; id++; const pts = [i]; lab[i] = id; stack.length = 0; stack.push(i);
            while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (m[q] && !lab[q]) { lab[q] = id; stack.push(q); pts.push(q); } } }
            if (pts.length < speck * f.k) pts.forEach(p => { m[p] = 0; });
        }
        for (let r = 0; r < Math.abs(grow); r++) { const o = new Uint8Array(n), on = grow > 0 ? 1 : 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let v = m[i]; if (v !== on) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && m[yy * W + xx] === on) { v = on; break; } } o[i] = v; } m = o; }
        return m;
    }
    const avgInk = (f, m) => { let r = 0, g = 0, b = 0, c = 0; for (let i = 0; i < m.length; i++) if (m[i]) { r += f.rgb[i * 3]; g += f.rgb[i * 3 + 1]; b += f.rgb[i * 3 + 2]; c++; } if (!c) return '#1b1a2e'; const h = v => Math.round(v / c * .8).toString(16).padStart(2, '0'); return `#${h(r)}${h(g)}${h(b)}`; };
    function maskCanvas(f, m, color) {
        const c = document.createElement('canvas'); c.width = f.W; c.height = f.H; const g = c.getContext('2d'), d = g.createImageData(f.W, f.H);
        const rgb = color === 'orig' ? null : [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16));
        for (let i = 0; i < m.length; i++) if (m[i]) { d.data[i * 4] = rgb ? rgb[0] : f.rgb[i * 3]; d.data[i * 4 + 1] = rgb ? rgb[1] : f.rgb[i * 3 + 1]; d.data[i * 4 + 2] = rgb ? rgb[2] : f.rgb[i * 3 + 2]; d.data[i * 4 + 3] = 255; }
        g.putImageData(d, 0, 0); return c;
    }
    /** le masque → des tracés vectoriels (l'outil Vectoriser du dessin) → un document */
    async function signatureDoc(f, m, {ink, caption, name}) {
        const V = ext.vectorInternals; if (!V?.vectorizeImage) throw new Error('Le dessin vectoriel n’est pas chargé.');
        const c = document.createElement('canvas'); c.width = f.W + 8; c.height = f.H + 8; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(maskCanvas(f, m, '#000000'), 4, 4);
        const r = await V.vectorizeImage(c.toDataURL('image/png'), {threshold: 128, eps: .8, smooth: true, maxSize: 1600});
        if (!r.layers.length) throw new Error('Aucune encre trouvée : baisse le seuil ou agrandis le cadre.');
        const color = ink === 'orig' ? avgInk(f, m) : ink, W = 900, k = W / r.W, H = Math.round(r.H * k), capH = caption ? 70 : 0;
        const path = {id: uid(), type: 'svgpath', name: 'Signature', d: V.loopsD(r.layers[0].loops), fill: color, stroke: color, sw: .4, join: 'round', evenodd: true};
        V.mapObj(path, (x, y) => [x * k, y * k + 10]);
        const objs = [{id: uid(), type: 'group', layer: true, name: 'Signature', children: [path]}];
        if (caption) objs.push({id: uid(), type: 'group', layer: true, name: 'Légende', children: [{id: uid(), type: 'text', name: 'Légende', text: caption, x: W / 2, y: H + 10 + capH * .6, size: 26, font: 'Georgia, serif', italic: true, align: 'middle', fill: '#3b3b3b', sw: 0}]});
        return {w: W, h: H + 20 + capH, bg: 'transparent', kind: 'seal', objs, name};
    }

    /* ═════════ 🔏 Monogrammes, cachets, tampons, ex-libris ═════════ */
    const LETTERS = {
        script: {label: 'Anglaise entrelacée', font: '"Snell Roundhand", "Apple Chancery", "Edwardian Script ITC", "Brush Script MT", cursive', italic: false, overlap: .42},
        ronde: {label: 'Ronde (calligraphie scolaire)', font: '"Apple Chancery", "Lucida Calligraphy", "Brush Script MT", cursive', italic: false, overlap: .3},
        gothique: {label: 'Gothique', font: '"UnifrakturMaguntia", "Old English Text MT", "Goudy Text MT", "Blackletter", serif', italic: false, overlap: .18},
        romaine: {label: 'Capitales romaines', font: '"Trajan Pro", "Optima", Didot, "Bodoni 72", Georgia, serif', italic: false, overlap: .08},
        didone: {label: 'Didot (Empire)', font: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif', italic: true, overlap: .22},
    };
    const SHAPES = {
        wax: {label: '🔴 Cachet de cire', legend: true},
        stamp: {label: '🟦 Tampon encreur', legend: true},
        circle: {label: '⭕ Médaillon rond', legend: true},
        oval: {label: '🥚 Médaillon ovale', legend: true},
        shield: {label: '🛡️ Écu', legend: false},
        lozenge: {label: '🔷 Losange', legend: false},
        exlibris: {label: '📚 Ex-libris', legend: false},
        none: {label: '— Lettres seules', legend: false},
    };
    const COLORS = {
        waxred: {label: 'Cire rouge', main: '#9b1c1c', light: '#c94a3a', dark: '#5e0f0f'},
        waxgreen: {label: 'Cire verte', main: '#2f5a2a', light: '#5a8a4a', dark: '#1a3317'},
        waxblack: {label: 'Cire noire (deuil)', main: '#262222', light: '#575050', dark: '#0e0b0b'},
        gold: {label: 'Or', main: '#a8812e', light: '#e8cf7a', dark: '#6b4e14'},
        blue: {label: 'Encre bleue', main: '#1f3a7a', light: '#5f78b8', dark: '#132650'},
        violet: {label: 'Encre violette (administration)', main: '#5b3a8a', light: '#8a6ab8', dark: '#3a2358'},
        black: {label: 'Encre noire', main: '#1b1a1e', light: '#55545a', dark: '#000000'},
        sepia: {label: 'Sépia', main: '#5a3b1e', light: '#8a6a44', dark: '#3a2410'},
    };
    const P = (d, o = {}) => ({id: uid(), type: 'svgpath', name: o.name || 'Forme', d, fill: o.fill || 'none', stroke: o.stroke || 'none', sw: n2(o.sw || 0), join: 'round', cap: 'round', ...(o.grad ? {grad: o.grad} : {}), ...(o.op ? {op: o.op} : {}), ...(o.dash ? {dash: o.dash} : {}), ...(o.evenodd ? {evenodd: true} : {})});
    const circleD = (cx, cy, rx, ry = rx) => `M${n2(cx - rx)} ${n2(cy)}A${n2(rx)} ${n2(ry)} 0 1 0 ${n2(cx + rx)} ${n2(cy)}A${n2(rx)} ${n2(ry)} 0 1 0 ${n2(cx - rx)} ${n2(cy)}Z`;
    // un bord de cire écrasée : un cercle bosselé (régulier d'un tirage à l'autre grâce à la graine)
    const waxD = (cx, cy, R, seed = 3) => { const N = 96, pts = []; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r = R * (1 + .045 * Math.sin(5 * a + seed) + .03 * Math.sin(11 * a + seed * 2) + .018 * Math.sin(23 * a + seed * 3)); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return 'M' + pts.map(p => `${n2(p[0])} ${n2(p[1])}`).join('L') + 'Z'; };
    const shieldD = (cx, cy, w, h) => { const x = cx - w / 2, y = cy - h / 2; return `M${n2(x)} ${n2(y)}H${n2(x + w)}V${n2(y + h * .55)}C${n2(x + w)} ${n2(y + h * .8)} ${n2(cx + w * .2)} ${n2(y + h * .92)} ${n2(cx)} ${n2(y + h)}C${n2(cx - w * .2)} ${n2(y + h * .92)} ${n2(x)} ${n2(y + h * .8)} ${n2(x)} ${n2(y + h * .55)}Z`; };
    const T = (text, x, y, size, font, fill, o = {}) => ({id: uid(), type: 'text', name: o.name || text, text, x: n2(x), y: n2(y), size: n2(size), font, align: 'middle', fill, sw: 0, ...(o.italic ? {italic: true} : {}), ...(o.bold ? {bold: true} : {}), ...(o.rot ? {rot: n2(o.rot)} : {}), ...(o.op ? {op: o.op} : {}), ...(o.ls ? {ls: o.ls} : {})});
    let mc = null; const measure = (t, font, size, it) => { mc = mc || document.createElement('canvas').getContext('2d'); mc.font = `${it ? 'italic ' : ''}${size}px ${font}`; return mc.measureText(t).width; };

    /** une légende qui tourne autour d'un cercle (une lettre par objet, chacune tournée) ; bottom : lue de gauche à droite en bas */
    function ringText(text, cx, cy, r, size, font, fill, {bottom = false, spread = 0} = {}) {
        const chars = [...String(text)], widths = chars.map(ch => measure(ch, font, size) + size * .08), total = widths.reduce((a, b) => a + b, 0);
        const ang = spread || Math.min(Math.PI * 1.9, total / r); let a = (bottom ? Math.PI : 0) + (bottom ? ang / 2 : -ang / 2);
        const out = [];
        chars.forEach((ch, i) => { const step = widths[i] / total * ang, mid = a + (bottom ? -step / 2 : step / 2); a += bottom ? -step : step; if (!ch.trim()) return;
            const px = cx + r * Math.sin(mid), py = cy - r * Math.cos(mid), deg = mid * 180 / Math.PI + (bottom ? 180 : 0);
            out.push(T(ch, px, py + size * .4, size, font, fill, {rot: ((deg % 360) + 360) % 360, name: ch})); });
        return {id: uid(), type: 'group', name: `Légende : ${String(text).slice(0, 24)}`, children: out};
    }
    /** les initiales entrelacées : la lettre du nom au milieu, plus grande (usage français) */
    function monogram(letters, cx, cy, size, st, fill, o = {}) {
        const L = LETTERS[st] || LETTERS.script, ch = [...String(letters).replace(/[^\p{L}&]/gu, '')].slice(0, 4);
        if (!ch.length) return [];
        const sizes = ch.map((_, i) => ch.length === 3 && o.bigMiddle && i === 1 ? size * 1.25 : size), ws = ch.map((c, i) => measure(c, L.font, sizes[i], L.italic));
        const step = ws.map(w => w * (1 - L.overlap)), total = step.reduce((a, b) => a + b, 0) - step[step.length - 1] + ws[ws.length - 1];
        let x = cx - total / 2; const out = [];
        ch.forEach((c, i) => { const s = sizes[i], y = cy + s * .33 + (ch.length === 3 && o.bigMiddle && i !== 1 ? -s * .02 : 0), tx = x + ws[i] / 2;
            if (o.emboss) { out.push(T(c, tx + s * .025, y + s * .025, s, L.font, o.emboss.dark, {italic: L.italic, op: .85, name: `${c} (ombre)`}), T(c, tx - s * .018, y - s * .018, s, L.font, o.emboss.light, {italic: L.italic, op: .7, name: `${c} (reflet)`})); }
            out.push(T(c, tx, y, s, L.font, fill, {italic: L.italic, name: c})); x += step[i]; });
        return [{id: uid(), type: 'group', name: `Monogramme ${ch.join('')}`, children: out}];
    }
    /** une couronne de laurier : deux branches qui montent de part et d'autre (span : la part du tour couverte) */
    function laurel(cx, cy, rx, ry, color, span = .62) {
        const leaves = [], n = 9;
        [-1, 1].forEach(sd => { for (let i = 0; i < n; i++) { const t = (i + .5) / n, a = Math.PI / 2 + sd * (t * span * Math.PI), px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a), lw = rx * .06 * (1 - t * .4), lh = rx * .16 * (1 - t * .4), tang = a * 180 / Math.PI + (sd > 0 ? 0 : 180);
            [-1, 1].forEach(side => { const off = side * lh * .45, ox = px + off * Math.cos(a), oy = py + off * Math.sin(a) * ry / rx; leaves.push({id: uid(), type: 'ellipse', name: 'Feuille', x: n2(ox - lw / 2), y: n2(oy - lh / 2), w: n2(lw), h: n2(lh), rot: n2(tang + side * 35), fill: color, sw: 0}); }); }
            const a0 = Math.PI / 2 + sd * .02, a1 = Math.PI / 2 + sd * span * Math.PI; leaves.push(P(`M${n2(cx + rx * Math.cos(a0))} ${n2(cy + ry * Math.sin(a0))}A${n2(rx)} ${n2(ry)} 0 0 ${sd > 0 ? 1 : 0} ${n2(cx + rx * Math.cos(a1))} ${n2(cy + ry * Math.sin(a1))}`, {stroke: color, sw: 1.6, name: 'Tige'})); });
        return {id: uid(), type: 'group', name: 'Couronne de laurier', children: leaves};
    }
    function buildSeal(o) {
        const S = 600, cx = S / 2, cy = S / 2, C = COLORS[o.color] || COLORS.waxred, shape = SHAPES[o.shape] ? o.shape : 'wax', st = LETTERS[o.letters] ? o.letters : 'script', L = LETTERS[st];
        const back = [], mid = [], legend = [];
        const top = String(o.top || '').trim(), bot = String(o.bottom || '').trim(), hasLeg = SHAPES[shape].legend && (top || bot);
        let R = S * .4, mono = S * (hasLeg ? .26 : .36), emboss = null, ink = C.main, legFont = 'Didot, "Bodoni 72", Georgia, serif';
        if (shape === 'wax') {
            back.push(P(waxD(cx + 6, cy + 9, R * 1.08, Number(o.seed) || 3), {fill: '#000000', op: .22, name: 'Ombre portée'}), P(waxD(cx, cy, R * 1.08, Number(o.seed) || 3), {fill: C.main, grad: {type: 'radial', c1: C.light, c2: C.dark}, name: 'Cire'}));
            back.push(P(circleD(cx, cy, R * .8), {fill: C.main, stroke: C.dark, sw: 6, name: 'Empreinte'}), P(circleD(cx - 2, cy - 2, R * .8), {stroke: C.light, sw: 2, op: .6, name: 'Reflet de l’empreinte'}));
            emboss = {dark: C.dark, light: C.light}; ink = C.main; R = R * .66;
        } else if (shape === 'stamp') {
            back.push(P(circleD(cx, cy, R), {stroke: C.main, sw: 7, op: .9, name: 'Cercle extérieur'}), P(circleD(cx, cy, R * .93), {stroke: C.main, sw: 2, op: .9, name: 'Filet'}));
            if (hasLeg) back.push(P(circleD(cx, cy, R * .66), {stroke: C.main, sw: 3, op: .9, name: 'Cercle intérieur'}));
            R = R * .8;
        } else if (shape === 'circle' || shape === 'oval') {
            const ry = shape === 'oval' ? 1.18 : 1;
            back.push(P(circleD(cx, cy, R, R * ry), {stroke: C.main, sw: 5, name: 'Cadre'}), P(circleD(cx, cy, R * .94, R * .94 * ry), {stroke: C.main, sw: 1.5, name: 'Filet'}));
            if (hasLeg) { back.push(P(circleD(cx, cy, R * .68, R * .68 * ry), {stroke: C.main, sw: 1.5, name: 'Filet intérieur'})); }
            if (!hasLeg) back.push(laurel(cx, cy, R * .8, R * .8 * ry, C.main));
            [0, 1, 2, 3].forEach(i => { const a = i * Math.PI / 2 + Math.PI / 4; if (hasLeg) back.push(P(circleD(cx + R * .81 * Math.cos(a), cy + R * .81 * ry * Math.sin(a), 4), {fill: C.main, name: 'Point'})); });
            R = R * .81;
        } else if (shape === 'shield') {
            back.push(P(shieldD(cx, cy, S * .62, S * .74), {fill: C.light, op: .25, stroke: C.main, sw: 6, name: 'Écu'}), P(shieldD(cx, cy - 4, S * .56, S * .66), {stroke: C.main, sw: 1.5, name: 'Filet'})); mono = S * .3;
        } else if (shape === 'lozenge') {
            const r = S * .42; back.push(P(`M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`, {stroke: C.main, sw: 5, name: 'Losange'}), P(`M${cx} ${cy - r * .9}L${cx + r * .9} ${cy}L${cx} ${cy + r * .9}L${cx - r * .9} ${cy}Z`, {stroke: C.main, sw: 1.5, name: 'Filet'})); mono = S * .3;
        } else if (shape === 'exlibris') {
            const w = S * .78, h = S * .9, x = cx - w / 2, y = cy - h / 2;
            back.push({id: uid(), type: 'rect', name: 'Cadre', x, y, w, h, fill: 'none', stroke: C.main, sw: 4}, {id: uid(), type: 'rect', name: 'Filet', x: x + 10, y: y + 10, w: w - 20, h: h - 20, fill: 'none', stroke: C.main, sw: 1.2});
            [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]].forEach(([px, py]) => back.push(P(circleD(px, py, 6), {fill: C.main, name: 'Coin'})));
            legend.push(T('EX LIBRIS', cx, y + 64, 34, legFont, C.main, {ls: 6})); if (top || bot) legend.push(T([top, bot].filter(Boolean).join(' '), cx, y + h - 46, 28, L.font, C.main, {italic: true}));
            legend.push(laurel(cx, cy + 6, S * .27, S * .27, C.main, .55)); mono = S * .26;
        }
        // le monogramme
        mid.push(...monogram(o.initials || '', cx, shape === 'exlibris' ? cy + 6 : cy, mono, st, ink, {bigMiddle: o.bigMiddle !== false, emboss}));
        // la légende autour
        if (hasLeg) { const ls = shape === 'wax' ? 22 : 26, lr = R; const lf = shape === 'wax' ? C.light : C.main;
            if (top) legend.push(ringText(top.toLocaleUpperCase('fr-FR'), cx, cy, lr, ls, legFont, lf));
            if (bot) legend.push(ringText(bot.toLocaleUpperCase('fr-FR'), cx, cy, lr, ls, legFont, lf, {bottom: true}));
            if (top && bot) [-1, 1].forEach(sd => legend.push(T('✦', cx + sd * lr, cy + 7, 16, legFont, lf, {name: 'Étoile'})));
        }
        return {w: S, h: S, bg: 'transparent', kind: 'seal', objs: [{id: uid(), type: 'group', layer: true, name: 'Fond et cadre', children: back}, {id: uid(), type: 'group', layer: true, name: 'Monogramme', children: mid}, ...(legend.length ? [{id: uid(), type: 'group', layer: true, name: 'Légende', children: legend}] : [])]};
    }
    const initialsOf = (first, last) => { const f = String(first || '').split(/[\s-]+/).filter(Boolean).map(w => w[0]).slice(0, 2), l = String(last || '').trim()[0] || ''; return f.length >= 2 ? `${f[0]}${l}${f[1]}` : `${f[0] || ''}${l}`; };

    /* ═════════ La fenêtre ═════════ */
    function open(onDone, opts = {}) {
        let mode = opts.mode || 'sign', img = null, imgName = '', crop = null, f = null, person = null, autoThr = 140;
        const PK = () => window.LCNDA_PICKER || A();
        const pickPersonHtml = pre => `<span class="h-fp-who" data-who="${pre}">${PK().pickerField({name: pre + '_person', kind: 'person'})}<button type="button" class="button small secondary" data-${pre}-cur>Fiche affichée</button></span>`;
        ext.openDialog({eyebrow: 'CALLIGRAPHIE ET SCEAUX', title: '🔤 Signatures et sceaux', wide: true, submitLabel: 'Créer et ouvrir dans le dessin',
            body: `<div class="h-sl">
                <div class="h-sl-tabs" role="tablist"><button type="button" data-sl-mode="sign">✍️ La signature d’un acte</button><button type="button" data-sl-mode="seal">🔏 Monogramme, cachet, tampon</button></div>
                <section data-sl-pane="sign">
                    <p class="muted">Choisis l’image d’un acte, puis <b>encadre la signature</b> en glissant. Le papier, les taches et les lignes s’effacent ; l’encre devient un tracé net, à agrandir sans perte, à imprimer ou à graver.</p>
                    <div class="h-sl-src"><button type="button" class="button small" data-sl-media>📷 Un acte des médias…</button><button type="button" class="button small secondary" data-sl-known title="Une signature déjà encadrée dans la visionneuse (Signatures identifiées)">✍️ Une signature déjà repérée…</button><label class="button small secondary">💻 De l’ordinateur<input type="file" accept="image/*" data-sl-file hidden></label><span class="muted" data-sl-name></span></div>
                    <div class="h-sl-work"><div class="h-sl-stage" data-sl-stage><p class="muted">Aucune image pour l’instant.</p></div>
                        <div class="h-sl-side"><div class="h-sl-prev" data-sl-prev><p class="muted">L’aperçu de la signature s’affiche ici.</p></div>
                            <label>Encre ↔ papier <small class="muted" data-sl-thrv></small><input type="range" name="thr" min="40" max="250" value="140"></label>
                            <label>Effacer les petites taches<input type="range" name="speck" min="0" max="120" value="14"></label>
                            <label>Épaisseur du trait<select name="grow"><option value="-1">Plus fin</option><option value="0" selected>Comme l’original</option><option value="1">Plus épais</option><option value="2">Bien plus épais</option></select></label>
                            <label class="checkbox-line"><input type="checkbox" name="lines"> Effacer les lignes du registre</label>
                            <label>Couleur<select name="ink">${INKS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
                            <div><span class="pk-lab">De qui est cette signature ?</span>${pickPersonHtml('sl')}</div>
                            <label>Légende sous la signature (facultatif)<input name="caption" placeholder="ex. Jean Martin, 1832 — acte de mariage"></label>
                            <label class="checkbox-line"><input type="checkbox" name="tomedia" checked> Ranger aussi l’image (fond transparent) dans les médias de la personne</label></div></div>
                </section>
                <section data-sl-pane="seal" hidden>
                    <div class="h-sl-work"><div class="h-sl-sealprev" data-sl-sprev></div>
                        <div class="h-sl-side"><div><span class="pk-lab">D’après une personne</span>${pickPersonHtml('sl2')}</div>
                            <div class="form-grid"><label>Initiales<input name="initials" value="JM" maxlength="6"></label><label>Lettres<select name="letters">${Object.entries(LETTERS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
                                <label>Forme<select name="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label><label>Couleur<select name="color">${Object.entries(COLORS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
                                <label class="span-2">Légende du haut<input name="top" placeholder="ex. FAMILLE MARTIN"></label><label class="span-2">Légende du bas<input name="bottom" placeholder="ex. TULLE · 1832"></label></div>
                            <label class="checkbox-line"><input type="checkbox" name="bigMiddle" checked> La lettre du nom au milieu, plus grande (3 initiales)</label>
                            <label>Variante du bord de cire<input type="range" name="seed" min="1" max="9" value="3"></label></div></div>
                </section></div>`,
            onOpen: dg => {
                const $ = s => dg.querySelector(s), form = dg.querySelector('form');
                const setMode = m => { mode = m; dg.querySelectorAll('[data-sl-mode]').forEach(b => b.classList.toggle('active', b.dataset.slMode === m)); dg.querySelectorAll('[data-sl-pane]').forEach(p => { p.hidden = p.dataset.slPane !== m; }); if (m === 'seal') sealPrev(); };
                dg.querySelectorAll('[data-sl-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.slMode)));
                /* — la personne (les deux volets) — */
                // le menu de choix unique ; « Fiche affichée » le remplit avec la personne ouverte
                const bindWho = (pre, onPick, onClear = () => {}) => { const box = $(`[data-who="${pre}"]`), field = box.querySelector('.pk');
                    const use = (id, p) => { PK().pickerSet(field, id); onPick({id, first: p.first_name, last: p.last_name, name: A().personName(p), year: p.birth_year}); };
                    box.addEventListener('cp-pick', async e => { const {id, name} = e.detail; if (!id) return onClear(); const p = (await api('person', {id}).catch(() => null))?.person; if (p) onPick({id, first: p.first_name, last: p.last_name, name: A().personName(p), year: p.birth_year}); else onPick({id, first: '', last: name, name, year: ''}); });
                    $(`[data-${pre}-cur]`).addEventListener('click', async () => { const id = Number(A().state.currentPersonId) || 0; if (!id) { toast('Aucune fiche affichée : cherche la personne.', 'error'); box.querySelector('.pk-search:not([hidden]) .pk-input')?.focus(); return; } const p = (await api('person', {id}).catch(() => null))?.person; if (p) use(id, p); }); };
                bindWho('sl', p => { person = p; const cap = form.elements.caption; if (!cap.value) cap.value = p.name; }, () => { person = null; });
                bindWho('sl2', p => { form.elements.initials.value = initialsOf(p.first, p.last).toLocaleUpperCase('fr-FR'); form.elements.top.value = `Famille ${p.last || ''}`.trim().toLocaleUpperCase('fr-FR'); sealPrev(); });
                /* — la signature — */
                const stage = $('[data-sl-stage]');
                const loadImg = (src, name) => new Promise(ok => { const i = new Image(); i.onload = () => { img = i; imgName = name; crop = null; f = null; $('[data-sl-name]').textContent = name; drawStage(); preview(); ok(); }; i.onerror = () => { toast('Image illisible.', 'error'); ok(); }; i.src = src; });
                function drawStage() {
                    if (!img) return; stage.innerHTML = '<canvas></canvas><div class="h-sl-crop" hidden></div><p class="muted h-sl-tip">Glisse pour encadrer la signature.</p>';
                    const c = stage.querySelector('canvas'), maxW = stage.clientWidth || 640, k = Math.min(maxW / img.naturalWidth, 520 / img.naturalHeight, 1);
                    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c._k = k;
                    const box = stage.querySelector('.h-sl-crop'); let st = null;
                    const show = () => { if (!crop) { box.hidden = true; return; } box.hidden = false; Object.assign(box.style, {left: `${c.offsetLeft + crop.x * k}px`, top: `${c.offsetTop + crop.y * k}px`, width: `${crop.w * k}px`, height: `${crop.h * k}px`}); };
                    const pt = e => { const r = c.getBoundingClientRect(); return [clamp((e.clientX - r.left) / k, 0, img.naturalWidth), clamp((e.clientY - r.top) / k, 0, img.naturalHeight)]; };
                    c.addEventListener('pointerdown', e => { st = pt(e); c.setPointerCapture(e.pointerId); });
                    c.addEventListener('pointermove', e => { if (!st) return; const [x, y] = pt(e); crop = {x: Math.min(x, st[0]), y: Math.min(y, st[1]), w: Math.abs(x - st[0]), h: Math.abs(y - st[1])}; show(); });
                    c.addEventListener('pointerup', () => { st = null; if (crop && (crop.w < 8 || crop.h < 8)) crop = null; show(); f = null; preview(true); });
                    show();
                }
                let tm = 0;
                function preview(newCrop) {
                    clearTimeout(tm); tm = setTimeout(() => {
                        const box = $('[data-sl-prev]'); if (!img) return;
                        const cr = crop || {x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight};
                        if (!f) { f = flatten(img, cr); autoThr = clamp(otsu(f.gray) + 12, 60, 235); if (newCrop || !form.elements.thr.dataset.touched) form.elements.thr.value = autoThr; }
                        const m = inkMask(f, {thr: Number(form.elements.thr.value), speck: Number(form.elements.speck.value), grow: Number(form.elements.grow.value), lines: form.elements.lines.checked});
                        $('[data-sl-thrv]').textContent = Number(form.elements.thr.value) === autoThr ? '(réglé tout seul)' : '';
                        box.innerHTML = ''; const pc = maskCanvas(f, m, form.elements.ink.value); box.appendChild(pc); box._m = m;
                    }, 60);
                }
                form.elements.thr.addEventListener('input', e => { e.target.dataset.touched = '1'; preview(); });
                ['speck', 'grow', 'lines', 'ink'].forEach(n => form.elements[n].addEventListener(n === 'speck' ? 'input' : 'change', () => preview()));
                $('[data-sl-file]').addEventListener('change', e => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => loadImg(r.result, file.name); r.readAsDataURL(file); });
                $('[data-sl-media]').addEventListener('click', async () => { const m = await pickMedia(); if (m) await loadImg(mediaUrl(m.filename), m.title || m.filename); });
                // une signature repérée : l'image, le cadre (en % de l'image) et la personne viennent tout seuls
                const useKnown = async r => { await loadImg(mediaUrl(r.filename), r.title || r.document_title || r.filename); if (!img) return;
                    const W = img.naturalWidth, H = img.naturalHeight, pad = .015; crop = {x: Math.max(0, (Number(r.x) / 100 - pad) * W), y: Math.max(0, (Number(r.y) / 100 - pad) * H), w: Math.min(W, (Number(r.w) / 100 + 2 * pad) * W), h: Math.min(H, (Number(r.h) / 100 + 2 * pad) * H)}; crop.w = Math.min(crop.w, W - crop.x); crop.h = Math.min(crop.h, H - crop.y);
                    f = null; drawStage(); preview(true);
                    if (r.person_id) { const p = (await api('person', {id: r.person_id}).catch(() => null))?.person; if (p) { PK().pickerSet($('[data-who="sl"] .pk'), Number(r.person_id)); person = {id: Number(r.person_id), first: p.first_name, last: p.last_name, name: A().personName(p), year: p.birth_year}; if (!form.elements.caption.value) form.elements.caption.value = [person.name, r.date_text].filter(Boolean).join(', '); } } };
                $('[data-sl-known]').addEventListener('click', async () => { const r = await pickKnownSignature(); if (r) await useKnown(r); });
                if (opts.signature) useKnown(opts.signature); else if (opts.src) loadImg(opts.src, opts.title || 'Acte');
                /* — le sceau — */
                const sp = $('[data-sl-sprev]');
                function sealPrev() { const o = Object.fromEntries(new FormData(form)); o.bigMiddle = form.elements.bigMiddle.checked; const V = ext.vectorInternals; if (!V?.docSvg) { sp.innerHTML = '<p class="muted">Aperçu indisponible.</p>'; return; } try { sp.innerHTML = V.docSvg(buildSeal(o)); } catch (e) { sp.innerHTML = `<p class="muted">${esc(e.message)}</p>`; } }
                dg.querySelector('[data-sl-pane="seal"]').addEventListener('input', () => sealPrev());
                dg.querySelector('[data-sl-pane="seal"]').addEventListener('change', () => sealPrev());
                setMode(mode);
            },
            onSubmit: async form => {
                const o = Object.fromEntries(new FormData(form));
                if (mode === 'seal') { o.bigMiddle = form.elements.bigMiddle.checked; const doc = buildSeal(o); ext.openVectorEditor({doc, name: `Sceau ${o.initials || ''}`.trim(), onSaved: onDone, onClose: onDone}); return; }
                if (!img) { toast('Choisis d’abord l’image d’un acte.', 'error'); return false; }
                const cr = crop || {x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight}; f = f || flatten(img, cr);
                const m = inkMask(f, {thr: Number(o.thr), speck: Number(o.speck), grow: Number(o.grow), lines: !!o.lines});
                try {
                    const name = person ? `Signature de ${person.name}` : 'Signature', doc = await signatureDoc(f, m, {ink: o.ink, caption: String(o.caption || '').trim(), name});
                    if (person && o.tomedia) await toMedia(maskCanvas(f, m, o.ink), person, name).catch(e => toast(`Image non rangée : ${e.message}`, 'error'));
                    ext.openVectorEditor({doc, name, onSaved: onDone, onClose: onDone});
                } catch (e) { toast(e.message, 'error'); return false; }
            }});
    }
    /* une image transparente de la signature, rangée dans les médias de la personne */
    async function toMedia(canvas, person, title) {
        const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png')); if (!blob) throw new Error('image vide');
        const fd = new FormData(); fd.append('person_id', person.id); fd.append('title', title); fd.append('csrf', A().state.csrf); fd.append('files[]', new File([blob], `${title.replace(/[^\p{L}\d]+/gu, '-').toLowerCase()}.png`, {type: 'image/png'}));
        const r = await fetch('upload.php', {method: 'POST', body: fd}); const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
        toast(`Signature rangée dans les médias de ${person.name}.`);
    }
    const pickMedia = () => ext.pickImage({eyebrow: 'SIGNATURES', title: 'L’image d’un acte', intro: 'Clique sur l’image ; tu encadreras ensuite la signature. Le filtre « Avec une signature repérée » montre les actes où une signature a déjà été identifiée.'});
    /** ✍️ les signatures déjà repérées sur les images (visionneuse → Signatures identifiées) */
    function pickKnownSignature() {
        return new Promise(res => { let rows = [], done = false;
            ext.openDialog({eyebrow: 'SIGNATURES', title: '✍️ Une signature déjà repérée', submitLabel: 'Fermer', wide: true,
                body: '<div class="h-rt-pick-bar"><div class="pk h-pick-q"><div class="pk-box"><span class="pk-ico" aria-hidden="true">✍️</span><input type="text" class="pk-input" data-q placeholder="Nom de la personne, titre de l’acte…" autocomplete="off" spellcheck="false" aria-label="Chercher une signature"></div></div></div><div class="h-rt-pick-grid" data-grid><div class="loading-block">Chargement…</div></div><p class="muted small">Ce sont les signatures identifiées dans la visionneuse (colonne de droite → « Signatures identifiées ») et dans Listes → Signatures.</p>',
                onOpen: dg => { const q = dg.querySelector('[data-q]'), grid = dg.querySelector('[data-grid]'); let tm = 0;
                    const go = async () => { const r0 = await api('list', {type: 'signatures', q: q.value.trim(), limit: 120}).catch(() => ({rows: []})); rows = r0.rows || r0.data || [];
                        grid.innerHTML = rows.map((r, i) => `<button type="button" class="h-rt-pick-item pk-card" data-i="${i}"><span class="h-sl-sigthumb" style="background-image:url('${esc(mediaUrl(r.filename))}');background-size:${(100 / Math.max(1, r.w)) * 100}% auto;background-position:${r.w >= 100 ? 0 : (r.x / (100 - r.w)) * 100}% ${r.h >= 100 ? 0 : (r.y / (100 - r.h)) * 100}%"></span><span class="pk-name">${esc(r.person_name || 'Sans nom')}</span><small class="pk-meta">${esc(r.title || r.document_title || r.filename || '')}</small></button>`).join('') || '<p class="muted">Aucune signature repérée. Dans la visionneuse, « Signatures identifiées » permet d’en encadrer une sur un acte.</p>'; };
                    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(go, 220); }); go();
                    grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; done = true; res(rows[Number(b.dataset.i)]); dg.close(); });
                    dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); },
                onSubmit: () => true});
        });
    }

    // dans la visionneuse (Signatures identifiées) : 🔤 pour détourer et vectoriser la signature encadrée
    const sealBtns = list => list.querySelectorAll('.tag-list-item').forEach(row => { if (row.querySelector('.tag-seal-btn')) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-button tag-seal-btn'; b.title = 'Détourer cette signature (Signatures et sceaux) : un tracé net, à imprimer ou graver'; b.textContent = '🔤';
        b.addEventListener('click', e => { e.stopPropagation(); const S = A().state, tag = (S.lightboxTags || []).find(t => Number(t.id) === Number(row.dataset.tagId)), it = S.lightboxMedia?.[S.lightboxIndex]; if (!tag || !it) return;
            open(null, {signature: {...tag, filename: it.filename, title: it.title || it.filename, date_text: it.date_text || ''}}); });
        row.querySelector('.tag-edit-btn')?.before(b); });
    const sigWatch = () => { const list = document.getElementById('lightbox-signatures-list'); if (!list) return setTimeout(sigWatch, 600); sealBtns(list); new MutationObserver(() => sealBtns(list)).observe(list, {childList: true}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sigWatch); else sigWatch();

    ext.openSeals = open;
    ext.sealInternals = {otsu, flatten, inkMask, maskCanvas, signatureDoc, buildSeal, monogram, ringText, initialsOf, LETTERS, SHAPES, COLORS};
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'seals', icon: '🔤', label: 'Signatures et sceaux', what: 'signature ou sceau',
        load: async () => ((await api('vector_docs')).docs || []).filter(d => d.kind === 'seal').map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : '<span class="h-et-ico">🔤</span>', info: 'Dessin vectoriel'})),
        open: (id, again) => ext.openVectorEditor?.({id, onSaved: again, onClose: again}),
        create: again => open(again),
        rename: (id, name) => api('rename_vector_doc', {}, {method: 'POST', body: {id, name}}),
        remove: id => api('delete_vector_doc', {}, {method: 'POST', body: {id}}), createLabel: '＋ Signature ou sceau',
        extra: '<button type="button" class="button small secondary" data-et-x="seal">🔏 Monogramme, cachet…</button>', onExtra: (k, again) => open(again, {mode: 'seal'})});
})();
