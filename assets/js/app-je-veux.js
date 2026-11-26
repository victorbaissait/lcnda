/* LCNDA — 🧭 Je veux… : dire ce qu'on veut faire, et l'app y emmène (maquette validée docs/design/je-veux.html, « Décisions »).
 *
 * Ce fichier est petit et chargé au démarrage : il branche les entrées, sans rien calculer. Le moteur (app-je-veux-moteur.js :
 * le registre des intentions, la lecture de la phrase, le classement) et les écrans (app-je-veux-ui.js) se chargent à la
 * première ouverture : le démarrage ne change pas.
 *
 * Les entrées, allumées au départ : ⌘K (« 🧭 Je veux… » est le premier mode, Tab passe à « 🔎 Trouver ») et
 * 🔍 Recherche → « 🧭 Je veux faire… » (le premier type de la colonne). Là, mais éteintes au départ : le bouton 🧭 de la barre
 * du haut (rangé avec les autres dans « Boutons en haut à droite »), le widget « 🧭 Que veux-tu faire ? » posé en haut du
 * tableau de bord, « 🧭 Ce qu'on fait souvent ici » dans les bulles « ? » des titres. Aussi : Listes → « 🧭 Tout ce que l'app
 * sait faire » (un tableau) ; Réglages → Navigation → « 🧭 Je veux… ».
 * Réglages : localStorage['genealogie-je-veux'] ; l'historique (récents, ⭐ Mes buts, souvent fait ici, 👣 déjà montré) :
 * localStorage['genealogie-je-veux-hist'], sur cet ordinateur seulement. Rien ne part sur Internet.
 *
 * API : LCNDA_EXT.jeVeux = {settings(), save(patch), reset(), DEF, load() → promesse de l'écran, open(phrase), hist(), saveHist(h),
 *       inResearch(), cmdkOn(), V} ; ext.jeVeuxUI (après load) ; ext.jeVeuxEngine, ext.intents (le registre).
 * Essais : tests/test-je-veux.js, tests/test-je-veux-couverture.js. */
