/* LCNDA — 🌀 Labyrinthe : le moteur (sans écran). Aussi chargé par Node pour les tests : require('…/app-labyrinthe-core.js').
 *
 *  - rng(graine) : un tirage au sort qui redonne toujours la même suite pour la même graine (même graine = même labyrinthe) ;
 *  - formes : carré, hexagones, rond (anneaux), silhouettes (cœur, arbre, France, étoile) — chaque forme donne un graphe de
 *    cases {id, cx, cy, sides: [{nb, pts}], poly} : un « côté » mène à la case voisine nb (ou -1 : le bord) ;
 *  - algorithmes (sur n'importe quelle forme) : backtracker (longs couloirs), Prim (beaucoup d'impasses), Kruskal
 *    (équilibré), Wilson (tout à fait au hasard) ; boucles ajoutées (0–30 % des impasses ouvertes) ;
 *  - départ et arrivée, chemin le plus court (solve), étapes posées dans les recoins (placeStages), dessin SVG (toSvg).
 */
(function (root) {
    'use strict';

    /* ═════ Hasard à graine ═════ */
    function hashSeed(s) { let h = 2166136261 >>> 0; const t = String(s ?? ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h || 1; }
    function rng(seed) {
        let a = hashSeed(seed);
        const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        r.int = n => Math.floor(r() * n);
        r.pick = list => list[Math.floor(r() * list.length)];
        r.shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
        return r;
    }
    const newSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ═════ Silhouettes (dans un carré 0–1, y vers le bas) ═════ */
    const inPoly = (x, y, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
    const FRANCE = [[.50, .02], [.62, .07], [.80, .10], [.92, .20], [.88, .32], [.84, .42], [.88, .52], [.84, .60], [.94, .70], [.90, .84], [.74, .90], [.62, .86], [.50, .93], [.36, .98], [.22, .92], [.24, .78], [.20, .64], [.14, .52], [.04, .40], [.08, .32], [.22, .34], [.30, .24], [.40, .20], [.44, .10]];
    const STAR = Array.from({length: 10}, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .21 : .5; return [.5 + r * Math.cos(a), .53 + r * Math.sin(a)]; });
    const MASKS = {
        heart: (x, y) => { const X = (x - .5) * 2.4, Y = (.42 - y) * 2.4; const v = X * X + Y * Y - 1; return v * v * v - X * X * Y * Y * Y <= 0; },
        tree: (x, y) => { // feuillage en trois boules + tronc
            const blob = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
            return blob(.5, .30, .27) || blob(.27, .50, .23) || blob(.73, .50, .23) || blob(.5, .56, .24) || (x > .42 && x < .58 && y > .62 && y < .98) || (y > .92 && x > .3 && x < .7);
        },
        france: (x, y) => inPoly(x, y, FRANCE),
        star: (x, y) => inPoly(x, y, STAR),
    };
    const SHAPES = ['square', 'hex', 'round', 'heart', 'tree', 'france', 'star'];

    /* ═════ Formes : le graphe des cases ═════ */
    function keepLargest(cells) { // une silhouette peut laisser des îlots : on garde le plus grand morceau, renuméroté
        const seen = new Int32Array(cells.length).fill(-1); let best = -1, bestN = 0, comp = 0;
        for (let i = 0; i < cells.length; i++) {
            if (seen[i] >= 0) continue; let n = 0; const st = [i]; seen[i] = comp;
            while (st.length) { const c = st.pop(); n++; for (const s of cells[c].sides) if (s.nb >= 0 && seen[s.nb] < 0) { seen[s.nb] = comp; st.push(s.nb); } }
            if (n > bestN) { bestN = n; best = comp; } comp++;
        }
        const map = new Int32Array(cells.length).fill(-1); const out = [];
        cells.forEach((c, i) => { if (seen[i] === best) { map[i] = out.length; out.push(c); } });
        out.forEach((c, i) => { c.id = i; c.sides = c.sides.map(s => ({nb: s.nb >= 0 ? map[s.nb] : -1, pts: s.pts})); });
        return out;
    }
    function buildSquare(W, H, mask) {
        const idx = (x, y) => y * W + x, on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (!mask || mask((x + .5) / W, (y + .5) / H));
        const cells = [];
        const ids = new Int32Array(W * H).fill(-1);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { ids[idx(x, y)] = cells.length; cells.push({x, y}); }
        const id = (x, y) => (on(x, y) ? ids[idx(x, y)] : -1);
        const out = cells.map(({x, y}, i) => ({id: i, gx: x, gy: y, cx: x + .5, cy: y + .5,
            poly: [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]],
            sides: [{nb: id(x, y - 1), pts: [[x, y], [x + 1, y]]}, {nb: id(x + 1, y), pts: [[x + 1, y], [x + 1, y + 1]]}, {nb: id(x, y + 1), pts: [[x + 1, y + 1], [x, y + 1]]}, {nb: id(x - 1, y), pts: [[x, y + 1], [x, y]]}]}));
        const cs = mask ? keepLargest(out) : out;
        return {cells: cs, box: [0, 0, W, H], unit: 1};
    }
    function buildHex(W, H, mask) {
        const s = 1 / Math.sqrt(3), w = 1, vh = 1.5 * s; // côté s, largeur 1 (pointe en haut, lignes impaires décalées)
        const center = (c, r) => [c * w + (r & 1) * w / 2 + w / 2, r * vh + s];
        const on = (c, r) => c >= 0 && r >= 0 && c < W && r < H && (!mask || mask((center(c, r)[0]) / (W + .5), center(c, r)[1] / (H * vh + s / 2)));
        const ids = new Map(); const list = [];
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (on(c, r)) { ids.set(r * W + c, list.length); list.push([c, r]); }
        const id = (c, r) => (on(c, r) ? ids.get(r * W + c) : -1);
        const cells = list.map(([c, r], i) => {
            const [cx, cy] = center(c, r), v = k => { const a = (60 * k - 30) * Math.PI / 180; return [cx + s * Math.cos(a), cy + s * Math.sin(a)]; };
            const odd = r & 1;
            const nbs = [id(c + 1, r), odd ? id(c + 1, r + 1) : id(c, r + 1), odd ? id(c, r + 1) : id(c - 1, r + 1), id(c - 1, r), odd ? id(c, r - 1) : id(c - 1, r - 1), odd ? id(c + 1, r - 1) : id(c, r - 1)];
            return {id: i, cx, cy, poly: [0, 1, 2, 3, 4, 5].map(v), sides: nbs.map((nb, k) => ({nb, pts: [v(k), v(k + 1)]}))};
        });
        const cs = mask ? keepLargest(cells) : cells;
        return {cells: cs, box: [0, 0, W * w + w / 2, (H - 1) * vh + 2 * s], unit: 1};
    }
    function buildRound(R) {
        R = clamp(R, 2, 40);
        const counts = [1, 6];
        for (let i = 2; i <= R; i++) { const prev = counts[i - 1]; counts.push((2 * Math.PI * i) / prev > 1.9 ? prev * 2 : prev); }
        const base = [0]; for (let i = 1; i <= R; i++) base.push(base[i - 1] + counts[i - 1]);
        const id = (i, j) => (i > R ? -1 : base[i] + ((j % counts[i]) + counts[i]) % counts[i]);
        const C = R + 1; // le centre du dessin (rayon extérieur R + 1)
        const P = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
        const arc = (r, a0, a1) => { const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / .25)); return Array.from({length: n + 1}, (_, k) => P(r, a0 + (a1 - a0) * k / n)); };
        const cells = [];
        // la case du milieu : un disque, bordé par les cases de l'anneau 1
        cells.push({id: 0, cx: C, cy: C, ring: 0, poly: arc(1, 0, 2 * Math.PI).slice(0, -1), sides: Array.from({length: counts[1]}, (_, j) => ({nb: id(1, j), pts: arc(1, 2 * Math.PI * j / counts[1], 2 * Math.PI * (j + 1) / counts[1])}))});
        for (let i = 1; i <= R; i++) {
            const n = counts[i], nOut = i < R ? counts[i + 1] : 0;
            for (let j = 0; j < n; j++) {
                const a0 = 2 * Math.PI * j / n, a1 = 2 * Math.PI * (j + 1) / n, am = (a0 + a1) / 2;
                const sides = [];
                sides.push({nb: i === 1 ? 0 : id(i - 1, Math.floor(j * counts[i - 1] / n)), pts: arc(i, a0, a1)});
                if (i === R) sides.push({nb: -1, pts: arc(i + 1, a0, a1)});
                else if (nOut === n) sides.push({nb: id(i + 1, j), pts: arc(i + 1, a0, a1)});
                else { const k = nOut / n; for (let t = 0; t < k; t++) { const b0 = a0 + (a1 - a0) * t / k, b1 = a0 + (a1 - a0) * (t + 1) / k; sides.push({nb: id(i + 1, j * k + t), pts: arc(i + 1, b0, b1)}); } }
                sides.push({nb: id(i, j + 1), pts: [P(i, a1), P(i + 1, a1)]});
                sides.push({nb: id(i, j - 1), pts: [P(i, a0), P(i + 1, a0)]});
                cells.push({id: base[i] + j, cx: P(i + .5, am)[0], cy: P(i + .5, am)[1], ring: i, poly: [...arc(i, a0, a1), ...arc(i + 1, a1, a0)], sides});
            }
        }
        return {cells, box: [0, 0, 2 * C, 2 * C], unit: 1, round: true};
    }
    function buildShape(cfg) {
        const shape = SHAPES.includes(cfg.shape) ? cfg.shape : 'square';
        const W = clamp(Math.round(cfg.w || 20), 4, 80), H = clamp(Math.round(cfg.h || 20), 4, 80);
        if (shape === 'round') return buildRound(Math.round(cfg.rings || Math.round(Math.min(W, H) / 2)));
        if (shape === 'hex') return buildHex(W, H, null);
        return buildSquare(W, H, MASKS[shape] || null);
    }

    /* ═════ Les algorithmes : relier les cases ═════ */
    const ALGOS = {
        backtracker(n, nbs, r) { // de longs couloirs qui serpentent
            const seen = new Uint8Array(n), edges = []; const st = [r.int(n)]; seen[st[0]] = 1;
            while (st.length) { const c = st[st.length - 1]; const open = nbs[c].filter(x => !seen[x]); if (!open.length) { st.pop(); continue; } const x = r.pick(open); seen[x] = 1; edges.push([c, x]); st.push(x); }
            return edges;
        },
        prim(n, nbs, r) { // beaucoup de petites impasses
            const inT = new Uint8Array(n), front = [], inF = new Uint8Array(n), edges = []; const s = r.int(n); inT[s] = 1;
            const add = c => nbs[c].forEach(x => { if (!inT[x] && !inF[x]) { inF[x] = 1; front.push(x); } }); add(s);
            while (front.length) { const k = r.int(front.length), c = front[k]; front[k] = front[front.length - 1]; front.pop(); const into = nbs[c].filter(x => inT[x]); edges.push([c, r.pick(into)]); inT[c] = 1; add(c); }
            return edges;
        },
        kruskal(n, nbs, r) { // équilibré
            const par = Int32Array.from({length: n}, (_, i) => i), find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
            const all = []; for (let c = 0; c < n; c++) for (const x of nbs[c]) if (c < x) all.push([c, x]);
            r.shuffle(all); const edges = [];
            for (const [a, b] of all) { const A = find(a), B = find(b); if (A !== B) { par[A] = B; edges.push([a, b]); } }
            return edges;
        },
        wilson(n, nbs, r) { // tout à fait au hasard (chaque labyrinthe possible a la même chance)
            const inT = new Uint8Array(n), next = new Int32Array(n).fill(-1), edges = []; inT[r.int(n)] = 1; let left = n - 1;
            const order = r.shuffle(Array.from({length: n}, (_, i) => i));
            for (const s of order) {
                if (inT[s]) continue;
                let c = s; while (!inT[c]) { const x = r.pick(nbs[c]); next[c] = x; c = x; } // la marche oublie ses boucles toute seule (next écrasé)
                c = s; while (!inT[c]) { inT[c] = 1; left--; edges.push([c, next[c]]); c = next[c]; }
            }
            return edges;
        },
    };
    const ALGO_NAMES = Object.keys(ALGOS);

    function bfs(links, from) {
        const n = links.length, dist = new Int32Array(n).fill(-1), prev = new Int32Array(n).fill(-1), q = [from]; dist[from] = 0;
        for (let h = 0; h < q.length; h++) { const c = q[h]; for (const x of links[c]) if (dist[x] < 0) { dist[x] = dist[c] + 1; prev[x] = c; q.push(x); } }
        return {dist, prev};
    }
    function solve(maze, a, b) {
        const {prev, dist} = bfs(maze.links, a); if (dist[b] < 0) return [];
        const path = [b]; while (path[path.length - 1] !== a) path.push(prev[path[path.length - 1]]); return path.reverse();
    }
    const farthest = (links, from) => { const {dist} = bfs(links, from); let best = from; for (let i = 0; i < dist.length; i++) if (dist[i] > dist[best]) best = i; return best; };

    /** cfg : {seed, shape, w, h, rings, algo, loops (0–30, %), ends: 'coins'|'loin'|'centre'|'hasard'} */
    function generate(cfg = {}) {
        const seed = String(cfg.seed || 'LCNDA'), r = rng(`${seed}|${cfg.shape}|${cfg.w}|${cfg.h}|${cfg.rings}|${cfg.algo}`);
        const g = buildShape(cfg), cells = g.cells, n = cells.length;
        const nbs = cells.map(c => [...new Set(c.sides.filter(s => s.nb >= 0).map(s => s.nb))]);
        const algo = ALGOS[cfg.algo] ? cfg.algo : 'backtracker';
        const edges = n > 1 ? ALGOS[algo](n, nbs, r) : [];
        const links = cells.map(() => []);
        const link = (a, b) => { if (!links[a].includes(b)) { links[a].push(b); links[b].push(a); } };
        edges.forEach(([a, b]) => link(a, b));
        // boucles : ouvrir une partie des impasses vers une case voisine (de préférence une autre impasse)
        const loops = clamp(Number(cfg.loops) || 0, 0, 30) / 100;
        if (loops > 0) {
            const dead = r.shuffle(cells.map(c => c.id).filter(i => links[i].length === 1));
            const take = Math.round(dead.length * loops);
            for (let k = 0; k < take; k++) {
                const c = dead[k]; if (links[c].length !== 1) continue;
                const closed = nbs[c].filter(x => !links[c].includes(x)); if (!closed.length) continue;
                const pref = closed.filter(x => links[x].length === 1); link(c, r.pick(pref.length ? pref : closed));
            }
        }
        // départ et arrivée
        let start = 0, end = n - 1;
        const ends = ['coins', 'loin', 'centre', 'hasard'].includes(cfg.ends) ? cfg.ends : 'coins';
        if (ends === 'coins') {
            let a = 0, b = 0; cells.forEach(c => { if (c.cx + c.cy < cells[a].cx + cells[a].cy) a = c.id; if (c.cx + c.cy > cells[b].cx + cells[b].cy) b = c.id; });
            if (g.round) { const R = cells[n - 1].ring; a = cells.reduce((m, c) => (c.ring === R && c.cy < cells[m].cy ? c.id : m), n - 1); b = 0; } // rond : du bord (en haut) vers le centre
            start = a; end = b;
        } else if (ends === 'loin') { start = farthest(links, r.int(n)); end = farthest(links, start); }
        else if (ends === 'centre') {
            const [x0, y0, x1, y1] = g.box, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
            start = cells.reduce((m, c) => ((c.cx - mx) ** 2 + (c.cy - my) ** 2 < (cells[m].cx - mx) ** 2 + (cells[m].cy - my) ** 2 ? c.id : m), 0);
            end = farthest(links, start);
        } else {
            start = r.int(n); const {dist} = bfs(links, start); const max = Math.max(...dist);
            const far = cells.map(c => c.id).filter(i => dist[i] >= max * .6); end = far.length ? r.pick(far) : farthest(links, start);
        }
        if (start === end && n > 1) end = farthest(links, start);
        const maze = {seed, cfg: {...cfg}, cells, links, box: g.box, round: !!g.round, start, end, algo};
        maze.solution = solve(maze, start, end);
        maze.deadEnds = cells.filter(c => links[c.id].length === 1).length;
        return maze;
    }

    /** n étapes, bien réparties, de préférence au fond des impasses ; toujours atteignables (le labyrinthe est d'un seul tenant) */
    function placeStages(maze, count, seed = '') {
        const n = maze.cells.length; count = clamp(Math.round(count) || 0, 0, Math.min(12, n - 2)); if (!count) return [];
        const r = rng(`${maze.seed}|etapes|${seed}`), {links, start, end} = maze;
        const near = new Set([start, end, ...links[start], ...links[end]]);
        let cand = r.shuffle(maze.cells.map(c => c.id).filter(i => links[i].length === 1 && !near.has(i)));
        if (cand.length < count) cand = cand.concat(r.shuffle(maze.cells.map(c => c.id).filter(i => !near.has(i) && !cand.includes(i))));
        const chosen = [], minD = new Int32Array(n).fill(1 << 29);
        const mark = from => { const {dist} = bfs(links, from); for (let i = 0; i < n; i++) if (dist[i] >= 0 && dist[i] < minD[i]) minD[i] = dist[i]; };
        mark(start); mark(end);
        while (chosen.length < count && cand.length) {
            let best = -1, bd = -1; for (const c of cand) if (!chosen.includes(c) && minD[c] > bd) { bd = minD[c]; best = c; }
            if (best < 0) break; chosen.push(best); mark(best); cand = cand.filter(c => c !== best);
        }
        return chosen;
    }
    /** le chemin qui passe par des points dans l'ordre : [a, …étapes, b] */
    function route(maze, points) { const out = []; for (let i = 0; i + 1 < points.length; i++) { const p = solve(maze, points[i], points[i + 1]); out.push(...(i ? p.slice(1) : p)); } return out; }
    /** l'ordre le plus court « à peu près » pour ramasser des étapes sans ordre imposé (le plus proche d'abord) */
    function greedyOrder(maze, from, targets) {
        const left = [...targets], out = []; let cur = from;
        while (left.length) { const {dist} = bfs(maze.links, cur); left.sort((a, b) => dist[a] - dist[b]); cur = left.shift(); out.push(cur); }
        return out;
    }

    /* ═════ Le dessin (SVG) ═════ */
    const STYLES = {
        trait: {wall: '#1b1b1b', floor: '#ffffff', path: '#0066cc', bg: '#ffffff'},
        haies: {wall: '#2f6b2f', floor: '#efe6c8', path: '#c0392b', bg: '#dfe9d0'},
        pierres: {wall: '#5f5b55', floor: '#ece8df', path: '#b8561c', bg: '#d8d2c6'},
        parchemin: {wall: '#5b3d1e', floor: '#f3e3bf', path: '#9c2a1c', bg: '#ead6a8'},
    };
    const f2 = v => (Math.round(v * 100) / 100).toString();
    const ptsD = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${f2(p[0])} ${f2(p[1])}`).join('');
    const escX = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** les murs : un seul chemin SVG (un mur partagé n'est tracé qu'une fois) */
    function wallsD(maze) {
        const out = []; const {cells, links, start, end} = maze;
        for (const c of cells) for (const s of c.sides) {
            if (s.nb >= 0 && (c.id > s.nb || links[c.id].includes(s.nb))) continue;
            if (s.nb < 0 && (c.id === start || c.id === end) && !c._door) { c._door = true; continue; } // une porte dans le bord, au départ et à l'arrivée
            out.push(ptsD(s.pts));
        }
        cells.forEach(c => { delete c._door; });
        return out.join('');
    }
    const floorD = maze => maze.cells.map(c => ptsD(c.poly) + 'Z').join('');
    /** opts : {style, wall, floor, path, thick (en % d'une case), solution: [ids], stages: [{cell, icon, n, done, locked}], pawns: [{cell, color}], margin, px, title, showEnds} */
    function toSvg(maze, opts = {}) {
        const st = STYLES[opts.style] || STYLES.trait, wall = opts.wall || st.wall, floor = opts.floor || st.floor, path = opts.path || st.path;
        const th = clamp(Number(opts.thick) || 12, 3, 45) / 100, m = opts.margin ?? 1, [x0, y0, x1, y1] = maze.box;
        const vb = `${f2(x0 - m)} ${f2(y0 - m)} ${f2(x1 - x0 + 2 * m)} ${f2(y1 - y0 + 2 * m)}`;
        const px = opts.px ? ` width="${Math.round((x1 - x0 + 2 * m) * opts.px)}" height="${Math.round((y1 - y0 + 2 * m) * opts.px)}"` : '';
        const C = id => maze.cells[id];
        const filter = opts.style === 'parchemin' ? '<filter id="lb-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale=".09"/></filter>' : '';
        let walls = `<path d="${wallsD(maze)}" fill="none" stroke="${escX(wall)}" stroke-width="${f2(th)}" stroke-linecap="round" stroke-linejoin="round"${filter ? ' filter="url(#lb-rough)"' : ''}/>`;
        if (opts.style === 'haies') walls += `<path d="${wallsD(maze)}" fill="none" stroke="#4f9a45" stroke-width="${f2(th * .45)}" stroke-linecap="round" stroke-dasharray="${f2(th * .4)} ${f2(th * .7)}"/>`;
        if (opts.style === 'pierres') walls += `<path d="${wallsD(maze)}" fill="none" stroke="#8e8a82" stroke-width="${f2(th * .55)}" stroke-dasharray="${f2(th * 1.1)} ${f2(th * .35)}"/>`;
        const sol = opts.solution?.length > 1 ? `<path d="${ptsD(opts.solution.map(i => [C(i).cx, C(i).cy]))}" fill="none" stroke="${escX(path)}" stroke-width="${f2(Math.max(.12, th * 1.1))}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>` : '';
        const tag = (c, txt, bg) => `<g transform="translate(${f2(c.cx)} ${f2(c.cy)})"><circle r=".36" fill="${bg}"/><text y=".02" font-size=".42" text-anchor="middle" dominant-baseline="middle">${escX(txt)}</text></g>`;
        const ends = opts.showEnds === false ? '' : tag(C(maze.start), '🚩', '#ffffffcc') + tag(C(maze.end), '🏁', '#ffffffcc');
        const stages = (opts.stages || []).map(s => { const c = C(s.cell); return `<g transform="translate(${f2(c.cx)} ${f2(c.cy)})" opacity="${s.done ? .25 : s.locked ? .55 : 1}"><circle r=".4" fill="#fff8d6" stroke="#c9a227" stroke-width=".06"/><text y=".03" font-size=".42" text-anchor="middle" dominant-baseline="middle">${escX(s.icon || '★')}</text>${s.n ? `<text x=".32" y="-.26" font-size=".26" font-weight="700" fill="#7a5a00" text-anchor="middle">${s.n}</text>` : ''}</g>`; }).join('');
        const pawns = (opts.pawns || []).map((p, i) => { const c = C(p.cell); return `<circle cx="${f2(c.cx + (i % 2 ? .12 : -.12) * (opts.pawns.length > 1))}" cy="${f2(c.cy + (i > 1 ? .12 : -.12) * (opts.pawns.length > 1))}" r=".3" fill="${escX(p.color)}" stroke="#fff" stroke-width=".07"/>`; }).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${px} role="img" aria-label="${escX(opts.title || 'Labyrinthe')}"><defs>${filter}</defs><rect x="${f2(x0 - m)}" y="${f2(y0 - m)}" width="${f2(x1 - x0 + 2 * m)}" height="${f2(y1 - y0 + 2 * m)}" fill="${escX(opts.bg || st.bg)}"/><path d="${floorD(maze)}" fill="${escX(floor)}"/>${sol}${walls}${ends}${stages}${pawns}</svg>`;
    }

    const api = {rng, newSeed, hashSeed, generate, solve, bfs, placeStages, route, greedyOrder, toSvg, wallsD, floorD, ptsD, STYLES, SHAPES, ALGO_NAMES, MASKS};
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.LCNDA_LABY_CORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
