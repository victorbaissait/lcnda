/* LCNDA — ⛀ Dames (Jeux de la famille, app-jeu-famille.js ; barre commune app-jeu-plateau.js ; moteur app-jeu-dames-moteur.js).
 * Règles internationales (10 × 10 : prise obligatoire et majoritaire, dames volantes), les mêmes sur 8 × 8, ou anglaises (8 × 8).
 * À deux sur le même écran ou contre l'ordinateur (facile, moyen, difficile). Une rafle se joue case par case (ou d'un coup en
 * touchant la case d'arrivée quand il n'y a qu'un chemin). Pions qui portent le nom d'ancêtres si on veut.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, D = () => window.LCNDA_DAMES, P = () => window.LCNDA_JEUX_PLATEAU;
    if (!J() || !P()) return;
    const SIDE_NAMES = v => (v === 'anglaises' ? ['Noirs', 'Blancs'] : ['Blancs', 'Noirs']); // le joueur 0 (en bas) commence
    const SIDE_DARK = v => (v === 'anglaises' ? [true, false] : [false, true]);
    const RULES = v => `<p>On joue sur les cases foncées. Les pions avancent en diagonale, d’une case, vers l’autre camp. ${v === 'anglaises' ? 'Les noirs commencent.' : 'Les blancs commencent.'}</p>
        <ul><li><b>Prendre</b> : on saute par-dessus une pièce adverse qui touche la sienne, si la case derrière est libre ; on peut enchaîner plusieurs sauts (une <b>rafle</b>). <b>Prendre est obligatoire.</b></li>
        ${v === 'anglaises' ? `<li>Les pions prennent <b>seulement en avant</b>. On peut choisir la prise, mais une rafle commencée se joue jusqu’au bout.</li>
        <li>Un pion qui arrive sur la dernière ligne devient <b>dame</b> (le coup s’arrête là). La dame avance et recule <b>d’une case</b>.</li>
        <li><b>Nulle</b> : la même position trois fois, ou 40 coups chacun sans prise ni pion avancé.</li>`
        : `<li>Les pions prennent <b>en avant et en arrière</b>. <b>Prise majoritaire</b> : il faut choisir la rafle qui prend le plus de pièces (une dame compte comme un pion).</li>
        <li>Pendant une rafle, les pièces prises restent sur le plateau jusqu’à la fin du coup : on ne peut pas sauter deux fois la même.</li>
        <li>Un pion devient <b>dame</b> s’il <b>termine</b> son coup sur la dernière ligne (s’il ne fait qu’y passer pendant une rafle, il reste pion).</li>
        <li>La <b>dame vole</b> : elle glisse d’autant de cases qu’elle veut en diagonale, prend à distance et peut s’arrêter sur n’importe quelle case libre derrière la pièce prise.</li>
        <li><b>Nulle</b> : la même position trois fois, ou 25 coups chacun en ne bougeant que des dames, sans prise.</li>`}
        <li><b>On perd</b> quand on n’a plus de pièce ou plus de coup possible.</li></ul>
        <p><b>Notation</b> : les cases foncées sont numérotées de 1 (en haut à gauche) à ${v === 'internationales' ? 50 : 32} ; « 32-28 » un déplacement, « 28x19 » une prise.</p>
        <p><b>Jouer</b> : touche un pion puis sa case d’arrivée (ou glisse-le). Pour une rafle à plusieurs chemins, touche les cases une à une. Clavier : flèches, Entrée. ↶ (⌘Z) défait, 💡 (H) un conseil, Échap pause.</p>`;
    J().register({
        key: 'dames', short: 'Dames', icon: '⛀', label: '⛀ Dames', title: 'Dames', eyebrow: 'DAMES',
        desc: 'Le jeu de dames : règles internationales sur 10 × 10 (prise majoritaire, dames volantes) ou dames anglaises sur 8 × 8. À deux ou contre l’ordinateur.',
        rulesHint: 'Prendre est obligatoire. Les règles complètes sont dans le « ? » de la partie.',
        namePh: 'Ex : Le tournoi du dimanche', fieldsTitle: 'Le damier et les règles',
        scope: false, players: {min: 2, max: 2, def: 2},
        playerExtra: i => ({ai: i === 1 ? 'moyen' : ''}),
        defaults: () => ({v: 'internationales', hints: 3, names: true, dots: true}),
        clean: c => { c.players.forEach(p => { p.ai = P().cleanAi(p.ai); }); return {...c, v: ['internationales', 'bresiliennes', 'anglaises'].includes(c.v) ? c.v : 'internationales', hints: [0, 3, 5, 10].includes(Number(c.hints)) ? Number(c.hints) : 3, names: c.names !== false, dots: c.dots !== false}; },
        ready: [{k: 'int', name: 'Dames internationales', hint: '10 × 10, prise majoritaire, dames volantes', cfg: {v: 'internationales'}},
            {k: 'ang', name: 'Dames anglaises', hint: '8 × 8, dames d’une case, prise en avant', cfg: {v: 'anglaises'}},
            {k: 'bre', name: 'Petit damier', hint: '8 × 8 avec les règles internationales', cfg: {v: 'bresiliennes'}}],
        fieldsHtml: (c, h) => `<div class="jf-row"><span class="jf-lab">Les règles</span>${h.seg('v', [['internationales', 'Internationales (10 × 10)'], ['bresiliennes', '8 × 8 internationales'], ['anglaises', 'Anglaises (8 × 8)']], c.v)}</div>
            <div class="jf-row"><span class="jf-lab">💡 Conseils</span>${h.seg('hints', [[0, 'Aucun'], [3, '3'], [5, '5'], [10, '10']], c.hints)}</div>
            <div class="jf-checks">${h.toggle('data-jpd-names', c.names, '👪 Les pions portent le nom d’ancêtres')}${h.toggle('data-jpd-dots', c.dots, '• Montrer les cases où le pion peut aller')}</div>`,
        onSeg: (k, v, c) => { if (k === 'v') c.v = v; if (k === 'hints') c.hints = Number(v); },
        onChange(t, c) { if (t.matches('[data-jpd-names]')) c.names = t.checked; if (t.matches('[data-jpd-dots]')) c.dots = t.checked; if (t.name === 'pai') c.players[Number(t.closest('[data-i]').dataset.i)].ai = P().cleanAi(t.value); },
        playerFields: (p, i) => `<span class="jp-side">${i === 0 ? '⬇ Commence (en bas)' : '⬆ En haut'}</span>${P().levelSelect(p)}`,
        async start(c, src, prev) {
            if (c.players.every(p => p.ai)) return {error: 'Il faut au moins une personne pour jouer.'};
            const s = D().create(c.v), names = {};
            if (c.names) { const list = await P().ancestors(c.seed + (prev ? prev.round : ''), 40); let k = 0; s.b.forEach((x, i) => { if (x && list[k]) names[i] = list[k++].name; }); }
            return {moves: [], result: -2, reason: '', hintsLeft: c.hints, names, flip: null, round: (prev?.round || 0) + 1, ms: 0, finished: false, swap: prev ? !prev.swap : false, status: 'Partie en cours'};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, Pl = P(), SN = SIDE_NAMES(c.v), dark = SIDE_DARK(c.v);
            const seat = side => c.players[side ^ (g.swap ? 1 : 0)];
            const nameOf = side => seat(side)?.name || SN[side];
            const human = side => !seat(side)?.ai;
            let path = [], hint = null, busy = false, token = 0, lastMsg = '';
            const replayed = () => {
                const s = D().create(c.v), ids = s.b.map((_, i) => i), notes = [], caps = [];
                for (const id of g.moves) { const m = D().legal(s).find(x => D().moveId(x) === id); if (!m) break; notes.push(D().notation(s, m)); m.caps.forEach(x => caps.push({id: ids[x], side: s.b[x] > 0 ? 0 : 1, king: Math.abs(s.b[x]) === 2})); const mover = ids[m.from]; m.caps.forEach(x => { ids[x] = -1; }); ids[m.from] = -1; ids[m.to] = mover; D().apply(s, m); }
                return {s, ids, notes, caps};
            };
            let R = replayed();
            const st = () => R.s;
            const over = () => g.result !== -2 && g.result != null;
            const flipped = () => (g.flip != null ? g.flip : (!human(0) && human(1)));
            const sh = Pl.shell(host, g, api, {
                game: 'dames', title: 'Dames', rulesHtml: () => RULES(c.v),
                canUndo: () => g.moves.length > 0, hints: () => (c.hints ? g.hintsLeft : null), onUndo: undo, onHint: giveHint,
                onPause: () => { api.save(); draw(); },
                keys: e => { if (e.key === 'Escape' && path.length) { path = []; draw(); return true; } return false; },
                menu: () => [{icon: '⇅', label: 'Retourner le damier', run: () => { g.flip = !flipped(); api.save(); draw(); }},
                    over() ? null : {icon: '🤝', label: c.players.some(p => p.ai) ? 'Proposer la nulle' : 'Nulle d’un commun accord', run: offerDraw},
                    over() ? null : {icon: '🏳', label: 'Abandonner', danger: true, run: resign}].filter(Boolean),
            });
            function end(winner, reason) {
                sh.settle(); g.result = winner; g.reason = reason; g.finished = true;
                g.status = winner >= 0 ? `${nameOf(winner)} a gagné` : 'Partie nulle';
                const ai = [0, 1].find(sd => seat(sd)?.ai);
                if (ai != null) { const me = 1 - ai, res = winner < 0 ? 'd' : winner === me ? 'w' : 'l', n = Math.ceil(g.moves.length / 2); if (Pl.records.add('dames', `ia-${seat(ai).ai}-${c.v}`, res, res === 'w' ? {v: n, label: `gagné en ${n} coups`, low: true} : null, {g}).newBest) lastMsg = '🏆 Nouveau record !'; }
                api.save(); api.sidebar();
            }
            function play(m) {
                sh.settle(); g.moves.push(D().moveId(m)); R = replayed(); path = []; hint = null;
                const stt = D().status(st()); if (stt.over) end(stt.winner, stt.reason); else { g.status = `Au tour de ${nameOf(st().turn)}`; api.save(); }
                draw();
            }
            function undo() {
                if (!g.moves.length) return; token++; busy = false;
                do { g.moves.pop(); } while (g.moves.length && !human(D().replay(c.v, g.moves).s.turn));
                g.result = -2; g.reason = ''; g.finished = false; R = replayed(); path = []; hint = null; g.status = 'Partie en cours'; api.save(); api.sidebar(); draw();
            }
            function giveHint() {
                if (over() || busy || !(g.hintsLeft > 0) || !human(st().turn)) return;
                const r = D().bestMove(st(), {level: 'moyen', ms: 500}); if (!r.move) return;
                g.hintsLeft--; hint = r.move; path = []; api.save(); draw();
            }
            function offerDraw() {
                const ai = [0, 1].find(sd => seat(sd)?.ai);
                if (ai != null) { const s = D().clone(st()); s.turn = ai; if (D().evaluate(s) > 30) return api.toast?.('🤖 L’ordinateur refuse la nulle : il croit encore pouvoir gagner.'); }
                end(-1, 'accord'); draw();
            }
            async function resign() {
                const side = [0, 1].find(sd => human(sd) && (st().turn === sd || !human(1 - sd))) ?? st().turn;
                const ok = !api.A?.confirmBox || await api.A.confirmBox(`${nameOf(side)} abandonne : la partie est perdue.`, {title: 'Abandonner la partie ?', okLabel: 'Abandonner', danger: true});
                if (ok) { end(1 - side, 'abandon'); draw(); }
            }
            function maybeAI() {
                const s = st(); if (over() || sh.paused || !seat(s.turn)?.ai || busy) return;
                busy = true; const my = ++token, level = seat(s.turn).ai;
                setTimeout(() => {
                    if (my !== token || !host.isConnected) return;
                    const r = D().bestMove(D().clone(st()), {level});
                    setTimeout(() => { if (my !== token || !host.isConnected) return; busy = false; if (sh.paused || !r.move) { draw(); return; } play(r.move); }, Pl.calm() ? 0 : 250);
                }, Pl.calm() ? 30 : 280);
            }
            // les coups qui commencent par le chemin déjà touché
            const candidates = legal => legal.filter(m => path.every((x, k) => m.path[k] === x));
            function clickSq(i, legal) {
                if (over() || busy || sh.paused || !human(st().turn)) return;
                const s = st();
                if (!path.length || (path.length === 1 && Math.sign(s.b[i]) === (s.turn === 0 ? 1 : -1) && i !== path[0])) {
                    if (legal.some(m => m.from === i)) { path = [i]; hint = null; draw(); focusSq(i); return; }
                    if (Math.sign(s.b[i]) === (s.turn === 0 ? 1 : -1) && legal.length) { api.toast?.(legal[0].caps.length ? (D().rulesOf(c.v).majority ? 'Une prise est obligatoire (celle qui prend le plus de pièces).' : 'Une prise est obligatoire.') : 'Ce pion ne peut pas bouger.'); }
                    return;
                }
                if (i === path[path.length - 1]) { path = path.length === 1 ? [] : path.slice(0, -1); draw(); focusSq(i); return; }
                const cand = candidates(legal), k = path.length;
                // la case d'arrivée d'un seul chemin : on joue tout de suite
                const finals = cand.filter(m => m.to === i && m.path.length > k);
                if (finals.length === 1 && !cand.some(m => m.path[k] === i && m.path.length > k + 1 && m !== finals[0])) { play(finals[0]); return; }
                if (cand.some(m => m.path[k] === i)) {
                    path = [...path, i]; const done = candidates(legal).filter(m => m.path.length === path.length);
                    if (done.length === 1) { play(done[0]); return; }
                    draw(); focusSq(i); return;
                }
                path = []; draw(); focusSq(i);
            }
            const focusSq = i => { const b = host.querySelector(`.jpd-board [data-i="${i}"]`); if (b) { host.querySelectorAll('.jpd-board [data-i]').forEach(x => { x.tabIndex = -1; }); b.tabIndex = 0; b.focus(); } };
            const cellSize = N => Math.max(28, Math.min(64, Math.floor(Math.min(620, (host.clientWidth || 700) - (window.innerWidth < 900 ? 8 : 360)) / (N + 0.4))));
            function draw() {
                const s = st(), N = s.N, stt = over() ? {moves: []} : D().status(s), legal = over() ? [] : stt.moves, fl = flipped(), turnHuman = !over() && human(s.turn) && !busy && !sh.paused;
                const cand = path.length ? candidates(legal) : [], next = new Set(cand.map(m => m.path[path.length]).filter(x => x != null)), finals = new Set(cand.map(m => m.to)), pending = new Set(cand.length === 1 || path.length > 1 ? cand.flatMap(m => m.caps.slice(0, path.length - 1)) : []);
                const movable = new Set(turnHuman && !path.length ? legal.map(m => m.from) : []), last = g.moves.length ? g.moves.at(-1).split(/[>:]/).slice(0, 2).map(Number) : [];
                const cnt = D().count(s), cell = cellSize(N);
                api.sub(`Partie ${g.round} · ${D().rulesOf(c.v).label} · ${nameOf(0)} (${SN[0].toLowerCase()}) contre ${nameOf(1)} (${SN[1].toLowerCase()})`);
                let cells = '';
                for (let vr = 0; vr < N; vr++) for (let vc = 0; vc < N; vc++) {
                    const r = fl ? N - 1 - vr : vr, cc = fl ? N - 1 - vc : vc, i = r * N + cc, x = s.b[i], isDark = (r + cc) % 2 === 1;
                    if (!isDark) { cells += '<span class="jpd-sq is-light" aria-hidden="true"></span>'; continue; }
                    const side = x > 0 ? 0 : 1, id = R.ids[i], king = Math.abs(x) === 2;
                    const cls = ['jpd-sq', 'is-dark', path[0] === i ? 'is-sel' : '', path.slice(1).includes(i) ? 'is-path' : '', next.has(i) ? 'is-to' : '', movable.has(i) && legal[0]?.caps.length ? 'is-must' : '', last.includes(i) ? 'is-last' : '', hint && (hint.from === i || hint.to === i || hint.path.includes(i)) ? 'is-hint' : '', pending.has(i) ? 'is-taken' : ''].filter(Boolean).join(' ');
                    cells += `<button type="button" class="${cls}" data-r="${r}" data-c="${cc}" data-vr="${vr}" data-vc="${vc}" data-i="${i}" aria-label="Case ${D().num(s, i)}${x ? ` : ${king ? 'dame' : 'pion'} ${SN[side].toLowerCase().replace(/s$/, '')}${g.names?.[id] ? ` (${esc(g.names[id])})` : ''}` : ''}${next.has(i) ? ' (case possible)' : ''}" title="${x && g.names?.[id] ? esc(`${king ? 'Dame' : 'Pion'} : ${g.names[id]}`) : ''}"><em class="jpd-num">${D().num(s, i)}</em>${x ? `<span class="jpd-pc ${dark[side] ? 'is-b' : 'is-w'} ${king ? 'is-king' : ''}" aria-hidden="true">${king ? '♛' : ''}</span>` : ''}${next.has(i) && c.dots ? `<i class="jpd-dot ${finals.has(i) ? 'is-final' : ''}" aria-hidden="true"></i>` : ''}</button>`;
                }
                const msg = over() ? (g.result >= 0 ? `🏆 ${esc(nameOf(g.result))} gagne (${esc(D().REASONS[g.reason] || g.reason)}) !` : `🤝 ${esc((D().REASONS[g.reason] || 'nulle').replace(/^nulle\s*:?\s*/, 'Nulle : ').replace(/^(.)/, x => x.toUpperCase()))}`)
                    : sh.paused ? '⏸ En pause' : `À ${esc(nameOf(s.turn))} de jouer${seat(s.turn)?.ai ? ' (l’ordinateur réfléchit…)' : ''}${legal[0]?.caps.length ? ` — <b>prise obligatoire${legal[0].caps.length > 1 ? ` (${legal[0].caps.length} pièces)` : ''}</b>` : ''}`;
                const aiLevel = [0, 1].map(sd => seat(sd)?.ai).find(Boolean), nLast = g.moves.length && g.moves.at(-1).split(':')[1] ? g.moves.at(-1).split(':')[1].split('.').length : 0, lastCaps = nLast ? R.caps.slice(-nLast) : [];
                const named = lastCaps.filter(x => g.names?.[x.id]);
                host.innerHTML = `${sh.bar([0, 1].map(sd => ({name: `${dark[sd] ? '●' : '○'} ${nameOf(sd)}`, color: dark[sd] ? '#1d1d1d' : '#f4f1ea', ai: seat(sd)?.ai, on: !over() && s.turn === sd, extra: `<small>${api.plural(cnt.men[sd], 'pion')}${cnt.kings[sd] ? ` · ${api.plural(cnt.kings[sd], 'dame')}` : ''}</small>`})))}
                  <div class="goose-game-layout jpd"><div class="goose-board-wrap jp-wrap">${sh.pauseHtml()}
                    <div class="jpd-board ${sh.paused ? 'jp-hide' : ''}" style="--n:${N};--cell:${cell}px" role="grid" aria-label="Le damier">${cells}</div></div>
                    <aside class="goose-panel jp-panel"><p class="goose-status jf-big" role="status">${msg}</p>
                      ${lastMsg && over() ? `<p class="jp-newrec">${esc(lastMsg)}</p>` : ''}
                      ${path.length > 1 && !over() ? '<p class="jf-small">La rafle continue : touche la case suivante (ou la dernière case pour revenir en arrière).</p>' : ''}
                      ${named.length ? `<p class="jf-small jpe-news">⚔️ ${named.map(x => `${x.king ? 'la dame' : 'le pion'} ${esc(g.names[x.id])}`).join(', ')} ${named.length > 1 ? 'sont pris' : 'est pris'}.</p>` : ''}
                      <ol class="jpe-moves" aria-label="Les coups joués">${R.notes.reduce((a, m, i) => { if (i % 2 === 0) a.push(`<li><b>${i / 2 + 1}.</b> ${esc(m)}`); else a[a.length - 1] += ` <span>${esc(m)}</span></li>`; return a; }, []).join('')}</ol>
                      ${over() ? '<p class="muted jf-small">« ↻ Rejouer » en haut : une revanche, on change de côté.</p>' : ''}
                      ${aiLevel ? Pl.records.html('dames', `ia-${aiLevel}-${c.v}`, `Contre l’ordinateur ${Pl.LEVEL_TXT[aiLevel]}`) : ''}
                      <p class="muted jf-small">Touche un pion puis sa case (ou glisse-le). Clavier : flèches, Entrée. ⌘Z annule, H un conseil, Échap pause.</p></aside></div>`;
                sh.bind();
                const board = host.querySelector('.jpd-board');
                Pl.gridNav(board, api.signal);
                if (path.length) board.querySelectorAll('[data-i]').forEach(x => { x.tabIndex = Number(x.dataset.i) === path[path.length - 1] ? 0 : -1; });
                board.addEventListener('click', e => { if (Pl.justDropped(board)) return; const b = e.target.closest('[data-i]'); if (b) clickSq(Number(b.dataset.i), legal); }, {signal: api.signal});
                Pl.boardPointer(board, api.signal, {
                    canPick: b => turnHuman && legal.some(m => m.from === Number(b.dataset.i)),
                    pick: b => { path = [Number(b.dataset.i)]; b.classList.add('is-sel'); },
                    drop: b => { const to = Number(b.dataset.i), ms = legal.filter(m => m.from === path[0] && m.to === to); if (ms.length === 1) play(ms[0]); else if (ms.length > 1) { api.toast?.('Plusieurs rafles mènent ici : touche les cases une à une.'); draw(); } else { path = []; draw(); } },
                });
                if (!over() && !sh.paused && !busy) maybeAI();
            }
            api.onCleanup(() => { token++; sh.settle(); sh.stop(); api.save(); });
            draw();
        },
    });
})();
