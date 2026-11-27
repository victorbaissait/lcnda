/* LCNDA — 📇 Les annuaires du commerce de Paris (1787–1914) et 💡 les brevets d'invention du XIXᵉ siècle
 * (serveur : lib/brevets_annuaires.php ; pack : scripts/brevets-annuaires/build-annuaires.py, .github/workflows/brevets-annuaires.yml).
 *  · fiche : une ligne par piste, seulement s'il y a quelque chose à dire :
 *    « 📇 En 1855, un MAZAUD, boulanger, 12 rue de la Roquette (annuaire Didot-Bottin) ↗ source », « ✓ C'est lui » (source +
 *    événement « Lieu de résidence », ↶ Annuler), « ✗ Pas lui » (↶), « ▸ plus » (pourquoi, les années, la page numérisée) ;
 *    ou une offre discrète « 📦 Installer les annuaires » (✕ : plus proposée) pour qui a vécu à Paris.
 *  · Réglages → 📇 Annuaires et brevets : le pack (📦 Installer par tranches, pause, reprise, vérifié ; 🗑 Supprimer, ↶),
 *    l'interrupteur du bloc de la fiche, « À propos des données ».
 *  · 💡 Brevets (INPI, 1791–1901) : PAS de données dans l'app (le fichier ouvert de l'INPI n'est envoyé que par courriel,
 *    sur demande) : « Où chercher » propose la base en ligne, avec le nom à coller.
 *  · registres communs : LCNDA_EXT.dataSources (« 🔎 Ce qui le concerne »), dataLists (Listes → Données), mapLayerSources
 *    (calques des cartes : une adresse ou un nom au fil des années), monographSections (monographie de Paris),
 *    ouChercher.afterRedraw (« Où chercher »).
 * Réglage : localStorage['genealogie-brevets-annuaires'] = {off, dismiss} ; téléchargement en cours :
 * localStorage['genealogie-brevets-annuaires-dl'] = id. Fiche verrouillée, mode consultation : lecture seule.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    // ⚠ la vérification « installé ? » a échoué (serveur) : on le DIT (pas « pas installé » en silence), une fois toutes les 30 s au plus
    const statusErr = e => { const now = Date.now(); if (now - (statusErr.at || 0) < 30000) return; statusErr.at = now; A().toast?.(i18n('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)}), 'error'); };
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-brevets-annuaires', DL_KEY = 'genealogie-brevets-annuaires-dl';
    const TAB = ['brevets_annuaires', '25m', '📇 Annuaires et brevets'], BLOCK = ['brevets_annuaires', '📇 Annuaires de Paris'];
    const NAKALA = 'https://nakala.fr/10.34847/nkl.98eem49t';
    const SRC = 'SoDUCo, « Annuaires historiques parisiens, 1798-1914 », NAKALA (DOI 10.34847/nkl.98eem49t) — Licence Ouverte Etalab 2.0';
    const INPI = 'https://bases-brevets19e.inpi.fr/brevets', INPI_OD = 'https://www.inpi.fr/ressources/propriete-intellectuelle/open-data-brevets-du-xixe-siecle';
    const lsJson = k => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const lsSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const lsStr = k => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
    const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) {} };
    const settings = () => lsJson(KEY);
    const isOn = () => settings().off !== true;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const num = n => Number(n || 0).toLocaleString('fr-FR');
    const isParis = name => /(^|[^a-z])paris([^a-z]|$)/.test(String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());

    /* ═════════ Réglages et bloc de la fiche ═════════ */
    function register() {
        const app = A(); if (!app.defaultMaintenanceTabs) return false;
        const tabs = app.defaultMaintenanceTabs;
        if (!tabs.some(t => t[0] === TAB[0])) { const i = ['bases_officielles', 'meteo'].map(k => tabs.findIndex(t => t[0] === k)).find(x => x >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B)) {
            const i = B.findIndex(b => b[0] === BLOCK[0]);
            if (isOn() && i < 0) { const at = ['bases_officielles', 'histoire', 'monde_contexte', 'world'].map(k => B.findIndex(b => b[0] === k)).find(x => x >= 0); B.splice(at === undefined ? B.length : at + 1, 0, BLOCK); }
            if (!isOn() && i >= 0) B.splice(i, 1);
        }
        if (app.defaultPersonBlockSpans && !app.defaultPersonBlockSpans[BLOCK[0]]) app.defaultPersonBlockSpans[BLOCK[0]] = '12';
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register);
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }

    /* ═════════ 📦 Installer le pack ═════════ */
    const DL = {online: undefined, err: '', run: null, paused: null};
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    const listeners = new Set();
    let statusCache = null;
    const status = (force = false) => { if (!statusCache || force) statusCache = api('ba_status').catch(e => { statusCache = null; statusErr(e); return {installed: false, error: e?.message || String(e)}; }); return statusCache; }; // une erreur n'est pas gardée
    window.addEventListener('lcnda:installs-changed', () => { statusCache = null; });
    const changed = () => { personCache.clear(); statusCache = null; try { ext.toutSur?.forget?.('ba_'); } catch (_) {} listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };
    function paint() {
        const r = DL.run; if (!r) return;
        document.querySelectorAll('[data-ba-prog]').forEach(el => { const i = el.querySelector('i'); if (i) i.style.width = `${pct(r.received, r.size)}%`; const t = el.querySelector('small'); if (t) t.textContent = `${pct(r.received, r.size)} % · ${fmtSize(r.received)} ${i18n('sur')} ${fmtSize(r.size)}`; });
    }
    async function loadInfo(force = false) {
        if (DL.online !== undefined && !force) return DL.online;
        try { const r = await api('ba_dl_info'); DL.online = r.packs?.annuaires || null; DL.err = r.error || ''; } catch (x) { DL.online = null; DL.err = x.message; }
        const id = lsStr(DL_KEY);
        if (id && !DL.run && !DL.paused) { try { const r = await api('ba_dl_resume', {id}); if (r.exists) DL.paused = {id, received: r.received, size: r.size}; else lsSet(DL_KEY, ''); } catch (_) {} }
        return DL.online;
    }
    async function install() {
        if (DL.run) return;
        let id = DL.paused?.id || lsStr(DL_KEY), run;
        try {
            if (id) { const r = await api('ba_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('ba_dl_start', {}); if (r?.error) throw new Error(r.error); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { A().toast?.(x.message, 'error'); return; }
        lsSet(DL_KEY, id); DL.paused = null; DL.run = {...run, stop: false}; changed();
        let fails = 0;
        while (!DL.run.stop) {
            try { const r = await post('ba_dl_step', {id}); if (r?.error) throw new Error(r.error); DL.run.received = r.received; fails = 0; paint(); if (r.done) break; }
            catch (x) { if (++fails >= 3) { A().toast?.(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; changed(); return; } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run.stop) { DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; changed(); return; }
        document.querySelectorAll('[data-ba-prog] small').forEach(t => { t.textContent = i18n('Vérification et installation…'); });
        try {
            const r = await post('ba_dl_finish', {id}); if (r?.error) throw new Error(r.error);
            lsSet(DL_KEY, ''); DL.run = null; changed();
            A().undoToast?.(i18n('📇 Annuaires de Paris installés ({n} entrées).', {n: num(r.records)}), {undo: async () => { await post('ba_pack_undo', {}); changed(); }});
        } catch (x) { lsSet(DL_KEY, ''); DL.run = null; changed(); A().toast?.(x.message, 'error'); }
    }
    async function cancel() { const id = DL.paused?.id || lsStr(DL_KEY); DL.paused = null; lsSet(DL_KEY, ''); if (id) { try { await post('ba_dl_cancel', {id}); } catch (_) {} } changed(); }
    async function remove() {
        try { const r = await post('ba_pack_remove', {}); if (r?.error) throw new Error(r.error); } catch (x) { A().toast?.(x.message, 'error'); return; }
        changed();
        A().undoToast?.(i18n('🗑 Annuaires de Paris supprimés'), {undo: async () => { await post('ba_pack_restore', {}); changed(); }});
    }
    const progHtml = r => `<span class="ba-prog" data-ba-prog><span class="ba-bar"><i style="width:${pct(r.received, r.size)}%"></i></span> <small>${esc(`${pct(r.received, r.size)} % · ${fmtSize(r.received)} ${i18n('sur')} ${fmtSize(r.size)}`)}</small></span>`;
    function actsHtml(installed) {
        if (installed) return `<button type="button" class="button small secondary" data-ba-list>🔍 ${esc(i18n('Chercher dans les annuaires'))}</button> <button type="button" class="button small secondary" data-ba-remove>🗑 ${esc(i18n('Supprimer'))}</button>`;
        if (DL.run) return `${progHtml(DL.run)} <button type="button" class="button small secondary" data-ba-pause>⏸ ${esc(i18n('Pause'))}</button>`;
        const p = DL.paused;
        if (p) return `<span class="ba-prog"><span class="ba-bar"><i style="width:${pct(p.received, p.size)}%"></i></span> <small>${esc(i18n('En pause : {p} %', {p: String(pct(p.received, p.size))}))}</small></span> <button type="button" class="button small" data-ba-install>▶ ${esc(i18n('Reprendre'))}</button> <button type="button" class="button small secondary" data-ba-cancel>✕ ${esc(i18n('Abandonner'))}</button>`;
        if (DL.online === undefined) return `${window.LCNDA_UI.spinner(i18n('Recherche des données en ligne…'), {inline: true})}`;
        if (!DL.online) return `<small class="muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>`;
        return `<button type="button" class="button small" data-ba-install>📦 ${esc(i18n('Installer ({s})', {s: fmtSize(DL.online.size)}))}</button>`;
    }

    /* ═════════ La fiche : « 📇 En 1855, un MAZAUD, boulanger… » ═════════ */
    const personCache = new Map();
    function personData(pid) {
        if (!personCache.has(pid)) personCache.set(pid, api('ba_person', {id: pid}).catch(e => { personCache.delete(pid); throw e; }));
        return personCache.get(pid);
    }
    const FEMALE = /\b(mme|mlle|mile|vve|ve|veuve|dlle|dame|madame)\b/i;
    /** la phrase d'un groupe d'entrées (même nom, même métier, même rue, une ou plusieurs années) */
    function sentence(g) {
        const r = g.best, fem = FEMALE.test(r.given || '');
        const who = `${fem ? i18n('une') : i18n('un')} ${String(r.nom || '').toUpperCase()}${r.given ? ` (${r.given})` : ''}`;
        const when = g.from === g.to ? i18n('En {y}', {y: String(g.from)}) : i18n('De {a} à {b}', {a: String(g.from), b: String(g.to)});
        const many = g.count > 2 ? ` ${i18n('({n} annuaires)', {n: String(g.count)})}` : '';
        return `${when}${many}, ${who}${r.act ? `, ${r.act}` : ''}${r.address ? `, ${r.address}` : ''} (${r.book})`;
    }
    const srcLink = (url, label = '↗ source') => (url ? `${window.LCNDA_UI.extLink(url, label, {cls: 'ba-src-link', title: i18n('Voir la page de l’annuaire (numérisée)')})}` : '');
    function groupHtml(g, {pid = 0, locked = false} = {}) {
        const r = g.best;
        let acts = '';
        if (pid && !locked) {
            acts = g.verdict === 'yes' ? `<span class="ba-yes">✓ ${esc(i18n('Sur sa fiche (lieu de résidence en {y})', {y: String(r.year)}))}</span> <button type="button" class="link-button" data-ba-undo="${esc(g.key)}">↶ ${esc(i18n('Annuler'))}</button>`
                : g.verdict === 'no' ? `<span class="muted">✗ ${esc(i18n('Pas lui'))}</span> <button type="button" class="link-button" data-ba-unmark="${esc(g.key)}">↶ ${esc(i18n('Annuler'))}</button>`
                : `<button type="button" class="button small secondary" data-ba-yes="${r.id}" data-ba-key="${esc(g.key)}" title="${esc(i18n('Ajouter la source et un événement « Lieu de résidence » à sa fiche'))}">✓ ${esc(i18n('C’est lui'))}</button> <button type="button" class="button small secondary" data-ba-no="${esc(g.key)}">✗ ${esc(i18n('Pas lui'))}</button>`;
        } else if (g.verdict === 'yes') acts = `<span class="ba-yes">✓ ${esc(i18n('Sur sa fiche'))}</span>`;
        const years = (g.rows || []).map(x => `<li>${esc(String(x.year))} — ${esc(x.book)}${x.address ? ` · ${esc(x.address)}` : ''}${x.act && x.act !== r.act ? ` · ${esc(x.act)}` : ''} ${srcLink(x.url, i18n('↗ la page'))}</li>`).join('');
        const printed = r.printed && r.printed !== r.address ? `<div>${esc(i18n('Adresse imprimée : {a}', {a: r.printed}))}${r.approx ? ` · ${esc(i18n('position à la rue seulement'))}` : ''}</div>` : (r.approx ? `<div>${esc(i18n('Position à la rue seulement.'))}</div>` : '');
        return `<div class="ba-rec${g.verdict === 'no' ? ' is-no' : ''}" data-ba-group="${esc(g.key)}"><p class="ba-line">📇 ${esc(sentence(g))} ${srcLink(r.url)}</p>
            ${acts ? `<div class="ba-acts">${acts}</div>` : ''}
            <details class="ba-more"><summary>${esc(i18n('▸ plus'))}</summary>
                ${g.why?.length ? `<div class="ba-why">${esc(i18n('Pourquoi : {w}', {w: g.why.join(' · ')}))}</div>` : ''}${printed}
                ${years ? `<ul class="ba-years">${years}</ul>` : ''}
                <div class="ba-src">${esc(i18n('Texte lu automatiquement dans l’annuaire numérisé : vérifie sur la page.'))} ${esc(i18n('Source : {s}', {s: SRC}))} <a href="${NAKALA}" target="_blank" rel="noopener">↗ ${esc(i18n('le jeu de données'))}</a></div>
            </details></div>`;
    }
    function blockHtml(d, locked, opts = {}) {
        if (d.installed && d.groups?.length) {
            const showNo = !!opts.showNo, no = d.groups.filter(g => g.verdict === 'no').length;
            const list = d.groups.filter(g => showNo || g.verdict !== 'no');
            if (!list.length && !no) return '';
            return `<section class="ba-hit">${list.map(g => groupHtml(g, {pid: d.person.id, locked})).join('')}
                <p class="ba-foot"><small class="muted">${esc(i18n('Même nom, à Paris de son vivant : rien n’est sûr, compare avec tes actes.'))}</small>
                ${no && !showNo ? ` · <button type="button" class="link-button" data-ba-showno>${esc(i18n('Revoir les pistes écartées ({n})', {n: String(no)}))}</button>` : ''}
                · <button type="button" class="link-button" data-ba-list data-ba-nom="${esc(d.person.last)}">🔎 ${esc(i18n('Tous les {n} dans les annuaires', {n: String(d.person.last).toUpperCase()}))}</button></p></section>`;
        }
        if (!d.installed && d.could && !settings().dismiss && !opts.noOffer) {
            return `<div class="ba-offer"><span>📇 ${esc(i18n('A vécu à Paris : les annuaires du commerce (1787–1914) peuvent dire où il ou elle habitait, et de quoi il ou elle vivait.'))}</span>
                ${DL.run ? progHtml(DL.run) : `<button type="button" class="button small secondary" data-ba-install>📦 ${esc(i18n('Installer les annuaires'))}${DL.online ? ` (${esc(fmtSize(DL.online.size))})` : ''}</button>`}
                <a href="${NAKALA}" target="_blank" rel="noopener">↗ ${esc(i18n('le jeu de données'))}</a>
                ${opts.only ? '' : `<button type="button" class="ba-x" data-ba-dismiss title="${esc(i18n('Ne plus proposer'))}" aria-label="${esc(i18n('Ne plus proposer'))}">✕</button>`}</div>`;
        }
        return '';
    }
    async function fillPerson(host) {
        const pid = Number(host.dataset.baPerson), locked = host.dataset.baLocked === '1';
        let d; try { d = await personData(pid); } catch (_) { host.hidden = true; const c0 = cardOf(host); if (c0) c0.hidden = true; return; }
        const free = host.dataset.baOnly === '1'; // l'hôte de « 🔎 Ce qui le concerne » : rempli même hors de la page
        if (!host.isConnected && !free) return;
        if (!d.installed && d.could && DL.online === undefined && !free) loadInfo().then(() => { if (host.isConnected) fillPerson(host); });
        const html = blockHtml(d, locked, {showNo: host.dataset.baShowNo === '1', only: host.dataset.baOnly === '1', noOffer: host.dataset.baNoOffer === '1'});
        host.innerHTML = html; host.hidden = !html;
        const c = cardOf(host); if (c) c.hidden = !html;
        return !!html;
    }
    function cardOf(host) { return host.dataset.baCard !== undefined ? host.closest('.card') : null; }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail, opt = {}) => {
        const p = detail?.person;
        if (!isOn() || !p?.id || p.kind === 'animal') return '';
        const locked = Number(p.is_locked) === 1 || kiosk() || !!opt.isLocked;
        return A().card(index, BLOCK[1], '', `<div class="ba-person" data-ba-person="${Number(p.id)}" data-ba-locked="${locked ? 1 : 0}" data-ba-card hidden></div>`, 'span-12 ba-card');
    };
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        personCache.delete(Number(detail?.person?.id) || 0);
        document.querySelectorAll('#workspace .ba-person[data-ba-card]').forEach(h => { const c = cardOf(h); if (c) c.hidden = true; fillPerson(h); });
    });
    listeners.add(() => document.querySelectorAll('.ba-person[data-ba-person]').forEach(fillPerson));
    const refreshPerson = pid => { personCache.delete(pid); try { ext.toutSur?.forget?.('ba_annuaires|p' + pid); } catch (_) {} document.querySelectorAll(`.ba-person[data-ba-person="${pid}"]`).forEach(fillPerson); };

    async function sayYes(btn) {
        const host = btn.closest('[data-ba-person]'); if (!host) return;
        const pid = Number(host.dataset.baPerson), id = Number(btn.dataset.baYes), key = btn.dataset.baKey;
        btn.disabled = true;
        let r;
        try { r = await post('ba_add', {person_id: pid, id}); if (r?.error) throw new Error(r.error); } catch (e) { btn.disabled = false; A().toast?.(e.message, 'error'); return; }
        refreshPerson(pid);
        const undo = async () => { try { const x = await post('ba_undo', {person_id: pid, key: r.key || key}); if (x?.error) throw new Error(x.error); if (r.prev === 'no') await post('ba_mark', {person_id: pid, key: r.key || key, verdict: 'no'}); } catch (e) { A().toast?.(e.message, 'error'); } refreshPerson(pid); };
        A().undoToast ? A().undoToast(i18n('📇 Ajouté à sa fiche : la source et le lieu de résidence ({t})', {t: r.title}), {undo}) : A().toast?.(r.title);
    }
    async function undoYes(btn) {
        const host = btn.closest('[data-ba-person]'); if (!host) return;
        const pid = Number(host.dataset.baPerson);
        try { const x = await post('ba_undo', {person_id: pid, key: btn.dataset.baUndo}); if (x?.error) throw new Error(x.error); } catch (e) { A().toast?.(e.message, 'error'); return; }
        refreshPerson(pid);
        A().toast?.(i18n('La source et le lieu de résidence ajoutés sont retirés de sa fiche.'));
    }
    async function mark(btn, verdict) {
        const host = btn.closest('[data-ba-person]'); if (!host) return;
        const pid = Number(host.dataset.baPerson), key = verdict === 'no' ? btn.dataset.baNo : btn.dataset.baUnmark;
        let r;
        try { r = await post('ba_mark', {person_id: pid, key, verdict}); if (r?.error) throw new Error(r.error); } catch (e) { A().toast?.(e.message, 'error'); return; }
        refreshPerson(pid);
        if (verdict === 'no') A().undoToast?.(i18n('✗ Piste écartée : ce n’est pas lui.'), {undo: async () => { await post('ba_mark', {person_id: pid, key, verdict: r.prev === 'no' ? 'no' : ''}); refreshPerson(pid); }});
    }
    function dismissOffer() {
        lsSave(KEY, {...settings(), dismiss: true}); changed();
        A().undoToast?.(i18n('Les annuaires de Paris ne seront plus proposés sur les fiches (Réglages → 📇 Annuaires et brevets pour les installer).'), {undo: () => { const s = settings(); delete s.dismiss; lsSave(KEY, s); changed(); }});
    }
    function openList(nom = '') {
        const E = ext.dataListsEngine; if (!E?.open) { openSettings(); return; }
        E.open('ba_annuaires', nom ? {crit: [{key: 'name', op: 'eq', value: String(nom).toUpperCase()}]} : null);
    }

    /* ═════════ Réglages → 📇 Annuaires et brevets ═════════ */
    const ABOUT = `<details class="ba-about"><summary>${esc(i18n('À propos des données'))}</summary>
        <p>${esc(i18n('📇 Les annuaires : le projet SoDUCo (EHESS, IGN, EPITA, BnF…) a lu automatiquement les listes alphabétiques des annuaires du commerce de Paris numérisés (Bottin, Didot, Didot-Bottin, Paris-Hachette, Paris-Adresses…), de 1787 à 1914 : le nom, l’activité, l’adresse, et la position de l’adresse sur les plans anciens de Paris.'))}</p>
        <p>${esc(i18n('Source : {s}. Fichier lu : la liste alphabétique des noms (« ListNoms »), une ligne par adresse. Pas repris : la liste par professions (les mêmes commerçants rangés par métier) et le texte brut de la page (la page numérisée est à un clic).', {s: SRC}))}</p>
        <p>${esc(i18n('Attention : la lecture est automatique. Il y a des fautes de lecture (« a chitecte » pour architecte), des adresses mal placées, et toutes les années ne sont pas là (102 années entre 1787 et 1914). Vérifie toujours sur la page numérisée (lien « ↗ source »).'))}</p>
        <p>${esc(i18n('💡 Les brevets d’invention (1791–1901) : la base de l’INPI (≈ 410 000 dossiers) n’est pas dans l’app. Ses données sont « open data » (licence de réutilisation de l’INPI, gratuite), mais le fichier n’est envoyé que par courriel, après une demande de compte à l’INPI : il n’y a pas de fichier à télécharger directement. L’app propose donc de chercher sur le site de l’INPI (« Où chercher », et « 🔎 Ce qui le concerne »).'))}</p></details>`;
    function settingsHtml(st) {
        const o = DL.online;
        const desc = st.installed ? [`${num(st.records)} ${i18n('entrées')}`, st.from ? `${st.from} → ${st.to}` : '', i18n('{n} années', {n: String(st.years || 0)}), fmtSize(st.size || 0), st.built ? i18n('fabriqué le {d}', {d: st.built}) : '', st.fixture ? i18n('données d’essai') : ''].filter(Boolean).join(' · ')
            : i18n('Les habitants et commerçants de Paris dans les annuaires de 1787 à 1914 : nom, activité, adresse, position sur le plan, page numérisée.') + (o ? ` ${i18n('Téléchargement : {s} (≈ {t} une fois installé).', {s: fmtSize(o.size), t: fmtSize(o.sqlite_size || o.size)})}` : '');
        const toggle = (UI().toggleHtml || ((l, x) => `<label class="ui-toggle"><input type="checkbox" ${x.attrs} ${x.checked ? 'checked' : ''}><i></i>${esc(l)}</label>`))(i18n('📇 Sur les fiches : « En 1855, un MAZAUD, boulanger… » (les annuaires de Paris)'), {checked: isOn(), attrs: 'data-ba-on', sub: i18n('Allumé : une ligne sur la fiche quand une personne qui a vécu à Paris ressemble à une entrée des annuaires (rien sinon).')});
        return `<section class="page ba-set">${UI().pageHeader ? UI().pageHeader({title: 'Annuaires et brevets', icon: '📇', where: 'Réglages · Données', help: 'Les annuaires du commerce de Paris (1787–1914), à télécharger une fois ; les brevets d’invention du XIXᵉ siècle, à chercher en ligne.'}) : `<h2>📇 ${esc(i18n('Annuaires et brevets'))}</h2>`}
            <section class="card"><h3>${esc(i18n('Montrer'))}</h3>${toggle}</section>
            <section class="card"><h3>${esc(i18n('Les annuaires de Paris'))}</h3>
                <div class="ba-base"><span class="ba-base-ic">📇</span><span class="ba-base-txt"><b>${esc(i18n('Annuaires du commerce de Paris (1787–1914)'))}</b><br><small>${esc(desc)}</small>
                    <div class="ba-srcs">${esc(SRC)} · ${window.LCNDA_UI.extLink(NAKALA, '')}</div></span>
                    ${UI().badge ? UI().badge(i18n(st.installed ? 'Installé' : 'Pas installé'), st.installed ? 'green' : 'grey') : ''}<span class="ba-base-acts">${actsHtml(st.installed)}</span></div>
                ${UI().notice ? UI().notice('info', i18n('Le téléchargement se fait une fois ; ensuite l’app n’a plus besoin d’Internet pour chercher. Rien n’est envoyé.')) : ''}
                ${settings().dismiss ? `<p class="ba-dis">${esc(i18n('Plus proposé sur les fiches.'))} <button type="button" class="link-button" data-ba-undismiss>${esc(i18n('Proposer de nouveau'))}</button></p>` : ''}</section>
            <section class="card"><h3>💡 ${esc(i18n('Les brevets d’invention (1791–1901)'))}</h3>
                <p>${esc(i18n('Pas de données dans l’app : la base de l’INPI se consulte en ligne. Sur la page « Où chercher » d’une personne, l’app propose d’y chercher son nom.'))}</p>
                <p><a class="button small secondary" href="${INPI}" target="_blank" rel="noopener">↗ ${esc(i18n('Ouvrir la base des brevets du XIXᵉ siècle (INPI)'))}</a> ${window.LCNDA_UI.extLink(INPI_OD, i18n('Les conditions de l’open data de l’INPI'))}</p></section>
            <section class="card">${ABOUT}</section></section>`;
    }
    let redraw = () => {};
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = await status(true);
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        redraw = async (fresh = false) => { if (!ws.querySelector('.ba-set')) return; if (fresh) st = await status(true); ws.innerHTML = settingsHtml(st); };
        ws.innerHTML = settingsHtml(st);
        if (!st.installed) loadInfo().then(() => redraw());
        if (ws.__baBound) return;
        ws.__baBound = true;
        const mine = () => !!ws.querySelector('.ba-set');
        ws.addEventListener('change', e => {
            const c = e.target.closest?.('[data-ba-on]'); if (!c || !mine()) return;
            const on = !!c.checked, set = v => { lsSave(KEY, {...settings(), off: !v}); register(); };
            set(on);
            A().undoToast?.(on ? i18n('📇 Les annuaires de Paris reviennent sur les fiches.') : i18n('📇 Les annuaires de Paris ne sont plus sur les fiches.'), {undo: () => { set(!on); redraw(); }});
        });
        ws.addEventListener('click', e => {
            if (!mine() || !e.target.closest('[data-ba-undismiss]')) return;
            const s = settings(); delete s.dismiss; lsSave(KEY, s); changed();
            A().undoToast?.(i18n('Les annuaires seront de nouveau proposés sur les fiches.'), {undo: () => { lsSave(KEY, {...settings(), dismiss: true}); changed(); }});
        });
    };
    listeners.add(() => redraw(true));

    /* un seul écouteur pour les boutons (fiche, Réglages, Où chercher) */
    document.addEventListener('click', e => {
        const t = e.target; if (!t?.closest) return;
        let b;
        if ((b = t.closest('[data-ba-install]'))) { e.preventDefault(); install(); return; }
        if ((b = t.closest('[data-ba-pause]'))) { if (DL.run) DL.run.stop = true; return; }
        if ((b = t.closest('[data-ba-cancel]'))) { cancel(); return; }
        if ((b = t.closest('[data-ba-remove]'))) { remove(); return; }
        if ((b = t.closest('[data-ba-yes]'))) { sayYes(b); return; }
        if ((b = t.closest('[data-ba-undo]'))) { undoYes(b); return; }
        if ((b = t.closest('[data-ba-no]'))) { mark(b, 'no'); return; }
        if ((b = t.closest('[data-ba-unmark]'))) { mark(b, ''); return; }
        if ((b = t.closest('[data-ba-dismiss]'))) { dismissOffer(); return; }
        if ((b = t.closest('[data-ba-showno]'))) { const h = b.closest('[data-ba-person]'); if (h) { h.dataset.baShowNo = '1'; fillPerson(h); } return; }
        if ((b = t.closest('[data-ba-copy]'))) { copyName(b); return; }
        if ((b = t.closest('[data-ba-list]'))) { openList(b.dataset.baNom || ''); }
    });

    /* ═════════ 💡 Les brevets : chercher sur le site de l'INPI ═════════ */
    const nameOf = p => `${String(p.last || '').toUpperCase()} ${String(p.first || '').split(/\s+/)[0] || ''}`.trim();
    async function copyName(btn) {
        const text = btn.dataset.baCopy || '';
        try { await navigator.clipboard.writeText(text); A().toast?.(i18n('« {t} » copié : colle-le dans la case « Déposant » du site de l’INPI.', {t: text})); }
        catch (_) { window.prompt?.(i18n('Copie ce nom :'), text); }
    }
    function brevetHtml(p) {
        const n = nameOf(p);
        return `<p class="ba-line">💡 ${esc(i18n('Inventeur ? Cherche « {n} » dans les brevets d’invention de 1791 à 1901 (base de l’INPI, en ligne).', {n}))} <a class="ba-src-link" href="${INPI}" target="_blank" rel="noopener">↗ source</a>
            <button type="button" class="link-button" data-ba-copy="${esc(n)}">📋 ${esc(i18n('Copier le nom'))}</button></p>
            <p class="ba-src">${esc(i18n('Ces données ne sont pas dans l’app : la base se consulte sur le site de l’INPI.'))}</p>`;
    }

    /* « Où chercher » : ses lignes, ajoutées par son crochet (ext.ouChercher.afterRedraw), dans le même style que son plan */
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
        const pid = Number(view?.pid) || 0; if (!pid || !body) return;
        body.querySelector('.ba-ouc')?.remove();
        personData(pid).then(async d => {
            if (!body.isConnected || body.querySelector('.ba-ouc')) return;
            if (!d.installed && d.could) await loadInfo().catch(() => {});
            const items = [];
            if (d.inventor) items.push(`<li class="ouc-tip"><span class="ouc-ico" aria-hidden="true">💡</span><div class="ouc-main"><div class="ouc-name"><b>${esc(i18n('Brevets d’invention 1791–1901 (INPI)'))}</b></div>
                <div class="ouc-why">${esc(i18n('Inventeur, fabricant, artisan ? Cherche « {n} » dans la case « Déposant ». Les données ne sont pas dans l’app (fichier envoyé par l’INPI sur demande seulement).', {n: nameOf(d.person)}))}</div></div>
                <div class="ouc-acts"><a class="button small secondary" href="${INPI}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ Ouvrir'))}</a> <button type="button" class="button small secondary" data-ba-copy="${esc(nameOf(d.person))}">📋 ${esc(i18n('Copier le nom'))}</button></div></li>`);
            if (d.could) {
                const n = (d.groups || []).filter(g => g.verdict !== 'no').length;
                items.push(`<li class="ouc-tip"><span class="ouc-ico" aria-hidden="true">📇</span><div class="ouc-main"><div class="ouc-name"><b>${esc(i18n('Annuaires du commerce de Paris (1787–1914)'))}</b> ${d.installed && UI().badge ? UI().badge(i18n('Dans l’app'), 'green') : ''}</div>
                    <div class="ouc-why">${esc(d.installed ? (n ? i18n('{n} piste(s) sur sa fiche (même nom, à Paris de son vivant)', {n: String(n)}) : i18n('Rien qui lui ressemble assez : regarde tous les {n} dans la liste.', {n: String(d.person.last).toUpperCase()})) : i18n('A vécu à Paris : son adresse et son métier y sont peut-être. Installe les annuaires dans l’app.'))}</div></div>
                    <div class="ouc-acts">${d.installed ? `<button type="button" class="button small secondary" data-ba-list data-ba-nom="${esc(d.person.last)}">🔎 ${esc(i18n('Voir dans les annuaires'))}</button>` : `${DL.online ? `<button type="button" class="button small secondary" data-ba-install>📦 ${esc(i18n('Installer ({s})', {s: fmtSize(DL.online.size)}))}</button>` : ''} <a class="button small secondary" href="${NAKALA}" target="_blank" rel="noopener noreferrer">${esc(i18n('↗ Ouvrir'))}</a>`}</div></li>`);
            }
            if (!items.length) return;
            const html = `<section class="ouc-plan ba-ouc"><h3>📇 ${esc(i18n('Annuaires et brevets'))} <small class="muted">${esc(i18n('Paris 1787–1914, inventeurs 1791–1901'))}</small></h3><ul class="ouc-list">${items.join('')}</ul></section>`;
            const at = body.querySelector('.bo-ouc') || body.querySelector('.ouc-plus') || body.querySelector('.ouc-facts');
            if (at) at.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        }).catch(() => {});
    });

    /* ═════════ 🧰 les registres communs ═════════ */
    const installedNow = async () => !!(await status())?.installed;
    const pidOf = ctx => Number(ctx?.person?.id ?? ctx?.person ?? ctx?.id) || 0;
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'ba_annuaires', icon: '📇', label: 'Annuaires du commerce de Paris (1787–1914)', group: 'La personne', needs: ['person'], online: false, source: SRC, sourceUrl: NAKALA,
            installed: installedNow, install: () => install(),
            run: async (ctx, host) => {
                const pid = pidOf(ctx); if (!host) return false;
                if (!pid) { host.innerHTML = `<p class="muted">${esc(i18n('Choisis une personne.'))}</p>`; return false; }
                host.innerHTML = `<div class="ba-person" data-ba-person="${pid}" data-ba-locked="${kiosk() ? 1 : 0}" data-ba-only="1" data-ba-no-offer="1"></div>`;
                return (await fillPerson(host.firstElementChild)) || false;
            }},
        {id: 'ba_brevets', icon: '💡', label: 'Brevets d’invention 1791–1901 (INPI, en ligne)', group: 'Chercher', needs: ['person'], online: true, source: 'INPI — base des brevets du XIXᵉ siècle (consultation en ligne)', sourceUrl: INPI,
            run: async (ctx, host) => {
                const pid = pidOf(ctx); if (!host || !pid) return false;
                let d; try { d = await personData(pid); } catch (_) { return false; }
                if (!d.inventor) return false;
                host.innerHTML = `<div class="ba-person">${brevetHtml(d.person)}</div>`;
                return true;
            }});

    const FIELDS = [{key: 'name', label: 'Nom', type: 'text'}, {key: 'act', label: 'Métier ou activité', type: 'text'}, {key: 'address', label: 'Adresse', type: 'text'},
        {key: 'street', label: 'Rue (sur le plan)', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'book', label: 'Annuaire', type: 'text'}, {key: 'url', label: 'Source', type: 'url'}];
    (ext.dataLists = ext.dataLists || []).push({id: 'ba_annuaires', icon: '📇', label: 'Annuaires du commerce de Paris (1787–1914)', group: 'Le lieu', source: SRC, sourceUrl: NAKALA,
        query: async query => { const r = await api('ba_list', {query: JSON.stringify(query || {})}); return {rows: r.rows || [], total: r.total || 0, more: !!r.more}; },
        fields: FIELDS, period: r => [r.year, null], geo: r => (r.lat != null ? [r.lat, r.lon] : null),
        open: r => { if (r?.url) window.open(r.url, '_blank', 'noopener'); },
        installed: installedNow, install: () => install()});

    (ext.mapLayerSources = ext.mapLayerSources || []).push({id: 'ba_adresse', icon: '📇', label: i18n('Annuaires de Paris : une rue ou un nom au fil des années'), group: 'Le lieu', kind: 'points',
        source: SRC,
        run: async ({q, from, to, bbox, max = 1500}) => {
            if (!(await installedNow())) return {features: [], source: SRC};
            const r = await api('ba_map', {q: q || '', ...(from != null ? {from} : {}), ...(to != null ? {to} : {}), ...(bbox ? {bbox: bbox.join(',')} : {}), max});
            return {features: r.features || [], source: r.source || SRC};
        }});

    (ext.monographSections = ext.monographSections || []).push({id: 'annuaires_paris', icon: '📇', label: 'Ta famille dans les annuaires de Paris', group: 'Ta famille', defaultOn: true,
        enabled: () => isOn(), source: SRC,
        render: async (place, host, ctx) => {
            if (!isParis(place?.name)) return false;
            let d; try { d = await api('ba_place', {id: place.id || 0, name: place.name || ''}); } catch (_) { return false; }
            if (!d.installed || !d.names?.length) return false;
            host.innerHTML = `<p>${esc(i18n('{n} noms de ta famille qui ont vécu à Paris sont dans les annuaires du commerce :', {n: String(d.names.length)}))}</p>
                <ul class="ba-mono">${d.names.map(x => `<li><b>${esc(x.name)}</b> — ${esc(i18n('{e} entrées de {a} à {b}', {e: num(x.entries), a: String(x.from), b: String(x.to)}))} <small class="muted">${esc(i18n('({p} dans ta base)', {p: String(x.persons)}))}</small> <button type="button" class="link-button" data-ba-list data-ba-nom="${esc(x.name)}">🔎 ${esc(i18n('Voir'))}</button></li>`).join('')}</ul>
                <p class="ba-src">${esc(i18n('Même nom seulement : ce ne sont pas forcément tes ancêtres.'))} <a href="${NAKALA}" target="_blank" rel="noopener">↗ source</a></p>`;
            ctx?.count?.(d.names.length);
            return true;
        }});

    ext.brevetsAnnuaires = {isOn, install, remove, openSettings, openList, settings, state: DL, register, personData, status};
})();
