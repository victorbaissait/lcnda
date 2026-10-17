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
    const LINK_TYPES = {person: ['👤', 'Fiche'], village: ['🏘️', 'Village'], investigation: ['🔍', 'Enquête'], atelier_project: ['📚', 'Projet de l’Atelier'], battue: ['🧭', 'Battue']};
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
            : (s.q ? A().emptyState({icon: '🔍', text: 'Aucun recueil ne correspond.'}) : A().emptyState({icon: '📚', text: 'Aucun recueil pour l’instant', hint: 'Crée le recueil (registre, liste, cahier…), puis ajoute tes photos : chaque photo devient une page.', action: {label: '＋ Nouveau recueil', attrs: 'data-rc-new'}}))}
        </section>`;
        const sec = ws.querySelector('.h-rc');
        sec.querySelectorAll('[data-rc-new]').forEach(b => b.addEventListener('click', () => recueilDialog(null)));
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
                const keep = await A().confirmBox(`Supprimer le recueil « ${r.title} » avec ses pages, transcriptions et versions ?\n\nLes photos restent dans Médias.`, {title: 'Supprimer le recueil', okLabel: 'Supprimer le recueil'});
                if (!keep) return false;
                const also = await A().confirmBox('Supprimer aussi les photos qui ne servent nulle part ailleurs ?\n\nSinon, elles restent dans Médias.', {title: 'Photos du recueil', okLabel: 'Supprimer aussi les photos', cancelLabel: 'Garder les photos', danger: true});
                const res = await post('delete_recueil', {id: r.id, delete_media: also});
                const out = res.result || res;
                toast(also ? `Recueil supprimé (${plural(out.media_deleted, 'photo supprimée', 'photos supprimées')}, ${plural(out.media_kept, 'gardée', 'gardées')} car utilisées ailleurs).` : 'Recueil supprimé : les photos sont toujours dans Médias.');
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
                <div class="page-actions"><button type="button" class="button secondary" data-rc-cover title="Choisir l’image de couverture du recueil">🖼️ Couverture</button><button type="button" class="button secondary" data-rc-edit>Modifier</button><button type="button" class="button" data-rc-add>+ Ajouter des photos</button></div></header>
            <div class="h-rc-tabs segmented">${tabs.map(([k, icon, label, n]) => `<button type="button" class="${s.tab === k ? 'is-active' : ''}" data-rc-tab="${k}">${icon} ${label}${n !== '' ? ` <small>${n}</small>` : ''}</button>`).join('')}
                <span class="h-rc-tabs-info muted">${plural(D.pages.length, 'page', 'pages')} · ${pct} % transcrit${loose().length ? ` · <button type="button" class="link-button h-rc-warn" data-rc-goloose>${plural(loose().length, 'photo à ranger', 'photos à ranger')}</button>` : ''}</span></div>
            <div class="h-rc-body"></div></section>`;
        const sec = ws.querySelector('.h-rc-one');
        sec.querySelector('[data-rc-back]').addEventListener('click', () => { Object.assign(s, {id: 0, page: 0}); ext.lists.recueils(++S().workspaceToken); });
        sec.querySelector('[data-rc-edit]').addEventListener('click', () => recueilDialog(D.recueil));
        sec.querySelector('[data-rc-cover]').addEventListener('click', () => coverDialog());
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
        const tableText = p => p.table ? p.table.rows.map(r => Object.values(r.c || {}).join(' ')).join(' ') : '';
        const pages = q ? D.pages.filter(p => (p.label + ' ' + p.transcription + ' ' + p.notes + ' ' + tableText(p)).toLowerCase().includes(q)) : D.pages;
        const ls = loose();
        body.innerHTML = `<div class="collection-toolbar h-rc-toolbar"><input type="search" data-rc-q2 value="${esc(s.q || '')}" placeholder="Chercher dans les transcriptions, les noms de page…">
                <span class="segmented"><button type="button" class="${s.view !== 'table' ? 'is-active' : ''}" data-rc-view="grid">▦ Mosaïque</button><button type="button" class="${s.view === 'table' ? 'is-active' : ''}" data-rc-view="table">☰ Tableau</button></span>
                <button type="button" class="button small secondary" data-rc-newpage>+ Page sans photo</button></div>
            ${ls.length || trays().length ? looseHtml(ls) : ''}
            ${!D.pages.length ? A().emptyState({icon: '📄', text: 'Aucune page pour l’instant', hint: 'Chaque photo devient une page, dans l’ordre.', action: {label: '＋ Ajouter des photos', attrs: 'data-rc-add-empty'}}) :
            s.view === 'table' ? `<div class="data-table-wrap"><table class="data-table h-rc-table"><thead><tr><th>N°</th><th>Page</th>${D.versions.map(v => `<th>${esc(v.name)}</th>`).join('')}<th>Transcription</th></tr></thead><tbody>${pages.map(p => {
                const imgs = pageImages(p.id);
                return `<tr data-rc-row="${p.id}"><td>${p.num}</td><td><button type="button" class="table-link" data-rc-open="${p.id}">${esc(p.label || 'Page ' + p.num)}</button></td>${D.versions.map(v => `<td>${imgs.filter(i => i.version_id === v.id).map(i => `<button type="button" class="h-rc-thumb tiny ${i.id === p.shown_image_id ? 'is-best' : ''}" data-rc-open="${p.id}" data-rc-image="${i.id}" title="${i.role === 'detail' ? 'Détail' : 'Page'}${i.id === p.shown_image_id ? ' · image retenue' : ''}"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy">${i.role === 'detail' ? '<em>🔍</em>' : ''}</button>`).join('') || '<span class="muted">—</span>'}</td>`).join('')}<td class="h-rc-excerpt">${esc(excerpt(p.transcription)) || '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`
            : `<p class="muted h-rc-hint">Clique sur une page pour l’ouvrir et la transcrire ; glisse-la pour changer l’ordre.</p><div class="h-rc-pages">${pages.map(pageCard).join('')}</div>`}`;
        let timer = 0;
        body.querySelector('[data-rc-q2]').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { s.q = e.target.value.trim(); paintPages(body); const i = body.querySelector('[data-rc-q2]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
        body.querySelectorAll('[data-rc-view]').forEach(b => b.addEventListener('click', () => { s.view = b.dataset.rcView; paintPages(body); }));
        body.querySelector('[data-rc-newpage]').addEventListener('click', async () => { const r = await run('save_recueil_page', {recueil_id: D.recueil.id}); if (r) { s.page = r.id; paint(); } });
        body.querySelector('[data-rc-add-empty]')?.addEventListener('click', () => addPhotosDialog());
        body.querySelectorAll('[data-rc-page],[data-rc-open]').forEach(b => b.addEventListener('click', () => { s.page = Number(b.dataset.rcPage || b.dataset.rcOpen); s.image = Number(b.dataset.rcImage || 0); s.compare = 0; paint(); }));
        body.querySelectorAll('[data-rc-zoom]').forEach(b => b.addEventListener('click', () => openViewer([imgById(b.dataset.rcZoom)], 0)));
        bindLoose(body);
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
    /** Liste de choix d'une page : « à ranger », pages existantes, nouvelle page (au début, après une page, à la fin). */
    function pageSelect(attr, current, withPlaceholder = false) {
        const cur = pageById(current);
        return `<select ${attr}>${withPlaceholder ? '<option value="">Mettre sur la page…</option>' : ''}<option value="0" ${!current && !withPlaceholder ? 'selected' : ''}>🧺 À ranger (sans page)</option>
            ${D.pages.length ? `<optgroup label="Mettre sur la page">${D.pages.map(p => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${esc(pageName(p))}</option>`).join('')}</optgroup>` : ''}
            <optgroup label="Créer une nouvelle page"><option value="new:start">＋ Nouvelle page au début</option>${cur ? `<option value="new:after:${cur.id}">＋ Nouvelle page juste après celle-ci</option>` : ''}${D.pages.length ? '<option value="new:pick">＋ Nouvelle page après la page…</option>' : ''}<option value="new:end">＋ Nouvelle page à la fin</option></optgroup></select>`;
    }
    /** Valeur de pageSelect → {page_id, after_page} pour update_recueil_image (null : annulé). « après la page… » demande laquelle. */
    async function pageTarget(v) {
        if (v === '' || v == null) return null;
        if (v === 'new:start') return {page_id: -2};
        if (v === 'new:end') return {page_id: -1, after_page: 0};
        if (v.startsWith('new:after:')) return {page_id: -1, after_page: Number(v.slice(10))};
        if (v === 'new:pick') return new Promise(resolve => {
            let done = false;
            const end = val => { if (!done) { done = true; resolve(val); } };
            dialog({eyebrow: 'NOUVELLE PAGE', title: 'Créer la nouvelle page après…', submitLabel: 'Créer la page ici',
                body: `<label>Après la page<select name="after">${D.pages.map(p => `<option value="${p.id}">${esc(pageName(p))}</option>`).join('')}</select></label>`,
                onOpen: dl => dl.addEventListener('close', () => setTimeout(() => end(null), 0), {once: true}),
                onSubmit: form => end({page_id: -1, after_page: Number(form.querySelector('[name=after]').value)}),
            });
        });
        return {page_id: Number(v)};
    }

    /* ─── « À ranger » : dossiers de premier tri ─── */
    const trays = () => Array.isArray(D.recueil.trays) ? D.recueil.trays : [];
    const openTrays = () => (st().openTrays ||= {});
    const picked = () => (st().picked ||= new Set());
    function looseItem(i) {
        const ts = trays(), on = picked().has(i.id);
        return `<div class="h-rc-loose-item ${on ? 'is-picked' : ''}" data-rc-img="${i.id}" draggable="true">
            <label class="h-rc-pick" title="Choisir plusieurs photos pour les ranger d’un coup"><input type="checkbox" data-rc-check ${on ? 'checked' : ''}></label>
            <button type="button" class="h-rc-thumb small" data-rc-zoom="${i.id}" title="Voir en grand"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy"></button>
            <small>${esc(versionById(i.version_id)?.name || '')}</small>
            <select data-rc-trayset title="Dossier de tri"><option value="">📂 Sans dossier</option>${ts.map(t => `<option value="${esc(t)}" ${t === i.tray ? 'selected' : ''}>📁 ${esc(t)}</option>`).join('')}<option value="__new">＋ Nouveau dossier…</option></select>
            ${pageSelect('data-rc-assign', 0, true)}</div>`;
    }
    function looseHtml(ls) {
        const ts = trays(), o = openTrays(), groups = new Map(ts.map(t => [t, []])), none = [];
        ls.forEach(i => (groups.get(i.tray) || none).push(i));
        const n = [...picked()].filter(id => ls.some(i => i.id === id)).length;
        const tray = (name, list, k) => `<details class="h-rc-tray" data-rc-tray="${esc(name)}" ${o[name] ? 'open' : ''}><summary draggable="true" title="Glisser pour changer l’ordre des dossiers"><span class="h-rc-tray-grip" aria-hidden="true">⠿</span><span class="h-rc-tray-name">📁 ${esc(name)}</span> <small class="muted">${plural(list.length, 'photo', 'photos')}</small>
                <span class="h-rc-tray-tools">${ts.length > 1 ? `<button type="button" class="icon-button" data-rc-traymove="-1" ${k ? '' : 'disabled'} title="Monter le dossier">↑</button><button type="button" class="icon-button" data-rc-traymove="1" ${k < ts.length - 1 ? '' : 'disabled'} title="Descendre le dossier">↓</button>` : ''}<button type="button" class="icon-button" data-rc-trayren="${esc(name)}" title="Renommer le dossier">✎</button><button type="button" class="icon-button" data-rc-traydel="${esc(name)}" title="Supprimer le dossier (ses photos restent à ranger)">🗑</button></span></summary>
                <div class="h-rc-loose-list">${list.map(looseItem).join('') || '<p class="muted">Vide : glisse des photos ici, ou choisis ce dossier sous une photo.</p>'}</div></details>`;
        return `<div class="h-rc-loose maintenance-panel"><div class="h-rc-loose-head"><h3>🧺 À ranger <small class="muted">${plural(ls.length, 'photo', 'photos')} sans page${ts.length ? ' · trie-les d’abord dans des dossiers, puis choisis leur page' : ' : choisis sa page'}</small></h3>
                <span class="h-rc-loose-tools"><button type="button" class="button small secondary" data-rc-traynew>+ Dossier</button>${ls.length ? `<button type="button" class="button small secondary" data-rc-pickall>${n ? 'Tout décocher' : 'Tout cocher'}</button>` : ''}</span></div>
            ${n ? `<div class="h-rc-bulk"><strong>${plural(n, 'photo choisie', 'photos choisies')}</strong>
                <label>Mettre dans <select data-rc-bulktray><option value="">—</option><option value="__none">📂 Sans dossier</option>${ts.map(t => `<option value="${esc(t)}">📁 ${esc(t)}</option>`).join('')}<option value="__new">＋ Nouveau dossier…</option></select></label>
                <label>Mettre sur ${pageSelect('data-rc-bulkpage', 0, true)}</label><small class="muted">Une nouvelle page = une page par photo, dans l’ordre.</small></div>` : ''}
            ${ts.map((t, k) => tray(t, groups.get(t), k)).join('')}
            ${none.length || !ts.length ? `<div class="h-rc-tray-none">${ts.length ? '<h4>📂 Sans dossier</h4>' : ''}<div class="h-rc-loose-list" data-rc-tray-drop="">${none.map(looseItem).join('') || '<p class="muted">Toutes les photos sont dans un dossier.</p>'}</div></div>` : ''}</div>`;
    }
    async function askTrayName(title, value = '') {
        const name = ((await A().askText({title: value ? 'Renommer le dossier' : 'Nouveau dossier', message: title, value, okLabel: value ? 'Renommer' : 'Créer'})) || '').trim().slice(0, 120);
        if (!name) return '';
        if (name !== value && trays().includes(name)) { toast('Ce dossier existe déjà.', 'error'); return ''; }
        return name;
    }
    async function addTray() {
        const name = await askTrayName('Nom du nouveau dossier (ex. « Liste A », « à vérifier », « 1915 ») :');
        if (!name) return '';
        await post('save_recueil_trays', {recueil_id: D.recueil.id, trays: [...trays(), name]});
        D.recueil.trays = [...trays(), name]; openTrays()[name] = true;
        return name;
    }
    function bindLoose(body) {
        const box = body.querySelector('.h-rc-loose');
        if (!box) return;
        const imgId = el => Number(el.closest('[data-rc-img]').dataset.rcImg);
        const setTray = async (ids, tray) => { try { for (const id of ids) await post('update_recueil_image', {id, tray}); } catch (e) { toast(e.message, 'error'); } if (tray) openTrays()[tray] = true; await reload(); };
        /** Pose les photos sur la cible ; une nouvelle page = une page par photo, l'une après l'autre. */
        const place = async (ids, t) => {
            let after = t.after_page, first = true;
            try {
                for (const id of ids) {
                    const body = t.page_id >= 0 ? {id, page_id: t.page_id} : first ? {id, ...t} : {id, page_id: -1, after_page: after};
                    const r = await post('update_recueil_image', body); const res = r.result || r;
                    if (t.page_id < 0) { after = res.page_id; first = false; }
                    picked().delete(id);
                }
                toast(ids.length > 1 ? `${ids.length} photos rangées.` : 'Photo rangée.');
            } catch (e) { toast(e.message, 'error'); }
            await reload();
        };
        box.querySelectorAll('details[data-rc-tray]').forEach(d => d.addEventListener('toggle', () => { openTrays()[d.dataset.rcTray] = d.open; }));
        box.querySelector('[data-rc-traynew]').addEventListener('click', async () => { if (await addTray()) paint(); });
        box.querySelector('[data-rc-pickall]')?.addEventListener('click', () => { const ids = loose().map(i => i.id); if (ids.some(id => picked().has(id))) picked().clear(); else ids.forEach(id => picked().add(id)); paint(); });
        box.querySelectorAll('[data-rc-trayren]').forEach(b => b.addEventListener('click', async e => { e.preventDefault(); const from = b.dataset.rcTrayren, to = await askTrayName('Nouveau nom du dossier :', from); if (!to || to === from) return;
            openTrays()[to] = openTrays()[from]; await run('save_recueil_trays', {recueil_id: D.recueil.id, trays: trays().map(t => t === from ? to : t), rename: {from, to}}, 'Dossier renommé.'); }));
        box.querySelectorAll('[data-rc-traydel]').forEach(b => b.addEventListener('click', async e => { e.preventDefault(); const name = b.dataset.rcTraydel; if (!await A().confirmBox(`Supprimer le dossier « ${name} » ?\n\nSes photos restent « à ranger », sans dossier.`, {title: 'Supprimer le dossier', okLabel: 'Supprimer le dossier'})) return;
            await run('save_recueil_trays', {recueil_id: D.recueil.id, trays: trays().filter(t => t !== name)}, 'Dossier supprimé.'); }));
        const saveOrder = list => run('save_recueil_trays', {recueil_id: D.recueil.id, trays: list});
        box.querySelectorAll('[data-rc-traymove]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const name = b.closest('[data-rc-tray]').dataset.rcTray, list = [...trays()], i = list.indexOf(name), j = i + Number(b.dataset.rcTraymove);
            if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; saveOrder(list); }));
        box.querySelectorAll('[data-rc-check]').forEach(c => c.addEventListener('change', () => { const id = imgId(c); if (c.checked) picked().add(id); else picked().delete(id); paint(); }));
        box.querySelectorAll('[data-rc-trayset]').forEach(sel => sel.addEventListener('change', async () => { let t = sel.value; if (t === '__new') { t = await addTray(); if (!t) { paint(); return; } } setTray([imgId(sel)], t); }));
        box.querySelectorAll('[data-rc-assign]').forEach(sel => sel.addEventListener('change', async () => { const t = await pageTarget(sel.value); if (!t) { sel.value = ''; return; } place([imgId(sel)], t); }));
        const chosen = () => loose().filter(i => picked().has(i.id)).map(i => i.id);
        box.querySelector('[data-rc-bulktray]')?.addEventListener('change', async e => { let t = e.target.value; if (!t) return; if (t === '__new') { t = await addTray(); if (!t) { paint(); return; } } const ids = chosen(); picked().clear(); setTray(ids, t === '__none' ? '' : t); });
        box.querySelector('[data-rc-bulkpage]')?.addEventListener('change', async e => { const t = await pageTarget(e.target.value); if (!t) { e.target.value = ''; return; } place(chosen(), t); });
        // Glisser une photo (ou la sélection) sur un dossier
        let dragIds = [], dragTray = null;
        box.querySelectorAll('details[data-rc-tray] > summary').forEach(sm => {
            sm.addEventListener('dragstart', e => { dragTray = sm.parentElement.dataset.rcTray; dragIds = []; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'rc-tray'); sm.parentElement.classList.add('is-dragging'); });
            sm.addEventListener('dragend', () => { sm.parentElement.classList.remove('is-dragging'); dragTray = null; });
        });
        box.querySelectorAll('.h-rc-loose-item').forEach(it => it.addEventListener('dragstart', e => { e.stopPropagation(); dragTray = null; const id = Number(it.dataset.rcImg); dragIds = picked().has(id) ? chosen() : [id]; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'rc-img'); }));
        box.querySelectorAll('details[data-rc-tray], [data-rc-tray-drop]').forEach(z => {
            z.addEventListener('dragover', e => { if (dragIds.length || (dragTray && z.dataset.rcTray && z.dataset.rcTray !== dragTray)) { e.preventDefault(); z.classList.add(dragTray ? 'is-drop-tray' : 'is-drop'); } });
            z.addEventListener('dragleave', () => z.classList.remove('is-drop', 'is-drop-tray'));
            z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('is-drop', 'is-drop-tray');
                if (dragTray) { const from = dragTray, to = z.dataset.rcTray; dragTray = null; if (!to || to === from) return; const list = trays().filter(t => t !== from); const i = trays().indexOf(from) < trays().indexOf(to) ? list.indexOf(to) + 1 : list.indexOf(to); list.splice(i, 0, from); saveOrder(list); return; }
                if (!dragIds.length) return; const ids = dragIds; dragIds = []; ids.forEach(id => picked().delete(id)); setTray(ids, z.dataset.rcTray ?? ''); });
        });
    }

    /* ─── Une page ─── */
    function paintPage(body) {
        const s = st(), p = pageById(s.page), idx = D.pages.indexOf(p), imgs = pageImages(p.id);
        let cur = imgById(s.image) && imgs.some(i => i.id === s.image) ? imgById(s.image) : imgById(p.shown_image_id) || imgs[0] || null;
        const cmp = s.compare && imgs.some(i => i.id === s.compare) ? imgById(s.compare) : null;
        const prev = D.pages[idx - 1], next = D.pages[idx + 1];
        const stage = i => i ? `<figure class="h-rc-figure"><img src="${esc(fullUrl(i))}" alt="" data-rc-zoom="${i.id}" title="Cliquer : agrandir, pivoter, retoucher"><figcaption>${esc(versionById(i.version_id)?.name || '')}${i.role === 'detail' ? ' · 🔍 détail' : ''}${i.id === p.best_image_id ? ' · ⭐ retenue' : i.id === p.shown_image_id ? ' · montrée (la plus récente)' : ''}</figcaption></figure>` : '';
        body.innerHTML = `<div class="h-rc-pagebar"><button type="button" class="button small secondary" data-rc-allpages>▦ Toutes les pages</button>
                <span class="h-rc-pagenav"><button type="button" class="button small secondary" data-rc-go="${prev?.id || ''}" ${prev ? '' : 'disabled'} title="Page précédente" data-shortcut="⌥←">‹</button>
                <select data-rc-jump>${D.pages.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(pageName(x))}</option>`).join('')}</select>
                <button type="button" class="button small secondary" data-rc-go="${next?.id || ''}" ${next ? '' : 'disabled'} title="Page suivante" data-shortcut="⌥→">›</button></span>
                <span class="muted">${p.num} / ${D.pages.length}</span></div>
            <div class="h-rc-pageview">
                <div class="h-rc-stage-wrap">
                    <div class="h-rc-stage ${cmp ? 'is-compare' : ''}">${imgs.length > 1 && !cmp && cur ? `<button type="button" class="h-rc-imgnav is-prev" data-rc-imgstep="-1" title="Image précédente de cette page" data-shortcut="←">‹</button><button type="button" class="h-rc-imgnav is-next" data-rc-imgstep="1" title="Image suivante de cette page" data-shortcut="→">›</button><span class="h-rc-imgcount">${imgs.indexOf(cur) + 1} / ${imgs.length}</span>` : ''}${cur ? stage(cur) + (cmp ? stage(cmp) : '') : `<div class="h-rc-nophoto big">Pas de photo pour cette page.<br><button type="button" class="button small" data-rc-addhere>+ Ajouter une photo de cette page</button></div>`}</div>
                    ${cur ? `<div class="h-rc-imgactions">
                        ${p.best_image_id === cur.id ? '<span class="h-rc-kept">⭐ Image retenue pour cette page</span>' : `<button type="button" class="button small" data-rc-best="${cur.id}" title="C’est elle qu’on voit dans la mosaïque, le résumé et les fiches">⭐ Garder celle-ci</button>`}
                        <button type="button" class="button small secondary" data-rc-zoom="${cur.id}">🔍 Agrandir, pivoter, retoucher</button>
                        ${ext.openAssembler ? `<button type="button" class="button small secondary" data-rc-assemble title="Mettre ensemble les photos de cette page (morceaux, zoom…) : le résultat devient l’image retenue">🧩 Assembler</button>` : ''}
                        ${imgs.length > 1 ? `<button type="button" class="button small secondary" data-rc-compare="${cmp ? 0 : (imgs.find(i => i.id !== cur.id)?.id || 0)}">${cmp ? '✕ Fin de la comparaison' : '⇄ Comparer côte à côte'}</button>` : ''}
                        <button type="button" class="button small secondary" data-rc-role="${cur.id}">${cur.role === 'detail' ? '📄 C’est la page entière' : '🔍 C’est un détail (zoom)'}</button>
                        <button type="button" class="button small secondary" data-rc-linkimg title="Rattacher juste cette image à une fiche (ses médias ou un bloc), une enquête, une battue, l’Atelier, un village">🔗 Rattacher cette image…</button>
                        <label class="h-rc-move">Déplacer vers ${pageSelect('data-rc-moveimg', p.id)}</label>
                        <button type="button" class="icon-button danger" data-rc-remove="${cur.id}" title="Retirer cette photo du recueil (elle reste dans Médias)">🗑</button></div>` : ''}
                    ${cur ? '<p class="h-rc-owners muted" data-rc-owners></p>' : ''}
                    <div class="h-rc-strip">${imgs.map(i => `<button type="button" class="h-rc-thumb ${i.id === cur?.id ? 'is-current' : ''} ${i.id === cmp?.id ? 'is-compare' : ''}" data-rc-pick="${i.id}" title="${esc(versionById(i.version_id)?.name || '')}${i.role === 'detail' ? ' · détail' : ''}"><img src="${esc(thumbUrl(i))}" alt="" loading="lazy"><small>${esc(versionById(i.version_id)?.name || '')}</small>${i.role === 'detail' ? '<em>🔍</em>' : ''}${i.id === p.best_image_id ? '<b>⭐</b>' : ''}</button>`).join('')}
                        <button type="button" class="h-rc-thumb h-rc-addthumb" data-rc-addhere title="Ajouter une photo de cette page (autre version, détail…)">＋</button></div>
                </div>
                <div class="h-rc-side">
                    <label>Nom de la page <small class="muted">(facultatif)</small><input data-rc-field="label" value="${esc(p.label)}" placeholder="f° 12 r°, page 3, lettre B…"></label>
                    <label class="h-rc-trans">Transcription <span class="h-rc-saved muted" data-rc-saved></span><textarea data-rc-field="transcription" rows="16" placeholder="Recopie ici ce qui est écrit sur la page (une ligne par ligne du document)…">${esc(p.transcription)}</textarea></label>
                    ${cur?.media_transcription && !p.transcription.trim() ? `<button type="button" class="link-button" data-rc-usemedia>↧ Reprendre la transcription déjà faite sur cette photo</button>` : ''}
                    <button type="button" class="link-button h-rc-totable" data-rc-totable>📊 ${p.table ? 'Voir le tableau de la page' : 'Une liste à transposer ? Faire un tableau'} ↓</button>
                    <label>Notes<textarea data-rc-field="notes" rows="4" placeholder="Abréviations, mots incertains, ce qu’il reste à vérifier…">${esc(p.notes)}</textarea></label>
                    <div class="h-rc-sideactions"><button type="button" class="button small secondary" data-rc-pagemove="-1" ${idx ? '' : 'disabled'}>↑ Avancer la page</button><button type="button" class="button small secondary" data-rc-pagemove="1" ${next ? '' : 'disabled'}>↓ Reculer la page</button><button type="button" class="button small secondary" data-rc-insert>+ Page après</button><button type="button" class="button small secondary" data-rc-linkpage title="Rattacher cette page à une fiche, un village, une enquête, un projet de l’Atelier, une battue">🔗 Rattacher la page…</button><button type="button" class="button small secondary danger" data-rc-delpage>Supprimer la page</button></div>
                    ${(() => { const ls = D.links.filter(l => l.from_num ? p.num >= l.from_num && p.num <= (l.to_num || l.from_num) : true); const chips = [...new Set(ls.map(l => `<span class="h-rc-chip">${esc(l.type_label)} · ${esc(l.label)}${l.from_num ? '' : ' <small>(tout le recueil)</small>'}</span>`))]; return chips.length ? `<p class="h-rc-pagelinks"><b>🔗 Cette page est rattachée à :</b> ${chips.join(' ')}</p>` : ''; })()}
                    <p class="muted h-rc-hint">Supprimer une page ne supprime pas ses photos : elles passent « à ranger ».</p>
                </div></div>
            <details class="h-rc-tablebox maintenance-panel" data-rc-tablebox ${p.table || s.tableOpen ? 'open' : ''}><summary><b>📊 Tableau de la page</b> <small class="muted">${p.table ? plural(p.table.rows?.length || 0, 'ligne', 'lignes') + ' · ' + plural(p.table.cols?.length || 0, 'colonne', 'colonnes') : 'pour transposer une liste (noms, âges, lieux…) ligne par ligne'}</small> <span class="h-rc-saved muted" data-rc-tsaved></span></summary>
                <div data-rc-table>${p.table ? '' : '<p class="muted">Pas encore de tableau sur cette page.</p><button type="button" class="button small" data-rc-tnew>📊 Créer le tableau</button>'}</div></details>`;
        const go = id => { if (!id) return; s.page = Number(id); s.image = 0; s.compare = 0; paint(); };
        bindPageTable(body, p);
        body.querySelector('[data-rc-totable]')?.addEventListener('click', () => { const tb = body.querySelector('[data-rc-tablebox]'); tb.open = true; tb.scrollIntoView({behavior: 'smooth', block: 'start'}); });
        body.querySelector('[data-rc-allpages]').addEventListener('click', () => { s.page = 0; paint(); });
        body.querySelectorAll('[data-rc-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.rcGo)));
        body.querySelector('[data-rc-jump]').addEventListener('change', e => go(e.target.value));
        body.querySelectorAll('[data-rc-pick]').forEach(b => b.addEventListener('click', () => { const id = Number(b.dataset.rcPick); if (s.compare) s.compare = id === s.image ? 0 : id; else s.image = id; paint(); }));
        body.querySelectorAll('[data-rc-zoom]').forEach(b => b.addEventListener('click', () => { const list = imgs.length ? imgs : [imgById(b.dataset.rcZoom)]; openViewer(list, Math.max(0, list.findIndex(i => i.id === Number(b.dataset.rcZoom)))); }));
        body.querySelector('[data-rc-best]')?.addEventListener('click', e => run('save_recueil_page', {id: p.id, best_image_id: Number(e.currentTarget.dataset.rcBest)}, 'Image retenue pour cette page.'));
        body.querySelector('[data-rc-compare]')?.addEventListener('click', e => { s.image = cur.id; s.compare = Number(e.currentTarget.dataset.rcCompare); paint(); });
        body.querySelector('[data-rc-assemble]')?.addEventListener('click', () => ext.openAssembler(imgs.map(i => ({id: i.media_id, filename: i.filename, title: i.title})), {onSaved: async mediaId => {
            const vid = cur.version_id;
            await post('recueil_add_images', {recueil_id: D.recueil.id, version_id: vid, media_ids: [mediaId], mode: 'loose'});
            await load(D.recueil.id);
            const img = D.images.find(i => i.media_id === mediaId && !i.page_id);
            if (img) { await post('update_recueil_image', {id: img.id, page_id: p.id}); await post('save_recueil_page', {id: p.id, best_image_id: img.id}); s.image = img.id; }
            bust = Date.now(); await reload(); toast('Assemblage posé sur la page et retenu (⭐).');
        }}));
        body.querySelector('[data-rc-role]')?.addEventListener('click', () => run('update_recueil_image', {id: cur.id, role: cur.role === 'detail' ? 'page' : 'detail'}));
        body.querySelector('[data-rc-moveimg]')?.addEventListener('change', async e => { const t = await pageTarget(e.target.value); if (!t || t.page_id === p.id) { e.target.value = String(p.id); return; } const r = await run('update_recueil_image', {id: cur.id, ...t}, t.page_id === 0 ? 'Photo mise « à ranger ».' : 'Photo déplacée.'); if (r) { s.image = 0; paint(); } });
        body.querySelector('[data-rc-remove]')?.addEventListener('click', async () => { if (await A().confirmBox('Retirer cette photo du recueil ? Elle reste dans Médias.', {title: 'Retirer la photo', okLabel: 'Retirer la photo'})) { s.image = 0; run('remove_recueil_image', {id: cur.id}, 'Photo retirée du recueil.'); } });
        body.querySelectorAll('[data-rc-addhere]').forEach(b => b.addEventListener('click', () => addPhotosDialog({pageId: p.id})));
        body.querySelectorAll('[data-rc-pagemove]').forEach(b => b.addEventListener('click', () => run('save_recueil_page', {id: p.id, move: Number(b.dataset.rcPagemove)})));
        const stepImg = d => { if (imgs.length < 2 || !cur) return; const i = imgs.indexOf(cur); s.image = imgs[(i + d + imgs.length) % imgs.length].id; s.compare = 0; paint(); };
        body.querySelectorAll('[data-rc-imgstep]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); stepImg(Number(b.dataset.rcImgstep)); }));
        body.querySelector('[data-rc-linkimg]')?.addEventListener('click', () => pageLinkDialog({page: p, image: cur, scope: 'image'}));
        body.querySelector('[data-rc-linkpage]').addEventListener('click', () => pageLinkDialog({page: p, image: cur, scope: 'page'}));
        const ownersBox = body.querySelector('[data-rc-owners]');
        if (ownersBox && cur) get('recueil_media_owners', {media_id: cur.media_id}).then(r => { if (!ownersBox.isConnected) return; const o = r.owners || []; ownersBox.innerHTML = o.length ? `🔗 Cette image est aussi : ${o.map(x => `<span class="h-rc-chip">${esc(x.label)}${x.name ? ' · ' + esc(x.name) : ''}</span>`).join(' ')}` : ''; }).catch(() => {});
        body.querySelector('[data-rc-insert]').addEventListener('click', async () => { const r = await run('save_recueil_page', {recueil_id: D.recueil.id, after: p.id}); if (r) go(r.id); });
        body.querySelector('[data-rc-delpage]').addEventListener('click', async () => { if (!await A().confirmBox(`Supprimer la ${pageName(p)} ?${imgs.length ? `\n\n${imgs.length > 1 ? `Ses ${imgs.length} photos passent` : 'Sa photo passe'} « à ranger ».` : ''}${p.transcription.trim() ? '\n\nSa transcription sera perdue.' : ''}`, {title: 'Supprimer la page', okLabel: 'Supprimer la page'})) return; s.page = (next || prev)?.id || 0; await run('delete_recueil_page', {id: p.id}, 'Page supprimée.'); });
        // Enregistrement au fil de la frappe
        const saved = body.querySelector('[data-rc-saved]');
        let timer = 0, pending = {};
        const flush = async () => { const data = pending; pending = {}; if (!Object.keys(data).length) return; try { await post('save_recueil_page', {id: p.id, ...data}); Object.assign(p, data); saved.textContent = '✓ enregistré'; } catch (e) { saved.textContent = ''; toast(e.message, 'error'); } };
        body.querySelectorAll('[data-rc-field]').forEach(el => el.addEventListener('input', () => { pending[el.dataset.rcField] = el.value; saved.textContent = '…'; clearTimeout(timer); timer = setTimeout(flush, 700); }));
        body.querySelectorAll('[data-rc-field]').forEach(el => el.addEventListener('blur', () => { clearTimeout(timer); flush(); }));
        body.querySelector('[data-rc-usemedia]')?.addEventListener('click', () => { const t = body.querySelector('[data-rc-field=transcription]'); t.value = cur.media_transcription; t.dispatchEvent(new Event('input')); });
        // Alt + ← → : page précédente / suivante
        const keys = e => { if (!body.isConnected) return document.removeEventListener('keydown', keys); if (e.target.closest('textarea, input, select, [contenteditable]') || document.querySelector('dialog[open]')) return; if (!e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { if (imgs.length > 1) { e.preventDefault(); flush(); stepImg(e.key === 'ArrowLeft' ? -1 : 1); } return; } if (!e.altKey) return; if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); flush(); go(prev.id); } if (e.key === 'ArrowRight' && next) { e.preventDefault(); flush(); go(next.id); } };
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

    /* ─── Tableau d'une page (heritage-recueil-table.js) : enregistré au fil de la frappe ; une ligne peut aller dans une fiche ─── */
    function bindPageTable(body, p) {
        const tb = body.querySelector('[data-rc-tablebox]'), host = body.querySelector('[data-rc-table]'), saved = body.querySelector('[data-rc-tsaved]');
        if (!tb || !ext.recueilTable) return;
        tb.addEventListener('toggle', () => { st().tableOpen = tb.open; });
        let timer = 0;
        const rowNote = (t, r) => `Ligne ${t.rows.indexOf(r) + 1} : ${ext.recueilTableRowText(t, r) || '(vide)'}`;
        const flush = async t => {
            try {
                await post('save_recueil_page', {id: p.id, table: t}); p.table = t; saved.textContent = '✓ enregistré';
                // la note du rattachement suit le texte de la ligne
                for (const r of t.rows) if (r.person?.link) { const note = rowNote(t, r); if (r._note !== note) { r._note = note; await post('save_recueil_link', {id: r.person.link, recueil_id: D.recueil.id, entity_type: 'person', entity_key: String(r.person.id), page_from: p.id, page_to: p.id, note}).catch(() => {}); } }
            } catch (e) { saved.textContent = '⚠ ' + e.message; }
        };
        const start = t => {
            t.rows.forEach(r => { if (r.person) r._note = rowNote(t, r); });
            host.innerHTML = '';
            ext.recueilTable(host, t, {
                onChange: tt => { saved.textContent = '…'; clearTimeout(timer); timer = setTimeout(() => flush(tt), 700); },
                onPerson: (row, mode) => mode === 'pick' ? pickRowPerson(t, row, p) : row.person?.link ? post('delete_recueil_link', {id: row.person.link}).then(() => { delete row.person; toast('Ligne détachée de la fiche.'); }).catch(e => toast(e.message, 'error')) : Promise.resolve(),
                onOpenPerson: per => { clearTimeout(timer); flush(t); S().currentPersonId = per.id; A().setModule('personnes'); },
            });
        };
        if (p.table) start(p.table);
        host.querySelector('[data-rc-tnew]')?.addEventListener('click', () => { const t = ext.recueilTableNew(); start(t); flush(t); });
    }
    /** Rattacher une ligne du tableau à une fiche : elle apparaît dans le bloc « Recueils » de la personne. */
    function pickRowPerson(t, row, p) {
        return new Promise(resolve => {
            let done = false; const end = v => { if (!done) { done = true; resolve(v); } };
            const guess = t.cols.map(c => (row.c[c.id] || '').trim()).filter(v => /\p{L}{2}/u.test(v)).slice(0, 2).join(' ');
            let picker = null;
            dialog({eyebrow: 'LIGNE ' + (t.rows.indexOf(row) + 1), title: 'Rattacher cette ligne à une fiche', submitLabel: 'Rattacher',
                body: `<p class="muted">${esc(ext.recueilTableRowText(t, row) || 'Ligne vide')}</p>` + ext.personPickerHtml({guess}),
                onOpen: d => { d.addEventListener('close', () => setTimeout(() => end(false), 0), {once: true}); picker = ext.bindPersonPicker(d); },
                onSubmit: async () => {
                    const o = picker.selected();
                    if (!o) { toast('Choisis la personne dans la liste.', 'error'); return false; }
                    const note = `Ligne ${t.rows.indexOf(row) + 1} : ${ext.recueilTableRowText(t, row) || '(vide)'}`;
                    const res = await post('save_recueil_link', {recueil_id: D.recueil.id, entity_type: 'person', entity_key: o.key, page_from: p.id, page_to: p.id, note});
                    row.person = {id: Number(o.key), name: o.label, link: (res.result || res).id}; row._note = note;
                    toast(`Ligne rattachée à ${row.person.name} : elle apparaît dans le bloc « Recueils » de sa fiche.`);
                    end(true);
                },
            });
        });
    }

    /* ─── Couverture : une photo du recueil, une image de Médias, ou une image envoyée exprès ─── */
    function coverDialog() {
        const r = D.recueil, cur = r.cover;
        const shown = D.pages.map(p => imgById(p.shown_image_id)).filter(Boolean);
        const others = D.images.filter(i => !shown.includes(i));
        const tile = (mid, url, title, sel) => `<button type="button" class="h-rc-thumb h-rc-covpick ${sel ? 'is-current' : ''}" data-rc-covmid="${mid}" title="${esc(title)}"><img src="${esc(url)}" alt="" loading="lazy"></button>`;
        const save = async mid => { await post('save_recueil', {...r, cover_media_id: mid || 0}); toast(mid ? 'Couverture choisie.' : 'La couverture redevient la première page.'); await reload(); };
        const dl = dialog({eyebrow: 'RECUEIL', title: 'Image de couverture', wide: true,
            body: `<div class="h-rc-covnow">${cur ? `<img src="${esc(thumbUrl(cur))}" alt="">` : `<span class="h-rc-cover-empty">${esc(r.icon || '📚')}</span>`}
                    <p>${cur?.chosen ? '<b>Couverture choisie.</b>' : 'Pour l’instant : <b>la première page</b> (automatique).'}<br><small class="muted">Clique sur une image ci-dessous pour en faire la couverture.</small>${cur?.chosen ? '<br><button type="button" class="link-button" data-rc-covreset>↺ Revenir à la première page</button>' : ''}</p></div>
                <h4>📤 Une image à part, juste pour la couverture</h4>
                <label class="h-rc-drop"><input type="file" accept="image/*" data-rc-covfile><span>📷 Choisir une image sur l’ordinateur</span></label>
                <h4>📚 Une photo du recueil</h4>
                <div class="h-rc-covgrid">${shown.concat(others).map(i => tile(i.media_id, thumbUrl(i), (pageById(i.page_id) ? pageName(pageById(i.page_id)) : 'À ranger') + ' · ' + (versionById(i.version_id)?.name || ''), cur?.chosen && cur.media_id === i.media_id)).join('') || '<p class="muted">Pas encore de photo dans le recueil.</p>'}</div>
                <h4>🖼️ Une image déjà dans Médias</h4>
                <input type="search" data-rc-covq placeholder="Chercher par titre, cote… (2 lettres au moins)">
                <div class="h-rc-covgrid" data-rc-covres></div>`,
            onOpen: d => {
                const pick = async mid => { await save(mid); d.close(); };
                const bindTiles = root => root.querySelectorAll('[data-rc-covmid]').forEach(b => b.addEventListener('click', () => pick(Number(b.dataset.rcCovmid))));
                bindTiles(d);
                d.querySelector('[data-rc-covreset]')?.addEventListener('click', () => pick(0));
                d.querySelector('[data-rc-covfile]').addEventListener('change', async e => {
                    const f = e.target.files[0]; if (!f) return;
                    try { const ids = await uploadPhotos(r.id, [f]); if (ids[0]) await pick(ids[0]); } catch (err) { toast(err.message, 'error'); }
                });
                let t = 0; const res = d.querySelector('[data-rc-covres]');
                d.querySelector('[data-rc-covq]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(async () => {
                    const q = e.target.value.trim(); if (q.length < 2) { res.innerHTML = ''; return; }
                    const m = ((await get('heritage_media_search', {q}).catch(() => ({media: []}))).media || []).filter(x => (x.media_type || 'image') === 'image');
                    res.innerHTML = m.map(x => tile(x.id, `media/${encodeURIComponent(x.thumbnail || x.filename)}`, x.title || x.filename, false)).join('') || '<p class="muted">Aucune image trouvée.</p>';
                    bindTiles(res);
                }, 250); });
            }});
        return dl;
    }

    /* ─── Rattacher une page (ou juste une image) à une fiche, un bloc, une enquête, une battue, l'Atelier, un village ─── */
    const LINK_KINDS = [['person', '👤 Une fiche (ses médias ou un de ses blocs)'], ['investigation', '🔍 Une enquête'], ['battue', '🧭 Une battue'], ['atelier_project', '📚 Un projet de l’Atelier'], ['village', '🏘️ Un village'], ['family_booklet', '📘 Un livret de famille'], ['pet', '🐾 Un animal']];
    function pageLinkDialog({page, image, scope = 'page'}) {
        dialog({eyebrow: 'RATTACHER', title: `${D.recueil.title} — ${pageName(page)}`, wide: true, submitLabel: 'Rattacher',
            body: `<fieldset class="h-rc-modes"><legend>Quoi ?</legend>
                    <label class="checkbox-line"><input type="radio" name="scope" value="page" ${scope === 'page' ? 'checked' : ''}> <b>Toute la page</b> <small class="muted">(elle apparaîtra dans « Recueils » de la fiche, du village, de l’enquête…)</small></label>
                    <label class="checkbox-line"><input type="radio" name="scope" value="image" ${scope === 'image' ? 'checked' : ''} ${image ? '' : 'disabled'}> <b>Juste cette image</b> <small class="muted">(elle s’ajoute aux médias de la fiche, à un bloc, aux pièces de l’enquête…)</small></label></fieldset>
                ${image ? `<p class="h-rc-linkthumb"><img src="${esc(thumbUrl(image))}" alt=""> <small class="muted">${esc(versionById(image.version_id)?.name || '')}${image.role === 'detail' ? ' · détail' : ''}</small></p>` : ''}
                <div class="form-grid"><label>À quoi ?<select name="kind">${LINK_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
                    <label>Chercher<input type="search" name="q" placeholder="Nom, titre, commune… (2 lettres au moins)" autocomplete="off"></label></div>
                <label>Résultat<select name="key" size="6" required></select></label>
                <label data-rc-where hidden><span data-rc-wherelabel>Où exactement ?</span><select name="target"></select></label>
                <label>Note <small class="muted">(facultatif)</small><input name="note" placeholder="Il est cité à la ligne 12"></label>`,
            onOpen: d => {
                const $ = sel => d.querySelector(sel), kind = $('[name=kind]'), q = $('[name=q]'), keySel = $('[name=key]'), where = $('[data-rc-where]'), target = $('[name=target]');
                const scopeNow = () => d.querySelector('[name=scope]:checked')?.value || 'page';
                let t = 0, folders = [];
                const fillWhere = async () => {
                    const k = kind.value, key = keySel.value, sc = scopeNow();
                    where.hidden = true; target.innerHTML = ''; target.required = false;
                    if (!key) return;
                    if (sc === 'page' && k !== 'investigation') return;
                    const r = await get('recueil_media_targets', {type: k, key}).catch(() => ({targets: []}));
                    let opts = r.targets || [];
                    if (sc === 'page') { folders = opts.slice(1).map(o => ({id: Number(o.value.split(':')[2]), name: o.label.replace(/^📁 /, '')})); target.innerHTML = folderOptions(folders, null); $('[data-rc-wherelabel]').textContent = 'Où la montrer dans l’enquête ?'; where.hidden = false; return; }
                    if (!opts.length) { target.innerHTML = '<option value="">— rien où la mettre (ex. battue sans recherche) —</option>'; }
                    else target.innerHTML = opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
                    $('[data-rc-wherelabel]').textContent = k === 'person' ? 'Dans les médias de la fiche, ou dans un bloc ?' : k === 'battue' ? 'Quelle recherche de la battue ?' : 'Dans quel dossier ?';
                    target.required = true; where.hidden = false;
                };
                const search = async () => {
                    const v = q.value.trim();
                    if (v.length < 2 && kind.value === 'person') { keySel.innerHTML = ''; fillWhere(); return; }
                    const r = await get('recueil_search', {type: kind.value, q: v}).catch(() => ({results: []}));
                    keySel.innerHTML = (r.results || []).map(x => `<option value="${esc(x.key)}">${esc(x.label)}${x.extra ? ` (${esc(x.extra)})` : ''}</option>`).join('');
                    if (keySel.options.length) keySel.selectedIndex = 0;
                    fillWhere();
                };
                q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
                kind.addEventListener('change', () => { q.value = ''; search(); q.focus(); });
                keySel.addEventListener('change', fillWhere);
                d.querySelectorAll('[name=scope]').forEach(r => r.addEventListener('change', fillWhere));
                search(); setTimeout(() => q.focus(), 50);
            },
            onSubmit: async form => {
                const f = Object.fromEntries(new FormData(form));
                if (!f.key) { toast('Choisis dans la liste à quoi rattacher.', 'error'); return false; }
                if (f.scope === 'image') {
                    if (!f.target) { toast('Choisis où mettre l’image.', 'error'); return false; }
                    const label = form.querySelector('[name=key]').selectedOptions[0]?.textContent || '';
                    const r = await post('recueil_link_media', {media_id: image.media_id, target: f.target, note: f.note, label, title: `${D.recueil.title} — ${pageName(page)}`});
                    toast((r.result || r).already ? 'Cette image y était déjà rattachée.' : 'Image rattachée.');
                } else {
                    await post('save_recueil_link', {recueil_id: D.recueil.id, entity_type: f.kind, entity_key: f.key, page_from: page.id, page_to: page.id, note: f.note, ...(f.kind === 'investigation' ? {folder_id: f.target ?? ''} : {})});
                    toast('Page rattachée.');
                }
                await reload();
            }});
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
                return `<section class="maintenance-panel h-rc-version" data-rc-v="${v.id}"><div class="h-cfg-head"><h3>🗂️ ${esc(v.name)} <small class="muted">${esc(v.date_text || '')} · ${plural(imgs.length, 'photo', 'photos')} · ${plural(covered, 'page', 'pages')} sur ${D.pages.length}</small></h3>
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
            sec.querySelector('[data-rc-vdel]')?.addEventListener('click', async () => { if (await A().confirmBox(`Supprimer la version « ${v.name} » ?\n\nSes photos quittent le recueil (elles restent dans Médias). Les pages et leurs transcriptions restent.`, {title: 'Supprimer la version', okLabel: 'Supprimer la version'})) run('delete_recueil_version', {id: v.id}, 'Version supprimée.'); });
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
        body.querySelectorAll('[data-rc-ldel]').forEach(b => b.addEventListener('click', async () => { if (await A().confirmBox('Détacher ce lien du recueil ?', {title: 'Détacher', okLabel: 'Détacher'})) run('delete_recueil_link', {id: Number(b.dataset.rcLdel)}, 'Détaché.'); }));
        bindEntityOpen(body);
        A().bindTableLinks?.();
    }
    function bindEntityOpen(root) {
        root.querySelectorAll('[data-rc-entity]').forEach(b => b.addEventListener('click', () => {
            const [type, ...rest] = b.dataset.rcEntity.split(':'), key = rest.join(':'), s = S();
            if (type === 'village') { s.listType = 'villages'; s.hVillage = key; A().setModule('listes'); }
            if (type === 'family_booklet') { s.listType = 'family_booklets'; s.hBooklet = Number(key); A().setModule('listes'); }
            if (type === 'pet') { s.listType = 'pets'; s.hPet = Number(key); A().setModule('listes'); }
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
            case 'cover': { const c = D.recueil.cover, p = pages[0], i = p ? imgById(p.shown_image_id) : null;
                inner = c?.chosen ? `<button type="button" class="h-rc-coverbig" data-rc-coverzoom><img src="${esc(thumbUrl(c))}" alt=""></button>` : i ? `<button type="button" class="h-rc-coverbig" data-rc-open="${p.id}"><img src="${esc(thumbUrl(i))}" alt=""></button>` : '<p class="muted">Pas encore de photo.</p>';
                inner += `<button type="button" class="link-button" data-rc-cover2>🖼️ ${c?.chosen ? 'Changer la couverture' : 'Choisir une autre couverture'}</button>`; break; }
            case 'figures': inner = `<div class="h-rc-figs"><span><b>${pages.length}</b> pages</span><span><b>${imgs.length}</b> photos</span><span><b>${D.versions.length}</b> versions</span><span><b>${imgs.filter(i => i.role === 'detail').length}</b> détails</span><span><b>${done.length}</b> transcrites</span>${loose().length ? `<span class="h-rc-warn"><b>${loose().length}</b> à ranger</span>` : ''}</div>`; break;
            case 'description': inner = D.recueil.description ? `<p>${nl(D.recueil.description)}</p>` : '<p class="muted">Pas de description : « Modifier » pour en écrire une.</p>'; break;
            case 'progress': { const pct = pages.length ? Math.round(done.length / pages.length * 100) : 0; const todo = pages.filter(p => !p.transcription.trim()).slice(0, b.n);
                inner = `<div class="h-rc-meter big"><i style="width:${pct}%"></i></div><p><b>${pct} %</b> — ${done.length} sur ${pages.length} pages</p>${todo.length ? `<p class="muted">À transcrire : ${todo.map(p => `<button type="button" class="link-button" data-rc-open="${p.id}">${p.num}</button>`).join(', ')}${pages.length - done.length > todo.length ? '…' : ''}</p>` : ''}`; break; }
            case 'versions': inner = `<ul class="h-rc-vlist">${D.versions.map(v => { const n = new Set(imgs.filter(i => i.version_id === v.id && i.page_id && i.role === 'page').map(i => i.page_id)).size; const kept = pages.filter(p => imgById(p.shown_image_id)?.version_id === v.id).length;
                return `<li><b>${esc(v.name)}</b> ${v.date_text ? `<small class="muted">${esc(v.date_text)}</small>` : ''}<span class="h-rc-meter"><i style="width:${pages.length ? Math.round(n / pages.length * 100) : 0}%"></i></span><small>${n} / ${pages.length} pages · ⭐ ${plural(kept, 'retenue', 'retenues')}</small></li>`; }).join('')}</ul>`; break;
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
        body.querySelector('[data-rc-cover2]')?.addEventListener('click', () => coverDialog());
        body.querySelector('[data-rc-coverzoom]')?.addEventListener('click', () => { const c = D.recueil.cover; openViewer([{id: 0, media_id: c.media_id, filename: c.filename, thumbnail: c.thumbnail, title: 'Couverture'}], 0); });
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
    /** Choix « où le montrer » dans une enquête : partout, à la racine, dans un dossier. */
    const folderOptions = (folders, current) => `<option value="" ${current == null ? 'selected' : ''}>🌐 Partout dans l’enquête</option><option value="0" ${current === 0 ? 'selected' : ''}>Racine de l’enquête</option>${folders.map(f => `<option value="${f.id}" ${current === f.id ? 'selected' : ''}>${'— '.repeat(f.depth || 0)}📁 ${esc(f.name)}</option>`).join('')}`;
    function forEntityHtml(rows, type, key, place = null) {
        return `<div class="h-rc-for">${rows.map(r => `<div class="h-rc-for-item"><div class="h-rc-for-head"><button type="button" class="table-link" data-open-recueil="${r.recueil_id}"><strong>${esc(r.icon || '📚')} ${esc(r.title)}</strong></button>
                <small class="muted">${r.from_num ? (r.to_num && r.to_num !== r.from_num ? `pages ${r.from_num} à ${r.to_num}` : `page ${r.from_num}`) : `tout le recueil (${r.total_pages} p.)`} · ${r.transcribed}/${r.pages} ${r.transcribed > 1 ? 'transcrites' : 'transcrite'}${r.reference ? ' · ' + esc(r.reference) : ''}</small>
                ${place ? `<label class="h-rc-for-move" title="Le laisser visible dans tous les dossiers, ou le ranger dans un seul">Déplacer vers<select data-rc-linkmove="${r.link_id}">${folderOptions(place.folders, r.folder_id)}</select></label>` : ''}
                <button type="button" class="icon-button" data-rc-unlink="${r.link_id}" title="Détacher">✕</button></div>
                ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}
                <div class="h-rc-for-strip">${r.thumbs.map(t => `<button type="button" class="h-rc-thumb" data-open-recueil="${r.recueil_id}" data-recueil-page="${t.page_id}" title="${esc(t.label || 'Page ' + t.num)}">${t.thumbnail ? `<img src="media/${encodeURIComponent(t.thumbnail)}" alt="" loading="lazy">` : '<span class="h-rc-nophoto">—</span>'}<small>${t.num}</small></button>`).join('')}${r.pages > r.thumbs.length ? `<button type="button" class="h-rc-thumb h-rc-more" data-open-recueil="${r.recueil_id}">+${r.pages - r.thumbs.length}</button>` : ''}</div></div>`).join('')}
            <button type="button" class="button small secondary" data-rc-attach="${esc(type)}:${esc(key)}">+ Rattacher un recueil</button></div>`;
    }
    /** Fenêtre « Rattacher un recueil » depuis une fiche, un village… */
    ext.recueilAttachDialog = async (type, key, after, {folderId = null, folders = null} = {}) => {
        if (type === 'investigation' && !folders) { const host = document.querySelector(`[data-rc-host][data-rc-type="investigation"][data-rc-key="${CSS.escape(String(key))}"]`); try { folders = JSON.parse(host?.dataset.rcFolders || '[]'); } catch (_) { folders = []; } }
        const list = (await get('recueils').catch(() => ({recueils: []}))).recueils || [];
        if (!list.length) { if (await A().confirmBox('Pas encore de recueil. En créer un maintenant (Listes › Recueils) ?', {title: 'Aucun recueil', okLabel: 'Créer un recueil'})) { S().listType = 'recueils'; Object.assign(st(), {id: 0}); A().setModule('listes'); } return; }
        let pages = [];
        dialog({eyebrow: 'RECUEIL', title: 'Rattacher un recueil', wide: true, submitLabel: 'Rattacher',
            body: `<label>Recueil<select name="recueil_id">${list.map(r => `<option value="${r.id}">${esc(r.icon || '📚')} ${esc(r.title)} (${r.pages} p.)</option>`).join('')}</select></label><div data-rc-range></div>
                ${type === 'investigation' ? `<label>Où le montrer dans l’enquête<select name="folder_id">${folderOptions(folders || [], folderId == null ? null : Number(folderId))}</select><small class="muted">« Partout » : visible dans chaque dossier (pratique pour un registre qui sert souvent). Tu pourras le déplacer ensuite.</small></label>` : ''}
                <label>Note <small class="muted">(facultatif)</small><input name="note" placeholder="Il est cité à la ligne 12"></label>`,
            onOpen: dl => { const sel = dl.querySelector('[name=recueil_id]'), box = dl.querySelector('[data-rc-range]');
                const fill = async () => { const d = await get('recueil', {id: sel.value}); pages = d.pages; box.innerHTML = rangeFields(pages, 0, 0); };
                sel.addEventListener('change', fill); fill(); },
            onSubmit: async form => { const f = Object.fromEntries(new FormData(form));
                await post('save_recueil_link', {recueil_id: Number(f.recueil_id), entity_type: type, entity_key: key, note: f.note, ...(type === 'investigation' ? {folder_id: f.folder_id ?? ''} : {}), page_from: f.scope === 'some' ? Number(f.page_from) : 0, page_to: f.scope === 'some' ? Number(f.page_to) : 0});
                toast('Recueil rattaché.'); after?.(); },
        });
    };
    /** Section « Recueils » à poser dans une page (village, enquête, projet) : ext.recueilsSection(conteneur, type, clé). */
    ext.recueilsSection = async (box, type, key, {title = '📚 Recueils', hideEmpty = false} = {}) => {
        if (!box) return;
        const all = (await get('recueils_for', {type, key}).catch(() => ({recueils: []}))).recueils || [];
        if (!box.isConnected) return;
        // Dans une enquête : un recueil est montré partout (folder_id vide) ou dans son seul dossier (0 = racine)
        let place = null, rows = all;
        if (type === 'investigation' && box.dataset.rcFolder !== undefined) {
            let folders = []; try { folders = JSON.parse(box.dataset.rcFolders || '[]'); } catch (_) {}
            place = {folder: Number(box.dataset.rcFolder) || 0, folders};
            const known = new Set(folders.map(f => f.id)); // dossier supprimé depuis : le recueil revient à la racine
            all.forEach(r => { if (r.folder_id != null && r.folder_id !== 0 && !known.has(r.folder_id)) r.folder_id = 0; });
            rows = all.filter(r => r.folder_id == null || r.folder_id === place.folder);
        }
        const elsewhere = all.length - rows.length;
        const more = elsewhere ? `<p class="muted h-rc-elsewhere">${plural(elsewhere, 'autre recueil est rangé', 'autres recueils sont rangés')} dans d’autres dossiers de l’enquête.</p>` : '';
        if (!rows.length && hideEmpty) { box.innerHTML = place ? (elsewhere ? more : '') : `<button type="button" class="button small secondary" data-rc-attach="${esc(type)}:${esc(key)}">📚 Rattacher un recueil</button>`; }
        else box.innerHTML = `<section class="maintenance-panel h-rc-section"><h3>${title}</h3>${rows.length ? '' : '<p class="muted">Aucun recueil rattaché.</p>'}${forEntityHtml(rows, type, key, place)}${more}</section>`;
        const again = () => ext.recueilsSection(box, type, key, {title, hideEmpty});
        bindFor(box, again, place);
        box.querySelectorAll('[data-rc-linkmove]').forEach(sel => sel.addEventListener('change', async () => {
            try { await post('move_recueil_link', {id: Number(sel.dataset.rcLinkmove), folder_id: sel.value}); toast(sel.value === '' ? 'Recueil visible partout dans l’enquête.' : 'Recueil déplacé.'); } catch (e) { toast(e.message, 'error'); }
            again();
        }));
    };
    /** Remet à jour toutes les cases « Recueils » de l'écran (après un rattachement fait d'ailleurs). */
    ext.refreshRecueilHosts = () => document.querySelectorAll('[data-rc-host][data-rc-filled]').forEach(box => ext.recueilsSection(box, box.dataset.rcType, box.dataset.rcKey, {title: box.dataset.rcTitle || '📚 Recueils', hideEmpty: box.dataset.rcHideEmpty !== undefined}));
    function bindFor(root, after, place = null) {
        root.querySelectorAll('[data-rc-attach]').forEach(b => b.addEventListener('click', () => { const [type, ...k] = b.dataset.rcAttach.split(':'); ext.recueilAttachDialog(type, k.join(':'), after, place ? {folderId: place.folder, folders: place.folders} : {}); }));
        root.querySelectorAll('[data-rc-unlink]').forEach(b => b.addEventListener('click', async () => { if (!await A().confirmBox('Détacher ce recueil ?', {title: 'Détacher le recueil', okLabel: 'Détacher'})) return; await post('delete_recueil_link', {id: Number(b.dataset.rcUnlink)}); toast('Détaché.'); after?.(); }));
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
