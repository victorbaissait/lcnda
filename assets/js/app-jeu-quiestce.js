/* LCNDA — 🕵️ « Qui est-ce ? » des ancêtres (Jeux de la famille, app-jeu-famille.js).
 * L'app cache un ancêtre (ou un joueur le choisit pour l'autre) ; on pose des questions oui / non tirées de la généalogie
 * (née avant 1800 ? laboureur ? née à Auch ? du côté de ton père ?) ; les portraits qui ne collent plus se grisent ;
 * on propose une réponse quand on veut. Seul (moins de questions = mieux) ou à deux (chacun son ancêtre caché).
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    if (!J()) return;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : s);
    const SNAP = p => ({id: p.id, first: p.first, last: p.last, name: p.name, g: p.g, photo: p.photo, job: p.job, by: p.by, dy: p.dy, btown: p.btown, dtown: p.dtown, sosa: p.sosa, gen: p.gen, side: p.side});
    J().register({
        key: 'quiz', short: 'Qui est-ce ?', icon: '🕵️', label: '🕵️ Qui est-ce ? des ancêtres', title: 'Qui est-ce ? des ancêtres', eyebrow: 'QUI EST-CE ?', unit: 'ancêtre', minPeople: 4,
        desc: 'Un ancêtre est caché parmi les portraits : pose des questions (« Née avant 1800 ? », « Laboureur ? », « Du côté de ton père ? ») et trouve-le avec le moins de questions possible.',
        rulesHint: 'Les portraits qui ne collent plus avec les réponses se grisent tout seuls. Une mauvaise proposition compte 2 questions.',
        scope: true, players: {min: 1, max: 2, def: 1},
        defaults: () => ({size: 16, secret: 'hasard', scope: {kind: 'sosa', gen: 3}}),
        clean: c => ({...c, size: Math.max(6, Math.min(40, Number(c.size) || 16)), secret: c.secret === 'choisi' ? 'choisi' : 'hasard'}),
        ready: [{k: 'kids', name: 'Pour les enfants', hint: '9 portraits, l’app cache l’ancêtre', cfg: {size: 9, secret: 'hasard'}}, {k: 'duel', name: 'Duel à deux', hint: '20 portraits, chacun cache un ancêtre à l’autre', cfg: {size: 20, secret: 'choisi'}}, {k: 'big', name: 'Grand plateau', hint: '30 portraits de toute la généalogie', cfg: {size: 30, scope: {kind: 'all', gen: 3}}}],
        fieldsHtml: (c, h) => `<div data-jfq-size></div><div class="jf-row"><span class="jf-lab">${h.esc(i18n('À deux, l’ancêtre caché est'))}</span>${h.seg('secret', [['hasard', h.esc(i18n('🎲 tiré au hasard'))], ['choisi', h.esc(i18n('🤫 choisi par l’autre joueur'))]], c.secret)}</div><p class="muted jf-small">${h.esc(i18n('Avec un seul joueur, l’app cache toujours l’ancêtre. Ajoute un 2ᵉ joueur pour un duel.'))}</p>`,
        bindFields: (form, c, save, {range, countView}) => range(form.querySelector('[data-jfq-size]'), {label: i18n('Nombre de portraits sur le plateau'), min: 6, max: 40, value: c.size, unit: 'portraits', def: 16}, v => { c.size = v; save(); countView(); }),
        onSeg: (k, v, c) => { if (k === 'secret') c.secret = v; },
        usable: people => people.length,
        async start(c, {people}) {
            if (people.length < 4) return {error: i18n('Il faut au moins 4 personnes (sans les vivants ni les fiches confidentielles) dans cet ensemble. Choisis « Toute la généalogie » ou une autre génération.')};
            const rand = L().rng(c.seed), board = L().shuffle(people, rand).slice(0, c.size).map(SNAP);
            const pick = () => board[Math.floor(rand() * board.length)].id;
            const players = c.players.map(() => ({secret: c.players.length > 1 && c.secret === 'choisi' ? 0 : pick(), asked: [], out: [], q: 0, wrong: 0, found: false}));
            return {board, players, turn: 0, phase: players.some(p => !p.secret) ? 'choose' : 'play', chooser: 0, last: null, status: i18n('À toi de jouer')};
        },
        mount(host, g, api) {
            const {esc, avatar} = api, L_ = api.L, two = g.players.length > 1;
            const byId = new Map(g.board.map(p => [p.id, p]));
            const allQ = L_.quizQuestions(g.board), qById = id => allQ.find(q => q.id === id);
            let guessing = false, filter = '';
            const P = () => g.players[g.turn], name = i => g.cfg.players[i]?.name || i18n('Joueur {n}', {n: i + 1}), other = i => (i + 1) % g.players.length;
            const remaining = pl => L_.quizRemaining(g.board, pl.asked, qById).filter(p => !pl.out.includes(p.id));
            const draw = () => {
                if (g.phase === 'choose') return drawChoose();
                const pl = P(), rem = new Set(remaining(pl).map(p => p.id)), done = g.phase === 'done';
                const qs = done ? [] : L_.quizQuestions(g.board.filter(p => rem.has(p.id))).filter(q => !pl.asked.some(a => a.id === q.id));
                const cats = [...new Set(qs.map(q => q.cat))], f = filter.trim().toLocaleLowerCase('fr-FR');
                api.sub(done ? (g.winner != null ? (two ? i18n('🏁 {name} a gagné !', {name: name(g.winner)}) : i18n('🏁 Trouvé !')) : i18n('🏁 Partie terminée')) : `${two ? `${i18n('Au tour de {name}', {name: name(g.turn)})} · ` : ''}${api.plural(rem.size, 'portrait encore possible', 'portraits encore possibles')} · ${api.plural(pl.q, 'question')}`);
                host.innerHTML = `<div class="goose-game-layout jfq">
                  <div class="goose-board-wrap jfq-board ${guessing ? 'is-guessing' : ''}" role="grid" aria-label="${esc(i18n('Les portraits'))}">${g.board.map(p => { const outAuto = !rem.has(p.id) && !pl.out.includes(p.id), outHand = pl.out.includes(p.id), win = done && p.id === g.players[g.winner ?? g.turn]?.secret;
                        return `<button type="button" class="jfq-card ${outAuto || outHand ? 'is-out' : ''} ${win ? 'is-win' : ''}" data-p="${p.id}" aria-label="${esc(outAuto || outHand ? i18n('{name} (écarté)', {name: p.name}) : p.name)}" ${done ? 'disabled' : ''}>${avatar(p, 48)}<b>${esc(p.name)}</b><small>${esc(L_.lifeOf(p))}</small></button>`; }).join('')}</div>
                  <aside class="goose-panel jfq-panel">
                    ${two ? `<div class="jf-turns">${g.players.map((x, i) => `<span class="jf-turn ${i === g.turn && !done ? 'is-on' : ''}" style="--pc:${esc(g.cfg.players[i].color)}"><i></i>${esc(name(i))}<small>${api.plural(x.q, 'question')}${x.wrong ? ` · ${esc(i18n('{n} raté', {n: x.wrong}))}` : ''}</small></span>`).join('')}</div>` : ''}
                    ${g.last ? `<div class="jfq-answer is-${g.last.answer}" role="status"><small>${esc(g.last.text)}</small><b>${g.last.answer === 'oui' ? `✓ ${esc(i18n('Oui'))}` : g.last.answer === 'non' ? `✗ ${esc(i18n('Non'))}` : `? ${esc(i18n('On ne sait pas'))}`}</b></div>` : ''}
                    ${done ? endHtml() : `
                    <button type="button" class="button ${guessing ? '' : 'secondary'} jfq-guess" data-guess aria-pressed="${guessing}">🎯 ${esc(guessing ? i18n('Clique sur le portrait que tu proposes') : i18n('Je propose une réponse'))}</button>
                    <div class="jfq-qs"><strong>${esc(i18n('Pose une question'))}</strong>
                      <label class="jf-search"><span aria-hidden="true">🔍</span><input type="search" data-qf placeholder="${esc(i18n('Chercher… (née, laboureur, Auch)'))}" value="${esc(filter)}" aria-label="${esc(i18n('Chercher une question'))}"></label>
                      ${qs.length ? cats.map(cat => { const l = qs.filter(q => q.cat === cat && (!f || q.text.toLocaleLowerCase('fr-FR').includes(f))); return l.length ? `<div class="jfq-cat"><small>${esc(i18n(cat, {ctx: 'jeu'}))}</small>${l.map(q => `<button type="button" class="jfq-q" data-q="${esc(q.id)}">${esc(q.text)}</button>`).join('')}</div>` : ''; }).join('') : `<p class="muted">${esc(i18n('Plus de question utile : propose ta réponse !'))}</p>`}
                    </div>
                    <p class="muted jf-small">${esc(i18n('Clique sur un portrait pour l’écarter toi-même (ou le remettre).'))}</p>`}
                    ${pl.asked.length ? `<details class="jfq-hist"><summary>${esc(i18n('Questions déjà posées ({n})', {n: pl.asked.length}))}</summary><ol>${pl.asked.map(a => `<li>${esc(qById(a.id)?.text || a.id)} — <b>${esc(i18n(a.answer === 'oui' ? 'oui' : a.answer === 'non' ? 'non' : 'inconnu', {ctx: 'jeu'}))}</b></li>`).join('')}</ol></details>` : ''}
                  </aside></div>`;
                bind();
            };
            const endHtml = () => {
                const w = g.winner != null ? g.players[g.winner] : null;
                const cards = g.players.map((x, i) => { const p = byId.get(x.secret); return p ? `<div class="jfq-end"><small>${esc(two ? i18n('L’ancêtre caché pour {name}', {name: name(i)}) : i18n('L’ancêtre caché'))}</small>${avatar(p, 88)}<b>${esc(p.name)}</b><span>${esc([L_.lifeOf(p), p.btown && i18n('née à {town}', {town: p.btown}), p.job].filter(Boolean).join(' · '))}</span><button type="button" class="link-button" data-fiche="${p.id}">↗ ${esc(i18n('Fiche'))}</button></div>` : ''; }).join('');
                return `<div class="jfq-endbox">${w ? `<p class="jf-big">🎉 ${esc(two ? i18n('{name} a trouvé en {what} !', {name: name(g.winner), what: api.plural(w.q + w.wrong * 2, 'question')}) : i18n('Trouvé en {what} !', {what: api.plural(w.q + w.wrong * 2, 'question')}))}</p>` : ''}${cards}</div>`;
            };
            const drawChoose = () => {
                const i = g.chooser, chooser = other(i);
                api.sub(i18n('{a} choisit l’ancêtre que {b} devra trouver', {a: name(chooser), b: name(i)}));
                host.innerHTML = `<div class="jfq-choose">${api.notice('info', i18n('{a} : choisis en secret l’ancêtre que {b} devra trouver. {b}, ne regarde pas !', {a: name(chooser), b: name(i)}))}
                    <div class="goose-board-wrap jfq-board">${g.board.map(p => `<button type="button" class="jfq-card" data-pick="${p.id}" aria-label="${esc(i18n('Cacher {name}', {name: p.name}))}">${avatar(p, 48)}<b>${esc(p.name)}</b><small>${esc(L_.lifeOf(p))}</small></button>`).join('')}</div></div>`;
                host.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
                    g.players[i].secret = Number(b.dataset.pick); const next = g.players.findIndex(x => !x.secret);
                    if (next >= 0) g.chooser = next; else { g.phase = 'play'; g.turn = 0; }
                    api.save(); api.toast(next >= 0 ? i18n('C’est caché. Au suivant !') : i18n('C’est caché : la partie commence.')); draw();
                }, {signal: api.signal}));
                nav();
            };
            const endTurn = () => { if (two && g.phase !== 'done') g.turn = other(g.turn); g.status = g.phase === 'done' ? i18n('Terminée') : i18n('Au tour de {name}', {name: name(g.turn)}); api.save(); api.sidebar(); };
            const bind = () => {
                host.querySelector('[data-guess]')?.addEventListener('click', () => { guessing = !guessing; draw(); }, {signal: api.signal});
                host.querySelector('[data-qf]')?.addEventListener('input', e => { filter = e.target.value; const pos = e.target.selectionStart; draw(); const n = host.querySelector('[data-qf]'); n?.focus(); n?.setSelectionRange(pos, pos); }, {signal: api.signal});
                host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
                    const q = qById(b.dataset.q), pl = P(); if (!q) return;
                    const answer = L_.quizAnswer(q, byId.get(pl.secret)); pl.asked.push({id: q.id, answer}); pl.q++;
                    g.last = {text: q.text, answer}; filter = ''; endTurn(); draw();
                    host.querySelector('.jfq-answer')?.focus?.();
                }, {signal: api.signal}));
                host.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
                    const id = Number(b.dataset.p), pl = P();
                    if (guessing) {
                        guessing = false;
                        if (id === pl.secret) { pl.found = true; g.phase = 'done'; g.winner = g.turn; g.finished = true; g.last = null; api.toast(i18n('🎉 C’est bien {name} !', {name: byId.get(id).name})); }
                        else { pl.wrong++; if (!pl.out.includes(id)) pl.out.push(id); g.last = {text: i18n('Proposition : {name}', {name: byId.get(id).name}), answer: 'non'}; api.toast(i18n('Raté : ce n’est pas ce portrait.')); }
                        endTurn(); draw(); return;
                    }
                    const i = pl.out.indexOf(id); if (i >= 0) pl.out.splice(i, 1); else pl.out.push(id); api.save(); draw();
                    host.querySelector(`[data-p="${id}"]`)?.focus();
                }, {signal: api.signal}));
                host.querySelectorAll('[data-fiche]').forEach(b => b.addEventListener('click', async () => { const A = api.A; A.state.currentPersonId = Number(b.dataset.fiche); await A.setModule('personnes'); }, {signal: api.signal}));
                nav();
            };
            /** flèches dans la grille des portraits */
            const nav = () => { const box = host.querySelector('.jfq-board'); if (!box) return; box.addEventListener('keydown', e => {
                const list = [...box.querySelectorAll('button:not([disabled])')], i = list.indexOf(document.activeElement); if (i < 0 || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
                const cols = Math.max(1, Math.round(box.clientWidth / (list[0]?.offsetWidth || 1))), d = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols}[e.key];
                const n = list[i + d]; if (n) { e.preventDefault(); n.focus(); } }, {signal: api.signal}); };
            draw();
        },
    });
})();
