/* LCNDA — ⚓ Bataille navale (Jeux de la famille, app-jeu-famille.js).
 * Contre l'ordinateur (simple ou malin) ou à deux sur le même écran (un écran de passage cache la flotte de l'autre).
 * Grille de 6×6 à 15×15, flotte petite, classique ou grande, navires qui ne se touchent pas, « on rejoue quand on touche » au choix ;
 * les navires peuvent porter le nom d'ancêtres de la généalogie (« Le Jean MARTIN coule ! »).
 * La logique sans écran (placer la flotte, tirer, l'ordinateur) est dans window.LCNDA_JEUX_NAVAL (testée).
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    const FLEETS = {petite: [4, 3, 3, 2], classique: [5, 4, 3, 3, 2], grande: [5, 4, 4, 3, 3, 2, 2]};
    const KIND = {5: 'Porte-avions', 4: 'Croiseur', 3: 'Frégate', 2: 'Sous-marin'};
    const AIS = [['', '🙂 Une personne'], ['simple', '🤖 Ordinateur (simple)'], ['moyen', '🤖 Ordinateur (malin)']];
    /** la flotte posée au hasard : [{size, cells: [[r, c]…]}] ; les navires ne se touchent pas (même en diagonale) quand c'est possible */
    function placeFleet(rows, cols, sizes, R) {
        for (let attempt = 0; attempt < 60; attempt++) {
            const taken = new Set(), ships = [], spaced = attempt < 50; let ok = true;
            for (const size of sizes) {
                let placed = false;
                for (let t = 0; t < 400 && !placed; t++) {
                    const fitH = size <= cols, fitV = size <= rows; if (!fitH && !fitV) break; // trop long pour cette mer
                    const hz = fitH && fitV ? R() < 0.5 : fitH, r = Math.floor(R() * (hz ? rows : rows - size + 1)), c = Math.floor(R() * (hz ? cols - size + 1 : cols));
                    const cells = Array.from({length: size}, (_, k) => (hz ? [r, c + k] : [r + k, c]));
                    if (cells.some(([y, x]) => { for (let dy = spaced ? -1 : 0; dy <= (spaced ? 1 : 0); dy++) for (let dx = spaced ? -1 : 0; dx <= (spaced ? 1 : 0); dx++) if (taken.has(`${y + dy},${x + dx}`)) return true; return false; })) continue;
                    cells.forEach(([y, x]) => taken.add(`${y},${x}`)); ships.push({size, cells, sunk: false}); placed = true;
                }
                if (!placed) { ok = false; break; }
            }
            if (ok) return ships;
        }
        throw new Error('La flotte ne tient pas dans cette grille : prends une grille plus grande ou une flotte plus petite.');
    }
    const grid = (rows, cols) => Array.from({length: rows}, () => Array(cols).fill(0)); // 0 rien, 1 à l'eau, 2 touché, 3 coulé
    /** un tir sur un plateau {ships, shots} → {res: 'eau'|'touche'|'coule'|'deja', ship} */
    function fire(board, r, c) {
        if (board.shots[r]?.[c] === undefined) return {res: 'hors'};
        if (board.shots[r][c]) return {res: 'deja'};
        const ship = board.ships.find(s => s.cells.some(([y, x]) => y === r && x === c));
        if (!ship) { board.shots[r][c] = 1; return {res: 'eau'}; }
        board.shots[r][c] = 2;
        if (ship.cells.every(([y, x]) => board.shots[y][x] >= 2)) { ship.sunk = true; ship.cells.forEach(([y, x]) => { board.shots[y][x] = 3; }); return {res: 'coule', ship}; }
        return {res: 'touche', ship};
    }
    const allSunk = board => board.ships.every(s => s.sunk);
    /** le tir de l'ordinateur : au hasard (simple) ou en chasse (malin : autour des touches, puis en damier) */
    function aiShot(shots, level, R) {
        const rows = shots.length, cols = shots[0].length, free = [], at = (r, c) => (r >= 0 && c >= 0 && r < rows && c < cols ? shots[r][c] : -1);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!shots[r][c]) free.push([r, c]);
        if (!free.length) return null;
        if (level === 'moyen') {
            const hits = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (shots[r][c] === 2) hits.push([r, c]);
            if (hits.length) {
                // deux touches alignées : on continue dans l'axe ; sinon autour
                const cand = [];
                hits.forEach(([r, c]) => {
                    const h = at(r, c - 1) === 2 || at(r, c + 1) === 2, v = at(r - 1, c) === 2 || at(r + 1, c) === 2;
                    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => { if ((h && dr) || (v && dc)) return; let y = r + dr, x = c + dc; while (at(y, x) === 2) { y += dr; x += dc; } if (at(y, x) === 0) cand.push([y, x]); });
                });
                if (cand.length) return cand[Math.floor(R() * cand.length)];
            }
            const even = free.filter(([r, c]) => (r + c) % 2 === 0); if (even.length) return even[Math.floor(R() * even.length)];
        }
        return free[Math.floor(R() * free.length)];
    }
    window.LCNDA_JEUX_NAVAL = {placeFleet, fire, aiShot, allSunk, grid, FLEETS};
    if (!J()) return;
    J().register({
        key: 'naval', short: 'Bataille navale', icon: '⚓', label: '⚓ Bataille navale', title: 'Bataille navale', eyebrow: 'BATAILLE NAVALE',
        desc: 'Coule la flotte de l’autre avant qu’il ne coule la tienne : contre l’ordinateur, ou à deux sur le même écran. Les navires peuvent porter le nom de tes ancêtres.',
        rulesHint: 'Un clic sur la grille de l’adversaire pour tirer : « à l’eau », « touché » ou « coulé ». Le premier qui coule toute la flotte gagne.',
        namePh: 'Ex : La revanche de Mamie', fieldsTitle: 'La mer et la flotte',
        scope: false, players: {min: 2, max: 2, def: 2},
        playerExtra: i => ({ai: i === 1 ? 'moyen' : ''}),
        defaults: () => ({size: 10, fleet: 'classique', again: false, names: true}),
        clean: c => { c.players.forEach(p => { p.ai = ['simple', 'moyen'].includes(p.ai) ? p.ai : ''; }); return {...c, size: Math.max(6, Math.min(15, Number(c.size) || 10)), fleet: FLEETS[c.fleet] ? c.fleet : 'classique', again: !!c.again, names: c.names !== false}; },
        ready: [{k: 'mini', name: 'Petite mer', hint: '7×7, petite flotte', cfg: {size: 7, fleet: 'petite'}}, {k: 'classic', name: 'Bataille classique', hint: '10×10, 5 navires', cfg: {size: 10, fleet: 'classique'}},
            {k: 'big', name: 'Grande escadre', hint: '14×14, 7 navires', cfg: {size: 14, fleet: 'grande'}}, {k: 'rafale', name: 'En rafale', hint: '10×10, on rejoue quand on touche', cfg: {size: 10, fleet: 'classique', again: true}}],
        fieldsHtml: (c, h) => `<div data-jfn-size></div><div class="jf-row"><span class="jf-lab">La flotte</span>${h.seg('fleet', [['petite', 'Petite (4 navires)'], ['classique', 'Classique (5)'], ['grande', 'Grande (7)']], c.fleet)}</div>
            <div class="jf-checks">${h.toggle('data-jfn-again', c.again, '🎯 On rejoue quand on touche')}${h.toggle('data-jfn-names', c.names, '⚓ Les navires portent le nom d’ancêtres')}</div>`,
        bindFields: (form, c, save, {range}) => range(form.querySelector('[data-jfn-size]'), {label: 'Taille de la mer', min: 6, max: 15, value: c.size, unit: 'cases de côté', def: 10}, v => { c.size = v; save(); }),
        onSeg: (k, v, c) => { if (k === 'fleet') c.fleet = v; },
        onChange(t, c) { if (t.matches('[data-jfn-again]')) c.again = t.checked; if (t.matches('[data-jfn-names]')) c.names = t.checked; if (t.name === 'pai') c.players[Number(t.closest('[data-i]').dataset.i)].ai = t.value; },
        playerFields: (p, i, h) => `<label>Qui joue<select name="pai">${AIS.map(([v, t]) => `<option value="${v}" ${p.ai === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`,
        async start(c, src, prev) {
            if (c.players.every(p => p.ai)) return {error: 'Il faut au moins une personne pour jouer.'};
            const R = L().rng(c.seed + (prev ? prev.round : '')), sizes = FLEETS[c.fleet];
            let names = [];
            if (c.names) { try { const d = await J().loadData(); names = L().shuffle(d.persons.filter(x => !x.living && !x.priv && x.first && x.last).map(x => `${x.first} ${String(x.last).toUpperCase()}`), c.seed); } catch (_) {} }
            let boards;
            try { boards = [0, 1].map(i => ({ships: placeFleet(c.size, c.size, sizes, R).map((s, k) => ({...s, name: names[i * sizes.length + k] ? `le ${names[i * sizes.length + k]}` : `${KIND[s.size] || 'Navire'} ${k + 1}`, kind: KIND[s.size] || 'Navire'})), shots: grid(c.size, c.size)})); }
            catch (e) { return {error: e.message}; }
            const turn = prev ? ((prev.starter ?? 0) + 1) % 2 : 0;
            return {boards, turn, starter: turn, winner: -1, log: [], veil: c.players.every(p => !p.ai), score: prev?.score?.length === 2 ? prev.score : [0, 0], round: (prev?.round || 0) + 1, shots: [0, 0], status: 'Bataille en cours'};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, P = c.players, name = i => P[i]?.name || `Joueur ${i + 1}`, R = L().rng(c.seed + 'ia' + g.round + g.log.length), two = P.every(p => !p.ai);
            let aiT = 0;
            const viewer = () => (two ? g.turn : P.findIndex(p => !p.ai)), over = () => g.winner >= 0;
            const cellHtml = (b, r, cc, own, shoot) => { const s = b.shots[r][cc], ship = own || s === 3 ? b.ships.find(x => x.cells.some(([y, x2]) => y === r && x2 === cc)) : null;
                const cls = s === 1 ? 'is-miss' : s === 2 ? 'is-hit' : s === 3 ? 'is-sunk' : ship ? 'is-ship' : '';
                return `<button type="button" class="jfn-cell ${cls}" data-r="${r}" data-c="${cc}" ${shoot && !s ? '' : 'aria-disabled="true"'} title="${ship && (own || s === 3) ? esc(ship.name) : ''}" aria-label="${String.fromCharCode(65 + cc)}${r + 1}${s === 1 ? ' : à l’eau' : s === 2 ? ' : touché' : s === 3 ? ' : coulé' : ''}">${s === 1 ? '•' : s >= 2 ? '✕' : ''}</button>`; };
            const gridHtml = (bi, own, shoot) => { const b = g.boards[bi], n = c.size, cell = Math.max(22, Math.min(40, Math.floor(Math.min(420, ((host.clientWidth || 900) - 80) / 2) / (n + 1))));
                return `<div class="jfn-sea ${shoot ? 'is-target' : ''}" style="--n:${n};--cell:${cell}px" ${shoot ? 'data-shoot' : ''}><span></span>${Array.from({length: n}, (_, k) => `<b>${String.fromCharCode(65 + k)}</b>`).join('')}${b.shots.map((row, r) => `<b>${r + 1}</b>${row.map((_, cc) => cellHtml(b, r, cc, own, shoot)).join('')}`).join('')}</div>`; };
            const fleetHtml = (bi, reveal) => `<ul class="jfn-fleet">${g.boards[bi].ships.map(s => `<li class="${s.sunk ? 'is-sunk' : ''}">${'■'.repeat(s.size)} <span>${reveal || s.sunk ? esc(s.name) : '?'}</span></li>`).join('')}</ul>`; // les noms de l'adversaire : quand le navire est coulé
            const draw = () => {
                const v = viewer(), foe = 1 - v, myTurn = !over() && g.turn === v && !P[g.turn].ai;
                api.sub(`Manche ${g.round} · ${c.size}×${c.size} · ${g.boards[0].ships.length} navires${c.again ? ' · on rejoue quand on touche' : ''}`);
                if (two && g.veil && !over()) { host.innerHTML = `<div class="jfn-veil"><p class="jf-big">🙈 ${esc(name(g.turn))}, à toi : que ${esc(name(1 - g.turn))} détourne les yeux.</p><button type="button" class="button" data-jfn-lift>Je suis ${esc(name(g.turn))} : voir ma mer</button></div>`;
                    host.querySelector('[data-jfn-lift]').addEventListener('click', () => { g.veil = false; draw(); }, {signal: api.signal}); return; }
                host.innerHTML = `<div class="goose-game-layout jfn"><div class="jfn-seas">
                    <section><h3>🎯 La mer de ${esc(name(foe))}</h3>${gridHtml(foe, over(), myTurn)}${fleetHtml(foe, over())}</section>
                    <section><h3>⚓ Ta flotte${two ? ` (${esc(name(v))})` : ''}</h3>${gridHtml(v, true, false)}${fleetHtml(v, true)}</section></div>
                  <aside class="goose-panel"><div class="jf-turns">${P.map((p, i) => `<span class="jf-turn ${i === g.turn && !over() ? 'is-on' : ''}" style="--pc:${esc(p.color)}">${esc(p.name)}${p.ai ? ' 🤖' : ''}<small>${api.plural(g.boards[1 - i].ships.filter(s => s.sunk).length, 'navire coulé', 'navires coulés')} · ${api.plural(g.score[i], 'manche gagnée', 'manches gagnées')}</small></span>`).join('')}</div>
                    <p class="goose-status jf-big" role="status">${over() ? `🎉 ${esc(name(g.winner))} a coulé toute la flotte !` : myTurn ? `À toi de tirer, ${esc(name(v))} : clique sur la mer de ${esc(name(foe))}.` : `${esc(name(g.turn))} vise…`}</p>
                    <ol class="jfn-log">${g.log.slice(-8).reverse().map(l => `<li>${esc(l)}</li>`).join('')}</ol>${over() ? '<p class="muted jf-small">« ↻ Rejouer » en haut : une nouvelle manche, les scores sont gardés.</p>' : ''}</aside></div>`;
                host.querySelector('[data-shoot]')?.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) shoot(Number(b.dataset.r), Number(b.dataset.c)); }, {signal: api.signal});
                maybeAI();
            };
            const shoot = (r, cc) => {
                if (over()) return; const who = g.turn, b = g.boards[1 - who], res = fire(b, r, cc); if (res.res === 'deja' || res.res === 'hors') return;
                g.shots[who]++; const at = `${String.fromCharCode(65 + cc)}${r + 1}`;
                g.log.push(`${name(who)} : ${at} — ${res.res === 'eau' ? 'à l’eau' : res.res === 'touche' ? 'touché !' : `coulé : ${res.ship.name} (${res.ship.kind.toLowerCase()})`}`);
                if (allSunk(b)) { g.winner = who; g.score[who]++; g.finished = true; g.status = `${name(who)} a gagné en ${g.shots[who]} tirs`; }
                else if (!(c.again && res.res !== 'eau')) { g.turn = 1 - who; if (two) g.veil = true; }
                api.save(); api.sidebar(); draw();
            };
            const maybeAI = () => { clearTimeout(aiT); if (over() || !P[g.turn]?.ai) return; aiT = setTimeout(() => { if (!host.isConnected || over() || !P[g.turn]?.ai) return; const m = aiShot(g.boards[1 - g.turn].shots, P[g.turn].ai, R); if (m) shoot(m[0], m[1]); }, document.documentElement.classList.contains('a11y-calm') ? 200 : 650); };
            api.onCleanup(() => clearTimeout(aiT));
            draw();
        },
    });
})();
