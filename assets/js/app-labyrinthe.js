/* LCNDA — 🌀 Labyrinthe, un jeu de l'outil « Jeu » (branché dans app-jeu.js, comme le puzzle).
 *
 *  - le moteur est dans app-labyrinthe-core.js (LCNDA_LABY_CORE) : graine, formes, algorithmes, chemin, dessin SVG ;
 *  - préparation : forme, taille, algorithme, boucles, départ et arrivée, style et couleurs (C2), joueurs, étapes à aller
 *    chercher (ancêtres, lieux, événements, maisons, photos — tirés de la base en lecture seule : mode_simple_data, houses ;
 *    jamais une personne vivante ni une fiche confidentielle), aperçu vivant, 💾 Réglages enregistrés + Ensembles prêts ;
 *  - partie : flèches / ZQSD (et IJKL, pavé numérique en course), glisser au doigt ou à la souris, chrono, pas, 💡 indice,
 *    solution, brouillard, 1 à 4 joueurs (chacun son tour ou tous en même temps) ; fin : score et rencontres ;
 *  - parties gardées dans ce navigateur (au plus MAX_GAMES), rien n'est écrit en base ; 🖨 Imprimer (labyrinthe + solution),
 *    ⤓ Exporter ▾ (PNG, SVG).
 *  API (window.LCNDA_LABY) : owns(id), renderSetup(ws, ctx), render(ws, id, ctx), sidebarHtml(active), bindSidebar(content, ctx, signal),
 *  stop(), gameCount(), debug() (pour les tests).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const PK = () => window.LCNDA_PICKER || window.LCNDA_APP || {};
    const L = () => window.LCNDA_LABY_CORE;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => { try { (A().toast || console.info)(m, k, o); } catch (_) {} };
    const plural = (n, one, many) => { try { if (A().plural) return A().plural(n, one, many); } catch (_) {} return `${n} ${n > 1 ? (many || one + 's') : one}`; };
    const notice = (kind, text) => (UI().notice ? UI().notice(kind, text) : `<p class="lb-msg">${esc(text)}</p>`);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fmtTime = ms => { const s = Math.max(0, Number(ms) || 0) / 1000; if (UI().clock) return UI().clock(s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}`; };
    const calm = () => document.documentElement.classList.contains('a11y-calm') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const TITLE = 'Jeu de l’oie / Serpents et échelles / Petits chevaux / Puzzle / Labyrinthe';
    const GAMES_KEY = 'lcnda-laby-games-v1', PREFS_KEY = 'lcnda-laby-prefs-v1', PRESETS_KEY = 'lcnda-laby-presets-v1';
    const MAX_GAMES = 10;
    const COLORS = ['#d93636', '#2878c8', '#198754', '#f2a900', '#7c3aed', '#e87818'];
    const SHAPES = [['square', '⬜', 'Carré'], ['hex', '⬡', 'Hexagones'], ['round', '◯', 'Rond'], ['heart', '❤️', 'Cœur'], ['tree', '🌳', 'Arbre'], ['france', '🇫🇷', 'France'], ['star', '⭐', 'Étoile']];
    const ALGOS = [['backtracker', 'Longs couloirs qui serpentent'], ['prim', 'Beaucoup de petites impasses'], ['kruskal', 'Équilibré'], ['wilson', 'Tout à fait au hasard']];
    const ENDS = [['coins', 'Dans deux coins opposés'], ['loin', 'Le plus loin possible l’un de l’autre'], ['centre', 'Départ au centre'], ['hasard', 'Au hasard']];
    const STYLES = [['trait', '✏️', 'Trait'], ['haies', '🌿', 'Haies'], ['pierres', '🪨', 'Pierres'], ['parchemin', '📜', 'Parchemin']];
    const KINDS = [['ancetres', '👤', 'Des ancêtres'], ['lieux', '📍', 'Des lieux'], ['evenements', '📅', 'Des événements'], ['maisons', '🏠', 'Des maisons'], ['photos', '📷', 'Des photos'], ['melange', '🎲', 'Un peu de tout']];
    const DEF = {name: '', shape: 'square', w: 20, h: 20, rings: 10, algo: 'backtracker', loops: 0, ends: 'coins', seed: '',
        style: 'trait', thick: 12, wall: '', floor: '', path: '',
        st: {n: 0, kind: 'ancetres', sub: 'sosa', gen: 3, root: '', people: '', order: 'libre', needAll: true},
        fog: false, fogR: 3, trail: true, hints: true, mode: 'tour', players: [{name: 'Joueur 1', color: COLORS[0]}]};
    const READY = [
        {k: 'enfants', name: '🧸 Facile pour les enfants', hint: 'Petit, des haies, 3 photos à trouver', cfg: {shape: 'square', w: 10, h: 10, algo: 'backtracker', loops: 15, ends: 'coins', style: 'haies', thick: 16, st: {n: 3, kind: 'photos', order: 'libre', needAll: false}, fog: false, hints: true}},
        {k: 'defi', name: '🧗 Grand défi', hint: '45 × 45, beaucoup d’impasses, dans le brouillard', cfg: {shape: 'square', w: 45, h: 45, algo: 'prim', loops: 0, ends: 'loin', style: 'pierres', thick: 10, st: {n: 0}, fog: true, fogR: 3, hints: false}},
        {k: 'ancetres', name: '🌳 À la recherche des ancêtres', hint: 'Remonte ta lignée, de Sosa en Sosa', cfg: {shape: 'tree', w: 30, h: 30, algo: 'kruskal', loops: 5, ends: 'coins', style: 'parchemin', thick: 12, st: {n: 6, kind: 'ancetres', sub: 'sosa', order: 'lignee', needAll: true}, fog: false, hints: true}},
        {k: 'france', name: '🇫🇷 Tour de France des villages', hint: 'La France, et les lieux de ta famille', cfg: {shape: 'france', w: 34, h: 34, algo: 'wilson', loops: 8, ends: 'hasard', style: 'parchemin', thick: 11, st: {n: 8, kind: 'lieux', sub: 'tous', order: 'libre', needAll: true}, fog: false, hints: true}},
    ];

    /* ═════ Mémoire du navigateur ═════ */
    const ls = {get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast('Plus de place dans ce navigateur pour garder la partie.', 'error'); return false; } }};
    const games = () => { const v = ls.get(GAMES_KEY, []); return Array.isArray(v) ? v.filter(g => g && typeof g.id === 'string').slice(0, MAX_GAMES) : []; };
    const saveGames = list => ls.set(GAMES_KEY, list.slice(0, MAX_GAMES));
    const gameById = id => games().find(g => g.id === id) || null;
    const writeGame = g => { const list = games(), i = list.findIndex(x => x.id === g.id); if (i >= 0) list[i] = g; else list.unshift(g); saveGames(list); };
    const owns = id => typeof id === 'string' && id.startsWith('laby-') && !!gameById(id);
    const gameCount = () => games().length;

    /** un réglage lu (fichier, réglage enregistré, ancienne version) : seulement ce qu'on connaît, dans les bornes */
    function cleanCfg(raw) {
        const r = raw && typeof raw === 'object' ? raw : {}, o = JSON.parse(JSON.stringify(DEF));
        const one = (v, list, d) => (list.some(x => x[0] === v) ? v : d);
        o.name = String(r.name || '').replace(/[<>]/g, '').slice(0, 80);
        o.shape = one(r.shape, SHAPES, o.shape); o.algo = one(r.algo, ALGOS, o.algo); o.ends = one(r.ends, ENDS, o.ends); o.style = one(r.style, STYLES, o.style);
        o.w = clamp(Math.round(Number(r.w) || o.w), 4, 60); o.h = clamp(Math.round(Number(r.h) || o.h), 4, 60); o.rings = clamp(Math.round(Number(r.rings) || o.rings), 3, 30);
        o.loops = clamp(Math.round(Number(r.loops) || 0), 0, 30); o.thick = clamp(Math.round(Number(r.thick) || o.thick), 3, 45);
        o.seed = String(r.seed || '').replace(/[^\w-]/g, '').slice(0, 24);
        ['wall', 'floor', 'path'].forEach(k => { o[k] = /^#[0-9a-f]{6}$/i.test(r[k] || '') ? r[k] : ''; });
        const s = r.st && typeof r.st === 'object' ? r.st : {};
        o.st = {n: clamp(Math.round(Number(s.n) || 0), 0, 12), kind: one(s.kind, KINDS, 'ancetres'), sub: ['sosa', 'gen', 'root', 'people', 'tous'].includes(s.sub) ? s.sub : (s.kind === 'lieux' ? 'tous' : 'sosa'),
            gen: clamp(Math.round(Number(s.gen) || 3), 1, 12), root: String(s.root || '').replace(/[^\d]/g, '').slice(0, 12), people: String(s.people || '').replace(/[^\d,]/g, '').slice(0, 400),
            order: ['libre', 'chrono', 'lignee'].includes(s.order) ? s.order : 'libre', needAll: s.needAll !== false};
        o.fog = !!r.fog; o.fogR = clamp(Math.round(Number(r.fogR) || 3), 1, 8); o.trail = r.trail !== false; o.hints = r.hints !== false;
        o.mode = r.mode === 'course' ? 'course' : 'tour';
        const pl = Array.isArray(r.players) && r.players.length ? r.players.slice(0, 4) : o.players;
        o.players = pl.map((p, i) => ({name: String(p?.name || `Joueur ${i + 1}`).replace(/[<>]/g, '').slice(0, 30) || `Joueur ${i + 1}`, color: /^#[0-9a-f]{6}$/i.test(p?.color || '') ? p.color : COLORS[i]}));
        return o;
    }
    const mazeCfg = c => ({seed: c.seed, shape: c.shape, w: c.w, h: c.h, rings: c.rings, algo: c.algo, loops: c.loops, ends: c.ends});
    const look = c => ({style: c.style, thick: c.thick, wall: c.wall, floor: c.floor, path: c.path});

    /* ═════ Les étapes : tirées de la base, en lecture seule ═════ */
    let DATA = null, DATA_P = null, HOUSES = null;
    async function loadData() {
        if (DATA) return DATA;
        if (!DATA_P) DATA_P = A().api('mode_simple_data').then(d => { DATA = d || {persons: [], families: [], media: []}; return DATA; }).catch(e => { DATA_P = null; throw e; });
        return DATA_P;
    }
    async function loadHouses() { if (HOUSES) return HOUSES; try { HOUSES = ((await A().api('houses')).items || []); } catch (_) { HOUSES = []; } return HOUSES; }
    const yearOf = ev => ev?.date?.y || null;
    function index(D) {
        const P = new Map((D.persons || []).map(p => [p.id, p]));
        const ok = p => p && !p.living && !p.priv;
        const parents = new Map(); (D.families || []).forEach(f => f.c.forEach(c => parents.set(c, f)));
        const name = p => `${p.first || ''} ${(p.last || '').toUpperCase()}`.trim() || 'Sans nom';
        const years = p => { const b = yearOf(p.birth) || yearOf(p.bapt), d = yearOf(p.death); return b || d ? `${b || '?'}–${d || '?'}` : ''; };
        /** les numéros Sosa à partir d'une personne (1 = elle) */
        const sosaFrom = root => {
            const out = new Map(); if (!P.has(root)) return out; const q = [[root, 1]];
            while (q.length) { const [id, n] = q.shift(); if (out.has(id) || n > 1 << 15) continue; out.set(id, n); const f = parents.get(id); if (!f) continue;
                const pa = [f.a, f.b].filter(Boolean).map(x => P.get(x)); const dad = pa.find(x => x.g === 'm') || pa.find(x => x.g !== 'f' && x !== pa.find(y => y.g === 'f')), mom = pa.find(x => x !== dad);
                if (dad) q.push([dad.id, 2 * n]); if (mom) q.push([mom.id, 2 * n + 1]); }
            return out;
        };
        return {P, ok, name, years, parents, sosaFrom};
    }
    function personItem(X, p, sosa) {
        const b = p.birth || p.bapt, place = b?.place || p.death?.place || '';
        return {kind: 'person', icon: '👤', pid: p.id, title: X.name(p), sub: [X.years(p), place].filter(Boolean).join(' · '), year: yearOf(b) || yearOf(p.death), sosa: sosa || 0,
            g: p.g, photo: p.photo || '', first: p.first, last: p.last};
    }
    /** → {items, error} */
    async function buildItems(cfg, seed) {
        const s = cfg.st, n = s.n; if (!n) return {items: []};
        const r = L().rng(`${seed}|choix`);
        let D; try { D = await loadData(); } catch (e) { return {items: [], error: `Les données de ta généalogie n’ont pas pu être lues : ${e.message || e}`}; }
        const X = index(D);
        const people = () => {
            const start = Number(D.start) || 0;
            if (s.sub === 'people') { const ids = s.people.split(',').map(Number).filter(Boolean); return ids.map(id => X.P.get(id)).filter(X.ok).map(p => personItem(X, p)); }
            const root = s.sub === 'root' ? Number(s.root) : 0;
            let sosa;
            if (root) sosa = X.sosaFrom(root);
            else { const map = (() => { try { return A().sosaMap?.() || {}; } catch (_) { return {}; } })(); sosa = new Map(Object.entries(map).map(([k, v]) => [Number(k), Number(v)]).filter(([k, v]) => v > 0 && X.P.has(k))); if (sosa.size < 3 && start) sosa = X.sosaFrom(start); }
            let list = [...sosa.entries()].filter(([id, v]) => v > 1 && X.ok(X.P.get(id)));
            if (s.sub === 'gen') { const lo = 2 ** s.gen, hi = 2 ** (s.gen + 1); list = list.filter(([, v]) => v >= lo && v < hi); }
            if (s.order === 'lignee') { // une lignée : 16 → 8 → 4 → 2 (les numéros qui se suivent en divisant par 2)
                const by = new Map(list.map(([id, v]) => [v, id])), all = new Map([...sosa.entries()].map(([id, v]) => [v, id]));
                let best = []; for (const [, v] of [...list].sort((a, b) => b[1] - a[1])) {
                    const chain = []; for (let k = v; k >= 2; k = Math.floor(k / 2)) { const id = all.get(k); if (!id || !X.ok(X.P.get(id))) break; chain.push([id, k]); }
                    if (chain.length > best.length) best = chain; if (best.length >= n) break; }
                void by; return best.slice(0, n).map(([id, v]) => personItem(X, X.P.get(id), v));
            }
            return list.map(([id, v]) => personItem(X, X.P.get(id), v));
        };
        const ancestorsSet = () => { const root = Number(s.root) || Number(D.start) || 0; return root && s.sub === 'root' ? new Set(X.sosaFrom(root).keys()) : null; };
        const places = () => {
            const only = ancestorsSet(), seen = new Map();
            const add = (place, what, year) => { if (!place || seen.has(place)) return; seen.set(place, {kind: 'place', icon: '📍', title: place, sub: [what, year].filter(Boolean).join(' · '), year}); };
            (D.persons || []).filter(X.ok).filter(p => !only || only.has(p.id)).forEach(p => { if (p.birth?.place) add(p.birth.place, `Naissance de ${X.name(p)}`, yearOf(p.birth)); if (p.death?.place) add(p.death.place, `Décès de ${X.name(p)}`, yearOf(p.death)); });
            (D.families || []).forEach(f => { const a = X.P.get(f.a), b = X.P.get(f.b); if (!f.marr?.place || ![a, b].some(X.ok) || [a, b].some(x => x && !X.ok(x))) return; if (only && ![f.a, f.b].some(x => only.has(x))) return; add(f.marr.place, `Mariage de ${[a, b].filter(Boolean).map(X.name).join(' et ')}`, yearOf(f.marr)); });
            return [...seen.values()];
        };
        const events = () => {
            const only = ancestorsSet(), out = [];
            (D.persons || []).filter(X.ok).filter(p => !only || only.has(p.id)).forEach(p => {
                if (p.birth && yearOf(p.birth)) out.push({kind: 'event', icon: '👶', pid: p.id, title: `Naissance de ${X.name(p)}`, sub: [yearOf(p.birth), p.birth.place].filter(Boolean).join(' · '), year: yearOf(p.birth)});
                if (p.death && yearOf(p.death)) out.push({kind: 'event', icon: '✝️', pid: p.id, title: `Décès de ${X.name(p)}`, sub: [yearOf(p.death), p.death.place].filter(Boolean).join(' · '), year: yearOf(p.death)});
            });
            (D.families || []).forEach(f => { const a = X.P.get(f.a), b = X.P.get(f.b); if (!f.marr || !yearOf(f.marr) || [a, b].some(x => x && !X.ok(x)) || ![a, b].some(Boolean)) return; if (only && ![f.a, f.b].some(x => only.has(x))) return;
                out.push({kind: 'event', icon: '💍', pid: (a || b).id, title: `Mariage de ${[a, b].filter(Boolean).map(X.name).join(' et ')}`, sub: [yearOf(f.marr), f.marr.place].filter(Boolean).join(' · '), year: yearOf(f.marr)}); });
            return out;
        };
        const photos = () => (D.media || []).filter(m => !m.doc && m.thumb && (m.people || []).every(id => X.ok(X.P.get(id)))).map(m => ({kind: 'photo', icon: '📷', mid: m.id, title: m.title || 'Une photo de famille', sub: [m.date?.y, m.place].filter(Boolean).join(' · '), year: m.date?.y || null, thumb: m.thumb}));
        const houses = async () => (await loadHouses()).map(h => ({kind: 'house', icon: '🏠', hid: h.id, title: h.name || h.title || 'Une maison', sub: [h.address || h.place || '', h.year || ''].filter(Boolean).join(' · '), year: Number(h.year) || null}));
        let pool;
        if (s.kind === 'ancetres') pool = people();
        else if (s.kind === 'lieux') pool = places();
        else if (s.kind === 'evenements') pool = events();
        else if (s.kind === 'photos') pool = photos();
        else if (s.kind === 'maisons') pool = await houses();
        else { const groups = [people(), places(), events(), photos()].map(g => r.shuffle(g)); pool = []; for (let i = 0; pool.length < n * 3 && groups.some(g => g.length); i++) { const g = groups[i % groups.length]; if (g.length) pool.push(g.shift()); } }
        if (pool.length < n) {
            const what = KINDS.find(k => k[0] === s.kind)?.[2]?.toLowerCase() || 'étapes';
            return {items: [], error: pool.length ? `Ta généalogie n’a que ${plural(pool.length, 'élément')} pour « ${what} » : baisse le nombre d’étapes à ${pool.length}, ou choisis « Un peu de tout ».` : `Rien à aller chercher pour « ${what} » dans ta généalogie (les personnes vivantes et les fiches confidentielles ne sont jamais montrées).`};
        }
        let items = s.order === 'lignee' && s.kind === 'ancetres' ? pool.slice(0, n) : r.shuffle(pool.slice()).slice(0, n);
        if (s.order === 'chrono') items.sort((a, b) => (a.year || 9999) - (b.year || 9999));
        if (s.order === 'lignee' && s.kind === 'ancetres') items.sort((a, b) => b.sosa - a.sosa);
        return {items};
    }
    /** les étapes posées dans le labyrinthe : la 1re près du départ quand l'ordre est imposé */
    function placeItems(maze, items, cfg, seed) {
        const cells = L().placeStages(maze, items.length, seed); if (!cells.length) return [];
        let order = cells;
        if (cfg.st.order !== 'libre') { const {dist} = L().bfs(maze.links, maze.start); order = [...cells].sort((a, b) => dist[a] - dist[b]); }
        return items.slice(0, order.length).map((it, i) => ({...it, cell: order[i], n: cfg.st.order === 'libre' ? 0 : i + 1}));
    }

    /* ═════ Préparation ═════ */
    let setup = null, preview = null, stopper = null;
    const prefsCfg = () => cleanCfg(ls.get(PREFS_KEY, null) || DEF);
    function stop() { if (stopper) { try { stopper(); } catch (_) {} stopper = null; } }
    const seg = (name, list, val, cls = '') => `<div class="segmented lb-seg ${cls}" role="radiogroup" data-lb-seg="${name}">${list.map(([v, ico, t]) => `<button type="button" class="${String(v) === String(val) ? 'is-active' : ''}" aria-pressed="${String(v) === String(val)}" data-v="${esc(v)}">${ico ? `<span aria-hidden="true">${ico}</span> ` : ''}${esc(t)}</button>`).join('')}</div>`;
    const opt = (list, val) => list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const check = (name, on, text, sub = '') => (UI().checkHtml ? UI().checkHtml(text, {checked: on, attrs: `name="${name}"`, sub}) : `<label class="checkbox-line"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${esc(text)}${sub ? ` <small>${esc(sub)}</small>` : ''}</label>`);
    function setupHtml(ctx, c) {
        const variants = (ctx.variants || [['laby', '🌀 Labyrinthe']]).map(([v, l]) => `<option value="${esc(v)}"${v === 'laby' ? ' selected' : ''}>${esc(l)}</option>`).join('');
        const full = gameCount() >= MAX_GAMES, s = c.st, P = PK();
        const players = c.players.map((p, i) => `<div class="lb-player" data-i="${i}"><span class="lb-dot" style="--pawn:${esc(p.color)}" aria-hidden="true"></span><label>Joueur ${i + 1}<input name="pname" value="${esc(p.name)}" maxlength="30"></label><span class="lb-pcolor" data-lb-pcolor="${i}"></span>${c.players.length > 1 ? `<button type="button" class="icon-button small" data-lb-pdel="${i}" aria-label="Retirer ${esc(p.name)}" title="Retirer ce joueur">×</button>` : ''}</div>`).join('');
        return `<section class="goose-page lb-page"><header class="goose-head"><span class="eyebrow">TABLE DE JEU · LABYRINTHE</span><h2>${esc(TITLE)}</h2><p>Un labyrinthe fait pour toi, et si tu veux des ancêtres, des lieux ou des souvenirs à aller chercher dedans. La partie se garde dans ce navigateur.</p></header>
            ${full ? `<div class="lb-msgline">${notice('warn', `Les ${MAX_GAMES} labyrinthes en cours sont gardés : supprimes-en un pour en commencer un autre.`)}</div>` : ''}
            <form class="goose-setup lb-setup" id="lb-setup-form" novalidate>
              <div class="lb-cols"><div class="lb-main">
                <div class="goose-setup-grid lb-top"><label>Jeu<select name="variant" data-lb-variant>${variants}</select></label><label>Nom de la partie<input name="name" value="${esc(c.name)}" placeholder="Ex : Le labyrinthe de Mamie" maxlength="80"></label>
                    <label>Graine <span class="lb-seedrow"><input name="seed" value="${esc(c.seed)}" maxlength="24" spellcheck="false" title="La même graine redonne le même labyrinthe : partage-la pour jouer au même"><button type="button" class="button small secondary" data-lb-reseed title="Un autre labyrinthe (nouvelle graine)">🎲 Un autre</button></span></label></div>
                <fieldset class="lb-fs"><legend>1 · La forme</legend>
                    ${seg('shape', SHAPES, c.shape, 'lb-shapes')}
                    <div class="lb-ranges" data-lb-sizes></div>
                    <div class="goose-setup-grid lb-grid2"><label>Les couloirs<select name="algo">${opt(ALGOS, c.algo)}</select></label><label>Départ et arrivée<select name="ends">${opt(ENDS, c.ends)}</select></label></div>
                    <div class="lb-ranges" data-lb-loops></div>
                </fieldset>
                <fieldset class="lb-fs"><legend>2 · L’aspect</legend>
                    ${seg('style', STYLES, c.style)}
                    <div class="lb-ranges" data-lb-thick></div>
                    <div class="lb-colors"><span class="lb-cl"><span class="pk-lab">Murs</span><span data-lb-color="wall"></span></span><span class="lb-cl"><span class="pk-lab">Sol</span><span data-lb-color="floor"></span></span><span class="lb-cl"><span class="pk-lab">Chemin et solution</span><span data-lb-color="path"></span></span></div>
                    <p class="muted lb-small">« Aucune » : la couleur du style choisi.</p>
                </fieldset>
                <fieldset class="lb-fs"><legend>3 · Des choses à aller chercher <small>(facultatif)</small></legend>
                    <div class="lb-ranges" data-lb-count></div>
                    <div class="lb-stage-opts" ${s.n ? '' : 'hidden'} data-lb-stopts>
                        <div class="lb-kinds">${seg('kind', KINDS, s.kind)}</div>
                        <div class="goose-setup-grid lb-grid2">
                            <label data-lb-sub>Lesquels<select name="sub"></select></label>
                            <label>Ordre<select name="order"></select></label>
                        </div>
                        <div data-lb-gen class="lb-ranges"></div>
                        <div data-lb-root hidden><span class="pk-lab">À partir de la personne</span>${P.pickerField ? P.pickerField({name: 'root', kind: 'person', value: Number(s.root) || null}) : '<input name="root">'}</div>
                        <div data-lb-people hidden><span class="pk-lab">Les personnes à aller chercher</span>${P.pickerField ? P.pickerField({name: 'people', kind: 'person', multiple: true, value: s.people ? s.people.split(',').map(Number).filter(Boolean) : []}) : '<input name="people">'}</div>
                        ${check('needAll', s.needAll, 'Sortir seulement après avoir tout ramassé')}
                        <p class="muted lb-small">Ni les personnes vivantes ni les fiches confidentielles ne sont jamais montrées.</p>
                    </div>
                    <div data-lb-sterr></div>
                </fieldset>
                <fieldset class="lb-fs"><legend>4 · Les joueurs</legend>
                    <div class="lb-players">${players}</div>
                    <div class="lb-prow">${c.players.length < 4 ? '<button type="button" class="button small secondary" data-lb-padd>＋ Ajouter un joueur</button>' : ''}
                        <label ${c.players.length > 1 ? '' : 'hidden'} data-lb-modewrap>Comment<select name="mode"><option value="tour"${c.mode === 'tour' ? ' selected' : ''}>Chacun son tour, on compare les temps</option><option value="course"${c.mode === 'course' ? ' selected' : ''}>Tous en même temps (course)</option></select></label></div>
                    <p class="muted lb-small" data-lb-keys></p>
                </fieldset>
                <fieldset class="lb-fs"><legend>5 · Pour corser ou aider</legend>
                    <div class="lb-checks">${check('fog', c.fog, 'Brouillard', 'on ne voit qu’autour de son pion')}${check('trail', c.trail, 'Montrer les cases déjà parcourues')}${check('hints', c.hints, 'Permettre les indices et la solution')}</div>
                    <div class="lb-ranges" data-lb-fogr ${c.fog ? '' : 'hidden'}></div>
                </fieldset>
              </div>
              <aside class="lb-aside">
                <div class="lb-pv-card"><div class="lb-pv-head"><b>Aperçu</b><small data-lb-info></small></div><div class="lb-pv" data-lb-pv></div></div>
                <div class="lb-ready"><b>✨ Ensembles prêts</b><div class="lb-ready-list">${READY.map(x => `<button type="button" class="lb-ready-b" data-lb-ready="${x.k}"><b>${esc(x.name)}</b><small>${esc(x.hint)}</small></button>`).join('')}</div></div>
                <div data-lb-presets></div>
              </aside></div>
              <footer class="lb-foot"><small>Flèches ou ZQSD pour avancer · glisse ton pion à la souris ou au doigt · Espace : pause.</small><button type="submit" class="button lb-start"${full ? ' disabled' : ''}>▶ Démarrer la partie</button></footer>
            </form></section>`;
    }
    function renderSetup(ws, ctx, cfg = null) {
        stop();
        if (cfg || !setup) setup = cleanCfg(cfg || prefsCfg());
        if (!setup.seed) setup.seed = L().newSeed();
        ws.innerHTML = setupHtml(ctx, setup);
        bindSetup(ws, ctx);
    }
    function bindSetup(ws, ctx) {
        const form = ws.querySelector('#lb-setup-form'); if (!form) return;
        const ac = new AbortController(); stopper = () => ac.abort(); const sig = {signal: ac.signal};
        const q = s => form.querySelector(s), c = setup;
        const save = () => ls.set(PREFS_KEY, {...c, name: ''});
        let pvT = 0;
        const redraw = () => { clearTimeout(pvT); pvT = setTimeout(() => {
            if (!form.isConnected) return;
            const t = performance.now(), m = L().generate(mazeCfg(c)), st = L().placeStages(m, c.st.n, c.seed).map((cell, i) => ({cell, icon: KINDS.find(k => k[0] === c.st.kind)?.[1] || '★', n: c.st.order === 'libre' ? 0 : i + 1}));
            preview = m;
            q('[data-lb-pv]').innerHTML = L().toSvg(m, {...look(c), stages: st, title: 'Aperçu du labyrinthe'});
            q('[data-lb-info]').textContent = `${plural(m.cells.length, 'case')} · solution en ${plural(m.solution.length - 1, 'pas', 'pas')} · ${plural(m.deadEnds, 'impasse')}${performance.now() - t > 400 ? ' · grand !' : ''}`;
        }, 60); };
        const ranges = () => {
            const R = UI().rangeField, put = (slot, list) => { const box = q(slot); box.innerHTML = ''; list.forEach(([k, label, min, max, unit, step = 1, obj = c]) => { if (!R) return; const f = R({label, min, max, step, value: obj[k], unit, default: DEF[k] ?? (DEF.st[k] ?? min)}); f.input.dataset.lbK = k; if (obj !== c) f.input.dataset.lbSt = '1'; box.appendChild(f); }); };
            put('[data-lb-sizes]', c.shape === 'round' ? [['rings', 'Anneaux', 3, 30, 'anneaux']] : [['w', 'Largeur', 4, 60, 'cases'], ['h', 'Hauteur', 4, 60, 'cases']]);
            put('[data-lb-loops]', [['loops', 'Boucles (plusieurs chemins)', 0, 30, '%']]);
            put('[data-lb-thick]', [['thick', 'Épaisseur des murs', 3, 45, '%']]);
            put('[data-lb-count]', [['n', 'Nombre d’étapes', 0, 12, 'étapes', 1, c.st]]);
            put('[data-lb-fogr]', [['fogR', 'On voit à', 1, 8, 'cases']]);
            if (c.st.sub === 'gen' && c.st.kind === 'ancetres') put('[data-lb-gen]', [['gen', 'Génération (1 = parents, 2 = grands-parents…)', 1, 12, '', 1, c.st]]); else q('[data-lb-gen]').innerHTML = '';
        };
        const stageOpts = () => {
            const s = c.st, isAnc = s.kind === 'ancetres', subs = isAnc ? [['sosa', 'Tous mes ancêtres (Sosa)'], ['gen', 'Une génération'], ['root', 'Les ancêtres d’une personne'], ['people', 'Des personnes choisies']]
                : ['lieux', 'evenements'].includes(s.kind) ? [['tous', 'De toute la généalogie'], ['root', 'D’une personne et de ses ancêtres']] : [];
            if (!subs.some(x => x[0] === s.sub)) s.sub = subs[0]?.[0] || 'tous';
            const sub = q('[name="sub"]'); sub.innerHTML = opt(subs, s.sub); q('[data-lb-sub]').hidden = !subs.length;
            const orders = [['libre', 'Dans l’ordre que tu veux'], ['chrono', 'De la plus ancienne à la plus récente'], ...(isAnc && s.sub !== 'people' ? [['lignee', 'Remonte ta lignée (Sosa 16 → 8 → 4 → 2)']] : [])];
            if (!orders.some(x => x[0] === s.order)) s.order = 'libre';
            q('[name="order"]').innerHTML = opt(orders, s.order);
            q('[data-lb-stopts]').hidden = !s.n; q('[data-lb-root]').hidden = s.sub !== 'root'; q('[data-lb-people]').hidden = !(isAnc && s.sub === 'people');
            q('[data-lb-sterr]').innerHTML = '';
        };
        const keysHelp = () => { q('[data-lb-keys]').innerHTML = c.players.length > 1 && c.mode === 'course' ? `Touches : ${c.players.map((p, i) => `<b>${esc(p.name)}</b> ${['flèches', 'Z Q S D', 'I J K L', 'pavé 8 4 5 6'][i]}`).join(' · ')} — ou glisse son pion.` : 'Flèches ou Z Q S D (ou glisse le pion). Chacun joue à son tour sur le même labyrinthe.'; };
        const colors = () => {
            const CF = UI().colorField; form.querySelectorAll('[data-lb-color]').forEach(slot => { const k = slot.dataset.lbColor; if (!CF) return; const f = CF({value: c[k] || '', allowNone: true, compact: false}); f.input.dataset.lbColorK = k; slot.replaceChildren(f); });
            form.querySelectorAll('[data-lb-pcolor]').forEach(slot => { const i = Number(slot.dataset.lbPcolor); if (!CF) return; const f = CF({value: c.players[i].color, compact: true}); f.input.dataset.lbPc = i; slot.replaceChildren(f); });
        };
        const full = () => { renderSetup(ws, ctx); };
        ranges(); stageOpts(); keysHelp(); colors(); redraw();
        // les changements
        form.addEventListener('input', e => {
            const t = e.target;
            if (t.dataset.lbK) { const k = t.dataset.lbK, v = Number(t.value); if (t.dataset.lbSt) { c.st[k] = v; if (k === 'n') { stageOpts(); } if (k === 'gen') {} } else c[k] = v; save(); if (['w', 'h', 'rings', 'loops', 'thick'].includes(k) || (t.dataset.lbSt && k === 'n')) redraw(); return; }
            if (t.dataset.lbColorK) { c[t.dataset.lbColorK] = t.value || ''; save(); redraw(); return; }
            if (t.dataset.lbPc != null) { c.players[Number(t.dataset.lbPc)].color = t.value || COLORS[0]; form.querySelectorAll('.lb-dot')[Number(t.dataset.lbPc)]?.style.setProperty('--pawn', t.value); save(); return; }
            if (t.name === 'pname') { const i = Number(t.closest('[data-i]').dataset.i); c.players[i].name = t.value.slice(0, 30); keysHelp(); save(); return; }
            if (t.name === 'name') { c.name = t.value; return; }
            if (t.name === 'seed') { c.seed = t.value.replace(/[^\w-]/g, '').slice(0, 24); save(); redraw(); }
        }, sig);
        form.addEventListener('change', e => {
            const t = e.target;
            if (t.name === 'variant') { if (t.value !== 'laby') ctx.onVariant?.(t.value); return; }
            if (t.name === 'algo' || t.name === 'ends') { c[t.name] = t.value; save(); redraw(); return; }
            if (t.name === 'sub') { c.st.sub = t.value; stageOpts(); ranges(); save(); return; }
            if (t.name === 'order') { c.st.order = t.value; save(); redraw(); return; }
            if (t.name === 'root') { c.st.root = String(t.value || '').replace(/[^\d]/g, ''); save(); return; }
            if (t.name === 'people') { c.st.people = String(t.value || '').split(',').filter(x => /^\d+$/.test(x)).join(','); save(); return; }
            if (t.name === 'mode') { c.mode = t.value; keysHelp(); save(); return; }
            if (['fog', 'trail', 'hints', 'needAll'].includes(t.name)) { if (t.name === 'needAll') c.st.needAll = t.checked; else c[t.name] = t.checked; if (t.name === 'fog') q('[data-lb-fogr]').hidden = !t.checked; save(); }
        }, sig);
        // les pickers écrivent dans un champ caché : on relit au moment de démarrer aussi
        form.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !form.contains(b)) return;
            const sg = b.closest('[data-lb-seg]');
            if (sg && b.dataset.v != null) { const k = sg.dataset.lbSeg; sg.querySelectorAll('button').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
                if (k === 'kind') { c.st.kind = b.dataset.v; stageOpts(); ranges(); } else { c[k] = b.dataset.v; if (k === 'shape') ranges(); }
                save(); redraw(); return; }
            if (b.matches('[data-lb-reseed]')) { c.seed = L().newSeed(); q('[name="seed"]').value = c.seed; save(); redraw(); return; }
            if (b.matches('[data-lb-padd]')) { const used = c.players.map(p => p.color); c.players.push({name: `Joueur ${c.players.length + 1}`, color: COLORS.find(x => !used.includes(x)) || COLORS[c.players.length]}); save(); full(); return; }
            if (b.dataset.lbPdel != null) { c.players.splice(Number(b.dataset.lbPdel), 1); save(); full(); return; }
            if (b.dataset.lbReady) { const x = READY.find(r => r.k === b.dataset.lbReady); if (!x) return; setup = cleanCfg({...c, ...x.cfg, st: {...c.st, ...(x.cfg.st || {})}, players: c.players, name: c.name, seed: L().newSeed()}); save(); renderSetup(ws, ctx); toast(`Ensemble « ${x.name.replace(/^\S+\s/, '')} » appliqué : tu peux tout retoucher.`); }
        }, sig);
        // 💾 Réglages enregistrés (le cadre commun)
        const slot = q('[data-lb-presets]'), U = UI();
        if (slot && U.presetsFrame) {
            const list = () => { const v = ls.get(PRESETS_KEY, []); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string').slice(0, 60) : []; };
            const put = l => ls.set(PRESETS_KEY, l.slice(0, 60));
            const now = () => ({...cleanCfg(c), name: '', seed: ''}), today = () => new Date().toISOString();
            const frame = U.presetsFrame({id: 'labyrinthe', what: 'les réglages du labyrinthe (forme, aspect, étapes, joueurs)', list: () => list().map(x => ({name: x.name, date: x.date})), quietApply: true,
                apply: i => { const x = list()[i]; if (!x) return false; setup = cleanCfg({...x.data, name: c.name, seed: L().newSeed()}); save(); renderSetup(ws, ctx); toast(`Réglages « ${x.name} » appliqués.`); return false; },
                save: name => { const l = list(), it = {name, date: today(), data: now()}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); put(l); },
                replace: i => { const l = list(); if (!l[i]) return false; l[i] = {...l[i], date: today(), data: now()}; put(l); },
                rename: (i, name) => { const l = list(); if (!l[i]) return false; l[i].name = name; put(l); },
                duplicate: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i + 1, 0, {name: U.freeName ? U.freeName(x.name, l.map(y => y.name)) : `${x.name} (copie)`, date: today(), data: x.data}); put(l); },
                exportOne: i => { const x = list()[i]; if (x) A().exportSettingFile?.('labyrinthe', x.name, {data: x.data}); return false; },
                remove: i => { const l = list(), x = l[i]; if (!x) return false; if (A().undoLocalChange) A().undoLocalChange(`Réglage « ${x.name} » supprimé`, [PRESETS_KEY], () => { l.splice(i, 1); put(l); }, () => frame.isConnected && frame.refresh()); else { l.splice(i, 1); put(l); } },
                importOne: async () => { const got = await A().importSettingFile?.('labyrinthe', {names: list().map(x => x.name), check: d => d && typeof d.data === 'object'}); if (!got) return false; const l = list(); l.push({name: got.nom, date: today(), data: {...cleanCfg(got.donnees.data), name: '', seed: ''}}); put(l); toast(`Réglage « ${got.nom} » importé : clique « Appliquer » pour t’en servir.`); },
            });
            slot.appendChild(frame);
        }
        // démarrer
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const btn = q('.lb-start'); if (btn.disabled) return;
            c.name = q('[name="name"]').value.trim().slice(0, 80);
            c.st.root = String(form.elements.root?.value || c.st.root || '').replace(/[^\d]/g, '');
            c.st.people = String(form.elements.people?.value || c.st.people || '').split(',').filter(x => /^\d+$/.test(x)).join(',');
            if (c.st.n && c.st.sub === 'root' && !c.st.root) return UI().fail ? UI().fail(q('[data-lb-root] .pk-field, [data-lb-root] input') || q('[name="sub"]'), 'Choisis la personne de départ.') : toast('Choisis la personne de départ.', 'error');
            if (c.st.n && c.st.kind === 'ancetres' && c.st.sub === 'people' && !c.st.people) return UI().fail ? UI().fail(q('[data-lb-people] .pk-field, [data-lb-people] input') || q('[name="sub"]'), 'Choisis au moins une personne.') : toast('Choisis au moins une personne.', 'error');
            if (gameCount() >= MAX_GAMES) return;
            btn.disabled = true; const label = btn.textContent; btn.textContent = 'Préparation…';
            try {
                const cfg = cleanCfg(c); if (!cfg.seed) cfg.seed = L().newSeed();
                const m = L().generate(mazeCfg(cfg));
                const got = await buildItems(cfg, cfg.seed);
                if (got.error) { q('[data-lb-sterr]').innerHTML = notice('error', got.error); const f = q('[data-lb-count] input'); f?.focus(); return; }
                const g = newGame(cfg, m, got.items);
                writeGame(g); save(); setup = null;
                ctx.open?.(g.id);
            } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
        }, sig);
    }
    function newGame(cfg, maze, items) {
        const stages = placeItems(maze, items, cfg, cfg.seed);
        const name = cfg.name || `Labyrinthe ${SHAPES.find(s => s[0] === cfg.shape)?.[2]?.toLowerCase() || ''} du ${new Date().toLocaleDateString('fr-FR')}`.replace(/\s+/g, ' ');
        return {id: `laby-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, created: Date.now(), cfg: {...cfg, name}, stages,
            players: cfg.players.map(p => ({...p, pos: maze.start, steps: 0, ms: 0, got: [], done: false, trail: [maze.start]})), turn: 0, finished: false, hints: 0, showSol: false};
    }

    /* ═════ La partie ═════ */
    let cur = null;
    const KEYSETS = [{ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]}, {KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0]}, {KeyI: [0, -1], KeyK: [0, 1], KeyJ: [-1, 0], KeyL: [1, 0]}, {Numpad8: [0, -1], Numpad5: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0]}];
    function render(ws, id, ctx) {
        const g = gameById(id); if (!g) return false;
        stop(); cur = new Game(ws, g, ctx); stopper = () => { cur?.destroy(); cur = null; };
        return true;
    }
    class Game {
        constructor(ws, g, ctx) {
            this.ws = ws; this.g = g; this.ctx = ctx || {}; this.ac = new AbortController(); this.paused = false; this.runAt = 0; this.saveT = 0; this.tick = 0; this.msgT = 0;
            this.cfg = cleanCfg(g.cfg); this.maze = L().generate(mazeCfg(this.cfg));
            const n = this.maze.cells.length; g.players.forEach(p => { if (!(p.pos >= 0 && p.pos < n)) p.pos = this.maze.start; });
            this.html(); this.paint(); this.bind();
            if (!g.finished) this.tick = setInterval(() => this.clock(), 250);
        }
        destroy() { this.ac.abort(); clearInterval(this.tick); this.pauseRun(); this.save(true); }
        get course() { return this.cfg.mode === 'course' && this.g.players.length > 1; }
        active() { return this.course ? this.g.players.filter(p => !p.done) : [this.g.players[this.g.turn]].filter(Boolean); }
        html() {
            const g = this.g, c = this.cfg, hintsOk = c.hints;
            this.ws.innerHTML = `<section class="goose-page lb-page lb-play"><header class="goose-head goose-game-head"><div><span class="eyebrow">${g.finished ? 'LABYRINTHE TERMINÉ' : 'LABYRINTHE EN COURS'} · ${esc(SHAPES.find(s => s[0] === c.shape)?.[2] || '')} · ${plural(this.maze.cells.length, 'case')}${g.stages.length ? ` · ${plural(g.stages.length, 'étape')}` : ''}</span><h2>${esc(g.name)}</h2><p>Graine <code>${esc(c.seed)}</code> : la même graine redonne ce labyrinthe.</p></div>
                <div class="page-actions"><button type="button" class="button small secondary" data-lb-new>＋ Nouvelle partie</button><button type="button" class="icon-button" data-lb-more aria-label="Plus d’actions" title="Plus d’actions">⋯</button></div></header>
                <div class="lb-game">
                  <div class="lb-board" data-lb-board tabindex="0" aria-label="Le labyrinthe : flèches ou Z Q S D pour avancer"><div class="lb-svg" data-lb-svg></div></div>
                  <aside class="lb-side">
                    <div class="lb-bar">
                      ${g.finished ? '' : `<button type="button" class="button small secondary" data-lb-pause data-shortcut="Espace" title="Pause (Espace)">⏸ Pause</button>`}
                      ${hintsOk && !g.finished ? '<button type="button" class="button small secondary" data-lb-hint title="Montre quelques cases du bon chemin (H)" data-shortcut="H">💡 Un indice</button>' : ''}
                      ${hintsOk ? `<button type="button" class="button small secondary" data-lb-sol aria-pressed="${!!g.showSol}">${g.showSol ? '🙈 Cacher la solution' : '👁 Montrer la solution'}</button>` : ''}
                      <button type="button" class="button small secondary" data-lb-print>🖨 Imprimer</button>
                      <button type="button" class="button small secondary" data-lb-export>⤓ Exporter ▾</button>
                    </div>
                    <div class="lb-players-st" data-lb-pst></div>
                    <div class="lb-live" aria-live="polite" data-lb-live></div>
                    <div class="lb-found" data-lb-found></div>
                    <div class="lb-end" data-lb-end></div>
                    <p class="muted lb-small lb-help">${this.course ? g.players.map((p, i) => `<b style="color:${esc(p.color)}">●</b> ${esc(p.name)} : ${['flèches', 'Z Q S D', 'I J K L', 'pavé 8 4 5 6'][i]}`).join(' · ') : 'Flèches ou Z Q S D · glisse le pion · Espace : pause'}${hintsOk ? ' · H : un indice' : ''}</p>
                  </aside>
                </div></section>`;
        }
        q(s) { return this.ws.querySelector(s); }
        svgEl() { return this.q('[data-lb-svg] svg'); }
        paint() {
            const g = this.g, c = this.cfg, m = this.maze;
            const showSol = g.showSol && c.hints;
            const svg = L().toSvg(m, {...look(c), solution: [], title: `Labyrinthe « ${g.name} »`});
            this.q('[data-lb-svg]').innerHTML = svg;
            const s = this.svgEl(), NS = 'http://www.w3.org/2000/svg', mk = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
            this.layers = {};
            ['trail', 'sol', 'hint', 'stages', 'pawns', 'fog'].forEach(k => { const e = mk('g', {class: `lb-l-${k}`}); s.appendChild(e); this.layers[k] = e; });
            this.mk = mk;
            this.drawTrail(); this.drawSol(showSol); this.drawStages(); this.drawPawns(); this.drawFog(); this.status(); if (g.finished) this.endHtml();
        }
        cell(id) { return this.maze.cells[id]; }
        drawTrail() {
            const L0 = this.layers.trail; L0.replaceChildren(); if (!this.cfg.trail) return;
            this.g.players.forEach(p => { const pts = (p.trail || []).map(i => this.cell(i)).filter(Boolean); if (pts.length < 2) return; L0.appendChild(this.mk('path', {d: L().ptsD(pts.map(c => [c.cx, c.cy])), fill: 'none', stroke: p.color, 'stroke-width': '.16', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '.35'})); });
        }
        targetsFor(p) { // ce qu'il reste à faire pour ce joueur : les étapes (dans l'ordre s'il est imposé), puis la sortie
            const left = this.g.stages.filter(s => !p.got.includes(s.cell));
            const ordered = this.cfg.st.order !== 'libre' ? left.sort((a, b) => a.n - b.n).map(s => s.cell) : L().greedyOrder(this.maze, p.pos, left.map(s => s.cell));
            return [...ordered, this.maze.end];
        }
        drawSol(on) {
            const L0 = this.layers.sol; L0.replaceChildren(); if (!on) return;
            const p = this.active()[0] || this.g.players[0]; const path = L().route(this.maze, [p.pos, ...this.targetsFor(p)]);
            if (path.length > 1) L0.appendChild(this.mk('path', {d: L().ptsD(path.map(i => [this.cell(i).cx, this.cell(i).cy])), fill: 'none', stroke: this.cfg.path || L().STYLES[this.cfg.style].path, 'stroke-width': '.2', 'stroke-dasharray': '.25 .2', 'stroke-linecap': 'round', opacity: '.9'}));
        }
        drawStages() {
            const L0 = this.layers.stages; L0.replaceChildren(); const p = this.active()[0] || this.g.players[0]; const next = this.nextOrdered(p);
            this.g.stages.forEach(s => { const c = this.cell(s.cell); const done = this.course ? this.g.players.every(x => x.got.includes(s.cell)) : p.got.includes(s.cell); const locked = !done && next && s.n && s.n !== next;
                const gr = this.mk('g', {transform: `translate(${c.cx} ${c.cy})`, opacity: done ? '.22' : locked ? '.55' : '1', class: 'lb-stage'});
                gr.appendChild(this.mk('circle', {r: '.4', fill: '#fff8d6', stroke: '#c9a227', 'stroke-width': '.06'}));
                const t = this.mk('text', {y: '.03', 'font-size': '.42', 'text-anchor': 'middle', 'dominant-baseline': 'middle'}); t.textContent = s.icon || '★'; gr.appendChild(t);
                if (s.n) { const t2 = this.mk('text', {x: '.33', y: '-.25', 'font-size': '.26', 'font-weight': '700', fill: '#7a5a00', 'text-anchor': 'middle'}); t2.textContent = String(s.n); gr.appendChild(t2); }
                L0.appendChild(gr); });
        }
        drawPawns() {
            const L0 = this.layers.pawns; L0.replaceChildren(); const act = new Set(this.active());
            this.g.players.forEach((p, i) => { if (!this.course && !act.has(p) && !p.done) return; if (!this.course && p.done && this.g.players.length > 1 && !this.g.finished) return;
                const c = this.cell(p.pos), off = this.g.players.length > 1 && this.course ? [[-.12, -.12], [.12, -.12], [-.12, .12], [.12, .12]][i] : [0, 0];
                const gr = this.mk('g', {class: `lb-pawn${act.has(p) ? ' is-on' : ''}`, 'data-p': String(i), style: `transform: translate(${c.cx + off[0]}px, ${c.cy + off[1]}px)`});
                gr.appendChild(this.mk('circle', {r: this.course ? '.27' : '.32', fill: p.color, stroke: '#fff', 'stroke-width': '.07'}));
                L0.appendChild(gr); });
        }
        drawFog() {
            const L0 = this.layers.fog; L0.replaceChildren(); if (!this.cfg.fog || this.g.finished) return;
            const [x0, y0, x1, y1] = this.maze.box, id = `lb-fog-${this.g.id.replace(/\W/g, '')}`;
            const mask = this.mk('mask', {id}); mask.appendChild(this.mk('rect', {x: x0 - 2, y: y0 - 2, width: x1 - x0 + 4, height: y1 - y0 + 4, fill: '#fff'}));
            this.active().forEach(p => { const c = this.cell(p.pos); mask.appendChild(this.mk('circle', {cx: c.cx, cy: c.cy, r: String(this.cfg.fogR + .5), fill: '#000'})); });
            L0.appendChild(mask); L0.appendChild(this.mk('rect', {x: x0 - 2, y: y0 - 2, width: x1 - x0 + 4, height: y1 - y0 + 4, fill: '#15171c', opacity: '.94', mask: `url(#${id})`}));
        }
        nextOrdered(p) { if (this.cfg.st.order === 'libre') return 0; const left = this.g.stages.filter(s => !p.got.includes(s.cell)).sort((a, b) => a.n - b.n); return left[0]?.n || 0; }
        status() {
            const g = this.g, act = new Set(this.active()), tot = g.stages.length;
            this.q('[data-lb-pst]').innerHTML = g.players.map((p, i) => `<div class="lb-pcard${act.has(p) && !g.finished ? ' is-turn' : ''}${p.done ? ' is-done' : ''}"><span class="lb-dot" style="--pawn:${esc(p.color)}" aria-hidden="true"></span><b>${esc(p.name)}</b>${!this.course && g.players.length > 1 && act.has(p) && !g.finished ? ' <small class="lb-tag">à toi</small>' : ''}${p.done ? ' <small class="lb-tag is-ok">🏁 arrivé</small>' : ''}
                <span class="lb-stats"><span data-lb-time="${i}">⏱ ${fmtTime(p.ms)}</span><span>👣 ${plural(p.steps, 'pas', 'pas')}</span>${tot ? `<span>★ ${p.got.length}/${tot}</span>` : ''}</span></div>`).join('');
            const pb = this.q('[data-lb-pause]'); if (pb) pb.textContent = this.paused ? '▶ Reprendre' : '⏸ Pause';
            this.q('[data-lb-board]').classList.toggle('is-paused', this.paused);
        }
        clock() {
            if (this.paused || this.g.finished || !this.runAt) return;
            const now = performance.now(), dt = now - this.runAt; this.runAt = now;
            this.active().forEach(p => { p.ms += dt; });
            this.g.players.forEach((p, i) => { const el = this.q(`[data-lb-time="${i}"]`); if (el) el.textContent = `⏱ ${fmtTime(p.ms)}`; });
            this.save();
        }
        startRun() { if (!this.runAt && !this.paused && !this.g.finished) this.runAt = performance.now(); }
        pauseRun() { if (this.runAt) { this.clock(); this.runAt = 0; } }
        save(now = false) { clearTimeout(this.saveT); if (this.removed) return; const go = () => { if (!this.removed) writeGame(this.g); }; if (now) go(); else this.saveT = setTimeout(go, 400); }
        say(text, kind = '') { const el = this.q('[data-lb-live]'); if (!el) return; el.textContent = text; el.className = `lb-live ${kind ? 'is-' + kind : ''}`; clearTimeout(this.msgT); this.msgT = setTimeout(() => { if (el.isConnected) { el.textContent = ''; el.className = 'lb-live'; } }, 3500); }
        /** avancer d'une case dans une direction (vecteur écran) : la case reliée qui va le plus dans ce sens */
        step(p, dx, dy) {
            if (this.g.finished || p.done || this.paused) return false;
            const c = this.cell(p.pos); let best = -1, bd = .35;
            for (const x of this.maze.links[p.pos]) { const o = this.cell(x), vx = o.cx - c.cx, vy = o.cy - c.cy, l = Math.hypot(vx, vy) || 1, d = (vx * dx + vy * dy) / l; if (d > bd) { bd = d; best = x; } }
            if (best < 0) { this.bump(p); return false; }
            this.moveTo(p, best); return true;
        }
        moveTo(p, to) {
            this.startRun(); p.pos = to; p.steps++; if (this.cfg.trail) { p.trail.push(to); if (p.trail.length > 4000) p.trail.splice(0, p.trail.length - 4000); }
            const st = this.g.stages.find(s => s.cell === to);
            if (st && !p.got.includes(to)) {
                const next = this.nextOrdered(p);
                if (next && st.n !== next) this.say(`D’abord l’étape ${next}, puis celle-ci (la ${st.n}).`, 'warn');
                else { p.got.push(to); this.found(st, p); }
            }
            if (to === this.maze.end) this.arrive(p);
            this.drawPawns(); this.drawTrail(); this.drawFog(); this.drawStages(); if (this.g.showSol) this.drawSol(true); this.status(); this.save();
        }
        bump(p) { const el = this.layers.pawns.querySelector(`[data-p="${this.g.players.indexOf(p)}"]`); if (!el || calm()) return; el.classList.remove('is-bump'); void el.getBBox(); el.classList.add('is-bump'); }
        found(st, p) {
            const box = this.q('[data-lb-found]'), U = UI();
            const pic = st.kind === 'person' ? (U.avatar ? U.avatar({id: st.pid, first_name: st.first, last_name: st.last, gender: st.g, photo: st.photo, sosa: st.sosa}, 48) : `<span class="lb-ico">👤</span>`) : st.thumb ? `<img src="${esc(st.thumb)}" alt="" loading="lazy">` : `<span class="lb-ico">${esc(st.icon)}</span>`;
            box.innerHTML = `<div class="lb-card"><span class="eyebrow">${this.course ? `${esc(p.name)} a trouvé` : 'Trouvé !'}${st.n ? ` · étape ${st.n}` : ''}</span><div class="lb-card-in">${pic}<div><b>${esc(st.title)}</b>${st.sosa ? ` ${U.badge ? U.badge(`Sosa ${st.sosa}`, 'sosa') : ''}` : ''}<small>${esc(st.sub || '')}</small></div></div></div>`;
            const left = this.g.stages.length - p.got.length;
            this.say(`★ ${st.title}${left ? ` — encore ${plural(left, 'étape')}` : ' — tout est ramassé : file à la sortie 🏁'}`, 'ok');
        }
        arrive(p) {
            const left = this.g.stages.length - p.got.length;
            if (left && this.cfg.st.needAll) { this.say(`🏁 La sortie est fermée : il te reste ${plural(left, 'étape')} à ramasser.`, 'warn'); return; }
            p.done = true; this.pauseRunFor(p);
            if (this.course) { const rank = this.g.players.filter(x => x.done).length; this.say(`🏁 ${p.name} arrive ${rank === 1 ? 'en premier !' : `${rank}ᵉ`}`, 'ok'); if (this.g.players.every(x => x.done)) this.finish(); return; }
            const next = this.g.players.findIndex((x, i) => i > this.g.turn && !x.done);
            if (next >= 0) { this.g.turn = next; this.runAt = 0; this.say(`🏁 ${p.name} est sorti en ${fmtTime(p.ms)}. À ${this.g.players[next].name} !`, 'ok'); this.g.showSol = false; this.drawSol(false); }
            else this.finish();
        }
        pauseRunFor() { this.clock(); if (!this.active().length) this.runAt = 0; }
        finish() {
            const g = this.g; g.finished = true; this.runAt = 0; clearInterval(this.tick); this.save(true);
            this.html(); this.paint(); this.bind(true); this.ctx.renderSidebar?.();
        }
        endHtml() {
            const g = this.g, U = UI(), ranked = [...g.players].sort((a, b) => (b.done - a.done) || (a.ms - b.ms) || (a.steps - b.steps));
            const met = g.stages.map(s => `<li><span>${esc(s.icon)}</span><div><b>${esc(s.title)}</b><small>${esc(s.sub || '')}</small></div>${s.pid ? `<button type="button" class="button small secondary" data-lb-person="${Number(s.pid)}">↗ Fiche</button>` : ''}</li>`).join('');
            this.q('[data-lb-end]').innerHTML = `<div class="lb-endbox"><h3>🏁 Bravo !</h3>
                <table class="data-table lb-score"><thead><tr><th>Joueur</th><th>Temps</th><th>Pas</th>${g.stages.length ? '<th>Étapes</th>' : ''}</tr></thead><tbody>${ranked.map((p, i) => `<tr><td><span class="lb-dot" style="--pawn:${esc(p.color)}"></span> ${g.players.length > 1 ? `${i + 1}. ` : ''}${esc(p.name)}</td><td>${p.done ? fmtTime(p.ms) : '—'}</td><td>${p.steps}</td>${g.stages.length ? `<td>${p.got.length}/${g.stages.length}</td>` : ''}</tr>`).join('')}</tbody></table>
                ${g.hints ? `<p class="muted lb-small">${plural(g.hints, 'indice demandé', 'indices demandés')}.</p>` : ''}
                ${met ? `<h4>Rencontrés en chemin</h4><ul class="lb-met">${met}</ul>` : ''}
                <div class="lb-endacts"><button type="button" class="button" data-lb-again>↺ Rejouer le même</button><button type="button" class="button secondary" data-lb-other>🎲 Un autre</button><button type="button" class="button secondary" data-lb-edit>✎ Changer les réglages</button></div></div>`;
            void U;
        }
        hint() {
            if (!this.cfg.hints || this.g.finished) return; const p = this.active()[0]; if (!p) return;
            const path = L().route(this.maze, [p.pos, ...this.targetsFor(p)]).slice(1, 7); this.g.hints++;
            const L0 = this.layers.hint; L0.replaceChildren();
            path.forEach((i, k) => { const c = this.cell(i); L0.appendChild(this.mk('circle', {cx: c.cx, cy: c.cy, r: String(.16 - k * .012), fill: '#f5b400', class: 'lb-hintdot', style: `animation-delay:${k * 80}ms`})); });
            clearTimeout(this.hintT); this.hintT = setTimeout(() => L0.replaceChildren(), 3000);
            this.say('💡 Suis les points jaunes.', 'ok'); this.save();
        }
        restart(newSeed) {
            const c = cleanCfg(this.g.cfg); if (newSeed) c.seed = L().newSeed();
            const go = async () => {
                const m = L().generate(mazeCfg(c)); let stages = this.g.stages;
                if (newSeed && c.st.n) { const got = await buildItems(c, c.seed); stages = got.error ? [] : placeItems(m, got.items, c, c.seed); if (got.error) toast(got.error, 'error'); }
                Object.assign(this.g, {cfg: c, stages, finished: false, turn: 0, hints: 0, showSol: false, players: c.players.map(p => ({...p, pos: m.start, steps: 0, ms: 0, got: [], done: false, trail: [m.start]}))});
                writeGame(this.g); this.ctx.open?.(this.g.id);
            };
            go();
        }
        exportMenu(btn) {
            const name = (this.g.name || 'labyrinthe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40) || 'labyrinthe';
            const svgText = (sol) => L().toSvg(this.maze, {...look(this.cfg), solution: sol ? L().route(this.maze, [this.maze.start, ...this.targetsFor({pos: this.maze.start, got: []})]) : [], stages: this.g.stages.map(s => ({cell: s.cell, icon: s.icon, n: s.n})), title: this.g.name, px: 40});
            const dl = (blob, fn) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
            const png = async sol => { const txt = svgText(sol), img = new Image(), url = URL.createObjectURL(new Blob([txt], {type: 'image/svg+xml'})); await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
                const k = Math.min(1, 4000 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
                cv.toBlob(b => b && dl(b, `${name}${sol ? '-solution' : ''}.png`), 'image/png'); };
            const items = [{icon: '🖼', label: 'Image PNG', run: () => png(false)}, {icon: '🖼', label: 'Image PNG avec la solution', run: () => png(true)}, '-', {icon: '✒️', label: 'Dessin SVG', run: () => dl(new Blob([svgText(false)], {type: 'image/svg+xml'}), `${name}.svg`)}, {icon: '✒️', label: 'Dessin SVG avec la solution', run: () => dl(new Blob([svgText(true)], {type: 'image/svg+xml'}), `${name}-solution.svg`)}];
            if (UI().menuAt) UI().menuAt(btn, items, {title: '⤓ Exporter'}); else items[0].run();
        }
        print() {
            const m = this.maze, c = this.cfg, st = this.g.stages.map(s => ({cell: s.cell, icon: s.icon, n: s.n}));
            const sol = L().route(m, [m.start, ...this.targetsFor({pos: m.start, got: []})]);
            const legend = this.g.stages.length ? `<ol class="lb-pr-legend">${this.g.stages.slice().sort((a, b) => (a.n || 0) - (b.n || 0)).map(s => `<li>${esc(s.icon)} <b>${esc(s.title)}</b>${s.sub ? ` — ${esc(s.sub)}` : ''}</li>`).join('')}</ol>` : '';
            const page = (title, svg) => `<section class="lb-pr-page"><h2>${esc(title)}</h2><div class="lb-pr-svg">${svg}</div></section>`;
            const html = `<style>.lb-pr-page{break-after:page;page-break-after:always}.lb-pr-page:last-child{break-after:auto;page-break-after:auto}.lb-pr-svg svg{width:100%;height:auto;max-height:23cm}h2{font:700 18px system-ui;margin:0 0 8px}.lb-pr-legend{font:12px system-ui;columns:2}</style>
                ${page(this.g.name, L().toSvg(m, {...look(c), stages: st, title: this.g.name}))}${legend ? `<section>${legend}</section>` : ''}${page(`${this.g.name} — la solution`, L().toSvg(m, {...look(c), stages: st, solution: sol, title: 'La solution'}))}`;
            if (UI().openPrintDialog) UI().openPrintDialog({title: `Labyrinthe « ${this.g.name} »`, html, photos: false});
        }
        bind(rebind = false) {
            if (rebind) { this.ac.abort(); this.ac = new AbortController(); }
            const sig = {signal: this.ac.signal}, ws = this.ws, board = this.q('[data-lb-board]');
            ws.addEventListener('click', e => {
                const b = e.target.closest('button'); if (!b || !ws.contains(b)) return;
                if (b.matches('[data-lb-new]')) return this.ctx.newGame?.();
                if (b.matches('[data-lb-pause]')) return this.togglePause();
                if (b.matches('[data-lb-hint]')) return this.hint();
                if (b.matches('[data-lb-sol]')) { this.g.showSol = !this.g.showSol; b.setAttribute('aria-pressed', String(this.g.showSol)); b.textContent = this.g.showSol ? '🙈 Cacher la solution' : '👁 Montrer la solution'; this.drawSol(this.g.showSol); this.save(); return; }
                if (b.matches('[data-lb-print]')) return this.print();
                if (b.matches('[data-lb-export]')) return this.exportMenu(b);
                if (b.matches('[data-lb-again]')) return this.restart(false);
                if (b.matches('[data-lb-other]')) return this.restart(true);
                if (b.matches('[data-lb-edit]')) { setup = cleanCfg({...this.g.cfg, seed: L().newSeed()}); this.ctx.newGame?.(); return; }
                if (b.dataset.lbPerson) { const A0 = A(); A0.state.currentPersonId = Number(b.dataset.lbPerson); A0.setModule?.('personnes'); return; }
                if (b.matches('[data-lb-more]')) {
                    const items = [{icon: '↺', label: 'Recommencer ce labyrinthe', run: () => this.restart(false)}, {icon: '🎲', label: 'Un autre labyrinthe (mêmes réglages)', run: () => this.restart(true)}, {icon: '✎', label: 'Changer les réglages', run: () => { setup = cleanCfg({...this.g.cfg, seed: L().newSeed()}); this.ctx.newGame?.(); }}, '-',
                        {icon: '🗑', label: 'Supprimer cette partie', danger: true, run: () => this.remove()}];
                    UI().menuAt ? UI().menuAt(b, items, {title: `« ${this.g.name} »`}) : this.remove();
                }
            }, sig);
            document.addEventListener('keydown', e => {
                if (!board.isConnected) return; if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
                if (e.target.closest?.('input, textarea, select, [contenteditable="true"], dialog') || document.querySelector('dialog[open]')) return;
                if (e.code === 'Space') { if (this.g.finished) return; e.preventDefault(); this.togglePause(); return; }
                if (e.code === 'KeyH' && this.cfg.hints) { e.preventDefault(); this.hint(); return; }
                const act = this.active(); if (!act.length || this.g.finished) return;
                if (this.course) { for (let i = 0; i < this.g.players.length; i++) { const d = KEYSETS[i]?.[e.code]; if (d) { e.preventDefault(); const p = this.g.players[i]; if (!p.done) this.step(p, d[0], d[1]); return; } } return; }
                const d = KEYSETS[0][e.code] || KEYSETS[1][e.code]; if (d) { e.preventDefault(); this.step(act[0], d[0], d[1]); }
            }, sig);
            // au doigt / à la souris : on glisse le pion de case en case
            let drag = null;
            const at = e => { const s = this.svgEl(); const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const r = pt.matrixTransform(s.getScreenCTM().inverse()); return [r.x, r.y]; };
            board.addEventListener('pointerdown', e => {
                if (this.g.finished || this.paused) return; const [x, y] = at(e); const act = this.active(); if (!act.length) return;
                const p = act.reduce((b, q) => { const c = this.cell(q.pos), cb = this.cell(b.pos); return Math.hypot(c.cx - x, c.cy - y) < Math.hypot(cb.cx - x, cb.cy - y) ? q : b; }, act[0]);
                drag = {p, id: e.pointerId}; board.setPointerCapture?.(e.pointerId); this.dragTo(p, x, y); board.focus({preventScroll: true});
            }, sig);
            board.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const [x, y] = at(e); this.dragTo(drag.p, x, y); }, sig);
            const up = () => { drag = null; }; board.addEventListener('pointerup', up, sig); board.addEventListener('pointercancel', up, sig);
            document.addEventListener('visibilitychange', () => { if (document.hidden && !this.paused && this.runAt) this.togglePause(); }, sig);
            window.addEventListener('pagehide', () => this.save(true), sig);
        }
        dragTo(p, x, y) {
            for (let k = 0; k < 4; k++) {
                const c = this.cell(p.pos); if (Math.hypot(c.cx - x, c.cy - y) < .55) return;
                let best = -1, bd = Math.hypot(c.cx - x, c.cy - y);
                for (const n of this.maze.links[p.pos]) { const o = this.cell(n), d = Math.hypot(o.cx - x, o.cy - y); if (d < bd) { bd = d; best = n; } }
                if (best < 0 || p.done || this.g.finished) return; this.moveTo(p, best);
            }
        }
        togglePause() { if (this.g.finished) return; if (this.paused) { this.paused = false; this.say('C’est reparti !'); } else { this.pauseRun(); this.paused = true; this.say('⏸ En pause — Espace pour reprendre.'); } this.status(); this.save(); }
        async remove() {
            const ok = !A().confirmBox || await A().confirmBox('Le labyrinthe et la progression des joueurs seront supprimés.', {title: `Supprimer « ${this.g.name} » ?`, okLabel: 'Supprimer la partie', danger: true});
            if (!ok) return; this.removed = true; clearTimeout(this.saveT); saveGames(games().filter(x => x.id !== this.g.id)); toast(`« ${this.g.name} » est supprimé.`); this.ctx.newGame?.();
        }
    }

    /* ═════ Colonne de gauche ═════ */
    function sidebarHtml(active) {
        const list = games(); if (!list.length) return '';
        return list.map(g => { const tot = g.stages?.length || 0, p = g.players?.[0] || {}, best = Math.min(...(g.players || []).filter(x => x.done).map(x => x.ms), Infinity);
            return `<button class="side-button lb-side ${g.id === active ? 'is-active' : ''}" type="button" data-lb-open="${esc(g.id)}" title="Reprendre ce labyrinthe"><strong>🌀 ${esc(g.name)}</strong><small>Labyrinthe · ${esc(SHAPES.find(s => s[0] === g.cfg?.shape)?.[2] || '')}${tot ? ` · ${plural(tot, 'étape')}` : ''}</small><small>${g.finished ? `🏁 terminé${isFinite(best) ? ` en ${fmtTime(best)}` : ''}` : `⏱ ${fmtTime(p.ms)} · ${plural(p.steps || 0, 'pas', 'pas')}`}</small></button>`; }).join('');
    }
    function bindSidebar(content, ctx, signal) { content.querySelectorAll('[data-lb-open]').forEach(b => b.addEventListener('click', () => ctx.open?.(b.dataset.lbOpen), signal ? {signal} : undefined)); }

    window.LCNDA_LABY = {owns, renderSetup, render, sidebarHtml, bindSidebar, stop, gameCount, TITLE, cleanCfg, READY,
        /** oublie la préparation en cours (elle repart des derniers réglages gardés) */
        resetSetup: () => { setup = null; },
        /** pour les tests : l'état de la partie ouverte */
        debug: () => cur ? {id: cur.g.id, start: cur.maze.start, end: cur.maze.end, cells: cur.maze.cells.length, solution: L().route(cur.maze, [cur.active()[0]?.pos ?? cur.maze.start, ...cur.targetsFor(cur.active()[0] || {pos: cur.maze.start, got: []})]),
            players: cur.g.players.map(p => ({pos: p.pos, steps: p.steps, got: p.got.length, done: p.done, ms: p.ms})), stages: cur.g.stages.map(s => ({cell: s.cell, n: s.n, title: s.title, kind: s.kind, pid: s.pid || 0})), finished: cur.g.finished,
            neighbors: id => cur.maze.links[id].map(n => ({id: n, dx: cur.maze.cells[n].cx - cur.maze.cells[id].cx, dy: cur.maze.cells[n].cy - cur.maze.cells[id].cy}))} : null,
    };
})();
