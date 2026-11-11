/* LCNDA — 🁫 Dominos double-six (Jeux de la famille, app-jeu-famille.js ; barre commune app-jeu-plateau.js ; moteur app-jeu-dominos-moteur.js).
 * 2 à 4 joueurs : des personnes (un écran de passage cache la main des autres) et 1 à 3 ordinateurs (facile, moyen, difficile),
 * avec pioche ou sans (« on boude »), en une manche ou jusqu'à 50 / 100 / 150 points. Les ordinateurs peuvent porter le nom d'ancêtres.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, Dm = () => window.LCNDA_DOMINOS, P = () => window.LCNDA_JEUX_PLATEAU;
    if (!J() || !P()) return;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : s);
    const PIP = {0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]};
    /** un domino en SVG (vertical pour un double posé, ou quand on le demande) */
    const tileSvg = (t, vertical = false) => {
        const half = (v, ox, oy) => PIP[v].map(([y, x]) => `<circle cx="${ox + 10 + x * 15}" cy="${oy + 10 + y * 15}" r="5.2"/>`).join('');
        return vertical ? `<svg viewBox="0 0 50 100" aria-hidden="true"><rect x="1.5" y="1.5" width="47" height="97" rx="7"/><line x1="8" y1="50" x2="42" y2="50"/>${half(t[0], 0, 0)}${half(t[1], 0, 50)}</svg>`
            : `<svg viewBox="0 0 100 50" aria-hidden="true"><rect x="1.5" y="1.5" width="97" height="47" rx="7"/><line x1="50" y1="8" x2="50" y2="42"/>${half(t[0], 0, 0)}${half(t[1], 50, 0)}</svg>`;
    };
    const tileName = t => `${t[0]}-${t[1]}`;
    const RULES = () => `<p>${i18n('Un jeu de <b>28 dominos</b>, de 0-0 (blanc-blanc) à 6-6 (double-six). À deux, chacun reçoit 7 dominos ; à trois ou quatre, 6. Le reste forme la <b>pioche</b>.')}</p>
        <ul><li>${i18n('À la première manche, celui qui a le <b>plus gros double</b> le pose pour commencer (s’il n’y a pas de double, le plus gros domino). Ensuite, c’est le gagnant de la manche d’avant qui commence.')}</li>
        <li>${i18n('Chacun son tour, on pose un domino qui a le <b>même nombre</b> qu’un des deux bouts de la chaîne.')}</li>
        <li>${i18n('Si on ne peut pas jouer : <b>avec pioche</b>, on pioche jusqu’à pouvoir jouer (pioche vide : on passe) ; <b>sans pioche</b>, on passe (« on boude »).')}</li>
        <li>${i18n('La manche s’arrête quand quelqu’un pose son dernier domino (« Domino ! »), ou quand plus personne ne peut jouer (partie <b>bloquée</b> : celui qui a le moins de points en main gagne).')}</li>
        <li>${i18n('<b>Comptage</b> : le gagnant de la manche marque les points (le total des points noirs) qui restent dans les mains des autres. Le premier qui atteint le score choisi gagne la partie.')}</li></ul>
        <p>${i18n('<b>Jouer</b> : touche un domino de ta main ; s’il va des deux côtés, touche ensuite le bout de la chaîne (◀ ou ▶). Clavier : flèches dans ta main, Entrée. ↶ (⌘Z) défait, 💡 (H) un conseil, Échap pause.')}</p>`;
    J().register({
        key: 'dominos', short: 'Dominos', icon: '🁫', label: '🁫 Dominos', title: 'Dominos', eyebrow: 'DOMINOS',
        desc: 'Les dominos double-six, avec ou sans pioche : contre 1 à 3 ordinateurs, ou entre vous sur le même écran. Le comptage se fait tout seul.',
        rulesHint: 'Pose un domino qui a le même nombre qu’un bout de la chaîne. Les règles complètes sont dans le « ? » de la partie.',
        namePh: 'Ex : Les dominos de Mémé', fieldsTitle: 'La partie',
        scope: false, players: {min: 2, max: 4, def: 2},
        playerExtra: i => ({ai: i === 0 ? '' : 'moyen'}),
        defaults: () => ({draw: true, target: 100, names: true, hints: 3}),
        clean: c => { c.players.forEach(p => { p.ai = P().cleanAi(p.ai); }); return {...c, draw: c.draw !== false, target: [0, 50, 100, 150].includes(Number(c.target)) ? Number(c.target) : 100, names: c.names !== false, hints: [0, 3, 5, 10].includes(Number(c.hints)) ? Number(c.hints) : 3}; },
        ready: [{k: 'classic', name: 'Avec pioche, en 100 points', hint: 'La partie la plus courante', cfg: {draw: true, target: 100}},
            {k: 'boude', name: 'Sans pioche (on boude)', hint: 'En 100 points', cfg: {draw: false, target: 100}},
            {k: 'une', name: 'Une seule manche', hint: 'Avec pioche', cfg: {draw: true, target: 0}}],
        fieldsHtml: (c, h) => `<div class="jf-row"><span class="jf-lab">${h.esc(i18n('La pioche'))}</span>${h.seg('draw', [['1', h.esc(i18n('Avec pioche'))], ['0', h.esc(i18n('Sans pioche (on boude)'))]], c.draw ? '1' : '0')}</div>
            <div class="jf-row"><span class="jf-lab">${h.esc(i18n('La partie se joue'))}</span>${h.seg('target', [[0, h.esc(i18n('En une manche'))], [50, h.esc(i18n('En {n} points', {n: 50}))], [100, h.esc(i18n('En {n} points', {n: 100}))], [150, h.esc(i18n('En {n} points', {n: 150}))]], c.target)}</div>
            <div class="jf-row"><span class="jf-lab">💡 ${h.esc(i18n('Conseils'))}</span>${h.seg('hints', [[0, h.esc(i18n('Aucun'))], [3, '3'], [5, '5'], [10, '10']], c.hints)}</div>
            <div class="jf-checks">${h.toggle('data-jpm-names', c.names, i18n('👪 Les ordinateurs portent le nom d’ancêtres'))}</div>`,
        onSeg: (k, v, c) => { if (k === 'draw') c.draw = v === '1'; if (k === 'target') c.target = Number(v); if (k === 'hints') c.hints = Number(v); },
        onChange(t, c) { if (t.matches('[data-jpm-names]')) c.names = t.checked; if (t.name === 'pai') c.players[Number(t.closest('[data-i]').dataset.i)].ai = P().cleanAi(t.value); },
        playerFields: p => P().levelSelect(p),
        async start(c, src, prev) {
            if (c.players.every(p => p.ai)) return {error: i18n('Il faut au moins une personne pour jouer.')};
            const R = window.LCNDA_JEUX_LOGIQUE.rng(c.seed + (prev ? 'r' + prev.round : ''));
            let aiNames = {};
            if (c.names) { const list = await P().ancestors(c.seed, 4); c.players.forEach((p, i) => { if (p.ai && list[i]) aiNames[i] = list[i].name; }); }
            const s = Dm().deal(c.players.length, R, {draw: c.draw});
            return {s, scores: c.players.map(() => 0), manche: 1, round: (prev?.round || 0) + 1, aiNames, hist: [], hintsLeft: c.hints, matchOver: false, winner: -1, veil: c.players.filter(p => !p.ai).length > 1, ms: 0, finished: false, status: i18n('Manche {n}', {n: 1})};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, Pl = P(), N = c.players.length, Lg = window.LCNDA_JEUX_LOGIQUE;
            const nameOf = i => (c.players[i]?.ai && g.aiNames?.[i]) || c.players[i]?.name || i18n('Joueur {n}', {n: i + 1});
            const human = i => !c.players[i]?.ai;
            const humans = c.players.map((p, i) => (p.ai ? -1 : i)).filter(i => i >= 0);
            let sel = -1, hint = null, busy = false, token = 0, lastMsg = '', viewer = humans.length === 1 ? humans[0] : -1;
            const s = () => g.s;
            const sh = Pl.shell(host, g, api, {
                game: 'dominos', title: 'Dominos', rulesHtml: RULES,
                canUndo: () => (g.hist || []).length > 0 && !busy, hints: () => (c.hints ? g.hintsLeft : null), onUndo: undo, onHint: giveHint,
                onPause: () => { api.save(); draw(); },
                keys: e => { if (e.key === 'Escape' && sel >= 0) { sel = -1; draw(); return true; } return false; },
                menu: () => [g.matchOver ? null : {icon: '🏳', label: i18n('Abandonner la partie'), danger: true, run: resign}].filter(Boolean),
            });
            const snap = () => { g.hist = [...(g.hist || []), JSON.stringify({s: g.s, scores: g.scores, manche: g.manche, matchOver: g.matchOver, winner: g.winner})].slice(-60); };
            function undo() {
                const last = (g.hist || []).pop(); if (!last) return; token++; busy = false;
                const x = JSON.parse(last); Object.assign(g, x); g.finished = !!g.matchOver; sel = -1; hint = null; api.save(); api.sidebar(); draw();
            }
            function giveHint() {
                const st = s(); if (st.over || busy || !(g.hintsLeft > 0) || !human(st.turn)) return;
                const m = Dm().aiMove(st, st.turn, 'difficile'); g.hintsLeft--;
                hint = m || {draw: true}; api.save(); draw();
            }
            async function resign() {
                const ok = !api.A?.confirmBox || await api.A.confirmBox(i18n('La partie s’arrête ici, comptée perdue.'), {title: i18n('Abandonner la partie ?'), okLabel: i18n('Abandonner'), danger: true});
                if (!ok) return; const best = g.scores.map((v, i) => [v, i]).filter(([, i]) => !human(i)).sort((a, b) => b[0] - a[0])[0];
                finishMatch(best ? best[1] : -1, true); draw();
            }
            function finishMatch(w, resigned = false) {
                sh.settle(); g.matchOver = true; g.winner = w; g.finished = true; g.status = w >= 0 ? i18n('{name} a gagné', {name: nameOf(w)}) : i18n('Égalité');
                if (humans.length === 1) { const me = humans[0], res = w === me ? 'w' : w < 0 ? 'd' : 'l'; const best = Math.max(0, ...(g.gains || []).filter(x => x.p === me).map(x => x.v)); if (Pl.records.add('dominos', `ia-${N}j`, res, best && !resigned ? {v: best, label: i18n('{n} points en une manche', {n: best})} : null, {g}).newBest) lastMsg = i18n('🏆 Nouveau record : ta plus grosse manche !'); }
                api.save(); api.sidebar();
            }
            function afterAction() {
                const st = s();
                if (st.over) {
                    if (st.winner >= 0) { g.scores[st.winner] += st.gain; g.gains = [...(g.gains || []), {p: st.winner, v: st.gain}]; }
                    g.status = i18n('Manche {n} finie', {n: g.manche});
                    const top = Math.max(...g.scores), leaders = g.scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0);
                    if (!c.target) finishMatch(st.winner);
                    else if (top >= c.target && leaders.length === 1) finishMatch(leaders[0]);
                } else g.status = `${i18n('Manche {n}', {n: g.manche})} · ${i18n('au tour de {name}', {name: nameOf(st.turn)})}`;
                if (g.veil !== false && humans.length > 1 && !st.over && human(st.turn) && viewer !== st.turn) viewer = -1;
                sel = -1; hint = null; api.save(); draw();
            }
            function humanPlay(i, side) { const st = s(); snap(); if (!Dm().play(st, st.turn, i, side)) { g.hist.pop(); return; } afterAction(); }
            function humanDraw() { const st = s(); snap(); if (!Dm().draw(st)) { g.hist.pop(); return; } sel = -1; hint = null; api.save(); draw(); }
            function humanPass() { const st = s(); snap(); if (!Dm().pass(st)) { g.hist.pop(); return; } afterAction(); }
            function nextRound() {
                const st = s(), R = Lg.rng(c.seed + 'm' + g.manche + g.round);
                const starter = st.winner >= 0 ? st.winner : (st.turn + 1) % N;
                g.s = Dm().deal(N, R, {draw: c.draw, starter}); g.manche++; g.hist = []; g.status = `Manche ${g.manche}`;
                if (humans.length > 1) viewer = -1;
                api.save(); draw();
            }
            function maybeAI() {
                const st = s(); if (st.over || g.matchOver || sh.paused || human(st.turn) || busy) return;
                busy = true; const my = ++token, lvl = c.players[st.turn].ai, R = Lg.rng(c.seed + 'ia' + g.manche + st.log.length);
                setTimeout(() => {
                    if (my !== token || !host.isConnected) return; busy = false; if (sh.paused) { draw(); return; }
                    const cur = s(), p = cur.turn, m = Dm().aiMove(cur, p, lvl, R);
                    if (m) Dm().play(cur, p, m.i, m.side);
                    else if (!Dm().draw(cur, p)) Dm().pass(cur, p);
                    afterAction();
                }, Pl.calm() ? 60 : 700);
            }
            function chainHtml(st, sideTargets) {
                if (!st.line.length) return `<div class="jpm-chain is-empty">${sideTargets.length ? `<button type="button" class="jpm-end" data-jpm-end="R" aria-label="${esc(i18n('Poser ici'))}">${esc(i18n('Pose ton domino ici'))}</button>` : `<p class="muted jf-small">${esc(st.opener ? (st.opener[0] !== st.opener[1] ? i18n('{name} commence avec le double {tile} (pas de double : le plus gros domino).', {name: nameOf(st.turn), tile: tileName(st.opener)}) : i18n('{name} commence avec le double {tile}.', {name: nameOf(st.turn), tile: tileName(st.opener)})) : i18n('La chaîne est vide.'))}</p>`}</div>`;
                const last = st.log.filter(x => x.t).at(-1);
                return `<div class="jpm-chain">${sideTargets.includes('L') ? `<button type="button" class="jpm-end" data-jpm-end="L" aria-label="${esc(i18n('Poser au bout gauche ({n})', {n: st.ends[0]}))}">◀ ${st.ends[0]}</button>` : `<span class="jpm-endv" title="${esc(i18n('Bout gauche'))}">${st.ends[0]}</span>`}
                    ${st.line.map((t, k) => `<span class="jpm-tile ${t[0] === t[1] ? 'is-double' : ''} ${last && ((last.side === 'L' && k === 0) || (last.side === 'R' && k === st.line.length - 1)) ? 'is-last' : ''}" title="${tileName(t)}">${tileSvg(t, t[0] === t[1])}</span>`).join('')}
                    ${sideTargets.includes('R') ? `<button type="button" class="jpm-end" data-jpm-end="R" aria-label="${esc(i18n('Poser au bout droit ({n})', {n: st.ends[1]}))}">${st.ends[1]} ▶</button>` : `<span class="jpm-endv" title="${esc(i18n('Bout droit'))}">${st.ends[1]}</span>`}</div>`;
            }
            function draw() {
                const st = s(), turnHuman = !st.over && !g.matchOver && human(st.turn) && !busy && !sh.paused;
                api.sub([i18n('Manche {n}', {n: g.manche}), c.draw ? i18n('avec pioche') : i18n('sans pioche'), c.target ? i18n('en {n} points', {n: c.target}) : i18n('une seule manche'), api.plural(N, 'joueur')].join(' · '));
                // à plusieurs personnes, la main de celle qui joue reste cachée tant qu'elle n'a pas dit « c'est moi »
                if (humans.length > 1 && !st.over && turnHuman && viewer !== st.turn) {
                    host.innerHTML = `${sh.bar(players(st))}<div class="jfn-veil jp-veil"><p class="jf-big">🙈 ${esc(i18n('{name}, à toi : que les autres détournent les yeux.', {name: nameOf(st.turn)}))}</p><button type="button" class="button" data-jpm-lift>${esc(i18n('Je suis {name} : voir mes dominos', {name: nameOf(st.turn)}))}</button></div>`;
                    sh.bind(); host.querySelector('[data-jpm-lift]')?.addEventListener('click', () => { viewer = st.turn; draw(); }, {signal: api.signal}); host.querySelector('[data-jpm-lift]')?.focus(); return;
                }
                const me = turnHuman ? st.turn : (viewer >= 0 ? viewer : humans[0]), hand = st.hands[me] || [], moves = turnHuman && me === st.turn ? Dm().moves(st) : [];
                const playable = new Set(moves.map(m => m.i)), selSides = sel >= 0 ? moves.filter(m => m.i === sel).map(m => m.side) : [];
                const canDraw = turnHuman && !moves.length && c.draw && st.stock.length, mustPass = turnHuman && !moves.length && !canDraw;
                const hintI = hint && !hint.draw ? hint.i : -1;
                const roundEnd = st.over ? `<div class="jpm-end-box"><p class="jf-big">${esc(st.winner >= 0 ? (st.gain ? i18n(st.blocked ? '🔒 Partie bloquée : {name} gagne la manche et marque {pts}.' : '🁫 Domino ! {name} gagne la manche et marque {pts}.', {name: nameOf(st.winner), pts: api.plural(st.gain, 'point')}) : i18n(st.blocked ? '🔒 Partie bloquée : {name} gagne la manche.' : '🁫 Domino ! {name} gagne la manche.', {name: nameOf(st.winner)})) : i18n('🔒 Partie bloquée, égalité : personne ne marque.'))}</p>
                    <table class="jpm-count"><thead><tr><th>${esc(i18n('Joueur'))}</th><th>${esc(i18n('En main'))}</th><th>${esc(i18n('Points'))}</th></tr></thead><tbody>${st.hands.map((h, i) => `<tr class="${i === st.winner ? 'is-win' : ''}"><td>${esc(nameOf(i))}</td><td>${h.map(t => `<span class="jpm-mini">${tileSvg(t)}</span>`).join('') || '—'}</td><td>${Dm().handPips(h)}</td></tr>`).join('')}</tbody></table>
                    ${g.matchOver ? `<p class="jf-big">🏆 ${esc(g.winner >= 0 ? i18n('{name} gagne la partie avec {pts} !', {name: nameOf(g.winner), pts: api.plural(g.scores[g.winner], 'point')}) : i18n('Égalité.'))}</p>${lastMsg ? `<p class="jp-newrec">${esc(lastMsg)}</p>` : ''}<p class="muted jf-small">${esc(i18n('« ↻ Rejouer » en haut : une nouvelle partie.'))}</p>` : `<button type="button" class="button" data-jpm-next>▶ ${esc(i18n('Manche suivante'))}</button>`}</div>` : '';
                const msg = esc(st.over ? '' : sh.paused ? `⏸ ${i18n('En pause')}` : turnHuman ? (moves.length ? (sel >= 0 && selSides.length > 1 ? i18n('Ce domino va des deux côtés : touche ◀ ou ▶ sur la chaîne.') : i18n('À toi, {name} : pose un domino.', {name: nameOf(st.turn)})) : canDraw ? i18n('Tu ne peux pas jouer : pioche.') : i18n('Tu ne peux pas jouer : passe ton tour.')) : i18n('{name} réfléchit…', {name: nameOf(st.turn)}));
                host.innerHTML = `${sh.bar(players(st))}
                  <div class="goose-game-layout jpm"><div class="goose-board-wrap jp-wrap">${sh.pauseHtml()}
                    <div class="jpm-table ${sh.paused ? 'jp-hide' : ''}">
                      <div class="jpm-others">${st.hands.map((h, i) => (i === me ? '' : `<div class="jpm-other ${i === st.turn && !st.over ? 'is-on' : ''}"><b>${esc(nameOf(i))}${c.players[i].ai ? ' 🤖' : ''}</b><span class="jpm-backs" aria-label="${esc(api.plural(h.length, 'domino'))}">${st.over ? h.map(t => `<span class="jpm-mini">${tileSvg(t)}</span>`).join('') : h.map(() => '<i></i>').join('')}</span><small>${esc(api.plural(h.length, 'domino'))}</small></div>`)).join('')}</div>
                      ${chainHtml(st, sel >= 0 ? selSides : [])}
                      <p class="jpm-stock">${esc(c.draw ? `🂠 ${i18n('Pioche : {what}', {what: api.plural(st.stock.length, 'domino')})}` : i18n('Sans pioche'))}</p>
                      ${roundEnd}
                      <div class="jpm-hand-wrap"><p class="jpm-hand-t"><b>${esc(humans.length > 1 ? i18n('Les dominos de {name}', {name: nameOf(me)}) : i18n('Tes dominos'))}</b> · ${esc(i18n('{pts} en main', {pts: api.plural(Dm().handPips(hand), 'point')}))}</p>
                        <div class="jpm-hand" role="listbox" aria-label="${esc(i18n('Ta main'))}">${hand.map((t, i) => `<button type="button" class="jpm-tile jpm-h ${playable.has(i) ? 'is-ok' : turnHuman ? 'is-no' : ''} ${sel === i ? 'is-sel' : ''} ${hintI === i ? 'is-hint' : ''}" data-jpm-i="${i}" role="option" aria-selected="${sel === i}" aria-label="${esc(i18n(playable.has(i) ? 'Domino {tile}, jouable' : 'Domino {tile}', {tile: tileName(t)}))}" tabindex="${(sel >= 0 ? sel === i : i === (moves[0]?.i ?? 0)) ? 0 : -1}">${tileSvg(t, true)}</button>`).join('')}</div>
                        <div class="jpm-act">${canDraw ? `<button type="button" class="button ${hint?.draw ? 'is-hint' : ''}" data-jpm-draw>🂠 ${esc(i18n('Piocher'))}</button>` : ''}${mustPass && !st.over ? `<button type="button" class="button" data-jpm-pass>${esc(i18n('Passer mon tour'))}</button>` : ''}</div></div>
                    </div></div>
                    <aside class="goose-panel jp-panel"><p class="goose-status jf-big" role="status">${msg || (st.over ? esc(i18n('Manche finie')) : '')}</p>
                      <table class="jpm-score"><caption>${esc(c.target ? i18n('Le score (en {n})', {n: c.target}) : i18n('Le score'))}</caption><tbody>${g.scores.map((v, i) => `<tr class="${i === st.turn && !st.over ? 'is-on' : ''}"><td><i style="--pc:${esc(c.players[i].color)}"></i>${esc(nameOf(i))}${c.players[i].ai ? ' 🤖' : ''}</td><td>${v}</td></tr>`).join('')}</tbody></table>
                      ${humans.length === 1 ? Pl.records.html('dominos', `ia-${N}j`, `À ${N}`) : ''}
                      <p class="muted jf-small">${esc(i18n('Touche un domino jouable (encadré), puis ◀ ou ▶ s’il va des deux côtés. Clavier : ← → dans ta main, Entrée. ⌘Z annule, H un conseil, Échap pause.'))}</p></aside></div>`;
                sh.bind(); bind(moves, turnHuman);
                if (!st.over && !g.matchOver && !sh.paused && !busy) maybeAI();
            }
            function players(st) { return c.players.map((p, i) => ({name: nameOf(i), color: p.color, ai: p.ai, on: !st.over && st.turn === i, score: g.scores[i], extra: `<small>${esc(api.plural(st.hands[i].length, 'domino'))}</small>`})); }
            function bind(moves, turnHuman) {
                const sig = {signal: api.signal}, handEl = host.querySelector('.jpm-hand');
                handEl?.addEventListener('click', e => {
                    const b = e.target.closest('[data-jpm-i]'); if (!b || !turnHuman) return; const i = Number(b.dataset.jpmI), sides = moves.filter(m => m.i === i).map(m => m.side);
                    if (!sides.length) { b.classList.add('is-shake'); api.toast?.(i18n('Ce domino ne va sur aucun bout de la chaîne.')); return; }
                    const st = s(), same = sides.length === 2 && st.ends && st.ends[0] === st.ends[1];
                    if (sides.length === 1 || same) { humanPlay(i, sides[0]); return; }
                    sel = sel === i ? -1 : i; draw(); host.querySelector('[data-jpm-end]')?.focus();
                }, sig);
                handEl?.addEventListener('keydown', e => {
                    const b = e.target.closest('[data-jpm-i]'); if (!b) return; const d = {ArrowRight: 1, ArrowLeft: -1}[e.key]; if (!d) return; e.preventDefault();
                    const all = [...handEl.querySelectorAll('[data-jpm-i]')], k = all.indexOf(b), n = all[(k + d + all.length) % all.length]; all.forEach(x => { x.tabIndex = -1; }); n.tabIndex = 0; n.focus();
                }, sig);
                host.querySelectorAll('[data-jpm-end]').forEach(b => b.addEventListener('click', () => { if (sel >= 0) humanPlay(sel, b.dataset.jpmEnd); }, sig));
                host.querySelector('[data-jpm-draw]')?.addEventListener('click', humanDraw, sig);
                host.querySelector('[data-jpm-pass]')?.addEventListener('click', humanPass, sig);
                host.querySelector('[data-jpm-next]')?.addEventListener('click', nextRound, sig);
                if (document.activeElement === document.body && turnHuman && !sh.paused) handEl?.querySelector('[tabindex="0"]')?.focus({preventScroll: true});
            }
            api.onCleanup(() => { token++; sh.settle(); sh.stop(); api.save(); });
            draw();
        },
    });
})();
