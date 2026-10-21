/* LCNDA — 🧩 Les mêmes petits boutons partout : la poubelle et le crayon de la fiche personne (bloc Événements),
 * à la même taille, à la place des 🗑, ✎ et ✏️ écrits en émoji ; un seul ＋ devant « Ajouter… ».
 * Seul l'aspect change : le bouton garde ses attributs, son titre et ce qu'il fait.
 * Taille : 29 px d'habitude ; « outil » (22 px, classe ia-tool) si le bouton d'origine faisait moins de 24 px de haut
 * (petite barre, vignette) ou s'il est dans un conteneur data-ia-size="tool".
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
    const isIcon = b => !b.dataset.iaDone && !b.children.length && !!KIND[b.textContent.trim()];
    /** h0 : la hauteur du bouton mesurée avant tout changement (tidyAll mesure tous les boutons d'abord, puis les change :
     *  mesurer puis changer bouton par bouton recalculait toute la page à chaque fois — 14 s pour une liste de 1 500 lignes) */
    function tidy(b, h0 = null) {
        if (b.dataset.iaDone) return; b.dataset.iaDone = '1';
        const t = b.textContent.trim(), kind = KIND[t];
        if (kind && !b.children.length && !isTool(b)) {
            const label = b.getAttribute('title') || b.getAttribute('aria-label') || (kind === 'delete' ? 'Supprimer' : 'Modifier');
            // 📐 dans une petite barre (vignette, piste du montage, ligne serrée…), le bouton d'origine était petit :
            // il prend la taille « outil » (C8) au lieu des 29 px, sinon il sortirait de son cadre
            if (h0 === null) h0 = b.getBoundingClientRect().height;
            if ((h0 > 0 && h0 < 24) || b.closest('[data-ia-size="tool"]')) b.classList.add('ia-tool');
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
    /* 👁 lignes cachées dans les listes à ranger : laissées telles quelles, ou grisées (niveau au choix) — Maintenance → Apparence */
    const HR_KEY = 'genealogie-hidden-rows';
    const hrPrefs = () => { try { const v = JSON.parse(localStorage.getItem(HR_KEY) || '{}') || {}; return {mode: v.mode === 'keep' ? 'keep' : 'dim', level: Math.min(85, Math.max(5, Number(v.level) || 45))}; } catch (_) { return {mode: 'dim', level: 45}; } };
    const hrApply = () => { const p = hrPrefs(); document.documentElement.style.setProperty('--hidden-row-opacity', p.mode === 'keep' ? '1' : String(1 - p.level / 100)); document.documentElement.dataset.hiddenRows = p.mode; };
    hrApply();
    const EXT = window.LCNDA_EXT = window.LCNDA_EXT || {}; EXT.designPanels = EXT.designPanels || [];
    EXT.designPanels.push(() => { const p = hrPrefs(); return `<section class="person-block-config" id="h-hidden-rows"><header><span class="eyebrow">APPARENCE</span><h3>👁 Lignes cachées dans les listes à ranger</h3><p>Dans les listes où l’on coche ce qui s’affiche (menus, listes, Réordonner, Personnaliser…) : une ligne décochée reste telle quelle, ou se grise un peu.</p></header>
        <div class="maintenance-panel h-hr-panel"><label class="checkbox-line"><input type="radio" name="hr-mode" value="keep" ${p.mode === 'keep' ? 'checked' : ''}> Laisser telles quelles</label><label class="checkbox-line"><input type="radio" name="hr-mode" value="dim" ${p.mode === 'dim' ? 'checked' : ''}> Les griser</label>
        <label class="h-hr-level" ${p.mode === 'keep' ? 'hidden' : ''}>Grisage <input type="range" min="5" max="85" step="5" data-hr-level value="${p.level}"> <output data-hr-out>${p.level} %</output></label>
        <div class="h-hr-demo"><div class="order-row has-visibility"><span class="order-grip">⠿</span><label class="order-visible"><input type="checkbox" checked></label><span class="order-number">01</span><b>Une ligne affichée</b></div><div class="order-row has-visibility"><span class="order-grip">⠿</span><label class="order-visible"><input type="checkbox"></label><span class="order-number">02</span><b>Une ligne cachée</b></div></div></div></section>`; });
    document.addEventListener('input', e => { const t = e.target; if (!t.closest?.('#h-hidden-rows')) return; const p = hrPrefs();
        if (t.name === 'hr-mode') { p.mode = t.value; t.closest('section').querySelector('.h-hr-level').hidden = p.mode === 'keep'; }
        if (t.matches('[data-hr-level]')) { p.level = Number(t.value); t.closest('section').querySelector('[data-hr-out]').textContent = `${p.level} %`; }
        try { localStorage.setItem(HR_KEY, JSON.stringify(p)); } catch (_) {} hrApply(); });
    /* 📁 « Choose File » → un bouton en français « 📁 Choisir un fichier » et le nom du fichier choisi (les champs cachés, déclenchés par un autre bouton, ne changent pas) */
    function filePick(inp) {
        if (inp.dataset.fpDone || inp.hidden || inp.closest('[hidden], .file-pick, label.button') || inp.style.display === 'none') return; inp.dataset.fpDone = '1';
        const many = inp.multiple, w = document.createElement('span'); w.className = 'file-pick';
        const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary'; b.textContent = many ? '📁 Choisir des fichiers' : '📁 Choisir un fichier';
        const n = document.createElement('span'); n.className = 'file-pick-name'; n.textContent = 'Aucun fichier choisi';
        inp.replaceWith(w); w.append(inp, b, n);
        b.addEventListener('click', () => inp.click());
        const show = () => { const f = [...(inp.files || [])]; n.textContent = !f.length ? 'Aucun fichier choisi' : f.length === 1 ? f[0].name : `${f.length} fichiers`; n.title = f.map(x => x.name).join('\n'); };
        inp.addEventListener('change', show); inp.form?.addEventListener('reset', () => setTimeout(show));
    }
    /* ⌨️ un raccourci clavier se lit dans la bulle de l'app (K12, app-tips.js) : data-shortcut="⌘S" → « Enregistrer ⌘ S » en petites
     *  touches, écrit pour cet ordinateur (Ctrl S hors Mac). Le title n'est plus complété par « (⌘S) » ; un bouton sans title en reçoit un. */
    function shortcutTip(el) { const k = el.dataset.shortcut; if (!k || el.dataset.scDone === k) return; el.dataset.scDone = k; if (!el.getAttribute('title') && !el.getAttribute('aria-label')) { const t = (el.textContent || '').trim(); if (t) el.title = t; } }
    /** toutes les mesures d'abord (une seule mise en page), puis tous les changements */
    const tidyAll = list => { const hs = list.map(b => (isIcon(b) ? b.getBoundingClientRect().height : 0)); list.forEach((b, i) => tidy(b, hs[i])); };
    const scan = (root, skipButtons = false) => { if (!skipButtons) tidyAll([...(root.querySelectorAll?.('button:not([data-ia-done]), label.button:not([data-ia-done])') || [])]); root.querySelectorAll?.('input[type=file]:not([data-fp-done])').forEach(filePick); root.querySelectorAll?.('[data-shortcut]').forEach(shortcutTip); if (root.matches?.('[data-shortcut]')) shortcutTip(root); };
    /* ⏎ Entrée dans un champ d'une fenêtre = enregistrer (pas fermer) : le × d'en-tête et « Annuler » (value="cancel")
     * sans type étaient les premiers boutons d'envoi du formulaire, donc ceux qu'Entrée « cliquait » (fenêtre fermée,
     * saisie perdue). Ils deviennent de simples boutons qui ferment la fenêtre ; Entrée va au bouton principal. */
    function fixCancel(root) {
        const list = root.matches?.('dialog form button[value="cancel"]:not([type])') ? [root] : [...(root.querySelectorAll?.('form button[value="cancel"]:not([type])') || [])].filter(b => b.closest('dialog'));
        list.forEach(b => { b.type = 'button'; if (b.dataset.lcCancel) return; b.dataset.lcCancel = '1'; b.addEventListener('click', () => { const d = b.closest('dialog'); if (d?.open) d.close('cancel'); }); });
    }
    fixCancel(document);
    let queued = new Set(), timer = 0;
    new MutationObserver(list => { list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { queued.add(n); fixCancel(n); } })); clearTimeout(timer);
        timer = setTimeout(() => { const nodes = [...queued].filter(n => n.isConnected); queued = new Set();
            const btns = new Set(); nodes.forEach(n => { if (n.matches?.('button, label.button') && !n.dataset.iaDone) btns.add(n); n.querySelectorAll?.('button:not([data-ia-done]), label.button:not([data-ia-done])').forEach(b => btns.add(b)); });
            tidyAll([...btns]); nodes.forEach(n => { scan(n, true); narrow(n); }); }, 40); })
        .observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('DOMContentLoaded', () => scan(document));
})();
