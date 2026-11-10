/* LCNDA — 🌍 Archives de France et d’ailleurs (3e lot des archives en ligne) : les écrans.
 * Même modèle que heritage-sources-ouvertes.js (Mémoire des hommes, Léonore…), validé par l’utilisateur :
 *  - « ↗ Ouvrir » ouvre le NAVIGATEUR sur la recherche du site, champs remplis ; quand le site garde sa recherche dans un
 *    formulaire, « 📋 Copier le nom et ouvrir » met « NOM Prénom » dans le presse-papiers et ouvre sa page de recherche.
 *    L’app n’interroge jamais ces sites. L’adresse ouverte est montrée ; « ⚙️ Adresses des sites » la change (K2).
 *  - « ⤒ Importer ce que tu as trouvé » (fenêtre K13) : image, PDF, page enregistrée, texte copié, fichier de données
 *    ouvertes (Open Archives : JSON ou CSV), page de résultats FreeBMD → média relié, source avec lien, événements et
 *    blocs proposés (cochés ou non), « c’est la même personne ? », rien d’écrasé, « ↶ Annuler » (H7), « À vérifier ».
 * Entrées : bloc « Chercher sur internet » de la fiche et Recherche → « Chercher sur internet », blocs Militaire / Poilu,
 * Départs / émigration, Sciences (inventeur), Diplômes (médecin, polytechnicien), profils (élu), fiche d’un village.
 * Calculs purs : app-sources-ouvertes-3-core.js (LCNDA_SOURCES_OUVERTES_3). Serveur : lib/sources_ouvertes_3.php.
 * Mode d’emploi : docs/UI.md (« 🌍 Archives de France et d’ailleurs »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S3 = () => window.LCNDA_SOURCES_OUVERTES_3;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-3-sites';
    const OPEN_KEY = 'genealogie-sources-ouvertes-3-open';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const custom = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const context = async pid => { const so = ext.sourcesOuvertes; if (so?.context) return so.context(pid); return api('so_context', {person_id: Number(pid) || 0}); };
    const badge = (t, k, o) => UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${esc(k)}">${esc(t)}</span>`;
    const VERIF = {oui: ['Adresse vérifiée', 'green', 'Forme de l’adresse vue sur une page publique du site'], partiel: ['Vérifiée en partie', 'yellow', 'La forme de l’adresse a été vue, mais pas tous ses paramètres'], non: ['Adresse non vérifiée', 'gray', 'Construite d’après la forme connue du site : si elle ne marche plus, change-la dans « ⚙️ Adresses des sites »']};
    const WHERE = {fiche: 'Toutes', militaire: '🎖 Militaire, prisonniers', emigration: '🧳 Émigration', inventeur: '💡 Inventeur', medecin: '⚕ Médecin, polytechnicien', elu: '🏛 Élu', artiste: '🖼 Artiste', lieu: '📍 Un lieu'};

    /** ce que la fiche apporte à la recherche (même calcul que la première vague) */
    function paramsFrom(ctx, o = {}) {
        const p = ctx?.person || {};
        return {first: String(p.first || '').split(/\s+/)[0] || '', last: p.last || '', place: o.place || (ctx?.birth?.place || ctx?.places?.[0] || '').split(',')[0],
            y1: p.birth_year || '', y2: p.death_year || (p.birth_year ? Math.min(Number(p.birth_year) + 90, new Date().getFullYear()) : '')};
    }
    function rowHtml(s, p, cu) {
        const u = S3().url(s.key, p, cu); const v = VERIF[s.verified] || VERIF.non; const copy = S3().copyText(s.key, p);
        const hasName = !!(p.last || p.first || (s.byPlace && p.place));
        const data = s.data ? S3().dataUrl(s.key, p) : '';
        const go = !hasName ? `<button type="button" class="button small" disabled title="Écris au moins un nom">↗ Ouvrir</button>`
            : s.copy ? `<button type="button" class="button small" data-so3-copy="${esc(s.key)}" data-text="${esc(copy)}" data-href="${esc(u)}" title="Met « ${esc(copy)} » dans le presse-papiers et ouvre la page de recherche : colle-le dans la case du site">📋 Copier le nom et ouvrir</button>`
                : `<a class="button small" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-so3-go="${esc(s.key)}">↗ Ouvrir</a>`;
        return `<li class="so-link so3-link" data-so3-site="${esc(s.key)}" data-so3-text="${esc(S3().fold([s.label, s.country, S3().groupOf(s.group)?.label, s.note].join(' ')))}">
            <span class="so-link-ico" aria-hidden="true">${esc(s.icon)}</span>
            <span class="so-link-main"><b>${esc(s.label)}</b> <span class="so3-badges">${badge(v[0], v[1], {title: v[2]})}${s.sensitive ? ` ${badge('Mémoire', 'black', {title: 'Archives des persécutions : jamais reprises dans les jeux'})}` : ''}${cu[s.key] ? ` ${badge('Adresse à toi', 'blue')}` : ''}</span>
                ${hasName ? `<code class="so-url">${esc(u)}</code>` : `<small class="ui-hint">Écris au moins un nom${s.byPlace ? ' ou un lieu' : ''}.</small>`}
                ${s.note ? `<small class="ui-hint">${esc(s.note)}</small>` : ''}
                ${data && hasName ? `<small class="ui-hint">Données ouvertes : <a href="${esc(data)}" target="_blank" rel="noopener noreferrer" data-so3-data>⤓ les résultats en JSON</a> — enregistre le fichier, puis « ⤒ Importer ce que tu as trouvé ».</small>` : ''}</span>
            ${go}</li>`;
    }

    /* ═════ 🔍 Chercher : la fenêtre (rubriques par pays / thème, recherche C1, filtres C5) ═════ */
    function openSearch(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l so-search so3-search';
        let ctx = null, pid = Number(o.personId) || 0, where = WHERE[o.where] ? o.where : 'fiche', group = '';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · FRANCE ET ÉTRANGER</span><h2>🌍 Archives de France et d’ailleurs</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body so-search-body" data-so3-body>${UI().spinner ? UI().spinner('Ce que la fiche sait…') : '…'}</div>
            <div class="modal-actions"><button type="button" class="button secondary" data-so3-settings>⚙️ Adresses des sites</button><span class="spacer"></span><button type="button" class="button secondary" data-so3-paste-in>📋 Coller un texte</button><button type="button" class="button secondary" data-so3-import-from-search>⤒ Importer ce que tu as trouvé…</button><button type="button" class="button" data-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const body = dlg.querySelector('[data-so3-body]');
        const val = () => { const v = {}; dlg.querySelectorAll('.so-grid [name]').forEach(i => { v[i.name] = i.value; }); return v; };
        const sites = () => S3().forPlace(where, {...val(), country: o.country || ''});
        const updLinks = () => {
            const box = body.querySelector('[data-so3-links]'); if (!box) return;
            const p = val(), cu = custom(), q = S3().fold(body.querySelector('[data-so3-q]')?.value || '');
            const list = sites().filter(s => !q || S3().fold([s.label, s.country, S3().groupOf(s.group)?.label, s.note].join(' ')).includes(q));
            const counts = {}; list.forEach(s => { counts[s.group] = (counts[s.group] || 0) + 1; });
            const pills = body.querySelector('[data-so3-pills]');
            if (pills) pills.innerHTML = [`<button type="button" class="${group ? '' : ' is-active'}" data-so3-group="">Tout (${list.length})</button>`, ...S3().GROUPS.filter(g => counts[g.id]).map(g => `<button type="button" class="${group === g.id ? ' is-active' : ''}" data-so3-group="${esc(g.id)}">${esc(g.icon)} ${esc(g.label.replace(/^France — /, ''))} (${counts[g.id]})</button>`)].join('');
            const shown = list.filter(s => !group || s.group === group);
            box.innerHTML = shown.length ? S3().GROUPS.map(g => { const l = shown.filter(s => s.group === g.id); return l.length ? `<section class="so3-group"><h4>${esc(g.icon)} ${esc(g.label)}</h4><ul class="so-links">${l.map(s => rowHtml(s, p, cu)).join('')}</ul></section>` : ''; }).join('')
                : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Aucun site pour « ${esc(body.querySelector('[data-so3-q]')?.value || '')} ».</span></p>`;
        };
        const draw = () => {
            const p = paramsFrom(ctx, o);
            const living = ctx?.person && window.LCNDA_SOURCES_OUVERTES?.livingRisk?.(ctx.person);
            body.innerHTML = `${o.personId ? '' : `<div class="so-who"><span class="pk-lab">À partir d’une fiche (facultatif)</span>${pickerField({name: 'so3_pid', kind: 'person', value: pid || null})}</div>`}
                ${living ? UI().notice('warn', 'Cette personne est peut-être vivante : ces recherches restent dans ton navigateur, rien n’est partagé. Pense à sa vie privée.') : ''}
                <div class="form-grid so-grid">
                    <label>Nom<input name="last" value="${esc(p.last)}" autocomplete="off"></label>
                    <label>Prénom<input name="first" value="${esc(p.first)}" autocomplete="off"></label>
                    <label>Lieu<input name="place" value="${esc(p.place)}" autocomplete="off" placeholder="Paris, Napoli, Leeds…"></label>
                    <label>De l’année<input name="y1" type="number" min="1500" max="2100" value="${esc(p.y1)}"></label>
                    <label>à l’année<input name="y2" type="number" min="1500" max="2100" value="${esc(p.y2)}"></label>
                    <label>Pour<select name="so3_where">${Object.entries(WHERE).map(([k, l]) => `<option value="${k}" ${k === where ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                </div>
                ${UI().notice('info', 'Chaque recherche s’ouvre dans ton navigateur. L’app n’envoie rien d’autre que ce que tu vois dans l’adresse, et ne se connecte jamais à ces sites.')}
                <div class="so3-q"><input type="search" data-so3-q placeholder="Chercher un site… (Antenati, brevets, Canada, Justes…)" autocomplete="off" aria-label="Chercher un site"></div>
                <div class="ui-filters so3-pills" data-so3-pills></div>
                <div data-so3-links></div>
                <p class="ui-hint">Ce qu’on lit sur ces sites est à vérifier : homonymes, fautes de lecture. Ensuite, enregistre la fiche (image, PDF, page, fichier de données) ou copie son texte, et fais « ⤒ Importer ce que tu as trouvé ».</p>`;
            updLinks();
        };
        dlg.addEventListener('input', e => { if (e.target.closest('.so-grid') || e.target.matches('[data-so3-q]')) updLinks(); });
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-so3-q]') && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; updLinks(); } });
        dlg.addEventListener('change', async e => {
            if (e.target.name === 'so3_where') { where = e.target.value; group = ''; updLinks(); return; }
            if (e.target.closest('.so-grid')) updLinks();
            if (e.target.name === 'so3_pid') { pid = Number(e.target.value) || 0; try { ctx = await context(pid); } catch (err) { toast(err.message, 'error'); } draw(); }
        });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const g = e.target.closest('[data-so3-group]'); if (g) { group = g.dataset.so3Group; updLinks(); return; }
            const c = e.target.closest('[data-so3-copy]'); if (c) { copyAndOpen(c.dataset.text, c.dataset.href); return; }
            if (e.target.closest('[data-so3-settings]')) { openSettings(() => updLinks()); return; }
            if (e.target.closest('[data-so3-import-from-search]')) { dlg.close(); openImport({personId: pid}); }
            if (e.target.closest('[data-so3-paste-in]')) { dlg.close(); openPasteText({personId: pid}); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        context(pid).then(c => { ctx = c; draw(); }).catch(() => { ctx = null; draw(); });
        return dlg;
    }
    /** un site sans recherche dans l'adresse : « NOM Prénom » dans le presse-papiers, puis la page de recherche */
    function copyAndOpen(text, href) {
        const u = S3().cleanUrl(href); if (!u) return;
        const done = ok => toast(ok ? `« ${text} » est copié : colle-le dans la case du site.` : `Écris « ${text} » dans la case du site.`);
        try { navigator.clipboard?.writeText(text).then(() => done(true), () => done(false)); if (!navigator.clipboard) done(false); } catch (_) { done(false); }
        window.open(u, '_blank', 'noopener');
    }

    /* ═════ ⚙️ Adresses des sites (K2) : rubriques repliables + recherche C1 ═════ */
    function openSettings(onChange) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-settings so3-settings';
        let open = []; try { open = JSON.parse(lsGet(OPEN_KEY, '[]')); } catch (_) {}
        const rows = () => { const cu = custom(); return S3().GROUPS.map(g => { const l = S3().SITES.filter(s => s.group === g.id); const n = l.filter(s => cu[s.key]).length;
            return `<details class="so3-rub" data-so3-rub="${esc(g.id)}" ${open.includes(g.id) ? 'open' : ''}><summary><b>${esc(g.icon)} ${esc(g.label)}</b> <small class="muted">${l.length} site${l.length > 1 ? 's' : ''}${n ? ` · ${n} adresse${n > 1 ? 's' : ''} à toi` : ''}</small></summary>
                ${l.map(s => `<div class="so-set-row" data-so3-text="${esc(S3().fold([s.label, s.country, g.label].join(' ')))}"><label><span><b>${esc(s.icon)} ${esc(s.label)}</b> ${badge((VERIF[s.verified] || VERIF.non)[0], (VERIF[s.verified] || VERIF.non)[1])}</span>
                <input name="${esc(s.key)}" value="${esc(cu[s.key] || '')}" placeholder="${esc(S3().url(s.key, {first: '{prénom}', last: '{nom}', place: '{lieu}'}).replace(/%7B/g, '{').replace(/%7D/g, '}').replace(/%C3%A9/g, 'é'))}" autocomplete="off" spellcheck="false"></label></div>`).join('')}</details>`; }).join(''); };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE · RÉGLAGES</span><h2>⚙️ Adresses des sites — France et étranger</h2></div><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ui-hint">Si un site change son adresse de recherche, écris la nouvelle ici. Case vide = l’adresse de l’app (en gris). Mots remplacés : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à}, {naissance}, {décès}. Seules les adresses en http(s) sont gardées.</p>
            <div class="so3-q"><input type="search" data-so3-sq placeholder="Chercher un site… (Italie, FreeBMD, brevets…)" autocomplete="off" aria-label="Chercher un site"></div>
            <p class="ui-hint" data-so3-scount></p>
            <div class="so-set" data-so-set>${rows()}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-ui-x>Fermer</button></div></form>`;
        document.body.appendChild(dlg);
        const filter = () => {
            const q = S3().fold(dlg.querySelector('[data-so3-sq]').value); let n = 0;
            dlg.querySelectorAll('.so3-rub').forEach(d => { let k = 0; d.querySelectorAll('.so-set-row').forEach(r => { const ok = !q || r.dataset.so3Text.includes(q); r.hidden = !ok; if (ok) k++; }); d.hidden = !k; if (q && k) d.open = true; n += k; });
            dlg.querySelector('[data-so3-scount]').textContent = q ? (n ? `${n} site${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}` : `Aucun site pour « ${dlg.querySelector('[data-so3-sq]').value} ».`) : '';
        };
        UI().autoSaveDialog(dlg, {keys: [KEY], label: 'Adresse d’un site',
            save: () => { const o = {}; dlg.querySelectorAll('[data-so-set] input').forEach(i => { const v = i.value.trim(); if (v && S3().cleanUrl(v.replace(/[{}]/g, ''))) o[i.name] = v.slice(0, 600); }); if (Object.keys(o).length) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); },
            reload: () => { dlg.querySelector('[data-so-set]').innerHTML = rows(); filter(); },
            reset: () => { try { localStorage.removeItem(KEY); } catch (_) {} },
            onChange: () => onChange?.()});
        dlg.addEventListener('input', e => { if (e.target.matches('[data-so3-sq]')) filter(); });
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-so3-sq]') && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; filter(); } });
        dlg.addEventListener('toggle', e => { const d = e.target.closest?.('.so3-rub'); if (!d || dlg.querySelector('[data-so3-sq]').value) return; open = [...dlg.querySelectorAll('.so3-rub[open]')].map(x => x.dataset.so3Rub); try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch (_) {} }, true);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-ui-x]')) dlg.close(); });
        dlg.addEventListener('close', () => { onChange?.(); dlg.remove(); });
        dlg.showModal();
        return dlg;
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé ou copié (K13) ═════ */
    const KINDS = ['cicr', 'elu', 'brevet', 'these', 'polytechnique', 'cths', 'joconde', 'findagrave', 'freecen', 'freebmd', 'openarchives', 'juste', 'arolsen', 'acte', 'electeur', 'livre'];
    const KIND_SITE = {cicr: 'cicr_pg', elu: 'sycomore', brevet: 'inpi_brevets19', these: 'biusante_theses', polytechnique: 'polytechnique', cths: 'cths', joconde: 'joconde', findagrave: 'findagrave', freecen: 'freecen', freebmd: 'freebmd', openarchives: 'openarchives', juste: 'yv_justes', arolsen: 'arolsen_fr', acte: 'antenati_nom', electeur: 'paris_electeurs', livre: 'archiveorg_local'};
    const SITE_KIND = {cicr_pg: 'cicr', sycomore: 'elu', senat_anciens: 'elu', inpi_brevets19: 'brevet', biusante_theses: 'these', biusante_bio: 'these', polytechnique: 'polytechnique', cths: 'cths', paris_ec: 'acte', paris_electeurs: 'electeur',
        joconde: 'joconde', archiveorg_local: 'livre', persee: 'livre', antenati_nom: 'acte', pares: 'acte', torre_tombo: 'acte', arolsen_fr: 'arolsen', openarchives: 'openarchives', geneteka: 'acte', freebmd: 'freebmd', freecen: 'freecen', banq: 'acte', bac_lac: 'acte', nara: 'acte', findagrave: 'findagrave', yv_justes: 'juste'};
    const FIELD_LABEL = {last: 'Nom', first: 'Prénoms', name: 'Nom', birth_date: 'Date de naissance', birth_place: 'Lieu de naissance', death_date: 'Date du décès', death_place: 'Lieu du décès', unit: 'Unité (régiment…)', rank: 'Grade',
        matricule: 'Matricule', camp: 'Camp', capture_date: 'Fait prisonnier le', capture_place: 'Fait prisonnier à', nationality: 'Armée', cote: 'Cote', mandates: 'Mandats', dept: 'Département, circonscription', group: 'Groupe', job: 'Profession',
        institution: 'Assemblée', number: 'N° du brevet', title: 'Titre', date: 'Date', inventor: 'Inventeur (déposant)', address: 'Adresse', duration: 'Durée', kind: 'Sorte', author: 'Auteur', year: 'Année', faculty: 'Faculté', note: 'Note',
        promotion: 'Promotion', entry: 'Entrée', exit: 'Sortie, corps', father: 'Père', societies: 'Sociétés savantes', museum: 'Musée', inventory: 'N° d’inventaire', technique: 'Matériaux, techniques', dims: 'Mesures', domain: 'Domaine',
        birth: 'Naissance', death: 'Décès', burial: 'Inhumation', cemetery: 'Cimetière', plot: 'Emplacement', memorial: 'N° Find a Grave', relation: 'Lien avec le chef', condition: 'État civil', age: 'Âge', birth_county: 'Comté de naissance', piece: 'Pièce',
        place: 'Lieu', country: 'Pays', file: 'N° de dossier', rescued: 'Personnes sauvées', document: 'Document', ref: 'Référence', type: 'Type d’acte', mother: 'Mère', spouse: 'Conjoint', archive: 'Archives', publisher: 'Éditeur', pages: 'Pages'};
    const FIELDS = {cicr: ['last', 'first', 'birth_date', 'birth_place', 'unit', 'rank', 'matricule', 'capture_date', 'capture_place', 'camp', 'nationality', 'cote'],
        elu: ['last', 'first', 'birth_date', 'birth_place', 'death_date', 'death_place', 'institution', 'mandates', 'dept', 'group', 'job'],
        brevet: ['number', 'title', 'date', 'inventor', 'job', 'address', 'duration'], these: ['author', 'title', 'year', 'faculty', 'cote'],
        polytechnique: ['last', 'first', 'promotion', 'matricule', 'birth_date', 'birth_place', 'entry', 'exit', 'father'], cths: ['last', 'first', 'birth_date', 'death_date', 'job', 'societies'],
        joconde: ['title', 'author', 'date', 'museum', 'inventory', 'technique', 'dims'], findagrave: ['name', 'birth', 'death', 'cemetery', 'plot', 'memorial'],
        freecen: ['last', 'first', 'year', 'place', 'relation', 'condition', 'age', 'job', 'birth_place', 'birth_county', 'piece'], juste: ['name', 'country', 'date', 'file', 'place', 'rescued'],
        arolsen: ['last', 'first', 'birth_date', 'birth_place', 'document', 'camp', 'number', 'ref'], acte: ['type', 'date', 'place', 'last', 'first', 'father', 'mother', 'spouse', 'cote', 'archive'],
        electeur: ['last', 'first', 'year', 'birth_date', 'birth_place', 'job', 'address'], livre: ['title', 'author', 'year', 'publisher', 'pages'], freebmd: [], openarchives: []};
    const DATEISH = /date|birth$|death$|^year$/;
    const BLOCK_OF = {cicr: ['military', '🎖 Ajouter son unité au bloc « Poilu 14-18 » (si elle n’y est pas)'], elu: ['politic', '🏛 Ajouter un mandat (profil « Homme / femme politique »)'], brevet: ['sciences', '💡 Ajouter l’invention et son brevet (profil « Inventeur »)'],
        these: ['education', '🎓 Ajouter le diplôme (Diplômes et formation)'], polytechnique: ['education', '🎓 Ajouter l’École polytechnique (Diplômes et formation)'], juste: ['awards', '🏆 Ajouter « Juste parmi les nations » (Concours et récompenses)']};
    const TAGNAME = {BIRT: 'Naissance', CHR: 'Baptême', BAPM: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation', RESI: 'Résidence', OCCU: 'Profession', CENS: 'Recensement', EVEN: 'Autre événement', MARR: 'Mariage', MARB: 'Bans', POW: 'Prisonnier de guerre'};
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));
    /** les lignes proposées par un document à une seule personne (événements de proposals + cases) */
    function propsOf(kind, v) {
        const pr = S3().proposals(kind, v);
        return pr.events.map(e => ({...e, tag: kind === 'cicr' && e.label === 'Fait prisonnier' ? 'POW' : e.tag}));
    }
    function openImport(o = {}) {
        let st = {kind: KINDS.includes(o.kind) ? o.kind : (SITE_KIND[o.site] || ''), site: o.site || '', pid: Number(o.personId) || 0, ctx: null, file: null, link: o.link || '', text: o.text || '', v: {}, rows: [], picked: new Set(), evs: [], evOn: new Set(), blockOn: true, objUrl: '', preview: ''};
        const setKind = k => { st.kind = k; st.site = KIND_SITE[k] || st.site; if (st.text && FIELDS[k]?.length) st.v = {...S3().parseFields(st.text, k), ...st.v}; if (k === 'openarchives' || k === 'freebmd') loadRows(); else { st.evs = propsOf(k, st.v); st.evOn = new Set(st.evs.map((e, i) => i).filter(i => !['EVEN', 'MARR', 'MARB'].includes(st.evs[i].tag) || st.evs[i].tag === 'EVEN' && k !== 'arolsen')); } };
        const loadRows = () => {
            const r = st.kind === 'openarchives' ? S3().parseOpenArchives(st.text) : S3().parseFreeBMD(st.text);
            st.rows = r.rows || []; st.rowsError = r.ok ? '' : r.error || '';
            const last = S3().fold(st.ctx?.person?.last || ''), first = S3().fold(String(st.ctx?.person?.first || '').split(' ')[0]);
            st.picked = new Set(st.rows.map((x, i) => i).filter(i => { const x = st.rows[i]; return last && S3().fold(x.last) === last && (!first || S3().fold(x.first).split(' ')[0] === first) && !['MARR', 'MARB'].includes(x.tag) && (!x.role || /principale|enfant|baptis|defunt|défunt/i.test(x.role)); }));
        };
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const extn = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.textOnly) { st.text = st.text || await readText(f); }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extn)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (extn === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (extn === 'html' || extn === 'htm') { const pg = window.LCNDA_SOURCES_OUVERTES?.parseSavedPage ? window.LCNDA_SOURCES_OUVERTES.parseSavedPage(await readText(f)) : {text: '', url: '', title: ''}; st.text = pg.text; st.link = st.link || pg.url; st.v.media_title = pg.title; st.preview = `<div class="so-pdf">🌐 <b>${esc(pg.title || f.name)}</b><br><small>Page enregistrée : seul son texte est gardé (dans la source), pas la page elle-même.</small></div>`; }
            else if (extn === 'json' || extn === 'csv') { st.text = await readText(f); if (!st.kind || !['openarchives'].includes(st.kind)) st.kind = 'openarchives'; st.preview = `<div class="so-pdf">🗂 <b>${esc(f.name)}</b><br><small>Fichier de données : les lignes cochées deviennent des événements ; le fichier lui-même n’est pas gardé.</small></div>`; }
            else if (extn === 'txt') { st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image, un PDF, une page enregistrée (.html), un texte (.txt) ou un fichier de données (.json, .csv)');
            if (!st.kind || (st.text && !o.kind && !o.site)) st.kind = S3().detectKind(st.text) || st.kind || 'acte';
            if (st.pid) st.ctx = await context(st.pid).catch(() => null);
            setKind(st.kind);
            return {count: 1, noun: 'document', summaryHtml: `<b>${esc(S3().KIND_LABEL[st.kind] || 'un document')}</b> pour ${st.ctx?.person ? `<b>${esc([st.ctx.person.first, String(st.ctx.person.last || '').toUpperCase()].join(' '))}</b>` : 'la fiche choisie ci-dessous'}`,
                notices: [{kind: 'warn', text: `${S3().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : une naissance, un baptême, un décès ou une inhumation déjà sur la fiche est gardé tel quel, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: `<div class="so-imp so3-imp" data-so3-imp></div>`, onShow: body => { bind(body); draw(body); }};
        };
        const read = body => {
            const box = body.querySelector('[data-so3-imp]'); if (!box) return;
            box.querySelectorAll('.so3-fields [name]').forEach(i => { st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so3_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so3_text]'); if (tx) st.text = tx.value;
            const bl = box.querySelector('[name=so3_block]'); if (bl) st.blockOn = bl.checked;
            st.evOn = new Set([...box.querySelectorAll('[data-so3-ev]:checked')].map(i => Number(i.dataset.so3Ev)));
            if (box.querySelector('[data-so3-row]')) st.picked = new Set([...box.querySelectorAll('[data-so3-row]:checked')].map(i => Number(i.dataset.so3Row)));
        };
        let ecT = 0;
        const ecarts = body => {
            clearTimeout(ecT);
            ecT = setTimeout(async () => {
                const ul = body.querySelector('[data-so-ecarts]'); if (!ul) return;
                if (!st.pid) { ul.innerHTML = `<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>`; return; }
                try {
                    const r = await post('so3_preview', payload());
                    ul.innerHTML = r.ecarts.length ? r.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : `<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>`;
                } catch (e) { ul.innerHTML = `<li class="so-ecart is-orange">⛔ ${esc(e.message)}</li>`; }
            }, 350);
        };
        const events = () => (st.kind === 'openarchives' || st.kind === 'freebmd')
            ? [...st.picked].map(i => st.rows[i]).filter(Boolean).map(x => ({tag: x.tag, label: x.type || TAGNAME[x.tag] || '', date: x.date, place: x.place || x.district || '', note: x.note || [x.role && `Rôle : ${x.role}`, x.archive && `Archives : ${x.archive}`, x.url].filter(Boolean).join(' · ')}))
            : st.evs.filter((e, i) => st.evOn.has(i));
        const payload = () => {
            const ev = events(); const bl = BLOCK_OF[st.kind] && st.blockOn ? [BLOCK_OF[st.kind][0]] : [];
            const firstRow = (st.kind === 'openarchives' || st.kind === 'freebmd') ? st.rows[[...st.picked][0]] : null;
            const fields = {...st.v}; if (firstRow) { fields.last = firstRow.last; fields.first = firstRow.first; }
            if (st.kind === 'findagrave' && fields.name && !fields.last) { const n = S3().splitName(fields.name); fields.first = n.first; fields.last = n.last; }
            const extra = firstRow ? [...st.picked].map(i => st.rows[i]).map(x => [x.first, x.last, x.type || x.kind, x.date || x.quarterText, x.place || x.district, x.role].filter(Boolean).join(' · ')).join('\n') : '';
            return {kind: st.kind, site: st.site, person_id: st.pid, url: S3().cleanUrl(st.link) || S3().cleanUrl(firstRow?.url || ''), fields, events: ev, blocks: bl,
                source_title: S3().sourceTitle(st.kind, fields, st.site), text: [st.kind === 'openarchives' ? '' : st.text, extra].filter(Boolean).join('\n\n').slice(0, 20000)};
        };
        const fieldsHtml = () => (FIELDS[st.kind] || []).map(k => `<label>${esc(FIELD_LABEL[k] || k)}<input name="${esc(k)}" value="${esc(st.v[k] ?? '')}" autocomplete="off" ${DATEISH.test(k) ? 'data-ui-date' : ''}></label>`).join('');
        const rowsHtml = () => {
            if (st.rowsError) return `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">⚠️</span><span class="empty-line-text">${esc(st.rowsError)}</span></p>`;
            if (!st.rows.length) return `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucune ligne lue.</span></p>`;
            return `<p class="ui-hint">${esc(A().plural ? A().plural(st.rows.length, 'ligne lue') : `${st.rows.length} lignes`)} · coche celles qui parlent de cette personne (le même nom est coché d’office).</p>
                <div class="data-table-wrap so3-rows"><table class="data-table"><thead><tr><th></th><th>Nom</th><th>Événement</th><th>Date</th><th>Lieu</th><th>${st.kind === 'freebmd' ? 'Réf.' : 'Rôle'}</th></tr></thead><tbody>
                ${st.rows.slice(0, 300).map((x, i) => `<tr><td><label class="checkbox-line"><input type="checkbox" data-so3-row="${i}" ${st.picked.has(i) ? 'checked' : ''} aria-label="Ajouter cette ligne"></label></td><td>${esc(x.first)} <b>${esc(String(x.last).toUpperCase())}</b></td><td>${esc(x.type || TAGNAME[x.tag] || x.tag)}${['MARR', 'MARB'].includes(x.tag) ? ' <small class="muted">(dans la famille)</small>' : ''}</td><td>${esc(x.quarterText || x.date)}</td><td>${esc(x.place || x.district || '')}</td><td>${esc(st.kind === 'freebmd' ? `vol. ${x.vol} p. ${x.page}` : x.role)}</td></tr>`).join('')}</tbody></table></div>`;
        };
        const evHtml = () => st.evs.length ? `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>${st.evs.map((e, i) => `<label class="checkbox-line"><input type="checkbox" data-so3-ev="${i}" ${st.evOn.has(i) ? 'checked' : ''}><span>${esc(TAGNAME[e.tag] || e.label)}${e.tag === 'EVEN' || e.tag === 'POW' ? ` « ${esc(e.label)} »` : ''} : ${esc([e.date, e.place && `à ${e.place}`, e.note].filter(Boolean).join(' · ') || '—')}</span></label>`).join('')}
            ${BLOCK_OF[st.kind] ? `<label class="checkbox-line"><input type="checkbox" name="so3_block" ${st.blockOn ? 'checked' : ''}><span>${esc(BLOCK_OF[st.kind][1])}</span></label>` : ''}</fieldset>`
            : BLOCK_OF[st.kind] ? `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend><label class="checkbox-line"><input type="checkbox" name="so3_block" ${st.blockOn ? 'checked' : ''}><span>${esc(BLOCK_OF[st.kind][1])}</span></label></fieldset>` : '';
        const draw = body => {
            const box = body.querySelector('[data-so3-imp]'); if (!box) return;
            const multi = st.kind === 'openarchives' || st.kind === 'freebmd';
            const sensitive = st.kind === 'arolsen' || st.kind === 'juste';
            box.innerHTML = `<div class="so-imp-who">${st.ctx?.person && o.personId ? `<span class="pk-lab">Fiche</span> <b>${esc(st.ctx.person.first)} ${esc(String(st.ctx.person.last || '').toUpperCase())}</b>` : `<span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so3_pid', kind: 'person', value: st.pid || null})}`}</div>
                <label class="so3-kind">Sorte de document<select name="so3_kind">${KINDS.map(k => `<option value="${k}" ${k === st.kind ? 'selected' : ''}>${esc(S3().KIND_LABEL[k])}</option>`).join('')}</select></label>
                ${sensitive ? UI().notice('info', 'Archives des persécutions : elles restent sobres sur la fiche, et ne sont jamais reprises dans les jeux.') : ''}
                <div class="so-imp-grid${st.preview && !multi ? '' : ' is-noimg'}">${st.preview && !multi ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${badge('À vérifier', 'yellow', {title: S3().MENTION})} <small class="muted">${multi ? 'Les lignes lues dans le fichier ou la page copiée.' : 'Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.'}</small></p>
                    ${multi ? rowsHtml() : `<div class="form-grid so-grid so3-fields">${fieldsHtml()}</div>`}
                    <div class="form-grid so-grid"><label class="so-span-2">Lien vers la fiche ou la notice<input name="so3_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        ${multi ? '' : `<label class="so-span-2">Texte copié (facultatif : gardé dans la source)<textarea name="so3_text" rows="3">${esc(st.text)}</textarea></label>`}</div>
                    ${multi ? '' : evHtml()}
                    <div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so-ecarts></ul></div></div></div>`;
            ecarts(body);
        };
        const bind = body => {
            if (body._so3Bound) return; body._so3Bound = true;
            body.addEventListener('input', e => { if (e.target.closest('[data-so3-imp]')) { if (e.target.closest('.so3-fields')) { read(body); const on = st.evOn; st.evs = propsOf(st.kind, st.v); const box = body.querySelector('.so-props'); if (box) { st.evOn = new Set(st.evs.map((x, i) => i).filter(i => on.has(i) || i >= on.size)); box.outerHTML = evHtml(); } } ecarts(body); } });
            body.addEventListener('change', async e => {
                if (e.target.name === 'so3_kind') { read(body); setKind(e.target.value); draw(body); return; }
                if (e.target.name === 'so3_pid') { st.pid = Number(e.target.value) || 0; read(body); st.ctx = st.pid ? await context(st.pid).catch(() => null) : null; if (st.kind === 'openarchives' || st.kind === 'freebmd') loadRows(); draw(body); return; }
                if (e.target.closest('[data-so3-imp]')) { read(body); ecarts(body); }
            });
        };
        const run = async (an, files, body) => {
            read(body);
            const box = body.querySelector('[data-so3-imp]');
            if (!st.pid) { UI().fail?.(box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'), 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            if (st.link && !S3().cleanUrl(st.link)) { UI().fail?.(box.querySelector('[name=so3_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            const data = payload();
            if (!st.file && !data.url && !data.text.trim() && !data.events.length) { UI().fail?.(box.querySelector('[name=so3_link]'), 'Il faut un fichier, un lien, le texte du document ou une ligne cochée.'); return {keepOpen: true}; }
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch('api.php?action=so3_import', {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post('so3_undo', {batch: r.batch}); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer depuis les archives de France et d’ailleurs', accept: 'image/*,.pdf,.html,.htm,.txt,.json,.csv', what: 'image, PDF, page enregistrée, texte ou fichier de données',
            intro: 'Ce que tu as téléchargé ou enregistré : une fiche en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), un texte copié (fiche du CICR, de Sycomore, d’un brevet, d’une tombe, page de résultats FreeBMD…) ou le fichier de données ouvertes d’Open Archives (JSON ou CSV). Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 📋 Coller un texte ».',
            noun: 'document', analyze, run, files: o.files});
    }
    /** pas de fichier : le texte copié d'une fiche ou d'une page de résultats → la même fenêtre d'import */
    function openPasteText(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal so-paste';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">ARCHIVES EN LIGNE</span><h2>📋 Coller un texte</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><label>Lien de la fiche (facultatif)<input name="link" inputmode="url" placeholder="https://…" autocomplete="off"></label>
            <label>Texte de la fiche ou de la page de résultats<textarea name="text" rows="9" placeholder="Nom : DUPONT&#10;Prénom : Jean&#10;Date de naissance : 3 mai 1890…&#10;&#10;ou une page de résultats FreeBMD (« Births Mar 1872 » puis les lignes)"></textarea></label>
            <p class="ui-hint">Sélectionne la fiche sur le site, copie-la, colle-la ici : l’app reconnaît la sorte (CICR, Sycomore, brevet, thèse, Find a Grave, FreeBMD, FreeCEN…) et remplit les cases.</p></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Continuer</button></div></form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
            e.preventDefault(); const link = dlg.querySelector('[name=link]').value.trim(), text = dlg.querySelector('[name=text]').value;
            if (link && !S3().cleanUrl(link)) return UI().fail?.(dlg.querySelector('[name=link]'), 'Colle une adresse qui commence par https://');
            if (!text.trim() && !link) return UI().fail?.(dlg.querySelector('[name=text]'), 'Colle le texte de la fiche.');
            dlg.close(); openImport({...o, link, text, textOnly: true, files: [new File([text || link], 'texte-colle.txt', {type: 'text/plain'})]});
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal(); setTimeout(() => dlg.querySelector('[name=text]')?.focus(), 30);
        return dlg;
    }

    /* ═════ Les boutons : bloc « Chercher sur internet », blocs de la fiche, fiche d'un village ═════ */
    const BTN = {fiche: '🌍 Archives de France et d’ailleurs…', militaire: '🌍 Prisonniers 14-18, Arolsen…', emigration: '🌍 Archives du pays d’arrivée…', inventeur: '🌍 Brevets d’invention (INPI)…', medecin: '🌍 Thèses, Polytechnique…', elu: '🌍 Sycomore, Sénat…', artiste: '🌍 Musées (Joconde)…', lieu: '🌍 Livres et archives sur ce lieu…'};
    const btn = (where, pid, o = {}) => `<button type="button" class="button small secondary" data-so3-search="${esc(where)}" data-pid="${Number(pid) || 0}"${o.place ? ` data-place="${esc(o.place)}"` : ''}${o.country ? ` data-country="${esc(o.country)}"` : ''} title="Ouvre la recherche dans ton navigateur, nom et années déjà remplis">${esc(BTN[where] || BTN.fiche)}</button>`;
    const importBtn = (pid, kind = '') => `<button type="button" class="button small secondary" data-so3-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range le document trouvé, crée la source et propose ce qu’il dit">⤒ Importer…</button>`;
    const panelButton = ctx => ctx?.id ? `<div class="so-ws so3-ws">${btn('fiche', ctx.id)}<button type="button" class="button small secondary" data-so3-paste data-pid="${Number(ctx.id)}">📋 Coller un texte</button></div>` : '';
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so3-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, where: s.dataset.so3Search || 'fiche', place: s.dataset.place || '', country: s.dataset.country || ''}); return; }
        const im = e.target.closest('[data-so3-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so3Import || undefined}); return; }
        const pl = e.target.closest('[data-so3-paste]'); if (pl) { e.preventDefault(); openPasteText({personId: Number(pl.dataset.pid) || 0}); }
    });
    /** les blocs de la fiche (data-pblock) : une petite ligne de boutons, posée une fois après chaque affichage */
    const BLOCK_WHERE = {web_search: 'fiche', military: 'militaire', poilu: 'militaire', voyages: 'emigration', sciences: 'inventeur', education: 'medecin', profiles: 'elu', artist_page: 'artiste'};
    const BLOCK_KIND = {military: 'cicr', poilu: 'cicr', sciences: 'brevet', education: 'these', profiles: 'elu', artist_page: 'joconde', voyages: 'acte'};
    function decorate(root = document) {
        const ws = root.querySelector?.('#workspace') || root; if (!ws?.querySelectorAll) return;
        const cur = A()?.state?.currentPerson?.person; const pid = Number(cur?.id) || 0;
        const ro = document.body.classList.contains('is-kiosk') || Number(cur?.is_locked) === 1 || document.documentElement.classList.contains('ms-open');
        if (pid) ws.querySelectorAll('[data-pblock]').forEach(card => {
            const key = card.dataset.pblock, where = BLOCK_WHERE[key]; if (!where || card.querySelector(':scope .so3-row, :scope .so3-ws')) return;
            const bodyEl = card.querySelector('.card-body'); if (!bodyEl) return;
            if (key === 'web_search') { const panel = bodyEl.querySelector('.web-search-panel'); if (panel) panel.insertAdjacentHTML('afterbegin', panelButton({id: pid})); return; }
            if (!bodyEl.textContent.trim()) return;
            bodyEl.insertAdjacentHTML('beforeend', `<p class="so-row so3-row">${btn(where, pid)}${ro ? '' : importBtn(pid, BLOCK_KIND[key] || '')}</p>`);
        });
        const village = ws.querySelector('.h-village:not([data-so3])');
        if (village) {
            village.dataset.so3 = '1';
            const name = village.querySelector('.page-header h2, h2')?.textContent?.trim() || '';
            const sub = village.querySelector('.page-header p, header p')?.textContent || '';
            const country = /italie|italia/i.test(sub) ? 'Italie' : /espagne/i.test(sub) ? 'Espagne' : /portugal/i.test(sub) ? 'Portugal' : /pays-bas|belgique/i.test(sub) ? 'Pays-Bas' : /pologne/i.test(sub) ? 'Pologne' : /royaume|angleterre/i.test(sub) ? 'Royaume-Uni' : /canada|québec/i.test(sub) ? 'Canada' : /états-unis|usa/i.test(sub) ? 'États-Unis' : '';
            const stats = village.querySelector('[data-vsec="stats"]');
            if (name && stats) stats.insertAdjacentHTML('afterend', `<p class="so-row so3-row so3-village">${btn('lieu', 0, {place: name.replace(/^[^\p{L}]+/u, ''), country})}</p>`);
        }
    }
    let decoT = 0;
    const watch = () => { const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watch, 400); new MutationObserver(() => { clearTimeout(decoT); decoT = setTimeout(() => decorate(document), 60); }).observe(ws, {childList: true, subtree: true}); decorate(document); };

    /* ═════ « Chercher sur internet » : les sites rangés par pays / thème, et un réglage lisible ═════ */
    /** les sites ajoutés à la liste (bloc de la fiche, widget, Recherche) : [clé, nom, rubrique, adresse(p)] — cachés au départ */
    const wsGroupLabel = id => { const g = S3().groupOf(id); return g ? g.label : 'Autres'; };
    ext.webSearchExtra = () => S3().SITES.map(s => [`so3_${s.key}`, s.label, wsGroupLabel(s.group),
        p => S3().url(s.key, {first: p.first, last: p.last, place: p.place, y1: p.y1, y2: p.y2, birthYear: p.year}, custom())]);
    function addGroups() {
        const groups = A()?.webSearchGroups; if (!Array.isArray(groups)) return false;
        const at = Math.max(0, groups.indexOf('Autres'));
        S3().GROUPS.map(g => g.label).filter(l => !groups.includes(l)).reverse().forEach(l => groups.splice(at, 0, l));
        return true;
    }
    /** Réglages → Apparence → « Chercher sur internet » : case C1 et rubriques (pastilles C5) au-dessus de la liste à ranger */
    function enhanceEditors(root = document) {
        root.querySelectorAll?.('.web-search-editor:not([data-so3])').forEach(ed => {
            const list = ed.querySelector('.order-list'); if (!list) return; ed.dataset.so3 = '1';
            const rows = [...list.querySelectorAll('.order-row')];
            const groupOf = r => { const t = r.querySelector('b')?.textContent || ''; const i = t.lastIndexOf(' · '); return i > 0 ? t.slice(i + 3) : ''; };
            const groups = [...new Set(rows.map(groupOf).filter(Boolean))];
            const bar = document.createElement('div'); bar.className = 'so3-wsbar';
            bar.innerHTML = `<div class="so3-q"><input type="search" placeholder="Chercher un site… (Italie, presse, Justes…)" aria-label="Chercher un site" data-so3-wsq></div>
                <details class="so3-wsrub"><summary>Rubriques (${groups.length})</summary><div class="ui-filters">${[`<button type="button" class="is-active" data-so3-wsg="">Tout (${rows.length})</button>`, ...groups.map(g => `<button type="button" class="" data-so3-wsg="${esc(g)}">${esc(g)} (${rows.filter(r => groupOf(r) === g).length})</button>`)].join('')}</div></details>
                <small class="ui-hint" data-so3-wscount></small>`;
            list.before(bar);
            let g = '';
            const apply = () => { const q = S3().fold(bar.querySelector('[data-so3-wsq]').value); let n = 0;
                rows.forEach(r => { const ok = (!g || groupOf(r) === g) && (!q || S3().fold(r.textContent).includes(q)); r.hidden = !ok; if (ok) n++; });
                bar.querySelector('[data-so3-wscount]').textContent = q || g ? `${n} site${n > 1 ? 's' : ''} sur ${rows.length}` : ''; };
            bar.addEventListener('input', apply);
            bar.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; apply(); } });
            bar.addEventListener('click', e => { const b = e.target.closest('[data-so3-wsg]'); if (!b) return; g = b.dataset.so3Wsg || ''; bar.querySelectorAll('[data-so3-wsg]').forEach(x => x.classList.toggle('is-active', x === b)); apply(); });
        });
    }
    const start = () => {
        if (!A() || !S3()) return setTimeout(start, 200);
        addGroups(); watch();
        new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.web-search-editor') || n.querySelector?.('.web-search-editor'))))) enhanceEditors(document); }).observe(document.body, {childList: true, subtree: true});
        enhanceEditors(document);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    ext.sourcesOuvertes3 = {openSearch, openImport, openPasteText, openSettings, btn, importBtn, panelButton, decorate, enhanceEditors};
})();
