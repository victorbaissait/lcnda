/* LCNDA — 🧩 Puzzle, le 4e jeu de l'outil « Jeu » (branché dans app-jeu.js).
 *
 *  - l'image vient de la base (fenêtre unique openMediaPicker : importer et coller y sont déjà), d'une fiche (menu de
 *    choix des personnes → sa photo de fiche) ou de la zone « 📁 Glisse une image ici » (E4 : elle entre dans les médias) ;
 *  - nombre de pièces au choix, grille adaptée à la forme de l'image ; vraies formes (tenons et mortaises) ou carrés ;
 *  - tout est dessiné sur un seul Canvas : chaque pièce est découpée une fois pour toutes dans une petite image (sprite),
 *    puis on ne fait que la recopier. Pendant qu'on tire une pièce, le reste de la table est figé dans une image :
 *    à chaque mouvement on ne redessine que le groupe tiré (fluide à 1000 pièces) ;
 *  - chrono en temps réel (pause quand l'onglet est caché ou avec ⏸ / Espace, image floutée en pause), record par image
 *    et par nombre de pièces, historique des puzzles terminés ;
 *  - parties, historique et records rangés dans la base de la généalogie (lib/puzzle.php) : enregistrement tout seul
 *    (2,5 s après le dernier coup, au plus toutes les 10 s, à la pause, en quittant l'écran ou la page), « 💾 Enregistrer »
 *    (⌘S), « ✓ Enregistré » dans la barre ; si le serveur ne répond pas, secours dans ce navigateur, renvoyé ensuite.
 *
 *  API (window.LCNDA_PUZZLE) : owns(id), renderSetup(workspace, ctx), render(workspace, id, ctx), sidebarHtml(activeId),
 *  bindSidebar(content, ctx, signal), gameCount(), debug() (pour les tests).
 */
