/* LCNDA — 🃏 Memory des portraits (Jeux de la famille, app-jeu-famille.js).
 * On retourne deux cartes : portrait ↔ nom, personne ↔ village, personne ↔ métier ou personne ↔ année de naissance.
 * 1 à 4 joueurs chacun son tour (une paire trouvée = on rejoue), chrono et coups.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, L = () => window.LCNDA_JEUX_LOGIQUE;
    if (!J()) return;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : s);
    const KINDS = [['nom', '🖼 Portrait ↔ nom'], ['village', '📍 Personne ↔ village'], ['metier', '🛠 Personne ↔ métier'], ['annee', '📅 Personne ↔ année']];
    J().register({
        key: 'memory', short: 'Memory', icon: '🃏', label: '🃏 Memory des portraits', title: 'Memory des portraits', eyebrow: 'MEMORY', unit: 'paire possible', unitP: 'paires possibles', minPeople: 3,
        desc: 'Retourne deux cartes à la fois et retrouve les paires : un portrait et son nom, une personne et son village, son métier ou son année de naissance.',
        rulesHint: 'Une paire trouvée : la carte reste visible et le même joueur rejoue.',
        scope: true, players: {min: 1, max: 4, def: 1},
        defaults: () => ({kind: 'nom', pairs: 8, scope: {kind: 'sosa', gen: 3}}),
        clean: c => ({...c, kind: KINDS.some(k => k[0] === c.kind) ? c.kind : 'nom', pairs: Math.max(6, Math.min(24, Number(c.pairs) || 8))}),
        ready: [{k: 'kids', name: 'Petit memory', hint: '6 paires portrait ↔ nom', cfg: {kind: 'nom', pairs: 6}}, {k: 'towns', name: 'Les villages', hint: '10 paires personne ↔ village', cfg: {kind: 'village', pairs: 10}}, {k: 'big', name: 'Grand memory', hint: '18 paires de toute la généalogie', cfg: {kind: 'nom', pairs: 18, scope: {kind: 'all', gen: 3}}}],
        fieldsHtml: (c, h) => `<div class="jf-row"><span class="jf-lab">${h.esc(i18n('Les paires'))}</span>${h.seg('kind', KINDS.map(([k, l]) => [k, h.esc(i18n(l))]), c.kind)}</div><div data-jfm-pairs></div>`,
        bindFields: (form, c, save, {range, countView}) => range(form.querySelector('[data-jfm-pairs]'), {label: i18n('Nombre de paires'), min: 6, max: 24, value: c.pairs, unit: 'paires', def: 8}, v => { c.pairs = v; save(); countView(); }),
        onSeg: (k, v, c) => { if (k === 'kind') c.kind = v; },
        usable: (people, c) => L().memoryDeck(people, c.kind, 99, 'x').pairs,
        async start(c, {people}) {
            const deck = L().memoryDeck(people, c.kind, c.pairs, c.seed);
            if (deck.pairs < 3) return {error: c.kind === 'village' ? i18n('Pas assez de personnes avec un village de naissance dans cet ensemble (il faut au moins 3 paires différentes). Choisis un ensemble plus grand ou une autre sorte de paires.') : c.kind === 'metier' ? i18n('Pas assez de personnes avec un métier dans cet ensemble (il faut au moins 3 paires différentes). Choisis un ensemble plus grand ou une autre sorte de paires.') : c.kind === 'annee' ? i18n('Pas assez de personnes avec une année de naissance dans cet ensemble (il faut au moins 3 paires différentes). Choisis un ensemble plus grand ou une autre sorte de paires.') : i18n('Pas assez de personnes dans cet ensemble (il faut au moins 3 paires différentes). Choisis un ensemble plus grand ou une autre sorte de paires.')};
            const ids = new Set(deck.cards.map(x => x.pid));
            const snap = people.filter(p => ids.has(p.id)).map(p => ({id: p.id, first: p.first, last: p.last, name: p.name, g: p.g, photo: p.photo, by: p.by, dy: p.dy, btown: p.btown, job: p.job}));
            return {people: snap, cards: deck.cards.map(x => ({...x, found: -1})), pairs: deck.pairs, scores: c.players.map(() => 0), turn: 0, moves: 0, ms: 0, open: [], status: i18n('{a} / {b} paires', {a: 0, b: deck.pairs})};
        },
        mount(host, g, api) {
            const {esc, avatar} = api, byId = new Map(g.people.map(p => [p.id, p])), name = i => g.cfg.players[i]?.name || i18n('Joueur {n}', {n: i + 1});
            let t0 = performance.now(), base = g.ms || 0, tick = 0, busy = false;
            const found = () => g.cards.filter(x => x.found >= 0).length / 2, done = () => found() >= g.pairs;
            const face = c => { const p = byId.get(c.pid) || {}; if (c.side === 'a') return `${avatar(p, 88)}${g.cfg.kind === 'nom' ? '' : `<b>${esc(p.name)}</b>`}`; return `<b class="jfm-val">${esc(c.text || '')}</b>${g.cfg.kind === 'nom' ? '' : `<small>${esc(i18n({village: '📍 village', metier: '🛠 métier', annee: '📅 née en'}[g.cfg.kind] || ''))}</small>`}`; };
            const clock = () => base + (done() || !g.started ? 0 : performance.now() - t0);
            const draw = () => {
                const cols = Math.min(8, Math.ceil(Math.sqrt(g.cards.length * 1.4)));
                api.sub(`${found()} / ${api.plural(g.pairs, 'paire')} · ${api.plural(g.moves, 'coup')}${g.cfg.players.length > 1 ? ` · ${i18n('au tour de {name}', {name: name(g.turn)})}` : ''}`);
                host.innerHTML = `<div class="goose-game-layout jfm"><div class="goose-board-wrap"><div class="jfm-grid" style="--cols:${cols}" role="grid" aria-label="${esc(i18n('Les cartes'))}">${g.cards.map(c => { const up = c.found >= 0 || g.open.includes(c.i);
                        return `<button type="button" class="jfm-card ${up ? 'is-up' : ''} ${c.found >= 0 ? 'is-found' : ''}" data-c="${c.i}" ${c.found >= 0 ? `style="--pc:${esc(g.cfg.players[c.found]?.color || '#000')}"` : ''} aria-label="${up ? esc(c.side === 'a' ? (byId.get(c.pid)?.name || i18n('portrait')) : c.text) : esc(i18n('Carte retournée'))}" ${c.found >= 0 || done() ? 'disabled' : ''}><span class="jfm-in">${up ? face(c) : '<span class="jfm-back" aria-hidden="true">🌳</span>'}</span></button>`; }).join('')}</div></div>
                  <aside class="goose-panel"><div class="jf-clock" data-clock>⏱ ${api.fmtTime(clock())}</div>
                    <div class="jf-turns">${g.cfg.players.map((p, i) => `<span class="jf-turn ${i === g.turn && !done() ? 'is-on' : ''}" style="--pc:${esc(p.color)}"><i></i>${esc(p.name)}<small>${api.plural(g.scores[i], 'paire')}</small></span>`).join('')}</div>
                    ${done() ? endHtml() : `<p class="goose-status" role="status">${esc(g.open.length === 1 ? i18n('Retourne une deuxième carte.') : i18n('Retourne deux cartes.'))}</p>`}
                    <p class="muted jf-small">${esc(i18n('Clavier : flèches pour bouger, Entrée ou Espace pour retourner.'))}</p></aside></div>`;
                bind();
            };
            const endHtml = () => { const best = Math.max(...g.scores), win = g.scores.map((s, i) => s === best ? name(i) : null).filter(Boolean);
                return `<div class="jfq-endbox"><p class="jf-big">🎉 ${esc(g.cfg.players.length > 1 ? (win.length > 1 ? i18n('Égalité : {names} !', {names: win.join(` ${i18n('et', {ctx: 'liste'})} `)}) : i18n('{name} gagne !', {name: win[0]})) : i18n('Toutes les paires !'))}</p><p>${esc(i18n('{moves} en {time}.', {moves: api.plural(g.moves, 'coup'), time: api.fmtTime(g.ms)}))}</p></div>`; };
            const flip = i => {
                if (busy || done()) return; const c = g.cards[i]; if (!c || c.found >= 0 || g.open.includes(i)) return;
                if (!g.started) { g.started = true; t0 = performance.now(); }
                g.open.push(i); draw(); host.querySelector(`[data-c="${i}"]`)?.focus();
                if (g.open.length < 2) return;
                g.moves++; const [a, b] = g.open.map(k => g.cards[k]);
                if (api.L.memoryMatch(a, b)) { a.found = b.found = g.turn; g.scores[g.turn]++; g.open = []; if (done()) { g.ms = clock(); base = g.ms; g.finished = true; } g.status = done() ? i18n('Terminée') : i18n('{a} / {b} paires', {a: found(), b: g.pairs}); api.save(); api.sidebar(); draw(); return; }
                busy = true; api.save();
                setTimeout(() => { busy = false; g.open = []; if (g.cfg.players.length > 1) g.turn = (g.turn + 1) % g.cfg.players.length; api.save(); if (host.isConnected) { draw(); host.querySelector(`[data-c="${i}"]`)?.focus(); } }, document.documentElement.classList.contains('a11y-calm') ? 1600 : 1100);
            };
            const bind = () => {
                host.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => flip(Number(b.dataset.c)), {signal: api.signal}));
                const grid = host.querySelector('.jfm-grid');
                grid?.addEventListener('keydown', e => { const list = [...grid.querySelectorAll('button')], i = list.indexOf(document.activeElement), cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 4; const d = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols}[e.key]; if (i < 0 || !d) return; const n = list[i + d]; if (n) { e.preventDefault(); n.focus(); } }, {signal: api.signal});
            };
            tick = setInterval(() => { const el = host.querySelector('[data-clock]'); if (el && g.started && !done()) el.textContent = `⏱ ${api.fmtTime(clock())}`; }, 1000);
            const keep = () => { if (g.started && !done()) { g.ms = clock(); api.save(); } };
            api.onCleanup(() => { clearInterval(tick); keep(); });
            g.open = g.open.length > 1 ? [] : g.open;
            draw();
        },
    });
})();
