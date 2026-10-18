/* LCNDA — 🎓 « Diplômes et formation » (maquette AC) : les écoles successives (étapes de scolarité, apprentissage,
 * compagnonnage, formation militaire…), les diplômes (liste prête ou texte libre), les établissements (fiches qui relient),
 * les bulletins et livrets, les photos de classe, les maîtres et les camarades (menu de choix avec rôles).
 * Le bloc de la fiche : frise du parcours, tableau des diplômes, photo de classe et camarades, livrets et bulletins.
 * Noyau : heritage-blocs.js (BL). API : ext.education.listFor(pid) → {steps, diplomas}, ganttHtml(steps), diplomasHtml(list).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, ext = window.LCNDA_EXT || {}, BL = ext.blocs; if (!ART?.define || !BL?.open) return;
    const A = () => window.LCNDA_APP, U = ART.util, esc = U.esc;

    const STYPES = [['ecole', '🏫 École'], ['college', '📘 Collège, cours complémentaire'], ['lycee', '🎒 Lycée'], ['superieur', '🎓 Université, grande école'], ['apprentissage', '🛠 Apprentissage'],
        ['compagnonnage', '🧭 Compagnonnage'], ['militaire', '🎖 Formation militaire'], ['formation', '📚 Formation pro, continue'], ['autre', '✦ Autre']];
    const COLOR = {ecole: 'c-pol', college: 'c-pol', lycee: 'c-pol', superieur: 'c-pol', apprentissage: 'c-inv', compagnonnage: 'c-art', militaire: 'c-gr', formation: 'c-spo', autre: 'c-gr'};
    const BOARD = [['', '—'], ['externe', 'Externe'], ['interne', 'Interne (pensionnaire)'], ['demi', 'Demi-pensionnaire'], ['apprenti', 'Apprenti, en alternance'], ['distance', 'À distance, par correspondance']];
    const DIPLOMAS = [['', '— choisir —'], ['cep', 'Certificat d’études primaires'], ['brevet_elem', 'Brevet élémentaire'], ['brevet_sup', 'Brevet supérieur'], ['bepc', 'BEPC, brevet des collèges'], ['cap', 'CAP'], ['bep', 'BEP'],
        ['bac', 'Baccalauréat'], ['bac_pro', 'Bac professionnel'], ['bts', 'BTS'], ['dut', 'DUT, BUT'], ['licence', 'Licence'], ['master', 'Master, maîtrise, DEA'], ['doctorat', 'Doctorat'], ['grande_ecole', 'Diplôme de grande école'],
        ['pro', 'Diplôme professionnel'], ['permis_b', 'Permis de conduire'], ['permis_bateau', 'Permis bateau'], ['permis_chasse', 'Permis de chasser'], ['pilote', 'Brevet de pilote'], ['militaire', 'Brevet militaire'],
        ['marine', 'Brevet de la marine'], ['secourisme', 'Secourisme (BNS, PSC1…)'], ['langue', 'Diplôme de langue'], ['musique', 'Diplôme de musique (conservatoire)'], ['sport', 'Diplôme sportif (BE, BPJEPS…)'], ['autre', 'Autre (écris-le dans « Diplôme »)']];
    const ETYPES = [['', '—'], ['ecole', 'École primaire'], ['college', 'Collège, cours complémentaire'], ['lycee', 'Lycée'], ['universite', 'Université'], ['grande_ecole', 'Grande école'], ['apprentissage', 'Centre d’apprentissage, chambre des métiers'],
        ['regiment', 'Régiment, école militaire'], ['pension', 'Pension, internat, séminaire'], ['autre', 'Autre']];
    const lab = (l, v) => BL.labelOf(l, v);
    const TEACH = ['instituteur', 'institutrice', 'professeur', 'maître d’apprentissage', 'directeur', 'directrice', 'compagnon', 'instructeur'];
    const MATES = ['camarade', 'ami', 'amie', 'voisin de classe', 'frère', 'sœur', 'cousin', 'cousine'];

    /** les diplômes passés pendant une étape ; les élèves d'un établissement */
    const linked = (ctx, it, field, kinds) => ctx.store.linksTo(it.id, field).map(l => ctx.store.otherOf(l, it.id)).filter(o => o && (!kinds || kinds.includes(o.kind))).sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
    ART.views.bl_step_diplomas = {read: (ctx, it) => { const l = linked(ctx, it, 'step'); return l.length ? `<div class="bl-linkl">${l.map(o => `<button type="button" class="ar-ochip is-link" data-ar-open="${o.id}"><i>🎓</i>${esc(o.title)}${o.year ? ` (${esc(o.year)})` : ''}</button>`).join('')}</div>` : ''; },
        text: (ctx, it) => linked(ctx, it, 'step').map(o => o.title).join(', ')};
    ART.views.bl_school_people = {read: (ctx, it) => { const l = linked(ctx, it, 'school'); if (!l.length) return '<p class="ar-g">Personne de ta base n’y est encore rattaché.</p>';
            return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Années</th><th>Qui</th><th>Étape ou diplôme</th></tr></thead><tbody>${l.map(o => `<tr class="is-click" data-ar-row-open="${o.id}"><td>${esc(o.data?.date || o.year || '')}</td><td>${o.person_id ? BL.chip({pid: o.person_id, title: o.owner || ctx.store.personTitle(o.person_id)}, '', ctx.store) : ''}</td><td>${esc(ART.defs[o.kind]?.icon || '')} ${esc(o.title)}</td></tr>`).join('')}</tbody></table></div>`; },
        meta: (ctx, it) => { const n = linked(ctx, it, 'school').length; return n ? esc(U.plural(n, 'passage')) : ''; }, text: (ctx, it) => U.plural(linked(ctx, it, 'school').length, 'passage')};

    ART.define({key: 'school_step', icon: '🏫', label: 'Étape de scolarité', many: 'Étapes de scolarité', tab: 'Parcours', fem: true, domain: 'blocs', hidden: true,
        eyebrow: it => `Scolarité et formation · ${BL.bare(lab(STYPES, it.data?.stype)) || 'étape'}`,
        newData: () => ({stype: 'ecole'}),
        titleHint: 'Donne un nom à cette étape, ou choisis l’établissement.',
        askWho: 'Le parcours de qui ?',
        beforeSave: d => { if (!String(d.title || '').trim()) d.title = U.refTitle(d.school) || ''; },
        groups: [
            {key: 'main', label: 'L’étape', zone: 'main', fields: [
                {key: 'stype', label: 'Sorte', type: 'pills', choices: STYPES, star: true},
                {key: 'title', label: 'Nom de l’étape', type: 'text', star: true, head: true, ph: 'École de Laguenne, Tour de France des compagnons…'},
                {key: 'school', label: 'Établissement', type: 'item', kinds: ['school'], star: true, help: '(sa fiche réunit tous ceux qui y sont passés)'},
                {key: 'place', label: 'Lieu', type: 'place', star: true},
                {key: 'date', label: 'Années', type: 'text', star: true, ph: '1907 – 1914, sept. 1916 – juin 1919'},
                {key: 'level', label: 'Classe ou niveau', type: 'text', star: true, ph: 'CP → CM2, 2e année, terminale…'},
                {key: 'board', label: 'Interne ou externe', type: 'select', choices: BOARD, star: true},
                {key: 'teachers', label: 'Maîtres et professeurs', short: 'Maîtres', type: 'cast', star: true, roles: TEACH, roleWord: 'professeur'},
                {key: 'mates', label: 'Camarades', type: 'cast', star: true, roles: MATES, roleWord: 'camarade'},
                {key: 'subjects', label: 'Matières', type: 'text', star: true},
                {key: 'results', label: 'Résultats', type: 'longtext', star: true},
                {key: 'prizes', label: 'Prix de fin d’année (🏆)', short: 'Prix', type: 'items', kinds: ['award'], star: true},
                {key: '_dipl', label: 'Diplômes passés pendant cette étape', type: 'computed', view: 'bl_step_diplomas', star: true}]},
            {key: 'photos', label: 'Photos de classe', zone: 'left', fields: [{key: 'photos', label: 'Photos de classe', type: 'photos', star: true, pickTitle: 'Photos de classe', labels: [['classe', 'Photo de classe'], ['groupe', 'Groupe'], ['batiment', 'Bâtiment'], ['autre', 'Autre']]}]},
            {key: 'docs', label: 'Livrets et bulletins', icon: '📒', zone: 'right', fields: [{key: 'docs', label: 'Livrets, bulletins, contrats', short: 'Documents', type: 'medialist', star: true, bare: true, addLabel: 'Ajouter un bulletin, un livret…'}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        listExtra: [BL.OWNER_COL],
        list: ['photos', 'date', 'title', 'stype', 'level', 'place', 'board', 'c_who'], card: ['date', 'level', 'place'],
        export: ['date', 'title', 'stype', 'school', 'place', 'level', 'board', 'teachers', 'mates', 'subjects', 'results', 'notes'],
        filters: () => [BL.WHO, {id: 'stype', group: 'Sorte', label: 'Sorte', type: 'check', options: STYPES, test: (it, v) => !v?.length || v.includes(it.data.stype)},
            {id: 'withphoto', group: 'Photos', label: 'Avec une photo de classe', type: 'check', test: (it, v) => !v || ART.normPhotos(it.data.photos).length > 0}],
        quick: {filter: 'stype', options: STYPES, value: it => it.data.stype},
        sorts: [['year', 'Plus anciens'], ['recent', 'Plus récents'], ['az', 'A → Z'], ['za', 'Z → A']],
        searchHint: 'école, lieu, classe, camarade',
        emptyHint: '« ＋ Nouvelle étape » : l’école du village, le cours complémentaire, l’apprentissage, le service militaire…',
        listExtraHtml: (store, list) => list.length ? `<div class="bl-sec"><b>🏫 Frise du parcours</b>${gantt(list)}</div>` : '',
    });

    ART.define({key: 'diploma', icon: '🎓', label: 'Diplôme', many: 'Diplômes', tab: 'Diplômes', domain: 'blocs', hidden: true,
        eyebrow: it => `Diplôme${it.data?.specialty ? ` · ${it.data.specialty}` : ''}`,
        newData: () => ({dkind: ''}),
        titleHint: 'Choisis le diplôme dans la liste, ou écris son nom.',
        askWho: 'Le diplôme de qui ?',
        beforeSave: d => { if (!String(d.title || '').trim() && d.dkind && d.dkind !== 'autre') d.title = lab(DIPLOMAS, d.dkind); },
        afterForm: root => { const sel = root.querySelector('[data-fk="dkind"] select'), ti = root.querySelector('[data-fk="title"] input'); if (!sel || !ti) return;
            sel.addEventListener('change', () => { const known = DIPLOMAS.map(x => x[1]); if ((!ti.value.trim() || known.includes(ti.value.trim())) && sel.value && sel.value !== 'autre') { ti.value = lab(DIPLOMAS, sel.value); ti.dispatchEvent(new Event('input', {bubbles: true})); } }); },
        groups: [
            {key: 'main', label: 'Le diplôme', zone: 'main', fields: [
                {key: 'dkind', label: 'Diplôme (liste prête)', short: 'Sorte', type: 'select', choices: DIPLOMAS, star: true},
                {key: 'title', label: 'Diplôme', type: 'text', star: true, head: true, ph: 'Certificat d’études primaires, CAP de ferronnier…'},
                {key: 'date', label: 'Date', type: 'date', star: true},
                {key: 'specialty', label: 'Spécialité · série', type: 'text', star: true, ph: 'ferronnier, série C, catégorie B…'},
                {key: 'school', label: 'Établissement', type: 'item', kinds: ['school'], star: true},
                {key: 'place', label: 'Lieu (centre d’examen)', short: 'Lieu', type: 'place', star: true},
                {key: 'mention', label: 'Mention · rang', type: 'text', star: true, ph: 'bien, 1er du canton…'},
                {key: 'step', label: 'Pendant l’étape', type: 'item', kinds: ['school_step'], star: true},
                {key: 'source', label: 'Source', type: 'text', star: true}]},
            {key: 'doc', label: 'Le diplôme', icon: '📄', zone: 'left', fields: [{key: 'doc', label: 'Le diplôme (scan, photo)', short: 'Document', type: 'media', media: ['image', 'document'], star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        listExtra: [BL.OWNER_COL, {key: 'c_file', label: 'Document', type: 'computed', view: 'bl_fileicon', of: 'doc'}],
        list: ['date', 'title', 'specialty', 'school', 'mention', 'c_file', 'c_who'], card: ['date', 'specialty', 'mention'],
        export: ['date', 'title', 'specialty', 'school', 'place', 'mention', 'source', 'notes'],
        filters: () => [BL.WHO, {id: 'dkind', group: 'Diplôme', label: 'Diplôme', type: 'check', options: DIPLOMAS.filter(x => x[0]), test: (it, v) => !v?.length || v.includes(it.data.dkind)}],
        sorts: [['year', 'Plus anciens'], ['recent', 'Plus récents'], ['az', 'A → Z'], ['za', 'Z → A']],
        searchHint: 'diplôme, spécialité, établissement',
        emptyHint: '« ＋ Nouveau diplôme » : certificat d’études, CAP, bac, permis de conduire, brevet militaire…',
    });

    ART.define({key: 'school', icon: '🏛', label: 'Établissement', many: 'Établissements', tab: 'Établissements', domain: 'blocs', hidden: true,
        eyebrow: it => `Établissement · ${BL.bare(lab(ETYPES, it.data?.etype)) || 'école'}`,
        newData: () => ({etype: ''}),
        titleHint: 'Il faut le nom de l’établissement.',
        askWho: 'À la fiche de qui ranger cet établissement ? (une personne qui y est passée)',
        groups: [
            {key: 'main', label: 'L’établissement', zone: 'main', fields: [
                {key: 'title', label: 'Nom', type: 'text', star: true, head: true, ph: 'École de Laguenne, lycée Edmond-Perrier…'},
                {key: 'etype', label: 'Sorte', type: 'select', choices: ETYPES, star: true},
                {key: 'place', label: 'Lieu', type: 'place', star: true},
                {key: 'date', label: 'Dates', type: 'text', star: true, ph: 'ouverte en 1882, fermée en 1971'},
                {key: 'url', label: 'Site, archives', type: 'url', star: true},
                {key: '_people', label: 'Ceux qui y sont passés', type: 'computed', view: 'bl_school_people', star: true}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true, labels: [['facade', 'Façade'], ['classe', 'Classe'], ['autre', 'Autre']]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'etype', 'place', 'date'], card: ['etype', 'place'],
        filters: () => [BL.WHO, {id: 'etype', group: 'Sorte', label: 'Sorte', type: 'check', options: ETYPES.filter(x => x[0]), test: (it, v) => !v?.length || v.includes(it.data.etype)}],
        sorts: [['az', 'A → Z'], ['za', 'Z → A'], ['year', 'Plus anciens'], ['recent', 'Plus récents']],
        emptyHint: 'Un établissement se crée aussi depuis une étape (champ « Établissement » → « ＋ Créer »).',
    });

    /* ═════════ La frise du parcours (une ligne par étape) ═════════ */
    const byStart = (x, y) => (BL.span(x)?.[0] || 9999) - (BL.span(y)?.[0] || 9999) || x.id - y.id;
    function gantt(steps, pid = 0) {
        const l = [...steps].sort(byStart), dated = l.filter(it => BL.span(it)); if (!l.length) return '';
        let a = dated.length ? Math.min(...dated.map(it => BL.span(it)[0])) : 0, b = dated.length ? Math.max(...dated.map(it => BL.span(it)[1])) + 1 : 1;
        if (b - a < 4) b = a + 4;
        const pos = y => ((y - a) / (b - a) * 100), ticks = [0, 1, 2, 3, 4, 5].map(i => Math.round(a + (b - a) * i / 5));
        const row = it => { const s = BL.span(it), d = it.data || {}, n = s ? s[1] - s[0] : 0, txt = d.level || (n ? U.plural(n, 'an') : '') || BL.bare(lab(STYPES, d.stype));
            const left = s ? pos(s[0]) : 0, w = s ? Math.max(2, pos(s[1] + 1) - pos(s[0])) : 0;
            return `<div class="bl-grow bl-rowbtn" role="button" tabindex="0" data-bl-item="${it.id}" data-bl-kind="school_step" data-pid="${Number(pid) || 0}" title="${esc(`${it.title}${d.date ? ` · ${d.date}` : ''}`)}"><span>${esc(it.title)}</span><div class="bl-tr">${s ? `<span class="bl-bar ${COLOR[d.stype] || 'c-gr'}" style="left:${left.toFixed(2)}%;width:${Math.min(100 - left, w).toFixed(2)}%">${esc(txt)}</span>` : '<small class="ar-g">années pas encore notées</small>'}</div></div>`; };
        return `<div class="bl-gantt">${dated.length ? `<div class="bl-gax"><span></span><div>${ticks.map(t => `<span>${t}</span>`).join('')}</div></div>` : ''}${l.map(row).join('')}</div>`;
    }
    function diplomasHtml(list, pid = 0) {
        return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Date</th><th>Diplôme</th><th>Spécialité · série</th><th>Établissement</th><th>Mention · rang</th><th>Document</th></tr></thead><tbody>${[...list].sort(byStart).map(it => { const d = it.data || {}, m = ART.mediaOf(d.doc);
            return `<tr class="is-click bl-rowbtn" tabindex="0" data-bl-item="${it.id}" data-bl-kind="diploma" data-pid="${Number(pid) || 0}"><td>${esc(BL.when(it))}</td><td><b>${esc(it.title)}</b></td><td>${esc(d.specialty || '—')}</td><td>${U.placeTitle(d.place) && !U.refTitle(d.school) ? '📍 ' : ''}${esc(U.refTitle(d.school) || U.placeTitle(d.place) || '')}</td><td>${esc(d.mention || '—')}</td><td>${m ? `<a href="${esc(BL.mediaSrc(m))}" target="_blank" rel="noopener">📄 le diplôme</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    }

    /* ═════════ Le bloc « 🎓 Diplômes et formation » de la fiche ═════════ */
    const pchip = (r, store) => { const p = U.person(r); if (!p) return ''; const role = r.role ? ` <span class="ar-role">${esc(r.role)}</span>` : '';
        if (!p.pid) return `<span class="ar-chip is-free"><span class="ar-q">?</span>${esc(p.txt)}${role}</span>`;
        const t = p.title || store.personTitle(p.pid) || `#${p.pid}`; return `<button type="button" class="ar-chip" data-bl-person="${p.pid}" title="Ouvrir la fiche"><span class="ar-av ${store.genderOf(p.pid)}">${esc(U.initials(t))}</span>${esc(t)}${role}</button>`; };
    function render(p, data, {locked} = {}) {
        const pid = Number(p.id), st = BL.miniStore(pid, data);
        const steps = (data.items || []).filter(i => i.kind === 'school_step').sort(byStart), dips = (data.items || []).filter(i => i.kind === 'diploma').sort(byStart);
        const cited = (data.cited || []).filter(i => ['school_step', 'diploma'].includes(i.kind));
        if (!steps.length && !dips.length && !cited.length) return `${A().emptyState({icon: '🎓', text: 'Aucune école, aucun diplôme pour l’instant', hint: 'L’école du village, le certificat d’études, l’apprentissage, le service militaire, les photos de classe et les camarades…'})}${locked ? '' : `<div class="ar-row"><button type="button" class="button small" data-bl-new="school_step" data-pid="${pid}">＋ Une étape de scolarité</button><button type="button" class="button small secondary" data-bl-new="diploma" data-pid="${pid}">＋ Un diplôme</button></div>`}`;
        // la photo de classe : la dernière étape qui en a une (étiquette « Photo de classe » d'abord)
        const withPh = [...steps].reverse().find(s => ART.normPhotos(s.data.photos).some(x => x.k === 'classe')) || [...steps].reverse().find(s => ART.normPhotos(s.data.photos).length);
        const ph = withPh ? (ART.normPhotos(withPh.data.photos).find(x => x.k === 'classe') || ART.normPhotos(withPh.data.photos)[0]) : null;
        const mates = withPh ? BL.castOf(withPh.data.mates) : [], teach = withPh ? BL.castOf(withPh.data.teachers) : [];
        const docs = [...steps, ...dips].flatMap(it => [...BL.mlOf(it.data.docs), ...(ART.mediaOf(it.data.doc) ? [ART.mediaOf(it.data.doc)] : [])].map(m => ({...m, of: it})));
        const side = `${ph ? `<div class="ar-side"><h5>📸 Photo de classe · ${esc([U.placeTitle(withPh.data.place), withPh.data.date].filter(Boolean).join(' · ') || withPh.title)}</h5><button type="button" class="bl-classph" data-bl-item="${withPh.id}" data-bl-kind="school_step" data-pid="${pid}"><img src="${esc(U.photoSrc(ph))}" alt="${esc(ph.c || 'Photo de classe')}" loading="lazy"></button>${ph.c ? `<small class="ar-g">${esc(ph.c)}</small>` : ''}
                ${mates.length ? `<div class="bl-line"><small class="ar-g">Camarades :</small> ${mates.slice(0, 8).map(r => pchip(r, st)).join('')}${mates.length > 8 ? `<span class="ar-chip">+ ${mates.length - 8}</span>` : ''}</div>` : ''}
                ${teach.length ? `<div class="bl-line"><small class="ar-g">${teach.length > 1 ? 'Maîtres' : 'Maître'} :</small> ${teach.map(r => pchip(r, st)).join('')}</div>` : ''}</div>` : ''}
            ${docs.length ? `<div class="ar-side"><h5>📒 Livrets et bulletins</h5>${docs.slice(0, 12).map(m => `<div><a class="ar-ochip" href="${esc(BL.mediaSrc(m))}" target="_blank" rel="noopener"><i>${BL.isImg(m.f) ? '🖼' : '📄'}</i>${esc(m.title || m.f)}</a></div>`).join('')}</div>` : ''}
            ${cited.length ? `<div class="ar-side"><h5>👥 Camarade, maître… chez d’autres</h5>${cited.slice(0, 12).map(it => `<div><button type="button" class="ar-ochip is-link" data-bl-item="${it.id}" data-bl-kind="${esc(it.kind)}" data-pid="${pid}"><i>${esc(ART.defs[it.kind]?.icon || '🏫')}</i>${esc(it.title)}${it.year ? ` (${esc(it.year)})` : ''}</button> <small class="ar-g">${esc([it.my_roles?.join(', '), it.owner && `avec ${it.owner}`].filter(Boolean).join(' · '))}</small></div>`).join('')}</div>` : ''}`;
        const main = `${steps.length ? `<div class="bl-sec0"><b>🏫 Parcours scolaire et formation · ${esc(st.personTitle(pid) || [p.first_name, String(p.last_name || '').toLocaleUpperCase('fr-FR')].filter(Boolean).join(' '))}</b>${gantt(steps, pid)}</div>` : ''}
            <div class="bl-sec"><div class="ar-sh"><b>🎓 Diplômes</b><span class="spacer"></span>${locked ? '' : `<button type="button" class="button small secondary" data-bl-new="diploma" data-pid="${pid}">＋ Ajouter</button>`}</div>${dips.length ? diplomasHtml(dips, pid) : '<p class="ar-g">Aucun diplôme noté.</p>'}</div>`;
        return `<div class="bl-edu ${side.trim() ? '' : 'no-side'}"><div class="bl-edu-main">${main}</div>${side.trim() ? `<div class="bl-edu-side">${side}</div>` : ''}</div>`;
    }
    BL.renderers.education = render;
    ext.personBlocks.education = BL.block({key: 'education', title: '🎓 Diplômes et formation', render,
        actions: (p, ed) => `<button type="button" class="button small secondary" data-bl-open="school" data-pid="${Number(p.id)}">Tout voir</button>${ed(`<button type="button" class="button small secondary" data-bl-new="school_step" data-pid="${Number(p.id)}">＋ Une étape</button>`)}`});
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-bl-person]'); if (!b || b.closest('.bl-dlg')) return; e.preventDefault(); e.stopPropagation(); A().openPersonById?.(Number(b.dataset.blPerson)); });

    /* ═════════ API pour les autres outils ═════════ */
    const norm = it => { const d = it.data || {}; const s = BL.span(it);
        return {id: it.id, kind: it.kind, person_id: it.person_id, owner: it.owner || '', title: it.title, date: d.date || '', date_min: it.date_min, date_max: it.date_max, from: s?.[0] || null, to: s?.[1] || null, year: it.year,
            type: d.stype || d.dkind || '', typeLabel: BL.bare(lab(it.kind === 'diploma' ? DIPLOMAS : STYPES, d.stype || d.dkind)), school: U.ref(d.school), place: U.place(d.place), level: d.level || '',
            specialty: d.specialty || '', mention: d.mention || '', teachers: BL.castOf(d.teachers), mates: BL.castOf(d.mates), photos: ART.normPhotos(d.photos), docs: BL.mlOf(d.docs), roles: it.my_roles || [], data: d}; };
    ext.education = {
        /** {steps, diplomas} de la personne, rangés par date (o.cited : aussi les étapes des autres où elle est camarade, maître…) */
        listFor: async (pid, o = {}) => { const l = (await BL.listFor(pid, {kinds: ['school_step', 'diploma'], cited: !!o.cited})).sort(byStart).map(norm); return {steps: l.filter(x => x.kind === 'school_step'), diplomas: l.filter(x => x.kind === 'diploma')}; },
        ganttHtml: (steps, pid = 0) => gantt(steps || [], pid), diplomasHtml: (list, pid = 0) => diplomasHtml(list || [], pid),
        open: (pid, o = {}) => BL.open({domain: 'school', pid, ...o}), STYPES, DIPLOMAS,
    };
})();
