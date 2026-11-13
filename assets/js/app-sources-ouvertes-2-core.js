/* LCNDA — 🗂 Archives en ligne (suite) : Archives nationales, ANOM, Service historique de la Défense, mémoire de la
 * déportation et des fusillés, Journal officiel, annuaires anciens, patrimoine (Mérimée, Palissy), archives étrangères.
 * Calculs purs, SANS RÉSEAU (window.LCNDA_SOURCES_OUVERTES_2 ; aussi require() dans Node pour les tests).
 *
 * Même principe que la première vague (app-sources-ouvertes-core.js) : l'app N'INTERROGE JAMAIS ces sites. Elle fabrique
 * l'adresse d'une recherche, que le navigateur de la personne ouvre, puis lit ce que la personne a téléchargé elle-même
 * (image, PDF, page enregistrée) ou le texte copié. Rien n'est écrit sans son clic, rien n'est écrasé, tout se défait.
 *
 *  - SITES, GROUPS             les sites (clé, groupe, adresse modèle, vérifiée ou non, compte gratuit…)
 *  - url(key, p, custom)       l'adresse remplie ; custom = { clé: modèle } écrit dans « ⚙️ Adresses des sites »
 *  - KINDS                     les sortes d'import (ce qu'on lit, ce qu'on propose d'ajouter)
 *  - parseFields(texte, sorte) le texte copié d'une notice → champs reconnus (décret, cote, convoi, notice POP…)
 *  - proposals(sorte, champs, fiche) les ajouts proposés (événements, blocs), chacun coché ou non, avec la raison
 *  - parseLink(adresse)        ce qu'un lien collé dit déjà (site, cote, notice)
 *  - RESPECT                   les événements qui demandent du respect (déportation, fusillé) : jamais dans un jeu
 *
 * Adresses : seules celles marquées verified:true ont été ouvertes en ligne le jour où elles ont été écrites (FranceArchives,
 * avec ses filtres « es_publisher ») ; les autres suivent la forme connue des sites et se changent dans « ⚙️ Adresses des sites ».
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES_2 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const i18n = (s, v) => (typeof window !== 'undefined' && window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js (dans Node : le français)
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const town = s => clean(s).split(',')[0].replace(/\s*\(.*\)\s*$/, '').trim();
    const nameOf = p => [firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
    const years = p => { let a = Number(p.y1) || 0, b = Number(p.y2) || 0; if (a && b && b < a) [a, b] = [b, a]; return [a, b || a]; };
    const google = (site, p, words = '') => `https://www.google.com/search?q=${encodeURIComponent([`site:${site}`, p.last ? `"${clean(p.last)}"` : '', p.first ? `"${firstOnly(p.first)}"` : '', words].filter(Boolean).join(' '))}`;

    /* FranceArchives (vérifié le 09/11/2026) : /fr/search?q=… ; es_publisher=34633 Archives nationales, 34641 Archives
     * nationales d'outre-mer, 34577 Service historique de la Défense. Les noms y sont écrits « Nom, Prénom ». */
    const FA_PUB = {an: 34633, anom: 34641, shd: 34577};
    const fa = (pub, words) => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(words.filter(Boolean).join(' '))}${pub ? `&es_publisher=${pub}` : ''}`;
    const faName = p => [clean(p.last), firstOnly(p.first)].filter(Boolean).join(' ');
    /** Gallica, recherche SRU (la forme que l'app utilise déjà) : un nom + des mots du titre + des années */
    function gallica(p, titleWords, extra = []) {
        const [a, b] = years(p); const parts = [];
        const n = nameOf(p).replace(/"/g, ''); if (n) parts.push(`(gallica all "${n}")`);
        if (titleWords) parts.push(`(dc.title all "${titleWords}")`);
        extra.filter(Boolean).forEach(w => parts.push(`(gallica all "${String(w).replace(/"/g, '')}")`));
        if (a) parts.push(`gallicapublication_date>="${a}/01/01"`); if (b) parts.push(`gallicapublication_date<="${b}/12/31"`);
        return `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(parts.join(' and '))}`;
    }
    /** POP (plateforme ouverte du patrimoine) : la base choisie et les mots cherchés, écrits en JSON dans l'adresse */
    const pop = (base, q) => `https://pop.culture.gouv.fr/search/list?base=${encodeURIComponent(JSON.stringify([base]))}&mainSearch=${encodeURIComponent(JSON.stringify(clean(q)))}`;

    /** Les cantons suisses : chaque canton a ses archives (lien vers son site officiel, recherche limitée à ce site) */
    const CANTONS = [['AG', 'Argovie', 'ag.ch'], ['AI', 'Appenzell Rhodes-Intérieures', 'ai.ch'], ['AR', 'Appenzell Rhodes-Extérieures', 'ar.ch'], ['BE', 'Berne', 'be.ch'],
        ['BL', 'Bâle-Campagne', 'bl.ch'], ['BS', 'Bâle-Ville', 'bs.ch'], ['FR', 'Fribourg', 'fr.ch'], ['GE', 'Genève', 'ge.ch'], ['GL', 'Glaris', 'gl.ch'], ['GR', 'Grisons', 'gr.ch'],
        ['JU', 'Jura', 'jura.ch'], ['LU', 'Lucerne', 'lu.ch'], ['NE', 'Neuchâtel', 'ne.ch'], ['NW', 'Nidwald', 'nw.ch'], ['OW', 'Obwald', 'ow.ch'], ['SG', 'Saint-Gall', 'sg.ch'],
        ['SH', 'Schaffhouse', 'sh.ch'], ['SO', 'Soleure', 'so.ch'], ['SZ', 'Schwytz', 'sz.ch'], ['TG', 'Thurgovie', 'tg.ch'], ['TI', 'Tessin', 'ti.ch'], ['UR', 'Uri', 'ur.ch'],
        ['VD', 'Vaud', 'vd.ch'], ['VS', 'Valais', 'vs.ch'], ['ZG', 'Zoug', 'zg.ch'], ['ZH', 'Zurich', 'zh.ch']];
    const canton = code => CANTONS.find(c => c[0] === String(code || '').toUpperCase()) || null;

    /* ═════ Les groupes ═════ respect: true → ton respectueux, phrase de contexte, jamais dans un jeu */
    const GROUPS = {
        an: {icon: '🏛', label: 'Archives nationales', text: 'Décrets de naturalisation (1883-1930) et Minutier central des notaires de Paris.'},
        anom: {icon: '🌍', label: 'Archives nationales d’outre-mer', text: 'État civil des anciennes colonies (Algérie, Antilles, Indochine…) et registres des bagnards.'},
        shd: {icon: '⚓', label: 'Service historique de la Défense', text: 'Inscrits maritimes et dossiers d’officiers.'},
        memoire: {icon: '🕯', label: 'Mémoire de la déportation et des fusillés', respect: true,
            text: 'Ces bases gardent les noms des personnes déportées, mortes en déportation ou fusillées. Elles sont faites pour que l’on se souvienne d’elles : prends le temps de lire chaque notice.'},
        jo: {icon: '📜', label: 'Journal officiel (Gallica)', text: 'Naturalisations, décorations et changements de nom publiés au Journal officiel.'},
        annuaires: {icon: '📒', label: 'Annuaires anciens (Gallica)', text: 'Bottin et annuaires départementaux : le métier et l’adresse d’un commerçant ou d’un artisan une année donnée.'},
        patrimoine: {icon: '🏰', label: 'Patrimoine (Mérimée, Palissy)', text: 'Les notices des monuments et des objets protégés : église, château, maison, mobilier, objet de famille.'},
        etranger: {icon: '🌐', label: 'Archives à l’étranger', text: 'Belgique, cantons suisses, arrivées à Ellis Island (New York).'},
    };

    /* ═════ Les sites ═════
     * group, icon, label, home (accueil, toujours sûr), verified (adresse ouverte en ligne le jour où elle a été écrite),
     * kind (sorte d'import proposée après la recherche), needs ('canton' | 'place' : la case à remplir d'abord), account (compte gratuit),
     * on : où le bouton apparaît en plus de « Chercher sur internet » (person | place | house | object | military | voyage). */
    const SITES = [
        {key: 'an_naturalisation', group: 'an', icon: '🏛', label: 'Décrets de naturalisation 1883-1930', kind: 'naturalisation', verified: true, on: ['person', 'voyage'],
            home: 'https://francearchives.gouv.fr/fr/search?q=d%C3%A9crets%20de%20naturalisation&es_publisher=34633',
            build: p => fa(FA_PUB.an, [faName(p), 'naturalisation'])},
        {key: 'an_minutier', group: 'an', icon: '✒', label: 'Minutier central des notaires de Paris', kind: 'minutier', verified: true, on: ['person'],
            home: 'https://www.siv.archives-nationales.culture.gouv.fr/siv/',
            build: p => fa(FA_PUB.an, [faName(p), 'minutier central'])},
        {key: 'an_siv', group: 'an', icon: '🗄', label: 'Salle des inventaires virtuelle (SIV)', kind: 'minutier', verified: false, on: [],
            home: 'https://www.siv.archives-nationales.culture.gouv.fr/siv/',
            build: () => 'https://www.siv.archives-nationales.culture.gouv.fr/siv/'},
        {key: 'anom_ec', group: 'anom', icon: '🌍', label: 'État civil des anciennes colonies (ANOM)', kind: 'anom_ec', verified: false, on: ['person'],
            home: 'https://recherche-anom.culture.gouv.fr/',
            build: () => 'https://recherche-anom.culture.gouv.fr/'},
        {key: 'anom_fa', group: 'anom', icon: '🔍', label: 'ANOM sur FranceArchives (inventaires)', kind: 'anom_ec', verified: true, on: [],
            home: 'https://francearchives.gouv.fr/fr/search?q=&es_publisher=34641',
            build: p => fa(FA_PUB.anom, [faName(p)])},
        {key: 'anom_bagnards', group: 'anom', icon: '⛓', label: 'Registres et dossiers des bagnards (ANOM)', kind: 'bagne', verified: true, on: ['person'],
            home: 'https://recherche-anom.culture.gouv.fr/',
            build: p => fa(FA_PUB.anom, [faName(p), 'bagne'])},
        {key: 'shd_marins', group: 'shd', icon: '⚓', label: 'Inscrits maritimes (SHD)', kind: 'shd_marin', verified: true, on: ['person', 'military'],
            home: 'https://www.servicehistorique.sga.defense.gouv.fr/',
            build: p => fa(FA_PUB.shd, [faName(p), 'inscription maritime'])},
        {key: 'shd_officiers', group: 'shd', icon: '🎖', label: 'Dossiers d’officiers (SHD)', kind: 'shd_officier', verified: true, on: ['person', 'military'],
            home: 'https://www.servicehistorique.sga.defense.gouv.fr/',
            build: p => fa(FA_PUB.shd, [faName(p), 'dossier'])},
        {key: 'shoah_memorial', group: 'memoire', icon: '🕯', label: 'Mémorial de la Shoah', kind: 'deportation', verified: false, on: ['person'],
            home: 'https://www.memorialdelashoah.org/',
            build: p => google('memorialdelashoah.org', p)},
        {key: 'fmd_livre', group: 'memoire', icon: '🕯', label: 'Livre-Mémorial des déportés (FMD)', kind: 'deportation', verified: false, on: ['person'],
            home: 'http://www.bddm.org/liv/recherche.php',
            build: p => google('bddm.org', p)},
        {key: 'maitron_fusilles', group: 'memoire', icon: '🕯', label: 'Maitron des fusillés 1940-1944', kind: 'fusille', verified: false, on: ['person'],
            home: 'https://fusilles-40-44.maitron.fr/',
            build: p => `https://fusilles-40-44.maitron.fr/?s=${enc(nameOf(p))}`},
        {key: 'jo_gallica', group: 'jo', icon: '📜', label: 'Journal officiel (Gallica)', kind: 'jo', verified: false, on: ['person', 'voyage'],
            home: 'https://gallica.bnf.fr/ark:/12148/cb328020951/date',
            build: p => gallica(p, 'Journal officiel de la République française')},
        {key: 'annuaires_gallica', group: 'annuaires', icon: '📒', label: 'Annuaires départementaux (Gallica)', kind: 'annuaire', verified: false, on: ['person'],
            home: 'https://gallica.bnf.fr/',
            build: p => gallica({...p, first: ''}, 'annuaire', [town(p.place)])},
        {key: 'bottin_gallica', group: 'annuaires', icon: '📒', label: 'Bottin — Annuaire-almanach du commerce (Gallica)', kind: 'annuaire', verified: false, on: ['person'],
            home: 'https://gallica.bnf.fr/',
            build: p => gallica({...p, first: ''}, 'Annuaire-almanach du commerce', [town(p.place)])},
        {key: 'pop_merimee', group: 'patrimoine', icon: '🏰', label: 'Mérimée — monuments (POP)', kind: 'patrimoine', verified: false, on: ['place', 'house'], needs: 'place',
            home: 'https://pop.culture.gouv.fr/',
            build: p => pop('Patrimoine architectural (Mérimée)', p.q || [p.what, town(p.place)].filter(Boolean).join(' '))},
        {key: 'pop_palissy', group: 'patrimoine', icon: '🏺', label: 'Palissy — objets et mobilier (POP)', kind: 'patrimoine', verified: false, on: ['place', 'object'], needs: 'place',
            home: 'https://pop.culture.gouv.fr/',
            build: p => pop('Patrimoine mobilier (Palissy)', p.q || [p.what, town(p.place)].filter(Boolean).join(' '))},
        {key: 'be_arch', group: 'etranger', icon: '🇧🇪', label: 'Archives de l’État en Belgique (personnes)', kind: 'etranger_acte', verified: false, on: ['person', 'voyage'],
            home: 'https://search.arch.be/',
            build: p => `https://search.arch.be/fr/rechercher-des-personnes/resultats/q/persoon_achternaam_t_0/${enc(p.last)}${p.first ? `/persoon_voornaam_t_0/${enc(firstOnly(p.first))}` : ''}`},
        {key: 'ch_canton', group: 'etranger', icon: '🇨🇭', label: 'Archives cantonales suisses', kind: 'etranger_acte', verified: false, on: ['person', 'voyage'], needs: 'canton',
            home: 'https://www.archives-online.org/',
            build: p => { const c = canton(p.canton); return c ? google(c[2], p, 'archives') : 'https://www.archives-online.org/'; }},
        {key: 'ellis', group: 'etranger', icon: '🗽', label: 'Ellis Island — passagers (Statue of Liberty Foundation)', kind: 'ellis', verified: false, on: ['person', 'voyage'], account: true,
            home: 'https://heritage.statueofliberty.org/',
            build: () => 'https://heritage.statueofliberty.org/'},
    ];
    const site = key => SITES.find(s => s.key === key) || null;

    /** un modèle écrit par la personne : {nom} {prénom} {nom_complet} {lieu} {de} {à} {naissance} {décès} {canton} {quoi} {requête} */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: town(p.place), de: a || '', a: b || '', naissance: p.birthYear || '', deces: p.deathYear || '',
            canton: p.canton || '', quoi: p.what || '', requete: p.q || ''};
        return String(template).replace(/\{([^{}]{1,20})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    /** l'adresse à ouvrir : celle écrite dans « ⚙️ Adresses des sites » si elle est sûre, sinon celle de l'app */
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        return cleanUrl(s.build(p)) || cleanUrl(s.home) || '';
    }
    /** les sites à montrer à un endroit (fiche, lieu, maison, objet, bloc militaire, départs) */
    const sitesFor = where => SITES.filter(s => (s.on || []).includes(where));

    /* ═════ Les sortes d'import ═════
     * fields : [clé, libellé, sorte de case ('date' C4 | 'text' | 'long' | 'choice')] ; choice : les choix possibles. */
    const KINDS = {
        naturalisation: {label: 'Décret de naturalisation', icon: '🏛', fields: [['date', 'Date du décret', 'date'], ['number', 'Numéro du dossier ou du décret', 'text'], ['cote', 'Cote (BB/11/…, BB/34/…)', 'text'], ['origin', 'Nationalité d’avant', 'text'], ['place', 'Domicile', 'text']]},
        minutier: {label: 'Acte notarié (Minutier central)', icon: '✒', fields: [['act', 'Sorte d’acte', 'choice', [['contrat', 'Contrat de mariage'], ['inventaire', 'Inventaire après décès'], ['testament', 'Testament'], ['autre', 'Autre acte']]],
            ['date', 'Date de l’acte', 'date'], ['notary', 'Notaire, étude', 'text'], ['cote', 'Cote (MC/ET/…)', 'text'], ['place', 'Lieu', 'text']]},
        anom_ec: {label: 'Acte d’état civil des colonies', icon: '🌍', fields: [['act', 'Sorte d’acte', 'choice', [['naissance', 'Naissance'], ['mariage', 'Mariage'], ['deces', 'Décès']]],
            ['date', 'Date', 'date'], ['place', 'Commune', 'text'], ['territory', 'Territoire (Algérie, Martinique…)', 'text'], ['cote', 'Cote ou référence', 'text']]},
        bagne: {label: 'Registre ou dossier de bagnard', icon: '⛓', fields: [['number', 'Matricule', 'text'], ['date', 'Date de la condamnation', 'date'], ['court', 'Tribunal, cour', 'text'], ['sentence', 'Peine', 'text'],
            ['bagne', 'Bagne (Guyane, Nouvelle-Calédonie…)', 'text'], ['arrival', 'Arrivée au bagne', 'date'], ['end', 'Libération ou décès', 'date'], ['cote', 'Cote (H …)', 'text']]},
        shd_marin: {label: 'Inscrit maritime', icon: '⚓', fields: [['quarter', 'Quartier maritime', 'text'], ['number', 'Folio, numéro', 'text'], ['date', 'Date d’inscription', 'date'], ['ships', 'Navires, campagnes', 'long'], ['cote', 'Cote (SHD …)', 'text']]},
        shd_officier: {label: 'Dossier d’officier', icon: '🎖', fields: [['rank', 'Grade', 'text'], ['arm', 'Arme, corps', 'text'], ['date', 'Date (nomination, retraite…)', 'date'], ['cote', 'Cote (GR …)', 'text'], ['summary', 'Carrière', 'long']]},
        deportation: {label: 'Notice de déportation', icon: '🕯', respect: true, fields: [['convoy', 'Convoi (numéro)', 'text'], ['date', 'Date du départ', 'date'], ['from', 'Lieu de départ (Drancy, Compiègne…)', 'text'],
            ['camp', 'Camp d’arrivée', 'text'], ['death_date', 'Date du décès (si connue)', 'date'], ['death_place', 'Lieu du décès', 'text'], ['fate', 'Devenir (rentré, décédé…)', 'text']]},
        fusille: {label: 'Notice du Maitron des fusillés', icon: '🕯', respect: true, fields: [['date', 'Date', 'date'], ['place', 'Lieu', 'text'], ['summary', 'Ce que dit la notice', 'long']]},
        jo: {label: 'Journal officiel', icon: '📜', fields: [['act', 'Ce que publie le Journal officiel', 'choice', [['naturalisation', 'Naturalisation'], ['decoration', 'Décoration'], ['nom', 'Changement de nom']]],
            ['date', 'Date du Journal officiel', 'date'], ['page', 'Page', 'text'], ['detail', 'Détail (décoration, nouveau nom…)', 'text']]},
        annuaire: {label: 'Annuaire ancien', icon: '📒', fields: [['year', 'Année de l’annuaire', 'text'], ['trade', 'Métier', 'text'], ['address', 'Adresse', 'text'], ['place', 'Commune', 'text'], ['page', 'Page', 'text']]},
        patrimoine: {label: 'Notice du patrimoine', icon: '🏰', fields: [['ref', 'Référence (PA…, IA…, PM…)', 'text'], ['title', 'Titre de la notice', 'text'], ['protection', 'Protection (classé, inscrit…)', 'text'], ['summary', 'Texte de la notice', 'long']]},
        etranger_acte: {label: 'Acte trouvé à l’étranger', icon: '🌐', fields: [['act', 'Sorte d’acte', 'choice', [['naissance', 'Naissance'], ['mariage', 'Mariage'], ['deces', 'Décès'], ['autre', 'Autre']]],
            ['date', 'Date', 'date'], ['place', 'Commune', 'text'], ['country', 'Pays', 'text'], ['cote', 'Cote ou référence', 'text']]},
        ellis: {label: 'Arrivée à Ellis Island', icon: '🗽', fields: [['date', 'Date d’arrivée', 'date'], ['ship', 'Navire', 'text'], ['from', 'Port de départ', 'text'], ['age', 'Âge déclaré', 'text'], ['dest', 'Destination', 'text']]},
    };
    /** les événements qui demandent du respect : une fiche qui en porte un n'entre dans aucun jeu */
    const RESPECT = {slugs: ['deportation', 'deces-en-deportation', 'fusille'], labels: ['Déportation', 'Décès en déportation', 'Fusillé']};
    const isRespectKind = kind => !!KINDS[kind]?.respect;

    /* ═════ Lire le texte copié d'une notice ═════ */
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const DATE_RE = /\b(\d{1,2}(?:er)?\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/i;
    const firstDate = s => (String(s || '').match(DATE_RE) || [])[1] || '';
    const LABELS = {
        naturalisation: {date: ['date du decret', 'decret du', 'date'], number: ['numero de dossier', 'n° de dossier', 'numero', 'dossier'], cote: ['cote'], origin: ['nationalite', 'nationalite d\'origine', 'nationalite anterieure'], place: ['domicile', 'residence', 'demeurant a']},
        minutier: {date: ['date', 'date de l\'acte'], notary: ['notaire', 'etude'], cote: ['cote'], place: ['lieu']},
        anom_ec: {date: ['date', 'date de l\'acte'], place: ['commune', 'lieu'], territory: ['territoire', 'colonie'], cote: ['cote', 'reference']},
        bagne: {number: ['matricule', 'numero matricule'], date: ['date de condamnation', 'condamne le'], court: ['juridiction', 'tribunal', 'cour'], sentence: ['peine', 'condamnation'], bagne: ['bagne', 'lieu de detention'], arrival: ['date d\'arrivee', 'arrivee'], end: ['date de deces', 'date de liberation', 'liberation', 'deces'], cote: ['cote']},
        shd_marin: {quarter: ['quartier', 'quartier maritime', 'quartier d\'inscription'], number: ['folio', 'numero', 'n°'], date: ['date d\'inscription', 'inscrit le'], cote: ['cote']},
        shd_officier: {rank: ['grade'], arm: ['arme', 'corps', 'arme ou service'], date: ['date'], cote: ['cote']},
        deportation: {convoy: ['convoi', 'n° de convoi', 'numero de convoi'], date: ['date de depart', 'date du convoi', 'parti le'], from: ['lieu de depart', 'depart de', 'parti de'], camp: ['destination', 'camp', 'camp d\'arrivee', 'lieu de deportation'],
            death_date: ['date de deces', 'decede le', 'mort le'], death_place: ['lieu de deces', 'decede a', 'mort a'], fate: ['devenir', 'sort', 'situation']},
        fusille: {date: ['date', 'fusille le', 'execute le', 'date d\'execution'], place: ['lieu', 'lieu d\'execution', 'fusille a', 'execute a']},
        jo: {date: ['date', 'journal officiel du'], page: ['page'], detail: ['detail']},
        annuaire: {year: ['annee'], trade: ['metier', 'profession', 'activite'], address: ['adresse'], place: ['commune', 'ville'], page: ['page']},
        patrimoine: {ref: ['reference', 'ref', 'n° de notice'], title: ['titre', 'titre courant', 'denomination', 'appellation'], protection: ['protection', 'type de protection', 'protection mh', 'statut juridique'], summary: ['historique', 'description', 'commentaire historique']},
        etranger_acte: {date: ['date'], place: ['commune', 'lieu', 'plaats', 'gemeinde'], country: ['pays'], cote: ['cote', 'reference']},
        ellis: {date: ['arrival date', 'date of arrival', 'date d\'arrivee'], ship: ['ship of travel', 'ship', 'navire'], from: ['port of departure', 'port de depart'], age: ['age at arrival', 'age'], dest: ['place of residence', 'destination']},
    };
    function parseFields(text, kind) {
        const map = LABELS[kind] || {}; const out = {}; const raw = String(text ?? '').slice(0, 40000);
        const lines = raw.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const keyOf = lab => { const f = fold(lab).replace(/\s*:\s*$/, '').replace(/[.]+$/, ''); for (const [k, list] of Object.entries(map)) if (list.includes(f)) return k; return null; };
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^([^:]{2,40}?)\s*:\s*(.*)$/);
            let k = null, v = '';
            if (m) { k = keyOf(m[1]); v = m[2]; if (k && !v && lines[i + 1] && !/:/.test(lines[i + 1])) { v = lines[i + 1]; i++; } }
            else { k = keyOf(lines[i]); if (k && lines[i + 1] && !keyOf(lines[i + 1])) { v = lines[i + 1]; i++; } }
            if (k && v && !out[k]) out[k] = v.slice(0, 600);
        }
        const all = fold(raw);
        // les cotes et références connues, même au milieu d'une phrase
        const cote = raw.match(/\b(BB\/1[1-3]\/\d{1,5}(?:\/\d{1,6})?|BB\/34\/\d{1,4}|MC\/ET\/[IVXLC]{1,10}\/\d{1,5}|MC\/RE\/[IVXLC]{1,10}\/\d{1,4}|H\s?\d{3,5}|GR\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{1,7}|GR\s?[A-Z]{2}\s?\d{1,7})\b/);
        if (cote && !out.cote) out.cote = cote[1];
        if (kind === 'naturalisation') { const n = raw.match(/\b(\d{1,6}\s?X\s?\d{2})\b/); if (n && !out.number) out.number = n[1].replace(/\s+/g, ' '); if (!out.date) { const d = raw.match(/d[ée]cret\s+du\s+([^\n,;.]{6,30})/i); if (d) out.date = firstDate(d[1]) || d[1].trim(); } }
        if (kind === 'minutier' && !out.act) out.act = /contrat de mariage/.test(all) ? 'contrat' : /inventaire apres deces|inventaire apres le deces/.test(all) ? 'inventaire' : /testament/.test(all) ? 'testament' : '';
        if (kind === 'deportation') { const c = raw.match(/convoi\s+(?:n[°o]\s*)?(\d{1,3})/i); if (c && !out.convoy) out.convoy = c[1];
            const dd = raw.match(/(?:d[ée]c[ée]d[ée]e?|mort|morte|assassin[ée]e?)\s+(?:le\s+)?((?:\d{1,2}(?:er)?\s+\S+\s+\d{4})|\d{1,2}\/\d{1,2}\/\d{4})/i); if (dd && !out.death_date && DATE_RE.test(dd[1])) out.death_date = dd[1];
            const dp = raw.match(/parti\s+(?:de\s+)?\S+\s+le\s+(\d{1,2}(?:er)?\s+\S+\s+\d{4})/i); if (dp && !out.date) out.date = dp[1]; ['Auschwitz', 'Sobibor', 'Majdanek', 'Kaunas', 'Buchenwald', 'Dachau', 'Mauthausen', 'Ravensbrück', 'Bergen-Belsen', 'Neuengamme', 'Sachsenhausen', 'Natzweiler', 'Flossenbürg', 'Dora'].some(c2 => { if (!out.camp && fold(raw).includes(fold(c2))) { out.camp = c2; return true; } return false; });
            ['Drancy', 'Compiègne', 'Pithiviers', 'Beaune-la-Rolande', 'Romainville'].some(f => { if (!out.from && fold(raw).includes(fold(f))) { out.from = f; return true; } return false; }); }
        if (kind === 'jo' && !out.act) out.act = /naturalis/.test(all) ? 'naturalisation' : /changement de nom|change de nom|autorise a (substituer|ajouter|changer)/.test(all) ? 'nom' : /legion d'honneur|medaille|decor/.test(all) ? 'decoration' : '';
        if (kind === 'patrimoine') { const r = raw.match(/\b((?:PA|IA|PM|IM|EA)\d{8}|(?:PA|IA|PM|IM)\d{2}[A-Z0-9]\d{5})\b/); if (r && !out.ref) out.ref = r[1]; if (!out.protection) { const pr = all.match(/\b(classe monument historique|inscrit monument historique|classe au titre objet|inscrit au titre objet|classe mh|inscrit mh)\b/); if (pr) out.protection = pr[1]; } }
        if (kind === 'annuaire' && !out.year) { const y = raw.match(/\b(1[6-9]\d\d)\b/); if (y) out.year = y[1]; }
        if (!out.date && map.date) { const d = firstDate(raw); if (d) out.date = d; }
        return out;
    }

    /** ce qu'un lien collé dit déjà */
    function parseLink(raw) {
        const u = cleanUrl(raw); const out = {url: u, site: '', notice: '', ref: ''};
        if (!u) return out;
        let host = ''; try { host = new URL(u).hostname.toLowerCase(); } catch (_) { return out; }
        if (/(^|\.)francearchives\.gouv\.fr$/.test(host)) { out.site = 'francearchives'; const m = u.match(/\/(facomponent|findingaid)\/([0-9a-f]{20,64})/i); if (m) out.notice = m[2]; }
        else if (/siv\.archives-nationales\.culture\.gouv\.fr$/.test(host)) out.site = 'siv';
        else if (/(^|\.)anom\.archivesnationales\.culture\.gouv\.fr$|recherche-anom\.culture\.gouv\.fr$/.test(host)) out.site = 'anom';
        else if (/servicehistorique\.sga\.defense\.gouv\.fr$/.test(host)) out.site = 'shd';
        else if (/memorialdelashoah\.org$/.test(host)) out.site = 'shoah';
        else if (/(^|\.)bddm\.org$/.test(host)) out.site = 'fmd';
        else if (/maitron\.fr$/.test(host)) out.site = 'maitron';
        else if (/(^|\.)gallica\.bnf\.fr$/.test(host)) { out.site = 'gallica'; const a = u.match(/ark:\/12148\/([a-z0-9]+)/i); if (a) out.notice = a[1]; }
        else if (/pop\.culture\.gouv\.fr$/.test(host)) { out.site = 'pop'; const m = u.match(/\/notice\/(merimee|palissy)\/([A-Z]{2}[0-9A-Z]{8})/i); if (m) { out.notice = m[2]; out.ref = m[2]; out.base = m[1].toLowerCase(); } }
        else if (/search\.arch\.be$/.test(host)) out.site = 'arch.be';
        else if (/statueofliberty\.org$/.test(host)) out.site = 'ellis';
        return out;
    }
    /** la sorte d'import devinée d'après le lien (quand la personne colle un lien sans avoir choisi) */
    const kindFromLink = (link, fallback = '') => ({pop: 'patrimoine', shoah: 'deportation', fmd: 'deportation', maitron: 'fusille', ellis: 'ellis', 'arch.be': 'etranger_acte', shd: 'shd_marin', anom: 'anom_ec', siv: 'minutier'})[parseLink(link).site] || fallback;

    /* ═════ Les ajouts proposés ═════
     * fiche : {gender, events: [{type_slug, gedcom_tag, label, date_text, year}], hasSpouse}
     * Une proposition : {id, what: 'event'|'probate'|'military'|'voyage'|'target', type (slug), tag, label, date, place, title, description, scope ('person'|'family'),
     *   checked, why, exists (texte de ce qui est déjà sur la fiche : rien n'est écrasé)} */
    const yearIn = s => { const m = String(s || '').match(/\b(1[0-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : 0; };
    function proposals(kind, f = {}, fiche = {}) {
        const out = []; const evs = Array.isArray(fiche.events) ? fiche.events : [];
        const has = (slug, tag) => evs.find(e => (slug && e.type_slug === slug) || (tag && e.gedcom_tag === tag));
        const sameYear = (e, date) => !!e && (!yearIn(date) || !e.year || Number(e.year) === yearIn(date));
        const ev = (id, type, tag, label, o = {}) => {
            const e = has(type, tag); const dup = e && sameYear(e, o.date);
            out.push({id, what: 'event', type, tag, label, date: clean(o.date || ''), place: clean(o.place || ''), title: clean(o.title || ''), description: String(o.description || '').slice(0, 2000), scope: o.scope || 'person',
                checked: o.checked !== false && !dup, exists: e ? `${e.label || label}${e.date_text ? ` · ${e.date_text}` : ''}` : '', why: o.why || ''});
        };
        const cote = f.cote ? `Cote ${clean(f.cote)}` : '';
        switch (kind) {
            case 'naturalisation':
                ev('natu', 'naturalisation', 'NATU', 'Naturalisation', {date: f.date, place: f.place, description: [f.number && `Dossier ${clean(f.number)}`, f.origin && i18n('Nationalité d’avant : {nm}', {nm: clean(f.origin)}), cote].filter(Boolean).join(' · '), why: 'Le décret dit la date de la naturalisation.'});
                out.push({id: 'voyage', what: 'voyage', label: 'Départs et émigration : date de la naturalisation', date: clean(f.date || ''), place: clean(f.place || ''), checked: !!fiche.hasVoyage, why: fiche.hasVoyage ? 'Remplie seulement si la case est vide.' : 'Sa fiche n’a pas encore de départ noté.'});
                break;
            case 'minutier': {
                const act = f.act || 'autre'; const desc = [f.notary && i18n('Notaire : {nm}', {nm: clean(f.notary)}), cote].filter(Boolean).join(' · ');
                if (act === 'contrat') ev('marc', 'contrat-de-mariage', 'MARC', 'Contrat de mariage', {date: f.date, place: f.place || 'Paris', description: desc, scope: 'family', checked: !!fiche.hasSpouse, why: fiche.hasSpouse ? 'Ajouté à son union.' : 'Sa fiche n’a pas d’union : relie d’abord le conjoint.'});
                else if (act === 'inventaire') out.push({id: 'probate', what: 'probate', label: 'Inventaire après décès', date: clean(f.date || ''), place: clean(f.place || 'Paris'), title: clean(f.notary || ''), description: clean(f.cote || ''), checked: true, why: 'Rangé avec les autres inventaires après décès.'});
                else if (act === 'testament') ev('will', 'testament', 'WILL', 'Testament', {date: f.date, place: f.place || 'Paris', description: desc});
                else ev('deed', 'acte', 'DEED', 'Acte', {date: f.date, place: f.place || 'Paris', title: 'Acte notarié', description: desc});
                break; }
            case 'anom_ec': case 'etranger_acte': {
                const act = f.act || 'naissance'; const place = [f.place, f.territory || f.country].filter(Boolean).map(clean).join(', ');
                if (act === 'naissance') ev('birt', 'naissance', 'BIRT', 'Naissance', {date: f.date, place, description: cote});
                else if (act === 'deces') ev('deat', 'deces', 'DEAT', 'Décès', {date: f.date, place, description: cote});
                else if (act === 'mariage') ev('marr', 'mariage', 'MARR', 'Mariage', {date: f.date, place, description: cote, scope: 'family', checked: !!fiche.hasSpouse, why: fiche.hasSpouse ? 'Ajouté à son union.' : 'Sa fiche n’a pas d’union : relie d’abord le conjoint.'});
                else ev('deed', 'acte', 'DEED', 'Acte', {date: f.date, place, description: cote});
                break; }
            case 'bagne':
                ev('cond', 'condamnation', '', 'Condamnation', {date: f.date, place: f.court, description: [f.sentence && i18n('Peine : {nm}', {nm: clean(f.sentence)}), f.number && `Matricule ${clean(f.number)}`, cote].filter(Boolean).join(' · ')});
                if (f.arrival || f.bagne) ev('bagne', 'bagne', '', 'Arrivée au bagne', {date: f.arrival, place: f.bagne, description: f.number ? `Matricule ${clean(f.number)}` : ''});
                if (f.end) ev('end', 'liberation-du-bagne', '', 'Libération ou décès au bagne', {date: f.end, place: f.bagne, checked: false, why: 'À cocher si tu sais ce que dit la date (libération ou décès).'});
                break;
            case 'shd_marin':
                out.push({id: 'military', what: 'military', label: 'Bloc militaire : inscrit maritime', description: ['Inscrit maritime', f.quarter && i18n('quartier de {nm}', {nm: clean(f.quarter)}), f.number && `folio ${clean(f.number)}`, f.date && i18n('inscrit le {nm}', {nm: clean(f.date)}), f.ships && clean(f.ships), cote].filter(Boolean).join(' · '), checked: true, why: 'Ajouté à la fin des notes du bloc militaire (rien n’est remplacé).'});
                ev('mise', 'service-militaire', 'MISE', 'Service militaire', {date: f.date, place: f.quarter, title: 'Inscrit maritime', description: cote, checked: !!f.date});
                break;
            case 'shd_officier':
                out.push({id: 'military', what: 'military', label: 'Bloc militaire : dossier d’officier', description: ['Dossier d’officier (SHD)', f.rank && clean(f.rank), f.arm && clean(f.arm), f.date && clean(f.date), cote, f.summary && String(f.summary).slice(0, 1500)].filter(Boolean).join(' · '), checked: true, why: 'Ajouté à la fin des notes du bloc militaire (rien n’est remplacé).'});
                if (f.date) ev('mise', 'service-militaire', 'MISE', 'Service militaire', {date: f.date, title: [f.rank, f.arm].filter(Boolean).map(clean).join(', ') || 'Officier', description: cote, checked: false});
                break;
            case 'deportation':
                ev('dep', 'deportation', '', 'Déportation', {date: f.date, place: f.from, description: [f.convoy && i18n('Convoi n° {nm}', {nm: clean(f.convoy)}), f.camp && `vers ${clean(f.camp)}`, f.fate && clean(f.fate)].filter(Boolean).join(' · '), why: 'Le départ du convoi.'});
                if (f.death_date || f.death_place || /dec|mort/.test(fold(f.fate))) ev('depdc', 'deces-en-deportation', '', 'Décès en déportation', {date: f.death_date, place: f.death_place || f.camp, why: 'Inscrit comme décès en déportation.'});
                if ((f.death_date || f.death_place) && !has('deces', 'DEAT')) ev('deat', 'deces', 'DEAT', 'Décès', {date: f.death_date, place: f.death_place || f.camp, checked: false, why: 'À cocher si la notice donne une date de décès officielle.'});
                break;
            case 'fusille':
                ev('fus', 'fusille', '', 'Fusillé', {date: f.date, place: f.place, description: String(f.summary || '').slice(0, 1500)});
                if (!has('deces', 'DEAT')) ev('deat', 'deces', 'DEAT', 'Décès', {date: f.date, place: f.place, why: 'Sa fiche n’a pas encore de décès.'});
                break;
            case 'jo': {
                const act = f.act || 'naturalisation'; const jo = ['Journal officiel', f.date && `du ${clean(f.date)}`, f.page && `page ${clean(f.page)}`].filter(Boolean).join(' ');
                if (act === 'naturalisation') ev('natu', 'naturalisation', 'NATU', 'Naturalisation', {date: f.date, description: jo, why: 'La date du Journal officiel suit de peu celle du décret.'});
                else if (act === 'decoration') ev('deco', 'decoration', '', 'Décoration', {date: f.date, title: clean(f.detail || ''), description: jo});
                else ev('nom', 'changement-de-nom', '', 'Changement de nom', {date: f.date, title: clean(f.detail || ''), description: jo, why: 'Le nom de la fiche ne change pas tout seul.'});
                break; }
            case 'annuaire': {
                const y = clean(f.year || ''); const place = clean(f.place || '');
                if (f.address || place) ev('resi', 'lieu-de-residence', 'RESI', 'Lieu de résidence', {date: y, place, description: clean(f.address || ''), why: 'L’adresse donnée par l’annuaire cette année-là.'});
                if (f.trade) ev('occu', 'profession', 'OCCU', 'Profession', {date: y, place, title: clean(f.trade), why: 'Le métier donné par l’annuaire.'});
                out.forEach(o => { if (o.exists && yearIn(o.date) && !String(o.exists).includes(String(yearIn(o.date)))) o.checked = true; });
                break; }
            case 'patrimoine':
                out.push({id: 'target', what: 'target', label: 'Ajouter la notice à la fiche choisie (texte et image)', title: clean(f.title || ''), description: [f.ref && `Notice ${clean(f.ref)}`, f.protection && clean(f.protection), f.summary && String(f.summary).slice(0, 4000)].filter(Boolean).join('\n'), checked: true, why: 'Le texte est ajouté à la suite de la description (rien n’est remplacé).'});
                break;
            case 'ellis':
                ev('immi', 'immigration', 'IMMI', 'Immigration', {date: f.date, place: 'New York (Ellis Island), États-Unis', description: [f.ship && i18n('Navire : {nm}', {nm: clean(f.ship)}), f.from && i18n('parti de {nm}', {nm: clean(f.from)}), f.age && i18n('âge déclaré : {nm}', {nm: clean(f.age)})].filter(Boolean).join(' · ')});
                out.push({id: 'voyage', what: 'voyage', label: 'Départs et émigration : nouveau départ', date: clean(f.date || ''), place: clean(f.from || ''), title: clean(f.ship || ''), description: clean(f.dest || ''), checked: true, why: 'Un départ ajouté au bloc (navire, port, arrivée à New York).'});
                break;
            default: break;
        }
        return out;
    }

    /** une phrase pour la source créée */
    function sourceTitle(kind, f = {}, person = '') {
        const k = KINDS[kind]; const bits = [k ? k.label : 'Archives en ligne', person && `— ${person}`, f.cote && `(${clean(f.cote)})`, f.ref && `(${clean(f.ref)})`].filter(Boolean);
        return bits.join(' ').slice(0, 300);
    }
    const MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';

    return {SITES, GROUPS, KINDS, CANTONS, RESPECT, FA_PUB, MENTION, site, url, fill, sitesFor, canton, parseFields, parseLink, kindFromLink, proposals, sourceTitle, isRespectKind, cleanUrl, fold};
});
