/* LCNDA — 🏆 « Concours et récompenses » (maquette AB) : prix, décorations, championnats (du monde, de France, régionaux…),
 * concours sérieux ou insolites (plus gros mangeur de tripous, plus belle moustache, champion de Scrabble…) ; rang, médaille,
 * catégorie, niveau, édition ; le concours lui-même est une fiche (🏅) qui réunit son palmarès. Le bloc de la fiche et la liste
 * « Palmarès » (Listes, barre H10, frise).
 * Noyau : heritage-blocs.js (BL). API : ext.awards.listFor(pid), ext.awards.tableHtml(list), ext.awards.friseHtml(list).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, ext = window.LCNDA_EXT || {}, BL = ext.blocs; if (!ART?.define || !BL?.open) return;
    const A = () => window.LCNDA_APP, U = ART.util, esc = U.esc;

    const CATS = [['sport', '🏅 Sport'], ['jeu', '🃏 Jeu'], ['gastronomie', '🍽 Gastronomie'], ['insolite', '🤪 Insolite'], ['agricole', '🐄 Agricole'], ['artistique', '🎨 Artistique'], ['scolaire', '🎓 Scolaire'],
        ['professionnel', '🛠 Professionnel'], ['invention', '💡 Invention'], ['science', '🔬 Science'], ['beaute', '💄 Beauté'], ['bravoure', '🦸 Bravoure'], ['decoration', '🎖 Décoration']];
    const CATS_PL = {decoration: '🎖 Décorations'};
    const LEVELS = [['', '—'], ['local', 'Local'], ['departemental', 'Départemental'], ['regional', 'Régional'], ['national', 'National'], ['international', 'International'], ['mondial', 'Mondial']];
    const MEDALS = [['', '—'], ['or', '🥇 Or · 1er'], ['argent', '🥈 Argent · 2e'], ['bronze', '🥉 Bronze · 3e'], ['laureat', '🏆 Lauréat'], ['finaliste', 'Finaliste'], ['mention', 'Mention'], ['accessit', 'Accessit'], ['record', '⏱ Record'], ['participation', 'Participation']];
    const COLOR = {sport: 'c-spo', decoration: 'c-pol', invention: 'c-inv', science: 'c-inv', professionnel: 'c-art', artistique: 'c-art', insolite: 'c-med', gastronomie: 'c-med', jeu: 'c-gr', agricole: 'c-agr', scolaire: 'c-pol', beaute: 'c-med', bravoure: 'c-spo'};
    const lab = (l, v) => BL.labelOf(l, v);
    const catLabel = v => BL.bare(lab(CATS, v)) || String(v || '');
    const isFirst = d => d.medal === 'or' || /^\s*(1(er|re|ère)?|premier|première)\b/i.test(String(d.rank || ''));
    const join = (...a) => a.map(x => String(x ?? '').trim()).filter(Boolean).join(' · ');
    // les colonnes calculées de la liste « Palmarès »
    ART.views.bl_aw_cat = {text: (ctx, it) => join(catLabel(it.data.category).toLowerCase(), BL.bare(lab(LEVELS, it.data.level)).toLowerCase())};
    ART.views.bl_aw_event = {text: (ctx, it) => join(it.data.event, it.data.perf, BL.castOf(it.data.people).filter(r => /équip|partenaire/i.test(r.role)).map(r => `avec ${r.title || r.pname}`).join(', '))};
    ART.views.bl_aw_rank = {text: (ctx, it) => it.data.rank || BL.bare(lab(MEDALS, it.data.medal))};
    ART.views.bl_aw_where = {text: (ctx, it) => join(U.placeTitle(it.data.place), it.data.org)};
    /** le palmarès d'un concours (les récompenses qui le citent) */
    ART.views.bl_contest_awards = {
        read: (ctx, it) => { const st = ctx.store, l = st.linksTo(it.id, 'contest').map(x => st.otherOf(x, it.id)).filter(Boolean).sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
            if (!l.length) return '<p class="ar-g">Aucune récompense ne cite encore ce concours.</p>';
            return `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Année</th><th>Récompense</th><th>Rang</th><th>Personne</th></tr></thead><tbody>${l.map(a => `<tr class="is-click" data-ar-row-open="${a.id}"><td>${esc(a.year || '')}</td><td><b>${esc(a.title)}</b></td><td>${esc(a.data?.rank || BL.bare(lab(MEDALS, a.data?.medal)) || '')}</td><td>${a.person_id ? BL.chip({pid: a.person_id, title: a.owner || st.personTitle(a.person_id)}, '', st) : ''}</td></tr>`).join('')}</tbody></table></div>`; },
        meta: (ctx, it) => { const n = ctx.store.linksTo(it.id, 'contest').length; return n ? esc(U.plural(n, 'récompense')) : ''; },
        text: (ctx, it) => U.plural(ctx.store.linksTo(it.id, 'contest').length, 'récompense')};

    ART.define({key: 'award', icon: '🏆', label: 'Récompense', many: 'Récompenses', tab: 'Récompenses', fem: true, domain: 'blocs', hidden: true,
        eyebrow: it => `Récompense · ${catLabel(it.data?.category) || 'concours'}`,
        heading: (ctx, it) => { const d = it.data || {}; const bits = [d.category && `<span class="bl-cat ${COLOR[d.category] || ''}">${esc(lab(CATS, d.category))}</span>`, d.level && `<span class="ar-badge">${esc(BL.bare(lab(LEVELS, d.level)))}</span>`, d.medal && `<span class="ar-badge ${isFirst(d) ? 'ok' : ''}">${esc(lab(MEDALS, d.medal))}</span>`].filter(Boolean).join(' ');
            return `<div class="bl-head">${bits ? `<div class="ar-badges">${bits}</div>` : ''}<h2 class="ar-h2">${esc(it.title)}${it.year ? ` <small>· ${esc(it.year)}</small>` : ''}</h2>${d.prize_title ? `<p class="bl-hmeta">🏆 ${esc(d.prize_title)}</p>` : ''}</div>`; },
        newData: () => ({category: '', level: '', medal: ''}),
        titleHint: 'Il faut le nom de la récompense (ex. « Concours Lépine · médaille d’or »).',
        askWho: 'Qui a reçu cette récompense ?',
        groups: [
            {key: 'main', label: 'La récompense', zone: 'main', fields: [
                {key: 'category', label: 'Catégorie', type: 'pills', choices: CATS, free: true, freePh: '＋ libre (concours de belote…)', star: true, head: true},
                {key: 'title', label: 'Récompense', type: 'text', star: true, head: true, ph: 'Concours Lépine · médaille d’or, Chevalier du Mérite agricole…'},
                {key: 'contest', label: 'Concours', type: 'item', kinds: ['contest'], star: true, help: '(sa fiche réunit tout son palmarès)'},
                {key: 'edition', label: 'Édition', type: 'text', star: true, ph: '7e · 1971'},
                {key: 'level', label: 'Niveau', type: 'select', choices: LEVELS, star: true, head: true},
                {key: 'event', label: 'Épreuve', type: 'text', star: true, ph: 'moustache à l’ancienne, 100 m, triplette…'},
                {key: 'date', label: 'Date', type: 'date', star: true},
                {key: 'place', label: 'Lieu', type: 'place', star: true},
                {key: 'perf', label: 'Performance', type: 'text', star: true, ph: '18 / 20, 2,4 kg en 10 min, 11 s 2…'},
                {key: 'rank', label: 'Rang', type: 'text', star: true, ph: '1er sur 22'},
                {key: 'medal', label: 'Médaille', type: 'select', choices: MEDALS, star: true, head: true},
                {key: 'prize_title', label: 'Titre obtenu', type: 'text', star: true, head: true, ph: 'Moustache d’or 1971, champion de France…'},
                {key: 'prize', label: 'Montant · lot', type: 'text', star: true, ph: '500 F, un jambon, une coupe…'},
                {key: 'org', label: 'Organisateur', type: 'text', star: true, ph: 'Comité des fêtes, FFR, confrérie…'},
                {key: 'people', label: 'Jury, équipiers, partenaires', short: 'Personnes', type: 'cast', star: true, roleWord: 'jury', roles: ['jury', 'président du jury', 'équipier', 'partenaire', 'entraîneur', 'remis par', 'parrain', 'adversaire']}]},
            {key: 'deco', label: 'Décoration', icon: '🎖', zone: 'main', fields: [
                {key: 'grade', label: 'Grade', type: 'text', star: true, ph: 'chevalier, officier, commandeur…', onlyFor: {category: ['decoration']}},
                {key: 'promotion', label: 'Promotion', type: 'text', star: true, ph: 'promotion du 14 juillet 1955', onlyFor: {category: ['decoration']}},
                {key: 'decree', label: 'Décret · Journal officiel', type: 'text', star: true, ph: 'décret du 12 juillet 1955, JO p. 7012', onlyFor: {category: ['decoration']}},
                {key: 'dossier', label: 'Dossier (base Léonore…)', type: 'url', star: true, onlyFor: {category: ['decoration']}},
                {key: 'sponsor', label: 'Parrain', type: 'person', star: true, roleWord: 'parrain', onlyFor: {category: ['decoration']}}]},
            {key: 'photo', label: 'Trophée, photo, coupure', icon: '🖼', zone: 'left', fields: [{key: 'photo', label: 'Trophée, photo, coupure', short: 'Fichier', type: 'media', media: ['image', 'document', 'video', 'audio'], star: true}]},
            {key: 'what', label: 'Récompense quoi', icon: '📎', zone: 'right', fields: [
                {key: 'for_items', label: 'Une œuvre, une invention, une équipe… (fiche)', short: 'Pour', type: 'items', star: true},
                {key: 'for_animal', label: 'Un animal 🐾 (ou une autre personne)', short: 'Avec', type: 'person', star: true, roleWord: 'récompensé'}]},
            {key: 'source', label: 'Source', icon: '📚', zone: 'right', fields: [
                {key: 'source_per', label: 'Journal', type: 'periodical', star: true},
                {key: 'source', label: 'Où c’est écrit', short: 'Source', type: 'text', star: true, ph: 'La Montagne, 17 août 1971 · JO n°, page'}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        listExtra: [BL.OWNER_COL, {key: 'c_cat', label: 'Catégorie', type: 'computed', view: 'bl_aw_cat'}, {key: 'c_event', label: 'Épreuve · performance', type: 'computed', view: 'bl_aw_event'},
            {key: 'c_rank', label: 'Rang', type: 'computed', view: 'bl_aw_rank'}, {key: 'c_where', label: 'Lieu · organisateur', type: 'computed', view: 'bl_aw_where'}, {key: 'c_file', label: 'Fichier', type: 'computed', view: 'bl_fileicon', of: 'photo'}],
        list: ['date', 'title', 'c_cat', 'c_event', 'c_rank', 'c_where', 'c_file', 'c_who'], card: ['date', 'category', 'rank'],
        export: ['date', 'title', 'category', 'contest', 'edition', 'level', 'event', 'place', 'perf', 'rank', 'medal', 'prize_title', 'prize', 'org', 'people', 'grade', 'decree', 'source', 'notes'],
        filters: () => [BL.WHO,
            {id: 'cat', group: 'Catégorie', label: 'Catégorie', type: 'check', options: CATS, test: (it, v) => !v?.length || v.includes(it.data.category)},
            {id: 'level', group: 'Niveau', label: 'Niveau', type: 'check', options: LEVELS.filter(x => x[0]), test: (it, v) => !v?.length || v.includes(it.data.level)},
            {id: 'first', group: 'Rang', label: 'Rang', text: 'Seulement les premières places (or, 1er)', type: 'check', chipLabel: '1ers seulement', test: (it, v) => !v || isFirst(it.data)},
            {id: 'place', group: 'Lieu', label: 'Lieu', type: 'place', test: (it, v) => !v ? true : v.id ? Number(it.data.place?.plid) === Number(v.id) : U.placeTitle(it.data.place).toLowerCase().includes(String(v).replace(/^txt:/, '').toLowerCase())}],
        quick: {filter: 'cat', options: [['decoration', CATS_PL.decoration], ...CATS.filter(c => c[0] !== 'decoration')], value: it => it.data.category},
        sorts: [['year', 'Plus anciens'], ['recent', 'Plus récents'], ['az', 'A → Z'], ['za', 'Z → A']],
        searchHint: 'concours, titre, lieu, organisateur',
        listIntro: 'Prix, décorations, championnats, concours sérieux ou insolites de toutes les personnes (filtre « Personne » pour une seule).',
        emptyHint: '« ＋ Nouvelle récompense » : un championnat, une médaille, le certificat d’études premier du canton, la plus belle moustache…',
        summary: list => { const n = list.filter(it => isFirst(it.data)).length; return n ? U.plural(n, 'première place', 'premières places') : ''; },
        listExtraHtml: (store, list) => list.length ? `<div class="bl-sec"><b>🏆 Frise du palmarès</b>${frise(list)}</div>` : '',
    });

    ART.define({key: 'contest', icon: '🏅', label: 'Concours', many: 'Concours', tab: 'Concours', domain: 'blocs', hidden: true,
        eyebrow: it => `Concours · ${catLabel(it.data?.category) || 'fiche qui relie'}`,
        newData: () => ({category: '', level: ''}),
        titleHint: 'Il faut le nom du concours.',
        askWho: 'À la fiche de qui ranger ce concours ? (l’organisateur, ou une personne qui y a participé)',
        groups: [
            {key: 'main', label: 'Le concours', zone: 'main', fields: [
                {key: 'title', label: 'Nom du concours', type: 'text', star: true, head: true, ph: 'Plus belle moustache de Corrèze, Concours Lépine…'},
                {key: 'category', label: 'Catégorie', type: 'pills', choices: CATS, free: true, star: true},
                {key: 'level', label: 'Niveau', type: 'select', choices: LEVELS, star: true},
                {key: 'org', label: 'Organisateur', type: 'text', star: true},
                {key: 'place', label: 'Lieu', type: 'place', star: true},
                {key: 'date', label: 'Depuis', type: 'date', star: true, ph: '1965, vers 1900…'},
                {key: 'freq', label: 'Fréquence', type: 'text', star: true, ph: 'chaque année, le 15 août…'},
                {key: 'url', label: 'Site', type: 'url', star: true},
                {key: '_awards', label: 'Palmarès de ce concours', type: 'computed', view: 'bl_contest_awards', star: true}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos, affiches', type: 'photos', star: true, labels: [['affiche', 'Affiche'], ['photo', 'Photo'], ['trophee', 'Trophée'], ['autre', 'Autre']]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'title', 'category', 'level', 'place', 'org'], card: ['category', 'place'],
        filters: () => [BL.WHO, {id: 'cat', group: 'Catégorie', label: 'Catégorie', type: 'check', options: CATS, test: (it, v) => !v?.length || v.includes(it.data.category)}],
        sorts: [['az', 'A → Z'], ['za', 'Z → A'], ['year', 'Plus anciens'], ['recent', 'Plus récents']],
        emptyHint: 'Un concours se crée aussi depuis une récompense (champ « Concours » → « ＋ Créer »).',
    });

    /* ═════════ La frise du palmarès (un trait par récompense, couleur de la catégorie) ═════════ */
    function frise(list) {
        const pts = list.map(it => ({it, y: BL.span(it)?.[0]})).filter(x => x.y); if (!pts.length) return '';
        let a = Math.min(...pts.map(x => x.y)), b = Math.max(...pts.map(x => x.y)); a = Math.floor(a / 10) * 10; b = Math.max(a + 10, Math.ceil((b + 1) / 10) * 10);
        const pos = y => ((y - a) / (b - a) * 100).toFixed(2), ticks = [0, 1, 2, 3, 4].map(i => Math.round(a + (b - a) * i / 4));
        return `<div class="bl-gantt"><div class="bl-gax"><span></span><div>${ticks.map(t => `<span>${t}</span>`).join('')}</div></div><div class="bl-grow"><span>Toutes</span><div class="bl-tr">${pts.map(({it, y}) => `<span class="bl-dot ${COLOR[it.data.category] || 'c-gr'}" style="left:${pos(y)}%" title="${esc(`${y} · ${it.title}`)}"></span>`).join('')}</div></div></div>`;
    }

    /* ═════════ Le bloc « 🏆 Concours et récompenses » de la fiche ═════════ */
    const byYear = (x, y) => (BL.span(x)?.[0] || 9999) - (BL.span(y)?.[0] || 9999) || x.id - y.id;
    const fileIc = it => ART.views.bl_fileicon.text(null, it, {of: 'photo'});
    function tableHtml(list, pid) {
        return `<div class="ar-scroll"><table class="ar-t bl-awt"><thead><tr><th>Date</th><th>Récompense</th><th>Catégorie</th><th>Épreuve · performance</th><th>Rang</th><th>Lieu · organisateur</th><th></th></tr></thead><tbody>${list.map(it => { const d = it.data || {};
            return `<tr class="is-click bl-rowbtn" tabindex="0" data-bl-item="${it.id}" data-bl-kind="award" data-pid="${Number(pid) || 0}" data-bl-medium="${esc(d.category || '')}"><td>${esc(BL.when(it))}</td><td>${isFirst(d) ? '<b>' : ''}${esc(it.title)}${isFirst(d) ? '</b>' : ''}${Number(it.person_id) !== Number(pid) && pid ? ` <small class="bl-cited">(${esc(it.owner || '')}${it.my_roles?.length ? ` · ${esc(it.my_roles.join(', '))}` : ''})</small>` : ''}</td><td>${esc(ART.views.bl_aw_cat.text(null, it))}</td><td>${esc(ART.views.bl_aw_event.text(null, it))}</td><td>${esc(ART.views.bl_aw_rank.text(null, it))}</td><td>${U.placeTitle(d.place) ? '📍 ' : ''}${esc(ART.views.bl_aw_where.text(null, it))}</td><td>${esc(fileIc(it))}</td></tr>`; }).join('')}</tbody></table></div>`;
    }
    const MAX = 25;
    function render(p, data, {locked} = {}) {
        const pid = Number(p.id), all = [...(data.items || []), ...(data.cited || [])].filter(i => i.kind === 'award').sort(byYear);
        if (!all.length) return A().emptyState({icon: '🏆', text: 'Aucun prix, aucune décoration pour l’instant', hint: 'Un championnat, une médaille, un concours de belote, le certificat d’études premier du canton, la plus belle moustache…', action: locked ? null : {label: '＋ Ajouter une récompense', attrs: `data-bl-new="award" data-pid="${pid}"`}});
        const counts = new Map(); all.forEach(it => { const c = it.data?.category || ''; if (c) counts.set(c, (counts.get(c) || 0) + 1); });
        const known = new Set(CATS.map(c => c[0])), free = [...counts.keys()].filter(k => !known.has(k));
        const opts = [['decoration', CATS_PL.decoration], ...CATS.filter(c => c[0] !== 'decoration'), ...free.map(k => [k, k])].filter(([k]) => counts.has(k));
        const firsts = all.filter(it => isFirst(it.data || {})).length;
        const filt = opts.length > 1 ? `<div class="ui-filters bl-mfilt"><button type="button" class="is-active" data-bl-mf="">Tout (${all.length})</button>${opts.map(([k, l]) => `<button type="button" data-bl-mf="${esc(k)}">${esc(l)} (${counts.get(k)})</button>`).join('')}</div>` : '';
        return `<div class="bl-bh"><small class="ar-g">${esc(U.plural(all.length, 'récompense'))}${firsts ? ` · ${esc(U.plural(firsts, 'première place', 'premières places'))}` : ''}</small><span class="spacer"></span></div>${filt}${tableHtml(all.slice(0, MAX), pid)}${all.length > MAX ? `<p class="ar-g">… et ${esc(U.plural(all.length - MAX, 'autre'))} : « Palmarès ».</p>` : ''}${all.length > 1 ? `<div class="bl-sec"><b>🏆 Frise du palmarès</b>${frise(all)}</div>` : ''}`;
    }
    BL.renderers.awards = render;
    ext.personBlocks.awards = BL.block({key: 'awards', title: '🏆 Concours et récompenses', render,
        actions: (p, ed) => `<button type="button" class="button small secondary" data-bl-open="awards" data-pid="${Number(p.id)}" title="Le palmarès de cette personne">Palmarès</button>${ed(`<button type="button" class="button small secondary" data-bl-new="award" data-pid="${Number(p.id)}">＋ Ajouter</button>`)}`});

    /* ═════════ L'écran Listes → « Palmarès » ═════════ */
    ext.lists.palmares = BL.listScreen('awards', 'award');

    /* ═════════ API pour les autres outils (profil sportif, politique, scientifique…) ═════════ */
    const norm = it => { const d = it.data || {};
        return {id: it.id, kind: it.kind, person_id: it.person_id, owner: it.owner || '', title: it.title, date: d.date || '', year: it.year, date_min: it.date_min, date_max: it.date_max,
            category: d.category || '', categoryLabel: catLabel(d.category), level: d.level || '', levelLabel: BL.bare(lab(LEVELS, d.level)), medal: d.medal || '', medalLabel: BL.bare(lab(MEDALS, d.medal)),
            rank: d.rank || '', first: isFirst(d), edition: d.edition || '', event: d.event || '', perf: d.perf || '', prizeTitle: d.prize_title || '', prize: d.prize || '', org: d.org || '',
            place: U.place(d.place), contest: U.ref(d.contest), people: BL.castOf(d.people), file: ART.mediaOf(d.photo), roles: it.my_roles || [], data: d}; };
    ext.awards = {
        /** les récompenses de la personne, rangées par date ; o.category ('sport'…), o.cited (aussi celles où elle est jury, équipière…) */
        listFor: async (pid, o = {}) => (await BL.listFor(pid, {kinds: ['award'], cited: !!o.cited})).sort(byYear).map(norm).filter(a => !o.category || (Array.isArray(o.category) ? o.category.includes(a.category) : a.category === o.category)),
        /** le tableau du bloc (clic = ouvrir) et la frise, prêts à poser dans une section de page */
        tableHtml: (list, pid = 0) => tableHtml(list || [], pid), friseHtml: list => frise(list || []),
        open: (pid, o = {}) => BL.open({domain: 'awards', pid, ...o}), add: (pid, preset = {}) => BL.open({kind: 'award', pid, add: true, preset}),
        CATS, LEVELS, MEDALS, isFirst: a => isFirst(a?.data || a || {}),
    };
})();
