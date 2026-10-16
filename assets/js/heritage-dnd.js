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
})();
