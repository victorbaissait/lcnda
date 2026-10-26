/**
 * ⠿ Glisser-déposer partout où il y a des flèches ↑ ↓ (éditeurs de widgets, de statistiques, de listes, de blocs,
 * d'onglets, étapes, colonnes, salles du musée…). Une poignée est posée devant chaque ligne ; on la tire à la place
 * voulue ; au lâcher, les mêmes boutons ↑ / ↓ sont pressés autant de fois qu'il faut : chaque écran garde sa propre
 * façon d'enregistrer l'ordre, rien n'est à refaire écran par écran.
 * Les listes qui ont déjà leur poignée (Apparence, réordonner les widgets…) ne sont pas touchées.
 */
(() => {
    'use strict';
    const UP = '↑', DOWN = '↓';
    const isArrow = (b, arrow) => b.tagName === 'BUTTON' && b.textContent.trim() === arrow && !b.hasAttribute('data-find');
    const HAS_OWN_GRIP = '.order-grip, .saved-grip, [data-event-order-grip], .dnd-grip';

    /** La ligne d'un bouton ↑ : l'ancêtre dont le parent contient plusieurs lignes à flèches */
    function rowOf(button) {
        let el = button.parentElement;
        while (el && el.parentElement && el !== document.body) {
            const parent = el.parentElement;
            const siblingsWithArrows = [...parent.children].filter(c => [...c.querySelectorAll('button')].some(b => isArrow(b, UP)));
            if (siblingsWithArrows.length >= 2 && siblingsWithArrows.includes(el)) return el;
            el = parent;
        }
        return null;
    }
    const upOf = row => [...row.querySelectorAll('button')].find(b => isArrow(b, UP));
    const downOf = row => [...row.querySelectorAll('button')].find(b => isArrow(b, DOWN));
    /** Signature du bouton ↑ (ses attributs data-*) : pour retrouver la liste après que l'écran s'est redessiné */
    const signature = b => [...b.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + (a.value === '-1' ? '=-1' : '')).sort().join('|');
    const rowsLike = sig => [...document.querySelectorAll('button')].filter(b => isArrow(b, UP) && signature(b) === sig).map(rowOf).filter(Boolean);

    /** ☑ Une seule façon de ranger, partout : ⠿ | ☑ | libellé | ↑ ↓. Seul l'ordre d'affichage change (CSS order),
     *  rien n'est déplacé dans la page : chaque écran garde ses boutons et sa façon d'enregistrer. Les lignes riches
     *  (zone de texte, plusieurs champs, lignes de tableau) restent comme elles sont. */
    const childOf = (row, el) => { while (el && el.parentElement !== row) el = el.parentElement; return el; };
    function tidy(row, up) {
        if (row.dataset.ordRow || row.tagName === 'TR' || row.closest('[data-ord-off]')) return;
        const down = downOf(row); if (!down) return;
        // un panneau dont les flèches sont dans le titre (Réglages → Montage, retouche…) reste un panneau, pas une ligne
        if (childOf(row, up)?.matches('h1, h2, h3, h4, h5, h6, header')) return;
        if (row.querySelector('textarea') || row.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=color]), select').length > 2 || row.querySelectorAll('[data-dnd-row], li, tr').length) return;
        row.dataset.ordRow = '1'; row.classList.add('ord-row');
        [up, down].forEach(b => b.classList.add('ord-arrow'));
        const arrows = childOf(row, up); if (arrows) arrows.style.order = '99';
        if (childOf(row, down) && childOf(row, down) !== arrows) childOf(row, down).style.order = '99';
        row.querySelectorAll('.order-grip, .dnd-grip, .saved-grip').forEach(g => { g.textContent = '⠿'; let c = childOf(row, g);
            if (c && (c === arrows || c.contains(up))) { row.insertBefore(g, row.firstChild); c = g; } // la poignée toujours au début, pas collée aux flèches
            if (c) c.style.order = '-3'; });
        const box = [...row.querySelectorAll('input[type=checkbox]')].find(i => { const c = childOf(row, i); return c && c !== arrows; });
        if (box) { box.classList.add('ord-vis'); const c = childOf(row, box); if (c.style.order !== '-3') c.style.order = '-2'; }
        const main = [...row.children].find(c => !c.style.order && /\S/.test(c.textContent) && !c.matches('button, select, input, .order-number'));
        (main || (box && /\S/.test(childOf(row, box).textContent) ? childOf(row, box) : null))?.classList.add('ord-main'); // la case et son libellé ensemble : ils prennent la place
    }
    function enhance() {
        const ups = [...document.querySelectorAll('#workspace button, dialog[open] button')].filter(b => isArrow(b, UP));
        for (const up of ups) {
            const row = rowOf(up);
            if (row) setTimeout(() => tidy(row, up), 0); // après la poignée, posée juste en dessous
            if (!row || row.dataset.dndRow || row.querySelector(HAS_OWN_GRIP) || row.closest('[data-dnd-off]')) continue;
            if (!downOf(row)) continue;
            row.dataset.dndRow = '1';
            const grip = document.createElement('span');
            grip.className = 'dnd-grip'; grip.title = 'Glisser pour déplacer'; grip.setAttribute('aria-hidden', 'true'); grip.textContent = '⠿';
            // la poignée va au début de la ligne qui porte les flèches (l'en-tête d'un champ, d'une pièce…), pas seule au-dessus
            let host = row.tagName === 'TR' ? row.cells[0] : row;
            if (row.tagName !== 'TR') { let el = up; while (el.parentElement && el.parentElement !== row) el = el.parentElement; if (el !== up && el.parentElement === row && el.children.length > 1 && !el.matches('[class*="tools"],[class*="actions"],[class*="moves"]')) host = el; }
            host.insertBefore(grip, host.firstChild);
        }
    }
    /** attendre que la page se calme, mais pas plus de 600 ms : une page qui change sans arrêt (une barre de temps, une animation) ne doit pas tout bloquer */
    const settle = (fn, wait) => { let t = 0, first = 0; return () => { const now = Date.now(); if (!t) first = now; clearTimeout(t); t = setTimeout(() => { t = 0; fn(); }, now - first > 600 ? 0 : wait); }; };
    new MutationObserver(settle(() => enhance(), 80)).observe(document.documentElement, {childList: true, subtree: true});

    const wait = ms => new Promise(r => setTimeout(r, ms));
    /** Presse le bouton, puis attend que l'écran se soit redessiné (ou qu'il ait juste déplacé la ligne) */
    async function press(button, sig, k) {
        const row = rowOf(button);
        button.click();
        // fini dès que la ligne a bougé sur place, ou que l'écran a été redessiné
        for (let t = 0; t < 40 && button.isConnected && rowsLike(sig).indexOf(row) === k; t++) await wait(25);
        await wait(button.isConnected ? 0 : 30);
    }
    // les lignes d'une même liste (une fenêtre peut avoir plusieurs listes aux mêmes boutons ↑ ↓, comme « Personnaliser »)
    const sameList = (sig, group) => { const all = rowsLike(sig); if (!group?.isConnected) return all; const mine = all.filter(r => r.parentElement === group); return mine.length ? mine : all; };
    async function moveBy(sig, from, delta, group) {
        let k = from;
        for (let n = 0; n < Math.abs(delta); n++) {
            const rows = sameList(sig, group), row = rows[k]; if (!row) return;
            const b = delta < 0 ? upOf(row) : downOf(row);
            if (!b || b.disabled) return;
            await press(b, sig, k);
            k += delta < 0 ? -1 : 1;
        }
    }

    // Tirer une poignée : la ligne suit la souris, un trait montre où elle va tomber
    document.addEventListener('pointerdown', event => {
        const grip = event.target.closest?.('.dnd-grip'); if (!grip || event.button !== 0) return;
        const row = grip.closest('[data-dnd-row]'); if (!row) return;
        const up = upOf(row); if (!up) return;
        event.preventDefault();
        const sig = signature(up), group = row.parentElement, rows = sameList(sig, group), from = rows.indexOf(row); if (from < 0) return;
        // le trait se pose dans la fenêtre ouverte (sinon il serait derrière elle) et suit l'écran, pas la page
        const marker = document.createElement('div'); marker.className = 'dnd-marker'; marker.style.position = 'fixed'; marker.style.zIndex = '100000'; (row.closest('dialog') || document.body).appendChild(marker);
        row.classList.add('is-dnd-dragging');
        let target = from;
        // en grille (plusieurs colonnes) : on lit dans l'ordre de lecture, ligne par ligne, et le trait devient vertical
        const multi = new Set(rows.filter(r => r.parentElement === row.parentElement).map(r => Math.round(r.getBoundingClientRect().left))).size > 1; // seulement les voisines de la ligne tirée
        const place = (x, y) => {
            // ins : nombre de lignes placées avant la souris → la ligne ira juste avant rows[ins]
            const before = r => { const b = r.getBoundingClientRect(); if (!multi) return b.top + b.height / 2 < y; return b.bottom < y || (b.top <= y && b.left + b.width / 2 < x); };
            let ins = 0; while (ins < rows.length && before(rows[ins])) ins++;
            target = ins > from ? ins - 1 : ins;
            const ref = (rows[ins] || rows[rows.length - 1]).getBoundingClientRect();
            if (multi) Object.assign(marker.style, {top: `${ref.top}px`, left: `${rows[ins] ? ref.left - 4 : ref.right}px`, width: '4px', height: `${ref.height}px`});
            else Object.assign(marker.style, {top: `${(rows[ins] ? ref.top : ref.bottom) - 2}px`, left: `${ref.left}px`, width: `${ref.width}px`, height: '4px'});
        };
        place(event.clientX, event.clientY);
        const scroller = (() => { let el = row.parentElement; while (el && el !== document.body) { const o = getComputedStyle(el).overflowY; if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el; el = el.parentElement; } return document.getElementById('workspace'); })();
        const onMove = e => { place(e.clientX, e.clientY); const ws = scroller; if (ws) { const r = ws.getBoundingClientRect(); if (e.clientY < Math.max(80, r.top + 30)) ws.scrollTop -= 14; if (e.clientY > Math.min(window.innerHeight - 60, r.bottom - 30)) ws.scrollTop += 14; } };
        const onUp = async () => {
            document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
            marker.remove(); row.classList.remove('is-dnd-dragging');
            if (target !== from) await moveBy(sig, from, target - from, group);
        };
        document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    });

    /* K20 — ⠿ partout : une poignée grise de 16 px, qu'on peut aussi prendre au clavier (Tab), et Alt + ↑ / ↓ pour
     * déplacer la ligne où l'on est (plus besoin des flèches ↑ ↓ sur chaque ligne, cachées à la souris par editeurs.css). */
    const GRIPS = '.dnd-grip, .order-grip, .saved-grip, .tile-cat-grip, .h-rt-grip, .ar-grip, .h-sc-grip, .qp-grip, .investigation-item-grip, [data-event-order-grip], .ui-grip';
    const GRIP_LABEL = 'Déplacer : glisse la poignée, ou Alt + ↑ / ↓';
    function gripsReady() {
        document.querySelectorAll(`#workspace :is(${GRIPS}), dialog[open] :is(${GRIPS})`).forEach(g => {
            if (g.dataset.gripDone) return; g.dataset.gripDone = '1';
            if (/^[☰≡↕⋮]+$/.test(g.textContent.trim())) g.textContent = '⠿'; // une seule poignée : ⠿
            if (!g.matches('button, a, input') && !g.hasAttribute('tabindex')) g.tabIndex = 0;
            g.removeAttribute('aria-hidden'); if (!g.getAttribute('role') && !g.matches('button')) g.setAttribute('role', 'button');
            g.setAttribute('aria-label', GRIP_LABEL); if (!g.title || /^(Déplacer|Glisser pour (déplacer|ranger))$/.test(g.title)) g.title = GRIP_LABEL;
        });
    }
    new MutationObserver(settle(() => gripsReady(), 90)).observe(document.documentElement, {childList: true, subtree: true});
    const sameKind = (a, b) => a && b && a.tagName === b.tagName && (a.className.split(' ')[0] || '') === (b.className.split(' ')[0] || '');
    /** une liste à poignée sans flèches (glisser-déposer du navigateur) : on joue le même glisser, d'une ligne */
    function dragOneStep(row, grip, dir) {
        let sib = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
        while (sib && !sameKind(sib, row)) sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
        if (!sib) return false;
        const src = grip.closest('[draggable="true"]') || row, r = sib.getBoundingClientRect(), x = r.left + Math.min(20, r.width / 2), y = dir < 0 ? r.top + 2 : r.bottom - 2;
        let dt = null; try { dt = new DataTransfer(); } catch (_) {}
        const fire = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: x, clientY: y}));
        const before = [...row.parentElement.children].indexOf(row);
        fire(src, 'dragstart'); fire(sib, 'dragenter'); fire(sib, 'dragover'); fire(sib, 'drop'); fire(src, 'dragend');
        return !row.isConnected || [...row.parentElement.children].indexOf(row) !== before;
    }
    document.addEventListener('keydown', async e => {
        if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        const t = e.target; if (!(t instanceof Element) || t.closest('textarea, [contenteditable="true"], select, input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=button])')) return;
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        // 1. une ligne à flèches ↑ ↓ (rangée par cet outil ou par l'écran) : on presse sa flèche
        const row = t.closest('[data-ord-row], [data-dnd-row]');
        if (row) {
            const up = upOf(row); if (!up) return;
            e.preventDefault(); e.stopPropagation();
            const sig = signature(up), group = row.parentElement, rows = sameList(sig, group), from = rows.indexOf(row); if (from < 0) return;
            const b = dir < 0 ? upOf(row) : downOf(row); if (!b || b.disabled) return;
            const focusSel = t.matches(GRIPS) ? GRIPS : t.matches('input[type=checkbox]') ? 'input[type=checkbox]' : GRIPS;
            await press(b, sig, from);
            const moved = sameList(sig, group.isConnected ? group : null)[from + dir];
            if (moved) { const f = moved.querySelector(focusSel) || moved.querySelector(GRIPS); f?.focus({preventScroll: false}); moved.classList.add('is-alt-moved'); setTimeout(() => moved.classList.remove('is-alt-moved'), 700); }
            return;
        }
        // 2. une ligne qui n'a que sa poignée ⠿ (glisser-déposer)
        const grip = t.matches(GRIPS) ? t : null; if (!grip) return;
        const r2 = grip.closest('li, tr, .order-row, [data-i], [data-okey], [data-order-key], [draggable="true"]:not(.order-grip)') || grip.parentElement; if (!r2?.parentElement) return;
        e.preventDefault(); e.stopPropagation();
        const parent = r2.parentElement, idx = [...parent.children].indexOf(r2);
        if (dragOneStep(r2, grip, dir)) {
            const now = r2.isConnected ? r2 : (parent.isConnected ? parent.children[idx + dir] : null);
            now?.querySelector(GRIPS)?.focus();
        }
    }, true);
})();
