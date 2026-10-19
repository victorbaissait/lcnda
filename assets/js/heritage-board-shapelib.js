/* LCNDA — Tableaux : la grande bibliothèque de formes (≈ 2 900 formes de plus : lettres et chiffres, héraldique, cadres,
 * étiquettes, drapeaux, liens d'arbre, symboles, pictogrammes Phosphor…), chargée seulement à l'ouverture de la bibliothèque.
 * Données : assets/data/shapes-lib.json (licences : assets/data/shapes-lib-LICENCES.txt ; fabriqué par scripts/shapes-lib/build.cjs).
 *
 * API (sur window.LCNDA_EXT.boardKit, en plus de celle de heritage-board-kit.js, qui ne change pas) :
 *   await boardKit.loadLibrary()      → charge les formes en plus (une seule fois) ; ensuite allShapes(), shapesOf(cat),
 *                                        shapeByKey(k) et SHAPE_MAP les contiennent comme les autres.
 *   boardKit.libraryLoaded            → true une fois chargées. Événement « lcnda:shapes-loaded » sur document.
 *   boardKit.allShapes()              → [{k, n (nom), c (catégorie), d (tracé SVG), eo (evenodd), tags, s (taille de la boîte : 24, 100 ou 256), lazy?}]
 *   boardKit.shapeD100(forme | clé)   → le tracé ramené dans une boîte 100 × 100 (absolu M/L/C/Z), prêt à être gardé dans un élément.
 *   boardKit.searchShapes(texte, {cat}) → formes trouvées (recherche sans accents, en français, pluriels compris), les meilleures d'abord.
 *   boardKit.openShapeLibrary({anchor, root, current, onPick, onNew, onFrom}) → la fenêtre de la bibliothèque (défilement virtuel).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const K = ext.boardKit; if (!K) return;
    const A = () => window.LCNDA_APP || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[c])));
    const DATA_URL = 'assets/data/shapes-lib.json?v=1';
    // les nouvelles catégories (avant « Mes formes », qui reste la dernière)
    const NEW_CATS = [['letters', 'Lettres et chiffres', '🔤'], ['heraldry', 'Armoiries et héraldique', '🛡️'], ['frames', 'Cadres et bordures', '🖼️'], ['labels', 'Étiquettes', '🏷️'],
        ['emotions', 'Émotions', '😊'], ['flags', 'Drapeaux', '🚩'], ['tech', 'Écrans et appareils', '💻'], ['money', 'Argent et commerce', '💶']];
    { const at = K.CATS.findIndex(c => c[0] === 'mine'); const add = NEW_CATS.filter(c => !K.CATS.some(x => x[0] === c[0])); K.CATS.splice(at < 0 ? K.CATS.length : at, 0, ...add); }
    const catName = c => K.CATS.find(x => x[0] === c)?.[1] || '';

    /* ── recherche C1 : sans accents, en français ── */
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’'`«»()",;:!?]/g, ' ').replace(/\s+/g, ' ').trim();
    const idx = new WeakMap();
    const textOf = sh => { let t = idx.get(sh); if (t === undefined) { t = ' ' + fold(`${sh.n} ${sh.tags || ''} ${catName(sh.c)}`) + ' '; idx.set(sh, t); } return t; };
    const nameOf = sh => ' ' + fold(sh.n) + ' ';
    const variants = w => { const v = [w]; if (w.length > 3 && /[sx]$/.test(w)) v.push(w.slice(0, -1)); if (w.length > 4 && /aux$/.test(w)) v.push(w.slice(0, -3) + 'al'); return v; };
    function searchShapes(q, {cat = '', list = null} = {}) {
        const words = fold(q).split(' ').filter(Boolean); const src = list || K.allShapes();
        if (!words.length) return cat ? src.filter(s => s.c === cat) : src.slice();
        const out = [];
        // une lettre seule tapée telle quelle (« É », « a ») : ses formes d'abord
        const raw = String(q).trim(), one = [...raw].length === 1 ? raw : '';
        src.forEach((sh, i) => {
            if (cat && sh.c !== cat) return;
            const t = textOf(sh); let score = 0;
            // une ou deux lettres : un mot entier (« e ») ou un début de mot (« ma ») ; sinon n'importe où dans les mots
            for (const w of words) { const vs = variants(w), hit = v => v.length === 1 ? t.includes(' ' + v + ' ') : v.length === 2 ? t.includes(' ' + v) : t.includes(v); if (!vs.some(hit)) return; const nm = nameOf(sh); score += vs.some(v => nm.includes(' ' + v + ' ')) ? 6 : vs.some(v => nm.includes(' ' + v)) ? 4 : vs.some(v => nm.includes(v)) ? 2 : 1; }
            if (one && (sh.n.includes(` ${one} `) || sh.n.endsWith(` ${one}`) || sh.n.includes(`(${one})`))) score += 20;
            if (fold(sh.n).startsWith(words[0])) score += 3;
            out.push([score, i, sh]);
        });
        return out.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(x => x[2]);
    }

    /* ── chargement à la demande ── */
    const PATH_OK = /^[MLHVCSQTAZmlhvcsqtazEe0-9.,\s+-]{1,60000}$/;
    let loading = null;
    function loadLibrary() {
        if (K.libraryLoaded) return Promise.resolve(K.SHAPES);
        if (loading) return loading;
        loading = fetch(DATA_URL, {credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(data => {
            const rows = Array.isArray(data?.shapes) ? data.shapes : [];
            const cats = new Set(K.CATS.map(c => c[0]));
            for (const r of rows) {
                if (!Array.isArray(r) || r.length < 7) continue;
                const [k, n, c, d, eo, tags, box] = r;
                if (typeof k !== 'string' || !/^[a-z0-9_]{1,60}$/.test(k) || K.SHAPE_MAP[k] || typeof d !== 'string' || !PATH_OK.test(d) || !cats.has(c)) continue;
                const sh = {k, n: String(n || k).slice(0, 80), c, d, eo: !!eo, tags: String(tags || '').slice(0, 200), s: [24, 100, 256].includes(box) ? box : 100, lazy: true};
                K.SHAPES.push(sh); K.SHAPE_MAP[k] = sh;
            }
            K.libraryLoaded = true;
            try { document.dispatchEvent(new CustomEvent('lcnda:shapes-loaded', {detail: {count: rows.length}})); } catch (_) {}
            return K.SHAPES;
        }).catch(e => { loading = null; throw e; });
        return loading;
    }

    /** Le tracé d'une forme dans une boîte 100 × 100 (pour le garder dans un élément du tableau : il s'affiche alors sans la bibliothèque) */
    const d100cache = new Map();
    function shapeD100(shOrKey) {
        const sh = typeof shOrKey === 'string' ? K.shapeByKey(shOrKey) : shOrKey; if (!sh?.d) return '';
        if ((sh.s || 100) === 100) return sh.d;
        if (d100cache.has(sh.k)) return d100cache.get(sh.k);
        const k = 100 / sh.s, segs = K.absPath(sh.d).map(([c, ...a]) => [c, ...a.map(v => v * k)]);
        const out = K.pathStr(segs); d100cache.set(sh.k, out); return out;
    }

    /* ── la fenêtre de la bibliothèque : filtres avec le nombre trouvé, défilement virtuel, clavier ── */
    const CELL = 54, HEAD = 30, PAD = 12, BUF = 240;
    function openShapeLibrary({anchor, root = document.body, current = '', onPick = () => {}, onNew = null, onFrom = null} = {}) {
        (root || document).querySelector?.('.h-bd-shapelib')?.remove();
        document.querySelector('.h-bd-shapelib.sl-lib')?.remove();
        const p = K.prefs(), hidden = new Set(p.shapesHidden || []);
        const order = c => (p.shapeCats || []).indexOf(c);
        const cats = () => K.CATS.filter(c => (p.shapeCats || []).includes(c[0]) && !hidden.has('cat:' + c[0])).sort((a, b) => order(a[0]) - order(b[0]));
        const UI = window.LCNDA_UI;
        const m = document.createElement('div'); m.className = 'h-bd-shapelib sl-lib'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Bibliothèque de formes');
        m.innerHTML = `<div class="h-bd-shhead sl-head"><span class="sl-q" data-sl-q></span>${onNew ? '<button type="button" class="button small" data-sl-new>＋ Créer une forme</button>' : ''}${onFrom ? '<button type="button" class="button small secondary" data-sl-from title="Créer une forme à partir d’une autre (retourner, tourner, étirer, ajouter, percer)">🧩 À partir d’une forme</button>' : ''}<button type="button" class="icon-button sl-x" data-sl-x title="Fermer" aria-label="Fermer">×</button></div>
            <div class="h-bd-shcats sl-cats" role="tablist" data-sl-cats></div>
            <div class="sl-scroll" data-sl-scroll tabindex="0" aria-label="Formes (flèches pour choisir, Entrée pour prendre)"><div class="sl-space" data-sl-space></div></div>
            <div class="sl-foot" data-sl-foot aria-live="polite"></div>`;
        (anchor?.closest?.('.h-bd-menuwrap, .h-bd-isec, .h-bt-opts') || root || document.body).appendChild(m);
        let input;
        if (UI?.searchField) { const sf = UI.searchField({placeholder: 'Chercher une forme… (arbre, croix, É, drapeau)', delay: 80, label: 'Chercher une forme', onInput: () => { sel = -1; draw(true); }}); m.querySelector('[data-sl-q]').appendChild(sf); input = sf.input; }
        else { input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Chercher une forme…'; input.setAttribute('aria-label', 'Chercher une forme'); m.querySelector('[data-sl-q]').appendChild(input); input.addEventListener('input', () => { sel = -1; draw(true); }); }
        const scroll = m.querySelector('[data-sl-scroll]'), space = m.querySelector('[data-sl-space]'), catsEl = m.querySelector('[data-sl-cats]'), foot = m.querySelector('[data-sl-foot]');
        let cur = 'all', lines = [], flat = [], sel = -1, cols = 6, total = 0, state = K.libraryLoaded ? 'ok' : 'loading', raf = 0;
        const visibleShapes = () => K.allShapes().filter(sh => !hidden.has(sh.k));
        function build() {
            const q = input.value.trim(), cs = cats(), csSet = new Set(cs.map(c => c[0]));
            const pool = visibleShapes().filter(sh => csSet.has(sh.c));
            const found = q ? searchShapes(q, {list: pool}) : null;
            // filtres avec le nombre trouvé
            const count = {}; (found || pool).forEach(sh => { count[sh.c] = (count[sh.c] || 0) + 1; });
            if (cur !== 'all' && q && !count[cur]) cur = 'all';
            const n = (found || pool).length;
            catsEl.innerHTML = `<button type="button" role="tab" class="${cur === 'all' ? 'is-on is-active' : ''}" data-sl-cat="all" aria-selected="${cur === 'all'}">Toutes (${n.toLocaleString('fr-FR')})</button>` + cs.filter(c => !q || count[c[0]] || c[0] === cur).map(c => `<button type="button" role="tab" class="${cur === c[0] ? 'is-on is-active' : ''}" data-sl-cat="${esc(c[0])}" aria-selected="${cur === c[0]}">${c[2]} ${esc(c[1])} (${(count[c[0]] || 0).toLocaleString('fr-FR')})</button>`).join('');
            // lignes : titres de catégorie (sans recherche) et rangées de formes
            const w = scroll.clientWidth || 600; cols = Math.max(3, Math.floor((w - PAD * 2 + 6) / CELL));
            lines = []; flat = []; let y = 4;
            const push = list => { for (let i = 0; i < list.length; i += cols) { const row = list.slice(i, i + cols); lines.push({y, h: CELL, row, start: flat.length}); flat.push(...row); y += CELL; } };
            if (found) push(cur === 'all' ? found : found.filter(sh => sh.c === cur));
            else for (const c of cs) {
                if (cur !== 'all' && c[0] !== cur) continue;
                const l = K.shapesOf(c[0]).filter(sh => !hidden.has(sh.k));
                if (!l.length && c[0] !== 'mine') continue;
                lines.push({y, h: HEAD, head: c}); y += HEAD; push(l);
                if (c[0] === 'mine') { lines.push({y, h: CELL, row: [], newBtn: true}); y += CELL; }
            }
            total = y + 8; space.style.height = total + 'px';
            const curI = flat.findIndex(sh => sh.k === current); if (sel < 0 && !q && curI >= 0) sel = curI;
        }
        function paint() {
            raf = 0; const top = scroll.scrollTop, bottom = top + (scroll.clientHeight || 400);
            let html = '';
            if (state === 'loading') html += `<div class="sl-msg" style="top:${Math.max(0, top)}px">${UI?.spinner ? UI.spinner('Chargement de toutes les formes…') : 'Chargement…'}</div>`;
            if (state === 'error') html += `<div class="sl-msg" style="top:${Math.max(0, top)}px">${UI?.notice ? UI.notice('error', 'Les formes en plus n’ont pas pu être chargées.') : '⛔ Les formes en plus n’ont pas pu être chargées.'} <button type="button" class="button small secondary" data-sl-retry>Réessayer</button></div>`;
            for (const L of lines) {
                if (L.y + L.h < top - BUF || L.y > bottom + BUF) continue;
                if (L.head) { html += `<h5 class="sl-h" style="top:${L.y}px">${L.head[2]} ${esc(L.head[1])}</h5>`; continue; }
                if (L.newBtn) { html += `<div class="sl-row" style="top:${L.y}px"><button type="button" class="h-bd-shcell sl-cell h-bd-shnew" data-sl-new title="Créer une forme">＋</button></div>`; continue; }
                html += `<div class="sl-row" style="top:${L.y}px">${L.row.map((sh, j) => { const i = L.start + j; return `<button type="button" class="h-bd-shcell sl-cell${sh.k === current ? ' is-on' : ''}${i === sel ? ' is-sel' : ''}" data-shk="${esc(sh.k)}" data-i="${i}" title="${esc(sh.n)}" tabindex="-1">${K.shapeSvg(sh, 34)}</button>`; }).join('')}</div>`;
            }
            if (!flat.length && state !== 'loading') { const q = input.value.trim(); html += `<div class="sl-msg" style="top:8px">${q ? `Aucune forme pour « ${esc(q)} ». Essaie un autre mot (maison, croix, lettre, drapeau…).` : 'Aucune forme dans cette catégorie.'}</div>`; }
            space.innerHTML = html;
            const sh = flat[sel];
            foot.innerHTML = sh ? `<b>${esc(sh.n)}</b> <span class="muted">· ${esc(catName(sh.c))}</span>` : `<span class="muted">${flat.length.toLocaleString('fr-FR')} forme${flat.length > 1 ? 's' : ''} · ↑ ↓ ← → pour choisir, Entrée pour prendre, / pour chercher</span>`;
        }
        const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
        function draw(resetScroll = false) { build(); if (resetScroll) scroll.scrollTop = 0; paint(); }
        function lineOf(i) { return lines.find(L => L.row && i >= L.start && i < L.start + L.row.length); }
        function reveal(i) { const L = lineOf(i); if (!L) return; if (L.y < scroll.scrollTop) scroll.scrollTop = L.y - HEAD; else if (L.y + L.h > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = L.y + L.h - scroll.clientHeight + 4; }
        function move(e) {
            if (!flat.length) return false;
            if (sel < 0) { sel = 0; reveal(sel); paint(); return true; }
            const L = lineOf(sel), col = L ? sel - L.start : 0;
            if (e.key === 'ArrowRight') sel = Math.min(flat.length - 1, sel + 1);
            else if (e.key === 'ArrowLeft') sel = Math.max(0, sel - 1);
            else { const rows = lines.filter(x => x.row && x.row.length), r = rows.indexOf(L), t = rows[r + (e.key === 'ArrowDown' ? 1 : -1)]; if (!t) return true; sel = t.start + Math.min(col, t.row.length - 1); }
            reveal(sel); paint(); return true;
        }
        const close = () => { m.remove(); document.removeEventListener('pointerdown', off, true); ro?.disconnect(); };
        const pick = k => { close(); onPick(k); };
        function off(ev) { if (!m.isConnected) { document.removeEventListener('pointerdown', off, true); return; } if (!m.contains(ev.target) && !anchor?.contains?.(ev.target)) close(); }
        scroll.addEventListener('scroll', schedule, {passive: true});
        const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { const c0 = cols; const w = scroll.clientWidth || 600; if (Math.max(3, Math.floor((w - PAD * 2 + 6) / CELL)) !== c0) draw(); else schedule(); }) : null; ro?.observe(scroll);
        m.addEventListener('click', e => {
            const c = e.target.closest('[data-sl-cat]'); if (c) { cur = c.dataset.slCat; sel = -1; draw(true); return; }
            if (e.target.closest('[data-sl-x]')) { close(); return; }
            if (e.target.closest('[data-sl-new]')) { close(); onNew?.(); return; }
            if (e.target.closest('[data-sl-from]')) { close(); onFrom?.(); return; }
            if (e.target.closest('[data-sl-retry]')) { state = 'loading'; paint(); start(); return; }
            const b = e.target.closest('[data-shk]'); if (b) pick(b.dataset.shk);
        });
        m.addEventListener('pointerover', e => { const b = e.target.closest('[data-i]'); if (b) { const sh = flat[Number(b.dataset.i)]; if (sh) foot.innerHTML = `<b>${esc(sh.n)}</b> <span class="muted">· ${esc(catName(sh.c))}</span>`; } });
        m.addEventListener('keydown', e => {
            if (['ArrowDown', 'ArrowUp'].includes(e.key) || (['ArrowLeft', 'ArrowRight'].includes(e.key) && e.target !== input)) { if (move(e)) e.preventDefault(); return; }
            if (e.key === 'Enter' && (e.target === input || e.target === scroll)) { e.preventDefault(); const sh = flat[sel >= 0 ? sel : 0]; if (sh) pick(sh.k); return; }
            if (e.key === 'Tab' && !e.shiftKey && e.target === input && catsEl.children.length) { /* Tab : filtre suivant */ e.preventDefault(); const bs = [...catsEl.querySelectorAll('[data-sl-cat]')], i = bs.findIndex(b => b.dataset.slCat === cur); cur = bs[(i + 1) % bs.length].dataset.slCat; sel = -1; draw(true); return; }
            if (e.key === 'Escape') { e.stopPropagation(); if (input.value) return; /* C1 : Échap vide la case d'abord */ e.preventDefault(); close(); anchor?.focus?.(); }
        });
        function start() {
            if (K.libraryLoaded) { state = 'ok'; draw(); return; }
            loadLibrary().then(() => { if (!m.isConnected) return; state = 'ok'; draw(); }).catch(() => { if (!m.isConnected) return; state = 'error'; paint(); });
        }
        draw(); start();
        setTimeout(() => { input.focus(); document.addEventListener('pointerdown', off, true); }, 0);
        return {close, el: m};
    }

    Object.assign(K, {loadLibrary, shapeD100, searchShapes, openShapeLibrary, foldSearch: fold, LIB_CATS: NEW_CATS.map(c => c[0])});
    K.libraryLoaded = !!K.libraryLoaded;
    // une forme de la grande bibliothèque mise dans l'accès rapide : on la charge quand la page est tranquille
    const needs = () => { try { const p = K.prefs(); return (p.quickShapes || []).some(k => !K.SHAPE_MAP[k] && !String(k).startsWith('my_')); } catch (_) { return false; } };
    const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
    addEventListener('load', () => idle(() => { if (needs()) loadLibrary().catch(() => {}); }));
})();
