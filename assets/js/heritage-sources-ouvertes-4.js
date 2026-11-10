/* LCNDA — 🗂 Archives en ligne (quatrième lot) : 🎖 monuments aux morts · 🪦 cimetières · 🏘 communes et noms · ✝ protestants et
 * marins · 🇪🇺 archives d'Europe · 🌍 presse étrangère (les écrans).
 * Même modèle que heritage-sources-ouvertes.js (et SocFace), validé par l'utilisateur :
 *  - « 🔍 Chercher » ouvre le NAVIGATEUR sur la recherche du site, champs déjà remplis ; l'app n'interroge jamais ces sites.
 *    L'adresse ouverte est montrée telle quelle ; « ⚙️ Adresses des sites » (rangé par pays et par thème) la change (K2).
 *  - « ⤒ Importer ce que tu as trouvé » (fenêtre K13) : photo, PDF, page enregistrée (.html : le texte seul) ou texte, ou lien
 *    collé + saisie aidée → média relié à la fiche, source avec le lien ; selon la sorte : décès et unité (monument aux morts),
 *    sépulture et photo de tombe (bloc Cimetière), acte proposé (baptême, inhumation, recensement, émigration…), passage
 *    (📰 Dans les médias, import « presse » commun). Rien n'est écrasé ; « c'est la même personne ? » avant ; « ↶ Annuler »
 *    après (H7). Tout reste « À vérifier ».
 *  - 🏘 Population d'une commune depuis 1793 et ses anciens noms (Cassini / EHESS) : import du tableau ou saisie aidée,
 *    rapprochés des changements INSEE (frontières anciennes) ; dans la monographie de commune.
 * Entrées : blocs Poilu 14-18, Cimetière, 📰 Dans les médias, « Chercher sur internet » (fiche), monographie de commune,
 * carte des patronymes (Géopatronyme). Calculs purs : app-sources-ouvertes-4-core.js (LCNDA_SO4). Serveur :
 * lib/sources_ouvertes_4.php. Mode d'emploi : docs/UI.md (« 🗂 Archives en ligne (quatrième lot) »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S4 = () => window.LCNDA_SO4;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const plural = (n, one, many) => A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-4-sites';
    const TAB_KEY = 'genealogie-sources-ouvertes-4-tab';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const custom = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const emptyLine = (t, i = '📭') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${i}</span><span class="empty-line-text">${esc(t)}</span></p>`;
    const ctxCache = new Map();
    const context = async pid => { const k = Number(pid) || 0; if (!k) return null; if (!ctxCache.has(k)) ctxCache.set(k, api('so4_context', {person_id: k}).catch(e => { ctxCache.delete(k); throw e; })); return ctxCache.get(k); };
    const forget = pid => { ctxCache.delete(Number(pid) || 0); };
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const groupKeys = () => S4().GROUPS.map(g => g.key);
    const KIND_OF_GROUP = {fr_guerres: 'memorial', fr_cimetieres: 'sepulture', fr_lieux: 'acte', fr_autres: 'acte', europe: 'acte', presse_etr: 'presse'};
    const GROUP_HELP = {
        fr_guerres: 'Les monuments aux morts relevés par les bénévoles de MémorialGenWeb (noms, photos du monument, souvent une biographie), les morts de la guerre de 1870-1871 et les victimes civiles de 1939-1945. Les sites ne gardent pas la recherche dans leur adresse : la recherche passe par Google, limitée au site.',
        fr_cimetieres: 'Les tombes photographiées et relevées par des bénévoles : Cimetières de France, BillionGraves (avec la position GPS), les relevés de Geneanet (Find a Grave est avec les archives américaines). La photo de la tombe se range dans le bloc Cimetière.',
        fr_lieux: 'La commune (population depuis 1793 et anciens noms, EHESS) et le nom de famille (où il vivait entre 1891 et 1990, Géopatronyme).',
        fr_autres: 'Les protestants partis après la révocation de l’édit de Nantes (1685), et les marins de la marine marchande (rôles d’équipage, rangés par port aux Archives départementales et au Service historique de la Défense).',
        europe: 'Les registres d’Europe, gratuits : Matricula (paroisses d’Allemagne, d’Autriche, de Pologne… — on cherche par lieu), Norvège, Suède, Danemark, Irlande, Porta fontium (Bohême, Bavière), Hongrie, JewishGen (gratuit avec un compte).',
        presse_etr: 'Les journaux étrangers numérisés et gratuits : États-Unis, Australie, Nouvelle-Zélande, Pays-Bas. Un article trouvé entre dans « 📰 Dans les médias », comme un article de Gallica.',
    };

    /* ═════ 🔍 Chercher : la fenêtre qui prépare les adresses ═════ */
    function paramsFrom(ctx, place = null) {
        const p = ctx?.person || {};
        const life = [p.birth_year || '', p.death_year || (p.birth_year ? Math.min(Number(p.birth_year) + 90, new Date().getFullYear()) : '')];
        return {first: String(p.first || '').split(/\s+/)[0] || '', last: p.last || '', place: place?.name || (ctx?.death?.place || ctx?.birth?.place || ctx?.places?.[0] || '').split(',')[0],
            y1: life[0], y2: life[1], birthYear: p.birth_year || '', deathYear: p.death_year || '', deptCode: place?.dept || ctx?.dept?.code || '', insee: place?.insee || ''};
    }
    function linksHtml(group, p, scope = '') {
        const cu = custom();
        const sites = S4().SITES.filter(s => s.group === group && (!scope || s.scope === scope || (scope === 'place' && s.scope !== 'name')));
        if (!sites.length) return emptyLine('Aucun site de cette rubrique ne cherche à partir d’ici.', '🔍');
        return `<ul class="so-links">${sites.map(s => {
            const u = S4().url(s.key, p, cu);
            return `<li class="so-link">
                <span class="so-link-ico" aria-hidden="true">${esc(s.icon)}</span>
                <span class="so-link-main"><b>${esc(s.label)}</b>${s.account ? ` ${UI().badge('Compte gratuit', 'yellow', {title: 'Gratuit, mais il faut créer un compte avant de chercher'})}` : ''}${cu[s.key] ? ` ${UI().badge('Adresse à toi', 'blue')}` : ''}${s.verified ? '' : ` <span class="so4-unverif" title="Adresse construite d’après la forme connue du site, pas encore vérifiée en ligne : si elle ne marche plus, change-la dans « ⚙️ Adresses des sites ».">adresse à vérifier</span>`}
                    <small class="so4-note">${esc(s.note || '')}</small><code class="so-url" data-so4-url="${esc(s.key)}">${esc(u)}</code></span>
                <a class="button small" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-so4-go="${esc(s.key)}">↗ Ouvrir</a></li>`;
        }).join('')}</ul>`;
    }
    function openSearch(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-search so4-search';
        let group = groupKeys().includes(o.group) ? o.group : lsGet(TAB_KEY, 'fr_guerres'); if (!groupKeys().includes(group)) group = 'fr_guerres';
        let ctx = null, pid = Number(o.personId) || 0; const place = o.place || null; const scope = place && !pid ? 'place' : '';
        const tabs = () => `<div class="segmented so-tabs so4-tabs" role="tablist">${S4().GROUPS.map(g => `<button type="button" role="tab" class="${g.key === group ? 'is-active' : ''}" aria-selected="${g.key === group}" data-so4-tab="${g.key}" title="${esc(g.label)}">${esc(g.icon)} ${esc(g.label.replace(/^France · /, ''))}</button>`).join('')}</div>`;
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · MONUMENTS, CIMETIÈRES, EUROPE, PRESSE ÉTRANGÈRE</span><h2>🔍 Chercher sur…</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body so-search-body" data-so4-body>${UI().spinner('Ce que la fiche sait…')}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-so4-settings>⚙️ Adresses des sites</button><span class="spacer"></span><button type="button" class="button secondary" data-so4-paste-in>🔗 Coller un lien</button><button type="button" class="button secondary" data-so4-import-from-search>⤒ Importer ce que tu as trouvé…</button><button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-so4-body]');
        const val = () => { const v = Object.fromEntries(new FormData(dlg.querySelector('form'))); v.withFirst = true; return v; };
        const updLinks = () => { const box = body.querySelector('[data-so4-links]'); if (box) box.innerHTML = linksHtml(group, val(), scope); };
        const draw = () => {
            const p = paramsFrom(ctx, place);
            const living = ctx?.person && S4().livingRisk(ctx.person);
            body.innerHTML = `${tabs()}
                ${o.personId || place ? '' : `<div class="so-who"><span class="pk-lab">À partir d’une fiche (facultatif)</span>${pickerField({name: 'so4_pid', kind: 'person', value: pid || null})}</div>`}
                ${living ? UI().notice('warn', 'Cette personne est peut-être vivante : ces recherches restent dans ton navigateur, rien n’est partagé. Pense à sa vie privée.') : ''}
                <p class="so-help">${esc(GROUP_HELP[group] || '')}</p>
                <div class="form-grid so-grid">
                    <label>Nom<input name="last" value="${esc(p.last)}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(p.first)}" autocomplete="off"></label>
                    <label>Lieu<input name="place" value="${esc(p.place)}" autocomplete="off" placeholder="Tulle, Bergen, Wien…"></label>
                    <label>De l’année<input name="y1" type="number" min="1500" max="2100" value="${esc(p.y1)}"></label>
                    <label>à l’année<input name="y2" type="number" min="1500" max="2100" value="${esc(p.y2)}"></label>
                    <label>N° du département<input name="deptCode" value="${esc(p.deptCode)}" autocomplete="off" placeholder="19"></label>
                    <input type="hidden" name="birthYear" value="${esc(p.birthYear)}"><input type="hidden" name="insee" value="${esc(p.insee)}">
                </div>
                ${UI().notice('info', 'Chaque recherche s’ouvre dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans l’adresse, et ne se connecte jamais à ces sites.')}
                <div data-so4-links></div>
                <p class="ui-hint">Ce qu’on lit sur ces sites est à vérifier : homonymes, fautes de lecture. Ensuite, enregistre la page, la photo ou le PDF, ou copie son lien, et fais « ⤒ Importer ce que tu as trouvé ».</p>`;
            updLinks();
        };
        dlg.addEventListener('input', e => { if (e.target.closest('.so-grid')) updLinks(); });
        dlg.addEventListener('change', async e => {
            if (e.target.closest('.so-grid')) updLinks();
            if (e.target.name === 'so4_pid') { pid = Number(e.target.value) || 0; try { ctx = await context(pid); } catch (err) { toast(err.message, 'error'); } draw(); }
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const t = e.target.closest('[data-so4-tab]');
            if (t) { group = t.dataset.so4Tab; try { localStorage.setItem(TAB_KEY, group); } catch (_) {} const keep = val(); draw(); ['last', 'first', 'place', 'y1', 'y2', 'deptCode'].forEach(k => { const el = dlg.querySelector(`[name=${k}]`); if (el && keep[k] !== undefined) el.value = keep[k]; }); updLinks(); return; }
            if (e.target.closest('[data-so4-settings]')) { openSettings(() => updLinks()); return; }
            if (e.target.closest('[data-so4-import-from-search]')) { dlg.close(); if (group === 'fr_lieux' && place) openPopulation({placeId: place.id}); else openImport({personId: pid, kind: KIND_OF_GROUP[group]}); return; }
            if (e.target.closest('[data-so4-paste-in]')) { dlg.close(); openPasteLink({personId: pid, kind: KIND_OF_GROUP[group]}); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        (pid ? context(pid) : Promise.resolve(null)).then(c => { ctx = c; draw(); }).catch(err => { body.innerHTML = UI().notice('error', err.message); });
        return dlg;
    }

    /* ═════ ⚙️ Adresses des sites (K2), rangées par pays et par thème ═════ */
    function openSettings(onChange) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-settings so4-settings';
        const sample = {first: '{prénom}', last: '{nom}', place: '{lieu}'};
        const rows = () => { const cu = custom(); return S4().GROUPS.map(g => `<h4 class="so4-set-group">${esc(g.icon)} ${esc(g.label)}</h4>${S4().SITES.filter(s => s.group === g.key).map(s => `<div class="so-set-row"><label><span><b>${esc(s.icon)} ${esc(s.label)}</b>${s.verified ? '' : ' <span class="so4-unverif">adresse à vérifier</span>'}</span>
            <input name="${esc(s.key)}" value="${esc(cu[s.key] || '')}" placeholder="${esc(decodeURIComponent(S4().url(s.key, sample)).slice(0, 300))}" autocomplete="off" spellcheck="false"></label></div>`).join('')}`).join(''); };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · RÉGLAGES</span><h2>⚙️ Adresses des sites</h2></div><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Si un site change son adresse de recherche, écris la nouvelle ici. Case vide = l’adresse de l’app (en gris). Mots remplacés : {nom}, {prénom}, {nom_complet}, {lieu}, {département}, {insee}, {pays}, {de}, {à}, {naissance}, {décès}. Seules les adresses en http(s) sont gardées.</p>
            <div class="so-set" data-so4-set>${rows()}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-ui-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        UI().autoSaveDialog(dlg, {keys: [KEY], label: 'Adresse d’un site',
            save: () => { const o = {}; dlg.querySelectorAll('[data-so4-set] input').forEach(i => { const v = i.value.trim(); if (v && S4().cleanUrl(v.replace(/[{}]/g, ''))) o[i.name] = v.slice(0, 600); }); if (Object.keys(o).length) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); },
            reload: () => { dlg.querySelector('[data-so4-set]').innerHTML = rows(); },
            reset: () => { try { localStorage.removeItem(KEY); } catch (_) {} },
            onChange: () => onChange?.()});
        dlg.addEventListener('click', e => { if (e.target.closest('[data-ui-x]')) dlg.close(); });
        dlg.addEventListener('close', () => { onChange?.(); dlg.remove(); });
        dlg.showModal();
        return dlg;
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé (K13) ═════ */
    const KIND_LABEL = {memorial: '🎖 Monument aux morts', sepulture: '🪦 Tombe', acte: '📜 Acte, registre', presse: '🌍 Journal étranger'};
    const PTYPES = [['article', 'Article'], ['faits_divers', 'Faits divers'], ['necrologie', 'Nécrologie'], ['naissance', 'Avis de naissance'], ['mariage', 'Avis de mariage'], ['deces', 'Avis de décès'], ['annonce', 'Petite annonce'], ['portrait', 'Portrait'], ['autre', 'Autre']];
    const ACT_TAGS = ['CHR', 'BIRT', 'DEAT', 'BURI', 'CENS', 'RESI', 'EMIG', 'IMMI', 'OCCU', 'EVEN'];
    const fld = (name, label, value = '', a = '') => `<label>${esc(label)}<input name="${esc(name)}" value="${esc(value ?? '')}" autocomplete="off" ${a}></label>`;
    const area = (name, label, value = '', rows = 3, a = '') => `<label class="so-span-2">${esc(label)}<textarea name="${esc(name)}" rows="${rows}" ${a}>${esc(value ?? '')}</textarea></label>`;
    const siteSelect = (kind, v) => { const list = S4().SITES.filter(s => s.kind === kind || (kind === 'acte' && s.kind === 'acte')); return `<label>Site<select name="site">${list.map(s => `<option value="${esc(s.key)}" ${v.site === s.key ? 'selected' : ''}>${esc(s.icon)} ${esc(s.label)}</option>`).join('')}</select></label>`; };
    const hasTag = (ctx, tags) => (ctx?.events || []).find(e => tags.includes(e.tag));
    function fieldsHtml(kind, v, ctx) {
        const p = ctx?.person || {};
        if (kind === 'memorial') {
            return `${siteSelect('memorial', v)}
                <label>Guerre<select name="conflict">${['1914-1918', '1870-1871', '1939-1945', 'Autre'].map(c => `<option ${v.conflict === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
                ${fld('last', 'Nom', v.last ?? p.last)}${fld('first', 'Prénoms', v.first ?? p.first)}
                ${fld('birth_date', 'Date de naissance', v.birth_date, 'data-ui-date placeholder="12 mars 1890"')}${fld('birth_place', 'Lieu de naissance', v.birth_place)}
                ${fld('rank', 'Grade', v.rank, 'placeholder="soldat de 2e classe"')}${fld('unit', 'Unité', v.unit, 'placeholder="152e régiment d’infanterie"')}
                ${fld('death_date', 'Date du décès', v.death_date, 'data-ui-date placeholder="20 août 1914"')}
                <div class="so-pk"><span class="pk-lab">Lieu du décès</span>${pickerField({name: 'place_id', kind: 'place', value: null})}${v.death_place ? `<small class="ui-hint">Lu : « ${esc(v.death_place)} » — choisis le lieu (ou crée-le).</small>` : ''}</div>
                ${fld('cause', 'Genre de mort', v.cause, 'placeholder="tué à l’ennemi, bombardement…"')}${fld('monument', 'Monument de (commune)', v.monument, 'placeholder="Tulle"')}
                ${area('bio', 'Biographie (gardée dans la source)', v.bio, 3)}`;
        }
        if (kind === 'sepulture') {
            return `${siteSelect('sepulture', v)}${fld('last', 'Nom', v.last ?? p.last)}${fld('first', 'Prénoms', v.first ?? p.first)}
                ${fld('cemetery', 'Cimetière', v.cemetery ?? ctx?.grave?.cemetery_name, 'placeholder="cimetière du Puy-Saint-Clair"')}${fld('city', 'Commune', v.city ?? ctx?.grave?.city)}${fld('country', 'Pays', v.country ?? (ctx?.grave?.country || 'France'))}
                ${fld('plot', 'Emplacement (carré, allée…)', v.plot)}${fld('gps_lat', 'Latitude', v.gps_lat, 'inputmode="decimal" placeholder="45.2671"')}${fld('gps_lon', 'Longitude', v.gps_lon, 'inputmode="decimal" placeholder="1.7702"')}
                ${fld('death_date', 'Date de décès (sur la tombe)', v.death_date, 'data-ui-date')}${area('inscription', 'Inscription de la tombe', v.inscription, 2)}`;
        }
        if (kind === 'acte') {
            const tag = v.tag || 'CHR';
            return `${siteSelect('acte', v)}<label>Sorte d’acte<select name="tag">${ACT_TAGS.map(t => `<option value="${t}" ${t === tag ? 'selected' : ''}>${esc(S4().EVENT_LABELS[t] || t)}</option>`).join('')}</select></label>
                ${fld('last', 'Nom', v.last ?? p.last)}${fld('first', 'Prénoms', v.first ?? p.first)}
                ${fld('date', 'Date', v.date, 'data-ui-date placeholder="12 mars 1850"')}
                <div class="so-pk"><span class="pk-lab">Lieu (paroisse, commune)</span>${pickerField({name: 'place_id', kind: 'place', value: null})}${v.place ? `<small class="ui-hint">Lu : « ${esc(v.place)} » — choisis le lieu (ou crée-le).</small>` : ''}</div>
                ${fld('father', 'Père', v.father)}${fld('mother', 'Mère', v.mother)}${fld('occupation', 'Profession, rôle', v.occupation, 'placeholder="matelot, mousse…"')}${fld('ship', 'Navire (rôle d’équipage)', v.ship)}
                ${fld('register', 'Registre', v.register, 'placeholder="Taufbuch 1845-1860"')}${fld('cote', 'Cote', v.cote)}${fld('page', 'Page, image', v.page)}`;
        }
        return `<label>Site<select name="site">${S4().SITES.filter(s => s.kind === 'presse').map(s => `<option value="${esc(s.key)}" ${v.site === s.key ? 'selected' : ''}>${esc(s.icon)} ${esc(s.label)}</option>`).join('')}</select></label>
            ${fld('journal', 'Journal', v.journal, 'placeholder="The Evening Star"')}${fld('date', 'Date', v.date, 'data-ui-date placeholder="2 mars 1905"')}${fld('page', 'Page', v.page, 'placeholder="3"')}
            ${fld('title', 'Titre de l’article', v.title)}<label>Sorte<select name="ptype">${PTYPES.map(([k, l]) => `<option value="${k}" ${v.ptype === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    }
    function proposalsHtml(kind, ctx, v) {
        if (kind === 'presse') return '';
        const p = ctx?.person || {};
        const line = (name, on, text, disabled = false) => `<label class="checkbox-line"><input type="checkbox" name="${name}" ${disabled ? 'disabled' : on ? 'checked' : ''}><span>${esc(text)}</span></label>`;
        if (kind === 'memorial') {
            const d = hasTag(ctx, ['DEAT']); const mpfLocked = p.mpf === 'yes' || p.mpf === 'no';
            return `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>
                ${line('add_event', true, d ? `Ajouter le décès — la fiche a déjà un décès (${d.date || d.year || ''}) : il est gardé` : 'Ajouter le décès', !!d)}
                ${line('set_mpf', v.mpf === 'yes', p.mpf === 'yes' ? 'Cocher « Mort pour la France » — déjà coché' : p.mpf === 'no' ? 'Cocher « Mort pour la France » — la fiche dit « non » : change-la toi-même' : 'Cocher « Mort pour la France » sur la fiche (si le monument le dit)', mpfLocked)}
                ${line('add_unit', true, 'Ajouter son unité au bloc « Poilu 14-18 » (guerre de 1914-1918, si elle n’y est pas)')}</fieldset>`;
        }
        if (kind === 'sepulture') {
            const b = hasTag(ctx, ['BURI']);
            return `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>
                ${ctx?.grave ? `<p class="ui-hint">La fiche a déjà une sépulture (${esc(ctx.grave.cemetery_name || 'cimetière')}${ctx.grave.city ? ', ' + esc(ctx.grave.city) : ''}) : la photo s’ajoute à ses « Photos datées », ses cases ne changent pas.</p>` : line('add_grave', true, 'Créer la sépulture (bloc Cimetière) avec le cimetière, la commune, l’emplacement et la position')}
                ${line('add_event', !b, b ? `Ajouter l’inhumation — la fiche en a déjà une (${b.date || b.year || ''}) : elle est gardée` : 'Ajouter l’inhumation dans cette commune', !!b)}</fieldset>`;
        }
        const tag = v.tag || 'CHR'; const uniq = S4().UNIQUE_EVENTS.includes(tag); const had = uniq && hasTag(ctx, tag === 'CHR' ? ['CHR', 'BAPM'] : [tag]);
        return `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>
            ${line('add_event', !had, had ? `Ajouter l’événement « ${S4().EVENT_LABELS[tag]} » — la fiche en a déjà un (${had.date || had.year || ''}) : il est gardé` : `Ajouter l’événement « ${S4().EVENT_LABELS[tag] || tag} » (avec la date et le lieu)`, !!had)}</fieldset>`;
    }
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    const savedPage = html => window.LCNDA_SOURCES_OUVERTES?.parseSavedPage ? window.LCNDA_SOURCES_OUVERTES.parseSavedPage(html) : {title: '', url: '', text: String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20000)};
    const kindOfSite = key => { const s = S4().site(key); return s && ['memorial', 'sepulture', 'acte', 'presse'].includes(s.kind) ? s.kind : ''; };
    function openImport(o = {}) {
        let st = {kind: Object.keys(KIND_LABEL).includes(o.kind) ? o.kind : 'memorial', pid: Number(o.personId) || 0, ctx: null, file: null, link: o.link || '', text: o.text || '', v: {}, objUrl: ''};
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.linkOnly) { /* lien collé : rien à ranger dans les médias */ }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (ext === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (ext === 'html' || ext === 'htm') { const pg = savedPage(await readText(f)); st.text = pg.text; st.link = st.link || pg.url; st.v.title = st.v.title || pg.title; st.preview = `<div class="so-pdf">🌐 <b>${esc(pg.title || f.name)}</b><br><small>Page enregistrée : seul son texte est gardé (dans la source), pas la page elle-même.</small></div>`; }
            else if (ext === 'txt') { st.file = o.linkOnly ? null : f; st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image (JPG, PNG, WebP, GIF), un PDF, une page enregistrée (.html) ou un texte (.txt)');
            const lk = S4().parseLink(st.link);
            if (lk.site) { const k = kindOfSite(lk.site); if (k && !o.kind) st.kind = k; st.v.site = lk.site; }
            Object.assign(st.v, Object.fromEntries(Object.entries({journal: lk.journal, date: lk.date, page: lk.page, register: lk.register, cote: lk.notice && st.kind === 'acte' ? lk.notice : ''}).filter(([, x]) => x)));
            if (lk.place && st.kind === 'acte' && !st.v.place) st.v.place = lk.place;
            if (st.text && st.kind !== 'presse') { const pf = S4().parseFields(st.text, st.kind); Object.assign(st.v, {...pf, ...st.v}); }
            if (st.pid) { forget(st.pid); st.ctx = await context(st.pid); }
            return {count: 1, noun: 'document', summaryHtml: `<b>un document</b> pour ${st.ctx ? `<b>${esc([st.ctx.person.first, String(st.ctx.person.last || '').toUpperCase()].join(' '))}</b>` : 'la fiche choisie ci-dessous'}`,
                notices: [{kind: 'warn', text: `${S4().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : un événement ou une sépulture déjà là est gardé, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: `<div class="so-imp" data-so4-imp></div>`, onShow: body => draw(body)};
        };
        const read = body => {
            const box = body.querySelector('[data-so4-imp]'); if (!box) return st.v;
            box.querySelectorAll('.so-fields input[name], .so-fields select[name], .so-fields textarea[name]').forEach(i => { if (i.type !== 'checkbox' && i.name !== 'place_id' && !i.name.startsWith('so4_')) st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so4_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so4_text]'); if (tx) st.text = tx.value;
            return st.v;
        };
        let ecT = 0;
        const ecarts = body => {
            clearTimeout(ecT);
            ecT = setTimeout(async () => {
                const ul = body.querySelector('[data-so4-ecarts]'); if (!ul) return;
                if (!st.pid) { ul.innerHTML = `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`; return; }
                try {
                    const v = read(body);
                    const r = st.kind === 'presse' ? await post('so_preview', {kind: 'presse', person_id: st.pid, url: S4().cleanUrl(st.link), site: v.site || '', fields: v})
                        : await post('so4_preview', {kind: st.kind, person_id: st.pid, url: S4().cleanUrl(st.link), site: v.site || '', tag: v.tag || '', fields: v});
                    ul.innerHTML = r.ecarts.length ? r.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
                } catch (e) { ul.innerHTML = `<li class="so-ecart is-orange">⛔ ${esc(e.message)}</li>`; }
            }, 350);
        };
        const draw = body => {
            const box = body.querySelector('[data-so4-imp]'); if (!box) return;
            box.innerHTML = `<div class="so-imp-who">${st.ctx && o.personId ? `<span class="pk-lab">Fiche</span> <b>${esc(st.ctx.person.first)} ${esc(String(st.ctx.person.last || '').toUpperCase())}</b>` : `<span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so4_pid', kind: 'person', value: st.pid || null})}`}</div>
                <div class="segmented so-kinds" role="tablist" aria-label="Sorte de document">${Object.entries(KIND_LABEL).map(([k, l]) => `<button type="button" class="${k === st.kind ? 'is-active' : ''}" aria-selected="${k === st.kind}" data-so4-kind="${k}">${esc(l)}</button>`).join('')}</div>
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${UI().badge('À vérifier', 'yellow', {title: S4().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid">${fieldsHtml(st.kind, st.v, st.ctx)}
                        <label class="so-span-2">Lien vers la fiche, la tombe ou l’article<input name="so4_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        ${area('so4_text', 'Texte copié (facultatif : gardé dans la source)', st.text, 3)}</div>
                    ${proposalsHtml(st.kind, st.ctx, st.v)}
                    <div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so4-ecarts></ul></div></div></div>`;
            ecarts(body);
        };
        const bind = body => {
            if (body._so4Bound) return; body._so4Bound = true;
            body.addEventListener('click', e => { const k = e.target.closest('[data-so4-kind]'); if (!k) return; read(body); st.kind = k.dataset.so4Kind; if (kindOfSite(st.v.site) !== st.kind) delete st.v.site; if (st.text && st.kind !== 'presse') st.v = {...S4().parseFields(st.text, st.kind), ...st.v}; draw(body); });
            body.addEventListener('input', e => { if (e.target.closest('.so-fields')) ecarts(body); });
            body.addEventListener('change', async e => {
                if (e.target.name === 'so4_pid') { st.pid = Number(e.target.value) || 0; read(body); st.ctx = null; if (st.pid) { try { forget(st.pid); st.ctx = await context(st.pid); } catch (err) { toast(err.message, 'error'); } } draw(body); }
                else if (e.target.name === 'tag') { read(body); draw(body); }
                else if (e.target.closest('.so-fields')) ecarts(body);
            });
        };
        const run = async (an, files, body) => {
            read(body);
            const box = body.querySelector('[data-so4-imp]');
            if (!st.pid) { const f = box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'); UI().fail?.(f, 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            const link = st.link.trim();
            if (link && !S4().cleanUrl(link)) { UI().fail?.(box.querySelector('[name=so4_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            if (!st.file && !link && !st.text.trim()) { UI().fail?.(box.querySelector('[name=so4_link]'), 'Il faut un fichier, un lien ou le texte du document.'); return {keepOpen: true}; }
            const ck = n => !!box.querySelector(`[name=${n}]:checked`);
            const placeId = box.querySelector('input[type=hidden][name=place_id]')?.value || '';
            const fields = {...st.v, text: st.text};
            let action = 'so4_import', undoAction = 'so4_undo', data;
            if (st.kind === 'presse') { // l'import « presse » commun : un passage dans « 📰 Dans les médias »
                action = 'so_import'; undoAction = 'so_undo';
                fields.journal = fields.journal || (S4().site(fields.site)?.label || '').replace(/\s*\(.*\)$/, '');
                fields.notes = S4().PRESS_AGENCY[fields.site] || '';
                data = {kind: 'presse', person_id: st.pid, url: link, site: fields.site || '', fields};
            } else {
                if (st.kind === 'memorial' && ck('set_mpf')) fields.mpf = 'yes';
                data = {kind: st.kind, person_id: st.pid, url: link, site: fields.site || '', tag: fields.tag || '', fields, add_event: ck('add_event'), set_mpf: ck('set_mpf'), add_unit: ck('add_unit'), add_grave: ck('add_grave'), place_id: placeId};
            }
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch(`api.php?action=${action}`, {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; forget(st.pid); if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post(undoAction, {batch: r.batch}); forget(st.pid); refresh(); }};
        };
        const kindWord = {memorial: 'la fiche d’un soldat ou la photo d’un monument', sepulture: 'la photo d’une tombe', acte: 'un acte ou une page de registre', presse: 'un article de journal'};
        return UI().openImportDialog({title: 'Importer depuis les archives en ligne', accept: 'image/*,.pdf,.html,.htm,.txt', what: 'image, PDF, page enregistrée ou texte',
            intro: `Ce que tu as téléchargé ou enregistré : ${kindWord[st.kind]} en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), ou un texte copié. Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 🔗 Coller un lien » dans la fenêtre de recherche.`,
            noun: 'document', analyze: async files => { const a = await analyze(files); const show = a.onShow; a.onShow = body => { body.closest('dialog')?.classList.add('modal-l', 'so-import'); bind(body); show(body); }; return a; }, run, files: o.files});
    }
    /** pas de fichier : un lien collé (et le texte de la fiche si on l'a) → la même fenêtre d'import */
    function openPasteLink(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-paste';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>🔗 Coller un lien</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><label>Lien de la fiche, de la tombe ou de l’article<input name="link" inputmode="url" placeholder="https://chroniclingamerica.loc.gov/lccn/…" autocomplete="off"></label>
            <p class="ui-hint">Copie l’adresse dans la barre de ton navigateur. MémorialGenWeb, BillionGraves, Matricula, Digitalarkivet, Riksarkivet, irishgenealogy.ie, Chronicling America, Trove, Papers Past et Delpher sont reconnus : la date, la page, le registre sont remplis quand l’adresse les dit.</p>
            <label>Texte de la fiche (facultatif)<textarea name="text" rows="6" placeholder="Nom : DUPONT&#10;Prénoms : Jean Marie&#10;Date de décès : 20/08/1914…"></textarea></label></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const link = dlg.querySelector('[name=link]').value.trim(), text = dlg.querySelector('[name=text]').value;
            if (!S4().cleanUrl(link)) return UI().fail?.(dlg.querySelector('[name=link]'), 'Colle une adresse qui commence par https://');
            dlg.close(); openImport({...o, link, text, linkOnly: true, files: [new File([text || link], 'lien-colle.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal(); setTimeout(() => dlg.querySelector('[name=link]')?.focus(), 30);
        return dlg;
    }

    /* ═════ 🏘 Population d'une commune et anciens noms (Cassini / EHESS), rapprochés de l'INSEE ═════ */
    const fmtN = n => Number(n).toLocaleString('fr-FR');
    function popChart(rows) {
        if (!rows.length) return '';
        const max = Math.max(...rows.map(r => Number(r.pop) || 0), 1);
        return `<div class="so4-pop-chart" role="img" aria-label="Population de ${esc(rows[0].year)} à ${esc(rows[rows.length - 1].year)}">${rows.map(r => `<span class="so4-pop-bar" style="--h:${Math.max(2, Math.round(100 * (Number(r.pop) || 0) / max))}%" title="${esc(r.year)} : ${esc(fmtN(r.pop))} habitants"><i></i><small>${esc(r.year)}</small></span>`).join('')}</div>`;
    }
    function namesHtml(d) {
        const list = S4().compareNames(d.names || [], (d.history || []).map(h => ({l: h.l || h.lav || h.name || '', nl: h.tl || h.nl || '', d: h.d || h.date || '', k: h.k || ''})), d.place?.name || '');
        if (!list.length) return emptyLine(d.front_installed ? 'Aucun ancien nom connu pour cette commune.' : 'Aucun ancien nom saisi. Les frontières anciennes de l’INSEE ne sont pas installées (Réglages → « 🏛 Frontières anciennes »).', '🏷');
        return `<ul class="so4-names">${list.map(n => `<li>${n.from === 'insee' ? UI().badge('INSEE', 'blue', {title: 'Code officiel géographique (frontières anciennes de l’app)'}) : UI().badge('Cassini', 'gray', {title: 'Lu sur le site de l’EHESS ou saisi'})} <b>${esc(n.name)}</b>${n.newName && n.newName !== n.name ? ` → ${esc(n.newName)}` : ''}${n.date ? ` <small class="muted">(${esc(n.date)})</small>` : n.year ? ` <small class="muted">(${esc(n.year)})</small>` : ''}${n.alsoCassini ? ' <small class="muted">· aussi chez Cassini</small>' : ''}</li>`).join('')}</ul>`;
    }
    async function openPopulation(o = {}) {
        const placeId = Number(o.placeId) || 0; if (!placeId) return toast('Choisis d’abord la commune.', 'error');
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so4-pop';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">COMMUNE · CASSINI (EHESS) ET INSEE</span><h2>🏘 Population et anciens noms</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body" data-so4-pop-body>${UI().spinner('Ce que la base sait de la commune…')}</div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-so4-pop-body]');
        let d = null;
        const load = async () => { d = await api('so4_place', {place_id: placeId}); draw(); };
        const draw = () => {
            const p = d.place; const rows = d.rows || [];
            const cas = S4().url('cassini', {place: p.name, deptCode: p.dept, insee: p.insee}, custom());
            body.innerHTML = `<p class="so-help"><b>${esc(p.name)}</b>${p.county ? ` · ${esc(p.county)}` : ''}${p.insee ? ` · code INSEE ${esc(p.insee)}` : ''}. Le site de l’EHESS « Des villages de Cassini aux communes d’aujourd’hui » donne la population de chaque commune depuis 1793 et ses changements de nom. L’app ne s’y connecte pas : ouvre la fiche de la commune, puis télécharge ou copie son tableau.</p>
                <p class="so-row"><a class="button small" href="${esc(cas)}" target="_blank" rel="noopener noreferrer" data-so4-go="cassini">↗ Ouvrir la commune sur le site de l’EHESS</a><button type="button" class="button small secondary" data-so4-pop-import>⤒ Importer le tableau…</button><button type="button" class="button small secondary" data-so4-pop-type>✎ Recopier à la main</button></p>
                <div data-so4-pop-type-box hidden class="so4-pop-type"><label>Une année par ligne : « 1793 : 512 », « 1806 1 203 » ; un ancien nom : « 1793 : Montagne-sur-Loire »<textarea rows="6" data-so4-pop-text placeholder="1793 : 512&#10;1800 : 498&#10;1806 : 1 203&#10;1793 : Montagne-sur-Loire"></textarea></label><p class="ui-hint" data-so4-pop-hint>Rien de compris pour l’instant.</p><p class="so-row"><button type="button" class="button small" data-so4-pop-save disabled>Ajouter à la commune</button></p></div>
                <h4 class="so4-h">👥 Population ${rows.length ? `<small class="muted">· ${esc(plural(rows.length, 'année'))}, de ${esc(rows[0].year)} à ${esc(rows[rows.length - 1].year)}</small>` : ''} ${rows.length ? UI().badge('À vérifier', 'yellow', {title: S4().MENTION}) : ''}</h4>
                ${rows.length ? `${popChart(rows)}<details class="so4-pop-table"><summary>Le tableau</summary><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Année</th><th>Habitants</th><th>D’où</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.year)}</td><td>${esc(fmtN(r.pop))}</td><td>${esc(r.origin === 'cassini' ? 'Cassini (EHESS)' : 'recopié')}</td></tr>`).join('')}</tbody></table></div></details>`
                    : emptyLine('Pas encore de population pour cette commune : importe le tableau de l’EHESS ou recopie-le.', '👥')}
                <h4 class="so4-h">🏷 Anciens noms <small class="muted">· rapprochés des changements de l’INSEE depuis 1943</small></h4>${namesHtml(d)}`;
        };
        const save = async (parsed, site, url = '') => {
            const r = await post('so4_place_import', {place_id: placeId, site, url, rows: parsed.rows, names: parsed.names});
            const kept = (r.kept || []).length ? ` ${plural(r.kept.length, 'année déjà là gardée', 'années déjà là gardées')}.` : '';
            if (!r.batch) { toast(r.summary + kept, 'info'); return; }
            await load(); window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed'));
            A().undoToast ? A().undoToast(`${r.summary}.${kept}`, {icon: '⤒', undo: async () => { await post('so4_undo', {batch: r.batch}); if (dlg.open) await load(); refresh(); }}) : toast(r.summary);
        };
        dlg.addEventListener('click', async e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            if (e.target.closest('[data-so4-pop-type]')) { const b = body.querySelector('[data-so4-pop-type-box]'); b.hidden = !b.hidden; if (!b.hidden) b.querySelector('textarea').focus(); return; }
            if (e.target.closest('[data-so4-pop-save]')) { const parsed = S4().parsePopulation(body.querySelector('[data-so4-pop-text]').value); try { await save(parsed, 'saisie'); } catch (err) { toast(err.message, 'error'); } return; }
            if (e.target.closest('[data-so4-pop-import]')) {
                let parsed = null, url = '';
                await UI().openImportDialog({title: 'Importer la population d’une commune', accept: '.csv,.tsv,.txt,.html,.htm,text/csv,text/plain', what: 'tableau CSV, page enregistrée ou texte',
                    intro: 'Le tableau de population de la commune, enregistré depuis le site de l’EHESS (page « Enregistrer sous… », tableau copié dans un fichier .txt, ou CSV). Rien n’est demandé au site : seul ton fichier est lu. Une année déjà là n’est pas remplacée.',
                    noun: 'année de population', many: 'années de population', feminine: true,
                    analyze: async files => {
                        const f = files[0]; if (!f) throw new Error('aucun fichier'); if (f.size > 8 * 1048576) throw new Error('fichier trop gros (8 Mo au plus)');
                        let txt = await readText(f);
                        if (/\.html?$/i.test(f.name)) { const pg = savedPage(txt); url = pg.url; txt = pg.text; }
                        parsed = S4().parsePopulation(txt);
                        if (!parsed.rows.length && !parsed.names.length) throw new Error('aucune année ni aucun chiffre de population reconnu');
                        return {count: parsed.rows.length, allowEmpty: true, summaryHtml: `<b>${esc(plural(parsed.rows.length, 'année de population', 'années de population'))}</b>${parsed.names.length ? ` et ${esc(plural(parsed.names.length, 'ancien nom', 'anciens noms'))}` : ''}`,
                            notices: [{kind: 'warn', text: S4().MENTION + '.'}, ...parsed.notices.map(t => ({kind: 'info', text: t}))], preview: popChart(parsed.rows)};
                    },
                    run: async () => { await save(parsed, 'cassini', url); return {message: ''}; }});
            }
        });
        dlg.addEventListener('input', e => {
            const ta = e.target.closest('[data-so4-pop-text]'); if (!ta) return;
            const parsed = S4().parsePopulation(ta.value); const hint = body.querySelector('[data-so4-pop-hint]');
            const n = parsed.rows.length, m = parsed.names.length;
            hint.textContent = n || m ? `✓ Compris : ${[n ? plural(n, 'année') + (n ? ` (de ${parsed.rows[0].year} à ${parsed.rows[n - 1].year})` : '') : '', m ? plural(m, 'ancien nom', 'anciens noms') : ''].filter(Boolean).join(', ')}` : 'Rien de compris pour l’instant.';
            hint.classList.toggle('is-ok', !!(n || m)); body.querySelector('[data-so4-pop-save]').disabled = !(n || m);
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        try { await load(); } catch (err) { body.innerHTML = UI().notice('error', err.message); }
        return dlg;
    }

    /* ═════ Les boutons posés dans l'app ═════ */
    const sBtn = (group, pid, label, title) => `<button type="button" class="button small secondary" data-so4-search="${esc(group)}" data-pid="${Number(pid) || 0}" title="${esc(title)}">${esc(label)}</button>`;
    const iBtn = (kind, pid, label = '⤒ Importer…') => `<button type="button" class="button small secondary" data-so4-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range la photo ou le document trouvé, crée la source et propose ce qu’il dit">${esc(label)}</button>`;
    /** dans « Chercher sur internet » (fiche) : une ligne, à côté des autres lots */
    const panelButton = ctx => ctx?.id ? `<div class="so-ws so4-ws"><button type="button" class="button small" data-so4-search="" data-pid="${Number(ctx.id)}">🗿 Monuments aux morts, cimetières, Europe (Matricula, Norvège, Suède…), presse étrangère…</button><button type="button" class="button small secondary" data-so4-paste data-pid="${Number(ctx.id)}">🔗 Coller un lien</button></div>` : '';
    /** les boutons d'un bloc de la fiche : poilu · cemetery · presse */
    function blockButtons(where, pid, editOnly = h => h) {
        if (!pid) return '';
        if (where === 'poilu') return sBtn('fr_guerres', pid, '🗿 Monument aux morts (MémorialGenWeb)', 'Ouvre MémorialGenWeb dans ton navigateur, avec son nom et son prénom') + editOnly(iBtn('memorial', pid, '⤒ Importer le relevé…'));
        if (where === 'cemetery') return sBtn('fr_cimetieres', pid, '🔍 Chercher la tombe', 'Cimetières de France, BillionGraves, relevés collaboratifs : nom et années déjà remplis') + editOnly(iBtn('sepulture', pid, '⤒ Importer une photo de tombe…'));
        if (where === 'presse') return sBtn('presse_etr', pid, '🌍 Presse étrangère', 'Chronicling America, Trove, Papers Past, Delpher : nom et années déjà remplis') + editOnly(iBtn('presse', pid, '⤒ Importer (étranger)…'));
        return '';
    }
    /** la monographie d'une commune : population, anciens noms, monument, cimetières, registres d'Europe */
    function placeHtml(place) {
        if (!place || !Number(place.id)) return '';
        const id = Number(place.id); const fr = !place.country || /^france$/i.test(String(place.country));
        const p = {place: place.name, deptCode: place.admin2_code || '', insee: place.admin4_code || ''};
        const link = (key, label) => `<a class="button small secondary" href="${esc(S4().url(key, p, custom()))}" target="_blank" rel="noopener noreferrer" data-so4-go="${esc(key)}">${esc(label)} ↗</a>`;
        return `<div class="so4-place" data-so4-place-host="${id}"><div class="so4-place-pop" data-so4-place-pop="${id}"></div>
            <p class="so-row"><button type="button" class="button small secondary" data-so4-pop="${id}">🏘 Population depuis 1793 et anciens noms</button>${fr ? link('memorialgenweb_commune', '🗿 Monument aux morts') + link('cimetieres_de_france', '🪦 Cimetières de France') : link('matricula', '⛪ Matricula') + link('portafontium', '🇨🇿 Porta fontium')}</p></div>`;
    }
    /** le petit graphique de population dans la monographie (rempli après l'affichage) */
    async function fillPlace(host) {
        if (!host || host.dataset.so4Filled) return; host.dataset.so4Filled = '1';
        try {
            const d = await api('so4_place', {place_id: Number(host.dataset.so4PlacePop)});
            const rows = d.rows || [];
            host.innerHTML = rows.length ? `<p class="so4-place-sum">👥 <b>${esc(fmtN(rows[rows.length - 1].pop))}</b> habitants en ${esc(rows[rows.length - 1].year)} · ${esc(fmtN(rows[0].pop))} en ${esc(rows[0].year)} ${UI().badge('À vérifier', 'yellow', {title: S4().MENTION})}</p>${popChart(rows)}` : '';
        } catch (_) { host.innerHTML = ''; }
    }
    /** un lien Géopatronyme pour un nom (carte des patronymes, fiche) */
    const geopatronymeUrl = last => S4().url('geopatronyme', {last}, custom());
    const observer = new MutationObserver(() => { document.querySelectorAll('[data-so4-place-pop]:not([data-so4-filled])').forEach(fillPlace); });
    const watch = () => { if (document.body) observer.observe(document.body, {childList: true, subtree: true}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so4-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, group: s.dataset.so4Search || undefined}); return; }
        const im = e.target.closest('[data-so4-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so4Import || undefined}); return; }
        const pl = e.target.closest('[data-so4-paste]'); if (pl) { e.preventDefault(); openPasteLink({personId: Number(pl.dataset.pid) || 0}); return; }
        const pop = e.target.closest('[data-so4-pop]'); if (pop) { e.preventDefault(); openPopulation({placeId: Number(pop.dataset.so4Pop) || 0}); }
    });

    ext.sourcesOuvertes4 = {openSearch, openImport, openPasteLink, openSettings, openPopulation, panelButton, blockButtons, placeHtml, geopatronymeUrl, context};
})();
