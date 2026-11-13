/* LCNDA — 🌍 Archives en ligne, troisième lot : France (prisonniers 14-18, élus, inventeurs, médecins, polytechniciens,
 * savants, Paris, musées, livres d'histoire locale) et étranger (Italie, Espagne, Portugal, Allemagne, Pays-Bas / Flandre,
 * Pologne, Royaume-Uni, Canada, États-Unis, Justes parmi les nations). Calculs purs, SANS RÉSEAU
 * (window.LCNDA_SOURCES_OUVERTES_3 ; aussi require() dans Node pour les tests).
 *
 * Même principe que app-sources-ouvertes-core.js (Mémoire des hommes, Léonore…) et SocFace : l'app N'INTERROGE JAMAIS ces
 * sites. Elle fabrique l'adresse d'une recherche, que le navigateur de la personne ouvre ; quand le site ne garde pas la
 * recherche dans son adresse, elle ouvre la page de recherche et met le nom dans le presse-papiers (« colle-le dans la case »).
 * Ensuite elle lit ce que la personne a téléchargé ou copié elle-même (fichier de données ouvertes, texte d'une fiche).
 *
 *  - SITES                 les sites (clé, groupe, pays, thème, adresse modèle, page de recherche, vérification, où proposer)
 *  - GROUPS                les rubriques (pays / thème), dans l'ordre du réglage des sites
 *  - url(key, p, custom)   l'adresse remplie (p : first, last, place, y1, y2, birthYear, deathYear) ; custom = modèles de la personne
 *  - copyText(key, p)      ce qu'on met dans le presse-papiers pour un site sans recherche dans l'adresse
 *  - forPlace(where, ctx)  les sites à proposer à un endroit (fiche, lieu, militaire, emigration, inventeur, medecin, elu, artiste)
 *  - parseOpenArchives     un fichier JSON (API de données ouvertes) ou CSV d'Open Archives → lignes
 *  - parseFreeBMD          le texte copié d'une page de résultats FreeBMD → lignes (naissances, mariages, décès par trimestre)
 *  - parseFields(t, kind)  le texte copié d'une fiche (CICR, Sycomore, brevet, thèse, Polytechnique, Find a Grave…) → champs
 *  - proposals(kind, f)    ce qu'une fiche lue propose d'ajouter (événements, blocs) — jamais appliqué sans clic
 *  - detectKind(texte)     devine la sorte d'un texte collé
 *
 * Adresses : verified = 'oui' (vue sur une page publique du site), 'partiel' (forme vue dans des liens publics, paramètres
 * pas tous confirmés) ou 'non' (construite d'après la forme connue du site). Toutes se changent dans « ⚙️ Adresses des sites ».
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES_3 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const i18n = (s, v) => (typeof window !== 'undefined' && window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js (dans Node : le français)
    const CHECKED = '2026-11-09';
    const MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const yearOf = v => { const m = String(v ?? '').match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : 0; };
    const years = p => { let a = Number(p.y1) || Number(p.birthYear) || 0, b = Number(p.y2) || Number(p.deathYear) || 0; if (a && b && b < a) [a, b] = [b, a]; return [a, b || a]; };
    const placeWord = p => clean(p.place).split(',')[0];
    const nameOf = p => [firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
    const google = (site, p, words = '') => `https://www.google.com/search?q=${encodeURIComponent([`site:${site}`, p.last ? `"${clean(p.last)}"` : '', p.first ? `"${firstOnly(p.first)}"` : '', words].filter(Boolean).join(' '))}`;

    /* ═════ Rubriques : par pays, puis par thème (ordre du réglage des sites, repliables) ═════ */
    const GROUPS = [
        {id: 'fr_guerre', icon: '🇫🇷', label: 'France — prisonniers de la Grande Guerre'},
        {id: 'fr_elus', icon: '🇫🇷', label: 'France — députés et sénateurs'},
        {id: 'fr_savants', icon: '🇫🇷', label: 'France — inventeurs, médecins, polytechniciens, savants'},
        {id: 'fr_paris', icon: '🇫🇷', label: 'France — Archives de Paris'},
        {id: 'fr_musees', icon: '🇫🇷', label: 'France — musées et livres d’histoire locale'},
        {id: 'sud', icon: '🇮🇹', label: 'Italie · Espagne · Portugal'},
        {id: 'nord', icon: '🇩🇪', label: 'Allemagne · Pays-Bas · Flandre · Pologne'},
        {id: 'uk', icon: '🇬🇧', label: 'Royaume-Uni'},
        {id: 'amerique', icon: '🇨🇦', label: 'Canada · États-Unis'},
        {id: 'shoah', icon: '🕯', label: 'Mémoire de la Shoah et des persécutions'},
    ];

    /* ═════ Les sites ═════
     * build(p) : l'adresse remplie ; search : la page de recherche (on y colle le nom) ; home : l'accueil ;
     * copy : true quand le site ne garde pas la recherche dans l'adresse ; where : endroits de l'app où le proposer ;
     * kind : la sorte d'import (parseFields) ; sensitive : persécutions (ton sobre, jamais dans les jeux). */
    const SITES = [
        // 🇫🇷 Prisonniers de la Grande Guerre (Comité international de la Croix-Rouge, Genève) : fiches de l'Agence internationale
        {key: 'cicr_pg', group: 'fr_guerre', country: 'International', icon: '✚', label: 'Prisonniers de la Grande Guerre (CICR)',
            home: 'https://grandeguerre.icrc.org/fr', search: 'https://grandeguerre.icrc.org/fr/File/Search', copy: true, verified: 'partiel',
            note: 'La page de recherche existe (vue en anglais : /en/File/Search) ; le nom ne passe pas dans l’adresse : il est copié, colle-le dans la case.',
            build: () => 'https://grandeguerre.icrc.org/fr/File/Search', where: ['fiche', 'militaire'], kind: 'cicr', years: [1914, 1923]},
        // 🇫🇷 Élus
        {key: 'sycomore', group: 'fr_elus', country: 'France', icon: '🏛', label: 'Sycomore — anciens députés (Assemblée nationale)',
            home: 'https://www2.assemblee-nationale.fr/sycomore/liste?alpha=true', search: 'https://www2.assemblee-nationale.fr/sycomore/recherche', verified: 'partiel',
            note: 'Fiches « /sycomore/fiche/… » et liste alphabétique vues ; la recherche passe par Google limité à la base.',
            build: p => google('assemblee-nationale.fr/sycomore', p), where: ['fiche', 'elu'], kind: 'elu'},
        {key: 'senat_anciens', group: 'fr_elus', country: 'France', icon: '🏛', label: 'Anciens sénateurs (Sénat, IIIe à Ve République)',
            home: 'https://www.senat.fr/anciens-senateurs-5eme-republique/', search: 'https://www.senat.fr/senateurs-3eme-republique/', verified: 'non',
            build: p => google('senat.fr', p, 'sénateur'), where: ['fiche', 'elu'], kind: 'elu'},
        // 🇫🇷 Inventeurs, médecins, polytechniciens, savants
        {key: 'inpi_brevets19', group: 'fr_savants', country: 'France', icon: '💡', label: 'Brevets d’invention 1791-1902 (INPI)',
            home: 'https://bases-brevets19e.inpi.fr/', search: 'https://bases-brevets19e.inpi.fr/', copy: true, verified: 'non',
            note: 'Base des brevets du XIXe siècle (≈ 400 000 dossiers) ; l’INPI l’annonce aussi sur data.inpi.fr. Adresse à confirmer.',
            build: () => 'https://bases-brevets19e.inpi.fr/', where: ['fiche', 'inventeur'], kind: 'brevet', years: [1791, 1902]},
        {key: 'biusante_theses', group: 'fr_savants', country: 'France', icon: '⚕', label: 'Thèses de médecine (Sudoc + BIU Santé)',
            home: 'https://numerabilis.u-paris.fr/medica/', search: 'https://www.sudoc.abes.fr/', verified: 'non',
            note: 'Recherche par auteur dans le Sudoc (catalogue des bibliothèques universitaires) ; les thèses anciennes de Paris sont à la BIU Santé.',
            build: p => `https://www.sudoc.abes.fr/cbs/DB=2.1/CMD?ACT=SRCHA&IKT=1004&SRT=RLV&TRM=${enc([clean(p.last), firstOnly(p.first)].filter(Boolean).join(' '))}`,
            where: ['fiche', 'medecin'], kind: 'these'},
        {key: 'biusante_bio', group: 'fr_savants', country: 'France', icon: '⚕', label: 'Base biographique des médecins (BIU Santé)',
            home: 'https://numerabilis.u-paris.fr/medica/', search: 'https://numerabilis.u-paris.fr/medica/', verified: 'partiel',
            build: p => google('numerabilis.u-paris.fr', p), where: ['medecin'], kind: 'these'},
        {key: 'polytechnique', group: 'fr_savants', country: 'France', icon: '🎓', label: 'Registres de l’École polytechnique (« famille polytechnicienne »)',
            home: 'https://www.polytechnique.edu/bibliotheque/', search: 'https://www.polytechnique.edu/bibliotheque/', verified: 'non',
            note: '≈ 50 000 fiches matricules d’élèves ; la base des anciens élèves change souvent d’adresse : recherche Google sur le site.',
            build: p => google('polytechnique.edu', p, 'famille polytechnicienne'), where: ['fiche', 'medecin', 'inventeur'], kind: 'polytechnique'},
        {key: 'cths', group: 'fr_savants', country: 'France', icon: '📜', label: 'Annuaire prosopographique « La France savante » (CTHS)',
            home: 'https://cths.fr/an/prosopo.php', search: 'https://cths.fr/an/prosopo.php', verified: 'partiel',
            note: 'Les fiches « cths.fr/an/savant.php?id=… » existent ; la recherche passe par Google limité à l’annuaire.',
            build: p => google('cths.fr/an', p), where: ['fiche', 'inventeur', 'medecin', 'elu'], kind: 'cths'},
        // 🇫🇷 Archives de Paris
        {key: 'paris_ec', group: 'fr_paris', country: 'France', icon: '🗼', label: 'Archives de Paris — état civil reconstitué (avant 1860)',
            home: 'https://archives.paris.fr/', search: 'https://archives.paris.fr/s/4/etat-civil-reconstitue/', copy: true, verified: 'non',
            note: 'Fichiers alphabétiques de l’état civil reconstitué après l’incendie de 1871 : on cherche par nom, puis on tourne les pages.',
            build: () => 'https://archives.paris.fr/s/4/etat-civil-reconstitue/', where: ['fiche', 'lieu'], kind: 'acte', place: /\bparis\b/, years: [1500, 1859]},
        {key: 'paris_electeurs', group: 'fr_paris', country: 'France', icon: '🗳', label: 'Archives de Paris — listes électorales (1860-1932)',
            home: 'https://archives.paris.fr/', search: 'https://archives.paris.fr/s/4/listes-electorales/', copy: true, verified: 'non',
            build: () => 'https://archives.paris.fr/s/4/listes-electorales/', where: ['fiche', 'lieu'], kind: 'electeur', place: /\bparis\b/, years: [1860, 1932]},
        // 🇫🇷 Musées et livres
        {key: 'joconde', group: 'fr_musees', country: 'France', icon: '🖼', label: 'Joconde — collections des musées de France (POP)',
            home: 'https://www.pop.culture.gouv.fr/', search: 'https://www.pop.culture.gouv.fr/advanced-search/list/joconde', verified: 'partiel',
            note: '« search/list?base=[…Joconde…] » vu dans le guide du ministère ; le paramètre du texte cherché (mainSearch) n’est pas confirmé.',
            build: p => `https://www.pop.culture.gouv.fr/search/list?base=${encodeURIComponent('["Collections des musées de France (Joconde)"]')}&mainSearch=${encodeURIComponent(`"${nameOf(p) || placeWord(p)}"`)}`,
            where: ['fiche', 'artiste', 'lieu'], kind: 'joconde'},
        {key: 'archiveorg_local', group: 'fr_musees', country: 'International', icon: '📚', label: 'Internet Archive — livres d’histoire locale',
            home: 'https://archive.org/', search: 'https://archive.org/search', verified: 'partiel',
            build: p => `https://archive.org/search?query=${encodeURIComponent(`"${placeWord(p) || nameOf(p)}"`)}&and%5B%5D=${encodeURIComponent('mediatype:"texts"')}`,
            where: ['lieu', 'fiche'], kind: 'livre', byPlace: true},
        {key: 'persee', group: 'fr_musees', country: 'France', icon: '📖', label: 'Persée — revues savantes (histoire locale)',
            home: 'https://www.persee.fr/', search: 'https://www.persee.fr/search', verified: 'non',
            build: p => `https://www.persee.fr/search?ta=article&q=${encodeURIComponent(`"${placeWord(p) || nameOf(p)}"`)}`,
            where: ['lieu', 'fiche'], kind: 'livre', byPlace: true},
        // 🇮🇹 🇪🇸 🇵🇹
        {key: 'antenati_nom', group: 'sud', country: 'Italie', icon: '🇮🇹', label: 'Antenati — recherche par nom (Italie)',
            home: 'https://antenati.cultura.gov.it/?type=name', search: 'https://antenati.cultura.gov.it/?type=name', verified: 'partiel',
            note: 'La page « Cerca per nome » (?type=name) est confirmée ; les noms des paramètres (cognome, nome) ne le sont pas.',
            build: p => `https://antenati.cultura.gov.it/search-nominative/?cognome=${enc(p.last)}&nome=${enc(firstOnly(p.first))}${placeWord(p) ? `&localita=${enc(placeWord(p))}` : ''}`,
            where: ['fiche', 'emigration', 'lieu'], kind: 'acte', countries: ['italie', 'italia']},
        {key: 'pares', group: 'sud', country: 'Espagne', icon: '🇪🇸', label: 'PARES — archives d’État espagnoles (et émigration)',
            home: 'https://pares.cultura.gob.es/', search: 'https://pares.cultura.gob.es/ParesBusquedas20/catalogo/search', copy: true, verified: 'partiel',
            note: 'Adresse du portail confirmée (pares.cultura.gob.es) ; la recherche simple garde le texte dans un formulaire : il est copié.',
            build: () => 'https://pares.cultura.gob.es/ParesBusquedas20/catalogo/search', where: ['fiche', 'emigration'], kind: 'acte', countries: ['espagne', 'espana']},
        {key: 'torre_tombo', group: 'sud', country: 'Portugal', icon: '🇵🇹', label: 'Torre do Tombo (digitarq, Portugal)',
            home: 'https://digitarq.arquivos.pt/', search: 'https://digitarq.arquivos.pt/', verified: 'non',
            build: p => `https://digitarq.arquivos.pt/results?t=${enc(nameOf(p))}`, where: ['fiche', 'emigration'], kind: 'acte', countries: ['portugal']},
        // 🇩🇪 🇳🇱 🇵🇱
        {key: 'arolsen_fr', group: 'shoah', country: 'Allemagne', icon: '🕯', label: 'Arolsen Archives — persécutions nazies (fiches et documents)',
            home: 'https://collections.arolsen-archives.org/fr/', search: 'https://collections.arolsen-archives.org/fr/search', verified: 'partiel', sensitive: true,
            note: 'Forme « /search?s=… » déjà utilisée par l’app (en anglais) ; ici en français.',
            build: p => `https://collections.arolsen-archives.org/fr/search?s=${enc(nameOf(p))}`, where: ['fiche', 'militaire'], kind: 'arolsen', years: [1933, 1960]},
        {key: 'openarchives', group: 'nord', country: 'Pays-Bas', icon: '🇳🇱', label: 'Open Archives — Pays-Bas et Flandre (données ouvertes)',
            home: 'https://www.openarchieven.nl/', search: 'https://www.openarchieven.nl/search.php', verified: 'partiel',
            note: 'L’API publique (api.openarchieven.nl/1.1/records/search.json?name=…) est documentée ; la page de recherche prend les mêmes paramètres.',
            build: p => `https://www.openarchieven.nl/search.php?lang=fr&name=${enc(nameOf(p))}${placeWord(p) ? `&eventplace=${enc(placeWord(p))}` : ''}`,
            data: p => `https://api.openarchieven.nl/1.1/records/search.json?lang=fr&number_show=100&name=${enc(nameOf(p))}${placeWord(p) ? `&eventplace=${enc(placeWord(p))}` : ''}`,
            where: ['fiche', 'emigration', 'lieu'], kind: 'openarchives', countries: ['pays-bas', 'nederland', 'belgique', 'belgie', 'flandre']},
        {key: 'geneteka', group: 'nord', country: 'Pologne', icon: '🇵🇱', label: 'Geneteka — index des actes (Pologne)',
            home: 'https://geneteka.genealodzy.pl/', search: 'https://geneteka.genealodzy.pl/', verified: 'partiel',
            note: 'Paramètres op=gt, search_lastname, search_name vus dans des liens publics ; « bdm » (B naissances, S mariages, D décès) et la région « w » non confirmés.',
            build: p => `https://geneteka.genealodzy.pl/index.php?op=gt&lang=fra&bdm=B&w=&rid=B&search_lastname=${enc(p.last)}&search_name=${enc(firstOnly(p.first))}&search_lastname2=&search_name2=&from_date=${years(p)[0] || ''}&to_date=${years(p)[1] || ''}`,
            where: ['fiche', 'emigration'], kind: 'acte', countries: ['pologne', 'polska']},
        // 🇬🇧
        {key: 'freebmd', group: 'uk', country: 'Royaume-Uni', icon: '🇬🇧', label: 'FreeBMD — naissances, mariages, décès (Angleterre et Galles, 1837 →)',
            home: 'https://www.freebmd.org.uk/', search: 'https://www.freebmd.org.uk/cgi/search.pl', copy: true, verified: 'partiel',
            note: 'Page d’aide et formulaire confirmés (champs Surname / Given name) ; la recherche se fait par formulaire : le nom est copié.',
            build: () => 'https://www.freebmd.org.uk/cgi/search.pl', where: ['fiche', 'emigration'], kind: 'freebmd', years: [1837, 1992], countries: ['angleterre', 'royaume-uni', 'england', 'pays de galles', 'wales']},
        {key: 'freecen', group: 'uk', country: 'Royaume-Uni', icon: '🇬🇧', label: 'FreeCEN — recensements britanniques (1841-1911)',
            home: 'https://www.freecen.org.uk/', search: 'https://www.freecen.org.uk/search_queries/new', copy: true, verified: 'non',
            build: () => 'https://www.freecen.org.uk/search_queries/new', where: ['fiche', 'emigration'], kind: 'freecen', years: [1841, 1911], countries: ['angleterre', 'royaume-uni', 'ecosse', 'england', 'scotland']},
        // 🇨🇦 🇺🇸
        {key: 'banq', group: 'amerique', country: 'Canada', icon: '🇨🇦', label: 'BAnQ — Archives nationales du Québec (Advitam)',
            home: 'https://advitam.banq.qc.ca/', search: 'https://advitam.banq.qc.ca/', verified: 'non',
            build: p => google('banq.qc.ca', p), where: ['fiche', 'emigration'], kind: 'acte', countries: ['canada', 'quebec']},
        {key: 'bac_lac', group: 'amerique', country: 'Canada', icon: '🇨🇦', label: 'Bibliothèque et Archives Canada — généalogie',
            home: 'https://recherche-collection-search.bac-lac.gc.ca/fra/', search: 'https://recherche-collection-search.bac-lac.gc.ca/fra/Home/Search', verified: 'partiel',
            note: '« /eng/Home/Search?q=… » vu ; la version française et le filtre DataSource=Genealogy ne sont pas confirmés.',
            build: p => `https://recherche-collection-search.bac-lac.gc.ca/fra/Home/Search?q=${enc(nameOf(p))}&DataSource=Genealogy`,
            where: ['fiche', 'emigration', 'militaire'], kind: 'acte', countries: ['canada', 'quebec']},
        {key: 'nara', group: 'amerique', country: 'États-Unis', icon: '🇺🇸', label: 'NARA — Archives nationales des États-Unis',
            home: 'https://catalog.archives.gov/', search: 'https://catalog.archives.gov/advancedsearch', verified: 'partiel',
            note: 'Le catalogue et sa recherche avancée sont confirmés ; la forme « /search?q=… » ne l’est pas.',
            build: p => `https://catalog.archives.gov/search?q=${encodeURIComponent(`"${nameOf(p)}"`)}`, where: ['fiche', 'emigration', 'militaire'], kind: 'acte', countries: ['etats-unis', 'usa', 'united states', 'amerique']},
        // Find a Grave est déjà dans « Chercher sur internet » (clé findagrave) : seul son import est ajouté ici.
        // 🕯 Justes parmi les nations
        {key: 'yv_justes', group: 'shoah', country: 'Israël', icon: '🕯', label: 'Yad Vashem — Justes parmi les nations',
            home: 'https://righteous.yadvashem.org/', search: 'https://righteous.yadvashem.org/', verified: 'partiel', sensitive: true,
            note: 'Paramètres search, searchType=righteous_only et language vus dans un lien public.',
            build: p => `https://righteous.yadvashem.org/?search=${enc(nameOf(p))}&searchType=righteous_only&language=fr`, where: ['fiche', 'militaire'], kind: 'juste', years: [1933, 1945]},
    ];
    const GROUP_OF_EXISTING = {findagrave: 'amerique', arolsen: 'shoah', yadvashem: 'shoah', archiveorg: 'fr_musees'};
    const site = key => SITES.find(s => s.key === key) || null;
    const groupOf = id => GROUPS.find(g => g.id === id) || null;

    /** un modèle d'adresse écrit par la personne : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à} */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: placeWord(p), de: a || '', a: b || '', naissance: p.birthYear || '', deces: p.deathYear || ''};
        return String(template).replace(/\{([^{}]{1,20})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        return cleanUrl(s.build(p)) || cleanUrl(s.search) || cleanUrl(s.home);
    }
    /** l'adresse des données ouvertes (Open Archives) : la personne l'ouvre, enregistre le fichier, puis l'importe */
    function dataUrl(key, p = {}) { const s = site(key); return s && s.data ? cleanUrl(s.data(p)) : ''; }
    /** pour un site qui garde la recherche dans un formulaire : « NOM Prénom » (ce qu'on colle dans la case) */
    function copyText(key, p = {}) { const s = site(key); if (!s || !s.copy) return ''; return [clean(p.last).toUpperCase(), firstOnly(p.first)].filter(Boolean).join(' '); }

    /** les sites à proposer à un endroit ; ctx : {place, country, y1, y2, gender} — le pays et les années écartent l'inutile */
    function forPlace(where, ctx = {}) {
        const country = fold(ctx.country || ''), place = fold(ctx.place || '');
        const [a, b] = years(ctx);
        return SITES.filter(s => (s.where || []).includes(where)).filter(s => {
            if (s.years && a && b && (b < s.years[0] || a > s.years[1])) return false;
            if (s.place && place && !s.place.test(place)) return false;
            if (s.countries && (where === 'emigration' || where === 'lieu') && country && !s.countries.some(c => country.includes(c))) return false;
            return true;
        });
    }

    /* ═════ Open Archives : JSON de l'API (records/search.json) ou CSV ═════ */
    const OA_TYPES = {doop: 'BAPM', baptism: 'BAPM', baptême: 'BAPM', bapteme: 'BAPM', geboorte: 'BIRT', birth: 'BIRT', naissance: 'BIRT',
        huwelijk: 'MARR', marriage: 'MARR', mariage: 'MARR', ondertrouw: 'MARB', 'marriage banns': 'MARB', overlijden: 'DEAT', death: 'DEAT', décès: 'DEAT', deces: 'DEAT',
        begraven: 'BURI', begrafenis: 'BURI', burial: 'BURI', inhumation: 'BURI', inschrijving: 'RESI', registration: 'RESI', inscription: 'RESI', militie: 'EVEN', bevolkingsregister: 'RESI'};
    const OA_ROLES = {hoofdpersoon: 'Personne principale', 'main person': 'Personne principale', kind: 'Enfant', child: 'Enfant', vader: 'Père', father: 'Père', moeder: 'Mère', mother: 'Mère',
        bruid: 'Mariée', bride: 'Mariée', bruidegom: 'Marié', groom: 'Marié', overledene: 'Défunt', deceased: 'Défunt', getuige: 'Témoin', witness: 'Témoin', dopeling: 'Baptisé', 'child baptized': 'Baptisé'};
    function oaDate(d) {
        if (!d) return {text: '', year: 0};
        if (typeof d === 'string') return {text: d.trim().slice(0, 40), year: yearOf(d)};
        const y = Number(d.year) || 0, m = Number(d.month) || 0, day = Number(d.day) || 0;
        const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return {text: y ? [day || '', m ? MOIS[m - 1] : '', y].filter(Boolean).join(' ') : '', year: y};
    }
    function splitName(full) {
        const s = clean(full); if (!s) return {first: '', last: ''};
        if (s.includes(',')) { const [l, f] = s.split(','); return {first: clean(f), last: clean(l)}; }
        const parts = s.split(' '); // « Jan van der Berg » : les petits mots vont avec le nom
        let i = parts.length - 1; while (i > 0 && /^(van|von|de|der|den|ter|ten|het|la|le|du|da|di|del|dos|das)$/i.test(parts[i - 1])) i--;
        return {first: parts.slice(0, i).join(' '), last: parts.slice(i).join(' ')};
    }
    function parseOpenArchives(text) {
        const s = String(text ?? '').replace(/^﻿/, '').trim().slice(0, 8_000_000); const rows = [];
        if (/^[[{]/.test(s)) {
            let j; try { j = JSON.parse(s); } catch (_) { return {ok: false, error: 'Ce fichier JSON est abîmé : enregistre de nouveau la page de résultats.', rows}; }
            const docs = Array.isArray(j) ? j : Array.isArray(j?.response?.docs) ? j.response.docs : Array.isArray(j?.docs) ? j.docs : [];
            for (const d of docs.slice(0, 2000)) {
                if (!d || typeof d !== 'object') continue;
                const nm = splitName(d.personname || d.name || '');
                const date = oaDate(d.eventdate || d.date);
                const place = Array.isArray(d.eventplace) ? d.eventplace.join(', ') : clean(d.eventplace || '');
                const type = clean(Array.isArray(d.eventtype) ? d.eventtype[0] : d.eventtype || d.sourcetype || '');
                const role = clean(Array.isArray(d.relationtype) ? d.relationtype[0] : d.relationtype || '');
                const id = clean(d.pid || d.identifier || d.id || '');
                const link = cleanUrl(d.url) || (id && d.archive_code ? `https://www.openarchieven.nl/${encodeURIComponent(d.archive_code)}:${encodeURIComponent(id.replace(/^.*:/, ''))}` : '');
                rows.push({first: nm.first, last: nm.last, role: OA_ROLES[fold(role)] || role, roleRaw: role, type, tag: OA_TYPES[fold(type)] || 'EVEN', date: date.text, year: date.year,
                    place: clean(place), archive: clean(d.archive_org || d.archive || d.archive_code || ''), sourceType: clean(d.sourcetype || ''), url: link, id});
            }
            return {ok: true, rows, total: Number(j?.response?.number_found) || rows.length};
        }
        // CSV (séparateur ; , ou tabulation) : en-têtes reconnus en néerlandais, anglais ou français
        const lines = s.split(/\r?\n/).filter(l => l.trim()); if (lines.length < 2) return {ok: false, error: 'Ce fichier ne contient pas de lignes de résultats.', rows};
        const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
        const splitCsv = line => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(c => c.trim()); };
        const head = splitCsv(lines[0]).map(fold);
        const col = names => head.findIndex(h => names.includes(h));
        const C = {name: col(['naam', 'name', 'nom', 'personname', 'persoon']), type: col(['gebeurtenis', 'event', 'eventtype', 'type', 'evenement', 'événement']), date: col(['datum', 'date', 'eventdate']),
            place: col(['plaats', 'place', 'lieu', 'eventplace']), role: col(['rol', 'role', 'rôle', 'relationtype']), archive: col(['archief', 'archive', 'archives']), url: col(['url', 'link', 'lien'])};
        if (C.name < 0) return {ok: false, error: 'Je ne trouve pas la colonne du nom (« Naam », « Name » ou « Nom »).', rows};
        for (const line of lines.slice(1, 2001)) {
            const c = splitCsv(line); const nm = splitName(c[C.name]); const type = C.type >= 0 ? clean(c[C.type]) : ''; const role = C.role >= 0 ? clean(c[C.role]) : '';
            const dt = C.date >= 0 ? clean(c[C.date]) : '';
            rows.push({first: nm.first, last: nm.last, role: OA_ROLES[fold(role)] || role, roleRaw: role, type, tag: OA_TYPES[fold(type)] || 'EVEN', date: dt, year: yearOf(dt),
                place: C.place >= 0 ? clean(c[C.place]) : '', archive: C.archive >= 0 ? clean(c[C.archive]) : '', sourceType: '', url: C.url >= 0 ? cleanUrl(c[C.url]) : '', id: ''});
        }
        return {ok: true, rows, total: rows.length};
    }

    /* ═════ FreeBMD : le texte copié d'une page de résultats ═════
     * « Births Mar 1872 » puis des lignes « SMITH  John  Leeds  9b  345 » (mariages : nom du conjoint ; décès : âge). */
    const QUARTERS = {mar: 1, jun: 2, sep: 3, dec: 4};
    const QUARTER_FR = ['', '1er trimestre (janvier-mars)', '2e trimestre (avril-juin)', '3e trimestre (juillet-septembre)', '4e trimestre (octobre-décembre)'];
    function parseFreeBMD(text) {
        const rows = []; let kind = '', q = 0, year = 0;
        for (const raw of String(text ?? '').slice(0, 400000).split(/\r?\n/)) {
            const line = raw.replace(/ /g, ' ').trim(); if (!line) continue;
            const h = line.match(/^(Births|Marriages|Deaths)\s+(Mar|Jun|Sep|Dec)\w*\s+(\d{4})/i);
            if (h) { kind = h[1].toLowerCase(); q = QUARTERS[h[2].toLowerCase().slice(0, 3)]; year = Number(h[3]); continue; }
            if (!kind || /^surname\b/i.test(line)) continue;
            const c = line.split(/\t+| {2,}/).map(x => x.trim()).filter(Boolean);
            if (c.length < 4 || !/^[A-Z'’ -]{2,}$/.test(c[0])) continue;
            const page = c[c.length - 1], vol = c[c.length - 2], district = c[c.length - 3];
            const extra = c.length >= 6 ? c[2] : '';
            rows.push({kind, tag: kind === 'births' ? 'BIRT' : kind === 'marriages' ? 'MARR' : 'DEAT', last: c[0].charAt(0) + c[0].slice(1).toLowerCase(), first: c[1],
                extra, district, vol, page, year, quarter: q, quarterText: q ? `${QUARTER_FR[q]} ${year}` : String(year),
                date: String(year), note: `Déclaré au ${q ? QUARTER_FR[q] : ''} ${year}, district de ${district} (vol. ${vol}, page ${page})${extra ? ` · ${kind === 'deaths' ? 'âge ou naissance' : kind === 'marriages' ? 'conjoint' : 'nom de la mère'} : ${extra}` : ''}`.replace(/\s+/g, ' ')});
        }
        return {ok: rows.length > 0, rows, error: rows.length ? '' : 'Je ne reconnais pas une page de résultats FreeBMD (titres « Births Mar 1872 », puis les lignes).'};
    }

    /* ═════ Texte copié d'une fiche : « Étiquette : valeur » ou l'étiquette puis la valeur à la ligne ═════ */
    const LABELS = {
        cicr: {last: ['nom', 'name', 'surname'], first: ['prenom', 'prenoms', 'first name', 'forename'], birth_date: ['date de naissance', 'ne le', 'date of birth'], birth_place: ['lieu de naissance', 'place of birth'],
            unit: ['regiment', 'unite', 'corps', 'unit', 'regiment / unite'], rank: ['grade', 'rank'], matricule: ['matricule', 'numero matricule', 'number'], camp: ['camp', 'lieu de detention', 'interne a'],
            capture_date: ['date de capture', 'capture le', 'fait prisonnier le', 'date of capture'], capture_place: ['lieu de capture', 'fait prisonnier a', 'place of capture'], nationality: ['nationalite', 'armee', 'nationality'], cote: ['cote', 'reference']},
        elu: {last: ['nom'], first: ['prenom', 'prenoms'], birth_date: ['date de naissance', 'ne le'], birth_place: ['lieu de naissance', 'ne a'], death_date: ['date de deces', 'decede le'], death_place: ['lieu de deces', 'decede a'],
            mandates: ['mandats', 'mandat', 'mandats a l\'assemblee nationale ou a la chambre des deputes', 'mandats au senat'], dept: ['departement', 'circonscription'], group: ['groupe', 'groupe politique'], job: ['profession']},
        brevet: {number: ['numero', 'n°', 'numero du brevet', 'n° du brevet', 'cote'], title: ['titre', 'titre du brevet', 'objet'], date: ['date de depot', 'date', 'depose le', 'date de delivrance'], inventor: ['inventeur', 'inventeurs', 'deposant', 'titulaire', 'demandeur'],
            job: ['profession', 'qualite'], address: ['adresse', 'domicile', 'demeurant a'], duration: ['duree', 'duree du brevet'], kind: ['type', 'nature', 'type de titre']},
        these: {author: ['auteur', 'auteurs', 'nom'], title: ['titre'], year: ['annee', 'date', 'date de soutenance', 'publication'], faculty: ['faculte', 'universite', 'etablissement', 'lieu de soutenance'], cote: ['cote'], note: ['note de these', 'these']},
        polytechnique: {last: ['nom'], first: ['prenom', 'prenoms'], promotion: ['promotion', 'promo'], matricule: ['matricule', 'numero matricule'], birth_date: ['date de naissance', 'ne le'], birth_place: ['lieu de naissance', 'ne a'],
            entry: ['entree', 'rang d\'entree', 'date d\'entree'], exit: ['sortie', 'rang de sortie', 'corps de sortie', 'corps'], father: ['pere', 'profession du pere']},
        cths: {last: ['nom'], first: ['prenom', 'prenoms'], birth_date: ['naissance', 'ne le', 'date de naissance'], death_date: ['deces', 'date de deces'], job: ['profession', 'activite', 'qualite'], societies: ['societes', 'societe', 'membre de', 'appartenance']},
        joconde: {title: ['titre', 'appellation'], author: ['auteur', 'auteur / execution', 'artiste'], date: ['date', 'millesime', 'periode de creation', 'date de creation'], museum: ['musee', 'lieu de conservation', 'musee de france'], inventory: ['numero d\'inventaire', 'n° d\'inventaire', 'inventaire'],
            technique: ['materiaux / techniques', 'materiaux/techniques', 'technique'], dims: ['mesures', 'dimensions'], domain: ['domaine', 'denomination']},
        findagrave: {name: ['name'], birth: ['birth', 'born'], death: ['death', 'died'], burial: ['burial', 'buried'], cemetery: ['cemetery'], plot: ['plot'], memorial: ['memorial id', 'find a grave memorial id']},
        freecen: {last: ['surname', 'last name'], first: ['forenames', 'forename', 'first name'], year: ['census year', 'year', 'census'], relation: ['relationship', 'relation to head', 'relation'], condition: ['marital status', 'condition'],
            age: ['age'], job: ['occupation'], birth_place: ['birth place', 'where born', 'birth parish'], birth_county: ['birth county'], piece: ['piece', 'piece number'], place: ['place', 'parish', 'civil parish', 'district']},
        juste: {name: ['nom', 'name', 'names'], country: ['pays', 'country', 'pays de reconnaissance'], date: ['date de reconnaissance', 'date of recognition', 'reconnu le', 'year of recognition'], file: ['dossier', 'file', 'file number', 'n° de dossier'],
            rescued: ['personnes sauvees', 'rescued persons', 'sauves'], place: ['lieu', 'place', 'lieu du sauvetage', 'place of rescue']},
        arolsen: {last: ['nom', 'name', 'last name'], first: ['prenom', 'first name'], birth_date: ['date de naissance', 'date of birth', 'geburtsdatum'], birth_place: ['lieu de naissance', 'place of birth', 'geburtsort'],
            document: ['document', 'type de document', 'document type'], camp: ['camp', 'lieu'], number: ['numero de detenu', 'prisoner number', 'haftlingsnummer'], ref: ['numero de document', 'document id', 'reference']},
        acte: {type: ['type d\'acte', 'acte', 'tipo', 'tipo di atto', 'tipo de documento', 'type', 'akt', 'rodzaj'], date: ['date', 'data', 'fecha', 'datum', 'annee', 'anno', 'ano', 'rok'],
            place: ['lieu', 'commune', 'localita', 'luogo', 'lugar', 'localidad', 'freguesia', 'parafia', 'paroisse', 'parish', 'place'],
            last: ['nom', 'cognome', 'apellido', 'apelido', 'nazwisko', 'surname'], first: ['prenom', 'nome', 'nombre', 'imie', 'given name'],
            father: ['pere', 'padre', 'pai', 'ojciec', 'father', 'nome padre'], mother: ['mere', 'madre', 'mae', 'matka', 'mother', 'nome madre'], spouse: ['conjoint', 'coniuge', 'conyuge', 'conjuge', 'malzonek', 'spouse'],
            cote: ['cote', 'segnatura', 'signatura', 'cota', 'sygnatura', 'reference', 'codigo de referencia'], archive: ['archives', 'archivio', 'archivo', 'arquivo', 'archiwum', 'fonds']},
        electeur: {last: ['nom'], first: ['prenom', 'prenoms'], birth_date: ['date de naissance', 'ne le'], birth_place: ['lieu de naissance', 'ne a'], job: ['profession'], address: ['domicile', 'adresse'], year: ['annee', 'liste de']},
        livre: {title: ['titre'], author: ['auteur'], year: ['date', 'annee', 'publication'], publisher: ['editeur', 'publisher'], pages: ['pages', 'page']},
    };
    function parseFields(text, kind) {
        const map = LABELS[kind] || {}; const out = {};
        const lines = String(text ?? '').slice(0, 40000).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const keyOf = lab => { const f = fold(lab).replace(/\s*:\s*$/, '').replace(/[.]+$/, ''); for (const [k, list] of Object.entries(map)) if (list.includes(f)) return k; return null; };
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^([^:]{2,60}?)\s*:\s*(.*)$/);
            let k = null, v = '';
            if (m) { k = keyOf(m[1]); v = m[2]; if (k && !v && lines[i + 1] && !/:/.test(lines[i + 1])) { v = lines[i + 1]; i++; } }
            else { k = keyOf(lines[i]); if (k && lines[i + 1] && !keyOf(lines[i + 1])) { v = lines[i + 1]; i++; } }
            if (k && v && !out[k]) out[k] = v.slice(0, 600);
        }
        if (out.last && out.last === out.last.toUpperCase() && out.last.length > 1) out.last = out.last.charAt(0) + out.last.slice(1).toLowerCase();
        if (kind === 'findagrave' && out.memorial) out.memorial = (out.memorial.match(/\d{3,12}/) || [''])[0];
        if (kind === 'findagrave' && !out.memorial) { const m = String(text ?? '').match(/findagrave\.com\/memorial\/(\d{3,12})/i); if (m) out.memorial = m[1]; }
        return out;
    }
    /** devine la sorte d'un texte collé (sinon '') */
    function detectKind(text) {
        const t = fold(String(text ?? '').slice(0, 20000));
        if (/^\s*[[{]/.test(t) && /personname|eventtype|number_found/.test(t)) return 'openarchives';
        if (/\b(births|marriages|deaths)\s+(mar|jun|sep|dec)\w*\s+\d{4}/.test(t)) return 'freebmd';
        if (/find ?a ?grave|memorial id/.test(t)) return 'findagrave';
        if (/census year|where born|freecen/.test(t)) return 'freecen';
        if (/righteous|juste parmi les nations|justes parmi les nations/.test(t)) return 'juste';
        if (/arolsen|haftlings|prisoner number/.test(t)) return 'arolsen';
        if (/prisonnier|captur|agence internationale|icrc|cicr/.test(t)) return 'cicr';
        if (/brevet|inventeur|inpi/.test(t)) return 'brevet';
        if (/these|faculte de medecine/.test(t)) return 'these';
        if (/polytechni|promotion/.test(t)) return 'polytechnique';
        if (/depute|senateur|sycomore|mandat/.test(t)) return 'elu';
        if (/societes savantes|cths|france savante/.test(t)) return 'cths';
        if (/numero d'inventaire|joconde|musee/.test(t)) return 'joconde';
        if (/liste electorale|listes electorales/.test(t)) return 'electeur';
        if (/cognome|apellido|nazwisko|parafia|freguesia/.test(t)) return 'acte';
        return '';
    }

    /** ce qu'une fiche lue propose d'ajouter : des événements (balise GEDCOM, date C4, lieu, note) et des blocs ;
     *  rien n'est appliqué sans clic, rien n'est écrasé : l'import ne propose que ce qui manque. */
    const KIND_LABEL = {cicr: 'Fiche de prisonnier (CICR)', elu: 'Fiche d’élu', brevet: 'Brevet d’invention', these: 'Thèse de médecine', polytechnique: 'Registre de l’École polytechnique',
        cths: 'Annuaire des sociétés savantes (CTHS)', joconde: 'Œuvre d’un musée (Joconde)', findagrave: 'Tombe (Find a Grave)', freecen: 'Recensement britannique (FreeCEN)', freebmd: 'Index FreeBMD',
        openarchives: 'Acte (Open Archives)', juste: 'Juste parmi les nations (Yad Vashem)', arolsen: 'Document des Arolsen Archives', acte: 'Acte d’état civil ou paroissial', electeur: 'Liste électorale', livre: 'Livre ou article'};
    const ACT_TAGS = [[/naiss|nasc|nacim|urodz|birth|geboorte/, 'BIRT'], [/bapt|batt|bautis|chrzest|doop/, 'BAPM'], [/mari|matrim|casam|slub|huwelijk|marriage/, 'MARR'], [/dec|mort|morte|defun|obit|zgon|death|overlijden/, 'DEAT'], [/sepult|inhum|burial|begraf/, 'BURI']];
    function proposals(kind, f = {}) {
        const ev = []; const blocks = [];
        const add = (tag, label, date, place, note) => { if (date || place || note) ev.push({tag, label, date: clean(date), place: clean(place), note: clean(note).slice(0, 500)}); };
        switch (kind) {
            case 'cicr':
                add('BIRT', 'Naissance', f.birth_date, f.birth_place, '');
                add('EVEN', 'Fait prisonnier', f.capture_date, f.capture_place, [f.unit && i18n('Unité : {nm}', {nm: f.unit}), f.rank && i18n('Grade : {nm}', {nm: f.rank}), f.camp && i18n('Camp : {nm}', {nm: f.camp})].filter(Boolean).join(' · '));
                blocks.push({block: 'military', label: 'Militaire', data: {unit: f.unit || '', rank: f.rank || '', matricule: f.matricule || '', note: f.camp ? i18n('Prisonnier, camp : {nm}', {nm: f.camp}) : 'Prisonnier de guerre'}});
                break;
            case 'elu':
                add('BIRT', 'Naissance', f.birth_date, f.birth_place, ''); add('DEAT', 'Décès', f.death_date, f.death_place, '');
                if (f.mandates || f.dept) blocks.push({block: 'profiles', label: 'Profil « politique »', data: {profile: 'politique', mandates: f.mandates || '', dept: f.dept || '', group: f.group || ''}});
                if (f.job) add('OCCU', 'Profession', '', '', f.job);
                break;
            case 'brevet':
                blocks.push({block: 'sciences', label: 'Inventions (brevet)', data: {kind: 'brevet', title: f.title || '', number: f.number || '', date: f.date || '', country: 'France', note: [f.duration && i18n('Durée : {nm}', {nm: f.duration}), f.address && i18n('Adresse : {nm}', {nm: f.address})].filter(Boolean).join(' · ')}});
                if (f.job) add('OCCU', 'Profession', f.date, '', f.job);
                if (f.address) add('RESI', 'Domicile', f.date, f.address, 'D’après le brevet');
                break;
            case 'these':
                blocks.push({block: 'education', label: 'Diplômes et formation', data: {diploma: 'Doctorat en médecine (thèse)', title: f.title || '', year: yearOf(f.year) || '', school: f.faculty || '', cote: f.cote || ''}});
                break;
            case 'polytechnique':
                add('BIRT', 'Naissance', f.birth_date, f.birth_place, '');
                blocks.push({block: 'education', label: 'Diplômes et formation', data: {diploma: 'École polytechnique', title: f.promotion ? `Promotion ${f.promotion}` : '', year: yearOf(f.promotion || f.entry) || '', school: 'École polytechnique', cote: f.matricule || '', note: f.exit ? i18n('Sortie : {nm}', {nm: f.exit}) : ''}});
                break;
            case 'cths':
                add('BIRT', 'Naissance', f.birth_date, '', ''); add('DEAT', 'Décès', f.death_date, '', '');
                if (f.job) add('OCCU', 'Profession', '', '', f.job);
                if (f.societies) blocks.push({block: 'notes', label: 'Note', data: {text: i18n('Membre de sociétés savantes : {nm}', {nm: f.societies})}});
                break;
            case 'joconde':
                blocks.push({block: 'artistic_works', label: 'Œuvre', data: {title: f.title || '', date: f.date || '', museum: f.museum || '', inventory: f.inventory || '', technique: f.technique || '', dims: f.dims || ''}});
                break;
            case 'findagrave':
                add('BIRT', 'Naissance', f.birth, '', ''); add('DEAT', 'Décès', f.death, '', '');
                add('BURI', 'Inhumation', '', f.cemetery || f.burial, [f.plot && i18n('Emplacement : {nm}', {nm: f.plot}), f.memorial && i18n('Find a Grave n° {nm}', {nm: f.memorial})].filter(Boolean).join(' · '));
                break;
            case 'freecen':
                add('CENS', 'Recensement', f.year, f.place, [f.relation && i18n('Lien : {nm}', {nm: f.relation}), f.age && i18n('Âge : {nm}', {nm: f.age}), f.job && i18n('Profession : {nm}', {nm: f.job}), f.birth_place && `Né à ${f.birth_place}${f.birth_county ? ` (${f.birth_county})` : ''}`].filter(Boolean).join(' · '));
                break;
            case 'juste':
                blocks.push({block: 'awards', label: 'Concours et récompenses', data: {kind: 'decoration', title: 'Juste parmi les nations', date: f.date || '', org: 'Yad Vashem', note: [f.country && i18n('Pays : {nm}', {nm: f.country}), f.file && i18n('Dossier : {nm}', {nm: f.file})].filter(Boolean).join(' · ')}});
                break;
            case 'arolsen':
                add('BIRT', 'Naissance', f.birth_date, f.birth_place, '');
                if (f.camp || f.document) add('EVEN', 'Document des Arolsen Archives', '', f.camp, [f.document, f.number && `N° ${f.number}`, f.ref && `Réf. ${f.ref}`].filter(Boolean).join(' · '));
                break;
            case 'electeur':
                if (f.address) add('RESI', 'Domicile (liste électorale)', f.year, f.address, f.job ? i18n('Profession : {nm}', {nm: f.job}) : '');
                break;
            case 'acte': {
                const t = fold(f.type || ''); const tag = (ACT_TAGS.find(([re]) => re.test(t)) || [null, 'EVEN'])[1];
                add(tag, f.type || 'Acte', f.date, f.place, [f.father && i18n('Père : {nm}', {nm: f.father}), f.mother && i18n('Mère : {nm}', {nm: f.mother}), f.spouse && i18n('Conjoint : {nm}', {nm: f.spouse}), f.cote && i18n('Cote : {nm}', {nm: f.cote})].filter(Boolean).join(' · '));
                break;
            }
            default: break;
        }
        return {events: ev, blocks, label: KIND_LABEL[kind] || 'Fiche'};
    }

    /** le titre de la source créée à l'import */
    function sourceTitle(kind, f = {}, siteKey = '') {
        const s = site(siteKey); const who = clean([f.first, f.last].filter(Boolean).join(' ') || f.name || f.author || f.inventor || '');
        const base = KIND_LABEL[kind] || (s ? s.label : 'Archives en ligne');
        return `${base}${who ? ` — ${who}` : ''}${f.title ? ` — ${clean(f.title).slice(0, 80)}` : ''}`.slice(0, 240);
    }

    return {CHECKED, MENTION, SITES, GROUPS, GROUP_OF_EXISTING, KIND_LABEL, site, groupOf, url, dataUrl, copyText, fill, forPlace,
        parseOpenArchives, parseFreeBMD, parseFields, detectKind, proposals, sourceTitle, splitName, cleanUrl, fold, yearOf};
});
