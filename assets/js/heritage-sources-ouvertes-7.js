/* LCNDA — 🌍 Archives en ligne, 7e lot (les écrans) : 🇪🇺 Archives Portal Europe · 🕯 Justes parmi les nations (Comité français
 * pour Yad Vashem) · 👶 enfants trouvés et Assistance publique · 🗿 MonumentsMorts · 📒 relevés des cercles généalogiques ·
 * 🧭 FamilySearch Wiki, GenWiki, GOV · 🇩🇪 CompGen, Archion (PAYANT) · 🗺 Archivní mapy, Mapire · 📰 Arcanum ADT ·
 * 🏛 Ancestry Library Edition (gratuit seulement en bibliothèque).
 *
 * Le modèle commun des lots « Archives en ligne », validé par l'utilisateur :
 *  - « 🔍 Chercher » ouvre le NAVIGATEUR sur la recherche du site, champs remplis ; l'app n'interroge jamais ces sites. Quand
 *    le site ne garde pas la recherche dans son adresse, le nom (ou le lieu) est mis dans le presse-papiers.
 *  - Filtres C5 par rubrique (pays / thème) avec le nombre, « Gratuites seulement » (coché au départ), pastille PAYANT.
 *  - « ⚙️ Réglages des sites » (K2) : sites montrés ou cachés par rubrique, adresse à soi pour chaque site, son cercle
 *    généalogique pour chaque département, « ＋ Mon site ».
 *  - « ⤒ Importer ce que tu as trouvé » (K13) : image, PDF, page enregistrée (.html : son texte seul), texte ou lien collé →
 *    média relié (fiche et/ou lieu), source avec le lien, ajouts cochés (événement, « Juste parmi les nations », placement
 *    d'enfant) avec « c'est la même personne ? » ; rien n'est écrasé ; « ↶ Annuler » (H7) ; tout reste « À vérifier ».
 * Entrées : « Chercher sur internet » de la fiche, bloc « 👶 Enfant placé », monographie d'un lieu (aide par lieu, monument,
 * cadastre ancien, cercle), bloc Militaire (monument aux morts).
 * Calculs purs : app-sources-ouvertes-7-core.js (LCNDA_SOURCES_OUVERTES_7). Serveur : lib/sources_ouvertes_7.php.
 * Mode d'emploi : docs/UI.md (« 🌍 Archives en ligne, 7e lot »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S7 = () => window.LCNDA_SOURCES_OUVERTES_7;
    const SO1 = () => window.LCNDA_SOURCES_OUVERTES; // parseSavedPage (page enregistrée → texte), livingRisk
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-7-sites';
    const TAB_KEY = 'genealogie-sources-ouvertes-7-tab';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    /** réglage : {hidden: [clés], urls: {clé: modèle}, cercles: {« 32 »: adresse}, mine: [sites ajoutés]} ; « Gratuites seulement » : la clé commune à tous les lots */
    const FREE_KEY = 'genealogie-sources-gratuites'; // posée par le lot 6 (heritage-sources-ouvertes-6.js), partagée par tous les lots
    const freeOnly = () => { try { return ext.sourcesOuvertes6?.freeOnly ? !!ext.sourcesOuvertes6.freeOnly() : lsGet(FREE_KEY, '1') !== '0'; } catch (_) { return true; } };
    const setFreeOnly = on => { if (ext.sourcesOuvertes6?.setFreeOnly) { try { ext.sourcesOuvertes6.setFreeOnly(!!on); return; } catch (_) {} } try { localStorage.setItem(FREE_KEY, on ? '1' : '0'); } catch (_) {} };
    const settings = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const saveSettings = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} };
    const custom = () => { const s = settings(); return {...(s.urls || {}), cercles: s.cercles || {}}; };
    const mineSites = () => (settings().mine || []).map(m => S7().cleanCustom(m)).filter(m => !S7().checkCustom(m).length)
        .map(m => ({key: m.key, group: m.group, icon: m.icon, label: m.label, paid: m.paid, verified: 'mine', note: 'Un site que tu as ajouté.', mine: true, tpl: m.url, kind: 'acte', where: ['fiche', 'lieu']}));
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const ctxCache = new Map();
    const context = async pid => { const k = Number(pid) || 0; if (!k) return null; if (!ctxCache.has(k)) ctxCache.set(k, api('so_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    const forget = pid => ctxCache.delete(Number(pid) || 0);

    /* ═════ 🔍 Chercher ═════ */
    function paramsFrom(ctx, place) {
        const p = ctx?.person || {};
        const pl = place?.name || ctx?.birth?.place || ctx?.places?.[0] || '';
        return {first: String(p.first || '').split(/\s+/)[0] || '', last: p.last || '', place: String(pl).split(',')[0], county: place?.county || ctx?.birth?.county || ctx?.dept?.name || '',
            deptCode: ctx?.dept?.code || '', country: place?.country || '', y1: p.birth_year || '', y2: p.death_year || '', birthYear: p.birth_year || '', deathYear: p.death_year || ''};
    }
    const urlOf = (s, p) => s.mine ? (S7().cleanUrl(S7().fillCustom(s.tpl, p)) || '') : S7().url(s.key, p, custom());
    const badges = s => {
        const b = S7().paidBadge(s); const out = [];
        if (b) out.push(UI().badge(b.text, b.kind, {title: b.title}));
        if (s.sensitive) out.push(UI().badge('Mémoire', 'grey', {title: 'Ton sobre : jamais dans un jeu'}));
        if (s.mine) out.push(UI().badge('Mon site', 'blue'));
        else if (s.verified === 'non') out.push(`<small class="muted" title="Construite d’après la forme connue du site, sans avoir pu l’ouvrir le ${esc(S7().CHECKED)}">adresse non vérifiée</small>`);
        if (custom()[s.key] && typeof custom()[s.key] === 'string') out.push(UI().badge('Adresse à toi', 'blue'));
        return out.join(' ');
    };
    function linksHtml(list, p) {
        if (!list.length) return A().empty ? A().empty('Aucun site dans cette rubrique', {icon: '🌐', hint: 'Décoche « Gratuites seulement » ou montre des sites dans « ⚙️ Réglages des sites ».'}) : '';
        return `<ul class="so-links so7-links">${list.map(s => {
            const u = urlOf(s, p); const copy = s.mine ? '' : S7().copyText(s.key, p);
            return `<li class="so-link${s.paid ? ' is-paid' : ''}"><span class="so-link-ico" aria-hidden="true">${esc(s.icon)}</span>
                <span class="so-link-main"><b>${esc(s.label)}</b> ${badges(s)}${s.note ? `<small class="so7-note">${esc(s.note)}</small>` : ''}<code class="so-url" data-so7-url="${esc(s.key)}">${esc(u)}</code></span>
                <a class="button small" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-so7-go="${esc(s.key)}" ${copy ? `data-so7-copy="${esc(copy)}" title="« ${esc(copy)} » sera copié : colle-le dans la case du site"` : ''}>↗ Ouvrir${copy ? ' 📋' : ''}</a></li>`;
        }).join('')}</ul>`;
    }
    const GROUP_HELP = {
        europe: 'Archives Portal Europe réunit les inventaires des archives nationales et régionales de 30 pays : on y trouve dans quel fonds et sous quelle cote est un registre, puis on va le voir sur le site du pays.',
        fr_memoire: 'Les Justes parmi les nations : celles et ceux qui ont caché ou sauvé des Juifs pendant la guerre, reconnus par Yad Vashem. Et les monuments aux morts de chaque commune, avec leur photo et leurs noms.',
        fr_enfants: 'Les enfants trouvés, abandonnés puis « assistés » étaient inscrits sous un numéro matricule et souvent placés en nourrice à la campagne (Morvan, Bretagne, Normandie…). Les registres sont aux Archives de Paris pour Paris, aux Archives départementales ailleurs.',
        fr_cercles: 'Les cercles généalogiques relèvent les actes de leurs communes et en mettent souvent les tables en ligne gratuitement. Écris l’adresse de ton cercle dans « ⚙️ Réglages des sites » : elle s’ouvrira pour ce département.',
        aide: 'Avant de chercher dans un lieu inconnu : quels registres existent, depuis quand, où ils sont gardés et lesquels sont en ligne. FamilySearch Wiki pour le monde entier, GenWiki et GOV pour l’Allemagne et l’Europe centrale.',
        allemagne: 'CompGen (association allemande) publie gratuitement les livres des familles de nombreux villages. Archion montre les registres des paroisses protestantes, avec un abonnement payant.',
        centre: 'Les plans du cadastre ancien de Bohême-Moravie et de l’empire d’Autriche montrent la maison et les champs, parcelle par parcelle. Arcanum ADT est la grande bibliothèque numérique hongroise.',
        bibliotheque: 'Certaines bibliothèques et archives offrent Ancestry gratuitement sur leurs ordinateurs (Ancestry Library Edition). Demande à ta médiathèque ou à tes Archives départementales.',
    };
    function openSearch(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-search so7-search';
        let group = typeof o.group === 'string' ? o.group : lsGet(TAB_KEY, ''); let ctx = null, pid = Number(o.personId) || 0; const place = o.place || null; const where = o.where || '';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🌍 Europe, Justes, enfants assistés, monuments, cadastres…</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body so-search-body" data-so7-body>${UI().spinner('Ce que la fiche sait…')}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-so7-settings>⚙️ Réglages des sites</button><span class="spacer"></span><button type="button" class="button secondary" data-so7-import-from-search>⤒ Importer ce que tu as trouvé…</button><button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-so7-body]');
        const val = () => Object.fromEntries(new FormData(dlg.querySelector('form')));
        const all = () => { const st = settings(); let l = S7().visible({...st, freeOnly: freeOnly()}, [...(where ? S7().forPlace(where, paramsFrom(ctx, place)) : S7().SITES), ...mineSites()]); return l; };
        const updLinks = () => {
            const list = all(); const c = S7().counts(list);
            if (group && !c[group]) group = '';
            const pills = body.querySelector('[data-so7-pills]');
            if (pills) pills.innerHTML = [`<button type="button" class="${group ? '' : 'is-active'}" data-so7-tab="">Tout (${c.all})</button>`,
                ...S7().GROUPS.filter(g => c[g.id]).map(g => `<button type="button" class="${g.id === group ? 'is-active' : ''}" data-so7-tab="${g.id}">${esc(g.icon)} ${esc(g.label)} (${c[g.id]})</button>`)].join('');
            const help = body.querySelector('[data-so7-help]'); if (help) help.textContent = group ? (GROUP_HELP[group] || '') : 'Chaque recherche s’ouvre dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans l’adresse, et ne se connecte jamais à ces sites.';
            const box = body.querySelector('[data-so7-links]'); if (box) box.innerHTML = linksHtml(list.filter(s => !group || s.group === group), {...paramsFrom(ctx, place), ...val()});
        };
        const draw = () => {
            const p = paramsFrom(ctx, place);
            const living = ctx?.person && SO1()?.livingRisk?.(ctx.person);
            const who = place ? `<p class="so7-target">📍 Pour <b>${esc(place.name || '')}</b>${place.county ? ` · ${esc(place.county)}` : ''}</p>`
                : o.personId ? '' : `<div class="so-who"><span class="pk-lab">À partir d’une fiche (facultatif)</span>${pickerField({name: 'so7_pid', kind: 'person', value: pid || null})}</div>`;
            body.innerHTML = `<div class="ui-filters so7-pills" data-so7-pills></div>${who}
                ${living ? UI().notice('warn', 'Cette personne est peut-être vivante : ces recherches restent dans ton navigateur, rien n’est partagé. Pense à sa vie privée.') : ''}
                <p class="so-help" data-so7-help></p>
                <div class="form-grid so-grid">
                    <label>Nom<input name="last" value="${esc(place ? '' : p.last)}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(place ? '' : p.first)}" autocomplete="off"></label>
                    <label>Lieu<input name="place" value="${esc(p.place)}" autocomplete="off" placeholder="Auch, Brno, Sopron…"></label>
                    <label>Département (nom ou n°)<input name="county" value="${esc(p.deptCode || p.county)}" autocomplete="off" placeholder="Gers, 32…"></label>
                    <label>Pays<input name="country" value="${esc(p.country)}" autocomplete="off" placeholder="France, Allemagne…"></label>
                    <label>Né(e) en<input name="birthYear" type="number" min="1500" max="2100" value="${esc(p.birthYear)}"></label>
                </div>
                <label class="ui-toggle so7-free"><input type="checkbox" data-so7-free ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement</label>
                <div data-so7-links></div>
                <p class="ui-hint">Ce qu’on lit sur ces sites est à vérifier : homonymes, fautes de lecture. Enregistre le document (image, PDF, page) ou copie son lien, puis fais « ⤒ Importer ce que tu as trouvé ».</p>`;
            updLinks();
        };
        dlg.addEventListener('input', e => { if (e.target.closest('.so-grid')) updLinks(); });
        dlg.addEventListener('change', async e => {
            if (e.target.matches('[data-so7-free]')) { setFreeOnly(e.target.checked); updLinks(); return; }
            if (e.target.name === 'so7_pid') { pid = Number(e.target.value) || 0; try { ctx = await context(pid); } catch (err) { toast(err.message, 'error'); } draw(); }
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const t = e.target.closest('[data-so7-tab]');
            if (t) { group = t.dataset.so7Tab; try { localStorage.setItem(TAB_KEY, group); } catch (_) {} updLinks(); return; }
            const go = e.target.closest('[data-so7-go][data-so7-copy]');
            if (go) { try { navigator.clipboard?.writeText(go.dataset.so7Copy).then(() => toast(`« ${go.dataset.so7Copy} » copié : colle-le dans la case du site.`), () => {}); } catch (_) {} }
            if (e.target.closest('[data-so7-settings]')) { openSettings(() => updLinks()); return; }
            if (e.target.closest('[data-so7-import-from-search]')) {
                dlg.close(); const s = all().find(x => (!group || x.group === group) && x.kind && x.kind !== 'aide');
                openImport({personId: pid, kind: s?.kind || 'acte', site: s && !s.mine ? s.key : '', place});
            }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        (pid ? context(pid) : Promise.resolve(null)).then(c => { ctx = c; draw(); }).catch(err => { body.innerHTML = UI().notice('error', err.message); });
        return dlg;
    }

    /* ═════ ⚙️ Réglages des sites (K2) ═════ */
    function openSettings(onChange) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-settings so7-settings';
        const sample = {first: '{prénom}', last: '{nom}', place: '{lieu}', county: '{département}', country: '{pays}'};
        const rows = () => {
            const st = settings(); const hidden = new Set(st.hidden || []); const urls = st.urls || {};
            const groups = S7().GROUPS.map(g => `<h4 class="so2-set-h">${esc(g.icon)} ${esc(g.label)}</h4>${S7().SITES.filter(s => s.group === g.id).map(s => `<div class="so-set-row so7-set-row">
                <label class="ui-toggle"><input type="checkbox" data-so7-show="${esc(s.key)}" ${hidden.has(s.key) ? '' : 'checked'}><i></i><b>${esc(s.label)}</b></label> ${badges(s)}
                <label class="so7-set-url"><span class="sr-only">Adresse à toi pour ${esc(s.label)}</span><input name="${esc(s.key)}" data-so7-tpl value="${esc(urls[s.key] || '')}" placeholder="${esc(decodeURIComponent(S7().url(s.key, sample).replace(/%(?![0-9A-F]{2})/gi, '%25')))}" autocomplete="off" spellcheck="false"></label></div>`).join('')}`).join('');
            const cer = Object.entries(st.cercles || {});
            const cercles = `<h4 class="so2-set-h">📒 Mon cercle généalogique, par département</h4><p class="ui-hint">Le n° du département puis l’adresse du site de son cercle (ses relevés). Une ligne par département.</p>
                <div data-so7-cercles>${[...cer, ['', '']].map(([d, u]) => `<div class="so7-cercle"><label>Département<input data-so7-cdep value="${esc(d)}" placeholder="32" maxlength="3" autocomplete="off"></label><label>Adresse du cercle<input data-so7-curl value="${esc(u)}" inputmode="url" placeholder="https://…" autocomplete="off"></label></div>`).join('')}</div>`;
            const mine = (st.mine || []).map(m => S7().cleanCustom(m));
            const mines = `<h4 class="so2-set-h">🔗 Mes sites</h4><div data-so7-mine>${mine.map(m => `<div class="so7-mine" data-key="${esc(m.key)}"><label>Nom<input data-m="label" value="${esc(m.label)}" autocomplete="off"></label>
                <label>Adresse de recherche<input data-m="url" value="${esc(m.url)}" placeholder="https://…?q={nom}+{lieu}" autocomplete="off" spellcheck="false"></label>
                <label>Rubrique<select data-m="group">${S7().GROUPS.map(g => `<option value="${g.id}" ${g.id === m.group ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
                <label>Prix<select data-m="paid">${[['', 'Gratuit'], ['partiel', 'En partie payant'], ['oui', 'Payant'], ['bibliotheque', 'Gratuit en bibliothèque']].map(([v, l]) => `<option value="${v}" ${String(m.paid || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <button type="button" class="icon-button" data-so7-mine-del aria-label="Retirer ce site">×</button>${S7().checkCustom(m).map(t => `<p class="ui-hint is-error">⛔ ${esc(t)}</p>`).join('')}</div>`).join('')}</div>
                <button type="button" class="button small secondary" data-so7-mine-add>＋ Mon site</button>`;
            return `<label class="ui-toggle"><input type="checkbox" data-so7-free-set ${freeOnly() ? 'checked' : ''}><i></i>Gratuites seulement (les sites payants restent à la fin quand on décoche)</label>${groups}${cercles}${mines}`;
        };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · RÉGLAGES</span><h2>⚙️ Réglages des sites</h2></div><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Montre ou cache chaque site. Si un site change son adresse de recherche, écris la nouvelle (case vide = l’adresse de l’app, en gris). Mots remplacés : {nom}, {prénom}, {nom_complet}, {lieu}, {département}, {pays}, {de}, {à}, {naissance}, {décès}.</p>
            <div class="so-set" data-so7-set>${rows()}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-ui-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const read = () => {
            const box = dlg.querySelector('[data-so7-set]'); const o = {};
            const fr = box.querySelector('[data-so7-free-set]'); if (fr && fr.checked !== freeOnly()) setFreeOnly(fr.checked); // la clé commune, pas ce réglage
            o.hidden = [...box.querySelectorAll('[data-so7-show]')].filter(i => !i.checked).map(i => i.dataset.so7Show);
            o.urls = {}; box.querySelectorAll('[data-so7-tpl]').forEach(i => { const v = i.value.trim(); if (v && S7().cleanUrl(v.replace(/[{}]/g, ''))) o.urls[i.name] = v.slice(0, 600); });
            o.cercles = {}; box.querySelectorAll('.so7-cercle').forEach(r => { const d = r.querySelector('[data-so7-cdep]').value.trim().toUpperCase(); const u = S7().cleanUrl(r.querySelector('[data-so7-curl]').value); if (/^(\d{2,3}|2A|2B)$/.test(d) && u) o.cercles[d] = u; });
            o.mine = [...box.querySelectorAll('.so7-mine')].map(r => S7().cleanCustom({key: r.dataset.key, label: r.querySelector('[data-m=label]').value, url: r.querySelector('[data-m=url]').value, group: r.querySelector('[data-m=group]').value, paid: r.querySelector('[data-m=paid]').value}));
            return o;
        };
        const auto = UI().autoSaveDialog(dlg, {keys: [KEY, FREE_KEY], label: 'Réglage des sites',
            save: () => saveSettings(read()),
            reload: () => { dlg.querySelector('[data-so7-set]').innerHTML = rows(); },
            reset: () => { try { localStorage.removeItem(KEY); } catch (_) {} },
            onChange: () => onChange?.()});
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-ui-x]')) { dlg.close(); return; }
            if (e.target.closest('[data-so7-mine-add]')) { const s = read(); s.mine.push(S7().cleanCustom({label: 'Mon site', url: 'https://', group: 'europe'})); saveSettings(s); dlg.querySelector('[data-so7-set]').innerHTML = rows(); dlg.querySelector('.so7-mine:last-child [data-m=url]')?.focus(); onChange?.(); return; }
            const del = e.target.closest('[data-so7-mine-del]'); if (del) { del.closest('.so7-mine').remove(); saveSettings(read()); onChange?.(); }
        });
        dlg.addEventListener('change', e => { // la dernière ligne des cercles remplie (département ET adresse) : gardée, et une ligne vide s'ajoute
            const row = e.target.closest('.so7-cercle:last-child'); if (!row) return;
            const d = row.querySelector('[data-so7-cdep]').value.trim(), u = S7().cleanUrl(row.querySelector('[data-so7-curl]').value);
            if (d && u) { saveSettings(read()); row.insertAdjacentHTML('afterend', `<div class="so7-cercle"><label>Département<input data-so7-cdep placeholder="32" maxlength="3" autocomplete="off"></label><label>Adresse du cercle<input data-so7-curl inputmode="url" placeholder="https://…" autocomplete="off"></label></div>`); }
        });
        dlg.addEventListener('close', () => { onChange?.(); dlg.remove(); });
        dlg.showModal();
        void auto;
        return dlg;
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé (K13) ═════ */
    const fieldHtml = ([k, label, type, choices], v) => type === 'choice'
        ? `<label>${esc(label)}<select name="${esc(k)}">${choices.map(([c, l]) => `<option value="${esc(c)}" ${String(v[k] || '') === c ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
        : type === 'long' ? `<label class="so-span-2">${esc(label)}<textarea name="${esc(k)}" rows="3">${esc(v[k] || '')}</textarea></label>`
            : `<label>${esc(label)}<input name="${esc(k)}" value="${esc(v[k] || '')}" autocomplete="off" ${type === 'date' ? 'data-ui-date' : ''}></label>`;
    const NAME_FIELDS = [['last', 'Nom lu sur le document', 'text'], ['first', 'Prénoms lus', 'text'], ['birth_date', 'Naissance lue', 'text']];
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    function openImport(o = {}) {
        const K = () => S7().KINDS;
        const st = {kind: K()[o.kind] ? o.kind : 'acte', site: o.site || '', pid: Number(o.personId) || 0, placeId: o.place?.id ? String(o.place.id) : '', fiche: null, ecarts: [],
            file: null, link: o.link || '', text: o.text || '', v: {}, objUrl: '', toggled: {}, same: 'yes', preview: ''};
        const kind = () => K()[st.kind];
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const ex = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.linkOnly) { /* lien collé : rien à ranger */ }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ex)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (ex === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (ex === 'html' || ex === 'htm') { const pg = SO1()?.parseSavedPage ? SO1().parseSavedPage(await readText(f)) : {title: f.name, url: '', text: ''}; st.text = pg.text; st.link = st.link || pg.url; st.preview = `<div class="so-pdf">🌐 <b>${esc(pg.title || f.name)}</b><br><small>Page enregistrée : seul son texte est gardé (dans la source).</small></div>`; }
            else if (ex === 'txt') { st.file = o.linkOnly ? null : f; st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image (JPG, PNG, WebP, GIF), un PDF, une page enregistrée (.html) ou un texte (.txt)');
            const lk = S7().parseLink(st.link); if (lk.site) { st.site = lk.site; if (!o.kind && K()[lk.kind]) st.kind = lk.kind; }
            if (!o.kind && !lk.kind && st.text) { const d = S7().detectKind(st.text); if (d) st.kind = d; }
            if (st.text) st.v = {...S7().parseFields(st.text, st.kind), ...st.v};
            await loadFiche();
            return {count: 1, noun: 'document', summaryHtml: `<b>un document</b> pour ${st.fiche ? `<b>${esc([st.fiche.first, String(st.fiche.last || '').toUpperCase()].join(' '))}</b>` : o.place ? `<b>${esc(o.place.name)}</b>` : 'la fiche ou le lieu choisi ci-dessous'}`,
                notices: [{kind: 'warn', text: `${S7().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien n’est remplacé : on ajoute à côté. « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: '<div class="so-imp" data-so7-imp></div>', onShow: body => draw(body)};
        };
        const loadFiche = async () => {
            st.fiche = null; st.ecarts = [];
            if (!st.pid || kind().common) return;
            try { const r = await post('so7_preview', {kind: st.kind, person_id: st.pid, site: st.site, url: S7().cleanUrl(st.link), fields: st.v}); st.fiche = r.person; st.ecarts = r.ecarts || []; }
            catch (e) { st.ecarts = [{level: 'orange', text: e.message}]; }
        };
        const read = body => {
            const box = body.querySelector('[data-so7-imp]'); if (!box) return st.v;
            box.querySelectorAll('.so7-f input[name], .so7-f select[name], .so7-f textarea[name]').forEach(i => { st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so7_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so7_text]'); if (tx) st.text = tx.value;
            const same = box.querySelector('[name=so7_same]:checked'); if (same) st.same = same.value;
            box.querySelectorAll('[data-so7-add]').forEach(c => { st.toggled[c.dataset.so7Add] = c.checked; });
            return st.v;
        };
        const proposals = () => S7().proposals(st.kind, st.v, {has: st.fiche?.has || {}, hasJuste: !!st.fiche?.hasJuste,
            samePlacement: !!(st.v.matricule && (st.fiche?.matricules || []).some(m => S7().fold(m) === S7().fold(st.v.matricule)))}).map(p => ({...p, checked: st.toggled[p.id] ?? p.checked}));
        const propsHtml = () => {
            const list = proposals(); if (!list.length) return '';
            return `<fieldset class="so-props"><legend>Ce qui sera ajouté (rien n’est remplacé)</legend>${list.map(p => `<label class="checkbox-line"><input type="checkbox" data-so7-add="${esc(p.id)}" ${p.checked ? 'checked' : ''} ${p.exists ? 'disabled' : ''}>
                <span><b>${esc(p.label)}</b>${[p.date, p.place].filter(Boolean).length ? ` — ${esc([p.date, p.place].filter(Boolean).join(' · '))}` : ''}${p.exists ? `<br><small class="ui-hint">Déjà sur la fiche : ${esc(p.exists)}</small>` : p.why ? `<br><small class="ui-hint">${esc(p.why)}</small>` : ''}</span></label>`).join('')}</fieldset>`;
        };
        const ecartsHtml = () => !st.pid ? `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`
            : st.ecarts.length ? st.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
        let ecT = 0;
        const recheck = body => { clearTimeout(ecT); ecT = setTimeout(async () => { read(body); await loadFiche(); const ul = body.querySelector('[data-so7-ecarts]'); if (ul) ul.innerHTML = ecartsHtml(); const pr = body.querySelector('[data-so7-props]'); if (pr) pr.innerHTML = propsHtml(); }, 350); };
        const draw = body => {
            const box = body.querySelector('[data-so7-imp]'); if (!box) return;
            const k = kind();
            const who = st.fiche && o.personId ? `<div class="so-imp-who"><span class="pk-lab">Fiche</span> <b>${esc(st.fiche.first)} ${esc(String(st.fiche.last || '').toUpperCase())}</b></div>`
                : `<div class="so-imp-who"><span class="pk-lab">${k.person ? 'À qui se rapporte ce document ?' : 'La personne (facultatif)'}</span>${pickerField({name: 'so7_pid', kind: 'person', value: st.pid || null})}</div>`;
            const where = k.place ? (o.place ? `<div class="so-imp-who"><span class="pk-lab">Lieu</span> <b>📍 ${esc(o.place.name || '')}</b></div>` : `<div class="so-imp-who"><span class="pk-lab">Le lieu que ce document complète</span>${pickerField({name: 'so7_place', kind: 'place', value: st.placeId || null})}</div>`) : '';
            const opts = S7().KIND_ORDER.map(x => `<option value="${x}" ${x === st.kind ? 'selected' : ''}>${esc(K()[x].icon)} ${esc(K()[x].label)}</option>`).join('');
            box.innerHTML = `${who}${where}
                <label class="so7-kind">Sorte de document<select name="so7_kind">${opts}</select></label>
                ${k.respect ? `<div class="so2-respect so7-respect"><span aria-hidden="true">🕯</span><p>${esc(S7().RESPECT.text)}</p></div>` : ''}
                ${k.common ? UI().notice('info', 'Un article de presse entre dans « 📰 Dans les médias » de la fiche, comme ceux de Gallica ou RetroNews.') : ''}
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${UI().badge('À vérifier', 'yellow', {title: S7().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid so7-f">${k.person ? NAME_FIELDS.map(f => fieldHtml(f, st.v)).join('') : ''}${k.fields.map(f => fieldHtml(f, st.v)).join('')}</div>
                    <div class="form-grid so-grid"><label class="so-span-2">Lien vers le document ou la notice<input name="so7_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        <label class="so-span-2">Texte copié (facultatif : gardé dans la source)<textarea name="so7_text" rows="3">${esc(st.text)}</textarea></label></div>
                    ${k.person && !k.common ? `<div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so7-ecarts>${ecartsHtml()}</ul>
                        <div class="so7-same"><label class="checkbox-line"><input type="radio" name="so7_same" value="yes" ${st.same === 'yes' ? 'checked' : ''}><span>Oui, c’est bien elle : ajouter à sa fiche ce qui est coché</span></label>
                        <label class="checkbox-line"><input type="radio" name="so7_same" value="no" ${st.same === 'no' ? 'checked' : ''}><span>Pas sûr : garder seulement le document et la source</span></label></div></div>` : ''}
                    <div data-so7-props>${propsHtml()}</div></div></div>`;
        };
        const bind = body => {
            if (body._so7Bound) return; body._so7Bound = true;
            body.addEventListener('input', e => { if (e.target.closest('.so7-f')) recheck(body); });
            body.addEventListener('change', async e => {
                const n = e.target.name;
                if (n === 'so7_kind') { read(body); st.kind = e.target.value; if (st.text) st.v = {...S7().parseFields(st.text, st.kind), ...st.v}; st.toggled = {}; await loadFiche(); draw(body); }
                else if (n === 'so7_pid') { read(body); st.pid = Number(e.target.value) || 0; await loadFiche(); draw(body); }
                else if (n === 'so7_place') st.placeId = String(e.target.value || '');
                else if (e.target.closest('.so7-f')) recheck(body);
                else read(body);
            });
            body.addEventListener('picker-change', e => { if (e.detail?.name === 'so7_place') st.placeId = e.detail.item ? String(e.detail.item.id) : ''; });
        };
        const send = async (action, data, file) => {
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (file) fd.append('file', file, file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch(`api.php?action=${action}`, {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            return j.result;
        };
        const run = async (an, files, body) => {
            read(body);
            const box = body.querySelector('[data-so7-imp]'); const k = kind();
            const plEl = box.querySelector('[name=so7_place]'); if (plEl && plEl.value) st.placeId = String(plEl.value);
            if (k.person && !st.pid) { UI().fail?.(box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'), 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            if (!k.person && !st.pid && !st.placeId) { UI().fail?.(box.querySelectorAll('.so-imp-who')[1] || box.querySelector('.so-imp-who'), 'Choisis le lieu (ou la fiche) que ce document complète.'); return {keepOpen: true}; }
            const link = st.link.trim();
            if (link && !S7().cleanUrl(link)) { UI().fail?.(box.querySelector('[name=so7_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            if (!st.file && !link && !st.text.trim()) { UI().fail?.(box.querySelector('[name=so7_link]'), 'Il faut un fichier, un lien ou le texte du document.'); return {keepOpen: true}; }
            let r, undo;
            if (k.common) { // 📰 presse : l'import « presse » commun de la première vague (lib/sources_ouvertes.php)
                r = await send('so_import', {kind: 'presse', person_id: st.pid, site: st.site || 'arcanum_adt', url: link, fields: {...st.v, journal: st.v.journal || 'Arcanum ADT', text: st.text, transcript: st.text}}, st.file);
                undo = async () => { await post('so_undo', {batch: r.batch}); forget(st.pid); refresh(); };
            } else {
                const adds = {}; proposals().forEach(p => { adds[p.id] = !!p.checked; });
                r = await send('so7_import', {kind: st.kind, site: st.site, person_id: st.pid, place_id: st.placeId, url: link, same: st.same, adds, fields: {...st.v, text: st.text}}, st.file);
                undo = async () => { await post('so7_undo', {batch: r.batch}); forget(st.pid); refresh(); };
            }
            forget(st.pid); if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo};
        };
        return UI().openImportDialog({title: 'Importer depuis les archives en ligne', accept: 'image/*,.pdf,.html,.htm,.txt', what: 'image, PDF, page enregistrée ou texte',
            intro: 'Ce que tu as téléchargé ou enregistré : un acte, une notice, la photo d’un monument ou d’une tombe, un plan de cadastre, la page enregistrée par ton navigateur (« Enregistrer sous… ») ou un texte copié. Rien n’est demandé au site : seul ton fichier est lu.',
            noun: 'document', analyze: async files => { const a = await analyze(files); const show = a.onShow; a.onShow = body => { body.closest('dialog')?.classList.add('modal-l', 'so-import', 'so7-import'); bind(body); show(body); }; return a; }, run, files: o.files});
    }
    /** pas de fichier : un lien collé (et le texte de la notice) → la même fenêtre d'import */
    function openPasteLink(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal so-paste';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🔗 Coller un lien</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><label>Lien du document ou de la notice<input name="link" inputmode="url" placeholder="https://www.archivesportaleurope.net/…" autocomplete="off"></label>
            <label>Texte de la notice (facultatif)<textarea name="text" rows="5"></textarea></label></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const link = dlg.querySelector('[name=link]').value.trim(), text = dlg.querySelector('[name=text]').value;
            if (!S7().cleanUrl(link)) return UI().fail?.(dlg.querySelector('[name=link]'), 'Colle une adresse qui commence par https://');
            dlg.close(); openImport({...o, link, text, linkOnly: true, files: [new File([text || link], 'lien-colle.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        return dlg;
    }

    /* ═════ Les boutons posés dans l'app ═════ */
    /** dans « Chercher sur internet » (fiche) : une ligne, à côté des autres lots */
    const panelButton = ctx => ctx?.id ? `<div class="so-ws so7-ws"><button type="button" class="button small" data-so7-search="" data-pid="${Number(ctx.id)}">🌍 Europe (30 pays), Justes, enfants assistés, monuments, cercles, Allemagne, cadastres anciens…</button><button type="button" class="button small secondary" data-so7-paste data-pid="${Number(ctx.id)}">🔗 Coller un lien</button></div>` : '';
    /** les boutons d'un bloc de la fiche : placement (👶 Enfant placé) · military (monument aux morts) */
    function blockButtons(where, pid, editOnly = h => h) {
        if (!pid) return '';
        if (where === 'placement') return `<button type="button" class="button small secondary" data-so7-search="fr_enfants" data-pid="${Number(pid)}" title="Les registres des enfants trouvés et assistés (Archives de Paris, départements)">👶 Chercher son dossier</button>`
            + editOnly(`<button type="button" class="button small secondary" data-so7-import="enfant" data-pid="${Number(pid)}" title="Range le dossier trouvé et ajoute le placement">⤒ Importer le dossier…</button>`);
        if (where === 'military') return `<button type="button" class="button small secondary" data-so7-search="fr_memoire" data-pid="${Number(pid)}" title="MonumentsMorts (université de Lille)">🗿 Monument aux morts</button>`;
        return '';
    }
    /** la monographie d'un lieu : aide par lieu, monument, cadastre ancien, cercle, Archives Portal Europe */
    function placeHtml(place) {
        if (!place || !Number(place.id)) return '';
        const t = `data-id="${Number(place.id)}" data-name="${esc(place.name || '')}" data-county="${esc(place.county || '')}" data-country="${esc(place.country || '')}"`;
        const p = {place: place.name || '', county: place.county || '', country: place.country || ''};
        const wiki = S7().url('fs_wiki', p, custom());
        return `<p class="so-row so7-place"><a class="button small secondary" href="${esc(wiki)}" target="_blank" rel="noopener noreferrer" data-so7-go="fs_wiki" title="Quels registres existent pour ce lieu, où ils sont, lesquels sont en ligne">🧭 Comment chercher ici (FamilySearch Wiki)</a>
            <button type="button" class="button small secondary" data-so7-place="lieu" ${t}>🌍 Archives d’Europe, monument, cadastre ancien, cercle…</button>
            <button type="button" class="button small secondary" data-so7-place-import ${t} title="Une photo du monument aux morts, un plan de cadastre…">⤒ Importer pour ce lieu…</button></p>`;
    }
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so7-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, group: s.dataset.so7Search || undefined}); return; }
        const im = e.target.closest('[data-so7-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so7Import || undefined, site: im.dataset.so7Import === 'enfant' ? 'ap_paris' : ''}); return; }
        const pl = e.target.closest('[data-so7-paste]'); if (pl) { e.preventDefault(); openPasteLink({personId: Number(pl.dataset.pid) || 0}); return; }
        const pp = e.target.closest('[data-so7-place], [data-so7-place-import]');
        if (pp) { e.preventDefault(); const d = pp.dataset; const place = {id: Number(d.id) || 0, name: d.name || '', county: d.county || '', country: d.country || ''};
            if (pp.matches('[data-so7-place-import]')) openImport({place, kind: 'monument'}); else openSearch({place, where: 'lieu'}); }
    });

    ext.sourcesOuvertes7 = {openSearch, openImport, openPasteLink, openSettings, panelButton, blockButtons, placeHtml, settings};
})();
