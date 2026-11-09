/* LCNDA — ♟ Échecs (Jeux de la famille, app-jeu-famille.js ; barre commune app-jeu-plateau.js ; moteur app-jeu-echecs-moteur.js).
 * À deux sur le même écran ou contre l'ordinateur (facile, moyen, difficile : il répond en moins de 2 s, dans un Worker quand c'est possible).
 * Toutes les règles, promotion au choix, pendule facultative (avec ajout par coup), notation en français, ↶ sans limite, 💡 conseils comptés,
 * pièces qui portent le nom d'ancêtres (le roi et la dame d'abord). Clavier : flèches, Entrée pour prendre puis poser ; souris : clic ou glisser.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, E = () => window.LCNDA_ECHECS, P = () => window.LCNDA_JEUX_PLATEAU;
    if (!J() || !P()) return;
    const GLYPH = {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎'};
    const NAME = {k: 'roi', q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion'};
    const ORDER = 'kqrrbbnnpppppppp'; // l'ordre des noms d'ancêtres : roi, dame, tours, fous, cavaliers, pions
    const MOTEUR = (() => { const s = document.querySelector('script[src*="app-jeu-echecs-moteur.js"]'); return s ? s.src : ''; })();
    let worker = null, wid = 0;
    /** le coup de l'ordinateur, sans figer la page si possible : Promise<'e2e4'> */
    function think(s, level) {
        const fallback = () => new Promise(res => setTimeout(() => { const r = E().bestMove(s, {level}); res(r.move ? E().uci(r.move) : ''); }, 30));
        if (!MOTEUR || typeof Worker !== 'function') return fallback();
        try { if (!worker) worker = new Worker(MOTEUR); } catch (_) { worker = null; return fallback(); }
        const id = ++wid;
        return new Promise(res => {
            const done = e => { if (e.data?.id !== id) return; worker.removeEventListener('message', done); clearTimeout(t); res(e.data.move || ''); };
            const t = setTimeout(() => { worker.removeEventListener('message', done); try { worker.terminate(); } catch (_) {} worker = null; fallback().then(res); }, 6000);
            worker.addEventListener('message', done);
            worker.postMessage({id, fen: E().toFEN(s), keys: s.keys, level});
        });
    }
    const RULES = () => `<p>Chaque joueur a 16 pièces. Les blancs commencent. On gagne en <b>mettant le roi adverse échec et mat</b> : il est attaqué et ne peut plus s’échapper.</p>
        <ul><li><b>Roi ♚</b> : une case dans tous les sens. <b>Dame ♛</b> : autant de cases qu’on veut, en ligne, en colonne et en diagonale. <b>Tour ♜</b> : en ligne et en colonne. <b>Fou ♝</b> : en diagonale. <b>Cavalier ♞</b> : en « L », il saute par-dessus les pièces. <b>Pion ♟</b> : avance d’une case (deux au premier coup), prend en diagonale.</li>
        <li><b>Roque</b> : le roi va de deux cases vers une tour, la tour passe de l’autre côté. Impossible si le roi ou cette tour ont déjà bougé, si le roi est en échec, ou s’il passe ou arrive sur une case attaquée.</li>
        <li><b>Prise en passant</b> : un pion qui avance de deux cases à côté d’un pion adverse peut être pris comme s’il n’avait avancé que d’une case, mais seulement au coup suivant.</li>
        <li><b>Promotion</b> : un pion qui arrive au bout devient la pièce qu’on choisit (dame, tour, fou ou cavalier).</li>
        <li><b>Pat</b> : celui qui doit jouer n’est pas en échec mais n’a aucun coup possible : partie nulle.</li>
        <li><b>Autres nulles</b> : la même position trois fois ; 50 coups de chaque côté sans prise ni pion avancé ; plus assez de pièces pour mater (roi seul, roi et fou, roi et cavalier…).</li>
        <li><b>Pendule</b> (si on l’a choisie) : chacun a son temps ; celui dont le temps tombe à zéro perd (nulle si l’autre ne peut plus mater).</li></ul>
        <p><b>Notation</b> : R roi, D dame, T tour, F fou, C cavalier ; « x » une prise, « + » échec, « # » mat, « O-O » petit roque, « O-O-O » grand roque.</p>
        <p><b>Jouer</b> : clique (ou touche) une pièce puis sa case, ou glisse-la. Au clavier : flèches, Entrée pour prendre la pièce puis Entrée sur sa case. ↶ (⌘Z) défait un coup, 💡 (H) montre un bon coup, Échap met en pause.</p>`;
    J().register({
        key: 'echecs', short: 'Échecs', icon: '♟️', label: '♟️ Échecs', title: 'Échecs', eyebrow: 'ÉCHECS',
        desc: 'Le jeu d’échecs avec toutes ses règles : à deux sur le même écran ou contre l’ordinateur (facile, moyen ou difficile), pendule si tu veux.',
        rulesHint: 'Les blancs commencent. Clique une pièce puis sa case (ou glisse-la). Les règles complètes sont dans le « ? » de la partie.',
        namePh: 'Ex : La revanche de Papi', fieldsTitle: 'La partie',
        scope: false, players: {min: 2, max: 2, def: 2},
        playerExtra: i => ({ai: i === 1 ? 'moyen' : ''}),
        defaults: () => ({clock: 0, inc: 0, hints: 3, names: true, dots: true}),
        clean: c => { c.players.forEach(p => { p.ai = P().cleanAi(p.ai); }); return {...c, clock: [0, 3, 5, 10, 15, 30].includes(Number(c.clock)) ? Number(c.clock) : 0, inc: [0, 2, 5, 10].includes(Number(c.inc)) ? Number(c.inc) : 0, hints: [0, 3, 5, 10].includes(Number(c.hints)) ? Number(c.hints) : 3, names: c.names !== false, dots: c.dots !== false}; },
        ready: [{k: 'calme', name: 'Partie tranquille', hint: 'Sans pendule, 3 conseils', cfg: {clock: 0, inc: 0, hints: 3}},
            {k: 'longue', name: 'Partie longue', hint: '30 minutes chacun', cfg: {clock: 30, inc: 0}},
            {k: 'rapide', name: 'Partie rapide', hint: '15 minutes chacun, + 10 secondes par coup', cfg: {clock: 15, inc: 10}},
            {k: 'blitz', name: 'Blitz', hint: '5 minutes chacun, + 2 secondes par coup', cfg: {clock: 5, inc: 2}}],
        fieldsHtml: (c, h) => `<div class="jf-row"><span class="jf-lab">⏱ La pendule</span>${h.seg('clock', [[0, 'Sans'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']], c.clock)}</div>
            <div class="jf-row"><span class="jf-lab">Ajout par coup</span>${h.seg('inc', [[0, 'Aucun'], [2, '+ 2 s'], [5, '+ 5 s'], [10, '+ 10 s']], c.inc)}</div>
            <div class="jf-row"><span class="jf-lab">💡 Conseils</span>${h.seg('hints', [[0, 'Aucun'], [3, '3'], [5, '5'], [10, '10']], c.hints)}</div>
            <div class="jf-checks">${h.toggle('data-jpe-names', c.names, '👪 Les pièces portent le nom d’ancêtres (le roi, la dame, puis les autres)')}${h.toggle('data-jpe-dots', c.dots, '• Montrer les cases où la pièce peut aller')}</div>`,
        onSeg: (k, v, c) => { if (['clock', 'inc', 'hints'].includes(k)) c[k] = Number(v); },
        onChange(t, c) { if (t.matches('[data-jpe-names]')) c.names = t.checked; if (t.matches('[data-jpe-dots]')) c.dots = t.checked; if (t.name === 'pai') c.players[Number(t.closest('[data-i]').dataset.i)].ai = P().cleanAi(t.value); },
        playerFields: (p, i) => `<span class="jp-side">${i === 0 ? '♔ Blancs' : '♚ Noirs'}</span>${P().levelSelect(p)}`,
        async start(c, src, prev) {
            if (c.players.every(p => p.ai)) return {error: 'Il faut au moins une personne pour jouer.'};
            let names = {};
            if (c.names) {
                const list = await P().ancestors(c.seed + (prev ? prev.round : ''), 32), men = list.filter(x => x.g === 'm'), women = list.filter(x => x.g === 'f'), any = list.slice();
                const take = want => { const pool = want === 'f' ? women : want === 'm' ? men : any; const x = pool.shift() || any.shift(); if (!x) return ''; [men, women, any].forEach(l => { const k = l.indexOf(x); if (k >= 0) l.splice(k, 1); }); return x.name; };
                // les pièces de départ, dans l'ordre de ORDER, de chaque côté
                const squares = side => { const b = E().fromFEN().b, out = []; for (const t of ORDER) { const want = side === 'w' ? t.toUpperCase() : t; for (let i = 0; i < 64; i++) if (b[i] === want && !out.includes(i)) { out.push(i); break; } } return out; };
                for (const side of ['w', 'b']) for (const sq of squares(side)) { const t = E().fromFEN().b[sq].toLowerCase(), n = take(t === 'k' ? 'm' : t === 'q' ? 'f' : ''); if (n) names[sq] = n; }
            }
            // une revanche : on change de couleur (les noms des joueurs aussi)
            const players = prev ? [c.players[1], c.players[0]] : null;
            const ms = c.clock * 60000;
            return {moves: [], result: '', reason: '', clock: c.clock ? [ms, ms] : null, hintsLeft: c.hints, names, flip: null, round: (prev?.round || 0) + 1, ms: 0, finished: false, status: 'Partie en cours', ...(players ? {swap: !prev.swap} : {swap: false})};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, Pl = P();
            // g.swap : les joueurs ont changé de couleur (revanche) ; seat(side) = le joueur qui a cette couleur
            const seat = side => c.players[(side === 'w' ? 0 : 1) ^ (g.swap ? 1 : 0)];
            const nameOf = side => seat(side)?.name || (side === 'w' ? 'Blancs' : 'Noirs');
            let sel = -1, hint = null, promo = null, busy = false, token = 0, turnStart = Date.now(), lastMsg = '';
            const replayed = () => {
                const r = E().replay(g.moves), ids = Array.from({length: 64}, (_, i) => i), s0 = E().fromFEN(), caps = [];
                for (const u of g.moves) { const m = E().findMove(s0, u); if (!m) break; if (m.cap) caps.push({p: m.cap, id: m.flag === 'ep' ? ids[m.to + (m.p === 'P' ? 8 : -8)] : ids[m.to], by: ids[m.from], byP: m.p}); if (m.flag === 'ep') ids[m.to + (m.p === 'P' ? 8 : -8)] = -1; ids[m.to] = ids[m.from]; ids[m.from] = -1; if (m.flag === 'K') { ids[m.from + 1] = ids[m.from + 3]; ids[m.from + 3] = -1; } if (m.flag === 'Q') { ids[m.from - 1] = ids[m.from - 4]; ids[m.from - 4] = -1; } E().make(s0, m); }
                return {...r, ids, caps};
            };
            let R = replayed();
            const st = () => R.s;
            const human = side => !seat(side)?.ai;
            const flipped = () => (g.flip != null ? g.flip : (!human('w') && human('b')));
            const over = () => !!g.result;
            const pieceLabel = (p, id) => `${NAME[p.toLowerCase()]} ${E().isW(p) ? 'blanc' : 'noir'}${g.names?.[id] ? ` (${g.names[id]})` : ''}`;
            const clockLeft = side => { if (!g.clock) return null; const k = side === 'w' ? 0 : 1; return g.clock[k] - (!over() && !sh.paused && st().turn === side && g.moves.length ? Date.now() - turnStart : 0); };
            const sh = Pl.shell(host, g, api, {
                game: 'echecs', title: 'Échecs', rulesHtml: RULES,
                canUndo: () => g.moves.length > 0 && !busy, hints: () => (c.hints ? g.hintsLeft : null),
                onUndo: undo, onHint: giveHint,
                onPause: on => { if (on) settleClock(); else turnStart = Date.now(); api.save(); draw(); },
                onTick: () => { if (!g.clock) return; ['w', 'b'].forEach(side => { const el = host.querySelector(`[data-jpe-clock="${side}"]`); if (el) { const v = clockLeft(side); el.textContent = Pl.fmt(Math.max(0, v) + 999); el.closest('.jpe-clock')?.classList.toggle('is-low', v < 20000); } }); if (!over() && !sh.paused && g.moves.length && clockLeft(st().turn) <= 0) flag(st().turn); },
                keys: e => { if (e.key === 'Escape' && (sel >= 0 || promo)) { sel = -1; promo = null; draw(); return true; } return false; },
                menu: () => [{icon: '⇅', label: 'Retourner le plateau', run: () => { g.flip = !flipped(); api.save(); draw(); }},
                    {icon: '📋', label: 'Copier les coups', help: 'La partie en notation, à coller ailleurs', run: copyMoves},
                    over() ? null : {icon: '🤝', label: c.players.some(p => p.ai) ? 'Proposer la nulle' : 'Nulle d’un commun accord', run: offerDraw},
                    over() ? null : {icon: '🏳', label: 'Abandonner', danger: true, run: resign}].filter(Boolean),
            });
            function settleClock() { if (!g.clock || !g.moves.length || over()) { turnStart = Date.now(); return; } const k = st().turn === 'w' ? 0 : 1; g.clock[k] -= Date.now() - turnStart; turnStart = Date.now(); }
            function end(result, reason) {
                sh.settle(); settleClock(); g.result = result; g.reason = reason; g.finished = true;
                const winSide = result === '1-0' ? 'w' : result === '0-1' ? 'b' : '';
                g.status = winSide ? `${nameOf(winSide)} a gagné (${E().REASONS[reason] || reason})` : `Nulle (${E().REASONS[reason] || reason})`;
                // records : du point de vue de la personne qui joue contre l'ordinateur
                const ai = ['w', 'b'].find(sd => seat(sd)?.ai), me = ai ? (ai === 'w' ? 'b' : 'w') : '';
                if (ai) { const res = !winSide ? 'd' : winSide === me ? 'w' : 'l', moves = Math.ceil(g.moves.length / 2); const r = Pl.records.add('echecs', 'ia-' + seat(ai).ai, res, res === 'w' ? {v: moves, label: `mat en ${moves} coups`, low: true} : null, {g}); if (r.newBest) lastMsg = '🏆 Nouveau record !'; }
                api.save(); api.sidebar();
            }
            function flag(side) { const other = side === 'w' ? 'b' : 'w', b = st().b; const can = b.some(p => p && E().colorOf(p) === other && /[pqrPQR]/.test(p)) || b.filter(p => p && E().colorOf(p) === other && p.toLowerCase() !== 'k').length >= 2; settleClock(); g.clock[side === 'w' ? 0 : 1] = 0; end(can ? (side === 'w' ? '0-1' : '1-0') : '1/2-1/2', 'temps'); draw(); }
            function afterMove() {
                R = replayed(); sel = -1; hint = null; promo = null;
                const s = st(), status = E().status(s);
                if (status.over) end(status.result, status.reason); else { g.status = `${s.turn === 'w' ? 'Aux blancs' : 'Aux noirs'}${status.check ? ' · échec' : ''}`; api.save(); }
                draw();
            }
            function doMove(m) {
                if (over() || busy) return false;
                const before = st().turn;
                if (g.clock && g.moves.length) { const k = before === 'w' ? 0 : 1; g.clock[k] -= Date.now() - turnStart; g.clock[k] += c.inc * 1000; }
                turnStart = Date.now(); sh.settle();
                g.moves.push(E().uci(m)); afterMove(); return true;
            }
            function tryMove(from, to) {
                const ms = E().legal(st()).filter(m => m.from === from && m.to === to); if (!ms.length) return false;
                if (ms.length > 1 && ms[0].promo) { promo = {from, to}; sel = -1; draw(); host.querySelector('[data-jpe-promo]')?.focus(); return true; }
                return doMove(ms[0]);
            }
            function undo() {
                if (!g.moves.length || busy) return;
                token++; busy = false;
                do { g.moves.pop(); } while (g.moves.length && !human(E().replay(g.moves).s.turn));
                g.result = ''; g.reason = ''; g.finished = false; turnStart = Date.now();
                R = replayed(); sel = -1; hint = null; promo = null; g.status = 'Partie en cours'; api.save(); api.sidebar(); draw();
            }
            async function giveHint() {
                if (over() || busy || !(g.hintsLeft > 0) || !human(st().turn)) return;
                const r = E().bestMove(st(), {level: 'moyen', ms: 500}); if (!r.move) return;
                g.hintsLeft--; hint = {from: r.move.from, to: r.move.to}; api.save(); draw();
            }
            function copyMoves() {
                const txt = R.sans.map((m, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + m).join(' ') + (g.result ? ` ${g.result}` : '');
                navigator.clipboard?.writeText(txt).then(() => api.toast?.('Coups copiés.'), () => api.toast?.(txt));
            }
            async function offerDraw() {
                const ai = ['w', 'b'].find(sd => seat(sd)?.ai);
                if (ai) { const s = E().clone(st()); if (s.turn !== ai) { s.turn = ai; } const v = E().evaluate(s); if (v > 30) return api.toast?.('🤖 L’ordinateur refuse la nulle : il croit encore pouvoir gagner.'); }
                end('1/2-1/2', 'accord'); draw();
            }
            async function resign() {
                const side = ['w', 'b'].find(sd => human(sd) && (st().turn === sd || !human(sd === 'w' ? 'b' : 'w'))) || st().turn;
                const ok = !api.A?.confirmBox || await api.A.confirmBox(`${nameOf(side)} abandonne : la partie est perdue.`, {title: 'Abandonner la partie ?', okLabel: 'Abandonner', danger: true});
                if (!ok) return; end(side === 'w' ? '0-1' : '1-0', 'abandon'); draw();
            }
            function maybeAI() {
                const s = st(); if (over() || sh.paused || !seat(s.turn)?.ai || busy) return;
                busy = true; const my = ++token, level = seat(s.turn).ai;
                setTimeout(async () => {
                    const t0 = Date.now(), u = await think(E().clone(s), level);
                    if (my !== token || !host.isConnected) return;
                    const wait = Pl.calm() ? 0 : Math.max(0, 350 - (Date.now() - t0));
                    setTimeout(() => { if (my !== token || !host.isConnected) return; busy = false; if (sh.paused) { draw(); return; } const m = E().findMove(st(), u); if (m) doMove(m); else draw(); }, wait);
                }, Pl.calm() ? 0 : 120);
            }
            const cellSize = () => Math.max(34, Math.min(70, Math.floor(Math.min(600, (host.clientWidth || 700) - (window.innerWidth < 900 ? 8 : 360)) / 8.4)));
            function draw() {
                const s = st(), status = E().status(s), legal = over() ? [] : status.moves || [], turnHuman = !over() && human(s.turn) && !busy && !sh.paused;
                const targets = new Set(sel >= 0 ? legal.filter(m => m.from === sel).map(m => m.to) : []), fl = flipped(), last = g.moves.length ? E().findMove(E().replay(g.moves.slice(0, -1)).s, g.moves.at(-1)) : null;
                const kingSq = status.check ? (s.turn === 'w' ? s.kw : s.kb) : -1, cell = cellSize();
                api.sub(`Partie ${g.round} · ${c.clock ? `pendule ${c.clock} min${c.inc ? ` + ${c.inc} s` : ''}` : 'sans pendule'} · ${nameOf('w')} (blancs) contre ${nameOf('b')} (noirs)`);
                let cells = '';
                for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
                    const r = fl ? 7 - vr : vr, cc = fl ? 7 - vc : vc, i = r * 8 + cc, p = s.b[i], dark = (r + cc) % 2 === 1, id = R.ids[i];
                    const cls = ['jpe-sq', dark ? 'is-dark' : 'is-light', sel === i ? 'is-sel' : '', targets.has(i) ? (p ? 'is-take' : 'is-to') : '', last && (last.from === i || last.to === i) ? 'is-last' : '', kingSq === i ? 'is-check' : '', hint && (hint.from === i || hint.to === i) ? 'is-hint' : ''].filter(Boolean).join(' ');
                    const coord = `${vc === 0 ? `<em class="jpe-rk">${8 - r}</em>` : ''}${vr === 7 ? `<em class="jpe-fl">${'abcdefgh'[cc]}</em>` : ''}`;
                    cells += `<button type="button" class="${cls}" data-r="${r}" data-c="${cc}" data-vr="${vr}" data-vc="${vc}" data-i="${i}" aria-label="${E().sqName(i)}${p ? ` : ${esc(pieceLabel(p, id))}` : ''}${targets.has(i) ? ' (coup possible)' : ''}" title="${p && g.names?.[id] ? esc(`${NAME[p.toLowerCase()][0].toUpperCase() + NAME[p.toLowerCase()].slice(1)} : ${g.names[id]}`) : ''}">${coord}${p ? `<span class="jpe-pc ${E().isW(p) ? 'is-w' : 'is-b'}" aria-hidden="true">${GLYPH[p.toLowerCase()]}</span>` : ''}${targets.has(i) && c.dots ? '<i class="jpe-dot" aria-hidden="true"></i>' : ''}</button>`;
                }
                const capsBy = side => R.caps.filter(x => E().colorOf(x.p) !== side).map(x => `<span class="jpe-cap ${E().isW(x.p) ? 'is-w' : 'is-b'}" title="${esc(pieceLabel(x.p, x.id))}">${GLYPH[x.p.toLowerCase()]}</span>`).join('');
                const clockHtml = side => (g.clock ? `<span class="jpe-clock ${s.turn === side && !over() ? 'is-on' : ''}" title="Le temps qui reste">⏱ <b data-jpe-clock="${side}">${Pl.fmt(Math.max(0, clockLeft(side)) + 999)}</b></span>` : '');
                const winSide = g.result === '1-0' ? 'w' : g.result === '0-1' ? 'b' : '';
                const msg = over() ? (winSide ? `🏆 ${esc(nameOf(winSide))} gagne : ${esc(E().REASONS[g.reason] || g.reason)} !` : `🤝 ${esc((E().REASONS[g.reason] || 'nulle').replace(/^nulle\s*:?\s*/, 'Nulle : ').replace(/^(.)/, x => x.toUpperCase()))}`)
                    : sh.paused ? '⏸ En pause' : `${s.turn === 'w' ? '♔' : '♚'} À ${esc(nameOf(s.turn))} de jouer${seat(s.turn)?.ai ? ' (l’ordinateur réfléchit…)' : ''}${status.check ? ' — <b class="jpe-chk">Échec !</b>' : ''}`;
                const lastCap = R.caps.length && last && last.cap ? R.caps.at(-1) : null;
                const aiLevel = ['w', 'b'].map(sd => seat(sd)?.ai).find(Boolean);
                host.innerHTML = `${sh.bar(['w', 'b'].map(sd => ({name: `${sd === 'w' ? '♔' : '♚'} ${nameOf(sd)}`, color: sd === 'w' ? '#f4f1ea' : '#1d1d1d', ai: seat(sd)?.ai, on: !over() && s.turn === sd, extra: clockHtml(sd)})))}
                  <div class="goose-game-layout jpe"><div class="goose-board-wrap jp-wrap">${sh.pauseHtml()}
                    <div class="jpe-caps" aria-label="Pièces prises">${capsBy(fl ? 'w' : 'b')}</div>
                    <div class="jpe-board ${fl ? 'is-flipped' : ''} ${sh.paused ? 'jp-hide' : ''}" style="--cell:${cell}px" role="grid" aria-label="L’échiquier">${cells}</div>
                    <div class="jpe-caps" aria-label="Pièces prises">${capsBy(fl ? 'b' : 'w')}</div></div>
                    <aside class="goose-panel jp-panel"><p class="goose-status jf-big" role="status">${msg}</p>
                      ${lastMsg && over() ? `<p class="jp-newrec">${esc(lastMsg)}</p>` : ''}
                      ${promo ? `<div class="jpe-promo" role="group" aria-label="Promotion"><p class="jf-small"><b>Ton pion arrive au bout :</b> choisis ce qu’il devient.</p>${[['q', 'Dame'], ['r', 'Tour'], ['b', 'Fou'], ['n', 'Cavalier']].map(([k, t], n) => `<button type="button" class="button small secondary" data-jpe-promo="${k}" ${n ? '' : 'autofocus'}><span class="jpe-pc ${s.turn === 'w' ? 'is-w' : 'is-b'}">${GLYPH[k]}</span> ${t}</button>`).join('')}<button type="button" class="button small secondary" data-jpe-promo="">Annuler</button></div>` : ''}
                      ${lastCap && g.names?.[lastCap.id] ? `<p class="jf-small jpe-news">⚔️ ${esc(pieceLabel(lastCap.byP, lastCap.by).replace(/^./, x => x.toUpperCase()))} prend ${esc(pieceLabel(lastCap.p, lastCap.id))}.</p>` : ''}
                      <ol class="jpe-moves" aria-label="Les coups joués">${R.sans.reduce((a, m, i) => { if (i % 2 === 0) a.push(`<li><b>${i / 2 + 1}.</b> ${esc(m)}`); else a[a.length - 1] += ` <span>${esc(m)}</span></li>`; return a; }, []).join('')}</ol>
                      ${over() ? '<p class="muted jf-small">« ↻ Rejouer » en haut : une revanche, les couleurs changent.</p>' : ''}
                      ${aiLevel ? Pl.records.html('echecs', 'ia-' + aiLevel, `Contre l’ordinateur ${Pl.LEVEL_TXT[aiLevel]}`) : ''}
                      <p class="muted jf-small">Clic ou toucher : la pièce, puis sa case (ou glisse-la). Clavier : flèches, Entrée. ⌘Z annule, H un conseil, Échap pause.</p></aside></div>`;
                sh.bind(); bind(turnHuman, legal);
                if (!over() && !sh.paused && !busy) maybeAI();
            }
            function clickSq(i, legal) {
                if (over() || busy || sh.paused || !human(st().turn)) return;
                const s = st(), p = s.b[i];
                if (sel >= 0 && sel !== i && legal.some(m => m.from === sel && m.to === i)) { tryMove(sel, i); return; }
                if (p && E().colorOf(p) === s.turn && legal.some(m => m.from === i)) { sel = sel === i ? -1 : i; hint = null; draw(); focusSq(i); return; }
                if (sel >= 0) { sel = -1; draw(); focusSq(i); }
            }
            const focusSq = i => { const b = host.querySelector(`.jpe-board [data-i="${i}"]`); if (b) { host.querySelectorAll('.jpe-board [data-i]').forEach(x => { x.tabIndex = -1; }); b.tabIndex = 0; b.focus(); } };
            function bind(turnHuman, legal) {
                const board = host.querySelector('.jpe-board'), sig = api.signal;
                Pl.gridNav(board, sig);
                if (sel >= 0) { board.querySelectorAll('[data-i]').forEach(x => { x.tabIndex = Number(x.dataset.i) === sel ? 0 : -1; }); }
                board.addEventListener('click', e => { if (Pl.justDropped(board)) return; const b = e.target.closest('[data-i]'); if (b) clickSq(Number(b.dataset.i), legal); }, {signal: sig});
                Pl.boardPointer(board, sig, {
                    canPick: b => turnHuman && legal.some(m => m.from === Number(b.dataset.i)),
                    pick: b => { sel = Number(b.dataset.i); b.classList.add('is-sel'); },
                    drop: b => { const to = Number(b.dataset.i); if (!tryMove(sel, to)) { sel = -1; draw(); } },
                });
                host.querySelectorAll('[data-jpe-promo]').forEach(b => b.addEventListener('click', () => {
                    const k = b.dataset.jpePromo, p0 = promo; promo = null;
                    if (!k || !p0) { draw(); return; }
                    const m = E().legal(st()).find(x => x.from === p0.from && x.to === p0.to && x.promo === k); if (m) doMove(m); else draw();
                }, {signal: sig}));
            }
            api.onCleanup(() => { token++; settleClock(); sh.settle(); sh.stop(); api.save(); });
            draw();
        },
    });
})();
