/* LCNDA — 🕵️ « Qui est-ce ? » des ancêtres (Jeux de la famille, app-jeu-famille.js).
 * L'app cache un ancêtre (ou un joueur le choisit pour l'autre) ; on pose des questions oui / non tirées de la généalogie
 * (née avant 1800 ? laboureur ? née à Auch ? du côté de ton père ?) ; les portraits qui ne collent plus se grisent ;
 * on propose une réponse quand on veut. Seul (moins de questions = mieux) ou à deux (chacun son ancêtre caché).
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    if (!J()) return;
    const SNAP = p => ({id: p.id, first: p.first, last: p.last, name: p.name, g: p.g, photo: p.photo, job: p.job, by: p.by, dy: p.dy, btown: p.btown, dtown: p.dtown, sosa: p.sosa, gen: p.gen, side: p.side});
    J().register({
        key: 'quiz', short: 'Qui est-ce ?', icon: '🕵️', label: '🕵️ Qui est-ce ? des ancêtres', title: 'Qui est-ce ? des ancêtres', eyebrow: 'QUI EST-CE ?', unit: 'ancêtre', minPeople: 4,
        desc: 'Un ancêtre est caché parmi les portraits : pose des questions (« Née avant 1800 ? », « Laboureur ? », « Du côté de ton père ? ») et trouve-le avec le moins de questions possible.',
        rulesHint: 'Les portraits qui ne collent plus avec les réponses se grisent tout seuls. Une mauvaise proposition compte 2 questions.',
        scope: true, players: {min: 1, max: 2, def: 1},
        defaults: () => ({size: 16, secret: 'hasard', scope: {kind: 'sosa', gen: 3}}),
        clean: c => ({...c, size: Math.max(6, Math.min(40, Number(c.size) || 16)), secret: c.secret === 'choisi' ? 'choisi' : 'hasard'}),
        ready: [{k: 'kids', name: 'Pour les enfants', hint: '9 portraits, l’app cache l’ancêtre', cfg: {size: 9, secret: 'hasard'}}, {k: 'duel', name: 'Duel à deux', hint: '20 portraits, chacun cache un ancêtre à l’autre', cfg: {size: 20, secret: 'choisi'}}, {k: 'big', name: 'Grand plateau', hint: '30 portraits de toute la généalogie', cfg: {size: 30, scope: {kind: 'all', gen: 3}}}],
        fieldsHtml: (c, h) => `<div data-jfq-size></div><div class="jf-row"><span class="jf-lab">À deux, l’ancêtre caché est</span>${h.seg('secret', [['hasard', '🎲 tiré au hasard'], ['choisi', '🤫 choisi par l’autre joueur']], c.secret)}</div><p class="muted jf-small">Avec un seul joueur, l’app cache toujours l’ancêtre. Ajoute un 2ᵉ joueur pour un duel.</p>`,
        bindFields: (form, c, save, {range, countView}) => range(form.querySelector('[data-jfq-size]'), {label: 'Nombre de portraits sur le plateau', min: 6, max: 40, value: c.size, unit: 'portraits', def: 16}, v => { c.size = v; save(); countView(); }),
        onSeg: (k, v, c) => { if (k === 'secret') c.secret = v; },
        usable: people => people.length,
        async start(c, {people}) {
            if (people.length < 4) return {error: 'Il faut au moins 4 personnes (sans les vivants ni les fiches confidentielles) dans cet ensemble. Choisis « Toute la généalogie » ou une autre génération.'};
            const rand = L().rng(c.seed), board = L().shuffle(people, rand).slice(0, c.size).map(SNAP);
            const pick = () => board[Math.floor(rand() * board.length)].id;
            const players = c.players.map(() => ({secret: c.players.length > 1 && c.secret === 'choisi' ? 0 : pick(), asked: [], out: [], q: 0, wrong: 0, found: false}));
            return {board, players, turn: 0, phase: players.some(p => !p.secret) ? 'choose' : 'play', chooser: 0, last: null, status: 'À toi de jouer'};
        },
        mount(host, g, api) {
            const {esc, avatar} = api, L_ = api.L, two = g.players.length > 1;
            const byId = new Map(g.board.map(p => [p.id, p]));
            const allQ = L_.quizQuestions(g.board), qById = id => allQ.find(q => q.id === id);
            let guessing = false, filter = '';
            const P = () => g.players[g.turn], name = i => g.cfg.players[i]?.name || `Joueur ${i + 1}`, other = i => (i + 1) % g.players.length;
            const remaining = pl => L_.quizRemaining(g.board, pl.asked, qById).filter(p => !pl.out.includes(p.id));
            const draw = () => {
                if (g.phase === 'choose') return drawChoose();
                const pl = P(), rem = new Set(remaining(pl).map(p => p.id)), done = g.phase === 'done';
                const qs = done ? [] : L_.quizQuestions(g.board.filter(p => rem.has(p.id))).filter(q => !pl.asked.some(a => a.id === q.id));
                const cats = [...new Set(qs.map(q => q.cat))], f = filter.trim().toLocaleLowerCase('fr-FR');
                api.sub(done ? (g.winner != null ? `🏁 ${two ? `${name(g.winner)} a gagné` : 'Trouvé'} !` : '🏁 Partie terminée') : `${two ? `Au tour de ${name(g.turn)} · ` : ''}${api.plural(rem.size, 'portrait encore possible', 'portraits encore possibles')} · ${api.plural(pl.q, 'question')}`);
                host.innerHTML = `<div class="goose-game-layout jfq">
                  <div class="goose-board-wrap jfq-board ${guessing ? 'is-guessing' : ''}" role="grid" aria-label="Les portraits">${g.board.map(p => { const outAuto = !rem.has(p.id) && !pl.out.includes(p.id), outHand = pl.out.includes(p.id), win = done && p.id === g.players[g.winner ?? g.turn]?.secret;
                        return `<button type="button" class="jfq-card ${outAuto || outHand ? 'is-out' : ''} ${win ? 'is-win' : ''}" data-p="${p.id}" aria-label="${esc(p.name)}${outAuto || outHand ? ' (écarté)' : ''}" ${done ? 'disabled' : ''}>${avatar(p, 48)}<b>${esc(p.name)}</b><small>${esc(L_.lifeOf(p))}</small></button>`; }).join('')}</div>
                  <aside class="goose-panel jfq-panel">
                    ${two ? `<div class="jf-turns">${g.players.map((x, i) => `<span class="jf-turn ${i === g.turn && !done ? 'is-on' : ''}" style="--pc:${esc(g.cfg.players[i].color)}"><i></i>${esc(name(i))}<small>${api.plural(x.q, 'question')}${x.wrong ? ` · ${x.wrong} raté` : ''}</small></span>`).join('')}</div>` : ''}
                    ${g.last ? `<div class="jfq-answer is-${g.last.answer}" role="status"><small>${esc(g.last.text)}</small><b>${g.last.answer === 'oui' ? '✓ Oui' : g.last.answer === 'non' ? '✗ Non' : '? On ne sait pas'}</b></div>` : ''}
                    ${done ? endHtml() : `
                    <button type="button" class="button ${guessing ? '' : 'secondary'} jfq-guess" data-guess aria-pressed="${guessing}">🎯 ${guessing ? 'Clique sur le portrait que tu proposes' : 'Je propose une réponse'}</button>
                    <div class="jfq-qs"><strong>Pose une question</strong>
                      <label class="jf-search"><span aria-hidden="true">🔍</span><input type="search" data-qf placeholder="Chercher… (née, laboureur, Auch)" value="${esc(filter)}" aria-label="Chercher une question"></label>
                      ${qs.length ? cats.map(cat => { const l = qs.filter(q => q.cat === cat && (!f || q.text.toLocaleLowerCase('fr-FR').includes(f))); return l.length ? `<div class="jfq-cat"><small>${esc(cat)}</small>${l.map(q => `<button type="button" class="jfq-q" data-q="${esc(q.id)}">${esc(q.text)}</button>`).join('')}</div>` : ''; }).join('') : `<p class="muted">Plus de question utile : propose ta réponse !</p>`}
                    </div>
                    <p class="muted jf-small">Clique sur un portrait pour l’écarter toi-même (ou le remettre).</p>`}
                    ${pl.asked.length ? `<details class="jfq-hist"><summary>Questions déjà posées (${pl.asked.length})</summary><ol>${pl.asked.map(a => `<li>${esc(qById(a.id)?.text || a.id)} — <b>${a.answer}</b></li>`).join('')}</ol></details>` : ''}
                  </aside></div>`;
                bind();
            };
            const endHtml = () => {
                const w = g.winner != null ? g.players[g.winner] : null;
                const cards = g.players.map((x, i) => { const p = byId.get(x.secret); return p ? `<div class="jfq-end"><small>${two ? `L’ancêtre caché pour ${esc(name(i))}` : 'L’ancêtre caché'}</small>${avatar(p, 88)}<b>${esc(p.name)}</b><span>${esc([L_.lifeOf(p), p.btown && `née à ${p.btown}`, p.job].filter(Boolean).join(' · '))}</span><button type="button" class="link-button" data-fiche="${p.id}">↗ Fiche</button></div>` : ''; }).join('');
                return `<div class="jfq-endbox">${w ? `<p class="jf-big">🎉 ${two ? `${esc(name(g.winner))} a trouvé` : 'Trouvé'} en ${api.plural(w.q + w.wrong * 2, 'question')} !</p>` : ''}${cards}</div>`;
            };
            const drawChoose = () => {
                const i = g.chooser, chooser = other(i);
                api.sub(`${name(chooser)} choisit l’ancêtre que ${name(i)} devra trouver`);
                host.innerHTML = `<div class="jfq-choose">${api.notice('info', `${name(chooser)} : choisis en secret l’ancêtre que ${name(i)} devra trouver. ${name(i)}, ne regarde pas !`)}
                    <div class="goose-board-wrap jfq-board">${g.board.map(p => `<button type="button" class="jfq-card" data-pick="${p.id}" aria-label="Cacher ${esc(p.name)}">${avatar(p, 48)}<b>${esc(p.name)}</b><small>${esc(L_.lifeOf(p))}</small></button>`).join('')}</div></div>`;
                host.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
                    g.players[i].secret = Number(b.dataset.pick); const next = g.players.findIndex(x => !x.secret);
                    if (next >= 0) g.chooser = next; else { g.phase = 'play'; g.turn = 0; }
                    api.save(); api.toast(next >= 0 ? 'C’est caché. Au suivant !' : 'C’est caché : la partie commence.'); draw();
                }, {signal: api.signal}));
                nav();
            };
            const endTurn = () => { if (two && g.phase !== 'done') g.turn = other(g.turn); g.status = g.phase === 'done' ? 'Terminée' : `Au tour de ${name(g.turn)}`; api.save(); api.sidebar(); };
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
                        if (id === pl.secret) { pl.found = true; g.phase = 'done'; g.winner = g.turn; g.finished = true; g.last = null; api.toast(`🎉 C’est bien ${byId.get(id).name} !`); }
                        else { pl.wrong++; if (!pl.out.includes(id)) pl.out.push(id); g.last = {text: `Proposition : ${byId.get(id).name}`, answer: 'non'}; api.toast('Raté : ce n’est pas ce portrait.'); }
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
