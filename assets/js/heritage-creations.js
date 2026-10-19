/* LCNDA — 🎨 Listes « Créations et carrières » : toutes les fiches du moteur (docs/TYPES.md) de TOUTE la base, rangées par
 * grande famille (musique, scène, image animée, écrits, arts visuels, métiers d'art, inventions, expéditions, politique,
 * sport, formation, mes types…) et une liste générale « Tout ce qui a été créé ou vécu ».
 *
 *  - Barre H10 (UI.listBar) : 🔍 Chercher (titre, personne, lieu, année, champs texte) · Filtrer ▾ (Sorte avec le nombre,
 *    Personne et Lieu avec le menu de choix, Période, avec image, avec son ou vidéo) · Liste | Fiches · Trier ▾ ;
 *    interrupteur « Ranger par sorte » (intertitres « 🎵 Morceaux (34) ») ; « Voir les N suivants ↓ ». Tout est retenu.
 *  - Un clic ouvre la fiche dans son outil habituel (ART.openItem : catalogue de la personne, ou fenêtre des blocs) ;
 *    « ↗ » ouvre la fiche de la personne. « ＋ Nouveau… » : la personne (menu de choix), puis la sorte
 *    (fenêtre « Quelle sorte d'œuvre ? » d'heritage-oeuvres.js pour les œuvres).
 *  - Serveur : GET api.php?action=creations&op=list|summary (lib/creations.php), lecture seule, paginé.
 * Les clés des listes (« creations_music »…) sont rangées dans app.js (defaultListTypes) et app-listes.js (groupe « 🎨 »).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, ART = () => window.LCNDA_ART || null;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, w, pl) => (A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`);
    const toast = (...a) => A()?.toast?.(...a);
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const STEP = 60;

    /* ═════════ Les familles : clé serveur, clé de la liste, texte, colonnes, « ＋ Nouveau » ═════════
       cols : [titre, [champs à essayer dans « f » (valeurs à plat renvoyées par le serveur)]] ; oe = famille de « Quelle sorte d'œuvre ? » */
    const FAM = [
        {key: 'all', icon: '🎨', label: 'Tout ce qui a été créé ou vécu', intro: 'Toutes les fiches de toutes les personnes : œuvres, disques, livres, films, inventions, expéditions, mandats, clubs, diplômes…', cols: [['Détails', ['_sub']], ['Lieu', ['_place']]], oe: 'any'},
        {key: 'music', icon: '🎵', label: 'Musique', intro: 'Morceaux, albums et disques, enregistrements, concerts, tournées, œuvres de musique savante.', cols: [['Label', ['label', 'publisher']], ['N°', ['catno']], ['Format', ['format', 'rkind']], ['Durée', ['dur', 'duration']]], oe: 'music', what: 'Morceaux, albums, concerts…'},
        {key: 'stage', icon: '🎭', label: 'Scène', intro: 'Pièces de théâtre, mises en scène, représentations, tournées, ballets, cirque, humour…', cols: [['Auteur', ['author', 'authors']], ['Compagnie', ['company', 'troupe']], ['Salle, lieu', ['venue', '_place']]], oe: 'stage', what: 'Pièces, spectacles…'},
        {key: 'screen', icon: '🎬', label: 'Image animée', intro: 'Films, séries, saisons, épisodes, rôles, émissions, documentaires, podcasts…', cols: [['Personnage', ['character', 'role']], ['Réalisation', ['director']], ['Chaîne', ['channel']], ['Durée', ['duration', 'dur']]], oe: 'screen', what: 'Films, séries, rôles…'},
        {key: 'writing', icon: '📚', label: 'Écrits', intro: 'Livres, textes, poèmes, articles, essais, bandes dessinées, publications…', cols: [['Auteurs', ['authors', 'author']], ['Éditeur', ['publisher', 'journal', 'outlet']], ['ISBN, DOI', ['isbn', 'doi']]], oe: 'writing', what: 'Livres, articles…'},
        {key: 'visual', icon: '🖼', label: 'Arts visuels', intro: 'Peintures, dessins, gravures, sculptures et fontes, photographies, affiches, expositions…', cols: [['Technique', ['technique', 'material']], ['Dimensions', ['dims']], ['N° du catalogue', ['catref']], ['Lieu', ['_place', 'location']]], oe: 'visual', what: 'Peintures, sculptures, photos…'},
        {key: 'craft', icon: '⚒️', label: 'Design et métiers d’art', intro: 'Ferronnerie, céramique, verre, orfèvrerie, ébénisterie, lutherie, reliure, affiches et objets de design…', cols: [['Métier', ['metier']], ['Matériau', ['material', 'materials', 'technique']], ['Lieu', ['installed', '_place']]], oe: 'design', what: 'Pièces de métiers d’art…'},
        {key: 'space', icon: '🏛', label: 'Espace et paysage', intro: 'Bâtiments, jardins, monuments, décors, aménagements, ouvrages d’art.', cols: [['Détails', ['_sub']], ['Lieu', ['_place']]], oe: 'space'},
        {key: 'digital', icon: '💻', label: 'Numérique et jeux', intro: 'Jeux vidéo et de société, logiciels, sites, œuvres numériques, modèles 3D.', cols: [['Détails', ['_sub']], ['Plateforme', ['platform', 'platforms']]], oe: 'digital'},
        {key: 'hobby', icon: '🧩', label: 'Modélisme et loisirs créatifs', intro: 'Maquettes, réseaux miniatures, dioramas, figurines, tricot, albums, créations florales…', cols: [['Échelle', ['scale']], ['Détails', ['_sub']]], oe: 'hobby'},
        {key: 'taste', icon: '🍷', label: 'Saveurs et senteurs', intro: 'Recettes, cuvées, parfums, produits du terroir, variétés créées.', cols: [['Détails', ['_sub']], ['Lieu', ['_place']]], oe: 'taste'},
        {key: 'science', icon: '💡', label: 'Inventions et découvertes', intro: 'Inventions et leurs brevets, découvertes (espèce, comète, site…), publications scientifiques.', cols: [['Domaine', ['domain', 'field', 'dkind']], ['Où en est-elle', ['status']], ['Revue', ['journal', 'venue']], ['Lieu', ['_place']]], kinds: ['invention', 'discovery', 'paper'], what: 'Inventions, découvertes…'},
        {key: 'expeditions', icon: '🧭', label: 'Expéditions', intro: 'Expéditions et voyages d’exploration : itinéraire, membres, collectes.', cols: [['Région', ['region']], ['Sorte', ['ekind']], ['Résultat', ['result']]], kinds: ['expedition']},
        {key: 'politic', icon: '🏛', label: 'Parcours politiques', intro: 'Mandats et fonctions, élections, partis et groupes, textes et votes, discours.', cols: [['Fonction', ['fn', 'scrutin']], ['Institution', ['institution', 'constituency']], ['Parti', ['group', 'party', 'label']], ['Résultat', ['result', 'pct']]], kinds: ['pol_mandate', 'pol_election', 'pol_party', 'pol_text', 'pol_speech', 'pol_affair'], what: 'Mandats, élections…'},
        {key: 'sport', icon: '🏅', label: 'Sport', intro: 'Clubs et équipes, résultats, records, saisons.', cols: [['Sport', ['sport']], ['Épreuve', ['event', 'edition']], ['Classement', ['rank', 'position']], ['Performance', ['perf', 'medal']]], kinds: ['sp_club', 'sp_result', 'sp_record', 'sp_season'], what: 'Clubs, résultats, records…'},
        {key: 'school', icon: '🎓', label: 'Formation et diplômes', intro: 'Écoles, études et apprentissages, diplômes, établissements.', cols: [['Établissement', ['school']], ['Niveau, mention', ['level', 'mention', 'specialty']], ['Lieu', ['_place']]], kinds: ['school_step', 'diploma', 'school'], blocs: true, what: 'Écoles, diplômes…'},
        {key: 'mine', icon: '✎', label: 'Mes types d’œuvres', intro: 'Les fiches des types que tu as créés toi-même (« ✎ Créer mon propre type… »).', cols: [['Détails', ['_sub']], ['Lieu', ['_place']]], oe: 'mine'}];
    const famOf = k => FAM.find(f => f.key === k);
    const listKey = k => `creations_${k}`;
    ext.creations = {FAM, listKey};

    /** le nom, le pluriel et l'icône d'une sorte : la définition du navigateur, sinon celle du serveur */
    const kindInfo = (k, types = {}) => { const d = ART()?.defs?.[k], t = types[k] || {}; return {label: d?.label || t.label || k, many: d?.many || t.plural || t.label || k, icon: d?.icon || t.icon || '✦', fem: !!d?.fem}; };
    const yearOf = it => { const a = it.date_min ?? it.year, b = it.date_max ?? it.year; if (a == null && b == null) return it.date_text || ''; if (a != null && b != null && a !== b) return `${a}–${b}`; return String(a ?? b ?? ''); };
    /** la ligne grise qui ne redit que la date */
    const subSame = it => !it.sub || [String(it.year ?? ''), it.date_text, yearOf(it)].includes(String(it.sub).trim());
    const valOf = (it, keys) => { for (const k of keys) { const v = k === '_sub' ? (subSame(it) ? '' : it.sub) : k === '_place' ? it.place : it.f?.[k]; if (v != null && String(v).trim()) return String(v); } return ''; };
    const initials = n => String(n || '').split(/\s+/).map(w => (w.match(/\p{L}/u) || [''])[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
    const thumb = (it, cls, types) => it.thumb ? `<img class="${cls}" src="${esc(it.thumb)}" alt="" loading="lazy" data-cr-img>` : `<span class="${cls} is-empty" aria-hidden="true">${esc(kindInfo(it.kind, types).icon)}</span>`;

    /** la personne de la fiche (et deux personnes citées) */
    function whoHtml(it, short = false) {
        const own = it.owner ? `<button type="button" class="table-link cr-who" data-cr-person="${Number(it.person_id)}" title="Ouvrir la fiche de ${esc(it.owner)}"><span class="cr-av ${{male: 'm', female: 'f'}[it.owner_gender] || 'u'}" aria-hidden="true">${esc(initials(it.owner))}</span>${esc(it.owner)}</button>` : '';
        if (short) return own;
        const others = (it.people || []).filter(p => p.pid !== Number(it.person_id) && p.zone !== 'secondary').slice(0, 2);
        return own + (others.length ? `<small class="cr-with">avec ${others.map(p => esc(p.name) + (p.role ? ` <i>(${esc(p.role)})</i>` : '')).join(', ')}</small>` : '');
    }

    /* ═════════ Une liste ═════════ */
    let screenSeq = 0;
    async function screen(famKey, token) {
        const app = A(), ws = app.$('#workspace'), F = famOf(famKey), my = ++screenSeq;
        const alive = () => my === screenSeq && (token === undefined || token === app.state?.workspaceToken) && ws.contains(page);
        const key = `listes:${listKey(famKey)}`, gKey = `lcnda-creations-group:${famKey}`;
        ws.innerHTML = `<section class="page cr-page">${UI().spinner ? UI().spinner('Chargement…') : 'Chargement…'}</section>`;
        const page = ws.querySelector('.cr-page');
        let data = null, items = [], loading = 0, bar = null, sig = '', groupOn = readJ(gKey, true) !== false, summary = null;
        // la première page avec les réglages retenus (la barre se construit ensuite avec le nombre de chaque sorte)
        const saved = UI().listBarState?.(key) || null;
        const paramsOf = (st, offset = 0) => {
            const f = st?.filters || {}, pv = v => (v && typeof v === 'object' ? (v.id ? String(v.id) : '') : String(v || ''));
            const p = {op: 'list', family: famKey, q: st?.q || '', sort: st?.sort || 'az', group: groupOn ? 1 : 0, offset, limit: STEP};
            if (Array.isArray(f.kinds) && f.kinds.length) p.kinds = f.kinds.join(',');
            if (pv(f.person)) p.person = pv(f.person).replace(/^txt:.*/, '');
            if (pv(f.place)) p.place = pv(f.place);
            if (f.from) p.from = f.from; if (f.to) p.to = f.to;
            if (f.img) p.img = 1; if (f.av) p.av = 1;
            Object.keys(p).forEach(k => { if (p[k] === '' || p[k] == null) delete p[k]; });
            return p;
        };
        const fetchPage = async (st, offset) => app.api('creations', paramsOf(st, offset));
        try {
            const st0 = saved ? {q: saved.q || '', filters: saved.f || {}, sort: saved.sort || 'az'} : {q: '', filters: {}, sort: 'az'};
            [data, summary] = await Promise.all([fetchPage(st0, 0), famKey === 'all' ? app.api('creations', {op: 'summary'}).catch(() => null) : Promise.resolve(null)]);
        } catch (e) { if (my === screenSeq) ws.innerHTML = `<section class="page">${app.empty ? app.empty(e.message) : esc(e.message)}</section>`; return; }
        if (my !== screenSeq || (token !== undefined && token !== app.state?.workspaceToken)) return;
        items = data.items || [];
        const ro = !!data.readonly;
        page.innerHTML = `<header class="page-header"><div><span class="eyebrow">LISTES · CRÉATIONS ET CARRIÈRES</span><h2>${esc(F.icon)} ${esc(F.label)}</h2><p class="muted">${esc(F.intro)}</p></div>
            <div class="page-actions">${ro ? '' : `<button type="button" class="button" data-cr-new title="Choisir la personne, puis la sorte de fiche">＋ Nouveau…</button>`}</div></header>
            <nav class="cr-fams" data-cr-fams aria-label="Les autres listes"></nav><div data-cr-bar></div><div class="cr-body" data-cr-body aria-live="polite"></div><div class="list-more-wrap" data-cr-more></div>`;
        const body = page.querySelector('[data-cr-body]'), more = page.querySelector('[data-cr-more]'), barHost = page.querySelector('[data-cr-bar]');
        // « Tout » : les autres listes avec leur nombre, et les deux listes qui existaient déjà (Revue de presse, Palmarès)
        if (famKey === 'all' && summary) {
            const n = summary.families || {}, kn = summary.kinds || {};
            const chips = FAM.filter(f => f.key !== 'all' && (n[f.key] || 0) > 0).map(f => `<button type="button" class="cr-fam" data-cr-go="${esc(listKey(f.key))}">${esc(f.icon)} ${esc(f.label)} <b>${Number(n[f.key]).toLocaleString('fr-FR')}</b></button>`);
            const press = Number(kn.press_item || 0), aw = Number(kn.award || 0) + Number(kn.contest || 0);
            chips.push(`<button type="button" class="cr-fam is-other" data-cr-go="press_review" title="La liste « Revue de presse »">📰 Revue de presse${press ? ` <b>${press.toLocaleString('fr-FR')}</b>` : ''}</button>`, `<button type="button" class="cr-fam is-other" data-cr-go="palmares" title="La liste « Palmarès »">🏆 Palmarès${aw ? ` <b>${aw.toLocaleString('fr-FR')}</b>` : ''}</button>`);
            page.querySelector('[data-cr-fams]').innerHTML = chips.join('');
        } else page.querySelector('[data-cr-fams]').remove();

        const SORTS = [['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Plus récents'], ['old', 'Plus anciens'], ['year', 'Par date de l’œuvre'], ['year_desc', 'Par date, récentes d’abord'], ['person', 'Par personne'], ['kind', 'Par sorte']];
        function buildBar() {
            const counts = data.counts || {}, types = data.types || {}, chosen = bar?.state?.filters?.kinds || saved?.f?.kinds || [];
            const ks = [...new Set([...Object.keys(counts), ...chosen])].sort((a, b) => kindInfo(a, types).many.localeCompare(kindInfo(b, types).many, 'fr'));
            sig = ks.map(k => `${k}:${counts[k] || 0}`).join('|');
            const old = bar;
            bar = UI().listBar({key,
                search: {placeholder: 'Chercher… (titre, personne, lieu, année)'},
                filters: [
                    {id: 'kinds', group: 'Sorte', label: 'Sorte', type: 'check', options: ks.map(k => { const i = kindInfo(k, types); return [k, `${i.icon} ${i.many} (${(counts[k] || 0).toLocaleString('fr-FR')})`, `${i.icon} ${i.many}`]; })},
                    {id: 'person', group: 'Personne', label: 'Personne', type: 'person', chipPrefix: '👤', allowFree: false},
                    {id: 'from', group: 'Période', label: 'Depuis (année)', type: 'text', placeholder: 'ex. 1900', chipPrefix: 'Depuis'},
                    {id: 'to', group: 'Période', label: 'Jusqu’à (année)', type: 'text', placeholder: 'ex. 1950', chipPrefix: 'Jusqu’à'},
                    {id: 'place', group: 'Lieu', label: 'Lieu', type: 'place', chipPrefix: '📍'},
                    {id: 'img', group: 'Contenu', label: 'Avec image', text: '🖼 Avec image (pochette, affiche, photo)', chipLabel: '🖼 Avec image', type: 'check'},
                    {id: 'av', group: 'Contenu', label: 'Avec fichier son ou vidéo', text: '🎞 Avec un fichier son ou vidéo', chipLabel: '🎞 Son ou vidéo', type: 'check'}],
                view: {dflt: 'list', what: 'fiches'},
                sort: {options: SORTS, value: 'az'},
                onChange: (st, {what} = {}) => { reload(what); }});
            const tg = document.createElement('label'); tg.className = 'ui-toggle cr-grouptg'; tg.title = 'Ranger les fiches par sorte, avec un intertitre pour chacune';
            tg.innerHTML = `<input type="checkbox" data-cr-group ${groupOn ? 'checked' : ''}><i></i>Ranger par sorte`;
            bar.querySelector('.ui-listbar-row')?.appendChild(tg);
            tg.querySelector('input').addEventListener('change', e => { groupOn = e.target.checked; writeJ(gKey, groupOn); reload('group'); });
            if (old) old.replaceWith(bar); else barHost.appendChild(bar);
            bar.setCount(Number(data.total || 0), 'fiche');
        }
        let seq = 0;
        async function reload(what) {
            if (what === 'view') { paint(); return; }
            const mySeq = ++seq; body.classList.add('is-loading');
            try { const r = await fetchPage(bar.state, 0); if (mySeq !== seq || !page.isConnected) return; data = r; items = r.items || []; }
            catch (e) { if (mySeq === seq) { body.classList.remove('is-loading'); toast(e.message, 'error', {retry: () => reload()}); } return; }
            body.classList.remove('is-loading');
            const ks = Object.keys(data.counts || {}), types = data.types || {}, chosen = bar.state.filters.kinds || [];
            const nsig = [...new Set([...ks, ...chosen])].sort((a, b) => kindInfo(a, types).many.localeCompare(kindInfo(b, types).many, 'fr')).map(k => `${k}:${data.counts[k] || 0}`).join('|');
            if (nsig !== sig) buildBar(); else bar.setCount(Number(data.total || 0), 'fiche');
            paint();
        }
        async function loadMore(btn) {
            if (loading) return; loading = 1; btn.disabled = true;
            try { const r = await fetchPage(bar.state, items.length); if (!page.isConnected) return; items = items.concat(r.items || []); data.total = r.total; }
            catch (e) { toast(e.message, 'error'); } finally { loading = 0; }
            paint();
        }
        const filtersOn = st => !!(st.q || Object.values(st.filters).some(v => (Array.isArray(v) ? v.length : !!v)));
        function paint() {
            const st = bar.state, types = data.types || {}, total = Number(data.total || 0), counts = data.counts || {};
            if (!items.length) {
                body.innerHTML = filtersOn(st) ? A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre (« Tout effacer »).'})
                    : A().emptyState({icon: F.icon, text: famKey === 'all' ? 'Aucune création ni carrière pour l’instant' : `Aucune fiche « ${F.label} » pour l’instant`,
                        hint: famKey === 'mine' ? 'Crée d’abord ton type (« ✎ Créer mon propre type… » dans « ＋ Nouvelle œuvre »), puis ses fiches.' : 'Choisis la personne, puis la sorte de fiche : elle se range sur sa page et apparaît ici.',
                        action: ro ? null : {label: '＋ Nouveau…', attrs: 'data-cr-new'}});
                more.innerHTML = ''; return;
            }
            // les morceaux qui se suivent par sorte (rangement par sorte), sinon un seul bloc
            const runs = [];
            items.forEach(it => { const last = runs[runs.length - 1]; if (groupOn && st.sort !== 'kind' ? last && last.kind === it.kind : last) last.list.push(it); else runs.push({kind: it.kind, list: [it]}); });
            if (!groupOn && runs.length) runs.length = 1, runs[0].list = items;
            const head = r => { const i = kindInfo(r.kind, types); return groupOn ? `<h3 class="cr-kindh">${esc(i.icon)} ${esc(i.many)} <small>(${(counts[r.kind] || r.list.length).toLocaleString('fr-FR')})</small></h3>` : ''; };
            const groupHeads = groupOn && st.sort !== 'kind';
            if (st.view === 'cards') {
                body.innerHTML = runs.map(r => (groupHeads ? head(r) : '') + UI().cardsHtml(r.list.map(it => { const i = kindInfo(it.kind, types);
                    return {thumb: thumb(it, 'cr-cov', types), name: it.title, open: `data-cr-open="${it.id}"`, cls: 'cr-card',
                        lines: [`${i.icon} ${i.label}`, {html: whoHtml(it, true)}, [yearOf(it), it.place].filter(Boolean).join(' · '), it.av?.length ? (it.av.includes('video') ? '🎞 vidéo' : '🔊 son') : ''],
                        actions: it.person_id ? `<button type="button" class="icon-button small" data-cr-person="${Number(it.person_id)}" title="Ouvrir la fiche de ${esc(it.owner)}" aria-label="Ouvrir la fiche de ${esc(it.owner)}">↗</button>` : ''}; }))).join('');
            } else {
                const cols = F.cols || [];
                const thead = `<thead><tr><th class="cr-c-img"><span class="cr-sr">Image</span></th><th>Titre</th><th>Sorte</th><th>Personne(s)</th><th>Année</th>${cols.map(([l]) => `<th>${esc(l)}</th>`).join('')}<th class="cr-c-go"><span class="cr-sr">Ouvrir</span></th></tr></thead>`;
                const row = it => { const i = kindInfo(it.kind, types);
                    return `<tr data-cr-open="${it.id}" class="is-click" tabindex="0"><td class="cr-c-img">${thumb(it, 'cr-thumb', types)}</td><td class="cr-c-title"><b>${esc(it.title)}</b>${it.av?.length ? ` <span class="cr-av-badge" title="${it.av.includes('video') ? 'Avec une vidéo' : 'Avec un son'}">${it.av.includes('video') ? '🎞' : '🔊'}</span>` : ''}${it.sub && !cols.some(c => c[1].includes('_sub')) && !subSame(it) ? `<small class="muted cr-sub">${esc(it.sub)}</small>` : ''}</td>
                        <td class="cr-c-kind"><span class="cr-kind">${esc(i.icon)} ${esc(i.label)}</span></td><td class="cr-c-who">${whoHtml(it)}</td><td class="cr-c-year">${esc(yearOf(it))}</td>${cols.map(([, ks]) => `<td>${esc(valOf(it, ks))}</td>`).join('')}
                        <td class="cr-c-go">${it.person_id ? `<button type="button" class="icon-button small" data-cr-person="${Number(it.person_id)}" title="Ouvrir la fiche de ${esc(it.owner)}" aria-label="Ouvrir la fiche de ${esc(it.owner)}">↗</button>` : ''}</td></tr>`; };
                // un seul tableau (colonnes alignées) ; une ligne d'intertitre par sorte
                const span = 6 + cols.length, ghead = r => { const i = kindInfo(r.kind, types); return `<tr class="cr-grouprow"><th colspan="${span}" scope="rowgroup"><span class="cr-kindh">${esc(i.icon)} ${esc(i.many)} <small>(${(counts[r.kind] || r.list.length).toLocaleString('fr-FR')})</small></span></th></tr>`; };
                body.innerHTML = `<div class="ar-scroll cr-scroll"><table class="ar-t cr-table">${thead}${runs.map(r => `<tbody>${groupHeads ? ghead(r) : ''}${r.list.map(row).join('')}</tbody>`).join('')}</table></div>`;
            }
            more.innerHTML = '';
            if (total > items.length && UI().moreButton) more.appendChild(UI().moreButton({remaining: total - items.length, step: STEP, feminine: true, onClick: b => loadMore(b)}));
        }
        buildBar(); paint();
        body.addEventListener('error', e => { const im = e.target; if (im?.matches?.('img[data-cr-img]')) { const sp = document.createElement('span'); sp.className = `${im.className} is-empty`; sp.textContent = '🖼'; sp.title = 'Image introuvable'; im.replaceWith(sp); } }, true);
        page.addEventListener('click', async e => {
            const t = e.target.closest('[data-cr-person],[data-cr-open],[data-cr-new],[data-cr-go]'); if (!t || !page.contains(t)) return;
            if (t.dataset.crPerson) { e.stopPropagation(); return A().openPersonById?.(Number(t.dataset.crPerson)); }
            if (t.dataset.crGo) { const st = A().state; st.listType = t.dataset.crGo; A().renderSidebar?.(); return A().renderList?.(); }
            if (t.hasAttribute('data-cr-new')) return newItem(F);
            if (t.dataset.crOpen) return openItem(Number(t.dataset.crOpen));
        });
        page.addEventListener('keydown', e => { const r = e.target.closest?.('tr[data-cr-open]'); if (r && e.key === 'Enter' && e.target === r) { e.preventDefault(); openItem(Number(r.dataset.crOpen)); } });
    }
    /** ouvrir la fiche dans son outil (catalogue de la personne ; les blocs ont leur fenêtre) */
    function openItem(id) {
        const art = ART(); if (!id) return;
        if (art?.openItem) return art.openItem(id);
        if (ext.artistCatalog?.openItem) return ext.artistCatalog.openItem(id);
        toast('Cette fiche s’ouvre depuis la page de sa personne.');
    }

    /* ═════════ ＋ Nouveau… : la personne, puis la sorte ═════════ */
    async function newItem(F) {
        const P = window.LCNDA_PICKER || A();
        const who = await P.openPicker?.({kind: 'person', title: 'À qui se rattache cette fiche ?', eyebrow: 'NOUVELLE FICHE'});
        const pid = Number(who?.id) || 0; if (!pid) return;
        if (F.key === 'all') return chooseFamily(pid);
        return startIn(F, pid);
    }
    /** « Tout » : d'abord la famille */
    function chooseFamily(pid) {
        const fams = FAM.filter(f => f.key !== 'all');
        ext.openDialog?.({eyebrow: 'NOUVELLE FICHE', title: 'Quelle sorte de fiche ?', submitLabel: 'Annuler', wide: true,
            body: `<div class="cr-choose">${fams.map(f => `<button type="button" class="cr-fam" data-cr-pick="${esc(f.key)}">${esc(f.icon)} ${esc(f.label)}${f.what ? ` <small>${esc(f.what)}</small>` : ''}</button>`).join('')}</div>`,
            onOpen: dg => dg.addEventListener('click', ev => { const b = ev.target.closest('[data-cr-pick]'); if (!b) return; dg.close(); startIn(famOf(b.dataset.crPick), pid); }),
            onSubmit: () => true});
    }
    async function startIn(F, pid) {
        const art = ART();
        if (!art?.open) { toast('Les catalogues ne sont pas encore chargés : réessaie dans un instant.', 'error'); return; }
        // les œuvres : « Quelle sorte d'œuvre ? » (heritage-oeuvres.js), déjà filtrée sur la famille
        if (F.oe && art.oeuvres?.openChooser) {
            const fam = F.oe === 'any' ? '' : F.oe;
            const first = Object.keys(art.defs || {}).find(k => fam && art.oeuvres.famOf?.(k) === fam) || 'work';
            const C = await art.open(pid, {kind: first});
            if (!C) return;
            const dlg = art.oeuvres.openChooser(C, {mode: 'new'});
            if (fam) setTimeout(() => dlg?.querySelector?.(`[data-oe-fam="${CSS.escape(fam)}"]`)?.click(), 0);
            return;
        }
        const kinds = (F.kinds || []).filter(k => art.defs?.[k]);
        if (!kinds.length) { toast('Cette sorte de fiche n’est pas disponible.', 'error'); return; }
        const go = kind => (F.blocs && ext.blocs?.open ? ext.blocs.open({kind, pid, add: true}) : art.open(pid, {kind, add: true}));
        if (kinds.length === 1) return go(kinds[0]);
        ext.openDialog?.({eyebrow: 'NOUVELLE FICHE', title: `${F.icon} ${F.label} : quelle sorte ?`, submitLabel: 'Annuler',
            body: `<div class="cr-choose">${kinds.map(k => { const i = kindInfo(k); return `<button type="button" class="cr-fam" data-cr-kind="${esc(k)}">${esc(i.icon)} ${esc(i.label)}</button>`; }).join('')}</div>`,
            onOpen: dg => dg.addEventListener('click', ev => { const b = ev.target.closest('[data-cr-kind]'); if (!b) return; dg.close(); go(b.dataset.crKind); }),
            onSubmit: () => true});
    }

    FAM.forEach(f => { ext.lists[listKey(f.key)] = token => screen(f.key, token); });
})();
