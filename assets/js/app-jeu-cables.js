/* LCNDA — 🔌 Les câbles (façon « Netwalk », Jeux de la famille, app-jeu-famille.js).
 * Un serveur au milieu, des postes tout autour, des bouts de câble mélangés : tourne chaque case pour tout relier au serveur,
 * sans bout de câble dans le vide. Grille de 4×4 à 15×15 ; mode « bords qui se rejoignent » : un câble qui sort d'un bord
 * revient par le bord d'en face (comme dans Netwalk « wrap ») ; verrouiller une case sûre ; coups et chrono.
 * Les postes peuvent porter le nom d'ancêtres (« Jean MARTIN est relié »). Logique sans écran : window.LCNDA_JEUX_CABLES (testée).
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    const N = 1, E = 2, S = 4, W = 8, DIRS = [[N, -1, 0, S], [E, 0, 1, W], [S, 1, 0, N], [W, 0, -1, E]];
    const rotCW = m => ((m << 1) | (m >> 3)) & 15, rotCCW = m => ((m >> 1) | ((m & 1) << 3)) & 15;
    const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
    /** la case voisine dans une direction (avec ou sans bords qui se rejoignent) → [r, c] | null */
    const nb = (rows, cols, r, c, dr, dc, wrap) => { let y = r + dr, x = c + dc; if (wrap) { y = (y + rows) % rows; x = (x + cols) % cols; } return y >= 0 && x >= 0 && y < rows && x < cols ? [y, x] : null; };
    /** un réseau tiré au hasard (arbre couvrant : chaque case reliée, sans boucle, 3 câbles au plus par case) → {sol, server} */
    function generate(rows, cols, wrap, R) {
        const sol = Array.from({length: rows}, () => Array(cols).fill(0)), seen = Array.from({length: rows}, () => Array(cols).fill(false)), server = [Math.floor(rows / 2), Math.floor(cols / 2)];
        seen[server[0]][server[1]] = true; let front = [];
        const addFront = (r, c) => DIRS.forEach(([b, dr, dc, ob]) => { const q = nb(rows, cols, r, c, dr, dc, wrap); if (q && !seen[q[0]][q[1]]) front.push([r, c, b, q[0], q[1], ob]); });
        addFront(...server); let left = rows * cols - 1;
        while (left > 0 && front.length) {
            front = front.filter(e => !seen[e[3]][e[4]]); if (!front.length) break;
            // de préférence une case qui n'a pas encore 3 câbles (les croix à 4 branches rendent le jeu trop facile)
            const ok = front.filter(e => bits(sol[e[0]][e[1]]) < 3), pool = ok.length ? ok : front, [r, c, b, y, x, ob] = pool[Math.floor(R() * pool.length)];
            sol[r][c] |= b; sol[y][x] |= ob; seen[y][x] = true; left--; addFront(y, x);
        }
        return {sol, server};
    }
    /** les cases reliées au serveur (câbles qui se font face) et les bouts dans le vide */
    function lit(tiles, server, wrap) {
        const rows = tiles.length, cols = tiles[0].length, on = Array.from({length: rows}, () => Array(cols).fill(false)), st = [server]; on[server[0]][server[1]] = true;
        while (st.length) { const [r, c] = st.pop(); DIRS.forEach(([b, dr, dc, ob]) => { if (!(tiles[r][c] & b)) return; const q = nb(rows, cols, r, c, dr, dc, wrap); if (q && (tiles[q[0]][q[1]] & ob) && !on[q[0]][q[1]]) { on[q[0]][q[1]] = true; st.push(q); } }); }
        let loose = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) DIRS.forEach(([b, dr, dc, ob]) => { if (!(tiles[r][c] & b)) return; const q = nb(rows, cols, r, c, dr, dc, wrap); if (!q || !(tiles[q[0]][q[1]] & ob)) loose++; });
        return {on, all: on.every(row => row.every(Boolean)), loose};
    }
    const solved = (tiles, server, wrap) => { const l = lit(tiles, server, wrap); return l.all && l.loose === 0; };
    /** mélanger : chaque case tournée de 0 à 3 quarts de tour (jamais toutes dans le bon sens) */
    function scramble(sol, R) { const t = sol.map(row => row.map(m => { let x = m; const k = Math.floor(R() * 4); for (let i = 0; i < k; i++) x = rotCW(x); return x; })); return t; }
    window.LCNDA_JEUX_CABLES = {generate, lit, solved, scramble, rotCW, rotCCW, bits};
    if (!J()) return;
    J().register({
        key: 'cables', short: 'Câbles', icon: '🔌', label: '🔌 Les câbles (Netwalk)', title: 'Les câbles', eyebrow: 'LES CÂBLES',
        desc: 'Tourne les bouts de câble pour relier tous les postes au serveur, sans câble dans le vide. Avec ou sans bords qui se rejoignent.',
        rulesHint: 'Clic : tourner d’un quart de tour (clic droit ou Maj : dans l’autre sens). Alt+clic ou le mode 🔒 : verrouiller une case sûre.',
        namePh: 'Ex : Le réseau de la famille', fieldsTitle: 'Le réseau',
        scope: false, players: {min: 1, max: 1, def: 1},
        defaults: () => ({rows: 7, cols: 7, wrap: false, names: true}),
        clean: c => ({...c, rows: Math.max(4, Math.min(15, Number(c.rows) || 7)), cols: Math.max(4, Math.min(15, Number(c.cols) || 7)), wrap: !!c.wrap, names: c.names !== false}),
        ready: [{k: 'easy', name: 'Débutant', hint: '5×5', cfg: {rows: 5, cols: 5, wrap: false}}, {k: 'mid', name: 'Moyen', hint: '7×7', cfg: {rows: 7, cols: 7, wrap: false}}, {k: 'hard', name: 'Difficile', hint: '9×9', cfg: {rows: 9, cols: 9, wrap: false}},
            {k: 'wrap', name: 'Expert : bords qui se rejoignent', hint: '9×9, un câble peut passer d’un bord à l’autre', cfg: {rows: 9, cols: 9, wrap: true}}, {k: 'giant', name: 'Géant', hint: '13×13, bords qui se rejoignent', cfg: {rows: 13, cols: 13, wrap: true}}],
        fieldsHtml: (c, h) => `<div class="jf-grid2"><div data-jfc-rows></div><div data-jfc-cols></div></div><div class="jf-checks">${h.toggle('data-jfc-wrap', c.wrap, '🔁 Les bords se rejoignent (un câble qui sort à droite revient à gauche, en haut revient en bas)')}${h.toggle('data-jfc-names', c.names, '👪 Les postes portent le nom d’ancêtres')}</div>`,
        bindFields(form, c, save, {range}) {
            range(form.querySelector('[data-jfc-rows]'), {label: 'Lignes', min: 4, max: 15, value: c.rows, unit: 'lignes', def: 7}, v => { c.rows = v; save(); });
            range(form.querySelector('[data-jfc-cols]'), {label: 'Colonnes', min: 4, max: 15, value: c.cols, unit: 'colonnes', def: 7}, v => { c.cols = v; save(); });
        },
        onChange(t, c) { if (t.matches('[data-jfc-wrap]')) c.wrap = t.checked; if (t.matches('[data-jfc-names]')) c.names = t.checked; },
        async start(c, src, prev) {
            const R = L().rng(c.seed + (prev ? 'r' + prev.round : '')), {sol, server} = generate(c.rows, c.cols, c.wrap, R);
            let tiles = scramble(sol, R); for (let k = 0; k < 5 && solved(tiles, server, c.wrap); k++) tiles = scramble(sol, R);
            const leaves = []; sol.forEach((row, r) => row.forEach((m, cc) => { if (bits(m) === 1 && !(r === server[0] && cc === server[1])) leaves.push([r, cc]); }));
            let names = {};
            if (c.names) { try { const d = await J().loadData(), ppl = L().shuffle(d.persons.filter(x => x.first && !x.living && !x.priv), c.seed); leaves.forEach(([r, cc], i) => { const p = ppl[i % Math.max(1, ppl.length)]; if (p) names[`${r},${cc}`] = {name: `${p.first} ${p.last || ''}`.trim(), ini: `${(p.first || '?')[0]}${(p.last || '')[0] || ''}`}; }); } catch (_) {} }
            return {tiles, server, locks: [], names, moves: 0, ms: 0, startAt: Date.now(), won: false, round: (prev?.round || 0) + 1, best: prev?.best || null, status: 'Réseau à relier'};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, rows = c.rows, cols = c.cols; let lockMode = false, timer = 0;
            const locked = new Set(g.locks || []);
            const tileSvg = (m, on, isServer, leaf) => { const col = on ? '#1f9d55' : '#8a8f99', seg = [[N, '50,50 50,0'], [E, '50,50 100,50'], [S, '50,50 50,100'], [W, '50,50 0,50']].filter(([b]) => m & b).map(([, p]) => `<polyline points="${p}" stroke="${col}" stroke-width="16" stroke-linecap="${leaf || isServer ? 'butt' : 'round'}" fill="none"/>`).join('');
                return `<svg viewBox="0 0 100 100" aria-hidden="true">${seg}${isServer ? `<rect x="24" y="24" width="52" height="52" rx="8" fill="${on ? '#1d4ed8' : '#334'}"/><text x="50" y="60" text-anchor="middle" font-size="30" fill="#fff">⌂</text>` : leaf ? `<rect x="28" y="30" width="44" height="34" rx="5" fill="${on ? '#1f9d55' : '#c9ccd4'}" stroke="#334" stroke-width="3"/><rect x="40" y="64" width="20" height="8" fill="#334"/>` : `<circle cx="50" cy="50" r="10" fill="${col}"/>`}</svg>`; };
            const draw = () => {
                const l = lit(g.tiles, g.server, c.wrap), nOn = l.on.flat().filter(Boolean).length, total = rows * cols, cell = Math.max(26, Math.min(64, Math.floor(Math.min(600, (host.clientWidth || 700) - (window.innerWidth < 900 ? 30 : 330)) / Math.max(rows, cols))));
                api.sub(`Manche ${g.round} · ${rows}×${cols}${c.wrap ? ' · bords qui se rejoignent' : ''}`);
                const linked = Object.entries(g.names || {}).filter(([k]) => { const [r, cc] = k.split(',').map(Number); return l.on[r][cc]; });
                host.innerHTML = `<div class="goose-game-layout jfc"><div class="goose-board-wrap"><div class="jfc-grid ${c.wrap ? 'is-wrap' : ''} ${g.won ? 'is-won' : ''}" style="--rows:${rows};--cols:${cols};--cell:${cell}px" role="grid" aria-label="Le réseau">${g.tiles.map((row, r) => row.map((m, cc) => {
                        const k = `${r},${cc}`, isS = r === g.server[0] && cc === g.server[1], leaf = !isS && bits(m) === 1, nm = g.names?.[k];
                        return `<button type="button" class="jfc-cell ${locked.has(k) ? 'is-locked' : ''}" data-r="${r}" data-c="${cc}" title="${isS ? 'Le serveur' : nm ? esc(nm.name) : ''}" aria-label="Case ${r + 1}, ${cc + 1}${isS ? ' (serveur)' : leaf ? ' (poste)' : ''}${l.on[r][cc] ? ', reliée' : ''}">${tileSvg(m, l.on[r][cc], isS, leaf)}${leaf && nm ? `<small>${esc(nm.ini)}</small>` : ''}</button>`; }).join('')).join('')}</div></div>
                  <aside class="goose-panel"><p class="goose-status jf-big" role="status">${g.won ? `🎉 Tout est relié en ${api.plural(g.moves, 'coup')} et ${fmt(g.ms)} !` : `${nOn} / ${total} cases reliées${l.loose ? ` · ${api.plural(l.loose, 'bout dans le vide', 'bouts dans le vide')}` : ''}`}</p>
                    <p>${api.plural(g.moves, 'coup')} · ⏱ <span data-jfc-time>${fmt(g.won ? g.ms : g.ms + Date.now() - g.startAt)}</span>${g.best ? ` · record ${api.plural(g.best.moves, 'coup')}, ${fmt(g.best.ms)}` : ''}</p>
                    ${g.won ? '' : `<button type="button" class="button small ${lockMode ? '' : 'secondary'}" data-jfc-lockmode aria-pressed="${lockMode}">🔒 Mode verrou ${lockMode ? '(actif)' : ''}</button>`}
                    ${c.wrap ? '<p class="muted jf-small">🔁 Les bords se rejoignent : un câble qui sort d’un côté continue de l’autre côté.</p>' : ''}
                    ${linked.length ? `<details class="jfc-linked"><summary>👪 ${api.plural(linked.length, 'ancêtre relié', 'ancêtres reliés')}</summary><p class="jf-small">${linked.map(([, v]) => esc(v.name)).join(', ')}</p></details>` : ''}
                    <p class="muted jf-small">Clic : tourner · clic droit ou Maj+clic : dans l’autre sens · Alt+clic : verrouiller. Clavier : flèches, Entrée pour tourner, Espace pour verrouiller.</p></aside></div>`;
                bind();
            };
            const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
            const turn = (r, cc, back) => {
                if (g.won) return; const k = `${r},${cc}`; if (locked.has(k)) return api.toast?.('Case verrouillée (Alt+clic pour la déverrouiller).');
                g.tiles[r][cc] = back ? rotCCW(g.tiles[r][cc]) : rotCW(g.tiles[r][cc]); g.moves++;
                if (solved(g.tiles, g.server, c.wrap)) { g.won = true; g.finished = true; g.ms += Date.now() - g.startAt; if (!g.best || g.ms < g.best.ms) g.best = {moves: g.moves, ms: g.ms}; g.status = `Relié en ${g.moves} coups`; }
                api.save(); if (g.won) api.sidebar(); draw(); host.querySelector(`[data-r="${r}"][data-c="${cc}"]`)?.focus();
            };
            const lock = (r, cc) => { const k = `${r},${cc}`; if (locked.has(k)) locked.delete(k); else locked.add(k); g.locks = [...locked]; api.save(); draw(); host.querySelector(`[data-r="${r}"][data-c="${cc}"]`)?.focus(); };
            const bind = () => {
                const grid = host.querySelector('.jfc-grid');
                grid.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; const r = Number(b.dataset.r), cc = Number(b.dataset.c); if (e.altKey || lockMode) return lock(r, cc); turn(r, cc, e.shiftKey); }, {signal: api.signal});
                // clic droit : tourner dans l'autre sens (comme Netwalk) ; le menu du navigateur est seulement bloqué sur la grille
                grid.addEventListener('pointerdown', e => { if (e.button !== 2) return; const b = e.target.closest('[data-r]'); if (!b) return; e.preventDefault(); turn(Number(b.dataset.r), Number(b.dataset.c), true); }, {signal: api.signal});
                grid.addEventListener('contextmenu', e => e.preventDefault()); // la grille part avec son écouteur
                grid.addEventListener('keydown', e => { const b = e.target.closest('[data-r]'); if (!b) return; const r = Number(b.dataset.r), cc = Number(b.dataset.c), d = {ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0]}[e.key];
                    if (d) { e.preventDefault(); host.querySelector(`[data-r="${(r + d[0] + rows) % rows}"][data-c="${(cc + d[1] + cols) % cols}"]`)?.focus(); } else if (e.key === ' ') { e.preventDefault(); lock(r, cc); } else if (e.key === 'Enter') { e.preventDefault(); turn(r, cc, e.shiftKey); } }, {signal: api.signal});
                host.querySelector('[data-jfc-lockmode]')?.addEventListener('click', () => { lockMode = !lockMode; draw(); }, {signal: api.signal});
            };
            // le chrono ne compte que quand la partie est à l'écran
            g.startAt = Date.now(); timer = setInterval(() => { const t = host.querySelector('[data-jfc-time]'); if (!host.isConnected) return clearInterval(timer); if (t && !g.won) t.textContent = fmt(g.ms + Date.now() - g.startAt); }, 1000);
            api.onCleanup(() => { clearInterval(timer); if (!g.won) { g.ms += Date.now() - g.startAt; g.startAt = Date.now(); api.save(); } });
            draw();
        },
    });
})();
