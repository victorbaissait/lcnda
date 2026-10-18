/* LCNDA — 🔬 Les profils « Scientifique » et « Inventeur » (maquette Y de docs/design/profils-et-oeuvres.html), sur le moteur
 * des fiches (docs/TYPES.md) : leur fiche de profil (une par personne), les sections de la page (thèse, postes, publications,
 * filiation académique, académies, missions, nommages, carnets, inventions et brevets, découvertes…), les modèles de départ,
 * l'import des publications (DOI → Crossref, ORCID, HAL ; serveur : lib/sciences.php, sciences_remote) et le bloc de la
 * fiche de la personne. Les profils sont déclarés dans ART.profiles (l'écran « Cette personne était… » les lit).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define || !ART.sci) return;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const SC = ART.sci, U = ART.util, esc = U.esc, lab = SC.lab;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    const span = (a, b) => [a, b].filter(Boolean).join('-');

    /* ═════════ Les fiches de profil ═════════ */
    const SROLE = [['directeur', 'directeur de thèse'], ['codirecteur', 'codirecteur'], ['encadrant', 'encadrant'], ['postdoc', 'post-doctorant'], ['eleve', 'élève, stagiaire']];
    const MROLE = [['directeur', 'directeur de thèse'], ['maitre', 'maître, patron'], ['postdoc', 'post-doc chez'], ['stage', 'stage chez'], ['autre', 'autre']];
    const MKIND = [['mission', '🧭 mission'], ['terrain', '🥾 terrain'], ['conference', '🎤 conférence invitée'], ['congres', '🏛 congrès'], ['cours', '🎓 cours, enseignement'], ['sejour', '✈️ séjour de recherche'], ['autre', '📎 autre']];
    const NAMED = [['espece', '🌿 espèce'], ['asteroide', '🪨 astéroïde'], ['mineral', '💎 minéral'], ['rue', '🛣 rue, place'], ['ecole', '🏫 école, lycée'], ['labo', '🏛 laboratoire, bâtiment'], ['prix', '🏆 prix'], ['lieu', '📍 lieu'], ['autre', '🏷 autre']];
    const NOTEK = [['labo', 'carnets de laboratoire'], ['terrain', 'carnets de terrain'], ['correspondance', 'correspondance'], ['cours', 'notes de cours'], ['autre', 'autre']];
    SC.MKIND = MKIND; SC.NAMED = NAMED;
    ART.define({key: 'profile_scientist', icon: '🔬', label: 'Profil de scientifique', many: 'Profils de scientifique', domain: 'profile', hidden: true, linked: false, profile: 'scientist',
        groups: [
            {key: 'main', label: 'Le scientifique', zone: 'main', fields: [
                {key: 'title', label: 'Nom', type: 'text', star: true, head: true},
                {key: 'disciplines', label: 'Disciplines', type: 'text', star: true, ph: 'Botanique, génétique végétale'},
                {key: 'topics', label: 'Sujets de recherche', type: 'text', star: true, ph: 'orchidées, hybridation, cytologie'},
                {key: 'degree', label: 'Plus haut diplôme', type: 'text', star: true, ph: 'Dr ès sciences 1962'},
                {key: 'pub_total', label: 'Publications en tout', type: 'number', star: true, help: '(si toutes ne sont pas notées ici)'},
                {key: 'cit_total', label: 'Citations en tout', type: 'number', star: false}]},
            {key: 'ids', label: 'Identifiants', icon: '🆔', zone: 'right', fields: [
                {key: 'orcid', label: 'ORCID', type: 'ident', star: true, ph: '0000-0002-1825-0097', href: v => /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(v) ? `https://orcid.org/${v}` : ''},
                {key: 'idref', label: 'IdRef', type: 'ident', star: true, ph: '027051374', href: v => /^\d{8}[\dX]$/i.test(v) ? `https://www.idref.fr/${v}` : ''},
                {key: 'hal_id', label: 'HAL (idHal)', type: 'ident', star: true, ph: 'anne-martin', href: v => /^[a-z0-9-]{3,60}$/.test(v) ? `https://cv.hal.science/${v}` : ''},
                {key: 'scholar', label: 'Google Scholar', type: 'url', star: true},
                {key: 'wikidata', label: 'Wikidata', type: 'ident', star: false, ph: 'Q42', href: v => /^Q\d+$/.test(v) ? `https://www.wikidata.org/wiki/${v}` : ''},
                {key: 'other_links', label: 'Autres liens', type: 'rows', star: false, addLabel: 'Un lien', cols: [{key: 'label', label: 'Nom', w: 'm'}, {key: 'url', label: 'Adresse', type: 'url', w: 'l'}]}]},
            {key: 'thesis', label: 'Thèse', zone: 'main', fields: [
                {key: 'thesis_title', label: 'Titre', type: 'text', star: true},
                {key: 'thesis_date', label: 'Soutenue', type: 'date', star: true, ph: '14 juin 1962'},
                {key: 'thesis_univ', label: 'Université', type: 'employer', star: true},
                {key: 'thesis_place', label: 'Ville', type: 'place', star: true},
                {key: 'thesis_director', label: 'Directeur de thèse', type: 'person', star: true, roleWord: 'directeur de thèse'},
                {key: 'thesis_codirector', label: 'Codirecteur', type: 'person', star: false, roleWord: 'codirecteur de thèse'},
                {key: 'thesis_jury', label: 'Jury', type: 'people', star: true, addLabel: 'Un membre du jury', rolePh: 'président, rapporteur…', roleWord: 'jury de thèse'},
                {key: 'thesis_mention', label: 'Mention', type: 'text', star: true, ph: 'très honorable'},
                {key: 'thesis_doc', label: 'Le texte', type: 'document', star: true},
                {key: 'thesis_nnt', label: 'theses.fr', type: 'ident', star: true, ph: '1962TOU30012', href: v => /^[0-9A-Z]{8,16}$/.test(v) ? `https://theses.fr/${v}` : ''}]},
            {key: 'career', label: 'Laboratoires et postes', zone: 'main', fields: [{key: 'positions', label: '🏛 Laboratoires et postes', type: 'rows', star: true, addLabel: 'Un poste', focus: 'from',
                cols: [{key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'title', label: 'Poste', w: 'm', ph: 'attachée de recherche'}, {key: 'inst', label: 'Institution, laboratoire', type: SC.cellKind('employer'), w: 'l'}, {key: 'place', label: 'Où', type: 'place', w: 'm'}, {key: 'head', label: 'Direction', type: 'bool', w: 's'}]}]},
            {key: 'lineage', label: 'Filiation académique', zone: 'main', fields: [
                {key: 'mentors', label: '🌳 Maîtres', type: 'rows', star: true, addLabel: 'Un maître', cols: [{key: 'who', label: 'Qui', type: 'person', w: 'l'}, {key: 'mrole', label: 'Pour elle, lui', type: 'select', choices: MROLE, w: 's'}, {key: 'year', label: 'Année', w: 's'}]},
                {key: 'students', label: '🌱 Élèves, doctorants', type: 'rows', star: true, addLabel: 'Un élève', cols: [{key: 'who', label: 'Qui', type: 'person', w: 'l'}, {key: 'year', label: 'Thèse en', w: 's'}, {key: 'srole', label: 'Rôle', type: 'select', choices: SROLE, w: 's'}, {key: 'thesis', label: 'Sujet', w: 'm'}, {key: 'became', label: 'Devenu', w: 'm', ph: 'professeur à Lyon'}]},
                {key: 'students_total', label: 'Doctorants en tout', type: 'number', star: false},
                {key: 'collaborators', label: '🤝 Collaborations', type: 'people', star: true, addLabel: 'Un collaborateur', rolePh: 'cytologie, terrain au Liban…', roleWord: 'collaboration'}]},
            {key: 'missions', label: 'Missions et conférences', zone: 'main', fields: [{key: 'missions', label: '🧭 Missions · conférences', type: 'rows', star: true, addLabel: 'Une mission, une conférence', focus: 'date',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'kind', label: 'Sorte', type: 'select', choices: MKIND, w: 's'}, {key: 'title', label: 'Quoi', w: 'l', ph: 'mission au Liban (Ophrys)'}, {key: 'place', label: 'Où', type: 'place', w: 'm'}, {key: 'dur', label: 'Durée', w: 's', ph: '3 sem.'}, {key: 'exp', label: 'Expédition', type: 'item', kinds: ['expedition'], w: 'm'}]}]},
            {key: 'honors', label: 'Académies, sociétés, distinctions', zone: 'main', fields: [
                {key: 'academies', label: '🏅 Académies, sociétés', type: 'rows', star: true, addLabel: 'Une académie, une société', cols: [{key: 'name', label: 'Académie, société', type: SC.cellKind('employer'), w: 'l'}, {key: 'from', label: 'Depuis', w: 's'}, {key: 'role', label: 'Rôle', w: 'm', ph: 'présidente 1985'}]},
                {key: 'distinctions', label: '🏆 Distinctions', type: 'rows', star: true, addLabel: 'Une distinction', cols: [{key: 'year', label: 'Année', w: 's'}, {key: 'name', label: 'Distinction', w: 'l', ph: 'médaille d’argent du CNRS'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'named', label: 'Porte son nom', zone: 'main', fields: [{key: 'named_after', label: '🏷 Porte son nom', type: 'rows', star: true, addLabel: 'Une chose à son nom',
                cols: [{key: 'what', label: 'Quoi', type: 'select', choices: NAMED, w: 's'}, {key: 'name', label: 'Nom', w: 'l', ph: 'Ophrys annae, (31042) Annemartin'}, {key: 'year', label: 'Année', w: 's'}, {key: 'disc', label: 'Fiche de la découverte', type: 'item', kinds: ['discovery'], w: 'm'}]}]},
            {key: 'notebooks', label: 'Carnets de laboratoire', zone: 'main', fields: [{key: 'notebooks', label: '📓 Carnets', type: 'rows', star: true, addLabel: 'Des carnets',
                cols: [{key: 'kind', label: 'Sorte', type: 'select', choices: NOTEK, w: 's'}, {key: 'count', label: 'Combien', w: 's', ph: '22'}, {key: 'period', label: 'Période', w: 's', ph: '1958-1996'}, {key: 'where', label: 'Où', w: 'm', ph: 'scannés (médias), archives de l’INRA'}]}]},
            {key: 'funding', label: 'Financements', zone: 'main', fields: [{key: 'funding', label: '💶 Financements', type: 'rows', star: false, addLabel: 'Un financement',
                cols: [{key: 'funder', label: 'Financeur', w: 'm'}, {key: 'program', label: 'Programme', w: 'm'}, {key: 'years', label: 'Années', w: 's'}, {key: 'amount', label: 'Montant', type: 'money', w: 's'}]}]},
            {key: 'bio', label: 'Récit de carrière', icon: '📝', zone: 'main', fields: [{key: 'bio', label: 'Récit de carrière', type: 'longtext', star: true, rows: 6}]}],
    });
    ART.define({key: 'profile_inventor', icon: '💡', label: 'Profil d’inventeur', many: 'Profils d’inventeur', domain: 'profile', hidden: true, linked: false, profile: 'inventor',
        groups: [{key: 'main', label: 'L’inventeur', zone: 'main', fields: [
            {key: 'title', label: 'Nom', type: 'text', star: true, head: true},
            {key: 'domains', label: 'Domaines', type: 'text', star: true, ph: 'outillage agricole, mécanique'},
            {key: 'workshop_name', label: 'Atelier', type: 'text', star: true, ph: 'Forge Martin'},
            {key: 'workshop', label: 'Lieu de l’atelier', type: 'place', star: true},
            {key: 'trade', label: 'Métier', type: 'text', star: true, ph: 'forgeron, mécanicien'},
            {key: 'associations', label: 'Associations d’inventeurs', type: 'text', star: true, ph: 'Association des inventeurs et fabricants français'},
            {key: 'bio', label: 'Récit', type: 'longtext', star: true, rows: 6}]}],
    });

    /* ═════════ Les profils (l'écran « Cette personne était… » les lit) ═════════ */
    ART.profiles = ART.profiles || {};
    const count = (st, k) => st.of(k).length;
    ART.profiles.scientist = {key: 'scientist', label: 'Scientifique', icon: '🔬', color: '#a87900', group: 'Savoir', type: 'profile_scientist', kinds: ['paper', 'discovery'],
        hint: 'thèse, postes, publications, élèves, académies, missions, nommages, découvertes', models: ['scientifique'],
        summary: st => { const d = st.of('profile_scientist')[0]?.data || {}, np = Math.max(count(st, 'paper'), Number(d.pub_total) || 0); return [d.degree, np && plural(np, 'publication'), count(st, 'invention') && plural(count(st, 'invention'), 'invention'), count(st, 'discovery') && plural(count(st, 'discovery'), 'découverte'), (d.students || []).length && plural(Number(d.students_total) || d.students.length, 'doctorant')].filter(Boolean).join(' · '); },
        timeline: st => [...(st.of('profile_scientist')[0]?.data?.positions || []).map(p => ({from: U.yearOf(p.from), to: U.yearOf(p.to), label: p.title || SC.refTitle(p.inst, 'empid')})), ...st.of('discovery').map(it => ({from: it.year, label: it.title}))]};
    ART.profiles.inventor = {key: 'inventor', label: 'Inventeur', icon: '💡', color: '#e1a500', group: 'Savoir', type: 'profile_inventor', kinds: ['invention'],
        hint: 'inventions, brevets pays par pays, prototypes, licences, objets fabriqués, concours', models: ['inventeur'],
        summary: st => { const l = st.of('invention'), np = l.reduce((a, it) => a + (it.data.patents || []).length, 0); return [l.length && plural(l.length, 'invention'), np && plural(np, 'brevet')].filter(Boolean).join(' · '); },
        timeline: st => st.of('invention').map(it => ({from: it.year, label: it.title}))};
    ART.profiles.explorer = {key: 'explorer', label: 'Explorateur', icon: '🧭', color: '#0aa1a8', group: 'Sport et aventure', type: 'profile_explorer', kinds: ['expedition'],
        hint: 'expéditions sur la carte, membres, premières, collectes, récits, toponymes, sociétés', models: ['explorateur'],
        summary: st => { const l = st.of('expedition'); return [l.length && plural(l.length, 'expédition'), l.reduce((a, it) => a + (it.data.firsts || []).length, 0) && plural(l.reduce((a, it) => a + (it.data.firsts || []).length, 0), 'première')].filter(Boolean).join(' · '); },
        timeline: st => st.of('expedition').map(it => { const ys = String(it.data.dates || it.year || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || []; return {from: ys[0] || it.year, to: ys[ys.length - 1], label: it.title}; })};

    /* ═════════ Les sections de la page ═════════ */
    const SCI = ['scientist'], INV = ['inventor', 'scientist'];
    const me = C => ({pid: C.pid, title: C.store.name});
    const isMe = (C, r) => Number(r?.pid) === Number(C.pid) || (!r?.pid && fold(r?.txt || r?.pname) === fold(C.store.name));
    const fem = C => C.store.person?.gender === 'female';
    const ids = d => [['🆔', 'ORCID', /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(d.orcid || '') ? `https://orcid.org/${d.orcid}` : ''], ['📖', 'IdRef', /^\d{8}[\dX]$/i.test(d.idref || '') ? `https://www.idref.fr/${d.idref}` : ''],
        ['📚', 'Google Scholar', SC.safeUrl(d.scholar)], ['📄', 'HAL', /^[a-z0-9-]{3,60}$/.test(d.hal_id || '') ? `https://cv.hal.science/${d.hal_id}` : ''], ['📖', 'Wikidata', /^Q\d+$/.test(d.wikidata || '') ? `https://www.wikidata.org/wiki/${d.wikidata}` : ''],
        ...(d.other_links || []).map(l => ['🔗', l.label || 'Lien', SC.safeUrl(l.url)])].filter(x => x[2]).map(([i, l, u]) => SC.extLink(u, l, i)).join('');
    SC.section('sci_identity', {icon: '🧪', label: 'Disciplines et domaines', w: 'ligne', profiles: SCI, render: C => { const d = SC.pdata(C, 'scientist'), sum = ART.profiles.scientist.summary(C.store);
        const body = `${d.disciplines ? `<p class="sc-eyebrow">🔬 ${esc(String(d.disciplines).toLocaleUpperCase('fr-FR'))}</p>` : ''}${d.topics ? `<p>${esc(d.topics)}</p>` : ''}${sum ? `<p class="ar-g">${esc(sum)}</p>` : ''}${ids(d) ? `<div class="sc-chips">${ids(d)}</div>` : ''}`;
        return {body: body || '<p class="muted">Disciplines, sujets, ORCID, IdRef… : « … » pour les écrire.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_thesis', {icon: '🎓', label: 'Thèse', w: '½', profiles: SCI, render: C => { const p = SC.prof(C, 'scientist'), d = p?.data || {}, ctx = p ? ART.ctx(C.store, p) : null;
        const line = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : ''; const jury = ART.normPeople(d.thesis_jury);
        const nnt = /^[0-9A-Z]{8,16}$/.test(d.thesis_nnt || '') ? SC.extLink(`https://theses.fr/${d.thesis_nnt}`, 'theses.fr ↗', '🎓') : '', doc = ART.mediaOf(d.thesis_doc);
        const body = p && (d.thesis_title || d.thesis_date) ? `<dl class="ar-dl">${line('Titre', d.thesis_title ? `« ${esc(d.thesis_title)} »` : '')}${line('Soutenue', [esc(d.thesis_date || ''), SC.refChip(d.thesis_univ, 'employer'), U.placeChip(d.thesis_place)].filter(Boolean).join(' · '))}${line('Directeur', [d.thesis_director && U.personChip(d.thesis_director, '', ctx), d.thesis_codirector && U.personChip(d.thesis_codirector, 'codirecteur', ctx)].filter(Boolean).join(' '))}${line('Jury', jury.length ? `${jury.map(r => U.personChip(r, r.role, ctx)).join(' ')}${d.thesis_mention ? ` · mention ${esc(d.thesis_mention)}` : ''}` : d.thesis_mention ? `mention ${esc(d.thesis_mention)}` : '')}${line('Texte', [doc ? `<span class="ar-ochip"><i>📄</i>${esc(doc.title || doc.f)}</span>` : '', nnt].filter(Boolean).join(' '))}</dl>` : '';
        return {body: body || '<p class="muted">Titre, date, université, directeur, jury : « … » pour l’écrire.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_positions', {icon: '🏛', label: 'Laboratoires et postes', w: '½', profiles: SCI, render: C => { const l = SC.pdata(C, 'scientist').positions || [];
        return {count: l.length, body: l.length ? `<div class="ar-scroll"><table class="ar-t"><tbody>${l.map(r => `<tr><td>${esc(span(r.from, r.to))}</td><td>${r.head ? `<b>${esc(r.title || '')}</b>` : esc(r.title || '')}</td><td>${typeof r.inst === 'object' ? SC.refChip(r.inst, 'employer') : esc(r.inst || '')}${r.place ? ` ${U.placeChip(r.place)}` : ''}</td></tr>`).join('')}</tbody></table></div><small class="ar-g">les institutions sont des fiches Employeurs</small>` : '<p class="muted">Aucun poste noté.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_pubs', {icon: '📚', label: 'Publications', w: 'ligne', profiles: SCI, render: C => { const st = C.store, l = ART.sortItems ? ART.sortItems(st.of('paper'), 'year') : st.of('paper'), d = SC.pdata(C, 'scientist'), ctx = ART.ctx(st, {});
        const cit = l.reduce((a, it) => a + (U.num(it.data.citations) || 0), 0), total = Math.max(l.length, Number(d.pub_total) || 0), cits = Math.max(cit, Number(d.cit_total) || 0);
        const co = it => { const ppl = ART.normPeople(it.data.authors).filter(r => !isMe(C, r)); return ppl.length > 2 ? `${ppl.slice(0, 2).map(r => U.personChip(r, '', ctx)).join('')}<span class="ar-g">+ ${ppl.length - 2}</span>` : ppl.map(r => U.personChip(r, '', ctx)).join(''); };
        return {count: [plural(total, 'publication'), cits && plural(cits, 'citation')].filter(Boolean).join(' · '),
            body: l.length ? `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Année</th><th>Titre</th><th>Revue</th><th>Co-auteurs</th><th class="d">Cit.</th></tr></thead><tbody>${l.slice(0, 12).map(it => `<tr class="is-click" data-ar-row-open="${it.id}"><td>${esc(it.data.year || it.year || '')}</td><td><b>${esc(it.title)}</b></td><td>${esc([SC.journalOf(it), it.data.volume].filter(Boolean).join(' '))}</td><td>${co(it)}</td><td class="d">${esc(it.data.citations ?? '')}</td></tr>`).join('')}</tbody></table></div>${l.length > 12 ? `<p class="muted">… et ${l.length - 12} de plus (« Tout voir »).</p>` : ''}` : SC.empty('Aucune publication pour l’instant : importe-les par DOI, ORCID ou HAL, ou écris-les une par une.'),
            actions: `<button type="button" class="button small secondary" data-sc-import>📥 Importer (DOI, ORCID, HAL)</button>${SC.newBtn('paper', 'Nouvelle')}${SC.allBtn('paper')}`}; }});
    SC.section('sci_inventions', {icon: '💡', label: 'Inventions · 📜 brevets', w: '½', profiles: INV, render: C => { const l = ART.sortItems ? ART.sortItems(C.store.of('invention'), 'year') : C.store.of('invention');
        return {count: l.length, body: l.length ? l.map(it => { const p = it.data.patents || []; return `<div class="sc-line">💡 <button type="button" class="ar-linkbtn" data-ar-open="${it.id}"><b>${esc(it.title)}</b></button> <small class="ar-g">${esc([it.data.date || it.year, p.length && `${plural(p.length, 'brevet')} (${[...new Set(p.map(x => x.country).filter(Boolean))].map(SC.flag).join(' ')})`].filter(Boolean).join(' · '))}</small></div>`; }).join('') : SC.empty('Aucune invention pour l’instant.', 'invention', 'Nouvelle invention'),
            actions: `${l.length ? SC.newBtn('invention', 'Nouvelle') : ''}${SC.allBtn('invention')}`}; }});
    SC.section('sci_discoveries', {icon: '🔬', label: 'Découvertes', w: '½', profiles: ['scientist', 'explorer'], render: C => { const l = ART.sortItems ? ART.sortItems(C.store.of('discovery'), 'year') : C.store.of('discovery');
        return {count: l.length, body: l.length ? l.map(it => { const k = SC.dkOf(it.data.dkind); return `<div class="sc-line">${esc(k[1])} <button type="button" class="ar-linkbtn" data-ar-open="${it.id}"><b>${esc(it.title)}</b></button> <small class="ar-g">${esc([it.data.date || it.year, k[2], it.data.recognition === 'contestee' ? 'contestée' : ''].filter(Boolean).join(' · '))}</small></div>`; }).join('') : SC.empty('Aucune découverte pour l’instant.', 'discovery', 'Nouvelle découverte'),
            actions: `${l.length ? SC.newBtn('discovery', 'Nouvelle') : ''}${SC.allBtn('discovery')}`}; }});
    /** la filiation : ses maîtres ↓ elle, lui ↓ ses élèves (ceux notés ici, et ceux de la base qui la citent) */
    SC.section('sci_genealogy', {icon: '🌳', label: 'Filiation académique', w: '½', profiles: SCI, render: C => { const st = C.store, p = SC.prof(C, 'scientist'), d = p?.data || {}, ctx = ART.ctx(st, p || {});
        const cited = st.cited || [], key = r => r.pid ? `p${r.pid}` : `n${fold(r.txt || r.pname)}`;
        const mentors = new Map(); if (U.person(d.thesis_director)) mentors.set(key(U.person(d.thesis_director)), {r: U.person(d.thesis_director), why: fem(C) ? 'son directeur de thèse' : 'son directeur de thèse'});
        (d.mentors || []).forEach(m => { const r = U.person(m.who); if (r && !mentors.has(key(r))) mentors.set(key(r), {r, why: [lab(MROLE, m.mrole), m.year].filter(Boolean).join(', ')}); });
        cited.filter(c => c.kind === 'profile_scientist' && (c.fields || []).includes('students')).forEach(c => { const r = {pid: c.person_id, title: c.person}; if (!mentors.has(key(r))) mentors.set(key(r), {r, why: 'l’a eu(e) pour élève'}); });
        const students = new Map(); (d.students || []).forEach(s => { const r = U.person(s.who); if (r) students.set(key(r), {r, y: s.year}); });
        cited.filter(c => c.kind === 'profile_scientist' && (c.fields || []).some(f => ['thesis_director', 'thesis_codirector', 'mentors'].includes(f))).forEach(c => { const r = {pid: c.person_id, title: c.person}; if (!students.has(key(r))) students.set(key(r), {r, y: ''}); });
        const ns = Math.max(students.size, Number(d.students_total) || 0);
        if (!mentors.size && !students.size) return {body: '<p class="muted">Son directeur de thèse, ses maîtres, ses élèves : « … » pour les écrire. Les fiches de la base qui la, le citent comme directeur de thèse s’ajoutent toutes seules.</p>', actions: SC.editBtn('scientist')};
        const box = r => `<div class="sc-ent"><b>${r.r.pid ? U.personChip(r.r, '', ctx) : esc(r.r.txt || r.r.title)}</b><small>${esc(r.why || '')}</small></div>`;
        const sl = [...students.values()];
        return {count: ns ? plural(ns, 'élève') : '', body: `<div class="sc-flow">${[...mentors.values()].map(box).join('')}${mentors.size ? `<div class="sc-arr">↓ ${mentors.size > 1 ? 'maîtres de' : 'directeur de thèse de'}</div>` : ''}<div class="sc-ent core"><b>${esc(st.name)}</b><small>${esc(d.thesis_date ? `thèse ${U.yearOf(d.thesis_date) || d.thesis_date}` : '')}</small></div>${sl.length ? `<div class="sc-arr">↓ ${fem(C) ? 'directrice' : 'directeur'} de thèse de (${ns})</div><div class="sc-chips">${sl.slice(0, 8).map(s => `${U.personChip(s.r, s.y || '', ctx)}`).join('')}${ns > Math.min(8, sl.length) ? `<span class="ar-chip is-free">+ ${ns - Math.min(8, sl.length)}</span>` : ''}</div>` : ''}</div>`, actions: SC.editBtn('scientist')}; }});
    SC.section('sci_collab', {icon: '🤝', label: 'Collaborations', w: '⅓', profiles: SCI, render: C => { const st = C.store, ctx = ART.ctx(st, {}), by = new Map(), add = (r, w, role = '') => { const k = r.pid ? `p${r.pid}` : `n${fold(r.txt || r.pname)}`; if (!by.has(k)) by.set(k, {r, n: 0, role}); const x = by.get(k); x.n += w; if (role && !x.role) x.role = role; };
        ART.normPeople(SC.pdata(C, 'scientist').collaborators).forEach(r => add(r, 0, r.role));
        st.of('paper').forEach(it => ART.normPeople(it.data.authors).forEach(r => { if (!isMe(C, r)) add(r, 1); }));
        const l = [...by.values()].sort((a, b) => b.n - a.n).slice(0, 18);
        return {count: by.size, body: l.length ? l.map(x => `<div>${U.personChip(x.r, x.role, ctx)}${x.n ? ` <small class="ar-g">${esc(plural(x.n, 'publication'))} ensemble</small>` : ''}</div>`).join('') : '<p class="muted">Les co-auteurs de ses publications s’ajoutent tout seuls.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_funding', {icon: '💶', label: 'Financements', w: '⅓', profiles: SCI, render: C => { const l = SC.pdata(C, 'scientist').funding || [];
        return {count: l.length, body: l.length ? l.map(r => `<div class="sc-line">${esc([r.years, r.funder, r.program].filter(Boolean).join(' · '))}${r.amount ? ` <span class="ar-price">${esc(U.money(r.amount))}</span>` : ''}</div>`).join('') : '<p class="muted">Aucun financement noté.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_missions', {icon: '🧭', label: 'Missions · conférences', w: '½', profiles: SCI, render: C => { const l = SC.pdata(C, 'scientist').missions || [], n = k => l.filter(m => (m.kind || 'mission') === k).length;
        const sum = [n('conference') + n('congres') && plural(n('conference') + n('congres'), 'conférence'), n('mission') + n('terrain') && plural(n('mission') + n('terrain'), 'mission'), n('cours') && plural(n('cours'), 'cours', 'cours'), n('sejour') && plural(n('sejour'), 'séjour')].filter(Boolean).join(' · ');
        return {count: l.length, body: l.length ? `${l.map(m => `<div class="sc-line">${esc(m.date || '?')} · ${esc(m.title ? `${String(lab(MKIND, m.kind || 'mission')).split(' ')[0]} ${m.title}` : lab(MKIND, m.kind || 'mission'))}${m.place ? ` ${U.placeChip(m.place)}` : ''}${m.dur ? ` · ${esc(m.dur)}` : ''}${U.ref(m.exp) ? ` → ${U.refChip(m.exp, '🧭')}` : ''}</div>`).join('')}<small class="ar-g">${esc(sum)}</small>` : '<p class="muted">Missions, terrains, conférences invitées : « … » pour les écrire.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_academies', {icon: '🏅', label: 'Académies, distinctions', w: '⅓', profiles: SCI, render: C => { const d = SC.pdata(C, 'scientist'), a = d.academies || [], di = d.distinctions || [];
        const body = `${a.map(r => `<div class="sc-line">${typeof r.name === 'object' ? SC.refChip(r.name, 'employer') : esc(r.name || '')}${r.role || r.from ? ` <small class="ar-g">${esc([r.role, r.from && `(${r.from})`].filter(Boolean).join(' '))}</small>` : ''}</div>`).join('')}${di.map(r => `<div class="sc-line">🏆 ${esc([r.year, r.name].filter(Boolean).join(' · '))}${r.note ? ` <small class="ar-g">${esc(r.note)}</small>` : ''}</div>`).join('')}`;
        return {count: a.length + di.length, body: body || '<p class="muted">Aucune académie notée.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_named', {icon: '🏷', label: 'Porte son nom', w: '⅓', profiles: ['scientist', 'explorer'], render: C => { const own = SC.pdata(C, 'scientist').named_after || [], seen = new Set(own.map(r => U.ref(r.disc)?.iid).filter(Boolean));
        const cited = (C.store.cited || []).filter(c => c.kind === 'discovery' && (c.fields || []).includes('honoree') && !seen.has(c.id));
        const mine = C.store.of('discovery').filter(it => isMe(C, U.person(it.data.honoree)) && !seen.has(it.id));
        const body = `${own.map(r => `<div class="sc-line">${esc(String(lab(NAMED, r.what || 'autre')).split(' ')[0])} <i>${esc(r.name || '')}</i>${r.year ? ` (${esc(r.year)})` : ''}${U.ref(r.disc)?.iid ? ` ${U.refChip(r.disc, '🔬')}` : ''}</div>`).join('')}${[...mine.map(it => ({id: it.id, title: it.data.sci_name || it.title, year: it.year})), ...cited.map(c => ({id: c.id, title: c.title, year: c.year, other: c.person}))].map(x => `<div class="sc-line">🔬 <button type="button" class="ar-linkbtn" data-ar-open="${x.id}"><i>${esc(x.title)}</i></button>${x.year ? ` (${esc(x.year)})` : ''}${x.other ? ` <small class="ar-g">nommée par ${esc(x.other)}</small>` : ''}</div>`).join('')}`;
        return {count: own.length + cited.length + mine.length, body: body || '<p class="muted">Espèces, astéroïdes, rues, prix à son nom : « … » pour les écrire. Les découvertes de la base « en l’honneur de » cette personne s’ajoutent toutes seules.</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_notebooks', {icon: '📓', label: 'Carnets de laboratoire', w: '⅓', profiles: SCI, render: C => { const l = SC.pdata(C, 'scientist').notebooks || [];
        return {count: l.length, body: l.length ? l.map(r => `<div class="sc-line">${esc([r.count && `${r.count} ${lab(NOTEK, r.kind || 'labo')}`, !r.count && lab(NOTEK, r.kind || 'labo'), r.where && `(${r.where})`, r.period && `· ${r.period}`].filter(Boolean).join(' '))}</div>`).join('') : '<p class="muted">Carnets de laboratoire ou de terrain : « … » pour les noter (les scans vont dans les médias).</p>', actions: SC.editBtn('scientist')}; }});
    SC.section('sci_bio', {icon: '📝', label: 'Récit de carrière', w: 'ligne', profiles: SCI, render: C => { const b = SC.pdata(C, 'scientist').bio; return {body: b ? `<div class="ar-long">${esc(b).replace(/\n/g, '<br>')}</div>` : '<p class="muted">« … » pour l’écrire.</p>', actions: SC.editBtn('scientist')}; }});

    /* — inventeur — */
    const INVO = ['inventor'];
    const allPatents = C => C.store.of('invention').flatMap(it => (it.data.patents || []).map(p => ({...p, it})));
    SC.section('inv_workshop', {icon: '🔧', label: 'L’inventeur et son atelier', w: '⅓', profiles: INVO, render: C => { const d = SC.pdata(C, 'inventor');
        const body = [d.trade && `<div class="sc-line">${esc(d.trade)}</div>`, (d.workshop_name || d.workshop) && `<div class="sc-line">🔧 ${esc(d.workshop_name || '')} ${U.placeChip(d.workshop)}</div>`, d.domains && `<div class="sc-line ar-g">${esc(d.domains)}</div>`, d.associations && `<div class="sc-line">${esc(d.associations)}</div>`, d.bio && `<div class="ar-long">${esc(d.bio).replace(/\n/g, '<br>')}</div>`].filter(Boolean).join('');
        return {body: body || '<p class="muted">Métier, atelier, domaines : « … » pour les écrire.</p>', actions: SC.editBtn('inventor')}; }});
    SC.section('inv_patents', {icon: '📜', label: 'Tous ses brevets', w: 'ligne', profiles: INVO, render: C => { const l = allPatents(C), c = new Set(l.map(p => p.country).filter(Boolean));
        return {count: l.length ? `${plural(l.length, 'brevet')} · ${plural(c.size, 'pays', 'pays')}` : '', body: l.length ? `<div class="ar-scroll"><table class="ar-t sc-ptable"><thead><tr><th>Invention</th><th>Pays</th><th>N°</th><th>Dépôt</th><th>Délivrance</th><th>Statut</th></tr></thead><tbody>${l.map(p => `<tr class="is-click ${p.main ? 'is-me' : ''}" data-ar-row-open="${p.it.id}"><td>${esc(p.it.title)}</td><td>${SC.flag(p.country)} ${esc(SC.cname(p.country))}</td><td>${esc(SC.patentNo(p))}</td><td>${esc(p.filed || '—')}</td><td>${esc(p.granted || '—')}</td><td>${SC.pBadge(p)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun brevet : sur la fiche d’une invention, « 📜 Brevets » → une ligne par pays.</p>'}; }});
    SC.section('inv_licences', {icon: '🏭', label: 'Licences et exploitation', w: '½', profiles: INVO, render: C => { const l = C.store.of('invention').flatMap(it => (it.data.licences || []).map(r => ({...r, it})));
        return {count: l.length, body: l.length ? `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Entreprise</th><th>Invention</th><th>Années</th><th>Fabriqués</th></tr></thead><tbody>${l.map(r => `<tr><td>${typeof r.company === 'object' ? SC.refChip(r.company, 'employer') : esc(r.company || '')}${r.country ? ` <small class="ar-g">${esc(r.country)}</small>` : ''}</td><td><button type="button" class="ar-linkbtn" data-ar-open="${r.it.id}">${esc(r.it.title)}</button></td><td>${esc(r.years || '')}</td><td>${esc(r.made || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune licence notée.</p>'}; }});
    SC.section('inv_prizes', {icon: '🏆', label: 'Concours d’inventeurs', w: '⅓', profiles: INVO, render: C => { const l = C.store.of('invention').flatMap(it => (it.data.prizes || []).map(r => ({...r, it})));
        return {count: l.length, body: l.length ? l.map(r => `<div class="sc-line">🏆 ${esc([r.prize, r.year].filter(Boolean).join(' '))}${r.rank ? ` · ${esc(r.rank)}` : ''} <small class="ar-g">${esc(r.it.title)}</small></div>`).join('') : '<p class="muted">Concours Lépine, foires, expositions : sur la fiche de chaque invention.</p>'}; }});
    SC.section('inv_objects', {icon: '📦', label: 'Objets fabriqués', w: '⅓', profiles: INVO, render: C => { const l = C.store.of('invention').flatMap(it => (it.data.objects || []).map(r => ({...r, it})));
        return {count: l.length, body: l.length ? l.map(r => `<div class="sc-line">📦 ${U.ref(r.obj)?.iid ? U.refChip(r.obj, '📦') : esc(r.name || '')}${r.year ? ` · ${esc(r.year)}` : ''} <small class="ar-g">${esc([r.where, r.it.title].filter(Boolean).join(' · '))}</small></div>`).join('') : '<p class="muted">Aucun objet noté.</p>'}; }});

    /* les modèles de départ (⚙️ Organiser la page → « Modèle : … ») */
    Object.assign(ART.models, {
        scientifique: {label: 'Scientifique', order: ['sci_identity', 'sci_thesis', 'sci_positions', 'sci_pubs', 'sci_inventions', 'sci_discoveries', 'sci_genealogy', 'sci_collab', 'sci_funding', 'sci_missions', 'sci_academies', 'sci_named', 'sci_notebooks', 'sci_bio'], hidden: ['sci_funding']},
        inventeur: {label: 'Inventeur', order: ['sci_inventions', 'inv_patents', 'inv_workshop', 'inv_licences', 'inv_prizes', 'inv_objects', 'sci_discoveries'], hidden: []},
    });

    /* ═════════ 📥 Importer des publications : DOI (Crossref), ORCID, HAL ═════════ */
    const remote = async q => (await A().api('sciences_remote', {}, {method: 'POST', body: q})).result;
    const doiKey = d => String(d || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').trim();
    const titleKey = t => fold(t).replace(/\s/g, '').slice(0, 80);
    /** l'auteur, c'est elle ou lui ? (« Anne Martin », « A. Martin », « Martin, Anne ») */
    SC.isSelf = (store, name) => { const p = store.person || {}, last = fold(p.last_name), first = fold(p.first_name), n = fold(String(name || '').replace(/,/g, ' ')); if (!last || !n) return false;
        const w = n.split(' '); if (!w.includes(last)) return false; const rest = w.filter(x => x !== last); return !rest.length || rest.some(x => x === first || x === first.split(' ')[0] || (x.length === 1 && x === first[0])); };
    SC.pubToData = (store, p, linkSelf = true) => ({title: p.title || 'Sans titre', year: p.year || '', date: p.date && p.date.length > 4 ? p.date : '', ptype: p.ptype || 'article', journal: p.journal ? {txt: p.journal} : null, journal_txt: p.journal || '', volume: p.volume || '', issue: p.issue || '', pages: p.pages || '',
        doi: p.doi || '', hal: p.hal || '', url: p.url || '', citations: p.citations ?? '', abstract: p.abstract || '', authors: (p.authors || []).map(n => linkSelf && SC.isSelf(store, n) ? {pid: store.pid, title: store.name} : {pname: n}), source_import: p.source || ''});
    SC.openPubImport = C => {
        const st = C.store, d = SC.pdata(C, 'scientist');
        const have = () => ({doi: new Set(st.of('paper').map(it => doiKey(it.data.doi)).filter(Boolean)), t: new Set(st.of('paper').map(it => titleKey(it.title)))});
        ext.openDialog({eyebrow: 'PUBLICATIONS', title: `📥 Importer les publications de ${st.name}`, wide: true, submitLabel: 'Importer les publications cochées',
            body: `<div class="sc-imp"><span class="segmented" data-src><button type="button" class="is-active" data-s="crossref">DOI</button><button type="button" data-s="orcid">ORCID</button><button type="button" data-s="hal">HAL</button></span>
                <p class="ar-note" data-help></p><div class="sc-impq"><span data-qbox></span><button type="button" class="button small" data-go>Chercher</button></div>
                <label class="checkbox-line"><input type="checkbox" data-nodup checked> Ne pas reprendre celles qui sont déjà là (même DOI ou même titre)</label>
                <label class="checkbox-line"><input type="checkbox" data-self checked> Relier ${esc(st.name)} comme auteur quand son nom y est</label>
                <label class="checkbox-line" data-cr hidden style="display:none"><input type="checkbox" data-crossref checked> Compléter par Crossref (auteurs, pages, citations) quand il y a un DOI</label>
                <div data-res class="sc-cands"></div><p class="muted" data-prog></p></div>`,
            onOpen: dg => {
                let src = 'crossref';
                const qbox = dg.querySelector('[data-qbox]'), res = dg.querySelector('[data-res]'), help = dg.querySelector('[data-help]');
                const HELP = {crossref: 'Colle un ou plusieurs DOI (un par ligne), ou leurs adresses https://doi.org/… : titre, revue, auteurs, pages et citations viennent de Crossref.',
                    orcid: 'L’identifiant ORCID (16 chiffres, ex. 0000-0002-1825-0097) ou l’adresse orcid.org/… : toute la liste des travaux déclarés.',
                    hal: 'Le nom de l’auteur (ex. Anne Martin) ou son identifiant HAL (idHal, ex. anne-martin) : les dépôts de l’archive ouverte HAL.'};
                const setSrc = s => { src = s; dg.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('is-active', b.dataset.s === s)); help.textContent = HELP[s]; res.innerHTML = ''; res._c = [];
                    qbox.innerHTML = s === 'crossref' ? '<textarea class="ar-in" rows="3" data-q placeholder="10.1038/251123a0"></textarea>' : `<input class="ar-in" data-q value="${esc(s === 'orcid' ? d.orcid || '' : d.hal_id || st.name)}" placeholder="${s === 'orcid' ? '0000-0002-1825-0097' : 'Anne Martin, anne-martin'}">`;
                    const cr = dg.querySelector('[data-cr]'); cr.hidden = s !== 'orcid'; cr.style.display = s === 'orcid' ? '' : 'none'; dg.querySelector('[data-q]').focus(); };
                dg.querySelector('[data-src]').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) setSrc(b.dataset.s); });
                const go = async () => { const q = dg.querySelector('[data-q]').value.trim(); if (!q) { A().toast('Écris d’abord ce qu’il faut chercher.', 'error'); return; } const btn = dg.querySelector('[data-go]'); btn.disabled = true; res.innerHTML = '<p class="muted"><span class="ui-spinner"></span> Recherche…</p>';
                    try { const r = await remote(src === 'crossref' ? {source: src, dois: q} : src === 'orcid' ? {source: src, id: q} : {source: src, q}); const H = have();
                        res._c = (r.items || []).filter(p => p.title);
                        res.innerHTML = res._c.length ? `<label class="checkbox-line"><input type="checkbox" data-all checked> Tout cocher (${res._c.length})</label>${res._c.map((p, i) => { const dup = (p.doi && H.doi.has(doiKey(p.doi))) || H.t.has(titleKey(p.title));
                            return `<label class="checkbox-line sc-cand ${dup ? 'is-dup' : ''}"><input type="checkbox" data-c="${i}" ${dup ? '' : 'checked'}><span><b>${esc(p.title)}</b><small class="ar-g">${esc([p.year, p.journal, p.volume, p.pages, p.authors?.length ? `${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ` + ${p.authors.length - 3}` : ''}` : '', p.doi && `DOI ${p.doi}`].filter(Boolean).join(' · '))}</small>${dup ? '<em class="ar-badge w">déjà là</em>' : ''}</span></label>`; }).join('')}${(r.errors || []).length ? `<p class="error-text">⚠️ ${r.errors.map(esc).join('<br>⚠️ ')}</p>` : ''}`
                            : `<p class="muted">Rien trouvé.${(r.errors || []).length ? `<br>${r.errors.map(esc).join('<br>')}` : ''}</p>`; }
                    catch (er) { res.innerHTML = `<p class="error-text">⛔ ${esc(er.message)}</p>`; } finally { btn.disabled = false; } };
                dg.querySelector('[data-go]').addEventListener('click', go);
                dg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[data-q]')) { e.preventDefault(); go(); } });
                res.addEventListener('change', e => { if (e.target.matches('[data-all]')) res.querySelectorAll('[data-c]').forEach(c => { c.checked = e.target.checked; }); });
                setSrc('crossref');
            },
            onSubmit: async f => {
                const res = f.querySelector('[data-res]'), all = res._c || [], chosen = [...res.querySelectorAll('[data-c]:checked')].map(c => all[Number(c.dataset.c)]).filter(Boolean);
                if (!chosen.length) { A().toast('Coche les publications à importer.', 'error'); return false; }
                try { await SC.needProfile(st, 'paper'); } catch (_) { return false; }
                const nodup = f.querySelector('[data-nodup]').checked, self = f.querySelector('[data-self]').checked, cr = !f.querySelector('[data-cr]').hidden && f.querySelector('[data-crossref]').checked, prog = f.querySelector('[data-prog]');
                const H = have(); let list = chosen.filter(p => !nodup || !((p.doi && H.doi.has(doiKey(p.doi))) || H.t.has(titleKey(p.title)))); const skipped = chosen.length - list.length;
                if (cr) { const dois = list.filter(p => p.doi).map(p => p.doi); for (let i = 0; i < dois.length; i += 25) { prog.textContent = `Crossref : ${Math.min(i + 25, dois.length)} / ${dois.length}…`; try { const r = await remote({source: 'crossref', dois: dois.slice(i, i + 25).join('\n')}); (r.items || []).forEach(x => { const k = list.findIndex(p => doiKey(p.doi) === doiKey(x.doi)); if (k >= 0) list[k] = {...list[k], ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)))}; }); } catch (_) {} } }
                const items = list.map(p => ({kind: 'paper', data: SC.pubToData(st, p, self)}));
                for (let i = 0; i < items.length; i += 20) { prog.textContent = `${Math.min(i + 20, items.length)} / ${items.length}…`; await ART.write('save_items', {person_id: st.pid, items: items.slice(i, i + 20)}); }
                await C.reload(); C.paint(true); A().toast(`${A().plural(items.length, 'publication importée', 'publications importées')}${skipped ? `, ${A().plural(skipped, 'déjà là', 'déjà là')}` : ''}.`);
            }});
    };
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-sc-import]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (C) { e.preventDefault(); SC.openPubImport(C); } });

    /* ═════════ La fiche de la personne : le bloc « 🔬 Sciences, inventions, explorations » ═════════ */
    const KINDS = [['invention', '💡', 'invention', 'Inventions'], ['discovery', '🔬', 'découverte', 'Découvertes'], ['paper', '📄', 'publication', 'Publications'], ['expedition', '🧭', 'expédition', 'Expéditions']];
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.sciences = (index, detail) => {
        const p = detail.person; if (!p) return '';
        const items = (detail.heritage?.artist || []).filter(i => KINDS.some(k => k[0] === i.kind)), profs = [...(p.profiles || detail.heritage?.profiles || [])].map(x => x.profile_key || x);
        const mine = profs.filter(k => ART.profiles[k] && ['inventor', 'scientist', 'explorer'].includes(k));
        if (!items.length && !mine.length) return '';
        const n = k => items.filter(i => i.kind === k).length, sum = KINDS.filter(([k]) => n(k)).map(([k, , w]) => plural(n(k), w)).join(' · ');
        const label = (mine.length ? mine : ['scientist']).map(k => `${ART.profiles[k].icon} ${ART.profiles[k].label}`).join(' · ');
        const cards = items.slice(0, 12).map(it => `<button type="button" class="ar-card" data-ar-item="${it.id}" data-ar-pid="${p.id}">${U.cover(it)}<b>${esc(it.title)}</b><small>${esc(ART.defs[it.kind]?.cardLine?.(it) || it.year || '')}</small></button>`).join('');
        const btns = KINDS.filter(([k]) => n(k) || mine.includes(SC.KIND_PROFILE[k])).map(([k, ic, , many]) => `<button type="button" class="button small secondary" data-ar-open-kind="${k}" data-ar-pid="${p.id}">${ic} ${esc(many)}${n(k) ? ` (${n(k)})` : ''}</button>`).join('');
        return A().card(index, label, items.length || '', `<div class="ar-block"><p>${esc(sum || 'Rien de noté pour l’instant.')}</p>${cards ? `<div class="ar-grid">${cards}</div>` : ''}<div class="ar-row"><button type="button" class="button small" data-ar-open-kind="page" data-ar-pid="${p.id}">Ouvrir sa page</button>${btns}</div></div>`, 'span-12');
    };
})();
