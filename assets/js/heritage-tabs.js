/**
 * 🗂️ Éditeur d'onglets (Maintenance → Éditeur d'onglets) : ses propres onglets dans la barre du haut, sans programmer.
 *  - une page de widgets, comme le tableau de bord : widgets de l'app, ses widgets, ses listes et ses statistiques
 *    (ajoutés depuis la colonne de gauche de l'onglet, ou ici) ;
 *  - ou un raccourci vers un écran de l'app (une liste, un diagramme, une statistique, un outil de maintenance…) ;
 *  - partir de rien, d'un onglet existant (copie du tableau de bord, un de ses onglets, un écran de l'app) ou d'un modèle ;
 *  - rangés dans le réglage « genealogie-custom-tabs » (suit la base et la sauvegarde) ; partage par fichier.
 * Chargé après app.js et heritage-widgets.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    const esc = value => A().escapeHtml(value ?? '');
    // le nom de la personne choisie (menu de choix unique) est gardé à côté du champ, pour le titre de l'écran
    document.addEventListener('picker-change', e => { const w = e.target.closest?.('[data-ct-pwrap]'); if (w) w.dataset.pname = e.detail.item?.title || ''; });
    const toast = (...args) => A().toast(...args);
    const S = () => A().state;
    const isCurrent = token => token === S().workspaceToken && S().module === 'maintenance';
    const header = (eyebrow, title, intro, actions = '') => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    const newId = () => 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const str = (v, n) => String(v ?? '').slice(0, n);
    const FILE_KIND = 'lcnda-tab';

    const tabs = () => A().customTabs();
    const save = list => A().saveCustomTabs(list);
    const widgetLabel = type => { const d = ext.customWidgetDefs?.()?.[type]; return d ? `${d.icon || '🧱'} ${d.name || 'Mon widget'}` : A().dashboardWidgetLabel(type); };
    const catalog = () => A().orderedDashboardWidgetTypes(true).map(([k, , l]) => [k, String(k).startsWith('cw_') ? widgetLabel(k) : l]);
    const w = (type, width) => ({type, width: String(width || '6')});

    /* ─── Écrans de l'app pour un onglet « raccourci » ─── */
    function screenTargets() {
        const app = A();
        return [
            ['Écrans', Object.entries(app.appModules).filter(([k]) => k !== 'jeu').map(([k, v]) => ['module:' + k, v[1]])],
            ['Listes', app.defaultListTypes.map(([k, , l]) => ['list:' + k, l])],
            ['Diagrammes (Graphiques)', app.orderedGraphDiagramItems(true).map(([k, , l]) => ['graph:' + k, l])],
            ['Statistiques (Graphiques)', app.orderedGraphStatsItems(true).map(([k, , l]) => ['stat:' + k, l]).concat((ext.customStatItems?.() || []).map(([k, l]) => ['stat:' + k, l]))],
            ['Maintenance', app.defaultMaintenanceTabs.map(([k, , l]) => ['maint:' + k, l])],
        ];
    }
    /* ─── Une commune choisie : sa fiche de village ou sa monographie, avec une organisation propre à cet endroit ─── */
    const PLACE_KINDS = {village: '🏘️ Fiche d’un village…', monograph: '📜 Monographie de commune…'};
    const MONO_SECTIONS = [['filters', '🔎 Les filtres (commune, années, sorte d’acte)'], ['metrics', '🔢 Les chiffres'], ['events', '📜 Actes rattachés'], ['census', '🏠 Recensements'], ['digests', '📑 Dépouillements'], ['battues', '🧭 Battues'], ['cemetery', '⚰️ Cimetière']];
    let villages = [];
    const loadVillages = async () => { try { villages = (await A().api('villages')).villages || []; } catch (_) { villages = []; } return villages; };
    const placeKind = t => { const m = String(t || '').match(/^(village|monograph):/); return m ? m[1] : ''; };
    const placeKey = t => String(t || '').replace(/^(village|monograph):/, '');
    const placeSections = kind => kind === 'village' ? (ext.villageSections?.() || []).map(([k, l]) => [k, l]) : MONO_SECTIONS;
    function placeLayout(layout, kind) {
        const secs = placeSections(kind).map(x => x[0]), l = layout && typeof layout === 'object' ? layout : {};
        const order = [...new Set((Array.isArray(l.order) ? l.order : []).filter(k => secs.includes(k)))];
        secs.forEach(k => { if (!order.includes(k)) order.push(k); });
        const widths = (ext.villageWidths?.() || []).map(x => x[0]);
        return {kind, order, hidden: (Array.isArray(l.hidden) ? l.hidden : []).filter(k => secs.includes(k)),
            width: Object.fromEntries(Object.entries(l.width && typeof l.width === 'object' ? l.width : {}).filter(([k, v]) => secs.includes(k) && widths.includes(v)))};
    }
    function placeHtml(c) {
        const kind = placeKind(c.target), key = placeKey(c.target), l = placeLayout(c.layout, kind), secs = placeSections(kind), widths = ext.villageWidths?.() || [];
        const known = villages.some(v => v.key === key);
        return `<div class="h-place-cfg span-2" data-place-cfg>
            <label>Commune <select data-place-key><option value="">choisir une commune…</option>${!known && key ? `<option value="${esc(key)}" selected>${esc(c.placeName || key)}</option>` : ''}${villages.map(v => `<option value="${esc(v.key)}" ${v.key === key ? 'selected' : ''}>${esc(v.name)}${v.county ? ` (${esc(v.county)})` : ''}</option>`).join('')}</select></label>
            <p class="muted">Organisation propre à cet endroit (la fiche du village dans Listes garde la sienne) : coche ce qui est montré, range avec ⠿ ou ↑ ↓${kind === 'village' ? ', choisis la largeur' : ''}.</p>
            <ol class="h-book-order" data-place-order>${l.order.map(k => { const s = secs.find(x => x[0] === k); const off = l.hidden.includes(k);
                return `<li data-k="${esc(k)}" class="${off ? 'is-off' : ''}"><label class="checkbox-line"><input type="checkbox" data-place-show ${off ? '' : 'checked'}> <span>${esc(s[1])}</span></label>${kind === 'village' ? `<select data-place-width aria-label="Largeur"><option value="">largeur habituelle</option>${widths.map(([w, lab]) => `<option value="${w}" ${l.width[k] === w ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>` : ''}<span class="h-book-moves"><button type="button" class="icon-button small" data-place-move="-1" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-place-move="1" aria-label="Descendre">↓</button></span></li>`; }).join('')}</ol></div>`;
    }
    /** Lit le cadre « commune » dans c (target, placeName, layout) à chaque changement */
    function bindPlace(box, c, changed = () => {}) {
        const cfg = box.querySelector('[data-place-cfg]'); if (!cfg || cfg.dataset.bound) return; cfg.dataset.bound = '1';
        const kind = placeKind(c.target);
        const read = () => {
            const sel = cfg.querySelector('[data-place-key]');
            c.target = kind + ':' + sel.value; c.placeName = sel.value ? sel.selectedOptions[0].textContent.replace(/\s*\(.*\)$/, '') : '';
            const lis = [...cfg.querySelectorAll('[data-place-order] li')];
            c.layout = {kind, order: lis.map(li => li.dataset.k), hidden: lis.filter(li => !li.querySelector('[data-place-show]').checked).map(li => li.dataset.k),
                width: Object.fromEntries(lis.map(li => [li.dataset.k, li.querySelector('[data-place-width]')?.value || '']).filter(([, v]) => v))};
            lis.forEach(li => li.classList.toggle('is-off', !li.querySelector('[data-place-show]').checked));
            changed();
        };
        cfg.addEventListener('change', read);
        cfg.addEventListener('click', e => { const mv = e.target.closest('[data-place-move]'); if (!mv) return; e.preventDefault(); const li = mv.closest('li');
            if (mv.dataset.placeMove === '-1' && li.previousElementSibling) li.parentElement.insertBefore(li, li.previousElementSibling); else if (mv.dataset.placeMove === '1' && li.nextElementSibling) li.parentElement.insertBefore(li.nextElementSibling, li); read(); });
    }
    const cleanPlace = c => placeKind(c.target) ? {placeName: str(c.placeName, 160), layout: placeLayout(c.layout, placeKind(c.target))} : {};
    let myLists = []; // « Mes listes » (Éditeur de listes), chargées à l'ouverture de l'éditeur
    const loadMyLists = async () => { try { myLists = (await A().api('my_lists')).lists || []; } catch (_) { myLists = []; } return myLists; };
    const targetLabel = t => {
        const [type, value] = String(t || '').split(':');
        if (type === 'person') return 'Fiche d’une personne';
        if (type === 'village' || type === 'monograph') { const v = villages.find(x => x.key === placeKey(t)); return (type === 'village' ? '🏘️ ' : '📜 Monographie : ') + (v?.name || 'une commune'); }
        if (type === 'mylist') { const l = myLists.find(x => Number(x.id) === Number(value)); return l ? `${l.icon || '📋'} ${l.name}` : 'Une de mes listes'; }
        for (const [, items] of screenTargets()) { const f = items.find(([v]) => v === t); if (f) return f[1]; }
        return t || '—';
    };
    const validTarget = t => /^(person|mylist):\d{1,9}$/.test(String(t || '')) || /^(village|monograph):[^<>"]{1,300}$/.test(String(t || '')) || screenTargets().some(([, items]) => items.some(([v]) => v === t));
    const HEIGHTS = [['360', 'petit'], ['560', 'moyen'], ['800', 'grand'], ['1100', 'très grand']];
    // Dans un écran déjà intégré (iframe), pas d'écran dedans : sinon une fiche qui contient sa propre fiche se répète sans fin
    const NESTED = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
    const nestedLink = (target, title) => `<p class="muted">📺 ${esc(title)} <button type="button" class="link-button" data-ct-open-screen="${esc(target)}">↗ Ouvrir en grand</button></p>`;
    const screenUrl = c => `index.php?view=${encodeURIComponent(JSON.stringify({module: 'dashboard', screen: c.target, sidebar: !!c.sidebar, ...(placeKind(c.target) && c.layout ? {layout: placeLayout(c.layout, placeKind(c.target))} : {})}))}`;

    /* ─── Les pièces propres aux onglets : un écran de l'app, un texte libre (aussi au tableau de bord) ─── */
    ext.dashboard = ext.dashboard || {};
    ext.dashboardConfig = ext.dashboardConfig || {};
    ext.dashboard.app_screen = {render: (index, widget, span) => {
        const c = {target: 'module:carte', height: 560, ...(widget.config || {})};
        const title = c.title || (String(c.target).startsWith('person:') ? (c.personName || 'Fiche d’une personne') : targetLabel(c.target));
        const body = NESTED && validTarget(c.target) ? nestedLink(c.target, title) : validTarget(c.target) ? `<iframe class="h-ct-frame" src="${esc(screenUrl(c))}" title="${esc(title)}" loading="lazy" style="height:${Math.max(240, Math.min(2000, Number(c.height) || 560))}px"></iframe>` : A().empty('Écran introuvable : choisis-le avec le crayon ✎.');
        return A().card(index, title, '', body, span, `<button type="button" class="button small secondary" data-ct-open-screen="${esc(c.target)}" title="Ouvrir cet écran en grand">↗ En grand</button>`);
    }};
    const screenSelect = (cur, attr) => `<select ${attr}>${screenTargets().map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}${myLists.length ? `<optgroup label="Mes listes">${myLists.map(l => `<option value="mylist:${Number(l.id)}" ${cur === 'mylist:' + l.id ? 'selected' : ''}>${esc((l.icon || '📋') + ' ' + l.name)}</option>`).join('')}</optgroup>` : ''}<optgroup label="Une personne"><option value="person:" ${String(cur).startsWith('person:') ? 'selected' : ''}>Fiche d’une personne…</option></optgroup><optgroup label="Une commune">${Object.entries(PLACE_KINDS).map(([k, l]) => `<option value="${k}:" ${placeKind(cur) === k ? 'selected' : ''}>${l}</option>`).join('')}</optgroup></select>`;
    ext.dashboardConfig.app_screen = {
        html: wd => { const c = {target: 'module:carte', height: 560, ...(wd.config || {})};
            ext.dashboardConfig.app_screen._place = c;
            setTimeout(() => {
                const sel = document.querySelector('.h-ct-wcfg [data-ctw="target"]'), ed = sel?.closest('.h-ct-wcfg'); if (!ed) return;
                if (placeKind(c.target)) { if (villages.length) bindPlace(ed, c); else loadVillages().then(() => { const old = ed.querySelector('[data-place-cfg]'); if (old) { old.outerHTML = placeHtml(c); bindPlace(ed, c); } }); }
                sel.addEventListener('change', async () => { // une commune : le cadre apparaît sous le choix de l'écran
                    ed.querySelector('[data-place-cfg]')?.remove();
                    if (!placeKind(sel.value)) return;
                    if (!villages.length) await loadVillages();
                    const nc = {target: sel.value}; ext.dashboardConfig.app_screen._place = nc;
                    sel.closest('label').insertAdjacentHTML('afterend', placeHtml(nc)); bindPlace(ed, nc);
                });
            }, 0);
            return `<fieldset class="h-ct-wcfg"><legend>Écran de l’app</legend><label>Écran ${screenSelect(c.target, 'data-ctw="target"')}</label>${placeKind(c.target) ? placeHtml(c) : ''}
                <div data-ct-pwrap data-pname="${esc(c.personName || '')}"><span class="pk-lab">Personne <small>(pour « Fiche d’une personne »)</small></span>${window.LCNDA_PICKER.pickerField({name: 'ctw_person', kind: 'person', value: String(c.target).startsWith('person:') ? Number(c.target.slice(7)) || null : null})}</div>
                <label>Titre <small>(facultatif)</small><input data-ctw="title" value="${esc(c.title || '')}"></label>
                <label>Hauteur <select data-ctw="height">${HEIGHTS.map(([v, l]) => `<option value="${v}" ${String(c.height) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-ctw="sidebar" ${c.sidebar ? 'checked' : ''}> avec sa colonne de gauche (menus de l’écran)</label></fieldset>`; },
        read: ed => { let target = ed.querySelector('[data-ctw="target"]')?.value || 'module:carte'; const pid = Number(ed.querySelector('[name=ctw_person]')?.value) || 0, pname = ed.querySelector('[data-ct-pwrap]')?.dataset.pname || '';
            if (target.startsWith('person:')) target = pid ? 'person:' + pid : 'module:personnes';
            const pl = ext.dashboardConfig.app_screen._place;
            if (placeKind(target)) { if (pl && placeKind(pl.target) === placeKind(target) && placeKey(pl.target)) return {target: pl.target, ...cleanPlace(pl), title: ed.querySelector('[data-ctw="title"]')?.value || '', height: Number(ed.querySelector('[data-ctw="height"]')?.value) || 560, sidebar: false}; target = placeKind(target) === 'village' ? 'list:villages' : 'graph:place_monograph'; }
            return {target, personName: pname, title: ed.querySelector('[data-ctw="title"]')?.value || '', height: Number(ed.querySelector('[data-ctw="height"]')?.value) || 560, sidebar: !!ed.querySelector('[data-ctw="sidebar"]')?.checked}; },
    };
    ext.dashboard.tab_note = {render: (index, widget, span) => {
        const c = widget.config || {};
        const text = A().escapeHtml(c.text || '').replace(/\n/g, '<br>');
        return A().card(index, c.title || 'Note', '', text ? `<div class="h-cw-text">${text}</div>` : A().empty('Texte vide : écris-le avec le crayon ✎.'), span);
    }};
    ext.dashboardConfig.tab_note = {
        html: wd => `<fieldset class="h-ct-wcfg"><legend>Texte libre</legend><label>Titre<input data-ctn="title" value="${esc(wd.config?.title || '')}" placeholder="À faire cette semaine"></label><label>Texte<textarea data-ctn="text" rows="5">${esc(wd.config?.text || '')}</textarea></label></fieldset>`,
        read: ed => ({title: str(ed.querySelector('[data-ctn="title"]')?.value, 120), text: str(ed.querySelector('[data-ctn="text"]')?.value, 8000)}),
    };
    document.addEventListener('click', event => { const b = event.target.closest?.('[data-ct-open-screen]'); if (b) A().openCustomScreen(b.dataset.ctOpenScreen); });
    // pour l'Éditeur de widgets (sorte « Écran de l'app ») et les blocs de fiche
    ext.appScreen = {nested: NESTED, nestedLink, targets: () => screenTargets(), select: (cur, attr) => screenSelect(cur, attr), url: screenUrl, label: targetLabel, valid: validTarget, heights: HEIGHTS, loadLists: async () => { await Promise.all([loadMyLists(), loadVillages()]); return myLists; },
        place: {kind: placeKind, html: placeHtml, bind: bindPlace, clean: cleanPlace, layout: placeLayout}};

    /* ─── Modèles ─── */
    const sc = (target, width = 12, height = 560, extra = {}) => ({type: 'app_screen', width: String(width), config: {target, height, ...extra}});
    const note = (title, text, width = 6) => ({type: 'tab_note', width: String(width), config: {title, text}});
    const TEMPLATES = [
        {name: 'Mon bureau de recherche', icon: '🗂️', intro: 'Les actes à chercher, mes rappels et mes enquêtes, sans changer d’onglet.', widgets: [w('research_suggestions', 6), w('reminders', 6), sc('module:enquetes', 12, 800), sc('list:courriers', 12, 560)]},
        {name: 'Mon village', icon: '🏘️', intro: 'La fiche du village, ses recensements et la carte.', widgets: [note('Le village', 'Ce que je sais, ce que je cherche, les archives à voir.', 12), sc('list:villages', 12, 1100), sc('list:census_households', 12, 800)]},
        {name: 'Arbre et carte', icon: '🌳', intro: 'L’arbre des ascendants et la carte côte à côte.', widgets: [sc('graph:ancestors', 6, 800), sc('module:carte', 6, 800)]},
        {name: 'Ma recherche du jour', icon: '🔎', intro: 'Ce qu’il reste à faire, ce qu’il faut relire, les ancêtres qui manquent.', widgets: [w('daily_research', 6), w('reminders', 6), w('sosa_missing_near', 6), w('reread_items', 6), w('sources_to_check', 6), w('session_goal', 6)]},
        {name: 'Ma lignée', icon: '🌳', intro: 'L’avancement de mon arbre Sosa et la carte de mes ancêtres.', widgets: [w('sosa_progress', 6), w('sosa_missing_near', 6), w('lineage_widget', 12), w('map_overview', 12)]},
        {name: 'Mes photos et documents', icon: '🖼️', intro: 'Les derniers médias, ceux à transcrire ou à identifier.', widgets: [w('recent_media', 6), w('random_media', 6), w('media_to_transcribe', 6), w('media_to_identify', 6), w('media_unlinked', 6)]},
        {name: 'Qualité de la base', icon: '🧹', intro: 'Ce qui manque ou se contredit : sources, parents, doublons, lieux.', widgets: [w('persons_without_sources', 6), w('events_without_sources', 6), w('consistency_issues', 6), w('duplicates', 6), w('children_missing_parents', 6), w('places_to_complete', 6)]},
        {name: 'Sur le terrain', icon: '🧭', intro: 'Battues, communes à explorer et archives favorites, avant de partir.', widgets: [w('battues_priority', 6), w('battue_towns', 6), w('archive_favorites', 6), w('places', 6)]},
        {name: 'Le coin de la famille', icon: '🎂', intro: 'Pour montrer l’arbre aux proches : anniversaires, saint du jour, une personne et une image au hasard.', widgets: [w('today', 6), w('saint_day', 6), w('random_person', 6), w('random_media', 6), w('person_quiz', 6), w('upcoming', 6)]},
    ];

    /* ─── Liste des onglets ─── */
    ext.maintenance.tabs_editor = async token => {
        if (!isCurrent(token)) return;
        const open = S().tabsEditorOpen; S().tabsEditorOpen = '';
        if (open) { const t = tabs().find(x => x.id === open); if (t) return editTab({...t}, true); }
        const list = tabs();
        const kindText = t => t.kind === 'screen' ? `raccourci vers « ${esc(targetLabel(t.target))} »` : `${(t.widgets || []).length} widget${(t.widgets || []).length > 1 ? 's' : ''}`;
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Éditeur d’onglets', 'Crée tes propres onglets dans la barre du haut, sans rien programmer : une page de widgets comme le tableau de bord (widgets de l’app, tes widgets, tes listes, tes statistiques), ou un raccourci vers un écran de l’app. Pars de rien, d’un onglet existant ou d’un modèle.', '<button type="button" class="button" data-ct-new>+ Nouvel onglet</button>')}
            <section class="maintenance-panel"><h3>Importer un onglet reçu</h3><p class="muted">Un fichier « .lcnda-onglet.json » envoyé par un proche : seule la mise en page est partagée, jamais les données.</p><input type="file" accept=".json,application/json" data-ct-import></section>
            ${list.length ? `<div class="h-records">${list.map((t, i) => `<article class="h-record"><header><div><strong>${esc(t.icon || '🗂️')} ${esc(t.name || 'Mon onglet')}</strong> <small>${kindText(t)}</small>${t.hidden ? ' <span class="collection-kind">masqué</span>' : ''}</div>
                    <span class="h-saved-tools"><button type="button" class="link-button" data-ct-edit="${esc(t.id)}">modifier</button><button type="button" class="link-button" data-ct-dup="${esc(t.id)}">dupliquer</button><button type="button" class="link-button" data-ct-hide="${esc(t.id)}">${t.hidden ? 'afficher' : 'masquer'}</button><button type="button" class="link-button" data-ct-del="${esc(t.id)}">supprimer</button></span></header>
                    ${t.intro ? `<p>${esc(t.intro)}</p>` : ''}<div class="page-actions"><button type="button" class="button small" data-ct-open="${esc(t.id)}">Ouvrir l’onglet</button><button type="button" class="button small secondary" data-ct-share="${esc(t.id)}">📤 Partager (fichier)</button></div></article>`).join('')}</div>`
                : A().emptyState({icon: '🗂️', text: 'Aucun onglet à toi pour l’instant', hint: 'Un onglet rassemble sur un écran les widgets, listes et statistiques de ton choix.', action: {label: '＋ Nouvel onglet', attrs: 'data-ct-new'}})}</section>`;
        const ws = A().$('#workspace'), find = id => list.find(t => t.id === id);
        ws.querySelectorAll('[data-ct-new]').forEach(b => b.addEventListener('click', chooseStart));
        ws.querySelectorAll('[data-ct-edit]').forEach(b => b.addEventListener('click', () => editTab({...find(b.dataset.ctEdit)}, true)));
        ws.querySelectorAll('[data-ct-dup]').forEach(b => b.addEventListener('click', () => { const t = find(b.dataset.ctDup); editTab({...JSON.parse(JSON.stringify(t)), id: newId(), name: (t.name || 'Mon onglet') + ' (copie)'}, false); }));
        ws.querySelectorAll('[data-ct-open]').forEach(b => b.addEventListener('click', () => openTab(find(b.dataset.ctOpen))));
        ws.querySelectorAll('[data-ct-share]').forEach(b => b.addEventListener('click', () => shareTab(find(b.dataset.ctShare))));
        ws.querySelectorAll('[data-ct-hide]').forEach(b => b.addEventListener('click', () => { const t = find(b.dataset.ctHide); t.hidden = !t.hidden; menuHidden(t.id, t.hidden); save(list); refresh(); }));
        ws.querySelectorAll('[data-ct-del]').forEach(b => b.addEventListener('click', async () => {
            const t = find(b.dataset.ctDel);
            if (!await A().confirmBox(`Supprimer l’onglet « ${t.name || 'Mon onglet'} » ? Les widgets, listes et statistiques qu’il montrait ne sont pas supprimés.`, {title: 'Supprimer l’onglet', okLabel: 'Supprimer l’onglet'})) return;
            save(list.filter(x => x.id !== t.id)); toast('Onglet supprimé.'); refresh();
        }));
        ws.querySelector('[data-ct-import]').addEventListener('change', async e => {
            const file = e.target.files[0]; if (!file) return;
            try { const t = importTab(JSON.parse(await file.text())); save([...tabs(), t]); toast(`Onglet « ${t.name} » importé : il est dans la barre du haut.`); refresh(); }
            catch (error) { toast('Fichier d’onglet illisible : ' + error.message, 'error'); }
        });
    };
    // Même réglage que la case de Maintenance → Apparence → « Ordre du menu principal »
    function menuHidden(id, hide) {
        let hidden = []; try { hidden = JSON.parse(localStorage.getItem('genealogie-menu-hidden') || '[]'); } catch (_) {}
        hidden = (Array.isArray(hidden) ? hidden : []).filter(k => k !== id); if (hide) hidden.push(id);
        try { localStorage.setItem('genealogie-menu-hidden', JSON.stringify(hidden)); } catch (_) {}
    }
    /** Nouvelle place choisie dans l'onglet : on l'enlève de l'ordre enregistré, il se range alors « après … » */
    function forgetMenuPlace(id) {
        let order = []; try { order = JSON.parse(localStorage.getItem('genealogie-menu-order') || '[]'); } catch (_) {}
        if (Array.isArray(order) && order.includes(id)) { try { localStorage.setItem('genealogie-menu-order', JSON.stringify(order.filter(k => k !== id))); } catch (_) {} }
    }
    const refresh = () => ext.maintenance.tabs_editor(++S().workspaceToken);
    function openTab(t) {
        if (!t) return;
        if (t.kind === 'screen') { A().openCustomScreen(t.target); return; }
        S().dashboardBoard = t.id; A().setModule('dashboard');
    }

    /* ─── Par quoi commencer ? ─── */
    function chooseStart() {
        const tile = (icon, name, sub, attr) => `<button type="button" class="h-template" ${attr}><span>${esc(icon)}</span><strong>${esc(name)}</strong><small>${esc(sub)}</small></button>`;
        const mine = tabs();
        const board = A().dashboardBlockSettings; // tableau de bord principal (on n'est pas dans un onglet à soi ici)
        ext.openDialog({
            eyebrow: 'NOUVEL ONGLET', title: 'Par quoi commencer ?', wide: true, submitLabel: '',
            body: `<h4>Partir de rien</h4><div class="h-templates">${tile('🧩', 'Page composée', 'Une page vide où tu poses ce que tu veux : écrans de l’app (listes, diagrammes, fiches, carte…), widgets, statistiques, textes.', 'data-ct-blank')}${tile('🔗', 'Raccourci vers un écran', 'Un onglet qui ouvre directement une liste, un diagramme, une statistique ou un outil.', 'data-ct-screen')}</div>
                <h4>Partir d’un onglet existant</h4><div class="h-templates">${tile('📊', 'Copie du tableau de bord', `Les ${board().widgets.length} widgets du tableau de bord, dans le même ordre, à arranger à ta façon.`, 'data-ct-dashboard')}${mine.map(t => tile(t.icon || '🗂️', t.name || 'Mon onglet', 'Un de mes onglets', `data-ct-mine="${esc(t.id)}"`)).join('')}</div>
                <h4>Partir d’un écran de l’app</h4><p class="muted">L’écran (avec ses menus) dans une page à toi, où tu ajoutes ensuite d’autres écrans, des widgets ou des notes.</p><div class="h-templates">${['list:villages', 'module:carte', 'graph:ancestors', 'list:reminders', 'module:enquetes', 'list:census_households'].map(v => tile('📺', targetLabel(v), 'Écran de l’app', `data-ct-fromscreen="${v}"`)).join('')}</div>
                <h4>Modèles</h4><div class="h-templates">${TEMPLATES.map((t, i) => tile(t.icon, t.name, t.intro, `data-ct-tpl="${i}"`)).join('')}</div>`,
            onOpen: dlg => {
                const go = t => { dlg.close(); editTab({id: newId(), icon: '🗂️', intro: '', after: '', kind: 'page', widgets: [], ...JSON.parse(JSON.stringify(t))}, false); };
                dlg.querySelector('[data-ct-blank]').addEventListener('click', () => go({name: '', widgets: []}));
                dlg.querySelectorAll('[data-ct-fromscreen]').forEach(b => b.addEventListener('click', () => go({name: targetLabel(b.dataset.ctFromscreen), icon: '📺', widgets: [sc(b.dataset.ctFromscreen, 12, 800)]})));
                dlg.querySelector('[data-ct-screen]').addEventListener('click', () => go({name: '', kind: 'screen', icon: '🔗', target: 'list:villages'}));
                dlg.querySelector('[data-ct-dashboard]').addEventListener('click', () => go({name: 'Mon tableau de bord', icon: '📊', widgets: board().widgets.map(x => ({type: x.type, width: x.width, limit: x.limit, config: x.config}))}));
                dlg.querySelectorAll('[data-ct-mine]').forEach(b => b.addEventListener('click', () => { const t = mine.find(x => x.id === b.dataset.ctMine); go({...t, id: newId(), hidden: false, name: (t.name || 'Mon onglet') + ' (copie)'}); }));
                dlg.querySelectorAll('[data-ct-tpl]').forEach(b => b.addEventListener('click', () => go(TEMPLATES[Number(b.dataset.ctTpl)])));
            },
        });
    }

    /** Une pièce de la page dans l'éditeur : son nom, sa largeur, ses réglages, ↑ ↓ retirer */
    function pieceHtml(x, i, known) {
        const c = x.config || {};
        const widths = `<select data-ct-width="${i}" title="Largeur">${[['3', '¼'], ['4', '⅓'], ['6', '½'], ['8', '⅔'], ['12', 'toute la largeur']].map(([v, l]) => `<option value="${v}" ${String(x.width || '6') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        const tools = `<span class="h-saved-tools">${widths}<button type="button" class="link-button" data-ct-wup="${i}" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" class="link-button" data-ct-wdown="${i}" title="Descendre">↓</button><button type="button" class="link-button" data-ct-wdel="${i}">retirer</button></span>`;
        let kind = '🧱 Widget', label = known.get(x.type) || x.type, settings = '';
        if (x.type === 'app_screen') {
            kind = '📺 Écran'; label = String(c.target || '').startsWith('person:') ? (c.personName || 'Fiche d’une personne') : targetLabel(c.target);
            settings = `<div class="form-grid h-ct-piece-set"><label>Écran ${screenSelect(String(c.target || '').startsWith('person:') ? 'person:' : c.target, 'data-ct-p="target"')}</label>
                ${placeKind(c.target) ? placeHtml(c) : ''}
                ${String(c.target || '').startsWith('person:') ? `<div data-ct-pwrap data-pname="${esc(c.personName || '')}"><span class="pk-lab">Personne</span>${window.LCNDA_PICKER.pickerField({name: 'ctp_person' + i, kind: 'person', value: Number(String(c.target).slice(7)) || null})}</div>` : ''}
                <label>Titre <small>(facultatif)</small><input data-ct-p="title" value="${esc(c.title || '')}" placeholder="${esc(label)}"></label>
                <label>Hauteur <select data-ct-p="height">${HEIGHTS.map(([v, l]) => `<option value="${v}" ${String(c.height || 560) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-ct-p="sidebar" ${c.sidebar ? 'checked' : ''}> avec sa colonne de gauche (ses menus)</label></div>`;
        } else if (x.type === 'tab_note') {
            kind = '📝 Texte'; label = c.title || 'Texte libre';
            settings = `<div class="form-grid h-ct-piece-set"><label>Titre<input data-ct-p="title" value="${esc(c.title || '')}" placeholder="À faire cette semaine"></label><label class="span-2">Texte<textarea data-ct-p="text" rows="3" placeholder="Une note, une consigne, des liens à suivre…">${esc(c.text || '')}</textarea></label></div>`;
        } else if (String(x.type).startsWith('cw_')) kind = '✨ À moi';
        return `<li data-ct-i="${i}"><header><span><small class="h-ct-kind">${kind}</small> <strong>${esc(label)}</strong>${known.has(x.type) ? '' : ' <small class="muted">(n’existe plus ici)</small>'}</span>${tools}</header>${settings}</li>`;
    }

    /* ─── Réglages d'un onglet ─── */
    async function editTab(t, existing) {
        const token = ++S().workspaceToken;
        await Promise.all([loadMyLists(), loadVillages()]); if (token !== S().workspaceToken) return;
        t.widgets = Array.isArray(t.widgets) ? t.widgets : [];
        const app = A();
        const afterOptions = [['', 'à la fin (avant Maintenance)'], ...Object.entries(app.appModules).filter(([k]) => !['jeu', 'maintenance'].includes(k)).map(([k, v]) => [k, 'après « ' + v[1] + ' »'])];
        const paint = () => {
            const known = new Map(catalog());
            app.$('#workspace').innerHTML = `<section class="page collection-page h-ct-editor">${header('ÉDITEUR D’ONGLETS', existing ? `Modifier « ${t.name || 'Mon onglet'} »` : 'Nouvel onglet', 'Le nom et l’icône apparaissent dans la barre du haut. Pour le ranger ou le masquer parmi les autres onglets : Maintenance → Apparence → « Ordre du menu principal ».', '<button type="button" class="button secondary" data-ct-back>← Retour</button>')}
                <section class="maintenance-panel"><h3>1. L’onglet</h3><div class="form-grid">
                    <label>Nom<input data-ct="name" value="${esc(t.name || '')}" maxlength="40" placeholder="Ma Bretagne"></label>
                    <label>Icône<input data-ct="icon" value="${esc(t.icon || '')}" maxlength="16" class="h-be-icon" placeholder="🗂️"></label>
                    <label>Place dans la barre <select data-ct="after">${afterOptions.map(([v, l]) => `<option value="${esc(v)}" ${(t.after || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Sorte <select data-ct-kind><option value="page" ${t.kind !== 'screen' ? 'selected' : ''}>🧩 Page composée (écrans, widgets, statistiques, textes)</option><option value="screen" ${t.kind === 'screen' ? 'selected' : ''}>🔗 Raccourci vers un écran de l’app</option></select></label>
                    <label class="span-2">Texte en haut de la page <small>(facultatif)</small><textarea rows="2" data-ct="intro" maxlength="400" placeholder="À quoi sert cet onglet">${esc(t.intro || '')}</textarea></label></div></section>
                ${t.kind === 'screen'
                    ? `<section class="maintenance-panel"><h3>2. L’écran à ouvrir</h3><label>Écran <select data-ct="target">${screenTargets().map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([v, l]) => `<option value="${esc(v)}" ${t.target === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></label></section>`
                    : `<section class="maintenance-panel"><h3>2. Ce que montre la page</h3><p class="muted">Pose ce que tu veux, dans l’ordre que tu veux : un écran de l’app (une liste, un diagramme, une statistique, une fiche, la carte, une de tes listes…), un widget, une de tes statistiques, un texte. Chaque pièce a sa largeur ; un écran a aussi sa hauteur.</p>
                        ${t.widgets.length ? `<ol class="h-ct-widgets">${t.widgets.map((x, i) => pieceHtml(x, i, known)).join('')}</ol>` : '<p class="muted">La page est vide : ajoute une première pièce ci-dessous.</p>'}
                        <div class="h-ct-add"><label>+ Ajouter <select data-ct-wadd><option value="">choisir…</option>
                            <optgroup label="📝 Texte"><option value="note">Texte libre (titre, note, consigne)</option></optgroup>
                            ${screenTargets().map(([g, items]) => `<optgroup label="📺 ${esc(g)}">${items.map(([v, l]) => `<option value="screen|${esc(v)}">${esc(l)}</option>`).join('')}</optgroup>`).join('')}
                            ${myLists.length ? `<optgroup label="📋 Mes listes">${myLists.map(l => `<option value="screen|mylist:${Number(l.id)}">${esc((l.icon || '📋') + ' ' + l.name)}</option>`).join('')}</optgroup>` : ''}
                            <optgroup label="👤 Une personne"><option value="screen|person:">Fiche d’une personne…</option></optgroup>
                            ${(() => { const all = catalog().filter(([k]) => !['app_screen', 'tab_note'].includes(k)); const own = all.filter(([k]) => String(k).startsWith('cw_')); const appW = all.filter(([k]) => !String(k).startsWith('cw_')); return `${own.length ? `<optgroup label="✨ Mes widgets et statistiques">${own.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</optgroup>` : ''}<optgroup label="🧱 Widgets de l’app">${appW.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</optgroup>`; })()}</select></label>
                        <span class="h-ct-create"><span class="muted">Créer d’abord :</span><button type="button" class="button small secondary" data-ct-go="widget_editor">🧱 un widget</button><button type="button" class="button small secondary" data-ct-go="stats_editor">📊 une statistique</button><button type="button" class="button small secondary" data-ct-go="my_lists">📋 une liste</button><button type="button" class="button small secondary" data-ct-go="block_editor">🧩 un bloc de fiche</button></span></div></section>`}
                <div class="page-actions"><button type="button" class="button" data-ct-save>Enregistrer</button><button type="button" class="button secondary" data-ct-saveopen>Enregistrer et ouvrir</button><button type="button" class="button secondary" data-ct-back>Annuler</button></div></section>`;
            const ws = app.$('#workspace');
            ws.querySelectorAll('[data-ct-back]').forEach(b => b.addEventListener('click', refresh));
            ws.querySelectorAll('[data-ct]').forEach(el => el.addEventListener('input', () => { t[el.dataset.ct] = el.value; }));
            ws.querySelectorAll('select[data-ct]').forEach(el => el.addEventListener('change', () => { t[el.dataset.ct] = el.value; }));
            ws.querySelector('[data-ct-kind]').addEventListener('change', e => { t.kind = e.target.value; if (t.kind === 'screen' && !validTarget(t.target)) t.target = 'list:villages'; paint(); });
            ws.querySelector('[data-ct-wadd]')?.addEventListener('change', e => {
                const v = e.target.value; if (!v) return;
                if (v === 'note') t.widgets.push(note('', '', 6));
                else if (v.startsWith('screen|')) { const target = v.slice(7); t.widgets.push(sc(target, 12, 560, {sidebar: false})); }
                else t.widgets.push(w(v, ext.customWidgetDefs?.()?.[v]?.width || '6'));
                paint();
                setTimeout(() => { const last = [...ws.querySelectorAll('.h-ct-widgets > li')].pop(); last?.scrollIntoView({block: 'center'}); last?.querySelector('input:not([type=hidden]),textarea')?.focus(); }, 0);
            });
            ws.querySelectorAll('[data-ct-go]').forEach(b => b.addEventListener('click', () => { if (String(t.name || '').trim() || t.widgets.length) { const clean = cleanTab({...t, name: t.name || 'Mon onglet'}), list = tabs(), i = list.findIndex(x => x.id === clean.id); if (i >= 0) list[i] = clean; else list.push(clean); save(list); toast('Onglet gardé : reviens-y dans Maintenance → Éditeur d’onglets.'); } S().maintenanceTab = b.dataset.ctGo; A().setModule('maintenance'); }));
            ws.querySelectorAll('[data-ct-width]').forEach(el => el.addEventListener('change', () => { t.widgets[Number(el.dataset.ctWidth)].width = el.value; }));
            // réglages d'une pièce : écran, personne, hauteur, colonne de gauche ; titre et texte d'une note
            const cfgOf = i => (t.widgets[i].config ||= {});
            ws.querySelectorAll('[data-ct-p]').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
                const i = Number(el.closest('[data-ct-i]').dataset.ctI), k = el.dataset.ctP, c = cfgOf(i);
                c[k] = el.type === 'checkbox' ? el.checked : k === 'height' ? Number(el.value) || 560 : el.value;
                if (k === 'target') { if (el.value.startsWith('person:')) c.target = 'person:' + (Number(c.personId) || ''); paint(); }
            }));
            ws.querySelectorAll('[data-ct-i]').forEach(li => { const x = t.widgets[Number(li.dataset.ctI)]; if (x?.type === 'app_screen' && placeKind(x.config?.target)) bindPlace(li, cfgOf(Number(li.dataset.ctI))); });
            // la personne de l'écran « Fiche d'une personne » : menu de choix unique
            ws.querySelectorAll('[data-ct-i]').forEach(li => li.addEventListener('picker-change', e => {
                if (!String(e.detail.name).startsWith('ctp_person')) return;
                const i = Number(li.dataset.ctI), c = cfgOf(i), id = Number(e.detail.value) || 0;
                if (id && c.target !== 'person:' + id) { c.target = 'person:' + id; c.personId = id; c.personName = e.detail.item?.title || ''; }
            }));
            const swap = (i, j) => { [t.widgets[i], t.widgets[j]] = [t.widgets[j], t.widgets[i]]; paint(); };
            ws.querySelectorAll('[data-ct-wup]').forEach(b => b.addEventListener('click', () => swap(Number(b.dataset.ctWup), Number(b.dataset.ctWup) - 1)));
            ws.querySelectorAll('[data-ct-wdown]').forEach(b => b.addEventListener('click', () => swap(Number(b.dataset.ctWdown), Number(b.dataset.ctWdown) + 1)));
            ws.querySelectorAll('[data-ct-wdel]').forEach(b => b.addEventListener('click', () => { t.widgets.splice(Number(b.dataset.ctWdel), 1); paint(); }));
            const doSave = andOpen => {
                if (!String(t.name || '').trim()) { toast('Donne un nom à l’onglet.', 'error'); ws.querySelector('[data-ct="name"]').focus(); return; }
                const clean = cleanTab(t), list = tabs(), i = list.findIndex(x => x.id === clean.id);
                if (i < 0 || (list[i].after || '') !== clean.after) forgetMenuPlace(clean.id);
                if (i >= 0) list[i] = clean; else list.push(clean);
                save(list);
                toast('Onglet enregistré : il est dans la barre du haut.');
                if (andOpen) openTab(clean); else refresh();
            };
            ws.querySelector('[data-ct-save]').addEventListener('click', () => doSave(false));
            ws.querySelector('[data-ct-saveopen]').addEventListener('click', () => doSave(true));
        };
        paint();
    }

    /* ─── Nettoyage, partage, import ─── */
    function cleanTab(t) {
        const app = A();
        const types = new Set(catalog().map(([k]) => k));
        const cleanConfig = x => {
            const c = x.config && typeof x.config === 'object' ? x.config : {};
            if (x.type === 'app_screen') return {target: validTarget(c.target) ? c.target : 'module:carte', title: str(c.title, 120), personName: str(c.personName, 120), personId: Number(c.personId) || 0, height: Math.max(240, Math.min(2000, Number(c.height) || 560)), sidebar: !!c.sidebar, ...(validTarget(c.target) ? cleanPlace(c) : {})};
            if (x.type === 'tab_note') return {title: str(c.title, 120), text: str(c.text, 8000)};
            return c;
        };
        const widgets = (Array.isArray(t.widgets) ? t.widgets : []).filter(x => x && types.has(x.type)).slice(0, 60).map(x => app.dashboardNewWidget(x.type, {...x, config: cleanConfig(x)}));
        const kind = t.kind === 'screen' ? 'screen' : 'page';
        return {id: /^ct_[a-z0-9]{4,24}$/.test(String(t.id)) ? t.id : newId(), name: str(t.name, 40).trim(), icon: str(t.icon, 16), intro: str(t.intro, 400), kind,
            after: Object.keys(app.appModules).includes(t.after) && !['jeu', 'maintenance'].includes(t.after) ? t.after : '', hidden: !!t.hidden,
            target: kind === 'screen' && validTarget(t.target) ? t.target : '', widgets: kind === 'page' ? widgets : []};
    }
    function shareTab(t) {
        const own = (t.widgets || []).filter(x => String(x.type).startsWith('cw_')).length;
        const file = {kind: FILE_KIND, version: 1, tab: {name: t.name, icon: t.icon, intro: t.intro, kind: t.kind, after: t.after, target: t.target,
            widgets: (t.widgets || []).filter(x => !String(x.type).startsWith('cw_')).map(x => ({type: x.type, width: x.width, limit: x.limit, ...(['app_screen', 'tab_note'].includes(x.type) ? {config: x.config} : {})}))}};
        const name = `${String(t.name || 'onglet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'onglet'}.lcnda-onglet.json`;
        if (ext.downloadText) ext.downloadText(name, JSON.stringify(file, null, 2), 'application/json');
        if (own) toast(`${own} widget${own > 1 ? 's' : ''} à toi ne part${own > 1 ? 'ent' : ''} pas avec le fichier : partage-les depuis l’Éditeur de widgets.`);
    }
    function importTab(json) {
        if (!json || json.kind !== FILE_KIND || !json.tab) throw new Error('ce n’est pas un onglet LCNDA');
        const t = cleanTab({...json.tab, id: newId(), hidden: false, widgets: (json.tab.widgets || []).map(x => ({type: str(x?.type, 40), width: x?.width, limit: x?.limit, config: x?.config}))});
        if (!t.name) t.name = 'Onglet importé';
        return t;
    }
    setTimeout(loadMyLists, 2500); // pour nommer « Mes listes » posées dans un onglet
    ext.cleanCustomTab = t => cleanTab(t); // pour les tests
})();
