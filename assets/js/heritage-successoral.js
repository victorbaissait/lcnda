/* LCNDA — ⚖️ Généalogiste successoral (maquette docs/design/successoral-et-plus.html, écrans 1 à 8).
 * Où : onglet « ⚖️ Successions » (usage « ⚖️ Généalogiste successoral », Réglages → Apparence → 🧭 Usage de l'app),
 *      Listes → 🔎 Recherche et organisation → « ⚖️ Dossiers de succession » (après les Cousinades),
 *      fiche d'une personne décédée ⋯ → « ⚖️ Rechercher les héritiers… », widget « ⚖️ Dossiers de succession »,
 *      échéances dans « 🗓 Ma semaine de recherche », colonnes « Réponse » et « Signé le » du Registre de courriers,
 *      modèles « ⚖️ Contrat de révélation » et « ⚖️ Lettre à un héritier » du traitement de texte (usage successoral seulement).
 * Un dossier par défunt (barre H10, vignettes K9) : 📁 Dossier · 👥 Héritiers · 🌳 Arbre · 📑 Pièces · ✉️ Héritiers contactés ·
 *      🖨 Pour le notaire · 🕓 Journal · 💶 Temps et frais.
 * Calcul : heritage-successoral-core.js (window.LCNDA_SUCC_CORE), indicatif, à faire vérifier par le notaire ; chaque article
 * cité ouvre le texte sur Légifrance. Serveur : lib/successoral.php (GET successoral, POST successoral_write).
 * Confidentialité : rien en mode consultation ni en mode simple ; aucun export ne lit les dossiers.
 * 🔎 Introuvable / 🔇 Ne répond pas (l'« absent » au sens pratique, pas la présomption d'absence) : un petit menu par héritier
 *      dans 👥 Héritiers et « Héritiers à contacter » (succ_case_persons.contact_state, migration 92), message avec ↶ Annuler,
 *      ligne au journal ; introuvable depuis plus d'un an → suggestion « ❔ Absent ou disparu ». Fiches confidentielles non
 *      comptées (réglage) : avertissement dans 👥 Héritiers.
 * ⚖️ « Un doute sur la loi ? » (en-tête de la page, « ⚖️ Un doute ? » dans un dossier, et en mode consultation) : la question
 *      tapée part telle quelle sur Service-public ou Légifrance, dans le navigateur ; l'app ne choisit aucun article.
 *      « ✍️ Noter dans le dossier » (op « law_note ») : question + lien officiel facultatif au journal (tests/test-successoral-loi.js).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP, S = () => window.LCNDA_SUCC_CORE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['lists', 'dashboard']) ext[k] = ext[k] || {};
    for (const k of ['personMoreItems', 'afterCourriers']) ext[k] = ext[k] || [];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const plural = (n, w, many) => (A()?.plural ? A().plural(n, w, many) : `${n} ${w}`);
    const LIST = 'successoral';
    const get = (op, q = {}) => A().api('successoral', {op, ...q});
    const post = async body => { const r = await A().api('successoral_write', {}, {method: 'POST', body}); try { window.dispatchEvent(new CustomEvent('lcnda:succ-changed', {detail: {op: body?.op}})); } catch (_) {} return r.result || r; }; // 🔔 la cloche se relit après chaque changement
    const OUT = () => ext.succOutils || {}, OC = () => window.LCNDA_SUCC_OUTILS; // ⏱ 🔔 📋 📊 heritage-successoral-outils.js, ✉️ 🧾 heritage-successoral-outils-core.js
    const toast = (...a) => A().toast(...a);
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const simple = () => document.documentElement.classList.contains('ms-open');
    const hidden = () => kiosk() || simple();
    const store = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const usageOn = () => { const c = store.get('genealogie-usage', null); return Array.isArray(c?.usages) && c.usages.includes('successoral'); };
    const law = html => S().lawLinks(html); // chaque « art. 738 » devient un lien vers Légifrance
    const tx = (s, v) => law(esc(i18n(s, v)));
    const fmtDate = iso => { if (!iso) return ''; const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(iso); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); try { return (window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(d, {day: 'numeric', month: 'short', year: 'numeric'}) : d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'})); } catch (_) { return iso; } };
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const daysTo = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null; const a = Date.UTC(+m[1], +m[2] - 1, +m[3]), t = new Date(); return Math.round((a - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); };
    const pctTxt = n => (window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(n, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : Number(n).toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})) + ' %';
    const STATES = [['ouvert', 'Ouvert'], ['recherche', 'En recherche'], ['trouves', 'Héritiers trouvés'], ['remis', 'Remis au notaire'], ['clos', 'Clos']];
    const stateLabel = s => i18n((STATES.find(x => x[0] === s) || [0, s === 'archive' ? 'Archivé' : s])[1]);
    const stateKind = s => ({ouvert: 'grey', recherche: 'blue', trouves: 'green', remis: 'violet', clos: 'grey', archive: 'grey'}[s] || 'grey');
    const TABS = [['dossier', '📁 Dossier'], ['heirs', '👥 Héritiers'], ['people', '🧑‍🤝‍🧑 Personnes'], ['tree', '🌳 Arbre'], ['pieces', '📑 Pièces'], ['contacts', '✉️ Héritiers contactés'], ['notary', '🖨 Pour le notaire'], ['journal', '🕓 Journal'], ['fees', '💶 Temps et frais']];
    const NOTICE = {info: 'ℹ️', warn: '⚠️', error: '⛔', ok: '✓'};
    /** un message K8 dont le texte contient des liens (les articles de loi) : déjà échappé */
    const noticeHtml = (k, html) => `<div class="ui-notice ui-notice-${k}" role="${k === 'error' ? 'alert' : 'status'}"><span class="ui-notice-ico" aria-hidden="true">${NOTICE[k]}</span><span>${html}</span></div>`;
    const badge = (t, k = 'grey') => (UI()?.badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const nameOf = (D, id) => S().name(D.graph.persons[id]);
    /* ── 🔎 Introuvable / 🔇 Ne répond pas : l'état de contact d'un héritier dans un dossier ── */
    const CONTACT = {introuvable: ['🔎', 'Introuvable', 'introuvable', 'yellow'], silence: ['🔇', 'Ne répond pas', 'ne répond pas', 'grey']};
    const contactWord = st => (CONTACT[st] ? i18n(CONTACT[st][2]) : i18n('rien de noté'));
    /** le badge (« 🔎 introuvable », depuis le …) ; '' sans état */
    const contactBadge = c => { const x = CONTACT[c?.state]; if (!x) return ''; const title = c.at ? i18n('depuis le {d}', {d: fmtDate(c.at)}) : ''; return UI()?.badge ? UI().badge(`${x[0]} ${i18n(x[2])}`, x[3], {title}) : `<span class="ui-badge is-${x[3]}" title="${esc(title)}">${esc(`${x[0]} ${i18n(x[2])}`)}</span>`; };
    /** le petit menu : — / 🔎 Introuvable / 🔇 Ne répond pas */
    const contactSelect = (caseId, pid, st) => `<select class="succ-cst" data-succ-cst="${Number(caseId)}:${Number(pid)}" aria-label="${esc(i18n('Contact'))}"><option value="">—</option>${Object.entries(CONTACT).map(([k, x]) => `<option value="${k}"${st === k ? ' selected' : ''}>${x[0]} ${esc(i18n(x[1]))}</option>`).join('')}</select>`;
    /** un héritier qu'on cherche à joindre : il a une part et il vit (ou on ne sait pas) */
    const reachable = r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0' && (r.unknown || ['surv', 'abs'].includes(r.timing));

    /* ═════ La liste (Listes → Recherche et organisation) et l'onglet ═════ */
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '33b', '⚖️ Dossiers de succession']);
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'succ_widget')) { app.defaultDashboardBlocks.push(['succ_widget', '⚖️ Mes dossiers de succession']); /* même clé : le widget d'avant devient la vue d'ensemble (heritage-successoral-dossiers.js) */ if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.succ_widget = '6'; }
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg, {once: true});
    const prevShown = ext.listShown;
    ext.listShown = k => (k === LIST ? !hidden() : prevShown ? prevShown(k) : true);

    const VIEWS = [['cases', 'Dossiers'], ['heirs', 'Héritiers à contacter'], ['mail', 'Courriers']]; // le sélecteur en haut de la liste (retenu : « lcnda-succ-view »)
    let cur = {id: 0, data: null, R: null, tab: store.get('lcnda-succ-tab', 'dossier'), where: 'list', pieceView: 'heir', view: store.get('lcnda-succ-view', 'cases')};
    const ws = () => document.getElementById('workspace');
    const sameTurn = token => token === undefined || !A().state || token === A().state.workspaceToken;
    /** ouvrir un dossier (0 = la liste), dans l'onglet ⚖️ Successions s'il est montré, sinon dans Listes */
    function openCase(id = 0, tab = '') {
        cur.id = Number(id) || 0; cur.data = null; cur.R = null; if (tab) cur.tab = tab;
        OUT().forget?.(cur.id); // 📊 l'actif net tapé est effacé quand on quitte le dossier
        const st = A().state, nav = document.querySelector('.main-nav .nav-item[data-module="successoral"]:not([data-board])');
        if (st.module === 'successoral' || (nav && nav.style.display !== 'none' && st.module !== 'listes')) { if (st.module === 'successoral') render(); else A().setModule('successoral'); return; }
        st.listType = LIST; if (st.module === 'listes') { A().renderSidebar?.(); ext.lists[LIST](); } else A().setModule('listes');
    }
    ext.lists[LIST] = (token = A().state?.workspaceToken) => { cur.where = 'list'; return render(token); };
    ext.successoral = {render: token => { cur.where = 'tab'; return render(token); }, openCase, openFor, lawDialog: D => lawDialog(D), compute: computeCase, S: () => S(),
        // pour heritage-successoral-dossiers.js : le dossier ouvert, ＋ Ouvrir un dossier, l'arbre et le tableau du notaire (archive en fichier)
        newCase: (pid = 0) => caseDialog(null, pid), current: () => cur.data, currentR: () => cur.R, reload: () => reload(),
        forget: () => { cur.data = null; cur.R = null; }, // un réglage a changé (fiches confidentielles) : relire le dossier à la prochaine ouverture
        treeSvg: (D, R) => treeSvg(D, R, {print: true}), notaryHtml: (D, R, addresses = false) => notaryHtml(D, R, piecesOf(D, R), {addresses})};

    async function render(token) {
        const w = ws(); if (!w) return;
        if (hidden()) { w.innerHTML = `<section class="page">${UI().notice('info', i18n('Les dossiers de succession ne se montrent pas en mode consultation ni en mode simple.'))}<p>${LAW_BTN()}</p></section>`; return; } // ⚖️ la recherche reste : ce n'est qu'un lien
        if (cur.id) return renderCase(w, token);
        const where = cur.where === 'tab' ? i18n('Successions') : i18n('Listes · Recherche et organisation');
        if (!VIEWS.some(v => v[0] === cur.view)) cur.view = 'cases';
        w.innerHTML = `<section class="page succ-page">${UI().pageHeader({title: i18n('Dossiers de succession'), icon: '⚖️', where,
            help: i18n('Retrouver les héritiers d’une personne décédée, pour un notaire : un dossier par défunt. À ne pas confondre avec « 🏠 Héritages et successions » (les actes anciens des ancêtres).'),
            actions: [LAW_BTN(), `<button type="button" class="button" data-succ-new>${esc(i18n('＋ Ouvrir un dossier'))}</button>`], more: [...(ext.succDossiers?.boardMore?.() || []), `<button type="button" data-succ-b8all>📜 ${esc(i18n('Qui a vu quoi'))}</button>`]})}
            <div class="segmented succ-views" role="tablist" aria-label="${esc(i18n('Que montrer'))}">${VIEWS.map(([k, l]) => `<button type="button" role="tab" data-succ-view="${k}" class="${cur.view === k ? 'is-active' : ''}" aria-selected="${cur.view === k}">${esc(i18n(l))}</button>`).join('')}</div>
            <div data-succ-body>${UI().spinner(i18n(cur.view === 'heirs' ? 'Lecture des héritiers…' : cur.view === 'mail' ? 'Lecture des courriers…' : 'Lecture des dossiers…'))}</div></section>`;
        const body = w.querySelector('[data-succ-body]');
        if (cur.view === 'heirs') return heirsBoard(body, token);
        if (cur.view === 'mail') return mailBoard(body, token);
        if (ext.succDossiers?.board) return ext.succDossiers.board(body, token); // 4. le tableau de bord des dossiers (toutes les généalogies)
        let d; try { d = await get('list'); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        if (!sameTurn(token)) return;
        const rows = d.items || [];
        if (!rows.length) { body.innerHTML = A().emptyState({icon: '⚖️', text: i18n('Aucun dossier de succession pour l’instant'), hint: i18n('Choisis la personne décédée : l’app part des fiches de la base pour trouver ses héritiers, selon le Code civil d’aujourd’hui.'), action: {label: i18n('＋ Ouvrir un dossier'), attrs: 'data-succ-new'}}); return; }
        const bar = UI().listBar({key: 'listes:successoral', search: {placeholder: i18n('Chercher… (ex. MAZAUD, 2026-014, ROUSSILHE)')}, view: {dflt: 'cards', what: 'fiches'},
            filters: [{id: 'state', label: i18n('État'), type: 'check', options: [...STATES, ['archive', 'Archivé']].map(([v, l]) => [v, i18n(l)])}],
            sort: {options: [['recent', i18n('Les plus récents')], ['due', i18n('Prochaine échéance')], ['old', i18n('Les plus anciens')], ['az', i18n('A → Z')]], value: 'recent'}, onChange: st => draw(st)});
        body.innerHTML = '<div data-succ-items></div>'; body.prepend(bar);
        const M = UI().listMatch;
        function draw(st = bar.state) {
            let list = rows.filter(r => M.text(st.q, r.title, r.number, r.deceased, r.notary, r.notary_ref, r.place) && (!st.filters.state?.length || st.filters.state.includes(r.state)));
            list = st.sort === 'due' ? [...list].sort((a, b) => String(a.next_due || '9999').localeCompare(String(b.next_due || '9999'))) : st.sort === 'az' ? UI().sortItems(list, 'az', {name: r => r.deceased}) : UI().sortItems(list, st.sort === 'old' ? 'old' : 'recent');
            bar.setCount(list.length, 'dossier de succession', 'dossiers de succession');
            body.querySelector('[data-succ-items]').innerHTML = list.length ? UI().itemsHtml(st.view, list.map(r => ({
                thumb: '<span class="ui-card-ico" aria-hidden="true">⚖️</span>', name: r.deceased ? `${r.deceased}${r.years ? ` (${r.years})` : ''}` : r.title, open: `data-succ-open="${r.id}"`, attrs: `data-succ-row="${r.id}"`,
                lines: [i18n('Dossier n° {n}', {n: r.number}) + (r.notary ? ' · ' + r.notary : '') + (r.notary_ref ? ' · ' + r.notary_ref : ''), r.next_due ? i18n('Prochaine échéance : {d} — {l}', {d: fmtDate(r.next_due), l: r.next_label}) : [r.death, r.place].filter(Boolean).join(' · ')],
                badges: [{text: stateLabel(r.state), kind: stateKind(r.state)}, r.heirs ? {text: plural(r.heirs, 'héritier'), kind: 'blue'} : null, r.unknown ? {text: i18n('{n} à chercher', {n: r.unknown}), kind: 'yellow'} : null, r.late ? {text: i18n('Échéance passée'), kind: 'red'} : null].filter(Boolean),
                when: r.updated_at, whenLabel: i18n('Modifié'),
                menu: [`<button type="button" data-succ-edit="${r.id}">${esc(i18n('✎ Modifier'))}</button>`, `<button type="button" class="danger" data-succ-del="${r.id}">${esc(i18n('🗑 Supprimer'))}</button>`]}))) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">${esc(i18n('Aucun dossier ne correspond.'))}</span></p>`;
        }
        draw();
    }

    /* ═════ 👥 Héritiers à contacter : les héritiers vivants (ou au statut inconnu) de tous les dossiers en cours ═════ */
    const CSTATE = [['none', 'Aucun courrier', 'grey'], ['sent', 'Courrier envoyé', 'blue'], ['answer', 'Réponse', 'violet'], ['signed', 'Signé', 'green']];
    const fullLink = list => `<p class="succ-full"><button type="button" class="link-button" data-succ-full="${list}">${esc(i18n('Voir toute la liste ↗'))}</button> <small class="muted">${esc(i18n(list === 'courriers' ? 'Registre de courriers' : 'Répertoire des vivants'))}</small></p>`;
    let board = {cases: new Map()};
    /** l'état du contact d'un héritier dans un dossier, d'après les courriers liés */
    function contactState(D, pid) {
        const cs = (D.courriers || []).filter(c => c.person_id === pid && c.kind !== 'acte');
        const signed = cs.find(c => c.signe_le), answered = cs.find(c => c.reponse && c.reponse !== 'none');
        if (signed) return {k: 'signed', text: i18n('Signé le {d}', {d: fmtDate(signed.signe_le)})};
        if (answered) return {k: 'answer', text: i18n('Réponse : {r}', {r: i18n((ANSWER.find(a => a[0] === answered.reponse) || ANSWER[0])[1])})};
        if (cs.length) return {k: 'sent', text: i18n('Courrier envoyé le {d}', {d: fmtDate(cs[0].date_envoi)})};
        return {k: 'none', text: i18n('Aucun courrier')};
    }
    async function heirsBoard(body, token) {
        let d; try { d = await get('list'); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        const open = (d.items || []).filter(r => !['clos', 'archive'].includes(r.state));
        const loaded = await Promise.all(open.map(r => get('get', {id: r.id}).catch(() => null)));
        if (!sameTurn(token) || !body.isConnected) return;
        board = {cases: new Map()};
        const rows = [];
        for (const D of loaded) {
            if (!D || D.archived || !D.deceased_id) continue;
            const R = computeCase(D); if (!R || R.error) continue;
            board.cases.set(D.id, {D, R});
            for (const r of heirsToContact(R)) {
                const t = r.unknown ? 'unknown' : r.timing;
                if (!['surv', 'unknown', 'abs'].includes(t)) continue; // vivants, ou statut inconnu (pas les morts après le défunt : leur part va à leurs propres héritiers)
                const a = D.addresses?.[r.id] || null, st = contactState(D, r.id);
                rows.push({key: `${D.id}:${r.id}`, caseId: D.id, number: D.number, deceased: D.deceased || '', pid: r.id, name: r.name, kin: r.kin, share: r.share, unknown: !!r.unknown,
                    address: a ? (a.lines || []).join(', ') : '', email: a?.email || '', phone: a?.phone || '', contactId: a?.contact_id || 0, state: st.k, stateText: st.text, contact: S().contactOf(D, r.id)});
            }
        }
        if (!rows.length) { body.innerHTML = A().emptyState({icon: '👥', text: i18n('Aucun héritier à contacter dans les dossiers en cours.'), hint: i18n('Les héritiers vivants (ou au statut inconnu) des dossiers ouverts viennent ici, avec leur adresse et l’état du contact.')}) + fullLink('living_contacts'); return; }
        const cases = [...new Map(rows.map(r => [r.caseId, r.number])).entries()];
        const bar = UI().listBar({key: 'succ:heirs', search: {placeholder: i18n('Chercher… (nom, dossier, ville)')}, view: {dflt: 'list', what: 'fiches'},
            filters: [{id: 'case', label: i18n('Dossier'), type: 'select', options: [['', i18n('Tous les dossiers')], ...cases.map(([id, n]) => [String(id), i18n('Dossier {n}', {n})])]},
                {id: 'state', label: i18n('État du contact'), type: 'check', options: CSTATE.map(([v, l]) => [v, i18n(l)])},
                {id: 'reach', label: i18n('Introuvable ou silencieux'), type: 'check', options: Object.entries(CONTACT).map(([k, x]) => [k, `${x[0]} ${i18n(x[1])}`])}],
            sort: {options: [['case', i18n('Par dossier')], ['todo', i18n('À contacter d’abord')], ['az', i18n('A → Z')]], value: 'case'}, onChange: st => draw(st)});
        body.innerHTML = `<div data-succ-items></div><p class="succ-csv"><button type="button" class="button small secondary" data-succ-hcsv>${esc(i18n('⤓ Exporter en CSV'))}</button></p>${fullLink('living_contacts')}`; body.prepend(bar);
        const M = UI().listMatch;
        let shown = rows;
        function draw(st = bar.state) {
            let list = rows.filter(r => M.text(st.q, r.name, r.number, r.deceased, r.address, r.email, r.kin) && (!st.filters.case || String(r.caseId) === String(st.filters.case)) && (!st.filters.state?.length || st.filters.state.includes(r.state)) && (!st.filters.reach?.length || st.filters.reach.includes(r.contact.state)));
            const rank = r => CSTATE.findIndex(c => c[0] === r.state);
            list = st.sort === 'az' ? UI().sortItems(list, 'az', {name: r => r.name}) : st.sort === 'todo' ? [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr')) : [...list].sort((a, b) => String(b.number).localeCompare(String(a.number), 'fr', {numeric: true}) || a.name.localeCompare(b.name, 'fr'));
            shown = list;
            bar.setCount(list.length, 'héritier', 'héritiers');
            const write = r => (r.unknown ? '' : `<button type="button" class="button small secondary" data-succ-hwrite="${r.key}">${esc(i18n('✉️ Écrire'))}</button>`);
            const addr = r => `<button type="button" class="button small secondary" data-succ-haddr="${r.key}">${esc(i18n('📇 Compléter l’adresse'))}</button>`;
            const stale = r => (S().contactStale(r.contact) ? ` <button type="button" class="link-button succ-cstale-b" data-succ-habsent="${r.key}" title="${esc(i18n('Introuvable depuis plus d’un an'))}">${esc(i18n('❔ Absent ou disparu'))}</button>` : '');
            body.querySelector('[data-succ-items]').innerHTML = list.length ? UI().itemsHtml(st.view, list.map(r => ({
                thumb: '<span class="ui-card-ico" aria-hidden="true">👤</span>', name: r.name, open: `data-h-person="${r.pid}"`, attrs: `data-succ-hrow="${r.key}" data-succ-cstate="${r.contact.state}"`,
                lines: [{html: `${st.view === 'cards' ? '' : contactBadge(r.contact) + (r.contact.state ? ' ' : '')}<button type="button" class="table-link" data-succ-open="${r.caseId}">${esc(i18n('Dossier {n}', {n: r.number}))}</button>${r.deceased ? ` (${esc(r.deceased)})` : ''} · ${esc(r.kin)}${r.share && r.share !== '0' ? ` · ${esc(i18n('Part'))} ${esc(r.share)}` : ''}`},
                    {html: [r.address ? esc(r.address) : `<span class="succ-noaddr">${esc(i18n('adresse à trouver'))}</span>`, r.email ? `<a class="table-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '', r.phone ? esc(r.phone) : ''].filter(Boolean).join(' · ')}],
                badges: [{text: r.stateText, kind: (CSTATE.find(c => c[0] === r.state) || CSTATE[0])[2]}, r.unknown ? {text: i18n('Inconnu'), kind: 'yellow'} : null, contactBadge(r.contact) || null].filter(Boolean),
                date: st.view === 'cards' ? '' : r.stateText,
                actions: st.view === 'cards' ? '' : contactSelect(r.caseId, r.pid, r.contact.state) + stale(r) + ' ' + write(r) + ' ' + addr(r), quick: st.view === 'cards' ? contactSelect(r.caseId, r.pid, r.contact.state) + stale(r) + write(r) : '', menu: st.view === 'cards' ? [addr(r)] : []}))) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">${esc(i18n('Aucun héritier ne correspond.'))}</span></p>`;
        }
        draw();
        body.querySelector('[data-succ-hcsv]').addEventListener('click', () => {
            const cell = v => (A().csvCell ? A().csvCell(v, {sep: ';'}) : `"${String(v ?? '').replace(/"/g, '""')}"`);
            const head = ['Héritier', 'Dossier', 'Défunt', 'Lien avec le défunt', 'Part', 'Adresse', 'Courriel', 'Téléphone', 'État du contact'].map(h => cell(i18n(h)));
            const csv = '﻿' + [head.join(';'), ...shown.map(r => [r.name, r.number, r.deceased, r.kin, r.share, r.address || i18n('adresse à trouver'), r.email, r.phone, r.stateText + (r.contact.state ? ' · ' + contactWord(r.contact.state) : '')].map(cell).join(';'))].join('\r\n');
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = 'heritiers-a-contacter.csv'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            toast(i18n('Héritiers à contacter exportés (CSV)'));
            for (const id of new Set(shown.map(r => r.caseId))) { const c = board.cases.get(id); if (c) journal(c.D, 'export', i18n('Héritiers à contacter exportés (CSV)')); }
        });
    }
    /** 📇 Compléter l'adresse : la fiche du Répertoire des vivants (ou un nouveau contact relié à la fiche de l'héritier) */
    async function openLiving(contactId, pid, name) {
        A().state.listType = 'living_contacts'; await A().setModule('listes');
        for (let i = 0; i < 50; i++) {
            const b = contactId ? document.querySelector(`[data-edit-living-contact="${contactId}"]`) : document.getElementById('add-living-contact');
            if (b) {
                b.click();
                const f = document.getElementById('living-contact-form');
                if (!contactId && f) { const parts = String(name || '').trim().split(/\s+/); const last = parts.filter(x => x === x.toUpperCase() && /\p{L}/u.test(x)); const first = parts.filter(x => !last.includes(x)); f.elements.first_name.value = first.join(' '); f.elements.last_name.value = last.join(' '); if (f.elements.person_id) f.elements.person_id.value = String(pid); if (f.elements.linked_person_search) f.elements.linked_person_search.value = name || ''; const sel = f.querySelector('#living-contact-person-selected'); if (sel) sel.textContent = i18n('Fiche liée : {name}.', {name}); }
                f?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
                return;
            }
            await new Promise(r => setTimeout(r, 120));
        }
        toast(i18n('Répertoire des vivants : « ＋ Contact », puis relie la fiche de l’héritier.'));
    }

    /* ═════ 📮 Courriers : seulement ceux des dossiers de succession ═════ */
    const KIND = {contact: 'Premier contact', contrat: 'Contrat de révélation', relance: 'Relance', etranger: 'Héritier à l’étranger', acte: 'Demande d’acte'};
    const kindLabel = k => i18n(KIND[k] || 'Demande d’acte');
    let mailRows = [];
    async function mailBoard(body, token) {
        let d; try { d = await get('courriers'); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        if (!sameTurn(token) || !body.isConnected) return;
        mailRows = d.items || [];
        if (!mailRows.length) { body.innerHTML = A().emptyState({icon: '📮', text: i18n('Aucun courrier de succession pour l’instant.'), hint: i18n('Les courriers écrits depuis un dossier (✉️ Héritiers contactés, 📑 Pièces) viennent ici.')}) + fullLink('courriers'); return; }
        const cases = [...new Map(mailRows.map(r => [r.case_id, r.number])).entries()];
        const statuts = (A().courrierStatuts || [['envoye', 'Envoyé'], ['en_attente', 'En attente'], ['reponse_recue', 'Réponse reçue']]);
        const bar = UI().listBar({key: 'succ:mail', search: {placeholder: i18n('Chercher… (destinataire, dossier)')},
            filters: [{id: 'case', label: i18n('Dossier'), type: 'select', options: [['', i18n('Tous les dossiers')], ...cases.map(([id, n]) => [String(id), i18n('Dossier {n}', {n})])]},
                {id: 'rep', label: i18n('Réponse'), type: 'check', options: ANSWER.map(([v, l]) => [v || 'nil', v ? i18n(l) : i18n('Pas encore')])},
                {id: 'statut', label: i18n('État'), type: 'check', options: statuts.map(([v, l]) => [v, i18n(l)])}],
            sort: {options: [['recent', i18n('Les plus récents')], ['old', i18n('Les plus anciens')], ['az', i18n('A → Z')]], value: 'recent'}, onChange: st => draw(st)});
        body.innerHTML = `<div class="succ-scroll"><table class="succ-table succ-mail"><thead><tr><th>${esc(i18n('Dossier'))}</th><th>${esc(i18n('Destinataire'))}</th><th>${esc(i18n('Sorte'))}</th><th>${esc(i18n('Date'))}</th><th>${esc(i18n('Réponse'))}</th><th>${esc(i18n('Signé le'))}</th><th></th></tr></thead><tbody data-succ-mrows></tbody></table></div><p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le tableau.'))}</p>${fullLink('courriers')}`;
        body.prepend(bar);
        const M = UI().listMatch;
        function draw(st = bar.state) {
            let list = mailRows.filter(r => M.text(st.q, r.destinataire, r.number, r.objet, r.title) && (!st.filters.case || String(r.case_id) === String(st.filters.case)) && (!st.filters.rep?.length || st.filters.rep.includes(r.reponse || 'nil')) && (!st.filters.statut?.length || st.filters.statut.includes(r.statut)));
            list = st.sort === 'az' ? UI().sortItems(list, 'az', {name: r => r.destinataire}) : UI().sortItems(list, st.sort === 'old' ? 'old' : 'recent', {date: r => `${r.date_envoi} ${String(r.id).padStart(9, '0')}`});
            bar.setCount(list.length, 'courrier', 'courriers');
            body.querySelector('[data-succ-mrows]').innerHTML = list.length ? list.map(r => `<tr data-succ-mrow="${r.id}"><td><button type="button" class="table-link" data-succ-open="${r.case_id}">${esc(r.number)}</button></td>
                <td>${r.person_id ? `<button type="button" class="table-link" data-h-person="${r.person_id}">${esc(r.destinataire)}</button>` : esc(r.destinataire || '—')}</td><td>${esc(kindLabel(r.kind))}</td><td>${esc(fmtDate(r.date_envoi) || '—')}</td>
                <td>${r.reponse ? esc(i18n((ANSWER.find(a => a[0] === r.reponse) || ANSWER[0])[1])) : '—'}</td><td>${r.signe_le ? esc(fmtDate(r.signe_le)) : '—'}</td>
                <td class="succ-mact"><button type="button" class="button small secondary" data-succ-mopen="${r.id}">${esc(i18n('Ouvrir'))}</button> <button type="button" class="button small secondary danger" data-succ-mdel="${r.id}">${esc(i18n('🗑 Supprimer'))}</button></td></tr>`).join('')
                : `<tr><td colspan="7">${esc(i18n('Aucun courrier ne correspond.'))}</td></tr>`;
        }
        draw();
    }
    /** ouvrir un courrier de succession : la lettre, la réponse et la signature */
    function mailDialog(r) {
        const ro = r.case_state === 'archive';
        return ext.openDialog({eyebrow: i18n('📮 COURRIER DE SUCCESSION'), title: r.objet || kindLabel(r.kind), wide: true, submitLabel: ro ? 'Fermer' : i18n('Enregistrer'),
            body: `<div class="succ-form"><p>${esc(i18n('Dossier {n}', {n: r.number}))} · ${esc(r.destinataire || '—')} · ${esc(kindLabel(r.kind))} · ${esc(fmtDate(r.date_envoi) || '—')}${r.relance_date ? ` · ${esc(i18n('Relance'))} ${esc(fmtDate(r.relance_date))}` : ''}</p>
                <div class="succ-2"><label>${esc(i18n('Réponse'))}<select name="reponse" ${ro ? 'disabled' : ''}>${ANSWER.map(([v, l]) => `<option value="${v}"${r.reponse === v ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>
                <label>${esc(i18n('Signé le'))}<input type="date" name="signe_le" value="${esc(r.signe_le || '')}" ${ro || r.kind === 'acte' ? 'disabled' : ''}></label></div>
                ${r.letter ? `<label>${esc(i18n('La lettre'))}<textarea rows="12" readonly class="cl-letter">${esc(r.letter)}</textarea></label>` : ''}
                <div class="cl-out">${r.letter ? `<button type="button" class="button small secondary" data-succ-mprint>${esc(i18n('🖨 Imprimer'))}</button>` : ''}<button type="button" class="button small secondary" data-succ-full="courriers">${esc(i18n('↗ Registre de courriers'))}</button></div></div>`,
            onOpen: d => d.querySelector('[data-succ-mprint]')?.addEventListener('click', () => UI().openPrintDialog({title: r.objet || kindLabel(r.kind), key: 'courrier', paper: 'A4', orientation: 'portrait', photos: false, html: `<section data-k-page style="font:11pt/1.5 Georgia,serif;white-space:pre-wrap">${esc(r.letter)}</section>`})),
            onSubmit: ro ? () => {} : async form => {
                const body = {}; if (form.reponse.value !== (r.reponse || '')) body.reponse = form.reponse.value; if (!form.signe_le.disabled && form.signe_le.value !== (r.signe_le || '')) body.signe_le = form.signe_le.value;
                if (!Object.keys(body).length) return;
                let res; try { res = await post({op: 'courrier_set', courrier_id: r.id, ...body}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('Courrier mis à jour'), {undo: async () => { await post({op: 'courrier_set', courrier_id: r.id, undo: 1, ...res.prev}); render(); }});
                render();
            }});
    }

    /* ═════ ＋ Ouvrir un dossier / ✎ Modifier (fenêtre K6) ═════ */
    function caseDialog(data = null, deceased = 0) {
        if (hidden()) return toast(i18n('Pas en mode consultation ni en mode simple.'));
        const d = data || {};
        const notaryVal = d.notary_person_id ? d.notary_person_id : d.notary_text ? `txt:${d.notary_text}` : null;
        return ext.openDialog({eyebrow: i18n('⚖️ DOSSIER DE SUCCESSION'), title: data ? i18n('Modifier le dossier') : i18n('Ouvrir un dossier'), wide: true, submitLabel: data ? i18n('Enregistrer') : i18n('Ouvrir le dossier'),
            body: `<div class="succ-form">${data ? '' : ext.succCaseDialogExtra?.() || ''}
                <div class="succ-2"><div><span class="pk-lab">${esc(i18n('La personne décédée'))}</span>${P().pickerField({name: 'deceased_id', kind: 'person', animals: false, value: d.deceased_id || deceased || null})}</div>
                <label>${esc(i18n('N° de dossier'))}<input name="number" maxlength="40" value="${esc(d.number || '')}" placeholder="${esc(i18n('fait tout seul : 2026-014'))}"></label></div>
                <div class="succ-2"><label>${esc(i18n('Date du décès'))}<input name="death_date_text" maxlength="120" value="${esc(d.death_date_text || '')}" placeholder="${esc(i18n('reprise de la fiche'))}"></label>
                <div><span class="pk-lab">${esc(i18n('Lieu du décès'))}</span>${P().pickerField({name: 'death_place_id', kind: 'place', value: d.death_place_id || null})}</div></div>
                <label>${esc(i18n('Dernier domicile'))}<input name="last_address" maxlength="400" value="${esc(d.last_address || '')}"></label>
                <div class="succ-2"><div><span class="pk-lab">${esc(i18n('Notaire mandant (fiche ou nom)'))}</span>${P().pickerField({name: 'notary', kind: 'person', animals: false, allowFree: true, value: notaryVal})}</div>
                <label>${esc(i18n('Réf. du notaire'))}<input name="notary_ref" maxlength="80" value="${esc(d.notary_ref || '')}" placeholder="BR/26/0412"></label></div>
                <div class="succ-2"><label>${esc(i18n('Ouvert le'))}<input type="date" name="opened_at" value="${esc(d.opened_at || today())}"></label>
                <label>${esc(i18n('Testament'))}<input name="testament" maxlength="1000" value="${esc(d.testament || '')}" placeholder="${esc(i18n('Aucun connu (le notaire interroge le fichier des dernières volontés)'))}"></label></div>
                <label>${esc(i18n('Situation (notes)'))}<textarea name="situation" rows="2" maxlength="2000">${esc(d.situation || '')}</textarea></label>
                <p class="ui-hint">${esc(i18n('🔒 Le dossier reste dans l’app : les héritiers vivants, leurs adresses et leurs parts ne sont dans aucun export. Aucun montant n’est noté.'))}</p></div>`,
            onSubmit: async form => {
                const v = n => form.querySelector(`[name=${n}]`)?.value || '';
                const did = Number(v('deceased_id')) || 0;
                if (!did) return UI().fail(form.querySelector('[name=deceased_id]')?.closest('.pk') || form.elements.number, i18n('Choisis la personne décédée.'));
                const nv = v('notary'); const body = {op: 'save', id: d.id || 0, deceased_id: did, number: v('number'), death_date_text: v('death_date_text'), death_place_id: Number(v('death_place_id')) || 0, last_address: v('last_address'),
                    notary_person_id: /^\d+$/.test(nv) ? Number(nv) : 0, notary_text: nv.startsWith('txt:') ? nv.slice(4) : '', notary_ref: v('notary_ref'), opened_at: v('opened_at'), testament: v('testament'), situation: v('situation')};
                if (!body.death_date_text) delete body.death_date_text; // repris de la fiche
                let r; try { r = await post(body); } catch (e) { toast(e.message, 'error'); return false; }
                if (!data) {
                    A().undoToast(i18n('Dossier ouvert'), {undo: async () => { await post({op: 'delete', id: r.id}); openCase(0); }});
                    cur.tab = 'heirs'; openCase(r.id, 'heirs');
                } else { A().undoToast(i18n('Dossier enregistré'), {undo: async () => { await post({op: 'save', id: d.id, ...r.prev}); reload(); }}); reload(); }
            }});
    }
    async function openFor(personId) {
        let r = null; try { r = await get('by_person', {person_id: personId}); } catch (e) { return toast(e.message, 'error'); }
        if (r?.id) return openCase(r.id, 'heirs');
        caseDialog(null, personId);
    }
    async function deleteCase(id) {
        try { await post({op: 'delete', id: Number(id)}); } catch (e) { return toast(e.message, 'error'); }
        if (cur.id === Number(id)) cur.id = 0;
        render();
        A().undoToast(i18n('Dossier supprimé'), {undo: async () => { await post({op: 'restore', id: Number(id)}); render(); }, redo: async () => { await post({op: 'delete', id: Number(id)}); render(); }});
    }

    /* ═════ Le calcul d'un dossier ═════ */
    function computeCase(D) {
        const statuses = {}, spouse = {};
        for (const [pid, o] of Object.entries(D.overrides || {})) { if (o.status || o.adoption) statuses[pid] = {status: o.status, adoption: o.adoption}; if (o.spouse) spouse[pid] = o.spouse; }
        const addresses = {}; for (const k of Object.keys(D.addresses || {})) addresses[k] = true;
        // réglage « Les fiches confidentielles comptent-elles comme héritiers ? » = Non : retirées du calcul (avertissement dans 👥 Héritiers)
        return S().compute(D.graph, {deceasedId: D.deceased_id, deathDate: D.death_iso || '', deathText: D.death_date_text, overrides: statuses, spouse, addresses, t: i18n, excludePrivate: D.count_private === false});
    }
    const piecesOf = (D, R) => { const states = {}; for (const [k, p] of Object.entries(D.pieces || {})) if (p.state) states[k] = p.state; return S().pieces(R, D.graph, {acts: D.acts || {}, states, asked: D.asked || {}}); };
    /** le journal note tout seul quand la dévolution change (une fiche de la famille a changé) */
    async function noteRecalc(D, R) {
        if (!R || R.error) return;
        const snap = S().snapshot(R), prev = D.snapshot;
        const same = prev && JSON.stringify(prev.shares) === JSON.stringify(snap.shares) && prev.order === snap.order && JSON.stringify(prev.unknown || []) === JSON.stringify(snap.unknown);
        if (same) return;
        const names = Object.fromEntries(Object.keys(D.graph.persons).map(k => [k, nameOf(D, k)]));
        const lines = S().diffLines(prev, snap, names, i18n);
        try { await post({op: 'snapshot', case_id: D.id, snapshot: snap, lines, first: prev ? 0 : 1}); D.snapshot = snap; } catch (_) {}
    }

    const reload = async () => { cur.data = null; render(); };
    async function renderCase(w, token) {
        if (!cur.data || cur.data.id !== cur.id) {
            w.innerHTML = `<section class="page succ-page">${UI().spinner(i18n('Lecture du dossier…'))}</section>`;
            try { cur.data = await get('get', {id: cur.id}); } catch (e) { cur.id = 0; w.innerHTML = `<section class="page">${UI().notice('error', e.message)}<p><button type="button" class="button secondary" data-succ-back>${esc(i18n('← Tous les dossiers'))}</button></p></section>`; return; }
            if (!sameTurn(token)) return;
            cur.R = cur.data.deceased_id ? computeCase(cur.data) : null;
            noteRecalc(cur.data, cur.R);
            if (cur.R && !cur.R.error) { try { ext.succDossiers?.afterCompute?.(cur.data, cur.R, piecesOf(cur.data, cur.R)); } catch (_) {} } // héritiers et intermédiaires rattachés, avancement gardé
        }
        const D = cur.data, R = cur.R;
        if (!TABS.some(t => t[0] === cur.tab)) cur.tab = 'dossier';
        const dead = D.graph.persons[D.deceased_id];
        const years = dead ? [dead.birth?.year, dead.death?.year].filter(Boolean).join('-') : '';
        const P_ = R && !R.error ? piecesOf(D, R) : null;
        const tabLabel = (k, l) => k === 'pieces' && P_ ? `${i18n(l)} (${P_.counts.have} / ${P_.counts.total})` : i18n(l);
        const stIdx = STATES.findIndex(s => s[0] === D.state);
        w.innerHTML = `<section class="page succ-page" data-succ-case="${D.id}">${UI().pageHeader({title: i18n('Dossier n° {n} · {t}', {n: D.number, t: D.title}), icon: '⚖️', where: cur.where === 'tab' ? i18n('Successions') : i18n('Listes · Dossiers de succession'),
            help: [D.deceased ? `${esc(D.deceased)}${years ? ` (${esc(years)})` : ''}` : '', badge(stateLabel(D.state), stateKind(D.state))].filter(Boolean).join(' '),
            back: `<button type="button" class="button small secondary" data-succ-back>${esc(i18n('← Tous les dossiers'))}</button>`,
            actions: [`<span class="succ-chrono-slot" data-succ-chrono-slot>${OUT().chronoButton?.(D) || ''}</span>`, `<button type="button" class="button secondary" data-succ-loi="case" title="${esc(i18n('⚖️ Un doute sur la loi ?'))}">${esc(i18n('⚖️ Un doute ?'))}</button>`, ...(D.archived ? [] : [`<button type="button" class="button secondary" data-succ-edit="${D.id}">${esc(i18n('✎ Modifier'))}</button>`])],
            more: [D.deceased_id ? `<button type="button" data-h-person="${D.deceased_id}">${esc(i18n('↗ Fiche du défunt'))}</button>` : '', D.state === 'clos' ? `<button type="button" data-succ-archive>${esc(i18n('🗄 Archiver le dossier clos'))}</button>` : '', ...(ext.succDossiers?.caseMore?.(D) || []), `<button type="button" class="danger" data-succ-del="${D.id}">${esc(i18n('🗑 Supprimer'))}</button>`]})}
            ${D.archived ? UI().notice('info', i18n('Dossier archivé : les adresses des vivants ont été retirées, le journal reste.')) : `<div class="succ-steps" role="group" aria-label="${esc(i18n('État du dossier'))}">${STATES.map(([k, l], i) => `<button type="button" class="succ-step${i < stIdx ? ' is-done' : ''}${i === stIdx ? ' is-on' : ''}" data-succ-state="${k}" aria-pressed="${i === stIdx}">${i < stIdx ? '✓ ' : ''}${esc(i18n(l))}</button>`).join('')}</div>`}
            <div class="segmented succ-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-succ-tab="${k}" class="${cur.tab === k ? 'is-active' : ''}" aria-selected="${cur.tab === k}">${esc(tabLabel(k, l))}</button>`).join('')}</div>
            <div data-succ-tabbody></div></section>`;
        const body = w.querySelector('[data-succ-tabbody]');
        try { OUT().onCase?.(D, cur.tab, (TABS.find(x => x[0] === cur.tab) || [])[1]); } catch (_) {} // ⏱ les onglets ouverts pendant le comptage
        if (!D.deceased_id || !R || R.error) { body.innerHTML = UI().notice('error', R?.error || i18n('Le défunt n’est plus dans la base.')); return; }
        ({dossier: tabDossier, heirs: (b, D_, R_) => { if (OUT().euroMode?.() === 'eur') { b.innerHTML = `${OUT().heirsSwitch()}<div data-succ-eur></div>`; return OUT().heirsEuros(b.querySelector('[data-succ-eur]'), D_, R_); } tabHeirs(b, D_, R_); if (OUT().heirsSwitch) b.insertAdjacentHTML('afterbegin', OUT().heirsSwitch()); ext.succDossiers?.heirsExtra?.(b, D_); }, people: (b, D_) => ext.succDossiers?.tabPeople?.(b, D_), tree: tabTree, pieces: tabPieces, contacts: tabContacts, notary: tabNotary, journal: tabJournal, fees: tabFees})[cur.tab](body, D, R, P_);
    }

    /* ── 📁 Dossier ── */
    function tabDossier(body, D, R, P_) {
        const dead = D.graph.persons[D.deceased_id] || {};
        const spouse = (D.graph.unions || []).filter(u => u.a === D.deceased_id || u.b === D.deceased_id).map(u => ({u, x: u.a === D.deceased_id ? u.b : u.a})).filter(o => o.x);
        const sit = [spouse.length ? spouse.map(o => i18n(R.rows.some(r => r.id === o.x && r.role === 'spouse') ? 'Conjoint : {n}' : 'Ancien conjoint : {n}', {n: nameOf(D, o.x)})).join(' · ') : i18n('Pas de conjoint dans la base'),
            R.order === 1 ? i18n('A des descendants') : i18n('Sans descendant dans la base')].join('. ');
        const row = (l, v) => `<tr><th scope="row">${esc(i18n(l))}</th><td>${v}</td></tr>`;
        const dl = D.deadlines;
        body.innerHTML = `<div class="succ-grid2">
            <section class="succ-box"><h3>${esc(i18n('Le défunt'))}</h3><table class="succ-kv">
                ${row('Personne', `<button type="button" class="table-link" data-h-person="${D.deceased_id}">${esc(D.deceased)}</button> <small class="muted">${esc(i18n('fiche n° {n}', {n: D.deceased_id}))}</small>`)}
                ${row('Décès', esc([D.death_date_text || dead.death?.text, D.death_place_text || dead.death?.place].filter(Boolean).join(', ') || '—'))}
                ${row('Dernier domicile', esc(D.last_address || '—'))}${row('Situation', esc(sit) + (D.situation ? `<br><small>${esc(D.situation)}</small>` : ''))}
                ${row('Testament', esc(D.testament || i18n('Aucun connu (le notaire interroge le fichier des dernières volontés)')))}</table></section>
            <section class="succ-box"><h3>${esc(i18n('Le mandat'))}</h3><table class="succ-kv">
                ${row('Notaire mandant', D.notary_person_id ? `<button type="button" class="table-link" data-h-person="${D.notary_person_id}">${esc(D.notary)}</button>` : esc(D.notary || '—'))}
                ${row('Réf. du notaire', esc(D.notary_ref || '—'))}${row('N° de dossier', esc(D.number))}${row('Ouvert le', esc(fmtDate(D.opened_at) || '—'))}
                ${row('Dévolution', R.warnings.length ? R.warnings.map(w => `<span class="succ-warn-inline">⚠️ ${tx(w.kind === 'old' ? 'Droit actuel (le décès est ancien : voir l’avertissement)' : w.kind === 'mid' ? 'Droit actuel (décès avant 2007 : voir l’avertissement)' : 'Date du décès à préciser')}</span>`).join('') : `${esc(i18n('Droit actuel (décès après le 1er janvier 2007)'))} ${badge('OK', 'green')}`)}</table></section></div>
            <section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Échéances'))}</h3>${D.archived ? '' : `<button type="button" class="button small secondary" data-succ-dl-add>${esc(i18n('＋ Échéance'))}</button>`}</div>
            ${dl.length ? `<ul class="succ-deadlines">${dl.map(x => { const n = daysTo(x.due); const k = x.done ? 'grey' : n < 0 ? 'red' : n <= 14 ? 'yellow' : 'blue';
                return `<li class="${x.done ? 'is-done' : ''}">${UI().checkHtml ? UI().checkHtml('', {checked: x.done, attrs: `data-succ-dl-done="${x.id}" aria-label="${esc(i18n('Fait'))}"`}) : ''}<b>${esc(fmtDate(x.due))}</b><span>${esc(x.label)}</span>${badge(x.done ? i18n('Fait') : n < 0 ? i18n('Passée') : n === 0 ? i18n('Aujourd’hui') : i18n('Dans {n} j', {n}), k)}<button type="button" class="icon-button small" data-succ-dl-del="${x.id}" title="${esc(i18n('Supprimer'))}" aria-label="${esc(i18n('Supprimer'))}">🗑</button></li>`; }).join('')}</ul>` : A().empty(i18n('Aucune échéance.'), {icon: '🗓'})}
            <p class="ui-hint">${esc(i18n('Aussi dans 🗓 Ma semaine de recherche.'))}</p></section>
            <div class="succ-quick">${TABS.slice(1).map(([k, l]) => `<button type="button" class="button secondary" data-succ-tab="${k}">${esc(k === 'pieces' ? `${i18n('📑 Pièces')} (${P_.counts.have} / ${P_.counts.total})` : k === 'notary' ? i18n('🖨 Tableau pour le notaire') : i18n(l))}</button>`).join('')}</div>`;
    }

    /* ── 👥 Héritiers et dévolution ── */
    const TIMING = {surv: ['Vivant', 'Vivante', 'green'], pre: ['Décédé', 'Décédée', 'grey'], post: ['Décédé après', 'Décédée après', 'grey'], unknown: ['Inconnu', 'Inconnue', 'yellow'], ren: ['Renonce', 'Renonce', 'violet'], ind: ['Indigne', 'Indigne', 'red'], abs: ['Absent', 'Absente', 'yellow'], notborn: ['Pas encore conçu', 'Pas encore conçue', 'grey']};
    const timingBadge = r => { const x = TIMING[r.unknown ? 'unknown' : r.timing] || TIMING.unknown; return badge(i18n(x[r.gender === 'female' ? 1 : 0]), x[2]); };
    const viaText = r => r.role === 'spouse' ? i18n('conjoint') : r.role === 'parent' ? i18n('de son chef') : r.role === 'souche' ? i18n('représenté') : r.role === 'out' ? (r.reason === 'nodesc' ? i18n('sans descendance connue') : r.reason === 'farther' ? i18n('degré plus éloigné') : r.reason === 'norepr' ? i18n('pas de représentation') : r.reason === 'notborn' ? i18n('pas encore conçu') : i18n('écarté')) : r.via === 'repr' ? i18n('par représentation') : r.unknown ? i18n('de son chef, s’il vit') : i18n('de son chef');
    const OV = [['', 'Comme sur la fiche'], ['alive', 'Vivant au décès'], ['dead_before', 'Mort avant le défunt'], ['dead_after', 'Mort après le défunt'], ['unknown', 'Inconnu'], ['renonce', 'Renonce à la succession'], ['indigne', 'Indigne'], ['absent', 'Présumé absent'], ['absent_declare', 'Déclaré absent']];
    function tabHeirs(body, D, R) {
        const ov = D.overrides || {};
        const ro = D.archived;
        const ordersHtml = `<table class="succ-orders"><tbody>${R.orders.map(o => `<tr class="is-${o.state}"><th>${esc(i18n(['', '1er ordre', '2e ordre', '3e ordre', '4e ordre'][o.n]))}</th><td>${tx(o.label)}</td><td>${badge(o.state === 'kept' ? i18n('Retenu') : o.state === 'none' ? i18n('Personne') : o.state === 'spouse' ? i18n('Écarté par le conjoint') : i18n('Écarté'), o.state === 'kept' ? 'green' : 'grey')}</td></tr>`).join('')}</tbody></table>`;
        const spouseRow = R.rows.find(r => r.role === 'spouse');
        const spouseUnions = (D.graph.unions || []).filter(u => u.a === D.deceased_id || u.b === D.deceased_id);
        const spouseHtml = spouseRow ? `<p>${tx('{name} : {share} (art. {art}).', {name: spouseRow.name, share: spouseRow.share, art: spouseRow.art})}${R.spouseOption === 'usufruit' ? ' ' + tx('Ou, à son choix, l’usufruit de la totalité (art. 757) : les descendants ont alors la nue-propriété, dans les mêmes proportions.') : ''}</p>`
            : `<p>${spouseUnions.length ? spouseUnions.map(u => { const x = u.a === D.deceased_id ? u.b : u.a; const p = D.graph.persons[x]; return esc(i18n(u.divorced ? '{n} : divorcé(e), pas héritier (art. 732).' : u.free || u.married === false ? '{n} : pas marié(e) (PACS ou union libre), pas héritier sans testament.' : '{n} : décédé(e) avant, pas de conjoint survivant.', {n: S().name(p)})); }).join(' ') : esc(i18n('Aucun conjoint dans la base.'))} ${tx('S’il y avait un conjoint, l’app afficherait ici ses droits (art. 757 à 757-2) avant les ordres.')}</p>`;
        const heirRows = R.rows.filter(r => r.role !== 'spouse');
        const cOf = r => S().contactOf(D, r.id);
        const tr = r => `<tr class="succ-r is-${r.role}${r.unknown ? ' is-unknown' : ''}" data-succ-pid="${r.id}" data-succ-cstate="${reachable(r) ? cOf(r).state : '-'}">
            <td style="--succ-depth:${r.depth || 0}">${r.depth ? '<span class="succ-indent" aria-hidden="true">↳</span>' : ''}<button type="button" class="table-link" data-h-person="${r.id}">${esc(r.name)}</button>${r.years ? ` <small class="muted">(${esc(r.years)})</small>` : ''}${r.line ? ` ${badge(r.line === 'p' ? i18n('paternelle') : i18n('maternelle'), 'grey')}` : ''}${reachable(r) && cOf(r).state ? ' ' + contactBadge(cOf(r)) : ''}</td>
            <td>${esc(r.kin)}</td><td>${r.deg ? esc(i18n('{n}e', {n: r.deg})) : '—'}</td><td>${timingBadge(r)}${D.addresses?.[r.id] || r.role === 'out' || r.role === 'souche' || r.timing === 'pre' ? '' : ` <small class="muted">${esc(i18n('adresse ?'))}</small>`}</td>
            <td>${esc(viaText(r))}</td><td class="succ-share"><b>${esc(r.share)}</b></td><td class="succ-pct">${r.role === 'souche' ? esc(i18n('souche')) : r.role === 'out' ? '—' : esc(pctTxt(r.pct))}</td>
            <td>${ro ? '' : `<select class="succ-ov" data-succ-ov="${r.id}" aria-label="${esc(i18n('Statut retenu dans ce dossier'))}">${OV.map(([v, l]) => `<option value="${v}"${(ov[r.id]?.status || '') === v ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>`}</td>
            <td>${!reachable(r) ? '' : ro ? contactBadge(cOf(r)) : contactSelect(D.id, r.id, cOf(r).state)}</td></tr>`;
        // ❔ introuvable depuis plus d'un an : la présomption d'absence (art. 112 et suivants) peut protéger sa part
        const staleHtml = R.rows.filter(r => reachable(r) && S().contactStale(cOf(r))).map(r => `<p class="succ-cstale">🔎 ${tx('{name} est introuvable depuis plus d’un an : la présomption d’absence (art. 112 et suivants) peut protéger sa part.', {name: r.name})}${ro ? '' : ` <button type="button" class="link-button" data-succ-absent="${r.id}">${esc(i18n('❔ Absent ou disparu'))}</button>`}</p>`).join('');
        const nPriv = (R.privateExcluded || []).length;
        const privHtml = nPriv ? `<div class="succ-privwarn" data-succ-privwarn>${noticeHtml('warn', `🔒 ${esc(i18n('{what} : les parts peuvent être fausses.', {what: plural(nPriv, 'fiche confidentielle non comptée', 'fiches confidentielles non comptées')}))} <button type="button" class="link-button" data-succ-privset>${esc(i18n('Changer ce réglage'))}</button>`)}</div>` : '';
        const cfilt = ['introuvable', 'silence'].includes(cur.cfilt) ? cur.cfilt : '';
        const hyp = R.hypotheses.map(h => `<div class="succ-hyp">🔀 <b>${esc(i18n('Autre hypothèse'))}</b>, ${esc(h.label)} : ${h.shares.map(s => `${esc(s.name)} <b>${esc(s.share)}</b>`).join(', ')}${h.total !== '1' && h.shares.length ? ` <small>(${esc(i18n('total {t}', {t: h.total}))})</small>` : ''}${!h.shares.length ? esc(i18n('personne : il reste des branches à chercher.')) : ''}</div>`).join('');
        const SEARCH_ICON = {unknown: '🔎', nodesc: '❓', address: '📇', adoption: '🧩', marriage: '💍', lit: '🧩', parents: '🌳', kids: '👶', branch: '🌳', post: '⏳', absent: '❔'};
        const searchHtml = R.search.length ? `<ul class="succ-search">${R.search.map(s => `<li><span class="succ-s-ic" aria-hidden="true">${SEARCH_ICON[s.kind] || '🔎'}</span><div><b>${esc(s.name)}</b> ${tx(s.text)}${s.share ? ` <small>${esc(i18n('Part en jeu : {s}', {s: s.share}))}</small>` : ''}</div><div class="succ-s-act">
            ${['unknown', 'nodesc', 'parents', 'kids', 'branch'].includes(s.kind) && !ro ? `<button type="button" class="button small secondary" data-succ-seek="${s.id}" data-kind="${s.kind}">${esc(i18n('🔍 Chercher'))}</button>` : ''}
            ${s.kind === 'unknown' && !ro ? `<button type="button" class="button small secondary" data-succ-abroad="${s.id}">${esc(i18n('🌍 Héritier à l’étranger'))}</button><button type="button" class="button small secondary" data-succ-absent="${s.id}">${esc(i18n('❔ Absent ou disparu'))}</button>` : ''}
            ${s.kind === 'address' ? `<button type="button" class="button small secondary" data-succ-contact="${s.id}">${esc(i18n('📇 Compléter'))}</button>` : ''}
            ${s.kind === 'adoption' && !ro ? `<select data-succ-adopt="${s.id}" aria-label="${esc(i18n('Type d’adoption'))}"><option value="">${esc(i18n('Type d’adoption ?'))}</option><option value="pleniere">${esc(i18n('Plénière'))}</option><option value="simple">${esc(i18n('Simple'))}</option></select>` : ''}
            ${s.kind === 'marriage' && !ro ? `<select data-succ-spouse="${s.id}" aria-label="${esc(i18n('Marié ?'))}"><option value="">${esc(i18n('Marié ?'))}</option><option value="married">${esc(i18n('Marié'))}</option><option value="not">${esc(i18n('Pas marié (PACS, union libre)'))}</option><option value="divorced">${esc(i18n('Divorcé'))}</option></select>` : ''}
            ${['nodesc', 'lit', 'kids'].includes(s.kind) ? `<button type="button" class="button small secondary" data-h-person="${s.id}">${esc(i18n('↗ Fiche'))}</button>` : ''}</div></li>`).join('')}</ul>` : A().empty(i18n('Aucune branche à chercher d’après les fiches.'), {icon: '✓'});
        const branchHtml = R.branches && (R.order === 3 || R.order === 4 || R.escheat) ? `<p class="succ-fente">${R.branches.map(b => esc(i18n(b.line === 'p' ? 'Branche paternelle : {who}' : 'Branche maternelle : {who}', {who: b.ids.length ? b.ids.map(id => nameOf(D, id)).join(', ') + ` (${i18n('{n}e degré', {n: b.deg})})` : i18n('personne')}))).join(' · ')}</p>` : '';
        body.innerHTML = `${privHtml}${noticeHtml('warn', `⚖️ ${tx('Calcul indicatif, à faire vérifier par le notaire. Il suit le Code civil en vigueur (art. 731 et suivants), sans testament, sans donation, sans renonciation connue. Il ne tient pas compte du droit de retour légal (art. 738-2, 757-3), des biens à l’étranger ni d’un régime matrimonial.')}`)}
            ${R.warnings.map(w => `<div class="succ-oldlaw" role="note">🕰 ${tx(w.text)}</div>`).join('')}
            <section class="succ-box"><h3>${esc(i18n('Le conjoint survivant'))}</h3>${spouseHtml}</section>
            <section class="succ-box"><h3>${tx('Les ordres d’héritiers (art. 734) : le premier qui a quelqu’un prend tout')}</h3>${ordersHtml}<ul class="succ-notes">${R.notes.map(n => `<li>${tx(n)}</li>`).join('')}</ul>${branchHtml}</section>
            <section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Les héritiers trouvés'))}</h3><div class="succ-acts"><label class="succ-cfilt">${esc(i18n('Montrer'))} <select data-succ-cfilt><option value="">${esc(i18n('Tous les héritiers'))}</option>${Object.entries(CONTACT).map(([k, x]) => `<option value="${k}"${cfilt === k ? ' selected' : ''}>${x[0]} ${esc(i18n(x[1]))}</option>`).join('')}</select></label>${ro ? '' : `<button type="button" class="button small secondary" data-succ-tables>${esc(i18n('🗂 Tables des successions (AD)…'))}</button>`}</div></div>
            <div class="succ-scroll"><table class="succ-table succ-heirs${cfilt ? ' is-cfilt' : ''}" data-cfilt="${cfilt}"><thead><tr><th>${esc(i18n('Personne'))}</th><th>${esc(i18n('Lien avec le défunt'))}</th><th>${esc(i18n('Degré'))}</th><th>${esc(i18n('État'))}</th><th>${esc(i18n('Vient'))}</th><th>${esc(i18n('Part'))}</th><th>≈</th><th>${esc(i18n('Statut retenu'))}</th><th>${esc(i18n('Contact'))}</th></tr></thead>
            <tbody>${(spouseRow ? [spouseRow] : []).concat(heirRows).map(tr).join('')}</tbody><tfoot><tr><th colspan="5">${esc(i18n('Total'))}</th><td class="succ-share"><b>${esc(R.total)}</b></td><td>${R.totalOk ? '100 %' : '⚠️'}</td><td></td><td></td></tr></tfoot></table></div>
            ${staleHtml}<p class="ui-hint">${tx('🔎 Introuvable ou 🔇 ne répond pas : pas compté comme contacté dans l’avancement, et le calcul ne change pas. À ne pas confondre avec le statut « Présumé absent » (art. 112).')}</p>
            <p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le tableau pour voir les parts.'))}</p>${R.escheat ? noticeHtml('warn', tx('Aucun héritier trouvé jusqu’au 6e degré : sans testament, la succession reviendrait à l’État (art. 539 et 768). Il reste sans doute des branches à chercher.')) : ''}
            ${hyp}${R.hypotheses.length ? `<p class="ui-hint">${esc(i18n('Les calculs restent tant que la branche n’est pas tranchée.'))}</p>` : ''}</section>
            <section class="succ-box"><h3>${esc(i18n('Les branches à chercher'))}</h3>${searchHtml}</section>
            <section class="succ-box"><h3>${esc(i18n('L’hypothèse retenue'))}</h3><textarea class="succ-note" data-succ-note rows="3" maxlength="4000" ${ro ? 'readonly' : ''} placeholder="${esc(i18n('Ex. : André MAZAUD décédé à Lyon en 1990 sans enfant (acte reçu le 5 déc.).'))}">${esc(D.hypothesis_note || '')}</textarea>
            <p class="ui-hint">${esc(i18n('Demandée avant « Remis au notaire » si un héritier reste inconnu.'))}</p></section>
            <section class="succ-box"><h3>${tx('Les degrés civils (art. 741-743) : on compte les générations jusqu’à l’ancêtre commun, puis on redescend')}</h3><p class="succ-degrees">${S().DEGREES.map(([n, l]) => `<span><b>${n}</b> ${esc(i18n(l))}</span>`).join('')}</p></section>`;
    }

    /* ── 🌳 Arbre de dévolution (dessin SVG) ── */
    function treeSvg(D, R, {print = false} = {}) {
        const C = R._ctx, rows = R.rows, byId = new Map(rows.map(r => [r.id, r]));
        const ids = new Set([D.deceased_id, ...rows.map(r => r.id)]);
        // les ascendants sur le chemin de chaque héritier, et l'autre parent des frères et sœurs
        for (const r of rows) { const rel = S().relation(C, r.id); if (!rel || rel.anc == null) continue; let x = D.deceased_id; for (let i = 0; i < rel.a; i++) { const ps = C.legalParents(x); const nx = ps.find(p => S().relation(C, p)) ?? ps[0]; if (nx == null) break; ps.forEach(p => { if (i === 0) ids.add(p); }); ids.add(nx); x = nx; } }
        for (const r of rows) if (r.b === 1 && r.a === 1) C.legalParents(r.id).forEach(p => ids.add(p));
        const level = id => { if (id === D.deceased_id) return 0; const r = S().relation(C, id); return r ? r.b - r.a : 0; };
        const nodes = [...ids].filter(id => D.graph.persons[id]).map(id => ({id, lv: level(id), row: byId.get(id)}));
        const parentsIn = id => C.legalParents(id).filter(p => ids.has(p));
        const kidsIn = id => C.legalKids(id).filter(k => ids.has(k));
        // largeur de chaque sous-arbre (un enfant rangé sous son premier parent dessiné)
        const owner = new Map(); const order = [];
        const roots = nodes.filter(n => !parentsIn(n.id).length).sort((a, b) => a.lv - b.lv || (D.graph.persons[a.id].birth?.year || 0) - (D.graph.persons[b.id].birth?.year || 0));
        const visit = id => { order.push(id); for (const k of kidsIn(id)) if (!owner.has(k)) { owner.set(k, id); visit(k); } };
        roots.forEach(r => { if (!owner.has(r.id)) { owner.set(r.id, null); visit(r.id); } });
        const W = 158, H = 58, GX = 18, GY = 46;
        const width = new Map(); const wOf = id => { if (width.has(id)) return width.get(id); const ks = kidsIn(id).filter(k => owner.get(k) === id); const v = Math.max(1, ks.reduce((s, k) => s + wOf(k), 0)); width.set(id, v); return v; };
        const pos = new Map(); let cursor = 0;
        const minLv = Math.min(...nodes.map(n => n.lv)), maxLv = Math.max(...nodes.map(n => n.lv));
        const place = (id, x0) => { const ks = kidsIn(id).filter(k => owner.get(k) === id); let x = x0; ks.forEach(k => { place(k, x); x += wOf(k); }); const lv = level(id); pos.set(id, {x: x0 + wOf(id) / 2, y: lv - minLv}); };
        // un parent sans enfant « à lui » dans le dessin (l'autre parent d'un couple) se range à côté de son conjoint
        const partnerOf = id => C.partnersOf(id).find(x => ids.has(x));
        const lone = r => !kidsIn(r.id).some(k => owner.get(k) === r.id) && partnerOf(r.id) != null;
        roots.forEach(r => { if (owner.get(r.id) === null && !pos.has(r.id) && !lone(r)) { place(r.id, cursor); cursor += wOf(r.id); } });
        const side = new Map();
        roots.filter(r => !pos.has(r.id) && lone(r)).forEach(r => {
            const pt = pos.get(partnerOf(r.id)); if (!pt) { place(r.id, cursor); cursor += 1; return; }
            const used = x => [...pos.values()].some(v => v.y === pt.y && Math.abs(v.x - x) < 0.99);
            const n = (side.get(partnerOf(r.id)) || 0); side.set(partnerOf(r.id), n + 1);
            for (let k = 1; k < 30; k++) { const x = pt.x + (n % 2 ? k : -k); if (!used(x)) { pos.set(r.id, {x, y: pt.y}); break; } }
        });
        { const minX = Math.min(...[...pos.values()].map(v => v.x)); if (minX < 0.5) for (const v of pos.values()) v.x += 0.5 - minX; cursor = Math.max(cursor, ...[...pos.values()].map(v => v.x + 0.5)); }
        nodes.forEach(n => { if (!pos.has(n.id)) { pos.set(n.id, {x: cursor + 0.5, y: n.lv - minLv}); cursor += 1; } });
        // le conjoint survivant à côté du défunt
        const sp = rows.find(r => r.role === 'spouse');
        if (sp && pos.has(D.deceased_id)) { const p = pos.get(D.deceased_id); pos.set(sp.id, {x: p.x + 1, y: p.y}); for (const [k, v] of pos) if (k !== sp.id && k !== D.deceased_id && v.y === p.y && v.x >= p.x + 1 - 1e-9 && v.x < p.x + 1.5) v.x += 1; cursor = Math.max(cursor, p.x + 1.5); }
        const cols = Math.max(cursor, 1), w = cols * (W + GX) + GX, h = (maxLv - minLv + 1) * (H + GY) + GY + 20;
        const X = id => GX + pos.get(id).x * (W + GX) - W / 2, Y = id => GY / 2 + pos.get(id).y * (H + GY);
        const lines = [];
        for (const id of pos.keys()) for (const p of parentsIn(id)) if (pos.has(p)) { const x1 = X(p) + W / 2, y1 = Y(p) + H, x2 = X(id) + W / 2, y2 = Y(id), my = (y1 + y2) / 2; lines.push(`<path d="M${x1} ${y1}V${my}H${x2}V${y2}" class="succ-t-line"/>`); }
        if (sp && pos.has(sp.id)) lines.push(`<line x1="${X(D.deceased_id) + W}" y1="${Y(D.deceased_id) + H / 2}" x2="${X(sp.id)}" y2="${Y(sp.id) + H / 2}" class="succ-t-union"/>`);
        const box = id => {
            const p = D.graph.persons[id], r = byId.get(id), dead = id === D.deceased_id;
            const kind = dead ? 'dead' : !r ? 'link' : r.unknown ? 'unknown' : r.role === 'souche' || r.timing === 'pre' || r.role === 'out' ? 'pre' : 'heir';
            const sub = dead ? i18n('LE DÉFUNT') : r ? (r.unknown ? i18n('à retrouver') : r.role === 'souche' ? i18n('représenté') : r.role === 'out' && r.reason === 'nodesc' ? i18n('sans descend.') : r.kin) : '';
            const yrs = [p.birth?.year, p.death?.year ? '† ' + p.death.year : ''].filter(Boolean).join(' · ');
            const share = r && !dead ? (r.role === 'out' ? '0' : r.share) : '';
            const x = X(id), y = Y(id), name = S().name(p);
            return `<g class="succ-t-box is-${kind}" data-succ-node="${id}" tabindex="0" role="button" aria-label="${esc(name)}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="7"/>
                <text x="${x + 8}" y="${y + 17}" class="succ-t-name">${esc(name.length > 22 ? name.slice(0, 21) + '…' : name)}</text><text x="${x + 8}" y="${y + 33}" class="succ-t-sub">${esc(String(sub).slice(0, 26))}</text><text x="${x + 8}" y="${y + 48}" class="succ-t-sub">${esc(yrs)}</text>
                ${kind === 'pre' && !dead ? `<line x1="${x + 6}" y1="${y + 13}" x2="${x + Math.min(W - 10, 8 + name.length * 6.4)}" y2="${y + 13}" class="succ-t-strike"/>` : ''}
                ${share ? `<g class="succ-t-share${r.role === 'souche' || r.role === 'out' ? ' is-souche' : ''}"><rect x="${x + W - 50}" y="${y + H - 12}" width="46" height="20" rx="10"/><text x="${x + W - 27}" y="${y + H + 2}" text-anchor="middle">${esc(share)}</text></g>` : ''}</g>`;
        };
        const legend = `<g class="succ-t-legend" transform="translate(${GX},${h - 14})"><rect width="12" height="12" class="lg-heir"/><text x="16" y="10">${esc(i18n('Héritier vivant, sa part'))}</text><rect x="190" width="12" height="12" class="lg-pre"/><text x="206" y="10">${esc(i18n('Prédécédé, sa souche'))}</text><rect x="370" width="12" height="12" class="lg-unknown"/><text x="386" y="10">${esc(i18n('Branche à chercher'))}</text></g>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" class="succ-tree${print ? ' is-print' : ''}" viewBox="0 0 ${Math.max(w, 560)} ${h}" width="${Math.max(w, 560)}" height="${h}" role="img" aria-label="${esc(i18n('Arbre de dévolution'))}"><style>${TREE_CSS}</style>${lines.join('')}${[...pos.keys()].map(box).join('')}${legend}</svg>`;
    }
    const TREE_CSS = '.succ-t-line{fill:none;stroke:#8a93a3;stroke-width:1.4}.succ-t-union{stroke:#8a93a3;stroke-width:2;stroke-dasharray:4 3}.succ-t-box rect{fill:#fff;stroke:#b7bfcc;stroke-width:1.3}.succ-t-box.is-heir>rect{fill:#e8f1ff;stroke:#2563eb;stroke-width:2}.succ-t-box.is-dead>rect{fill:#1f2937;stroke:#111}.succ-t-box.is-dead text{fill:#fff}.succ-t-box.is-pre>rect{fill:#f1f2f4;stroke:#9aa1ad}.succ-t-box.is-unknown>rect{fill:#fff7ed;stroke:#ea8a1f;stroke-width:2;stroke-dasharray:5 4}.succ-t-name{font:600 12px system-ui,sans-serif;fill:#111827}.succ-t-sub{font:11px system-ui,sans-serif;fill:#4b5563}.succ-t-strike{stroke:#6b7280;stroke-width:1.2}.succ-t-share rect{fill:#2563eb}.succ-t-share.is-souche rect{fill:#9aa1ad}.succ-t-share text{font:700 11px system-ui,sans-serif;fill:#fff}.succ-t-legend text{font:11px system-ui,sans-serif;fill:#374151}.lg-heir{fill:#e8f1ff;stroke:#2563eb}.lg-pre{fill:#f1f2f4;stroke:#9aa1ad}.lg-unknown{fill:#fff7ed;stroke:#ea8a1f;stroke-dasharray:3 2}';
    function tabTree(body, D, R) {
        body.innerHTML = `<section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Le défunt au centre, chaque héritier avec sa part'))}</h3><div class="succ-acts"><button type="button" class="button small secondary" data-succ-tree-print>${esc(i18n('🖨 Imprimer ou ⤓ PDF'))}</button><button type="button" class="button small secondary" data-succ-tree-svg>${esc(i18n('⤓ SVG'))}</button></div></div>
            <div class="succ-tree-wrap succ-scroll">${treeSvg(D, R)}</div><p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le dessin.'))}</p>
            <p class="ui-hint">${esc(i18n('Clic sur une case : la fiche ; clic droit : « 🛡 Solidité de ce lien ». Le dessin suit les fiches.'))}</p></section>`;
    }

    /* ── 📑 Pièces justificatives ── */
    const STATE_P = {have: ['✓ En main', 'green'], asked: ['📮 Demandé', 'blue'], missing: ['✗ Manquant', 'red'], na: ['Sans objet', 'grey']};
    function tabPieces(body, D, R, P_) {
        const ro = D.archived;
        const c = P_.counts;
        const itemRow = it => `<tr data-succ-piece="${esc(it.key)}"><td>${esc(it.what)}</td><td>${esc(it.act || '—')}</td>
            <td>${badge(i18n(STATE_P[it.state][0]), STATE_P[it.state][1])}${it.state === 'asked' && (it.asked?.date || D.pieces?.[it.key]?.updated_at) ? ` <small class="muted">${esc(i18n('le {d}', {d: fmtDate(it.asked?.date || String(D.pieces[it.key].updated_at).slice(0, 10))}))}</small>` : ''}</td>
            <td><div class="succ-p-act">${ro ? '' : `<select data-succ-pstate="${esc(it.key)}" aria-label="${esc(i18n('État de la pièce'))}"><option value="">${esc(i18n('D’après la fiche'))}</option>${Object.entries(STATE_P).map(([k, [l]]) => `<option value="${k}"${D.pieces?.[it.key]?.state === k ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>
                ${it.state === 'missing' && ext.openActLetter && it.kind !== 'R' && it.kind !== 'V' ? `<button type="button" class="button small secondary" data-succ-ask="${esc(it.key)}">${esc(i18n('📮 Demander l’acte'))}</button>` : ''}
                ${it.state === 'asked' ? `<button type="button" class="button small secondary" data-succ-relance>${esc(i18n('Relancer'))}</button>` : ''}`}</div></td></tr>`;
        let html;
        if (cur.pieceView === 'act') {
            const kinds = [['N', 'Naissances'], ['M', 'Mariages'], ['D', 'Décès'], ['V', 'Divorces'], ['R', 'Renonciations']];
            html = kinds.map(([k, l]) => { const items = P_.list.filter(i => i.kind === k); return items.length ? `<tbody><tr class="succ-p-group"><th colspan="4">${esc(i18n(l))}</th></tr>${items.map(itemRow).join('')}</tbody>` : ''; }).join('');
        } else html = P_.groups.map(g => `<tbody><tr class="succ-p-group"><th colspan="4">${esc(g.title)}${g.path ? ` <small>· ${esc(g.path)}</small>` : ''}</th></tr>${g.items.map(itemRow).join('')}</tbody>`).join('');
        body.innerHTML = `<section class="succ-box"><div class="succ-box-head"><div class="succ-pcount">${badge(i18n('{n} en main', {n: c.have}), 'green')} ${badge(i18n('{n} demandés', {n: c.asked}), 'blue')} ${badge(i18n('{n} manquants', {n: c.missing}), 'red')}</div>
            <div class="segmented" role="group"><button type="button" data-succ-pview="heir" class="${cur.pieceView !== 'act' ? 'is-active' : ''}">${esc(i18n('Par héritier'))}</button><button type="button" data-succ-pview="act" class="${cur.pieceView === 'act' ? 'is-active' : ''}">${esc(i18n('Par acte'))}</button></div></div>
            <div class="succ-scroll"><table class="succ-table succ-pieces"><thead><tr><th>${esc(i18n('Ce qu’il faut prouver'))}</th><th>${esc(i18n('Acte'))}</th><th>${esc(i18n('État'))}</th><th></th></tr></thead>${html}</table></div>
            <p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le tableau.'))}</p>
            <p class="ui-hint">${esc(i18n('Rangée dans le Registre de courriers, une demande d’acte met la pièce à « Demandé » ; l’acte attaché à la fiche la met à « En main ».'))}</p></section>`;
    }
    function askAct(D, R, key) {
        const P_ = piecesOf(D, R); const it = P_.list.find(i => i.key === key); if (!it) return;
        const act = {N: 'naissance', D: 'deces', M: 'mariage'}[it.kind] || 'naissance';
        const pid = it.kind === 'M' ? (it.person_id || 0) : it.person_id;
        ext.openActLetter({person_id: pid, event_id: it.event_id || 0, act, what: 'integrale', relation: 'autre',
            precision: i18n('Je suis mandaté(e) par {notary}, notaire, pour établir la dévolution de la succession de {name} (dossier {n}, réf. {ref}).', {notary: D.notary || '…', name: D.deceased, n: D.number, ref: D.notary_ref || '—'}),
            onFiled: async r => { try { await post({op: 'link_courrier', case_id: D.id, courrier_id: r.courrier_id, piece_key: key, person_id: pid, kind: 'acte'}); } catch (e) { toast(e.message, 'error'); } reload(); }});
    }

    /* ── ✉️ Héritiers contactés : courriers, réponses, signatures ── */
    const ANSWER = [['', '—'], ['none', 'Rien'], ['yes', 'A répondu'], ['no', 'Refuse'], ['later', 'Rappellera']];
    function heirsToContact(R) { return R.rows.filter(r => (r.role === 'heir' || r.role === 'parent' || r.role === 'spouse') && r.share !== '0'); }
    function tabContacts(body, D, R) {
        const ro = D.archived;
        const heirs = heirsToContact(R);
        const byP = new Map(); for (const c of D.courriers) if (c.person_id && c.kind !== 'acte') { (byP.get(c.person_id) || byP.set(c.person_id, []).get(c.person_id)).push(c); }
        const tr = r => {
            const cs = byP.get(r.id) || [], last = cs[0];
            const addr = D.addresses?.[r.id];
            const contrat = cs.find(c => c.kind === 'contrat') || (last?.kind === 'contact' ? last : null);
            return `<tr><td><button type="button" class="table-link" data-h-person="${r.id}">${esc(r.name)}</button><br><small class="muted">${esc(r.kin)} · ${esc(r.share)}</small></td>
                <td>${last ? esc(last.objet) : r.unknown ? esc(i18n('À retrouver')) : !addr ? esc(i18n('Adresse ?')) : '—'}</td><td>${last ? esc(fmtDate(last.date_envoi)) : '—'}</td>
                <td>${last && !ro ? `<select data-succ-answer="${last.id}" aria-label="${esc(i18n('Réponse'))}">${ANSWER.map(([v, l]) => `<option value="${v}"${last.reponse === v ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>` : '—'}</td>
                <td>${contrat && !ro ? `<input type="date" data-succ-signed="${contrat.id}" value="${esc(contrat.signe_le || '')}" aria-label="${esc(i18n('Signé le'))}">${contrat.signe_le ? ' ' + badge(i18n('Signé'), 'green') : last?.reponse === 'yes' ? ' ' + badge(i18n('À signer'), 'yellow') : ''}` : '—'}</td>
                <td>${ro || r.unknown ? '' : `<button type="button" class="button small secondary" data-succ-write="${r.id}">${esc(i18n('✉️ Écrire'))}</button>`}</td></tr>`;
        };
        body.innerHTML = `<section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Contrat de révélation, réponses, signatures'))}</h3>${ro ? '' : `<div class="succ-acts"><button type="button" class="button" data-succ-letter="contrat">${esc(i18n('📝 Contrat de révélation'))}</button><button type="button" class="button secondary" data-succ-letter="contact">${esc(i18n('✉️ Lettre de premier contact'))}</button><button type="button" class="button secondary" data-succ-serial>${esc(i18n('✉️ Courrier à plusieurs…'))}</button></div>`}</div>
            <div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Héritier'))}</th><th>${esc(i18n('Courrier'))}</th><th>${esc(i18n('Envoyé'))}</th><th>${esc(i18n('Réponse'))}</th><th>${esc(i18n('Contrat'))}</th><th></th></tr></thead><tbody>${heirs.map(tr).join('')}</tbody></table></div>
            <p class="ui-hint succ-swipe">${esc(i18n('↔ Faire glisser le tableau.'))}</p>
            <p class="ui-hint">${esc(i18n('📝 Le contrat ne nomme pas le défunt avant signature. Écris toi-même le pourcentage d’honoraires et la date limite. Rien n’est envoyé par l’app.'))}</p>
            <p class="ui-hint">${esc(i18n('Chaque courrier va dans le Registre de courriers, avec sa relance.'))} <button type="button" class="link-button" data-succ-registre>${esc(i18n('↗ Registre de courriers'))}</button></p></section>`;
    }
    /** les modèles (aussi dans le traitement de texte) : rien n'y révèle le défunt avant la signature */
    const TEMPLATES = {
        contact: () => [i18n('Madame, Monsieur,'), i18n('Généalogiste successoral, je suis chargé(e) par une étude notariale de retrouver les héritiers d’une personne décédée. Mes recherches me laissent penser que vous pourriez faire partie de sa famille.'), i18n('Pour le vérifier, pourriez-vous me confirmer votre date et votre lieu de naissance, ainsi que les noms de vos parents ? Vous pouvez me répondre par courrier, par téléphone ou par courriel.'), i18n('Cette démarche ne vous engage à rien.'), i18n('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.')].join('\n\n'),
        contrat: () => [i18n('CONTRAT DE RÉVÉLATION DE SUCCESSION'), i18n('Entre {heir}, ci-après « l’héritier », et {sender}, généalogiste successoral.'), i18n('Le généalogiste a découvert une succession en cours dans laquelle l’héritier pourrait avoir des droits. Il s’engage à lui en révéler l’origine (le nom de la personne décédée, l’étude notariale chargée du règlement) dès la signature du présent contrat, et à réunir les actes qui prouvent sa qualité d’héritier.'), i18n('En contrepartie, l’héritier s’engage à verser au généalogiste des honoraires de ____ % (hors taxes) de l’actif net qui lui reviendra, payables seulement s’il reçoit effectivement une part de la succession. Les frais de recherche sont compris.'), i18n('Cette proposition est valable jusqu’au ____________.'), i18n('Fait en deux exemplaires, à ____________, le ____________.'), i18n('L’héritier (« Lu et approuvé », signature) — Le généalogiste')].join('\n\n'),
        relance: () => [i18n('Madame, Monsieur,'), i18n('Je me permets de revenir vers vous au sujet de mon courrier du {sent}, resté sans réponse. Une succession en cours pourrait vous concerner : pourriez-vous me contacter ?'), i18n('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.')].join('\n\n'),
    };
    const fillT = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
    const sender = () => { const c = store.get('genealogie-courriers-lettres', {}) || {}; return c.sender || {}; };
    /* ── ✉️ Courriers en série (B6) : la même lettre à plusieurs héritiers, des champs, un aperçu par lettre, rangée d'un coup ──
     * Décochés d'office : sans adresse, 🔎 introuvable, 🔇 ne répond pas (signalés) ; jamais ceux dont l'existence n'est pas
     * établie. Champs : {civilité} {prénom} {nom} {adresse} {qualité} {dossier} {notaire} (contrat) {date} {envoyé_le}
     * (le courrier précédent) {expéditeur} ; le nom du défunt n'est jamais un champ. Modèles à soi : la généalogie des dossiers. */
    const SERIAL_KINDS = [['contact', 'Premier contact'], ['contrat', 'Contrat de révélation'], ['relance', 'Relance']];
    function letterDialog(D, R, kind, only = 0, serial = false) {
        const O_ = OC();
        const all = O_.recipients(D, R).filter(r => !only || r.id === only);
        const sel = new Set(all.filter(r => only ? true : r.checked).map(r => r.id));
        const s = sender(), senderTxt = [s.name, s.address].filter(Boolean).join(', ');
        const own = new Map(); // ✎ lettres retouchées à la main, par héritier
        let edited = false, mine = [], at = 0, view = 'model';
        const why = r => r.why === 'introuvable' ? `🔎 ${i18n('introuvable')}${r.since ? ' ' + i18n('depuis le {d}', {d: fmtDate(r.since)}) : ''} · ${i18n('décoché')}` : r.why === 'silence' ? `🔇 ${i18n('ne répond pas')}${r.since ? ' ' + i18n('depuis le {d}', {d: fmtDate(r.since)}) : ''} · ${i18n('décoché')}` : r.why === 'noaddr' ? `${i18n('pas d’adresse dans le Répertoire des vivants')} · ${i18n('décoché')}` : '';
        const sub = r => [r.address, why(r), r.last ? i18n('déjà écrit le {d} ({k})', {d: fmtDate(r.last.date), k: kindLabel(r.last.kind).toLocaleLowerCase()}) : ''].filter(Boolean).join(' · ');
        const chips = k => O_.FIELDS.filter(f => f !== 'notaire' || k === 'contrat').map(f => `<button type="button" class="succ-chip" data-succ-field="${f}">{${esc(f)}}</button>`).join('');
        return ext.openDialog({eyebrow: i18n('✉️ HÉRITIERS CONTACTÉS'), title: serial || all.length > 1 ? i18n('✉️ Courriers en série · {n}', {n: D.number}) : kind === 'contrat' ? i18n('📝 Contrat de révélation') : kind === 'relance' ? i18n('Relance') : i18n('✉️ Lettre de premier contact'), wide: true, submitLabel: i18n('📋 Ranger dans le Registre de courriers'),
            body: `<div class="succ-letter succ-serial"><div class="succ-letter-side"><p class="succ-serial-count" data-succ-scount></p><span class="pk-lab">${esc(i18n('À qui'))}</span><ul class="succ-letter-who">${all.map(r => `<li class="${r.why ? 'is-off' : ''}">${UI().checkHtml(r.name, {checked: sel.has(r.id), attrs: `data-succ-to="${r.id}"`, sub: sub(r)})}</li>`).join('')}</ul>
                <p class="ui-hint">${esc(i18n('Les héritiers dont l’existence n’est pas établie ne sont pas dans la liste. Les décochés peuvent être cochés à la main (une lettre sans adresse est alors imprimée sans bloc adresse).'))}</p>
                <label>${esc(i18n('Modèle'))}<select name="kind">${SERIAL_KINDS.map(([k, l]) => `<option value="${k}"${kind === k ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}<optgroup label="${esc(i18n('Mes modèles'))}" data-succ-mine></optgroup></select></label>
                <div class="form-grid"><label>${esc(i18n('Envoyé le'))}<input type="date" name="date_envoi" value="${today()}"></label><label>${esc(i18n('Relance dans (jours)'))}<input type="number" name="relance_jours" min="0" max="365" value="30"></label></div>
                <p class="ui-hint">${esc(i18n('Le nom du défunt n’est pas écrit : il est révélé après la signature.'))}</p></div>
                <div class="succ-letter-main"><div class="segmented succ-serial-view" role="tablist"><button type="button" role="tab" data-succ-sview="model" class="is-active" aria-selected="true">${esc(i18n('Modèle'))}</button><button type="button" role="tab" data-succ-sview="preview" aria-selected="false">${esc(i18n('Aperçu'))}</button></div>
                <div data-succ-smodel><span class="pk-lab">${esc(i18n('La lettre · clic sur un champ pour l’insérer'))}</span><div class="succ-chips" data-succ-chips>${chips(kind)}</div>
                <label class="sr-only" for="succ-serial-letter">${esc(i18n('La lettre'))}</label><textarea id="succ-serial-letter" name="letter" rows="16" maxlength="20000" class="cl-letter"></textarea>
                <p class="ui-hint">${esc(i18n('{envoyé_le} : la date du courrier précédent à cet héritier ; {date} : la date d’envoi de celui-ci.'))}</p></div>
                <div data-succ-spreview hidden><div class="succ-serial-nav"><button type="button" class="icon-button small" data-succ-snav="-1" aria-label="${esc(i18n('Lettre précédente'))}">‹</button><b data-succ-sat></b><button type="button" class="icon-button small" data-succ-snav="1" aria-label="${esc(i18n('Lettre suivante'))}">›</button></div>
                    <div class="succ-serial-page" data-succ-spage data-i18n-off></div>
                    <div class="succ-acts"><button type="button" class="button small secondary" data-succ-sedit>${esc(i18n('✎ Retoucher cette lettre'))}</button><button type="button" class="button small secondary" data-succ-sback hidden>${esc(i18n('↺ Revenir au modèle'))}</button></div>
                    <textarea name="own" rows="12" maxlength="20000" class="cl-letter" data-succ-sown hidden aria-label="${esc(i18n('✎ Retoucher cette lettre'))}"></textarea></div>
                <div data-succ-swarn></div>
                <div class="cl-out"><button type="button" class="button small secondary" data-succ-tpl-save>${esc(i18n('＋ Enregistrer comme modèle'))}</button><button type="button" class="button small secondary" data-out="print">${esc(i18n('🖨 Imprimer ou ⤓ PDF'))}</button><button type="button" class="button small secondary" data-out="wp">${esc(i18n('📝 Traitement de texte'))}</button><button type="button" class="button small secondary" data-out="mail">${esc(i18n('✉️ Courriel prêt'))}</button></div>
                <p class="succ-serial-prog" data-succ-sprog hidden></p></div></div>`,
            onOpen: d => {
                const f = d.querySelector('form');
                const chosen = () => all.filter(r => sel.has(r.id));
                const vals = r => O_.letterValues(D, r, {t: i18n, date: fmtDate(f.date_envoi.value), sent: r.last ? fmtDate(r.last.date) : '', sender: senderTxt || ''});
                const textOf = r => (own.has(r.id) ? own.get(r.id) : O_.fillLetter(f.letter.value, vals(r)).text);
                const bad = () => O_.unknownFields(f.letter.value, O_.FIELDS.filter(x => x !== 'notaire' || f.kind.value === 'contrat' || mine.some(m => `t${m.id}` === f.kind.value)));
                const paint = () => {
                    const k = f.kind.value, m = mine.find(x => `t${x.id}` === k);
                    if (!edited) f.letter.value = m ? m.body : TEMPLATES[TEMPLATES[k] ? k : 'contact']();
                    d.querySelector('[data-succ-chips]').innerHTML = chips(m ? 'contrat' : k);
                    refresh();
                };
                const refresh = () => {
                    const list = chosen();
                    d.querySelector('[data-succ-scount]').textContent = i18n('Lettres prêtes : {n} sur {m}', {n: list.length, m: all.length});
                    const b = bad();
                    d.querySelector('[data-succ-swarn]').innerHTML = b.length ? UI().notice('warn', i18n('Champ inconnu : {f} (ligne {l}). Corrige-le avant de ranger les lettres.', {f: b.map(x => `{${x.name}}`).join(', '), l: b.map(x => x.line).join(', ')})) : '';
                    const out = d.querySelector('[data-succ-tpl-save]').closest('.cl-out');
                    out.querySelector('[data-out="print"]').textContent = list.length > 1 ? i18n('🖨 Imprimer les {n}', {n: list.length}) : i18n('🖨 Imprimer ou ⤓ PDF');
                    if (view === 'preview') drawPreview();
                };
                const drawPreview = () => {
                    const list = chosen(); const page = d.querySelector('[data-succ-spage]');
                    if (!list.length) { page.innerHTML = `<p class="muted">${esc(i18n('Coche au moins un héritier.'))}</p>`; d.querySelector('[data-succ-sat]').textContent = ''; return; }
                    at = Math.max(0, Math.min(at, list.length - 1)); const r = list[at];
                    d.querySelector('[data-succ-sat]').textContent = i18n('Lettre {i} / {n} · {name}', {i: at + 1, n: list.length, name: r.name});
                    const addr = [r.name, ...(D.addresses?.[r.id]?.lines || [])];
                    const body = own.has(r.id) ? esc(own.get(r.id)) : O_.fillLetter(f.letter.value, vals(r)).parts.map(p => p.empty ? `<mark class="succ-empty" title="${esc(i18n('Champ vide : la ligne s’écrit sans le mot'))}">{${esc(p.field)}}</mark>` : p.field ? `<span class="succ-filled">${esc(p.text)}</span>` : esc(p.text)).join('');
                    page.innerHTML = `${D.addresses?.[r.id] ? `<p class="succ-serial-addr">${addr.map(esc).join('<br>')}</p>` : ''}${own.has(r.id) ? `<p class="succ-serial-own">${esc(i18n('✎ modifiée à la main'))}</p>` : ''}<div class="succ-serial-text">${body}</div>${senderTxt ? '' : `<p class="ui-hint">${esc(i18n('Ton nom et ton adresse : Listes → Registre de courriers → ✉️ Lettres (expéditeur).'))}</p>`}`;
                    const ta = d.querySelector('[data-succ-sown]'); ta.hidden = true;
                    d.querySelector('[data-succ-sback]').hidden = !own.has(r.id);
                };
                const setView = v => { view = v; d.querySelectorAll('[data-succ-sview]').forEach(b => { const on = b.dataset.succSview === v; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); }); d.querySelector('[data-succ-smodel]').hidden = v !== 'model'; d.querySelector('[data-succ-spreview]').hidden = v !== 'preview'; refresh(); };
                paint();
                get('tpl_list').then(r => { mine = r.items || []; const g = d.querySelector('[data-succ-mine]'); g.innerHTML = mine.map(m => `<option value="t${m.id}">${esc(m.name)}</option>`).join(''); if (!mine.length) g.label = i18n('Mes modèles (aucun pour l’instant)'); }).catch(() => {});
                f.letter.addEventListener('input', () => { edited = true; refresh(); });
                f.kind.addEventListener('change', async () => { if (edited && !(await A().confirmBox(i18n('Remplacer ta lettre par ce modèle ?'), {title: i18n('Changer de modèle'), okLabel: i18n('Remplacer')}))) return; edited = false; paint(); });
                f.date_envoi.addEventListener('change', refresh);
                d.addEventListener('change', e => { const b = e.target.closest('[data-succ-to]'); if (b) { const id = Number(b.dataset.succTo); b.checked ? sel.add(id) : sel.delete(id); refresh(); } });
                d.addEventListener('click', async e => {
                    const fl = e.target.closest('[data-succ-field]');
                    if (fl) { const ta = f.letter, tok = `{${fl.dataset.succField}}`, a = ta.selectionStart ?? ta.value.length; ta.setRangeText(tok, a, ta.selectionEnd ?? a, 'end'); ta.focus(); edited = true; return refresh(); }
                    const sv = e.target.closest('[data-succ-sview]'); if (sv) return setView(sv.dataset.succSview);
                    const nv = e.target.closest('[data-succ-snav]'); if (nv) { at += Number(nv.dataset.succSnav); return drawPreview(); }
                    if (e.target.closest('[data-succ-sedit]')) { const r = chosen()[at]; if (!r) return; const ta = d.querySelector('[data-succ-sown]'); ta.value = textOf(r); ta.hidden = false; ta.focus(); ta.oninput = () => { own.set(r.id, ta.value); d.querySelector('[data-succ-sback]').hidden = false; }; return; }
                    if (e.target.closest('[data-succ-sback]')) { const r = chosen()[at]; if (r && await A().confirmBox(i18n('Oublier les retouches de la lettre à {name} ?', {name: r.name}), {title: i18n('↺ Revenir au modèle'), okLabel: i18n('Revenir au modèle')})) { own.delete(r.id); drawPreview(); } return; }
                    if (e.target.closest('[data-succ-tpl-save]')) {
                        if (!f.letter.value.trim()) return toast(i18n('La lettre est vide.'), 'error');
                        const name = String(await A().askText({title: i18n('＋ Enregistrer comme modèle'), message: i18n('Nom du modèle'), value: '', okLabel: i18n('Enregistrer')}) || '').trim(); if (!name) return;
                        try { const r = await post({op: 'tpl_save', name, kind: SERIAL_KINDS.some(x => x[0] === f.kind.value) ? f.kind.value : 'autre', body: f.letter.value}); mine.push({id: r.id, name, body: f.letter.value}); const g = d.querySelector('[data-succ-mine]'); g.insertAdjacentHTML('beforeend', `<option value="t${r.id}">${esc(name)}</option>`); g.label = i18n('Mes modèles');
                            A().undoToast(i18n('Modèle « {name} » enregistré (Mes modèles, communs à tous les dossiers de cette généalogie)', {name}), {undo: async () => { await post({op: 'tpl_delete', id: r.id}); g.querySelector(`option[value="t${r.id}"]`)?.remove(); }}); } catch (err) { toast(err.message, 'error'); }
                        return;
                    }
                    const out = e.target.closest('[data-out]')?.dataset.out; if (!out) return;
                    const list = chosen(); if (!list.length) return toast(i18n('Coche au moins un héritier.'), 'error');
                    if (bad().length) return toast(i18n('Corrige d’abord le champ inconnu.'), 'error');
                    const texts = list.map(r => ({r, text: textOf(r)}));
                    const addrOf = r => (D.addresses?.[r.id] ? [r.name, ...(D.addresses[r.id].lines || [])].join('\n') : '');
                    if (out === 'print') UI().openPrintDialog({title: i18n('Courriers aux héritiers'), key: 'courrier', html: texts.map(({r, text}) => `<section data-k-page class="succ-print-letter" style="page-break-after:always;font:11pt/1.5 Georgia,serif;white-space:pre-wrap">${addrOf(r) ? `<p style="text-align:right">${esc(addrOf(r))}</p>` : ''}${esc(text)}</section>`).join(''), paper: 'A4', orientation: 'portrait', photos: false});
                    if (out === 'wp') { const html = texts.map(({r, text}) => (addrOf(r) ? `<p>${esc(addrOf(r)).replace(/\n/g, '<br>')}</p>` : '') + text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')).join('<p><br></p>'); ext.openTextDoc?.({data: ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(html) : null, name: i18n('Courriers aux héritiers')}); }
                    if (out === 'mail') { const to = list.map(r => D.addresses?.[r.id]?.email).filter(Boolean); const a = document.createElement('a'); a.href = `mailto:${encodeURIComponent(to.join(','))}?subject=${encodeURIComponent(i18n('Recherche d’héritiers'))}&body=${encodeURIComponent(texts[0].text.slice(0, 1800))}`; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); toast(i18n('Ton logiciel de courriel s’ouvre : relis la lettre et envoie-la toi-même. Rien n’est envoyé par l’app.')); }
                });
                d._succSerial = {chosen, textOf, bad};
            },
            onSubmit: async form => {
                const dlg = form.closest('dialog'), x = dlg._succSerial, list = x.chosen();
                if (!list.length) return UI().fail(form.letter, i18n('Coche au moins un héritier.'));
                if (!form.letter.value.trim()) return UI().fail(form.letter, i18n('La lettre est vide.'));
                if (x.bad().length) return UI().fail(form.letter, i18n('Corrige d’abord le champ inconnu.'));
                const k = SERIAL_KINDS.some(y => y[0] === form.kind.value) ? form.kind.value : 'contact';
                const objet = k === 'contrat' ? i18n('Premier contact + contrat') : k === 'relance' ? i18n('Relance') : i18n('Premier contact');
                const made = [], prog = dlg.querySelector('[data-succ-sprog]');
                try {
                    for (let i = 0; i < list.length; i += 50) { // plus de 50 héritiers : par paquets, la barre d'avancement ; ↶ Annuler reste en une fois
                        if (list.length > 50) { prog.hidden = false; prog.innerHTML = `${esc(i18n('Rangement : {n} sur {m}', {n: i, m: list.length}))} <progress max="${list.length}" value="${i}"></progress>`; }
                        const part = list.slice(i, i + 50);
                        const r = await post({op: 'file_letters', case_id: D.id, kind: k, objet, date_envoi: form.date_envoi.value, relance_jours: Number(form.relance_jours.value) || 0, quiet: i + 50 < list.length ? 1 : 0,
                            letters: part.map(h => ({person_id: h.id, letter: x.textOf(h), recipient_address: (D.addresses?.[h.id]?.lines || []).join('\n'), recipient_email: D.addresses?.[h.id]?.email || ''}))});
                        made.push(...(r.ids || []));
                    }
                } catch (e) { toast(e.message, 'error'); if (made.length) await post({op: 'unfile_letters', case_id: D.id, ids: made}).catch(() => {}); return false; }
                const rel = Number(form.relance_jours.value) || 0, relDay = rel ? (() => { const dd = new Date(form.date_envoi.value + 'T12:00:00'); dd.setDate(dd.getDate() + rel); return dd.toISOString().slice(0, 10); })() : '';
                A().undoToast(relDay ? i18n('{n} rangés dans le Registre de courriers, relance le {d}', {n: plural(made.length, 'courrier'), d: fmtDate(relDay)}) : i18n('{n} rangés dans le Registre de courriers', {n: plural(made.length, 'courrier')}),
                    {undo: async () => { await post({op: 'unfile_letters', case_id: D.id, ids: made}); reload(); }});
                reload();
            }});
    }

    /* ── 🖨 Tableau généalogique pour le notaire : tableau, arbre, 🧾 chaîne de filiation (B4), liste des pièces ── */
    const abbr = (D, key) => { const a = D.acts?.[key]; const k = key[0]; const l = {N: i18n('N.'), D: i18n('D.'), M: i18n('M.'), V: i18n('Div.'), R: i18n('Ren.')}[k] || ''; return a ? [l, a.place, a.year].filter(Boolean).join(' ') : `${l} ${i18n('(à fournir)')}`; };
    const NPAGES = [['table', 'Tableau'], ['tree', 'Arbre'], ['chain', 'Chaîne par héritier'], ['pieces', 'Liste des pièces']];
    const npages = () => ({table: true, tree: true, chain: true, pieces: true, ...(store.get('lcnda-succ-npages', {}) || {})}); // cochées d'office (la chaîne aussi)
    /** la qualité d'un héritier, avec les représentés (« nièce, repr. Louise ») */
    const qualityOf = (R, r) => { const rep = []; let x = R.rows.find(y => y.id === r.id); while (x?.parent) { const pr = R.rows.find(y => y.id === x.parent); if (!pr) break; rep.unshift(pr.name.split(' ')[0]); x = pr; } return r.kin + (rep.length ? ', ' + i18n('repr. {who}', {who: rep.length > 1 ? i18n('{a} et {b}', {a: rep.slice(0, -1).join(', '), b: rep[rep.length - 1]}) : rep[0]}) : '') + (r.unknown ? ' — ' + i18n('existence à ce jour non établie') : ''); };
    /** 🧾 la chaîne de filiation : pour chaque héritier, du défunt vers lui, chaque acte avec sa cote ; aucun texte de loi recopié */
    function chainHtml(D, R, P_) {
        const ch = OC().filiationChain(D, R, P_);
        const cell = 'padding:1mm 2mm;vertical-align:top';
        const state = st => st.state === 'have' ? (st.sources.length ? esc(st.sources.join(' ; ')) : `<i>${esc(i18n('en main, cote non notée'))}</i>`)
            : st.state === 'asked' ? `<i>${esc(st.asked?.date ? i18n('demandé le {d}', {d: fmtDate(st.asked.date)}) : i18n('demandé'))}</i>` : `<i class="succ-chain-miss" style="font-style:italic">${esc(i18n('acte à fournir'))}</i>`;
        const line = st => `<tr><td style="${cell};white-space:nowrap"><b>${esc((abbr(D, st.key).split(' ')[0]))}</b></td><td style="${cell}">${st.seen ? `${esc(st.what)} <small>${esc(i18n('(commun, voir {n})', {n: st.seen}))}</small>` : `${esc(st.what)}${st.act ? ', ' + esc(st.act) : ''} · ${state(st)}`}</td></tr>`;
        const arts = OC().citedArticles(R);
        const head = `<h1 style="font:700 15pt Georgia,serif;text-align:center;margin:0 0 3mm">${esc(i18n('CHAÎNE DE FILIATION'))}</h1><p style="text-align:center;margin:0 0 5mm">${esc(i18n('Succession de {name}, décédé(e) à {place} le {date}', {name: D.deceased, place: D.death_place_text || '…', date: D.death_date_text || '…'}))}<br>${esc(i18n('Dossier {n} · Réf. notaire {ref}', {n: D.number, ref: D.notary_ref || '—'}))}</p>`;
        const heirs = ch.map(h => { const r = R.rows.find(x => x.id === h.id) || h; return `<h2 style="font:700 11.5pt Georgia,serif;margin:4mm 0 1mm">${esc(`${h.n}. ${h.name} — ${qualityOf(R, r)} — ${h.share}`)}</h2><table class="succ-chain" style="width:100%;border-collapse:collapse;font:10pt Georgia,serif"><tbody>${h.steps.map(line).join('') || `<tr><td style="${cell}">—</td></tr>`}</tbody></table>`; }).join('');
        const foot = `<p style="font:9pt Georgia,serif;margin-top:5mm">${esc(i18n('Calcul établi d’après les actes cités, sous réserve de vérification par le notaire.'))}${arts.length ? ' ' + law(esc(i18n('Code civil, articles cités pour ce dossier : art. {list}.', {list: arts.join(', ')}))) : ''} ${esc(i18n('N. = naissance, M. = mariage, D. = décès.'))}</p>`;
        return head + heirs + foot;
    }
    function notaryHtml(D, R, P_, {addresses = false, pages = null} = {}) {
        const pg = {table: true, tree: true, chain: true, pieces: true, ...(pages || {})};
        const heirs = R.rows.filter(r => (r.role === 'heir' || r.role === 'parent' || r.role === 'spouse') && r.share !== '0');
        const groupOf = id => P_.groups.find(g => g.heirs?.includes(id));
        const common = P_.groups.find(g => g.key === 'common');
        const quality = r => qualityOf(R, r);
        const srcs = r => { const g = groupOf(r.id); const keys = P_.perHeir?.[r.id] || (g ? g.items : []).map(i => i.key); const list = keys.map(k => abbr(D, k) + ((D.acts?.[k]?.sources || []).length ? ` [${D.acts[k].sources.join(' ; ')}]` : '')); return list.join(' ; ') || '—'; };
        const head = `<h1 style="font:700 16pt Georgia,serif;text-align:center;margin:0 0 4mm">${esc(i18n('TABLEAU GÉNÉALOGIQUE'))}</h1><p style="text-align:center;margin:0 0 6mm">${esc(i18n('Succession de {name}, décédé(e) à {place} le {date}', {name: D.deceased, place: D.death_place_text || '…', date: D.death_date_text || '…'}))}<br>${esc(i18n('Dossier {n} · Réf. notaire {ref}', {n: D.number, ref: D.notary_ref || '—'}))}</p>`;
        const table = `<table style="width:100%;border-collapse:collapse;font:10pt Georgia,serif" class="succ-ntable"><thead><tr>${['Héritier', 'Qualité', 'Part', 'Sources du lien'].map(h => `<th style="border-bottom:1.5px solid #000;text-align:left;padding:2mm">${esc(i18n(h))}</th>`).join('')}${addresses ? `<th style="border-bottom:1.5px solid #000;text-align:left;padding:2mm">${esc(i18n('Adresse'))}</th>` : ''}</tr></thead><tbody>${heirs.map(r => `<tr><td style="padding:2mm;border-bottom:.5px solid #999">${esc(r.name)}</td><td style="padding:2mm;border-bottom:.5px solid #999">${esc(quality(r))}</td><td style="padding:2mm;border-bottom:.5px solid #999"><b>${esc(r.share)}</b></td><td style="padding:2mm;border-bottom:.5px solid #999">${esc(srcs(r))}</td>${addresses ? `<td style="padding:2mm;border-bottom:.5px solid #999">${esc((D.addresses?.[r.id]?.lines || []).join(', '))}</td>` : ''}</tr>`).join('')}</tbody></table>`;
        const foot = `<p style="font:9pt Georgia,serif;margin-top:6mm">${law(esc(i18n('Calcul établi d’après les actes cités, art. 731 et suiv. du Code civil, sous réserve de vérification par le notaire. N. = naissance, M. = mariage, D. = décès.')))} ${common ? esc(i18n('Communs à tous : {list}.', {list: common.items.map(i => abbr(D, i.key)).join(' ; ')})) : ''}</p>${R.hypotheses.length ? `<p style="font:9pt Georgia,serif">${esc(i18n('Hypothèse retenue : {h}', {h: D.hypothesis_note || i18n('à préciser')}))}</p>` : ''}${R.warnings.map(w => `<p style="font:9pt Georgia,serif">⚠ ${esc(w.text)}</p>`).join('')}`;
        const p3 = `<h2 style="font:700 13pt Georgia,serif">${esc(i18n('Liste des pièces'))}</h2><table style="width:100%;border-collapse:collapse;font:9.5pt Georgia,serif"><tbody>${P_.list.filter(i => i.state !== 'na').map(i => `<tr><td style="padding:1.5mm;border-bottom:.5px solid #bbb">${esc(i.what)}</td><td style="padding:1.5mm;border-bottom:.5px solid #bbb">${esc(i.act)}</td><td style="padding:1.5mm;border-bottom:.5px solid #bbb">${esc((D.acts?.[i.key]?.sources || []).join(' ; ') || '—')}</td><td style="padding:1.5mm;border-bottom:.5px solid #bbb">${esc(i18n(STATE_P[i.state][0]))}</td></tr>`).join('')}</tbody></table>`;
        const parts = [pg.table && head + table + foot, pg.tree && `<h2 style="font:700 13pt Georgia,serif">${esc(i18n('Arbre de dévolution'))}</h2><div style="max-width:100%">${treeSvg(D, R, {print: true}).replace('<svg ', '<svg style="max-width:100%;height:auto" ')}</div>`, pg.chain && chainHtml(D, R, P_), pg.pieces && p3].filter(Boolean);
        const total = parts.length;
        const page = (inner, n) => `<section data-k-page class="succ-npage" style="page-break-after:always;padding:2mm">${inner}<p style="font:8pt Georgia,serif;text-align:right;color:#555">${esc(i18n('Page {n} / {t}', {n, t: total}))}</p></section>`;
        return parts.map((x, i) => page(x, i + 1)).join('') || `<p class="muted">${esc(i18n('Coche au moins une page.'))}</p>`;
    }
    const npagesTxt = pg => { const n = Object.values(pg).filter(Boolean).length; return pg.chain ? i18n('Tableau pour le notaire : PDF ({n} pages, avec chaîne par héritier)', {n}) : i18n('Tableau pour le notaire : PDF ({n} pages)', {n}); };
    async function printNotary(D, R, P_, {addresses = false} = {}) {
        const pg = npages();
        await UI().openPrintDialog({title: i18n('Tableau généalogique — {n}', {n: D.number}), key: 'succ-notaire', html: notaryHtml(D, R, P_, {addresses, pages: pg}), paper: 'A4', orientation: 'portrait', photos: false});
        journal(D, 'pdf', npagesTxt(pg) + (addresses ? '' : ' — ' + i18n('sans adresses')));
    }
    function tabNotary(body, D, R, P_) {
        let withAddr = false;
        const paint = () => {
            const pg = npages();
            body.innerHTML = `${OUT().checklistHtml ? `<details class="succ-box succ-ck-box" open><summary><b>${esc(i18n('📋 Avant de remettre'))}</b> <small class="muted">${esc(i18n('ça avertit, ça n’empêche pas'))}</small></summary>${OUT().checklistHtml(D, R, P_, {ro: D.archived || ['clos', 'archive'].includes(D.state)})}</details>` : ''}
                <section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Un PDF sobre, une source pour chaque lien'))}</h3><div class="succ-acts">
                <button type="button" class="button" data-succ-nprint>${esc(i18n('🖨 Imprimer ou ⤓ PDF'))}</button><button type="button" class="button secondary" data-succ-nwp>${esc(i18n('📝 Ouvrir dans le traitement de texte'))}</button><button type="button" class="button secondary" data-succ-nmedia>${esc(i18n('📁 Copie dans les médias'))}</button></div></div>
                <fieldset class="succ-npages"><legend>${esc(i18n('Ce que contient le PDF'))}</legend>${NPAGES.map(([k, l]) => UI().checkHtml(i18n(l), {checked: pg[k], attrs: `data-succ-npage="${k}"`})).join('')}${UI().checkHtml(i18n('Joindre les adresses des héritiers'), {checked: withAddr, attrs: 'data-succ-naddr'})}</fieldset>
                <div class="succ-npreview" data-i18n-off>${notaryHtml(D, R, P_, {addresses: withAddr, pages: pg})}</div>
                <p class="ui-hint">${esc(i18n('Aucune photo ni note privée : les noms, les qualités, les parts et les sources. Pas d’adresse sauf si la case est cochée.'))}</p></section>`;
            body.querySelector('[data-succ-naddr]').addEventListener('change', e => { withAddr = e.target.checked; paint(); });
            body.querySelectorAll('[data-succ-npage]').forEach(c => c.addEventListener('change', () => { store.set('lcnda-succ-npages', {...npages(), [c.dataset.succNpage]: c.checked}); paint(); }));
            body.querySelector('[data-succ-nprint]').addEventListener('click', () => printNotary(D, R, P_, {addresses: withAddr}));
            body.querySelector('[data-succ-nwp]').addEventListener('click', () => { ext.openTextDoc?.({data: ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(notaryHtml(D, R, P_, {addresses: withAddr, pages: npages()}).replace(/<section[^>]*>/g, '').replace(/<\/section>/g, '')) : null, name: i18n('Tableau généalogique — {n}', {n: D.number})}); journal(D, 'pdf', i18n('Tableau pour le notaire : ouvert dans le traitement de texte')); });
            body.querySelector('[data-succ-nmedia]').addEventListener('click', async e => {
                const T = window.LCNDA_TEXT; if (!T?.toDocx || !T?.fromText) return toast(i18n('Copie impossible : le moteur de documents n’est pas chargé.'), 'error');
                const btn = e.currentTarget; btn.disabled = true;
                try {
                    const text = body.querySelector('.succ-npreview').innerText;
                    const blob = await T.toDocx(T.fromText(text)); const u8 = new Uint8Array(await blob.arrayBuffer());
                    let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
                    await A().api('textdoc_to_media', {}, {method: 'POST', body: {file: T.toB64 ? T.toB64(u8) : btoa(bin), format: 'docx', title: i18n('Tableau généalogique — {n}', {n: D.number})}});
                    toast(i18n('Copie rangée dans les médias.')); journal(D, 'pdf', i18n('Tableau pour le notaire : copie rangée dans les médias'));
                } catch (err) { toast(i18n('Copie impossible : {nm}', {nm: err.message}), 'error'); } finally { btn.disabled = false; }
            });
        };
        paint();
    }
    const journal = async (D, kind, text) => { try { await post({op: 'journal', case_id: D.id, kind, text}); D.journal.unshift({at: new Date().toISOString().slice(0, 19).replace('T', ' '), kind, text}); } catch (_) {} };

    /* ── 🕓 Journal du dossier ── */
    const atTxt = at => { const m = String(at).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : at; };
    function tabJournal(body, D) {
        body.innerHTML = `<section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('🕓 Journal du dossier {n}', {n: D.number}))} <small class="muted">${esc(i18n('(on ne peut ni le modifier ni l’effacer)'))}</small></h3><span class="succ-jbtns"><button type="button" class="button small secondary" data-succ-b8>📜 ${esc(i18n('Qui a vu ce dossier'))}</button><button type="button" class="button small secondary" data-succ-jcsv>${esc(i18n('⤓ Exporter le journal (CSV)'))}</button></span></div>
            ${D.journal.length ? `<ol class="succ-journal">${D.journal.map(j => `<li><time>${esc(atTxt(j.at))}</time><span data-i18n-off>${j.kind === 'law' ? S().lawJournalHtml(j.text) : esc(j.text)}</span></li>`).join('')}</ol>` : A().empty(i18n('Rien encore.'), {icon: '🕓'})}
            <p class="ui-hint">${esc(i18n('Les changements des fiches restent dans Réglages → Journal des modifications.'))}</p></section>`;
        body.querySelector('[data-succ-b8]')?.addEventListener('click', () => ext.accessLogDialog?.({caseId: D.id, number: D.number})); // 📜 app-verrou.js
        body.querySelector('[data-succ-jcsv]').addEventListener('click', () => {
            const csv = '﻿' + S().journalCsv([...D.journal].reverse().map(j => ({at: atTxt(j.at), text: j.text})), [i18n('Date'), i18n('Action')]);
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = `journal-dossier-${D.number}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            journal(D, 'export', i18n('Journal exporté (CSV)'));
        });
    }

    /* ═════ ⚖️ Un doute sur la loi ? ═════
     * La question, telle que tapée (rien d'autre : ni nom, ni dossier), part au moteur de recherche d'un site officiel qui
     * s'ouvre dans le navigateur (comme les liens Légifrance des articles) : Service-public (explique et renvoie au bon
     * article) ou Légifrance (les codes en vigueur). L'app ne choisit aucun article. Dans un dossier ouvert, hors mode
     * consultation : « ✍️ Noter dans le dossier » écrit la question au journal, avec un lien officiel collé (facultatif). */
    const LAW_BTN = () => `<button type="button" class="button secondary" data-succ-loi>${esc(i18n('⚖️ Un doute sur la loi ?'))}</button>`;
    /** ouvrir une adresse dans le navigateur, par le même chemin que les liens « succ-law » (target _blank, sans référent) */
    function openOut(url) { if (!url) return; const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); }
    function lawDialog(D = null) {
        const canNote = !!D?.id && !kiosk() && !simple();
        const go = (k, label, hint, main) => `<div class="succ-loi-site"><button type="button" class="button${main ? '' : ' secondary'}" data-succ-loi-go="${k}" disabled>${esc(i18n(label))}</button><small class="muted">${esc(i18n(hint))}</small></div>`;
        return ext.openDialog({eyebrow: i18n('⚖️ UN DOUTE SUR LA LOI ?'), title: i18n('Chercher sur un site officiel'), closeLabel: canNote ? i18n('Fermer') : '',
            submitLabel: canNote ? i18n('✍️ Noter dans le dossier') : 'Fermer',
            body: `<div class="succ-form succ-loi">
                <label>${esc(i18n('Ton problème, avec tes mots'))}<input name="q" maxlength="300" autocomplete="off" spellcheck="true" data-succ-loi-q placeholder="${esc(i18n('ex. un héritier refuse de répondre · délai pour renoncer à une succession'))}"></label>
                <p class="ui-hint succ-loi-priv">${esc(i18n('N’écris pas de nom : la question part sur internet.'))}</p>
                <div class="succ-loi-go">${go('sp', '🏛 Chercher sur Service-public', 'explique en français simple et donne le lien vers le bon article', true)}${go('lf', '📜 Chercher sur Légifrance', 'les articles des codes en vigueur', false)}</div>
                <p class="succ-loi-note">${esc(i18n('L’app ne choisit aucun article : ta question est envoyée telle quelle au site officiel, qui s’ouvre dans ton navigateur.'))}</p>
                ${canNote ? `<fieldset class="succ-loi-jr"><legend>${esc(i18n('✍️ Noter dans le dossier {n}', {n: D.number}))}</legend>
                    <label>${esc(i18n('Lien de l’article ou de la fiche (facultatif)'))}<input name="link" maxlength="500" inputmode="url" autocomplete="off" spellcheck="false" data-succ-loi-link placeholder="https://www.legifrance.gouv.fr/…"></label>
                    <p class="ui-hint">${esc(i18n('Seulement une adresse https:// de Légifrance, Service-public ou EUR-Lex.'))}</p></fieldset>` : ''}</div>`,
            onOpen: d => {
                const q = d.querySelector('[data-succ-loi-q]'), sub = d.querySelector('[type=submit]');
                const sync = () => { const empty = !q.value.trim(); d.querySelectorAll('[data-succ-loi-go]').forEach(b => { b.disabled = empty; }); if (canNote && sub) sub.disabled = empty; };
                q.addEventListener('input', sync); sync();
                q.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.isComposing) return; e.preventDefault(); openOut(S().lawSearchUrl('sp', q.value)); }); // Entrée = Service-public
                d.querySelectorAll('[data-succ-loi-go]').forEach(b => b.addEventListener('click', () => openOut(S().lawSearchUrl(b.dataset.succLoiGo, q.value))));
                setTimeout(() => q.focus(), 0);
            },
            onSubmit: canNote ? async form => {
                const question = form.q.value.trim(), link = form.link.value.trim();
                if (!question) return false;
                if (link && !S().officialLink(link)) { toast(i18n('Lien refusé : seulement une adresse https:// de Légifrance, Service-public ou EUR-Lex.'), 'error'); form.link.focus(); return false; }
                let r; try { r = await post({op: 'law_note', case_id: D.id, question, link}); } catch (e) { toast(e.message, 'error'); return false; }
                if (r?.entry && cur.data?.id === D.id) cur.data.journal.unshift(r.entry);
                toast(i18n('Noté au journal du dossier {n}.', {n: D.number}), 'success'); // le journal ne s'efface pas : pas de ↶ Annuler
                if (cur.data?.id === D.id && cur.tab === 'journal') render();
            } : () => true});
    }

    /* ── 💶 Temps et frais ── */
    const money = c => (window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(c / 100, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : (c / 100).toLocaleString('fr-FR', {minimumFractionDigits: 2})) + ' €';
    let feeRate = ''; // ⏱ temps × taux horaire sur le relevé imprimé (facultatif, jamais un montant de succession, jamais gardé)
    document.addEventListener('input', e => { if (e.target.matches?.('[data-succ-rate]')) feeRate = e.target.value; });
    function tabFees(body, D) {
        const ro = D.archived, F_ = S().fees(D.fees);
        const KIND = {time: '⏱ Temps', cost: '🧾 Frais', percent: '📝 Contrat'};
        body.innerHTML = `<section class="succ-box"><div class="succ-box-head"><h3>${esc(i18n('Le temps passé, les frais, les honoraires des contrats'))}</h3><div class="succ-acts">${ro ? '' : `<button type="button" class="button small" data-succ-fee="time">${esc(i18n('＋ Temps'))}</button><button type="button" class="button small secondary" data-succ-fee="cost">${esc(i18n('＋ Frais'))}</button><button type="button" class="button small secondary" data-succ-fee="percent">${esc(i18n('＋ Honoraires d’un contrat'))}</button>`}<button type="button" class="button small secondary" data-succ-fee-print>${esc(i18n('🖨 Relevé'))}</button></div></div>
            <div class="succ-fee-sum">${badge(i18n('{h} h {m} min passées', {h: F_.hours, m: F_.mins}), 'blue')} ${badge(i18n('Frais : {s}', {s: money(F_.cents)}), 'grey')} ${badge(i18n('{n} contrats', {n: F_.pcts.length}), 'violet')}</div>
            ${D.fees.length ? `<div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Date'))}</th><th>${esc(i18n('Sorte'))}</th><th>${esc(i18n('Quoi'))}</th><th>${esc(i18n('Valeur'))}</th><th></th></tr></thead><tbody>${D.fees.map(f => `<tr><td>${esc(fmtDate(f.day))}</td><td>${esc(i18n(KIND[f.kind]))}</td><td>${f.source === 'chrono' ? `<span title="${esc(i18n('Compté par le chronomètre'))}" aria-label="${esc(i18n('Compté par le chronomètre'))}">⏱</span> ` : ''}${esc(f.label)}${f.person_id ? ` <small class="muted">${esc(nameOf(D, f.person_id))}</small>` : ''}</td><td>${f.kind === 'time' ? esc(i18n('{h} h {m} min', {h: Math.floor(f.minutes / 60), m: f.minutes % 60})) : f.kind === 'cost' ? esc(money(f.amount_cents)) : esc(`${f.percent} %`)}</td><td>${ro ? '' : `<button type="button" class="icon-button small" data-succ-fee-edit="${f.id}" aria-label="${esc(i18n('✎ Modifier'))}" title="${esc(i18n('✎ Modifier'))}">✎</button><button type="button" class="icon-button small" data-succ-fee-del="${f.id}" aria-label="${esc(i18n('Supprimer'))}" title="${esc(i18n('Supprimer'))}">🗑</button>`}</td></tr>`).join('')}</tbody></table></div>` : A().empty(i18n('Rien de noté.'), {icon: '💶'})}
            <label class="succ-rate">${esc(i18n('Taux horaire pour le relevé (facultatif, pas gardé)'))}<span><input type="number" min="0" step="0.5" inputmode="decimal" data-succ-rate value="${esc(feeRate || '')}"> ${esc(i18n('€ / h'))}</span></label>
            <p class="ui-hint">${esc(i18n('Aucun montant de succession n’est noté.'))}</p></section>`;
    }
    function feeDialog(D, kind, fee = null) {
        const heirs = heirsToContact(cur.R);
        ext.openDialog({eyebrow: i18n('💶 TEMPS ET FRAIS'), title: fee ? i18n('✎ Modifier la ligne') : kind === 'time' ? i18n('＋ Temps') : kind === 'cost' ? i18n('＋ Frais') : i18n('＋ Honoraires d’un contrat'), submitLabel: i18n('Enregistrer'),
            onOpen: d => { if (!fee) return; const f = d.querySelector('form'); f.day.value = fee.day || today(); f.label.value = fee.label || ''; if (kind === 'time') { f.h.value = Math.floor(fee.minutes / 60); f.m.value = fee.minutes % 60; } if (kind === 'cost') f.amount.value = (fee.amount_cents / 100).toFixed(2); if (kind === 'percent') { f.percent.value = fee.percent ?? ''; f.person_id.value = String(fee.person_id || ''); } },
            body: `<div class="succ-form"><label>${esc(i18n('Date'))}<input type="date" name="day" value="${today()}"></label><label>${esc(i18n('Quoi'))}<input name="label" maxlength="300" placeholder="${esc(kind === 'cost' ? i18n('Copie d’acte, déplacement…') : kind === 'time' ? i18n('Recherches aux AD, appels…') : i18n('Contrat signé'))}"></label>
                ${kind === 'time' ? `<div class="form-grid"><label>${esc(i18n('Heures'))}<input type="number" name="h" min="0" max="999" value="1"></label><label>${esc(i18n('Minutes'))}<input type="number" name="m" min="0" max="59" value="0"></label></div>` : kind === 'cost' ? `<label>${esc(i18n('Montant (€)'))}<input type="number" name="amount" min="0" step="0.01" value=""></label>` : `<label>${esc(i18n('Pourcentage'))}<input type="number" name="percent" min="0" max="100" step="0.5" value=""></label><label>${esc(i18n('Héritier'))}<select name="person_id"><option value="">—</option>${heirs.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>`}</div>`,
            onSubmit: async form => {
                const b = {op: 'fee_save', case_id: D.id, kind, day: form.day.value, label: form.label.value, ...(fee ? {id: fee.id} : {})};
                if (kind === 'time') b.minutes = (Number(form.h.value) || 0) * 60 + (Number(form.m.value) || 0);
                if (kind === 'cost') b.amount_cents = Math.round((Number(form.amount.value) || 0) * 100);
                if (kind === 'percent') { b.percent = form.percent.value; b.person_id = Number(form.person_id.value) || 0; }
                let r; try { r = await post(b); } catch (e) { toast(e.message, 'error'); return false; }
                if (fee) A().undoToast(i18n('Ligne modifiée'), {undo: async () => { await post({op: 'fee_save', case_id: D.id, id: fee.id, kind, day: fee.day, label: fee.label, minutes: fee.minutes, amount_cents: fee.amount_cents, percent: fee.percent, person_id: fee.person_id || 0}); reload(); }});
                else A().undoToast(i18n('Noté'), {undo: async () => { await post({op: 'fee_delete', case_id: D.id, id: r.id}); reload(); }});
                reload();
            }});
    }

    /* ═════ 🌍 Héritiers à l'étranger, ❔ absents, 🗂 tables des successions, 🔍 chercher ═════ */
    function abroadDialog(D, pid) {
        const name = nameOf(D, pid), p = D.graph.persons[pid] || {};
        const langs = [['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['it', 'Italiano'], ['de', 'Deutsch'], ['pt', 'Português']];
        const vars = lang => ({notary: D.notary || '…', person: name, when: p.birth?.year ? (lang === 'fr' ? `né(e) en ${p.birth.year}` : lang === 'en' ? `born in ${p.birth.year}` : lang === 'es' ? `nacido/a en ${p.birth.year}` : lang === 'it' ? `nato/a nel ${p.birth.year}` : lang === 'de' ? `geboren ${p.birth.year}` : `nascido/a em ${p.birth.year}`) : '…', sender: [sender().name, sender().address].filter(Boolean).join('\n'), actKind: 'N'});
        ext.openDialog({eyebrow: i18n('🌍 HÉRITIER À L’ÉTRANGER'), title: i18n('Chercher {name} hors de France', {name}), wide: true, submitLabel: i18n('📋 Ranger dans le Registre de courriers'),
            body: `<div class="succ-letter"><div class="succ-letter-side"><h4>${esc(i18n('Les services à interroger'))}</h4><ul class="succ-abroad">${S().ABROAD.map(a => `<li>${esc(i18n(a.text))}</li>`).join('')}</ul>
                <p>${ext.openActLetter ? `<button type="button" class="button small secondary" data-scec>${esc(i18n('📮 Demander l’acte au Service central d’état civil'))}</button>` : ''}</p>
                <label>${esc(i18n('Langue de la lettre'))}<select name="lang">${langs.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
                <label>${esc(i18n('Destinataire'))}<textarea name="dest" rows="3" maxlength="600" placeholder="${esc(i18n('Registro civil de …, consulat de France à …'))}"></textarea></label></div>
                <div class="succ-letter-main"><label>${esc(i18n('La lettre (dans la langue du pays)'))}<textarea name="letter" rows="16" maxlength="20000" class="cl-letter" data-i18n-off></textarea></label>
                <div class="cl-out"><button type="button" class="button small secondary" data-out="print">${esc(i18n('🖨 Imprimer ou ⤓ PDF'))}</button></div></div></div>`,
            onOpen: d => {
                const f = d.querySelector('form'); const paint = () => { f.letter.value = S().abroadLetter(f.lang.value, vars(f.lang.value)); }; paint();
                f.lang.addEventListener('change', paint);
                d.querySelector('[data-scec]')?.addEventListener('click', () => { d.close(); ext.openActLetter({person_id: pid, act: 'naissance', what: 'transcription', recipient: 'scec', relation: 'autre', onFiled: async r => { await post({op: 'link_courrier', case_id: D.id, courrier_id: r.courrier_id, piece_key: 'N:' + pid, person_id: pid, kind: 'acte'}); reload(); }}); });
                d.querySelector('[data-out=print]').addEventListener('click', () => UI().openPrintDialog({title: i18n('Lettre à l’étranger'), key: 'courrier', html: `<section data-k-page style="font:11pt/1.5 Georgia,serif;white-space:pre-wrap"><p style="text-align:right">${esc(f.dest.value)}</p>${esc(f.letter.value)}</section>`, paper: 'A4', photos: false}));
            },
            onSubmit: async form => {
                let r; try { r = await post({op: 'file_letter', case_id: D.id, person_id: pid, kind: 'etranger', letter: form.letter.value, objet: i18n('Recherche d’un héritier à l’étranger : {name}', {name}), recipient_address: form.dest.value, relance_jours: 60}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('Courrier rangé dans le Registre de courriers'), {undo: async () => { await post({op: 'unfile_letter', case_id: D.id, courrier_id: r.courrier_id}); reload(); }}); reload();
            }});
    }
    function absentDialog(D, pid) {
        const name = nameOf(D, pid);
        ext.openDialog({eyebrow: i18n('❔ ABSENTS ET DISPARUS'), title: i18n('{name} : absent ou disparu ?', {name}), submitLabel: i18n('Fermer'), onSubmit: () => true,
            body: `<ol class="succ-absence">${S().ABSENCE.map(a => `<li><b>${law(esc(i18n('art. {a}', {a: a.art})))}</b> ${esc(i18n(a.text))}</li>`).join('')}</ol>
                <p class="ui-hint">${esc(i18n('Le calcul lit ce statut : un présumé absent est compté vivant, sa part est « réservée » ; un déclaré absent est compté comme mort avant.'))}</p>
                <div class="succ-acts"><button type="button" class="button secondary" data-abs="absent">${esc(i18n('Présumé absent'))}</button><button type="button" class="button secondary" data-abs="absent_declare">${esc(i18n('Déclaré absent ou jugement de décès'))}</button></div>`,
            onOpen: d => d.addEventListener('click', e => { const b = e.target.closest('[data-abs]'); if (!b) return; d.close(); setOverride(D, pid, 'status', b.dataset.abs); })});
    }
    /** 🔎 Introuvable / 🔇 Ne répond pas : enregistré dans le dossier (journal), message avec ↶ Annuler */
    async function setContact(D, pid, state) {
        const again = () => { ext.succDossiers?.memDirty?.(); return cur.id ? reload() : render(); };
        let r; try { r = await post({op: 'contact_state', case_id: D.id, person_id: pid, state}); } catch (e) { toast(e.message, 'error'); return again(); }
        A().undoToast(i18n('Contact de {name} : {state}', {name: nameOf(D, pid), state: contactWord(state)}), {undo: async () => { await post({op: 'contact_state', case_id: D.id, person_id: pid, state: r.prev.state, at: r.prev.at, undo: 1}); again(); }});
        return again();
    }
    async function setOverride(D, pid, field, value) {
        let r; try { r = await post({op: 'override', case_id: D.id, person_id: pid, field, value}); } catch (e) { return toast(e.message, 'error'); }
        A().undoToast(i18n('{name} : statut retenu changé, dévolution recalculée', {name: nameOf(D, pid)}), {undo: async () => { await post({op: 'override', case_id: D.id, person_id: pid, field, value: r.prev}); reload(); }});
        reload();
    }
    async function seek(D, pid, kind) {
        const p = D.graph.persons[pid] || {}, name = nameOf(D, pid);
        const searched = kind === 'unknown' ? i18n('Héritier à retrouver : {name}{born} — vivant ? décédé ? des enfants ? (dossier de succession {n})', {name, born: p.birth?.year ? ' ' + i18n('(né en {y})', {y: p.birth.year}) : '', n: D.number})
            : kind === 'nodesc' ? i18n('Descendance de {name} (mort avant le défunt) : un enfant reconnu ou naturel ? (dossier de succession {n})', {name, n: D.number})
                : i18n('Branche à chercher autour de {name} (dossier de succession {n})', {name, n: D.number});
        try {
            const r = await A().api('save_archive_digest', {}, {method: 'POST', body: {id: 0, record_type: 'autre', status: 'todo', searched, sought_ids: [pid], year_text: p.birth?.year ? String(p.birth.year) : ''}});
            const id = Number(r?.result?.id || r?.id || 0);
            await journal(D, 'search', i18n('Piste ouverte dans le Journal des recherches : {name}', {name}));
            A().undoToast(i18n('Piste ajoutée : Recherche → 🗓 Journal des recherches'), {undo: async () => { if (id) await A().api('delete_archive_digest', {}, {method: 'POST', body: {id}}); }});
        } catch (e) { toast(e.message, 'error'); }
    }
    function tablesDialog(D, R) {
        const C = R._ctx;
        const ancestors = []; const seen = new Set();
        const up = (x, g) => { if (g > 3) return; for (const p of C.legalParents(x)) if (!seen.has(p)) { seen.add(p); ancestors.push(p); up(p, g + 1); } };
        ancestors.push(D.deceased_id); seen.add(D.deceased_id); up(D.deceased_id, 1);
        R.rows.filter(r => r.role === 'souche' || (r.timing === 'pre' && r.role === 'out')).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); ancestors.push(r.id); } });
        ext.openDialog({eyebrow: i18n('🗂 TABLES DES SUCCESSIONS DES AD'), title: i18n('Dépouiller les tables de successions et absences'), wide: true, submitLabel: i18n('Ajouter au suivi'),
            body: `<p>${esc(i18n('Les tables de successions et absences et les mutations par décès (série Q des Archives départementales) donnent la date et le bureau de chaque succession. Coche les personnes à chercher : une ligne « à faire » chacune.'))}</p>
                <ul class="succ-letter-who">${ancestors.map(id => { const p = D.graph.persons[id]; return p ? `<li>${UI().checkHtml(S().name(p), {checked: id === D.deceased_id || !!R.rows.find(r => r.id === id), attrs: `data-tab-p="${id}"`, sub: [p.death?.year ? '† ' + p.death.year : '', p.death?.place].filter(Boolean).join(' · ')})}</li>` : ''; }).join('')}</ul>`,
            onSubmit: async form => {
                const ids = [...form.querySelectorAll('[data-tab-p]:checked')].map(b => Number(b.dataset.tabP)); if (!ids.length) return UI().fail(form.querySelector('[data-tab-p]'), i18n('Coche au moins une personne.'));
                const made = [];
                try {
                    for (const id of ids) { const p = D.graph.persons[id];
                        const r = await A().api('save_archive_digest', {}, {method: 'POST', body: {id: 0, record_type: 'succession', status: 'todo', city_name: p.death?.place || '', year_text: p.death?.year ? String(p.death.year) : '', sought_ids: [id],
                            searched: i18n('Tables des successions et absences, mutations par décès (série Q) : {name}{d}', {name: S().name(p), d: p.death?.year ? ` († ${p.death.year}${p.death.place ? ', ' + p.death.place : ''})` : ''})}});
                        made.push(Number(r?.result?.id || r?.id || 0)); }
                } catch (e) { toast(e.message, 'error'); return false; }
                await journal(D, 'search', i18n('Tables des successions : {n} à dépouiller', {n: made.length}));
                A().undoToast(i18n('{n} ajoutés aux dépouillements', {n: plural(made.length, 'dépouillement')}), {undo: async () => { for (const id of made) if (id) await A().api('delete_archive_digest', {}, {method: 'POST', body: {id}}); }});
            }});
    }

    /* ═════ État : liste de contrôle avant « Remis au notaire » ═════ */
    async function setState(D, R, st) {
        if (st === D.state) return;
        const go = async (checked, summary = '') => {
            let r; try { r = await post({op: 'state', id: D.id, state: st, checked, ...(summary ? {summary} : {})}); } catch (e) { return toast(e.message, 'error'); }
            A().undoToast(i18n('État : {s}', {s: stateLabel(st)}), {undo: async () => { await post({op: 'state', id: D.id, state: r.prev, undo: 1}); reload(); }}); reload();
        };
        if (st !== 'remis') return go(0);
        if (OUT().notaryDialog) return OUT().notaryDialog(D, R, piecesOf(D, R), go, () => printNotary(D, R, piecesOf(D, R), {})); // 📋 Avant de remettre (avertit, n'empêche pas)
        const ck = S().checklist(R, piecesOf(D, R), D, i18n);
        ext.openDialog({eyebrow: i18n('📋 LISTE DE CONTRÔLE'), title: i18n('Avant « Remis au notaire »'), submitLabel: ck.ok ? i18n('Remis au notaire') : i18n('Remettre quand même'),
            body: `<ul class="succ-check">${ck.items.map(i => `<li class="${i.ok ? 'is-ok' : 'is-no'}"><span aria-hidden="true">${i.ok ? '✓' : '✗'}</span>${esc(i.text)}</li>`).join('')}</ul>${ck.ok ? '' : UI().notice('warn', i18n('Tout n’est pas prêt : corrige d’abord, ou remets quand même (ce sera noté au journal).'))}`,
            onSubmit: () => { go(ck.ok ? 'ok' : 'forced'); }});
    }

    /* ═════ Les clics ═════ */
    document.addEventListener('click', async e => {
        const t = e.target; if (!t.closest) return;
        if (t.closest('[data-succ-new]')) { e.preventDefault(); if (ext.succDossiers?.beforeNew && await ext.succDossiers.beforeNew()) return; return caseDialog(); } // 1. la première fois : où ranger les dossiers
        const op = t.closest('[data-succ-open]'); if (op) { e.preventDefault(); return openCase(op.dataset.succOpen); }
        if (t.closest('[data-succ-back]')) { e.preventDefault(); return openCase(0); }
        const ed = t.closest('[data-succ-edit]'); if (ed) { e.preventDefault(); const id = Number(ed.dataset.succEdit); const D = cur.data?.id === id ? cur.data : await get('get', {id}).catch(err => (toast(err.message, 'error'), null)); if (D) caseDialog(D); return; }
        const del = t.closest('[data-succ-del]'); if (del) { e.preventDefault(); return deleteCase(del.dataset.succDel); }
        if (t.closest('[data-succ-b8all]')) { e.preventDefault(); return ext.openAccessLog?.(); } // 📜 tous les dossiers (app-verrou.js)
        const lo = t.closest('[data-succ-loi]'); if (lo) { e.preventDefault(); return lawDialog(lo.dataset.succLoi === 'case' && cur.data?.id === cur.id ? cur.data : null); }
        const vw = t.closest('[data-succ-view]'); if (vw) { e.preventDefault(); cur.view = vw.dataset.succView; store.set('lcnda-succ-view', cur.view); return render(); }
        const full = t.closest('[data-succ-full]'); if (full) { e.preventDefault(); t.closest('dialog')?.close?.(); A().state.listType = full.dataset.succFull === 'courriers' ? 'courriers' : 'living_contacts'; return A().setModule('listes'); }
        const hw = t.closest('[data-succ-hwrite]'); if (hw) { e.preventDefault(); const [cid, pid] = hw.dataset.succHwrite.split(':').map(Number); const c = board.cases.get(cid); if (!c) return; return letterDialog(c.D, c.R, c.D.courriers.some(x => x.person_id === pid && x.kind !== 'acte') ? 'relance' : 'contact', pid); }
        const ha = t.closest('[data-succ-haddr]'); if (ha) { e.preventDefault(); const [cid, pid] = ha.dataset.succHaddr.split(':').map(Number); const c = board.cases.get(cid); const a = c?.D.addresses?.[pid]; return openLiving(a?.contact_id || 0, pid, c ? nameOf(c.D, pid) : ''); }
        if (t.closest('[data-succ-privset]')) { e.preventDefault(); return ext.succDossiers?.openSetting?.('private'); }
        const hab = t.closest('[data-succ-habsent]'); if (hab) { e.preventDefault(); const [cid, pid] = hab.dataset.succHabsent.split(':').map(Number); const c = board.cases.get(cid); if (c) absentDialog(c.D, pid); return; }
        const mo = t.closest('[data-succ-mopen]'); if (mo) { e.preventDefault(); const r = mailRows.find(x => x.id === Number(mo.dataset.succMopen)); if (r) mailDialog(r); return; }
        const md = t.closest('[data-succ-mdel]'); if (md) { e.preventDefault(); const id = Number(md.dataset.succMdel); return A().deleteWithUndo({action: 'delete_courrier', body: {id}, type: 'courrier', id, message: 'Courrier supprimé du registre', after: () => render()}); }
        if (!cur.data || !t.closest('[data-succ-case], dialog')) return;
        const D = cur.data, R = cur.R;
        const tab = t.closest('[data-succ-tab]'); if (tab) { t.closest('dialog')?.close?.(); cur.tab = tab.dataset.succTab; store.set('lcnda-succ-tab', cur.tab); return render(); }
        const em = t.closest('[data-succ-eur-mode]'); if (em) { OUT().setEuroMode?.(em.dataset.succEurMode); return render(); }
        const fed = t.closest('[data-succ-fee-edit]'); if (fed) { const f = D.fees.find(x => x.id === Number(fed.dataset.succFeeEdit)); if (f) feeDialog(D, f.kind, f); return; }
        const sl = t.closest('[data-succ-serial]'); if (sl) return letterDialog(D, R, 'contact', 0, true);
        const st = t.closest('[data-succ-state]'); if (st) return setState(D, R, st.dataset.succState);
        if (t.closest('[data-succ-archive]')) { if (await A().confirmBox(i18n('Les adresses des vivants seront retirées du dossier et de ses courriers. Le journal reste. Continuer ?'), {title: i18n('🗄 Archiver le dossier clos'), okLabel: i18n('Archiver')})) { try { await post({op: 'archive', id: D.id}); toast(i18n('Dossier archivé.')); } catch (err) { toast(err.message, 'error'); } reload(); } return; }
        if (t.closest('[data-succ-dl-add]')) return ext.openDialog({eyebrow: i18n('ÉCHÉANCE'), title: i18n('＋ Échéance'), submitLabel: i18n('Enregistrer'), body: `<div class="succ-form"><label>${esc(i18n('Date'))}<input type="date" name="due" value="${today()}"></label><label>${esc(i18n('À faire'))}<input name="label" maxlength="300" placeholder="${esc(i18n('Remettre le tableau généalogique au notaire'))}"></label><label>${esc(i18n('Sorte'))}<select name="kind"><option value="remise">${esc(i18n('Remise au notaire'))}</option><option value="relance">${esc(i18n('Relance'))}</option><option value="declaration">${esc(i18n('Déclaration de succession'))}</option><option value="rdv">${esc(i18n('Rendez-vous'))}</option><option value="autre">${esc(i18n('Autre'))}</option></select></label></div>`,
            onSubmit: async f => { let r; try { r = await post({op: 'deadline_save', case_id: D.id, due: f.due.value, label: f.label.value, kind: f.kind.value}); } catch (err) { toast(err.message, 'error'); return false; } A().undoToast(i18n('Échéance ajoutée'), {undo: async () => { await post({op: 'deadline_delete', case_id: D.id, id: r.id}); reload(); }}); reload(); }});
        const dld = t.closest('[data-succ-dl-del]'); if (dld) { const id = Number(dld.dataset.succDlDel); try { await post({op: 'deadline_delete', case_id: D.id, id}); } catch (err) { return toast(err.message, 'error'); } A().undoToast(i18n('Échéance supprimée'), {undo: async () => { await post({op: 'deadline_restore', case_id: D.id, id}); reload(); }}); return reload(); }
        const sk = t.closest('[data-succ-seek]'); if (sk) return seek(D, Number(sk.dataset.succSeek), sk.dataset.kind);
        const ab = t.closest('[data-succ-abroad]'); if (ab) return abroadDialog(D, Number(ab.dataset.succAbroad));
        const as = t.closest('[data-succ-absent]'); if (as) return absentDialog(D, Number(as.dataset.succAbsent));
        if (t.closest('[data-succ-contact]')) { A().state.listType = 'living_contacts'; A().setModule('listes'); toast(i18n('Répertoire des vivants : « ＋ Contact », puis relie la fiche de l’héritier.')); return; }
        if (t.closest('[data-succ-tables]')) return tablesDialog(D, R);
        const pv = t.closest('[data-succ-pview]'); if (pv) { cur.pieceView = pv.dataset.succPview; return render(); }
        const ask = t.closest('[data-succ-ask]'); if (ask) return askAct(D, R, ask.dataset.succAsk);
        if (t.closest('[data-succ-relance], [data-succ-registre]')) { A().state.listType = 'courriers'; return A().setModule('listes'); }
        const lt = t.closest('[data-succ-letter]'); if (lt) return letterDialog(D, R, lt.dataset.succLetter);
        const wr = t.closest('[data-succ-write]'); if (wr) { const pid = Number(wr.dataset.succWrite); return letterDialog(D, R, D.courriers.some(c => c.person_id === pid && c.kind !== 'acte') ? 'relance' : 'contact', pid); }
        const fe = t.closest('[data-succ-fee]'); if (fe) return feeDialog(D, fe.dataset.succFee);
        const fd = t.closest('[data-succ-fee-del]'); if (fd) { const id = Number(fd.dataset.succFeeDel); await post({op: 'fee_delete', case_id: D.id, id}).catch(err => toast(err.message, 'error')); A().undoToast(i18n('Supprimé'), {undo: async () => { await post({op: 'fee_restore', case_id: D.id, id}); reload(); }}); return reload(); }
        if (t.closest('[data-succ-fee-print]')) { const F_ = S().fees(D.fees); return UI().openPrintDialog({title: i18n('Relevé de temps et de frais — {n}', {n: D.number}), key: 'succ-releve', paper: 'A4', photos: false, html: `<section data-k-page style="font:10.5pt Georgia,serif"><h1 style="font-size:15pt">${esc(i18n('Relevé de temps et de frais — {n}', {n: D.number}))}</h1><p>${esc(D.title)}</p><table style="width:100%;border-collapse:collapse">${D.fees.map(f => `<tr><td style="border-bottom:.5px solid #999;padding:1.5mm">${esc(fmtDate(f.day))}</td><td style="border-bottom:.5px solid #999;padding:1.5mm">${esc(f.label)}</td><td style="border-bottom:.5px solid #999;padding:1.5mm;text-align:right">${f.kind === 'time' ? esc(i18n('{h} h {m} min', {h: Math.floor(f.minutes / 60), m: f.minutes % 60})) : f.kind === 'cost' ? esc(money(f.amount_cents)) : esc(f.percent + ' %')}</td></tr>`).join('')}</table><p><b>${esc(i18n('{h} h {m} min passées', {h: F_.hours, m: F_.mins}))} · ${esc(i18n('Frais : {s}', {s: money(F_.cents)}))}</b></p>${Number(String(feeRate).replace(',', '.')) > 0 ? `<p>${esc(i18n('Temps × taux horaire ({r} € / h) : {s}', {r: String(feeRate).replace('.', ','), s: money(Math.round(F_.minutes * Number(String(feeRate).replace(',', '.')) * 100 / 60))}))}</p>` : ''}</section>`}); }
        if (t.closest('[data-succ-tree-print]')) { UI().openPrintDialog({title: i18n('Arbre de dévolution — {n}', {n: D.number}), key: 'succ-arbre', paper: 'A4', orientation: 'landscape', photos: false, html: `<section data-k-page>${treeSvg(D, R, {print: true}).replace('<svg ', '<svg style="max-width:100%;height:auto" ')}</section>`}); return journal(D, 'pdf', i18n('Arbre de dévolution imprimé')); }
        if (t.closest('[data-succ-tree-svg]')) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([treeSvg(D, R, {print: true})], {type: 'image/svg+xml'})); a.download = `devolution-${D.number}.svg`; document.body.appendChild(a); a.click(); a.remove(); return; }
        const node = t.closest('[data-succ-node]'); if (node) { return A().openPersonById(Number(node.dataset.succNode)); }
    });
    document.addEventListener('contextmenu', e => {
        const node = e.target.closest?.('[data-succ-node]'); if (!node || !cur.R || !ext.preuve?.openLink) return;
        const id = Number(node.dataset.succNode), ps = cur.R._ctx.legalParents(id); if (!ps.length) return;
        e.preventDefault(); ext.preuve.openLink(id, ps[0]);
    });
    document.addEventListener('keydown', e => { const node = e.target.closest?.('[data-succ-node]'); if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); A().openPersonById(Number(node.dataset.succNode)); } });
    document.addEventListener('change', async e => {
        const t = e.target; if (!t.closest) return;
        if (t.matches('[data-succ-cst]')) { // 🔎 / 🔇 : dans le dossier ouvert ou dans « Héritiers à contacter »
            const [cid, pid] = t.dataset.succCst.split(':').map(Number);
            const D = cur.data?.id === cid ? cur.data : board.cases.get(cid)?.D; if (!D || hidden()) return;
            return setContact(D, pid, t.value);
        }
        if (t.matches('[data-succ-cfilt]')) { cur.cfilt = t.value; const tb = t.closest('.succ-box')?.querySelector('.succ-heirs'); if (tb) { tb.dataset.cfilt = t.value; tb.classList.toggle('is-cfilt', !!t.value); } return; }
    });
    document.addEventListener('change', async e => {
        const t = e.target; if (!t.closest || !cur.data || !t.closest('[data-succ-case]')) return;
        const D = cur.data;
        if (t.matches('[data-succ-ov]')) return setOverride(D, Number(t.dataset.succOv), 'status', t.value);
        if (t.matches('[data-succ-adopt]')) return setOverride(D, Number(t.dataset.succAdopt), 'adoption', t.value);
        if (t.matches('[data-succ-spouse]')) return setOverride(D, Number(t.dataset.succSpouse), 'spouse', t.value);
        if (t.matches('[data-succ-note]')) { const prev = D.hypothesis_note; try { await post({op: 'save', id: D.id, hypothesis_note: t.value}); D.hypothesis_note = t.value; } catch (err) { return toast(err.message, 'error'); } return A().undoToast(i18n('Hypothèse retenue enregistrée'), {undo: async () => { await post({op: 'save', id: D.id, hypothesis_note: prev}); reload(); }}); }
        if (t.matches('[data-succ-dl-done]')) { const id = Number(t.dataset.succDlDone), v = t.checked; try { await post({op: 'deadline_done', case_id: D.id, id, done: v ? 1 : 0}); } catch (err) { return toast(err.message, 'error'); } A().undoToast(v ? i18n('Échéance faite') : i18n('Échéance à faire'), {undo: async () => { await post({op: 'deadline_done', case_id: D.id, id, done: v ? 0 : 1}); reload(); }}); return reload(); }
        if (t.matches('[data-succ-pstate]')) { const key = t.dataset.succPstate; const it = piecesOf(D, cur.R).list.find(i => i.key === key); let r; try { r = await post({op: 'piece', case_id: D.id, key, state: t.value, what: it?.what || key}); } catch (err) { return toast(err.message, 'error'); } A().undoToast(i18n('Pièce : {s}', {s: t.value ? i18n(STATE_P[t.value][0]) : i18n('D’après la fiche')}), {undo: async () => { await post({op: 'piece', case_id: D.id, key, state: r.prev?.state || '', quiet: 1}); reload(); }}); return reload(); }
        if (t.matches('[data-succ-answer], [data-succ-signed]')) { const id = Number(t.dataset.succAnswer || t.dataset.succSigned); const body = t.matches('[data-succ-answer]') ? {reponse: t.value} : {signe_le: t.value}; let r; try { r = await post({op: 'courrier_set', courrier_id: id, ...body}); } catch (err) { return toast(err.message, 'error'); } A().undoToast(i18n('Courrier mis à jour'), {undo: async () => { await post({op: 'courrier_set', courrier_id: id, undo: 1, ...r.prev}); reload(); }}); return reload(); }
    });
    window.addEventListener('lcnda:courrier-filed', () => { if (cur.data && ['pieces', 'contacts'].includes(cur.tab)) setTimeout(reload, 300); });

    /* ═════ ⋯ de la fiche : « ⚖️ Rechercher les héritiers… » (une personne décédée, pas un animal, pas en consultation) ═════ */
    ext.personMoreItems.push(detail => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || hidden()) return null;
        const dead = p.living_status === 'deceased' || (detail.events || []).some(ev => ['DEAT', 'BURI', 'CREM'].includes(ev.gedcom_tag || ev.tag));
        if (!dead) return null;
        return {icon: '⚖️', label: i18n('Rechercher les héritiers…'), run: () => openFor(Number(p.id))};
    });

    /* ═════ Le widget « ⚖️ Dossiers de succession » (dossiers en cours, prochaine échéance) ═════ */
    ext.dashboard.succ_widget = {
        load: () => (hidden() ? Promise.resolve(null) : get('deadlines').catch(() => null)),
        render: (index, widget, span, data) => {
            const limit = Math.max(1, Math.min(10, Number(widget?.limit) || 5));
            const body = !data ? A().empty(hidden() ? i18n('Pas en mode consultation.') : i18n('Les dossiers n’ont pas pu être lus.'), {icon: '⚖️'})
                : !data.open ? A().empty(i18n('Aucun dossier en cours.'), {icon: '⚖️'})
                    : `<p class="muted">${esc(plural(data.open, 'dossier en cours', 'dossiers en cours'))}</p><ul class="succ-w-list">${data.items.slice(0, limit).map(x => { const n = daysTo(x.due); return `<li><button type="button" class="succ-w-row" data-succ-open="${x.case_id}"><b>${esc(fmtDate(x.due))}</b> <span>${esc(x.label)}</span> <small class="muted">${esc(i18n('Dossier {n}', {n: x.number}))}</small> ${badge(n < 0 ? i18n('Passée') : i18n('Dans {n} j', {n}), n < 0 ? 'red' : n <= 14 ? 'yellow' : 'blue')}</button></li>`; }).join('')}</ul>`;
            return A().card(index, i18n('⚖️ Dossiers de succession'), data ? data.open : '', body, span, `<button type="button" class="button small secondary" data-succ-wall>${esc(i18n('Tout voir ↗'))}</button>`);
        },
    };
    document.addEventListener('click', e => { if (e.target.closest?.('[data-succ-wall]')) { e.preventDefault(); openCase(0); } });

    /* ═════ 📋 Registre de courriers : colonnes « Réponse » et « Signé le », filtre par dossier ═════ */
    ext.afterCourriers.push(async () => {
        if (hidden()) return;
        const page = document.querySelector('#workspace .page'); if (!page) return;
        let items = []; try { items = (await get('courriers')).items || []; } catch (_) { return; }
        if (!items.length) return;
        const by = new Map(items.map(x => [x.id, x]));
        const table = page.querySelector('[data-edit-courrier-item]')?.closest('table');
        if (table && !table.dataset.succCols) {
            table.dataset.succCols = '1';
            const head = table.querySelector('thead tr'); if (head) { const last = head.lastElementChild; ['Dossier', 'Réponse', 'Signé le'].forEach(h => { const th = document.createElement('th'); th.textContent = i18n(h); head.insertBefore(th, last); }); }
            table.querySelectorAll('tbody tr').forEach(trEl => {
                const id = Number(trEl.querySelector('[data-edit-courrier-item]')?.dataset.editCourrierItem || 0); const x = by.get(id); const last = trEl.lastElementChild;
                trEl.dataset.succNumber = x ? x.number : '';
                [x ? `<button type="button" class="table-link" data-succ-open="${x.case_id}">${esc(x.number)}</button>` : '—', x ? esc(i18n((ANSWER.find(a => a[0] === x.reponse) || ANSWER[0])[1])) : '—', x?.signe_le ? esc(fmtDate(x.signe_le)) : '—'].forEach(html => { const td = document.createElement('td'); td.innerHTML = html; trEl.insertBefore(td, last); });
            });
        } else page.querySelectorAll('[data-edit-courrier-item]').forEach(btn => { const x = by.get(Number(btn.dataset.editCourrierItem)); if (!x || btn.parentElement.querySelector('[data-succ-cbadge]')) return; btn.insertAdjacentHTML('beforebegin', `<span data-succ-cbadge>${badge('⚖️ ' + x.number, 'violet')}${x.reponse ? ' ' + badge(i18n((ANSWER.find(a => a[0] === x.reponse) || ANSWER[0])[1]), 'blue') : ''}${x.signe_le ? ' ' + badge(i18n('Signé le {d}', {d: fmtDate(x.signe_le)}), 'green') : ''}</span> `); });
        const nums = [...new Set(items.map(x => x.number))];
        if (table && !page.querySelector('[data-succ-cfilter]')) {
            const lab = document.createElement('label'); lab.className = 'succ-cfilter'; lab.innerHTML = `${esc(i18n('Dossier de succession'))} <select data-succ-cfilter><option value="">${esc(i18n('Tous les courriers'))}</option>${nums.map(n => `<option value="${esc(n)}">${esc(i18n('Dossier {n}', {n}))}</option>`).join('')}</select>`;
            table.parentElement.insertBefore(lab, table);
            lab.querySelector('select').addEventListener('change', ev => { const v = ev.target.value; table.querySelectorAll('tbody tr').forEach(trEl => { trEl.hidden = !!v && trEl.dataset.succNumber !== v; }); });
        }
    });

    /* ═════ 📝 Traitement de texte : « ⚖️ Contrat de révélation », « ⚖️ Lettre à un héritier » (seulement en usage successoral) ═════ */
    const addModels = () => {
        const T = ext.textDocTools?.TEMPLATES; if (!T) return false;
        const P_ = (t, st = 'normal', css = '') => `<p data-st="${st}"${css ? ` style="${css}"` : ''}>${t || '<br>'}</p>`;
        const para = s => String(s).split(/\n{2,}/).map(p => P_(esc(p).replace(/\n/g, '<br>'))).join('');
        const mk = (key, icon, name, hint, tpl) => ({key, icon, name, hint: i18n(hint), person: true, ask: 'Pour quel héritier ?', when: usageOn, html: async pid => {
            let heir = pid ? i18n('l’héritier') : '…', addr = [];
            try {
                const ctx = await get('letter_ctx', {person_id: pid}); const cid = ctx.cases?.[0];
                if (cid) { const D = await get('get', {id: cid}); heir = nameOf(D, pid) || heir; addr = D.addresses?.[pid]?.lines || []; }
                else { const r = await A().api('textdoc_people', {ids: String(pid)}).catch(() => ({people: {}})); heir = r.people?.[pid]?.name || heir; }
            } catch (_) {}
            const s = sender();
            return P_(esc([s.name, s.address].filter(Boolean).join('\n') || i18n('ton nom et ton adresse')).replace(/\n/g, '<br>'), 'address') + P_(esc([heir, ...addr].join('\n')).replace(/\n/g, '<br>'), 'address', 'margin-left:55%') + para(fillT(tpl(), {heir, sender: s.name || i18n('ton nom'), sent: '…'}));
        }});
        if (!T.some(x => x.key === 'succ_contrat')) T.push(mk('succ_contrat', '⚖️', 'Contrat de révélation', 'ne révèle pas le défunt avant signature ; honoraires et date limite à écrire', TEMPLATES.contrat));
        if (!T.some(x => x.key === 'succ_lettre')) T.push(mk('succ_lettre', '⚖️', 'Lettre à un héritier', 'premier contact, sans nommer le défunt', TEMPLATES.contact));
        return true;
    };
    if (!addModels()) { document.addEventListener('DOMContentLoaded', addModels, {once: true}); setTimeout(addModels, 0); }
})();
