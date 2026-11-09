/* LCNDA — 🂡 Jeux de cartes à plusieurs (Jeux de la famille, app-jeu-famille.js) : la table.
 * Les règles sont dans app-jeu-cartes-regles.js (LCNDA_CARTES, sans écran, testées dans Node) ; ici : la table, les mains, la souris et le clavier.
 * Même cadre que les autres jeux (préparation, parties en cours dans la colonne de gauche, ↻ Rejouer), mêmes cartes que les patiences
 * (jeux-patience.css : .pc-card) ; les figures peuvent porter les portraits des ancêtres (jamais un vivant ni une fiche confidentielle).
 * ↶ Annuler (Ctrl+Z / ⌘Z), 💡 Un conseil, chrono, victoires par jeu gardées dans ce navigateur.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, C = () => window.LCNDA_CARTES;
    if (!J() || !C()) return;
    const SUIT = ['♥', '♦', '♠', '♣'], RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'], TRANK = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'C', 'D', 'R'];
    const Pl = () => window.LCNDA_JEUX_PLATEAU; // la barre de partie commune (L2), les records, le choix « Qui joue » : app-jeu-plateau.js
    const SPEEDS = [['lent', 'Lent'], ['normal', 'Normal'], ['rapide', 'Rapide']], DELAY = {lent: 1000, normal: 560, rapide: 180};
    const BACKS = [['bleu', 'Bleu'], ['rouge', 'Rouge'], ['vert', 'Vert'], ['sepia', 'Sépia']];
    const HINTS = [[0, 'Aucun'], [3, '3'], [5, '5'], [10, '10']];
    const escH = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
    const gameOf = k => C().get(k) || C().get('belote');
    /** les places autour de la table : toi en bas (Sud), puis Ouest, Nord, Est */
    const SEATS = {2: ['Toi', 'Nord'], 3: ['Toi', 'Ouest', 'Est'], 4: ['Toi', 'Ouest', 'Nord', 'Est']};
    const isDefaultName = n => /^(Joueur \d+|Toi|Ouest|Nord|Est)$/.test(String(n || ''));
    const cleanAi = v => (Pl()?.cleanAi ? Pl().cleanAi(v) : (['facile', 'moyen', 'difficile'].includes(v) ? v : ''));
    /** autant de joueurs que le jeu en demande (Belote, Tarot, Dame de pique : 4 ; Rami, Crapette : 2…) ; les noms par défaut suivent les places */
    function fitPlayers(c) {
        const allowed = gameOf(c.game).players, n = allowed.includes(c.players.length) ? c.players.length : c.players.length > allowed[allowed.length - 1] ? allowed[allowed.length - 1] : gameOf(c.game).def;
        const COL = ['#d93636', '#2878c8', '#198754', '#f2c230'];
        while (c.players.length < n) { const i = c.players.length; c.players.push({name: `Joueur ${i + 1}`, color: COL.find(x => !c.players.some(p => p.color === x)) || COL[i % 4], ai: 'moyen'}); }
        c.players = c.players.slice(0, n);
        c.players.forEach((p, i) => { if (isDefaultName(p.name)) p.name = SEATS[n][i]; });
        return c;
    }
    const rulesHtml = (esc, k) => { const g = gameOf(k); return `<ol class="cx-rules-list">${g.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol>`; };
    const descHtml = (esc, k) => { const g = gameOf(k); return `<b>${g.icon} ${esc(g.name)}</b> · ${esc(g.players.length > 1 ? `${g.players[0]} à ${g.players[g.players.length - 1]} joueurs` : `${g.players[0]} joueurs`)}<br>${esc(g.desc)}
        <details class="cx-rules"><summary><span class="cx-q" aria-hidden="true">?</span> Les règles du jeu</summary>${rulesHtml(esc, k)}</details>`; };

    /* ═════ Les figures : les portraits des ancêtres ═════ */
    /** Rois et Cavaliers : des hommes des plus anciennes générations ; Dames : des femmes ; Valets : des hommes plus jeunes */
    function pickFaces(people, seed, tarot) {
        const L = window.LCNDA_JEUX_LOGIQUE, R = L.rng(seed + ':figures');
        const snap = p => ({id: p.id, first: p.first, last: p.last, name: p.name, g: p.g, photo: p.photo, by: p.by, dy: p.dy, sosa: p.sosa});
        const old = (a, b) => (b.gen - a.gen) || ((a.by || 9999) - (b.by || 9999)) || (b.photo ? 1 : 0) - (a.photo ? 1 : 0);
        const men = L.shuffle(people.filter(p => p.g === 'm'), R).sort(old), women = L.shuffle(people.filter(p => p.g === 'f'), R).sort(old);
        const take = (list, n) => list.splice(0, n).map(snap);
        const kings = take(men, 4), queens = take(women, 4), knights = tarot ? take(men, 4) : [], jacks = men.slice(-4).reverse().map(snap);
        const out = {};
        const put = (rank, list) => list.forEach((p, s) => { out[`${rank}-${s}`] = p; });
        if (tarot) { put(14, kings); put(13, queens); put(12, knights); put(11, jacks); } else { put(13, kings); put(12, queens); put(11, jacks); }
        return Object.keys(out).length ? out : null;
    }
    const faceCount = (people) => Math.min(4, people.filter(p => p.g === 'm').length) * 2 + Math.min(4, people.filter(p => p.g === 'f').length);

    J().register({
        key: 'cartes', short: 'Jeu de cartes', icon: '🂡', label: '🂡 Jeux de cartes à plusieurs', title: 'Jeux de cartes à plusieurs', eyebrow: 'JEUX DE CARTES',
        desc: 'Bataille, Huit américain, Dame de pique, Président, Belote, Tarot à 4, Rami et Crapette, contre l’ordinateur 🤖 ; les Rois, Dames et Valets peuvent porter les portraits de tes ancêtres.',
        rulesHint: 'Une seule personne à la table, les autres joueurs sont l’ordinateur. Clique une carte de ta main pour la jouer (← → et Entrée au clavier).',
        namePh: 'Ex : La belote du dimanche', fieldsTitle: 'Le jeu',
        unit: 'figure possible', unitP: 'figures possibles', minPeople: 1,
        scope: true, players: {min: 2, max: 4, def: 4},
        playerExtra: i => ({ai: i ? 'moyen' : '', name: SEATS[4][i] || `Joueur ${i + 1}`}),
        playerFields: p => (Pl()?.levelSelect ? Pl().levelSelect(p) : ''),
        defaults: () => ({game: 'belote', portraits: true, names: false, back: 'bleu', speed: 'normal', hints: 5, scope: {kind: 'sosa', gen: 3}}),
        clean(c) {
            c.game = C().get(c.game) ? c.game : 'belote'; c.players.forEach(p => { p.ai = cleanAi(p.ai); }); fitPlayers(c);
            return {...c, portraits: c.portraits !== false, names: !!c.names, back: BACKS.some(b => b[0] === c.back) ? c.back : 'bleu', speed: SPEEDS.some(x => x[0] === c.speed) ? c.speed : 'normal', hints: HINTS.some(h => h[0] === Number(c.hints)) ? Number(c.hints) : 5};
        },
        ready: [{k: 'bel', name: 'Belote', hint: 'toi et Nord contre Ouest et Est', cfg: {game: 'belote'}}, {k: 'tar', name: 'Tarot à 4', hint: 'prise, garde, chien et excuse', cfg: {game: 'tarot'}},
            {k: 'dam', name: 'Dame de pique', hint: 'ne ramasse pas les cœurs', cfg: {game: 'dame'}}, {k: 'hui', name: 'Huit américain', hint: 'pour commencer', cfg: {game: 'huit'}},
            {k: 'pre', name: 'Président', hint: 'à quatre, 5 manches', cfg: {game: 'president'}}, {k: 'ram', name: 'Rami (gin)', hint: 'à deux, premier à 100', cfg: {game: 'rami'}},
            {k: 'cra', name: 'Crapette', hint: 'à deux, chacun son jeu', cfg: {game: 'crapette'}}, {k: 'bat', name: 'Bataille', hint: 'pour les petits', cfg: {game: 'bataille'}}],
        usable: people => faceCount(people),
        fieldsHtml: (c, h) => `<label class="jfp-pick">Le jeu<select data-cx-game>${C().GAMES.map(g => `<option value="${h.esc(g.k)}"${g.k === c.game ? ' selected' : ''}>${g.icon} ${h.esc(g.name)}</option>`).join('')}</select></label>
            <div class="jfp-desc" data-cx-desc>${descHtml(h.esc, c.game)}</div>
            <div class="jf-row"><span class="jf-lab">Vitesse de l’ordinateur</span>${h.seg('speed', SPEEDS, c.speed)}</div>
            <div class="jf-row"><span class="jf-lab">Conseils 💡 par manche</span>${h.seg('hints', HINTS, c.hints)}</div>
            <div class="jf-checks">${h.toggle('data-cx-portraits', c.portraits, '🖼 Les Rois, Dames et Valets avec les portraits de mes ancêtres')}${h.toggle('data-cx-names', c.names, '🤖 L’ordinateur porte des noms d’ancêtres')}</div>
            <div class="jfp-backs"><span>Dos des cartes</span>${h.seg('back', BACKS, c.back)}</div>`,
        bindPlayers(box, c) {
            // le nombre de joueurs suit le jeu choisi
            const allowed = gameOf(c.game).players, add = box.parentElement?.querySelector('[data-jf-padd]');
            if (add) { add.disabled = c.players.length >= allowed[allowed.length - 1]; add.hidden = allowed.length === 1; }
            box.querySelectorAll('[data-jf-pdel]').forEach(b => { b.hidden = c.players.length <= allowed[0]; });
            const note = box.parentElement?.querySelector('[data-cx-pnote]') || Object.assign(document.createElement('p'), {className: 'muted jf-small'});
            note.dataset.cxPnote = ''; note.textContent = `${gameOf(c.game).name} : ${allowed.length > 1 ? `de ${allowed[0]} à ${allowed[allowed.length - 1]} joueurs` : `${allowed[0]} joueurs`}. Une seule personne à la table (les cartes de chacun sont cachées) : les autres sont l’ordinateur.`;
            if (!note.isConnected) box.after(note);
        },
        onChange(t, c, form) {
            if (t.name === 'pai') { c.players[Number(t.closest('[data-i]').dataset.i)].ai = cleanAi(t.value); return; }
            if (t.matches('[data-cx-portraits]')) c.portraits = t.checked;
            if (t.matches('[data-cx-names]')) c.names = t.checked;
            if (t.matches('[data-cx-game]')) {
                c.game = C().get(t.value) ? t.value : 'belote'; fitPlayers(c);
                const d = form.querySelector('[data-cx-desc]'); if (d) d.innerHTML = descHtml(escH, c.game);
                return 'players';
            }
        },
        onSeg(name, v, c) { if (name === 'speed') c.speed = v; if (name === 'back') c.back = v; if (name === 'hints') c.hints = Number(v); },
        async start(c, src, prev) {
            fitPlayers(c);
            const humans = c.players.map((p, i) => (p.ai ? -1 : i)).filter(i => i >= 0);
            if (humans.length !== 1) return {error: humans.length ? 'Une seule personne à la table : les cartes de chacun sont cachées. Mets les autres joueurs sur « Ordinateur ».' : 'Il faut une personne à la table (sinon l’ordinateur joue tout seul).'};
            // la personne s'assoit en bas (Sud), les autres dans l'ordre autour de la table
            const order = [humans[0], ...c.players.map((p, i) => i).filter(i => i !== humans[0])];
            let names = order.map(i => c.players[i].name || SEATS[c.players.length][i]);
            if (c.names && Pl()?.ancestors) { const list = await Pl().ancestors(c.seed, order.length); names = names.map((n, k) => (k && list[k - 1] ? list[k - 1].name : n)); }
            const seed = `${c.seed}${prev ? 'r' + ((prev.round || 1) + 1) : ''}`;
            const st = C().create(c.game, {n: order.length, levels: order.map(i => c.players[i].ai || 'moyen'), seed, names});
            const faces = c.portraits ? pickFaces(src?.people || [], seed, c.game === 'tarot') : null;
            return {st, faces, colors: order.map(i => c.players[i].color), ms: 0, round: (prev?.round || 0) + 1, hintsLeft: c.hints, finished: false, recorded: false, status: gameOf(c.game).name};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, def = gameOf(g.st.k), K = def.k, CC = C(), PL = Pl();
            const st = () => g.st, me = 0;
            let sel = [], pick = null, hintA = null, pause = null, botT = 0, autoT = 0, cw = 64, suitFor = null, msg = '', lastMsg = '';
            const hist = [];
            const delay = () => (PL?.calm?.() ? 120 : DELAY[c.speed] || 560);
            const name = p => st().names[p] || `Joueur ${p + 1}`;
            const label = p => (p === me ? esc(name(p)) : `🤖 ${esc(name(p))}`);
            const seatOf = p => { const n = st().n; if (p === 0) return 's'; if (n === 2) return 'n'; if (n === 3) return p === 1 ? 'w' : 'e'; return ['s', 'w', 'n', 'e'][p]; };
            const fmt = ms => (PL?.fmt ? PL.fmt(ms) : api.fmtTime ? api.fmtTime(ms) : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`);
            const badge = (t, kind) => (api.UI?.badge ? api.UI.badge(t, kind) : `<b>${esc(t)}</b>`);
            const isTeam = K === 'belote';
            const over = () => !!st().over;
            if (g.hintsLeft == null) g.hintsLeft = c.hints ?? 5;

            /* ── la barre commune des jeux (L2) : qui joue · scores · chrono · ↶ · 💡 · ⏸ · ? · ⋯ ── */
            const sh = PL?.shell ? PL.shell(host, g, api, {
                game: 'cartes', title: def.name, rulesHtml: () => rulesHtml(esc, K),
                canUndo: () => hist.length > 0, hints: () => (c.hints ? g.hintsLeft : null),
                onUndo: undo, onHint: giveHint,
                onPause: on => { clearTimeout(botT); clearTimeout(autoT); api.save(); on ? draw() : pump(); },
                keys: e => {
                    if (e.key === 'Escape' && (sel.length || pick != null || suitFor != null || hintA)) { sel = []; pick = null; suitFor = null; hintA = null; msg = ''; draw(); return true; }
                    if (e.key === 'Enter' && !e.target.closest?.('button, a')) { if (st().phase === 'end') { act('next'); return true; } if (K === 'bataille' && myTurn()) { act('flip'); return true; } }
                    return false;
                },
                menu: () => [K === 'bataille' && !over() ? {icon: '⏩', label: 'Jouer jusqu’à la fin', run: () => autoBattle()} : null,
                    st().lastTrick ? {icon: '👁', label: 'Revoir le dernier pli', run: () => { pause = {trick: st().lastTrick, look: true}; draw(); clearTimeout(botT); botT = setTimeout(() => { pause = null; pump(); }, 2600); }} : null,
                    over() ? null : {icon: '🏳', label: 'Abandonner la partie', danger: true, run: resign}].filter(Boolean),
            }) : null;
            const paused = () => !!sh?.paused;

            /* ── une carte (le dessin des patiences ; les figures avec un portrait) ── */
            const face = card => {
                if (K === 'tarot' && card.s === 5) return '<span class="pc-mid cx-excuse"><b>★</b><small>Excuse</small></span>';
                if (K === 'tarot' && card.s === 4) return `<span class="pc-c">${card.r}<i>✦</i></span><span class="pc-mid cx-atout"><b>${card.r}</b></span><span class="pc-c pc-c2">${card.r}<i>✦</i></span>`;
                const rk = K === 'tarot' ? TRANK[card.r] : RANK[card.r], fig = card.r >= 11, p = fig && g.faces ? g.faces[`${card.r}-${card.s}`] : null;
                const mid = p ? `<span class="cx-por">${api.avatar ? api.avatar(p, 48) : ''}<small>${esc(p.first || p.name || '')}</small></span>` : fig ? `<b>${rk}</b>` : SUIT[card.s];
                return `<span class="pc-c">${rk}<i>${SUIT[card.s]}</i></span><span class="pc-mid">${mid}</span><span class="pc-c pc-c2">${rk}<i>${SUIT[card.s]}</i></span>`;
            };
            const cname = card => { const p = g.faces && card.s < 4 && card.r >= 11 ? g.faces[`${card.r}-${card.s}`] : null; return CC.cardName(card, K) + (p ? ` (${p.name})` : ''); };
            const cardBtn = (card, extra = '') => `<button type="button" class="pc-card cx-card${card.s < 2 ? ' is-red' : ''}${extra}" data-c="${card.i}" aria-label="${esc(cname(card))}">${face(card)}</button>`;
            const cardView = (card, extra = '') => `<span class="pc-card cx-card${card.s < 2 ? ' is-red' : ''}${extra}" role="img" aria-label="${esc(cname(card))}">${face(card)}</span>`;
            const back = (extra = '', lbl = 'Carte retournée') => `<span class="pc-card cx-card is-back${extra}" role="img" aria-label="${esc(lbl)}"></span>`;

            /* ── ce que la personne peut faire ── */
            const myTurn = () => !over() && st().phase !== 'end' && st().turn === me && !pause && !paused();
            const legal = () => (myTurn() ? CC.legal(st()) : []);
            const playableIds = () => new Set(legal().filter(a => a.t === 'play' && a.c != null).map(a => a.c));
            const multiPhase = () => (K === 'dame' && st().phase === 'pass') ? 3 : (K === 'tarot' && st().phase === 'ecart') ? 6 : K === 'president' ? 4 : 0;
            const sortHand = h => {
                if (K === 'tarot' || K === 'president' || K === 'belote') return h.slice();
                const v = x => (K === 'huit' || K === 'dame' ? (x.r === 1 ? 14 : x.r) : x.r), order = [2, 0, 3, 1];
                return h.slice().sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s) || v(a) - v(b));
            };

            /* ── la table ── */
            function seatHtml(p) {
                const S = st(), n = S.hands[p]?.length ?? 0, on = !S.over && S.phase !== 'end' && S.turn === p;
                let extra = '';
                if (K === 'belote' && S.taker === p) extra += badge(`Preneur ${SUIT[S.trump]}`, 'blue');
                if (K === 'tarot' && S.taker === p && S.bid) extra += badge(CC.helpers.CONTRACTS[S.bid], 'blue');
                if ((K === 'belote' || K === 'tarot') && S.dealer === p) extra += badge('Donneur', 'grey');
                if (K === 'president' && S.ranks && S.ranks.indexOf(p) >= 0) extra += badge(CC.helpers.TITLES[S.n][S.ranks.indexOf(p)], S.ranks.indexOf(p) === 0 ? 'green' : 'grey');
                const count = K === 'crapette' ? '' : `<small>${api.plural(n, 'carte')}</small>`;
                const fan = p === me || K === 'crapette' ? '' : `<span class="cx-mini" aria-hidden="true">${Array.from({length: Math.min(4, n)}, () => '<i></i>').join('')}</span>`;
                return `<div class="cx-seat cx-${seatOf(p)}${on ? ' is-turn' : ''}" data-seat="${p}"><span class="cx-name"><i class="cx-dot" style="--pc:${esc(g.colors?.[p] || '#000')}" aria-hidden="true"></i>${label(p)}</span>${count}${fan}<span class="cx-tags">${extra}</span></div>`;
            }
            const trickHtml = (cards, winner) => `<div class="cx-trick">${cards.map(x => `<span class="cx-tp cx-tp-${seatOf(x.p)}${winner === x.p ? ' is-win' : ''}">${cardView(x.c)}</span>`).join('')}</div>`;
            function centerHtml() {
                const S = st();
                if (pause && pause.trick) return trickHtml(pause.trick.cards, pause.trick.winner) + `<p class="cx-say">${esc(name(pause.trick.winner))} ramasse${pause.trick.pts ? ` (${api.plural(pause.trick.pts, 'point')})` : ''}${pause.look ? ' — le dernier pli' : ''}</p>`;
                if (K === 'bataille') {
                    const L = S.last; if (!L) return '<p class="cx-say">Retourne ta première carte !</p>';
                    const by = {}; L.shown.forEach(x => { (by[x.p] = by[x.p] || []).push(x); });
                    return `<div class="cx-bat">${Object.entries(by).map(([p, l]) => `<div class="cx-bat-col${Number(p) === L.winner ? ' is-win' : ''}"><small>${label(Number(p))}</small><span class="cx-bat-cards">${l.map(x => (x.hidden ? back('', 'Carte cachée de la bataille') : cardView(x.c))).join('')}</span></div>`).join('')}</div><p class="cx-say">${L.battles ? '⚔️ Bataille ! ' : ''}${esc(name(L.winner))} ramasse ${L.n} cartes.</p>`;
                }
                if (K === 'huit') {
                    const t = S.pile[S.pile.length - 1];
                    return `<div class="cx-piles"><button type="button" class="cx-stock" data-cx-act="draw" ${legal().some(a => a.t === 'draw') ? '' : 'disabled'} aria-label="Piocher (${S.stock.length} cartes)">${back()}<em class="pc-count">${S.stock.length}</em></button>${cardView(t)}<span class="cx-suit${S.suit < 2 ? ' is-red' : ''}" title="Couleur demandée" aria-label="Couleur demandée : ${CC.SUIT_NAME[S.suit]}">${SUIT[S.suit]}</span></div>
                        <p class="cx-say">${S.pending ? `⚠️ ${esc(name(S.turn))} doit piocher ${S.pending} cartes (ou poser un 2).` : `On joue du ${CC.SUIT_NAME[S.suit]} ${SUIT[S.suit]} ou un ${CC.RANK_NAME[t.r]}.`}${S.dir < 0 && S.n > 2 ? ' · sens inverse ↺' : ''}</p>`;
                }
                if (K === 'president') {
                    if (!S.cur) return `<p class="cx-say">${S.turn === me ? 'À toi de commencer : pose une ou plusieurs cartes de même valeur.' : `${esc(name(S.turn))} commence.`}</p>`;
                    return `<div class="cx-piles">${S.cur.cards.map(x => cardView(x)).join('')}</div><p class="cx-say">${esc(name(S.cur.by))} a posé ${S.cur.count > 1 ? `${S.cur.count} cartes` : 'une carte'}${S.passed.length ? ` · ${S.passed.map(q => esc(name(q))).join(', ')} ${S.passed.length > 1 ? 'passent' : 'passe'}` : ''}.</p>`;
                }
                if (K === 'belote' && (S.phase === 'bid1' || S.phase === 'bid2')) return `<div class="cx-piles">${cardView(S.turned)}</div><p class="cx-say">${S.phase === 'bid1' ? `Qui prend à ${SUIT[S.turned.s]} ${CC.SUIT_NAME[S.turned.s]} ?` : 'Second tour : on peut choisir une autre couleur.'}</p>`;
                if (K === 'tarot' && S.phase === 'bid') return `<div class="cx-piles cx-chien">${Array.from({length: 6}, () => back('', 'Le chien')).join('')}</div><p class="cx-say">Le chien (6 cartes). ${S.bid ? `Contrat demandé : ${esc(CC.helpers.CONTRACTS[S.bid])} (${esc(name(S.taker))}).` : 'Personne n’a encore pris.'}</p>`;
                if (K === 'tarot' && S.phase === 'ecart') return `<p class="cx-say">${S.turn === me ? `Le chien est dans ta main (cartes marquées en jaune). Choisis 6 cartes à mettre à l’écart : ${sel.length} / 6.` : `${esc(name(S.taker))} fait son écart…`}</p>`;
                if (K === 'dame' && S.phase === 'pass') { const d = ({1: 'à ton voisin de gauche (Ouest)', 3: 'à ton voisin de droite (Est)', 2: 'au joueur d’en face (Nord)'})[[1, 3, 2, 0][(S.manche - 1) % 4]]; return `<p class="cx-say">Choisis 3 cartes à donner ${d} : ${sel.length} / 3.</p>`; }
                if ((S.phase === 'end' || S.over) && S.lastTrick) return trickHtml(S.lastTrick.cards, S.lastTrick.winner) + `<p class="cx-say">Le dernier pli, pour ${esc(name(S.lastTrick.winner))}.</p>`;
                if (S.trick) return trickHtml(S.trick, -1) + (S.trick.length ? '' : `<p class="cx-say">${S.turn === me ? 'À toi d’entamer.' : `${esc(name(S.turn))} entame.`}</p>`);
                return '';
            }
            function handHtml() {
                if (K === 'bataille') { const n = st().hands[me].length; return `<button type="button" class="cx-stock" data-cx-act="flip" ${myTurn() ? '' : 'disabled'} aria-label="Ton tas : ${api.plural(n, 'carte')}. Retourner la carte du dessus">${n ? back() : '<span class="pc-slot cx-slot"></span>'}<em class="pc-count">${n}</em></button>`; }
                const S = st(), h = sortHand(S.hands[me] || []), ok = playableIds(), mp = multiPhase(), mine = myTurn();
                const chien = K === 'tarot' && S.phase === 'ecart' ? new Set(S.chien.map(x => x.i)) : null, got = K === 'dame' && S.tricks === 0 ? new Set(S.received || []) : null;
                return h.map(card => {
                    let cls = '';
                    if (sel.includes(card.i) || pick === card.i) cls += ' is-sel';
                    if (hintA && (hintA.c === card.i || (hintA.cards || []).includes(card.i))) cls += ' is-hint';
                    if (mine && !mp && K !== 'rami' && ok.size && !ok.has(card.i)) cls += ' is-off';
                    if (chien?.has(card.i)) cls += ' is-chien';
                    if (got?.has(card.i)) cls += ' is-new';
                    return cardBtn(card, cls);
                }).join('');
            }
            function actionsHtml() {
                const S = st(), L = legal(), b = (a, text, extra = '', cls = 'secondary') => `<button type="button" class="button small ${cls}" data-cx-act="${a}" ${extra}>${text}</button>`;
                if (S.over) return '';
                if (S.phase === 'end') return b('next', `▶ ${K === 'tarot' ? 'Donne' : 'Manche'} suivante`, 'data-shortcut="Entrée"', '');
                if (!myTurn()) return '';
                if (K === 'bataille') return b('flip', 'Retourner ma carte', 'data-shortcut="Entrée"', '') + b('auto', '⏩ Jusqu’à la fin');
                if (suitFor != null) return `<p class="jf-small"><b>Quelle couleur demandes-tu ?</b></p><div class="cx-suits">${[0, 1, 2, 3].map(s => `<button type="button" class="button small secondary cx-suitb${s < 2 ? ' is-red' : ''}" data-cx-suit="${s}">${SUIT[s]} ${CC.SUIT_NAME[s]}</button>`).join('')}</div>${b('cancel', 'Annuler')}`;
                if (K === 'huit') return (L.some(a => a.t === 'draw') ? b('draw', S.pending ? `Piocher ${S.pending} cartes` : 'Piocher') : '') + (L.some(a => a.t === 'pass') ? b('pass', 'Passer') : '');
                if (K === 'dame' && S.phase === 'pass') return b('give', 'Donner ces 3 cartes', sel.length === 3 ? '' : 'disabled', '');
                if (K === 'president') return b('play', sel.length ? `Poser ${api.plural(sel.length, 'carte')}` : 'Poser', sel.length ? '' : 'disabled', '') + (L.some(a => a.t === 'pass') ? b('pass', 'Passer') : '');
                if (K === 'belote' && S.phase === 'bid1') return b('take-' + S.turned.s, `Je prends à ${SUIT[S.turned.s]}`, '', '') + b('pass', 'Je passe');
                if (K === 'belote' && S.phase === 'bid2') return L.filter(a => a.t === 'take').map(a => b('take-' + a.s, `${SUIT[a.s]} ${CC.SUIT_NAME[a.s]}`)).join('') + b('pass', 'Je passe');
                if (K === 'tarot' && S.phase === 'bid') return L.map(a => (a.t === 'pass' ? b('pass', 'Je passe') : b('bid-' + a.v, esc(CC.helpers.CONTRACTS[a.v]), '', a.v === 1 ? '' : 'secondary'))).join('');
                if (K === 'tarot' && S.phase === 'ecart') return b('ecart', 'Mettre à l’écart', sel.length === 6 ? '' : 'disabled', '');
                if (K === 'rami') {
                    if (S.phase === 'draw') return b('draw-stock', 'Prendre dans la pioche', '', '') + b('draw-discard', 'Prendre la défausse', S.discard.length ? '' : 'disabled');
                    const can = L.some(a => a.t === 'knock' && a.c === pick);
                    return b('discard', 'Jeter cette carte', pick != null ? '' : 'disabled', '') + b('knock', '✊ Frapper avec cette carte', can ? '' : 'disabled');
                }
                if (K === 'crapette') return (L.some(a => a.t === 'flip') ? b('flip', 'Retourner une carte du talon', '', '') : '') + (L.some(a => a.t === 'end') ? b('end', 'Poser sur ma défausse (fin du tour)') : '') + (L.some(a => a.t === 'pass') ? b('pass', 'Finir mon tour') : '');
                return '';
            }
            function scoreHtml() {
                const S = st();
                if (isTeam) { const T = S.teamTotal || [0, 0]; return `<table class="cx-score"><tr><th>${esc(name(0))} + ${esc(name(2))}</th><td>${T[0]}</td></tr><tr><th>🤖 ${esc(name(1))} + ${esc(name(3))}</th><td>${T[1]}</td></tr></table><p class="muted jf-small">Manche ${S.manche}. Partie en ${CC.get('belote').E.target} points.</p>`; }
                if (K === 'bataille') return `<p class="jf-small">${api.plural(S.plis, 'pli')} joués.</p>`;
                if (K === 'crapette') return `<p class="jf-small">Cartes encore à poser : ${[0, 1].map(p => `${label(p)} ${CC.get('crapette').E.left(S, p)}`).join(' · ')}</p>`;
                const E = CC.get(K).E, goal = E.target ? `Partie en ${E.target} points${K === 'huit' || K === 'dame' ? ' (le moins de points gagne)' : ''}.` : E.manches ? `Partie en ${E.manches} ${K === 'tarot' ? 'donnes' : 'manches'}.` : '';
                return `<table class="cx-score">${S.total.map((v, p) => `<tr><th>${label(p)}</th><td>${v}</td>${S.lastScore ? `<td class="muted">${S.lastScore[p] > 0 ? '+' : ''}${S.lastScore[p]}</td>` : ''}</tr>`).join('')}</table><p class="muted jf-small">${K === 'tarot' ? 'Donne' : 'Manche'} ${S.manche}. ${goal}</p>`;
            }
            const iWon = () => (isTeam ? st().winTeam === 0 : st().winner === me);
            function statusText() {
                const S = st();
                if (paused()) return '⏸ En pause';
                if (S.over) return iWon() ? '🏆 Tu gagnes la partie !' : isTeam ? `L’équipe ${esc(name(1))} et ${esc(name(3))} gagne la partie.` : `${esc(name(S.winner))} gagne la partie.`;
                if (S.phase === 'end') return `Fin de la ${K === 'tarot' ? 'donne' : 'manche'}`;
                if (msg) return esc(msg);
                return myTurn() ? (K === 'bataille' ? 'Retourne ta carte' : 'À toi de jouer') : pause?.trick ? `${esc(name(pause.trick.winner))} ramasse le pli` : `🤖 ${esc(name(S.turn))} réfléchit…`;
            }
            /** les joueurs dans la barre : nom, ordinateur, score, à qui le tour */
            function barPlayers() {
                const S = st(), score = p => (isTeam ? (S.teamTotal || [0, 0])[p % 2] : K === 'bataille' ? S.hands[p].length : K === 'crapette' ? CC.get('crapette').E.left(S, p) : S.total[p]);
                return Array.from({length: S.n}, (_, p) => ({name: name(p), color: g.colors?.[p] || '#000', ai: p === me ? '' : S.levels?.[p] || S.level, score: score(p), on: !S.over && S.phase !== 'end' && S.turn === p, out: K === 'president' && S.phase === 'play' && !S.hands[p].length}));
            }
            function render() {
                const S = st(), W = host.clientWidth || 900, wide = W >= 900, tableW = wide ? W - 340 : W - 16;
                const handN = Math.max(1, (S.hands[me] || []).length);
                cw = Math.max(34, Math.min(78, Math.floor(K === 'crapette' ? (tableW - 30) / 9.6 : Math.min(tableW / 7.5, 80))));
                const ov = Math.min(6, Math.floor((tableW - 20 - handN * cw) / Math.max(1, handN - 1)));
                const crap = K === 'crapette', hide = paused() ? ' jp-hide' : '';
                host.innerHTML = `${sh ? sh.bar(barPlayers()) : ''}<div class="goose-game-layout jfp cx cx-${esc(K)}${wide ? '' : ' is-stacked'}" data-back="${esc(c.back)}" style="--cw:${cw}px;--ch:${Math.round(cw * 1.4)}px;--ov:${ov}px">
                    <div class="goose-board-wrap jp-wrap">${sh ? sh.pauseHtml() : ''}<div class="cx-board${hide}" role="application" aria-label="La table : ${esc(def.name)}">
                      ${crap ? crapetteHtml() : `<div class="cx-table cx-n${S.n}">${Array.from({length: S.n}, (_, p) => p).filter(p => p !== me).map(seatHtml).join('')}<div class="cx-center" aria-live="polite">${centerHtml()}</div></div>
                      <div class="cx-me">${seatHtml(me)}<div class="cx-hand" role="group" aria-label="${K === 'bataille' ? 'Ton tas' : 'Ta main'}">${handHtml()}</div>${K === 'rami' ? ramiInfo() : ''}${wide ? '' : `<div class="jfp-tools cx-acts">${actionsHtml()}</div>`}</div>`}${crap && !wide ? `<div class="jfp-tools cx-acts">${actionsHtml()}</div>` : ''}
                    </div></div>
                    <aside class="goose-panel jp-panel"><p class="goose-status jf-big" role="status">${statusText()}</p>
                      ${lastMsg && S.over ? `<p class="jp-newrec">${esc(lastMsg)}</p>` : ''}
                      ${wide ? `<div class="jfp-tools cx-acts">${actionsHtml()}</div>` : ''}
                      ${S.phase === 'end' || S.over ? endHtml() : ''}
                      <div class="cx-scorebox">${scoreHtml()}</div>
                      ${S.over ? '<p class="muted jf-small">« ↻ Rejouer » en haut : une revanche avec les mêmes réglages.</p>' : ''}
                      ${PL?.records ? PL.records.html('cartes', K, def.name) : ''}
                      <details class="cx-log"><summary>📜 Ce qui s’est passé</summary><ol>${S.log.slice(-8).map(l => `<li>${esc(l)}</li>`).join('')}</ol></details>
                      <p class="muted jf-small">Clic ou toucher : une carte de ta main. Clavier : ← → puis Entrée. ⌘Z annule, H un conseil, Échap pause.</p>
                    </aside></div>`;
                sh?.bind(); bind();
            }
            function endHtml() {
                const S = st(); let out = '';
                if (K === 'rami' && S.result && !S.result.nul) {
                    const show = (p, M) => `<div class="cx-melds"><small>${label(p)}</small>${M.melds.map(m => `<span class="cx-meld">${m.map(x => cardView(x)).join('')}</span>`).join('')}${M.dead.length ? `<span class="cx-meld is-dead" title="Cartes seules">${M.dead.map(x => cardView(x)).join('')}</span>` : ''}</div>`;
                    out += show(S.result.knocker, S.result.K) + show(1 - S.result.knocker, S.result.D);
                }
                if (K === 'belote' && S.detail) out += `<p class="jf-small">Plis : ${S.detail.card[0]} / ${S.detail.card[1]}${S.detail.ann[0] + S.detail.ann[1] ? ` · annonces ${S.detail.ann[0]} / ${S.detail.ann[1]}` : ''}${S.detail.bel[0] + S.detail.bel[1] ? ` · belote ${S.detail.bel[0]} / ${S.detail.bel[1]}` : ''}${S.detail.capot >= 0 ? ' · capot !' : ''}</p><p class="jf-small"><b>Cette manche : ${S.lastScore[0]} / ${S.lastScore[1]}</b></p>`;
                if (K === 'tarot' && S.detail) out += `<p class="jf-small">${esc(name(S.taker))} : ${esc(S.detail.contract)}, ${S.detail.pts} points pour ${S.detail.need} demandés (${api.plural(S.detail.oud, 'bout')}) — ${S.detail.win ? 'réussi ✓' : 'chuté'}${S.detail.pab ? ' · Petit au bout' : ''}.</p>`;
                return out ? `<div class="cx-end">${out}</div>` : '';
            }
            function ramiInfo() {
                const S = st(), M = CC.helpers.bestMelds(S.hands[me]), can = myTurn() && S.phase === 'draw', top = S.discard[S.discard.length - 1];
                return `<p class="muted jf-small cx-dw">Tes cartes seules : ${api.plural(M.dw, 'point')} · ${api.plural(M.melds.length, 'combinaison')}${S.phase === 'discard' && myTurn() ? ' · clique la carte à jeter' : ''}</p>
                    <div class="cx-piles cx-rami-piles"><button type="button" class="cx-stock" data-cx-act="draw-stock" ${can ? '' : 'disabled'} aria-label="La pioche (${S.stock.length} cartes)">${back()}<em class="pc-count">${S.stock.length}</em></button>${top ? `<button type="button" class="cx-stock" data-cx-act="draw-discard" ${can ? '' : 'disabled'} aria-label="Prendre ${esc(CC.cardName(top))} sur la défausse">${cardView(top)}</button>` : ''}</div>`;
            }

            /* ── la Crapette : son plateau à elle ── */
            function crapetteHtml() {
                const S = st(), E = CC.get('crapette').E, top = l => l[l.length - 1], L = myTurn() ? CC.legal(S) : [];
                const isTgt = id => pick && pick !== id && L.some(a => a.t === 'move' && a.from === pick && a.to === id), isHint = id => hintA && (hintA.from === id || hintA.to === id);
                const pileBtn = (id, cards, lbl, o = {}) => {
                    const t = top(cards), face = t && t.up !== false && !o.down;
                    const inner = !t ? `<span class="pc-slot cx-slot"><span>${esc(o.empty || '')}</span></span>` : face ? cardView(t, t.o ? ' is-o1f' : '') : back(t.o ? ' is-o1' : '');
                    return `<button type="button" class="cx-pile${pick === id ? ' is-sel' : ''}${isTgt(id) ? ' is-target' : ''}${isHint(id) ? ' is-hint' : ''}" data-pile="${esc(id)}" aria-label="${esc(lbl)}${face ? ' : ' + esc(CC.cardName(t)) : ''}${cards.length > 1 ? `, ${cards.length} cartes` : ''}">${inner}${o.count && cards.length ? `<em class="pc-count">${cards.length}</em>` : ''}</button>`;
                };
                const col = k => { const l = S.cols[k], id = 'c' + k;
                    return `<button type="button" class="cx-col${pick === id ? ' is-sel' : ''}${isTgt(id) ? ' is-target' : ''}${isHint(id) ? ' is-hint' : ''}" data-pile="${id}" aria-label="Colonne ${k + 1}${l.length ? ' : ' + esc(CC.cardName(top(l))) : ' (vide)'}">${l.length ? l.map(x => `<span class="cx-colc">${cardView(x, x.o ? ' is-o1f' : '')}</span>`).join('') : '<span class="pc-slot cx-slot"></span>'}</button>`; };
                const cap = (html, t) => `<span class="cx-pw">${html}<small aria-hidden="true">${t}</small></span>`;
                const side = p => `<div class="cx-crow">${cap(pileBtn('cr' + p, S.crap[p], `Crapette de ${name(p)}`, {count: true, empty: ''}), 'Crapette')}${cap(pileBtn('tl' + p, S.talon[p], `Talon de ${name(p)}`, {count: true, down: true, empty: ''}), 'Talon')}${cap(pileBtn('h' + p, S.hand[p] ? [S.hand[p]] : [], p === me ? 'Ta carte retournée' : `Carte retournée de ${name(p)}`), 'Retournée')}${cap(pileBtn('df' + p, S.disc[p], `Défausse de ${name(p)}`, {count: true, empty: ''}), 'Défausse')}<span class="cx-who">${label(p)}${S.turn === p && !S.over ? ' · à son tour' : ''}<small>${api.plural(E.left(S, p), 'carte')} à poser</small></span></div>`;
                return `<div class="cx-crap">${side(1)}<div class="cx-cols">${[4, 5, 6, 7].map(col).join('')}</div>
                    <div class="cx-found" role="group" aria-label="Les fondations">${S.found.map((f, k) => pileBtn('f' + k, f, `Fondation ${k + 1}`, {empty: 'A'})).join('')}</div>
                    <div class="cx-cols">${[0, 1, 2, 3].map(col).join('')}</div>${side(me)}</div>`;
            }

            /* ── jouer ── */
            const fail = m => { msg = '⛔ ' + (m || 'Ce coup n’est pas permis.'); draw(); };
            function human(a) {
                if (!myTurn()) return;
                const before = JSON.stringify(g.st), tricks = st().tricks;
                const r = CC.play(st(), a);
                if (!r.ok) return fail(r.msg);
                hist.push(before); if (hist.length > 300) hist.shift();
                sel = []; pick = null; hintA = null; suitFor = null; msg = '';
                afterMove(tricks);
            }
            /** un pli vient d'être ramassé : on le laisse un moment sur la table */
            function afterMove(prevTricks) {
                const S = st();
                if (['dame', 'belote', 'tarot'].includes(K) && S.lastTrick && S.tricks !== prevTricks) { pause = {trick: S.lastTrick}; clearTimeout(botT); botT = setTimeout(() => { pause = null; pump(); }, delay() * 1.8 + 300); }
                save(); if (!pause) pump(); else draw();
            }
            function save() {
                const S = st();
                if (S.over && !g.recorded) {
                    g.recorded = true; g.finished = true; sh?.settle();
                    const won = iWon(), r = PL?.records?.add('cartes', K, won ? 'w' : 'l', won ? {v: Math.round(g.ms / 1000), label: `gagné en ${fmt(g.ms)}`, low: true} : null);
                    if (r?.newBest) lastMsg = '🏆 Nouveau record !';
                    api.toast?.(won ? `🏆 ${def.name} : tu gagnes !` : `${def.name} : partie finie.`); api.sidebar();
                }
                g.status = S.over ? (iWon() ? '🏆 Gagné' : 'Perdu') : `${K === 'tarot' ? 'Donne' : 'Manche'} ${S.manche}`;
                api.save();
            }
            /** l'ordinateur joue, un coup à la fois, jusqu'au tour de la personne */
            function pump() {
                clearTimeout(botT); draw();
                const S = st(); if (S.over || S.phase === 'end' || pause || paused()) return;
                if (S.turn === me) return focusHand();
                botT = setTimeout(() => {
                    if (!host.isConnected || paused()) return;
                    const before = st().tricks, a = CC.ai(st()); if (!a) return;
                    const r = CC.play(st(), a); if (!r.ok) { console.warn('Coup de l’ordinateur refusé', a, r); return; }
                    afterMove(before);
                }, K === 'crapette' ? delay() * 0.6 : delay());
            }
            function autoBattle() { clearTimeout(autoT); const step = () => { if (!host.isConnected || over() || paused()) return draw(); hist.push(JSON.stringify(g.st)); if (hist.length > 300) hist.shift(); CC.play(st(), {t: 'flip'}); save(); draw(); autoT = setTimeout(step, Math.max(60, delay() / 3)); }; step(); }
            function undo() {
                const s = hist.pop(); if (!s) return;
                clearTimeout(botT); clearTimeout(autoT); g.st = JSON.parse(s); pause = null; sel = []; pick = null; hintA = null; suitFor = null; msg = '';
                g.recorded = false; g.finished = false; api.save(); pump();
            }
            function resign() {
                const S = st(); if (S.over) return;
                S.over = true; S.phase = 'over'; S.winner = isTeam ? 1 : (S.total.map((v, p) => [v, p]).filter(x => x[1] !== me).sort((a, b) => (K === 'huit' || K === 'dame' ? a[0] - b[0] : b[0] - a[0]))[0]?.[1] ?? 1); if (isTeam) S.winTeam = 1;
                S.log.push(`${name(me)} abandonne la partie.`); clearTimeout(botT); clearTimeout(autoT); save(); draw();
            }
            const findCard = i => st().hands.flat().find(x => x.i === i) || null;
            function giveHint() {
                if (!myTurn() || (c.hints && g.hintsLeft <= 0)) return;
                const a = CC.hint(st()); hintA = a; if (!a) { msg = 'Aucun conseil pour l’instant.'; return draw(); }
                if (c.hints) g.hintsLeft--;
                const cn = i => cname(findCard(i) || {r: 1, s: 0});
                const say = a.t === 'play' && a.c != null ? `joue ${cn(a.c)}` : a.t === 'play' ? `pose ${a.cards.length > 1 ? `ces ${a.cards.length} cartes` : 'cette carte'}` : a.t === 'pass' ? 'passe' : a.t === 'take' ? `prends à ${SUIT[a.s]}` : a.t === 'bid' ? `annonce une ${CC.helpers.CONTRACTS[a.v]}` : a.t === 'give' ? 'donne les 3 cartes marquées' : a.t === 'discard' && a.cards ? 'mets à l’écart les 6 cartes marquées' : a.t === 'discard' ? `jette ${cn(a.c)}` : a.t === 'knock' ? `frappe en jetant ${cn(a.c)}` : a.t === 'draw' ? (a.from === 'discard' ? 'prends la défausse' : 'pioche') : a.t === 'move' ? 'déplace la carte marquée' : a.t === 'flip' ? 'retourne une carte du talon' : a.t === 'end' ? 'pose ta carte sur ta défausse' : 'joue';
                if (a.cards) sel = a.cards.slice(); // Président, cartes à donner, écart : déjà choisies, il reste à valider
                msg = `💡 Conseil : ${say}.`; api.save(); draw();
            }
            function clickCard(i) {
                if (!myTurn()) return;
                const S = st(), mp = multiPhase();
                if (mp) {
                    sel = sel.includes(i) ? sel.filter(x => x !== i) : sel.length >= mp && K !== 'president' ? sel : [...sel, i];
                    if (K === 'president') { const c0 = findCard(i); if (sel.map(findCard).some(x => x && CC.helpers.pv(x) !== CC.helpers.pv(c0))) sel = [i]; }
                    msg = ''; return draw();
                }
                if (K === 'rami') { if (S.phase !== 'discard') return fail('Prends d’abord une carte : dans la pioche ou sur la défausse.'); pick = pick === i ? null : i; return draw(); }
                if (/^bid/.test(S.phase)) return fail('Choisis d’abord ton enchère, avec les boutons à côté de la table.');
                const L = CC.legal(S).filter(a => a.t === 'play' && a.c === i);
                if (!L.length) return fail(CC.play(JSON.parse(JSON.stringify(S)), {t: 'play', c: i, s: 0}).msg);
                if (K === 'huit' && findCard(i).r === 8) { suitFor = i; return draw(); }
                human(L[0]);
            }
            function act(x) {
                const S = st();
                if (x === 'next') { if (CC.next(S)) { hist.length = 0; msg = ''; g.hintsLeft = c.hints ?? 5; save(); pump(); } return; }
                if (x === 'auto') return autoBattle();
                if (x === 'cancel') { suitFor = null; return draw(); }
                const map = {flip: {t: 'flip'}, draw: {t: 'draw'}, pass: {t: 'pass'}, end: {t: 'end'}, give: {t: 'give', cards: sel.slice()}, ecart: {t: 'discard', cards: sel.slice()}, play: {t: 'play', cards: sel.slice()},
                    'draw-stock': {t: 'draw', from: 'stock'}, 'draw-discard': {t: 'draw', from: 'discard'}, discard: pick != null ? {t: 'discard', c: pick} : null, knock: pick != null ? {t: 'knock', c: pick} : null};
                if (x.startsWith('take-')) return human({t: 'take', s: Number(x.slice(5))});
                if (x.startsWith('bid-')) return human({t: 'bid', v: Number(x.slice(4))});
                if (map[x]) human(map[x]);
            }
            function clickPile(id) {
                if (!myTurn()) return;
                const S = st(), L = CC.legal(S);
                if (id === 'tl0') return human({t: 'flip'});
                if (pick && pick !== id) { const a = {t: 'move', from: pick, to: id}; pick = null; if (L.some(x => x.t === 'move' && x.from === a.from && x.to === id)) return human(a); return fail(CC.play(JSON.parse(JSON.stringify(S)), a).msg); }
                if (pick === id) { pick = null; return draw(); }
                if (L.some(x => x.t === 'move' && x.from === id)) { pick = id; hintA = null; msg = ''; return draw(); }
                fail('Tu ne peux rien prendre ici pour l’instant.');
            }
            function toFoundation(id) { const a = CC.legal(st()).find(x => x.t === 'move' && x.from === id && /^f\d$/.test(x.to)); if (a && myTurn()) { pick = null; human(a); } }
            /** au tour de la personne : le clavier va dans sa main (s'il n'était pas ailleurs dans la page) */
            const focusHand = () => { const f = document.activeElement; if (f && f !== document.body && !host.contains(f)) return; if (f && host.contains(f) && f.matches('[data-c], [data-pile], [data-cx-act], [data-jp-undo], [data-jp-hint], [data-jp-pause], [data-jp-rules], [data-jp-more]')) return; (host.querySelector('.cx-hand [data-c]:not(.is-off)') || host.querySelector('.cx-acts button:not([disabled])'))?.focus({preventScroll: true}); };

            let ctl = null;
            function bind() {
                ctl?.abort(); ctl = new AbortController();
                const sig = {signal: api.signal && AbortSignal.any ? AbortSignal.any([api.signal, ctl.signal]) : (api.signal || ctl.signal)};
                const board = host.querySelector('.cx'); if (!board) return;
                board.addEventListener('click', e => {
                    const b = e.target.closest('button'); if (!b || !board.contains(b) || b.disabled) return;
                    if (b.dataset.c != null && b.closest('.cx-hand')) return clickCard(Number(b.dataset.c));
                    if (b.dataset.cxAct) return act(b.dataset.cxAct);
                    if (b.dataset.cxSuit != null) { const i = suitFor; suitFor = null; return human({t: 'play', c: i, s: Number(b.dataset.cxSuit)}); }
                    if (b.dataset.pile) return clickPile(b.dataset.pile);
                }, sig);
                board.addEventListener('dblclick', e => { const b = e.target.closest('[data-pile]'); if (b && K === 'crapette') toFoundation(b.dataset.pile); const h = e.target.closest('.cx-hand [data-c]'); if (h && K === 'rami' && myTurn() && st().phase === 'discard') human({t: 'discard', c: Number(h.dataset.c)}); }, sig);
                // ← → dans la main, flèches sur le plateau de la Crapette
                [['.cx-hand', '[data-c]'], ['.cx-crap', '[data-pile]']].forEach(([zone, item]) => {
                    const z = host.querySelector(zone); if (!z) return;
                    z.addEventListener('keydown', e => {
                        const list = [...z.querySelectorAll(item)], i = list.indexOf(document.activeElement); if (i < 0) return;
                        const d = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key];
                        if (d) { e.preventDefault(); list[(i + d + list.length) % list.length].focus(); }
                        if (e.key === 'Home') { e.preventDefault(); list[0].focus(); } if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
                    }, sig);
                });
            }
            // redessiner garde la carte (ou le bouton) qui avait le clavier
            const draw = () => {
                const f = document.activeElement, key = f && host.contains(f) ? (f.dataset.c != null ? `[data-c="${f.dataset.c}"]` : f.dataset.pile ? `[data-pile="${f.dataset.pile}"]` : f.dataset.cxAct ? `[data-cx-act="${f.dataset.cxAct}"]` : null) : null;
                render(); if (key) (host.querySelector(key) || host.querySelector('.cx-hand [data-c]'))?.focus({preventScroll: true});
            };
            let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (host.isConnected) draw(); }, 150); }, {signal: api.signal});
            api.sub(`${def.icon} ${def.name} · ${api.plural(st().n, 'joueur')}${g.faces ? ' · figures aux portraits des ancêtres' : ''}`);
            api.onCleanup(() => { clearTimeout(botT); clearTimeout(autoT); sh?.settle(); sh?.stop(); api.save(); });
            pump();
        },
    });
})();
