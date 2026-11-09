/* LCNDA — 🎲 Jeux de plateau (♟ Échecs, ⛀ Dames, 🁫 Dominos, 🎲 Yams) : ce qu'ils ont en commun, posé sur le cadre des jeux de la famille
 * (app-jeu-famille.js : même préparation, même colonne de gauche, mêmes parties gardées dans ce navigateur).
 * Ici : la barre de la partie (L2 : qui joue · scores · chrono · ↶ · 💡 (reste) · ⏸ · ? · ⋯, Échap = ⏸), la pause, les règles dans un « ? »,
 * les records (avec leur date, K4), le choix « Une personne / Ordinateur facile, moyen, difficile », les noms d'ancêtres
 * (jamais un vivant ni une fiche confidentielle), le clavier sur un plateau (flèches + Entrée) et le doigt / la souris (toucher ou glisser).
 * window.LCNDA_JEUX_PLATEAU = {LEVELS, levelSelect, cleanAi, calm, ancestors, records, shell, gridNav, boardPointer, rules}
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const LEVELS = [['', '🙂 Une personne'], ['facile', '🤖 Ordinateur facile'], ['moyen', '🤖 Ordinateur moyen'], ['difficile', '🤖 Ordinateur difficile']];
    const LEVEL_TXT = {facile: 'facile', moyen: 'moyen', difficile: 'difficile'};
    const cleanAi = v => (['facile', 'moyen', 'difficile'].includes(v) ? v : '');
    const levelSelect = (p, name = 'pai') => `<label>Qui joue<select name="${name}">${LEVELS.map(([v, t]) => `<option value="${v}" ${p.ai === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    /** « Réduire les animations » (Accessibilité) ou le réglage du système */
    const calm = () => document.documentElement.classList.contains('a11y-calm') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return UI().clock ? UI().clock(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

    /** des noms d'ancêtres pour les pièces ou les ordinateurs : « Prénom NOM » (sans les vivants ni les fiches confidentielles) */
    async function ancestors(seed, n) {
        const L = window.LCNDA_JEUX_LOGIQUE, J = window.LCNDA_JEUX_FAMILLE;
        try {
            const d = await J.loadData();
            const list = d.persons.filter(x => x && !x.living && !x.priv && x.first).map(x => ({name: `${x.first} ${String(x.last || '').toLocaleUpperCase('fr-FR')}`.trim(), id: x.id, g: x.g}));
            return L.shuffle(list, L.rng(String(seed) + ':ancetres')).slice(0, n);
        } catch (_) { return []; }
    }

    /* ═════ Records (dans ce navigateur) ═════ */
    const REC_KEY = 'lcnda-jeux-plateau-records';
    const recAll = () => { try { const v = JSON.parse(localStorage.getItem(REC_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const records = {
        get: (game, k) => recAll()[game]?.[k] || null,
        /** compter une partie : res 'w' | 'd' | 'l' ; best {v, label, low} (low : plus petit = mieux) ; rend {rec, newBest} */
        add(game, k, res, best = null, once = null) {
            // once {g, id} : une partie gagnée, défaite avec ↶ puis regagnée ne compte qu'une fois (marque gardée dans la partie)
            if (once?.g) { const m = once.g._rec = once.g._rec || {}; if (m[once.id || 'r']) return {rec: records.get(game, k), newBest: false}; m[once.id || 'r'] = 1; }
            const all = recAll(), g = all[game] = all[game] || {}, r = g[k] = g[k] || {w: 0, d: 0, l: 0, best: null};
            if (res === 'w') r.w++; else if (res === 'd') r.d++; else if (res === 'l') r.l++;
            let newBest = false;
            if (best && Number.isFinite(best.v) && (!r.best || (best.low ? best.v < r.best.v : best.v > r.best.v))) { r.best = {v: best.v, label: best.label || String(best.v), date: new Date().toISOString(), low: !!best.low}; newBest = true; }
            try { localStorage.setItem(REC_KEY, JSON.stringify(all)); } catch (_) {}
            return {rec: r, newBest};
        },
        /** la ligne « 3 victoires · 1 nulle · 2 défaites · record … (date) » */
        html(game, k, title = '') {
            const r = records.get(game, k); if (!r) return '';
            const plural = A().plural || ((n, w) => `${n} ${w}${n > 1 ? 's' : ''}`);
            const parts = [r.w || r.d || r.l ? [plural(r.w, 'victoire'), r.d ? plural(r.d, 'nulle') : '', plural(r.l, 'défaite')].filter(Boolean).join(' · ') : ''];
            if (r.best) parts.push(`record : ${esc(r.best.label)}${UI().when ? ` (${UI().when(r.best.date)})` : ''}`);
            return `<p class="jp-rec jf-small">🏆 ${title ? `${esc(title)} : ` : ''}${parts.filter(Boolean).join(' · ')}</p>`;
        },
    };

    /** la fenêtre des règles (bouton « ? ») */
    function rules(title, html) {
        const open = window.LCNDA_EXT?.openDialog;
        if (open) return open({eyebrow: 'LES RÈGLES', title, body: `<div class="jp-rules">${html}</div>`, wide: true});
        A().toast?.(title);
    }

    /**
     * la barre et le chrono d'une partie. o : {game, title, rulesHtml, onUndo, onHint, menu: () => items, onPause(on), canUndo: () => bool, hints: () => n|null, keys(e)}
     * rend {bar(players), settle(), pause(on), paused, elapsed(), bind(), stop()}
     */
    function shell(host, g, api, o) {
        let paused = false, startAt = Date.now(); g.ms = Number(g.ms) || 0;
        const over = () => !!g.finished;
        const elapsed = () => g.ms + (!paused && !over() ? Date.now() - startAt : 0);
        const settle = () => { if (!paused && !over()) g.ms += Date.now() - startAt; startAt = Date.now(); };
        const timer = setInterval(() => { if (!host.isConnected) return clearInterval(timer); const el = host.querySelector('[data-jp-time]'); if (el) el.textContent = fmt(elapsed()); o.onTick?.(); }, 500);
        const self = {
            get paused() { return paused; }, elapsed, settle, fmt,
            /** players : [{name, color, ai, score, on, out, extra}] */
            bar(players = []) {
                const hints = o.hints?.(), canUndo = !!o.canUndo?.();
                return `<div class="jp-bar" role="toolbar" aria-label="La partie">
                    <div class="jp-who">${players.map(p => `<span class="jp-pl ${p.on ? 'is-on' : ''} ${p.out ? 'is-out' : ''}" style="--pc:${esc(p.color || '#000')}"><i aria-hidden="true"></i><span class="jp-pl-n">${esc(p.name)}${p.ai ? ` <small>🤖 ${esc(LEVEL_TXT[p.ai] || '')}</small>` : ''}</span>${p.score != null ? `<b>${esc(p.score)}</b>` : ''}${p.extra ? `<span class="jp-pl-x">${p.extra}</span>` : ''}</span>`).join('')}</div>
                    <span class="jp-time" title="Le temps de la partie (sans les pauses)">⏱ <span data-jp-time>${fmt(elapsed())}</span></span>
                    <span class="jp-tools">
                      <button type="button" class="icon-button small" data-jp-undo title="Annuler le dernier coup" data-shortcut="⌘Z" aria-label="Annuler le dernier coup" ${canUndo ? '' : 'disabled'}>↶</button>
                      ${hints === null || hints === undefined ? '' : `<button type="button" class="button small secondary jp-hint" data-jp-hint title="Un conseil (touche H)" data-shortcut="H" ${over() || hints <= 0 ? 'disabled' : ''}>💡 <b>${hints}</b></button>`}
                      <button type="button" class="icon-button small" data-jp-pause title="${paused ? 'Reprendre' : 'Pause'} (Échap)" aria-label="${paused ? 'Reprendre' : 'Pause'}" aria-pressed="${paused}" ${over() ? 'disabled' : ''}>${paused ? '▶' : '⏸'}</button>
                      <button type="button" class="ui-help jp-help" data-jp-rules title="Les règles" aria-label="Les règles de ${esc(o.title || 'ce jeu')}">?</button>
                      ${o.menu ? '<button type="button" class="icon-button small" data-jp-more title="Plus d’actions" aria-label="Plus d’actions">⋯</button>' : ''}
                    </span></div>`;
            },
            pauseHtml: () => (paused ? `<div class="jp-pause" role="dialog" aria-label="Pause"><p class="jf-big">⏸ Pause</p><p class="muted jf-small">Le chrono est arrêté. Échap ou le bouton pour reprendre.</p><button type="button" class="button" data-jp-resume>▶ Reprendre</button></div>` : ''),
            pause(on = !paused) {
                if (over() && on) return; if (on === paused) return;
                if (on) { settle(); paused = true; } else { paused = false; startAt = Date.now(); }
                o.onPause?.(paused);
            },
            /** à appeler après chaque dessin */
            bind() {
                const sig = {signal: api.signal};
                host.querySelector('[data-jp-undo]')?.addEventListener('click', () => o.onUndo?.(), sig);
                host.querySelector('[data-jp-hint]')?.addEventListener('click', () => o.onHint?.(), sig);
                host.querySelector('[data-jp-pause]')?.addEventListener('click', () => self.pause(), sig);
                host.querySelector('[data-jp-resume]')?.addEventListener('click', () => self.pause(false), sig);
                host.querySelector('[data-jp-rules]')?.addEventListener('click', () => rules(`Les règles : ${o.title}`, o.rulesHtml?.() || ''), sig);
                const more = host.querySelector('[data-jp-more]');
                more?.addEventListener('click', () => { const items = o.menu?.() || []; if (UI().menuAt) UI().menuAt(more, items); else items.find(x => x && x.run)?.run(); }, sig);
                if (paused) host.querySelector('[data-jp-resume]')?.focus();
            },
            stop() { clearInterval(timer); },
        };
        // Échap = pause (sauf dans une fenêtre, un menu ou une case de texte) ; ⌘Z = annuler ; H = conseil
        document.addEventListener('keydown', e => {
            if (!host.isConnected || e.defaultPrevented) return;
            if (e.target.closest?.('input, textarea, select, [contenteditable], dialog, .ui-actmenu') || document.querySelector('dialog[open]')) return;
            if (e.key === 'Escape') { if (o.keys?.(e)) return; e.preventDefault(); self.pause(); return; }
            if (paused) return;
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (o.canUndo?.()) o.onUndo?.(); return; }
            if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'h' && o.onHint && (o.hints?.() ?? 0) > 0 && !over()) { e.preventDefault(); o.onHint(); return; }
            o.keys?.(e);
        }, {signal: api.signal});
        // le chrono ne compte pas quand la partie n'est pas à l'écran
        const vis = () => { if (document.hidden && !paused) self.pause(true); };
        document.addEventListener('visibilitychange', vis, {signal: api.signal});
        return self;
    }

    /** clavier sur une grille de cases [data-r][data-c] : une seule case dans l'ordre de Tab, les flèches promènent, Entrée / Espace = clic */
    function gridNav(grid, signal, {onEnter} = {}) {
        if (!grid) return;
        const cells = () => [...grid.querySelectorAll('[data-r][data-c]')];
        const all = cells(); if (!all.length) return;
        const cur = all.find(c => c.tabIndex === 0) || grid.querySelector('.is-sel') || all[0];
        all.forEach(c => { c.tabIndex = c === cur ? 0 : -1; });
        grid.addEventListener('keydown', e => {
            const b = e.target.closest('[data-r][data-c]'); if (!b) return;
            const d = {ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0]}[e.key];
            if (d) {
                e.preventDefault();
                const r = Number(b.dataset.r), c = Number(b.dataset.c), vr = Number(b.dataset.vr ?? r), vc = Number(b.dataset.vc ?? c);
                const next = cells().find(x => Number(x.dataset.vr ?? x.dataset.r) === vr + d[0] && Number(x.dataset.vc ?? x.dataset.c) === vc + d[1]);
                if (next) { cells().forEach(x => { x.tabIndex = -1; }); next.tabIndex = 0; next.focus(); }
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEnter ? onEnter(b) : b.click(); }
        }, {signal});
    }
    /** toucher / cliquer une pièce puis sa case, ou la glisser : canPick(cell) → bool, pick(cell), drop(cell) */
    function boardPointer(grid, signal, {canPick, pick, drop}) {
        if (!grid) return;
        let start = null, moved = false;
        grid.addEventListener('pointerdown', e => { if (e.button !== 0) return; const c = e.target.closest('[data-r][data-c]'); if (!c || !canPick(c)) { start = null; return; } start = {c, x: e.clientX, y: e.clientY}; moved = false; }, {signal});
        grid.addEventListener('pointermove', e => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { if (!moved) { moved = true; pick(start.c); grid.classList.add('is-dragging'); } } }, {signal});
        const up = e => {
            if (!start) return; const s = start; start = null; grid.classList.remove('is-dragging');
            if (!moved) return;
            const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-r][data-c]');
            grid.dataset.jpDropped = '1'; setTimeout(() => { delete grid.dataset.jpDropped; }, 0);
            if (under && grid.contains(under) && under !== s.c) drop(under);
        };
        window.addEventListener('pointerup', up, {signal});
        grid.addEventListener('pointercancel', () => { start = null; grid.classList.remove('is-dragging'); }, {signal});
    }
    const justDropped = grid => !!grid?.dataset.jpDropped;

    window.LCNDA_JEUX_PLATEAU = {LEVELS, LEVEL_TXT, levelSelect, cleanAi, calm, ancestors, records, shell, gridNav, boardPointer, justDropped, rules, fmt, esc};
})();
