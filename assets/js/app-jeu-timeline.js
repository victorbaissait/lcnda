/* LCNDA — 📅 « La bonne date » (Jeux de la famille, app-jeu-famille.js), comme le jeu « Timeline ».
 * On reçoit un événement de la famille (naissance, mariage, décès… et, si on veut, des événements de l'histoire) sans sa date,
 * et on le pose à sa place sur la frise. Juste : il reste et on marque un point. Faux : il se range à sa vraie place et on perd une vie.
 * Les dates « vers » sont comprises comme partout (C4) et marquées « ≈ » ; deux dates qu'on ne peut pas départager vont dans les deux sens.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    if (!J()) return;
    const GAPS = [['0', 'Tout'], ['1', '1 an'], ['5', '5 ans'], ['10', '10 ans'], ['25', '25 ans']];
    const KINDS = [['naissance', '👶 Naissances'], ['mariage', '💍 Mariages'], ['deces', '✝ Décès']];
    J().register({
        key: 'timeline', short: 'La bonne date', icon: '📅', label: '📅 La bonne date', title: 'La bonne date', eyebrow: 'LA BONNE DATE', unit: 'événement', minPeople: 4,
        desc: 'Pose chaque événement de la famille à sa place sur la frise, de la plus ancienne à la plus récente : naissances, mariages, décès, et si tu veux des dates de l’histoire de France.',
        rulesHint: 'Juste : la carte reste et tu marques un point. Faux : elle se range à sa vraie place et tu perds une vie.',
        scope: true, players: {min: 1, max: 4, def: 1},
        defaults: () => ({cards: 12, gap: '5', lives: 3, history: false, kinds: ['naissance', 'mariage', 'deces'], scope: {kind: 'sosa', gen: 3}}),
        clean: c => ({...c, cards: Math.max(6, Math.min(30, Number(c.cards) || 12)), gap: GAPS.some(g => g[0] === String(c.gap)) ? String(c.gap) : '5', lives: Number.isFinite(Number(c.lives)) && c.lives !== '' && c.lives != null ? Math.max(0, Math.min(5, Number(c.lives))) : 3, history: !!c.history,
            kinds: (Array.isArray(c.kinds) ? c.kinds : []).filter(k => KINDS.some(x => x[0] === k)).length ? c.kinds.filter(k => KINDS.some(x => x[0] === k)) : ['naissance', 'mariage', 'deces']}),
        ready: [{k: 'easy', name: 'Facile', hint: '8 cartes, au moins 25 ans d’écart', cfg: {cards: 8, gap: '25', lives: 5}}, {k: 'hist', name: 'Avec l’histoire', hint: 'La famille et les grandes dates de France', cfg: {cards: 15, gap: '5', history: true}}, {k: 'hard', name: 'Champion', hint: '25 cartes, dates proches, 1 vie', cfg: {cards: 25, gap: '0', lives: 1}}],
        fieldsHtml: (c, h) => `<div class="jf-row"><span class="jf-lab">Les événements</span><div class="jf-checks">${KINDS.map(([k, t]) => `<label class="checkbox-line"><input type="checkbox" data-jft-kind="${k}" ${c.kinds.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
            ${h.toggle('data-jft-history', c.history, '📜 Ajouter des dates de l’histoire de France (Révolution, guerres, école obligatoire…)')}
            <div data-jft-cards></div><div class="jf-row"><span class="jf-lab">Écart minimum entre deux cartes</span>${h.seg('gap', GAPS, c.gap)}</div><div data-jft-lives></div>`,
        bindFields(form, c, save, {range, countView}) {
            range(form.querySelector('[data-jft-cards]'), {label: 'Nombre de cartes', min: 6, max: 30, value: c.cards, unit: 'cartes', def: 12}, v => { c.cards = v; save(); });
            range(form.querySelector('[data-jft-lives]'), {label: 'Vies par joueur (0 = sans vies, on compte les points)', min: 0, max: 5, value: c.lives, unit: 'vies', def: 3}, v => { c.lives = v; save(); });
        },
        onSeg: (k, v, c) => { if (k === 'gap') c.gap = v; },
        onChange(t, c, form) {
            if (t.dataset.jftKind) { const on = [...form.querySelectorAll('[data-jft-kind]')].filter(x => x.checked).map(x => x.dataset.jftKind); if (!on.length) { t.checked = true; return window.LCNDA_UI?.fail?.(t, 'Garde au moins une sorte d’événement.'); } c.kinds = on; }
            if (t.matches('[data-jft-history]')) c.history = t.checked;
        },
        usable: (people, c) => window.LCNDA_JEUX_LOGIQUE.timelineEvents(null, people, {history: c.history, kinds: c.kinds}).length,
        async start(c, {data, people}) {
            const ev = L().timelineEvents(data, people, {history: c.history, kinds: c.kinds}), deck = L().timelineDeck(ev, c.cards + 1, Number(c.gap), c.seed);
            if (deck.length < 5) return {error: 'Pas assez d’événements datés avec ces réglages (il en faut au moins 5). Ajoute les dates de l’histoire, un écart plus petit ou un ensemble plus grand.'};
            const line = [deck[0]];
            return {deck, line, pos: 1, turn: 0, players: c.players.map(() => ({lives: c.lives, pts: 0, out: false})), last: null, status: `1 / ${deck.length} cartes`};
        },
        mount(host, g, api) {
            const {esc} = api, L_ = api.L, name = i => g.cfg.players[i]?.name || `Joueur ${i + 1}`, lives = g.cfg.lives > 0;
            const card = () => g.deck[g.pos], over = () => g.finished || g.pos >= g.deck.length || g.players.every(p => p.out);
            const evHtml = (e, withDate, cls = '') => `<div class="jft-card ${cls} k-${e.kind}" data-k="${esc(e.id)}"><span class="jft-ico" aria-hidden="true">${e.icon}</span>${withDate ? `<b class="jft-date">${esc(L_.dateText(e.date))}</b>` : ''}<span class="jft-t">${esc(e.text)}</span>${e.where ? `<small>📍 ${esc(e.where)}</small>` : ''}</div>`;
            const draw = () => {
                const end = over(), cur = card();
                if (end && !g.finished) { g.finished = true; g.status = 'Terminée'; api.save(); api.sidebar(); }
                api.sub(`${api.plural(g.line.length, 'carte posée', 'cartes posées')} sur ${g.deck.length}${!end && g.cfg.players.length > 1 ? ` · au tour de ${name(g.turn)}` : ''}`);
                const slots = i => `<button type="button" class="jft-slot" data-at="${i}" ${end ? 'disabled' : ''} aria-label="Poser ici, ${i === 0 ? 'avant tout' : i === g.line.length ? 'après tout' : `entre « ${esc(g.line[i - 1].text)} » et « ${esc(g.line[i].text)} »`}"><span>⬇ Ici</span></button>`;
                host.innerHTML = `<div class="jft">
                    <div class="jft-top">${end ? endHtml() : `<div class="jft-hand"><small>${g.cfg.players.length > 1 ? `${esc(name(g.turn))}, pose cette carte :` : 'Pose cette carte à sa place :'}</small>${evHtml(cur, false, 'is-hand')}<p class="muted jf-small">Glisse-la sur « ⬇ Ici », ou clique (Tab puis Entrée) sur la bonne place.</p></div>`}
                      <aside class="goose-panel jft-side"><div class="jf-turns">${g.cfg.players.map((p, i) => `<span class="jf-turn ${i === g.turn && !end ? 'is-on' : ''} ${g.players[i].out ? 'is-out' : ''}" style="--pc:${esc(p.color)}"><i></i>${esc(p.name)}<small>${api.plural(g.players[i].pts, 'point')}${lives ? ` · ${'♥'.repeat(Math.max(0, g.players[i].lives)) || 'plus de vie'}` : ''}</small></span>`).join('')}</div>
                        ${g.last ? `<div class="jfq-answer is-${g.last.ok ? 'oui' : 'non'}" role="status"><b>${g.last.ok ? '✓ Bien placé !' : '✗ Pas tout à fait'}</b><small>${esc(g.last.text)} : ${esc(L_.dateText(g.last.date))}</small></div>` : ''}</aside></div>
                    <div class="jft-line" role="list" aria-label="La frise, de la plus ancienne à la plus récente"><span class="jft-end">⏳ plus ancien</span>${g.line.map((e, i) => `${slots(i)}<div role="listitem">${evHtml(e, true, g.last?.id === e.id ? (g.last.ok ? 'is-ok' : 'is-bad') : '')}</div>`).join('')}${slots(g.line.length)}<span class="jft-end">plus récent ⌛</span></div></div>`;
                bind();
            };
            const endHtml = () => { const best = Math.max(...g.players.map(p => p.pts)), win = g.players.map((p, i) => p.pts === best ? name(i) : null).filter(Boolean);
                return `<div class="jfq-endbox"><p class="jf-big">🏁 ${g.cfg.players.length > 1 ? (win.length > 1 ? `Égalité : ${esc(win.join(' et '))}` : `${esc(win[0])} gagne`) : `${api.plural(best, 'point')}`} !</p><p>${api.plural(g.line.length, 'carte')} sur la frise.</p></div>`; };
            const place = at => {
                if (over()) return; const e = card(), ok = L_.timelineFits(g.line, e, at), pl = g.players[g.turn];
                g.line.splice(ok ? at : L_.timelinePlace(g.line, e), 0, e); g.pos++;
                if (ok) pl.pts++; else if (lives) { pl.lives--; if (pl.lives <= 0) pl.out = true; }
                g.last = {id: e.id, ok, text: e.text, date: e.date};
                if (g.cfg.players.length > 1) { let n = g.turn; for (let k = 0; k < g.players.length; k++) { n = (n + 1) % g.players.length; if (!g.players[n].out) break; } g.turn = n; }
                g.status = `${g.line.length} / ${g.deck.length} cartes`; api.save(); api.sidebar(); draw();
                host.querySelector(`[data-k="${CSS.escape(e.id)}"]`)?.scrollIntoView?.({block: 'nearest', inline: 'center', behavior: document.documentElement.classList.contains('a11y-calm') ? 'auto' : 'smooth'});
                host.querySelector('.jft-slot')?.focus();
            };
            const bind = () => {
                host.querySelectorAll('[data-at]').forEach(b => {
                    b.addEventListener('click', () => place(Number(b.dataset.at)), {signal: api.signal});
                    b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('is-over'); }, {signal: api.signal});
                    b.addEventListener('dragleave', () => b.classList.remove('is-over'), {signal: api.signal});
                    b.addEventListener('drop', e => { e.preventDefault(); place(Number(b.dataset.at)); }, {signal: api.signal});
                });
                const hand = host.querySelector('.is-hand');
                if (hand) { hand.draggable = true; hand.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'jft'); e.dataTransfer.effectAllowed = 'move'; }, {signal: api.signal}); }
            };
            draw();
        },
    });
})();
