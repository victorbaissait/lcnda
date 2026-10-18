/* LCNDA — 🗳 Le profil « Homme / femme politique » et 🏛 « Élu local » (maquette P de docs/design/profils-et-oeuvres.html).
 * Mandats et fonctions, élections, partis / groupes / commissions, textes et votes, gouvernement, discours, controverses,
 * carte des mandats, collaborateurs, frise de carrière — en sections qu'on range et qu'on cache (⚙️ Organiser le profil).
 * Sortes du moteur (serveur : lib/profils.php) : pol_mandate, pol_election, pol_party, pol_text, pol_speech, pol_affair,
 * et la fiche de profil profile_politic (une par personne ; l'élu local a la sienne : profile_elu_local).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, PF = ART?.PF; if (!ART?.define || !PF) return;
    const A = () => window.LCNDA_APP;
    const U = ART.util, esc = U.esc, plural = (n, w, pl) => U.plural(n, w, pl);
    const ext = window.LCNDA_EXT || {};
    const opt = l => l.map(x => Array.isArray(x) ? x : [x, x]);
    const lab = (l, v) => (l.find(x => x[0] === v) || [, v || ''])[1];
    const NOTES = {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]};
    const PRESS = {key: 'press', label: 'Presse', type: 'rows', star: false, addLabel: 'Un article', cols: [{key: 'paper', label: 'Journal', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'title', label: 'Titre', w: 'l'}]};
    const SRC = {key: 'sources', label: 'Sources', icon: '📚', zone: 'right', fields: [{key: 'sources', label: 'Sources', type: 'longtext', star: false}, PRESS]};

    const FN = opt([['maire', 'Maire'], ['adjoint', 'Adjoint au maire'], ['conseiller_m', 'Conseiller municipal'], ['conseiller_c', 'Conseiller communautaire'], ['pres_epci', 'Président d’intercommunalité'], ['conseiller_g', 'Conseiller général / départemental'], ['pres_dep', 'Président du conseil départemental'], ['conseiller_r', 'Conseiller régional'], ['pres_reg', 'Président de région'], ['depute', 'Député'], ['senateur', 'Sénateur'], ['depute_eu', 'Député européen'], ['ministre', 'Ministre'], ['ministre_d', 'Ministre délégué'], ['secretaire_e', 'Secrétaire d’État'], ['premier', 'Premier ministre'], ['president', 'Président de la République'], ['commission', 'Président, membre d’une commission'], ['parti', 'Responsable de parti'], ['prefet', 'Préfet, sous-préfet'], ['ambassadeur', 'Ambassadeur, consul'], ['autre', 'Autre fonction']]);
    const LEVEL = opt([['communal', 'communal'], ['intercommunal', 'intercommunal'], ['departemental', 'départemental'], ['regional', 'régional'], ['national', 'national'], ['europeen', 'européen'], ['gouvernement', 'gouvernement'], ['nominatif', 'nominatif'], ['parti', 'parti'], ['autre', 'autre']]);
    const LEVEL_OF = {maire: 'communal', adjoint: 'communal', conseiller_m: 'communal', conseiller_c: 'intercommunal', pres_epci: 'intercommunal', conseiller_g: 'departemental', pres_dep: 'departemental', conseiller_r: 'regional', pres_reg: 'regional', depute: 'national', senateur: 'national', depute_eu: 'europeen', ministre: 'gouvernement', ministre_d: 'gouvernement', secretaire_e: 'gouvernement', premier: 'gouvernement', president: 'national', commission: 'nominatif', parti: 'parti', prefet: 'nominatif', ambassadeur: 'nominatif'};
    const MODE = opt([['', '—'], ['elu', 'élu'], ['reelu', 'réélu'], ['nomme', 'nommé'], ['designe', 'désigné'], ['interim', 'par intérim']]);
    const SCRUTIN = opt([['municipales', 'Municipales'], ['cantonales', 'Cantonales / départementales'], ['regionales', 'Régionales'], ['legislatives', 'Législatives'], ['senatoriales', 'Sénatoriales'], ['europeennes', 'Européennes'], ['presidentielle', 'Présidentielle'], ['referendum', 'Référendum'], ['partielle', 'Élection partielle'], ['interne', 'Interne au parti'], ['autre', 'Autre']]);
    const ROUND = opt([['unique', 'unique'], ['1', '1er'], ['2', '2e'], ['3', '3e']]);
    const RESULT = opt([['', '—'], ['elu', 'élu'], ['reelu', 'réélu'], ['tete', 'en tête'], ['2tour', '2e tour'], ['battu', 'battu'], ['retire', 'retiré']]);
    const WON = new Set(['elu', 'reelu']);
    const PARTYK = opt([['parti', 'Parti'], ['groupe', 'Groupe parlementaire'], ['commission', 'Commission'], ['courant', 'Courant, tendance'], ['syndicat', 'Syndicat'], ['association', 'Association, club'], ['autre', 'Autre']]);
    const TEXTK = opt([['ppl', 'Proposition de loi'], ['pjl', 'Projet de loi'], ['amendement', 'Amendement'], ['rapport', 'Rapport'], ['question', 'Question écrite ou orale'], ['decret', 'Décret'], ['arrete', 'Arrêté'], ['deliberation', 'Délibération municipale'], ['vote', 'Vote (scrutin public)'], ['motion', 'Motion'], ['autre', 'Autre']]);
    const ROLE = opt([['', '—'], ['auteur', 'auteur'], ['rapporteur', 'rapporteur'], ['signataire', 'signataire'], ['cosignataire', 'cosignataire'], ['votant', 'votant']]);
    const VOTE = opt([['', '—'], ['pour', 'pour'], ['contre', 'contre'], ['abstention', 'abstention'], ['absent', 'absent'], ['nv', 'non-votant']]);
    const OUTCOME = opt([['', '—'], ['adopte', 'adopté'], ['rejete', 'rejeté'], ['retire', 'retiré'], ['cours', 'en cours']]);
    const AFFAIR = opt([['', '—'], ['cours', 'en cours'], ['nonlieu', 'non-lieu'], ['relaxe', 'relaxe'], ['classement', 'classement sans suite'], ['condamnation', 'condamnation'], ['prescription', 'prescription']]);
    const P = 'politic';
    const ofP = (st, k) => ART.sortItems ? ART.sortItems(st.of(k), 'year') : st.of(k);
    const sortY = l => [...l].sort((a, b) => (PF.year(a.data.date) || 9999) - (PF.year(b.data.date) || 9999));

    /* ═════════ Les sortes ═════════ */
    const common = {domain: 'politic', profile: P, sorts: [['year', 'Par date'], ['az', 'A → Z']]};
    ART.define({...common, key: 'pol_mandate', icon: '🏛', label: 'Mandat, fonction', many: 'Mandats et fonctions', tab: 'Mandats',
        eyebrow: it => `Mandat · ${lab(LEVEL, it.data.level) || 'fonction'}`, newData: () => ({fn: 'maire', level: 'communal', mode: 'elu'}),
        beforeSave: d => { if (!d.level && LEVEL_OF[d.fn]) d.level = LEVEL_OF[d.fn]; },
        groups: [{key: 'main', label: 'La fonction', icon: '🏛', zone: 'main', fields: [
            {key: 'title', label: 'Intitulé', type: 'text', star: true, head: true, ph: 'Maire de Tulle, Député de la Corrèze…'},
            {key: 'fn', label: 'Fonction', type: 'select', star: true, choices: FN}, {key: 'level', label: 'Niveau', type: 'select', star: true, choices: LEVEL},
            {key: 'place', label: 'Où (commune, département…)', type: 'place', star: true}, {key: 'constituency', label: 'Circonscription, canton', type: 'text', star: true, ph: '1re circonscription, canton de Tulle-Nord'},
            {key: 'institution', label: 'Assemblée, institution', type: 'text', star: false, ph: 'Assemblée nationale, conseil municipal…'},
            {key: 'date', label: 'Début', type: 'date', star: true}, {key: 'end', label: 'Fin', type: 'date', star: true, ph: 'vide = en cours, ou « en cours »'},
            {key: 'mode', label: 'Comment', type: 'select', star: true, choices: MODE}, {key: 'group', label: 'Groupe, parti', type: 'item', kinds: ['pol_party'], star: true},
            {key: 'predecessor', label: 'Prédécesseur', type: 'person', star: true}, {key: 'successor', label: 'Successeur', type: 'person', star: true}]},
            {key: 'gov', label: 'Gouvernement', icon: '🏢', zone: 'main', fields: [{key: 'government', label: 'Gouvernement', type: 'text', star: false, ph: 'gouvernement Mendès France'}, {key: 'portfolio', label: 'Portefeuille', type: 'text', star: false, ph: 'Agriculture'}, {key: 'head', label: 'Chef du gouvernement', type: 'person', star: false}, {key: 'cabinet', label: 'Cabinet', type: 'people', star: false, rolePh: 'directeur de cabinet…'}]},
            {key: 'work', label: 'Réalisations', icon: '🏗', zone: 'main', fields: [{key: 'achievements', label: 'Réalisations, dossiers', type: 'longtext', star: true}]}, SRC, NOTES],
        list: ['title', 'level', 'place', 'date', 'end'], card: ['date', 'level'], export: ['title', 'fn', 'level', 'place', 'constituency', 'date', 'end', 'mode', 'group', 'predecessor', 'successor', 'achievements'],
        filters: () => [{id: 'lvl', label: 'Niveau', type: 'check', options: LEVEL, test: (it, v) => !v.length || v.includes(it.data.level)}],
        cardLine: it => PF.years(it.data.date, it.data.end)});
    ART.define({...common, key: 'pol_election', icon: '🗳', label: 'Élection', many: 'Élections', fem: true,
        eyebrow: it => `Élection · ${lab(SCRUTIN, it.data.scrutin) || ''}`, newData: () => ({scrutin: 'municipales', round: '1', result: ''}),
        groups: [{key: 'main', label: 'Le scrutin', icon: '🗳', zone: 'main', fields: [
            {key: 'title', label: 'Intitulé', type: 'text', star: true, head: true, ph: 'Législatives 1951, Municipales de Tulle 1947…'},
            {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'scrutin', label: 'Scrutin', type: 'select', star: true, choices: SCRUTIN}, {key: 'round', label: 'Tour', type: 'select', star: true, choices: ROUND},
            {key: 'place', label: 'Circonscription, commune', type: 'place', star: true}, {key: 'constituency', label: 'Précision', type: 'text', star: false, ph: '1re circonscription'},
            {key: 'label', label: 'Étiquette, liste', type: 'text', star: true}, {key: 'party', label: 'Parti', type: 'item', kinds: ['pol_party'], star: false}]},
            {key: 'figures', label: 'Les chiffres', icon: '🔢', zone: 'main', fields: [{key: 'registered', label: 'Inscrits', type: 'number', star: false}, {key: 'voters', label: 'Votants', type: 'number', star: false}, {key: 'expressed', label: 'Exprimés', type: 'number', star: false},
                {key: 'votes', label: 'Voix', type: 'number', star: true}, {key: 'pct', label: '%', type: 'number', star: true, unit: '%'}, {key: 'result', label: 'Résultat', type: 'select', star: true, choices: RESULT}]},
            {key: 'others', label: 'Colistiers et adversaires', icon: '👥', zone: 'main', fields: [{key: 'mates', label: 'Colistiers', type: 'people', star: false, rolePh: 'tête de liste, colistier…'},
                {key: 'opponents', label: 'Adversaires', type: 'rows', star: true, addLabel: 'Un adversaire', cols: [{key: 'who', label: 'Adversaire', type: 'person', w: 'l'}, {key: 'party', label: 'Parti, liste', w: 'm'}, {key: 'votes', label: 'Voix', w: 's'}, {key: 'pct', label: '%', w: 's'}]}]},
            {key: 'docs', label: 'Documents', icon: '🪧', zone: 'left', fields: [{key: 'poster', label: 'Affiche', type: 'media', star: true, media: ['image']}, {key: 'manifesto', label: 'Profession de foi', type: 'media', star: true, media: ['image', 'document']}]},
            {key: 'communes', label: 'Résultats par commune', icon: '📍', zone: 'main', fields: [{key: 'by_commune', label: 'Résultats par commune', type: 'rows', star: false, addLabel: 'Une commune', cols: [{key: 'place', label: 'Commune', type: 'place', w: 'l'}, {key: 'registered', label: 'Inscrits', w: 's'}, {key: 'votes', label: 'Voix', w: 's'}, {key: 'pct', label: '%', w: 's'}]}]}, SRC, NOTES],
        list: ['title', 'date', 'scrutin', 'round', 'votes', 'pct', 'result'], card: ['date', 'result'], export: ['title', 'date', 'scrutin', 'round', 'place', 'label', 'registered', 'voters', 'votes', 'pct', 'result', 'opponents'],
        filters: () => [{id: 'res', label: 'Résultat', type: 'check', options: [['won', 'gagnées'], ['lost', 'perdues']], test: (it, v) => !v.length || v.includes(WON.has(it.data.result) ? 'won' : 'lost')}, {id: 'scr', label: 'Scrutin', type: 'check', options: SCRUTIN, test: (it, v) => !v.length || v.includes(it.data.scrutin)}],
        summary: l => ` · ${l.filter(e => WON.has(e.data.result)).length} gagnée${l.filter(e => WON.has(e.data.result)).length > 1 ? 's' : ''}`,
        cardLine: it => [it.data.date, lab(RESULT, it.data.result)].filter(Boolean).join(' · ')});
    ART.define({...common, key: 'pol_party', icon: '👥', label: 'Parti, groupe, commission', many: 'Partis, groupes, commissions', tab: 'Partis',
        newData: () => ({pkind: 'parti'}),
        groups: [{key: 'main', label: 'L’appartenance', icon: '👥', zone: 'main', fields: [{key: 'title', label: 'Nom', type: 'text', star: true, head: true, ph: 'Parti radical, groupe UDSR, commission de l’agriculture…'},
            {key: 'pkind', label: 'Sorte', type: 'select', star: true, choices: PARTYK}, {key: 'org', label: 'Organisation (fiche)', type: 'item', kinds: ['org'], star: false},
            {key: 'date', label: 'De', type: 'date', star: true}, {key: 'end', label: 'À', type: 'date', star: true}, {key: 'role', label: 'Rôle, responsabilité', type: 'text', star: true, ph: 'secrétaire fédéral, membre du bureau, président'}]}, NOTES],
        list: ['title', 'pkind', 'date', 'end', 'role'], cardLine: it => PF.years(it.data.date, it.data.end)});
    ART.define({...common, key: 'pol_text', icon: '📜', label: 'Texte, vote', many: 'Textes, votes, propositions', tab: 'Textes',
        newData: () => ({tkind: 'ppl', role: 'auteur'}),
        groups: [{key: 'main', label: 'Le texte', icon: '📜', zone: 'main', fields: [{key: 'title', label: 'Titre, objet', type: 'text', star: true, head: true, ph: 'sur les calamités agricoles'},
            {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'tkind', label: 'Sorte', type: 'select', star: true, choices: TEXTK}, {key: 'number', label: 'N°', type: 'text', star: true},
            {key: 'role', label: 'Son rôle', type: 'select', star: true, choices: ROLE}, {key: 'vote', label: 'Son vote', type: 'select', star: true, choices: VOTE}, {key: 'outcome', label: 'Issue', type: 'select', star: true, choices: OUTCOME},
            {key: 'url', label: 'Lien (Légifrance, Assemblée…)', type: 'url', star: false}, {key: 'doc', label: 'Document', type: 'media', star: false, media: ['image', 'document']}]}, NOTES],
        list: ['title', 'date', 'tkind', 'number', 'role', 'vote'], cardLine: it => [it.data.date, lab(TEXTK, it.data.tkind)].filter(Boolean).join(' · '),
        filters: () => [{id: 'tk', label: 'Sorte', type: 'check', options: TEXTK, test: (it, v) => !v.length || v.includes(it.data.tkind)}]});
    ART.define({...common, key: 'pol_speech', icon: '🗣', label: 'Discours', many: 'Discours',
        groups: [{key: 'main', label: 'Le discours', icon: '🗣', zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'place', label: 'Lieu', type: 'place', star: true},
            {key: 'occasion', label: 'Occasion', type: 'text', star: true, ph: 'inauguration, 11 Novembre, séance…'}, {key: 'text', label: 'Texte', type: 'longtext', star: true, rows: 8}, {key: 'recording', label: 'Enregistrement', type: 'media', star: true, media: ['audio', 'video']}]}, SRC, NOTES],
        list: ['title', 'date', 'place', 'occasion']});
    ART.define({...common, key: 'pol_affair', icon: '⚠️', label: 'Controverse, affaire', many: 'Controverses, affaires', fem: true, tab: 'Controverses',
        groups: [{key: 'main', label: 'L’affaire', icon: '⚠️', zone: 'main', fields: [{key: 'title', label: 'Nom', type: 'text', star: true, head: true, ph: '« affaire des marchés de la caserne »'}, {key: 'date', label: 'Date', type: 'date', star: true},
            {key: 'desc', label: 'Ce qui s’est passé', type: 'longtext', star: true}, {key: 'outcome', label: 'Issue', type: 'select', star: true, choices: AFFAIR}, {key: 'outcome_date', label: 'Date de l’issue', type: 'date', star: true}]}, SRC, NOTES],
        list: ['title', 'date', 'outcome', 'outcome_date']});
    // la fiche du profil (une par personne)
    const profileDef = (key, label, icon) => ART.define({key, icon, label, many: 'Profils', domain: 'profile', hidden: true, linked: false, profile: key.slice(8),
        eyebrow: () => `${icon} ${label}`, newData: st => ({title: PF.female(st) ? 'Femme politique' : 'Homme politique'}),
        groups: [{key: 'main', label: 'En bref', icon, zone: 'main', fields: [{key: 'title', label: 'En une ligne', type: 'text', star: true, ph: 'Maire, député, secrétaire d’État'},
            {key: 'family', label: 'Famille politique', type: 'text', star: true, ph: 'Radical puis UDSR'}, {key: 'bio', label: 'Parcours politique', type: 'longtext', star: true, rows: 6}]},
            {key: 'ids', label: 'Bases et liens', icon: '🔗', zone: 'right', fields: [{key: 'sycomore', label: 'Base Sycomore (Assemblée)', type: 'ident', star: true, ph: '1234', href: v => /^\d+$/.test(v) ? `https://www2.assemblee-nationale.fr/sycomore/fiche/(num_dept)/${v}` : v},
                {key: 'senat', label: 'Sénat', type: 'url', star: false}, {key: 'wikidata', label: 'Wikidata', type: 'ident', star: true, ph: 'Q12345', href: v => /^Q\d+$/i.test(v) ? `https://www.wikidata.org/wiki/${v.toUpperCase()}` : v},
                {key: 'links', label: 'Autres liens', type: 'rows', star: true, addLabel: 'Un lien', cols: [{key: 'label', label: 'Nom', w: 'm'}, {key: 'url', label: 'Adresse', type: 'url', w: 'l'}]}]},
            {key: 'team', label: 'Collaborateurs', icon: '🤝', zone: 'main', fields: [{key: 'collaborators', label: 'Collaborateurs', type: 'people', star: true, rolePh: 'secrétaire, attaché, suppléant…'}]},
            {key: 'books', label: 'Ouvrages', icon: '📚', zone: 'main', fields: [{key: 'books', label: 'Ouvrages', type: 'items', kinds: ['book'], star: true}]}, NOTES]});
    profileDef('profile_politic', 'Profil politique', '🗳');
    profileDef('profile_elu_local', 'Profil d’élu local', '🏛');

    /* ═════════ Les sections de la page ═════════ */
    const S = ART.pageSections;
    const fiche = st => st.of('profile_politic')[0] || st.of('profile_elu_local')[0] || null;
    const editP = st => PF.editBtn(st.of('profile_politic')[0] || !st.of('profile_elu_local')[0] ? (PF.keysOf(st).includes('politic') ? 'politic' : 'elu_local') : 'elu_local');
    const open = (it, txt) => `<button type="button" class="ar-linkbtn" data-ar-open="${it.id}">${txt}</button>`;
    const fnLabel = it => it.title || lab(FN, it.data.fn);
    const mandates = st => sortY(st.of('pol_mandate'));
    const mElect = m => !['gouvernement', 'nominatif', 'parti'].includes(m.data.level);
    S.pol_mandates = {icon: '🏛', label: 'Mandats et fonctions', w: 'ligne', profile: P, render: C => {
        const st = C.store, l = mandates(st), ctx = l[0] ? ART.ctx(st, l[0]) : null;
        const body = l.length ? `<div class="ar-scroll"><table class="ar-t pf-t"><thead><tr><th>Fonction</th><th>Niveau</th><th>Où</th><th>Dates</th><th>Prédécesseur</th><th>Successeur</th></tr></thead><tbody>${l.map(m => { const d = m.data;
            return `<tr><td>${open(m, `<b>${esc(fnLabel(m))}</b>`)}${d.group ? ` · <small>${esc(U.refTitle(d.group))}</small>` : ''}${d.portfolio ? ` <small>· ${esc(d.portfolio)}</small>` : ''}</td><td>${esc(lab(LEVEL, d.level))}</td><td>${U.placeChip(d.place)}${d.constituency ? ` <small>${esc(d.constituency)}</small>` : ''}${!d.place && d.government ? esc(d.government) : ''}</td><td>${esc(PF.years(d.date, d.end))}</td><td>${U.personChip(d.predecessor, '', ctx) || '—'}</td><td>${U.personChip(d.successor, '', ctx) || '—'}</td></tr>`; }).join('')}</tbody></table></div>`
            : PF.muted('Aucun mandat noté : maire, conseiller, député, ministre… « ＋ Ajouter ».');
        return {body, count: l.length || '', empty: !l.length, head: '<small class="ar-g">électifs et nominatifs</small>', actions: `${PF.newBtn('pol_mandate')}${l.length ? PF.allBtn('pol_mandate') : ''}`};
    }};
    S.pol_elections = {icon: '🗳', label: 'Élections', w: 'ligne', profile: P, render: C => {
        const st = C.store, l = sortY(st.of('pol_election')), won = l.filter(e => WON.has(e.data.result)).length, ctx = l[0] ? ART.ctx(st, l[0]) : null;
        const res = r => !r ? '' : PF.res(lab(RESULT, r), WON.has(r) ? 'w' : r === 'battu' ? 'l' : '');
        const body = l.length ? `<div class="ar-scroll"><table class="ar-t pf-t"><thead><tr><th>Date</th><th>Scrutin</th><th>Tour</th><th>Voix</th><th>%</th><th>Résultat</th><th>Adversaires</th><th>Affiche</th></tr></thead><tbody>${l.slice(0, 12).map(e => { const d = e.data;
            return `<tr><td>${open(e, esc(d.date || e.year || '?'))}</td><td>${esc([lab(SCRUTIN, d.scrutin), U.placeTitle(d.place), d.constituency].filter(Boolean).join(' · '))}</td><td>${esc(lab(ROUND, d.round))}</td><td>${esc(String(d.votes || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' '))}</td><td>${esc(String(d.pct || '').replace('.', ','))}</td><td>${res(d.result)}</td><td>${(d.opponents || []).slice(0, 3).map(o => U.personChip(o.who, '', ctx) || esc(o.party || '')).join(' ')}</td><td>${ART.mediaOf(d.poster) ? `<button type="button" class="ar-ochip is-link" data-ar-open="${e.id}"><i>🪧</i>${esc(PF.year(d.date) || 'affiche')}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>${l.length > 12 ? `<p class="muted">… et ${l.length - 12} de plus (« Tout voir »).</p>` : ''}`
            : PF.muted('Aucune élection notée.');
        return {body, count: l.length ? `${l.length} · ${won} gagnée${won > 1 ? 's' : ''}` : '', empty: !l.length, actions: `${PF.newBtn('pol_election')}${l.length ? PF.allBtn('pol_election') : ''}`};
    }};
    S.pol_texts = {icon: '📜', label: 'Textes, votes, propositions', w: '½', profile: P, render: C => {
        const l = sortY(C.store.of('pol_text')), votes = l.filter(t => t.data.tkind === 'vote').length;
        return {body: l.length ? `${l.slice(0, 6).map(t => `<div>${esc(PF.year(t.data.date) || t.data.date || '')} · ${open(t, `<b>${esc(lab(TEXTK, t.data.tkind))}</b>${t.data.number ? ` n° ${esc(t.data.number)}` : ''} ${esc(t.title)}`)}${t.data.role ? ` · ${esc(lab(ROLE, t.data.role))}` : ''}${t.data.vote ? ` · <b>${esc(lab(VOTE, t.data.vote))}</b>` : ''}</div>`).join('')}<small class="ar-g">${esc([plural(l.length - votes, 'texte'), votes && plural(votes, 'vote')].filter(Boolean).join(' · '))}</small>` : PF.muted('Aucun texte ni vote noté.'),
            count: l.length || '', empty: !l.length, actions: `${PF.newBtn('pol_text', '＋')}${l.length ? PF.allBtn('pol_text') : ''}`};
    }};
    S.pol_parties = {icon: '👥', label: 'Partis, groupes, commissions', w: '½', profile: P, render: C => {
        const l = sortY(C.store.of('pol_party'));
        return {body: l.length ? l.map(p => `<div><button type="button" class="ar-ochip is-link" data-ar-open="${p.id}"><i>🏷</i>${esc(p.title)}</button> ${esc([PF.years(p.data.date, p.data.end), p.data.role].filter(Boolean).join(' · '))} <small class="ar-g">${esc(lab(PARTYK, p.data.pkind))}</small></div>`).join('') : PF.muted('Aucun parti ni groupe noté.'),
            count: l.length || '', empty: !l.length, actions: PF.newBtn('pol_party', '＋')};
    }};
    S.pol_gov = {icon: '🏢', label: 'Gouvernement', w: '⅓', profile: P, render: C => {
        const st = C.store, l = mandates(st).filter(m => m.data.level === 'gouvernement'), ctx = l[0] ? ART.ctx(st, l[0]) : null;
        return {body: l.length ? l.map(m => `<div>${open(m, `<b>${esc(fnLabel(m))}</b>`)}${m.data.portfolio ? ` · ${esc(m.data.portfolio)}` : ''}<br><small class="ar-g">${esc([m.data.government, PF.years(m.data.date, m.data.end)].filter(Boolean).join(' · '))}</small>${m.data.head ? ` ${U.personChip(m.data.head, 'chef du gouvernement', ctx)}` : ''}</div>`).join('') : PF.muted('Aucun portefeuille (un mandat de niveau « gouvernement »).'), count: l.length || '', empty: !l.length};
    }};
    S.pol_speeches = {icon: '🗣', label: 'Discours', w: '⅓', profile: P, render: C => {
        const l = sortY(C.store.of('pol_speech')), rec = l.filter(s => ART.mediaOf(s.data.recording)).length;
        return {body: l.length ? `<p>${esc(plural(l.length, 'discours', 'discours'))}${rec ? ` · dont ${rec} enregistré${rec > 1 ? 's' : ''}` : ''}</p>${l.slice(-3).map(s => `<div>${open(s, esc([s.data.date, s.title].filter(Boolean).join(' · ')))}</div>`).join('')}` : PF.muted('Aucun discours noté.'), count: l.length || '', empty: !l.length, actions: `${PF.newBtn('pol_speech', '＋')}${l.length ? PF.allBtn('pol_speech') : ''}`};
    }};
    S.pol_decorations = {icon: '🎖', label: 'Décorations', w: '⅓', profile: P, render: C => {
        if (!ext.awards?.listFor) return {body: PF.muted('Les décorations se notent dans le bloc commun « 🏆 Concours et récompenses ».'), empty: true};
        const l = PF.later(C, 'decorations', () => ext.awards.listFor(C.pid, {category: 'decoration'})); if (!l) return {body: PF.loading};
        return {body: l.length ? ext.awards.tableHtml(l, C.pid) : PF.muted('Aucune décoration : bloc « 🏆 Concours et récompenses » de la fiche (catégorie Décoration).'), count: l.length || '', empty: !l.length};
    }};
    S.pol_map = {icon: '🗺', label: 'Carte des mandats', w: '⅓', profile: P, render: C => {
        const st = C.store, by = new Map();
        [...st.of('pol_mandate'), ...st.of('pol_election')].forEach(it => { const p = U.place(it.data.place); if (!p) return; const k = p.plid || p.txt; const o = by.get(k) || {p, n: 0}; o.n++; by.set(k, o); });
        if (!by.size) return {body: PF.muted('Les lieux des mandats et des élections se placent ici.'), empty: true};
        const pl = [...by.values()], need = pl.filter(x => x.p.plid && !PF.coords[x.p.plid]).map(x => x.p.plid);
        if (need.length && !st._pfCoords) st._pfCoords = PF.loadCoords(need).then(() => { if (C.S.view === 'page' && C.dlg.isConnected) C.paint(false); });
        const pts = pl.map(x => ({...(PF.coords[x.p.plid] || {}), label: `${x.p.title || x.p.txt} (${x.n})`, n: x.n > 1 ? x.n : 0, color: '#055dff', showLabel: true})).filter(x => Number.isFinite(x.lat));
        const map = pts.length && ext.miniMap ? ext.miniMap(pts, [], {height: 220}) : '';
        return {body: `${map}<div class="ar-chipsrow">${pl.map(x => `${U.placeChip(x.p.plid ? {plid: x.p.plid, title: x.p.title} : x.p.txt)}<small class="ar-g">${x.n}</small>`).join(' ')}</div>`, count: pl.length};
    }};
    S.pol_collab = {icon: '🤝', label: 'Collaborateurs', w: '⅓', profile: P, render: C => {
        const st = C.store, it = fiche(st), l = ART.normPeople(it?.data?.collaborators || []), ctx = it ? ART.ctx(st, it) : null;
        return {body: l.length ? `${l.slice(0, 3).map(r => U.personChip(r, r.role, ctx)).join(' ')}${l.length > 3 ? ` + ${l.length - 3}` : ''}` : PF.muted('Secrétaire, suppléant, attachés… : « … » pour les noter.'), count: l.length || '', empty: !l.length, actions: editP(st)};
    }};
    S.pol_affairs = {icon: '⚠️', label: 'Controverses, affaires', w: '⅓', profile: P, render: C => {
        const l = sortY(C.store.of('pol_affair'));
        return {body: l.length ? l.map(a => `<div>${esc(PF.year(a.data.date) || '')} · ${open(a, `« ${esc(a.title)} »`)}${a.data.outcome ? ` · ${esc(lab(AFFAIR, a.data.outcome))}${PF.year(a.data.outcome_date) ? ` ${PF.year(a.data.outcome_date)}` : ''}` : ''}${(a.data.press || []).length ? ` · 📰 ${a.data.press.length}` : ''}</div>`).join('') : PF.muted('Aucune affaire notée.'), count: l.length || '', empty: !l.length, actions: PF.newBtn('pol_affair', '＋')};
    }};
    S.pol_books = {icon: '📚', label: 'Ouvrages · médias', w: '⅓', profile: P, render: C => {
        const st = C.store, it = fiche(st), own = (it?.data?.books || []).length, bk = st.of('book').length;
        return {body: `<p>${esc([Math.max(own, bk) && plural(Math.max(own, bk), 'livre'), (it?.data?.press || []).length && plural(it.data.press.length, 'article')].filter(Boolean).join(' · ') || 'Aucun ouvrage noté.')}</p>${(it?.data?.books || []).slice(0, 4).map(b => U.refChip(b, '📚')).join(' ')}`, empty: !own && !bk, actions: editP(st)};
    }};
    S.pol_bio = {icon: '📝', label: 'Parcours politique', w: 'ligne', profile: P, render: C => { const st = C.store, it = fiche(st), b = it?.data?.bio; return {body: b ? `<div class="ar-long">${esc(b).replace(/\n/g, '<br>')}</div>` : PF.muted('Pas encore de texte : « … » pour l’écrire.'), empty: !b, actions: editP(st)}; }};

    /* les coordonnées des lieux (carte des mandats) */
    PF.coords = PF.coords || {};
    PF.loadCoords = async ids => { try { const r = await A().api('picker_search', {kind: 'place', ids: ids.slice(0, 60).join(','), limit: 60}); [...(r.items || []), ...(r.groups || []).flatMap(g => g.items || [])].forEach(p => { const lat = Number(p.lat ?? p.latitude), lon = Number(p.lng ?? p.lon ?? p.longitude); if (Number.isFinite(lat) && Number.isFinite(lon)) PF.coords[p.id] = {lat, lon}; }); } catch (_) {} };

    /* ═════════ Le profil : modèles, en-tête, frise ═════════ */
    const ORDER = ['pf_frise', 'pol_mandates', 'pol_elections', 'pol_texts', 'pol_parties', 'pol_gov', 'pol_speeches', 'pol_decorations', 'pol_map', 'pol_collab', 'pol_affairs', 'pol_books', 'pol_bio'];
    const M = {
        elu: {label: 'Élu local', order: ['pf_frise', 'pol_mandates', 'pol_elections', 'pol_bio', 'pol_texts', 'pol_map', 'pol_parties', 'pol_decorations', 'pol_collab', 'pol_speeches', 'pol_affairs', 'pol_books', 'pol_gov'], hidden: ['pol_gov', 'pol_collab', 'pol_affairs']},
        parlementaire: {label: 'Parlementaire', order: ORDER, hidden: ['pol_collab', 'pol_bio']},
        ministre: {label: 'Ministre', order: ['pf_frise', 'pol_gov', 'pol_mandates', 'pol_texts', 'pol_elections', 'pol_parties', 'pol_speeches', 'pol_collab', 'pol_decorations', 'pol_map', 'pol_affairs', 'pol_books', 'pol_bio'], hidden: ['pol_bio']},
        militant: {label: 'Militant', order: ['pf_frise', 'pol_parties', 'pol_speeches', 'pol_elections', 'pol_texts', 'pol_bio', 'pol_affairs', 'pol_books', 'pol_mandates', 'pol_gov', 'pol_map', 'pol_collab', 'pol_decorations'], hidden: ['pol_gov', 'pol_map', 'pol_collab']},
        diplomate: {label: 'Diplomate', order: ['pf_frise', 'pol_mandates', 'pol_bio', 'pol_texts', 'pol_decorations', 'pol_map', 'pol_speeches', 'pol_collab', 'pol_books', 'pol_parties', 'pol_elections', 'pol_gov', 'pol_affairs'], hidden: ['pol_elections', 'pol_parties', 'pol_gov', 'pol_affairs']},
        prefet: {label: 'Fonctionnaire d’autorité (préfet…)', order: ['pf_frise', 'pol_mandates', 'pol_bio', 'pol_texts', 'pol_decorations', 'pol_map', 'pol_collab', 'pol_speeches', 'pol_affairs', 'pol_books', 'pol_parties', 'pol_elections', 'pol_gov'], hidden: ['pol_parties', 'pol_elections', 'pol_gov']},
    };
    const hero = C => {
        const st = C.store, l = mandates(st), it = fiche(st), d = it?.data || {}, f = PF.female(st);
        const fns = [...new Set(l.map(m => lab(FN, m.data.fn)).filter(x => x && x !== 'Autre fonction'))].slice(0, 4);
        const el = st.of('pol_election'), won = el.filter(e => WON.has(e.data.result)).length, gov = l.filter(m => m.data.level === 'gouvernement').length;
        const parties = sortY(st.of('pol_party').filter(p => (p.data.pkind || 'parti') === 'parti')).map(p => p.title);
        const links = [d.sycomore && {label: 'Base Sycomore (Assemblée)', icon: '🏛', url: /^\d+$/.test(d.sycomore) ? `https://www2.assemblee-nationale.fr/sycomore/fiche/(num_dept)/${d.sycomore}` : d.sycomore}, d.senat && {label: 'Sénat', icon: '🏛', url: d.senat},
            d.wikidata && {label: 'Wikidata', icon: '📖', url: /^Q\d+$/i.test(d.wikidata) ? `https://www.wikidata.org/wiki/${d.wikidata.toUpperCase()}` : d.wikidata}, ...(d.links || []).map(x => ({label: x.label, url: x.url, icon: '🌐'}))].filter(Boolean);
        return {eyebrow: `🏛 ${f ? 'FEMME' : 'HOMME'} POLITIQUE${fns.length ? ` · ${fns.join(', ')}` : ''}`.toLocaleUpperCase('fr-FR'),
            summary: [l.filter(mElect).length && plural(l.filter(mElect).length, 'mandat électif', 'mandats électifs'), el.length && `${plural(el.length, 'élection')} (${won} gagnée${won > 1 ? 's' : ''})`, gov && plural(gov, 'portefeuille'), d.family || parties.join(' puis ')].filter(Boolean).join(' · '), links};
    };
    const timeline = C => {
        const st = C.store, rows = new Map();
        mandates(st).forEach(m => { const sp = PF.span(m.data.date, m.data.end || (m.data.date && !m.data.end && !st.person.death ? 'en cours' : '')); if (!sp) return; const k = fnLabel(m); const r = rows.get(k) || {label: k, bars: []}; r.bars.push({a: sp[0], b: sp[1], text: PF.years(PF.year(m.data.date), PF.year(m.data.end)) || '', id: m.id, color: m.data.level === 'gouvernement' ? '#e1a500' : ''}); rows.set(k, r); });
        const bars = l => l.map((p, i) => { const sp = PF.span(p.data.date, p.data.end); return sp ? {a: sp[0], b: sp[1], text: p.title, id: p.id, color: ['#8a8f99', '#3c78d8', '#7b2ff7', '#1aa34a'][i % 4]} : null; }).filter(Boolean);
        const all = sortY(st.of('pol_party')), parties = bars(all.filter(p => (p.data.pkind || 'parti') === 'parti')), groups = bars(all.filter(p => (p.data.pkind || 'parti') !== 'parti'));
        return [...rows.values(), ...(parties.length ? [{label: 'Parti', bars: parties}] : []), ...(groups.length ? [{label: 'Groupes, commissions', bars: groups}] : [])];
    };
    const NOTE = '<b>🗳 Fiche d’une élection</b> : date · scrutin (municipales, cantonales, régionales, législatives, sénatoriales, européennes, présidentielle, référendum, interne au parti) · circonscription 📍 · tour · inscrits, votants, voix, % · résultat · colistiers 👤 · adversaires 👤 avec leurs voix · profession de foi 📄 · affiche 🪧 · résultats par commune · presse 📰.';
    const base = {group: 'public', kinds: ['pol_mandate', 'pol_election', 'pol_party', 'pol_text'], type: 'profile_politic', sections: null, models: M, timeline, hero, organizerNote: `Modèles de départ : <b>Élu local</b> (mandats, conseils, réalisations dans la commune), <b>Parlementaire</b>, <b>Ministre</b>, <b>Militant</b>, <b>Diplomate</b>, <b>Fonctionnaire d’autorité</b> (préfet…).<br><br>${NOTE}`};
    ART.profiles.politic = {...base, key: 'politic', label: 'Homme / femme politique', short: 'Politique', icon: '🗳', color: '#055dff', desc: 'mandats, élections, partis, gouvernement, textes et votes', defaultModel: () => 'parlementaire'};
    ART.profiles.elu_local = {...base, key: 'elu_local', label: 'Élu local', icon: '🏛', color: '#055dff', type: 'profile_elu_local', uses: P, desc: 'maire, adjoint, conseiller : mandats, élections, réalisations', defaultModel: () => 'elu'};
})();
