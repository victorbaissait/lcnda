/**
 * 📜 Dépouillements (Listes › Dépouillements) : les dépouillements d'archive vus comme des recueils de pages.
 * Une seule source avec Recherche › Dépouillement d'archive (rien n'est recopié) :
 *  - pages = pages_json du dépouillement (+ les numéros de page déjà utilisés par les photos, les personnes, les lignes) ;
 *  - photos d'une page = archive_digest_media.page_number (sans numéro : « à ranger ») ;
 *  - personnes et foyers = archive_digest_people (page_number, household_key, address, fiche) ;
 *  - transcription = archive_digest_transcription_lines de la page.
 * Serveur : api.php (archive_digest_*), lib/digest_pages.php (une page à la fois).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = value => A().escapeHtml(value ?? '');
    const S = () => A().state;
    const toast = (...a) => A().toast(...a);
    const get = (action, params = {}) => A().api(action, params);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const dialog = opts => ext.openDialog(opts);
    const plural = (n, one, many) => `${Number(n || 0).toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
    const st = () => (S().hDigest ||= {id: 0, page: '', tab: 'pages', q: '', type: '', status: '', image: 0});
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'depouillements';
    const natural = (a, b) => String(a).localeCompare(String(b), 'fr', {numeric: true, sensitivity: 'base'});
    const isImage = m => (m.media_type || 'image') === 'image';
    const thumb = m => m ? `media/${encodeURIComponent(m.thumbnail || m.filename)}` : '';
    const full = m => m ? `media/${encodeURIComponent(m.filename)}` : '';
    const PAGE_STATUS = {checked: ['Dépouillée', '#2f7d4f'], found: ['Infos trouvées · pas fini', '#b7791f'], todo: ['À faire', '#8a8a8a'], review: ['À revoir', '#c05621'], incomplete: ['Incomplète', '#c53030'], empty: ['Sans information', '#718096']};
    const CONTENT = {acts: 'Actes / informations', empty: 'Page sans information', cover: 'Couverture / index', review: 'À revoir', other: 'Autre'};
    const COLS = [['household_key', 'Foyer', 5], ['address', 'Adresse', 12], ['last_name', 'Nom', 11], ['first_name', 'Prénom', 11], ['age_text', 'Âge', 5], ['household_position', 'Place dans le foyer', 10], ['occupation', 'Profession', 11], ['birth_place', 'Né(e) à', 10], ['nationality', 'Nationalité', 8], ['notes', 'Notes', 12]];

    /* ─────────── Ouvrir un dépouillement depuis n'importe où (Recherche, battue…) ─────────── */
    ext.openDepouillement = (id, page = '') => {
        S().listType = 'depouillements';
        Object.assign(st(), {id: Number(id), page: String(page || ''), tab: 'pages', image: 0});
        A().setModule('listes');
    };
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-open-depouillement]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        ext.openDepouillement(b.dataset.openDepouillement, b.dataset.depouillementPage || '');
    });
    document.addEventListener('click', e => {
        const b = e.target.closest?.('.h-dp [data-open-person]');
        if (!b) return;
        e.preventDefault(); S().currentPersonId = Number(b.dataset.openPerson); A().setModule('personnes');
    });
    /** Ouvrir le même dépouillement dans Recherche (fiche complète, modification, import CSV…). */
    const openInResearch = (id, edit = false) => {
        Object.assign(S(), {researchKind: 'archive_digest', archiveDigestAdding: !!edit, archiveDigestEditId: edit ? Number(id) : 0});
        S().archiveDigestSearch = {id: Number(id) || 0, q: '', city: '', dept: '', region: '', recordType: '', status: ''};
        A().setModule('recherche');
    };
    const newInResearch = () => { Object.assign(S(), {researchKind: 'archive_digest', archiveDigestAdding: true, archiveDigestEditId: 0}); A().setModule('recherche'); };

    const titleOf = (r, types) => [types?.[r.record_type] || r.record_type, r.place_name || r.city_name || r.city_alias].filter(Boolean).join(' · ') || 'Dépouillement';
    /** Toutes les pages connues : pages décrites + numéros utilisés par les photos, les personnes, les lignes. */
    function pagesOf(r, lines = []) {
        const map = new Map();
        (r.pages || []).forEach(p => { const n = String(p.number || '').trim(); if (n) map.set(n, {...p, number: n, described: true}); });
        const add = n => { n = String(n || '').trim(); if (n && !map.has(n)) map.set(n, {number: n, status: 'todo', content_type: 'acts', act_from: '', act_to: '', note: '', described: false}); };
        (r.media || []).forEach(m => add(m.archive_page_number)); (r.people || []).forEach(p => add(p.page_number)); lines.forEach(l => add(l.page_number));
        return [...map.values()].sort((a, b) => natural(a.number, b.number));
    }
    const pageMedia = (r, n) => (r.media || []).filter(m => String(m.archive_page_number || '').trim() === n);
    const loose = r => (r.media || []).filter(m => !String(m.archive_page_number || '').trim());
    const households = people => new Set(people.map(p => (p.household_key || '').trim()).filter(Boolean)).size;

    /* ─────────── Liste ─────────── */
    ext.lists.depouillements = async token => {
        const s = st();
        if (s.id) return renderDigest(token);
        const data = await get('archive_digest_search', {q: s.q || '', record_type: s.type || '', status: s.status || ''});
        if (!isCurrent(token)) return;
        const rows = data.rows || [], types = data.types || {}, statuses = data.statuses || {};
        const ws = A().$('#workspace');
        const groups = new Map();
        rows.forEach(r => { const c = (r.place_name || r.city_name || r.city_alias || 'Commune non précisée').trim(); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(r); });
        const card = r => {
            const pages = pagesOf(r), cover = (r.media || []).find(m => isImage(m) && String(m.archive_page_number || '').trim()) || (r.media || []).find(isImage);
            const done = pages.filter(p => ['checked', 'empty'].includes(p.status)).length, pct = pages.length ? Math.round(done / pages.length * 100) : 0, ls = loose(r).length;
            return `<button type="button" class="h-rc-card" data-dp-open="${r.id}">
                <span class="h-rc-cover">${cover ? `<img src="${esc(thumb(cover))}" alt="" loading="lazy">` : '<span class="h-rc-cover-empty">📜</span>'}${pages.length ? `<span class="h-rc-badge">${plural(pages.length, 'page', 'pages')}</span>` : ''}</span>
                <span class="h-rc-card-body"><strong>${esc(types[r.record_type] || r.record_type || 'Dépouillement')}${r.year_text ? ' · ' + esc(r.year_text) : ''}</strong>
                    <small class="muted">${esc([r.city_alias && r.city_alias !== (r.place_name || r.city_name) ? r.city_alias : '', r.archive_service, r.archive_reference].filter(Boolean).join(' · ')) || '&nbsp;'}</small>
                    <span class="h-rc-meter" title="${pct} % des pages dépouillées"><i style="width:${pct}%"></i></span>
                    <small>${esc(statuses[r.status] || r.status || '')} · 👥 ${(r.people || []).length} · 🏠 ${households(r.people || [])} foyer(s)${ls ? ` · <b class="h-rc-warn">${plural(ls, 'photo à ranger', 'photos à ranger')}</b>` : ''}</small></span></button>`;
        };
        ws.innerHTML = `<section class="page collection-page h-rc h-dp">
            <header class="page-header"><div><span class="eyebrow">LISTES · ARCHIVES</span><h2>📜 Dépouillements</h2>
                <p>Tes dépouillements d’archive page par page : les photos de chaque page, les personnes relevées rangées par foyer, la transcription. <b>Ce sont les mêmes que dans Recherche › Dépouillement d’archive</b> : ce que tu saisis ici y est aussitôt, et inversement.</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-dp-research>🔎 Ouvrir dans Recherche</button><button type="button" class="button" data-dp-new>+ Nouveau dépouillement</button></div></header>
            <div class="collection-toolbar"><input type="search" data-dp-q value="${esc(s.q || '')}" placeholder="Commune, cote, année, service d’archives…">
                <select data-dp-type><option value="">Tous les types</option>${Object.entries(types).map(([k, l]) => `<option value="${esc(k)}" ${s.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                <select data-dp-status><option value="">Tous les états</option>${Object.entries(statuses).map(([k, l]) => `<option value="${esc(k)}" ${s.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
            ${rows.length ? [...groups.entries()].map(([c, list]) => `<h3 class="h-dp-city">🏘️ ${esc(c)} <small class="muted">${list.length}</small></h3><div class="h-rc-grid">${list.map(card).join('')}</div>`).join('')
            : A().empty(s.q || s.type || s.status ? 'Aucun dépouillement ne correspond.' : 'Aucun dépouillement pour l’instant : « + Nouveau dépouillement » (la fiche se remplit dans Recherche).')}</section>`;
        const sec = ws.querySelector('.h-dp');
        sec.querySelectorAll('[data-dp-open]').forEach(b => b.addEventListener('click', () => { Object.assign(s, {id: Number(b.dataset.dpOpen), page: '', tab: 'pages', image: 0}); ext.lists.depouillements(++S().workspaceToken); }));
        sec.querySelector('[data-dp-new]').addEventListener('click', newInResearch);
        sec.querySelector('[data-dp-research]').addEventListener('click', () => openInResearch(0));
        let timer = 0;
        sec.querySelector('[data-dp-q]').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { s.q = e.target.value.trim(); ext.lists.depouillements(++S().workspaceToken).then(() => { const i = A().$('[data-dp-q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 300); });
        sec.querySelector('[data-dp-type]').addEventListener('change', e => { s.type = e.target.value; ext.lists.depouillements(++S().workspaceToken); });
        sec.querySelector('[data-dp-status]').addEventListener('change', e => { s.status = e.target.value; ext.lists.depouillements(++S().workspaceToken); });
    };

    /* ─────────── Un dépouillement ─────────── */
    let D = null; // {row, types, statuses, lines}
    async function load(id) {
        const [d, t] = await Promise.all([get('archive_digest_search', {id}), get('archive_digest_transcriptions', {id}).catch(() => ({lines: []}))]);
        const row = (d.rows || [])[0];
        if (!row) throw new Error('Dépouillement introuvable.');
        D = {row, types: d.types || {}, statuses: d.statuses || {}, lines: t.lines || []};
    }
    async function renderDigest(token) {
        const s = st();
        try { await load(s.id); } catch (e) { toast(e.message, 'error'); s.id = 0; return ext.lists.depouillements(token); }
        if (!isCurrent(token)) return;
        paint();
    }
    const reload = async () => { const y = scrollY; await load(st().id); paint(); scrollTo(0, y); };

    function paint() {
        const s = st(), r = D.row, pages = pagesOf(r, D.lines), ws = A().$('#workspace');
        if (s.page && !pages.some(p => p.number === s.page)) s.page = '';
        const ppl = r.people || [];
        const tabs = [['pages', '📄', 'Pages', pages.length], ['people', '👥', 'Personnes et foyers', ppl.length], ['info', '🗂️', 'Fiche du dépouillement', '']];
        ws.innerHTML = `<section class="page collection-page h-rc h-rc-one h-dp">
            <header class="page-header"><div><button type="button" class="back-link" data-dp-back>← Tous les dépouillements</button><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>📜 ${esc(titleOf(r, D.types))}${r.year_text ? ` <small>${esc(r.year_text)}</small>` : ''}</h2>
                <p class="muted">${esc([r.archive_service, r.archive_reference, D.statuses[r.status]].filter(Boolean).join(' · ')) || '&nbsp;'}${r.archive_url ? ` · <a href="${esc(A().safeUrl ? A().safeUrl(r.archive_url) : r.archive_url)}" target="_blank" rel="noopener">ouvrir l’archive en ligne ↗</a>` : ''}</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-dp-inresearch title="La même fiche, dans Recherche › Dépouillement d’archive">🔎 Dans Recherche</button><button type="button" class="button secondary" data-dp-edit>Modifier la fiche</button><button type="button" class="button" data-dp-addphotos>+ Ajouter des photos</button></div></header>
            <div class="h-rc-tabs segmented">${tabs.map(([k, icon, label, n]) => `<button type="button" class="${s.tab === k ? 'is-active' : ''}" data-dp-tab="${k}">${icon} ${label}${n !== '' ? ` <small>${n}</small>` : ''}</button>`).join('')}
                <span class="h-rc-tabs-info muted">${plural(pages.length, 'page', 'pages')} · ${plural(households(ppl), 'foyer', 'foyers')}${loose(r).length ? ` · <button type="button" class="link-button h-rc-warn" data-dp-goloose>${plural(loose(r).length, 'photo à ranger', 'photos à ranger')}</button>` : ''}</span></div>
            <div class="h-rc-body"></div></section>`;
        const sec = ws.querySelector('.h-dp');
        sec.querySelector('[data-dp-back]').addEventListener('click', () => { Object.assign(s, {id: 0, page: ''}); ext.lists.depouillements(++S().workspaceToken); });
        sec.querySelector('[data-dp-inresearch]').addEventListener('click', () => openInResearch(r.id));
        sec.querySelector('[data-dp-edit]').addEventListener('click', () => openInResearch(r.id, true));
        sec.querySelector('[data-dp-addphotos]').addEventListener('click', () => addPhotos(s.tab === 'pages' ? s.page : ''));
        sec.querySelectorAll('[data-dp-tab]').forEach(b => b.addEventListener('click', () => { s.tab = b.dataset.dpTab; s.page = ''; paint(); }));
        sec.querySelector('[data-dp-goloose]')?.addEventListener('click', () => { s.tab = 'pages'; s.page = ''; paint(); sec.querySelector('.h-rc-loose')?.scrollIntoView({block: 'center'}); });
        const body = sec.querySelector('.h-rc-body');
        if (s.tab === 'people') return paintPeople(body);
        if (s.tab === 'info') return paintInfo(body);
        if (s.page) return paintPage(body, pages);
        paintPages(body, pages);
    }

    /* ─── Pages en mosaïque, photos à ranger ─── */
    function pageSelect(attr, current, placeholder) {
        const pages = pagesOf(D.row, D.lines);
        return `<select ${attr}>${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}<option value="__loose" ${current === '' && !placeholder ? 'selected' : ''}>🧺 À ranger (sans page)</option>${pages.map(p => `<option value="${esc(p.number)}" ${p.number === current ? 'selected' : ''}>Page ${esc(p.number)}</option>`).join('')}<option value="__new">＋ Nouvelle page…</option></select>`;
    }
    async function pageFromSelect(v) {
        if (v === '__loose') return '';
        if (v !== '__new') return v;
        const n = ((await A().askText({title: 'Nouvelle page', message: 'Numéro de la page (ou de la vue) :', value: suggestNext(), okLabel: 'Créer'})) || '').trim();
        if (!n) return null;
        await post('save_archive_digest_page', {archive_digest_id: D.row.id, number: n, old_number: ''}).catch(e => { if (!/existe déjà/.test(e.message)) throw e; });
        return n;
    }
    const suggestNext = () => { const nums = pagesOf(D.row, D.lines).map(p => parseInt(p.number, 10)).filter(Number.isFinite); return String(nums.length ? Math.max(...nums) + 1 : 1); };
    function paintPages(body, pages) {
        const r = D.row, ls = loose(r);
        body.innerHTML = `<div class="collection-toolbar h-rc-toolbar"><button type="button" class="button small secondary" data-dp-newpage>+ Page</button>
                <span class="muted">Clique sur une page pour voir ses photos, ses personnes par foyer et sa transcription.</span></div>
            ${ls.length ? `<div class="h-rc-loose maintenance-panel"><h3>🧺 À ranger <small class="muted">${plural(ls.length, 'photo', 'photos')} sans page : choisis sa page</small></h3><div class="h-rc-loose-list">${ls.map(m => `<div class="h-rc-loose-item" data-dp-media="${m.id}">${isImage(m) ? `<button type="button" class="h-rc-thumb small" data-dp-zoom="${m.id}" title="Voir en grand"><img src="${esc(thumb(m))}" alt="" loading="lazy"></button>` : `<span class="h-rc-thumb small">📄</span>`}<small>${esc(m.title || '')}</small>${pageSelect('data-dp-assign', '', 'Mettre sur la page…')}</div>`).join('')}</div></div>` : ''}
            ${pages.length ? `<div class="h-rc-pages">${pages.map(p => {
                const ms = pageMedia(r, p.number), img = ms.find(isImage), ppl = (r.people || []).filter(x => String(x.page_number || '').trim() === p.number), [lab, col] = PAGE_STATUS[p.status] || PAGE_STATUS.todo;
                return `<button type="button" class="h-rc-page" data-dp-page="${esc(p.number)}"><span class="h-rc-thumb">${img ? `<img src="${esc(thumb(img))}" alt="" loading="lazy">` : '<span class="h-rc-nophoto">pas de photo</span>'}<span class="h-rc-num">${esc(p.number)}</span></span>
                    <span class="h-rc-page-name"><i class="h-dp-dot" style="background:${col}" title="${esc(lab)}"></i> ${esc(lab)}</span>
                    <span class="h-rc-page-meta"><small>${ppl.length ? `👥 ${ppl.length} · 🏠 ${households(ppl)}` : esc(CONTENT[p.content_type] || '')}${p.act_from ? ` · actes ${esc(p.act_from)}${p.act_to ? '–' + esc(p.act_to) : ''}` : ''}</small></span></button>`; }).join('')}</div>`
            : A().empty('Pas encore de page : « + Page » ou « + Ajouter des photos ».')}`;
        body.querySelector('[data-dp-newpage]').addEventListener('click', async () => { const n = await pageFromSelect('__new'); if (n) { st().page = n; await reload(); } });
        body.querySelectorAll('[data-dp-page]').forEach(b => b.addEventListener('click', () => { st().page = b.dataset.dpPage; st().image = 0; paint(); }));
        body.querySelectorAll('[data-dp-zoom]').forEach(b => b.addEventListener('click', () => viewer([r.media.find(m => m.id === Number(b.dataset.dpZoom))], 0)));
        body.querySelectorAll('[data-dp-assign]').forEach(sel => sel.addEventListener('change', async () => {
            if (!sel.value) return;
            try { const n = await pageFromSelect(sel.value); if (n === null) { sel.value = ''; return; } await post('link_archive_digest_media', {archive_digest_id: r.id, media_id: Number(sel.closest('[data-dp-media]').dataset.dpMedia), page_number: n}); toast('Photo rangée.'); await reload(); } catch (e) { toast(e.message, 'error'); }
        }));
    }
    function viewer(list, index) {
        const media = list.filter(Boolean);
        if (!media.length) return;
        A().openLightbox(media, index, false);
        A().$('#lightbox')?.addEventListener('close', () => { if (st().id && S().listType === 'depouillements') reload(); }, {once: true});
    }

    /* ─── Une page : photos, fiche de la page, transcription, personnes par foyer ─── */
    function paintPage(body, pages) {
        const s = st(), r = D.row, idx = pages.findIndex(p => p.number === s.page), p = pages[idx], prev = pages[idx - 1], next = pages[idx + 1];
        const ms = pageMedia(r, p.number), imgs = ms.filter(isImage), cur = imgs.find(m => m.id === s.image) || imgs[0] || null;
        const lines = D.lines.filter(l => String(l.page_number || '').trim() === p.number).sort((a, b) => (a.line_number - b.line_number) || (a.id - b.id));
        body.innerHTML = `<div class="h-rc-pagebar"><button type="button" class="button small secondary" data-dp-allpages>▦ Toutes les pages</button>
                <span class="h-rc-pagenav"><button type="button" class="button small secondary" data-dp-go="${esc(prev?.number ?? '')}" ${prev ? '' : 'disabled'} title="Page précédente (Alt + ←)">‹</button>
                <select data-dp-jump>${pages.map(x => `<option value="${esc(x.number)}" ${x.number === p.number ? 'selected' : ''}>Page ${esc(x.number)}</option>`).join('')}</select>
                <button type="button" class="button small secondary" data-dp-go="${esc(next?.number ?? '')}" ${next ? '' : 'disabled'} title="Page suivante (Alt + →)">›</button></span>
                <span class="muted">${idx + 1} / ${pages.length}</span></div>
            <div class="h-rc-pageview">
                <div class="h-rc-stage-wrap">
                    <div class="h-rc-stage">${imgs.length > 1 ? `<button type="button" class="h-rc-imgnav is-prev" data-dp-imgstep="-1" title="Photo précédente de cette page (←)">‹</button><button type="button" class="h-rc-imgnav is-next" data-dp-imgstep="1" title="Photo suivante de cette page (→)">›</button><span class="h-rc-imgcount">${imgs.indexOf(cur) + 1} / ${imgs.length}</span>` : ''}
                        ${cur ? `<figure class="h-rc-figure"><img src="${esc(full(cur))}" alt="" data-dp-zoomcur title="Cliquer : agrandir, pivoter, retoucher"><figcaption>${esc(cur.title || '')}</figcaption></figure>` : `<div class="h-rc-nophoto big">Pas de photo pour cette page.<br><button type="button" class="button small" data-dp-addhere>+ Ajouter une photo de cette page</button></div>`}</div>
                    ${cur ? `<div class="h-rc-imgactions"><button type="button" class="button small secondary" data-dp-zoomcur>🔍 Agrandir, pivoter, retoucher</button>
                        <label class="h-rc-move">Déplacer vers ${pageSelect('data-dp-moveimg', p.number)}</label>
                        <button type="button" class="icon-button danger" data-dp-unlink="${cur.id}" title="Retirer cette photo du dépouillement (elle reste dans Médias)">🗑</button></div>` : ''}
                    <div class="h-rc-strip">${ms.map(m => `<button type="button" class="h-rc-thumb ${m.id === cur?.id ? 'is-current' : ''}" data-dp-pick="${m.id}" title="${esc(m.title || '')}">${isImage(m) ? `<img src="${esc(thumb(m))}" alt="" loading="lazy">` : '📄'}</button>`).join('')}<button type="button" class="h-rc-thumb h-rc-addthumb" data-dp-addhere title="Ajouter une photo de cette page">＋</button></div>
                </div>
                <div class="h-rc-side">
                    <div class="form-grid h-dp-pageform">
                        <label>Numéro<input data-dp-pf="number" value="${esc(p.number)}"></label>
                        <label>État<select data-dp-pf="status">${Object.entries(PAGE_STATUS).map(([k, [l]]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                        <label>Contenu<select data-dp-pf="content_type">${Object.entries(CONTENT).map(([k, l]) => `<option value="${k}" ${p.content_type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                        <label>Actes n° (de… à…)<span class="h-dp-acts"><input data-dp-pf="act_from" value="${esc(p.act_from || '')}" placeholder="12"><input data-dp-pf="act_to" value="${esc(p.act_to || '')}" placeholder="18"></span></label>
                        <label class="span-2">Note de la page<textarea data-dp-pf="note" rows="2" placeholder="Ce qu’il y a sur la page, ce qui manque…">${esc(p.note || '')}</textarea></label></div>
                    <p class="muted h-dp-saved" data-dp-saved>${p.described ? '' : 'Cette page n’a pas encore de fiche : elle sera créée dès que tu modifies un champ.'}</p>
                    <h4>✍️ Transcription <small class="muted">(ligne par ligne)</small></h4>
                    <div class="h-dp-lines">${lines.map(l => `<div class="h-dp-line" data-dp-line="${l.id}"><span class="muted">${l.line_number || ''}</span><textarea rows="1" data-dp-ltext>${esc(l.content)}</textarea>${l.zone_json ? '<span title="Zone repérée sur l’image (Recherche)">📍</span>' : ''}<button type="button" class="icon-button" data-dp-ldel title="Supprimer la ligne">✕</button></div>`).join('')}
                        <div class="h-dp-line is-new"><span class="muted">${(lines[lines.length - 1]?.line_number || lines.length) + 1}</span><textarea rows="1" data-dp-lnew placeholder="Nouvelle ligne… (Entrée pour l’ajouter)"></textarea></div></div>
                    <div class="h-rc-sideactions"><button type="button" class="button small secondary danger" data-dp-delpage>Supprimer la page</button></div>
                </div></div>
            <section class="maintenance-panel h-dp-people"><header class="h-dp-peoplehead"><h3>👥 Personnes et foyers de la page ${esc(p.number)}</h3>
                <span><button type="button" class="button small secondary" data-dp-addhh>+ Foyer</button><button type="button" class="button small" data-dp-addp>+ Personne</button></span></header>
                <p class="muted h-dp-hint">Une ligne = une personne relevée ; le n° de foyer les regroupe. Coller depuis un tableur remplit les lignes (dans l’ordre des colonnes). 👤 : la rattacher à une fiche.</p>
                <div class="h-dp-tablewrap" data-dp-table></div></section>`;
        const go = n => { if (n === '' || n == null) return; st().page = String(n); st().image = 0; paint(); };
        body.querySelector('[data-dp-allpages]').addEventListener('click', () => { st().page = ''; paint(); });
        body.querySelectorAll('[data-dp-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.dpGo)));
        body.querySelector('[data-dp-jump]').addEventListener('change', e => go(e.target.value));
        const step = d => { if (imgs.length < 2) return; s.image = imgs[(imgs.indexOf(cur) + d + imgs.length) % imgs.length].id; paint(); };
        body.querySelectorAll('[data-dp-imgstep]').forEach(b => b.addEventListener('click', () => step(Number(b.dataset.dpImgstep))));
        body.querySelectorAll('[data-dp-pick]').forEach(b => b.addEventListener('click', () => { const m = ms.find(x => x.id === Number(b.dataset.dpPick)); if (m && !isImage(m)) return viewer([m], 0); s.image = Number(b.dataset.dpPick); paint(); }));
        body.querySelectorAll('[data-dp-zoomcur]').forEach(b => b.addEventListener('click', () => viewer(imgs, Math.max(0, imgs.indexOf(cur)))));
        body.querySelectorAll('[data-dp-addhere]').forEach(b => b.addEventListener('click', () => addPhotos(p.number)));
        body.querySelector('[data-dp-moveimg]')?.addEventListener('change', async e => {
            try { const n = await pageFromSelect(e.target.value); if (n === null || n === p.number) { e.target.value = p.number; return; } await post('link_archive_digest_media', {archive_digest_id: r.id, media_id: cur.id, page_number: n}); toast(n ? `Photo déplacée en page ${n}.` : 'Photo mise « à ranger ».'); s.image = 0; await reload(); } catch (err) { toast(err.message, 'error'); }
        });
        body.querySelector('[data-dp-unlink]')?.addEventListener('click', async () => { if (!confirm('Retirer cette photo du dépouillement ? Elle reste dans Médias.')) return; await post('unlink_archive_digest_media', {archive_digest_id: r.id, media_id: cur.id}); s.image = 0; toast('Photo retirée du dépouillement.'); reload(); });
        // fiche de la page, enregistrée au fil de la saisie
        const saved = body.querySelector('[data-dp-saved]'); let timer = 0;
        const savePage = async () => {
            const f = {}; body.querySelectorAll('[data-dp-pf]').forEach(el => { f[el.dataset.dpPf] = el.value.trim(); });
            if (!f.number) { saved.textContent = '⚠ Le numéro ne peut pas être vide.'; return; }
            try { await post('save_archive_digest_page', {archive_digest_id: r.id, old_number: p.number, ...f}); saved.textContent = '✓ enregistré';
                if (f.number !== p.number) { st().page = f.number; await reload(); } else { Object.assign(p, f, {described: true}); const rp = (r.pages ||= []).find(x => x.number === p.number); if (rp) Object.assign(rp, f); else r.pages.push({...f}); } }
            catch (e) { saved.textContent = '⚠ ' + e.message; }
        };
        body.querySelectorAll('[data-dp-pf]').forEach(el => {
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { saved.textContent = '…'; clearTimeout(timer); timer = setTimeout(savePage, el.dataset.dpPf === 'number' ? 1200 : 600); });
            if (el.dataset.dpPf === 'number') el.addEventListener('blur', () => { if (saved.textContent === '…') { clearTimeout(timer); savePage(); } });
        });
        body.querySelector('[data-dp-delpage]').addEventListener('click', async () => {
            const nPeople = (r.people || []).filter(x => String(x.page_number || '').trim() === p.number).length;
            if (!confirm(`Supprimer la page ${p.number} ?${ms.length ? `\n\nSes ${ms.length} photo(s) passent « à ranger ».` : ''}${nPeople ? `\nSes ${nPeople} personne(s) relevée(s) restent dans le dépouillement (avec ce numéro de page).` : ''}`)) return;
            await post('save_archive_digest_page', {archive_digest_id: r.id, old_number: p.number, delete: 1}); s.page = (next || prev)?.number || ''; toast('Page supprimée.'); reload();
        });
        // transcription : chaque ligne s'enregistre ; Entrée dans la dernière en crée une nouvelle
        const lineSave = async (el, l) => { const v = el.value.trim(); if (v === l.content) return; if (!v) return; try { await post('save_archive_digest_transcription_line', {id: l.id, archive_digest_id: r.id, media_id: l.media_id || '', page_number: p.number, line_number: l.line_number, content: v, zone_json: l.zone_json || ''}); l.content = v; } catch (e) { toast(e.message, 'error'); } };
        body.querySelectorAll('[data-dp-line]').forEach(row => {
            const l = lines.find(x => x.id === Number(row.dataset.dpLine)), ta = row.querySelector('[data-dp-ltext]');
            autosize(ta); ta.addEventListener('input', () => autosize(ta)); ta.addEventListener('blur', () => lineSave(ta, l));
            row.querySelector('[data-dp-ldel]').addEventListener('click', async () => { if (!confirm('Supprimer cette ligne ?')) return; await post('delete_archive_digest_transcription_line', {id: l.id}); D.lines = D.lines.filter(x => x !== l); paint(); });
        });
        const nl = body.querySelector('[data-dp-lnew]');
        nl.addEventListener('keydown', async e => {
            if (e.key !== 'Enter' || e.shiftKey) return; e.preventDefault();
            const v = nl.value.trim(); if (!v) return;
            const num = (lines[lines.length - 1]?.line_number || lines.length) + 1;
            try { const res = await post('save_archive_digest_transcription_line', {archive_digest_id: r.id, media_id: cur?.id || '', page_number: p.number, line_number: num, content: v}); D.lines.push({id: (res.result || res).id, page_number: p.number, line_number: num, content: v, media_id: cur?.id || null, zone_json: ''}); paint(); body.isConnected; A().$('[data-dp-lnew]')?.focus(); } catch (err) { toast(err.message, 'error'); }
        });
        peopleTable(body.querySelector('[data-dp-table]'), p.number);
        body.querySelector('[data-dp-addp]').addEventListener('click', () => peopleTable.add?.(false));
        body.querySelector('[data-dp-addhh]').addEventListener('click', () => peopleTable.add?.(true));
        const keys = e => {
            if (!body.isConnected) return document.removeEventListener('keydown', keys);
            if (e.target.closest('textarea, input, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
            if (!e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); return; }
            if (e.altKey && e.key === 'ArrowLeft' && prev) { e.preventDefault(); go(prev.number); }
            if (e.altKey && e.key === 'ArrowRight' && next) { e.preventDefault(); go(next.number); }
        };
        document.removeEventListener('keydown', ext._dpKeys || (() => {})); ext._dpKeys = keys; document.addEventListener('keydown', keys);
    }
    const autosize = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight + 2) + 'px'; };

    /* ─── Tableau des personnes d'une page, regroupées par foyer (archive_digest_people) ─── */
    function peopleTable(box, pageNumber) {
        const r = D.row;
        const rows = (r.people || []).filter(x => String(x.page_number || '').trim() === pageNumber)
            .sort((a, b) => natural(a.household_key || '~', b.household_key || '~') || (a.id - b.id));
        const draft = []; // lignes pas encore enregistrées (sans nom)
        const nextHousehold = () => { const ks = (r.people || []).map(x => parseInt(x.household_key, 10)).filter(Number.isFinite); return String(ks.length ? Math.max(...ks) + 1 : 1); };
        const all = () => [...rows, ...draft];
        const render = focus => {
            let lastHh = null;
            box.innerHTML = `<table class="h-dp-table"><thead><tr>${COLS.map(([k, l, w]) => `<th style="width:${w}%">${esc(l)}</th>`).join('')}<th class="h-dp-fiche">Fiche</th><th></th></tr></thead><tbody>${all().map((x, i) => {
                const hh = (x.household_key || '').trim(), band = hh !== lastHh; lastHh = hh;
                return `${band ? `<tr class="h-dp-band"><td colspan="${COLS.length + 2}">🏠 ${hh ? `Foyer ${esc(hh)}` : 'Sans foyer'}${x.address ? ` · ${esc(x.address)}` : ''}</td></tr>` : ''}<tr data-dp-i="${i}" class="${x.id ? '' : 'is-draft'}">${COLS.map(([k]) => `<td><input data-dp-k="${k}" value="${esc(x[k] || '')}"></td>`).join('')}
                    <td class="h-dp-fiche">${x.person_id ? `<button type="button" class="link-button" data-open-person="${x.person_id}" title="Ouvrir la fiche">👤 ${esc(x.person_name || '')}</button><button type="button" class="icon-button" data-dp-unp title="Ne plus rattacher à la fiche">✕</button>` : `<button type="button" class="icon-button" data-dp-p title="Rattacher à une fiche existante, ou créer la fiche">👤</button>`}</td>
                    <td><button type="button" class="icon-button danger" data-dp-del title="Supprimer cette personne relevée">🗑</button></td></tr>`; }).join('') || `<tr><td colspan="${COLS.length + 2}" class="muted">Personne relevée sur cette page : « + Personne » ou colle des lignes depuis un tableur.</td></tr>`}</tbody></table>`;
            bind();
            if (focus) box.querySelector(focus)?.focus();
        };
        const payload = (x, extra = {}) => ({id: x.id || 0, archive_digest_id: r.id, page_number: pageNumber, person_mode: x.person_id ? 'existing' : 'manual', person_id: x.person_id || '',
            ...Object.fromEntries(COLS.map(([k]) => [k, x[k] || ''])), employer: x.employer || '', personal_status: x.personal_status || '', extra_info: x.extra_info || '', ...extra});
        const save = async (x, extra = {}) => {
            if (!x.id && !(x.first_name || '').trim() && !(x.last_name || '').trim() && !extra.person_mode) return false; // une ligne sans nom attend
            const res = await post('save_archive_digest_person', payload(x, extra)); const out = res.result || res;
            x.page_number = pageNumber;
            if (!x.id) { x.id = out.id; draft.splice(draft.indexOf(x), 1); rows.push(x); (r.people ||= []).push(x); }
            if (out.person_id) x.person_id = out.person_id;
            return true;
        };
        let timers = new Map();
        function bind() {
            box.querySelectorAll('tr[data-dp-i]').forEach(tr => {
                const x = all()[Number(tr.dataset.dpI)];
                tr.querySelectorAll('[data-dp-k]').forEach(inp => {
                    inp.addEventListener('input', () => { x[inp.dataset.dpK] = inp.value; clearTimeout(timers.get(x)); timers.set(x, setTimeout(() => save(x).catch(e => toast(e.message, 'error')), 700)); });
                    inp.addEventListener('blur', () => { if (['household_key', 'address'].includes(inp.dataset.dpK)) { clearTimeout(timers.get(x)); save(x).then(ok => { if (ok) render(); }).catch(e => toast(e.message, 'error')); } });
                    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const col = inp.dataset.dpK, nextTr = tr.nextElementSibling?.matches('.h-dp-band') ? tr.nextElementSibling.nextElementSibling : tr.nextElementSibling; const target = nextTr?.querySelector(`[data-dp-k="${col}"]`); if (target) target.focus(); else add(false, x.household_key, x.address, col); } });
                    inp.addEventListener('paste', e => {
                        const txt = e.clipboardData?.getData('text/plain') || '';
                        if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return;
                        e.preventDefault(); pasteRows(Number(tr.dataset.dpI), COLS.findIndex(([k]) => k === inp.dataset.dpK), txt);
                    });
                });
                tr.querySelector('[data-dp-del]').addEventListener('click', async () => {
                    if (x.id) { if (!confirm(`Supprimer ${[x.first_name, x.last_name].filter(Boolean).join(' ') || 'cette personne'} du relevé ?`)) return; await post('delete_archive_digest_person', {id: x.id}); rows.splice(rows.indexOf(x), 1); r.people = r.people.filter(y => y !== x); }
                    else draft.splice(draft.indexOf(x), 1);
                    render();
                });
                tr.querySelector('[data-dp-p]')?.addEventListener('click', () => pickPerson(x).then(ok => { if (ok) render(); }));
                tr.querySelector('[data-dp-unp]')?.addEventListener('click', async () => { if (!confirm('Ne plus rattacher cette personne relevée à la fiche ?')) return; x.person_id = null; x.person_name = ''; await save(x); render(); });
            });
        }
        function add(newHousehold, hh = '', address = '', focusCol = 'last_name') {
            const last = all()[all().length - 1];
            const x = {household_key: newHousehold ? nextHousehold() : (hh || last?.household_key || ''), address: newHousehold ? '' : (address || last?.address || '')};
            draft.push(x); render(`tr[data-dp-i="${all().length - 1}"] [data-dp-k="${newHousehold ? 'address' : focusCol}"]`);
        }
        async function pasteRows(i0, c0, txt) {
            const lines = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
            const base = all()[i0];
            for (let i = 0; i < lines.length; i++) {
                let x = all()[i0 + i];
                if (!x) { x = {household_key: base?.household_key || '', address: base?.address || ''}; draft.push(x); }
                lines[i].forEach((v, j) => { const col = COLS[c0 + j]; if (col) x[col[0]] = v.trim(); });
                await save(x).catch(e => toast(e.message, 'error'));
            }
            toast(`${lines.length} ligne(s) collée(s).`); render();
        }
        function pickPerson(x) {
            return new Promise(resolve => {
                let done = false; const end = v => { if (!done) { done = true; resolve(v); } };
                const guess = [x.first_name, x.last_name].filter(Boolean).join(' ');
                dialog({eyebrow: 'PERSONNE RELEVÉE', title: guess || 'Rattacher à une fiche', submitLabel: 'Rattacher',
                    body: `<label>Chercher la fiche<input type="search" name="q" value="${esc(guess)}" autocomplete="off" placeholder="Nom, prénom…"></label>
                        <label>Résultat<select name="key" size="7"></select></label>
                        <label class="checkbox-line"><input type="checkbox" name="create"> Pas encore de fiche : <b>créer la fiche</b> avec ce nom (à vérifier)</label>`,
                    onOpen: d => {
                        d.addEventListener('close', () => setTimeout(() => end(false), 0), {once: true});
                        const q = d.querySelector('[name=q]'), sel = d.querySelector('[name=key]'); let tm = 0;
                        const search = async () => { const v = q.value.trim(); if (v.length < 2) { sel.innerHTML = ''; return; }
                            let res = (await get('recueil_search', {type: 'person', q: v}).catch(() => ({results: []}))).results || [];
                            if (!res.length && v.includes(' ')) res = (await get('recueil_search', {type: 'person', q: v.split(/\s+/).pop()}).catch(() => ({results: []}))).results || [];
                            sel.innerHTML = res.map(o => `<option value="${esc(o.key)}">${esc(o.label)}${o.extra ? ` (${esc(o.extra)})` : ''}</option>`).join(''); if (sel.options.length) sel.selectedIndex = 0; };
                        q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(search, 250); }); search(); setTimeout(() => q.focus(), 50);
                    },
                    onSubmit: async form => {
                        if (form.querySelector('[name=create]').checked) { await save(x, {person_mode: 'create'}); x.person_name = [x.first_name, x.last_name].filter(Boolean).join(' '); toast('Fiche créée (à vérifier) et rattachée.'); end(true); return; }
                        const opt = form.querySelector('[name=key]').selectedOptions[0];
                        if (!opt) { toast('Choisis la fiche dans la liste, ou coche « créer la fiche ».', 'error'); return false; }
                        x.person_id = Number(opt.value); x.person_name = opt.textContent.replace(/\s*\(.*\)$/, '');
                        await save(x); toast(`Rattachée à ${x.person_name}.`); end(true);
                    },
                });
            });
        }
        peopleTable.add = add;
        render();
    }

    /* ─── Tous les foyers du dépouillement ─── */
    function paintPeople(body) {
        const r = D.row, ppl = r.people || [];
        const byHh = new Map();
        ppl.forEach(x => { const k = (x.household_key || '').trim() || '—'; if (!byHh.has(k)) byHh.set(k, []); byHh.get(k).push(x); });
        const keys = [...byHh.keys()].sort(natural);
        body.innerHTML = ppl.length ? `<p class="muted">${plural(ppl.length, 'personne relevée', 'personnes relevées')} dans ${plural(households(ppl), 'foyer', 'foyers')}. Clique sur une page pour modifier.</p>
            <div class="h-dp-hhs">${keys.map(k => { const list = byHh.get(k), pages = [...new Set(list.map(x => x.page_number).filter(Boolean))].sort(natural), addr = list.find(x => x.address)?.address;
                return `<article class="h-dp-hh maintenance-panel"><h4>🏠 ${k === '—' ? 'Sans foyer' : 'Foyer ' + esc(k)}${addr ? ` <small class="muted">${esc(addr)}</small>` : ''}</h4>
                    <ul>${list.map(x => `<li>${x.person_id ? `<button type="button" class="table-link" data-open-person="${x.person_id}">${esc(x.person_name || [x.first_name, x.last_name].join(' '))}</button>` : `<b>${esc([x.first_name, x.last_name].filter(Boolean).join(' ') || 'Sans nom')}</b>`} <small class="muted">${esc([x.household_position, x.age_text && x.age_text + ' ans', x.occupation].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>
                    ${pages.length ? `<small>${pages.map(n => `<button type="button" class="link-button" data-dp-gopage="${esc(n)}">page ${esc(n)}</button>`).join(', ')}</small>` : ''}</article>`; }).join('')}</div>`
            : A().empty('Personne relevée pour l’instant : ouvre une page et utilise « + Personne ».');
        body.querySelectorAll('[data-dp-gopage]').forEach(b => b.addEventListener('click', () => { Object.assign(st(), {tab: 'pages', page: b.dataset.dpGopage, image: 0}); paint(); }));
    }

    /* ─── La fiche du dépouillement (lecture ; on la modifie dans Recherche) ─── */
    function paintInfo(body) {
        const r = D.row, f = (l, v) => v ? `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>` : '';
        body.innerHTML = `<div class="maintenance-panel"><dl class="h-dp-info">${f('Commune', r.place_name || r.city_name)}${f('Lieu-dit / ancien nom', r.city_alias)}${f('Département', r.department)}${f('Région', r.region)}${f('Type', D.types[r.record_type])}${f('Années', r.year_text)}${f('Service d’archives', r.archive_service)}${f('Cote', r.archive_reference)}${f('État', D.statuses[r.status])}${f('Nombre de pages / vues', r.page_total)}${f('Ce que je cherchais', r.searched)}${f('Ce que j’ai trouvé', r.found)}${f('Notes', r.notes)}</dl>
            <p><button type="button" class="button small" data-dp-edit2>Modifier la fiche (dans Recherche)</button></p></div>`;
        body.querySelector('[data-dp-edit2]').addEventListener('click', () => openInResearch(r.id, true));
    }

    /* ─── Ajouter des photos (sur une page, ou « à ranger ») ─── */
    function addPhotos(pageNumber = '') {
        const pages = pagesOf(D.row, D.lines);
        dialog({eyebrow: 'DÉPOUILLEMENT', title: 'Ajouter des photos', submitLabel: 'Ajouter',
            body: `<label class="h-rc-drop"><input type="file" name="files" accept="image/*,application/pdf" multiple required><span>📷 Choisis les photos (dans l’ordre : le nom du fichier compte)</span></label>
                <fieldset class="h-rc-modes"><legend>Où les mettre ?</legend>
                    <label class="checkbox-line"><input type="radio" name="mode" value="page" ${pageNumber ? 'checked' : ''}> Toutes sur la page <select name="page">${pages.map(p => `<option value="${esc(p.number)}" ${p.number === pageNumber ? 'selected' : ''}>${esc(p.number)}</option>`).join('')}</select></label>
                    <label class="checkbox-line"><input type="radio" name="mode" value="seq" ${pageNumber ? '' : 'checked'}> Une photo par page, en commençant à la page <input name="start" value="${esc(pageNumber || suggestNext())}" class="h-lr-year"> (2, 3, 4… à la suite)</label>
                    <label class="checkbox-line"><input type="radio" name="mode" value="loose"> <b>À ranger</b> : je choisirai la page plus tard</label></fieldset>
                <p class="muted" data-dp-progress></p>`,
            onSubmit: async form => {
                const f = new FormData(form), files = [...form.querySelector('[name=files]').files].sort((a, b) => a.name.localeCompare(b.name, 'fr', {numeric: true}));
                const mode = f.get('mode'), prog = form.querySelector('[data-dp-progress]');
                const start = String(f.get('start') || '1').trim(), m = start.match(/^(.*?)(\d+)(\D*)$/);
                const numberFor = i => mode === 'page' ? String(f.get('page') || '') : mode === 'loose' ? '' : m ? `${m[1]}${Number(m[2]) + i}${m[3]}` : (i ? `${start}-${i + 1}` : start);
                for (let i = 0; i < files.length; i++) {
                    prog.textContent = `Envoi : ${i + 1} / ${files.length}…`;
                    const n = numberFor(i);
                    if (n && !pages.some(p => p.number === n)) { await post('save_archive_digest_page', {archive_digest_id: D.row.id, number: n, old_number: ''}).catch(() => {}); pages.push({number: n}); }
                    const fd = new FormData(); fd.append('archive_digest_id', D.row.id); fd.append('archive_digest_page_number', n); fd.append('csrf', S().csrf); fd.append('files[]', files[i]);
                    const res = await fetch('upload.php', {method: 'POST', body: fd}); const out = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                    if (!res.ok || out.error) throw new Error(out.error || 'Envoi impossible');
                }
                toast(`${plural(files.length, 'photo ajoutée', 'photos ajoutées')}.`);
                if (mode === 'page') st().page = String(f.get('page')); else if (mode === 'seq' && files.length === 1) st().page = numberFor(0);
                await reload();
            }});
    }
})();
