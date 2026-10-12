/**
 * 🚢 Trajets de navires qui ne passent que par la mer.
 * assets/data/sea-mask.bin (fabriqué par scripts/build-sea-mask.js depuis Natural Earth, domaine public) : grille de 0,2°,
 * 1 bit par case, 1 = mer. On cherche le plus court chemin de case en case (A*, distances sur la sphère), puis on le
 * redresse en lignes droites tant qu'elles restent en mer. Les canaux s'ouvrent selon l'année du voyage.
 *   window.LCNDA_SEA.route([[lat, lon], …], année) → [[lat, lon], …] ou null (carte pas encore chargée, ou pas de chemin)
 */
(() => {
    'use strict';
    const COLS = 1800, ROWS = 900, STEP = 0.2, N = COLS * ROWS, R = Math.PI / 180;
    // Canaux : [année d'ouverture, tracé]
    const CANALS = [
        [1869, [[31.30, 32.31], [30.95, 32.31], [30.58, 32.27], [30.30, 32.40], [29.95, 32.56]]],  // Suez
        [1895, [[54.37, 10.15], [54.30, 9.75], [54.10, 9.45], [53.89, 9.14]]],                       // Kiel
        [1914, [[9.38, -79.92], [9.20, -79.85], [9.05, -79.68], [8.92, -79.55]]],                    // Panama
    ];
    let base = null, ocean = null, loading = null;
    const grids = new Map(), cache = new Map();
    const listeners = [];
    function load() {
        loading ??= fetch('assets/data/sea-mask.bin').then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }).then(buf => {
            const bits = new Uint8Array(buf); base = new Uint8Array(N);
            for (let i = 0; i < N; i++) base[i] = (bits[i >> 3] >> (i & 7)) & 1;
            // Mers polaires prises par les glaces : pas de passage du Nord-Ouest ni par le pôle pour un navire d'autrefois
            for (let r = 0; r < ROWS; r++) { const la = latOf(r); if (la > 71.5 || la < -64) base.fill(0, r * COLS, (r + 1) * COLS); }
            // La « vraie » mer : les cases reliées à l'océan (pas un lac ni un étang fermé où un port tomberait par erreur)
            ocean = new Uint8Array(N); const q = new Int32Array(N); let h = 0, tl = 0;
            let s0 = -1; for (const [la, lo] of [[-30, -20], [0, -30], [-40, 80]]) { const i = Math.floor((90 - la) / STEP) * COLS + Math.floor((lo + 180) / STEP); if (base[i]) { s0 = i; break; } }
            if (s0 >= 0) { ocean[s0] = 1; q[tl++] = s0; }
            while (h < tl) { const cur = q[h++], r = Math.floor(cur / COLS), c = cur % COLS;
                for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const nr = r + dr; if (nr < 0 || nr >= ROWS) continue; const ni = nr * COLS + (c + dc + COLS) % COLS; if (base[ni] && !ocean[ni]) { ocean[ni] = 1; q[tl++] = ni; } } }
            listeners.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
        }).catch(() => { loading = null; });
        return loading;
    }
    const cellOf = (lat, lon) => { let c = Math.floor((((lon + 180) % 360) + 360) % 360 / STEP); let r = Math.floor((90 - lat) / STEP); return [Math.max(0, Math.min(ROWS - 1, r)), Math.max(0, Math.min(COLS - 1, c))]; };
    const latOf = r => 90 - (r + 0.5) * STEP, lonOf = c => -180 + (c + 0.5) * STEP;
    function gridFor(year) {
        const open = CANALS.filter(([y]) => !year || year >= y).map(([y]) => y).join(',');
        if (grids.has(open)) return grids.get(open);
        const g = base.slice();
        CANALS.forEach(([y, path]) => {
            if (year && year < y) return;
            for (let i = 0; i + 1 < path.length; i++) {
                const [a1, o1] = path[i], [a2, o2] = path[i + 1], n = Math.ceil(Math.max(Math.abs(a2 - a1), Math.abs(o2 - o1)) / (STEP / 3)) + 1;
                for (let k = 0; k <= n; k++) { const [r, c] = cellOf(a1 + (a2 - a1) * k / n, o1 + (o2 - o1) * k / n); g[r * COLS + c] = 1; if (c + 1 < COLS) g[r * COLS + c + 1] = 1; }
            }
        });
        grids.set(open, g);
        return g;
    }
    /** La case de mer la plus proche (un port est souvent sur une case « terre » de la grille). */
    function snap(g, lat, lon) {
        const [r0, c0] = cellOf(lat, lon);
        const ok = i => base[i] && ocean[i]; // un port s'accroche à la mer, jamais à un canal
        if (ok(r0 * COLS + c0)) return r0 * COLS + c0;
        for (let d = 1; d <= 25; d++) {
            let best = -1, bd = Infinity;
            for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
                const r = r0 + dr, c = (c0 + dc + COLS) % COLS;
                if (r < 0 || r >= ROWS || !ok(r * COLS + c)) continue;
                const dist = dr * dr + dc * dc; if (dist < bd) { bd = dist; best = r * COLS + c; }
            }
            if (best >= 0) return best;
        }
        return -1;
    }
    // Distance angulaire (degrés) entre deux cases : coût d'un pas et estimation pour A*
    const cosLat = new Float64Array(ROWS); for (let r = 0; r < ROWS; r++) cosLat[r] = Math.cos(latOf(r) * R);
    function hav(r1, c1, r2, c2) {
        const p1 = latOf(r1) * R, p2 = latOf(r2) * R; let dl = Math.abs(c2 - c1); if (dl > COLS / 2) dl = COLS - dl; dl *= STEP * R;
        const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / R;
    }
    // Tas binaire réutilisé
    let heapI = new Int32Array(1 << 16), heapF = new Float64Array(1 << 16), size = 0;
    const push = (i, f) => { if (size >= heapI.length) { const ni = new Int32Array(heapI.length * 2), nf = new Float64Array(heapF.length * 2); ni.set(heapI); nf.set(heapF); heapI = ni; heapF = nf; } let k = size++; while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; } heapI[k] = i; heapF[k] = f; };
    const pop = () => { const top = heapI[0], li = heapI[--size], lf = heapF[size]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= size) break; if (c + 1 < size && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c; } heapI[k] = li; heapF[k] = lf; return top; };
    const gScore = new Float32Array(N), parent = new Int32Array(N), stamp = new Uint32Array(N), closed = new Uint32Array(N);
    let run = 0;
    const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    function astar(g, s, t) {
        run++; size = 0;
        const tr = Math.floor(t / COLS), tc = t % COLS;
        stamp[s] = run; gScore[s] = 0; parent[s] = -1; push(s, hav(Math.floor(s / COLS), s % COLS, tr, tc));
        let expanded = 0;
        while (size) {
            const cur = pop();
            if (closed[cur] === run) continue;
            closed[cur] = run;
            if (cur === t) break;
            if (++expanded > 2500000) return null;
            const r = Math.floor(cur / COLS), c = cur % COLS, gc = gScore[cur];
            for (const [dr, dc] of NB) {
                const nr = r + dr; if (nr < 0 || nr >= ROWS) continue;
                const nc = (c + dc + COLS) % COLS, ni = nr * COLS + nc;
                if (!g[ni] || closed[ni] === run) continue;
                // pas en diagonale entre deux cases de terre : on ne « coupe » pas un isthme
                if (dr && dc && !g[r * COLS + nc] && !g[nr * COLS + c]) continue;
                const step = dr && dc ? Math.hypot(STEP * cosLat[r], STEP) : dr ? STEP : STEP * cosLat[r];
                const ng = gc + step;
                if (stamp[ni] === run && ng >= gScore[ni]) continue;
                stamp[ni] = run; gScore[ni] = ng; parent[ni] = cur;
                push(ni, ng + 1.2 * hav(nr, nc, tr, tc)); // estimation un peu forcée : bien plus rapide, trajet presque aussi court
            }
        }
        if (closed[t] !== run) return null;
        const path = []; for (let i = t; i !== -1; i = parent[i]) path.push(i);
        return path.reverse();
    }
    /** La ligne droite entre deux cases reste-t-elle en mer ? */
    function clear(g, a, b) {
        let r1 = Math.floor(a / COLS), c1 = a % COLS, r2 = Math.floor(b / COLS), c2 = b % COLS;
        if (Math.abs(c2 - c1) > COLS / 2) c2 += c2 < c1 ? COLS : -COLS;
        const n = Math.ceil(Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) * 2) + 1;
        for (let k = 1; k < n; k++) { const r = Math.round(r1 + (r2 - r1) * k / n), c = ((Math.round(c1 + (c2 - c1) * k / n)) % COLS + COLS) % COLS; if (!g[r * COLS + c]) return false; }
        return true;
    }
    function straighten(g, path) {
        // on file tout droit tant que la ligne reste en mer, puis on repart du dernier point visible
        const out = [path[0]]; let i = 0;
        while (i < path.length - 1) {
            let k = i + 1;
            while (k + 1 < path.length && clear(g, path[i], path[k + 1])) k++;
            out.push(path[k]); i = k;
        }
        return out;
    }
    /** Points d'un grand cercle (route réelle d'un navire en pleine mer). */
    function arc([a1, o1], [a2, o2], steps) {
        const p1 = a1 * R, l1 = o1 * R, p2 = a2 * R, l2 = o2 * R;
        const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
        if (!d) return [[a1, o1], [a2, o2]];
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const f = i / steps, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
            const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2);
            out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / R, Math.atan2(y, x) / R]);
        }
        return out;
    }
    /** En pleine mer, un long segment droit devient un grand cercle s'il reste en mer tout du long. */
    function curve(g, pts) {
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) / 2 * R));
            if (len > 6) {
                const c = arc(a, b, Math.ceil(len / 1.5));
                const atSea = c.every(([la, lo]) => { const [r, cc] = cellOf(la, lo); return g[r * COLS + cc]; });
                if (atSea) { out.push(...c.slice(1)); continue; }
            }
            out.push(b);
        }
        return out;
    }
    function leg(g, [lat1, lon1], [lat2, lon2]) {
        const s = snap(g, lat1, lon1), t = snap(g, lat2, lon2);
        if (s < 0 || t < 0) return null;
        if (s === t) return [[lat1, lon1], [lat2, lon2]];
        const p = astar(g, s, t); if (!p) return null;
        const pts = straighten(g, p).map(i => [latOf(Math.floor(i / COLS)), lonOf(i % COLS)]);
        return [[lat1, lon1], ...curve(g, pts), [lat2, lon2]];
    }
    /** Traversée complète (plusieurs escales) ; longitudes « déroulées » pour qu'un trajet qui passe le 180e méridien reste continu. */
    function route(coords, year) {
        if (!base || !coords || coords.length < 2) { if (!base) load(); return null; }
        const key = JSON.stringify([coords, year || 0]);
        if (cache.has(key)) return cache.get(key);
        const g = gridFor(Number(year) || 0), out = [];
        for (let i = 0; i + 1 < coords.length; i++) {
            const l = leg(g, coords[i], coords[i + 1]);
            if (!l) { cache.set(key, null); return null; }
            out.push(...(i ? l.slice(1) : l));
        }
        for (let i = 1; i < out.length; i++) { while (out[i][1] - out[i - 1][1] > 180) out[i] = [out[i][0], out[i][1] - 360]; while (out[i][1] - out[i - 1][1] < -180) out[i] = [out[i][0], out[i][1] + 360]; }
        cache.set(key, out);
        return out;
    }
    window.LCNDA_SEA = {route, load, ready: () => !!base, onReady: fn => { if (base) fn(); else { listeners.push(fn); load(); } }};
})();
