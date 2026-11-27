/* LCNDA — ⚖️ Dossiers de succession : rangement, filtre de toute l'app, rattachement, tableau de bord, widget, vue par dossier
 * (maquette validée : docs/design/successoral-dossiers.html, écrans 1 à 7 ; serveur : lib/successoral_dossiers.php ;
 *  calcul de l'avancement et de l'ordre des dossiers : heritage-successoral-core.js, testé dans tests/test-successoral-dossiers.js).
 *  1. Où ranger les dossiers : au premier « ＋ Ouvrir un dossier », puis Réglages → Apparence → 🧭 Usage de l'app → carte ⚖️ ;
 *     ⇄ Déplacer un dossier ; « 🌳 Mes généalogies » (#genealogy-switch) ; vue d'ensemble lue dans chaque base (résumé seulement).
 *  2. Le bouton ⚖️ en haut à droite (usage successoral seulement ; Réglages → Apparence → Boutons en haut à droite) :
 *     tout / un / plusieurs dossiers, bandeau jaune avec ✕ ; Personnes, recherche, listes et carte ne lisent que les fiches
 *     rattachées ; l'arbre grise (ou cache) les autres ; une fiche créée pendant le filtre est rattachée d'office.
 *  3. Fiche ⋯ → « ⚖️ Dossiers… », onglet « 🧑‍🤝‍🧑 Personnes » du dossier, badge « ⚖️ N dossiers » sur la fiche.
 *  4. ⚖️ Successions → « Dossiers » : le tableau de bord (colonnes, filtres, cases, « Ne montrer que ceux-ci »).
 *  5. Garde-fous : fusion de fiches de dossiers différents, homonymes, 🗄 archiver dans un fichier et retirer, ⤒ réimporter.
 *  6. Widget « ⚖️ Mes dossiers de succession » (clé succ_widget), 3 tailles, réglages, % d'avancement pondéré.
 *  7. 👤 Personnes → colonne de gauche → « Vue actuelle | ⚖️ Par dossier ».
 *  8. 🔎 Introuvable / 🔇 Ne répond pas (succ_case_persons.contact_state, migration 92) : sur le badge de la fiche
 *     (« ⚖️ 2026-014 · 🔇 ne répond pas ») et dans fiche ⋯ → « ⚖️ Dossiers… » ; réglage « Les fiches confidentielles comptent-elles
 *     comme héritiers ? » (successoral.json, private_heirs).
 * Rien en mode consultation ni en mode simple ; aucune donnée de dossier dans les exports.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP, S = () => window.LCNDA_SUCC_CORE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['dashboard', 'dashboardConfig']) ext[k] = ext[k] || {};
    for (const k of ['personMoreItems', 'afterPerson', 'designPanels', 'afterDesign']) ext[k] = ext[k] || [];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const plural = (n, w, many) => (A()?.plural ? A().plural(n, w, many) : `${n} ${w}`);
    const get = (op, q = {}) => A().api('successoral', {op, ...q});
    const post = async body => { const r = await A().api('successoral_write', {}, {method: 'POST', body}); return r.result || r; };
    const toast = (...a) => A().toast(...a);
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const simple = () => document.documentElement.classList.contains('ms-open');
    const hidden = () => kiosk() || simple();
    const store = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const sess = {get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (_) { return null; } }, set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const usageOn = () => { const c = store.get('genealogie-usage', null); return Array.isArray(c?.usages) && c.usages.includes('successoral'); };
    const active = () => usageOn() && !hidden();
    const fmtDate = iso => { if (!iso) return ''; const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(iso); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); try { return window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(d, {day: 'numeric', month: 'short'}) : d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}); } catch (_) { return iso; } };
    const daysTo = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null; const a = Date.UTC(+m[1], +m[2] - 1, +m[3]), t = new Date(); return Math.round((a - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); };
    const num = n => (window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(n) : Number(n).toLocaleString('fr-FR'));
    const badge = (t, k = 'grey') => (UI()?.badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const STATES = {ouvert: ['Ouvert', 'grey'], recherche: ['En recherche', 'blue'], trouves: ['Héritiers trouvés', 'green'], remis: ['Remis au notaire', 'violet'], clos: ['Clos', 'grey'], archive: ['Archivé', 'grey']};
    const stateLabel = s => i18n((STATES[s] || [s])[0]);
    const stateKind = s => (STATES[s] || [0, 'grey'])[1];
    const ROLES = [['deceased', 'défunt'], ['heir', 'héritier'], ['inter', 'intermédiaire'], ['witness', 'témoin'], ['verify', 'à vérifier']];
    const roleLabel = r => i18n((ROLES.find(x => x[0] === r) || [0, r])[1]);
    const HOW = {open: 'à l’ouverture', calc: 'calcul', hand: 'à la main', filter: 'créée pendant le filtre', import: 'réimport', homonym: 'homonyme', move: 'déplacée'};
    const gidOf = () => (typeof window.LCNDA_GENEALOGY === 'string' && window.LCNDA_GENEALOGY !== 'main' ? window.LCNDA_GENEALOGY : '');
    const lastName = n => { const m = String(n || '').match(/([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’ -]+)$/u); return m ? m[1].trim() : String(n || ''); };
    /** « 3 dossiers » (en français) ; ailleurs « 3 dossiers de succession » (le mot « dossier » seul y est un classeur) */
    const nDossiers = n => (!window.LCNDA_I18N || window.LCNDA_I18N.lang === 'fr' ? plural(n, 'dossier') : plural(n, 'dossier de succession'));
    const caseShort = c => `${c.number}${c.deceased ? ' ' + lastName(c.deceased) : ''}`;

    /* ═════ Données : réglages, vue d'ensemble (gardée 1 minute), rattachements ═════ */
    let SET = null, IDX = {at: 0, data: null, busy: null}, MEM = {at: 0, data: null, busy: null};
    async function settings(force = false) {
        if (SET && !force) return SET;
        try { SET = await get('settings'); } catch (_) { SET = SET || {settings: {store: '', apart_id: '', outside: 'grey', archive_addresses: 'remove', refuse_done: true, weights: [10, 15, 20, 10, 15, 20, 10], move_shared: 'copy', nodossier: 'fold', private_heirs: true}, genealogies: [], current: gidOf()}; }
        return SET;
    }
    const cfg = () => SET?.settings || {outside: 'grey', weights: S()?.WEIGHTS || [10, 15, 20, 10, 15, 20, 10], refuse_done: true, nodossier: 'fold', archive_addresses: 'remove', move_shared: 'copy', store: '', private_heirs: true};
    /** 🔎 / 🔇 : l'état de contact (badge de la fiche, fenêtre « ⚖️ Dossiers… ») */
    const CONTACT = {introuvable: ['🔎', 'Introuvable', 'introuvable'], silence: ['🔇', 'Ne répond pas', 'ne répond pas']};
    const contactShort = st => (CONTACT[st] ? `${CONTACT[st][0]} ${i18n(CONTACT[st][2])}` : '');
    async function index(force = false) {
        if (!force && IDX.data && Date.now() - IDX.at < 60000) return IDX.data;
        if (IDX.busy) return IDX.busy;
        IDX.busy = get('index').then(d => { IDX = {at: Date.now(), data: d, busy: null}; if (d.settings && SET) SET.settings = d.settings; return d; }).catch(e => { IDX.busy = null; throw e; });
        return IDX.busy;
    }
    const localCases = () => (IDX.data?.bases || []).find(b => b.active)?.cases || [];
    async function membership(force = false) {
        if (!force && MEM.data && Date.now() - MEM.at < 30000) return MEM.data;
        if (MEM.busy) return MEM.busy;
        MEM.busy = get('membership').then(d => { MEM = {at: Date.now(), data: d.members || {}, busy: null}; return MEM.data; }).catch(() => { MEM.busy = null; return MEM.data || {}; });
        return MEM.busy;
    }
    const invalidate = () => { IDX.at = 0; MEM.at = 0; };
    window.addEventListener('lcnda:data-changed', e => { const a = e.detail?.action || ''; if (a === 'successoral_write' || /person|relation|merge|import/.test(a)) { MEM.at = 0; if (a === 'successoral_write') IDX.at = 0; } });

    /* ═════ 2. Le filtre ⚖️ (gardé par généalogie : « genealogie-succ-filter ») ═════ */
    const FKEY = 'genealogie-succ-filter';
    let FPEOPLE = {key: '', set: null};
    const filterIds = () => { if (!active()) return []; const v = store.get(FKEY, null); return Array.isArray(v?.ids) ? v.ids.map(Number).filter(n => n > 0).slice(0, 50) : []; };
    const NOFILTER = ['dashboard', 'maintenance', 'suivi'];
    ext.succFilter = {
        ids: filterIds,
        /** le paramètre « succ_cases » des lectures (Personnes, recherche, listes, carte, arbre) ; jamais pour le Tableau de bord et les Réglages */
        param: () => { const ids = filterIds(); if (!ids.length) return ''; const m = A()?.state?.module; return NOFILTER.includes(m) ? '' : ids.join(','); },
        /** l'en-tête des écritures : une fiche créée est rattachée d'office */
        header: () => filterIds().join(','),
        people: () => FPEOPLE.set,
    };
    async function filterPeople() {
        const ids = filterIds(), key = ids.join(',');
        if (!key) { FPEOPLE = {key: '', set: null}; return null; }
        if (FPEOPLE.key === key && FPEOPLE.set) return FPEOPLE.set;
        try { const r = await get('filter_ids', {cases: key}); FPEOPLE = {key, set: new Set((r.ids || []).map(Number))}; } catch (_) { FPEOPLE = {key, set: new Set()}; }
        return FPEOPLE.set;
    }
    let lastAuto = -1;
    async function setFilter(ids, {reload = true} = {}) {
        ids = [...new Set((ids || []).map(Number).filter(n => n > 0))];
        store.set(FKEY, {ids});
        FPEOPLE = {key: '', set: null};
        if (ids.length) { try { lastAuto = (await get('auto_recent', {after: 2147483647})).last || 0; } catch (_) { lastAuto = 0; } await filterPeople(); }
        await paintButton();
        paintBanner();
        if (reload) reloadModule();
    }
    function reloadModule() {
        const st = A()?.state; if (!st) return;
        if (st.module === 'personnes') { A().renderSidebar?.(); A().loadPeopleAndPerson ? A().loadPeopleAndPerson() : A().setModule('personnes'); }
        else if (!NOFILTER.includes(st.module)) A().setModule(st.module);
    }
    const filterLabel = async () => {
        const ids = filterIds(); if (!ids.length) return '⚖️';
        await index().catch(() => null);
        if (ids.length === 1) { const c = localCases().find(x => x.id === ids[0]); return '⚖️ ' + (c ? c.number : ''); }
        return '⚖️ ' + nDossiers(ids.length);
    };

    /* ── le bouton ⚖️, son menu, le bandeau ── */
    const btn = () => document.getElementById('succ-filter-open');
    async function paintButton() {
        const b = btn(); if (!b) return;
        const on = active();
        b.hidden = !on;
        if (!on) { b.classList.remove('is-on'); return; }
        const lab = await filterLabel();
        const t = b.querySelector('[data-succ-flabel]');
        if (t) { t.textContent = lab === '⚖️' ? '' : lab.replace(/^⚖️ /, ''); t.hidden = lab === '⚖️'; }
        b.classList.toggle('is-on', filterIds().length > 0);
        const title = filterIds().length ? i18n('Dossiers de succession : filtre {what} (cliquer pour changer)', {what: lab}) : i18n('Dossiers de succession : ne montrer qu’un ou plusieurs dossiers');
        b.title = title; b.setAttribute('aria-label', title);
    }
    let menuEl = null;
    const closeMenu = () => { menuEl?.remove(); menuEl = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escMenu, true); };
    const outside = e => { if (menuEl && !menuEl.contains(e.target) && !btn()?.contains(e.target)) closeMenu(); };
    const escMenu = e => { if (e.key === 'Escape' && menuEl) { e.preventDefault(); closeMenu(); btn()?.focus(); } };
    async function openMenu(anchor = btn()) {
        if (menuEl) return closeMenu();
        if (!active()) return;
        let d; try { d = await index(); } catch (e) { return toast(e.message, 'error'); }
        const ids = filterIds();
        const here = (d.bases || []).find(b => b.active)?.cases.filter(c => c.state !== 'archive') || [];
        const away = (d.bases || []).filter(b => !b.active).flatMap(b => b.cases.map(c => ({...c, base: b}))).filter(c => c.state !== 'archive');
        const one = ids.length === 1 ? ids[0] : 0;
        const m = document.createElement('div'); m.className = 'succ-fmenu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', i18n('Dossiers de succession'));
        m.innerHTML = `<button type="button" class="succ-fm-all${ids.length ? '' : ' is-on'}" data-sf-all>👁 ${esc(i18n('Tout montrer'))}</button>
            ${here.length ? `<b class="succ-fm-h">${esc(i18n('Un dossier'))}</b>${here.map(c => `<label class="succ-fm-row"><input type="radio" name="succ-fm-one" value="${c.id}" data-sf-one${one === c.id ? ' checked' : ''}> <span>${esc(caseShort(c))}</span> ${badge(stateLabel(c.state), stateKind(c.state))}</label>`).join('')}
            <b class="succ-fm-h">${esc(i18n('Plusieurs'))}</b>${here.map(c => `<label class="succ-fm-row"><input type="checkbox" value="${c.id}" data-sf-many${ids.includes(c.id) && ids.length > 1 ? ' checked' : ''}> <span>${esc(caseShort(c))}</span></label>`).join('')}
            <button type="button" class="button small" data-sf-apply>${esc(i18n('⚖️ Ne montrer que ceux-ci'))}</button>` : `${window.LCNDA_APP.empty(i18n('Aucun dossier dans cette généalogie.'))}`}
            ${away.length ? `<b class="succ-fm-h">${esc(i18n('Dans une autre généalogie'))}</b>${away.map(c => `<button type="button" class="succ-fm-away" data-sf-away="${esc(c.base.id)}:${c.id}">↗ ${esc(caseShort(c))} <small class="muted">${esc(c.base.name)}</small></button>`).join('')}` : ''}
            <button type="button" class="succ-fm-board" data-sf-board>⚖️ ${esc(i18n('Tous les dossiers…'))} <small class="muted">${esc(i18n('tableau de bord'))}</small></button>`;
        document.body.appendChild(m); menuEl = m;
        const r = (anchor || document.body).getBoundingClientRect();
        m.style.top = `${Math.round(r.bottom + 6)}px`;
        m.style.left = `${Math.round(Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)))}px`;
        setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escMenu, true); });
        m.querySelector('input, button')?.focus();
        m.addEventListener('change', e => { if (e.target.matches('[data-sf-one]')) { closeMenu(); setFilter([Number(e.target.value)]); } });
        m.addEventListener('click', e => {
            const t = e.target.closest('button'); if (!t) return;
            if (t.matches('[data-sf-all]')) { closeMenu(); setFilter([]); }
            else if (t.matches('[data-sf-apply]')) { const v = [...m.querySelectorAll('[data-sf-many]:checked')].map(i => Number(i.value)); closeMenu(); setFilter(v); }
            else if (t.matches('[data-sf-board]')) { closeMenu(); openBoard(); }
            else if (t.matches('[data-sf-away]')) { const [g, id] = t.dataset.sfAway.split(':'); closeMenu(); const c = away.find(x => x.base.id === g && x.id === Number(id)); openElsewhere(g, c, 'filter'); }
        });
    }
    function openBoard() { const st = A().state; store.set('genealogie-succ-view', 'cases'); if (ext.successoral?.openCase) { ext.successoral.openCase(0); } else { st.listType = 'successoral'; A().setModule('listes'); } }
    async function paintBanner() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const ids = filterIds(), m = A()?.state?.module;
        if (!ids.length || NOFILTER.includes(m) || !active()) { ws.querySelector(':scope > .succ-fbanner')?.remove(); return; }
        await index().catch(() => null);
        const cs = ids.map(id => localCases().find(c => c.id === id)).filter(Boolean);
        const set = await filterPeople();
        const total = Number(A()?.state?.bootstrap?.stats?.personnes) || 0;
        const what = cs.length === 1 ? i18n('Seulement le dossier {n}', {n: caseShort(cs[0])}) : i18n('Seulement {what} : {list}', {what: nDossiers(cs.length), list: cs.map(c => c.number).join(', ')});
        const html = `<span aria-hidden="true">⚖️</span> <span class="succ-fb-t"><b>${esc(what)}</b> : ${esc(i18n('{n} sur {total}', {n: plural(set ? set.size : 0, 'fiche'), total: num(total)}))}.</span>
            <button type="button" class="link-button" data-sf-change>${esc(i18n('Changer…'))}</button><button type="button" class="icon-button small succ-fb-x" data-sf-clear title="${esc(i18n('Tout montrer'))}" aria-label="${esc(i18n('Tout montrer'))}">✕</button>`;
        // posé seulement une fois écrit (pas de bandeau vide le temps des lectures), et si le filtre n'a pas changé entre-temps
        if (filterIds().join(',') !== ids.join(',') || NOFILTER.includes(A()?.state?.module) || !active()) return;
        let bn = ws.querySelector(':scope > .succ-fbanner');
        if (!bn) { bn = document.createElement('div'); bn.className = 'succ-fbanner'; bn.setAttribute('role', 'status'); ws.prepend(bn); }
        if (bn.innerHTML !== html) bn.innerHTML = html;
    }
    // le bandeau revient après chaque écran redessiné ; l'arbre grise ou cache les fiches hors du dossier
    const watchWs = () => {
        const ws = document.getElementById('workspace'); if (!ws || ws.dataset.succWatch) return; ws.dataset.succWatch = '1';
        let t = 0;
        let lastKey = null;
        new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { const key = filterIds().join(','); if (key !== lastKey) { lastKey = key; paintButton(); } if (key) { if (!ws.querySelector(':scope > .succ-fbanner')) paintBanner(); maskTree(); } else ws.querySelector(':scope > .succ-fbanner')?.remove(); }, 30); }).observe(ws, {childList: true, subtree: true});
    };
    async function maskTree() {
        const set = await filterPeople(); if (!set) return;
        const mode = cfg().outside === 'hide' ? 'succ-hide' : 'succ-out';
        document.querySelectorAll('#workspace [data-tree-person]').forEach(el => { const out = !set.has(Number(el.dataset.treePerson)); el.classList.toggle(mode, out); el.classList.toggle(mode === 'succ-out' ? 'succ-hide' : 'succ-out', false); });
    }
    document.addEventListener('click', e => {
        const t = e.target; if (!t.closest) return;
        if (t.closest('#succ-filter-open')) { e.preventDefault(); openMenu(); return; }
        if (t.closest('[data-sf-clear]')) { e.preventDefault(); setFilter([]); return; }
        if (t.closest('[data-sf-change]')) { e.preventDefault(); openMenu(btn()?.offsetParent ? btn() : t.closest('[data-sf-change]')); }
    });

    /* ── 2b. un dossier rangé dans une autre généalogie : proposer de l'ouvrir ── */
    async function switchTo(g, pending) {
        sess.set('lcnda-succ-pending', pending);
        if (ext.switchGenealogy) return ext.switchGenealogy(g);
        try {
            await window.LCNDA_SETTINGS_DETACH?.();
            await A().api('genealogy_switch', {}, {method: 'POST', body: {id: g}});
            ['genealogie-last-route', 'genealogie-baissait-ui-v2'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
            location.href = location.pathname;
        } catch (e) { toast(e.message, 'error'); setTimeout(() => location.reload(), 1500); }
    }
    /** 1c. 🌳 Mes généalogies : l'icône ⚖️ et « N dossiers en cours » pour une généalogie qui a des dossiers */
    ext.succGenealogyMarks = async list => {
        if (!active()) return;
        const d = await index(true).catch(() => null); if (!d) return;
        for (const g of list || []) {
            const b = (d.bases || []).find(x => x.id === String(g.id ?? '')); if (!b || !b.cases.length) continue;
            const open = b.cases.filter(c => !['clos', 'archive', 'remis'].includes(c.state)).length;
            g.succ = open ? plural(open, 'dossier en cours') : b.cases.length === 1 ? i18n('1 dossier · {state}', {state: stateLabel(b.cases[0].state).toLocaleLowerCase('fr')}) : plural(b.cases.length, 'dossier de succession');
        }
    };
    function openElsewhere(g, c, what = 'open') {
        const base = (IDX.data?.bases || []).find(b => b.id === g);
        const n = c ? caseShort(c) : '';
        return ext.openDialog({eyebrow: i18n('⚖️ Dossier {n}', {n}), title: i18n('Ce dossier est dans une autre généalogie'), submitLabel: i18n('Ouvrir « {name} »', {name: base?.name || g}),
            body: `<p>${esc(i18n('Il est rangé dans « {name} ». Pour le montrer, l’app ouvre cette généalogie (tes réglages d’ici sont gardés) et y active le filtre ⚖️ {n}.', {name: base?.name || g, n: c?.number || ''}))}</p>`,
            onSubmit: () => { switchTo(g, {action: what === 'move' ? 'move' : 'open', case_id: c?.id || 0, filter: what !== 'move'}); }});
    }
    /** à l'ouverture de l'app : ce qui a été demandé avant de changer de généalogie */
    async function runPending() {
        const p = sess.get('lcnda-succ-pending'); if (!p) return;
        sess.set('lcnda-succ-pending', null);
        if (!A()?.state?.bootstrap) return;
        if (!usageOn()) { const u = store.get('genealogie-usage', {}) || {}; store.set('genealogie-usage', {...u, usages: [...new Set([...(u.usages || ['genealogie']), 'successoral'])]}); }
        await settings(true);
        if (p.action === 'new') { await A().setModule('successoral'); setTimeout(() => newCaseHere(), 300); return; }
        if (p.action === 'open' && p.case_id) { if (p.filter) await setFilter([p.case_id], {reload: false}); ext.successoral?.openCase?.(p.case_id); return; }
        if (p.action === 'move' && p.case_id) { await A().setModule('maintenance'); setTimeout(() => moveDialog({id: p.case_id}), 400); }
    }

    /* ═════ 1. Où ranger les dossiers ═════ */
    const STORE = [['here', 'Dans cette généalogie', 'Le défunt et ses héritiers sont des fiches de ta famille. Simple, mais tout se mélange.'],
        ['apart', 'Dans une généalogie à part pour tous mes dossiers', 'Une base professionnelle « ⚖️ Dossiers de succession », créée dans 🌳 Mes généalogies. Tes dossiers y sont tous ensemble ; ta famille reste à part.'],
        ['each', 'Une généalogie par dossier', 'Chaque dossier a sa propre base (« ⚖️ 2026-014 MAZAUD »). Le plus étanche ; à réserver aux grosses successions.']];
    const gname = id => (SET?.genealogies || []).find(g => g.id === id)?.name || id;
    /** « ＋ Ouvrir un dossier » : la première fois, où ranger ; ensuite, la bonne généalogie */
    async function beforeNew() {
        if (!active()) return false;
        await settings(true);
        const st = cfg(), here = SET.current ?? gidOf();
        if (!st.store) { storeDialog(); return true; }
        if (st.store === 'here') return false;
        if (st.store === 'apart' && st.apart_id === here) return false;
        if (st.store === 'apart' && st.apart_id && (SET.genealogies || []).some(g => g.id === st.apart_id)) {
            ext.openDialog({eyebrow: i18n('⚖️ DOSSIER DE SUCCESSION'), title: i18n('Ouvrir un dossier'), submitLabel: i18n('Ouvrir « {name} »', {name: gname(st.apart_id)}),
                body: `<p>${esc(i18n('Tes nouveaux dossiers vont dans « {name} ».', {name: gname(st.apart_id)}))}</p><p><button type="button" class="link-button" data-succ-new-here>${esc(i18n('Ouvrir le dossier ici quand même'))}</button></p>`,
                onOpen: d => d.querySelector('[data-succ-new-here]').addEventListener('click', () => { d.close(); newCaseHere(); }),
                onSubmit: () => { switchTo(st.apart_id, {action: 'new'}); }});
            return true;
        }
        if (st.store === 'each' || st.store === 'apart') { storeDialog(st.store); return true; }
        return false;
    }
    const newCaseHere = (pid = 0) => ext.successoral?.newCase?.(pid);
    function storeDialog(pre = '') {
        const n = Number(A()?.state?.bootstrap?.stats?.personnes) || 0;
        const advise = n > 50 ? 'apart' : '';
        let choice = pre || advise || 'here';
        const body = `<p>${esc(i18n('Où ranger tes dossiers ?'))}</p><div class="succ-store" role="radiogroup">${STORE.map(([k, t, h]) => `<label class="succ-store-opt"><input type="radio" name="succ-store" value="${k}"${k === choice ? ' checked' : ''}> <span><b>${esc(i18n(t))}</b>${k === advise ? ' ' + badge(i18n('conseillé ici'), 'green') : ''}<small>${esc(i18n(h))}</small></span></label>`).join('')}</div>
            <label class="succ-store-name" data-succ-each hidden>${esc(i18n('Nom de la nouvelle généalogie'))}<input name="each_name" maxlength="70" value="${esc(i18n('⚖️ Dossier de succession'))}"></label>
            ${advise ? `<p class="ui-hint">💡 ${esc(i18n('Ta généalogie ouverte a {n} : la ranger à part évite de mélanger les héritiers de tes clients avec ta propre famille. Ce n’est qu’un conseil.', {n: plural(n, 'fiche')}))}</p>` : ''}
            <p class="ui-hint">${esc(i18n('Tu pourras changer d’avis : Réglages → Apparence → 🧭 Usage de l’app → « ⚖️ Où ranger les dossiers ». Les dossiers déjà ouverts ne bougent pas tout seuls.'))}</p>`;
        const label = k => (k === 'here' ? i18n('Ouvrir le dossier') : k === 'apart' ? i18n('Créer « ⚖️ Dossiers de succession » et ouvrir le dossier') : i18n('Créer la généalogie et ouvrir le dossier'));
        ext.openDialog({eyebrow: i18n('⚖️ DOSSIER DE SUCCESSION'), title: i18n('Où ranger tes dossiers ?'), wide: true, submitLabel: label(choice), body,
            onOpen: d => {
                const paint = () => { choice = d.querySelector('[name=succ-store]:checked')?.value || 'here'; d.querySelector('[data-succ-each]').hidden = choice !== 'each'; const s = d.querySelector('[type=submit]'); if (s) s.textContent = label(choice); };
                d.addEventListener('change', paint); paint();
            },
            onSubmit: async f => {
                const prev = {...cfg()};
                let r; try { r = await post({op: 'target', store: choice, name: f.elements.each_name?.value || ''}); } catch (e) { toast(e.message, 'error'); return false; }
                SET = null; await settings(true);
                A().undoToast(i18n('Rangement des dossiers : {what}', {what: i18n((STORE.find(s => s[0] === choice) || STORE[0])[1])}), {undo: async () => { await post({op: 'settings_save', settings: {store: prev.store, apart_id: prev.apart_id}}); SET = null; }});
                if (r.here) { setTimeout(() => newCaseHere(), 50); return; }
                switchTo(r.genealogy, {action: 'new'});
            }});
    }
    /* ── Réglages → Apparence → 🧭 Usage de l'app → carte ⚖️ : où ranger, les dossiers et où ils sont, les réglages ── */
    async function settingsPanelHtml() {
        await settings(true);
        let d = null; try { d = await index(true); } catch (_) {}
        const st = cfg();
        const cases = (d?.bases || []).flatMap(b => b.cases.map(c => ({...c, base: b})));
        const opt = (k, v, l) => `<label class="succ-radio"><input type="radio" name="succ-set-${k}" value="${v}" data-succ-set="${k}"${String(st[k]) === String(v) ? ' checked' : ''}> ${esc(i18n(l))}</label>`;
        const w = st.weights || S().WEIGHTS;
        return `<section class="person-block-config succ-settings" id="succ-reglages"><header><span class="eyebrow">${esc(i18n('APPARENCE'))}</span><h3>⚖️ ${esc(i18n('Généalogiste successoral : réglages des dossiers'))}</h3></header>
            <div class="maintenance-panel">
            <h4>⚖️ ${esc(i18n('Où ranger les dossiers'))}</h4><p class="muted">${esc(i18n('Les nouveaux dossiers vont…'))}</p>
            <div class="segmented succ-store-seg" role="radiogroup">${[['here', 'Dans cette généalogie'], ['apart', st.apart_id ? i18n('Dans « {name} »', {name: gname(st.apart_id)}) : 'Dans une généalogie à part'], ['each', 'Un par dossier']].map(([k, l]) => `<button type="button" data-succ-store="${k}" class="${st.store === k ? 'is-active' : ''}" aria-pressed="${st.store === k}">${esc(i18n(l))}</button>`).join('')}</div>
            <h4>${esc(i18n('Les dossiers et où ils sont'))}</h4>
            ${cases.length ? `<div class="succ-scroll"><table class="succ-table succ-where"><thead><tr><th>${esc(i18n('Dossier'))}</th><th>${esc(i18n('Rangé dans'))}</th><th></th></tr></thead><tbody>${cases.map(c => `<tr><td>${esc(caseShort(c))}</td><td>${c.base.main ? '🌳' : '⚖️'} ${esc(c.base.name)}</td><td><button type="button" class="button small secondary" data-succ-move="${esc(c.base.id)}:${c.id}">${esc(i18n('⇄ Déplacer…'))}</button></td></tr>`).join('')}</tbody></table></div>` : `${window.LCNDA_APP.empty(i18n('Aucun dossier pour l’instant.'))}`}
            <h4>⚙️ ${esc(i18n('Réglages des dossiers'))}</h4>
            <div class="succ-set-grid">
            <div><b>${esc(i18n('Arbre et graphiques filtrés par ⚖️ : les fiches hors dossier'))}</b>${opt('outside', 'grey', 'grisées, sans nom')}${opt('outside', 'hide', 'cachées')}</div>
            <div><b>${esc(i18n('Archive d’un dossier clos : adresses des héritiers vivants'))}</b>${opt('archive_addresses', 'remove', 'retirées du fichier')}${opt('archive_addresses', 'keep', 'gardées dans le fichier')}</div>
            <div><b>${esc(i18n('Déplacer un dossier dont une fiche est aussi dans ta famille'))}</b>${opt('move_shared', 'copy', 'copier la fiche')}${opt('move_shared', 'refuse', 'refuser le déplacement')}</div>
            <div><b>${esc(i18n('« Sans dossier » dans la vue par dossier'))}</b>${opt('nodossier', 'fold', 'replié')}${opt('nodossier', 'hide', 'caché')}</div>
            <div id="succ-set-private"><b>${esc(i18n('Les fiches confidentielles comptent-elles comme héritiers ?'))}</b>${[['1', 'Oui'], ['0', 'Non']].map(([v, l]) => `<label class="succ-radio"><input type="radio" name="succ-set-private_heirs" value="${v}" data-succ-set="private_heirs"${(st.private_heirs !== false) === (v === '1') ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}
                <p class="ui-hint">${esc(i18n('Non : une fiche confidentielle est retirée du calcul, comme si elle n’existait pas ; le dossier le signale.'))}</p></div>
            <div><b>${esc(i18n('Avancement : un héritier qui refuse de signer'))}</b><label class="succ-radio"><input type="checkbox" data-succ-set="refuse_done"${st.refuse_done ? ' checked' : ''}> ${esc(i18n('compte comme « fait » (étape 5)'))}</label></div>
            <div><b>${esc(i18n('Avancement : poids des 7 étapes'))}</b><div class="succ-weights">${S().STEP_LABELS.map((l, i) => `<label>${i + 1}. ${esc(i18n(l))}<input type="number" min="0" max="100" value="${Number(w[i]) || 0}" data-succ-weight="${i}"></label>`).join('')}</div>
            <button type="button" class="button small secondary" data-succ-wreset>${esc(i18n('↺ Remettre comme au départ'))}</button></div>
            </div>${ext.succPlus2?.settingsHtml?.(st) || '' /* ⚖️ les réglages des outils de plus (heritage-successoral-plus2.js) */}</div></section>`;
    }
    async function saveSetting(patch, label) {
        const prev = {...cfg()};
        let r; try { r = await post({op: 'settings_save', settings: patch}); } catch (e) { return toast(e.message, 'error'); }
        SET.settings = r.settings; IDX.at = 0;
        if ('private_heirs' in patch) ext.successoral?.forget?.(); // le dossier ouvert est recalculé à la prochaine lecture
        const back = Object.fromEntries(Object.keys(patch).map(k => [k, prev[k]]));
        A().undoToast(i18n('Réglage des dossiers enregistré : {what}', {what: label}), {undo: async () => { const r2 = await post({op: 'settings_save', settings: back}); SET.settings = r2.settings; if ('private_heirs' in patch) ext.successoral?.forget?.(); refreshSettingsPanel(); }});
        if ('outside' in patch) maskTree();
        refreshSettingsPanel();
    }
    async function refreshSettingsPanel() {
        const old = document.getElementById('succ-reglages'), usage = document.getElementById('lc-usage');
        if (!usage || !active()) { old?.remove(); return; }
        const html = await settingsPanelHtml();
        const box = document.getElementById('succ-reglages');
        if (box) box.outerHTML = html; else usage.insertAdjacentHTML('afterend', html);
        bindSettingsPanel(document.getElementById('succ-reglages'));
    }
    function bindSettingsPanel(box) {
        if (!box || box.dataset.bound) return; box.dataset.bound = '1';
        box.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-succ-set]')) { const k = t.dataset.succSet; const v = t.type === 'checkbox' ? t.checked : t.value; return saveSetting({[k]: v}, t.closest('div')?.querySelector('b')?.textContent || k); }
            if (t.matches('[data-succ-weight]')) { const w = [...box.querySelectorAll('[data-succ-weight]')].map(i => Math.max(0, Math.min(100, Number(i.value) || 0))); return saveSetting({weights: w}, i18n('poids des 7 étapes')); }
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-succ-store]')) { const k = b.dataset.succStore; if (k === 'apart' && !cfg().apart_id) { storeDialog('apart'); return; } return saveSetting({store: k}, b.textContent.trim()); }
            if (b.matches('[data-succ-wreset]')) return saveSetting({weights: S().WEIGHTS}, i18n('poids des 7 étapes'));
            if (b.matches('[data-succ-move]')) { const [g, id] = b.dataset.succMove.split(':'); const base = (IDX.data?.bases || []).find(x => x.id === g); const c = base?.cases.find(x => x.id === Number(id)); if (!base?.active) return openElsewhere(g, c, 'move'); return moveDialog(c); }
        });
    }
    /** « Changer ce réglage » (avertissement des fiches confidentielles) : Réglages → Apparence, la ligne du réglage montrée */
    async function openSetting(which = 'private') {
        const st = A().state; st.maintenanceTab = 'design'; await A().setModule('maintenance');
        for (let i = 0; i < 60; i++) {
            const el = document.getElementById(which === 'private' ? 'succ-set-private' : String(which).startsWith('sp2-') ? which : 'succ-reglages'); // « sp2-… » : un outil de plus
            if (el) { el.scrollIntoView({behavior: 'smooth', block: 'center'}); el.classList.add('succ-flash'); setTimeout(() => el.classList.remove('succ-flash'), 2400); el.querySelector('input')?.focus({preventScroll: true}); return; }
            await new Promise(r => setTimeout(r, 120));
        }
    }
    ext.afterDesign.push(() => { const usage = document.getElementById('lc-usage'); if (!usage) return; refreshSettingsPanel(); if (!usage.dataset.succWatch) { usage.dataset.succWatch = '1'; usage.addEventListener('change', e => { if (e.target.matches('[data-pl-use]')) setTimeout(() => { refreshSettingsPanel(); paintButton(); }, 60); }); } });

    /* ── ⇄ Déplacer un dossier ── */
    async function moveDialog(c) {
        if (!c?.id) return;
        await settings(true);
        let rm; try { rm = await get('removable', {case_id: c.id}); } catch (e) { return toast(e.message, 'error'); }
        const here = SET.current ?? gidOf();
        const others = (SET.genealogies || []).filter(g => g.id !== here && !g.example);
        const n = rm.remove.length + rm.keep.length;
        const refuse = cfg().move_shared === 'refuse' && rm.keep.length;
        const dflt = cfg().apart_id && cfg().apart_id !== here ? cfg().apart_id : (others[0]?.id ?? '__new');
        ext.openDialog({eyebrow: i18n('⇄ DÉPLACER UN DOSSIER'), title: i18n('{n} → ?', {n: caseShort(c)}), wide: true, submitLabel: i18n('⇄ Déplacer ({what})', {what: plural(n, 'fiche')}),
            body: `<label>${esc(i18n('Vers'))}<select name="to">${others.map(g => `<option value="${esc(g.id)}"${g.id === dflt ? ' selected' : ''}>${g.main ? '🌳' : '⚖️'} ${esc(g.name)}</option>`).join('')}<option value="__new"${dflt === '__new' ? ' selected' : ''}>${esc(i18n('＋ Une nouvelle généalogie pour ce dossier'))}</option></select></label>
                <label data-succ-newname ${dflt === '__new' ? '' : 'hidden'}>${esc(i18n('Nom de la nouvelle généalogie'))}<input name="to_new" maxlength="70" value="${esc('⚖️ ' + caseShort(c))}"></label>
                <p>${esc(i18n('Ce qui part : le dossier, son journal, ses pièces, ses courriers, ses échéances, et les fiches qui lui sont rattachées (défunt, héritiers, intermédiaires) avec leurs actes et médias. Une fiche aussi rattachée à un autre dossier ou à ta famille est copiée, pas déplacée.'))}</p>
                ${rm.keep.length ? (refuse ? UI().notice('error', i18n('Déplacement refusé (réglage) : ces fiches sont aussi dans ta famille ou dans un autre dossier : {names}.', {names: rm.keep.map(k => k.name).join(', ')})) : UI().notice('info', i18n('Copiées (elles restent aussi ici) : {names}.', {names: rm.keep.map(k => k.name).join(', ')}))) : ''}
                <p class="ui-hint">${esc(i18n('Une copie de sauvegarde des deux généalogies est faite avant. Le journal du dossier note « Déplacé de … vers … ».'))}</p>`,
            onOpen: d => { const sel = d.querySelector('[name=to]'); sel.addEventListener('change', () => { d.querySelector('[data-succ-newname]').hidden = sel.value !== '__new'; }); if (refuse) d.querySelector('[type=submit]').disabled = true; },
            onSubmit: async f => {
                const to = f.elements.to.value;
                let r; try { r = await post({op: 'move', case_id: c.id, to: to === '__new' ? '' : to, to_new: to === '__new' ? f.elements.to_new.value : ''}); } catch (e) { toast(e.message, 'error'); return false; }
                invalidate(); SET = null;
                if (filterIds().includes(c.id)) setFilter(filterIds().filter(x => x !== c.id), {reload: false});
                A().undoToast(i18n('Dossier {n} déplacé vers « {to} » ({what})', {n: c.number, to: r.to_name, what: plural(r.persons, 'fiche')}), {undo: async () => { await post({op: 'move_undo', token: r.token, new_case_id: r.new_case_id}); invalidate(); refreshSettingsPanel(); ext.successoral?.openCase?.(0); }});
                refreshSettingsPanel();
                if (A().state.module === 'successoral' || A().state.listType === 'successoral') ext.successoral?.openCase?.(0);
            }});
    }

    /* ═════ ＋ Ouvrir un dossier : « ⤓ Reprendre la fiche depuis Ma généalogie » ═════ */
    ext.succCaseDialogExtra = () => {
        const others = (SET?.genealogies || []).filter(g => g.id !== (SET.current ?? gidOf()) && !g.example);
        if (!others.length) return '';
        return `<p class="succ-import-from"><button type="button" class="button small secondary" data-succ-import-from>${esc(i18n('⤓ Reprendre la fiche depuis Ma généalogie'))}</button> <small class="muted">${esc(i18n('copie de la fiche, jusqu’aux grands-parents et tous leurs descendants connus, sans photos'))}</small></p>`;
    };
    function importFromDialog(parent) {
        const here = SET?.current ?? gidOf();
        const others = (SET?.genealogies || []).filter(g => g.id !== here && !g.example);
        const main = others.find(g => g.main) || others[0];
        ext.openDialog({eyebrow: i18n('⤓ REPRENDRE UNE FICHE'), title: i18n('Reprendre la fiche du défunt'), wide: true, submitLabel: i18n('Fermer'), onSubmit: () => true,
            body: `<label>${esc(i18n('Depuis'))}<select name="from">${others.map(g => `<option value="${esc(g.id)}"${g.id === main?.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
                <label>${esc(i18n('Chercher la fiche'))}<input name="q" maxlength="80" placeholder="${esc(i18n('Prénom, nom…'))}" autocomplete="off"></label><div class="succ-other-list" data-succ-other></div>
                <p class="ui-hint">${esc(i18n('Copiées : la fiche, ses parents et grands-parents, tous leurs descendants connus et leurs conjoints, avec les dates et les lieux ; sans photos. Rien n’est changé dans l’autre généalogie.'))}</p>`,
            onOpen: d => {
                let seq = 0;
                const search = async () => {
                    const my = ++seq, q = d.querySelector('[name=q]').value.trim(), box = d.querySelector('[data-succ-other]');
                    if (q.length < 2) { box.innerHTML = ''; return; }
                    let r; try { r = await get('other_people', {from: d.querySelector('[name=from]').value, q}); } catch (e) { box.innerHTML = UI().notice('error', e.message); return; }
                    if (my !== seq) return;
                    box.innerHTML = (r.items || []).length ? r.items.map(p => `<button type="button" class="succ-other-row" data-succ-other-pick="${p.id}"><b>${esc(p.name)}</b> <small class="muted">${esc(p.years)}</small></button>`).join('') : `<p class="muted">${esc(i18n('Personne ne correspond.'))}</p>`;
                };
                let t = 0; d.querySelector('[name=q]').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
                d.querySelector('[name=from]').addEventListener('change', search);
                d.addEventListener('click', async e => {
                    const b = e.target.closest('[data-succ-other-pick]'); if (!b) return;
                    b.disabled = true;
                    let r; try { r = await post({op: 'import_from', from: d.querySelector('[name=from]').value, person_id: Number(b.dataset.succOtherPick)}); } catch (err) { b.disabled = false; return toast(err.message, 'error'); }
                    d.close(); parent?.close?.();
                    toast(i18n('{what} reprises de l’autre généalogie.', {what: plural(r.count, 'fiche')}));
                    newCaseHere(r.person_id);
                });
            }});
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-succ-import-from]'); if (b) { e.preventDefault(); importFromDialog(b.closest('dialog')); } });

    /* ═════ 3. Rattacher les personnes ═════ */
    /** après chaque calcul d'un dossier : héritiers et intermédiaires rattachés, avancement gardé pour la vue d'ensemble */
    const synced = new Map();
    ext.succDossiers = ext.succDossiers || {};
    ext.succDossiers.openSetting = openSetting;
    ext.succDossiers.refreshSettings = () => { SET = null; return refreshSettingsPanel(); }; // ⚖️ après un réglage des outils de plus
    ext.succDossiers.memDirty = () => { MEM.at = 0; };
    ext.succDossiers.afterCompute = async (D, R, P_) => {
        if (!D?.id || !R || R.error || D.archived || hidden()) return;
        const m = S().members(R);
        const sig = JSON.stringify([m.heirs.slice().sort(), m.inter.slice().sort()]);
        if (synced.get(D.id) !== sig) { try { const r = await post({op: 'sync_calc', case_id: D.id, heirs: m.heirs, inter: m.inter}); synced.set(D.id, sig); if (r.added || r.removed) MEM.at = 0; } catch (_) {} }
        await settings();
        const pr = S().progress(D, R, P_, {weights: cfg().weights, refuseDone: cfg().refuse_done !== false});
        const psig = JSON.stringify([pr.pct, pr.steps.map(s => [s.frac, s.done, s.total])]);
        if (synced.get('p' + D.id) !== psig) { try { await post({op: 'progress', case_id: D.id, pct: pr.pct, steps: pr.steps, pieces: pr.pieces, heirs: pr.heirs}); synced.set('p' + D.id, psig); IDX.at = 0; } catch (_) {} }
    };
    /* ── fiche ⋯ → « ⚖️ Dossiers… » ── */
    ext.personMoreItems.push(detail => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !active()) return null;
        return {key: 'succ-dossiers', icon: '⚖️', label: i18n('Dossiers…'), run: () => personCasesDialog(Number(p.id), [p.first_name, String(p.last_name || '').toLocaleUpperCase('fr')].filter(Boolean).join(' '))};
    });
    async function personCasesDialog(pid, name) {
        let r; try { r = await get('person_cases', {person_id: pid}); } catch (e) { return toast(e.message, 'error'); }
        const items = (r.items || []).filter(c => c.state !== 'archive');
        if (!items.length) return toast(i18n('Aucun dossier dans cette généalogie.'));
        ext.openDialog({eyebrow: i18n('⚖️ DOSSIER DE SUCCESSION'), title: i18n('{name} dans quels dossiers ?', {name}), wide: true, submitLabel: i18n('Enregistrer'),
            body: `<div class="succ-scroll"><table class="succ-table succ-pcases"><thead><tr><th></th><th>${esc(i18n('Dossier'))}</th><th>${esc(i18n('Rôle'))}</th><th>${esc(i18n('Contact'))}</th></tr></thead><tbody>${items.map(c => `<tr><td><input type="checkbox" data-succ-pc-on="${c.case_id}" aria-label="${esc(c.number)}"${c.role ? ' checked' : ''}${c.role === 'deceased' ? ' disabled' : ''}></td><td>${esc(c.number)} <small class="muted">${esc(c.title)}</small></td>
                <td><select data-succ-pc-role="${c.case_id}" aria-label="${esc(i18n('Rôle'))}"${c.role === 'deceased' ? ' disabled' : ''}><option value="">—</option>${ROLES.filter(x => x[0] !== 'deceased' || c.role === 'deceased').map(([k, l]) => `<option value="${k}"${c.role === k ? ' selected' : ''}>${esc(i18n(l))}${c.role === k && c.how === 'calc' ? ' ' + esc(i18n('(calculé)')) : ''}</option>`).join('')}</select></td>
                <td>${c.deceased ? '' : `<select data-succ-pc-cst="${c.case_id}" aria-label="${esc(i18n('Contact'))}"><option value="">—</option>${Object.entries(CONTACT).map(([k, x]) => `<option value="${k}"${c.contact === k ? ' selected' : ''}>${x[0]} ${esc(i18n(x[1]))}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table></div>
                <p class="ui-hint">${esc(i18n('Rôles : défunt · héritier · intermédiaire · témoin · à vérifier. « Héritier » mis par le calcul s’affiche « (calculé) ».'))}</p>`,
            onOpen: d => d.addEventListener('change', e => {
                const t = e.target;
                if (t.matches('[data-succ-pc-on]')) { const s = d.querySelector(`[data-succ-pc-role="${t.dataset.succPcOn}"]`); if (t.checked && !s.value) s.value = 'verify'; if (!t.checked) s.value = ''; }
                if (t.matches('[data-succ-pc-role]')) d.querySelector(`[data-succ-pc-on="${t.dataset.succPcRole}"]`).checked = !!t.value;
            }),
            onSubmit: async f => {
                const roles = {}, contacts = [];
                items.forEach(c => { if (c.role === 'deceased') return; const v = f.querySelector(`[data-succ-pc-role="${c.case_id}"]`).value; if (v !== c.role) roles[c.case_id] = v; });
                items.forEach(c => { const sel = f.querySelector(`[data-succ-pc-cst="${c.case_id}"]`); if (sel && sel.value !== (c.contact || '')) contacts.push([c.case_id, sel.value]); });
                if (!Object.keys(roles).length && !contacts.length) return;
                let res = {prev: {}}; const undoC = [];
                try {
                    if (Object.keys(roles).length) res = await post({op: 'person_roles', person_id: pid, roles});
                    for (const [cid, state] of contacts) { const r = await post({op: 'contact_state', case_id: cid, person_id: pid, state}); undoC.push([cid, r.prev]); } // une ligne au journal de chaque dossier
                } catch (e) { toast(e.message, 'error'); return false; }
                MEM.at = 0; afterPersonRefresh(pid); ext.successoral?.forget?.();
                const msg = contacts.length === 1 && !Object.keys(roles).length ? i18n('Contact de {name} : {state}', {name, state: contacts[0][1] ? i18n(CONTACT[contacts[0][1]][2]) : i18n('rien de noté')}) : i18n('Dossiers de {name} enregistrés', {name});
                A().undoToast(msg, {undo: async () => {
                    for (const [cid, prev] of undoC.reverse()) await post({op: 'contact_state', case_id: cid, person_id: pid, state: prev.state, at: prev.at, undo: 1});
                    if (Object.keys(roles).length) await post({op: 'person_roles_undo', person_id: pid, prev: res.prev});
                    MEM.at = 0; afterPersonRefresh(pid); ext.successoral?.forget?.();
                }});
            }});
    }
    const afterPersonRefresh = pid => { if (Number(A()?.state?.currentPersonId) === pid && A()?.state?.module === 'personnes') { const d = A().state.currentPerson; if (d) personBadge(d); } };
    /* ── badge « ⚖️ N dossiers » sur la fiche, et « hors du dossier » pendant le filtre ── */
    async function personBadge(detail) {
        const p = detail?.person; if (!p?.id) return;
        const host = document.querySelector('#workspace .person-hero-status'); if (!host) return;
        host.querySelectorAll('[data-succ-pbadge], [data-succ-out]').forEach(x => x.remove());
        if (!active() || p.kind === 'animal') return;
        const mem = await membership();
        const mine = mem[String(p.id)] || [];
        if (mine.length) {
            await index().catch(() => null);
            const one = mine.length === 1 ? localCases().find(c => c.id === mine[0][0]) : null;
            const cst = (mine.find(m => CONTACT[m[2]]) || [])[2] || ''; // 🔎 introuvable / 🔇 ne répond pas (le premier dossier qui en a un)
            const text = one ? `⚖️ ${one.number} · ${cst ? contactShort(cst) : roleLabel(mine[0][1])}` : `⚖️ ${nDossiers(mine.length)}${cst ? ' · ' + contactShort(cst) : ''}`;
            host.insertAdjacentHTML('beforeend', `<button type="button" class="ui-badge is-violet succ-pbadge" data-succ-pbadge="${p.id}" title="${esc(i18n('Les dossiers de cette fiche'))}">${esc(text)}</button>`);
        }
        const ids = filterIds();
        if (ids.length) {
            const set = await filterPeople();
            if (set && !set.has(Number(p.id))) {
                const c = localCases().find(x => x.id === ids[0]);
                host.insertAdjacentHTML('beforeend', `<span class="ui-badge is-yellow succ-out-badge" data-succ-out>${esc(i18n('hors du dossier {n}', {n: c ? c.number : ''}))} · <button type="button" class="link-button" data-succ-attach-here="${p.id}">＋ ${esc(i18n('Relier'))}</button></span>`);
            }
        }
    }
    ext.afterPerson.push(detail => { setTimeout(() => personBadge(detail), 0); });
    document.addEventListener('click', async e => {
        const t = e.target; if (!t.closest) return;
        const pb = t.closest('[data-succ-pbadge]');
        if (pb) {
            e.preventDefault();
            const pid = Number(pb.dataset.succPbadge); const mem = await membership(); await index().catch(() => null);
            const rows = (mem[String(pid)] || []).map(([cid, role, cst]) => ({c: localCases().find(x => x.id === cid), role, cst})).filter(x => x.c);
            return ext.openDialog({eyebrow: i18n('⚖️ DOSSIER DE SUCCESSION'), title: i18n('Les dossiers de cette fiche'), submitLabel: i18n('Fermer'), onSubmit: () => true,
                body: `<ul class="succ-pb-list">${rows.map(x => `<li><button type="button" class="table-link" data-succ-open="${x.c.id}">${esc(caseShort(x.c))}</button> · ${esc(roleLabel(x.role))}${x.cst && CONTACT[x.cst] ? ` · ${esc(contactShort(x.cst))}` : ''}</li>`).join('')}</ul>`,
                onOpen: d => d.addEventListener('click', ev => { if (ev.target.closest('[data-succ-open]')) d.close(); })});
        }
        const ah = t.closest('[data-succ-attach-here]');
        if (ah) {
            e.preventDefault();
            const pid = Number(ah.dataset.succAttachHere), cid = filterIds()[0]; if (!cid) return;
            let r; try { r = await post({op: 'attach', case_id: cid, person_id: pid, role: 'verify'}); } catch (err) { return toast(err.message, 'error'); }
            FPEOPLE.key = ''; MEM.at = 0; await filterPeople(); afterPersonRefresh(pid); paintBanner();
            const c = localCases().find(x => x.id === cid);
            A().undoToast(i18n('Fiche rattachée au dossier {n}', {n: c ? c.number : ''}), {undo: async () => { await post({op: 'cp_restore', case_id: cid, person_id: pid, prev: r.prev}); FPEOPLE.key = ''; MEM.at = 0; await filterPeople(); afterPersonRefresh(pid); paintBanner(); }});
        }
    });
    /* ── une fiche créée pendant le filtre : rattachée d'office (le serveur), message avec ↶ Annuler ── */
    window.addEventListener('lcnda:data-changed', async e => {
        const a = e.detail?.action || '';
        if (!filterIds().length || a === 'successoral_write' || a === 'save_settings' || lastAuto < 0) return;
        let r; try { r = await get('auto_recent', {after: lastAuto}); } catch (_) { return; }
        lastAuto = Math.max(lastAuto, r.last || 0);
        if (!r.items?.length) return;
        FPEOPLE.key = ''; MEM.at = 0; filterPeople().then(paintBanner);
        const byCase = [...new Set(r.items.map(x => x.number))];
        A().undoToast(i18n('Rattachée au dossier {n} : {who}', {n: byCase.join(', '), who: r.items.map(x => x.name).join(', ')}),
            {undo: async () => { for (const x of r.items) await post({op: 'cp_restore', case_id: x.case_id, person_id: x.person_id, prev: null}); FPEOPLE.key = ''; MEM.at = 0; await filterPeople(); paintBanner(); }});
    });

    /* ── onglet « 🧑‍🤝‍🧑 Personnes » du dossier ── */
    ext.succDossiers.tabPeople = async (body, D) => {
        body.innerHTML = UI().spinner(i18n('Lecture des fiches du dossier…'));
        let r; try { r = await get('case_people', {case_id: D.id}); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        if (!body.isConnected) return;
        const ro = D.archived;
        const on = (r.items || []).filter(x => !x.removed), off = (r.items || []).filter(x => x.removed && x.removed_by === 'hand');
        const row = x => `<tr data-succ-cprow="${x.person_id}"><td><button type="button" class="table-link" data-h-person="${x.person_id}">${esc(x.name)}</button>${x.years ? ` <small class="muted">(${esc(x.years)})</small>` : ''}</td>
            <td>${ro || x.role === 'deceased' ? esc(roleLabel(x.role)) : `<select data-succ-cprole="${x.person_id}" aria-label="${esc(i18n('Rôle'))}">${ROLES.filter(k => k[0] !== 'deceased').map(([k, l]) => `<option value="${k}"${x.role === k ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>`}</td>
            <td>${esc(i18n(HOW[x.how] || x.how))}</td><td>${ro || x.role === 'deceased' ? '' : `<button type="button" class="button small secondary" data-succ-cpdel="${x.person_id}">${esc(i18n('Retirer'))}</button>`}</td></tr>`;
        body.innerHTML = `${(r.homonyms || []).length ? homonymsHtml(r.homonyms, D) : ''}
            <section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Les fiches du dossier'))} <small class="muted">${esc(plural(on.length, 'fiche'))}</small></h3></div>
            ${ro ? '' : `<div class="succ-cp-add"><div class="succ-cp-pk">${P().pickerField({name: 'succ_add_person', kind: 'person', animals: false, placeholder: i18n('＋ Ajouter une personne…')})}</div>
                <select data-succ-cp-newrole aria-label="${esc(i18n('Rôle'))}">${ROLES.filter(k => k[0] !== 'deceased').map(([k, l]) => `<option value="${k}"${k === 'verify' ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>
                <button type="button" class="button small" data-succ-cp-add>${esc(i18n('Relier'))}</button></div>`}
            <div class="succ-scroll"><table class="succ-table succ-cp"><thead><tr><th>${esc(i18n('Personne'))}</th><th>${esc(i18n('Rôle'))}</th><th>${esc(i18n('Comment'))}</th><th></th></tr></thead><tbody>${on.map(row).join('')}</tbody></table></div>
            <p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le tableau.'))}</p>
            ${off.length ? `<details class="succ-cp-off"><summary>${esc(i18n('Retirées à la main ({n}) : jamais remises toutes seules', {n: off.length}))}</summary><ul>${off.map(x => `<li>${esc(x.name)} <button type="button" class="link-button" data-succ-cpback="${x.person_id}">${esc(i18n('Remettre'))}</button></li>`).join('')}</ul></details>` : ''}</section>`;
    };
    function homonymsHtml(list, D) {
        return `<section class="succ-box succ-homs">${list.map(h => `<div class="ui-notice ui-notice-info succ-hom" role="status"><span class="ui-notice-ico" aria-hidden="true">🔎</span><span>${esc(h.kind === 'base' ? i18n('Fiche à comparer : « {name}{year} » ressemble à une fiche déjà dans cette base. Jamais fusionnée toute seule.', {name: h.name, year: h.year ? ', ' + i18n('née {y}', {y: h.year}) : ''})
            : i18n('Homonyme possible : « {name}{year} » existe aussi dans le dossier {n}. Jamais relié tout seul.', {name: h.name, year: h.year ? ', ' + i18n('née {y}', {y: h.year}) : '', n: h.cases.map(c => c.number).join(', ')}))}
            <span class="succ-hom-acts"><button type="button" class="button small secondary" data-succ-hcmp="${h.person_id}:${h.other_id}">${esc(i18n('⇆ Comparer'))}</button>${D.archived ? '' : `<button type="button" class="button small secondary" data-succ-hsame="${h.other_id}">${esc(i18n('C’est la même personne : rattacher aussi'))}</button><button type="button" class="button small secondary" data-succ-hno="${h.person_id}:${h.other_id}">${esc(i18n('Pas la même'))}</button>`}</span></span></div>`).join('')}</section>`;
    }
    /** dans 👥 Héritiers : les homonymes d'un autre dossier, signalés, jamais appliqués sans clic */
    ext.succDossiers.heirsExtra = async (body, D) => {
        let r; try { r = await get('homonyms', {case_id: D.id}); } catch (_) { return; }
        if (!r.items?.length || !body.isConnected) return;
        body.insertAdjacentHTML('afterbegin', homonymsHtml(r.items, D));
    };
    const caseReload = () => ext.successoral?.reload?.();
    document.addEventListener('click', async e => {
        const t = e.target; if (!t.closest) return;
        const D = ext.successoral?.current?.(); if (!D || !t.closest('[data-succ-case]')) return;
        if (t.closest('[data-succ-cp-add]')) {
            const host = t.closest('.succ-box'); const pid = Number(host.querySelector('[name=succ_add_person]')?.value) || 0;
            if (!pid) return UI().fail?.(host.querySelector('.pk'), i18n('Choisis une personne.')) ?? toast(i18n('Choisis une personne.'), 'error');
            const role = host.querySelector('[data-succ-cp-newrole]').value;
            let r; try { r = await post({op: 'attach', case_id: D.id, person_id: pid, role}); } catch (err) { return toast(err.message, 'error'); }
            MEM.at = 0; FPEOPLE.key = '';
            A().undoToast(i18n('Fiche rattachée au dossier {n}', {n: D.number}), {undo: async () => { await post({op: 'cp_restore', case_id: D.id, person_id: pid, prev: r.prev}); MEM.at = 0; caseReload(); }});
            return caseReload();
        }
        const del = t.closest('[data-succ-cpdel]');
        if (del) {
            const pid = Number(del.dataset.succCpdel);
            let r; try { r = await post({op: 'detach', case_id: D.id, person_id: pid}); } catch (err) { return toast(err.message, 'error'); }
            MEM.at = 0; FPEOPLE.key = '';
            A().undoToast(i18n('Fiche retirée du dossier {n}', {n: D.number}), {undo: async () => { await post({op: 'cp_restore', case_id: D.id, person_id: pid, prev: r.prev}); MEM.at = 0; caseReload(); }});
            return caseReload();
        }
        const back = t.closest('[data-succ-cpback]');
        if (back) {
            const pid = Number(back.dataset.succCpback);
            let r; try { r = await post({op: 'attach', case_id: D.id, person_id: pid, role: 'verify'}); } catch (err) { return toast(err.message, 'error'); }
            MEM.at = 0;
            A().undoToast(i18n('Fiche remise dans le dossier {n}', {n: D.number}), {undo: async () => { await post({op: 'cp_restore', case_id: D.id, person_id: pid, prev: r.prev}); MEM.at = 0; caseReload(); }});
            return caseReload();
        }
        const cmp = t.closest('[data-succ-hcmp]');
        if (cmp) { const [a, b] = cmp.dataset.succHcmp.split(':').map(Number); return compare(a, b); }
        const same = t.closest('[data-succ-hsame]');
        if (same) {
            const other = Number(same.dataset.succHsame);
            let r; try { r = await post({op: 'homonym_same', case_id: D.id, other_id: other}); } catch (err) { return toast(err.message, 'error'); }
            MEM.at = 0;
            A().undoToast(i18n('Homonyme rattaché aussi au dossier {n} (à vérifier)', {n: D.number}), {undo: async () => { await post({op: 'cp_restore', case_id: D.id, person_id: other, prev: r.prev}); caseReload(); }});
            return caseReload();
        }
        const no = t.closest('[data-succ-hno]');
        if (no) {
            const [a, b] = no.dataset.succHno.split(':').map(Number);
            try { await post({op: 'homonym_no', a, b}); } catch (err) { return toast(err.message, 'error'); }
            A().undoToast(i18n('Noté : ce n’est pas la même personne'), {undo: async () => { await post({op: 'homonym_no_undo', a, b}); caseReload(); }});
            return caseReload();
        }
    });
    document.addEventListener('change', async e => {
        const t = e.target; if (!t.matches?.('[data-succ-cprole]')) return;
        const D = ext.successoral?.current?.(); if (!D) return;
        const pid = Number(t.dataset.succCprole);
        let r; try { r = await post({op: 'attach', case_id: D.id, person_id: pid, role: t.value}); } catch (err) { return toast(err.message, 'error'); }
        MEM.at = 0;
        A().undoToast(i18n('Rôle : {r}', {r: roleLabel(t.value)}), {undo: async () => { await post({op: 'cp_restore', case_id: D.id, person_id: pid, prev: r.prev}); caseReload(); }});
    });
    function compare(a, b) {
        const st = A().state;
        st.comparisonMode = 'personnes'; st.comparison = {left: a, right: b, leftName: '', rightName: '', query: ''};
        A().persistUiState?.(); A().setModule('comparaison');
    }

    /* ═════ 4. ⚖️ Successions → « Dossiers » : le tableau de bord ═════ */
    const BSEL = new Set(); // les dossiers cochés : « base:n° »
    ext.succDossiers.board = async (body, token, ctx = {}) => {
        let d; try { d = await index(true); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        await settings();
        const rows = (d.bases || []).flatMap(b => (b.cases || []).map(c => ({...c, base: b, key: `${b.id}:${c.id}`, here: !!b.active})));
        const bad = (d.bases || []).filter(b => b.error);
        const locked = (d.bases || []).filter(b => b.locked); // 🔐 une autre généalogie protégée par un mot de passe : rien n'en est lu (lib/verrou.php)
        const lockNote = locked.length ? UI().notice('info', '🔐 ' + i18n('Verrouillée : {names} (ouvre-la avec son mot de passe pour voir ses dossiers)', {names: locked.map(b => b.name).join(', ')})) : '';
        if (!rows.length) { body.innerHTML = lockNote + A().emptyState({icon: '⚖️', text: i18n('Aucun dossier de succession pour l’instant'), hint: i18n('Choisis la personne décédée : l’app part des fiches de la base pour trouver ses héritiers, selon le Code civil d’aujourd’hui.'), action: {label: i18n('＋ Ouvrir un dossier'), attrs: 'data-succ-new'}}) + (bad.length ? UI().notice('warn', i18n('⚠️ illisible : {names}', {names: bad.map(b => b.name).join(', ')})) : ''); return; }
        const notaries = [...new Set(rows.map(r => r.notary).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        const offices = [...new Map(rows.filter(r => r.here && r.office).map(r => [r.office.id, r.office])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')); // 🏛 l'étude de chaque dossier
        const bases = (d.bases || []).filter(b => b.cases.length);
        // 👥 qui est chargé de chaque dossier (heritage-successoral-audit.js) : filtre « Mes dossiers » et nom sur la ligne
        let asg = {items: [], names: [], me: ''}; try { asg = (await ext.succAudit?.assignments?.()) || asg; } catch (_) {}
        const whoOf = r => (r.here ? (asg.items.find(x => x.case_id === Number(r.id) && x.task === '')?.who || '') : '');
        const bar = UI().listBar({key: 'succ:board', search: {placeholder: i18n('Chercher… (n°, défunt, notaire)')}, view: {dflt: 'list', what: 'dossiers'},
            filters: [{id: 'state', label: i18n('État'), type: 'check', options: [['late', i18n('Échéance passée')], ...['recherche', 'trouves', 'remis', 'clos', 'ouvert', 'archive'].map(k => [k, stateLabel(k)])]},
                {id: 'base', label: i18n('Rangé dans'), type: 'select', options: [['', i18n('Toutes les généalogies')], ...bases.map(b => [b.id || '_main', b.name])]},
                {id: 'notary', label: i18n('Notaire'), type: 'select', options: [['', i18n('Tous les notaires')], ...notaries.map(n => [n, n])]},
                ...(asg.names.length || asg.me ? [{id: 'who', label: i18n('Chargé du dossier'), type: 'select', options: [['', i18n('Tout le monde')], ...(asg.me ? [['__me', i18n('👤 Mes dossiers ({name})', {name: asg.me})]] : []), ...asg.names.map(n => [n, n]), ['__none', i18n('Personne de chargé')]]}] : []),
                ...(offices.length ? [{id: 'office', label: i18n('Étude de notaire'), type: 'select', options: [['', i18n('Toutes les études')], ...offices.map(o => [String(o.id), o.name])]}] : [])], // 🏛 heritage-complements.js
            sort: {options: [['due', i18n('Prochaine échéance (retards d’abord)')], ['low', i18n('Avancement le plus bas')], ['recent', i18n('Les plus récents')], ['num', i18n('N° de dossier')]], value: 'due'}, onChange: st => draw(st)});
        body.innerHTML = `${lockNote}${bad.length ? UI().notice('warn', i18n('⚠️ illisible : {names}', {names: bad.map(b => b.name).join(', ')})) : ''}<div data-succ-bitems></div><div class="succ-bsel" data-succ-bsel hidden></div>`;
        body.prepend(bar);
        const M = UI().listMatch;
        let shown = rows;
        const dueTxt = r => { if (!r.next_due) return '—'; const n = daysTo(r.next_due); return n != null && n < 0 ? i18n('{d} · passée', {d: fmtDate(r.next_due)}) : fmtDate(r.next_due); };
        const heirsTxt = r => (r.found ? [r.found.found ? i18n('Trouvés : {n}', {n: r.found.found}) : '', r.found.unknown ? i18n('À trouver : {n}', {n: r.found.unknown}) : ''].filter(Boolean).join(' · ') || '—' : r.heirs ? plural(r.heirs, 'héritier') : '—');
        const timeTxt = m => (m ? i18n('{h} h {m}', {h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0')}) : '—');
        const bar100 = p => (p == null ? `<span class="muted">…</span>` : `<span class="succ-pbar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(p) || 0))}%"></i></span> <b>${Number(p) || 0} %</b>`);
        const where = r => (r.here ? `${r.base.main ? '🌳' : '⚖️'} ${esc(r.base.name)}` : `<button type="button" class="table-link" data-succ-away="${esc(r.key)}">↗ ${r.base.main ? '🌳' : '⚖️'} ${esc(r.base.name)}</button>`);
        function draw(st = bar.state) {
            let list = rows.filter(r => M.text(st.q, r.number, r.title, r.deceased, r.notary, r.base.name)
                && (!st.filters.state?.length || st.filters.state.some(s => (s === 'late' ? r.late > 0 : r.state === s)))
                && (!st.filters.base || (r.base.id || '_main') === st.filters.base) && (!st.filters.notary || r.notary === st.filters.notary) && (!st.filters.office || String(r.office?.id || '') === st.filters.office)
                && (!st.filters.who || (st.filters.who === '__none' ? !whoOf(r) : whoOf(r) === (st.filters.who === '__me' ? asg.me : st.filters.who))));
            const due = r => (r.late ? '0' : '1') + String(r.next_due || '9999');
            list = st.sort === 'low' ? [...list].sort((a, b) => (a.progress ?? -1) - (b.progress ?? -1)) : st.sort === 'recent' ? UI().sortItems(list, 'recent') : st.sort === 'num' ? [...list].sort((a, b) => String(a.number).localeCompare(String(b.number), 'fr', {numeric: true})) : [...list].sort((a, b) => due(a).localeCompare(due(b)) || String(a.number).localeCompare(String(b.number), 'fr', {numeric: true}));
            shown = list;
            bar.setCount(list.length, 'dossier de succession', 'dossiers de succession');
            const box = body.querySelector('[data-succ-bitems]');
            if (!list.length) { box.innerHTML = `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">${esc(i18n('Aucun dossier ne correspond.'))}</span></p>`; return paintSel(); }
            const chk = r => `<input type="checkbox" data-succ-bchk="${esc(r.key)}" aria-label="${esc(i18n('Cocher le dossier {n}', {n: r.number}))}"${BSEL.has(r.key) ? ' checked' : ''}>`;
            const open = r => (r.here ? `data-succ-open="${r.id}"` : `data-succ-away="${esc(r.key)}"`);
            if (st.view === 'cards') {
                box.innerHTML = UI().cardsHtml(list.map(r => ({thumb: '<span class="ui-card-ico" aria-hidden="true">⚖️</span>', name: `${r.number} ${r.deceased || r.title}`, open: open(r), attrs: `data-succ-brow="${esc(r.key)}"`,
                    lines: [{html: bar100(r.progress)}, [r.notary, dueTxt(r) !== '—' ? i18n('Échéance : {d}', {d: dueTxt(r)}) : '', whoOf(r) ? `👤 ${whoOf(r)}` : ''].filter(Boolean).join(' · ')],
                    badges: [{text: stateLabel(r.state), kind: stateKind(r.state)}, r.late ? {text: i18n('Échéance passée'), kind: 'red'} : null, {text: (r.base.main ? '🌳 ' : '⚖️ ') + r.base.name, kind: 'grey'}].filter(Boolean),
                    quick: chk(r)})));
            } else {
                box.innerHTML = `<div class="succ-scroll"><table class="succ-table succ-board"><thead><tr><th></th><th>${esc(i18n('Dossier'))}</th><th>${esc(i18n('État'))}</th><th>${esc(i18n('Notaire'))}</th><th>${esc(i18n('Prochaine échéance'))}</th><th>${esc(i18n('Héritiers'))}</th><th>${esc(i18n('Pièces'))}</th><th>${esc(i18n('Temps'))}</th><th>${esc(i18n('Avancement'))}</th><th>${esc(i18n('Rangé dans'))}</th></tr></thead>
                    <tbody>${list.map(r => `<tr data-succ-brow="${esc(r.key)}" class="${r.late ? 'is-late' : ''}"><td>${chk(r)}</td><td><button type="button" class="table-link" ${open(r)}><b>${esc(r.number)}</b> ${esc(r.deceased || r.title)}</button>${whoOf(r) ? ` <small class="succ-who" data-succ-who="${r.id}">👤 ${esc(whoOf(r))}</small>` : ''}</td>
                        <td>${badge(stateLabel(r.state), stateKind(r.state))}</td><td>${r.here && r.office ? `<button type="button" class="table-link" data-compl-etude="${Number(r.office.id)}" title="${esc(i18n('↗ Ouvrir'))}">${esc(r.office.name)}${r.office.notary ? ` · ${esc(r.office.notary)}` : ''}</button>` : `${esc(r.notary || '—')}${r.notary_typed ? ` ${badge(i18n('texte'), 'grey')}` : ''}`}</td><td class="${r.late ? 'succ-late' : ''}">${esc(dueTxt(r))}</td><td>${esc(heirsTxt(r))}</td>
                        <td>${r.pieces ? esc(`${r.pieces.have} / ${r.pieces.total}`) : '—'}</td><td>${esc(timeTxt(r.minutes))}</td><td class="succ-bpct">${bar100(r.progress)}</td><td>${where(r)}</td></tr>`).join('')}</tbody></table></div>
                    <p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le tableau.'))}</p>`;
            }
            paintSel();
        }
        function paintSel() {
            const box = body.querySelector('[data-succ-bsel]'); if (!box) return;
            const sel = rows.filter(r => BSEL.has(r.key));
            box.hidden = !sel.length; if (!sel.length) { box.innerHTML = ''; return; }
            const mixed = new Set(sel.map(r => r.base.id)).size > 1;
            box.innerHTML = `<b>${esc(i18n('Cochés : {n}', {n: sel.length}))}</b><button type="button" class="button small" data-succ-bonly${mixed ? ' disabled' : ''}>${esc(i18n('⚖️ Ne montrer que ceux-ci'))}</button><button type="button" class="button small secondary" data-succ-bcsv>${esc(i18n('⤓ Exporter en CSV'))}</button><button type="button" class="link-button" data-succ-bnone>${esc(i18n('Tout décocher'))}</button>
                ${mixed ? `<small class="succ-bwarn">${esc(i18n('Les dossiers cochés sont dans des généalogies différentes : choisis-en dans une seule.'))}</small>` : ''}`;
        }
        body.addEventListener('change', e => { const c = e.target.closest('[data-succ-bchk]'); if (!c) return; if (c.checked) BSEL.add(c.dataset.succBchk); else BSEL.delete(c.dataset.succBchk); paintSel(); });
        body.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-succ-bnone]')) { BSEL.clear(); draw(); return; }
            if (t.closest('[data-succ-bonly]')) {
                const sel = rows.filter(r => BSEL.has(r.key)); if (!sel.length) return;
                if (new Set(sel.map(r => r.base.id)).size > 1) return;
                if (!sel[0].here) { const pending = {action: 'open', case_id: 0, filter: true, ids: sel.map(r => r.id)}; return switchTo(sel[0].base.id, pending); }
                await setFilter(sel.map(r => r.id), {reload: false}); BSEL.clear();
                return A().setModule('personnes');
            }
            if (t.closest('[data-succ-bcsv]')) {
                const sel = rows.filter(r => BSEL.has(r.key));
                const cell = v => (S().csvCell ? S().csvCell(v) : `"${String(v ?? '').replace(/"/g, '""')}"`);
                const head = ['Dossier', 'Défunt', 'État', 'Notaire', 'Prochaine échéance', 'Héritiers', 'Pièces', 'Temps', 'Avancement', 'Rangé dans'].map(h => cell(i18n(h)));
                const csv = '﻿' + [head.join(';'), ...sel.map(r => [r.number, r.deceased, stateLabel(r.state), r.notary, r.next_due, heirsTxt(r), r.pieces ? `${r.pieces.have}/${r.pieces.total}` : '', timeTxt(r.minutes), r.progress == null ? '' : r.progress + ' %', r.base.name].map(cell).join(';'))].join('\r\n');
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = 'dossiers-de-succession.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                { const tk = A().state?.csrf || ''; fetch('api.php?action=access_note', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': tk}, body: JSON.stringify({what: 'dashboard_csv', n: sel.length, csrf: tk})}).catch(() => {}); } // 📜 Qui a vu quoi (lib/verrou.php)
                return toast(i18n('Dossiers exportés (CSV)'));
            }
            const aw = t.closest('[data-succ-away]');
            if (aw) { e.preventDefault(); const r = rows.find(x => x.key === aw.dataset.succAway); if (r) openElsewhere(r.base.id, r); }
        });
        draw();
        // l'avancement des dossiers d'ici pas encore calculé : calculé en arrière-plan, puis la ligne est mise à jour
        const todo = rows.filter(r => r.here && r.progress == null && r.state !== 'archive').slice(0, 30);
        for (const r of todo) {
            try {
                const D = await get('get', {id: r.id}); if (!body.isConnected) return;
                const R = ext.successoral?.compute?.(D); if (!R || R.error) continue;
                const states = {}; for (const [k, p] of Object.entries(D.pieces || {})) if (p.state) states[k] = p.state;
                const P_ = S().pieces(R, D.graph, {acts: D.acts || {}, states, asked: D.asked || {}});
                await ext.succDossiers.afterCompute(D, R, P_);
                const pr = S().progress(D, R, P_, {weights: cfg().weights, refuseDone: cfg().refuse_done !== false});
                Object.assign(r, {progress: pr.pct, pieces: pr.pieces, found: pr.heirs});
            } catch (_) {}
        }
        if (todo.length && body.isConnected) draw();
    };
    ext.succDossiers.boardMore = () => [`<button type="button" data-succ-reimport>${esc(i18n('⤒ Réimporter un dossier archivé…'))}</button>`];

    /* ═════ 5. Garde-fous ═════ */
    /* ── 5a. fusion de deux fiches de dossiers différents (Fiche → ⋯ → Fusionner…, Doublons) ── */
    let mergeOk = '';
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-merge-target][data-merge-source], [data-h-merge][data-h-merge-src]'); if (!b || hidden()) return;
        const a = Number(b.dataset.mergeTarget || b.dataset.hMerge), s = Number(b.dataset.mergeSource || b.dataset.hMergeSrc);
        const key = `${a}:${s}`;
        if (mergeOk === key) { mergeOk = ''; return; }
        e.preventDefault(); e.stopImmediatePropagation();
        let r; try { r = await get('merge_check', {a, b: s}); } catch (_) { mergeOk = key; b.click(); return; }
        if (!r.different) { mergeOk = key; b.click(); return; }
        const who = x => `${x.name} (${x.cases.map(c => `${c.number}, ${roleLabel(c.role)}`).join(' ; ')})`;
        ext.openDialog({eyebrow: i18n('⚠️ FUSION'), title: i18n('Ces deux fiches sont dans des dossiers différents'), wide: true, submitLabel: i18n('Fusionner quand même'),
            body: `${UI().notice('warn', i18n('{a} et {b}. Fusionner relie les deux successions et change les parts des deux dossiers. Vérifie avec des actes (naissance, parents) avant.', {a: who(r.a), b: who(r.b)}))}
                <p><button type="button" class="button small secondary" data-succ-mcmp>${esc(i18n('⇆ Comparer d’abord'))}</button></p><p class="ui-hint">${esc(i18n('Si on fusionne : noté dans le journal des deux dossiers, et les deux sont recalculés.'))}</p>`,
            onOpen: d => d.querySelector('[data-succ-mcmp]').addEventListener('click', () => { d.close(); b.closest('dialog')?.close?.(); compare(a, s); }),
            onSubmit: async () => { try { await post({op: 'merge_journal', a, b: s}); } catch (_) {} mergeOk = key; setTimeout(() => b.click(), 0); }});
    }, true);

    /* ── 5c. 🗄 Archiver dans un fichier et retirer ; ⤒ Réimporter ── */
    ext.succDossiers.caseMore = D => (D.state === 'clos' ? [`<button type="button" data-succ-archfile>${esc(i18n('🗄 Archiver dans un fichier et retirer…'))}</button>`] : []).concat(D.archived ? [] : [`<button type="button" data-succ-movecase>${esc(i18n('⇄ Déplacer…'))}</button>`]);
    async function archiveDialog(D, R) {
        let rm; try { rm = await get('removable', {case_id: D.id}); } catch (e) { return toast(e.message, 'error'); }
        await settings();
        const keep = cfg().archive_addresses === 'keep';
        const name = `dossier-${D.number}-${lastName(D.deceased).replace(/[^A-Za-zÀ-ÿ0-9]+/g, '-')}.lcnda-succ.zip`;
        const n = rm.remove.length + rm.keep.length;
        ext.openDialog({eyebrow: i18n('🗄 ARCHIVER LE DOSSIER {n}', {n: D.number}), title: i18n('Dans un fichier, puis retirer de la base'), wide: true, submitLabel: i18n('⤓ Enregistrer le fichier puis retirer'),
            body: `<p>${esc(i18n('Le fichier {file} contient : le dossier, le journal, les pièces et leurs images, les courriers, l’arbre de dévolution (SVG), le tableau pour le notaire et les fiches rattachées ({n}).', {file: name, n}))}</p>
                <div class="succ-store" role="radiogroup"><label class="succ-store-opt"><input type="radio" name="addr" value="keep"${keep ? ' checked' : ''}> <span><b>${esc(i18n('Garder les adresses des vivants dans le fichier'))}</b><small>${esc(i18n('utile si le notaire rouvre la succession'))}</small></span></label>
                <label class="succ-store-opt"><input type="radio" name="addr" value="remove"${keep ? '' : ' checked'}> <span><b>${esc(i18n('Retirer les adresses'))}</b><small>${esc(i18n('comme l’archivage actuel'))}</small></span></label></div>
                <p>${esc(i18n('Ensuite, les fiches qui ne servent qu’à ce dossier sont retirées de la base ({n}). Une fiche aussi rattachée à un autre dossier (ou à ta famille) reste ({k}). Une sauvegarde est faite avant.', {n: rm.remove.length, k: rm.keep.length}))}</p>
                ${ext.succPlus2?.archiveExtraHtml?.(D) || '' /* 📦 ce qui part en plus, mot de passe (heritage-successoral-plus2.js) */}`,
            onSubmit: async f => {
                const keepAddr = f.querySelector('[name=addr]:checked')?.value === 'keep';
                const pw = ext.succPlus2?.archivePassword ? ext.succPlus2.archivePassword(f) : ''; if (pw === false) return false;
                const svg = ext.successoral?.treeSvg ? ext.successoral.treeSvg(D, R) : '';
                const html = ext.successoral?.notaryHtml ? ext.successoral.notaryHtml(D, R, keepAddr) : '';
                const send = extra => post({op: 'archive_file', id: D.id, keep_addresses: keepAddr ? 1 : 0, svg, notary_html: html, ...(pw ? {password: pw} : {}), ...extra});
                let r; try { r = await send({}); } catch (e) {
                    if (!/^💶/.test(e.message) || !(await A().confirmBox(e.message, {title: i18n('🗄 Archiver le dossier clos'), okLabel: i18n('Archiver')}))) { if (!/^💶/.test(e.message)) toast(e.message, 'error'); return false; }
                    try { r = await send({funds_ok: 1}); } catch (e2) { toast(e2.message, 'error'); return false; }
                }
                invalidate();
                const a = document.createElement('a'); a.href = `api.php?action=successoral&op=archive_download&token=${encodeURIComponent(r.token)}&g=${encodeURIComponent(window.LCNDA_GENEALOGY || 'main')}`; a.download = r.file; document.body.appendChild(a); a.click(); a.remove();
                if (filterIds().includes(D.id)) setFilter(filterIds().filter(x => x !== D.id), {reload: false});
                A().undoToast(i18n('Dossier {n} archivé dans « {file} » et retiré ({what})', {n: D.number, file: r.file, what: plural(r.removed, 'fiche retirée', 'fiches retirées')}),
                    {undo: async () => { const x = await post({op: 'reimport', token: r.token, to: gidOf(), ...(pw ? {password: pw} : {})}); invalidate(); ext.successoral?.openCase?.(x.case_id); }});
                ext.successoral?.openCase?.(0);
            }});
    }
    async function reimportDialog() {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.zip,application/zip';
        input.addEventListener('change', async () => {
            const file = input.files?.[0]; if (!file) return;
            const fd = new FormData(); fd.append('op', 'reimport_upload'); fd.append('file', file); fd.append('csrf', A().state.csrf);
            let up;
            try {
                const res = await fetch('api.php?action=successoral_write', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf, ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})}});
                const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || 'Erreur');
                up = j.result;
            } catch (e) { return toast(e.message, 'error'); }
            await settings(true);
            let pv, pw = '';
            try { pv = await get('reimport_preview', {token: up.token, to: gidOf()}); } catch (e) {
                // 📦 archive protégée : le mot de passe est demandé, envoyé seulement par POST (jamais dans l'adresse)
                if (!/^🔐/.test(e.message) || !ext.succPlus2?.askArchivePassword) return toast(e.message, 'error');
                pw = await ext.succPlus2.askArchivePassword(); if (!pw) return;
                try { pv = await post({op: 'p2_reimport_preview', token: up.token, to: gidOf(), password: pw}); } catch (e2) { return toast(e2.message, 'error'); }
            }
            const gens = (SET.genealogies || []).filter(g => !g.example);
            ext.openDialog({eyebrow: i18n('⤒ RÉIMPORTER'), title: file.name, wide: true, submitLabel: i18n('⤒ Réimporter le dossier'),
                body: `<p>${esc(i18n('Dossier {n} ({name}{closed}), {what}.', {n: pv.number, name: pv.deceased, closed: pv.closed ? ', ' + i18n('clos le {d}', {d: fmtDate(pv.closed)}) : '', what: plural(pv.persons, 'fiche')}))}</p>
                    ${pv.similar.length ? UI().notice('info', i18n('{what} ressemblent à des fiches déjà dans cette base ({names}) : elles seront proposées à la comparaison, jamais fusionnées seules.', {what: plural(pv.similar.length, 'fiche'), names: pv.similar.join(', ')})) : ''}
                    <label>${esc(i18n('Dans'))}<select name="to">${gens.map(g => `<option value="${esc(g.id)}"${g.id === gidOf() ? ' selected' : ''}>${g.main ? '🌳' : '⚖️'} ${esc(g.name)}</option>`).join('')}</select></label>`,
                onSubmit: async f => {
                    const to = f.elements.to.value;
                    let r; try { r = await post({op: 'reimport', token: up.token, to, ...(pw ? {password: pw} : {})}); } catch (e) { toast(e.message, 'error'); return false; }
                    invalidate();
                    if (r.here) {
                        A().undoToast(i18n('Dossier {n} réimporté ({what})', {n: pv.number, what: plural(r.persons, 'fiche')}), {undo: async () => { await post({op: 'reimport_undo', case_id: r.case_id}); invalidate(); ext.successoral?.openCase?.(0); }});
                        ext.successoral?.openCase?.(r.case_id, 'people');
                    } else { toast(i18n('Dossier {n} réimporté dans « {name} ».', {n: pv.number, name: gname(to)})); ext.successoral?.openCase?.(0); }
                }});
        });
        input.click();
    }
    document.addEventListener('click', e => {
        const t = e.target; if (!t.closest) return;
        if (t.closest('[data-succ-reimport]')) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return reimportDialog(); }
        const D = ext.successoral?.current?.();
        if (t.closest('[data-succ-archfile]') && D) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return archiveDialog(D, ext.successoral.currentR()); }
        if (t.closest('[data-succ-movecase]') && D) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return moveDialog({id: D.id, number: D.number, deceased: D.deceased}); }
    });

    /* ═════ 6. Widget « ⚖️ Mes dossiers de succession » (clé succ_widget) ═════ */
    const wcfg = w => { const c = w?.config || {}; return {which: ['all', 'open', 'filter'].includes(c.succWhich) ? c.succWhich : 'open', filter: ['late', 'recherche', 'remis', 'base', 'notary'].includes(c.succFilter) ? c.succFilter : 'late', fbase: String(c.succBase ?? ''), fnotary: String(c.succNotary || ''),
        show: Array.isArray(c.succShow) ? c.succShow.filter(x => ['counts', 'bars', 'steps'].includes(x)) : null, sort: ['due', 'low', 'recent', 'num'].includes(c.succSort) ? c.succSort : 'due'}; };
    const widgetRows = (d, c) => {
        let rows = (d?.bases || []).flatMap(b => (b.cases || []).map(x => ({...x, base: b, here: !!b.active})));
        if (c.which === 'open') rows = rows.filter(r => !['clos', 'archive'].includes(r.state));
        if (c.which === 'filter') rows = rows.filter(r => (c.filter === 'late' ? r.late > 0 : c.filter === 'base' ? r.base.id === c.fbase : c.filter === 'notary' ? r.notary === c.fnotary : r.state === c.filter));
        const due = r => (r.late ? '0' : '1') + String(r.next_due || '9999');
        return c.sort === 'low' ? rows.sort((a, b) => (a.progress ?? -1) - (b.progress ?? -1)) : c.sort === 'recent' ? rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))) : c.sort === 'num' ? rows.sort((a, b) => String(a.number).localeCompare(String(b.number), 'fr', {numeric: true})) : rows.sort((a, b) => due(a).localeCompare(due(b)));
    };
    ext.dashboard.succ_widget = {
        load: () => (kiosk() ? Promise.resolve(null) : index().catch(() => null)),
        render: (i, widget, span, data) => {
            const c = wcfg(widget), size = Number(span) <= 4 ? 's' : Number(span) <= 8 ? 'm' : 'l';
            const show = c.show || (size === 's' ? ['counts'] : size === 'm' ? ['counts', 'bars'] : ['counts', 'steps']);
            const limit = Math.max(1, Math.min(20, Number(widget?.limit) || 5));
            const title = i18n('⚖️ Mes dossiers de succession');
            if (!data) return A().card(i, title, '', A().empty(kiosk() ? i18n('Pas en mode consultation.') : i18n('Les dossiers n’ont pas pu être lus.'), {icon: '⚖️'}), span);
            const all = (data.bases || []).flatMap(b => b.cases || []);
            if (!all.length) return A().card(i, title, '', A().empty(i18n('Aucun dossier de succession.'), {icon: '⚖️'}), span);
            const rows = widgetRows(data, c).slice(0, limit);
            const count = k => all.filter(r => r.state === k).length;
            const counters = show.includes('counts') ? `<div class="succ-wcount">${['recherche', 'trouves', 'remis', 'clos'].map(k => `<span><b>${count(k)}</b>${esc(stateLabel(k))}</span>`).join('')}</div>` : '';
            const open = r => (r.here ? `data-succ-open="${r.id}"` : `data-succ-waway="${esc(r.base.id)}:${r.id}"`);
            const dueTxt = r => (r.late ? `⏰ ${i18n('Échéance passée')}` : r.next_due ? fmtDate(r.next_due) : '');
            const pbar = p => `<span class="succ-pbar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(p) || 0))}%"></i></span><b>${p == null ? '…' : (Number(p) || 0) + ' %'}</b>`;
            let list = '';
            if (size === 's') list = `<ul class="succ-wlist is-small">${rows.filter(r => r.next_due || r.late).slice(0, limit).map(r => `<li><button type="button" class="succ-w-row" ${open(r)}>${r.late ? '⏰ ' : ''}${esc(r.number)} · ${esc(r.late ? i18n('{d} · passée', {d: fmtDate(r.next_due)}) : fmtDate(r.next_due))}${r.here ? '' : ' ↗'}</button></li>`).join('')}</ul>`;
            else if (show.includes('steps') && size === 'l') list = `<div class="succ-scroll"><table class="succ-table succ-wsteps"><thead><tr><th>${esc(i18n('Dossier'))}</th><th>${esc(i18n('Étapes (7)'))}</th><th>%</th><th>${esc(i18n('Échéance'))}</th><th>${esc(i18n('État'))}</th></tr></thead><tbody>${rows.map(r => `<tr><td><button type="button" class="table-link" ${open(r)}>${esc(caseShort(r))}${r.here ? '' : ' ↗'}</button></td>
                <td><span class="succ-steps7">${(r.steps || Array(7).fill(null)).map((s, k) => `<i class="${s == null ? '' : s.frac >= 1 ? 'is-done' : s.frac > 0 ? 'is-part' : ''}" title="${esc(s ? i18n('{step} : {done} sur {total}', {step: i18n(S().STEP_LABELS[k]), done: s.done, total: s.total}) : i18n(S().STEP_LABELS[k]))}"></i>`).join('')}</span></td>
                <td>${r.progress == null ? '…' : r.progress + ' %'}</td><td class="${r.late ? 'succ-late' : ''}">${esc(r.next_due ? (r.late ? i18n('{d} · passée', {d: fmtDate(r.next_due)}) : fmtDate(r.next_due)) : '—')}</td><td>${badge(stateLabel(r.state), stateKind(r.state))}</td></tr>`).join('')}</tbody></table></div>`;
            else list = `<ul class="succ-wlist">${rows.map(r => `<li><button type="button" class="succ-w-row" ${open(r)}><span>${esc(caseShort(r))}${r.here ? '' : ' ↗'}${dueTxt(r) ? ` · <small class="${r.late ? 'succ-late' : 'muted'}">${esc(dueTxt(r))}</small>` : ''}</span>${show.includes('bars') ? `<span class="succ-wbar">${pbar(r.progress)}</span>` : ''}</button></li>`).join('')}</ul>`;
            return A().card(i, title, all.filter(r => !['clos', 'archive'].includes(r.state)).length, counters + list, span, size === 's' ? '' : `<button type="button" class="button small secondary" data-succ-wall>${esc(i18n('Tout voir ↗'))}</button>`);
        },
    };
    ext.dashboardConfig.succ_widget = {
        html: w => {
            const c = wcfg(w), show = c.show || ['counts', 'bars'];
            const bases = (IDX.data?.bases || []).filter(b => b.cases.length), notaries = [...new Set((IDX.data?.bases || []).flatMap(b => b.cases.map(x => x.notary)).filter(Boolean))];
            return `<div class="succ-wcfg"><label>${esc(i18n('Quels dossiers'))}<select data-succw-which>${[['all', 'Tous'], ['open', 'En cours'], ['filter', 'Un filtre']].map(([k, l]) => `<option value="${k}"${c.which === k ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>
                <label>${esc(i18n('Le filtre'))}<select data-succw-filter>${[['late', 'Échéance passée'], ['recherche', 'En recherche'], ['remis', 'Remis au notaire'], ['base', 'Rangé dans'], ['notary', 'Notaire']].map(([k, l]) => `<option value="${k}"${c.filter === k ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>
                <label>${esc(i18n('Généalogie'))}<select data-succw-base>${bases.map(b => `<option value="${esc(b.id)}"${c.fbase === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
                <label>${esc(i18n('Notaire'))}<select data-succw-notary><option value=""></option>${notaries.map(n => `<option value="${esc(n)}"${c.fnotary === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
                <fieldset><legend>${esc(i18n('Montrer'))}</legend>${[['counts', 'Compteurs'], ['bars', 'Barres'], ['steps', 'Étapes']].map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-succw-show value="${k}"${show.includes(k) ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}</fieldset>
                <label>${esc(i18n('Trier par'))}<select data-succw-sort>${[['due', 'Prochaine échéance (retards d’abord)'], ['low', 'Avancement le plus bas'], ['recent', 'Les plus récents'], ['num', 'N° de dossier']].map(([k, l]) => `<option value="${k}"${c.sort === k ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label></div>`;
        },
        read: ed => ({succWhich: ed.querySelector('[data-succw-which]')?.value || 'open', succFilter: ed.querySelector('[data-succw-filter]')?.value || 'late', succBase: ed.querySelector('[data-succw-base]')?.value || '',
            succNotary: ed.querySelector('[data-succw-notary]')?.value || '', succShow: [...ed.querySelectorAll('[data-succw-show]:checked')].map(i => i.value), succSort: ed.querySelector('[data-succw-sort]')?.value || 'due'}),
    };
    document.addEventListener('click', e => { const a = e.target.closest?.('[data-succ-waway]'); if (!a) return; e.preventDefault(); const [g, id] = a.dataset.succWaway.split(':'); const b = (IDX.data?.bases || []).find(x => x.id === g); openElsewhere(g, b?.cases.find(x => x.id === Number(id))); });

    /* ═════ 7. 👤 Personnes : « Vue actuelle | ⚖️ Par dossier » ═════ */
    const VKEY = 'genealogie-succ-people-view';
    const pview = () => { const v = store.get(VKEY, {}) || {}; return {view: v.view === 'cases' ? 'cases' : 'list', order: v.order === 'hand' ? 'hand' : 'az', hand: Array.isArray(v.hand) ? v.hand.map(Number) : [], closed: Array.isArray(v.closed) ? v.closed.map(String) : null}; };
    const setPview = patch => store.set(VKEY, {...pview(), ...patch});
    let hasCases = null;
    const pvOn = () => active() && hasCases;
    ext.peopleList = {
        /** sous les onglets de la colonne de gauche : le sélecteur (seulement si la base a des dossiers) */
        sidebar: async content => {
            if (!active()) return;
            if (hasCases === null) { try { await index(); } catch (_) {} hasCases = localCases().length > 0; }
            if (!hasCases || !content.isConnected || content.querySelector('.succ-pv-seg')) return;
            const v = pview();
            const seg = document.createElement('div'); seg.className = 'segmented succ-pv-seg'; seg.setAttribute('role', 'tablist');
            seg.innerHTML = `<button type="button" data-succ-pv="list" class="${v.view === 'list' ? 'is-active' : ''}" aria-selected="${v.view === 'list'}">${esc(i18n('Vue actuelle'))}</button><button type="button" data-succ-pv="cases" class="${v.view === 'cases' ? 'is-active' : ''}" aria-selected="${v.view === 'cases'}">⚖️ ${esc(i18n('Par dossier'))}</button>`;
            const tabs = content.querySelector('[data-person-tab]')?.parentElement; if (tabs) tabs.after(seg); else content.prepend(seg);
            if (v.view === 'cases') { const list = document.getElementById('person-list'); if (list && !list.querySelector('.succ-pv')) ext.peopleList.render(list); }
        },
        active: () => pvOn() && pview().view === 'cases' && A()?.state?.personTab !== 'bookmarked' && A()?.state?.personTab !== 'animals',
        /** la liste, rangée par dossier (remplace la liste habituelle) */
        render: async list => {
            if (!list || !ext.peopleList.active()) return false;
            const q = A().state.peopleQuery || '';
            let d; try { d = await get('by_case', {q}); } catch (e) { list.innerHTML = UI().notice('error', e.message); return true; }
            if (!list.isConnected) return true;
            const v = pview(), fids = filterIds(), st = cfg();
            await settings();
            let cases = S().orderCases(d.cases.filter(c => c.state !== 'archive'), v);
            if (fids.length) cases = cases.filter(c => fids.includes(c.id));
            const closed = v.closed ?? ['none']; // « Sans dossier » replié au départ
            const cur = Number(A().state.currentPersonId);
            const mem = await membership();
            const person = (p, c) => { const n = (mem[String(p.id)] || []).length; return `<button type="button" class="person-list-item succ-pv-p${p.id === cur ? ' is-active' : ''}" data-person-id="${p.id}"><span class="life-dot ${esc(p.living_status)}"></span><span class="person-list-copy"><strong>${esc(p.name)}</strong><small>${p.role === 'deceased' ? `<span class="succ-pv-role">${esc(roleLabel('deceased'))}</span> ` : ''}${n > 1 ? `<span class="succ-pv-n" title="${esc(nDossiers(n))}">⚖️ ${n}</span> ` : ''}${esc(p.years)}</small></span></button>`; };
            const folder = (key, title, n, inner, {grip = false, isCase = true} = {}) => {
                const shut = closed.includes(key) || (q && !n);
                return `<div class="succ-pv${shut ? ' is-closed' : ''}${q && !n ? ' is-empty' : ''}" data-succ-pvf="${esc(key)}">
                    <div class="succ-pv-h">${grip && v.order === 'hand' ? `<span class="order-grip succ-pv-grip" draggable="true" aria-hidden="true">⠿</span>` : ''}<button type="button" class="succ-pv-t" data-succ-pvt="${esc(key)}" aria-expanded="${!shut}"${isCase ? ' title="' + esc(i18n('Alt + ↑ / ↓ : changer l’ordre (rangement à la main)')) + '"' : ''}>${shut ? '▸' : '▾'} ${esc(title)}</button><small class="succ-pv-c">${esc(num(n))}</small></div>
                    <div class="succ-pv-b"${shut ? ' hidden' : ''}>${inner}</div></div>`;
            };
            const html = cases.map(c => folder(String(c.id), `⚖️ ${c.number}${c.deceased ? ' ' + lastName(c.deceased) : ''}`, c.people.length, c.people.map(p => person(p, c)).join(''), {grip: true})).join('');
            const noFolder = !fids.length && st.nodossier !== 'hide' ? folder('none', i18n('Sans dossier'), d.without, `<div data-succ-pvnone></div>`, {isCase: false}) : '';
            list.innerHTML = `<div class="succ-pv-order"><span>${esc(i18n('Ranger les dossiers :'))}</span><span class="segmented"><button type="button" data-succ-pvo="az" class="${v.order === 'az' ? 'is-active' : ''}">${esc(i18n('A → Z'))}</button><button type="button" data-succ-pvo="hand" class="${v.order === 'hand' ? 'is-active' : ''}">${esc(i18n('À la main'))}</button></span></div>
                <div class="succ-pv-list" data-succ-pvlist>${html || `${window.LCNDA_APP.empty(i18n('Aucun dossier.'))}`}${noFolder}</div>`;
            if (noFolder && !closed.includes('none')) loadWithout(list);
            bindPv(list);
            return true;
        },
        /** la vue actuelle : « ⚖️ 2 » à côté des fiches de plusieurs dossiers */
        decorate: async list => {
            if (!active() || !list) return;
            const mem = await membership(); if (!list.isConnected) return;
            list.querySelectorAll('.person-list-item[data-person-id]').forEach(el => { const n = (mem[el.dataset.personId] || []).length; const small = el.querySelector('small'); if (n > 1 && small && !small.querySelector('.succ-pv-n')) small.insertAdjacentHTML('afterbegin', `<span class="succ-pv-n" title="${esc(nDossiers(n))}">⚖️ ${n}</span> `); });
        },
    };
    async function loadWithout(list) {
        const box = list.querySelector('[data-succ-pvnone]'); if (!box || box.dataset.loaded) return; box.dataset.loaded = '1';
        box.innerHTML = UI().spinner ? UI().spinner(i18n('Chargement…')) : '…';
        let r; try { r = await get('without', {q: A().state.peopleQuery || ''}); } catch (e) { box.innerHTML = UI().notice('error', e.message); return; }
        const cur = Number(A().state.currentPersonId);
        box.innerHTML = r.people.map(p => `<button type="button" class="person-list-item succ-pv-p${p.id === cur ? ' is-active' : ''}" data-person-id="${p.id}"><span class="life-dot ${esc(p.living_status)}"></span><span class="person-list-copy"><strong>${esc(p.name)}</strong></span></button>`).join('') + (r.more ? `<p class="muted succ-pv-more">${esc(i18n('… cherche un nom pour voir les autres.'))}</p>` : '');
    }
    let pvUndo = null;
    function bindPv(list) {
        if (list.dataset.succPvBound) return; list.dataset.succPvBound = '1';
        list.addEventListener('click', e => {
            const t = e.target;
            const o = t.closest('[data-succ-pvo]'); if (o) { setPview({order: o.dataset.succPvo}); return ext.peopleList.render(list); }
            const f = t.closest('[data-succ-pvt]');
            if (f) {
                const key = f.dataset.succPvt, v = pview(); const closed = new Set(v.closed ?? ['none']);
                const box = f.closest('.succ-pv'), shut = !box.classList.contains('is-closed');
                if (shut) closed.add(key); else closed.delete(key);
                setPview({closed: [...closed]});
                box.classList.toggle('is-closed', shut); box.querySelector('.succ-pv-b').hidden = shut; f.setAttribute('aria-expanded', String(!shut)); f.textContent = (shut ? '▸ ' : '▾ ') + f.textContent.replace(/^[▸▾]\s*/, '');
                if (!shut && key === 'none') loadWithout(list);
            }
        });
        const moveTo = (id, delta, focus = true) => {
            const v = pview(); const ids = [...list.querySelectorAll('[data-succ-pvf]')].map(x => x.dataset.succPvf).filter(k => k !== 'none').map(Number);
            const before = v.order === 'hand' && v.hand.length ? v.hand : ids;
            const next = S().moveCase(ids, id, delta); if (next.join() === ids.join()) return;
            setPview({order: 'hand', hand: next});
            ext.peopleList.render(list).then(() => { if (focus) list.querySelector(`[data-succ-pvt="${id}"]`)?.focus(); });
            pvUndo = before;
            A().undoToast(i18n('Ordre des dossiers changé'), {undo: async () => { setPview({hand: pvUndo}); await ext.peopleList.render(list); }});
        };
        list._succMove = moveTo;
        let drag = null;
        list.addEventListener('dragstart', e => { const g = e.target.closest?.('.succ-pv-grip'); if (!g) return; drag = Number(g.closest('[data-succ-pvf]').dataset.succPvf); try { e.dataTransfer.setData('text/plain', String(drag)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} });
        list.addEventListener('dragover', e => { if (drag != null && e.target.closest?.('[data-succ-pvf]')) e.preventDefault(); });
        list.addEventListener('drop', e => {
            const over = e.target.closest?.('[data-succ-pvf]'); if (drag == null || !over || over.dataset.succPvf === 'none') { drag = null; return; }
            e.preventDefault();
            const ids = [...list.querySelectorAll('[data-succ-pvf]')].map(x => x.dataset.succPvf).filter(k => k !== 'none').map(Number);
            const delta = ids.indexOf(Number(over.dataset.succPvf)) - ids.indexOf(drag); const id = drag; drag = null;
            if (delta) moveTo(id, delta, false);
        });
    }
    // Alt + ↑ / ↓ sur le dossier qui a le focus : avant les raccourcis de l'app (« Aller au père » est aussi Alt + ↑)
    window.addEventListener('keydown', e => {
        if (!e.altKey || e.metaKey || e.ctrlKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const f = e.target.closest?.('[data-succ-pvt]'); if (!f || f.dataset.succPvt === 'none') return;
        const list = f.closest('#person-list'); if (!list?._succMove) return;
        e.preventDefault(); e.stopPropagation();
        list._succMove(Number(f.dataset.succPvt), e.key === 'ArrowUp' ? -1 : 1);
    }, true);
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-succ-pv]'); if (!b) return;
        e.preventDefault(); setPview({view: b.dataset.succPv});
        b.parentElement.querySelectorAll('[data-succ-pv]').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
        const list = document.getElementById('person-list');
        if (b.dataset.succPv === 'cases') ext.peopleList.render(list); else A().loadPeople ? A().loadPeople() : A().renderSidebar?.();
    });

    /* ═════ Démarrage ═════ */
    const start = async () => {
        if (!A()?.state) return setTimeout(start, 200);
        watchWs();
        if (!btn()) {
            const meta = document.querySelector('.topbar-meta'), g = document.getElementById('genealogy-switch');
            if (meta) { meta.insertAdjacentHTML(g ? 'beforeend' : 'beforeend', `<button type="button" class="screen-tool succ-filter-btn" id="succ-filter-open" hidden aria-haspopup="true"><span aria-hidden="true">⚖️</span><span data-succ-flabel hidden></span></button>`); if (g) g.before(btn()); }
        }
        await paintButton();
        if (active()) {
            settings().catch(() => null);
            if (filterIds().length) { try { lastAuto = (await get('auto_recent', {after: 2147483647})).last || 0; } catch (_) { lastAuto = 0; } filterPeople().then(paintBanner); }
        } else if (store.get(FKEY, null)?.ids?.length && hidden()) { /* mode consultation ou simple : le filtre est retiré (ne s'applique pas) */ }
        runPending();
        // mode consultation, mode simple, usage : le bouton suit
        new MutationObserver(() => { paintButton(); paintBanner(); }).observe(document.body, {attributes: true, attributeFilter: ['class']});
        new MutationObserver(() => { paintButton(); paintBanner(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
        window.addEventListener('storage', e => { if (e.key === 'genealogie-usage' || e.key === FKEY) { paintButton(); paintBanner(); } });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
    ext.succDossiers.refresh = () => { invalidate(); hasCases = null; paintButton(); paintBanner(); };
    ext.succDossiers.beforeNew = beforeNew;
    ext.succDossiers.moveDialog = moveDialog;
    ext.succDossiers.openElsewhere = openElsewhere; // 🔔 la cloche : ↗ un dossier d'une autre généalogie (heritage-successoral-outils.js)
})();
