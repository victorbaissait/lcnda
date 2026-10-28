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
    const COLS = [['household_key', 'Foyer', 5], ['address', 'Adresse', 12], ['last_name', 'Nom', 11], ['first_name', 'Prénom', 11], ['age_text', 'Âge', 5], ['household_position', 'Place dans le foyer', 10], ['occupation', 'Profession', 11], ['birth_place', 'Lieu de naissance', 10], ['nationality', 'Nationalité', 8], ['notes', 'Notes', 12]];

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
    const households = people => new Set(people.map(p => `${p.page_number}|${p.household_uid || (p.household_key || '').trim()}`).filter(k => !k.endsWith('|'))).size;

    /* ─────────── Liste ─────────── */
    ext.lists.depouillements = async token => {
        const s = st();
        if (s.id) return renderDigest(token);
        // H10 : recherche, filtres (type, état), Liste | Fiches et tri retenus dans la barre commune (« lcnda-listbar:listes:depouillements »)
        const UI = window.LCNDA_UI, KEY = 'listes:depouillements', saved = UI?.listBarState?.(KEY);
        if (saved) { s.q = String(saved.q || '').trim(); s.type = saved.f?.type || ''; s.status = saved.f?.status || ''; }
        const data = await get('archive_digest_search', {q: s.q || '', record_type: s.type || '', status: s.status || ''});
        if (!isCurrent(token)) return;
        const types = data.types || {}, statuses = data.statuses || {};
        const sort = saved?.sort ?? (UI?.sortOf ? UI.sortOf(KEY, '') : ''), view = UI?.viewOf ? UI.viewOf(KEY, 'cards') : 'cards';
        const nameOf = r => `${types[r.record_type] || r.record_type || 'Dépouillement'}${r.year_text ? ' · ' + r.year_text : ''}`;
        const rows = sort && UI?.sortItems ? UI.sortItems(data.rows || [], sort, {name: nameOf, date: r => r.updated_at || r.created_at || ''}) : (data.rows || []);
        const ws = A().$('#workspace');
        const groups = new Map();
        rows.forEach(r => { const c = (r.place_name || r.city_name || r.city_alias || 'Commune non précisée').trim(); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(r); });
        const card = r => {
            const pages = pagesOf(r), cover = (r.media || []).find(m => isImage(m) && String(m.archive_page_number || '').trim()) || (r.media || []).find(isImage);
            const done = pages.filter(p => ['checked', 'empty'].includes(p.status)).length, total = Number(r.page_total) || pages.length, pct = total ? Math.min(100, Math.round(done / total * 100)) : 0, ls = loose(r).length;
            // K9 : la vignette unique (UI.cardsHtml)
            return {thumb: cover ? `<img src="${esc(thumb(cover))}" alt="" loading="lazy">` : '<span class="ui-card-ico">📜</span>', name: `${types[r.record_type] || r.record_type || 'Dépouillement'}${r.year_text ? ' · ' + r.year_text : ''}`, open: `data-dp-open="${r.id}"`,
                lines: [[r.city_alias && r.city_alias !== (r.place_name || r.city_name) ? r.city_alias : '', r.archive_service, r.archive_reference].filter(Boolean).join(' · ') || 'Service d’archives à préciser', `👥 ${(r.people || []).length} · 🏠 ${plural(households(r.people || []), 'foyer', 'foyers')}${r.page_total ? ` · 📷 ${plural(r.page_total, 'vue', 'vues')}` : ''}${r.doc_pages ? ` · 📄 ${plural(r.doc_pages, 'page', 'pages')}` : ''}`],
                badges: [{text: statuses[r.status] || r.status || '', kind: r.status === 'done' ? 'green' : 'blue'}, ext.journal?.RESULTS?.[r.result] ? {text: ext.journal.RESULTS[r.result][0], kind: ext.journal.RESULTS[r.result][1]} : null, {text: `${pct} % dépouillé`, kind: pct >= 100 ? 'green' : 'grey'}, ls ? {text: plural(ls, 'photo à ranger', 'photos à ranger'), kind: 'yellow'} : null].filter(b => b && b.text)};
        };
        const line = r => { const pages = pagesOf(r), cover = (r.media || []).find(m => isImage(m) && String(m.archive_page_number || '').trim()) || (r.media || []).find(isImage);
            const done = pages.filter(p => ['checked', 'empty'].includes(p.status)).length, total = Number(r.page_total) || pages.length, pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
            return {thumb: cover ? `<img src="${esc(thumb(cover))}" alt="" loading="lazy">` : '<span class="ui-card-ico">📜</span>', name: nameOf(r), open: `data-dp-open="${r.id}"`, lines: [[r.archive_service, r.archive_reference].filter(Boolean).join(' · '), `${statuses[r.status] || r.status || ''}${ext.journal?.RESULTS?.[r.result] ? ' · ' + ext.journal.RESULTS[r.result][0] : ''} · ${plural(pages.length, 'page', 'pages')} · ${pct} % dépouillé · 👥 ${(r.people || []).length}`], date: ''}; };
        const group = list => view === 'list' && UI?.rowsHtml ? UI.rowsHtml(list.map(line)) : UI.cardsHtml(list.map(card));
        ws.innerHTML = `<section class="page collection-page h-rc h-dp">
            <header class="page-header"><div><span class="eyebrow">LISTES · ARCHIVES</span><h2>📜 Dépouillements</h2>
                <p>Tes dépouillements d’archive page par page : les photos de chaque page, les personnes relevées rangées par foyer, la transcription. <b>Ce sont les mêmes que dans Recherche › Dépouillement d’archive</b> : ce que tu saisis ici y est aussitôt, et inversement.</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-dp-research>↗ Ouvrir dans Recherche</button><button type="button" class="button secondary" data-dp-decennale title="La photo d’une table décennale : l’app lit les noms, les dates et les sortes d’actes, tu relis, puis le dépouillement est créé">📑 Lire une table décennale</button><button type="button" class="button" data-dp-new>＋ Nouveau dépouillement</button></div></header>
            <div data-dp-bar></div>
            ${rows.length ? [...groups.entries()].map(([c, list]) => `<h3 class="h-dp-city">🏘️ ${esc(c)} <small class="muted">${list.length}</small></h3>${group(list)}`).join('')
            : (s.q || s.type || s.status ? A().emptyState({icon: '🔍', text: 'Aucun dépouillement ne correspond.'}) : A().emptyState({icon: '📑', text: 'Aucun dépouillement pour l’instant', hint: 'La fiche du dépouillement se remplit dans Recherche.', action: {label: '＋ Nouveau dépouillement', attrs: 'data-dp-new'}}))}</section>`;
        const sec = ws.querySelector('.h-dp');
        const slot = sec.querySelector('[data-dp-bar]');
        if (slot && UI?.listBar) {
            const bar = UI.listBar({key: KEY, search: {placeholder: 'Chercher… (commune, cote, année, service d’archives)', value: s.q || ''},
                filters: [{id: 'type', label: 'Type', type: 'radio', options: [['', 'Tous les types'], ...Object.entries(types).map(([k, l]) => [k, l, l])], value: s.type || ''}, {id: 'status', label: 'État', type: 'radio', options: [['', 'Tous les états'], ...Object.entries(statuses).map(([k, l]) => [k, l, l])], value: s.status || ''}],
                view: {dflt: 'cards', what: 'dépouillements'}, sort: {options: [['', 'Par commune'], ['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
                onChange: b => { s.q = b.q.trim(); s.type = b.filters.type || ''; s.status = b.filters.status || ''; UI.setSort(KEY, b.sort); ext.lists.depouillements(++S().workspaceToken); }});
            bar.setCount(rows.length, 'dépouillement');
            slot.replaceWith(bar);
        }
        sec.querySelectorAll('[data-dp-open]').forEach(b => b.addEventListener('click', () => { Object.assign(s, {id: Number(b.dataset.dpOpen), page: '', tab: 'pages', image: 0}); ext.lists.depouillements(++S().workspaceToken); }));
        sec.querySelectorAll('[data-dp-new]').forEach(b => b.addEventListener('click', newInResearch));
        sec.querySelector('[data-dp-research]').addEventListener('click', () => openInResearch(0));
        sec.querySelector('[data-dp-decennale]')?.addEventListener('click', () => ext.openDecennale?.({onClose: id => { if (id && isCurrent(S().workspaceToken)) ext.lists.depouillements(++S().workspaceToken); }}));
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
        const tabs = [['pages', '📄', 'Pages', pages.length], ['people', '👥', 'Personnes et foyers', ppl.length], ['map', '🗺️', 'Plan', ''], ['info', '🗂️', 'Fiche du dépouillement', '']];
        ws.innerHTML = `<section class="page collection-page h-rc h-rc-one h-dp">
            <header class="page-header"><div><button type="button" class="back-link" data-dp-back>← Tous les dépouillements</button><span class="eyebrow">DÉPOUILLEMENT D’ARCHIVE</span><h2>📜 ${esc(titleOf(r, D.types))}${r.year_text ? ` <small>${esc(r.year_text)}</small>` : ''}</h2>
                <p class="muted">${esc([r.archive_service, r.archive_reference, D.statuses[r.status]].filter(Boolean).join(' · ')) || '&nbsp;'}${/^https?:\/\//i.test(String(r.archive_url || '').trim()) ? ` · <a href="${esc(String(r.archive_url).trim())}" target="_blank" rel="noopener">ouvrir l’archive en ligne ↗</a>` : ''}</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-dp-inresearch title="La même fiche, dans Recherche › Dépouillement d’archive">🔎 Dans Recherche</button><button type="button" class="button secondary" data-dp-edit>Modifier la fiche</button><button type="button" class="button" data-dp-addphotos>＋ Ajouter des photos</button></div></header>
            <div class="h-dp-counts"><label title="Le nombre de vues (images) du registre sur le site des archives">📷 Le scan en ligne fait <input type="number" min="0" data-dp-count="page_total" value="${esc(r.page_total ?? '')}" placeholder="?"> vues</label>
                <label title="Le nombre de pages du document lui-même (un scan peut avoir des vues de couverture, de mire, ou deux pages par vue)">📄 Le document fait <input type="number" min="0" data-dp-count="doc_pages" value="${esc(r.doc_pages ?? '')}" placeholder="?"> pages</label>
                <span class="muted">${(() => { const done = pages.filter(p => ['checked', 'empty'].includes(p.status)).length; return `${plural(done, 'page dépouillée', 'pages dépouillées')}${r.page_total ? ` sur ${r.page_total} vues (${Math.min(100, Math.round(done / r.page_total * 100))} %)` : ''}`; })()}</span><span class="muted" data-dp-countsaved></span></div>
            <div class="h-rc-tabs segmented">${tabs.map(([k, icon, label, n]) => `<button type="button" class="${s.tab === k ? 'is-active' : ''}" data-dp-tab="${k}">${icon} ${label}${n !== '' ? ` <small>${n}</small>` : ''}</button>`).join('')}
                <span class="h-rc-tabs-info muted">${plural(pages.length, 'page', 'pages')} · ${plural(households(ppl), 'foyer', 'foyers')}${loose(r).length ? ` · <button type="button" class="link-button h-rc-warn" data-dp-goloose>${plural(loose(r).length, 'photo à ranger', 'photos à ranger')}</button>` : ''}</span></div>
            <div class="h-rc-body"></div></section>`;
        const sec = ws.querySelector('.h-dp');
        let ct = 0;
        sec.querySelectorAll('[data-dp-count]').forEach(inp => inp.addEventListener('input', () => { clearTimeout(ct); ct = setTimeout(async () => {
            const v = {}; sec.querySelectorAll('[data-dp-count]').forEach(i => { v[i.dataset.dpCount] = i.value; });
            try { const res = await post('save_archive_digest_counts', {archive_digest_id: r.id, ...v}); Object.assign(r, res.result || res); sec.querySelector('[data-dp-countsaved]').textContent = '✓ enregistré'; } catch (e) { toast(e.message, 'error'); }
        }, 600); }));
        sec.querySelector('[data-dp-back]').addEventListener('click', () => { Object.assign(s, {id: 0, page: ''}); ext.lists.depouillements(++S().workspaceToken); });
        sec.querySelector('[data-dp-inresearch]').addEventListener('click', () => openInResearch(r.id));
        sec.querySelector('[data-dp-edit]').addEventListener('click', () => openInResearch(r.id, true));
        sec.querySelector('[data-dp-addphotos]').addEventListener('click', () => addPhotos(s.tab === 'pages' ? s.page : ''));
        sec.querySelectorAll('[data-dp-tab]').forEach(b => b.addEventListener('click', () => { s.tab = b.dataset.dpTab; s.page = ''; paint(); }));
        sec.querySelector('[data-dp-goloose]')?.addEventListener('click', () => { s.tab = 'pages'; s.page = ''; paint(); sec.querySelector('.h-rc-loose')?.scrollIntoView({block: 'center'}); });
        const body = sec.querySelector('.h-rc-body');
        if (s.tab === 'people') return paintPeople(body);
        if (s.tab === 'info') return paintInfo(body);
        if (s.tab === 'map') { if (ext.addrMap) ext.addrMap(body, {digestId: r.id, year: (String(r.year_text || '').match(/(1[5-9]\d\d|20\d\d)/) || [])[1] || 0}); return; }
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
        body.innerHTML = `<div class="collection-toolbar h-rc-toolbar"><button type="button" class="button small secondary" data-dp-newpage>＋ Page</button>
                <span class="muted">Clique sur une page pour voir ses photos, ses personnes par foyer et sa transcription.</span></div>
            ${ls.length ? `<div class="h-rc-loose maintenance-panel"><h3>🧺 À ranger <small class="muted">${plural(ls.length, 'photo', 'photos')} sans page : choisis sa page</small></h3><div class="h-rc-loose-list">${ls.map(m => `<div class="h-rc-loose-item" data-dp-media="${m.id}">${isImage(m) ? `<button type="button" class="h-rc-thumb small" data-dp-zoom="${m.id}" title="Voir en grand"><img src="${esc(thumb(m))}" alt="" loading="lazy"></button>` : `<span class="h-rc-thumb small">📄</span>`}<small>${esc(m.title || '')}</small>${pageSelect('data-dp-assign', '', 'Mettre sur la page…')}</div>`).join('')}</div></div>` : ''}
            ${pages.length ? `<div class="h-rc-pages">${pages.map(p => {
                const ms = pageMedia(r, p.number), img = ms.find(isImage), ppl = (r.people || []).filter(x => String(x.page_number || '').trim() === p.number), [lab, col] = PAGE_STATUS[p.status] || PAGE_STATUS.todo;
                return `<button type="button" class="h-rc-page" data-dp-page="${esc(p.number)}"><span class="h-rc-thumb">${img ? `<img src="${esc(thumb(img))}" alt="" loading="lazy">` : '<span class="h-rc-nophoto">pas de photo</span>'}<span class="h-rc-num">${esc(p.number)}</span></span>
                    <span class="h-rc-page-name"><i class="h-dp-dot" style="background:${col}" title="${esc(lab)}"></i> ${esc(lab)}</span>
                    <span class="h-rc-page-meta"><small>${ppl.length ? `👥 ${ppl.length} · 🏠 ${households(ppl)}` : esc(CONTENT[p.content_type] || '')}${p.act_from ? ` · actes ${esc(p.act_from)}${p.act_to ? '–' + esc(p.act_to) : ''}` : ''}</small></span></button>`; }).join('')}</div>`
            : A().emptyState({icon: '📄', text: 'Aucune page pour l’instant', hint: '« ＋ Page » pour une page sans photo, ou ajoute les photos du registre.', action: {label: '＋ Ajouter des photos', attrs: 'data-dp-add-empty'}})}`;
        body.querySelector('[data-dp-newpage]').addEventListener('click', async () => { const n = await pageFromSelect('__new'); if (n) { st().page = n; await reload(); } });
        body.querySelector('[data-dp-add-empty]')?.addEventListener('click', () => addPhotos(''));
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
                <span class="h-rc-pagenav"><button type="button" class="button small secondary" data-dp-go="${esc(prev?.number ?? '')}" ${prev ? '' : 'disabled'} title="Page précédente" data-shortcut="⌥←">‹</button>
                <select data-dp-jump>${pages.map(x => `<option value="${esc(x.number)}" ${x.number === p.number ? 'selected' : ''}>Page ${esc(x.number)}</option>`).join('')}</select>
                <button type="button" class="button small secondary" data-dp-go="${esc(next?.number ?? '')}" ${next ? '' : 'disabled'} title="Page suivante" data-shortcut="⌥→">›</button></span>
                <span class="muted">${idx + 1} / ${pages.length}</span></div>
            <div class="h-rc-pageview">
                <div class="h-rc-stage-wrap">
                    <div class="h-rc-stage">${imgs.length > 1 ? `<button type="button" class="h-rc-imgnav is-prev" data-dp-imgstep="-1" title="Photo précédente de cette page" data-shortcut="←">‹</button><button type="button" class="h-rc-imgnav is-next" data-dp-imgstep="1" title="Photo suivante de cette page" data-shortcut="→">›</button><span class="h-rc-imgcount">${imgs.indexOf(cur) + 1} / ${imgs.length}</span>` : ''}
                        ${cur ? `<figure class="h-rc-figure"><img src="${esc(full(cur))}" alt="" data-dp-zoomcur title="Cliquer : agrandir, pivoter, retoucher"><figcaption>${esc(cur.title || '')}</figcaption></figure>` : `<div class="h-rc-nophoto big">Pas de photo pour cette page.<br><button type="button" class="button small" data-dp-addhere>＋ Ajouter une photo de cette page</button></div>`}</div>
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
                <span>${(() => { const lk = isLocked(r.id, p.number); return `<button type="button" class="icon-button h-dp-lock ${lk ? 'is-locked' : ''}" data-dp-lock title="${lk ? 'Tableau verrouillé : clique pour pouvoir le modifier' : 'Verrouiller le tableau de cette page (évite les modifications par erreur)'}">${lk ? '🔒' : '🔓'}</button><button type="button" class="button small secondary" data-dp-addhh ${lk ? 'disabled' : ''}>＋ Foyer</button><button type="button" class="button small" data-dp-addp ${lk ? 'disabled' : ''}>＋ Personne</button>${ext.sheetBase ? '<button type="button" class="button small secondary" data-dp-sheet title="Rue, n°, foyer, nom, prénom, âge, métier, lien : dans le tableur, tenus à jour ; « 📤 Envoyer vers la base » y crée ou relie les fiches">🧾 Dans le tableur</button>' : ''}`; })()}</span></header>
                <p class="muted h-dp-hint">Rangées par rue › n° › foyer, dans l’ordre du document. Un foyer a un numéro et une adresse (n° et rue sur sa ligne), que partagent ses personnes. « ＋ Foyer » propose le numéro suivant ; tu peux en mettre un autre (12 bis, numéro sauté…). Coller depuis un tableur remplit les lignes.</p>
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
        body.querySelector('[data-dp-unlink]')?.addEventListener('click', async () => { try { await post('unlink_archive_digest_media', {archive_digest_id: r.id, media_id: cur.id}); } catch (e) { return toast(e.message, 'error'); } // H7 : pas de question, « ↶ Annuler »
            const was = s.image; s.image = 0; reload(); A().undoToast('Photo retirée du dépouillement (elle reste dans Médias).', {undo: async () => { await post('link_archive_digest_media', {archive_digest_id: r.id, media_id: cur.id, page_number: cur.page_number || ''}); s.image = was; reload(); }}); });
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
            const nPeople = (r.people || []).filter(x => String(x.page_number || '').trim() === p.number).length, nLines = lines.length;
            if (!await A().confirmBox(`Supprimer la page ${p.number} ?${ms.length ? `\n\n${ms.length > 1 ? `Ses ${ms.length} photos passent` : 'Sa photo passe'} « à ranger ».` : ''}${nPeople || nLines ? `\n${[nPeople && (nPeople > 1 ? `Ses ${nPeople} personnes relevées` : 'Sa personne relevée'), nLines && (nLines > 1 ? `ses ${nLines} lignes de transcription` : 'sa ligne de transcription')].filter(Boolean).join(' et ')} ${nPeople + nLines > 1 ? 'seront supprimées' : 'sera supprimée'} aussi (gardées dans l’Historique).` : ''}`, {title: 'Supprimer la page', okLabel: 'Supprimer la page'})) return;
            await post('save_archive_digest_page', {archive_digest_id: r.id, old_number: p.number, delete: 1, delete_content: 1}); delete DRAFTS[`${r.id}:${p.number}`]; s.page = (next || prev)?.number || ''; toast('Page supprimée.'); reload();
        });
        // transcription : chaque ligne s'enregistre ; Entrée dans la dernière en crée une nouvelle
        const lineSave = async (el, l) => { const v = el.value.trim(); if (v === l.content) return; if (!v) return; try { await post('save_archive_digest_transcription_line', {id: l.id, archive_digest_id: r.id, media_id: l.media_id || '', page_number: p.number, line_number: l.line_number, content: v, zone_json: l.zone_json || ''}); l.content = v; } catch (e) { toast(e.message, 'error'); } };
        body.querySelectorAll('[data-dp-line]').forEach(row => {
            const l = lines.find(x => x.id === Number(row.dataset.dpLine)), ta = row.querySelector('[data-dp-ltext]');
            autosize(ta); ta.addEventListener('input', () => autosize(ta)); ta.addEventListener('blur', () => lineSave(ta, l));
            row.querySelector('[data-dp-ldel]').addEventListener('click', async () => { // H7 : supprimée tout de suite, « ↶ Annuler » la remet telle quelle
                try { await post('delete_archive_digest_transcription_line', {id: l.id}); } catch (e) { toast(e.message, 'error'); return; }
                D.lines = D.lines.filter(x => x !== l); paint();
                let line = l; const again = () => { if (body.isConnected) paint(); };
                A().undoToast?.('Ligne supprimée', {undo: async () => { const res = await post('save_archive_digest_transcription_line', {archive_digest_id: r.id, media_id: line.media_id || '', page_number: line.page_number ?? p.number, line_number: line.line_number, content: line.content, zone_json: line.zone_json || ''}); line = {...line, id: Number((res.result || res).id)}; D.lines.push(line); D.lines.sort((a, b) => (a.page_number - b.page_number) || (a.line_number - b.line_number)); again(); },
                    redo: async () => { await post('delete_archive_digest_transcription_line', {id: line.id}); D.lines = D.lines.filter(x => x.id !== line.id); again(); }}); });
        });
        const nl = body.querySelector('[data-dp-lnew]');
        nl.addEventListener('keydown', async e => {
            if (e.key !== 'Enter' || e.shiftKey) return; e.preventDefault();
            const v = nl.value.trim(); if (!v) return;
            const num = (lines[lines.length - 1]?.line_number || lines.length) + 1;
            try { const res = await post('save_archive_digest_transcription_line', {archive_digest_id: r.id, media_id: cur?.id || '', page_number: p.number, line_number: num, content: v}); D.lines.push({id: (res.result || res).id, page_number: p.number, line_number: num, content: v, media_id: cur?.id || null, zone_json: ''}); paint(); body.isConnected; A().$('[data-dp-lnew]')?.focus(); } catch (err) { toast(err.message, 'error'); }
        });
        peopleTable(body.querySelector('[data-dp-table]'), p.number, isLocked(r.id, p.number));
        body.querySelector('[data-dp-lock]').addEventListener('click', () => { setLocked(r.id, p.number, !isLocked(r.id, p.number)); toast(isLocked(r.id, p.number) ? `Tableau de la page ${p.number} verrouillé.` : 'Tableau déverrouillé : tu peux le modifier.'); paint(); });
        body.querySelector('[data-dp-addp]').addEventListener('click', () => peopleTable.add?.(false));
        body.querySelector('[data-dp-addhh]').addEventListener('click', () => peopleTable.add?.(true));
        body.querySelector('[data-dp-sheet]')?.addEventListener('click', () => ext.sheetBase.openFilled({src: {source: 'digest', filters: {digest_id: r.id, page: p.number}}, cols: ['street', 'house', 'household', 'last_name', 'first_name', 'age', 'occupation', 'position', 'person'], name: `${r.city_name || 'Relevé'} — page ${p.number}`, sheetName: `Page ${p.number}`})); // 🧾 heritage-tableur-base.js
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

    /* ─── Tableau des personnes d'une page (archive_digest_people), rangées rue › numéro › foyer, dans l'ordre du document ─── */
    /** « 3 bis rue de la Seine » → {house: '3 bis', street: 'rue de la Seine'} ; l'adresse enregistrée reste le texte entier (Recherche la montre telle quelle). */
    const parseAddr = a => { a = String(a || '').trim(); let m = a.match(/^(\d+\s*(?:bis|ter|quater|[a-d])?)(?:\s*,\s*|\s+)(.+)$/i); if (m) return {house: m[1].trim(), street: m[2].trim()}; m = a.match(/^(\d+\s*(?:bis|ter|quater|[a-d])?)$/i); return m ? {house: m[1].trim(), street: ''} : {house: '', street: a}; };
    const joinAddr = (house, street) => [String(house || '').trim(), String(street || '').trim()].filter(Boolean).join(' ');
    /** Cadenas du tableau d'une page (retenu pour chaque page de chaque dépouillement). */
    const locks = () => { try { return JSON.parse(localStorage.getItem('genealogie-dp-locks') || '{}') || {}; } catch (_) { return {}; } };
    const isLocked = (id, page) => !!locks()[`${id}:${page}`];
    const setLocked = (id, page, on) => { const l = locks(); if (on) l[`${id}:${page}`] = 1; else delete l[`${id}:${page}`]; try { localStorage.setItem('genealogie-dp-locks', JSON.stringify(l)); } catch (_) {} };
    const DRAFTS = {};
    const newUid = () => 'n:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    function peopleTable(box, pageNumber, locked = false) {
        const r = D.row;
        const rows = (r.people || []).filter(x => String(x.page_number || '').trim() === pageNumber);
        const draft = (DRAFTS[`${r.id}:${pageNumber}`] ||= []); // lignes pas encore enregistrées (sans nom) : gardées si la page se redessine
        let seq = 0; const order = new WeakMap(); // ordre d'arrivée des lignes pas encore enregistrées
        const all = () => [...rows, ...draft];
        const rank = x => x.id ? x.id : 1e12 + (order.get(x) ?? (order.set(x, ++seq), seq));
        const keyOf = x => String(x.household_key || '').trim();
        // Un foyer = une identité (household_uid), indépendante de son numéro ; ses personnes partagent son numéro et son adresse
        const uidOf = x => x.household_uid || (x.household_uid = keyOf(x) ? 'k:' + keyOf(x) : 'a:' + String(x.address || '').trim().toLowerCase());
        const members = uid => all().filter(x => uidOf(x) === uid);
        /** Foyers dans l'ordre où ils apparaissent dans le document (première ligne saisie), personnes dans l'ordre de saisie. */
        const sorted = () => { const first = new Map(); all().forEach(x => { const k = uidOf(x), v = rank(x); if (!first.has(k) || v < first.get(k)) first.set(k, v); }); return all().slice().sort((a, b) => (first.get(uidOf(a)) - first.get(uidOf(b))) || (rank(a) - rank(b))); };
        const suggestKey = () => { const ks = (r.people || []).concat(draft).map(x => parseInt(x.household_key, 10)).filter(Number.isFinite); const lastOnPage = sorted().map(x => parseInt(x.household_key, 10)).filter(Number.isFinite).pop(); return String(Number.isFinite(lastOnPage) ? lastOnPage + 1 : ks.length ? Math.max(...ks) + 1 : 1); };
        // 📑 table décennale : une ligne par acte (nom, prénoms, date, sorte d'acte), sans foyers ni adresses
        const isTable = r.template_key === 'table' || r.record_type === 'table_decennale';
        const COLS2 = isTable ? [['last_name', 'Nom', 20], ['first_name', 'Prénoms', 22], ['extra_info', 'Date', 16], ['personal_status', 'Acte', 11], ['notes', 'Notes', 19]]
            : [['last_name', 'Nom', 13], ['first_name', 'Prénom', 13], ['age_text', 'Âge', 5], ['household_position', 'Place dans le foyer', 12], ['occupation', 'Profession', 13], ['birth_place', 'Lieu de naissance', 12], ['nationality', 'Nationalité', 9], ['notes', 'Notes', 14]];
        const streets = () => [...new Set((r.people || []).map(x => parseAddr(x.address).street).filter(Boolean))];
        const render = focus => {
            // garder la case où l'on écrit (le tableau se redessine quand un foyer ou une adresse change)
            const ae = document.activeElement, keep = !focus && ae && box.contains(ae) && (ae.dataset?.dpK || ae.dataset?.dpHa) ? {sel: ae.dataset.dpK ? `tr[data-dp-i="${all().indexOf(all()[Number(ae.closest('tr')?.dataset.dpI)])}"] [data-dp-k="${ae.dataset.dpK}"]` : `tr[data-dp-hh="${CSS.escape(ae.closest('tr').dataset.dpHh)}"] [data-dp-ha="${ae.dataset.dpHa}"]`, a: ae.selectionStart, b: ae.selectionEnd} : null;
            const list = sorted(); let lastStreet = null, lastHouse = null, lastUid = null;
            const span = COLS2.length + 2;
            const FICHE_AT = COLS2.findIndex(([c]) => c === 'first_name') + 1; // la fiche juste après le prénom : visible sans faire défiler
            box.innerHTML = `<datalist id="h-dp-streets">${streets().map(n => `<option value="${esc(n)}">`).join('')}</datalist><table class="h-dp-table ${locked ? 'is-locked' : ''}"><colgroup>${COLS2.map(([k, l, w], j) => `${j === FICHE_AT ? '<col class="h-dp-fiche">' : ''}<col style="width:${w}%">`).join('')}<col></colgroup><tbody>${list.map(x => {
                const i = all().indexOf(x), uid = uidOf(x); let bands = '';
                if (isTable && lastUid === null) { bands += `<tr class="h-dp-colhead">${COLS2.map(([c, l], j) => `${j === FICHE_AT ? '<th class="h-dp-fiche">Fiche</th>' : ''}<th>${esc(l)}</th>`).join('')}<th></th></tr>`; lastUid = ''; }
                if (uid !== lastUid && !isTable) {
                    const ms = list.filter(y => uidOf(y) === uid), head = ms[0], ad = parseAddr(head.address), k = keyOf(head);
                    if (ad.street.toLowerCase() !== (lastStreet ?? '').toLowerCase() || lastStreet === null) { if (ad.street || lastStreet !== null) bands += `<tr class="h-dp-band is-street"><td colspan="${span}">🛣️ ${ad.street ? esc(ad.street) : '<span class="muted">Rue non précisée</span>'}</td></tr>`; lastStreet = ad.street; lastHouse = null; }
                    if (ad.house !== lastHouse) { if (ad.house) bands += `<tr class="h-dp-band is-house"><td colspan="${span}">🏠 n° ${esc(ad.house)}${ad.street ? ` <small class="muted">${esc(ad.street)}</small>` : ''}</td></tr>`; lastHouse = ad.house; }
                    bands += `<tr class="h-dp-band is-hh" data-dp-hh="${esc(uid)}"><td colspan="${span}"><div class="h-dp-hhrow"><b>👪 ${k ? `Foyer ${esc(k)}` : 'Foyer sans n°'}</b> <small class="muted">${plural(ms.length, 'personne', 'personnes')}</small>
                        ${locked ? '' : `<span class="h-dp-hhtools"><button type="button" class="h-dp-mini" data-dp-hhadd title="Ajouter une personne à ce foyer">＋ personne</button><button type="button" class="h-dp-mini" data-dp-hhren title="Changer le numéro de CE foyer">✎ n°</button><button type="button" class="h-dp-mini is-danger" data-dp-hhdel title="Supprimer ce foyer et ses personnes relevées">🗑</button></span>`}
                        <label class="h-dp-hhaddr" title="Numéro dans la rue (modifiable)">n° <input data-dp-ha="house" value="${esc(ad.house)}" placeholder="—" ${locked ? 'readonly' : ''}></label><label class="h-dp-hhaddr is-street" title="Rue (modifiable)">rue <input data-dp-ha="street" list="h-dp-streets" value="${esc(ad.street)}" placeholder="nom de la rue" ${locked ? 'readonly' : ''}></label></div></td></tr>`;
                    bands += `<tr class="h-dp-colhead">${COLS2.map(([c, l], j) => `${j === FICHE_AT ? '<th class="h-dp-fiche">Fiche</th>' : ''}<th>${esc(l)}</th>`).join('')}<th></th></tr>`; // les colonnes, dans chaque foyer
                    lastUid = uid;
                }
                const fiche = `<td class="h-dp-fiche">${x.person_id ? `<button type="button" class="link-button h-dp-plink" data-open-person="${x.person_id}" title="Ouvrir la fiche de ${esc(x.person_name || '')}">👤 ${esc(x.person_name || 'la fiche')}</button>${locked ? '' : '<button type="button" class="h-dp-mini" data-dp-unp title="Ne plus rattacher à la fiche">✕</button>'}` : locked ? '' : `<button type="button" class="h-dp-mini is-faint" data-dp-p title="Relier à une fiche existante, ou créer la fiche">＋ fiche</button>`}</td>`;
                return `${bands}<tr data-dp-i="${i}" class="${x.id ? '' : 'is-draft'}">${COLS2.map(([c], j) => `${j === FICHE_AT ? fiche : ''}<td><input data-dp-k="${c}" value="${esc(x[c] || '')}" ${locked ? 'readonly tabindex="-1"' : ''}></td>`).join('')}
                    <td>${locked ? '' : '<button type="button" class="h-dp-mini is-danger is-faint" data-dp-del title="Supprimer cette personne relevée">🗑</button>'}</td></tr>`; }).join('') || `<tr><td colspan="${span}" class="muted">Personne relevée sur cette page : « ＋ Foyer », puis les noms ; ou colle des lignes depuis un tableur.</td></tr>`}</tbody></table>`;
            bind();
            if (focus) box.querySelector(focus)?.focus();
            else if (keep) { const inp = box.querySelector(keep.sel); if (inp) { inp.focus(); try { inp.setSelectionRange(keep.a, keep.b); } catch (_) {} } }
        };
        const payload = (x, extra = {}) => ({id: x.id || 0, archive_digest_id: r.id, page_number: pageNumber, person_mode: x.person_id ? 'existing' : 'manual', person_id: x.person_id || '', household_uid: uidOf(x),
            ...Object.fromEntries(COLS.map(([k]) => [k, x[k] || ''])), employer: x.employer || '', personal_status: x.personal_status || '', extra_info: x.extra_info || '', ...extra});
        const save = (x, extra = {}) => {
            if (!x.id && !(x.first_name || '').trim() && !(x.last_name || '').trim() && !extra.person_mode && !x.person_id) return Promise.resolve(false); // une ligne sans nom attend
            // un enregistrement à la fois par ligne : sinon deux créations partiraient pour la même personne
            const run = async () => {
                const res = await post('save_archive_digest_person', payload(x, extra)); const out = res.result || res;
                x.page_number = pageNumber;
                if (!x.id) { x.id = out.id; const k = draft.indexOf(x); if (k >= 0) draft.splice(k, 1); if (!x._gone) { rows.push(x); (r.people ||= []).push(x); } }
                if (out.person_id) x.person_id = out.person_id;
                return true;
            };
            const p = (x._saving || Promise.resolve()).catch(() => {}).then(run);
            x._saving = p; return p;
        };
        /** Numéro ou adresse d'un foyer : pour toutes ses personnes (enregistrées et en cours de saisie). */
        const setHousehold = async (uid, change) => {
            const ms = members(uid);
            if (ms.some(x => x.id)) await post('save_archive_digest_household', {archive_digest_id: r.id, page_number: pageNumber, household_uid: uid, ...change});
            ms.forEach(x => { if ('new_key' in change) x.household_key = change.new_key; if ('address' in change) x.address = change.address; });
        };
        const timers = new Map();
        function bind() {
            if (locked) return; // verrouillé : rien ne se modifie (les liens vers les fiches restent cliquables)
            box.querySelectorAll('tr[data-dp-i]').forEach(tr => {
                const x = all()[Number(tr.dataset.dpI)];
                tr.querySelectorAll('[data-dp-k]').forEach(inp => {
                    const k = inp.dataset.dpK;
                    inp.addEventListener('input', () => { x[k] = inp.value; clearTimeout(timers.get(x)); timers.set(x, setTimeout(() => save(x).catch(e => toast(e.message, 'error')), 700)); });
                    inp.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); let n = tr.nextElementSibling; while (n && !n.matches('tr[data-dp-i]')) n = n.nextElementSibling; const t = n?.querySelector(`[data-dp-k="${k}"]`); if (t && uidOf(all()[Number(n.dataset.dpI)]) === uidOf(x)) t.focus(); else addTo(uidOf(x), k); });
                    inp.addEventListener('paste', e => {
                        const txt = e.clipboardData?.getData('text/plain') || '';
                        if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return;
                        e.preventDefault(); pasteRows(x, COLS2.findIndex(([c]) => c === k), txt);
                    });
                });
                tr.querySelector('[data-dp-del]').addEventListener('click', async () => {
                    if (x.id) { if (!await A().confirmBox(`Supprimer ${[x.first_name, x.last_name].filter(Boolean).join(' ') || 'cette personne'} du relevé ?`, {title: 'Supprimer du relevé', okLabel: 'Supprimer du relevé'})) return; await post('delete_archive_digest_person', {id: x.id}); rows.splice(rows.indexOf(x), 1); r.people = r.people.filter(y => y !== x); }
                    else { x._gone = true; const k = draft.indexOf(x); if (k >= 0) draft.splice(k, 1); }
                    render();
                });
                tr.querySelector('[data-dp-p]')?.addEventListener('click', () => pickPerson(x).then(ok => { if (ok) render(); }));
                tr.querySelector('[data-dp-unp]')?.addEventListener('click', async () => { if (!await A().confirmBox('Ne plus rattacher cette personne relevée à la fiche ?', {title: 'Détacher de la fiche', okLabel: 'Ne plus rattacher', danger: true})) return; x.person_id = null; x.person_name = ''; await save(x); render(); });
            });
            box.querySelectorAll('tr[data-dp-hh]').forEach(tr => {
                const uid = tr.dataset.dpHh, head = () => members(uid)[0] || {};
                tr.querySelector('[data-dp-hhadd]').addEventListener('click', () => addTo(uid));
                tr.querySelectorAll('[data-dp-ha]').forEach(inp => inp.addEventListener('change', async () => {
                    const ad = parseAddr(head().address); ad[inp.dataset.dpHa] = inp.value.trim();
                    try { await setHousehold(uid, {address: joinAddr(ad.house, ad.street)}); setTimeout(() => render(), 0); } catch (e) { toast(e.message, 'error'); }
                }));
                tr.querySelectorAll('[data-dp-ha]').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } }));
                tr.querySelector('[data-dp-hhren]').addEventListener('click', async () => {
                    const k = keyOf(head());
                    const nk = ((await A().askText({title: 'Numéro du foyer', message: 'Nouveau numéro de ce foyer seulement (tel qu’il est écrit dans le document, même s’il ne suit pas) :', value: k, okLabel: 'Renuméroter'})) ?? '').trim();
                    if (nk === k) return;
                    if (nk && all().some(y => uidOf(y) !== uid && keyOf(y) === nk) && !await A().confirmBox(`Un autre foyer de cette page porte déjà le n° ${nk}. Les deux garderont ce numéro mais resteront deux foyers distincts. Continuer ?`, {title: 'Numéro déjà pris', okLabel: 'Garder ce numéro'})) return;
                    try { await setHousehold(uid, {new_key: nk}); render(); toast(`Foyer n° ${nk || '—'}.`); } catch (e) { toast(e.message, 'error'); }
                });
                tr.querySelector('[data-dp-hhdel]').addEventListener('click', async () => {
                    const ms = members(uid), saved = ms.filter(x => x.id);
                    if (saved.length && !await A().confirmBox(`Supprimer le foyer ${keyOf(head()) || 'sans n°'} et ses ${plural(saved.length, 'personne relevée', 'personnes relevées')} ?\n\nLes fiches rattachées ne sont pas supprimées.`, {title: 'Supprimer le foyer', okLabel: 'Supprimer le foyer'})) return;
                    try { if (saved.length) await post('save_archive_digest_household', {archive_digest_id: r.id, page_number: pageNumber, household_uid: uid, delete: 1});
                        ms.forEach(x => { if (x.id) { rows.splice(rows.indexOf(x), 1); r.people = r.people.filter(y => y !== x); } else { x._gone = true; draft.splice(draft.indexOf(x), 1); } }); render(); toast('Foyer supprimé.'); } catch (e) { toast(e.message, 'error'); }
                });
            });
        }
        /** Nouvelle personne dans un foyer : même numéro, même adresse. */
        function addTo(uid, focusCol = 'last_name') {
            const base = members(uid)[0];
            const x = {household_uid: uid, household_key: base ? keyOf(base) : '', address: base?.address || ''}; draft.push(x);
            render(`tr[data-dp-i="${all().indexOf(x)}"] [data-dp-k="${focusCol}"]`);
        }
        /** « ＋ Foyer » : un nouveau foyer, avec le numéro qu'on dit (le suivant est proposé ; le document peut sauter ou répéter des numéros). */
        async function addHousehold() {
            const k = ((await A().askText({title: 'Nouveau foyer', message: 'Numéro du foyer (tel qu’il est écrit dans le document) :', value: suggestKey(), okLabel: 'Ajouter'})) ?? null);
            if (k === null) return;
            const last = sorted().pop(), street = parseAddr(last?.address).street; // même rue que le foyer d'avant ; le n° de maison se met sur la ligne du foyer
            const x = {household_uid: newUid(), household_key: k.trim(), address: street}; draft.push(x);
            render(`tr[data-dp-hh="${CSS.escape(x.household_uid)}"] [data-dp-ha="house"]`);
        }
        async function pasteRows(x0, c0, txt) {
            const lines = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
            const list = sorted(); const at = list.indexOf(x0);
            for (let i = 0; i < lines.length; i++) {
                let x = list[at + i];
                if (!x || uidOf(x) !== uidOf(x0)) { x = {household_uid: uidOf(x0), household_key: keyOf(x0), address: x0.address || ''}; draft.push(x); list.splice(at + i, 0, x); }
                lines[i].forEach((v, j) => { const col = COLS2[c0 + j]; if (col) x[col[0]] = v.trim(); });
                await save(x).catch(e => toast(e.message, 'error'));
            }
            toast(`${plural(lines.length, 'ligne collée', 'lignes collées')}.`); render();
        }
        function pickPerson(x) {
            return new Promise(resolve => {
                let done = false; const end = v => { if (!done) { done = true; resolve(v); } };
                const guess = [x.first_name, x.last_name].filter(Boolean).join(' ');
                let picker = null;
                dialog({eyebrow: 'PERSONNE RELEVÉE', title: guess || 'Relier à une fiche', submitLabel: 'Relier',
                    body: `<p class="muted">Choisis la fiche de cette personne : elle sera rattachée à ce relevé (et au recensement de la fiche).</p>` + ext.personPickerHtml({guess, createLabel: `Créer la fiche « ${esc(guess || 'sans nom')} » (marquée à vérifier)`}),
                    onOpen: d => { d.addEventListener('close', () => setTimeout(() => end(false), 0), {once: true}); picker = ext.bindPersonPicker(d); },
                    onSubmit: async form => {
                        if (picker.create()) { await save(x, {person_mode: 'create'}); x.person_name = guess; toast('Fiche créée (à vérifier) et rattachée.'); end(true); return; }
                        const o = picker.selected();
                        if (!o) return window.LCNDA_UI.fail(form.querySelector('.h-pick .pk, .h-pick input, .h-pick'), 'Choisis une fiche dans la liste, ou « Pas encore de fiche ».');
                        x.person_id = Number(o.key); x.person_name = o.label;
                        await save(x, {person_mode: 'existing'}); toast(`Rattachée à ${x.person_name}.`); end(true);
                    },
                });
            });
        }
        peopleTable.add = isHh => locked ? null : isHh || !all().length ? addHousehold() : addTo(uidOf(sorted().pop()));
        render();
    }

    /* ─── Tous les foyers du dépouillement ─── */
    function paintPeople(body) {
        const r = D.row, ppl = r.people || [];
        const byHh = new Map();
        // un foyer = son identité (deux foyers peuvent porter le même numéro, ou aucun)
        ppl.forEach(x => { const k = `${x.page_number}|${x.household_uid || (x.household_key || '').trim() || 'a:' + (x.address || '')}`; if (!byHh.has(k)) byHh.set(k, []); byHh.get(k).push(x); });
        const keys = [...byHh.keys()].sort((a, b) => natural((byHh.get(a)[0].household_key || '~'), (byHh.get(b)[0].household_key || '~')) || natural(a, b));
        body.innerHTML = ppl.length ? `<p class="muted">${plural(ppl.length, 'personne relevée', 'personnes relevées')} dans ${plural(byHh.size, 'foyer', 'foyers')}. Clique sur une page pour modifier.</p>
            <div class="h-dp-hhs">${keys.map(k => { const list = byHh.get(k), pages = [...new Set(list.map(x => x.page_number).filter(Boolean))].sort(natural), addr = list.find(x => x.address)?.address;
                const num = (list[0].household_key || '').trim();
                return `<article class="h-dp-hh maintenance-panel"><h4>🏠 ${num ? 'Foyer ' + esc(num) : 'Foyer sans n°'}${addr ? ` <small class="muted">${esc(addr)}</small>` : ''}</h4>
                    <ul>${list.map(x => `<li>${x.person_id ? `<button type="button" class="table-link" data-open-person="${x.person_id}">${esc(x.person_name || [x.first_name, x.last_name].join(' '))}</button>` : `<b>${esc([x.first_name, x.last_name].filter(Boolean).join(' ') || 'Sans nom')}</b>`} <small class="muted">${esc([x.household_position, x.age_text && x.age_text + ' ans', x.occupation].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>
                    ${pages.length ? `<small>${pages.map(n => `<button type="button" class="link-button" data-dp-gopage="${esc(n)}">page ${esc(n)}</button>`).join(', ')}</small>` : ''}</article>`; }).join('')}</div>`
            : A().empty('Personne relevée pour l’instant : ouvre une page et utilise « ＋ Personne ».');
        body.querySelectorAll('[data-dp-gopage]').forEach(b => b.addEventListener('click', () => { Object.assign(st(), {tab: 'pages', page: b.dataset.dpGopage, image: 0}); paint(); }));
    }

    /* ─── La fiche du dépouillement (lecture ; on la modifie dans Recherche) ─── */
    function paintInfo(body) {
        const r = D.row, f = (l, v) => v ? `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>` : '';
        body.innerHTML = `<div class="maintenance-panel"><dl class="h-dp-info">${f('Commune', r.place_name || r.city_name)}${f('Lieu-dit / ancien nom', r.city_alias)}${f('Département', r.department)}${f('Région', r.region)}${f('Type', D.types[r.record_type])}${f('Années', r.year_text)}${f('Service d’archives', r.archive_service)}${f('Cote', r.archive_reference)}${f('État', D.statuses[r.status])}${f('Vues du scan en ligne', r.page_total)}${f('Pages du document', r.doc_pages)}${f('Ce que je cherchais', r.searched)}${f('Ce que j’ai trouvé', r.found)}${f('Notes', r.notes)}</dl>
            ${ext.journal?.RESULTS?.[r.result] ? `<p>Résultat : ${ext.journal.badge(r.result)}</p>` : ''}${(r.sought || []).length && window.LCNDA_PICKER?.pickerView ? window.LCNDA_PICKER.pickerView({people: r.sought.map(p => ({id: Number(p.id), title: p.title, gender: p.gender, primary: true})), labels: {primary: '🎯 Cherché pour'}}) : ''}
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
