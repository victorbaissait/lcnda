/* LCNDA — 🌍 Archives de France et d’ailleurs (3e lot des archives en ligne) : l’import et les boutons.
 * La recherche est la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) : openSearch / openSettings /
 * openPasteText l’ouvrent déjà sur les sites de ce lot ; l’app n’interroge jamais ces sites.
 *  - « ⤒ Importer ce que tu as trouvé » (fenêtre K13) : image, PDF, page enregistrée, texte copié, fichier de données
 *    ouvertes (Open Archives : JSON ou CSV), page de résultats FreeBMD → média relié, source avec lien, événements et
 *    blocs proposés (cochés ou non), « c’est la même personne ? », rien d’écrasé, « ↶ Annuler » (H7), « À vérifier ».
 * Entrées : blocs Militaire / Poilu,
 * Départs / émigration, Sciences (inventeur), Diplômes (médecin, polytechnicien), profils (élu), fiche d’un village.
 * Calculs purs : app-sources-ouvertes-3-core.js (LCNDA_SOURCES_OUVERTES_3). Serveur : lib/sources_ouvertes_3.php.
 * Mode d’emploi : docs/UI.md (« 🔍 Archives en ligne »).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const S3 = () => window.LCNDA_SOURCES_OUVERTES_3;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const KEY = 'genealogie-sources-ouvertes-3-sites';
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const custom = () => { try { const o = JSON.parse(lsGet(KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const pickerField = o => (window.LCNDA_PICKER || A()).pickerField(o);
    const refresh = () => { try { A().refreshScreen?.(); } catch (_) {} };
    const context = async pid => { const so = ext.sourcesOuvertes; if (so?.context) return so.context(pid); return api('so_context', {person_id: Number(pid) || 0}); };
    const badge = (t, k, o) => UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${esc(k)}">${esc(t)}</span>`;
    const WHERE = {fiche: 'Toutes', militaire: '🎖 Militaire, prisonniers', emigration: '🧳 Émigration', inventeur: '💡 Inventeur', medecin: '⚕ Médecin, polytechnicien', elu: '🏛 Élu', artiste: '🖼 Artiste', lieu: '📍 Un lieu'};

    /* ═════ 🔍 Chercher et ⚙️ Adresses des sites : la fenêtre commune de tous les lots (heritage-archives-en-ligne.js) ═════ */
    /** la fenêtre commune, déjà sur les sites de ce lot utiles à cet endroit (where : fiche, militaire, emigration, inventeur…) */
    const openSearch = (o = {}) => ext.archives?.open({...o, lot: 3, where: WHERE[o.where] ? o.where : 'fiche', place: o.place || '', placeOnly: !o.personId && !!o.place});
    const openSettings = onChange => ext.archives?.openSettings({lot: 3, onChange});

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
                notices: [{kind: 'warn', text: i18n("{nm}. Le document entre « À vérifier ».", {nm: i18n(S3().MENTION)})}, {kind: 'info', text: 'Rien de la fiche n’est remplacé : une naissance, un baptême, un décès ou une inhumation déjà sur la fiche est gardé tel quel, et « ↶ Annuler » retire tout ce que l’import a ajouté.'}],
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
            ? [...st.picked].map(i => st.rows[i]).filter(Boolean).map(x => ({tag: x.tag, label: x.type || TAGNAME[x.tag] || '', date: x.date, place: x.place || x.district || '', note: x.note || [x.role && i18n('Rôle : {nm}', {nm: x.role}), x.archive && i18n('Archives : {nm}', {nm: x.archive}), x.url].filter(Boolean).join(' · ')}))
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
                ${st.rows.slice(0, 300).map((x, i) => `<tr><td><label class="checkbox-line"><input type="checkbox" data-so3-row="${i}" ${st.picked.has(i) ? 'checked' : ''} aria-label="Ajouter cette ligne"></label></td><td>${esc(x.first)} <b>${esc(String(x.last).toUpperCase())}</b></td><td>${esc(x.type || TAGNAME[x.tag] || x.tag)}${['MARR', 'MARB'].includes(x.tag) ? ' <small class="muted">(dans la famille)</small>' : ''}</td><td>${esc(x.quarterText || x.date)}</td><td>${esc(x.place || x.district || '')}</td><td>${esc(st.kind === 'freebmd' ? i18n('vol. {nm} p. {x2}', {nm: String(x.vol), x2: String(x.page)}) : x.role)}</td></tr>`).join('')}</tbody></table></div>`;
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
            return {message: i18n('{nm} — à vérifier sur le document.', {nm: r.summary}), undo: async () => { await post('so3_undo', {batch: r.batch}); refresh(); }};
        };
        return UI().openImportDialog({title: 'Importer depuis les archives de France et d’ailleurs', accept: 'image/*,.pdf,.html,.htm,.txt,.json,.csv', what: 'image, PDF, page enregistrée, texte ou fichier de données',
            intro: 'Ce que tu as téléchargé ou enregistré : une fiche en image ou en PDF, la page enregistrée par ton navigateur (« Enregistrer sous… »), un texte copié (fiche du CICR, de Sycomore, d’un brevet, d’une tombe, page de résultats FreeBMD…) ou le fichier de données ouvertes d’Open Archives (JSON ou CSV). Rien n’est demandé au site : seul ton fichier est lu. Pas de fichier ? « 📋 Coller un texte ».',
            noun: 'document', analyze, run, files: o.files});
    }
    /** pas de fichier : le texte copié (ou le lien) → le seul « 🔗 Coller un lien » de l'app, qui revient à openImport */
    const openPasteText = (o = {}) => ext.archives?.openPaste({...o, lot: 3});

    /* ═════ Les boutons : blocs de la fiche, fiche d'un village ═════ */
    const BTN = {fiche: '🌍 Archives de France et d’ailleurs…', militaire: '🌍 Prisonniers 14-18, Arolsen…', emigration: '🌍 Archives du pays d’arrivée…', inventeur: '🌍 Brevets d’invention (INPI)…', medecin: '🌍 Thèses, Polytechnique…', elu: '🌍 Sycomore, Sénat…', artiste: '🌍 Musées (Joconde)…', lieu: '🌍 Livres et archives sur ce lieu…'};
    const btn = (where, pid, o = {}) => `<button type="button" class="button small secondary" data-so3-search="${esc(where)}" data-pid="${Number(pid) || 0}"${o.place ? ` data-place="${esc(o.place)}"` : ''}${o.country ? ` data-country="${esc(o.country)}"` : ''} title="Ouvre la recherche dans ton navigateur, nom et années déjà remplis">${esc(BTN[where] || BTN.fiche)}</button>`;
    const importBtn = (pid, kind = '') => `<button type="button" class="button small secondary" data-so3-import="${esc(kind)}" data-pid="${Number(pid) || 0}" title="Range le document trouvé, crée la source et propose ce qu’il dit">⤒ Importer…</button>`;
    document.addEventListener('click', e => {
        const s = e.target.closest('[data-so3-search]'); if (s) { e.preventDefault(); openSearch({personId: Number(s.dataset.pid) || 0, where: s.dataset.so3Search || 'fiche', place: s.dataset.place || '', country: s.dataset.country || ''}); return; }
        const im = e.target.closest('[data-so3-import]'); if (im) { e.preventDefault(); openImport({personId: Number(im.dataset.pid) || 0, kind: im.dataset.so3Import || undefined}); return; }
        const pl = e.target.closest('[data-so3-paste]'); if (pl) { e.preventDefault(); openPasteText({personId: Number(pl.dataset.pid) || 0}); }
    });
    /** les blocs de la fiche (data-pblock) : une petite ligne de boutons, posée une fois après chaque affichage */
    const BLOCK_WHERE = {military: 'militaire', poilu: 'militaire', voyages: 'emigration', sciences: 'inventeur', education: 'medecin', profiles: 'elu', artist_page: 'artiste'};
    const BLOCK_KIND = {military: 'cicr', poilu: 'cicr', sciences: 'brevet', education: 'these', profiles: 'elu', artist_page: 'joconde', voyages: 'acte'};
    function decorate(root = document) {
        const ws = root.querySelector?.('#workspace') || root; if (!ws?.querySelectorAll) return;
        const cur = A()?.state?.currentPerson?.person; const pid = Number(cur?.id) || 0;
        const ro = document.body.classList.contains('is-kiosk') || Number(cur?.is_locked) === 1 || document.documentElement.classList.contains('ms-open');
        if (pid) ws.querySelectorAll('[data-pblock]').forEach(card => {
            const key = card.dataset.pblock, where = BLOCK_WHERE[key]; if (!where || card.querySelector(':scope .so3-row, :scope .so3-ws')) return;
            const bodyEl = card.querySelector('.card-body'); if (!bodyEl) return;
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
                <details class="so3-wsrub"><summary>Rubriques (${groups.length})</summary><div class="ui-filters">${[`<button type="button" class="is-active" data-so3-wsg="">${i18n("Tout ({n})", {n: rows.length})}</button>`, ...groups.map(g => `<button type="button" class="" data-so3-wsg="${esc(g)}">${esc(g)} (${rows.filter(r => groupOf(r) === g).length})</button>`)].join('')}</div></details>
                <small class="ui-hint" data-so3-wscount></small>`;
            list.before(bar);
            let g = '';
            const apply = () => { const q = S3().fold(bar.querySelector('[data-so3-wsq]').value); let n = 0;
                rows.forEach(r => { const ok = (!g || groupOf(r) === g) && (!q || S3().fold(r.textContent).includes(q)); r.hidden = !ok; if (ok) n++; });
                bar.querySelector('[data-so3-wscount]').textContent = q || g ? i18n('{x} sur {n}', {x: A().plural(n, 'site'), n: rows.length}) : ''; };
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

    ext.sourcesOuvertes3 = {openSearch, openImport, openPasteText, openSettings, btn, importBtn, decorate, enhanceEditors};
})();
