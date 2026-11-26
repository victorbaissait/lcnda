/* LCNDA — 📊 Récap des données, et une question en français sur les listes (maquette validée docs/design/donnees-question-recap.html,
 * décisions du 2026-11-26).
 *
 *  UN SEUL écran, monté à deux endroits (jamais une copie) : Listes → 🧰 Données (première vue) et l'onglet « 📊 Données » du haut
 *  (caché au départ, comme 🧺 Paniers : app-onglets-plus.js CATALOG + FLAGGED, repère genealogie-menu-donnees). Un seul état : la dernière
 *  question, la vue (📊 Récap · 🧰 Thèmes) — on retrouve la même chose par l'une ou l'autre porte.
 *   · 📊 Récap : la boîte « Pose une question sur les données… » et ses exemples ; « Pour ta famille » (au plus 4 lignes, une par thème,
 *     calculées ici avec les lieux et les dates de la généalogie : GET ld_famille, jamais une fiche confidentielle, pas les vivants en
 *     consultation ; gardées un jour) ; « À faire » (⤓ à installer, ↻ plus récent → Réglages → 🗂 Données) ; les 20 thèmes en une ligne
 *     chacun (un clic ouvre le thème, sur sa liste réunie). 🧰 Thèmes : l'écran des thèmes en cartes (app-listes-themes.js).
 *   · La question : la lecture de la phrase des paniers (app-paniers-core.js : parseData = parseSmart élargi aux mots des 20 thèmes,
 *     ageSpan), « J'ai compris » en pastilles qu'on touche pour corriger (Quoi · Qui · Quand · Où + rayon − / + ou tapé), puis les lignes
 *     trouvées par le moteur des listes (LCNDA_EXT.dataListsEngine : fetchPage avec near + years) ; 📎 🧺 ↗ et plusieurs lignes à la
 *     fois (app-listes-choix.js) ; « Ouvrir la liste complète » (mêmes critères) ; « Je n'ai pas compris : … » dit honnêtement ; une
 *     question sur la famille seulement → 🔍 Recherche → « Poser une question en français ».
 *   · « près de » sans distance : le rayon du thème (RADIUS, une seule table ici), réglable dans Réglages → 🧰 Listes de données.
 *   · ⌘K : une ligne « 📊 Demander aux données : « … » » quand la phrase nomme un thème ; la réponse n'est calculée qu'en la choisissant.
 *  Rien ne part sur Internet : la personne est cherchée sur TON serveur ; une liste qui interroge un site ne reçoit que lieu, rayon, années.
 *  Réglages (clés « genealogie-… ») : genealogie-donnees-place ('listes' | 'onglet' | 'deux' ; jamais aucun des deux),
 *    genealogie-donnees-rayons ({thème: km}) ; ↶ Annuler par A().undoToast. Mode consultation : lecture seule.
 *  API : LCNDA_EXT.dataHome = {mount(hôte, {door}), render(token), ask(phrase), setView(v), place(), setPlace(v), RADIUS, radiusOf(id)} ;
 *        LCNDA_EXT.dataAsk(phrase) → {u, d, rows, total} (sans écran).
 *  Essai : tests/test-donnees-recap.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const C = () => ext.paniersCore || null;
    const TH = () => ext.listesThemes || null;
    const LF = () => ext.listesFamille || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const offline = () => kiosk() || !!window.LCNDA_GUEST;
    const api = (a, q = {}) => A().api(a, q);
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (_) {} };
    const K_PLACE = 'genealogie-donnees-place', K_RAD = 'genealogie-donnees-rayons', K_CACHE = 'lcnda-donnees-recap', MOD = 'donnees', OVERVIEW = 'donnees';
    const SETTINGS_TAB = 'listes_donnees_reglages';

    /* ═════════════ le rayon par thème : UNE table (« près de » sans distance) ═════════════ */
    const RADIUS = {seismes: 150, eaux: 10, ciel: 100, guerres: 50, monuments: 30, village: 10, images: 30, lieux: 20, pouvoirs: 30, noms: 30, personnes: 30, metiers: 30,
        terre: 30, routes: 30, croire: 20, prix: 100, livres: 50, fetes: 30, evenements: 200, sport: 100};
    const radii = () => { try { const v = JSON.parse(readLS(K_RAD, '{}')); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const radiusOf = id => { const v = Number(radii()[id]); return v > 0 && v <= 2000 ? v : (RADIUS[id] || 30); };
    const STEPS = [1, 2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000];
    const stepKm = (k, dir) => (dir > 0 ? STEPS.find(s => s > k) || 2000 : [...STEPS].reverse().find(s => s < k) || 1);
    /** des mots de plus pour la question (ceux du registre des thèmes d'abord) */
    const EXTRA = {ciel: ['quel temps', 'temps qu', 'pluie', 'neige', 'orage', 'gel'], images: ['musee', 'peinture'], sport: ['tour de france', 'velo', 'jeux olympiques'], guerres: ['combat', 'escarmouche'],
        eaux: ['innond', 'debordement'], seismes: ['tremblement de terre', 'secousse'], personnes: ['celebrite', 'celebres', 'gens connus'], croire: ['abbaye', 'cimetiere']};
    const themesForParse = () => (ext.dataListThemes || []).filter(t => t && t.id && t.id !== 'aranger').map(t => ({id: t.id, words: [...(t.words || []), ...(EXTRA[t.id] || [])]}));
    const themeById = id => (TH()?.themes?.() || ext.dataListThemes || []).find(t => t.id === id) || null;

    /* ═════════════ où sont les données : Listes, l'onglet 📊 Données, ou les deux — jamais aucun ═════════════ */
    const tabButton = () => document.querySelector(`.main-nav .nav-item[data-module="${MOD}"]`);
    const hiddenKeys = () => { try { return A().menuHiddenKeys ? A().menuHiddenKeys() : JSON.parse(localStorage.getItem('genealogie-menu-hidden') || '[]'); } catch (_) { return []; } };
    const tabOn = () => !!tabButton() && !hiddenKeys().includes(MOD);
    /** la place réelle : l'onglet allumé ailleurs (＋ Ajouter un onglet, Réglages → Menus) compte aussi ; éteint, les données restent dans Listes */
    function place() { const v = readLS(K_PLACE, 'listes'); if (!tabOn()) return 'listes'; return v === 'onglet' ? 'onglet' : 'deux'; }
    let inMemo = null; // une fois par dessin : la colonne de Listes le demande pour chaque carte (querySelector + localStorage à chaque fois)
    const inListes = () => { if (inMemo === null) { inMemo = place() !== 'onglet'; Promise.resolve().then(() => { inMemo = null; }); } return inMemo; };
    const KEYS = ['genealogie-menu-hidden', `genealogie-menu-${MOD}`, 'genealogie-menu-added', K_PLACE];
    function setPlace(v, {undo = true} = {}) {
        if (!['listes', 'onglet', 'deux'].includes(v) || kiosk()) return;
        const snap = Object.fromEntries(KEYS.map(k => [k, readLS(k, null)]));
        let hidden = []; try { hidden = JSON.parse(readLS('genealogie-menu-hidden', '[]')) || []; } catch (_) {}
        let added = []; try { added = JSON.parse(readLS('genealogie-menu-added', '[]')) || []; } catch (_) {}
        if (v === 'listes') { hidden = [...new Set([...hidden, MOD])]; added = added.filter(k => k !== MOD); }
        else { hidden = hidden.filter(k => k !== MOD); added = [...new Set([...added, MOD])]; }
        writeLS('genealogie-menu-hidden', JSON.stringify(hidden)); writeLS(`genealogie-menu-${MOD}`, '1'); writeLS('genealogie-menu-added', JSON.stringify(added)); writeLS(K_PLACE, v);
        const after = () => { inMemo = null; try { A().applyMenuOrder?.(); } catch (_) {} try { E().sync?.(); } catch (_) {} try { if (A().state?.module === 'listes') A().renderSidebar?.(); } catch (_) {} if (A().state?.module === 'maintenance' && A().state.maintenanceTab === SETTINGS_TAB) ext.maintenance[SETTINGS_TAB]?.(); };
        after();
        const msg = v === 'listes' ? T('Les données : dans Listes seulement') : v === 'onglet' ? T('Les données : dans l’onglet 📊 Données seulement') : T('Les données : dans Listes et dans l’onglet 📊 Données');
        if (undo && A().undoToast) A().undoToast(msg, {undo: () => { Object.entries(snap).forEach(([k, x]) => writeLS(k, x)); after(); }}); else if (undo) toast(msg);
    }
    // « dans l'onglet seulement » : Listes ne montre plus 🧰 Données dans sa colonne (sauf la liste ouverte)
    const prevShown = ext.listShown;
    ext.listShown = k => {
        const s = String(k);
        if (!inListes() && (s === OVERVIEW || s.startsWith('data_')) && s !== A().state?.listType) return false;
        return prevShown ? prevShown(k) : true;
    };

    /* ═════════════ l'état (un seul, pour les deux portes) ═════════════ */
    const ST = {view: 'recap', q: '', u: null, res: null, pending: '', running: 0, open: '', sel: new Set(), more: false};
    const ws = () => document.getElementById('workspace');
    const EXAMPLES = ['les séismes à moins de 50 km de Tulle entre 1800 et 1900', 'le Tour de France quand Jean MAZAUD avait 12 ans', 'les musées autour de Brive',
        'les batailles près des lieux de la famille', 'les crues près de Tulle', 'les monuments historiques à 10 km de Treignac'];

    /** l'écran : la porte change seulement le fil d'Ariane */
    async function mount(host, {door = 'listes', token} = {}) {
        host = host || ws(); if (!host) return;
        if (door === 'listes' && !inListes()) {
            host.innerHTML = `<section class="page dr-page dr-moved">${head('listes')}<p class="dr-moved-p">${esc(T('Les données sont dans l’onglet 📊 Données du haut (Réglages → 🧰 Listes de données).'))}</p><button type="button" class="button" data-dr-go-tab>📊 ${esc(T('Ouvrir l’onglet Données'))}</button></section>`;
            host.querySelector('[data-dr-go-tab]').addEventListener('click', () => A().setModule?.(MOD));
            return;
        }
        if (ST.pending) { ST.q = ST.pending; ST.pending = ''; ST.view = 'answer'; ST.u = null; }
        if (ST.view === 'themes' && E().overview) {
            await E().overview(token);
            const page = host.querySelector('.ld-overview'); if (!page) return;
            page.classList.add('dr-themes-view'); page.dataset.drDoor = door;
            if (door === 'onglet') { const w = page.querySelector('.page-header .eyebrow'); if (w) w.textContent = `📊 ${T('Données')}`; }
            const nav = document.createElement('div'); nav.innerHTML = tabsHtml(); page.querySelector('.page-header')?.after(nav.firstElementChild);
            page.querySelector('[data-dr-view]')?.closest('nav')?.addEventListener('click', onTabs);
            return;
        }
        host.innerHTML = `<section class="page collection-page dr-page" data-dr data-dr-door="${esc(door)}">${head(door)}${tabsHtml()}
            <form class="dr-ask" data-dr-form role="search"><span class="dr-ask-ico" aria-hidden="true">🔍</span><input type="text" enterkeyhint="search" data-dr-q value="${esc(ST.q)}" placeholder="${esc(T('Pose une question sur les données…'))}" aria-label="${esc(T('Pose une question sur les données'))}" autocomplete="off"><button type="submit" class="button small">${esc(T('Demander'))}</button></form>
            <div class="dr-ex" data-dr-ex></div>
            <div class="dr-body" data-dr-body aria-live="polite"></div></section>`;
        const page = host.querySelector('[data-dr]');
        bindPage(page);
        paintExamples(page);
        if (ST.view === 'answer' && ST.q) { if (ST.res && ST.u) paintAnswer(page); else runAsk(page, ST.q); }
        else { ST.view = 'recap'; paintRecap(page); }
    }
    const head = door => (UI().pageHeader ? UI().pageHeader({where: door === 'onglet' ? `📊 ${T('Données')}` : `${T('Listes')} · 🧰 ${T('Données')}`, icon: '📊', title: T('Récap des données'),
        help: esc(T('Ce que les listes savent, et ce qu’elles disent de ta famille. Tout est calculé ici, dans ton navigateur.')),
        actions: [`<button type="button" class="button small secondary" data-dr-settings title="${esc(T('Où sont les données, les rayons « près de » par thème'))}">⚙ ${esc(T('Réglages'))}</button>`]})
        : `<header class="page-header"><div><span class="eyebrow">${esc(door === 'onglet' ? T('Données') : T('Listes'))}</span><h2>📊 ${esc(T('Récap des données'))}</h2></div></header>`);
    const tabsHtml = () => `<nav class="dr-tabs" aria-label="${esc(T('Vue'))}"><span class="segmented" role="group"><button type="button" data-dr-view="recap" aria-pressed="${ST.view !== 'themes'}" class="${ST.view !== 'themes' ? 'is-active' : ''}">📊 ${esc(T('Récap'))}</button><button type="button" data-dr-view="themes" aria-pressed="${ST.view === 'themes'}" class="${ST.view === 'themes' ? 'is-active' : ''}">🧰 ${esc(T('Thèmes'))}</button></span></nav>`;
    function onTabs(e) { const b = e.target.closest('[data-dr-view]'); if (!b) return; setView(b.dataset.drView); }
    function setView(v) { ST.view = v === 'themes' ? 'themes' : 'recap'; const st = A().state; if (!st) return; if (st.module === MOD) A().setModule?.(MOD); else if (st.module === 'listes' && st.listType === OVERVIEW) ext.lists?.[OVERVIEW]?.(++st.workspaceToken); }
    function goSettings() { const st = A().state; if (!st) return; st.maintenanceTab = SETTINGS_TAB; A().persistUiState?.(); A().setModule?.('maintenance'); }
    function goDonneesSettings(filter) { const st = A().state; if (!st) return; st.maintenanceTab = 'donnees_installees'; A().persistUiState?.(); A().setModule?.('maintenance'); void filter; }
    function bindPage(page) {
        page.querySelector('[data-dr-form]').addEventListener('submit', e => { e.preventDefault(); const q = page.querySelector('[data-dr-q]').value.trim(); if (!q) return; runAsk(page, q); });
        page.addEventListener('click', e => {
            const t = e.target; let b;
            if ((b = t.closest('[data-dr-view]'))) return setView(b.dataset.drView);
            if (t.closest('[data-dr-settings]')) return goSettings();
            if ((b = t.closest('[data-dr-exq]'))) { page.querySelector('[data-dr-q]').value = b.dataset.drExq; return runAsk(page, b.dataset.drExq); }
            if (t.closest('[data-dr-exmore]')) { ST.more = !ST.more; return paintExamples(page); }
            if (t.closest('[data-dr-back]')) { ST.view = 'recap'; ST.res = null; ST.u = null; ST.q = ''; page.querySelector('[data-dr-q]').value = ''; return paintRecap(page); }
            if ((b = t.closest('[data-dr-theme]'))) { const id = b.dataset.drTheme; if (TH()?.keyOf) E().openKey?.(TH().keyOf(id)); return; }
            if (t.closest('[data-dr-todo-install]') || t.closest('[data-dr-todo-update]')) return goDonneesSettings();
            if (t.closest('[data-dr-trs-more]')) { page.querySelector('.dr-trs')?.classList.toggle('is-open'); const o = page.querySelector('.dr-trs')?.classList.contains('is-open'); t.closest('[data-dr-trs-more]').setAttribute('aria-expanded', String(!!o)); return; }
        });
    }
    function paintExamples(page) {
        const box = page.querySelector('[data-dr-ex]'); if (!box) return;
        const fam = (ST.famEx || []).slice(0, 2), list = [...fam, ...EXAMPLES.filter(x => !fam.includes(x))];
        const shown = ST.more ? list : list.slice(0, 3);
        box.innerHTML = `<span class="dr-klab">${esc(T('Essaie'))}</span>${shown.map(x => `<button type="button" class="dr-k" data-dr-exq="${esc(x)}">${esc(x)}</button>`).join('')}<button type="button" class="dr-k is-more" data-dr-exmore aria-expanded="${ST.more}">${esc(ST.more ? T('moins d’exemples') : T('d’autres exemples'))}</button>`;
    }

    /* ═════════════ 📊 le récap ═════════════ */
    const listsAll = () => (E().list?.() || []).filter(d => d && !d.link && E().shown?.(d) !== false);
    /** le nom d'une ligne : son nom, sinon son lieu, sinon la première colonne de texte */
    function titleOf(d, r) {
        const fs = (d.fields || []).filter(f => f.type !== 'url' && !f.hidden), val = k => { const v = r[k]; return Array.isArray(v) ? v.join(' · ') : v; };
        const k = ['name', 'n', 'title', 'nom', 'label', 'titre'].find(x => val(x) != null && val(x) !== '' && fs.some(f => f.key === x)) || ['name', 'n', 'title', 'nom'].find(x => typeof r[x] === 'string' && r[x])
            || fs.find(f => (f.type === 'text' || f.type === 'place' || !f.type) && val(f.key) != null && val(f.key) !== '')?.key || fs[0]?.key;
        return k ? String(val(k) ?? '—') : '—';
    }
    function paintRecap(page) {
        const body = page.querySelector('[data-dr-body]'); if (!body) return;
        const tl = (TH()?.themeList?.() || []).filter(t => t.id !== 'aranger' || (TH().index().by.get('aranger') || []).length);
        const I = TH()?.index?.();
        const ro = kiosk();
        body.innerHTML = `<div class="dr-rc">
              <section class="dr-box dr-fam" aria-labelledby="dr-fam-h"><h3 id="dr-fam-h">${esc(T('Pour ta famille'))}</h3><ul class="dr-hl" data-dr-hl><li class="dr-wait muted">${esc(T('On regarde les listes autour de tes lieux…'))}</li></ul>
                <p class="dr-note">${esc(T('« voir → » pose la question qui donne ce résultat, dans la boîte du haut : on apprend à demander en regardant.'))}</p></section>
              ${ro ? '' : `<section class="dr-box dr-todo" aria-labelledby="dr-todo-h"><h3 id="dr-todo-h">${esc(T('À faire'))}</h3><ul class="dr-todo-l" data-dr-todo><li class="muted">${esc(T('On compte…'))}</li></ul>
                <p class="dr-note">${esc(T('Les liens mènent à Réglages → 🗂 Données. Rien ne part sur Internet sans ton clic.'))}</p></section>`}
            </div>
            <div class="dr-trs-h"><h3>${esc(T('Les {n} thèmes', {n: nf(tl.length)}))}</h3><small class="muted">${esc(T('installées sur toutes · ⤓ à installer · ↻ plus récent'))}</small></div>
            <div class="dr-trs" data-dr-trs>${tl.map(t => { const ds = (I?.by.get(t.id) || []).filter(d => !d.link && !d.merged);
                return `<button type="button" class="dr-tr" data-dr-theme="${esc(t.id)}"><span class="dr-ic" aria-hidden="true">${esc(t.icon)}</span><span class="dr-trt"><b>${esc(T(t.label))}</b><small data-dr-tn="${esc(t.id)}">${esc(T('{n} listes', {n: nf(ds.length)}))}</small></span><span class="dr-st" data-dr-ts="${esc(t.id)}"></span></button>`; }).join('')}</div>
            <button type="button" class="dr-trs-more" data-dr-trs-more aria-expanded="false">⌄ ${esc(T('{n} autres thèmes', {n: nf(Math.max(0, tl.length - 3))}))}</button>
            <p class="dr-foot muted" data-dr-foot></p>`;
        fillStats(page); fillHighlights(page);
        try { ext.dataPlus?.recap?.(page, body); } catch (e) { console.error(e); } // ⭐ 🕘 🆕 💾 🕳 💽, « ⚙ Organiser le récap » (app-donnees-plus.js)
    }
    /* « dont N utiles pour tes lieux » : seulement quand la liste (d.cover) ou son pack (sommaire : bbox [O, S, E, N] ou country) dit
     * ce qu'il couvre ; sinon on ne compte pas (on ne devine pas). Les lieux de la famille : app-listes-famille.js (lat, lon). */
    const COUNTRY_BOX = {FR: [-5.2, 41.3, 9.6, 51.1], BE: [2.5, 49.5, 6.4, 51.5], CH: [5.9, 45.8, 10.5, 47.8], NL: [3.3, 50.7, 7.3, 53.6], DE: [5.8, 47.2, 15.1, 55.1], ES: [-9.4, 35.9, 4.4, 43.8], IT: [6.6, 36.6, 18.6, 47.1],
        GB: [-8.7, 49.8, 1.8, 60.9], IE: [-10.5, 51.4, -5.9, 55.4], NO: [4.5, 57.9, 31.2, 71.2], SE: [10.9, 55.3, 24.2, 69.1], DK: [8, 54.5, 15.2, 57.8], FI: [20.5, 59.7, 31.6, 70.1], IS: [-24.6, 63.3, -13.4, 66.6],
        US: [-125, 24.4, -66.9, 49.4], CA: [-141, 41.7, -52.6, 83.1], AU: [112.9, -43.7, 153.7, -10.6], NZ: [166.4, -47.3, 178.6, -34.4], PT: [-9.6, 36.9, -6.1, 42.2], PL: [14.1, 49, 24.2, 54.9]};
    const boxOk = b => Array.isArray(b) && b.length === 4 && b.every(x => Number.isFinite(Number(x)));
    async function coverOf(d, packs) {
        const boxes = [], add = c => { if (!c) return; if (boxOk(c.bbox)) boxes.push(c.bbox.map(Number)); [].concat(c.country || []).forEach(k => { const b = COUNTRY_BOX[String(k).toUpperCase()]; if (b) boxes.push(b); }); };
        add(d.cover);
        if (!boxes.length && packs?.packs && ext.listesMaj?.packsOfList) { let ids = []; try { ids = await ext.listesMaj.packsOfList(d); } catch (_) {} ids.forEach(id => add(packs.packs.find(p => p.id === id))); }
        return boxes.length ? boxes : null;
    }
    async function coversFamily(boxes) {
        const LF = ext.listesFamille; if (!LF) return false; try { await LF.ready(); } catch (_) { return false; }
        const pl = LF.data?.()?.places || [];
        return pl.some(({lat, lon}) => boxes.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n));
    }
    /* ✨ « Nouveau : thème » : la date où chaque thème est apparu sur cet ordinateur (la première fois : tous comptent comme déjà là) */
    const K_THSEEN = 'genealogie-donnees-themes-vus', NEW_DAYS = 30;
    function newThemes() {
        const tl = (TH()?.themeList?.() || []).filter(t => t.id !== 'aranger'); if (!tl.length) return [];
        let seen = null; try { seen = JSON.parse(readLS(K_THSEEN, 'null')); } catch (_) {}
        const first = !seen || typeof seen !== 'object', now = Date.now(); seen = first ? {} : seen; let dirty = first;
        tl.forEach(t => { if (!(t.id in seen)) { seen[t.id] = first ? 0 : now; dirty = true; } });
        if (dirty) writeLS(K_THSEEN, JSON.stringify(seen));
        return tl.filter(t => Number(seen[t.id]) > 0 && now - Number(seen[t.id]) < NEW_DAYS * 864e5).map(t => ({...t, at: Number(seen[t.id])}));
    }
    /** les comptes par thème : listes installées, lignes (les paquets livrés le disent), ⤓, ↻ — l'état de Réglages → 🗂 Données */
    let statsP = null, statsAt = 0;
    window.addEventListener('lcnda:installs-changed', () => { statsP = null; }); // ⤓ un pack installé : les comptes « ⤓ à installer » sont refaits
    function stats() {
        if (statsP && Date.now() - statsAt < 300000) return statsP;
        statsAt = Date.now();
        statsP = (async () => {
            const I = TH()?.index?.(), out = {byTheme: {}, total: 0, inst: 0, missing: 0, update: 0, coverKnown: 0, useful: []};
            let packs = null; try { packs = await ext.listesMaj?.status?.(); } catch (_) {}
            const rowsOfPack = new Map((packs?.packs || []).map(p => [p.id, Number(p.rows) || 0]));
            const upd = new Set(); try { (ext.listesMaj?.rows?.() || []).filter(r => r.state === 'update').forEach(r => upd.add(r.k)); } catch (_) {}
            await Promise.all([...(I?.by.entries() || [])].map(async ([id, ds]) => {
                const s = out.byTheme[id] = {n: 0, inst: 0, rows: 0, missing: 0, update: 0};
                await Promise.all(ds.filter(d => !d.link && !d.merged).map(async d => {
                    s.n++; const ok = await E().isInstalled?.(d); if (ok) s.inst++; else s.missing++;
                    if (!ok) { const c = await coverOf(d, packs); if (c) { out.coverKnown++; if (await coversFamily(c)) out.useful.push(T(d.label)); } } // « dont N utiles pour tes lieux »
                    let ps = []; try { ps = ok && ext.listesMaj?.packsOfList ? await ext.listesMaj.packsOfList(d) : []; } catch (_) {}
                    ps.forEach(p => { s.rows += rowsOfPack.get(p) || 0; if (upd.has(p)) s.update++; });
                }));
                out.total += s.n; out.inst += s.inst; out.missing += s.missing; out.update += s.update;
            }));
            return out;
        })().catch(e => { statsP = null; throw e; });
        return statsP;
    }
    async function fillStats(page) {
        let S; try { S = await stats(); } catch (_) { return; } if (!page.isConnected) return;
        Object.entries(S.byTheme).forEach(([id, s]) => {
            const n = page.querySelector(`[data-dr-tn="${CSS.escape(id)}"]`), st = page.querySelector(`[data-dr-ts="${CSS.escape(id)}"]`);
            if (n) n.textContent = `${T('{a} / {b} listes', {a: nf(s.inst), b: nf(s.n)})}${s.rows ? ` · ${s.rows >= 1e6 ? T('{n} millions de lignes', {n: (Math.round(s.rows / 1e5) / 10).toLocaleString('fr-FR')}) : T('{n} lignes', {n: nf(s.rows)})}` : ''}`;
            if (st) st.innerHTML = `${s.missing ? `<span class="dr-dl" title="${esc(T('{n} listes à installer', {n: nf(s.missing)}))}">⤓ ${nf(s.missing)}</span>` : ''}${s.update ? `<span class="dr-up" title="${esc(T('une version plus récente existe'))}">↻</span>` : ''}`;
        });
        const foot = page.querySelector('[data-dr-foot]');
        if (foot) foot.innerHTML = `${esc(T('{a} listes installées sur {b}', {a: nf(S.inst), b: nf(S.total)}))}${S.missing ? ` · ⤓ ${nf(S.missing)}` : ''}${S.update ? ` · ↻ ${nf(S.update)}` : ''} · <button type="button" class="dr-link" data-dr-view="themes">🧰 ${esc(T('voir en cartes'))}</button>`;
        const todo = page.querySelector('[data-dr-todo]');
        if (todo) {
            const last = Number(readLS('genealogie-donnees-maj-dernier', '0')) || 0;
            const items = [];
            if (S.missing) items.push(`<li><span>⤓ ${esc(S.missing > 1 ? T('{n} listes pas encore installées', {n: nf(S.missing)}) : T('1 liste pas encore installée'))}</span><button type="button" class="dr-link" data-dr-todo-install>${esc(T('voir'))}</button></li>`);
            if (S.missing && S.coverKnown && S.useful.length) items.push(`<li class="dr-todo-sub"><small>${esc(T('dont {n} utiles pour tes lieux : {l}', {n: nf(S.useful.length), l: S.useful.slice(0, 3).join(', ') + (S.useful.length > 3 ? '…' : '')}))}</small></li>`);
            if (S.update) items.push(`<li><span>↻ ${esc(S.update > 1 ? T('{n} listes ont une version plus récente', {n: nf(S.update)}) : T('1 liste a une version plus récente'))}</span><button type="button" class="dr-link" data-dr-todo-update>${esc(T('mettre à jour'))}</button></li>`);
            items.push(`<li class="muted"><small>${esc(last ? T('Vérifié le {d}, sur ton clic.', {d: new Date(last).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}) : T('Pas encore vérifié s’il existe plus récent : Réglages → 🗂 Données → ↻ Vérifier.'))}</small></li>`);
            if (!S.missing && !S.update) items.unshift(`<li>✓ ${esc(T('Toutes les listes sont installées.'))}</li>`);
            newThemes().forEach(t => items.push(`<li data-dr-newth="${esc(t.id)}"><span>✨ ${esc(T('Nouveau : {t} ({n} listes)', {t: `${t.icon} ${T(t.label)}`, n: nf((TH()?.index?.().by.get(t.id) || []).filter(d => !d.link && !d.merged).length)}))}</span><button type="button" class="dr-link" data-dr-theme="${esc(t.id)}">${esc(new Date(t.at).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}))}</button></li>`));
            todo.innerHTML = items.join('');
        }
    }

    /* ─── « Pour ta famille » : au plus 4 lignes, une par thème, les plus parlantes ─── */
    const HL = [
        {theme: 'seismes', lists: ['reunie_seismes', 'hist_seismes', 'ha_catastrophes'], km: 50, one: '1 séisme à moins de {km} km des lieux de la famille', many: '{n} séismes à moins de {km} km des lieux de la famille', q: 'les séismes près des lieux de la famille'},
        {theme: 'sport', lists: ['l8c_tour'], km: 30, one: 'Le Tour de France est passé une fois à moins de {km} km des lieux de la famille', many: 'Le Tour de France est passé {n} fois à moins de {km} km des lieux de la famille', q: 'le Tour de France près des lieux de la famille'},
        {theme: 'guerres', lists: ['reunie_batailles', 'ha_batailles'], km: 50, one: '1 bataille ou siège près des lieux de la famille, de leur vivant', many: '{n} batailles ou sièges près des lieux de la famille, de leur vivant', q: 'les batailles près des lieux de la famille'},
        {theme: 'eaux', lists: ['reunie_crues', 'hist_crues'], km: 10, one: '1 crue à moins de {km} km des lieux de la famille, de leur vivant', many: '{n} crues à moins de {km} km des lieux de la famille, de leur vivant', q: 'les crues près des lieux de la famille'},
        {theme: 'ciel', lists: ['eclipses', 'ciel_cometes'], km: 0, one: '1 éclipse ou comète vue du vivant de la famille', many: '{n} éclipses ou comètes vues du vivant de la famille', q: 'les éclipses pendant la vie de la famille', noGeo: true}];
    const hlCacheKey = () => `${LF()?.placesCount?.() || 0}|${(LF()?.data?.()?.people || []).length}|${kiosk() ? 1 : 0}|${listsAll().length}`;
    let hlMem = null;
    async function highlights() {
        await LF()?.ready?.();
        const key = hlCacheKey();
        if (hlMem && hlMem.key === key && Date.now() - hlMem.at < 864e5) return hlMem.items;
        if (!kiosk()) { try { const c = JSON.parse(readLS(K_CACHE, 'null')); if (c && c.key === key && Date.now() - c.at < 864e5) { hlMem = c; return c.items; } } catch (_) {} }
        const F = LF()?.data?.(); const items = [];
        if (F?.places?.length) {
            for (const h of HL) {
                if (items.length >= 4) break;
                const d = h.lists.map(id => listsAll().find(x => x.id === id)).find(Boolean);
                if (!d || h.noGeo || !d.geo || !(await E().isInstalled?.(d))) continue;
                let rows = [];
                try { const p = await E().fetchPage(d, {...E().blank(), view: 'table'}, 0, d.query ? 2000 : 200000); rows = p.all || p.rows || []; } catch (_) { continue; }
                const hits = [];
                for (const r of rows) {
                    const g = E().geoOf(d, r), p = E().periodOf(d, r), y = Array.isArray(p) ? Number(p[0]) : NaN; if (!g || !Number.isFinite(y)) continue;
                    if (LF().nearKm(g[0], g[1], h.km) > h.km) continue;
                    const pr = LF().presence(g[0], g[1], y, h.km); if (!pr.who.length) continue;
                    hits.push({name: titleOf(d, r), y, who: pr.who[0]});
                }
                if (!hits.length) continue;
                hits.sort((a, b) => a.who.km - b.who.km || b.y - a.y);
                const th = themeById(h.theme);
                items.push({theme: h.theme, icon: th?.icon || '•', text: T(hits.length > 1 ? h.many : h.one, {n: nf(hits.length), km: h.km}),
                    sub: hits.slice(0, 3).map(x => `${x.name} ${x.y}${x.who.age != null ? ` (${T('{p} avait {a} ans', {p: x.who.n, a: x.who.age})})` : ''}`).join(' · '), q: h.q});
            }
        }
        hlMem = {key, at: Date.now(), items};
        if (!kiosk()) writeLS(K_CACHE, JSON.stringify(hlMem));
        return items;
    }
    async function fillHighlights(page) {
        const box = page.querySelector('[data-dr-hl]'); if (!box) return;
        let items = []; try { items = await highlights(); } catch (e) { console.error(e); }
        if (!box.isConnected) return;
        ST.famEx = items.map(x => x.q);
        paintExamples(page);
        box.innerHTML = items.length ? items.map(x => `<li><span class="dr-hic" aria-hidden="true">${esc(x.icon)}</span><span><b>${esc(x.text)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span><button type="button" class="dr-link dr-go" data-dr-exq="${esc(x.q)}">${esc(T('voir →'))}</button></li>`).join('')
            : `<li class="muted">${esc(LF()?.placesCount?.() ? T('Rien de marquant trouvé près de tes lieux dans les listes installées.') : T('Place les lieux de ta famille sur la carte : les listes diront ce qui s’est passé autour.'))}</li>`;
    }

    /* ═════════════ la question ═════════════ */
    /** la liste qui répond : celle du thème qui porte le mot (« musées »), sinon sa liste réunie, sinon une liste placée du thème */
    function listsOfTheme(id) { const I = TH()?.index?.(); return I ? (I.by.get(id) || []).filter(d => !d.link && E().shown?.(d) !== false) : []; }
    function pickList(u) {
        const t = u.themes?.[0]; if (!t) return null;
        const ls = listsOfTheme(t.id); if (!ls.length) return null;
        const stem = fold(t.word).split(' ').filter(w => w.length > 2).map(w => w.slice(0, Math.max(4, w.length - 1)));
        const hit = d => { const l = ` ${fold(`${T(d.label)} ${d.label} ${(d.keywords || []).join(' ')}`).replace(/[^a-z0-9]+/g, ' ')} `; return stem.length && stem.every(s => l.includes(` ${s}`)); };
        const geo = d => !!d.geo, mg = ls.filter(d => d.merged);
        return mg.find(d => hit(d) && geo(d)) || ls.find(d => !d.merged && hit(d) && geo(d)) || ls.find(d => hit(d)) || mg.find(geo) || ls.find(geo) || ls[0];
    }
    const placeCache = new Map();
    async function placeLL(name) {
        const k = fold(name); if (!k) return null; if (placeCache.has(k)) return placeCache.get(k);
        let p = null; try { const r = await api('picker_search', {kind: 'place', q: name, limit: 5}); const its = (r.groups || []).flatMap(g => g.items || []).filter(x => x.lat != null && x.lon != null); p = its.find(x => fold(x.title || x.name).startsWith(k)) || its[0] || null; } catch (_) {}
        const v = p ? {lat: Number(p.lat), lon: Number(p.lon), title: String(p.title || p.name || name).replace(/\s*\(.*$/, '')} : null; placeCache.set(k, v); return v;
    }
    const yearOfDate = s => { const m = String(s || '').match(/^(-?\d{1,4})/); return m ? Number(m[1]) : null; };
    /** qui (une fiche de l'arbre, sur TON serveur), son âge → des années, « sa vie », « son mariage », ses lieux à cet âge ; où (un lieu) */
    async function resolve(u) {
        u.person = null; u.whyWhen = ''; u.whoNote = ''; u.center = null; u.whereNote = '';
        if (u.who?.name) {
            const r = await api('picker_search', {kind: 'person', q: u.who.name, limit: 5}).catch(() => ({}));
            const its = (r.groups || []).flatMap(g => g.items || []).filter(x => x.id);
            const p = its[0];
            if (p) {
                const det = await api('person', {id: p.id}).catch(() => null);
                const P = det?.person || {}, evs = det?.events || [], living = P.living_status === 'living' || Number(P.is_private) === 1;
                if (kiosk() && living) { u.whoNote = T('« {p} » n’est pas montré en mode consultation.', {p: u.who.name}); }
                else {
                    const birth = evs.find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.gedcom_tag) && (e.sort_date || e.year)), death = evs.find(e => ['DEAT', 'BURI'].includes(e.gedcom_tag) && e.year);
                    const marr = evs.find(e => e.gedcom_tag === 'MARR' && e.year);
                    const by = birth ? Number(birth.year || yearOfDate(birth.sort_date)) : null;
                    u.person = {id: Number(p.id), name: String(p.title || u.who.name).replace(/\s*\(.*$/, ''), birthY: by, birth: birth?.sort_date || '', birthText: birth?.date_text || '', birthPlace: birth?.place_name || '', deathY: death ? Number(death.year) : null, living};
                    const homs = its.filter(x => fold(String(x.title).replace(/\s*\(.*$/, '')) === fold(u.person.name)).length;
                    if (homs > 1) u.whoNote = T('{n} fiches portent ce nom : je réponds pour celle-ci.', {n: homs});
                    if (u.age && u.person.birth) { const sp = C().ageSpan(u.person.birth, u.age); if (sp) { u.years = [sp.y1, sp.y2]; u.whyWhen = T('« à {a} ans » : de sa naissance ({b}) → du {f} au {t}.', {a: u.age[0] === u.age[1] ? u.age[0] : `${u.age[0]}–${u.age[1]}`, b: u.person.birthText || u.person.birth, f: sp.from, t: sp.to}); } }
                    else if (u.wedding && marr) { u.years = [Number(marr.year), Number(marr.year)]; u.whyWhen = T('son mariage : {d}', {d: String(marr.date_text || marr.year)}); if (!u.around && !u.place && !u.family && marr.place_name) u.place = {name: marr.place_name, auto: true}; }
                    else if ((u.life || !u.years) && by) { u.years = [by, u.person.deathY || Math.min(new Date().getFullYear(), by + 90)]; u.life = true; }
                    if (!u.around && !u.place && !u.family) {
                        const lived = evs.filter(e => e.place_name && e.year && u.years && Number(e.year) <= u.years[1] && Number(e.year) >= u.years[0] - 30).map(e => e);
                        const at = lived.at(-1) || birth;
                        if (at?.place_name) { u.place = {name: at.place_name, auto: true}; if (at.latitude != null && at.longitude != null) placeCache.set(fold(at.place_name), {lat: Number(at.latitude), lon: Number(at.longitude), title: at.place_name}); }
                    }
                }
            } else u.whoNote = T('Personne de ce nom dans ton arbre : « {p} ».', {p: u.who.name});
        }
        const wname = u.around?.name || u.place?.name;
        if (wname && !u.family) { u.center = await placeLL(wname); if (!u.center) u.whereNote = T('lieu introuvable : {l}', {l: wname}); }
        u.where = u.family ? 'family' : u.center ? 'place' : 'all';
        return u;
    }
    /** chercher : le moteur des listes, rien d'autre (une liste en ligne ne reçoit que lieu, rayon et années) */
    async function search(u) {
        const d = u.d; if (!d) return {rows: [], total: 0};
        if (!(await E().isInstalled?.(d))) return {rows: [], total: 0, missing: true};
        const km = u.km;
        const st = {...E().blank(), view: 'table', period: u.years ? {from: u.years[0], to: u.years[1], mode: 'overlap'} : null, near: u.where === 'place' && u.center ? {lat: u.center.lat, lon: u.center.lon, km, title: u.center.title} : null};
        if (st.near) st.sort = '_km';
        if (u.where === 'family') {
            await LF()?.ready?.();
            const p = await E().fetchPage(d, st, 0, d.query ? 5000 : 200000), all = p.all || p.rows || [];
            const rows = []; for (const r of all) { const g = E().geoOf(d, r); if (!g) continue; const k = LF().nearKm(g[0], g[1], km); if (k <= km) rows.push({...r, _km: Math.round(k * 10) / 10}); }
            rows.sort((a, b) => a._km - b._km);
            return {rows: rows.slice(0, 50), total: rows.length, all: rows, st};
        }
        const p = await E().fetchPage(d, st, 0, 50);
        return {rows: p.rows || [], total: p.total ?? (p.rows || []).length, more: !!p.more, st};
    }
    /** sans écran : la phrase → ce que j'ai compris, la liste, les lignes */
    async function dataAsk(q, u0 = null) {
        if (!C()?.parseData) throw new Error(T('La lecture des phrases n’est pas chargée.'));
        const u = u0 || C().parseData(q, {themes: themesForParse()});
        if (!u0) { u.d = pickList(u); u.chg = {}; await resolve(u); u.km = u.kmTyped ? u.km : radiusOf(u.themes?.[0]?.id); }
        const r = u.d && !u.familyOnly ? await search(u) : {rows: [], total: 0};
        return {u, d: u.d, ...r};
    }
    async function runAsk(page, q) {
        ST.q = q; ST.view = 'answer'; ST.u = null; ST.res = null; ST.sel = new Set(); ST.open = '';
        const my = ++ST.running, body = page.querySelector('[data-dr-body]');
        body.innerHTML = UI().spinner ? UI().spinner(T('Je lis la question…')) : `<p class="muted">${esc(T('Je lis la question…'))}</p>`;
        try { const r = await dataAsk(q); if (my !== ST.running) return; ST.u = r.u; ST.res = r; }
        catch (e) { if (my !== ST.running) return; body.innerHTML = `<p class="dr-err">${esc(e.message || String(e))}</p>`; return; }
        if (page.isConnected) paintAnswer(page);
    }
    async function rerun(page) {
        const my = ++ST.running, u = ST.u; ST.sel = new Set();
        const res = page.querySelector('[data-dr-rows]'); if (res) res.innerHTML = UI().spinner ? UI().spinner(T('On cherche…')) : '…';
        try { if (u._reresolve) { u._reresolve = false; await resolve(u); } const r = await dataAsk(ST.q, u); if (my !== ST.running) return; ST.res = r; }
        catch (e) { toast(e.message, 'error'); }
        if (page.isConnected) paintAnswer(page);
    }

    /* ─── la réponse : J'ai compris (pastilles), je n'ai pas compris, les lignes ─── */
    const yearsTxt = y => (!y ? '' : y[0] === y[1] ? String(y[0]) : `${y[0]} → ${y[1]}`);
    function pillsHtml(u) {
        const th = themeById(u.themes?.[0]?.id), d = u.d, chg = u.chg || {};
        const pill = (k, lab, val, {auto = false} = {}) => `<button type="button" class="dr-pill${auto ? ' is-auto' : ''}${chg[k] ? ' is-chg' : ''}${ST.open === k ? ' is-open' : ''}" data-dr-pill="${k}" aria-expanded="${ST.open === k}" aria-controls="dr-pop"><em>${esc(T(lab))}</em> <span>${esc(val)}</span></button>`;
        const out = [];
        out.push(pill('what', 'Quoi', th ? `${th.icon} ${T(th.label)}${d ? ` › ${d.merged ? '🔀 ' : ''}${T(d.label)}` : ''}` : T('— à choisir')));
        if (u.who || u.person) out.push(pill('who', 'Qui', u.person ? `👤 ${u.person.name}${u.person.birthY ? `, ${T('né en {y}', {y: String(u.person.birthY)})}` : ''}${u.person.birthPlace ? ` ${T('à {p}', {p: u.person.birthPlace})}` : ''}` : `👤 ${u.who?.name || ''} ?`));
        out.push(pill('when', 'Quand', u.age && u.years ? `${T('à {a} ans', {a: u.age[0] === u.age[1] ? u.age[0] : `${u.age[0]}–${u.age[1]}`})} → ${yearsTxt(u.years)}` : u.life && u.years ? `${T('sa vie')} · ${yearsTxt(u.years)}` : u.years ? yearsTxt(u.years) : T('toutes les années'), {auto: !!(u.age || u.life) && !chg.when}));
        const where = u.where === 'family' ? `📍 ${T('les lieux de la famille')}` : u.where === 'place' ? `📍 ${u.center.title}${u.place?.auto ? ` (${T('là où il vivait')})` : ''}` : `📍 ${T('partout')}`;
        out.push(`<span class="dr-where">${pill('where', 'Où', where, {auto: !!u.place?.auto && !chg.where})}${u.where !== 'all' ? `<span class="dr-rad" role="group" aria-label="${esc(T('Rayon'))}"><button type="button" data-dr-km="-1" aria-label="${esc(T('moins loin'))}">−</button><input type="number" min="1" max="2000" step="1" inputmode="numeric" data-dr-kmin value="${esc(u.km)}" aria-label="${esc(T('Rayon en km'))}"><span>km</span><button type="button" data-dr-km="1" aria-label="${esc(T('plus loin'))}">+</button></span>` : ''}</span>`);
        return out.join('');
    }
    function popHtml(u) {
        const k = ST.open; if (!k) return '';
        const ok = `<div class="dr-pop-act"><button type="submit" class="button small">${esc(T('Changer'))}</button><button type="button" class="button small secondary" data-dr-pop-x>${esc(T('Annuler'))}</button></div>`;
        if (k === 'what') {
            const tl = (TH()?.themeList?.() || []).filter(t => t.id !== 'aranger'), cur = u.themes?.[0]?.id || '', ls = listsOfTheme(cur);
            return `<form class="dr-pop" id="dr-pop" data-dr-popf="what"><b>${esc(T('Quoi'))}</b><label>${esc(T('Thème'))} <select data-dr-th>${tl.map(t => `<option value="${esc(t.id)}" ${t.id === cur ? 'selected' : ''}>${esc(t.icon)} ${esc(T(t.label))}</option>`).join('')}</select></label>
                <label>${esc(T('Liste'))} <select data-dr-list>${[...ls.filter(d => d.merged), ...ls.filter(d => !d.merged)].map(d => `<option value="${esc(d.id)}" ${u.d?.id === d.id ? 'selected' : ''}>${d.merged ? '🔀 ' : ''}${esc(T(d.label))}</option>`).join('')}</select></label>${ok}</form>`;
        }
        if (k === 'who') return `<form class="dr-pop" id="dr-pop" data-dr-popf="who"><b>${esc(T('Qui'))}</b><label>${esc(T('Une personne de l’arbre'))} <input type="text" data-dr-who value="${esc(u.person?.name || u.who?.name || '')}" placeholder="${esc(T('Prénom NOM'))}"></label><small class="muted">${esc(T('Vide : personne en particulier.'))}</small>${ok}</form>`;
        if (k === 'when') return `<form class="dr-pop" id="dr-pop" data-dr-popf="when"><b>${esc(T('Quand'))}</b>${u.person?.birth ? `<label>${esc(T('à l’âge de'))} <input type="number" min="0" max="120" data-dr-a1 value="${u.age?.[0] ?? ''}"> – <input type="number" min="0" max="120" data-dr-a2 value="${u.age?.[1] ?? ''}"> ${esc(T('ans'))}</label><label class="checkbox-line"><input type="checkbox" data-dr-life ${u.life && !u.age ? 'checked' : ''}> ${esc(T('pendant sa vie'))}</label>` : ''}
            <label>${esc(T('de'))} <input type="number" data-dr-y1 value="${u.years?.[0] ?? ''}"> ${esc(T('à'))} <input type="number" data-dr-y2 value="${u.years?.[1] ?? ''}"></label><small class="muted">${esc(T('Vide : toutes les années.'))}</small>${ok}</form>`;
        if (k === 'where') {
            const r = (v, lab, extra = '') => `<label class="dr-radio"><input type="radio" name="dr-w" value="${v}" ${u.where === v ? 'checked' : ''}> ${lab}${extra}</label>`;
            return `<form class="dr-pop" id="dr-pop" data-dr-popf="where"><b>${esc(T('Où'))}</b>${r('place', esc(T('Un lieu :')), ` <input type="text" data-dr-place value="${esc(u.center?.title || u.around?.name || u.place?.name || '')}" aria-label="${esc(T('Lieu'))}">`)}${r('family', esc(T('Tous les lieux de la famille ({n})', {n: nf(LF()?.placesCount?.() || 0)})))}${r('all', esc(T('Partout (pas de lieu)')))}
                <label>${esc(T('à'))} <input type="number" min="1" max="2000" data-dr-popkm value="${esc(u.km)}"> km</label>${ok}</form>`;
        }
        return '';
    }
    function rowView(d, r, u) {
        const fs = (d.fields || []).filter(f => f.type !== 'url' && !f.hidden);
        const first = fs[0], val = f => { const v = r[f.key]; return Array.isArray(v) ? v.join(' · ') : v; };
        const per = E().periodOf?.(d, r), y = Array.isArray(per) && per[0] != null ? Number(per[0]) : null;
        const dateF = fs.find(f => f.type === 'date' && r[f.key]), placeF = fs.find(f => f !== first && (f.type === 'place' || /^(place|commune|loc|lieu|ville|town)$/i.test(f.key)) && r[f.key]);
        const when = dateF ? (ext.listesReunies?.dateText ? ext.listesReunies.dateText(r[dateF.key], y) : String(r[dateF.key])) : y != null ? String(y) : '';
        const sub = [when, placeF ? String(val(placeF)) : '', r._km != null ? T('{n} km', {n: String(r._km).replace('.', ',')}) : ''].filter(Boolean).join(' · ');
        const more = fs.slice(1).filter(f => f !== dateF && f !== placeF && f.type !== 'year' && val(f) != null && val(f) !== '' && typeof val(f) !== 'object').slice(0, 2).map(f => `${T(f.label)} : ${String(val(f)).slice(0, 80)}`).join(' · ');
        let fam = '';
        const g = E().geoOf?.(d, r);
        if (u.person && y != null && u.person.birthY != null && y >= u.person.birthY && (u.person.deathY == null || y <= u.person.deathY)) fam = T('{p}, {a} ans', {p: u.person.name, a: y - u.person.birthY});
        else if (g && y != null && LF()?.presence) { const pr = LF().presence(g[0], g[1], y, Math.max(LF().km?.() || 15, u.where === 'family' ? u.km : 0)); fam = LF().text ? LF().text(pr) : ''; }
        const urls = (d.fields || []).filter(f => f.type === 'url' && r[f.key]);
        return {title: titleOf(d, r), sub, more, fam, urls};
    }
    /** « Quoi » : les deux menus (thème, liste) restent, cachés ; le choix commun LCNDA_EXT.dataListSelect pose la liste ET son thème */
    function whatPicker(body) {
        const f = body.querySelector('[data-dr-popf="what"]'), th = f?.querySelector('[data-dr-th]'), ls = f?.querySelector('[data-dr-list]'); if (!ls || !th || !ext.dataListSelect) return;
        const all = () => (TH()?.themeList?.() || []).filter(t => t.id !== 'aranger').flatMap(t => listsOfTheme(t.id));
        const sp = ext.dataListSelect(ls, {items: all, before: id => { const d = all().find(x => x.id === id); if (!d || !TH()?.themeOf) return; th.value = TH().themeOf(d); th.dispatchEvent(new Event('change', {bubbles: true})); }});
        if (!sp) return; th.closest('label').hidden = true;
        setTimeout(() => { try { (f.querySelector('[data-ldt-selchange]') || f.querySelector('[data-ld-ov-q]'))?.focus({preventScroll: true}); } catch (_) {} }, 0);
    }
    function paintAnswer(page) {
        const body = page.querySelector('[data-dr-body]'), u = ST.u, R = ST.res || {rows: []}; if (!body || !u) return;
        const d = u.d, ro = kiosk(), off = offline();
        const nope = [];
        if (u.familyOnly) nope.push(`<p>${esc(T('Cette question parle de la famille, pas des listes de données.'))}</p><p>${esc(T('Si tu voulais parler d’un ancêtre, pose-la dans 🔍 Recherche → « Poser une question en français ».'))}</p><p><button type="button" class="button small" data-dr-askfam>🔎 ${esc(T('La poser dans la Recherche'))}</button></p>`);
        (u.nope || []).forEach(n => { if (n.k === 'left') nope.push(`<p>${esc(T('« {w} » : je ne sais pas le chercher dans les listes.', {w: n.words.join(', ')}))}</p>`); else if (n.k === 'what' && !u.familyOnly) nope.push(`<p>${esc(T('Je n’ai pas compris quoi chercher : nomme une sorte de données (séismes, batailles, musées, crues, Tour de France…).'))}</p>`); });
        if (u.whoNote) nope.push(`<p>${esc(u.whoNote)}</p>`);
        if (u.whereNote) nope.push(`<p>${esc(u.whereNote)}</p>`);
        if (d && !d.geo && u.where !== 'all') nope.push(`<p>${esc(T('« {l} » n’a pas de positions : le lieu n’est pas utilisé.', {l: T(d.label)}))}</p>`);
        const sugg = !u.themes?.length || nope.length ? suggestions(u) : [];
        const und = u.familyOnly ? '' : `<div class="dr-und"><h4>${esc(T('Ce que j’ai compris'))} <small>${esc(T('touche une pastille pour la changer'))}</small></h4><div class="dr-pills" data-dr-pills>${pillsHtml(u)}</div>${u.whyWhen ? `<p class="dr-why">${esc(u.whyWhen)}</p>` : ''}${!u.kmTyped && u.where !== 'all' && !(u.chg || {}).km ? `<p class="dr-why">${esc(T('« près de » sans distance : {n} km pour ce thème (Réglages → 🧰 Listes de données) ; change-le avec − / + ou tape le nombre.', {n: u.km}))}</p>` : ''}${popHtml(u)}</div>`;
        const missing = R.missing ? `<div class="dr-miss"><p>${esc(T('La liste « {l} » n’est pas installée.', {l: T(d.label)}))}</p>${ro ? '' : `<button type="button" class="button small secondary" data-dr-open-list>⤓ ${esc(T('l’installer'))}</button>`}</div>` : '';
        const rows = R.rows || [], CH = ext.listesChoix;
        const list = d && !R.missing && !u.familyOnly ? (rows.length ? `<ul class="dr-rows" data-dr-rowlist>${rows.map((r, i) => { const v = rowView(d, r, u);
                return `<li class="dr-row${ST.sel.has(i) ? ' is-sel' : ''}" data-dr-row="${i}"><label class="dr-ck"><input type="checkbox" data-dr-ck="${i}" ${ST.sel.has(i) ? 'checked' : ''} aria-label="${esc(T('Choisir : {t}', {t: v.title}))}"></label>
                    <div class="dr-rt">${d.open ? `<button type="button" class="dr-rtitle" data-dr-openrow="${i}">${esc(v.title)}</button>` : `<b class="dr-rtitle">${esc(v.title)}</b>`}${v.sub ? `<small>${esc(v.sub)}</small>` : ''}${v.more ? `<small class="muted">${esc(v.more)}</small>` : ''}${v.fam ? `<span class="dr-who">👪 ${esc(v.fam)}</span>` : ''}</div>
                    <div class="dr-acts">${!off ? v.urls.map(f => `<a class="dr-ib" href="${esc(A().safeUrl ? A().safeUrl(r[f.key]) : r[f.key])}" target="_blank" rel="noopener noreferrer" title="${esc(T(f.label))}" aria-label="${esc(T('{l} (ouvre un site)', {l: T(f.label)}))}">↗</a>`).join('') : ''}<button type="button" class="dr-ib" data-dr-ins="${i}" ${ro ? `disabled title="${esc(T('Mode consultation : rien ne peut être écrit.'))}"` : `title="${esc(T('📎 Insérer (avec sa source)'))}"`} aria-label="${esc(T('Insérer'))}">📎</button><button type="button" class="dr-ib" data-dr-bk="${i}" ${ro ? `disabled title="${esc(T('Mode consultation : rien ne peut être écrit.'))}"` : `title="${esc(T('🧺 Mettre dans un panier'))}"`} aria-label="${esc(T('Panier'))}">🧺</button></div></li>`; }).join('')}</ul>`
                : `<div class="dr-none"><p><b>${esc(T('Rien trouvé'))}</b> — ${esc(u.where === 'place' ? T('aucune ligne de « {l} » à moins de {n} km de {p}{y}.', {l: T(d.label), n: u.km, p: u.center?.title || '', y: u.years ? ` (${yearsTxt(u.years)})` : ''}) : T('aucune ligne de « {l} » ne correspond.', {l: T(d.label)}))}</p>${u.where === 'place' ? `<button type="button" class="button small secondary" data-dr-widen>📍 ${esc(T('→ à {n} km', {n: stepKm(u.km, 1)}))}</button> <button type="button" class="button small secondary" data-dr-tofam>📍 ${esc(T('→ les lieux de la famille'))}</button>` : ''}</div>`) : '';
        const n = R.total || 0, unit = T(n > 1 ? '{n} lignes' : '{n} ligne', {n: nf(n)});
        const foot = d && !R.missing && !u.familyOnly ? `<div class="dr-foot2"><span>${esc(unit)}${u.where !== 'all' ? ` · ${esc(u.where === 'family' ? T('à moins de {n} km des lieux de la famille', {n: u.km}) : T('à moins de {n} km', {n: u.km}))}` : ''}${n > rows.length ? ` · ${esc(T('les {n} premières', {n: nf(rows.length)}))}` : ''}</span><span class="dr-foot-act">${rows.length && !ro ? `<button type="button" class="button small secondary" data-dr-bkall>🧺 ${esc(T('Les {n} au panier', {n: nf(rows.length)}))}</button>` : ''}<button type="button" class="button small" data-dr-open-list>${esc(T('Ouvrir la liste complète →'))}</button></span></div>` : '';
        const selBar = ST.sel.size ? `<div class="dr-selbar" role="region" aria-label="${esc(T('Lignes choisies'))}"><b>${esc(T('{n} choisies', {n: nf(ST.sel.size)}))}</b><button type="button" class="button small secondary" data-dr-selins ${ro ? 'disabled' : ''}>📎 ${esc(T('Insérer…'))}</button><button type="button" class="button small secondary" data-dr-selbk ${ro ? 'disabled' : ''}>🧺 ${esc(T('Mettre dans un panier…'))}</button><button type="button" class="button small secondary" data-dr-selx aria-label="${esc(T('Tout décocher'))}">✕</button></div>` : '';
        const lock = u.person?.living ? T('🔒 {p} est vivant : son nom, sa date de naissance et son lieu restent sur ton ordinateur. Une liste en ligne ne reçoit que le lieu, le rayon et les années, jamais un nom.', {p: u.person.name}) : T('🔒 Tout est calculé ici : rien ne part sur Internet.');
        body.innerHTML = `<div class="dr-ans"><p class="dr-backp"><button type="button" class="dr-link" data-dr-back>← ${esc(T('Récap'))}</button></p>${und}
            ${nope.length ? `<div class="dr-nope"><h4>${esc(T('Je n’ai pas compris'))}</h4>${nope.join('')}${sugg.length ? `<p class="dr-sugg"><span>${esc(T('Essaie'))}</span>${sugg.map(x => `<button type="button" class="dr-k" data-dr-exq="${esc(x)}">${esc(x)}</button>`).join('')}</p>` : ''}</div>` : ''}
            ${missing}<div data-dr-rows>${list}</div>${foot}${selBar}<p class="dr-lock">${esc(lock)}</p></div>`;
        bindAnswer(page);
        whatPicker(body); // 📋 « Quoi » : le choix commun des listes (recherche, thèmes, cartes), replié en une ligne
        try { ext.dataPlus?.answer?.(page, ST); } catch (e) { console.error(e); } // 💾 Garder cette question (app-donnees-plus.js)
        try { ext.nomsLieuxMonde?.answer?.(page, ST.q); } catch (e) { console.error(e); } // 🗺 « Presbourg » : un ancien nom de lieu → le lieu d'aujourd'hui (noms-lieux-monde.js)
    }
    function suggestions(u) {
        const F = LF()?.data?.(), pl = (F?.places || [])[0]?.name || 'Tulle', who = (F?.people || []).find(p => p.b);
        // des phrases que la lecture comprend (elle lit le français, comme « Poser une question en français »)
        const out = [`les séismes à moins de 50 km de ${pl}`, `les monuments historiques autour de ${pl}`];
        if (who) out.push(`les batailles près des lieux de la famille pendant la vie de ${who.n}`);
        if (u.place?.name || u.around?.name) out.unshift(`les musées autour de ${u.place?.name || u.around?.name}`);
        return out.slice(0, 3);
    }
    const ansApi = () => { const d = ST.u?.d, rows = ST.res?.rows || []; return {d, base: d, state: () => ST.res?.st || E().blank?.() || {}, rows: () => rows, total: () => ST.res?.total || 0, more: () => false,
        table2d: rs => { const fs = (d?.fields || []).filter(f => f.type !== 'url' && !f.hidden); return [fs.map(f => T(f.label)), ...rs.map(r => fs.map(f => { const v = r[f.key]; return Array.isArray(v) ? v.join(' · ') : v ?? ''; }))]; }}; };
    function bindAnswer(page) {
        const body = page.querySelector('[data-dr-body]'); if (body.__dr) return; body.__dr = true;
        body.addEventListener('click', async e => {
            const t = e.target, u = ST.u; let b; if (!u || ST.view !== 'answer') return;
            if ((b = t.closest('[data-dr-pill]'))) { ST.open = ST.open === b.dataset.drPill ? '' : b.dataset.drPill; paintAnswer(page); page.querySelector('#dr-pop input, #dr-pop select')?.focus(); return; }
            if (t.closest('[data-dr-pop-x]')) { ST.open = ''; paintAnswer(page); page.querySelector('[data-dr-pill]')?.focus(); return; }
            if ((b = t.closest('[data-dr-km]'))) { u.km = stepKm(Number(u.km) || 1, Number(b.dataset.drKm)); u.chg.km = true; u.chg.where = true; return rerun(page); }
            if (t.closest('[data-dr-widen]')) { u.km = stepKm(Number(u.km) || 1, 1); u.chg.km = true; return rerun(page); }
            if (t.closest('[data-dr-tofam]')) { u.family = true; u.where = 'family'; u.chg.where = true; return rerun(page); }
            if (t.closest('[data-dr-askfam]')) { ext.questionsPlus?.openQuestion ? ext.questionsPlus.openQuestion(ST.q) : (A().state.hQuestion = ST.q, A().state.researchKind = 'question', A().setModule('recherche')); return; }
            if (t.closest('[data-dr-open-list]')) return openFull();
            if ((b = t.closest('[data-dr-openrow]'))) { const r = ST.res.rows[Number(b.dataset.drOpenrow)]; try { u.d.open(r); } catch (x) { toast(x.message, 'error'); } return; }
            const one = async (kind, i, anchor) => { if (kiosk()) return toast(T('Mode consultation : rien ne peut être écrit.')); const r = ST.res.rows[i]; if (r) await ext.listesChoix?.act?.(kind, [r], anchor, ansApi()); };
            if ((b = t.closest('[data-dr-ins]'))) return one('insert', Number(b.dataset.drIns), b);
            if ((b = t.closest('[data-dr-bk]'))) return one('basket', Number(b.dataset.drBk), b);
            if ((b = t.closest('[data-dr-bkall]'))) { if (kiosk()) return; return ext.listesChoix?.act?.('basket', ST.res.rows, b, ansApi()); }
            const sel = () => [...ST.sel].sort((a, c) => a - c).map(i => ST.res.rows[i]).filter(Boolean);
            if ((b = t.closest('[data-dr-selins]'))) return ext.listesChoix?.act?.('insert', sel(), b, ansApi());
            if ((b = t.closest('[data-dr-selbk]'))) return ext.listesChoix?.act?.('basket', sel(), b, ansApi());
            if (t.closest('[data-dr-selx]')) { ST.sel.clear(); paintAnswer(page); return; }
        });
        body.addEventListener('change', e => {
            const t = e.target, u = ST.u; if (!u) return;
            if (t.matches('[data-dr-ck]')) { const i = Number(t.dataset.drCk); if (t.checked) ST.sel.add(i); else ST.sel.delete(i); paintAnswer(page); page.querySelector(`[data-dr-ck="${i}"]`)?.focus(); return; }
            if (t.matches('[data-dr-kmin]')) { const k = Math.round(Number(t.value)); if (!(k >= 1 && k <= 2000)) { toast(T('Écris une distance entre 1 et 2000 km.'), 'error'); t.value = u.km; return; } u.km = k; u.chg.km = true; return rerun(page); }
            if (t.matches('[data-dr-th]')) { const f = t.closest('form'), ls = listsOfTheme(t.value); const sel = f.querySelector('[data-dr-list]'); sel.innerHTML = [...ls.filter(d => d.merged), ...ls.filter(d => !d.merged)].map(d => `<option value="${esc(d.id)}">${d.merged ? '🔀 ' : ''}${esc(T(d.label))}</option>`).join(''); }
        });
        body.addEventListener('submit', e => {
            const f = e.target.closest('[data-dr-popf]'); if (!f) return; e.preventDefault();
            const u = ST.u, k = f.dataset.drPopf, num = sel => { const v = f.querySelector(sel)?.value; return v === '' || v == null ? null : Number(v); };
            if (k === 'what') { const th = f.querySelector('[data-dr-th]').value, id = f.querySelector('[data-dr-list]').value; u.themes = [{id: th, word: ''}]; u.d = (E().list?.() || []).find(d => d.id === id) || pickList(u); if (!u.chg.km && !u.kmTyped) u.km = radiusOf(th); }
            if (k === 'who') { const v = f.querySelector('[data-dr-who]').value.trim(); u.who = v ? {name: v} : null; u.person = null; if (!v) { u.age = null; u.life = false; } u._reresolve = true; if (u.place?.auto) u.place = null; }
            if (k === 'when') { const a1 = num('[data-dr-a1]'), a2 = num('[data-dr-a2]'), y1 = num('[data-dr-y1]'), y2 = num('[data-dr-y2]'), life = !!f.querySelector('[data-dr-life]')?.checked;
                u.age = null; u.life = false;
                if (a1 != null && u.person?.birth) { u.age = [a1, a2 ?? a1]; const sp = C().ageSpan(u.person.birth, u.age); if (sp) u.years = [sp.y1, sp.y2]; }
                else if (life && u.person?.birthY) { u.life = true; u.years = [u.person.birthY, u.person.deathY || u.person.birthY + 90]; }
                else u.years = y1 != null || y2 != null ? [y1 ?? y2, y2 ?? y1].sort((a, b) => a - b) : null;
                u.whyWhen = ''; }
            if (k === 'where') { const w = f.querySelector('[name="dr-w"]:checked')?.value || 'all', km = num('[data-dr-popkm]');
                if (km != null && km >= 1 && km <= 2000) { if (km !== u.km) u.chg.km = true; u.km = km; }
                u.family = w === 'family'; u.where = w;
                if (w === 'place') { const nm = f.querySelector('[data-dr-place]').value.trim(); if (!nm) { toast(T('Écris un lieu.'), 'error'); return; } u.around = {name: nm}; u.place = null; u._reresolve = true; }
                if (w !== 'place') { u.center = null; } }
            u.chg[k] = true; ST.open = '';
            rerun(page);
        });
    }
    function openFull() {
        const u = ST.u, d = u?.d; if (!d) return;
        const preset = {period: u.years ? {from: u.years[0], to: u.years[1], mode: 'overlap'} : null, near: u.where === 'place' && u.center ? {lat: u.center.lat, lon: u.center.lon, km: u.km, title: u.center.title} : null, sort: u.where === 'place' ? '_km' : '',
            crit: u.where === 'family' ? [{kind: 'xf', fid: 'famille', value: String(u.km), valueLabel: T('à {km} km', {km: u.km})}] : []};
        E().open?.(d.id, preset);
    }

    /* ═════════════ l'onglet 📊 Données (app.js : module « donnees ») ═════════════ */
    function render(token) { return mount(ws(), {door: 'onglet', token}); }
    /** demander (⌘K, un lien) : l'écran s'ouvre par la porte qui existe, la question posée */
    function ask(q) {
        ST.pending = String(q || '').trim(); ST.view = 'answer';
        const st = A().state; if (!st) return;
        if (!inListes()) { A().setModule?.(MOD); return; }
        if (st.module === MOD) { A().setModule?.(MOD); return; }
        st.listType = OVERVIEW; if (st.module === 'listes') { A().renderSidebar?.(); ext.lists?.[OVERVIEW]?.(++st.workspaceToken); } else A().setModule?.('listes');
    }

    /* ═════════════ ⌘K : « 📊 Demander aux données : « … » » (rien n'est calculé avant le choix) ═════════════ */
    function provider(q) {
        const text = String(q || '').trim(); if (text.length < 8 || !C()?.parseData) return [];
        let u; try { u = C().parseData(text, {themes: themesForParse()}); } catch (_) { return []; }
        if (!u.themes?.length) return [];
        const ques = ext.questionsPlus?.isQuestion?.(text) || u.around || u.family || u.years || u.km != null || u.who || /^(les?|la|l'|des|quel)/i.test(text);
        if (!ques) return [];
        return [{label: `📊 ${T('Demander aux données : « {q} »', {q: text.length > 80 ? text.slice(0, 77) + '…' : text})}`, hint: T('Listes de données · la réponse quand tu choisis cette ligne'), dataAsk: true, go: () => ask(text)}];
    }
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);

    /* ═════════════ Réglages → 🧰 Listes de données : où sont les données, les rayons ═════════════ */
    function settingsPanels(page) {
        if (!page || page.querySelector('[data-dr-set]')) return;
        const ro = kiosk(), cur = place(), R = radii();
        const radio = (v, label, sub) => `<label class="checkbox-line"><input type="radio" name="dr-place" value="${v}" ${cur === v ? 'checked' : ''} ${ro ? 'disabled' : ''}> <span>${esc(T(label))}${sub ? `<small class="muted"> — ${esc(T(sub))}</small>` : ''}</span></label>`;
        const tl = (TH()?.themes?.() || []).filter(t => t.id !== 'aranger');
        const box = document.createElement('div'); box.dataset.drSet = '';
        box.innerHTML = `<section class="maintenance-panel dr-set-place"><h3>📊 ${esc(T('Où sont les données'))}</h3>
                ${radio('listes', 'Dans Listes seulement', 'Listes → 🧰 Données (au départ)')}${radio('onglet', 'Dans l’onglet 📊 Données seulement', 'un onglet en haut ; Listes ne les montre plus')}${radio('deux', 'Aux deux endroits', 'le même écran, par deux portes')}
                <p class="muted"><small>${esc(T('Au moins un des deux reste toujours là. C’est le même écran dans les deux cas.'))}</small></p></section>
            <section class="maintenance-panel dr-set-rad"><h3>📍 ${esc(T('« Près de » sans distance : le rayon de chaque thème'))}</h3>
                <p class="muted"><small>${esc(T('Pour une question sans distance (« les musées autour de Brive »). Toujours modifiable dans la réponse : − / + ou le nombre tapé, ou écrit dans la question (« à 20 km de Tulle »).'))}</small></p>
                <div class="dr-rads">${tl.map(t => `<label class="dr-radrow"><span>${esc(t.icon)} ${esc(T(t.label))}</span><span><input type="number" min="1" max="2000" step="1" inputmode="numeric" data-dr-rad="${esc(t.id)}" value="${esc(radiusOf(t.id))}" ${ro ? 'disabled' : ''} aria-label="${esc(T('Rayon : {t}', {t: T(t.label)}))}"> km${Number(R[t.id]) > 0 && Number(R[t.id]) !== RADIUS[t.id] ? ` <small class="muted">(${esc(T('au départ : {n}', {n: RADIUS[t.id] || 30}))})</small>` : ''}</span></label>`).join('')}</div>
                ${Object.keys(R).length && !ro ? `<button type="button" class="button small secondary" data-dr-rad-reset>↺ ${esc(T('Les rayons de départ'))}</button>` : ''}</section>`;
        page.appendChild(box);
        const redraw = () => { if (A().state?.module === 'maintenance' && A().state.maintenanceTab === SETTINGS_TAB) ext.maintenance[SETTINGS_TAB]?.(); };
        box.addEventListener('change', e => {
            const t = e.target; if (ro) return;
            if (t.name === 'dr-place') { setPlace(t.value); return; }
            if (t.matches('[data-dr-rad]')) {
                const id = t.dataset.drRad, n = Math.round(Number(t.value)); if (!(n >= 1 && n <= 2000)) { toast(T('Écris une distance entre 1 et 2000 km.'), 'error'); t.value = radiusOf(id); return; }
                const before = readLS(K_RAD, null), next = {...radii(), [id]: n}; if (n === RADIUS[id]) delete next[id];
                writeLS(K_RAD, Object.keys(next).length ? JSON.stringify(next) : null); UI().markSaved?.(page);
                const th = themeById(id);
                if (A().undoToast) A().undoToast(T('« Près de » pour {t} : {n} km', {t: `${th?.icon || ''} ${T(th?.label || id)}`.trim(), n}), {undo: () => { writeLS(K_RAD, before); redraw(); }}); else toast(T('Réglage enregistré.'));
            }
        });
        box.querySelector('[data-dr-rad-reset]')?.addEventListener('click', () => { const before = readLS(K_RAD, null); writeLS(K_RAD, null); redraw(); if (A().undoToast) A().undoToast(T('Les rayons de départ sont revenus'), {undo: () => { writeLS(K_RAD, before); redraw(); }}); });
    }
    function wrapSettings() {
        ext.maintenance = ext.maintenance || {};
        const base = ext.maintenance[SETTINGS_TAB]; if (!base || base.__dr) return !!base;
        const w = token => { const r = base(token); settingsPanels(ws()?.querySelector('[data-ldt-settings-page]')); return r; };
        w.__dr = true; ext.maintenance[SETTINGS_TAB] = w; return true;
    }
    if (!wrapSettings()) document.addEventListener('DOMContentLoaded', () => { if (!wrapSettings()) setTimeout(wrapSettings, 500); });

    ext.dataHome = {mount, render, ask, setView, view: () => ST.view, place, setPlace, inListes, RADIUS, radiusOf, HL, highlights, resetHighlights: () => { hlMem = null; writeLS(K_CACHE, null); }, pickList, provider, themesForParse, titleOf, stats, resetStats: () => { statsP = null; }, newThemes, _st: ST};
    ext.dataAsk = q => dataAsk(q);
})();