(() => {
    'use strict';
    const APP = () => window.LCNDA_APP || {};
    const PK = () => window.LCNDA_PICKER || window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => { try { (APP().toast || (x => console.info(x)))(m, k, o); } catch (_) {} };
    const plural = (n, one, many) => { try { if (APP().plural) return APP().plural(n, one, many); } catch (_) {} return `${n} ${n > 1 ? (many || one + 's') : one}`; };
    const notice = (kind, text) => (UI().notice ? UI().notice(kind, text) : `<p class="pz-msg">${esc(text)}</p>`);
    const num = n => Number(n || 0).toLocaleString('fr-FR');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const p2 = n => String(n).padStart(2, '0');
    /** mm:ss, puis h:mm:ss */
    const fmtTime = ms => { const s = Math.floor(Math.max(0, Number(ms) || 0) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return h ? `${h}:${p2(m)}:${p2(x)}` : `${p2(m)}:${p2(x)}`; };

    const TITLE = 'Jeu de l’oie / Serpents et échelles / Petits chevaux / Puzzle';
    const PREFS_KEY = 'lcnda_puzzle-prefs-v1';
    const MAX_GAMES = 30, MIN_PIECES = 4, MAX_PIECES = 1000;
    const COUNTS = [12, 24, 48, 100, 150, 300, 500, 1000];
    const SAVE_QUIET_MS = 2500, SAVE_EVERY_MS = 10000; // enregistrement : 2,5 s après le dernier coup, au plus toutes les 10 s

    // ── mémoire du navigateur : réglages, et secours quand le serveur ne répond pas ──
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
        del(k) { try { localStorage.removeItem(k); } catch (_) {} },
    };
    const recordKey = meta => `${meta.image?.key || meta.image?.url || ''}|${meta.cols * meta.rows}`;
    const prefs = () => ({count: 48, shape: 'jigsaw', rotate: false, model: true, ...(store.get(PREFS_KEY, {}) || {})});
    const owns = id => /^puz-/.test(String(id || ''));
    const newId = () => `puz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    /* ═════ Les parties sont rangées dans la base de la généalogie (lib/puzzle.php) ═════
     * GET puzzle → la liste (en cours, terminées, records) ; GET puzzle&uid → une partie avec ses pièces ;
     * POST puzzle_write {op: save | finish | delete}. Pas de passage par api() d'app.js : chaque écriture y relance le
     * compte des personnes et prévient tout l'écran (lcnda:data-changed), inutile pour un jeu qui s'enregistre souvent.
     * Si le serveur ne répond pas (ou en mode consultation), le dernier état non envoyé est gardé dans ce navigateur
     * (« lcnda_puzzle-pending-v2:<base> », une entrée par partie) et renvoyé dès que possible. */
    const LEGACY = {games: 'lcnda_puzzle-games-v1', state: 'lcnda_puzzle-state-v1:', history: 'lcnda_puzzle-history-v1', records: 'lcnda_puzzle-records-v1'};
    const BASE_KEY = 'lcnda_puzzle-base-v2', PENDING_PREFIX = 'lcnda_puzzle-pending-v2:', LIST_PREFIX = 'lcnda_puzzle-list-v2:';
    const C = {loaded: false, loading: null, offline: false, kiosk: false, base: store.get(BASE_KEY, '') || '', games: [], history: [], records: {}, listeners: new Set()};
    const pendingKey = () => PENDING_PREFIX + (C.base || 'x');
    const pendingAll = () => { const v = store.get(pendingKey(), {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
    function pendingPut(p) {
        const all = pendingAll(), old = all[p.uid];
        if (old && old.op === 'finish' && p.op !== 'finish') return; // une partie finie ne redevient pas « en cours »
        const merged = old && p.op === 'save' && old.op === 'save' ? {...old, ...p, meta: {...(old.meta || {}), ...(p.meta || {})}, state: p.state || old.state} : p;
        all[p.uid] = merged; store.set(pendingKey(), all);
    }
    function pendingDrop(uid, ts) { const all = pendingAll(); if (all[uid] && (!ts || Number(all[uid].saved_at || 0) <= ts)) { delete all[uid]; store.set(pendingKey(), all); } }
    const csrf = () => APP().state?.csrf || window.INSTALL_CSRF || '';
    async function send(body, {keepalive = false} = {}) {
        let r;
        try { r = await fetch('api.php?action=puzzle_write', {method: 'POST', keepalive, headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf()}, body: JSON.stringify({...body, csrf: csrf()})}); }
        catch (e) { const x = new Error('Pas de connexion avec LCNDA : la partie est gardée dans ce navigateur.'); x.network = true; throw x; }
        const d = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || d.error) { const x = new Error(d.error || `Erreur ${r.status}`); x.status = r.status; x.kiosk = r.status === 423; x.network = r.status >= 500 || r.status === 419; throw x; }
        C.offline = false; return d;
    }
    const notify = () => C.listeners.forEach(f => { try { f(); } catch (_) {} });
    /** Applique localement ce qu'on vient d'enregistrer (la colonne de gauche suit sans relire le serveur). */
    function cachePut(meta, status = 'playing') {
        C.games = C.games.filter(g => g.id !== meta.id); C.history = C.history.filter(g => g.id !== meta.id);
        if (status === 'playing') C.games.unshift(meta); else if (status === 'done') C.history.unshift(meta);
        store.set(LIST_PREFIX + (C.base || 'x'), {games: C.games.map(g => ({...g, image: g.image?.url?.startsWith('data:') ? {...g.image, url: ''} : g.image})), history: C.history.slice(0, 100), records: C.records});
    }
    /** Un envoi : réussi → oublié du secours ; refusé définitivement (422) → oublié aussi ; sinon gardé pour plus tard. */
    async function push(p, opts = {}) {
        try {
            const d = await send(p, opts); pendingDrop(p.uid, Number(p.saved_at || 0)); C.kiosk = false;
            if (Object.keys(pendingAll()).length) setTimeout(flushPending, 50);
            return {ok: true, d};
        } catch (e) {
            if (e.status === 422 || e.status === 404) { pendingDrop(p.uid); return {ok: false, refused: true, error: e}; }
            pendingPut(p); if (e.kiosk) C.kiosk = true; else C.offline = true; schedulePendingRetry();
            return {ok: false, error: e};
        }
    }
    let retryT = 0, flushing = false;
    function schedulePendingRetry() { if (!retryT) retryT = setTimeout(() => { retryT = 0; flushPending(); }, 20000); }
    async function flushPending() {
        if (flushing) return; flushing = true;
        try {
            for (const [k, p] of Object.entries(pendingAll())) {
                if (!p || typeof p !== 'object' || !owns(p.uid)) { const all = pendingAll(); delete all[k]; store.set(pendingKey(), all); continue; } // entrée abîmée : jetée
                try { await send(p); pendingDrop(p.uid, Number(p.saved_at || 0)); }
                catch (e) { if (e.status === 422 || e.status === 404) pendingDrop(p.uid); else { if (e.kiosk) C.kiosk = true; else C.offline = true; schedulePendingRetry(); break; } }
            }
        } finally { flushing = false; notify(); }
    }
    window.addEventListener('online', () => flushPending());

    /** Les anciennes parties gardées dans le navigateur (avant l'enregistrement dans la base) : reprises une fois, puis effacées. */
    async function adoptLegacy() {
        const g0 = store.get(LEGACY.games, null), h0 = store.get(LEGACY.history, null);
        if (!Array.isArray(g0) && !Array.isArray(h0)) return 0;
        let n = 0, failed = false;
        for (const g of (Array.isArray(g0) ? g0 : [])) {
            if (!g || !owns(g.id)) continue;
            const st = store.get(LEGACY.state + g.id, null);
            if (!st) continue;
            try { await send({op: 'save', uid: g.id, meta: g, state: st, saved_at: Number(g.updatedAt) || Date.now()}); n++; }
            catch (e) { if (e.status !== 422) { failed = true; break; } }
        }
        for (const h of (failed ? [] : Array.isArray(h0) ? h0.slice().reverse() : [])) {
            if (!h || !owns(h.id)) continue;
            try { await send({op: 'finish', uid: h.id, meta: h, time: Number(h.time) || Number(h.elapsed) || 0, saved_at: Number(h.finishedAt) || Date.now()}); n++; }
            catch (e) { if (e.status !== 422) { failed = true; break; } }
        }
        if (failed) return -1;
        try { Object.keys(localStorage).filter(k => k.startsWith(LEGACY.state)).forEach(k => store.del(k)); } catch (_) {}
        [LEGACY.games, LEGACY.history, LEGACY.records].forEach(k => store.del(k));
        return n;
    }
    /** Relit la liste dans la base (une seule requête à la fois). Serveur muet : la dernière liste connue + le secours. */
    function loadAll(force = false) {
        if (C.loading && !force) return C.loading;
        C.loading = (async () => {
            try {
                let r = await fetch('api.php?action=puzzle', {headers: {Accept: 'application/json'}});
                let d = await r.json();
                if (!r.ok || d.error) throw Object.assign(new Error(d.error || 'Erreur'), {status: r.status});
                if (d.base && d.base !== C.base) {
                    const orphan = store.get(PENDING_PREFIX + 'x', null); // envoyé hors ligne avant de connaître la base
                    C.base = d.base; store.set(BASE_KEY, d.base);
                    if (orphan && typeof orphan === 'object') { Object.values(orphan).forEach(pendingPut); store.del(PENDING_PREFIX + 'x'); }
                }
                C.offline = false;
                const hadPending = Object.keys(pendingAll()).length > 0;
                if (hadPending) await flushPending();
                const adopted = await adoptLegacy();
                if (adopted > 0 || hadPending) { r = await fetch('api.php?action=puzzle', {headers: {Accept: 'application/json'}}); d = await r.json(); }
                C.games = Array.isArray(d.games) ? d.games.filter(g => g && owns(g.id)) : []; C.history = Array.isArray(d.history) ? d.history.filter(g => g && owns(g.id)) : []; C.records = d.records && typeof d.records === 'object' ? {...d.records} : {};
                if (adopted > 0) toast(`🧩 ${plural(adopted, 'partie de puzzle rangée', 'parties de puzzle rangées')} dans la base de la généalogie.`, 'success');
            } catch (e) {
                C.offline = true;
                const l = store.get(LIST_PREFIX + (C.base || 'x'), null);
                if (l && typeof l === 'object' && !C.loaded) { const ok = a => (Array.isArray(a) ? a.filter(g => g && typeof g === 'object' && owns(g.id)) : []); C.games = ok(l.games); C.history = ok(l.history); C.records = l.records && typeof l.records === 'object' ? {...l.records} : {}; }
            }
            // ce qui n'est pas encore parti (hors ligne) se voit quand même
            for (const p of Object.values(pendingAll())) {
                if (!p || typeof p !== 'object' || !owns(p.uid)) continue;
                if (p.op === 'save' && p.meta?.image && !C.games.some(g => g.id === p.uid) && !C.history.some(g => g.id === p.uid)) C.games.unshift({...p.meta, id: p.uid});
                if (p.op === 'delete') { C.games = C.games.filter(g => g.id !== p.uid); C.history = C.history.filter(g => g.id !== p.uid); }
            }
            C.loaded = true; C.loading = null; notify();
            return C;
        })();
        return C.loading;
    }
    /** Une partie avec ses pièces : la base, sauf si ce navigateur a plus récent (pas encore envoyé). */
    async function loadGame(uid) {
        const p = pendingAll()[uid];
        let g = null, err = null;
        try {
            const r = await fetch('api.php?action=puzzle&uid=' + encodeURIComponent(uid), {headers: {Accept: 'application/json'}});
            const d = await r.json();
            if (r.status === 404) err = Object.assign(new Error(d.error || 'Partie introuvable.'), {status: 404});
            else if (!r.ok || d.error) throw new Error(d.error || 'Erreur');
            else g = d.game;
        } catch (e) { err = err || Object.assign(e, {network: true}); C.offline = true; }
        if (p && p.op === 'save' && (!g || Number(p.saved_at || 0) > Number(g.saved_at || 0)) && (g || p.meta?.image) && p.state) {
            return {uid, status: 'playing', meta: {...(g?.meta || {}), ...p.meta, id: uid}, state: p.state, saved_at: p.saved_at, local: true};
        }
        if (p && p.op === 'finish' && (!g || g.status !== 'done')) return {uid, status: 'done', meta: {...(g?.meta || {}), ...p.meta, id: uid, time: p.time}, state: null, local: true};
        if (g) return g;
        throw err || new Error('Partie introuvable.');
    }
    const gameCount = () => C.games.length;
    // ── calculs de la grille ──
    /** Nombre de pièces demandé → colonnes × lignes, pièces presque carrées, total le plus proche. */
    function gridFor(n, w, h) {
        n = clamp(Math.round(Number(n) || 0), MIN_PIECES, MAX_PIECES); w = Math.max(1, Number(w) || 4); h = Math.max(1, Number(h) || 3);
        let best = null;
        for (let cols = 1; cols <= n; cols++) {
            const rows = Math.max(1, Math.round(n / cols)), total = cols * rows;
            if (total > MAX_PIECES || total < MIN_PIECES) continue;
            const score = Math.abs(Math.log((w / cols) / (h / rows))) * 2 + Math.abs(total - n) / n * 3;
            if (!best || score < best.score) best = {cols, rows, score};
        }
        return best || {cols: 2, rows: 2};
    }
    /** Taille de travail de l'image (les pièces sont découpées dans cette copie) : ni énorme, ni minuscule. */
    function worldDims(nw, nh) {
        nw = Math.max(1, Number(nw) || 1); nh = Math.max(1, Number(nh) || 1);
        const long = Math.max(nw, nh), s = long > 1800 ? 1800 / long : long < 900 ? 900 / long : 1;
        return {AW: Math.max(2, Math.round(nw * s)), AH: Math.max(2, Math.round(nh * s))};
    }
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    /* Un tenon, en coordonnées de bord (u le long du bord 0 → 1, v vers l'extérieur, en « taille de tenon ») :
     * suite de courbes de Bézier [p0, c1, c2, p1, c1, c2, p2…] — la retourner (reverse) donne le même bord à l'envers. */
    const TAB = [[0, 0], [0, 0], [0.37, 0], [0.37, 0], [0.43, 0], [0.44, 0.05], [0.40, 0.12], [0.36, 0.20], [0.42, 0.27], [0.50, 0.27],
        [0.58, 0.27], [0.64, 0.20], [0.60, 0.12], [0.56, 0.05], [0.57, 0], [0.63, 0], [0.63, 0], [1, 0], [1, 0]];

    /** Géométrie d'une partie : tailles, bords, chemins des pièces (Path2D en coordonnées de la case). */
    function geometry(meta) {
        const {cols, rows} = meta, {AW, AH} = worldDims(meta.image.w, meta.image.h), pw = AW / cols, ph = AH / rows, T = Math.min(pw, ph);
        const jig = meta.shape !== 'square', m = jig ? Math.ceil(T * 0.3) + 2 : 2, r = rng(meta.seed || 1);
        const hE = new Array((rows + 1) * cols), vE = new Array(rows * (cols + 1));
        for (let y = 1; y < rows; y++) for (let x = 0; x < cols; x++) hE[y * cols + x] = {s: r() < .5 ? 1 : -1, j: (r() - .5) * .1, k: .9 + r() * .2};
        for (let y = 0; y < rows; y++) for (let x = 1; x < cols; x++) vE[y * (cols + 1) + x] = {s: r() < .5 ? 1 : -1, j: (r() - .5) * .1, k: .9 + r() * .2};
        const straight = (x0, y0, x1, y1) => [[x0, y0], [x0, y0], [x1, y1], [x1, y1]];
        const tabH = (e, x0, y0) => TAB.map(([u, v]) => [x0 + (u > 0 && u < 1 ? u + e.j : u) * pw, y0 - e.s * v * e.k * T]);
        const tabV = (e, x0, y0) => TAB.map(([u, v]) => [x0 + e.s * v * e.k * T, y0 + (u > 0 && u < 1 ? u + e.j : u) * ph]);
        const paths = new Array(cols * rows);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            const X = x * pw, Y = y * ph, chains = [];
            chains.push(jig && y > 0 ? tabH(hE[y * cols + x], X, Y) : straight(X, Y, X + pw, Y));
            chains.push(jig && x < cols - 1 ? tabV(vE[y * (cols + 1) + x + 1], X + pw, Y) : straight(X + pw, Y, X + pw, Y + ph));
            chains.push(jig && y < rows - 1 ? tabH(hE[(y + 1) * cols + x], X, Y + ph).reverse() : straight(X + pw, Y + ph, X, Y + ph));
            chains.push(jig && x > 0 ? tabV(vE[y * (cols + 1) + x], X, Y).reverse() : straight(X, Y + ph, X, Y));
            const p = new Path2D(); let first = true;
            chains.forEach(ch => { if (first) { p.moveTo(ch[0][0] - X, ch[0][1] - Y); first = false; } for (let i = 1; i + 2 < ch.length; i += 3) p.bezierCurveTo(ch[i][0] - X, ch[i][1] - Y, ch[i + 1][0] - X, ch[i + 1][1] - Y, ch[i + 2][0] - X, ch[i + 2][1] - Y); });
            p.closePath(); paths[y * cols + x] = p;
        }
        return {AW, AH, pw, ph, T, m, paths, n: cols * rows, cols, rows};
    }

    /** Places en anneaux autour du plateau : d'abord les côtés gauche et droit, puis dessous et dessus. */
    function ringSlots(count, G) {
        const size = Math.max(G.pw, G.ph) + G.m * 1.3, out = [];
        for (let k = 1; out.length < count && k < 400; k++) {
            const L = -k * size + size / 2, R = G.AW + k * size - size / 2, Tp = -k * size + size / 2, B = G.AH + k * size - size / 2;
            const ny = Math.max(1, Math.floor((B - Tp) / size) + 1), nx = Math.max(1, Math.floor((R - L) / size) + 1);
            for (let i = 0; i < ny; i++) { const yy = Tp + i * (B - Tp) / Math.max(1, ny - 1); out.push([L, yy], [R, yy]); }
            for (let i = 1; i < nx - 1; i++) { const xx = L + i * (R - L) / Math.max(1, nx - 1); out.push([xx, B], [xx, Tp]); }
        }
        return {slots: out.slice(0, count), size};
    }

    // ── nouvelle partie ──
    function createGame(setup) {
        const img = setup.image, {cols, rows} = gridFor(setup.count, img.w, img.h);
        const meta = {id: newId(), name: String(setup.name || '').trim() || (img.title ? `Puzzle « ${img.title} »` : 'Mon puzzle'), image: img, cols, rows, shape: setup.shape === 'square' ? 'square' : 'jigsaw',
            rotate: !!setup.rotate, model: setup.model !== false, edges: false, seed: (Math.random() * 2 ** 31) >>> 0, elapsed: 0, placed: 0, createdAt: Date.now(), updatedAt: Date.now()};
        const G = geometry(meta), n = G.n, r = rng(meta.seed ^ 0x9e3779b9);
        const order = Array.from({length: n}, (_, i) => i);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const {slots} = ringSlots(n, G), cx = new Array(n), cy = new Array(n), rot = new Array(n).fill(0);
        order.forEach((p, i) => { cx[p] = Math.round(slots[i][0] * 10) / 10; cy[p] = Math.round(slots[i][1] * 10) / 10; if (meta.rotate) rot[p] = Math.floor(r() * 4); });
        const st = {v: 1, cx, cy, rot, grp: Array.from({length: n}, (_, i) => i), lk: new Array(n).fill(0), order};
        return {meta, st};
    }

    /* ═════════════════════ Préparation de la partie ═════════════════════ */
    let setup = null;
    function setupHtml(ctx) {
        const s = setup, img = s.image;
        const variants = (ctx.variants || [['goose', 'Jeu de l’oie'], ['snakes', 'Serpents et échelles'], ['horses', 'Petits chevaux'], ['puzzle', '🧩 Puzzle']]).map(([v, l]) => `<option value="${esc(v)}"${v === 'puzzle' ? ' selected' : ''}>${esc(l)}</option>`).join('');
        const full = gameCount() >= MAX_GAMES;
        return `<section class="goose-page pz-page"><header class="goose-head"><span class="eyebrow">TABLE DE JEU · PUZZLE</span><h2>${esc(TITLE)}</h2><p>Choisis une image et le nombre de pièces. Le chrono tourne pendant que tu joues ; la partie se garde dans ce navigateur, même après actualisation.</p></header>
            ${full ? `<div class="pz-msgline">${notice('warn', `Les ${MAX_GAMES} puzzles en cours sont gardés : supprime-en un pour en commencer un autre.`)}</div>` : ''}
            <form class="goose-setup pz-setup" id="pz-setup-form" novalidate>
                <div class="goose-setup-grid pz-setup-top"><label>Jeu<select name="variant" data-pz-variant>${variants}</select></label><label>Nom de la partie<input name="name" value="${esc(s.name || '')}" placeholder="${esc(img?.title ? `Puzzle « ${img.title} »` : 'Ex : La noce de 1925')}" maxlength="80"></label></div>
                <fieldset class="pz-fs"><legend>1 · L’image</legend>
                    <div class="pz-image" data-pz-image>${imageCardHtml(img)}</div>
                    <div class="pz-src"><button type="button" class="button secondary" data-pz-media title="Ouvre la fenêtre des images de ta base (tu peux aussi y importer ou coller une image)">🖼 Choisir dans la base</button><button type="button" class="button secondary" data-pz-person title="Choisis une personne : sa photo de fiche devient le puzzle">👤 Photo d’une personne</button></div>
                    <div class="pz-drop" data-pz-drop></div>
                </fieldset>
                <fieldset class="pz-fs"><legend>2 · Le nombre de pièces</legend>
                    <div class="pz-counts" role="group" aria-label="Nombre de pièces">${COUNTS.map(c => `<button type="button" class="pz-count${!s.custom && s.count === c ? ' is-active' : ''}" data-pz-count="${c}">${c}</button>`).join('')}<button type="button" class="pz-count${s.custom ? ' is-active' : ''}" data-pz-custom>Autre…</button><label class="pz-custom"${s.custom ? '' : ' hidden'}><span class="sr-only">Nombre de pièces</span><input type="number" inputmode="numeric" min="${MIN_PIECES}" max="${MAX_PIECES}" step="1" value="${esc(s.count)}" data-pz-custom-n aria-label="Nombre de pièces"><span>pièces</span></label></div>
                    <p class="pz-estimate" data-pz-estimate aria-live="polite"></p>
                    <div data-pz-count-msg></div>
                </fieldset>
                <fieldset class="pz-fs"><legend>3 · Les options</legend>
                    <div class="pz-opts">
                        <label class="pz-opt-select">Forme des pièces<select name="shape"><option value="jigsaw"${s.shape !== 'square' ? ' selected' : ''}>Vraies formes de puzzle</option><option value="square"${s.shape === 'square' ? ' selected' : ''}>Carrés simples</option></select></label>
                        <label class="ui-toggle"><input type="checkbox" name="rotate"${s.rotate ? ' checked' : ''}><i></i>Pièces tournées (clic droit ou R pour les tourner)</label>
                        <label class="ui-toggle"><input type="checkbox" name="model"${s.model !== false ? ' checked' : ''}><i></i>Montrer l’image modèle</label>
                    </div>
                </fieldset>
                <div data-pz-setup-msg></div>
                <footer><small>Glisse les pièces à la souris ou au doigt ; elles s’aimantent quand elles sont au bon endroit ou contre leur voisine. Molette ou pincement pour zoomer.</small><button class="button pz-start" type="submit" data-pz-start${full ? ' disabled' : ''}>🧩 Commencer le puzzle</button></footer>
            </form></section>`;
    }
    function imageCardHtml(img) {
        if (!img) return `<div class="pz-image-empty"><span aria-hidden="true">🖼</span><div><strong>Aucune image choisie</strong><small>Prends une image de ta base, la photo d’une personne, ou glisse une image de l’ordinateur.</small></div></div>`;
        const big = Math.max(img.w, img.h);
        return `<div class="pz-image-card"><img src="${esc(img.url)}" alt="" loading="lazy"><div><strong>${esc(img.title || 'Image')}</strong><small>${num(img.w)} × ${num(img.h)} pixels${big < 300 ? ' · petite image : les pièces seront floues' : ''}</small>${img.note ? `<small>${esc(img.note)}</small>` : ''}</div><button type="button" class="icon-button small" data-pz-clear title="Retirer cette image" aria-label="Retirer cette image">×</button></div>`;
    }
    function loadImg(url) {
        return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => (im.naturalWidth > 0 ? res(im) : rej(new Error('vide'))); im.onerror = () => rej(new Error('L’image n’a pas pu être lue.')); im.src = url; });
    }
    const mediaUrl = f => `media/${encodeURIComponent(f || '')}`;

    function renderSetup(ws, ctx) {
        if (!setup) { const p = prefs(); setup = {image: null, name: '', count: COUNTS.includes(Number(p.count)) ? Number(p.count) : clamp(Number(p.count) || 48, MIN_PIECES, MAX_PIECES), custom: !COUNTS.includes(Number(p.count)), shape: p.shape, rotate: !!p.rotate, model: p.model !== false}; }
        stopRunning();
        ws.innerHTML = setupHtml(ctx);
        bindSetup(ws, ctx);
    }
    function bindSetup(ws, ctx) {
        const form = ws.querySelector('#pz-setup-form'); if (!form) return;
        const q = s => form.querySelector(s), estimate = q('[data-pz-estimate]'), cmsg = q('[data-pz-count-msg]'), smsg = q('[data-pz-setup-msg]');
        const savePrefs = () => store.set(PREFS_KEY, {count: setup.count, shape: setup.shape, rotate: setup.rotate, model: setup.model});
        const showEstimate = () => {
            const img = setup.image, g = gridFor(setup.count, img?.w || 4, img?.h || 3), total = g.cols * g.rows;
            estimate.innerHTML = `≈ <b>${num(total)} pièces</b> (${g.cols} × ${g.rows})${img ? '' : ' <small>— la grille s’adaptera à la forme de l’image</small>'}`;
        };
        const drawImage = () => { q('[data-pz-image]').innerHTML = imageCardHtml(setup.image); form.elements.name.placeholder = setup.image?.title ? `Puzzle « ${setup.image.title} »` : 'Ex : La noce de 1925'; q('[data-pz-clear]')?.addEventListener('click', () => { setup.image = null; drawImage(); showEstimate(); }); };
        const setImage = async (sel, busyText = 'Lecture de l’image…') => {
            const box = q('[data-pz-image]'); box.innerHTML = UI().spinner ? UI().spinner(busyText) : esc(busyText); smsg.innerHTML = '';
            try {
                const im = await loadImg(sel.url);
                setup.image = {...sel, w: im.naturalWidth, h: im.naturalHeight};
                if (!form.isConnected) return;
                drawImage(); showEstimate();
            } catch (e) { if (!form.isConnected) return; drawImage(); smsg.innerHTML = notice('error', `Cette image n’a pas pu être ouverte : ${e.message || e}`); }
        };
        q('[data-pz-variant]')?.addEventListener('change', e => { if (e.target.value !== 'puzzle') ctx.onVariant?.(e.target.value); });
        q('[name="name"]').addEventListener('input', e => { setup.name = e.target.value; });
        q('[data-pz-media]').addEventListener('click', async () => {
            const P = PK(); if (!P.openMediaPicker) { toast('La fenêtre des images n’est pas chargée : recharge la page.', 'error'); return; }
            const m = await P.openMediaPicker({types: ['image'], eyebrow: 'PUZZLE', title: 'L’image du puzzle', intro: 'Choisis une image de ta base, ou importe-la depuis l’ordinateur.', okLabel: 'Prendre cette image', value: setup.image?.mediaId ? [setup.image.mediaId] : []});
            if (m && m.filename) setImage({key: `m:${m.id}`, url: mediaUrl(m.filename), title: m.title || m.filename, mediaId: Number(m.id)});
        });
        q('[data-pz-person]').addEventListener('click', async () => {
            const P = PK(); if (!P.openPicker) { toast('Le menu de choix n’est pas chargé : recharge la page.', 'error'); return; }
            const it = await P.openPicker({kind: 'person', title: 'La photo de quelle personne ?'}); if (!it || !(Number(it.id) > 0)) return;
            const who = it.title || 'cette personne';
            let mid = 0; try { mid = Number((await APP().api('person', {id: it.id}))?.person?.portrait_media_id) || 0; } catch (_) {}
            let media = null; if (mid && P.loadMedia) { try { [media] = await P.loadMedia([mid]); } catch (_) {} }
            if (media?.filename && media.media_type === 'image') { setImage({key: `m:${media.id}`, url: mediaUrl(media.filename), title: `${who} — ${media.title || 'photo'}`, mediaId: Number(media.id), personId: Number(it.id)}); return; }
            toast(`${who} n’a pas encore de photo de fiche : choisis une de ses images.`);
            const m = await P.openMediaPicker?.({types: ['image'], person: {id: it.id, title: who}, eyebrow: 'PUZZLE', title: `Une image de ${who}`, okLabel: 'Prendre cette image'});
            if (m && m.filename) setImage({key: `m:${m.id}`, url: mediaUrl(m.filename), title: m.title || who, mediaId: Number(m.id), personId: Number(it.id)});
        });
        // E4 : glisser une image ici (elle entre dans les médias)
        const dropBox = q('[data-pz-drop]');
        const takeFile = async file => {
            if (!file) return;
            if (!/^image\//.test(file.type || '')) { smsg.innerHTML = notice('error', `« ${file.name || 'Ce fichier'} » n’est pas une image.`); return; }
            const box = q('[data-pz-image]'); box.innerHTML = UI().spinner ? UI().spinner('L’image entre dans les médias…') : '…';
            try {
                const it = await PK().importMediaFile(file, ['image']);
                await setImage({key: `m:${it.id}`, url: it.filename ? mediaUrl(it.filename) : it.thumb, title: it.title || file.name, mediaId: Number(it.id)});
            } catch (e) {
                // pas de serveur ou envoi refusé : on garde une copie réduite pour ce puzzle seulement
                try {
                    const url = await shrinkFile(file, 1400);
                    await setImage({key: `d:${file.name}:${file.size}`, url, title: file.name.replace(/\.[^.]+$/, '') || 'Image', note: 'Pas rangée dans les médias : gardée seulement pour ce puzzle.'});
                } catch (_) { drawImage(); smsg.innerHTML = notice('error', `Cette image n’a pas pu être ouverte : ${e.message || e}`); }
            }
        };
        if (UI().dropZone) {
            dropBox.appendChild(UI().dropZone({accept: 'image/*', multiple: false, text: '📁 Glisse une image ici, colle-la (⌘V) ou choisis-la sur l’ordinateur', hint: 'Elle entre dans les médias de l’app et devient le puzzle.', onFiles: files => takeFile(files[0])}));
        }
        q('[data-pz-clear]')?.addEventListener('click', () => { setup.image = null; drawImage(); showEstimate(); });
        // nombre de pièces
        const setCount = (n, fromInput = false) => {
            const raw = Math.round(Number(n)); let msg = '';
            if (!Number.isFinite(raw) || raw < MIN_PIECES) msg = `Il faut au moins ${MIN_PIECES} pièces : je compte ${MIN_PIECES}.`;
            else if (raw > MAX_PIECES) msg = `${num(MAX_PIECES)} pièces au plus : je compte ${num(MAX_PIECES)}.`;
            setup.count = clamp(Number.isFinite(raw) ? raw : MIN_PIECES, MIN_PIECES, MAX_PIECES);
            cmsg.innerHTML = msg ? notice('warn', msg) : '';
            if (!fromInput) { const inp = q('[data-pz-custom-n]'); if (inp) inp.value = setup.count; }
            showEstimate(); savePrefs();
        };
        form.querySelectorAll('[data-pz-count]').forEach(b => b.addEventListener('click', () => {
            setup.custom = false; form.querySelectorAll('.pz-count').forEach(x => x.classList.toggle('is-active', x === b)); q('.pz-custom').hidden = true; setCount(b.dataset.pzCount);
        }));
        q('[data-pz-custom]').addEventListener('click', e => {
            setup.custom = true; form.querySelectorAll('.pz-count').forEach(x => x.classList.toggle('is-active', x === e.currentTarget)); const lab = q('.pz-custom'); lab.hidden = false; const inp = q('[data-pz-custom-n]'); inp.focus(); inp.select();
        });
        const inp = q('[data-pz-custom-n]');
        inp.addEventListener('input', () => { if (inp.value !== '') setCount(inp.value, true); });
        inp.addEventListener('change', () => setCount(inp.value === '' ? MIN_PIECES : inp.value));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setCount(inp.value); } });
        form.elements.shape.addEventListener('change', e => { setup.shape = e.target.value; savePrefs(); });
        form.elements.rotate.addEventListener('change', e => { setup.rotate = e.target.checked; savePrefs(); });
        form.elements.model.addEventListener('change', e => { setup.model = e.target.checked; savePrefs(); });
        showEstimate();
        let starting = false;
        form.addEventListener('submit', async e => {
            e.preventDefault(); if (starting) return;
            if (gameCount() >= MAX_GAMES) { smsg.innerHTML = notice('warn', `Les ${MAX_GAMES} puzzles en cours sont gardés : supprime-en un pour en commencer un autre.`); return; }
            if (!setup.image) { smsg.innerHTML = notice('warn', 'Choisis d’abord une image : dans la base, la photo d’une personne, ou glisse-la ici.'); q('[data-pz-media]').focus(); return; }
            if (setup.custom) setCount(inp.value === '' ? MIN_PIECES : inp.value);
            starting = true; const btn = q('[data-pz-start]'); btn.disabled = true; btn.textContent = 'Découpage…';
            setup.name = form.elements.name.value;
            try {
                const {meta, st} = createGame(setup);
                const res = await push({op: 'save', uid: meta.id, meta, state: st, saved_at: Date.now()});
                if (res.refused) throw res.error;
                fresh.set(meta.id, {meta, state: st}); cachePut(meta);
                setup = {...setup, image: null, name: ''};
                ctx.open?.(meta.id);
            } catch (err) {
                starting = false; btn.disabled = false; btn.textContent = '🧩 Commencer le puzzle';
                smsg.innerHTML = notice('error', `Le puzzle n’a pas pu commencer : ${err.message || err}`);
            }
        });
    }
    function shrinkFile(file, max) {
        return new Promise((res, rej) => {
            const u = URL.createObjectURL(file), im = new Image();
            im.onload = () => { try { const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', .85)); } catch (e) { rej(e); } };
            im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Ce fichier n’est pas une image lisible.')); };
            im.src = u;
        });
    }

    /* ═════════════════════ La partie ═════════════════════ */
    let cur = null, renderSeq = 0; // la partie affichée
    function stopRunning() { renderSeq++; if (cur) cur.stop(); cur = null; } // renderSeq : une partie encore en lecture ne s'affichera plus

    const fresh = new Map(); // parties qu'on vient de créer : pas besoin de les relire
    function render(ws, id, ctx) {
        const known = C.games.some(g => g.id === id) || C.history.some(g => g.id === id) || fresh.has(id) || !!pendingAll()[id];
        if (C.loaded && !known && !C.offline) return false;
        stopRunning();
        const seq = ++renderSeq, f = fresh.get(id); fresh.delete(id);
        if (f) { cur = new Game(ws, f.meta, ctx, false, f.state); return true; }
        ws.innerHTML = `<section class="goose-page pz-page"><div class="pz-wrap pz-wait" data-pz-wait="${seq}">${UI().spinner ? UI().spinner('Ouverture de la partie…') : 'Ouverture de la partie…'}</div></section>`;
        const ours = () => seq === renderSeq && ws.isConnected && !!ws.querySelector(`[data-pz-wait="${seq}"]`); // un autre écran a pu prendre la place
        loadGame(id).then(g => {
            if (!ours()) return;
            cur = new Game(ws, {...g.meta, id}, ctx, g.status === 'done', g.state);
        }).catch(e => {
            if (!ours()) return;
            if (e.status === 404) { C.games = C.games.filter(g => g.id !== id); C.history = C.history.filter(g => g.id !== id); ctx.newGame?.(); return; }
            ws.innerHTML = `<section class="goose-page pz-page"><div class="pz-wrap pz-wait">${notice('error', `La partie n’a pas pu être ouverte : ${e.message || e}`)}<button type="button" class="button" data-pz-retry>Réessayer</button></div></section>`;
            ws.querySelector('[data-pz-retry]').addEventListener('click', () => render(ws, id, ctx));
        });
        return true;
    }

    const BAR_BTN = (attr, label, title, extra = '') => `<button type="button" class="pz-btn" ${attr} title="${esc(title)}" aria-label="${esc(title)}"${extra}>${label}</button>`;

    class Game {
        constructor(ws, meta, ctx, finished, state = null) {
            this.ws = ws; this.meta = {...meta}; this.ctx = ctx || {}; this.finished = finished; this.ac = new AbortController(); this.initState = state;
            this.dirty = false; this.stateDirty = false; this.firstDirty = 0; this.saving = null; this.saveState = C.kiosk ? 'kiosk' : C.offline ? 'offline' : 'saved';
            this.elapsed = finished ? Number(meta.time) || 0 : Number(meta.elapsed) || 0; this.runStart = 0; this.paused = false; this.pauseReason = '';
            this.cam = {s: 1, x: 0, y: 0}; this.drag = null; this.pan = null; this.pinch = null; this.pointers = new Map(); this.sel = -1;
            this.raf = 0; this.saveT = 0; this.lastSec = -1; this.stats = {frames: 0, last: 0, max: 0, sum: 0, dragFrames: 0, dragSum: 0, dragMax: 0};
            this.html(); this.load();
        }
        get G() { return this.geo; }
        html() {
            const m = this.meta, total = m.cols * m.rows, rec = C.records[recordKey(m)];
            this.ws.innerHTML = `<section class="goose-page pz-page pz-play"><header class="goose-head goose-game-head"><div><span class="eyebrow">${this.finished ? 'PUZZLE TERMINÉ' : 'PUZZLE EN COURS'} · ${num(total)} PIÈCES (${esc(m.cols)} × ${esc(m.rows)})</span><h2><input class="pz-name" data-pz-name value="${esc(m.name)}" maxlength="120" aria-label="Nom de la partie" title="Le nom de la partie : clique pour le changer"${this.finished ? ' readonly' : ''}></h2><p>${esc(m.image?.title || '')}${m.shape === 'square' ? ' · carrés simples' : ''}${m.rotate ? ' · pièces tournées' : ''}</p></div>
                <div class="page-actions">${this.finished ? '<button type="button" class="button small" data-pz-again title="Recommencer ce puzzle avec la même image et le même nombre de pièces">↻ Rejouer</button>' : ''}<button type="button" class="button small secondary" data-pz-new title="Préparer une autre partie">＋ Nouvelle partie</button>${this.finished ? '' : '<button type="button" class="button small secondary" data-pz-delete title="Supprimer ce puzzle (tu pourras annuler)">Supprimer</button>'}</div></header>
                <div class="pz-wrap" data-pz-wrap>
                    <div class="pz-bar">
                        <div class="pz-clock"><span class="pz-time" data-pz-time aria-label="Temps passé">${fmtTime(this.elapsed)}</span>${this.finished ? '' : BAR_BTN('data-pz-pause', '❚❚', 'Mettre en pause (Espace)', ' data-shortcut="Espace"')}</div>
                        ${this.finished ? '' : `<div class="pz-savebox"><span class="ui-status pz-status" data-ui-status data-pz-status aria-live="polite"></span><button type="button" class="button small pz-save" data-pz-save title="Enregistrer la partie maintenant (elle s’enregistre aussi toute seule)" data-shortcut="⌘S">💾 Enregistrer</button></div>`}
                        <div class="pz-progress"><span data-pz-count aria-live="polite"></span><i class="pz-meter"><b data-pz-meter></b></i><small data-pz-record>${rec ? `Ton record : ${fmtTime(rec)}` : ''}</small></div>
                        <div class="pz-tools">
                            ${BAR_BTN('data-pz-model', '🖼', 'Montrer ou cacher l’image modèle', ` aria-pressed="${m.model !== false}"`)}
                            ${this.finished ? '' : BAR_BTN('data-pz-edges', '▢', 'Ne montrer que les bords', ` aria-pressed="${!!m.edges}"`)}
                            ${this.finished ? '' : BAR_BTN('data-pz-shuffle', '🔀', 'Mélanger les pièces sur la table')}
                            ${this.finished ? '' : BAR_BTN('data-pz-sort', '⇆', 'Ranger les pièces sur les côtés')}
                            ${this.finished || !m.rotate ? '' : BAR_BTN('data-pz-rotate', '⟳', 'Tourner la pièce choisie (R ou clic droit)', ' data-shortcut="R"')}
                            ${BAR_BTN('data-pz-zout', '－', 'Dézoomer (molette)')}${BAR_BTN('data-pz-zin', '＋', 'Zoomer (molette)')}${BAR_BTN('data-pz-fit', '⤢', 'Tout voir')}
                            ${BAR_BTN('data-pz-full', '⛶', 'Plein écran (Échap pour sortir)')}
                        </div>
                    </div>
                    <div class="pz-stage" data-pz-stage tabindex="0" aria-label="Table du puzzle">
                        <canvas data-pz-canvas role="img" aria-label="Pièces du puzzle"></canvas>
                        <figure class="pz-model" data-pz-modelbox${m.model !== false ? '' : ' hidden'}><img alt="Image modèle" data-pz-modelimg><figcaption>Modèle</figcaption></figure>
                        <div class="pz-loading" data-pz-loading>${UI().spinner ? UI().spinner('Découpage des pièces…') : 'Découpage des pièces…'}</div>
                        <div class="pz-pause" data-pz-pausebox hidden><div><strong>❚❚ En pause</strong><span data-pz-pausewhy>Le chrono est arrêté.</span><button type="button" class="button" data-pz-resume title="Reprendre (Espace)">▶ Reprendre</button></div></div>
                        <div class="pz-win" data-pz-win hidden></div>
                    </div>
                    <p class="pz-hint">${this.finished ? 'Puzzle terminé : « ↻ Rejouer » pour le refaire.' : `Glisse les pièces ; elles s’aimantent au bon endroit et contre leur voisine.${m.rotate ? ' Clic droit ou R : tourner.' : ''} Espace : pause. Glisse le fond pour te déplacer.`}</p>
                </div></section>`;
            const $ = s => this.ws.querySelector(s);
            this.el = {wrap: $('[data-pz-wrap]'), stage: $('[data-pz-stage]'), canvas: $('[data-pz-canvas]'), time: $('[data-pz-time]'), count: $('[data-pz-count]'), meter: $('[data-pz-meter]'), record: $('[data-pz-record]'),
                pause: $('[data-pz-pausebox]'), why: $('[data-pz-pausewhy]'), win: $('[data-pz-win]'), loading: $('[data-pz-loading]'), model: $('[data-pz-modelbox]'), modelImg: $('[data-pz-modelimg]')};
            this.ctx2 = this.el.canvas.getContext('2d');
            this.savedElapsed = Math.round(this.elapsed); this.lastTimeSave = performance.now();
            this.bindBar(); this.setStatus(this.saveState);
        }
        async load() {
            const m = this.meta;
            try {
                const nOk = Number.isInteger(m.cols) && Number.isInteger(m.rows) && m.cols >= 1 && m.rows >= 1 && m.cols * m.rows >= MIN_PIECES && m.cols * m.rows <= MAX_PIECES;
                if (!nOk || !m.image || typeof m.image.url !== 'string') throw new Error('partie abîmée');
                const im = await loadImg(m.image.url);
                if (!this.alive()) return;
                this.img = im; this.el.modelImg.src = m.image.url;
                this.geo = geometry(m);
                const G = this.geo, art = document.createElement('canvas'); art.width = G.AW; art.height = G.AH;
                const ac = art.getContext('2d'); ac.imageSmoothingQuality = 'high'; ac.drawImage(im, 0, 0, G.AW, G.AH); this.art = art;
                this.restore();
                await this.cutSprites();
                if (!this.alive()) return;
                this.el.loading.hidden = true;
                this.resize(); this.fit(); this.bindStage(); this.updateCount(); this.ready = true;
                if (this.finished) { this.el.win.hidden = true; } else this.start();
                this.tick = setInterval(() => this.onTick(), 250);
            } catch (e) {
                if (!this.alive()) return;
                this.el.loading.innerHTML = `<div class="pz-loaderr">${notice('error', `L’image de ce puzzle est introuvable (${e.message || e}). Elle a peut-être été supprimée des médias.`)}</div>`;
            }
        }
        alive() { return !this.dead && this.el.stage.isConnected; }
        restore() {
            const G = this.geo, n = G.n;
            this.tx = new Float32Array(n); this.ty = new Float32Array(n);
            for (let p = 0; p < n; p++) { this.tx[p] = (p % G.cols + .5) * G.pw; this.ty[p] = (Math.floor(p / G.cols) + .5) * G.ph; }
            // l'état vient de la base ou de ce navigateur (secours) : tout est revérifié — un nombre faux (NaN, 1e308, texte),
            // une rotation ou un groupe hors bornes, un ordre qui oublie ou double des pièces → l'état est jeté (pièces en anneau)
            const st0 = this.finished ? null : this.initState; this.initState = null;
            const list = k => st0 && Array.isArray(st0[k]) && st0[k].length === n ? st0[k] : null;
            const nums = a => a && a.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7);
            const ints = (a, max) => a && a.every(v => Number.isInteger(v) && v >= 0 && v <= max);
            const ord = list('order'), ok = nums(list('cx')) && nums(list('cy')) && ints(list('rot'), 3) && ints(list('lk'), 1) && ints(list('grp'), n - 1)
                && ints(ord, n - 1) && new Set(ord).size === n;
            const st = ok ? st0 : null;
            this.cx = Float32Array.from(ok ? st.cx : this.tx); this.cy = Float32Array.from(ok ? st.cy : this.ty);
            this.rot = Uint8Array.from(ok ? st.rot : new Array(n).fill(0)); this.lk = Uint8Array.from(ok ? st.lk : new Array(n).fill(1));
            this.grp = Int32Array.from(ok ? st.grp : Array.from({length: n}, (_, i) => i));
            this.order = ok ? st.order.slice() : Array.from({length: n}, (_, i) => i);
            if (ok) for (let p = 0; p < n; p++) if (this.lk[p]) { this.cx[p] = this.tx[p]; this.cy[p] = this.ty[p]; this.rot[p] = 0; } // une pièce posée est à sa place
            if (!this.finished && !ok) { // état perdu : on remet les pièces en anneau
                const {slots} = ringSlots(n, G); this.lk.fill(0); this.order.forEach((p, i) => { this.cx[p] = slots[i][0]; this.cy[p] = slots[i][1]; });
            }
            this.members = new Map(); for (let p = 0; p < n; p++) { const g = this.grp[p]; if (!this.members.has(g)) this.members.set(g, []); this.members.get(g).push(p); }
            this.placed = this.lk.reduce((a, b) => a + b, 0);
            this.sortLockedFirst();
        }
        sortLockedFirst() { const a = [], b = []; this.order.forEach(p => (this.lk[p] ? a : b).push(p)); this.order = a.concat(b); }
        /** Découpe chaque pièce une fois (par paquets, sans figer la page). */
        async cutSprites() {
            const G = this.geo, n = G.n, w = Math.ceil(G.pw + 2 * G.m), h = Math.ceil(G.ph + 2 * G.m), lw = Math.max(1, G.T * .025);
            this.sprites = new Array(n); this.hit = document.createElement('canvas').getContext('2d');
            const chunk = 60;
            for (let i0 = 0; i0 < n; i0 += chunk) {
                if (!this.alive()) return;
                for (let p = i0; p < Math.min(n, i0 + chunk); p++) {
                    const col = p % G.cols, row = Math.floor(p / G.cols), c = document.createElement('canvas'); c.width = w; c.height = h;
                    const x = c.getContext('2d'), path = G.paths[p];
                    x.translate(G.m, G.m); x.save(); x.clip(path);
                    const sx = Math.max(0, Math.floor(col * G.pw - G.m)), sy = Math.max(0, Math.floor(row * G.ph - G.m)), ex = Math.min(G.AW, Math.ceil((col + 1) * G.pw + G.m)), ey = Math.min(G.AH, Math.ceil((row + 1) * G.ph + G.m));
                    if (ex > sx && ey > sy) x.drawImage(this.art, sx, sy, ex - sx, ey - sy, sx - col * G.pw, sy - row * G.ph, ex - sx, ey - sy);
                    x.restore(); x.lineJoin = 'round';
                    x.lineWidth = lw * 2; x.strokeStyle = 'rgba(255,255,255,.28)'; x.save(); x.translate(lw * .6, lw * .6); x.stroke(path); x.restore();
                    x.lineWidth = lw; x.strokeStyle = 'rgba(0,0,0,.55)'; x.stroke(path);
                    this.sprites[p] = c;
                }
                if (n > chunk) await new Promise(r => setTimeout(r, 0));
            }
        }

        // ── affichage ──
        resize() {
            const r = this.el.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), c = this.el.canvas;
            const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
            if (this.cw === W && this.ch === H && this.dpr === dpr) return;
            this.cw = W; this.ch = H; this.dpr = dpr; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px';
            this.staticLayer = null; this.requestDraw();
        }
        bounds() {
            const G = this.geo, ext = Math.max(G.pw, G.ph) / 2 + G.m; let x0 = 0, y0 = 0, x1 = G.AW, y1 = G.AH;
            for (let p = 0; p < G.n; p++) { if (this.hidden(p)) continue; x0 = Math.min(x0, this.cx[p] - ext); y0 = Math.min(y0, this.cy[p] - ext); x1 = Math.max(x1, this.cx[p] + ext); y1 = Math.max(y1, this.cy[p] + ext); }
            return {x0, y0, x1, y1};
        }
        fit(board = false) {
            const G = this.geo, b = board || this.finished ? {x0: 0, y0: 0, x1: G.AW, y1: G.AH} : this.bounds(), pad = 16;
            const s = Math.min((this.cw - pad * 2) / (b.x1 - b.x0), (this.ch - pad * 2) / (b.y1 - b.y0));
            this.cam.s = clamp(s, 0.01, 20); this.cam.x = (this.cw - (b.x1 - b.x0) * this.cam.s) / 2 - b.x0 * this.cam.s; this.cam.y = (this.ch - (b.y1 - b.y0) * this.cam.s) / 2 - b.y0 * this.cam.s;
            this.minS = this.cam.s * .5; this.staticLayer = null; this.requestDraw();
        }
        zoomAt(sx, sy, f) {
            const s0 = this.cam.s, s1 = clamp(s0 * f, Math.min(this.minS || s0, s0) * .8, 12);
            if (s1 === s0) return;
            this.cam.x = sx - (sx - this.cam.x) * s1 / s0; this.cam.y = sy - (sy - this.cam.y) * s1 / s0; this.cam.s = s1; this.staticLayer = null; this.requestDraw();
        }
        toWorld(sx, sy) { return {x: (sx - this.cam.x) / this.cam.s, y: (sy - this.cam.y) / this.cam.s}; }
        isEdge(p) { const G = this.geo, c = p % G.cols, r = Math.floor(p / G.cols); return c === 0 || r === 0 || c === G.cols - 1 || r === G.rows - 1; }
        hidden(p) { return !!this.meta.edges && !this.lk[p] && !this.isEdge(p) && this.members.get(this.grp[p]).length === 1; }
        requestDraw() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }
        drawBoard(x) {
            const G = this.geo;
            x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(0, 0, G.AW, G.AH);
            x.lineWidth = 2 / this.cam.s; x.strokeStyle = 'rgba(0,0,0,.45)'; x.setLineDash([6 / this.cam.s, 5 / this.cam.s]); x.strokeRect(0, 0, G.AW, G.AH); x.setLineDash([]);
        }
        drawPiece(x, p, vx0, vy0, vx1, vy1) {
            const G = this.geo, cx = this.cx[p], cy = this.cy[p], e = Math.max(G.pw, G.ph) / 2 + G.m;
            if (cx + e < vx0 || cx - e > vx1 || cy + e < vy0 || cy - e > vy1) return; // hors de l'écran
            const r = this.rot[p], sp = this.sprites[p]; if (!sp) return;
            if (!r) { x.drawImage(sp, cx - G.pw / 2 - G.m, cy - G.ph / 2 - G.m); return; }
            x.save(); x.translate(cx, cy); x.rotate(r * Math.PI / 2); x.drawImage(sp, -G.pw / 2 - G.m, -G.ph / 2 - G.m); x.restore();
        }
        view() { const a = this.toWorld(0, 0), b = this.toWorld(this.cw, this.ch); return [a.x, a.y, b.x, b.y]; }
        paint(x, skip) {
            const {s, x: ox, y: oy} = this.cam, d = this.dpr;
            x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, this.cw, this.ch);
            x.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);
            this.drawBoard(x);
            const [a, b, c, e] = this.view();
            for (const p of this.order) { if (skip && skip.has(p)) continue; if (this.hidden(p)) continue; this.drawPiece(x, p, a, b, c, e); }
        }
        draw() {
            if (!this.geo || !this.sprites) return;
            const t0 = performance.now(), x = this.ctx2, d = this.dpr;
            if (this.drag && this.drag.members.length < this.geo.n) {
                const camKey = `${this.cam.s},${this.cam.x},${this.cam.y},${this.cw},${this.ch}`;
                if (!this.staticLayer || this.staticKey !== camKey || this.staticFor !== this.drag.gid) { // la table sans le groupe tiré, une seule fois
                    const sl = this.staticLayer && this.staticLayer.width === this.el.canvas.width && this.staticLayer.height === this.el.canvas.height ? this.staticLayer : Object.assign(document.createElement('canvas'), {width: this.el.canvas.width, height: this.el.canvas.height});
                    this.paint(sl.getContext('2d'), new Set(this.drag.members)); this.staticLayer = sl; this.staticKey = camKey; this.staticFor = this.drag.gid;
                }
                x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.el.canvas.width, this.el.canvas.height); x.drawImage(this.staticLayer, 0, 0);
                x.setTransform(d * this.cam.s, 0, 0, d * this.cam.s, d * this.cam.x, d * this.cam.y);
                const [a, b, c, e] = this.view(), few = this.drag.members.length <= 40;
                if (few) { x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 10 * d; x.shadowOffsetY = 4 * d; }
                for (const p of this.drag.members) this.drawPiece(x, p, a, b, c, e);
                if (few) { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; }
                const dt = performance.now() - t0; this.stats.dragFrames++; this.stats.dragSum += dt; this.stats.dragMax = Math.max(this.stats.dragMax, dt);
            } else this.paint(x, null);
            const dt = performance.now() - t0; this.stats.frames++; this.stats.last = dt; this.stats.sum += dt; this.stats.max = Math.max(this.stats.max, dt);
        }

        // ── pièces ──
        pick(wx, wy) {
            const G = this.geo, hx = this.hit, ext = Math.max(G.pw, G.ph) / 2 + G.m;
            for (let i = this.order.length - 1; i >= 0; i--) {
                const p = this.order[i]; if (this.lk[p] || this.hidden(p)) continue;
                let dx = wx - this.cx[p], dy = wy - this.cy[p]; if (Math.abs(dx) > ext || Math.abs(dy) > ext) continue;
                for (let k = 0; k < this.rot[p]; k++) { const t = dx; dx = dy; dy = -t; } // rotation inverse
                if (hx.isPointInPath(this.geo.paths[p], dx + G.pw / 2, dy + G.ph / 2)) return p;
            }
            return -1;
        }
        toTop(gid) { const mem = this.members.get(gid), set = new Set(mem); this.order = this.order.filter(p => !set.has(p)).concat(mem); }
        shift(gid, dx, dy) { for (const p of this.members.get(gid)) { this.cx[p] += dx; this.cy[p] += dy; } }
        merge(a, b) {
            const A = this.members.get(a), B = this.members.get(b); const [big, small, bg, sg] = A.length >= B.length ? [A, B, a, b] : [B, A, b, a];
            for (const p of small) { this.grp[p] = bg; big.push(p); } this.members.delete(sg); return bg;
        }
        lockGroup(gid) {
            const mem = this.members.get(gid); let n = 0;
            for (const p of mem) { if (!this.lk[p]) { this.lk[p] = 1; n++; } this.cx[p] = this.tx[p]; this.cy[p] = this.ty[p]; this.rot[p] = 0; }
            this.placed += n; const set = new Set(mem); this.order = mem.concat(this.order.filter(p => !set.has(p)));
            this.flash = performance.now();
        }
        rotVec(dx, dy, r) { for (let k = 0; k < r; k++) { const t = dx; dx = -dy; dy = t; } return [dx, dy]; }
        /** Après un lâcher : au bon endroit → posé ; contre une voisine → collées (en chaîne). */
        snap(gid) {
            const G = this.geo, d = Math.max(Math.min(G.pw, G.ph) * .24, 10 / this.cam.s), d2 = d * d; let guard = 0, joined = false;
            for (;;) {
                if (guard++ > 12) break;
                const mem = this.members.get(gid), r = this.rot[mem[0]];
                if (this.lk[mem[0]]) break;
                if (r === 0) { const hitBoard = mem.find(p => (this.cx[p] - this.tx[p]) ** 2 + (this.cy[p] - this.ty[p]) ** 2 < d2); if (hitBoard !== undefined) { this.lockGroup(gid); return 'board'; } }
                let found = null;
                outer: for (const p of mem) {
                    const c = p % G.cols, rr = Math.floor(p / G.cols);
                    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nc = c + dc, nr = rr + dr; if (nc < 0 || nr < 0 || nc >= G.cols || nr >= G.rows) continue;
                        const q = nr * G.cols + nc; if (this.grp[q] === gid || this.hidden(q)) continue;
                        if (this.lk[q] ? r !== 0 : this.rot[q] !== r) continue;
                        const [ox, oy] = this.rotVec(dc * G.pw, dr * G.ph, r), ex = this.cx[p] + ox, ey = this.cy[p] + oy;
                        if ((this.cx[q] - ex) ** 2 + (this.cy[q] - ey) ** 2 < d2) { found = {q, dx: this.cx[q] - ex, dy: this.cy[q] - ey}; break outer; }
                    }
                }
                if (!found) break;
                this.shift(gid, found.dx, found.dy);
                if (this.lk[found.q]) { this.lockGroup(gid); return 'board'; }
                gid = this.merge(gid, this.grp[found.q]); joined = true;
            }
            const mem = this.members.get(gid);
            if (mem.length === this.geo.n && !this.lk[mem[0]] && this.rot[mem[0]] === 0) { this.lockGroup(gid); return 'board'; } // tout assemblé ailleurs : on le pose
            return joined ? 'joined' : '';
        }
        rotateGroup(p, pivotX, pivotY) {
            if (!this.meta.rotate || this.finished || p < 0 || this.lk[p]) return false;
            const gid = this.grp[p], px = pivotX ?? this.cx[p], py = pivotY ?? this.cy[p];
            for (const q of this.members.get(gid)) { const dx = this.cx[q] - px, dy = this.cy[q] - py; this.cx[q] = px - dy; this.cy[q] = py + dx; this.rot[q] = (this.rot[q] + 1) % 4; }
            this.staticLayer = null; return true;
        }
        afterMove(res) {
            if (res) this.staticLayer = null;
            this.updateCount(); this.markDirty(true); this.requestDraw();
            if (this.placed >= this.geo.n && !this.finished) this.win();
        }

        // ── souris, doigt, clavier ──
        bindStage() {
            const c = this.el.canvas, sig = {signal: this.ac.signal}, pos = e => { const r = c.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
            c.addEventListener('pointerdown', e => {
                if (this.paused || !this.geo) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                try { c.setPointerCapture(e.pointerId); } catch (_) {}
                const pt = pos(e); this.pointers.set(e.pointerId, pt);
                if (this.pointers.size === 2) { // pincement : on lâche la pièce, on zoome
                    if (this.drag) this.endDrag(); this.pan = null;
                    const [a, b] = [...this.pointers.values()]; this.pinch = {d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2}; return;
                }
                if (this.pointers.size > 2) return;
                const w = this.toWorld(pt.x, pt.y), p = this.finished ? -1 : this.pick(w.x, w.y);
                if (p >= 0) {
                    const gid = this.grp[p]; this.sel = p; this.toTop(gid);
                    this.drag = {id: e.pointerId, gid, p, members: this.members.get(gid), lx: w.x, ly: w.y, moved: false}; this.staticLayer = null;
                    c.classList.add('is-dragging'); this.requestDraw();
                } else this.pan = {id: e.pointerId, x: pt.x, y: pt.y};
            }, sig);
            c.addEventListener('pointermove', e => {
                if (!this.pointers.has(e.pointerId)) return;
                const pt = pos(e); this.pointers.set(e.pointerId, pt);
                if (this.pinch && this.pointers.size >= 2) {
                    const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                    this.cam.x += mx - this.pinch.mx; this.cam.y += my - this.pinch.my; this.zoomAt(mx, my, d / this.pinch.d); this.pinch = {d, mx, my}; this.staticLayer = null; this.requestDraw(); return;
                }
                if (this.drag && this.drag.id === e.pointerId) {
                    const w = this.toWorld(pt.x, pt.y), dx = w.x - this.drag.lx, dy = w.y - this.drag.ly; this.drag.lx = w.x; this.drag.ly = w.y;
                    if (dx || dy) { this.drag.moved = true; for (const p of this.drag.members) { this.cx[p] += dx; this.cy[p] += dy; } this.requestDraw(); }
                } else if (this.pan && this.pan.id === e.pointerId) {
                    this.cam.x += pt.x - this.pan.x; this.cam.y += pt.y - this.pan.y; this.pan.x = pt.x; this.pan.y = pt.y; this.requestDraw();
                }
            }, sig);
            const up = e => {
                if (!this.pointers.has(e.pointerId)) return; this.pointers.delete(e.pointerId);
                if (this.pointers.size < 2) this.pinch = null;
                if (this.drag && this.drag.id === e.pointerId) this.endDrag();
                if (this.pan && this.pan.id === e.pointerId) this.pan = null;
            };
            c.addEventListener('pointerup', up, sig); c.addEventListener('pointercancel', up, sig);
            c.addEventListener('contextmenu', e => {
                e.preventDefault(); if (this.paused || this.finished) return;
                if (!this.meta.rotate) { toast('Les pièces ne tournent pas dans ce puzzle (option « Pièces tournées » à la préparation).'); return; }
                const pt = pos(e), w = this.toWorld(pt.x, pt.y), p = this.drag ? this.drag.p : this.pick(w.x, w.y);
                if (p >= 0) { this.sel = p; this.rotateGroup(p); if (!this.drag) this.afterMove(this.snap(this.grp[p])); else this.requestDraw(); }
            }, sig);
            c.addEventListener('wheel', e => { e.preventDefault(); if (this.paused) return; const pt = pos(e), k = e.deltaMode === 1 ? 0.05 : 0.0018; this.zoomAt(pt.x, pt.y, Math.exp(-e.deltaY * k)); }, {passive: false, signal: this.ac.signal});
            if ('ResizeObserver' in window) { this.ro = new ResizeObserver(() => { if (this.alive()) this.resize(); }); this.ro.observe(this.el.stage); }
            document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause('hidden'); }, sig);
            window.addEventListener('pagehide', () => this.saveNow({keepalive: true, force: true}), sig);
            window.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S') && this.alive() && !this.finished && !document.querySelector('dialog[open]')) { e.preventDefault(); e.stopImmediatePropagation(); this.saveNow({force: true}); } }, {capture: true, signal: this.ac.signal});
            document.addEventListener('fullscreenchange', () => { this.el.wrap.classList.toggle('is-full', document.fullscreenElement === this.el.wrap || this.cssFull); setTimeout(() => { this.resize(); this.fit(); }, 60); }, sig);
            document.addEventListener('keydown', e => this.onKey(e), sig);
        }
        endDrag() {
            const dr = this.drag; this.drag = null; this.el.canvas.classList.remove('is-dragging'); this.staticLayer = null;
            if (!dr) return;
            if (!this.members.has(dr.gid)) { this.requestDraw(); return; }
            this.afterMove(dr.moved ? this.snap(dr.gid) : '');
        }
        onKey(e) {
            if (!this.alive()) return;
            const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
            if (typing || document.querySelector('dialog[open]')) return;
            if (e.key === 'Escape') {
                if (!this.el.win.hidden && this.finished && this.winShown) { this.el.win.hidden = true; this.winShown = false; e.preventDefault(); return; }
                if (this.cssFull || document.fullscreenElement === this.el.wrap) { this.toggleFull(false); e.preventDefault(); }
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === ' ' || e.code === 'Space') { if (this.finished) return; e.preventDefault(); this.paused ? this.resume() : this.pause('button'); return; }
            if ((e.key === 'r' || e.key === 'R') && !this.paused && !this.finished) {
                if (!this.meta.rotate) return;
                const p = this.drag ? this.drag.p : this.sel; if (p < 0 || this.lk[p]) return;
                e.preventDefault();
                if (this.drag) { this.rotateGroup(p, this.drag.lx, this.drag.ly); this.requestDraw(); } else { this.rotateGroup(p); this.afterMove(this.snap(this.grp[p])); }
            }
        }
        bindBar() {
            const q = s => this.ws.querySelector(s), sig = {signal: this.ac.signal};
            q('[data-pz-pause]')?.addEventListener('click', () => (this.paused ? this.resume() : this.pause('button')), sig);
            q('[data-pz-resume]')?.addEventListener('click', () => this.resume(), sig);
            q('[data-pz-model]')?.addEventListener('click', e => { this.meta.model = this.meta.model === false; e.currentTarget.setAttribute('aria-pressed', String(this.meta.model)); this.el.model.hidden = !this.meta.model; this.saveMeta(); }, sig);
            q('[data-pz-edges]')?.addEventListener('click', e => { this.meta.edges = !this.meta.edges; e.currentTarget.setAttribute('aria-pressed', String(this.meta.edges)); this.staticLayer = null; this.requestDraw(); this.saveMeta(); }, sig);
            q('[data-pz-shuffle]')?.addEventListener('click', () => this.shuffle(), sig);
            q('[data-pz-sort]')?.addEventListener('click', () => this.arrange(), sig);
            q('[data-pz-rotate]')?.addEventListener('click', () => { if (this.paused) return; const p = this.sel; if (p < 0 || this.lk[p]) { toast('Touche d’abord une pièce, puis ⟳ pour la tourner.'); return; } this.rotateGroup(p); this.afterMove(this.snap(this.grp[p])); }, sig);
            q('[data-pz-zin]')?.addEventListener('click', () => this.zoomAt(this.cw / 2, this.ch / 2, 1.25), sig);
            q('[data-pz-zout]')?.addEventListener('click', () => this.zoomAt(this.cw / 2, this.ch / 2, 0.8), sig);
            q('[data-pz-fit]')?.addEventListener('click', () => this.fit(), sig);
            q('[data-pz-full]')?.addEventListener('click', () => this.toggleFull(), sig);
            q('[data-pz-new]')?.addEventListener('click', () => { this.ctx.newGame?.(); }, sig); // stop() enregistre
            q('[data-pz-save]')?.addEventListener('click', () => this.saveNow({force: true}), sig);
            const name = q('[data-pz-name]');
            name?.addEventListener('input', () => { if (this.finished) return; this.meta.name = name.value.trim().slice(0, 120) || 'Mon puzzle'; this.markDirty(false); }, sig);
            name?.addEventListener('change', () => { if (!this.finished) this.saveNow(); }, sig);
            name?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') name.value = this.meta.name; name.blur(); } }, sig);
            q('[data-pz-again]')?.addEventListener('click', () => this.again(), sig);
            q('[data-pz-delete]')?.addEventListener('click', () => this.remove(), sig);
            this.el.model.addEventListener('click', () => this.el.model.classList.toggle('is-big'), sig);
        }
        toggleFull(force) {
            const w = this.el.wrap, on = force ?? !(document.fullscreenElement === w || this.cssFull);
            if (on) {
                if (w.requestFullscreen) w.requestFullscreen().catch(() => { this.cssFull = true; w.classList.add('is-full'); this.resize(); this.fit(); });
                else { this.cssFull = true; w.classList.add('is-full'); this.resize(); this.fit(); }
            } else {
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                this.cssFull = false; w.classList.remove('is-full'); setTimeout(() => { this.resize(); this.fit(); }, 30);
            }
        }
        looseGroups() { const out = []; this.members.forEach((mem, gid) => { if (!this.lk[mem[0]]) out.push(gid); }); return out; }
        shuffle() {
            if (this.paused || this.finished) return;
            const G = this.geo, loose = this.looseGroups(), {slots, size} = ringSlots(Math.max(1, loose.length), G);
            let x0 = 0, y0 = 0, x1 = G.AW, y1 = G.AH; slots.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
            for (const gid of loose) {
                const mem = this.members.get(gid), p = mem[0]; let x, y, t = 0;
                do { x = x0 + Math.random() * (x1 - x0); y = y0 + Math.random() * (y1 - y0); } while (t++ < 40 && x > -size / 2 && x < G.AW + size / 2 && y > -size / 2 && y < G.AH + size / 2);
                this.shift(gid, x - this.cx[p], y - this.cy[p]);
                if (this.meta.rotate && mem.length === 1) this.rot[p] = Math.floor(Math.random() * 4);
            }
            const ids = loose.slice(); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
            ids.forEach(g => this.toTop(g));
            this.staticLayer = null; this.fit(); this.afterMove(''); toast('🔀 Pièces mélangées.');
        }
        /** Range les pièces seules autour du plateau (les bords d'abord) ; les groupes déjà collés ne bougent pas. */
        arrange() {
            if (this.paused || this.finished) return;
            const G = this.geo, singles = [];
            this.members.forEach(mem => { if (mem.length === 1 && !this.lk[mem[0]] && !this.hidden(mem[0])) singles.push(mem[0]); });
            singles.sort((a, b) => (this.isEdge(b) - this.isEdge(a)) || a - b);
            const {slots} = ringSlots(singles.length, G);
            singles.forEach((p, i) => { this.cx[p] = slots[i][0]; this.cy[p] = slots[i][1]; });
            this.staticLayer = null; this.fit(); this.afterMove(''); toast(`⇆ ${plural(singles.length, 'pièce rangée', 'pièces rangées')} sur les côtés.`);
        }

        // ── chrono ──
        now() { return this.elapsed + (this.runStart ? performance.now() - this.runStart : 0); }
        start() { if (this.finished) return; this.paused = false; this.runStart = performance.now(); this.el.stage.classList.remove('is-paused'); this.el.pause.hidden = true; this.setPauseBtn(); this.requestDraw(); }
        pause(reason) {
            if (this.finished || this.paused || !this.geo) return;
            if (this.drag) this.endDrag();
            this.elapsed = this.now(); this.runStart = 0; this.paused = true; this.pauseReason = reason;
            this.el.stage.classList.add('is-paused'); this.el.pause.hidden = false;
            this.el.why.textContent = reason === 'hidden' ? 'Le chrono s’est arrêté pendant que tu étais ailleurs.' : 'Le chrono est arrêté et l’image cachée.';
            this.setPauseBtn(); this.showTime(true); this.saveNow();
        }
        resume() { if (!this.paused) return; this.start(); this.el.stage.focus({preventScroll: true}); }
        setPauseBtn() { const b = this.ws.querySelector('[data-pz-pause]'); if (b) { b.textContent = this.paused ? '▶' : '❚❚'; b.title = this.paused ? 'Reprendre (Espace)' : 'Mettre en pause (Espace)'; b.setAttribute('aria-label', b.title); b.classList.toggle('is-on', this.paused); } }
        showTime(force) { const t = this.now(), s = Math.floor(t / 1000); if (force || s !== this.lastSec) { this.lastSec = s; this.el.time.textContent = fmtTime(t); } }
        onTick() {
            if (!this.alive()) { this.stop(); return; }
            this.showTime();
            if (!this.paused && !this.finished && !this.saveT && !this.saving && performance.now() - (this.lastTimeSave || 0) > SAVE_EVERY_MS) this.saveNow(); // le temps, au plus toutes les 10 s
        }
        updateCount() {
            const n = this.geo.n, k = this.placed, pc = Math.floor(k * 100 / n);
            this.el.count.textContent = `${num(k)} / ${num(n)} pièces posées · ${pc} %`; this.el.meter.style.width = `${pc}%`;
        }

        // ── enregistrement (retardé, sans bloquer) ──
        /** Quelque chose a changé : enregistrement 2,5 s après le dernier coup, et au plus tard 10 s après le premier. */
        markDirty(pieces = true) {
            if (this.finished || this.removed) return;
            if (pieces) this.stateDirty = true;
            if (!this.dirty) { this.dirty = true; this.firstDirty = performance.now(); }
            if (!this.saving) this.setStatus('dirty');
            this.scheduleSave();
        }
        scheduleSave() {
            if (this.finished) return; clearTimeout(this.saveT);
            const wait = Math.max(0, Math.min(SAVE_QUIET_MS, this.firstDirty + SAVE_EVERY_MS - performance.now()));
            this.saveT = setTimeout(() => { this.saveT = 0; const run = () => this.saveNow(); if (window.requestIdleCallback) requestIdleCallback(run, {timeout: 1200}); else run(); }, wait);
        }
        saveMeta() { this.markDirty(false); }
        piecesState() {
            const r1 = v => Math.round(v * 10) / 10;
            return {v: 1, cx: Array.from(this.cx, r1), cy: Array.from(this.cy, r1), rot: Array.from(this.rot), grp: Array.from(this.grp), lk: Array.from(this.lk), order: this.order.slice()};
        }
        /** Ce qu'on envoie : la description (l'image seulement si elle est courte : une copie intégrée reste côté base) et les pièces. */
        payload(withState = true) {
            const m = this.meta, img = m.image && String(m.image.url || '').length <= 4000 ? m.image : undefined;
            const meta = {name: m.name, cols: m.cols, rows: m.rows, shape: m.shape, rotate: !!m.rotate, model: m.model !== false, edges: !!m.edges, seed: m.seed, createdAt: m.createdAt, elapsed: Math.round(this.now()), placed: this.placed};
            if (img) meta.image = img;
            const p = {op: 'save', uid: m.id, meta, saved_at: Date.now()};
            if (withState) p.state = this.piecesState();
            return p;
        }
        setStatus(kind, msg = '') {
            this.saveState = kind; const el = this.ws.querySelector('[data-pz-status]'); if (!el) return;
            if (kind === 'offline' || kind === 'kiosk' || kind === 'refused') {
                const t = kind === 'kiosk' ? '⚠️ Consultation : gardé ici' : kind === 'refused' ? '⚠️ Pas enregistré' : '⚠️ Gardé dans ce navigateur';
                el.innerHTML = `<span class="ui-status-txt is-error">${esc(t)}</span>`;
                el.title = kind === 'kiosk' ? 'Mode consultation : la base ne peut pas être modifiée. La partie est gardée dans ce navigateur.' : kind === 'refused' ? msg : 'Le serveur ne répond pas : la partie est gardée dans ce navigateur et partira dans la base dès que possible.';
            } else { if (UI().savedStatus) UI().savedStatus(el, kind); else el.textContent = kind === 'saved' ? '✓ Enregistré' : kind === 'saving' ? 'Enregistrement…' : '• modifié'; el.title = ''; }
        }
        /** Enregistre tout de suite (bouton 💾, ⌘S, pause, sortie de l'écran ; keepalive au moment de quitter la page). */
        async saveNow({keepalive = false, force = false} = {}) {
            clearTimeout(this.saveT); this.saveT = 0;
            if (this.finished || !this.geo || this.removed) return;
            const el = Math.round(this.now());
            if (!force && !this.dirty && Math.abs(el - (this.savedElapsed ?? -1e12)) < 900) return;
            const withState = this.stateDirty || force || this.saveState !== 'saved';
            const p = this.payload(withState);
            this.dirty = false; this.stateDirty = false; this.firstDirty = 0; this.savedElapsed = el; this.lastTimeSave = performance.now();
            Object.assign(this.meta, {elapsed: p.meta.elapsed, placed: p.meta.placed, updatedAt: Date.now()}); cachePut({...this.meta});
            if (keepalive) { // la page se ferme : copie de secours ici, et envoi qui survit à la fermeture
                pendingPut(withState ? p : {...p, state: this.piecesState()});
                send(p, {keepalive: JSON.stringify(p).length < 60000}).then(() => pendingDrop(p.uid, p.saved_at)).catch(() => {});
                return;
            }
            this.setStatus('saving'); this.saving = p;
            const res = await push(p);
            if (this.saving === p) this.saving = null;
            if (!res.ok && !res.refused) this.stateDirty = true; // au prochain essai, les pièces repartent
            if (this.removed || this.finished) return;
            if (res.ok) this.setStatus(this.dirty ? 'dirty' : 'saved');
            else this.setStatus(res.refused ? 'refused' : C.kiosk ? 'kiosk' : 'offline', res.error?.message || '');
            this.ctx.renderSidebar?.();
        }

        // ── fin ──
        win() {
            this.elapsed = this.now(); this.runStart = 0; this.finished = true; this.showTime(true);
            clearTimeout(this.saveT); this.saveT = 0;
            const m = this.meta, time = Math.round(this.elapsed), key = recordKey(m), old = Number(C.records[key]) || 0, best = !old || time < old;
            if (best) C.records[key] = time;
            const entry = {...m, elapsed: time, time, placed: this.geo.n, finishedAt: Date.now(), record: best};
            cachePut(entry, 'done'); this.meta = entry;
            const fin = this.payload(false); fin.op = 'finish'; fin.time = time; fin.meta.elapsed = time; fin.meta.placed = this.geo.n;
            if (!fin.meta.image && m.image) fin.meta.image = m.image; // une partie restée hors ligne : la base doit pouvoir la créer
            push(fin).then(res => { // la base a le dernier mot (un record battu sur un autre ordinateur)
                if (!res.ok || !this.el.record.isConnected) return;
                const before = Number(res.d.record_before) || 0;
                if (before && before !== old) { C.records[key] = Math.min(before, time); this.el.record.textContent = time < before ? '🏆 Nouveau record !' : `Ton record : ${fmtTime(before)}`; }
            });
            this.ws.querySelector('.pz-savebox')?.remove(); this.ws.querySelector('[data-pz-name]')?.setAttribute('readonly', '');
            this.el.record.textContent = best ? '🏆 Nouveau record !' : `Ton record : ${fmtTime(old)}`;
            this.ws.querySelector('[data-pz-pause]')?.remove();
            ['[data-pz-edges]', '[data-pz-shuffle]', '[data-pz-sort]', '[data-pz-rotate]'].forEach(s => this.ws.querySelector(s)?.remove());
            const del = this.ws.querySelector('[data-pz-delete]'); if (del) { del.outerHTML = '<button type="button" class="button small" data-pz-again title="Recommencer ce puzzle avec la même image et le même nombre de pièces">↻ Rejouer</button>'; this.ws.querySelector('[data-pz-again]').addEventListener('click', () => this.again(), {signal: this.ac.signal}); }
            const eb = this.ws.querySelector('.goose-head .eyebrow'); if (eb) eb.textContent = eb.textContent.replace('PUZZLE EN COURS', 'PUZZLE TERMINÉ');
            this.el.win.innerHTML = `<div class="pz-win-card" role="status"><span class="pz-win-ico" aria-hidden="true">🧩</span><strong>Bravo, c’est fini !</strong><p>${plural(this.geo.n, 'pièce')} en <b>${fmtTime(time)}</b></p><p class="pz-win-rec">${best ? (old ? `🏆 Nouveau record ! (avant : ${fmtTime(old)})` : '🏆 C’est ton premier record pour cette image.') : `Ton record : ${fmtTime(old)}`}</p><div class="pz-win-acts"><button type="button" class="button secondary" data-pz-winclose title="Fermer ce message pour admirer l’image (Échap)">Admirer l’image</button><button type="button" class="button" data-pz-winagain>↻ Rejouer</button></div></div>`;
            this.el.win.hidden = false; this.winShown = true;
            this.el.win.querySelector('[data-pz-winclose]').addEventListener('click', () => { this.el.win.hidden = true; this.winShown = false; });
            this.el.win.querySelector('[data-pz-winagain]').addEventListener('click', () => this.again());
            this.fit(true);
            toast(`🧩 Puzzle terminé en ${fmtTime(time)}${best ? ' — nouveau record !' : ''}`, 'success');
            this.ctx.renderSidebar?.();
        }
        again() {
            const m = this.meta;
            if (gameCount() >= MAX_GAMES) { toast(`Les ${MAX_GAMES} puzzles en cours sont gardés : supprime-en un pour en recommencer un.`, 'error'); return; }
            const {meta, st} = createGame({image: m.image, count: m.cols * m.rows, shape: m.shape, rotate: m.rotate, model: m.model, name: m.name});
            push({op: 'save', uid: meta.id, meta, state: st, saved_at: Date.now()}).then(res => {
                if (res.refused) { toast(`Le puzzle n’a pas pu recommencer : ${res.error?.message || ''}`, 'error'); return; }
                fresh.set(meta.id, {meta, state: st}); cachePut(meta); this.ctx.open?.(meta.id);
            });
        }
        remove() {
            if (!this.geo) return;
            const snap = this.payload(true), m = {...this.meta, elapsed: snap.meta.elapsed, placed: snap.meta.placed};
            if (m.image) snap.meta.image = m.image;
            this.removed = true; clearTimeout(this.saveT);
            cachePut(m, 'gone'); push({op: 'delete', uid: m.id, saved_at: Date.now()});
            this.ctx.newGame?.();
            toast(`Puzzle « ${m.name} » supprimé.`, '', {action: {label: '↶ Annuler', run: async () => {
                const res = await push({...snap, saved_at: Date.now()}); if (res.refused) { toast(res.error?.message || 'Impossible de remettre ce puzzle.', 'error'); return; }
                fresh.set(m.id, {meta: m, state: snap.state}); cachePut(m); this.ctx.open?.(m.id);
            }}});
        }
        stop() {
            if (this.dead) return;
            if (!this.finished && this.geo) { this.elapsed = this.now(); this.runStart = 0; this.saveNow(); }
            this.dead = true; clearInterval(this.tick); clearTimeout(this.saveT); this.ac.abort(); this.ro?.disconnect(); if (this.raf) cancelAnimationFrame(this.raf);
            this.sprites = null; this.staticLayer = null; this.art = null;
        }
    }

    /* ═════════════════════ Colonne de gauche ═════════════════════ */
    function sidebarHtml(active) {
        if (!C.loaded && !C.loading) loadAll(); // la liste vient de la base : la colonne se redessine quand elle arrive
        const list = C.games, hist = C.history, rec = C.records;
        const inProgress = list.map(g => `<button class="side-button pz-side ${g.id === active ? 'is-active' : ''}" type="button" data-pz-open="${esc(g.id)}" title="Reprendre ce puzzle"><strong>🧩 ${esc(g.name)}</strong><small>Puzzle · ${num(g.cols * g.rows)} pièces</small><small>⏱ ${fmtTime(g.elapsed)} · ${Math.floor((g.placed || 0) * 100 / Math.max(1, g.cols * g.rows))} %</small></button>`).join('');
        const done = hist.length ? `<div class="pz-side-title">🏆 Puzzles terminés</div>${hist.map(h => { const best = Number(rec[recordKey(h)]) || 0; return `<button class="side-button pz-side pz-side-done ${h.id === active ? 'is-active' : ''}" type="button" data-pz-open="${esc(h.id)}" title="Revoir ce puzzle terminé"><strong>${esc(h.name)}</strong><small>${num(h.cols * h.rows)} pièces · ⏱ ${fmtTime(h.time)}${best && best === Number(h.time) ? ' · 🏆' : ''}</small><small>${new Date(h.finishedAt || Date.now()).toLocaleDateString('fr-FR')}${best ? ` · record ${fmtTime(best)}` : ''}</small></button>`; }).join('')}` : '';
        return inProgress + done;
    }
    function bindSidebar(content, ctx, signal) {
        if (!content.dataset.pzListen) { // une seule écoute : quand la liste arrive de la base, la colonne se redessine
            content.dataset.pzListen = '1';
            const f = () => { if (!content.isConnected) { C.listeners.delete(f); return; } if (content.querySelector('.goose-side-menu') && !C.loading) ctx.renderSidebar?.(); };
            C.listeners.add(f);
        }
        content.querySelectorAll('[data-pz-open]').forEach(b => b.addEventListener('click', () => ctx.open?.(b.dataset.pzOpen), signal ? {signal} : undefined));
    }

    window.LCNDA_PUZZLE = {owns, renderSetup, render, sidebarHtml, bindSidebar, gameCount, stop: stopRunning, TITLE, gridFor, fmtTime,
        debug: () => cur && cur.ready ? {
            n: cur.geo.n, cols: cur.geo.cols, rows: cur.geo.rows, placed: cur.placed, finished: cur.finished, paused: cur.paused, elapsed: cur.now(), stats: {...cur.stats}, cam: {...cur.cam},
            /** centres à l'écran (relatifs au canvas) : où est la pièce, où elle doit aller */
            pieces: () => Array.from({length: cur.geo.n}, (_, p) => ({p, lk: cur.lk[p], rot: cur.rot[p], grp: cur.grp[p], x: cur.cx[p] * cur.cam.s + cur.cam.x, y: cur.cy[p] * cur.cam.s + cur.cam.y, tx: cur.tx[p] * cur.cam.s + cur.cam.x, ty: cur.ty[p] * cur.cam.s + cur.cam.y, hidden: cur.hidden(p)})),
            redraw: () => { const t = performance.now(); cur.paint(cur.ctx2, null); return performance.now() - t; },
        } : null,
    };
})();
