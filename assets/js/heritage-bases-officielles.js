/* LCNDA — 🎖️ Morts pour la France 1914–1918 et 🏅 Légion d'honneur (base Léonore)
 * (serveur : lib/bases_officielles.php ; bases : scripts/bases-officielles/build-bases.py, .github/workflows/bases-officielles.yml).
 *  · Réglages → 🎖️ Bases officielles : chaque base, sa taille, « ⤓ Installer » (par tranches, pause, reprise même après avoir
 *    fermé l'app, vérifiée avant d'être rangée ; ↶ Annuler), « 🗑 Supprimer » (↶ Annuler), « 🔎 Chercher dans la base »,
 *    « À propos des données » (sources, licences, ce qui manque).
 *  · fiche : un petit encadré sous la barre de la famille, seulement s'il y a quelque chose à dire :
 *    « 🎖️ Peut-être dans Morts pour la France » / « 🏅 Peut-être dans la Léonore » (la fiche trouvée, ↗ en ligne,
 *    « ＋ Ajouter comme source (à vérifier) », ↶ Annuler), ou une offre discrète « ⤓ Installer la base … » (✕ : plus proposé).
 *  · « 🔎 Chercher dans la base » : une page de recherche par nom (Réglages → 🎖️ Bases officielles → Chercher).
 *  · pour « Où chercher » : LCNDA_EXT.officialBases.suggest(person) → Promise de lignes (voir plus bas).
 * Réglage : localStorage['genealogie-bases-officielles'] = {dismiss: {mpf, leonore}} ; téléchargement en cours :
 * localStorage['genealogie-bases-officielles-dl'] = {mpf: id, leonore: id}. Fiche verrouillée, mode consultation : lecture seule.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-bases-officielles', DL_KEY = 'genealogie-bases-officielles-dl';
    const TAB = ['bases_officielles', '25m', '🎖️ Bases officielles'];
    const KINDS = ['mpf', 'leonore'];
    const NAMES = {mpf: ['🎖️', 'Morts pour la France 1914–1918', 'Peut-être dans Morts pour la France', 'la base Morts pour la France'],
        leonore: ['🏅', 'Légion d’honneur — base Léonore', 'Peut-être dans la Léonore', 'la base Léonore']};
    const HOME = {mpf: 'https://www.memoiredeshommes.sga.defense.gouv.fr/', leonore: 'https://www.leonore.archives-nationales.culture.gouv.fr/'};
    const lsJson = k => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const lsSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const settings = () => { const s = lsJson(KEY); return {dismiss: s.dismiss && typeof s.dismiss === 'object' ? s.dismiss : {}}; };
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const num = n => Number(n || 0).toLocaleString('fr-FR');
    const MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateFr = d => { const m = /^(\d{4})(?:-(\d\d))?(?:-(\d\d))?$/.exec(d || ''); if (!m) return d || ''; return [m[3] ? (Number(m[3]) === 1 ? '1er' : String(Number(m[3]))) : '', m[2] ? MOIS[Number(m[2])] : '', m[1]].filter(Boolean).join(' '); };

    /* ═════════ La page des Réglages, à côté de la météo ═════════ */
    function register() {
        const app = A(); if (!app.defaultMaintenanceTabs) return false;
        const tabs = app.defaultMaintenanceTabs;
        if (!tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'meteo'); tabs.splice(i >= 0 ? i + 1 : tabs.length, 0, TAB); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register);
    function openSettings(view = null) { const st = A().state; if (!st) return; PAGE.pending = view; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }

    /* ═════════ ⤓ Installer (une course par base) ═════════ */
    const DL = {online: undefined, err: '', run: {}, paused: {}};
    const dlSaved = k => String(lsJson(DL_KEY)[k] || '');
    const dlRemember = (k, id) => { const s = lsJson(DL_KEY); s[k] = id; lsSave(DL_KEY, s); };
    const dlForget = k => { const s = lsJson(DL_KEY); delete s[k]; lsSave(DL_KEY, s); };
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    const listeners = new Set(); // ce qui se redessine quand une base arrive ou part (page des Réglages, encadrés des fiches)
    const changed = () => { personCache.clear(); listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };
    function paint(kind) {
        const r = DL.run[kind]; if (!r) return;
        document.querySelectorAll(`[data-bo-prog="${kind}"]`).forEach(el => { const i = el.querySelector('i'); if (i) i.style.width = `${pct(r.received, r.size)}%`; const t = el.querySelector('small'); if (t) t.textContent = `${pct(r.received, r.size)} % · ${fmtSize(r.received)} ${i18n('sur')} ${fmtSize(r.size)}`; });
    }
    async function loadInfo(force = false) {
        if (DL.online !== undefined && !force) return DL.online;
        try { const r = await api('bo_dl_info'); DL.online = r.packs || {}; DL.err = r.error || ''; } catch (x) { DL.online = {}; DL.err = x.message; }
        for (const k of KINDS) { const id = dlSaved(k); if (id && !DL.run[k] && !DL.paused[k]) { try { const r = await api('bo_dl_resume', {id}); if (r.exists) DL.paused[k] = {id, received: r.received, size: r.size}; else dlForget(k); } catch (_) {} } }
        return DL.online;
    }
    async function install(kind) {
        if (DL.run[kind]) return;
        let id = DL.paused[kind]?.id || dlSaved(kind), run;
        try {
            if (id) { const r = await api('bo_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('bo_dl_start', {kind}); if (r?.error) throw new Error(r.error); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { A().toast?.(x.message, 'error'); return; }
        dlRemember(kind, id); delete DL.paused[kind]; DL.run[kind] = {...run, stop: false}; changed();
        let fails = 0;
        while (!DL.run[kind].stop) {
            try { const r = await post('bo_dl_step', {id}); if (r?.error) throw new Error(r.error); DL.run[kind].received = r.received; fails = 0; paint(kind); if (r.done) break; }
            catch (x) { if (++fails >= 3) { A().toast?.(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused[kind] = {id, received: DL.run[kind].received, size: DL.run[kind].size}; delete DL.run[kind]; changed(); return; } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run[kind].stop) { DL.paused[kind] = {id, received: DL.run[kind].received, size: DL.run[kind].size}; delete DL.run[kind]; changed(); return; }
        document.querySelectorAll(`[data-bo-prog="${kind}"] small`).forEach(t => { t.textContent = i18n('Vérification et installation…'); });
        try {
            const r = await post('bo_dl_finish', {id}); if (r?.error) throw new Error(r.error);
            dlForget(kind); delete DL.run[kind]; changed();
            A().undoToast?.(i18n('{i} {t} installée ({n} fiches).', {i: NAMES[kind][0], t: NAMES[kind][1], n: num(r.records)}), {undo: async () => { await post('bo_pack_undo', {kind}); changed(); }});
        } catch (x) { dlForget(kind); delete DL.run[kind]; changed(); A().toast?.(x.message, 'error'); }
    }
    async function cancel(kind) { const id = DL.paused[kind]?.id || dlSaved(kind); delete DL.paused[kind]; dlForget(kind); if (id) { try { await post('bo_dl_cancel', {id}); } catch (_) {} } changed(); }
    async function remove(kind) {
        try { const r = await post('bo_pack_remove', {kind}); if (r?.error) throw new Error(r.error); } catch (x) { A().toast?.(x.message, 'error'); return; }
        changed();
        A().undoToast?.(i18n('🗑 {t} supprimée', {t: NAMES[kind][1]}), {undo: async () => { await post('bo_pack_restore', {kind}); changed(); }});
    }
    const progHtml = (kind, r) => `<span class="bo-prog" data-bo-prog="${kind}"><span class="bo-bar"><i style="width:${pct(r.received, r.size)}%"></i></span> <small>${esc(`${pct(r.received, r.size)} % · ${fmtSize(r.received)} ${i18n('sur')} ${fmtSize(r.size)}`)}</small></span>`;
    function actsHtml(kind, installed) {
        if (installed) return `<button type="button" class="button small secondary" data-bo-search="${kind}">🔎 ${esc(i18n('Chercher dans la base'))}</button> <button type="button" class="button small secondary" data-bo-remove="${kind}">🗑 ${esc(i18n('Supprimer'))}</button>`;
        if (DL.run[kind]) return `${progHtml(kind, DL.run[kind])} <button type="button" class="button small secondary" data-bo-pause="${kind}">⏸ ${esc(i18n('Pause'))}</button>`;
        const p = DL.paused[kind];
        if (p) return `<span class="bo-prog"><span class="bo-bar"><i style="width:${pct(p.received, p.size)}%"></i></span> <small>${esc(i18n('En pause : {p} %', {p: String(pct(p.received, p.size))}))}</small></span> <button type="button" class="button small" data-bo-install="${kind}">▶ ${esc(i18n('Reprendre'))}</button> <button type="button" class="button small secondary" data-bo-cancel="${kind}">✕ ${esc(i18n('Abandonner'))}</button>`;
        if (DL.online === undefined) return `<small class="muted">${esc(i18n('Recherche des données en ligne…'))}</small>`;
        const o = DL.online[kind];
        if (!o) return `<small class="muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>`;
        return `<button type="button" class="button small" data-bo-install="${kind}">⤓ ${esc(i18n('Installer ({s})', {s: fmtSize(o.size)}))}</button>`;
    }

    /* ═════════ La fiche : « Peut-être dans … » ═════════ */
    const personCache = new Map();
    async function personData(pid) {
        if (!personCache.has(pid)) personCache.set(pid, api('bo_person', {id: pid}).catch(e => { personCache.delete(pid); throw e; }));
        return personCache.get(pid);
    }
    function recordLines(kind, r) {
        const born = [r.naiss ? dateFr(r.naiss) : '', r.lieu ? i18n('à {l}', {l: r.lieu + (r.dep ? ` (${r.dep})` : '')}) : ''].filter(Boolean).join(' ');
        const out = [];
        if (born) out.push(i18n('Né(e) {b}', {b: born}));
        if (r.deces) out.push(`† ${dateFr(r.deces)}${r.lieu_deces ? ` ${i18n('à {l}', {l: r.lieu_deces})}` : ''}`);
        const mil = [r.grade, r.unite].filter(Boolean).join(', '); if (mil) out.push(mil);
        if (r.cote) out.push(kind === 'leonore' ? i18n('Cote {c}', {c: r.cote}) : r.cote);
        if (r.autre) out.push(r.autre);
        return out;
    }
    function recordHtml(kind, r, {pid = 0, locked = false, why = true} = {}) {
        const link = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">↗ ${esc(kind === 'leonore' ? i18n('Voir la notice en ligne') : i18n('Voir la fiche numérisée'))}</a>`
            : `<a href="${esc(r.home || HOME[kind])}" target="_blank" rel="noopener">↗ ${esc(kind === 'leonore' ? i18n('Chercher sur le site Léonore') : i18n('Chercher sur Mémoire des hommes'))}</a>${kind === 'leonore' && r.cote ? ` <small class="muted">${esc(i18n('(avec le nom, ou la cote {c})', {c: r.cote}))}</small>` : ''}`;
        const add = !pid ? '' : r.added ? `<span class="bo-added">✓ ${esc(i18n('Ajouté comme source'))}</span>${locked ? '' : ` <button type="button" class="link-button" data-bo-unadd="${esc(r.key)}">↶ ${esc(i18n('Annuler'))}</button>`}`
            : locked ? '' : `<button type="button" class="button small secondary" data-bo-add="${r.id}" data-bo-kind="${kind}">${esc(i18n('＋ Ajouter comme source (à vérifier)'))}</button>`;
        return `<div class="bo-rec" data-bo-key="${esc(r.key)}"><div class="bo-rec-name"><b>${esc(r.nom)}</b> ${esc(r.prenoms)}${r.annee ? ` <small class="muted">(${r.annee})</small>` : ''}</div>
            <div class="bo-rec-lines">${recordLines(kind, r).map(l => `<span>${esc(l)}</span>`).join('')}</div>
            ${why && r.why?.length ? `<div class="bo-why">${esc(r.why.join(' · '))}</div>` : ''}
            <div class="bo-rec-acts">${link}${add ? ` ${add}` : ''}</div>
            <div class="bo-src">${esc(i18n('Source : {s}', {s: r.source}))}</div></div>`;
    }
    function blockHtml(d, locked) {
        const parts = [], dismiss = settings().dismiss;
        for (const k of KINDS) {
            const b = d.bases?.[k]; if (!b) continue;
            if (b.installed && b.matches.length) {
                parts.push(`<section class="bo-hit" data-bo-base="${k}"><h4>${NAMES[k][0]} ${esc(i18n(NAMES[k][2]))}</h4>
                    ${b.matches.map(r => recordHtml(k, r, {pid: d.person.id, locked})).join('')}
                    <p class="bo-foot"><button type="button" class="link-button" data-bo-search="${k}" data-bo-nom="${esc(d.person.last)}">🔎 ${esc(i18n('Chercher ce nom dans la base'))}</button> · <small class="muted">${esc(i18n('Même nom, même prénom, né(e) à un an près : rien n’est sûr, compare avec tes actes.'))}</small></p></section>`);
            } else if (!b.installed && b.could && !dismiss[k]) {
                const o = DL.online?.[k], r = DL.run[k];
                parts.push(`<div class="bo-offer" data-bo-offer="${k}"><span>${NAMES[k][0]} ${esc(k === 'mpf' ? i18n('Mort pendant la Grande Guerre ? La base des Morts pour la France 1914–1918 peut le dire.') : i18n('Décoré(e) de la Légion d’honneur ? La base Léonore peut le dire.'))}</span>
                    ${r ? progHtml(k, r) : `<button type="button" class="button small secondary" data-bo-install="${k}">⤓ ${esc(i18n('Installer {t}', {t: i18n(NAMES[k][3])}))}${o ? ` (${esc(fmtSize(o.size))})` : ''}</button>`}
                    <a class="bo-online" href="${HOME[k]}" target="_blank" rel="noopener">↗ ${esc(i18n('ou chercher en ligne'))}</a>
                    <button type="button" class="bo-x" data-bo-dismiss="${k}" title="${esc(i18n('Ne plus proposer'))}" aria-label="${esc(i18n('Ne plus proposer'))}">✕</button></div>`);
            }
        }
        return parts.join('');
    }
    async function fillPerson(host) {
        const pid = Number(host.dataset.boPerson), locked = host.dataset.boLocked === '1';
        let d; try { d = await personData(pid); } catch (_) { host.hidden = true; return; }
        if (!host.isConnected) return;
        if (Object.values(d.bases || {}).some(b => !b.installed && b.could) && DL.online === undefined) { loadInfo().then(() => { if (host.isConnected) fillPerson(host); }); }
        const html = blockHtml(d, locked);
        host.innerHTML = html; host.hidden = !html;
    }
    function mountPerson(detail) {
        const p = detail?.person, ws = document.getElementById('workspace');
        if (!p?.id || p.kind === 'animal' || !ws) return;
        const page = ws.querySelector('.person-page'); if (!page) return;
        page.querySelector('.bo-person')?.remove();
        const host = document.createElement('div');
        host.className = 'bo-person'; host.hidden = true;
        host.dataset.boPerson = String(p.id);
        host.dataset.boLocked = Number(p.is_locked) === 1 || kiosk() ? '1' : '0';
        const after = page.querySelector('.pa-family-bar') || page.querySelector('.relations-strip');
        if (after) after.insertAdjacentElement('afterend', host); else page.insertAdjacentElement('afterbegin', host);
        fillPerson(host);
    }
    (ext.afterPerson = ext.afterPerson || []).push(detail => { personCache.delete(Number(detail?.person?.id) || 0); mountPerson(detail); });
    listeners.add(() => document.querySelectorAll('.bo-person[data-bo-person]').forEach(fillPerson));

    async function addSource(btn) {
        const host = btn.closest('[data-bo-person]'); if (!host) return;
        const pid = Number(host.dataset.boPerson), kind = btn.dataset.boKind, id = Number(btn.dataset.boAdd);
        btn.disabled = true;
        let r;
        try { r = await post('bo_add', {person_id: pid, kind, id}); if (r?.error) throw new Error(r.error); } catch (e) { btn.disabled = false; A().toast?.(e.message, 'error'); return; }
        personCache.delete(pid); fillPerson(host);
        const undo = async () => { try { const x = await post('bo_undo', {person_id: pid, source_id: r.source_id, link_id: r.link_id}); if (x?.error) throw new Error(x.error); } catch (e) { A().toast?.(e.message, 'error'); } personCache.delete(pid); document.querySelectorAll(`.bo-person[data-bo-person="${pid}"]`).forEach(fillPerson); };
        A().undoToast ? A().undoToast(i18n('{i} Source ajoutée, à vérifier : {t}', {i: NAMES[kind][0], t: r.title}), {undo}) : A().toast?.(r.title);
    }
    async function unadd(btn) {
        const host = btn.closest('[data-bo-person]'); if (!host) return;
        const pid = Number(host.dataset.boPerson), key = btn.dataset.boUnadd;
        const d = await personData(pid).catch(() => null);
        const rec = d && KINDS.flatMap(k => d.bases[k].matches).find(x => x.key === key);
        if (!rec?.added) return;
        try { const x = await post('bo_undo', {person_id: pid, source_id: rec.added.source_id, link_id: rec.added.link_id}); if (x?.error) throw new Error(x.error); } catch (e) { A().toast?.(e.message, 'error'); return; }
        personCache.delete(pid); fillPerson(host);
        A().toast?.(i18n('Source retirée de sa fiche.'));
    }
    function dismissOffer(kind) {
        const s = settings(); s.dismiss[kind] = true; lsSave(KEY, s); changed();
        A().undoToast?.(i18n('{t} ne sera plus proposée sur les fiches (Réglages → 🎖️ Bases officielles pour l’installer).', {t: NAMES[kind][1]}), {undo: () => { const t = settings(); delete t.dismiss[kind]; lsSave(KEY, t); changed(); }});
    }

    /* ═════════ Réglages → 🎖️ Bases officielles (et la page « Chercher ») ═════════ */
    const PAGE = {view: null, pending: null, st: null};
    const ABOUT = `<details class="bo-about"><summary>${esc(i18n('À propos des données'))}</summary>
        <p>${esc(i18n('🎖️ Morts pour la France 1914–1918 : il n’existe pas (fin 2026) de fichier ouvert de toute la base « Morts pour la France » de Mémoire des hommes (1,3 million de fiches). Le pack réunit les listes ouvertes qui en sont tirées :'))}</p>
        <ul><li>${esc(i18n('Réseau Canopé, « Les Poilus morts pour la France (à compléter) », data.gouv.fr (2018) : 12 185 soldats nés dans une soixantaine de communes (Finistère, Ille-et-Vilaine, Maine-et-Loire, Var, Vienne…), avec le lien vers la fiche numérisée — licence ODC-BY 1.0.'))}</li>
        <li>${esc(i18n('Ville de Nancy, « Mémorial virtuel des morts pour la France », data.gouv.fr (2018) : 4 497 morts de 1914–1918 — licence ODbL 1.0.'))}</li></ul>
        <p>${esc(i18n('Pour tous les autres soldats : cherche sur le site Mémoire des hommes (Ministère des Armées).'))}</p>
        <p>${esc(i18n('🏅 Légion d’honneur : l’export des dossiers de la base Léonore publié par les Archives nationales sur data.gouv.fr (2018, 381 156 dossiers : nom, prénoms, naissance, cote). Licence « non spécifiée » : ce sont des informations publiques, réutilisables en citant la source et la date (code des relations entre le public et l’administration, art. L321-1 et L322-1). Le lien direct vers la notice du site Léonore vient de Wikidata (CC0) quand il y est (≈ 28 000 personnes) ; sinon cherche la cote sur le site Léonore. Les personnes décorées après 2018 et les dossiers ajoutés depuis ne sont pas dans le pack.'))}</p>
        <p>${esc(i18n('Une fiche trouvée est une piste : ajoute-la comme source « à vérifier », puis confirme-la avec l’acte ou le dossier original.'))}</p></details>`;
    function baseRowHtml(kind) {
        const b = PAGE.st?.bases?.[kind] || {installed: false}, o = DL.online?.[kind];
        const desc = b.installed ? [`${num(b.records)} ${i18n('fiches')}`, b.years?.a ? `${i18n('nés')} ${b.years.a} → ${b.years.b}` : '', fmtSize(b.size || 0), b.built ? i18n('fabriqué le {d}', {d: b.built}) : '', b.fixture ? i18n('données d’essai') : ''].filter(Boolean).join(' · ')
            : (kind === 'mpf' ? i18n('Soldats morts pour la France en 1914–1918 : naissance, décès, unité, lien vers la fiche numérisée.') : i18n('Dossiers des personnes décorées de la Légion d’honneur (mortes avant 1977) : naissance, cote du dossier.'))
              + (o ? ` ${i18n('Téléchargement : {s} (≈ {t} une fois installée).', {s: fmtSize(o.size), t: fmtSize(o.sqlite_size || o.size)})}` : '');
        const srcs = b.installed && b.sources?.length ? `<div class="bo-srcs">${b.sources.map(s => `<span>${esc(s.mention)} — <i>${esc(s.licence)}</i>${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(i18n('la source'))}</a>` : ''}</span>`).join('')}</div>` : '';
        return `<div class="bo-base" data-bo-row="${kind}"><span class="bo-base-ic">${NAMES[kind][0]}</span><span class="bo-base-txt"><b>${esc(i18n(NAMES[kind][1]))}</b><br><small>${esc(desc)}</small>${srcs}</span>
            ${UI().badge ? UI().badge(i18n(b.installed ? 'Installé' : 'Pas installé'), b.installed ? 'green' : 'grey') : ''}<span class="bo-base-acts">${actsHtml(kind, b.installed)}</span></div>`;
    }
    function settingsHtml() {
        const dis = KINDS.filter(k => settings().dismiss[k]);
        return `<section class="page bo-set">${UI().pageHeader ? UI().pageHeader({title: 'Bases officielles', icon: '🎖️', where: 'Réglages · Données', help: 'Deux bases à télécharger une fois : les Morts pour la France de 1914–1918 et la Légion d’honneur. Ensuite, les fiches qui y ressemblent le disent.'}) : `<h2>🎖️ ${esc(i18n('Bases officielles'))}</h2>`}
            <section class="card"><h3>${esc(i18n('Les bases'))}</h3>${KINDS.map(baseRowHtml).join('')}
                ${UI().notice ? UI().notice('info', i18n('Le téléchargement se fait une fois ; ensuite l’app n’a plus besoin d’Internet pour chercher. Rien n’est envoyé.')) : ''}
                ${dis.length ? `<p class="bo-dis">${esc(i18n('Plus proposé sur les fiches : {l}.', {l: dis.map(k => i18n(NAMES[k][1])).join(', ')}))} <button type="button" class="link-button" data-bo-undismiss>${esc(i18n('Proposer de nouveau'))}</button></p>` : ''}
                ${ABOUT}</section></section>`;
    }
    function searchHtml() {
        const v = PAGE.view, b = PAGE.st?.bases?.[v.kind] || {};
        const res = v.res;
        let body = '';
        if (!b.installed) body = A().empty ? A().empty(i18n('Cette base n’est pas installée.'), {icon: NAMES[v.kind][0]}) : esc(i18n('Cette base n’est pas installée.'));
        else if (v.busy) body = `<p class="muted">${esc(i18n('Recherche…'))}</p>`;
        else if (res?.short) body = `<p class="muted">${esc(i18n('Écris au moins deux lettres du nom.'))}</p>`;
        else if (res && !res.rows.length) body = A().empty ? A().empty(i18n('Personne sous ce nom dans la base.'), {icon: '🔎'}) : esc(i18n('Personne sous ce nom dans la base.'));
        else if (res) body = `<p class="muted">${esc(res.more ? i18n('{n} fiches : les 100 premières (précise le prénom ou l’année).', {n: num(res.total)}) : i18n('{n} fiche(s)', {n: num(res.total)}))}</p><div class="bo-results">${res.rows.map(r => recordHtml(v.kind, r, {why: false})).join('')}</div>`;
        return `<section class="page bo-set bo-search-page">${UI().pageHeader ? UI().pageHeader({title: `Chercher dans ${NAMES[v.kind][3]}`, icon: '🔎', where: 'Réglages · Bases officielles', help: 'Le nom, ou son début ; le prénom et l’année de naissance (à deux ans près) aident à trier.'}) : `<h2>🔎 ${esc(i18n(NAMES[v.kind][1]))}</h2>`}
            <p><button type="button" class="button small secondary" data-bo-back>← ${esc(i18n('Retour aux bases'))}</button></p>
            <section class="card"><form class="bo-form" data-bo-form>
                <label>${esc(i18n('Base'))} <select name="kind">${KINDS.map(k => `<option value="${k}" ${k === v.kind ? 'selected' : ''}>${NAMES[k][0]} ${esc(i18n(NAMES[k][1]))}</option>`).join('')}</select></label>
                <label>${esc(i18n('Nom'))} <input name="nom" value="${esc(v.nom || '')}" autocomplete="off" required></label>
                <label>${esc(i18n('Prénom'))} <input name="prenom" value="${esc(v.prenom || '')}" autocomplete="off"></label>
                <label>${esc(i18n('Né(e) vers'))} <input name="annee" value="${esc(v.annee || '')}" inputmode="numeric" size="5" autocomplete="off"></label>
                <button type="submit" class="button small">🔎 ${esc(i18n('Chercher'))}</button></form>${body}</section></section>`;
    }
    async function runSearch() {
        const v = PAGE.view; if (!v) return;
        if (!String(v.nom || '').trim()) { v.res = null; redraw(); return; }
        v.busy = true; redraw();
        try { v.res = await api('bo_search', {kind: v.kind, nom: v.nom, prenom: v.prenom || '', annee: v.annee || ''}); } catch (e) { v.res = null; A().toast?.(e.message, 'error'); }
        v.busy = false; redraw();
    }
    let redraw = () => {};
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        PAGE.view = PAGE.pending; PAGE.pending = null;
        try { PAGE.st = await api('bo_status'); } catch (_) { PAGE.st = {bases: {}}; }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        // seulement tant que la page est à l'écran
        redraw = () => { if (ws.querySelector('.bo-set')) ws.innerHTML = PAGE.view ? searchHtml() : settingsHtml(); };
        ws.innerHTML = PAGE.view ? searchHtml() : settingsHtml();
        if (PAGE.view?.nom && !PAGE.view.res) runSearch();
        if (KINDS.some(k => !PAGE.st?.bases?.[k]?.installed)) loadInfo().then(() => { if (ws.querySelector('.bo-set') && !PAGE.view) redraw(); });
        if (ws.__boBound) return;
        ws.__boBound = true;
        const mine = () => !!ws.querySelector('.bo-set');
        ws.addEventListener('submit', e => { const f = e.target.closest?.('[data-bo-form]'); if (!f || !mine()) return; e.preventDefault(); const fd = new FormData(f); PAGE.view = {kind: String(fd.get('kind')), nom: String(fd.get('nom') || ''), prenom: String(fd.get('prenom') || ''), annee: String(fd.get('annee') || '')}; runSearch(); });
        ws.addEventListener('click', e => {
            if (!mine()) return;
            if (e.target.closest('[data-bo-back]')) { PAGE.view = null; redraw(); return; }
            if (e.target.closest('[data-bo-undismiss]')) { const s = settings(); const before = {...s.dismiss}; s.dismiss = {}; lsSave(KEY, s); changed(); redraw(); A().undoToast?.(i18n('Les bases seront de nouveau proposées sur les fiches.'), {undo: () => { lsSave(KEY, {...settings(), dismiss: before}); changed(); redraw(); }}); }
        });
    };
    listeners.add(async () => { const ws = document.getElementById('workspace'); if (!ws?.querySelector('.bo-set')) return; try { PAGE.st = await api('bo_status'); } catch (_) {} redraw(); });

    /* un seul écouteur pour les boutons (fiche et Réglages) */
    document.addEventListener('click', e => {
        const t = e.target; if (!t?.closest) return;
        let b;
        if ((b = t.closest('[data-bo-install]'))) { e.preventDefault(); install(b.dataset.boInstall); return; }
        if ((b = t.closest('[data-bo-pause]'))) { if (DL.run[b.dataset.boPause]) DL.run[b.dataset.boPause].stop = true; return; }
        if ((b = t.closest('[data-bo-cancel]'))) { cancel(b.dataset.boCancel); return; }
        if ((b = t.closest('[data-bo-remove]'))) { remove(b.dataset.boRemove); return; }
        if ((b = t.closest('[data-bo-add]'))) { addSource(b); return; }
        if ((b = t.closest('[data-bo-unadd]'))) { unadd(b); return; }
        if ((b = t.closest('[data-bo-dismiss]'))) { dismissOffer(b.dataset.boDismiss); return; }
        if ((b = t.closest('[data-bo-search]'))) { openSearch(b.dataset.boSearch, b.dataset.boNom || ''); }
    });
    function openSearch(kind, nom = '', prenom = '') {
        const v = {kind: KINDS.includes(kind) ? kind : 'mpf', nom, prenom, annee: ''};
        if (document.querySelector('#workspace .bo-set')) { PAGE.view = v; if (nom) runSearch(); else redraw(); return; }
        openSettings(v);
    }

    /* ═════════ Pour « Où chercher » ═════════
     * LCNDA_EXT.officialBases.suggest(person) → Promise<[{id, icon, title, why, local, installed, url, count, open(), install()}]>
     *   person : {id} (ou le « detail » d'une fiche) ; une ligne par base où la personne pourrait être :
     *   · installée : local=true, count = fiches qui lui ressemblent, why = « 2 fiches qui lui ressemblent » ou « Rien sous
     *     son nom dans la base installée », open() ouvre la recherche dans la base (son nom déjà écrit), url = la 1re fiche en ligne ;
     *   · pas installée : local=false, url = le site officiel (chercher en ligne), install() lance « ⤓ Installer ». */
    async function suggest(person) {
        const pid = Number(person?.person?.id ?? person?.id) || 0; if (!pid) return [];
        let d; try { d = await personData(pid); } catch (_) { return []; }
        await loadInfo().catch(() => {});
        return KINDS.filter(k => d.bases?.[k] && (d.bases[k].could || d.bases[k].matches.length)).map(k => {
            const b = d.bases[k], n = b.matches.length, o = DL.online?.[k];
            return b.installed
                ? {id: `bo_${k}`, kind: k, icon: NAMES[k][0], title: i18n(NAMES[k][1]), local: true, installed: true, count: n, url: b.matches[0]?.url || HOME[k],
                    why: n ? i18n('{n} fiche(s) qui lui ressemblent dans la base installée', {n: String(n)}) : i18n('Rien sous son nom dans la base installée'),
                    open: () => openSearch(k, d.person.last, d.person.first.split(/\s+/)[0] || '')}
                : {id: `bo_${k}`, kind: k, icon: NAMES[k][0], title: i18n(NAMES[k][1]), local: false, installed: false, count: null, url: HOME[k],
                    why: k === 'mpf' ? i18n('Soldat de 1914–1918 ? Cherche en ligne sur Mémoire des hommes, ou installe la base dans l’app.') : i18n('Décoré(e) ? Cherche en ligne sur le site Léonore, ou installe la base dans l’app.'),
                    size: o?.size || null, install: () => install(k)};
        });
    }

    ext.officialBases = {suggest, install, remove, openSettings, openSearch, settings, state: DL, register};
})();
