/* LCNDA — 📑 Un document en plusieurs pages (Atelier de transcription, vague 3, sous-étape 3a ; maquette
 * docs/design/atelier-transcription-idees.html, F2 ; serveur : lib/media_pages.php ; essai : tests/test-atelier-pages.js).
 * Des médias de la base reliés en un ensemble : recto / verso, page 1…N, annexe, ou un nom libre ; autant de pages qu'on veut ;
 * une page n'appartient qu'à un ensemble. Le même bloc « 📑 Pages du document » sur la page du document (onglet Documents) et
 * dans la visionneuse : « ＋ Relier une autre page… » (le menu de choix des médias), le nom de chaque page (menu), l'ordre en
 * glissant ⠿ (ou ⋯ → Monter / Descendre), « Retirer de l'ensemble », et chaque changement se défait (↶ Annuler).
 * Mode consultation 🔒 : les pages se voient, rien ne se change.
 *   ext.mediaPages.get(id)                      → {set_id, pages: [{media_id, label, title, filename, thumbnail, acts, …}]}
 *   ext.mediaPages.mount(élément, id, {onOpen}) → le bloc, redessiné à chaque changement
 *   ext.mediaPages.labelOf(page, i)             → « Recto », « Page 3 », « Annexe », ou le nom libre
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {};
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const toast = (m, k) => A()?.toast?.(m, k);
    /* les noms tout faits d'une page (le serveur garde le mot-clé ; un nom libre est une donnée, jamais traduite) */
    const NAMES = [['recto', 'Recto'], ['verso', 'Verso'], ['page', 'Page {n}'], ['annexe', 'Annexe']];
    const labelOf = (p, i) => { const k = String(p?.label || 'page'); if (k === 'page') return T('Page {n}', {n: i + 1}); const f = NAMES.find(x => x[0] === k); return f ? T(f[1]) : k; };
    const isImage = p => String(p?.media_type || '').toLowerCase() === 'image' || /\.(jpe?g|png|webp|gif|tiff?)$/i.test(p?.filename || '');

    const cache = new Map(); // media_id → {set_id, pages}
    async function get(id, force = false) {
        id = Number(id); if (!id) return {set_id: 0, pages: []};
        if (!force && cache.has(id)) return cache.get(id);
        const r = await A().api('media_pages', {media_id: id});
        const st = {set_id: Number(r.set_id) || 0, pages: Array.isArray(r.pages) ? r.pages : []};
        cache.set(id, st); st.pages.forEach(p => cache.set(Number(p.media_id), st));
        return st;
    }
    const listOf = st => st.pages.map(p => ({media_id: Number(p.media_id), label: p.label || 'page'}));
    /** écrire l'ensemble tel qu'il doit être ; un ↶ Annuler remet la liste d'avant */
    async function save(anchor, pages, {label = '', before = null, quiet = false} = {}) {
        const r = await A().api('media_pages_save', {}, {method: 'POST', body: {media_id: anchor, pages}});
        const res = r.result || r, st = {set_id: Number(res.set_id) || 0, pages: Array.isArray(res.pages) ? res.pages : []};
        [anchor, ...pages.map(p => p.media_id), ...(before || []).map(p => p.media_id)].forEach(id => cache.delete(Number(id)));
        st.pages.forEach(p => cache.set(Number(p.media_id), st)); if (!st.pages.length) cache.set(Number(anchor), st);
        document.dispatchEvent(new CustomEvent('lcnda:media-pages-changed', {detail: {media_id: Number(anchor), state: st}}));
        document.dispatchEvent(new CustomEvent('lcnda:media-changed', {detail: {media_id: Number(anchor), what: 'pages'}}));
        if (label && before && !quiet) {
            const back = () => save(before[0]?.media_id || anchor, before, {quiet: true}).catch(e => toast(e.message, 'error'));
            const again = () => save(anchor, pages, {quiet: true}).catch(e => toast(e.message, 'error'));
            (A().undoToast || toast)(label, {undo: back, redo: again});
        }
        return st;
    }

    /* ─── le bloc « 📑 Pages du document » ─── */
    function html(st, curId, {ro}) {
        const n = st.pages.length;
        const rows = st.pages.map((p, i) => { const id = Number(p.media_id), here = id === Number(curId), name = labelOf(p, i);
            const th = isImage(p) && (p.thumbnail || p.filename) ? `<img src="media/${encodeURIComponent(p.thumbnail || p.filename)}" alt="" loading="lazy" decoding="async">` : '<span aria-hidden="true">📄</span>';
            return `<li class="dpg-row order-row${here ? ' is-current' : ''}" data-mp-id="${id}">
                ${ro ? '' : `<span class="dpg-grip order-grip" draggable="true" title="${esc(T('Glisser pour changer l’ordre'))}" aria-label="${esc(T('Glisser pour changer l’ordre'))}">⠿</span>`}
                <button type="button" class="dpg-thumb" data-mp-open="${id}" title="${esc(T('Voir cette page'))}"${here ? ' aria-current="page"' : ''}>${th}</button>
                <span class="dpg-txt"><b class="dpg-num">${i + 1}</b>${ro ? `<span class="dpg-name">${esc(name)}</span>` : `<button type="button" class="dpg-name link-button" data-mp-label="${id}" aria-haspopup="menu" title="${esc(T('Nom de la page'))}">${esc(name)} ▾</button>`}
                    <small class="dpg-title" title="${esc(p.title || p.filename)}">${esc(p.title || p.filename)}</small></span>
                ${ro ? '' : `<button type="button" class="icon-button small dpg-more" data-mp-more="${id}" title="${esc(T('Actions'))}" aria-label="${esc(T('Actions'))}" aria-haspopup="menu">⋯</button>`}</li>`; }).join('');
        return `<div class="dpg-head"><h3>📑 ${esc(T('Pages du document'))}${n ? ` <span class="dpg-count">· ${n}</span>` : ''}</h3></div>
            ${n ? `<ol class="dpg-list" data-mp-list>${rows}</ol>` : `<p class="muted dpg-empty">${esc(T('Une seule page pour l’instant. Un recto et son verso, un acte sur plusieurs pages : relie les autres images, elles s’ouvriront ensemble.'))}</p>`}
            ${ro ? '' : `<button type="button" class="button small secondary dpg-add" data-mp-add>＋ ${esc(T('Relier une autre page…'))}</button>`}`;
    }
    /** monte le bloc dans `host` pour le média `mediaId` ; o.onOpen(id, st) : montrer une page (sinon rien) */
    function mount(host, mediaId, o = {}) {
        if (!host) return null;
        let st = {set_id: 0, pages: []}, cur = Number(mediaId), seq = 0, dragged = null;
        const ro = () => (o.ro ?? kiosk());
        const draw = () => { host.classList.add('dpg-pages'); host.innerHTML = html(st, cur, {ro: ro()}); host.hidden = ro() && !st.pages.length; };
        const load = async (force = false) => { const n = ++seq; try { const s = await get(cur, force); if (n === seq) { st = s; draw(); } } catch (e) { if (n === seq) { host.hidden = true; } } };
        const anchorList = () => (st.pages.length ? listOf(st) : [{media_id: cur, label: 'page'}]);
        const apply = async (next, label) => { const before = st.pages.length ? listOf(st) : null; try { st = await save(cur, next, {label, before: before || [{media_id: cur, label: 'page'}]}); if (!st.pages.some(p => Number(p.media_id) === cur) && o.onGone) o.onGone(st); draw(); } catch (e) { toast(e.message, 'error'); draw(); } };
        async function addPages() {
            const P = window.LCNDA_MEDIA_PICKER; if (!P?.openMediaPicker) return toast(T('La fenêtre des images n’est pas chargée.'), 'error');
            const have = new Set(anchorList().map(p => p.media_id));
            const picked = await P.openMediaPicker({types: ['image', 'document'], multiple: true, title: `📑 ${T('Relier une autre page…')}`, eyebrow: T('PAGES DU DOCUMENT'), okLabel: T('Relier ces pages')});
            const add = (picked || []).map(m => Number(m.id)).filter(id => id > 0 && !have.has(id));
            if (!add.length) return;
            await apply([...anchorList(), ...add.map(id => ({media_id: id, label: 'page'}))], add.length > 1 ? T('Pages reliées : {n}', {n: add.length}) : T('Page reliée'));
        }
        function nameMenu(id, at) {
            const i = st.pages.findIndex(p => Number(p.media_id) === id); if (i < 0) return;
            const curLabel = st.pages[i].label || 'page';
            const set = lab => { if (lab === curLabel) return; const next = listOf(st); next[i].label = lab; apply(next, T('Page renommée : « {x} »', {x: labelOf({label: lab}, i)})); };
            const items = NAMES.map(([k, l]) => ({icon: k === curLabel ? '✓' : '', label: k === 'page' ? T('Page {n}', {n: i + 1}) : T(l), run: () => set(k)}));
            const free = !NAMES.some(x => x[0] === curLabel);
            items.push('-', {icon: free ? '✓' : '✎', label: T('Autre nom…'), run: async () => {
                const v = await A().askText?.({title: T('Nom de la page'), value: free ? curLabel : '', placeholder: T('Par exemple : Plan, Feuillet 2, Suite'), okLabel: T('Renommer')});
                if (v != null && String(v).trim()) set(String(v).trim().slice(0, 60)); }});
            UI().menuAt?.(at, items, {title: T('Nom de la page')});
        }
        function moreMenu(id, at) {
            const i = st.pages.findIndex(p => Number(p.media_id) === id); if (i < 0) return;
            const move = d => { const next = listOf(st), [x] = next.splice(i, 1); next.splice(i + d, 0, x); apply(next, T('Ordre des pages changé')); };
            UI().menuAt?.(at, [
                {icon: '↗', label: T('Voir cette page'), run: () => open(id)},
                {icon: '✎', label: T('Nom de la page'), run: () => nameMenu(id, at)},
                '-',
                {icon: '↑', label: T('Monter'), disabled: i === 0, run: () => move(-1)},
                {icon: '↓', label: T('Descendre'), disabled: i === st.pages.length - 1, run: () => move(1)},
                '-',
                {icon: '✂', label: T('Retirer de l’ensemble'), help: T('La page reste dans les médias, seule (rien n’est supprimé)'), run: () => {
                    const next = listOf(st).filter(p => p.media_id !== id);
                    apply(next.length >= 2 ? next : [], T('Page retirée de l’ensemble'));
                }},
            ], {title: labelOf(st.pages[i], i)});
        }
        const open = id => { if (o.onOpen) o.onOpen(Number(id), st); };
        host.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
            if (b.matches('[data-mp-open]')) return open(b.dataset.mpOpen);
            if (ro()) return;
            if (b.matches('[data-mp-add]')) return addPages();
            if (b.matches('[data-mp-label]')) return nameMenu(Number(b.dataset.mpLabel), b);
            if (b.matches('[data-mp-more]')) return moreMenu(Number(b.dataset.mpMore), b);
        });
        host.addEventListener('contextmenu', e => { // K14 : clic droit = le menu ⋯ de la ligne
            const li = e.target.closest('[data-mp-id]'); if (!li || ro()) return; e.preventDefault();
            moreMenu(Number(li.dataset.mpId), {x: e.clientX, y: e.clientY});
        });
        /* ⠿ glisser pour ranger (et Alt + ↑ / ↓ au clavier sur une ligne) */
        const orderNow = () => [...host.querySelectorAll('[data-mp-id]')].map(li => Number(li.dataset.mpId));
        const commitOrder = () => { const ids = orderNow(), was = st.pages.map(p => Number(p.media_id)); if (ids.join() === was.join()) return;
            const by = new Map(listOf(st).map(p => [p.media_id, p])); apply(ids.map(id => by.get(id)).filter(Boolean), T('Ordre des pages changé')); };
        host.addEventListener('dragstart', e => { const g = e.target.closest?.('.dpg-grip'); if (!g) return; dragged = g.closest('[data-mp-id]'); dragged.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragged.dataset.mpId); } catch (_) {} });
        host.addEventListener('dragover', e => { if (!dragged) return; e.preventDefault(); const list = host.querySelector('[data-mp-list]'); if (!list) return;
            const after = [...list.querySelectorAll('[data-mp-id]:not(.is-dragging)')].find(li => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
            if (after) list.insertBefore(dragged, after); else list.append(dragged); });
        host.addEventListener('drop', e => { if (dragged) e.preventDefault(); });
        host.addEventListener('dragend', () => { if (!dragged) return; dragged.classList.remove('is-dragging'); dragged = null; commitOrder(); });
        host.addEventListener('keydown', e => { const li = e.target.closest?.('[data-mp-id]'); if (!li || ro() || !e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault(); const id = Number(li.dataset.mpId), i = st.pages.findIndex(p => Number(p.media_id) === id), j = i + (e.key === 'ArrowUp' ? -1 : 1); if (i < 0 || j < 0 || j >= st.pages.length) return;
            const next = listOf(st), [x] = next.splice(i, 1); next.splice(j, 0, x); apply(next, T('Ordre des pages changé')); });
        const onChanged = ev => { const ids = new Set([cur, ...st.pages.map(p => Number(p.media_id)), ...(ev.detail?.state?.pages || []).map(p => Number(p.media_id)), Number(ev.detail?.media_id)]); if (!host.isConnected) { document.removeEventListener('lcnda:media-pages-changed', onChanged); return; } if (ids.has(cur)) load(true); };
        document.addEventListener('lcnda:media-pages-changed', onChanged);
        draw(); load(!!o.force);
        return {reload: () => load(true), setMedia: id => { if (Number(id) === cur) return; cur = Number(id); if (!st.pages.some(p => Number(p.media_id) === cur)) { st = {set_id: 0, pages: []}; draw(); } load(); }, state: () => st};
    }

    /* ─── la visionneuse : le bloc sous « RATTACHÉ À », et passer d'une page à l'autre (même absente de la liste ouverte) ─── */
    let lbCtl = null;
    const lbItem = () => { const S = A()?.state; return S?.lightboxMedia?.[S.lightboxIndex] || null; };
    function lbGo(id, st) {
        const S = A()?.state; if (!S?.lightboxMedia) return;
        let i = S.lightboxMedia.findIndex(m => Number(m.id) === Number(id));
        if (i < 0) { // une page qui n'était pas dans la liste ouverte : les pages manquantes viennent juste après celle qu'on regarde
            const have = new Set(S.lightboxMedia.map(m => Number(m.id)));
            const add = st.pages.filter(p => !have.has(Number(p.media_id))).map(p => ({id: Number(p.media_id), title: p.title, filename: p.filename, thumbnail: p.thumbnail, media_type: p.media_type, date_text: p.date_text, document_reference: p.document_reference, document_title: p.document_title, transcription: p.transcription, description: p.description}));
            S.lightboxMedia.splice(S.lightboxIndex + 1, 0, ...add);
            i = S.lightboxMedia.findIndex(m => Number(m.id) === Number(id)); if (i < 0) return;
        }
        if (i === S.lightboxIndex) return;
        if (A().lightboxGoTo) A().lightboxGoTo(i); else { S.lightboxIndex = i; A().renderLightboxItem?.(); }
    }
    function lbRefresh() {
        const lb = document.getElementById('lightbox'), it = lbItem(); if (!lb?.open || !it) return;
        let box = document.getElementById('lightbox-pages');
        if (!box) { box = document.createElement('section'); box.id = 'lightbox-pages'; box.className = 'lb-pages'; const after = lb.querySelector('.lightbox-attachment-block'); if (after) after.after(box); else lb.querySelector('.lightbox-details')?.prepend(box); lbCtl = null; }
        const ro = !!A()?.state?.lightboxReadOnly || kiosk();
        if (!lbCtl || lbCtl.ro !== ro) { lbCtl = mount(box, it.id, {ro, onOpen: (id, st) => lbGo(id, st)}); if (lbCtl) lbCtl.ro = ro; }
        else lbCtl.setMedia(it.id);
    }
    const lbWatch = () => { const lb = document.getElementById('lightbox'), im = document.getElementById('lightbox-image'); if (!lb || !im) return setTimeout(lbWatch, 500);
        const go = () => setTimeout(lbRefresh, 0);
        ['lightbox-image', 'lightbox-pdf', 'lightbox-video', 'lightbox-audio'].forEach(k => { const el = document.getElementById(k); if (el) new MutationObserver(go).observe(el, {attributes: true, attributeFilter: ['src', 'hidden']}); });
        new MutationObserver(() => { if (lb.open) go(); }).observe(lb, {attributes: true, attributeFilter: ['open']});
        document.getElementById('lightbox-counter') && new MutationObserver(go).observe(document.getElementById('lightbox-counter'), {childList: true, characterData: true, subtree: true}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lbWatch); else lbWatch();
    document.addEventListener('lcnda:media-changed', e => { if (e.detail?.what === 'pages' || e.detail?.action === 'media_pages_save') return; cache.clear(); }); // nos propres enregistrements (déjà à jour) ne vident pas le cache

    ext.mediaPages = {get, save, mount, labelOf, NAMES, clear: () => cache.clear()};
})();
