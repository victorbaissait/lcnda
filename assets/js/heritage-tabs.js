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
    const targetLabel = t => { for (const [, items] of screenTargets()) { const f = items.find(([v]) => v === t); if (f) return f[1]; } return t || '—'; };
    const validTarget = t => screenTargets().some(([, items]) => items.some(([v]) => v === t));

    /* ─── Modèles ─── */
    const TEMPLATES = [
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
                : A().empty('Aucun onglet à toi pour le moment : « + Nouvel onglet ».')}</section>`;
        const ws = A().$('#workspace'), find = id => list.find(t => t.id === id);
        ws.querySelector('[data-ct-new]').addEventListener('click', chooseStart);
        ws.querySelectorAll('[data-ct-edit]').forEach(b => b.addEventListener('click', () => editTab({...find(b.dataset.ctEdit)}, true)));
        ws.querySelectorAll('[data-ct-dup]').forEach(b => b.addEventListener('click', () => { const t = find(b.dataset.ctDup); editTab({...JSON.parse(JSON.stringify(t)), id: newId(), name: (t.name || 'Mon onglet') + ' (copie)'}, false); }));
        ws.querySelectorAll('[data-ct-open]').forEach(b => b.addEventListener('click', () => openTab(find(b.dataset.ctOpen))));
        ws.querySelectorAll('[data-ct-share]').forEach(b => b.addEventListener('click', () => shareTab(find(b.dataset.ctShare))));
        ws.querySelectorAll('[data-ct-hide]').forEach(b => b.addEventListener('click', () => { const t = find(b.dataset.ctHide); t.hidden = !t.hidden; menuHidden(t.id, t.hidden); save(list); refresh(); }));
        ws.querySelectorAll('[data-ct-del]').forEach(b => b.addEventListener('click', () => {
            const t = find(b.dataset.ctDel);
            if (!confirm(`Supprimer l’onglet « ${t.name || 'Mon onglet'} » ? Les widgets, listes et statistiques qu’il montrait ne sont pas supprimés.`)) return;
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
            body: `<h4>Partir de rien</h4><div class="h-templates">${tile('📄', 'Page vide', 'Tu ajoutes ensuite les widgets, tes listes et tes statistiques un par un.', 'data-ct-blank')}${tile('🔗', 'Raccourci vers un écran', 'Un onglet qui ouvre directement une liste, un diagramme, une statistique ou un outil.', 'data-ct-screen')}</div>
                <h4>Partir d’un onglet existant</h4><div class="h-templates">${tile('📊', 'Copie du tableau de bord', `Les ${board().widgets.length} widgets du tableau de bord, dans le même ordre, à arranger à ta façon.`, 'data-ct-dashboard')}${mine.map(t => tile(t.icon || '🗂️', t.name || 'Mon onglet', 'Un de mes onglets', `data-ct-mine="${esc(t.id)}"`)).join('')}</div>
                <h4>Modèles</h4><div class="h-templates">${TEMPLATES.map((t, i) => tile(t.icon, t.name, t.intro, `data-ct-tpl="${i}"`)).join('')}</div>`,
            onOpen: dlg => {
                const go = t => { dlg.close(); editTab({id: newId(), icon: '🗂️', intro: '', after: '', kind: 'page', widgets: [], ...JSON.parse(JSON.stringify(t))}, false); };
                dlg.querySelector('[data-ct-blank]').addEventListener('click', () => go({name: '', widgets: []}));
                dlg.querySelector('[data-ct-screen]').addEventListener('click', () => go({name: '', kind: 'screen', icon: '🔗', target: 'list:villages'}));
                dlg.querySelector('[data-ct-dashboard]').addEventListener('click', () => go({name: 'Mon tableau de bord', icon: '📊', widgets: board().widgets.map(x => ({type: x.type, width: x.width, limit: x.limit, config: x.config}))}));
                dlg.querySelectorAll('[data-ct-mine]').forEach(b => b.addEventListener('click', () => { const t = mine.find(x => x.id === b.dataset.ctMine); go({...t, id: newId(), hidden: false, name: (t.name || 'Mon onglet') + ' (copie)'}); }));
                dlg.querySelectorAll('[data-ct-tpl]').forEach(b => b.addEventListener('click', () => go(TEMPLATES[Number(b.dataset.ctTpl)])));
            },
        });
    }

    /* ─── Réglages d'un onglet ─── */
    function editTab(t, existing) {
        S().workspaceToken++;
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
                    <label>Sorte <select data-ct-kind><option value="page" ${t.kind !== 'screen' ? 'selected' : ''}>📄 Page de widgets</option><option value="screen" ${t.kind === 'screen' ? 'selected' : ''}>🔗 Raccourci vers un écran de l’app</option></select></label>
                    <label class="span-2">Texte en haut de la page <small>(facultatif)</small><textarea rows="2" data-ct="intro" maxlength="400" placeholder="À quoi sert cet onglet">${esc(t.intro || '')}</textarea></label></div></section>
                ${t.kind === 'screen'
                    ? `<section class="maintenance-panel"><h3>2. L’écran à ouvrir</h3><label>Écran <select data-ct="target">${screenTargets().map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([v, l]) => `<option value="${esc(v)}" ${t.target === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></label></section>`
                    : `<section class="maintenance-panel"><h3>2. Ce que montre la page</h3><p class="muted">Tu peux aussi ajouter, régler (crayon ✎) et ranger les widgets directement dans l’onglet, depuis sa colonne de gauche, comme sur le tableau de bord. Tes widgets, tes listes (widgets « Liste ») et tes statistiques se créent dans Maintenance → Éditeur de widgets / Éditeur de statistiques.</p>
                        ${t.widgets.length ? `<ol class="h-ct-widgets">${t.widgets.map((x, i) => `<li><span>${esc(known.get(x.type) || x.type)}${known.has(x.type) ? '' : ' <small class="muted">(n’existe plus ici)</small>'}</span><span class="h-saved-tools"><select data-ct-width="${i}" title="Largeur">${[['3', '¼'], ['4', '⅓'], ['6', '½'], ['8', '⅔'], ['12', 'toute la largeur']].map(([v, l]) => `<option value="${v}" ${String(x.width || '6') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="link-button" data-ct-wup="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="link-button" data-ct-wdown="${i}" ${i < t.widgets.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="link-button" data-ct-wdel="${i}">retirer</button></span></li>`).join('')}</ol>` : '<p class="muted">Aucun widget pour le moment.</p>'}
                        <label>+ Ajouter <select data-ct-wadd><option value="">choisir…</option>${(() => { const all = catalog(); const own = all.filter(([k]) => String(k).startsWith('cw_')); const appW = all.filter(([k]) => !String(k).startsWith('cw_')); return `${own.length ? `<optgroup label="Mes widgets, listes et statistiques">${own.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</optgroup>` : ''}<optgroup label="Widgets de l’app">${appW.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</optgroup>`; })()}</select></label></section>`}
                <div class="page-actions"><button type="button" class="button" data-ct-save>Enregistrer</button><button type="button" class="button secondary" data-ct-saveopen>Enregistrer et ouvrir</button><button type="button" class="button secondary" data-ct-back>Annuler</button></div></section>`;
            const ws = app.$('#workspace');
            ws.querySelectorAll('[data-ct-back]').forEach(b => b.addEventListener('click', refresh));
            ws.querySelectorAll('[data-ct]').forEach(el => el.addEventListener('input', () => { t[el.dataset.ct] = el.value; }));
            ws.querySelectorAll('select[data-ct]').forEach(el => el.addEventListener('change', () => { t[el.dataset.ct] = el.value; }));
            ws.querySelector('[data-ct-kind]').addEventListener('change', e => { t.kind = e.target.value; if (t.kind === 'screen' && !validTarget(t.target)) t.target = 'list:villages'; paint(); });
            ws.querySelector('[data-ct-wadd]')?.addEventListener('change', e => { if (!e.target.value) return; t.widgets.push(w(e.target.value, ext.customWidgetDefs?.()?.[e.target.value]?.width || '6')); paint(); });
            ws.querySelectorAll('[data-ct-width]').forEach(el => el.addEventListener('change', () => { t.widgets[Number(el.dataset.ctWidth)].width = el.value; }));
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
        const widgets = (Array.isArray(t.widgets) ? t.widgets : []).filter(x => x && types.has(x.type)).slice(0, 60).map(x => app.dashboardNewWidget(x.type, x));
        const kind = t.kind === 'screen' ? 'screen' : 'page';
        return {id: /^ct_[a-z0-9]{4,24}$/.test(String(t.id)) ? t.id : newId(), name: str(t.name, 40).trim(), icon: str(t.icon, 16), intro: str(t.intro, 400), kind,
            after: Object.keys(app.appModules).includes(t.after) && !['jeu', 'maintenance'].includes(t.after) ? t.after : '', hidden: !!t.hidden,
            target: kind === 'screen' && validTarget(t.target) ? t.target : '', widgets: kind === 'page' ? widgets : []};
    }
    function shareTab(t) {
        const own = (t.widgets || []).filter(x => String(x.type).startsWith('cw_')).length;
        const file = {kind: FILE_KIND, version: 1, tab: {name: t.name, icon: t.icon, intro: t.intro, kind: t.kind, after: t.after, target: t.target,
            widgets: (t.widgets || []).filter(x => !String(x.type).startsWith('cw_')).map(x => ({type: x.type, width: x.width, limit: x.limit}))}};
        const name = `${String(t.name || 'onglet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'onglet'}.lcnda-onglet.json`;
        if (ext.downloadText) ext.downloadText(name, JSON.stringify(file, null, 2), 'application/json');
        if (own) toast(`${own} widget${own > 1 ? 's' : ''} à toi ne part${own > 1 ? 'ent' : ''} pas avec le fichier : partage-les depuis l’Éditeur de widgets.`);
    }
    function importTab(json) {
        if (!json || json.kind !== FILE_KIND || !json.tab) throw new Error('ce n’est pas un onglet LCNDA');
        const t = cleanTab({...json.tab, id: newId(), hidden: false, widgets: (json.tab.widgets || []).map(x => ({type: str(x?.type, 40), width: x?.width, limit: x?.limit}))});
        if (!t.name) t.name = 'Onglet importé';
        return t;
    }
    ext.cleanCustomTab = t => cleanTab(t); // pour les tests
})();
