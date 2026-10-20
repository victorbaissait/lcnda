/**
 * ▦ QR codes, sans rien télécharger : un petit encodeur écrit pour l'app (mode « octets » en UTF-8, correction d'erreurs
 * niveau M — environ 15 % du code peut être abîmé —, versions 1 à 10, donc jusqu'à 213 octets).
 * D'après la norme ISO/IEC 18004 : données + Reed-Solomon par blocs entrelacés, motifs fixes, choix du masque le moins gênant.
 *   ext.qr.encode(texte)            → {size, version, mask, modules: [[bool…]…]} (true = module noir)
 *   ext.qr.svg(texte, {dark, light, quiet}) → le dessin SVG (texte), net à toutes les tailles
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const MAX_VERSION = 10;
    // niveau M : codes de correction par bloc et nombre de blocs, version 1 à 10 (indice = version)
    const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
    const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
    const FORMAT_M = 0; // bits du niveau M dans l'information de format

    /** Le nombre de modules qui portent des données (tout moins les motifs fixes) */
    function rawModules(ver) {
        let r = (16 * ver + 128) * ver + 64;
        if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
        return r;
    }
    const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
    function alignPositions(ver) {
        if (ver === 1) return [];
        const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
        for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
        return out;
    }
    /* ── Reed-Solomon sur GF(256), polynôme 0x11D ── */
    const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
    function rsDivisor(degree) {
        const r = new Array(degree).fill(0); r[degree - 1] = 1; let root = 1;
        for (let i = 0; i < degree; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
        return r;
    }
    function rsRemainder(data, div) {
        const r = div.map(() => 0);
        for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
        return r;
    }
    const utf8 = s => Array.from(new TextEncoder().encode(String(s)));
    /** Le plus petit QR (version 1 à 10) qui contient ces octets, ou null */
    const versionFor = n => { for (let v = 1; v <= MAX_VERSION; v++) if (4 + (v < 10 ? 8 : 16) + 8 * n <= dataCodewords(v) * 8) return v; return null; };
    const maxBytes = () => Math.floor((dataCodewords(MAX_VERSION) * 8 - 20) / 8);

    function encode(text, {mask: forceMask = -1} = {}) {
        const bytes = utf8(text), ver = versionFor(bytes.length);
        if (!ver) throw new Error(`Trop long pour un QR code : ${maxBytes()} caractères simples au plus (il y en a ${bytes.length}).`);
        // 1. les bits : mode octets (0100), longueur, octets, fin, remplissage
        const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
        put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
        const cap = dataCodewords(ver) * 8;
        put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
        for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
        const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
        // 2. les blocs, leur correction, puis entrelacés
        const nb = NUM_BLOCKS[ver], ecLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
        const div = rsDivisor(ecLen), blocks = [];
        for (let i = 0, k = 0; i < nb; i++) { const dl = shortLen - ecLen + (i < nShort ? 0 : 1), dat = data.slice(k, k + dl); k += dl; blocks.push({dat, ecc: rsRemainder(dat, div)}); }
        const all = [], maxD = Math.max(...blocks.map(b => b.dat.length));
        for (let i = 0; i < maxD; i++) blocks.forEach(b => { if (i < b.dat.length) all.push(b.dat[i]); });
        for (let i = 0; i < ecLen; i++) blocks.forEach(b => all.push(b.ecc[i]));
        // 3. la grille : motifs fixes, puis les données en zigzag
        const size = ver * 4 + 17, M = Array.from({length: size}, () => new Array(size).fill(false)), F = Array.from({length: size}, () => new Array(size).fill(false));
        const fn = (x, y, dark) => { M[y][x] = !!dark; F[y][x] = true; };
        for (let i = 0; i < size; i++) { fn(6, i, i % 2 === 0); fn(i, 6, i % 2 === 0); }
        const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && y >= 0 && x < size && y < size) fn(x, y, d !== 2 && d !== 4); } };
        finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
        const al = alignPositions(ver), na = al.length;
        for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
            if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fn(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
        const formatBits = mask => { const d = (FORMAT_M << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((d << 10) | r) ^ 0x5412; };
        const drawFormat = mask => {
            const b = formatBits(mask), bit = i => ((b >>> i) & 1) === 1;
            for (let i = 0; i <= 5; i++) fn(8, i, bit(i));
            fn(8, 7, bit(6)); fn(8, 8, bit(7)); fn(7, 8, bit(8));
            for (let i = 9; i < 15; i++) fn(14 - i, 8, bit(i));
            for (let i = 0; i < 8; i++) fn(size - 1 - i, 8, bit(i));
            for (let i = 8; i < 15; i++) fn(8, size - 15 + i, bit(i));
            fn(8, size - 8, true);
        };
        drawFormat(0);
        if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const v = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); fn(a, c, v); fn(c, a, v); } }
        let i = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
                const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
                if (!F[y][x] && i < all.length * 8) { M[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
            }
        }
        // 4. le masque : celui qui donne le moins de motifs gênants pour les lecteurs
        const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
            (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
        const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
        let best = forceMask, bestScore = Infinity;
        if (!(best >= 0 && best < 8)) for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const s = penalty(M, size); if (s < bestScore) { bestScore = s; best = m; } applyMask(m); }
        applyMask(best); drawFormat(best);
        return {size, version: ver, mask: best, modules: M, fixed: F};
    }
    /** Points de pénalité (règles de la norme : suites, carrés, faux repères, équilibre noir / blanc) */
    function penalty(M, n) {
        let s = 0;
        const line = get => { let run = 1, sc = 0; for (let i = 1; i < n; i++) { if (get(i) === get(i - 1)) { run++; if (run === 5) sc += 3; else if (run > 5) sc++; } else run = 1; } return sc; };
        const finderLike = get => { let sc = 0; for (let i = 0; i + 6 < n; i++) { if (get(i) && !get(i + 1) && get(i + 2) && get(i + 3) && get(i + 4) && !get(i + 5) && get(i + 6)) {
            const light = (a, b) => { for (let k = a; k < b; k++) if (k >= 0 && k < n && get(k)) return false; return true; };
            if (light(i - 4, i) || light(i + 7, i + 11)) sc += 40; } } return sc; };
        for (let y = 0; y < n; y++) { s += line(x => M[y][x]); s += finderLike(x => M[y][x]); }
        for (let x = 0; x < n; x++) { s += line(y => M[y][x]); s += finderLike(y => M[y][x]); }
        let dark = 0;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (M[y][x]) dark++; if (x < n - 1 && y < n - 1) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) s += 3; } }
        s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
        return s;
    }
    const hexOk = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
    /** Le QR code en SVG : un seul tracé (net à l'impression), marge blanche (« zone calme ») de `quiet` modules */
    function svg(text, {dark = '#000000', light = '#ffffff', quiet = 4} = {}) {
        const q = encode(text), z = Math.max(0, Math.min(10, Math.round(Number(quiet) || 0))), N = q.size + z * 2;
        let d = '';
        q.modules.forEach((row, y) => { let x = 0; while (x < q.size) { if (!row[x]) { x++; continue; } let e = x; while (e < q.size && row[e]) e++; d += `M${x + z},${y + z}h${e - x}v1h${x - e}z`; x = e; } });
        const bg = light && light !== 'none' && hexOk(light) ? `<rect width="${N}" height="${N}" fill="${light}"/>` : '';
        return {svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${N * 8}" height="${N * 8}" shape-rendering="crispEdges">${bg}<path d="${d}" fill="${hexOk(dark) ? dark : '#000000'}"/></svg>`, size: q.size, version: q.version, modules: N};
    }
    ext.qr = {encode, svg, maxBytes, versionFor: s => versionFor(utf8(s).length)};
})();
