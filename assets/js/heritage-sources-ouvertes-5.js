/* LCNDA — 🌍 Archives en ligne, cinquième lot (les écrans) : FamilySearch, WikiTree, 🍁 Québec et Acadie (Fichier Origine, Centre
 * d'études acadiennes), 🚢 Castle Garden, 🎖 Médaillés de Sainte-Hélène, 🏭 Archives nationales du monde du travail, mémoriaux des
 * cheminots, gendarmes et policiers, 🌐 état civil consulaire, 📖 Geneawiki, 🇷🇺 Pamyat Naroda et Memorial, 📷 photographes anciens,
 * 📕 Maitron, 📜 CCFr et Calames.
 * La recherche est la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) : openSearch / openSettings / openPasteText
 * l'ouvrent déjà sur les sites de ce lot ; l'app n'interroge jamais ces sites. Ici : l'import, les boutons, « Mes sites ».
 *  - « ⤒ Importer ce que tu as trouvé » (K13) : image, PDF, page enregistrée, texte copié → média relié, source avec lien, et ce que
 *    le document propose (événements, voyage, récompense, ligne d'employeur, note, identifiant FamilySearch), coché ou non ;
 *    « c'est la même personne ? » ; rien d'écrasé ; « ↶ Annuler » (H7) ; tout reste « À vérifier ».
 *  - « Mes sites » (Réglages → Apparence → Chercher sur internet) : 🧪 Essayer un site ajouté, 💾 Réglages enregistrés pour le partager.
 * Entrées : blocs Départs / émigration, Militaire, 🏆 Concours et récompenses, fiche d'un employeur,
 * monographie et fiche d'un village (Geneawiki), Trésors → 📷 Dater une vieille photo (le photographe).
 * Calculs purs : app-sources-ouvertes-5-core.js (LCNDA_SOURCES_OUVERTES_5). Serveur : lib/sources_ouvertes_5.php.
 * Mode d'emploi : docs/UI.md (« 🔍 Archives en ligne »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S5 = () => window.LCNDA_SOURCES_OUVERTES_5;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-5-sites';
    const CUSTOM_KEY = 'genealogie-web-search-custom';
    const PRESETS_KEY = 'genealogie-web-search-custom-presets';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const lsJson = (k, d) => { try { const v = JSON.parse(lsGet(k, '')); return v ?? d; } catch (_) { return d; } };
    const custom = () => { const o = lsJson(KEY, {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const badge = (t, k, o) => UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${esc(k)}">${esc(t)}</span>`;
    const emptyLine = (t, i = '📭') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${i}</span><span class="empty-line-text">${esc(t)}</span></p>`;
    const VERIF = {oui: ['Adresse vérifiée', 'green', 'Déjà utilisée par l’app et vérifiée le 08/10/2026'], partiel: ['Vérifiée en partie', 'yellow', 'La forme de l’adresse est connue, mais pas tous ses paramètres'], non: ['Adresse non vérifiée', 'gray', 'Construite d’après la forme connue du site (le réseau n’était pas joignable) : si elle ne marche pas, change-la dans « ⚙️ Adresses des sites »']};
    const WHERE = {fiche: 'Toutes', emigration: '🧳 Émigration', militaire: '🎖 Militaire, gendarme', recompense: '🏆 Récompenses', employeur: '🏭 Employeur, métier', lieu: '📍 Un lieu', photo: '📷 Un photographe'};

    /** une ligne de site (📷 Le photographe au dos de la carte ; la recherche, elle, est la fenêtre commune) */
    function rowHtml(s, p, cu) {
        const u = S5().url(s.key, p, cu); const v = VERIF[s.verified] || VERIF.non; const copy = S5().copyText(s.key, p);
        const hasName = !!(p.last || p.first || ((s.byPlace) && (p.place || p.county)) || (s.byPhotographer && p.photographer) || (s.key === 'anmt' && p.employer));
        const go = !hasName ? `<button type="button" class="button small" disabled title="Écris au moins un nom">↗ Ouvrir</button>`
            : s.copy ? `<button type="button" class="button small" data-so5-copy="${esc(s.key)}" data-text="${esc(copy)}" data-href="${esc(u)}" title="Met « ${esc(copy)} » dans le presse-papiers et ouvre la page : colle-le dans la case du site">📋 Copier le nom et ouvrir</button>`
                : `<a class="button small" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-so5-go="${esc(s.key)}">↗ Ouvrir</a>`;
        return `<li class="so-link so5-link" data-so5-site="${esc(s.key)}">
            <span class="so-link-ico" aria-hidden="true">${esc(s.icon)}</span>
            <span class="so-link-main"><b>${esc(s.label)}</b> <span class="so5-badges">${badge(v[0], v[1], {title: v[2]})}${s.account ? ` ${badge('Compte gratuit', 'blue', {title: 'Le site demande de créer un compte (gratuit) pour voir les résultats'})}` : ''}${s.sensitive ? ` ${badge('Mémoire', 'black', {title: 'Victimes de la répression : ton sobre, jamais dans les jeux'})}` : ''}${cu[s.key] ? ` ${badge('Adresse à toi', 'blue')}` : ''}</span>
                ${hasName ? `<code class="so-url">${esc(u)}</code>` : `<small class="ui-hint">Écris au moins un nom${s.byPlace ? ' ou un lieu' : ''}.</small>`}
                ${s.note ? `<small class="ui-hint">${esc(s.note)}</small>` : ''}</span>
            ${go}</li>`;
    }

    /* ═════ 🔍 Chercher et ⚙️ Adresses des sites : la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) ═════ */
    /** la fenêtre commune, déjà sur les sites de ce lot utiles à cet endroit (where : fiche, emigration, militaire, recompense, employeur, lieu, photo) */
    const openSearch = (o = {}) => ext.archives?.open({...o, lot: 5, where: WHERE[o.where] ? o.where : 'fiche', place: o.place || '', placeOnly: !o.personId && !!o.place && !o.employer});
    const openSettings = onChange => ext.archives?.openSettings({lot: 5, onChange});
    /** un site sans recherche dans l'adresse : « NOM Prénom » dans le presse-papiers, puis la page */
    function copyAndOpen(text, href) {
        const u = S5().cleanUrl(href); if (!u) return;
        const done = ok => toast(ok && text ? `« ${text} » est copié : colle-le dans la case du site.` : `Écris « ${text} » dans la case du site.`);
        try { if (navigator.clipboard && text) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false); } catch (_) { done(false); }
        window.open(u, '_blank', 'noopener');
    }

    /* ═════ ⤒ Importer ce qu'on a téléchargé ou copié (K13) ═════ */
    const KIND_SITE = {acte: 'fs_records', wikitree: 'wikitree', origine: 'fichier_origine', passager: 'castle_garden', medaille_sh: 'sainte_helene', personnel: 'anmt', mort_service: 'memorial_cheminots',
        biographie: 'maitron', fonds: 'ccfr', pamyat: 'pamyat_naroda', repression: 'memorial_urss'};
    const SITES_OF = {acte: ['fs_records', 'fs_tree', 'cea_acadie', 'consulaire_nantes'], mort_service: ['memorial_cheminots', 'memorial_gendarmes', 'memorial_policiers'], fonds: ['ccfr', 'calames', 'fs_catalog']};
    const FIELD_LABEL = {last: 'Nom', first: 'Prénoms', name: 'Nom', type: 'Type d’acte', date: 'Date', place: 'Lieu', birth_date: 'Date de naissance (ou baptême)', birth_place: 'Lieu de naissance',
        death_date: 'Date du décès', death_place: 'Lieu du décès', father: 'Père (ou parents)', mother: 'Mère', spouse: 'Conjoint', cote: 'Cote, n° de film', archive: 'Archives, collection',
        wikitree_id: 'Identifiant WikiTree', numero: 'N° de la fiche', job: 'Profession', marriage_date: 'Mariage au Canada (date)', marriage_place: 'Mariage au Canada (lieu)', arrival: 'Arrivée, première mention au Canada', ref: 'Références',
        age: 'Âge', sex: 'Sexe', origin: 'Origine déclarée', ship: 'Navire', departure_port: 'Port de départ', arrival_date: 'Date d’arrivée', arrival_port: 'Port d’arrivée', destination: 'Destination',
        residence: 'Domicile vers 1857', unit: 'Corps, unité', rank: 'Grade, fonction', service: 'Services, campagnes', dept: 'Département', employer: 'Entreprise (employeur)', entry: 'Entrée (embauche)', exit: 'Sortie',
        matricule: 'Matricule', address: 'Adresse', circumstances: 'Circonstances', author: 'Auteur de la notice', title: 'Titre', repository: 'Conservé à', dates: 'Dates', description: 'Description',
        patronymic: 'Patronyme', fate: 'Sort (tué, disparu…)', burial: 'Lieu d’inhumation', arrest_date: 'Arrêté(e) le', sentence: 'Condamnation', sentence_date: 'Condamné(e) le', rehabilitation: 'Réhabilitation'};
    const FIELDS = {acte: ['type', 'date', 'place', 'last', 'first', 'father', 'mother', 'spouse', 'cote', 'archive'], wikitree: ['wikitree_id', 'last', 'first', 'birth_date', 'birth_place', 'death_date', 'death_place'],
        origine: ['numero', 'last', 'first', 'birth_date', 'birth_place', 'father', 'mother', 'job', 'arrival', 'marriage_date', 'marriage_place', 'spouse', 'death_date', 'death_place'],
        passager: ['last', 'first', 'age', 'sex', 'job', 'origin', 'ship', 'departure_port', 'arrival_date', 'arrival_port', 'destination'],
        medaille_sh: ['last', 'first', 'birth_date', 'birth_place', 'residence', 'unit', 'rank', 'service', 'cote'], personnel: ['last', 'first', 'employer', 'job', 'entry', 'exit', 'matricule', 'birth_date', 'birth_place', 'address', 'cote'],
        mort_service: ['last', 'first', 'service', 'rank', 'unit', 'death_date', 'death_place', 'circumstances', 'birth_date', 'birth_place'], biographie: ['name', 'birth_date', 'birth_place', 'death_date', 'death_place', 'author'],
        fonds: ['title', 'cote', 'repository', 'dates', 'description'], pamyat: ['last', 'first', 'patronymic', 'birth_date', 'birth_place', 'rank', 'unit', 'fate', 'death_date', 'burial'],
        repression: ['last', 'first', 'patronymic', 'birth_date', 'birth_place', 'job', 'arrest_date', 'sentence', 'sentence_date', 'death_date', 'rehabilitation']};
    const LONG = new Set(['description', 'service']);
    const DATEISH = /date$|^arrival$|^entry$|^exit$/;
    const TAGNAME = {BIRT: 'Naissance', CHR: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation', RESI: 'Résidence', OCCU: 'Profession', EVEN: 'Événement', MISE: 'Service militaire', DEED: 'Acte'};
    const readText = f => f.arrayBuffer().then(b => window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(b)).text : new TextDecoder().decode(b));

    function openImport(o = {}) {
        const st = {kind: S5().KINDS.includes(o.kind) ? o.kind : '', site: o.site || '', pid: Number(o.personId) || 0, person: null, file: null, link: o.link || '', text: o.text || '', v: {}, pr: null, on: {}, objUrl: '', preview: '', fsId: ''};
        const service = () => S5().site(st.site)?.service || '';
        const propose = () => { st.pr = S5().proposals(st.kind, st.v, {has: st.person?.has || {}, service: service()});
            const on = {}; st.pr.events.forEach((e, i) => { on['ev' + i] = e.checked; }); ['voyage', 'award', 'employer', 'note'].forEach(k => { if (st.pr[k]) on[k] = st.pr[k].checked !== false; }); on.fs = !!st.fsId; st.on = on; };
        const setKind = k => { st.kind = k; if (!(SITES_OF[k] || []).includes(st.site) && KIND_SITE[k] && S5().site(st.site)?.kind !== k) st.site = KIND_SITE[k]; if (st.text) st.v = {...S5().parseFields(st.text, k), ...st.v}; propose(); };
        const linkInfo = () => { const li = S5().parseLink(st.link); if (li.site && !st.site) st.site = li.site; if (li.fsId) st.fsId = li.fsId; if (li.wikitreeId && !st.v.wikitree_id) st.v.wikitree_id = li.wikitreeId; if (li.numero && st.kind === 'origine' && !st.v.numero) st.v.numero = li.numero; };
        const analyze = async files => {
            const f = files[0]; if (!f) throw new Error('aucun fichier');
            const extn = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (f.size > 60 * 1048576) throw new Error('fichier trop gros (60 Mo au plus)');
            st.file = null; st.preview = '';
            if (o.textOnly) { st.text = st.text || await readText(f); }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extn)) { st.file = f; if (st.objUrl) URL.revokeObjectURL(st.objUrl); st.objUrl = URL.createObjectURL(f); st.preview = `<img src="${esc(st.objUrl)}" alt="Le document importé">`; }
            else if (extn === 'pdf') { st.file = f; st.preview = `<div class="so-pdf">📄 <b>${esc(f.name)}</b><br><small>Le PDF sera rangé dans les médias. Recopie à côté ce qu’il dit.</small></div>`; }
            else if (extn === 'html' || extn === 'htm') { const pg = window.LCNDA_SOURCES_OUVERTES?.parseSavedPage ? window.LCNDA_SOURCES_OUVERTES.parseSavedPage(await readText(f)) : {text: '', url: '', title: ''}; st.text = pg.text; st.link = st.link || pg.url; st.v.media_title = pg.title; st.preview = `<div class="so-pdf">🌐 <b>${esc(pg.title || f.name)}</b><br><small>Page enregistrée : seul son texte est gardé (dans la source), pas la page elle-même.</small></div>`; }
            else if (extn === 'txt') { st.text = st.text || await readText(f); st.preview = `<div class="so-pdf">📝 <b>${esc(f.name)}</b></div>`; }
            else throw new Error('ici : une image, un PDF, une page enregistrée (.html) ou un texte (.txt)');
            linkInfo();
            if (!st.kind) st.kind = S5().detectKind(st.text) || (st.site && S5().site(st.site)?.kind) || 'acte';
            if (!S5().KINDS.includes(st.kind)) st.kind = 'acte';
            if (st.pid) { try { st.person = (await post('so5_preview', {kind: st.kind, person_id: st.pid})).person; } catch (_) { st.person = null; } }
            setKind(st.kind);
            const who = st.person ? `<b>${esc([st.person.first, String(st.person.last || '').toUpperCase()].join(' '))}</b>` : 'la fiche choisie ci-dessous';
            return {count: 1, noun: 'document', summaryHtml: `<b>${esc(S5().KIND_LABEL[st.kind] || 'un document')}</b> pour ${who}`,
                notices: [{kind: 'warn', text: `${S5().MENTION}. Le document entre « À vérifier ».`}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : une naissance, un baptême, un décès ou une inhumation déjà sur la fiche est gardé tel quel, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
                preview: '<div class="so-imp so5-imp" data-so5-imp></div>', onShow: body => { bind(body); draw(body); }};
        };
        const read = body => {
            const box = body.querySelector('[data-so5-imp]'); if (!box) return;
            box.querySelectorAll('.so5-fields [name]').forEach(i => { st.v[i.name] = i.value; });
            const lk = box.querySelector('[name=so5_link]'); if (lk) st.link = lk.value.trim();
            const tx = box.querySelector('[name=so5_text]'); if (tx) st.text = tx.value;
            box.querySelectorAll('[data-so5-on]').forEach(i => { st.on[i.dataset.so5On] = i.checked; });
        };
        const payload = () => {
            const pr = st.pr || {events: []};
            const evs = pr.events.map((e, i) => ({...e, checked: !!st.on['ev' + i] && !e.already}));
            const pick = k => pr[k] ? {...pr[k], checked: !!st.on[k]} : null;
            return {kind: st.kind, site: st.site, person_id: st.pid, url: S5().cleanUrl(st.link), fields: {...st.v, text: st.text.slice(0, 20000)}, events: evs, voyage: pick('voyage'), award: pick('award'),
                employer: pick('employer'), note: pick('note'), fs_id: st.on.fs ? st.fsId : '', source_title: S5().sourceTitle(st.kind, st.v, st.site)};
        };
        let ecT = 0;
        const ecarts = body => {
            clearTimeout(ecT);
            ecT = setTimeout(async () => {
                const ul = body.querySelector('[data-so-ecarts]'); if (!ul) return;
                if (!st.pid) { ul.innerHTML = '<li class="so-ecart is-info">ℹ️ Choisis la fiche : l’app comparera le document avec elle.</li>'; return; }
                try {
                    const r = await post('so5_preview', payload());
                    ul.innerHTML = r.ecarts.length ? r.ecarts.map(e => `<li class="so-ecart is-${esc(e.level)}">${e.level === 'orange' ? '🟠' : e.level === 'yellow' ? '🟡' : 'ℹ️'} ${esc(e.text)}</li>`).join('') : '<li class="so-ecart is-ok">✓ Le nom, le prénom et les dates ne contredisent pas la fiche.</li>';
                } catch (e) { ul.innerHTML = `<li class="so-ecart is-orange">⛔ ${esc(e.message)}</li>`; }
            }, 350);
        };
        const line = (key, text, disabled = false) => `<label class="checkbox-line${disabled ? ' is-off' : ''}"><input type="checkbox" data-so5-on="${esc(key)}" ${st.on[key] && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${text}</span></label>`;
        const propsHtml = () => {
            const pr = st.pr; if (!pr) return '';
            const rows = [
                ...pr.events.map((e, i) => line('ev' + i, `${esc(e.label || TAGNAME[e.tag] || e.tag)} : ${esc([e.date, e.place && `à ${e.place}`, e.description].filter(Boolean).join(' · ') || '—')}${e.already ? ' <small class="muted">— déjà sur la fiche : gardé tel quel</small>' : ''}`, e.already)),
                pr.voyage ? line('voyage', `🧳 Ajouter un départ (bloc « Départs / émigration ») : ${esc([pr.voyage.ship_name, pr.voyage.departure_port && `de ${pr.voyage.departure_port}`, pr.voyage.destination && `vers ${pr.voyage.destination}`, pr.voyage.arrival_date].filter(Boolean).join(' · ') || pr.voyage.reason)}`) : '',
                pr.award ? line('award', `🏆 Ajouter « ${esc(pr.award.title)} » (Concours et récompenses)`) : '',
                pr.employer ? line('employer', `🏭 Ajouter une ligne dans la fiche de l’employeur « ${esc(pr.employer.name)} » (créée si elle n’existe pas)`) : '',
                pr.note ? line('note', `📝 Ajouter une note : ${esc(pr.note.title)}`) : '',
                st.fsId ? line('fs', `🌳 Noter l’identifiant FamilySearch ${esc(st.fsId)} (seulement si la fiche n’en a pas)`) : ''].filter(Boolean);
            return rows.length ? `<fieldset class="so-props"><legend>Ce qui sera proposé sur la fiche (rien n’est remplacé)</legend>${rows.join('')}</fieldset>` : '';
        };
        const fieldsHtml = () => (FIELDS[st.kind] || []).map(k => LONG.has(k) ? `<label class="so-span-2">${esc(FIELD_LABEL[k] || k)}<textarea name="${esc(k)}" rows="2">${esc(st.v[k] ?? '')}</textarea></label>`
            : `<label>${esc(FIELD_LABEL[k] || k)}<input name="${esc(k)}" value="${esc(st.v[k] ?? '')}" autocomplete="off" ${DATEISH.test(k) ? 'data-ui-date' : ''}></label>`).join('');
        const siteSelect = () => { const list = S5().SITES.filter(s => s.kind === st.kind); return list.length > 1 ? `<label class="so5-kind">Site<select name="so5_site">${list.map(s => `<option value="${esc(s.key)}" ${s.key === st.site ? 'selected' : ''}>${esc(s.icon)} ${esc(s.label)}</option>`).join('')}</select></label>` : ''; };
        const draw = body => {
            const box = body.querySelector('[data-so5-imp]'); if (!box) return;
            const sensitive = st.kind === 'repression';
            box.innerHTML = `<div class="so-imp-who">${st.person && o.personId ? `<span class="pk-lab">Fiche</span> <b>${esc(st.person.first)} ${esc(String(st.person.last || '').toUpperCase())}</b>` : `<span class="pk-lab">À qui se rapporte ce document ?</span>${pickerField({name: 'so5_pid', kind: 'person', value: st.pid || null})}`}</div>
                <div class="form-grid so5-kindrow"><label class="so5-kind">Sorte de document<select name="so5_kind">${S5().KINDS.map(k => `<option value="${k}" ${k === st.kind ? 'selected' : ''}>${esc(S5().KIND_LABEL[k])}</option>`).join('')}</select></label>${siteSelect()}</div>
                ${sensitive ? UI().notice('info', 'Une victime de la répression politique : ce qui vient de Memorial reste sobre sur la fiche, et cette fiche n’entre jamais dans un jeu.') : ''}
                <div class="so-imp-grid${st.preview ? '' : ' is-noimg'}">${st.preview ? `<div class="so-imp-img">${st.preview}</div>` : ''}
                    <div class="so-fields"><p class="so-imp-badge">${badge('À vérifier', 'yellow', {title: S5().MENTION})} <small class="muted">Recopie ce que dit le document ; laisse vide ce que tu ne sais pas.</small></p>
                    <div class="form-grid so-grid so5-fields">${fieldsHtml()}</div>
                    <div class="form-grid so-grid"><label class="so-span-2">Lien vers la fiche ou la notice<input name="so5_link" value="${esc(st.link)}" inputmode="url" placeholder="https://…" autocomplete="off"></label>
                        <label class="so-span-2">Texte copié (facultatif : gardé dans la source)<textarea name="so5_text" rows="3">${esc(st.text)}</textarea></label></div>
                    <div data-so5-props>${propsHtml()}</div>
                    <div class="so-ecarts-box"><h4>C’est la même personne ?</h4><ul class="so-ecarts" data-so-ecarts></ul></div></div></div>`;
            ecarts(body);
        };
        const redrawProps = body => { const keep = {...st.on}; propose(); Object.keys(keep).forEach(k => { if (k in st.on) st.on[k] = keep[k]; }); const b = body.querySelector('[data-so5-props]'); if (b) b.innerHTML = propsHtml(); };
        const bind = body => {
            if (body._so5Bound) return; body._so5Bound = true;
            body.addEventListener('input', e => { if (!e.target.closest('[data-so5-imp]')) return; read(body); if (e.target.closest('.so5-fields')) redrawProps(body); if (e.target.name === 'so5_link') { linkInfo(); redrawProps(body); } ecarts(body); });
            body.addEventListener('change', async e => {
                if (e.target.name === 'so5_kind') { read(body); setKind(e.target.value); draw(body); return; }
                if (e.target.name === 'so5_site') { read(body); st.site = e.target.value; redrawProps(body); return; }
                if (e.target.name === 'so5_pid') { st.pid = Number(e.target.value) || 0; read(body); try { st.person = st.pid ? (await post('so5_preview', {kind: st.kind, person_id: st.pid})).person : null; } catch (_) { st.person = null; } propose(); draw(body); return; }
                if (e.target.closest('[data-so5-imp]')) { read(body); ecarts(body); }
            });
        };
        const run = async (an, files, body) => {
            read(body);
            const box = body.querySelector('[data-so5-imp]');
            if (!st.pid) { UI().fail?.(box.querySelector('.so-imp-who .pk') || box.querySelector('.so-imp-who'), 'Choisis la fiche à qui se rapporte ce document.'); return {keepOpen: true}; }
            if (st.link && !S5().cleanUrl(st.link)) { UI().fail?.(box.querySelector('[name=so5_link]'), 'Le lien doit commencer par https:// (ou http://).'); return {keepOpen: true}; }
            const data = payload();
            const filled = Object.entries(data.fields).filter(([k, v]) => k !== 'text' && String(v || '').trim()).length;
            if (!st.file && !data.url && !st.text.trim() && filled < 2) { UI().fail?.(box.querySelector('[name=so5_link]'), 'Il faut un fichier, un lien, le texte du document ou au moins deux cases remplies.'); return {keepOpen: true}; }
            const fd = new FormData(); const csrf = A().state?.csrf || '';
            if (st.file) fd.append('file', st.file, st.file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const headers = {'X-CSRF-Token': csrf, Accept: 'application/json', ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {})};
            const resp = await fetch('api.php?action=so5_import', {method: 'POST', body: fd, headers});
            const j = await resp.json().catch(() => ({error: 'Réponse illisible du serveur'}));
            if (!resp.ok || j.error) throw new Error(j.error || `Erreur ${resp.status}`);
            const r = j.result; if (st.objUrl) URL.revokeObjectURL(st.objUrl);
            window.dispatchEvent(new CustomEvent('lcnda:sources-ouvertes-changed', {detail: r}));
            refresh();
            return {message: `${r.summary} — à vérifier sur le document.`, undo: async () => { await post('so5_undo', {batch: r.batch}); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer depuis FamilySearch, le Québec, l’émigration, les métiers…', accept: 'image/*,.pdf,.html,.htm,.txt', what: 'image, PDF, page enregistrée ou texte',
            intro: 'Ce que tu as téléchargé ou enregistré : un acte en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), ou un texte copié (fiche FamilySearch, WikiTree, Fichier Origine, Castle Garden, médaillé de Sainte-Hélène, registre du personnel, notice du Maitron…). Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 📋 Coller un texte ».',
            noun: 'document', analyze, run, files: o.files});
    }
    /** pas de fichier : le texte copié (ou le lien) → le seul « 🔗 Coller un lien » de l'app, qui revient à openImport */
    const openPasteText = (o = {}) => ext.archives?.openPaste({...o, lot: 5});

    /* ═════ 📷 Le photographe au dos de la carte (Trésors → Dater une vieille photo) ═════ */
    function openPhotographer(o = {}) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal so5-photo';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">DATER UNE VIEILLE PHOTO</span><h2>📷 Le photographe au dos de la carte</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><div class="form-grid"><label>Nom du photographe<input name="photographer" value="${esc(o.photographer || '')}" autocomplete="off" placeholder="Nadar, Disdéri, Photographie Moderne…"></label><label>Ville<input name="place" value="${esc(o.place || '')}" autocomplete="off" placeholder="Tulle"></label></div>
            <ul class="so-links" data-so5-ph-links></ul>
            <label>Ce que dit la base ou l’annuaire<textarea name="said" rows="3" placeholder="Actif de 1862 à 1895, 12 rue Nationale…"></textarea></label>
            <p class="ui-hint" data-so5-ph-read>Colle ici la ligne qui donne ses années d’activité.</p></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button" data-so5-ph-use disabled>Mettre ces années dans la photo</button></div></form>`;
        document.body.appendChild(dlg);
        let per = {from: 0, to: 0};
        const upd = () => {
            const v = Object.fromEntries(new FormData(dlg.querySelector('form'))); const p = {photographer: v.photographer, place: v.place}; const cu = custom();
            dlg.querySelector('[data-so5-ph-links]').innerHTML = S5().forPlace('photo').map(s => rowHtml(s, p, cu)).join('');
            per = S5().photographerPeriod(v.said || '');
            const hint = dlg.querySelector('[data-so5-ph-read]');
            hint.className = 'ui-hint' + (per.from ? ' is-ok' : v.said?.trim() ? ' is-error' : '');
            hint.textContent = per.from ? `✓ Compris : actif ${per.to ? `de ${per.from} à ${per.to}` : `à partir de ${per.from}`}` : v.said?.trim() ? '⚠️ Je ne trouve pas d’années (ex. « actif de 1862 à 1895 »).' : 'Colle ici la ligne qui donne ses années d’activité.';
            dlg.querySelector('[data-so5-ph-use]').disabled = !per.from;
        };
        dlg.addEventListener('input', upd);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); const c = e.target.closest('[data-so5-copy]'); if (c) copyAndOpen(c.dataset.text || dlg.querySelector('[name=photographer]').value, c.dataset.href); });
        dlg.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (!per.from) return; o.onPeriod?.(per); dlg.close(); });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal(); upd();
        return dlg;
    }

    /* ═════ « Mes sites » (Réglages → Apparence → Chercher sur internet) : 🧪 Essayer, 💾 partager ═════ */
    const customList = () => { const l = lsJson(CUSTOM_KEY, []); return Array.isArray(l) ? l : []; };
    function testCustom(btn) {
        const box = btn.closest('[data-ws-custom]'); if (!box) return;
        const out = box.querySelector('[data-ws-custom-test-out]');
        const key = btn.dataset.wsCustomTest;
        const site = key ? customList().find(s => s.key === key) : {label: box.querySelector('#ws-custom-label')?.value.trim(), url: box.querySelector('#ws-custom-url')?.value.trim(), icon: box.querySelector('#ws-custom-icon')?.value.trim()};
        if (!site) return;
        const problems = S5().checkCustom(site);
        if (!key && problems.some(m => /adresse|Champ inconnu|signe interdit/.test(m))) { const m = problems.find(x => /adresse|Champ inconnu|signe interdit/.test(x)); UI().fail?.(box.querySelector('#ws-custom-url'), m); if (out) out.innerHTML = ''; return; }
        // une personne pour l'essai : la fiche ouverte, sinon un exemple
        const cur = A()?.state?.currentPerson; let p;
        if (cur?.person && A().webSearchContext) { const ctx = A().webSearchContext(cur); p = A().webSearchParams(ctx, {years: true, y1: ctx.birthYear, y2: ctx.deathYear, place: ctx.places[0]?.value || ''}); }
        else p = {first: 'Jean', last: 'Dupont', name: 'Jean Dupont', place: 'Tulle', y1: 1850, y2: 1920, year: 1850, birthYear: 1850, deathYear: 1920, q: '"Jean Dupont" Tulle', spouseName: ''};
        const u = S5().cleanUrl(S5().fillCustom(site.url, p));
        const left = [...String(S5().fillCustom(site.url, p)).matchAll(/\{([^{}]+)\}/g)].map(m => m[1]);
        if (out) out.innerHTML = `<div class="so5-test">${u ? `<span>🧪 Avec <b>${esc(p.name || p.first + ' ' + p.last)}</b>${p.birthYear ? ` (${esc(p.birthYear)}${p.deathYear ? '–' + esc(p.deathYear) : ''})` : ''} : <code class="so-url">${esc(u)}</code></span> <a class="button small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ Ouvrir</a>` : '<span>⛔ Cette adresse ne donne pas une adresse internet valable.</span>'}
            ${problems.filter(m => !/^Donne un nom/.test(m)).map(m => `<small class="ui-hint is-error">⚠️ ${esc(m)}</small>`).join('')}${left.length ? `<small class="ui-hint is-error">⚠️ Resté tel quel : ${esc(left.map(k => `{${k}}`).join(' '))}</small>` : ''}</div>`;
    }
    function customPresets(slot) {
        if (!slot || slot.dataset.so5 || !UI()?.presetsFrame) return; slot.dataset.so5 = '1';
        const list = () => { const l = lsJson(PRESETS_KEY, []); return Array.isArray(l) ? l.filter(x => x && typeof x.name === 'string' && Array.isArray(x.data)) : []; };
        const put = l => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(l.slice(0, 40))); } catch (_) {} };
        const clean = arr => (Array.isArray(arr) ? arr : []).slice(0, 60).map(s => S5().cleanCustom(s)).filter(s => s.label && /^https?:\/\//i.test(s.url));
        const merge = sites => { const cur = customList(); const have = new Set(cur.map(s => s.url)); const add = clean(sites).filter(s => !have.has(s.url)).map((s, i) => ({...s, key: `custom-${Date.now().toString(36)}${i}`}));
            A().undoLocalChange(add.length ? `${A().plural ? A().plural(add.length, 'site ajouté', 'sites ajoutés') : add.length + ' sites'} à « Mes sites »` : 'Ces sites sont déjà dans « Mes sites »', [CUSTOM_KEY], () => localStorage.setItem(CUSTOM_KEY, JSON.stringify([...cur, ...add])), () => A().renderDesignTools?.());
            A().renderDesignTools?.(); };
        slot.appendChild(UI().presetsFrame({id: 'mes-sites', title: 'Réglages enregistrés (pour partager « Mes sites »)', what: 'la liste de tes sites ajoutés', list, quietApply: true,
            apply: i => { const x = list()[i]; if (!x) return false; merge(x.data); return false; },
            save: name => { const l = list(), it = {name, date: new Date().toISOString(), data: clean(customList())}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); put(l); },
            replace: i => { const l = list(); if (!l[i]) return false; l[i] = {...l[i], date: new Date().toISOString(), data: clean(customList())}; put(l); },
            rename: (i, name) => { const l = list(); if (!l[i]) return false; l[i].name = name; put(l); },
            exportOne: i => { const x = list()[i]; if (x) A().exportSettingFile?.('mes-sites', x.name, {data: x.data}); return false; },
            remove: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i, 1); put(l); toast(`Réglage « ${x.name} » supprimé.`); },
            importOne: async () => { const got = await A().importSettingFile?.('mes-sites', {names: list().map(x => x.name), check: d => d && Array.isArray(d.data) && clean(d.data).length > 0}); if (!got) return false; const l = list(); l.push({name: got.nom, date: new Date().toISOString(), data: clean(got.donnees.data)}); put(l); }}));
        const hint = document.createElement('p'); hint.className = 'ui-hint'; hint.textContent = '« ＋ Enregistrer les réglages actuels » garde ta liste de sites sous un nom ; ⋯ → Exporter en fait un fichier à donner à quelqu’un, qui l’ouvre avec « ⤒ Importer » puis « Appliquer » (les sites s’ajoutent aux siens).';
        slot.appendChild(hint);
    }

    /* ═════ Les boutons : fiche, blocs, employeur, lieux, Trésors ═════ */
    const BTN = {fiche: '🌍 FamilySearch, Québec, métiers…', emigration: '🌍 Québec, Castle Garden…', militaire: '🌍 Sainte-Hélène, gendarmes, Pamyat Naroda…', recompense: '🌍 Médaillés de Sainte-Hélène…', employeur: '🏭 Registres du personnel (ANMT)…', lieu: '📖 Geneawiki…', photo: '📷 Chercher le photographe…'};
    const btn = (where, pid, o = {}) => `<button type="button" class="button small secondary" data-so5-search="${esc(where)}" data-pid="${Number(pid) || 0}"${o.place ? ` data-place="${esc(o.place)}"` : ''}${o.employer ? ` data-employer="${esc(o.employer)}"` : ''} title="Ouvre la recherche dans ton navigateur, nom et années déjà remplis">${esc(BTN[where] || BTN.fiche)}</button>`;
    const importBtn = (pid, kind = '') => `<button type="button" class="button small secondary" data-so5-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range le document trouvé, crée la source et propose ce qu’il dit">⤒ Importer…</button>`;
    const geneawikiLinks = (commune, county, insee = '') => {
        const u1 = commune ? S5().url('geneawiki', {place: commune, insee}, custom()) : ''; const u2 = county ? S5().url('geneawiki', {county}, custom()) : '';
        return u1 || u2 ? `<p class="so-row so5-row so5-geneawiki">${u1 ? `<a class="button small secondary" href="${esc(u1)}" target="_blank" rel="noopener noreferrer" title="La page de la commune sur Geneawiki : registres, archives, histoire">📖 Geneawiki : ${esc(commune)}</a>` : ''}${u2 ? `<a class="button small secondary" href="${esc(u2)}" target="_blank" rel="noopener noreferrer">📖 Geneawiki : ${esc(county)}</a>` : ''}</p>` : '';
    };
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so5-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, where: s.dataset.so5Search || 'fiche', place: s.dataset.place || '', employer: s.dataset.employer || ''}); return; }
        const im = e.target.closest('[data-so5-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so5Import || undefined}); return; }
        const pl = e.target.closest('[data-so5-paste]'); if (pl) { e.preventDefault(); openPasteText({personId: Number(pl.dataset.pid) || 0}); return; }
        const t = e.target.closest('[data-ws-custom-test]'); if (t) { e.preventDefault(); testCustom(t); return; }
        const ph = e.target.closest('[data-so5-photo]'); if (ph) { e.preventDefault(); const form = ph.closest('form'); openPhotographer({place: form?.elements?.where?.value || '', onPeriod: per => { if (!form) return; form.elements.lo.value = per.from; form.elements.hi.value = per.to || ''; form.elements.lo.dispatchEvent(new Event('input', {bubbles: true})); toast(`Photographe actif ${per.to ? `de ${per.from} à ${per.to}` : `dès ${per.from}`} : mis dans la photo.`); }}); return; }
        // « Chercher sur internet » : un site qui garde sa recherche dans un formulaire → le nom est aussi copié
        const ws = e.target.closest('a[data-ws-site^="so5_"]'); if (ws) { const site = S5()?.site(ws.dataset.wsSite.slice(4)); const nm = ws.closest('.web-search-panel')?.dataset.so5Name || ''; if (site?.copy && nm) { try { navigator.clipboard?.writeText(nm).then(() => toast(`« ${nm} » est aussi copié : colle-le dans la case du site.`), () => {}); } catch (_) {} } }
    });
    const BLOCK_WHERE = {voyages: 'emigration', military: 'militaire', awards: 'recompense'};
    const BLOCK_KIND = {voyages: 'passager', military: 'medaille_sh', awards: 'medaille_sh'};
    function decorate(root = document) {
        const ws = root.querySelector?.('#workspace') || root; if (!ws?.querySelectorAll || !S5()) return;
        const cur = A()?.state?.currentPerson?.person; const pid = Number(cur?.id) || 0;
        const ro = document.body.classList.contains('is-kiosk') || Number(cur?.is_locked) === 1 || document.documentElement.classList.contains('ms-open');
        if (pid) ws.querySelectorAll('[data-pblock="web_search"] .web-search-panel:not([data-so5-name])').forEach(panel => { panel.dataset.so5Name = [String(cur.last_name || '').toUpperCase(), String(cur.first_name || '').split(/\s+/)[0]].filter(Boolean).join(' '); });
        if (pid) ws.querySelectorAll('[data-pblock]').forEach(card => {
            const key = card.dataset.pblock, where = BLOCK_WHERE[key]; if (!where || card.querySelector(':scope .so5-row, :scope .so5-ws')) return;
            const bodyEl = card.querySelector('.card-body'); if (!bodyEl) return;
            if (!bodyEl.textContent.trim()) return;
            bodyEl.insertAdjacentHTML('beforeend', `<p class="so-row so5-row">${btn(where, pid)}${ro ? '' : importBtn(pid, BLOCK_KIND[key] || '')}</p>`);
        });
        // fiche d'un employeur
        ws.querySelectorAll('.h-emp-actions:not([data-so5])').forEach(box => { box.dataset.so5 = '1'; const name = box.closest('.h-emp-hero')?.querySelector('h2')?.textContent?.trim() || ''; if (name) box.insertAdjacentHTML('beforeend', btn('employeur', 0, {employer: name})); });
        // monographie d'une commune
        const mono = ws.querySelector('.place-monograph-summary:not([data-so5])');
        if (mono) { mono.dataset.so5 = '1'; const name = mono.querySelector('.place-monograph-title')?.textContent?.trim() || ''; const sub = (mono.querySelector('p')?.textContent || '').split(' · ').map(x => x.trim()).filter(Boolean);
            const county = sub.length >= 3 ? sub[sub.length - 3] : ''; // « [subdivision ·] département · région · pays »
            if (name) mono.querySelector('div')?.insertAdjacentHTML('beforeend', geneawikiLinks(name.split(',')[0], county && county !== name ? county : '')); }
        // fiche d'un village
        const village = ws.querySelector('.h-village:not([data-so5])');
        if (village) { village.dataset.so5 = '1'; const name = (village.querySelector('.page-header h2, h2')?.textContent || '').trim().replace(/^[^\p{L}]+/u, ''); const stats = village.querySelector('[data-vsec="stats"]');
            if (name && stats) stats.insertAdjacentHTML('afterend', geneawikiLinks(name.split(',')[0], '')); }
        // Trésors → 📷 Dater une vieille photo
        ws.querySelectorAll('form[data-ph]:not([data-so5])').forEach(form => { form.dataset.so5 = '1'; const where = form.elements.where?.closest('label'); if (where) where.insertAdjacentHTML('afterend', '<button type="button" class="button small secondary so5-ph-btn" data-so5-photo title="Le nom du photographe donne ses années d’activité (base Daguerre, annuaires)">📷 Le photographe…</button>'); });
    }
    let decoT = 0;
    const watch = () => { new MutationObserver(() => { clearTimeout(decoT); decoT = setTimeout(() => decorate(document), 60); }).observe(document.body, {childList: true, subtree: true}); decorate(document); }; // tout le document : #workspace peut être remplacé

    /* ═════ « Chercher sur internet » : les sites de ce lot, rangés par pays / thème (cachés au départ) ═════ */
    function addToWebSearch() {
        const prev = ext.webSearchExtra; if (prev?._so5) return;
        const mine = () => S5().webSites(custom()).map(([k, label, , fn, meta]) => [k, `${meta.icon} ${label}`, S5().groupOf(S5().site(meta.so5).group).label, fn]);
        const f = () => [...(typeof prev === 'function' ? prev() || [] : []), ...mine()]; f._so5 = true; ext.webSearchExtra = f;
        const groups = A()?.webSearchGroups;
        if (Array.isArray(groups)) { const at = Math.max(0, groups.indexOf('Autres')); S5().GROUPS.map(g => g.label).filter(l => !groups.includes(l)).reverse().forEach(l => groups.splice(at, 0, l)); }
    }
    const watchCustom = () => new MutationObserver(() => { document.querySelectorAll('[data-ws-custom-presets]:not([data-so5])').forEach(customPresets); }).observe(document.body, {childList: true, subtree: true});
    const start = () => {
        if (!A() || !S5() || !UI()) return setTimeout(start, 200);
        addToWebSearch(); setTimeout(addToWebSearch, 0); // après les autres lots, qui posent aussi leur fonction
        watch(); watchCustom(); document.querySelectorAll('[data-ws-custom-presets]').forEach(customPresets);
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);

    ext.sourcesOuvertes5 = {openSearch, openImport, openPasteText, openSettings, openPhotographer, testCustom, customPresets, btn, importBtn, decorate, geneawikiLinks};
})();
