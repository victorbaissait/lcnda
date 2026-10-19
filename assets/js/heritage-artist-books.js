/* LCNDA — 🎨 Catalogues d'artistes : LIVRES ET TEXTES, EXEMPLAIRES, ORGANISATIONS — définitions du moteur.
 * Texte (l'œuvre écrite) → Édition (livre : ISBN, éditeur, collection, traducteur, illustrateur, préface…) → Exemplaire
 * (dédicacé à…, état, où). Critiques (lien vers les Revues), « cite » une œuvre, un disque, un film.
 * Organisations : labels, éditeurs, galeries, agents, producteurs, studios (choisies dans les fiches avec le menu de choix).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART?.define) return;
    const U = ART.util, esc = U.esc;
    const BOOK_ROLES = [['auteur', 'De lui / d’elle (auteur)'], ['sur', 'Sur lui / sur elle'], ['illustrateur', 'Illustrations'], ['traducteur', 'Traduction'], ['prefacier', 'Préface'], ['contribution', 'Contribution'], ['catalogue', 'Catalogue d’exposition']];
    const BOOK_KINDS = [['livre', 'Livre'], ['article', 'Article'], ['revue', 'Revue, numéro spécial'], ['these', 'Thèse, mémoire'], ['catalogue', 'Catalogue'], ['partition', 'Partition'], ['autre', 'Autre']];
    const TEXT_KINDS = [['roman', 'Roman'], ['poeme', 'Poème'], ['nouvelle', 'Nouvelle'], ['essai', 'Essai'], ['article', 'Article'], ['these', 'Thèse'], ['memoires', 'Mémoires'], ['chanson', 'Chanson'], ['piece', 'Pièce de théâtre'], ['autre', 'Autre']];
    const lab = (l, k) => (l.find(x => x[0] === k) || [, k || ''])[1];

    /* ═════════ 📜 Texte (l'œuvre écrite) ═════════ */
    ART.define({key: 'text', icon: '📜', label: 'Texte', many: 'Textes', domain: 'books',
        newData: store => ({tkind: 'roman', authors: [{pid: store.pid, title: store.name, role: 'auteur'}]}),
        cardLine: it => [lab(TEXT_KINDS, it.data?.tkind), it.data?.written].filter(Boolean).join(' · '),
        groups: [{key: 'main', label: 'Le texte', zone: 'main', fields: [{key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'tkind', label: 'Sorte', type: 'select', choices: TEXT_KINDS, star: true},
                {key: 'authors', label: 'Auteurs', type: 'people', star: true, addLabel: 'Un auteur'}, {key: 'written', label: 'Écrit', type: 'date', star: true}, {key: 'subjects', label: 'Sujets', type: 'text', star: true}, {key: 'lang', label: 'Langue', type: 'text', star: false}]},
            {key: 'summary', label: 'Résumé', zone: 'main', fields: [{key: 'summary', label: 'Résumé', type: 'longtext', star: true, section: true}]},
            {key: 'eds', label: 'Éditions', zone: 'main', fields: [{key: '_editions', label: 'Ses éditions', type: 'computed', view: 'text_editions', star: true}]},
            {key: 'adapt', label: 'Adaptations', zone: 'main', fields: [{key: 'adaptations', label: 'Adaptations', type: 'rows', star: false, addLabel: 'Une adaptation', cols: [{key: 'to', label: 'Film, morceau, pièce…', type: 'item', kinds: ['film', 'track_work'], w: 'l'}, {key: 'note', label: 'Note'}]}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['title', 'tkind', 'written', '_editions'], card: ['tkind', 'written'], export: ['title', 'tkind', 'authors', 'written', 'summary'],
    });
    ART.views.text_editions = {text: (ctx, it) => { const n = ctx.store.linksTo(it.id, 'text').length; return n ? U.plural(n, 'édition') : ''; },
        read: (ctx, it) => { const st = ctx.store, l = st.linksTo(it.id, 'text').map(k => st.get(k.from) || {...k.other, data: {}}); if (!l.length) return '<p class="muted">Aucune édition rattachée : sur la fiche d’un livre, choisis ce texte dans « Texte (l’œuvre) ».</p>';
            return `<div class="ar-grid">${l.map(b => `<button type="button" class="ar-card" data-ar-open="${b.id}">${U.cover(b)}<b>${esc(b.title)}</b><small>${esc([b.year, U.refTitle(b.data?.publisher)].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>`; }};

    /* ═════════ 📚 Livre (une édition) — la « bibliographie » d'avant ═════════ */
    ART.define({key: 'book', icon: '📚', label: 'Livre', many: 'Livres', tab: 'Livres', domain: 'books', parentField: 'text',
        eyebrow: it => ['Livre', lab(BOOK_ROLES, it.data?.role || 'auteur')].join(' · '),
        newData: store => ({role: 'auteur', bkind: 'livre', authors: [{pid: store.pid, title: store.name, role: 'auteur'}]}),
        cardLine: it => [it.year, U.refTitle(it.data?.publisher), lab(BOOK_ROLES, it.data?.role || 'auteur')].filter(Boolean).join(' · '),
        groups: [
            {key: 'main', label: 'Le livre', zone: 'main', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'subtitle', label: 'Sous-titre', type: 'text', star: true},
                {key: 'role', label: 'Lien avec l’artiste', type: 'select', choices: BOOK_ROLES, star: true}, {key: 'bkind', label: 'Sorte', type: 'select', choices: BOOK_KINDS, star: true},
                {key: 'authors', label: 'Auteurs', type: 'people', star: true, addLabel: 'Un auteur', roleWord: 'auteur'},
                {key: 'text', label: 'Texte (l’œuvre)', type: 'item', kinds: ['text'], star: false},
                {key: 'year', label: 'Année', type: 'date', star: true}, {key: 'publisher', label: 'Éditeur', type: 'item', kinds: ['org'], star: true}, {key: 'place', label: 'Lieu d’édition', type: 'place', star: true},
                {key: 'collection', label: 'Collection', type: 'text', star: true}, {key: 'edition', label: 'Édition (1re, 2e…)', type: 'text', star: false}, {key: 'isbn', label: 'ISBN', type: 'code', star: true, href: v => `https://openlibrary.org/isbn/${String(v).replace(/[^0-9Xx]/g, '')}`},
                {key: 'pages', label: 'Pages', type: 'number', star: true}, {key: 'format', label: 'Format', type: 'text', star: false}, {key: 'print_run', label: 'Tirage', type: 'text', star: false}, {key: 'legal', label: 'Dépôt légal', type: 'text', star: false},
                {key: 'translator', label: 'Traduction', type: 'person', star: false, roleWord: 'traduction'}, {key: 'illustrator', label: 'Illustrations', type: 'person', star: false, roleWord: 'illustrations'}, {key: 'preface', label: 'Préface', type: 'person', star: false, roleWord: 'préface'},
                {key: 'lang', label: 'Langue', type: 'text', star: false}, {key: 'where', label: 'Où le trouver', type: 'text', star: true, ph: 'bibliothèque, cote, chez nous…'}, {key: 'link', label: 'Lien', type: 'url', star: false}]},
            {key: 'photos', label: 'Couverture', zone: 'left', fields: [{key: 'photos', label: 'Couverture, pages', type: 'photos', star: true, labels: [['recto', 'Couverture'], ['verso', 'Quatrième'], ['page', 'Page'], ['dedicace', 'Dédicace'], ['autre', 'Autre']]}]},
            {key: 'critics', label: 'Critiques', zone: 'main', fields: [{key: 'critics', label: 'Critiques, articles', type: 'rows', star: true, addLabel: 'Une critique', cols: [{key: 'title', label: 'Revue, journal', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'extract', label: 'Extrait', w: 'l'}]}]},
            {key: 'cites', label: 'Cite', zone: 'main', fields: [{key: 'cites', label: 'Œuvres citées', type: 'rows', star: false, addLabel: 'Une œuvre citée', cols: [{key: 'w', label: 'Œuvre, disque, film', type: 'item', kinds: ['work', 'release', 'film', 'track_work'], w: 'l'}, {key: 'page', label: 'Page, fig.', w: 's'}]}]},
            {key: 'copy', label: 'Mon exemplaire', icon: '📦', zone: 'left', fields: [{key: 'copy_state', label: 'État', type: 'text', star: true}, {key: 'copy_where', label: 'Rangé', type: 'text', star: true}, {key: 'dedication', label: 'Dédicace', type: 'text', star: true, join: {key: 'dedicatee', sep: ' · '}}, {key: 'dedicatee', label: 'Dédicacé à', type: 'person', star: true, roleWord: 'dédicace'},
                {key: 'copies', label: 'Autres exemplaires (double, triple…)', type: 'rows', star: true, addLabel: 'Un exemplaire de plus', cols: [{key: 'copy_state', label: 'État', w: 'm'}, {key: 'edition', label: 'Édition', w: 'm'}, {key: 'copy_where', label: 'Rangé', w: 'm'}, {key: 'paid', label: 'Payé', w: 's'}, {key: 'dedication', label: 'Dédicace', w: 'm'}, {key: 'note', label: 'Note', w: 'm'}]}]},
            {key: 'notes', label: 'Résumé, notes', icon: '📝', zone: 'right', fields: [{key: 'note', label: 'Résumé, notes', type: 'longtext', star: true, bare: true}]}],
        list: ['photos', 'year', 'title', 'role', 'authors', 'publisher', 'isbn'], card: ['year', 'publisher'], export: ['title', 'subtitle', 'authors', 'year', 'publisher', 'place', 'collection', 'isbn', 'pages', 'note'],
        filters: () => [{id: 'role', label: 'Lien avec l’artiste', type: 'check', options: BOOK_ROLES, test: (it, v) => !v.length || v.includes(it.data.role || 'auteur')}],
    });

    /* ═════════ 📦 Exemplaire (un objet que tu possèdes) ═════════ */
    ART.define({key: 'copy', icon: '📦', label: 'Exemplaire', many: 'Exemplaires', domain: 'autre', parentField: 'of',
        groups: [{key: 'main', label: 'Exemplaire', zone: 'main', fields: [{key: 'title', label: 'Nom', type: 'text', star: true, head: true}, {key: 'of', label: 'Exemplaire de', type: 'item', kinds: ['release', 'book', 'work'], star: true},
                {key: 'state', label: 'État', type: 'text', star: true}, {key: 'where', label: 'Rangé', type: 'text', star: true}, {key: 'paid', label: 'Payé', type: 'money', star: true}, {key: 'value', label: 'Valeur', type: 'money', star: true},
                {key: 'dedication', label: 'Dédicace', type: 'text', star: true}, {key: 'dedicatee', label: 'Dédicacé à', type: 'person', star: true, roleWord: 'dédicace'}, {key: 'owner', label: 'À qui', type: 'person', star: true, roleWord: 'propriétaire'}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['title', 'of', 'state', 'where', 'value'], card: ['state'], export: ['title', 'of', 'state', 'where', 'value', 'dedication'],
    });

    /* ═════════ 🏷 Organisation (label, éditeur, galerie, agent, producteur, studio, musée) ═════════ */
    const OKIND = [['label', 'Label'], ['editeur', 'Éditeur'], ['galerie', 'Galerie'], ['agent', 'Agent'], ['producteur', 'Producteur'], ['studio', 'Studio'], ['musee', 'Musée'], ['autre', 'Autre']];
    ART.define({key: 'org', icon: '🏷', label: 'Organisation', many: 'Organisations', fem: true, domain: 'autre', linked: true,
        newData: () => ({okind: 'label'}), cardLine: it => lab(OKIND, it.data?.okind),
        groups: [{key: 'main', label: 'Organisation', zone: 'main', fields: [{key: 'title', label: 'Nom', type: 'text', star: true, head: true}, {key: 'okind', label: 'Sorte', type: 'select', choices: OKIND, star: true}, {key: 'place', label: 'Lieu', type: 'place', star: true}, {key: 'years', label: 'Années', type: 'text', star: true}, {key: 'link', label: 'Site', type: 'url', star: true}]},
            {key: 'photos', label: 'Logo', zone: 'left', fields: [{key: 'photos', label: 'Logo, photos', type: 'photos', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['title', 'okind', 'place', 'years'], card: ['okind'], export: ['title', 'okind', 'place'],
    });
    ART.ORG_KINDS = OKIND; ART.BOOK_ROLES = BOOK_ROLES;
})();
