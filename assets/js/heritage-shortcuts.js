/**
 * 🔗 Widget « Raccourcis » (Éditeur de widgets, sorte « Raccourcis ») : des tuiles vers n'importe quoi.
 *  - n'importe quelle cible : un écran, un onglet à soi, une liste (avec ses filtres du moment), une personne, un lieu,
 *    une fiche (Fiches), une enquête, une battue, un projet de l'Atelier, un tableau, une mise en page, un média, un
 *    diagramme, un graphique, une maison, une carte, une transcription, une œuvre, une revue, un employeur, une source,
 *    une étiquette, un recensement, un outil, une action (« ＋ Nouvelle personne », « Sauvegarde »…), un projet d'un outil,
 *    un site web ; choisie avec le menu de choix unique (recherche mélangée) + « Écrans et outils » + « Site web » ;
 *  - plusieurs raccourcis par widget : ajouter, ranger (⠿ glisser ou ↑ ↓), retirer (↶ Annuler), renommer, icône,
 *    couleur (C2), vignette (photo de la personne, image du média, pochette…), intertitres ; disposition en tuiles,
 *    en liste ou en petits boutons, taille (C3) et nombre de colonnes ;
 *  - un clic ouvre la cible ; une cible supprimée donne une tuile grisée « introuvable » + « Retirer » ; petite info en
 *    direct (années d'une personne, nombre d'éléments d'une liste) : api shortcut_info (lib/widget_links.php) ;
 *  - « ⭐ Ajouter aux raccourcis » sur la fiche d'une personne et en haut des listes, des Fiches, des enquêtes, des
 *    Graphiques : on choisit dans quel widget de raccourcis l'ajouter (ou un nouveau, posé sur le tableau de bord) ;
 *  - « 💾 Réglages enregistrés » (outil « widget-raccourcis ») dans l'éditeur.
 * Les anciens raccourcis ({label, target: module:|list:|maint:|person:|url:}) restent tels quels (disposition « boutons »).
 * Chargé après heritage-widgets.js (qui l'appelle par ext.shortcuts) ; window.LCNDA_APP, LCNDA_PICKER, LCNDA_UI.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const PK = () => window.LCNDA_PICKER;
    const UI = () => window.LCNDA_UI;
    const S = () => A().state;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${Number(n) || 0} ${Math.abs(Number(n) || 0) < 2 ? one : (many || one + 's')}`);
    const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : '';
    const str = (v, n) => String(v ?? '').slice(0, n);
    const newLinkId = () => 'l_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const MAX_LINKS = 60;
    const LAYOUTS = [['grid', 'Tuiles en grille'], ['list', 'Liste'], ['buttons', 'Petits boutons sur une ligne']];
    const PRESETS_KEY = 'genealogie-shortcut-widget-presets', SETTING_TOOL = 'widget-raccourcis';

    /* ─── Les sortes de la base (menu de choix unique) : icône, nom, ouverture ─── */
    const go = async (fn) => { try { await fn(); } catch (e) { toast(e.message || String(e), 'error'); } };
    const listWith = async (type, q = '') => { // une liste ouverte avec un mot cherché (H10 : la barre le reprend)
        if (q) { try { const k = 'lcnda-listbar:listes:' + type, cur = JSON.parse(localStorage.getItem(k) || 'null') || {}; localStorage.setItem(k, JSON.stringify({...cur, q})); } catch (_) {} }
        S().listType = type; return A().setModule('listes');
    };
    const ENT = {
        person: {icon: '👤', label: 'Personne', thumb: true, open: id => A().openPersonById(id)},
        place: {icon: '📍', label: 'Lieu', open: (id, info) => { const st = S(); st.graphPlaceMonograph = {...(st.graphPlaceMonograph || {}), id, name: info?.name || info?.title || '', county: info?.county || '', country: info?.country || '', showEvents: true, showDigests: true, showBattues: true, showCemetery: true}; st.graphMode = 'place_monograph'; return A().setModule('graphiques'); }},
        sheet: {icon: '📒', label: 'Fiche', open: id => { S().ficheId = id; return A().setModule('fiches'); }},
        investigation: {icon: '🔍', label: 'Enquête', open: id => { const st = S(); st.enquetesTab = 'enquetes'; st.currentBattueId = 0; st.currentInvestigationId = id; st.investigationFolderId = 0; return A().setModule('enquetes'); }},
        battue: {icon: '🧭', label: 'Battue', open: id => { const st = S(); st.enquetesTab = 'battue'; st.currentInvestigationId = 0; st.currentBattueId = id; return A().setModule('enquetes'); }},
        atelier: {icon: '📚', label: 'Projet de l’Atelier', open: id => { const st = S(); st.atelier = {...(st.atelier && typeof st.atelier === 'object' ? st.atelier : {}), project: id, node: 'overview', sel: []}; st.enquetesTab = 'atelier'; st.currentInvestigationId = 0; st.currentBattueId = 0; return A().setModule('enquetes'); }},
        board: {icon: '🧩', label: 'Tableau', thumb: true, open: id => ext.openBoardById?.(id)},
        layout: {icon: '📐', label: 'Mise en page', open: id => ext.openLayoutDoc?.(id)},
        media: {icon: '🖼', label: 'Média', thumb: true, open: async id => { const [m] = await PK().loadMedia([id]).catch(() => []); if (m && A().openLightbox) A().openLightbox([m], 0, true); else toast('Ce média est introuvable.', 'error'); }},
        diagram: {icon: '🏛️', label: 'Diagramme', open: id => ext.openDiagram?.(id)},
        artwork: {icon: '🎨', label: 'Œuvre ou carrière', thumb: true, open: id => ext.artistCatalog?.openItem?.(id)},
        house: {icon: '🏠', label: 'Maison', thumb: true, open: id => ext.openHouse?.({id})},
        oldmap: {icon: '🗺️', label: 'Carte ancienne', thumb: true, open: async id => { S().listType = 'old_maps'; await A().setModule('listes'); return ext.lists?.old_maps?.(++S().workspaceToken, id); }},
        act: {icon: '📜', label: 'Transcription d’acte', thumb: true, open: id => ext.openActTranscriber?.({id})},
        periodical: {icon: '📰', label: 'Revue', open: (id, info) => listWith('periodicals', info?.title || '')},
        employer: {icon: '🏭', label: 'Employeur', open: (id, info) => (ext.openEmployer && info?.title ? ext.openEmployer(info.title) : listWith('employers', info?.title || ''))},
        source: {icon: '📚', label: 'Source', open: (id, info) => { if (Number(info?.open_person)) return A().openPersonById(Number(info.open_person)); toast(`« ${info?.title || 'Cette source'} » n’est citée sur aucune fiche pour l’instant.`); }},
        label: {icon: '🏷', label: 'Étiquette', open: (id, info) => listWith('labels', info?.title || '')},
        census: {icon: '📋', label: 'Recensement', open: () => listWith('census')},
    };
    const ENT_KINDS = Object.keys(ENT);
    // la recherche mélangée du menu de choix (les personnes et les lieux d'abord)
    const MIXED = ['person', 'place', 'sheet', 'investigation', 'battue', 'atelier', 'board', 'layout', 'media', 'diagram', 'graph', 'artwork', 'house', 'oldmap', 'act', 'periodical', 'employer', 'source', 'label', 'census'].join(',');

    /* ─── Outils et actions ─── */
    const enq = (tab, extra = {}) => () => { const st = S(); Object.assign(st, {enquetesTab: tab, currentInvestigationId: 0, currentBattueId: 0, ...extra}); if (tab === 'atelier' && st.atelier && typeof st.atelier === 'object') st.atelier.project = 0; return A().setModule('enquetes'); };
    const TOOLS = [
        ['retouche', '🎚️', 'Retouche des photos', () => ext.pickRetouch?.()],
        ['restaurer', '🧭', 'Restaurer une vieille photo', () => ext.openRestore?.()],
        ['montage', '🎬', 'Montage vidéo', () => ext.newMontage?.()],
        ['son', '🎧', 'Son (nouveau projet)', () => ext.newAudioProject?.()],
        ['dessin', '✒️', 'Dessin vectoriel', () => ext.openVectorEditor?.()],
        ['miseenpage', '📐', 'Atelier de mise en page (livres)', () => ext.openLayoutStudio?.()],
        ['diaporama', '🎞️', 'Présentation et diaporama', () => ext.openSlideshow?.()],
        ['fairepart', '📰', 'Faire-part et affiches', () => ext.openCardMaker?.()],
        ['sceaux', '🔤', 'Signatures et sceaux', () => ext.openSeals?.()],
        ['arbre', '🌳', 'Arbre décoratif', () => ext.openDecorTree?.()],
        ['assembler', '🧷', 'Assembler des photos', () => ext.openAssembler?.()],
        ['visages', '🙂', 'Visages (reconnaissance)', () => ext.openFaces?.()],
        ['musee', '🏛️', 'Musée de famille', () => ext.openMuseum?.()],
        ['transcription', '📜', 'Transcription d’actes', () => ext.openActTranscriber?.({})],
        ['puzzle', '🧩', 'Jeux et puzzle', () => A().setModule('jeu')],
        ['battues', '🧭', 'Battues', enq('battue')],
        ['atelier', '📚', 'Atelier de recherche', enq('atelier')],
        ['tableaux', '🧩', 'Tableaux (Freeform)', enq('tableaux', {currentBoardId: 0})],
        ['projets', '🛠️', 'Outils de modification (tous les projets)', () => listWith('edit_tools')],
    ].map(([key, icon, label, run]) => ({key, icon, label, run}));
    const ACTION_ICONS = {new_person: '＋', backup_now: '💾', quick_search: '🔍', settings: '🎨', help: '⌨️', print: '🖨️', new_window: '🪟', split: '◫'};
    const ACTION_LABELS = {new_person: '＋ Nouvelle personne', backup_now: 'Sauvegarde tout de suite'};
    function actions() {
        const kit = A()?.shortcutKit, out = [];
        (kit?.commands?.() || []).filter(c => ['global', 'any'].includes(c.ctx) && !['back', 'forward', 'find', 'split_orientation', 'switch_half', 'undo'].includes(c.id))
            .forEach(c => out.push({key: c.id, icon: ACTION_ICONS[c.id] || '⚡', label: ACTION_LABELS[c.id] || c.label, run: () => kit.run(c.id)}));
        if (!out.some(a => a.key === 'new_person') && A()?.openNewPersonDialog) out.unshift({key: 'new_person', icon: '＋', label: '＋ Nouvelle personne', run: () => A().openNewPersonDialog()});
        if (A()?.openBattueDialog) out.push({key: 'new_battue', icon: '🧭', label: '＋ Nouvelle battue', run: async () => { await enq('battue')(); A().openBattueDialog(); }});
        if (ext.atelierNewProject) out.push({key: 'new_atelier', icon: '📚', label: '＋ Nouveau projet de l’Atelier', run: async () => { await enq('atelier')(); ext.atelierNewProject(); }});
        out.push({key: 'new_widget', icon: '🧱', label: '＋ Nouveau widget', run: () => { S().maintenanceTab = 'widget_editor'; return A().setModule('maintenance'); }});
        return out;
    }
    const toolOf = key => TOOLS.find(t => t.key === key);
    const actionOf = key => actions().find(a => a.key === key);
    const editTools = () => { try { return ext.editToolsList?.() || []; } catch (_) { return []; } };

    /* ─── Cibles : forme, nom, icône ─── */
    const RE = {
        screen: /^(module|list|maint|graph|stat):[A-Za-z0-9_:-]{1,80}$/,
        mylist: /^mylist:\d{1,9}$/,
        tab: /^tab:ct_[a-z0-9]{4,24}$/,
        ent: new RegExp(`^(${ENT_KINDS.join('|')}):\\d{1,10}$`),
        mygraph: /^mygraph:cw_[a-z0-9]{4,24}$/,
        tool: /^tool:[a-z0-9_]{1,40}$/,
        action: /^action:[a-z0-9_]{1,40}$/,
        proj: /^proj:[a-z0-9_]{1,30}:\d{1,10}$/,
        head: /^head:$/,
        url: /^url:https?:\/\/[^\s"'<>`\\]{1,500}$/i,
    };
    const validTarget = t => typeof t === 'string' && t.length <= 520 && Object.values(RE).some(re => re.test(t));
    const typeOf = t => String(t || '').split(':')[0];
    /** une adresse web sûre (http, https seulement) ; sinon '' */
    const webUrl = t => { const v = String(t || '').replace(/^url:/, '').trim(); if (!/^https?:\/\//i.test(v) || /[\s"'<>`\\]/.test(v)) return ''; const s = A()?.safeUrl ? A().safeUrl(v) : v; return s === '#' ? '' : s; };
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
    const customTabs = () => { try { return A().customTabs?.() || []; } catch (_) { return []; } };
    const myGraphs = () => { try { return (ext.customWidgetList?.() || []); } catch (_) { return []; } };
    const SCREEN_ICONS = {module: '🧭', list: '📋', maint: '🛠️', graph: '🌳', stat: '📊', mylist: '📋'};
    /** ce que l'app sait dire d'une cible, sans le serveur : {label, icon, what} */
    function describe(t) {
        const ty = typeOf(t), v = String(t).slice(ty.length + 1);
        if (RE.url.test(t)) { const u = webUrl(t); return {label: host(u) || 'Site web', icon: '🌐', what: 'Site web'}; }
        if (RE.screen.test(t) || RE.mylist.test(t)) {
            const lab = ext.appScreen?.label ? ext.appScreen.label(t) : t;
            return {label: lab && lab !== t ? lab : t, icon: SCREEN_ICONS[ty] || '🧭', what: {module: 'Écran', list: 'Liste', maint: 'Maintenance', graph: 'Diagramme (Graphiques)', stat: 'Statistique', mylist: 'Une de mes listes'}[ty] || 'Écran'};
        }
        if (RE.tab.test(t)) { const tab = customTabs().find(x => x.id === v); return {label: tab?.name || 'Mon onglet', icon: tab?.icon || '🗂️', what: 'Onglet à toi'}; }
        if (RE.mygraph.test(t)) { const g = myGraphs().find(x => x.id === v); return {label: g?.name || 'Mon graphique', icon: g?.icon || '📈', what: 'Mon graphique'}; }
        if (RE.tool.test(t)) { const x = toolOf(v); return {label: x?.label || v, icon: x?.icon || '🛠️', what: 'Outil'}; }
        if (RE.action.test(t)) { const x = actionOf(v); return {label: x?.label || v, icon: x?.icon || '⚡', what: 'Action'}; }
        if (RE.proj.test(t)) { const [k] = v.split(':'); const x = editTools().find(e => e.key === k); return {label: x ? `Projet (${x.label})` : 'Projet', icon: x?.icon || '🛠️', what: x ? `Projet · ${x.label}` : 'Projet d’un outil'}; }
        if (RE.ent.test(t)) return {label: ENT[ty].label, icon: ENT[ty].icon, what: ENT[ty].label};
        if (RE.head.test(t)) return {label: 'Intertitre', icon: '', what: 'Intertitre'};
        return {label: t || 'Raccourci', icon: '🔗', what: ''};
    }
    /** existe encore ? (ce qui se vérifie sans le serveur) : true / false / null (on ne sait pas) */
    function existsLocal(t) {
        const ty = typeOf(t), v = String(t).slice(ty.length + 1);
        if (RE.screen.test(t)) { if (ty === 'module') return !!A()?.appModules && Object.prototype.hasOwnProperty.call(A().appModules, v) && v !== 'jeu'; return ext.appScreen?.valid ? !!ext.appScreen.valid(t) : null; }
        if (RE.tab.test(t)) return customTabs().some(x => x.id === v);
        if (RE.mygraph.test(t)) return myGraphs().some(x => x.id === v);
        if (RE.tool.test(t)) return !!toolOf(v);
        if (RE.action.test(t)) return !!actionOf(v);
        return null;
    }
    const canThumb = t => RE.ent.test(t) && !!ENT[typeOf(t)]?.thumb || RE.proj.test(t);
    // une vignette n'est prise que si elle vient des médias de l'app ou d'une image intégrée (jamais une adresse tapée)
    const safeThumb = u => /^media\/[A-Za-z0-9%._~\-/]{1,400}$/.test(String(u || '')) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]{20,400000}$/.test(String(u || '')) ? String(u) : '';

    /* ─── Nettoyage (Éditeur de widgets → cleanDef) ─── */
    function cleanView(v) {
        if (!v || typeof v !== 'object') return undefined;
        let f = {};
        try { const j = JSON.stringify(v.f && typeof v.f === 'object' && !Array.isArray(v.f) ? v.f : {}); if (j.length <= 4000) f = JSON.parse(j); } catch (_) { f = {}; }
        const out = {q: str(v.q, 200), f, sort: str(v.sort, 40), view: v.view === 'cards' ? 'cards' : 'list'};
        return out.q || out.sort || Object.keys(out.f).length || out.view === 'cards' ? out : undefined;
    }
    function cleanLink(l) {
        if (!l || typeof l !== 'object') return null;
        const target = String(l.target ?? '');
        if (!validTarget(target)) return null;
        const out = {id: /^l_[a-z0-9]{4,24}$/.test(String(l.id || '')) ? l.id : newLinkId(), label: str(l.label, 80), target};
        if (RE.head.test(target)) return {...out, label: out.label || 'Intertitre'};
        const name = str(l.name, 120); if (name) out.name = name;
        const icon = str(l.icon, 16).replace(/[<>]/g, ''); if (icon) out.icon = icon;
        const c = hex(l.color); if (c) out.color = c;
        if (l.thumb === false) out.thumb = false;
        if (typeOf(target) === 'list') { const vw = cleanView(l.view); if (vw) out.view = vw; }
        return out;
    }
    const cleanLinks = list => (Array.isArray(list) ? list : []).slice(0, MAX_LINKS).map(cleanLink).filter(Boolean);
    function cleanFields(d) {
        return {links: cleanLinks(d.links), lLayout: LAYOUTS.some(([k]) => k === d.lLayout) ? d.lLayout : 'buttons', lSize: Math.max(64, Math.min(240, Math.round(Number(d.lSize) || 112))),
            lCols: Math.max(0, Math.min(8, Math.round(Number(d.lCols) || 0))), lInfo: d.lInfo !== false};
    }

    /* ─── Données en direct (titre, vignette, introuvable, nombre) ─── */
    const projCache = new Map(); // outil → {at, rows}
    async function projRows(key) {
        const c = projCache.get(key); if (c && Date.now() - c.at < 30000) return c.rows;
        const tool = editTools().find(t => t.key === key); if (!tool?.load) return null;
        const rows = await tool.load().catch(() => null); if (rows) projCache.set(key, {at: Date.now(), rows}); return rows;
    }
    const imgOf = html => { const m = String(html || '').match(/<img[^>]+src="([^"]+)"/i); const u = m ? m[1].replace(/&amp;/g, '&') : ''; return safeThumb(u.startsWith('media/') ? u : u.startsWith('data:image/') ? u : ''); };
    async function load(d) {
        const links = (d?.links || []).filter(l => l && validTarget(l.target));
        const items = {};
        const targets = [...new Set(links.map(l => l.target).filter(t => RE.ent.test(t) || /^list:[a-z0-9_]{1,40}$/.test(t)))];
        if (targets.length) {
            try { Object.assign(items, (await api('shortcut_info', {targets: targets.join(',')})).items || {}); }
            catch (_) { /* hors ligne, consultation : les tuiles restent ouvrables, sans info */ }
        }
        const projs = links.filter(l => RE.proj.test(l.target));
        for (const key of [...new Set(projs.map(l => l.target.split(':')[1]))]) {
            const rows = await projRows(key); if (!rows) continue;
            projs.filter(l => l.target.split(':')[1] === key).forEach(l => { const id = Number(l.target.split(':')[2]), r = rows.find(x => Number(x.id) === id);
                items[l.target] = r ? {ok: true, title: r.name || '', short: r.info || '', thumb: imgOf(r.thumb)} : {ok: false}; });
        }
        return {sc: true, items};
    }

    /* ─── Affichage ─── */
    const infoText = (l, it) => {
        if (!it) return '';
        if (typeOf(l.target) === 'list') { const vw = l.view; if (vw && (vw.q || Object.keys(vw.f || {}).some(k => { const x = vw.f[k]; return x !== '' && x !== false && x != null && !(Array.isArray(x) && !x.length); }))) return vw.q ? `vue enregistrée · « ${vw.q} »` : 'vue enregistrée (filtres)'; return Number.isFinite(Number(it.count)) ? plural(Number(it.count), 'élément') : ''; }
        if (typeOf(l.target) === 'place') return it.county || it.short || '';
        return it.short || '';
    };
    function tileHtml(l, data, d, ctx) {
        if (RE.head.test(l.target)) return `<h5 class="h-sc-head">${esc(l.label || 'Intertitre')}</h5>`;
        const info = data?.items?.[l.target], desc = describe(l.target), local = existsLocal(l.target);
        const missing = (info && info.ok === false) || local === false || (RE.url.test(l.target) && !webUrl(l.target));
        const label = l.label || (info?.title) || l.name || desc.label;
        const icon = l.icon || info?.icon || desc.icon || '🔗';
        const thumb = !missing && l.thumb !== false && canThumb(l.target) ? safeThumb(info?.thumb) : '';
        const c = hex(l.color), style = c ? ` style="--sc-c:${c}"` : '';
        const ini = typeOf(l.target) === 'person' && !thumb && info?.initials ? String(info.initials).slice(0, 3) : '';
        const ic = thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async">` : `<span aria-hidden="true">${esc(ini || icon)}</span>`;
        const small = missing ? '<small class="h-sc-miss">introuvable</small>' : d.lInfo !== false ? (() => { const t = infoText(l, info); return t ? `<small>${esc(t)}</small>` : ''; })() : '';
        const inner = `<span class="h-sc-ic${thumb ? ' has-img' : ''}${ini ? ' is-ini' : ''}">${ic}</span><span class="h-sc-tx"><b>${esc(label)}</b>${small}</span>`;
        const cls = `h-sc-tile${missing ? ' is-missing' : ''}${c ? ' has-color' : ''}`;
        const tip = esc([desc.what, label].filter(Boolean).join(' · '));
        if (missing) return `<div class="${cls}"${style} data-sc-id="${esc(l.id || '')}" title="${tip}">${inner}${ctx.editable ? `<button type="button" class="button small secondary h-sc-rm" data-sc-remove="${esc(l.id || '')}" data-sc-t="${esc(l.target)}">Retirer</button>` : ''}</div>`;
        if (RE.url.test(l.target)) return `<a class="${cls}"${style} href="${esc(webUrl(l.target))}" target="_blank" rel="noopener noreferrer" data-sc-id="${esc(l.id || '')}" title="${tip} (nouvel onglet)">${inner}<span class="h-sc-ext" aria-hidden="true">↗</span></a>`;
        return `<button type="button" class="${cls}"${style} data-sc-go="${esc(l.target)}" data-sc-id="${esc(l.id || '')}" title="${tip}">${inner}</button>`;
    }
    function html(d, data) {
        const links = (d?.links || []).filter(l => l && validTarget(l.target));
        if (!links.length) return `<p class="muted h-sc-empty">Aucun raccourci pour l’instant. Ajoute-en avec le crayon ✎ (Éditeur de widgets) ou le bouton « ⭐ » d’une fiche ou d’une liste.</p>`;
        const layout = LAYOUTS.some(([k]) => k === d.lLayout) ? d.lLayout : 'buttons';
        const size = Math.max(64, Math.min(240, Number(d.lSize) || 112)), cols = Math.max(0, Math.min(8, Number(d.lCols) || 0));
        const ctx = {editable: !document.body?.classList?.contains('is-kiosk')};
        return `<div class="h-sc h-sc-${layout}${cols ? ' has-cols' : ''}" style="--sc-size:${size}px${cols ? `;--sc-cols:${cols}` : ''}">${links.map(l => tileHtml(l, data?.sc ? data : null, d, ctx)).join('')}</div>`;
    }

    /* ─── Ouvrir une cible ─── */
    const LB = 'lcnda-listbar:';
    async function openTarget(t, link = {}) {
        if (!validTarget(t) || RE.head.test(t)) return;
        const ty = typeOf(t), v = t.slice(ty.length + 1);
        document.querySelectorAll('dialog[open].h-sc-dlg').forEach(dl => { try { dl.close(); } catch (_) {} });
        if (RE.url.test(t)) { const u = webUrl(t); if (u) window.open(u, '_blank', 'noopener,noreferrer'); return; }
        if (RE.screen.test(t) || RE.mylist.test(t)) {
            const vw = ty === 'list' ? cleanView(link.view) : undefined; // une vue relue de la base : nettoyée (bornée) avant d'aller dans la barre de la liste
            if (vw) { try { localStorage.setItem(LB + 'listes:' + v, JSON.stringify(vw)); } catch (_) {} }
            if (existsLocal(t) === false) return toast('Cet écran n’existe plus.', 'error');
            return go(() => A().openCustomScreen(t));
        }
        if (RE.tab.test(t)) { const tab = customTabs().find(x => x.id === v); if (!tab) return toast('Cet onglet n’existe plus.', 'error'); if (tab.kind === 'screen') return go(() => A().openCustomScreen(tab.target)); S().dashboardBoard = tab.id; return go(() => A().setModule('dashboard')); }
        if (RE.mygraph.test(t)) return go(() => ext.openMyGraph?.(v));
        if (RE.tool.test(t)) { const x = toolOf(v); return x ? go(x.run) : toast('Cet outil n’existe plus.', 'error'); }
        if (RE.action.test(t)) { const x = actionOf(v); return x ? go(x.run) : toast('Cette action n’existe plus.', 'error'); }
        if (RE.proj.test(t)) { const [k, id] = v.split(':'); const tool = editTools().find(x => x.key === k); return tool?.open ? go(() => tool.open(Number(id), () => {})) : toast('Cet outil n’est pas disponible ici.', 'error'); }
        if (RE.ent.test(t)) {
            const id = Number(v); let info = link._info;
            if (!info && ['place', 'source', 'periodical', 'employer', 'label'].includes(ty)) { try { info = (await api('shortcut_info', {targets: t})).items?.[t]; } catch (_) {} }
            if (info && info.ok === false) return toast('Cette fiche a été supprimée : tu peux retirer le raccourci.', 'error');
            return go(() => ENT[ty].open(id, info || {title: link.label || link.name || ''}));
        }
    }
    const canOpen = kind => ['sheet', 'atelier', 'board', 'layout', 'diagram', 'oldmap', 'act', 'place', 'periodical', 'employer', 'source', 'label', 'census'].includes(kind);

    /* ─── Où sont les raccourcis : chaque widget « Raccourcis » (ou partie « Raccourcis » d'un widget) ─── */
    function homes() {
        const out = [];
        myGraphs().forEach(d => {
            if (d.kind === 'links') out.push({def: d, part: -1, box: d, name: d.name || 'Mes raccourcis', icon: d.icon || '🔗'});
            (d.parts || []).forEach((p, i) => { if (p.kind === 'links') out.push({def: d, part: i, box: p, name: `${d.name || 'Mon widget'} — ${p.title || 'Partie ' + (i + 2)}`, icon: d.icon || '🔗'}); });
        });
        return out;
    }
    const copyDefs = () => JSON.parse(JSON.stringify(myGraphs()));
    const boxOf = (list, id, part) => { const d = list.find(x => x.id === id); return d ? (part < 0 ? d : d.parts?.[part]) : null; };
    /** retire un raccourci d'un widget enregistré (bouton « Retirer » d'une tuile introuvable) → ↶ Annuler */
    function removeSaved(linkId, target) {
        const list = copyDefs();
        for (const d of list) for (const [pi, box] of [[-1, d], ...(d.parts || []).map((p, i) => [i, p])]) {
            if (box.kind !== 'links' || !Array.isArray(box.links)) continue;
            const i = box.links.findIndex(l => (linkId && l.id === linkId) || (!l.id && l.target === target));
            if (i < 0) continue;
            const before = copyDefs(), [gone] = box.links.splice(i, 1);
            ext.saveCustomWidgetList(list);
            A().undoToast?.(`Raccourci « ${gone.label || gone.name || describe(gone.target).label} » retiré`, {undo: () => { ext.saveCustomWidgetList(before); rerender(); }, redo: () => { ext.saveCustomWidgetList(list); rerender(); }});
            return pi;
        }
        return null;
    }
    const rerender = () => { const st = S(); if (['dashboard', 'fiches'].includes(st.module)) A().setModule(st.module, false); };
    function findLink(id) { for (const h of homes()) { const l = (h.box.links || []).find(x => x.id === id); if (l) return l; } return null; }

    document.addEventListener('click', e => {
        const rm = e.target.closest?.('[data-sc-remove]');
        if (rm) { e.preventDefault(); e.stopPropagation(); const tile = rm.closest('.h-sc-tile'); if (removeSaved(rm.dataset.scRemove, rm.dataset.scT) !== null) tile?.remove(); else toast('Ce raccourci est déjà retiré.'); return; }
        const b = e.target.closest?.('[data-sc-go]');
        if (!b || b.closest('[data-sc-ed]')) return;
        e.preventDefault();
        const l = (b.dataset.scId && findLink(b.dataset.scId)) || {};
        openTarget(b.dataset.scGo, l);
    });

    /* ─── Fenêtre « Ajouter des raccourcis » : menu de choix (recherche mélangée) · Écrans et outils · Site web ─── */
    function catalog() {
        const rows = [], push = (group, target, label, icon, hint = '') => { if (validTarget(target)) rows.push({group, target, label, icon, hint}); };
        const groups = (() => { try { return ext.appScreen?.targets?.() || []; } catch (_) { return []; } })();
        const iconOf = {Écrans: '🧭', Listes: '📋', Maintenance: '🛠️'};
        groups.forEach(([g, items]) => items.forEach(([t, l]) => { if (t === 'module:jeu') return; push(g, t, l, iconOf[g] || (t.startsWith('graph:') ? '🌳' : t.startsWith('stat:') ? '📊' : '🧭'), g); }));
        if (!groups.length && A()?.appModules) Object.entries(A().appModules).filter(([k]) => k !== 'jeu').forEach(([k, v]) => push('Écrans', 'module:' + k, v[1], '🧭', 'Écran'));
        customTabs().forEach(t => push('Onglets à toi', 'tab:' + t.id, t.name || 'Mon onglet', t.icon || '🗂️', 'Onglet à toi'));
        TOOLS.forEach(t => push('Outils', 'tool:' + t.key, t.label, t.icon, 'Outil'));
        actions().forEach(a => push('Actions', 'action:' + a.key, a.label, a.icon, 'Action'));
        return rows;
    }
    const markText = (text, q) => { const P = PK(); return P?.markText ? P.markText(text, q) : esc(text); };
    function chooseTargets({title = 'Ajouter des raccourcis', eyebrow = 'RACCOURCIS'} = {}) {
        if (!ext.openDialog || !PK()?.pickerField) { toast('La fenêtre n’est pas encore prête. Réessaie dans un instant.', 'error'); return Promise.resolve(null); }
        return new Promise(resolve => {
            let done = false, tab = 'base', q = '', cat = catalog(), projLoaded = false, act = -1;
            const picks = {base: [], screens: new Map(), web: []};
            const total = () => picks.base.length + picks.screens.size + picks.web.length;
            const finish = v => { if (done) return; done = true; resolve(v); };
            const body = `<div class="segmented h-sc-tabs" role="tablist">${[['base', '🔎 Dans ta base'], ['screens', '🧭 Écrans et outils'], ['web', '🌐 Site web']].map(([k, l], i) => `<button type="button" role="tab" class="${i ? '' : 'is-active'}" data-sc-tab="${k}" aria-selected="${i ? 'false' : 'true'}">${l}</button>`).join('')}</div>
                <section class="h-sc-pane" data-sc-pane="base"><p class="muted">Une personne, un lieu, une fiche, une enquête, un projet, un tableau, un livre, un média, un diagramme, une maison… Les filtres en haut de la liste rangent par sorte (Tab passe de l’un à l’autre).</p>
                    <span class="pk-lab">Chercher dans ta base</span>${PK().pickerField({name: '', hiddenName: false, kind: MIXED, multiple: true, inline: true, allowCreate: false, placeholder: 'Une personne, un lieu, une enquête… (2 lettres suffisent)'})}</section>
                <section class="h-sc-pane" data-sc-pane="screens" hidden><div data-sc-qslot></div><div class="h-sc-cat" data-sc-cat role="listbox" aria-multiselectable="true"></div></section>
                <section class="h-sc-pane" data-sc-pane="web" hidden><div class="form-grid"><label class="span-2">Adresse du site<input data-sc-url type="url" inputmode="url" maxlength="500" placeholder="https://www.geneanet.org/" autocomplete="off" spellcheck="false"></label>
                    <label class="span-2">Nom du raccourci <small>(facultatif)</small><input data-sc-urlname maxlength="80" placeholder="Geneanet"></label></div><div data-sc-urlmsg></div>
                    <p><button type="button" class="button small" data-sc-urladd>＋ Ajouter ce site</button></p><ul class="h-sc-webpicked" data-sc-webpicked></ul></section>
                <p class="h-sc-count" data-sc-count aria-live="polite">Aucun raccourci choisi pour l’instant.</p>`;
            const dlg = ext.openDialog({eyebrow, title, wide: true, submitLabel: 'Ajouter', body,
                onOpen: dg => {
                    dg.classList.add('h-sc-dlg');
                    const $ = s => dg.querySelector(s);
                    const count = () => { const n = total(), sub = dg.querySelector('[type=submit]'); $('[data-sc-count]').textContent = n ? `${plural(n, 'raccourci choisi', 'raccourcis choisis')} : ${[...picks.base.map(i => i.title), ...[...picks.screens.values()].map(r => r.label), ...picks.web.map(w => w.label || host(webUrl(w.target)))].slice(0, 6).join(', ')}${n > 6 ? '…' : ''}` : 'Aucun raccourci choisi pour l’instant.'; if (sub) { sub.textContent = n ? `Ajouter (${n})` : 'Ajouter'; sub.disabled = !n; } };
                    count();
                    dg.addEventListener('picker-change', e => { if (!e.target.closest('[data-sc-pane="base"]')) return; picks.base = (e.detail.items || (e.detail.item ? [e.detail.item] : [])).filter(i => i && !i.free && (i.id || i.uid)); count(); });
                    const setTab = k => { tab = k; dg.querySelectorAll('[data-sc-tab]').forEach(b => { const on = b.dataset.scTab === k; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); dg.querySelectorAll('[data-sc-pane]').forEach(p => { p.hidden = p.dataset.scPane !== k; });
                        if (k === 'screens') { paintCat(); loadProjects(); setTimeout(() => $('[data-sc-qslot] input')?.focus(), 0); } if (k === 'web') setTimeout(() => $('[data-sc-url]')?.focus(), 0); if (k === 'base') setTimeout(() => $('[data-sc-pane="base"] .pk-input')?.focus(), 0); };
                    dg.querySelectorAll('[data-sc-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.scTab)));
                    // 🔍 C1 : la case de recherche des écrans
                    const slot = $('[data-sc-qslot]');
                    if (UI()?.searchField) { const sf = UI().searchField({placeholder: 'Chercher un écran, une liste, un outil… (ex. carte, sauvegarde, retouche)', value: '', delay: 120, onInput: v => { q = v; act = -1; paintCat(); }}); slot.appendChild(sf); sf.input?.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); moveAct(1); } else if (e.key === 'Enter') { e.preventDefault(); if (act < 0) moveAct(1); toggleAct(); } }); }
                    else { slot.innerHTML = '<input type="search" data-sc-q placeholder="Chercher un écran, une liste, un outil…">'; slot.querySelector('input').addEventListener('input', e => { q = e.target.value; paintCat(); }); }
                    const shown = () => { const words = fold(q).split(/\s+/).filter(Boolean); return cat.filter(r => words.every(w => fold(`${r.label} ${r.group} ${r.hint}`).includes(w))); };
                    function paintCat() {
                        const rows = shown(), box = $('[data-sc-cat]'); let g = '', out = '';
                        rows.slice(0, 400).forEach((r, i) => { if (r.group !== g) { g = r.group; out += `<div class="h-sc-catg">${esc(g)}</div>`; } const on = picks.screens.has(r.target);
                            out += `<button type="button" class="h-sc-catrow${on ? ' is-on' : ''}${i === act ? ' is-act' : ''}" role="option" aria-selected="${on ? 'true' : 'false'}" data-sc-i="${i}"><span class="h-sc-catic" aria-hidden="true">${esc(r.icon)}</span><span class="h-sc-catname">${markText(r.label, q)}</span><small>${esc(r.hint)}</small><span class="h-sc-catck" aria-hidden="true">${on ? '✓' : '＋'}</span></button>`; });
                        box.innerHTML = rows.length ? `<p class="h-sc-catn">${plural(rows.length, 'écran ou outil trouvé', 'écrans ou outils trouvés')}</p>${out}` : `<p class="muted">Rien pour « ${esc(q)} ». Vérifie l’orthographe, ou cherche dans ta base (premier onglet).</p>`;
                        box._rows = rows;
                    }
                    const moveAct = step => { const rows = $('[data-sc-cat]')._rows || []; if (!rows.length) return; act = Math.max(0, Math.min(rows.length - 1, act + step)); paintCat(); $('[data-sc-cat] .is-act')?.scrollIntoView({block: 'nearest'}); };
                    const toggleAct = (i = act) => { const r = ($('[data-sc-cat]')._rows || [])[i]; if (!r) return; if (picks.screens.has(r.target)) picks.screens.delete(r.target); else picks.screens.set(r.target, r); act = i; paintCat(); count(); };
                    $('[data-sc-cat]').addEventListener('click', e => { const r = e.target.closest('[data-sc-i]'); if (r) { e.preventDefault(); toggleAct(Number(r.dataset.scI)); } });
                    $('[data-sc-cat]').addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveAct(e.key === 'ArrowDown' ? 1 : -1); $('[data-sc-cat] .is-act')?.focus(); } });
                    async function loadProjects() {
                        if (projLoaded) return; projLoaded = true;
                        const tools = editTools(); if (!tools.length) return;
                        const res = await Promise.all(tools.map(async t => ({t, rows: await projRows(t.key).catch(() => null)})));
                        if (done) return;
                        res.forEach(({t, rows}) => (rows || []).slice(0, 200).forEach(r => cat.push({group: `Projets : ${t.label}`, target: `proj:${t.key}:${Number(r.id)}`, label: String(r.name || 'Sans titre'), icon: t.icon || '🛠️', hint: String(r.info || '').slice(0, 80)})));
                        cat = cat.filter(r => validTarget(r.target));
                        if (tab === 'screens') paintCat();
                    }
                    // 🌐 site web : http(s) seulement
                    const urlMsg = (k, t) => { $('[data-sc-urlmsg]').innerHTML = UI()?.notice ? UI().notice(k, t) : `<p>${esc(t)}</p>`; };
                    const paintWeb = () => { $('[data-sc-webpicked]').innerHTML = picks.web.map((w, i) => `<li>🌐 <b>${esc(w.label || host(webUrl(w.target)))}</b> <small>${esc(webUrl(w.target))}</small> <button type="button" class="icon-button small" data-sc-webdel="${i}" title="Retirer" aria-label="Retirer">×</button></li>`).join(''); };
                    const addWeb = () => {
                        let raw = $('[data-sc-url]').value.trim();
                        if (!raw) { urlMsg('warn', 'Écris l’adresse du site (par ex. https://www.geneanet.org/).'); return; }
                        if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw; // « geneanet.org » → https://geneanet.org
                        const t = 'url:' + raw;
                        if (!RE.url.test(t) || !webUrl(t)) { urlMsg('error', 'Cette adresse n’est pas un site web : elle doit commencer par https:// ou http://.'); return; }
                        picks.web.push({target: t, label: str($('[data-sc-urlname]').value.trim(), 80)});
                        $('[data-sc-url]').value = ''; $('[data-sc-urlname]').value = ''; urlMsg('ok', 'Site ajouté à ta sélection.'); paintWeb(); count();
                    };
                    $('[data-sc-urladd]').addEventListener('click', addWeb);
                    [$('[data-sc-url]'), $('[data-sc-urlname]')].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addWeb(); } }));
                    $('[data-sc-webpicked]').addEventListener('click', e => { const b = e.target.closest('[data-sc-webdel]'); if (b) { picks.web.splice(Number(b.dataset.scWebdel), 1); paintWeb(); count(); } });
                    dg.addEventListener('close', () => finish(null));
                    setTimeout(() => $('[data-sc-pane="base"] .pk-input')?.focus(), 30);
                },
                onSubmit: () => {
                    const out = [
                        ...picks.base.map(it => ({target: it.kind === 'graph' ? `mygraph:${it.uid}` : `${it.kind === 'animal' ? 'person' : it.kind}:${Number(it.id)}`, label: '', name: str(it.title, 120)})),
                        ...[...picks.screens.values()].map(r => ({target: r.target, label: '', name: str(r.label, 120)})),
                        ...picks.web.map(w => ({target: w.target, label: w.label || '', name: host(webUrl(w.target))})),
                    ].map(cleanLink).filter(Boolean);
                    if (!out.length) { toast('Choisis au moins un raccourci.', 'error'); return false; }
                    finish(out);
                }});
            dlg?.addEventListener('close', () => finish(null));
        });
    }

    /* ─── Éditeur (Éditeur de widgets → 2. Raccourcis) ─── */
    function rowHtml(l, i, n) {
        const tools = `<span class="h-sc-rowtools"><button type="button" class="icon-button small" data-sc-up title="Monter" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button small" data-sc-down title="Descendre" aria-label="Descendre" ${i < n - 1 ? '' : 'disabled'}>↓</button><button type="button" class="icon-button small danger" data-sc-del title="Retirer ce raccourci" aria-label="Retirer">✕</button></span>`;
        const grip = ''; // ⠿ : la poignée commune (heritage-dnd.js) se pose devant chaque ligne qui a ↑ ↓
        if (RE.head.test(l.target)) return `<li class="h-sc-row is-head" data-sc-row="${i}">${grip}<span class="h-sc-prev" aria-hidden="true">¶</span><span class="h-sc-rowmain"><input data-sc-f="label" value="${esc(l.label || '')}" maxlength="80" placeholder="Intertitre" aria-label="Intertitre"><small>Intertitre (sépare des groupes de raccourcis)</small></span>${tools}</li>`;
        const desc = describe(l.target), web = RE.url.test(l.target);
        return `<li class="h-sc-row" data-sc-row="${i}">${grip}<span class="h-sc-prev" aria-hidden="true">${esc(l.icon || desc.icon)}</span>
            <span class="h-sc-rowmain"><input data-sc-f="label" value="${esc(l.label || '')}" maxlength="80" placeholder="${esc(l.name || desc.label)}" aria-label="Nom du raccourci (vide = le nom de la cible)">
            <small>${esc(desc.what)}${web ? ` · ${esc(webUrl(l.target))}` : l.name && l.name !== desc.label ? ` · ${esc(l.name)}` : desc.what !== desc.label ? ` · ${esc(desc.label)}` : ''}${l.view ? ' · vue enregistrée' : ''}</small></span>
            <span class="h-sc-rowopts"><input class="h-be-icon h-sc-icon" data-sc-f="icon" value="${esc(l.icon || '')}" maxlength="16" placeholder="${esc(desc.icon)}" title="Icône ou émoji (vide = celle de la cible)" aria-label="Icône ou émoji">
            <span class="h-sc-colorslot" data-sc-color="${i}"></span>
            ${canThumb(l.target) ? `<label class="checkbox-line h-sc-thumbck" title="Montrer la photo ou l’image de la cible quand elle en a une"><input type="checkbox" data-sc-f="thumb" ${l.thumb !== false ? 'checked' : ''}> image</label>` : ''}</span>${tools}</li>`;
    }
    function editorHtml(d) {
        d.links = Array.isArray(d.links) ? d.links : [];
        const n = d.links.length;
        return `<div class="h-sc-ed" data-sc-ed>
            <div class="form-grid h-sc-opts"><label>Disposition<select data-sc-opt="lLayout">${LAYOUTS.map(([k, l]) => `<option value="${k}" ${(d.lLayout || 'buttons') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Colonnes<select data-sc-opt="lCols"><option value="0">automatique (selon la largeur)</option>${[1, 2, 3, 4, 5, 6, 7, 8].map(c => `<option value="${c}" ${Number(d.lCols) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
                <div class="span-2" data-sc-sizeslot></div>
                <label class="checkbox-line span-2"><input type="checkbox" data-sc-opt="lInfo" ${d.lInfo !== false ? 'checked' : ''}> Petite info en direct (années d’une personne, nombre d’éléments d’une liste…)</label></div>
            <p class="h-sc-n">${n ? `${plural(n, 'raccourci')} · ⠿ glisse ou ↑ ↓ pour ranger` : 'Aucun raccourci pour l’instant.'}</p>
            <ol class="h-sc-rows" data-sc-rows>${d.links.map((l, i) => rowHtml(l, i, n)).join('')}</ol>
            <p class="h-sc-addbar"><button type="button" class="button small" data-sc-add ${n >= MAX_LINKS ? 'disabled' : ''}>＋ Ajouter des raccourcis…</button><button type="button" class="button small secondary" data-sc-addhead ${n >= MAX_LINKS ? 'disabled' : ''}>＋ Intertitre</button></p>
            <details class="h-sc-presets" data-sc-presets><summary>💾 Réglages enregistrés</summary>${presetsHtml()}</details></div>`;
    }
    const presets = () => { try { const v = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); return Array.isArray(v) ? v.filter(p => p && typeof p.name === 'string' && p.data) : []; } catch (_) { return []; } };
    const savePresets = l => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(l.slice(0, 50))); } catch (_) {} };
    const presetData = d => { const c = cleanFields(d); return {links: c.links.map(({id, ...l}) => l), lLayout: c.lLayout, lSize: c.lSize, lCols: c.lCols, lInfo: c.lInfo}; };
    function presetsHtml() {
        const l = presets(), A_ = A();
        return `<p class="muted">Garde ces raccourcis et leur disposition sous un nom, pour les reprendre dans un autre widget, ou les donner (fichier).</p>
            <div class="h-sc-presetbar"><select data-sc-pset aria-label="Réglages enregistrés"><option value="">— choisir —</option>${l.map((p, i) => `<option value="${i}">${esc(p.name)} (${plural((p.data.links || []).length, 'raccourci')})</option>`).join('')}</select>
            <button type="button" class="button small secondary" data-sc-papply>Appliquer</button>${A_?.settingExportButton ? A_.settingExportButton('data-sc-pexport') : ''}<button type="button" class="icon-button small danger" data-sc-pdel title="Supprimer ce réglage" aria-label="Supprimer ce réglage">🗑</button></div>
            <p class="h-sc-presetbar"><button type="button" class="button small secondary" data-sc-psave>💾 Enregistrer sous un nom…</button>${A_?.settingImportButton ? A_.settingImportButton('data-sc-pimport') : ''}</p>`;
    }
    function applyPreset(d, data) {
        const c = cleanFields({...data, links: (data.links || []).map(l => ({...l, id: ''}))});
        d.links = c.links; d.lLayout = c.lLayout; d.lSize = c.lSize; d.lCols = c.lCols; d.lInfo = c.lInfo;
    }
    function bindEditor(box, d, {again, preview} = {}) {
        const ed = box?.querySelector('[data-sc-ed]'); if (!ed) return;
        d.links = Array.isArray(d.links) ? d.links : [];
        const redraw = () => (again ? again() : null), show = () => (preview ? preview() : null);
        // C3 : taille des tuiles
        const slot = ed.querySelector('[data-sc-sizeslot]');
        if (UI()?.rangeField && slot) { const r = UI().rangeField({label: 'Taille des tuiles', min: 64, max: 240, step: 4, value: Number(d.lSize) || 112, unit: 'px', default: 112}); slot.appendChild(r); const inp = r.input || r.querySelector('input[type=range]'); inp?.addEventListener('input', () => { d.lSize = Number(inp.value) || 112; show(); }); }
        else if (slot) { slot.innerHTML = `<label>Taille des tuiles <input type="range" min="64" max="240" step="4" value="${Number(d.lSize) || 112}" data-sc-opt="lSize"></label>`; }
        // C2 : couleur de chaque raccourci
        ed.querySelectorAll('[data-sc-color]').forEach(s => {
            const l = d.links[Number(s.dataset.scColor)]; if (!l) return;
            if (UI()?.colorField) { const f = UI().colorField({value: hex(l.color), allowNone: true, compact: true}); f.title = 'Couleur de la tuile'; s.appendChild(f); f.input.addEventListener('change', () => { l.color = hex(f.input.value); show(); }); }
            else { s.innerHTML = `<input type="color" value="${esc(hex(l.color) || '#0066cc')}" title="Couleur de la tuile">`; s.firstChild.addEventListener('change', e => { l.color = hex(e.target.value); show(); }); }
        });
        ed.addEventListener('change', e => {
            const o = e.target.dataset.scOpt;
            if (o === 'lLayout') d.lLayout = e.target.value;
            else if (o === 'lCols') d.lCols = Number(e.target.value) || 0;
            else if (o === 'lInfo') d.lInfo = e.target.checked;
            else if (o === 'lSize') d.lSize = Number(e.target.value) || 112;
            const row = e.target.closest('[data-sc-row]');
            if (row && e.target.dataset.scF === 'thumb') d.links[Number(row.dataset.scRow)].thumb = e.target.checked ? undefined : false;
        });
        ed.addEventListener('input', e => {
            const row = e.target.closest('[data-sc-row]'), f = e.target.dataset.scF; if (!row || !f || f === 'thumb') return;
            const l = d.links[Number(row.dataset.scRow)]; if (!l) return;
            l[f] = e.target.value;
            if (f === 'icon') row.querySelector('.h-sc-prev').textContent = e.target.value || describe(l.target).icon;
        });
        // le nom, l'image et l'état de chaque cible, lus en direct (une fiche renommée ou supprimée se voit ici aussi)
        load(d).then(data => {
            if (!ed.isConnected) return;
            ed.querySelectorAll('[data-sc-row]').forEach(r => {
                const l = d.links[Number(r.dataset.scRow)], it = l && data.items[l.target]; if (!it) return;
                const small = r.querySelector('.h-sc-rowmain small'), inp = r.querySelector('[data-sc-f="label"]'), what = describe(l.target).what;
                if (it.ok === false) { small.textContent = `${what} · introuvable (supprimé ?)`; small.classList.add('h-sc-miss'); return; }
                if (it.title) { l.name = str(it.title, 120); inp.placeholder = it.title; small.textContent = `${what} · ${it.title}${it.short ? ' · ' + it.short : ''}${l.view ? ' · vue enregistrée' : ''}`; }
                const th = l.thumb !== false && canThumb(l.target) ? safeThumb(it.thumb) : '';
                if (th && !l.icon) { const pv = r.querySelector('.h-sc-prev'); pv.textContent = ''; const img = document.createElement('img'); img.src = th; img.alt = ''; pv.appendChild(img); }
            });
        }).catch(() => {});
        const move = (i, to) => { if (to < 0 || to >= d.links.length || i === to) return; const [x] = d.links.splice(i, 1); d.links.splice(to, 0, x); redraw(); };
        ed.addEventListener('click', async e => {
            const row = e.target.closest('[data-sc-row]'), i = row ? Number(row.dataset.scRow) : -1;
            if (e.target.closest('[data-sc-up]')) return move(i, i - 1);
            if (e.target.closest('[data-sc-down]')) return move(i, i + 1);
            if (e.target.closest('[data-sc-del]')) {
                const [gone] = d.links.splice(i, 1); redraw();
                A().undoToast?.(`Raccourci « ${gone.label || gone.name || describe(gone.target).label} » retiré`, {undo: () => { d.links.splice(Math.min(i, d.links.length), 0, gone); redraw(); }, redo: () => { const j = d.links.indexOf(gone); if (j >= 0) d.links.splice(j, 1); redraw(); }});
                return;
            }
            if (e.target.closest('[data-sc-add]')) { const got = await chooseTargets(); if (!got?.length) return; const room = Math.max(0, MAX_LINKS - d.links.length); d.links.push(...got.slice(0, room)); if (got.length > room) toast(`Au plus ${MAX_LINKS} raccourcis par widget.`, 'error'); return redraw(); }
            if (e.target.closest('[data-sc-addhead]')) { if (d.links.length >= MAX_LINKS) return toast(`Au plus ${MAX_LINKS} raccourcis par widget (intertitres compris).`, 'error'); d.links.push({id: newLinkId(), label: 'Intertitre', target: 'head:'}); redraw(); setTimeout(() => { const ins = box.querySelectorAll('[data-sc-row].is-head input'); ins[ins.length - 1]?.select(); }, 0); return; }
            // 💾 Réglages enregistrés
            const sel = ed.querySelector('[data-sc-pset]'), list = presets(), cur = sel?.value === '' ? null : list[Number(sel?.value)];
            if (e.target.closest('[data-sc-papply]')) { if (!cur) return toast('Choisis d’abord un réglage.', 'error'); applyPreset(d, cur.data); toast(`Réglage « ${cur.name} » appliqué.`); return redraw(); }
            if (e.target.closest('[data-sc-pexport]')) { if (!cur) return toast('Choisis d’abord un réglage.', 'error'); A().exportSettingFile?.(SETTING_TOOL, cur.name, cur.data); return; }
            if (e.target.closest('[data-sc-pdel]')) { if (!cur) return toast('Choisis d’abord un réglage.', 'error'); const at = list.indexOf(cur); list.splice(at, 1); savePresets(list); redraw(); A().undoToast?.(`Réglage « ${cur.name} » supprimé`, {undo: () => { const l2 = presets(); l2.splice(at, 0, cur); savePresets(l2); redraw(); }}); return; }
            if (e.target.closest('[data-sc-psave]')) { const name = await A().askText?.({title: 'Enregistrer ces raccourcis sous un nom', message: 'Les raccourcis, leur ordre, leurs icônes et couleurs, et la disposition.', value: '', okLabel: '💾 Enregistrer'}); if (!name?.trim()) return; const row2 = {name: name.trim().slice(0, 60), data: presetData(d)}; const at = list.findIndex(p => p.name === row2.name); if (at >= 0) list[at] = row2; else list.push(row2); savePresets(list); toast(`Réglages enregistrés sous « ${row2.name} ».`); redraw(); setTimeout(() => box.querySelector('[data-sc-presets]')?.setAttribute('open', ''), 0); return; }
            if (e.target.closest('[data-sc-pimport]')) { const r = await A().importSettingFile?.(SETTING_TOOL, {names: list.map(p => p.name), check: x => x && Array.isArray(x.links)}); if (!r) return; const data = {...presetData({...r.donnees, links: cleanLinks(r.donnees.links)})}; list.push({name: r.nom, data}); savePresets(list); toast(`Réglage « ${r.nom} » importé : choisis-le puis « Appliquer ».`); redraw(); setTimeout(() => box.querySelector('[data-sc-presets]')?.setAttribute('open', ''), 0); }
        });
    }

    /* ─── ⭐ Ajouter aux raccourcis : depuis une fiche, une liste, une Fiche, une enquête, Graphiques ─── */
    function currentTarget() {
        const st = S(), m = st.module;
        if (m === 'personnes' && Number(st.currentPersonId)) { const p = st.currentPerson?.person; return {target: `person:${Number(st.currentPersonId)}`, name: p ? A().personName(p) : ''}; }
        if (m === 'listes' && st.listType) {
            const view = cleanView(UI()?.listBarState?.('listes:' + st.listType) || null), lab = (A().defaultListTypes || []).find(x => x[0] === st.listType)?.[2] || '';
            return {target: `list:${st.listType}`, name: lab, view};
        }
        if (m === 'fiches' && Number(st.ficheId)) return {target: `sheet:${Number(st.ficheId)}`, name: document.querySelector('#workspace .page-header h2')?.textContent?.trim() || ''};
        if (m === 'enquetes') {
            if (st.enquetesTab === 'battue' && Number(st.currentBattueId)) return {target: `battue:${Number(st.currentBattueId)}`, name: ''};
            if (st.enquetesTab === 'tableaux' && Number(st.currentBoardId)) return {target: `board:${Number(st.currentBoardId)}`, name: ''};
            if (st.enquetesTab === 'atelier' && Number(st.atelier?.project)) return {target: `atelier:${Number(st.atelier.project)}`, name: ''};
            if (Number(st.currentInvestigationId)) return {target: `investigation:${Number(st.currentInvestigationId)}`, name: ''};
            return {target: 'module:enquetes', name: 'Enquêtes'};
        }
        if (m === 'graphiques') { if (st.graphMode === 'stats' && st.graphStatsType && ext.appScreen?.valid?.('stat:' + st.graphStatsType)) return {target: 'stat:' + st.graphStatsType, name: ''}; if (st.graphMode && ext.appScreen?.valid?.('graph:' + st.graphMode)) return {target: 'graph:' + st.graphMode, name: ''}; return {target: 'module:graphiques', name: 'Graphiques'}; }
        if (m === 'maintenance' && st.maintenanceTab && ext.appScreen?.valid?.('maint:' + st.maintenanceTab)) return {target: 'maint:' + st.maintenanceTab, name: ''};
        if (m === 'dashboard' && st.dashboardBoard && RE.tab.test('tab:' + st.dashboardBoard)) return {target: 'tab:' + st.dashboardBoard, name: ''};
        if (A()?.appModules?.[m] && m !== 'jeu') return {target: 'module:' + m, name: A().appModules[m][1]};
        return null;
    }
    /** propose le widget de raccourcis où ranger cette cible, puis l'y ajoute (↶ Annuler) */
    async function addToShortcuts(pick = currentTarget()) {
        if (document.body.classList.contains('is-kiosk')) { toast('Mode consultation : on ne peut rien ajouter.', 'error'); return; }
        if (!pick || !validTarget(pick.target)) { toast('Cet écran ne peut pas devenir un raccourci.', 'error'); return; }
        if (!ext.saveCustomWidgetList || !ext.openDialog) { toast('Réessaie dans un instant.', 'error'); return; }
        const where = homes(), desc = describe(pick.target), name = pick.name || desc.label;
        const already = h => (h.box.links || []).some(l => l.target === pick.target && JSON.stringify(l.view || null) === JSON.stringify(pick.view || null));
        const choice = await new Promise(resolve => {
            let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
            const dlg = ext.openDialog({eyebrow: 'RACCOURCIS', title: '⭐ Ajouter aux raccourcis', submitLabel: 'Ajouter',
                body: `<p><b>${esc(desc.icon)} ${esc(name)}</b> <small class="muted">${esc(desc.what)}${pick.view ? ' · avec la recherche, les filtres et le tri du moment' : ''}</small></p>
                    <fieldset class="h-sc-where"><legend>Dans quel widget de raccourcis ?</legend>${where.map((h, i) => `<label class="checkbox-line"><input type="radio" name="sc_where" value="${i}" ${i === 0 ? 'checked' : ''}> <span>${esc(h.icon)} ${esc(h.name)} <small class="muted">(${plural((h.box.links || []).length, 'raccourci')}${already(h) ? ', déjà dedans' : ''})</small></span></label>`).join('')}
                    <label class="checkbox-line"><input type="radio" name="sc_where" value="new" ${where.length ? '' : 'checked'}> <span>＋ Un nouveau widget « Raccourcis », posé sur le tableau de bord</span></label>
                    <label class="h-sc-newname" ${where.length ? 'hidden' : ''}>Titre du nouveau widget<input name="sc_newname" maxlength="80" value="Mes raccourcis"></label></fieldset>
                    <label>Nom du raccourci <small>(facultatif)</small><input name="sc_label" maxlength="80" placeholder="${esc(name)}"></label>`,
                onOpen: dg => { dg.classList.add('h-sc-dlg'); dg.addEventListener('change', () => { const nw = dg.querySelector('[name=sc_where]:checked')?.value === 'new'; dg.querySelector('.h-sc-newname').hidden = !nw; }); dg.addEventListener('close', () => fin(null)); },
                onSubmit: f => { fin({where: f.querySelector('[name=sc_where]:checked')?.value ?? 'new', label: f.elements.sc_label.value.trim(), newName: f.elements.sc_newname?.value.trim() || 'Mes raccourcis'}); }});
            dlg?.addEventListener('close', () => fin(null));
        });
        if (!choice) return;
        const link = cleanLink({target: pick.target, label: choice.label, name: pick.name || '', view: pick.view});
        const before = copyDefs(), list = copyDefs();
        let msg;
        if (choice.where === 'new') {
            const id = 'cw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            list.push({id, name: str(choice.newName, 80), icon: '🔗', color: '', width: '6', note: '', kind: 'links', inStats: false, caption: '', parts: [], links: [link], lLayout: 'grid', lSize: 112, lCols: 0, lInfo: true});
            await ext.saveCustomWidgetList(list);
            try { A().syncCustomDashboardWidgets(); const st = S(), board = st.dashboardBoard; st.dashboardBoard = ''; try { const s2 = A().dashboardBlockSettings(); s2.widgets.push(A().dashboardNewWidget(id, {width: '6'})); A().saveDashboardBlockSettings(s2); } finally { st.dashboardBoard = board; } } catch (_) { /* le widget reste dans l’Éditeur de widgets */ }
            msg = `Raccourci ajouté dans le nouveau widget « ${choice.newName} » (tableau de bord)`;
        } else {
            const h = where[Number(choice.where)]; if (!h) return;
            const box = boxOf(list, h.def.id, h.part); if (!box) return;
            box.links = Array.isArray(box.links) ? box.links : [];
            if (box.links.length >= MAX_LINKS) { toast(`Ce widget a déjà ${MAX_LINKS} raccourcis : retires-en un ou choisis-en un autre.`, 'error'); return; }
            box.links.push(link);
            await ext.saveCustomWidgetList(list);
            msg = `Raccourci ajouté dans « ${h.name} »`;
        }
        A().undoToast?.(msg, {undo: () => ext.saveCustomWidgetList(before), redo: () => ext.saveCustomWidgetList(list)});
    }
    const STAR = '<button type="button" class="button small secondary h-sc-star" data-sc-star title="Ajouter aux raccourcis (un widget « Raccourcis » du tableau de bord, d’un onglet ou d’une Fiche)" aria-label="Ajouter aux raccourcis">⭐ Raccourci</button>';
    // sur la fiche : un bouton icône comme ses voisins (signet, verrou, historique…), le nom dans la bulle
    const STAR_ICON = '<button type="button" class="icon-action icon-shortcut h-sc-star-hero" data-sc-star title="Ajouter aux raccourcis" aria-label="Ajouter aux raccourcis"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg></button>';
    document.addEventListener('click', e => { if (e.target.closest?.('[data-sc-star]')) { e.preventDefault(); addToShortcuts(); } });
    // sur la fiche d'une personne : à côté des signets
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(() => { const bar = document.querySelector('#workspace .person-hero-actions'); if (bar && !bar.querySelector('[data-sc-star]') && !document.body.classList.contains('is-kiosk')) bar.insertAdjacentHTML('beforeend', STAR_ICON); });
    // en haut des listes, des Fiches, des enquêtes et de Graphiques : dans les boutons de l'en-tête de la page
    const STAR_MODULES = ['listes', 'fiches', 'enquetes', 'graphiques'];
    function placeStar() {
        const st = A()?.state; if (!st || !STAR_MODULES.includes(st.module) || document.body.classList.contains('is-kiosk')) return;
        const head = document.querySelector('#workspace > .page > .page-header, #workspace > section > .page-header, #workspace > article > .page-header'); if (!head || head.querySelector('[data-sc-star]')) return;
        let acts = head.querySelector(':scope > .page-actions'); if (!acts) { acts = document.createElement('div'); acts.className = 'page-actions'; head.appendChild(acts); }
        acts.insertAdjacentHTML('beforeend', STAR);
    }
    let starTimer = 0;
    const watch = () => { const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watch, 500); new MutationObserver(() => { clearTimeout(starTimer); starTimer = setTimeout(placeStar, 60); }).observe(ws, {childList: true}); placeStar(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

    ext.shortcuts = {load, html, editorHtml, bindEditor, cleanFields, cleanLink, cleanLinks, validTarget, describe, openTarget, canOpen, chooseTargets, addToShortcuts, currentTarget, catalog, webUrl, safeThumb, homes, LAYOUTS};
})();
