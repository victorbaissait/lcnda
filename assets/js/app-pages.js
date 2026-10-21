/* LCNDA — 🧭 Harmonisation K (validé) : l’en-tête de page unique (K5) et les réglages enregistrés tout seuls (K2).
 * Mode d’emploi : docs/UI.md (« K5 — En-tête de page » et « K2 — Réglages enregistrés tout seuls »).
 * - UI.pageHeader({...}) → le HTML de l’en-tête : sur-titre = l’endroit, titre = nom avec l’icône du menu, une phrase d’aide,
 *   à droite : bouton principal bleu, 2 boutons au plus, « ⋯ » pour le reste, puis ⭐.
 * - Tout en-tête de page (.page-header) de #workspace est rangé pareil, même s’il n’a pas été fait par UI.pageHeader
 *   (UI.harmonizePageHeader : mêmes éléments, mêmes écouteurs ; les boutons sont déplacés, jamais recréés).
 * - UI.autoSave(...) : en Maintenance, chaque changement est gardé tout de suite ; « ✓ Enregistré » à droite du titre
 *   et un message H7 avec « ↶ Annuler » pour le dernier changement.
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const EMOJI_RE = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[️‍⃣]|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator})*)\s*/u;
    const shown = el => !el.hidden && el.style.display !== 'none';
    const fold = t => String(t || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    /* ═════ K5 — où suis-je ? (sur-titre et icône) ═════ */
    const MODULE_NAMES = {dashboard: 'Tableau de bord', personnes: 'Personnes', animaux: 'Animaux', graphiques: 'Graphiques', carte: 'Carte', listes: 'Listes', chronologie: 'Chronologie', recherche: 'Recherche', enquetes: 'Enquêtes', fiches: 'Fiches', adn: 'ADN', comparaison: 'Comparaison', maintenance: 'Maintenance'};
    function navOf(module) {
        const b = document.querySelector('.main-nav .nav-item.is-active') || document.querySelector(`.main-nav .nav-item[data-module="${module}"]:not([data-board])`);
        const t = b ? [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
        const m = t.match(EMOJI_RE);
        return {icon: m ? m[1] : '', label: (m ? t.slice(m[0].length) : t) || MODULE_NAMES[module] || ''};
    }
    function groupOf(name, key) {
        try {
            const inst = window.LCNDA_SIDEGROUPS?.instances?.[name]; const p = inst?.prefs?.();
            const g = p?.groups?.find(x => x.items.includes(key));
            if (g) return {icon: g.icon, label: g.label};
        } catch (_) {}
        if (name === 'listes' && String(key || '').startsWith('mylist:')) return {icon: '⭐', label: 'Mes listes'};
        return null;
    }
    function itemOf(module, key) {
        try {
            if (module === 'listes') { const r = (A().orderedListTypes?.(true) || []).find(x => x[0] === key) || (window.LCNDA_EXT?.extraListTypes?.() || []).find(x => x[0] === key); return r ? r[2] : ''; }
            if (module === 'maintenance') { const r = (A().orderedMaintenanceTabs?.() || []).find(x => x[0] === key); return r ? r[2] : ''; }
        } catch (_) {}
        return '';
    }
    /** pagePlace({detail}) → {where: « Listes · Médias et documents », icon} : l’endroit où l’on est, d’après le menu */
    UI.pagePlace = ({detail = false} = {}) => {
        const st = A().state || {}, mod = st.module || '';
        const nav = navOf(mod);
        if (mod === 'listes' || mod === 'maintenance') {
            const key = mod === 'listes' ? st.listType : st.maintenanceTab;
            const g = key ? groupOf(mod, key) : null, item = key ? itemOf(mod, key) : '';
            if (detail && item) return {where: `${nav.label} · ${item}`, icon: g?.icon || ''};
            return {where: g ? `${nav.label} · ${g.label}` : nav.label, icon: g?.icon || ''};
        }
        return {where: nav.label, icon: nav.icon};
    };

    /* ═════ K5 — UI.pageHeader ═════ */
    /**
     * pageHeader({where, icon, title, titleHtml, help, helpId, back, primary, actions, more, saved, detail, cls, attrs}) → HTML
     * - where : le sur-titre (par défaut : l’endroit d’après le menu, ex. « Listes · Médias et documents ») ;
     * - icon : l’icône du titre (par défaut : celle du menu) ; title / titleHtml : le nom (jamais un nombre : le nombre va dans la barre H10) ;
     * - help : une phrase d’aide (HTML), helpId pour la mettre à jour ; back : un lien « ← Tous les… » (HTML) ;
     * - primary : le bouton principal bleu (HTML) ; actions : [HTML] (2 visibles, le reste dans « ⋯ ») ; more : [HTML] toujours dans « ⋯ » ;
     * - saved : true sur une page de réglages (« ✓ Enregistré ») ; detail : true pour la page d’un élément (« Listes · Recueils »).
     */
    UI.pageHeader = (o = {}) => {
        const icon = o.icon ?? '';
        const attrs = [o.where != null ? `data-ph-where="${esc(o.where)}"` : '', o.detail ? 'data-ph-detail' : '', o.attrs || ''].filter(Boolean).join(' ');
        const acts = [].concat(o.actions || []).filter(Boolean), more = [].concat(o.more || []).filter(Boolean);
        const where = o.where != null ? o.where : '';
        return `<header class="page-header ui-ph${o.cls ? ' ' + o.cls : ''}"${attrs ? ' ' + attrs : ''}><div class="ui-ph-text">${o.back || ''}<span class="eyebrow">${esc(where)}</span>`
            + `<h2>${icon ? `<span class="ui-ph-ico" aria-hidden="true">${esc(icon)}</span>` : ''}${o.titleHtml != null ? o.titleHtml : esc(o.title || '')}</h2>`
            + `${o.help != null && o.help !== '' ? `<p${o.helpId ? ` id="${esc(o.helpId)}"` : ''}>${o.help}</p>` : o.helpId ? `<p id="${esc(o.helpId)}"></p>` : ''}</div>`
            + `<div class="page-actions ui-ph-actions">${o.saved ? '<span class="ui-ph-saved" data-ui-saved role="status">✓ Enregistré</span>' : ''}${o.primary || ''}${acts.join('')}`
            + `${more.length ? `<details class="ui-ph-more"><summary class="button secondary ui-ph-more-btn" title="Plus d’actions" aria-label="Plus d’actions">⋯</summary><div class="ui-ph-menu" role="menu">${more.join('')}</div></details>` : ''}</div></header>`;
    };

    /* le menu « ⋯ » de l’en-tête : un <details> ; il se ferme après un choix, un clic ailleurs ou Échap */
    const moreHtml = '<summary class="button secondary ui-ph-more-btn" title="Plus d’actions" aria-label="Plus d’actions">⋯</summary><div class="ui-ph-menu" role="menu"></div>';
    const MORE_SEL = 'details.ui-ph-more, details.ui-more';
    /* dans un menu ⋯, un bouton qui n’a qu’une icône (↗, ✎, 🗑) reçoit son nom écrit (sa bulle) */
    const fillMenu = menu => menu.querySelectorAll(':scope > button, :scope > a, :scope > label').forEach(b => {
        if (b.dataset.uiMenuDone) return; b.dataset.uiMenuDone = '1';
        const t = (b.textContent || '').trim(), name = b.getAttribute('aria-label') || b.title || '';
        if (name && t.length <= 2 && !t.includes(name)) b.insertAdjacentText('beforeend', ' ' + name);
    });
    document.addEventListener('click', e => {
        const sum = e.target.closest?.('details.ui-ph-more > summary, details.ui-more > summary');
        if (sum) { const m = sum.parentElement.querySelector('.ui-ph-menu'); if (m) fillMenu(m); }
        const inMenu = e.target.closest?.('.ui-ph-menu');
        document.querySelectorAll(MORE_SEL).forEach(d => { if (!d.open) return; if (inMenu ? d.contains(inMenu) : !d.contains(e.target)) setTimeout(() => d.removeAttribute('open')); });
    });
    document.addEventListener('click', e => { const p = e.target.closest?.('.ui-ph-text > p.is-clamped'); if (p && !e.target.closest('a, button')) p.classList.toggle('is-open'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll(MORE_SEL).forEach(d => { if (!d.open) return; d.removeAttribute('open'); d.querySelector('summary')?.focus(); }); });

    const isPrimary = el => el.matches('.button:not(.secondary):not(.danger):not(.ghost):not(.h-sc-star)') && !el.matches('label');
    const isReset = el => /^\s*(↺\s*)?(remettre|tout remettre|tout réinitialiser|réinitialiser)/i.test(el.textContent || '');
    const SETTINGS_TABS = ['design', 'designs', 'design_board', 'design_sheets', 'design_maps', 'accessibilite', 'raccourcis', 'board_prefs', 'pet_prefs', 'montage_prefs', 'dna_prefs', 'viewer_prefs', 'diagram_kinds', 'atelier', 'htr'];
    UI.settingsTabs = SETTINGS_TABS;

    /** harmonizePageHeader(head) : range un en-tête existant comme UI.pageHeader (idempotent) */
    UI.harmonizePageHeader = head => {
        if (!head || head.closest('dialog') || head.hasAttribute('data-ph-off')) return;
        head.classList.add('ui-ph');
        const st = A().state || {};
        const h2 = head.querySelector('h1, h2');
        let text = h2?.parentElement && h2.parentElement !== head ? h2.parentElement : null;
        if (text && !text.classList.contains('ui-ph-text')) text.classList.add('ui-ph-text');
        const detail = head.hasAttribute('data-ph-detail') || !!head.querySelector('.back-link');
        const place = UI.pagePlace({detail});
        // sur-titre = l’endroit
        if (h2) {
            let eb = head.querySelector('.eyebrow');
            const mod = st.module || '', had = (eb?.textContent || '').trim(), nav = place.where;
            let want = head.hasAttribute('data-ph-where') ? (head.getAttribute('data-ph-where') || nav) : nav;
            // hors Listes et Maintenance : un sur-titre qui dit déjà l’endroit reste ; en Recherche, la sorte de recherche suit « Recherche · »
            if (!head.hasAttribute('data-ph-where') && mod !== 'listes' && mod !== 'maintenance' && had) {
                if (fold(had).startsWith(fold(nav))) want = had;
                else if (mod === 'recherche') want = `${nav} · ${had}`;
            }
            if (!eb) { eb = document.createElement('span'); eb.className = 'eyebrow'; h2.before(eb); }
            if (want && eb.textContent !== want) eb.textContent = want;
            // titre : l’icône du menu devant le nom (ou celle déjà écrite, rangée pareil)
            if (!h2.querySelector('.ui-ph-ico') && !h2.hasAttribute('data-ph-noicon')) {
                const first = h2.firstChild, m = first && first.nodeType === 3 ? first.textContent.match(EMOJI_RE) : null;
                const ico = document.createElement('span'); ico.className = 'ui-ph-ico'; ico.setAttribute('aria-hidden', 'true');
                if (m) { ico.textContent = m[1]; first.textContent = first.textContent.slice(m[0].length); h2.prepend(ico); }
                else if (place.icon && (!first || first.nodeType === 3 || first.nodeType === 1) && !(h2.textContent || '').trim().match(EMOJI_RE)) { ico.textContent = place.icon; h2.prepend(ico); }
            }
        }
        // Maintenance : le titre est le nom de la page dans le menu (« Étiquettes », pas « Catégoriser sans modifier les actes »)
        if (h2 && st.module === 'maintenance' && !detail && !head.hasAttribute('data-ph-title')) {
            const name = itemOf('maintenance', st.maintenanceTab), ico = h2.querySelector(':scope > .ui-ph-ico');
            const rest = [...h2.childNodes].filter(n => n !== ico);
            if (name && rest.every(n => n.nodeType === 3) && rest.map(n => n.textContent).join('').trim() !== name) { rest.forEach(n => n.remove()); h2.append(name); }
        }
        // la phrase d’aide : 2 lignes au plus, un clic pour lire la suite
        const help = text?.querySelector(':scope > p');
        if (help && !help.dataset.phClamp) { help.dataset.phClamp = '1'; requestAnimationFrame(() => { if (help.scrollHeight > help.clientHeight + 2) { help.classList.add('is-clamped'); help.title = 'Clique pour lire la suite'; } }); }
        // à droite : ✓ Enregistré · bouton bleu · 2 boutons · ⋯ · ⭐
        let acts = head.querySelector(':scope > .page-actions');
        if (!acts) { acts = document.createElement('div'); acts.className = 'page-actions'; head.appendChild(acts); }
        acts.classList.add('ui-ph-actions');
        // des boutons laissés sous le texte (dans la colonne du titre) rejoignent la droite
        if (text) [...text.querySelectorAll(':scope > .page-actions')].forEach(x => { [...x.children].forEach(c => acts.appendChild(c)); x.remove(); });
        [...head.querySelectorAll(':scope > .page-actions')].filter(x => x !== acts).forEach(x => { [...x.children].forEach(c => acts.appendChild(c)); x.remove(); });
        // un bouton posé à même l’en-tête (sans zone de boutons) la rejoint aussi
        [...head.children].filter(c => c !== acts && c !== text && c.matches('button, a.button, label.button, label.media-filter-label, details')).forEach(c => acts.appendChild(c));
        let more = acts.querySelector(':scope > details.ui-ph-more');
        const saved = acts.querySelector(':scope > .ui-ph-saved');
        const star = acts.querySelector(':scope > [data-sc-star]');
        const items = [...acts.children].filter(el => el !== more && el !== saved && el !== star).concat(more ? [...more.querySelector('.ui-ph-menu').children] : []);
        const vis = items.filter(shown);
        const primary = vis.find(isPrimary) || null;
        const reset = vis.find(isReset) || null;
        const others = vis.filter(x => x !== primary && x !== reset);
        const front = [reset, ...others].filter(Boolean).slice(0, 2);
        const over = items.filter(x => x !== primary && !front.includes(x));
        if (reset && !reset.children.length && reset.textContent.trim() !== '↺ Remettre comme au départ') reset.textContent = '↺ Remettre comme au départ';
        if (over.length && !more) { more = document.createElement('details'); more.className = 'ui-ph-more'; more.innerHTML = moreHtml; }
        const want = [saved, primary, ...front, over.length ? more : null, star].filter(Boolean);
        const cur = [...acts.children];
        if (want.length !== cur.length || want.some((x, i) => cur[i] !== x)) want.forEach(x => acts.appendChild(x));
        if (more) {
            const menu = more.querySelector('.ui-ph-menu');
            const curM = [...menu.children];
            if (over.length !== curM.length || over.some((x, i) => curM[i] !== x)) over.forEach(x => menu.appendChild(x));
            if (!over.length) more.remove();
        }
        // ⭐ en dernier (les listes, Fiches, Enquêtes, Graphiques)
        if (!star) window.LCNDA_EXT?.shortcuts?.placeStar?.();
        if (st.module === 'maintenance' && SETTINGS_TABS.includes(st.maintenanceTab) && !acts.querySelector('.ui-ph-saved')) acts.insertAdjacentHTML('afterbegin', '<span class="ui-ph-saved" data-ui-saved role="status">✓ Enregistré</span>');
        if (!acts.children.length) acts.classList.add('is-empty'); else acts.classList.remove('is-empty');
    };
    let phTimer = 0;
    const harmonizeNow = () => { const ws = document.getElementById('workspace'); const head = ws?.querySelector('.page-header'); if (head && !head.closest('dialog')) UI.harmonizePageHeader(head); };
    const watchWs = () => {
        const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watchWs, 400);
        new MutationObserver(() => { clearTimeout(phTimer); phTimer = setTimeout(harmonizeNow, 20); }).observe(ws, {childList: true, subtree: true, characterData: false});
        harmonizeNow();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchWs); else watchWs();

    /* ═════ K2 — Réglages enregistrés tout seuls (Maintenance) ═════
     * Une seule écoute sur #workspace en Maintenance : après chaque changement fait dans la page (case, menu, curseur, glisser, bouton),
     * on lit les réglages gardés sur cet ordinateur ; s’ils ont changé : « ✓ Enregistré » à droite du titre + « ↶ Annuler » (H7).
     * Une page qui garde un brouillon (Réglages des tableaux, des animaux, Montage…, ADN) donne sa fonction save() avec UI.autoSave. */
    const VOLATILE = /^(lcnda-listbar:|lcnda-sort:|lcnda-view:)|ui-sections|reglages-ouverts|last-route|-ui-v\d|ui-state|recent|-tab$|-open$|warned|dashboard-recent|-groups$|toolbar-sets/;
    const snap = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && !VOLATILE.test(k)) o[k] = localStorage.getItem(k); } } catch (_) {} return o; };
    const write = v => Object.entries(v).forEach(([k, x]) => { try { if (x == null) localStorage.removeItem(k); else localStorage.setItem(k, x); } catch (_) {} });
    let page = {token: -1, base: null, save: null, redraw: null, label: '', timer: 0};
    // en Maintenance : une page = un onglet ; ailleurs (ex. ADN → ⚙️ Réglages) : la page qui a appelé UI.autoSave, tant qu’elle est affichée
    const pageKey = () => { const st = A().state || {}; if (st.module === 'maintenance') return `${st.maintenanceTab}`; return page.root && page.root.isConnected && page.mod === st.module ? page.key : ''; };
    function fresh() { const k = pageKey(); if (page.key !== k) page = {key: k, base: snap(), save: null, redraw: null, label: '', timer: 0}; return page; }
    /** UI.autoSave(élément, {save, redraw}) : la page de réglages garde tout de suite (save() lit l’écran et enregistre ; redraw() relit et redessine après ↶ Annuler) */
    UI.autoSave = (_root, {save = null, redraw = null} = {}) => {
        const st = A().state || {};
        if (st.module !== 'maintenance' && _root) { const prev = page, keep = prev.mod === st.module && prev.pending; page = {key: 'own:' + Date.now(), root: _root, mod: st.module, base: keep ? prev.base : snap(), save: null, redraw: null, label: keep ? prev.label : '', pending: keep, toasts: keep ? prev.toasts : null, timer: 0}; if (keep) { clearTimeout(prev.timer); page.timer = setTimeout(check, 300); } }
        const p = fresh(); p.save = save; p.redraw = redraw;
        // la page vient d’être dessinée : ce qu’elle montre est le point de départ (rien à annoncer)
        if (save && !p.pending) { try { save(); } catch (e) { console.warn(e); } p.base = snap(); }
        return p;
    };
    UI.autoSavePage = () => page; // pour les essais (tests/test-harmo-pages.js)
    /** UI.savedStatus pour une page : « ✓ Enregistré » à droite du titre */
    UI.pageSaved = (state = 'saved') => {
        const acts = document.querySelector('#workspace .page-header .page-actions'); if (!acts) return;
        let s = acts.querySelector('.ui-ph-saved'); if (!s) { acts.insertAdjacentHTML('afterbegin', '<span class="ui-ph-saved" data-ui-saved role="status"></span>'); s = acts.querySelector('.ui-ph-saved'); }
        s.textContent = state === 'saving' ? 'Enregistrement…' : state === 'error' ? '⚠️ Pas enregistré' : '✓ Enregistré';
        s.classList.toggle('is-error', state === 'error');
        if (state === 'saved') { s.classList.remove('is-fresh'); void s.offsetWidth; s.classList.add('is-fresh'); }
    };
    const labelOf = t => {
        if (!t || !t.closest) return '';
        if (t.closest('[data-ui-reset], [data-bp-reset], [data-dna-preset], [data-a11y-reset], [data-shortcut-reset-all]') || isReset(t.closest('button') || t)) return 'Réglages remis comme au départ';
        const lab = t.closest('label'), b = t.closest('button');
        const labText = lab ? (lab.querySelector(':scope > b, :scope > strong, :scope > span > b')?.textContent || [...lab.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('input, select, textarea, .ui-color, .ui-range, button, small, .muted, i'))).map(n => (n.innerText ?? n.textContent).split('\n')[0]).join(' ')) : '';
        let s = labText.trim() || t.getAttribute?.('aria-label') || t.title || (b ? (b.getAttribute('aria-label') || b.title || b.textContent) : '');
        s = String(s || '').replace(/\s+/g, ' ').trim();
        if (!s || s.length < 2 || /^[↑↓←→✕×⋯]+$/.test(s)) return '';
        return s.length > 48 ? s.slice(0, 46) + '…' : s;
    };
    function check() {
        const p = page; p.pending = false; if (p.key !== pageKey() || !p.key) return;
        if (p.save) { try { p.save(); } catch (e) { console.warn(e); } }
        const now = snap(), base = p.base || {};
        const changed = [...new Set([...Object.keys(now), ...Object.keys(base)])].filter(k => now[k] !== base[k]);
        if (!changed.length) return;
        const before = {}, after = {}; changed.forEach(k => { before[k] = base[k] ?? null; after[k] = now[k] ?? null; });
        p.base = now;
        UI.pageSaved('saved');
        const lbl = p.label; p.label = '';
        // la page a déjà proposé son propre « ↶ Annuler » (une palette retirée…) : pas de deuxième message
        const own = !!p.toasts && [...document.querySelectorAll('.toast:not(.is-leaving)')].some(t => !p.toasts.has(t) && /Annuler/.test(t.textContent || ''));
        p.toasts = null;
        if (own) return;
        const msg = lbl === 'Réglages remis comme au départ' ? lbl : lbl ? `Réglage changé : « ${lbl} »` : 'Réglage changé';
        const again = async () => { A().applyDesign?.(); if (page === p && p.redraw) await p.redraw(); else await A().refreshScreen?.(); if (page === p) p.base = snap(); };
        A().undoToast?.(msg, {undo: async () => { write(before); await again(); }, redo: async () => { write(after); await again(); }});
    }
    const later = (ms, t) => { const p = fresh(); if (!p.key) return; const l = labelOf(t); if (l) p.label = l; if (!p.pending) p.toasts = new Set(document.querySelectorAll('.toast')); p.pending = true; clearTimeout(p.timer); p.timer = setTimeout(check, ms); };
    const watchSettings = () => {
        const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watchSettings, 400);
        ws.addEventListener('input', e => later(700, e.target), true);
        ws.addEventListener('change', e => later(250, e.target), true);
        // en capture : noté avant que la page ne se redessine (sinon ce qu’elle vient d’enregistrer passerait pour le point de départ)
        ws.addEventListener('click', e => { if (e.target.closest?.('button, label, [role=button], summary, input[type=checkbox], input[type=radio]') && !e.target.closest('.ui-ph-more-btn')) later(350, e.target); }, true);
        ws.addEventListener('drop', e => later(300, e.target), true);
        ws.addEventListener('dragend', e => later(300, e.target), true);
        // une page redessinée après une question (« Es-tu sûr ? ») : on relit aussi
        new MutationObserver(() => { const p = fresh(); if (!p.key) return; if (p.pending || p.save) { clearTimeout(p.timer); p.timer = setTimeout(check, 300); } else p.base = snap(); }).observe(ws, {childList: true});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchSettings); else watchSettings();
    // en changeant de page, on repart de ce qui est gardé
    document.addEventListener('click', e => { if (e.target.closest?.('[data-side-value], .nav-item')) setTimeout(fresh, 0); }, true);
})();
