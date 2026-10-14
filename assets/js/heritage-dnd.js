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

    function enhance() {
        const ups = [...document.querySelectorAll('#workspace button, dialog[open] button')].filter(b => isArrow(b, UP));
        for (const up of ups) {
            const row = rowOf(up);
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
    let timer = 0;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(enhance, 80); }).observe(document.documentElement, {childList: true, subtree: true});

    const wait = ms => new Promise(r => setTimeout(r, ms));
    /** Presse le bouton, puis attend que l'écran se soit redessiné (ou qu'il ait juste déplacé la ligne) */
    async function press(button) {
        button.click();
        for (let t = 0; t < 40 && button.isConnected; t++) await wait(25);
        await wait(30);
    }
    async function moveBy(sig, from, delta) {
        let k = from;
        for (let n = 0; n < Math.abs(delta); n++) {
            const rows = rowsLike(sig), row = rows[k]; if (!row) return;
            const b = delta < 0 ? upOf(row) : downOf(row);
            if (!b || b.disabled) return;
            await press(b);
            k += delta < 0 ? -1 : 1;
        }
    }

    // Tirer une poignée : la ligne suit la souris, un trait montre où elle va tomber
    document.addEventListener('pointerdown', event => {
        const grip = event.target.closest?.('.dnd-grip'); if (!grip || event.button !== 0) return;
        const row = grip.closest('[data-dnd-row]'); if (!row) return;
        const up = upOf(row); if (!up) return;
        event.preventDefault();
        const sig = signature(up), rows = rowsLike(sig), from = rows.indexOf(row); if (from < 0) return;
        const marker = document.createElement('div'); marker.className = 'dnd-marker'; document.body.appendChild(marker);
        row.classList.add('is-dnd-dragging');
        let target = from;
        const place = y => {
            // ins : nombre de lignes dont le milieu est au-dessus de la souris → la ligne ira juste avant rows[ins]
            let ins = rows.filter(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < y; }).length;
            target = ins > from ? ins - 1 : ins;
            const ref = (rows[ins] || rows[rows.length - 1]).getBoundingClientRect();
            const top = rows[ins] ? ref.top : ref.bottom;
            Object.assign(marker.style, {top: `${top - 2 + window.scrollY}px`, left: `${ref.left + window.scrollX}px`, width: `${ref.width}px`});
        };
        place(event.clientY);
        const onMove = e => { place(e.clientY); const ws = document.getElementById('workspace'); if (ws) { if (e.clientY < 80) ws.scrollTop -= 14; if (e.clientY > window.innerHeight - 60) ws.scrollTop += 14; } };
        const onUp = async () => {
            document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
            marker.remove(); row.classList.remove('is-dnd-dragging');
            if (target !== from) await moveBy(sig, from, target - from);
        };
        document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    });
})();
