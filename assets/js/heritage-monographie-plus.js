/* LCNDA — 📜 Monographie de commune, plus complète et à ranger soi-même.
 *
 *  · Un registre commun : n'importe quelle partie de l'app peut ajouter sa partie à la monographie :
 *      window.LCNDA_EXT = window.LCNDA_EXT || {};
 *      (LCNDA_EXT.monographSections = LCNDA_EXT.monographSections || []).push({
 *          id: 'mines', icon: '⛏️', label: 'Mines et usines', group: 'Le lieu',
 *          render: async (place, host, ctx) => { host.innerHTML = '…'; ctx.source('BRGM'); return true; },  // false = rien à montrer → partie passée
 *          defaultOn: true, enabled: () => true, source: 'texte de la source (facultatif)'});
 *    place = {id, name, county, state, country, latitude, longitude} ; ctx = {data, cfg, village(), years(), source(t), count(n), esc, T}.
 *    Chaque partie se dessine quand elle arrive à l'écran (ou à l'impression), avec sa ligne « Source : … ».
 *  · « ⚙︎ Personnaliser » : glisser (ou ↑ ↓) pour l'ordre, cocher pour montrer / masquer, « ↶ Réinitialiser » ;
 *    pour toutes les communes (localStorage 'genealogie-monographie-parties') ou « seulement pour cette commune »
 *    ('genealogie-monographie-lieux', par numéro de lieu). Un écran intégré à un onglet garde l'organisation de son onglet.
 *    Les parties anciennes (actes, recensements…) et celles posées par d'autres fichiers (cartes postales, images,
 *    patrimoine, autour du village…) sont rangées pareil. Une partie vide est passée toute seule.
 *  · Les parties ajoutées ici : la famille ici, ses noms, ses métiers, une petite carte, le lieu à travers le temps
 *    (histoire du lieu), le pays à l'époque, la météo des actes, les élections (si allumées), les grands mouvements,
 *    où chercher (registres en ligne, paroisse).
 *  · L'impression et l'export suivent l'ordre choisi ; les parties masquées n'y sont pas.
 * Essai : tests/test-monographie-plus.js
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const KEY = 'genealogie-monographie-parties', KEY_PLACES = 'genealogie-monographie-lieux';

    /* ═════════ Les parties déjà là (dessinées par app-graphiques.js ou posées par d'autres fichiers) ═════════ */
    // [id, libellé, sélecteur] ; 'top' : en haut de la page (montrer / masquer seulement)
    const TOP = [['filters', '🔎 Les filtres (commune, années, sorte d’acte)', '.place-monograph-filter'], ['metrics', '🔢 Les chiffres', '.place-monograph-metrics']];
    const FIXED = [['events', '📜 Actes rattachés', '.place-monograph-section.is-events'], ['census', '🏠 Recensements', '.place-monograph-section.is-census'],
        ['digests', '📑 Dépouillements', '.place-monograph-section.is-digests'], ['battues', '🧭 Battues', '.place-monograph-section.is-battues'], ['cemetery', '⚰️ Cimetière', '.place-monograph-section.is-cemetery']];
    const ADOPTED = [['cplus', '🪦 Autour du village (église, cimetières, images anciennes)', '.cplus-place'], ['lp', '📜 Anciens noms, lieux-dits, patrimoine', '.lp-place, [data-lp-host]'],
        ['mr', '⛏️ Activités anciennes, moulins, rivière, musée', '.mr-place, [data-mr-host]'],
        ['postcards', '🏞 Cartes postales', '.place-monograph-postcards'], ['placeimgs', '🖼 Images du lieu', '.place-monograph-images']];
    const EMPTY_OK = new Set(['events']); // « Aucun acte pour ces filtres » reste : c'est la réponse aux filtres

    /* ═════════ Le registre ═════════ */
    const reg = Array.isArray(ext.monographSections) ? ext.monographSections : [];
    ext.monographSections = reg;
    const regOk = s => s && typeof s === 'object' && /^[a-z0-9_-]{1,40}$/i.test(String(s.id || '')) && typeof s.render === 'function';
    const registered = () => { const seen = new Set(); return reg.filter(s => regOk(s) && !seen.has(s.id) && seen.add(s.id) && !TOP.concat(FIXED, ADOPTED).some(x => x[0] === s.id)); };
    const enabledReg = () => registered().filter(s => { try { return s.enabled ? !!s.enabled() : true; } catch (_) { return false; } });
    const regLabel = s => `${s.icon ? s.icon + ' ' : ''}${T(s.label || s.id)}`;
    /** toutes les parties, dans l'ordre de départ : [[id, libellé]] (aussi pour l'organisation d'un onglet, heritage-tabs.js) */
    function defaultList() {
        return [...TOP.map(([k, l]) => [k, T(l)]), ...FIXED.map(([k, l]) => [k, T(l)]), ...enabledReg().map(s => [s.id, regLabel(s)]), ...ADOPTED.map(([k, l]) => [k, T(l)])];
    }
    ext.monographSectionList = defaultList;

    /* ═════════ Les réglages : pour toutes les communes, ou pour une seule ═════════ */
    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const clean = l => (l && typeof l === 'object' ? {order: (Array.isArray(l.order) ? l.order : []).map(String).slice(0, 200), hidden: (Array.isArray(l.hidden) ? l.hidden : []).map(String).slice(0, 200), shown: (Array.isArray(l.shown) ? l.shown : []).map(String).slice(0, 200)} : null);
    const placeKey = place => String(Number(place?.id) || fold(place?.name) || '');
    function source(place) {
        const own = window.LCNDA_SCREEN_LAYOUT;
        if (own?.kind === 'monograph' && Array.isArray(own.order)) return {from: 'screen', layout: clean(own)};
        const per = read(KEY_PLACES, {}), k = placeKey(place);
        if (k && per[k]) return {from: 'place', layout: clean(per[k])};
        return {from: 'global', layout: clean(read(KEY, null)) || {order: [], hidden: [], shown: []}};
    }
    function saveLayout(place, from, layout) {
        if (from === 'place') { const per = read(KEY_PLACES, {}); per[placeKey(place)] = layout; write(KEY_PLACES, per); }
        else if (from === 'global') write(KEY, layout);
    }
    /** l'ordre et ce qui est masqué, pour les parties qui existent maintenant */
    function effective(layout, ids) {
        const order = [...new Set(layout.order.filter(k => ids.includes(k)))];
        ids.forEach(k => { if (!order.includes(k)) order.push(k); });
        const offByDefault = new Set(registered().filter(s => s.defaultOn === false).map(s => s.id));
        const hidden = new Set(ids.filter(k => layout.hidden.includes(k) || (offByDefault.has(k) && !layout.shown.includes(k))));
        return {order, hidden};
    }

    /* ═════════ Monter la monographie ═════════ */
    let cur = null; // {place, cfg, data, shell, box, io, mo, village, …}
    function idOf(el) {
        if (el.dataset.mp) return el.dataset.mp;
        if (el.dataset.mpId) return el.dataset.mpId;
        for (const [k, , sel] of FIXED.concat(ADOPTED)) if (el.matches(sel)) return k;
        const c = [...el.classList].find(x => !/^(is-|maintenance-panel|place-monograph-section$)/.test(x));
        return c ? 'c:' + c : '';
    }
    const labelOf = (id, el) => {
        const d = defaultList().find(x => x[0] === id); if (d) return d[1];
        const h = el?.querySelector('h3, h4, header .eyebrow'); return (h?.textContent || id.replace(/^c:/, '')).trim().slice(0, 80);
    };
    /** les parties présentes dans la page : [{id, el, top}] */
    function present() {
        if (!cur?.shell?.isConnected) return [];
        const out = TOP.map(([k, , sel]) => ({id: k, el: cur.shell.querySelector(sel), top: true})).filter(x => x.el);
        if (cur.box) [...cur.box.children].forEach(el => { const id = idOf(el); if (id && !out.some(x => x.id === id)) out.push({id, el}); });
        return out;
    }
    function allIds() {
        const ids = defaultList().map(x => x[0]);
        present().forEach(x => { if (!ids.includes(x.id)) ids.push(x.id); });
        return ids;
    }
    let arranging = false;
    function arrange() {
        if (!cur?.box?.isConnected) return;
        const {layout} = source(cur.place), parts = present(), {order, hidden} = effective(layout, allIds());
        arranging = true;
        try {
            parts.forEach(p => {
                const off = hidden.has(p.id), want = off || (!p.top && p.el.dataset.mpEmpty === '1');
                p.el.toggleAttribute('data-mp-off', off);
                // ne remontre que ce que ce fichier a caché (une partie peut se cacher toute seule quand elle n'a rien)
                if (want) { if (!p.el.hidden) { p.el.hidden = true; p.el.dataset.mpHid = '1'; } }
                else if (p.el.dataset.mpHid) { p.el.hidden = false; delete p.el.dataset.mpHid; }
            });
            const kids = parts.filter(p => !p.top).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(p => p.el);
            const now = [...cur.box.children].filter(el => kids.includes(el));
            if (kids.some((el, i) => now[i] !== el)) kids.forEach(el => cur.box.appendChild(el));
        } finally { cur.mo?.takeRecords(); arranging = false; }
        watchLazy();
        if (cur.panel?.isConnected) drawPanel();
    }

    /* une partie vide d'avant (0 dépouillement, 0 battue…) : passée */
    function skipEmptyFixed() {
        FIXED.forEach(([k, , sel]) => {
            if (EMPTY_OK.has(k)) return;
            const el = cur.box?.querySelector(sel); if (!el) return;
            const n = Number(el.querySelector(':scope > header strong')?.textContent || 0);
            if (!n) el.dataset.mpEmpty = '1';
        });
    }

    function shellHtml(s) {
        return `<section class="place-monograph-section mp-sec no-export" data-mp="${esc(s.id)}" data-mp-state="wait"><header><span class="eyebrow">${esc(regLabel(s))}</span><strong hidden></strong></header>
            <div class="mp-body">${UI().skeleton ? UI().skeleton(2) : `<p class="muted">${esc(T('Chargement…'))}</p>`}</div><p class="mp-src" hidden></p></section>`;
    }
    function addShells() {
        if (!cur?.box) return;
        const anchor = () => cur.box.querySelector(ADOPTED.map(x => x[2]).join(','));
        enabledReg().forEach(s => {
            if (cur.box.querySelector(`[data-mp="${CSS.escape(s.id)}"]`)) return;
            const a = anchor(); if (a) a.insertAdjacentHTML('beforebegin', shellHtml(s)); else cur.box.insertAdjacentHTML('beforeend', shellHtml(s));
        });
    }

    /** dessine une partie une seule fois ; une partie déjà en route renvoie la même promesse (renderAll attend aussi celles-là) */
    function renderOne(sec) {
        if (!sec) return Promise.resolve();
        if (sec.__mpP) return sec.__mpP;
        if (sec.dataset.mpState !== 'wait') return Promise.resolve();
        return (sec.__mpP = renderNow(sec));
    }
    async function renderNow(sec) {
        const s = registered().find(x => x.id === sec.dataset.mp); if (!s || !cur) return;
        sec.dataset.mpState = 'run';
        const body = sec.querySelector('.mp-body'), src = sec.querySelector('.mp-src'), count = sec.querySelector(':scope > header strong');
        const ctx = {data: cur.data, cfg: cur.cfg, esc, T, village: () => village(), years: () => familyYears(),
            source: t => { if (t) { src.textContent = `${T('Source :')} ${t}`; src.hidden = false; } else src.hidden = true; },
            count: n => { if (n == null || n === '') { count.hidden = true; return; } count.textContent = String(n); count.hidden = false; }};
        if (s.source) ctx.source(T(s.source));
        let ok;
        try { ok = await s.render(cur.place, body, ctx); } catch (e) { console.error(e); ok = false; }
        if (!sec.isConnected) return;
        sec.dataset.mpState = ok === false || !body.innerHTML.trim() ? 'empty' : 'done';
        if (sec.dataset.mpState === 'empty') { sec.dataset.mpEmpty = '1'; sec.hidden = true; }
        else sec.classList.remove('no-export');
        if (cur.panel?.isConnected) drawPanel();
    }
    function watchLazy() {
        if (!cur?.box) return;
        const waiting = [...cur.box.querySelectorAll(':scope > .mp-sec[data-mp-state="wait"]')].filter(s => !s.hidden);
        if (!('IntersectionObserver' in window)) { waiting.forEach(renderOne); return; }
        cur.io = cur.io || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { cur?.io?.unobserve(e.target); renderOne(e.target); } }), {rootMargin: '400px 0px'});
        waiting.forEach(s => { if (!s.dataset.mpObs) { s.dataset.mpObs = '1'; cur.io.observe(s); } });
    }
    /** tout dessiner tout de suite (impression, export) */
    async function renderAll() {
        if (!cur?.box) return;
        await Promise.all([...cur.box.querySelectorAll(':scope > .mp-sec:is([data-mp-state="wait"], [data-mp-state="run"])')].filter(s => !s.hidden).map(renderOne));
    }

    function mount({place, cfg, data}) {
        const shell = document.querySelector('#workspace .place-monograph-shell'); if (!shell) return;
        cur?.io?.disconnect(); cur?.mo?.disconnect();
        const box = shell.querySelector('.place-monograph-sections');
        cur = {place: place || {}, cfg: cfg || {}, data: data || {}, shell, box, villageP: null, panel: null};
        addButton();
        if (!data?.ready || !box) return;
        box.dataset.mpMounted = '1';
        skipEmptyFixed();
        addShells();
        arrange();
        // les parties posées plus tard par d'autres fichiers (patrimoine, autour du village…) : rangées aussi
        cur.mo = new MutationObserver(() => { if (arranging || cur?.box !== box) return; if (!cur.raf) cur.raf = requestAnimationFrame(() => { if (cur) cur.raf = 0; arrange(); }); });
        cur.mo.observe(box, {childList: true});
    }
    // une partie ajoutée au registre après coup : elle arrive dans la page ouverte
    const push0 = reg.push.bind(reg);
    reg.push = (...items) => { const n = push0(...items); if (cur?.box?.isConnected) { addShells(); arrange(); } return n; };

    /* ═════════ ⚙︎ Personnaliser ═════════ */
    function addButton() {
        const strip = document.querySelector('#workspace .place-monograph-layout .tool-strip');
        if (!strip || strip.querySelector('[data-mp-custom]')) return;
        const b = `<button type="button" class="button small secondary no-export" data-mp-custom aria-expanded="false" title="${esc(T('Choisir l’ordre des parties, en montrer ou en masquer'))}">⚙︎ ${esc(T('Personnaliser'))}</button>`;
        const ex = strip.querySelector('.graph-export-toolbar'); if (ex) ex.insertAdjacentHTML('beforebegin', b); else strip.insertAdjacentHTML('beforeend', b);
    }
    function openPanel(toggle = true) {
        if (!cur?.shell) return;
        if (cur.panel?.isConnected) { if (toggle) { cur.panel.remove(); cur.panel = null; document.querySelector('[data-mp-custom]')?.setAttribute('aria-expanded', 'false'); } return; }
        const head = cur.shell.querySelector('.place-monograph-head');
        const div = document.createElement('div'); div.className = 'mp-panel no-export'; div.setAttribute('role', 'region'); div.setAttribute('aria-label', T('Personnaliser la monographie'));
        (head || cur.shell.firstElementChild)?.insertAdjacentElement('afterend', div) || cur.shell.prepend(div);
        cur.panel = div; document.querySelector('[data-mp-custom]')?.setAttribute('aria-expanded', 'true');
        drawPanel(); bindPanel(div);
        div.querySelector('input, button')?.focus();
    }
    let dragging = false; // pendant un glisser, la liste n'est pas redessinée (une partie qui finit de se dessiner attendra)
    function drawPanel() {
        const div = cur.panel; if (!div || dragging) return;
        const {from, layout} = source(cur.place), ids = allIds(), {order, hidden} = effective(layout, ids);
        const parts = present(), here = new Map(parts.map(p => [p.id, p.el]));
        const ro = from === 'screen', name = cur.place?.name || cur.data?.place?.name || '';
        const state = id => { const el = here.get(id); if (!el) return T('(pas ici)'); if (el.dataset.mpEmpty === '1' || (el.hidden && !el.dataset.mpHid) || (!el.dataset.mp && !el.innerHTML.trim())) return T('(rien pour cette commune)'); return ''; };
        const li = (id, top) => { const off = hidden.has(id), why = state(id);
            return `<li data-k="${esc(id)}" class="${off ? 'is-off' : ''}${why ? ' is-none' : ''}" ${top || ro ? '' : 'draggable="true"'}>${top ? '' : '<span class="mp-grip" aria-hidden="true">⠿</span>'}
                <label class="checkbox-line"><input type="checkbox" data-mp-show ${off ? '' : 'checked'} ${ro ? 'disabled' : ''}> <span>${esc(labelOf(id, here.get(id)))}</span></label>${why ? ` <small class="muted">${esc(why)}</small>` : ''}
                ${top || ro ? '' : `<span class="mp-moves"><button type="button" class="icon-button small" data-mp-move="-1" aria-label="${esc(T('Monter'))}" title="${esc(T('Monter'))}">↑</button><button type="button" class="icon-button small" data-mp-move="1" aria-label="${esc(T('Descendre'))}" title="${esc(T('Descendre'))}">↓</button></span>`}</li>`; };
        const topIds = TOP.map(x => x[0]);
        const focusK = document.activeElement?.closest?.('.mp-panel li')?.dataset.k, focusWhat = document.activeElement?.dataset?.mpMove ?? (document.activeElement?.matches?.('[data-mp-show]') ? 'show' : '');
        const html = `<div class="mp-panel-head"><strong>⚙︎ ${esc(T('Personnaliser la monographie'))}</strong><span class="spacer"></span><button type="button" class="icon-button" data-mp-close aria-label="${esc(T('Fermer'))}" title="${esc(T('Fermer'))}">✕</button></div>
            ${ro ? `<p class="muted">${esc(T('Cet écran a sa propre organisation : elle se change dans son onglet (crayon de l’onglet).'))}</p>` : `<p class="muted">${esc(T('Glisse ⠿ (ou ↑ ↓) pour choisir l’ordre, décoche pour masquer. Une partie vide pour cette commune est passée toute seule.'))}</p>
            <label class="checkbox-line mp-local"><input type="checkbox" data-mp-local ${from === 'place' ? 'checked' : ''}> ${esc(T('Seulement pour cette commune ({c})', {c: name || T('celle-ci')}))}</label>`}
            <h4>${esc(T('En haut de la page'))}</h4><ul class="mp-list mp-top">${topIds.map(k => li(k, true)).join('')}</ul>
            <h4>${esc(T('Les parties, dans l’ordre'))}</h4><ol class="mp-list" data-mp-order>${order.filter(k => !topIds.includes(k) && here.has(k)).map(k => li(k, false)).join('')}</ol>
            ${ro ? '' : `<p><button type="button" class="button small secondary" data-mp-reset>↶ ${esc(T('Réinitialiser'))}</button> <small class="muted">${esc(from === 'place' ? T('remet cette commune comme les autres') : T('remet l’ordre et les parties de départ'))}</small></p>`}`;
        // rien n'a changé (une partie de plus s'est dessinée, la page s'est rangée) : la liste reste telle quelle — sinon
        // chaque fin de dessin remplacerait les boutons sous le doigt (clic perdu, focus perdu) quand il y a beaucoup de parties
        if (html === div.__mpHtml) return;
        div.__mpHtml = html; div.innerHTML = html;
        if (focusK) { const l = div.querySelector(`li[data-k="${CSS.escape(focusK)}"]`); (focusWhat === 'show' ? l?.querySelector('[data-mp-show]') : l?.querySelector(`[data-mp-move="${focusWhat}"]`) || l?.querySelector('[data-mp-show]'))?.focus(); }
    }

    /* ↶ : une série de changements donne un seul « ↶ Annuler » */
    let burst = null;
    function change(fn, message = T('Monographie réorganisée')) {
        const {from, layout} = source(cur.place); if (from === 'screen') return;
        const place = cur.place;
        if (!burst) burst = {from, before: JSON.parse(JSON.stringify(layout)), per: read(KEY_PLACES, {}), glob: read(KEY, null)};
        const next = clean(JSON.parse(JSON.stringify(layout)));
        fn(next); saveLayout(place, from, next); arrange();
        clearTimeout(burst.t);
        const b = burst;
        b.t = setTimeout(() => {
            burst = null;
            const after = {per: read(KEY_PLACES, {}), glob: read(KEY, null)};
            const put = st => { write(KEY_PLACES, st.per); write(KEY, st.glob); if (cur) arrange(); };
            if (A().undoToast) A().undoToast(message, {undo: () => put(b), redo: () => put(after)}); else A().toast?.(message);
        }, 900);
    }
    /** l'ordre complet : les parties de la liste dans leur nouvel ordre, les autres (absentes de cette commune) gardent leur place */
    function orderNow() {
        const listed = [...cur.panel.querySelectorAll('[data-mp-order] li')].map(li => li.dataset.k), set = new Set(listed);
        const full = effective(source(cur.place).layout, allIds()).order.filter(k => !TOP.some(x => x[0] === k));
        let i = 0; return full.map(k => (set.has(k) ? listed[i++] : k));
    }
    function bindPanel(div) {
        div.addEventListener('click', e => {
            if (e.target.closest('[data-mp-close]')) { openPanel(true); document.querySelector('[data-mp-custom]')?.focus(); return; }
            const mv = e.target.closest('[data-mp-move]');
            if (mv) {
                // ↑ ↓ passent par-dessus les parties vides ici : le déplacement se voit dans la page
                const li = mv.closest('li'), up = mv.dataset.mpMove === '-1', step = el => (up ? el.previousElementSibling : el.nextElementSibling);
                let to = step(li); while (to && to.classList.contains('is-none') && step(to)) to = step(to);
                if (!to) return;
                if (mv.dataset.mpMove === '-1') li.parentElement.insertBefore(li, to); else li.parentElement.insertBefore(to, li);
                const o = orderNow();
                change(l => { l.order = [...TOP.map(x => x[0]), ...o]; });
                return;
            }
            if (e.target.closest('[data-mp-reset]')) {
                const {from} = source(cur.place), before = {per: read(KEY_PLACES, {}), glob: read(KEY, null)};
                if (from === 'place') { const per = read(KEY_PLACES, {}); delete per[placeKey(cur.place)]; write(KEY_PLACES, per); } else write(KEY, null);
                arrange();
                const after = {per: read(KEY_PLACES, {}), glob: read(KEY, null)}, put = st => { write(KEY_PLACES, st.per); write(KEY, st.glob); if (cur) arrange(); };
                A().undoToast?.(T('Monographie remise comme au départ'), {undo: () => put(before), redo: () => put(after)});
            }
        });
        div.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-mp-show]')) {
                const k = t.closest('li').dataset.k;
                change(l => { l.hidden = l.hidden.filter(x => x !== k); l.shown = l.shown.filter(x => x !== k); if (t.checked) l.shown.push(k); else l.hidden.push(k); });
                return;
            }
            if (t.matches('[data-mp-local]')) {
                const per = read(KEY_PLACES, {}), k = placeKey(cur.place), before = {per: JSON.parse(JSON.stringify(per)), glob: read(KEY, null)};
                if (t.checked) per[k] = clean(read(KEY, null)) || {order: [], hidden: [], shown: []}; else delete per[k];
                write(KEY_PLACES, per); arrange();
                const after = {per: read(KEY_PLACES, {}), glob: read(KEY, null)}, put = st => { write(KEY_PLACES, st.per); write(KEY, st.glob); if (cur) arrange(); };
                A().undoToast?.(t.checked ? T('Cette commune a maintenant son propre rangement') : T('Cette commune reprend le rangement de toutes les communes'), {undo: () => put(before), redo: () => put(after)});
            }
        });
        // glisser-déposer
        let drag = null;
        div.addEventListener('dragstart', e => { const li = e.target.closest?.('[data-mp-order] li'); if (!li) return; drag = li; li.classList.add('is-drag'); dragging = true; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.k); } catch (_) {} });
        div.addEventListener('dragover', e => {
            const li = e.target.closest?.('[data-mp-order] li'); if (!drag || !li || li === drag) return;
            e.preventDefault();
            const r = li.getBoundingClientRect(); li.parentElement.insertBefore(drag, e.clientY > r.top + r.height / 2 ? li.nextElementSibling : li);
        });
        div.addEventListener('drop', e => { if (drag) e.preventDefault(); });
        div.addEventListener('dragend', () => { dragging = false; if (!drag) return; drag.classList.remove('is-drag'); drag = null; const o = orderNow(); change(l => { l.order = [...TOP.map(x => x[0]), ...o]; }); });
    }
    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-mp-custom]')) { e.preventDefault(); openPanel(true); return; }
        const p = e.target.closest?.('[data-mp-person]'); if (p) { e.preventDefault(); A().state.currentPersonId = Number(p.dataset.mpPerson); A().setModule('personnes'); return; }
        if (e.target.closest?.('[data-mp-village]') && cur?.village) { e.preventDefault(); const st = A().state; st.hVillage = cur.village.key; st.listType = 'villages'; A().setModule('listes'); return; }
        if (e.target.closest?.('[data-mp-ouc]')) { e.preventDefault(); ext.ouChercher?.openPerson?.(0); return; }
        if (e.target.closest?.('[data-graph-export]') && cur?.box?.isConnected) renderAll(); // impression, export : tout est dessiné
    }, true);
    window.addEventListener('beforeprint', () => { if (cur?.box?.isConnected) renderAll(); });

    /* ═════════ Les données de la famille pour cette commune (fiche du village) ═════════ */
    function village() {
        if (cur.villageP) return cur.villageP;
        const place = cur.place, me = cur;
        cur.villageP = (async () => {
            if (!place?.name) return null;
            let list = [];
            try { list = (await api('villages', {q: place.name})).villages || []; } catch (_) { return null; }
            const f = fold(place.name), cty = fold(place.county);
            const same = list.filter(v => fold(v.name) === f);
            const pick = same.find(v => !cty || fold(v.county) === cty) || same[0] || list.find(v => !cty || fold(v.county) === cty) || null;
            if (!pick) return null;
            try { const v = await api('village', {key: pick.key}); if (me === cur) cur.village = v; return v; } catch (_) { return null; }
        })();
        return cur.villageP;
    }
    async function familyYears() {
        const v = await village();
        let ys = (v?.families || []).flatMap(f => [f.from, f.to]).filter(Boolean).map(Number);
        if (!ys.length) ys = (cur.data?.events || []).map(e => Number(e.year)).filter(Boolean);
        return ys.length ? {from: Math.min(...ys), to: Math.max(...ys)} : null;
    }

    /* ═════════ Les parties ajoutées ═════════ */
    const add = s => { if (!reg.some(x => x.id === s.id)) push0(s); };
    const MINE = T('ta généalogie');

    // 👪 La famille ici : combien, de quand à quand, naissances / mariages / décès par demi-siècle
    add({id: 'family', icon: '👪', label: 'La famille ici', group: 'Ta famille', render: async (place, host, ctx) => {
        const v = await ctx.village(); if (!v || !v.people_count) return false;
        const fy = await ctx.years(), first = (ctx.data.events || []).find(e => e.year);
        const types = (v.decades_by_type || []).slice(0, 3), periods = new Set();
        types.forEach(t => Object.keys(t.decades).forEach(d => periods.add(Math.floor(Number(d) / 50) * 50)));
        const ps = [...periods].sort((a, b) => a - b);
        const cell = (t, p) => Object.entries(t.decades).filter(([d]) => Math.floor(Number(d) / 50) * 50 === p).reduce((a, [, n]) => a + Number(n), 0);
        const table = ps.length > 1 ? `<details class="mp-more"><summary>${esc(T('▸ plus : par demi-siècle'))}</summary><table class="data-table mp-table"><thead><tr><th>${esc(T('Période'))}</th>${types.map(t => `<th>${esc(T(t.label))}</th>`).join('')}</tr></thead>
            <tbody>${ps.map(p => `<tr><td>${p}–${p + 49}</td>${types.map(t => `<td>${cell(t, p) || '·'}</td>`).join('')}</tr>`).join('')}</tbody></table></details>` : '';
        ctx.count(v.people_count);
        const pl = (n, a, b) => esc(A().plural ? A().plural(n, T(a), T(b)) : `${n} ${T(b)}`);
        host.innerHTML = `<p>${T('{n} de ta famille ont vécu ici{span} : {acts}.', {n: `<b>${pl(v.people_count, 'personne', 'personnes')}</b>`,
            span: fy ? ' ' + T('de {a} à {b}', {a: String(fy.from), b: String(fy.to)}) : '', acts: [pl(v.acts.baptemes, 'naissance ou baptême', 'naissances ou baptêmes'), pl(v.acts.mariages, 'mariage', 'mariages'), pl(v.acts.deces, 'décès', 'décès')].join(', ')})}</p>
            ${first ? `<p class="muted">${esc(T('Premier acte connu : {t}, {d}', {t: first.type_label || T('acte'), d: first.date_text || String(first.year)}))}${first.person_id ? ` — <button type="button" class="link-button" data-mp-person="${Number(first.person_id)}">${esc(first.person_name)}</button>` : ''}</p>` : ''}
            ${table}<p class="h-links"><button type="button" class="link-button" data-mp-village>${esc(T('🏘️ Ouvrir la fiche du village'))}</button></p>`;
        ctx.source(MINE);
        return true;
    }});
    // 🏷 Les noms de famille d'ici
    add({id: 'surnames', icon: '🏷', label: 'Les noms de famille d’ici', group: 'Ta famille', render: async (place, host, ctx) => {
        const v = await ctx.village(); const fam = v?.families || []; if (!fam.length) return false;
        const chip = f => `<li><b>${esc(f.name)}</b> <small class="muted">${esc([A().plural ? A().plural(f.count, T('personne'), T('personnes')) : f.count, f.from ? (f.to && f.to !== f.from ? `${f.from}–${f.to}` : String(f.from)) : ''].filter(Boolean).join(' · '))}</small>
            ${(f.people || []).length ? `<details class="mp-more"><summary>${esc(T('▸ qui'))}</summary>${f.people.slice(0, 30).map(p => `<button type="button" class="link-button" data-mp-person="${Number(p.id)}">${esc([p.first_name, p.last_name].filter(Boolean).join(' ') || '?')}</button>`).join(', ')}</details>` : ''}</li>`;
        ctx.count(fam.length);
        host.innerHTML = `<p>${esc(T('Les noms les plus portés ici : {l}.', {l: fam.slice(0, 3).map(f => f.name).join(', ')}))}</p><ul class="mp-names">${fam.slice(0, 8).map(chip).join('')}</ul>
            ${fam.length > 8 ? `<details class="mp-more"><summary>${esc(T('▸ plus ({n})', {n: fam.length - 8}))}</summary><ul class="mp-names">${fam.slice(8, 80).map(chip).join('')}</ul></details>` : ''}`;
        ctx.source(MINE);
        return true;
    }});
    // ⚒️ Les métiers
    add({id: 'jobs', icon: '⚒️', label: 'Les métiers de la famille ici', group: 'Ta famille', render: async (place, host, ctx) => {
        const v = await ctx.village(); const jobs = v?.jobs || []; if (!jobs.length) return false;
        const top = Math.max(1, ...jobs.map(j => j.count));
        host.innerHTML = `<ul class="h-bars">${jobs.slice(0, 10).map(j => `<li><span class="h-bar-label">${esc(j.name)}</span><span class="h-bar"><i style="width:${Math.round(j.count / top * 100)}%"></i></span><span>${j.count}${j.from ? ` <small class="muted">${j.from}${j.to && j.to !== j.from ? '–' + j.to : ''}</small>` : ''}</span></li>`).join('')}</ul>`;
        ctx.source(MINE);
        return true;
    }});
    // 🗺️ Une petite carte
    add({id: 'minimap', icon: '🗺️', label: 'Petite carte', group: 'Le lieu', render: async (place, host, ctx) => {
        const lat = place.latitude, lon = place.longitude;
        if (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '' || !ext.villageParts?.mapHtml || !A().lngToX) return false;
        host.innerHTML = `<div class="mp-map">${ext.villageParts.mapHtml({lat: Number(lat), lon: Number(lon), name: place.name}, 'standard', 12)}</div>`;
        ctx.source('© OpenStreetMap');
        return true;
    }});
    // 🏘 Le lieu à travers le temps (Histoire du lieu : population, train, séismes, inondations)
    add({id: 'histoire', icon: '🏘', label: 'Le lieu à travers le temps', group: 'Le lieu', render: async (place, host, ctx) => {
        if (!Number(place.id) || !ext.histoire?.placeInto) return false;
        const fy = await ctx.years();
        return ext.histoire.placeInto(host, place.id, {from: fy?.from || 1700, to: Math.min(new Date().getFullYear(), fy?.to || new Date().getFullYear())});
    }});
    // 🗺 Le pays à l'époque (frontières CShapes) et ses chiffres
    add({id: 'country', icon: '🗺', label: 'Le pays à l’époque', group: 'Le monde', render: async (place, host, ctx) => {
        const M = ext.mondeContexte; const lat = Number(place.latitude), lon = Number(place.longitude);
        if (!M?.load || place.latitude == null || place.longitude == null || place.latitude === '' || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
        let B, C; try { [B, C] = await Promise.all([M.load(), M.loadStats()]); } catch (_) { return false; }
        const steps = [];
        for (let y = M.FIRST_EUROPE; y <= M.LAST; y++) {
            const r = M.lookup(B, lat, lon, M.dateNum(y, ''));
            const label = r ? r.label : '';
            if (!steps.length || steps[steps.length - 1].label !== label) steps.push({from: y, label, iso: r?.iso || 0}); else steps[steps.length - 1].to = y;
        }
        const known = steps.filter(s => s.label); if (!known.length) return false;
        const fy = await ctx.years();
        const lines = known.map(s => `<li><b>${s.from}${s.to && s.to !== s.from ? '–' + s.to : ''}</b> : ${esc(s.label)}</li>`).join('');
        const stat = y => { const s = known.find(k => y >= k.from && y <= (k.to || k.from)); if (!s?.iso) return ''; const st = M.statsAt(C, s.iso, y); return st.length ? `<li>${esc(T('{enPays} en {y} : {liste}.', {enPays: (x => x.charAt(0).toUpperCase() + x.slice(1))(M.inCountry(C.c[String(s.iso)]?.n || s.label)), y: String(y), liste: st.map(x => x.text).join(' · ')}))}</li>` : ''; };
        const stats = fy ? [...new Set([Math.max(fy.from, M.FIRST_EUROPE), Math.min(fy.to, M.LAST)])].filter(y => y >= M.FIRST_EUROPE && y <= M.LAST).map(stat).join('') : '';
        const one = known.length === 1 && known[0].from === M.FIRST_EUROPE;
        host.innerHTML = `<p>${one ? esc(T('Depuis {a}, ce lieu a toujours été dans le même pays : {p}.', {a: String(known[0].from), p: known[0].label})) : esc(T('Ce lieu a changé de pays {n} fois depuis {a}.', {n: known.length - 1, a: String(known[0].from)}))}</p>
            ${one ? '' : `<details class="mp-more" open><summary>${esc(T('▸ plus'))}</summary><ul class="mc-rows">${lines}</ul></details>`}${stats ? `<ul class="mc-stats">${stats}</ul>` : ''}`;
        ctx.source(T('Frontières : {a}', {a: B.raw?.attr || 'CShapes (ETH Zürich)'}) + (stats ? ' · Clio-Infra, Maddison Project' : ''));
        return true;
    }});
    // 🌦 Le temps qu'il faisait aux actes d'ici
    add({id: 'weather', icon: '🌦', label: 'Le temps qu’il faisait aux actes d’ici', group: 'Le lieu', render: async (place, host, ctx) => {
        const W = ext.meteo; const evs = (ctx.data.events || []).filter(e => Number(e.id) && e.date_text);
        if (!W?.decorate || !evs.length || W.installed === false) return false;
        host.innerHTML = `<div class="mp-wx">${evs.slice(0, 60).map(e => `<div class="mp-wx-row" data-event-id="${Number(e.id)}"><span>${esc(e.type_label || T('Acte'))} · ${esc(e.date_text)}</span> <small class="muted">${esc(e.person_id ? e.person_name : [e.partner1_name, e.partner2_name].filter(Boolean).join(' et '))}</small></div>`).join('')}</div>`;
        await W.decorate(host, {rowSel: '.mp-wx-row[data-event-id]', after: (row, html) => row.insertAdjacentHTML('beforeend', html)});
        host.querySelectorAll('.mp-wx-row').forEach(r => { if (!r.querySelector('.wx-pill')) r.remove(); });
        const n = host.querySelectorAll('.mp-wx-row').length; if (!n) return false;
        host.querySelectorAll('.mp-wx-row').forEach((r, i) => { if (i >= 8) r.hidden = true; });
        if (n > 8) host.insertAdjacentHTML('beforeend', `<button type="button" class="link-button" data-mp-wx-all>${esc(T('▸ plus ({n})', {n: n - 8}))}</button>`);
        host.insertAdjacentHTML('afterbegin', `<p>${esc(T('Le temps du jour, pour {n} actes de la famille ici (clique pour le détail).', {n}))}</p>`);
        ctx.count(n); ctx.source(T('🌦 Météo d’autrefois (stations et réanalyses, voir le détail de chaque jour)'));
        return true;
    }});
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-mp-wx-all]'); if (b) { b.parentElement.querySelectorAll('.mp-wx-row[hidden]').forEach(r => { r.hidden = false; }); b.remove(); } });
    // 🗳 Comment on votait ici (seulement si les élections sont allumées dans les Réglages)
    add({id: 'elections', icon: '🗳', label: 'Comment on votait ici', group: 'Le monde', enabled: () => !!ext.elections?.isOn?.(), render: async (place, host, ctx) => {
        if (!Number(place.id) || !ext.elections?.isOn?.()) return false;
        let d; try { d = await api('elections_place', {id: Number(place.id)}); } catch (_) { return false; }
        if (!d?.installed || !(d.elections || []).length || !ext.elections.rowHtml) return false;
        const list = d.elections, last = list[list.length - 1], top = last.groups[0];
        host.innerHTML = `${top ? `<p>${esc(T('À {c}, {p} votent {v} en {y}.', {c: last.commune.name, p: `${Math.round(top.pct)} %`, v: top.phrase || T('pour {x}', {x: top.label}), y: String(last.year)}))}</p>` : ''}
            <details class="mp-more"><summary>${esc(T('▸ plus ({n})', {n: list.length}))}</summary><div class="el-list">${list.map(el => ext.elections.rowHtml(el, false)).join('')}</div></details>`;
        ctx.count(list.length); ctx.source((d.citation || '') + (d.fixture ? ' · ' + T('données d’essai, inventées') : ''));
        return true;
    }});
    // 🌍 Les grands mouvements qui passent par ici
    add({id: 'movements', icon: '🌍', label: 'Les grands mouvements qui passent par ici', group: 'Le monde', render: async (place, host, ctx) => {
        let d; try { d = await api('grands_mouvements', {}); } catch (_) { return false; }
        const id = Number(place.id), f = fold(place.name);
        const here = p => (id && (Number(p.from_id) === id || Number(p.to_id) === id)) || fold(p.from) === f || fold(p.to) === f;
        const hits = (d.mouvements || []).map(m => ({m, who: (m.people || []).filter(p => p.verdict !== 'non' && here(p))})).filter(x => x.who.length);
        if (!hits.length) return false;
        host.innerHTML = `<ul class="mp-mv">${hits.map(({m, who}) => `<li><b>${esc(m.title)}</b> <small class="muted">(${esc(m.to > m.from ? `${m.from}–${m.to}` : String(m.from))} · ${esc(m.de_text)} → ${esc(m.vers_text)})</small><br>
            ${who.slice(0, 12).map(p => `<button type="button" class="link-button" data-mp-person="${Number(p.id)}">${esc(p.name || '?')}</button> <small class="muted">(${esc(p.from)} → ${esc(p.to)}${p.y1 ? ', ' + p.y1 : ''})</small>`).join(' · ')}</li>`).join('')}</ul>`;
        ctx.count(hits.length); ctx.source([...new Set(hits.map(x => x.m.src).filter(Boolean))].join(' · ') || MINE);
        return true;
    }});
    // 🔍 Où chercher pour cette commune : registres en ligne, paroisse d'avant la Révolution
    add({id: 'search', icon: '🔍', label: 'Où chercher pour cette commune', group: 'Chercher', render: async (place, host, ctx) => {
        const v = await ctx.village();
        let links = v?.registers || [];
        if (v?.insee) { try { links = (await api('online_registers', {code: v.insee, name: v.name})).links || links; } catch (_) {} }
        const parish = v?.parish || [];
        if (!links.length && !parish.length) return false;
        const safe = u => (A().safeUrl ? A().safeUrl(u) : u) || '#';
        host.innerHTML = `${links.length ? `<p>${esc(T('Les registres de {c} se consultent en ligne ici :', {c: v.name}))}</p><ul>${links.slice(0, 3).map(l => `<li><a href="${esc(safe(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</li>`).join('')}</ul>
            ${links.length > 3 ? `<details class="mp-more"><summary>${esc(T('▸ plus ({n})', {n: links.length - 3}))}</summary><ul>${links.slice(3).map(l => `<li><a href="${esc(safe(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</li>`).join('')}</ul></details>` : ''}` : ''}
            ${parish.length ? `<p>${parish.map(x => `${T('Avant la Révolution, dépendait de la paroisse de {name}', {name: `<b>${esc(x.parish)}</b>`})}${x.until ? ' ' + esc(T('jusqu’en {y}', {y: String(x.until)})) : ''}`).join(' ; ')}.</p>` : ''}
            ${ext.ouChercher?.openPerson ? `<p class="h-links"><button type="button" class="link-button" data-mp-ouc>${esc(T('🌍 Où chercher ? (toutes les pistes)'))}</button></p>` : ''}`;
        ctx.source(T('Archives départementales et sites de registres (liste de l’app) · tes paroisses'));
        return true;
    }});

    ext.monographiePlus = {mount, arrange, renderAll, openPanel: () => openPanel(false), sections: () => defaultList(), layout: () => (cur ? source(cur.place) : null), KEY, KEY_PLACES};
    // fichier chargé après coup (essai) : la monographie déjà à l'écran est montée
    if (ext.lastMonograph && document.querySelector('#workspace .place-monograph-shell')) mount(ext.lastMonograph);
})();
