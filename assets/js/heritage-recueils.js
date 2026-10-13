/**
 * 📚 Recueils (Listes › Recueils ; serveur : lib/recueils.php, structure n°26).
 * Un recueil = des pages photographiées dans l'ordre (registre, liste de prisonniers, cahier…) :
 *  - Pages : mosaïque ou tableau, glisser pour réordonner, photos « à ranger » ;
 *  - une page : grande image, toutes ses photos (versions, détails), « garder celle-ci », retouche / rotation (visionneuse),
 *    comparaison côte à côte, transcription enregistrée au fil de la frappe ;
 *  - Versions : chaque campagne de photos coexiste ; « comparer deux versions » pour choisir page par page la meilleure ;
 *  - Rattachements : tout ou partie du recueil à une fiche, un village, une enquête, un projet de l'Atelier, une battue ;
 *  - Résumé : des blocs à choisir et ranger (comme des widgets).
 * Chargé après app.js et les autres heritage-*.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'lists']) ext[key] = ext[key] || {};
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const S = () => A().state;
    const toast = (...a) => A().toast(...a);
    const get = (action, params = {}) => A().api(action, params);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const dialog = opts => ext.openDialog(opts);
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'recueils';
    const plural = (n, one, many) => `${Number(n || 0).toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
    const st = () => (S().hRecueil ||= {id: 0, tab: 'summary', page: 0, view: 'grid', q: '', image: 0, compare: 0, cmpA: 0, cmpB: 0});
    let bust = Date.now();
    const thumbUrl = i => i ? `media/${encodeURIComponent(i.thumbnail || i.filename)}?v=${bust}` : '';
    const fullUrl = i => i ? `media/${encodeURIComponent(i.filename)}?v=${bust}` : '';
    const LINK_TYPES = {person: ['👤', 'Fiche'], village: ['🏘️', 'Village'], investigation: ['🔍', 'Enquête'], atelier_project: ['📚', 'Projet de l’Atelier'], battue: ['🐾', 'Battue']};
    const pageName = p => p ? (p.label ? `p. ${p.num} — ${p.label}` : `Page ${p.num}`) : '';
    const excerpt = (t, n = 140) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

    /* ─────────── Ouvrir un recueil depuis n'importe où ─────────── */
    ext.openRecueil = (id, pageId = 0) => {
        const s = S(); s.listType = 'recueils';
        Object.assign(st(), {id: Number(id), page: Number(pageId) || 0, tab: pageId ? 'pages' : 'summary', image: 0, compare: 0});
        A().setModule('listes');
    };
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-open-recueil]');
        if (!b) return;
        e.preventDefault();
        ext.openRecueil(b.dataset.openRecueil, b.dataset.recueilPage || 0);
    });

    /* ─────────── Envoi des photos (on récupère les numéros des médias créés) ─────────── */
    async function uploadPhotos(rid, files, onStep) {
        const ids = [], list = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
        if (!list.length) throw new Error('Choisis des photos (JPEG, PNG, WEBP).');
        for (let i = 0; i < list.length; i += 8) {
            const fd = new FormData();
            fd.append('collection_type', 'recueil'); fd.append('collection_id', rid); fd.append('csrf', S().csrf);
            list.slice(i, i + 8).forEach(f => fd.append('files[]', f));
            const res = await fetch('upload.php', {method: 'POST', body: fd});
            const out = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!res.ok || out.error) throw new Error(out.error || 'Envoi impossible');
            ids.push(...(out.media || []));
            onStep?.(Math.min(list.length, i + 8), list.length);
        }
        return ids;
    }

    /* ─────────── Liste des recueils ─────────── */
    ext.lists.recueils = async token => {
        const s = st();
        if (s.id) return renderRecueil(token);
        const data = await get('recueils', {q: s.q || ''});
        if (!isCurrent(token)) return;
        const rows = data.recueils || [];
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page collection-page h-rc">
            <header class="page-header"><div><span class="eyebrow">LISTES · MÉDIAS</span><h2>📚 Recueils</h2>
                <p>Un recueil rassemble des pages photographiées dans l’ordre : un registre, une liste de prisonniers, un cahier, un album. Tu peux y transcrire chaque page, garder plusieurs campagnes de photos (celles d’il y a dix ans et les nouvelles) et choisir, page par page, la meilleure image.</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-h-open-list="media">🖼️ Tous les médias</button><button type="button" class="button" data-rc-new>+ Nouveau recueil</button></div></header>
            ${rows.length || s.q ? `<div class="collection-toolbar"><input type="search" data-rc-q value="${esc(s.q || '')}" placeholder="Chercher un recueil (titre, cote, lieu)…"></div>` : ''}
            ${rows.length ? `<div class="h-rc-grid">${rows.map(r => {
                const pct = r.pages ? Math.round(r.transcribed / r.pages * 100) : 0;
                return `<button type="button" class="h-rc-card" data-open-recueil="${r.id}">
                    <span class="h-rc-cover">${r.cover ? `<img src="${esc(thumbUrl(r.cover))}" alt="" loading="lazy">` : `<span class="h-rc-cover-empty">${esc(r.icon || '📚')}</span>`}${r.pages ? `<span class="h-rc-badge">${plural(r.pages, 'page', 'pages')}</span>` : ''}</span>
                    <span class="h-rc-card-body"><strong>${esc(r.icon || '📚')} ${esc(r.title)}</strong>
                        ${r.reference || r.place_text || r.date_text ? `<small class="muted">${esc([r.reference, r.place_text, r.date_text].filter(Boolean).join(' · '))}</small>` : ''}
                        <span class="h-rc-meter" title="${pct} % des pages transcrites"><i style="width:${pct}%"></i></span>
                        <small>${plural(r.versions, 'version', 'versions')} · ${pct} % transcrit${r.links ? ` · 🔗 ${r.links}` : ''}${r.loose ? ` · <b class="h-rc-warn">${plural(r.loose, 'photo à ranger', 'photos à ranger')}</b>` : ''}</small></span>
                </button>`; }).join('')}</div>`
            : A().empty(s.q ? 'Aucun recueil ne correspond.' : 'Aucun recueil pour l’instant : clique sur « + Nouveau recueil », puis ajoute tes photos.')}
        </section>`;
        const sec = ws.querySelector('.h-rc');
        sec.querySelector('[data-rc-new]').addEventListener('click', () => recueilDialog(null));
        let timer = 0;
        sec.querySelector('[data-rc-q]')?.addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { s.q = e.target.value.trim(); ext.lists.recueils(++S().workspaceToken).then(() => { const i = A().$('[data-rc-q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 250); });
    };

    function recueilDialog(r) {
        dialog({eyebrow: 'RECUEIL', title: r ? 'Modifier le recueil' : 'Nouveau recueil', wide: true, submitLabel: r ? 'Enregistrer' : 'Créer',
            body: `<div class="form-grid"><label class="span-2">Nom<input name="title" required value="${esc(r?.title || '')}" placeholder="Liste des prisonniers d’Ulm"></label>
                <label>Émoji<span class="h-at-iconfield"><input name="icon" value="${esc(r?.icon || '📚')}" maxlength="16" class="h-be-icon"><button type="button" class="icon-button" data-rc-emoji title="Choisir un émoji">😀</button></span></label>
                <label>Cote, référence<input name="reference" value="${esc(r?.reference || '')}" placeholder="SHD, 2 Yc 123"></label>
                <label>Lieu de conservation<input name="place_text" value="${esc(r?.place_text || '')}" placeholder="Vincennes, Service historique de la Défense"></label>
                <label>Date du document<input name="date_text" value="${esc(r?.date_text || '')}" placeholder="1805"></label>
                ${r ? '' : `<label>Nom de la première série de photos<input name="first_version" value="Photos ${new Date().getFullYear()}" placeholder="Photos 2015"></label>`}
                <label class="span-2">Description<textarea name="description" rows="4" placeholder="Ce que contient le recueil, ce qui manque, où le consulter…">${esc(r?.description || '')}</textarea></label></div>`,
            onOpen: dl => dl.querySelector('[data-rc-emoji]').addEventListener('click', () => ext.pickEmoji?.(dl.querySelector('[name=icon]'))),
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                const res = await post('save_recueil', {...f, id: r?.id || 0});
                if (!r) Object.assign(st(), {id: res.result?.id || res.id, tab: 'pages', page: 0});
                toast(r ? 'Recueil enregistré.' : 'Recueil créé : ajoute maintenant tes photos.');
                ext.lists.recueils(++S().workspaceToken).then(() => { if (!r) addPhotosDialog(); });
            },
            onDelete: r ? async () => {
                const keep = confirm(`Supprimer le recueil « ${r.title} » ?\n\nOK : supprimer le recueil (ses pages, transcriptions, versions).\nLes photos restent dans Médias.`);
                if (!keep) return false;
                const also = confirm('Supprimer aussi les photos qui ne servent nulle part ailleurs ?\n\nOK : oui, les supprimer · Annuler : les garder dans Médias');
                const res = await post('delete_recueil', {id: r.id, delete_media: also});
                const out = res.result || res;
                toast(also ? `Recueil supprimé (${out.media_deleted} photo(s) supprimée(s), ${out.media_kept} gardée(s) car utilisées ailleurs).` : 'Recueil supprimé : les photos sont toujours dans Médias.');
                Object.assign(st(), {id: 0, page: 0});
                ext.lists.recueils(++S().workspaceToken);
            } : null,
        });
    }

    /* ─────────── Un recueil ─────────── */
    let D = null; // recueil chargé
    const imgById = id => D.images.find(i => i.id === Number(id));
    const pageById = id => D.pages.find(p => p.id === Number(id));
    const versionById = id => D.versions.find(v => v.id === Number(id));
    const pageImages = pid => D.images.filter(i => i.page_id === pid).sort((a, b) => (D.versions.findIndex(v => v.id === a.version_id) - D.versions.findIndex(v => v.id === b.version_id)) || (a.role === b.role ? a.position - b.position : a.role === 'page' ? -1 : 1));
    const loose = () => D.images.filter(i => !i.page_id);

    async function load(id) { const d = await get('recueil', {id}); D = d; return d; }
    const reload = async () => { await load(st().id); paint(); };
    const run = async (action, body, msg) => { try { const r = await post(action, body); if (msg) toast(msg); await reload(); return r.result || r; } catch (e) { toast(e.message, 'error'); return null; } };

    async function renderRecueil(token) {
        const s = st();
        try { await load(s.id); } catch (e) { toast(e.message, 'error'); s.id = 0; return ext.lists.recueils(++S().workspaceToken); }
        if (!isCurrent(token)) return;
        if (s.page && !pageById(s.page)) s.page = 0;
        paint();
    }

    function paint() {
        const s = st(), r = D.recueil, ws = A().$('#workspace');
        const pct = D.pages.length ? Math.round(D.pages.filter(p => p.transcription.trim()).length / D.pages.length * 100) : 0;
        const tabs = [['summary', '📋', 'Résumé', ''], ['pages', '📄', 'Pages', D.pages.length], ['versions', '🗂️', 'Versions', D.versions.length], ['links', '🔗', 'Rattachements', D.links.length]];
        ws.innerHTML = `<section class="page collection-page h-rc h-rc-one">
            <header class="page-header"><div><button type="button" class="back-link" data-rc-back>← Tous les recueils</button><span class="eyebrow">RECUEIL</span><h2>${esc(r.icon || '📚')} ${esc(r.title)}</h2>
                <p class="muted">${esc([r.reference, r.place_text, r.date_text].filter(Boolean).join(' · ')) || '&nbsp;'}</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-rc-edit>Modifier</button><button type="button" class="button" data-rc-add>+ Ajouter des photos</button></div></header>
            <div class="h-rc-tabs segmented">${tabs.map(([k, icon, label, n]) => `<button type="button" class="${s.tab === k ? 'is-active' : ''}" data-rc-tab="${k}">${icon} ${label}${n !== '' ? ` <small>${n}</small>` : ''}</button>`).join('')}
                <span class="h-rc-tabs-info muted">${plural(D.pages.length, 'page', 'pages')} · ${pct} % transcrit${loose().length ? ` · <button type="button" class="link-button h-rc-warn" data-rc-goloose>${plural(loose().length, 'photo à ranger', 'photos à ranger')}</button>` : ''}</span></div>
            <div class="h-rc-body"></div></section>`;
        const sec = ws.querySelector('.h-rc-one');
        sec.querySelector('[data-rc-back]').addEventListener('click', () => { Object.assign(s, {id: 0, page: 0}); ext.lists.recueils(++S().workspaceToken); });
        sec.querySelector('[data-rc-edit]').addEventListener('click', () => recueilDialog(D.recueil));
        sec.querySelector('[data-rc-add]').addEventListener('click', () => addPhotosDialog());
        sec.querySelectorAll('[data-rc-tab]').forEach(b => b.addEventListener('click', () => { s.tab = b.dataset.rcTab; s.page = 0; s.compare = 0; paint(); }));
        sec.querySelector('[data-rc-goloose]')?.addEventListener('click', () => { s.tab = 'pages'; s.page = 0; paint(); sec.querySelector('.h-rc-loose')?.scrollIntoView({block: 'center'}); });
        const body = sec.querySelector('.h-rc-body');
        if (s.tab === 'pages' && s.page) return paintPage(body);
        ({summary: paintSummary, pages: paintPages, versions: paintVersions, links: paintLinks}[s.tab] || paintSummary)(body);
    }

    /* ─── Pages ─── */
    function pageCard(p) {
        const shown = imgById(p.shown_image_id), imgs = pageImages(p.id), details = imgs.filter(i => i.role === 'detail').length;
        const dots = D.versions.length > 1 ? `<span class="h-rc-dots">${D.versions.map(v => `<i class="${imgs.some(i => i.version_id === v.id && i.role === 'page') ? 'on' : ''}" title="${esc(v.name)} : ${imgs.some(i => i.version_id === v.id && i.role === 'page') ? 'photographiée' : 'pas de photo'}"></i>`).join('')}</span>` : '';
        return `<button type="button" class="h-rc-page" draggable="true" data-rc-page="${p.id}" data-rc-num="${p.num}">
            <span class="h-rc-thumb">${shown ? `<img src="${esc(thumbUrl(shown))}" alt="" loading="lazy">` : '<span class="h-rc-nophoto">pas de photo</span>'}<span class="h-rc-num">${p.num}</span>${p.transcription.trim() ? '<span class="h-rc-done" title="Transcrite">✍️</span>' : ''}</span>
            <span class="h-rc-page-name">${esc(p.label || 'Page ' + p.num)}</span>
            <span class="h-rc-page-meta">${dots}${details ? `<small title="Détails (zooms)">🔍 ${details}</small>` : ''}</span></button>`;
    }
    function paintPages(body) {
        const s = st(), q = (s.q || '').toLowerCase();
        const pages = q ? D.pages.filter(p => (p.label + ' ' + p.transcription + ' ' + p.notes).toLowerCase().includes(q)) : D.pages;
        const ls = loose();
        body.innerHTML = `<div class="collection-toolbar h-rc-toolbar"><input type="search" data-rc-q2 value="${esc(s.q || '')}" placeholder="Chercher dans les transcriptions, les noms de page…">
                <span class="segmented"><button type="button" class="${s.view !== 'table' ? 'is-active' : ''}" data-rc-view="grid">▦ Mosaïque</button><button type="button" class="${s.view === 'table' ? 'is-active' : ''}" data-rc-view="table">☰ Tableau</button></span>
                <button type="button" class="button small secondary" data-rc-newpage>+ Page sans photo</button></div>
            ${ls.length ? `<div class="h-rc-loose maintenance-panel"><h3>🧺 À ranger <small class="muted">${plural(ls.length, 'photo', 'photos')} sans page : choisis sa page</small></h3><div class="h-rc-loose-list">${ls.map(i => `<div class="h-rc-loose-item" data-rc-img="${i.id}"><button type="button" class="h-rc-thumb small" data-rc-zoom="${i.id}" title="Voir en grand"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy"></button>
                <small>${esc(versionById(i.version_id)?.name || '')}</small>${pageSelect('data-rc-assign', 0, true)}</div>`).join('')}</div></div>` : ''}
            ${!D.pages.length ? A().empty('Pas encore de page : clique sur « + Ajouter des photos ». Chaque photo devient une page, dans l’ordre.') :
            s.view === 'table' ? `<div class="data-table-wrap"><table class="data-table h-rc-table"><thead><tr><th>N°</th><th>Page</th>${D.versions.map(v => `<th>${esc(v.name)}</th>`).join('')}<th>Transcription</th></tr></thead><tbody>${pages.map(p => {
                const imgs = pageImages(p.id);
                return `<tr data-rc-row="${p.id}"><td>${p.num}</td><td><button type="button" class="table-link" data-rc-open="${p.id}">${esc(p.label || 'Page ' + p.num)}</button></td>${D.versions.map(v => `<td>${imgs.filter(i => i.version_id === v.id).map(i => `<button type="button" class="h-rc-thumb tiny ${i.id === p.shown_image_id ? 'is-best' : ''}" data-rc-open="${p.id}" data-rc-image="${i.id}" title="${i.role === 'detail' ? 'Détail' : 'Page'}${i.id === p.shown_image_id ? ' · image retenue' : ''}"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy">${i.role === 'detail' ? '<em>🔍</em>' : ''}</button>`).join('') || '<span class="muted">—</span>'}</td>`).join('')}<td class="h-rc-excerpt">${esc(excerpt(p.transcription)) || '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`
            : `<p class="muted h-rc-hint">Clique sur une page pour l’ouvrir et la transcrire ; glisse-la pour changer l’ordre.</p><div class="h-rc-pages">${pages.map(pageCard).join('')}</div>`}`;
        let timer = 0;
        body.querySelector('[data-rc-q2]').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { s.q = e.target.value.trim(); paintPages(body); const i = body.querySelector('[data-rc-q2]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
        body.querySelectorAll('[data-rc-view]').forEach(b => b.addEventListener('click', () => { s.view = b.dataset.rcView; paintPages(body); }));
        body.querySelector('[data-rc-newpage]').addEventListener('click', async () => { const r = await run('save_recueil_page', {recueil_id: D.recueil.id}); if (r) { s.page = r.id; paint(); } });
        body.querySelectorAll('[data-rc-page],[data-rc-open]').forEach(b => b.addEventListener('click', () => { s.page = Number(b.dataset.rcPage || b.dataset.rcOpen); s.image = Number(b.dataset.rcImage || 0); s.compare = 0; paint(); }));
        body.querySelectorAll('[data-rc-zoom]').forEach(b => b.addEventListener('click', () => openViewer([imgById(b.dataset.rcZoom)], 0)));
        body.querySelectorAll('[data-rc-assign]').forEach(sel => sel.addEventListener('change', () => { const id = Number(sel.closest('[data-rc-img]').dataset.rcImg); if (sel.value === '') return; run('update_recueil_image', {id, page_id: Number(sel.value)}, 'Photo rangée.'); }));
        // Glisser une page sur une autre pour la mettre à sa place
        let drag = 0;
        body.querySelectorAll('[data-rc-page]').forEach(c => {
            c.addEventListener('dragstart', e => { drag = Number(c.dataset.rcPage); c.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
            c.addEventListener('dragend', () => c.classList.remove('is-dragging'));
            c.addEventListener('dragover', e => { if (drag && drag !== Number(c.dataset.rcPage)) { e.preventDefault(); c.classList.add('is-drop'); } });
            c.addEventListener('dragleave', () => c.classList.remove('is-drop'));
            c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('is-drop'); const to = Number(c.dataset.rcNum); if (drag) run('save_recueil_page', {id: drag, to_index: to}); drag = 0; });
        });
    }
    /** Liste de choix d'une page : « à ranger », pages existantes, nouvelle page. */
    function pageSelect(attr, current, withPlaceholder = false) {
        return `<select ${attr}>${withPlaceholder ? '<option value="">Mettre sur la page…</option>' : ''}<option value="0" ${!current && !withPlaceholder ? 'selected' : ''}>🧺 À ranger (sans page)</option>${D.pages.map(p => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${esc(pageName(p))}</option>`).join('')}<option value="-1">＋ Nouvelle page à la fin</option></select>`;
    }

    /* ─── Une page ─── */
    function paintPage(body) {
        const s = st(), p = pageById(s.page), idx = D.pages.indexOf(p), imgs = pageImages(p.id);
        let cur = imgById(s.image) && imgs.some(i => i.id === s.image) ? imgById(s.image) : imgById(p.shown_image_id) || imgs[0] || null;
        const cmp = s.compare && imgs.some(i => i.id === s.compare) ? imgById(s.compare) : null;
        const prev = D.pages[idx - 1], next = D.pages[idx + 1];
        const stage = i => i ? `<figure class="h-rc-figure"><img src="${esc(fullUrl(i))}" alt="" data-rc-zoom="${i.id}" title="Cliquer : agrandir, pivoter, retoucher"><figcaption>${esc(versionById(i.version_id)?.name || '')}${i.role === 'detail' ? ' · 🔍 détail' : ''}${i.id === p.best_image_id ? ' · ⭐ retenue' : i.id === p.shown_image_id ? ' · montrée (la plus récente)' : ''}</figcaption></figure>` : '';
        body.innerHTML = `<div class="h-rc-pagebar"><button type="button" class="button small secondary" data-rc-allpages>▦ Toutes les pages</button>
                <span class="h-rc-pagenav"><button type="button" class="button small secondary" data-rc-go="${prev?.id || ''}" ${prev ? '' : 'disabled'} title="Page précédente (Alt + ←)">‹</button>
                <select data-rc-jump>${D.pages.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(pageName(x))}</option>`).join('')}</select>
                <button type="button" class="button small secondary" data-rc-go="${next?.id || ''}" ${next ? '' : 'disabled'} title="Page suivante (Alt + →)">›</button></span>
                <span class="muted">${p.num} / ${D.pages.length}</span></div>
            <div class="h-rc-pageview">
                <div class="h-rc-stage-wrap">
                    <div class="h-rc-stage ${cmp ? 'is-compare' : ''}">${cur ? stage(cur) + (cmp ? stage(cmp) : '') : `<div class="h-rc-nophoto big">Pas de photo pour cette page.<br><button type="button" class="button small" data-rc-addhere>+ Ajouter une photo de cette page</button></div>`}</div>
                    ${cur ? `<div class="h-rc-imgactions">
                        ${p.best_image_id === cur.id ? '<span class="h-rc-kept">⭐ Image retenue pour cette page</span>' : `<button type="button" class="button small" data-rc-best="${cur.id}" title="C’est elle qu’on voit dans la mosaïque, le résumé et les fiches">⭐ Garder celle-ci</button>`}
                        <button type="button" class="button small secondary" data-rc-zoom="${cur.id}">🔍 Agrandir, pivoter, retoucher</button>
                        ${imgs.length > 1 ? `<button type="button" class="button small secondary" data-rc-compare="${cmp ? 0 : (imgs.find(i => i.id !== cur.id)?.id || 0)}">${cmp ? '✕ Fin de la comparaison' : '⇄ Comparer côte à côte'}</button>` : ''}
                        <button type="button" class="button small secondary" data-rc-role="${cur.id}">${cur.role === 'detail' ? '📄 C’est la page entière' : '🔍 C’est un détail (zoom)'}</button>
                        <label class="h-rc-move">Déplacer vers ${pageSelect('data-rc-moveimg', p.id)}</label>
                        <button type="button" class="icon-button danger" data-rc-remove="${cur.id}" title="Retirer cette photo du recueil (elle reste dans Médias)">🗑</button></div>` : ''}
                    <div class="h-rc-strip">${imgs.map(i => `<button type="button" class="h-rc-thumb ${i.id === cur?.id ? 'is-current' : ''} ${i.id === cmp?.id ? 'is-compare' : ''}" data-rc-pick="${i.id}" title="${esc(versionById(i.version_id)?.name || '')}${i.role === 'detail' ? ' · détail' : ''}"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy"><small>${esc(versionById(i.version_id)?.name || '')}</small>${i.role === 'detail' ? '<em>🔍</em>' : ''}${i.id === p.best_image_id ? '<b>⭐</b>' : ''}</button>`).join('')}
                        <button type="button" class="h-rc-thumb h-rc-addthumb" data-rc-addhere title="Ajouter une photo de cette page (autre version, détail…)">＋</button></div>
                </div>
                <div class="h-rc-side">
                    <label>Nom de la page <small class="muted">(facultatif)</small><input data-rc-field="label" value="${esc(p.label)}" placeholder="f° 12 r°, page 3, lettre B…"></label>
                    <label class="h-rc-trans">Transcription <span class="h-rc-saved muted" data-rc-saved></span><textarea data-rc-field="transcription" rows="16" placeholder="Recopie ici ce qui est écrit sur la page (une ligne par ligne du document)…">${esc(p.transcription)}</textarea></label>
                    ${cur?.media_transcription && !p.transcription.trim() ? `<button type="button" class="link-button" data-rc-usemedia>↧ Reprendre la transcription déjà faite sur cette photo</button>` : ''}
                    <label>Notes<textarea data-rc-field="notes" rows="4" placeholder="Abréviations, mots incertains, ce qu’il reste à vérifier…">${esc(p.notes)}</textarea></label>
                    <div class="h-rc-sideactions"><button type="button" class="button small secondary" data-rc-pagemove="-1" ${idx ? '' : 'disabled'}>↑ Avancer la page</button><button type="button" class="button small secondary" data-rc-pagemove="1" ${next ? '' : 'disabled'}>↓ Reculer la page</button><button type="button" class="button small secondary" data-rc-insert>+ Page après</button><button type="button" class="button small secondary danger" data-rc-delpage>Supprimer la page</button></div>
                    <p class="muted h-rc-hint">Supprimer une page ne supprime pas ses photos : elles passent « à ranger ».</p>
                </div></div>`;
        const go = id => { if (!id) return; s.page = Number(id); s.image = 0; s.compare = 0; paint(); };
        body.querySelector('[data-rc-allpages]').addEventListener('click', () => { s.page = 0; paint(); });
        body.querySelectorAll('[data-rc-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.rcGo)));
        body.querySelector('[data-rc-jump]').addEventListener('change', e => go(e.target.value));
        body.querySelectorAll('[data-rc-pick]').forEach(b => b.addEventListener('click', () => { const id = Number(b.dataset.rcPick); if (s.compare) s.compare = id === s.image ? 0 : id; else s.image = id; paint(); }));
        body.querySelectorAll('[data-rc-zoom]').forEach(b => b.addEventListener('click', () => { const list = imgs.length ? imgs : [imgById(b.dataset.rcZoom)]; openViewer(list, Math.max(0, list.findIndex(i => i.id === Number(b.dataset.rcZoom)))); }));
        body.querySelector('[data-rc-best]')?.addEventListener('click', e => run('save_recueil_page', {id: p.id, best_image_id: Number(e.currentTarget.dataset.rcBest)}, 'Image retenue pour cette page.'));
        body.querySelector('[data-rc-compare]')?.addEventListener('click', e => { s.image = cur.id; s.compare = Number(e.currentTarget.dataset.rcCompare); paint(); });
        body.querySelector('[data-rc-role]')?.addEventListener('click', () => run('update_recueil_image', {id: cur.id, role: cur.role === 'detail' ? 'page' : 'detail'}));
        body.querySelector('[data-rc-moveimg]')?.addEventListener('change', async e => { const v = Number(e.target.value); if (v === p.id) return; const r = await run('update_recueil_image', {id: cur.id, page_id: v, after_page: p.id}, v === 0 ? 'Photo mise « à ranger ».' : 'Photo déplacée.'); if (r) { s.image = 0; paint(); } });
        body.querySelector('[data-rc-remove]')?.addEventListener('click', () => { if (confirm('Retirer cette photo du recueil ? Elle reste dans Médias.')) { s.image = 0; run('remove_recueil_image', {id: cur.id}, 'Photo retirée du recueil.'); } });
        body.querySelectorAll('[data-rc-addhere]').forEach(b => b.addEventListener('click', () => addPhotosDialog({pageId: p.id})));
        body.querySelectorAll('[data-rc-pagemove]').forEach(b => b.addEventListener('click', () => run('save_recueil_page', {id: p.id, move: Number(b.dataset.rcPagemove)})));
        body.querySelector('[data-rc-insert]').addEventListener('click', async () => { const r = await run('save_recueil_page', {recueil_id: D.recueil.id, after: p.id}); if (r) go(r.id); });
        body.querySelector('[data-rc-delpage]').addEventListener('click', async () => { if (!confirm(`Supprimer la ${pageName(p)} ?${imgs.length ? `\n\nSes ${imgs.length} photo(s) passent « à ranger ».` : ''}${p.transcription.trim() ? '\n\nSa transcription sera perdue.' : ''}`)) return; s.page = (next || prev)?.id || 0; await run('delete_recueil_page', {id: p.id}, 'Page supprimée.'); });
        // Enregistrement au fil de la frappe
        const saved = body.querySelector('[data-rc-saved]');
        let timer = 0, pending = {};
        const flush = async () => { const data = pending; pending = {}; if (!Object.keys(data).length) return; try { await post('save_recueil_page', {id: p.id, ...data}); Object.assign(p, data); saved.textContent = '✓ enregistré'; } catch (e) { saved.textContent = ''; toast(e.message, 'error'); } };
        body.querySelectorAll('[data-rc-field]').forEach(el => el.addEventListener('input', () => { pending[el.dataset.rcField] = el.value; saved.textContent = '…'; clearTimeout(timer); timer = setTimeout(flush, 700); }));
        body.querySelectorAll('[data-rc-field]').forEach(el => el.addEventListener('blur', () => { clearTimeout(timer); flush(); }));
        body.querySelector('[data-rc-usemedia]')?.addEventListener('click', () => { const t = body.querySelector('[data-rc-field=transcription]'); t.value = cur.media_transcription; t.dispatchEvent(new Event('input')); });
        // Alt + ← → : page précédente / suivante
        const keys = e => { if (!body.isConnected) return document.removeEventListener('keydown', keys); if (!e.altKey || e.target.closest('textarea, input, select')) return; if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); flush(); go(prev.id); } if (e.key === 'ArrowRight' && next) { e.preventDefault(); flush(); go(next.id); } };
        document.removeEventListener('keydown', ext._rcKeys || (() => {})); ext._rcKeys = keys; document.addEventListener('keydown', keys);
    }

    /** Visionneuse de l'app (rotation, retouche, transcription…) ; au retour, le recueil est relu (images pivotées). */
    function openViewer(list, index) {
        const media = list.filter(Boolean).map(i => ({id: i.media_id, title: i.title, filename: i.filename, thumbnail: i.thumbnail, media_type: i.media_type || 'image', date_text: i.media_date, transcription: i.media_transcription}));
        if (!media.length) return;
        A().openLightbox(media, index, false);
        const lb = A().$('#lightbox');
        lb?.addEventListener('close', () => { bust = Date.now(); if (st().id && S().listType === 'recueils') reload(); }, {once: true});
    }

    /* ─── Ajouter des photos ─── */
    function addPhotosDialog({pageId = 0, versionId = 0} = {}) {
        const p = pageId ? pageById(pageId) : null;
        const lastV = D.versions[D.versions.length - 1];
        dialog({eyebrow: 'RECUEIL', title: p ? `Photo de la ${pageName(p)}` : 'Ajouter des photos', wide: true, submitLabel: 'Ajouter',
            body: `<label class="h-rc-drop"><input type="file" name="files" accept="image/*" ${p ? '' : 'multiple'} required><span>📷 Choisis ${p ? 'la photo' : 'les photos (dans l’ordre des pages : le nom du fichier compte)'}</span></label>
                <div class="form-grid"><label>Série de photos (version)<select name="version_id">${D.versions.map(v => `<option value="${v.id}" ${(versionId || lastV?.id) === v.id ? 'selected' : ''}>${esc(v.name)}${v.date_text ? ` (${esc(v.date_text)})` : ''}</option>`).join('')}<option value="new">＋ Nouvelle série…</option></select></label>
                <label data-rc-newv hidden>Nom de la nouvelle série<input name="new_version" placeholder="Photos ${new Date().getFullYear()}"></label></div>
                ${p ? `<fieldset class="h-rc-modes"><legend>Cette photo est</legend><label class="checkbox-line"><input type="radio" name="role" value="page" checked> la page entière</label><label class="checkbox-line"><input type="radio" name="role" value="detail"> un détail (zoom) de la page</label></fieldset>`
                : `<fieldset class="h-rc-modes"><legend>Où les mettre ?</legend>
                    <label class="checkbox-line"><input type="radio" name="mode" value="new_pages" ${D.pages.length ? '' : 'checked'}> Chaque photo est une <b>nouvelle page</b>, à la suite</label>
                    <label class="checkbox-line"><input type="radio" name="mode" value="fill" ${D.pages.length ? 'checked' : ''} ${D.pages.length ? '' : 'disabled'}> Sur les <b>pages déjà là</b>, dans l’ordre, à partir de la page <input type="number" name="start_page" value="1" min="1" max="${Math.max(1, D.pages.length)}" class="h-lr-year"> (celles qui n’ont pas encore de photo dans cette série), puis de nouvelles pages</label>
                    <label class="checkbox-line"><input type="radio" name="mode" value="loose"> <b>À ranger</b> : je dirai plus tard sur quelle page va chaque photo</label></fieldset>`}
                <p class="muted" data-rc-progress></p>`,
            onOpen: dl => {
                const sel = dl.querySelector('[name=version_id]'), nv = dl.querySelector('[data-rc-newv]');
                const sync = () => { nv.hidden = sel.value !== 'new'; nv.querySelector('input').required = sel.value === 'new'; };
                sel.addEventListener('change', sync); sync();
            },
            onSubmit: async form => {
                const f = new FormData(form), files = form.querySelector('[name=files]').files;
                const files2 = [...files].sort((a, b) => a.name.localeCompare(b.name, 'fr', {numeric: true}));
                const prog = form.querySelector('[data-rc-progress]');
                const ids = await uploadPhotos(D.recueil.id, files2, (n, t) => { prog.textContent = `Envoi : ${n} / ${t}…`; });
                const body = {recueil_id: D.recueil.id, media_ids: ids, mode: p ? 'loose' : f.get('mode') || 'new_pages', start_page: Number(f.get('start_page') || 1)};
                if (f.get('version_id') === 'new') body.new_version = String(f.get('new_version') || '').trim(); else body.version_id = Number(f.get('version_id'));
                const res = await post('recueil_add_images', body);
                const out = res.result || res;
                if (p) { await load(D.recueil.id); const img = D.images.filter(i => !i.page_id && ids.includes(i.media_id)); for (const i of img) await post('update_recueil_image', {id: i.id, page_id: p.id, role: f.get('role') || 'page'}); }
                toast(`${plural(out.added, 'photo ajoutée', 'photos ajoutées')}${out.new_pages ? ` · ${plural(out.new_pages, 'nouvelle page', 'nouvelles pages')}` : ''}.`);
                bust = Date.now();
                if (!p && st().tab !== 'versions') { st().tab = 'pages'; st().page = 0; }
                await reload();
            },
        });
    }

    /* ─── Versions ─── */
    function paintVersions(body) {
        const s = st();
        const a = versionById(s.cmpA) || D.versions[0], b = versionById(s.cmpB) || D.versions[1];
        body.innerHTML = `<div class="h-cfg-explain">Une <b>version</b> est une série de photos du même document : celles prises il y a dix ans, celles de ta prochaine visite… Elles coexistent. Pour chaque page, tu choisis l’image à garder (⭐) : c’est « la meilleure version », faite du meilleur de chacune. Une photo peut aussi être un <b>détail</b> (zoom) d’une page.</div>
            ${D.versions.length > 1 ? `<section class="maintenance-panel"><h3>⇄ Comparer deux versions <small class="muted">et choisir, page par page, l’image à garder</small></h3>
                <div class="form-grid h-rc-cmpsel"><label>À gauche<select data-rc-cmp="A">${D.versions.map(v => `<option value="${v.id}" ${v.id === a.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label><label>À droite<select data-rc-cmp="B">${D.versions.map(v => `<option value="${v.id}" ${v.id === b.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label></div>
                <div class="h-rc-cmp">${D.pages.map(p => { const imgs = pageImages(p.id), ia = imgs.find(i => i.version_id === a.id && i.role === 'page'), ib = imgs.find(i => i.version_id === b.id && i.role === 'page');
                    const cell = i => i ? `<button type="button" class="h-rc-cmpcell ${i.id === p.best_image_id ? 'is-best' : i.id === p.shown_image_id ? 'is-shown' : ''}" data-rc-keep="${p.id}:${i.id}" title="${i.id === p.best_image_id ? 'Image retenue' : 'Garder celle-ci pour la page'}"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy"><span>${i.id === p.best_image_id ? '⭐ retenue' : i.id === p.shown_image_id ? '☆ garder <small>(montrée pour l’instant)</small>' : '☆ garder'}</span></button>` : '<span class="h-rc-cmpcell is-empty">pas de photo</span>';
                    return `<div class="h-rc-cmprow"><button type="button" class="table-link" data-rc-open="${p.id}">${esc(pageName(p))}</button>${cell(ia)}${cell(ib)}</div>`; }).join('')}</div></section>` : ''}
            ${D.versions.map((v, k) => { const imgs = D.images.filter(i => i.version_id === v.id); const covered = new Set(imgs.filter(i => i.page_id && i.role === 'page').map(i => i.page_id)).size;
                return `<section class="maintenance-panel h-rc-version" data-rc-v="${v.id}"><div class="h-cfg-head"><h3>🗂️ ${esc(v.name)} <small class="muted">${esc(v.date_text || '')} · ${plural(imgs.length, 'photo', 'photos')} · ${covered} page(s) sur ${D.pages.length}</small></h3>
                    <span class="h-cfg-actions"><button type="button" class="icon-button" data-rc-vmove="-1" ${k ? '' : 'disabled'} title="Monter">↑</button><button type="button" class="icon-button" data-rc-vmove="1" ${k < D.versions.length - 1 ? '' : 'disabled'} title="Descendre">↓</button>
                    <button type="button" class="button small secondary" data-rc-vedit>Renommer…</button><button type="button" class="button small" data-rc-vadd>+ Photos</button>${D.versions.length > 1 ? '<button type="button" class="icon-button danger" data-rc-vdel title="Supprimer cette version">🗑</button>' : ''}</span></div>
                    ${v.notes ? `<p class="muted">${nl(v.notes)}</p>` : ''}
                    <div class="h-rc-vstrip">${imgs.map(i => { const p = pageById(i.page_id); return `<button type="button" class="h-rc-thumb" ${p ? `data-rc-open="${p.id}" data-rc-image="${i.id}"` : `data-rc-zoomv="${i.id}"`} title="${p ? esc(pageName(p)) : 'À ranger'}"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy"><small>${p ? (i.role === 'detail' ? '🔍 ' : '') + 'p. ' + p.num : '🧺 à ranger'}</small>${p && i.id === p.shown_image_id ? '<b>⭐</b>' : ''}</button>`; }).join('') || '<span class="muted">Pas encore de photo.</span>'}</div></section>`; }).join('')}
            <button type="button" class="button secondary" data-rc-vnew>+ Nouvelle série de photos</button>`;
        body.querySelectorAll('[data-rc-cmp]').forEach(sel => sel.addEventListener('change', () => { s['cmp' + sel.dataset.rcCmp] = Number(sel.value); paintVersions(body); }));
        body.querySelectorAll('[data-rc-keep]').forEach(btn => btn.addEventListener('click', () => { const [pid, iid] = btn.dataset.rcKeep.split(':').map(Number); run('save_recueil_page', {id: pid, best_image_id: iid}); }));
        body.querySelectorAll('[data-rc-open]').forEach(btn => btn.addEventListener('click', () => { s.tab = 'pages'; s.page = Number(btn.dataset.rcOpen); s.image = Number(btn.dataset.rcImage || 0); paint(); }));
        body.querySelectorAll('[data-rc-zoomv]').forEach(btn => btn.addEventListener('click', () => { s.tab = 'pages'; s.page = 0; paint(); }));
        body.querySelectorAll('[data-rc-v]').forEach(sec => {
            const v = versionById(sec.dataset.rcV);
            sec.querySelectorAll('[data-rc-vmove]').forEach(b => b.addEventListener('click', () => run('save_recueil_version', {...v, move: Number(b.dataset.rcVmove)})));
            sec.querySelector('[data-rc-vedit]').addEventListener('click', () => versionDialog(v));
            sec.querySelector('[data-rc-vadd]').addEventListener('click', () => addPhotosDialog({versionId: v.id}));
            sec.querySelector('[data-rc-vdel]')?.addEventListener('click', () => { if (confirm(`Supprimer la version « ${v.name} » ?\n\nSes photos quittent le recueil (elles restent dans Médias). Les pages et leurs transcriptions restent.`)) run('delete_recueil_version', {id: v.id}, 'Version supprimée.'); });
        });
        body.querySelector('[data-rc-vnew]').addEventListener('click', () => versionDialog(null));
    }
    function versionDialog(v) {
        dialog({eyebrow: 'RECUEIL', title: v ? 'Version' : 'Nouvelle série de photos', submitLabel: 'Enregistrer',
            body: `<div class="form-grid"><label>Nom<input name="name" required value="${esc(v?.name || '')}" placeholder="Photos ${new Date().getFullYear()}"></label><label>Date<input name="date_text" value="${esc(v?.date_text || '')}" placeholder="mars 2015"></label>
                <label class="span-2">Notes<textarea name="notes" rows="3" placeholder="Appareil, conditions, pages manquantes…">${esc(v?.notes || '')}</textarea></label></div>`,
            onSubmit: async form => { const f = Object.fromEntries(new FormData(form)); await run('save_recueil_version', {...f, id: v?.id || 0, recueil_id: D.recueil.id}, 'Version enregistrée.'); },
        });
    }

    /* ─── Rattachements ─── */
    function linkLabel(l) {
        const [icon] = LINK_TYPES[l.entity_type] || ['🔗'];
        const open = l.entity_type === 'person' ? `data-open-person="${esc(l.entity_key)}"` : l.entity_type === 'investigation' ? `data-open-investigation="${esc(l.entity_key)}"` : `data-rc-entity="${esc(l.entity_type)}:${esc(l.entity_key)}"`;
        return `${icon} <button type="button" class="table-link" ${open}>${esc(l.label)}</button>${l.extra ? ` <small class="muted">${esc(l.extra)}</small>` : ''}`;
    }
    const linkPages = l => l.from_num ? (l.to_num && l.to_num !== l.from_num ? `pages ${l.from_num} à ${l.to_num}` : `page ${l.from_num}`) : 'tout le recueil';
    function paintLinks(body) {
        body.innerHTML = `<p class="muted">Rattache tout le recueil, ou seulement quelques pages, à une fiche, un village, une enquête, un projet de l’Atelier ou une battue. Le recueil y apparaît, avec les pages concernées.</p>
            ${D.links.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Rattaché à</th><th>Sorte</th><th>Pages</th><th>Note</th><th></th></tr></thead><tbody>${D.links.map(l => `<tr><td>${linkLabel(l)}</td><td>${esc(l.type_label)}</td><td>${esc(linkPages(l))}</td><td>${esc(l.note)}</td>
                <td class="h-rc-actions"><button type="button" class="button small secondary" data-rc-ledit="${l.id}">Modifier</button><button type="button" class="icon-button danger" data-rc-ldel="${l.id}" title="Détacher">🗑</button></td></tr>`).join('')}</tbody></table></div>` : A().empty('Rattaché à rien pour l’instant.')}
            <button type="button" class="button" data-rc-lnew>+ Rattacher</button>`;
        body.querySelector('[data-rc-lnew]').addEventListener('click', () => linkDialog(null));
        body.querySelectorAll('[data-rc-ledit]').forEach(b => b.addEventListener('click', () => linkDialog(D.links.find(l => l.id === Number(b.dataset.rcLedit)))));
        body.querySelectorAll('[data-rc-ldel]').forEach(b => b.addEventListener('click', () => { if (confirm('Détacher ?')) run('delete_recueil_link', {id: Number(b.dataset.rcLdel)}, 'Détaché.'); }));
        bindEntityOpen(body);
        A().bindTableLinks?.();
    }
    function bindEntityOpen(root) {
        root.querySelectorAll('[data-rc-entity]').forEach(b => b.addEventListener('click', () => {
            const [type, ...rest] = b.dataset.rcEntity.split(':'), key = rest.join(':'), s = S();
            if (type === 'village') { s.listType = 'villages'; s.hVillage = key; A().setModule('listes'); }
            if (type === 'battue') { s.enquetesTab = 'battue'; s.currentInvestigationId = 0; s.currentBattueId = Number(key); A().setModule('enquetes'); }
            if (type === 'atelier_project') { s.atelier = {...(s.atelier || {}), project: Number(key), sel: []}; s.enquetesTab = 'atelier'; s.currentBattueId = 0; s.currentInvestigationId = 0; A().setModule('enquetes'); }
        }));
    }
    /** Pages « de … à … » (vide = tout le recueil). */
    const rangeFields = (pages, from, to) => `<fieldset class="h-rc-modes"><legend>Quelles pages ?</legend>
        <label class="checkbox-line"><input type="radio" name="scope" value="all" ${from ? '' : 'checked'}> Tout le recueil</label>
        <label class="checkbox-line"><input type="radio" name="scope" value="some" ${from ? 'checked' : ''} ${pages.length ? '' : 'disabled'}> De la page <select name="page_from">${pages.map(p => `<option value="${p.id}" ${p.id === from ? 'selected' : ''}>${esc(pageName(p))}</option>`).join('')}</select> à la page <select name="page_to">${pages.map(p => `<option value="${p.id}" ${p.id === (to || from) ? 'selected' : ''}>${esc(pageName(p))}</option>`).join('')}</select></label></fieldset>`;
    function linkDialog(l) {
        let chosen = l ? {key: l.entity_key, label: l.label} : null;
        dialog({eyebrow: 'RECUEIL', title: l ? 'Rattachement' : 'Rattacher le recueil', wide: true, submitLabel: 'Enregistrer',
            body: `<div class="form-grid"><label>À quoi ?<select name="entity_type">${Object.entries(LINK_TYPES).map(([k, [icon, label]]) => `<option value="${k}" ${l?.entity_type === k ? 'selected' : ''}>${icon} ${label}</option>`).join('')}</select></label>
                <label>Chercher<input type="search" data-rc-ls placeholder="Nom, titre…" value="${esc(l?.label || '')}"></label></div>
                <div class="h-rc-results" data-rc-lr></div>
                ${rangeFields(D.pages, l?.page_from, l?.page_to)}
                <label>Note <small class="muted">(facultatif)</small><input name="note" value="${esc(l?.note || '')}" placeholder="Il est cité à la ligne 12"></label>`,
            onOpen: dl => {
                const type = dl.querySelector('[name=entity_type]'), q = dl.querySelector('[data-rc-ls]'), box = dl.querySelector('[data-rc-lr]');
                let timer = 0;
                const search = async () => { const r = await get('recueil_search', {type: type.value, q: q.value.trim()}).catch(() => ({results: []}));
                    box.innerHTML = (r.results || []).map(x => `<label class="checkbox-line"><input type="radio" name="pick" value="${esc(x.key)}" data-label="${esc(x.label)}" ${chosen?.key === x.key ? 'checked' : ''}> ${esc(x.label)} ${x.extra ? `<small class="muted">${esc(x.extra)}</small>` : ''}</label>`).join('') || '<p class="muted">Rien trouvé.</p>';
                    box.querySelectorAll('[name=pick]').forEach(r2 => r2.addEventListener('change', () => { chosen = {key: r2.value, label: r2.dataset.label}; })); };
                q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
                type.addEventListener('change', () => { chosen = null; q.value = ''; search(); });
                search();
            },
            onSubmit: async form => {
                if (!chosen) { toast('Choisis dans la liste à quoi rattacher.', 'error'); return false; }
                const f = Object.fromEntries(new FormData(form));
                await run('save_recueil_link', {id: l?.id || 0, recueil_id: D.recueil.id, entity_type: f.entity_type, entity_key: chosen.key, label: chosen.label, note: f.note,
                    page_from: f.scope === 'some' ? Number(f.page_from) : 0, page_to: f.scope === 'some' ? Number(f.page_to) : 0}, 'Rattaché.');
            },
        });
    }

    /* ─── Résumé (blocs à choisir, comme des widgets) ─── */
    const BLOCKS = {
        cover: ['🖼️', 'Couverture', 'La première page (image retenue)'], figures: ['🔢', 'En chiffres', 'Pages, photos, versions, transcription'], description: ['📝', 'Description', 'Le texte du recueil'],
        progress: ['📈', 'Avancement de la transcription', 'Barre et pages restantes'], versions: ['🗂️', 'Versions', 'Ce que couvre chaque série de photos'], missing: ['❓', 'Pages manquantes', 'Pages sans photo dans une version'],
        toc: ['📑', 'Table des pages', 'Nom et début de la transcription'], latest: ['✍️', 'Transcriptions', 'Les pages transcrites, en entier'], links: ['🔗', 'Rattachements', 'Fiches, villages, enquêtes…'],
        mosaic: ['▦', 'Mosaïque', 'Les pages en vignettes'], note: ['🗒️', 'Note libre', 'Un texte à toi'],
    };
    const DEFAULT_SUMMARY = ['cover', 'figures', 'description', 'progress', 'versions', 'links', 'toc', 'mosaic', 'missing'].map(type => ({type, on: true, n: type === 'toc' ? 20 : type === 'mosaic' ? 24 : 12, wide: ['description', 'toc', 'mosaic', 'versions'].includes(type)}));
    const summaryBlocks = () => { const b = D.recueil.summary?.blocks; return Array.isArray(b) && b.length ? b : DEFAULT_SUMMARY; };
    function blockHtml(b) {
        const [icon, label] = BLOCKS[b.type] || ['•', ''], title = b.title || label, pages = D.pages, imgs = D.images;
        const done = pages.filter(p => p.transcription.trim());
        let inner = '';
        switch (b.type) {
            case 'cover': { const p = pages[0], i = p ? imgById(p.shown_image_id) : null; inner = i ? `<button type="button" class="h-rc-coverbig" data-rc-open="${p.id}"><img src="${esc(thumbUrl(i))}" alt=""></button>` : '<p class="muted">Pas encore de photo.</p>'; break; }
            case 'figures': inner = `<div class="h-rc-figs"><span><b>${pages.length}</b> pages</span><span><b>${imgs.length}</b> photos</span><span><b>${D.versions.length}</b> versions</span><span><b>${imgs.filter(i => i.role === 'detail').length}</b> détails</span><span><b>${done.length}</b> transcrites</span>${loose().length ? `<span class="h-rc-warn"><b>${loose().length}</b> à ranger</span>` : ''}</div>`; break;
            case 'description': inner = D.recueil.description ? `<p>${nl(D.recueil.description)}</p>` : '<p class="muted">Pas de description : « Modifier » pour en écrire une.</p>'; break;
            case 'progress': { const pct = pages.length ? Math.round(done.length / pages.length * 100) : 0; const todo = pages.filter(p => !p.transcription.trim()).slice(0, b.n);
                inner = `<div class="h-rc-meter big"><i style="width:${pct}%"></i></div><p><b>${pct} %</b> — ${done.length} sur ${pages.length} pages</p>${todo.length ? `<p class="muted">À transcrire : ${todo.map(p => `<button type="button" class="link-button" data-rc-open="${p.id}">${p.num}</button>`).join(', ')}${pages.length - done.length > todo.length ? '…' : ''}</p>` : ''}`; break; }
            case 'versions': inner = `<ul class="h-rc-vlist">${D.versions.map(v => { const n = new Set(imgs.filter(i => i.version_id === v.id && i.page_id && i.role === 'page').map(i => i.page_id)).size; const kept = pages.filter(p => imgById(p.shown_image_id)?.version_id === v.id).length;
                return `<li><b>${esc(v.name)}</b> ${v.date_text ? `<small class="muted">${esc(v.date_text)}</small>` : ''}<span class="h-rc-meter"><i style="width:${pages.length ? Math.round(n / pages.length * 100) : 0}%"></i></span><small>${n} / ${pages.length} pages · ⭐ ${kept} retenue(s)</small></li>`; }).join('')}</ul>`; break;
            case 'missing': { const rows = D.versions.map(v => ({v, miss: pages.filter(p => !imgs.some(i => i.page_id === p.id && i.version_id === v.id && i.role === 'page'))})).filter(x => x.miss.length);
                const none = pages.filter(p => !imgs.some(i => i.page_id === p.id));
                inner = rows.length || none.length ? `${none.length ? `<p><b>Sans aucune photo :</b> ${none.slice(0, b.n).map(p => `<button type="button" class="link-button" data-rc-open="${p.id}">${p.num}</button>`).join(', ')}</p>` : ''}${D.versions.length > 1 ? rows.map(x => `<p><b>${esc(x.v.name)} :</b> ${x.miss.slice(0, b.n).map(p => `<button type="button" class="link-button" data-rc-open="${p.id}">${p.num}</button>`).join(', ')}${x.miss.length > b.n ? '…' : ''}</p>`).join('') : ''}` : '<p class="muted">Toutes les pages ont leurs photos.</p>'; break; }
            case 'toc': inner = pages.length ? `<ol class="h-rc-toc">${pages.slice(0, b.n).map(p => `<li><button type="button" class="link-button" data-rc-open="${p.id}">${esc(p.label || 'Page ' + p.num)}</button> ${p.transcription.trim() ? `<small class="muted">${esc(excerpt(p.transcription, 90))}</small>` : '<small class="muted">—</small>'}</li>`).join('')}</ol>${pages.length > b.n ? `<p class="muted">… et ${pages.length - b.n} autres.</p>` : ''}` : '<p class="muted">Pas de page.</p>'; break;
            case 'latest': inner = done.length ? done.slice(0, b.n).map(p => `<div class="h-rc-tr"><button type="button" class="link-button" data-rc-open="${p.id}">${esc(pageName(p))}</button><p>${nl(p.transcription)}</p></div>`).join('') : '<p class="muted">Aucune page transcrite.</p>'; break;
            case 'links': inner = D.links.length ? `<ul class="h-rc-llist">${D.links.map(l => `<li>${linkLabel(l)} <small class="muted">· ${esc(linkPages(l))}</small></li>`).join('')}</ul>` : '<p class="muted">Rattaché à rien.</p>'; break;
            case 'mosaic': inner = pages.length ? `<div class="h-rc-mosaic">${pages.slice(0, b.n).map(p => { const i = imgById(p.shown_image_id); return `<button type="button" class="h-rc-thumb" data-rc-open="${p.id}" title="${esc(pageName(p))}">${i ? `<img src="${esc(thumbUrl(i))}" alt="" loading="lazy">` : '<span class="h-rc-nophoto">—</span>'}<small>${p.num}</small></button>`; }).join('')}</div>` : '<p class="muted">Pas de page.</p>'; break;
            case 'note': inner = b.text ? `<p>${nl(b.text)}</p>` : '<p class="muted">Note vide : « Personnaliser » pour l’écrire.</p>'; break;
        }
        return `<section class="maintenance-panel h-rc-block ${b.wide ? 'is-wide' : ''}"><h3>${icon} ${esc(title)}</h3>${inner}</section>`;
    }
    function paintSummary(body) {
        const blocks = summaryBlocks().filter(b => b.on && BLOCKS[b.type]);
        body.innerHTML = `<div class="h-rc-sumhead"><button type="button" class="button small secondary" data-rc-custom>⚙️ Personnaliser le résumé</button></div>
            <div class="h-rc-summary">${blocks.map(blockHtml).join('') || A().empty('Résumé vide : « Personnaliser » pour choisir ce qu’on y voit.')}</div>`;
        body.querySelector('[data-rc-custom]').addEventListener('click', summaryDialog);
        body.querySelectorAll('[data-rc-open]').forEach(b => b.addEventListener('click', () => { st().tab = 'pages'; st().page = Number(b.dataset.rcOpen); st().image = 0; paint(); }));
        bindEntityOpen(body);
        A().bindTableLinks?.();
    }
    function summaryDialog() {
        let blocks = JSON.parse(JSON.stringify(summaryBlocks()));
        Object.keys(BLOCKS).forEach(type => { if (type !== 'note' && !blocks.some(b => b.type === type)) blocks.push({type, on: false, n: 12, wide: false}); });
        const row = (b, i) => { const [icon, label, help] = BLOCKS[b.type];
            return `<div class="h-cfg-row ${b.on ? '' : 'is-hidden'}" data-sb="${i}"><span class="h-rb-tools"><button type="button" class="icon-button" data-sb-move="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button" data-sb-move="1" ${i < blocks.length - 1 ? '' : 'disabled'}>↓</button></span>
                <label class="checkbox-line"><input type="checkbox" data-sb-f="on" ${b.on ? 'checked' : ''}> ${icon}</label><input data-sb-f="title" value="${esc(b.title || '')}" placeholder="${esc(label)}" class="h-cfg-label" title="${esc(help)}">
                ${['toc', 'latest', 'mosaic', 'missing', 'progress'].includes(b.type) ? `<label class="h-sb-n">combien <input type="number" min="1" max="200" data-sb-f="n" value="${b.n || 12}" class="h-lr-year"></label>` : ''}
                <label class="checkbox-line"><input type="checkbox" data-sb-f="wide" ${b.wide ? 'checked' : ''}> large</label>
                ${b.type === 'note' ? `<textarea data-sb-f="text" rows="2" placeholder="Ta note…" class="span-all">${esc(b.text || '')}</textarea><button type="button" class="icon-button danger" data-sb-del title="Supprimer">🗑</button>` : ''}</div>`; };
        dialog({eyebrow: 'RÉSUMÉ DU RECUEIL', title: 'Ce qu’on voit dans le résumé', wide: true, submitLabel: 'Enregistrer',
            body: `<p class="muted">Coche les blocs à afficher, range-les avec ↑ ↓, renomme-les, choisis combien d’éléments ils montrent.</p><div class="h-cfg-list" data-sb-list></div>
                <div class="page-actions"><button type="button" class="button small secondary" data-sb-note>+ Note libre</button><button type="button" class="button small secondary" data-sb-reset>↺ Comme au départ</button></div>`,
            onOpen: dl => {
                const box = dl.querySelector('[data-sb-list]');
                const read = () => box.querySelectorAll('[data-sb]').forEach(r => { const b = blocks[Number(r.dataset.sb)]; r.querySelectorAll('[data-sb-f]').forEach(el => { const k = el.dataset.sbF; b[k] = el.type === 'checkbox' ? el.checked : k === 'n' ? Number(el.value) || 12 : el.value; }); });
                const draw = () => { box.innerHTML = blocks.map(row).join(''); };
                draw();
                box.addEventListener('click', e => { const r = e.target.closest('[data-sb]'); if (!r) return; read(); const i = Number(r.dataset.sb);
                    const mv = e.target.closest('[data-sb-move]'); if (mv) { const j = i + Number(mv.dataset.sbMove); if (j >= 0 && j < blocks.length) { [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; draw(); } }
                    if (e.target.closest('[data-sb-del]')) { blocks.splice(i, 1); draw(); } });
                box.addEventListener('change', e => { if (e.target.dataset.sbF === 'on') e.target.closest('[data-sb]').classList.toggle('is-hidden', !e.target.checked); });
                dl.querySelector('[data-sb-note]').addEventListener('click', () => { read(); blocks.push({type: 'note', on: true, n: 12, wide: true, title: '', text: ''}); draw(); box.lastElementChild?.querySelector('textarea')?.focus(); });
                dl.querySelector('[data-sb-reset]').addEventListener('click', () => { blocks = JSON.parse(JSON.stringify(DEFAULT_SUMMARY)); Object.keys(BLOCKS).forEach(type => { if (type !== 'note' && !blocks.some(b => b.type === type)) blocks.push({type, on: false, n: 12, wide: false}); }); draw(); });
                dl._read = read;
            },
            onSubmit: async form => { form.closest('dialog')._read(); await run('save_recueil', {...D.recueil, summary: {blocks}}, 'Résumé enregistré.'); },
        });
    }

    /* ─────────── Dans une fiche, un village, une enquête, un projet : les recueils rattachés ─────────── */
    function forEntityHtml(rows, type, key) {
        return `<div class="h-rc-for">${rows.map(r => `<div class="h-rc-for-item"><div class="h-rc-for-head"><button type="button" class="table-link" data-open-recueil="${r.recueil_id}"><strong>${esc(r.icon || '📚')} ${esc(r.title)}</strong></button>
                <small class="muted">${r.from_num ? (r.to_num && r.to_num !== r.from_num ? `pages ${r.from_num} à ${r.to_num}` : `page ${r.from_num}`) : `tout le recueil (${r.total_pages} p.)`} · ${r.transcribed}/${r.pages} transcrite(s)${r.reference ? ' · ' + esc(r.reference) : ''}</small>
                <button type="button" class="icon-button" data-rc-unlink="${r.link_id}" title="Détacher">✕</button></div>
                ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}
                <div class="h-rc-for-strip">${r.thumbs.map(t => `<button type="button" class="h-rc-thumb" data-open-recueil="${r.recueil_id}" data-recueil-page="${t.page_id}" title="${esc(t.label || 'Page ' + t.num)}">${t.thumbnail ? `<img src="media/${encodeURIComponent(t.thumbnail)}" alt="" loading="lazy">` : '<span class="h-rc-nophoto">—</span>'}<small>${t.num}</small></button>`).join('')}${r.pages > r.thumbs.length ? `<button type="button" class="h-rc-thumb h-rc-more" data-open-recueil="${r.recueil_id}">+${r.pages - r.thumbs.length}</button>` : ''}</div></div>`).join('')}
            <button type="button" class="button small secondary" data-rc-attach="${esc(type)}:${esc(key)}">+ Rattacher un recueil</button></div>`;
    }
    /** Fenêtre « Rattacher un recueil » depuis une fiche, un village… */
    ext.recueilAttachDialog = async (type, key, after) => {
        const list = (await get('recueils').catch(() => ({recueils: []}))).recueils || [];
        if (!list.length) { if (confirm('Pas encore de recueil. En créer un maintenant (Listes › Recueils) ?')) { S().listType = 'recueils'; Object.assign(st(), {id: 0}); A().setModule('listes'); } return; }
        let pages = [];
        dialog({eyebrow: 'RECUEIL', title: 'Rattacher un recueil', wide: true, submitLabel: 'Rattacher',
            body: `<label>Recueil<select name="recueil_id">${list.map(r => `<option value="${r.id}">${esc(r.icon || '📚')} ${esc(r.title)} (${r.pages} p.)</option>`).join('')}</select></label><div data-rc-range></div>
                <label>Note <small class="muted">(facultatif)</small><input name="note" placeholder="Il est cité à la ligne 12"></label>`,
            onOpen: dl => { const sel = dl.querySelector('[name=recueil_id]'), box = dl.querySelector('[data-rc-range]');
                const fill = async () => { const d = await get('recueil', {id: sel.value}); pages = d.pages; box.innerHTML = rangeFields(pages, 0, 0); };
                sel.addEventListener('change', fill); fill(); },
            onSubmit: async form => { const f = Object.fromEntries(new FormData(form));
                await post('save_recueil_link', {recueil_id: Number(f.recueil_id), entity_type: type, entity_key: key, note: f.note, page_from: f.scope === 'some' ? Number(f.page_from) : 0, page_to: f.scope === 'some' ? Number(f.page_to) : 0});
                toast('Recueil rattaché.'); after?.(); },
        });
    };
    /** Section « Recueils » à poser dans une page (village, enquête, projet) : ext.recueilsSection(conteneur, type, clé). */
    ext.recueilsSection = async (box, type, key, {title = '📚 Recueils', hideEmpty = false} = {}) => {
        if (!box) return;
        const rows = (await get('recueils_for', {type, key}).catch(() => ({recueils: []}))).recueils || [];
        if (!box.isConnected) return;
        if (!rows.length && hideEmpty) { box.innerHTML = `<button type="button" class="button small secondary" data-rc-attach="${esc(type)}:${esc(key)}">📚 Rattacher un recueil</button>`; }
        else box.innerHTML = `<section class="maintenance-panel h-rc-section"><h3>${title}</h3>${rows.length ? '' : '<p class="muted">Aucun recueil rattaché.</p>'}${forEntityHtml(rows, type, key)}</section>`;
        bindFor(box, () => ext.recueilsSection(box, type, key, {title, hideEmpty}));
    };
    function bindFor(root, after) {
        root.querySelectorAll('[data-rc-attach]').forEach(b => b.addEventListener('click', () => { const [type, ...k] = b.dataset.rcAttach.split(':'); ext.recueilAttachDialog(type, k.join(':'), after); }));
        root.querySelectorAll('[data-rc-unlink]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Détacher ce recueil ?')) return; await post('delete_recueil_link', {id: Number(b.dataset.rcUnlink)}); toast('Détaché.'); after?.(); }));
    }
    /** Toute case <div data-rc-host data-rc-type="village" data-rc-key="…"> posée par un écran se remplit seule. */
    const fillHosts = () => document.querySelectorAll('[data-rc-host]:not([data-rc-filled])').forEach(box => {
        box.dataset.rcFilled = '1';
        ext.recueilsSection(box, box.dataset.rcType, box.dataset.rcKey, {title: box.dataset.rcTitle || '📚 Recueils', hideEmpty: box.dataset.rcHideEmpty !== undefined});
    });
    new MutationObserver(() => { if (document.querySelector('[data-rc-host]:not([data-rc-filled])')) fillHosts(); }).observe(document.body, {childList: true, subtree: true});

    ext.personBlocks.recueils = (index, detail) => {
        const rows = detail.heritage?.recueils || [];
        const pid = detail.person?.id;
        setTimeout(() => { const box = document.querySelector('[data-rc-person-block]'); if (box) bindFor(box, () => ext.refreshView?.()); }, 0);
        return A().card(index, 'Recueils', rows.length, `<div data-rc-person-block>${rows.length ? forEntityHtml(rows, 'person', String(pid)) : `<p class="muted">Aucun recueil (registre, liste, cahier photographié) ne parle de cette personne.</p><button type="button" class="button small secondary" data-rc-attach="person:${pid}">+ Rattacher un recueil</button>`}</div>`, 'span-12');
    };
})();
