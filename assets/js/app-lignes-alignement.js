/* LCNDA — ▤ Relier les lignes d'un texte à l'image (Atelier de transcription) : calculs purs, plus la petite barre 🪄 de la fenêtre
 * de comparaison des deux lectures. window.LCNDA_LIGNES (navigateur) ou require() (Node, tests/test-approfondie-lignes.js).
 *
 * La lecture approfondie (Ollama) rend un bon texte, mais sans dire où est chaque ligne sur l'image. On retrouve les lignes :
 *  1. le découpage de la page en lignes (« bandes ») :
 *     - par la lecture rapide (Kraken) quand elle est installée : une boîte et un texte par ligne (bandsFromHtr) ; les mentions
 *       écrites à 90° dans la marge (kind 'margin', lib/htr_setup.php htr_with_margin) restent à part ;
 *     - sinon un découpage simple de l'image en niveaux de gris (segment) : seuil d'Otsu, la colonne du texte (les colonnes
 *       d'encre séparées par un blanc, comme une mention dans la marge, restent à part), profil de projection horizontal,
 *       bandes trop hautes coupées au creux du profil (lignes qui se touchent), petits bouts (accents, points) rattachés ;
 *  2. l'alignement des lignes du texte sur les bandes (align) : programmation dynamique, dans l'ordre, sur une similarité :
 *     - avec le texte de Kraken : distance d'édition normalisée (sans accents ni ponctuation), et un peu la longueur ;
 *     - sans : la longueur relative de la ligne (lettres) et la largeur d'encre de la bande (échelle lettres / pixel estimée,
 *       puis affinée sur les paires trouvées) ;
 *     pas permis : 1 ligne ↔ 1 bande, 1 ligne coupée sur 2 bandes (1→2), 2 lignes sur 1 bande (2→1), bande sans texte
 *     (signature, tache), ligne sans bande ; une paire peu ressemblante est marquée douteuse (❔), jamais inventée ;
 *  3. les zones (link) : {x, y, w, h, s, e, doubt} en pixels de l'image et en positions dans le texte ; 1→2 : la ligne coupée
 *     au mot qui va le mieux ; 2→1 : la bande partagée en largeur selon la longueur des deux lignes.
 *
 *  - norm(s), lev(a, b), textSim(a, b)
 *  - textLines(texte, {from, to, marginTitles})   {main: [{s, e, text}], margin: [...]} (« Mention en marge : » sépare)
 *  - bandsFromHtr(lignes, {ox, oy})               {main: [bande], margin: [bande]} ; bande = {x, y, w, h, ink, text}
 *  - segment(gris, largeur, hauteur)              {bands, col: {x0, x1}, side: [colonnes à part]}
 *  - align(lignes, bandes)                        {path: [{a: [i…], b: [j…], sim}], mode: 'text' | 'length'}
 *  - link({main, margin}, {main, margin})         {zones, missing: [n° de ligne], doubt, mode}
 *  - compareExtras(zone, o)                       (navigateur) 🪄 sous le texte de la lecture approfondie + la case ▤
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_LIGNES = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const i18n = (s, v) => { const I = (typeof window !== 'undefined' ? window : globalThis).LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════════ textes ═════════ */
    const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ſ/g, 's').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    function lev(a, b) {
        if (a === b) return 0; const n = a.length, m = b.length; if (!n) return m; if (!m) return n;
        let prev = new Array(m + 1), cur = new Array(m + 1);
        for (let j = 0; j <= m; j++) prev[j] = j;
        for (let i = 1; i <= n; i++) {
            cur[0] = i; const ca = a.charCodeAt(i - 1);
            for (let j = 1; j <= m; j++) { const c = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1), d = prev[j] + 1, e = cur[j - 1] + 1; cur[j] = c < d ? (c < e ? c : e) : (d < e ? d : e); }
            [prev, cur] = [cur, prev];
        }
        return prev[m];
    }
    const simN = (a, b) => { const L = Math.max(a.length, b.length); return L ? 1 - lev(a, b) / L : 0; };
    const textSim = (a, b) => simN(norm(a), norm(b));
    const SEP = /^\s*[—–\-_=]{3,}\s*$/;
    /** les lignes non vides du texte (positions dans tout le texte) ; après « Mention en marge : », les lignes de la mention */
    function textLines(text, {from = 0, to, marginTitles = []} = {}) {
        text = String(text ?? ''); const end = to == null ? text.length : Math.min(text.length, to);
        const titles = new Set(['mention en marge', 'mention marginale', 'en marge', ...marginTitles.map(norm)].filter(Boolean));
        const main = [], margin = []; let inMargin = false, pos = from;
        for (const raw of text.slice(from, end).split('\n')) {
            const s = pos; pos += raw.length + 1;
            if (!raw.trim() || SEP.test(raw)) continue;
            if (titles.has(norm(raw))) { inMargin = true; continue; }
            const lead = raw.length - raw.trimStart().length, body = raw.trim();
            (inMargin ? margin : main).push({s: s + lead, e: s + lead + body.length, text: body});
        }
        return {main, margin};
    }

    /* ═════════ les bandes ═════════ */
    /** les lignes de la lecture rapide (boîtes dans l'image lue, décalées de ox, oy) ; les mentions de la marge à part */
    function bandsFromHtr(lines, {ox = 0, oy = 0} = {}) {
        const main = [], margin = [];
        (lines || []).forEach(l => {
            if (!l || !Array.isArray(l.bbox) || l.bbox.length !== 4) return;
            const [x0, y0, x1, y1] = l.bbox.map(Number); if (!(x1 > x0 && y1 > y0)) return;
            const b = {x: x0 + ox, y: y0 + oy, w: x1 - x0, h: y1 - y0, ink: x1 - x0, text: String(l.text || '').trim()};
            (l.kind === 'margin' || l.rotated ? margin : main).push(b);
        });
        return {main, margin};
    }
    const median = a => { const v = [...a].sort((x, y) => x - y); if (!v.length) return 0; const n = v.length; return n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2; };
    function otsu(gray) {
        const hist = new Float64Array(256); for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, best = -1, thr = 127, mb = 0, mf = 255;
        for (let i = 0; i < 256; i++) {
            wB += hist[i]; if (!wB) continue; const wF = gray.length - wB; if (!wF) break;
            sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
            if (v > best) { best = v; thr = i; mb = mB; mf = mF; }
        }
        return {thr, dark: mb, light: mf};
    }
    /**
     * Le découpage simple : gris = valeurs 0–255 (Uint8Array, largeur × hauteur, ligne après ligne).
     * Bande = {x, y, w, h, ink : largeur de l'encre, mass : points d'encre}. Les colonnes d'encre à part (marge) : side.
     */
    function segment(gray, w, h) {
        const out = {bands: [], col: {x0: 0, x1: w}, side: []};
        if (!gray || !w || !h || gray.length < w * h) return out;
        const {thr, dark, light} = otsu(gray);
        if (light - dark < 30) return out; // une page sans encre (ou d'une seule teinte)
        const cut = Math.min(thr, light - 25), ink = new Uint8Array(w * h); let total = 0;
        for (let i = 0; i < w * h; i++) if (gray[i] <= cut) { ink[i] = 1; total++; }
        if (!total || total > .45 * w * h) return out;
        // 1. la colonne du texte : les colonnes d'encre séparées par un blanc large (une mention dans la marge) restent à part
        const col = new Float64Array(w); for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) col[x] += ink[r + x]; }
        const colMin = Math.max(1, h * .004), gapMin = Math.max(4, Math.round(w * .025)), segs = [];
        let cur = null, gap = 0;
        for (let x = 0; x < w; x++) {
            if (col[x] >= colMin) { if (!cur) cur = {x0: x, x1: x + 1, mass: 0}; cur.x1 = x + 1; cur.mass += col[x]; gap = 0; }
            else if (cur && ++gap >= gapMin) { segs.push(cur); cur = null; gap = 0; }
            else if (cur) cur.mass += col[x];
        }
        if (cur) segs.push(cur);
        if (!segs.length) return out;
        const main = segs.reduce((a, b) => (b.mass > a.mass ? b : a));
        out.col = {x0: main.x0, x1: main.x1}; out.side = segs.filter(s => s !== main).map(s => ({x0: s.x0, x1: s.x1}));
        // 2. le profil de projection horizontal dans cette colonne
        const row = new Float64Array(h);
        for (let y = 0; y < h; y++) { const r = y * w; let n = 0; for (let x = main.x0; x < main.x1; x++) n += ink[r + x]; row[y] = n; }
        const rs = new Float64Array(h); for (let y = 0; y < h; y++) { let a = 0, c = 0; for (let k = -1; k <= 1; k++) { const q = y + k; if (q >= 0 && q < h) { a += row[q]; c++; } } rs[y] = a / c; }
        const nz = [...rs].filter(v => v > 0).sort((a, b) => a - b); if (!nz.length) return out;
        const rthr = Math.max(.5, .1 * nz[Math.floor(nz.length * .95)]);
        let runs = []; let y0 = -1;
        for (let y = 0; y <= h; y++) { const on = y < h && rs[y] > rthr; if (on && y0 < 0) y0 = y; if (!on && y0 >= 0) { runs.push({y0, y1: y}); y0 = -1; } }
        const massOf = r => { let n = 0; for (let y = r.y0; y < r.y1; y++) n += row[y]; return n; };
        runs.forEach(r => { r.mass = massOf(r); });
        if (!runs.length) return out;
        // 3. hauteur et pas des lignes (les petits bouts — accents, points — ne comptent pas)
        const medMass = median(runs.map(r => r.mass));
        let big = runs.filter(r => r.mass >= .2 * medMass && r.y1 - r.y0 >= 3); if (!big.length) big = runs;
        let medH = median(big.map(r => r.y1 - r.y0));
        // le pas d'après l'autocorrélation du profil (utile quand les lignes se touchent toutes)
        const mean = rs.reduce((a, b) => a + b, 0) / h, ac = lag => { let s = 0; for (let y = 0; y + lag < h; y++) s += (rs[y] - mean) * (rs[y + lag] - mean); return s / Math.max(1, h - lag); };
        let pitchAc = 0; { const a0 = ac(0) || 1, vals = []; for (let L = 4; L <= Math.floor(h / 2); L++) vals.push([L, ac(L) / a0]);
            for (let k = 1; k < vals.length - 1; k++) if (vals[k][1] > vals[k - 1][1] && vals[k][1] >= vals[k + 1][1] && vals[k][1] > .25) { pitchAc = vals[k][0]; break; } }
        const centers = big.map(r => (r.y0 + r.y1) / 2), gaps = centers.slice(1).map((c, i) => c - centers[i]);
        let pitch = gaps.length ? median(gaps) : medH * 1.5;
        if (pitchAc && medH > 1.5 * pitchAc) { pitch = pitchAc; medH = pitchAc * .7; }
        // 4. les petits bouts rattachés à la bande la plus proche (ou laissés)
        const small = r => r.y1 - r.y0 < .45 * medH && r.mass < .5 * medMass;
        const kept = runs.filter(r => !small(r));
        runs.filter(small).forEach(r => {
            let best = null, bd = Infinity; kept.forEach(k => { const d = r.y1 <= k.y0 ? k.y0 - r.y1 : r.y0 >= k.y1 ? r.y0 - k.y1 : 0; if (d < bd) { bd = d; best = k; } });
            if (best && bd <= .7 * medH) { best.y0 = Math.min(best.y0, r.y0); best.y1 = Math.max(best.y1, r.y1); best.mass += r.mass; }
        });
        // 5. une bande trop haute = des lignes qui se touchent : coupée aux creux du profil
        const bands = [];
        kept.sort((a, b) => a.y0 - b.y0).forEach(r => {
            const H = r.y1 - r.y0, parts = H > 1.55 * Math.max(medH, pitch * .75) ? Math.max(2, Math.round(H / pitch)) : 1;
            if (parts < 2) { bands.push({y0: r.y0, y1: r.y1}); return; }
            let start = r.y0; const step = H / parts;
            for (let k = 1; k < parts; k++) {
                const c = Math.round(r.y0 + k * step), win = Math.max(2, Math.round(step * .3)); let cy = c, cv = Infinity;
                for (let y = Math.max(start + 2, c - win); y <= Math.min(r.y1 - 2, c + win); y++) if (rs[y] < cv) { cv = rs[y]; cy = y; }
                bands.push({y0: start, y1: cy}); start = cy;
            }
            bands.push({y0: start, y1: r.y1});
        });
        // 6. la largeur d'encre de chaque bande (1 % – 99 % de l'encre), les bandes presque vides laissées
        const res = bands.map(b => {
            const cnt = new Float64Array(main.x1 - main.x0); let m = 0;
            for (let y = b.y0; y < b.y1; y++) { const r = y * w; for (let x = main.x0; x < main.x1; x++) if (ink[r + x]) { cnt[x - main.x0]++; m++; } }
            if (!m) return null;
            let acc = 0, xa = 0, xb = cnt.length - 1;
            for (let i = 0; i < cnt.length; i++) { acc += cnt[i]; if (acc >= m * .01) { xa = i; break; } }
            acc = 0; for (let i = cnt.length - 1; i >= 0; i--) { acc += cnt[i]; if (acc >= m * .01) { xb = i; break; } }
            const x = main.x0 + xa, x1 = main.x0 + xb + 1;
            return {x, y: b.y0, w: Math.max(1, x1 - x), h: Math.max(1, b.y1 - b.y0), ink: Math.max(1, x1 - x), mass: m};
        }).filter(Boolean);
        const mm = median(res.map(b => b.mass));
        out.bands = res.filter(b => b.mass >= .15 * mm && b.h >= 2);
        return out;
    }

    /* ═════════ l'alignement ═════════ */
    const T_TEXT = .32, T_LEN = .55, P_SPLIT = .06, P_SKIP_A = .12, P_SKIP_B = .08, D_TEXT = .5, D_LEN = .7;
    /**
     * lignes : [{text}] dans l'ordre ; bandes : [{ink, text?}] dans l'ordre. Rend le chemin : chaque pas {a: [n° de lignes], b: [n° de bandes], sim}
     * (a ou b vide = ligne sans bande, bande sans texte).
     */
    function align(lines, bands) {
        const n = lines.length, m = bands.length;
        const hasText = bands.some(b => norm(b.text).length > 0);
        if (!n || !m) return {path: [...lines.map((_, i) => ({a: [i], b: []})), ...bands.map((_, j) => ({a: [], b: [j]}))], mode: hasText ? 'text' : 'length', scale: 0};
        const L =lines.map(l => norm(l.text).length), NT = lines.map(l => norm(l.text)), BT = bands.map(b => norm(b.text));
        let k = L.reduce((a, b) => a + b, 0) / Math.max(1, bands.reduce((a, b) => a + (b.ink || b.w || 0), 0));
        const cache = new Map();
        const pair = (as, bs) => {
            const key = as.join(',') + '|' + bs.join(','); if (cache.has(key)) return cache.get(key);
            const len = as.reduce((s, i) => s + L[i], 0) + (as.length - 1), ink = bs.reduce((s, j) => s + (bands[j].ink || bands[j].w || 0), 0);
            const a1 = len, b1 = ink * k, ls = a1 > 0 && b1 > 0 ? Math.min(a1, b1) / Math.max(a1, b1) : 0;
            const bt = bs.map(j => BT[j]).filter(Boolean).join(' ');
            let sim = ls, ts = null;
            if (hasText && bt) { ts = simN(as.map(i => NT[i]).join(' '), bt); sim = .78 * ts + .22 * ls; }
            const r = {sim, ts, ls, text: ts != null}; cache.set(key, r); return r;
        };
        const gainOf = r => (r.text ? r.sim - T_TEXT : (r.sim - T_LEN) * .8);
        function run() {
            cache.clear();
            const W = Math.max(6, Math.abs(n - m) + 4), NEG = -1e9;
            const dp = Array.from({length: n + 1}, () => new Float64Array(m + 1).fill(NEG)), bk = Array.from({length: n + 1}, () => new Int8Array(m + 1));
            dp[0][0] = 0;
            const near = (i, j) => Math.abs(i * (m / Math.max(1, n)) - j) <= W + 1;
            for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
                if (i === 0 && j === 0) continue; if (!near(i, j)) continue;
                let best = NEG, mv = 0; const tr = (v, code) => { if (v > best) { best = v; mv = code; } };
                if (i && j && dp[i - 1][j - 1] > NEG) tr(dp[i - 1][j - 1] + gainOf(pair([i - 1], [j - 1])), 1);
                if (i && j > 1 && dp[i - 1][j - 2] > NEG) tr(dp[i - 1][j - 2] + gainOf(pair([i - 1], [j - 2, j - 1])) - P_SPLIT, 2);
                if (i > 1 && j && dp[i - 2][j - 1] > NEG) tr(dp[i - 2][j - 1] + gainOf(pair([i - 2, i - 1], [j - 1])) - P_SPLIT, 3);
                if (j && dp[i][j - 1] > NEG) tr(dp[i][j - 1] - P_SKIP_B, 4);
                if (i && dp[i - 1][j] > NEG) tr(dp[i - 1][j] - P_SKIP_A, 5);
                dp[i][j] = best; bk[i][j] = mv;
            }
            const path = []; let i = n, j = m;
            while (i > 0 || j > 0) {
                const mv = bk[i][j];
                if (mv === 1) { path.push({a: [i - 1], b: [j - 1]}); i--; j--; }
                else if (mv === 2) { path.push({a: [i - 1], b: [j - 2, j - 1]}); i--; j -= 2; }
                else if (mv === 3) { path.push({a: [i - 2, i - 1], b: [j - 1]}); i -= 2; j--; }
                else if (mv === 4) { path.push({a: [], b: [j - 1]}); j--; }
                else if (mv === 5) { path.push({a: [i - 1], b: []}); i--; }
                else break; // hors de la fenêtre (ne devrait pas arriver)
            }
            path.reverse();
            path.forEach(p => { if (p.a.length && p.b.length) { const r = pair(p.a, p.b); p.sim = r.sim; p.text = r.text; } });
            return path;
        }
        let path = run();
        if (!hasText) { // l'échelle lettres / pixel affinée sur les paires 1 ↔ 1 trouvées, puis une seconde fois
            const rat = path.filter(p => p.a.length === 1 && p.b.length === 1 && p.sim > .6).map(p => L[p.a[0]] / Math.max(1, bands[p.b[0]].ink || bands[p.b[0]].w));
            if (rat.length >= 3) { k = median(rat); path = run(); }
        }
        path.forEach(p => { if (p.a.length && p.b.length) p.doubt = p.sim < (p.text ? D_TEXT : D_LEN); });
        return {path, mode: hasText ? 'text' : 'length', scale: k};
    }
    /** une ligne coupée sur deux bandes : la position de la coupure (au mot qui va le mieux) */
    function splitPoint(line, b1, b2) {
        const t = line.text, cuts = []; for (let i = 1; i < t.length; i++) if (t[i] === ' ' && t[i - 1] !== ' ') cuts.push(i);
        if (!cuts.length) return Math.round(t.length / 2);
        if (norm(b1.text) && norm(b2.text)) {
            let best = cuts[0], bv = -1; cuts.forEach(c => { const v = textSim(t.slice(0, c), b1.text) + textSim(t.slice(c), b2.text); if (v > bv) { bv = v; best = c; } }); return best;
        }
        const r = (b1.ink || b1.w) / Math.max(1, (b1.ink || b1.w) + (b2.ink || b2.w)), want = r * t.length;
        return cuts.reduce((a, c) => (Math.abs(c - want) < Math.abs(a - want) ? c : a), cuts[0]);
    }
    const zoneOf = (b, s, e, doubt, sim) => ({x: Math.round(b.x), y: Math.round(b.y), w: Math.max(1, Math.round(b.w)), h: Math.max(1, Math.round(b.h)), s, e, doubt: !!doubt, sim: Math.round((sim || 0) * 100) / 100});
    function zonesOfPath(path, lines, bands) {
        const zones = [], missing = [];
        path.forEach(p => {
            if (!p.b.length) { p.a.forEach(i => missing.push(i)); return; }
            if (!p.a.length) return;
            if (p.a.length === 1 && p.b.length === 1) { const l = lines[p.a[0]]; zones.push(zoneOf(bands[p.b[0]], l.s, l.e, p.doubt, p.sim)); return; }
            if (p.a.length === 1) { // 1 → 2 : la ligne coupée au mot
                const l = lines[p.a[0]], [b1, b2] = p.b.map(j => bands[j]), c = splitPoint(l, b1, b2);
                const e1 = l.s + l.text.slice(0, c).trimEnd().length, s2 = l.s + c + (l.text.slice(c).length - l.text.slice(c).trimStart().length);
                zones.push(zoneOf(b1, l.s, e1, p.doubt, p.sim), zoneOf(b2, s2, l.e, p.doubt, p.sim)); return;
            }
            // 2 → 1 : la bande partagée en largeur selon la longueur des deux lignes
            const b = bands[p.b[0]], [l1, l2] = p.a.map(i => lines[i]), r = norm(l1.text).length / Math.max(1, norm(l1.text).length + norm(l2.text).length), w1 = Math.round(b.w * r);
            zones.push(zoneOf({...b, w: w1}, l1.s, l1.e, p.doubt, p.sim), zoneOf({...b, x: b.x + w1, w: b.w - w1}, l2.s, l2.e, p.doubt, p.sim));
        });
        return {zones, missing};
    }
    /**
     * lines : textLines(…) ; bands : {main, margin} (bandsFromHtr, ou {main: segment(…).bands}).
     * Une ligne du texte qui ressemble nettement à une mention de la marge lue par Kraken y est reliée (où que l'IA l'ait mise).
     */
    function link(lines, bands) {
        let main = [...(lines.main || [])], mLines = [...(lines.margin || [])];
        const mb = bands.margin || [], bb = bands.main || [];
        if (mb.length) {
            const pull = main.filter(l => { const v = Math.max(...mb.map(b => textSim(l.text, b.text))); return v >= .6 && v > Math.max(0, ...bb.map(b => textSim(l.text, b.text))); });
            if (pull.length) { main = main.filter(l => !pull.includes(l)); mLines = [...mLines, ...pull].sort((a, b) => a.s - b.s); }
        }
        const A = align(main, bb), Z = zonesOfPath(A.path, main, bb);
        const zones = [...Z.zones], missing = Z.missing.map(i => main[i]);
        if (mLines.length && mb.length) { const M = align(mLines, mb), ZM = zonesOfPath(M.path, mLines, mb); ZM.zones.forEach(z => { z.margin = true; }); zones.push(...ZM.zones); missing.push(...ZM.missing.map(i => mLines[i])); }
        else missing.push(...mLines);
        zones.sort((a, b) => a.s - b.s);
        return {zones, missing: missing.sort((a, b) => a.s - b.s), doubt: zones.filter(z => z.doubt).length, mode: A.mode, path: A.path};
    }
    /** une image (canvas) en niveaux de gris, réduite à max points de côté → {gray, w, h, k} */
    function grayOf(canvas, max = 1600) {
        const W = canvas.width, H = canvas.height, k = Math.min(1, max / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', {willReadFrequently: true}); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(canvas, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) gray[i] = Math.round(.299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]);
        return {gray, w, h, k};
    }

    /* ═════════ 🪄 où est une correction dans une zone de texte (survol, clavier) ═════════ */
    /** la boîte du texte [s, e) dans la zone de texte, en pixels depuis le haut du contenu (un double caché, mêmes styles) */
    function wordBox(ta, s, e) {
        const cs = getComputedStyle(ta), m = document.createElement('div'), px = v => parseFloat(v) || 0;
        ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize', 'wordBreak', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(k => { m.style[k] = cs[k]; });
        Object.assign(m.style, {position: 'absolute', visibility: 'hidden', top: '0', left: '-99999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', boxSizing: 'content-box', border: '0', width: Math.max(10, ta.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight)) + 'px'});
        const v = ta.value, sp = document.createElement('span'); sp.textContent = v.slice(s, e) || '.';
        m.append(document.createTextNode(v.slice(0, s)), sp, document.createTextNode(v.slice(e) + ' '));
        document.body.append(m); const r = {top: sp.offsetTop, left: sp.offsetLeft, w: sp.offsetWidth, h: sp.offsetHeight}; m.remove();
        return r;
    }
    /**
     * Montre l'endroit d'une proposition : le mot choisi dans la zone de texte (setSelectionRange, sans lui prendre le clavier),
     * la zone défilée pour qu'il soit visible, et un surlignage posé dessus (.h-txl-spot). spot(ta, null) l'enlève.
     */
    function spot(ta, fx) {
        const host = ta?.parentElement; if (!host) return;
        let mk = host.querySelector(':scope > .h-txl-spot');
        if (!fx) { if (mk) mk.hidden = true; return; }
        try { ta.setSelectionRange(fx.s, fx.e); } catch (_) {}
        const b = wordBox(ta, fx.s, fx.e);
        if (b.top < ta.scrollTop || b.top + b.h > ta.scrollTop + ta.clientHeight) ta.scrollTop = Math.max(0, b.top - (ta.clientHeight - b.h) / 2);
        if (!mk) { mk = document.createElement('span'); mk.className = 'h-txl-spot'; mk.setAttribute('aria-hidden', 'true'); host.append(mk); }
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const hr = host.getBoundingClientRect(), tr = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
        const top = tr.top - hr.top + host.scrollTop + (parseFloat(cs.borderTopWidth) || 0) + b.top - ta.scrollTop, left = tr.left - hr.left + host.scrollLeft + (parseFloat(cs.borderLeftWidth) || 0) + b.left - ta.scrollLeft;
        Object.assign(mk.style, {top: top + 'px', left: left + 'px', width: b.w + 'px', height: b.h + 'px'}); mk.hidden = false;
        mk.dataset.s = fx.s; mk.dataset.e = fx.e;
    }
    /** la bulle d'une proposition : ce qu'on propose, et où (« … mil huit cent … » (ligne 1)) */
    function spotTitle(text, fx) {
        const FX = root.LCNDA_HTRFIX, w = FX?.where ? FX.where(text, fx) : null;
        const head = i18n('Correction proposée : « {x} » — clique pour choisir', {x: fx.props[0].value});
        return w ? head + '\n' + i18n('À cet endroit : « {where} » (ligne {n})', {where: [w.before, '[' + w.word + ']', w.after].filter(Boolean).join(' '), n: w.line}) : head;
    }

    /* ═════════ 🪄 dans la fenêtre des deux lectures (heritage-transcribe-acte.js compare → o.onCompare) ═════════ */
    const LINK_KEY = 'genealogie-tx-deep-lines';
    const linkOn = () => { try { return localStorage.getItem(LINK_KEY) !== '0'; } catch (_) { return true; } };
    /**
     * zone : l'élément de la comparaison ; o.fix = ext.htrFix (réglages, lexique, menu d'un mot) ; o.lang, o.place.
     * Sous le texte de la lecture approfondie : les corrections proposées (une proposition = un bouton, ou un clic sur le mot dans
     * le texte), ✓ Accepter les sûres, ↶ Annuler, les mêmes réglages ; et la case « ▤ Relier les lignes à l'image ».
     */
    function compareExtras(zone, o = {}) {
        if (!zone) return;
        const A = () => root.LCNDA_APP, H = o.fix, FX = root.LCNDA_HTRFIX;
        const ta = zone.querySelector('[data-txa-t="deep"]');
        const grid = zone.querySelector('.h-txa-cmp2');
        if (grid && !zone.querySelector('[data-txl-link]')) {
            const lab = document.createElement('label'); lab.className = 'checkbox-line h-txl-linkopt';
            lab.innerHTML = `<input type="checkbox" data-txl-link ${linkOn() ? 'checked' : ''}> ▤ ${esc(i18n('Relier les lignes à l’image (une zone par ligne, comme la lecture rapide)'))}`;
            grid.after(lab);
            lab.querySelector('input').addEventListener('change', e => { try { localStorage.setItem(LINK_KEY, e.target.checked ? '1' : '0'); } catch (_) {} });
        }
        if (!ta || !H || !FX) return;
        const bar = document.createElement('div'); bar.className = 'h-htr-fixbar h-txl-fixbar'; bar.dataset.txlFix = '';
        ta.after(bar);
        let fixes = [], tm = 0; const undo = [], kept = new Set();
        const plural = (n, a, b) => (A()?.plural ? A().plural(n, a, b) : `${n} ${a}`);
        async function run() {
            let lex = null; try { lex = await H.lexicon(o.lang || 'fra', o.place || ''); } catch (_) { lex = null; }
            fixes = lex && H.fixOn() ? FX.propose(ta.value, lex, {level: H.fixLevel(), keep: kept}) : [];
            paint();
        }
        function paint() {
            const sure = fixes.filter(f => f.sure).length;
            bar.innerHTML = `<span class="h-htr-fixn">🪄 ${H.fixOn() ? (fixes.length ? esc(plural(fixes.length, 'correction proposée', 'corrections proposées')) : esc(i18n('Aucune correction à proposer'))) : esc(i18n('Corrections proposées : non'))}</span>
                ${fixes.slice(0, 40).map((f, i) => `<button type="button" class="button small ${f.sure ? '' : 'secondary'}" data-txl-fx="${i}" data-s="${f.s}" data-e="${f.e}" title="${esc(spotTitle(ta.value, f))}">${esc(f.word)} → ${esc(f.props[0].value)}</button>`).join('')}
                ${sure ? `<button type="button" class="button small" data-txl-accept>✓ ${esc(sure > 1 ? i18n('Accepter les {n} propositions sûres', {n: sure}) : i18n('Accepter la proposition sûre'))}</button>` : ''}
                <button type="button" class="button small secondary" data-txl-undo ${undo.length ? '' : 'disabled'}>↶ ${esc(i18n('Annuler'))}</button><span class="spacer"></span>${H.fixSettingsHtml()}`;
            H.bindFixSettings(bar, run); spot(ta, null);
        }
        // 🪄 où est la correction : au survol et au clavier, le mot est choisi et surligné dans le texte (la zone défile jusqu'à lui)
        const fxOf = b => (b && b.dataset.txlFx != null ? fixes[Number(b.dataset.txlFx)] : null);
        const show = e => { const fx = fxOf(e.target.closest?.('[data-txl-fx]')); if (fx) spot(ta, fx); };
        const hide = e => { if (!e.relatedTarget?.closest?.('[data-txl-fx]')) spot(ta, null); };
        bar.addEventListener('mouseover', show); bar.addEventListener('focusin', show);
        bar.addEventListener('mouseout', hide); bar.addEventListener('focusout', hide);
        ta.addEventListener('scroll', () => spot(ta, null));
        function setText(next, label) {
            const old = ta.value; if (next === old) return;
            undo.push(old); ta.value = next; run();
            A()?.undoToast?.(label, {undo: () => { const i = undo.lastIndexOf(old); if (i >= 0) undo.splice(i, 1); ta.value = old; run(); }});
        }
        const menu = (at, fx) => H.menu?.(at, fx, {apply: v => setText(FX.applyFix(ta.value, fx, v), `« ${fx.word} » → « ${v} »`),
            keep: () => { kept.add(fx.word); run(); A()?.undoToast?.(i18n('« {w} » gardé tel quel', {w: fx.word}), {undo: () => { kept.delete(fx.word); run(); }}); },
            addLex: () => H.addToLexicon?.(fx.word, () => run())});
        bar.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.txlFx != null) { const fx = fixes[Number(b.dataset.txlFx)]; if (fx) { spot(ta, fx); menu(b, fx); } return; } // le menu ; « ✓ » remplace le mot à CET endroit (fx.s, fx.e)
            if (b.matches('[data-txl-accept]')) { const s = fixes.filter(f => f.sure); if (s.length) setText(FX.applySure(ta.value, s), plural(s.length, 'proposition sûre acceptée', 'propositions sûres acceptées')); return; }
            if (b.matches('[data-txl-undo]')) { const old = undo.pop(); if (old != null) { ta.value = old; run(); } }
        });
        ta.addEventListener('input', () => { spot(ta, null); clearTimeout(tm); tm = setTimeout(run, 700); });
        ta.addEventListener('click', e => { if (ta.selectionStart !== ta.selectionEnd) return; const c = ta.selectionStart, fx = fixes.find(f => c >= f.s && c <= f.e); if (fx) menu({x: e.clientX, y: e.clientY}, fx); });
        run();
    }

    return {norm, lev, textSim, textLines, bandsFromHtr, otsu, segment, align, splitPoint, link, grayOf, compareExtras, linkOn, LINK_KEY, spot, spotTitle, wordBox};
});
