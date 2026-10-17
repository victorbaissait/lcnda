/* LCNDA — 🧩 Les mêmes petits boutons partout : la poubelle et le crayon de la fiche personne (bloc Événements),
 * à la même taille, à la place des 🗑, ✎ et ✏️ écrits en émoji ; un seul ＋ devant « Ajouter… ».
 * Seul l'aspect change : le bouton garde ses attributs, son titre et ce qu'il fait.
 */
(() => {
    'use strict';
    const SVG = {
        delete: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5m4-5v5"/>',
        edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Zm9.5-13.5 4 4"/>',
    };
    const KIND = {'🗑': 'delete', '🗑️': 'delete', '✎': 'edit', '✏': 'edit', '✏️': 'edit', '🖉': 'edit'};
    // les outils de dessin (crayon du dessin vectoriel, des tableaux…) ne sont pas des boutons « modifier »
    const isTool = b => [...b.attributes].some(a => /tool/i.test(a.name)) || b.closest('[class*="tools"][class*="vx"], .vx-rail, [data-vx-tools], .h-rt-toolbar, .ly-tools');
    function tidy(b) {
        if (b.dataset.iaDone) return; b.dataset.iaDone = '1';
        const t = b.textContent.trim(), kind = KIND[t];
        if (kind && !b.children.length && !isTool(b)) {
            const label = b.getAttribute('title') || b.getAttribute('aria-label') || (kind === 'delete' ? 'Supprimer' : 'Modifier');
            b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[kind]}</svg>`;
            b.classList.add('icon-action', 'ia-auto', `icon-${kind}`); if (kind === 'delete') b.classList.add('is-danger');
            if (!b.title) b.title = label; if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', label);
            return;
        }
        // « + Ajouter » → « ＋ Ajouter » (un seul signe plus)
        const first = [...b.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        if (first && /^\s*\+\s/.test(first.textContent)) first.textContent = first.textContent.replace(/^(\s*)\+\s+/, '$1＋ ');
        else if (first && first.textContent.trim() === '+') first.textContent = first.textContent.replace('+', '＋');
    }
    /* 📱 petit écran : le panneau de droite des outils devient un tiroir (☰), et ⛶ et × restent au bout de la barre du haut */
    const MAINS = '.vx-main, .h-hs-main, .kn-main', BARS = '.vx-top, .h-hs-top, .kn-top, .h-avx-montage > .modal-head, .h-rt-head';
    function narrow(root) {
        (root.matches?.(MAINS) ? [root] : [...(root.querySelectorAll?.(MAINS) || [])]).forEach(m => {
            if (m.querySelector(':scope > .drawer-btn')) return;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'drawer-btn'; b.textContent = '☰'; b.title = 'Montrer ou cacher le panneau des réglages'; b.setAttribute('aria-label', b.title);
            b.addEventListener('click', () => { const d = m.closest('dialog') || m; d.classList.toggle('drawer-open'); }); m.appendChild(b);
        });
        (root.matches?.(BARS) ? [root] : [...(root.querySelectorAll?.(BARS) || [])]).forEach(bar => {
            const full = bar.querySelector('[data-full-toggle]'), btns = [...bar.querySelectorAll('button')], close = full ? full.nextElementSibling : btns.at(-1);
            if (full && full.parentElement === bar) full.classList.add('stick-r2'); if (close?.matches?.('button') && close.parentElement === bar) close.classList.add('stick-r');
        });
    }
    const scan = root => root.querySelectorAll?.('button:not([data-ia-done]), label.button:not([data-ia-done])').forEach(tidy);
    let queued = new Set(), timer = 0;
    new MutationObserver(list => { list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) queued.add(n); })); clearTimeout(timer);
        timer = setTimeout(() => { const nodes = [...queued]; queued = new Set(); nodes.forEach(n => { if (!n.isConnected) return; if (n.matches?.('button')) tidy(n); scan(n); narrow(n); }); }, 40); })
        .observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('DOMContentLoaded', () => scan(document));
})();
