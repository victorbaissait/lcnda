/* LCNDA — 🎉 Organiser une cousinade (Listes → Recherche et organisation → « 🎉 Cousinades » ; aussi Listes → Outils de
 * modification, et ⋯ de la fiche d'une personne → « 🎉 Organiser une cousinade… »).
 * Un projet par cousinade (barre H10, vignettes K9) :
 *  1. l'ancêtre ou le couple (menu de choix) ; 2. les descendants VIVANTS trouvés par l'app (et leurs conjoints), par branche,
 *     avec le lien de parenté envers l'ancêtre et envers une personne de référence ; la liste des invités (case, coordonnées
 *     reprises des fiches et du répertoire des vivants, modifiables ici sans toucher la fiche sauf « aussi dans le répertoire »,
 *     réponse, nombre, régime, note) ; ⤒ importer une liste (tableur, K13) ;
 *  3. invitations : une par foyer — 🖨 L1 (PDF), 📝 traitement de texte, 📰 faire-part (dessin, moteur des faire-part),
 *     ✉️ courriels prêts (mailto : rien n'est envoyé par l'app), 📁 copie dans les médias ;
 *  4. badges (planche A4, L1) ; 5. grand arbre de descendance (dessin vectoriel, export E3 : PDF, fond perdu…) ;
 *  6. jour J : présence, plan de table par branche, album (fenêtre d'image unique) ; 7. chiffres.
 * Serveur : lib/cousinade.php (GET cousinade, POST cousinade_write). Calculs : app-cousinade-core.js (window.LCNDA_COUSINADE).
 * Confidentialité : jamais une fiche confidentielle ; les coordonnées des vivants restent dans le projet ; le seul fichier
 * qui sort est le tableau des invités, avec une case explicite pour les adresses ; rien en mode consultation.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP, C = () => window.LCNDA_COUSINADE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['lists']) ext[k] = ext[k] || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const LIST = 'cousinades';
    const get = (op, q = {}) => A().api('cousinade', {op, ...q});
    const post = body => A().api('cousinade_write', {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const plural = (n, w, many) => (A().plural ? A().plural(n, w, many) : `${n} ${w}`);
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const store = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const ANSWERS = [['', 'Sans réponse', 'grey'], ['yes', 'Oui', 'green'], ['maybe', 'Peut-être', 'yellow'], ['no', 'Non', 'red']];
    const answerOf = v => ANSWERS.find(a => a[0] === (v || '')) || ANSWERS[0];
    const TABS = [['guests', '👥 Invités'], ['invit', '✉️ Invitations'], ['badges', '🏷 Badges'], ['tree', '🌳 Grand arbre'], ['day', '📅 Jour J'], ['stats', '📊 Chiffres']];
    const DEFAULT_TEXT = 'Chère {foyer},\n\nLa famille se retrouve ! Tous les descendants de {ancetre} sont invités à « {titre} », le {date} à {lieu}.\n\nViens avec les tiens partager un repas, des photos et des souvenirs, et rencontrer les cousins de toutes les branches.\n\nMerci de répondre avant le {reponse_avant} : {contact}.\n\nÀ très bientôt !';
    const legacyAv = g => { const s = g.gender === 'male' ? 'm' : g.gender === 'female' ? 'f' : 'u'; const ini = `${String(g.first_name || '').trim()[0] || ''}${String(g.last_name || '').trim()[0] || ''}`.toUpperCase() || '?'; return g.portrait ? `<span class="pk-av ${s} cous-av"><img src="media/${encodeURIComponent(g.portrait)}" alt=""></span>` : `<span class="pk-av ${s} cous-av" aria-hidden="true">${esc(ini)}</span>`; };
    const avatar = (g, size = 34) => (g.person_id && UI()?.avatarOr ? UI().avatarOr({id: g.person_id, name: C().fullName(g), gender: g.gender}, size, legacyAv(g)) : legacyAv(g));

    /* ═════ la liste dans Listes ═════ */
    const addList = () => { const app = A(); if (app?.defaultListTypes && !app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '33b', '🎉 Cousinades']); };
    addList(); document.addEventListener('DOMContentLoaded', addList, {once: true});

    let cur = {id: 0, data: null, tab: store.get('lcnda-cousinade-tab', 'guests'), sub: 'presence'};
    const openList = (id = 0) => { cur.id = id; cur.data = null; const st = A().state; st.listType = LIST; st.precisePlaceKey = ''; if (st.module === 'listes') { A().renderSidebar?.(); ext.lists[LIST](); } else A().setModule('listes'); };
    const ws = () => document.getElementById('workspace');
    const sameTurn = token => token === undefined || !A().state || token === A().state.workspaceToken;

    ext.lists[LIST] = async (token = A().state?.workspaceToken) => {
        const w = ws(); if (!w) return;
        if (cur.id) return renderProject(w, token);
        w.innerHTML = `<section class="page cous-page">${UI().pageHeader({title: 'Cousinades', icon: '🎉', where: 'Listes · Recherche et organisation', help: 'Réunir les descendants d’un ancêtre : invités, invitations, badges, grand arbre, jour J.',
            actions: [kiosk() ? '' : '<button type="button" class="button" data-cous-new>＋ Nouvelle cousinade</button>']})}<div data-cous-body>${UI().spinner('Lecture des cousinades…')}</div></section>`;
        const body = w.querySelector('[data-cous-body]');
        let d; try { d = await get('list'); } catch (e) { body.innerHTML = UI().notice(kiosk() ? 'info' : 'error', e.message); return; }
        if (!sameTurn(token)) return;
        const rows = d.items || [];
        if (!rows.length) { body.innerHTML = A().emptyState({icon: '🎉', text: 'Aucune cousinade pour l’instant', hint: 'Choisis un ancêtre (ou un couple) : l’app trouve ses descendants vivants, branche par branche, et prépare la liste des invités.', action: kiosk() ? null : {label: '＋ Nouvelle cousinade', attrs: 'data-cous-new'}}); return; }
        const bar = UI().listBar({key: 'listes:cousinades', search: {placeholder: 'Chercher… (ex. Martin, 2026, Tulle)'}, view: {dflt: 'cards', what: 'fiches'},
            sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'recent'}, onChange: st => draw(st)});
        body.innerHTML = '<div data-cous-items></div>'; body.prepend(bar);
        const M = UI().listMatch;
        function draw(st = bar.state) {
            let list = rows.filter(r => M.text(st.q, r.title, r.ancestor, r.ancestor2, r.date_text, r.place_text));
            list = st.sort === 'old' ? UI().sortItems(list, 'old') : st.sort === 'az' || st.sort === 'za' ? UI().sortItems(list, st.sort, {name: r => r.title}) : UI().sortItems(list, 'recent');
            bar.setCount(list.length, 'cousinade');
            body.querySelector('[data-cous-items]').innerHTML = list.length ? UI().itemsHtml(st.view, list.map(r => ({
                thumb: r.cover ? `<img src="media/${encodeURIComponent(r.cover)}" alt="" loading="lazy">` : '<span class="ui-card-ico" aria-hidden="true">🎉</span>',
                name: r.title, open: `data-cous-open="${r.id}"`, attrs: `data-cous-row="${r.id}" data-ctx-menu`,
                lines: [r.ancestor ? `Descendants de ${r.ancestor}${r.ancestor2 ? ' et ' + r.ancestor2 : ''}` : '', [r.date_text, r.place_text].filter(Boolean).join(' · ')].filter(Boolean),
                badges: [{text: plural(r.invited, 'invité'), kind: 'blue'}, r.yes ? {text: i18n('{n} oui', {n: r.yes}), kind: 'green'} : null, r.waiting ? {text: i18n('{n} sans réponse', {n: r.waiting}), kind: 'yellow'} : null].filter(Boolean),
                when: r.updated_at, whenLabel: 'Modifié',
                menu: kiosk() ? [] : [`<button type="button" data-cous-ren="${r.id}">✎ Renommer</button>`, `<button type="button" class="danger" data-cous-del="${r.id}">🗑 Supprimer</button>`]}))) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Aucune cousinade ne correspond.</span></p>';
        }
        draw();
        listRows = rows;
    };
    let listRows = [];
    const rowOf = id => listRows.find(r => r.id === Number(id));
    async function renameProject(id, again) {
        const r = rowOf(id) || cur.data; const name = await A().askText({title: 'Renommer la cousinade', message: 'Nouveau nom :', value: r?.title || '', okLabel: 'Enregistrer'});
        if (name === null || !String(name).trim()) return;
        try { await post({op: 'save', id: Number(id), title: String(name).trim()}); } catch (e) { toast(e.message, 'error'); return; }
        toast('Cousinade renommée.', 'success'); again ? again() : ext.lists[LIST]();
    }
    async function deleteProject(id, after) {
        const r = rowOf(id) || cur.data;
        try { await post({op: 'delete', id: Number(id)}); } catch (e) { toast(e.message, 'error'); return; }
        if (cur.id === Number(id)) { cur.id = 0; cur.data = null; }
        (after || (() => ext.lists[LIST]()))();
        A().undoToast(i18n('Cousinade supprimée : « {name} »', {name: r?.title || ''}), {undo: async () => { await post({op: 'restore', id: Number(id)}); (after || (() => ext.lists[LIST]()))(); }, redo: async () => { await post({op: 'delete', id: Number(id)}); (after || (() => ext.lists[LIST]()))(); }});
    }

    /* ═════ ＋ Nouvelle cousinade / ✎ Modifier ═════ */
    function openProjectDialog({data = null, ancestor = 0} = {}) {
        if (kiosk()) return toast('Mode consultation : rien ne peut être modifié.');
        const d = data || {};
        const refDefault = d.ref_id || Number(A().sosaRootId?.() || 0) || null;
        const dlg = ext.openDialog({eyebrow: '🎉 COUSINADE', title: data ? 'Modifier la cousinade' : 'Nouvelle cousinade', wide: false,
            body: `<div class="cous-form">
                <div><span class="pk-lab">L’ancêtre dont on réunit les descendants</span>${P().pickerField({name: 'ancestor_id', kind: 'person', animals: false, value: d.ancestor_id || ancestor || null})}</div>
                <div><span class="pk-lab">Avec son conjoint (le couple) — facultatif</span>${P().pickerField({name: 'ancestor2_id', kind: 'person', animals: false, value: d.ancestor2_id || null})}<p class="ui-hint">Seulement les enfants du couple. Vide : tous les enfants de l’ancêtre.</p></div>
                <label>Nom de la cousinade<input name="title" maxlength="160" value="${esc(d.title || '')}" placeholder="Cousinade MARTIN 2027"></label>
                <div class="cous-2"><label>Date<input name="date_text" data-ui-date maxlength="120" value="${esc(d.date_text || '')}" placeholder="12 juin 2027"></label>
                <div><span class="pk-lab">Lieu</span>${P().pickerField({name: 'place_id', kind: 'place', value: d.place_id || null})}</div></div>
                <div><span class="pk-lab">Personne de référence pour les liens de parenté</span>${P().pickerField({name: 'ref_id', kind: 'person', animals: false, value: refDefault})}<p class="ui-hint">Chaque invité aura son lien avec elle (« cousin issu de germains de … »). Toi, le plus souvent.</p></div>
                ${UI().checkHtml('Inviter aussi les conjoints des descendants', {checked: d.include_spouses !== false, attrs: 'name="include_spouses"'})}
                <div class="cous-preview" data-cous-preview aria-live="polite"></div>
                <p class="ui-hint">🔒 Les fiches confidentielles ne sont jamais montrées. Les adresses des vivants restent dans ce projet.</p></div>`,
            onOpen: dg => {
                const f = dg.querySelector('form') || dg, prev = dg.querySelector('[data-cous-preview]');
                let seq = 0;
                const refresh = async () => {
                    const a = Number(f.querySelector('[name=ancestor_id]')?.value) || 0, b = Number(f.querySelector('[name=ancestor2_id]')?.value) || 0, my = ++seq;
                    if (!a) { prev.innerHTML = A().empty('Choisis l’ancêtre : l’app cherche ses descendants vivants.', {icon: '🌳'}); return; }
                    prev.innerHTML = UI().spinner('Recherche des descendants vivants…', {inline: true});
                    try { const r = await get('preview', {ancestor_id: a, ancestor2_id: b, spouses: f.querySelector('[name=include_spouses]')?.checked ? 1 : 0}); if (my !== seq) return;
                        prev.innerHTML = UI().notice(r.descendants ? 'info' : 'warn', (r.found > r.descendants ? i18n('{who} dans {branches}, et {spouses}.', {who: plural(r.descendants, 'descendant vivant', 'descendants vivants'), branches: plural(r.branches, 'branche'), spouses: plural(r.found - r.descendants, 'conjoint')}) : i18n('{who} dans {branches}.', {who: plural(r.descendants, 'descendant vivant', 'descendants vivants'), branches: plural(r.branches, 'branche')})) + (r.doubt ? ' ' + i18n('{n} sans décès noté, née il y a moins de 100 ans : marquée « vivant ? ».', {n: plural(r.doubt, 'personne')}) : '') + (r.private ? ' ' + i18n(r.private > 1 ? '{n} laissées de côté.' : '{n} laissée de côté.', {n: plural(r.private, 'fiche confidentielle')}) : ''));
                    } catch (e) { if (my === seq) prev.innerHTML = UI().notice('error', e.message); }
                };
                f.addEventListener('picker-change', e => { if (e.target.closest('.pk')?.querySelector('[name=ancestor_id],[name=ancestor2_id]') || /ancestor/.test(e.target.closest('.pk')?.querySelector('input[type=hidden]')?.name || '')) refresh(); });
                f.querySelector('[name=include_spouses]')?.addEventListener('change', refresh);
                refresh();
            },
            onSubmit: async form => {
                const v = n => form.querySelector(`[name=${n}]`)?.value || '';
                const a = Number(v('ancestor_id')) || 0;
                if (!a) return UI().fail(form.querySelector('[name=ancestor_id]')?.closest('.pk') || form.elements.title, 'Choisis l’ancêtre dont on réunit les descendants.');
                const body = {op: 'save', id: d.id || 0, ancestor_id: a, ancestor2_id: Number(v('ancestor2_id')) || 0, ref_id: Number(v('ref_id')) || 0, title: v('title'), date_text: v('date_text'), place_id: Number(v('place_id')) || 0,
                    include_spouses: form.querySelector('[name=include_spouses]')?.checked ? 1 : 0, place_text: ''};
                let r; try { r = await post(body); } catch (e) { toast(e.message, 'error'); return false; }
                const res = r.result || r, added = res.fill?.added?.length || 0;
                if (!d.id) toast(i18n('Cousinade créée : {n}.', {n: plural(added, 'invité trouvé', 'invités trouvés')}), 'success');
                else if (res.fill) A().undoToast(i18n('Cousinade enregistrée : {n}.', {n: plural(added, 'nouvel invité', 'nouveaux invités')}), {undo: async () => { await post({op: 'guests_purge', cousinade_id: res.id, ids: res.fill.added}); reload(); }});
                else toast('Cousinade enregistrée.', 'success');
                openList(res.id);
            }});
        return dlg;
    }

    /* ═════ La page d'un projet ═════ */
    const reload = async () => { if (A().state?.module === 'listes' && A().state.listType === LIST && cur.id) { cur.data = null; ext.lists[LIST](); } };
    const branchesOf = d => d.branches.map((b, i) => ({...b, color: d.options?.branchColors?.[b.id] || C().branchColor(i)}));
    const branchOf = (d, id) => branchesOf(d).find(b => b.id === id) || null;
    const dot = (d, id) => { const b = branchOf(d, id); return b ? `<span class="cous-dot" style="--cous-c:${esc(b.color)}" title="Branche ${esc(b.name)}"></span>` : '<span class="cous-dot is-none" title="Sans branche"></span>'; };
    async function renderProject(w, token) {
        if (!cur.data || cur.data.id !== cur.id) {
            w.innerHTML = `<section class="page cous-page">${UI().spinner('Lecture de la cousinade…')}</section>`;
            try { cur.data = await get('get', {id: cur.id}); } catch (e) { cur.id = 0; w.innerHTML = `<section class="page">${UI().notice('error', e.message)}<p><button type="button" class="button secondary" data-cous-back>← Toutes les cousinades</button></p></section>`; return; }
            if (!sameTurn(token)) return;
        }
        const d = cur.data;
        if (!TABS.some(t => t[0] === cur.tab)) cur.tab = 'guests';
        const help = [d.ancestor_name ? i18n('Descendants de {nm}', {nm: esc(d.ancestor_name)}) : '', esc(d.date_text), esc(d.place_text)].filter(Boolean).join(' · ');
        w.innerHTML = `<section class="page cous-page" data-cous-project="${d.id}">${UI().pageHeader({title: d.title, icon: '🎉', where: 'Listes · Cousinades', help,
            back: '<button type="button" class="button small secondary cous-back" data-cous-back>← Toutes les cousinades</button>',
            actions: kiosk() ? [] : ['<button type="button" class="button secondary" data-cous-edit>✎ Modifier</button>'],
            more: kiosk() ? [] : ['<button type="button" data-cous-rescan>↻ Chercher les nouveaux descendants</button>', `<button type="button" data-cous-ren="${d.id}">✎ Renommer</button>`, d.ancestor_id ? `<button type="button" data-h-person="${d.ancestor_id}">↗ Fiche de l’ancêtre</button>` : '', `<button type="button" class="danger" data-cous-del="${d.id}">🗑 Supprimer</button>`]})}
            <div class="segmented cous-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-cous-tab="${k}" class="${cur.tab === k ? 'is-active' : ''}" aria-selected="${cur.tab === k}">${l}</button>`).join('')}</div>
            ${d.hidden ? UI().notice('info', i18n(d.hidden > 1 ? '{n} n’apparaissent plus : sa fiche est devenue confidentielle (ou a été supprimée).' : '{n} n’apparaît plus : sa fiche est devenue confidentielle (ou a été supprimée).', {n: plural(d.hidden, 'invité')})) : ''}
            <div data-cous-tabbody></div></section>`;
        const body = w.querySelector('[data-cous-tabbody]');
        ({guests: tabGuests, invit: tabInvit, badges: tabBadges, tree: tabTree, day: tabDay, stats: tabStats})[cur.tab](body, d);
    }
    const saveOptions = async (patch, {quiet = false} = {}) => {
        const d = cur.data; let r; try { r = await post({op: 'options', id: d.id, patch}); } catch (e) { toast(e.message, 'error'); return null; }
        const res = r.result || r; d.options = res.options; if (!quiet) toast('✓ Enregistré', 'success'); return res;
    };
    const bySort = (d, list, sort) => {
        const bi = id => { const i = d.branches.findIndex(b => b.id === id); return i < 0 ? 999 : i; };
        const name = g => `${g.last_name} ${g.first_name}`;
        if (sort === 'az' || sort === 'za') { const s = [...list].sort((a, b) => name(a).localeCompare(name(b), 'fr')); return sort === 'za' ? s.reverse() : s; }
        if (sort === 'gen') return [...list].sort((a, b) => (a.gen || 99) - (b.gen || 99) || name(a).localeCompare(name(b), 'fr'));
        if (sort === 'answer') { const o = {yes: 0, maybe: 1, '': 2, no: 3}; return [...list].sort((a, b) => o[a.answer || ''] - o[b.answer || ''] || name(a).localeCompare(name(b), 'fr')); }
        return [...list].sort((a, b) => bi(a.branch_id) - bi(b.branch_id) || String(a.foyer).localeCompare(String(b.foyer)) || (a.spouse_of ? 1 : 0) - (b.spouse_of ? 1 : 0) || (a.gen || 99) - (b.gen || 99) || (a.birth || 0) - (b.birth || 0));
    };
    const kinLines = (d, g) => {
        const ref = d.ref, out = [];
        if (g.kin_ancestor) out.push(`${g.kin_ancestor} de ${d.ancestor_name}`);
        if (ref && g.kin_ref) out.push(g.kin_ref === 'self' ? i18n('la personne de référence') : i18n('{x} de {who} (lien)', {x: g.kin_ref, who: ref.first || ref.name}));
        return out;
    };

    /* ── 👥 Invités ── */
    function tabGuests(body, d) {
        const ro = kiosk(), list = d.guests;
        const branches = branchesOf(d);
        body.innerHTML = `<div class="cous-toolbar"><div class="cous-ref"><span class="pk-lab">Liens de parenté avec</span>${P().pickerField({name: '', hiddenName: false, kind: 'person', animals: false, value: d.ref ? {id: d.ref.id, title: d.ref.name} : null})}</div>
            <div class="cous-acts">${ro ? '' : `<button type="button" class="button" data-cous-gadd>＋ Ajouter un invité</button><button type="button" class="button secondary" data-cous-import>⤒ Importer une liste…</button>`}
            <button type="button" class="button secondary" data-cous-export>⤓ Exporter ▾</button>${ro ? '' : '<button type="button" class="icon-button" data-cous-gmore title="Plus d’actions" aria-label="Plus d’actions">⋯</button>'}</div></div>
            <div data-cous-gbody></div>`;
        const box = body.querySelector('[data-cous-gbody]');
        body.querySelector('.cous-ref .pk')?.addEventListener('picker-change', async e => {
            const id = Number(e.detail.value) || 0;
            try { await post({op: 'save', id: d.id, ref_id: id}); } catch (er) { toast(er.message, 'error'); return; }
            reload();
        });
        if (!list.length) { box.innerHTML = A().emptyState({icon: '👥', text: 'Aucun invité pour l’instant', hint: 'Aucun descendant vivant trouvé. Ajoute les invités à la main, importe une liste, ou complète l’arbre puis « ↻ Chercher les nouveaux descendants ».', action: ro ? null : {label: '＋ Ajouter un invité', attrs: 'data-cous-gadd'}}); return; }
        const bar = UI().listBar({key: 'listes:cousinade-guests', search: {placeholder: 'Chercher… (ex. Martin, Brive, végétarien)'},
            filters: [{id: 'branch', label: 'Branche', type: 'check', options: branches.map(b => [String(b.id), b.name])},
                {id: 'answer', label: 'Réponse', type: 'check', options: ANSWERS.map(([v, l]) => [v || 'none', l])},
                {id: 'inv', label: 'Invitation', type: 'radio', options: [['', 'Tous'], ['on', 'Invités (cochés)'], ['off', 'Pas invités']], dflt: ''},
                {id: 'miss', label: 'Coordonnées', type: 'check', options: [['addr', 'Sans adresse'], ['mail', 'Sans courriel']]},
                {id: 'doubt', label: 'À vérifier', type: 'check', text: 'Seulement « vivant ? »', chipLabel: 'Vivant ?'}],
            view: {dflt: 'list', what: 'lignes'}, sort: {options: [['branch', 'Par branche et par foyer'], ['az', 'A → Z'], ['za', 'Z → A'], ['gen', 'Par génération'], ['answer', 'Par réponse']], value: 'branch'},
            onChange: st => draw(st)});
        box.innerHTML = '<div data-cous-glist></div>'; box.prepend(bar);
        const M = UI().listMatch;
        let shown = [];
        function draw(st = bar.state) {
            const f = st.filters || {};
            shown = bySort(d, list.filter(g => M.text(st.q, g.first_name, g.last_name, g.city, g.email, g.diet, g.note, g.kin_ancestor, g.kin_ref, branchOf(d, g.branch_id)?.name)
                && (!f.branch?.length || f.branch.includes(String(g.branch_id))) && (!f.answer?.length || f.answer.includes(g.answer || 'none'))
                && (!f.inv || (f.inv === 'on' ? g.invited : !g.invited)) && (!f.miss?.includes('addr') || !(g.address || g.city)) && (!f.miss?.includes('mail') || !g.email) && (!f.doubt || g.doubt)), st.sort);
            const inv = list.filter(g => g.invited).length;
            bar.setCount(i18n('{n} · {inv} en tout', {n: plural(shown.length, 'personne'), inv: plural(inv, 'invitée', 'invitées')}));
            const out = box.querySelector('[data-cous-glist]');
            if (!shown.length) { out.innerHTML = '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Aucun invité ne correspond.</span></p>'; return; }
            if (st.view === 'cards') {
                out.innerHTML = UI().cardsHtml(shown.map(g => ({thumb: avatar(g, 48), name: C().fullName(g), open: `data-cous-gedit="${g.id}"`, attrs: `data-cous-grow="${g.id}" data-ctx-menu`, lines: [kinLines(d, g)[0] || '', [g.city, g.email].filter(Boolean).join(' · ')],
                    badges: [{text: answerOf(g.answer)[1], kind: answerOf(g.answer)[2]}, g.invited ? null : {text: 'Pas invité', kind: 'grey'}, g.doubt ? {text: 'Vivant ?', kind: 'yellow'} : null].filter(Boolean), menu: guestMenuHtml(g)})));
                return;
            }
            out.innerHTML = `<div class="cous-tablewrap"><table class="data-table cous-table" data-cols-off><thead><tr><th scope="col" title="Invité (coché)">✓</th><th scope="col">Personne</th><th scope="col">Coordonnées</th><th scope="col">Réponse</th><th scope="col">Nb</th><th scope="col">Régime</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
                ${shown.map(g => { const k = kinLines(d, g), dis = ro ? ' disabled' : '';
                    return `<tr data-cous-grow="${g.id}" data-ctx-menu class="${g.invited ? '' : 'is-off'}"><td><input type="checkbox" data-cous-inv="${g.id}" aria-label="Inviter ${esc(C().fullName(g))}"${g.invited ? ' checked' : ''}${dis}></td>
                    <td><div class="cous-who">${avatar(g, 34)}<div><button type="button" class="table-link cous-name" data-cous-gedit="${g.id}">${dot(d, g.branch_id)}${esc(C().fullName(g))}</button>${g.doubt ? ' ' + UI().badge('Vivant ?', 'yellow', {title: 'Rien de noté sur son décès, née il y a moins de 100 ans : vérifie avant d’inviter'}) : ''}
                        ${k.length ? `<small class="muted">${k.map(esc).join('<br>')}</small>` : g.person_id ? '' : '<small class="muted">Sans fiche</small>'}</div></div></td>
                    <td class="cous-contact"><small>${[esc(g.address), esc([g.postal_code, g.city].filter(Boolean).join(' '))].filter(Boolean).join('<br>') || '<span class="muted">Pas d’adresse</span>'}${g.email ? `<br>✉️ ${esc(g.email)}` : ''}${g.phone ? `<br>☎ ${esc(g.phone)}` : ''}</small></td>
                    <td><select data-cous-ans="${g.id}" aria-label="Réponse"${dis}>${ANSWERS.map(([v, l]) => `<option value="${v}"${(g.answer || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
                    <td><input type="number" class="cous-num" min="0" max="99" step="1" data-cous-nb="${g.id}" value="${g.people_count ?? ''}" placeholder="1" aria-label="Nombre de personnes"${dis}></td>
                    <td><input type="text" class="cous-diet" maxlength="200" data-cous-diet="${g.id}" value="${esc(g.diet)}" placeholder="—" aria-label="Régime"${dis}></td>
                    <td>${ro ? '' : `<button type="button" class="icon-button small" data-cous-gmenu="${g.id}" title="Plus d’actions" aria-label="Plus d’actions">⋯</button>`}</td></tr>`; }).join('')}</tbody></table></div>`;
        }
        draw();
        body.addEventListener('change', async e => {
            const t = e.target, gid = Number(t.dataset.cousInv || t.dataset.cousAns || t.dataset.cousNb || t.dataset.cousDiet || 0); if (!gid) return;
            const g = list.find(x => x.id === gid); if (!g) return;
            if (t.dataset.cousInv) return setField([gid], 'invited', t.checked ? 1 : 0, i18n(t.checked ? (g.gender === 'female' ? '{name} est invitée.' : '{name} est invité.') : (g.gender === 'female' ? '{name} n’est plus invitée.' : '{name} n’est plus invité.'), {name: C().fullName(g)}));
            if (t.dataset.cousAns) return setField([gid], 'answer', t.value, i18n('Réponse de {name} : {answer}.', {name: C().fullName(g), answer: i18n(answerOf(t.value)[1])}));
            const patch = t.dataset.cousNb ? {people_count: t.value === '' ? '' : Number(t.value)} : {diet: t.value};
            try { await post({op: 'guest_save', cousinade_id: d.id, id: gid, ...patch}); Object.assign(g, t.dataset.cousNb ? {people_count: t.value === '' ? null : Number(t.value)} : {diet: t.value}); toast('✓ Enregistré', 'success'); }
            catch (er) { if (t.dataset.cousNb && UI().fail) UI().fail(t, er.message); else toast(er.message, 'error'); }
        });
        body.addEventListener('click', e => {
            const m = e.target.closest('[data-cous-gmenu]'); if (m) { const g = list.find(x => x.id === Number(m.dataset.cousGmenu)); if (g) UI().menuAt(m, guestMenu(g)); return; }
            if (e.target.closest('[data-cous-gmore]')) { UI().menuAt(e.target.closest('[data-cous-gmore]'), [
                {icon: '✓', label: i18n('Inviter les {n} affichées', {n: plural(shown.length, 'personne')}), run: () => setField(shown.map(g => g.id), 'invited', 1, i18n(shown.length > 1 ? '{n} invitées.' : '{n} invitée.', {n: plural(shown.length, 'personne')}))},
                {icon: '○', label: 'Ne plus inviter les personnes affichées', run: () => setField(shown.map(g => g.id), 'invited', 0, i18n(shown.length > 1 ? '{n} retirées des invitations.' : '{n} retirée des invitations.', {n: plural(shown.length, 'personne')}))},
                '-', {icon: '↻', label: 'Chercher les nouveaux descendants', run: rescan}]); return; }
            if (e.target.closest('[data-cous-export]')) { UI().menuAt(e.target.closest('[data-cous-export]'), [{icon: '⤓', label: 'Tableau des invités (CSV)…', run: () => exportCsv(d)}, {icon: '🖨', label: 'Imprimer la liste des invités…', run: () => printGuests(d)}]); }
        });
    }
    const guestMenu = g => [{icon: '✎', label: 'Modifier', run: () => editGuest(g)}, ...(g.person_id ? [{icon: '↗', label: 'Ouvrir la fiche', run: () => { A().state.currentPersonId = g.person_id; A().setModule('personnes'); }}] : []),
        ...(g.email ? [{icon: '✉️', label: 'Écrire un courriel', run: () => { location.href = C().mailto([g.email], cur.data.title, ''); }}] : []), '-', {icon: '🗑', label: 'Retirer de la liste', danger: true, run: () => removeGuests([g.id], i18n(g.gender === 'female' ? '{name} retirée de la liste.' : '{name} retiré de la liste.', {name: C().fullName(g)}))}];
    const guestMenuHtml = g => kiosk() ? [] : [`<button type="button" data-cous-gedit="${g.id}">✎ Modifier</button>`, g.person_id ? `<button type="button" data-h-person="${g.person_id}">↗ Ouvrir la fiche</button>` : '', `<button type="button" class="danger" data-cous-gdel="${g.id}">🗑 Retirer de la liste</button>`].filter(Boolean);
    async function setField(ids, field, value, msg) {
        const d = cur.data; if (!ids.length) return;
        let r; try { r = await post({op: 'guests_set', cousinade_id: d.id, ids, field, value}); } catch (e) { toast(e.message, 'error'); reload(); return; }
        const prev = (r.result || r).prev || {};
        for (const g of d.guests) if (ids.includes(g.id)) g[field] = field === 'invited' || field === 'present' ? !!value : value;
        if (field !== 'answer' && field !== 'invited' && field !== 'present') reload(); else redrawSoft();
        A().undoToast(msg, {undo: async () => { await post({op: 'guests_set', cousinade_id: d.id, field, values: prev}); reload(); }, redo: async () => { await post({op: 'guests_set', cousinade_id: d.id, ids, field, value}); reload(); }});
    }
    /** après un petit changement : la page reste où elle est (pas de nouvelle lecture) */
    const redrawSoft = () => { const w = ws(); const y = w?.scrollTop || 0; if (cur.tab !== 'guests') { renderProject(w); if (w) w.scrollTop = y; return; } w?.querySelectorAll('[data-cous-grow]').forEach(tr => { const g = cur.data.guests.find(x => x.id === Number(tr.dataset.cousGrow)); if (g && tr.tagName === 'TR') tr.classList.toggle('is-off', !g.invited); }); };
    async function removeGuests(ids, msg) {
        const d = cur.data; try { await post({op: 'guests_delete', cousinade_id: d.id, ids}); } catch (e) { toast(e.message, 'error'); return; }
        await reload();
        A().undoToast(msg, {undo: async () => { await post({op: 'guests_restore', cousinade_id: d.id, ids}); reload(); }, redo: async () => { await post({op: 'guests_delete', cousinade_id: d.id, ids}); reload(); }});
    }
    async function rescan() {
        const d = cur.data; let r; try { r = await post({op: 'rescan', id: d.id}); } catch (e) { toast(e.message, 'error'); return; }
        const res = r.result || r, n = res.added?.length || 0;
        await reload();
        if (!n) return toast('Aucun nouveau descendant vivant : la liste est à jour.');
        A().undoToast(i18n(n > 1 ? '{n} ajoutés.' : '{n} ajouté.', {n: plural(n, 'nouvel invité', 'nouveaux invités')}), {undo: async () => { await post({op: 'guests_purge', cousinade_id: d.id, ids: res.added}); reload(); }});
    }
    /** ✎ un invité : coordonnées propres au projet (la fiche ne change pas, sauf la case) */
    function editGuest(g = null) {
        if (kiosk()) return;
        const d = cur.data, row = g || {}, isNew = !g, free = isNew || !row.person_id;
        const fs = C().foyers(d.guests, {all: true});
        const foyerOpts = `<option value="">${isNew ? 'Son propre foyer' : 'Garder son foyer'}</option>${fs.filter(f => !row.id || !f.members.some(m => m.id === row.id) || f.members.length > 1).map(f => `<option value="${esc(f.key)}"${f.key === row.foyer ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}`;
        ext.openDialog({eyebrow: '🎉 COUSINADE · INVITÉ', title: isNew ? 'Nouvel invité' : i18n('Modifier : {nm}', {nm: C().fullName(row)}), submitLabel: isNew ? 'Ajouter' : 'Enregistrer',
            body: `<div class="cous-form">
                ${isNew ? `<div><span class="pk-lab">Une fiche de ta généalogie (facultatif)</span>${P().pickerField({name: 'person_id', kind: 'person', animals: false})}<p class="ui-hint">Sinon, écris le prénom et le nom ci-dessous.</p></div>` : ''}
                ${free ? `<div class="cous-2"><label>Prénom<input name="first_name" maxlength="80" value="${esc(row.first_name || '')}"></label><label>Nom<input name="last_name" maxlength="80" value="${esc(row.last_name || '')}"></label></div>
                    <label>Branche<select name="branch_id"><option value="">Sans branche</option>${branchesOf(d).map(b => `<option value="${b.id}"${b.id === row.branch_id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>` : `<p class="cous-kin">${kinLines(d, row).map(esc).join(' · ')}</p>`}
                <label>Foyer (une invitation par foyer)<select name="foyer">${foyerOpts}</select></label>
                <label>Adresse<input name="address" maxlength="300" value="${esc(row.address || '')}" placeholder="12 rue des Écoles"></label>
                <div class="cous-3"><label>Code postal<input name="postal_code" maxlength="20" value="${esc(row.postal_code || '')}"></label><label>Ville<input name="city" maxlength="120" value="${esc(row.city || '')}"></label><label>Pays<input name="country" maxlength="80" value="${esc(row.country || '')}" placeholder="France"></label></div>
                <div class="cous-2"><label>Courriel<input name="email" type="email" maxlength="200" value="${esc(row.email || '')}"></label><label>Téléphone<input name="phone" type="tel" maxlength="60" value="${esc(row.phone || '')}"></label></div>
                <div class="cous-3"><label>Réponse<select name="answer">${ANSWERS.map(([v, l]) => `<option value="${v}"${(row.answer || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Nombre de personnes<input name="people_count" type="number" min="0" max="99" step="1" value="${row.people_count ?? ''}" placeholder="1"></label><label>Table<input name="table_no" type="number" min="1" max="500" step="1" value="${row.table_no ?? ''}"></label></div>
                <label>Régime, allergies<input name="diet" maxlength="200" value="${esc(row.diet || '')}" placeholder="végétarien, sans gluten…"></label>
                <label>Note<textarea name="note" rows="2" maxlength="2000">${esc(row.note || '')}</textarea></label>
                ${UI().checkHtml('Invité', {checked: isNew || !!row.invited, attrs: 'name="invited"'})}
                ${row.person_id || isNew ? UI().checkHtml('Mettre aussi l’adresse, le courriel et le téléphone dans le répertoire des vivants (sa fiche)', {checked: false, attrs: 'name="to_contacts"', sub: 'Décoché : seulement dans cette cousinade.'}) : ''}</div>`,
            onDelete: isNew ? null : async () => { await removeGuests([row.id], i18n(row.gender === 'female' ? '{name} retirée de la liste.' : '{name} retiré de la liste.', {name: C().fullName(row)})); },
            onSubmit: async form => {
                const v = n => form.querySelector(`[name=${n}]`)?.value ?? '';
                const pid = isNew ? Number(v('person_id')) || 0 : 0;
                if (free && !pid && !String(v('first_name')).trim() && !String(v('last_name')).trim()) return UI().fail(form.elements.first_name, 'Écris au moins un prénom ou un nom (ou choisis une fiche).');
                const email = String(v('email')).trim();
                if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return UI().fail(form.elements.email, 'Ce courriel n’a pas la bonne forme (exemple : prenom.nom@exemple.fr).');
                const body = {op: 'guest_save', cousinade_id: d.id, id: row.id || 0, person_id: pid, address: v('address'), postal_code: v('postal_code'), city: v('city'), country: v('country'), email, phone: v('phone'),
                    answer: v('answer'), people_count: v('people_count'), table_no: v('table_no'), diet: v('diet'), note: v('note'), invited: form.querySelector('[name=invited]')?.checked ? 1 : 0, to_contacts: form.querySelector('[name=to_contacts]')?.checked ? 1 : 0};
                if (free) Object.assign(body, {first_name: v('first_name'), last_name: v('last_name'), branch_id: v('branch_id')});
                if (v('foyer')) body.foyer = v('foyer');
                let r; try { r = await post(body); } catch (e) { toast(e.message, 'error'); return false; }
                const res = r.result || r;
                await reload();
                if (isNew) A().undoToast('Invité ajouté.', {undo: async () => { await post({op: 'guests_delete', cousinade_id: d.id, ids: [res.id]}); reload(); }});
                else toast(res.contacts ? 'Enregistré, et aussi dans le répertoire des vivants.' : '✓ Enregistré', 'success');
            }});
    }

    /* ⤒ importer une liste (tableur) : K13, le moteur des tableaux lit le fichier */
    function importList() {
        const d = cur.data, S = window.LCNDA_SHEET;
        if (!S || !UI().openImportDialog) return toast('Le lecteur de tableaux n’est pas chargé.', 'error');
        UI().openImportDialog({title: 'Importer une liste d’invités', accept: '.csv,.tsv,.txt,.xlsx,.ods,text/csv', noun: 'invité', many: 'invités',
            hint: 'Un tableau avec une ligne de titres : Prénom, Nom, Courriel, Téléphone, Adresse, Code postal, Ville, Réponse (oui / non / peut-être), Nombre, Régime, Note.',
            analyze: async files => {
                const f = files[0], r = await S.readFile(f.name, await f.arrayBuffer());
                const rows = S.matrix(r.wb, null, 0);
                const res = C().rowsToGuests(rows.map(row => row.map(c => (c && typeof c === 'object' ? c.v ?? c.value ?? '' : c ?? ''))));
                if (!res.guests.length) throw new Error('Je ne trouve ni prénom ni nom : la première ligne doit donner les titres des colonnes (Prénom, Nom, Courriel…).');
                const have = new Set(d.guests.map(g => C().fold(`${g.first_name} ${g.last_name}`)));
                const upd = res.guests.filter(g => have.has(C().fold(`${g.first_name || ''} ${g.last_name || ''}`))).length;
                return {count: res.guests.length, summaryHtml: `<b>${esc(plural(res.guests.length - upd, 'nouvel invité', 'nouveaux invités'))}</b>${upd ? ', ' + esc(i18n('{n} (coordonnées et réponse complétées)', {n: plural(upd, 'invité déjà là', 'invités déjà là')})) : ''}`,
                    notices: res.unknown ? [{kind: 'info', text: i18n(res.unknown > 1 ? '{n} non reconnues : laissées de côté.' : '{n} non reconnue : laissée de côté.', {n: plural(res.unknown, 'colonne')})}] : [],
                    preview: `<table class="data-table"><thead><tr><th>Prénom</th><th>Nom</th><th>Ville</th><th>Réponse</th></tr></thead><tbody>${res.guests.slice(0, 8).map(g => `<tr><td>${esc(g.first_name || '')}</td><td>${esc(g.last_name || '')}</td><td>${esc(g.city || '')}</td><td>${esc(answerOf(g.answer)[1])}</td></tr>`).join('')}</tbody></table>`, data: res.guests};
            },
            run: async an => {
                const r = await post({op: 'import', cousinade_id: d.id, rows: an.data}), res = r.result || r;
                await reload();
                return {message: `${plural(res.added.length, 'invité ajouté', 'invités ajoutés')}${res.updated.length ? `, ${plural(res.updated.length, 'invité complété', 'invités complétés')}` : ''}.`,
                    undo: async () => { await post({op: 'import_undo', cousinade_id: d.id, added: res.added, updated: res.updated}); reload(); }};
            }});
    }

    /** ⤓ le tableau des invités : les coordonnées des vivants seulement si on coche la case */
    function exportCsv(d) {
        const S = window.LCNDA_SHEET;
        ext.openDialog({eyebrow: '🎉 COUSINADE', title: '⤓ Exporter le tableau des invités', submitLabel: '⤓ Exporter en CSV',
            body: `<p>Un fichier CSV (tableur) avec les invités, leur branche, leur lien de parenté et leur réponse.</p>
                ${UI().checkHtml('Avec les adresses, courriels et téléphones', {checked: false, attrs: 'name="contacts"', sub: '🔒 Ce sont des données de personnes vivantes : ne partage ce fichier qu’avec ceux qui organisent.'})}
                ${UI().checkHtml('Seulement les invités cochés', {checked: true, attrs: 'name="only"'})}`,
            onSubmit: form => {
                const withC = form.querySelector('[name=contacts]').checked, only = form.querySelector('[name=only]').checked;
                const head = ['Prénom', 'Nom', 'Branche', 'Lien avec l’ancêtre', 'Lien avec la référence', 'Foyer', ...(withC ? ['Adresse', 'Code postal', 'Ville', 'Pays', 'Courriel', 'Téléphone'] : []), 'Invité', 'Réponse', 'Nombre', 'Régime', 'Note', 'Table'];
                const fs = C().foyers(d.guests, {all: true}), foyerName = id => fs.find(f => f.members.some(m => m.id === id))?.name || '';
                const rows = bySort(d, d.guests.filter(g => !only || g.invited), 'branch').map(g => [g.first_name, g.last_name, branchOf(d, g.branch_id)?.name || '', g.kin_ancestor, g.kin_ref === 'self' ? 'personne de référence' : g.kin_ref, foyerName(g.id),
                    ...(withC ? [g.address, g.postal_code, g.city, g.country, g.email, g.phone] : []), g.invited ? 'oui' : 'non', answerOf(g.answer)[1], g.people_count ?? '', g.diet, g.note, g.table_no ?? '']);
                const csv = S?.toCSV ? S.toCSV([head, ...rows], {sep: ';'}) : [head, ...rows].map(r => r.map(c => (A().csvCell ? A().csvCell(c) : `"${String(c ?? '').replace(/"/g, '""')}"`)).join(';')).join('\r\n');
                const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}), a = document.createElement('a');
                a.href = URL.createObjectURL(blob); a.download = `${(A().safeExportFilename ? A().safeExportFilename(d.title, 'cousinade') : 'cousinade')}-invites.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                toast(withC ? 'Tableau exporté, avec les coordonnées.' : 'Tableau exporté, sans les coordonnées.', 'success');
            }});
    }
    const printCss = `body{font-family:Georgia,'Times New Roman',serif;color:#111}table{border-collapse:collapse;width:100%;font-size:10.5pt}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f8}.box{display:inline-block;width:14px;height:14px;border:1.5px solid #333;vertical-align:middle}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}h1{font-size:17pt;margin:0 0 4px}p.sub{margin:0 0 10px;color:#555;font-size:10pt}`;
    function printGuests(d) {
        UI().openPrintDialog({title: i18n('Invités — {name}', {name: d.title}), key: 'cousinade-invites', zone: 'Liste des invités', photos: false, margin: 12,
            options: [{key: 'who', type: 'radio', value: 'inv', choices: [['inv', 'Les invités cochés'], ['yes', 'Ceux qui viennent'], ['all', 'Tout le monde']]}, {key: 'contacts', label: 'Avec les coordonnées', checked: false}],
            html: c => { const list = bySort(d, d.guests.filter(g => c.who === 'all' || (c.who === 'yes' ? g.invited && g.answer === 'yes' : g.invited)), 'branch');
                return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${printCss}</style></head><body><h1>🎉 ${esc(d.title)}</h1><p class="sub">${esc([d.ancestor_name && 'Descendants de ' + d.ancestor_name, d.date_text, d.place_text].filter(Boolean).join(' · '))} · ${esc(plural(list.length, 'personne'))}</p>
                    <table><thead><tr><th>Personne</th><th>Branche</th><th>Lien</th>${c.contacts ? '<th>Coordonnées</th>' : ''}<th>Réponse</th><th>Nb</th><th>Régime</th></tr></thead><tbody>${list.map(g => { const b = branchOf(d, g.branch_id); return `<tr><td>${esc(C().fullName(g))}</td><td>${b ? `<span class="dot" style="background:${esc(b.color)}"></span>${esc(b.first || b.name)}` : ''}</td><td>${esc(kinLines(d, g).join(' ; '))}</td>${c.contacts ? `<td>${esc([g.address, [g.postal_code, g.city].filter(Boolean).join(' '), g.email, g.phone].filter(Boolean).join(', '))}</td>` : ''}<td>${esc(answerOf(g.answer)[1])}</td><td>${g.people_count ?? ''}</td><td>${esc(g.diet)}</td></tr>`; }).join('')}</tbody></table></body></html>`; }});
    }

    /* ── ✉️ Invitations ── */
    const invOpt = d => ({text: DEFAULT_TEXT, answerBy: '', contact: '', subject: i18n('Invitation : {nm}', {nm: d.title}), ...(d.options?.invitation || {})});
    const letterOf = (d, f) => C().fill(invOpt(d).text, C().foyerValues(f, d, branchesOf(d)));
    function tabInvit(body, d) {
        const o = invOpt(d), fs = C().foyers(d.guests), ro = kiosk();
        const withMail = fs.filter(f => f.emails.length), withAddr = fs.filter(f => f.address.length);
        body.innerHTML = `<div class="cous-invit">
            <div class="cous-invit-form"><h3 class="section-label">Le texte de l’invitation</h3>
                <p class="ui-hint">Une invitation par foyer. Ces mots se remplacent tout seuls : ${C().FIELDS.map(k => `<button type="button" class="ui-chip cous-field" data-cous-field="${k}">{${k}}</button>`).join(' ')}</p>
                <textarea name="cous_text" rows="11" maxlength="6000" data-cous-opt="text"${ro ? ' readonly' : ''}>${esc(o.text)}</textarea>
                <div class="cous-2"><label>Répondre avant le<input data-cous-opt="answerBy" data-ui-date maxlength="80" value="${esc(o.answerBy)}" placeholder="1er mai 2027"${ro ? ' readonly' : ''}></label>
                <label>Contact pour répondre<input data-cous-opt="contact" maxlength="200" value="${esc(o.contact)}" placeholder="Marie, 06 12 34 56 78, marie@exemple.fr"${ro ? ' readonly' : ''}></label></div>
                <label>Objet du courriel<input data-cous-opt="subject" maxlength="200" value="${esc(o.subject)}"${ro ? ' readonly' : ''}></label>
                <div class="cous-invit-acts"><button type="button" class="button" data-cous-print-inv>🖨 Imprimer les invitations…</button><button type="button" class="button secondary" data-cous-wp>📝 Dans le traitement de texte</button>
                    <button type="button" class="button secondary" data-cous-card>📰 Faire-part (dessin)</button><button type="button" class="button secondary" data-cous-media>📁 Copie dans les médias</button></div></div>
            <div class="cous-invit-side"><h3 class="section-label">Aperçu</h3><div class="cous-letter" data-cous-letter>${fs.length ? esc(letterOf(d, fs[0])).replace(/\n/g, '<br>') : ''}</div></div></div>
            <h3 class="section-label">${esc(i18n('{n} à inviter', {n: plural(fs.length, 'foyer')}))} · ${esc(plural(withAddr.length, 'avec adresse', 'avec adresse'))} · ${esc(plural(withMail.length, 'avec courriel', 'avec courriel'))}</h3>
            ${withMail.length ? `<p><a class="button secondary" href="${esc(C().mailto(withMail.flatMap(f => f.emails), o.subject, C().fill(o.text, {...C().foyerValues({name: 'famille', members: []}, d), foyer: 'famille', prenoms: ''}), {bcc: true}))}" data-cous-mailall>✉️ Un courriel à tous (en copie cachée)</a> <small class="muted">Ta messagerie s’ouvre avec le texte prêt : rien n’est envoyé par l’app.</small></p>` : ''}
            ${fs.length ? UI().rowsHtml(fs.map(f => ({thumb: `<span class="cous-foyer-ico">${dot(d, f.branch_id)}🏠</span>`, name: f.name,
                lines: [f.address.length ? f.address.join(', ') : '', f.emails.join(', ')].filter(Boolean).length ? [f.address.join(', '), f.emails.join(', ')].filter(Boolean) : ['Ni adresse ni courriel'],
                actions: `${f.address.length ? '' : UI().badge('Sans adresse', 'yellow')}${f.emails.length ? `<a class="button small secondary" href="${esc(C().mailto(f.emails, o.subject, letterOf(d, f)))}">✉️ Courriel prêt</a>` : ''}<button type="button" class="button small secondary" data-cous-print-one="${esc(f.key)}">🖨</button>`}))) : A().empty('Aucun invité coché : coche des invités dans l’onglet « 👥 Invités ».', {icon: '✉️'})}`;
        let tm = 0;
        body.addEventListener('input', e => {
            const k = e.target.dataset.cousOpt; if (!k || ro) return;
            const inv = {...invOpt(d), [k]: e.target.value.slice(0, k === 'text' ? 6000 : 200)}; d.options = {...d.options, invitation: inv};
            const box = body.querySelector('[data-cous-letter]'); if (box && fs.length) box.innerHTML = esc(letterOf(d, fs[0])).replace(/\n/g, '<br>');
            clearTimeout(tm); tm = setTimeout(() => saveOptions({invitation: inv}), 700);
        });
        body.addEventListener('click', async e => {
            const fb = e.target.closest('[data-cous-field]'); if (fb && !ro) { const ta = body.querySelector('[data-cous-opt=text]'), s = ta.selectionStart ?? ta.value.length; ta.setRangeText(`{${fb.dataset.cousField}}`, s, ta.selectionEnd ?? s, 'end'); ta.focus(); ta.dispatchEvent(new Event('input', {bubbles: true})); return; }
            if (e.target.closest('[data-cous-print-inv]')) return printInvitations(d, fs);
            const one = e.target.closest('[data-cous-print-one]'); if (one) return printInvitations(d, fs.filter(f => f.key === one.dataset.cousPrintOne));
            if (e.target.closest('[data-cous-wp]')) return toTextDoc(d, fs);
            if (e.target.closest('[data-cous-card]')) return toCard(d, fs);
            if (e.target.closest('[data-cous-media]')) return copyToMedia(d, fs);
        });
    }
    const letterHtml = (d, f, {env = true} = {}) => `<div class="inv">${env && f.address.length ? `<div class="to"><b>${esc(f.name)}</b><br>${f.address.map(esc).join('<br>')}</div>` : ''}<h1>🎉 ${esc(d.title)}</h1><div class="txt">${esc(letterOf(d, f)).replace(/\n/g, '<br>')}</div></div>`;
    function printInvitations(d, fs) {
        if (!fs.length) return toast('Aucun foyer à inviter : coche des invités d’abord.');
        UI().openPrintDialog({title: i18n('Invitations — {nm}', {nm: d.title}), key: 'cousinade-invitations', zone: 'Invitations', photos: false, margin: 0,
            options: [{key: 'addr', label: 'L’adresse du foyer en haut à droite (enveloppe à fenêtre)', checked: true}],
            html: c => UI().printSheets({title: i18n('Invitations — {nm}', {nm: d.title}), choix: c, pad: 18, css: `.inv{font-family:Georgia,serif;color:#111;font-size:12pt;line-height:1.5;height:100%;position:relative}.to{margin:22mm 0 18mm 95mm;font-size:11pt;line-height:1.35}h1{font-size:20pt;text-align:center;margin:0 0 8mm;color:#2a3b6b}.txt{white-space:normal}`,
                pages: fs.map(f => ({html: letterHtml(d, f, {env: c.addr})}))})});
    }
    async function toTextDoc(d, fs) {
        if (!ext.openTextDoc || !ext.textDocTools?.dataOf) return toast('Le traitement de texte n’est pas chargé.', 'error');
        if (!fs.length) return toast('Aucun foyer à inviter : coche des invités d’abord.');
        const html = fs.map((f, i) => `${i ? '<hr class="wp-pb" data-break="page">' : ''}${f.address.length ? `<p style="text-align:right"><strong>${esc(f.name)}</strong><br>${f.address.map(esc).join('<br>')}</p>` : ''}<h1 style="text-align:center">${esc(d.title)}</h1>${letterOf(d, f).split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}`).join('');
        ext.openTextDoc({data: ext.textDocTools.dataOf(html), name: i18n('Invitations — {nm}', {nm: d.title})});
    }
    async function toCard(d, fs) {
        const CI = ext.cardInternals;
        if (!CI?.build || !ext.openVectorEditor) return toast('Les faire-part ne sont pas chargés.', 'error');
        const o = invOpt(d), K = CI.KINDS.cousinade;
        const vals = {intro: d.title || 'Grande cousinade', name: `famille ${d.ancestor?.last ? d.ancestor.last.toLocaleUpperCase('fr-FR') : ''}`.trim(), date: [d.date_text, d.place_text && `à ${d.place_text}`].filter(Boolean).join(' '), detail: d.ancestor_name ? i18n('Tous les descendants de {name}', {name: d.ancestor_name}) : '',
            family: [o.answerBy && i18n('Réponse avant le {date}', {date: o.answerBy}), o.contact].filter(Boolean).join(' · ')};
        const fields = K.fields.map(([key, label, value]) => ({key, role: key, label, value: vals[key] ?? value, hidden: false}));
        try { const doc = await CI.build({kind: 'cousinade', style: K.style, format: 'c10', orient: 'port', fold: 'single', fields});
            ext.openVectorEditor({doc, name: i18n('Cousinade — {nm}', {nm: d.title})}); } catch (e) { toast(e.message, 'error'); }
    }
    /** 📁 l'invitation (texte générique) en image, rangée dans les médias */
    async function copyToMedia(d, fs) {
        const pk = window.LCNDA_PICKER || A(); if (!pk?.importMediaFile) return toast('Envoi vers les médias indisponible.', 'error');
        const W = 1240, H = 1754, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
        g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#2a3b6b'; g.lineWidth = 6; g.strokeRect(40, 40, W - 80, H - 80);
        g.fillStyle = '#2a3b6b'; g.textAlign = 'center'; g.font = 'bold 64px Georgia, serif'; g.fillText(d.title.slice(0, 40), W / 2, 200);
        g.fillStyle = '#222'; g.textAlign = 'left'; g.font = '36px Georgia, serif';
        const text = C().fill(invOpt(d).text, {...C().foyerValues({name: 'famille', members: [], branch_id: null}, d), foyer: 'famille', prenoms: ''});
        let y = 320; for (const para of text.split('\n')) { let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (g.measureText(t).width > W - 240 && line) { g.fillText(line, 120, y); y += 52; line = word; } else line = t; } g.fillText(line, 120, y); y += 52; if (y > H - 120) break; }
        const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
        try { await pk.importMediaFile(new File([blob], `${(A().safeExportFilename ? A().safeExportFilename(d.title, 'cousinade') : 'cousinade')}-invitation.png`, {type: 'image/png'}), ['image']); toast('Une copie de l’invitation est rangée dans les médias.', 'success'); }
        catch (e) { toast(i18n('Copie non rangée dans les médias : {err}', {err: e.message}), 'error'); }
    }

    /* ── 🏷 Badges ── */
    const badgeOpt = d => ({rel: d.ref ? 'both' : 'ancestor', photo: true, qr: false, per: '8', who: 'inv', ...(d.options?.badges || {})});
    const badgeList = (d, who) => bySort(d, d.guests.filter(g => who === 'all' ? true : who === 'yes' ? g.invited && (g.answer === 'yes' || g.answer === 'maybe') : who === 'present' ? g.present : g.invited), 'branch');
    function badgeHtml(d, g, o) {
        const b = C().badge(g, {...d, branches: branchesOf(d)}, {rel: o.rel, photo: o.photo});
        const qr = o.qr && ext.qr ? (() => { try { return ext.qr.svg(`${b.first} ${b.last}${b.branch ? ' — ' + b.branch : ''}${b.lines[0] ? ' — ' + b.lines[0] : ''} — ${d.title}`, {quiet: 1}).svg; } catch (_) { return ''; } })() : '';
        return `<div class="cous-badge" style="--cous-c:${esc(b.color)}"><div class="cous-badge-band">${esc(b.branch || d.title)}</div><div class="cous-badge-main">${b.photo ? `<img class="cous-badge-photo" src="media/${encodeURIComponent(b.photo)}" alt="">` : ''}<div class="cous-badge-txt"><div class="cous-badge-first">${esc(b.first)}</div><div class="cous-badge-last">${esc(b.last)}</div>${b.lines.map(l => `<div class="cous-badge-line">${esc(l)}</div>`).join('')}</div>${qr ? `<div class="cous-badge-qr">${qr}</div>` : ''}</div><div class="cous-badge-foot">${esc(d.title)}${d.date_text ? ' · ' + esc(d.date_text) : ''}</div></div>`;
    }
    const BADGE_CSS = `.cous-sheet{display:grid;gap:4mm;height:100%;align-content:start}.cous-badge{border:1.5px solid var(--cous-c);border-radius:3mm;overflow:hidden;display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;break-inside:avoid}
        .cous-badge-band{background:var(--cous-c);color:#fff;font-weight:700;font-size:10pt;padding:1.5mm 3mm;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cous-badge-main{flex:1;display:flex;align-items:center;gap:3mm;padding:2mm 3mm}
        .cous-badge-photo{width:17mm;height:17mm;border-radius:50%;object-fit:cover;border:1.5px solid var(--cous-c);flex:none}.cous-badge-txt{flex:1;min-width:0}.cous-badge-first{font-size:24pt;font-weight:800;line-height:1.05}.cous-badge-last{font-size:12pt;font-weight:700;letter-spacing:.05em}
        .cous-badge-line{font-size:9.5pt;color:#333;margin-top:1mm;line-height:1.2}.cous-badge-qr{width:16mm;flex:none}.cous-badge-qr svg{width:100%;height:auto;display:block}.cous-badge-foot{font-size:7.5pt;color:#555;padding:1mm 3mm 1.5mm;border-top:1px solid #ddd}`;
    function tabBadges(body, d) {
        const o = badgeOpt(d), ro = kiosk();
        const radio = (k, choices) => `<div class="segmented cous-seg" role="radiogroup">${choices.map(([v, l]) => `<button type="button" role="radio" data-cous-bopt="${k}" data-v="${v}" class="${String(o[k]) === v ? 'is-active' : ''}" aria-checked="${String(o[k]) === v}">${l}</button>`).join('')}</div>`;
        const list = badgeList(d, o.who);
        body.innerHTML = `<div class="cous-badges"><div class="cous-badges-opts">
                <div><span class="pk-lab">Le lien écrit sous le nom</span>${radio('rel', [['ancestor', 'Avec l’ancêtre'], ['ref', 'Avec la référence'], ['both', 'Les deux']])}</div>
                <div><span class="pk-lab">Pour qui</span>${radio('who', [['inv', 'Invités cochés'], ['yes', 'Qui viennent'], ['present', 'Présents'], ['all', 'Tout le monde']])}</div>
                <div><span class="pk-lab">Par page A4</span>${radio('per', [['6', '6'], ['8', '8'], ['10', '10']])}</div>
                ${UI().toggleHtml('Petite photo (si la fiche en a une)', {checked: o.photo, attrs: 'data-cous-bchk="photo"'})}
                ${UI().toggleHtml('QR code (nom, branche et lien, lu par un téléphone)', {checked: o.qr, attrs: 'data-cous-bchk="qr"'})}
                <p><button type="button" class="button" data-cous-bprint>🖨 Imprimer ${esc(plural(list.length, 'badge'))}…</button></p>
                <p class="ui-hint">Chaque branche a sa couleur (onglet « 📊 Chiffres » pour la changer).</p></div>
            <div class="cous-badges-prev"><style>${BADGE_CSS}</style><div class="cous-sheet cous-sheet-prev">${list.slice(0, 6).map(g => badgeHtml(d, g, o)).join('') || A().empty('Personne à qui faire un badge.', {icon: '🏷'})}</div></div></div>`;
        const set = async patch => { d.options = {...d.options, badges: {...o, ...patch}}; if (!ro) await saveOptions({badges: {...o, ...patch}}, {quiet: true}); tabBadges(body, d); };
        body.querySelectorAll('[data-cous-bopt]').forEach(b => b.addEventListener('click', () => set({[b.dataset.cousBopt]: b.dataset.v})));
        body.querySelectorAll('[data-cous-bchk]').forEach(b => b.addEventListener('change', () => set({[b.dataset.cousBchk]: b.checked})));
        body.querySelector('[data-cous-bprint]').addEventListener('click', () => printBadges(d, badgeOpt(d)));
    }
    function badgePages(d, o) {
        const list = badgeList(d, o.who), per = Number(o.per) || 8, cols = 2, rows = per / cols, pages = [];
        for (let i = 0; i < list.length; i += per) pages.push({html: `<div class="cous-sheet" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},calc((100% - ${(rows - 1) * 4}mm)/${rows}))">${list.slice(i, i + per).map(g => badgeHtml(d, g, o)).join('')}</div>`});
        return pages;
    }
    function printBadges(d, o) {
        if (!badgeList(d, o.who).length) return toast('Personne à qui faire un badge.');
        UI().openPrintDialog({title: i18n('Badges — {nm}', {nm: d.title}), key: 'cousinade-badges', zone: 'Badges', photos: false, margin: 0, paper: 'A4', orientation: 'portrait',
            html: c => UI().printSheets({title: i18n('Badges — {nm}', {nm: d.title}), choix: c, pad: 10, css: BADGE_CSS, pages: badgePages(d, o)})});
    }

    /* ── 🌳 Grand arbre de descendance (dessin vectoriel : export E3, PDF, fond perdu) ── */
    const treeOpt = d => ({format: 'a1', theme: 'classique', gens: 5, spouses: true, photos: true, onlyLine: false, title: d.title, ...(d.options?.tree || {})});
    function tabTree(body, d) {
        const TI = ext.decorTreeInternals, o = treeOpt(d), ro = kiosk();
        if (!TI) { body.innerHTML = UI().notice('error', 'L’arbre décoratif n’est pas chargé.'); return; }
        const fmts = TI.formats(true), ths = TI.themes(true);
        body.innerHTML = `<div class="cous-tree"><div class="cous-form">
            <p>${i18n('Toute la descendance de {name}, en grand, une couleur par branche, à afficher le jour de la cousinade. Le dessin s’ouvre ensuite pour tout retoucher, puis « ⤓ Exporter » (PDF pour l’imprimeur, avec fond perdu et traits de coupe, PNG, SVG…).', {name: esc(d.ancestor_name || i18n('l’ancêtre'))})}</p>
            <label>Titre<input data-cous-topt="title" maxlength="120" value="${esc(o.title)}"></label>
            <div class="cous-2"><label>Format<select data-cous-topt="format">${fmts.map(f => `<option value="${esc(f[0])}"${f[0] === o.format ? ' selected' : ''}>${esc(f[1])}</option>`).join('')}</select></label>
                <label>Style<select data-cous-topt="theme">${ths.map(([k, t]) => `<option value="${esc(k)}"${k === o.theme ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label></div>
            <label>Générations<select data-cous-topt="gens">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}"${n === Number(o.gens) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            ${UI().checkHtml('Les conjoints sous chaque nom', {checked: o.spouses, attrs: 'data-cous-tchk="spouses"'})}
            ${UI().checkHtml('Une place pour coller les photos du jour (à côté des vivants)', {checked: o.photos, attrs: 'data-cous-tchk="photos"'})}
            <p><button type="button" class="button" data-cous-tbuild>🌳 Fabriquer le grand arbre</button></p></div></div>`;
        const read = () => { const n = {...o}; body.querySelectorAll('[data-cous-topt]').forEach(el => { n[el.dataset.cousTopt] = el.dataset.cousTopt === 'gens' ? Number(el.value) : el.value; }); body.querySelectorAll('[data-cous-tchk]').forEach(el => { n[el.dataset.cousTchk] = el.checked; }); return n; };
        body.addEventListener('change', () => { const n = read(); d.options = {...d.options, tree: n}; if (!ro) saveOptions({tree: n}, {quiet: true}); });
        body.querySelector('[data-cous-tbuild]').addEventListener('click', async () => {
            const n = read(); toast('Fabrication du grand arbre…');
            try { const doc = await buildTree(d, n); if (!doc) return; ext.openVectorEditor({doc, name: n.title || i18n('Arbre — {nm}', {nm: d.title})}); } catch (e) { toast(e.message, 'error'); }
        });
    }
    let tseq = 0; const tuid = () => 'c' + Date.now().toString(36) + (++tseq).toString(36);
    const r2 = v => Math.round(v * 100) / 100;
    /** la descendance (sans fiche confidentielle) en cases, de haut en bas : une colonne par descendant sans enfant dessiné */
    async function buildTree(d, o) {
        const TI = ext.decorTreeInternals, r = await A().api('tree', {id: d.ancestor_id, mode: 'descendants', depth: Math.max(1, Math.min(8, Number(o.gens) || 5) - 1)});
        if (!r.tree) throw new Error('Aucune descendance pour cet ancêtre.');
        const T = (TI.themes().find(x => x[0] === o.theme) || TI.themes()[0])[1], fmt = TI.formats().find(f => f[0] === o.format) || TI.formats()[0];
        const priv = p => Number(p?.is_private) === 1;
        const living = new Set(d.guests.filter(g => g.person_id).map(g => g.person_id));
        const branchColorOf = id => branchesOf(d).find(b => b.id === id)?.color || T.ink;
        const nodes = [], walk = (n, depth, branch) => {
            if (!n || priv(n.person)) return null;
            const p = n.person, me = {p, depth, branch: depth === 1 ? p.id : branch, kids: [], spouses: (n.partners || []).filter(x => !priv(x))};
            nodes.push(me);
            for (const c of n.children || []) { const k = walk(c, depth + 1, me.branch); if (k) me.kids.push(k); }
            return me;
        };
        const root = walk(r.tree, 0, 0);
        if (!root) throw new Error('Cet ancêtre est confidentiel.');
        const leaves = n => (n.kids.length ? n.kids.reduce((s, k) => s + leaves(k), 0) : 1);
        const total = leaves(root), depthMax = Math.max(...nodes.map(n => n.depth));
        const land = total > (depthMax + 1) * 1.4;
        const W = land ? Math.max(fmt[2], fmt[3]) : Math.min(fmt[2], fmt[3]), H = land ? Math.min(fmt[2], fmt[3]) : Math.max(fmt[2], fmt[3]);
        const m = Math.min(W, H) * .05, band = Math.min(W, H) * .09, x0 = m, y0 = m + band, w = W - 2 * m, h = H - 2 * m - band;
        const colW = w / total, rowH = h / (depthMax + 1), bw = Math.min(colW * .9, rowH * 2.6), bh = Math.min(rowH * (o.photos ? .5 : .62), bw * .8);
        const unit = Math.min(W, H) / 1000, sw = r2(Math.max(.6, 1.2 * unit));
        let col = 0; const pos = new Map();
        const place = n => { if (!n.kids.length) { pos.set(n, x0 + colW * (col + .5)); col++; } else { n.kids.forEach(place); pos.set(n, (pos.get(n.kids[0]) + pos.get(n.kids[n.kids.length - 1])) / 2); } };
        place(root);
        const boxes = [], links = [], photos = [];
        const name = p => `${String(p.first_name || '').trim()} ${String(p.last_name || '').trim().toLocaleUpperCase('fr-FR')}`.trim() || 'Sans nom';
        const years = p => (p.birth_year || p.death_year ? `${p.birth_year || '?'}${p.death_year ? '–' + p.death_year : ''}` : '');
        const fontMax = Math.min(bh * .26, bw * .13), fontMin = Math.max(2.2 * unit, 3);
        for (const n of nodes) {
            const cx = pos.get(n), y = y0 + n.depth * rowH + (rowH - bh) / 2 - (o.photos ? rowH * .1 : 0), color = n.depth === 0 ? T.title : branchColorOf(n.branch);
            const lines = [name(n.p), years(n.p), ...(o.spouses && n.spouses.length ? [`⚭ ${n.spouses.map(name).join(', ')}`] : [])].filter(Boolean);
            const longest = Math.max(...lines.map(l => l.length)), size = r2(Math.max(fontMin, Math.min(fontMax, bw / Math.max(6, longest * .56))));
            const kids = [{id: tuid(), type: 'rect', name: 'Case', x: r2(cx - bw / 2), y: r2(y), w: r2(bw), h: r2(bh), r: r2(Math.min(bw, bh) * .14), fill: n.depth === 0 ? T.center : T.empty, stroke: color, sw: r2(sw * 2)},
                {id: tuid(), type: 'rect', name: 'Bande de la branche', x: r2(cx - bw / 2), y: r2(y), w: r2(bw), h: r2(Math.max(bh * .1, 2 * unit)), r: 0, fill: color, stroke: 'none', sw: 0},
                {id: tuid(), type: 'text', name: lines[0], text: lines.join('\n'), x: r2(cx), y: r2(y + bh / 2 - lines.length * 1.2 * size / 2 + size * .86 + bh * .04), size, font: T.font, align: 'middle', fill: T.ink, sw: 0}];
            boxes.push({id: tuid(), type: 'group', name: name(n.p), children: kids});
            if (o.photos && living.has(n.p.id)) { const ph = Math.min(rowH * .26, bw * .5); photos.push({id: tuid(), type: 'rect', name: i18n('Photo du jour — {nm}', {nm: name(n.p)}), x: r2(cx - ph * .7), y: r2(y + bh + rowH * .04), w: r2(ph * 1.4), h: r2(ph), r: r2(ph * .08), fill: 'none', stroke: color, sw, dash: '4 3'}); }
            for (const k of n.kids) { const ky = y0 + k.depth * rowH + (rowH - bh) / 2 - (o.photos ? rowH * .1 : 0), ym = (y + bh + ky) / 2 + (o.photos ? rowH * .06 : 0), kx = pos.get(k);
                links.push({id: tuid(), type: 'svgpath', name: 'Lien', d: `M${r2(cx)} ${r2(y + bh)}V${r2(ym)}H${r2(kx)}V${r2(ky)}`, fill: 'none', stroke: k.depth === 1 ? branchColorOf(k.branch) : branchColorOf(n.branch), sw: r2(sw * 1.4), join: 'round'}); }
        }
        const ts = Math.min(band * .5, W * .8 / Math.max(6, String(o.title || '').length * .55));
        const titles = [{id: tuid(), type: 'text', name: 'Titre', text: String(o.title || d.title), x: r2(W / 2), y: r2(m + band * .55), size: r2(ts), font: T.font, align: 'middle', bold: true, fill: T.title, sw: 0},
            {id: tuid(), type: 'text', name: 'Sous-titre', text: [d.ancestor_name && i18n('Les descendants de {nm}', {nm: d.ancestor_name}), d.date_text, d.place_text].filter(Boolean).join(' · '), x: r2(W / 2), y: r2(m + band * .55 + ts * .75), size: r2(ts * .4), font: T.font, align: 'middle', italic: true, fill: T.ink, sw: 0}];
        const legend = branchesOf(d).map((b, i) => ({id: tuid(), type: 'text', name: `Branche ${b.name}`, text: `■ ${b.name}`, x: r2(m + i * (w / Math.max(1, branchesOf(d).length)) + 4 * unit), y: r2(H - m * .45), size: r2(Math.min(14 * unit, m * .35)), font: T.font, align: 'start', fill: b.color, sw: 0}));
        const layer = (nm, children) => ({id: tuid(), type: 'group', layer: true, name: nm, children});
        const frame = T.frame ? [{id: tuid(), type: 'rect', name: 'Cadre', x: r2(m * .4), y: r2(m * .4), w: r2(W - m * .8), h: r2(H - m * .8), fill: 'none', stroke: T.ink, sw: r2(3 * unit)}] : [];
        return {w: r2(W), h: r2(H), bg: T.paper, grid: 0, snap: false, kind: 'tree', objs: [layer('Cadre', frame), layer('Liens', links), layer('Descendants', boxes), ...(photos.length ? [layer('Photos du jour', photos)] : []), layer('Branches', legend), layer('Titre', titles)].filter(l => l.children.length)};
    }

    /* ── 📅 Jour J : présence, plan de table, album ── */
    const SUBS = [['presence', '✅ Présence'], ['tables', '🍽 Plan de table'], ['album', '📸 Album']];
    function tabDay(body, d) {
        if (!SUBS.some(s => s[0] === cur.sub)) cur.sub = 'presence';
        body.innerHTML = `<div class="ui-filters cous-subs" role="tablist">${SUBS.map(([k, l]) => `<button type="button" class="ui-chip${cur.sub === k ? ' is-active' : ''}" role="tab" aria-selected="${cur.sub === k}" data-cous-sub="${k}">${l}</button>`).join('')}</div><div data-cous-subbody></div>`;
        body.querySelector('.cous-subs').addEventListener('click', e => { const b = e.target.closest('[data-cous-sub]'); if (!b) return; cur.sub = b.dataset.cousSub; tabDay(body, d); });
        const sb = body.querySelector('[data-cous-subbody]');
        ({presence: dayPresence, tables: dayTables, album: dayAlbum})[cur.sub](sb, d);
    }
    function dayPresence(sb, d) {
        const ro = kiosk(), list = bySort(d, d.guests.filter(g => g.invited && g.answer !== 'no'), 'branch'), here = list.filter(g => g.present).length, expected = list.filter(g => g.answer === 'yes').length;
        sb.innerHTML = `<div class="cous-daybar"><p class="cous-big">${i18n('{here} sur {n}', {here: UI().badge(plural(here, 'présent', 'présents'), 'green'), n: esc(plural(expected, 'personne attendue', 'personnes attendues'))})}</p><button type="button" class="button secondary" data-cous-ppr>🖨 Imprimer la liste de présence…</button></div>
            ${list.length ? `<div class="cous-presence">${list.map(g => `<label class="cous-pres${g.present ? ' is-on' : ''}"><input type="checkbox" data-cous-pres="${g.id}"${g.present ? ' checked' : ''}${ro ? ' disabled' : ''}>${avatar(g, 34)}<span><b>${dot(d, g.branch_id)}${esc(C().fullName(g))}</b><small class="muted">${esc(answerOf(g.answer)[1])}${g.people_count ? ` · ${g.people_count} pers.` : ''}${g.table_no ? ` · table ${g.table_no}` : ''}</small></span></label>`).join('')}</div>` : A().empty('Personne n’a encore dit oui : les réponses se notent dans « 👥 Invités ».', {icon: '✅'})}`;
        sb.addEventListener('change', e => { const id = Number(e.target.dataset.cousPres); if (!id) return; const g = d.guests.find(x => x.id === id); e.target.closest('.cous-pres')?.classList.toggle('is-on', e.target.checked); setField([id], 'present', e.target.checked ? 1 : 0, i18n(e.target.checked ? '{name} est là.' : (g.gender === 'female' ? '{name} n’est plus notée présente.' : '{name} n’est plus noté présent.'), {name: C().fullName(g)})); });
        sb.querySelector('[data-cous-ppr]').addEventListener('click', () => UI().openPrintDialog({title: i18n('Présence — {name}', {name: d.title}), key: 'cousinade-presence', zone: 'Liste de présence', photos: false, margin: 12,
            html: () => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${printCss}</style></head><body><h1>✅ ${esc(i18n('{name} — présence', {name: d.title}))}</h1><p class="sub">${esc([d.date_text, d.place_text].filter(Boolean).join(' · '))}</p>
                <table><thead><tr><th style="width:24px">✓</th><th>Personne</th><th>Branche</th><th>Table</th><th style="width:30%">Signature</th></tr></thead><tbody>${list.map(g => { const b = branchOf(d, g.branch_id); return `<tr><td><span class="box"></span></td><td>${esc(C().fullName(g))}</td><td>${b ? `<span class="dot" style="background:${esc(b.color)}"></span>${esc(b.first || b.name)}` : ''}</td><td>${g.table_no ?? ''}</td><td></td></tr>`; }).join('')}</tbody></table></body></html>`}));
    }
    function dayTables(sb, d) {
        const ro = kiosk(), o = {size: 8, maybe: false, mix: false, ...(d.options?.tables || {})};
        const groups = new Map(); for (const g of d.guests) if (g.table_no && g.invited) { if (!groups.has(g.table_no)) groups.set(g.table_no, []); groups.get(g.table_no).push(g); }
        const nos = [...groups.keys()].sort((a, b) => a - b), seated = nos.reduce((s, n) => s + groups.get(n).length, 0);
        sb.innerHTML = `<div class="cous-daybar cous-tables-opts"><label>Places par table<input type="number" data-unit="places" min="2" max="40" step="1" data-cous-tsize value="${o.size}"${ro ? ' disabled' : ''}></label>
                ${UI().checkHtml('Compter aussi les « peut-être »', {checked: o.maybe, attrs: 'data-cous-tmaybe'})}${UI().checkHtml('Les petites branches partagent une table', {checked: o.mix, attrs: 'data-cous-tmix'})}
                ${ro ? '' : '<button type="button" class="button" data-cous-plan>✨ Faire le plan par branche</button>'}${nos.length ? '<button type="button" class="button secondary" data-cous-tpr>🖨 Imprimer le plan…</button>' : ''}</div>
            <p class="ui-hint">Un foyer n’est jamais séparé. Change la table d’une personne avec sa case ; ↶ Annuler défait le plan.</p>
            ${nos.length ? `<p class="muted">${esc(plural(nos.length, 'table'))} · ${esc(plural(seated, 'personne placée', 'personnes placées'))}</p><div class="cous-tables">${nos.map(no => { const gs = groups.get(no), b = branchOf(d, gs[0].branch_id);
                return `<section class="cous-tablecard" style="--cous-c:${esc(b?.color || '#8a8f98')}"><h4>Table ${no} <small>${esc(b ? b.first || b.name : '')} · ${gs.reduce((s, g) => s + C().seats(g), 0)} pl.</small></h4><ul>${gs.map(g => `<li>${esc(C().fullName(g))}${g.people_count > 1 ? ` <small>(${g.people_count})</small>` : ''}${ro ? '' : `<input type="number" min="1" max="500" class="cous-num" data-cous-tno="${g.id}" value="${no}" aria-label="Table de ${esc(C().fullName(g))}">`}</li>`).join('')}</ul></section>`; }).join('')}</div>`
                : A().empty('Pas encore de plan de table : note les réponses, puis « ✨ Faire le plan par branche ».', {icon: '🍽'})}`;
        const opts = () => ({size: Number(sb.querySelector('[data-cous-tsize]').value) || 8, maybe: !!sb.querySelector('[data-cous-tmaybe]')?.checked, mix: !!sb.querySelector('[data-cous-tmix]')?.checked});
        sb.addEventListener('change', async e => {
            const id = Number(e.target.dataset.cousTno); if (id) { const g = d.guests.find(x => x.id === id); return setField([id], 'table_no', e.target.value, i18n('{name} va à la table {no}.', {name: C().fullName(g), no: String(e.target.value)})); }
            if (!ro && e.target.closest('[data-cous-tsize],[data-cous-tmaybe],[data-cous-tmix]')) saveOptions({tables: opts()}, {quiet: true});
        });
        sb.querySelector('[data-cous-plan]')?.addEventListener('click', async () => {
            const op = opts(), plan = C().tablePlan(d.guests, op.size, op);
            if (!plan.tables.length) return toast('Personne ne vient encore : note les réponses « Oui » d’abord.');
            const values = {}; for (const g of d.guests) values[g.id] = plan.byGuest[g.id] || null;
            let r; try { await saveOptions({tables: op}, {quiet: true}); r = await post({op: 'guests_set', cousinade_id: d.id, field: 'table_no', values}); } catch (e) { toast(e.message, 'error'); return; }
            const prev = (r.result || r).prev; await reload();
            A().undoToast(`Plan de table : ${plural(plan.tables.length, 'table')}.`, {undo: async () => { await post({op: 'guests_set', cousinade_id: d.id, field: 'table_no', values: prev}); reload(); }});
        });
        sb.querySelector('[data-cous-tpr]')?.addEventListener('click', () => UI().openPrintDialog({title: i18n('Plan de table — {nm}', {nm: d.title}), key: 'cousinade-tables', zone: 'Plan de table', photos: false, margin: 12,
            html: () => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${printCss}.t{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.t section{border:2px solid #999;border-radius:6px;padding:6px 8px;break-inside:avoid}.t h2{font-size:12pt;margin:0 0 4px}.t ul{margin:0;padding-left:16px;font-size:10pt}</style></head><body><h1>🍽 ${esc(d.title)} — plan de table</h1><p class="sub">${esc([d.date_text, d.place_text].filter(Boolean).join(' · '))}</p><div class="t">${nos.map(no => { const gs = groups.get(no), b = branchOf(d, gs[0].branch_id); return `<section style="border-color:${esc(b?.color || '#999')}"><h2>Table ${no}${b ? ` · ${esc(b.first || b.name)}` : ''}</h2><ul>${gs.map(g => `<li>${esc(C().fullName(g))}${g.people_count > 1 ? ` (${g.people_count})` : ''}</li>`).join('')}</ul></section>`; }).join('')}</div></body></html>`}));
    }
    function dayAlbum(sb, d) {
        const ro = kiosk(), album = d.options?.album || [];
        sb.innerHTML = `<div class="cous-daybar"><p class="muted">${i18n('{n} de la cousinade', {n: esc(plural(album.length, 'photo'))})}</p>${ro ? '' : '<button type="button" class="button" data-cous-aadd>＋ Ajouter des photos…</button>'}</div>
            ${album.length ? `<div class="cous-album">${album.map(m => `<figure class="cous-photo"><button type="button" class="cous-photo-open" data-cous-aopen="${m.id}" title="${esc(m.title)}"><img src="media/${encodeURIComponent(m.filename)}" alt="${esc(m.title)}" loading="lazy"></button>${ro ? '' : `<button type="button" class="icon-button small cous-photo-x" data-cous-adel="${m.id}" title="Retirer de l’album" aria-label="Retirer de l’album">×</button>`}<figcaption>${esc(m.title)}</figcaption></figure>`).join('')}</div>`
                : A().emptyState({icon: '📸', text: 'L’album est vide', hint: 'Les photos du jour : importe-les depuis l’ordinateur ou choisis-les dans les médias.', action: ro ? null : {label: '＋ Ajouter des photos', attrs: 'data-cous-aadd'}})}`;
        sb.addEventListener('click', async e => {
            if (e.target.closest('[data-cous-aadd]')) {
                const pick = await P().openMediaPicker?.({types: ['image'], multiple: true, eyebrow: '🎉 COUSINADE', title: 'Les photos de la cousinade', okLabel: 'Ajouter à l’album'});
                const items = (Array.isArray(pick) ? pick : pick ? [pick] : []).filter(m => m && m.id);
                if (!items.length) return;
                const prev = album.map(m => m.id), next = [...new Set([...prev, ...items.map(m => m.id)])];
                const r = await saveOptions({album: next}, {quiet: true}); if (!r) return;
                tabDay(sb.parentElement, d);
                A().undoToast(i18n('{n} à l’album.', {n: plural(next.length - prev.length, 'photo ajoutée', 'photos ajoutées')}), {undo: async () => { await saveOptions({album: prev}, {quiet: true}); reload(); }});
                return;
            }
            const x = e.target.closest('[data-cous-adel]'); if (x) {
                const prev = album.map(m => m.id), id = Number(x.dataset.cousAdel);
                const r = await saveOptions({album: prev.filter(i => i !== id)}, {quiet: true}); if (!r) return;
                tabDay(sb.parentElement, d);
                A().undoToast('Photo retirée de l’album (elle reste dans les médias).', {undo: async () => { await saveOptions({album: prev}, {quiet: true}); reload(); }});
                return;
            }
            const op = e.target.closest('[data-cous-aopen]'); if (op) { const m = album.find(a => a.id === Number(op.dataset.cousAopen)); if (m && P().openMedia) P().openMedia(m); }
        });
    }

    /* ── 📊 Chiffres ── */
    function tabStats(body, d) {
        const s = C().stats(d.guests, branchesOf(d)), t = s.total, ro = kiosk();
        const tile = (n, l, k) => `<div class="cous-tile is-${k}"><b>${n}</b><span>${esc(l)}</span></div>`;
        const max = Math.max(1, ...s.rows.map(r => r.invited));
        body.innerHTML = `<div class="cous-tiles">${tile(t.invited, i18n('invités'), 'blue')}${tile(t.yes, i18n('oui'), 'green')}${tile(t.maybe, i18n('peut-être'), 'yellow')}${tile(t.no, i18n('non'), 'red')}${tile(t.wait, i18n('sans réponse'), 'grey')}${tile(t.people, i18n('personnes attendues'), 'blue')}</div>
            <h3 class="section-label">Par branche</h3>
            <div class="cous-tablewrap"><table class="data-table cous-stats" data-cols-off><thead><tr><th scope="col">Branche</th><th scope="col">Couleur</th><th scope="col">Invités</th><th scope="col">Réponses</th><th scope="col">Oui</th><th scope="col">Non</th><th scope="col">Peut-être</th><th scope="col">Sans réponse</th><th scope="col">Personnes</th></tr></thead><tbody>
            ${s.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.id && !ro ? `<input type="color" value="${esc(r.color)}" data-cous-bcolor="${r.id}" aria-label="${esc(i18n('Couleur de la branche {name}', {name: r.name}))}">` : `<span class="cous-dot" style="--cous-c:${esc(r.color)}"></span>`}</td><td>${r.invited}</td>
                <td><div class="cous-bar" title="${esc(i18n('{yes} oui, {maybe} peut-être, {no} non, {wait} sans réponse', {yes: r.yes, maybe: r.maybe, no: r.no, wait: r.wait}))}" style="width:${Math.round(100 * r.invited / max)}%">${['yes', 'maybe', 'no', 'wait'].map(k => r[k] ? `<i class="is-${k}" style="flex:${r[k]}"></i>` : '').join('')}</div></td>
                <td>${r.yes}</td><td>${r.no}</td><td>${r.maybe}</td><td>${r.wait}</td><td>${r.people}</td></tr>`).join('')}</tbody></table></div>
            ${s.diets.length ? `<h3 class="section-label">Régimes et allergies (de ceux qui viennent)</h3><p>${s.diets.map(x => `<span class="ui-chip">${esc(x.label)} <small>${x.n}</small></span>`).join(' ')}</p>` : ''}
            ${t.present ? `<p class="muted">${esc(i18n('Le jour J : {n}.', {n: plural(t.present, 'personne présente', 'personnes présentes')}))}</p>` : ''}`;
        body.addEventListener('change', async e => {
            const id = e.target.dataset.cousBcolor; if (!id) return;
            const prev = {...(d.options?.branchColors || {})}, next = {...prev, [id]: e.target.value};
            if (await saveOptions({branchColors: next}, {quiet: true})) A().undoToast('Couleur de la branche enregistrée.', {undo: async () => { await saveOptions({branchColors: prev}, {quiet: true}); reload(); }});
        });
    }

    /* ═════ Les clics communs ═════ */
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest?.('[data-cous-new]')) { e.preventDefault(); openProjectDialog(); return; }
        const o = t.closest?.('[data-cous-open]'); if (o) { e.preventDefault(); openList(Number(o.dataset.cousOpen)); return; }
        if (t.closest?.('[data-cous-back]')) { e.preventDefault(); openList(0); return; }
        const tb = t.closest?.('[data-cous-tab]'); if (tb) { cur.tab = tb.dataset.cousTab; store.set('lcnda-cousinade-tab', cur.tab); renderProject(ws()); return; }
        if (t.closest?.('[data-cous-edit]')) { openProjectDialog({data: cur.data}); return; }
        if (t.closest?.('[data-cous-rescan]')) { rescan(); return; }
        const rn = t.closest?.('[data-cous-ren]'); if (rn) { rn.closest('details')?.removeAttribute('open'); renameProject(rn.dataset.cousRen, cur.id ? () => { cur.data = null; ext.lists[LIST](); } : null); return; }
        const dl = t.closest?.('[data-cous-del]'); if (dl) { dl.closest('details')?.removeAttribute('open'); deleteProject(dl.dataset.cousDel); return; }
        if (t.closest?.('[data-cous-gadd]')) { editGuest(null); return; }
        if (t.closest?.('[data-cous-import]')) { importList(); return; }
        const ge = t.closest?.('[data-cous-gedit]'); if (ge && cur.data) { ge.closest('details')?.removeAttribute('open'); const g = cur.data.guests.find(x => x.id === Number(ge.dataset.cousGedit)); if (g) editGuest(g); return; }
        const gd = t.closest?.('[data-cous-gdel]'); if (gd && cur.data) { gd.closest('details')?.removeAttribute('open'); const g = cur.data.guests.find(x => x.id === Number(gd.dataset.cousGdel)); if (g) removeGuests([g.id], i18n(g.gender === 'female' ? '{name} retirée de la liste.' : '{name} retiré de la liste.', {name: C().fullName(g)})); }
    });
    // K14 : clic droit sur une ligne = le menu de son ⋯
    document.addEventListener('contextmenu', e => {
        if (e.shiftKey || e.target.closest?.('input, textarea, select') || kiosk()) return;
        const g = e.target.closest?.('[data-cous-grow][data-ctx-menu]'), p = e.target.closest?.('[data-cous-row][data-ctx-menu]');
        if (g && cur.data) { const row = cur.data.guests.find(x => x.id === Number(g.dataset.cousGrow)); if (!row) return; e.stopPropagation(); UI().contextMenu(e, guestMenu(row)); return; }
        if (p) { const id = Number(p.dataset.cousRow); e.stopPropagation(); UI().contextMenu(e, [{icon: '↗', label: 'Ouvrir', run: () => openList(id)}, {icon: '✎', label: 'Renommer', run: () => renameProject(id)}, '-', {icon: '🗑', label: 'Supprimer', danger: true, run: () => deleteProject(id)}]); }
    }, true);

    /* ═════ Ailleurs dans l'app ═════ */
    // ⋯ de la fiche d'une personne : « 🎉 Organiser une cousinade… » (cette personne comme ancêtre)
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal' || kiosk()) return null; return {icon: '🎉', label: 'Organiser une cousinade…', run: () => openProjectDialog({ancestor: Number(p.id)})}; });
    // Listes → Outils de modification
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'cousinade', icon: '🎉', label: 'Cousinades', what: 'cousinade',
        load: async () => ((await get('list')).items || []).map(r => ({id: r.id, name: r.title, date: r.updated_at, thumb: r.cover ? `<img src="media/${encodeURIComponent(r.cover)}" alt="">` : '<span class="h-et-ico">🎉</span>', info: r.ancestor ? i18n('Descendants de {name} · {n}', {name: r.ancestor, n: plural(r.invited, 'invité')}) : plural(r.invited, 'invité')})),
        open: id => openList(Number(id)), create: () => openProjectDialog(),
        rename: (id, name) => post({op: 'save', id, title: name}),
        remove: id => post({op: 'delete', id}), createLabel: '＋ Nouvelle cousinade'});

    ext.cousinade = {open: openList, create: openProjectDialog, buildTree, badgePages, letterOf, reload};
})();
