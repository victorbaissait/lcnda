/* LCNDA — 📚 Archives en ligne, 6e lot : bibliothèques numériques régionales, auteurs (IdRef, data.bnf.fr), Wikisource, gens de
 * mer, notaires de Paris, HisKi (Finlande), Old Bailey (Londres), et les sites PAYANTS (jamais mis en avant). Les écrans.
 * Même modèle que heritage-sources-ouvertes.js et -3.js, validé par l’utilisateur :
 *  - « ↗ Ouvrir » ouvre le NAVIGATEUR sur la recherche du site, champs remplis ; « 📋 Copier le nom et ouvrir » pour un site qui
 *    garde sa recherche dans un formulaire (HisKi, Salle des inventaires virtuelle). L’app n’interroge jamais ces sites.
 *    Adresse non vérifiée : « ou avec Google dans ce site ». « ⚙️ Adresses des sites » les change (K2), avec « ⭐ Mes sites ».
 *  - « Gratuites seulement » (coché au départ, partagé avec « Chercher sur internet ») : les payants sont cachés ; décoché, ils
 *    viennent à la fin, toujours avec la pastille « PAYANT » et une phrase claire.
 *  - « ⤒ Importer ce que tu as trouvé » (K13) : notice d’auteur (texte, page, .xml UNIMARC, .json), lignes HisKi, procès de
 *    l’Old Bailey, document d’une bibliothèque → média, source avec lien, événements proposés (cochés ou non), notice dans
 *    « Fiches en ligne » ; « c’est la même personne ? », rien d’écrasé, « ↶ Annuler » (H7), « À vérifier ».
 *    Notaires et marins : la fenêtre d’import du lot « Archives nationales, SHD » (heritage-sources-ouvertes-2.js) quand elle est là.
 * Entrées : bloc « Chercher sur internet » de la fiche, blocs des profils (artiste, savant…) → IdRef / data.bnf, fiche d’un
 * village et monographie (bibliothèque de la région), Recherche → « Chercher sur internet », Réglages → Apparence.
 * Calculs purs : app-sources-ouvertes-6-core.js (LCNDA_SOURCES_OUVERTES_6). Serveur : lib/sources_ouvertes_6.php.
 * Mode d’emploi : docs/UI.md (« 📚 Bibliothèques, auteurs et sites payants »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S6 = () => window.LCNDA_SOURCES_OUVERTES_6;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-6-sites';
    const OPEN_KEY = 'genealogie-sources-ouvertes-6-open';
    const CUSTOM_KEY = 'genealogie-web-search-custom';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} };
    const custom = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    /** « Gratuites seulement » : un seul réglage pour toute l'app (coché au départ) */
    const freeOnly = () => lsGet(S6()?.FREE_KEY || 'genealogie-sources-gratuites', '1') !== '0';
    const setFreeOnly = on => { lsSet(S6().FREE_KEY, on ? '1' : '0'); document.querySelectorAll('[data-so6-free]').forEach(i => { i.checked = on; }); applyFree(document); };
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const badge = (t, k, o) => UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${esc(k)}">${esc(t)}</span>`;
    const paidBadge = (partly = false, title = '') => partly ? badge('En partie payant', 'yellow', {title: title || 'Gratuit, sauf une partie qui demande un abonnement', cls: 'so6-paid'}) : badge('Payant', 'yellow', {title: title || 'Ce site demande un abonnement ou des crédits pour voir les documents', cls: 'so6-paid'});
    const VERIF = {oui: ['Adresse vérifiée', 'green', 'Adresse déjà dans l’app, vérifiée le 08/10/2026'], partiel: ['Vérifiée en partie', 'yellow', 'La forme de l’adresse est connue, mais pas tous ses paramètres'], non: ['Adresse non vérifiée', 'gray', 'Construite d’après la forme connue du site : si elle ne marche plus, change-la dans « ⚙️ Adresses des sites », ou prends « avec Google dans ce site »']};
    const ctxCache = new Map();
    const context = pid => { const k = Number(pid) || 0; if (!ctxCache.has(k)) ctxCache.set(k, api('so6_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    const forget = pid => ctxCache.delete(Number(pid) || 0);
    const freeToggle = () => `<label class="ui-toggle so6-free"><input type="checkbox" data-so6-free ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement</label>`;

    function paramsFrom(ctx, o = {}) {
        const p = ctx?.person || {};
        return {first: String(p.first || '').split(/\s+/)[0] || '', last: p.last || '', place: o.place || (ctx?.birth?.place || ctx?.places?.[0] || '').split(',')[0],
            y1: p.birth_year || '', y2: p.death_year || (p.birth_year ? Math.min(Number(p.birth_year) + 90, new Date().getFullYear()) : ''), port: o.port || ''};
    }
    /** les sites d'une rubrique ; les notaires et les marins reprennent l'adresse du lot « Archives nationales, SHD » s'il est là */
    const lotUrl = (s, p) => { const S2 = window.LCNDA_SOURCES_OUVERTES_2; if (!s.lot2 || !S2?.url) return ''; try { return S2.url(s.lot2, {...p}, (() => { try { return JSON.parse(lsGet('genealogie-sources-ouvertes-2-sites', '{}')) || {}; } catch (_) { return {}; } })()); } catch (_) { return ''; } };
    function rowHtml(s, p, cu, o = {}) {
        const u = (!cu[s.key] && lotUrl(s, p)) || S6().url(s.key, p, cu); const v = VERIF[s.verified] || VERIF.non;
        const g = S6().googleUrl(s.key, p);
        const hasWhat = !!(p.last || p.first || (s.group === 'fr_bn' && p.place) || (s.needs === 'port' && p.port));
        const copy = S6().copyText(s.key, p);
        const go = !hasWhat && !s.copy ? `<button type="button" class="button small" disabled title="Écris au moins un nom">↗ Ouvrir</button>`
            : s.copy && copy ? `<button type="button" class="button small" data-so6-copy="${esc(s.key)}" data-text="${esc(copy)}" data-href="${esc(u)}" title="Met « ${esc(copy)} » dans le presse-papiers et ouvre la page de recherche : colle-le dans la case du site">📋 Copier le nom et ouvrir</button>`
                : `<a class="button small${s.paid ? ' secondary' : ''}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-so6-go="${esc(s.key)}">↗ Ouvrir</a>`;
        let extra = '';
        if (s.needs === 'port') {
            const m = S6().maritime(p.port);
            const ad = m && (o.depts || []).find(d => d.code === m.dept);
            extra = m ? `<small class="ui-hint so6-port">⚓ ${esc(m.text)}${ad?.url ? ` <a href="${esc(ad.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(ad.service || 'Archives départementales')} (${esc(ad.code)})</a>` : ''}</small>`
                : `<small class="ui-hint">${p.port ? `Je ne connais pas le port « ${esc(p.port)} » : choisis le port d’attache le plus proche dans la liste.` : 'Écris son port d’attache (Saint-Malo, Fécamp, Sète…) pour savoir où sont ses registres.'}</small>`;
        }
        if (s.group === 'fr_notaires') extra += `<small class="ui-hint">${window.LCNDA_SOURCES_OUVERTES_2 && s.lot2 ? 'Même recherche que dans « Archives nationales, SHD… ». ' : ''}Une cote comme « MC/ET/XLVIII/312 » se lit : étude 48 (en chiffres romains), article 312.</small>`;
        return `<li class="so-link so6-link${s.paid ? ' is-paid' : ''}" data-so6-site="${esc(s.key)}">
            <span class="so-link-ico" aria-hidden="true">${esc(s.icon)}</span>
            <span class="so-link-main"><b>${esc(s.label)}</b> <span class="so6-badges">${s.paid ? paidBadge(false) + ' ' : s.partlyPaid ? paidBadge(true) + ' ' : ''}${badge(v[0], v[1], {title: v[2]})}${o.mine?.includes(s.key) ? ` ${badge('Ta région', 'blue')}` : ''}${cu[s.key] ? ` ${badge('Adresse à toi', 'blue')}` : ''}</span>
                ${hasWhat || s.copy ? `<code class="so-url">${esc(u)}</code>` : `<small class="ui-hint">Écris au moins un nom${s.group === 'fr_bn' ? ' ou un lieu' : ''}.</small>`}
                ${s.note ? `<small class="ui-hint">${esc(s.note)}</small>` : ''}${extra}
                ${g && hasWhat && !cu[s.key] ? `<small class="ui-hint">Si la page ne trouve rien : <a href="${esc(g)}" target="_blank" rel="noopener noreferrer" data-so6-google="${esc(s.key)}">chercher avec Google dans ce site ↗</a></small>` : ''}</span>
            ${go}</li>`;
    }

    /* ═════ 🔍 Chercher : rubriques par pays / thème, recherche C1, pastilles C5, « Gratuites seulement » ═════ */
    function openSearch(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-search so6-search';
        let ctx = null, pid = Number(o.personId) || 0, group = o.group || '';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · BIBLIOTHÈQUES ET AUTEURS</span><h2>📚 Bibliothèques, auteurs, marins, notaires…</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body so-search-body" data-so6-body>${UI().spinner ? UI().spinner('Ce que la fiche sait…') : '…'}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-so6-settings>⚙️ Adresses des sites</button><span class="spacer"></span><button type="button" class="button secondary" data-so6-import-from-search>⤒ Importer ce que tu as trouvé…</button><button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-so6-body]');
        const val = () => { const v = {}; dlg.querySelectorAll('.so-grid [name]').forEach(i => { v[i.name] = i.value; }); return v; };
        const updLinks = () => {
            const box = body.querySelector('[data-so6-links]'); if (!box) return;
            const p = val(), cu = custom(), q = S6().fold(body.querySelector('[data-so6-q]')?.value || '');
            const lib = S6().libraryFor({text: p.place, county: o.county || '', state: o.state || '', insee: o.insee || '', country: o.country || ''});
            const mine = lib.mine.map(s => s.key);
            let all = S6().visible(S6().SITES, freeOnly());
            all = [...all.filter(s => mine.includes(s.key)), ...all.filter(s => !mine.includes(s.key))];
            const list = all.filter(s => !q || S6().fold([s.label, s.note, S6().groupOf(s.group)?.label].join(' ')).includes(q));
            const counts = {}; list.forEach(s => { counts[s.group] = (counts[s.group] || 0) + 1; });
            const pills = body.querySelector('[data-so6-pills]');
            if (group && !counts[group]) group = '';
            if (pills) pills.innerHTML = [`<button type="button" class="${group ? '' : 'is-active'}" data-so6-group="">Tout (${list.length})</button>`, ...S6().GROUPS.filter(g => counts[g.id]).map(g => `<button type="button" class="${group === g.id ? 'is-active' : ''}" data-so6-group="${esc(g.id)}">${esc(g.icon)} ${esc(g.label.replace(/^[^·]+· /, ''))} (${counts[g.id]})</button>`)].join('');
            const shown = list.filter(s => !group || s.group === group);
            const hiddenPaid = freeOnly() ? S6().SITES.filter(s => s.paid).length : 0;
            box.innerHTML = (shown.length ? S6().GROUPS.map(g => { const l = shown.filter(s => s.group === g.id); return l.length ? `<section class="so6-group"><h4>${esc(g.icon)} ${esc(g.label)}</h4>${g.id === 'fr_bn' && p.place ? `<p class="ui-hint">${esc(lib.text)}</p>` : ''}${g.id === 'payant' ? UI().notice('warn', 'Ces sites sont payants (abonnement ou crédits). La recherche y est souvent possible sans payer, mais pas la lecture des documents. Essaie d’abord les sites gratuits.') : ''}<ul class="so-links">${l.map(s => rowHtml(s, p, cu, {mine, depts: ctx?.depts})).join('')}</ul></section>` : ''; }).join('')
                : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Aucun site pour « ${esc(body.querySelector('[data-so6-q]')?.value || '')} ».</span></p>`)
                + (hiddenPaid ? `<p class="ui-hint so6-hidden-paid">${hiddenPaid} site${hiddenPaid > 1 ? 's' : ''} payant${hiddenPaid > 1 ? 's' : ''} caché${hiddenPaid > 1 ? 's' : ''} par « Gratuites seulement ».</p>` : '');
        };
        const draw = () => {
            const p = paramsFrom(ctx, o);
            const living = ctx?.person && window.LCNDA_SOURCES_OUVERTES?.livingRisk?.(ctx.person);
            body.innerHTML = `${o.personId || o.placeOnly ? '' : `<div class="so-who"><span class="pk-lab">À partir d’une fiche (facultatif)</span>${pickerField({name: 'so6_pid', kind: 'person', value: pid || null})}</div>`}
                ${living ? UI().notice('warn', 'Cette personne est peut-être vivante : ces recherches restent dans ton navigateur, rien n’est partagé. Pense à sa vie privée.') : ''}
                <div class="form-grid so-grid">
                    <label>Nom<input name="last" value="${esc(o.placeOnly ? '' : p.last)}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(o.placeOnly ? '' : p.first)}" autocomplete="off"></label>
                    <label>Lieu<input name="place" value="${esc(p.place)}" autocomplete="off" placeholder="Brest, Lyon, Besançon…"></label>
                    <label>De l’année<input name="y1" type="number" min="1500" max="2100" value="${esc(o.placeOnly ? '' : p.y1)}"></label>
                    <label>à l’année<input name="y2" type="number" min="1500" max="2100" value="${esc(o.placeOnly ? '' : p.y2)}"></label>
                    <label>Port d’attache (marins)<input name="port" value="${esc(p.port)}" list="so6-ports" autocomplete="off" placeholder="Saint-Malo, Fécamp, Sète…"><datalist id="so6-ports">${S6().PORT_NAMES.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
                </div>
                ${UI().notice('info', 'Chaque recherche s’ouvre dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans l’adresse, et ne se connecte jamais à ces sites.')}
                <div class="so6-bar"><div class="so3-q so6-q"><input type="search" data-so6-q placeholder="Chercher un site… (Normandie, auteur, Londres, marins…)" autocomplete="off" aria-label="Chercher un site"></div>${freeToggle()}</div>
                <div class="ui-filters so6-pills" data-so6-pills></div>
                <div data-so6-links></div>
                <p class="ui-hint">Ce qu’on lit sur ces sites est à vérifier : homonymes, fautes de lecture. Ensuite, enregistre la page (image, PDF, « Enregistrer sous… ») ou copie son texte, et fais « ⤒ Importer ce que tu as trouvé ».</p>`;
            updLinks();
        };
        dlg.addEventListener('input', e => { if (e.target.closest('.so-grid') || e.target.matches('[data-so6-q]')) updLinks(); });
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-so6-q]') && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; updLinks(); } });
        dlg.addEventListener('change', async e => {
            if (e.target.matches('[data-so6-free]')) { setFreeOnly(e.target.checked); updLinks(); return; }
            if (e.target.closest('.so-grid')) updLinks();
            if (e.target.name === 'so6_pid') { pid = Number(e.target.value) || 0; try { ctx = await context(pid); } catch (err) { toast(err.message, 'error'); } draw(); }
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const g = e.target.closest('[data-so6-group]'); if (g) { group = g.dataset.so6Group; updLinks(); return; }
            const c = e.target.closest('[data-so6-copy]'); if (c) { copyAndOpen(c.dataset.text, c.dataset.href); return; }
            if (e.target.closest('[data-so6-settings]')) { openSettings(() => updLinks()); return; }
            if (e.target.closest('[data-so6-import-from-search]')) { dlg.close(); const k = group === 'fr_auteurs' ? 'auteur' : group === 'fi' ? 'hiski' : group === 'uk' ? 'oldbailey' : group === 'fr_notaires' ? 'notaire' : group === 'fr_mer' ? 'marin' : 'document'; openImport({personId: pid, kind: k, placeId: o.placeId, placeName: o.place}); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        context(pid).then(c => { ctx = c; draw(); }).catch(() => { ctx = null; draw(); });
        return dlg;
    }
    function copyAndOpen(text, href) {
        const u = S6().cleanUrl(href); if (!u) return;
        const done = ok => toast(ok ? `« ${text} » est copié : colle-le dans la case du site.` : `Écris « ${text} » dans la case du site.`);
        try { if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false); } catch (_) { done(false); }
        window.open(u, '_blank', 'noopener');
    }

    /* ═════ ⚙️ Adresses des sites (K2) : rubriques par pays / thème, C1, « Gratuites seulement », ⭐ Mes sites ═════ */
    const mySites = () => { try { const l = JSON.parse(lsGet(CUSTOM_KEY, '[]')); return Array.isArray(l) ? l.filter(s => s && s.key && s.label && /^https?:\/\//i.test(String(s.url || ''))) : []; } catch (_) { return []; } };
    const saveMySites = l => lsSet(CUSTOM_KEY, JSON.stringify(l));
    function openSettings(onChange) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-settings so6-settings';
        let open = []; try { open = JSON.parse(lsGet(OPEN_KEY, '[]')); } catch (_) {}
        const placeholder = s => S6().url(s.key, {first: '{prénom}', last: '{nom}', place: '{lieu}', port: '{port}'}).replace(/%7B/g, '{').replace(/%7D/g, '}').replace(/%C3%A9/g, 'é');
        const rows = () => { const cu = custom(); const free = freeOnly(); return S6().GROUPS.map(g => { const l = S6().SITES.filter(s => s.group === g.id); const n = l.filter(s => cu[s.key]).length;
            return `<details class="so3-rub so6-rub${g.id === 'payant' ? ' is-paid' : ''}" data-so6-rub="${esc(g.id)}" ${open.includes(g.id) ? 'open' : ''} ${g.id === 'payant' && free ? 'hidden' : ''}><summary><b>${esc(g.icon)} ${esc(g.label)}</b> <small class="muted">${l.length} site${l.length > 1 ? 's' : ''}${n ? ` · ${n} adresse${n > 1 ? 's' : ''} à toi` : ''}</small></summary>
                ${l.map(s => `<div class="so-set-row${s.paid ? ' is-paid' : ''}" data-so6-text="${esc(S6().fold([s.label, g.label, s.note].join(' ')))}" ${s.paid && free ? 'hidden' : ''}><label><span><b>${esc(s.icon)} ${esc(s.label)}</b> ${s.paid ? paidBadge() + ' ' : s.partlyPaid ? paidBadge(true) + ' ' : ''}${badge((VERIF[s.verified] || VERIF.non)[0], (VERIF[s.verified] || VERIF.non)[1])}</span>
                <input name="${esc(s.key)}" value="${esc(cu[s.key] || '')}" placeholder="${esc(placeholder(s))}" autocomplete="off" spellcheck="false"></label></div>`).join('')}</details>`; }).join(''); };
        const mine = () => { const l = mySites(); return `<details class="so3-rub so6-rub" data-so6-rub="mine" open><summary><b>⭐ Mes sites</b> <small class="muted">${l.length ? `${l.length} site${l.length > 1 ? 's' : ''}` : 'aucun'} · aussi dans « Chercher sur internet »</small></summary>
            ${l.length ? `<ul class="so6-mine">${l.map(s => `<li><b>${esc(s.label)}</b> <code>${esc(s.url)}</code> <button type="button" class="icon-button small" data-so6-mine-del="${esc(s.key)}" aria-label="Retirer ${esc(s.label)}" title="Retirer">✕</button></li>`).join('')}</ul>`
                : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">⭐</span><span class="empty-line-text">Ajoute ici le site d’une association, d’une bibliothèque ou d’un relevé que tu connais.</span></p>'}
            <div class="form-grid so6-mine-form"><label>Nom du site<input data-so6-mine-label placeholder="Cercle généalogique du Finistère" autocomplete="off"></label>
                <label class="so-span-2">Adresse de recherche<input data-so6-mine-url placeholder="https://exemple.fr/recherche?nom={nom}&prenom={prénom}" autocomplete="off" spellcheck="false"></label>
                <p class="ui-hint so-span-2">Mets {nom}, {prénom}, {nom_complet}, {lieu}, {année}, {de} ou {à} à la place de ce que tu cherches.</p>
                <div><button type="button" class="button small" data-so6-mine-add>＋ Ajouter mon site</button></div></div></details>`; };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · RÉGLAGES</span><h2>⚙️ Adresses des sites — bibliothèques, auteurs, payants</h2></div><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Si un site change son adresse de recherche, écris la nouvelle ici. Case vide = l’adresse de l’app (en gris). Mots remplacés : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à}, {port}, {requête}. Seules les adresses en http(s) sont gardées.</p>
            <div class="so6-bar"><div class="so3-q so6-q"><input type="search" data-so6-sq placeholder="Chercher un site… (Bretagne, IdRef, payant…)" autocomplete="off" aria-label="Chercher un site"></div>${freeToggle()}</div>
            <p class="ui-hint" data-so6-scount></p>
            <div class="so-set" data-so-set>${rows()}</div><div data-so6-mine>${mine()}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-ui-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const filter = () => {
            const q = S6().fold(dlg.querySelector('[data-so6-sq]').value); const free = freeOnly(); let n = 0;
            dlg.querySelectorAll('[data-so-set] .so6-rub').forEach(d => { let k = 0; d.querySelectorAll('.so-set-row').forEach(r => { const ok = (!q || r.dataset.so6Text.includes(q)) && !(free && r.classList.contains('is-paid')); r.hidden = !ok; if (ok) k++; }); d.hidden = !k; if (q && k) d.open = true; n += k; });
            dlg.querySelector('[data-so6-scount]').textContent = q ? (n ? `${n} site${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}` : `Aucun site pour « ${dlg.querySelector('[data-so6-sq]').value} ».`) : '';
        };
        UI().autoSaveDialog(dlg, {keys: [KEY], label: 'Adresse d’un site',
            save: () => { const o = {}; dlg.querySelectorAll('[data-so-set] input[name]').forEach(i => { const v = i.value.trim(); if (v && S6().cleanUrl(v.replace(/[{}]/g, ''))) o[i.name] = v.slice(0, 600); }); if (Object.keys(o).length) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); },
            reload: () => { dlg.querySelector('[data-so-set]').innerHTML = rows(); filter(); },
            reset: () => { lsSet(KEY, null); },
            onChange: () => onChange?.()});
        const redrawMine = () => { dlg.querySelector('[data-so6-mine]').innerHTML = mine(); onChange?.(); };
        dlg.addEventListener('input', e => { if (e.target.matches('[data-so6-sq]')) filter(); });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-so6-free]')) { e.stopPropagation(); setFreeOnly(e.target.checked); filter(); onChange?.(); } }, true);
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-so6-sq]') && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; filter(); } });
        dlg.addEventListener('toggle', e => { const d = e.target.closest?.('[data-so-set] .so6-rub'); if (!d || dlg.querySelector('[data-so6-sq]').value) return; open = [...dlg.querySelectorAll('[data-so-set] .so6-rub[open]')].map(x => x.dataset.so6Rub); lsSet(OPEN_KEY, JSON.stringify(open)); }, true);
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-ui-x]')) { dlg.close(); return; }
            if (e.target.closest('[data-so6-mine-add]')) {
                const lab = dlg.querySelector('[data-so6-mine-label]'), url = dlg.querySelector('[data-so6-mine-url]');
                const errs = []; if (!lab.value.trim()) errs.push([lab, 'Donne un nom au site.']);
                if (!/^https?:\/\/\S+$/i.test(url.value.trim()) || !S6().cleanUrl(url.value.trim().replace(/[{}]/g, ''))) errs.push([url, 'L’adresse doit commencer par https:// (ou http://), sans espace.']);
                if (errs.length) { if (UI().formErrors) UI().formErrors(dlg.querySelector('form'), errs); else UI().fail?.(errs[0][0], errs[0][1]); return; }
                const l = mySites(); l.push({key: `custom-${Date.now().toString(36)}`, label: lab.value.trim().slice(0, 80), url: url.value.trim().slice(0, 500)}); saveMySites(l); redrawMine();
                toast(`Site « ${lab.value.trim()} » ajouté : il est aussi dans « Chercher sur internet ».`, 'success');
                return;
            }
            const del = e.target.closest('[data-so6-mine-del]');
            if (del) {
                const before = mySites(); const s = before.find(x => x.key === del.dataset.so6MineDel);
                saveMySites(before.filter(x => x.key !== del.dataset.so6MineDel)); redrawMine();
                const undo = () => { saveMySites(before); redrawMine(); };
                if (A().undoToast) A().undoToast(`Site « ${s?.label || ''} » retiré`, {undo}); else toast(`Site « ${s?.label || ''} » retiré.`, '', {kind: 'undo', actions: [{label: '↶ Annuler', run: undo}]});
            }
        });
        dlg.addEventListener('close', () => { onChange?.(); dlg.remove(); });
        dlg.showModal(); filter();
        return dlg;
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé ou copié (K13) ═════ */
    const KIND_LABEL = {auteur: '✍️ Notice d’auteur (IdRef, data.bnf)', hiski: '⛪ Actes HisKi (Finlande)', oldbailey: '⚖ Procès de l’Old Bailey', document: '📚 Document (bibliothèque, Wikisource…)'};
    const KIND_SITES = {auteur: ['idref', 'databnf'], hiski: ['hiski'], oldbailey: ['oldbailey'], document: ['numelyo', 'lectura', 'rosalis', 'memoirevive', 'normannia', 'yroise', 'wikisource', 'marins_shd', 'minutier', 'siv', 'scotlandspeople', 'ancestry', 'myheritage', 'filae', 'geneanet_premium']};
    const fld = (name, label, value = '', a = '') => `<label>${esc(label)}<input name="${esc(name)}" value="${esc(value ?? '')}" autocomplete="off" ${a}></label>`;
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    function fieldsHtml(kind, v) {
        if (kind === 'auteur') return `${fld('last', 'Nom', v.last)}${fld('first', 'Prénoms', v.first)}
            ${fld('birth_date', 'Naissance (date)', v.birth_date, 'data-ui-date placeholder="26 février 1802"')}${fld('birth_place', 'Lieu de naissance', v.birth_place)}
            ${fld('death_date', 'Mort (date)', v.death_date, 'data-ui-date')}${fld('death_place', 'Lieu de la mort', v.death_place)}
            ${fld('idref', 'Identifiant IdRef (PPN)', v.idref, 'placeholder="026927608"')}${fld('ark', 'Identifiant BnF (ark)', v.ark, 'placeholder="cb119079302"')}${fld('isni', 'ISNI', v.isni)}
            <label class="so-span-2">Ce que dit la notice (métier, œuvres…)<textarea name="note" rows="2">${esc(v.note || '')}</textarea></label>`;
        if (kind === 'oldbailey') return `${fld('ref', 'Référence du procès', v.ref, 'placeholder="t17800628-33"')}${fld('date', 'Date du procès', v.date, 'data-ui-date')}
            <label>Son rôle<select name="role">${Object.entries({accuse: 'Accusé', victime: 'Victime', temoin: 'Témoin'}).map(([k, l]) => `<option value="${k}" ${v.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${fld('offence', 'Crime (Offence)', v.offence_fr ? `${v.offence_fr}` : v.offence)}${fld('verdict', 'Verdict', v.verdict_fr || v.verdict)}${fld('punishment', 'Peine', v.punishment_fr || v.punishment)}`;
        if (kind === 'document') return `<label>Site<select name="site">${KIND_SITES.document.map(k => { const s = S6().site(k); return `<option value="${k}" ${v.site === k ? 'selected' : ''}>${esc(s.label)}${s.paid ? ' (payant)' : ''}</option>`; }).join('')}<option value="" ${!v.site ? 'selected' : ''}>Autre</option></select></label>
            ${fld('title', 'Titre du document', v.title, 'placeholder="Annuaire du Finistère, 1852"')}${fld('date', 'Date ou année', v.date)}${fld('page', 'Page, vue', v.page)}${fld('cote', 'Cote ou référence', v.cote)}`;
        return '';
    }
    function eventsOf(st) {
        const v = st.v, evs = [];
        if (st.kind === 'auteur') {
            if (v.birth_date || v.birth_place) evs.push({tag: 'BIRT', label: 'Naissance', date: v.birth_date || '', place: v.birth_place || '', note: ''});
            if (v.death_date || v.death_place) evs.push({tag: 'DEAT', label: 'Décès', date: v.death_date || '', place: v.death_place || '', note: ''});
        } else if (st.kind === 'oldbailey') {
            const desc = [v.offence && `Crime : ${v.offence}`, v.verdict && `verdict : ${v.verdict}`, v.punishment && `peine : ${v.punishment}`, v.ref && `réf. ${v.ref}`].filter(Boolean).join(' · ');
            evs.push({tag: 'EVEN', label: S6().ROLE_LABEL[v.role || 'accuse'] + ' à l’Old Bailey', date: v.date || '', place: 'Londres (Old Bailey)', note: desc});
        } else if (st.kind === 'hiski') {
            st.rows.forEach((r, i) => { if (st.picked.has(i)) S6().hiskiEvents(r).forEach(e => evs.push(e)); });
        }
        return evs;
    }
    function openImport(o = {}) {
        // notaires et gens de mer : la fenêtre du lot « Archives nationales, SHD » quand elle est là (même tables, même ↶ Annuler)
        const so2 = ext.sourcesOuvertes2;
        if ((o.kind === 'notaire' || o.kind === 'marin') && so2?.openImport && window.LCNDA_SOURCES_OUVERTES_2) return so2.openImport({personId: o.personId, kind: o.kind === 'notaire' ? 'minutier' : 'shd_marin'});
        const kind = KIND_LABEL[o.kind] ? o.kind : 'document';
        const st = {kind, pid: Number(o.personId) || 0, placeId: Number(o.placeId) || 0, placeName: o.placeName || '', ctx: null, file: null, link: o.link || '', text: o.text || '', v: {site: o.site || (o.kind === 'notaire' ? 'minutier' : o.kind === 'marin' ? 'marins_shd' : '')}, rows: [], picked: new Set(), evOn: new Set(), sheet: true, objUrl: '', preview: ''};
        const reparse = () => {
            if (st.kind === 'auteur' && st.text) Object.assign(st.v, Object.fromEntries(Object.entries(S6().parseAuthority(st.text)).filter(([k, x]) => x && !st.v[k])));
            if (st.kind === 'oldbailey' && st.text) Object.assign(st.v, Object.fromEntries(Object.entries(S6().parseOldBailey(st.text)).filter(([k, x]) => x && !st.v[k])));
            if (st.kind === 'hiski') { const r = S6().parseHisKi(st.text); st.rows = r.rows; st.rowsError = r.ok ? '' : r.error;
                const last = S6().fold(st.ctx?.person?.last || ''); st.picked = new Set(st.rows.map((x, i) => i).filter(i => last && S6().fold(st.rows[i].line).includes(last) && st.rows[i].tag !== 'MARR')); }
            const lk = S6().parseLink(st.link);
            if (lk.idref && !st.v.idref) st.v.idref = lk.idref; if (lk.ark && !st.v.ark) st.v.ark = lk.ark;
            if (lk.ref && !st.v.ref) { st.v.ref = lk.ref; st.v.date = st.v.date || lk.date; }
            if (lk.title && !st.v.title) st.v.title = lk.title;
            if (lk.site && st.kind === 'document' && KIND_SITES.document.includes(lk.site) && !o.site) st.v.site = lk.site;
            const evs = eventsOf(st); st.evOn = new Set(evs.map((e, i) => i).filter(i => evs[i].tag !== 'MARR'));
        };
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const extn = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.textOnly) { st.preview = ''; }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extn)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (extn === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (['html', 'htm', 'xml', 'json', 'rdf'].includes(extn)) {
                const raw = await readText(f); st.text = raw.slice(0, 2_000_000);
                const pg = window.LCNDA_SOURCES_OUVERTES?.parseSavedPage && /^htm/.test(extn) ? window.LCNDA_SOURCES_OUVERTES.parseSavedPage(raw) : null;
                if (pg) { st.link = st.link || pg.url; st.v.title = st.v.title || pg.title; }
                if (!o.kind) { if (/<record\b|idref|data\.bnf|dateOfBirth/i.test(raw)) st.kind = 'auteur'; else if (/oldbaileyonline|Reference Number:\s*t\d{8}/i.test(raw)) st.kind = 'oldbailey'; else if (/hiski|kastetut|haudatut/i.test(raw)) st.kind = 'hiski'; }
                st.preview = `<div class="so-pdf">🌐 <b>${esc(pg?.title || f.name)}</b><br><small>${/^htm/.test(extn) ? 'Page enregistrée : seul son texte est lu, la page elle-même n’est pas gardée.' : 'Fichier de notice : seules les informations reconnues sont reprises.'}</small></div>`;
                if (pg) st.text = pg.text || st.text;
            }
            else if (extn === 'txt') { st.file = null; st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image (JPG, PNG, WebP, GIF), un PDF, une page enregistrée (.html), une notice (.xml, .json) ou un texte (.txt)');
            if (!o.kind && st.kind === 'document' && st.text) { if (/Reference Number:\s*t\d{8}|was indicted/i.test(st.text)) st.kind = 'oldbailey'; else if (/kastetut|haudatut|döpta|begravda/i.test(st.text)) st.kind = 'hiski'; else if (/naissance\s*:|idref|data\.bnf|isni/i.test(st.text)) st.kind = 'auteur'; }
            const lk = S6().parseLink(st.link); if (!o.kind && lk.kind && KIND_LABEL[lk.kind]) st.kind = lk.kind;
            if (st.pid) { forget(st.pid); st.ctx = await context(st.pid).catch(() => null); }
            reparse();
            return {count: 1, noun: 'document', summaryHtml: `<b>un document</b> pour ${st.ctx?.person ? `<b>${esc([st.ctx.person.first, String(st.ctx.person.last || '').toUpperCase()].join(' '))}</b>` : st.placeId ? `le lieu <b>${esc(st.placeName)}</b>` : 'la fiche choisie ci-dessous'}`,
                notices: [{kind: 'warn', text: `${S6().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : une naissance ou un décès déjà notés sont gardés, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: `<div class="so-imp" data-so6-imp></div>`, onShow: body => { body.closest('dialog')?.classList.add('modal-l', 'so-import', 'so6-import'); bind(body); draw(body); }};
        };
        const read = body => {
            const box = body.querySelector('[data-so6-imp]'); if (!box) return st.v;
            box.querySelectorAll('.so-fields .so-grid [name]').forEach(i => { if (i.type !== 'checkbox' && !i.name.startsWith('so6_')) st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so6_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so6_text]'); if (tx) st.text = tx.value;
            const sh = box.querySelector('[name=so6_sheet]'); if (sh) st.sheet = sh.checked;
            const evOn = [...box.querySelectorAll('[data-so6-ev]')]; if (evOn.length) st.evOn = new Set(evOn.filter(i => i.checked).map(i => Number(i.dataset.so6Ev)));
            box.querySelectorAll('[data-so6-row]').forEach(i => { const n = Number(i.dataset.so6Row); if (i.checked) st.picked.add(n); else st.picked.delete(n); });
            return st.v;
        };
        let ecT = 0;
        const ecarts = body => {
            clearTimeout(ecT);
            ecT = setTimeout(async () => {
                const ul = body.querySelector('[data-so6-ecarts]'); if (!ul) return;
                if (!st.pid && !st.placeId) { ul.innerHTML = `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`; return; }
                try {
                    const r = await post('so6_preview', payload(body));
                    ul.innerHTML = r.ecarts.length ? r.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
                } catch (e) { ul.innerHTML = `<li class="so-ecart is-orange">⛔ ${esc(e.message)}</li>`; }
            }, 350);
        };
        const payload = body => {
            read(body); const evs = eventsOf(st);
            const site = st.kind === 'auteur' ? (S6().parseLink(st.link).site || (st.v.ark && !st.v.idref ? 'databnf' : 'idref')) : st.kind === 'document' ? (st.v.site || '') : st.kind;
            return {kind: st.kind, site, person_id: st.pid, place_id: st.pid ? 0 : st.placeId, url: S6().cleanUrl(st.link), fields: {...st.v}, text: st.text.slice(0, 20000), sheet: st.sheet,
                events: evs.filter((e, i) => st.evOn.has(i)), source_title: st.kind === 'document' && st.v.title ? st.v.title : ''};
        };
        const draw = body => {
            const box = body.querySelector('[data-so6-imp]'); if (!box) return;
            const evs = eventsOf(st); const has = st.ctx?.person ? (st.ctx.has_death ? ['DEAT'] : []) : [];
            const multi = st.kind === 'hiski';
            box.innerHTML = `<div class="so-imp-who">${st.placeId && !st.pid ? `<span class="pk-lab">Lieu</span> <b>📍 ${esc(st.placeName)}</b>` : st.ctx?.person && o.personId ? `<span class="pk-lab">Fiche</span> <b>${esc(st.ctx.person.first)} ${esc(String(st.ctx.person.last || '').toUpperCase())}</b>` : `<span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so6_pid', kind: 'person', value: st.pid || null})}`}</div>
                <div class="segmented so-kinds" role="tablist" aria-label="Sorte de document">${Object.entries(KIND_LABEL).filter(([k]) => !(st.placeId && !st.pid) || k === 'document').map(([k, l]) => `<button type="button" class="${k === st.kind ? 'is-active' : ''}" aria-selected="${k === st.kind}" data-so6-kind="${k}">${esc(l)}</button>`).join('')}</div>
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${badge('À vérifier', 'yellow', {title: S6().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid">${fieldsHtml(st.kind, st.v)}
                        <label class="so-span-2">Lien vers la notice ou la page<input name="so6_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        ${multi ? '' : `<label class="so-span-2">Texte copié (facultatif : gardé dans la source)<textarea name="so6_text" rows="3">${esc(st.text.slice(0, 20000))}</textarea></label>`}</div>
                    ${multi ? (st.rows.length ? `<fieldset class="so-props"><legend>Les actes trouvés : coche ceux qui sont les siens</legend><ul class="so6-rows">${st.rows.map((r, i) => `<li><label class="checkbox-line"><input type="checkbox" data-so6-row="${i}" ${st.picked.has(i) ? 'checked' : ''}><span><b>${esc({CHR: 'Baptême', BURI: 'Sépulture', MARR: 'Mariage', EVEN: 'Départ'}[r.tag] || r.tag)}</b> · ${esc(r.birth || r.death ? `${r.birth || r.death} → ${r.date}` : r.date)}${r.parish ? ` · ${esc(r.parish)}` : ''}<br><small class="muted">${esc(r.text)}</small></span></label></li>`).join('')}</ul></fieldset>`
                        : UI().notice('warn', st.rowsError || 'Colle le tableau des résultats de HisKi.')) : ''}
                    ${evs.length ? `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>${evs.map((e, i) => { const dup = has.includes(e.tag) || (st.ctx?.birth && ['BIRT'].includes(e.tag) && st.ctx.birth.date);
                        return `<label class="checkbox-line"><input type="checkbox" data-so6-ev="${i}" ${e.tag === 'MARR' ? 'disabled' : st.evOn.has(i) && !dup ? 'checked' : ''}><span>${esc(e.label)}${e.date ? ` · ${esc(e.date)}` : ''}${e.place ? ` · ${esc(e.place)}` : ''}${e.tag === 'MARR' ? ' — un mariage se range dans la famille : il reste dans la source' : dup ? ' — déjà sur la fiche : gardé tel quel' : ''}</span></label>`; }).join('')}</fieldset>` : ''}
                    ${st.kind === 'auteur' ? `<label class="checkbox-line"><input type="checkbox" name="so6_sheet" ${st.sheet ? 'checked' : ''}><span>Ajouter le lien de la notice à ses « Fiches en ligne »</span></label>` : ''}
                    ${st.pid ? `<div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so6-ecarts></ul></div>` : '<ul class="so-ecarts" data-so6-ecarts hidden></ul>'}</div></div>`;
            ecarts(body);
        };
        const bind = body => {
            if (body._so6Bound) return; body._so6Bound = true;
            body.addEventListener('click', e => { const k = e.target.closest('[data-so6-kind]'); if (!k) return; read(body); st.kind = k.dataset.so6Kind; reparse(); draw(body); });
            body.addEventListener('input', e => { if (e.target.closest('.so-fields')) ecarts(body); });
            body.addEventListener('change', async e => {
                if (e.target.name === 'so6_pid') { st.pid = Number(e.target.value) || 0; read(body); st.ctx = null; if (st.pid) { forget(st.pid); st.ctx = await context(st.pid).catch(err => { toast(err.message, 'error'); return null; }); } reparse(); draw(body); return; }
                if (e.target.closest('.so-grid') && st.kind !== 'document') { read(body); const keep = new Set(st.evOn); draw(body); st.evOn = keep; }
                else if (e.target.closest('.so-fields')) ecarts(body);
            });
        };
        const run = async (an, files, body) => {
            const data = payload(body);
            const box = body.querySelector('[data-so6-imp]');
            if (!st.pid && !(st.placeId && st.kind === 'document')) { const f = box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'); UI().fail?.(f, 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            if (st.link && !S6().cleanUrl(st.link)) { UI().fail?.(box.querySelector('[name=so6_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            if (!st.file && !data.url && !data.text.trim() && !data.events.length) { UI().fail?.(box.querySelector('[name=so6_link]'), 'Il faut un fichier, un lien, le texte du document ou au moins une ligne cochée.'); return {keepOpen: true}; }
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch('api.php?action=so6_import', {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; forget(st.pid); if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post('so6_undo', {batch: r.batch}); forget(st.pid); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer : bibliothèques, auteurs, HisKi, Old Bailey', accept: 'image/*,.pdf,.html,.htm,.txt,.xml,.json', what: 'image, PDF, page enregistrée, notice ou texte',
            intro: 'Ce que tu as téléchargé ou enregistré : une page en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), la notice d’un auteur (IdRef : « Télécharger » en XML ou JSON), ou un texte copié (notice, procès de l’Old Bailey, tableau de résultats HisKi). Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 📋 Coller un texte ».',
            noun: 'document', analyze, run, files: o.files});
    }
    /** pas de fichier : un texte copié (et son lien) → la même fenêtre d'import */
    function openPasteText(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-paste so6-paste';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>📋 Coller un texte</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><label>Lien de la notice ou de la page (facultatif)<input name="link" inputmode="url" placeholder="https://www.idref.fr/026927608" autocomplete="off"></label>
            <label>Texte copié<textarea name="text" rows="9" placeholder="Naissance : Besançon, 26-02-1802&#10;Mort : Paris, 22-05-1885&#10;&#10;ou un procès de l’Old Bailey, ou le tableau de résultats de HisKi"></textarea></label>
            <p class="ui-hint">Sélectionne la notice ou la page sur le site, copie-la, colle-la ici : l’app reconnaît la sorte (auteur, procès, actes HisKi) et remplit les cases.</p></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const link = dlg.querySelector('[name=link]').value.trim(), text = dlg.querySelector('[name=text]').value;
            if (link && !S6().cleanUrl(link)) return UI().fail?.(dlg.querySelector('[name=link]'), 'Colle une adresse qui commence par https://');
            if (!text.trim() && !link) return UI().fail?.(dlg.querySelector('[name=text]'), 'Colle le texte de la notice ou de la page.');
            dlg.close(); openImport({...o, link, text, textOnly: true, files: [new File([text || link], 'texte-colle.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal(); setTimeout(() => dlg.querySelector('[name=text]')?.focus(), 30);
        return dlg;
    }

    /* ═════ Les boutons : « Chercher sur internet », blocs des profils, fiche d'un lieu, page Recherche ═════ */
    const btn = (pid, o = {}) => `<button type="button" class="button small secondary" data-so6-search="${esc(o.group || '')}" data-pid="${Number(pid) || 0}"${o.place ? ` data-place="${esc(o.place)}"` : ''}${o.placeOnly ? ' data-place-only="1"' : ''}${o.placeId ? ` data-place-id="${Number(o.placeId)}"` : ''}${o.county ? ` data-county="${esc(o.county)}"` : ''}${o.state ? ` data-state="${esc(o.state)}"` : ''}${o.insee ? ` data-insee="${esc(o.insee)}"` : ''}${o.country ? ` data-country="${esc(o.country)}"` : ''} title="${esc(o.title || 'Ouvre la recherche dans ton navigateur, nom et lieu déjà remplis')}">${esc(o.label || '📚 Bibliothèques, auteurs, marins, notaires…')}</button>`;
    const authorBtn = pid => btn(pid, {group: 'fr_auteurs', label: '✍️ IdRef · data.bnf (auteur)', title: 'Sa notice d’auteur à la BnF ou dans les universités : dates, lieux, autres noms. S’ouvre dans ton navigateur.'});
    const importBtn = (pid, kind = '') => `<button type="button" class="button small secondary" data-so6-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range le document trouvé, crée la source et propose ce qu’il dit">⤒ Importer…</button>`;
    const panelButton = ctx => ctx?.id ? `<div class="so-ws so6-ws">${btn(ctx.id)}<button type="button" class="button small secondary" data-so6-paste data-pid="${Number(ctx.id)}">📋 Coller un texte</button></div>` : '';
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so6-search]'); if (s) { e.preventDefault(); const d = s.dataset; openSearch({personId: Number(d.pid) || 0, group: d.so6Search || '', place: d.place || '', placeOnly: d.placeOnly === '1', placeId: Number(d.placeId) || 0, county: d.county || '', state: d.state || '', insee: d.insee || '', country: d.country || ''}); return; }
        const im = e.target.closest('[data-so6-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so6Import || undefined, placeId: Number(im.dataset.placeId) || 0, placeName: im.dataset.place || ''}); return; }
        const pl = e.target.closest('[data-so6-paste]'); if (pl) { e.preventDefault(); openPasteText({personId: Number(pl.dataset.pid) || 0}); }
    });
    const AUTHOR_BLOCKS = ['artist_page', 'sciences', 'profiles'];
    /** la ligne « bibliothèque de la région » d'un lieu (fiche d'un village, monographie) */
    function placeRow(o) {
        const lib = S6().libraryFor(o); const cu = custom(); const p = {place: o.name};
        const links = lib.mine.map(s => `<a class="button small secondary" href="${esc(S6().url(s.key, p, cu))}" target="_blank" rel="noopener noreferrer" data-so6-go="${esc(s.key)}" title="${esc(s.note)}">📚 ${esc(s.label.split(' — ')[0])} ↗</a>`).join('');
        return `<p class="so-row so6-row so6-place" data-so6-region="${esc(lib.region?.key || '')}">${links}${btn(0, {group: 'fr_bn', place: o.name, placeOnly: true, placeId: o.placeId, county: o.county, state: o.state, insee: o.insee, country: o.country, label: lib.mine.length ? '📚 Autres bibliothèques…' : '📚 Livres et journaux sur ce lieu…'})}${o.placeId && !o.ro ? `<button type="button" class="button small secondary" data-so6-import="document" data-pid="0" data-place-id="${Number(o.placeId)}" data-place="${esc(o.name)}" title="Range la page trouvée et crée la source, reliées à ce lieu">⤒ Importer…</button>` : ''}${lib.region ? ` <small class="muted">${esc(lib.region.label)}</small>` : ''}</p>`;
    }
    function decorate(root = document) {
        const ws = root.querySelector?.('#workspace') || root; if (!ws?.querySelectorAll || !S6()) return;
        const cur = A()?.state?.currentPerson?.person; const pid = Number(cur?.id) || 0;
        const ro = document.body.classList.contains('is-kiosk') || Number(cur?.is_locked) === 1 || document.documentElement.classList.contains('ms-open');
        if (pid) {
            const panel = ws.querySelector('[data-pblock="web_search"] .web-search-panel:not([data-so6])');
            if (panel) { panel.dataset.so6 = '1'; const at = panel.querySelector('.so3-ws, .so-ws'); (at || panel.firstElementChild)?.insertAdjacentHTML('afterend', panelButton({id: pid})); }
            const blocks = AUTHOR_BLOCKS.map(k => ws.querySelector(`[data-pblock="${k}"]`)).filter(b => b && !b.querySelector('.so6-author'));
            if (blocks.length || ws.querySelector('[data-pblock="web_search"] .so6-ws:not([data-so6-a])')) context(pid).then(c => {
                if (!c?.is_author) return;
                blocks.forEach(card => { const b = card.querySelector('.card-body'); if (b && !card.querySelector('.so6-author')) b.insertAdjacentHTML('beforeend', `<p class="so-row so6-row so6-author">${authorBtn(pid)}${ro ? '' : importBtn(pid, 'auteur')}</p>`); });
                const w = ws.querySelector('[data-pblock="web_search"] .so6-ws:not([data-so6-a])'); if (w) { w.dataset.so6A = '1'; w.insertAdjacentHTML('beforeend', authorBtn(pid)); }
            }).catch(() => {});
        }
        const village = ws.querySelector('.h-village:not([data-so6])');
        if (village) {
            village.dataset.so6 = '1';
            const name = (village.querySelector('.page-header h2, h2')?.textContent || '').trim().replace(/^[^\p{L}]+/u, '');
            const sub = village.querySelector('.page-header p, header p')?.textContent || '';
            const host = village.querySelector('[data-cpo-host]'); const cad = village.querySelector('[data-cad-insee]');
            const parts = sub.split(/[,·]/).map(x => x.trim()).filter(Boolean);
            const stats = village.querySelector('[data-vsec="stats"]');
            if (name && stats) stats.insertAdjacentHTML('afterend', placeRow({name, placeId: Number(host?.dataset.cpoPlace) || 0, county: parts[0] || '', state: parts[1] || '', country: parts[parts.length - 1] || '', insee: cad?.dataset.cadInsee || '', ro}));
        }
        const mono = ws.querySelector('[data-cpo-host].place-monograph-postcards:not([data-so6])');
        if (mono && !mono.closest('.h-village')) {
            mono.dataset.so6 = '1';
            const name = mono.dataset.cpoName || ''; const page = mono.closest('section.page') || ws;
            const sub = page.querySelector('.page-header p, header p')?.textContent || '';
            if (name) mono.insertAdjacentHTML('beforebegin', placeRow({name, placeId: Number(mono.dataset.cpoPlace) || 0, county: '', state: '', country: '', insee: '', ro, ...{text: sub}}).replace('data-so6-region', 'data-so6-mono data-so6-region'));
        }
        const tool = ws.querySelector('.web-search-tool:not([data-so6]) .page-header > div');
        if (tool) { tool.closest('.web-search-tool').dataset.so6 = '1'; tool.insertAdjacentHTML('beforeend', `<p class="so-ws so6-ws">${btn(0)}<button class="button small secondary" type="button" data-so6-paste data-pid="0">📋 Coller un texte</button></p>`); }
        applyFree(ws);
    }

    /* ═════ « Chercher sur internet » : les nouveaux sites, la pastille PAYANT et « Gratuites seulement » ═════ */
    const prevExtra = ext.webSearchExtra;
    ext.webSearchExtra = () => [...(typeof prevExtra === 'function' ? (() => { try { return prevExtra() || []; } catch (_) { return []; } })() : []), ...(S6() ? S6().webSites(custom()) : [])];
    function addGroups() {
        const groups = A()?.webSearchGroups; if (!Array.isArray(groups)) return false;
        const at = Math.max(0, groups.indexOf('Autres'));
        S6().GROUPS.filter(g => g.id !== 'payant' && g.id !== 'fr_notaires').map(g => g.label).filter(l => !groups.includes(l)).reverse().forEach(l => groups.splice(at, 0, l));
        return true;
    }
    const PAID_TITLE = key => key === 'so6_scotlandspeople' ? 'Payant : voir un acte demande d’acheter des crédits' : 'Payant : abonnement pour voir la plupart des documents';
    /** les panneaux « Chercher sur internet » (fiche, widget, Recherche) : pastille et filtre ; jamais en premier */
    function applyFree(root = document) {
        if (!S6()) return;
        const free = freeOnly();
        root.querySelectorAll?.('.web-search-panel').forEach(panel => {
            const opts = panel.querySelector('.web-search-options') || panel.querySelector('.web-search-multi') || panel.querySelector('#wst-query');
            if (opts && !panel.querySelector('[data-so6-free]')) opts.insertAdjacentHTML(opts.classList.contains('web-search-options') ? 'beforeend' : 'beforebegin', `<div class="so6-free-line">${freeToggle()}<small class="muted" data-so6-free-count></small></div>`);
            let hidden = 0;
            panel.querySelectorAll('.web-search-site').forEach(sp => {
                const a = sp.querySelector('[data-ws-site]'); if (!a) return; const key = a.dataset.wsSite;
                const paid = S6().isPaidKey(key), partly = S6().PARTLY_PAID[key];
                if ((paid || partly) && !sp.querySelector('.so6-paid')) { a.insertAdjacentHTML('afterend', paidBadge(!paid, paid ? PAID_TITLE(key) : partly)); if (paid) { sp.classList.add('is-paid'); a.title = PAID_TITLE(key); } }
                if (!paid) return;
                const cb = sp.querySelector('[data-ws-pick], [data-ws-pick-off]');
                sp.hidden = free; if (free) hidden++;
                if (cb) { if (free) { cb.checked = false; if (cb.hasAttribute('data-ws-pick')) { cb.dataset.wsPickOff = cb.getAttribute('data-ws-pick'); cb.removeAttribute('data-ws-pick'); } } else if (cb.hasAttribute('data-ws-pick-off')) { cb.setAttribute('data-ws-pick', cb.dataset.wsPickOff); cb.removeAttribute('data-ws-pick-off'); } }
                const links = sp.parentElement; if (links && !free && sp !== links.lastElementChild && links.classList.contains('web-search-links')) links.appendChild(sp); // les payants à la fin de leur rubrique
            });
            panel.querySelectorAll('.web-search-group').forEach(g => { const all = g.querySelectorAll('.web-search-site'); if (!all.length) return; g.hidden = [...all].every(s => s.hidden); });
            const c = panel.querySelector('[data-so6-free-count]'); if (c) c.textContent = hidden ? `${hidden} site${hidden > 1 ? 's' : ''} payant${hidden > 1 ? 's' : ''} caché${hidden > 1 ? 's' : ''}` : '';
        });
        root.querySelectorAll?.('.web-search-editor').forEach(ed => {
            const list = ed.querySelector('.order-list'); if (!list) return;
            if (!ed.querySelector('[data-so6-free]')) list.insertAdjacentHTML('beforebegin', `<div class="so6-free-line">${freeToggle()}<small class="ui-hint">Décoche pour voir et ranger les sites payants (Ancestry, MyHeritage, Filae…).</small></div>`);
            list.querySelectorAll('.order-row').forEach(r => {
                const key = r.dataset.orderKey || '';
                const paid = S6().isPaidKey(key), partly = S6().PARTLY_PAID[key];
                if ((paid || partly) && !r.querySelector('.so6-paid')) (r.querySelector('b, strong, span') || r).insertAdjacentHTML('afterend', ' ' + paidBadge(!paid, partly || PAID_TITLE(key)));
                if (paid) { r.classList.add('is-paid'); r.hidden = free; }
            });
        });
    }
    document.addEventListener('change', e => { if (e.target.matches?.('[data-so6-free]') && !e.target.closest('dialog')) setFreeOnly(e.target.checked); });
    let decoT = 0;
    const watch = () => {
        const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watch, 400);
        new MutationObserver(() => { clearTimeout(decoT); decoT = setTimeout(() => decorate(document), 80); }).observe(ws, {childList: true, subtree: true});
        new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.web-search-editor, .web-search-panel') || n.querySelector?.('.web-search-editor, .web-search-panel'))))) setTimeout(() => applyFree(document), 0); }).observe(document.body, {childList: true, subtree: true});
        decorate(document); applyFree(document);
    };
    const start = () => { if (!A() || !S6()) return setTimeout(start, 200); addGroups(); watch(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    ext.sourcesOuvertes6 = {openSearch, openImport, openPasteText, openSettings, btn, authorBtn, importBtn, panelButton, placeRow, decorate, applyFree, context, freeOnly, setFreeOnly};
})();
