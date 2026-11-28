/* LCNDA — « Nouveau » dans les listes à ranger : une entrée ajoutée par un outil depuis la dernière fois (un bloc de fiche,
 * un widget, un onglet des Réglages, une partie de la monographie, une carte…) porte un petit « Nouveau » dans la liste
 * qui la range, le temps de cette visite. Rien à déclarer : chaque liste à ranger de l'app est reconnue à sa forme
 * (.order-row[data-order-key] des éditeurs d'ordre et des blocs de fiche, la fenêtre « Réordonner » des colonnes et onglets, la liste
 * de ⚙︎ Personnaliser de la monographie, celle d'un onglet « commune »).
 * La fiche d'un village a le sien (heritage-more.js, avec son organisation).
 * La première fois qu'une liste est vue, tout ce qui y est compte comme déjà vu (pas de « Nouveau » partout).
 * Gardé : localStorage 'genealogie-organiser-vus' = {liste: [clés vues]}. Essai : tests/test-fiche-village-organiser.js
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const KEY = 'genealogie-organiser-vus';
    const T = s => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s) : s);
    const SKIP = /^liste:(dashboard-blocks)$/; // les widgets posés soi-même : pas des entrées « arrivées »
    const RULES = [
        {row: '.order-row[data-order-key]', key: r => r.dataset.orderKey, label: r => r.querySelector(':scope > b'),
            scope: r => { const f = r.closest('[data-fsed-kind]'); if (f) return 'fiche-blocs:' + f.dataset.fsedKind; const l = r.closest('.order-list[id]'); return l ? 'liste:' + l.id : ''; }},
        // « Réordonner » d'une colonne de gauche, d'un onglet, du tableau de bord (fenêtre commune, app.js openSideReorderDialog)
        {row: '.dashboard-reorder-list > li.dashboard-reorder-row', key: r => (r.querySelector(':scope > b')?.textContent || '').trim(), label: r => r.querySelector(':scope > b'),
            scope: r => 'reordonner:' + (r.closest('dialog')?.querySelector('.modal-head h2')?.textContent || '').trim().slice(0, 80)},
        {row: '.mp-list[data-mp-order] > li[data-k]', key: r => r.dataset.k, label: r => r.querySelector('label > span'), scope: () => 'monographie'},
        {row: '.h-book-order[data-place-order] > li[data-k]', key: r => r.dataset.k, label: r => r.querySelector('label > span'), scope: () => 'onglet-commune'},
    ];
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    const fresh = new Map(); // liste → clés « Nouveau » pendant cette visite
    function scan() {
        let store = null, dirty = false;
        RULES.forEach(rule => {
            const rows = [...document.querySelectorAll(rule.row)]; if (!rows.length) return;
            const groups = new Map();
            rows.forEach(r => { const s = rule.scope(r); if (!s || SKIP.test(s)) return; const k = String(rule.key(r) || ''); if (!k) return; if (!groups.has(s)) groups.set(s, []); groups.get(s).push([r, k]); });
            groups.forEach((list, s) => {
                store = store || read();
                const seen = Array.isArray(store[s]) ? store[s] : null, mine = fresh.get(s) || new Set();
                const keys = list.map(x => x[1]);
                if (!seen) { store[s] = [...new Set(keys)].slice(-800); dirty = true; return; } // la première fois : tout est déjà vu
                const add = keys.filter(k => !seen.includes(k));
                if (add.length) { add.forEach(k => mine.add(k)); fresh.set(s, mine); store[s] = [...new Set([...seen, ...add])].slice(-800); dirty = true; }
                list.forEach(([r, k]) => {
                    if (!mine.has(k) || r.querySelector('.org-new')) return;
                    const lab = rule.label(r), b = document.createElement('span');
                    b.className = 'ui-badge is-blue org-new'; b.textContent = T('Nouveau');
                    if (lab) lab.insertAdjacentElement('afterend', b); else r.appendChild(b);
                });
            });
        });
        if (dirty) write(store);
    }
    let pending = 0;
    const later = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { scan(); } catch (e) { console.error(e); } }); };
    if (typeof MutationObserver !== 'undefined') new MutationObserver(later).observe(document.documentElement, {childList: true, subtree: true});
    ext.organiserNouveau = {scan, key: KEY, fresh};
})();
