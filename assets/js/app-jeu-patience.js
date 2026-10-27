/* LCNDA — 🂠 Patiences (Jeux de la famille, app-jeu-famille.js) : l'écran de jeu des 108 patiences.
 * Les règles sont dans app-jeu-patience-regles.js (LCNDA_PATIENCES, sans écran) ; ici : la table, les cartes, la souris et le clavier.
 * Jouer : glisser une carte (ou une suite) sur une autre pile, ou cliquer la carte puis la pile où la poser ; double-clic : sur une
 * fondation ; clic sur la pioche : piocher. Jeux à paires (Pyramide, Onze, Monte-Carlo…) : cliquer les cartes qui vont ensemble.
 * ↶ Annuler (Ctrl+Z, sans limite pendant la partie), 💡 Un coup possible, ⬆ Tout monter, chrono et record par jeu.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, P = () => window.LCNDA_PATIENCES;
    if (!J() || !P()) return;
    const SUIT = ['♥', '♦', '♠', '♣'], SUIT_NAME = ['cœur', 'carreau', 'pique', 'trèfle'];
    const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'], RANK_NAME = ['', 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'];
    const BACKS = [['bleu', 'Bleu'], ['rouge', 'Rouge'], ['vert', 'Vert'], ['sepia', 'Sépia']];
    const escH = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
    /** une partie relue (localStorage, ↶ Annuler) : JSON écrit « Infinity » (pioche sans limite) comme null */
    const revive = st => { if (st && (st.redeals == null || Number.isNaN(st.redeals))) st.redeals = Infinity; return st; };
    const stars = n => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
    const cardName = c => `${RANK_NAME[c.r]} de ${SUIT_NAME[c.s]}`;
    const gameOf = k => P().get(k) || P().get('klondike1');
    const BEST_KEY = 'lcnda-patiences-records';
    const bests = () => { try { const v = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const saveBest = (k, rec) => { try { const b = bests(); b[k] = rec; localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (_) {} };

    /** la liste des jeux, rangés par famille */
    const gameOptions = (esc, cur) => P().FAMILIES.map(([f, label]) => `<optgroup label="${esc(label)}">${P().GAMES.filter(g => g.fam === f).map(g => `<option value="${esc(g.k)}"${g.k === cur ? ' selected' : ''}>${esc(g.name)} · ${stars(g.diff)}</option>`).join('')}</optgroup>`).join('');
    const descHtml = (esc, k) => { const g = gameOf(k), fam = P().FAMILIES.find(f => f[0] === g.fam); return `<b>${esc(g.name)}</b> <span class="jfp-stars" title="Difficulté ${g.diff} sur 5">${stars(g.diff)}</span><br>${esc(g.desc || '')}${fam ? `<br><span class="muted">${esc(fam[1])} : ${esc(fam[2])}</span>` : ''}`; };

    J().register({
        key: 'patience', short: 'Patience', icon: '🂠', label: '🂠 Patiences (jeux de cartes)', title: 'Patiences', eyebrow: 'PATIENCES',
        desc: `${P().GAMES.length} jeux de cartes qui se jouent seul : Klondike, FreeCell, Araignée, Yukon, Pyramide, Golf, La Belle Lucie…`,
        rulesHint: 'Glisser une carte, ou la cliquer puis cliquer où la poser ; double-clic : sur une fondation. Ctrl+Z : annuler.',
        namePh: 'Ex : Ma patience du soir', fieldsTitle: 'Le jeu',
        scope: false, players: {min: 1, max: 1, def: 1},
        defaults: () => ({game: 'klondike1', auto: true, back: 'bleu'}),
        clean: c => ({...c, game: P().get(c.game) ? c.game : 'klondike1', auto: c.auto !== false, back: BACKS.some(b => b[0] === c.back) ? c.back : 'bleu'}),
        ready: [{k: 'kl', name: 'Klondike', hint: 'le classique, pioche d’une carte', cfg: {game: 'klondike1'}}, {k: 'fc', name: 'FreeCell', hint: 'tout est visible, 4 cases libres', cfg: {game: 'freecell'}},
            {k: 'sp', name: 'Araignée', hint: 'une couleur, pour commencer', cfg: {game: 'spider1'}}, {k: 'yk', name: 'Yukon', hint: 'on déplace tout groupe visible', cfg: {game: 'yukon'}},
            {k: 'py', name: 'La pyramide', hint: 'des paires qui font 13', cfg: {game: 'pyramid'}}, {k: 'gf', name: 'Golf', hint: 'au plus ou au moins un', cfg: {game: 'golf'}}],
        fieldsHtml: (c, h) => `<label class="jfp-pick">Le jeu (${P().GAMES.length} patiences)<select data-jfp-game>${gameOptions(h.esc, c.game)}</select></label>
            <p class="jfp-desc" data-jfp-desc>${descHtml(h.esc, c.game)}</p>
            <div class="jf-checks">${h.toggle('data-jfp-auto', c.auto, '⬆ À la fin, monter tout seul les cartes sur les fondations')}</div>
            <div class="jfp-backs"><span>Dos des cartes</span>${h.seg('back', BACKS, c.back)}</div>`,
        onChange(t, c, form) {
            if (t.matches('[data-jfp-game]')) { c.game = P().get(t.value) ? t.value : 'klondike1'; const d = form.querySelector('[data-jfp-desc]'); if (d) d.innerHTML = descHtml(escH, c.game); }
            if (t.matches('[data-jfp-auto]')) c.auto = t.checked;
        },
        onSeg(name, v, c) { if (name === 'back') c.back = v; },
        start(c, src, prev) {
            const seed = `${c.seed}${prev ? 'r' + ((prev.round || 1) + 1) : ''}`;
            return {st: P().deal(c.game, seed), dealSeed: seed, ms: 0, startAt: Date.now(), won: false, round: (prev?.round || 0) + 1, status: gameOf(c.game).name};
        },
        mount(host, g, api) {
            revive(g.st);
            const {esc} = api, c = g.cfg, def = gameOf(g.st.k), multi = P().isMulti(g.st.k);
            let sel = null, picks = [], hintMv = null, timer = 0, drag = null, cw = 70, ch = 98, stacked = false;
            const fix = [0, 0]; // l'écart mesuré entre la place estimée et la vraie (bordures, marges), panneau à côté / dessous
            const hist = [];
            const st = () => g.st;
            const pile = id => st().piles.find(p => p.id === id);
            const snap = () => { hist.push(JSON.stringify({st: g.st})); if (hist.length > 500) hist.shift(); };
            const fmt = ms => api.fmtTime ? api.fmtTime(ms) : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
            const inFound = () => st().piles.filter(p => p.type === 'found').reduce((a, p) => a + p.cards.length, 0);
            const total = () => P().counts(st());

            const estimate = (hostW, below) => (below ? hostW : hostW - 320) - 36; // panneau de 300 px + 20 d'écart ; bordure et marge de la table
            /* ── la place de chaque carte ── */
            function layout() {
                const piles = st().piles, maxX = Math.max(st().width || 0, ...piles.map(p => p.x + 1 + (p.fan === 'right3' ? 0.5 : 0)));
                // le panneau passe sous la table quand, à côté, les cartes seraient trop petites (beaucoup de colonnes, petit écran)
                const hostW = host.clientWidth || 900;
                stacked = hostW < 900 || (estimate(hostW, false) + fix[0]) / (maxX + 0.05) < 56;
                const avail = estimate(hostW, stacked) + fix[stacked ? 1 : 0];
                cw = Math.max(24, Math.min(96, Math.floor(avail / (maxX + 0.05)))); ch = Math.round(cw * 1.4);
                const pos = new Map(); let H = 0;
                piles.forEach(p => {
                    const x0 = p.x * cw, y0 = p.y * ch, n = p.cards.length;
                    let shown = p.cards.map((card, i) => i);
                    if (p.fan === 'stack' && n > 2) shown = [n - 2, n - 1];
                    if (p.fan === 'right3') shown = shown.slice(-3);
                    let off = 0;
                    if (p.fan === 'right') { const room = p.type === 'reserve' ? (maxX - p.x - 1) * cw : cw * 0.75 * 1.16; off = Math.min(cw * 0.26, n > 1 ? room / (n - 1) : cw); }
                    let y = y0;
                    shown.forEach((i, j) => {
                        const card = p.cards[i];
                        let x = x0, yy = y0;
                        if (p.fan === 'down') { yy = y; y += card.up ? ch * 0.27 : ch * 0.11; }
                        else if (p.fan === 'right') x = x0 + i * off;
                        else if (p.fan === 'right3') x = x0 + j * cw * 0.24;
                        pos.set(card.i, {x, y: yy, p: p.id, idx: i});
                        H = Math.max(H, yy + ch);
                    });
                    H = Math.max(H, y0 + ch);
                });
                return {pos, W: maxX * cw, H: H + 8};
            }
            const faceHtml = card => `<span class="pc-c">${RANK[card.r]}<i>${SUIT[card.s]}</i></span><span class="pc-mid">${card.r > 10 ? `<b>${RANK[card.r]}</b>` : SUIT[card.s]}</span><span class="pc-c pc-c2">${RANK[card.r]}<i>${SUIT[card.s]}</i></span>`;
            const slotLabel = p => p.type === 'found' ? (st().base === 1 ? 'A' : RANK[st().base] || '') : p.type === 'stock' ? (st().redeals > 0 && pile('waste')?.cards.length ? '↻' : '') : p.type === 'cell' ? '□' : p.type === 'tab' ? '' : '';

            function draw() {
                const {pos, W, H} = layout(), S = st(), stuck = !S.won && P().stuck(S);
                const hintFrom = hintMv && !hintMv.stock ? hintMv.from : null, hintTo = hintMv && !hintMv.stock ? hintMv.to : null;
                const selKey = sel ? `${sel.pid}:${sel.idx}` : '';
                const slots = S.piles.map(p => `<div class="pc-slot pc-${p.type}${hintTo === p.id ? ' is-hint-to' : ''}${hintMv?.stock && p.type === 'stock' ? ' is-hint-to' : ''}" data-slot="${esc(p.id)}" style="left:${p.x * cw}px;top:${p.y * ch}px"><span>${esc(slotLabel(p))}</span>${p.type === 'stock' && p.cards.length ? `<em class="pc-count">${p.cards.length}</em>` : ''}</div>`).join('');
                let z = 1;
                const cards = [];
                S.piles.forEach(p => p.cards.forEach((card, i) => {
                    const at = pos.get(card.i); if (!at) return;
                    const isSel = sel && sel.pid === p.id && i >= sel.idx && !(p.any && i !== sel.idx);
                    const isPick = multi && picks.includes(p.id) && i === p.cards.length - 1;
                    const isHint = hintFrom === p.id && i >= hintMv.idx;
                    const red = card.s < 2;
                    cards.push(`<div class="pc-card${card.up ? (red ? ' is-red' : '') : ' is-back'}${isSel || isPick ? ' is-sel' : ''}${isHint ? ' is-hint' : ''}" data-p="${esc(p.id)}" data-i="${i}" role="button" tabindex="${card.up ? 0 : -1}" aria-label="${card.up ? esc(cardName(card)) : 'Carte retournée'}" style="left:${at.x}px;top:${at.y}px;z-index:${z++}">${card.up ? faceHtml(card) : ''}</div>`);
                }));
                if (S.hand) cards.push(`<div class="pc-card pc-hand${S.hand.s < 2 ? ' is-red' : ''}" style="left:${(S.width || 6) * cw - cw}px;top:${ch * 4.2}px;z-index:900" aria-label="En main : ${esc(cardName(S.hand))}">${faceHtml(S.hand)}</div>`);
                const limited = !def.mode && Number.isFinite(P().norm(def).stock.redeals) && ['waste', 'shuffle'].includes(P().norm(def).stock.to); // les passes ne comptent que pour une pioche qui repasse
                const redeals = limited || (def.mode && Number.isFinite(S.redeals) && S.redeals > 0 && S.redeals < 50) ? ` · ${api.plural(Math.max(0, S.redeals), 'passe restante', 'passes restantes')}` : '';
                const B = bests()[S.k];
                host.innerHTML = `<div class="goose-game-layout jfp${stacked ? ' is-stacked' : ''}" data-back="${esc(c.back)}"><div class="goose-board-wrap"><div class="pc-board${S.won ? ' is-won' : ''}" style="width:${W}px;height:${Math.max(H, S.hand ? ch * 5.4 : 0)}px;--cw:${cw}px;--ch:${ch}px" role="application" aria-label="La table : ${esc(def.name)}">${slots}${cards.join('')}</div></div>
                  <aside class="goose-panel"><p class="goose-status jf-big" role="status">${S.won ? `🎉 Gagné en ${api.plural(S.moves, 'coup')} et ${fmt(g.ms)} !` : stuck ? '😕 Plus aucun coup possible' : `${inFound()} / ${total()} cartes montées`}</p>
                    <p>${api.plural(S.moves, 'coup')} · ⏱ <span data-jfp-time>${fmt(S.won ? g.ms : g.ms + Date.now() - g.startAt)}</span>${redeals}${B ? `<br><span class="muted">Record : ${fmt(B.ms)}, ${api.plural(B.moves, 'coup')}</span>` : ''}</p>
                    ${stuck ? `<div class="jfp-stuck">${api.notice('warn', 'La partie est bloquée : annule quelques coups, ou rejoue la même donne.')}</div>` : ''}
                    <div class="jfp-tools">
                      <button type="button" class="button small secondary" data-jfp-undo ${hist.length ? '' : 'disabled'} title="Ctrl+Z">↶ Annuler</button>
                      ${S.won ? '' : `<button type="button" class="button small secondary" data-jfp-hint>💡 Un coup possible</button>`}
                      ${!S.won && !multi && !def.mode ? '<button type="button" class="button small secondary" data-jfp-auto>⬆ Tout monter</button>' : ''}
                      ${!S.won && !pile('stock') && def.mode ? `<button type="button" class="button small" data-jfp-stock>${S.hand ? '🂠 Poser la carte en main' : '🂠 Retourner une carte'}</button>` : ''}
                      <button type="button" class="button small secondary" data-jfp-same title="Les mêmes cartes, depuis le début">⟲ Même donne</button>
                    </div>
                    <details class="jfp-rules"><summary>📖 Les règles de ${esc(def.name)}</summary><p class="jf-small">${esc(def.desc || '')}</p></details>
                    <p class="muted jf-small">${multi ? 'Clique les cartes qui vont ensemble ; elles s’en vont toutes seules.' : 'Glisse une carte, ou clique-la puis clique où la poser. Double-clic : sur une fondation.'} Clic sur la pioche : piocher.</p></aside></div>`;
                bind();
                // la largeur réelle de la table (colonne de droite, marges) : on redessine une fois si elle diffère
                const wrap = host.querySelector('.goose-board-wrap'); if (wrap) { const cs = getComputedStyle(wrap), w = Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) - 2, k = stacked ? 1 : 0, d = w - estimate(host.clientWidth || 900, stacked); if (w > 100 && Math.abs(d - fix[k]) > 6 && !redrawn) { fix[k] = d; redrawn = true; draw(); redrawn = false; } }
            }
            let redrawn = false;
            const after = () => {
                const S = st();
                if (!S.won && c.auto && !def.mode && !S.piles.some(p => p.cards.some(x => !x.up)) && !(pile('stock')?.cards.length) && !(pile('waste')?.cards.length)) P().autoAll(S);
                if (S.won && !g.won) {
                    g.won = true; g.finished = true; g.ms += Date.now() - g.startAt; g.startAt = Date.now(); g.status = `Gagné en ${fmt(g.ms)}`;
                    const B = bests()[S.k]; if (!B || g.ms < B.ms) saveBest(S.k, {ms: g.ms, moves: S.moves});
                    api.toast?.(`🎉 ${def.name} : gagné !`); api.sidebar();
                } else if (!S.won) g.status = `${inFound()} / ${total()} cartes montées`;
                api.save(); draw();
            };
            const act = fn => { const before = JSON.stringify({st: g.st}); const ok = fn(); if (ok) { hist.push(before); if (hist.length > 500) hist.shift(); sel = null; picks = []; hintMv = null; after(); } return ok; };
            const doStock = () => { const before = JSON.stringify({st: g.st}); const r = P().stock(st()); if (r?.ok) { hist.push(before); sel = null; picks = []; hintMv = null; after(); } else if (r?.msg) { api.toast?.(r.msg); } };
            const undo = () => { const s = hist.pop(); if (!s) return; g.st = revive(JSON.parse(s).st); sel = null; picks = []; hintMv = null; g.won = false; g.finished = false; api.save(); draw(); };
            const fail = el => { el?.classList.add('is-no'); setTimeout(() => el?.classList.remove('is-no'), 350); };

            function clickPile(pid, idx, el) {
                const p = pile(pid); if (!p || st().won) return;
                if (p.type === 'stock') return doStock();
                if (multi) {
                    if (!p.cards.length) return;
                    picks = picks.includes(pid) ? picks.filter(x => x !== pid) : [...picks, pid];
                    if (picks.length && act(() => P().trySet(st(), picks))) return;
                    if (picks.length >= 3) picks = [pid];
                    hintMv = null; return draw();
                }
                if (sel) {
                    if (sel.pid === pid && (idx == null || idx === sel.idx)) { sel = null; return draw(); }
                    if (act(() => P().move(st(), sel.pid, sel.idx, pid))) return;
                    if (idx != null && P().canPick(st(), pid, idx)) { sel = {pid, idx}; return draw(); }
                    fail(el); sel = null; return draw();
                }
                if (idx == null) return;
                // les jeux à part (Golf, Trois sommets…) : un clic joue la carte
                if (def.mode && act(() => P().tap(st(), pid, idx))) return;
                if (P().canPick(st(), pid, idx)) { sel = {pid, idx}; hintMv = null; return draw(); }
                fail(el);
            }

            function bind() {
                const board = host.querySelector('.pc-board'), sig = {signal: api.signal};
                const target = e => { const card = e.target.closest('[data-p]'), slot = e.target.closest('[data-slot]'); return card ? {pid: card.dataset.p, idx: Number(card.dataset.i), el: card} : slot ? {pid: slot.dataset.slot, idx: null, el: slot} : null; };
                board.addEventListener('pointerdown', e => {
                    if (e.button !== 0 || st().won || multi) return;
                    const t = target(e); if (!t || t.idx == null || !P().canPick(st(), t.pid, t.idx)) return;
                    const p = pile(t.pid), ids = p.any ? [t.idx] : p.cards.slice(t.idx).map((x, k) => t.idx + k);
                    const els = ids.map(i => board.querySelector(`[data-p="${CSS.escape(t.pid)}"][data-i="${i}"]`)).filter(Boolean);
                    drag = {pid: t.pid, idx: t.idx, els, x0: e.clientX, y0: e.clientY, moved: false, start: els.map(el => [parseFloat(el.style.left), parseFloat(el.style.top), el.style.zIndex])};
                }, sig);
                board.addEventListener('click', e => { if (board.dataset.justDragged) return; const t = target(e); if (t) clickPile(t.pid, t.idx, t.el); }, sig);
                board.addEventListener('dblclick', e => { const t = target(e); if (!t || t.idx == null || multi) return; sel = null; if (!act(() => P().tap(st(), t.pid, t.idx))) draw(); }, sig);
                board.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const t = target(e); if (!t) return; e.preventDefault(); clickPile(t.pid, t.idx, t.el); host.querySelector(`[data-p="${CSS.escape(t.pid)}"][data-i="${t.idx}"]`)?.focus(); }, sig);
                host.querySelector('[data-jfp-undo]')?.addEventListener('click', undo, sig);
                host.querySelector('[data-jfp-stock]')?.addEventListener('click', doStock, sig);
                host.querySelector('[data-jfp-hint]')?.addEventListener('click', () => { hintMv = P().hint(st()); sel = null; picks = []; if (!hintMv) api.toast?.('Aucun coup possible.'); draw(); }, sig);
                host.querySelector('[data-jfp-auto]')?.addEventListener('click', () => { if (!act(() => P().autoAll(st()) > 0)) api.toast?.('Aucune carte ne peut monter pour l’instant.'); }, sig);
                host.querySelector('[data-jfp-same]')?.addEventListener('click', () => { snap(); g.st = P().deal(g.st.k, g.dealSeed || g.st.seed); g.won = false; g.finished = false; g.ms = 0; g.startAt = Date.now(); sel = null; picks = []; hintMv = null; api.save(); draw(); }, sig);
            }
            // glisser : une seule fois pour toute la partie (la table est redessinée à chaque coup)
            const sig = {signal: api.signal};
            window.addEventListener('pointermove', e => {
                if (!drag) return; const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
                if (!drag.moved && Math.hypot(dx, dy) < 6) return;
                drag.moved = true; drag.els.forEach((el, k) => { el.style.left = `${drag.start[k][0] + dx}px`; el.style.top = `${drag.start[k][1] + dy}px`; el.style.zIndex = String(2000 + k); el.classList.add('is-drag'); });
            }, sig);
            window.addEventListener('pointerup', e => {
                if (!drag) return; const d = drag; drag = null; if (!d.moved) return;
                d.els.forEach(el => { el.style.pointerEvents = 'none'; });
                const under = document.elementFromPoint(e.clientX, e.clientY);
                d.els.forEach(el => { el.style.pointerEvents = ''; });
                const board = host.querySelector('.pc-board'); if (!board) return; const card = under?.closest?.('.pc-board [data-p]'), slot = under?.closest?.('.pc-board [data-slot]'), to = card?.dataset.p || slot?.dataset.slot;
                board.dataset.justDragged = '1'; setTimeout(() => { delete board.dataset.justDragged; }, 0);
                if (to && to !== d.pid && act(() => P().move(st(), d.pid, d.idx, to))) return;
                d.els.forEach((el, k) => { el.style.left = `${d.start[k][0]}px`; el.style.top = `${d.start[k][1]}px`; el.style.zIndex = d.start[k][2]; el.classList.remove('is-drag'); });
            }, sig);
            document.addEventListener('keydown', e => { if (!host.isConnected) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea, [contenteditable]')) { e.preventDefault(); undo(); } if (e.key === 'Escape' && (sel || picks.length)) { sel = null; picks = []; draw(); } }, {signal: api.signal});
            let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (host.isConnected && !drag) draw(); }, 150); }, {signal: api.signal});
            api.sub(`${def.name} · ${stars(def.diff)}`);
            g.startAt = Date.now(); timer = setInterval(() => { const t = host.querySelector('[data-jfp-time]'); if (!host.isConnected) return clearInterval(timer); if (t && !g.won) t.textContent = fmt(g.ms + Date.now() - g.startAt); }, 1000);
            api.onCleanup(() => { clearInterval(timer); if (!g.won) { g.ms += Date.now() - g.startAt; g.startAt = Date.now(); api.save(); } });
            draw();
        },
    });
})();
