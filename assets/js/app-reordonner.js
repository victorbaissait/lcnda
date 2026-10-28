/* LCNDA — ⠿ « Réordonner » partout : en bas de chaque colonne de gauche qui montre une liste (Graphiques, Carte, Personnes,
 * Enquêtes, Fiches, Chronologie, ADN…), le même bouton que dans Listes et Réglages : ranger, cacher, montrer.
 * Les onglets qui ont déjà leur propre « Réordonner » (Listes, Réglages, Recherche, Tableau de bord, Trésors, Graphiques) le gardent.
 * Retenu sur cet ordinateur, par onglet : localStorage['lcnda-side-order'] = {module: {order: [clés], hidden: [clés]}}.
 * Seul l'affichage change (ordre des boutons, boutons cachés) : chaque outil garde ses propres réglages.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const KEY = 'lcnda-side-order';
    const ITEM = '.side-menu-item';
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { A()?.toast?.('Enregistrement impossible : la place du navigateur est pleine ?', 'error'); } };
    const mod = () => A()?.state?.module || '';
    const labelOf = el => { const c = el.cloneNode(true); c.querySelectorAll('.side-number, .sr-only, .visually-hidden').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
    const keyOf = el => String(el.dataset.sideValue || el.dataset.value || labelOf(el)).slice(0, 120);
    /** les onglets qui ont déjà leur « Réordonner » à eux */
    const OWN = ['listes', 'maintenance', 'recherche', 'dashboard', 'tresors', 'graphiques', 'carte']; // la Carte : « Ordre des cartes » dans Réglages → Cartes et fonds de carte
    const items = () => [...document.querySelectorAll(`#sidebar-content ${ITEM}`)].filter(el => !el.closest('[data-no-reorder]'));

    /** ranger et cacher selon le réglage de l'onglet (sans rien réécrire si c'est déjà en place : pas de boucle) */
    function apply() {
        const m = mod(), cfg = read()[m]; const list = items();
        list.forEach((el, i) => { if (el.dataset.roI == null) el.dataset.roI = String(i); }); // le rang donné par l'outil, noté avant tout rangement
        list.forEach(el => { if (el.dataset.roHidden) { el.hidden = false; delete el.dataset.roHidden; } });
        if (!cfg || !list.length) return;
        const hidden = new Set(cfg.hidden || []), order = cfg.order || [];
        // chaque groupe (même parent) se range à part
        const byParent = new Map(); list.forEach(el => { const p = el.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(el); });
        byParent.forEach((els, parent) => {
            const rank = el => { const i = order.indexOf(keyOf(el)); return i < 0 ? 1e6 + els.indexOf(el) : i; };
            const sorted = [...els].sort((a, b) => rank(a) - rank(b));
            if (sorted.some((el, i) => el !== els[i])) { const anchor = els[els.length - 1].nextSibling; sorted.forEach(el => parent.insertBefore(el, anchor)); }
        });
        list.forEach(el => { if (hidden.has(keyOf(el)) && !el.classList.contains('is-active')) { el.hidden = true; el.dataset.roHidden = '1'; } });
    }
    /** le bouton, en bas de la colonne */
    function button() {
        const m = mod(), footer = document.getElementById('sidebar-footer'); if (!footer) return;
        const has = footer.querySelector('[data-ro-open]');
        const own = OWN.includes(m) || [...footer.querySelectorAll('button')].some(b => !b.hasAttribute('data-ro-open') && /R[ée]ordonner/.test(b.textContent));
        if (own || items().length < 3) { has?.remove(); return; }
        if (has) return;
        let bar = footer.querySelector('.dashboard-footer-actions');
        if (!bar) { bar = document.createElement('div'); bar.className = 'dashboard-footer-actions'; footer.prepend(bar); }
        bar.insertAdjacentHTML('afterbegin', '<button class="button small secondary" type="button" data-ro-open title="Ranger, cacher ou montrer les entrées de cette colonne">Réordonner</button>');
    }
    function open() {
        const m = mod(), cfg = read()[m] || {}, hidden = new Set(cfg.hidden || []);
        // l'ordre de départ : celui de l'outil (avant tout rangement), retrouvé en retirant le réglage le temps de lire
        const seen = new Map(); [...items()].sort((a, b) => Number(a.dataset.roI ?? 1e6) - Number(b.dataset.roI ?? 1e6)).forEach(el => { const k = keyOf(el); if (!seen.has(k)) seen.set(k, labelOf(el)); });
        const order = cfg.order || [], keys = [...seen.keys()];
        const rows = [...keys].sort((a, b) => { const i = order.indexOf(a), j = order.indexOf(b); return (i < 0 ? 1e6 + keys.indexOf(a) : i) - (j < 0 ? 1e6 + keys.indexOf(b) : j); }).map(k => ({key: k, label: seen.get(k), hidden: hidden.has(k)}));
        const title = (document.querySelector('#sidebar h2, #sidebar-title, #sidebar .sidebar-title')?.textContent || document.querySelector(`[data-module="${m}"]`)?.textContent || '').replace(/\s+/g, ' ').trim() || 'cette colonne';
        A().openSideReorderDialog({eyebrow: title.toUpperCase(), title: `Réordonner : ${title}`, canHide: true, rows, defaults: keys.map(k => ({key: k, label: seen.get(k), hidden: false})),
            save: list => { const all = read(); if (list.every(r => r.hidden)) { A().toast('Garde au moins une entrée visible.', 'error'); return false; }
                all[m] = {order: list.map(r => r.key), hidden: list.filter(r => r.hidden).map(r => r.key)}; write(all); A().toast('Colonne rangée.'); }}); // la fenêtre redessine la colonne elle-même
    }
    let queued = false;
    const tick = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; apply(); button(); }); };
    function watch() {
        const c = document.getElementById('sidebar-content'), f = document.getElementById('sidebar-footer');
        if (!c || !f) return setTimeout(watch, 300);
        new MutationObserver(tick).observe(c, {childList: true, subtree: true});
        new MutationObserver(tick).observe(f, {childList: true, subtree: true});
        f.addEventListener('click', e => { if (e.target.closest('[data-ro-open]')) open(); });
        tick();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
    window.LCNDA_REORDER = {read, apply, open, keyOf};
})();
