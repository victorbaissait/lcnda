/* LCNDA — ✏️ Harmonisation K18, K19, K20 (validé) : le bas, la colonne d’outils et les poignées des éditeurs.
 * Mode d’emploi : docs/UI.md (« K18 — Barre du bas des éditeurs », « K19 — Colonne d’outils », « K20 — Poignées »).
 * - UI.editorStatus({where, help, zoom, magnet, rulers, wheel}) → la barre du bas : à gauche où l’on est, au milieu
 *   l’aide de l’outil choisi, à droite 🧲 · 📏 · [− 100 % ▾ +]. ⌘ + molette, ⌘0, ⌘1, ⌘+ et ⌘− marchent partout.
 * - UI.zoomControl({get, set, fit}) → le zoom seul [− 100 % ▾ +] (menu : Ajuster, 50 %, 100 %, 200 %).
 * - UI.editorRail(el, {breaks}) → la colonne d’outils de 36 px, groupes séparés par un trait fin.
 * - UI.saveMenu(bouton, items) → « 💾 Enregistrer ▾ » : les autres façons d’enregistrer (copie, version…) dans son menu.
 * - UI.editorMenus(barre, {Fichier: () => items, …}) → les menus du haut (E1) faits avec le menu de l’app (UI.menuAt).
 * - UI.editorHistory({get, set, onChange}) → un vrai historique ↶ ↷ (instantanés), pour les éditeurs qui n’en ont pas.
 * Les poignées ⠿ (Alt + ↑ / ↓) et les poignées autour des objets sont dans heritage-dnd.js et editeurs.css.
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const shown = el => !!el && el.isConnected && el.getClientRects().length > 0;

    /* ═════ K18 — Le zoom : [− 100 % ▾ +] ═════ */
    /** zoomControl({get, set, fit, min, max, step}) : get() → 1 pour 100 % ; set(k) ; fit() = ajuster à la fenêtre */
    UI.zoomControl = ({get = () => 1, set = () => {}, fit = null, min = 0.05, max = 8, step = 1.25, fitLabel = 'Ajuster à la fenêtre'} = {}) => {
        const el = document.createElement('span');
        el.className = 'ed-zoom'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Zoom');
        el.innerHTML = `<button type="button" class="ed-zoom-b" data-ed-zoom="out" title="Zoom arrière" aria-label="Zoom arrière" data-shortcut="⌘−">−</button><button type="button" class="ed-zoom-v" data-ed-zoom="menu" title="Zoom : ajuster, 50 %, 100 %, 200 %" aria-haspopup="menu" aria-expanded="false"><span data-ed-zoom-val>100 %</span><span class="ed-zoom-caret" aria-hidden="true">▾</span></button><button type="button" class="ed-zoom-b" data-ed-zoom="in" title="Zoom avant" aria-label="Zoom avant" data-shortcut="⌘+">+</button>`;
        const val = el.querySelector('[data-ed-zoom-val]');
        const z = {
            get: () => { const k = Number(get()); return Number.isFinite(k) && k > 0 ? k : 1; },
            set: k => { try { set(clamp(k, min, max)); } catch (e) { console.error(e); } z.sync(); },
            in: () => z.set(z.get() * step), out: () => z.set(z.get() / step),
            fit: () => { try { if (fit) fit(); else set(1); } catch (e) { console.error(e); } z.sync(); },
            actual: () => z.set(1),
            sync: () => { const k = z.get(); val.textContent = `${Math.round(k * 100)} %`; el.querySelector('[data-ed-zoom="out"]').disabled = k <= min * 1.001; el.querySelector('[data-ed-zoom="in"]').disabled = k >= max * 0.999; },
            menu: anchor => UI.menuAt?.(anchor, [{icon: '⤢', label: fitLabel, shortcut: '⌘0', run: z.fit}, '-', {label: '50 %', run: () => z.set(0.5)}, {label: '100 %', shortcut: '⌘1', run: z.actual}, {label: '200 %', run: () => z.set(2)}], {title: 'Zoom'}),
        };
        el.addEventListener('click', e => { const b = e.target.closest('[data-ed-zoom]'); if (!b) return; e.preventDefault(); ({out: z.out, in: z.in, menu: () => z.menu(b)})[b.dataset.edZoom]?.(); });
        el._edZoom = z; z.sync();
        return el;
    };
    /** ⌘ + molette (ou Ctrl + molette, ou pincer sur un pavé) sur un élément : le zoom commun, autour du centre */
    UI.bindZoomWheel = (target, z) => {
        if (!target || !z || target._edWheel) return; target._edWheel = true;
        target.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); z.set(z.get() * Math.exp(-e.deltaY * 0.0022)); }, {passive: false});
    };

    /* ═════ K18 — La barre du bas ═════ */
    /** editorStatus({where, help, zoom:{get,set,fit,min,max}, magnet:{get,set}, rulers:{get,set}, wheel}) → <footer class="ed-status">
     *  where : texte ou élément (la navigation des pages, par exemple) ; help : l’aide de l’outil choisi (texte).
     *  Renvoie la barre avec .setWhere(t), .setHelp(t), .sync() (relit le zoom et les interrupteurs), .zoom (l’API du zoom). */
    UI.editorStatus = ({where = '', help = '', zoom = null, magnet = null, rulers = null, wheel = null, magnetTitle = 'Aimanter : les objets se collent aux autres et à la grille (Alt pour s’en passer en glissant)', rulersTitle = 'Règles : montrer ou cacher'} = {}) => {
        const bar = document.createElement('footer');
        bar.className = 'ed-status'; bar.setAttribute('data-ed-status', ''); bar.setAttribute('data-dnd-off', '');
        bar.innerHTML = `<span class="ed-status-where" data-ed-where></span><span class="ed-status-help" data-ed-help aria-live="polite"></span><span class="ed-status-right" data-ed-right></span>`;
        const W = bar.querySelector('[data-ed-where]'), Hp = bar.querySelector('[data-ed-help]'), R = bar.querySelector('[data-ed-right]');
        const tog = (cls, icon, title, label, o) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = `ed-tog ${cls}`; b.textContent = icon; b.title = title; b.setAttribute('aria-label', label);
            const paint = () => { const on = !!o.get(); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
            b.addEventListener('click', () => { try { o.set(!o.get()); } catch (e) { console.error(e); } paint(); });
            b._paint = paint; paint(); R.appendChild(b); return b;
        };
        if (magnet) bar.magnetBtn = tog('ed-magnet', '🧲', magnetTitle, 'Aimanter', magnet);
        if (rulers) bar.rulersBtn = tog('ed-rulers', '📏', rulersTitle, 'Règles', rulers);
        if (zoom) { const zc = UI.zoomControl(zoom); R.appendChild(zc); bar.zoom = zc._edZoom; if (wheel) UI.bindZoomWheel(wheel, bar.zoom); }
        bar.setWhere = v => { if (v instanceof Node) { W.textContent = ''; W.appendChild(v); } else if (W.textContent !== String(v ?? '')) W.textContent = String(v ?? ''); };
        const paintHelp = t => { if (Hp.textContent !== t) { Hp.textContent = t; Hp.title = t; } };
        let base = '', flashT = 0;
        bar.setHelp = v => { base = String(v ?? ''); if (!flashT) paintHelp(base); };
        /** un message court (ce qui vient de se faire) à la place de l’aide, puis l’aide revient */
        bar.flash = (v, ms = 5000) => { clearTimeout(flashT); flashT = 0; Hp.classList.remove('is-flash'); const t = String(v ?? ''); if (!t) { paintHelp(base); return; } paintHelp(t); Hp.classList.add('is-flash'); flashT = setTimeout(() => { flashT = 0; Hp.classList.remove('is-flash'); paintHelp(base); }, ms); };
        bar.sync = () => { bar.zoom?.sync(); bar.magnetBtn?._paint(); bar.rulersBtn?._paint(); };
        bar.setWhere(where); bar.setHelp(help);
        return bar;
    };
    // ⌘0 ajuster, ⌘1 100 %, ⌘+ / ⌘− : dans l’éditeur du dessus (fenêtre ouverte, sinon la page), avant les touches de l’outil
    const topStatus = () => {
        const open = [...document.querySelectorAll('dialog[open]')].at(-1);
        const host = open || document.getElementById('workspace') || document.body;
        return [...host.querySelectorAll('[data-ed-status]')].find(b => b.zoom && shown(b)) || null;
    };
    UI.editorZoomKey = dir => { const b = topStatus(); if (!b) return false; const z = b.zoom; if (dir === 0) z.fit(); else if (dir === 1.5) z.actual(); else if (dir > 0) z.in(); else z.out(); return true; };
    document.addEventListener('keydown', e => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
        const dir = ['+', '='].includes(e.key) || e.code === 'NumpadAdd' ? 1 : e.key === '-' || e.code === 'NumpadSubtract' ? -1 : e.key === '0' || e.code === 'Numpad0' ? 0 : e.key === '1' && !e.shiftKey ? 1.5 : null;
        if (dir === null) return;
        if (UI.editorZoomKey(dir)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    /* ═════ K19 — La colonne d’outils : 36 px, groupes séparés par un trait ═════ */
    /** editorRail(el, {breaks: [sélecteur…]}) : un trait fin avant chaque élément nommé (début d’un groupe) */
    UI.editorRail = (el, {breaks = []} = {}) => {
        if (!el) return el;
        el.classList.add('ed-rail'); el.setAttribute('role', el.getAttribute('role') || 'toolbar'); el.setAttribute('aria-orientation', 'vertical');
        breaks.forEach(s => { const t = el.querySelector(s); if (t && !t.previousElementSibling?.classList.contains('ed-rail-sep')) { const sep = document.createElement('span'); sep.className = 'ed-rail-sep'; sep.setAttribute('role', 'separator'); t.before(sep); } });
        return el;
    };

    /** railProxy(rail, boutons, {icons}) : des boutons d’une barre (avec leur texte) passent dans la colonne d’outils :
     *  une case de 36 px avec l’icône (le texte en bulle), qui presse le bouton d’origine (caché, ses écouteurs restent) ;
     *  désactivé, choisi ou caché : la case suit le bouton d’origine. */
    const firstIcon = t => { const m = String(t || '').trim().match(/^(\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*|[^\s\p{L}\p{N}]+)/u); return m ? m[1] : String(t || '').trim().slice(0, 1); };
    UI.railProxy = (rail, buttons, {icons = {}, key = b => b.dataset.mtOp || b.dataset.avxOp || ''} = {}) => {
        if (!rail) return [];
        return [...buttons].map(b => {
            const txt = (b.textContent || '').replace(/\s+/g, ' ').trim(), k = key(b), p = document.createElement('button');
            p.type = 'button'; p.className = 'ed-tool'; p.dataset.edProxy = k; p.textContent = icons[k] || firstIcon(txt.replace(/^[←]\s*/, '← ').replace(/\s*→$/, '')) || '•';
            const label = txt.replace(/^[^\p{L}]+/u, '').trim() || b.title; p.title = b.title && !b.title.startsWith(label) ? `${label} — ${b.title}` : (b.title || label); p.setAttribute('aria-label', label);
            if (b.dataset.shortcut) p.dataset.shortcut = b.dataset.shortcut;
            p.addEventListener('click', () => b.click());
            const sync = () => { p.disabled = b.disabled; p.hidden = b.hidden || b.style.display === 'none'; p.classList.toggle('is-active', b.classList.contains('is-on') || b.classList.contains('is-active')); };
            new MutationObserver(sync).observe(b, {attributes: true, attributeFilter: ['disabled', 'class', 'hidden', 'style']}); sync();
            b.classList.add('ed-old-hidden'); rail.appendChild(p); return p;
        });
    };

    /* ═════ K19 / E1 — « 💾 Enregistrer ▾ » : les actions de fin, seulement en haut ═════ */
    /** saveMenu(bouton💾, () => items) : pose « ▾ » collé au bouton ; items au format UI.menuAt */
    UI.saveMenu = (btn, items) => {
        if (!btn || btn.nextElementSibling?.matches('.ed-save-more')) return null;
        const more = document.createElement('button'); more.type = 'button'; more.className = `${btn.className} ed-save-more`.replace(/\bh-[a-z-]+\b/g, '').trim(); more.textContent = '▾';
        more.title = 'Les autres façons d’enregistrer'; more.setAttribute('aria-label', 'Les autres façons d’enregistrer'); more.setAttribute('aria-haspopup', 'menu');
        btn.classList.add('ed-save-main'); btn.after(more);
        const wrap = document.createElement('span'); wrap.className = 'ed-save'; btn.before(wrap); wrap.append(btn, more);
        more.addEventListener('click', e => { e.preventDefault(); UI.menuAt?.(more, typeof items === 'function' ? items() : items, {title: 'Enregistrer'}); });
        return more;
    };

    /* ═════ E1 — Les menus du haut (Fichier, Édition, Affichage…) avec le menu de l’app ═════ */
    /** editorMenus(nav, {Fichier: () => [{icon, label, shortcut, run, disabled}…], …}) : un bouton par menu, le menu de l’app en dessous */
    UI.editorMenus = (nav, defs = {}) => {
        if (!nav) return nav;
        nav.classList.add('ui-topbar-menus', 'ed-menus');
        nav.innerHTML = Object.keys(defs).map(m => `<button type="button" class="ui-topbar-menu" data-ui-menu="${esc(m)}" aria-haspopup="menu" aria-expanded="false">${esc(m)}</button>`).join('');
        nav.addEventListener('click', e => { const b = e.target.closest('[data-ui-menu]'); if (!b) return; const f = defs[b.dataset.uiMenu]; if (f) UI.menuAt?.(b, f()); });
        return nav;
    };

    /* ═════ K2 — Une fenêtre de réglages qui s’enregistre toute seule (sans bouton « Enregistrer ») ═════ */
    /** autoSaveDialog(dlg, {keys, save, reload, reset, label}) : keys = les clés localStorage des réglages ;
     *  save() lit la fenêtre et écrit les clés (après chaque changement) ; reload() remet la fenêtre d’après les clés ;
     *  reset() remet les réglages de départ (bouton [data-ui-reset] « ↺ Remettre comme au départ », sans question).
     *  « ✓ Enregistré » s’affiche dans le haut de la fenêtre, et un message H7 avec « ↶ Annuler » / « ↷ Rétablir ». */
    UI.autoSaveDialog = (dlg, {keys = [], save = () => {}, reload = () => {}, reset = null, label = 'Réglage changé', onChange = () => {}} = {}) => {
        if (!dlg || dlg._edAuto) return dlg; dlg._edAuto = true;
        const read = () => { const o = {}; keys.forEach(k => { try { o[k] = localStorage.getItem(k); } catch (_) { o[k] = null; } }); return o; };
        const write = o => keys.forEach(k => { try { if (o[k] === null || o[k] === undefined) localStorage.removeItem(k); else localStorage.setItem(k, o[k]); } catch (_) {} });
        const head = dlg.querySelector('.modal-head') || dlg.querySelector('form') || dlg;
        let st = head.querySelector(':scope > [data-ed-saved]');
        if (!st) { st = document.createElement('span'); st.className = 'ui-status ed-dlg-saved'; st.setAttribute('data-ed-saved', ''); st.setAttribute('role', 'status'); const x = head.querySelector(':scope > .icon-button, :scope > [data-ui-x]'); if (x) x.before(st); else head.appendChild(st); }
        let base = read(), t = 0;
        const shown = () => UI.savedStatus?.(st, 'saved');
        const announce = (before, after, what) => { shown(); onChange(); const A0 = A(); (A0.undoToast || A0.toast)?.(`${what} : enregistré.`, {undo: () => { write(before); base = read(); reload(); shown(); onChange(); }, redo: () => { write(after); base = read(); reload(); shown(); onChange(); }}); };
        const check = (what = label) => { clearTimeout(t); t = 0; try { save(); } catch (e) { console.warn(e); return; } const now = read(); if (keys.every(k => now[k] === base[k])) return; const before = base; base = now; announce(before, now, what); };
        const later = e => { if (e.target.closest?.('[data-ui-x], .modal-actions')) return; clearTimeout(t); t = setTimeout(() => check(), e.type === 'input' && /^(text|search|number)$/.test(e.target.type || '') ? 500 : 60); };
        dlg.addEventListener('input', later); dlg.addEventListener('change', later);
        dlg.addEventListener('click', e => { const r = e.target.closest('[data-ui-reset]'); if (!r || !reset) return; e.preventDefault(); e.stopImmediatePropagation(); const before = base; reset(); base = read(); reload(); if (keys.some(k => before[k] !== base[k])) announce(before, base, 'Réglages remis comme au départ'); }, true);
        dlg.addEventListener('close', () => { if (t) check(); });
        dlg._edCheck = check;
        return dlg;
    };

    /* ═════ K2 — Apparence : les listes à ranger (menu, listes, cartes, onglets…) s’enregistrent toutes seules ═════
     * Chaque changement (case, nom, ⠿ glissé, Alt + ↑ / ↓) presse tout seul le bouton « Enregistrer » de la liste, désormais caché ;
     * la page de réglages (K2, UI.autoSave) montre alors « ✓ Enregistré » et propose « ↶ Annuler ». */
    const AUTO_ORDER = ['menu-order', 'list-order', 'map-order', 'maintenance-order', 'graph-diagram-order', 'graph-stats-order', 'tile-layers', 'dashboard-widget-catalog-order'];
    const autoOrderBtn = el => { const sec = el?.closest?.('.order-editor'); if (!sec) return null; const b = sec.querySelector('[data-order-save]'); return b && AUTO_ORDER.includes(b.dataset.orderSave) ? b : null; };
    let orderT = 0;
    // l'enregistrement redessine la page : on remet le curseur dans la même case (et ce qu'on y a tapé entre-temps),
    // sinon, après Tab, ce qu'on tape part dans le vide
    const FOCUSABLE = 'input, select, textarea, button, [tabindex]';
    const keepFocus = () => {
        const old = document.activeElement, ws = document.getElementById('workspace');
        if (!old || !ws?.contains(old) || old === ws) return;
        const all = () => [...ws.querySelectorAll(FOCUSABLE)];
        const sig = el => el.tagName + [...el.attributes].filter(a => /^(data-|name$|type$|id$)/.test(a.name)).map(a => `${a.name}=${a.value}`).sort().join('|');
        const want = sig(old), idx = all().filter(e => sig(e) === want).indexOf(old), t0 = performance.now(), atSave = old.value;
        const look = () => {
            if (old.isConnected) { if (performance.now() - t0 < 3000) requestAnimationFrame(look); return; }
            const a = document.activeElement; if (a && a !== document.body && a !== document.documentElement) return; // on a cliqué ailleurs
            const el = all().filter(e => sig(e) === want)[Math.max(0, idx)]; if (!el) return;
            const typed = 'value' in old && 'value' in el && !/^(checkbox|radio)$/.test(old.type || '') && old.value !== atSave && old.value !== el.value ? old.value : null; // tapé après l'enregistrement
            el.focus({preventScroll: true});
            if (typed != null) { el.value = typed; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
            try { if (typeof old.selectionStart === 'number' && typeof el.setSelectionRange === 'function') el.setSelectionRange(old.selectionStart, old.selectionEnd); } catch (_) { /* case sans sélection */ }
        };
        requestAnimationFrame(look);
    };
    const autoOrder = (el, ms = 30) => { const b = autoOrderBtn(el); if (!b) return; clearTimeout(orderT); orderT = setTimeout(() => { if (!b.isConnected) return; const h = b.closest('.order-editor')?.querySelector('h3, h4')?.textContent.trim(); if (h) b.setAttribute('aria-label', h); b.dataset.edAuto = '1'; keepFocus(); try { b.click(); } finally { delete b.dataset.edAuto; } }, ms); };
    document.addEventListener('change', e => { if (e.target.closest?.('#workspace .order-editor') && !e.target.closest('[data-order-save]')) autoOrder(e.target); }, true);
    ['drop', 'dragend'].forEach(t => document.addEventListener(t, e => { if (e.target.closest?.('#workspace .order-editor')) autoOrder(e.target, 60); }));
    document.addEventListener('click', e => { const b = e.target.closest?.('#workspace .order-editor button'); if (b && !b.matches('[data-order-save]') && /^[↑↓]$/.test(b.textContent.trim())) autoOrder(b, 60); });
    document.addEventListener('keydown', e => { if (e.altKey && /^Arrow(Up|Down)$/.test(e.key) && e.target.closest?.('#workspace .order-editor')) autoOrder(e.target, 250); });
    UI.autoOrderSave = AUTO_ORDER; // pour les essais

    /* ═════ E1 — Un vrai historique ↶ ↷ ═════ */
    /** editorHistory({get, set, limit, onChange}) : get() → l’état (texte JSON ou objet), set(état) le remet.
     *  .commit() après chaque changement ; .undo() ; .redo() ; .canUndo() ; .canRedo() ; .reset() (le point de départ) */
    UI.editorHistory = ({get, set, limit = 150, onChange = () => {}} = {}) => {
        let steps = [], pos = -1;
        const read = () => { const v = get(); return typeof v === 'string' ? v : JSON.stringify(v); };
        const h = {
            commit: () => { const s = read(); if (pos >= 0 && steps[pos] === s) return false; steps = steps.slice(0, pos + 1); steps.push(s); if (steps.length > limit) steps.shift(); pos = steps.length - 1; onChange(h); return true; },
            go: i => { if (i < 0 || i >= steps.length || i === pos) return false; pos = i; set(JSON.parse(steps[i])); onChange(h); return true; },
            undo: () => h.go(pos - 1), redo: () => h.go(pos + 1),
            canUndo: () => pos > 0, canRedo: () => pos < steps.length - 1, changed: () => pos > 0,
            reset: () => { steps = []; pos = -1; h.commit(); },
        };
        return h;
    };
})();
