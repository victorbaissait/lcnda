/* LCNDA — 🎨 Catalogues d'artistes : FILMS ET SPECTACLES — définition du moteur.
 * ★ titre, titre original, année, genre, métier et rôle, réalisateur, affiche ; masqués au départ : durée, pays, production,
 * distribution, sorties, festivals et prix, versions, supports, saisons/épisodes ou mises en scène/représentations,
 * musique liée, IMDb / TMDb / Wikidata.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const U = ART.util, esc = U.esc;
    const FILM_KINDS = [['long', 'Long métrage'], ['court', 'Court métrage'], ['serie', 'Série'], ['telefilm', 'Téléfilm'], ['docu', 'Documentaire'], ['clip', 'Clip'], ['pub', 'Publicité'], ['theatre', 'Pièce de théâtre'], ['opera', 'Opéra, ballet'], ['spectacle', 'Spectacle'], ['autre', 'Autre']];
    const lab = (l, k) => (l.find(x => x[0] === k) || [, k || ''])[1];
    ART.FILM_KINDS = FILM_KINDS;
    ART.define({key: 'film', icon: '🎬', label: 'Film, spectacle', many: 'Films et spectacles', tab: 'Films', domain: 'film',
        eyebrow: it => lab(FILM_KINDS, it.data?.fkind || 'long'),
        newData: () => ({fkind: 'long'}),
        cardLine: it => [it.year, it.data?.jobs, it.data?.role && `rôle : ${it.data.role}`].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}${it.year ? ` <small>· ${esc(it.year)}</small>` : ''}</h2>${it.data?.original && it.data.original !== it.title ? `<p class="ar-g">${esc(it.data.original)}</p>` : ''}`,
        groups: [
            {key: 'main', label: 'Film', zone: 'main', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'original', label: 'Titre original', type: 'text', star: true, head: true}, {key: 'year', label: 'Année', type: 'date', star: true},
                {key: 'fkind', label: 'Genre', type: 'select', choices: FILM_KINDS, star: true}, {key: 'jobs', label: 'Métier', type: 'text', star: true, ph: 'acteur, réalisation, scénario…'}, {key: 'role', label: 'Rôle (personnage)', type: 'text', star: true},
                {key: 'director', label: 'Réalisation', type: 'person', star: true, roleWord: 'réalisation'},
                {key: 'duration', label: 'Durée', type: 'number', unit: 'min', star: false}, {key: 'country', label: 'Pays', type: 'text', star: false}, {key: 'production', label: 'Production', type: 'text', star: false}]},
            {key: 'cast', label: 'Distribution', zone: 'main', fields: [{key: 'cast', label: 'Distribution', type: 'people', star: false, view: 'credits', section: true, addLabel: 'Un acteur, une actrice', rolePh: 'personnage, métier'}]},
            {key: 'synopsis', label: 'Résumé', zone: 'main', fields: [{key: 'synopsis', label: 'Résumé', type: 'longtext', star: true, section: true}]},
            {key: 'releases', label: 'Sorties, festivals, versions', zone: 'main', fields: [
                {key: 'releases', label: 'Sorties', type: 'rows', star: false, addLabel: 'Une sortie', cols: [{key: 'country', label: 'Pays', w: 's'}, {key: 'date', label: 'Date', w: 's'}, {key: 'title', label: 'Titre local', w: 'm'}, {key: 'support', label: 'Support (salle, DVD, VHS, TV…)', w: 'm'}]},
                {key: 'festivals', label: 'Festivals et prix', type: 'rows', star: false, addLabel: 'Un festival, un prix', cols: [{key: 'festival', label: 'Festival', w: 'm'}, {key: 'year', label: 'Année', w: 's'}, {key: 'prize', label: 'Prix', w: 'm'}, {key: 'status', label: 'Lauréat ou nommé', type: 'select', choices: [['laureat', 'Lauréat'], ['nomme', 'Nommé']], w: 's'}]},
                {key: 'versions', label: 'Versions, supports', type: 'rows', star: false, addLabel: 'Une version', cols: [{key: 'version', label: 'Version', w: 'm'}, {key: 'support', label: 'Support', w: 'm'}, {key: 'note', label: 'Note', w: 'm'}]},
                {key: 'episodes', label: 'Saisons et épisodes, ou mises en scène et représentations', type: 'rows', star: false, addLabel: 'Un épisode, une représentation', cols: [{key: 'season', label: 'Saison', w: 's'}, {key: 'no', label: 'N°', w: 's'}, {key: 'title', label: 'Titre', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'place', label: 'Lieu', type: 'place', w: 'm'}]},
                {key: 'music', label: 'Musique du film', type: 'items', kinds: ['track_work', 'release'], star: false}]},
            {key: 'photos', label: 'Affiche, photos', zone: 'left', fields: [{key: 'photos', label: 'Affiche, photos', type: 'photos', star: true, labels: [['recto', 'Affiche'], ['photo', 'Photo de tournage'], ['jaquette', 'Jaquette'], ['autre', 'Autre']]}]},
            {key: 'ids', label: 'Identifiants et liens', icon: '🔢', zone: 'right', fields: [
                {key: 'imdb', label: 'IMDb', type: 'ident', href: v => /^tt\d+$/.test(v) ? `https://www.imdb.com/title/${v}/` : '', star: false, ph: 'tt0123456'},
                {key: 'tmdb', label: 'TMDb', type: 'ident', href: v => /^\d+$/.test(v) ? `https://www.themoviedb.org/movie/${v}` : '', star: false},
                {key: 'wikidata', label: 'Wikidata', type: 'ident', href: v => /^Q\d+$/.test(v) ? `https://www.wikidata.org/wiki/${v}` : '', star: false}, {key: 'link', label: 'Lien', type: 'url', star: false}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'note', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'year', 'title', 'fkind', 'jobs', 'role', 'director'], card: ['year', 'jobs'], export: ['photos', 'title', 'original', 'year', 'fkind', 'jobs', 'role', 'director', 'synopsis'],
        filters: () => [{id: 'fkind', label: 'Genre', type: 'check', options: FILM_KINDS, test: (it, v) => !v.length || v.includes(it.data.fkind || 'long')}],
    });
})();