(function () {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const V = '2'; // le ?v= des deux fichiers chargés à la demande
    const KEY = 'genealogie-je-veux', HKEY = 'genealogie-je-veux-hist';
    const DEF = {on: true, cmdk: true, recherche: true, top: false, widget: false, bubbles: false, show: 'first', n: 3, ia: false, hist: true, often: true};
    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    function settings() { const s = {...DEF, ...read(KEY, {})}; s.n = [1, 2, 3].includes(Number(s.n)) ? Number(s.n) : 3; if (!['never', 'first', 'always'].includes(s.show)) s.show = 'first'; return s; }
    function save(patch) { const s = {...settings(), ...patch}; const diff = Object.fromEntries(Object.entries(s).filter(([k, v]) => DEF[k] !== v)); if (Object.keys(diff).length) write(KEY, diff); else { try { localStorage.removeItem(KEY); } catch (_) {} } apply(); return s; }
    function reset() { try { localStorage.removeItem(KEY); } catch (_) {} apply(); }
    const hist = () => { const h = read(HKEY, {}); return {recent: Array.isArray(h.recent) ? h.recent.slice(0, 20) : [], fav: Array.isArray(h.fav) ? h.fav.slice(0, 40) : [], count: h.count && typeof h.count === 'object' ? h.count : {}, seen: h.seen && typeof h.seen === 'object' ? h.seen : {}}; };
    const saveHist = h => write(HKEY, h);
    const on = () => settings().on;
    const inResearch = () => on() && settings().recherche;
    const cmdkOn = () => on() && settings().cmdk;

    /* ═════ le chargement à la demande ═════ */
    let P = null;
    const script = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error(T('Impossible de charger {x}', {x: src}))); document.head.appendChild(s); });
    function load() {
        if (P) return P;
        P = (ext.jeVeuxEngine ? Promise.resolve() : script(`assets/js/app-je-veux-moteur.js?v=${V}`))
            .then(() => (ext.jeVeuxUI ? null : script(`assets/js/app-je-veux-ui.js?v=${V}`)))
            .then(() => ext.jeVeuxUI.init())
            .catch(e => { P = null; throw e; });
        return P;
    }
    /** 🔍 Recherche → 🧭 Je veux faire…, avec la phrase */
    async function open(q = '') {
        const st = A().state; if (!st) return;
        st.jeVeuxQ = String(q || ''); st.researchKind = 'je_veux';
        if (st.module === 'recherche') { A().renderSidebar?.(); return ext.researchJeVeux?.(++st.workspaceToken); }
        return A().setModule?.('recherche');
    }

    /* ═════ les branchements ═════ */
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.je_veux = token => load().then(ui => ui.settingsPage(token));
    ext.researchJeVeux = token => load().then(ui => ui.page(token)); // appelé par app-recherche.js (type « je_veux »)
    ext.lists = ext.lists || {};
    ext.lists.je_veux = token => load().then(ui => ui.listPage(token));
    const TAB = ['je_veux', '17b', '🧭 Je veux…'], LIST = ['je_veux', '00j', '🧭 Tout ce que l’app sait faire'], DW = 'je_veux_widget';
    function register() {
        const app = A(); if (!Array.isArray(app.defaultMaintenanceTabs)) return false;
        if (!app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) { const i = app.defaultMaintenanceTabs.findIndex(t => t[0] === 'raccourcis'); app.defaultMaintenanceTabs.splice(i < 0 ? app.defaultMaintenanceTabs.length : i + 1, 0, [...TAB]); }
        if (Array.isArray(app.defaultListTypes) && !app.defaultListTypes.some(t => t[0] === LIST[0])) app.defaultListTypes.push([...LIST]);
        if (Array.isArray(app.defaultDashboardBlocks) && !app.defaultDashboardBlocks.some(x => x[0] === DW)) { app.defaultDashboardBlocks.push([DW, '🧭 Que veux-tu faire ?']); if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans[DW] = '6'; if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[DW] = T('Écris ton but, l’app t’y emmène : la même case que Recherche → 🧭 Je veux faire…'); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    /* le widget (sans le moteur : une case, tes ⭐, tes récents) */
    const widgetHtml = () => {
        const h = hist(), chips = [...h.fav.slice(0, 3).map(f => [f.q || f.name, `⭐ ${f.icon || ''} ${f.name}`]), ...h.recent.slice(0, 2).map(r => [r.q, `🕘 ${r.q}`])];
        return `<form class="jv-wform" data-jv-wform role="search"><div class="jv-ask"><input name="q" type="search" placeholder="${esc(T('Imprimer un arbre, faire une sauvegarde…'))}" aria-label="${esc(T('Que veux-tu faire ?'))}" autocomplete="off"><button type="submit" class="button small">🧭 ${esc(T('Trouver'))}</button></div>
            ${chips.length ? `<div class="jv-chips">${chips.map(([q, l]) => `<button type="button" class="k" data-jv-wq="${esc(q)}">${esc(l)}</button>`).join('')}</div>` : `<p class="muted small">${esc(T('Écris ton but, l’app t’y emmène.'))}</p>`}</form>`;
    };
    ext.dashboard = ext.dashboard || {};
    ext.dashboard[DW] = {load: () => Promise.resolve(null), render: (index, widget, span) => A().card(index, `🧭 ${T('Que veux-tu faire ?')}`, '', widgetHtml(), span)};
    document.addEventListener('submit', e => { const f = e.target.closest?.('form[data-jv-wform]'); if (!f) return; e.preventDefault(); const q = f.elements.q.value.trim(); if (q) open(q); });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-jv-wq]'); if (b) { e.preventDefault(); open(b.dataset.jvWq); } });
    /* « Posé en haut du tableau de bord » (réglage, éteint au départ) : la carte du widget au-dessus des autres */
    let dashObs = null;
    function dashTop() {
        const ws = document.getElementById('workspace'), st = A().state;
        if (!ws || st?.module !== 'dashboard' || !on() || !settings().widget) { document.querySelectorAll('.jv-dash-top').forEach(x => x.remove()); return; }
        if (ws.querySelector('.jv-dash-top') || ws.querySelector('[data-block="' + DW + '"]')) return;
        const head = ws.querySelector('.page-header'); if (!head) return;
        const box = document.createElement('section'); box.className = 'jv-dash-top card';
        box.innerHTML = `<div class="card-head"><h3>🧭 ${esc(T('Que veux-tu faire ?'))}</h3></div><div class="card-body">${widgetHtml()}</div>`;
        head.after(box);
    }
    /* le bouton du haut (réglage, éteint au départ ; rangé dans « Boutons en haut à droite », app-apparence.js) */
    function topButton() {
        const meta = document.querySelector('.topbar .topbar-meta'); if (!meta) return false;
        let b = document.getElementById('jv-open');
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'jv-open'; b.className = 'screen-tool jv-topbtn';
            b.innerHTML = `<span aria-hidden="true">🧭</span><span class="jv-topbtn-t">${esc(T('Je veux…'))}</span>`;
            b.title = T('🧭 Je veux… : dis ce que tu veux faire, l’app t’y emmène'); b.setAttribute('aria-label', T('Je veux…'));
            b.addEventListener('click', () => open(''));
            meta.insertBefore(b, meta.querySelector(':scope > .status-dot') || null);
        }
        b.hidden = !(on() && settings().top);
        return true;
    }
    function apply() {
        topButton();
        const s = settings();
        if (on() && s.widget) { if (!dashObs) { const ws = document.getElementById('workspace'); if (ws) { dashObs = new MutationObserver(() => dashTop()); dashObs.observe(ws, {childList: true}); } } dashTop(); }
        else { dashObs?.disconnect(); dashObs = null; dashTop(); }
        ext.jeVeuxUI?.refresh?.();
    }
    const ready = () => { if (document.querySelector('.topbar .topbar-meta') && A().state) apply(); else setTimeout(ready, 400); };
    ready();

    /* ═════ ⌘K : « 🧭 Je veux… » d'abord, Tab → « 🔎 Trouver » ═════ */
    const QK = {mode: 'goal', dlg: null};
    function decorateQuickSearch(dlg) {
        if (!cmdkOn() || dlg.dataset.jv) return;
        dlg.dataset.jv = '1'; QK.mode = 'goal'; QK.dlg = dlg;
        const box = dlg.querySelector('.quick-search'), input = dlg.querySelector('input'); if (!box || !input) return;
        const bar = document.createElement('div'); bar.className = 'jv-qk-modes';
        bar.innerHTML = `<span class="segmented sm" role="group" aria-label="${esc(T('Mode de la recherche rapide'))}"><button type="button" data-jv-mode="goal" aria-pressed="true">🧭 ${esc(T('Je veux…'))}</button><button type="button" data-jv-mode="find" aria-pressed="false">🔎 ${esc(T('Trouver'))}</button></span><small class="muted">${esc(T('Tab pour changer'))}</small>`;
        box.insertBefore(bar, input);
        const und = document.createElement('div'); und.className = 'jv-qk-und'; und.hidden = true; und.setAttribute('aria-live', 'polite');
        input.after(und);
        const foot = box.querySelector(':scope > small');
        const setMode = m => {
            QK.mode = m; bar.querySelectorAll('[data-jv-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.jvMode === m)));
            input.placeholder = m === 'goal' ? T('Ce que tu veux faire : « imprimer un arbre pour mamie », « fusionner deux lieux »…') : T('Une personne, une battue, une enquête, un lieu, un graphique, un écran…');
            if (foot) foot.textContent = m === 'goal' ? T('↑ ↓ pour choisir · Entrée : ▶ m’y emmener · ⇧ + Entrée : 👣 montre-moi · Tab : changer de mode · Échap pour fermer') : T('↑ ↓ pour choisir · Entrée pour ouvrir · ⇧ + Entrée pour ouvrir à côté · Tab : changer de mode · Échap pour fermer');
            if (m !== 'goal') und.hidden = true;
            input.dispatchEvent(new Event('input', {bubbles: true}));
        };
        setMode('goal');
        bar.addEventListener('click', e => { const b = e.target.closest('[data-jv-mode]'); if (b) { setMode(b.dataset.jvMode); input.focus(); } });
        input.addEventListener('keydown', e => {
            if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); setMode(QK.mode === 'goal' ? 'find' : 'goal'); return; }
            if (e.key === 'Enter' && e.shiftKey && QK.mode === 'goal') { const li = dlg.querySelector('li.is-active[data-jv-id]'); if (li) { e.preventDefault(); e.stopImmediatePropagation(); dlg.remove(); ext.jeVeuxUI?.showById(li.dataset.jvId); } }
        }, true);
        dlg.addEventListener('click', e => {
            const s = e.target.closest('[data-jv-show]'); if (s) { e.preventDefault(); e.stopPropagation(); dlg.remove(); ext.jeVeuxUI?.showById(s.dataset.jvShow); return; }
            if (ext.jeVeuxUI?.cmdkClick?.(e, dlg, input)) { e.preventDefault(); e.stopPropagation(); }
        }, true);
        new MutationObserver(() => ext.jeVeuxUI?.cmdkDecorate?.(dlg)).observe(dlg.querySelector('ul'), {childList: true});
    }
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.id === 'quick-search') decorateQuickSearch(n); }).observe(document.body || document.documentElement, {childList: true});
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    ext.quickSearchProviders.unshift(q => {
        const dlg = document.getElementById('quick-search');
        if (!cmdkOn() || !dlg?.dataset.jv || QK.mode !== 'goal') return [];
        return load().then(ui => ui.cmdkRows(q, dlg)).catch(() => []);
    });

    /* ═════ « ? » : « 🧭 Ce qu'on fait souvent ici » (réglage, éteint au départ) ═════ */
    ext.helpBubbleMore = (bub, btn) => {
        if (!on() || !settings().bubbles || btn.closest('dialog')) return;
        load().then(ui => ui.bubbleMore(bub)).catch(() => {});
    };

    ext.jeVeux = {settings, save, reset, DEF, load, open, hist, saveHist, inResearch, cmdkOn, apply, KEY, HKEY, V, widgetHtml};
})();
