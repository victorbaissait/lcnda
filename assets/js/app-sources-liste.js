/* LCNDA — 📋 Listes en plus : 📚 Sources (le gestionnaire de sources), 💍 Familles et couples, 🔤 Noms de famille, 📝 Notes.
 *  - 📚 Sources : chaque source avec son dépôt, le nombre de citations et de fiches ; une source ouverte montre ses cases (✎),
 *    son dépôt (service d'archives, série, cote), son modèle de citation à la manière d'Evidence Explained (entrée de la liste
 *    des sources, première note, note suivante) et les styles tout faits, « 📍 Où est-elle citée ? », les doublons possibles ;
 *    ⇄ Fusionner deux sources (ou plus) avec « ↶ Annuler ».
 *  - 💍 Familles : chaque couple, son mariage (date, lieu), ses enfants, une séparation, ses sources.
 *  - 🔤 Noms de famille : chaque patronyme, ses porteurs, sa période, ses lieux, ses variantes, son groupe ; un clic : les personnes
 *    de ce nom (avec la barre de sélection ☑).
 *  - 📝 Notes : toutes les notes (fiches, événements, couples, sources), cherchées en plein texte côté serveur.
 * Chaque liste : la barre commune (UI.listBar), « ⋯ » + clic droit (UI.menuAt), ⚙️ Colonnes et ⤓ Exporter (heritage-columns.js),
 * 🖨 Imprimer (UI.printPage), ☑ la barre de sélection (app-selection.js), rien à modifier en mode consultation.
 * Serveur : GET listes_plus / POST listes_plus_write (lib/listes_plus.php, lib/sources_gestion.php). Essai : tests/test-audit-listes.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const S = () => A().state || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const get = (what, q = {}) => A().api('listes_plus', {what, ...q});
    const post = async body => { const r = await A().api('listes_plus_write', {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const ws = () => document.querySelector('#workspace');
    const live = (token, type) => token === S().workspaceToken && S().module === 'listes' && S().listType === type;
    const wait = () => (UI().skeleton ? UI().skeleton(6) : UI().spinner ? UI().spinner(T('Chargement…')) : '');
    const openPerson = id => { if (!id) return; if (A().openPersonById) A().openPersonById(Number(id)); else { S().currentPersonId = Number(id); A().setModule('personnes'); } };
    const LISTS = [['sources_list', '16e', '📚 Sources', 'g_sources', 'archives'], ['families_list', '01c', '💍 Familles et couples', 'g_people', 'events'], ['surnames_list', '01d', '🔤 Noms de famille', 'g_people', 'families_list'], ['notes_list', '33d', '📝 Notes', 'g_research', 'research_journal']];
    const more = (attrs, name) => `<button type="button" class="icon-button lp-more" data-more ${attrs} aria-label="${esc(T('Plus d’actions'))}" title="${esc(T('Plus d’actions pour « {name} »', {name}))}" aria-haspopup="menu"></button>`;
    const printBtn = '<button type="button" class="button small secondary" data-lp-print data-shortcut="⌘P">🖨 ' + esc(T('Imprimer')) + '</button>';
    let view = {source: 0, surname: ''}; // une source ou un nom ouvert (dans l'onglet)
    const copy = async text => { try { await navigator.clipboard.writeText(text); toast(T('Copié.')); } catch (_) { toast(T('Copie impossible : choisis le texte et copie-le à la main.'), 'error'); } };

    /* ═════════════ 📚 Sources ═════════════ */
    let srcData = null;
    ext.lists.sources_list = async (token = S().workspaceToken) => {
        if (view.source) return renderSource(view.source, token);
        const w = ws(); if (!w) return;
        w.innerHTML = `<section class="page collection-page lp-page" data-lp="sources">${UI().pageHeader({title: T('📚 Sources'), help: esc(T('Toutes les sources de ta généalogie : où elles sont gardées, combien de fois elles sont citées, sur quelles fiches. Ouvre une source pour son modèle de citation, ses doublons et « Où est-elle citée ? ».')),
            primary: kiosk() ? '' : `<button type="button" class="button small" data-lp-src-new>${esc(T('＋ Nouvelle source'))}</button>`, actions: [printBtn]})}<div data-lp-bar></div><div data-lp-body>${wait()}</div></section>`;
        try { srcData = await get('sources'); } catch (e) { if (live(token, 'sources_list')) w.querySelector('[data-lp-body]').innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
        if (!live(token, 'sources_list')) return;
        const rows = srcData.rows, depots = [...new Set(rows.map(r => r.depot).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        const bar = UI().listBar({key: 'listes:sources_list', search: {placeholder: T('Chercher une source… (titre, auteur, dépôt, cote)')},
            filters: [{id: 'state', label: T('Afficher'), type: 'check', options: [['dupes', T('Doublons possibles ({n})', {n: rows.filter(r => r.dupe).length}), T('Doublons possibles')], ['unused', T('Jamais citées ({n})', {n: rows.filter(r => !r.citations).length}), T('Jamais citées')], ['nomodel', T('Sans modèle de citation'), T('Sans modèle')]]},
                ...(depots.length ? [{id: 'depot', label: T('Dépôt'), type: 'select', options: [['', T('Tous les dépôts')], ...depots.map(d => [d, d, `🏛 ${d}`])], dflt: ''}] : [])],
            sort: {options: [['az', T('A → Z')], ['za', T('Z → A')], ['most', T('Les plus citées')], ['least', T('Les moins citées')]], value: 'az'}, count: true, onChange: () => paint()});
        w.querySelector('[data-lp-bar]').replaceWith(bar); ext.listSavedFilters?.(bar, S().listType); // 💾
        const body = w.querySelector('[data-lp-body]');
        let sel = null;
        function paint() {
            const {q, filters: f, sort} = bar.state, LM = UI().listMatch;
            let shown = rows.filter(r => (LM ? LM.text(q, r.title, r.author, r.depot, r.publication, r.archive_cote, r.url) : true)
                && (!(f.state || []).includes('dupes') || r.dupe) && (!(f.state || []).includes('unused') || !r.citations) && (!(f.state || []).includes('nomodel') || !r.model) && (!f.depot || r.depot === f.depot));
            const cmp = (a, b) => String(a.title).localeCompare(String(b.title), 'fr', {sensitivity: 'base', numeric: true});
            shown = [...shown].sort(sort === 'za' ? (a, b) => cmp(b, a) : sort === 'most' ? (a, b) => b.citations - a.citations || cmp(a, b) : sort === 'least' ? (a, b) => a.citations - b.citations || cmp(a, b) : cmp);
            bar.setCount(shown.length === rows.length ? plural(rows.length, T('source')) : T('{n} sur {t}', {n: plural(shown.length, T('source')), t: rows.length.toLocaleString('fr-FR')}));
            body.innerHTML = !rows.length ? A().emptyState({icon: '📚', text: T('Aucune source pour l’instant'), hint: T('Les sources s’ajoutent depuis une fiche (bloc Sources) ou ici avec « ＋ Nouvelle source ».')})
                : !shown.length ? A().emptyState({icon: '🔍', text: T('Aucune source ne correspond'), hint: T('Change les mots cherchés ou retire un filtre.')})
                : `<div class="data-table-wrap"><table class="data-table sortable-table lp-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Auteur'))}</th><th>${esc(T('Dépôt'))}</th><th>${esc(T('Citations'))}</th><th>${esc(T('Fiches'))}</th><th>${esc(T('Modèle'))}</th><th></th></tr></thead><tbody>${shown.map(r => `<tr data-sel-id="${r.id}" data-lp-src-row="${r.id}">
                    <td data-sort-value="${esc(r.title)}"><button type="button" class="table-link" data-lp-src-open="${r.id}">${esc(r.title || T('Source sans titre'))}</button>${r.dupe ? ` <span class="badge is-yellow lp-dupe" title="${esc(T('Même titre ou même lien qu’une autre source'))}">${esc(T('doublon ?'))}</span>` : ''}</td>
                    <td>${esc(r.author)}</td><td>${esc(r.depot)}${r.archive_cote ? ` <small class="muted">${esc(r.archive_cote)}</small>` : ''}</td><td data-sort-value="${r.citations}">${r.citations}</td><td data-sort-value="${r.people}">${r.people}</td><td>${esc(r.model_label)}</td><td>${more(`data-lp-src-more="${r.id}"`, r.title)}</td></tr>`).join('')}</tbody></table></div>`;
            if (sel) sel.refresh(); else if (rows.length) sel = ext.selectionBar?.({host: body, key: 'listes:sources', what: [T('source cochée'), T('sources cochées')], actions: sourceActions()});
            if (sel && !sel.el.isConnected) body.before(sel.el);
        }
        function sourceActions() {
            const SB = ext.selectionBar;
            return [{id: 'merge', icon: '⇄', label: T('Fusionner'), help: T('Garder une seule des sources cochées : les citations des autres passent dans celle-là'), edit: true, min: 2, run: ids => mergeDialog(ids.map(Number))},
                SB.labelAction('source', {after: reload}), SB.exportAction({name: T('sources')}),
                {id: 'delete', icon: '🗑', label: T('Supprimer'), help: T('Supprime les sources cochées et leurs citations ; « ↶ Annuler » les remet'), edit: true, danger: true, run: async (ids, s) => { await deleteSources(ids.map(Number)); s.clear(); }}];
        }
        paint();
    };
    const reload = async () => { if (S().module === 'listes') await A().renderList?.(); };
    async function deleteSources(ids) {
        const done = [];
        for (const id of ids) { try { await A().api('delete_source', {}, {method: 'POST', body: {id}}); done.push(id); } catch (e) { toast(e.message, 'error'); } }
        await reload();
        if (!done.length) return;
        A().undoToast?.(T('{n} supprimées', {n: plural(done.length, T('source'))}), {undo: async () => { for (const id of done.reverse()) await A().api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'source', entity_id: id}}); await reload(); }});
    }
    async function mergeDialog(ids, keep = 0) {
        const rows = (srcData?.rows || []).filter(r => ids.includes(r.id));
        if (rows.length < 2) return;
        keep = keep || [...rows].sort((a, b) => b.citations - a.citations)[0].id;
        ext.openDialog?.({eyebrow: T('FUSIONNER DES SOURCES'), title: T('Garder une seule source'), submitLabel: T('⇄ Fusionner'),
            body: `<p class="form-help">${esc(T('Les citations, étiquettes, médias et notes des autres passent dans la source gardée ; ses cases vides sont complétées. « ↶ Annuler » remet tout comme avant.'))}</p>
                <div class="lp-merge-pick">${rows.map(r => `<label class="radio-line"><input type="radio" name="keep" value="${r.id}"${r.id === keep ? ' checked' : ''}> <span><b>${esc(r.title)}</b> <small class="muted">${esc([r.author, r.depot, plural(r.citations, T('citation'))].filter(Boolean).join(' · '))}</small></span></label>`).join('')}</div>`,
            onSubmit: async f => { const k = Number(new FormData(f).get('keep')); await doMerge(k, ids.filter(x => x !== k)); }});
    }
    async function doMerge(target, others) {
        const r = await post({op: 'source_merge', target, others});
        await reload();
        A().undoToast?.(T('{n} fusionnées dans une seule', {n: plural(r.merged + 1, T('source'))}), {undo: async () => { await post({op: 'source_unmerge', change_id: r.change_id}); await reload(); },
            redo: async () => { const again = await post({op: 'source_merge', target, others}); r.change_id = again.change_id; await reload(); }});
    }
    function srcMenu(anchor, id) {
        const r = (srcData?.rows || []).find(x => x.id === Number(id)); if (!r) return;
        const group = r.dupe ? (srcData.dupe_groups[r.dupe - 1] || []) : [];
        UI().menuAt(anchor, [
            {icon: '↗', label: T('Ouvrir'), run: () => { view.source = r.id; reload(); }},
            !kiosk() && {icon: '✎', label: T('Modifier'), run: () => { view.source = r.id; reload(); }},
            !kiosk() && group.length > 1 && {icon: '⇄', label: T('Fusionner avec ses doublons'), help: T('{n} sources se ressemblent', {n: group.length}), run: () => mergeDialog(group, r.id)},
            {icon: '❝', label: T('Copier la citation'), help: T('Le style classique, à la française'), run: async () => { const d = await get('source', {id: r.id}); copy(d.ee?.first || d.styles?.items?.fr?.note || r.title); }},
            {icon: '⤓', label: T('Exporter (RIS, BibTeX)'), run: () => { location.href = 'api.php?action=sources_export&format=ris'; }},
            '-',
            !kiosk() && {icon: '🗑', label: T('Supprimer'), danger: true, help: T('« ↶ Annuler » la remet'), run: () => deleteSources([r.id])},
        ], {title: `« ${String(r.title).slice(0, 50)} »`});
    }

    /* ── une source ouverte ── */
    async function renderSource(id, token) {
        const w = ws(); if (!w) return;
        w.innerHTML = `<section class="page lp-page lp-source">${wait()}</section>`;
        let d; try { d = await get('source', {id}); } catch (e) { view.source = 0; toast(e.message, 'error'); return reload(); }
        if (!live(token, 'sources_list')) return;
        const s = d.source, ro = kiosk(), dis = ro ? ' disabled' : '';
        const field = (name, label, value, attrs = '') => `<label>${esc(label)}<input name="${name}" value="${esc(value ?? '')}"${attrs}${dis}></label>`;
        const models = d.models || [];
        const modelFields = key => { const m = models.find(x => x.key === key); if (!m) return ''; return `<div class="form-grid lp-model-fields">${Object.entries(m.fields).map(([k, lab]) => `<label>${esc(T(lab))}<input name="f_${k}" value="${esc(d.fields?.[k] ?? '')}" placeholder="${esc(d.auto?.[k] ?? '')}"${dis}></label>`).join('')}</div>`; };
        const kinds = {person: T('Fiche'), event: T('Événement'), family: T('Couple'), media: T('Média')};
        const stylesHtml = Object.entries(d.styles?.items || {}).map(([k, v]) => `<li><b>${esc(d.styles.names?.[k] || k)}</b><span>${esc(v.note || '')}</span><button type="button" class="link-button" data-lp-copy="${esc(v.note || '')}">📋 ${esc(T('Copier'))}</button></li>`).join('');
        const eeHtml = d.ee ? `<ol class="lp-ee">${[['entry', T('Entrée de la liste des sources')], ['first', T('Première note')], ['next', T('Note suivante')]].map(([k, lab]) => `<li><b>${esc(lab)}</b><span>${esc(d.ee[k])}</span><button type="button" class="link-button" data-lp-copy="${esc(d.ee[k])}">📋 ${esc(T('Copier'))}</button></li>`).join('')}</ol>` : `<p class="muted">${esc(T('Choisis un modèle : la citation s’écrit toute seule, à la manière d’Evidence Explained.'))}</p>`;
        w.innerHTML = `<section class="page lp-page lp-source" data-lp="source">${UI().pageHeader({detail: true, title: s.title || T('Source sans titre'), back: `<button type="button" class="back-link link-button" data-lp-back>← ${esc(T('Toutes les sources'))}</button>`,
                help: esc(T('{c} · {p}', {c: plural(d.links.length, T('citation')), p: plural(new Set(d.links.map(l => l.person_id).filter(Boolean)).size, T('fiche'))})), actions: [printBtn], more: ro ? [] : [`<button type="button" data-lp-src-del="${s.id}">🗑 ${esc(T('Supprimer'))}</button>`]})}
            <form class="maintenance-panel lp-src-form" data-lp-src-form="${s.id}"><h3>${esc(T('La source'))}</h3><div class="form-grid">
                ${field('title', T('Titre'), s.title, ' required maxlength="500"')}${field('author', T('Auteur'), s.author, ' maxlength="500"')}
                <label>${esc(T('Dépôt (service d’archives)'))}<select name="archive_service_id"${dis}><option value="">${esc(T('— Aucun —'))}</option>${(d.services || []).map(v => `<option value="${v.id}"${Number(s.archive_service_id) === Number(v.id) ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
                ${field('agency', T('Dépôt écrit à la main'), s.agency, ' maxlength="500"')}${'archive_cote' in s ? field('archive_cote', T('Cote'), s.archive_cote, ' maxlength="200"') : ''}${'archive_series' in s ? field('archive_series', T('Série'), s.archive_series, ' maxlength="200"') : ''}
                ${field('publication', T('Publication'), s.publication, ' maxlength="500"')}${field('url', T('Lien'), s.url, ' type="url" maxlength="2000" placeholder="https://…"')}</div>
                <h3>❝ ${esc(T('Modèle de citation'))}</h3>
                <label class="lp-model-pick">${esc(T('Sorte de source'))}<select name="model" data-lp-model${dis}><option value="">${esc(T('— Pas de modèle —'))}</option>${models.map(m => `<option value="${m.key}"${d.model === m.key ? ' selected' : ''}>${esc(T(m.label))}</option>`).join('')}</select></label>
                <div data-lp-model-fields>${modelFields(d.model)}</div>
                ${ro ? '' : `<div class="page-actions"><button type="submit" class="button">${esc(T('Enregistrer'))}</button></div>`}</form>
            <section class="maintenance-panel"><h3>❝ ${esc(T('La citation, prête à coller'))}</h3>${eeHtml}${stylesHtml ? `<details class="lp-styles"><summary>${esc(T('Autres styles (classique, Chicago, forum…)'))}</summary><ul class="lp-ee">${stylesHtml}</ul></details>` : ''}</section>
            <section class="maintenance-panel" data-lp-where><h3>📍 ${esc(T('Où est-elle citée ?'))}</h3>${d.links.length ? `<div class="data-table-wrap"><table class="data-table lp-table"><thead><tr><th>${esc(T('Sorte'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Page'))}</th><th>${esc(T('Note'))}</th></tr></thead><tbody>${d.links.map(l => `<tr><td>${esc(kinds[l.entity_type] || l.kind)}</td><td>${l.person_id ? `<button type="button" class="table-link" data-lp-person="${l.person_id}">${esc(l.label)}</button>` : esc(l.label)}</td><td>${esc(l.page)}</td><td>${esc(l.note)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(T('Citée nulle part pour l’instant.'))}</p>`}
                ${d.media.length ? `<p><b>${esc(T('Médias rattachés'))}</b> : ${d.media.map(m => esc(m.title || '#' + m.id)).join(' · ')}</p>` : ''}</section>
            ${d.dupes.length ? `<section class="maintenance-panel lp-dupes"><h3>⇄ ${esc(T('Doublons possibles'))}</h3><ul>${d.dupes.map(x => `<li><button type="button" class="table-link" data-lp-src-open="${x.id}">${esc(x.title)}</button> <small class="muted">${esc([x.author, x.depot, plural(x.citations, T('citation'))].filter(Boolean).join(' · '))}</small>${ro ? '' : ` <button type="button" class="button small secondary" data-lp-merge-into="${x.id}">⇄ ${esc(T('Fusionner dans celle-ci'))}</button>`}</li>`).join('')}</ul></section>` : ''}</section>`;
        const form = w.querySelector('[data-lp-src-form]');
        form.querySelector('[data-lp-model]')?.addEventListener('change', e => { w.querySelector('[data-lp-model-fields]').innerHTML = modelFields(e.target.value); });
        form.addEventListener('submit', async e => {
            e.preventDefault(); if (ro) return;
            const v = Object.fromEntries(new FormData(form)), fields = {};
            Object.keys(v).filter(k => k.startsWith('f_')).forEach(k => { fields[k.slice(2)] = v[k]; delete v[k]; });
            try { await post({op: 'source_save', id: s.id, ...v, fields}); toast(T('Enregistré'), 'success'); renderSource(s.id, S().workspaceToken); }
            catch (err) { toast(err.message, 'error'); }
        });
        w.querySelectorAll('[data-lp-merge-into]').forEach(b => b.addEventListener('click', async () => { srcData = srcData || await get('sources'); await doMerge(s.id, [Number(b.dataset.lpMergeInto)]); }));
    }

    /* ═════════════ 💍 Familles et couples ═════════════ */
    ext.lists.families_list = async (token = S().workspaceToken) => {
        const w = ws(); if (!w) return;
        w.innerHTML = `<section class="page collection-page lp-page" data-lp="families">${UI().pageHeader({title: T('💍 Familles et couples'), help: esc(T('Chaque couple : le mariage (date, lieu), les enfants, une séparation, les sources.')), actions: [printBtn]})}<div data-lp-bar></div><div data-lp-body>${wait()}</div></section>`;
        let d; try { d = await get('families'); } catch (e) { if (live(token, 'families_list')) w.querySelector('[data-lp-body]').innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
        if (!live(token, 'families_list')) return;
        const rows = d.rows;
        const bar = UI().listBar({key: 'listes:families_list', search: {placeholder: T('Chercher un couple… (nom, lieu, année)')},
            filters: [{id: 'state', label: T('Afficher'), type: 'check', options: [['nomarr', T('Sans date de mariage')], ['kids', T('Avec des enfants')], ['nokids', T('Sans enfant connu')], ['split', T('Séparés, divorcés')], ['nosrc', T('Sans source')]]}],
            sort: {options: [['az', T('A → Z')], ['old', T('Mariage : les plus anciens')], ['new', T('Mariage : les plus récents')], ['kids', T('Le plus d’enfants')]], value: 'az'}, count: true, onChange: () => paint()});
        w.querySelector('[data-lp-bar]').replaceWith(bar); ext.listSavedFilters?.(bar, S().listType); // 💾
        const body = w.querySelector('[data-lp-body]');
        const nm = r => [r.partner1, r.partner2].filter(Boolean).join(' & ');
        function paint() {
            const {q, filters: f, sort} = bar.state, st = f.state || [], LM = UI().listMatch;
            let shown = rows.filter(r => (LM ? LM.text(q, r.partner1, r.partner2, r.marriage_place, r.marriage_date) : true) && (!st.includes('nomarr') || !r.marriage_date) && (!st.includes('kids') || r.children > 0) && (!st.includes('nokids') || !r.children) && (!st.includes('split') || r.separation) && (!st.includes('nosrc') || !r.sources));
            const y = r => r.marriage_year ?? 9999;
            shown = sort === 'old' ? [...shown].sort((a, b) => y(a) - y(b)) : sort === 'new' ? [...shown].sort((a, b) => (b.marriage_year ?? -1) - (a.marriage_year ?? -1)) : sort === 'kids' ? [...shown].sort((a, b) => b.children - a.children) : shown;
            bar.setCount(shown.length === rows.length ? plural(rows.length, T('couple')) : T('{n} sur {t}', {n: plural(shown.length, T('couple')), t: rows.length.toLocaleString('fr-FR')}));
            const who = (id, name) => (id ? `<button type="button" class="table-link" data-lp-person="${id}">${esc(name || '?')}</button>` : '<span class="muted">?</span>');
            body.innerHTML = !shown.length ? A().emptyState({icon: '💍', text: rows.length ? T('Aucun couple ne correspond') : T('Aucun couple pour l’instant'), hint: rows.length ? T('Change les mots cherchés ou retire un filtre.') : T('Un couple se crée sur une fiche, en ajoutant un conjoint.')})
                : `<div class="data-table-wrap"><table class="data-table sortable-table lp-table"><thead><tr><th>${esc(T('Couple'))}</th><th>${esc(T('Mariage'))}</th><th>${esc(T('Lieu du mariage'))}</th><th>${esc(T('Enfants'))}</th><th>${esc(T('Séparation'))}</th><th>${esc(T('Sources'))}</th><th></th></tr></thead><tbody>${shown.map(r => `<tr data-lp-fam="${r.id}"><td data-sort-value="${esc(nm(r))}">${who(r.partner1_id, r.partner1)} <span class="muted">&amp;</span> ${who(r.partner2_id, r.partner2)}</td><td data-sort-value="${r.marriage_year ?? ''}">${esc(r.marriage_date || '')}</td><td>${esc(r.marriage_place || '')}</td><td data-sort-value="${r.children}">${r.children}</td><td>${esc(r.separation || '')}</td><td data-sort-value="${r.sources}">${r.sources}</td><td>${more(`data-lp-fam-more="${r.id}"`, nm(r))}</td></tr>`).join('')}</tbody></table></div>`;
        }
        body.addEventListener('click', e => { const b = e.target.closest('[data-lp-fam-more]'); if (!b) return; const r = rows.find(x => x.id === Number(b.dataset.lpFamMore)); if (!r) return;
            UI().menuAt(b, [r.partner1_id && {icon: '↗', label: T('Ouvrir la fiche de {name}', {name: r.partner1 || '?'}), run: () => openPerson(r.partner1_id)}, r.partner2_id && {icon: '↗', label: T('Ouvrir la fiche de {name}', {name: r.partner2 || '?'}), run: () => openPerson(r.partner2_id)},
                {icon: '📋', label: T('Copier'), run: () => copy([nm(r), r.marriage_date, r.marriage_place].filter(Boolean).join(' — '))}], {title: nm(r)}); });
        paint();
    };

    /* ═════════════ 🔤 Noms de famille ═════════════ */
    ext.lists.surnames_list = async (token = S().workspaceToken) => {
        if (view.surname) return renderSurname(view.surname, token);
        const w = ws(); if (!w) return;
        w.innerHTML = `<section class="page collection-page lp-page" data-lp="surnames">${UI().pageHeader({title: T('🔤 Noms de famille'), help: esc(T('Chaque nom de famille : combien de personnes le portent, à quelle époque, où, ses autres orthographes. Un clic : les personnes de ce nom.')), actions: [printBtn]})}<div data-lp-bar></div><div data-lp-body>${wait()}</div></section>`;
        let d; try { d = await get('surnames'); } catch (e) { if (live(token, 'surnames_list')) w.querySelector('[data-lp-body]').innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
        if (!live(token, 'surnames_list')) return;
        const rows = d.rows;
        const bar = UI().listBar({key: 'listes:surnames_list', search: {placeholder: T('Chercher un nom… (ex. Mazaud, Tulle)')},
            filters: [{id: 'state', label: T('Afficher'), type: 'check', options: [['many', T('Portés par au moins 2 personnes')], ['variants', T('Avec des variantes')], ['nogroup', T('Sans groupe')]]}],
            sort: {options: [['az', T('A → Z')], ['most', T('Les plus portés')], ['old', T('Les plus anciens')]], value: 'az'}, count: true, onChange: () => paint()});
        w.querySelector('[data-lp-bar]').replaceWith(bar); ext.listSavedFilters?.(bar, S().listType); // 💾
        const body = w.querySelector('[data-lp-body]');
        function paint() {
            const {q, filters: f, sort} = bar.state, st = f.state || [], LM = UI().listMatch;
            let shown = rows.filter(r => (LM ? LM.text(q, r.name, r.spellings, r.variants, r.places, r.group) : true) && (!st.includes('many') || r.count > 1) && (!st.includes('variants') || r.variants.length || r.spellings.length) && (!st.includes('nogroup') || !r.group));
            shown = sort === 'most' ? [...shown].sort((a, b) => b.count - a.count) : sort === 'old' ? [...shown].sort((a, b) => (a.from ?? 9999) - (b.from ?? 9999)) : shown;
            bar.setCount(shown.length === rows.length ? plural(rows.length, T('nom')) : T('{n} sur {t}', {n: plural(shown.length, T('nom')), t: rows.length.toLocaleString('fr-FR')}));
            body.innerHTML = !shown.length ? A().emptyState({icon: '🔤', text: rows.length ? T('Aucun nom ne correspond') : T('Aucun nom de famille pour l’instant')})
                : `<div class="data-table-wrap"><table class="data-table sortable-table lp-table"><thead><tr><th>${esc(T('Nom'))}</th><th>${esc(T('Porteurs'))}</th><th>${esc(T('Période'))}</th><th>${esc(T('Lieux'))}</th><th>${esc(T('Variantes'))}</th><th>${esc(T('Groupe'))}</th></tr></thead><tbody>${shown.map(r => `<tr data-lp-sn="${esc(r.name)}"><td data-sort-value="${esc(r.key)}"><button type="button" class="table-link" data-lp-sn-open="${esc(r.name)}">${esc(r.name)}</button></td><td data-sort-value="${r.count}">${r.count}</td><td data-sort-value="${r.from ?? ''}">${r.from ? esc(r.from === r.to || !r.to ? String(r.from) : `${r.from}–${r.to}`) : ''}</td><td>${esc(r.places.join(', '))}</td><td>${esc([...r.spellings, ...r.variants].join(', '))}</td><td>${esc(r.group)}</td></tr>`).join('')}</tbody></table></div>`;
        }
        paint();
    };
    async function renderSurname(name, token) {
        const w = ws(); if (!w) return;
        w.innerHTML = `<section class="page lp-page" data-lp="surname">${UI().pageHeader({detail: true, title: name, back: `<button type="button" class="back-link link-button" data-lp-back>← ${esc(T('Tous les noms'))}</button>`, actions: [printBtn]})}<div data-lp-body>${wait()}</div></section>`;
        let d; try { d = await get('surname', {name}); } catch (e) { toast(e.message, 'error'); return; }
        if (!live(token, 'surnames_list')) return;
        const body = w.querySelector('[data-lp-body]');
        const paint = () => {
            body.innerHTML = d.rows.length ? `<div class="data-table-wrap"><table class="data-table sortable-table lp-table"><thead><tr><th>${esc(T('Personne'))}</th><th>${esc(T('Naissance'))}</th><th>${esc(T('Décès'))}</th><th></th></tr></thead><tbody>${d.rows.map(p => `<tr data-sel-id="${p.id}"><td><button type="button" class="table-link" data-lp-person="${p.id}">${esc(`${p.first_name || ''} ${p.last_name || ''}`.trim())}</button>${Number(p.is_locked) ? ' 🔒' : ''}</td><td>${esc(p.birth_date ?? '')}</td><td>${esc(p.death_date ?? '')}</td><td>${more(`data-lp-p-more="${p.id}"`, `${p.first_name} ${p.last_name}`)}</td></tr>`).join('')}</tbody></table></div>` : A().emptyState({icon: '👤', text: T('Personne ne porte ce nom')});
            const h = w.querySelector('.ui-ph-text p') || null; if (h) h.textContent = plural(d.rows.length, T('personne'));
        };
        paint();
        const after = async () => { try { d = await get('surname', {name}); } catch (_) {} paint(); sel?.refresh(); };
        const sel = d.rows.length ? ext.selectionBar?.({host: body, key: 'listes:surname:' + name, what: [T('fiche cochée'), T('fiches cochées')], actions: ext.selectionBar.personActions({after, name})}) : null;
        body.addEventListener('click', e => { const b = e.target.closest('[data-lp-p-more]'); if (b) personMenu(b, Number(b.dataset.lpPMore), after); });
    }
    /** le « ⋯ » d'une fiche dans une liste : les mêmes actions que la barre de sélection, pour une seule fiche */
    function personMenu(anchor, id, after) {
        const SB = ext.selectionBar; if (!SB) return;
        const acts = SB.personActions({after}), fake = {clear: () => {}, rows: () => [anchor.closest('tr')].filter(Boolean)};
        const by = k => acts.find(a => a.id === k);
        UI().menuAt(anchor, [{icon: '↗', label: T('Ouvrir'), run: () => openPerson(id)},
            !kiosk() && {icon: '✎', label: T('Modifier'), run: () => openPerson(id)},
            ...['label', 'mylist', 'lock', 'unlock', 'export', 'delete'].map(by).filter(a => a && !(a.edit && kiosk())).map(a => ({icon: a.icon, label: a.label, help: a.help, danger: a.danger, run: () => a.run([String(id)], fake)}))]);
    }
    ext.listPersonMenu = personMenu;

    /* ═════════════ 📝 Notes ═════════════ */
    ext.lists.notes_list = async (token = S().workspaceToken) => {
        const w = ws(); if (!w) return;
        w.innerHTML = `<section class="page collection-page lp-page" data-lp="notes">${UI().pageHeader({title: T('📝 Notes'), help: esc(T('Toutes les notes écrites sur les fiches, les événements, les couples et les sources. La recherche lit tout le texte.')), actions: [printBtn]})}<div data-lp-bar></div><div data-lp-body>${wait()}</div><div class="list-more-wrap" data-lp-more-wrap></div></section>`;
        const body = w.querySelector('[data-lp-body]');
        let d = {rows: [], total: 0}, gen = 0;
        const bar = UI().listBar({key: 'listes:notes_list', search: {placeholder: T('Chercher dans les notes… (ex. moulin, Tulle, 1870)')},
            filters: [{id: 'kind', label: T('Rattachées à'), type: 'radio', options: [['', T('Tout')], ['person', T('Fiches')], ['event', T('Événements')], ['family', T('Couples')], ['source', T('Sources')]], dflt: ''}],
            sort: {options: [['recent', T('Les plus récentes')], ['az', T('A → Z')]], value: 'recent'}, count: true, onChange: (st, {what}) => (what === 'q' ? load() : paint())});
        w.querySelector('[data-lp-bar]').replaceWith(bar); ext.listSavedFilters?.(bar, S().listType); // 💾
        async function load(append = false) {
            const g = ++gen;
            if (!append) body.innerHTML = wait();
            let r; try { r = await get('notes', {q: bar.state.q, offset: append ? d.rows.length : 0}); } catch (e) { body.innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
            if (g !== gen || !live(token, 'notes_list')) return;
            d = append ? {...r, rows: d.rows.concat(r.rows)} : r; paint();
        }
        const kinds = {person: T('Fiche'), event: T('Événement'), family: T('Couple'), source: T('Source'), media: T('Média')};
        const mark = (text, q) => { let h = esc(text); (q || '').split(/\s+/).filter(x => x.length > 1).forEach(x => { h = h.replace(new RegExp(`(${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;')})`, 'gi'), '<mark>$1</mark>'); }); return h; };
        let sel = null;
        // 🗂 « Ranger par personne » (case de cet écran, non au départ) : un tbody par personne, sa ligne d'en-tête comme un cadre
        const noteBodies = (list, row) => (UI().framesOn?.() && UI().framesPref('notes') ? UI().groupByPerson(list, r => r.person_id).map(g => (g.key ? UI().personTbodyHtml({cols: 4, id: g.key, name: g.items[0].person_name || g.items[0].label || '', count: plural(g.items.length, T('note')), rows: g.items.map(row).join('')})
            : UI().personTbodyHtml({cols: 4, name: T('Sans personne'), count: plural(g.items.length, T('note')), rows: g.items.map(row).join('')}))).join('') : `<tbody>${list.map(row).join('')}</tbody>`);
        bar.after(UI().framesOption?.('notes', () => paint()) || '');
        function paint() {
            const {q, filters: f, sort} = bar.state;
            let shown = d.rows.filter(r => !f.kind || r.entity_type === f.kind);
            if (sort === 'az') shown = [...shown].sort((a, b) => String(a.title || a.excerpt).localeCompare(String(b.title || b.excerpt), 'fr', {sensitivity: 'base'}));
            bar.setCount(T('{n} sur {t}', {n: plural(shown.length, T('note')), t: d.total.toLocaleString('fr-FR')}));
            body.innerHTML = !shown.length ? A().emptyState({icon: '📝', text: q ? T('Aucune note ne contient ces mots') : T('Aucune note pour l’instant'), hint: q ? T('Essaie un autre mot, ou une partie du mot.') : T('Les notes s’écrivent sur les fiches, les événements et les sources.')})
                : `<div class="data-table-wrap"><table class="data-table lp-table lp-notes"><thead><tr><th>${esc(T('Note'))}</th><th>${esc(T('Rattachée à'))}</th><th>${esc(T('Modifiée'))}</th><th></th></tr></thead>${noteBodies(shown, r => `<tr data-sel-id="${r.id}"><td>${r.title ? `<b>${mark(r.title, q)}</b><br>` : ''}<span class="lp-excerpt">${mark(r.excerpt, q)}</span></td>
                    <td><small class="muted">${esc(kinds[r.entity_type] || r.kind || r.entity_type)}</small><br>${r.person_id ? `<button type="button" class="table-link" data-lp-person="${r.person_id}">${esc(r.label)}</button>` : r.source_id ? `<button type="button" class="table-link" data-lp-src-open="${r.source_id}">${esc(r.label)}</button>` : esc(r.label)}</td>
                    <td data-sort-value="${esc(r.updated_at || '')}">${UI().when?.(r.updated_at) || ''}</td><td>${more(`data-lp-note-more="${r.id}"`, r.title || r.excerpt.slice(0, 30))}</td></tr>`)}</table></div>`;
            const mw = w.querySelector('[data-lp-more-wrap]'); mw.innerHTML = '';
            if (d.rows.length < d.total) { const b = UI().moreButton ? UI().moreButton({remaining: d.total - d.rows.length, step: 200, feminine: true}) : Object.assign(document.createElement('button'), {className: 'button secondary', textContent: T('Voir plus')}); b.addEventListener('click', () => load(true)); mw.appendChild(b); }
            if (sel) sel.refresh(); else if (shown.length && ext.selectionBar) sel = ext.selectionBar({host: body, key: 'listes:notes', what: [T('note cochée'), T('notes cochées')], actions: [ext.selectionBar.labelAction('note', {after: () => load()}), ext.selectionBar.exportAction({name: T('notes')}),
                {id: 'delete', icon: '🗑', label: T('Supprimer'), edit: true, danger: true, help: T('« ↶ Annuler » les remet'), run: async (ids, s) => { await deleteNotes(ids.map(Number)); s.clear(); }}]});
        }
        async function deleteNotes(ids) {
            const done = [];
            for (const id of ids) { try { await A().api('delete_note', {}, {method: 'POST', body: {id}}); done.push(id); } catch (e) { toast(e.message, 'error'); } }
            await load(); if (!done.length) return;
            A().undoToast?.(T('{n} supprimées', {n: plural(done.length, T('note'))}), {undo: async () => { for (const id of done.reverse()) await A().api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'note', entity_id: id}}); await load(); }});
        }
        function editNote(r) {
            ext.openDialog?.({eyebrow: T('NOTE'), title: T('Modifier la note'), wide: true, body: `<div class="form-grid one-column"><label>${esc(T('Titre'))}<input name="title" maxlength="500" value="${esc(r.title)}"></label><label>${esc(T('Texte'))}<textarea name="body" rows="12" required>${esc(r.body ?? '')}</textarea></label></div>`,
                onSubmit: async f => { const v = Object.fromEntries(new FormData(f)), before = {title: r.title, body: r.body};
                    await A().api('save_note', {}, {method: 'POST', body: {id: r.id, title: v.title, body: v.body}}); await load();
                    A().undoToast?.(T('Note modifiée'), {undo: async () => { await A().api('save_note', {}, {method: 'POST', body: {id: r.id, ...before}}); await load(); }}); }});
        }
        body.addEventListener('click', e => {
            const b = e.target.closest('[data-lp-note-more]'); if (!b) return; const r = d.rows.find(x => x.id === Number(b.dataset.lpNoteMore)); if (!r) return;
            UI().menuAt(b, [{icon: '↗', label: T('Ouvrir'), help: r.label, run: () => (r.person_id ? openPerson(r.person_id) : r.source_id ? (view.source = r.source_id, S().listType = 'sources_list', A().renderSidebar?.(), reload()) : null)},
                !kiosk() && r.body != null && {icon: '✎', label: T('Modifier'), run: () => editNote(r)},
                {icon: '📋', label: T('Copier'), run: () => copy(`${r.title ? r.title + '\n' : ''}${r.excerpt}`)},
                '-', !kiosk() && {icon: '🗑', label: T('Supprimer'), danger: true, help: T('« ↶ Annuler » la remet'), run: () => deleteNotes([r.id])}], {title: r.title || T('Note')});
        });
        await load();
    };

    /* ─────────── clics communs ─────────── */
    document.addEventListener('click', e => {
        const t = e.target; if (!(t instanceof Element)) return;
        if (t.closest('[data-side-value]')) { view = {source: 0, surname: ''}; return; } // un autre choix dans la colonne : la liste, pas l'élément ouvert
        if (!t.closest('.lp-page')) return;
        const p = t.closest('[data-lp-person]'); if (p) { openPerson(Number(p.dataset.lpPerson)); return; }
        const so = t.closest('[data-lp-src-open]'); if (so) { view.source = Number(so.dataset.lpSrcOpen); if (S().listType !== 'sources_list') { S().listType = 'sources_list'; A().renderSidebar?.(); } reload(); return; }
        const sm = t.closest('[data-lp-src-more]'); if (sm) { srcMenu(sm, sm.dataset.lpSrcMore); return; }
        const sn = t.closest('[data-lp-sn-open]'); if (sn) { view.surname = sn.dataset.lpSnOpen; reload(); return; }
        if (t.closest('[data-lp-back]')) { view = {source: 0, surname: ''}; reload(); return; }
        const del = t.closest('[data-lp-src-del]'); if (del) { const id = Number(del.dataset.lpSrcDel); view.source = 0; deleteSources([id]); return; }
        const cp = t.closest('[data-lp-copy]'); if (cp) { copy(cp.dataset.lpCopy); return; }
        if (t.closest('[data-lp-print]')) { UI().printPage?.(); return; }
        if (t.closest('[data-lp-src-new]')) {
            ext.openDialog?.({eyebrow: T('SOURCES'), title: T('Nouvelle source'), body: `<div class="form-grid"><label class="span-2">${esc(T('Titre'))}<input name="title" required maxlength="500" placeholder="${esc(T('ex. État civil de Tulle, naissances 1823'))}"></label><label>${esc(T('Auteur'))}<input name="author" maxlength="500"></label><label>${esc(T('Dépôt'))}<input name="agency" maxlength="500" placeholder="${esc(T('ex. Archives de la Corrèze'))}"></label><label class="span-2">${esc(T('Lien'))}<input name="url" type="url" maxlength="2000" placeholder="https://…"></label></div>`,
                onSubmit: async f => { const r = await post({op: 'source_create', ...Object.fromEntries(new FormData(f))}); view.source = r.id; await reload(); A().undoToast?.(T('Source ajoutée'), {undo: async () => { await A().api('delete_source', {}, {method: 'POST', body: {id: r.id}}); view.source = 0; await reload(); }}); }});
        }
    });

    /* ─────────── les listes dans la colonne (comme heritage-mouvements.js) ─────────── */
    const boot = () => {
        const L = A()?.defaultListTypes; if (!Array.isArray(L)) return false;
        LISTS.forEach(([key, num, label, , after]) => { if (L.some(x => x[0] === key)) return; const i = L.findIndex(x => x[0] === after); L.splice(i < 0 ? L.length : i + 1, 0, [key, num, label]); });
        return true;
    };
    if (!boot()) document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.listesPlus = {LISTS, view: () => view, open: (kind, v) => { view[kind] = v; }, personMenu};
})();
