/* LCNDA — 📈 L'onglet Diagrammes du haut (maquette VALIDÉE : docs/design/onglet-diagrammes.html, partie « Décisions »).
 *
 *  Caché au départ, il s'allume comme 📊 Données (Réglages → Menus, ou « ＋ Ajouter un onglet » : genealogie-menu-hidden / -added).
 *  Allumé, TOUT s'ouvre ici : un diagramme posé sur une fiche, la liste de Graphiques → « Mes diagrammes », Listes → « Graphiques et
 *  diagrammes » (heritage-diagrams.js : ext.openDiagram(id) choisit l'onglet ou Graphiques). Éteint : rien ne change.
 *  C'est le MÊME outil (heritage-diagrams.js) : la même galerie (chooseType) et le même éditeur (openEditor), posés DANS la page
 *  (option host) au lieu d'une fenêtre : pleine largeur, « Diagrammes › Dossier › Nom », ↶ ↷, enregistré tout seul, « ← Mes diagrammes ».
 *  ＋ Nouveau : trois portes — 💬 « Je veux représenter… » (heritage-diagram-assistant.js), 🖼 un dessin (✨ conseillés d'abord :
 *  genealogie-diagrammes-conseilles, puis « Tous », ⭐ modèles), 📊 « Partir des données » (heritage-diagram-donnees.js).
 *  La colonne : chercher, ＋ Nouveau, 🗂 Tous (N), puis des groupes qui se replient : ⭐ Favoris, 🕘 Récents, 📁 Dossiers (les MÊMES que
 *  Graphiques : app-side-folders.js, genealogie-side-folders partie « diagram », 3 niveaux, un dossier par diagramme ; glisser une carte
 *  sur un dossier), 🔄 À jour / 📌 Figés, 🧩 Modèles, 🗑 Corbeille ; « Réordonner » (l'ordre des groupes, ceux qui s'affichent).
 *  L'accueil : « Tous mes diagrammes », vignettes (le vrai dessin, en petit PNG gardé en mémoire) ou liste, les plus récents d'abord,
 *  un tri, « Filtrer ▾ » (type, source, personne, à jour / figé, posé où), ⭐, « Utilisé dans », ⋯, « ☑ Choisir » (barre en bas).
 *  ⭐ favori, 🗑 corbeille (30 jours, vidée toute seule au chargement) et 🕘 ouvert récemment : sur le serveur (lib/diagrams.php :
 *  colonnes favorite, deleted_at, opened_at — ajoutées aux bases d'avant). Supprimer = la corbeille, sans question, avec ↶ Annuler.
 *  Là où il était posé : « Diagramme à la corbeille — Remettre ».
 *  Ce qui sort (PNG, SVG, PDF, fichier, Envoyer vers…, panier) : sans les personnes vivantes, figé (resolveLive(spec, {share: true})).
 *  Mode consultation : on voit, on ouvre (en lecture), on exporte ; pas de ＋, de ⭐, de dossier, de corbeille ; ⋯ = Ouvrir, Exporter.
 *  Réglages : genealogie-diagrammes-onglet {view, start, folder, thumbs, ask, graphs, groups, hidden} ; lcnda-diagrammes-ouvert (le dernier
 *  ouvert, sur ce navigateur) ; lcnda-diagrammes-groupes (groupes repliés) ; lcnda-diagrammes-vignettes (les vignettes).
 *  Adresses : #diagrammes, /favoris, /recents, /a-jour, /figes, /dossier/aucun, /dossier/f_…, /corbeille, /modeles/N, /nouveau(/dessin|/donnees), /12.
 *  API : LCNDA_EXT.diagrammesOnglet = {on, setOn, open, edit, create, trash, restore, render, sidebar, hash, refresh, saved, prefs, current}
 *  Essai : tests/test-onglet-diagrammes.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const I = () => ext.diagramsInternals || {};
    const R = () => ext.diagramRender;
    const SF = () => window.LCNDA_SIDE_FOLDERS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (_) {} };
    const readJ = (k, d) => { try { const v = JSON.parse(readLS(k, 'null')); return v ?? d; } catch (_) { return d; } };
    const toast = (m, k) => A().toast?.(m, k);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const plural = (n, one, many) => (A().plural ? A().plural(n, T(one), T(many)) : `${nf(n)} ${n > 1 ? T(many) : T(one)}`);
    const MOD = 'diagrammes';
    const K_SET = 'genealogie-diagrammes-onglet', K_N = 'genealogie-diagrammes-conseilles', K_OPEN = 'lcnda-diagrammes-ouvert', K_GRP = 'lcnda-diagrammes-groupes', K_TH = 'lcnda-diagrammes-vignettes';
    const GROUPS = [['fav', '⭐', 'Favoris'], ['rec', '🕘', 'Récents'], ['fold', '📁', 'Dossiers'], ['st', '🔄', 'À jour · 📌 Figés'], ['mod', '🧩', 'Modèles'], ['tr', '🗑', 'Corbeille']];
    const SUGGEST = ['pyramid', 'timeline', 'columns', 'line', 'sankey', 'bars', 'donut', 'treemap', 'parliament', 'wordcloud', 'stacked', 'waffle'];
    const SRC = {arbre: '🌳 Mon arbre', liste: '📋 Une liste', question: '💬 Une question', sheet: '🔗 Un classeur', graph: '📈 Un de mes graphiques', main: '✍️ À la main'};
    const USE = {person: '👤 Fiche d’une personne', investigation: '🔎 Enquête', investigation_item: '🧩 Partie d’enquête', atelier_project: '📚 Atelier', none: 'Posé nulle part'};
    const LINK_IC = {person: '👤', investigation: '🔎', investigation_item: '🧩', atelier_project: '📚'};

    /* ═════════════ allumé / éteint (comme 📊 Données) ═════════════ */
    const tabButton = () => document.querySelector(`.main-nav .nav-item[data-module="${MOD}"]`);
    const hiddenKeys = () => { try { return A().menuHiddenKeys ? A().menuHiddenKeys() : JSON.parse(localStorage.getItem('genealogie-menu-hidden') || '[]'); } catch (_) { return []; } };
    const on = () => !!tabButton() && !hiddenKeys().includes(MOD);
    const KEYS = ['genealogie-menu-hidden', `genealogie-menu-${MOD}`, 'genealogie-menu-added', 'genealogie-menu-order'];
    function setOn(v, {undo = true} = {}) {
        if (kiosk()) return;
        const snap = Object.fromEntries(KEYS.map(k => [k, readLS(k, null)]));
        let hidden = readJ('genealogie-menu-hidden', []); if (!Array.isArray(hidden)) hidden = [];
        let added = readJ('genealogie-menu-added', []); if (!Array.isArray(added)) added = [];
        if (v) { hidden = hidden.filter(k => k !== MOD); added = [...new Set([...added, MOD])]; } else { hidden = [...new Set([...hidden, MOD])]; added = added.filter(k => k !== MOD); }
        writeLS('genealogie-menu-hidden', JSON.stringify(hidden)); writeLS(`genealogie-menu-${MOD}`, '1'); writeLS('genealogie-menu-added', JSON.stringify(added));
        const order = readJ('genealogie-menu-order', null); // un ordre du menu déjà rangé : l'onglet va juste après Graphiques (le même numéro, 03)
        if (v && Array.isArray(order) && order.includes('graphiques')) { const o = order.filter(k => k !== MOD); o.splice(o.indexOf('graphiques') + 1, 0, MOD); writeLS('genealogie-menu-order', JSON.stringify(o)); }
        const after = () => { try { A().applyMenuOrder?.(); } catch (_) {} try { if (A().state?.module === 'graphiques') A().renderSidebar?.(); } catch (_) {} };
        after();
        const msg = v ? T('L’onglet 📈 Diagrammes est dans le menu') : T('L’onglet 📈 Diagrammes est caché');
        if (undo && A().undoToast) A().undoToast(msg, {undo: () => { Object.entries(snap).forEach(([k, x]) => writeLS(k, x)); after(); }}); else if (undo) toast(msg);
    }

    /* ═════════════ réglages de l'onglet (un seul réglage, qui suit la base) ═════════════ */
    const DEF = {view: 'grid', start: 'all', folder: 'open', thumbs: true, ask: false, graphs: false, groups: [], hidden: [], trashFolder: {}};
    function prefs() {
        const p = readJ(K_SET, {}) || {}, o = {...DEF};
        if (['grid', 'list'].includes(p.view)) o.view = p.view;
        if (['all', 'recent', 'last'].includes(p.start)) o.start = p.start;
        if (typeof p.folder === 'string' && (p.folder === 'open' || p.folder === '' || /^f_[a-z0-9]{1,16}$/.test(p.folder))) o.folder = p.folder;
        ['thumbs', 'ask', 'graphs'].forEach(k => { if (typeof p[k] === 'boolean') o[k] = p[k]; });
        const ids = GROUPS.map(g => g[0]);
        o.groups = Array.isArray(p.groups) ? p.groups.filter((x, i, a) => ids.includes(x) && a.indexOf(x) === i) : [];
        o.hidden = Array.isArray(p.hidden) ? p.hidden.filter(x => ids.includes(x)) : [];
        o.trashFolder = p.trashFolder && typeof p.trashFolder === 'object' && !Array.isArray(p.trashFolder) ? Object.fromEntries(Object.entries(p.trashFolder).filter(([k, v]) => /^\d{1,12}$/.test(k) && /^f_[a-z0-9]{1,16}$/.test(String(v))).slice(0, 500)) : {};
        return o;
    }
    const savePrefs = patch => { const p = {...prefs(), ...patch}; writeLS(K_SET, JSON.stringify(p)); return p; };
    const orderedGroups = () => { const p = prefs(), o = [...p.groups]; GROUPS.forEach(g => { if (!o.includes(g[0])) o.push(g[0]); }); return o.map(id => GROUPS.find(g => g[0] === id)); };
    const suggestN = () => { const v = String(readLS(K_N, '') || ''); if (v === 'all') return 'all'; const n = Math.round(Number(v)); return n >= 3 && n <= 12 ? n : 5; };

    /* ═════════════ les données ═════════════ */
    let dlist = [], tlist = null, loaded = false;
    async function load(force = false) {
        try { dlist = await (ext.diagramList ? ext.diagramList(force) : Promise.resolve([])) || []; } catch (_) { dlist = dlist || []; }
        loaded = true; return dlist;
    }
    async function loadTrash(force = false) {
        if (tlist && !force) return tlist;
        try { tlist = ((await A().api('diagrams', {trash: 1})).diagrams || []).filter(d => !pendingEmpty.has(d.id)); } catch (_) { tlist = tlist || []; }
        return tlist;
    }
    const byId = id => dlist.find(d => d.id === Number(id)) || null;
    const kindOf = d => R()?.KINDS?.[d.kind] || null;
    const followId = d => (I().followId ? I().followId(d.spec) : '');
    const srcOf = d => { const l = d.spec?.live; if (!l) return 'main'; if (l.follow) return 'graph'; if (l.sheet) return 'sheet'; if (l.data) return l.data.src === 'ask' ? 'question' : 'liste'; return 'arbre'; };
    const isLive = d => !!d.spec?.live;
    const fdata = () => SF()?.read('diagram') || {folders: [], of: {}, closed: []};
    const folderOf = d => fdata().of[String(d.id)] || '';
    const fById = id => fdata().folders.find(f => f.id === id) || null;
    const fChildren = (data, parent) => data.folders.filter(f => (f.parent || null) === (parent || null));
    const fDepth = (data, id) => { let n = 0, f = data.folders.find(x => x.id === id); while (f) { n++; f = f.parent ? data.folders.find(x => x.id === f.parent) : null; } return n; };
    const fInside = (data, id, anc) => { let f = data.folders.find(x => x.id === id); while (f) { if (f.id === anc) return true; f = f.parent ? data.folders.find(x => x.id === f.parent) : null; } return false; };
    const fPath = id => { const d = fdata(), out = []; let f = d.folders.find(x => x.id === id); while (f) { out.unshift(f); f = f.parent ? d.folders.find(x => x.id === f.parent) : null; } return out; };
    const when = s => { if (!s) return ''; const t = Date.parse(String(s).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); if (!Number.isFinite(t)) return ''; return UI().when ? UI().when(new Date(t).toISOString()) : new Date(t).toLocaleDateString('fr-FR'); };
    const time = s => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? t : 0; };
    const recents = () => dlist.filter(d => d.opened_at).sort((a, b) => time(b.opened_at) - time(a.opened_at)).slice(0, 5);
    const models = () => { try { return ext.diagramData?.models?.() || []; } catch (_) { return []; } };
    /** 📈 « Montrer aussi mes graphiques » : ceux de l'Éditeur de graphiques (pas déjà posés comme diagramme) */
    const graphs = () => { if (!prefs().graphs) return []; const followed = new Set(dlist.map(d => followId(d)).filter(Boolean)); return (ext.myStatDefs?.() || []).filter(g => !followed.has(g.id)).map(g => ({graph: true, id: 'g:' + g.id, gid: g.id, name: g.name || T('Mon graphique'), icon: g.icon || '📈', updated_at: '', g})); };

    /* ═════════════ la page ouverte et son adresse ═════════════ */
    let cur = {view: 'home', nav: 'all', id: 0, door: 'ask', model: -1}, lastHash = '', goPending = false, editor = null, pendingNew = null;
    const S = {q: '', fpanel: false, F: {type: new Set(), src: new Set(), st: new Set(), use: new Set(), who: ''}, multi: false, sel: new Set(), sort: 'recent'};
    const NAVH = {all: '', fav: 'favoris', rec: 'recents', live: 'a-jour', frozen: 'figes', nofold: 'dossier/aucun'};
    function hashFor(c = cur) {
        if (c.view === 'edit' && c.id) return `#${MOD}/${c.id}`;
        if (c.view === 'new') return `#${MOD}/nouveau${c.door === 'gal' ? '/dessin' : c.door === 'data' ? '/donnees' : ''}`;
        if (c.view === 'trash') return `#${MOD}/corbeille`;
        if (c.view === 'model') return `#${MOD}/modeles/${Math.max(0, c.model)}`;
        if (/^f_/.test(c.nav)) return `#${MOD}/dossier/${c.nav}`;
        return NAVH[c.nav] ? `#${MOD}/${NAVH[c.nav]}` : `#${MOD}`;
    }
    function parse(h) {
        const m = String(h || '').match(/^#diagrammes(?:\/([^?#]*))?\/?$/); if (!m) return null;
        let p = ''; try { p = decodeURIComponent(m[1] || ''); } catch (_) { return null; }
        const parts = p.split('/').filter(Boolean), home = nav => ({view: 'home', nav, id: 0, door: 'ask', model: -1});
        if (!parts.length) return home('all');
        if (/^\d{1,12}$/.test(parts[0])) return {view: 'edit', nav: cur.nav, id: Number(parts[0]), door: 'ask', model: -1};
        if (parts[0] === 'nouveau') return {view: 'new', nav: cur.nav, id: 0, door: parts[1] === 'dessin' ? 'gal' : parts[1] === 'donnees' ? 'data' : 'ask', model: -1};
        if (parts[0] === 'corbeille') return {view: 'trash', nav: 'trash', id: 0, door: 'ask', model: -1};
        if (parts[0] === 'modeles') return {view: 'model', nav: 'model', id: 0, door: 'ask', model: Math.max(0, Number(parts[1]) || 0)};
        if (parts[0] === 'dossier') return home(parts[1] === 'aucun' ? 'nofold' : /^f_[a-z0-9]{1,16}$/.test(parts[1] || '') ? parts[1] : 'all');
        const nav = Object.entries(NAVH).find(([, v]) => v === parts[0])?.[0];
        return home(nav || 'all');
    }
    /** l'onglet entier vient d'être cliqué (pas un lien, pas ← →) : « En ouvrant l'onglet » */
    function startRoute() {
        const p = prefs();
        if (p.start === 'recent') return {view: 'home', nav: 'rec', id: 0, door: 'ask', model: -1};
        if (p.start === 'last') { const id = Number(readLS(K_OPEN, 0)) || 0; if (id) return {view: 'edit', nav: 'all', id, door: 'ask', model: -1}; }
        return {view: 'home', nav: 'all', id: 0, door: 'ask', model: -1};
    }
    /** app.js moduleHash : une adresse venue d'ailleurs (lien, ← →) est adoptée ; sinon celle de la page ouverte */
    function hash() {
        const h = location.hash, r = parse(h);
        if (r && h !== lastHash) setCur(r);
        else if (!goPending && !document.querySelector('#workspace [data-dgo-page]') && A().state?.module === MOD) setCur(startRoute()); // on entre par le bouton du menu
        goPending = false;
        lastHash = hashFor(); return lastHash;
    }
    function setCur(r) {
        if (kiosk() && (r.view === 'new' || r.view === 'trash')) r = {view: 'home', nav: 'all', id: 0, door: 'ask', model: -1};
        if (r.view !== 'home') { S.multi = false; S.sel.clear(); }
        if (r.view === 'home' && r.nav !== cur.nav) S.sel.clear();
        cur = {...cur, ...r};
    }
    if (/^#diagrammes(\/|$)/.test(location.hash)) hash(); // un lien direct, au démarrage
    /** aller à une page de l'onglet (une entrée dans l'historique : ← du navigateur y revient) */
    async function go(r, {push = true} = {}) {
        try { await editor?.flush?.(); } catch (_) {}
        setCur(r);
        const st = A().state; if (!st) return;
        if (st.module !== MOD) { goPending = true; lastHash = location.hash; return A().setModule?.(MOD); }
        const h = hashFor();
        if (location.hash !== h) { try { history[push ? 'pushState' : 'replaceState'](null, '', location.pathname + location.search + h); } catch (_) {} }
        lastHash = h;
        A().renderSidebar?.();
        const w = document.getElementById('workspace'); if (w) w.scrollTop = 0;
        return render(++st.workspaceToken);
    }
    const open = (id, o = {}) => go({view: 'edit', id: Number(id) || 0}, o);
    /** ext.openDiagramEditor quand l'onglet est allumé : un numéro → ouvert ici ; rien → « ＋ Nouveau » ; des données prêtes → l'éditeur ici */
    function edit(id = null, opts = {}) {
        if (id) return open(id);
        if (opts && (opts.spec || opts.kind || opts.data || opts.link)) return create(opts);
        return go({view: 'new', door: 'ask'});
    }
    function create(opts = {}) { pendingNew = opts; return go({view: 'edit', id: 0}); }

    /* ═════════════ vignettes : le vrai dessin, en petit PNG (gardé) ═════════════ */
    const thMem = new Map();
    let thStore = null;
    const thKey = d => `${d.id}:${d.updated_at || ''}`;
    const thLoad = () => { if (!thStore) { const v = readJ(K_TH, {}); thStore = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } return thStore; };
    function thSave(key, url) {
        thMem.set(key, url); const st = thLoad(), id = key.split(':')[0];
        Object.keys(st).forEach(k => { if (k.split(':')[0] === id && k !== key) delete st[k]; });
        st[key] = url; const ks = Object.keys(st); while (ks.length > 80) delete st[ks.shift()];
        try { localStorage.setItem(K_TH, JSON.stringify(st)); } catch (_) { try { localStorage.removeItem(K_TH); } catch (__) {} thStore = {[key]: url}; }
    }
    const thGet = d => thMem.get(thKey(d)) || thLoad()[thKey(d)] || '';
    const queue = []; let running = 0;
    function thQueue(d) { if (!queue.includes(d.id)) queue.push(d.id); pump(); }
    function pump() {
        while (running < 2 && queue.length) {
            const id = queue.shift(), d = byId(id); if (!d) continue;
            running++;
            makeThumb(d).then(url => { if (!url) return; document.querySelectorAll(`[data-dgo-th="${d.id}"]`).forEach(el => { el.innerHTML = `<img src="${url}" alt="" loading="lazy">`; el.classList.add('has-img'); }); })
                .catch(() => {}).finally(() => { running--; pump(); });
        }
    }
    async function makeThumb(d) {
        const key = thKey(d); if (thGet(d)) return thGet(d);
        const s = await I().resolveLive(I().specOf(d));
        const svg = I().drawSpec({...s, o: {...(s.o || {}), title: '', subtitle: '', source: '', legend: 'none'}});
        const m = svg.match(/viewBox="[\d.\s-]*? ([\d.]+) ([\d.]+)"/), w = Number(m?.[1]) || 900;
        const c = await I().svgToCanvas(svg, Math.min(1, 320 / w), '#ffffff');
        const url = c.toDataURL('image/png'); thSave(key, url); return url;
    }
    const icon = d => (d.graph ? d.icon : followId(d) ? '📈' : kindOf(d)?.icon || '📊');
    function thumbHtml(d, small = false) {
        if (!prefs().thumbs || d.graph) return `<span class="dgo-ic" aria-hidden="true">${esc(icon(d))}</span>`;
        const url = thGet(d);
        if (!url) setTimeout(() => thQueue(d), 0);
        return `<span class="dgo-thimg${url ? ' has-img' : ''}${small ? ' is-small' : ''}" data-dgo-th="${d.id}">${url ? `<img src="${url}" alt="" loading="lazy">` : `<span class="dgo-ic" aria-hidden="true">${esc(icon(d))}</span>`}</span>`;
    }

    /* ═════════════ ce qu'on montre ═════════════ */
    const nF = () => S.F.type.size + S.F.src.size + S.F.st.size + S.F.use.size + (S.F.who ? 1 : 0);
    function shown() {
        const q = fold(S.q.trim()), data = fdata(), nav = cur.nav;
        const inFold = (d, f) => { const x = data.of[String(d.id)]; return x === f || (x && fInside(data, x, f)); };
        let l = [...dlist, ...graphs()].filter(d => {
            if (d.graph) return nav === 'all' && !nF() && (!q || fold(d.name).includes(q));
            if (nav === 'fav' && !Number(d.favorite)) return false;
            if (nav === 'rec' && !recents().includes(d)) return false;
            if (nav === 'live' && !isLive(d)) return false; if (nav === 'frozen' && isLive(d)) return false;
            if (nav === 'nofold' && data.of[String(d.id)]) return false;
            if (/^f_/.test(nav) && !inFold(d, nav)) return false;
            if (S.F.type.size && !S.F.type.has(kindOf(d)?.group || '')) return false;
            if (S.F.src.size && !S.F.src.has(srcOf(d))) return false;
            if (S.F.st.size && !S.F.st.has(isLive(d) ? 'live' : 'frozen')) return false;
            if (S.F.use.size && !(S.F.use.has('none') && !(d.links || []).length) && !(d.links || []).some(x => S.F.use.has(x.type))) return false;
            if (S.F.who && !(d.links || []).some(x => x.type === 'person' && String(x.id) === S.F.who)) return false;
            if (q && !fold(`${d.name} ${kindOf(d)?.label || ''}`).includes(q)) return false;
            return true;
        });
        if (nav === 'rec') { const r = recents(); l.sort((a, b) => r.indexOf(a) - r.indexOf(b)); return l; }
        if (S.sort === 'name') l.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        else if (S.sort === 'type') l.sort((a, b) => String(kindOf(a)?.label || '').localeCompare(String(kindOf(b)?.label || ''), 'fr') || time(b.updated_at) - time(a.updated_at));
        else l.sort((a, b) => time(b.updated_at) - time(a.updated_at) || b.id - a.id);
        return l;
    }
    const usedHtml = d => ((d.links || []).length ? `${esc(T('Utilisé dans :'))} ${d.links.map(x => `<a href="#" data-dgo-golink="${esc(x.type)}:${Number(x.id)}:${Number(x.inv) || 0}">${LINK_IC[x.type] || '🔗'} ${esc(x.name)}</a>`).join(', ')}` : esc(T('Posé nulle part')));
    const stateBadge = d => (isLive(d) ? `<span class="ui-badge is-green">🔄 ${esc(T('À jour'))}</span>` : `<span class="ui-badge is-grey">📌 ${esc(T('Figé'))}</span>`);
    function cardHtml(d) {
        const ro = kiosk(), sel = S.sel.has(d.id);
        if (d.graph) return `<article class="dgo-card is-graph" data-dgo-card="${esc(d.id)}"><div class="dgo-th" data-dgo-graph="${esc(d.gid)}">${thumbHtml(d)}</div><div class="dgo-b"><button type="button" class="dgo-name" data-dgo-graph="${esc(d.gid)}">${esc(d.icon)} ${esc(d.name)}</button><span class="dgo-meta">📈 ${esc(T('Éditeur de graphiques'))}</span></div></article>`;
        const k = kindOf(d);
        return `<article class="dgo-card${sel ? ' is-sel' : ''}" data-dgo-card="${d.id}" ${ro ? '' : 'draggable="true"'}>
            <div class="dgo-th" data-dgo-open="${d.id}">${thumbHtml(d)}
                ${S.multi ? `<label class="dgo-ck" data-dgo-stop><input type="checkbox" data-dgo-ck="${d.id}" ${sel ? 'checked' : ''} aria-label="${esc(T('Choisir « {n} »', {n: d.name}))}"></label>` : ''}
                <button type="button" class="dgo-star${Number(d.favorite) ? ' on' : ''}" data-dgo-star="${d.id}" ${ro ? 'disabled' : ''} aria-pressed="${!!Number(d.favorite)}" aria-label="${esc(Number(d.favorite) ? T('Retirer des favoris') : T('Mettre dans les favoris'))}">${Number(d.favorite) ? '★' : '☆'}</button></div>
            <div class="dgo-b"><button type="button" class="dgo-name" data-dgo-open="${d.id}">${esc(d.name)}</button>
                <span class="dgo-meta">${esc(icon(d))} ${esc(T(k?.label || d.kind))} · ${esc(T(SRC[srcOf(d)]))}</span>
                <span class="dgo-meta">${stateBadge(d)} ${esc(when(d.updated_at))}</span>
                <span class="dgo-used">${usedHtml(d)}</span>
                <button type="button" class="ib dgo-more" data-dgo-more="${d.id}" aria-haspopup="menu" aria-label="${esc(T('Plus d’actions pour « {n} »', {n: d.name}))}">⋯</button></div></article>`;
    }
    function listHtml(l) {
        const ro = kiosk();
        return `<div class="tw"><table class="data-table dgo-lt"><thead><tr>${S.multi ? `<th><span class="sr">${esc(T('Choisir'))}</span></th>` : ''}<th><span class="sr">${esc(T('Favori'))}</span>⭐</th><th>${esc(T('Nom'))}</th><th>${esc(T('Type'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('État'))}</th><th>${esc(T('Utilisé dans'))}</th><th>${esc(T('Modifié'))}</th><th><span class="sr">${esc(T('Actions'))}</span></th></tr></thead><tbody>
            ${l.map(d => d.graph ? `<tr data-dgo-card="${esc(d.id)}">${S.multi ? '<td></td>' : ''}<td></td><td><button type="button" class="dgo-nm" data-dgo-graph="${esc(d.gid)}">${esc(d.icon)} ${esc(d.name)}</button></td><td>📈 ${esc(T('Graphique'))}</td><td colspan="5"></td></tr>`
                : `<tr data-dgo-card="${d.id}" class="${S.sel.has(d.id) ? 'is-sel' : ''}" ${ro ? '' : 'draggable="true"'}>${S.multi ? `<td><input type="checkbox" data-dgo-ck="${d.id}" ${S.sel.has(d.id) ? 'checked' : ''} aria-label="${esc(T('Choisir « {n} »', {n: d.name}))}"></td>` : ''}
                <td><button type="button" class="dgo-st${Number(d.favorite) ? ' on' : ''}" data-dgo-star="${d.id}" ${ro ? 'disabled' : ''} aria-pressed="${!!Number(d.favorite)}" aria-label="${esc(Number(d.favorite) ? T('Retirer des favoris') : T('Mettre dans les favoris'))}">${Number(d.favorite) ? '★' : '☆'}</button></td>
                <td>${prefs().thumbs ? `<span class="dgo-mini">${thumbHtml(d, true)}</span>` : ''}<button type="button" class="dgo-nm" data-dgo-open="${d.id}">${esc(d.name)}</button></td>
                <td>${esc(icon(d))} ${esc(T(kindOf(d)?.label || d.kind))}</td><td>${esc(T(SRC[srcOf(d)]))}</td><td>${stateBadge(d)}</td><td class="dgo-used">${usedHtml(d)}</td><td>${esc(when(d.updated_at))}</td>
                <td><button type="button" class="ib" data-dgo-more="${d.id}" aria-haspopup="menu" aria-label="${esc(T('Plus d’actions pour « {n} »', {n: d.name}))}">⋯</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    const chip = (key, v, label) => { const onv = key === 'who' ? S.F.who === v : S.F[key].has(v); return `<button type="button" class="dgo-k" data-dgo-f="${key}" data-v="${esc(v)}" aria-pressed="${onv}">${esc(label)}</button>`; };
    function filterPanel() {
        const groups = [...new Set(dlist.map(d => kindOf(d)?.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        const people = new Map(); dlist.forEach(d => (d.links || []).forEach(x => { if (x.type === 'person') people.set(String(x.id), x.name); }));
        const srcs = Object.keys(SRC).filter(k => dlist.some(d => srcOf(d) === k));
        const row = (lab, html) => (html ? `<div class="dgo-fr"><span class="lbl">${esc(T(lab))}</span><div class="ld-chips">${html}</div></div>` : '');
        return `<div class="dgo-fpanel" data-dgo-fpanel>${row('Type', groups.map(g => chip('type', g, T(g))).join(''))}${row('Source', srcs.map(k => chip('src', k, T(SRC[k]))).join(''))}
            ${row('Personne', [...people].slice(0, 30).map(([id, n]) => chip('who', id, '👤 ' + n)).join(''))}${row('État', chip('st', 'live', '🔄 ' + T('À jour')) + chip('st', 'frozen', '📌 ' + T('Figé')))}
            ${row('Posé dans', Object.entries(USE).map(([k, l]) => chip('use', k, T(l))).join(''))}<div><button type="button" class="link-button" data-dgo-fclear>${esc(T('Tout effacer'))}</button></div></div>`;
    }
    const activeChips = () => {
        const out = []; const people = new Map(); dlist.forEach(d => (d.links || []).forEach(x => { if (x.type === 'person') people.set(String(x.id), x.name); }));
        S.F.type.forEach(v => out.push(['type', v, T(v)])); S.F.src.forEach(v => out.push(['src', v, T(SRC[v])])); S.F.st.forEach(v => out.push(['st', v, v === 'live' ? '🔄 ' + T('À jour') : '📌 ' + T('Figé')]));
        S.F.use.forEach(v => out.push(['use', v, T(USE[v])])); if (S.F.who) out.push(['who', S.F.who, '👤 ' + (people.get(S.F.who) || S.F.who)]);
        return out.length ? `<div class="ld-chips dgo-on">${out.map(([k, v, l]) => `<button type="button" class="ui-listbar-chip" data-dgo-f="${k}" data-v="${esc(v)}">${esc(l)} <span aria-hidden="true">×</span><span class="sr">${esc(T('Retirer'))}</span></button>`).join('')}<button type="button" class="link-button" data-dgo-fclear>${esc(T('Tout effacer'))}</button></div>` : '';
    };
    const crumbHtml = parts => `<nav class="dgo-crumb eyebrow" aria-label="${esc(T('Fil d’Ariane'))}"><a href="#diagrammes" data-dgo-nav="all">${esc(T('Diagrammes'))}</a>${parts.map(([lab, nav]) => ` <i aria-hidden="true">›</i> ${nav ? `<a href="${esc(hashFor({view: 'home', nav}))}" data-dgo-nav="${esc(nav)}">${esc(lab)}</a>` : `<span>${esc(lab)}</span>`}`).join('')}</nav>`;
    const navTitle = nav => {
        if (/^f_/.test(nav)) return ['📁', fById(nav)?.name || T('Dossier')];
        return {all: ['🗂', T('Tous mes diagrammes')], fav: ['⭐', T('Favoris')], rec: ['🕘', T('Récents')], live: ['🔄', T('À jour')], frozen: ['📌', T('Figés')], nofold: ['··', T('Sans dossier')]}[nav] || ['🗂', T('Tous mes diagrammes')];
    };
    const kioskLine = () => (kiosk() ? `<p class="dgo-kiosk">👀 ${esc(T('Mode consultation : on voit, on ouvre, on exporte (sans les personnes vivantes). Rien ne se modifie.'))}</p>` : '');

    /* ═════════════ l'accueil « Tous mes diagrammes » (et les dossiers, favoris, récents, à jour, figés) ═════════════ */
    function renderHome(ws) {
        const nav = cur.nav, [ic, title] = navTitle(nav), l = shown(), ro = kiosk(), p = prefs(), isF = /^f_/.test(nav);
        const crumb = nav === 'all' ? [[T('Tous')]] : isF ? fPath(nav).map((f, i, a) => [f.name, i < a.length - 1 ? f.id : '']) : [[title]];
        const intro = {all: T('Tous tes diagrammes, du plus récent au plus ancien. Chacun dit d’où viennent ses chiffres et où il est posé.'), live: T('Ils relisent tes données à chaque affichage.'), frozen: T('Leurs chiffres ne bougent plus : ceux du jour où ils ont été figés.'), fav: T('Ceux que tu ouvres souvent : clique ☆ sur un diagramme.'), rec: T('Les derniers que tu as ouverts.')}[nav] || (isF ? T('Un dossier. Glisse un diagramme ici, ou « 📁 Déplacer » dans son ⋯.') : '');
        ws.innerHTML = `<section class="page dgo-page" data-dgo-page="home"><header class="page-header"><div>${crumbHtml(crumb)}<h2><span class="ph-ico" aria-hidden="true">${esc(ic)}</span>${esc(title)}</h2>${intro ? `<p>${esc(intro)}</p>` : ''}</div>
            <div class="page-actions">${ro ? '' : `<button type="button" class="button" data-dgo-new>＋ ${esc(T('Nouveau diagramme'))}</button>`}${isF && !ro ? `<button type="button" class="button secondary icon" data-dgo-fmore="${esc(nav)}" aria-label="${esc(T('Le dossier'))}" aria-haspopup="menu">⋯</button>` : ''}<button type="button" class="button secondary icon" data-dgo-settings aria-label="${esc(T('Réglages de l’onglet'))}" title="${esc(T('Réglages de l’onglet'))}">⚙</button></div></header>
            ${kioskLine()}
            <div class="dgo-bar"><span class="ld-count" data-dgo-count>${esc(plural(l.length, 'diagramme', 'diagrammes'))}</span>
                <span class="segmented sm" role="group" aria-label="${esc(T('Affichage'))}"><button type="button" data-dgo-view="grid" aria-pressed="${p.view === 'grid'}">▦ ${esc(T('Vignettes'))}</button><button type="button" data-dgo-view="list" aria-pressed="${p.view === 'list'}">☰ ${esc(T('Liste'))}</button></span>
                <span class="dgo-sp"></span>
                ${nav === 'rec' ? '' : `<label class="sr" for="dgo-sort">${esc(T('Trier'))}</label><select id="dgo-sort" class="ui-select" data-dgo-sort><option value="recent"${S.sort === 'recent' ? ' selected' : ''}>${esc(T('Trier : les plus récents'))}</option><option value="name"${S.sort === 'name' ? ' selected' : ''}>${esc(T('Trier : par nom'))}</option><option value="type"${S.sort === 'type' ? ' selected' : ''}>${esc(T('Trier : par type'))}</option></select>`}
                <button type="button" class="ui-listbar-btn" data-dgo-fpanel aria-pressed="${S.fpanel || nF() > 0}" aria-expanded="${S.fpanel}">${esc(T('Filtrer'))}${nF() ? ` (${nF()})` : ''} ▾</button>
                ${ro ? '' : `<button type="button" class="ui-listbar-btn" data-dgo-multi aria-pressed="${S.multi}">☑ ${esc(T('Choisir'))}</button>`}</div>
            ${S.fpanel ? filterPanel() : activeChips()}
            ${l.length ? (p.view === 'grid' ? `<div class="dgo-grid" data-dgo-list>${l.map(cardHtml).join('')}</div>` : listHtml(l))
                : `<div class="dgo-empty"><b>${esc(dlist.length ? T('Aucun diagramme ici.') : T('Pas encore de diagramme.'))}</b>${nF() ? esc(T('Retire un filtre.')) + ' ' : ''}${ro ? '' : `<button type="button" class="link-button" data-dgo-new>＋ ${esc(T('crée-en un'))}</button>`}</div>`}
            ${S.multi ? `<div class="dgo-selbar" role="region" aria-label="${esc(T('Diagrammes choisis'))}"><b data-dgo-seln>${esc(plural(S.sel.size, 'choisi', 'choisis'))}</b><button type="button" class="link-button" data-dgo-selall>${esc(T('Tout choisir'))}</button><span class="dgo-sp"></span>
                <button type="button" class="button small secondary" data-dgo-bulk="fav" ${S.sel.size ? '' : 'disabled'}>⭐ ${esc(T('Favori'))}</button><button type="button" class="button small secondary" data-dgo-bulk="move" ${S.sel.size ? '' : 'disabled'}>📁 ${esc(T('Déplacer'))}</button><button type="button" class="button small secondary" data-dgo-bulk="exp" ${S.sel.size ? '' : 'disabled'}>⤓ ${esc(T('Exporter'))}</button><button type="button" class="button small secondary" data-dgo-bulk="del" ${S.sel.size ? '' : 'disabled'}>🗑 ${esc(T('Supprimer'))}</button><button type="button" class="button small secondary icon" data-dgo-multi aria-label="${esc(T('Fermer le choix'))}">×</button></div>` : ''}</section>`;
    }

    /* ═════════════ ＋ Nouveau : trois portes, dans la page ═════════════ */
    function renderNew(ws) {
        const door = cur.door, n = suggestN();
        ws.innerHTML = `<section class="page dgo-page" data-dgo-page="new"><header class="page-header"><div>${crumbHtml([[T('Nouveau')]])}<h2>＋ ${esc(T('Nouveau diagramme'))}</h2><p>${esc(T('Choisis une façon de commencer. Tu pourras tout changer ensuite (le dessin, les chiffres, les couleurs).'))}</p></div>
            <div class="page-actions"><button type="button" class="button secondary" data-dgo-nav="all">${esc(T('← Mes diagrammes'))}</button></div></header>
            <div class="dgo-doors" role="group" aria-label="${esc(T('Comment commencer'))}">
                <button type="button" class="dgo-door" data-dgo-door="ask" aria-pressed="${door === 'ask'}"><b>💬 ${esc(T('Je veux représenter…'))}</b><small>${esc(T('Tu l’écris en mots simples, l’app propose les bons dessins.'))}</small></button>
                <button type="button" class="dgo-door" data-dgo-door="gal" aria-pressed="${door === 'gal'}"><b>🖼 ${esc(T('Choisir un dessin'))}</b><small>${esc(n === 'all' ? T('Tous les dessins, par groupes. Il arrive avec un exemple à remplacer.') : T('Les {n} conseillés d’abord, puis tous. Il arrive avec un exemple à remplacer.', {n}))}</small></button>
                <button type="button" class="dgo-door" data-dgo-door="data" aria-pressed="${door === 'data'}"><b>📊 ${esc(T('Partir des données'))}</b><small>${esc(T('Ton arbre, une liste de données ou une question : les chiffres viennent de l’app.'))}</small></button></div>
            <div class="dgo-panel" data-dgo-doorpane></div>${folderNote()}</section>`;
        const pane = ws.querySelector('[data-dgo-doorpane]');
        if (door === 'ask') {
            if (!ext.diagramAssistant) { pane.innerHTML = `<p class="muted">${esc(T('« Je veux représenter… » n’est pas chargé.'))}</p>`; return; }
            pane.innerHTML = ext.diagramAssistant.html(); ext.diagramAssistant.bind(pane, pick => startNew(pick));
            setTimeout(() => pane.querySelector('[data-dga-q]')?.focus(), 30);
        } else if (door === 'gal') {
            const host = document.createElement('div'); pane.replaceChildren(host);
            I().chooseType({host, suggest: n === 'all' ? null : SUGGEST.filter(k => R()?.KINDS?.[k]).slice(0, n)}).then(t => { if (t) startNew(t); });
            const ms = models(); if (ms.length) pane.insertAdjacentHTML('beforeend', `<div class="dgo-models"><span class="lbl">⭐ ${esc(T('Ou un de mes modèles :'))}</span>${ms.map((m, i) => `<button type="button" class="ui-listbar-chip" data-dgo-usemodel="${i}">${esc(R()?.KINDS?.[m.kind]?.icon || '📊')} ${esc(m.name || T('Modèle'))}</button>`).join('')}</div>`);
        } else {
            pane.innerHTML = `<h3>📊 ${esc(T('Partir des données'))}</h3><p class="muted">${esc(T('Les chiffres viennent de l’app ; coche « Tenir à jour » et le diagramme suit tes nouvelles données.'))}</p>
                <div class="dgo-srcs">${[['tree', '🌳', 'Mon arbre'], ['list', '📋', 'Une liste'], ['ask', '💬', 'Une question']].map(([k, i, l]) => `<button type="button" class="button secondary" data-dgo-fromdata="${k}">${i} ${esc(T(l))}</button>`).join('')}</div>`;
        }
    }
    function folderNote() { const f = defaultFolder(); return `<p class="dgo-where muted">${esc(T('Il sera rangé dans :'))} ${f ? `📁 ${esc(fById(f)?.name || '')}` : esc(T('sans dossier'))} · <button type="button" class="link-button" data-dgo-settings>${esc(T('changer'))}</button></p>`; }
    const defaultFolder = () => { const p = prefs(); const f = p.folder === 'open' ? (/^f_/.test(cur.nav) ? cur.nav : '') : p.folder; return f && fById(f) ? f : ''; };
    /** un départ choisi (un dessin, une proposition de 💬, un modèle, des données) → l'éditeur, ici */
    function startNew(t) {
        const P = I().presetSpec; if (!t) return;
        const spec = t.spec ? {o: {}, ...JSON.parse(JSON.stringify(t.spec))} : P(t);
        create({spec, name: spec.o?.title || T(R()?.KINDS?.[spec.kind]?.label || 'Mon diagramme'), data: t.data || null});
    }

    /* ═════════════ un diagramme : l'éditeur dans l'onglet (en lecture en mode consultation) ═════════════ */
    async function renderEdit(token, ws) {
        editor = null;
        const st = A().state, isNew = !cur.id, opts = isNew ? (pendingNew || {}) : {};
        let d = isNew ? null : byId(cur.id);
        if (!isNew && !d) { await load(true); d = byId(cur.id); }
        if (token !== st.workspaceToken) return;
        if (!isNew && !d) {
            const tr = (await loadTrash(true)).find(x => x.id === cur.id);
            ws.innerHTML = `<section class="page dgo-page" data-dgo-page="missing"><header class="page-header"><div>${crumbHtml([[tr ? T('Corbeille') : T('Introuvable')]])}<h2>${esc(tr ? tr.name : T('Diagramme introuvable'))}</h2></div><div class="page-actions"><button type="button" class="button secondary" data-dgo-nav="all">${esc(T('← Mes diagrammes'))}</button></div></header>
                ${tr ? `<p class="h-dg-trashed">🗑 ${esc(T('Diagramme à la corbeille'))}${kiosk() ? '' : ` — <button type="button" class="link-button" data-dgo-restore="${tr.id}">${esc(T('Remettre'))}</button>`}</p>` : `<p class="muted">${esc(T('Il a peut-être été supprimé.'))}</p>`}</section>`;
            return;
        }
        if (d) { writeLS(K_OPEN, d.id); if (!kiosk()) { d.opened_at = new Date().toISOString().slice(0, 19).replace('T', ' '); post('diagram_meta', {ids: [d.id], opened: 1}).catch(() => {}); } }
        const crumb = name => { const f = d ? folderOf(d) : defaultFolder(); return crumbHtml([...(f ? fPath(f).map(x => [x.name, x.id]) : []), [name || T('Nouveau')]]); };
        if (d && (kiosk() || followId(d))) return renderView(ws, d, crumb(d.name));
        pendingNew = null;
        const host = document.createElement('div'); host.className = 'dgo-edhost';
        ws.innerHTML = `<section class="page dgo-page dgo-edpage" data-dgo-page="edit"></section>`;
        ws.firstElementChild.appendChild(host);
        const rec = await I().openEditor(d ? d.id : null, {...opts, host, crumb: crumb(d ? d.name : (opts.name || '')),
            onBack: () => go({view: 'home'}), onRename: n => { const c = host.querySelector('[data-dg-crumb] span:last-child'); if (c) c.textContent = n; },
            onCreated: id => { const f = defaultFolder(); if (f && SF()) { const x = fdata(); x.of[String(id)] = f; SF().write('diagram', x); }
                cur = {...cur, view: 'edit', id}; const h = hashFor(); try { history.replaceState(null, '', location.pathname + location.search + h); } catch (_) {} lastHash = h; writeLS(K_OPEN, id);
                post('diagram_meta', {ids: [id], opened: 1}).catch(() => {}); }});
        if (token === st.workspaceToken) editor = rec;
    }
    /** en lecture (mode consultation, ou 📈 un graphique suivi) : le dessin, ⤓ Exporter */
    async function renderView(ws, d, crumb) {
        const s = await I().resolveLive(I().specOf(d)), fid = followId(d);
        ws.innerHTML = `<section class="page dgo-page" data-dgo-page="view"><header class="page-header"><div>${crumb}<h2>${esc(d.name)}</h2>${fid ? `<p>${esc(T('📈 Ce diagramme montre un de tes graphiques : il se modifie dans l’Éditeur de graphiques.'))}</p>` : ''}</div>
            <div class="page-actions"><button type="button" class="button secondary" data-dgo-nav="all">${esc(T('← Mes diagrammes'))}</button><button type="button" class="button secondary" data-dgo-export="${d.id}">⤓ ${esc(T('Exporter'))}</button>${fid && !kiosk() ? `<button type="button" class="button" data-dgo-editgraph="${esc(fid)}">↗ ${esc(T('Ouvrir dans l’Éditeur de graphiques'))}</button>` : ''}</div></header>
            ${kioskLine()}<div class="card h-dg-big"><div class="h-dg-svg" data-dgo-svg>${I().drawSpec(s)}</div></div><p class="dgo-usedline">${usedHtml(d)}</p></section>`;
        ext.diagramPerso?.mount?.(ws.querySelector('[data-dgo-svg]'), s);
    }

    /* ═════════════ 🗑 la corbeille ═════════════ */
    const DAY = 864e5;
    async function renderTrash(ws) {
        const l = await loadTrash(true), now = Date.now();
        ws.innerHTML = `<section class="page dgo-page" data-dgo-page="trash"><header class="page-header"><div>${crumbHtml([[T('Corbeille')]])}<h2><span class="ph-ico" aria-hidden="true">🗑</span>${esc(T('Corbeille'))}</h2><p>${esc(T('Gardés 30 jours, puis effacés. Là où ils étaient posés, on voit « Diagramme à la corbeille — Remettre ».'))}</p></div>
            <div class="page-actions">${l.length ? `<button type="button" class="button secondary" data-dgo-empty>${esc(T('Vider la corbeille'))}</button>` : ''}</div></header>
            ${l.length ? `<div class="tw"><table class="data-table dgo-trash"><thead><tr><th>${esc(T('Nom'))}</th><th>${esc(T('Supprimé'))}</th><th>${esc(T('Effacé dans'))}</th><th><span class="sr">${esc(T('Actions'))}</span></th></tr></thead><tbody>
                ${l.map(d => { const left = Math.max(0, Math.ceil((time(d.deleted_at) + 30 * DAY - now) / DAY)); return `<tr data-dgo-trow="${d.id}"><td>${esc(icon(d))} ${esc(d.name)}</td><td>${esc(when(d.deleted_at))}</td><td>${esc(plural(left, 'jour', 'jours'))}</td><td><button type="button" class="button small secondary" data-dgo-restore="${d.id}">↺ ${esc(T('Remettre'))}</button></td></tr>`; }).join('')}</tbody></table></div>`
                : `<div class="dgo-empty"><b>${esc(T('La corbeille est vide.'))}</b>${esc(T('Ce que tu supprimes arrive ici.'))}</div>`}</section>`;
    }
    async function trash(ids) {
        ids = [...new Set(ids.map(Number).filter(Boolean))]; if (!ids.length || kiosk()) return;
        const names = ids.map(id => byId(id)?.name || '').filter(Boolean);
        if (prefs().ask && !await A().confirmBox?.(ids.length > 1 ? T('Mettre {n} diagrammes à la corbeille ?', {n: ids.length}) : T('Mettre « {name} » à la corbeille ?', {name: names[0] || ''}), {title: T('Corbeille'), okLabel: T('Mettre à la corbeille')})) return;
        const data = fdata(), tf = {...prefs().trashFolder}; ids.forEach(id => { if (data.of[String(id)]) tf[id] = data.of[String(id)]; }); savePrefs({trashFolder: tf}); // remis « à sa place », même si Graphiques oublie le rangement
        try { await post('trash_diagrams', {ids}); } catch (e) { return toast(e.message, 'error'); }
        afterTrash(ids);
        const msg = ids.length > 1 ? T('{n} diagrammes mis à la corbeille', {n: ids.length}) : T('« {name} » mis à la corbeille', {name: names[0] || ''});
        const undo = async () => { await post('restore_diagrams', {ids}); await afterRestore(ids); }, redo = async () => { await post('trash_diagrams', {ids}); afterTrash(ids); };
        if (A().undoToast) A().undoToast(msg, {icon: '🗑', undo, redo}); else toast(msg);
    }
    async function afterTrash(ids) {
        ids.forEach(id => S.sel.delete(id)); tlist = null; ext.diagramTrashChanged?.();
        await load(true); refreshPlaced(ids);
        if (A().state?.module === MOD) { if (cur.view === 'edit' && ids.includes(cur.id)) return go({view: 'home'}, {push: false}); rerender(); }
    }
    async function restore(ids) {
        ids = [...new Set(ids.map(Number).filter(Boolean))]; if (!ids.length || kiosk()) return;
        try { await post('restore_diagrams', {ids}); } catch (e) { return toast(e.message, 'error'); }
        await afterRestore(ids);
        toast(ids.length > 1 ? T('↺ {n} diagrammes remis à leur place', {n: ids.length}) : T('↺ « {name} » remis à sa place', {name: byId(ids[0])?.name || ''}));
    }
    async function afterRestore(ids) {
        const tf = {...prefs().trashFolder}, data = fdata(); let moved = false;
        ids.forEach(id => { const f = tf[id]; if (f && data.folders.some(x => x.id === f)) { data.of[String(id)] = f; moved = true; } delete tf[id]; });
        if (moved && SF()) SF().write('diagram', data); savePrefs({trashFolder: tf});
        tlist = null; ext.diagramTrashChanged?.(); await load(true); refreshPlaced(ids); rerender();
    }
    /** les cases où ces diagrammes sont posés (fiches, widgets…) se redessinent : « Diagramme à la corbeille — Remettre », ou le dessin */
    function refreshPlaced(ids) { ext.diagramRefreshPlaced?.(ids); }
    /* vider : rien n'est effacé avant la fin de « ↶ Annuler » (15 s, ou en quittant la page) */
    const pendingEmpty = new Set(); let emptyT = 0;
    const commitEmpty = (keep = false) => { clearTimeout(emptyT); if (!pendingEmpty.size) return; const ids = [...pendingEmpty]; pendingEmpty.clear();
        A().api('empty_diagram_trash', {}, {method: 'POST', body: {ids}, keepalive: keep}).catch(() => {}); };
    window.addEventListener('pagehide', () => commitEmpty(true));
    async function emptyTrash() {
        if (kiosk()) return; const l = await loadTrash(true); if (!l.length) return;
        commitEmpty(); l.forEach(d => pendingEmpty.add(d.id)); tlist = []; rerender();
        emptyT = setTimeout(() => commitEmpty(), 15000);
        const msg = T('Corbeille vidée ({n})', {n: l.length});
        if (A().undoToast) A().undoToast(msg, {icon: '🗑', undo: () => { clearTimeout(emptyT); l.forEach(d => pendingEmpty.delete(d.id)); tlist = null; rerender(); }}); else toast(msg);
    }

    /* ═════════════ 🧩 un modèle ═════════════ */
    function renderModel(ws) {
        const ms = models(), m = ms[cur.model];
        if (!m) { ws.innerHTML = `<section class="page dgo-page" data-dgo-page="model"><header class="page-header"><div>${crumbHtml([[T('Modèles')]])}<h2>🧩 ${esc(T('Modèles'))}</h2><p>${esc(T('Pas encore de modèle : « ⭐ Enregistrer comme modèle » dans ⚙️ Personnaliser d’un diagramme.'))}</p></div></header></section>`; return; }
        let svg = ''; try { const s = ext.diagramData.applyModel(m); svg = R().svg({...I().presetSpec({kind: s.kind}), o: {...I().presetSpec({kind: s.kind}).o, ...s.o, title: '', subtitle: '', source: ''}}, 480); } catch (_) {}
        ws.innerHTML = `<section class="page dgo-page" data-dgo-page="model"><header class="page-header"><div>${crumbHtml([[T('Modèles')], [m.name || T('Modèle')]])}<h2>🧩 ${esc(m.name || T('Modèle'))}</h2><p>${esc(T('Un ⭐ modèle garde la mise en forme et la recette, jamais un chiffre ni un nom. On l’applique à d’autres données.'))}</p></div>
            <div class="page-actions">${kiosk() ? '' : `<button type="button" class="button" data-dgo-usemodel="${cur.model}">${esc(T('Utiliser ce modèle'))}</button>`}</div></header><div class="card h-dg-big dgo-modelpv"><div class="h-dg-svg">${svg}</div><p class="muted small">${esc(T('Exemple : tes données le remplissent.'))}</p></div></section>`;
    }
    function useModel(i) {
        const m = models()[i]; if (!m || kiosk()) return;
        try { const s = ext.diagramData.applyModel(m), base = I().presetSpec({kind: s.kind}); const spec = {...base, ...s, o: {...base.o, ...s.o}, rows: s.rows?.length ? s.rows : base.rows}; if (!spec.live) delete spec.live;
            create({spec, name: m.name || T('Mon diagramme'), data: s.live ? {src: 'list'} : null}); } catch (e) { toast(e.message, 'error'); }
    }

    /* ═════════════ l'écran ═════════════ */
    async function render(token) {
        const st = A().state, ws = document.getElementById('workspace'); if (!ws || !st) return;
        if (!loaded) await load(); else if (cur.view === 'home') await load();
        if (token !== undefined && token !== st.workspaceToken) return;
        if (cur.view === 'edit') return renderEdit(token ?? st.workspaceToken, ws);
        editor = null;
        if (cur.view === 'new') return renderNew(ws);
        if (cur.view === 'trash') return renderTrash(ws);
        if (cur.view === 'model') return renderModel(ws);
        return renderHome(ws);
    }
    /** redessiner sans changer de page (après ⭐, un rangement…) ; l'éditeur ouvert n'est jamais redessiné (seulement la colonne) */
    function rerender() {
        if (A().state?.module !== MOD) return;
        A().renderSidebar?.();
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (cur.view === 'home') { const y = ws.scrollTop; renderHome(ws); ws.scrollTop = y; }
        else if (cur.view === 'trash') renderTrash(ws);
    }
    const refresh = async () => { await load(true); rerender(); };
    const saved = () => { load().then(() => { if (A().state?.module === MOD) A().renderSidebar?.(); }); };

    /* ═════════════ les gestes de la page ═════════════ */
    async function star(ids, v) {
        if (kiosk()) return; ids = ids.map(Number);
        try { await post('diagram_meta', {ids, favorite: v ? 1 : 0}); } catch (e) { return toast(e.message, 'error'); }
        ids.forEach(id => { const d = byId(id); if (d) d.favorite = v ? 1 : 0; });
        rerender();
        const n = byId(ids[0])?.name || '';
        toast(ids.length > 1 ? T('⭐ {n} dans les favoris', {n: ids.length}) : v ? T('⭐ « {name} » dans les favoris', {name: n}) : T('« {name} » retiré des favoris', {name: n}));
    }
    function moveTo(ids, folder) {
        if (kiosk() || !SF()) return; ids = ids.map(String);
        const f = folder ? fById(folder) : null; if (folder && !f) return;
        const msg = ids.length > 1 ? (f ? T('📁 {n} diagrammes rangés dans « {f} »', {n: ids.length, f: f.name}) : T('{n} diagrammes sortis des dossiers', {n: ids.length})) : (f ? T('📁 « {name} » rangé dans « {f} »', {name: byId(ids[0])?.name || '', f: f.name}) : T('« {name} » sorti des dossiers', {name: byId(ids[0])?.name || ''}));
        fcommit(msg, d => { ids.forEach(id => { if (folder) d.of[id] = folder; else delete d.of[id]; }); });
    }
    /** ↶ chaque rangement des dossiers se défait (le même que Graphiques : undoLocalChange sur genealogie-side-folders) */
    function fcommit(msg, change) {
        const run = () => { const d = JSON.parse(JSON.stringify(fdata())); change(d); SF().write('diagram', d); };
        if (A().undoLocalChange) A().undoLocalChange(msg, [SF().KEY], run, () => rerender()); else run();
        rerender();
    }
    async function askName(o) { if (A().askText) return String(await A().askText(o) || '').trim(); const v = window.prompt(o.title, o.value || ''); return String(v || '').trim(); }
    async function newFolder(parent = null) {
        if (kiosk() || !SF()) return; const data = fdata();
        if (parent && fDepth(data, parent) >= SF().MAX_DEPTH) return toast(T('Trois niveaux de dossiers au plus : choisis un dossier moins profond.'), 'error');
        const name = (await askName({title: T('＋ Nouveau dossier'), message: T('Le nom du dossier, pour ranger tes diagrammes.'), placeholder: T('Ex. Famille MAZAUD'), okLabel: T('Créer le dossier')})).slice(0, 60); if (!name) return;
        const f = {id: 'f_' + Math.random().toString(36).slice(2, 12), name, parent: parent || null};
        fcommit(T('Dossier « {f} » créé', {f: name}), d => { d.folders.push(f); });
        return f.id;
    }
    async function renameFolder(id) { const f = fById(id); if (!f || kiosk()) return; const name = (await askName({title: T('✎ Renommer le dossier'), value: f.name, okLabel: T('Renommer')})).slice(0, 60); if (!name || name === f.name) return; fcommit(T('Dossier renommé « {f} »', {f: name}), d => { const x = d.folders.find(y => y.id === id); if (x) x.name = name; }); }
    function deleteFolder(id) {
        const f = fById(id); if (!f || kiosk()) return;
        fcommit(T('Dossier « {f} » supprimé : ses diagrammes remontent d’un niveau', {f: f.name}), d => { const x = d.folders.find(y => y.id === id); if (!x) return; const parent = x.parent || null;
            d.folders.forEach(y => { if (y.parent === id) y.parent = parent; }); d.folders = d.folders.filter(y => y.id !== id);
            Object.keys(d.of).forEach(k => { if (d.of[k] === id) { if (parent) d.of[k] = parent; else delete d.of[k]; } }); d.closed = d.closed.filter(y => y !== id); });
        if (cur.nav === id) go({view: 'home', nav: 'all'}, {push: false});
    }
    function moveFolder(id, dir) {
        const data = fdata(), f = fById(id); if (!f) return; const sib = fChildren(data, f.parent), i = sib.findIndex(x => x.id === id), j = i + dir; if (j < 0 || j >= sib.length) return;
        fcommit(T('Dossier « {f} » déplacé', {f: f.name}), d => { const a = d.folders.findIndex(x => x.id === id), b = d.folders.findIndex(x => x.id === sib[j].id); const [m] = d.folders.splice(a, 1); d.folders.splice(dir < 0 ? b : b + (a < b ? 0 : 1), 0, m); });
    }
    function folderMenu(btn, id) {
        const f = fById(id); if (!f) return; const data = fdata(), sib = fChildren(data, f.parent), i = sib.findIndex(x => x.id === id);
        UI().menuAt?.(btn, [{icon: '✎', label: T('Renommer le dossier'), run: () => renameFolder(id)}, {icon: '＋', label: T('Nouveau sous-dossier'), disabled: fDepth(data, id) >= (SF()?.MAX_DEPTH || 3), run: () => newFolder(id)},
            {icon: '↑', label: T('Monter'), disabled: i <= 0, run: () => moveFolder(id, -1)}, {icon: '↓', label: T('Descendre'), disabled: i >= sib.length - 1, run: () => moveFolder(id, 1)},
            {icon: '🗑', label: T('Supprimer le dossier'), help: T('garde les diagrammes'), danger: true, run: () => deleteFolder(id)}], {title: `📁 ${f.name}`});
    }
    function folderPick(btn, ids) {
        const data = fdata(), out = []; const walk = (p, dep) => fChildren(data, p).forEach(f => { out.push({icon: '📁', label: `${'  '.repeat(dep)}${f.name}`, run: () => moveTo(ids, f.id)}); walk(f.id, dep + 1); }); walk(null, 0);
        UI().menuAt?.(btn, [{icon: '··', label: T('Sans dossier'), run: () => moveTo(ids, '')}, ...out, '-', {icon: '＋', label: T('Nouveau dossier…'), run: async () => { const id = await newFolder(); if (id) moveTo(ids, id); }}], {title: T('Déplacer dans un dossier')});
    }
    /** ce qui sort : figé, sans les personnes vivantes */
    const shareSpec = async d => I().resolveLive(I().specOf(d), {share: true});
    async function pngBlob(d) { const svg = I().drawSpec(await shareSpec(d)); const c = await I().svgToCanvas(svg, 2, '#ffffff'); return new Promise(r => c.toBlob(r, 'image/png')); }
    async function basketItem(d) {
        const s = await shareSpec(d), k = R().KINDS[s.kind], g = k?.grids?.[0], cols = g ? I().gridCols(g, s) : [];
        return {kind: 'set', title: `📊 ${d.name}`, value: T(k?.label || d.kind), data: {icon: '📊', columns: cols.map(c => c.label), rows: (s[g?.key] || []).slice(0, 500).map(r => cols.map(c => String(r[c.k] ?? ''))), source: T('Diagramme « {name} »', {name: d.name})},
            origin: {label: T('📈 Diagrammes › {name}', {name: d.name}), url: location.pathname + `#diagrammes/${d.id}`}};
    }
    async function placeIn(btn, d) {
        const link = async kind => { const it = await window.LCNDA_PICKER?.openPicker?.({kind, title: T('Poser « {name} » sur…', {name: d.name})}); if (!it?.id) return;
            const type = it.kind === 'investigation' ? 'investigation' : 'person';
            try { await post('link_diagram', {id: d.id, type, entity_id: Number(it.id)}); await load(true); rerender(); toast(T('📄 « {name} » posé sur « {to} »', {name: d.name, to: it.title || ''})); } catch (e) { toast(e.message, 'error'); } };
        UI().menuAt?.(btn, [{icon: '👤', label: T('La fiche d’une personne'), run: () => link('person')}, {icon: '🔎', label: T('Une enquête'), run: () => link('investigation')},
            ...(ext.addDiagramWidget ? [{icon: '🏠', label: T('Le tableau de bord'), run: () => { ext.addDiagramWidget(d); }}] : [])], {title: T('Poser dans…')});
    }
    function cardMenu(btn, d) {
        const ro = kiosk(), run = f => () => Promise.resolve().then(f).catch(e => toast(e.message || String(e), 'error'));
        const items = [{icon: '↗', label: T('Ouvrir'), run: () => open(d.id)}];
        if (!ro) items.push({icon: '⧉', label: T('Dupliquer'), run: run(() => duplicate(d))}, {icon: '✎', label: T('Renommer'), run: run(() => rename(d))},
            {icon: '📁', label: T('Déplacer dans un dossier…'), help: folderOf(d) ? fById(folderOf(d))?.name : T('sans dossier'), run: () => folderPick(btn, [d.id])}, '-');
        items.push({icon: '⤓', label: T('Exporter'), help: 'PNG · SVG · PDF', run: () => I().exportDialog(d.name, () => I().specOf(d))});
        if (!ro) {
            if (ext.sendTo) items.push({icon: '📤', label: T('Envoyer vers…'), help: T('Studio, Présentation'), run: run(async () => ext.sendTo('image', {blob: await pngBlob(d)}, {anchor: btn, title: d.name}))});
            items.push({icon: '📄', label: T('Poser dans…'), help: T('fiche, enquête, tableau'), run: () => placeIn(btn, d)});
            const CX = ext.connexions; if (CX?.take) items.push({icon: '🧺', label: T('Mettre dans le panier'), run: run(async () => CX.take([await basketItem(d)]))});
            if (CX?.putInto) items.push({icon: '📎', label: T('Joindre à une fiche ou une enquête'), run: run(async () => CX.putInto([await basketItem(d)], {anchor: btn}))});
            items.push({icon: '🗑', label: T('Mettre à la corbeille'), danger: true, run: () => trash([d.id])});
        }
        UI().menuAt?.(btn, items, {title: d.name});
    }
    async function duplicate(d) {
        const r = await post('save_diagram', {name: `${d.name} ${T('(copie)')}`.slice(0, 200), kind: d.kind, spec: d.spec || {}}); const id = Number(r.result?.id || r.id);
        const f = folderOf(d); if (f && SF()) { const x = fdata(); x.of[String(id)] = f; SF().write('diagram', x); }
        await load(true); rerender();
        A().undoToast ? A().undoToast(T('« {name} » créé, dans le même dossier', {name: `${d.name} ${T('(copie)')}`}), {undo: async () => { await post('trash_diagrams', {ids: [id]}); await post('empty_diagram_trash', {ids: [id]}); await load(true); rerender(); }}) : toast(T('Copie créée.'));
    }
    async function rename(d) {
        const name = (await askName({title: T('✎ Renommer le diagramme'), value: d.name, okLabel: T('Renommer')})).slice(0, 200); if (!name || name === d.name) return;
        const before = d.name, put = async n => { await post('save_diagram', {id: d.id, name: n, kind: d.kind, spec: d.spec || {}}); await load(true); rerender(); };
        await put(name); A().undoToast ? A().undoToast(T('Renommé « {name} »', {name}), {undo: () => put(before)}) : toast(T('Renommé « {name} »', {name}));
    }
    async function bulkExport(btn, ids) {
        const list = ids.map(byId).filter(Boolean); if (!list.length) return;
        const zipOf = async fmt => {
            const SH = window.LCNDA_SHEET, files = [], used = new Set();
            for (const d of list) { let base = A().safeExportFilename ? A().safeExportFilename(d.name, 'diagramme') : 'diagramme'; let n = base, k = 2; while (used.has(n)) n = `${base}-${k++}`; used.add(n);
                if (fmt === 'svg') files.push({name: n + '.svg', data: I().drawSpec(await shareSpec(d))}); else files.push({name: n + '.png', data: new Uint8Array(await (await pngBlob(d)).arrayBuffer()), store: true}); }
            if (!SH?.makeZip) { files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.data], {type: fmt === 'svg' ? 'image/svg+xml' : 'image/png'})); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }); return; }
            const blob = await SH.makeZip(files), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `diagrammes-${new Date().toISOString().slice(0, 10)}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            toast(T('⤓ {n} diagrammes exportés (sans les personnes vivantes)', {n: list.length}));
        };
        UI().menuAt?.(btn, [{icon: '🖼', label: T('Un .zip d’images PNG'), run: () => zipOf('png').catch(e => toast(e.message, 'error'))}, {icon: '✒️', label: T('Un .zip de dessins SVG'), run: () => zipOf('svg').catch(e => toast(e.message, 'error'))}], {title: T('Exporter {n} diagrammes', {n: list.length})});
    }

    /* ═════════════ ⚙ les réglages de l'onglet ═════════════ */
    function openSettings() {
        const dlg = document.createElement('dialog'); dlg.className = 'modal dgo-settings';
        const seg = (k, pairs, v) => `<span class="segmented sm" role="group">${pairs.map(([x, l]) => `<button type="button" data-dgo-set="${k}" data-v="${esc(x)}" aria-pressed="${String(v) === String(x)}">${esc(l)}</button>`).join('')}</span>`;
        const tog = (k, label, v) => `<label class="ui-toggle"><input type="checkbox" data-dgo-tog="${k}" ${v ? 'checked' : ''}><i></i>${esc(label)}</label>`;
        const row = (t, h, ctl) => `<div class="dgo-setrow"><div><b>${esc(t)}</b><small class="muted">${esc(h)}</small></div><div>${ctl}</div></div>`;
        const paint = () => { const p = prefs(), data = fdata(), out = []; const walk = (par, dep) => fChildren(data, par).forEach(f => { out.push([f.id, `${'— '.repeat(dep)}📁 ${f.name}`]); walk(f.id, dep + 1); }); walk(null, 0);
            dlg.querySelector('[data-dgo-setbody]').innerHTML = [
                row(T('Vue de départ'), T('Comment s’affiche « Tous mes diagrammes ».'), seg('view', [['grid', '▦ ' + T('Vignettes')], ['list', '☰ ' + T('Liste')]], p.view)),
                row(T('En ouvrant l’onglet'), T('Ce qu’on voit en arrivant.'), `<select class="ui-select" data-dgo-sel="start">${[['all', T('Tous mes diagrammes')], ['recent', T('Les récents')], ['last', T('Le dernier ouvert')]].map(([x, l]) => `<option value="${x}"${p.start === x ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`),
                row(T('Types conseillés'), T('Combien de dessins proposés d’abord, dans « ＋ Nouveau » et « 📊 Partir des données ».'), `<select class="ui-select" data-dgo-sel="n">${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'all'].map(x => `<option value="${x}"${String(suggestN()) === String(x) ? ' selected' : ''}>${x === 'all' ? esc(T('Tous')) : x}</option>`).join('')}</select>`),
                row(T('Dossier par défaut'), T('Où se range un nouveau diagramme.'), `<select class="ui-select" data-dgo-sel="folder"><option value="open"${p.folder === 'open' ? ' selected' : ''}>${esc(T('Le dossier ouvert (sinon : sans dossier)'))}</option><option value=""${p.folder === '' ? ' selected' : ''}>${esc(T('Sans dossier'))}</option>${out.map(([id, l]) => `<option value="${esc(id)}"${p.folder === id ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`),
                row(T('Montrer les vignettes'), T('Éteint : une icône à la place du dessin (plus rapide sur un vieil ordinateur).'), tog('thumbs', T('Montrer les vignettes'), p.thumbs)),
                row(T('Demander avant de supprimer'), T('Éteint au départ : un diagramme supprimé va à la 🗑 Corbeille (30 jours) et « ↶ Annuler » le remet.'), tog('ask', T('Demander avant de supprimer'), p.ask)),
                row(T('Montrer aussi mes graphiques'), T('Ceux de l’Éditeur de graphiques (Réglages), mêlés aux diagrammes, avec 📈.'), tog('graphs', T('Montrer aussi mes graphiques'), p.graphs))].join(''); };
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📈 ${esc(T('Diagrammes'))}</span><h2>⚙ ${esc(T('Réglages de l’onglet'))}</h2></div><button class="icon-button" type="button" data-close aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="modal-body dgo-setbody" data-dgo-setbody></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-dgo-setreset>↺ ${esc(T('Valeurs de départ'))}</button><span class="spacer"></span><button type="button" class="button" data-close>${esc(T('Fermer'))}</button></div>`;
        document.body.appendChild(dlg); paint();
        const changed = () => { paint(); rerender(); };
        dlg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-close')) { dlg.close(); dlg.remove(); return; }
            if (b.dataset.dgoSet) { savePrefs({[b.dataset.dgoSet]: b.dataset.v}); return changed(); }
            if (b.hasAttribute('data-dgo-setreset')) { const p = prefs(); writeLS(K_SET, JSON.stringify({groups: p.groups, hidden: p.hidden, trashFolder: p.trashFolder})); writeLS(K_N, null); return changed(); } });
        dlg.addEventListener('change', e => { const t = e.target;
            if (t.dataset.dgoTog) { savePrefs({[t.dataset.dgoTog]: t.checked}); return changed(); }
            if (t.dataset.dgoSel === 'n') { writeLS(K_N, t.value); return changed(); }
            if (t.dataset.dgoSel) { savePrefs({[t.dataset.dgoSel]: t.value}); return changed(); } });
        dlg.addEventListener('cancel', e => { e.preventDefault(); dlg.close(); dlg.remove(); });
        dlg.showModal();
    }
    /** « Réordonner » : l'ordre des groupes de la colonne, ceux qui s'affichent */
    function openReorder() {
        if (kiosk()) return;
        let order = orderedGroups().map(g => g[0]); const hid = new Set(prefs().hidden);
        const dlg = document.createElement('dialog'); dlg.className = 'modal dashboard-reorder-dialog mt-reorder dgo-reorder';
        const draw = () => { dlg.querySelector('[data-dgo-rows]').innerHTML = order.map((id, i) => { const g = GROUPS.find(x => x[0] === id);
            return `<li class="dashboard-reorder-row${hid.has(id) ? ' is-hidden-row' : ''}" data-ii="${i}"><label class="mt-vis"><input type="checkbox" data-dgo-vis="${id}" ${hid.has(id) ? '' : 'checked'} aria-label="${esc(T('Afficher « {t} »', {t: T(g[2])}))}"></label><span class="order-number">${g[1]}</span><b style="flex:1">${esc(T(g[2]))}</b><span class="order-actions"><button type="button" class="button small secondary" data-move="-1" aria-label="${esc(T('Monter'))}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="button small secondary" data-move="1" aria-label="${esc(T('Descendre'))}" ${i < order.length - 1 ? '' : 'disabled'}>↓</button></span></li>`; }).join(''); };
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📈 ${esc(T('Diagrammes'))}</span><h2>${esc(T('Réordonner la colonne'))}</h2><p>${esc(T('L’ordre des groupes (⭐ 🕘 📁 🔄 🧩 🗑) et ceux qui s’affichent.'))}</p></div><button class="icon-button" type="button" data-close aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="mt-rbody"><section class="mt-rgroup"><ol class="dashboard-reorder-list" data-dgo-rows></ol></section></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-dgo-rreset>↺ ${esc(T('Rétablir l’ordre de départ'))}</button><span class="spacer"></span><button class="button secondary" type="button" data-close>${esc(T('Annuler'))}</button><button class="button" type="button" data-save>${esc(T('Enregistrer'))}</button></div>`;
        document.body.append(dlg); draw();
        const close = () => { dlg.close(); dlg.remove(); };
        dlg.addEventListener('change', e => { const id = e.target.dataset?.dgoVis; if (!id) return; if (e.target.checked) hid.delete(id); else hid.add(id); draw(); });
        dlg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-close')) return close();
            if (b.dataset.move) { const i = Number(b.closest('[data-ii]').dataset.ii), j = i + Number(b.dataset.move); [order[i], order[j]] = [order[j], order[i]]; return draw(); }
            if (b.hasAttribute('data-dgo-rreset')) { order = GROUPS.map(g => g[0]); hid.clear(); return draw(); }
            if (b.hasAttribute('data-save')) { const before = readLS(K_SET, null); savePrefs({groups: order, hidden: [...hid]}); close(); A().renderSidebar?.();
                A().undoToast ? A().undoToast(T('Colonne rangée'), {undo: () => { writeLS(K_SET, before); A().renderSidebar?.(); }}) : toast(T('Colonne rangée')); } });
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dlg.showModal();
    }

    /* ═════════════ la colonne de gauche ═════════════ */
    const grpOpen = () => { const v = readJ(K_GRP, {}); return v && typeof v === 'object' ? v : {}; };
    function sidebar(content, footer) {
        const sb = A().sideButton; if (!sb) { content.innerHTML = ''; return; }
        const ro = kiosk(), p = prefs(), data = fdata(), go0 = grpOpen();
        const active = cur.view === 'edit' ? `d:${cur.id}` : cur.view === 'new' ? 'new' : cur.view === 'trash' ? 'trash' : cur.view === 'model' ? `model:${cur.model}` : `nav:${cur.nav}`;
        const num = i => String(i + 1).padStart(2, '0');
        const cnt = n => ` <small class="dgo-n">${nf(n)}</small>`;
        const dItem = (d, i) => sb(`d:${d.id}`, num(i), `<span class="dgo-lb">${esc(d.name)}</span>`, active);
        const count = f => dlist.filter(d => { const x = data.of[String(d.id)]; return x === f || (x && fInside(data, x, f)); }).length;
        const folderRows = (parent, dep) => fChildren(data, parent).map(f => `<div class="dgo-frow" data-dgo-drop="${esc(f.id)}" style="--dgo-dep:${dep}">${sb(`nav:${f.id}`, '📁', `<span class="dgo-lb">${esc(f.name)}</span>${cnt(count(f.id))}`, active)}${ro ? '' : `<button type="button" class="dgo-fmore" data-dgo-fmore="${esc(f.id)}" aria-label="${esc(T('Le dossier « {f} »', {f: f.name}))}" aria-haspopup="menu">⋯</button>`}</div>${folderRows(f.id, dep + 1)}`).join('');
        const favs = dlist.filter(d => Number(d.favorite)), recs = recents(), ms = models();
        const grp = (k, ic, label, n, items, more = '') => { const open = go0[k] ?? (k === 'fav' || k === 'fold' || (k === 'tr' && cur.view === 'trash') || (k === 'mod' && cur.view === 'model') || (k === 'st' && ['live', 'frozen'].includes(cur.nav)) || (k === 'rec' && cur.nav === 'rec'));
            return `<details class="mt-group dgo-grp" data-dgo-grp="${k}" ${open ? 'open' : ''}><summary><span class="mt-gicon" aria-hidden="true">${ic}</span><span class="mt-glabel">${esc(T(label))}</span><small>${nf(n)}</small>${more}</summary><div class="mt-gitems">${items}</div></details>`; };
        const G = {
            fav: () => grp('fav', '⭐', 'Favoris', favs.length, favs.map(dItem).join('') || `<p class="dgo-hint">${esc(T('Clique ☆ sur un diagramme.'))}</p>`),
            rec: () => grp('rec', '🕘', 'Récents', recs.length, recs.map(dItem).join('') || `<p class="dgo-hint">${esc(T('Les derniers ouverts arrivent ici.'))}</p>`),
            fold: () => grp('fold', '📁', 'Dossiers', data.folders.length, `${folderRows(null, 0)}<div class="dgo-frow" data-dgo-drop="">${sb('nav:nofold', '··', `<span class="dgo-lb">${esc(T('Sans dossier'))}</span>${cnt(dlist.filter(d => !data.of[String(d.id)]).length)}`, active)}</div>${ro ? '' : `<button type="button" class="link-button dgo-addf" data-dgo-newfolder>＋ ${esc(T('Nouveau dossier'))}</button>`}`),
            st: () => grp('st', '🔄', 'À jour · 📌 Figés', dlist.length, sb('nav:live', '🔄', `<span class="dgo-lb">${esc(T('À jour'))}</span>${cnt(dlist.filter(isLive).length)}`, active) + sb('nav:frozen', '📌', `<span class="dgo-lb">${esc(T('Figés'))}</span>${cnt(dlist.filter(d => !isLive(d)).length)}`, active)),
            mod: () => grp('mod', '🧩', 'Modèles', ms.length, ms.map((m, i) => sb(`model:${i}`, num(i), `<span class="dgo-lb">${esc(R()?.KINDS?.[m.kind]?.icon || '📊')} ${esc(m.name || T('Modèle'))}</span>`, active)).join('') || `<p class="dgo-hint">${esc(T('« ⭐ Enregistrer comme modèle » dans ⚙️ Personnaliser.'))}</p>`),
            tr: () => (ro ? '' : grp('tr', '🗑', 'Corbeille', tlist ? tlist.length : 0, sb('trash', '🗑', `<span class="dgo-lb">${esc(T('Voir la corbeille'))}</span>${tlist ? cnt(tlist.length) : ''}`, active)))};
        content.innerHTML = `<div class="side-menu mt-groups dgo-side" data-dgo-side>
            <input type="search" class="mt-search" data-dgo-q value="${esc(S.q)}" placeholder="${esc(T('Chercher un diagramme…'))}" aria-label="${esc(T('Chercher un diagramme'))}">
            <div class="mt-gitems dgo-top">${ro ? '' : sb('new', '＋', esc(T('Nouveau diagramme')), active)}${sb('nav:all', '🗂', `<span class="dgo-lb">${esc(T('Tous mes diagrammes'))}</span>${cnt(dlist.length)}`, active)}</div>
            ${orderedGroups().filter(g => !p.hidden.includes(g[0])).map(g => G[g[0]]()).join('')}</div>`;
        footer.innerHTML = ro ? `<p class="dgo-foot muted">${esc(T('Mode consultation : on voit et on ouvre, rien d’autre.'))}</p>` : `<div class="dashboard-footer-actions"><button class="button small secondary" type="button" data-dgo-reorder>${esc(T('Réordonner'))}</button></div><p class="dgo-foot muted">${esc(T('Glisse un diagramme sur un 📁 pour le ranger.'))}</p>`;
        if (!tlist && !ro) loadTrash().then(() => { if (A().state?.module === MOD && content.isConnected) { const s = content.querySelector('[data-dgo-grp="tr"] summary small'); if (s) s.textContent = nf(tlist.length); const b = content.querySelector('[data-side-value="trash"]'); if (b && !b.querySelector('.dgo-n')) b.insertAdjacentHTML('beforeend', cnt(tlist.length)); } });
        if (!loaded) load().then(() => { if (A().state?.module === MOD) A().renderSidebar?.(); });
        bindSide(content, footer);
    }
    function bindSide(content, footer) {
        const signal = A().sidebarSignal?.(), on2 = (el, ev, fn) => el.addEventListener(ev, fn, signal ? {signal} : undefined);
        on2(content, 'click', e => {
            const fm = e.target.closest('[data-dgo-fmore]'); if (fm) { e.preventDefault(); e.stopPropagation(); return folderMenu(fm, fm.dataset.dgoFmore); }
            if (e.target.closest('[data-dgo-newfolder]')) return newFolder();
            const b = e.target.closest('[data-side-value]'); if (!b) return; e.preventDefault();
            const v = b.dataset.sideValue;
            if (v === 'new') return go({view: 'new', door: 'ask'});
            if (v === 'trash') return go({view: 'trash'});
            if (v.startsWith('d:')) return open(Number(v.slice(2)));
            if (v.startsWith('model:')) return go({view: 'model', model: Number(v.slice(6))});
            if (v.startsWith('nav:')) return go({view: 'home', nav: v.slice(4)});
        });
        on2(content, 'toggle', e => { const d = e.target.closest?.('[data-dgo-grp]'); if (!d) return; const g = grpOpen(); g[d.dataset.dgoGrp] = d.open; writeLS(K_GRP, JSON.stringify(g)); }, true);
        const q = content.querySelector('[data-dgo-q]');
        on2(q, 'input', () => { S.q = q.value; const v = fold(q.value.trim());
            content.querySelectorAll('[data-dgo-grp] [data-side-value^="d:"]').forEach(b => { b.hidden = !!v && !fold(b.textContent).includes(v); });
            if (cur.view === 'home') { const ws = document.getElementById('workspace'); renderHome(ws); } else if (v) go({view: 'home', nav: 'all'}).then(() => { const x = document.querySelector('#sidebar-content [data-dgo-q]'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }); });
        // glisser une carte sur un 📁 (ou « Sans dossier ») : rangée
        on2(content, 'dragover', e => { const r = e.target.closest?.('[data-dgo-drop]'); if (!r || !dragIds.length) return; e.preventDefault(); content.querySelectorAll('.is-drop').forEach(x => x !== r && x.classList.remove('is-drop')); r.classList.add('is-drop'); });
        on2(content, 'dragleave', e => { const r = e.target.closest?.('[data-dgo-drop]'); if (r && !r.contains(e.relatedTarget)) r.classList.remove('is-drop'); });
        on2(content, 'drop', e => { const r = e.target.closest?.('[data-dgo-drop]'); if (!r || !dragIds.length) return; e.preventDefault(); r.classList.remove('is-drop'); const ids = dragIds; dragIds = []; moveTo(ids, r.dataset.dgoDrop); });
        on2(footer, 'click', e => { if (e.target.closest('[data-dgo-reorder]')) openReorder(); });
    }
    let dragIds = [];

    /* ═════════════ les clics dans la page ═════════════ */
    const inPage = e => A().state?.module === MOD && e.target.closest?.('#workspace [data-dgo-page]');
    document.addEventListener('click', e => {
        const page = inPage(e); if (!page) return;
        const t = e.target;
        const nav = t.closest('[data-dgo-nav]'); if (nav) { e.preventDefault(); return go({view: 'home', nav: nav.dataset.dgoNav}); }
        if (t.closest('[data-dgo-new]')) return go({view: 'new', door: cur.view === 'new' ? cur.door : 'ask'});
        const door = t.closest('[data-dgo-door]'); if (door) return go({view: 'new', door: door.dataset.dgoDoor}, {push: false});
        const fd = t.closest('[data-dgo-fromdata]'); if (fd) return create({spec: I().presetSpec({kind: 'stacked'}), name: T('Mon diagramme'), data: {src: fd.dataset.dgoFromdata}});
        const um = t.closest('[data-dgo-usemodel]'); if (um) return useModel(Number(um.dataset.dgoUsemodel));
        if (t.closest('[data-dgo-settings]')) return openSettings();
        const gl = t.closest('[data-dgo-golink]'); if (gl) { e.preventDefault(); const [type, id, inv] = gl.dataset.dgoGolink.split(':'); return I().goLink?.(type, Number(id), Number(inv)); }
        const st = t.closest('[data-dgo-star]'); if (st) { e.stopPropagation(); const d = byId(st.dataset.dgoStar); return d && star([d.id], !Number(d.favorite)); }
        const mo = t.closest('[data-dgo-more]'); if (mo) { e.stopPropagation(); const d = byId(mo.dataset.dgoMore); return d && cardMenu(mo, d); }
        const fm = t.closest('[data-dgo-fmore]'); if (fm) { e.stopPropagation(); return folderMenu(fm, fm.dataset.dgoFmore); }
        if (t.closest('[data-dgo-stop]')) return;
        const gr = t.closest('[data-dgo-graph]'); if (gr) { const g = (ext.myStatDefs?.() || []).find(x => x.id === gr.dataset.dgoGraph); if (!g) return; return g.inStats ? ext.openCustomStat?.(g.id) : ext.editStatFor?.(g.id); }
        const op = t.closest('[data-dgo-open]'); if (op) { if (S.multi) { const id = Number(op.dataset.dgoOpen); S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); return rerender(); } return open(Number(op.dataset.dgoOpen)); }
        const v = t.closest('[data-dgo-view]'); if (v) { savePrefs({view: v.dataset.dgoView}); return rerender(); }
        if (t.closest('[data-dgo-fpanel]')) { S.fpanel = !S.fpanel; return rerender(); }
        if (t.closest('[data-dgo-fclear]')) { Object.values(S.F).forEach(x => x.clear?.()); S.F.who = ''; return rerender(); }
        const f = t.closest('[data-dgo-f]'); if (f) { const k = f.dataset.dgoF, val = f.dataset.v; if (k === 'who') S.F.who = S.F.who === val ? '' : val; else if (S.F[k].has(val)) S.F[k].delete(val); else S.F[k].add(val); return rerender(); }
        if (t.closest('[data-dgo-multi]')) { S.multi = !S.multi; S.sel.clear(); return rerender(); }
        if (t.closest('[data-dgo-selall]')) { shown().filter(d => !d.graph).forEach(d => S.sel.add(d.id)); return rerender(); }
        const bk = t.closest('[data-dgo-bulk]'); if (bk) { const ids = [...S.sel]; if (!ids.length) return;
            if (bk.dataset.dgoBulk === 'del') return trash(ids);
            if (bk.dataset.dgoBulk === 'fav') return star(ids, true);
            if (bk.dataset.dgoBulk === 'move') return folderPick(bk, ids);
            if (bk.dataset.dgoBulk === 'exp') return bulkExport(bk, ids); }
        const rs = t.closest('[data-dgo-restore]'); if (rs) return restore([Number(rs.dataset.dgoRestore)]).then(() => { if (cur.view === 'edit') go({view: 'edit', id: cur.id}, {push: false}); });
        if (t.closest('[data-dgo-empty]')) return emptyTrash();
        const ex = t.closest('[data-dgo-export]'); if (ex) { const d = byId(ex.dataset.dgoExport); return d && I().exportDialog(d.name, () => I().specOf(d)); }
        const eg = t.closest('[data-dgo-editgraph]'); if (eg) return ext.editMyGraph?.(eg.dataset.dgoEditgraph);
    });
    document.addEventListener('change', e => {
        if (!inPage(e)) return;
        if (e.target.matches('[data-dgo-sort]')) { S.sort = e.target.value; return rerender(); }
        if (e.target.matches('[data-dgo-ck]')) { const id = Number(e.target.dataset.dgoCk); if (e.target.checked) S.sel.add(id); else S.sel.delete(id); return rerender(); }
    });
    document.addEventListener('dragstart', e => {
        if (!inPage(e) || kiosk()) return; const c = e.target.closest?.('[data-dgo-card]'); if (!c || !/^\d+$/.test(c.dataset.dgoCard)) return;
        const id = Number(c.dataset.dgoCard); dragIds = S.multi && S.sel.has(id) ? [...S.sel] : [id];
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); } catch (_) {}
        c.classList.add('is-drag');
    });
    document.addEventListener('dragend', e => { e.target.closest?.('[data-dgo-card]')?.classList.remove('is-drag'); setTimeout(() => { dragIds = []; }, 50); document.querySelectorAll('#sidebar-content .is-drop').forEach(x => x.classList.remove('is-drop')); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.multi && A().state?.module === MOD && cur.view === 'home' && !document.querySelector('dialog[open], .ui-actmenu')) { S.multi = false; S.sel.clear(); rerender(); } });

    ext.diagrammesOnglet = {on, setOn, open, edit, create, trash, restore, emptyTrash, render, sidebar, hash, refresh, saved, prefs, savePrefs, current: () => ({...cur}), go, openSettings, openReorder, commitEmpty, K_SET};
})();
