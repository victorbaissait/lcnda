/**
 * Atelier : 🎨 mises en page enregistrées (Apparence) · 🖼️ retouche des photos · 📋 Mes listes dans Listes et partagées.
 * Chargé après heritage-more.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['lists', 'maintenance']) ext[key] = ext[key] || {};
    for (const key of ['designPanels', 'designPanelsEnd', 'afterDesign']) ext[key] = ext[key] || [];
    const esc = value => A().escapeHtml(value ?? '');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const S = () => A().state;
    const ls = (key, fallback = null) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
    const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
    const lsDel = key => { try { localStorage.removeItem(key); } catch (_) {} };
    const slug = text => String(text || 'sans-nom').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'sans-nom';
    /** Fait télécharger un fichier texte (JSON) au navigateur ou à Electron. */
    function downloadText(name, text, type = 'application/json') {
        const url = URL.createObjectURL(new Blob([text], {type}));
        const a = Object.assign(document.createElement('a'), {href: url, download: name});
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    /** Demande un fichier à l'utilisateur et rend son texte (ou null). */
    const pickFile = accept => new Promise(resolve => {
        const input = Object.assign(document.createElement('input'), {type: 'file', accept});
        input.addEventListener('change', async () => resolve(input.files[0] ? await input.files[0].text() : null));
        input.click();
    });
    ext.downloadText = downloadText;
    ext.pickFile = pickFile;

    /* ═══════════════════════ 🎨 MISES EN PAGE ENREGISTRÉES (Réglages → Apparence) ═══════════════════════ */

    // Tout ce que règle l'écran Apparence : design, menus (ordre, masqués), listes, cartes, graphiques, blocs des
    // fiches et du tableau de bord, couleurs, fonds de carte… (pas les données, ni les raccourcis, ni les sauvegardes).
    const LAYOUT_KEYS = [
        'genealogie-design', 'genealogie-menu-order', 'genealogie-menu-hidden', 'genealogie-menu-names', 'genealogie-menu-icons',
        'genealogie-list-order', 'genealogie-list-hidden', 'genealogie-map-order', 'genealogie-map-hidden', 'genealogie-maintenance-order', 'genealogie-maintenance-groups', 'genealogie-list-groups', 'genealogie-mylists-order',
        'genealogie-graph-diagram-order', 'genealogie-graph-diagram-hidden', 'genealogie-graph-stats-order', 'genealogie-graph-stats-hidden',
        'genealogie-research-kind-order', 'genealogie-research-kind-hidden', // 🔎 Recherche → ordre et types cachés de « Type de recherche »
        'genealogie-tile-cat-order', 'genealogie-tile-hidden-cats', 'genealogie-tile-hidden', 'genealogie-tile-custom-cats',
        'genealogie-person-blocks', 'genealogie-animal-blocks', 'genealogie-sheet-sections', 'genealogie-sheet-head', 'genealogie-dashboard-blocks', 'genealogie-dashboard-widget-catalog-order', 'genealogie-dashboard-widget-catalog-hidden',
        'genealogie-events-filter', 'genealogie-stats-colors', 'genealogie-gender-colors', 'genealogie-tree-card-fields', 'genealogie-identity-name-variants-display',
        'genealogie-battue-level-colors', 'genealogie-person-badge-colors', 'genealogie-archive-digest-category-order', 'genealogie-heritage-flags',
        'genealogie-village-maps', 'genealogie-transcription-layout',
        'genealogie-design-custom-presets', 'genealogie-avatar-shapes', 'genealogie-person-header', 'genealogie-topbar-buttons', // ✎ Mes thèmes, formes des avatars, en-tête des fiches (app-apparence.js)
        'genealogie-portraits', 'genealogie-left-column', // K7 portraits, K15 colonne de gauche (app-portraits.js, app-colonne.js)
        'genealogie-designs' // 🎨 Designs au choix A1–A8 (app-designs.js)
    ];
    const LAYOUT_PREFIXES = ['genealogie-tile-items-'];
    const PROFILES_KEY = 'genealogie-layout-profiles';
    const isLayoutKey = key => LAYOUT_KEYS.includes(key) || LAYOUT_PREFIXES.some(p => key.startsWith(p));
    function currentLayout() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && isLayoutKey(key)) settings[key] = localStorage.getItem(key);
        }
        return settings;
    }
    const profiles = () => { try { const p = JSON.parse(ls(PROFILES_KEY, '[]')); return Array.isArray(p) ? p : []; } catch (_) { return []; } };
    const saveProfiles = list => lsSet(PROFILES_KEY, JSON.stringify(list));
    const profileSummary = settings => {
        const count = key => { try { const v = JSON.parse(settings[key] || '[]'); return Array.isArray(v) ? v.length : Object.keys(v || {}).length; } catch (_) { return 0; } };
        const parts = [];
        if (settings['genealogie-design']) parts.push('design');
        if (settings['genealogie-menu-order'] || settings['genealogie-menu-hidden']) parts.push(`menus${count('genealogie-menu-hidden') ? ` (${A().plural(count('genealogie-menu-hidden'), 'masqué')})` : ''}`);
        if (settings['genealogie-list-order'] || settings['genealogie-list-hidden']) parts.push('listes');
        if (settings['genealogie-person-blocks']) parts.push('blocs des fiches');
        if (settings['genealogie-dashboard-blocks']) parts.push('tableau de bord');
        if (Object.keys(settings).some(k => k.startsWith('genealogie-tile'))) parts.push('fonds de carte');
        if (Object.keys(settings).some(k => /colors/.test(k))) parts.push('couleurs');
        if (settings['genealogie-portraits']) parts.push('portraits');
        if (settings['genealogie-left-column']) parts.push('colonne de gauche');
        if (settings['genealogie-designs']) parts.push('designs au choix');
        return parts.join(' · ') || 'réglages de départ';
    };
    /** Avant d'appliquer : la page de réglages (K2) ne doit pas réécrire, juste après, ce qu'elle montre encore (l'ancien design) */
    const holdAutoSave = () => { const p = window.LCNDA_UI?.autoSavePage?.(); if (!p) return () => {}; const save = p.save; clearTimeout(p.timer); p.pending = false; p.save = null; return () => { p.save = save; }; };
    /** Après avoir écrit : la copie des designs au choix lue par index.php avant tout le reste suit tout de suite (pas de reste de l'ancien au rechargement) */
    const refreshEarly = () => { try { window.LCNDA_DESIGNS?.apply?.(); } catch (_) {} };
    /** Applique une mise en page : chaque réglage enregistré est remis, les autres reviennent au réglage de départ
     *  (une mise en page d'avant les designs au choix, les portraits ou la colonne les remet « Comme avant »). */
    async function applyLayout(settings) {
        const release = holdAutoSave();
        const removed = []; // (un fichier reçu a déjà été vérifié à l'import)
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && isLayoutKey(key) && !(key in settings)) { removed.push(key); lsDel(key); }
        }
        const set = {};
        Object.entries(settings).forEach(([key, value]) => { if (isLayoutKey(key) && typeof value === 'string') { set[key] = value; lsSet(key, value); } });
        refreshEarly();
        // Les réglages sont aussi gardés dans la base : on attend qu'elle les ait reçus avant de recharger l'écran,
        // sinon la page rechargée reprendrait les anciens.
        try {
            const csrf = window.INSTALL_CSRF || S().csrf || '';
            const r = await fetch('api.php?action=save_settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({set, remove: removed, csrf})});
            if (!r.ok) throw new Error();
        } catch (_) { release(); toast('La base n’a pas pu enregistrer la mise en page : réessaie.', 'error'); return; }
        // Tout l'écran se redessine avec la nouvelle mise en page (menus, blocs, couleurs).
        location.reload();
    }
    /**
     * Valeurs d'un fichier de mise en page reçu : seulement ce que l'écran Apparence peut lui-même produire.
     * (Certaines valeurs, comme les couleurs des graphiques, sont écrites telles quelles dans la page.)
     */
    const COLOR_KEYS = ['genealogie-stats-colors', 'genealogie-battue-level-colors', 'genealogie-person-badge-colors', 'genealogie-gender-colors'];
    function safeLayoutValue(key, value) {
        if (typeof value !== 'string' || value.length > 200000) return false;
        if (/[<>`]|javascript:|expression\(|url\(/i.test(value)) return false;
        let parsed; try { parsed = JSON.parse(value); } catch (_) { return !/["']/.test(value); }
        const leaves = []; const walk = v => { if (v && typeof v === 'object') Object.values(v).forEach(walk); else leaves.push(v); }; walk(parsed);
        if (COLOR_KEYS.includes(key)) return leaves.every(v => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v));
        return leaves.every(v => typeof v !== 'string' || !/["\\]/.test(v));
    }
    /* Un fichier reçu : les réglages des nouveaux outils sont relus par l'outil lui-même (valeurs connues, bornées) ;
       le mode simple n'emporte ni le code de sortie, ni la personne qui regarde, ni les photos cachées (cette base-ci). */
    const reparse = (fn, v) => JSON.stringify(fn(JSON.parse(v)));
    const TIDY = {
        'genealogie-designs': v => { const D = window.LCNDA_DESIGNS; if (D?.portable) return D.portable(v) || null; if (!D?.clean) return v; const g = D.clean(JSON.parse(v)); delete g.a5?.m; delete g.a5?.f; return JSON.stringify(g); }, // un ancien réglage (A7, A10…) revient à neuf
        'genealogie-portraits': v => window.LCNDA_PORTRAITS?.clean ? reparse(window.LCNDA_PORTRAITS.clean, v) : v,
        'genealogie-left-column': v => window.LCNDA_COLUMN?.clean ? reparse(window.LCNDA_COLUMN.clean, v) : v,
        'genealogie-accessibilite': v => ext.access?.clean ? reparse(ext.access.clean, v) : v,
        'genealogie-mode-simple': v => ext.modeSimple?.portable ? reparse(ext.modeSimple.portable, v) : null,
    };
    const tidy = (k, v) => { const f = TIDY[k] || (isListKey(k) ? listValue : null); if (!f) return v; try { const out = f(v, k); return typeof out === 'string' && out.length <= 200000 ? out : null; } catch (_) { return null; } };
    const cleanWith = (ok, settings) => Object.fromEntries(Object.entries(settings || {}).slice(0, 3000).filter(([k, v]) => ok(k) && safeLayoutValue(k, v)).map(([k, v]) => [k, tidy(k, v)]).filter(([, v]) => v !== null));
    const cleanLayout = settings => cleanWith(isLayoutKey, settings);
    const validProfile = p => p && typeof p === 'object' && typeof p.name === 'string' && p.settings && typeof p.settings === 'object';
    /** 💾 le cadre commun pour une liste {name, saved, settings, from…} (mises en page, ensembles de tous les réglages) */
    const profilesFrame = o => {
        const UI = window.LCNDA_UI, day = p => p.saved || '';
        const frame = UI.presetsFrame({id: o.id, what: o.what, quietApply: true,
            list: () => o.list().map(p => ({name: p.name, date: [o.summary(p.settings), day(p), p.from ? `${o.from} ${p.from}` : ''].filter(Boolean).join(' · ')})),
            apply: i => { const p = o.list()[i]; return p ? o.apply(p) : false; },
            save: name => { const list = o.list(), same = list.findIndex(p => p.name === name), entry = {name, saved: new Date().toISOString(), settings: o.current()}; if (same >= 0) list[same] = entry; else list.push(entry); return o.keep(list); },
            replace: i => { const list = o.list(); list[i] = {...list[i], saved: new Date().toISOString(), settings: o.current()}; return o.keep(list); },
            rename: (i, name) => { const list = o.list(); list[i] = {...list[i], name}; return o.keep(list); },
            duplicate: i => { const list = o.list(), name = UI.freeName(list[i].name, list.map(x => x.name)); list.splice(i + 1, 0, {...JSON.parse(JSON.stringify(list[i])), name, saved: new Date().toISOString()}); if (!o.keep(list)) return false; toast(`Copie « ${name} » créée.`); },
            exportOne: i => { o.exportOne(o.list()[i]); return false; },
            // H7 : supprimé tout de suite, « ↶ Annuler » le remet (les réglages actuels ne changent pas)
            remove: i => { const list = o.list(), p = list[i]; A().undoLocalChange(o.removed(p.name), [o.key], () => { list.splice(i, 1); o.keep(list); }, () => { if (frame.isConnected) frame.refresh(); }); },
            importOne: o.importOne});
        return frame;
    };
    ext.designPanelsEnd.push(() => `<section class="person-block-config h-layouts" id="h-layouts"><header><span class="eyebrow">APPARENCE</span><h3>💾 Réglages enregistrés : l’Apparence</h3><p>Garde <b>tous</b> les réglages de l’Apparence sous un nom : design, designs au choix, portraits, colonne de gauche, menus affichés ou masqués et leur ordre, listes, cartes, graphiques, blocs des fiches et du tableau de bord, couleurs, fonds de carte. Tu peux y revenir en un clic, ou envoyer le fichier à un autre utilisateur de LCNDA.</p></header>
            <div data-presets-slot="layouts"></div></section>`); // tout en bas de l'Apparence : on enregistre une fois tout réglé
    ext.afterDesign.push(() => {
        const slot = document.querySelector('#h-layouts [data-presets-slot="layouts"]');
        if (!slot) return;
        slot.replaceWith(profilesFrame({id: 'apparence-mises-en-page', key: PROFILES_KEY, what: 'tous les réglages de l’Apparence', from: 'reçue de', removed: n => `Mise en page « ${n} » supprimée`,
            list: profiles, keep: list => { saveProfiles(list); return true; }, current: currentLayout, summary: profileSummary,
            apply: async p => {
                if (!await A().confirmBox('Tous les réglages de l’Apparence seront remplacés (pense à enregistrer la mise en page actuelle si tu veux la garder). L’écran va se recharger.', {title: `Appliquer la mise en page « ${p.name} » ?`, okLabel: 'Appliquer'})) return false;
                toast(`Mise en page « ${p.name} » appliquée.`); applyLayout(p.settings); return false;
            },
            exportOne: p => {
                downloadText(`mise-en-page-${slug(p.name)}.lcnda-apparence.json`, JSON.stringify({type: 'lcnda-mise-en-page', version: 1, name: p.name, saved: p.saved, settings: p.settings}, null, 1));
                toast('Fichier prêt : envoie-le à l’autre personne, elle l’importe dans Réglages → Apparence.');
            },
            importOne: async () => {
                const text = await pickFile('.json,application/json');
                if (text === null) return false;
                let data; try { data = JSON.parse(text); } catch (_) { toast('Ce fichier n’est pas une mise en page LCNDA.', 'error'); return false; }
                if (data?.type !== 'lcnda-mise-en-page' || !validProfile(data)) { toast('Ce fichier n’est pas une mise en page LCNDA.', 'error'); return false; }
                const settings = cleanLayout(data.settings);
                const ignored = Object.keys(data.settings).length - Object.keys(settings).length;
                const list = profiles();
                let name = data.name.slice(0, 60);
                if (list.some(p => p.name === name)) name = window.LCNDA_UI.freeName(name, list.map(p => p.name));
                list.push({name, saved: new Date().toISOString(), from: String(data.author || '').slice(0, 60), settings});
                saveProfiles(list);
                toast(`Mise en page « ${name} » importée : clique sur « Appliquer » pour l’utiliser.${ignored > 0 ? ` (${ignored > 1 ? `${ignored} réglages illisibles laissés` : '1 réglage illisible laissé'} de côté)` : ''}`);
            }}));
    });
    /* ═══════════════ 🗃️ TOUS MES RÉGLAGES (Réglages → Apparence, après les mises en page) ═══════════════ */
    // Tous les réglages de l'app (« genealogie-… ») : apparence, mais aussi listes, statistiques, onglets, widgets,
    // tableaux, animaux, raccourcis… Pas ce qui est propre à cet ordinateur ni ce qui vise une fiche précise de la base.
    const ALL_PROFILES_KEY = 'genealogie-settings-profiles';
    const ALL_SKIP = ['genealogie-auto-backup-lock', 'genealogie-baissait-ui-v2', 'genealogie-last-route', PROFILES_KEY, ALL_PROFILES_KEY, 'genealogie-site-defaults-applied',
        'genealogie-dashboard-recent-people', 'genealogie-sosa-root', 'genealogie-sosa-root-name', 'genealogie-sosa-map', 'genealogie-daboville-root', 'genealogie-daboville-root-name', 'genealogie-daboville-map', 'genealogie-atelier-timers'];
    // (et pas non plus : un chemin de dossier de cet ordinateur, les fiches du Sosa multiple, les descriptions des médias de cette base,
    //  le nom de la personne qui relit, ni ce que l'app note toute seule : sections ouvertes, boutons et commandes des éditeurs)
    ALL_SKIP.push('genealogie-auto-backup-settings', 'genealogie-sosa-multi', 'genealogie-media-alt', 'genealogie-layout-reviewer', 'genealogie-reglages-ouverts', 'genealogie-toolbar-defs', 'genealogie-editor-cmds');
    ALL_SKIP.push('genealogie-designs-presets'); // les « Ensembles prêts » des designs au choix et leurs réglages enregistrés : retirés (un vieux fichier qui les a s’applique sans eux)
    ALL_SKIP.push('genealogie-bg-photo'); // la photo du fond des pages (app-fond.js) : lourde, elle reste sur cet ordinateur (et un ensemble ne l’efface pas)
    // des réglages gardés hors « genealogie-… » (sur cet ordinateur seulement) : Réordonner, Trésors, arbre décoré, citations,
    // partage avec la famille, gabarits des décennales, voix du musée, éditeurs (dessin, montage, images en double, choix d’un média)
    const ALL_LOCAL = ['lcnda-side-order', 'lcnda-tresors-order', 'lcnda-decor-tree', 'lcnda-cite-style', 'lcnda-layout-cite-style', 'lcnda-family-share', 'lcnda-decennale-gabarits',
        'lcnda-museum-voice-rate', 'lcnda-vx-smart', 'lcnda-vx-alignto', 'lcnda-mt-rush-sort', 'lcnda-imgdup-mode', 'lcnda-imgdup-sens', 'lcnda-media-picker-size'];
    // 🔍 le tri et l'affichage (Liste | Fiches) de chaque liste (barre H10, UI.sortOf / UI.viewOf) : sans la recherche tapée ni les filtres
    const isListKey = key => /^lcnda-(sort|view|listbar):[A-Za-z0-9_:.-]{1,120}$/.test(key);
    const isBarKey = key => key.startsWith('lcnda-listbar:');
    function listValue(v, key) {
        if (!isBarKey(key)) return key.startsWith('lcnda-view:') ? (v === 'cards' || v === 'list' ? v : null) : /^[A-Za-z0-9_.:-]{1,60}$/.test(v) ? v : null;
        const o = JSON.parse(v), out = {};
        if (typeof o?.sort === 'string' && /^[A-Za-z0-9_.:-]{1,60}$/.test(o.sort)) out.sort = o.sort;
        if (o?.view === 'cards' || o?.view === 'list') out.view = o.view;
        return Object.keys(out).length ? JSON.stringify(out) : null;
    }
    const isAllKey = key => (/^genealogie-[a-z0-9-]{1,80}$/.test(key) && !ALL_SKIP.includes(key) && !/-\d+$/.test(key)) || isListKey(key) || ALL_LOCAL.includes(key);
    const MS_KEY = 'genealogie-mode-simple';
    /** un ensemble qui part dans un fichier (même enregistré avant ces précautions) : sans ce qui ne doit pas quitter cet ordinateur */
    const portableAll = settings => Object.fromEntries(Object.entries(settings || {}).filter(([k]) => isAllKey(k)).map(([k, v]) => [k, k === MS_KEY || isListKey(k) ? tidy(k, v) : v]).filter(([, v]) => typeof v === 'string'));
    // 📈 mes graphiques et widgets sont rangés dans la base (lib/graphs.php) : l'ensemble en garde une copie sous leur
    // ancienne clé ; « Appliquer » les remet dans la base (sans effacer ceux faits depuis : ce sont des données)
    const GRAPHS_KEY = 'genealogie-custom-widgets';
    function currentAll() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && isAllKey(key)) settings[key] = localStorage.getItem(key); }
        // le mode simple : sans le code de sortie (même haché), la personne qui regarde ni les photos cachées ; la liste : son tri et son affichage
        Object.keys(settings).forEach(key => { if (key === MS_KEY || isListKey(key)) { const v = tidy(key, settings[key]); if (v === null) delete settings[key]; else settings[key] = v; } });
        const graphs = ext.customWidgetList?.();
        if (Array.isArray(graphs) && graphs.length) settings[GRAPHS_KEY] = JSON.stringify(graphs);
        return settings;
    }
    async function restoreGraphs(json) {
        let list = []; try { list = JSON.parse(json); } catch (_) { return; }
        list = (Array.isArray(list) ? list : []).filter(d => d && typeof d === 'object' && /^cw_[a-z0-9]{4,24}$/.test(String(d.id)));
        for (let i = 0; i < list.length; i += 500) await A().api('graphs_write', {}, {method: 'POST', body: {op: 'save', defs: list.slice(i, i + 500)}});
    }
    const allProfiles = () => { try { const p = JSON.parse(ls(ALL_PROFILES_KEY, '[]')); return Array.isArray(p) ? p.filter(validProfile) : []; } catch (_) { return []; } };
    const saveAllProfiles = list => { try { localStorage.setItem(ALL_PROFILES_KEY, JSON.stringify(list)); return true; } catch (_) { toast('Trop de réglages enregistrés pour la place disponible : supprimes-en un.', 'error'); return false; } };
    const allSummary = s => { const n = Object.keys(s).length; return `${n} réglage${n > 1 ? 's' : ''}`; };
    /** Remet un ensemble : ses réglages remplacent tous les réglages actuels (les autres reviennent à ceux de départ). */
    async function applyAll(settings, {layoutOnly = false, keep = []} = {}) {
        // un fichier reçu : ce qui a été laissé de côté à l'import (illisible) n'efface rien ; une mise en page ne touche qu'à l'Apparence
        const release = holdAutoSave();
        const removed = [];
        if (!layoutOnly && typeof settings[GRAPHS_KEY] === 'string') {
            try { await restoreGraphs(settings[GRAPHS_KEY]); } catch (e) { release(); toast('Tes graphiques n’ont pas pu être remis : ' + e.message, 'error'); return; }
        }
        settings = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== GRAPHS_KEY));
        // le mode simple garde toujours, ici, son code de sortie, la personne qui regarde et ses photos cachées (un ensemble ne les a pas) ;
        // un ensemble d'avant le mode simple le remet comme au départ, sans rien de tout cela perdu
        const msNow = ls(MS_KEY);
        if (msNow && ext.modeSimple?.keepPrivate && (!layoutOnly) && !keep.includes(MS_KEY)) { try { settings = {...settings, [MS_KEY]: JSON.stringify(ext.modeSimple.keepPrivate(typeof settings[MS_KEY] === 'string' ? JSON.parse(settings[MS_KEY]) : {}, JSON.parse(msNow)))}; } catch (_) {} }
        // la barre d'une liste garde la recherche tapée et les filtres : seuls le tri et l'affichage sont remis (une liste absente ne bouge pas)
        for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key && key !== GRAPHS_KEY && isAllKey(key) && !isBarKey(key) && !(key in settings) && !keep.includes(key) && (!layoutOnly || isLayoutKey(key))) { removed.push(key); lsDel(key); } }
        const set = {};
        Object.entries(settings).forEach(([key, value]) => {
            if (!isAllKey(key) || typeof value !== 'string') return;
            if (isBarKey(key)) { let o = {}; try { o = JSON.parse(ls(key, '{}')) || {}; } catch (_) {} try { value = JSON.stringify({...o, ...JSON.parse(value)}); } catch (_) { return; } }
            lsSet(key, value); if (!isListKey(key)) set[key] = value;
        });
        refreshEarly();
        try {
            const csrf = window.INSTALL_CSRF || S().csrf || '';
            const r = await fetch('api.php?action=save_settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({set, remove: removed.filter(k => !isListKey(k)), csrf})});
            if (!r.ok) throw new Error();
        } catch (_) { release(); toast('La base n’a pas pu enregistrer ces réglages : réessaie.', 'error'); return; }
        location.reload();
    }
    // un fichier reçu : les mêmes précautions que pour une mise en page
    const cleanAll = settings => cleanWith(isAllKey, settings);
    ext.designPanelsEnd.push(() => `<section class="person-block-config h-layouts" id="h-allsets"><header><span class="eyebrow">TOUS LES RÉGLAGES</span><h3>💾 Réglages enregistrés : toute l’app</h3><p>Garde <b>l’intégralité</b> des réglages de l’app sous un nom : l’Apparence, mais aussi les listes et leurs colonnes, les graphiques et onglets à soi, les widgets, les tableaux, les animaux, les livrets, les raccourcis, la recherche sur internet… Tu peux y revenir en un clic, ou les passer à un autre ordinateur avec un fichier. Ne sont pas gardés : tes données, ce qui vise une fiche précise (de cujus, exceptions d’une fiche), le code pour quitter le mode simple et la personne qui regarde, et ce qui est propre à cet ordinateur.</p></header>
            <div data-presets-slot="allsets"></div><div class="h-layouts-save"><button type="button" class="button small secondary" data-h-allset-export-now>⤓ Exporter les réglages actuels</button></div></section>`);
    ext.afterDesign.push(() => {
        const box = document.getElementById('h-allsets'), slot = box?.querySelector('[data-presets-slot="allsets"]');
        if (!slot) return;
        const fileOf = (name, saved, settings) => JSON.stringify({type: 'lcnda-reglages', version: 1, name, saved, settings}, null, 1);
        box.querySelector('[data-h-allset-export-now]').addEventListener('click', () => { downloadText(`reglages-lcnda-${new Date().toISOString().slice(0, 10)}.lcnda-reglages.json`, fileOf('Mes réglages', new Date().toISOString(), currentAll())); toast('Fichier prêt : il s’importe ici, sur un autre ordinateur.'); });
        slot.replaceWith(profilesFrame({id: 'apparence-tous-les-reglages', key: ALL_PROFILES_KEY, what: 'tous les réglages de l’app', from: 'reçu de', removed: n => `Ensemble « ${n} » supprimé`,
            list: allProfiles, keep: saveAllProfiles, current: currentAll, summary: allSummary,
            apply: async p => {
                if (!await A().confirmBox('Tous les réglages de l’app seront remplacés (pense à enregistrer les réglages actuels si tu veux les garder). Tes données ne bougent pas. L’écran va se recharger.', {title: `Appliquer l’ensemble « ${p.name} » ?`, okLabel: 'Appliquer'})) return false;
                toast(`Ensemble « ${p.name} » appliqué.`); applyAll(p.settings, {layoutOnly: !!p.layoutOnly, keep: Array.isArray(p.keep) ? p.keep : []}); return false;
            },
            exportOne: p => { downloadText(`reglages-${slug(p.name)}.lcnda-reglages.json`, fileOf(p.name, p.saved, portableAll(p.settings))); toast('Fichier prêt : il s’importe dans Réglages → Apparence → « Mes ensembles de réglages ».'); },
            importOne: async () => {
                const text = await pickFile('.json,application/json');
                if (text === null) return false;
                let data; try { data = JSON.parse(text); } catch (_) { toast('Ce fichier n’est pas un fichier de réglages LCNDA.', 'error'); return false; }
                // une mise en page (Apparence) s'importe aussi ici
                if (!['lcnda-reglages', 'lcnda-mise-en-page'].includes(data?.type) || !validProfile(data)) { toast('Ce fichier n’est pas un fichier de réglages LCNDA.', 'error'); return false; }
                const settings = cleanAll(data.settings), dropped = Object.keys(data.settings).filter(k => !(k in settings)).slice(0, 500), ignored = dropped.length;
                const list = allProfiles(); let name = String(data.name).slice(0, 60) || 'Réglages importés';
                if (list.some(p => p.name === name)) name = window.LCNDA_UI.freeName(name, list.map(p => p.name));
                list.push({name, saved: new Date().toISOString(), from: String(data.author || '').slice(0, 60), settings, keep: dropped.filter(k => typeof k === 'string'), layoutOnly: data.type === 'lcnda-mise-en-page'});
                if (!saveAllProfiles(list)) return false;
                toast(`Ensemble « ${name} » importé : clique sur « Appliquer » pour l’utiliser.${ignored > 0 ? ` (${ignored > 1 ? `${ignored} réglages illisibles laissés` : '1 réglage illisible laissé'} de côté)` : ''}`);
            }}));
    });
    /* ═══════════ ⚙️ BARRES D'OUTILS À SOI (Retouche, Modifier le son, Montage vidéo) ═══════════
     * Un éditeur marque ses rangées d'outils data-tbg="clé" data-tbg-label="nom" ; « ⚙️ Personnaliser » range, montre
     * ou cache leurs boutons et options. Réglages : genealogie-toolbars = {éditeur: {order: {rangée: [clés]}, hidden: {rangée: [clés]}}}.
     */
    const TB_KEY = 'genealogie-toolbars';
    const tbAll = () => { try { const v = JSON.parse(localStorage.getItem(TB_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const tbSkip = el => el.matches('[data-tb-config], .dnd-grip, script, template');
    /** Une clé stable pour un bouton : son premier attribut data-… (ou celui de ce qu'il contient) */
    function tbKeyOf(el) {
        if (el.dataset.tb) return el.dataset.tb;
        const attr = n => [...n.attributes].find(a => a.name.startsWith('data-') && !/^data-(tb|dnd|need)/.test(a.name));
        let a = attr(el); if (!a) for (const d of el.querySelectorAll('*')) { a = attr(d); if (a) break; }
        return a ? `${a.name.slice(5)}=${a.value}` : `${el.tagName.toLowerCase()}:${(el.textContent || '').trim().slice(0, 24)}`;
    }
    const tbLabel = el => { if (el.dataset.tbLabel) return el.dataset.tbLabel; if (el.matches('select, input')) return el.title || el.getAttribute('aria-label') || el.name || '(sans nom)'; const lab = el.querySelector('[class$="tb-lab"]')?.textContent || '', tx = (el.textContent || '').replace(lab, '').trim().replace(/\s+/g, ' ').slice(0, 60), ti = el.title || el.getAttribute('aria-label') || el.querySelector('[title]')?.title || ''; return tx.length <= 3 && ti ? `${tx} ${ti}`.trim() : tx || ti || '(sans nom)'; };
    const tbKids = g => [...g.children].filter(c => !tbSkip(c));
    const TB_DEFS = 'genealogie-toolbar-defs'; // les boutons de chaque éditeur, notés à son ouverture (pour Réglages → Montage, retouche, mise en page et son)
    // les boutons de départ de chaque éditeur : Réglages → Montage, retouche, mise en page et son les montre avant même la première ouverture
    const TB_DEFAULT_DEFS = {"textdoc": {"groups": [{"key": "wp-tools", "label": "Barre d’outils", "items": [["style", "Style du paragraphe"], ["font", "Police et taille (E5)"], ["fmt", "Gras, italique…"], ["colors", "Couleur et surlignage (C2)"], ["para", "Paragraphe"], ["insert", "Insérer"], ["review", "Relecture"]]}, {"key": "wp-g-style", "label": "Barre d’outils · Style du paragraphe", "items": [["wp-style=", "Style du paragraphe"]]}, {"key": "wp-g-font", "label": "Barre d’outils · Police et taille (E5)", "items": [["wp-cmd=font", "Georgia"], ["wp-size=", "Taille du texte"]]}, {"key": "wp-g-fmt", "label": "Barre d’outils · Gras, italique…", "items": [["wp-cmd=bold", "G Gras"], ["wp-cmd=italic", "I Italique"], ["wp-cmd=underline", "S Souligné"], ["wp-cmd=strike", "ab Barré"], ["wp-cmd=sup", "x² Exposant"], ["wp-cmd=sub", "x₂ Indice"], ["wp-cmd=smallcaps", "Pᴄ Petites capitales"]]}, {"key": "wp-g-colors", "label": "Barre d’outils · Couleur et surlignage (C2)", "items": [["wp-cmd=color", "A Couleur du texte"], ["wp-cmd=highlight", "🖍 Surlignage"], ["wp-cmd=clearfmt", "⌫ Effacer la mise en forme"]]}, {"key": "wp-g-para", "label": "Barre d’outils · Paragraphe", "items": [["wp-cmd=al:left", "⟸ Aligner à gauche"], ["wp-cmd=al:center", "≡ Centrer"], ["wp-cmd=al:right", "⟹ Aligner à droite"], ["wp-cmd=al:justify", "☰ Justifier"], ["wp-cmd=linemenu", "↕ Interligne et espacement"], ["wp-cmd=ul", "•≡ Liste à puces"], ["wp-cmd=ol", "1≡ Liste numérotée"], ["wp-cmd=outdent", "⇤ Diminuer le retrait"], ["wp-cmd=indent", "⇥ Augmenter le retrait"]]}, {"key": "wp-g-insert", "label": "Barre d’outils · Insérer", "items": [["wp-cmd=image", "🖼 Image"], ["wp-cmd=table", "▦ Tableau"], ["wp-cmd=link", "🔗 Lien"], ["wp-cmd=footnote", "¹ Note de bas de page"], ["wp-cmd=person", "👤 Une personne de la base"], ["wp-cmd=place", "📍 Un lieu de la base"], ["wp-cmd=chars", "Ω Caractères spéciaux"]]}, {"key": "wp-g-review", "label": "Barre d’outils · Relecture", "items": [["wp-cmd=track", "✍ Suivre les modifications"], ["wp-cmd=comment", "💬 Nouveau commentaire"], ["wp-cmd=find", "🔍 Rechercher"]]}]}, "sheet": {"groups": [{"key": "xl-tools", "label": "Barre d’outils", "items": [["text", "Police et gras"], ["colors", "Couleurs (C2)"], ["format", "Format de cellule"], ["borders", "Bordures"], ["data", "Trier, filtrer, Σ"], ["chart", "Graphique"]]}, {"key": "xl-g-text", "label": "Barre d’outils · Police et gras", "items": [["xl-cmd=bold", "G Gras"], ["xl-cmd=italic", "I Italique"], ["xl-cmd=underline", "S Souligné"], ["xl-cmd=wrap", "↵ Renvoi à la ligne"], ["xl-cmd=merge", "⊞ Fusionner / séparer"], ["xl-cmd=al:left", "⟸ Aligner à gauche"], ["xl-cmd=al:center", "≡ Centrer"], ["xl-cmd=al:right", "⟹ Aligner à droite"]]}, {"key": "xl-g-colors", "label": "Barre d’outils · Couleurs (C2)", "items": [["xl-cmd=color:color", "A Couleur du texte"], ["xl-cmd=color:fill", "◧ Couleur du fond"]]}, {"key": "xl-g-format", "label": "Barre d’outils · Format de cellule", "items": [["xl-fmt=", "Format de la cellule"], ["xl-cmd=dec-", ".0 Une décimale de moins"], ["xl-cmd=dec+", ".00 Une décimale de plus"]]}, {"key": "xl-g-borders", "label": "Barre d’outils · Bordures", "items": [["xl-cmd=bd:all", "▦ Bordures : tout"], ["xl-cmd=bd:out", "▭ Bordures : contour"], ["xl-cmd=bd:bottom", "▁ Bordure du bas"], ["xl-cmd=bd:none", "⊘ Sans bordure"]]}, {"key": "xl-g-data", "label": "Barre d’outils · Trier, filtrer, Σ", "items": [["xl-cmd=sortmenu", "↕ Trier ▾"], ["xl-cmd=filter", "⚲ Filtrer"], ["xl-cmd=summenu", "Σ ▾ Somme, moyenne, nombre…"]]}, {"key": "xl-g-chart", "label": "Barre d’outils · Graphique", "items": [["xl-cmd=chart", "📊 Graphique ▾"], ["xl-cmd=fn", "ƒ Fonction"]]}, {"key": "xl-panel", "label": "Panneau de droite", "items": [["cell", "Cellule"], ["num", "Nombre et date"], ["color", "Couleur et bordures"], ["cf", "Mise en forme conditionnelle"], ["dv", "Validation"]]}]}, "vector": {"groups": [{"key": "vx-menus", "label": "Menus du haut", "items": [["menu-Fichier", "Menu Fichier"], ["menu-Édition", "Menu Édition"], ["menu-Objet", "Menu Objet"], ["menu-Aligner", "Menu Aligner"], ["menu-Pathfinder", "Menu Pathfinder"], ["menu-Blason", "Menu Blason"], ["menu-Affichage", "Menu Affichage"]]}, {"key": "vx-hist", "label": "Annuler / rétablir (en haut)", "items": [["vx-cmd=undo", "↶ Annuler (⌘Z)"], ["vx-cmd=redo", "↷ Rétablir (⇧⌘Z)"]]}, {"key": "vx-tools", "label": "Outils (colonne de gauche)", "items": [["vx-tool=select", "➤ Sélection (V)"], ["vx-tool=direct", "⌖ Sélection directe (points et poignées) (A)"], ["vx-tool=pen", "✒️ Plume (clic : point, glisser : courbe) (P)"], ["vx-tool=pencil", "✏️ Crayon (à main levée) (N)"], ["vx-tool=rect", "▭ Rectangle (M)"], ["vx-tool=ellipse", "◯ Ellipse (L)"], ["vx-tool=polygon", "⬡ Polygone (Y)"], ["vx-tool=star", "☆ Étoile (S)"], ["vx-tool=spiral", "🌀 Spirale (glisser depuis le centre) (O)"], ["vx-tool=line", "╱ Ligne (\\)"], ["vx-tool=text", "T Texte (T)"], ["vx-tool=eyedrop", "💧 Pipette (prend la couleur d’un objet) (I)"], ["vx-tool=hand", "✋ Main (déplacer la vue) (H)"], ["vx-tool=zoom", "🔍 Loupe (⌥ : dézoomer) (Z)"], ["vx-fsfill=", "Remplissage et contour de la sélection"]]}, {"key": "vx-tabs", "label": "Onglets du panneau de droite", "items": [["vx-tab=props", "Propriétés"], ["vx-tab=layers", "Calques"], ["vx-tab=blason", "Blason"], ["vx-tab=doc", "Document"]]}]}, "retouch": {"groups": [{"key": "rt-bar", "label": "Barre du haut (groupes)", "items": [["modes", "Les outils"], ["rt-undo=", "↶↷ Annuler (⌘Z)"], ["rt-zoom=-1", "−100 %+Ajuster1:1"]]}, {"key": "rt-modes", "label": "Outils", "items": [["rt-mode=adjust", "🎚 Réglages"], ["rt-mode=heal", "🩹 Correcteur de taches"], ["rt-mode=clone", "🧬 Tampon"], ["rt-mode=brush", "🖌 Pinceau"], ["rt-mode=eraser", "🧽 Gomme"], ["rt-mode=text", "🔤 Texte"], ["rt-mode=hand", "✋ Déplacer la vue"]]}, {"key": "rt-opts", "label": "Options des outils (pinceau, texte…)", "items": [["o=size", "Taille 18 [ ]"], ["o=hard", "Dureté 55 %"], ["o=opacity", "Opacité 100 %"], ["o=brush", "Sorte de pinceau"], ["o=color", "Couleur"], ["o=swatches", "Couleurs rapides"], ["o=font", "Police"], ["o=font", "Contour blanc du texte"], ["o=clone", "Tampon : endroit à recopier, aligné"], ["o=textstyle", "Texte gras"], ["o=textstyle", "Texte italique"], ["o=textstyle", "Polices de l’ordi"], ["o=shape", "Forme (rectangle, ellipse, flèche…)"], ["o=shape", "Forme remplie"], ["o=shape", "Couleur de fond des formes"], ["o=wand", "Baguette : tolérance"], ["o=wand", "Baguette : contiguë"], ["o=sel", "Actions de la sélection"], ["o=crop", "Recadrage : proportions, redresser"], ["o=maskmode", "Masque : cacher / montrer"], ["rt-paint-help=", "Aide de l’outil"]]}, {"key": "rt-vtools", "label": "Colonne d’outils", "items": [["rt-mode=move", "Déplacer un élément d’un calque (V)"], ["rt-mode=marquee", "Sélection rectangle (M)"], ["rt-mode=ellipsesel", "Sélection ellipse (⇧M)"], ["rt-mode=lasso", "Lasso : entourer à main levée (L)"], ["rt-mode=polysel", "Plume : sélection point par point (P) — double-clic ou Entrée pour fermer"], ["rt-mode=wand", "Sélection automatique (baguette magique) (W)"], ["rt-mode=crop", "Recadrer et redresser (C)"], ["rt-mode=heal", "Correcteur de taches (J)"], ["rt-mode=clone", "Tampon : un endroit, ou une zone sélectionnée (S)"], ["rt-mode=brush", "Pinceau (B)"], ["rt-mode=eraser", "Gomme (E)"], ["rt-mode=shape", "Formes : rectangle, ellipse, ligne, flèche (U)"], ["rt-mode=text", "Texte (T)"], ["rt-mode=hand", "Main, ou barre d’espace (H)"], ["rt-mode=zoom", "Zoom (Z) — ⌥ pour reculer"], ["rt-color2=", "Couleur"]]}, {"key": "rt-adjust", "label": "Panneau Réglages", "items": [["rt-target=", "(sans nom)"], ["rt-preset=0", "Préréglages"], ["rt-out=exposure", "Exposition 0"], ["rt-out=brightness", "Luminosité 0"], ["rt-out=contrast", "Contraste 0"], ["rt-out=shadows", "Ombres 0"], ["rt-out=highlights", "Hautes lumières 0"], ["rt-out=saturation", "Saturation 0"], ["rt-out=warmth", "Chaleur 0"], ["rt-t=bw", "Noir et blanc Sépia Négatif"], ["rt-ch=rgb", "CourbeRVBRougeVertBleu"], ["rt-curve=", "(sans nom)"], ["rt-ptdel=", "Enlever le point"], ["p:Clic sur la courbe : ajo", "Clic sur la courbe : ajouter un point · glisser : le déplace"], ["rt-reset=", "Remettre comme au départ"]]}]}, "video": {"groups": [{"key": "mt-tabs", "label": "Onglets de droite", "items": [["mt-tab=rush", "🎞️ Rush"], ["mt-tab=item", "🎯 Élément"], ["mt-tab=color", "🎨 Couleurs"], ["mt-tab=sound", "🔊 Son"], ["mt-tab=film", "🎞️ Film"]]}, {"key": "mt-transport", "label": "Lecture", "items": [["mt-play=", "▶ Lire"], ["mt-home=", "⏮ Au début"], ["mt-cur=", "Temps (où on en est / durée)"], ["mt-zoom=", "Zoom de la frise"]]}, {"key": "mt-ops", "label": "Outils du montage", "items": [["mt-op=undo", "↶ Annuler (⌘Z)"], ["mt-op=redo", "↷ Rétablir (⇧⌘Z)"], ["mt-op=split", "✂️ Couper ici"], ["mt-op=start", "⟦ Commence ici"], ["mt-op=end", "⟧ Finit ici"], ["mt-op=left", "← Avancer"], ["mt-op=right", "Reculer →"], ["mt-op=detach", "🔊 Détacher le son"], ["mt-op=del", "🗑 Enlever"], ["mt-op=addv1", "＋ Vidéo / photo à la suite"], ["mt-op=addv2", "＋ Incrustation"], ["mt-op=kfprev", "◀ ◆ Aller à l'image clé précédente de l'élément choisi"], ["mt-op=kfnext", "◆ ▶ Aller à l'image clé suivante de l'élément choisi"], ["mt-op=addtext", "＋ Titre / texte"], ["mt-op=adda", "＋ Son / musique"]]}]}, "layout": {"groups": [{"key": "ly-menus", "label": "Menus du haut", "items": [["menu-Fichier", "Menu Fichier"], ["menu-Édition", "Menu Édition"], ["menu-Objet", "Menu Objet"], ["menu-Page", "Menu Page"], ["menu-Affichage", "Menu Affichage"]]}, {"key": "ly-hist", "label": "Annuler / rétablir (en haut)", "items": [["ly-cmd=undo", "↶ Annuler (⌘Z)"], ["ly-cmd=redo", "↷ Rétablir (⇧⌘Z)"]]}, {"key": "ly-tools", "label": "Outils (colonne de gauche)", "items": [["ly-tool=select", "➤ Sélection (V)"], ["ly-tool=text", "T Texte (T)"], ["ly-tool=frame", "⊠ Cadre d’image (F)"], ["ly-tool=rect", "▭ Rectangle (M)"], ["ly-tool=ellipse", "◯ Ellipse (L)"], ["ly-tool=polygon", "⬡ Polygone (Y)"], ["ly-tool=star", "☆ Étoile (E)"], ["ly-tool=line", "╲ Ligne (\\)"], ["ly-tool=pen", "✒︎ Plume (P) : clic = point, double-clic ou Entrée = fini"], ["ly-tool=hand", "✋ Main (H)"], ["ly-tool=zoom", "🔍 Zoom (Z) — Alt pour reculer"], ["ly-target=fill", "⇄⧄ Fond et contour de l’objet choisi : clic = choisir la couleur"]]}, {"key": "ly-tabs", "label": "Onglets du panneau de droite", "items": [["ly-panel=pages", "📄Pages"], ["ly-panel=layers", "🗂Calques"], ["ly-panel=obj", "🔧Objet"], ["ly-panel=text", "🅰Texte"], ["ly-panel=color", "🎨Couleur"], ["ly-panel=links", "🔗Liens"], ["ly-panel=history", "🕘Historique"], ["ly-panel=doc", "⚙️Document"]]}, {"key": "ly-status", "label": "Barre du bas", "items": [["ly-cmd=first", "⏮ Première page"], ["ly-cmd=prev", "‹ Page précédente"], ["page", "Numéro de la page"], ["ly-cmd=next", "› Page suivante"], ["ly-cmd=last", "⏭ Dernière page"], ["ly-zoom=", "Zoom"], ["ly-pos=", "Position du pointeur (mm)"], ["ly-msg=", "Messages"]]}]}};
    const tbDefs = () => { let v = {}; try { v = JSON.parse(localStorage.getItem(TB_DEFS) || '{}'); if (!v || typeof v !== 'object') v = {}; } catch (_) { v = {}; } return {...TB_DEFAULT_DEFS, ...v}; };
    ext.tbDefs = tbDefs;
    function tbRemember(root, id) {
        const groups = [...root.querySelectorAll('[data-tbg]')].map(g => ({key: g.dataset.tbg, label: g.dataset.tbgLabel || g.dataset.tbg, items: tbKids(g).map(el => [tbKeyOf(el), tbLabel(el)])})).filter(g => g.items.length);
        const all = tbDefs(), old = all[id]?.groups || [];
        // on garde l'ordre de départ déjà noté ; les nouvelles rangées et les nouveaux boutons s'ajoutent
        const merged = groups.map(g => { const o = old.find(x => x.key === g.key); if (!o) return g; const keys = o.items.map(i => i[0]); return {...g, items: [...o.items.filter(i => g.items.some(n => n[0] === i[0])).map(i => g.items.find(n => n[0] === i[0])), ...g.items.filter(n => !keys.includes(n[0]))]}; });
        const next = {groups: merged}; // les rangées qui n'existent plus disparaissent de la liste
        if (JSON.stringify(all[id]) !== JSON.stringify(next)) { all[id] = next; try { localStorage.setItem(TB_DEFS, JSON.stringify(all)); } catch (_) {} }
    }
    ext.tbApply = (root, id) => {
        tbRemember(root, id);
        const cfg = tbAll()[id] || {};
        root.querySelectorAll('[data-tbg]').forEach(g => {
            const k = g.dataset.tbg, kids = tbKids(g), order = cfg.order?.[k] || [], hidden = cfg.hidden?.[k] || [];
            const byKey = new Map(kids.map(el => [tbKeyOf(el), el]));
            [...order.map(x => byKey.get(x)).filter(Boolean), ...kids.filter(el => !order.includes(tbKeyOf(el)))].forEach(el => g.appendChild(el));
            g.querySelectorAll(':scope > [data-tb-config]').forEach(b => g.appendChild(b)); // le bouton ⚙️ reste au bout
            kids.forEach(el => el.classList.toggle('is-tb-off', hidden.includes(tbKeyOf(el))));
            // un onglet caché qui était ouvert : on ouvre le premier qui reste
            if (/tabs$/.test(k) && kids.some(el => el.classList.contains('is-tb-off') && el.matches('.is-active, .is-on'))) { const first = tbKids(g).find(el => !el.classList.contains('is-tb-off') && !el.hidden); setTimeout(() => first?.click(), 0); } // (après que l'éditeur a branché ses onglets)
        });
    };
    /* Plein écran d'un éditeur (comme les tableaux) : ⛶, gardé pour la prochaine fois */
    const FULL_KEY = 'genealogie-editor-full';
    const fullAll = () => { try { return JSON.parse(localStorage.getItem(FULL_KEY) || '{}') || {}; } catch (_) { return {}; } };
    ext.fullButton = id => `<button type="button" class="icon-button h-full-btn" data-full-toggle="${esc(id)}" title="Plein écran (⛶)" aria-label="Plein écran">⛶</button>`;
    ext.fullInit = (dlg, id, byDefault = false) => { const v = fullAll()[id]; if (v === undefined ? byDefault : v) { dlg.classList.add('is-full'); const b = dlg.querySelector(`[data-full-toggle="${CSS.escape(id)}"]`); if (b) b.title = 'Quitter le plein écran'; } };
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-full-toggle]'); if (!b) return;
        const dlg = b.closest('dialog'); if (!dlg) return;
        const on = dlg.classList.toggle('is-full'), all = fullAll(); all[b.dataset.fullToggle] = on;
        try { localStorage.setItem(FULL_KEY, JSON.stringify(all)); } catch (_) {}
        b.title = on ? 'Quitter le plein écran' : 'Plein écran (⛶)';
        setTimeout(() => window.dispatchEvent(new Event('resize')), 30); // les images et les ondes se redessinent à la nouvelle taille
    });
    /* ⌘ + / ⌘ − / ⌘ 0 (Ctrl sur PC et Linux) dans un éditeur ouvert : la frise du montage, l'onde du son, la photo retouchée.
     * Renvoie true si un éditeur a zoomé (sinon l'app zoome toute la page). */
    ext.editorZoom = dir => {
        if (window.LCNDA_UI?.editorZoomKey?.(dir)) return true; // K18 : le zoom commun de la barre du bas (tous les éditeurs)
        const open = [...document.querySelectorAll('dialog[open]')].pop(); if (!open) return false;
        const click = sel => { const b = open.querySelector(sel); if (!b) return false; b.click(); return true; };
        if (open.classList.contains('h-avx-montage')) {
            const z = open.querySelector('[data-mt-zoom]'); if (!z) return false;
            z.value = String(dir === 0 ? 40 : Math.max(Number(z.min), Math.min(Number(z.max), Math.round(Number(z.value) * (dir > 0 ? 1.4 : 1 / 1.4)))));
            z.dispatchEvent(new Event('input', {bubbles: true})); return true;
        }
        if (open.querySelector('[data-avx-zoom]')) return click(dir === 0 ? '[data-avx-zoom="fit"]' : dir > 0 ? '[data-avx-zoom="in"]' : '[data-avx-zoom="out"]');
        if (open.querySelector('[data-rt-zoom]')) return click(dir === 0 ? '[data-rt-zoomfit]' : `[data-rt-zoom="${dir > 0 ? 1 : -1}"]`);
        return false;
    };
    // dans un navigateur (l'app Electron passe par son menu Affichage)
    if (!/Electron/i.test(navigator.userAgent)) document.addEventListener('keydown', e => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
        const dir = ['+', '='].includes(e.key) ? 1 : e.key === '-' ? -1 : e.key === '0' ? 0 : null; if (dir === null) return;
        if (ext.editorZoom(dir)) e.preventDefault();
    }, true);
    // espaces de travail : les mêmes « ensembles » que Réglages → Montage, retouche… (genealogie-toolbar-sets = {éditeur: [{name, date, v}]})
    const WS_KEY = 'genealogie-toolbar-sets';
    const wsList = id => { try { const v = JSON.parse(localStorage.getItem(WS_KEY) || '{}')?.[id]; return Array.isArray(v) ? v.filter(x => x && x.name && x.v) : []; } catch (_) { return []; } };
    const wsSave = (id, list) => { try { const all = JSON.parse(localStorage.getItem(WS_KEY) || '{}') || {}; all[id] = list; localStorage.setItem(WS_KEY, JSON.stringify(all)); return true; } catch (_) { toast('Plus de place pour enregistrer : supprime un espace de travail.', 'error'); return false; } };
    ext.tbButton = id => `<button type="button" class="button small secondary" data-tb-config="${esc(id)}" title="Ranger, montrer ou cacher les boutons et les options">⚙️ Personnaliser</button>`;
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tb-config]'); if (!b) return;
        e.preventDefault();
        const id = b.dataset.tbConfig, root = b.closest('dialog') || document;
        const groups = [...root.querySelectorAll('[data-tbg]')].filter(g => tbKids(g).length);
        const rows = g => tbKids(g).map(el => `<li class="h-pet-lrow" data-k="${esc(tbKeyOf(el))}"><input type="checkbox" ${el.classList.contains('is-tb-off') ? '' : 'checked'} title="Montrer"><span>${esc(tbLabel(el))}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('');
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-tbcfg';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">PERSONNALISER</span><h2>⚙️ Boutons et options</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-tbcfg-body"><div data-presets-slot="ws"></div><p class="muted">Coche ce qu’on montre, range avec ↑ ↓ (ou en glissant ⠿). Gardé pour la prochaine fois. Comme les espaces de travail de Photoshop : enregistre une disposition sous un nom (« Restauration », « Montage rapide »…) et passe de l’une à l’autre.</p>${groups.map(g => `<section><h4>${esc(g.dataset.tbgLabel || g.dataset.tbg)}</h4><ol class="h-pet-layout" data-g="${esc(g.dataset.tbg)}">${rows(g)}</ol></section>`).join('')}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-reset>↺ Remettre comme au départ</button><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="button" class="button" data-ok>Enregistrer</button></div>`;
        (b.closest('dialog') || document.body).appendChild(dlg);
        const cur = () => { const c = {order: {}, hidden: {}}; dlg.querySelectorAll('[data-g]').forEach(ol => { const lis = [...ol.children]; c.order[ol.dataset.g] = lis.map(l => l.dataset.k); c.hidden[ol.dataset.g] = lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k); }); return c; };
        const useCfg = v => { const all = tbAll(); all[id] = v; try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {} ext.tbApply(root, id); };
        const today = () => new Date().toLocaleDateString('fr-FR'), UI = window.LCNDA_UI;
        // espaces de travail : comme ceux de Photoshop, une disposition gardée sous un nom (aussi dans Réglages → Montage, retouche, mise en page et son)
        const frame = UI.presetsFrame({id: `boutons-${id}`, what: 'les boutons montrés, cachés et rangés', list: () => wsList(id), quietApply: true,
            apply: i => { const x = wsList(id)[i]; if (!x) return false; useCfg(x.v); toast(`Espace de travail « ${x.name} » appliqué.`); dlg.close(); return false; },
            save: name => { const list = wsList(id), k = list.findIndex(y => y.name === name), it = {name, date: today(), v: cur()}; if (k >= 0) list[k] = it; else list.push(it); if (!wsSave(id, list.slice(-60))) return false; useCfg(it.v); },
            replace: i => { const list = wsList(id); list[i] = {...list[i], date: today(), v: cur()}; return wsSave(id, list); },
            rename: (i, name) => { const list = wsList(id); list[i] = {...list[i], name}; return wsSave(id, list); },
            duplicate: i => { const list = wsList(id), name = UI.freeName(list[i].name, list.map(y => y.name)); list.splice(i + 1, 0, {...JSON.parse(JSON.stringify(list[i])), name, date: today()}); if (!wsSave(id, list.slice(-60))) return false; toast(`Copie « ${name} » créée.`); },
            exportOne: i => { const x = wsList(id)[i]; if (x) ext.reglageExport(`boutons-${id}`, x.name, x.v); return false; },
            remove: i => { const list = wsList(id), x = list[i]; A().undoLocalChange(`Réglages « ${x.name} » supprimés`, [WS_KEY], () => { list.splice(i, 1); wsSave(id, list); }, () => { if (frame.isConnected) frame.refresh(); }); },
            importOne: async () => {
                const keys = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).slice(0, 60).filter(([k, a]) => typeof k === 'string' && k.length < 80 && Array.isArray(a)).map(([k, a]) => [k, a.filter(x => typeof x === 'string' && x.length < 200).slice(0, 300)])) : {});
                const r = await ext.reglageImport(`boutons-${id}`, {names: wsList(id).map(y => y.name), check: v => !!v && typeof v === 'object' && (v.order === undefined || typeof v.order === 'object') && (v.hidden === undefined || typeof v.hidden === 'object')});
                if (!r) return false;
                const v = {order: keys(r.donnees.order), hidden: keys(r.donnees.hidden)}, list = wsList(id).filter(y => y.name !== r.nom); list.push({name: r.nom, date: today(), v}); if (!wsSave(id, list.slice(-60))) return false;
                toast(`Réglages « ${r.nom} » importés : « Appliquer » pour les utiliser.`);
            }});
        dlg.querySelector('[data-presets-slot="ws"]').replaceWith(frame);
        dlg.addEventListener('click', async ev => {
            const li = ev.target.closest('li');
            if (ev.target.closest('[data-up]') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
            if (ev.target.closest('[data-down]') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
            if (ev.target.closest('[data-x]')) dlg.close();
            if (ev.target.closest('[data-reset]')) { const all = tbAll(); delete all[id]; try { localStorage.setItem(TB_KEY, JSON.stringify(all)); } catch (_) {} toast('Boutons remis comme au départ (rouvre la fenêtre pour retrouver l’ordre de départ).'); root.querySelectorAll('.is-tb-off').forEach(x => x.classList.remove('is-tb-off')); dlg.close(); }
            if (ev.target.closest('[data-ok]')) { useCfg(cur()); toast('Boutons rangés.'); dlg.close(); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
    });
    /* ═══════════════════════ 🎚️ RETOUCHE DES PHOTOS (visionneuse → « Retoucher ») ═══════════════════════ */

    const RT_SLIDERS = [
        ['exposure', 'Exposition', -100, 100], ['brightness', 'Luminosité', -100, 100], ['contrast', 'Contraste', -100, 100],
        ['shadows', 'Ombres', -100, 100], ['highlights', 'Hautes lumières', -100, 100], ['saturation', 'Saturation', -100, 100], ['vibrance', 'Vibrance (couleurs ternes d’abord)', -100, 100], ['warmth', 'Chaleur', -100, 100],
        ['hue', 'Teinte (tourner les couleurs)', -180, 180],
    ];
    /** Niveaux (comme Photoshop) : point noir et point blanc d'entrée, gamma (tons moyens, ×100), sortie */
    const RT_LEVELS = [['lvl_in_b', 'Noir d’entrée', 0, 250, 0], ['lvl_gamma', 'Tons moyens (gamma ×100)', 10, 300, 100], ['lvl_in_w', 'Blanc d’entrée', 5, 255, 255], ['lvl_out_b', 'Noir de sortie', 0, 250, 0], ['lvl_out_w', 'Blanc de sortie', 5, 255, 255]];
    /** Colorisation douce d'une photo ancienne (dégradé selon la luminosité, ou selon la hauteur : ciel en haut, terre en bas) */
    const RT_GMAPS = {'': ['Aucune'], naturel: ['Naturelle : ciel, verdure, peau, habits (conseillé)', ['#000000', '#808080', '#ffffff']], sepia: ['Sépia chaud', ['#2a1a10', '#9c6b43', '#f4e2c4']], autochrome: ['Autochrome (couleurs d’autrefois)', ['#1f2a33', '#a8805f', '#efe2c0']],
        portrait: ['Portrait (peau rosée)', ['#2b1a17', '#c98f78', '#fbe9dc']], cyan: ['Cyanotype', ['#0d2240', '#3f78a8', '#e6f0f7']], sky: ['Paysage : ciel en haut, terre en bas', ['#5d8bbf', '#7d8f55', '#6b5338']]};
    /** Colorisation « naturelle » : chaque endroit de la photo reçoit la couleur de ce qu'il est sans doute — le ciel (clair, lisse,
     *  en haut) en bleu, la verdure (texturée, moyenne ou sombre, dehors) en vert, la peau (tons moyens lisses, vers le centre) en rosé,
     *  le reste (habits, murs) presque neutre, un peu froid dans les ombres — au lieu d'un seul dégradé qui teinte tout en orangé.
     *  Analyse sur une grille réduite, adoucie, puis lue point par point ; la luminosité de chaque point est gardée. */
    const RT_NAT = {sky: [118, 158, 208], veg: [96, 128, 72], skin: [214, 160, 134], dark: [62, 66, 80], light: [232, 228, 220], mid: [150, 146, 140]};
    const rtZoneCache = new WeakMap(); // l'analyse d'une photo, gardée : pas refaite à chaque mouvement de curseur
    function rtNaturalZones(a, W, H) {
        const hit = rtZoneCache.get(a); if (hit && hit.W === W && hit.H === H) return hit.zn;
        const zn = rtNaturalZones0(a, W, H); rtZoneCache.set(a, {W, H, zn}); return zn;
    }
    function rtNaturalZones0(a, W, H) {
        const cs = Math.max(4, Math.round(Math.max(W, H) / 120)), gw = Math.ceil(W / cs), gh = Math.ceil(H / cs), mean = new Float32Array(gw * gh), sd = new Float32Array(gw * gh);
        for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { let s1 = 0, s2 = 0, n = 0;
            for (let y = gy * cs; y < Math.min(H, gy * cs + cs); y += 2) for (let x = gx * cs; x < Math.min(W, gx * cs + cs); x += 2) { const i = (y * W + x) * 4, v = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255; s1 += v; s2 += v * v; n++; }
            const m = n ? s1 / n : 0; mean[gy * gw + gx] = m; sd[gy * gw + gx] = n ? Math.sqrt(Math.max(0, s2 / n - m * m)) : 0; }
        const cl = v => v < 0 ? 0 : v > 1 ? 1 : v, Z = new Float32Array(gw * gh * 3); let skyAll = 0;
        for (let k = 0; k < gw * gh; k++) { const gx = k % gw, gy = Math.floor(k / gw), yr = gy / gh, xr = Math.abs(gx / gw - 0.5) * 2, m = mean[k], d = sd[k];
            const sky = cl((m - 0.52) / 0.25) * cl(1 - d / 0.07) * cl(1.25 - yr * 1.8), veg = cl((0.62 - m) / 0.3) * cl(d / 0.07 - 0.2) * cl(yr * 1.6 - 0.1), skin = cl(1 - Math.abs(m - 0.6) / 0.2) * cl(1 - d / 0.08) * cl(1.1 - xr) * cl(1.3 - yr);
            Z[k * 3] = sky; Z[k * 3 + 1] = veg; Z[k * 3 + 2] = skin; skyAll += sky; }
        const outdoor = cl(skyAll / (gw * gh) * 8); // pas de ciel : sans doute un intérieur, pas de verdure
        for (let k = 0; k < gw * gh; k++) { Z[k * 3 + 1] *= outdoor; Z[k * 3 + 2] = Math.min(1, Z[k * 3 + 2] * 1.8) * (1 - 0.6 * Z[k * 3]); }
        // adoucir (deux passes de moyenne 3 × 3) pour que les couleurs ne fassent pas de carreaux
        for (let pass = 0; pass < 2; pass++) { const T = Z.slice(); for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) for (let c = 0; c < 3; c++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < gw && y < gh) { s += T[(y * gw + x) * 3 + c]; n++; } } Z[(gy * gw + gx) * 3 + c] = s / n; } }
        return {Z, gw, cs};
    }
    function rtNaturalColor(zn, x, y, lum) {
        const k = (Math.min(Math.floor(y / zn.cs), Math.floor(zn.Z.length / 3 / zn.gw) - 1) * zn.gw + Math.min(Math.floor(x / zn.cs), zn.gw - 1)) * 3, sky = zn.Z[k], veg = zn.Z[k + 1], skin = zn.Z[k + 2], t = lum / 255;
        const base = t < 0.5 ? RT_NAT.dark.map((v, j) => v + (RT_NAT.mid[j] - v) * t * 2) : RT_NAT.mid.map((v, j) => v + (RT_NAT.light[j] - v) * (t - 0.5) * 2), rest = Math.max(0, 1 - sky - veg - skin), sum = sky + veg + skin + rest || 1;
        return [0, 1, 2].map(j => (RT_NAT.sky[j] * sky + RT_NAT.veg[j] * veg + RT_NAT.skin[j] * skin + base[j] * rest) / sum);
    }
    (window.LCNDA_EXT = window.LCNDA_EXT || {}).rtColor = {apply: (src, dst, st) => rtApply(src, dst, {...rtDefault(), ...st})}; // pour les essais
    const RT_CHANNELS = [['rgb', 'RVB'], ['r', 'Rouge'], ['g', 'Vert'], ['b', 'Bleu']];
    const rtDefault = () => ({exposure: 0, brightness: 0, contrast: 0, shadows: 0, highlights: 0, saturation: 0, vibrance: 0, warmth: 0, hue: 0, lvl_in_b: 0, lvl_gamma: 100, lvl_in_w: 255, lvl_out_b: 0, lvl_out_w: 255,
        gmap: '', gmap_amt: 70, bw: false, sepia: false, invert: false, filters: {}, crop: null, persp: null,
        curves: {rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]]}});
    const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
    /** Courbe lisse qui passe par les points sans faire de bosses (interpolation monotone de Fritsch-Carlson). */
    function curveLut(points) {
        const p = [...points].sort((a, b) => a[0] - b[0]).filter((q, i, arr) => i === 0 || q[0] !== arr[i - 1][0]);
        const lut = new Float32Array(256);
        if (p.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
        const n = p.length, d = [], m = new Array(n).fill(0);
        for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
            if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
        }
        for (let x = 0; x < 256; x++) {
            if (x <= p[0][0]) { lut[x] = p[0][1]; continue; }
            if (x >= p[n - 1][0]) { lut[x] = p[n - 1][1]; continue; }
            let k = 0; while (x > p[k + 1][0]) k++;
            const h = p[k + 1][0] - p[k][0], t = (x - p[k][0]) / h, t2 = t * t, t3 = t2 * t;
            lut[x] = (2 * t3 - 3 * t2 + 1) * p[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * p[k + 1][1] + (t3 - t2) * h * m[k + 1];
        }
        return lut;
    }
    /** Les trois tables (rouge, vert, bleu) qui donnent la valeur retouchée de chaque niveau. */
    function rtLuts(st) {
        const base = new Float32Array(256);
        const exp = Math.pow(2, st.exposure / 50), c = (259 * (st.contrast * 1.275 + 255)) / (255 * (259 - st.contrast * 1.275));
        const ib = st.lvl_in_b ?? 0, iw = Math.max(ib + 1, st.lvl_in_w ?? 255), gm = (st.lvl_gamma ?? 100) / 100, ob = st.lvl_out_b ?? 0, ow = st.lvl_out_w ?? 255, lv = ib !== 0 || iw !== 255 || gm !== 1 || ob !== 0 || ow !== 255;
        for (let i = 0; i < 256; i++) {
            let v = st.invert ? 255 - i : i;
            if (lv) v = ob + Math.pow(Math.min(1, Math.max(0, (v - ib) / (iw - ib))), 1 / gm) * (ow - ob);
            v = v * exp + st.brightness * 1.2;
            v = c * (v - 128) + 128;
            if (v < 128) v += st.shadows * 0.6 * Math.pow(1 - Math.max(0, v) / 128, 2);
            else v += st.highlights * 0.6 * Math.pow((Math.min(255, v) - 128) / 127, 2);
            base[i] = clamp255(v);
        }
        const master = curveLut(st.curves.rgb);
        return ['r', 'g', 'b'].map(ch => { const own = curveLut(st.curves[ch]), lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = own[Math.round(clamp255(master[Math.round(base[i])]))]; return lut; });
    }
    /* 🎨 Teinte/Saturation (comme Photoshop) : global, ou seulement une gamme de couleurs (rouges, jaunes…) avec ses bords réglables ; « Coloriser » teinte toute l'image */
    const RT_HS_CH = [['master', 'Global'], ['reds', 'Rouges', 0], ['yellows', 'Jaunes', 60], ['greens', 'Verts', 120], ['cyans', 'Cyans', 180], ['blues', 'Bleus', 240], ['magentas', 'Magentas', 300]];
    const rtHsRange = c => [c - 45, c - 15, c + 15, c + 45].map(v => (v + 360) % 360);
    const rtHsDefault = () => ({ch: Object.fromEntries(RT_HS_CH.map(([k]) => [k, {h: 0, s: 0, l: 0}])), rg: Object.fromEntries(RT_HS_CH.slice(1).map(([k, , c]) => [k, rtHsRange(c)])), colorize: false, cz: {h: 30, s: 25, l: 0}});
    const RT_HS_PRESETS = [['', 'Par défaut', {}], ['cyano', 'Cyanotype', {colorize: true, cz: {h: 210, s: 40, l: 0}}], ['sepia', 'Sépia', {colorize: true, cz: {h: 35, s: 25, l: 0}}],
        ['sat', 'Saturation augmentée', {ch: {master: {h: 0, s: 30, l: 0}}}], ['sat2', 'Saturation plus forte', {ch: {master: {h: 0, s: 60, l: 0}}}], ['old', 'Ancien style', {ch: {master: {h: 0, s: -40, l: 0}, yellows: {h: -6, s: 15, l: 0}}}],
        ['reds', 'Rouges plus saturés', {ch: {reds: {h: 0, s: 40, l: 0}}}], ['yellow', 'Jaune intensifié', {ch: {yellows: {h: 0, s: 45, l: 0}}}], ['sky', 'Ciel plus bleu', {ch: {blues: {h: 0, s: 40, l: -10}, cyans: {h: 8, s: 25, l: 0}}}],
        ['skin', 'Peau plus douce', {ch: {reds: {h: 4, s: -15, l: 6}, yellows: {h: 0, s: -10, l: 4}}}], ['light', 'Éclaircir', {ch: {master: {h: 0, s: 0, l: 25}}}], ['dark', 'Assombrir', {ch: {master: {h: 0, s: 0, l: -25}}}],
        ['gray', 'Désaturer', {ch: {master: {h: 0, s: -100, l: 0}}}], ['green', 'Verts d’automne', {ch: {greens: {h: -45, s: -10, l: 0}, yellows: {h: -15, s: 10, l: 0}}}]];
    const rtHsPreset = k => { const p = RT_HS_PRESETS.find(x => x[0] === k)?.[2] || {}, d = rtHsDefault(); Object.entries(p.ch || {}).forEach(([c, v]) => { d.ch[c] = {...v}; }); if (p.colorize) { d.colorize = true; d.cz = {...p.cz}; } d.preset = k; return d; };
    const rtHsActive = hs => !!hs && (hs.colorize || Object.values(hs.ch || {}).some(v => v.h || v.s || v.l));
    /** Le poids d'une gamme pour une teinte (0 à 1) : plein entre ses deux bords intérieurs, en pente jusqu'aux bords extérieurs */
    const rtHsWeight = (rg, h) => { const [a, b, c, d] = rg, rel = v => ((v - a) % 360 + 360) % 360, x = rel(h), B = rel(b), C = rel(c), D = rel(d) || 360;
        return x < B ? (B ? x / B : 1) : x <= C ? 1 : x < D ? (D - x) / Math.max(1e-6, D - C) : 0; };
    /** Prépare les tables par degré de teinte : décalage de teinte, de saturation et de luminosité */
    function rtHsPrep(hs) {
        const dh = new Float32Array(360), ds = new Float32Array(360), dl = new Float32Array(360), m = hs.ch?.master || {h: 0, s: 0, l: 0};
        for (let h = 0; h < 360; h++) { let H = m.h || 0, S = m.s || 0, L = m.l || 0;
            for (const [k] of RT_HS_CH.slice(1)) { const v = hs.ch?.[k]; if (!v || !(v.h || v.s || v.l)) continue; const w = rtHsWeight(hs.rg?.[k] || rtHsRange(RT_HS_CH.find(x => x[0] === k)[2]), h); if (!w) continue; H += (v.h || 0) * w; S += (v.s || 0) * w; L += (v.l || 0) * w; }
            dh[h] = H; ds[h] = S; dl[h] = L; }
        return {dh, ds, dl, m, colorize: !!hs.colorize, cz: hs.cz || {h: 0, s: 25, l: 0}};
    }
    const rtHsL = (l, d) => d > 0 ? l + (1 - l) * d / 100 : l * (1 + d / 100);
    const rtHsS = (s, d) => Math.min(1, Math.max(0, d > 0 ? s + (1 - s) * s * d / 100 + s * d / 200 : s * (1 + d / 100)));
    /** Une couleur (0 à 255) passée par Teinte/Saturation */
    function rtHsPixel(P, r, g, b) {
        let [h, s, l] = rtHsl([r, g, b]);
        if (P.colorize) { const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255; return rtFromHsl([P.cz.h, (P.cz.s || 0) / 100, rtHsL(y, P.cz.l || 0)]); }
        if (Number.isNaN(h)) { return rtFromHsl([0, 0, rtHsL(l, P.m.l || 0)]); }
        const i = Math.round(h) % 360; return rtFromHsl([h + P.dh[i], rtHsS(s, P.ds[i]), rtHsL(l, P.dl[i])]);
    }
    const hex3 = h => [1, 3, 5].map(k => parseInt(String(h).slice(k, k + 2), 16) || 0);
    function rtApply(src, dst, st) {
        if (st.filters?.dust > 0 && src === dst) rtDust(src, st.filters.dust); // poussière et rayures : avant tout le reste, sur l'image elle-même
        else if (st.filters?.dust > 0) { src = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height); rtDust(src, st.filters.dust); }
        const [lr, lg, lb] = rtLuts(st), sat = 1 + st.saturation / 100, warm = st.warmth * 0.35, vib = (st.vibrance || 0) / 100, hue = (st.hue || 0) * Math.PI / 180;
        const hc = Math.cos(hue), hs = Math.sin(hue), gm = st.gmap && RT_GMAPS[st.gmap]?.[1] ? RT_GMAPS[st.gmap][1].map(hex3) : null, gk = (st.gmap_amt ?? 70) / 100, W = src.width, H = src.height;
        const hsP = rtHsActive(st.hsat) ? rtHsPrep(st.hsat) : null, a = src.data, o = dst.data, zn = st.gmap === 'naturel' ? rtNaturalZones(a, W, H) : null, plain = sat === 1 && !warm && !st.bw && !st.sepia && !vib && !hue && !gm && !hsP;
        for (let i = 0; i < a.length; i += 4) {
            let r = lr[a[i]], g = lg[a[i + 1]], b = lb[a[i + 2]];
            if (!plain) {
                if (sat !== 1) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
                if (vib) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s0 = mx ? (mx - mn) / mx : 0, k = 1 + vib * (1 - s0) * (vib > 0 ? 1 : 0.8), y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * k; g = y + (g - y) * k; b = y + (b - y) * k; }
                if (hue) { // rotation de teinte (espace YIQ) : la luminosité ne bouge pas
                    const y = 0.299 * r + 0.587 * g + 0.114 * b, ii = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b, i2 = ii * hc - q * hs, q2 = ii * hs + q * hc;
                    r = y + 0.956 * i2 + 0.621 * q2; g = y - 0.272 * i2 - 0.647 * q2; b = y - 1.106 * i2 + 1.703 * q2; }
                if (hsP) { const q = rtHsPixel(hsP, Math.min(255, Math.max(0, r)), Math.min(255, Math.max(0, g)), Math.min(255, Math.max(0, b))); r = q[0]; g = q[1]; b = q[2]; }
                if (warm) { r += warm; b -= warm; }
                if (st.bw || st.sepia) { const y = 0.299 * r + 0.587 * g + 0.114 * b; if (st.sepia) { r = y * 1.07 + 18; g = y * 0.92 + 8; b = y * 0.72; } else { r = g = b = y; } }
                if (gm) { // colorisation : une couleur prise dans le dégradé, qui garde la luminosité du point
                    const y = 0.299 * r + 0.587 * g + 0.114 * b; let t, c0, c1;
                    if (zn) { const px = (i / 4) % W, c = rtNaturalColor(zn, px, (i / 4 - px) / W, y); c0 = c; c1 = c; t = 0; }
                    else if (st.gmap === 'sky') { const row = Math.floor(i / 4 / W) / H; t = Math.min(1, Math.max(0, (row - 0.25) / 0.5)); if (t < 0.5) { c0 = gm[0]; c1 = gm[1]; t *= 2; } else { c0 = gm[1]; c1 = gm[2]; t = t * 2 - 1; } }
                    else { t = y / 255; if (t < 0.5) { c0 = gm[0]; c1 = gm[1]; t *= 2; } else { c0 = gm[1]; c1 = gm[2]; t = t * 2 - 1; } }
                    let cr = c0[0] + (c1[0] - c0[0]) * t, cg = c0[1] + (c1[1] - c0[1]) * t, cb = c0[2] + (c1[2] - c0[2]) * t;
                    const cy = 0.299 * cr + 0.587 * cg + 0.114 * cb || 1, f = y / cy; cr *= f; cg *= f; cb *= f; // même luminosité
                    r += (cr - r) * gk; g += (cg - g) * gk; b += (cb - b) * gk;
                }
            }
            o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = a[i + 3];
        }
        if (st.filters && Object.entries(st.filters).some(([k, v]) => v && k !== 'dust')) rtFilters(dst, st.filters);
        return dst;
    }
    /** Poussière et rayures : un point (ou un trait fin) très différent de son voisinage est remplacé par la médiane du voisinage.
        Plus l'effet est fort, plus le voisinage est grand et plus le seuil est bas. */
    function rtDust(img, amount) {
        // rapide : on compare chaque point à son voisinage flouté (le flou du navigateur), puis on remplace les points abîmés
        // par la moyenne de leurs voisins sains (un flou qui ignore les points abîmés : ils sont rendus transparents)
        const W = img.width, H = img.height, d = img.data, r = Math.max(1, Math.round(W / 1600 * (1 + amount / 25))), thr = 70 - amount * 0.55;
        const src = document.createElement('canvas'); src.width = W; src.height = H; src.getContext('2d').putImageData(img, 0, 0);
        const blur = (c, rad) => { const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d', {willReadFrequently: true}); g.filter = `blur(${rad}px)`; g.drawImage(c, 0, 0); return g.getImageData(0, 0, W, H).data; };
        const B = blur(src, r * 1.5), bad = new Uint8Array(W * H); let nbad = 0;
        for (let p = 0, i = 0; p < bad.length; p++, i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], bl = 0.299 * B[i] + 0.587 * B[i + 1] + 0.114 * B[i + 2]; if (Math.abs(l - bl) > thr) { bad[p] = 1; nbad++; } }
        if (!nbad) return img;
        // les points abîmés et leur bord immédiat deviennent transparents, puis flou : la couleur des voisins sains
        const hole = new ImageData(new Uint8ClampedArray(d), W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!bad[p]) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) hole.data[(yy * W + xx) * 4 + 3] = 0; } }
        const hc = document.createElement('canvas'); hc.width = W; hc.height = H; hc.getContext('2d').putImageData(hole, 0, 0);
        const F = blur(hc, r + 1.5);
        for (let p = 0, i = 0; p < bad.length; p++, i += 4) { if (!bad[p]) continue; if (F[i + 3] > 8) { d[i] = F[i]; d[i + 1] = F[i + 1]; d[i + 2] = F[i + 2]; } else { d[i] = B[i]; d[i + 1] = B[i + 1]; d[i + 2] = B[i + 2]; } }
        return img;
    }
    /** 🎯 Sélectionner le sujet : le fond est appris sur les bords de l'image (couleurs les plus fréquentes), puis rempli depuis
        les bords tant que la couleur lui ressemble ; ce qui reste au milieu est le sujet (trous bouchés, petits morceaux enlevés).
        Marche bien sur un fond uni ou simple (studio, mur, ciel) ; à retoucher au besoin avec ⇧ / ⌥ et les autres outils. */
    function rtSubject(src, W0, H0, tol = 24) {
        const k = Math.min(1, 420 / Math.max(W0, H0)), W = Math.max(8, Math.round(W0 * k)), H = Math.max(8, Math.round(H0 * k));
        const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const sg = sc.getContext('2d', {willReadFrequently: true}); sg.filter = 'blur(1px)'; sg.drawImage(src, 0, 0, W, H);
        const d = sg.getImageData(0, 0, W, H).data, N = W * H, band = Math.max(2, Math.round(Math.min(W, H) * 0.03));
        const border = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < band || y < band || x >= W - band || y >= H - band) border.push(y * W + x);
        // quelques couleurs de fond (k-moyennes sur les bords)
        let cents = Array.from({length: 6}, (_, c) => { const p = border[Math.floor(border.length * (c + 0.5) / 6)] * 4; return [d[p], d[p + 1], d[p + 2]]; });
        for (let it = 0; it < 8; it++) { const acc = cents.map(() => [0, 0, 0, 0]);
            for (const p of border) { const i = p * 4; let best = 0, bd = 1e9; cents.forEach((c, j) => { const dd = (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } }); const a = acc[best]; a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; a[3]++; }
            cents = cents.map((c, j) => acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c); }
        const dist = new Float32Array(N); for (let p = 0; p < N; p++) { const i = p * 4; let bd = 1e9; for (const c of cents) { const dd = (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2; if (dd < bd) bd = dd; } dist[p] = Math.sqrt(bd); }
        const bd2 = border.map(p => dist[p]).sort((a, b) => a - b), T = Math.max(14, bd2[Math.floor(bd2.length * 0.85)] * 1.5) + tol * 0.8;
        // le fond : rempli depuis les bords (et pas d'un bond : il faut aussi que le voisin ressemble)
        const bg = new Uint8Array(N), stack = [];
        for (const p of border) if (dist[p] < T) { bg[p] = 1; stack.push(p); }
        while (stack.length) { const p = stack.pop(), x = p % W; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) { if (q < 0 || q >= N || bg[q]) continue; const i = p * 4, j = q * 4;
            const step = Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]); if (dist[q] < T && step < 40 + tol) { bg[q] = 1; stack.push(q); } } }
        // le sujet : les morceaux qui ne sont pas du fond ; on garde les gros (au moins 8 % du plus gros)
        const lab = new Int32Array(N), sizes = [0]; let n = 0;
        for (let p0 = 0; p0 < N; p0++) { if (bg[p0] || lab[p0]) continue; n++; let sz = 0; const st2 = [p0]; lab[p0] = n; while (st2.length) { const p = st2.pop(), x = p % W; sz++; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < N && !bg[q] && !lab[q]) { lab[q] = n; st2.push(q); } } sizes.push(sz); }
        let big = 0; for (const z of sizes) if (z > big) big = z; const keep = sizes.map(z => z >= big * 0.08 && z > 12);
        const mc = document.createElement('canvas'); mc.width = W; mc.height = H; const mg = mc.getContext('2d'), md = mg.createImageData(W, H);
        for (let p = 0; p < N; p++) if (!bg[p] && keep[lab[p]]) md.data[p * 4 + 3] = 255;
        mg.putImageData(md, 0, 0);
        // à la taille de l'aperçu, bord adouci puis net
        const out = document.createElement('canvas'); out.width = W0; out.height = H0; const og = out.getContext('2d', {willReadFrequently: true}); og.filter = `blur(${Math.max(1, W0 / W * 0.8)}px)`; og.drawImage(mc, 0, 0, W0, H0);
        const od = og.getImageData(0, 0, W0, H0); for (let i = 3; i < od.data.length; i += 4) { const a = od.data[i]; od.data[i] = a < 90 ? 0 : a > 165 ? 255 : (a - 90) * 3.4; } og.filter = 'none'; og.putImageData(od, 0, 0);
        return {mask: out, found: big > 0};
    }
    /** Redresser tout seul : l'angle des grandes lignes (horizon, cadres, murs) le plus fréquent, entre −20° et +20° */
    function rtAutoAngle(img) {
        const k = Math.min(1, 700 / Math.max(img.width, img.height)), W = Math.round(img.width * k), H = Math.round(img.height * k);
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true}); const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; t.getContext('2d').putImageData(img, 0, 0); g.drawImage(t, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H); for (let p = 0; p < L.length; p++) L[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
        const bins = new Float32Array(81); // de −20° à +20°, par demi-degré
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const p = y * W + x, gx = L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - 1] - L[p + W - 1], gy = L[p + W - 1] + 2 * L[p + W] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - W] - L[p - W + 1], m = Math.hypot(gx, gy);
            if (m < 60) continue;
            let a = Math.atan2(gy, gx) * 180 / Math.PI; // direction du gradient → celle de la ligne : 90° de plus ; on ramène près de l'horizontale ou de la verticale
            a = ((a % 90) + 90) % 90; if (a > 45) a -= 90; // écart à l'axe le plus proche
            if (Math.abs(a) > 20) continue; bins[Math.round((a + 20) * 2)] += m;
        }
        let best = 40; for (let i = 0; i < bins.length; i++) { const v = (bins[i - 1] || 0) + bins[i] * 2 + (bins[i + 1] || 0); if (v > (bins[best - 1] || 0) + bins[best] * 2 + (bins[best + 1] || 0)) best = i; }
        return Math.round((best / 2 - 20) * 2) / 2;
    }
    /** Perspective : l'image vue à travers 4 coins (relatifs, dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche) remise à plat */
    function rtHomography(q, W, H) { // carré unité → quadrilatère (en pixels)
        const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q.map(([x, y]) => [x * W, y * H]);
        const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3, den = dx1 * dy2 - dx2 * dy1 || 1e-9;
        const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
        return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
    }
    function rtWarp(src, q) {
        const W = src.width, H = src.height, s = src.data, out = new ImageData(W, H), o = out.data, [a, b, c, d, e, f, g, h] = rtHomography(q, W, H);
        for (let y = 0; y < H; y++) { const v = (y + 0.5) / H; for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, w = g * u + h * v + 1, sx = (a * u + b * v + c) / w - 0.5, sy = (d * u + e * v + f) / w - 0.5, i = (y * W + x) * 4;
            const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
            if (x0 < -1 || y0 < -1 || x0 >= W || y0 >= H) continue;
            for (let ch = 0; ch < 4; ch++) { const px = (xx, yy) => s[((Math.min(H - 1, Math.max(0, yy))) * W + Math.min(W - 1, Math.max(0, xx))) * 4 + ch];
                o[i + ch] = (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy; } } }
        return out;
    }
    /* ── Filtres (après les réglages) : flou, réduire le bruit, netteté, grain, vignette ; les rayons suivent la largeur de l'image
       (même effet sur l'aperçu et sur l'image en pleine taille) ── */
    const RT_FILTERS = [['deglare', 'Reflets en moins (vitre, verre, vernis)', 0, 100], ['deglareSize', 'Taille des reflets (0 = moyenne)', 0, 100], ['dust', 'Poussière et rayures (automatique)', 0, 100], ['blur', 'Flou', 0, 100], ['denoise', 'Réduire le bruit', 0, 100], ['sharpen', 'Netteté', 0, 100], ['clarity', 'Clarté (contraste local)', -100, 100], ['grain', 'Grain', 0, 100], ['vignette', 'Vignette', -100, 100]];
    function rtBlurred(img, r) {
        const W = img.width, H = img.height, a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = W; a.height = b.height = H;
        a.getContext('2d').putImageData(img, 0, 0); const g = b.getContext('2d', {willReadFrequently: true}); g.filter = `blur(${Math.max(0.3, r)}px)`; g.drawImage(a, 0, 0); return g.getImageData(0, 0, W, H).data;
    }
    /** Reflets : une vitre ajoute un voile clair et peu coloré, qui varie lentement. On le mesure (le plus sombre de chaque
        voisinage, adouci), puis on le retire en rendant le contraste perdu. f.deglare : combien on en retire ; f.deglareSize : taille. */
    function rtDeglare(img, amount, sizeV) {
        const W = img.width, H = img.height, d = img.data, k = Math.min(1, 320 / Math.max(W, H)), w = Math.max(4, Math.round(W * k)), h = Math.max(4, Math.round(H * k));
        const sc = document.createElement('canvas'); sc.width = W; sc.height = H; sc.getContext('2d').putImageData(img, 0, 0);
        const sm = document.createElement('canvas'); sm.width = w; sm.height = h; const sg = sm.getContext('2d', {willReadFrequently: true}); sg.drawImage(sc, 0, 0, w, h);
        const sd = sg.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
        for (let p = 0; p < m.length; p++) m[p] = Math.min(sd[p * 4], sd[p * 4 + 1], sd[p * 4 + 2]);
        const r = Math.max(1, Math.round(Math.max(w, h) * (0.008 + (sizeV || 50) / 100 * 0.06))), tmp = new Float32Array(m.length), er = new Float32Array(m.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 255; for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) v = Math.min(v, m[y * w + i]); tmp[y * w + x] = v; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 255; for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) v = Math.min(v, tmp[j * w + x]); er[y * w + x] = v; }
        const sorted = Array.from(er).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.03)]; // le vrai noir de l'image : pas un reflet
        const vc = document.createElement('canvas'); vc.width = w; vc.height = h; const vg = vc.getContext('2d'), vi = vg.createImageData(w, h);
        for (let p = 0; p < er.length; p++) { const v = Math.max(0, er[p] - floor); vi.data[p * 4] = vi.data[p * 4 + 1] = vi.data[p * 4 + 2] = v; vi.data[p * 4 + 3] = 255; }
        vg.putImageData(vi, 0, 0);
        const big = document.createElement('canvas'); big.width = W; big.height = H; const bg = big.getContext('2d', {willReadFrequently: true}); bg.filter = `blur(${Math.max(1, r * W / w * 0.7)}px)`; bg.imageSmoothingQuality = 'high'; bg.drawImage(vc, 0, 0, W, H);
        const V = bg.getImageData(0, 0, W, H).data, a = Math.min(0.97, amount / 100);
        for (let i = 0; i < d.length; i += 4) { const v = V[i] * a; if (v < 0.5) continue; const g = 255 / Math.max(30, 255 - v); for (let c = 0; c < 3; c++) d[i + c] = clamp255((d[i + c] - v) * g); }
        return img;
    }
    /* ═══ Menu Filtre (comme Photoshop) : chaque filtre est une étape {t, …réglages} d'une liste (filters.chain), posée dans un
       calque de réglage : non destructif, réglable ensuite, dosable (opacité), limitable (masque). Les tailles suivent la largeur
       de l'image (s = largeur / 1000) : le même effet sur l'aperçu et sur l'image enregistrée en pleine taille. ═══ */
    const fxRng = seed => { let x = (seed >>> 0) || 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
    const fxCanvas = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; };
    const fxBack = (img, c) => img.data.set(c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, img.width, img.height).data);
    const fxLum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    /** déplacer les points : (x, y) de l'image finale ← fn(x, y) dans l'image de départ (lissé) */
    function fxDisplace(img, fn) {
        const W = img.width, H = img.height, src = new Uint8ClampedArray(img.data), o = img.data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const r = fn(x, y); if (!r) continue; let [sx, sy] = r; sx = Math.max(0, Math.min(W - 1.001, sx)); sy = Math.max(0, Math.min(H - 1.001, sy));
            const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = (y * W + x) * 4, a = (y0 * W + x0) * 4, b = a + 4, c = a + W * 4, d = c + 4;
            for (let k = 0; k < 4; k++) o[i + k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[c + k] * (1 - fx) + src[d + k] * fx) * fy;
        }
    }
    /** moyenne de copies déplacées (flous de mouvement, radial, rotatif) */
    function fxAccum(img, n, place) { const c0 = fxCanvas(img), c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(c0, 0, 0); for (let k = 0; k < n; k++) { g.save(); g.globalAlpha = 1 / (k + 2); place(g, k / Math.max(1, n - 1)); g.drawImage(c0, 0, 0); g.restore(); } fxBack(img, c); }
    function fxSobel(L, W, H) { const m = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x, gx = L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - 1] - L[p + W - 1], gy = L[p + W - 1] + 2 * L[p + W] + L[p + W + 1] - L[p - W - 1] - 2 * L[p - W] - L[p - W + 1]; m[p] = Math.hypot(gx, gy); } return m; }
    const fxLumArr = img => { const L = new Float32Array(img.width * img.height); for (let p = 0; p < L.length; p++) L[p] = fxLum(img.data, p * 4); return L; };
    /** Kuwahara : chaque point prend la couleur moyenne du coin le plus uni autour de lui (effet peinture), rapide grâce aux sommes cumulées */
    function fxKuwahara(img, r) {
        // par bandes (sommes cumulées d'une bande à la fois) : rapide et peu de mémoire, même sur une grande photo
        const W = img.width, H = img.height, d = img.data, out = new Uint8ClampedArray(d), BAND = 256, W1 = W + 1;
        for (let top = 0; top < H; top += BAND) {
            const y0b = Math.max(0, top - r), y1b = Math.min(H - 1, top + BAND - 1 + r), h = y1b - y0b + 1, S = W1 * (h + 1);
            const IR = new Float64Array(S), IG = new Float64Array(S), IB = new Float64Array(S), IL = new Float64Array(S);
            for (let yy = 0; yy < h; yy++) { const y = y0b + yy; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, rr = d[i], gg = d[i + 1], bb = d[i + 2], l = 0.299 * rr + 0.587 * gg + 0.114 * bb, q = (yy + 1) * W1 + x + 1, up = q - W1;
                IR[q] = rr + IR[q - 1] + IR[up] - IR[up - 1]; IG[q] = gg + IG[q - 1] + IG[up] - IG[up - 1]; IB[q] = bb + IB[q - 1] + IB[up] - IB[up - 1]; IL[q] = l * l + IL[q - 1] + IL[up] - IL[up - 1]; } }
            const yEnd = Math.min(H, top + BAND);
            for (let y = top; y < yEnd; y++) for (let x = 0; x < W; x++) {
                let best = Infinity, br = 0, bg = 0, bb = 0;
                for (let k = 0; k < 4; k++) {
                    const ax = k & 1 ? 1 : -1, ay = k & 2 ? 1 : -1;
                    const x0 = ax < 0 ? Math.max(0, x - r) : x, x1 = ax < 0 ? x : Math.min(W - 1, x + r), ya = (ay < 0 ? Math.max(0, y - r) : y) - y0b, yb = (ay < 0 ? y : Math.min(H - 1, y + r)) - y0b, n = (x1 - x0 + 1) * (yb - ya + 1);
                    const A = (yb + 1) * W1 + x1 + 1, Bq = ya * W1 + x1 + 1, C = (yb + 1) * W1 + x0, Dq = ya * W1 + x0;
                    const r0 = (IR[A] - IR[Bq] - IR[C] + IR[Dq]) / n, g0 = (IG[A] - IG[Bq] - IG[C] + IG[Dq]) / n, b0 = (IB[A] - IB[Bq] - IB[C] + IB[Dq]) / n, l = 0.299 * r0 + 0.587 * g0 + 0.114 * b0, v = (IL[A] - IL[Bq] - IL[C] + IL[Dq]) / n - l * l;
                    if (v < best) { best = v; br = r0; bg = g0; bb = b0; }
                }
                const i = (y * W + x) * 4; out[i] = br; out[i + 1] = bg; out[i + 2] = bb;
            }
        }
        d.set(out);
    }
    function fxMinMax(img, r, isMax) { const W = img.width, H = img.height, d = img.data, t = new Uint8ClampedArray(d); const pass = (src, dst, horiz) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) { let v = isMax ? 0 : 255; for (let k = -r; k <= r; k++) { const xx = horiz ? Math.min(W - 1, Math.max(0, x + k)) : x, yy = horiz ? y : Math.min(H - 1, Math.max(0, y + k)); const u = src[(yy * W + xx) * 4 + c]; v = isMax ? Math.max(v, u) : Math.min(v, u); } dst[i + c] = v; } } }; pass(d, t, true); pass(t, d, false); }
    function fxNoise2(seed) { const R = fxRng(seed), N = 256, perm = Array.from({length: N}, (_, i) => i).sort(() => R() - 0.5), val = Array.from({length: N}, R); const h = (x, y) => val[perm[(perm[x & 255] + y) & 255]]; const sm = t => t * t * (3 - 2 * t);
        return (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0); return (h(x0, y0) * (1 - fx) + h(x0 + 1, y0) * fx) * (1 - fy) + (h(x0, y0 + 1) * (1 - fx) + h(x0 + 1, y0 + 1) * fx) * fy; }; }
    // [catégorie, nom, réglages [clé, libellé, min, max, départ, pas?, unité? (K17 : dans la case, pas dans le libellé)], fonction(img, p, s)]
    const RT_FX = {
        gauss: ['Flou', 'Flou gaussien', [['r', 'Rayon', 0, 100, 8, 0.5]], (img, p, s) => { const b = rtBlurred(img, p.r * s); img.data.set(b); }],
        motion: ['Flou', 'Flou de mouvement', [['angle', 'Angle', -180, 180, 0, 1, '°'], ['dist', 'Distance', 1, 300, 40, 1]], (img, p, s) => { const a = p.angle * Math.PI / 180, D = p.dist * s, n = Math.max(4, Math.min(48, Math.round(D / 2))); fxAccum(img, n, (g, u) => g.translate(Math.cos(a) * D * (u - 0.5), Math.sin(a) * D * (u - 0.5))); }],
        radial: ['Flou', 'Flou radial (zoom)', [['amount', 'Force', 1, 100, 25, 1], ['cx', 'Centre X', 0, 100, 50, 1, '%'], ['cy', 'Centre Y', 0, 100, 50, 1, '%']], (img, p) => { const cx = p.cx / 100 * img.width, cy = p.cy / 100 * img.height; fxAccum(img, 32, (g, u) => { const k = 1 + u * p.amount / 250; g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); }); }],
        spin: ['Flou', 'Flou rotatif', [['angle', 'Angle', 1, 60, 8, 0.5, '°'], ['cx', 'Centre X', 0, 100, 50, 1, '%'], ['cy', 'Centre Y', 0, 100, 50, 1, '%']], (img, p) => { const cx = p.cx / 100 * img.width, cy = p.cy / 100 * img.height; fxAccum(img, 36, (g, u) => { g.translate(cx, cy); g.rotate((u - 0.5) * p.angle * Math.PI / 180); g.translate(-cx, -cy); }); }],
        surface: ['Flou', 'Flou de surface (garde les contours)', [['r', 'Rayon', 1, 60, 8, 0.5], ['thr', 'Seuil', 1, 100, 25, 1]], (img, p, s) => { const d = img.data, b = rtBlurred(img, p.r * s); for (let i = 0; i < d.length; i += 4) { const df = (Math.abs(d[i] - b[i]) + Math.abs(d[i + 1] - b[i + 1]) + Math.abs(d[i + 2] - b[i + 2])) / 3, w = Math.max(0, 1 - df / (p.thr * 1.2)); for (let c = 0; c < 3; c++) d[i + c] += (b[i + c] - d[i + c]) * w; } }],
        tilt: ['Flou', 'Décentrement (maquette, tilt-shift)', [['pos', 'Bande nette, hauteur', 0, 100, 55, 1, '%'], ['band', 'Largeur de la bande', 2, 90, 22, 1, '%'], ['r', 'Flou', 1, 80, 18, 0.5]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, b = rtBlurred(img, p.r * s); for (let y = 0; y < H; y++) { const t = Math.max(0, Math.min(1, (Math.abs(y / H - p.pos / 100) - p.band / 200) / Math.max(0.01, p.band / 200))); if (!t) continue; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) d[i + c] += (b[i + c] - d[i + c]) * t; } } }],
        bokeh: ['Flou', 'Flou de l’objectif (bokeh)', [['r', 'Rayon', 1, 60, 12, 0.5], ['bright', 'Points lumineux', 0, 100, 50, 1]], (img, p, s) => { const d = img.data, hi = new ImageData(new Uint8ClampedArray(d), img.width, img.height), th = 235 - p.bright; for (let i = 0; i < hi.data.length; i += 4) { if (fxLum(hi.data, i) < th) { hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = 0; } } const b = rtBlurred(img, p.r * s), h2 = rtBlurred(hi, p.r * s * 0.8), k = p.bright / 40; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(255 - (255 - b[i + c]) * (255 - h2[i + c] * k) / 255); }],
        noise: ['Bruit', 'Ajouter du bruit', [['amount', 'Quantité', 0, 100, 18, 1], ['mono', 'Monochrome (0 / 1)', 0, 1, 1, 1]], (img, p) => { const d = img.data, R = fxRng(777), a = p.amount * 2.2; for (let i = 0; i < d.length; i += 4) { if (p.mono) { const n = (R() - 0.5) * a; d[i] = clamp255(d[i] + n); d[i + 1] = clamp255(d[i + 1] + n); d[i + 2] = clamp255(d[i + 2] + n); } else for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (R() - 0.5) * a); } }],
        median: ['Bruit', 'Médiane', [['r', 'Rayon', 1, 4, 1, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, src = new Uint8ClampedArray(d), r = p.r, st = r > 2 ? 2 : 1, win = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) { win.length = 0; for (let dy = -r; dy <= r; dy += st) for (let dx = -r; dx <= r; dx += st) win.push(src[(Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))) * 4 + c]); win.sort((a, b) => a - b); d[i + c] = win[win.length >> 1]; } } }],
        dust: ['Bruit', 'Poussière et rayures', [['amount', 'Force', 1, 100, 50, 1]], (img, p) => rtDust(img, p.amount)],
        denoise2: ['Bruit', 'Réduire le bruit', [['amount', 'Force', 1, 100, 50, 1]], (img, p, s) => { rtFilters(img, {denoise: p.amount}); void s; }],
        unsharp: ['Netteté', 'Accentuation (masque flou)', [['amount', 'Gain', 0, 400, 100, 1, '%'], ['r', 'Rayon', 0.2, 30, 2, 0.1], ['thr', 'Seuil', 0, 80, 0, 1]], (img, p, s) => { const d = img.data, b = rtBlurred(img, Math.max(0.3, p.r * s)); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const df = d[i + c] - b[i + c]; if (Math.abs(df) > p.thr) d[i + c] = clamp255(d[i + c] + df * p.amount / 100); } }],
        highpass: ['Netteté', 'Passe-haut (pour accentuer en Incrustation)', [['r', 'Rayon', 0.5, 100, 8, 0.5]], (img, p, s) => { const d = img.data, b = rtBlurred(img, p.r * s); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(128 + d[i + c] - b[i + c]); }],
        emboss: ['Esthétiques', 'Estampage (relief)', [['angle', 'Angle', -180, 180, 135, 1, '°'], ['h', 'Hauteur', 1, 10, 2, 1], ['amount', 'Force', 1, 400, 120, 1, '%'], ['color', 'Garder les couleurs (0 / 1)', 0, 1, 0, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, L = fxLumArr(img), a = p.angle * Math.PI / 180, ox = Math.round(Math.cos(a) * p.h * Math.max(1, s)), oy = Math.round(Math.sin(a) * p.h * Math.max(1, s)); const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = (at(x + ox, y + oy) - at(x - ox, y - oy)) * p.amount / 100, i = (y * W + x) * 4; if (p.color) for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + v); else d[i] = d[i + 1] = d[i + 2] = clamp255(128 + v); } }],
        edges: ['Esthétiques', 'Tracé des contours', [['amount', 'Force', 10, 300, 100, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, ch = [0, 1, 2].map(c => { const a = new Float32Array(W * H); for (let q = 0; q < a.length; q++) a[q] = d[q * 4 + c]; return fxSobel(a, W, H); }); for (let q = 0; q < W * H; q++) for (let c = 0; c < 3; c++) d[q * 4 + c] = clamp255(255 - ch[c][q] * p.amount / 400); }],
        glowedges: ['Esthétiques', 'Contours lumineux (néon)', [['w', 'Épaisseur', 0, 10, 1, 0.5], ['bright', 'Luminosité', 1, 20, 8, 0.5]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, b = p.w ? new ImageData(rtBlurred(img, p.w * s), W, H) : img, ch = [0, 1, 2].map(c => { const a = new Float32Array(W * H); for (let q = 0; q < a.length; q++) a[q] = b.data[q * 4 + c]; return fxSobel(a, W, H); }); for (let q = 0; q < W * H; q++) for (let c = 0; c < 3; c++) d[q * 4 + c] = clamp255(ch[c][q] * p.bright / 12); }],
        solarize: ['Esthétiques', 'Solarisation', [['thr', 'Seuil', 0, 255, 128, 1]], (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) if (d[i + c] > p.thr) d[i + c] = 255 - d[i + c]; }],
        posterize: ['Esthétiques', 'Postérisation', [['levels', 'Niveaux', 2, 32, 5, 1]], (img, p) => { const d = img.data, k = 255 / (p.levels - 1); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(Math.round(d[i + c] / k) * k); }],
        threshold: ['Esthétiques', 'Seuil (noir et blanc pur)', [['level', 'Seuil', 0, 255, 128, 1]], (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = fxLum(d, i) >= p.level ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }],
        diffuse: ['Esthétiques', 'Diffusion', [['r', 'Rayon', 1, 40, 4, 0.5]], (img, p, s) => { const R = fxRng(91), r = p.r * Math.max(1, s); fxDisplace(img, (x, y) => [x + (R() - 0.5) * 2 * r, y + (R() - 0.5) * 2 * r]); }],
        wind: ['Esthétiques', 'Vent', [['len', 'Longueur', 2, 200, 40, 1], ['dir', 'Vers la droite (1) / gauche (0)', 0, 1, 1, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, R = fxRng(5), len = p.len * s; for (let y = 0; y < H; y++) { let carry = null, left = 0; for (let k = 0; k < W; k++) { const x = p.dir ? k : W - 1 - k, i = (y * W + x) * 4, l = fxLum(d, i); if (l > 170 && R() < 0.08) { carry = [d[i], d[i + 1], d[i + 2]]; left = len * (0.4 + R() * 0.6); } else if (carry && left > 0) { const t = left / len; for (let c = 0; c < 3; c++) d[i + c] = Math.max(d[i + c], d[i + c] + (carry[c] - d[i + c]) * t); left--; } } } }],
        oil: ['Artistiques', 'Peinture à l’huile', [['r', 'Taille de la touche', 1, 12, 4, 1]], (img, p, s) => fxKuwahara(img, Math.max(1, Math.round(p.r * Math.max(1, s))))],
        watercolor: ['Artistiques', 'Aquarelle', [['r', 'Taille des taches', 1, 12, 5, 1], ['edge', 'Contours', 0, 100, 40, 1]], (img, p, s) => { const W = img.width, H = img.height; fxKuwahara(img, Math.max(1, Math.round(p.r * Math.max(1, s)))); const d = img.data, m = fxSobel(fxLumArr(img), W, H), R = fxRng(13); for (let q = 0; q < W * H; q++) { const k = Math.max(0.35, 1 - m[q] * p.edge / 9000) * (0.97 + R() * 0.05); for (let c = 0; c < 3; c++) d[q * 4 + c] = clamp255(d[q * 4 + c] * k + (255 - d[q * 4 + c]) * 0.06); } }],
        pencil: ['Artistiques', 'Dessin au crayon', [['r', 'Trait', 1, 40, 6, 0.5], ['strength', 'Force', 0, 100, 70, 1], ['color', 'En couleur (0 / 1)', 0, 1, 0, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, L = fxLumArr(img), inv = new ImageData(W, H); for (let q = 0; q < L.length; q++) { inv.data[q * 4] = inv.data[q * 4 + 1] = inv.data[q * 4 + 2] = 255 - L[q]; inv.data[q * 4 + 3] = 255; } const b = rtBlurred(inv, p.r * s); for (let q = 0; q < L.length; q++) { const v = Math.min(255, L[q] * 255 / Math.max(1, 255 - b[q * 4])), k = 1 - (1 - v / 255) * (0.4 + p.strength / 100); const i = q * 4; if (p.color) for (let c = 0; c < 3; c++) d[i + c] = clamp255(255 - (255 - d[i + c]) * 0.55 * (1 - k) * 2.2); else d[i] = d[i + 1] = d[i + 2] = clamp255(255 * k); } }],
        comic: ['Artistiques', 'Bande dessinée', [['levels', 'Couleurs', 2, 8, 4, 1], ['edge', 'Traits noirs', 0, 100, 60, 1]], (img, p, s) => { const W = img.width, H = img.height; fxKuwahara(img, Math.max(1, Math.round(2 * Math.max(1, s)))); const d = img.data, k = 255 / (p.levels - 1), m = fxSobel(fxLumArr(img), W, H), th = 520 - p.edge * 4; for (let q = 0; q < W * H; q++) { const i = q * 4; if (m[q] > th) { d[i] = d[i + 1] = d[i + 2] = 20; continue; } for (let c = 0; c < 3; c++) d[i + c] = Math.round(Math.round(d[i + c] / k) * k); } }],
        oldfilm: ['Artistiques', 'Vieux film', [['amount', 'Usure', 0, 100, 60, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, R = fxRng(2024), a = p.amount / 100; for (let i = 0; i < d.length; i += 4) { const y = fxLum(d, i), n = (R() - 0.5) * 50 * a; d[i] = clamp255(y * 1.07 + 18 + n); d[i + 1] = clamp255(y * 0.92 + 8 + n); d[i + 2] = clamp255(y * 0.72 + n); }
            const c = fxCanvas(img), g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,240,.55)'; for (let k = 0; k < Math.round(8 * a); k++) { const x = R() * W; g.lineWidth = Math.max(1, s * (0.6 + R())); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (R() - 0.5) * 20 * s, H); g.stroke(); } g.fillStyle = 'rgba(20,15,10,.7)'; for (let k = 0; k < Math.round(120 * a); k++) { g.beginPath(); g.arc(R() * W, R() * H, Math.max(0.6, R() * 2.5 * s), 0, Math.PI * 2); g.fill(); } fxBack(img, c); }],
        mosaic: ['Pixellisation', 'Mosaïque', [['size', 'Taille des carreaux', 2, 200, 16, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(2, Math.round(p.size * s)); for (let y0 = 0; y0 < H; y0 += z) for (let x0 = 0; x0 < W; x0 += z) { let n = 0, r = 0, g = 0, b = 0; for (let y = y0; y < Math.min(H, y0 + z); y++) for (let x = x0; x < Math.min(W, x0 + z); x++) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } for (let y = y0; y < Math.min(H, y0 + z); y++) for (let x = x0; x < Math.min(W, x0 + z); x++) { const i = (y * W + x) * 4; d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; } } }],
        halftone: ['Pixellisation', 'Demi-teinte (points d’imprimerie)', [['size', 'Taille des points', 1, 60, 8, 1], ['color', 'En couleur (0 / 1)', 0, 1, 0, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(1, p.size * s);
            // points de 1 ou 2 : une trame fine (Bayer 4 × 4) calculée point par point, plutôt qu'un rond par pixel (trop lent sur une grande photo)
            if (z < 2.5) { const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, t = (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16; if (p.color) { for (let k = 0; k < 3; k++) d[i + k] = d[i + k] / 255 > t ? 255 : d[i + k] * 0.85 | 0; } else { const v = fxLum(d, i) / 255 > t ? 255 : 17; d[i] = d[i + 1] = d[i + 2] = v; } } return; }
            const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
            for (let y = 0; y < H; y += z) for (let x = 0; x < W; x += z) { const i = (Math.min(H - 1, Math.round(y + z / 2)) * W + Math.min(W - 1, Math.round(x + z / 2))) * 4, l = fxLum(d, i) / 255, rad = z / 2 * Math.sqrt(1 - l) * 1.35; if (rad < 0.3) continue; g.fillStyle = p.color ? `rgb(${d[i] * 0.85 | 0},${d[i + 1] * 0.85 | 0},${d[i + 2] * 0.85 | 0})` : '#111'; g.beginPath(); g.arc(x + z / 2, y + z / 2, rad, 0, Math.PI * 2); g.fill(); } fxBack(img, c); }],
        crystal: ['Pixellisation', 'Cristallisation', [['size', 'Taille des cristaux', 3, 150, 18, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(3, p.size * s), gw = Math.ceil(W / z), gh = Math.ceil(H / z), R = fxRng(3), seeds = []; for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) seeds.push([(i + R()) * z, (j + R()) * z]); const col = seeds.map(([x, y]) => { const i = (Math.min(H - 1, y | 0) * W + Math.min(W - 1, x | 0)) * 4; return [d[i], d[i + 1], d[i + 2]]; });
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gi = Math.floor(x / z), gj = Math.floor(y / z); let best = 1e18, bk = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = gi + di, jj = gj + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue; const k = jj * gw + ii, dx = seeds[k][0] - x, dy = seeds[k][1] - y, dd = dx * dx + dy * dy; if (dd < best) { best = dd; bk = k; } } const o = (y * W + x) * 4; d[o] = col[bk][0]; d[o + 1] = col[bk][1]; d[o + 2] = col[bk][2]; } }],
        pointil: ['Pixellisation', 'Pointillisme', [['size', 'Taille des points', 3, 60, 10, 1]], (img, p, s) => { const W = img.width, H = img.height, d = img.data, z = Math.max(3, p.size * s), R = fxRng(8), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#f6f1e6'; g.fillRect(0, 0, W, H); const n = Math.round(W * H / (z * z) * 2.2);
            for (let k = 0; k < n; k++) { const x = R() * W, y = R() * H, i = ((y | 0) * W + (x | 0)) * 4; g.fillStyle = `rgb(${clamp255(d[i] + (R() - 0.5) * 30) | 0},${clamp255(d[i + 1] + (R() - 0.5) * 30) | 0},${clamp255(d[i + 2] + (R() - 0.5) * 30) | 0})`; g.beginPath(); g.arc(x, y, z * (0.35 + R() * 0.3), 0, Math.PI * 2); g.fill(); } fxBack(img, c); }],
        lighting: ['Rendu', 'Éclairage (projecteur)', [['x', 'Lumière X', 0, 100, 30, 1, '%'], ['y', 'Lumière Y', 0, 100, 25, 1, '%'], ['radius', 'Portée', 10, 200, 80, 1, '%'], ['power', 'Intensité', 0, 200, 80, 1, '%'], ['ambient', 'Lumière ambiante', 0, 100, 45, 1, '%']], (img, p) => { const W = img.width, H = img.height, d = img.data, lx = p.x / 100 * W, ly = p.y / 100 * H, R = p.radius / 100 * Math.max(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = Math.max(0, 1 - Math.hypot(x - lx, y - ly) / R), f = p.ambient / 100 + p.power / 100 * t * t * (3 - 2 * t), i = (y * W + x) * 4; for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] * f); } }],
        clouds: ['Rendu', 'Nuages (texture)', [['scale', 'Taille', 1, 100, 30, 1], ['amount', 'Force', 0, 100, 40, 1]], (img, p) => { const W = img.width, H = img.height, d = img.data, nz = fxNoise2(42), sc = (101 - p.scale) / 100 * 12 / Math.max(W, H), a = p.amount / 100; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0, f = 1, am = 0.5; for (let o = 0; o < 5; o++) { v += nz(x * sc * f, y * sc * f) * am; f *= 2; am /= 2; } const i = (y * W + x) * 4, n = v * 255; for (let c = 0; c < 3; c++) { const b = d[i + c], sl = n < 128 ? b - (1 - 2 * n / 255) * b * (1 - b / 255) : b + (2 * n / 255 - 1) * (Math.sqrt(b / 255) * 255 - b); d[i + c] = clamp255(b + (sl - b) * a); } } }],
        flare: ['Rendu', 'Halo de lumière (flare)', [['x', 'Position X', 0, 100, 25, 1, '%'], ['y', 'Position Y', 0, 100, 25, 1, '%'], ['bright', 'Luminosité', 10, 200, 100, 1, '%']], (img, p) => { const W = img.width, H = img.height, c = fxCanvas(img), g = c.getContext('2d'), x = p.x / 100 * W, y = p.y / 100 * H, M = Math.max(W, H), k = p.bright / 100; g.globalCompositeOperation = 'screen';
            const blob = (cx, cy, r, col, a) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); };
            blob(x, y, M * 0.25 * k, '255,240,210', 0.9); blob(x, y, M * 0.05 * k, '255,255,255', 1); [[0.3, 0.04, '120,200,255', 0.35], [0.55, 0.025, '255,170,90', 0.4], [0.8, 0.07, '150,255,170', 0.2], [1.2, 0.05, '200,140,255', 0.25]].forEach(([t, r, col, a]) => blob(x + (W / 2 - x) * t * 2, y + (H / 2 - y) * t * 2, M * r * k, col, a * k)); fxBack(img, c); }],
        glow: ['Rendu', 'Lueur diffuse', [['thr', 'À partir de (luminosité)', 0, 255, 190, 1], ['r', 'Rayon', 1, 100, 20, 0.5], ['amount', 'Force', 0, 200, 80, 1, '%']], (img, p, s) => { const d = img.data, hi = new ImageData(new Uint8ClampedArray(d), img.width, img.height); for (let i = 0; i < hi.data.length; i += 4) if (fxLum(hi.data, i) < p.thr) hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = 0; const b = rtBlurred(hi, p.r * s), k = p.amount / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(255 - (255 - d[i + c]) * (255 - b[i + c] * k) / 255); }],
        twirl: ['Déformation', 'Tourbillon', [['angle', 'Angle', -720, 720, 180, 1, '°'], ['radius', 'Rayon', 5, 100, 50, 1, '%'], ['cx', 'Centre X', 0, 100, 50, 1, '%'], ['cy', 'Centre Y', 0, 100, 50, 1, '%']], (img, p) => { const W = img.width, H = img.height, cx = p.cx / 100 * W, cy = p.cy / 100 * H, R = p.radius / 100 * Math.min(W, H), A = p.angle * Math.PI / 180; fxDisplace(img, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= R) return null; const t = 1 - r / R, a = A * t * t, c = Math.cos(a), si = Math.sin(a); return [cx + dx * c - dy * si, cy + dx * si + dy * c]; }); }],
        pinch: ['Déformation', 'Pincement / sphérisation', [['amount', 'Force (− sphère, + pincement)', -100, 100, 50, 1], ['radius', 'Rayon', 5, 100, 50, 1, '%'], ['cx', 'Centre X', 0, 100, 50, 1, '%'], ['cy', 'Centre Y', 0, 100, 50, 1, '%']], (img, p) => { const W = img.width, H = img.height, cx = p.cx / 100 * W, cy = p.cy / 100 * H, R = p.radius / 100 * Math.min(W, H), e = p.amount >= 0 ? 1 / (1 + p.amount / 60) : 1 + -p.amount / 60; fxDisplace(img, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= R || r < 0.5) return null; const nr = Math.pow(r / R, e) * R / r; return [cx + dx * nr, cy + dy * nr]; }); }],
        wave: ['Déformation', 'Onde', [['amp', 'Amplitude', 0, 100, 10, 0.5], ['wl', 'Longueur d’onde', 5, 400, 80, 1], ['dir', 'Horizontale (0) / verticale (1)', 0, 1, 0, 1]], (img, p, s) => { const a = p.amp * s, L = p.wl * s; fxDisplace(img, (x, y) => p.dir ? [x, y + a * Math.sin(2 * Math.PI * x / L)] : [x + a * Math.sin(2 * Math.PI * y / L), y]); }],
        ripple: ['Déformation', 'Ondulation (ronds dans l’eau)', [['amp', 'Amplitude', 0, 60, 8, 0.5], ['wl', 'Écart des ronds', 5, 200, 30, 1], ['cx', 'Centre X', 0, 100, 50, 1, '%'], ['cy', 'Centre Y', 0, 100, 50, 1, '%']], (img, p, s) => { const W = img.width, H = img.height, cx = p.cx / 100 * W, cy = p.cy / 100 * H, a = p.amp * s, L = p.wl * s; fxDisplace(img, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1, k = a * Math.sin(2 * Math.PI * r / L) / r; return [x + dx * k, y + dy * k]; }); }],
        polar: ['Déformation', 'Coordonnées polaires', [['mode', 'Rectangle → polaire (0) / l’inverse (1)', 0, 1, 0, 1]], (img, p) => { const W = img.width, H = img.height, cx = W / 2, cy = H / 2, M = Math.hypot(cx, cy); fxDisplace(img, (x, y) => { if (!p.mode) { const dx = x - cx, dy = y - cy, a = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); return [a * W, Math.hypot(dx, dy) / M * H]; } const a = x / W * 2 * Math.PI - Math.PI, r = y / H * M; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }); }],
        minimum: ['Autres', 'Minimum (assombrit, épaissit le sombre)', [['r', 'Rayon', 1, 20, 2, 1]], (img, p, s) => fxMinMax(img, Math.max(1, Math.round(p.r * Math.max(1, s / 2))), false)],
        maximum: ['Autres', 'Maximum (éclaircit, épaissit le clair)', [['r', 'Rayon', 1, 20, 2, 1]], (img, p, s) => fxMinMax(img, Math.max(1, Math.round(p.r * Math.max(1, s / 2))), true)],
        offset: ['Autres', 'Décalage (avec retour de l’autre côté)', [['dx', 'Horizontal', -100, 100, 25, 1, '%'], ['dy', 'Vertical', -100, 100, 0, 1, '%']], (img, p) => { const W = img.width, H = img.height, ox = Math.round(p.dx / 100 * W), oy = Math.round(p.dy / 100 * H); fxDisplace(img, (x, y) => [((x - ox) % W + W) % W, ((y - oy) % H + H) % H]); }],
        deglare: ['Autres', 'Enlever les reflets (vitre)', [['amount', 'Reflets en moins', 0, 100, 60, 1], ['size', 'Taille des reflets (0 = moyenne)', 0, 100, 0, 1]], (img, p) => rtDeglare(img, p.amount, p.size)],
    };
    const fxDefaults = t => Object.fromEntries((RT_FX[t]?.[2] || []).map(r => [r[0], r[4]]));
    function rtFxApply(img, step) { const f = RT_FX[step?.t]; if (!f) return; const p = {...fxDefaults(step.t), ...step}; f[2].forEach(([k, , mn, mx, dv]) => { const v = Number(p[k]); p[k] = Number.isFinite(v) ? Math.min(mx, Math.max(mn, v)) : dv; }); /* réglages bornés (projet ou action d’ailleurs) */ try { f[3](img, p, img.width / 1000); } catch (err) { console.warn('Filtre', step.t, err); } }
    function rtFilters(img, f) {
        const W = img.width, H = img.height, d = img.data;
        if (f.deglare > 0) rtDeglare(img, f.deglare, f.deglareSize);
        if (f.blur > 0) { const b = rtBlurred(img, f.blur * W / 4000); for (let i = 0; i < d.length; i += 4) { d[i] = b[i]; d[i + 1] = b[i + 1]; d[i + 2] = b[i + 2]; } }
        if (f.denoise > 0) { const b = rtBlurred(img, Math.max(0.6, W / 1400 * (1 + f.denoise / 40))), k = f.denoise / 100;
            for (let i = 0; i < d.length; i += 4) { const diff = (Math.abs(d[i] - b[i]) + Math.abs(d[i + 1] - b[i + 1]) + Math.abs(d[i + 2] - b[i + 2])) / 3, w = k * Math.max(0, 1 - diff / 42); for (let c = 0; c < 3; c++) d[i + c] += (b[i + c] - d[i + c]) * w; } }
        if (f.sharpen > 0) { const b = rtBlurred(img, Math.max(0.8, W / 1600)), k = f.sharpen / 35; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (d[i + c] - b[i + c]) * k); }
        if (f.clarity) { const b = rtBlurred(img, W / 60), k = f.clarity / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (d[i + c] - b[i + c]) * k); }
        if (f.grain > 0) { const amp = f.grain * 0.55; for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; const n = (((h ^ (h >>> 16)) & 1023) / 1023 - 0.5) * amp; d[i] = clamp255(d[i] + n); d[i + 1] = clamp255(d[i + 1] + n); d[i + 2] = clamp255(d[i + 2] + n); } }
        if (f.vignette) { const cx = W / 2, cy = H / 2, md = Math.hypot(cx, cy), k = f.vignette / 100;
            for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { const t = Math.hypot(x - cx, y - cy) / md, v = t < 0.45 ? 0 : Math.min(1, (t - 0.45) / 0.6), w = v * v * (3 - 2 * v), m = k > 0 ? 1 - k * w * 0.85 : 1 - k * w * 0.6; d[i] = clamp255(d[i] * m); d[i + 1] = clamp255(d[i + 1] * m); d[i + 2] = clamp255(d[i + 2] * m); } }
        if (Array.isArray(f.chain)) f.chain.forEach(step => rtFxApply(img, step)); // menu Filtre
        return img;
    }
    /** Réglage automatique : les 0,5 % les plus sombres deviennent noirs, les 0,5 % les plus clairs deviennent blancs. */
    function rtAuto(img, st) {
        const hist = new Array(256).fill(0); let n = 0;
        for (let i = 0; i < img.data.length; i += 16) { hist[Math.round(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2])]++; n++; }
        let lo = 0, hi = 255, acc = 0;
        while (lo < 254 && (acc += hist[lo]) < n * 0.005) lo++;
        acc = 0; while (hi > lo + 1 && (acc += hist[hi]) < n * 0.005) hi--;
        Object.assign(st, rtDefault(), {bw: st.bw, sepia: st.sepia, invert: st.invert, strokes: st.strokes || [], filters: st.filters || {}, crop: st.crop || null, persp: st.persp || null});
        if (hi - lo < 8) return; // image presque d'une seule teinte : rien à étirer
        st.curves.rgb = [[lo, 0], [Math.round((lo + hi) / 2), 128], [hi, 255]];
    }
    const RT_PRESETS = [
        ['Auto', st => st._auto = true],
        ['Vieille photo ravivée', st => Object.assign(st, {contrast: 22, shadows: 18, highlights: -12, saturation: 18, warmth: -8, curves: {...rtDefault().curves, rgb: [[0, 0], [70, 58], [190, 205], [255, 255]]}})],
        ['Document lisible', st => Object.assign(st, {bw: true, contrast: 45, brightness: 12, curves: {...rtDefault().curves, rgb: [[0, 0], [90, 40], [200, 245], [255, 255]]}})],
        ['Sépia doux', st => Object.assign(st, {sepia: true, contrast: 10, shadows: 10})],
        ['Négatif → positif', st => Object.assign(st, {invert: true, contrast: 15})],
    ];
    const mediaSrc = m => `media/${encodeURIComponent(m.filename)}?v=${m._cacheBust || ''}`;

    /* ── Correcteur de taches et tampon de duplication ──
       Chaque coup est noté en coordonnées relatives (0 à 1) : on le rejoue sur l'aperçu puis, à l'enregistrement, sur l'image en pleine taille. */
    /** Copie un disque de (sx,sy) vers (cx,cy), bord adouci ; `offset` corrige la teinte (correcteur). Lit dans `from`, écrit dans `data`. */
    function rtDab(data, from, W, H, cx, cy, sx, sy, r, offset = null, hard = 0.55) {
        const r2 = r * r, x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
        const dx = Math.round(sx - cx), dy = Math.round(sy - cy);
        for (let y = y0; y <= y1; y++) {
            const syy = y + dy; if (syy < 0 || syy >= H) continue;
            for (let x = x0; x <= x1; x++) {
                const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (d2 > r2) continue;
                const sxx = x + dx; if (sxx < 0 || sxx >= W) continue;
                const t = Math.sqrt(d2) / r, a = t <= hard ? 1 : 1 - (t - hard) / (1 - hard), w = a * a * (3 - 2 * a);
                const i = (y * W + x) * 4, j = (syy * W + sxx) * 4;
                for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - w) + (from[j + c] + (offset ? offset[c] : 0)) * w;
            }
        }
    }
    /** Pour une tache en (cx,cy) : la zone voisine dont le pourtour ressemble le plus au pourtour de la tache, et l'écart de teinte à corriger. */
    function rtHealSource(from, W, H, cx, cy, r) {
        const ring = []; for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; for (const f of [1.15, 1.45]) ring.push([Math.cos(a) * r * f, Math.sin(a) * r * f]); }
        const px = (x, y) => { x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y))); return (y * W + x) * 4; };
        let best = null;
        for (const dist of [2.4, 3.2, 4.4]) for (let k = 0; k < 16; k++) {
            const a = k / 16 * Math.PI * 2, sx = cx + Math.cos(a) * r * dist, sy = cy + Math.sin(a) * r * dist;
            if (sx - r < 0 || sy - r < 0 || sx + r >= W || sy + r >= H) continue;
            let ssd = 0; for (const [ox, oy] of ring) { const i = px(cx + ox, cy + oy), j = px(sx + ox, sy + oy); for (let c = 0; c < 3; c++) { const d = from[i + c] - from[j + c]; ssd += d * d; } }
            if (!best || ssd < best.ssd) best = {sx, sy, ssd};
        }
        if (!best) return null;
        const off = [0, 0, 0]; for (const [ox, oy] of ring) { const i = px(cx + ox, cy + oy), j = px(best.sx + ox, best.sy + oy); for (let c = 0; c < 3; c++) off[c] += from[i + c] - from[j + c]; }
        return {sx: best.sx, sy: best.sy, offset: off.map(v => v / ring.length)};
    }
    /** Rejoue les coups (groupes d'un même geste) sur une image : correcteur et tampon. */
    /** L'opacité (0 à 255) d'un masque de sélection, à la taille voulue */
    function rtMaskAlpha(maskCanvas, W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(maskCanvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data, a = new Uint8ClampedArray(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; }
    /**
     * 🧭 Restauration : les petites taches d'une photo (poussières, points blancs ou noirs, piqûres) — ce qui tranche nettement
     * sur son voisinage et reste petit. Renvoie des touches du correcteur {x, y, r} (en fractions de l'image).
     * force : 1 (seulement les taches franches) à 100 (beaucoup) ; taille : rayon maximal d'une tache, en points.
     */
    function rtSpots(img, force = 50, maxR = 6, inside = null) {
        const W = img.width, H = img.height, d = img.data, L = new Float32Array(W * H);
        for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        // voisinage : moyenne dans une boîte (intégrale), assez large pour ne pas « voir » la tache elle-même
        const R = Math.max(4, Math.round(maxR * 1.8)), I = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
        const mean = (x, y) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1); return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
        const thr = 70 - force * 0.55, mark = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (inside && !inside[i]) continue; if (Math.abs(L[i] - mean(x, y)) > thr) mark[i] = 1; }
        // les taches : des groupes de points marqués, petits et à peu près ronds (pas un bord, pas un trait du dessin)
        const out = [], stack = [], maxA = Math.PI * maxR * maxR * 1.4;
        for (let i = 0; i < mark.length; i++) {
            if (mark[i] !== 1) continue;
            let n = 0, sx = 0, sy = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, big = false; stack.push(i); mark[i] = 2;
            while (stack.length) { const k = stack.pop(), x = k % W, y = (k - x) / W; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (n > maxA) big = true;
                for (const q of [k - 1, k + 1, k - W, k + W]) if (q >= 0 && q < mark.length && mark[q] === 1 && Math.abs((q % W) - x) <= 1) { mark[q] = 2; stack.push(q); } }
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            if (big || n < 1 || bw > maxR * 2.6 || bh > maxR * 2.6 || Math.max(bw, bh) > 4 * Math.min(bw, bh) + 2) continue;
            out.push({x: (sx / n + .5) / W, y: (sy / n + .5) / H, r: (Math.max(bw, bh) / 2 * 1.6 + 3.5) / W}); // un peu plus large que la tache : ni anneau ni bord
            if (out.length >= 4000) break;
        }
        return out;
    }
    function rtReplayStrokes(img, strokes, masks = null) {
        const W = img.width, H = img.height, data = img.data;
        for (const g of strokes) {
            // 🪡 réparer : la zone peinte (ou repérée : un masque) est refaite d'après ses alentours
            if (g.tool === 'inpaint') { const mc = g.mask ? masks?.get(g.mask) : null, m = g.mask ? (mc ? rtMaskAlpha(mc, W, H) : null) : rtDabsMask(g.dabs, W, H); if (m) rtInpaint(img, m, {grain: g.grain !== false}); continue; }
            // sélection : remplir d'une couleur, rendre transparent, ou poser la zone ailleurs (tampon d'une zone)
            if (['fill', 'clear', 'patch'].includes(g.tool)) {
                const m = masks?.get(g.mask); if (!m) continue; const al = rtMaskAlpha(m, W, H);
                if (g.tool === 'fill') { const c = [1, 3, 5].map(k => parseInt(String(g.color || '#ffffff').slice(k, k + 2), 16)), op = g.opacity ?? 1; for (let i = 0; i < al.length; i++) { const w = al[i] / 255 * op; if (!w) continue; const j = i * 4; for (let k = 0; k < 3; k++) data[j + k] = data[j + k] * (1 - w) + c[k] * w; data[j + 3] = Math.max(data[j + 3], Math.round(255 * w)); } }
                if (g.tool === 'clear') for (let i = 0; i < al.length; i++) if (al[i]) data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (1 - al[i] / 255));
                if (g.tool === 'patch') { const from = new Uint8ClampedArray(data), dx = Math.round(g.dx * W), dy = Math.round(g.dy * H);
                    for (let y = 0; y < H; y++) { const sy = y - dy; if (sy < 0 || sy >= H) continue; for (let x = 0; x < W; x++) { const sx = x - dx; if (sx < 0 || sx >= W) continue; const w = al[sy * W + sx] / 255; if (!w) continue; const i = (y * W + x) * 4, j = (sy * W + sx) * 4; for (let k = 0; k < 3; k++) data[i + k] = data[i + k] * (1 - w) + from[j + k] * w; } } }
                continue;
            }
            const from = new Uint8ClampedArray(data); // chaque geste copie depuis l'état d'avant lui (pas de trainée qui se recopie)
            for (const d of g.dabs) {
                const cx = d.x * W, cy = d.y * H, r = Math.max(1, d.r * W);
                if (g.tool === 'heal') { const h = rtHealSource(from, W, H, cx, cy, r); if (h) rtDab(data, from, W, H, cx, cy, h.sx, h.sy, r, h.offset, 0.35); }
                else rtDab(data, from, W, H, cx, cy, cx + d.ox * W, cy + d.oy * H, r, null, d.h ?? 0.55);
            }
        }
        return img;
    }
    /* ── Calques d'annotation : des traits de pinceau et des textes, gardés en coordonnées relatives (0 à 1)
       pour être redessinés à n'importe quelle taille (aperçu, zoom, image en pleine taille à l'enregistrement). */
    const RT_BRUSHES = [['round', 'Rond net'], ['soft', 'Rond doux'], ['marker', 'Surligneur'], ['pencil', 'Crayon fin'], ['chalk', 'Craie (grain)'], ['tip', '🖌 Forme du panneau Formes'], ['eraser', 'Gomme']];
    const RT_FONTS = [['Arial, Helvetica, sans-serif', 'Sans empattement'], ['Georgia, "Times New Roman", serif', 'Avec empattement'], ['"Brush Script MT", "Segoe Script", cursive', 'Manuscrite'], ['"Courier New", monospace', 'Machine à écrire']];
    /* 🔤 Caractère (comme le panneau de Photoshop) : la variante d'une police (sa graisse : Light, Regular, Bold, Black, « 85 Extra Black »…, et l'italique),
       taille, interligne, crénage, approche, échelles, décalage vertical, capitales, exposant, souligné, barré, alignement, lissage */
    const RT_WEIGHTS = [[100, 'Thin', 'Extra-fin'], [200, 'ExtraLight', 'Ultra-léger'], [300, 'Light', 'Léger'], [400, 'Regular', 'Normal'], [500, 'Medium', 'Médium'], [600, 'SemiBold', 'Demi-gras'], [700, 'Bold', 'Gras'], [800, 'ExtraBold', 'Extra-gras'], [900, 'Black', 'Noir']];
    /** Le nom d'une variante (« Bold Italic », « 85 Extra Black », « Demi », « Light Oblique »…) → graisse et italique */
    function rtStyleOf(name) {
        const s = String(name || '').toLowerCase().replace(/[-_]/g, ' '), italic = /italic|oblique|kursiv|slanted|\bit\b/.test(s);
        let weight = /thin|hairline|\bhair\b/.test(s) ? 100 : /(extra|ultra) ?light/.test(s) ? 200 : /light|\blt\b/.test(s) ? 300 : /semi ?bold|demi ?bold|\bdemi\b|\bsb\b/.test(s) ? 600 : /(extra|ultra) ?bold/.test(s) ? 800
            : /heavy|black|\bfat\b|(extra|ultra) ?black/.test(s) ? 900 : /bold|\bbd\b/.test(s) ? 700 : /medium|\bmd\b/.test(s) ? 500 : 0;
        if (!weight) { const m = s.match(/^\s*(\d)\d\b/); weight = m ? ({1: 100, 2: 200, 3: 200, 4: 300, 5: 400, 6: 700, 7: 800, 8: 900, 9: 900})[m[1]] : 400; } // Univers, Frutiger : 45, 55, 65, 75, 85…
        return {weight, italic};
    }
    const rtTextWeight = op => op.weight || (op.bold ? 700 : 400);
    const rtTextFont = (op, size) => `${op.italic ? 'italic ' : ''}${op.caps === 'small' ? 'small-caps ' : ''}${rtTextWeight(op)} ${size}px ${op.font || 'Arial, sans-serif'}`;
    /* ¶ Paragraphe (comme Photoshop) : bloc de texte d'une largeur donnée (les lignes se coupent toutes seules), alignement et justification,
       retraits gauche, droite et de première ligne, espace avant et après chaque paragraphe, césure. */
    const RT_ALIGNS = [['left', 'Aligné à gauche'], ['center', 'Centré'], ['right', 'Aligné à droite'], ['justify-left', 'Justifié, dernière ligne à gauche'], ['justify-center', 'Justifié, dernière ligne centrée'], ['justify-right', 'Justifié, dernière ligne à droite'], ['justify-all', 'Tout justifié']];
    /** Petite icône d'alignement : quatre lignes, la dernière plus courte */
    const rtAlignIcon = k => { const j = k.startsWith('justify'), la = j ? (k === 'justify-all' ? 'all' : k.slice(8)) : k;
        const row = (y, w, a) => { const x = a === 'center' ? (16 - w) / 2 : a === 'right' ? 16 - w : 0; return `<rect x="${x}" y="${y}" width="${w}" height="1.6"/>`; };
        return `<svg viewBox="0 0 16 14" width="16" height="14" aria-hidden="true" fill="currentColor">${[0, 4, 8].map((y, i) => row(y, j ? 16 : [16, 11, 14][i], la === 'all' ? 'left' : la)).join('')}${row(12, la === 'all' ? 16 : 9, la === 'all' ? 'left' : la)}</svg>`; };
    /* Ω Glyphes : les caractères qu'on n'a pas sur le clavier, rangés par usage (la typo française et la généalogie d'abord), puis les blocs Unicode */
    const RT_GLYPH_SETS = [
        ['fr', 'Typographie française', '« » ‹ › “ ” ‘ ’ „ ‚ — – ‑ … · • ‧ ′ ″ ‰ № § ¶ † ‡ ° ª º ¹ ² ³ ᵉ ʳ ᵈ ˢ ᵐ ⁿ ¿ ¡ \u202F \u00A0 \u2009 \u00AD'],
        ['genea', 'Généalogie', '° ⚭ ∞ ⚮ ⚯ † ✝ ✞ ⚰ ⚱ ♂ ♀ ⚥ ~ ≈ ? ⁂ ⚔ ✠ ⚜ ✡ ☪ ☦ ⌂ ✉ ☩ ♰ ♱ ⚓ ⚒ ✿ ❀ ☙ ❧ ❦'],
        ['accents', 'Lettres accentuées', 'À Â Ä Æ Ç É È Ê Ë Î Ï Ô Ö Œ Ù Û Ü Ÿ à â ä æ ç é è ê ë î ï ô ö œ ù û ü ÿ Á Í Ó Ú Ñ á í ó ú ñ Ã Õ ã õ Å å Ø ø ß Ł ł Ś ś Ź ź Ż ż Č č Š š Ž ž Ř ř Ě ě Ő ő Ű ű'],
        ['lig', 'Ligatures et formes', 'ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ Œ œ Æ æ ſ ꝛ ꝑ ꝓ ꝗ ꝯ ꝰ ⁊ ꞇ ȝ þ ð Þ Ð'],
        ['money', 'Monnaies et chiffres', '€ £ $ ¢ ¥ ₣ ₤ ₶ ₺ ₹ ₽ ½ ⅓ ⅔ ¼ ¾ ⅛ ⅜ ⅝ ⅞ ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ Ⅷ Ⅸ Ⅹ Ⅺ Ⅻ Ⅼ Ⅽ Ⅾ Ⅿ'],
        ['sym', 'Symboles', '© ® ™ ℗ ℠ ✓ ✔ ✗ ✘ ★ ☆ ✦ ✧ ❖ ◆ ◇ ■ □ ▲ △ ● ○ ◉ ♠ ♣ ♥ ♦ ♪ ♫ ☀ ☁ ☂ ☎ ✂ ✎ ✍ ⌘ ⌥ ⇧ ⏎ ⚑ ⚐ ☐ ☑ ☒'],
        ['arrows', 'Flèches', '← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇑ ⇒ ⇓ ⇔ ⇕ ➔ ➜ ➝ ➞ ➟ ➠ ➡ ⟵ ⟶ ⟷ ↩ ↪ ↺ ↻ ⤴ ⤵'],
        ['math', 'Mathématiques', '± × ÷ − ≠ ≤ ≥ ≈ ≡ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ∀ ∃ ∅ ¬ ∧ ∨ ∴ ∵ ∝ ° ′ ″ ‰ µ π Ω'],
        ['greek', 'Grec', 'Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω'],
        ['u:0x00A0:0x00FF', 'Unicode : Latin-1', ''], ['u:0x0100:0x017F', 'Unicode : Latin étendu A', ''], ['u:0x0180:0x024F', 'Unicode : Latin étendu B', ''], ['u:0x0370:0x03FF', 'Unicode : grec', ''], ['u:0x0400:0x04FF', 'Unicode : cyrillique', ''],
        ['u:0x0590:0x05FF', 'Unicode : hébreu', ''], ['u:0x2000:0x206F', 'Unicode : ponctuation', ''], ['u:0x2070:0x209F', 'Unicode : exposants et indices', ''], ['u:0x20A0:0x20BF', 'Unicode : monnaies', ''], ['u:0x2100:0x214F', 'Unicode : symboles de lettres', ''],
        ['u:0x2150:0x218F', 'Unicode : nombres', ''], ['u:0x2190:0x21FF', 'Unicode : flèches', ''], ['u:0x2200:0x22FF', 'Unicode : mathématiques', ''], ['u:0x2500:0x257F', 'Unicode : traits de tableau', ''], ['u:0x25A0:0x25FF', 'Unicode : formes géométriques', ''],
        ['u:0x2600:0x26FF', 'Unicode : symboles divers', ''], ['u:0x2700:0x27BF', 'Unicode : casseau (dingbats)', ''], ['u:0xA720:0xA7FF', 'Unicode : latin étendu D (abréviations anciennes)', ''], ['u:0xFB00:0xFB4F', 'Unicode : ligatures', '']];
    const RT_GLYPH_NAMES = {'\u202F': 'espace fine insécable (avant ; : ! ? »)', '\u00A0': 'espace insécable', '\u2009': 'espace fine', '\u00AD': 'tiret conditionnel (césure)', '⚭': 'marié', '∞': 'marié (autre signe)', '⚮': 'divorcé', '†': 'décédé', '°': 'né', '⚰': 'inhumé', '~': 'vers', '⚔': 'mort au combat', '⁊': 'et (abréviation ancienne)', 'ſ': 's long'};
    const rtGlyphsOf = k => { const set = RT_GLYPH_SETS.find(g => g[0] === k); if (!set) return [];
        if (k.startsWith('u:')) { const [, a, b] = k.split(':').map(Number); const out = []; for (let i = a; i <= b; i++) { const ch = String.fromCodePoint(i); if (!/\p{Cc}|\p{Cn}|\p{Mn}/u.test(ch)) out.push(ch); } return out; }
        return set[2].split(' ').filter(Boolean); };
    /** Où couper un mot (césure simple, à la française) : entre deux consonnes (sauf ch, ph, gn, bl, tr…), ou avant une consonne seule entre deux voyelles ; aux tirets conditionnels d'abord */
    function rtHyphenPoints(w) {
        if (w.includes('\u00AD')) { const out = []; let k = 0; for (const ch of w) { if (ch === '\u00AD') out.push(k); else k++; } return out; }
        const s = w.toLowerCase(), V = /[aeiouyàâäéèêëîïôöùûüœæ]/, n = s.length, out = [], keep = /^(ch|ph|th|gn|qu|gu|[bcdfgkptv][lr])$/;
        if (n < 6 || /[^a-zàâäçéèêëîïôöùûüœæ'’-]/i.test(w)) return out;
        for (let i = 2; i <= n - 3; i++) { const a = s[i - 1], b = s[i];
            if (!V.test(a) && !V.test(b) && V.test(s[i - 2] || '') && !keep.test(a + b)) out.push(i); // entre deux consonnes
            else if (V.test(a) && !V.test(b) && V.test(s[i + 1] || '')) out.push(i); } // devant une consonne entre deux voyelles
        return out.filter(i => i >= 2 && i <= n - 3);
    }
    /** Coupe le texte en lignes : {words, y, first, last} ; la largeur du bloc (0 = texte simple, une ligne par paragraphe) */
    function rtTextLines(c, op, W, mw, lead) {
        const il = (op.il || 0) * W, ir = (op.ir || 0) * W, fi = (op.fi || 0) * W, sb = (op.sb || 0) * W, sa = (op.sa || 0) * W, bw = (op.boxW || 0) * W, sp = mw(' ');
        const cap = s => op.caps === 'all' ? s.toLocaleUpperCase('fr') : s, lines = []; let y = 0;
        String(op.text).split('\n').forEach((para, pi) => {
            if (pi) y += sa + sb;
            const words = cap(para).split(/ +/);
            if (!bw) { lines.push({words: [cap(para).replace(/\u00AD/g, '')], y, first: true, last: true}); y += lead; return; }
            let cur = [], curW = 0, first = true;
            const avail = () => Math.max(10, bw - il - ir - (first ? fi : 0)), clean = s => s.replace(/\u00AD/g, '');
            const flush = last => { lines.push({words: cur, y, first, last}); y += lead; first = false; cur = []; curW = 0; };
            for (let w0 of words) {
                let w = w0;
                while (true) {
                    const ww = mw(clean(w)), need = (cur.length ? sp : 0) + ww;
                    if (curW + need <= avail() || (!cur.length && !op.hyph)) { cur.push(clean(w)); curW += need; break; }
                    // la césure : la plus longue partie du mot qui tient encore, avec un tiret
                    if (op.hyph) { const room = avail() - curW - (cur.length ? sp : 0), pts = rtHyphenPoints(w).reverse(), plain = clean(w);
                        const cut = pts.find(i => mw(plain.slice(0, i) + '-') <= room);
                        if (cut) { cur.push(plain.slice(0, cut) + '-'); flush(false); w = plain.slice(cut); continue; }
                        if (!cur.length) { cur.push(plain); curW += ww; break; } }
                    flush(false);
                }
            }
            flush(true);
        });
        return {lines, il, ir, fi, bw};
    }
    /** Dessine un texte (aussi pour mesurer sa boîte) : ctx, op, largeur et hauteur de la toile ; renvoie la boîte {x, y, w, h} en points */
    function rtDrawText(c, op, W, H, measureOnly = false) {
        const base = Math.max(1, op.size * W), size = op.pos ? base * 0.62 : base, lead = op.lead ? op.lead * W : base * 1.2, hs = (op.hs || 100) / 100, vs = (op.vs || 100) / 100;
        const shift = (op.shift || 0) * W + (op.pos === 'sup' ? base * 0.36 : op.pos === 'sub' ? -base * 0.18 : 0);
        c.font = rtTextFont(op, size); c.textBaseline = 'top'; c.textAlign = 'left';
        if ('letterSpacing' in c) c.letterSpacing = `${((op.track || 0) / 1000) * size}px`;
        if ('fontKerning' in c) c.fontKerning = op.kern === 'none' ? 'none' : 'normal';
        const mw = t => c.measureText(t).width * hs, L = rtTextLines(c, op, W, mw, lead), al = op.align || 'left', just = al.startsWith('justify');
        const lineW = l => mw(l.words.join(' ')), ind = l => L.il + (l.first ? L.fi : 0);
        const BW = L.bw || Math.max(1, ...L.lines.map(l => lineW(l) + ind(l) + L.ir));
        const x0 = op.x * W, y0 = op.y * H, bx = L.bw ? x0 : x0 + (al === 'center' ? -BW / 2 : al === 'right' ? -BW : 0), last = L.lines[L.lines.length - 1];
        const box = {x: bx, y: y0 - shift, w: BW, h: (last?.y || 0) + size * 1.2 * vs};
        if (measureOnly) return box;
        const turned = !!(op.rot || op.mirror); // Image → Rotation / Symétrie : le texte tourne (ou se retourne) autour de son point d'accroche
        if (turned) { c.save(); c.translate(x0, y0); c.rotate((op.rot || 0) * Math.PI / 180); if (op.mirror) c.scale(-1, 1); c.translate(-x0, -y0); }
        const lastAl = just ? (al === 'justify-all' ? 'justify' : al.slice(8)) : al;
        const put = (t, lx, ly, uw) => { c.save(); c.translate(lx, ly); c.scale(hs, vs); if (op.halo) c.strokeText(t, 0, 0); c.fillText(t, 0, 0);
            if (uw && (op.under || op.strike)) { const th = Math.max(1, size / 14); c.shadowColor = 'transparent'; c.fillStyle = op.color; if (op.under) c.fillRect(0, size * 0.98, uw / hs, th); if (op.strike) c.fillRect(0, size * 0.55, uw / hs, th); }
            c.restore(); };
        L.lines.forEach(l => {
            const room = BW - L.il - L.ir - (l.first ? L.fi : 0), ly = y0 + l.y - shift, a = l.last ? lastAl : just ? 'justify' : al, w = lineW(l);
            if (a === 'justify' && l.words.length > 1 && L.bw) { // justifié : l'espace qui reste est partagé entre les mots
                const ws = l.words.map(mw), gap = (room - ws.reduce((s, v) => s + v, 0)) / (l.words.length - 1); let lx = bx + ind(l);
                if (op.under || op.strike) put('', lx, ly, room);
                l.words.forEach((t, i) => { put(t, lx, ly, 0); lx += ws[i] + gap; }); return; }
            const off = a === 'center' ? (room - w) / 2 : a === 'right' ? room - w : 0;
            put(l.words.join(' '), bx + ind(l) + off, ly, w);
        });
        if (turned) c.restore();
        return box;
    }
    /* ▦ Dégradés (comme Photoshop) : linéaire, radial, angle, réfléchi, losange. Arrêts de couleur avec leur opacité et leur milieu,
       mélange classique (RVB), doux (perceptuel) ou par les teintes ; répétition, inversion, tramage contre les bandes. */
    const RT_GKINDS = [['linear', '▭', 'Linéaire'], ['radial', '◉', 'Radial'], ['angle', '◔', 'Angle (conique)'], ['reflected', '⇋', 'Réfléchi'], ['diamond', '◇', 'Losange']];
    const RT_GPRESETS = [
        ['fgbg', 'Premier plan → arrière-plan', null], ['fgtr', 'Premier plan → transparent', null],
        ['bw', 'Noir → blanc', [[0, '#000000'], [1, '#ffffff']]], ['wtr', 'Blanc → transparent', [[0, '#ffffff'], [1, '#ffffff', 0]]],
        ['vign', 'Vignette (bords sombres)', [[0, '#000000', 0], [0.55, '#000000', 0], [1, '#000000', 0.85]]],
        ['sepia', 'Sépia', [[0, '#2b1a0e'], [0.5, '#a0784f'], [1, '#f3e6cf']]], ['sun', 'Coucher de soleil', [[0, '#2b1055'], [0.45, '#d53369'], [0.75, '#f58b3c'], [1, '#fdd77a']]],
        ['sky', 'Ciel', [[0, '#1c4f9c'], [0.6, '#6fa7dc'], [1, '#e8f1fa']]], ['rainbow', 'Arc-en-ciel', [[0, '#ff0000'], [0.17, '#ffff00'], [0.33, '#00ff00'], [0.5, '#00ffff'], [0.67, '#0000ff'], [0.83, '#ff00ff'], [1, '#ff0000']]],
        ['copper', 'Cuivre', [[0, '#5c2a12'], [0.35, '#c46d3b'], [0.5, '#f2b38a'], [0.65, '#b0592b'], [1, '#4a200c']]], ['chrome', 'Chrome', [[0, '#26292e'], [0.45, '#e9edf2'], [0.5, '#3a3f47'], [0.55, '#8c96a3'], [1, '#f5f7fa']]],
        ['gold', 'Or', [[0, '#7a5410'], [0.3, '#e8c25a'], [0.5, '#fff1b8'], [0.7, '#c99a2e'], [1, '#6e4a0c']]], ['old', 'Vieux papier', [[0, '#f1e3c2'], [0.7, '#d8bf8c'], [1, '#8a6a3c']]],
        ['night', 'Nuit', [[0, '#05060f'], [1, '#2a3a6e']]], ['spring', 'Printemps', [[0, '#c6ea8d'], [1, '#fe90af']]], ['sea', 'Mer', [[0, '#0b3d5c'], [0.5, '#1f8a9e'], [1, '#bfe7e0']]]];
    const rtGStops = list => list.map(([p, c, a]) => ({p, c, a: a ?? 1}));
    const rtHex = h => { const m = String(h || '#000').replace('#', ''), v = m.length === 3 ? m.split('').map(x => x + x).join('') : m.padEnd(6, '0'); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) || 0); };
    const rtLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, rtGam = v => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
    const rtOklab = ([r, g, b]) => { r = rtLin(r); g = rtLin(g); b = rtLin(b); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
    const rtFromOklab = ([L, A, B]) => { const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
        return [rtGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), rtGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), rtGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]; };
    const rtHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [NaN, 0, l];
        const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
    const rtFromHsl = ([h, s, l]) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, k = Math.floor(((h % 360) + 360) % 360 / 60);
        const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k] || [0, 0, 0]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
    /** Les arrêts triés, prêts (premier plan et fond pris au moment voulu pour les préréglages « fgbg » / « fgtr ») */
    const rtGSorted = stops => { const s = (stops?.length ? stops : rtGStops([[0, '#000000'], [1, '#ffffff']])).map(x => ({p: Math.min(1, Math.max(0, Number(x.p) || 0)), c: x.c || '#000000', a: Math.min(1, Math.max(0, x.a ?? 1)), m: Math.min(0.95, Math.max(0.05, x.m ?? 0.5))})).sort((a, b) => a.p - b.p); return s.length === 1 ? [s[0], {...s[0], p: 1}] : s; };
    /** Une table de 1 024 couleurs (r, g, b, a de 0 à 255) le long du dégradé */
    function rtGradLut(op) {
        const s = rtGSorted(op.stops), N = 1024, lut = new Float32Array(N * 4), how = op.interp || 'rgb';
        const conv = s.map(x => { const rgb = rtHex(x.c); return how === 'oklab' ? rtOklab(rgb) : how === 'hsl' ? rtHsl(rgb) : rgb; });
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1); let j = 0; while (j < s.length - 2 && t > s[j + 1].p) j++;
            const A0 = s[j], B0 = s[j + 1]; let f = B0.p > A0.p ? (t - A0.p) / (B0.p - A0.p) : t >= B0.p ? 1 : 0; f = Math.min(1, Math.max(0, f));
            if (A0.m !== 0.5 && f > 0 && f < 1) f = f ** (Math.log(0.5) / Math.log(A0.m)); // le milieu entre deux arrêts (le petit losange de Photoshop)
            const a = conv[j], b = conv[j + 1]; let rgb;
            if (how === 'oklab') rgb = rtFromOklab([0, 1, 2].map(k => a[k] + (b[k] - a[k]) * f));
            else if (how === 'hsl') { let h1 = a[0], h2 = b[0]; if (Number.isNaN(h1)) h1 = Number.isNaN(h2) ? 0 : h2; if (Number.isNaN(h2)) h2 = h1; let dh = h2 - h1; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
                rgb = rtFromHsl([h1 + dh * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); }
            else rgb = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * f);
            lut[i * 4] = rgb[0]; lut[i * 4 + 1] = rgb[1]; lut[i * 4 + 2] = rgb[2]; lut[i * 4 + 3] = (A0.a + (B0.a - A0.a) * f) * 255;
        }
        return lut;
    }
    /** Où en est le dégradé (0 à 1) au point x, y : la forme choisie, puis la répétition et l'inversion */
    const rtGradT = op => { const W = op._W, H = op._H, x1 = op.x1 * W, y1 = op.y1 * H, dx = op.x2 * W - x1, dy = op.y2 * H - y1, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2), a0 = Math.atan2(dy, dx), kind = op.kind || 'linear', rep = op.repeat || 'none', rev = !!op.reverse;
        return (x, y) => { const px = x - x1, py = y - y1; let t;
            if (kind === 'radial') t = Math.sqrt(px * px + py * py) / L;
            else if (kind === 'angle') { t = (Math.atan2(py, px) - a0) / (Math.PI * 2); t -= Math.floor(t); }
            else if (kind === 'diamond') t = (Math.abs(px * dx + py * dy) + Math.abs(px * dy - py * dx)) / L2;
            else { t = (px * dx + py * dy) / L2; if (kind === 'reflected') t = Math.abs(t); }
            if (rep === 'repeat') t -= Math.floor(t); else if (rep === 'mirror') { t = Math.abs(t) % 2; if (t > 1) t = 2 - t; } else t = t < 0 ? 0 : t > 1 ? 1 : t;
            return rev ? 1 - t : t; }; };
    /** Le dégradé dessiné à la taille W × H. luma : pour un masque (noir = caché, blanc = montré : la clarté devient la transparence) */
    const RT_GCACHE = new WeakMap();
    function rtGradCanvas(op, W, H, luma = false) {
        const key = JSON.stringify([op.kind, op.x1, op.y1, op.x2, op.y2, op.stops, op.interp, op.repeat, op.reverse, op.dither, W, H, luma]), hit = RT_GCACHE.get(op);
        if (hit?.key === key) return hit.c;
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data;
        const lut = rtGradLut(op), T = rtGradT({...op, _W: W, _H: H}), dith = !!op.dither; let seed = 12345;
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
            const k = Math.round(T(x + 0.5, y + 0.5) * 1023) * 4; let r = lut[k], gg = lut[k + 1], b = lut[k + 2], a = lut[k + 3];
            if (dith) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const n = (seed / 0x7fffffff - 0.5); r += n; gg += n; b += n; a += a > 0 && a < 255 ? n : 0; }
            if (luma) { d[i + 3] = (0.299 * r + 0.587 * gg + 0.114 * b) * a / 255; continue; }
            d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
        }
        g.putImageData(id, 0, 0); RT_GCACHE.set(op, {key, c}); return c;
    }
    /** Le dégradé en CSS (aperçu dans les boutons et l'éditeur) */
    const rtGradCss = (stops, dir = '90deg') => `linear-gradient(${dir}, ${rtGSorted(stops).map(s => { const [r, g, b] = rtHex(s.c); return `rgba(${r},${g},${b},${s.a}) ${(s.p * 100).toFixed(1)}%`; }).join(', ')})`;
    /* ▩ Motifs (comme Photoshop) : des carreaux qui se répètent. Les motifs de l'app sont dessinés avec les deux couleurs (premier plan, fond) ;
       on crée les siens d'après une sélection, un calque ou l'image (raccord sans couture possible). */
    const RT_PATTERNS = [
        ['checker', 'Damier', 32, (g, s, f) => { g.fillStyle = f; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2); }],
        ['dots', 'Pois', 24, (g, s, f) => { g.fillStyle = f; g.beginPath(); g.arc(s / 4, s / 4, s / 8, 0, Math.PI * 2); g.arc(s * 3 / 4, s * 3 / 4, s / 8, 0, Math.PI * 2); g.fill(); }],
        ['stripes', 'Rayures', 16, (g, s, f) => { g.fillStyle = f; g.fillRect(0, 0, s / 2, s); }],
        ['diag', 'Hachures', 16, (g, s, f) => { g.strokeStyle = f; g.lineWidth = s / 6; g.beginPath(); for (const o of [-s, 0, s]) { g.moveTo(o, s); g.lineTo(o + s, 0); } g.stroke(); }],
        ['cross', 'Hachures croisées', 16, (g, s, f) => { g.strokeStyle = f; g.lineWidth = s / 8; g.beginPath(); for (const o of [-s, 0, s]) { g.moveTo(o, s); g.lineTo(o + s, 0); g.moveTo(o, 0); g.lineTo(o + s, s); } g.stroke(); }],
        ['grid', 'Quadrillage', 24, (g, s, f) => { g.fillStyle = f; g.fillRect(0, 0, s, Math.max(1, s / 16)); g.fillRect(0, 0, Math.max(1, s / 16), s); }],
        ['bricks', 'Briques', 32, (g, s, f) => { g.fillStyle = f; const t = Math.max(1, s / 16); g.fillRect(0, 0, s, t); g.fillRect(0, s / 2, s, t); g.fillRect(0, 0, t, s / 2); g.fillRect(s / 2, s / 2, t, s / 2); }],
        ['chevron', 'Chevrons', 32, (g, s, f) => { g.strokeStyle = f; g.lineWidth = s / 8; g.lineJoin = 'miter'; g.beginPath(); for (const y of [-s / 2, 0, s / 2, s]) { g.moveTo(0, y + s / 4); g.lineTo(s / 2, y); g.lineTo(s, y + s / 4); } g.stroke(); }],
        ['harlequin', 'Losanges', 32, (g, s, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s, s / 2); g.lineTo(s / 2, s); g.lineTo(0, s / 2); g.closePath(); g.fill(); }],
        ['scales', 'Écailles', 32, (g, s, f) => { g.strokeStyle = f; g.lineWidth = s / 14; g.beginPath(); for (const [x, y] of [[0, 0], [s, 0], [s / 2, s / 2], [0, s], [s, s]]) { g.moveTo(x + s / 2, y); g.arc(x, y, s / 2, 0, Math.PI); } g.stroke(); }],
        ['waves', 'Vagues', 32, (g, s, f) => { g.strokeStyle = f; g.lineWidth = s / 10; g.beginPath(); for (const y0 of [s / 4, s * 3 / 4]) for (let x = 0; x <= s; x++) { const y = y0 + Math.sin(x / s * Math.PI * 2) * s / 8; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }],
        ['weave', 'Toile', 16, (g, s, f) => { g.fillStyle = f; g.globalAlpha = 0.55; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2); g.globalAlpha = 0.25; g.fillRect(s / 2, 0, s / 2, s / 2); g.fillRect(0, s / 2, s / 2, s / 2); }],
        ['paper', 'Grain de papier', 64, (g, s, f) => { let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647; g.fillStyle = f; for (let i = 0; i < s * s / 3; i++) { g.globalAlpha = r() * 0.35; g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1); } }],
        ['plus', 'Croix', 24, (g, s, f) => { g.fillStyle = f; const t = s / 10; g.fillRect(s / 2 - t / 2, s / 4, t, s / 2); g.fillRect(s / 4, s / 2 - t / 2, s / 2, t); }],
        ['stars', 'Étoiles', 40, (g, s, f) => { g.fillStyle = f; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${s / 3}px serif`; g.fillText('★', s / 4, s / 4); g.fillText('★', s * 3 / 4, s * 3 / 4); }],
        ['lys', 'Fleurs de lys', 48, (g, s, f) => { g.fillStyle = f; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${s / 2.6}px serif`; g.fillText('⚜', s / 4, s / 4); g.fillText('⚜', s * 3 / 4, s * 3 / 4); }]];
    /** Un motif de l'app dessiné en carreau (fond transparent ou couleur de fond) */
    function rtPatternTile(id, fg, bg, transp) { const p = RT_PATTERNS.find(x => x[0] === id); if (!p) return null; const s = p[2], c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); if (!transp) { g.fillStyle = bg; g.fillRect(0, 0, s, s); } g.save(); p[3](g, s, fg); g.restore(); return c; }
    /** Raccord sans couture : le carreau décalé d'une moitié vient couvrir ses bords, qui se fondent (comme « Décalage » + retouche des bords dans Photoshop) */
    function rtSeamless(c) {
        const w = c.width, h = c.height, g = c.getContext('2d'), A0 = g.getImageData(0, 0, w, h), a = A0.data, o = new Uint8ClampedArray(a.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, j = (((y + (h >> 1)) % h) * w + ((x + (w >> 1)) % w)) * 4;
            const wx = Math.min(x, w - 1 - x) / (w / 2), wy = Math.min(y, h - 1 - y) / (h / 2), t = Math.min(1, Math.min(wx, wy) * 2.2), k = t * t * (3 - 2 * t);
            for (let q = 0; q < 4; q++) o[i + q] = a[i + q] * k + a[j + q] * (1 - k);
        }
        A0.data.set(o); g.putImageData(A0, 0, 0); return c;
    }
    /* 🖌 Formes de pinceau (comme le panneau Formes de Photoshop) : le trait est fait d'empreintes posées à intervalle régulier (le pas),
       chacune avec sa forme, son angle, son arrondi, et des variations (taille, angle, dispersion, opacité, couleur) toujours les mêmes pour un même trait. */
    const RT_TIP_SHAPES = [['round', 'Rond'], ['square', 'Carré'], ['star', 'Étoile'], ['leaf', 'Feuille'], ['grass', 'Brin d’herbe'], ['splat', 'Éclaboussure'], ['chalk', 'Craie'], ['charcoal', 'Fusain'], ['custom', 'Ma forme (d’après une sélection)']];
    const RT_TIP0 = {shape: 'round', hard: 80, spacing: 25, angle: 0, round: 100, follow: false, sj: 0, aj: 0, scatter: 0, count: 1, oj: 0, cj: 0, flow: 100};
    const RT_BRUSH_PRESETS = [['hard', 'Rond net', {hard: 100, spacing: 8}], ['soft', 'Rond doux', {hard: 0, spacing: 8}], ['air', 'Aérographe', {hard: 0, spacing: 4, flow: 10}],
        ['callig', 'Plume calligraphique', {hard: 100, spacing: 3, angle: 45, round: 18}], ['pencil', 'Crayon', {hard: 100, spacing: 4, oj: 35}], ['chalk', 'Craie', {shape: 'chalk', hard: 60, spacing: 12, aj: 100}],
        ['charcoal', 'Fusain', {shape: 'charcoal', spacing: 10, aj: 100, oj: 30}], ['dry', 'Pinceau sec', {shape: 'chalk', spacing: 5, round: 55, angle: 30, oj: 50, follow: true}], ['square', 'Carré net', {shape: 'square', hard: 100, spacing: 8}],
        ['stars', 'Étoiles semées', {shape: 'star', hard: 100, spacing: 140, sj: 60, aj: 100, scatter: 160, count: 2, cj: 25}], ['leaves', 'Feuilles', {shape: 'leaf', hard: 100, spacing: 90, sj: 50, aj: 100, scatter: 120, count: 2, cj: 12}],
        ['grass', 'Herbe', {shape: 'grass', hard: 100, spacing: 25, sj: 45, aj: 18, scatter: 70, count: 3, cj: 10}], ['splat', 'Éclaboussures', {shape: 'splat', hard: 100, spacing: 110, sj: 60, aj: 100, scatter: 200, count: 2, oj: 40}]];
    const RT_TIPCACHE = new Map();
    /** L'empreinte (blanche, sa transparence dit où elle peint), 128 points de côté */
    function rtTipCanvas(t, env) {
        if (t.shape === 'custom') { const m = env?.masks?.get(t.mask); if (m) return m; }
        const key = `${t.shape}|${t.hard}`; if (RT_TIPCACHE.has(key)) return RT_TIPCACHE.get(key);
        const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), h = Math.min(1, Math.max(0, (t.hard ?? 80) / 100)), blur = (1 - h) * 14;
        let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        g.fillStyle = '#fff'; g.strokeStyle = '#fff';
        if (t.shape === 'round' || t.shape === 'custom') { const gr = g.createRadialGradient(64, 64, 60 * h * 0.98, 64, 64, 60); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = h >= 1 ? '#fff' : gr; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); }
        else {
            if (blur) g.filter = `blur(${blur}px)`;
            g.beginPath();
            if (t.shape === 'square') g.rect(14, 14, 100, 100);
            else if (t.shape === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 54, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a)); } g.closePath(); }
            else if (t.shape === 'leaf') { g.moveTo(64, 8); g.quadraticCurveTo(118, 64, 64, 120); g.quadraticCurveTo(10, 64, 64, 8); }
            else if (t.shape === 'grass') { g.moveTo(58, 124); g.quadraticCurveTo(54, 50, 74, 4); g.quadraticCurveTo(64, 56, 70, 124); g.closePath(); }
            else if (t.shape === 'splat') { for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, d = rnd() * 44, r = 4 + rnd() * 16 * (1 - d / 60); g.moveTo(64 + Math.cos(a) * d + r, 64 + Math.sin(a) * d); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2); } }
            else if (t.shape === 'chalk' || t.shape === 'charcoal') { g.arc(64, 64, 58, 0, Math.PI * 2); }
            g.fill(); g.filter = 'none';
            if (t.shape === 'leaf') { g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 14); g.lineTo(64, 116); g.stroke(); g.globalCompositeOperation = 'source-over'; }
            if (t.shape === 'chalk' || t.shape === 'charcoal') { const id = g.getImageData(0, 0, S, S), d = id.data; for (let i = 3; i < d.length; i += 4) { const y = (i >> 2) / S | 0; const k = t.shape === 'charcoal' ? (rnd() < 0.5 + 0.4 * Math.sin(y * 0.9) ? 0.15 : 1) : (rnd() < 0.45 ? 0.1 : 0.6 + rnd() * 0.4); d[i] *= k; } g.putImageData(id, 0, 0); }
        }
        RT_TIPCACHE.set(key, c); return c;
    }
    /** l'empreinte teintée d'une couleur (gardée, une par couleur) */
    const rtTipTint = (tip, col) => { const key = tip; let m = RT_TIPCACHE.get(key); if (!(m instanceof Map)) { m = new Map(); RT_TIPCACHE.set(key, m); } let s = m.get(col); if (!s) { s = document.createElement('canvas'); s.width = tip.width; s.height = tip.height; const g = s.getContext('2d'); g.drawImage(tip, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, s.width, s.height); m.set(col, s); } return s; };
    function rtDrawTipStroke(c, op, W, H, env) {
        const t = {...RT_TIP0, ...(op.tip || {})}, size = Math.max(1, op.size * W), pts = op.points.map(([x, y]) => [x * W, y * H]), step = Math.max(0.5, size * Math.max(1, t.spacing) / 100);
        let seed = Math.round(op.points[0][0] * 1e6 + op.points[0][1] * 1e3) % 2147483646 + 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const tip = rtTipCanvas(t, env), u = document.createElement('canvas'); u.width = W; u.height = H; const g = u.getContext('2d'), base = rtHsl(rtHex(op.color));
        const colOf = () => { if (!t.cj || Number.isNaN(base[0])) return op.color; const h = base[0] + (rnd() * 2 - 1) * t.cj * 1.8, q = rtFromHsl([Math.round(h / 6) * 6, base[1], Math.min(0.9, Math.max(0.1, base[2] + (rnd() - 0.5) * t.cj / 300))]); return '#' + q.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join(''); };
        const dab = (x, y, dir) => { for (let n = 0; n < Math.max(1, t.count); n++) {
            const s = size * (1 - (t.sj / 100) * rnd()), a = (t.angle * Math.PI / 180) + (t.follow ? dir : 0) + (t.aj / 100) * (rnd() - 0.5) * Math.PI * 2, sc = (t.scatter / 100) * size, dx = sc ? (rnd() * 2 - 1) * sc : 0, dy = sc ? (rnd() * 2 - 1) * sc : 0;
            g.save(); g.globalAlpha = Math.max(0, (t.flow / 100) * (1 - (t.oj / 100) * rnd())); g.translate(x + dx, y + dy); g.rotate(a); g.scale(1, Math.max(0.02, t.round / 100)); g.drawImage(rtTipTint(tip, colOf()), -s / 2, -s / 2, s, s); g.restore(); } };
        let left = 0; dab(pts[0][0], pts[0][1], 0);
        for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0), dir = Math.atan2(y1 - y0, x1 - x0); let d = step - left;
            while (d <= L) { dab(x0 + (x1 - x0) * d / L, y0 + (y1 - y0) * d / L, dir); d += step; } left = L - (d - step); }
        c.globalAlpha = op.opacity ?? 1; c.drawImage(u, 0, 0);
    }
    function rtDrawOp(c, op, W, H, env = null) {
        c.save();
        if (op.type === 'pattern') { // ▩ un motif répété (échelle, angle, décalage) ; dans une sélection : seulement dedans
            const tile = env?.masks?.get(op.mask); if (!tile) { c.restore(); return; }
            const k = (op.scale ?? 1) * W / (op.refW || W), pat = c.createPattern(tile, 'repeat'); pat.setTransform(new DOMMatrix().translate((op.ox || 0) * W, (op.oy || 0) * H).rotate(op.angle || 0).scale(k).scale(op.mirror ? -1 : 1, 1)); // retourné : Image → Symétrie
            const m = op.clip && env?.masks?.get(op.clip), u = m ? document.createElement('canvas') : null, g = u ? u.getContext('2d') : c; if (u) { u.width = W; u.height = H; }
            c.globalAlpha = op.opacity ?? 1; g.fillStyle = pat; g.fillRect(0, 0, W, H); if (u) { g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H); c.drawImage(u, 0, 0); }
            c.restore(); return;
        }
        if (op.type === 'gradient') { // ▦ un dégradé ; dans une sélection : seulement dedans
            const t = rtGradCanvas(op, W, H), m = op.clip && env?.masks?.get(op.clip); c.globalAlpha = op.opacity ?? 1;
            if (m) { const u = document.createElement('canvas'); u.width = W; u.height = H; const g = u.getContext('2d'); g.drawImage(t, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H); c.drawImage(u, 0, 0); } else c.drawImage(t, 0, 0);
            c.restore(); return;
        }
        if (op.type === 'shape') { // rectangle, ellipse, ligne, flèche
            const x1 = op.x1 * W, y1 = op.y1 * H, x2 = op.x2 * W, y2 = op.y2 * H, lw = Math.max(0.5, op.size * W);
            c.globalAlpha = op.opacity ?? 1; c.lineWidth = lw; c.strokeStyle = op.color; c.lineJoin = 'round'; c.lineCap = 'round';
            if (op.rot && !['line', 'arrow'].includes(op.kind)) { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; c.translate(mx, my); c.rotate(op.rot * Math.PI / 180); c.translate(-mx, -my); } // tournée avec l'image (Image → Rotation, angle libre)
            c.beginPath();
            if (op.kind === 'rect') c.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
            else if (op.kind === 'round') { const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), r = Math.min(w, h) * 0.18; c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
            else if (op.kind === 'ellipse') c.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
            else { c.moveTo(x1, y1); c.lineTo(x2, y2); }
            if (op.fill && !['line', 'arrow'].includes(op.kind)) { c.fillStyle = op.fill; c.fill(); }
            if (op.size > 0) c.stroke();
            if (op.kind === 'arrow') { const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(lw * 4, 10); c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)); c.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)); c.closePath(); c.fillStyle = op.color; c.fill(); }
            c.restore(); return;
        }
        if (op.type === 'image') { // une image placée (Calque → Placer une image) : boîte x, y, w, h (0 à 1), rotation en degrés
            const im = env?.masks?.get(op.mask); if (!im) { c.restore(); return; }
            c.globalAlpha = op.opacity ?? 1; c.translate((op.x + op.w / 2) * W, (op.y + op.h / 2) * H); c.rotate((op.rot || 0) * Math.PI / 180); if (op.mirror) c.scale(-1, 1);
            c.imageSmoothingQuality = 'high'; c.drawImage(im, -op.w * W / 2, -op.h * H / 2, op.w * W, op.h * H); c.restore(); return;
        }
        if (op.type === 'fillmask') { // une sélection remplie d'une couleur, sur un calque
            const m = env?.masks?.get(op.mask); if (!m) { c.restore(); return; }
            const t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.fillStyle = op.color; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H);
            c.globalAlpha = op.opacity ?? 1; if (op.erase) c.globalCompositeOperation = 'destination-out'; // ⌫ dans une sélection : effacée de ce calque
            c.drawImage(t, (op.dx || 0) * W, (op.dy || 0) * H); c.restore(); return;
        }
        if (op.type === 'pixels') { // une zone de la photo (sélection) posée sur un calque
            const m = env?.masks?.get(op.mask); if (!m || !env.photo) { c.restore(); return; }
            const t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.drawImage(env.photo, 0, 0, W, H); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H);
            c.globalAlpha = op.opacity ?? 1; c.drawImage(t, (op.dx || 0) * W, (op.dy || 0) * H); c.restore(); return;
        }
        if (op.type === 'text') {
            if (op._editing) { c.restore(); return; } // en train d'être écrit : la zone d'écriture le montre à sa place
            const size = Math.max(1, op.size * W);
            // lissage « Aucun » : le texte dessiné à part, puis chaque point gardé tout entier ou pas du tout (bords nets, comme Photoshop)
            const t = op.aa === 'none' ? (() => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv.getContext('2d'); })() : c;
            t.globalAlpha = op.opacity ?? 1; t.fillStyle = op.color;
            if (op.halo) { t.lineWidth = Math.max(2, size / 6) * (op.haloW || 1); t.strokeStyle = op.halo; t.lineJoin = 'round'; }
            if (op.shadow) { t.shadowColor = op.shadow; t.shadowBlur = size * 0.22; t.shadowOffsetX = t.shadowOffsetY = size * 0.07; }
            rtDrawText(t, op, W, H);
            if (t !== c) { const id = t.getImageData(0, 0, W, H), d = id.data; for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0; t.putImageData(id, 0, 0); c.globalAlpha = 1; c.drawImage(t.canvas, 0, 0); }
            c.restore(); return;
        }
        const pts = op.points; if (!pts?.length) { c.restore(); return; }
        if (op.brush === 'tip') { rtDrawTipStroke(c, op, W, H, env); c.restore(); return; } // 🖌 une forme du panneau Formes
        const lw = Math.max(0.5, (op.brush === 'pencil' ? Math.min(op.size, 0.004) : op.size) * W);
        c.lineCap = op.brush === 'marker' ? 'square' : 'round'; c.lineJoin = 'round'; c.lineWidth = lw;
        c.strokeStyle = op.color; c.globalAlpha = (op.opacity ?? 1) * (op.brush === 'marker' ? 0.45 : 1);
        if (op.brush === 'eraser') { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.globalAlpha = op.opacity ?? 1; }
        if (op.brush === 'marker') c.globalCompositeOperation = 'multiply';
        if (op.brush === 'soft') c.filter = `blur(${Math.max(1, lw * 0.28)}px)`;
        if (op.brush === 'chalk') {
            // craie : des petits points au hasard (toujours les mêmes : le hasard part du trait lui-même)
            let seed = Math.round(pts[0][0] * 1e6 + pts[0][1] * 1e3) || 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            c.fillStyle = op.color;
            for (let i = 0; i < pts.length; i++) {
                const [x, y] = pts[i], [px, py] = pts[Math.max(0, i - 1)], steps = Math.max(1, Math.round(Math.hypot((x - px) * W, (y - py) * H) / (lw / 3)));
                for (let s = 0; s < steps; s++) { const t = s / steps, cx = (px + (x - px) * t) * W, cy = (py + (y - py) * t) * H;
                    for (let k = 0; k < 8; k++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * lw / 2; c.globalAlpha = (op.opacity ?? 1) * (0.25 + rnd() * 0.5); c.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1, lw / 10), Math.max(1, lw / 10)); } }
            }
            c.restore(); return;
        }
        c.beginPath(); c.moveTo(pts[0][0] * W, pts[0][1] * H);
        if (pts.length === 1) c.lineTo(pts[0][0] * W + 0.01, pts[0][1] * H);
        for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; c.quadraticCurveTo(pts[i][0] * W, pts[i][1] * H, mx * W, my * H); }
        if (pts.length > 1) { const l = pts[pts.length - 1]; c.lineTo(l[0] * W, l[1] * H); }
        c.stroke(); c.restore();
    }
    const rtDrawLayer = (canvas, layer, env = null) => { const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); layer.ops.forEach(op => rtDrawOp(c, op, canvas.width, canvas.height, env)); };
    /* ── Masques de calque : blanc = on voit, noir = caché. Faits de coups de pinceau (cacher / montrer) et de sélections ── */
    function rtRenderMask(ops, W, H, masks) {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H); let refine = null;
        for (const op of ops || []) {
            if (op.type === 'refine') { refine = op; continue; } // ⓘ Propriétés du masque : appliquées à la fin
            g.save();
            if (op.type === 'sel') { const m = masks?.get(op.mask); if (m) { g.globalCompositeOperation = 'copy'; if (op.invert) { g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-out'; } g.drawImage(m, 0, 0, W, H); } }
            else if (op.type === 'all') { if (op.mode === 'hide') g.clearRect(0, 0, W, H); else g.fillRect(0, 0, W, H); }
            else if (op.type === 'gradient') { // ▦ dégradé dans un masque : noir = caché, blanc = montré (dans la sélection seulement, s'il y en a une)
                const t = rtGradCanvas(op, W, H, true), m = op.clip && masks?.get(op.clip);
                if (m) { const u = document.createElement('canvas'); u.width = W; u.height = H; const ug = u.getContext('2d'); ug.drawImage(t, 0, 0); ug.globalCompositeOperation = 'destination-in'; ug.drawImage(m, 0, 0, W, H); g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0, W, H); g.globalCompositeOperation = 'source-over'; g.drawImage(u, 0, 0); }
                else { g.globalCompositeOperation = 'copy'; g.drawImage(t, 0, 0); } }
            else if (op.type === 'invert') { const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d'); tg.fillRect(0, 0, W, H); tg.globalCompositeOperation = 'destination-out'; tg.drawImage(c, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(t, 0, 0); }
            else if (op.points?.length) { g.globalCompositeOperation = op.mode === 'hide' ? 'destination-out' : 'source-over'; g.strokeStyle = '#000'; g.globalAlpha = op.opacity ?? 1; g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(0.5, op.size * W); if (op.soft) g.filter = `blur(${Math.max(1, op.size * W * 0.3)}px)`;
                g.beginPath(); g.moveTo(op.points[0][0] * W, op.points[0][1] * H); op.points.forEach(([x, y]) => g.lineTo(x * W, y * H)); if (op.points.length === 1) g.lineTo(op.points[0][0] * W + 0.1, op.points[0][1] * H); g.stroke(); }
            g.restore();
        }
        if (refine?.feather > 0) { const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').drawImage(c, 0, 0); g.save(); g.globalCompositeOperation = 'copy'; g.filter = `blur(${refine.feather * W}px)`; g.drawImage(t, 0, 0); g.restore(); } // contour progressif
        if (refine && (refine.density ?? 1) < 1) { g.save(); g.globalCompositeOperation = 'destination-over'; g.globalAlpha = 1 - refine.density; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); } // densité : le caché ne l'est plus qu'en partie
        return c;
    }
    /** Modes de fusion d'un calque (comme Photoshop ; ceux que sait faire le canvas) */
    const RT_BLENDS = [['source-over', 'Normal'], ['multiply', 'Produit'], ['screen', 'Superposition (Écran)'], ['overlay', 'Incrustation'], ['darken', 'Obscurcir'], ['lighten', 'Éclaircir'],
        ['color-dodge', 'Densité couleur −'], ['color-burn', 'Densité couleur +'], ['hard-light', 'Lumière crue'], ['soft-light', 'Lumière tamisée'], ['difference', 'Différence'], ['exclusion', 'Exclusion'],
        ['hue', 'Teinte'], ['saturation', 'Saturation'], ['color', 'Couleur'], ['luminosity', 'Luminosité']];
    const rtBlend = n => RT_BLENDS.some(b => b[0] === n?.blend) ? n.blend : 'source-over';
    /* Fond et effets d'un calque (comme Photoshop) : le « fond » dose seulement le contenu du calque, pas ses effets ;
       les effets (ombre portée, lueur externe, contour, incrustation de couleur) sont tirés de la forme du calque.
       Les tailles sont en points de l'image de travail ; k : échelle de la toile dessinée (1 à l'écran, plus en pleine taille). */
    const RT_LFX = {shadow: {on: false, color: '#000000', opacity: 60, angle: 135, dist: 8, blur: 10}, glow: {on: false, color: '#fff2a8', opacity: 75, size: 14},
        stroke: {on: false, color: '#ffffff', size: 4, pos: 'outside'}, overlay: {on: false, color: '#d0021b', opacity: 100}};
    const rtLfx = n => Object.fromEntries(Object.entries(RT_LFX).map(([k, d]) => [k, {...d, ...(n?.lfx?.[k] || {})}]));
    const rtHasStyle = n => (n?.fill ?? 1) < 1 || Object.values(rtLfx(n)).some(x => x.on);
    function rtLayerStyle(src, n, k = 1) {
        if (!rtHasStyle(n)) return src;
        const W = src.width, H = src.height, fx = rtLfx(n), cv = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
        const shape = (color, from = src) => { const c = cv(), g = c.getContext('2d'); g.drawImage(from, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, W, H); return c; };
        const out = cv(), o = out.getContext('2d');
        if (fx.shadow.on) { const a = fx.shadow.angle * Math.PI / 180, d = fx.shadow.dist * k; o.save(); o.globalAlpha = fx.shadow.opacity / 100; if (fx.shadow.blur > 0) o.filter = `blur(${fx.shadow.blur * k}px)`; o.drawImage(shape(fx.shadow.color), -Math.cos(a) * d, Math.sin(a) * d); o.restore(); }
        if (fx.glow.on) { o.save(); o.globalAlpha = fx.glow.opacity / 100; o.filter = `blur(${Math.max(1, fx.glow.size * k)}px)`; const sh = shape(fx.glow.color); o.drawImage(sh, 0, 0); o.drawImage(sh, 0, 0); o.restore(); }
        let ring = null;
        if (fx.stroke.on && fx.stroke.size > 0) { // le contour : la forme élargie (dans toutes les directions), moins la forme elle-même
            const r = fx.stroke.size * k, sh = shape(fx.stroke.color), c = cv(), g = c.getContext('2d'), steps = Math.max(12, Math.min(48, Math.round(r * 4)));
            const ins = fx.stroke.pos === 'inside', mid = fx.stroke.pos === 'center', rr = mid ? r / 2 : r;
            if (ins) { g.drawImage(sh, 0, 0); g.globalCompositeOperation = 'destination-out'; const inv = cv(), ig = inv.getContext('2d'); ig.fillStyle = '#000'; ig.fillRect(0, 0, W, H); ig.globalCompositeOperation = 'destination-out'; ig.drawImage(src, 0, 0); for (let i = 0; i < steps; i++) { const t = i / steps * Math.PI * 2; g.drawImage(inv, Math.cos(t) * rr, Math.sin(t) * rr); } }
            else { for (let i = 0; i < steps; i++) { const t = i / steps * Math.PI * 2; for (const f of [1, 0.5]) g.drawImage(sh, Math.cos(t) * rr * f, Math.sin(t) * rr * f); } if (!mid) { g.globalCompositeOperation = 'destination-out'; g.drawImage(src, 0, 0); } }
            ring = c;
        }
        // le contenu, dosé par le fond (et recouvert de sa couleur d'incrustation)
        let body = src; if (fx.overlay.on) { const c = cv(), g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalAlpha = fx.overlay.opacity / 100; g.globalCompositeOperation = 'source-atop'; g.fillStyle = fx.overlay.color; g.fillRect(0, 0, W, H); body = c; }
        if (ring && fx.stroke.pos !== 'inside') o.drawImage(ring, 0, 0);
        o.save(); o.globalAlpha = Math.max(0, Math.min(1, n.fill ?? 1)); o.drawImage(body, 0, 0); o.restore();
        if (ring && fx.stroke.pos === 'inside') o.drawImage(ring, 0, 0);
        return out;
    }
    /** Un calque (ou la photo) avec son masque appliqué */
    function rtMasked(src, maskOps, masks) { if (!maskOps) return src; const W = src.width, H = src.height, m = rtRenderMask(maskOps, W, H, masks), t = document.createElement('canvas'); t.width = W; t.height = H; const g = t.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0); return t; }
    /** Sélection automatique (baguette magique) : les points de teinte proche, voisins (contigu) ou partout */
    function rtWand(img, x0, y0, tol, contiguous) {
        const W = img.width, H = img.height, d = img.data, sx = Math.max(0, Math.min(W - 1, Math.round(x0))), sy = Math.max(0, Math.min(H - 1, Math.round(y0))), k = (sy * W + sx) * 4;
        const r0 = d[k], g0 = d[k + 1], b0 = d[k + 2], t2 = (tol * 4.42) ** 2, inside = i => { const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0; return dr * dr + dg * dg + db * db <= t2; };
        const sel = new Uint8Array(W * H);
        if (!contiguous) { for (let p = 0; p < W * H; p++) if (inside(p * 4)) sel[p] = 1; }
        else { const stack = [sy * W + sx]; sel[sy * W + sx] = 1; while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (q >= 0 && !sel[q] && inside(q * 4)) { sel[q] = 1; stack.push(q); } } }
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), out = g.createImageData(W, H);
        for (let p = 0; p < W * H; p++) if (sel[p]) out.data[p * 4 + 3] = 255;
        g.putImageData(out, 0, 0); return c;
    }
    /* ═══ 🪡 Réparer un pli, une déchirure, une rayure : la zone est refaite d'après ses alentours ═══ */
    /** Le masque (0 à 255, un octet par point) d'un geste du pinceau 🪡 : des disques au bord adouci, à la taille de l'image */
    function rtDabsMask(dabs, W, H) {
        const m = new Uint8Array(W * H);
        for (const d of dabs || []) {
            const cx = d.x * W, cy = d.y * H, r = Math.max(1, d.r * W), r2 = r * r;
            const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const q = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (q > r2) continue;
                const t = Math.sqrt(q) / r, v = t < 0.7 ? 255 : Math.round(255 * (1 - (t - 0.7) / 0.3)), p = y * W + x;
                if (v > m[p]) m[p] = v;
            }
        }
        return m;
    }
    /** Un carreau : « tirer-pousser » (moyennes pondérées sur une pyramide, puis retour au détail), lissage de l'intérieur,
     *  et le grain des alentours remis par-dessus ; seuls les points du cœur du carreau (cx0…cy1) sont écrits. */
    function rtInpaintTile(d, W, H, mask, bx0, by0, bx1, by1, cx0, cy0, cx1, cy1, grain) {
        const w = bx1 - bx0, h = by1 - by0, n = w * h, C = new Float32Array(n * 3), Wt = new Float32Array(n), hole = new Uint8Array(n);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const p = y * w + x, q = (y + by0) * W + x + bx0, i = q * 4;
            if (mask[q] > 8) { hole[p] = 1; continue; }
            Wt[p] = 1; C[p * 3] = d[i]; C[p * 3 + 1] = d[i + 1]; C[p * 3 + 2] = d[i + 2];
        }
        const lv = [{w, h, C, Wt}];
        while (lv[lv.length - 1].w > 1 || lv[lv.length - 1].h > 1) { // tirer : 2 × 2 → 1
            const a = lv[lv.length - 1], nw = Math.ceil(a.w / 2), nh = Math.ceil(a.h / 2), c2 = new Float32Array(nw * nh * 3), w2 = new Float32Array(nw * nh);
            for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
                let sw = 0, r = 0, g = 0, b = 0;
                for (let dy = 0; dy < 2; dy++) { const yy = y * 2 + dy; if (yy >= a.h) continue; for (let dx = 0; dx < 2; dx++) { const xx = x * 2 + dx; if (xx >= a.w) continue; const p = yy * a.w + xx, k = a.Wt[p]; if (!k) continue; sw += k; r += a.C[p * 3] * k; g += a.C[p * 3 + 1] * k; b += a.C[p * 3 + 2] * k; } }
                if (sw > 0) { const p = y * nw + x; c2[p * 3] = r / sw; c2[p * 3 + 1] = g / sw; c2[p * 3 + 2] = b / sw; w2[p] = Math.min(1, sw); }
            }
            lv.push({w: nw, h: nh, C: c2, Wt: w2});
        }
        for (let k = lv.length - 2; k >= 0; k--) { // pousser : ce qui manque prend la valeur (interpolée) du niveau du dessus
            const a = lv[k], u = lv[k + 1];
            for (let y = 0; y < a.h; y++) {
                const fy = Math.min(u.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5)), y0 = Math.floor(fy), y1 = Math.min(u.h - 1, y0 + 1), ty = fy - y0;
                for (let x = 0; x < a.w; x++) {
                    const p = y * a.w + x, wv = a.Wt[p]; if (wv >= 1) continue;
                    const fx = Math.min(u.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), x0 = Math.floor(fx), x1 = Math.min(u.w - 1, x0 + 1), tx = fx - x0;
                    const i00 = (y0 * u.w + x0) * 3, i01 = (y0 * u.w + x1) * 3, i10 = (y1 * u.w + x0) * 3, i11 = (y1 * u.w + x1) * 3;
                    for (let c = 0; c < 3; c++) { const v = (u.C[i00 + c] * (1 - tx) + u.C[i01 + c] * tx) * (1 - ty) + (u.C[i10 + c] * (1 - tx) + u.C[i11 + c] * tx) * ty; a.C[p * 3 + c] = a.C[p * 3 + c] * wv + v * (1 - wv); }
                    a.Wt[p] = 1;
                }
            }
        }
        // lisser l'intérieur des trous (les points connus ne bougent pas) : plus de marches d'escalier
        const idx = []; for (let p = 0; p < n; p++) if (hole[p]) idx.push(p);
        const iters = Math.min(60, 14 + Math.round(Math.sqrt(idx.length) / 3));
        for (let s = 0; s < iters; s++) for (let j = 0; j < idx.length; j++) {
            const p = idx[j], x = p % w, y = (p - x) / w; let r = 0, g = 0, b = 0, m = 0;
            if (x > 0) { r += C[p * 3 - 3]; g += C[p * 3 - 2]; b += C[p * 3 - 1]; m++; }
            if (x < w - 1) { r += C[p * 3 + 3]; g += C[p * 3 + 4]; b += C[p * 3 + 5]; m++; }
            if (y > 0) { const q = (p - w) * 3; r += C[q]; g += C[q + 1]; b += C[q + 2]; m++; }
            if (y < h - 1) { const q = (p + w) * 3; r += C[q]; g += C[q + 1]; b += C[q + 2]; m++; }
            if (m) { C[p * 3] = r / m; C[p * 3 + 1] = g / m; C[p * 3 + 2] = b / m; }
        }
        // le grain des alentours (une zone trop lisse se verrait sur une photo ancienne)
        let gs = 0;
        if (grain) {
            const L = q => 0.299 * C[q * 3] + 0.587 * C[q * 3 + 1] + 0.114 * C[q * 3 + 2]; let s2 = 0, cnt = 0;
            for (let p = w + 1; p < n - w - 1; p += 3) { if (hole[p] || hole[p - 1] || hole[p + 1] || hole[p - w] || hole[p + w]) continue; const v = L(p) - (L(p - 1) + L(p + 1) + L(p - w) + L(p + w)) / 4; s2 += v * v; cnt++; }
            gs = cnt ? Math.min(16, Math.sqrt(s2 / cnt) * 0.75) : 0;
        }
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
            const q = y * W + x, mv = mask[q]; if (mv <= 8) continue;
            const p = (y - by0) * w + (x - bx0), a = mv / 255, i = q * 4; let nz = 0;
            if (gs) { let hs = (x * 374761393 + y * 668265263) ^ 0x2c1b3c6d; hs = Math.imul(hs ^ (hs >>> 13), 1274126177); nz = ((((hs ^ (hs >>> 16)) & 1023) / 1023) - 0.5) * gs * 3.4; }
            for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - a) + clamp255(C[p * 3 + c] + nz) * a;
        }
    }
    /** Remplit les points du masque (0 à 255) d'après leurs alentours, carreau par carreau (256 points) : seuls ceux qui
     *  touchent le masque sont calculés, si bien qu'un long pli sur une photo de 3000 points se répare en un instant. */
    function rtInpaint(img, mask, {grain = true} = {}) {
        const W = img.width, H = img.height, T = 256, PAD = 40; let tiles = 0;
        for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
            const x1 = Math.min(W, tx + T), y1 = Math.min(H, ty + T); let any = false;
            for (let y = ty; y < y1 && !any; y++) { const row = y * W; for (let x = tx; x < x1; x++) if (mask[row + x] > 8) { any = true; break; } }
            if (!any) continue;
            rtInpaintTile(img.data, W, H, mask, Math.max(0, tx - PAD), Math.max(0, ty - PAD), Math.min(W, x1 + PAD), Math.min(H, y1 + PAD), tx, ty, x1, y1, grain); tiles++;
        }
        return tiles;
    }
    /** 🔍 Plis et rayures : les lignes fines plus claires ou plus sombres que leur voisinage (l'image moins son « ouverture »,
     *  sa « fermeture » moins l'image), qui vont dans un même sens (pas un point, pas une texture), longues et minces.
     *  Calculé sur une image réduite (1200 points au plus), puis ramené à la taille de img.
     *  sens : 1 (seulement les lignes franches) à 100 (beaucoup). Renvoie {mask (0/255 par point de img), lines}. */
    function rtCreases(img, sens = 50, inside = null) {
        const W0 = img.width, H0 = img.height, d = img.data, k = Math.min(1, 1200 / Math.max(W0, H0)), W = Math.max(8, Math.round(W0 * k)), H = Math.max(8, Math.round(H0 * k)), N = W * H;
        // la luminosité, réduite (moyenne des points de chaque case)
        const L = new Float32Array(N), cnt = new Float32Array(N);
        for (let y = 0; y < H0; y++) { const ty = Math.min(H - 1, Math.floor(y * k)) * W; for (let x = 0; x < W0; x++) { const i = (y * W0 + x) * 4, q = ty + Math.min(W - 1, Math.floor(x * k)); L[q] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; cnt[q]++; } }
        for (let p = 0; p < N; p++) L[p] /= cnt[p] || 1;
        const r = 2, tmp = new Float32Array(N);
        const mm = (src, isMax) => { // minimum ou maximum sur un carré de 5 × 5 (deux passes)
            const o = new Float32Array(N);
            for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) { let v = src[row + x]; for (let q = Math.max(0, x - r), e = Math.min(W - 1, x + r); q <= e; q++) { const u = src[row + q]; if (isMax ? u > v : u < v) v = u; } tmp[row + x] = v; } }
            for (let y = 0; y < H; y++) { const a = Math.max(0, y - r), b = Math.min(H - 1, y + r); for (let x = 0; x < W; x++) { let v = tmp[y * W + x]; for (let q = a; q <= b; q++) { const u = tmp[q * W + x]; if (isMax ? u > v : u < v) v = u; } o[y * W + x] = v; } }
            return o;
        };
        const open = mm(mm(L, false), true), close = mm(mm(L, true), false), R = new Float32Array(N);
        for (let p = 0; p < N; p++) { const a = L[p] - open[p], b = close[p] - L[p]; R[p] = a > b ? a : b; }
        // le sens de la ligne : tenseur de structure de la réponse, lissé ; cohérence proche de 1 = un seul sens (une ligne)
        const jxx = new Float32Array(N), jxy = new Float32Array(N), jyy = new Float32Array(N);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x, gx = R[p + 1] - R[p - 1], gy = R[p + W] - R[p - W]; jxx[p] = gx * gx; jxy[p] = gx * gy; jyy[p] = gy * gy; }
        const box = (a, rad) => { // moyenne glissante (deux passes)
            for (let y = 0; y < H; y++) { const row = y * W; let s = 0; for (let x = -rad; x < W + rad; x++) { if (x + rad < W) s += a[row + x + rad] || 0; if (x - rad - 1 >= 0) s -= a[row + x - rad - 1]; if (x >= 0 && x < W) tmp[row + x] = s; } }
            for (let x = 0; x < W; x++) { let s = 0; for (let y = -rad; y < H + rad; y++) { if (y + rad < H) s += tmp[(y + rad) * W + x]; if (y - rad - 1 >= 0) s -= tmp[(y - rad - 1) * W + x]; if (y >= 0 && y < H) a[y * W + x] = s; } }
        };
        box(jxx, 3); box(jxy, 3); box(jyy, 3);
        const sample = []; for (let p = 0; p < N; p += 5) sample.push(R[p]); sample.sort((a, b) => a - b);
        const med = sample[sample.length >> 1] || 0, dev = Float32Array.from(sample, v => Math.abs(v - med)).sort()[sample.length >> 1] || 1;
        const T = Math.max(7, med + dev * (15 - sens * 0.12)), T2 = T * 0.6;
        const ok = p => !inside || inside[Math.min(H0 - 1, Math.floor(Math.floor(p / W) / k)) * W0 + Math.min(W0 - 1, Math.floor((p % W) / k))] > 127;
        // hystérésis : on part des points nets (forts et dans un seul sens) et on suit la ligne là où elle pâlit
        const lab = new Int32Array(N), stack = [], keep = [0]; let id = 0, lines = 0;
        const minLen = Math.max(14, Math.max(W, H) * (0.06 - sens * 0.00045));
        for (let p0 = 0; p0 < N; p0++) {
            if (lab[p0] || R[p0] <= T || !ok(p0)) continue;
            const a = jxx[p0], c = jyy[p0], b = jxy[p0], coh = Math.sqrt((a - c) * (a - c) + 4 * b * b) / (a + c + 1e-6); if (coh < 0.5) continue;
            id++; lab[p0] = id; stack.push(p0); let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
            while (stack.length) {
                const p = stack.pop(), x = p % W, y = (p - x) / W; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
                for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (!lab[q] && R[q] > T2 && ok(q) && Math.sqrt((jxx[q] - jyy[q]) ** 2 + 4 * jxy[q] * jxy[q]) / (jxx[q] + jyy[q] + 1e-6) > 0.4) { lab[q] = id; stack.push(q); } } }
            }
            // longueur et épaisseur d'après l'étalement des points (une ligne : très longue dans un sens, mince dans l'autre)
            const mx = sx / n, my = sy / n, vxx = sxx / n - mx * mx, vyy = syy / n - my * my, vxy = sxy / n - mx * my, tr = vxx + vyy, det = vxx * vyy - vxy * vxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
            const len = Math.sqrt(12 * Math.max(0, l1)), thick = n / Math.max(1, len);
            const good = len >= minLen && thick <= 5; keep.push(good ? 1 : 0); if (good) lines++;
        }
        // à la taille de img, un peu plus large que la ligne (le bord ne laisse pas de liseré)
        const small = new Uint8Array(N); for (let p = 0; p < N; p++) if (lab[p] && keep[lab[p]]) small[p] = 1;
        const g = Math.max(1, Math.round(1 / k)), mask = new Uint8Array(W0 * H0), t2 = new Uint8Array(W0 * H0);
        for (let y = 0; y < H0; y++) { const ty = Math.min(H - 1, Math.floor(y * k)) * W; for (let x = 0; x < W0; x++) t2[y * W0 + x] = small[ty + Math.min(W - 1, Math.floor(x * k))]; }
        const t3 = new Uint8Array(W0 * H0);
        for (let y = 0; y < H0; y++) { const row = y * W0; let run = -1e9; for (let x = 0; x < W0; x++) { if (t2[row + x]) run = x; t3[row + x] = x - run <= g ? 1 : 0; } run = 1e9; for (let x = W0 - 1; x >= 0; x--) { if (t2[row + x]) run = x; if (run - x <= g) t3[row + x] = 1; } }
        for (let x = 0; x < W0; x++) { let run = -1e9; for (let y = 0; y < H0; y++) { if (t3[y * W0 + x]) run = y; if (y - run <= g) mask[y * W0 + x] = 255; } run = 1e9; for (let y = H0 - 1; y >= 0; y--) { if (t3[y * W0 + x]) run = y; if (run - y <= g) mask[y * W0 + x] = 255; } }
        return {mask, lines};
    }
    /** Un masque (0 à 255 par point) en toile pw × ph : l'opacité porte le masque (pour les sélections et l'historique) */
    const rtMaskCanvas = (mask, W, H, color = null) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), id = g.createImageData(W, H); const rgb = color ? [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16)) : [0, 0, 0]; for (let p = 0; p < mask.length; p++) { if (!mask[p]) continue; const i = p * 4; id.data[i] = rgb[0]; id.data[i + 1] = rgb[1]; id.data[i + 2] = rgb[2]; id.data[i + 3] = mask[p]; } g.putImageData(id, 0, 0); return c; };

    /* ═══ ◧ Avant / après : le rideau qu'on glisse sur la photo, et l'image à exporter (côte à côte ou rideau, avec légende) ═══ */
    /**
     * Pose sur la photo (target, une toile dans host) l'original coupé à la position du rideau.
     * before : une toile ou une ImageData (l'original). → {toggle(on), setVertical(v), place(), on, pos, vertical}
     */
    ext.rtCurtain = ({host, target, before, onChange = null}) => {
        const cv = document.createElement('canvas'); cv.className = 'h-ba-before'; cv.hidden = true;
        if (before instanceof ImageData) { cv.width = before.width; cv.height = before.height; cv.getContext('2d').putImageData(before, 0, 0); }
        else { cv.width = before.width; cv.height = before.height; cv.getContext('2d').drawImage(before, 0, 0); }
        const line = document.createElement('div'); line.className = 'h-ba-line'; line.hidden = true;
        line.innerHTML = '<span class="h-ba-grip" title="Glisse pour comparer">⇔</span><span class="h-ba-lab is-before">Avant</span><span class="h-ba-lab is-after">Après</span>';
        line.setAttribute('role', 'slider'); line.setAttribute('aria-label', 'Rideau avant / après'); line.tabIndex = 0;
        host.append(cv, line);
        const S = {on: false, pos: 0.5, vertical: true};
        const box = () => { // la place de l'image dans host (une toile peut garder ses proportions à l'intérieur de sa boîte)
            const hr = host.getBoundingClientRect(), tr = target.getBoundingClientRect(), k = Math.min(tr.width / target.width, tr.height / target.height) || 1, w = target.width * k, h = target.height * k;
            return {left: tr.left - hr.left + host.scrollLeft + (tr.width - w) / 2, top: tr.top - hr.top + host.scrollTop + (tr.height - h) / 2, width: w, height: h};
        };
        const place = () => {
            if (!S.on) return; const b = box(), p = Math.round(S.pos * 1000) / 10;
            Object.assign(cv.style, {left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', clipPath: S.vertical ? `inset(0 ${100 - p}% 0 0)` : `inset(0 0 ${100 - p}% 0)`, transform: target.style.transform || ''});
            line.classList.toggle('is-h', !S.vertical);
            Object.assign(line.style, S.vertical ? {left: b.left + b.width * S.pos + 'px', top: b.top + 'px', height: b.height + 'px', width: ''} : {left: b.left + 'px', top: b.top + b.height * S.pos + 'px', width: b.width + 'px', height: ''});
            line.setAttribute('aria-valuenow', String(Math.round(S.pos * 100)));
        };
        const ro = new ResizeObserver(place); ro.observe(host); ro.observe(target); host.addEventListener('scroll', place);
        line.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation(); line.setPointerCapture(e.pointerId); line.classList.add('is-drag');
            const mv = ev => { const b = box(), hr = host.getBoundingClientRect(); S.pos = Math.min(1, Math.max(0, S.vertical ? (ev.clientX - hr.left + host.scrollLeft - b.left) / b.width : (ev.clientY - hr.top + host.scrollTop - b.top) / b.height)); place(); onChange?.(S); };
            const up = () => { line.removeEventListener('pointermove', mv); line.classList.remove('is-drag'); };
            line.addEventListener('pointermove', mv); line.addEventListener('pointerup', up, {once: true}); line.addEventListener('pointercancel', up, {once: true});
        });
        line.addEventListener('keydown', e => { const k = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[e.key]; if (!k) return; e.preventDefault(); e.stopPropagation(); S.pos = Math.min(1, Math.max(0, S.pos + k * (e.shiftKey ? 0.1 : 0.02))); place(); onChange?.(S); });
        return Object.assign(S, {
            toggle(on = !S.on) { S.on = !!on; cv.hidden = line.hidden = !S.on; place(); onChange?.(S); return S.on; },
            setVertical(v) { S.vertical = !!v; place(); onChange?.(S); },
            setBefore(b) { cv.width = b.width; cv.height = b.height; if (b instanceof ImageData) cv.getContext('2d').putImageData(b, 0, 0); else cv.getContext('2d').drawImage(b, 0, 0); place(); }, // 🔄 l'image a tourné
            place, destroy() { ro.disconnect(); cv.remove(); line.remove(); },
        });
    };
    /** L'image « avant / après » : côte à côte, l'une sous l'autre, ou en rideau (vertical, horizontal), légende en bas */
    function rtCompose(before, after, o, maxSide = 6000) {
        const W0 = after.width, H0 = after.height, gap = o.layout === 'side' || o.layout === 'stack' ? Math.round(Math.max(W0, H0) * 0.012) : 0;
        const k = Math.min(1, maxSide / ((o.layout === 'side' ? 2 : 1) * W0 + gap), maxSide / ((o.layout === 'stack' ? 2 : 1) * H0 + gap));
        const w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k)), fs = Math.max(12, Math.round(Math.max(w, h) * 0.032)), cap = String(o.caption || '').trim(), capH = cap ? Math.round(fs * 2.2) : 0;
        const c = document.createElement('canvas'); c.width = o.layout === 'side' ? w * 2 + gap : w; c.height = (o.layout === 'stack' ? h * 2 + gap : h) + capH;
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
        const lab = (t, x, y, align = 'left') => { if (!o.labels) return; g.save(); g.font = `700 ${fs}px system-ui, Arial, sans-serif`; const tw = g.measureText(t).width, px = fs * 0.45, bw = tw + px * 2, bh = fs * 1.5, bx = align === 'right' ? x - bw : x; g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect ? g.roundRect(bx, y, bw, bh, bh / 2) : g.rect(bx, y, bw, bh); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(t, bx + px, y + bh / 2); g.restore(); };
        const m = fs * 0.6;
        if (o.layout === 'side' || o.layout === 'stack') {
            g.drawImage(before, 0, 0, w, h); const x2 = o.layout === 'side' ? w + gap : 0, y2 = o.layout === 'stack' ? h + gap : 0; g.drawImage(after, x2, y2, w, h);
            lab('Avant', m, m); lab('Après', x2 + m, y2 + m);
        } else {
            const vert = o.layout !== 'curtain-h', p = Math.min(1, Math.max(0, o.pos ?? 0.5));
            g.drawImage(after, 0, 0, w, h); g.save(); g.beginPath(); vert ? g.rect(0, 0, w * p, h) : g.rect(0, 0, w, h * p); g.clip(); g.drawImage(before, 0, 0, w, h); g.restore();
            g.save(); g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, Math.round(fs / 8)); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = fs / 3; g.beginPath(); if (vert) { g.moveTo(w * p, 0); g.lineTo(w * p, h); } else { g.moveTo(0, h * p); g.lineTo(w, h * p); } g.stroke(); g.restore();
            lab('Avant', m, m); if (vert) lab('Après', w - m, m, 'right'); else lab('Après', m, h - m - fs * 1.5);
        }
        if (cap) { g.fillStyle = '#222'; g.font = `500 ${Math.round(fs * 0.9)}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(cap.length > 160 ? cap.slice(0, 159) + '…' : cap, c.width / 2, c.height - capH / 2, c.width - fs * 2); }
        return c;
    }
    /* ── 📏 Image → Taille de l'image / ⬚ Taille de la zone de travail / ℹ️ Fichier → Informations : le rendu et le fichier ── */
    /** rééchantillonner une toile à w × h : auto / smooth (bicubique, plus lisse) / sharp (réduire en gardant le détail) / bilinear / nearest (contours nets) */
    function rtResample(src, w, h, method = 'auto') {
        w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
        if (w === src.width && h === src.height) return src;
        const out = document.createElement('canvas'); out.width = w; out.height = h; const g = out.getContext('2d');
        if (method === 'nearest') { g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, w, h); return out; }
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = method === 'bilinear' ? 'low' : 'high';
        // une forte réduction : par moitiés successives (plus net, sans moirage) ; « plus net » ajoute un léger renforcement
        let cur = src;
        if (method !== 'bilinear') while (cur.width / 2 >= w * 1.0001 && cur.height / 2 >= h * 1.0001) { const t = document.createElement('canvas'); t.width = Math.round(cur.width / 2); t.height = Math.round(cur.height / 2); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(cur, 0, 0, t.width, t.height); cur = t; }
        g.drawImage(cur, 0, 0, w, h);
        if (method === 'sharp' && w * h <= 40e6) { try { const id = g.getImageData(0, 0, w, h), d = id.data, c0 = new Uint8ClampedArray(d), W4 = w * 4, a = 0.35; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * W4 + x * 4; for (let k = 0; k < 3; k++) { const v = c0[i + k]; d[i + k] = v + a * (4 * v - c0[i + k - 4] - c0[i + k + 4] - c0[i + k - W4] - c0[i + k + W4]); } } g.putImageData(id, 0, 0); } catch (_) {} }
        return out;
    }
    /** la zone de travail : la toile agrandie (fond choisi ou transparent) ou recadrée, autour de l'image, selon l'ancrage */
    function rtCanvasSize(src, b) {
        if (!b) return src;
        const W = Math.max(1, Math.round(src.width * b.w)), H = Math.max(1, Math.round(src.height * b.h));
        if (W === src.width && H === src.height) return src;
        const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d');
        if (b.bg && b.bg !== 'transparent') { g.fillStyle = b.bg; g.fillRect(0, 0, W, H); }
        g.drawImage(src, Math.round((W - src.width) * b.ax), Math.round((H - src.height) * b.ay));
        return out;
    }
    const rtXmlEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
    /** le paquet XMP (Dublin Core, IPTC : personnes sur la photo) des informations de l'image */
    function rtXmp(info = {}, names = []) {
        const alt = (tag, v) => v ? `<dc:${tag}><rdf:Alt><rdf:li xml:lang="x-default">${rtXmlEsc(v)}</rdf:li></rdf:Alt></dc:${tag}>` : '';
        const kw = String(info.keywords || '').split(/[,;]/).map(k => k.trim()).filter(Boolean);
        const iso = info.date ? (A()?.freeDateToIso?.(info.date) || (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(info.date) ? info.date : '')) : '';
        return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">`
            + alt('title', info.title) + (info.author ? `<dc:creator><rdf:Seq><rdf:li>${rtXmlEsc(info.author)}</rdf:li></rdf:Seq></dc:creator>` : '') + alt('rights', info.rights) + alt('description', info.desc)
            + (kw.length ? `<dc:subject><rdf:Bag>${kw.map(k => `<rdf:li>${rtXmlEsc(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>` : '')
            + (iso ? `<photoshop:DateCreated>${rtXmlEsc(iso)}</photoshop:DateCreated>` : '') + (info.date ? `<dc:coverage>${rtXmlEsc(info.date)}</dc:coverage>` : '')
            + (names.length ? `<Iptc4xmpExt:PersonInImage><rdf:Bag>${names.map(n => `<rdf:li>${rtXmlEsc(n)}</rdf:li>`).join('')}</rdf:Bag></Iptc4xmpExt:PersonInImage>` : '')
            + `<xmp:CreatorTool>LCNDA</xmp:CreatorTool></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    }
    let rtCrcT = null;
    const rtCrc = bytes => { if (!rtCrcT) { rtCrcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; rtCrcT[n] = c >>> 0; } } let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = rtCrcT[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    /** ℹ️ les informations (XMP) et la résolution (ppp) écrites dans le fichier PNG ou JPG, comme Photoshop */
    async function rtEmbedMeta(blob, {info = null, names = [], dpi = 0} = {}) {
        const has = info && Object.keys(info).some(k => k !== 'people' && info[k]);
        if (!blob || (!has && !names.length && !dpi)) return blob;
        try {
            const b = new Uint8Array(await blob.arrayBuffer()), enc = new TextEncoder(), xmp = enc.encode(rtXmp(info || {}, names));
            const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
            if (b[0] === 0x89 && b[1] === 0x50) { // PNG : pHYs + iTXt « XML:com.adobe.xmp », juste après IHDR
                const chunk = (type, data) => { const t = enc.encode(type), body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length); return new Uint8Array([...be32(data.length), ...body, ...be32(rtCrc(body))]); };
                const parts = [];
                if (dpi) { const ppm = Math.round(dpi / 0.0254); parts.push(chunk('pHYs', new Uint8Array([...be32(ppm), ...be32(ppm), 1]))); }
                if (has || names.length) { const key = enc.encode('XML:com.adobe.xmp'), d = new Uint8Array(key.length + 5 + xmp.length); d.set(key); d.set([0, 0, 0, 0, 0], key.length); d.set(xmp, key.length + 5); parts.push(chunk('iTXt', d)); }
                const at = 8 + 25, out = new Uint8Array(b.length + parts.reduce((n, p) => n + p.length, 0)); out.set(b.subarray(0, at)); let o = at; parts.forEach(p => { out.set(p, o); o += p.length; }); out.set(b.subarray(at), o);
                return new Blob([out], {type: 'image/png'});
            }
            if (b[0] === 0xff && b[1] === 0xd8) { // JPG : densité du JFIF + segment APP1 XMP
                let at = 2;
                if (b[2] === 0xff && b[3] === 0xe0 && dpi) { const d = Math.min(65535, Math.round(dpi)); b[13] = 1; b[14] = d >> 8; b[15] = d & 255; b[16] = d >> 8; b[17] = d & 255; }
                if (b[2] === 0xff && b[3] === 0xe0) at = 4 + ((b[4] << 8) | b[5]);
                if (!(has || names.length)) return new Blob([b], {type: 'image/jpeg'});
                const ns = enc.encode('http://ns.adobe.com/xap/1.0/\0'), len = 2 + ns.length + xmp.length; if (len > 65535) return new Blob([b], {type: 'image/jpeg'});
                const seg = new Uint8Array(2 + len); seg.set([0xff, 0xe1, len >> 8, len & 255]); seg.set(ns, 4); seg.set(xmp, 4 + ns.length);
                const out = new Uint8Array(b.length + seg.length); out.set(b.subarray(0, at)); out.set(seg, at); out.set(b.subarray(at), at + seg.length);
                return new Blob([out], {type: 'image/jpeg'});
            }
        } catch (_) {}
        return blob;
    }
    ext.rtEmbedMeta = rtEmbedMeta; ext.rtResample = rtResample; ext.rtCanvasSize = rtCanvasSize;
    const canvasBlob = (c, type = 'image/jpeg', q = 0.92) => new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('Image trop grande pour le navigateur.'))), type, q));
    const saveBlobAs = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    /** 🖨 Imprimer une image (une page, centrée) sans quitter l'outil */
    const printBlob = (blob, title = 'Image') => new Promise(res => {
        const url = URL.createObjectURL(blob), f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
        const doc = f.contentDocument; doc.open(); doc.write(`<!doctype html><title>${esc(title)}</title><style>@page{margin:10mm}html,body{margin:0}img{display:block;max-width:100%;max-height:96vh;margin:auto}</style><img alt="" src="${url}">`); doc.close();
        const im = doc.querySelector('img'), go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (_) {} setTimeout(() => { f.remove(); URL.revokeObjectURL(url); res(); }, 1500); };
        if (im.complete) go(); else { im.onload = go; im.onerror = go; }
    });
    /** Une copie de l'image dans les médias, rattachée aux mêmes fiches que le média de départ (ou seule, sans média de départ) */
    async function rtUploadCopy(blob, {mediaId = 0, title = 'Image'} = {}) {
        const fd = new FormData(), ext0 = blob.type === 'image/png' ? 'png' : 'jpg'; fd.append('file', blob, 'export.' + ext0); fd.append('title', String(title).slice(0, 300)); fd.append('csrf', A().state.csrf);
        if (mediaId) { fd.append('media_id', mediaId); fd.append('mode', 'copy'); fd.append('show', '0'); } else fd.append('kind', 'image');
        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Copie impossible.');
        return j.result;
    }
    ext.rtUploadCopy = rtUploadCopy;
    /** Une image glissée ou collée dans un outil entre dans les médias (sans fiche) : renvoie {media_id, filename} */
    ext.rtImportImage = async file => rtUploadCopy(file, {title: String(file.name || 'Image importée').replace(/\.[a-z0-9]{2,5}$/i, '')});
    /** ⤓ La fenêtre d'export unique pour une image faite par un outil (PNG, JPG, imprimer ; copie dans les médias) */
    ext.rtExportImage = ({title = 'Image', render, mediaId = 0, copyTitle = '', png = false, meta = null} = {}) => {
        ext.rtEnsureCss();
        const UI = window.LCNDA_UI; if (!UI?.openExportDialog) return toast('La fenêtre d’export n’est pas encore prête.', 'error');
        let cache = null; const full = async () => (cache = cache || await render());
        const run = type => async o => {
            let c = await full();
            if (o.format === 'print' || type === 'image/jpeg') { const w = document.createElement('canvas'); w.width = c.width; w.height = c.height; const g = w.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w.width, w.height); g.drawImage(c, 0, 0); c = w; } // le JPG n'a pas de transparence : fond blanc
            if (o.format === 'print') return printBlob(await canvasBlob(c, 'image/jpeg', 0.95), title);
            let blob = await canvasBlob(c, type, 0.93); if (meta) blob = await rtEmbedMeta(blob, await meta()); saveBlobAs(blob, o.filename);
            if (o.saveCopy) { await rtUploadCopy(blob, {mediaId, title: copyTitle || title}); toast('Image téléchargée ; une copie est rangée dans les médias.'); }
        };
        return UI.openExportDialog({title, defaultName: title, quality: false, saveCopy: !!mediaId, copyChecked: !!mediaId, info: '',
            preview: async () => { const c = await full(), k = Math.min(1, 360 / Math.max(c.width, c.height)), t = document.createElement('canvas'); t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.85); },
            formats: [{id: png ? 'png' : 'jpg', run: run(png ? 'image/png' : 'image/jpeg')}, {id: png ? 'jpg' : 'png', run: run(png ? 'image/jpeg' : 'image/png')}, {id: 'print', run: run('print')}]});
    };
    /** ⤓ Exporter l'avant / après : la fenêtre d'export unique, avec la disposition, la position du rideau et la légende dans l'aperçu */
    ext.rtBeforeAfterExport = ({title = 'Photo', getBefore, getAfter, mediaId = 0, pos = 0.5, vertical = true, layout = ''} = {}) => {
        ext.rtEnsureCss();
        const UI = window.LCNDA_UI; if (!UI?.openExportDialog) return toast('La fenêtre d’export n’est pas encore prête.', 'error');
        const o = {layout: layout || (vertical ? 'curtain-v' : 'curtain-h'), pos, caption: title, labels: true};
        let src = null; const both = async () => (src = src || await Promise.all([getBefore(), getAfter()]));
        const small = async () => { const [b, a] = await both(), k = Math.min(1, 900 / Math.max(a.width, a.height)), sz = c => { const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(a.width * k)); t.height = Math.max(1, Math.round(a.height * k)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t; }; return [sz(b), sz(a)]; };
        let smallP = null;
        const box = document.createElement('div'); box.className = 'h-ba-exp';
        const pimg = document.createElement('img'); pimg.alt = 'Aperçu de l’avant / après'; pimg.className = 'h-ba-prev';
        box.innerHTML = `<label>Disposition <select data-ba-layout><option value="curtain-v">Rideau vertical (avant à gauche)</option><option value="curtain-h">Rideau horizontal (avant en haut)</option><option value="side">Côte à côte</option><option value="stack">L’une sous l’autre</option></select></label>
            <label data-ba-posrow>Position du rideau <input type="range" min="5" max="95" value="${Math.round(pos * 100)}" data-ba-pos data-unit="%"></label>
            <label>Légende <input type="text" maxlength="160" data-ba-cap value="${esc(title)}" placeholder="ex. Mariage de Jean et Marie, 1925"></label>
            <label class="ui-toggle"><input type="checkbox" data-ba-labels checked><i></i>Écrire « Avant » et « Après »</label>`;
        const $ = s => box.querySelector(s);
        $('[data-ba-layout]').value = o.layout;
        let tm = 0; const redraw = async () => { $('[data-ba-posrow]').hidden = !o.layout.startsWith('curtain'); try { smallP = smallP || small(); const [b, a] = await smallP; pimg.src = rtCompose(b, a, o, 900).toDataURL('image/jpeg', 0.85); } catch (err) { pimg.alt = err.message; } };
        box.addEventListener('input', e => { if (e.target.matches('[data-ba-pos]')) o.pos = Number(e.target.value) / 100; if (e.target.matches('[data-ba-cap]')) o.caption = e.target.value; clearTimeout(tm); tm = setTimeout(redraw, 120); });
        box.addEventListener('change', e => { if (e.target.matches('[data-ba-layout]')) o.layout = e.target.value; if (e.target.matches('[data-ba-labels]')) o.labels = e.target.checked; redraw(); });
        const run = type => async x => {
            const [b, a] = await both(), c = rtCompose(b, a, o);
            if (x.format === 'print') return printBlob(await canvasBlob(c, 'image/jpeg', 0.95), title);
            const blob = await canvasBlob(c, type, 0.93); saveBlobAs(blob, x.filename);
            if (x.saveCopy) { await rtUploadCopy(blob, {mediaId, title: `${title} (avant / après)`}); toast('Avant / après téléchargé ; une copie est rangée dans les médias.'); }
        };
        return UI.openExportDialog({title: `Avant / après — ${title}`, defaultName: `${title} avant-apres`, quality: false, saveCopy: !!mediaId, copyChecked: !!mediaId, info: '',
            preview: async () => { // les réglages de l'avant / après vont sous les formats ; l'aperçu à droite
                const main = [...document.querySelectorAll('dialog.ui-export')].pop()?.querySelector('.ui-export-formats'); if (main) main.after(box); else pimg.after(box);
                redraw(); return pimg; },
            formats: [{id: 'jpg', run: run('image/jpeg')}, {id: 'png', run: run('image/png')}, {id: 'print', run: run('print')}]});
    };
    /** Boutons « 👁 Avant / après » (garder appuyé), « ◧ Rideau », sens du rideau et export, à poser sous la photo */
    const rtBaButtons = p => `<span class="h-ba-bar" data-${p}-babar><button type="button" class="button small secondary" data-${p}-before title="Garder appuyé pour voir l’original">👁 Avant / après</button><button type="button" class="button small secondary" data-${p}-curtain title="Comparer avec un rideau qu’on glisse sur la photo">◧ Rideau</button><button type="button" class="button small secondary" data-${p}-curdir hidden title="Rideau vertical ou horizontal">⇅</button><button type="button" class="button small secondary" data-${p}-curexp hidden title="Exporter l’avant / après en image (côte à côte ou rideau, avec légende)">⤓</button></span>`;

    ext.rtBaButtons = rtBaButtons;
    /* ═══ 🪪 Photo d'identité : le visage cadré au même format pour tous (yeux à la même hauteur, 3:4), puis portrait de la fiche ═══ */
    const IDP_KEY = 'genealogie-idphoto';
    const IDP_RATIOS = [['0.75', '3:4 (portrait classique)'], ['0.7778', '35 × 45 mm (photo d’identité)'], ['0.8', '4:5'], ['1', 'Carré']];
    const idpPrefs = () => { let v = {}; try { v = JSON.parse(localStorage.getItem(IDP_KEY) || '{}') || {}; } catch (_) {} return {ratio: IDP_RATIOS.some(r => Number(r[0]) === Number(v.ratio)) ? Number(v.ratio) : 0.75, eye: Math.min(0.6, Math.max(0.25, Number(v.eye) || 0.42)), margin: Math.min(100, Math.max(0, Number.isFinite(Number(v.margin)) ? Number(v.margin) : 45))}; };
    const idpSave = p => lsSet(IDP_KEY, JSON.stringify({ratio: p.ratio, eye: p.eye, margin: p.margin}));
    /** Le cadre (comme un recadrage : x, y, w, h relatifs, a en degrés) qui met les yeux à l'horizontale, à la hauteur voulue */
    function idpCrop(eyes, W, H, p) {
        const [[lx, ly], [rx, ry]] = eyes[0][0] <= eyes[1][0] ? eyes : [eyes[1], eyes[0]];
        const tilt = Math.atan2(ry - ly, rx - lx), a = -tilt * 180 / Math.PI, th = a * Math.PI / 180, cx = W / 2, cy = H / 2;
        const mx = (lx + rx) / 2 - cx, my = (ly + ry) / 2 - cy, Mx = mx * Math.cos(th) - my * Math.sin(th) + cx, My = mx * Math.sin(th) + my * Math.cos(th) + cy;
        const D = Math.max(4, Math.hypot(rx - lx, ry - ly)), hc = D * (3.4 + p.margin / 100 * 3.2), wc = hc * p.ratio;
        return {x: (Mx - wc / 2) / W, y: (My - p.eye * hc) / H, w: wc / W, h: hc / H, a: Math.round(a * 10) / 10};
    }
    /** L'image recadrée (cadre tourné, fond blanc hors de la photo), au plus maxH points de haut */
    function idpRender(src, W, H, c, maxH = 1600) {
        const ow = c.w * W, oh = c.h * H, k = Math.min(1, maxH / oh), out = document.createElement('canvas'); out.width = Math.max(1, Math.round(ow * k)); out.height = Math.max(1, Math.round(oh * k));
        const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height); g.imageSmoothingQuality = 'high'; g.scale(k, k);
        g.translate(-c.x * W, -c.y * H); g.translate(W / 2, H / 2); g.rotate(c.a * Math.PI / 180); g.translate(-W / 2, -H / 2); g.drawImage(src, 0, 0, W, H); return out;
    }
    /** Les yeux d'un visage sur une image (en points de l'image) : le modèle de reconnaissance des visages de l'app
     *  (heritage-faces.js, points du visage) ; sinon la boîte d'une identification (hint, en %) ; sinon null. */
    async function idpFindEyes(im, {hint = null, onStep = null} = {}) {
        const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height, fromBox = (b, source) => ({eyes: [[(b.x + b.w * 0.3) * W / 100, (b.y + b.h * 0.42) * H / 100], [(b.x + b.w * 0.7) * W / 100, (b.y + b.h * 0.42) * H / 100]], source});
        try {
            const load = ext.faceInternals?.loadModel; if (!load) throw new Error('modèle absent');
            const F = await Promise.race([load(s => onStep?.(`Modèle des visages : ${s}`)), new Promise((_, ko) => setTimeout(() => ko(new Error('trop long')), 45000))]);
            onStep?.('Recherche du visage…');
            const k = Math.min(1, 1600 / Math.max(W, H)), c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            const res = await F.detectAllFaces(c, new F.SsdMobilenetv1Options({minConfidence: 0.35, maxResults: 30})).withFaceLandmarks();
            const pick = res.map(r => { const b = r.detection.box, bx = {x: b.x / c.width * 100, y: b.y / c.height * 100, w: b.width / c.width * 100, h: b.height / c.height * 100}; const over = hint ? Math.max(0, Math.min(bx.x + bx.w, hint.x + hint.w) - Math.max(bx.x, hint.x)) * Math.max(0, Math.min(bx.y + bx.h, hint.y + hint.h) - Math.max(bx.y, hint.y)) : 0; return {r, bx, score: hint ? over : b.width * b.height}; }).sort((a, b) => b.score - a.score)[0];
            if (pick && (!hint || pick.score > 0)) {
                const avg = pts => [pts.reduce((s, q) => s + q.x, 0) / pts.length / k, pts.reduce((s, q) => s + q.y, 0) / pts.length / k];
                return {eyes: [avg(pick.r.landmarks.getLeftEye()), avg(pick.r.landmarks.getRightEye())], box: pick.bx, source: 'model'};
            }
        } catch (_) { /* pas de modèle (pas d'internet la première fois) : la boîte d'une identification */ }
        if (hint) return fromBox(hint, 'tag');
        return null;
    }
    /** La photo envoyée dans les médias de la fiche (photo de la personne) puis choisie comme portrait (route set_portrait) */
    async function idpUseAsPortrait(canvas, personId, name = '') {
        const blob = await canvasBlob(canvas, 'image/jpeg', 0.92), fd = new FormData();
        fd.append('files[]', blob, 'portrait.jpg'); fd.append('person_id', personId); fd.append('title', `Portrait${name ? ` de ${name}` : ''} (photo d’identité)`); fd.append('is_person_photo', '1'); fd.append('csrf', A().state.csrf);
        const r = await fetch('upload.php', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
        const mediaId = Number(j.media?.[0]); if (!mediaId) throw new Error('Photo non enregistrée.');
        await api('set_portrait', {}, {method: 'POST', body: {person_id: personId, media_id: mediaId}});
        return mediaId;
    }
    ext.idPhoto = {prefs: idpPrefs, crop: idpCrop, render: idpRender, findEyes: idpFindEyes, useAsPortrait: idpUseAsPortrait};
    /** Choisir la fiche (le menu de choix des personnes), avec une personne proposée d'office */
    const idpAskPerson = (preset = 0, title = 'Utiliser comme portrait de quelle fiche ?') => new Promise(res => {
        let done = false, chosen = '';
        ext.openDialog({eyebrow: 'PHOTO D’IDENTITÉ', title, submitLabel: 'Utiliser comme portrait',
            body: `<div><span class="pk-lab">Personne</span>${window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name: 'idp_person', kind: 'person', value: preset || ''}) : '<input name="idp_person" type="number">'}</div><p class="muted">La photo recadrée est ajoutée aux médias de la fiche, puis devient son portrait (l’ancien portrait reste dans ses médias).</p>`,
            onOpen: d => { d.addEventListener('close', () => { if (!done) res(null); }, {once: true}); d.addEventListener('picker-change', e => { chosen = e.detail.item?.title || ''; }); },
            onSubmit: f => { const id = Number(f.elements.idp_person?.value) || 0; if (!id) return window.LCNDA_UI.fail(f.elements.idp_person, 'Choisis une personne dans la liste.'); done = true; res({id, name: chosen}); }});
    });
    ext.idpAskPerson = idpAskPerson;

    /** 🪪 Portraits de plusieurs fiches : chaque portrait (ou photo de la fiche) recadré au même format, à vérifier, puis utilisé */
    async function idpBatchDialog() {
        ext.rtEnsureCss(); const P = window.LCNDA_PICKER, p = idpPrefs(); let rows = [], busy = false;
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-modal-wide h-idp-batch';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">RETOUCHE · PHOTO D’IDENTITÉ</span><h2>🪪 Portraits de plusieurs fiches</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-idp-body"><p class="muted">Choisis les fiches : pour chacune, l’app prend son portrait (ou sa première photo), trouve le visage et le cadre au même format que les autres (yeux à la même hauteur). Tu vérifies, puis « Utiliser comme portraits » : chaque photo recadrée entre dans les médias de sa fiche et devient son portrait (l’ancien reste).</p>
            <div class="h-idp-people">${P?.pickerField ? P.pickerField({name: 'idp_people', kind: 'person', multiple: true}) : ''}</div>
            <div class="h-idp-opts"><label>Format <select data-idp-ratio>${IDP_RATIOS.map(([v, l]) => `<option value="${v}" ${Number(v) === p.ratio ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label data-help="De combien le cadre dépasse autour du visage : petit = visage serré, grand = épaules et un peu de fond.">Marge autour du visage <input type="range" min="0" max="100" value="${p.margin}" data-idp-margin data-unit="%"></label>
                <label data-help="La hauteur des yeux dans le cadre, depuis le haut : la même pour tous les portraits, ils s’alignent quand on les met côte à côte.">Hauteur des yeux <input type="range" min="25" max="60" value="${Math.round(p.eye * 100)}" data-idp-eye data-unit="%"></label>
                <button type="button" class="button" data-idp-go>🔍 Préparer les portraits</button></div>
            <div class="h-idp-state" data-idp-state></div><div class="h-idp-grid" data-idp-grid></div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="button" class="button" data-idp-use disabled>✓ Utiliser comme portraits</button></div>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        const $ = s => dlg.querySelector(s), state = $('[data-idp-state]'), grid = $('[data-idp-grid]'), useBtn = $('[data-idp-use]');
        const opts = () => ({ratio: Number($('[data-idp-ratio]').value) || 0.75, margin: Number($('[data-idp-margin]').value), eye: Number($('[data-idp-eye]').value) / 100});
        const draw = () => {
            const ok = rows.filter(r => r.crop && r.use);
            grid.innerHTML = rows.length ? rows.map((r, i) => `<figure class="h-idp-card${r.crop ? '' : ' is-ko'}" data-i="${i}">${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span class="h-idp-none">${r.crop === undefined ? '…' : '🙈'}</span>`}<figcaption><b>${esc(r.name)}</b><small>${esc(r.note || '')}</small>${r.crop ? `<label class="checkbox-line"><input type="checkbox" data-idp-use1 ${r.use ? 'checked' : ''}> utiliser</label>` : ''}</figcaption></figure>`).join('')
                : A().emptyState({icon: '🪪', text: 'Aucune fiche choisie pour l’instant', hint: 'Choisis une ou plusieurs personnes ci-dessus, puis « 🔍 Préparer les portraits ».'});
            useBtn.disabled = busy || !ok.length; useBtn.textContent = ok.length ? `✓ Utiliser comme portraits (${ok.length})` : '✓ Utiliser comme portraits';
        };
        const rerender = () => rows.forEach(r => { if (!r.eyes) return; r.crop = idpCrop(r.eyes, r.W, r.H, opts()); r.thumb = idpRender(r.img, r.W, r.H, r.crop, 220).toDataURL('image/jpeg', 0.85); });
        let tm = 0; dlg.addEventListener('input', e => { if (e.target.closest('[data-idp-margin],[data-idp-eye]') && rows.length) { clearTimeout(tm); tm = setTimeout(() => { rerender(); draw(); }, 150); } });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-idp-ratio]') && rows.length) { rerender(); draw(); } if (e.target.matches('[data-idp-use1]')) { rows[Number(e.target.closest('[data-i]').dataset.i)].use = e.target.checked; draw(); } });
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-x]')) { if (busy) return; dlg.close(); return; }
            if (e.target.closest('[data-idp-go]')) {
                const ids = String(dlg.querySelector('[name="idp_people"]')?.value || '').split(',').map(Number).filter(Boolean);
                if (!ids.length) return toast('Choisis d’abord une ou plusieurs fiches.', 'error');
                busy = true; idpSave(opts()); rows = ids.map(id => ({id, name: `Fiche ${id}`})); draw();
                for (const [i, r] of rows.entries()) {
                    state.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(`${i + 1} / ${rows.length} · ${r.name}`) : esc(r.name);
                    try {
                        const d = await api('person', {id: r.id}), pe = d.person || {}; r.name = `${pe.first_name || ''} ${pe.last_name || ''}`.trim() || r.name;
                        const imgs = (d.media || []).filter(m => (m.media_type || 'image') === 'image' && /\.(jpe?g|png|webp)$/i.test(m.filename || ''));
                        // le portrait d'abord, puis les photos où la personne est identifiée (la boîte de son visage aide quand le modèle manque)
                        const portrait = imgs.find(x => Number(x.id) === Number(pe.portrait_media_id)) || null; let m = null, hint = null;
                        for (const x of [...(portrait ? [portrait] : []), ...imgs.filter(y => y !== portrait)].slice(0, 12)) { const t = ((await api('media_tags', {media_id: x.id})).tags || []).find(t => Number(t.person_id) === r.id && t.tag_type === 'person'); if (t) { m = x; hint = {x: Number(t.x), y: Number(t.y), w: Number(t.w), h: Number(t.h)}; break; } }
                        m = m || portrait || imgs[0]; if (!m) { r.crop = null; r.note = 'aucune photo dans la fiche'; draw(); continue; }
                        const im = new Image(); im.src = `media/${encodeURIComponent(m.filename)}`; await im.decode();
                        const f = await idpFindEyes(im, {hint, onStep: s => { state.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(`${r.name} · ${s}`) : esc(s); }});
                        r.img = im; r.W = im.naturalWidth; r.H = im.naturalHeight; r.media = m;
                        if (!f) { r.eyes = [[r.W * 0.43, r.H * 0.36], [r.W * 0.57, r.H * 0.36]]; r.use = false; r.note = `⚠️ visage non trouvé sur « ${m.title || m.filename} » : cadrage au centre, à vérifier (ou identifie le visage dans la visionneuse)`; rerender(); draw(); continue; }
                        r.eyes = f.eyes; r.use = true; r.note = `${m.title || m.filename} · ${f.source === 'model' ? 'yeux trouvés' : 'd’après l’identification'}`; rerender(); draw();
                    } catch (err) { r.crop = null; r.note = err.message; draw(); }
                }
                busy = false; const n = rows.filter(r => r.crop && r.use).length, chk = rows.filter(r => r.crop && !r.use).length;
                state.innerHTML = window.LCNDA_UI?.notice ? window.LCNDA_UI.notice(n ? 'ok' : 'warn', `${n ? `${A().plural(n, 'portrait prêt', 'portraits prêts')} : décoche ceux qui ne vont pas, puis « Utiliser comme portraits ».` : 'Aucun visage trouvé tout seul.'}${chk ? ` ${A().plural(chk, 'autre est', 'autres sont')} cadré${chk > 1 ? 's' : ''} au centre : coche-le${chk > 1 ? 's' : ''} seulement s’il${chk > 1 ? 's vont' : ' va'}.` : ''}`) : ''; draw(); return;
            }
            if (e.target.closest('[data-idp-use]')) {
                const list = rows.filter(r => r.crop && r.use); if (!list.length) return;
                busy = true; draw(); let ok = 0;
                for (const [i, r] of list.entries()) {
                    state.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(`${i + 1} / ${list.length} · ${r.name}`) : '';
                    try { await idpUseAsPortrait(idpRender(r.img, r.W, r.H, r.crop), r.id, r.name); ok++; r.note = '✓ portrait mis à jour'; r.use = false; } catch (err) { r.note = `⛔ ${err.message}`; }
                    draw();
                }
                busy = false; state.innerHTML = window.LCNDA_UI?.notice ? window.LCNDA_UI.notice(ok === list.length ? 'ok' : 'warn', `${A().plural(ok, 'portrait mis à jour', 'portraits mis à jour')} sur ${list.length}.`) : ''; draw();
                toast(`${A().plural(ok, 'portrait mis à jour', 'portraits mis à jour')}.`);
                const S0 = A().state; if (S0.currentPersonId && S0.module === 'personnes') A().selectPerson?.(S0.currentPersonId, false);
            }
        });
        draw();
    }
    ext.openIdPhotoBatch = idpBatchDialog;

    /* ═══ Styles des nouveautés de la retouche (barre du haut, rideau, réparer, restaurer, photo d'identité) ═══ */
    const RT_CSS = `
.h-rt-topbar{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}
.h-rt-topbar .ui-topbar-name{width:150px;max-width:24vw}
.h-rt-topbar .h-rt-menubar summary{padding-left:6px;padding-right:6px}
.h-rt-topbar .h-rt-menubar{margin:0;padding:0;border:0}
.h-rt-topbar .spacer{flex:1 1 auto}
.h-rt-exportmenu{position:relative}
.h-rt-exportmenu>summary{list-style:none;cursor:pointer;font-weight:700;font-size:12.5px;padding:6px 10px;border:1px solid #c9ced6;border-radius:6px;background:#fff;white-space:nowrap}
.h-rt-exportmenu>summary::-webkit-details-marker{display:none}
.h-rt-exportmenu>.h-rt-menulist{right:0;left:auto;min-width:290px}
.h-ba-bar{display:inline-flex;gap:4px;flex-wrap:wrap;align-items:center}
.h-rt2 .h-ba-bar{position:sticky;left:10px;bottom:10px;float:left;margin-top:-44px;z-index:6}
.h-retouch-simple .h-ba-bar{position:absolute;left:10px;bottom:10px;z-index:6}
.h-ba-bar .is-active{background:#111;color:#fff}
.h-ba-before{position:absolute;pointer-events:none;z-index:4;image-rendering:auto}
.h-ba-line{position:absolute;z-index:5;width:0;cursor:ew-resize;touch-action:none}
.h-ba-line::before{content:"";position:absolute;top:0;bottom:0;left:-1px;width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.45)}
.h-ba-line::after{content:"";position:absolute;top:0;bottom:0;left:-10px;width:20px}
.h-ba-line.is-h{height:0;cursor:ns-resize}
.h-ba-line.is-h::before{left:0;right:0;top:-1px;bottom:auto;width:auto;height:2px}
.h-ba-line.is-h::after{left:0;right:0;top:-10px;bottom:auto;width:auto;height:20px}
.h-ba-grip{position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.4);z-index:1}
.h-ba-line.is-h .h-ba-grip{left:50%;top:0;transform:translate(-50%,-50%) rotate(90deg)}
.h-ba-lab{position:absolute;top:8px;font:700 12px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:10px;white-space:nowrap;pointer-events:none}
.h-ba-lab.is-before{right:10px}.h-ba-lab.is-after{left:10px}
.h-ba-line.is-h .h-ba-lab{top:auto;left:8px;right:auto}.h-ba-line.is-h .h-ba-lab.is-before{bottom:8px}.h-ba-line.is-h .h-ba-lab.is-after{top:8px}
.h-ba-exp{display:grid;gap:8px;font-size:13px}
.h-ba-prev{display:block;width:100%;max-height:340px;object-fit:contain;background:#f3f3f3}
.h-ba-exp{margin:10px 0}
.h-ba-exp label{display:grid;gap:3px}.h-ba-exp label.checkbox-line{display:flex}
.h-rt-panel2{width:min(380px,92%)}
.h-rt-panel2 h4{margin:.2rem 0 .4rem}
.h-ra-steps{list-style:none;margin:.4rem 0;padding:0;display:grid;gap:6px}
.h-ra-step{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;border:1px solid #e1e4e8;border-radius:8px;padding:6px 8px}
.h-ra-step.is-off{opacity:.55}
.h-ra-step small{grid-column:2;color:#6b7280}
.h-ra-thumbs{grid-column:1/-1;display:flex;gap:6px;align-items:center}
.h-ra-thumbs canvas{width:calc(50% - 10px);height:auto;border:1px solid #ddd;border-radius:4px;background:#f3f3f3}
.h-ra-thumbs span{color:#888}
.h-rt-panelbtns{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:.5rem}
.h-as-head{padding:12px 18px 6px}
.h-as .ui-section{padding:6px 2px}
.h-rt-raone{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px}
.h-rt-fontrow{display:inline-flex;gap:6px;align-items:center}
.h-rt-fontrow button{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h-rt-panelbtns .spacer{flex:1}
.h-idp-body{padding:0 18px 8px;display:grid;gap:10px}
.h-idp-opts{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:end}
.h-idp-opts label{display:grid;gap:3px;font-size:13px}
.h-idp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:46vh;overflow:auto}
.h-idp-card{margin:0;border:1px solid #e1e4e8;border-radius:8px;padding:6px;display:grid;gap:4px;background:#fff}
.h-idp-card img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#f3f3f3;border-radius:4px}
.h-idp-card.is-ko{opacity:.7}
.h-idp-none{display:flex;align-items:center;justify-content:center;aspect-ratio:3/4;background:#f3f3f3;border-radius:4px;font-size:30px}
.h-idp-card figcaption{display:grid;gap:2px;font-size:12px}
.h-idp-card small{color:#6b7280}
.h-idp-prev{display:block;margin:.4rem auto;max-width:100%;max-height:220px;border:1px solid #ddd;background:#f3f3f3}
.h-rt-panel2 label{display:grid;gap:3px;margin:.3rem 0;font-size:13px}.h-rt-panel2 label.checkbox-line{display:flex}
@media (max-width:640px){.h-rt-topbar .ui-topbar-name{width:130px}.h-rt-panel2{left:8px;right:8px;width:auto}}
:root[data-theme="dark"] .h-rt-exportmenu>summary{background:#24272c;border-color:#3a3f46;color:#e8e8e8}
:root[data-theme="dark"] .h-ra-step,:root[data-theme="dark"] .h-idp-card{border-color:#3a3f46;background:#24272c}
:root[data-theme="dark"] .h-ra-step small,:root[data-theme="dark"] .h-idp-card small{color:#a8b0bb}
:root[data-theme="dark"] .h-ra-thumbs canvas,:root[data-theme="dark"] .h-idp-card img,:root[data-theme="dark"] .h-idp-none,:root[data-theme="dark"] .h-ba-prev,:root[data-theme="dark"] .h-idp-prev{background:#1b1d21;border-color:#3a3f46}
/* 🔄 Image → Rotation de l'image : 📐 tracer l'horizon (viseur), 📱 « ↻ Remettre droite » d'une photo de téléphone couchée */
.h-rt2 .is-leveling canvas{cursor:crosshair}
.h-rt-exif{margin:6px 10px 0;flex:0 0 auto}.h-rt-exif>*{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0}.h-rt-exif .icon-button{margin-left:auto}
`;
    ext.rtEnsureCss = () => { if (document.getElementById('h-rt-css2')) return; const s = document.createElement('style'); s.id = 'h-rt-css2'; s.textContent = RT_CSS; document.head.appendChild(s); };
    /* 💾 Réglages enregistrés : un fichier par réglage (⤓ Exporter / ⤒ Importer un réglage), par les outils communs de l'app */
    ext.reglageExport = (outil, nom, donnees) => { if (A().exportSettingFile) return A().exportSettingFile(outil, nom, donnees); downloadText(`lcnda-reglage-${slug(outil)}-${slug(nom)}.json`, JSON.stringify({lcnda: 'reglage', outil, nom, version: 1, donnees}, null, 1)); };
    ext.reglageImport = (outil, opts = {}) => { if (A().importSettingFile) return A().importSettingFile(outil, opts); toast('Import des réglages indisponible.', 'error'); return Promise.resolve(null); };
    const rtClone = v => JSON.parse(JSON.stringify(v));

    /** Retouche d'une photo : on part de la version affichée (ou d'une autre, `source`), le résultat devient une nouvelle version.
     *  Outils : réglages, correcteur de taches, tampon (source choisie), pinceau (6 sortes), texte ; calques d'annotation ; historique ; zoom. */
    // 🧭 la restauration pas à pas : [clé, titre, explication, boutons] (les boutons appellent les commandes de la retouche)
    const RT_PALETTE = [['#e9c2a6', 'Peau claire'], ['#d39e7e', 'Peau hâlée'], ['#a8725a', 'Peau mate'], ['#e7a3a0', 'Joues, lèvres'], ['#5a3a24', 'Cheveux bruns'], ['#c9a35e', 'Cheveux blonds'], ['#9a9a9a', 'Cheveux gris'], ['#8fb3d9', 'Ciel'], ['#6f8f4e', 'Feuillage'], ['#9fbf6a', 'Herbe'], ['#2f3f66', 'Uniforme, costume bleu'], ['#6b2d2d', 'Robe bordeaux'], ['#3a3a3a', 'Habit noir'], ['#d8cfb8', 'Mur, pierre'], ['#b5653e', 'Brique, tuile'], ['#7b5a3a', 'Bois']];
    const RT_RESTORE_STEPS = [
        ['frame', '⌗ Cadrer et redresser', 'Une photo scannée de travers, avec ses bords blancs ou abîmés : on la redresse, puis on garde ce qui compte.', '<button type="button" class="button small" data-rt-cmd="straighten:auto">📐 Redresser tout seul</button><button type="button" class="button small secondary" data-rt-cmd="mode:crop">⌗ Recadrer</button><button type="button" class="button small secondary" data-rt-cmd="mode:persp">⧈ Photo prise de biais</button>'],
        ['color', '🎨 Couleurs passées, photo jaunie', 'Le temps jaunit, pâlit ou rosit les photos. « Enlever le jaunissement » remet chaque couleur à sa place ; « Raviver » redonne du contraste.', '<button type="button" class="button small" data-rt-cmd="restore:yellow">🟨 Enlever le jaunissement</button><button type="button" class="button small secondary" data-rt-cmd="restore:preset:1">✨ Raviver une vieille photo</button><button type="button" class="button small secondary" data-rt-cmd="restore:preset:0">Réglage automatique</button>'],
        ['spots', '🧹 Poussières et petites taches', 'Les points blancs ou noirs, les piqûres : l’app les cherche et les enlève une par une (avec le correcteur). Pour ne traiter qu’une partie, sélectionne-la d’abord. Ce qui reste : le correcteur 🩹 à la main.', '<label class="h-rt-slider"><span>Sensibilité <output data-rt-spotf-out>50</output></span><input type="range" min="1" max="100" value="50" data-rt-spotf></label><label class="h-rt-slider"><span>Taille maximale d’une tache <output data-rt-spots-out>6</output></span><input type="range" min="2" max="20" value="6" data-rt-spots></label><button type="button" class="button small" data-rt-cmd="restore:spots">🔍 Repérer et enlever les taches</button><button type="button" class="button small secondary" data-rt-cmd="mode:heal">🩹 Correcteur à la main</button><button type="button" class="button small secondary" data-rt-cmd="fx:dust">Filtre poussière et rayures</button>'],
        ['tears', '🩹 Déchirures, plis, rayures', '« Repérer les plis » trouve les lignes fines claires ou sombres et propose de les combler. À la main : le pinceau 🪡 Réparer — peins sur le pli, il est refait d’après ce qui l’entoure. Pour un morceau manquant (coin arraché), le tampon recopie une partie voisine.', '<button type="button" class="button small" data-rt-cmd="repair:detect">🔍 Repérer les plis et rayures</button><button type="button" class="button small secondary" data-rt-cmd="mode:repair">🪡 Réparer au pinceau</button><button type="button" class="button small secondary" data-rt-cmd="restore:tear">🩹 Correcteur</button><button type="button" class="button small secondary" data-rt-cmd="mode:clone">🧬 Tampon (morceau manquant)</button><button type="button" class="button small secondary" data-rt-cmd="mode:lasso">➰ Entourer une zone…</button>'],
        ['grain', '🌫️ Grain et bruit', 'Une photo granuleuse ou un tirage abîmé : on adoucit sans perdre les contours.', '<button type="button" class="button small" data-rt-cmd="fx:denoise2">Réduire le bruit…</button><button type="button" class="button small secondary" data-rt-cmd="fx:surface">Flou de surface (garde les contours)…</button><button type="button" class="button small secondary" data-rt-cmd="fx:median">Médiane…</button>'],
        ['face', '🙂 Netteté des visages', 'Entoure un visage avec l’ellipse ◯, puis « Visage plus net » : il est débruité et accentué, seulement là (calque à part, que tu peux doser).', '<button type="button" class="button small secondary" data-rt-cmd="mode:ellipsesel">◯ Entourer le visage</button><button type="button" class="button small" data-rt-cmd="restore:face">✨ Visage plus net</button><button type="button" class="button small secondary" data-rt-cmd="sel:subject">🎯 Sélectionner le sujet</button>'],
        ['colorize', '🌈 Coloriser une photo en noir et blanc', 'Tout seul (un dégradé de couleurs d’époque), ou à la main : choisis une couleur ci-dessous et peins doucement, la lumière de la photo est gardée.', '<button type="button" class="button small" data-rt-cmd="colorize:auto">🎨 Coloriser tout seul</button><button type="button" class="button small secondary" data-rt-cmd="colorize:paint">🖌 Coloriser au pinceau</button><div class="h-rt-palette">' + RT_PALETTE.map(([c, l]) => `<button type="button" data-rt-cmd="restore:color:${c}" style="background:${c}" title="${l}"></button>`).join('') + '</div>'],
        ['save', '✅ Comparer et enregistrer', 'Garde appuyé « 👁 Avant / après » (sous la photo) pour comparer, ou « ◧ Rideau » pour glisser de l’un à l’autre. La photo restaurée devient une nouvelle version : l’original reste.', '<button type="button" class="button small" data-rt-cmd="save:show">💾 Enregistrer et afficher</button><button type="button" class="button small secondary" data-rt-cmd="proj:save">Garder le travail pour plus tard</button>'],
    ];
    async function openRetouch(source = '', project = null, {advanced = false, tab = '', restoreAll = false, idphoto = false} = {}) {
        // la retouche simple (celle de la 0.5.0) si c'est la dernière choisie ; un projet s'ouvre toujours ici
        let mode0 = ''; try { mode0 = localStorage.getItem('genealogie-retouch-mode') || ''; } catch (_) {}
        if (!project && !advanced && mode0 !== 'advanced' && ext.openRetouchSimple) return ext.openRetouchSimple(source);
        const st0 = A().state, item = st0.lightboxMedia?.[st0.lightboxIndex];
        if (!item) return;
        let versions = [];
        try { versions = (await api('media_versions', {id: item.id})).versions || []; } catch (_) {}
        const from = source || item.filename;
        const img0 = new Image(); img0.decoding = 'async';
        img0.src = `media/${encodeURIComponent(from)}?v=${item._cacheBust || ''}`;
        try { await img0.decode(); } catch (_) { return toast('Impossible d’ouvrir cette image.', 'error'); }
        // 🔄 Image → Rotation de l'image : img est l'image de départ avec ses étapes (st.docXf), img0 l'original (jamais touché)
        let img = img0;
        const st = rtDefault(); let channel = 'rgb';
        // aperçu assez grand pour zoomer et corriger un détail (l'enregistrement se fait toujours en pleine taille)
        const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        let pw = Math.max(1, Math.round(img.naturalWidth * scale)), ph = Math.max(1, Math.round(img.naturalHeight * scale));
        const work = document.createElement('canvas'); work.width = pw; work.height = ph;
        const wctx = work.getContext('2d', {willReadFrequently: true}); wctx.drawImage(img, 0, 0, pw, ph);
        let srcData = wctx.getImageData(0, 0, pw, ph);
        const hist = new Array(256).fill(0); for (let i = 0; i < srcData.data.length; i += 4) hist[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++;
        const hmax = Math.max(...hist.slice(2, 254), 1);
        const histPath = 'M0,256 ' + hist.map((h, x) => `L${x},${256 - Math.min(256, h / hmax * 230)}`).join(' ') + ' L255,256 Z';
        const TOOLS = [['adjust', '🎚', 'Réglages'], ['heal', '🩹', 'Correcteur de taches'], ['repair', '🪡', 'Réparer'], ['clone', '🧬', 'Tampon'], ['brush', '🖌', 'Pinceau'], ['eraser', '🧽', 'Gomme'], ['text', '🔤', 'Texte'], ['hand', '✋', 'Déplacer la vue']];
        // la colonne d'outils (comme l'atelier de mise en page) : sélectionner, recadrer, retoucher, dessiner, écrire
        const VTOOLS = [['move', '➤', 'Déplacer un élément d’un calque (V)', 'v'], ['marquee', '⬚', 'Sélection rectangle (M)', 'm'], ['ellipsesel', '◯', 'Sélection ellipse (⇧M)', ''], ['lasso', '➰', 'Lasso : entourer à main levée (L)', 'l'], ['polysel', '✒︎', 'Plume : sélection point par point (P) — double-clic ou Entrée pour fermer', 'p'], ['wand', '🪄', 'Sélection automatique (baguette magique) (W)', 'w'], ['crop', '⌗', 'Recadrer et redresser (C)', 'c'],
            ['heal', '🩹', 'Correcteur de taches (J)', 'j'], ['repair', '🪡', 'Réparer un pli ou une déchirure (R) : peins dessus, c’est refait d’après les alentours', 'r'], ['clone', '🧬', 'Tampon : un endroit, ou une zone sélectionnée (S)', 's'], ['brush', '🖌', 'Pinceau (B)', 'b'], ['eraser', '🧽', 'Gomme (E) : efface le calque choisi ; sur la photo, elle la cache avec un masque (rien n’est perdu)', 'e'], ['shape', '⬜', 'Formes : rectangle, ellipse, ligne, flèche (U)', 'u'], ['gradient', '▦', 'Dégradé (G) : glisse pour le tracer ; sur un masque, il fond le calque', 'g'], ['text', 'T', 'Texte (T)', 't'], ['hand', '✋', 'Main, ou barre d’espace (H)', 'h'], ['zoom', '🔍', 'Zoom (Z) — ⌥ pour reculer', 'z']];
        const MENUS = [
            ['Fichier', [['proj:save', '💾 Enregistrer le projet (pour continuer plus tard)', '⌘S'], ['proj:saveas', 'Enregistrer le projet sous un autre nom…', '⇧⌘S'], ['proj:open', '📂 Ouvrir un projet…'], ['-'], ['save:show', 'Enregistrer et afficher cette version'], ['save:keep', 'Enregistrer sans l’afficher'], ['save:copy', 'Copie séparée'], ['-'], ['info', 'ℹ️ Informations…'], ['-'], ['export:image', '⤓ Exporter l’image (PNG, JPG, imprimer)…'], ['export:ba', '⤓ Exporter l’avant / après…'], ['psd:export', '🗂 Exporter en PSD (avec les calques)…'], ['psd:import', '🗂 Importer les calques d’un PSD…'], ['-'], ['actions', '⚡ Actions : réglages enregistrés, à refaire sur plusieurs photos…'], ['-'], ['simple', '⚡ Passer à la retouche rapide'], ['close', 'Fermer']]],
            ['Édition', [['undo', '↶ Annuler', '⌘Z'], ['redo', '↷ Rétablir', '⇧⌘Z'], ['tab:history', '🕘 Historique']]],
            ['Image', [['tab:adjust', '🎚 Réglages, niveaux et courbe'], ['hs:photo', '🎨 Teinte/Saturation…'], ['preset:0', 'Réglage automatique'], ['mode:crop', '⌗ Recadrer et redresser'], ['straighten:auto', '📐 Redresser automatiquement'], ['cropclear', 'Annuler le recadrage'], ['mode:persp', '⧈ Redresser la perspective (photo prise de biais)…'], ['persp:clear', 'Enlever la perspective'], ['-'], ['imgsize', '📏 Taille de l’image…'], ['canvassize', '⬚ Taille de la zone de travail…'],
                ['>', '🔄 Rotation de l’image', [['rot:cw', '↻ 90° horaire'], ['rot:ccw', '↺ 90° antihoraire'], ['rot:180', '180°'], ['rot:angle', 'Angle…'], ['rot:level', '📐 Redresser l’horizon (tracer une ligne)…'], ['flip:h', '⇆ Symétrie horizontale de l’image'], ['flip:v', '⇅ Symétrie verticale de l’image']]], ['-'],
                ['restore:all', '✨ Restaurer en une fois…'], ['tab:restore', '🧭 Restaurer une vieille photo (pas à pas)'], ['repair:detect', '🔍 Repérer les plis et rayures…'], ['mode:repair', '🪡 Réparer au pinceau (plis, déchirures)'], ['tab:filters', '🧹 Poussière et rayures (Filtres)'], ['deglare', '🪟 Enlever les reflets (vitre) : calque à part'], ['colorize:auto', '🎨 Coloriser : calque de réglage (dégradé)'], ['colorize:paint', '🖌 Coloriser au pinceau : calque « Couleur »'], ['-'], ['idphoto', '🪪 Recadrer en photo d’identité…'], ['idbatch', '🪪 Portraits de plusieurs fiches…'], ['-'], ['plus:liquify', '💧 Fluidité (déformer au pinceau)…'], ['plus:magicErase', '🪄 Gomme magique (fond uni → transparent)…'], ['plus:refineEdge', '✨ Affiner le bord du masque (cheveux, contours)…'], ['plus:sky', '☁️ Remplacer le ciel…'], ['plus:cutout', '✂️ Détourer une personne (fond transparent, flou, uni)…'], ['plus:upscale', '🔍 Agrandir ×2 / ×4…'], ['plus:pano', '🧩 Panorama : assembler avec d’autres photos…'], ['-'], ['reset', 'Remettre comme au départ']]],
            ['Calque', [['ladd', '＋ Nouveau calque'], ['gadd', '📁 Nouveau groupe'], ['gwrap', 'Grouper le calque choisi', '⌘G'], ['aadd', '🎚 Nouveau calque de réglage'], ['hs:layer', '🎨 Nouveau réglage Teinte/Saturation'], ['img:place', '🖼️ Placer une image…'], ['grad:layer', '▦ Nouveau calque de dégradé…'], ['pat:fill', '▩ Nouveau calque de motif…'], ['pat:make', '▩ Créer un motif…'], ['sel:copy', 'Copier la sélection sur un calque', '⌘J'], ['-'], ['mask:add', '🎭 Ajouter un masque au calque choisi'], ['mask:hideall', '🎭 Masque qui cache tout (⌥ + clic sur 🎭)'], ['mask:sel', 'Masque d’après la sélection'], ['mask:selhide', 'Masque qui cache la sélection'], ['mask:invert', 'Inverser le masque'], ['mask:del', 'Retirer le masque'], ['-'], ['tab:layers', '🗂 Calques']]],
            ['Sélection', [['sel:subject', '🎯 Sélectionner le sujet (automatique)'], ['plus:cutout', '✂️ Détourer une personne…'], ['-'], ['sel:all', 'Tout sélectionner', '⌘A'], ['sel:none', 'Désélectionner', '⌘D'], ['sel:invert', 'Inverser', '⇧⌘I'], ['-'], ['sel:feather', 'Contour progressif…'], ['sel:grow', 'Agrandir…'], ['sel:shrink', 'Réduire…'], ['-'], ['sel:fill', 'Remplir avec la couleur'], ['sel:clear', 'Effacer (transparent)', '⌫'], ['sel:crop', 'Recadrer sur la sélection']]],
            ['Filtre', [['fx:last', '↻ Refaire le dernier filtre', '⌘F'], ['-'], ...['Flou', 'Bruit', 'Netteté', 'Esthétiques', 'Artistiques', 'Pixellisation', 'Rendu', 'Déformation', 'Autres'].map(cat => ['>', cat, Object.entries(RT_FX).filter(([, f]) => f[0] === cat).map(([k, f]) => ['fx:' + k, f[1] + '…'])]),
                ['-'], ['tab:filters', '✨ Filtres rapides et filtres du calque (panneau)'], ['filters:reset', 'Enlever les filtres rapides']]],
            ['Affichage', [['side:toggle', 'Replier / ouvrir le panneau de droite', 'Tab'], ['curtain', '◧ Avant / après en rideau'], ['-'], ['zoom:in', 'Zoom avant', '+'], ['zoom:out', 'Zoom arrière', '−'], ['zoom:fit', 'Toute l’image', '0'], ['zoom:100', 'Taille réelle', '1']]],
        ];
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-retouch h-rt2'; dlg.dataset.ownClose = '1'; // il demande lui-même avant de fermer
        // E1 : icône · nom tapable · menus · ↶ ↷ · … · ✓ Enregistré · ⚙️ Personnaliser · ⤓ Exporter ▾ · 💾 Enregistrer · ⛶ · ×
        const sec = (title, key, body, open = true) => window.LCNDA_UI?.panelSection ? window.LCNDA_UI.panelSection({title, key, open, body}) : `<details ${open ? 'open' : ''}><summary>${esc(title)}</summary>${body}</details>`;
        dlg.innerHTML = `<div class="h-rt-head h-rt-topbar"><span class="ui-topbar-icon" aria-hidden="true">🎚️</span><input class="ui-topbar-name" data-rt-name value="${esc(project?.name || item.title || item.filename || 'Photo')}" maxlength="160" aria-label="Nom du projet de retouche" title="Le nom du projet de retouche (tape pour le changer)"><nav class="h-rt-menubar">${MENUS.map(([l, items]) => `<details class="h-rt-menu"><summary>${l}</summary><div class="h-rt-menulist">${items.map(([k, t, sc]) => k === '-' ? '<hr>' : k === '>' ? `<div class="h-rt-sub"><button type="button" class="h-rt-subh"><span>${esc(t)}</span><kbd>▸</kbd></button><div class="h-rt-menulist h-rt-sublist">${sc.map(([k2, t2]) => `<button type="button" data-rt-cmd="${k2}"><span>${esc(t2)}</span></button>`).join('')}</div></div>` : `<button type="button" data-rt-cmd="${k}"><span>${esc(t)}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`).join('')}</nav><span class="ui-topbar-hist h-rt-hist-btns"><button type="button" class="icon-button small" data-rt-undo disabled title="Annuler (⌘Z)" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-rt-redo disabled title="Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z">↷</button></span><button type="button" class="button small secondary" data-rt-cmd="simple" title="Passer à la retouche rapide (celle de la version 0.5.0) : réglages, courbe, taches, tampon — moins de boutons">⚡ Rapide</button><span class="spacer"></span><span class="ui-status" data-ui-status data-rt-status></span>${ext.tbButton('retouch')}<details class="h-rt-menu h-rt-exportmenu"><summary title="Exporter : l’image retouchée (PNG, JPG, imprimer) ou l’avant / après">⤓ Exporter ▾</summary><div class="h-rt-menulist"><button type="button" data-rt-cmd="export:image"><span>🖼 L’image retouchée (PNG, JPG, imprimer)…</span></button><button type="button" data-rt-cmd="export:ba"><span>◧ Avant / après (côte à côte ou rideau)…</span></button></div></details><button type="button" class="button small" data-rt-projsave data-ui-cmd="save" title="Enregistrer le projet : tout le travail (calques, masques, réglages…) pour le rouvrir et continuer" data-shortcut="⌘S">💾 Enregistrer</button>${ext.fullButton('retouch')}<button type="button" class="icon-button" data-rt-close aria-label="Fermer" title="Fermer">×</button></div>
            <div class="h-rt-bar" data-tbg="rt-bar" data-tbg-label="Barre du haut (groupes)">
                <span class="h-rt-modes" role="toolbar" data-tb="modes" data-tb-label="Les outils" data-tbg="rt-modes" data-tbg-label="Outils">${TOOLS.map(([k, i, l]) => `<button type="button" class="button small ${k === 'adjust' ? '' : 'secondary'}" data-rt-mode="${k}" title="${esc(l)}" data-shortcut="${esc((VTOOLS.find(v => v[0] === k)?.[3] || '').toUpperCase())}">${i} ${esc(l)}</button>`).join('')}</span>
            </div>
            <div class="h-rt-opts" data-rt-opts hidden data-tbg="rt-opts" data-tbg-label="Options des outils (pinceau, texte…)">
                <label data-o="size">Taille <input type="range" min="1" max="200" value="18" data-rt-size> <output data-rt-size-out>18</output> <small class="muted">[ ]</small></label>
                <label data-o="hard" data-help="Faible : le bord du pinceau est doux et se fond ; forte : le bord est net.">Dureté <input type="range" min="0" max="100" value="55" data-rt-hard> <output data-rt-hard-out>55 %</output></label>
                <label data-o="opacity">Opacité <input type="range" min="5" max="100" value="100" data-rt-opac> <output data-rt-opac-out>100 %</output></label>
                <label data-o="brush" data-tb-label="Sorte de pinceau">Sorte <select data-rt-brushtype>${RT_BRUSHES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                <label data-o="color">Couleur <input type="color" value="#000000" data-rt-color></label>
                <span data-o="swatches" class="h-rt-swatches" data-tb-label="Couleurs rapides">${['#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ffffff', '#000000', '#e2b195', '#c98f78', '#8fb3d9', '#6f8f4e', '#8b5a2b', '#c9a227', '#7a4b6b'].map(c => `<button type="button" style="background:${c}" data-rt-swatch="${c}" aria-label="${c}"></button>`).join('')}</span>
                <span data-o="font" data-tb-label="Police" class="h-rt-fontrow">Police <button type="button" class="button small secondary" data-rt-fontpick title="Choisir la police (celles de l’app et de l’ordinateur)">${esc(RT_FONTS[0][1])} ▾</button></span>
                <label data-o="font" class="ui-toggle" data-tb-label="Contour du texte"><input type="checkbox" data-rt-halo checked><i></i><span>contour</span></label><input data-o="font" type="color" value="#ffffff" data-rt-halocolor title="Couleur du contour" data-tb-label="Couleur du contour"><label data-o="font" data-tb-label="Épaisseur du contour">épaisseur <input type="range" min="1" max="8" value="1" data-rt-halow></label>
                <label data-o="font" class="ui-toggle" data-tb-label="Ombre du texte"><input type="checkbox" data-rt-shadow><i></i><span>ombre</span></label><input data-o="font" type="color" value="#000000" data-rt-shadowcolor title="Couleur de l’ombre" data-tb-label="Couleur de l’ombre">
                <span data-o="clone" class="h-rt-clone" data-tb-label="Tampon : endroit à recopier, aligné"><button type="button" class="button small" data-rt-pick>🎯 Choisir l’endroit à recopier</button><label class="ui-toggle" data-help="Coché : l’endroit recopié suit le pinceau d’un trait à l’autre. Décoché : chaque trait repart du même endroit."><input type="checkbox" data-rt-aligned checked><i></i><span>aligné</span></label></span>
                <span data-o="repair" class="h-rt-cropops" data-tb-label="Réparer : grain, repérer les plis"><label class="ui-toggle" data-help="Coché : un peu du grain de la photo autour est remis dans la zone réparée, pour qu’elle ne paraisse pas trop lisse."><input type="checkbox" data-rt-rgrain checked><i></i><span>garder le grain</span></label><button type="button" class="button small secondary" data-rt-cmd="repair:detect" title="Trouver tout seul les lignes fines (plis, rayures) et proposer de les combler">🔍 Repérer les plis</button></span>
                <label data-o="textstyle" class="ui-toggle" data-tb-label="Texte gras"><input type="checkbox" data-rt-bold><i></i><span><b>Gras</b></span></label><label data-o="textstyle" class="ui-toggle" data-tb-label="Texte italique"><input type="checkbox" data-rt-italic><i></i><span><i>Italique</i></span></label>
                <label data-o="shape" data-tb-label="Forme (rectangle, ellipse, flèche…)">Forme <select data-rt-shape><option value="rect">Rectangle</option><option value="round">Rectangle arrondi</option><option value="ellipse">Ellipse</option><option value="line">Ligne</option><option value="arrow">Flèche</option></select></label>
                <label data-o="shape" class="ui-toggle" data-tb-label="Forme remplie"><input type="checkbox" data-rt-fillon><i></i><span>remplie</span></label><label data-o="shape" data-tb-label="Couleur de fond des formes">Fond <input type="color" value="#ffffff" data-rt-fill></label>
                <label data-o="wand" data-tb-label="Baguette : tolérance" data-help="Jusqu’où une couleur peut s’écarter de celle cliquée pour être prise : petit = la même teinte seulement, grand = des teintes voisines aussi.">Tolérance <input type="range" min="1" max="100" value="24" data-rt-tol> <output data-rt-tol-out>24</output></label><label data-o="wand" class="ui-toggle" data-tb-label="Baguette : contiguë"><input type="checkbox" data-rt-contig checked><i></i><span>contiguë</span></label><button type="button" data-o="wand" class="button small" data-rt-cmd="sel:subject" data-tb-label="Sélectionner le sujet" title="Le fond est reconnu sur les bords de la photo ; la tolérance règle jusqu’où il va">🎯 Sujet</button>
                <span data-o="sel" class="h-rt-selops" data-tb-label="Actions de la sélection"><small class="muted">⇧ ajouter · ⌥ enlever</small><button type="button" class="button small secondary" data-rt-cmd="sel:all">Tout</button><button type="button" class="button small secondary" data-rt-cmd="sel:none">Aucune</button><button type="button" class="button small secondary" data-rt-cmd="sel:invert">Inverser</button><button type="button" class="button small secondary" data-rt-cmd="sel:feather">Contour progressif</button><button type="button" class="button small secondary" data-rt-cmd="sel:copy">→ Calque</button><button type="button" class="button small secondary" data-rt-cmd="sel:fill">Remplir</button><button type="button" class="button small secondary" data-rt-cmd="sel:clear">Effacer</button><button type="button" class="button small secondary" data-rt-cmd="mask:sel">Masque</button><button type="button" class="button small secondary" data-rt-cmd="sel:crop">Recadrer</button></span>
                <span data-o="crop" class="h-rt-cropops" data-tb-label="Recadrage : proportions, redresser"><label>Proportions <select data-rt-ratio><option value="">Libres</option><option value="orig">Celles de la photo</option><option value="1">Carré 1:1</option><option value="1.3333">4:3</option><option value="0.75">3:4</option><option value="1.5">3:2</option><option value="0.6667">2:3</option><option value="1.7778">16:9</option><option value="0.7071">A4 portrait</option><option value="1.4142">A4 paysage</option></select></label><label>Redresser <input type="range" min="-45" max="45" step="0.5" value="0" data-rt-angle> <output data-rt-angle-out>0°</output></label><button type="button" class="button small secondary" data-rt-cmd="straighten:auto" title="Trouve l’angle des grandes lignes (horizon, murs, cadres)">📐 Auto</button><button type="button" class="button small" data-rt-cmd="cropok">✓ Valider</button><button type="button" class="button small secondary" data-rt-cmd="cropclear">Annuler le recadrage</button></span>
                <span data-o="persp" class="h-rt-cropops" data-tb-label="Perspective"><small class="muted">Place les 4 coins sur les coins de ce qui doit devenir rectangulaire (la photo, le document, la façade).</small><button type="button" class="button small" data-rt-cmd="persp:ok">✓ Valider</button><button type="button" class="button small secondary" data-rt-cmd="persp:reset">Coins aux bords</button><button type="button" class="button small secondary" data-rt-cmd="persp:cancel">Annuler</button></span>
                <span data-o="gradient" class="h-rt-gopts" data-tb-label="Dégradé : couleurs, forme, options"><button type="button" class="h-rt-gprev" data-rt-gprev title="Modifier le dégradé : couleurs, transparence, préréglages"><i></i><span aria-hidden="true">▾</span></button><span class="h-rt-gkinds" role="group" aria-label="Forme du dégradé">${RT_GKINDS.map(([k, , l]) => `<button type="button" data-rt-gkind="${k}" title="${esc(l)}" aria-label="${esc(l)}"><i class="h-rt-gk is-${k}"></i></button>`).join('')}</span><label class="ui-toggle" data-tb-label="Inverser le dégradé"><input type="checkbox" data-rt-grev><i></i><span>inverser</span></label><label class="checkbox-line" data-tb-label="Tramage" data-help="Un très léger grain qui évite les « marches » visibles dans les dégradés doux."><input type="checkbox" data-rt-gdith> <span>tramage</span></label></span>
                <span data-o="maskmode" class="h-rt-maskmode" data-tb-label="Masque : cacher / montrer"><label class="checkbox-line"><input type="radio" name="rt-maskmode" value="hide" checked data-rt-maskmode> <span>⬛ cacher</span></label><label class="checkbox-line"><input type="radio" name="rt-maskmode" value="show" data-rt-maskmode> <span>⬜ montrer</span></label></span>
                <small class="muted" data-rt-paint-help data-tb-label="Aide de l’outil"></small>
            </div>
            <div class="h-rt-main">
                <div class="h-rt-left">
                    <div class="h-rt-stage" data-rt-stage><div class="h-rt-canvaswrap" data-rt-wrap><canvas data-rt-canvas width="${pw}" height="${ph}"></canvas><canvas class="h-rt-overlay" data-rt-overlay width="${pw}" height="${ph}"></canvas><div class="h-rt-crop" data-rt-crop hidden>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<i data-ch="${h}"></i>`).join('')}</div><span class="h-rt-brush" data-rt-brush hidden></span><span class="h-rt-src" data-rt-src hidden></span></div>
                        ${rtBaButtons('rt')}</div>
                    <section class="h-rt-versions" data-rt-versions></section>
                </div>
                <nav class="h-rt-vtools" data-tbg="rt-vtools" data-tbg-label="Colonne d’outils">${VTOOLS.map(([k, i, l, key]) => { const sc = key ? key.toUpperCase() : k === 'ellipsesel' ? '⇧M' : ''; return `<button type="button" data-rt-mode="${k}" data-rt-v title="${esc(sc ? l.replace(` (${sc})`, '') : l)}" data-tb-label="${esc(l)}" data-shortcut="${esc(sc)}">${i}</button>`; }).join('')}<span class="h-rt-fgbg" data-tb-label="Couleurs (premier plan et arrière-plan)"><button type="button" class="h-rt-ccdef" data-rt-ccdef title="Noir et blanc (D)" aria-label="Couleurs par défaut : noir et blanc"><i></i><i></i></button><button type="button" class="h-rt-ccswap" data-rt-ccswap title="Intervertir les deux couleurs (X)" aria-label="Intervertir les couleurs">⤾</button><label class="h-rt-ccbg" title="Couleur d’arrière-plan (fond des formes) : clic pour la changer"><input type="color" value="#ffffff" data-rt-fill2></label><label class="h-rt-ccfg" title="Couleur de premier plan (pinceau, texte, formes) : clic pour la changer"><input type="color" value="#000000" data-rt-color2></label></span></nav>
                <aside class="h-rt-side"><button type="button" class="h-rt-sidetog" data-rt-sidetog title="Replier le panneau (plus de place pour la photo) — Tab">⇥</button><span class="h-rt-resize" data-rt-resize title="Glisser pour élargir ou rétrécir le panneau (double-clic : taille de départ)"></span>
                    <div class="h-rt-tabs" data-tbg="rt-tabs" data-tbg-label="Onglets du panneau de droite"><button type="button" class="is-active" data-rt-tab="adjust" title="Réglages" data-tb-label="🎚 Réglages"><span class="h-rt-ti" aria-hidden="true">🎚</span><span class="h-rt-tl">Réglages</span></button><button type="button" data-rt-tab="filters" title="Filtres" data-tb-label="✨ Filtres"><span class="h-rt-ti" aria-hidden="true">✨</span><span class="h-rt-tl">Filtres</span></button><button type="button" data-rt-tab="layers" title="Calques" data-tb-label="🗂 Calques"><span class="h-rt-ti" aria-hidden="true">🗂</span><span class="h-rt-tl">Calques</span></button><button type="button" data-rt-tab="props" title="Propriétés : Teinte/Saturation, masque, position et taille du calque choisi" data-tb-label="ⓘ Propriétés"><span class="h-rt-ti" aria-hidden="true">ⓘ</span><span class="h-rt-tl">Propriétés</span></button><button type="button" data-rt-tab="char" title="Caractère : police, variante (graisse), taille, interligne, approche…" data-tb-label="🔤 Caractère"><span class="h-rt-ti" aria-hidden="true">🔤</span><span class="h-rt-tl">Caractère</span></button><button type="button" data-rt-tab="pat" title="Motifs : remplir d’un motif, créer les siens" data-tb-label="▩ Motifs"><span class="h-rt-ti" aria-hidden="true">▩</span><span class="h-rt-tl">Motifs</span></button><button type="button" data-rt-tab="brushes" title="Formes de pinceau : préréglages, pas, angle, dispersion, forme d’après une sélection" data-tb-label="🖌 Formes"><span class="h-rt-ti" aria-hidden="true">🖌</span><span class="h-rt-tl">Formes</span></button><button type="button" data-rt-tab="history" title="Historique" data-tb-label="🕘 Historique"><span class="h-rt-ti" aria-hidden="true">🕘</span><span class="h-rt-tl">Historique</span></button><button type="button" data-rt-tab="restore" title="Restaurer une vieille photo, pas à pas" data-tb-label="🧭 Restaurer"><span class="h-rt-ti" aria-hidden="true">🧭</span><span class="h-rt-tl">Restaurer</span></button></div>
                    <div class="h-rt-tools" data-rt-pane="adjust" data-tbg="rt-adjust" data-tbg-label="Panneau Réglages"><div class="h-rt-target" data-rt-target></div><div class="h-rt-presets" data-tb-label="Préréglages">${RT_PRESETS.map(([l], i) => `<button type="button" class="button small secondary" data-rt-preset="${i}">${esc(l)}</button>`).join('')}</div>
                        ${sec('Couleur', 'rt-color', `${RT_SLIDERS.map(([k, l, mn, mx]) => `<label class="h-rt-slider"><span${k === 'vibrance' ? ' data-help="Comme la saturation, mais les couleurs déjà vives bougent peu : les teintes ternes (peau, ciel pâle) se ravivent d’abord."' : ''}>${esc(l)} <output data-rt-out="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rt="${k}"></label>`).join('')}
                        <div class="h-rt-toggles"><label class="ui-toggle"><input type="checkbox" data-rt-t="bw"><i></i>Noir et blanc</label><label class="ui-toggle"><input type="checkbox" data-rt-t="sepia"><i></i>Sépia</label><label class="ui-toggle"><input type="checkbox" data-rt-t="invert"><i></i>Négatif</label></div>`)}
                        ${sec('Niveaux : point noir, tons moyens, point blanc', 'rt-levels', `${RT_LEVELS.map(([k, l, mn, mx, dv]) => `<label class="h-rt-slider"><span${k === 'lvl_gamma' ? ' data-help="Éclaircit ou assombrit les tons moyens sans toucher au noir ni au blanc : au-dessus de 100, plus clair ; en dessous, plus sombre."' : ''}>${esc(l)} <output data-rt-out="${k}">${dv}</output></span><input type="range" min="${mn}" max="${mx}" value="${dv}" data-rt="${k}"></label>`).join('')}<button type="button" class="link-button" data-rt-lvlauto>Niveaux automatiques</button>`, false)}
                        ${sec('Courbe', 'rt-curve', `<div class="h-rt-curve-head"><strong data-help="Monter la courbe éclaircit, la creuser assombrit, un « S » donne du contraste. Rouge, vert, bleu : corriger une dominante de couleur.">Courbe</strong><span>${RT_CHANNELS.map(([k, l]) => `<button type="button" class="h-rt-ch ${k === 'rgb' ? 'is-active' : ''}" data-rt-ch="${k}">${l}</button>`).join('')}</span></div>
                        <svg class="h-rt-curve" viewBox="-6 -6 268 268" data-rt-curve><path class="h-rt-hist" d="${histPath}"/><g class="h-rt-grid">${[64, 128, 192].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="256"/><line x1="0" y1="${v}" x2="256" y2="${v}"/>`).join('')}<line x1="0" y1="256" x2="256" y2="0" class="h-rt-diag"/></g><path class="h-rt-line" data-rt-line/><g data-rt-points></g></svg>
                        <div class="h-rt-curve-tools"><button type="button" class="button small secondary" data-rt-ptdel disabled>Enlever le point</button></div>
                        <p class="muted h-rt-help">Clic sur la courbe : ajouter un point · glisser : le déplacer · pour l’enlever : le choisir puis « Enlever le point » (ou ⌫), ou le glisser hors du cadre.</p>`)}
                        ${sec('🎨 Colorisation douce (photo en noir et blanc)', 'rt-gmap', `<label>Couleurs <select data-rt-gmap>${Object.entries(RT_GMAPS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label class="h-rt-slider"><span>Force <output data-rt-out="gmap_amt">70</output></span><input type="range" min="0" max="100" value="70" data-rt="gmap_amt"></label><p class="muted">Mieux dans un calque de réglage (Image → Coloriser) : on le dose, on le masque, on l’enlève. Pour colorier à la main : Image → Coloriser au pinceau.</p>`, false)}
                        <button type="button" class="link-button" data-rt-reset>↺ Remettre comme au départ</button></div>
                    <div class="h-rt-tools" data-rt-pane="filters" hidden><div class="h-rt-target" data-rt-target></div><div data-rt-fxlist></div><p class="muted">Filtres rapides, après les réglages : sur la photo, ou dans un calque de réglage (sur tout ce qui est dessous, ou seulement le calque juste dessous). Les mêmes sur l’image enregistrée en pleine taille.</p>${sec('Effets', 'rt-fx', `${RT_FILTERS.map(([k, l, mn, mx]) => `<label class="h-rt-slider"><span${k === 'clarity' ? ' data-help="Renforce le contraste des détails moyens (rides, plis d’un tissu, écriture) sans changer le contraste général."' : ''}>${esc(l)} <output data-rt-fout="${k}">0</output></span><input type="range" min="${mn}" max="${mx}" value="0" data-rt-f="${k}"></label>`).join('')}<button type="button" class="link-button" data-rt-cmd="filters:reset">Enlever les filtres</button>`)}</div>
                    <div class="h-rt-tools" data-rt-pane="layers" hidden></div>
                    <div class="h-rt-tools" data-rt-pane="history" hidden></div>
                    <div class="h-rt-tools h-rt-props" data-rt-pane="props" hidden></div>
                    <div class="h-rt-tools h-rt-pats" data-rt-pane="pat" hidden></div>
                    <div class="h-rt-tools h-rt-brushes" data-rt-pane="brushes" hidden></div>
                    <div class="h-rt-tools h-rt-char" data-rt-pane="char" hidden>
                        <div class="h-rt-chpages" role="tablist" aria-label="Texte">${[['char', 'Caractère'], ['para', '¶ Paragraphe'], ['glyph', 'Ω Glyphes']].map(([k, l], i) => `<button type="button" role="tab" data-rt-chpage="${k}" class="${i ? '' : 'is-on'}">${l}</button>`).join('')}</div>
                        <p class="muted h-rt-chfor" data-rt-chfor>Pour les prochains textes. Choisis un texte avec ➤ pour le changer.</p>
                        <div data-chp="char">
                        <button type="button" class="h-rt-chfam" data-rt-chfont title="Police (famille)"><span data-rt-chfamname>Arial</span> ▾</button>
                        <label class="h-rt-chline" title="Variante : la graisse (Light, Regular, Bold, Black…) et l’italique"><select data-rt-ch="style"></select></label>
                        <div class="h-rt-chgrid">
                            <label title="Taille (en points de l’image)"><span class="h-rt-chi">ᴛT</span><input type="number" min="1" max="4000" step="1" data-rt-ch="size"><small>px</small></label>
                            <label title="Interligne (vide = automatique, 120 % de la taille)"><span class="h-rt-chi">↕A</span><input type="number" min="0" max="6000" step="1" placeholder="(Auto)" data-rt-ch="lead"><small>px</small></label>
                            <label title="Crénage : les paires de lettres rapprochées selon la police (Métrique) ou pas du tout (0)"><span class="h-rt-chi">V/A</span><select data-rt-ch="kern"><option value="auto">Métrique</option><option value="none">0</option></select></label>
                            <label title="Approche : l’espace entre toutes les lettres, en millièmes de la taille"><span class="h-rt-chi">VA↔</span><input type="number" min="-500" max="2000" step="10" data-rt-ch="track"></label>
                            <label title="Échelle verticale"><span class="h-rt-chi">↕T</span><input type="number" min="10" max="500" step="1" data-rt-ch="vs"><small>%</small></label>
                            <label title="Échelle horizontale"><span class="h-rt-chi">T↔</span><input type="number" min="10" max="500" step="1" data-rt-ch="hs"><small>%</small></label>
                            <label title="Décalage vertical (au-dessus de la ligne de base si positif)"><span class="h-rt-chi">A↑</span><input type="number" min="-2000" max="2000" step="1" data-rt-ch="shift"><small>px</small></label>
                            <label title="Couleur du texte"><span class="h-rt-chi">Couleur</span><input type="color" data-rt-ch="color"></label>
                        </div>
                        <div class="h-rt-chtogs" role="group" aria-label="Style">
                            <button type="button" data-rt-chtog="caps:all" title="Toutes capitales"><b>TT</b></button><button type="button" data-rt-chtog="caps:small" title="Petites capitales"><b>Tᴛ</b></button><button type="button" data-rt-chtog="pos:sup" title="Exposant">T¹</button><button type="button" data-rt-chtog="pos:sub" title="Indice">T₁</button><button type="button" data-rt-chtog="under" title="Souligné"><u>T</u></button><button type="button" data-rt-chtog="strike" title="Barré"><s>T</s></button>
                        </div>
                        <div class="h-rt-chtogs" role="group" aria-label="Alignement"><button type="button" data-rt-chalign="left" title="Aligné à gauche">⟸ gauche</button><button type="button" data-rt-chalign="center" title="Centré">≡ centre</button><button type="button" data-rt-chalign="right" title="Aligné à droite">droite ⟹</button></div>
                        <label class="h-rt-chline" title="Lissage des bords des lettres">Lissage <select data-rt-ch="aa"><option value="smooth">Lissé</option><option value="none">Aucun (bords nets, pixels)</option></select></label>
                        <p class="muted">Les variantes viennent des polices de l’ordinateur (Mac, Windows, Linux) quand l’app peut les lire ; sinon les graisses habituelles.</p>
                        </div>
                        <div data-chp="para" hidden>
                            <div class="h-rt-chtogs h-rt-paligns" role="group" aria-label="Alignement du paragraphe">${RT_ALIGNS.map(([k, l]) => `<button type="button" data-rt-palign="${k}" title="${esc(l)}" aria-label="${esc(l)}">${rtAlignIcon(k)}</button>`).join('')}</div>
                            <div class="h-rt-chgrid">
                                <label title="Retrait à gauche"><span class="h-rt-chi">→▤</span><input type="number" min="0" max="4000" step="1" data-rt-ch="il"><small>px</small></label>
                                <label title="Retrait à droite"><span class="h-rt-chi">▤←</span><input type="number" min="0" max="4000" step="1" data-rt-ch="ir"><small>px</small></label>
                                <label title="Retrait de la première ligne (négatif : en saillie)"><span class="h-rt-chi">⇥¹</span><input type="number" min="-4000" max="4000" step="1" data-rt-ch="fi"><small>px</small></label>
                                <label title="Largeur du bloc de texte : les lignes se coupent toutes seules (vide = texte simple, une ligne par paragraphe)"><span class="h-rt-chi">⟷▭</span><input type="number" min="0" max="20000" step="1" placeholder="(Auto)" data-rt-ch="boxW"><small>px</small></label>
                                <label title="Espace avant chaque paragraphe"><span class="h-rt-chi">⇡¶</span><input type="number" min="0" max="4000" step="1" data-rt-ch="sb"><small>px</small></label>
                                <label title="Espace après chaque paragraphe"><span class="h-rt-chi">¶⇣</span><input type="number" min="0" max="4000" step="1" data-rt-ch="sa"><small>px</small></label>
                            </div>
                            <label class="ui-toggle" title="Couper les mots longs en fin de ligne, avec un tiret (règles simples du français ; un tiret conditionnel ⌥- dans un mot est pris en premier)"><input type="checkbox" data-rt-ch="hyph"><i></i><span>Césure</span></label>
                            <p class="muted">Pour un bloc de texte, glisse un cadre avec l’outil Texte T au lieu de cliquer, ou donne sa largeur ici. La justification ne vaut que pour un bloc.</p>
                        </div>
                        <div data-chp="glyph" hidden>
                            <div class="h-rt-gltop"><select data-rt-glset></select><input type="search" placeholder="Code (U+00E9) ou caractère" data-rt-glq aria-label="Chercher un glyphe"></div>
                            <div class="h-rt-glrecent" data-rt-glrecent></div>
                            <div class="h-rt-glgrid" data-rt-glgrid></div>
                            <p class="muted" data-rt-glhelp>Clic : ajouté au texte en cours d’écriture (ou à la fin du texte choisi). Sans texte : copié.</p>
                        </div>
                    </div>
                    <div class="h-rt-tools h-rt-restore" data-rt-pane="restore" hidden><div class="h-rt-raone"><button type="button" class="button" data-rt-cmd="restore:all" title="Débruitage, poussières, plis, contraste, netteté et colorisation d’un coup : tu vois chaque étape et tu choisis">✨ Restaurer en une fois</button><small class="muted">ou étape par étape :</small></div>${RT_RESTORE_STEPS.map(([k, t, help, btns], i) => `<details class="h-rt-step" data-rt-step="${k}" ${i === 0 ? 'open' : ''}><summary><span class="h-rt-stepn">${i + 1}</span> ${t} <i class="h-rt-stepok" hidden>✓</i></summary><p class="muted">${help}</p><div class="h-rt-stepbtns">${btns}</div></details>`).join('')}
                        <p class="muted h-rt-help">Chaque étape est facultative et se défait (↶). Rien n’abîme l’original : la photo restaurée devient une nouvelle version.</p></div>
                </aside>
            </div>
            <div class="modal-actions"><label class="checkbox-line h-rt-merge" data-rt-mergebox hidden><input type="checkbox" data-rt-merge checked> <span>avec les annotations (calques visibles)</span></label><span class="spacer"></span><button type="button" class="button secondary" data-rt-close>Annuler</button><button type="button" class="button secondary" data-rt-save="copy" title="Un autre média, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-rt-save="keep" title="Gardée dans les versions, la photo affichée ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-rt-save="show">Enregistrer et afficher cette version</button></div>
            <p class="muted h-rt-note">L’original n’est jamais modifié : chaque retouche est une version de la photo, et tu choisis celle qui s’affiche partout.</p>`;
        document.body.appendChild(dlg);
        ext.rtEnsureCss();
        ext.tbApply(dlg, 'retouch');
        window.LCNDA_UI?.harmonizeTopbar?.(dlg.querySelector('.h-rt-head')); // E1 : l'ordre validé (après ⚙️ Personnaliser)
        ext.editorKeysAttach?.(dlg, 'retouch'); // ⌨️ raccourcis à soi // boutons rangés à sa façon (⚙️ Personnaliser)
        // une image partie de zéro (canevas vide) ou importée : pas de « version » d'une photo de la base, juste l'image à enregistrer
        const fresh = !!(item.fresh || project?.project?.fresh);
        if (fresh) {
            dlg.querySelectorAll('[data-rt-save="copy"], [data-rt-save="keep"], [data-rt-cmd="save:copy"], [data-rt-cmd="save:keep"]').forEach(b => { b.style.display = 'none'; });
            const sh = dlg.querySelector('.modal-actions [data-rt-save="show"]'); if (sh) { sh.textContent = '🖼 Enregistrer l’image dans les Médias'; sh.title = 'L’image (calques compris) remplace celle du média ; le projet, lui, garde tous les calques pour continuer'; }
            const ms = dlg.querySelector('[data-rt-cmd="save:show"] span'); if (ms) ms.textContent = '🖼 Enregistrer l’image dans les Médias';
            dlg.querySelector('.h-rt-note')?.remove();
        }
        try { const rl = JSON.parse(localStorage.getItem('genealogie-retouch-layout') || '{}') || {}; if (rl.tools !== 'side') dlg.classList.add('rt-tools-' + (rl.tools === 'right' ? 'right' : 'left')); /* K19 : la colonne d'outils à gauche, sauf si on l'a mise à droite */ if (rl.side === 'left') dlg.classList.add('rt-side-left'); } catch (_) {} // Réglages → Montage, retouche, mise en page et son
        ext.fullInit(dlg, 'retouch');
        { // K19 : la colonne d'outils de 36 px, et les actions de fin seulement en haut (« 💾 Enregistrer ▾ ») ; les boutons d'en bas restent pour leurs écouteurs, cachés
            const UIr = window.LCNDA_UI;
            UIr?.editorRail?.(dlg.querySelector('.h-rt-vtools'), {breaks: ['[data-rt-mode=marquee]', '[data-rt-mode=crop]', '[data-rt-mode=heal]', '[data-rt-mode=brush]', '[data-rt-mode=text]', '[data-rt-mode=hand]', '.h-rt-fgbg']});
            const acts = dlg.querySelector(':scope > .modal-actions'); acts?.classList.add('ed-old-hidden');
            UIr?.saveMenu?.(dlg.querySelector('[data-rt-projsave]'), () => {
                const bs = [...(acts?.querySelectorAll('[data-rt-save]') || [])].filter(b => b.style.display !== 'none'), mb = dlg.querySelector('[data-rt-mergebox]'), m = dlg.querySelector('[data-rt-merge]');
                return [{icon: '💾', label: 'Enregistrer le projet (calques, masques, réglages)', shortcut: '⌘S', run: () => dlg.querySelector('[data-rt-projsave]')?.click()}, '-',
                    ...bs.reverse().map(b => ({icon: b.dataset.rtSave === 'copy' ? '⧉' : b.dataset.rtSave === 'keep' ? '🗂' : '🖼', label: b.textContent.replace(/^\S*🖼\s*/u, '').trim(), run: () => b.click()})),
                    ...(mb && !mb.hidden && m ? ['-', {icon: m.checked ? '☑' : '☐', label: 'Avec les annotations (calques visibles)', run: () => { m.checked = !m.checked; m.dispatchEvent(new Event('change', {bubbles: true})); }}] : [])];
            });
        }
        // les menus du haut : sur un petit écran, la barre défile de côté et les couperait ; sur un écran bas, la fin d'un long menu sortirait de l'écran
        dlg.querySelectorAll('.h-rt-head details.h-rt-menu').forEach(d => d.addEventListener('toggle', () => {
            const l = d.querySelector(':scope > .h-rt-menulist'); if (!l) return;
            Object.assign(l.style, {position: '', left: '', top: '', maxHeight: '', overflowY: ''}); if (!d.open) return;
            const r = d.querySelector('summary').getBoundingClientRect(), head = d.closest('.h-rt-head'), clipped = head && getComputedStyle(head).overflowX !== 'visible';
            if (clipped) Object.assign(l.style, {position: 'fixed', top: `${r.bottom + 3}px`, left: `${Math.max(4, Math.min(r.left, innerWidth - l.offsetWidth - 4))}px`});
            if (!l.querySelector('.h-rt-sub') || innerWidth <= 700) { const room = innerHeight - l.getBoundingClientRect().top - 8; if (l.scrollHeight > room || innerWidth <= 700) Object.assign(l.style, {maxHeight: `${Math.max(160, room)}px`, overflowY: 'auto'}); } // (sur grand écran, les sous-menus du menu Filtre s'ouvrent à côté : pas de défilement pour lui)
        }));
        const $ = q => dlg.querySelector(q), $$ = q => [...dlg.querySelectorAll(q)];
        const canvas = $('[data-rt-canvas]'), ctx = canvas.getContext('2d'); let out = ctx.createImageData(pw, ph);
        const overlay = $('[data-rt-overlay]'), octx = overlay.getContext('2d'), cropEl = $('[data-rt-crop]');
        const stage = $('[data-rt-stage]'), wrap = $('[data-rt-wrap]');
        let raf = 0, showBefore = false, selPt = -1, outside = -1;
        let baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); // l'image d'origine (avant / après, annuler)
        let curtain = null, idp = null, creaseProp = null; // ◧ le rideau avant / après ; 🪪 la photo d'identité en cours ; 🔍 les plis repérés (proposition)
        // la perspective redressée : l'image de départ remise à plat (gardée tant que les 4 coins ne changent pas)
        let persp = null, warpCache = {key: '', data: null};
        const docCache = new Map(); let docKey = '[]', leveling = false, levelLine = null; // 🔄 Image → Rotation de l'image (plus bas : setDoc, rotateDoc)
        const baseFor = () => { if (!st.persp) return baseData; const key = JSON.stringify(st.persp); if (warpCache.key !== key) warpCache = {key, data: rtWarp(baseData, st.persp)}; return warpCache.data; };
        const applyBase = () => { srcData.data.set(baseFor().data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++; photoKey = ''; draw(); };
        // ── Masques (sélections) : des toiles pw × ph jamais modifiées une fois créées, rangées par numéro (l'historique les garde) ──
        const masks = new Map(); let maskSeq = 0;
        const addMask = c => { const id = 'k' + (++maskSeq); masks.set(id, c); return id; };
        /** 🧭 Restaurer sans rien détruire : ce qu'une retouche (taches, plis, tampon, correcteur, réparer) vient de changer sur la photo
            est rangé sur un calque « ✨ Retouches » au-dessus d'elle, et la photo revient comme avant. Cacher ou baisser ce calque = revenir en arrière. */
        const RT_PATCH_NAME = '✨ Retouches (taches, plis, tampon)';
        function patchToLayer(before, name = RT_PATCH_NAME) {
            const a = srcData.data, c = blank(pw, ph), g = c.getContext('2d'), id = g.createImageData(pw, ph), o = id.data; let any = 0;
            for (let i = 0; i < a.length; i += 4) { if (a[i] !== before[i] || a[i + 1] !== before[i + 1] || a[i + 2] !== before[i + 2] || a[i + 3] !== before[i + 3]) { o[i] = a[i]; o[i + 1] = a[i + 1]; o[i + 2] = a[i + 2]; o[i + 3] = a[i + 3]; any++; } }
            srcData.data.set(before); strokeVer++; photoKey = '';
            if (!any) return null;
            g.putImageData(id, 0, 0);
            // toujours le même calque de retouches (tant qu'il existe) : ses retouches s'ajoutent, une seule image à la taille de la photo
            let l = drawLayers().find(x => x.restorePatch && x.name === name && !x.locked);
            if (l) { const op = l.ops.find(x => x.type === 'image'), prev = op && masks.get(op.mask); if (prev) { const m = blank(pw, ph), mg = m.getContext('2d'); mg.globalAlpha = op.opacity ?? 1; mg.drawImage(prev, op.x * pw, op.y * ph, op.w * pw, op.h * ph); mg.globalAlpha = 1; mg.drawImage(c, 0, 0); l.ops = l.ops.map(x => x === op ? {type: 'image', mask: addMask(m), x: 0, y: 0, w: 1, h: 1, rot: 0, opacity: 1} : x); renderLayer(l); return l; } } // ce qui a été dessiné d'autre sur ce calque reste
            const keep = activeLayer; activeLayer = ''; l = newLayer(name); l.restorePatch = true; activeLayer = keep && nodeById(keep) ? keep : l.id;
            l.ops = [{type: 'image', mask: addMask(c), x: 0, y: 0, w: 1, h: 1, rot: 0, opacity: 1}]; renderLayer(l); return l;
        }
        const blankMask = () => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; return c; };
        let selId = null; // la sélection en cours (ou aucune)
        // ── Calques : la photo (réglages, taches, tampon) tout en bas, puis un arbre (du bas vers le haut) de calques,
        //    de groupes (qui peuvent contenir d'autres groupes) et de calques de réglage (réglages et filtres) ──
        st.strokes = [];
        let layers = [], activeLayer = '', layerSeq = 0, maskEdit = ''; let maskShow = null; // maskShow : ⌥ + clic ou \\ pour voir le masque ; maskEdit : le calque (ou 'photo') dont on peint le masque
        const nid = p => p + (++layerSeq) + Date.now().toString(36);
        const typeOf = n => n?.type || 'layer';
        const walk = (arr, fn, parent = null) => arr.forEach(n => { fn(n, arr, parent); if (typeOf(n) === 'group') walk(n.children, fn, n); });
        const nodeById = id => { let r = null; if (id) walk(layers, n => { if (n.id === id) r = n; }); return r; };
        const locate = id => { let r = null; walk(layers, (n, arr, parent) => { if (n.id === id) r = {n, arr, parent}; }); return r; };
        const drawLayers = () => { const out = []; walk(layers, n => { if (typeOf(n) === 'layer') out.push(n); }); return out; };
        // les calques qu'on peut toucher (visibles et non verrouillés, groupes compris), du haut vers le bas
        const hitList = () => { const out = []; const rec = (arr, vis, lk) => arr.forEach(n => { const v = vis && n.visible, l2 = lk || n.locked; if (typeOf(n) === 'group') rec(n.children, v, l2); else if (typeOf(n) === 'layer' && v && !l2) out.push(n); }); rec(layers, true, false); return out.reverse(); };
        const lockedDeep = n => { if (!n) return false; if (n.locked) return true; let p = locate(n.id)?.parent; while (p) { if (p.locked) return true; p = locate(p.id)?.parent; } return false; }; // verrouillé, lui ou un de ses groupes
        const layerCanvases = new Map();
        const layerCanvas = l => { let c = layerCanvases.get(l.id); if (!c) { c = document.createElement('canvas'); c.width = pw; c.height = ph; layerCanvases.set(l.id, c); } return c; };
        // un nouvel élément se range au-dessus du calque choisi (ou dans le groupe choisi)
        const insertNode = n => {
            const a = locate(activeLayer);
            if (a && typeOf(a.n) === 'group' && a.n.open !== false) a.n.children.push(n);
            else if (a) a.arr.splice(a.arr.indexOf(a.n) + 1, 0, n);
            else layers.push(n);
            activeLayer = n.id; return n;
        };
        const newLayer = name => insertNode({id: nid('l'), type: 'layer', name: name || `Calque ${drawLayers().length + 1}`, visible: true, opacity: 1, locked: false, ops: [], mask: null});
        const newGroup = name => insertNode({id: nid('g'), type: 'group', name: name || `Groupe ${(() => { let k = 0; walk(layers, n => { if (typeOf(n) === 'group') k++; }); return k + 1; })()}`, visible: true, opacity: 1, locked: false, mask: null, open: true, children: []});
        const adjDefault = () => { const d = rtDefault(); delete d.crop; delete d.persp; return d; };
        const newAdjust = name => insertNode({id: nid('a'), type: 'adjust', name: name || 'Réglages', visible: true, opacity: 1, mask: null, clip: false, st: adjDefault()});
        // la photo est un calque comme les autres, dans l'arbre : visibilité, opacité, masque, verrou, nom, groupes, glisser-déposer
        const mkPhoto = (o = {}) => ({name: 'Photo', visible: true, opacity: 1, mask: null, locked: false, ...o, id: 'photo', type: 'photo'});
        const P = () => nodeById('photo');
        layers.push(mkPhoto());
        const photoCanvas = document.createElement('canvas'); photoCanvas.width = pw; photoCanvas.height = ph; const pctx = photoCanvas.getContext('2d');
        const env = () => ({masks, photo: photoCanvas});
        let strokeVer = 0, photoKey = '';
        const hasPixels = l => (l.ops || []).some(o => o.type === 'pixels');
        const renderLayer = l => { if (typeOf(l) === 'layer') rtDrawLayer(layerCanvas(l), l, env()); };
        // la photo n'est recalculée que si ses réglages ou ses corrections ont changé
        const photo = () => { const k = strokeVer + '|' + JSON.stringify({...st, strokes: 0}); if (k !== photoKey) { photoKey = k; pctx.putImageData(rtApply(srcData, out, st), 0, 0); drawLayers().forEach(l => { if (hasPixels(l)) renderLayer(l); }); } return photoCanvas; };
        // les réglages (et filtres) que montrent les onglets Réglages et Filtres : ceux du calque de réglage choisi, sinon ceux de la photo
        const adjNode = () => { const n = nodeById(activeLayer); return typeOf(n) === 'adjust' ? n : null; };
        const T = () => adjNode()?.st || st;
        const blank = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
        /** Un calque de réglage appliqué à une image (son masque et son opacité dosent l'effet ; la transparence est gardée) */
        const adjCache = new Map(); // un filtre lourd n'est recalculé que si ses réglages ou ce qui est dessous ont changé
        function applyAdjust(src, n, W, H) {
            const g0 = src.getContext('2d', {willReadFrequently: true}), id = g0.getImageData(0, 0, W, H);
            const heavy = W === pw && H === ph && (n.st.filters?.chain?.length || n.st.filters?.deglare || n.st.filters?.dust); // seulement l'aperçu ; jamais en pleine taille
            let key = '';
            if (heavy) { const u = new Uint32Array(id.data.buffer, id.data.byteOffset, id.data.byteLength >> 2); let h1 = 2166136261, h2 = 0; for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 16777619); h2 = (h2 + u[i] * (i + 1)) >>> 0; } key = JSON.stringify(n.st) + '|' + (h1 >>> 0) + ':' + h2; } // tous les points comptent
            const hit = heavy ? adjCache.get(n.id) : null;
            let o; if (hit?.key === key) o = hit.o; else { o = new ImageData(W, H); rtApply(id, o, n.st); if (heavy) adjCache.set(n.id, {key, o}); }
            const adj = blank(W, H); adj.getContext('2d').putImageData(o, 0, 0);
            const res = blank(W, H), g = res.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = n.opacity ?? 1; g.drawImage(rtMasked(adj, n.maskOff ? null : n.mask, masks), 0, 0); return res;
        }
        /** Une pile (du bas vers le haut) : calques, groupes (rendus à part, puis posés) et réglages. Un réglage « juste dessous »
            (clip) ne touche que l'élément qui est sous lui ; sinon il touche tout ce qui est dessous dans la même pile. */
        function renderStack(arr, base, R) {
            let acc = base || blank(R.W, R.H), i = 0;
            while (i < arr.length) {
                const n = arr[i];
                if (!n.visible) { i++; continue; }
                if (typeOf(n) === 'adjust') { acc = applyAdjust(acc, n, R.W, R.H); i++; continue; }
                let own = typeOf(n) === 'group' ? renderStack(n.children, null, R) : R.layer(n), j = i + 1;
                while (j < arr.length && typeOf(arr[j]) === 'adjust' && arr[j].clip) { if (arr[j].visible) own = applyAdjust(own, arr[j], R.W, R.H); j++; }
                own = rtMasked(own, R.mask(n), masks);
                if (typeOf(n) !== 'group' && rtHasStyle(n)) own = rtLayerStyle(own, n, R.W / pw); // fond et effets
                const g = acc.getContext('2d'); g.globalAlpha = n.opacity ?? 1; g.globalCompositeOperation = rtBlend(n); g.drawImage(own, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
                i = j;
            }
            return acc;
        }
        const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
            if (showBefore) { ctx.putImageData(baseData, 0, 0); return; }
            ctx.clearRect(0, 0, pw, ph);
            const pc = photo();
            const R = {W: pw, H: ph,
                layer: l => { if (typeOf(l) === 'photo') return pc; const src = layerCanvas(l); if (!(painting?.preview && painting.layer === l && !painting.mask)) return src; const t = blank(pw, ph), g = t.getContext('2d'); g.drawImage(src, 0, 0); rtDrawOp(g, painting.preview, pw, ph, env()); return t; },
                mask: n => painting?.mask && painting.layer === n ? [...(n.mask || []), painting.preview] : n.maskOff ? null : n.mask};
            ctx.drawImage(renderStack(layers, null, R), 0, 0);
            const mn = maskShow && nodeById(maskShow.id); if (mn?.mask) { // ⌥ + clic : le masque seul ; \ : le masque en rouge (rubylith)
                const white = blank(pw, ph), wg = white.getContext('2d'); wg.fillStyle = '#fff'; wg.fillRect(0, 0, pw, ph); const shown = rtMasked(white, R.mask(mn) || mn.mask, masks);
                if (maskShow.mode === 'alone') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pw, ph); ctx.drawImage(shown, 0, 0); }
                else { const red = blank(pw, ph), rg = red.getContext('2d'); rg.fillStyle = 'rgba(255,0,0,.5)'; rg.fillRect(0, 0, pw, ph); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(shown, 0, 0); ctx.drawImage(red, 0, 0); } }
            else if (maskShow) maskShow = null;
            if (painting?.patch) { ctx.save(); ctx.drawImage((() => { const t = blank(pw, ph), g = t.getContext('2d'); g.drawImage(pc, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(masks.get(painting.patch.mask), 0, 0); return t; })(), painting.patch.dx * pw, painting.patch.dy * ph); ctx.restore(); }
            drawOverlay();
        }); };
        // ── Ce qui se dessine par-dessus : la sélection (le reste assombri), le recadrage, l'élément choisi, le tracé en cours ──
        let moveSel = null; // l'élément choisi avec ➤ : {layer, i}
        function drawOverlay() {
            octx.clearRect(0, 0, pw, ph);
            const m = selId && masks.get(selId);
            if (m) {
                octx.save(); octx.fillStyle = 'rgba(10,20,40,.38)'; octx.fillRect(0, 0, pw, ph); octx.globalCompositeOperation = 'destination-out'; octx.drawImage(m, 0, 0); octx.restore();
                // un liseré autour de la sélection
                octx.save(); const e = document.createElement('canvas'); e.width = pw; e.height = ph; const eg = e.getContext('2d'); const lw = Math.max(1, pw / 700);
                eg.drawImage(m, -lw, 0); eg.drawImage(m, lw, 0); eg.drawImage(m, 0, -lw); eg.drawImage(m, 0, lw); eg.globalCompositeOperation = 'destination-out'; eg.drawImage(m, 0, 0); eg.globalCompositeOperation = 'source-in'; eg.fillStyle = '#2a7de1'; eg.fillRect(0, 0, pw, ph);
                octx.drawImage(e, 0, 0); octx.restore();
            }
            if (st.crop && mode !== 'crop') { // la zone gardée (tournée si l'image est redressée), le reste assombri
                octx.save(); octx.fillStyle = 'rgba(0,0,0,.5)'; octx.fillRect(0, 0, pw, ph); octx.globalCompositeOperation = 'destination-out';
                octx.translate(pw / 2, ph / 2); octx.rotate(-st.crop.a * Math.PI / 180); octx.translate(-pw / 2, -ph / 2); octx.fillRect(st.crop.x * pw, st.crop.y * ph, st.crop.w * pw, st.crop.h * ph); octx.restore();
            }
            if (drag?.sel) { const d = drag; octx.save(); octx.strokeStyle = '#2a7de1'; octx.lineWidth = Math.max(1, pw / 600); octx.setLineDash([6, 4]); octx.beginPath(); selPath(octx, d.sel); octx.stroke(); octx.restore(); }
            if (mode === 'persp' && persp) { // les 4 coins de la perspective et une grille pour viser
                octx.save(); const P4 = persp.map(([x, y]) => [x * pw, y * ph]), lw = Math.max(1, pw / 600), k = handleSize();
                octx.strokeStyle = 'rgba(255,255,255,.9)'; octx.lineWidth = lw * 2; octx.beginPath(); P4.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke();
                octx.strokeStyle = '#2a7de1'; octx.lineWidth = lw; octx.stroke();
                const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; octx.setLineDash([4, 4]);
                for (const t of [1 / 3, 2 / 3]) { octx.beginPath(); octx.moveTo(...lerp(P4[0], P4[1], t)); octx.lineTo(...lerp(P4[3], P4[2], t)); octx.moveTo(...lerp(P4[0], P4[3], t)); octx.lineTo(...lerp(P4[1], P4[2], t)); octx.stroke(); }
                octx.setLineDash([]); octx.fillStyle = '#fff'; P4.forEach(([x, y]) => { octx.beginPath(); octx.arc(x, y, k * 1.4, 0, Math.PI * 2); octx.fill(); octx.stroke(); }); octx.restore();
            }
            if (poly?.length) { octx.save(); octx.strokeStyle = '#2a7de1'; octx.fillStyle = '#fff'; octx.lineWidth = Math.max(1, pw / 600); octx.beginPath(); poly.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); if (polyHover) octx.lineTo(...polyHover); octx.stroke(); poly.forEach(([x, y]) => { octx.fillRect(x - 3, y - 3, 6, 6); octx.strokeRect(x - 3, y - 3, 6, 6); }); octx.restore(); }
            if (moveSel && mode === 'move') { const l = nodeById(moveSel.layer), op = l?.ops[moveSel.i], bb = op && opBox(op); if (bb) { octx.save(); octx.strokeStyle = '#2a7de1'; octx.lineWidth = Math.max(1, pw / 700); octx.setLineDash([5, 4]);
                if (op.type === 'image') { // une image placée : son cadre (tourné), 4 poignées pour la taille, une ronde pour la faire pivoter
                    const hs = imgHandles(op), k = handleSize(); octx.beginPath(); hs.corners.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke(); octx.setLineDash([]); octx.fillStyle = '#fff';
                    octx.beginPath(); octx.moveTo(...hs.topMid); octx.lineTo(...hs.rot); octx.stroke();
                    hs.corners.forEach(([x, y]) => { octx.fillRect(x - k, y - k, k * 2, k * 2); octx.strokeRect(x - k, y - k, k * 2, k * 2); });
                    octx.beginPath(); octx.arc(hs.rot[0], hs.rot[1], k * 1.1, 0, Math.PI * 2); octx.fill(); octx.stroke();
                } else octx.strokeRect(bb.x * pw - 4, bb.y * ph - 4, bb.w * pw + 8, bb.h * ph + 8);
                octx.restore(); } }
            if (drag?.textBox) { octx.save(); octx.strokeStyle = '#2a7de1'; octx.lineWidth = Math.max(1, pw / 600); octx.setLineDash([5, 4]); octx.strokeRect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0)); octx.restore(); }
            if (mode === 'gradient') { // la ligne du dégradé : début (rond blanc), fin (rond bleu), losange au milieu pour tout déplacer, et ses arrêts de couleur
                const o = painting?.tool === 'gradient' ? (painting.layer ? painting.op : null) : painting?.tool === 'gradmask' ? painting.preview : gradTarget()?.op;
                if (o) { const h = gradHandles(o), k = handleSize(), lw = Math.max(1, pw / 700), L = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1]) || 1, nx = -(h.b[1] - h.a[1]) / L, ny = (h.b[0] - h.a[0]) / L;
                    octx.save(); octx.lineCap = 'round'; octx.lineWidth = lw * 3; octx.strokeStyle = 'rgba(0,0,0,.45)'; octx.beginPath(); octx.moveTo(...h.a); octx.lineTo(...h.b); octx.stroke(); octx.lineWidth = lw; octx.strokeStyle = '#fff'; octx.stroke();
                    rtGSorted(o.stops).forEach(s0 => { const t = o.reverse ? 1 - s0.p : s0.p, cx = h.a[0] + (h.b[0] - h.a[0]) * t + nx * k * 3, cy = h.a[1] + (h.b[1] - h.a[1]) * t + ny * k * 3;
                        const r = k * 1.05; octx.fillStyle = '#fff'; octx.fillRect(cx - r - lw, cy - r - lw, 2 * (r + lw), 2 * (r + lw)); octx.fillStyle = s0.c; octx.globalAlpha = 0.3 + 0.7 * s0.a; octx.fillRect(cx - r, cy - r, 2 * r, 2 * r); octx.globalAlpha = 1; octx.strokeStyle = 'rgba(0,0,0,.6)'; octx.lineWidth = lw; octx.strokeRect(cx - r - lw, cy - r - lw, 2 * (r + lw), 2 * (r + lw)); });
                    [h.a, h.b].forEach(([cx, cy], i) => { octx.beginPath(); octx.arc(cx, cy, k * 1.3, 0, Math.PI * 2); octx.fillStyle = i ? '#2a7de1' : '#fff'; octx.fill(); octx.strokeStyle = i ? '#fff' : '#2a7de1'; octx.lineWidth = lw * 2; octx.stroke(); });
                    octx.beginPath(); octx.moveTo(h.m[0], h.m[1] - k * 1.1); octx.lineTo(h.m[0] + k * 1.1, h.m[1]); octx.lineTo(h.m[0], h.m[1] + k * 1.1); octx.lineTo(h.m[0] - k * 1.1, h.m[1]); octx.closePath(); octx.fillStyle = '#fff'; octx.fill(); octx.strokeStyle = '#2a7de1'; octx.lineWidth = lw * 1.5; octx.stroke();
                    octx.restore(); } }
            if (painting?.tool === 'repair' && painting.dabs.length) { octx.save(); octx.fillStyle = 'rgba(230,40,40,.45)'; for (const d of painting.dabs) { octx.beginPath(); octx.arc(d.x * pw, d.y * ph, d.r * pw, 0, Math.PI * 2); octx.fill(); } octx.restore(); }
            if (creaseProp?.canvas) { octx.save(); octx.globalAlpha = 0.8; octx.drawImage(creaseProp.canvas, 0, 0); octx.restore(); }
            if (levelLine) { // 📐 la ligne de l'horizon en cours de tracé
                const L = levelLine, lw = Math.max(1, pw / 600); octx.save(); octx.lineCap = 'round'; octx.strokeStyle = 'rgba(0,0,0,.55)'; octx.lineWidth = lw * 4; octx.beginPath(); octx.moveTo(L.x0, L.y0); octx.lineTo(L.x1, L.y1); octx.stroke();
                octx.strokeStyle = '#fff'; octx.lineWidth = lw * 1.6; octx.setLineDash([lw * 6, lw * 4]); octx.stroke(); octx.setLineDash([]); octx.fillStyle = '#2a7de1'; [[L.x0, L.y0], [L.x1, L.y1]].forEach(([x, y]) => { octx.beginPath(); octx.arc(x, y, lw * 4, 0, Math.PI * 2); octx.fill(); }); octx.restore(); }
            if (idp?.crop && mode === 'idphoto') { // le cadre (tourné pour mettre les yeux à l'horizontale), la ligne des yeux et les deux ronds à glisser
                const c = idp.crop, rot = g => { g.translate(pw / 2, ph / 2); g.rotate(-c.a * Math.PI / 180); g.translate(-pw / 2, -ph / 2); }, lw = Math.max(1, pw / 600), k = handleSize();
                octx.save(); octx.fillStyle = 'rgba(0,0,0,.45)'; octx.fillRect(0, 0, pw, ph); octx.globalCompositeOperation = 'destination-out'; rot(octx); octx.fillRect(c.x * pw, c.y * ph, c.w * pw, c.h * ph); octx.restore();
                octx.save(); rot(octx); octx.strokeStyle = '#fff'; octx.lineWidth = lw * 1.5; octx.strokeRect(c.x * pw, c.y * ph, c.w * pw, c.h * ph); octx.setLineDash([lw * 6, lw * 5]); octx.strokeStyle = '#2a7de1'; const ey = (c.y + c.h * idp.p.eye) * ph; octx.beginPath(); octx.moveTo(c.x * pw, ey); octx.lineTo((c.x + c.w) * pw, ey); octx.stroke(); octx.restore();
                octx.save(); octx.lineWidth = lw * 2; idp.eyes.forEach(([ex, ey2]) => { octx.strokeStyle = '#fff'; octx.beginPath(); octx.arc(ex, ey2, k * 1.7, 0, Math.PI * 2); octx.stroke(); octx.strokeStyle = '#2a7de1'; octx.beginPath(); octx.arc(ex, ey2, k * 1.4, 0, Math.PI * 2); octx.stroke(); octx.fillStyle = '#2a7de1'; octx.beginPath(); octx.arc(ex, ey2, k * 0.35, 0, Math.PI * 2); octx.fill(); }); octx.restore();
            }
        }
        // ── Historique : chaque geste ou réglage est une étape ; un clic sur une étape y revient ──
        let history = [], hpos = -1, onHist = null;
        const snapshot = () => ({st: rtClone({...st, strokes: undefined, persp: st.persp ?? st._persp0 ?? null, _persp0: undefined}), strokes: rtClone(st.strokes), layers: rtClone(layers), activeLayer, selId});
        const commit = label => {
            const snap = snapshot();
            if (hpos >= 0 && JSON.stringify(history[hpos].snap) === JSON.stringify(snap)) return; // rien n'a changé
            history = history.slice(0, hpos + 1); history.push({label, at: new Date(), snap}); if (history.length > 200) history.shift(); hpos = history.length - 1;
            refreshHistory();
        };
        const restore = i => {
            dlg.querySelector('.h-rt-fxpanel')?.remove(); // une fenêtre de filtre ouverte ne vise plus le bon calque
            creaseProp = null; if (idp) { idp = null; if (mode === 'idphoto') setMode('adjust'); }
            const s = history[i]?.snap; if (!s) return;
            Object.keys(st).forEach(k => { if (k !== 'strokes') delete st[k]; }); Object.assign(st, rtClone(s.st));
            st.strokes = rtClone(s.strokes);
            setDoc(st.docXf); // 🔄 l'image tournée (ou pas) de cette étape
            srcData.data.set(baseFor().data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++;
            layers = rtClone(s.layers); activeLayer = s.activeLayer === 'photo' ? '' : s.activeLayer; selId = s.selId; moveSel = null;
            if (s.photoL && !nodeById('photo')) layers.unshift(mkPhoto(s.photoL)); // un projet d'avant : la photo hors de l'arbre
            if (maskEdit && !nodeById(maskEdit)?.mask) maskEdit = '';
            photoKey = ''; photo(); layerCanvases.clear(); drawLayers().forEach(renderLayer);
            hpos = i; syncControls(); refreshLayers(); refreshHistory(); syncCrop();
        };
        // H7 : une suppression faite sans question ; « ↶ Annuler » dans le message en bas à gauche (tant que rien d'autre n'a changé depuis)
        const undoable = message => { const at = hpos; A().undoToast?.(message, {undo: () => { if (!dlg.isConnected) throw new Error('la retouche est fermée'); if (hpos !== at) throw new Error('d’autres changements ont suivi : utilise ↶ dans la barre de l’outil'); restore(at - 1); }, redo: () => { if (dlg.isConnected && hpos === at - 1) restore(at); }}); };
        const undoBtn = $('[data-rt-undo]'), redoBtn = $('[data-rt-redo]');
        function refreshHistory() {
            try { paintBoard(); } catch (_) {} // 📏 la zone de travail et la taille finale suivent ↶ ↷
            undoBtn.disabled = hpos <= 0; redoBtn.disabled = hpos >= history.length - 1; onHist?.();
            const pane = $('[data-rt-pane="history"]');
            pane.innerHTML = `<p class="muted">Clique sur une étape pour revenir à ce moment-là ; les étapes suivantes restent (en gris) tant que tu ne fais rien d’autre.</p><ol class="h-rt-history">${history.map((h, i) => `<li class="${i === hpos ? 'is-current' : i > hpos ? 'is-future' : ''}"><button type="button" data-rt-hist="${i}"><span>${esc(h.label)}</span><small>${h.at.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}</small></button></li>`).join('')}</ol>`;
            pane.querySelector('.is-current')?.scrollIntoView({block: 'nearest'});
        }
        $('[data-rt-pane="history"]').addEventListener('click', e => { const b = e.target.closest('[data-rt-hist]'); if (b) restore(Number(b.dataset.rtHist)); });
        undoBtn.addEventListener('click', () => restore(hpos - 1));
        redoBtn.addEventListener('click', () => restore(hpos + 1));
        // ── Calques : un arbre (calques, groupes de groupes, réglages), visibilité, opacité, verrou, nom, masque ──
        const thumbOf = (c, maskOps) => { const t = document.createElement('canvas'); t.width = 44; t.height = Math.max(1, Math.round(44 * ph / pw)); const g = t.getContext('2d'); if (maskOps) { g.fillStyle = '#111'; g.fillRect(0, 0, t.width, t.height); g.globalCompositeOperation = 'destination-out'; g.drawImage(rtRenderMask(maskOps, pw, ph, masks), 0, 0, t.width, t.height); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height); } /* comme Photoshop : blanc = montré, noir = caché */ else g.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL(); };
        const maskBtns = (id, m) => m ? `<button type="button" class="h-rt-mthumb${maskEdit === id ? ' is-on' : ''}${nodeById(id)?.maskOff ? ' is-maskoff' : ''}${maskShow?.id === id ? ' is-shown' : ''}" data-rt-medit title="${maskEdit === id ? 'Tu peins le masque (pinceau : ⬛ cacher / ⬜ montrer). Clic : revenir au calque' : 'Masque : clic pour le peindre au pinceau'} · ⇧ Maj + clic : désactiver / réactiver le masque · ⌥ Alt + clic : voir le masque seul · touche \\ : le masque en rouge par-dessus"><img src="${thumbOf(null, m)}" alt="masque"></button>` : `<button type="button" class="icon-button small" data-rt-madd title="Ajouter un masque (cacher une partie sans l’effacer) — ⌥ / Alt + clic : un masque qui cache tout (ou cache la sélection)">🎭</button>`;
        const groupsList = (except = null) => { const out = []; const rec = (arr, depth, banned) => arr.forEach(n => { if (typeOf(n) !== 'group') return; const ban = banned || n === except; if (!ban) out.push([n, depth]); rec(n.children, depth + 1, ban); }); rec(layers, 0, false); return out; };
        const ICON = {layer: '🖌', group: '📁', adjust: '🎚', photo: '🖼'};
        function rowHtml(n, depth) {
            const t = typeOf(n), mops = n.mask ? `<span class="h-rt-mops"><button type="button" class="link-button" data-rt-minv>inverser le masque</button><button type="button" class="link-button" data-rt-mdel>retirer le masque</button></span>` : '';
            const loc = locate(n.id), parentId = loc?.parent?.id || '';
            const into = `<label class="h-rt-lpar" title="Ranger dans un groupe">📁 <select data-rt-lpar><option value="">(hors groupe)</option>${groupsList(n).map(([g, d]) => `<option value="${g.id}" ${g.id === parentId ? 'selected' : ''}>${'  '.repeat(d)}${esc(g.name)}</option>`).join('')}</select></label>`;
            // écrêtage façon Photoshop : le réglage « seulement dessous » est décalé, avec une flèche vers l'élément qu'il touche (souligné)
            const ix = loc ? loc.arr.indexOf(n) : -1, clipped = t === 'adjust' && n.clip, base = t !== 'adjust' && ix >= 0 && typeOf(loc.arr[ix + 1] || {}) === 'adjust' && loc.arr[ix + 1].clip;
            const clipBase = clipped ? loc.arr.slice(0, ix).reverse().find(x => !(typeOf(x) === 'adjust' && x.clip)) : null;
            const head = `<li class="h-rt-node is-${t}${(t === 'photo' ? !activeLayer : n.id === activeLayer) ? ' is-active' : ''}${n.visible ? '' : ' is-off'}${clipped ? ' is-clipped' : ''}${base ? ' is-clipbase' : ''}" data-rt-l="${n.id}" style="--d:${depth}">
                ${clipped ? `<span class="h-rt-cliparrow" title="Masque d’écrêtage : ne touche que ${clipBase ? `« ${esc(clipBase.name)} »` : 'l’élément'} juste dessous (⌥ Alt + clic entre deux calques dans Photoshop)"><svg viewBox="0 0 14 16" width="12" height="14" aria-hidden="true"><path d="M3 1v9h7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(90 10 10)"/></svg></span>` : ''}
                <span class="h-rt-grip" draggable="true" data-rt-grip title="Glisser pour ranger : au-dessus, en dessous, ou dans un groupe (lâcher au milieu d’un groupe)">⠿</span>
                ${t === 'group' ? `<button type="button" class="h-rt-gtog" data-rt-gopen title="${n.open !== false ? 'Replier' : 'Déplier'}">${n.open !== false ? '▾' : '▸'}</button>` : '<span class="h-rt-gtog"></span>'}
                <button type="button" class="h-rt-eye" data-rt-lvis title="${n.visible ? 'Masquer' : 'Montrer'}">${n.visible ? '👁' : '◌'}</button>
                ${t === 'photo' ? `<img class="h-rt-pthumb" src="${thumbOf(photoCanvas)}" alt="">` : ''}<span class="h-rt-lico" title="${{layer: 'Calque', group: 'Groupe', adjust: 'Calque de réglage', photo: 'La photo (réglages, taches, tampon)'}[t]}">${ICON[t]}</span>
                <input value="${esc(n.name)}" data-rt-lname aria-label="Nom">
                ${maskBtns(n.id, n.mask)}
                ${t !== 'adjust' ? `<button type="button" class="h-rt-eye" data-rt-llock title="${n.locked ? 'Déverrouiller' : 'Verrouiller'}">${n.locked ? '🔒' : '🔓'}</button>` : ''}
                <span class="h-rt-lmoves"><button type="button" class="icon-button small" data-rt-lmove="1" title="Monter">↑</button><button type="button" class="icon-button small" data-rt-lmove="-1" title="Descendre">↓</button>${t !== 'group' ? '<button type="button" class="icon-button small" data-rt-ldup title="Dupliquer">⧉</button>' : ''}<button type="button" class="icon-button small" data-rt-ldel title="${t === 'group' ? 'Supprimer le groupe (ce qu’il contient reste)' : t === 'photo' ? 'Retirer la photo des calques (⌘Z pour la remettre)' : 'Supprimer'}">✕</button></span>
                <div class="h-rt-lmore">${t !== 'adjust' ? `<label class="h-rt-lblend" title="Mode de fusion : comment le calque se mélange à ce qui est dessous">Fusion <select data-rt-lblend>${RT_BLENDS.map(([v, l]) => `<option value="${v}" ${rtBlend(n) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}<label class="h-rt-lopac">Opacité <input type="range" min="0" max="100" value="${Math.round((n.opacity ?? 1) * 100)}" data-rt-lopac></label>${t !== 'adjust' && t !== 'group' ? `<label class="h-rt-lopac" title="Fond : dose seulement le contenu du calque, pas ses effets (ombre, lueur, contour). À 0 %, il ne reste que les effets.">Fond <input type="range" min="0" max="100" value="${Math.round((n.fill ?? 1) * 100)}" data-rt-lfill></label><button type="button" class="h-rt-lfxbtn${Object.values(rtLfx(n)).some(x => x.on) ? ' is-on' : ''}" data-rt-lstyle title="Effets du calque : ombre portée, lueur externe, contour, incrustation de couleur">fx</button>` : ''}${into}</div>
                ${n.smart && n.ops?.some(o => o.type === 'image') ? `<div class="h-rt-smart"><span class="h-rt-smartb" title="Objet dynamique : agrandir, réduire, tourner sans perte (l’image d’origine est gardée)">🧩 Objet dynamique</span><button type="button" class="link-button" data-rt-smart="replace" title="Une autre image à la même place, même taille, même rotation">Remplacer…</button><button type="button" class="link-button" data-rt-smart="orig" title="Remettre l’image à sa taille d’origine (et droite)">Taille d’origine</button><button type="button" class="link-button" data-rt-smart="filter" title="Un calque de filtres juste au-dessus, qui ne touche que cette image : on peut le régler, le doser, le cacher">✨ Filtre dynamique</button><button type="button" class="link-button" data-rt-smart="raster" title="Figer l’image en pixels, à la taille où elle est (plus d’agrandissement sans perte)">Pixelliser</button></div>` : ''}
                ${n.gradLayer && n.ops?.some(o => o.type === 'gradient') ? (() => { const g0 = [...n.ops].reverse().find(o => o.type === 'gradient'); return `<div class="h-rt-smart"><span class="h-rt-gsw" style="background:${rtGradCss(g0.stops)}" title="${esc(RT_GKINDS.find(k => k[0] === g0.kind)?.[2] || 'Dégradé')}"></span><button type="button" class="link-button" data-rt-gedit title="Couleurs, transparence, forme, préréglages">▦ Modifier le dégradé…</button></div>`; })() : ''}
                ${n.patLayer && n.ops?.some(o => o.type === 'pattern') ? '<div class="h-rt-smart"><button type="button" class="link-button" data-rt-patedit title="Motif, échelle, angle, décalage">▩ Modifier le motif…</button></div>' : ''}
                ${t === 'adjust' ? `<div class="h-rt-adjrow"><label class="ui-toggle" title="Comme un masque d’écrêtage de Photoshop"><input type="checkbox" data-rt-lclip ${n.clip ? 'checked' : ''}><i></i><span>seulement sur ${(() => { const i = loc.arr.indexOf(n), below = loc.arr.slice(0, i).reverse().find(x => !(typeOf(x) === 'adjust' && x.clip)); return below ? `« ${esc(below.name)} »` : 'ce qui est juste dessous'; })()}</span></label><button type="button" class="link-button" data-rt-ladj>régler…</button></div><small class="muted">${n.clip ? 'ne touche que l’élément juste dessous' : loc.parent ? `touche tout ce qui est dessous dans « ${esc(loc.parent.name)} »` : 'touche tout ce qui est dessous'}</small>${(n.st?.filters?.chain || []).length ? `<div class="h-rt-lfx"><span class="muted">✨ Filtres :</span>${n.st.filters.chain.map((f, i) => `<button type="button" class="h-rt-lfxb" data-rt-lfxedit="${i}" title="Changer les réglages de ce filtre">${esc(RT_FX[f.t]?.[1] || f.t)} <b>régler…</b></button>`).join('')}</div>` : ''}`
                : t === 'photo' ? `<small class="muted">réglages, ${st.strokes.length} correction${st.strokes.length > 1 ? 's' : ''}</small>`
                : t === 'group' ? `<small class="muted">${n.children.length} élément${n.children.length > 1 ? 's' : ''}</small>` : `<small class="muted">${n.ops.length} élément${n.ops.length > 1 ? 's' : ''}</small>${n.ops.length ? '<button type="button" class="link-button" data-rt-lclear>vider</button>' : ''}`}
                ${mops}</li>`;
            return head + (t === 'group' && n.open !== false ? (n.children.length ? [...n.children].reverse().map(c => rowHtml(c, depth + 1)).join('') : `<li class="h-rt-gempty" data-rt-gin="${n.id}" style="--d:${depth + 1}">groupe vide : glisse un calque ici (⠿), ou range-le avec 📁</li>`) : '');
        }
        function refreshLayers() {
            syncChips();
            const pane = $('[data-rt-pane="layers"]');
            pane.dataset.dndOff = '';
            pane.innerHTML = `<p class="muted">Le pinceau, les formes et le texte vont sur le calque choisi (en bleu). 📁 un groupe peut contenir des calques et d’autres groupes ; 🎚 un calque de réglage applique réglages et filtres à ce qui est dessous (ou seulement à l’élément juste dessous). 🎭 un masque cache sans effacer.</p>
                <div class="h-rt-lbar"><button type="button" class="button small" data-rt-ladd>＋ Calque</button><button type="button" class="button small secondary" data-rt-imgadd title="Une image de la base ou de l’ordinateur, sur un nouveau calque, en objet dynamique (agrandir, réduire, tourner sans perte)">🖼️ Image</button><button type="button" class="button small secondary" data-rt-gadd title="Un groupe vide au-dessus du calque choisi">＋ Groupe</button><button type="button" class="button small secondary" data-rt-aadd title="Réglages et filtres dans un calque">＋ Réglage</button>${!P() ? '<button type="button" class="button small secondary" data-rt-padd title="La photo a été retirée des calques : la remettre tout en bas">↺ Remettre la photo</button>' : ''}${nodeById(activeLayer) || P() ? '<button type="button" class="button small secondary" data-rt-gwrap title="Met le calque choisi dans un nouveau groupe (⌘G)">Grouper</button>' : ''}${selId ? '<button type="button" class="button small secondary" data-rt-cmd="sel:copy">Sélection → calque</button>' : ''}</div>
                <ol class="h-rt-layers h-rt-tree">${[...layers].reverse().map(n => rowHtml(n, 0)).join('')}${layers.length ? '' : '<li class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧱</span><span class="empty-line-text">Aucun calque.</span></li>'}</ol>`;
            $('[data-rt-mergebox]').hidden = !drawLayers().some(l => l.ops.length) && !layers.some(n => !['layer', 'photo'].includes(typeOf(n))) && layers[0] === P();
            syncTarget(); try { renderProps(); renderPats(); } catch (_) {} // ⓘ et ▩ suivent le calque choisi
        }
        const target = id => nodeById(id);
        const addMaskTo = (id, ops) => { const t = target(id); if (!t) return; t.mask = ops; maskEdit = id; if (id !== 'photo') renderLayer(t); refreshLayers(); draw(); };
        const groupWrap = () => { const a = locate(activeLayer || 'photo'); if (!a) return toast('Choisis d’abord un calque.', 'error'); const g = {id: nid('g'), type: 'group', name: `Groupe ${groupsList().length + 1}`, visible: true, opacity: 1, locked: false, mask: null, open: true, children: [a.n]}; a.arr.splice(a.arr.indexOf(a.n), 1, g); activeLayer = g.id; refreshLayers(); draw(); commit(`« ${a.n.name} » mis dans un groupe`); };
        const paneLayers = $('[data-rt-pane="layers"]');
        paneLayers.addEventListener('click', async e => {
            if (e.target.closest('[data-rt-ladd]')) { newLayer(); maskEdit = ''; refreshLayers(); commit('Nouveau calque'); return; }
            if (e.target.closest('[data-rt-imgadd]')) { placeDialog(); return; }
            if (e.target.closest('[data-rt-gadd]')) { newGroup(); maskEdit = ''; refreshLayers(); commit('Nouveau groupe'); return; }
            if (e.target.closest('[data-rt-aadd]')) { newAdjust(); maskEdit = ''; refreshLayers(); draw(); syncControls(); commit('Nouveau calque de réglage'); showTab('adjust'); return; }
            if (e.target.closest('[data-rt-gwrap]')) return groupWrap();
            if (e.target.closest('[data-rt-padd]')) { if (!P()) layers.unshift(mkPhoto()); activeLayer = ''; refreshLayers(); draw(); commit('Photo remise dans les calques'); return; }
            const li = e.target.closest('[data-rt-l]'); if (!li) return;
            const id = li.dataset.rtL, l = target(id), name = l?.name; if (!l) return;
            if (e.target.closest('[data-rt-lvis]')) { l.visible = !l.visible; refreshLayers(); draw(); commit(`${name} ${l.visible ? 'montré' : 'masqué'}`); return; }
            if (e.target.closest('[data-rt-gopen]')) { l.open = l.open === false; refreshLayers(); return; }
            if (e.target.closest('[data-rt-madd]')) {
                // ⌥ / Alt + clic, comme dans Photoshop : un masque négatif (tout caché, ou la sélection cachée) ; on peint ensuite en ⬜ pour montrer
                if (e.altKey) { addMaskTo(id, selId ? [{type: 'sel', mask: selId, invert: true}] : [{type: 'all', mode: 'hide'}]); setMode('brush'); commit(`Masque qui cache ${selId ? 'la sélection' : 'tout'} ajouté à ${name}`); toast(selId ? 'Masque ajouté : la sélection est cachée.' : 'Masque ajouté : tout est caché ; peins en ⬜ pour montrer.'); return; }
                addMaskTo(id, []); setMode('brush'); commit(`Masque ajouté à ${name}`); toast('Masque ajouté : peins en ⬛ pour cacher, en ⬜ pour montrer.'); return;
            }
            if (e.target.closest('[data-rt-medit]') && e.shiftKey) { l.maskOff = !l.maskOff; refreshLayers(); draw(); commit(`Masque de ${name} ${l.maskOff ? 'désactivé' : 'réactivé'}`); return; } // comme Photoshop
            if (e.target.closest('[data-rt-medit]') && e.altKey) { maskShow = maskShow?.id === id && maskShow.mode === 'alone' ? null : {id, mode: 'alone'}; refreshLayers(); draw(); if (maskShow) toast('Masque seul : blanc = montré, noir = caché (⌥ + clic pour revenir)'); return; }
            if (e.target.closest('[data-rt-medit]')) { maskEdit = maskEdit === id ? '' : id; activeLayer = id === 'photo' ? '' : id; if (maskEdit) setMode('brush'); else setMode(mode); refreshLayers(); return; }
            if (e.target.closest('[data-rt-minv]')) { l.mask = [...l.mask, {type: 'invert'}]; refreshLayers(); draw(); commit(`Masque de ${name} inversé`); return; }
            if (e.target.closest('[data-rt-mdel]')) { l.mask = null; if (maskEdit === id) maskEdit = ''; setMode(mode); refreshLayers(); draw(); commit(`Masque de ${name} retiré`); return; }
            const loc = locate(id);
            if (e.target.closest('[data-rt-patedit]')) { activeLayer = id; maskEdit = ''; refreshLayers(); return patDialog(); }
            if (e.target.closest('[data-rt-gedit]')) { activeLayer = id; maskEdit = ''; refreshLayers(); if (mode !== 'gradient') setMode('gradient'); return gradDialog(); }
            if (e.target.closest('[data-rt-lstyle]')) { activeLayer = id === 'photo' ? '' : id; refreshLayers(); return styleDialog(id); }
            const sm = e.target.closest('[data-rt-smart]');
            if (sm) { const op = l.ops?.find(o => o.type === 'image'); if (!op) return; const act = sm.dataset.rtSmart;
                if (lockedDeep(l)) return toast('Ce calque est verrouillé.', 'error');
                if (act === 'replace') return placeDialog({l, op});
                if (act === 'orig') { const src = masks.get(op.mask), nw = op.nw || src?.width, nh = op.nh || src?.height; if (!nw) return; const cx = op.x + op.w / 2, cy = op.y + op.h / 2; op.w = nw / pw; op.h = nh / ph; op.x = cx - op.w / 2; op.y = cy - op.h / 2; op.rot = 0; renderLayer(l); draw(); refreshLayers(); return commit(`« ${l.name} » à sa taille d’origine`); }
                if (act === 'filter') { const a = newAdjust(`✨ Filtre sur « ${l.name} »`), loc = locate(a.id), li = loc.arr.indexOf(l); loc.arr.splice(loc.arr.indexOf(a), 1); const tl = locate(l.id); tl.arr.splice(tl.arr.indexOf(l) + 1, 0, a); a.clip = true; activeLayer = a.id; refreshLayers(); syncControls(); draw(); showTab('filters'); commit('Filtre dynamique'); return toast('Filtre dynamique : choisis un filtre (« ＋ Ajouter un filtre… ») ; il ne touche que cette image, et reste réglable.'); }
                if (act === 'raster') { // H7 : pas de question, « ↶ Annuler » dans le message (ou ⌘Z)
                    const src = layerCanvas(l), c = document.createElement('canvas'); c.width = pw; c.height = ph; c.getContext('2d').drawImage(src, 0, 0); l.ops = [{type: 'image', mask: addMask(c), x: 0, y: 0, w: 1, h: 1, rot: 0, opacity: 1}]; delete l.smart; renderLayer(l); draw(); refreshLayers(); const h0 = hpos; commit(`« ${l.name} » pixellisé`); if (hpos !== h0) undoable(`« ${l.name} » pixellisé : figé à sa taille actuelle (l’agrandir le rendra flou)`); return; }
                return; }
            const lfx = e.target.closest('[data-rt-lfxedit]'); if (lfx) { const i = Number(lfx.dataset.rtLfxedit), f = l.st?.filters?.chain?.[i]; if (!f) return; activeLayer = id; refreshLayers(); syncControls(); return fxDialog(f.t, {node: id, i}); }
            if (e.target.closest('[data-rt-ladj]')) { activeLayer = id; refreshLayers(); syncControls(); const onlyFx = (l.st?.filters?.chain || []).length && JSON.stringify({...l.st, filters: {}}) === JSON.stringify({...adjDefault(), filters: {}}); showTab(onlyFx ? 'filters' : 'adjust'); return; }
            if (e.target.closest('[data-rt-llock]')) { l.locked = !l.locked; refreshLayers(); commit(`${l.name} ${l.locked ? 'verrouillé' : 'déverrouillé'}`); return; }
            if (e.target.closest('[data-rt-ldel]')) {
                if (typeOf(l) === 'group') { loc.arr.splice(loc.arr.indexOf(l), 1, ...l.children); activeLayer = l.children.at(-1)?.id || ''; refreshLayers(); draw(); commit(`Groupe « ${l.name} » supprimé (son contenu reste)`); return; }
                const wasPhoto = typeOf(l) === 'photo', hadOps = !!l.ops?.length, h0 = hpos;
                loc.arr.splice(loc.arr.indexOf(l), 1); layerCanvases.delete(l.id); if (maskEdit === l.id) maskEdit = ''; activeLayer = (loc.arr.at(-1) || loc.parent)?.id || ''; moveSel = null; refreshLayers(); draw(); syncControls(); commit(`${l.name} supprimé`);
                if ((wasPhoto || hadOps) && hpos !== h0) undoable(wasPhoto ? `« ${l.name} » retiré des calques` : `Calque « ${l.name} » supprimé avec ce qui est dessus`); return;
            }
            if (e.target.closest('[data-rt-ldup]') && typeOf(l) === 'photo') { // une copie de la photo (avec ses réglages) sur un calque à part
                const m = blankMask(), mg = m.getContext('2d'); mg.fillStyle = '#fff'; mg.fillRect(0, 0, pw, ph);
                const c = {id: nid('l'), type: 'layer', name: l.name + ' (copie)', visible: true, opacity: 1, locked: false, ops: [{type: 'pixels', mask: addMask(m), dx: 0, dy: 0, opacity: 1}], mask: null};
                loc.arr.splice(loc.arr.indexOf(l) + 1, 0, c); activeLayer = c.id; renderLayer(c); refreshLayers(); draw(); syncControls(); commit(`${l.name} dupliquée`); return;
            }
            if (e.target.closest('[data-rt-ldup]')) { const c = {...rtClone(l), id: nid(typeOf(l)[0]), name: l.name + ' (copie)'}; loc.arr.splice(loc.arr.indexOf(l) + 1, 0, c); activeLayer = c.id; renderLayer(c); refreshLayers(); draw(); commit(`${l.name} dupliqué`); return; }
            if (e.target.closest('[data-rt-lclear]')) { l.ops = []; moveSel = null; renderLayer(l); refreshLayers(); draw(); commit(`${l.name} vidé`); return; }
            const mv = e.target.closest('[data-rt-lmove]');
            if (mv) { const i = loc.arr.indexOf(l), j = i + Number(mv.dataset.rtLmove); if (j < 0 || j >= loc.arr.length) return; [loc.arr[i], loc.arr[j]] = [loc.arr[j], loc.arr[i]]; refreshLayers(); draw(); commit(`${l.name} déplacé`); return; }
            if (!e.target.closest('input,button,select,label')) { activeLayer = l.id === 'photo' ? '' : l.id; if (maskEdit && maskEdit !== l.id) { maskEdit = ''; setMode(mode); } refreshLayers(); syncControls(); if (mode === 'brush' && brushType === 'eraser' && l.id === 'photo') pickTool('eraser'); } // gomme sur la photo : par son masque
        });
        paneLayers.addEventListener('focusin', e => { const li = e.target.closest('[data-rt-l]'); if (li && li.dataset.rtL !== 'photo' && activeLayer !== li.dataset.rtL && e.target.matches('[data-rt-lname]')) { activeLayer = li.dataset.rtL; paneLayers.querySelectorAll('[data-rt-l]').forEach(x => x.classList.toggle('is-active', x === li)); syncControls(); } });
        paneLayers.addEventListener('input', e => { const l = target(e.target.closest('[data-rt-l]')?.dataset.rtL); if (!l) return; if (e.target.matches('[data-rt-lopac]')) { l.opacity = Number(e.target.value) / 100; draw(); } if (e.target.matches('[data-rt-lfill]')) { l.fill = Number(e.target.value) / 100; if (l.fill >= 1) delete l.fill; draw(); } if (e.target.matches('[data-rt-lname]')) { l.name = e.target.value.slice(0, 60) || 'Calque'; syncTarget(); } });
        paneLayers.addEventListener('change', e => {
            const id = e.target.closest('[data-rt-l]')?.dataset.rtL, l = target(id); if (!l) return;
            if (e.target.matches('[data-rt-lopac]')) commit(`Opacité de ${l.name} : ${Math.round(l.opacity * 100)} %`);
            if (e.target.matches('[data-rt-lfill]')) commit(`Fond de ${l.name} : ${Math.round((l.fill ?? 1) * 100)} %`);
            if (e.target.matches('[data-rt-lname]')) { refreshLayers(); commit(`Renommé « ${l.name} »`); }
            if (e.target.matches('[data-rt-lblend]')) { l.blend = e.target.value === 'source-over' ? undefined : e.target.value; draw(); commit(`Fusion de ${l.name} : ${e.target.selectedOptions[0].textContent}`); }
            if (e.target.matches('[data-rt-lclip]')) { l.clip = e.target.checked; refreshLayers(); draw(); commit(`« ${l.name} » ${l.clip ? 'seulement sur l’élément dessous' : 'sur tout ce qui est dessous'}`); }
            if (e.target.matches('[data-rt-lpar]')) {
                const loc = locate(id), g = nodeById(e.target.value); if (!loc) return;
                loc.arr.splice(loc.arr.indexOf(l), 1); (g ? g.children : layers).push(l); if (g) g.open = true;
                refreshLayers(); draw(); commit(g ? `« ${l.name} » rangé dans « ${g.name} »` : `« ${l.name} » sorti du groupe`);
            }
        });
        // ⠿ Glisser-déposer dans l'arbre : au-dessus ou en dessous d'un élément, dans un groupe (milieu de sa ligne, ou sa ligne « groupe vide »)
        let dragId = '';
        const isInside = (n, maybeChild) => { let hit = false; if (typeOf(n) === 'group') walk(n.children, x => { if (x === maybeChild) hit = true; }); return hit; };
        const zoneOf = (li, e) => { if (li.dataset.rtGin) return 'into'; const r = li.getBoundingClientRect(), y = (e.clientY - r.top) / r.height, grp = li.classList.contains('is-group'); return grp && y > 0.3 && y < 0.75 ? 'into' : y < 0.5 ? 'above' : 'below'; };
        const clearDrop = () => paneLayers.querySelectorAll('.drop-above,.drop-below,.drop-into').forEach(x => x.classList.remove('drop-above', 'drop-below', 'drop-into'));
        paneLayers.addEventListener('dragstart', e => { const g = e.target.closest?.('[data-rt-grip]'); if (!g) return; dragId = g.closest('[data-rt-l]').dataset.rtL; e.dataTransfer.setData('text/x-lcnda-layer', dragId); e.dataTransfer.effectAllowed = 'move'; g.closest('li').classList.add('is-dragging'); });
        paneLayers.addEventListener('dragend', () => { dragId = ''; clearDrop(); paneLayers.querySelectorAll('.is-dragging').forEach(x => x.classList.remove('is-dragging')); });
        paneLayers.addEventListener('dragover', e => {
            if (!dragId) return; const li = e.target.closest('li[data-rt-l], li[data-rt-gin]'); if (!li) return;
            const tid = li.dataset.rtGin || li.dataset.rtL, n = nodeById(dragId), tn = nodeById(tid);
            if (tid === dragId || (tn && isInside(n, tn))) { clearDrop(); return; } // pas dans lui-même
            e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearDrop();
            const z = zoneOf(li, e); li.classList.add(z === 'into' ? 'drop-into' : z === 'bottom' ? 'drop-above' : 'drop-' + z);
        });
        paneLayers.addEventListener('dragleave', e => { if (!paneLayers.contains(e.relatedTarget)) clearDrop(); });
        paneLayers.addEventListener('drop', e => {
            if (!dragId) return; const li = e.target.closest('li[data-rt-l], li[data-rt-gin]'); clearDrop(); if (!li) return; e.preventDefault();
            const n = nodeById(dragId), from = locate(dragId); if (!n || !from) return;
            const tid = li.dataset.rtGin || li.dataset.rtL, z = zoneOf(li, e), tn = nodeById(tid);
            if (tn === n || (tn && isInside(n, tn))) return;
            from.arr.splice(from.arr.indexOf(n), 1);
            let where = '';
            if (z === 'bottom' || !tn) { layers.unshift(n); where = 'tout en bas'; }
            else if (z === 'into') { tn.children.push(n); tn.open = true; where = `dans « ${tn.name} »`; }
            else { const to = locate(tn.id), i = to.arr.indexOf(tn); to.arr.splice(z === 'above' ? i + 1 : i, 0, n); where = `${z === 'above' ? 'au-dessus de' : 'sous'} « ${tn.name} »`; }
            activeLayer = n.id === 'photo' ? '' : n.id; dragId = ''; refreshLayers(); draw(); commit(`« ${n.name} » rangé ${where}`);
        });
        // le haut des onglets Réglages et Filtres dit ce qu'ils règlent : la photo, ou un calque de réglage
        function syncTarget() {
            const n = adjNode();
            $$('[data-rt-target]').forEach(el => { el.innerHTML = n ? `<span>🎚 Calque de réglage <b>${esc(n.name)}</b> <small>${n.clip ? '(seulement l’élément dessous)' : '(tout ce qui est dessous)'}</small></span><button type="button" class="link-button" data-rt-tophoto>régler la photo</button>` : `<span>🖼 Réglages de <b>la photo</b></span><button type="button" class="link-button" data-rt-toadj title="Réglages et filtres dans un calque à part, qu’on peut masquer, doser ou limiter à un calque">＋ dans un calque de réglage</button>`; el.classList.toggle('is-adj', !!n); });
        }
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-rt-tophoto]')) { activeLayer = ''; refreshLayers(); syncControls(); }
            if (e.target.closest('[data-rt-toadj]')) { newAdjust(); refreshLayers(); syncControls(); draw(); commit('Nouveau calque de réglage'); }
        });
        const showTab = k => { $$('[data-rt-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.rtTab === k)); $$('[data-rt-pane]').forEach(p => { p.hidden = p.dataset.rtPane !== k; }); if (k === 'props') renderProps(); if (k === 'pat') renderPats(); if (k === 'brushes') renderBrushes(); if (k !== 'props' && canvasHook) { hsTool = ''; canvasHook = null; canvas.classList.remove('is-picking'); } };
        $$('[data-rt-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.rtTab)));
        // ── Le panneau de droite s'élargit en glissant son bord (comme dans l'atelier de mise en page) ──
        const SIDE_KEY = 'genealogie-retouch-panel-w', mainEl = $('.h-rt-main');
        // replier / ouvrir le panneau de droite (Réglages, Filtres, Calques, Historique) : gardé pour la prochaine fois
        const setSideClosed = closed => {
            dlg.classList.toggle('rt-side-closed', closed); const tg = $('[data-rt-sidetog]');
            if (tg) { tg.textContent = closed ? '⇤' : '⇥'; tg.title = closed ? 'Ouvrir le panneau (Réglages, Calques…) — Tab' : 'Replier le panneau (plus de place pour la photo) — Tab'; }
            if (closed) mainEl.style.setProperty('--rt-side', '34px'); else { mainEl.style.removeProperty('--rt-side'); try { const w0 = Number(localStorage.getItem(SIDE_KEY)); if (w0) mainEl.style.setProperty('--rt-side', w0 + 'px'); } catch (_) {} }
            try { localStorage.setItem('genealogie-retouch-side-closed', closed ? '1' : ''); } catch (_) {}
            requestAnimationFrame(() => setZoom(zoom));
        };
        $('[data-rt-sidetog]').addEventListener('click', () => setSideClosed(!dlg.classList.contains('rt-side-closed')));
        const setSide = w => { const v = Math.max(260, Math.min(Math.round(window.innerWidth * 0.6), Math.round(w))); mainEl.style.setProperty('--rt-side', v + 'px'); return v; };
        try { const w0 = Number(localStorage.getItem(SIDE_KEY)); if (w0) setSide(w0); } catch (_) {}
        $('[data-rt-resize]').addEventListener('pointerdown', e => {
            e.preventDefault(); const x0 = e.clientX, w0 = $('.h-rt-side').getBoundingClientRect().width, h = e.currentTarget; h.setPointerCapture(e.pointerId); h.classList.add('is-drag');
            const mv = ev => { setSide(w0 + (dlg.classList.contains('rt-side-left') ? ev.clientX - x0 : x0 - ev.clientX)); setZoom(zoom); };
            const up = () => { h.removeEventListener('pointermove', mv); h.classList.remove('is-drag'); try { localStorage.setItem(SIDE_KEY, String(Math.round($('.h-rt-side').getBoundingClientRect().width))); } catch (_) {} };
            h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up, {once: true}); h.addEventListener('pointercancel', up, {once: true});
        });
        $('[data-rt-resize]').addEventListener('dblclick', () => { mainEl.style.removeProperty('--rt-side'); try { localStorage.removeItem(SIDE_KEY); } catch (_) {} setZoom(zoom); });

        // ── Zoom : boutons, molette avec ⌘ / Ctrl (ou pincer), barre d'espace ou ✋ pour se déplacer ──
        let zoom = 1, rtBar = null; // 1 = toute l'image dans le cadre
        const fitScale = () => { const r = stage.getBoundingClientRect(); return Math.max(0.01, Math.min((r.width - 24) / pw, (r.height - 24) / ph)); };
        const placeOver = () => { Object.assign(overlay.style, {left: canvas.offsetLeft + 'px', top: canvas.offsetTop + 'px', width: canvas.offsetWidth + 'px', height: canvas.offsetHeight + 'px'}); syncCrop(); curtain?.place(); try { paintBoard(); } catch (_) {} };
        const setZoom = (z, cx, cy) => {
            const r = stage.getBoundingClientRect(), before = canvas.getBoundingClientRect();
            const ax = cx ?? r.left + r.width / 2, ay = cy ?? r.top + r.height / 2, fx = (ax - before.left) / before.width, fy = (ay - before.top) / before.height;
            zoom = Math.max(0.2, Math.min(40, z));
            const k = fitScale() * zoom; canvas.style.width = pw * k + 'px'; canvas.style.height = ph * k + 'px';
            const after = canvas.getBoundingClientRect();
            stage.scrollLeft += (after.left + fx * after.width) - ax; stage.scrollTop += (after.top + fy * after.height) - ay;
            rtBar?.sync();
            canvas.classList.toggle('is-pixelated', k / scale > 2);
            placeOver();
        };
        // K18 : la barre du bas commune (taille et calque · aide de l'outil · zoom) ; 100 % = un point de l'écran pour un point de la photo
        const UIk = window.LCNDA_UI;
        if (UIk?.editorStatus) {
            rtBar = UIk.editorStatus({zoom: {get: () => fitScale() * zoom * scale, set: k => setZoom(k / (scale * fitScale())), fit: () => setZoom(1), min: .02, max: 16}});
            dlg.appendChild(rtBar); rtBar.setWhere(`${img.naturalWidth} × ${img.naturalHeight} px`);
            const hp = $('[data-rt-paint-help]'); if (hp) { hp.classList.add('ed-old-hidden'); const mirror = () => rtBar.setHelp(hp.textContent); new MutationObserver(mirror).observe(hp, {childList: true, characterData: true, subtree: true}); mirror(); }
        }
        stage.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); }, {passive: false});
        const ro = new ResizeObserver(() => setZoom(zoom)); ro.observe(stage);
        // ◧ Avant / après en rideau : l'original par-dessus, coupé là où on glisse la ligne
        curtain = ext.rtCurtain({host: wrap, target: canvas, before: baseData, onChange: S0 => { $('[data-rt-curtain]').classList.toggle('is-active', S0.on); $('[data-rt-curdir]').hidden = $('[data-rt-curexp]').hidden = !S0.on; $('[data-rt-curdir]').textContent = S0.vertical ? '⇅' : '⇆'; $('[data-rt-curdir]').title = S0.vertical ? 'Rideau horizontal' : 'Rideau vertical'; }});
        $('[data-rt-curtain]').addEventListener('click', () => curtain.toggle());
        $('[data-rt-curdir]').addEventListener('click', () => curtain.setVertical(!curtain.vertical));
        $('[data-rt-curexp]').addEventListener('click', () => cmd('export:ba'));

        // ── Outils ──
        let ch = {weight: 400, style: 'Regular', lead: 0, track: 0, kern: 'auto', hs: 100, vs: 100, shift: 0, caps: '', pos: '', under: false, strike: false, align: 'left', aa: 'smooth', tsize: 0}; // 🔤 Caractère
        let mode = 'adjust', brush = 18, hard = 55, opac = 100, brushType = 'round', color = '#000000', font = RT_FONTS[0][0], halo = true, aligned = true, haloColor = '#ffffff', haloW = 1, shadow = false, shadowColor = '#000000';
        let bold = false, italic = false, shapeKind = 'rect', shapeFill = false, fillColor = '#ffffff', tol = 24, contig = true, maskMode = 'hide';
        let cloneOff = null, cloneSrc = null, picking = false, painting = null, panning = null, spaceDown = false, drag = null, poly = null, polyHover = null;
        const brushEl = $('[data-rt-brush]'), srcEl = $('[data-rt-src]'), help = $('[data-rt-paint-help]');
        const HELP = {adjust: '', hand: 'Glisse pour te déplacer dans l’image zoomée (la barre d’espace fait pareil avec n’importe quel outil).',
            move: 'Clique sur un trait, une forme, un texte ou une zone copiée d’un calque, puis glisse-le. ⌫ le supprime, double-clic sur un texte pour le réécrire.',
            marquee: 'Glisse pour sélectionner un rectangle (⇧ en plus : ajouter, ⌥ : enlever). Les réglages de la barre agissent ensuite sur la sélection.',
            ellipsesel: 'Glisse pour sélectionner un ovale (⇧ : ajouter, ⌥ : enlever).',
            lasso: 'Entoure à main levée la zone à sélectionner (⇧ : ajouter, ⌥ : enlever).',
            polysel: 'Plume : clique point par point autour de la zone ; double-clic, Entrée ou clic sur le premier point pour fermer. Échap : abandonner.',
            wand: 'Clique sur une couleur : tous les points voisins de teinte proche sont sélectionnés (Tolérance). ⇧ : ajouter, ⌥ : enlever.',
            crop: 'Glisse les poignées du cadre (ou trace un nouveau cadre), choisis des proportions, redresse avec le curseur, puis « ✓ Valider ».',
            zoom: 'Clic : zoomer ici · ⌥ + clic : reculer · ou glisse pour zoomer sur une zone.',
            persp: 'Glisse les 4 coins sur les coins de la photo, du document ou de la façade prise de biais, puis « ✓ Valider » : elle est remise à plat. À faire de préférence avant les corrections de taches.',
            shape: 'Glisse pour tracer la forme sur le calque choisi (⇧ : carré, cercle ou angle droit).',
            gradient: 'Glisse du début à la fin du dégradé (⇧ : tous les 45°) : il va sur un calque « Dégradé » (dans la sélection s’il y en a une ; sur le masque choisi, il fond le calque). Tire ensuite ses ronds pour l’ajuster ; clic sur la barre colorée pour changer ses couleurs.',
            heal: 'Clique sur une tache, une poussière ou une rayure : elle est remplacée par ce qui l’entoure. Pour une rayure, glisse le long. Zoome (⌘ + molette) pour être précis.',
            clone: '« Choisir l’endroit à recopier » (ou ⌥ + clic), puis peins sur la zone à couvrir. « Aligné » : la source suit ton pinceau d’un trait à l’autre. Avec une sélection : glisse pour poser une copie de la zone ailleurs.',
            brush: 'Peins sur le calque choisi (Calques) : annoter, entourer, flécher à la main. La gomme efface ce qui a été peint, jamais la photo.',
            mask: 'Tu peins le MASQUE du calque : ⬛ cacher, ⬜ montrer. Rien n’est effacé. Clique sur la vignette du masque (Calques) pour revenir au calque.',
            text: 'Clique dans l’image à l’endroit du texte, écris, puis Entrée (⇧ + Entrée pour aller à la ligne).',
            repair: 'Peins sur le pli, la rayure ou la déchirure (en rouge pendant le geste) : au lâcher, la zone est refaite d’après ce qui l’entoure. Zoome pour être précis ; « 🔍 Repérer les plis » les trouve tout seul.',
            idphoto: 'Glisse les deux ronds sur les yeux si besoin : le cadre suit (yeux à l’horizontale, toujours à la même hauteur). Règle la marge dans le panneau, puis « ✓ Recadrer » ou « 👤 Utiliser comme portrait ».'};
        const SELTOOLS = ['marquee', 'ellipsesel', 'lasso', 'polysel', 'wand'];
        const OPTS = {heal: ['size'], repair: ['size', 'repair'], idphoto: [], clone: ['size', 'hard', 'clone'], brush: ['size', 'opacity', 'brush', 'color', 'swatches'], text: ['size', 'opacity', 'color', 'swatches', 'font', 'textstyle'], hand: [], adjust: [], move: ['font'], zoom: [],
            marquee: ['sel'], ellipsesel: ['sel'], lasso: ['sel'], polysel: ['sel'], wand: ['wand', 'sel'], crop: ['crop'], persp: ['persp'], shape: ['shape', 'size', 'opacity', 'color', 'swatches'], gradient: ['gradient', 'opacity'], mask: ['size', 'hard', 'opacity', 'maskmode']};
        const optsFor = m => m === 'brush' && maskEdit ? 'mask' : m;
        const setMode = m => {
            const changed = m !== mode; // le même outil redemandé (rafraîchir) ne change pas d'onglet
            if (leveling) { leveling = false; levelLine = null; wrap.classList.remove('is-leveling'); } // 📐 redresser l'horizon : un autre outil l'arrête
            if (m === 'crop' && mode !== 'crop') startCrop();
            if (m === 'persp' && mode !== 'persp') { persp = st.persp ? st.persp.map(p => [...p]) : [[0.06, 0.06], [0.94, 0.06], [0.94, 0.94], [0.06, 0.94]]; if (st.persp) { const s0 = st.persp; st.persp = null; srcData.data.set(baseData.data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++; photoKey = ''; st._persp0 = s0; } }
            if (m !== 'persp' && mode === 'persp' && st._persp0 !== undefined) { if (!st.persp) st.persp = st._persp0; delete st._persp0; applyBase(); } // abandon : on remet la perspective d'avant
            if (m !== 'crop' && mode === 'crop') endCrop(true); // changer d'outil garde le cadre (Échap l'abandonne)
            mode = m; picking = false; poly = null; drag = null;
            const om = optsFor(m);
            // la gomme est le pinceau en mode « Gomme » : c'est son bouton qui s'allume, pas celui du pinceau
            const isOn = k => k === 'eraser' ? m === 'brush' && brushType === 'eraser' : k === m && !(m === 'brush' && brushType === 'eraser');
            $$('[data-rt-mode]').forEach(b => { if (b.hasAttribute('data-rt-v')) b.classList.toggle('is-on', isOn(b.dataset.rtMode)); else b.classList.toggle('secondary', !isOn(b.dataset.rtMode)); });
            $('[data-rt-opts]').hidden = !OPTS[om].length && !HELP[om];
            $$('[data-rt-opts] [data-o]').forEach(el => { el.hidden = !OPTS[om].includes(el.dataset.o); });
            help.textContent = HELP[om] || '';
            canvas.classList.toggle('is-painting', ['heal', 'repair', 'clone', 'brush'].includes(m) && !(m === 'clone' && selId));
            if (m !== 'idphoto' && idp) { idp = null; dlg.querySelector('.h-rt-idp')?.remove(); } canvas.classList.toggle('is-text', m === 'text'); stage.classList.toggle('is-hand', m === 'hand');
            canvas.dataset.tool = m;
            brushEl.hidden = true; srcEl.hidden = true;
            if (m === 'gradient') { try { syncGrad(); } catch (_) {} if (changed) showTab('layers'); }
            if (['brush', 'text', 'shape'].includes(m) && !maskEdit) { // le calque ✨ Retouches garde les corrections de la photo : on dessine à côté, sur un calque à soi
                const textOnly = l => !!l?.ops?.length && l.ops.every(o => o.type === 'text'); // un calque de texte (comme dans Photoshop) : le pinceau et les formes vont ailleurs
                const own = () => drawLayers().filter(l => !l.restorePatch && (m === 'text' || !textOnly(l)));
                if (!own().length) { const keep = activeLayer; if (nodeById(keep)?.restorePatch || textOnly(nodeById(keep))) activeLayer = ''; newLayer('Annotations'); refreshLayers(); commit('Calque « Annotations » créé'); }
                const cur = nodeById(activeLayer);
                if (!cur || (changed && typeOf(cur) === 'layer' && (cur.restorePatch || (m !== 'text' && textOnly(cur))))) { activeLayer = own().at(-1).id; refreshLayers(); } if (changed) showTab(m === 'text' ? 'char' : 'layers'); }
            if (m === 'adjust' && changed) showTab('adjust');
            syncChips(); draw();
        };
        /** Choisir un outil. 🧽 Gomme = le pinceau « Gomme » : elle efface le calque choisi ; sur la photo d'origine, elle passe
            par un masque qui la cache (comme un calque de fond qu'on ne détruit pas) ; 🖌 revient à la sorte de pinceau d'avant. */
        let brushBeforeEraser = 'round';
        const syncBrushType = () => { const s = $('[data-rt-brushtype]'); if (s) s.value = brushType; };
        const pickTool = k => {
            if (k === 'eraser') {
                if (brushType !== 'eraser') brushBeforeEraser = brushType;
                brushType = 'eraser'; syncBrushType();
                if (!maskEdit && (!activeLayer || activeLayer === 'photo') && P() && !lockedDeep(P())) { // la photo : on la cache au lieu de l'effacer
                    if (!P().mask) { addMaskTo('photo', []); commit('Masque ajouté à la photo (gomme)'); toast('Gomme sur la photo : elle est cachée par un masque, rien n’est effacé. Pour la faire revenir : touche X (⬜ montrer), puis repasse dessus.'); }
                    else { maskEdit = 'photo'; refreshLayers(); }
                }
                if (maskEdit) setMaskMode('hide');
                return setMode('brush');
            }
            if (k === 'brush' && brushType === 'eraser') { brushType = brushBeforeEraser === 'eraser' ? 'round' : brushBeforeEraser; syncBrushType(); }
            setMode(k);
        };
        $$('[data-rt-mode]').forEach(b => b.addEventListener('click', () => pickTool(b.dataset.rtMode)));
        const setSize = v => { brush = Math.max(1, Math.min(200, Math.round(v))); $('[data-rt-size]').value = brush; $('[data-rt-size-out]').textContent = brush; try { if (mode === 'text' || (mode === 'move' && selText())) chSet({tsize: brush, size: brush}); } catch (_) {} }; // (à l'ouverture, avant que le texte soit prêt)
        $('[data-rt-size]').addEventListener('input', e => setSize(Number(e.target.value)));
        $('[data-rt-hard]').addEventListener('input', e => { hard = Number(e.target.value); $('[data-rt-hard-out]').textContent = hard + ' %'; });
        $('[data-rt-opac]').addEventListener('input', e => { opac = Number(e.target.value); $('[data-rt-opac-out]').textContent = opac + ' %'; });
        $('[data-rt-brushtype]').addEventListener('change', e => { brushType = e.target.value; if (brushType === 'tip') ensureTipMask(); if (mode === 'brush') setMode('brush'); }); // « Gomme » choisie ici allume aussi l'outil 🧽
        const setColor = c => { color = c; $('[data-rt-color]').value = c; $('[data-rt-color2]').value = c; syncChips(); try { if (editingTA && editingTA.op.color !== c) { editingTA.op.color = c; editingTA.restyle(); const l = nodeById(moveSel?.layer); if (l) renderLayer(l); } } catch (_) {} };
        const setFill = c => { fillColor = c; $('[data-rt-fill]').value = c; $('[data-rt-fill2]').value = c; syncChips(); };
        /** Les deux carrés de couleur (comme Photoshop). Sur un masque, ils montrent ce que fait le pinceau : ⬛ cacher (devant) ou ⬜ montrer ;
            X intervertit (un coup de gomme sur le masque se repeint ainsi en « montrer »), D remet noir devant (cacher) et blanc derrière. */
        function syncChips() {
            const box = $('.h-rt-fgbg'); if (!box) return; let onMask; try { onMask = !!maskEdit && mode === 'brush'; } catch (_) { return; } // appelé avant que l'outil soit prêt (ouverture)
            const fg = onMask ? (maskMode === 'show' ? '#ffffff' : '#000000') : color, bg = onMask ? (maskMode === 'show' ? '#000000' : '#ffffff') : fillColor;
            box.style.setProperty('--rt-fg', fg); box.style.setProperty('--rt-bg', bg); box.classList.toggle('is-mask', onMask); try { syncGrad(); } catch (_) {} // « premier plan → … » suit les deux carrés
            box.querySelector('.h-rt-ccfg').title = onMask ? `Sur le masque, le pinceau ${maskMode === 'show' ? '⬜ montre (fait revenir ce qui était caché)' : '⬛ cache'} — X pour changer` : 'Couleur de premier plan (pinceau, texte, formes) : clic pour la changer';
        }
        const setMaskMode = m => { maskMode = m; $$('[data-rt-maskmode]').forEach(r => { r.checked = r.value === m; }); syncChips(); };
        const swapColors = () => {
            if (maskEdit && mode === 'brush') { setMaskMode(maskMode === 'show' ? 'hide' : 'show'); toast(maskMode === 'show' ? '⬜ Montrer : le pinceau (ou la gomme) fait revenir ce qui était caché. X pour revenir à ⬛ cacher.' : '⬛ Cacher : le pinceau (ou la gomme) cache. X pour ⬜ montrer.'); return; }
            const c0 = color; setColor(fillColor); setFill(c0);
        };
        const defaultColors = () => { if (maskEdit && mode === 'brush') { setMaskMode('hide'); return; } setColor('#000000'); setFill('#ffffff'); };
        $('[data-rt-ccswap]').addEventListener('click', swapColors);
        $('[data-rt-ccdef]').addEventListener('click', defaultColors);
        $('[data-rt-fill2]').addEventListener('input', e => setFill(e.target.value));
        // sur un masque, les carrés ne choisissent pas une couleur : un clic sur celui de derrière intervertit cacher / montrer
        $$('.h-rt-fgbg input[type=color]').forEach(inp => inp.addEventListener('click', e => {
            e.preventDefault(); const back = inp.matches('[data-rt-fill2]');
            if (maskEdit && mode === 'brush') { if (back) swapColors(); return; }
            // le cadre des couleurs de l'app (Nuances, TLS, RVB, CMJN, pipette), comme partout
            const UI = window.LCNDA_UI; if (!UI?.openColorBox) { try { inp.showPicker(); } catch (_) {} return; }
            UI.openColorBox(inp.closest('label'), {get: () => back ? fillColor : color, set: v => { if (!v) return; back ? setFill(v.slice(0, 7)) : setColor(v.slice(0, 7)); }});
        }));
        $('[data-rt-color]').addEventListener('input', e => setColor(e.target.value));
        $('[data-rt-color2]').addEventListener('input', e => setColor(e.target.value));
        $$('[data-rt-swatch]').forEach(b => b.addEventListener('click', () => setColor(b.dataset.rtSwatch)));
        // E5 : la police se choisit dans la liste unique (polices de l'app, récentes, celles de l'ordinateur)
        const fontBtn = $('[data-rt-fontpick]'), fontName = f => RT_FONTS.find(x => x[0] === f)?.[1] || String(f).split(',')[0].replace(/["']/g, '').trim();
        const setFont = f => { font = f; fontBtn.textContent = `${fontName(f)} ▾`; fontBtn.style.fontFamily = f; syncChar(); };
        fontBtn.addEventListener('click', async () => {
            const UI = window.LCNDA_UI, cur = String(font).split(',')[0].replace(/["']/g, '').trim(); if (!UI?.openFontPicker) return;
            const f = await UI.openFontPicker({value: cur, sample: 'Souvenir de famille'}); if (!f) return;
            setFont(`"${f.replace(/["\\<>]/g, '')}", ${/script|hand|chancery|roundhand|zapfino|calligraph|brush/i.test(f) ? 'cursive' : 'sans-serif'}`);
            const op = moveSel && nodeById(moveSel.layer)?.ops[moveSel.i]; if (op?.type === 'text' && (mode === 'move' || editingTA?.op === op)) { op.font = font; renderLayer(nodeById(moveSel.layer)); draw(); syncChar(); if (editingTA?.op === op) { editingTA.restyle(); editingTA.ta.focus(); } else commit('Police du texte'); }
        });
        // contour et ombre : pour les prochains textes, et pour le texte choisi avec ➤
        const textStyle = () => { const op = moveSel && nodeById(moveSel.layer)?.ops[moveSel.i]; if (op?.type !== 'text') return; op.halo = halo ? haloColor : ''; op.haloW = haloW; op.shadow = shadow ? shadowColor : ''; renderLayer(nodeById(moveSel.layer)); draw(); commit('Style du texte'); };
        $('[data-rt-halo]').addEventListener('change', e => { halo = e.target.checked; textStyle(); });
        $('[data-rt-halocolor]').addEventListener('change', e => { haloColor = e.target.value; halo = true; $('[data-rt-halo]').checked = true; textStyle(); });
        $('[data-rt-halow]').addEventListener('change', e => { haloW = Number(e.target.value); textStyle(); });
        $('[data-rt-shadow]').addEventListener('change', e => { shadow = e.target.checked; textStyle(); });
        $('[data-rt-shadowcolor]').addEventListener('change', e => { shadowColor = e.target.value; shadow = true; $('[data-rt-shadow]').checked = true; textStyle(); });
        $('[data-rt-bold]').addEventListener('change', e => { bold = e.target.checked; chSet({weight: bold ? 700 : 400, style: bold ? (italic ? 'Bold Italic' : 'Bold') : (italic ? 'Italic' : 'Regular')}); });
        $('[data-rt-italic]').addEventListener('change', e => { italic = e.target.checked; chSet({italic, style: `${ch.weight >= 600 ? 'Bold' : 'Regular'}${italic ? ' Italic' : ''}`.replace('Regular Italic', 'Italic')}); });
        // ── 🔤 Caractère : réglages des prochains textes, ou du texte choisi avec ➤ ──
        const selText = () => { const l = moveSel && nodeById(moveSel.layer), op = l?.ops[moveSel.i]; return op?.type === 'text' ? {l, op} : null; };
        /** les réglages du caractère gardés dans un texte (seulement ceux qui changent quelque chose) */
        function chOpFields() { const o = {}; if (ch.lead) o.lead = ch.lead / pw; if (ch.track) o.track = ch.track; if (ch.kern === 'none') o.kern = 'none'; if (ch.hs !== 100) o.hs = ch.hs; if (ch.vs !== 100) o.vs = ch.vs; if (ch.shift) o.shift = ch.shift / pw;
            if (ch.caps) o.caps = ch.caps; if (ch.pos) o.pos = ch.pos; if (ch.under) o.under = true; if (ch.strike) o.strike = true; if (ch.align !== 'left') o.align = ch.align; if (ch.aa === 'none') o.aa = 'none'; ['il', 'ir', 'fi', 'sb', 'sa'].forEach(k => { if (ch[k]) o[k] = ch[k] / pw; }); if (ch.hyph) o.hyph = true; return o; }
        let chCommitT = 0;
        /** change un réglage : pour les prochains textes, et tout de suite sur le texte choisi (une étape d'historique) */
        function chSet(patch) {
            Object.assign(ch, patch); if ('italic' in patch) { italic = patch.italic; delete ch.italic; $('[data-rt-italic]').checked = italic; } if ('weight' in patch) { bold = ch.weight >= 600; $('[data-rt-bold]').checked = bold; }
            const t = selText();
            if (t) { const op = t.op;
                for (const [k, v] of Object.entries(patch)) {
                    if (k === 'size') op.size = v / pw; else if (['lead', 'shift', 'il', 'ir', 'fi', 'sb', 'sa', 'boxW'].includes(k)) { if (v) op[k] = v / pw; else delete op[k]; } else if (k === 'weight') { op.weight = v; op.bold = v >= 600; } else if (k === 'italic' || k === 'style' || k === 'color') op[k] = v;
                    else if (k === 'tsize') continue; else if ((k === 'hs' || k === 'vs') && v === 100) delete op[k]; else if (v === '' || v === false || v === 0 || (k === 'kern' && v === 'auto') || (k === 'align' && v === 'left') || (k === 'aa' && v === 'smooth')) delete op[k]; else op[k] = v; }
                renderLayer(t.l); draw(); if (editingTA?.op === op) editingTA.restyle(); else { clearTimeout(chCommitT); chCommitT = setTimeout(() => commit('Caractère du texte'), 400); } }
            syncChar();
        }
        // les variantes (graisses) d'une famille : celles de l'ordinateur si l'app peut les lire, sinon les graisses habituelles
        let localFaces = null;
        const loadFaces = async (ask = false) => { if (localFaces || typeof window.queryLocalFonts !== 'function') return localFaces;
            try { if (!ask) { const st = (await navigator.permissions?.query({name: 'local-fonts'}))?.state; if (st !== 'granted') return null; } localFaces = await window.queryLocalFonts(); } catch (_) { localFaces = null; } return localFaces; };
        const famOf = f => String(f || '').split(',')[0].replace(/["']/g, '').trim();
        const stylesFor = fam => { const own = (localFaces || []).filter(f => f.family.toLowerCase() === fam.toLowerCase()).map(f => f.style);
            const list = own.length ? [...new Set(own)] : RT_WEIGHTS.flatMap(([w, en, fr]) => [en, `${en} Italic`.replace('Regular Italic', 'Italic')]);
            return list.map(n => ({n, ...rtStyleOf(n)})).sort((a, b) => a.weight - b.weight || a.italic - b.italic); };
        const frStyle = n => own => own ? n : (RT_WEIGHTS.find(w => n.replace(/ ?Italic$/, '') === w[1])?.[2] || 'Normal') + (/Italic/.test(n) ? ' italique' : '');
        function syncChar() {
            const pane = $('[data-rt-pane="char"]'); if (!pane) return; const t = selText(), op = t?.op;
            const cur = op ? {font: op.font || font, style: op.style || (op.italic ? (rtTextWeight(op) >= 600 ? 'Bold Italic' : 'Italic') : rtTextWeight(op) >= 600 ? 'Bold' : 'Regular'), size: Math.round(op.size * pw), lead: op.lead ? Math.round(op.lead * pw) : '', kern: op.kern || 'auto', track: op.track || 0, hs: op.hs || 100, vs: op.vs || 100, shift: op.shift ? Math.round(op.shift * pw) : 0, color: op.color, caps: op.caps || '', pos: op.pos || '', under: !!op.under, strike: !!op.strike, align: op.align || 'left', aa: op.aa || 'smooth', ...Object.fromEntries(['il', 'ir', 'fi', 'sb', 'sa'].map(k => [k, op[k] ? Math.round(op[k] * pw) : 0])), boxW: op.boxW ? Math.round(op.boxW * pw) : '', hyph: !!op.hyph}
                : {...ch, font, size: ch.tsize || brush, lead: ch.lead || '', color, boxW: ''};
            $('[data-rt-chfor]').textContent = op ? (op._editing ? '✍️ Texte en cours d’écriture : chaque réglage s’y applique tout de suite.' : `Texte choisi : « ${String(op.text).slice(0, 30)}${String(op.text).length > 30 ? '…' : ''} »`) : 'Pour les prochains textes. Clique sur un texte (outil Texte ou ➤) pour le changer.';
            const fam = famOf(cur.font), nm = $('[data-rt-chfamname]'); nm.textContent = fontName(cur.font); nm.parentElement.style.fontFamily = cur.font;
            const own = (localFaces || []).some(f => f.family.toLowerCase() === fam.toLowerCase()), sel = $('[data-rt-ch="style"]'), list = stylesFor(fam);
            if (!list.some(x => x.n === cur.style)) list.push({n: cur.style, ...rtStyleOf(cur.style)});
            sel.innerHTML = list.map(x => `<option value="${esc(x.n)}" ${x.n === cur.style ? 'selected' : ''} style="font-family:${esc(cur.font)};font-weight:${x.weight};font-style:${x.italic ? 'italic' : 'normal'}">${esc(frStyle(x.n)(own))}</option>`).join('') + (!own && typeof window.queryLocalFonts === 'function' ? '<option value="__ask">🔎 Lire les variantes de l’ordinateur…</option>' : '');
            const set = (k, v) => { const el = $(`[data-rt-ch="${k}"]`); if (el && document.activeElement !== el) el.value = v; };
            ['size', 'lead', 'kern', 'track', 'hs', 'vs', 'shift', 'color', 'aa', 'il', 'ir', 'fi', 'sb', 'sa', 'boxW'].forEach(k => set(k, cur[k] ?? 0)); $('[data-rt-ch="hyph"]').checked = !!cur.hyph;
            $$('[data-rt-palign]').forEach(b => b.classList.toggle('is-on', b.dataset.rtPalign === cur.align));
            $('[data-rt-ch="boxW"]').disabled = !op;
            $$('[data-rt-chtog]').forEach(b => { const [k, v] = b.dataset.rtChtog.split(':'); b.classList.toggle('is-on', v ? cur[k] === v : !!cur[k]); });
            $$('[data-rt-chalign]').forEach(b => b.classList.toggle('is-on', b.dataset.rtChalign === cur.align || (b.dataset.rtChalign === 'left' && cur.align.startsWith('justify'))));
        }
        $('[data-rt-chfont]').addEventListener('click', () => fontBtn.click());
        $('[data-rt-pane="char"]').addEventListener('change', async e => {
            const el = e.target.closest('[data-rt-ch]'); if (!el) return; const k = el.dataset.rtCh;
            if (k === 'style') { if (el.value === '__ask') { await loadFaces(true); syncChar(); return; } const st0 = rtStyleOf(el.value); return chSet({style: el.value, weight: st0.weight, italic: st0.italic}); }
            if (k === 'kern' || k === 'aa') return chSet({[k]: el.value});
            if (k === 'hyph') return chSet({hyph: el.checked});
            if (k === 'color') { setColor(el.value); return chSet({color: el.value}); }
            let n = Number(String(el.value).replace(',', '.')); if (el.value !== '' && !Number.isFinite(n)) { syncChar(); return; }
            if (el.value !== '' && el.type === 'number') { const lo = el.min === '' ? -Infinity : Number(el.min), hi = el.max === '' ? Infinity : Number(el.max), n2 = Math.min(hi, Math.max(lo, n)); if (n2 !== n) { n = n2; el.value = n; } } // dans les bornes de la case (une taille de 99 999 bloquerait l'aperçu)
            if (k === 'size') { if (!(n > 0)) return; return chSet({tsize: Math.round(n), size: Math.round(n)}); }
            chSet({[k]: el.value === '' ? (k === 'hs' || k === 'vs' ? 100 : 0) : n});
        });
        $('[data-rt-pane="char"]').addEventListener('click', e => {
            const tg = e.target.closest('[data-rt-chtog]'), al = e.target.closest('[data-rt-chalign]');
            const t = selText(), cur = t ? t.op : ch;
            if (tg) { const [k, v] = tg.dataset.rtChtog.split(':'); return chSet({[k]: v ? (cur[k] === v ? '' : v) : !cur[k]}); }
            if (al) return chSet({align: al.dataset.rtChalign});
            const pa = e.target.closest('[data-rt-palign]'); if (pa) return chSet({align: pa.dataset.rtPalign});
            const pg = e.target.closest('[data-rt-chpage]'); if (pg) return chPage(pg.dataset.rtChpage);
            const gl = e.target.closest('[data-rt-gl]'); if (gl) return insertGlyph(gl.dataset.rtGl);
        });
        /** Caractère · ¶ Paragraphe · Ω Glyphes (le même panneau, trois pages comme dans Photoshop) */
        const chPage = k => { $$('[data-rt-chpage]').forEach(b => b.classList.toggle('is-on', b.dataset.rtChpage === k)); $$('[data-chp]').forEach(d => { d.hidden = d.dataset.chp !== k; }); lsSet('genealogie-retouch-chpage', k); if (k === 'glyph') renderGlyphs(); };
        // ── Ω Glyphes ──
        const GL_RECENT = 'genealogie-glyphs-recent', glSel = $('[data-rt-glset]'), glQ = $('[data-rt-glq]');
        glSel.innerHTML = RT_GLYPH_SETS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join(''); glSel.value = ls('genealogie-retouch-glset', 'fr') || 'fr'; if (!glSel.value) glSel.value = 'fr';
        const glFont = () => { const t = selText(); return t?.op.font || font; };
        const glBtn = c => { const cp = c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), nm = RT_GLYPH_NAMES[c]; return `<button type="button" data-rt-gl="${esc(c)}" title="U+${cp}${nm ? ' · ' + esc(nm) : ''}" aria-label="U+${cp}${nm ? ' ' + esc(nm) : ''}">${/\s|\p{Cf}/u.test(c) ? `<small>${nm ? esc(nm.split(' ')[0]) : 'U+' + cp}</small>` : esc(c)}</button>`; };
        function renderGlyphs() {
            const q = glQ.value.trim(), grid = $('[data-rt-glgrid]'); let list;
            if (q) { const m = q.match(/^(?:u\+|0x)?([0-9a-f]{2,6})$/i); list = m ? [String.fromCodePoint(parseInt(m[1], 16))] : [...new Set([...q])]; }
            else list = rtGlyphsOf(glSel.value);
            grid.style.fontFamily = glFont(); $('[data-rt-glrecent]').style.fontFamily = glFont();
            grid.innerHTML = list.map(glBtn).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien trouvé.</span></p>';
            let rec = []; try { rec = JSON.parse(ls(GL_RECENT, '[]')); } catch (_) {}
            $('[data-rt-glrecent]').innerHTML = rec.length ? `<small class="muted">Récents</small>${rec.map(glBtn).join('')}` : '';
        }
        glSel.addEventListener('change', () => { lsSet('genealogie-retouch-glset', glSel.value); glQ.value = ''; renderGlyphs(); });
        glQ.addEventListener('input', renderGlyphs);
        /** un glyphe : dans le texte en cours d'écriture (là où est le curseur), sinon à la fin du texte choisi, sinon copié */
        function insertGlyph(c) {
            let rec = []; try { rec = JSON.parse(ls(GL_RECENT, '[]')); } catch (_) {} lsSet(GL_RECENT, JSON.stringify([c, ...rec.filter(x => x !== c)].slice(0, 16)));
            if (editingTA) { const ta = editingTA.ta; ta.focus(); ta.setRangeText(c, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); renderGlyphs(); return; }
            const t = selText(); if (t && !lockedDeep(t.l)) { t.op.text += c; renderLayer(t.l); draw(); commit(`Glyphe ${c} ajouté`); renderGlyphs(); return; }
            navigator.clipboard?.writeText(c).then(() => toast(`« ${c} » copié : colle-le dans un texte (⌘V).`), () => toast('Choisis d’abord un texte (outil T).', 'error')); renderGlyphs();
        }
        loadFaces().then(() => syncChar()); chPage(ls('genealogie-retouch-chpage', 'char') || 'char');
        $('[data-rt-shape]').addEventListener('change', e => { shapeKind = e.target.value; });
        $('[data-rt-fillon]').addEventListener('change', e => { shapeFill = e.target.checked; });
        /* ⓘ Propriétés (comme Photoshop) : ce qui se règle sur l'élément choisi. La photo ou un calque de réglage : 🎨 Teinte/Saturation ;
           un calque : position et taille, opacité, fond, fusion ; un masque : densité et contour progressif. */
        let hsCh = 'master', hsTool = '', canvasHook = null, hsCommitT = 0;
        const HS = () => { const t = T(); if (!t.hsat) t.hsat = rtHsDefault(); return t.hsat; };
        const hsCur = H => H.colorize ? H.cz : H.ch[hsCh];
        const hsName = () => { const n = adjNode(); return n ? `calque « ${esc(n.name)} »${n.clip ? ' (seulement l’élément dessous)' : ''}` : 'la photo'; };
        const hueOfHex = h => rtHsl(rtHex(h))[0];
        const nearestCh = h => RT_HS_CH.slice(1).reduce((b, c) => Math.abs(((h - c[2] + 540) % 360) - 180) < Math.abs(((h - b[2] + 540) % 360) - 180) ? c : b)[0];
        const pickAt = (x, y) => { const d = canvas.getContext('2d').getImageData(Math.max(0, Math.min(pw - 1, Math.round(x))), Math.max(0, Math.min(ph - 1, Math.round(y))), 1, 1).data; return rtHsl([d[0], d[1], d[2]]); };
        const hsChanged = (label = 'Teinte/Saturation') => { HS().preset = '__custom'; draw(); paintHsBars(); const sel = $('[data-hs-preset]'); if (sel) sel.value = '__custom'; clearTimeout(hsCommitT); hsCommitT = setTimeout(() => commit(label), 350); };
        function hsHtml() {
            const H = T().hsat || rtHsDefault(), cz = H.colorize, cur = cz ? H.cz : H.ch[hsCh], master = hsCh === 'master' || cz;
            const sl = (k, label, mn, mx, cls) => `<div class="h-rt-hsl"><span>${label}</span></div><input type="range" class="h-rt-hsr ${cls}" min="${mn}" max="${mx}" value="${Math.round(cur[k] || 0)}" data-hs="${k}" style="--hc:hsl(${cz ? H.cz.h : RT_HS_CH.find(c => c[0] === hsCh)?.[2] ?? 0},100%,50%)">`;
            return `<section class="h-rt-hs"><div class="h-rt-phead"><span class="h-rt-pico" title="Calque de réglage">🎨</span><b>Teinte/Saturation</b><small>${hsName()}</small></div>
                <label class="h-rt-pline">Préréglage <select data-hs-preset><option value="__custom" ${H.preset === '__custom' ? 'selected' : ''}>Personnalisé</option>${RT_HS_PRESETS.map(([k, l]) => `<option value="${k}" ${(H.preset ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="h-rt-pline"><button type="button" class="h-rt-hsbtn${hsTool === 'target' ? ' is-on' : ''}" data-hs-tool="target" title="Réglage ciblé : appuie sur une couleur de la photo et glisse à droite (plus saturé) ou à gauche (moins) ; avec ⌘ / Ctrl, c’est la teinte qui change" aria-label="Réglage ciblé">👆↔</button><select data-hs-ch ${cz ? 'disabled' : ''}>${RT_HS_CH.map(([k, l]) => `<option value="${k}" ${k === hsCh ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                ${sl('h', 'Teinte', cz ? 0 : -180, cz ? 360 : 180, cz ? 'is-hue0' : 'is-hue')}${sl('s', 'Saturation', cz ? 0 : -100, 100, 'is-sat')}${sl('l', 'Luminosité', -100, 100, 'is-light')}
                <div class="h-rt-pline"><span class="h-rt-hspick" role="group" aria-label="Pipettes de la gamme">${[['pick', '⊙', 'Pipette : la gamme se centre sur la couleur cliquée dans la photo'], ['add', '⊕', 'Ajouter à la gamme la couleur cliquée'], ['sub', '⊖', 'Retirer de la gamme la couleur cliquée']].map(([k, i, t]) => `<button type="button" class="h-rt-hsbtn${hsTool === k ? ' is-on' : ''}" data-hs-tool="${k}" title="${t}" aria-label="${t}" ${cz ? 'disabled' : ''}>💧${i}</button>`).join('')}</span><label class="ui-toggle"><input type="checkbox" data-hs-colorize ${cz ? 'checked' : ''}><i></i><span>Coloriser</span></label></div>
                <div class="h-rt-hsbars"><canvas data-hs-bar="in" width="360" height="12"></canvas><div class="h-rt-hsrg" data-hs-rg ${master ? 'hidden' : ''}>${[0, 1, 2, 3].map(i => `<i data-hs-h="${i}" class="${i === 1 || i === 2 ? 'is-in' : ''}" title="${i === 1 || i === 2 ? 'Bord intérieur : plein effet jusqu’ici' : 'Bord extérieur : l’effet s’éteint ici'}"></i>`).join('')}<b data-hs-band></b></div><canvas data-hs-bar="out" width="360" height="12"></canvas></div>
                <small class="muted" data-hs-rgtxt>${master ? 'Haut : les couleurs avant ; bas : après.' : ''}</small>
                <div class="h-rt-pbtns"><button type="button" class="link-button" data-hs-reset>↺ Remettre comme au départ</button><button type="button" class="link-button" data-rt-tab-go="adjust">🎚 Autres réglages…</button></div></section>`;
        }
        function paintHsBars() {
            const pane = $('[data-rt-pane="props"]'), cin = pane?.querySelector('[data-hs-bar="in"]'); if (!cin) return; const cout = pane.querySelector('[data-hs-bar="out"]');
            const H = T().hsat || rtHsDefault(), P = rtHsPrep(H), gi = cin.getContext('2d'), go = cout.getContext('2d');
            for (let x = 0; x < 360; x++) { const c = rtFromHsl([x, 1, 0.5]); gi.fillStyle = `rgb(${c.map(Math.round)})`; gi.fillRect(x, 0, 1, 12); const o = rtHsPixel(P, ...c); go.fillStyle = `rgb(${o.map(v => Math.round(Math.min(255, Math.max(0, v))))})`; go.fillRect(x, 0, 1, 12); }
            const rgEl = pane.querySelector('[data-hs-rg]'); if (!rgEl || rgEl.hidden || hsCh === 'master') return; const rg = H.rg[hsCh];
            rgEl.querySelectorAll('[data-hs-h]').forEach(el => { el.style.left = `${rg[Number(el.dataset.hsH)] / 360 * 100}%`; });
            const band = rgEl.querySelector('[data-hs-band]'), [a, , , d] = rg; band.style.background = `linear-gradient(90deg, ${Array.from({length: 73}, (_, i) => `rgba(17,17,17,${(0.15 + 0.7 * rtHsWeight(rg, i * 5)).toFixed(2)}) ${(i / 72 * 100).toFixed(1)}%`).join(', ')})`;
            pane.querySelector('[data-hs-rgtxt]').textContent = `Gamme : ${Math.round(a)}° / ${Math.round(rg[1])}° — ${Math.round(rg[2])}° \\ ${Math.round(d)}° (glisse les repères)`;
        }
        function maskPropsHtml(n) {
            const rf = (n.mask || []).find(o => o.type === 'refine') || {density: 1, feather: 0};
            return `<section class="h-rt-pmask"><div class="h-rt-phead"><span class="h-rt-pico">🎭</span><b>Masque</b><small>« ${esc(n.name || 'Photo')} »</small></div>
                <label class="h-rt-slider"><span>Densité <output>${Math.round((rf.density ?? 1) * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round((rf.density ?? 1) * 100)}" data-pm="density"></label>
                <label class="h-rt-slider"><span>Contour progressif <output>${(rf.feather * pw).toFixed(1)} px</output></span><input type="range" min="0" max="250" step="0.5" value="${(rf.feather || 0) * pw}" data-pm="feather"></label>
                <div class="h-rt-pbtns"><button type="button" class="link-button" data-pm-act="paint">🖌 Peindre le masque</button><button type="button" class="link-button" data-pm-act="invert">Inverser</button><button type="button" class="link-button" data-pm-act="off">${n.maskOff ? 'Réactiver' : 'Désactiver'}</button><button type="button" class="link-button" data-pm-act="del">Retirer</button></div></section>`;
        }
        function layerPropsHtml(n) {
            const img = n.ops?.find(o => o.type === 'image'), txt = n.ops?.find(o => o.type === 'text'), gr = n.ops?.find(o => o.type === 'gradient'), pat = n.ops?.find(o => o.type === 'pattern');
            const kind = img ? (n.smart ? '🧩 Objet dynamique' : '🖼 Image') : txt ? '🔤 Calque de texte' : gr ? '▦ Calque de dégradé' : pat ? '▩ Calque de motif' : '🖌 Calque';
            const num = (k, label, v, unit = 'px', step = 1) => `<label class="h-rt-pnum"><span>${label}</span><input type="number" step="${step}" value="${Math.round(v * 10) / 10}" data-pl="${k}"><small>${unit}</small></label>`;
            return `<section class="h-rt-player"><div class="h-rt-phead"><span class="h-rt-pico">${kind.split(' ')[0]}</span><b>${kind.slice(kind.indexOf(' ') + 1)}</b><small>« ${esc(n.name)} »</small></div>
                ${img ? `<div class="h-rt-pgrid">${num('w', 'L', img.w * pw)}${num('h', 'H', img.h * ph)}${num('x', 'X', img.x * pw)}${num('y', 'Y', img.y * ph)}${num('rot', 'Angle', img.rot || 0, '°')}</div><label class="ui-toggle"><input type="checkbox" data-pl-ratio checked><i></i><span>garder les proportions</span></label>` : ''}
                ${txt ? `<div class="h-rt-pbtns"><button type="button" class="button small secondary" data-pl-go="char">🔤 Caractère</button><button type="button" class="button small secondary" data-pl-go="para">¶ Paragraphe</button><button type="button" class="button small secondary" data-pl-go="glyph">Ω Glyphes</button></div>` : ''}
                ${gr ? '<div class="h-rt-pbtns"><button type="button" class="button small secondary" data-pl-go="grad">▦ Modifier le dégradé…</button></div>' : ''}
                ${pat ? '<div class="h-rt-pbtns"><button type="button" class="button small secondary" data-pl-go="pat">▩ Modifier le motif…</button></div>' : ''}
                <label class="h-rt-slider"><span>Opacité <output>${Math.round((n.opacity ?? 1) * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round((n.opacity ?? 1) * 100)}" data-pl="opacity"></label>
                <label class="h-rt-slider"><span>Fond <output>${Math.round((n.fill ?? 1) * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round((n.fill ?? 1) * 100)}" data-pl="fill"></label>
                <label class="h-rt-pline">Fusion <select data-pl="blend">${RT_BLENDS.map(([v, l]) => `<option value="${v}" ${rtBlend(n) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <div class="h-rt-pbtns"><button type="button" class="link-button" data-pl-go="fx">fx Effets…</button><button type="button" class="link-button" data-pl-go="hs" title="Un calque de réglage juste au-dessus, qui ne touche que ce calque">🎨 Teinte/Saturation sur ce calque</button></div></section>`;
        }
        function renderProps() {
            const pane = $('[data-rt-pane="props"]'); if (!pane || pane.hidden) return;
            const n = nodeById(activeLayer), t = n ? typeOf(n) : 'photo', holder = n || P();
            pane.innerHTML = (t === 'photo' || t === 'adjust' ? hsHtml() : t === 'layer' ? layerPropsHtml(n) : `<div class="h-rt-phead"><span class="h-rt-pico">📁</span><b>Groupe</b><small>« ${esc(n.name)} » · ${A().plural(n.children.length, 'élément')}</small></div>`)
                + (holder?.mask ? maskPropsHtml(holder) : '') + (t === 'photo' || t === 'adjust' ? '' : '<p class="muted">Choisis la photo ou un calque de réglage 🎚 (Calques) pour Teinte/Saturation.</p>');
            paintHsBars();
        }
        const refineOf = n => { let rf = n.mask.find(o => o.type === 'refine'); if (!rf) { rf = {type: 'refine', density: 1, feather: 0}; n.mask.push(rf); } return rf; };
        const setHook = k => { hsTool = hsTool === k ? '' : k; canvasHook = hsTool ? hsHooks[hsTool] : null; canvas.classList.toggle('is-picking', !!canvasHook); renderProps(); if (hsTool) toast(hsTool === 'target' ? '👆 Appuie sur une couleur de la photo et glisse à gauche ou à droite (⌘ / Ctrl : la teinte).' : '💧 Clique sur une couleur de la photo.'); };
        const hsHooks = {
            target: {down(x, y) { const [h, s] = pickAt(x, y); const H = HS(); if (H.colorize) { this.base = {...H.cz}; this.k = H.cz; return; } if (!Number.isNaN(h) && s > 0.08) hsCh = nearestCh(h); else hsCh = 'master'; this.k = H.ch[hsCh]; this.base = {...this.k}; renderProps(); },
                move(dx, e) { const k = e.metaKey || e.ctrlKey ? 'h' : 's', H = HS(), lim = k === 'h' ? (H.colorize ? [0, 360] : [-180, 180]) : [-100, 100]; this.k[k] = Math.max(lim[0], Math.min(lim[1], Math.round(this.base[k] + dx / 2))); this.k[k === 'h' ? 's' : 'h'] = this.base[k === 'h' ? 's' : 'h'];
                    const pane = $('[data-rt-pane="props"]'); ['h', 's'].forEach(q => pane.querySelectorAll(`[data-hs="${q}"]`).forEach(el => { el.value = Math.round(this.k[q] || 0); el.dispatchEvent(new Event('input', {bubbles: true})); })); hsChanged(); },
                up() { commit(`Teinte/Saturation : ${RT_HS_CH.find(c => c[0] === hsCh)[1]}`); }},
            pick: {down(x, y) { const [h] = pickAt(x, y); if (Number.isNaN(h)) return toast('C’est un gris : il n’a pas de teinte.', 'error'); const H = HS(); if (hsCh === 'master') hsCh = nearestCh(h); H.rg[hsCh] = rtHsRange(Math.round(h)); renderProps(); hsChanged('Gamme choisie à la pipette'); }},
            add: {down(x, y) { const [h] = pickAt(x, y); if (Number.isNaN(h) || hsCh === 'master') return; const H = HS(), rg = [...H.rg[hsCh]]; if (rtHsWeight(rg, h) >= 1) return;
                const ang = v => ((v - rg[1]) % 360 + 360) % 360, toB = (rg[1] - h + 360) % 360, toC = (h - rg[2] + 360) % 360; void ang;
                if (toB < toC) { const gap = (rg[1] - rg[0] + 360) % 360; rg[1] = (h + 360) % 360; rg[0] = (rg[1] - gap + 360) % 360; } else { const gap = (rg[3] - rg[2] + 360) % 360; rg[2] = (h + 360) % 360; rg[3] = (rg[2] + gap) % 360; }
                H.rg[hsCh] = rg; renderProps(); hsChanged('Gamme agrandie'); }},
            sub: {down(x, y) { const [h] = pickAt(x, y); if (Number.isNaN(h) || hsCh === 'master') return; const H = HS(), rg = [...H.rg[hsCh]]; if (rtHsWeight(rg, h) <= 0) return;
                const dB = (h - rg[1] + 360) % 360, dC = (rg[2] - h + 360) % 360;
                if (dB < dC) { const gap = (rg[1] - rg[0] + 360) % 360; rg[1] = (h + 2) % 360; rg[0] = (rg[1] - gap + 360) % 360; } else { const gap = (rg[3] - rg[2] + 360) % 360; rg[2] = (h - 2 + 360) % 360; rg[3] = (rg[2] + gap) % 360; }
                H.rg[hsCh] = rg; renderProps(); hsChanged('Gamme réduite'); }}};
        const propsPaneEl = $('[data-rt-pane="props"]');
        propsPaneEl.addEventListener('input', e => {
            const el = e.target; const H = () => HS();
            if (el.dataset.hs) { const k = el.dataset.hs, v = Number(el.value); if (!Number.isFinite(v)) return; const cur = hsCur(H()); if (cur[k] === v) return; cur[k] = Math.max(Number(el.min), Math.min(Number(el.max), v)); hsChanged(); return; }
            if (el.dataset.pm) { const n = nodeById(activeLayer) || P(); if (!n?.mask) return; const rf = refineOf(n), v = Number(el.value); if (el.dataset.pm === 'density') { rf.density = v / 100; el.parentElement.querySelector('output').textContent = `${v} %`; } else { rf.feather = v / pw; el.parentElement.querySelector('output').textContent = `${v} px`; } draw(); return; }
            if (el.dataset.pl) { const n = nodeById(activeLayer); if (!n || lockedDeep(n)) return; const k = el.dataset.pl, v = Number(el.value);
                if (k === 'opacity' || k === 'fill') { n[k] = v / 100; if (k === 'fill' && n.fill >= 1) delete n.fill; el.parentElement.querySelector('output').textContent = `${v} %`; draw(); return; }
                const img = n.ops?.find(o => o.type === 'image'); if (!img || !Number.isFinite(v)) return; const ratio = propsPaneEl.querySelector('[data-pl-ratio]')?.checked, ar = img.w * pw / (img.h * ph);
                if (k === 'w' && v > 0) { const cx = img.x + img.w / 2, cy = img.y + img.h / 2; img.w = v / pw; if (ratio) img.h = v / ar / ph; img.x = cx - img.w / 2; img.y = cy - img.h / 2; }
                else if (k === 'h' && v > 0) { const cx = img.x + img.w / 2, cy = img.y + img.h / 2; img.h = v / ph; if (ratio) img.w = v * ar / pw; img.x = cx - img.w / 2; img.y = cy - img.h / 2; }
                else if (k === 'x') img.x = v / pw; else if (k === 'y') img.y = v / ph; else if (k === 'rot') img.rot = v;
                if (k === 'w' || k === 'h') propsPaneEl.querySelectorAll('[data-pl="w"], [data-pl="h"], [data-pl="x"], [data-pl="y"]').forEach(x => { if (x !== el) x.value = Math.round({w: img.w * pw, h: img.h * ph, x: img.x * pw, y: img.y * ph}[x.dataset.pl] * 10) / 10; });
                renderLayer(n); draw(); }
        });
        propsPaneEl.addEventListener('change', e => {
            const el = e.target;
            if (el.matches('[data-hs-preset]')) { if (el.value === '__custom') return; T().hsat = rtHsPreset(el.value); hsCh = 'master'; renderProps(); draw(); return commit(`Teinte/Saturation : ${RT_HS_PRESETS.find(p => p[0] === el.value)[1]}`); }
            if (el.matches('[data-hs-ch]')) { hsCh = el.value; return renderProps(); }
            if (el.matches('[data-hs-colorize]')) { const H = HS(); H.colorize = el.checked; if (el.checked && hsTool && hsTool !== 'target') setHook(hsTool); renderProps(); hsChanged(el.checked ? 'Coloriser' : 'Coloriser : non'); return; }
            if (el.dataset.pm) { commit('Propriétés du masque'); refreshLayers(); return; }
            if (el.dataset.pl) { const n = nodeById(activeLayer); if (!n) return; if (el.dataset.pl === 'blend') { n.blend = el.value; draw(); } refreshLayers(); commit(`Propriétés de « ${n.name} »`); }
        });
        propsPaneEl.addEventListener('click', e => {
            const tool = e.target.closest('[data-hs-tool]'); if (tool) return setHook(tool.dataset.hsTool);
            if (e.target.closest('[data-hs-reset]')) { T().hsat = rtHsDefault(); renderProps(); draw(); return commit('Teinte/Saturation remise à zéro'); }
            const go = e.target.closest('[data-rt-tab-go]'); if (go) return showTab(go.dataset.rtTabGo);
            const pm = e.target.closest('[data-pm-act]'); if (pm) { const n = nodeById(activeLayer) || P(), id = n === P() ? 'photo' : n.id, act = pm.dataset.pmAct;
                if (act === 'paint') { maskEdit = id; setMode('brush'); refreshLayers(); return; }
                if (act === 'invert') { const i = n.mask.findIndex(o => o.type === 'refine'); n.mask.splice(i < 0 ? n.mask.length : i, 0, {type: 'invert'}); draw(); refreshLayers(); renderProps(); return commit('Masque inversé'); }
                if (act === 'off') { n.maskOff = !n.maskOff; draw(); refreshLayers(); renderProps(); return commit(n.maskOff ? 'Masque désactivé' : 'Masque réactivé'); }
                if (act === 'del') { n.mask = null; if (maskEdit === id) maskEdit = ''; draw(); refreshLayers(); renderProps(); return commit('Masque retiré'); } }
            const pg = e.target.closest('[data-pl-go]'); if (pg) { const n = nodeById(activeLayer), k = pg.dataset.plGo;
                if (k === 'char' || k === 'para' || k === 'glyph') { const op = n?.ops?.find(o => o.type === 'text'); if (op) { moveSel = {layer: n.id, i: n.ops.indexOf(op)}; draw(); } showTab('char'); chPage(k); syncChar(); return; }
                if (k === 'grad') return gradDialog();
                if (k === 'pat') return patDialog();
                if (k === 'fx') return styleDialog(n.id);
                if (k === 'hs') { const a = newAdjust(`🎨 Teinte/Saturation sur « ${n.name} »`), la = locate(a.id); la.arr.splice(la.arr.indexOf(a), 1); const tl = locate(n.id); tl.arr.splice(tl.arr.indexOf(n) + 1, 0, a); a.clip = true; a.st.hsat = rtHsDefault(); activeLayer = a.id; refreshLayers(); syncControls(); draw(); renderProps(); return commit('Teinte/Saturation sur un calque'); } }
        });
        // les repères de la gamme (sous la barre des couleurs) : glisser pour l'élargir ou la resserrer
        propsPaneEl.addEventListener('pointerdown', e => {
            const hd = e.target.closest('[data-hs-h]'); if (!hd) return; e.preventDefault(); const i = Number(hd.dataset.hsH), box = hd.parentElement.getBoundingClientRect(), H = HS(), rg = H.rg[hsCh];
            const mv = ev => { rg[i] = Math.round(Math.min(359, Math.max(0, (ev.clientX - box.left) / box.width * 360))); paintHsBars(); draw(); };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); hsChanged('Gamme de couleurs'); };
            addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
        const newHsLayer = () => { const a = newAdjust(`🎨 Teinte/Saturation ${layers.filter(n => typeOf(n) === 'adjust').length + 1}`); a.st.hsat = rtHsDefault(); activeLayer = a.id; hsCh = 'master'; refreshLayers(); syncControls(); draw(); showTab('props'); commit('Nouveau réglage Teinte/Saturation'); };
        /* ▩ Motifs : la bibliothèque (ceux de l'app + les miens), le calque de motif (échelle, angle, décalage, opacité), le créateur de motif */
        const PKEY = 'genealogie-retouch-pattern', PUSER = 'genealogie-patterns', P0 = {id: 'checker', scale: 1, angle: 0, ox: 0, oy: 0, opacity: 1, transp: false};
        let patSt = (() => { try { return {...P0, ...JSON.parse(ls(PKEY, '{}'))}; } catch (_) { return {...P0}; } })();
        const savePat = () => lsSet(PKEY, JSON.stringify(patSt));
        const userPats = () => { try { const v = JSON.parse(ls(PUSER, '[]')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
        const patTarget = () => { const l = nodeById(activeLayer); if (!l || typeOf(l) !== 'layer') return null; const op = l.ops?.find(o => o.type === 'pattern'); return op ? {l, op} : null; };
        const loadImg = url => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = url; });
        /** le carreau d'un motif, en toile (ceux de l'app : avec les couleurs du moment) */
        async function patTile(id) {
            const u = userPats().find(p => p.id === id); if (u) { const im = await loadImg(u.url), c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); return c; }
            return rtPatternTile(id, color, fillColor, patSt.transp);
        }
        const patName = id => userPats().find(p => p.id === id)?.name || RT_PATTERNS.find(p => p[0] === id)?.[1] || 'Motif';
        function renderPats() {
            const pane = $('[data-rt-pane="pat"]'); if (!pane || pane.hidden) return; const t = patTarget(), cur = t ? {...patSt, ...t.op, id: t.op.pid} : patSt;
            const sw = (id, name, url, user) => `<span class="h-rt-patc${id === cur.id ? ' is-on' : ''}"><button type="button" data-pt-pick="${esc(id)}" title="${esc(name)}" aria-label="${esc(name)}" style="background-image:url(${url})"></button>${user ? `<button type="button" class="h-rt-gpredel" data-pt-del="${esc(id)}" title="Supprimer ce motif" aria-label="Supprimer">×</button>` : ''}</span>`;
            const sl = (k, label, mn, mx, v, unit) => `<label class="h-rt-slider"><span>${label} <output>${v}${unit}</output></span><input type="range" min="${mn}" max="${mx}" value="${v}" data-pt="${k}"></label>`;
            pane.innerHTML = `<p class="muted">${t ? `Calque de motif <b>« ${esc(t.l.name)} »</b> : tout se règle ici, tout de suite.` : 'Choisis un motif, puis « Remplir » : il va sur son propre calque (dans la sélection s’il y en a une). Les motifs de l’app prennent tes deux couleurs.'}</p>
                <div class="h-rt-patgrid">${RT_PATTERNS.map(([id, name]) => sw(id, name, rtPatternTile(id, color, fillColor, patSt.transp).toDataURL(), false)).join('')}${userPats().map(p => sw(p.id, p.name, p.url, true)).join('')}</div>
                <label class="ui-toggle"><input type="checkbox" data-pt-transp ${patSt.transp ? 'checked' : ''}><i></i><span>fond transparent (motifs de l’app)</span></label>
                ${sl('scale', 'Échelle', 5, 800, Math.round((cur.scale ?? 1) * 100), ' %')}${sl('angle', 'Angle', -180, 180, Math.round(cur.angle || 0), '°')}${sl('ox', 'Décalage horizontal', 0, 100, Math.round((cur.ox || 0) * 100), ' %')}${sl('oy', 'Décalage vertical', 0, 100, Math.round((cur.oy || 0) * 100), ' %')}${sl('opacity', 'Opacité', 0, 100, Math.round((cur.opacity ?? 1) * 100), ' %')}
                <div class="h-rt-pbtns"><button type="button" class="button small" data-pt-fill>▩ Remplir : nouveau calque de motif</button><button type="button" class="button small secondary" data-pt-make>＋ Créer un motif…</button></div>`;
        }
        const patDialog = () => { showTab('pat'); renderPats(); };
        async function patFill() {
            const tile = await patTile(patSt.id); if (!tile) return;
            const l = newLayer(`Motif ${drawLayers().filter(n => n.patLayer).length + 1}`); l.patLayer = true;
            l.ops = [{type: 'pattern', mask: addMask(tile), pid: patSt.id, refW: pw, scale: patSt.scale, angle: patSt.angle, ox: patSt.ox, oy: patSt.oy, opacity: patSt.opacity, ...(selId ? {clip: selId} : {})}];
            activeLayer = l.id; renderLayer(l); refreshLayers(); draw(); renderPats(); commit(`Motif « ${patName(patSt.id)} » : calque « ${l.name} »`);
        }
        let patCommitT = 0;
        const patPane = $('[data-rt-pane="pat"]');
        patPane.addEventListener('input', e => { const el = e.target.closest('[data-pt]'); if (!el) return; const k = el.dataset.pt, v = Number(el.value), val = k === 'angle' ? v : v / 100;
            el.parentElement.querySelector('output').textContent = `${v}${k === 'angle' ? '°' : ' %'}`; patSt[k] = val; savePat();
            const t = patTarget(); if (t && !lockedDeep(t.l)) { t.op[k] = val; renderLayer(t.l); draw(); clearTimeout(patCommitT); patCommitT = setTimeout(() => commit(`Motif de « ${t.l.name} »`), 400); } });
        patPane.addEventListener('change', e => { if (e.target.matches('[data-pt-transp]')) { patSt.transp = e.target.checked; savePat(); renderPats(); } });
        patPane.addEventListener('click', async e => {
            const pk = e.target.closest('[data-pt-pick]'); if (pk) { patSt.id = pk.dataset.ptPick; savePat(); const t = patTarget(); if (t && !lockedDeep(t.l)) { const tile = await patTile(patSt.id); t.op.mask = addMask(tile); t.op.pid = patSt.id; t.op.refW = pw; renderLayer(t.l); draw(); refreshLayers(); commit(`Motif « ${patName(patSt.id)} » sur « ${t.l.name} »`); } renderPats(); return; }
            const del = e.target.closest('[data-pt-del]'); if (del) { const id = del.dataset.ptDel, msg = `Motif « ${patName(id)} » retiré de la bibliothèque (les calques qui l’utilisent le gardent)`, rm = () => { lsSet(PUSER, JSON.stringify(userPats().filter(p => p.id !== id))); renderPats(); }; if (A().undoLocalChange) A().undoLocalChange(msg, [PUSER], rm, () => renderPats()); else rm(); return; } // H7 : « ↶ Annuler » au lieu d'une question
            if (e.target.closest('[data-pt-fill]')) return patFill();
            if (e.target.closest('[data-pt-make]')) return patMaker();
        });
        /** ▩ Créer un motif : d'après la sélection, le calque choisi ou l'image visible ; raccord sans couture ; aperçu en mosaïque */
        function patMaker() {
            const al = nodeById(activeLayer), hasL = al && typeOf(al) === 'layer' && al.ops?.length;
            const pn = panel('h-rt-patmake', `<header><b>▩ Créer un motif</b><small>Il rejoint la bibliothèque des motifs (gardée sur cet ordinateur).</small></header>
                <label class="h-rt-pline">D’après <select data-pc-src>${selId ? '<option value="sel">la sélection</option>' : ''}${hasL ? `<option value="layer">le calque « ${esc(al.name)} »</option>` : ''}<option value="all">l’image visible</option></select></label>
                <label class="h-rt-slider"><span>Taille du carreau <output>128 px</output></span><input type="range" min="16" max="384" step="8" value="128" data-pc-size></label>
                <label class="ui-toggle"><input type="checkbox" data-pc-seam checked><i></i><span>raccord sans couture (les bords se fondent)</span></label>
                <canvas class="h-rt-patprev" data-pc-prev width="300" height="180"></canvas>
                <label class="h-rt-pline">Nom <input type="text" data-pc-name value="Mon motif ${userPats().length + 1}" maxlength="60"></label>
                <div class="h-rt-fxbtns"><span class="spacer"></span><button type="button" class="button small secondary" data-pc-cancel>Annuler</button><button type="button" class="button small secondary" data-pc-save>Garder</button><button type="button" class="button small" data-pc-fill>Garder et remplir</button></div>`);
            let tile = null;
            const build = () => {
                const src = pn.querySelector('[data-pc-src]').value, size = Number(pn.querySelector('[data-pc-size]').value); pn.querySelector('[data-pc-size]').parentElement.querySelector('output').textContent = `${size} px`;
                const base = src === 'layer' ? layerCanvas(al) : canvas, m = src === 'sel' ? masks.get(selId) : null, bb = m ? maskBox(m) : src === 'layer' ? maskBox(layerCanvas(al)) : null, box = bb || {x: 0, y: 0, w: pw, h: ph};
                const k = Math.min(1, size / Math.max(box.w, box.h)), c = document.createElement('canvas'); c.width = Math.max(4, Math.round(box.w * k)); c.height = Math.max(4, Math.round(box.h * k)); const g = c.getContext('2d');
                g.imageSmoothingQuality = 'high'; g.drawImage(base, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
                if (m) { g.globalCompositeOperation = 'destination-in'; g.drawImage(m, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
                tile = pn.querySelector('[data-pc-seam]').checked ? rtSeamless(c) : c;
                const pv = pn.querySelector('[data-pc-prev]'), pg = pv.getContext('2d'); pg.clearRect(0, 0, pv.width, pv.height); const kk = Math.min(1, 60 / Math.max(tile.width, tile.height)), pat = pg.createPattern(tile, 'repeat'); pat.setTransform(new DOMMatrix().scale(kk)); pg.fillStyle = pat; pg.fillRect(0, 0, pv.width, pv.height);
            };
            build(); pn.addEventListener('input', build); pn.addEventListener('change', build);
            const keep = () => { const name = pn.querySelector('[data-pc-name]').value.trim() || 'Mon motif', id = 'u' + Date.now().toString(36);
                try { lsSet(PUSER, JSON.stringify([...userPats(), {id, name, url: tile.toDataURL('image/png')}])); if (!userPats().some(p => p.id === id)) throw new Error('plein'); } catch (_) { toast('Plus de place pour garder ce motif : supprime des motifs, ou fais-le plus petit.', 'error'); return null; }
                patSt.id = id; savePat(); return id; };
            pn.querySelector('[data-pc-cancel]').addEventListener('click', () => pn.remove());
            pn.querySelector('[data-pc-save]').addEventListener('click', () => { if (keep()) { pn.remove(); patDialog(); toast('Motif gardé dans la bibliothèque ▩.'); } });
            pn.querySelector('[data-pc-fill]').addEventListener('click', async () => { if (keep()) { pn.remove(); showTab('pat'); await patFill(); } });
        }
        /* 🖌 Formes : préréglages, réglages de la forme (comme « Paramètres de forme » de Photoshop), forme d'après la sélection, aperçu du trait */
        const TKEY = 'genealogie-retouch-tip', TUSER = 'genealogie-brush-presets';
        let tipSt = (() => { try { return {...RT_TIP0, ...JSON.parse(ls(TKEY, '{}'))}; } catch (_) { return {...RT_TIP0}; } })(), tipPreset = '';
        delete tipSt.mask; // l'empreinte « Ma forme » est remise dans la retouche à la première utilisation
        const saveTip = () => { const {mask, ...keep} = tipSt; void mask; lsSet(TKEY, JSON.stringify(keep)); };
        const userBrushes = () => { try { const v = JSON.parse(ls(TUSER, '[]')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
        /** « Ma forme » : son image (gardée sur l'ordinateur) remise dans les masques de la retouche */
        const ensureTipMask = async () => { if (tipSt.shape !== 'custom' || (tipSt.mask && masks.get(tipSt.mask))) return; if (!tipSt.customUrl) { tipSt.shape = 'round'; return; } const im = await loadImg(tipSt.customUrl), c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); tipSt.mask = addMask(c); };
        const tipStroke = (cv, tip, col = '#222') => { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([0.06 + t * 0.88, 0.5 + Math.sin(t * Math.PI * 2) * 0.28]); }
            rtDrawTipStroke(g, {type: 'brush', brush: 'tip', tip, color: col, size: Math.min(0.12, 22 / cv.width), opacity: 1, points: pts}, cv.width, cv.height, env()); };
        function renderBrushes() {
            const pane = $('[data-rt-pane="brushes"]'); if (!pane || pane.hidden) return; const t = tipSt;
            const sl = (k, label, mn, mx, unit = ' %', help = '') => `<label class="h-rt-slider"${help ? ` data-help="${esc(help)}"` : ''}><span>${label} <output>${t[k]}${unit}</output></span><input type="range" min="${mn}" max="${mx}" value="${t[k]}" data-tp="${k}"></label>`;
            const pres = [...RT_BRUSH_PRESETS.map(([id, name, o]) => ({id, name, tip: {...RT_TIP0, ...o}})), ...userBrushes().map(u => ({...u, user: true}))];
            pane.innerHTML = `<p class="muted">Clic sur une forme : le pinceau 🖌 la prend. La taille se règle en haut (ou [ et ]).</p>
                <div class="h-rt-bgrid">${pres.map(p => `<span class="h-rt-bpre${p.id === tipPreset ? ' is-on' : ''}"><button type="button" data-tp-pre="${esc(p.id)}" title="${esc(p.name)}" aria-label="${esc(p.name)}"><canvas width="96" height="34" data-tp-cv="${esc(p.id)}"></canvas><small>${esc(p.name)}</small></button>${p.user ? `<button type="button" class="h-rt-gpredel" data-tp-del="${esc(p.id)}" title="Supprimer" aria-label="Supprimer">×</button>` : ''}</span>`).join('')}</div>
                <canvas class="h-rt-bprev" width="300" height="70" data-tp-prev></canvas>
                <label class="h-rt-pline">Forme <select data-tp="shape">${RT_TIP_SHAPES.map(([k, l]) => `<option value="${k}" ${t.shape === k ? 'selected' : ''} ${k === 'custom' && !t.customUrl ? 'disabled' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <details class="h-rt-lsec" open><summary><b>Forme de la pointe</b></summary>${sl('hard', 'Dureté', 0, 100)}${sl('spacing', 'Pas (écart entre les empreintes)', 1, 300, ' %', 'Petit : un trait continu. Grand : des empreintes séparées (étoiles, feuilles).')}${sl('angle', 'Angle', -180, 180, '°')}${sl('round', 'Arrondi', 2, 100, ' %', 'À 100 % la forme est entière ; plus bas, elle est aplatie (plume, pinceau plat).')}<label class="ui-toggle"><input type="checkbox" data-tp="follow" ${t.follow ? 'checked' : ''}><i></i><span>l’angle suit le trait</span></label></details>
                <details class="h-rt-lsec" ${t.sj || t.aj || t.scatter || t.count > 1 ? 'open' : ''}><summary><b>Dynamique et dispersion</b></summary>${sl('sj', 'Variation de taille', 0, 100)}${sl('aj', 'Variation d’angle', 0, 100)}${sl('scatter', 'Dispersion', 0, 400)}${sl('count', 'Nombre par empreinte', 1, 8, '')}</details>
                <details class="h-rt-lsec" ${t.oj || t.cj || t.flow < 100 ? 'open' : ''}><summary><b>Transfert et couleur</b></summary>${sl('flow', 'Flux (chaque empreinte)', 1, 100)}${sl('oj', 'Variation d’opacité', 0, 100)}${sl('cj', 'Variation de couleur', 0, 100)}</details>
                <div class="h-rt-pbtns"><button type="button" class="button small secondary" data-tp-make ${selId ? '' : 'disabled title="Fais d’abord une sélection autour du dessin"'}>＋ Forme d’après la sélection</button><button type="button" class="button small secondary" data-tp-save>Garder comme préréglage</button></div>`;
            pres.forEach(p => { const cv = pane.querySelector(`[data-tp-cv="${CSS.escape(p.id)}"]`); if (cv) { try { tipStroke(cv, p.tip.shape === 'custom' ? {...p.tip, shape: 'round'} : p.tip); } catch (_) {} } });
            paintTipPrev();
        }
        const paintTipPrev = () => { const cv = $('[data-tp-prev]'); if (cv) tipStroke(cv, tipSt, color); };
        const useTip = async () => { await ensureTipMask(); saveTip(); brushType = 'tip'; $('[data-rt-brushtype]').value = 'tip'; if (mode !== 'brush' || maskEdit) { maskEdit = ''; setMode('brush'); showTab('brushes'); } paintTipPrev(); };
        const brPane = $('[data-rt-pane="brushes"]');
        brPane.addEventListener('input', e => { const el = e.target.closest('[data-tp]'); if (!el || el.tagName === 'SELECT') return; const k = el.dataset.tp; tipSt[k] = el.type === 'checkbox' ? el.checked : Number(el.value); const out = el.parentElement.querySelector('output'); if (out) out.textContent = `${el.value}${k === 'angle' ? '°' : k === 'count' ? '' : ' %'}`; tipPreset = ''; brPane.querySelectorAll('.h-rt-bpre.is-on').forEach(x => x.classList.remove('is-on')); useTip(); });
        brPane.addEventListener('change', e => { const el = e.target.closest('select[data-tp]'); if (!el) return; tipSt.shape = el.value; tipPreset = ''; useTip().then(renderBrushes); });
        brPane.addEventListener('click', async e => {
            const pr = e.target.closest('[data-tp-pre]'); if (pr) { const id = pr.dataset.tpPre, b = RT_BRUSH_PRESETS.find(x => x[0] === id), u = userBrushes().find(x => x.id === id);
                tipSt = {...RT_TIP0, ...(b ? b[2] : u.tip), ...(u?.tip.customUrl ? {customUrl: u.tip.customUrl} : tipSt.customUrl ? {customUrl: tipSt.customUrl} : {})}; delete tipSt.mask; tipPreset = id; await useTip(); renderBrushes(); return toast(`🖌 ${b ? b[1] : u.name} : peins sur un calque.`); }
            const del = e.target.closest('[data-tp-del]'); if (del) { lsSet(TUSER, JSON.stringify(userBrushes().filter(x => x.id !== del.dataset.tpDel))); renderBrushes(); return; }
            if (e.target.closest('[data-tp-save]')) { const name = await A().askText({title: 'Garder cette forme de pinceau', message: 'Nom du préréglage :', value: 'Mon pinceau', okLabel: 'Garder'}); if (!name) return; const {mask, ...tip} = tipSt; void mask;
                try { lsSet(TUSER, JSON.stringify([...userBrushes(), {id: 'u' + Date.now().toString(36), name: String(name).slice(0, 40), tip}])); } catch (_) { return toast('Plus de place pour garder ce pinceau.', 'error'); } renderBrushes(); return; }
            if (e.target.closest('[data-tp-make]')) { // ma forme : ce qui est sombre dans la sélection peint (comme « Définir une forme prédéfinie » de Photoshop)
                const m = selId && masks.get(selId), bb = m && maskBox(m); if (!bb) return toast('Fais d’abord une sélection autour du dessin.', 'error');
                const k = Math.min(1, 128 / Math.max(bb.w, bb.h)), w = Math.max(4, Math.round(bb.w * k)), h = Math.max(4, Math.round(bb.h * k)), S = Math.max(w, h), c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
                g.drawImage(canvas, bb.x, bb.y, bb.w, bb.h, (S - w) / 2, (S - h) / 2, w, h); const id = g.getImageData(0, 0, S, S), d = id.data;
                const sm = document.createElement('canvas'); sm.width = sm.height = S; const sg = sm.getContext('2d'); sg.drawImage(m, bb.x, bb.y, bb.w, bb.h, (S - w) / 2, (S - h) / 2, w, h); const sd = sg.getImageData(0, 0, S, S).data;
                for (let i = 0; i < d.length; i += 4) { const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; d[i + 3] = (1 - lum) * d[i + 3] * sd[i + 3] / 255; d[i] = d[i + 1] = d[i + 2] = 255; }
                g.putImageData(id, 0, 0); tipSt = {...tipSt, shape: 'custom', customUrl: c.toDataURL('image/png')}; delete tipSt.mask; tipPreset = ''; await useTip(); renderBrushes(); return toast('🖌 Ta forme est prête : peins avec ; « Garder comme préréglage » pour la retrouver.'); }
        });
        /* ▦ Dégradé : réglages de l'outil (gardés d'une fois sur l'autre), le dégradé du calque choisi, ses poignées, son éditeur */
        const GKEY = 'genealogie-retouch-gradient', GUSER = 'genealogie-gradients', G0 = {kind: 'linear', preset: 'fgbg', stops: null, reverse: false, dither: true, repeat: 'none', interp: 'rgb'};
        let grad = (() => { try { return {...G0, ...JSON.parse(ls(GKEY, '{}'))}; } catch (_) { return {...G0}; } })();
        const saveGrad = () => lsSet(GKEY, JSON.stringify(grad));
        const userPresets = () => { try { const v = JSON.parse(ls(GUSER, '[]')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
        // « premier plan → arrière-plan » et « → transparent » suivent les deux carrés de couleur
        const presetStops = k => k === 'fgbg' ? [{p: 0, c: color, a: 1}, {p: 1, c: fillColor, a: 1}] : k === 'fgtr' ? [{p: 0, c: color, a: 1}, {p: 1, c: color, a: 0}]
            : (() => { const b = RT_GPRESETS.find(x => x[0] === k); if (b?.[2]) return rtGStops(b[2]); const u = userPresets().find(x => x.id === k); return u ? rtClone(u.stops) : null; })();
        const toolStops = () => (grad.preset && presetStops(grad.preset)) || grad.stops || presetStops('fgbg');
        /** Le dégradé qu'on règle : celui du calque choisi (ou de son masque, si on peint le masque) */
        const gradTarget = () => {
            if (maskEdit) { const t = target(maskEdit), i = (t?.mask || []).map(o => o.type).lastIndexOf('gradient'); return i >= 0 ? {holder: t, op: t.mask[i], mask: true} : null; }
            const l = nodeById(activeLayer); if (!l || typeOf(l) !== 'layer') return null; const op = [...(l.ops || [])].reverse().find(o => o.type === 'gradient'); return op ? {holder: l, op, mask: false} : null; };
        const gradRefresh = gt => { if (!gt.mask) renderLayer(gt.holder); draw(); };
        const gradHandles = op => { const a = [op.x1 * pw, op.y1 * ph], b = [op.x2 * pw, op.y2 * ph]; return {a, b, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}; };
        const snap45 = (x0, y0, x, y) => { const a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x - x0, y - y0); return [x0 + Math.cos(a) * L, y0 + Math.sin(a) * L]; };
        const CHECK = 'repeating-conic-gradient(#c9ccd1 0 25%, #fff 0 50%) 0 0/10px 10px';
        const syncGrad = () => {
            const gt = mode === 'gradient' ? gradTarget() : null, o = gt ? gt.op : {...grad, stops: toolStops()};
            const pv = $('[data-rt-gprev] i'); if (pv) pv.style.background = `${rtGradCss(o.stops)}, ${CHECK}`;
            $$('[data-rt-gkind]').forEach(b => b.classList.toggle('is-on', b.dataset.rtGkind === (o.kind || 'linear')));
            $('[data-rt-grev]').checked = !!o.reverse; $('[data-rt-gdith]').checked = !!o.dither;
        };
        // la barre d'options règle le prochain dégradé, et celui du calque choisi s'il en a un (comme les dégradés « en direct » de Photoshop)
        const gradSet = (patch, label) => { Object.assign(grad, patch); saveGrad(); const gt = gradTarget(); if (gt && !lockedDeep(gt.holder)) { Object.assign(gt.op, patch); gradRefresh(gt); refreshLayers(); commit(label); } syncGrad(); };
        $$('[data-rt-gkind]').forEach(b => b.addEventListener('click', () => gradSet({kind: b.dataset.rtGkind}, `Dégradé : ${RT_GKINDS.find(k => k[0] === b.dataset.rtGkind)[2].toLowerCase()}`)));
        $('[data-rt-grev]').addEventListener('change', e => gradSet({reverse: e.target.checked}, 'Dégradé inversé'));
        $('[data-rt-gdith]').addEventListener('change', e => gradSet({dither: e.target.checked}, e.target.checked ? 'Dégradé : tramage' : 'Dégradé : sans tramage'));
        $('[data-rt-gprev]').addEventListener('click', () => gradDialog());
        /** ▦ Nouveau calque de dégradé (Calque → …) : de haut en bas sur toute l'image, puis l'éditeur */
        const newGradLayer = () => {
            const l = newLayer(`Dégradé ${drawLayers().filter(n => n.gradLayer).length + 1}`); l.gradLayer = true;
            l.ops = [{type: 'gradient', kind: grad.kind, x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: rtClone(toolStops()), interp: grad.interp, repeat: grad.repeat, reverse: !!grad.reverse, dither: !!grad.dither, opacity: 1, ...(selId ? {clip: selId} : {})}];
            activeLayer = l.id; maskEdit = ''; renderLayer(l); setMode('gradient'); refreshLayers(); showTab('layers'); draw(); commit(`Calque « ${l.name} »`); gradDialog();
        };
        /** ▦ L'éditeur de dégradé : préréglages, barre des arrêts (couleur + opacité + milieu), forme, mélange, répétition */
        function gradDialog() {
            const gt = mode === 'gradient' || activeLayer ? gradTarget() : null, live = gt && !lockedDeep(gt.holder) ? gt : null;
            const src = live ? live.op : {...grad, stops: toolStops(), opacity: opac / 100}, before = JSON.stringify(live ? live.op : grad);
            const w = {kind: src.kind || 'linear', interp: src.interp || 'rgb', repeat: src.repeat || 'none', reverse: !!src.reverse, dither: !!src.dither, opacity: src.opacity ?? 1, stops: rtGSorted(src.stops)};
            let sel = w.stops[0], preset = live ? '' : grad.preset || '';
            const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
            const pn = panel('h-rt-gedit', `<header><b>▦ Dégradé</b><small>${live ? `« ${esc(live.holder.name || 'la photo')} »${live.mask ? ' · son masque (noir = caché, blanc = montré)' : ''} : tout se voit tout de suite` : 'le prochain dégradé que tu traceras'}</small></header>
                <div class="h-rt-gpresets" data-g-presets></div>
                <div class="h-rt-gbar" data-g-bar><i data-g-strip title="Clic : ajouter un arrêt de couleur à cet endroit"></i><div class="h-rt-gstops" data-g-stops></div></div>
                <small class="muted">Clic sur la barre : un arrêt de plus · glisse un arrêt pour le déplacer, vers le bas pour l’enlever</small>
                <div class="h-rt-gstop" data-g-stop></div>
                <div class="h-rt-gform">
                    <label>Forme <select data-g="kind">${opt(RT_GKINDS.map(([k, i, l]) => [k, `${i} ${l}`]), w.kind)}</select></label>
                    <label data-help="Classique : comme avant. Perceptuel : un passage plus égal à l’œil, sans zone grise ni trop sombre au milieu. Par les teintes : en passant par les couleurs de l’arc-en-ciel.">Mélange <select data-g="interp">${opt([['rgb', 'Classique (RVB)'], ['oklab', 'Perceptuel (plus doux)'], ['hsl', 'Par les teintes']], w.interp)}</select></label>
                    <label>Au-delà des bouts <select data-g="repeat">${opt([['none', 'Couleur des bouts'], ['repeat', 'Répéter'], ['mirror', 'Répéter en miroir']], w.repeat)}</select></label>
                    ${live && !live.mask ? `<label class="h-rt-slider"><span>Opacité <output>${Math.round(w.opacity * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round(w.opacity * 100)}" data-g="opacity"></label>` : ''}
                    <span class="h-rt-gchecks"><label class="ui-toggle"><input type="checkbox" data-g="reverse" ${w.reverse ? 'checked' : ''}><i></i><span>inverser</span></label><label class="ui-toggle" data-help="Un très léger grain qui évite les « marches » visibles dans les dégradés doux."><input type="checkbox" data-g="dither" ${w.dither ? 'checked' : ''}><i></i><span>tramage</span></label></span>
                </div>
                <div class="h-rt-gtools"><button type="button" class="link-button" data-g-flip title="Le début devient la fin">⇄ Retourner les arrêts</button><button type="button" class="link-button" data-g-even>Espacer également</button><button type="button" class="link-button" data-g-save>＋ Garder comme préréglage</button></div>
                <div class="h-rt-fxbtns"><span class="spacer"></span><button type="button" class="button small secondary" data-g-cancel>Annuler</button><button type="button" class="button small" data-g-ok>OK</button></div>`);
            const bar = pn.querySelector('[data-g-bar]'), strip = pn.querySelector('[data-g-strip]'), marks = pn.querySelector('[data-g-stops]'), box = pn.querySelector('[data-g-stop]');
            const apply = () => {
                const patch = {kind: w.kind, interp: w.interp, repeat: w.repeat, reverse: w.reverse, dither: w.dither, stops: rtClone(w.stops.map(({p, c, a, m}) => ({p, c, a, ...(m !== undefined && m !== 0.5 ? {m} : {})})))};
                if (live) { Object.assign(live.op, patch); if (!live.mask) live.op.opacity = w.opacity; gradRefresh(live); }
                else { Object.assign(grad, patch, {preset}); if (preset) grad.stops = null; saveGrad(); }
                syncGrad(); paintBar();
            };
            const paintBar = () => {
                strip.style.background = `${rtGradCss(w.stops)}, ${CHECK}`;
                marks.innerHTML = w.stops.map((s, i) => `<button type="button" class="h-rt-gmk${s === sel ? ' is-on' : ''}" data-g-mk="${i}" style="left:${(s.p * 100).toFixed(2)}%" title="${esc(s.c.toUpperCase())}${s.a < 1 ? ` · ${Math.round(s.a * 100)} %` : ''} à ${Math.round(s.p * 100)} %"><i style="background:linear-gradient(${s.c}, ${s.c}), ${CHECK};opacity:1"><b style="background:${s.c};opacity:${s.a}"></b></i></button>`).join('');
            };
            const paintStop = () => {
                const s = sel, sorted = [...w.stops].sort((a, b) => a.p - b.p), next = sorted[sorted.indexOf(s) + 1];
                box.innerHTML = `<b>Arrêt choisi</b><button type="button" class="ui-color-btn h-rt-gcol" data-g-col title="Couleur de l’arrêt"><span style="background:${s.c}"></span>${esc(s.c.toUpperCase())} ▾</button>
                    <label class="h-rt-slider"><span>Opacité <output>${Math.round(s.a * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round(s.a * 100)}" data-gs="a"></label>
                    <label class="h-rt-gpos">Position <input data-unit="%" type="number" min="0" max="100" step="1" value="${Math.round(s.p * 100)}" data-gs="p"></label>
                    ${next ? `<label class="h-rt-slider" data-help="Où se trouve le mélange à moitié entre cet arrêt et le suivant (le petit losange de Photoshop)."><span>Milieu vers le suivant <output>${Math.round((s.m ?? 0.5) * 100)} %</output></span><input type="range" min="5" max="95" value="${Math.round((s.m ?? 0.5) * 100)}" data-gs="m"></label>` : ''}
                    <button type="button" class="button small secondary" data-g-del ${w.stops.length <= 2 ? 'disabled' : ''}>✕ Enlever cet arrêt</button>`;
            };
            const paintPresets = () => {
                const all = [...RT_GPRESETS.map(([k, l]) => ({id: k, name: l, stops: presetStops(k)})), ...userPresets().map(u => ({...u, user: true}))];
                pn.querySelector('[data-g-presets]').innerHTML = all.map(p => `<span class="h-rt-gpre${p.id === preset ? ' is-on' : ''}"><button type="button" data-g-pre="${esc(p.id)}" title="${esc(p.name)}" aria-label="${esc(p.name)}" style="background:${rtGradCss(p.stops)}, ${CHECK}"></button>${p.user ? `<button type="button" class="h-rt-gpredel" data-g-predel="${esc(p.id)}" title="Supprimer ce préréglage" aria-label="Supprimer">×</button>` : ''}</span>`).join('');
            };
            const edited = () => { preset = ''; paintPresets(); };
            paintPresets(); paintBar(); paintStop();
            // la barre : clic = un arrêt de plus (de la couleur qu'il y a là) ; glisser un arrêt ; tiré vers le bas = enlevé
            bar.addEventListener('pointerdown', e => {
                const r = strip.getBoundingClientRect(), at = ev => Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), mk = e.target.closest('[data-g-mk]');
                let s;
                if (mk) s = w.stops[Number(mk.dataset.gMk)];
                else { const p = at(e), lut = rtGradLut({stops: w.stops, interp: w.interp}), k = Math.round(p * 1023) * 4, hx = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
                    s = {p, c: `#${hx(lut[k])}${hx(lut[k + 1])}${hx(lut[k + 2])}`, a: Math.round(lut[k + 3] / 2.55) / 100}; w.stops.push(s); edited(); }
                sel = s; e.preventDefault(); paintBar(); paintStop(); if (!mk) apply();
                let away = false; const el = () => marks.querySelector(`[data-g-mk="${w.stops.indexOf(s)}"]`);
                const mv = ev => { away = w.stops.length > 2 && ev.clientY - r.bottom > 34; s.p = at(ev); const m = el(); if (m) { m.style.left = `${s.p * 100}%`; m.classList.toggle('is-away', away); } strip.style.background = `${rtGradCss(away ? w.stops.filter(x => x !== s) : w.stops)}, ${CHECK}`; };
                const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
                    if (away) { w.stops.splice(w.stops.indexOf(s), 1); sel = w.stops[0]; } edited(); apply(); paintStop(); };
                addEventListener('pointermove', mv); addEventListener('pointerup', up);
            });
            pn.addEventListener('click', async e => {
                const pre = e.target.closest('[data-g-pre]'); if (pre) { const st0 = presetStops(pre.dataset.gPre); if (!st0) return; w.stops = rtGSorted(st0); sel = w.stops[0]; preset = pre.dataset.gPre; paintPresets(); paintStop(); apply(); return; }
                const del = e.target.closest('[data-g-predel]'); if (del) { lsSet(GUSER, JSON.stringify(userPresets().filter(u => u.id !== del.dataset.gPredel))); if (preset === del.dataset.gPredel) preset = ''; paintPresets(); return; }
                if (e.target.closest('[data-g-col]')) { const s = sel, UI = window.LCNDA_UI; if (!UI?.openColorBox) return; UI.openColorBox(e.target.closest('[data-g-col]'), {get: () => s.c, set: v => { if (!v) return; s.c = v.slice(0, 7); edited(); apply(); paintStop(); }}); return; }
                if (e.target.closest('[data-g-del]')) { if (w.stops.length <= 2) return; w.stops.splice(w.stops.indexOf(sel), 1); sel = w.stops[0]; edited(); apply(); paintStop(); return; }
                if (e.target.closest('[data-g-flip]')) { w.stops.forEach(s => { s.p = 1 - s.p; }); const sorted = [...w.stops].sort((a, b) => a.p - b.p); const ms = sorted.map(s => s.m ?? 0.5); sorted.forEach((s, i) => { const m = ms[sorted.length - 2 - i]; if (m !== undefined) s.m = 1 - m; else delete s.m; }); edited(); apply(); paintStop(); return; }
                if (e.target.closest('[data-g-even]')) { const sorted = [...w.stops].sort((a, b) => a.p - b.p); sorted.forEach((s, i) => { s.p = i / (sorted.length - 1); }); edited(); apply(); paintStop(); return; }
                if (e.target.closest('[data-g-save]')) { const name = await A().askText({title: 'Garder ce dégradé', message: 'Nom du préréglage :', value: 'Mon dégradé', okLabel: 'Garder'}); if (!name) return;
                    const id = 'u' + Date.now().toString(36); lsSet(GUSER, JSON.stringify([...userPresets(), {id, name: String(name).slice(0, 60), stops: rtClone(w.stops)}])); preset = live ? '' : id; paintPresets(); toast(`Préréglage « ${name} » gardé : il reste dans cette liste.`); return; }
                if (e.target.closest('[data-g-cancel]')) { if (live) { const b = JSON.parse(before); Object.keys(live.op).forEach(k => { if (!(k in b)) delete live.op[k]; }); Object.assign(live.op, b); gradRefresh(live); } else { grad = JSON.parse(before); saveGrad(); } pn.remove(); syncGrad(); return; }
                if (e.target.closest('[data-g-ok]')) { pn.remove(); syncGrad(); if (live && JSON.stringify(live.op) !== before) { refreshLayers(); commit(`Dégradé modifié sur « ${live.holder.name || 'la photo'} »`); } }
            });
            pn.addEventListener('input', e => {
                const g = e.target.closest('[data-g]'), gs = e.target.closest('[data-gs]');
                if (g) { const k = g.dataset.g; w[k] = g.type === 'checkbox' ? g.checked : k === 'opacity' ? Number(g.value) / 100 : g.value; const out = g.parentElement.querySelector('output'); if (out) out.textContent = `${g.value} %`; apply(); return; }
                if (gs) { const k = gs.dataset.gs, v = Number(gs.value); if (!Number.isFinite(v)) return; sel[k] = k === 'p' ? Math.min(1, Math.max(0, v / 100)) : v / 100; const out = gs.parentElement.querySelector('output'); if (out) out.textContent = `${gs.value} %`; edited(); apply(); }
            });
        }
        $('[data-rt-fill]').addEventListener('input', e => setFill(e.target.value));
        $('[data-rt-tol]').addEventListener('input', e => { tol = Number(e.target.value); $('[data-rt-tol-out]').textContent = tol; });
        $('[data-rt-contig]').addEventListener('change', e => { contig = e.target.checked; });
        $$('[data-rt-maskmode]').forEach(r => r.addEventListener('change', () => { if (r.checked) { maskMode = r.value; syncChips(); } }));
        $('[data-rt-aligned]').addEventListener('change', e => { aligned = e.target.checked; });
        $('[data-rt-pick]').addEventListener('click', () => { picking = true; help.textContent = 'Clique maintenant à l’endroit à recopier.'; canvas.classList.add('is-picking'); });
        // coordonnées : la toile garde sa taille d'aperçu (pw × ph) ; elle est affichée plus ou moins grande selon le zoom
        const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * pw / r.width, (e.clientY - r.top) * ph / r.height, r.width / pw]; };
        const showBrush = e => {
            const painty = ['heal', 'repair', 'brush'].includes(mode) || (mode === 'clone' && !selId);
            if (!painty || picking) { brushEl.hidden = true; srcEl.hidden = !(mode === 'clone' && cloneSrc && picking === false && !cloneOff); return; }
            const [x, y, k] = toCanvas(e), r = mode === 'brush' && brushType === 'pencil' && !maskEdit ? Math.min(brush, 4) : brush, cr = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
            Object.assign(brushEl.style, {width: r * 2 * k + 'px', height: r * 2 * k + 'px', left: (cr.left - wr.left + x * k - r * k) + 'px', top: (cr.top - wr.top + y * k - r * k) + 'px', borderColor: mode === 'brush' && !maskEdit ? color : ''}); brushEl.hidden = false;
            if (mode === 'clone' && (cloneOff || cloneSrc)) { const sx = cloneOff ? x + cloneOff[0] : cloneSrc[0], sy = cloneOff ? y + cloneOff[1] : cloneSrc[1]; Object.assign(srcEl.style, {left: (cr.left - wr.left + sx * k) + 'px', top: (cr.top - wr.top + sy * k) + 'px'}); srcEl.hidden = false; }
        };
        const dabAt = (x, y) => {
            const g = painting, d = g.dabs, last = d[d.length - 1];
            if (last && Math.hypot(x - last.x * pw, y - last.y * ph) < Math.max(0.6, brush / 4)) return;
            const rec = {x: x / pw, y: y / ph, r: brush / pw};
            if (g.tool === 'heal') { const h = rtHealSource(g.from, pw, ph, x, y, brush); if (!h) return; rtDab(srcData.data, g.from, pw, ph, x, y, h.sx, h.sy, brush, h.offset, 0.35); }
            else { rec.ox = cloneOff[0] / pw; rec.oy = cloneOff[1] / ph; rec.h = hard / 100; rtDab(srcData.data, g.from, pw, ph, x, y, x + cloneOff[0], y + cloneOff[1], brush, null, hard / 100); }
            d.push(rec); strokeVer++; draw();
        };
        // le calque où l'on dessine : celui qui est choisi ; si c'est un groupe ou un réglage, un nouveau calque à cet endroit
        const activeL = () => { const n = nodeById(activeLayer); if (typeOf(n) === 'layer') return n; const l = newLayer(); refreshLayers(); return l; };
        /** ✍️ Écrire un texte (comme Photoshop : chaque nouveau texte est un calque à lui) ou réécrire un texte existant.
            Pendant l'écriture : le texte est le « texte choisi » (l'onglet 🔤 Caractère et la taille de la barre le changent tout de suite),
            il est caché sur l'image et la zone d'écriture le montre à sa place, avec sa police, sa taille, son approche, sa couleur. */
        let editingTA = null;
        const placeText = (x, y, edit = null, boxW = 0) => {
            if (editingTA) editingTA.finish(true);
            let l = edit ? nodeById(edit.layer) : null, op, isNew = !edit;
            if (edit) { if (!l || lockedDeep(l)) return toast('Ce calque est verrouillé : déverrouille-le dans Calques.', 'error'); op = l.ops[edit.i]; }
            else {
                l = newLayer('Texte'); l.textLayer = true; refreshLayers();
                op = {type: 'text', text: '', x: x / pw, y: y / ph, size: (ch.tsize || brush) / pw, color, opacity: opac / 100, font, bold: ch.weight >= 600, italic, weight: ch.weight, style: ch.style, ...chOpFields(), halo: halo ? haloColor : '', haloW, shadow: shadow ? shadowColor : '', ...(boxW ? {boxW: boxW / pw} : {})};
                if (boxW && (op.align === 'center' || op.align === 'right')) delete op.align; // un bloc se place par son bord gauche
                l.ops.push(op);
            }
            const before = edit ? JSON.stringify(op) : '';
            moveSel = {layer: l.id, i: l.ops.indexOf(op)}; activeLayer = l.id; op._editing = true; renderLayer(l); draw(); syncChar(); refreshLayers();
            const ta = document.createElement('textarea'); ta.className = 'h-rt-textinput'; ta.rows = Math.max(1, String(op.text).split('\n').length); ta.value = op.text || ''; ta.spellcheck = false;
            const restyle = () => { const r = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), k = r.width / pw, base = Math.max(1, op.size * pw), size = (op.pos ? base * 0.62 : base) * k, lead = (op.lead ? op.lead * pw : base * 1.2) * k;
                const lines = ta.value.split('\n'); mctx.save(); const bx = rtDrawText(mctx, {...op, text: ta.value || 'M'}, pw, ph, true); mctx.restore();
                Object.assign(ta.style, {left: (r.left - wr.left + bx.x * k) + 'px', top: (r.top - wr.top + op.y * ph * k - (op.shift || 0) * pw * k) + 'px', font: rtTextFont(op, size), lineHeight: lead + 'px', letterSpacing: ((op.track || 0) / 1000 * size) + 'px',
                    color: op.color, textAlign: (op.align || 'left').startsWith('justify') ? 'justify' : op.align || 'left', textAlignLast: op.align === 'justify-all' ? 'justify' : (op.align || '').startsWith('justify-') ? op.align.slice(8) : 'auto', textIndent: (op.fi || 0) * pw * k + 'px', paddingLeft: (op.il || 0) * pw * k + 'px', paddingRight: (op.ir || 0) * pw * k + 'px', hyphens: op.hyph ? 'auto' : 'manual', whiteSpace: op.boxW ? 'pre-wrap' : 'pre', textTransform: op.caps === 'all' ? 'uppercase' : 'none', textDecoration: [op.under ? 'underline' : '', op.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
                    transform: `${op.rot || op.mirror ? (() => { const ox = (op.x * pw - bx.x) * k, oy = (op.shift || 0) * pw * k; return `translate(${ox}px, ${oy}px) rotate(${op.rot || 0}deg) scale(${op.mirror ? -1 : 1}, 1) translate(${-ox}px, ${-oy}px) `; })() : ''}scale(${(op.hs || 100) / 100}, ${(op.vs || 100) / 100})`, transformOrigin: '0 0', paddingTop: '0', paddingBottom: '0', margin: '0', border: '0', outline: '1px dashed #0066cc', outlineOffset: '2px', background: 'rgba(255,255,255,.25)', boxSizing: 'content-box', overflow: 'hidden', resize: 'none',
                    width: (op.boxW ? Math.max(size * 2, (op.boxW * pw - (op.il || 0) * pw - (op.ir || 0) * pw) * k / ((op.hs || 100) / 100)) : Math.max(size * 2, bx.w * k / ((op.hs || 100) / 100) + size)) + 'px', height: Math.max(lead, lines.length * lead, bx.h * k / ((op.vs || 100) / 100)) + 'px', minWidth: '0', minHeight: '0'}); };
            ta.addEventListener('input', () => { op.text = ta.value; restyle(); });
            wrap.appendChild(ta); restyle(); ta.focus(); if (edit) ta.select();
            let over = false;
            const finish = ok => { if (over) return; over = true; editingTA = null; delete op._editing; ta.remove();
                const text = (ok ? ta.value : (edit ? JSON.parse(before).text : '')).replace(/\s+$/, '');
                if (!ok && edit) Object.assign(op, JSON.parse(before), {_editing: undefined}), delete op._editing;
                if (!text.trim()) { const i = l.ops.indexOf(op); if (i >= 0) l.ops.splice(i, 1); if (isNew && !l.ops.length) { const loc = locate(l.id); if (loc) loc.arr.splice(loc.arr.indexOf(l), 1); layerCanvases.delete(l.id); activeLayer = ''; } moveSel = null; renderLayer(l); draw(); refreshLayers(); syncChar(); if (edit && ok) commit('Texte effacé'); return; }
                op.text = text; if (l.textLayer) l.name = 'T ' + text.split('\n')[0].slice(0, 30);
                renderLayer(l); draw(); refreshLayers(); syncChar();
                if (isNew || JSON.stringify(op) !== before) commit(`Texte « ${text.slice(0, 24)}${text.length > 24 ? '…' : ''} »`); };
            editingTA = {ta, op, restyle, finish};
            ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
            // cliquer dans le panneau de droite (🔤 Caractère) ne termine pas l'écriture : on revient dans la zone
            ta.addEventListener('blur', () => setTimeout(() => { if (over) return; const a = document.activeElement; if (a && a.closest?.('.h-rt-side, .h-rt-opts, [data-rt-opts], .ui-fontpick, dialog.ui-fontpick, .ui-colorbox')) return; finish(true); }, 0));
        };
        // ── Sélections : rectangle, ovale, lasso, plume, baguette ; ⇧ ajoute, ⌥ enlève ──
        function selPath(g, d) {
            if (d.kind === 'rect') g.rect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
            else if (d.kind === 'ellipse') g.ellipse((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, Math.abs(d.x1 - d.x0) / 2 || 0.5, Math.abs(d.y1 - d.y0) / 2 || 0.5, 0, 0, Math.PI * 2);
            else d.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        }
        const shapeMask = d => { const c = blankMask(), g = c.getContext('2d'); g.fillStyle = '#000'; g.beginPath(); selPath(g, d); g.closePath(); g.fill(); return c; };
        const combine = (c, how, label = '') => { // how : 'new' | 'add' | 'sub'
            const cur0 = selId && masks.get(selId);
            if (how !== 'new' && cur0) { const r = blankMask(), g = r.getContext('2d'); g.drawImage(cur0, 0, 0); g.globalCompositeOperation = how === 'add' ? 'source-over' : 'destination-out'; g.drawImage(c, 0, 0); c = r; }
            else if (how === 'sub') return; // rien à enlever
            if (isEmpty(c)) { selId = null; } else selId = addMask(c);
            refreshLayers(); setMode(mode); draw(); commit(!selId ? 'Sélection vide' : label || ({add: 'Sélection ajoutée', sub: 'Sélection retirée'}[how] || 'Sélection'));
        };
        const isEmpty = c => { const d = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, pw, ph).data; for (let i = 3; i < d.length; i += 16) if (d[i]) return false; return true; };
        const howOf = e => e.altKey ? 'sub' : e.shiftKey ? 'add' : 'new';
        const maskBox = c => { const d = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, pw, ph).data; let x0 = pw, y0 = ph, x1 = -1, y1 = -1; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (d[(y * pw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1}; };
        const blurMask = (r, thr = null) => { const m = masks.get(selId), c = blankMask(), g = c.getContext('2d'); g.filter = `blur(${r}px)`; g.drawImage(m, 0, 0); if (thr === null) return c; const id = g.getImageData(0, 0, pw, ph); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > thr ? 255 : 0; g.putImageData(id, 0, 0); return c; };
        const finishPoly = () => { if (!poly || poly.length < 3) { poly = null; draw(); return; } const pts = poly; poly = null; polyHover = null; combine(shapeMask({kind: 'poly', pts}), polyHow); };
        let polyHow = 'new';
        // ── ➤ Déplacer : trouver l'élément sous le clic, le glisser ──
        const mctx = document.createElement('canvas').getContext('2d');
        function opBox(op) {
            if (op.type === 'image') return {x: op.x, y: op.y, w: op.w, h: op.h};
            if (op.type === 'shape' || op.type === 'gradient') { const x = Math.min(op.x1, op.x2), y = Math.min(op.y1, op.y2); return {x, y, w: Math.abs(op.x2 - op.x1), h: Math.abs(op.y2 - op.y1)}; }
            if (op.type === 'text') { mctx.save(); const b = rtDrawText(mctx, op, pw, ph, true); mctx.restore(); if (!op.rot) return {x: b.x / pw, y: b.y / ph, w: b.w / pw, h: b.h / ph};
                // tourné avec l'image : la boîte qui contient le texte tourné autour de son point d'accroche
                const ax = op.x * pw, ay = op.y * ph, r = op.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), m = op.mirror ? -1 : 1, P4 = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => { const dx = (x - ax) * m, dy = y - ay; return [ax + dx * cs - dy * sn, ay + dx * sn + dy * cs]; });
                const xs = P4.map(p => p[0]), ys = P4.map(p => p[1]); return {x: Math.min(...xs) / pw, y: Math.min(...ys) / ph, w: (Math.max(...xs) - Math.min(...xs)) / pw, h: (Math.max(...ys) - Math.min(...ys)) / ph}; }
            if (op.erase) return null; // une zone effacée ne se prend pas avec ➤
            if (op.type === 'pixels' || op.type === 'fillmask') { const m = masks.get(op.mask), b = m && (op._bb || (op._bb = maskBox(m))); return b ? {x: b.x / pw + (op.dx || 0), y: b.y / ph + (op.dy || 0), w: b.w / pw, h: b.h / ph} : null; }
            if (op.points?.length) { const xs = op.points.map(p => p[0]), ys = op.points.map(p => p[1]), pad = (op.size || 0) / 2; const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad * pw / ph; return {x, y, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 * pw / ph}; }
            return null;
        }
        const handleSize = () => Math.max(4, 6 * pw / (canvas.getBoundingClientRect().width || pw));
        /** Coins (tournés), milieu du haut et poignée de rotation d'une image placée, en pixels de l'aperçu */
        const imgHandles = op => {
            const cx = (op.x + op.w / 2) * pw, cy = (op.y + op.h / 2) * ph, r = (op.rot || 0) * Math.PI / 180, hw = op.w * pw / 2, hh = op.h * ph / 2;
            const at = (dx, dy) => [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
            return {corners: [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)], topMid: at(0, -hh), rot: at(0, -hh - handleSize() * 5)};
        };
        /** 🖼️ Placer une image : sur un nouveau calque, au centre, ni plus large ni plus haute que 60 % de la photo */
        /* 🧩 Objet dynamique (comme Photoshop) : l'image placée garde son original (jusqu'à 4 000 points de côté) et chaque taille, rotation
           ou déplacement repart de lui : rien ne se perd. « Remplacer » change l'image en gardant sa place ; « Pixelliser » la fige. */
        const placeImage = (img, name = 'Image', target = null) => {
            const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height; if (!nw || !nh) return toast('Image illisible.', 'error');
            const k = Math.min(1, 4000 / Math.max(nw, nh)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(nw * k)); c.height = Math.max(1, Math.round(nh * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            if (target) { const {l, op} = target, cx = op.x + op.w / 2, cy = op.y + op.h / 2; op.mask = addMask(c); op.nw = nw; op.nh = nh; op.h = op.w * pw * nh / nw / ph; op.y = cy - op.h / 2; op.x = cx - op.w / 2; delete op._bb;
                renderLayer(l); draw(); refreshLayers(); commit(`Objet dynamique « ${l.name} » : image remplacée`); return toast('Image remplacée : même place, même taille, même rotation.'); }
            const f = Math.min(0.6 * pw / nw, 0.6 * ph / nh, 1 * pw / nw), w = nw * f / pw, h = nh * f / ph;
            const l = newLayer(String(name).replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 60) || 'Image');
            l.ops.push({type: 'image', mask: addMask(c), x: (1 - w) / 2, y: (1 - h) / 2, w, h, rot: 0, opacity: 1, nw, nh}); l.smart = true;
            activeLayer = l.id; maskEdit = ''; renderLayer(l); setMode('move'); moveSel = {layer: l.id, i: 0}; refreshLayers(); showTab('layers'); draw();
            commit(`Image placée : « ${l.name} »`); toast('Image placée : ➤ glisse-la, tire un coin pour la taille (⇧ : libre), la poignée ronde pour la tourner.');
        };
        const placeFile = file => { if (!file || !/^image\//.test(file.type)) return toast('Ce fichier n’est pas une image.', 'error'); const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { placeImage(im, file.name || 'Image'); URL.revokeObjectURL(u); }; im.onerror = () => { URL.revokeObjectURL(u); toast('Image illisible.', 'error'); }; im.src = u; };
        const placeUrl = (url, name, target = null) => { const im = new Image(); im.onload = () => placeImage(im, name, target); im.onerror = () => toast('Image introuvable.', 'error'); im.src = url; };
        /** 🖼️ Placer une image : la fenêtre unique des médias (une image de l'ordinateur y entre et se coche). */
        async function placeDialog(target = null) {
            const it = await window.LCNDA_PICKER?.openMediaPicker?.({types: ['image'], eyebrow: 'RETOUCHE', title: target ? 'Remplacer l’image de l’objet dynamique' : 'Placer une image', okLabel: target ? 'Remplacer par cette image' : 'Placer cette image',
                intro: target ? 'La nouvelle image prend la place, la taille et la rotation de l’ancienne.' : 'Elle arrive sur un nouveau calque, en objet dynamique 🧩 (agrandir, réduire, tourner sans perte). Tu peux aussi glisser un fichier sur la photo, ou coller une image copiée (⌘V).'});
            if (it?.filename) placeUrl(`media/${encodeURIComponent(it.filename)}`, it.title || it.filename, target);
        }
        // une image glissée depuis l'ordinateur sur la photo, ou collée (⌘V) : placée sur un nouveau calque
        const dropFiles = async files => { const f = files.find(x => /^image\//.test(x.type)); if (!f) return toast('Ce fichier n’est pas une image.', 'error'); placeFile(f); try { await ext.rtImportImage(f); } catch (err) { toast(`Image placée, mais pas rangée dans les médias : ${err.message}`, 'error'); } };
        if (window.LCNDA_UI?.bindFileDrop) window.LCNDA_UI.bindFileDrop(stage, dropFiles, {accept: 'image/*'}); // E4 : la zone s'allume, le fichier entre dans les médias (⌘V aussi)
        else stage.addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); dropFiles([f]); } });
        if (!window.LCNDA_UI?.bindFileDrop) document.addEventListener('paste', function onPaste(e) {
            if (!dlg.isConnected) { document.removeEventListener('paste', onPaste); return; }
            if (!dlg.open || e.target.closest?.('input, textarea, [contenteditable]')) return;
            // une autre fenêtre ouverte PAR-DESSUS la retouche (pas celle d'où elle a été ouverte, ex. la mise en page) garde le collage
            const over = document.activeElement?.closest?.('dialog'); if (over && over !== dlg) return;
            const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); placeFile(f); }
        });
        const hitOp = (x, y) => { const rx = x / pw, ry = y / ph, tolx = 6 / pw * (pw / canvas.getBoundingClientRect().width), toly = tolx * pw / ph;
            for (const l of hitList()) { for (let i = l.ops.length - 1; i >= 0; i--) { const b = opBox(l.ops[i]); if (b && rx >= b.x - tolx && rx <= b.x + b.w + tolx && ry >= b.y - toly && ry <= b.y + b.h + toly && opSolidAt(l.ops[i], x, y)) return {layer: l.id, i}; } }
            return null; };
        // une image (calque ✨ Retouches, zone copiée, image placée) ne se prend que là où elle a des points : ses parties transparentes laissent passer le clic
        const opSolidAt = (op, x, y) => {
            if (op.type !== 'image') return true;
            const c = masks.get(op.mask); if (!c?.width) return true;
            const r = -(op.rot || 0) * Math.PI / 180, cx = (op.x + op.w / 2) * pw, cy = (op.y + op.h / 2) * ph, dx = x - cx, dy = y - cy;
            const u = (dx * Math.cos(r) - dy * Math.sin(r)) / (op.w * pw) + 0.5, v = (dx * Math.sin(r) + dy * Math.cos(r)) / (op.h * ph) + 0.5;
            if (u < 0 || v < 0 || u > 1 || v > 1) return u > -0.02 && v > -0.02 && u < 1.02 && v < 1.02; // tout près du bord : la poignée
            const k = 3, px = Math.min(c.width - 1, Math.floor(u * c.width)), py = Math.min(c.height - 1, Math.floor(v * c.height));
            const d = c.getContext('2d').getImageData(Math.max(0, px - k), Math.max(0, py - k), 2 * k + 1, 2 * k + 1).data; // un petit carré autour du clic
            for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return true;
            return false;
        };
        const moveOp = (op, dx, dy) => {
            if (op.type === 'shape' || op.type === 'gradient') { op.x1 += dx; op.x2 += dx; op.y1 += dy; op.y2 += dy; }
            else if (op.type === 'text' || op.type === 'image') { op.x += dx; op.y += dy; }
            else if (op.type === 'pixels' || op.type === 'fillmask') { op.dx = (op.dx || 0) + dx; op.dy = (op.dy || 0) + dy; }
            else if (op.points) op.points = op.points.map(([px, py]) => [px + dx, py + dy]);
        };
        const delMoveSel = () => { const l = moveSel && nodeById(moveSel.layer); if (!l || lockedDeep(l)) return false; l.ops.splice(moveSel.i, 1); moveSel = null; renderLayer(l); draw(); refreshLayers(); const h0 = hpos; commit(`Élément supprimé de « ${l.name} »`); if (hpos !== h0) undoable(`Élément supprimé de « ${l.name} »`); return true; }; // H7 : « ↶ Annuler » dans le message
        canvas.addEventListener('dblclick', e => { if (mode === 'polysel') { finishPoly(); return; } if (mode !== 'move') return; const [x, y] = toCanvas(e), h = hitOp(x, y); if (!h) return; const op = nodeById(h.layer).ops[h.i]; if (op.type === 'text') { e.preventDefault(); placeText(op.x * pw, op.y * ph, h); } });
        canvas.addEventListener('pointerdown', e => {
            if (mode === 'hand' || spaceDown || e.button === 1) { panning = {x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop}; canvas.setPointerCapture(e.pointerId); e.preventDefault(); return; }
            if (canvasHook) { e.preventDefault(); const [hx, hy] = toCanvas(e), hk = canvasHook; hk.down(hx, hy, e); if (hk.move) { drag = {hook: hk, cx: e.clientX}; canvas.setPointerCapture(e.pointerId); } return; } // ⓘ Propriétés : pipettes, réglage ciblé
            if (mode === 'adjust' || mode === 'crop') return;
            e.preventDefault();
            const [x, y] = toCanvas(e);
            if (mode === 'idphoto') { if (!idp) return; const k = handleSize() * 2.8, i = idp.eyes.findIndex(([ex, ey]) => Math.hypot(ex - x, ey - y) <= k); if (i >= 0) { drag = {idpEye: i}; canvas.setPointerCapture(e.pointerId); } return; }
            if (mode === 'persp') { if (!persp) return; const k = handleSize() * 3, i = persp.findIndex(([px, py]) => Math.hypot(px * pw - x, py * ph - y) <= k); if (i >= 0) { drag = {persp: i}; canvas.setPointerCapture(e.pointerId); } return; }
            if (mode === 'zoom') { drag = {zoom: true, x0: e.clientX, y0: e.clientY, alt: e.altKey}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'text') { if (e.detail > 1) return; const h = hitOp(x, y), op = h && nodeById(h.layer).ops[h.i]; if (op?.type === 'text') return placeText(op.x * pw, op.y * ph, h); drag = {textBox: true, x0: x, y0: y, x1: x, y1: y}; canvas.setPointerCapture(e.pointerId); return; } // un clic : texte simple ; un cadre glissé : bloc de texte (¶)
            if (mode === 'move') {
                const cur = moveSel && nodeById(moveSel.layer)?.ops[moveSel.i];
                if (cur?.type === 'image' && !lockedDeep(nodeById(moveSel.layer))) { // une poignée de l'image choisie : taille ou rotation
                    const hs = imgHandles(cur), k = handleSize() * 2.2, ci = hs.corners.findIndex(([hx, hy]) => Math.hypot(hx - x, hy - y) <= k);
                    if (Math.hypot(hs.rot[0] - x, hs.rot[1] - y) <= k) { drag = {imgRot: true, moved: false}; canvas.setPointerCapture(e.pointerId); return; }
                    if (ci >= 0) { const o = hs.corners[(ci + 2) % 4]; drag = {imgSize: true, anchor: o, ratio: cur.w * pw / (cur.h * ph), moved: false}; canvas.setPointerCapture(e.pointerId); return; }
                }
                moveSel = hitOp(x, y); syncChar(); if (moveSel) { activeLayer = moveSel.layer; refreshLayers(); drag = {move: true, x, y, moved: false}; canvas.setPointerCapture(e.pointerId); }
                draw(); return;
            }
            if (mode === 'marquee' || mode === 'ellipsesel') { drag = {sel: {kind: mode === 'marquee' ? 'rect' : 'ellipse', x0: x, y0: y, x1: x, y1: y}, how: howOf(e)}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'lasso') { drag = {sel: {kind: 'poly', pts: [[x, y]]}, how: howOf(e)}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'polysel') {
                if (!poly) { poly = [[x, y]]; polyHow = howOf(e); draw(); return; }
                const [fx, fy] = poly[0], near = Math.hypot(x - fx, y - fy) * canvas.getBoundingClientRect().width / pw < 9;
                if (near && poly.length > 2) { finishPoly(); return; }
                poly.push([x, y]); draw(); return;
            }
            if (mode === 'wand') { const c = rtWand(pctx.getImageData(0, 0, pw, ph), x, y, tol, contig); combine(c, howOf(e), howOf(e) === 'new' ? 'Sélection automatique' : ''); return; }
            if (mode === 'gradient') {
                const gt = gradTarget();
                if (gt && !lockedDeep(gt.holder)) { // une poignée du dégradé choisi : son début, sa fin, ou le losange du milieu (le tout)
                    const h = gradHandles(gt.op), k = handleSize() * 2.4, which = Math.hypot(h.a[0] - x, h.a[1] - y) <= k ? 'a' : Math.hypot(h.b[0] - x, h.b[1] - y) <= k ? 'b' : Math.hypot(h.m[0] - x, h.m[1] - y) <= k ? 'm' : '';
                    if (which) { drag = {grad: which, gt, x, y, moved: false}; canvas.setPointerCapture(e.pointerId); return; }
                }
                const op = {type: 'gradient', kind: grad.kind, x1: x / pw, y1: y / ph, x2: x / pw, y2: y / ph, stops: rtClone(toolStops()), interp: grad.interp, repeat: grad.repeat, reverse: !!grad.reverse, dither: !!grad.dither, opacity: opac / 100, ...(selId ? {clip: selId} : {})};
                if (maskEdit) { const t = target(maskEdit); if (!t) return; if (lockedDeep(t)) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error'); painting = {tool: 'gradmask', mask: true, layer: t, preview: op, x0: x, y0: y}; }
                else painting = {tool: 'gradient', op, x0: x, y0: y}; // le calque n'est pris (ou créé) qu'une fois le geste commencé : un simple clic ne laisse rien
                canvas.setPointerCapture(e.pointerId); return;
            }
            if (mode === 'shape') {
                const l = activeL(); if (!l) return; if (lockedDeep(l)) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
                painting = {tool: 'shape', layer: l, x0: x, y0: y, preview: {type: 'shape', kind: shapeKind, x1: x / pw, y1: y / ph, x2: x / pw, y2: y / ph, color, fill: shapeFill ? fillColor : '', size: Math.max(1, brush / 6) / pw, opacity: opac / 100}};
                canvas.setPointerCapture(e.pointerId); return;
            }
            if (mode === 'clone' && selId && !(e.altKey || picking) && P() && !lockedDeep(P())) { painting = {tool: 'patch', x0: x, y0: y, patch: {mask: selId, dx: 0, dy: 0}}; canvas.setPointerCapture(e.pointerId); return; }
            if (mode === 'clone') {
                if (e.altKey || picking) { cloneSrc = [x, y]; cloneOff = null; picking = false; canvas.classList.remove('is-picking'); help.textContent = HELP.clone; toast('Endroit à recopier choisi : peins maintenant sur la zone à couvrir.'); return; }
                if (cloneSrc && (!cloneOff || !aligned)) cloneOff = [cloneSrc[0] - x, cloneSrc[1] - y];
                if (!cloneOff) { toast('Choisis d’abord l’endroit à recopier (bouton 🎯 ou ⌥ + clic).', 'error'); return; }
            }
            if (mode === 'brush' && maskEdit) {
                const t = target(maskEdit); if (!t?.mask) { maskEdit = ''; setMode('brush'); return; }
                painting = {tool: 'mask', mask: true, layer: t, preview: {mode: maskMode, points: [[x / pw, y / ph]], size: brush * 2 / pw, soft: hard < 50, opacity: opac / 100}};
                canvas.setPointerCapture(e.pointerId); draw(); return;
            }
            if (mode === 'brush') {
                const l = activeL(); if (!l) return;
                if (lockedDeep(l)) return toast('Ce calque est verrouillé : choisis-en un autre dans Calques.', 'error');
                painting = {tool: 'brush', layer: l, preview: {type: 'brush', brush: brushType, color, size: (brushType === 'pencil' ? Math.min(brush, 4) : brush) * 2 / pw, opacity: opac / 100, points: [[x / pw, y / ph]], ...(brushType === 'tip' ? {tip: (() => { const {customUrl, ...t} = tipSt; void customUrl; return {...t}; })()} : {})}};
                canvas.setPointerCapture(e.pointerId); draw(); return;
            }
            if (!P()) return toast('La photo n’est plus dans les calques : « ↺ Remettre la photo » (onglet Calques).', 'error');
            if (lockedDeep(P())) return toast('La photo est verrouillée (🔒 dans Calques).', 'error');
            if (mode === 'repair') { painting = {tool: 'repair', dabs: []}; canvas.setPointerCapture(e.pointerId); repairDab(x, y); return; }
            painting = {tool: mode, dabs: [], from: new Uint8ClampedArray(srcData.data)};
            canvas.setPointerCapture(e.pointerId); dabAt(x, y);
        });
        canvas.addEventListener('pointermove', e => {
            if (panning) { stage.scrollLeft = panning.l - (e.clientX - panning.x); stage.scrollTop = panning.t - (e.clientY - panning.y); return; }
            showBrush(e);
            const [x, y] = toCanvas(e);
            if (drag?.idpEye !== undefined && idp) { idp.eyes[drag.idpEye] = [Math.min(pw, Math.max(0, x)), Math.min(ph, Math.max(0, y))]; idpUpdate(); return; }
            if (drag?.persp !== undefined && persp) { persp[drag.persp] = [Math.min(1.2, Math.max(-0.2, x / pw)), Math.min(1.2, Math.max(-0.2, y / ph))]; draw(); return; }
            if (poly && !drag) { polyHover = [x, y]; draw(); return; }
            if (drag?.sel) { const d = drag.sel; if (d.kind === 'poly') d.pts.push([x, y]); else { let nx = x, ny = y; if (e.shiftKey && drag.how === 'new') { const s0 = Math.max(Math.abs(x - d.x0), Math.abs(y - d.y0)); nx = d.x0 + Math.sign(x - d.x0 || 1) * s0; ny = d.y0 + Math.sign(y - d.y0 || 1) * s0; } d.x1 = nx; d.y1 = ny; } draw(); return; }
            if ((drag?.imgSize || drag?.imgRot) && moveSel) { // agrandir / réduire (⇧ : sans garder les proportions) ou faire pivoter (⇧ : de 15° en 15°)
                const l = nodeById(moveSel.layer), op = l?.ops[moveSel.i]; if (!op) return;
                const cx = (op.x + op.w / 2) * pw, cy = (op.y + op.h / 2) * ph;
                if (drag.imgRot) { let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90; if (e.shiftKey) a = Math.round(a / 15) * 15; op.rot = Math.round(((a + 540) % 360) - 180); }
                else { // le coin opposé ne bouge pas (calcul dans le repère de l'image, qui peut être tournée)
                    const r = (op.rot || 0) * Math.PI / 180, [ax, ay] = drag.anchor, vx = x - ax, vy = y - ay;
                    let lw = Math.abs(vx * Math.cos(r) + vy * Math.sin(r)), lh = Math.abs(-vx * Math.sin(r) + vy * Math.cos(r));
                    if (!e.shiftKey) { if (lw / lh > drag.ratio) lh = lw / drag.ratio; else lw = lh * drag.ratio; }
                    lw = Math.max(8, lw); lh = Math.max(8, lh);
                    const sx = Math.sign(vx * Math.cos(r) + vy * Math.sin(r)) || 1, sy = Math.sign(-vx * Math.sin(r) + vy * Math.cos(r)) || 1;
                    const mx = ax + (sx * lw / 2) * Math.cos(r) - (sy * lh / 2) * Math.sin(r), my = ay + (sx * lw / 2) * Math.sin(r) + (sy * lh / 2) * Math.cos(r);
                    op.w = lw / pw; op.h = lh / ph; op.x = mx / pw - op.w / 2; op.y = my / ph - op.h / 2;
                }
                drag.moved = true; renderLayer(l); draw(); return;
            }
            if (drag?.textBox) { drag.x1 = x; drag.y1 = y; draw(); return; }
            if (drag?.hook) { drag.hook.move(e.clientX - drag.cx, e); return; }
            if (drag?.grad) { const d = drag, op = d.gt.op;
                if (d.grad === 'm') { const dx = (x - d.x) / pw, dy = (y - d.y) / ph; op.x1 += dx; op.x2 += dx; op.y1 += dy; op.y2 += dy; d.x = x; d.y = y; }
                else { const [ox, oy] = d.grad === 'a' ? [op.x2 * pw, op.y2 * ph] : [op.x1 * pw, op.y1 * ph], [ex, ey] = e.shiftKey ? snap45(ox, oy, x, y) : [x, y]; if (d.grad === 'a') { op.x1 = ex / pw; op.y1 = ey / ph; } else { op.x2 = ex / pw; op.y2 = ey / ph; } }
                d.moved = true; gradRefresh(d.gt); return; }
            if (drag?.move && moveSel) { const l = nodeById(moveSel.layer), op = l?.ops[moveSel.i]; if (!op) return; moveOp(op, (x - drag.x) / pw, (y - drag.y) / ph); drag.x = x; drag.y = y; drag.moved = true; renderLayer(l); draw(); return; }
            if (!painting) return;
            if (painting.tool === 'shape') { const p = painting.preview; let ex = x, ey = y; if (e.shiftKey) { if (['line', 'arrow'].includes(p.kind)) { const a = Math.round(Math.atan2(y - painting.y0, x - painting.x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x - painting.x0, y - painting.y0); ex = painting.x0 + Math.cos(a) * L; ey = painting.y0 + Math.sin(a) * L; } else { const s0 = Math.max(Math.abs(x - painting.x0), Math.abs(y - painting.y0)); ex = painting.x0 + Math.sign(x - painting.x0 || 1) * s0; ey = painting.y0 + Math.sign(y - painting.y0 || 1) * s0; } } p.x2 = ex / pw; p.y2 = ey / ph; draw(); return; }
            if (painting.tool === 'gradient' || painting.tool === 'gradmask') { const g = painting, op = g.op || g.preview, [ex, ey] = e.shiftKey ? snap45(g.x0, g.y0, x, y) : [x, y];
                if (g.tool === 'gradient' && !g.layer) { if (Math.hypot(ex - g.x0, ey - g.y0) < 3) return;
                    // sur le calque de dégradé choisi (il est remplacé) ou un calque vide ; sinon un nouveau calque « Dégradé »
                    let l = nodeById(activeLayer); if (l && typeOf(l) === 'layer' && !lockedDeep(l) && (l.gradLayer || !l.ops.length)) l.ops = [op]; else { l = newLayer(`Dégradé ${drawLayers().filter(n => n.gradLayer).length + 1}`); l.ops = [op]; activeLayer = l.id; }
                    l.gradLayer = true; g.layer = l; refreshLayers(); }
                op.x2 = ex / pw; op.y2 = ey / ph; if (g.tool === 'gradient') renderLayer(g.layer); draw(); return; }
            if (painting.tool === 'patch') { painting.patch.dx = (x - painting.x0) / pw; painting.patch.dy = (y - painting.y0) / ph; draw(); return; }
            if (painting.tool === 'brush' || painting.tool === 'mask') { const p = painting.preview.points, l = p[p.length - 1]; if (Math.hypot((x / pw - l[0]) * pw, (y / ph - l[1]) * ph) >= 1) { p.push([x / pw, y / ph]); draw(); } return; }
            if (painting.tool === 'repair') { repairDab(x, y); return; }
            dabAt(x, y);
        });
        canvas.addEventListener('pointerleave', () => { brushEl.hidden = true; if (!cloneSrc) srcEl.hidden = true; if (polyHover) { polyHover = null; draw(); } });
        const NAMES = {heal: 'Correcteur de taches', clone: 'Tampon de duplication'};
        const SHAPES = {rect: 'Rectangle', round: 'Rectangle arrondi', ellipse: 'Ellipse', line: 'Ligne', arrow: 'Flèche'};
        const endPaint = e => {
            if (panning) { panning = null; return; }
            if (drag?.zoom) { const d = drag; drag = null; const dx = Math.abs(e.clientX - d.x0), dy = Math.abs(e.clientY - d.y0);
                if (dx > 12 && dy > 12) { const r = stage.getBoundingClientRect(), f = Math.min(r.width / dx, r.height / dy); setZoom(zoom * f, (e.clientX + d.x0) / 2, (e.clientY + d.y0) / 2); }
                else setZoom(zoom * (d.alt || e.altKey ? 1 / 1.6 : 1.6), e.clientX, e.clientY); return; }
            if (drag?.sel) { const d = drag; drag = null; const s = d.sel;
                if (s.kind !== 'poly' && (Math.abs(s.x1 - s.x0) < 2 || Math.abs(s.y1 - s.y0) < 2)) { if (d.how === 'new' && selId) { selId = null; refreshLayers(); setMode(mode); draw(); commit('Désélectionner'); } else draw(); return; }
                if (s.kind === 'poly' && s.pts.length < 3) { draw(); return; }
                combine(shapeMask(s), d.how); return; }
            if (drag?.imgSize || drag?.imgRot) { const d = drag; drag = null; if (d.moved) { const l = nodeById(moveSel?.layer); refreshLayers(); commit(d.imgRot ? `Image tournée sur « ${l?.name || ''} »` : `Image agrandie / réduite sur « ${l?.name || ''} »`); } return; }
            if (drag?.textBox) { const d = drag; drag = null; const w = Math.abs(d.x1 - d.x0); draw(); if (w > 12) placeText(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), null, w); else placeText(d.x0, d.y0); return; }
            if (drag?.hook) { const h = drag.hook; drag = null; h.up?.(); return; }
            if (drag?.grad) { const d = drag; drag = null; if (d.moved) { refreshLayers(); commit(`Dégradé ajusté${d.gt.mask ? ' (masque)' : ''} sur « ${d.gt.holder.name || 'la photo'} »`); } return; }
            if (drag?.move) { const d = drag; drag = null; if (d.moved) { const l = nodeById(moveSel?.layer); refreshLayers(); commit(`Élément déplacé sur « ${l?.name || ''} »`); } return; }
            if (!painting) return;
            const g = painting; painting = null;
            if (g.tool === 'gradient' || g.tool === 'gradmask') { const op = g.op || g.preview, name = RT_GKINDS.find(k => k[0] === op.kind)?.[2] || 'Dégradé';
                if (g.tool === 'gradmask') { if (Math.hypot((op.x2 - op.x1) * pw, (op.y2 - op.y1) * ph) < 3) { draw(); return; } g.layer.mask = [...(g.layer.mask || []), op]; draw(); refreshLayers(); commit(`Masque en dégradé sur « ${g.layer.name || 'la photo'} »`); return; }
                if (!g.layer) { draw(); return; } renderLayer(g.layer); draw(); refreshLayers(); syncGrad(); commit(`Dégradé ${name.toLowerCase()} : « ${g.layer.name} »`); return; }
            if (g.tool === 'shape') { const p = g.preview; if (Math.abs(p.x2 - p.x1) * pw < 2 && Math.abs(p.y2 - p.y1) * ph < 2) { draw(); return; } g.layer.ops.push(p); renderLayer(g.layer); draw(); refreshLayers(); commit(`${SHAPES[p.kind]} sur « ${g.layer.name} »`); return; }
            if (g.tool === 'patch') { const p = g.patch; if (Math.abs(p.dx * pw) < 1 && Math.abs(p.dy * ph) < 1) { draw(); return; } const before = new Uint8ClampedArray(srcData.data); rtReplayStrokes(srcData, [{tool: 'patch', mask: p.mask, dx: p.dx, dy: p.dy}], masks); patchToLayer(before); draw(); refreshLayers(); commit('Tampon : zone recopiée (calque ✨ Retouches)'); return; }
            if (g.tool === 'mask') { const t = g.layer; t.mask = [...(t.mask || []), g.preview]; draw(); refreshLayers(); commit(`Masque : ${g.preview.mode === 'hide' ? 'caché' : 'montré'} au pinceau`); return; }
            if (g.tool === 'brush') { g.layer.ops.push(g.preview); renderLayer(g.layer); draw(); refreshLayers(); commit(`${RT_BRUSHES.find(b => b[0] === g.preview.brush)?.[1] || 'Pinceau'} sur « ${g.layer.name} »`); return; }
            if (g.tool === 'repair') { if (!g.dabs.length) { draw(); return; } const before = new Uint8ClampedArray(srcData.data), s0 = {tool: 'inpaint', dabs: g.dabs, grain: $('[data-rt-rgrain]')?.checked !== false}; rtReplayStrokes(srcData, [s0], masks); patchToLayer(before); draw(); refreshLayers(); commit(`Pli réparé${g.dabs.length > 1 ? ` (${g.dabs.length} touches)` : ''} (calque ✨ Retouches)`); return; }
            if (g.dabs.length) { if (g.from) { patchToLayer(g.from); draw(); } else st.strokes.push({tool: g.tool, dabs: g.dabs}); refreshLayers(); commit(NAMES[g.tool] + (g.dabs.length > 1 ? ` (${g.dabs.length} touches)` : '') + (g.from ? ' (calque ✨ Retouches)' : '')); }
        };
        canvas.addEventListener('pointerup', endPaint); canvas.addEventListener('pointercancel', endPaint);
        canvas.addEventListener('pointerup', () => { if (drag?.persp !== undefined || drag?.idpEye !== undefined) drag = null; });
        const repairDab = (x, y) => { const d = painting.dabs, last = d[d.length - 1]; if (last && Math.hypot(x - last.x * pw, y - last.y * ph) < Math.max(0.6, brush / 5)) return; d.push({x: x / pw, y: y / ph, r: brush / pw}); drawOverlay(); };
        // ── Recadrer et redresser : un cadre à poignées sur l'image (tournée de l'angle choisi) ──
        let crop = null; // le cadre pendant l'outil : {x, y, w, h, a} relatifs (0 à 1)
        const ratioSel = $('[data-rt-ratio]'), angleIn = $('[data-rt-angle]');
        const ratio = () => { const v = ratioSel.value; if (!v) return 0; return v === 'orig' ? pw / ph : Number(v); };
        function startCrop() { crop = st.crop ? {...st.crop} : {x: 0, y: 0, w: 1, h: 1, a: 0}; angleIn.value = crop.a; $('[data-rt-angle-out]').textContent = crop.a + '°'; syncCrop(); }
        function endCrop(apply) {
            if (apply && crop) { const full = crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999 && !crop.a; st.crop = full ? null : {...crop}; commit(full ? 'Recadrage enlevé' : `Recadrage${crop.a ? ` et redressement (${crop.a}°)` : ''}`); }
            crop = null; syncCrop(); draw();
        }
        function syncCrop() {
            const on = mode === 'crop' && crop; cropEl.hidden = !on; canvas.style.transform = on && crop.a ? `rotate(${crop.a}deg)` : ''; overlay.style.transform = canvas.style.transform;
            if (!on) return;
            const W = canvas.offsetWidth, H = canvas.offsetHeight;
            Object.assign(cropEl.style, {left: canvas.offsetLeft + crop.x * W + 'px', top: canvas.offsetTop + crop.y * H + 'px', width: crop.w * W + 'px', height: crop.h * H + 'px'});
        }
        const fitRatio = (c, anchor = 'w') => { const r = ratio(); if (!r) return c; if (anchor === 'w') c.h = c.w * pw / ph / r; else c.w = c.h * ph * r / pw; if (c.h > 1) { c.h = 1; c.w = ph * r / pw; } if (c.w > 1) { c.w = 1; c.h = pw / ph / r; } c.x = Math.min(Math.max(0, c.x), 1 - c.w); c.y = Math.min(Math.max(0, c.y), 1 - c.h); return c; };
        ratioSel.addEventListener('change', () => { if (!crop) return; const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2; fitRatio(crop); crop.x = Math.min(Math.max(0, cx - crop.w / 2), 1 - crop.w); crop.y = Math.min(Math.max(0, cy - crop.h / 2), 1 - crop.h); syncCrop(); });
        angleIn.addEventListener('input', () => { if (!crop) return; crop.a = Number(angleIn.value); $('[data-rt-angle-out]').textContent = crop.a + '°'; syncCrop(); });
        let cdrag = null;
        stage.addEventListener('pointerdown', e => {
            if (mode !== 'crop' || !crop || spaceDown) return;
            const h = e.target.closest('[data-ch]'), inside = e.target === cropEl;
            const W = canvas.offsetWidth, H = canvas.offsetHeight, wr = wrap.getBoundingClientRect();
            const rel = ev => [(ev.clientX - wr.left - canvas.offsetLeft) / W, (ev.clientY - wr.top - canvas.offsetTop) / H];
            const [x, y] = rel(e);
            if (!h && !inside && !(x >= 0 && y >= 0 && x <= 1 && y <= 1)) return;
            e.preventDefault(); const c0 = {...crop};
            cdrag = {h: h?.dataset.ch || (inside ? 'move' : 'new'), x, y, c0, rel};
            if (cdrag.h === 'new') { crop.x = x; crop.y = y; crop.w = 0.001; crop.h = 0.001; cdrag.h = 'se'; cdrag.c0 = {...crop}; }
            stage.setPointerCapture(e.pointerId);
        });
        stage.addEventListener('pointermove', e => {
            if (!cdrag) return; const [x, y] = cdrag.rel(e), dx = x - cdrag.x, dy = y - cdrag.y, c0 = cdrag.c0, h = cdrag.h, c = {...c0};
            if (h === 'move') { c.x = Math.min(Math.max(0, c0.x + dx), 1 - c0.w); c.y = Math.min(Math.max(0, c0.y + dy), 1 - c0.h); }
            else {
                if (h.includes('w')) { c.x = Math.min(Math.max(0, c0.x + dx), c0.x + c0.w - 0.02); c.w = c0.x + c0.w - c.x; }
                if (h.includes('e')) c.w = Math.min(Math.max(0.02, c0.w + dx), 1 - c0.x);
                if (h.includes('n')) { c.y = Math.min(Math.max(0, c0.y + dy), c0.y + c0.h - 0.02); c.h = c0.y + c0.h - c.y; }
                if (h.includes('s')) c.h = Math.min(Math.max(0.02, c0.h + dy), 1 - c0.y);
                if (ratio()) { const w0 = c.w, h0 = c.h; fitRatio(c, h === 'n' || h === 's' ? 'h' : 'w'); if (h.includes('w')) c.x = c0.x + c0.w - c.w; if (h.includes('n')) c.y = c0.y + c0.h - c.h; if (c.x < 0 || c.y < 0) { c.w = w0; c.h = h0; } }
            }
            Object.assign(crop, c); syncCrop();
        });
        const cropUp = () => { cdrag = null; }; stage.addEventListener('pointerup', cropUp); stage.addEventListener('pointercancel', cropUp);
        // ── Les commandes (menus du haut, barre d'options, raccourcis) ──
        const needSel = () => { if (!selId) { toast('Fais d’abord une sélection (outils ⬚ ◯ ➰ ✒︎ 🪄).', 'error'); return false; } return true; };
        const full = () => { const c = blankMask(), g = c.getContext('2d'); g.fillRect(0, 0, pw, ph); return c; };
        const downloadFull = async type => {
            if (mode === 'persp') setMode('adjust');
            try { const c = await renderFull(); let blob = await new Promise(r => c.toBlob(r, type, 0.93)); if (!blob) throw new Error('Image trop grande pour le navigateur.'); blob = await rtEmbedMeta(blob, await metaOf()); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${String(item.title || item.filename || 'photo').replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'photo'}-retouche.${type === 'image/png' ? 'png' : 'jpg'}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
            catch (err) { toast(err.message, 'error'); }
        };
        /* ✨ Menu Filtre : un calque de réglage par filtre, une fenêtre pour le régler en direct */
        let lastFx = null;
        const fxNew = (key, params = null) => { const def = RT_FX[key]; const n = newAdjust(`Filtre : ${def[1]}`); n.st.filters = {chain: [{t: key, ...fxDefaults(key), ...(params || {})}]}; if (selId) n.mask = [{type: 'sel', mask: selId}]; return n; };
        function fxLast() { if (!lastFx) return toast('Aucun filtre utilisé pour l’instant (menu Filtre).'); const n = fxNew(lastFx.key, lastFx.params); refreshLayers(); syncControls(); draw(); commit(`Filtre « ${RT_FX[lastFx.key][1]} » (refait)`); toast(`« ${RT_FX[lastFx.key][1]} » refait sur un nouveau calque.`); return n; }
        function fxDialog(key, edit = null) {
            const def = RT_FX[key]; if (!def) return;
            let node, step, created = false;
            if (edit) { node = nodeById(edit.node); step = node?.st.filters?.chain?.[edit.i]; if (!step) return; }
            else { node = fxNew(key); step = node.st.filters.chain[0]; created = true; refreshLayers(); }
            activeLayer = node.id; refreshLayers(); syncControls(); draw();
            const before = JSON.stringify(step), op0 = node.opacity ?? 1, vis0 = created || node.visible !== false; // un calque caché le reste après « Annuler » ou « OK »
            node.visible = true; // l'aperçu pendant le réglage
            dlg.querySelector('.h-rt-fxpanel')?.remove();
            const pn = document.createElement('div'); pn.className = 'h-rt-fxpanel';
            pn.innerHTML = `<header><b>✨ ${esc(def[1])}</b><small>${esc(def[0])} · calque « ${esc(node.name)} »${node.mask ? ' · limité à la sélection' : ''}</small></header>
                ${def[2].map(([k, l, mn, mx, dv, stp, un]) => `<label class="h-rt-slider"><span>${esc(l)} <output data-fxo="${k}">${step[k] ?? dv}</output></span><input type="range" min="${mn}" max="${mx}" step="${stp || 1}" value="${step[k] ?? dv}" data-fxp="${k}"${un ? ` data-unit="${esc(un)}"` : ''}></label>`).join('')}
                <label class="h-rt-slider"><span>Opacité du calque (dosage) <output data-fxo="__op">${Math.round(op0 * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round(op0 * 100)}" data-fxp="__op"></label>
                <label class="ui-toggle"><input type="checkbox" data-fxprev checked><i></i>Aperçu</label>
                <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-fxreset>Valeurs de départ</button><span class="spacer"></span><button type="button" class="button small secondary" data-fxcancel>Annuler</button><button type="button" class="button small" data-fxok>✓ OK</button></div>
                <small class="muted">Rien n’est détruit : le filtre est sur son propre calque. Plus tard : Calques → le calque → onglet ✨ Filtres → « régler… ».</small>`;
            $('.h-rt-left').appendChild(pn);
            let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(draw, 120); };
            pn.addEventListener('input', e => { const k = e.target.dataset.fxp; if (!k) return; const v = Number(e.target.value); if (k === '__op') { node.opacity = v / 100; pn.querySelector('[data-fxo="__op"]').textContent = v + ' %'; draw(); return; } step[k] = v; pn.querySelector(`[data-fxo="${k}"]`).textContent = v; later(); });
            pn.querySelector('[data-fxprev]').addEventListener('change', e => { node.visible = e.target.checked; draw(); });
            pn.querySelector('[data-fxreset]').addEventListener('click', () => { Object.assign(step, fxDefaults(key)); pn.querySelectorAll('[data-fxp]').forEach(i => { if (i.dataset.fxp !== '__op') { i.value = step[i.dataset.fxp]; pn.querySelector(`[data-fxo="${i.dataset.fxp}"]`).textContent = i.value; } }); draw(); });
            pn.querySelector('[data-fxcancel]').addEventListener('click', () => { pn.remove(); if (created) { const l = locate(node.id); if (l) l.arr.splice(l.arr.indexOf(node), 1); activeLayer = ''; } else if (edit.added) { const ch = node.st.filters?.chain || [], j = ch.indexOf(step); if (j >= 0) ch.splice(j, 1); node.opacity = op0; node.visible = vis0; } // un filtre tout juste ajouté au calque : « Annuler » le retire
                else { Object.keys(step).forEach(k => delete step[k]); Object.assign(step, JSON.parse(before)); node.opacity = op0; node.visible = vis0; } refreshLayers(); syncControls(); draw(); });
            pn.querySelector('[data-fxok]').addEventListener('click', () => { pn.remove(); node.visible = vis0; lastFx = {key, params: Object.fromEntries(def[2].map(([k]) => [k, step[k]]))}; refreshLayers(); syncControls(); draw(); commit(created ? `Filtre « ${def[1]} »` : edit?.added ? `Filtre « ${def[1]} » ajouté au calque` : `Filtre « ${def[1]} » réglé`); });
        }
        dlg.addEventListener('click', e => {
            const ed = e.target.closest('[data-rt-fxedit]'), del = e.target.closest('[data-rt-fxdel]'), up = e.target.closest('[data-rt-fxup]'), n = adjNode(); if (!n || !(ed || del || up)) return;
            const ch = n.st.filters?.chain || [], i = Number((ed || del || up).dataset[ed ? 'rtFxedit' : del ? 'rtFxdel' : 'rtFxup']);
            if (ed) return fxDialog(ch[i].t, {node: n.id, i});
            if (del) { ch.splice(i, 1); syncControls(); draw(); return commit('Filtre enlevé du calque'); }
            if (up && i > 0) { [ch[i - 1], ch[i]] = [ch[i], ch[i - 1]]; syncControls(); draw(); return commit('Ordre des filtres'); }
        });
        dlg.addEventListener('change', e => { if (!e.target.matches('[data-rt-fxadd]')) return; const k = e.target.value, n = adjNode(); e.target.value = ''; if (!k || !n) return; n.st.filters = n.st.filters || {}; const ch = n.st.filters.chain = n.st.filters.chain || []; ch.push({t: k, ...fxDefaults(k)}); syncControls(); fxDialog(k, {node: n.id, i: ch.length - 1, added: true}); }); // « Annuler » l'enlève
        /* ⚡ Actions : les réglages de la photo (niveaux, courbe, filtres, colorisation…) et ses calques de réglage sans masque,
           gardés sous un nom, pour les remettre ici ou les appliquer d'un coup à plusieurs photos (une nouvelle version de chacune). */
        const ACT_KEY = 'genealogie-retouch-actions';
        const actList = () => { try { const v = JSON.parse(localStorage.getItem(ACT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
        const actSave = l => { try { localStorage.setItem(ACT_KEY, JSON.stringify(l)); return true; } catch (_) { toast('Plus de place pour les actions : supprimes-en une.', 'error'); return false; } };
        const actOf = () => { const s0 = rtClone({...st}); ['strokes', 'crop', 'persp', '_persp0'].forEach(k => delete s0[k]);
            const adj = []; layers.forEach(n => { if (typeOf(n) === 'adjust' && n.visible && !n.mask && !n.clip) adj.push({name: n.name, opacity: n.opacity ?? 1, st: rtClone(n.st)}); });
            return {st: s0, adj}; };
        /** une action venue d'un fichier : seulement des réglages connus, des nombres bornés, des noms courts */
        const actClean = d => {
            const num = v => (Number.isFinite(Number(v)) ? Math.max(-1000, Math.min(1000, Number(v))) : 0), pts = c => (Array.isArray(c) ? c.filter(q => Array.isArray(q) && q.length === 2).slice(0, 32).map(([x, y]) => [Math.max(0, Math.min(255, num(x))), Math.max(0, Math.min(255, num(y)))]) : [[0, 0], [255, 255]]);
            const fl = f => { const o = {}; if (!f || typeof f !== 'object') return o; RT_FILTERS.forEach(([k]) => { if (f[k] !== undefined) o[k] = num(f[k]); }); if (Array.isArray(f.chain)) o.chain = f.chain.filter(x => x && RT_FX[x.t]).slice(0, 20).map(x => Object.fromEntries([['t', x.t], ...Object.entries(x).filter(([k, v]) => k !== 't' && /^[a-z0-9_]{1,20}$/i.test(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])])); return o; };
            const one = s0 => { const b = rtDefault(), o = {}; if (!s0 || typeof s0 !== 'object') return o; Object.keys(b).forEach(k => { if (s0[k] === undefined || ['crop', 'persp', 'filters', 'curves'].includes(k)) return; if (typeof b[k] === 'boolean') o[k] = !!s0[k]; else if (k === 'gmap') o.gmap = RT_GMAPS[s0.gmap] ? s0.gmap : ''; else o[k] = num(s0[k]); });
                if (s0.curves && typeof s0.curves === 'object') o.curves = Object.fromEntries(RT_CHANNELS.map(([c]) => [c, pts(s0.curves[c])])); o.filters = fl(s0.filters); return o; };
            return {st: one(d?.st), adj: (Array.isArray(d?.adj) ? d.adj : []).slice(0, 20).map(x => ({name: String(x?.name || 'Réglages').slice(0, 80), opacity: Math.max(0, Math.min(1, Number(x?.opacity ?? 1) || 0)), st: one(x?.st)}))};
        };
        const actApplyHere = a => { Object.assign(st, rtDefault(), rtClone(a.st), {strokes: st.strokes, crop: st.crop, persp: st.persp}); (a.adj || []).forEach(x => { const n = newAdjust(x.name); n.opacity = x.opacity; n.st = {...adjDefault(), ...rtClone(x.st)}; }); refreshLayers(); syncControls(); commit(`Action « ${a.name} »`); };
        /** une action sur une image entière (en pleine taille) */
        const actRender = (im, a) => {
            const W = im.naturalWidth, H = im.naturalHeight, c = blank(W, H), g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, W, H); g.putImageData(rtApply(d, d, {...rtDefault(), ...a.st}), 0, 0);
            for (const x of a.adj || []) { const id = g.getImageData(0, 0, W, H), o = new ImageData(W, H); rtApply(id, o, {...adjDefault(), ...x.st}); const t = blank(W, H); t.getContext('2d').putImageData(o, 0, 0); g.globalAlpha = x.opacity ?? 1; g.drawImage(t, 0, 0); g.globalAlpha = 1; }
            return c;
        };
        function actionsDialog() {
            const d2 = document.createElement('dialog'); d2.className = 'modal h-modal h-modal-wide h-rt-actions';
            const draw2 = () => { const list = actList();
                d2.innerHTML = `<div class="modal-head"><div><span class="eyebrow">RETOUCHE</span><h2>⚡ Actions</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
                    <p class="muted">Une action garde les réglages de la photo (exposition, niveaux, courbe, teinte, filtres, poussière, colorisation…) et ses calques de réglage sans masque. On la remet sur une autre photo, ou sur plusieurs d’un coup : chacune reçoit une <b>nouvelle version</b>, l’original est gardé.</p>
                    <div class="h-rt-actnew"><input data-actname placeholder="Nom de l’action (ex. « Photos de l’album 1930 »)" maxlength="80"><button type="button" class="button small" data-actadd>＋ Enregistrer les réglages actuels</button><button type="button" class="button small secondary" data-actimport title="Reprendre un réglage exporté (fichier .json)">⤒ Importer un réglage</button></div>
                    ${list.length ? `<ol class="h-rt-actlist">${list.map((a, i) => `<li data-i="${i}"><strong>${esc(a.name)}</strong><small class="muted">${(a.adj || []).length ? `${A().plural(a.adj.length, 'calque de réglage', 'calques de réglage')} · ` : ''}${new Date(a.at || Date.now()).toLocaleDateString('fr-FR')}</small>
                        <span><button type="button" class="button small secondary" data-acthere>Sur cette photo</button><button type="button" class="button small" data-actbatch>Sur plusieurs photos…</button><button type="button" class="button small secondary" data-actexp title="Enregistrer cette action dans un fichier, pour la garder ou la donner">⤓ Exporter</button><button type="button" class="icon-button danger" data-actdel title="Supprimer">🗑</button></span></li>`).join('')}</ol>` : A().emptyState({icon: '⏺', text: 'Aucune action enregistrée pour l’instant', hint: '« ＋ Enregistrer les réglages actuels » les garde pour les rejouer sur d’autres photos.'})}
                    <div data-batch></div>
                    <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button></div>`;
            };
            draw2(); document.body.appendChild(d2); d2.addEventListener('close', () => d2.remove());
            d2.addEventListener('click', async e => {
                if (e.target.closest('[data-x]')) return d2.close();
                if (e.target.closest('[data-actadd]')) { const name = d2.querySelector('[data-actname]').value.trim() || `Action du ${new Date().toLocaleDateString('fr-FR')}`; const l = actList(); l.push({name, at: Date.now(), ...actOf()}); if (actSave(l)) { toast(`Action « ${name} » enregistrée.`); draw2(); } return; }
                if (e.target.closest('[data-actimport]')) {
                    const r = await ext.reglageImport('retouche', {names: actList().map(x => x.name), check: d => !!d && typeof d === 'object' && !!d.st && typeof d.st === 'object'}); if (!r) return;
                    const l = actList(); l.push({name: r.nom, at: Date.now(), ...actClean(r.donnees)}); if (actSave(l)) { toast(`Action « ${r.nom} » importée : « Sur cette photo » ou « Sur plusieurs photos… ».`); draw2(); } return;
                }
                const li = e.target.closest('[data-i]'); if (!li) return; const list = actList(), a = list[Number(li.dataset.i)]; if (!a) return;
                if (e.target.closest('[data-actexp]')) return ext.reglageExport('retouche', a.name, {st: a.st, adj: a.adj || []});
                if (e.target.closest('[data-actdel]')) { A().undoLocalChange(`Action « ${a.name} » supprimée`, [ACT_KEY], () => { list.splice(Number(li.dataset.i), 1); actSave(list); }, () => { if (d2.isConnected) draw2(); }); return draw2(); }
                if (e.target.closest('[data-acthere]')) { actApplyHere(a); d2.close(); return; }
                if (e.target.closest('[data-actbatch]')) return batchPanel(d2.querySelector('[data-batch]'), a);
            });
            d2.showModal();
        }
        function batchPanel(box, a) {
            const chosen = new Map();
            // les photos : la fenêtre unique des médias, en plusieurs (cases ✓) ; elles s'affichent en pastilles
            const field = window.LCNDA_PICKER?.mediaField ? window.LCNDA_PICKER.mediaField({name: '', multiple: true, types: ['image'], title: 'Les photos à retoucher', okLabel: 'Prendre ces photos', placeholder: '＋ Choisir des photos…'}) : '';
            box.innerHTML = `<section class="h-rt-batch"><h3>« ${esc(a.name)} » sur plusieurs photos</h3><div class="h-rt-batchbar"><div class="h-rt-batchfield" style="flex:1 1 260px;min-width:0">${field}</div><label class="ui-toggle"><input type="checkbox" data-bshow checked><i></i>afficher la nouvelle version</label></div>
                <p data-bsel class="muted">Aucune photo choisie.</p><div class="h-rt-batchgo"><button type="button" class="button" data-bgo disabled>Appliquer</button><progress data-bprog max="1" value="0" hidden></progress><small data-bstate></small></div></section>`;
            const go = box.querySelector('[data-bgo]');
            const syncSel = () => { box.querySelector('[data-bsel]').textContent = chosen.size ? `${A().plural(chosen.size, 'photo choisie', 'photos choisies')}.` : 'Aucune photo choisie.'; go.disabled = !chosen.size; };
            box.addEventListener('media-change', e => { chosen.clear(); (e.detail.items || []).filter(m => /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(m.filename || '')).forEach(m => chosen.set(m.id, m)); syncSel(); });
            go.addEventListener('click', async () => {
                const list = [...chosen.values()], prog = box.querySelector('[data-bprog]'), state = box.querySelector('[data-bstate]'), show = box.querySelector('[data-bshow]').checked;
                go.disabled = true; prog.hidden = false; prog.max = list.length; let ok = 0;
                for (const [i, m] of list.entries()) {
                    state.textContent = `${i + 1} / ${list.length} : ${m.title || m.filename}`;
                    try {
                        const im = new Image(); im.src = `media/${encodeURIComponent(m.filename)}?v=${Date.now()}`; await im.decode();
                        const c = actRender(im, a), png = /\.png$/i.test(m.filename), blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.93));
                        const fd = new FormData(); fd.append('file', blob, 'retouche.' + (png ? 'png' : 'jpg')); fd.append('media_id', m.id); fd.append('mode', 'version'); fd.append('show', show ? '1' : '0'); fd.append('csrf', A().state.csrf);
                        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json().catch(() => ({}));
                        if (!r.ok || j.error) throw new Error(j.error || 'refusé'); ok++;
                    } catch (err) { toast(`${m.title || m.filename} : ${err.message}`, 'error'); }
                    prog.value = i + 1;
                }
                state.textContent = `Terminé : ${ok} ${ok > 1 ? 'photos' : 'photo'} sur ${list.length}${show ? ', nouvelle version affichée' : ''}.`; toast(state.textContent); go.disabled = false;
            });
        }
        /* ⤓ Exporter (E3) : l'image retouchée, ou l'avant / après ; une copie peut aller dans les médias */
        const docTitle = () => (dlg.querySelector('[data-rt-name]')?.value || '').trim() || item.title || String(item.filename || 'photo').replace(/\.[a-z0-9]+$/i, '');
        const readyFull = () => { if (mode === 'persp') setMode('adjust'); if (mode === 'crop') endCrop(true); };
        const exportImage = () => { readyFull(); return ext.rtExportImage({title: st.info?.title || docTitle(), mediaId: item.id || 0, copyTitle: `${docTitle()} (retouchée)`, png: hasAlpha(), render: () => renderFull(), meta: metaOf}); };
        const exportBA = () => { readyFull(); return ext.rtBeforeAfterExport({title: docTitle(), mediaId: item.id || 0, pos: curtain?.pos ?? 0.5, vertical: curtain?.vertical !== false, getBefore: () => renderBefore(), getAfter: () => renderFull()}); };
        const tick = () => new Promise(r => setTimeout(r, 30));
        const panel = (cls, html) => { dlg.querySelector('.h-rt-fxpanel')?.remove(); const pn = document.createElement('div'); pn.className = `h-rt-fxpanel h-rt-panel2 ${cls}`; pn.innerHTML = html; $('.h-rt-left').appendChild(pn); return pn; };
        /** ✨ fx : les effets d'un calque (comme le « Style de calque » de Photoshop), avec son fond ; tout se voit en direct, Annuler remet comme avant */
        function styleDialog(id) {
            const l = target(id); if (!l) return; const before = JSON.stringify({lfx: l.lfx || null, fill: l.fill ?? null}), fx = rtLfx(l);
            const sl = (g, k, label, mn, mx, unit = '') => `<label class="h-rt-slider"><span>${label} <output>${fx[g][k]}${unit}</output></span><input type="range" min="${mn}" max="${mx}" value="${fx[g][k]}" data-ls="${g}.${k}"></label>`;
            const col = (g, label = 'Couleur') => `<label class="h-rt-lscol">${label} <input type="color" value="${fx[g].color}" data-ls="${g}.color"></label>`;
            const sec = (g, title, body) => `<details class="h-rt-lsec" ${fx[g].on ? 'open' : ''}><summary><label class="checkbox-line" onclick="event.stopPropagation()"><input type="checkbox" data-ls="${g}.on" ${fx[g].on ? 'checked' : ''}> <b>${title}</b></label></summary>${body}</details>`;
            const pn = panel('h-rt-lstyle', `<header><b>fx Effets du calque</b><small>« ${esc(l.name)} » · comme le style de calque de Photoshop</small></header>
                <label class="h-rt-slider"><span>Fond (le contenu seulement, pas les effets) <output>${Math.round((l.fill ?? 1) * 100)} %</output></span><input type="range" min="0" max="100" value="${Math.round((l.fill ?? 1) * 100)}" data-ls="fill"></label>
                ${sec('shadow', 'Ombre portée', col('shadow') + sl('shadow', 'opacity', 'Opacité', 0, 100, ' %') + sl('shadow', 'angle', 'Angle', 0, 360, '°') + sl('shadow', 'dist', 'Distance', 0, 120, ' px') + sl('shadow', 'blur', 'Flou', 0, 80, ' px'))}
                ${sec('glow', 'Lueur externe', col('glow') + sl('glow', 'opacity', 'Opacité', 0, 100, ' %') + sl('glow', 'size', 'Taille', 1, 120, ' px'))}
                ${sec('stroke', 'Contour', col('stroke') + sl('stroke', 'size', 'Épaisseur', 1, 60, ' px') + `<label class="h-rt-lscol">Position <select data-ls="stroke.pos">${[['outside', 'à l’extérieur'], ['center', 'au milieu'], ['inside', 'à l’intérieur']].map(([v, t]) => `<option value="${v}" ${fx.stroke.pos === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`)}
                ${sec('overlay', 'Incrustation de couleur', col('overlay') + sl('overlay', 'opacity', 'Opacité', 0, 100, ' %'))}
                <div class="h-rt-fxbtns"><button type="button" class="button small secondary" data-ls-reset>Tout enlever</button><span class="spacer"></span><button type="button" class="button small secondary" data-ls-cancel>Annuler</button><button type="button" class="button small" data-ls-ok>OK</button></div>`);
            const set = (path, v) => { if (path === 'fill') { l.fill = v / 100; if (l.fill >= 1) delete l.fill; return; } const [g, k] = path.split('.'); l.lfx = l.lfx || {}; l.lfx[g] = {...(l.lfx[g] || {}), [k]: v}; if (k !== 'on' && !l.lfx[g].on && pn.querySelector(`[data-ls="${g}.on"]`)) { l.lfx[g].on = true; pn.querySelector(`[data-ls="${g}.on"]`).checked = true; } };
            pn.addEventListener('input', e => { const el = e.target.closest('[data-ls]'); if (!el) return; const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value; set(el.dataset.ls, v); const out = el.parentElement.querySelector('output'); if (out) out.textContent = el.value + (out.textContent.match(/[^\d.-]+$/)?.[0] || ''); draw(); });
            pn.addEventListener('change', e => { if (e.target.matches('select[data-ls]')) { set(e.target.dataset.ls, e.target.value); draw(); } });
            pn.querySelector('[data-ls-reset]').addEventListener('click', () => { delete l.lfx; delete l.fill; pn.remove(); refreshLayers(); draw(); commit(`Effets de ${l.name} enlevés`); });
            pn.querySelector('[data-ls-cancel]').addEventListener('click', () => { const b = JSON.parse(before); if (b.lfx) l.lfx = b.lfx; else delete l.lfx; if (b.fill !== null) l.fill = b.fill; else delete l.fill; pn.remove(); refreshLayers(); draw(); });
            pn.querySelector('[data-ls-ok]').addEventListener('click', () => { pn.remove(); refreshLayers(); draw(); if (JSON.stringify({lfx: l.lfx || null, fill: l.fill ?? null}) !== before) commit(`Effets de ${l.name}`); });
        }

        /* 🔍 Plis et rayures repérés tout seuls : proposés en rouge, puis comblés d'après leurs alentours (une étape d'historique) */
        async function creasePanel() {
            if (!P()) return toast('La photo n’est plus dans les calques : « ↺ Remettre la photo » (onglet Calques).', 'error');
            if (lockedDeep(P())) return toast('La photo est verrouillée (🔒 dans Calques).', 'error');
            const pn = panel('h-rt-crease', `<header><b>🔍 Plis et rayures</b><small>Les lignes fines, claires ou sombres, sont repérées en rouge${selId ? ' (dans la sélection)' : ''}. Vérifie, puis « Réparer ces lignes ».</small></header>
                <p data-cr-count class="muted">Recherche…</p>
                <label data-help="Plus haut : des lignes plus pâles ou plus courtes sont aussi prises. Trop haut, des détails de la photo (cheveux, écriture) peuvent l’être : regarde le rouge.">Sensibilité <input type="range" min="1" max="100" value="${Number(ls('genealogie-retouch-crease', 50))}" data-cr-sens data-unit="%"></label>
                <label class="ui-toggle"><input type="checkbox" data-cr-grain checked><i></i><span>garder le grain autour</span></label>
                <div class="h-rt-panelbtns"><button type="button" class="link-button" data-cr-hand>🪡 Plutôt à la main</button><span class="spacer"></span><button type="button" class="button small secondary" data-cr-cancel>Annuler</button><button type="button" class="button small" data-cr-ok disabled>✓ Réparer ces lignes</button></div>`);
            const count = pn.querySelector('[data-cr-count]'), ok = pn.querySelector('[data-cr-ok]');
            const run = async () => {
                count.textContent = 'Recherche des plis…'; ok.disabled = true; await tick();
                const sens = Number(pn.querySelector('[data-cr-sens]').value), inside = selId ? rtMaskAlpha(masks.get(selId), pw, ph) : null, r = rtCreases(srcData, sens, inside);
                if (!pn.isConnected) return;
                creaseProp = {...r, canvas: r.lines ? rtMaskCanvas(r.mask, pw, ph, '#ff2020') : null}; draw();
                count.textContent = r.lines ? `${A().plural(r.lines, 'ligne repérée', 'lignes repérées')} (en rouge sur la photo).` : 'Aucun pli trouvé : monte la sensibilité, ou répare à la main avec le pinceau 🪡.';
                ok.disabled = !r.lines;
            };
            let tm = 0; pn.querySelector('[data-cr-sens]').addEventListener('input', e => { lsSet('genealogie-retouch-crease', e.target.value); clearTimeout(tm); tm = setTimeout(run, 250); });
            const end = () => { creaseProp = null; pn.remove(); draw(); };
            pn.querySelector('[data-cr-cancel]').addEventListener('click', end);
            pn.querySelector('[data-cr-hand]').addEventListener('click', () => { end(); setMode('repair'); });
            ok.addEventListener('click', async () => {
                if (!creaseProp?.lines) return; const n = creaseProp.lines; ok.disabled = true; count.textContent = 'Réparation…'; await tick();
                const s0 = {tool: 'inpaint', mask: addMask(rtMaskCanvas(creaseProp.mask, pw, ph)), grain: pn.querySelector('[data-cr-grain]').checked};
                const before = new Uint8ClampedArray(srcData.data); rtReplayStrokes(srcData, [s0], masks); patchToLayer(before, '✨ Plis et rayures comblés'); end(); refreshLayers();
                commit(`Plis réparés (${A().plural(n, 'ligne')})`); dlg.querySelector('[data-rt-step="tears"] .h-rt-stepok')?.removeAttribute('hidden');
                toast(`${A().plural(n, 'ligne réparée', 'lignes réparées')} : compare avec 👁 ou ◧ ; ↶ pour revenir.`);
            });
            run();
        }

        /* ✨ Restaurer en une fois : débruitage, poussières, plis, niveaux, netteté, colorisation — chaque étape avec son aperçu
           et une case ; le résultat : des calques de réglage « ✨ » (et les plis comblés sur la photo), une seule étape d'historique */
        async function restoreAllPanel() {
            if (!P()) return toast('La photo n’est plus dans les calques : « ↺ Remettre la photo » (onglet Calques).', 'error');
            if (mode === 'persp') setMode('adjust');
            let sat = 0, cnt = 0; for (let i = 0; i < srcData.data.length; i += 64) { const d = srcData.data; sat += Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]); cnt++; }
            const gray = sat / Math.max(1, cnt) < 14;
            const STEPS = [['denoise', '🌫️ Débruitage', 'adoucit le grain sans perdre les contours', true, 'detail'], ['dust', '🧹 Poussières et rayures', 'les petits points blancs ou noirs', true, 'all'],
                ['creases', '🩹 Plis et fines déchirures', 'lignes fines repérées puis comblées', true, 'all'], ['levels', '🎚 Contraste et niveaux automatiques', 'noirs bien noirs, blancs bien blancs', true, 'all'],
                ['sharpen', '🔎 Netteté douce', 'un peu plus de piqué', true, 'detail'], ['colorize', '🌈 Colorisation', gray ? 'couleurs d’époque (photo en noir et blanc)' : 'la photo a déjà des couleurs : coche si tu veux quand même', gray, 'all']];
            const pn = panel('h-rt-raall', `<header><b>✨ Restaurer en une fois</b><small>Coche les étapes à garder ; chacune devient un calque « ✨ » que tu peux ensuite cacher ou doser. ↶ défait tout d’un coup.</small></header>
                <label data-help="La force de toutes les étapes d’un coup : bas = une restauration discrète, haut = plus marquée (mais attention au « trop lisse »).">Intensité <input type="range" min="0" max="100" value="${Number(ls('genealogie-retouch-raall', 60))}" data-ra-k data-unit="%"></label>
                <ol class="h-ra-steps">${STEPS.map(([k, t, h, on, view]) => `<li class="h-ra-step${on ? '' : ' is-off'}" data-ra="${k}"><input type="checkbox" ${on ? 'checked' : ''} data-ra-on aria-label="Garder : ${esc(t)}"><b>${esc(t)}</b><small>${esc(h)}${view === 'detail' ? ' · détail au centre' : ''}</small><div class="h-ra-thumbs"><canvas data-ra-b></canvas><span>→</span><canvas data-ra-a></canvas></div></li>`).join('')}</ol>
                <div class="h-rt-panelbtns"><small class="muted" data-ra-state></small><span class="spacer"></span><button type="button" class="button small secondary" data-ra-cancel>Annuler</button><button type="button" class="button small" data-ra-ok>✓ Appliquer</button></div>`);
            const K = () => Number(pn.querySelector('[data-ra-k]').value) / 100, state = pn.querySelector('[data-ra-state]');
            // la petite image (toute la photo) et un détail au centre (à 100 %) pour voir le grain et la netteté
            const pc = photo(), tw = 240, th = Math.max(1, Math.round(tw * ph / pw));
            const whole = (() => { const c = blank(tw, th); c.getContext('2d').drawImage(pc, 0, 0, tw, th); return c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, tw, th); })();
            const dw = Math.min(pw, 240), dh = Math.min(ph, Math.round(240 * th / tw)), detail = pctx.getImageData(Math.round((pw - dw) / 2), Math.round((ph - dh) / 2), dw, dh);
            const autoLv = () => { const h = new Array(256).fill(0); let n = 0; for (let i = 0; i < srcData.data.length; i += 16) { h[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++; n++; }
                let lo = 0, hi = 255, acc = 0; while (lo < 250 && (acc += h[lo]) < n * 0.005) lo++; acc = 0; while (hi > lo + 5 && (acc += h[hi]) < n * 0.005) hi--; let mid = 0; acc = 0; while (mid < 255 && (acc += h[mid]) < n / 2) mid++;
                const t = Math.min(0.95, Math.max(0.05, (mid - lo) / Math.max(1, hi - lo))); return {lo, hi, g: Math.round(Math.min(300, Math.max(10, Math.log(t) / Math.log(0.5) * 100)))}; };
            const LV = autoLv();
            const stepSt = (key, k) => ({
                denoise: {filters: {chain: [{t: 'denoise2', ...fxDefaults('denoise2'), amount: Math.round(15 + 55 * k)}]}},
                dust: {filters: {dust: Math.round(15 + 60 * k)}},
                levels: (() => { const q = 0.35 + 0.65 * k; return {lvl_in_b: Math.round(LV.lo * q), lvl_in_w: Math.round(255 - (255 - LV.hi) * q), lvl_gamma: Math.round(100 + (LV.g - 100) * q), contrast: Math.round(10 * k)}; })(),
                sharpen: {filters: {chain: [{t: 'unsharp', ...fxDefaults('unsharp'), amount: Math.round(40 + 90 * k), r: 1.2, thr: 3}]}},
                colorize: {gmap: 'naturel', gmap_amt: Math.round(40 + 45 * k)},
            })[key];
            const put = (cv, idata) => { cv.width = idata.width; cv.height = idata.height; cv.getContext('2d').putImageData(idata, 0, 0); };
            let creases = null;
            const preview = async () => {
                const k = K(); state.textContent = 'Aperçus…'; await tick(); if (!pn.isConnected) return;
                for (const [key, , , , view] of STEPS) {
                    const li = pn.querySelector(`[data-ra="${key}"]`), base = view === 'detail' ? detail : whole; put(li.querySelector('[data-ra-b]'), base);
                    if (key === 'creases') continue;
                    const o = new ImageData(base.width, base.height); rtApply(new ImageData(new Uint8ClampedArray(base.data), base.width, base.height), o, {...adjDefault(), ...stepSt(key, k)}); put(li.querySelector('[data-ra-a]'), o);
                }
                // les plis : repérés sur l'aperçu de travail, comblés, puis montrés en petit
                const r = rtCreases(srcData, Math.round(30 + 45 * k)); if (!pn.isConnected) return; creases = r;
                const li = pn.querySelector('[data-ra="creases"]'), tmp = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); if (r.lines) rtInpaint(tmp, r.mask);
                const big = blank(pw, ph); big.getContext('2d').putImageData(tmp, 0, 0); const sm = blank(tw, th), sg = sm.getContext('2d', {willReadFrequently: true}); sg.drawImage(big, 0, 0, tw, th); put(li.querySelector('[data-ra-a]'), sg.getImageData(0, 0, tw, th));
                li.querySelector('small').textContent = r.lines ? `${A().plural(r.lines, 'ligne repérée', 'lignes repérées')} puis comblée${r.lines > 1 ? 's' : ''}` : 'aucun pli trouvé à cette intensité';
                if (!r.lines) { li.querySelector('[data-ra-on]').checked = false; li.classList.add('is-off'); }
                state.textContent = '';
            };
            let tm = 0;
            pn.addEventListener('input', e => { if (!e.target.matches('[data-ra-k]')) return; lsSet('genealogie-retouch-raall', e.target.value); clearTimeout(tm); tm = setTimeout(preview, 250); });
            pn.addEventListener('change', e => { const li = e.target.closest('[data-ra]'); if (li && e.target.matches('[data-ra-on]')) li.classList.toggle('is-off', !e.target.checked); });
            pn.querySelector('[data-ra-cancel]').addEventListener('click', () => pn.remove());
            pn.querySelector('[data-ra-ok]').addEventListener('click', async () => {
                const k = K(), on = new Set([...pn.querySelectorAll('[data-ra]')].filter(li => li.querySelector('[data-ra-on]').checked).map(li => li.dataset.ra));
                if (!on.size) return toast('Coche au moins une étape.', 'error');
                state.textContent = 'Restauration…'; pn.querySelectorAll('button').forEach(b => { b.disabled = true; }); await tick();
                let n = 0;
                if (on.has('creases')) { const r = creases || rtCreases(srcData, Math.round(30 + 45 * k)); if (r.lines && !lockedDeep(P())) { const s0 = {tool: 'inpaint', mask: addMask(rtMaskCanvas(r.mask, pw, ph)), grain: true}, before = new Uint8ClampedArray(srcData.data); rtReplayStrokes(srcData, [s0], masks); patchToLayer(before, '✨ Plis et fines déchirures'); n++; } }
                const NAMES0 = {dust: '✨ Poussières et rayures', denoise: '✨ Débruitage', levels: '✨ Contraste et niveaux', sharpen: '✨ Netteté douce', colorize: '✨ Colorisation'};
                for (const key of ['dust', 'denoise', 'levels', 'sharpen', 'colorize']) { if (!on.has(key)) continue; layers.push({id: nid('a'), type: 'adjust', name: NAMES0[key], visible: true, opacity: 1, mask: null, clip: false, st: {...adjDefault(), ...rtClone(stepSt(key, k))}}); n++; }
                pn.remove(); activeLayer = ''; refreshLayers(); syncControls(); draw();
                commit(`✨ Restauration en une fois (${A().plural(n, 'étape')})`);
                toast(`Restauration faite (${A().plural(n, 'étape')}) : chaque étape est un calque « ✨ » (Calques) que tu peux cacher ou doser ; ↶ défait tout.`);
            });
            preview();
        }

        /* 🪪 Photo d'identité : les yeux trouvés (modèle des visages de l'app, sinon l'identification de la photo), le cadre au
           format choisi (yeux à l'horizontale, à la même hauteur pour tous), puis recadrer ou en faire le portrait d'une fiche */
        const idpUpdate = () => { if (!idp) return; idp.crop = idpCrop(idp.eyes, pw, ph, idp.p); drawOverlay(); const cv = dlg.querySelector('[data-idp-prev]'); if (!cv) return; const t = idpRender(canvas, pw, ph, idp.crop, 220); cv.width = t.width; cv.height = t.height; cv.getContext('2d').drawImage(t, 0, 0); };
        async function openIdPhoto() {
            if (mode === 'crop') endCrop(true);
            const pn = panel('h-rt-idp', `<header><b>🪪 Photo d’identité</b><small>Les yeux à l’horizontale, toujours à la même hauteur : tous les portraits faits ainsi ont le même format.</small></header><p class="muted" data-idp-src>${window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('Recherche du visage…') : 'Recherche du visage…'}</p>`);
            let tags = []; try { if (item.id) tags = ((await api('media_tags', {media_id: item.id})).tags || []).filter(t => t.tag_type === 'person'); } catch (_) {}
            const hint = tags.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0], f = await idpFindEyes(img, {hint: hint ? {x: Number(hint.x), y: Number(hint.y), w: Number(hint.w), h: Number(hint.h)} : null, onStep: s => { const el = pn.querySelector('[data-idp-src]'); if (el) el.textContent = s; }});
            if (!pn.isConnected) return;
            const k = pw / img.naturalWidth, eyes = f ? f.eyes.map(([x, y]) => [x * k, y * k]) : [[pw * 0.42, ph * 0.38], [pw * 0.58, ph * 0.38]];
            const mid = [(eyes[0][0] + eyes[1][0]) / 2 / pw * 100, (eyes[0][1] + eyes[1][1]) / 2 / ph * 100], who = tags.find(t => mid[0] >= Number(t.x) && mid[0] <= Number(t.x) + Number(t.w) && mid[1] >= Number(t.y) && mid[1] <= Number(t.y) + Number(t.h));
            idp = {eyes, p: idpPrefs(), person: who ? Number(who.person_id) : 0, personName: who ? `${who.first_name || ''} ${who.last_name || ''}`.trim() : ''};
            const p = idp.p;
            pn.innerHTML = `<header><b>🪪 Photo d’identité</b><small>Les yeux à l’horizontale, toujours à la même hauteur : tous les portraits faits ainsi ont le même format.</small></header>
                <canvas class="h-idp-prev" data-idp-prev></canvas>
                <p class="muted" data-idp-src>${f ? (f.source === 'model' ? '✓ Yeux trouvés sur le visage.' : '✓ D’après l’identification de la photo : ajuste les ronds sur les yeux.') : '⚠️ Visage non trouvé : glisse les deux ronds sur les yeux.'}${idp.personName ? ` Personne : <b>${esc(idp.personName)}</b>.` : ''}</p>
                <label>Format <select data-idp-ratio>${IDP_RATIOS.map(([v, l]) => `<option value="${v}" ${Number(v) === p.ratio ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label data-help="De combien le cadre dépasse autour du visage : petit = visage serré, grand = épaules et un peu de fond.">Marge autour du visage <input type="range" min="0" max="100" value="${p.margin}" data-idp-margin data-unit="%"></label>
                <label data-help="La hauteur des yeux dans le cadre, depuis le haut : la même pour tous les portraits, ils s’alignent quand on les met côte à côte.">Hauteur des yeux <input type="range" min="25" max="60" value="${Math.round(p.eye * 100)}" data-idp-eye data-unit="%"></label>
                <div class="h-rt-panelbtns"><button type="button" class="link-button" data-idp-batch>Plusieurs fiches…</button><span class="spacer"></span><button type="button" class="button small secondary" data-idp-cancel>Annuler</button><button type="button" class="button small secondary" data-idp-ok>✓ Recadrer</button><button type="button" class="button small" data-idp-use>👤 Utiliser comme portrait…</button></div>`;
            setMode('idphoto'); idpUpdate();
            pn.addEventListener('input', e => { if (!idp) return; if (e.target.matches('[data-idp-margin]')) idp.p.margin = Number(e.target.value); if (e.target.matches('[data-idp-eye]')) idp.p.eye = Number(e.target.value) / 100; idpSave(idp.p); idpUpdate(); });
            pn.addEventListener('change', e => { if (e.target.matches('[data-idp-ratio]') && idp) { idp.p.ratio = Number(e.target.value) || 0.75; idpSave(idp.p); idpUpdate(); } });
            const applyCrop = () => { if (!idp) return false; st.crop = {...idp.crop}; idp = null; pn.remove(); setMode('adjust'); draw(); commit('Recadré en photo d’identité'); return true; };
            pn.querySelector('[data-idp-cancel]').addEventListener('click', () => { idp = null; pn.remove(); setMode('adjust'); });
            pn.querySelector('[data-idp-batch]').addEventListener('click', () => idpBatchDialog());
            pn.querySelector('[data-idp-ok]').addEventListener('click', applyCrop);
            pn.querySelector('[data-idp-use]').addEventListener('click', async () => {
                if (!idp) return; const who0 = idp.person || A().state.currentPersonId || 0, nm = idp.personName;
                const pers = await idpAskPerson(who0); if (!pers) return;
                applyCrop();
                try {
                    window.LCNDA_UI?.savedStatus?.(statusEl, 'saving'); lastStatus = 'saving';
                    let c = await renderFull(); if (c.height > 1600) { const k2 = 1600 / c.height, t = blank(Math.round(c.width * k2), 1600); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); c = t; }
                    await idpUseAsPortrait(c, pers.id, pers.name || nm); lastStatus = null; showProj();
                    toast(`Portrait de la fiche${pers.name ? ` « ${pers.name} »` : ''} mis à jour (la photo recadrée est dans ses médias).`); refreshAfter();
                } catch (err) { lastStatus = null; showProj(); toast(err.message, 'error'); }
            });
        }
        // ☁️ ✂️ 🔍 les outils de heritage-retouch-plus.js : ce qu'ils peuvent toucher dans la retouche (calques, masques, sélection…)
        const plusCtx = {get pw() { return pw; }, get ph() { return ph; }, dlg, left: $('.h-rt-left'), fresh, mediaId: item.id || 0, title: () => dlg.querySelector('[data-rt-name]')?.value || item.title || item.filename,
            photo: () => photo(), addMask, blankMask, maskBox, selMask: () => (selId ? masks.get(selId) : null), clearSel: () => { selId = null; refreshLayers(); draw(); },
            newLayer, newAdjust, aboveP: fn => { activeLayer = 'photo'; return fn(); }, photoNode: () => P(), nodeById,
            removeNode: id => { const l = locate(id); if (l) l.arr.splice(l.arr.indexOf(l.n), 1); if (activeLayer === id) activeLayer = ''; if (maskEdit === id) maskEdit = ''; },
            setActive: id => { activeLayer = id; }, setMaskEdit: id => { maskEdit = id; refreshLayers(); }, renderLayer,
            refresh: () => { refreshLayers(); syncControls(); draw(); }, commit, showTab, setMode, renderFull: () => renderFull(), hasAlpha: () => hasAlpha(), applyShown: f => applyShown(f),
            busy: t => { help.textContent = t || HELP[optsFor(mode)] || ''; if (t) $('[data-rt-opts]').hidden = false; },
            // 🗂 PSD (heritage-psd.js) : les calques de pixels (masque appliqué), du bas vers le haut, et l'image telle qu'on la voit
            activeNode: () => nodeById(activeLayer), maskCanvas: n => rtRenderMask(n.mask, pw, ph, masks), // ✨ affiner le bord (heritage-retouch-bord.js)
            psdLayers: () => drawLayers().map(l => ({name: l.name, canvas: l.mask && !l.maskOff ? rtMasked(layerCanvas(l), l.mask, masks) : layerCanvas(l), opacity: l.opacity ?? 1, visible: l.visible !== false, blend: rtBlend(l)})),
            composite: () => { const pc = photo(); return renderStack(layers, null, {W: pw, H: ph, layer: l => (typeOf(l) === 'photo' ? pc : layerCanvas(l)), mask: n => (n.maskOff ? null : n.mask)}); }};
        /* ── 🔄 Image → Rotation de l'image (comme Photoshop) : tout le document tourne d'un bloc — chaque calque, masque, sélection,
              texte, forme, calque de réglage, la perspective, le recadrage, la zone de travail ; largeur et hauteur échangées, résolution
              gardée ; une seule étape d'historique. Le moteur (étapes, coordonnées, toiles, Exif) : heritage-retouch-rotation.js ── */
        function rtWarpCanvas(c, q) { const t = blank(c.naturalWidth || c.width, c.naturalHeight || c.height), g = t.getContext('2d', {willReadFrequently: true}); g.drawImage(c, 0, 0); const o = rtWarp(g.getImageData(0, 0, t.width, t.height), q); g.putImageData(o, 0, 0); return t; }
        /** l'image de départ avec ses étapes (les dernières gardées : ↶ ↷ ne refont pas le calcul) */
        function docImage(xf) {
            const key = JSON.stringify(xf || []); if (key === '[]' || !ext.rtOrient) return img0;
            let c = docCache.get(key); if (!c) { c = ext.rtOrient.applySteps(img0, xf, {warp: rtWarpCanvas}); docCache.set(key, c); if (docCache.size > 6) docCache.delete(docCache.keys().next().value); }
            return c;
        }
        /** l'image de départ (et la taille de l'aperçu) suivent les étapes ; false si rien ne change */
        function setDoc(xf) {
            const key = JSON.stringify(ext.rtOrient ? ext.rtOrient.cleanList(xf) : []); if (key === docKey) return false;
            docKey = key; img = docImage(JSON.parse(key));
            pw = Math.max(1, Math.round(img.naturalWidth * scale)); ph = Math.max(1, Math.round(img.naturalHeight * scale));
            work.width = pw; work.height = ph; wctx.drawImage(img, 0, 0, pw, ph);
            srcData = wctx.getImageData(0, 0, pw, ph); baseData = new ImageData(new Uint8ClampedArray(srcData.data), pw, ph); out = ctx.createImageData(pw, ph);
            canvas.width = overlay.width = photoCanvas.width = pw; canvas.height = overlay.height = photoCanvas.height = ph;
            layerCanvases.clear(); adjCache.clear(); warpCache = {key: '', data: null}; photoKey = ''; strokeVer++;
            curtain?.setBefore?.(baseData); rtBar?.setWhere(`${img.naturalWidth} × ${img.naturalHeight} px`);
            requestAnimationFrame(() => setZoom(1));
            return true;
        }
        /** Tourne (ou retourne) tout le document, en une seule étape d'historique : {r: degrés horaires, bg} ou {f: 'h' | 'v'} (ou une liste) */
        function rotateDoc(steps, {label = '', autoCrop = false} = {}) {
            const OR = ext.rtOrient; if (!OR) return toast('La rotation n’est pas encore prête : réessaie dans un instant.', 'error');
            const list = (Array.isArray(steps) ? steps : [steps]).map(OR.clean).filter(x => x && !x.p); if (!list.length) return;
            if (editingTA) editingTA.finish(true);
            if (leveling) stopLevel();
            if (['crop', 'persp', 'idphoto'].includes(mode)) setMode('adjust');
            painting = null; drag = null; poly = null; polyHover = null; moveSel = null; idp = null; creaseProp = null; cloneOff = null; cloneSrc = null;
            dlg.querySelector('.h-rt-fxpanel')?.remove(); dlg.querySelector('.h-rt-exif')?.remove();
            let dropped = false;
            list.forEach(s => { if (turnDoc(s, autoCrop && s === list[list.length - 1])) dropped = true; });
            syncControls(); refreshLayers(); syncCrop(); draw();
            commit(label || (list.length === 1 ? OR.label(list[0]) : 'Rotation de l’image'));
            if (dropped && !autoCrop) toast('Le recadrage d’avant a été retiré (il ne tenait plus droit) : refais-le si besoin, ou ↶ Annuler.');
        }
        /** une étape, sans l'historique ; true si le recadrage a dû être retiré */
        function turnDoc(s, autoCrop) {
            const OR = ext.rtOrient, W0 = pw, H0 = ph;
            let xf0 = OR.cleanList(st.docXf);
            const base = {...rtClone({...st, strokes: undefined})};
            if (base.persp && !OR.isQuarter(s)) { xf0 = [...xf0, {p: base.persp}]; base.persp = null; } // un angle libre : la perspective est figée dans l'image d'abord
            base.docXf = xf0;
            const im1 = docImage(OR.push(xf0, s)), W1 = Math.max(1, Math.round(im1.naturalWidth * scale)), H1 = Math.max(1, Math.round(im1.naturalHeight * scale));
            const mask = (id, kind) => { const c = masks.get(id); return c && kind === 'doc' ? addMask(OR.canvasStep(c, s, {W1, H1, ref: [W0, H0]})) : id; };
            const res = OR.doc({st: base, strokes: st.strokes, layers, selId}, s, {W0, H0, W1, H1, mask});
            Object.keys(st).forEach(k => { if (k !== 'strokes') delete st[k]; }); Object.assign(st, res.st); delete st.strokes; st.strokes = res.strokes;
            if (!st.docXf?.length) delete st.docXf; // 4 × 90° : l'image de départ, telle quelle
            if (autoCrop && !OR.isQuarter(s)) { const [w, h] = OR.innerRect(W0, H0, s.r); st.crop = {x: (W1 - w) / 2 / W1, y: (H1 - h) / 2 / H1, w: Math.min(1, w / W1), h: Math.min(1, h / H1), a: 0}; }
            layers = res.layers; selId = res.selId;
            setDoc(st.docXf);
            srcData.data.set(baseFor().data); if (st.strokes.length) rtReplayStrokes(srcData, st.strokes, masks); strokeVer++; photoKey = '';
            photo(); drawLayers().forEach(renderLayer);
            return !!res.notes?.includes('crop');
        }
        ext.rtRotateDoc = (s, o) => rotateDoc(s, o); // pour les essais
        /** 🔄 Image → Rotation de l'image → Angle… : un angle libre, la zone de travail s'agrandit (coins transparents ou d'une couleur) */
        function rotateAngleDialog(a0 = null, {level = false} = {}) {
            let pref = {}; try { pref = JSON.parse(localStorage.getItem('genealogie-retouch-rotate') || '{}') || {}; } catch (_) {}
            const OR = ext.rtOrient, a = a0 ?? (Number.isFinite(pref.a) ? pref.a : 15), bg0 = /^#[0-9a-f]{6}$/i.test(pref.bg || '') ? pref.bg : '#ffffff', transp0 = pref.bg ? pref.bg === 'transparent' : true;
            const S = {a: Math.abs(a), cw: a >= 0};
            return rtDialog({eyebrow: 'IMAGE', title: level ? '📐 Redresser l’horizon' : '🔄 Rotation de l’image', submitLabel: '↻ Faire pivoter',
                body: `<div class="fmt-dlg-grid"><div>
                    ${level ? '<p class="muted">L’angle mesuré sur ta ligne : la photo tourne de cet angle pour la remettre droite.</p>' : ''}
                    <fieldset><legend>Angle</legend><div class="fmt-row"><label><span>De combien</span><input type="number" data-ra-angle min="0" max="359.99" step="0.01" data-unit="°" value="${String(Math.round(S.a * 100) / 100)}" required></label></div>
                        <div class="segmented" role="radiogroup" aria-label="Sens"><button type="button" role="radio" data-ra-dir="cw">↻ Horaire</button><button type="button" role="radio" data-ra-dir="ccw">↺ Antihoraire</button></div></fieldset>
                    <fieldset><legend>Coins ajoutés autour</legend><label class="checkbox-line"><input type="checkbox" data-ra-transp${transp0 ? ' checked' : ''}> Transparents (PNG)</label><label data-ra-bgrow${transp0 ? ' hidden' : ''}><span>Couleur</span><input type="color" data-ra-bg value="${esc(bg0)}"></label>
                        <label class="checkbox-line"><input type="checkbox" data-ra-crop${level || pref.crop ? ' checked' : ''}> <span data-help="Garde le plus grand rectangle droit dans la photo tournée : plus de coins vides. C’est un recadrage : « Annuler le recadrage » le retire.">✂️ Recadrer pour enlever les coins vides</span></label></fieldset>
                </div><div><dl class="fmt-before-after"><dt>Maintenant</dt><dd>${img.naturalWidth} × ${img.naturalHeight} px</dd><dt>Après</dt><dd data-ra-after></dd></dl><p class="muted">Tous les calques, masques, textes et la sélection tournent avec la photo. ↶ Annuler (⌘Z) revient comme avant.</p></div></div>`,
                onOpen: d => {
                    const q = s0 => d.querySelector(s0), aI = q('[data-ra-angle]');
                    const paint = () => { d.querySelectorAll('[data-ra-dir]').forEach(b => { const on = (b.dataset.raDir === 'cw') === S.cw; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
                        const v = Number(aI.value), r = Number.isFinite(v) ? (S.cw ? v : -v) : 0, [w, h] = OR ? OR.dims(img.naturalWidth, img.naturalHeight, {r}) : [img.naturalWidth, img.naturalHeight];
                        q('[data-ra-after]').textContent = q('[data-ra-crop]').checked && r % 90 ? (() => { const [iw, ih] = OR.innerRect(img.naturalWidth, img.naturalHeight, r); return `${Math.round(iw)} × ${Math.round(ih)} px (recadrée)`; })() : `${w} × ${h} px`; };
                    d.addEventListener('click', e => { const b = e.target.closest('[data-ra-dir]'); if (!b) return; S.cw = b.dataset.raDir === 'cw'; paint(); });
                    aI.addEventListener('input', paint); q('[data-ra-crop]').addEventListener('change', paint);
                    q('[data-ra-transp]').addEventListener('change', e => { q('[data-ra-bgrow]').hidden = e.target.checked; });
                    paint(); setTimeout(() => { aI.focus(); aI.select(); }, 30);
                },
                onSubmit: f => {
                    const aI = f.querySelector('[data-ra-angle]'), v = Number(String(aI.value).replace(',', '.'));
                    if (!Number.isFinite(v) || v <= 0 || v >= 360) return window.LCNDA_UI?.fail ? window.LCNDA_UI.fail(aI, 'Donne un angle entre 0,01 et 359,99°.') : false;
                    const r = S.cw ? v : -v, bg = f.querySelector('[data-ra-transp]').checked ? 'transparent' : (/^#[0-9a-f]{6}$/i.test(f.querySelector('[data-ra-bg]').value) ? f.querySelector('[data-ra-bg]').value : '#ffffff'), crop = f.querySelector('[data-ra-crop]').checked;
                    if (!level) try { localStorage.setItem('genealogie-retouch-rotate', JSON.stringify({a: r, bg, crop})); } catch (_) {}
                    rotateDoc({r, bg}, {autoCrop: crop, label: level ? `Horizon redressé (${String(Math.round(r * 100) / 100).replace('.', ',')}°)` : ''});
                }});
        }
        /* 📐 Redresser l'horizon : on trace une ligne le long de l'horizon (ou d'un mur bien droit), la photo tourne pour la remettre droite */
        function startLevel() {
            setMode('adjust'); leveling = true; levelLine = null; wrap.classList.add('is-leveling');
            const t = 'Trace une ligne le long de l’horizon (ou d’un mur bien droit) : la photo tournera pour la remettre droite. Échap pour arrêter.';
            help.textContent = t; rtBar?.setHelp?.(t);
        }
        function stopLevel() { leveling = false; levelLine = null; wrap.classList.remove('is-leveling'); help.textContent = HELP[optsFor(mode)] || ''; drawOverlay(); }
        wrap.addEventListener('pointerdown', e => { if (!leveling || e.button !== 0 || !e.target.closest('canvas')) return; e.preventDefault(); e.stopPropagation(); const [x, y] = toCanvas(e); levelLine = {x0: x, y0: y, x1: x, y1: y}; try { wrap.setPointerCapture(e.pointerId); } catch (_) {} }, true);
        wrap.addEventListener('pointermove', e => { if (!leveling || !levelLine) return; e.stopPropagation(); const [x, y] = toCanvas(e); levelLine.x1 = x; levelLine.y1 = y; drawOverlay(); }, true);
        wrap.addEventListener('pointerup', e => {
            if (!leveling || !levelLine) return; e.stopPropagation(); const L = levelLine; levelLine = null;
            const dx = L.x1 - L.x0, dy = L.y1 - L.y0; if (Math.hypot(dx, dy) * canvas.getBoundingClientRect().width / pw < 12) { drawOverlay(); return; } // un simple clic : on attend une vraie ligne
            let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; // −90° à 90°
            const r = Math.abs(ang) > 45 ? (ang > 0 ? 90 - ang : -90 - ang) : -ang; // près de la verticale : on redresse un mur
            stopLevel();
            if (Math.abs(r) < 0.05) return toast('Cette ligne est déjà droite : rien à tourner.');
            rotateAngleDialog(Math.round(r * 100) / 100, {level: true});
        }, true);
        window.addEventListener('keydown', e => { if (leveling && e.key === 'Escape' && dlg.open) { e.preventDefault(); e.stopImmediatePropagation(); stopLevel(); } }, true);
        /* 📱 Une photo de téléphone « couchée » : l'orientation Exif n'est pas appliquée par ce navigateur → « ↻ Remettre droite » */
        async function checkExif() {
            const OR = ext.rtOrient; if (!OR || project || fresh || st.docXf?.length) return;
            let state = null;
            try { const r = await fetch(img0.src, {credentials: 'same-origin'}); if (!r.ok) return; state = OR.exifState(new Uint8Array(await r.arrayBuffer()), img0.naturalWidth, img0.naturalHeight); } catch (_) { return; }
            if (!state || state.applied || !state.steps.length || !dlg.isConnected || hpos > 0) return;
            const box = document.createElement('div'); box.className = 'h-rt-exif';
            box.innerHTML = window.LCNDA_UI?.notice ? window.LCNDA_UI.notice('info', 'Photo prise avec le téléphone tourné : elle est enregistrée couchée.') : '<p>Photo prise avec le téléphone tourné : elle est enregistrée couchée.</p>';
            const host = box.firstElementChild || box, b = document.createElement('button'); b.type = 'button'; b.className = 'button small'; b.dataset.rtExifFix = ''; b.textContent = '↻ Remettre droite';
            const x = document.createElement('button'); x.type = 'button'; x.className = 'icon-button small'; x.setAttribute('aria-label', 'Fermer'); x.title = 'Fermer'; x.textContent = '×';
            host.append(' ', b, x); stage.parentElement.insertBefore(box, stage);
            b.addEventListener('click', () => { box.remove(); rotateDoc(state.steps, {label: 'Photo remise droite (orientation du téléphone)'}); });
            x.addEventListener('click', () => box.remove());
        }
        async function cmd(k) {
            dlg.querySelectorAll('details.h-rt-menu[open]').forEach(d => d.removeAttribute('open'));
            const [a, b] = k.split(':');
            if (a === 'rot') return b === 'angle' ? rotateAngleDialog() : b === 'level' ? startLevel() : rotateDoc({r: b === 'cw' ? 90 : b === 'ccw' ? -90 : 180}); // 🔄 Image → Rotation de l'image
            if (a === 'flip') return rotateDoc({f: b === 'v' ? 'v' : 'h'});
            if (a === 'tab') return showTab(b);
            if (a === 'mode') return setMode(b);
            if (a === 'save') return dlg.querySelector(`[data-rt-save="${b}"]`)?.click();
            if (k === 'side:toggle') return setSideClosed(!dlg.classList.contains('rt-side-closed'));
            if (k === 'proj:save') return saveProject();
            if (k === 'proj:saveas') return saveProject(true);
            if (k === 'proj:open') return openProjects();
            if (a === 'download') return downloadFull(b === 'png' ? 'image/png' : 'image/jpeg');
            if (k === 'close') return askClose();
            if (k === 'simple') { // la retouche simple de la 0.5.0 (le choix est retenu pour la prochaine fois)
                if (!saved && hpos > 0 && !(projId && curKey() === projKey) && !await A().confirmBox('Les retouches en cours seront perdues (💾 Enregistrer le projet les garde pour plus tard).', {title: 'Passer à la retouche simple ?', okLabel: 'Passer sans enregistrer', danger: true})) return;
                try { localStorage.setItem('genealogie-retouch-mode', 'simple'); } catch (_) {}
                saved = true; dlg.close(); return ext.openRetouchSimple?.(source);
            }
            if (k === 'undo') return restore(hpos - 1);
            if (k === 'redo') return restore(hpos + 1);
            if (a === 'preset') return dlg.querySelector(`[data-rt-preset="${b}"]`)?.click();
            if (k === 'reset') return $('[data-rt-reset]').click();
            if (k === 'cropok') { endCrop(true); return setMode('adjust'); }
            if (k === 'cropclear') { if (mode === 'crop') { crop = {x: 0, y: 0, w: 1, h: 1, a: 0}; angleIn.value = 0; $('[data-rt-angle-out]').textContent = '0°'; syncCrop(); } if (st.crop) { st.crop = null; draw(); commit('Recadrage enlevé'); } return; }
            if (k === 'img:place') return placeDialog();
            if (k === 'grad:layer') return newGradLayer();
            if (k === 'hs:layer') return newHsLayer();
            if (k === 'pat:fill') return patDialog();
            if (k === 'pat:make') return patMaker();
            if (k === 'hs:photo') { activeLayer = ''; refreshLayers(); syncControls(); return showTab('props'); }
            if (k === 'tab:props') return showTab('props');
            if (k === 'actions') return actionsDialog();
            if (a === 'export') return b === 'ba' ? exportBA() : exportImage();
            if (k === 'curtain') return curtain.toggle();
            if (k === 'restore:all') return restoreAllPanel();
            if (k === 'repair:detect') return creasePanel();
            if (k === 'imgsize') return imageSizeDialog();
            if (k === 'canvassize') return canvasSizeDialog();
            if (k === 'info') return infoDialog();
            if (k === 'idphoto') return openIdPhoto();
            if (k === 'idbatch') return idpBatchDialog();
            if (a === 'psd') { if (!ext.rtPsd) return toast('Le PSD n’est pas encore prêt : réessaie dans un instant.', 'error'); if (mode === 'crop') endCrop(true); return ext.rtPsd[b === 'import' ? 'import' : 'export'](plusCtx); }
            if (a === 'plus') { // ☁️ ciel, ✂️ détourer, 🔍 agrandir (heritage-retouch-plus.js), 💧 fluidité (heritage-retouch-fluidite.js) ; 🧩 panorama (l'assemblage de photos)
                if (b === 'pano') { if (!ext.openAssembler) return toast('L’assemblage de photos n’est pas encore prêt.', 'error'); return ext.openAssembler([{id: item.id, filename: from, title: item.title || item.filename}], {pano: true}); }
                if (!ext.rtPlus?.[b]) return toast('Cet outil n’est pas encore prêt : réessaie dans un instant.', 'error');
                if (mode === 'crop') endCrop(true);
                return ext.rtPlus[b](plusCtx);
            }
            if (a === 'fx') return b === 'last' ? fxLast() : fxDialog(b);
            if (k === 'sel:subject') {
                help.textContent = 'Recherche du sujet…'; await new Promise(r => setTimeout(r, 30));
                const {mask, found} = rtSubject(photo(), pw, ph, tol); help.textContent = HELP[optsFor(mode)] || '';
                if (!found) return toast('Sujet introuvable : le fond touche tout le bord. Essaie avec moins de tolérance (🪄), ou le lasso.', 'error');
                if (!SELTOOLS.includes(mode)) setMode('wand');
                toast('Sujet sélectionné : ⇧ + baguette ou lasso pour ajouter, ⌥ pour enlever ; « Masque » pour l’appliquer. Tolérance (🪄) : jusqu’où va le fond.');
                return combine(mask, 'new', 'Sujet sélectionné');
            }
            if (k === 'straighten:auto') {
                const a = rtAutoAngle(srcData); if (Math.abs(a) < 0.25) return toast('La photo semble déjà droite.');
                const r = Math.abs(a) * Math.PI / 180, sc = Math.min(1 / (Math.cos(r) + ph / pw * Math.sin(r)), 1 / (Math.cos(r) + pw / ph * Math.sin(r)));
                const c = {x: (1 - sc) / 2, y: (1 - sc) / 2, w: sc, h: sc, a: -a};
                if (mode === 'crop') { crop = c; angleIn.value = c.a; $('[data-rt-angle-out]').textContent = c.a + '°'; syncCrop(); return toast(`Redressée de ${-a}° : ajuste le cadre puis « ✓ Valider ».`); }
                st.crop = c; draw(); toast(`Photo redressée de ${-a}° (et recadrée pour ne pas voir les coins). ⌗ Recadrer pour ajuster.`); return commit(`Redressée automatiquement (${-a}°)`);
            }
            if (k === 'persp:ok') { if (!persp) return; if (st.strokes.length && !await A().confirmBox('Des corrections (taches, tampon) sont déjà faites : elles vont bouger avec la remise à plat.', {title: 'Redresser la perspective ?', okLabel: 'Redresser'})) return; st.persp = persp.map(p => [...p]); persp = null; applyBase(); setMode('adjust'); return commit('Perspective redressée'); }
            if (k === 'persp:reset') { persp = [[0, 0], [1, 0], [1, 1], [0, 1]]; return draw(); }
            if (k === 'persp:cancel') { persp = null; return setMode('adjust'); }
            if (k === 'persp:clear') { if (!st.persp) return; st.persp = null; applyBase(); return commit('Perspective enlevée'); }
            if (k === 'deglare') { toast(`Reflets retirés sur un calque à part${selId ? ' (seulement dans la sélection : fais d’abord une sélection de la vitre pour limiter)' : ''} : règle la force et la taille, l’opacité dose, 🎭 limite, 👁 cache. La photo n’est pas touchée.`); return fxDialog('deglare'); }
            if (k === 'colorize:auto') {
                const n = newAdjust('Colorisation'); n.st.gmap = 'naturel'; n.st.gmap_amt = 75;
                if (selId) { n.mask = [{type: 'sel', mask: selId}]; }
                refreshLayers(); syncControls(); draw(); showTab('adjust'); $('[data-ui-section="rt-gmap"]')?.setAttribute('open', '');
                toast(`Colorisation dans un calque de réglage${selId ? ' (limitée à la sélection)' : ''} : choisis les couleurs et la force ; 🎭 pour la limiter, 👁 pour la cacher. La photo n’est pas touchée.`);
                return commit('Calque de colorisation');
            }
            if (k === 'colorize:paint') {
                const l = newLayer('Couleurs (pinceau)'); l.blend = 'color'; l.opacity = 0.8; maskEdit = ''; brushType = 'soft'; syncBrushType(); setColor('#e2b195'); refreshLayers(); setMode('brush'); showTab('layers');
                toast('Peins les couleurs (pinceau doux) : le calque est en fusion « Couleur », la lumière de la photo est gardée. 🧽 pour corriger, opacité du calque pour doser.');
                return commit('Calque de couleurs (pinceau)');
            }
            if (a === 'restore') { // 🧭 la restauration pas à pas
                const step = dlg.querySelector(`[data-rt-step] [data-rt-cmd="${CSS.escape(k)}"]`)?.closest('[data-rt-step]'); step?.querySelector('.h-rt-stepok')?.removeAttribute('hidden');
                if (b === 'spots') {
                    help.textContent = 'Recherche des taches…'; await new Promise(r => setTimeout(r, 30));
                    const inside = selId ? rtMaskAlpha(masks.get(selId), pw, ph) : null;
                    const dabs = rtSpots(srcData, Number($('[data-rt-spotf]')?.value || 50), Number($('[data-rt-spots]')?.value || 6), inside); help.textContent = HELP[optsFor(mode)] || '';
                    if (!dabs.length) return toast('Aucune tache trouvée : augmente la sensibilité ou la taille.');
                    const before = new Uint8ClampedArray(srcData.data); rtReplayStrokes(srcData, [{tool: 'heal', dabs}], masks); patchToLayer(before, '✨ Taches enlevées'); draw(); refreshLayers();
                    toast(`${dabs.length} tache${dabs.length > 1 ? 's' : ''} enlevée${dabs.length > 1 ? 's' : ''}, sur le calque « ✨ Taches enlevées » (la photo n’est pas touchée) : cache-le ou baisse-le pour comparer ; ↶ si c’est trop.`);
                    return commit(`Taches enlevées automatiquement (${dabs.length})`);
                }
                if (b === 'yellow') { // chaque couleur ramenée à la plage de la luminosité (sombre et clair) : la dominante (jaune, rose) s'en va, le contraste reste
                    const hs = [0, 1, 2, 3].map(() => new Uint32Array(256)), d = srcData.data, n = d.length / 4;
                    for (let i = 0; i < d.length; i += 4) { hs[0][d[i]]++; hs[1][d[i + 1]]++; hs[2][d[i + 2]]++; hs[3][Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; }
                    const pct = (h, p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n * p) return v; } return 255; };
                    const L0 = pct(hs[3], .01), L1 = Math.max(L0 + 10, pct(hs[3], .99)), mid = (L0 + L1) / 2, an = newAdjust('✨ Jaunissement enlevé'); activeLayer = an.id;
                    ['r', 'g', 'b'].forEach((c, i) => { const lo = pct(hs[i], .01), hi = Math.max(lo + 8, pct(hs[i], .99)), mc = (lo + hi) / 2, k = (L1 - L0) / (hi - lo); // la même pente pour toutes, chaque couleur recentrée
                        const f = v => Math.round(Math.max(0, Math.min(255, mid + (v - mc) * k))); an.st.curves = an.st.curves || {}; an.st.curves[c] = [[0, f(0)], [lo, L0], [hi, L1], [255, f(255)]].filter((q, j, arr) => j === 0 || q[0] > arr[j - 1][0]); });
                    refreshLayers(); syncControls(); draw(); toast('Jaunissement enlevé sur le calque de réglage « ✨ Jaunissement enlevé » : la photo n’est pas touchée.'); return commit('Jaunissement enlevé (calque de réglage)');
                }
                if (b === 'face') {
                    if (!selId) { setMode('ellipsesel'); return toast('Entoure d’abord le visage avec l’ellipse ◯ (glisse sur la photo), puis reclique « Visage plus net ».'); }
                    const n = newAdjust('Visage plus net'); n.st.filters = {chain: [{t: 'denoise2', ...fxDefaults('denoise2'), amount: 30}, {t: 'unsharp', ...fxDefaults('unsharp'), amount: 140, r: 1.4, thr: 4}]}; n.mask = [{type: 'sel', mask: selId}];
                    refreshLayers(); syncControls(); draw(); toast('Visage débruité et accentué sur un calque à part : son opacité dose l’effet.'); return commit('Visage plus net');
                }
                if (b === 'tear') { setMode('heal'); const sz = $('[data-rt-size]'); if (sz) { sz.value = 26; sz.dispatchEvent(new Event('input', {bubbles: true})); } return toast('Correcteur prêt : glisse le long de la rayure ou du pli (zoome pour être précis).'); }
                if (b === 'preset') { const i = k.slice('restore:preset:'.length), an = newAdjust(i === '1' ? '✨ Vieille photo ravivée' : '✨ Réglage automatique'); activeLayer = an.id; refreshLayers(); syncControls(); dlg.querySelector(`[data-rt-preset="${CSS.escape(i)}"]`)?.click(); return; }
                if (b === 'color') { const c = k.slice('restore:color:'.length); const l = nodeById(activeLayer); if (!(l && typeOf(l) === 'layer' && l.blend === 'color')) await cmd('colorize:paint'); setColor(c); setMode('brush'); return; }
                return;
            }
            if (k === 'ladd') { newLayer(); refreshLayers(); showTab('layers'); return commit('Nouveau calque'); }
            if (k === 'gadd') { newGroup(); refreshLayers(); showTab('layers'); return commit('Nouveau groupe'); }
            if (k === 'gwrap') { showTab('layers'); return groupWrap(); }
            if (k === 'aadd') { newAdjust(); refreshLayers(); syncControls(); draw(); showTab('adjust'); return commit('Nouveau calque de réglage'); }
            if (a === 'zoom') return ({in: () => setZoom(zoom * 1.5), out: () => setZoom(zoom / 1.5), fit: () => setZoom(1), 100: () => setZoom(scale / fitScale())})[b]?.();
            if (k === 'filters:reset') { T().filters = {}; syncControls(); return commit('Filtres enlevés'); }
            if (k === 'sel:all') return combine(full(), 'new', 'Tout sélectionner');
            if (k === 'sel:none') { if (!selId) return; selId = null; refreshLayers(); setMode(mode); draw(); return commit('Désélectionner'); }
            if (k === 'mask:add') { const id = activeLayer && nodeById(activeLayer) ? activeLayer : 'photo', t = target(id); if (!t) return toast('Choisis d’abord un calque.', 'error'); if (t.mask) return toast('Ce calque a déjà un masque.'); addMaskTo(id, []); showTab('layers'); setMode('brush'); return commit('Masque ajouté'); }
            if (k === 'mask:hideall' || k === 'mask:selhide') { // masque négatif (⌥ + 🎭 dans Photoshop)
                const id = activeLayer && nodeById(activeLayer) ? activeLayer : 'photo', t = target(id); if (!t) return toast('Choisis d’abord un calque.', 'error'); if (t.mask) return toast('Ce calque a déjà un masque.');
                if (k === 'mask:selhide' && !selId) return toast('Fais d’abord une sélection.', 'error');
                addMaskTo(id, k === 'mask:selhide' ? [{type: 'sel', mask: selId, invert: true}] : [{type: 'all', mode: 'hide'}]); showTab('layers'); setMode('brush'); return commit(k === 'mask:selhide' ? 'Masque qui cache la sélection' : 'Masque qui cache tout');
            }
            if (k === 'mask:invert' || k === 'mask:del') { const id = maskEdit || (activeLayer && nodeById(activeLayer) ? activeLayer : 'photo'), t = target(id); if (!t?.mask) return toast('Ce calque n’a pas de masque (Calque → Ajouter un masque).', 'error'); if (k === 'mask:invert') t.mask = [...t.mask, {type: 'invert'}]; else { t.mask = null; if (maskEdit === id) maskEdit = ''; setMode(mode); } refreshLayers(); draw(); return commit(k === 'mask:invert' ? 'Masque inversé' : 'Masque retiré'); }
            if (!a.startsWith('sel') && k !== 'mask:sel') return;
            if (!needSel()) return;
            const m = masks.get(selId);
            if (k === 'sel:invert') { const c = full(), g = c.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0); return combine(c, 'new', 'Sélection inversée'); }
            if (k === 'sel:feather' || k === 'sel:grow' || k === 'sel:shrink') {
                const v = Number(String(await A().askText({title: {['sel:feather']: 'Contour progressif', ['sel:grow']: 'Agrandir la sélection', ['sel:shrink']: 'Réduire la sélection'}[k], message: 'De combien de points (de l’aperçu) ?', value: '8', inputMode: 'numeric', okLabel: 'Appliquer'}) || '').replace(',', '.'));
                if (!(v > 0)) return; const r = Math.min(200, v);
                return combine(k === 'sel:feather' ? blurMask(r) : blurMask(r / 2, k === 'sel:grow' ? 8 : 247), 'new', `${{['sel:feather']: 'Contour progressif', ['sel:grow']: 'Sélection agrandie', ['sel:shrink']: 'Sélection réduite'}[k]} (${r})`);
            }
            if (k === 'sel:copy') { const l = newLayer('Copie de la sélection'); l.ops.push({type: 'pixels', mask: selId, dx: 0, dy: 0, opacity: 1}); renderLayer(l); refreshLayers(); draw(); showTab('layers'); return commit('Sélection copiée sur un calque'); }
            if (k === 'sel:fill') { let l = activeL(); if (!l || lockedDeep(l)) { l = newLayer('Remplissage'); } l.ops.push({type: 'fillmask', mask: selId, color, opacity: opac / 100}); renderLayer(l); refreshLayers(); draw(); return commit(`Sélection remplie (${color})`); }
            if (k === 'sel:clear' && !maskEdit) { const l = nodeById(activeLayer); if (typeOf(l) === 'layer' && !l.restorePatch && !lockedDeep(l)) { l.ops.push({type: 'fillmask', mask: selId, color: '#000', opacity: 1, erase: true}); renderLayer(l); refreshLayers(); draw(); return commit(`Sélection effacée sur « ${l.name} »`); } } // un calque choisi (dessin, texte, image) : effacé de lui, pas de la photo
            if (k === 'sel:clear') { st.strokes.push({tool: 'clear', mask: selId}); rtReplayStrokes(srcData, [st.strokes[st.strokes.length - 1]], masks); strokeVer++; draw(); refreshLayers(); toast('Zone effacée de la photo : elle sera transparente (image enregistrée en PNG).'); return commit('Sélection effacée'); }
            if (k === 'mask:sel') { const id = activeLayer && nodeById(activeLayer) ? activeLayer : 'photo'; if (!target(id)) return toast('Choisis d’abord un calque.', 'error'); addMaskTo(id, [{type: 'sel', mask: selId}]); showTab('layers'); return commit(`Masque d’après la sélection (${id === 'photo' ? 'photo' : target(id).name})`); }
            if (k === 'sel:crop') { const bx = maskBox(m); if (!bx) return; st.crop = {x: bx.x / pw, y: bx.y / ph, w: bx.w / pw, h: bx.h / ph, a: 0}; selId = null; refreshLayers(); draw(); return commit('Recadré sur la sélection'); }
        }
        dlg.addEventListener('input', e => { const r = e.target.closest('[data-rt-spotf],[data-rt-spots]'); if (r) dlg.querySelector(r.matches('[data-rt-spotf]') ? '[data-rt-spotf-out]' : '[data-rt-spots-out]').textContent = r.value; });
        dlg.addEventListener('click', e => {
            const c = e.target.closest('[data-rt-cmd]'); if (c) { e.preventDefault(); cmd(c.dataset.rtCmd); return; }
            if (!e.target.closest('details.h-rt-menu')) dlg.querySelectorAll('details.h-rt-menu[open]').forEach(d => d.removeAttribute('open'));
        });
        // un seul menu ouvert à la fois ; on passe de l'un à l'autre au survol (comme une vraie barre de menus)
        $$('details.h-rt-menu').forEach(d => {
            d.addEventListener('toggle', () => { if (d.open) $$('details.h-rt-menu').forEach(o => { if (o !== d) o.removeAttribute('open'); }); });
            d.querySelector('summary').addEventListener('mouseenter', () => { if ($$('details.h-rt-menu').some(o => o.open && o !== d)) d.setAttribute('open', ''); });
        });
        // ── Courbe et réglages ──
        const svg = $('[data-rt-curve]');
        const drawCurve = () => {
            const lut = curveLut(T().curves[channel]);
            $('[data-rt-line]').setAttribute('d', 'M' + Array.from(lut, (v, x) => `${x},${256 - v}`).join(' L'));
            $('[data-rt-line]').dataset.ch = channel;
            const pts = T().curves[channel];
            if (selPt >= pts.length) selPt = -1;
            $('[data-rt-points]').innerHTML = pts.map(([x, y], i) => `<circle cx="${x}" cy="${256 - y}" r="${i === selPt ? 7 : 5.5}" data-rt-pt="${i}" class="${i === selPt ? 'is-sel' : ''}${i === outside ? ' is-out' : ''}"/>`).join('');
            const del = $('[data-rt-ptdel]'); if (del) del.disabled = !(selPt >= 0 && pts.length > 2);
        };
        function syncControls() {
            [...RT_SLIDERS, ...RT_LEVELS, ['gmap_amt']].forEach(([k]) => { const v = T()[k] ?? rtDefault()[k]; $(`[data-rt="${k}"]`).value = v; $(`[data-rt-out="${k}"]`).textContent = fmtV(k, v); });
            $('[data-rt-gmap]').value = T().gmap || '';
            ['bw', 'sepia', 'invert'].forEach(k => { $(`[data-rt-t="${k}"]`).checked = !!T()[k]; });
            RT_FILTERS.forEach(([k]) => { const v = T().filters?.[k] || 0; $(`[data-rt-f="${k}"]`).value = v; $(`[data-rt-fout="${k}"]`).textContent = v; });
            const fxl = $('[data-rt-fxlist]'), an = adjNode(), ch = an?.st.filters?.chain || [];
            if (fxl) fxl.innerHTML = an ? `<div class="h-rt-fxl"><b>Filtres de ce calque</b>${ch.length ? `<ol>${ch.map((st0, i) => `<li><span>${esc(RT_FX[st0.t]?.[1] || st0.t)}</span><button type="button" class="link-button" data-rt-fxedit="${i}">régler…</button>${i ? `<button type="button" class="icon-button small" data-rt-fxup="${i}" title="Plus tôt">↑</button>` : ''}<button type="button" class="icon-button small" data-rt-fxdel="${i}" title="Enlever">✕</button></li>`).join('')}</ol>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun.</span></p>'}
                <label>＋ Ajouter <select data-rt-fxadd><option value="">un filtre…</option>${['Flou', 'Bruit', 'Netteté', 'Esthétiques', 'Artistiques', 'Pixellisation', 'Rendu', 'Déformation', 'Autres'].map(cat => `<optgroup label="${cat}">${Object.entries(RT_FX).filter(([, f]) => f[0] === cat).map(([k, f]) => `<option value="${k}">${esc(f[1])}</option>`).join('')}</optgroup>`).join('')}</select></label></div>`
                : '<p class="muted">✨ Menu <b>Filtre</b> : chaque filtre se pose sur son propre calque (rien n’est détruit) : on le règle, on le dose avec l’opacité du calque, on le limite avec un masque 🎭, on le cache 👁.</p>';
            drawCurve(); draw(); syncTarget();
        }
        const label = k => [...RT_SLIDERS, ...RT_LEVELS, ['gmap_amt', 'Colorisation']].find(x => x[0] === k)?.[1] || k;
        const fmtV = (k, v) => RT_SLIDERS.some(x => x[0] === k) && v > 0 ? '+' + v : v;
        const flabel = k => RT_FILTERS.find(x => x[0] === k)?.[1] || k;
        dlg.addEventListener('input', e => {
            const k = e.target.dataset.rt; if (k) { T()[k] = Number(e.target.value); $(`[data-rt-out="${k}"]`).textContent = fmtV(k, T()[k]); draw(); }
            const f = e.target.dataset.rtF; if (f) { T().filters = {...(T().filters || {}), [f]: Number(e.target.value)}; $(`[data-rt-fout="${f}"]`).textContent = T().filters[f]; draw(); }
        });
        dlg.addEventListener('change', e => {
            const k = e.target.dataset.rt; if (k) commit(`${label(k)} : ${fmtV(k, T()[k])}`);
            if (e.target.matches('[data-rt-gmap]')) { T().gmap = e.target.value; draw(); commit(`Colorisation : ${RT_GMAPS[T().gmap][0]}`); }
            const f = e.target.dataset.rtF; if (f) commit(`${flabel(f)} : ${T().filters[f]}`);
            const t = e.target.dataset.rtT; if (t) { T()[t] = e.target.checked; if (t === 'bw' && T().bw) T().sepia = false; if (t === 'sepia' && T().sepia) T().bw = false; syncControls(); commit(`${{bw: 'Noir et blanc', sepia: 'Sépia', invert: 'Négatif'}[t]} ${T()[t] ? 'oui' : 'non'}`); }
        });
        $$('button.h-rt-ch[data-rt-ch]').forEach(b => b.addEventListener('click', () => { channel = b.dataset.rtCh; selPt = -1; $$('button.h-rt-ch[data-rt-ch]').forEach(x => x.classList.toggle('is-active', x === b)); drawCurve(); }));
        let rtLastPreset = null; // un préréglage cliqué une 2e fois sur le même calque : retour à l'état d'avant
        $$('[data-rt-preset]').forEach(b => b.addEventListener('click', () => { const tg0 = T(), i0 = Number(b.dataset.rtPreset);
            if (rtLastPreset && rtLastPreset.tg === tg0 && rtLastPreset.i === i0 && rtLastPreset.after === JSON.stringify(snapshot())) { /* seulement si rien n'a bougé depuis (⌘Z, curseur, remise à zéro…) */ const keep0 = {strokes: tg0.strokes, filters: tg0.filters, crop: tg0.crop, persp: tg0.persp}; Object.keys(tg0).forEach(k => { if (!(k in keep0)) delete tg0[k]; }); Object.assign(tg0, JSON.parse(rtLastPreset.before)); Object.entries(keep0).forEach(([k, v]) => { if (v !== undefined) tg0[k] = v; }); rtLastPreset = null; syncControls(); commit(`Préréglage « ${RT_PRESETS[i0][0]} » retiré`); return; }
            rtLastPreset = {tg: tg0, i: i0, before: JSON.stringify({...tg0, strokes: undefined, filters: undefined, crop: undefined, persp: undefined})}; })); // (avant l'application ci-dessous)
        $$('[data-rt-preset]').forEach(b => b.addEventListener('click', () => { if (!rtLastPreset || rtLastPreset.i !== Number(b.dataset.rtPreset)) return; const tg = T(), keep = tg === st ? {bw: false, sepia: false, invert: false, strokes: st.strokes, filters: st.filters, crop: st.crop, persp: st.persp} : {bw: false, sepia: false, invert: false, filters: tg.filters}; Object.assign(tg, rtDefault(), keep); if (tg !== st) { delete tg.crop; delete tg.persp; } RT_PRESETS[Number(b.dataset.rtPreset)][1](tg); if (tg._auto) { delete tg._auto; rtAuto(srcData, tg); if (tg !== st) { delete tg.strokes; delete tg.crop; delete tg.persp; } } syncControls(); commit(`Préréglage « ${RT_PRESETS[Number(b.dataset.rtPreset)][0]} »`); rtLastPreset.after = JSON.stringify(snapshot()); }));
        $('[data-rt-lvlauto]').addEventListener('click', () => { // les 0,5 % extrêmes deviennent noir et blanc, le milieu reste au milieu
            const h = new Array(256).fill(0); let n = 0; for (let i = 0; i < srcData.data.length; i += 16) { h[Math.round(0.299 * srcData.data[i] + 0.587 * srcData.data[i + 1] + 0.114 * srcData.data[i + 2])]++; n++; }
            let lo = 0, hi = 255, acc = 0; while (lo < 250 && (acc += h[lo]) < n * 0.005) lo++; acc = 0; while (hi > lo + 5 && (acc += h[hi]) < n * 0.005) hi--;
            let mid = 0; acc = 0; while (mid < 255 && (acc += h[mid]) < n / 2) mid++;
            const t = Math.min(0.95, Math.max(0.05, (mid - lo) / Math.max(1, hi - lo))), g = Math.round(Math.min(300, Math.max(10, Math.log(t) / Math.log(0.5) * 100)));
            Object.assign(T(), {lvl_in_b: lo, lvl_in_w: hi, lvl_gamma: g}); syncControls(); commit('Niveaux automatiques');
        });
        $('[data-rt-reset]').addEventListener('click', () => { const tg = T(); Object.assign(tg, rtDefault(), tg === st ? {strokes: st.strokes, filters: st.filters, crop: st.crop, persp: st.persp} : {filters: tg.filters}); if (tg !== st) { delete tg.crop; delete tg.persp; } syncControls(); commit('Réglages remis à zéro'); });
        const before = $('[data-rt-before]');
        const setBefore = v => { showBefore = v; before.classList.toggle('is-active', v); draw(); };
        before.addEventListener('pointerdown', () => setBefore(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => before.addEventListener(t, () => showBefore && setBefore(false)));
        const rawPoint = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 268 - 6, 256 - ((e.clientY - r.top) / r.height * 268 - 6)]; };
        const svgPoint = e => rawPoint(e).map(v => Math.round(clamp255(v)));
        const removePoint = i => { const pts = T().curves[channel]; if (i < 0 || pts.length <= 2) return; pts.splice(i, 1); selPt = -1; drawCurve(); draw(); commit('Point de courbe enlevé'); };
        let dragging = -1;
        svg.setAttribute('tabindex', '0');
        svg.addEventListener('pointerdown', e => {
            const pts = T().curves[channel], hit = e.target.closest('[data-rt-pt]');
            if (hit) dragging = Number(hit.dataset.rtPt);
            else { const [x, y] = svgPoint(e); if (pts.some(p => Math.abs(p[0] - x) < 6)) return; pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); dragging = pts.findIndex(p => p[0] === x); }
            selPt = dragging; outside = -1; svg.focus(); svg.setPointerCapture(e.pointerId); drawCurve(); draw();
        });
        svg.addEventListener('pointermove', e => {
            if (dragging < 0) return;
            const pts = T().curves[channel], [rx, ry] = rawPoint(e), [x, y] = svgPoint(e);
            outside = pts.length > 2 && (rx < -30 || rx > 286 || ry < -30 || ry > 286) ? dragging : -1;
            const lo = dragging > 0 ? pts[dragging - 1][0] + 1 : 0, hi = dragging < pts.length - 1 ? pts[dragging + 1][0] - 1 : 255;
            if (outside < 0) pts[dragging] = [Math.min(hi, Math.max(lo, x)), y];
            drawCurve(); draw();
        });
        const release = () => { if (dragging >= 0 && outside === dragging) { outside = -1; removePoint(dragging); } else if (dragging >= 0) commit(`Courbe ${RT_CHANNELS.find(c => c[0] === channel)[1]}`); dragging = -1; outside = -1; drawCurve(); };
        svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
        svg.addEventListener('contextmenu', e => { const hit = e.target.closest('[data-rt-pt]'); if (!hit) return; e.preventDefault(); const i = Number(hit.dataset.rtPt); if (!window.LCNDA_UI?.contextMenu) return removePoint(i); window.LCNDA_UI.contextMenu(e, [{icon: '🗑', label: 'Supprimer ce point', danger: true, run: () => removePoint(i)}], {title: 'Point de la courbe'}); }); // K14 : le menu de l'app
        $('[data-rt-ptdel]').addEventListener('click', () => removePoint(selPt));
        // ── Clavier : outils (V M L P W C J S B U T H Z), ⌘Z / ⇧⌘Z, ⌘A ⌘D ⇧⌘I ⌘J, [ ] taille, + − 0 1 zoom, espace, ⌫ ──
        const typing = e => e.target.closest?.('input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=radio]), textarea, select, [contenteditable]');
        const onKey = e => {
            if (!dlg.open || typing(e) || document.querySelector('dialog[open].ask-text-dialog, dialog[open].confirm-box-dialog, dialog[open].rt-fmt-dlg')) return;
            const mod = (e.metaKey || e.ctrlKey) && !e.getModifierState?.('AltGraph') && !(e.ctrlKey && e.altKey && e.key === '\\'), k = e.key.toLowerCase(); // AltGr (clavier AZERTY Windows) arrive comme Ctrl+Alt : ce n'est pas un raccourci (« \ » = AltGr+8)
            if (mod && k === 'z') { e.preventDefault(); e.stopImmediatePropagation(); restore(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (mod && k === 's') { e.preventDefault(); e.stopImmediatePropagation(); saveProject(e.shiftKey); return; }
            if (mod && ['a', 'd', 'i', 'j', 'g', 'f'].includes(k)) { if (k === 'i' && !e.shiftKey) return; e.preventDefault(); e.stopImmediatePropagation(); cmd({a: 'sel:all', d: 'sel:none', i: 'sel:invert', j: 'sel:copy', g: 'gwrap', f: 'fx:last'}[k]); return; }
            if (mod) return;
            if (e.key === '\\') { const n = nodeById(maskEdit || activeLayer || 'photo'); if (!n?.mask) { toast('Ce calque n’a pas de masque.'); return; } e.preventDefault(); e.stopImmediatePropagation(); maskShow = maskShow?.id === n.id && maskShow.mode === 'ruby' ? null : {id: n.id, mode: 'ruby'}; refreshLayers(); draw(); if (maskShow) toast('Masque en rouge : ce qui est caché (touche \\ pour revenir)'); return; }
            if (e.key === 'Escape' && dlg.querySelector('details.h-rt-menu[open]')) { e.preventDefault(); e.stopImmediatePropagation(); dlg.querySelectorAll('details.h-rt-menu[open]').forEach(d => d.removeAttribute('open')); return; }
            if (e.key === 'Escape' && mode === 'persp') { e.preventDefault(); e.stopImmediatePropagation(); cmd('persp:cancel'); return; }
            if (e.key === 'Escape' && (poly || mode === 'crop' || moveSel)) { e.preventDefault(); e.stopImmediatePropagation(); if (poly) { poly = null; polyHover = null; draw(); } else if (mode === 'crop') { crop = null; setMode('adjust'); } else { moveSel = null; draw(); } return; }
            if (e.key === 'Tab' && !e.shiftKey && !e.target.closest?.('input, select, textarea, button')) { e.preventDefault(); setSideClosed(!dlg.classList.contains('rt-side-closed')); return; }
            if (e.key === 'Enter' && poly) { e.preventDefault(); finishPoly(); return; }
            if (e.key === 'Enter' && mode === 'crop') { e.preventDefault(); cmd('cropok'); return; }
            if (e.key === '[') { setSize(brush * 0.85 - 1); return; } if (e.key === ']') { setSize(brush * 1.18 + 1); return; }
            if (e.key === '+' || e.key === '=') { setZoom(zoom * 1.5); return; } if (e.key === '-') { setZoom(zoom / 1.5); return; }
            if (e.key === '0') { setZoom(1); return; } if (e.key === '1') { setZoom(scale / fitScale()); return; }
            if (e.key === ' ' && !spaceDown) { spaceDown = true; stage.classList.add('is-hand'); e.preventDefault(); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selPt >= 0 && document.activeElement === svg) { e.preventDefault(); removePoint(selPt); return; }
                if (mode === 'move' && moveSel) { e.preventDefault(); delMoveSel(); return; }
                if (selId) { e.preventDefault(); cmd('sel:clear'); return; }
                if (selPt >= 0) { e.preventDefault(); removePoint(selPt); }
                return;
            }
            if (k === 'x') { e.preventDefault(); swapColors(); return; } // X : intervertir les deux couleurs (sur un masque : cacher ↔ montrer)
            if (k === 'd' && !e.shiftKey && !e.altKey) { e.preventDefault(); defaultColors(); return; } // D : noir et blanc (sur un masque : cacher)
            if (k === 'm' && e.shiftKey) { setMode('ellipsesel'); return; }
            const t = VTOOLS.find(x => x[3] === k); if (t && !e.altKey) { pickTool(t[0]); }
        };
        const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.classList.toggle('is-hand', mode === 'hand'); } };
        window.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp); // avant les raccourcis de l'app
        // fermer : on demande s'il y a du travail non enregistré
        let saved = false;
        // 💾 Projet : tout le travail (corrections, réglages, calques, groupes, masques, sélection, recadrage) gardé pour continuer plus tard
        let projId = project?.id || 0, projName = project?.name || '', projKey = '';
        const curKey = () => JSON.stringify(snapshot());
        const statusEl = $('[data-rt-status]'), nameIn = $('[data-rt-name]'); let lastStatus = null;
        const showProj = () => {
            const now = projId && projKey === curKey() ? 'saved' : hpos > 0 || projId ? 'dirty' : '';
            if (now !== lastStatus) { lastStatus = now; if (now) window.LCNDA_UI?.savedStatus?.(statusEl, now); else statusEl.textContent = ''; }
            statusEl.title = projId ? `Projet « ${projName} » (📂 Fichier → Ouvrir un projet pour le retrouver)` : 'Pas encore enregistré comme projet : 💾 Enregistrer garde tout le travail pour continuer plus tard';
        };
        onHist = () => setTimeout(showProj, 0);
        nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });
        nameIn.addEventListener('change', async () => {
            const v = nameIn.value.trim().slice(0, 160); if (!v) { nameIn.value = projName || item.title || item.filename || ''; return; }
            if (!projId) { projName = v; return; }
            if (v === projName) return;
            try { const r = await api('rename_retouch_project', {}, {method: 'POST', body: {id: projId, name: v}}); projName = r.result?.name || v; nameIn.value = projName; } catch (err) { toast(err.message, 'error'); nameIn.value = projName; }
        });
        async function projectData() {
            const snap = snapshot(), ids = [...new Set((JSON.stringify(snap).match(/"k\d+"/g) || []).map(x => x.slice(1, -1)))], m = {};
            ids.forEach(id => { const c = masks.get(id); if (c) m[id] = c.toDataURL('image/png'); });
            return {...snap, masks: m, pw, ph, v: 1, fresh};
        }
        let projBusy = false;
        async function saveProject(asNew = false) {
            if (mode === 'persp') setMode('adjust');
            if (projBusy) return;
            let name = projName;
            if (asNew) { const n = await A().askText({title: 'Enregistrer le projet sous un autre nom', message: 'Nom du nouveau projet (pour le retrouver dans « 📂 Projets… ») :', value: `${projName || nameIn.value || item.title || 'Ma retouche'} (copie)`, okLabel: 'Enregistrer'}); if (n === null) return; name = n.trim().slice(0, 160); if (!name) return toast('Donne un nom au projet.', 'error'); }
            else if (!projId) name = (nameIn.value.trim() || item.title || 'Ma retouche').slice(0, 160); // le nom tapé dans la barre du haut
            projBusy = true; const btn = $('[data-rt-projsave]'); btn.disabled = true; window.LCNDA_UI?.savedStatus?.(statusEl, 'saving'); lastStatus = 'saving';
            try {
                const t = document.createElement('canvas'), k = Math.min(1, 320 / Math.max(pw, ph)); t.width = Math.max(1, Math.round(pw * k)); t.height = Math.max(1, Math.round(ph * k)); const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, t.width, t.height); tg.drawImage(canvas, 0, 0, t.width, t.height);
                const r = await A().api('save_retouch_project', {}, {method: 'POST', body: {id: asNew ? 0 : projId, name, media_id: item.id || 0, source: from, thumb: t.toDataURL('image/jpeg', 0.8), project: await projectData()}});
                projId = r.result.id; projName = r.result.name; nameIn.value = projName; projKey = curKey(); showProj();
            } catch (err) { window.LCNDA_UI?.savedStatus?.(statusEl, 'error'); lastStatus = 'error'; toast(err.message, 'error'); }
            finally { projBusy = false; btn.disabled = false; }
        }
        $('[data-rt-projsave]').addEventListener('click', () => saveProject());
        const openProjects = () => retouchProjectsDialog({current: projId, onOpen: async pr => { if (hpos > 0 && curKey() !== projKey && !await A().confirmBox('Les retouches en cours seront perdues.', {title: 'Ouvrir un autre projet sans enregistrer ce travail ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; saved = true; dlg.close(); await ext.openRetouchProject(pr.id); }});
        dlg.addEventListener('input', () => setTimeout(showProj, 0)); dlg.addEventListener('pointerup', () => setTimeout(showProj, 0));
        const askClose = async () => { if (!saved && hpos > 0 && !(projId && curKey() === projKey) && !await A().confirmBox('Les retouches en cours seront perdues (💾 Enregistrer le projet les garde pour plus tard).', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; saved = true; dlg.close(); };
        $$('[data-rt-close]').forEach(b => b.addEventListener('click', askClose));
        dlg.addEventListener('cancel', e => { if (e.target !== dlg) return; if (mode === 'crop' || poly) { e.preventDefault(); return; } if (!saved && hpos > 0 && !(projId && curKey() === projKey)) { e.preventDefault(); askClose(); } });
        dlg.addEventListener('close', () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp); ro.disconnect(); dlg.remove(); });
        const refreshAfter = async () => {
            const state = A().state;
            try {
                if (state.module === 'listes') await A().renderList();
                else if (state.currentPersonId && state.module === 'personnes') await A().selectPerson(state.currentPersonId, false);
                else ext.refreshView?.();
            } catch (_) {}
        };
        // ── Versions ──
        const applyShown = file => { if (file && file !== item.filename) { item.filename = item.thumbnail = file; item._cacheBust = Date.now(); A().renderLightboxItem?.(); refreshAfter(); } };
        const drawVersions = () => {
            const box = $('[data-rt-versions]');
            if (fresh) { box.hidden = true; box.style.display = 'none'; return; } // un canevas vide ou une image importée n'a pas de versions
            box.innerHTML = `<details ${versions.length > 1 && window.innerHeight > 900 ? 'open' : ''}><summary><h3>Versions de la photo (${versions.length || 1})</h3></summary><div class="h-rt-vlist">${versions.map(v => `<figure class="${v.shown ? 'is-shown' : ''} ${v.filename === from ? 'is-source' : ''}"><img src="media/${encodeURIComponent(v.filename)}" alt="" loading="lazy"><figcaption><strong>${esc(v.label)}</strong>${v.shown ? '<span class="h-rt-badge">affichée</span>' : (v.id ? `<button type="button" class="link-button" data-rt-vshow="${v.id}">Afficher par défaut</button>` : '')}
                ${v.filename !== from ? `<button type="button" class="link-button" data-rt-vfrom="${esc(v.filename)}">Retoucher celle-ci</button>` : '<small>en cours de retouche</small>'}${!v.is_original && v.id ? `<button type="button" class="link-button danger" data-rt-vdel="${v.id}">Supprimer</button>` : ''}</figcaption></figure>`).join('')}</div></details>`;
            box.querySelectorAll('[data-rt-vshow]').forEach(b => b.addEventListener('click', async () => {
                try { const r = await api('retouch_show_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rtVshow}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version affichée par défaut changée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rt-vdel]').forEach(b => b.addEventListener('click', async () => {
                if (!await A().confirmBox('L’original et les autres versions restent.', {title: 'Supprimer cette version retouchée ?', okLabel: 'Supprimer la version'})) return;
                try { const r = await api('retouch_delete_version', {}, {method: 'POST', body: {media_id: item.id, version_id: b.dataset.rtVdel}}); versions = r.result.versions; applyShown(r.result.filename); drawVersions(); toast('Version supprimée.'); }
                catch (error) { toast(error.message, 'error'); }
            }));
            box.querySelectorAll('[data-rt-vfrom]').forEach(b => b.addEventListener('click', async () => { if (!saved && hpos > 0 && !await A().confirmBox('Les retouches en cours seront perdues.', {title: 'Quitter cette retouche sans l’enregistrer ?', okLabel: 'Quitter sans enregistrer', danger: true})) return; saved = true; dlg.close(); openRetouch(b.dataset.rtVfrom); }));
        };
        drawVersions();
        // ── L'image en pleine taille : la photo retouchée (corrections, réglages, filtres, masque), les calques visibles, puis le recadrage ──
        const hasAlpha = () => { const p = P(); if (st.board?.bg === 'transparent' && (st.board.w > 1 || st.board.h > 1)) return true; if (!st.crop && (st.docXf || []).some(x => x.bg === 'transparent')) return true; return !!(st.persp || st._persp0) && (st.persp || st._persp0).some(([x, y]) => x < 0 || y < 0 || x > 1 || y > 1) || !p || !p.visible || p.opacity < 1 || !!p.mask || layers[0] !== p || st.strokes.some(s => s.tool === 'clear'); };
        async function renderFull() {
            const W = img.naturalWidth, H = img.naturalHeight;
            const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
            const fctx = pc.getContext('2d', {willReadFrequently: true}); fctx.drawImage(img, 0, 0);
            let data = fctx.getImageData(0, 0, W, H);
            if (st.persp) data = rtWarp(data, st.persp);
            if (st.strokes.length) rtReplayStrokes(data, st.strokes, masks);
            fctx.putImageData(rtApply(data, data, st), 0, 0);
            const comp = document.createElement('canvas'); comp.width = W; comp.height = H; const cg = comp.getContext('2d');
            const RF = {W, H, layer: l => { if (typeOf(l) === 'photo') return pc; const lc = blank(W, H); rtDrawLayer(lc, l, {masks, photo: pc}); return lc; }, mask: n => n.maskOff ? null : n.mask};
            // sans les annotations : la photo et ses corrections (le calque ✨ Retouches : taches, plis, tampon), rien d'autre
            const onlyPhoto = () => { const out = []; walk(layers, n => { if (n === P() || (typeOf(n) === 'layer' && n.restorePatch && n.visible)) out.push(n); }); return out; };
            cg.drawImage(renderStack($('[data-rt-merge]').checked ? layers : onlyPhoto(), null, RF), 0, 0);
            return finishOut(cropOf(comp));
        }
        /** L'original en pleine taille, avec la même perspective et le même cadre que la retouche (l'« avant ») */
        async function renderBefore() {
            const W = img.naturalWidth, H = img.naturalHeight, pc = blank(W, H), g = pc.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0);
            if (st.persp) g.putImageData(rtWarp(g.getImageData(0, 0, W, H), st.persp), 0, 0);
            return finishOut(cropOf(pc));
        }
        /* ── 📏 Taille de l'image, ⬚ zone de travail, ℹ️ informations (comme Photoshop) : gardées dans l'état de la retouche (st),
              donc dans l'historique (↶ ↷) et dans le projet enregistré ; appliquées à l'image finale (enregistrer, exporter) ── */
        const RS_METHODS = [['auto', 'Automatique'], ['smooth', 'Bicubique, plus lisse (pour agrandir)'], ['sharp', 'Bicubique, plus net (pour réduire)'], ['bilinear', 'Bilinéaire'], ['nearest', 'Au plus proche (contours nets, pixels)']];
        /** les dimensions en pleine taille : après le recadrage, après la zone de travail, puis la taille finale */
        function dimsOf() {
            const W = img.naturalWidth, H = img.naturalHeight, c = st.crop;
            const cw = Math.max(1, Math.round(c ? c.w * W : W)), ch = Math.max(1, Math.round(c ? c.h * H : H));
            const b = st.board, bw = b ? Math.max(1, Math.round(cw * b.w)) : cw, bh = b ? Math.max(1, Math.round(ch * b.h)) : ch;
            const z = st.size; let ow = bw, oh = bh;
            if (z) { ow = Math.max(1, Math.round(z.w)); oh = z.keep ? Math.max(1, Math.round(ow * bh / bw)) : Math.max(1, Math.round(z.h)); }
            return {cw, ch, bw, bh, ow, oh, dpi: z?.dpi || 0};
        }
        function finishOut(c) {
            let out = st.board ? rtCanvasSize(c, st.board) : c;
            if (st.size) { const d = dimsOf(), kx = out.width / d.bw; out = rtResample(out, d.ow * kx, d.oh * kx, st.size.method || 'auto'); }
            return out;
        }
        /** la zone de travail dessinée autour de la photo (suit le zoom), et une pastille « taille finale » */
        function paintBoard() {
            if (!wrap || !canvas) return;
            let el = wrap.querySelector('.h-rt-board'), chip = wrap.querySelector('.h-rt-sizechip');
            const b = st.board, c = st.crop && mode !== 'crop' ? st.crop : {x: 0, y: 0, w: 1, h: 1};
            if (b) {
                if (!el) { el = document.createElement('div'); el.className = 'h-rt-board'; el.setAttribute('aria-hidden', 'true'); wrap.appendChild(el); }
                const cw = canvas.offsetWidth, chh = canvas.offsetHeight, W = c.w * b.w, H = c.h * b.h, left = c.x - (W - c.w) * b.ax, top = c.y - (H - c.h) * b.ay, grow = b.w >= 1 && b.h >= 1;
                Object.assign(el.style, {left: canvas.offsetLeft + left * cw + 'px', top: canvas.offsetTop + top * chh + 'px', width: W * cw + 'px', height: H * chh + 'px', zIndex: grow ? '0' : '2', background: grow && b.bg !== 'transparent' ? b.bg : '', boxShadow: grow ? '' : '0 0 0 9999px rgba(0,0,0,.45)'});
                el.classList.toggle('is-transparent', grow && b.bg === 'transparent'); wrap.classList.add('has-board');
            } else if (el) { el.remove(); wrap.classList.remove('has-board'); }
            if (st.board || st.size) {
                const d = dimsOf(); if (!chip) { chip = document.createElement('span'); chip.className = 'h-rt-sizechip'; wrap.appendChild(chip); }
                chip.textContent = `${d.ow} × ${d.oh} px${d.dpi ? ` · ${d.dpi} ppp` : ''}`; chip.title = 'La taille de l’image enregistrée ou exportée (Image → Taille de l’image, Taille de la zone de travail)';
                Object.assign(chip.style, {left: canvas.offsetLeft + canvas.offsetWidth / 2 + 'px', top: Math.max(canvas.offsetTop + 4, canvas.offsetTop + canvas.offsetHeight - 28) + 'px', bottom: 'auto'});
            } else chip?.remove();
        }
        /** ℹ️ ce qui va dans le fichier : les informations, les noms des personnes reliées, la résolution */
        async function metaOf() {
            const info = st.info || null, ids = info?.people || [];
            let names = [];
            if (ids.length) { try { const r = await A().api('picker_search', {kind: 'person', ids: ids.join(',')}); names = (r?.groups || []).flatMap(g => g.items || []).filter(x => ids.includes(Number(x.id))).map(x => String(x.title || x.label || '').replace(/\s+/g, ' ').trim()).filter(Boolean); } catch (_) {} }
            return {info, names, dpi: st.size?.dpi || 0};
        }
        const fmtNum = (v, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
        const UNITS_RT = [['px', 'pixels'], ['pc', 'pour cent'], ['cm', 'cm'], ['mm', 'mm'], ['in', 'pouces']];
        const toPx = (v, u, dpi, base) => u === 'px' ? v : u === 'pc' ? v * base / 100 : u === 'cm' ? v / 2.54 * dpi : u === 'mm' ? v / 25.4 * dpi : v * dpi;
        const fromPx = (p, u, dpi, base) => u === 'px' ? p : u === 'pc' ? p / base * 100 : u === 'cm' ? p / dpi * 2.54 : u === 'mm' ? p / dpi * 25.4 : p / dpi;
        /** sans rééchantillonner : les pixels restent, la résolution suit la taille à l'impression */
        const dpiFor = (px, v, u) => Math.max(36, Math.min(1200, Math.round(px / (u === 'cm' ? v / 2.54 : u === 'mm' ? v / 25.4 : v))));
        const rtDialog = o => { const d = ext.openDialog(o); d.classList.add('rt-fmt-dlg'); d.dataset.dndOff = ''; return d; };
        /** 📏 Image → Taille de l'image… : largeur, hauteur (px, %, cm, mm, pouces), résolution, conserver les proportions, rééchantillonner (méthode) */
        function imageSizeDialog() {
            readyFull();
            const d0 = dimsOf(), F = window.LCNDA_FORMATS, z = st.size || {};
            const S = {w: d0.ow, h: d0.oh, dpi: z.dpi || 300, keep: z.keep !== false, resample: true, unit: 'px', method: z.method || 'auto'};
            const opt = (list, v) => list.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
            const dlgS = rtDialog({eyebrow: 'IMAGE', title: '📏 Taille de l’image', wide: true, submitLabel: 'Enregistrer',
                body: `<div class="fmt-dlg-grid"><div>
                    <fieldset><legend>Dimensions</legend>
                        ${F ? `<label><span>Ajuster à un format</span><select data-rs-fmt><option value="">— garder ces mesures —</option>${F.optionsHtml('').replace(/<option value="free"[^>]*>[^<]*<\/option>/, '')}</select></label>` : ''}
                        <div class="fmt-row"><label><span>Largeur</span><input type="number" data-rs-w min="0.01" step="any"></label><label><span>Hauteur</span><input type="number" data-rs-h min="0.01" step="any"></label><label><span>Unité</span><select data-rs-unit>${opt(UNITS_RT, 'px')}</select></label></div>
                        <label class="checkbox-line"><input type="checkbox" data-rs-keep${S.keep ? ' checked' : ''}> 🔗 Conserver les proportions</label>
                        <div class="fmt-row"><label><span>Résolution</span><input data-unit="ppp" type="number" data-rs-dpi min="36" max="1200" step="1" value="${S.dpi}"></label></div>
                        <label class="checkbox-line"><input type="checkbox" data-rs-resample checked> <span data-help="Coché : le nombre de pixels change (l’image est recalculée). Décoché : seuls la résolution et la taille à l’impression changent, les pixels restent les mêmes.">Rééchantillonner</span></label>
                        <label data-rs-mrow><span>Méthode</span><select data-rs-method>${opt(RS_METHODS, S.method)}</select></label>
                    </fieldset></div><div>
                    <dl class="fmt-before-after"><dt>Maintenant</dt><dd>${d0.ow} × ${d0.oh} px</dd><dt>Après</dt><dd data-rs-after></dd><dt>À l’impression</dt><dd data-rs-print></dd><dt>Poids</dt><dd data-rs-mb></dd></dl>
                    <p class="muted" data-rs-a5></p>
                    ${st.size ? '<p><button type="button" class="button small secondary" data-rs-orig>↺ Remettre la taille d’origine</button></p>' : ''}
                    <p class="muted">La photo reste en pleine qualité pendant la retouche : la taille choisie s’applique quand tu enregistres ou exportes l’image. ↶ Annuler (⌘Z) revient à la taille d’avant.</p></div></div>`,
                onOpen: d => {
                    const q = s0 => d.querySelector(s0), wI = q('[data-rs-w]'), hI = q('[data-rs-h]'), uS = q('[data-rs-unit]'), dI = q('[data-rs-dpi]'), kC = q('[data-rs-keep]'), rC = q('[data-rs-resample]');
                    const ratio = d0.bw / d0.bh;
                    const paint = () => { const u = S.unit; wI.value = fmtNum(fromPx(S.w, u, S.dpi, d0.ow), u === 'px' ? 0 : 2).replace(',', '.'); hI.value = fmtNum(fromPx(S.h, u, S.dpi, d0.oh), u === 'px' ? 0 : 2).replace(',', '.'); dI.value = S.dpi;
                        q('[data-rs-mrow]').hidden = !S.resample; [...uS.options].forEach(o => { o.disabled = !S.resample && (o.value === 'px' || o.value === 'pc'); });
                        q('[data-rs-after]').textContent = `${Math.round(S.w)} × ${Math.round(S.h)} px`; q('[data-rs-print]').textContent = `${fmtNum(S.w / S.dpi * 2.54, 1)} × ${fmtNum(S.h / S.dpi * 2.54, 1)} cm à ${S.dpi} ppp`;
                        q('[data-rs-mb]').textContent = `≈ ${fmtNum(S.w * S.h * 4 / 1048576, 1)} Mo en mémoire`;
                        const a5 = Math.min(S.w, S.h) / S.dpi * 25.4 >= 140 && Math.max(S.w, S.h) / S.dpi * 25.4 >= 200; q('[data-rs-a5]').textContent = Math.min(S.w, S.h) >= 1748 && Math.max(S.w, S.h) >= 2480 ? '✓ Assez grande pour imprimer en A5 à 300 ppp.' : a5 ? '' : '⚠️ Trop petite pour imprimer en A5 à 300 ppp (il faut 1748 × 2480 px).'; };
                    const setW = px => { S.w = Math.max(1, px); if (S.keep) S.h = Math.max(1, S.w / ratio); };
                    const setH = px => { S.h = Math.max(1, px); if (S.keep) S.w = Math.max(1, S.h * ratio); };
                    wI.addEventListener('change', () => { const v = Number(wI.value); if (!(v > 0)) return paint(); if (S.resample) setW(toPx(v, S.unit, S.dpi, d0.ow)); else S.dpi = dpiFor(S.w, v, S.unit); q('[data-rs-fmt]') && (q('[data-rs-fmt]').value = ''); paint(); });
                    hI.addEventListener('change', () => { const v = Number(hI.value); if (!(v > 0)) return paint(); if (S.resample) setH(toPx(v, S.unit, S.dpi, d0.oh)); else S.dpi = dpiFor(S.h, v, S.unit); q('[data-rs-fmt]') && (q('[data-rs-fmt]').value = ''); paint(); });
                    uS.addEventListener('change', () => { S.unit = uS.value; paint(); });
                    dI.addEventListener('change', () => { const v = Math.max(36, Math.min(1200, Math.round(Number(dI.value) || 300))); if (!S.resample) S.dpi = v; else if (S.unit !== 'px' && S.unit !== 'pc') { const wv = fromPx(S.w, S.unit, S.dpi, d0.ow), hv = fromPx(S.h, S.unit, S.dpi, d0.oh); S.dpi = v; S.w = Math.max(1, toPx(wv, S.unit, v, d0.ow)); S.h = Math.max(1, toPx(hv, S.unit, v, d0.oh)); } else S.dpi = v; paint(); });
                    kC.addEventListener('change', () => { S.keep = kC.checked; if (S.keep) S.h = Math.max(1, S.w / ratio); paint(); });
                    rC.addEventListener('change', () => { S.resample = rC.checked; if (!S.resample) { S.w = d0.bw; S.h = d0.bh; S.keep = true; kC.checked = true; if (S.unit === 'px' || S.unit === 'pc') S.unit = 'cm'; uS.value = S.unit; } paint(); });
                    q('[data-rs-fmt]')?.addEventListener('change', e => { const p = F.find(e.target.value); if (!p) return; let [fw, fh] = p.unit === 'px' ? [p.w, p.h] : F.inPx({...p, dpi: S.dpi}, S.dpi); if ((fw > fh) !== (ratio > 1) && p.group !== 'Écrans') [fw, fh] = [fh, fw];
                        if (S.keep) { const k = Math.min(fw / d0.bw, fh / d0.bh); S.w = Math.max(1, d0.bw * k); S.h = Math.max(1, d0.bh * k); } else { S.w = fw; S.h = fh; } S.resample = true; rC.checked = true; paint(); });
                    q('[data-rs-orig]')?.addEventListener('click', () => { st.size = null; d.close(); draw(); commit('Taille d’origine'); paintBoard(); });
                    d._rs = S; paint();
                },
                onSubmit: f => {
                    const S2 = f.closest('dialog')._rs; if (!S2) return;
                    const w = Math.round(S2.w), h = Math.round(S2.h);
                    if (w < 1 || h < 1 || w > 30000 || h > 30000 || w * h > 2.6e8) return window.LCNDA_UI?.fail ? window.LCNDA_UI.fail(f.querySelector('[data-rs-w]'), 'Choisis une taille entre 1 et 30 000 pixels de côté (260 millions de pixels au plus).') : false;
                    const same = w === d0.bw && h === d0.bh;
                    st.size = same && S2.dpi === (st.size?.dpi || 0) ? null : {w, h, keep: !!S2.keep, dpi: S2.dpi, method: f.querySelector('[data-rs-method]').value || 'auto'};
                    commit(st.size ? `Taille de l’image : ${w} × ${h} px` : 'Taille d’origine'); paintBoard();
                }});
            return dlgS;
        }
        /** ⬚ Image → Taille de la zone de travail… : agrandir ou recadrer la toile, ancrage sur 9 points, couleur de fond (C2) ou transparent */
        function canvasSizeDialog() {
            readyFull();
            // tout se compte en pixels de l'image finale (après Taille de l'image) : « + 200 px » ajoute 200 px au fichier
            const d0 = dimsOf(), b0 = st.board || {w: 1, h: 1, ax: 0.5, ay: 0.5, bg: '#ffffff'}, dpi = st.size?.dpi || 300, f0 = d0.ow / d0.bw;
            const cur = {w: d0.ow, h: d0.oh}, base = {w: d0.cw * f0, h: d0.ch * f0};
            const S = {w: cur.w, h: cur.h, ax: b0.ax, ay: b0.ay, unit: 'px', rel: false};
            const ARROWS = ['⬉', '⬆', '⬈', '⬅', '●', '➡', '⬋', '⬇', '⬊']; // (pas ↑ ↓ : ce sont les flèches de rangement des listes, heritage-dnd.js)
            const dlgC = rtDialog({eyebrow: 'IMAGE', title: '⬚ Taille de la zone de travail', wide: true, submitLabel: 'Enregistrer',
                body: `<div class="fmt-dlg-grid"><div>
                    <fieldset><legend>Nouvelle taille</legend>
                        <div class="fmt-row"><label><span>Largeur</span><input type="number" data-cs-w step="any"></label><label><span>Hauteur</span><input type="number" data-cs-h step="any"></label><label><span>Unité</span><select data-cs-unit>${UNITS_RT.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label></div>
                        <label class="checkbox-line"><input type="checkbox" data-cs-rel> <span data-help="Coché : tu écris ce qu’on ajoute (ou enlève, avec un nombre négatif) autour de l’image.">Relative (ajouter à la taille actuelle)</span></label>
                    </fieldset>
                    <fieldset><legend>Ancrage</legend><div class="fmt-anchor" role="radiogroup" aria-label="Où reste l’image">${ARROWS.map((a, k) => `<button type="button" role="radio" data-cs-anchor="${k}" aria-label="${['En haut à gauche', 'En haut', 'En haut à droite', 'À gauche', 'Au centre', 'À droite', 'En bas à gauche', 'En bas', 'En bas à droite'][k]}">${a}</button>`).join('')}</div><small class="muted">L’image reste à cet endroit ; la toile s’agrandit (ou se coupe) autour.</small></fieldset>
                    <fieldset><legend>Fond de la zone ajoutée</legend><label class="checkbox-line"><input type="checkbox" data-cs-transp${b0.bg === 'transparent' ? ' checked' : ''}> Transparent (PNG)</label><label data-cs-bgrow${b0.bg === 'transparent' ? ' hidden' : ''}><span>Couleur</span><input type="color" data-cs-bg value="${esc(/^#[0-9a-f]{6}$/i.test(b0.bg) ? b0.bg : '#ffffff')}"></label></fieldset>
                </div><div>
                    <dl class="fmt-before-after"><dt>Maintenant</dt><dd>${cur.w} × ${cur.h} px</dd><dt>Après</dt><dd data-cs-after></dd><dt>À l’impression</dt><dd data-cs-print></dd></dl>
                    ${st.board ? '<p><button type="button" class="button small secondary" data-cs-orig>↺ Remettre la zone de départ</button></p>' : ''}
                    <p class="muted">↶ Annuler (⌘Z) revient à la zone d’avant.</p></div></div>`,
                onOpen: d => {
                    const q = s0 => d.querySelector(s0), wI = q('[data-cs-w]'), hI = q('[data-cs-h]'), uS = q('[data-cs-unit]'), rC = q('[data-cs-rel]');
                    const shown = (px, base, cur) => S.rel ? fromPx(px - cur, S.unit, dpi, base) : fromPx(px, S.unit, dpi, base);
                    const paint = () => { wI.value = String(Math.round(shown(S.w, base.w, cur.w) * (S.unit === 'px' ? 1 : 100)) / (S.unit === 'px' ? 1 : 100)); hI.value = String(Math.round(shown(S.h, base.h, cur.h) * (S.unit === 'px' ? 1 : 100)) / (S.unit === 'px' ? 1 : 100));
                        d.querySelectorAll('[data-cs-anchor]').forEach(b => { const k = Number(b.dataset.csAnchor), on = k % 3 / 2 === S.ax && Math.floor(k / 3) / 2 === S.ay; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
                        q('[data-cs-after]').textContent = `${Math.round(S.w)} × ${Math.round(S.h)} px`; q('[data-cs-print]').textContent = `${fmtNum(S.w / dpi * 2.54, 1)} × ${fmtNum(S.h / dpi * 2.54, 1)} cm à ${dpi} ppp`; };
                    const read = (inp, base, cur) => { const v = Number(inp.value); if (!Number.isFinite(v)) return null; const px = S.rel ? cur + toPx(v, S.unit, dpi, base) : toPx(v, S.unit, dpi, base); return px >= 1 ? px : null; };
                    wI.addEventListener('change', () => { const v = read(wI, base.w, cur.w); if (v) S.w = v; paint(); });
                    hI.addEventListener('change', () => { const v = read(hI, base.h, cur.h); if (v) S.h = v; paint(); });
                    uS.addEventListener('change', () => { S.unit = uS.value; paint(); });
                    rC.addEventListener('change', () => { S.rel = rC.checked; paint(); });
                    d.addEventListener('click', e => { const b = e.target.closest('[data-cs-anchor]'); if (!b) return; const k = Number(b.dataset.csAnchor); S.ax = k % 3 / 2; S.ay = Math.floor(k / 3) / 2; paint(); });
                    d.addEventListener('keydown', e => { const b = e.target.closest?.('[data-cs-anchor]'); if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); let k = Number(b.dataset.csAnchor); k = e.key === 'ArrowLeft' ? (k % 3 ? k - 1 : k) : e.key === 'ArrowRight' ? (k % 3 < 2 ? k + 1 : k) : e.key === 'ArrowUp' ? (k > 2 ? k - 3 : k) : (k < 6 ? k + 3 : k); S.ax = k % 3 / 2; S.ay = Math.floor(k / 3) / 2; paint(); d.querySelector(`[data-cs-anchor="${k}"]`)?.focus(); });
                    q('[data-cs-transp]').addEventListener('change', e => { q('[data-cs-bgrow]').hidden = e.target.checked; });
                    q('[data-cs-orig]')?.addEventListener('click', () => { st.board = null; d.close(); draw(); commit('Zone de travail de départ'); paintBoard(); });
                    d._cs = S; paint();
                },
                onSubmit: f => {
                    const S2 = f.closest('dialog')._cs; if (!S2) return;
                    const w = Math.round(S2.w), h = Math.round(S2.h);
                    if (w < 1 || h < 1 || w > 30000 || h > 30000 || w * h > 2.6e8) return window.LCNDA_UI?.fail ? window.LCNDA_UI.fail(f.querySelector('[data-cs-w]'), 'Choisis une taille entre 1 et 30 000 pixels de côté.') : false;
                    const bg = f.querySelector('[data-cs-transp]').checked ? 'transparent' : (/^#[0-9a-f]{6}$/i.test(f.querySelector('[data-cs-bg]').value) ? f.querySelector('[data-cs-bg]').value : '#ffffff');
                    st.board = Math.abs(w - base.w) < 1 && Math.abs(h - base.h) < 1 ? null : {w: w / base.w, h: h / base.h, ax: S2.ax, ay: S2.ay, bg};
                    if (st.size) st.size = {...st.size, w, h, keep: true}; // la taille finale suit la nouvelle zone
                    draw(); commit(st.board ? `Zone de travail : ${w} × ${h} px` : 'Zone de travail de départ'); paintBoard();
                }});
            return dlgC;
        }
        /** ℹ️ Fichier → Informations… : titre, auteur, droits, description, mots-clés, date, personnes reliées (dans le fichier enregistré ou exporté) */
        async function infoDialog() {
            const F = window.LCNDA_FORMATS; if (!F) return;
            const v = await F.openInfoDialog({title: 'Informations de l’image', value: {title: docTitle(), ...(st.info || {})}, keys: ['title', 'author', 'rights', 'desc', 'keywords', 'date', 'people'], what: 'Ces informations sont écrites dans l’image enregistrée ou exportée (XMP, lisible par Photoshop, Lightroom, l’Explorateur…).'});
            if (!v) return;
            st.info = Object.keys(v).length ? v : null; if (!st.info) delete st.info;
            commit('Informations de l’image');
        }
        function cropOf(comp) {
            const W = comp.width, H = comp.height;
            if (!st.crop) return comp;
            const c = st.crop, oc = document.createElement('canvas'); oc.width = Math.max(1, Math.round(c.w * W)); oc.height = Math.max(1, Math.round(c.h * H));
            const og = oc.getContext('2d'); if (!hasAlpha()) { og.fillStyle = '#fff'; og.fillRect(0, 0, oc.width, oc.height); }
            og.translate(-c.x * W, -c.y * H); og.translate(W / 2, H / 2); og.rotate(c.a * Math.PI / 180); og.translate(-W / 2, -H / 2); og.drawImage(comp, 0, 0);
            return oc;
        }
        $$('[data-rt-save]').forEach(b => b.addEventListener('click', async () => {
            if (mode === 'persp') setMode('adjust'); // la perspective en cours de réglage : on garde celle d'avant
            const saveMode = b.dataset.rtSave, label0 = b.textContent;
            const mpx = img.naturalWidth * img.naturalHeight / 1e6;
            if (mpx > 60 && !await A().confirmBox(`Cette image est très grande (${Math.round(mpx)} millions de points) : l’enregistrement peut être long, voire échouer.`, {title: 'Enregistrer quand même ?', okLabel: 'Enregistrer'})) return;
            if (mode === 'crop') endCrop(true);
            $$('.modal-actions button').forEach(x => { x.disabled = true; });
            b.textContent = 'Enregistrement…';
            try {
                const fullC = await renderFull();
                const ext0 = String(from || '').split('.').pop().toLowerCase();
                const type = hasAlpha() ? 'image/png' : ext0 === 'png' ? 'image/png' : ext0 === 'webp' ? 'image/webp' : ext0 === 'gif' ? 'image/png' : 'image/jpeg';
                let blob = await new Promise(res => fullC.toBlob(res, type, 0.93));
                if (!blob) throw new Error('Image trop grande pour être enregistrée par le navigateur.');
                blob = await rtEmbedMeta(blob, await metaOf()); // ℹ️ les informations et la résolution dans le fichier
                const fd = new FormData(); fd.append('file', blob, 'retouche.' + (type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1])); fd.append('media_id', item.id); fd.append('mode', saveMode === 'copy' ? 'copy' : 'version'); fd.append('show', saveMode === 'show' ? '1' : '0'); fd.append('csrf', A().state.csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                saved = true;
                if (saveMode === 'copy') { toast('Copie retouchée ajoutée aux mêmes fiches.'); dlg.close(); refreshAfter(); return; }
                if (saveMode === 'show') { applyShown(j.result.filename); toast(fresh ? 'Image enregistrée dans les Médias.' : 'Nouvelle version affichée. L’original est gardé dans les versions.'); dlg.close(); return; } // un canevas vide n'a pas de « versions » à montrer
                versions = j.result.versions; toast('Version enregistrée (non affichée).'); dlg.close();
            } catch (error) {
                toast(error.message, 'error');
                $$('.modal-actions button').forEach(x => { x.disabled = false; });
                b.textContent = label0;
            }
        }));
        dlg.showModal(); stage.tabIndex = -1; stage.focus({preventScroll: true}); // les touches des outils marchent tout de suite (pas dans la case du nom)
        photo(); setMode('adjust'); if (tab) showTab(tab);
        try { if (localStorage.getItem('genealogie-retouch-side-closed') === '1') setSideClosed(true); } catch (_) {}
        commit('Ouverture de la photo');
        if (restoreAll) setTimeout(() => cmd('restore:all'), 60);
        if (idphoto) setTimeout(() => cmd('idphoto'), 60);
        if (project?.project) { // un projet rouvert : ses masques (images), puis tout son état, comme une étape de l'historique
            const d = project.project;
            try {
                setDoc(d.st?.docXf); // 🔄 un projet tourné : ses masques sont à la taille de l'image tournée
                const imgIds = new Set(); (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.type === 'image' && typeof v.mask === 'string') imgIds.add(v.mask); Object.values(v).forEach(walk); } })(d.layers);
                for (const [id, src] of Object.entries(d.masks || {})) { if (!/^k\d+$/.test(id) || !/^data:image\/png;base64,/.test(src)) continue; const im = new Image(); im.src = src; await im.decode(); const c = imgIds.has(id) ? Object.assign(document.createElement('canvas'), {width: im.naturalWidth, height: im.naturalHeight}) : blankMask(); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); masks.set(id, c); maskSeq = Math.max(maskSeq, Number(id.slice(1)) || 0); } // une image placée garde sa vraie taille
                const snap = {st: {...rtDefault(), ...(d.st || {}), strokes: undefined}, strokes: Array.isArray(d.strokes) ? d.strokes : [], layers: Array.isArray(d.layers) ? d.layers : [], activeLayer: String(d.activeLayer || ''), photoL: d.photoL || {}, selId: d.selId && masks.has(d.selId) ? d.selId : null};
                history.push({label: `Projet « ${project.name} » rouvert`, at: new Date(), snap: rtClone(snap)}); restore(history.length - 1);
                projKey = curKey();
                if (d.pw && (d.pw !== pw || d.ph !== ph)) toast('La photo de départ n’a plus la même taille : vérifie les calques.', 'error');
            } catch (err) { toast('Projet en partie illisible : ' + err.message, 'error'); }
        }
        showProj();
        refreshLayers();
        syncControls();
        requestAnimationFrame(() => setZoom(1));
        checkExif();
    }
    /** 📂 Les projets de retouche enregistrés : ouvrir, renommer, supprimer */
    async function retouchProjectsDialog({current = 0, onOpen} = {}) {
        let list = []; try { list = (await api('retouch_projects')).projects || []; } catch (e) { return toast(e.message, 'error'); }
        const when = d => window.LCNDA_UI?.when?.(d, {label: 'Modifié'}) || ''; // K4 : HTML <time>
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-rt-projdlg';
        const draw = () => { dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎚️ RETOUCHE</span><h2>Projets de retouche</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            ${list.length ? `<div class="h-rt-plist">${list.map(p => `<div class="h-rt-prow${p.id === current ? ' is-cur' : ''}${p.exists ? '' : ' is-missing'}"><button type="button" class="h-rt-popen" data-open="${p.id}" ${p.exists ? '' : 'disabled'}>${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="h-rt-pico">🎚️</span>'}<span><b>${esc(p.name)}</b><small>${esc(p.media_title || p.source)} · ${when(p.updated_at)}${p.exists ? '' : ' · photo de départ introuvable'}</small></span></button><button type="button" class="icon-button small" data-ren="${p.id}" title="Renommer">✎</button><button type="button" class="icon-button small" data-del="${p.id}" title="Supprimer le projet (les photos et leurs versions restent)">🗑</button></div>`).join('')}</div>`
                : A().emptyState({icon: '🖼️', text: 'Aucun projet de retouche pour l’instant', hint: 'Dans la Retouche, « 💾 Enregistrer le projet ».'})}<div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button></div>`; };
        draw(); document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.x !== undefined) return dlg.close();
            try {
                if (b.dataset.open) { const p = list.find(x => x.id === Number(b.dataset.open)); if (await onOpen?.(p) === false) return; dlg.close(); return; }
                if (b.dataset.ren) { const p = list.find(x => x.id === Number(b.dataset.ren)), n = await A().askText({title: 'Renommer le projet', message: 'Nouveau nom :', value: p.name, okLabel: 'Renommer'}); if (!n?.trim()) return; const r = await api('rename_retouch_project', {}, {method: 'POST', body: {id: p.id, name: n}}); p.name = r.result.name; return draw(); }
                if (b.dataset.del) { const p = list.find(x => x.id === Number(b.dataset.del)); if (!await A().confirmBox('La photo et ses versions restent.', {title: `Supprimer le projet « ${p.name} » ?`, okLabel: 'Supprimer le projet'})) return; await api('delete_retouch_project', {}, {method: 'POST', body: {id: p.id}}); list = list.filter(x => x !== p); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        });
    }
    ext.openRetouchProject = async id => {
        let pr; try { pr = await api('retouch_project', {id}); } catch (e) { return toast(e.message, 'error'); }
        const st = A().state; st.lightboxMedia = [{id: pr.media_id, filename: pr.source, thumbnail: pr.source, title: pr.media_title || pr.name, media_type: 'image'}]; st.lightboxIndex = 0;
        return openRetouch(pr.source, pr);
    };
    ext.openRetouchProjects = () => retouchProjectsDialog({onOpen: p => ext.openRetouchProject(p.id)});
    ext.retouchDrawOp = rtDrawOp; // pour les essais
    document.addEventListener('click', e => { if (e.target.closest('#retouch-media')) openRetouch(); });
    ext.openRetouch = openRetouch;

    /** Listes → Médias → « 🎚️ Retoucher » : une photo de l'app (les plus récentes, ou filtrées) ou une photo importée, puis la Retouche */
    /** ⬜ Canevas vide : une image de la taille voulue (blanche, transparente ou d'une couleur), ajoutée aux Médias ; done(média) l'ouvre */
    function blankCanvasDialog(done) {
            const SIZES = [['1920x1080', 'Écran 16:9 — 1920 × 1080'], ['1080x1080', 'Carré — 1080 × 1080'], ['1240x1754', 'A4 portrait (150 dpi) — 1240 × 1754'], ['1754x1240', 'A4 paysage (150 dpi) — 1754 × 1240'], ['2480x3508', 'A4 portrait (300 dpi) — 2480 × 3508'], ['1500x2100', 'Carte postale — 1500 × 2100'], ['custom', 'Autre taille…']];
            ext.openDialog({eyebrow: 'RETOUCHE', title: '⬜ Partir d’un canevas vide', submitLabel: 'Créer et ouvrir',
                body: `<div class="form-grid"><label class="span-2">Format<select name="size">${SIZES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                    <label>Largeur<input data-unit="px" type="number" name="w" value="1920" min="16" max="8000"></label><label>Hauteur<input data-unit="px" type="number" name="h" value="1080" min="16" max="8000"></label>
                    <label>Fond<select name="bg"><option value="white">Blanc</option><option value="transparent">Transparent</option><option value="color">Une couleur…</option></select></label><label>Couleur du fond<input type="color" name="color" value="#f3ece4"></label>
                    <label class="span-2">Nom<input name="title" value="Canevas" maxlength="200"></label></div><p class="muted">Le canevas est ajouté aux Médias ; on y met ensuite des calques, des groupes, du texte, des formes, des photos (Sélection → calque)…</p>`,
                onOpen: d => { const sz = d.querySelector('[name=size]'), w = d.querySelector('[name=w]'), h = d.querySelector('[name=h]'); sz.addEventListener('change', () => { if (sz.value !== 'custom') { const [a, b] = sz.value.split('x'); w.value = a; h.value = b; } }); [w, h].forEach(x => x.addEventListener('input', () => { sz.value = SIZES.find(([k]) => k === `${w.value}x${h.value}`)?.[0] || 'custom'; })); },
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), W = Math.round(Number(f.w)), H = Math.round(Number(f.h));
                    if (!(W >= 16 && H >= 16 && W <= 8000 && H <= 8000)) { toast('Taille entre 16 et 8 000 pixels de côté.', 'error'); return false; }
                    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
                    if (f.bg !== 'transparent') { g.fillStyle = f.bg === 'color' ? f.color : '#ffffff'; g.fillRect(0, 0, W, H); }
                    const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) { toast('Canevas trop grand pour le navigateur.', 'error'); return false; }
                    const fd = new FormData(); fd.append('file', blob, 'canevas.png'); fd.append('kind', 'image'); fd.append('title', (f.title || 'Canevas').trim().slice(0, 300));
                    const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                    const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                    if (!r.ok || j.error) { toast(j.error || 'Création impossible.', 'error'); return false; }
                    if (A().state.module === 'listes') Promise.resolve(A().renderList?.()).catch(() => {});
                    done({id: j.result.media_id, filename: j.result.filename, thumbnail: j.result.filename, title: fd.get('title'), media_type: 'image', fresh: true});
                },
            });
    }
    // un canevas vide s'ouvre dans la retouche complète (calques, texte, formes), pas dans la retouche rapide
    const openCanvas = item => { const st = A().state; st.lightboxMedia = [item]; st.lightboxIndex = 0; openRetouch('', null, {advanced: true}); };
    ext.newBlankCanvas = () => blankCanvasDialog(openCanvas);
    async function pickRetouch({restore = false} = {}) {
        const open = item => { const st = A().state; st.lightboxMedia = [item]; st.lightboxIndex = 0; openRetouch('', null, restore ? {advanced: true, tab: 'restore'} : {}); };
        const P = window.LCNDA_PICKER; if (!P?.openMediaPicker) return toast('La fenêtre des images n’est pas encore prête. Réessaie dans un instant.', 'error');
        // la fenêtre unique des médias, avec « 📂 Projets » et « ⬜ Canevas vide » en plus
        const m = await P.openMediaPicker({types: ['image'], eyebrow: 'RETOUCHE', title: restore ? 'Quelle photo restaurer ?' : 'Quelle photo retoucher ?', okLabel: restore ? 'Restaurer cette photo' : 'Retoucher cette photo',
            intro: 'Une photo importée est ajoutée aux Médias (sans être rattachée à une fiche) ; ses retouches sont gardées comme versions.',
            extra: '<button type="button" class="mpk-chip" data-projects title="Rouvrir un travail de retouche enregistré">📂 Projets</button><button type="button" class="mpk-chip" data-blank title="Une image vide, pour dessiner, écrire ou assembler des calques">⬜ Canevas vide</button>',
            onOpen: (dlg, {close}) => {
                dlg.querySelector('[data-projects]').addEventListener('click', () => retouchProjectsDialog({onOpen: async p => { close(); await ext.openRetouchProject(p.id); }}));
                // ⬜ Canevas vide : une image de la taille voulue (blanche, transparente ou d'une couleur), ajoutée aux Médias puis ouverte
                dlg.querySelector('[data-blank]').addEventListener('click', () => blankCanvasDialog(item => { close(); openCanvas(item); }));
            }});
        if (!m) return;
        if (m.imported && A().state.module === 'listes') Promise.resolve(A().renderList?.()).catch(() => {});
        open({...m, thumbnail: m.thumbnail || m.filename, media_type: 'image'});
    }
    ext.pickRetouch = pickRetouch;
    ext.openRestore = () => pickRetouch({restore: true}); // 🧭 restaurer une vieille photo, pas à pas
})();
