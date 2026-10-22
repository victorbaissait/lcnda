/**
 * 🏛 Services d'archives (F14) — Listes → Archives et sources → « Services d’archives » (juste après le Journal des recherches).
 * Construit sur ce qui existait : le Journal des recherches (heritage-journal.js, lib/research_journal.php), les dépouillements,
 * le planificateur de visites et la liste de référence « Archives » (départements). Rien n'est recopié : lib/archive_services.php
 * relit ce qui a été consulté chez chaque service (par son nom, son sigle ou ses autres noms).
 *  - la liste (barre H10 : chercher, filtrer par sorte et « déjà consulté », Liste | Fiches, trier) ;
 *  - la fiche d'un service (adresse, horaires, site, séries, « ✓ Déjà consulté chez eux » rangé par série, sources, médias, visites) ;
 *  - « ＋ Nouveau service » (peut partir des Archives départementales d'un département) et « ＋ Créer leurs fiches » pour les
 *    services écrits à la main dans les recherches ;
 *  - le service, la série et la cote d'une source (fenêtre « Source ») et d'un média (sa fenêtre), avec le menu de choix (kind « archive_service ») ;
 *  - ext.archiveServices.open(id) (↗ Ouvrir du menu de choix), .edit(row), .lightbox(item, readOnly).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const KEY = 'listes:archive_services';
    const plural = (n, w, many) => (A().plural ? A().plural(n, w, many) : `${n} ${w}`);
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    let KINDS = {ad: 'Archives départementales', am: 'Archives municipales', an: 'Archives nationales', other: 'Autre service'};
    let DEPTS = [];

    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'archive_services';

    /* ─────────── ＋ Nouveau service / ✎ Modifier ─────────── */
    async function ensureRefs() {
        if (DEPTS.length) return;
        try { const d = await A().api('archive_services'); KINDS = d.kinds || KINDS; DEPTS = d.departments || []; } catch (_) {}
    }
    /** La fenêtre du service ; résout le service enregistré (ou null). */
    async function editService(row = null, prefill = {}) {
        await ensureRefs();
        const r = row || {kind: prefill.kind || 'ad', name: prefill.name || '', short_name: prefill.short_name || ''};
        const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
        return new Promise(resolve => {
            let saved = null;
            const dlg = ext.openDialog({eyebrow: 'SERVICE D’ARCHIVES', title: row ? `Modifier « ${row.name} »` : 'Nouveau service d’archives', wide: true,
                body: `${row ? '' : `<label class="h-asv-from">Partir des Archives départementales de… <small>(facultatif : remplit le nom, le sigle et le site)</small><select name="from_dept"><option value="">— choisir un département —</option>${DEPTS.map(d => `<option value="${esc(d.code)}">${esc(d.code)} · ${esc(d.department)}</option>`).join('')}</select></label>`}
                    <div class="form-grid">
                        <label class="span-2">Nom du service<input name="name" required maxlength="200" value="${esc(r.name)}" placeholder="Archives départementales de la Corrèze" data-error="Donne le nom du service d’archives."></label>
                        <label>Sigle <small>(comme tu l’écris dans tes recherches)</small><input name="short_name" maxlength="60" value="${esc(r.short_name)}" placeholder="AD 19"></label>
                        <label>Sorte<select name="kind">${opt(Object.entries(KINDS), r.kind || 'other')}</select></label>
                        <label>Département <small>(si c’est en France)</small><select name="dept_code"><option value="">—</option>${opt(DEPTS.map(d => [d.code, `${d.code} · ${d.department}`]), r.dept_code)}</select></label>
                        <label>Ville<input name="city" maxlength="120" value="${esc(r.city)}" placeholder="Tulle"></label>
                        <label class="span-2">Adresse<textarea name="address" rows="2" maxlength="500" placeholder="Rue, code postal, ville">${esc(r.address)}</textarea></label>
                        <label class="span-2">Horaires<textarea name="opening_hours" rows="2" maxlength="1000" placeholder="Du mardi au vendredi, 9 h – 17 h ; réservation des documents la veille…">${esc(r.opening_hours)}</textarea></label>
                        <label>Site<input name="website_url" type="url" maxlength="600" value="${esc(r.website_url)}" placeholder="https://archives.…"></label>
                        <label>Recherche en ligne<input name="search_url" type="url" maxlength="600" value="${esc(r.search_url)}" placeholder="https://… (état civil, registres)"></label>
                        <label>Téléphone<input name="phone" maxlength="60" value="${esc(r.phone)}"></label>
                        <label>E-mail<input name="email" type="email" maxlength="200" value="${esc(r.email)}"></label>
                        <label class="span-2">Séries <small>(une par ligne : « 3 E — Notaires », « 4 E — État civil », « 2 Mi — Microfilms »)</small><textarea name="series_text" rows="4" maxlength="8000" placeholder="3 E — Notaires&#10;4 E — État civil&#10;6 M — Recensements">${esc(r.series_text)}</textarea></label>
                        <label class="span-2">Autres noms <small>(ceux que tu as pu écrire dans tes dépouillements, séparés par des virgules : tout ce qui y a été consulté s’affichera sur la fiche)</small><input name="aliases" maxlength="1000" value="${esc(r.aliases)}" placeholder="AD Corrèze, Archives de Tulle"></label>
                        <label class="span-2">Notes<textarea name="notes" rows="3" maxlength="8000" placeholder="Salle de lecture, carte de lecteur, appareil photo autorisé…">${esc(r.notes)}</textarea></label>
                    </div>`,
                onOpen: d => {
                    const f = d.querySelector('form');
                    f.elements.from_dept?.addEventListener('change', e => {
                        const t = DEPTS.find(x => x.code === e.target.value); if (!t) return;
                        f.elements.name.value = t.name.replace(/^Archives départementales - /, 'Archives départementales — ');
                        f.elements.short_name.value = `AD ${t.code}`; f.elements.kind.value = 'ad'; f.elements.dept_code.value = t.code;
                        if (!f.elements.search_url.value && t.search_url) f.elements.search_url.value = t.search_url;
                        if (!f.elements.notes.value && t.digitized) f.elements.notes.value = `En ligne : ${t.digitized}`;
                    });
                    setTimeout(() => (row ? f.elements.name : (f.elements.from_dept || f.elements.name)).focus(), 30);
                    d.addEventListener('close', () => resolve(saved), {once: true});
                },
                onDelete: row ? async () => { await removeService(row); return true; } : null,
                onSubmit: async f => {
                    const v = A().formObject(f); delete v.from_dept; if (row) v.id = row.id;
                    if (!String(v.name || '').trim()) return UI().fail(f.elements.name, 'Donne le nom du service d’archives.');
                    const res = await post('save_archive_service', v);
                    saved = res.result || res;
                    A().toast(row ? 'Enregistré' : `Service « ${saved.name} » créé.`, row ? 'success' : '');
                }});
            if (!dlg) resolve(null);
        });
    }
    async function removeService(row, after = null) {
        await post('delete_archive_service', {id: row.id});
        A().undoToast(`Service « ${row.name} » supprimé`, {undo: async () => { await post('restore_archive_service', {id: row.id}); await (after || refresh)(); }, redo: async () => { await post('delete_archive_service', {id: row.id}); await (after || refresh)(); }});
        if (Number(S().archiveServiceId) === Number(row.id)) S().archiveServiceId = 0;
        await (after || refresh)();
    }
    const refresh = async () => { if (S().module === 'listes' && S().listType === 'archive_services') await A().renderList?.(); };

    /* ─────────── La liste ─────────── */
    function itemOf(s, view) {
        const lines = [[s.kind_label, s.city, s.short_name].filter(Boolean).join(' · '),
            s.consulted_count ? `✓ ${plural(s.consulted_count, 'recherche faite', 'recherches faites')} chez eux${s.found_count ? ` · ${plural(s.found_count, 'trouvée', 'trouvées')}` : ''}` : 'Rien de consulté pour l’instant'];
        if (view === 'list') lines.push(`${plural(s.sources_count, 'source')} · ${plural(s.media_count, 'média')}${s.visits_count ? ` · ${plural(s.visits_count, 'visite')}` : ''}`);
        return {thumb: '<span class="ui-card-ico" aria-hidden="true">🏛</span>', name: s.name, open: `data-as-open="${s.id}"`, lines,
            badges: view === 'list' ? [] : [s.consulted_count ? {text: plural(s.consulted_count, 'recherche'), kind: s.found_count ? 'green' : 'grey'} : null, s.sources_count ? {text: plural(s.sources_count, 'source'), kind: 'blue'} : null].filter(Boolean),
            when: s.last_consulted || '', whenLabel: s.last_consulted ? 'Consulté' : '',
            menu: [`<button type="button" data-as-edit="${s.id}">✎ Modifier</button>`, `<button type="button" class="danger" data-as-delete="${s.id}">🗑 Supprimer</button>`],
            actions: view === 'list' ? `<button type="button" class="button small secondary" data-as-open="${s.id}">↗ Ouvrir</button>` : '', attrs: `data-as-row="${s.id}"`};
    }

    async function renderList(token) {
        if (Number(S().archiveServiceId)) return renderSheet(token, Number(S().archiveServiceId));
        const ws = A().$('#workspace'); if (!ws || !isCurrent(token)) return;
        ws.innerHTML = `<section class="page h-asv">${UI().pageHeader({title: 'Services d’archives',
            help: 'Tes services d’archives, avec leur adresse, leurs horaires, leur site, leurs séries, et tout ce que tu y as déjà consulté.',
            primary: '<button type="button" class="button" data-as-new>＋ Nouveau service</button>',
            actions: ['<button type="button" class="button secondary" data-as-journal>🗓 Journal des recherches</button>', '<button type="button" class="button secondary" data-as-visits>🗄️ Visites d’archives</button>']})}
            <div data-as-unmatched></div><div data-as-bar></div><div data-as-list>${UI().spinner('Chargement des services…')}</div></section>`;
        let data;
        try { data = await A().api('archive_services'); } catch (e) { if (isCurrent(token)) ws.querySelector('[data-as-list]').innerHTML = UI().notice('error', e.message || 'Chargement impossible.'); return; }
        if (!isCurrent(token)) return;
        KINDS = data.kinds || KINDS; DEPTS = data.departments || DEPTS;
        const all = data.services || [];
        const um = data.unmatched || [];
        if (um.length) ws.querySelector('[data-as-unmatched]').innerHTML = `<div class="ui-notice ui-notice-info h-asv-unmatched" role="status"><span class="ui-notice-ico" aria-hidden="true">ℹ️</span><span><b>${um.length > 1 ? 'Ces services sont écrits' : 'Ce service est écrit'} dans tes recherches sans avoir encore de fiche :</b> ${um.map(u => `<button type="button" class="button small secondary" data-as-new-name="${esc(u.name)}">＋ ${esc(u.name)} <small>(${esc(plural(u.count, 'recherche'))})</small></button>`).join(' ')}</span></div>`;
        const count = fn => all.filter(fn).length;
        let bar = null, shown = 60;
        bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher… (nom, sigle, ville, série)'},
            filters: [{id: 'kind', label: 'Sorte', type: 'check', options: Object.entries(KINDS).filter(([k]) => count(s => s.kind === k)).map(([k, l]) => [k, `${l} (${count(s => s.kind === k)})`, l])},
                {id: 'consulted', label: 'Déjà consulté', type: 'radio', dflt: '', options: [['', 'Tous'], ['yes', `Déjà consultés (${count(s => s.consulted_count)})`, 'Déjà consultés'], ['no', `Rien de consulté (${count(s => !s.consulted_count)})`, 'Rien de consulté']]}],
            view: {dflt: 'list', what: 'services'}, sort: {options: [['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Consultés le plus récemment'], ['most', 'Les plus consultés']], value: 'az'},
            onChange: () => { shown = 60; if (bar) paint(); }});
        ws.querySelector('[data-as-bar]').replaceWith(bar);
        const box = ws.querySelector('[data-as-list]');
        function paint() {
            const st = bar.state, q = fold(st.q).trim(), f = st.filters;
            let rows = all.filter(s => (!q || q.split(/\s+/).every(w => fold([s.name, s.short_name, s.aliases, s.city, s.kind_label, s.series_text, s.dept_code].join(' ')).includes(w)))
                && (!(f.kind || []).length || f.kind.includes(s.kind))
                && (!f.consulted || (f.consulted === 'yes' ? s.consulted_count > 0 : !s.consulted_count)));
            rows = st.sort === 'most' ? [...rows].sort((a, b) => b.consulted_count - a.consulted_count || a.name.localeCompare(b.name, 'fr'))
                : UI().sortItems(rows, st.sort || 'az', {name: s => s.name, date: s => s.last_consulted || ''});
            bar.setCount(rows.length === all.length ? plural(all.length, 'service') : `${plural(rows.length, 'service')} sur ${all.length}`);
            if (!all.length) { box.innerHTML = A().emptyState({icon: '🏛', text: 'Aucun service d’archives pour l’instant', hint: 'Ajoute les archives où tu cherches (départementales, municipales, notaires…) : leur adresse, leurs horaires, leurs séries, et tout ce que tu y as consulté s’affichera sur leur fiche.', action: {label: '＋ Nouveau service', attrs: 'data-empty-click="[data-as-new]"'}}); return; }
            if (!rows.length) { box.innerHTML = A().emptyState({icon: '🔍', text: 'Rien ne correspond', hint: 'Enlève un filtre, ou cherche autrement (un sigle, une ville).'}); return; }
            const view = st.view === 'cards' ? 'cards' : 'list';
            box.innerHTML = UI().itemsHtml(view, rows.slice(0, shown).map(s => itemOf(s, view)));
            if (rows.length > shown) box.appendChild(UI().moreButton({remaining: rows.length - shown, step: 60, onClick: () => { shown += 60; paint(); }}));
        }
        paint();
        ws.addEventListener('click', async e => {
            const t = e.target.closest?.('[data-as-open],[data-as-new],[data-as-new-name],[data-as-edit],[data-as-delete],[data-as-journal],[data-as-visits]'); if (!t) return;
            if (t.matches('[data-as-open]')) { e.preventDefault(); S().archiveServiceId = Number(t.dataset.asOpen); await refresh(); return; }
            if (t.matches('[data-as-new],[data-as-new-name]')) { const nm = t.dataset.asNewName || ''; const sv = await editService(null, nm ? {name: nm, short_name: nm.length <= 12 ? nm : '', kind: /^a\.?d\.?\b/i.test(nm) ? 'ad' : /^a\.?m\.?\b/i.test(nm) ? 'am' : 'other'} : {}); if (sv) { S().archiveServiceId = sv.id; await refresh(); } return; }
            if (t.matches('[data-as-edit]')) { const row = all.find(s => Number(s.id) === Number(t.dataset.asEdit)); if (row && await editService(row)) await refresh(); return; }
            if (t.matches('[data-as-delete]')) { const row = all.find(s => Number(s.id) === Number(t.dataset.asDelete)); if (row) { try { await removeService(row); } catch (err) { A().toast(err.message, 'error'); } } return; }
            if (t.matches('[data-as-journal]')) { S().listType = 'research_journal'; A().setModule('listes'); return; }
            if (t.matches('[data-as-visits]')) { S().listType = 'archive_visits'; A().setModule('listes'); }
        }, {signal: A().listControllerSignal?.()});
    }

    /* ─────────── La fiche d'un service ─────────── */
    const RES = () => ext.journal?.RESULTS || {found: ['Trouvé', 'green'], none: ['Rien trouvé', 'grey'], partial: ['En partie', 'yellow'], not_consulted: ['Pas consulté', 'grey']};
    const resBadge = r => (RES()[r] ? UI().badge(RES()[r][0], RES()[r][1]) : '');
    const kindIco = k => (ext.journal?.KINDS?.[k]?.[0] || {digest: '📜', visit: '🗄️', request: '📮', lead: '🔍'}[k] || '•');
    const openAttr = o => `data-rj-open="${esc(JSON.stringify(o || {}))}"`;
    function infoRow(label, html) { return html ? `<div class="h-asv-info-row"><dt>${esc(label)}</dt><dd>${html}</dd></div>` : ''; }
    const nl = s => esc(s).replace(/\n/g, '<br>');

    async function renderSheet(token, id) {
        const ws = A().$('#workspace'); if (!ws || !isCurrent(token)) return;
        ws.innerHTML = `<section class="page h-asv">${UI().spinner('Chargement de la fiche…')}</section>`;
        let d;
        try { d = await A().api('archive_service', {id}); } catch (e) { if (!isCurrent(token)) return; S().archiveServiceId = 0; ws.innerHTML = `<section class="page h-asv">${UI().notice('error', e.message || 'Service introuvable.')}<p><button type="button" class="button secondary" data-as-back>← Tous les services</button></p></section>`; ws.querySelector('[data-as-back]').addEventListener('click', refresh); return; }
        if (!isCurrent(token)) return;
        const s = d.service;
        const link = (u, l) => safeUrl(u) ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>` : '';
        const series = d.series || [];
        const consulted = d.consulted || [];
        let serieFilter = '';
        ws.innerHTML = `<section class="page h-asv h-asv-sheet">${UI().pageHeader({title: s.name, detail: true, icon: '🏛',
            help: esc([s.kind_label, s.city, s.short_name].filter(Boolean).join(' · ')),
            primary: '<button type="button" class="button" data-as-edit-me>✎ Modifier</button>',
            actions: ['<button type="button" class="button secondary" data-as-back>← Tous les services</button>', '<button type="button" class="button secondary" data-as-new-digest>＋ Nouveau dépouillement</button>'],
            more: [`<button type="button" class="danger" data-as-del-me>🗑 Supprimer</button>`]})}
            <div class="h-asv-grid">
                <section class="card h-asv-card"><header class="card-head"><div class="card-title"><h3>📍 Où et quand</h3></div></header><div class="card-body"><dl class="h-asv-info">
                    ${infoRow('Adresse', nl(s.address)) + infoRow('Horaires', nl(s.opening_hours)) + infoRow('Site', link(s.website_url, 'Site du service')) + infoRow('Recherche en ligne', link(s.search_url, 'Registres et fonds en ligne'))
                    + infoRow('Téléphone', esc(s.phone)) + infoRow('E-mail', s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '') + infoRow('Autres noms', esc(s.aliases)) + infoRow('Notes', nl(s.notes))
                    || A().empty('Rien de noté : ajoute l’adresse, les horaires et le site.', {icon: '📍', action: {label: '✎ Modifier', attrs: 'data-empty-click="[data-as-edit-me]"'}})}</dl></div></section>
                <section class="card h-asv-card"><header class="card-head"><div class="card-title"><h3>🗂 Séries</h3></div></header><div class="card-body">${series.length ? `<div class="h-asv-tablewrap"><table class="data-table h-asv-series"><thead><tr><th>Série</th><th>Ce que c’est</th><th>Consulté</th><th>Sources</th><th>Médias</th></tr></thead><tbody>${series.map(r => `<tr${r.code ? ` data-as-serie="${esc(r.code)}"` : ''}><td><strong>${esc(r.code || 'Sans série')}</strong></td><td>${esc(r.label || (r.declared ? '' : r.code ? 'vue dans une cote' : 'cote sans série reconnue'))}</td><td>${r.consulted ? `${r.consulted}${r.found ? ` <small>(${r.found} trouvé${r.found > 1 ? 's' : ''})</small>` : ''}` : '—'}</td><td>${r.sources || '—'}</td><td>${r.media || '—'}</td></tr>`).join('')}</tbody></table></div>` : A().empty('Aucune série notée : écris-les sur la fiche (« 3 E — Notaires »), ou elles viendront des cotes de tes recherches.', {icon: '🗂'})}</div></section>
            </div>
            <section class="card h-asv-card"><header class="card-head"><div class="card-title"><h3>✓ Déjà consulté chez eux <small>(${consulted.length})</small></h3></div></header><div class="card-body"><div data-as-filters></div><div data-as-consulted></div></div></section>
            <div class="h-asv-grid">
                <section class="card h-asv-card"><header class="card-head"><div class="card-title"><h3>📚 Sources <small>(${d.sources.length})</small></h3></div></header><div class="card-body">${d.sources.length ? UI().rowsHtml(d.sources.map(x => ({thumb: '<span class="ui-card-ico" aria-hidden="true">📚</span>', name: x.title, lines: [[x.series && `série ${x.series}`, x.cote && `cote ${x.cote}`, plural(x.citations, 'citation')].filter(Boolean).join(' · ')], actions: x.linked ? '' : UI().badge('nom écrit', 'yellow')}))) : A().empty('Aucune source reliée : choisis ce service dans la fenêtre d’une source (« 🏛 Service d’archives »).', {icon: '📚'})}</div></section>
                <section class="card h-asv-card"><header class="card-head"><div class="card-title"><h3>🖼 Médias <small>(${d.media.length})</small></h3></div></header><div class="card-body">${d.media.length ? UI().rowsHtml(d.media.map(m => ({thumb: m.media_type === 'image' && (m.thumbnail || m.filename) ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : '<span class="ui-card-ico" aria-hidden="true">📄</span>', name: m.title, lines: [[m.series && `série ${m.series}`, m.cote && `cote ${m.cote}`, m.date_text].filter(Boolean).join(' · ')], actions: `<button type="button" class="button small secondary" data-open-media="${m.id}">↗ Ouvrir</button>`}))) : A().empty('Aucun média relié : choisis ce service dans la fenêtre d’un média.', {icon: '🖼'})}</div></section>
            </div>
            <section class="card h-asv-card"><header class="card-head"><div class="card-title"><h3>🗄️ Visites <small>(${d.visits.length})</small></h3></div></header><div class="card-body">${d.visits.length ? UI().rowsHtml(d.visits.map(v => ({thumb: '<span class="ui-card-ico" aria-hidden="true">🗄️</span>', name: v.title, open: openAttr({kind: 'visit', id: v.id}), lines: [[v.visit_date && `prévue le ${v.visit_date}`, plural(v.items, 'cote')].filter(Boolean).join(' · ')], actions: v.done_at ? UI().badge('Faite', 'green') : UI().badge('À faire', 'blue')}))) : A().empty('Aucune visite préparée chez eux.', {icon: '🗄️', action: {label: '🗄️ Visites d’archives', attrs: 'data-as-visits-go'}})}</div></section>
        </section>`;
        const box = ws.querySelector('[data-as-consulted]'), fbox = ws.querySelector('[data-as-filters]');
        const seriesCodes = [...new Set(consulted.map(c => c.series || ''))];
        function paintConsulted() {
            const rows = consulted.filter(c => serieFilter === '' || (serieFilter === '_' ? !c.series : c.series === serieFilter));
            fbox.innerHTML = seriesCodes.length > 1 || (seriesCodes.length === 1 && seriesCodes[0]) ? `<div class="ui-filters" role="group" aria-label="Séries">${[['', `Tout (${consulted.length})`], ...seriesCodes.filter(Boolean).sort().map(c => [c, `${c} (${consulted.filter(x => x.series === c).length})`]), ...(seriesCodes.includes('') ? [['_', `Sans série (${consulted.filter(x => !x.series).length})`]] : [])].map(([k, l]) => `<button type="button" class="${k === serieFilter ? 'is-active' : ''}" data-as-f="${esc(k)}">${esc(l)}</button>`).join('')}</div>` : '';
            box.innerHTML = rows.length ? UI().rowsHtml(rows.map(r => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${kindIco(r.kind)}</span>`, name: r.title, open: openAttr(r.open),
                lines: [[r.series && `série ${r.series}`, r.cote && `cote ${r.cote}`, r.commune, r.years].filter(Boolean).join(' · ') || r.status_label, (r.people || []).map(p => p.title).slice(0, 3).join(', ')],
                when: r.date, whenLabel: r.date_label || '', actions: `${resBadge(r.result)}<button type="button" class="button small secondary" ${openAttr(r.open)}>↗ Ouvrir</button>`})))
                : A().empty(consulted.length ? 'Rien dans cette série.' : `Rien de consulté chez eux pour l’instant. Les dépouillements, visites faites et demandes dont le service est « ${s.short_name || s.name} » (ou un de ses autres noms) s’affichent ici.`, {icon: '✓', action: consulted.length ? null : {label: '＋ Nouveau dépouillement', attrs: 'data-empty-click="[data-as-new-digest]"'}});
        }
        paintConsulted();
        fbox.addEventListener('click', e => { const b = e.target.closest('[data-as-f]'); if (!b) return; serieFilter = b.dataset.asF; paintConsulted(); });
        ws.querySelectorAll('[data-as-serie]').forEach(tr => tr.addEventListener('click', () => { serieFilter = tr.dataset.asSerie; paintConsulted(); fbox.scrollIntoView({block: 'nearest', behavior: 'smooth'}); }));
        A().bindTableLinks?.();
        ws.querySelector('[data-as-back]')?.addEventListener('click', () => { S().archiveServiceId = 0; refresh(); });
        ws.querySelector('[data-as-edit-me]')?.addEventListener('click', async () => { if (await editService(s)) await refresh(); });
        ws.querySelector('[data-as-del-me]')?.addEventListener('click', async () => { try { await removeService(s); } catch (err) { A().toast(err.message, 'error'); } });
        ws.querySelector('[data-as-new-digest]')?.addEventListener('click', () => { Object.assign(S(), {researchKind: 'archive_digest', archiveDigestAdding: true, archiveDigestEditId: 0, archiveDigestPrefill: {archive_service: s.short_name || s.name}}); A().persistUiState?.(); A().setModule('recherche'); });
        ws.querySelector('[data-as-visits-go]')?.addEventListener('click', () => { S().listType = 'archive_visits'; A().setModule('listes'); });
    }

    /** ↗ Ouvrir (menu de choix, autres outils) : la fiche du service dans Listes. */
    function openService(id) {
        Object.assign(S(), {listType: 'archive_services', archiveServiceId: Number(id) || 0});
        document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); });
        A().setModule('listes');
    }

    /* ─────────── « ＋ Créer le service « … » » du menu de choix ─────────── */
    document.addEventListener('picker-create', e => {
        if (e.detail?.kind !== 'archive_service') return;
        e.preventDefault();
        const t = String(e.detail.text || '').trim();
        editService(null, {name: t, short_name: t.length <= 12 ? t : '', kind: /^a\.?d\.?\b/i.test(t) ? 'ad' : /^a\.?m\.?\b/i.test(t) ? 'am' : 'other'})
            .then(sv => sv && e.detail.pick({kind: 'archive_service', id: sv.id, title: sv.name, meta: [sv.kind_label, sv.city].filter(Boolean).join(' · '), icon: '🏛', short: sv.short_name || sv.city}));
    });

    /* ─────────── 📚 Fenêtre « Source » : service, série et cote ─────────── */
    function sourceFieldset(form) {
        let box = form.querySelector('.h-asv-source');
        if (!box) {
            box = document.createElement('fieldset');
            box.className = 'h-asv-source span-2';
            const anchor = form.querySelector('[name=website]')?.closest('label');
            (anchor || form.querySelector('.form-grid')?.lastElementChild)?.insertAdjacentElement('afterend', box);
        }
        const linkId = Number(form.elements.link_id?.value) || 0, sid = Number(form.elements.id?.value) || 0;
        const src = (S().currentPerson?.sources || []).find(s => (linkId && Number(s.link_id) === linkId) || (!linkId && sid && Number(s.id) === sid)) || {};
        box.innerHTML = `<legend>🏛 Service d’archives <small>(facultatif)</small></legend><div class="h-asv-source-grid"><div class="h-asv-source-svc"><span class="pk-lab">Service</span>${P().pickerField({name: 'archive_service_id', kind: 'archive_service', allowCreate: true, value: Number(src.archive_service_id) || null})}</div>
            <label>Série<input name="archive_series" maxlength="120" value="${esc(src.archive_series || '')}" placeholder="3 E"></label><label>Cote<input name="archive_cote" maxlength="200" value="${esc(src.archive_cote || '')}" placeholder="3 E 12/4"></label></div>
            <p class="muted">Tout ce qui vient de ce service se retrouve sur sa fiche (Listes → Services d’archives), rangé par série.</p>`;
        const fill = () => { const c = form.elements.archive_cote?.value || '', s = form.elements.archive_series; const m = c.match(/^\s*(\d{0,3})\s*([A-Za-z]{1,4})(?=$|[\s\d/._-])/); if (s && !s.value.trim() && m) s.value = `${m[1] ? m[1] + ' ' : ''}${m[2].toUpperCase()}`; };
        form.elements.archive_cote?.addEventListener('change', fill);
        box.addEventListener('picker-change', e => {
            if (e.detail?.name !== 'archive_service_id') return;
            const it = e.detail.item; if (!it) return;
            const site = form.elements.website; if (site && !site.value.trim()) site.value = it.title || '';
            const ca = form.elements.citation_archive; if (ca && !ca.value.trim()) { ca.value = it.short || it.title || ''; ca.dispatchEvent(new Event('input', {bubbles: true})); }
        });
    }
    const watchSource = () => {
        const dlg = document.getElementById('source-dialog'); if (!dlg || dlg.dataset.asWatch) return;
        dlg.dataset.asWatch = '1';
        new MutationObserver(() => { if (dlg.open) { const f = dlg.querySelector('form'); if (f) setTimeout(() => sourceFieldset(f), 0); } }).observe(dlg, {attributes: true, attributeFilter: ['open']});
    };

    /* ─────────── 🖼 Fenêtre d'un média : service et série (enregistrés tout de suite) ─────────── */
    let lbSeq = 0;
    async function lightbox(item, readOnly = false) {
        const ref = document.getElementById('lightbox-doc-reference'); if (!ref || !item?.id) return;
        let box = document.querySelector('.h-asv-lightbox');
        if (!box) { box = document.createElement('div'); box.className = 'h-asv-lightbox'; ref.previousElementSibling?.tagName === 'LABEL' ? ref.previousElementSibling.before(box) : ref.before(box); }
        const my = ++lbSeq, mid = Number(item.id);
        box.innerHTML = '';
        let d; try { d = await A().api('media_archive', {id: mid}); } catch (_) { return; }
        if (my !== lbSeq) return;
        box.dataset.mediaId = String(mid);
        box.innerHTML = `<span class="pk-lab">🏛 Service d’archives</span>${P().pickerField({name: '', hiddenName: false, kind: 'archive_service', allowCreate: true, value: d.service || null})}
            <label class="h-asv-lb-series">Série <input class="lightbox-input" data-as-lb-series maxlength="120" value="${esc(d.archive_series || '')}" placeholder="3 E"></label><small class="muted" data-as-lb-state></small>`;
        if (readOnly) box.querySelectorAll('input,button').forEach(x => { x.disabled = true; });
        const save = async () => {
            if (readOnly || Number(box.dataset.mediaId) !== mid) return;
            const pk = box.querySelector('.pk'), v = pk ? P().pickerValue(pk) : null;
            try { await post('save_media_archive', {media_id: mid, archive_service_id: Number(v) || '', archive_series: box.querySelector('[data-as-lb-series]').value}); box.querySelector('[data-as-lb-state]').textContent = '✓ Enregistré'; }
            catch (e) { A().toast(e.message || 'Enregistrement impossible.', 'error', {retry: save}); }
        };
        box.addEventListener('picker-change', save);
        box.querySelector('[data-as-lb-series]').addEventListener('change', save);
    }

    ext.lists.archive_services = token => renderList(token);
    ext.archiveServices = {open: openService, edit: editService, lightbox};
    // Listes → Archives et sources : juste après le Journal des recherches
    const addList = () => { const L = A()?.defaultListTypes; if (!Array.isArray(L) || L.some(x => x[0] === 'archive_services')) return; const i = L.findIndex(x => x[0] === 'research_journal'), j = L.findIndex(x => x[0] === 'archive_visits'); L.splice(i >= 0 ? i + 1 : j >= 0 ? j + 1 : L.length, 0, ['archive_services', '16c', 'Services d’archives']); };
    const boot = () => { if (!A()) return; addList(); watchSource(); };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    setTimeout(boot, 0);
})();
