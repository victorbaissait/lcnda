/* LCNDA — ❌ Morpion à règles libres (Jeux de la famille, app-jeu-famille.js).
 * Grille de 3×3 à 19×19, aligner 3, 4, 5… à la suite, 2 à 6 joueurs, symboles au choix (émoji, lettre ou portrait d'un ancêtre),
 * gravité (« puissance 4 »), diagonales ou pas, grille qui s'agrandit, ordinateur simple ou moyen ; scores de la soirée.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    if (!J()) return;
    const SYMS = ['❌', '⭕', '⭐', '🌳', '♥', '🔺', '🟦', '🌙', '☀️', '🍀', '🐾', '🎲'];
    const AIS = [['', '🙂 Une personne'], ['simple', '🤖 Ordinateur (simple)'], ['moyen', '🤖 Ordinateur (moyen)']];
    const MAXG = 25;
    J().register({
        key: 'morpion', short: 'Morpion', icon: '❌', label: '❌ Morpion à règles libres', title: 'Morpion à règles libres', eyebrow: 'MORPION',
        desc: 'Aligne tes symboles avant les autres : choisis la taille de la grille, combien à la suite, le nombre de joueurs et vos symboles (ou le portrait d’un ancêtre).',
        rulesHint: 'Le premier qui aligne le nombre demandé (en ligne, en colonne et, si on veut, en diagonale) gagne la manche.',
        namePh: 'Ex : Le grand tournoi', fieldsTitle: 'La grille et les règles',
        scope: false, players: {min: 2, max: 6, def: 2},
        playerExtra: i => ({sym: SYMS[i % SYMS.length], letter: '', pid: 0, ptitle: '', ai: ''}),
        defaults: () => ({rows: 3, cols: 3, k: 3, gravity: false, diag: true, grow: false}),
        clean(c) {
            const rows = Math.max(3, Math.min(19, Number(c.rows) || 3)), cols = Math.max(3, Math.min(19, Number(c.cols) || 3));
            c.players.forEach((p, i) => { if (!(SYMS.includes(p.sym) || p.sym === 'lettre' || p.sym === 'portrait')) p.sym = SYMS[i % SYMS.length]; p.letter = String(p.letter || '').trim().slice(0, 2).toUpperCase(); p.pid = Number(p.pid) || 0; p.ai = ['simple', 'moyen'].includes(p.ai) ? p.ai : ''; });
            return {...c, rows, cols, k: Math.max(3, Math.min(10, c.grow && !c.gravity ? 10 : Math.max(rows, cols), Number(c.k) || 3)), gravity: !!c.gravity, diag: c.diag !== false, grow: !!c.grow && !c.gravity};
        },
        ready: [{k: 'classic', name: 'Morpion classique', hint: '3×3, aligner 3', cfg: {rows: 3, cols: 3, k: 3, gravity: false, grow: false}},
            {k: 'p4', name: 'Puissance 4', hint: '6 lignes × 7 colonnes, gravité, aligner 4', cfg: {rows: 6, cols: 7, k: 4, gravity: true, grow: false}},
            {k: 'gomoku', name: 'Cinq à la suite', hint: '15×15, aligner 5', cfg: {rows: 15, cols: 15, k: 5, gravity: false}},
            {k: 'infini', name: 'Grille sans fin', hint: 'Commence en 5×5 et s’agrandit, aligner 5', cfg: {rows: 5, cols: 5, k: 5, grow: true, gravity: false}}],
        fieldsHtml: (c, h) => `<div class="jf-grid2"><div data-jfx-rows></div><div data-jfx-cols></div></div><div data-jfx-k></div>
            <div class="jf-checks">${h.toggle('data-jfx-gravity', c.gravity, '⬇ Gravité (les pions tombent, comme au « puissance 4 »)')}${h.toggle('data-jfx-diag', c.diag, '↗ Les diagonales comptent')}${h.toggle('data-jfx-grow', c.grow, '⤢ La grille s’agrandit quand on joue au bord (sans la gravité)')}</div>`,
        bindFields(form, c, save, {range}) {
            const kSlot = form.querySelector('[data-jfx-k]'), drawK = () => range(kSlot, {label: 'Combien à la suite pour gagner', min: 3, max: Math.max(3, Math.min(10, c.grow ? 10 : Math.max(c.rows, c.cols))), value: Math.min(c.k, c.grow ? 10 : Math.max(c.rows, c.cols)), unit: 'à la suite', def: 3}, v => { c.k = v; save(); });
            range(form.querySelector('[data-jfx-rows]'), {label: 'Lignes', min: 3, max: 19, value: c.rows, unit: 'lignes', def: 3}, v => { c.rows = v; if (c.k > Math.max(c.rows, c.cols) && !c.grow) c.k = Math.max(c.rows, c.cols); save(); drawK(); });
            range(form.querySelector('[data-jfx-cols]'), {label: 'Colonnes', min: 3, max: 19, value: c.cols, unit: 'colonnes', def: 3}, v => { c.cols = v; if (c.k > Math.max(c.rows, c.cols) && !c.grow) c.k = Math.max(c.rows, c.cols); save(); drawK(); });
            drawK();
        },
        onChange(t, c, form) {
            if (t.matches('[data-jfx-gravity]')) { c.gravity = t.checked; if (c.gravity) { c.grow = false; const g = form.querySelector('[data-jfx-grow]'); if (g) g.checked = false; } }
            if (t.matches('[data-jfx-diag]')) c.diag = t.checked;
            if (t.matches('[data-jfx-grow]')) { c.grow = t.checked; if (c.grow) { c.gravity = false; const g = form.querySelector('[data-jfx-gravity]'); if (g) g.checked = false; } }
            if (t.name === 'psym') { c.players[Number(t.closest('[data-i]').dataset.i)].sym = t.value; return 'players'; }
            if (t.name === 'pai') c.players[Number(t.closest('[data-i]').dataset.i)].ai = t.value;
        },
        onInput(t, c) { if (t.name === 'pletter') { const p = c.players[Number(t.closest('[data-i]').dataset.i)]; p.letter = t.value.trim().slice(0, 2).toUpperCase(); } },
        onPicker(e, c) { const row = e.target.closest('[data-i]'); if (!row) return; const it = e.detail?.item || (e.detail?.items || [])[0], p = c.players[Number(row.dataset.i)]; p.pid = it && !it.free ? Number(it.id) : 0; p.ptitle = it?.title || ''; },
        playerFields(p, i, h) {
            const PK = window.LCNDA_PICKER || window.LCNDA_APP;
            return `<label>Symbole<select name="psym">${SYMS.map(s => `<option value="${s}" ${p.sym === s ? 'selected' : ''}>${s}</option>`).join('')}<option value="lettre" ${p.sym === 'lettre' ? 'selected' : ''}>Une lettre…</option><option value="portrait" ${p.sym === 'portrait' ? 'selected' : ''}>Le portrait d’un ancêtre…</option></select></label>
                ${p.sym === 'lettre' ? `<label>Lettre<input name="pletter" maxlength="2" value="${h.esc(p.letter)}" size="3" placeholder="A"></label>` : ''}
                ${p.sym === 'portrait' && PK?.pickerField ? `<div class="jfx-pk"><span class="pk-lab">Ancêtre</span>${PK.pickerField({name: `ppid${i}`, kind: 'person', value: p.pid ? {id: p.pid, title: p.ptitle} : null})}</div>` : ''}
                <label>Qui joue<select name="pai">${AIS.map(([v, t]) => `<option value="${v}" ${p.ai === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
        },
        async start(c, src, prev) {
            if (c.players.every(p => p.ai)) return {error: 'Il faut au moins une personne pour jouer (sinon les ordinateurs jouent tout seuls).'};
            if (c.players.some(p => p.sym === 'portrait' && !p.pid)) return {error: 'Choisis l’ancêtre de chaque joueur qui a le symbole « portrait ».'};
            const syms = c.players.map(p => (p.sym === 'lettre' ? 'L:' + (p.letter || '?') : p.sym === 'portrait' ? 'P:' + p.pid : p.sym));
            if (new Set(syms).size !== syms.length) return {error: 'Deux joueurs ont le même symbole : choisis-en un différent pour chacun.'};
            let photos = {};
            if (c.players.some(p => p.sym === 'portrait')) { try { const d = await J().loadData(); d.persons.forEach(x => { if (c.players.some(p => p.pid === x.id)) photos[x.id] = {photo: x.photo, first: x.first, last: x.last, g: x.g}; }); } catch (_) {} }
            const starter = prev ? ((prev.starter ?? 0) + 1) % c.players.length : 0;
            return {board: L().emptyBoard(c.rows, c.cols), turn: starter, starter, moves: [], line: null, winner: -1, draw: false, photos, score: prev?.score?.length === c.players.length ? prev.score : c.players.map(() => 0), round: (prev?.round || 0) + 1, status: 'Manche en cours'};
        },
        mount(host, g, api) {
            const {esc} = api, L_ = api.L, c = g.cfg, P = c.players, name = i => P[i]?.name || `Joueur ${i + 1}`;
            let aiT = 0, focus = null;
            const symHtml = (i, size = 34) => { const p = P[i]; if (p.sym === 'lettre') return `<span class="jfx-sym jfx-let" style="--pc:${esc(p.color)}">${esc(p.letter || '?')}</span>`;
                if (p.sym === 'portrait') { const x = g.photos?.[p.pid] || {}; return api.avatar({id: p.pid, first: x.first || p.ptitle, last: x.last || '', g: x.g || 'u', photo: x.photo || ''}, size); }
                return `<span class="jfx-sym" style="--pc:${esc(p.color)}">${p.sym}</span>`; };
            const over = () => g.winner >= 0 || g.draw;
            const draw = () => {
                const rows = g.board.length, cols = g.board[0].length, win = new Set((g.line || []).map(([r, cc]) => `${r},${cc}`)), moves = new Set(L_.morpionMoves(g.board, c.gravity).map(([r, cc]) => `${r},${cc}`));
                api.sub(`Manche ${g.round} · aligner ${c.k}${c.gravity ? ' · gravité' : ''}${c.diag ? '' : ' · sans diagonales'}${c.grow ? ' · grille qui s’agrandit' : ''} · ${rows}×${cols}`);
                const room = Math.min(560, Math.max(200, (host.clientWidth || 600) - (window.innerWidth < 900 ? 40 : 360))), cell = Math.max(22, Math.min(64, Math.floor(room / Math.max(rows, cols)))); // la grille tient dans l'écran (téléphone compris)
                host.innerHTML = `<div class="goose-game-layout jfx"><div class="goose-board-wrap jfx-wrap"><div class="jfx-grid ${c.gravity ? 'is-gravity' : ''}" style="--rows:${rows};--cols:${cols};--cell:${cell}px" role="grid" aria-label="La grille">${g.board.map((row, r) => row.map((v, cc) => {
                        const k = `${r},${cc}`, can = !over() && v < 0 && (!c.gravity || moves.has(k));
                        return `<button type="button" class="jfx-cell ${win.has(k) ? 'is-win' : ''} ${g.moves.at(-1)?.[0] === r && g.moves.at(-1)?.[1] === cc ? 'is-last' : ''}" data-r="${r}" data-c="${cc}" ${!can && !(c.gravity && !over() && v < 0) ? 'aria-disabled="true"' : ''} aria-label="Ligne ${r + 1}, colonne ${cc + 1}${v >= 0 ? ` : ${esc(name(v))}` : ''}">${v >= 0 ? symHtml(v, cell > 40 ? 34 : 22) : ''}</button>`; }).join('')).join('')}</div></div>
                  <aside class="goose-panel"><div class="jf-turns">${P.map((p, i) => `<span class="jf-turn ${i === g.turn && !over() ? 'is-on' : ''}" style="--pc:${esc(p.color)}">${symHtml(i, 22)}${esc(p.name)}${p.ai ? ' 🤖' : ''}<small>${api.plural(g.score[i], 'manche gagnée', 'manches gagnées')}</small></span>`).join('')}</div>
                    <p class="goose-status jf-big" role="status">${g.winner >= 0 ? `🎉 ${esc(name(g.winner))} gagne la manche !` : g.draw ? '🤝 Match nul : la grille est pleine.' : `À ${esc(name(g.turn))} de jouer${P[g.turn].ai ? ' (l’ordinateur réfléchit…)' : ''}.`}</p>
                    ${over() ? '<p class="muted jf-small">« ↻ Rejouer » en haut : une nouvelle manche, les scores de la soirée sont gardés.</p>' : `<button type="button" class="button small secondary" data-undo ${g.moves.length ? '' : 'disabled'}>↶ Annuler le dernier coup</button>`}
                    <p class="muted jf-small">Clavier : flèches puis Entrée.${c.gravity ? ' Avec la gravité, une case de la colonne suffit : le pion tombe.' : ''}</p></aside></div>`;
                bind();
                if (focus) host.querySelector(`[data-r="${focus[0]}"][data-c="${focus[1]}"]`)?.focus();
                maybeAI();
            };
            const play = (r, cc) => {
                if (over()) return;
                if (c.gravity) { const d = L_.morpionDrop(g.board, cc); if (!d) return; [r, cc] = d; } else if (g.board[r]?.[cc] !== -1) return;
                g.board[r][cc] = g.turn; g.moves.push([r, cc, g.turn]);
                let line = L_.morpionLine(g.board, r, cc, c.k, c.diag);
                if (!line && c.grow) { const gr = L_.morpionGrow(g.board, r, cc, MAXG); if (gr.board.length !== g.board.length || gr.board[0].length !== g.board[0].length) { const dr = gr.r - r, dc = gr.c - cc; g.board = gr.board; g.moves = g.moves.map(([a, b, w]) => [a + dr, b + dc, w]); r = gr.r; cc = gr.c; } }
                if (line) { g.line = line; g.winner = g.turn; g.score[g.turn]++; g.finished = true; g.status = `${name(g.turn)} a gagné`; }
                else if (!L_.morpionMoves(g.board, c.gravity).length) { g.draw = true; g.finished = true; g.status = 'Match nul'; }
                else g.turn = (g.turn + 1) % P.length;
                focus = [r, cc]; api.save(); api.sidebar(); draw();
            };
            const maybeAI = () => { clearTimeout(aiT); if (over() || !P[g.turn]?.ai) return; aiT = setTimeout(() => { if (!host.isConnected || over()) return; const m = L_.morpionAI(g.board, g.turn, {k: c.k, gravity: c.gravity, diag: c.diag, level: P[g.turn].ai, players: P.length}); if (m) play(m[0], m[1]); }, document.documentElement.classList.contains('a11y-calm') ? 150 : 450); };
            const bind = () => {
                const grid = host.querySelector('.jfx-grid');
                grid.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b || P[g.turn]?.ai) return; play(Number(b.dataset.r), Number(b.dataset.c)); }, {signal: api.signal});
                grid.addEventListener('keydown', e => { const b = e.target.closest('[data-r]'); if (!b) return; const r = Number(b.dataset.r), cc = Number(b.dataset.c), d = {ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0]}[e.key]; if (!d) return; e.preventDefault(); host.querySelector(`[data-r="${r + d[0]}"][data-c="${cc + d[1]}"]`)?.focus(); }, {signal: api.signal});
                host.querySelector('[data-undo]')?.addEventListener('click', () => {
                    // on défait jusqu'au dernier coup d'une personne (les coups de l'ordinateur qui ont suivi aussi)
                    do { const m = g.moves.pop(); if (!m) break; g.board[m[0]][m[1]] = -1; g.turn = m[2]; } while (g.moves.length && P[g.turn].ai);
                    api.save(); draw();
                }, {signal: api.signal});
            };
            api.onCleanup(() => clearTimeout(aiT));
            draw();
        },
    });
})();
