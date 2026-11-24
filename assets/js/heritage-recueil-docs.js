/* LCNDA — 📚 Recueils depuis Documents (maquette docs/design/documents-lies-recueils.html, partie 3 ; serveur : lib/recueils.php).
 * Les documents restent à leur place dans Documents : le recueil les regroupe, il ne les déplace pas. Une page de recueil = une image ;
 * un document en plusieurs pages (📑) y entre avec toutes ses pages, dans l'ordre.
 *   ext.recueilDocs.create(docs, {onDone})   → « 📚 Faire un recueil avec ces documents » (nom, cote, lieu, années ; l'ordre se range ⠿ ↑ ↓)
 *   ext.recueilDocs.addTo(docs, {onDone})    → « 📚 Ajouter à un recueil… » (un recueil au choix, ou un nouveau)
 *   ext.recueilDocs.mountPlace(el, mediaId, {ro, onOpen}) → « 📚 Dans le recueil … · page 12 sur 40 · ‹ page 11 · page 13 › · Ouvrir le recueil »
 * Chaque ajout se défait (↶ Annuler). Essai : tests/test-recueils-documents.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A()?.toast?.(m, k);
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r.result || r; };
    const changed = () => document.dispatchEvent(new CustomEvent('lcnda:recueils-changed'));
    const thumb = d => (d.thumbnail || d.filename) && String(d.media_type || 'image') === 'image' ? `<img src="media/${encodeURIComponent(d.thumbnail || d.filename)}" alt="" loading="lazy">` : '<span aria-hidden="true">📄</span>';

    /** ce que dit le serveur après un ajout : « 3 pages ajoutées », « 1 déjà dans ce recueil », « 1 n'est pas une image » */
    function doneText(r) {
        const bits = [A().plural ? A().plural(r.added, 'page ajoutée', 'pages ajoutées') : `${r.added}`];
        if (r.skipped) bits.push(T('{n} déjà dans ce recueil', {n: String(r.skipped)}));
        if (r.not_images) bits.push(T('pas des images, laissés de côté : {n}', {n: String(r.not_images)}));
        return bits.join(' · ');
    }

    /* ─── « 📚 Faire un recueil avec ces documents » ─── */
    function create(docs, {onDone} = {}) {
        if (!docs.length) return toast(T('Choisis au moins un document.'), 'error');
        let order = docs.map(d => d);
        const same = k => { const v = order[0]?.[k]; return v && order.every(d => d[k] === v) ? v : ''; };
        const years = order.map(d => Number(d.year) || 0).filter(Boolean), span = years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}-${Math.max(...years)}`) : '';
        const row = (d, i) => `<li class="rd-item" data-rd-i="${i}"><span class="rd-n">${i + 1}</span><span class="rd-th">${thumb(d)}</span><span class="rd-t">${esc(d.title || T('Document'))}</span>
            <button type="button" class="icon-button small" data-rd-up="${i}" ${i ? '' : 'disabled'} aria-label="${esc(T('Monter'))}">↑</button><button type="button" class="icon-button small" data-rd-down="${i}" ${i < order.length - 1 ? '' : 'disabled'} aria-label="${esc(T('Descendre'))}">↓</button></li>`;
        const dlg = ext.openDialog({eyebrow: T('📚 RECUEIL'), title: T('Nouveau recueil'), wide: true, submitLabel: T('📚 Faire le recueil'),
            body: `<p class="muted">${esc(T('Les documents restent à leur place dans Documents : le recueil les regroupe, il ne les déplace pas. Un document en plusieurs pages y entre avec toutes ses pages.'))}</p>
                <div class="form-grid rd-grid">
                    <label class="full">${esc(T('Nom du recueil'))}<input name="title" required maxlength="200" value="${esc(same('series'))}" placeholder="${esc(T('ex. Registre de Sancoins, 1870-1872'))}"></label>
                    <label>${esc(T('Cote', {ctx: 'archives'}))}<input name="reference" maxlength="300" value="${esc(same('cote'))}" placeholder="${esc(T('ex. 3 E 1234'))}"></label>
                    <label>${esc(T('Lieu'))}<input name="place_text" maxlength="300" value="${esc(same('place'))}" placeholder="${esc(T('ex. Sancoins'))}"></label>
                    <label>${esc(T('Années'))}<input name="date_text" maxlength="100" value="${esc(span)}" placeholder="${esc(T('ex. 1870-1872'))}"></label>
                </div>
                <h3 class="rd-h">${esc(T('L’ordre des pages'))} <small class="muted">${esc(T('glisse ⠿ ou utilise ↑ ↓'))}</small></h3>
                <ol class="rd-list" data-rd-list></ol>`,
            onOpen: d => {
                const list = d.querySelector('[data-rd-list]'), paint = () => { list.innerHTML = order.map(row).join(''); };
                const move = (i, j) => { if (j < 0 || j >= order.length || i === j) return; const [x] = order.splice(i, 1); order.splice(j, 0, x); paint(); list.querySelector(`[data-rd-i="${j}"] .icon-button:not([disabled])`)?.focus(); };
                list.addEventListener('click', e => { const u = e.target.closest('[data-rd-up]'), w = e.target.closest('[data-rd-down]'); if (u) move(Number(u.dataset.rdUp), Number(u.dataset.rdUp) - 1); if (w) move(Number(w.dataset.rdDown), Number(w.dataset.rdDown) + 1); });
                // ⠿ glisser : la poignée commune de l'app (heritage-dnd.js) presse ces mêmes ↑ ↓
                paint();
            },
            onSubmit: async form => {
                const fd = new FormData(form), title = String(fd.get('title') || '').trim();
                if (!title) { const i = form.querySelector('[name=title]'); window.LCNDA_UI?.fieldError ? window.LCNDA_UI.fieldError(i, T('Donne un nom au recueil.')) : toast(T('Donne un nom au recueil.'), 'error'); i?.focus(); return false; }
                const r = await post('recueil_from_documents', {recueil_id: 0, title, reference: fd.get('reference'), place_text: fd.get('place_text'), date_text: fd.get('date_text'), media_ids: order.map(d => Number(d.id))});
                A().undoToast?.(T('Recueil « {t} » fait : {x}', {t: r.title, x: doneText(r)}), {icon: '📚', undoneText: T('Recueil « {t} »', {t: r.title}), undo: async () => { await post('delete_recueil', {id: r.id}); changed(); await onDone?.(r); }});
                changed(); await onDone?.(r);
                return true;
            }});
        return dlg;
    }

    /* ─── « 📚 Ajouter à un recueil… » : un recueil au choix (boutons radio), ou un nouveau ─── */
    async function addTo(docs, {onDone} = {}) {
        if (!docs.length) return toast(T('Choisis au moins un document.'), 'error');
        let list = []; try { list = (await A().api('recueils')).recueils || []; } catch (e) { return toast(e.message, 'error'); }
        if (!list.length) return create(docs, {onDone});
        const one = r => `<label class="checkbox-line rd-pick" data-rd-row="${esc((r.title + ' ' + (r.reference || '') + ' ' + (r.place_text || '')).toLowerCase())}"><input type="radio" name="rid" value="${r.id}"> <span>${esc(r.icon || '📚')} <b>${esc(r.title)}</b>${r.reference || r.date_text ? ` <small class="muted">${esc([r.reference, r.date_text].filter(Boolean).join(' · '))}</small>` : ''} <small class="muted">· ${esc(A().plural ? A().plural(r.pages, 'page', 'pages') : String(r.pages))}</small></span></label>`;
        ext.openDialog({eyebrow: T('📚 RECUEIL'), title: docs.length > 1 ? T('Ajouter {x} à un recueil', {x: A().plural ? A().plural(docs.length, 'document', 'documents') : String(docs.length)}) : T('Ajouter « {t} » à un recueil', {t: String(docs[0].title || '').slice(0, 60)}), submitLabel: T('Ajouter'),
            body: `<p class="muted">${esc(T('Les pages vont à la fin du recueil, dans l’ordre ; un document déjà dans ce recueil n’est pas remis.'))}</p>
                ${list.length > 6 ? `<input type="search" class="rd-q" data-rd-q placeholder="${esc(T('Chercher un recueil…'))}" aria-label="${esc(T('Chercher un recueil…'))}">` : ''}
                <div class="rd-picks" role="radiogroup" aria-label="${esc(T('Recueil'))}">${list.map(one).join('')}</div>
                <p><button type="button" class="button small secondary" data-rd-new>＋ ${esc(T('Nouveau recueil avec ces documents…'))}</button></p>`,
            onOpen: d => {
                d.querySelector('[data-rd-q]')?.addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); d.querySelectorAll('[data-rd-row]').forEach(x => { x.hidden = !!q && !x.dataset.rdRow.includes(q); }); });
                d.querySelector('[data-rd-new]').addEventListener('click', () => { d.close(); create(docs, {onDone}); });
            },
            onSubmit: async form => {
                const rid = Number(new FormData(form).get('rid') || 0); if (!rid) { toast(T('Choisis un recueil.'), 'error'); return false; }
                const r = await post('recueil_from_documents', {recueil_id: rid, media_ids: docs.map(d => Number(d.id))});
                if (!r.added) toast(T('Rien à ajouter : {x}', {x: doneText(r)}));
                else A().undoToast?.(T('Ajouté à « {t} » : {x}', {t: r.title, x: doneText(r)}), {icon: '📚', undo: async () => { await post('recueil_undo_documents', {recueil_id: r.id, page_ids: r.page_ids, image_ids: r.image_ids}); changed(); await onDone?.(r); }});
                changed(); await onDone?.(r);
                return true;
            }});
    }

    /* ─── « 📚 Dans le recueil » sur la page d'un document ─── */
    async function mountPlace(el, mediaId, {ro = false, onOpen = null} = {}) {
        if (!el) return;
        let places = [];
        try { places = (await A().api('recueil_places', {media_id: mediaId})).places || []; } catch (_) { places = []; }
        if (!el.isConnected) return;
        if (!places.length) { el.hidden = true; el.innerHTML = ''; return; }
        const nav = (p, n, dir) => (n ? `<button type="button" class="button small secondary" data-rd-go="${n.media_id || 0}" data-rd-rec="${p.recueil_id}" data-rd-page="${n.page_id}">${dir < 0 ? '‹ ' : ''}${esc(T('page {n}', {n: String(n.num)}))}${dir > 0 ? ' ›' : ''}</button>` : '');
        el.hidden = false;
        el.innerHTML = `<h3>📚 ${esc(places.length > 1 ? T('Dans les recueils') : T('Dans le recueil'))}</h3>` + places.map(p => `<div class="rd-place">
            <p><b>${esc(p.icon)} ${esc(p.title)}</b>${p.reference ? ` <small class="muted">${esc(p.reference)}</small>` : ''} · ${esc(T('page {n} sur {t}', {n: String(p.num), t: String(p.total)}))}${p.other_page ? ` <small class="muted">${esc(T('(une autre page de ce document)'))}</small>` : ''}</p>
            ${(p.chapters || []).length ? `<p class="rd-chap">📑 ${esc(p.chapters.join(' › '))}</p>` : ''}
            <div class="rd-nav">${nav(p, p.prev, -1)}${nav(p, p.next, 1)}<button type="button" class="button small" data-rd-open="${p.recueil_id}" data-rd-page="${p.page_id}">${esc(T('📚 Ouvrir le recueil'))}</button></div></div>`).join('');
        el.onclick = e => {
            const o = e.target.closest('[data-rd-open]'); if (o) { ext.openRecueil?.(Number(o.dataset.rdOpen), Number(o.dataset.rdPage)); return; }
            const g = e.target.closest('[data-rd-go]'); if (!g) return;
            const mid = Number(g.dataset.rdGo);
            if (mid && onOpen) onOpen(mid); else ext.openRecueil?.(Number(g.dataset.rdRec), Number(g.dataset.rdPage)); // une page sans image : le recueil, sur cette page
        };
    }
    ext.recueilDocs = {create, addTo, mountPlace};
})();
