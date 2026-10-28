/* LCNDA — 🎬 SCÈNE : le profil ACTEUR / ACTRICE / PERFORMEUR (maquette W de docs/design/profils-et-oeuvres.html).
 * Sur le moteur (docs/TYPES.md) :
 *  - 🎭 role (« Rôle ») : un rôle détaillé — cinéma, télévision, théâtre, voix (doublage, animation, jeu vidéo, livre audio,
 *    radio), publicité et mannequinat, clip ; l'œuvre (film, série, épisode, mise en scène, pièce…), le personnage, la sorte de
 *    rôle, la réalisation / mise en scène 👤, le générique, le tournage (période, lieux 📍), les partenaires 👤, le cachet,
 *    le contrat, les représentations et remplacements (théâtre), la voix d'origine (doublage), les prix, l'anecdote.
 *  - la filmographie et la théâtrographie TRIABLES (onglet « Rôles », barre H10) rassemblent : les fiches « Rôle », les films
 *    du catalogue (heritage-artist-film.js : rôle, métier, réalisateur), ce que la personne fait dans les séries (X), les rôles
 *    du soir des représentations (U), et les fiches d'autres catalogues qui la citent.
 *  - 🎬 profile_actor : sa fiche de profil (formation, agents, troupes, castings, compétences, physique, voix, prix, biographie).
 *  - ART.profiles.actor + les sections de sa page (ART.pageSections, profile: 'actor') + le modèle « Acteur, actrice ».
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, SC = ART?.scene; if (!ART?.define || !SC) return;
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {};
    const accord = (who, word, o) => (window.LCNDA_ACCORD?.accord || ((_, w) => String(w)))(who, word, o); // ✍️ accordé avec la fiche (app-accord.js)
    const U = ART.util, esc = U.esc, fold = SC.fold, T = ART.ft;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

    /* ═════════ Les domaines et les sortes de rôles ═════════ */
    const DOMS = [['cinema', '🎬', 'Cinéma'], ['tv', '📺', 'Télévision'], ['theatre', '🎭', 'Théâtre'], ['voice', '🗣', 'Voix'], ['ad', '📢', 'Publicité'], ['clip', '🎞', 'Clip'],
        ['radio', '📻', 'Radio'], ['game', '🎮', 'Jeu vidéo'], ['audiobook', '🎧', 'Livre audio'], ['scene', '🎤', 'Spectacle, cabaret'], ['other', '✦', 'Autre']];
    const DOM = k => DOMS.find(d => d[0] === k) || DOMS[DOMS.length - 1];
    const RKINDS = [['principal', 'principal'], ['secondaire', 'secondaire'], ['recurrent', 'récurrent'], ['invite', 'invité'], ['figuration', 'figuration'], ['silhouette', 'silhouette'], ['cameo', 'caméo'],
        ['voix', 'voix'], ['doublage', 'doublage'], ['narration', 'narration'], ['cascade', 'cascade'], ['choeur', 'chœur'], ['mannequin', 'mannequin'], ['presentation', 'présentation'], ['autre', 'autre']];
    const rk = k => (RKINDS.find(r => r[0] === k) || [, k || ''])[1];
    SC.ROLE_DOMS = DOMS; SC.RKINDS = RKINDS;
    const WORK_KINDS = ['film', 'series', 'episode', 'concert', 'stage_piece'];
    // les mises en scène et pièces (outil « œuvres ») s'ajoutent quand elles existent
    const lateKinds = () => { [...SC.parentKinds, ...SC.playKinds].forEach(k => { if (ART.defs[k] && !WORK_KINDS.includes(k)) WORK_KINDS.push(k); }); };
    const gate = values => ({field: 'domain', values, dflt: 'cinema'});
    const fkindDom = k => ({theatre: 'theatre', opera: 'theatre', spectacle: 'scene', serie: 'tv', telefilm: 'tv', pub: 'ad', clip: 'clip'}[k] || 'cinema');

    /* ═════════ 🎭 La fiche d'un rôle ═════════ */
    ART.define({key: 'role', icon: '🎭', label: 'Rôle', many: 'Rôles', domain: 'scene', searchHint: 'rôle, film, partenaire, réalisateur',
        eyebrow: it => ['Rôle', DOM(it.data?.domain || 'cinema')[2], rk(it.data?.rkind)].filter(Boolean).join(' · '),
        heading: (ctx, it) => { const w = U.refTitle(it.data?.work), y = SC.dayOf(it.data?.year)?.y || it.year;
            return `<h2 class="ar-h2">${esc(SC.cut(it.data?.character || it.title || 'Rôle', 200))}${w ? ` <small>· « ${esc(w)} »${y ? ` (${esc(y)})` : ''}</small>` : ''}</h2>`; },
        cardLine: it => [SC.dayOf(it.data?.year)?.y || it.year, U.refTitle(it.data?.work), rk(it.data?.rkind)].filter(Boolean).join(' · '),
        newData: () => ({domain: 'cinema', rkind: 'secondaire'}),
        groups: [
            {key: 'main', label: 'Le rôle', zone: 'main', fields: [
                {key: 'domain', label: 'Domaine', type: 'select', choices: DOMS.map(d => [d[0], `${d[1]} ${d[2]}`]), star: true},
                {key: 'title', label: 'Titre de la fiche', type: 'text', star: true, head: true, ph: 'se remplit tout seul : Mme Lacombe · « Rue des Bouchers »'},
                {key: 'work', label: 'Œuvre', type: 'item', kinds: WORK_KINDS, star: true, help: '(film, série, épisode, mise en scène, pièce… ou un titre libre)', roleWord: 'rôle'},
                {key: 'character', label: 'Personnage', type: 'text', star: true, ph: 'Mme Lacombe, une lavandière, voix de la meunière…'},
                {key: 'rkind', label: 'Sorte de rôle', type: 'select', choices: RKINDS, star: true},
                {key: 'year', label: 'Année', type: 'date', star: true, ph: '1959, 1967 – 1970'},
                {key: 'period', label: 'Tournage, période', type: 'text', star: true, ph: 'avril – juin 1959'},
                {key: 'director', label: 'Réalisation, mise en scène', short: 'Réalisation', type: 'person', star: true, roleWord: 'réalisation'},
                {key: 'credit', label: 'Au générique', type: 'text', star: true, ph: '« Louise Bory » (6e)'},
                {key: 'uncredited', label: 'Pas au générique', type: 'sc_flag', on: 'pas au générique', star: true},
                {key: 'scenes', label: 'Scènes', type: 'number', star: false, ph: '9'}]},
            {key: 'theatre', label: '🎭 Au théâtre', zone: 'main', fields: [
                {key: 'perf_count', label: 'Représentations', type: SC.gated('number'), gate: gate(['theatre', 'scene']), star: true, help: '(en plus de celles notées soir par soir)'},
                {key: 'creation', label: 'Création du rôle', type: 'sc_flag', on: 'création du rôle', star: false},
                {key: 'venues', label: 'Théâtres, salles', type: SC.gated('rows'), gate: gate(['theatre', 'scene']), star: true, addLabel: 'Un théâtre', cols: [{key: 'place', label: 'Lieu', type: 'place', w: 'm'}, {key: 'venue', label: 'Théâtre, salle', w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}]},
                {key: 'replacements', label: 'Remplacements', type: SC.gated('rows'), gate: gate(['theatre', 'scene']), star: true, addLabel: 'Un remplacement',
                    cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'how', label: 'Sens', type: 'select', choices: [['par', 'a laissé la place à'], ['de', 'a remplacé']], w: 's'}, {key: 'who', label: 'Qui', type: 'person', w: 'm'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'tv', label: '📺 Télévision, radio', zone: 'main', fields: [{key: 'episodes', label: 'Épisodes', type: 'text', star: false, ph: 'S3 ép. 2-7'}]},
            {key: 'voice', label: '🗣 Voix', zone: 'main', fields: [
                {key: 'voice_of', label: 'Voix française de', type: 'text', star: false, ph: 'l’actrice d’origine'},
                {key: 'lang', label: 'Langue', type: 'text', star: false}, {key: 'vdir', label: 'Direction artistique', type: 'person', star: false, roleWord: 'direction artistique'},
                {key: 'studio', label: 'Studio', type: 'text', star: false}]},
            {key: 'ad', label: '📢 Publicité', zone: 'main', fields: [{key: 'brand', label: 'Marque, annonceur', type: 'text', star: false}, {key: 'campaign', label: 'Campagne, produit', type: 'text', star: false}, {key: 'agency', label: 'Agence', type: 'text', star: false}]},
            {key: 'shoot', label: '🎬 Tournage et partenaires', zone: 'main', fields: [
                {key: 'places', label: 'Lieux', type: 'rows', star: true, addLabel: 'Un lieu', cols: [{key: 'place', label: 'Lieu', type: 'place', w: 'l'}, {key: 'note', label: 'Note (studios, extérieurs…)', w: 'm'}]},
                {key: 'partners', label: 'Partenaires', type: 'sc_people', star: true, addLabel: 'Un ou une partenaire', rolePh: 'son personnage', roleWord: 'partenaire'}]},
            {key: 'prizes', label: '🏆 Prix', zone: 'main', fields: [{key: 'prizes', label: 'Prix et nominations', type: 'rows', star: false, addLabel: 'Un prix', cols: [{key: 'year', label: 'Année', w: 's'}, {key: 'prize', label: 'Prix', w: 'l'}, {key: 'status', label: 'Lauréat ou nommé', type: 'select', choices: [['laureat', 'prix reçu'], ['nomme', 'nomination']], w: 's'}]}]},
            {key: 'story', label: 'Anecdote', zone: 'main', fields: [{key: 'anecdote', label: 'Anecdote, souvenirs', type: 'longtext', star: true, section: true}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true, labels: [['plateau', 'Plateau'], ['photo', 'Photo'], ['script', 'Script'], ['affiche', 'Affiche'], ['autre', 'Autre']]}]},
            {key: 'media', label: 'Extrait', icon: '🎞', zone: 'left', fields: [{key: 'extract', label: 'Extrait (vidéo, son)', type: 'media', media: ['video', 'audio'], star: true}]},
            {key: 'money', label: 'Contrat', icon: '💶', zone: 'right', fields: [{key: 'fee', label: 'Cachet', type: 'money', star: true}, {key: 'contract', label: 'Contrat', type: 'document', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['year', 'work', 'character', 'rkind', 'director', 'credit'], card: ['year', 'work'], export: ['domain', 'year', 'work', 'character', 'rkind', 'director', 'credit', 'period', 'anecdote'],
        sorts: [['old', 'Plus anciens'], ['recent', 'Plus récents'], ['work', 'Œuvre A → Z'], ['char', 'Personnage A → Z'], ['kind', 'Sorte de rôle']],
    });
    SC.titleMakers.role = form => { const v = k => form.querySelector(`[data-fk="${k}"] [data-v]`)?.value?.trim() || ''; const w = SC.pkFirst(form.querySelector('[data-fk="work"]'))?.title || '';
        return [v('character'), w && `« ${w} »`].filter(Boolean).join(' · '); };

    /* ═════════ La filmographie / théâtrographie : tout ce que la personne a joué, d'où que ça vienne ═════════ */
    const ACTING = /act|com[ée]d|interpr|r[ôo]le|voix|doubl|figur|cascad|narrat|chant/i;
    SC.actorEntries = store => {
        lateKinds();
        const out = [], roles = store.of('role'), byWork = new Map();
        roles.forEach(it => { const d = it.data || {}, w = U.ref(d.work); const e = {key: `r${it.id}`, src: 'role', id: it.id, it, domain: d.domain || 'cinema', year: SC.dayOf(d.year)?.y || Number(it.year) || 0,
            work: w, character: d.character || '', rkind: d.rkind || '', director: d.director || null, credit: d.uncredited ? accord(store.person, 'non crédité(e)', {x: 'pas au générique'}) : (d.credit || ''), uncredited: !!d.uncredited, eps: d.episodes || '', perfs: Number(String(d.perf_count || '').replace(/\D/g, '')) || 0, counted: 0, subst: (d.replacements || []).length, creation: !!d.creation, partners: ART.normPeople(d.partners), photos: d.photos};
            out.push(e); if (w?.iid) byWork.set(w.iid, e); });
        // les films du catalogue (rôle, métier d'acteur)
        store.of('film').forEach(f => { const d = f.data || {}; if (byWork.has(f.id) || !(d.role || ACTING.test(d.jobs || ''))) return;
            out.push({key: `f${f.id}`, src: 'film', id: f.id, domain: fkindDom(d.fkind), year: Number(f.year) || SC.dayOf(d.year)?.y || 0, work: {iid: f.id, title: f.title, kind: 'film'}, character: d.role || '', rkind: '', job: d.jobs || '', director: d.director || null, credit: '', photos: d.photos}); });
        // les séries : ce que la personne y a fait (X)
        (store.of('series') || []).forEach(s => ART.arr(s.data?.participants).forEach((p, i) => { if (U.person(p.who)?.pid !== Number(store.pid)) return; if (byWork.has(s.id) && p.mode !== 'job') return;
            const eps = Array.isArray(p.eps) ? p.eps : [];
            out.push({key: `s${s.id}_${i}`, src: 'series', id: s.id, domain: ['emission_radio', 'feuilleton_radio', 'podcast'].includes(s.data?.skind) ? 'radio' : 'tv', year: SC.dayOf(s.data?.dates)?.y || Number(s.year) || 0, yearText: s.data?.dates || '',
                work: {iid: s.id, title: s.title, kind: 'series'}, character: p.mode === 'job' ? '' : (p.character || ''), rkind: p.mode === 'job' ? '' : (p.rkind || ''), job: p.mode === 'job' ? (p.job || 'métier') : '', director: s.data?.creator ? ART.normPeople(s.data.creator)[0] : null,
                credit: p.credit && p.credit !== store.name ? `« ${p.credit} »` : '', eps: SC.epsLabel ? SC.epsLabel(store, s, eps) : (eps.length ? plural(eps.length, 'épisode') : ''), epsN: eps.length, photos: s.data?.photos}); }));
        // les soirs (U) : ses rôles du soir, regroupés par mise en scène et par rôle
        const stage = new Map();
        SC.concerts(store).forEach(c => (Array.isArray(c.data?.cast_night) ? c.data.cast_night : []).forEach(r => { if (U.person(r.who)?.pid !== Number(store.pid)) return;
            const st = U.ref(c.data?.staging), wk = st?.iid ? `i${st.iid}` : `t${fold(c.data?.show || c.title)}`, k = `${wk}|${fold(r.role)}`;
            const x = stage.get(k) || {st, show: c.data?.show || c.title, role: r.role || '', n: 0, subst: 0, ys: [], first: c}; x.n++; if (r.status === 'remplacant' || r.status === 'doublure') x.subst++; if (r.status === 'creation') x.creation = true;
            const y = SC.dayOf(c.data?.date)?.y || Number(c.year); if (y) x.ys.push(y); stage.set(k, x); }));
        stage.forEach((x, k) => { const known = x.st?.iid && byWork.get(x.st.iid); if (known) { known.counted += x.n; known.subst += x.subst; return; }
            out.push({key: `c${k}`, src: 'stage', id: x.st?.iid || x.first.id, domain: 'theatre', year: x.ys.length ? Math.min(...x.ys) : 0, yearText: x.ys.length ? [...new Set([Math.min(...x.ys), Math.max(...x.ys)])].join('-') : '',
                work: x.st?.iid ? x.st : {txt: x.show}, character: x.role, rkind: x.subst && x.subst === x.n ? 'remplaçant' : '', counted: x.n, perfs: 0, subst: x.subst, creation: !!x.creation}); });
        // les fiches d'autres catalogues qui la citent (distribution d'un film, invité d'un épisode…)
        const ACT_FIELDS = {film: ['cast', 'credits', 'director'], episode: ['guests', 'writers', 'director'], series: ['participants', 'creator'], concert: ['on_stage', 'cast_night', 'soloists', 'conductor', 'setlist']};
        (store.cited || []).forEach(c => { if (!ACT_FIELDS[c.kind] || byWork.has(c.id) || c.person_id === Number(store.pid) || !(c.fields || []).some(f => ACT_FIELDS[c.kind].includes(f))) return;
            out.push({key: `x${c.id}`, src: 'cited', id: c.id, domain: c.kind === 'film' ? 'cinema' : c.kind === 'concert' ? 'scene' : 'tv', year: Number(c.year) || 0, work: {iid: c.id, title: c.title, kind: c.kind}, character: (c.roles || []).join(', '), rkind: '', director: null, credit: c.person ? `catalogue de ${c.person}` : '', thumb: c.thumb}); });
        return out;
    };
    const perfOf = e => (e.perfs || 0) + (e.counted || 0);
    const typeText = e => [e.job || rk(e.rkind), e.eps, perfOf(e) && `${plural(perfOf(e), 'représ.', 'représ.')}`, e.subst && plural(e.subst, 'remplacement'), e.creation && 'création'].filter(Boolean).join(' · ');
    const directorOf = (e, ctx) => e.director ? U.personChip(e.director, '', ctx) : '';
    const SRC = [['role', 'Fiches « Rôle »'], ['film', 'Films du catalogue'], ['series', 'Séries'], ['stage', 'Rôles du soir (représentations)'], ['cited', 'Cités dans d’autres catalogues']];
    SC.sortEntries = (l, how) => { const t = s => String(s || ''); const c = {old: (a, b) => (a.year || 9999) - (b.year || 9999) || t(U.refTitle(a.work)).localeCompare(t(U.refTitle(b.work)), 'fr'), recent: (a, b) => (b.year || 0) - (a.year || 0),
        work: (a, b) => t(U.refTitle(a.work)).localeCompare(t(U.refTitle(b.work)), 'fr'), char: (a, b) => t(a.character).localeCompare(t(b.character), 'fr'),
        kind: (a, b) => (RKINDS.findIndex(r => r[0] === a.rkind) + 1 || 99) - (RKINDS.findIndex(r => r[0] === b.rkind) + 1 || 99) || (a.year || 9999) - (b.year || 9999)}[how] || ((a, b) => (a.year || 9999) - (b.year || 9999));
        return [...l].sort(c); };
    const rowHtml = (e, ctx) => { const d = DOM(e.domain);
        return `<tr class="is-click" data-sc-entry="${esc(e.key)}" tabindex="0"><td>${esc(e.yearText || e.year || '')}</td><td><span class="sc-dom" title="${esc(d[2])}">${d[1]}</span> ${e.work ? U.refChip(e.work, ART.defs[e.work.kind]?.icon || d[1]) : ''}</td><td>${esc(SC.cut(e.character, 160))}</td><td>${['principal', 'recurrent'].includes(e.rkind) ? `<b>${esc(typeText(e))}</b>` : esc(typeText(e))}</td><td>${directorOf(e, ctx)}</td><td>${e.uncredited ? `<span class="ar-badge">${esc(e.credit)}</span>` : esc(e.credit || '')}</td></tr>`; };
    const tableHtml = (list, ctx) => `<div class="ar-scroll"><table class="ar-t sc-roles"><thead><tr><th>Année</th><th>Œuvre</th><th>Personnage</th><th>Sorte</th><th>Réalisation, mise en scène</th><th>Crédit</th></tr></thead><tbody>${list.map(e => rowHtml(e, ctx)).join('')}</tbody></table></div>`;
    SC.rolesTable = tableHtml;
    /** la carte d'un rôle (sous la liste) */
    function cardHtml(e, ctx) {
        const it = e.it, d = it?.data || {}, ph = ART.normPhotos(e.photos || d.photos).slice(0, 3);
        const line = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '';
        const places = (d.places || []).map(r => U.placeChip(r.place)).join('');
        const partners = ART.normPeople(d.partners); const pp = partners.slice(0, 3).map(p => U.personChip(p, p.role, ctx)).join('') + (partners.length > 3 ? ` <small class="ar-g">+ ${partners.length - 3}</small>` : '');
        const money = [d.fee && `<span class="ar-ochip"><i>💶</i>cachet ${esc(U.money(d.fee))}</span>`, ART.mediaOf(d.contract) && '<span class="ar-ochip"><i>📄</i>contrat</span>'].filter(Boolean).join(' ');
        return `<div class="sc-rcard" data-sc-card="${esc(e.key)}"><div class="sc-rhd"><span class="sc-kind">RÔLE</span><b>${esc([e.character, e.work && `« ${U.refTitle(e.work)} »${e.year ? ` (${e.year})` : ''}`].filter(Boolean).join(' · ') || 'Rôle')}</b><span class="spacer"></span>${money}
            ${e.src === 'role' ? `<button type="button" class="button small secondary" data-ar-open="${e.id}">↗ Ouvrir la fiche</button><button type="button" class="button small secondary" data-sc-editrole="${e.id}">✎ Modifier</button>` : `${e.id ? `<button type="button" class="button small secondary" data-ar-open="${e.id}">↗ Ouvrir « ${esc(U.refTitle(e.work) || 'la fiche')} »</button>` : ''}<button type="button" class="button small secondary" data-sc-mkrole="${esc(e.key)}" title="Une fiche « Rôle » pour noter le tournage, les partenaires, le cachet, l’anecdote…">＋ En faire une fiche rôle détaillée</button>`}<button type="button" class="icon-button small" data-sc-closecard aria-label="Fermer" title="Fermer">×</button></div>
            <div class="sc-rbody"><dl class="ar-dl ar-dl-s">${line('Sorte', esc([typeText(e), d.scenes && plural(Number(d.scenes) || 0, 'scène')].filter(Boolean).join(' · ')))}${line('Domaine', esc(`${DOM(e.domain)[1]} ${DOM(e.domain)[2]}`))}${line('Au générique', esc(e.credit))}${line('Tournage', esc(d.period || ''))}${line('Lieux', places)}${line('Partenaires', pp)}${line('Réalisation', directorOf(e, ctx))}${line('Voix de', esc(d.voice_of || ''))}${line('Venu de', e.src === 'film' ? 'la fiche du film (rôle, métier)' : e.src === 'series' ? 'la série (épisodes cochés)' : e.src === 'stage' ? 'les soirs notés (rôles du soir)' : e.src === 'cited' ? esc(e.credit || 'un autre catalogue') : '')}</dl>
            <div>${ph.length ? `<div class="ar-thumbs">${ph.map(p => `<span><img src="${esc(U.photoSrc(p))}" alt="" loading="lazy" data-ar-img>${p.k ? `<small>${esc(String(p.k).toLocaleUpperCase('fr-FR'))}</small>` : ''}</span>`).join('')}</div>` : ''}${d.anecdote ? `<p class="ar-g">Anecdote : ${esc(String(d.anecdote).slice(0, 400))}${String(d.anecdote).length > 400 ? '…' : ''}</p>` : ''}</div></div></div>`;
    }
    const presetOf = (e, store) => ({domain: e.domain, work: e.work?.iid ? e.work : e.work?.txt ? {txt: e.work.txt} : '', character: e.character || '', rkind: e.rkind && RKINDS.some(r => r[0] === e.rkind) ? e.rkind : (e.job && !ACTING.test(e.job) ? 'autre' : 'secondaire'),
        year: String(e.year || ''), director: e.director || '', title: [e.character, U.refTitle(e.work) && `« ${U.refTitle(e.work)} »`].filter(Boolean).join(' · ') || `Rôle dans ${U.refTitle(e.work) || 'une œuvre'}`, ...(e.eps ? {episodes: e.eps} : {}), ...(e.counted ? {perf_count: String(e.counted)} : {})});
    SC.isActor = store => (store.person?.profiles || []).some(p => p.profile_key === 'actor');
    SC.actorWord = store => ({female: 'Actrice', male: 'Acteur'}[store.person?.gender] || 'Acteur, actrice');

    /* ═════════ La liste « Rôles » (barre H10) ═════════ */
    const VIEWS = [['list', 'Liste'], ['cards', 'Fiches'], ['frise', 'Frise']];
    const base = ART.paintList;
    ART.paintList = (C, body) => (C.S.kind === 'role' ? paintRoles(C, body) : base(C, body));
    function paintRoles(C, body) {
        const {store} = C, all = SC.actorEntries(store), ctx = ART.ctx(store, {}), VKEY = `lcnda-roles-view:${C.pid}`;
        let view = readJ(VKEY, 'list'), shown = 30, dom = C._scDom || 'all', open = '';
        if (!VIEWS.some(v => v[0] === view)) view = 'list';
        const decades = [...new Set(all.map(e => Math.floor(e.year / 10) * 10).filter(Boolean))].sort();
        const filters = [
            {id: 'rkind', label: 'Sorte de rôle', group: 'Sorte de rôle', type: 'check', options: RKINDS.filter(r => all.some(e => e.rkind === r[0])), test: (e, v) => !v?.length || v.includes(e.rkind)},
            ...(decades.length > 1 ? [{id: 'dec', label: 'Années', group: 'Époque', type: 'check', options: decades.map(d => [String(d), `${d} – ${d + 9}`]), test: (e, v) => !v?.length || v.includes(String(Math.floor(e.year / 10) * 10))}] : []),
            {id: 'src', label: 'D’où vient la ligne', group: 'D’où vient la ligne', type: 'check', options: SRC.filter(s => all.some(e => e.src === s[0])), test: (e, v) => !v?.length || v.includes(e.src)},
            {id: 'dir', label: 'Réalisation, mise en scène', group: 'Avec', type: 'person', chipPrefix: '🎬', test: (e, v) => { if (!v) return true; const p = U.person(e.director); const id = typeof v === 'object' ? Number(v.id) : 0; return id ? p?.pid === id : fold(U.nameOf(e.director)).includes(fold(String(v).replace(/^txt:/, ''))); }},
            {id: 'partner', label: 'Partenaire', group: 'Avec', type: 'person', chipPrefix: '👥', test: (e, v) => { if (!v) return true; const id = typeof v === 'object' ? Number(v.id) : 0; return (e.partners || []).some(p => (id && p.pid === id) || (!id && fold(p.title || p.txt).includes(fold(String(v).replace(/^txt:/, ''))))); }}];
        const seg = document.createElement('span'); seg.className = 'segmented sc-views';
        const paintSeg = () => { seg.innerHTML = VIEWS.map(([k, l]) => `<button type="button" data-scv="${k}" class="${view === k ? 'is-active' : ''}" aria-pressed="${view === k}">${esc(l)}</button>`).join(''); };
        Object.defineProperty(seg, 'value', {get: () => (view === 'cards' ? 'cards' : 'list')}); paintSeg();
        const head = document.createElement('div'); head.className = 'ar-listhead'; const pills = document.createElement('div'); pills.className = 'ui-filters sc-dompills'; pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', 'Domaine');
        const note = document.createElement('div'); const out = document.createElement('div'); out.className = 'ar-listout';
        body.append(note, head, pills, out);
        if (!SC.isActor(store)) note.innerHTML = `<div class="sc-notice">${UI().notice ? UI().notice('info', `Le profil « ${SC.actorWord(store)} » n’est pas coché sur la fiche de ${store.name} : ses sections (filmographie, théâtrographie, statistiques…) n’apparaissent pas sur sa page.`) : ''}<button type="button" class="button small secondary" data-sc-setactor>🎬 Cocher le profil « ${esc(SC.actorWord(store))} »</button></div>`;
        const bar = UI().listBar({key: `artistes:role:${C.pid}`, search: {placeholder: 'Chercher un rôle, un film, un partenaire…'}, filters, view: seg, sort: {options: ART.defs.role.sorts, value: 'old'}, onChange: () => { shown = 30; draw(); }});
        head.appendChild(bar);
        seg.addEventListener('click', e => { const b = e.target.closest('[data-scv]'); if (!b) return; e.stopPropagation(); view = b.dataset.scv; writeJ(VKEY, view); paintSeg(); draw(); });
        const text = e => [U.refTitle(e.work), e.character, typeText(e), U.nameOf(e.director), e.credit, e.year, ...(e.partners || []).map(p => p.title || p.txt), e.it?.data?.anecdote, e.it?.data?.voice_of].join(' ');
        function filtered() { const st = bar.state, q = fold(st.q || ''); let l = all;
            if (q) { const ws = q.split(/\s+/).filter(Boolean); l = l.filter(e => { const t = fold(text(e)); return ws.every(w => t.includes(w)); }); }
            filters.forEach(f => { const v = st.filters[f.id]; l = l.filter(e => f.test(e, v)); });
            return SC.sortEntries(l, st.sort || 'old'); }
        C.listIds = () => filtered().filter(e => e.src === 'role').map(e => e.id);
        function draw() {
            const l0 = filtered(), l = dom === 'all' ? l0 : l0.filter(e => e.domain === dom);
            const cnt = k => l0.filter(e => e.domain === k).length;
            pills.innerHTML = `<button type="button" class="${dom === 'all' ? 'is-active' : ''}" data-sc-dom="all">Tout (${l0.length})</button>${DOMS.filter(d => cnt(d[0])).map(d => `<button type="button" class="${dom === d[0] ? 'is-active' : ''}" data-sc-dom="${d[0]}">${d[1]} ${esc(d[2])} (${cnt(d[0])})</button>`).join('')}`;
            bar.setCount(plural(l.length, 'rôle') + (l.length !== all.length ? ` sur ${all.length}` : ''));
            if (!all.length) { out.innerHTML = A().emptyState({icon: '🎭', text: 'Aucun rôle pour l’instant', hint: 'Un rôle = une fiche : l’œuvre, le personnage, la sorte de rôle, le tournage, les partenaires… Les films du catalogue, les séries et les soirs de théâtre s’y ajoutent tout seuls.', action: {label: '＋ Nouveau rôle', attrs: 'data-ar-cmd="new"'}}); return; }
            if (!l.length) { out.innerHTML = A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés, le domaine, ou retire un filtre.'}); return; }
            const page = l.slice(0, shown);
            if (view === 'cards') out.innerHTML = `<div class="ar-grid is-big">${page.map(e => { const ph = ART.normPhotos(e.photos)[0], src = ph ? U.photoSrc(ph) : e.thumb || '';
                return `<div class="ar-card" data-sc-entry="${esc(e.key)}" role="button" tabindex="0">${src ? `<img class="ar-cov" src="${esc(src)}" alt="" loading="lazy" data-ar-img>` : `<span class="ar-cov is-empty">${DOM(e.domain)[1]}</span>`}<b>${esc(e.character || U.refTitle(e.work))}</b><small>${esc([e.year, U.refTitle(e.work)].filter(Boolean).join(' · '))}</small><small>${esc(typeText(e))}</small></div>`; }).join('')}</div>`;
            else if (view === 'frise') { const by = new Map(); SC.sortEntries(l, 'old').forEach(e => { const y = e.year || 0; if (!by.has(y)) by.set(y, []); by.get(y).push(e); });
                out.innerHTML = `<div class="sc-legend">${DOMS.filter(d => l.some(e => e.domain === d[0])).map(d => `<span class="sc-leg sc-d-${d[0]}"><span class="sc-dot"></span>${d[1]} ${esc(d[2])}</span>`).join('')}</div><div class="sc-frise">${[...by.entries()].map(([y, es]) => `<div class="sc-fy"><div class="sc-fyh"><b>${y || 'Sans date'}</b><small class="ar-g">${esc(plural(es.length, 'rôle'))}</small></div><div class="sc-fdots">${es.map(e => `<button type="button" class="sc-fdot sc-wide sc-d-${esc(e.domain)}" data-sc-entry="${esc(e.key)}" title="${esc([U.refTitle(e.work), e.character, typeText(e)].filter(Boolean).join(' · '))}"><span>${DOM(e.domain)[1]} ${esc(U.refTitle(e.work).slice(0, 28))}</span><small>${esc((e.character || typeText(e)).slice(0, 28))}</small></button>`).join('')}</div></div>`).join('')}</div>`; }
            else out.innerHTML = tableHtml(page, ctx);
            if (view !== 'frise' && l.length > shown) out.appendChild(UI().moreButton({remaining: l.length - shown, step: 30, onClick: () => { shown += 30; draw(); }}));
            if (open) { const e = all.find(x => x.key === open); if (e) { const tmp = document.createElement('div'); tmp.innerHTML = cardHtml(e, ctx); out.appendChild(tmp.firstElementChild); } }
        }
        const openCard = k => { open = open === k ? '' : k; draw(); out.querySelector('[data-sc-card]')?.scrollIntoView?.({block: 'nearest'}); };
        pills.addEventListener('click', e => { const b = e.target.closest('[data-sc-dom]'); if (!b) return; dom = C._scDom = b.dataset.scDom; shown = 30; draw(); });
        out.addEventListener('click', e => { if (e.target.closest('button, a, .pk')) { const b = e.target.closest('button'); if (b?.dataset.scClosecard !== undefined) { open = ''; draw(); } if (!b?.closest('.sc-fdot')) return; }
            const r = e.target.closest('[data-sc-entry]'); if (r) openCard(r.dataset.scEntry); });
        out.addEventListener('keydown', e => { const r = e.target.closest('[data-sc-entry]'); if (r && e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(r.dataset.scEntry); } });
        C._scEntries = all;
        draw();
    }

    /* ═════════ 🎬 Le profil (une fiche par personne) ═════════ */
    const JOBS = [['acteur', 'acteur, actrice'], ['comedien', 'comédien, comédienne'], ['doubleur', 'comédien de doublage'], ['humoriste', 'humoriste'], ['chanteur', 'chanteur, chanteuse'], ['danseur', 'danseur, danseuse'],
        ['mannequin', 'mannequin'], ['cascadeur', 'cascadeur'], ['marionnettiste', 'marionnettiste'], ['mime', 'mime'], ['clown', 'clown'], ['conteur', 'conteur'], ['performeur', 'performeur'], ['presentateur', 'présentateur, animateur'], ['figurant', 'figurant']];
    ART.define({key: 'profile_actor', icon: '🎬', label: 'Profil d’acteur', many: 'Profils d’acteur', domain: 'profile', hidden: true, linked: false,
        eyebrow: () => 'Profil · acteur, actrice, performeur',
        groups: [
            {key: 'identity', label: 'Le métier', icon: '🎭', zone: 'main', fields: [
                {key: 'title', label: 'Nom de scène principal', type: 'text', star: true},
                {key: 'stage_names', label: 'Noms de scène', type: 'rows', star: true, addLabel: 'Un nom de scène', cols: [{key: 'name', label: 'Nom', w: 'l'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}]},
                {key: 'jobs', label: 'Métiers', type: 'list', choices: JOBS, star: true}, {key: 'debut', label: 'Débuts', type: 'text', star: true, ph: '1938, figuration dans…'}]},
            {key: 'training', label: 'Formation', icon: '🎓', zone: 'main', fields: [{key: 'training', label: 'Formation', type: 'rows', star: true, addLabel: 'Une école, un cours', cols: [{key: 'school', label: 'École, conservatoire, cours', w: 'm'}, {key: 'master', label: 'Professeur', type: 'person', w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'diploma', label: 'Prix, diplôme', w: 's'}]}]},
            {key: 'career', label: 'Agents, troupes', icon: '💼', zone: 'main', fields: [
                {key: 'agents', label: 'Agents', type: 'rows', star: true, addLabel: 'Un agent', cols: [{key: 'agent', label: 'Agent, agence', type: 'item', kinds: ['org'], w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'note', label: 'Note', w: 'm'}]},
                {key: 'troupes', label: 'Troupes, compagnies', type: 'rows', star: true, addLabel: 'Une troupe', cols: [{key: 'troupe', label: 'Troupe, théâtre', type: 'item', kinds: ['org'], w: 'm'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'status', label: 'Statut (pensionnaire, sociétaire…)', w: 'm'}]},
                {key: 'union', label: 'Syndicat', type: 'text', star: true}]},
            {key: 'castings', label: 'Castings', icon: '🎬', zone: 'main', fields: [{key: 'castings', label: 'Castings, auditions', type: 'rows', star: true, addLabel: 'Un casting',
                cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'project', label: 'Projet', w: 'm'}, {key: 'role', label: 'Rôle visé', w: 'm'}, {key: 'result', label: 'Résultat', type: 'select', choices: [['', '—'], ['obtenu', 'obtenu'], ['rappel', 'rappel'], ['non', 'pas obtenu'], ['attente', 'en attente']], w: 's'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'skills', label: 'Compétences, physique, voix', icon: '🗣', zone: 'main', fields: [
                {key: 'languages', label: 'Langues', type: 'text', star: true}, {key: 'accents', label: 'Accents', type: 'text', star: true}, {key: 'singing', label: 'Chant', type: 'text', star: true},
                {key: 'dance', label: 'Danse', type: 'text', star: true}, {key: 'instruments', label: 'Instruments', type: 'text', star: false}, {key: 'sports', label: 'Sports, cascades, équitation, escrime…', type: 'text', star: true},
                {key: 'licences', label: 'Permis', type: 'text', star: false}, {key: 'voice', label: 'Voix (tessiture, timbre)', type: 'text', star: true},
                {key: 'height', label: 'Taille', type: 'text', star: false}, {key: 'eyes', label: 'Yeux', type: 'text', star: false}, {key: 'hair', label: 'Cheveux', type: 'text', star: false}]},
            {key: 'prizes', label: 'Prix et nominations', icon: '🏆', zone: 'main', fields: [{key: 'prizes', label: 'Prix et nominations', type: 'rows', star: true, addLabel: 'Un prix', cols: [{key: 'year', label: 'Année', w: 's'}, {key: 'prize', label: 'Prix', w: 'l'}, {key: 'work', label: 'Pour', type: 'item', kinds: ['role', 'film', 'series'], w: 'm'}, {key: 'status', label: 'Lauréat ou nommé', type: 'select', choices: [['laureat', 'prix reçu'], ['nomme', 'nomination']], w: 's'}]}]},
            {key: 'bio', label: 'Biographie', icon: '📝', zone: 'main', fields: [{key: 'bio', label: 'Biographie', type: 'longtext', star: true, rows: 8}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
    });
    ART.profiles = ART.profiles || {};
    ART.profiles.actor = {key: 'actor', label: 'Acteur, actrice, performeur', icon: '🎬', type: 'profile_actor', color: '#d0182f',
        help: 'Cinéma, télévision, théâtre, voix, publicité : chaque rôle détaillé, filmographie et théâtrographie triables, statistiques.', models: {acteur: null}};
    const prof = C => C.store.of('profile_actor')[0] || null;
    SC.actorProfile = prof;

    /* ═════════ Les sections de sa page (ordonnables : ⚙️ Organiser la page) ═════════ */
    const PS = ART.pageSections, editBtn = '<button type="button" class="icon-button small" data-sc-editactor title="Modifier le profil">…</button>';
    const ents = C => (C._scPageEntries && C._scPageEntries.items === C.store.items && C._scPageEntries.cited === C.store.cited ? C._scPageEntries.l : (C._scPageEntries = {items: C.store.items, cited: C.store.cited, l: SC.actorEntries(C.store)}).l);
    const short = (C, list, max = 8) => list.length ? `<div class="sc-mini">${SC.sortEntries(list, 'old').slice(0, max).map(e => `<div class="sc-mline"><span class="ar-g">${esc(e.yearText || e.year || '')}</span> ${e.work ? U.refChip(e.work, ART.defs[e.work.kind]?.icon || DOM(e.domain)[1]) : ''} <span>${esc(SC.cut([e.character, typeText(e)].filter(Boolean).join(' · '), 200))}</span></div>`).join('')}${list.length > max ? `<button type="button" class="ar-linkbtn u" data-ar-tab="role">… et ${list.length - max} de plus</button>` : ''}</div>` : '';
    const domSec = (key, icon, label, doms, w = '½', emptyT = 'Rien pour l’instant.') => { PS[key] = {icon, label, w, profile: 'actor', render: C => { const l = ents(C).filter(e => doms.includes(e.domain));
        return {count: l.length || '', body: short(C, l) || `<p class="muted">${esc(emptyT)}</p>`, actions: `<button type="button" class="button small secondary" data-sc-roletab="${doms[0]}">Tout voir</button>`}; }}; };
    let actorTab = 'all';
    function actorSummary(all) { const series = all.filter(e => e.src === 'series'), epsN = series.reduce((a, e) => a + (e.epsN || 0), 0), th = all.filter(e => e.domain === 'theatre'), perfs = th.reduce((a, e) => a + perfOf(e), 0), films = all.filter(e => e.domain === 'cinema').length,
        dub = all.filter(e => ['voice', 'game', 'audiobook'].includes(e.domain) || ['doublage', 'voix'].includes(e.rkind)).length, tv = new Set(all.filter(e => e.domain === 'tv').map(e => U.refTitle(e.work))).size;
        return [films && plural(films, 'film'), tv && `${plural(tv, 'série')}${epsN ? ` (${plural(epsN, 'épisode')})` : ''}`, th.length && `${plural(th.length, 'rôle')} au théâtre${perfs ? ` (${plural(perfs, 'représentation')})` : ''}`, dub && plural(dub, 'doublage')].filter(Boolean).join(' · '); }
    SC.actorSummary = actorSummary;
    PS.actor_roles = {icon: '🎬', label: 'Rôles · filmographie et théâtrographie', w: 'ligne', profile: 'actor', render: C => {
        const all = ents(C), st = C.store, cnt = k => all.filter(e => e.domain === k).length, l = actorTab === 'all' ? all : all.filter(e => e.domain === actorTab);
        const films = cnt('cinema'), series = all.filter(e => e.src === 'series'), epsN = series.reduce((a, e) => a + (e.epsN || 0), 0), th = all.filter(e => e.domain === 'theatre'), perfs = th.reduce((a, e) => a + perfOf(e), 0), dub = all.filter(e => ['voice', 'game', 'audiobook'].includes(e.domain) || ['doublage', 'voix'].includes(e.rkind)).length;
        const doms = DOMS.filter(d => cnt(d[0])).map(d => d[2].toLocaleUpperCase('fr-FR')).slice(0, 5).join(', ');
        const sum = [films && plural(films, 'film'), cnt('tv') && `${plural(new Set(all.filter(e => e.domain === 'tv').map(e => U.refTitle(e.work))).size, 'série')}${epsN ? ` (${plural(epsN, 'épisode')})` : ''}`, th.length && `${plural(th.length, 'rôle')} au théâtre${perfs ? ` (${plural(perfs, 'représentation')})` : ''}`, dub && plural(dub, 'doublage')].filter(Boolean).join(' · ');
        return {count: all.length || '', head: `<span class="ui-filters sc-dompills">${[['all', `Tout (${all.length})`], ...DOMS.filter(d => cnt(d[0])).map(d => [d[0], `${d[1]} ${d[2]} (${cnt(d[0])})`])].map(([k, t]) => `<button type="button" class="${actorTab === k ? 'is-active' : ''}" data-sc-adom="${k}">${esc(t)}</button>`).join('')}</span>`,
            body: `<div class="sc-ahero"><span class="eyebrow">🎬 ${esc(SC.actorWord(st).toLocaleUpperCase('fr-FR'))}${doms ? ` · ${esc(doms)}` : ''}</span>${sum ? `<p class="ar-g">${esc(sum)}</p>` : ''}</div>${l.length ? tableHtml(SC.sortEntries(l, 'old').slice(0, 12), ART.ctx(st, {})) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucun rôle noté : « ＋ Nouveau rôle » dans l’onglet « Rôles », ou un film, une série, un soir de théâtre.</span></p>'}`,
            actions: `<button type="button" class="button small secondary" data-ar-tab="role">Tout voir, trier</button><button type="button" class="button small secondary" data-sc-newrole>＋ Nouveau rôle</button>`}; }};
    domSec('actor_film', '🎬', 'Filmographie', ['cinema'], '½', 'Aucun film.');
    domSec('actor_tv', '📺', 'Télévision', ['tv'], '½', 'Aucune série, aucun téléfilm.');
    domSec('actor_theatre', '🎭', 'Théâtrographie', ['theatre', 'scene'], '½', 'Aucun rôle au théâtre.');
    domSec('actor_voice', '🗣', 'Voix (doublage, animation, jeux vidéo, livres audio, radio)', ['voice', 'game', 'audiobook', 'radio'], '⅓', 'Aucune voix.');
    domSec('actor_ads', '📢', 'Publicité et mannequinat', ['ad'], '⅓', 'Aucune publicité.');
    domSec('actor_clips', '🎞', 'Clips', ['clip'], '⅓', 'Aucun clip.');
    const rowsSec = (key, icon, label, field, fmt, w = '⅓') => { PS[key] = {icon, label, w, profile: 'actor', render: C => { const p = prof(C), l = p?.data?.[field] || [], ctx = p ? ART.ctx(C.store, p) : null;
        return {count: l.length || '', body: l.length ? l.slice(0, 12).map(r => `<div class="sc-mline">${fmt(r, ctx)}</div>`).join('') : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Rien de noté : « … » pour l’écrire.</span></p>', actions: editBtn}; }}; };
    const span = (a, b) => esc([a, b].filter(Boolean).join('-'));
    rowsSec('actor_training', '🎓', 'Formation', 'training', (r, ctx) => `${esc(r.school || '')} ${span(r.from, r.to)}${r.master ? ` · classe de ${U.personChip(r.master, '', ctx)}` : ''}${r.diploma ? ` · ${esc(r.diploma)}` : ''}`);
    PS.actor_agents = {icon: '💼', label: 'Agents, troupes', w: '⅓', profile: 'actor', render: C => { const d = prof(C)?.data || {}, l = [...(d.agents || []).map(r => `${U.refChip(r.agent, '💼')} ${span(r.from, r.to)}`), ...(d.troupes || []).map(r => `${U.refChip(r.troupe, '🎭')} ${span(r.from, r.to)}${r.status ? ` · ${esc(r.status)}` : ''}`)];
        return {count: l.length || '', body: (l.length ? l.map(x => `<div class="sc-mline">${x}</div>`).join('') : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Rien de noté : « … » pour l’écrire.</span></p>') + (d.union ? `<p class="ar-g">Syndicat : ${esc(d.union)}</p>` : ''), actions: editBtn}; }};
    PS.actor_castings = {icon: '🎬', label: 'Castings', w: '⅓', profile: 'actor', render: C => { const l = prof(C)?.data?.castings || [], ok = l.filter(r => r.result === 'obtenu').length;
        return {count: l.length || '', body: l.length ? `<p><b>${esc(plural(l.length, 'casting noté', 'castings notés'))}</b> · ${esc(plural(ok, 'obtenu'))}</p>${l.slice(-5).reverse().map(r => `<div class="sc-mline">${esc([r.date, r.project, r.role].filter(Boolean).join(' · '))} ${r.result ? `<span class="ar-badge ${r.result === 'obtenu' ? 'ok' : ''}">${esc({obtenu: 'obtenu', rappel: accord(C.store.person, 'rappelé(e)', {x: 'rappel'}), non: accord(C.store.person, 'pas retenu(e)', {x: 'pas obtenu'}), attente: 'en attente'}[r.result] || r.result)}</span>` : ''}</div>`).join('')}` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">👤</span><span class="empty-line-text">Aucun casting noté.</span></p>', actions: editBtn}; }};
    PS.actor_prizes = {icon: '🏆', label: 'Prix et nominations', w: '⅓', profile: 'actor', render: C => { const p = prof(C), l = [...ART.arr(p?.data?.prizes), ...C.store.of('role').flatMap(r => ART.arr(r.data?.prizes).map(x => ({...x, work: {iid: r.id, title: r.title, kind: 'role'}})))].sort((a, b) => (Number(U.yearOf(a.year)) || 0) - (Number(U.yearOf(b.year)) || 0));
        return {count: l.length || '', body: l.length ? l.map(r => `<div class="sc-mline">${esc(r.year || '')} · ${esc(r.prize || '')}${r.work ? ` — ${U.refChip(r.work)}` : ''} <span class="sc-res ${r.status === 'nomme' ? '' : 'w'}">${esc(r.status === 'nomme' ? accord(C.store.person, 'nommé(e)', {x: 'nomination'}) : accord(C.store.person, 'lauréat(e)', {x: 'prix reçu'}))}</span></div>`).join('') : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🏆</span><span class="empty-line-text">Aucun prix noté.</span></p>', actions: editBtn}; }};
    PS.actor_skills = {icon: '🗣', label: 'Compétences, physique, voix', w: '⅓', profile: 'actor', render: C => { const d = prof(C)?.data || {}, f = ART.fieldsOf(ART.defs.profile_actor).filter(x => ['skills', 'identity'].includes(ART.defs.profile_actor.groups.find(g => g.fields.includes(x))?.key) && !['title', 'stage_names'].includes(x.key));
        const lines = f.map(x => { const v = d[x.key]; if (!v || (Array.isArray(v) && !v.length)) return ''; return `<dt>${esc(x.label)}</dt><dd>${esc(ART.ft[x.type]?.text ? ART.ft[x.type].text(x, v) : String(v))}</dd>`; }).join('');
        return {body: lines ? `<dl class="ar-dl ar-dl-s">${lines}</dl>` : '<p class="muted">Langues, chant, danse, sports, voix… : « … » pour les écrire.</p>', actions: editBtn}; }};
    PS.actor_stats = {icon: '📊', label: 'Statistiques', w: '½', profile: 'actor', render: C => {
        const all = ents(C); if (!all.length) return {body: '<p class="muted">Les statistiques viennent des rôles notés.</p>'};
        const dec = new Map(); all.forEach(e => { if (!e.year) return; const d = Math.floor(e.year / 10) * 10; dec.set(d, (dec.get(d) || 0) + 1); });
        const ds = [...dec.keys()].sort((a, b) => a - b), mx = Math.max(1, ...dec.values()), span0 = []; if (ds.length) for (let d = ds[0]; d <= ds[ds.length - 1]; d += 10) span0.push(d);
        const top = (fn, n = 3) => { const m = new Map(); all.forEach(e => fn(e).forEach(k => k && m.set(k, (m.get(k) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${esc(k)} (${v})`).join(' · '); };
        const dirs = top(e => [U.nameOf(e.director)]), partners = top(e => (e.partners || []).map(p => p.title || p.txt));
        const main = all.filter(e => ['principal', 'recurrent'].includes(e.rkind)).length, sec = all.filter(e => ['secondaire', 'invite', 'cameo'].includes(e.rkind)).length, fig = all.filter(e => ['figuration', 'silhouette'].includes(e.rkind)).length;
        const perfs = all.reduce((a, e) => a + perfOf(e), 0), subst = all.reduce((a, e) => a + (e.subst || 0), 0);
        return {body: `${span0.length ? `<b class="sc-sm">Rôles par décennie</b><div class="sc-strip sc-red" role="img" aria-label="Rôles par décennie">${span0.map(d => `<i style="height:${Math.max(2, Math.round((dec.get(d) || 0) / mx * 100))}%" title="${d} : ${esc(plural(dec.get(d) || 0, 'rôle'))}" class="${dec.get(d) ? '' : 'is-zero'}"></i>`).join('')}</div><div class="sc-axis"><span>${span0[0]}</span><span>${span0[span0.length - 1]}</span></div>` : ''}
            <dl class="ar-dl ar-dl-s sc-dl">${dirs ? `<dt>Réalisateurs</dt><dd>${dirs}</dd>` : ''}${partners ? `<dt>Partenaires</dt><dd>${partners}</dd>` : ''}<dt>Principal / sec.</dt><dd>${main} / ${sec}${fig ? ` · figuration ${fig}` : ''}</dd>${perfs ? `<dt>Représentations</dt><dd>${esc(perfs.toLocaleString('fr-FR'))}${subst ? ` · ${esc(plural(subst, 'remplacement'))}` : ''}</dd>` : ''}<dt>Domaines</dt><dd>${esc(DOMS.map(d => [d, all.filter(e => e.domain === d[0]).length]).filter(x => x[1]).map(([d, n]) => `${d[2]} ${n}`).join(' · '))}</dd></dl>`}; }};
    PS.actor_shows = {icon: '🎤', label: 'Représentations, soirs de scène', w: '⅓', profile: 'actor', render: C => { const l = SC.concerts(C.store), mine = l.filter(c => SC.peopleOf ? SC.peopleOf(c).some(p => p.ref.pid === Number(C.pid)) : true);
        return {count: l.length || '', body: l.length ? `<p>${esc(plural(l.length, 'soir'))}${mine.length !== l.length ? ` · ${esc(plural(mine.length, 'soir'))} avec ${esc(C.store.name)} sur scène` : ''}</p>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucun soir noté.</span></p>', actions: '<button type="button" class="button small secondary" data-ar-tab="concert">Tout voir</button>'}; }};
    const ACTOR_KEYS = ['actor_roles', 'actor_film', 'actor_tv', 'actor_theatre', 'actor_voice', 'actor_ads', 'actor_clips', 'actor_stats', 'actor_training', 'actor_agents', 'actor_castings', 'actor_prizes', 'actor_skills', 'actor_shows'];
    SC.ACTOR_SECTIONS = ACTOR_KEYS;
    ART.models.acteur = {label: 'Acteur, actrice', order: [...ACTOR_KEYS, 'bio', 'identity', 'prizes', 'press', 'links', 'filmo', 'shows', 'concerts', 'biblio', 'discography', 'tracks', 'works', 'expos', 'photos'], hidden: ['filmo', 'shows', 'concerts', 'biblio', 'discography', 'tracks', 'works', 'expos', 'photos', 'actor_ads', 'actor_clips']};
    ART.profiles.actor.models = {acteur: ART.models.acteur};
    ART.profiles.actor.defaultModel = () => 'acteur';
    ART.profiles.actor.sections = ACTOR_KEYS;
    // pour « Cette personne était… » et la page combinée (heritage-profils.js) : groupe, sortes, frise, en-tête
    // « Tout mélangé » d'un acteur : l'ancienne « Filmographie » de l'artiste ferait doublon avec « Rôles · filmographie » et « Filmographie » de l'acteur
    if (ART.pageSections.filmo) ART.pageSections.filmo.hideIf = (C, view) => view === 'all' && SC.isActor(C.store);
    Object.assign(ART.profiles.actor, {group: 'creation', desc: 'rôles au cinéma, à la télévision, au théâtre, voix, publicité ; filmographie, statistiques',
        kinds: ['role', 'series', 'concert'],
        summary: st => actorSummary(SC.actorEntries(st)),
        sub: st => { const n = SC.actorEntries(st).length; return n ? plural(n, 'rôle') : ''; },
        hero: C => { const all = ents(C), cnt = k => all.filter(e => e.domain === k).length;
            return {eyebrow: `🎬 ${SC.actorWord(C.store).toLocaleUpperCase('fr-FR')}${DOMS.filter(d => cnt(d[0])).length ? ` · ${DOMS.filter(d => cnt(d[0])).map(d => d[2].toLocaleUpperCase('fr-FR')).slice(0, 5).join(', ')}` : ''}`, summary: actorSummary(all)}; },
        timeline: C => { const l = ents(C).filter(e => e.year); if (!l.length) return [];
            return DOMS.filter(d => l.some(e => e.domain === d[0])).map(d => ({label: `${d[1]} ${d[2]}`, bars: l.filter(e => e.domain === d[0]).map(e => { const y2 = Number(String(e.yearText || '').match(/(\d{4})\D*$/)?.[1]) || e.year; return {a: e.year, b: Math.max(e.year, y2), text: [U.refTitle(e.work), e.character].filter(Boolean).join(' · '), id: e.src === 'role' ? e.id : undefined}; })})); }});
    ART.defs.role.profile = 'actor'; ART.defs.profile_actor.profile = 'actor';
    // les autres modèles de page connaissent aussi ces sections (elles ne s'affichent que si le profil est coché)
    Object.entries(ART.models).forEach(([mk, m]) => { if (!m || !Array.isArray(m.order) || m === ART.models.acteur) return; const miss = ACTOR_KEYS.filter(k => !m.order.includes(k));
        if (mk === 'cineaste') m.order.splice(Math.max(0, m.order.indexOf('bio') + 1), 0, ...miss); else m.order.push(...miss); }); // « acteur » (discipline) → modèle Cinéaste : ses sections en tête
    ART.defs.profile_actor.scQuiet = true;
    ART.defs.role.scTab = store => store.of('role').length > 0 || SC.isActor(store);

    /* ═════════ Les clics ═════════ */
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', async e => {
        const b = e.target.closest?.('button'); const dlg = b?.closest('.ar-dlg'); if (!b || !dlg?._C || b.closest('.pk, .mpk')) return;
        const C = dlg._C, d = b.dataset;
        if (d.scAdom) { actorTab = d.scAdom; C.paint(false); return; }
        if (d.scRoletab) { C._scDom = d.scRoletab; C.S.view = 'list'; C.S.kind = 'role'; C.S.id = 0; C.paint(true); return; }
        if (d.scNewrole !== undefined) { C.newItem('role'); return; }
        if (d.scEditrole) { C.open(Number(d.scEditrole), {edit: true}); return; }
        if (d.scEditactor !== undefined) { const p = prof(C); if (p) C.open(p.id, {edit: true}); else C.newItem('profile_actor', {title: C.store.name}); return; }
        if (d.scMkrole) { const en = (C._scEntries || SC.actorEntries(C.store)).find(x => x.key === d.scMkrole); if (en) C.newItem('role', presetOf(en, C.store)); return; }
        if (d.scSetactor !== undefined) { b.disabled = true;
            try { await ART.write('set_profile', {person_id: C.pid, profile: 'actor', on: 1, label: ART.profiles.actor.label, icon: ART.profiles.actor.icon}); await C.reload(); C.paint(true); A().toast(`✓ Profil « ${SC.actorWord(C.store)} » coché : ses sections sont sur sa page.`, 'success'); }
            catch (er) { b.disabled = false; A().toast(er.message, 'error'); } }
    });
    if (typeof document !== 'undefined' && document.readyState !== 'complete' && typeof window.addEventListener === 'function') { document.addEventListener('DOMContentLoaded', lateKinds); window.addEventListener('load', lateKinds); } else setTimeout(lateKinds, 0);
})();
