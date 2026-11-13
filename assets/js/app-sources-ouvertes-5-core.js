/* LCNDA — 🌍 Archives en ligne, cinquième lot : FamilySearch (actes et catalogue), WikiTree, Québec et Acadie (Fichier Origine,
 * Centre d'études acadiennes), émigration (Castle Garden), Médaillés de Sainte-Hélène, Archives nationales du monde du travail,
 * mémoriaux des cheminots, gendarmes et policiers morts en service, état civil consulaire (Archives diplomatiques de Nantes),
 * Geneawiki, Russie et URSS (Pamyat Naroda, Memorial), photographes anciens (base Daguerre, annuaires), Maitron, CCFr et Calames.
 * Calculs purs, SANS RÉSEAU (window.LCNDA_SOURCES_OUVERTES_5 ; aussi require() dans Node pour les tests).
 *
 * Même principe que les autres lots (app-sources-ouvertes-core.js, -2, -3) et SocFace : l'app N'INTERROGE JAMAIS ces sites.
 * Elle fabrique l'adresse d'une recherche, que le navigateur de la personne ouvre ; quand le site ne garde pas la recherche dans
 * son adresse, elle ouvre sa page de recherche et met le nom dans le presse-papiers. Ensuite elle lit ce que la personne a
 * copié ou téléchargé elle-même ; rien n'est écrit sans son clic, rien n'est écrasé, tout se défait (↶ Annuler).
 *
 *  - SITES, GROUPS           les sites et leurs rubriques (par pays, puis par thème)
 *  - url(key, p, custom)     l'adresse remplie (p : first, last, place, county, insee, y1, y2, birthYear, deathYear, employer, photographer, fsId, wikitreeId)
 *  - copyText(key, p)        ce qu'on colle dans la case d'un site sans recherche dans l'adresse
 *  - forPlace(where, ctx)    les sites à proposer à un endroit (fiche, emigration, militaire, recompense, employeur, lieu, departement, photo)
 *  - webSites()              les sites au format de « Chercher sur internet » ([clé, nom, rubrique, (p) => adresse, {icon, copy, note}])
 *  - fillCustom(modèle, p)   un site ajouté par la personne : {nom} {prenom} {nom_complet} {lieu} {annee} {annee_naissance} {annee_deces} {de} {a} {conjoint} {requete} {departement}
 *  - checkCustom(site)       ce qui ne va pas dans un site ajouté (adresse, champs inconnus) → [] si tout va bien
 *  - parseFields(t, kind)    le texte copié d'une fiche → champs reconnus ; detectKind(t) devine la sorte
 *  - parseLink(adresse)      ce qu'un lien collé dit déjà (site, identifiant FamilySearch, WikiTree, n° Fichier Origine…)
 *  - proposals(kind, f, ctx) ce qu'une fiche lue propose d'ajouter (événements, voyage, récompense, employeur, note) — jamais appliqué sans clic
 *  - photographerPeriod(t)   « actif de 1862 à 1895 » → {from, to} pour l'outil « 📷 Dater une vieille photo »
 *  - RESPECT                 les événements qui demandent du respect (répression en URSS) : une fiche qui en porte un n'entre dans aucun jeu
 *
 * Adresses : verified = 'oui' (déjà dans l'app et vérifiée le 08/10/2026), 'partiel' (forme connue par des liens publics,
 * paramètres pas tous confirmés) ou 'non' (construite d'après la forme connue du site ; le réseau n'était pas joignable le jour
 * où elle a été écrite). Toutes se changent dans « ⚙️ Adresses des sites » ou s'ajoutent comme « Mon site ».
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES_5 = api;
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
    const town = s => clean(s).split(',')[0].replace(/\s*\(.*\)\s*$/, '').trim();
    const nameOf = p => [firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
    const q = s => `"${clean(s).replace(/"/g, '')}"`;
    const google = (site, p, words = '') => `https://www.google.com/search?q=${encodeURIComponent([`site:${site}`, p.last ? q(p.last) : '', p.first ? q(firstOnly(p.first)) : '', words].filter(Boolean).join(' '))}`;
    const FS = 'https://www.familysearch.org';

    /* ═════ Rubriques : par pays, puis par thème (ordre du réglage des sites) ═════ */
    const GROUPS = [
        {id: 'monde', icon: '🌍', label: 'Monde — FamilySearch et WikiTree'},
        {id: 'quebec', icon: '🍁', label: 'Canada — Québec et Acadie'},
        {id: 'emigration', icon: '🚢', label: 'États-Unis — émigration'},
        {id: 'fr_service', icon: '🇫🇷', label: 'France — soldats, cheminots, gendarmes, policiers'},
        {id: 'fr_travail', icon: '🇫🇷', label: 'France — travail, biographies, état civil consulaire'},
        {id: 'fr_fonds', icon: '🇫🇷', label: 'France — manuscrits et archives privées'},
        {id: 'fr_lieux', icon: '🇫🇷', label: 'France — villages et départements'},
        {id: 'photo', icon: '📷', label: 'Photographes anciens'},
        {id: 'urss', icon: '🇷🇺', label: 'Russie et URSS'},
    ];

    /* ═════ Les sites ═════
     * build(p) : l'adresse remplie ; search : la page de recherche ; home : l'accueil ; copy : le nom va dans le presse-papiers ;
     * where : endroits de l'app où le proposer ; kind : la sorte d'import ; account : compte gratuit demandé ; sensitive : ton sobre,
     * jamais dans un jeu ; years : période couverte (écarte l'inutile) ; existing : la clé du même site déjà dans « Chercher sur internet ». */
    const SITES = [
        // 🌍 FamilySearch : un compte gratuit est demandé pour voir les résultats et les images
        {key: 'fs_records', group: 'monde', country: 'International', icon: '🌳', label: 'FamilySearch — actes indexés', existing: 'familysearch',
            home: `${FS}/fr/`, search: `${FS}/fr/search/`, verified: 'oui', account: true,
            note: 'Même adresse que le bouton « FamilySearch » de l’app (vérifiée le 08/10/2026). Un compte gratuit est demandé pour voir les résultats.',
            build: p => { const [a] = years(p); return `${FS}/fr/search/record/results?q.givenName=${enc(firstOnly(p.first))}&q.surname=${enc(p.last)}${p.place ? `&q.birthLikePlace=${enc(town(p.place))}` : ''}${p.birthYear || a ? `&q.birthLikeDate.from=${(Number(p.birthYear) || a) - 2}&q.birthLikeDate.to=${(Number(p.birthYear) || a) + 2}` : ''}`; },
            where: ['fiche'], kind: 'acte'},
        {key: 'fs_tree', group: 'monde', country: 'International', icon: '🌳', label: 'FamilySearch — sa fiche dans l’arbre (identifiant connu)',
            home: `${FS}/fr/tree/`, search: `${FS}/fr/tree/find/name`, verified: 'oui', account: true, needs: 'fsId',
            note: 'Adresse déjà utilisée par l’app (Mise en page). Seulement quand la fiche a un identifiant FamilySearch (ex. « LZ2K-8QF »).',
            build: p => p.fsId && /^[A-Z0-9]{4}-[A-Z0-9]{3,4}$/i.test(p.fsId) ? `${FS}/tree/person/details/${encodeURIComponent(p.fsId.toUpperCase())}` : '',
            where: ['fiche'], kind: 'acte'},
        {key: 'fs_catalog', group: 'monde', country: 'International', icon: '📚', label: 'FamilySearch — catalogue (registres filmés d’un lieu)',
            home: `${FS}/fr/search/catalog`, search: `${FS}/fr/search/catalog`, verified: 'non', account: true, byPlace: true,
            note: 'Le catalogue dit quels registres d’une commune ont été filmés. Paramètre « keywords » non confirmé.',
            build: p => `${FS}/search/catalog/results?count=20&keywords=${enc(town(p.place) || clean(p.last))}`, where: ['fiche', 'lieu'], kind: 'fonds'},
        {key: 'wikitree', group: 'monde', country: 'International', icon: '🌲', label: 'WikiTree — l’arbre mondial collaboratif', existing: 'wikitree',
            home: 'https://www.wikitree.com/', search: 'https://www.wikitree.com/index.php?title=Special:SearchPerson', verified: 'oui',
            note: 'Même adresse que le bouton « WikiTree » de l’app. Avec un identifiant WikiTree (« Durand-1234 »), la fiche s’ouvre directement.',
            build: p => p.wikitreeId && /^[\p{L}' -]{1,40}-\d{1,9}$/u.test(p.wikitreeId) ? `https://www.wikitree.com/wiki/${encodeURIComponent(p.wikitreeId.replace(/ /g, '_'))}`
                : `https://www.wikitree.com/index.php?title=Special:SearchPerson&wpFirst=${enc(firstOnly(p.first))}&wpLast=${enc(p.last)}`,
            where: ['fiche'], kind: 'wikitree'},
        // 🍁 Québec et Acadie
        {key: 'fichier_origine', group: 'quebec', country: 'Canada', icon: '🍁', label: 'Fichier Origine — Français partis au Québec (1600-1865)',
            home: 'https://www.fichierorigine.com/', search: 'https://www.fichierorigine.com/recherche', verified: 'non',
            note: 'Fiches des émigrants français et étrangers établis au Québec (acte de baptême, parents, mariage au Canada). Paramètres nom / prénom non confirmés.',
            build: p => `https://www.fichierorigine.com/recherche?nom=${enc(p.last)}&prenom=${enc(firstOnly(p.first))}`,
            where: ['fiche', 'emigration'], kind: 'origine', years: [1600, 1865]},
        {key: 'cea_acadie', group: 'quebec', country: 'Canada', icon: '⚓', label: 'Centre d’études acadiennes Anselme-Chiasson (Université de Moncton)',
            home: 'https://www.umoncton.ca/umcm-ceaac/', search: 'https://www.umoncton.ca/umcm-ceaac/', verified: 'non', copy: true,
            note: 'Généalogies et registres acadiens ; pas de recherche par nom dans l’adresse : recherche Google sur le site et le nom est copié.',
            build: p => google('umoncton.ca', p, 'acadien OR acadienne'), where: ['fiche', 'emigration'], kind: 'acte', years: [1604, 1900]},
        // 🚢 Émigration
        {key: 'castle_garden', group: 'emigration', country: 'États-Unis', icon: '🚢', label: 'Castle Garden — arrivées à New York (1820-1892)',
            home: 'https://www.castlegarden.org/', search: 'https://www.castlegarden.org/searcher.php', verified: 'non', copy: true,
            note: 'Le premier centre d’accueil des immigrants de New York, avant Ellis Island. La recherche garde parfois le nom dans l’adresse ; sinon il est copié.',
            build: p => `https://www.castlegarden.org/searcher.php?lastname=${enc(p.last)}&firstname=${enc(firstOnly(p.first))}`,
            where: ['fiche', 'emigration'], kind: 'passager', years: [1820, 1892]},
        // 🇫🇷 Service : soldats de l'Empire, cheminots, gendarmes, policiers
        {key: 'sainte_helene', group: 'fr_service', country: 'France', icon: '🎖', label: 'Médaillés de Sainte-Hélène (soldats de 1792-1815)',
            home: 'https://www.stehelene.org/', search: 'https://www.stehelene.org/', verified: 'non', copy: true,
            note: 'La médaille de 1857 pour les anciens soldats de la Révolution et de l’Empire encore vivants : environ 400 000 noms, avec la commune de 1857.',
            build: p => google('stehelene.org', p), where: ['fiche', 'militaire', 'recompense'], kind: 'medaille_sh', years: [1745, 1810], yearsOf: 'birth'},
        {key: 'memorial_cheminots', group: 'fr_service', country: 'France', icon: '🚂', label: 'Mémorial des cheminots morts en service',
            home: 'https://www.google.com/search?q=m%C3%A9morial+des+cheminots+morts+en+service', search: '', verified: 'non',
            note: 'Adresse du mémorial non vérifiée : recherche Google du nom avec « cheminot ». Écris l’adresse exacte dans « ⚙️ Adresses des sites » si tu la connais.',
            build: p => `https://www.google.com/search?q=${encodeURIComponent([q(nameOf(p)), 'cheminot', '"mort en service" OR "mort pour la France" OR mémorial'].join(' '))}`,
            where: ['fiche', 'employeur'], kind: 'mort_service', service: 'cheminot'},
        {key: 'memorial_gendarmes', group: 'fr_service', country: 'France', icon: '🛡', label: 'Mémorial des gendarmes morts en service',
            home: 'https://www.google.com/search?q=m%C3%A9morial+gendarmes+morts+en+service', search: '', verified: 'non',
            note: 'Adresse du mémorial non vérifiée : recherche Google du nom avec « gendarme ».',
            build: p => `https://www.google.com/search?q=${encodeURIComponent([q(nameOf(p)), 'gendarme', '"mort en service" OR mémorial'].join(' '))}`,
            where: ['fiche', 'militaire'], kind: 'mort_service', service: 'gendarme'},
        {key: 'memorial_policiers', group: 'fr_service', country: 'France', icon: '🚓', label: 'Mémorial des policiers morts en service',
            home: 'https://www.google.com/search?q=m%C3%A9morial+policiers+morts+en+service', search: '', verified: 'non',
            note: 'Adresse du mémorial non vérifiée : recherche Google du nom avec « policier ».',
            build: p => `https://www.google.com/search?q=${encodeURIComponent([q(nameOf(p)), 'policier OR "gardien de la paix" OR "agent de police"', '"mort en service" OR mémorial'].join(' '))}`,
            where: ['fiche'], kind: 'mort_service', service: 'policier'},
        // 🇫🇷 Travail, biographies, état civil consulaire
        {key: 'anmt', group: 'fr_travail', country: 'France', icon: '🏭', label: 'Archives nationales du monde du travail (Roubaix) — registres du personnel',
            home: 'https://archives-nationales-travail.culture.gouv.fr/', search: 'https://archives-nationales-travail.culture.gouv.fr/', verified: 'non',
            note: 'Archives d’entreprises, de syndicats et d’associations ; les registres du personnel se cherchent par le nom de l’entreprise. Recherche Google sur le site.',
            build: p => `https://www.google.com/search?q=${encodeURIComponent(['site:archives-nationales-travail.culture.gouv.fr', p.employer ? q(p.employer) : (p.last ? q(p.last) : ''), p.employer ? 'personnel' : ''].filter(Boolean).join(' '))}`,
            where: ['fiche', 'employeur'], kind: 'personnel', years: [1800, 2000]},
        {key: 'maitron', group: 'fr_travail', country: 'France', icon: '📕', label: 'Maitron — dictionnaire biographique du mouvement ouvrier et social',
            home: 'https://maitron.fr/', search: 'https://maitron.fr/spip.php?page=recherche', verified: 'partiel',
            note: 'Le dictionnaire entier (militants, syndicalistes, coopérateurs, élus, fusillés…), pas seulement les fusillés. Page de recherche du site (forme SPIP « page=recherche&recherche= » connue, non vérifiée ce jour).',
            build: p => `https://maitron.fr/spip.php?page=recherche&recherche=${enc([clean(p.last), firstOnly(p.first)].filter(Boolean).join(' '))}`,
            where: ['fiche', 'employeur'], kind: 'biographie', years: [1789, 2000]},
        {key: 'consulaire_nantes', group: 'fr_travail', country: 'France', icon: '🌐', label: 'Archives diplomatiques de Nantes — état civil consulaire (Français nés, mariés, morts à l’étranger)',
            home: 'https://www.diplomatie.gouv.fr/fr/archives-diplomatiques/', search: 'https://www.diplomatie.gouv.fr/fr/archives-diplomatiques/', verified: 'non', copy: true,
            note: 'Les registres des consulats et ambassades sont à Nantes ; pas de recherche par nom en ligne : la page des Archives diplomatiques s’ouvre et le nom est copié (pour une demande ou FranceArchives).',
            build: p => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent([clean(p.last), firstOnly(p.first), 'consulat état civil'].filter(Boolean).join(' '))}`,
            where: ['fiche', 'emigration'], kind: 'acte'},
        // 🇫🇷 Manuscrits et archives privées
        {key: 'ccfr', group: 'fr_fonds', country: 'France', icon: '📜', label: 'CCFr — Catalogue collectif de France (manuscrits, fonds des bibliothèques)',
            home: 'https://ccfr.bnf.fr/', search: 'https://ccfr.bnf.fr/portailccfr/', verified: 'non', copy: true,
            note: 'Manuscrits et fonds d’archives privées des bibliothèques (municipales, BnF…). Recherche par formulaire : le nom est copié ; la page du portail s’ouvre.',
            build: () => 'https://ccfr.bnf.fr/portailccfr/', where: ['fiche', 'lieu'], kind: 'fonds'},
        {key: 'calames', group: 'fr_fonds', country: 'France', icon: '📜', label: 'Calames — manuscrits et archives des universités et instituts',
            home: 'https://calames.abes.fr/pub/', search: 'https://calames.abes.fr/pub/', verified: 'non',
            note: 'Correspondances, papiers de savants, fonds privés des bibliothèques universitaires. Forme « #resultats?q= » non vérifiée.',
            build: p => `https://calames.abes.fr/pub/#resultats?q=${encodeURIComponent(nameOf(p) || town(p.place))}`, where: ['fiche', 'lieu'], kind: 'fonds'},
        // 🇫🇷 Villages et départements
        {key: 'geneawiki', group: 'fr_lieux', country: 'France', icon: '📖', label: 'Geneawiki — la page de la commune ou du département', byPlace: true,
            home: 'https://fr.geneawiki.com/', search: 'https://fr.geneawiki.com/index.php', verified: 'partiel',
            note: 'Pages « code INSEE - Commune » (ex. « 19272 - Tulle ») et pages des départements ; sans le code, la recherche du wiki ouvre la bonne page ou la liste.',
            build: p => { const t = town(p.place); if (p.insee && t) return `https://fr.geneawiki.com/index.php?search=${encodeURIComponent(`${p.insee} - ${t}`)}`;
                if (t) return `https://fr.geneawiki.com/index.php?search=${enc(t)}`; return p.county ? `https://fr.geneawiki.com/index.php?search=${enc(p.county)}` : 'https://fr.geneawiki.com/'; },
            where: ['lieu', 'departement'], kind: ''},
        // 📷 Photographes
        {key: 'daguerre', group: 'photo', country: 'France', icon: '📷', label: 'Base Daguerre — photographes français du XIXe siècle', byPhotographer: true,
            home: 'https://www.google.com/search?q=base+Daguerre+photographes', search: '', verified: 'non',
            note: 'Le nom et l’adresse du photographe, au dos d’une carte, donnent ses années d’activité. Adresse de la base non vérifiée : recherche Google.',
            build: p => `https://www.google.com/search?q=${encodeURIComponent([q(p.photographer || p.last), 'photographe', p.place ? town(p.place) : '', 'Daguerre OR annuaire'].filter(Boolean).join(' '))}`,
            where: ['photo'], kind: 'photographe'},
        {key: 'portraitsepia', group: 'photo', country: 'France', icon: '📷', label: 'Portrait Sépia — annuaire des photographes anciens', byPhotographer: true,
            home: 'https://www.portraitsepia.fr/', search: 'https://www.portraitsepia.fr/', verified: 'non',
            build: p => `https://www.google.com/search?q=${encodeURIComponent(['site:portraitsepia.fr', q(p.photographer || p.last), p.place ? town(p.place) : ''].filter(Boolean).join(' '))}`,
            where: ['photo'], kind: 'photographe'},
        {key: 'gallica_annuaires', group: 'photo', country: 'France', icon: '📒', label: 'Annuaires anciens (Gallica) — le photographe dans l’annuaire de sa ville', byPhotographer: true,
            home: 'https://gallica.bnf.fr/', search: 'https://gallica.bnf.fr/', verified: 'partiel',
            note: 'Recherche Gallica (forme déjà utilisée par l’app) avec « photographe » et la ville.',
            build: p => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`(gallica all "${clean(p.photographer || p.last).replace(/"/g, '')}") and (gallica all "photographe")${p.place ? ` and (gallica all "${town(p.place).replace(/"/g, '')}")` : ''}`)}`,
            where: ['photo'], kind: 'photographe'},
        // 🇷🇺 Russie et URSS
        {key: 'pamyat_naroda', group: 'urss', country: 'Russie', icon: '🎗', label: 'Pamyat Naroda — soldats soviétiques de 1941-1945',
            home: 'https://pamyat-naroda.ru/', search: 'https://pamyat-naroda.ru/heroes/', verified: 'partiel',
            note: 'Base du ministère russe de la Défense (en russe) : écris le nom en cyrillique pour de meilleurs résultats. Paramètres last_name / first_name vus dans des liens publics.',
            build: p => `https://pamyat-naroda.ru/heroes/?adv_search=y&last_name=${enc(p.last)}&first_name=${enc(firstOnly(p.first))}${p.birthYear ? `&date_birth=${Number(p.birthYear)}` : ''}`,
            where: ['fiche', 'militaire'], kind: 'pamyat', years: [1860, 1930], yearsOf: 'birth'},
        {key: 'memorial_urss', group: 'urss', country: 'Russie', icon: '🕯', label: 'Memorial — victimes de la répression politique en URSS', sensitive: true,
            home: 'https://base.memo.ru/', search: 'https://base.memo.ru/', verified: 'non',
            note: 'Base de l’association Memorial (plus de 3 millions de noms : arrêtés, fusillés, déportés). Forme de l’adresse non vérifiée.',
            build: p => `https://base.memo.ru/person/search?search%5Bsurname%5D=${enc(p.last)}&search%5Bname%5D=${enc(firstOnly(p.first))}`,
            where: ['fiche'], kind: 'repression', years: [1850, 1940], yearsOf: 'birth'},
    ];
    const site = key => SITES.find(s => s.key === key) || null;
    const groupOf = id => GROUPS.find(g => g.id === id) || null;

    /** un modèle d'adresse écrit par la personne (« ⚙️ Adresses des sites ») */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: town(p.place), commune: town(p.place), de: a || '', a: b || '',
            naissance: p.birthYear || '', deces: p.deathYear || '', annee_naissance: p.birthYear || '', annee_deces: p.deathYear || '', annee: p.birthYear || p.year || '',
            departement: p.county || '', employeur: p.employer || '', photographe: p.photographer || '', conjoint: p.spouseName || '', requete: p.q || ''};
        return String(template).replace(/\{([^{}]{1,24})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        let built = ''; try { built = s.build(p); } catch (_) { built = ''; }
        return cleanUrl(built) || cleanUrl(s.search) || cleanUrl(s.home);
    }
    /** « NOM Prénom » pour un site qui garde la recherche dans un formulaire */
    function copyText(key, p = {}) { const s = site(key); if (!s || !s.copy) return ''; return [clean(p.last).toUpperCase(), firstOnly(p.first)].filter(Boolean).join(' '); }

    /** les sites à proposer à un endroit ; ctx : {y1, y2, birthYear, country} — les années écartent l'inutile */
    function forPlace(where, ctx = {}) {
        const [a, b] = years(ctx); const by = Number(ctx.birthYear) || 0;
        return SITES.filter(s => (s.where || []).includes(where)).filter(s => {
            if (s.needs === 'fsId' && !ctx.fsId) return false;
            if (s.years) {
                if (s.yearsOf === 'birth') { if (by && (by < s.years[0] || by > s.years[1])) return false; }
                else if (a && b && (b < s.years[0] || a > s.years[1])) return false;
            }
            return true;
        });
    }

    /** au format de « Chercher sur internet » (app.js) : [clé, nom, rubrique, adresse(p), {icon, copy, note, verified, account}] ;
     *  les sites déjà présents dans l'app (FamilySearch, WikiTree) ne sont pas ajoutés une deuxième fois. */
    function webSites(custom = {}) {
        return SITES.filter(s => !s.existing && !s.byPhotographer).map(s => {
            const g = groupOf(s.group);
            return [`so5_${s.key}`, s.label, g ? `${g.icon} ${g.label}` : 'Archives et bases', p => {
                const pp = {...p, birthYear: p.birthYear || p.year || '', place: p.place || ''};
                return url(s.key, pp, custom);
            }, {icon: s.icon, copy: !!s.copy, note: s.note || '', verified: s.verified, account: !!s.account, sensitive: !!s.sensitive, so5: s.key}];
        });
    }
    /** les sites montrés d'office (les autres se cochent dans Réglages → Apparence → Chercher sur internet) */
    const DEFAULT_VISIBLE = ['so5_fichier_origine', 'so5_castle_garden', 'so5_sainte_helene', 'so5_maitron', 'so5_anmt'];

    /* ═════ « Mes sites » : un site ajouté par la personne ═════ */
    const CUSTOM_FIELDS = ['nom', 'prenom', 'prénom', 'nom_complet', 'lieu', 'commune', 'annee', 'année', 'annee_naissance', 'année_naissance', 'annee_deces', 'année_décès', 'annee_décès',
        'de', 'a', 'à', 'conjoint', 'requete', 'requête', 'departement', 'département', 'naissance', 'deces', 'décès'];
    /** les valeurs d'un modèle d'adresse d'après les paramètres de « Chercher sur internet » (app.js webSearchParams) */
    function customValues(p = {}) {
        return {prenom: p.first, nom: p.last, nom_complet: p.name || nameOf(p), lieu: p.place, commune: p.place, annee: p.year, de: p.y1, a: p.y2, conjoint: p.spouseName, requete: p.q,
            annee_naissance: p.birthYear || '', naissance: p.birthYear || '', annee_deces: p.deathYear || '', deces: p.deathYear || '', departement: p.county || ''};
    }
    function fillCustom(template, p = {}) {
        const vals = customValues(p);
        return String(template).replace(/\{([^{}]{1,24})\}/g, (m, k) => {
            const key = fold(k).replace(/[^a-z_]/g, '');
            return key in vals ? encodeURIComponent(String(vals[key] ?? '').trim()) : m;
        });
    }
    /** ce qui ne va pas dans un site ajouté → liste de phrases (vide si tout va bien) */
    function checkCustom(s = {}) {
        const out = []; const u = String(s.url || '').trim();
        if (!String(s.label || '').trim()) out.push('Donne un nom au site.');
        if (!u) out.push('Écris l’adresse de recherche du site.');
        else if (!/^https?:\/\//i.test(u)) out.push('L’adresse doit commencer par https:// (ou http://).');
        else if (/[\s<>"'`]/.test(u.replace(/\{[^{}]*\}/g, ''))) out.push('L’adresse contient une espace ou un signe interdit.');
        const unknown = [...u.matchAll(/\{([^{}]{1,40})\}/g)].map(m => m[1]).filter(k => !CUSTOM_FIELDS.includes(k.toLowerCase()) && !CUSTOM_FIELDS.includes(fold(k).replace(/[^a-z_]/g, '')));
        if (unknown.length) out.push(`Champ inconnu : ${unknown.map(k => `{${k}}`).join(', ')}. Champs possibles : {nom} {prenom} {nom_complet} {lieu} {annee_naissance} {annee_deces} {de} {a} {conjoint} {departement}.`);
        if (u && !/\{[^{}]+\}/.test(u)) out.push('L’adresse n’a aucun champ entre accolades : elle ouvrira toujours la même page.');
        if (String(s.icon || '').length > 8) out.push('L’icône : un seul symbole ou émoji.');
        return out;
    }
    /** un site ajouté, nettoyé (ce qu'on garde et ce qu'on partage) */
    function cleanCustom(s = {}, key = '') {
        const k = /^custom-[a-z0-9-]{1,40}$/.test(String(s.key || '')) ? s.key : (key || `custom-${Date.now().toString(36)}`);
        return {key: k, label: clean(s.label).slice(0, 80), url: String(s.url || '').trim().slice(0, 500), group: clean(s.group).slice(0, 60), icon: String(s.icon || '').trim().slice(0, 8)};
    }

    /* ═════ Texte copié d'une fiche ═════ */
    const LABELS = {
        acte: {type: ['type d\'acte', 'type', 'acte', 'event type', 'type d\'evenement', 'record type'], date: ['date', 'event date', 'date de l\'evenement', 'date de l\'acte'],
            place: ['lieu', 'event place', 'lieu de l\'evenement', 'paroisse', 'commune', 'consulat', 'poste consulaire'], last: ['nom', 'surname', 'last name'], first: ['prenom', 'prenoms', 'given name', 'given names', 'first name'],
            birth_date: ['date de naissance', 'birth date', 'naissance'], birth_place: ['lieu de naissance', 'birthplace', 'birth place'], father: ['pere', 'father', 'father\'s name', 'nom du pere'],
            mother: ['mere', 'mother', 'mother\'s name', 'nom de la mere'], spouse: ['conjoint', 'epoux', 'epouse', 'spouse', 'spouse\'s name'], cote: ['cote', 'reference', 'film number', 'numero de film', 'dgs', 'image number'], archive: ['archives', 'collection', 'source']},
        wikitree: {wikitree_id: ['wikitree id', 'identifiant wikitree', 'id wikitree'], last: ['last name at birth', 'nom de naissance', 'surname'], first: ['first name', 'prenom'], birth_date: ['born', 'ne le', 'naissance'],
            death_date: ['died', 'deces', 'mort le'], father: ['son of', 'daughter of', 'fils de', 'fille de'], spouse: ['husband of', 'wife of', 'epoux de', 'epouse de']},
        origine: {numero: ['numero', 'n°', 'numero de la fiche', 'fiche'], last: ['nom', 'nom de l\'emigrant'], first: ['prenom', 'prenoms'], birth_date: ['date de bapteme', 'bapteme', 'date de naissance', 'naissance'],
            birth_place: ['lieu d\'origine', 'paroisse', 'lieu de bapteme', 'origine', 'lieu de naissance'], father: ['pere', 'parents'], mother: ['mere'], job: ['profession', 'metier', 'occupation'],
            marriage_date: ['date de mariage', 'mariage', 'premier mariage', 'mariage au canada'], marriage_place: ['lieu de mariage', 'lieu du mariage'], spouse: ['conjoint', 'epouse', 'epoux'],
            arrival: ['arrivee', 'date d\'arrivee', 'premiere mention au canada', 'premiere mention', 'arrivee au canada'], death_date: ['deces', 'date de deces', 'inhumation'], death_place: ['lieu de deces', 'lieu d\'inhumation'], ref: ['reference', 'source', 'references']},
        passager: {last: ['last name', 'nom', 'surname', 'family name'], first: ['first name', 'prenom', 'given name'], age: ['age'], sex: ['sex', 'sexe'], job: ['occupation', 'profession', 'metier'],
            origin: ['country of origin', 'origin', 'pays d\'origine', 'place of origin', 'origine', 'last residence', 'nationality', 'nationalite'], ship: ['ship', 'ship name', 'navire', 'bateau', 'vessel'],
            departure_port: ['port of departure', 'from', 'port de depart', 'depart'], arrival_date: ['arrival date', 'date of arrival', 'date d\'arrivee', 'arrived', 'arrivee'], arrival_port: ['port of arrival', 'port d\'arrivee'], destination: ['destination', 'final destination', 'plans']},
        medaille_sh: {last: ['nom'], first: ['prenom', 'prenoms'], birth_date: ['date de naissance', 'ne le', 'naissance'], birth_place: ['lieu de naissance', 'ne a', 'commune de naissance'],
            residence: ['domicile', 'domicile en 1857', 'commune', 'residence', 'commune de residence'], unit: ['corps', 'unite', 'regiment', 'arme'], rank: ['grade'], service: ['services', 'campagnes', 'etats de service', 'annees de service'],
            cote: ['cote', 'reference', 'source'], dept: ['departement']},
        personnel: {last: ['nom'], first: ['prenom', 'prenoms'], employer: ['entreprise', 'employeur', 'societe', 'compagnie', 'fonds', 'producteur'], entry: ['entree', 'date d\'entree', 'embauche', 'date d\'embauche', 'entre le'],
            exit: ['sortie', 'date de sortie', 'depart', 'motif de sortie', 'sorti le'], job: ['emploi', 'profession', 'poste', 'metier', 'qualification', 'fonction'], birth_date: ['date de naissance', 'ne le', 'naissance'],
            birth_place: ['lieu de naissance', 'ne a'], matricule: ['matricule', 'n° matricule', 'numero'], cote: ['cote', 'reference'], address: ['adresse', 'domicile']},
        mort_service: {last: ['nom'], first: ['prenom', 'prenoms'], service: ['corps', 'service', 'arme', 'administration', 'compagnie', 'reseau'], rank: ['grade', 'fonction', 'emploi', 'qualite'],
            death_date: ['date du deces', 'date de deces', 'mort le', 'decede le', 'date'], death_place: ['lieu du deces', 'lieu de deces', 'lieu', 'commune'], circumstances: ['circonstances', 'circonstances du deces', 'cause', 'evenement'],
            unit: ['unite', 'brigade', 'commissariat', 'gare', 'depot', 'affectation'], birth_date: ['date de naissance', 'ne le'], birth_place: ['lieu de naissance', 'ne a']},
        biographie: {name: ['nom', 'titre', 'notice'], born: ['ne le', 'naissance'], died: ['mort le', 'deces'], author: ['auteur', 'par', 'auteur de la notice'], sources: ['sources']},
        fonds: {title: ['titre', 'intitule', 'titre du fonds'], cote: ['cote', 'cote du document', 'shelfmark'], repository: ['bibliotheque', 'etablissement', 'lieu de conservation', 'conservation', 'repository', 'depot'],
            dates: ['date', 'dates', 'dates extremes', 'periode'], description: ['description', 'presentation du contenu', 'contenu', 'resume', 'presentation'], producer: ['producteur', 'auteur', 'createur']},
        pamyat: {last: ['фамилия', 'nom', 'last name'], first: ['имя', 'prenom', 'first name'], patronymic: ['отчество', 'patronyme', 'patronymic'], birth_date: ['дата рождения', 'date de naissance', 'date of birth'],
            birth_place: ['место рождения', 'lieu de naissance', 'place of birth'], rank: ['воинское звание', 'звание', 'grade', 'rank'], unit: ['воинская часть', 'часть', 'unite', 'unit'],
            fate: ['судьба', 'причина выбытия', 'sort', 'fate'], death_date: ['дата выбытия', 'дата смерти', 'date de deces', 'date of death'], burial: ['первичное место захоронения', 'место захоронения', 'lieu d\'inhumation', 'burial place'], source: ['источник информации', 'source']},
        repression: {last: ['фамилия', 'nom'], first: ['имя', 'prenom'], patronymic: ['отчество', 'patronyme'], birth_date: ['дата рождения', 'год рождения', 'date de naissance', 'ne en'], birth_place: ['место рождения', 'lieu de naissance', 'ne a'],
            arrest_date: ['дата ареста', 'арестован', 'date d\'arrestation', 'arrete le'], sentence: ['приговор', 'condamnation', 'peine', 'осужден'], sentence_date: ['дата приговора', 'date de la condamnation', 'condamne le'],
            death_date: ['дата расстрела', 'расстрелян', 'date de l\'execution', 'fusille le', 'date de deces', 'mort le'], rehabilitation: ['реабилитирован', 'дата реабилитации', 'rehabilite', 'rehabilitation'], job: ['место работы', 'профессия', 'profession']},
        photographe: {name: ['nom', 'photographe', 'atelier'], address: ['adresse', 'adresses'], activity: ['activite', 'periode d\'activite', 'dates d\'activite', 'actif', 'en activite'], city: ['ville', 'commune']},
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
            if (k && v && !out[k]) out[k] = v.slice(0, kind === 'biographie' || kind === 'fonds' ? 4000 : 600);
        }
        if (out.last && out.last === out.last.toUpperCase() && out.last.length > 1 && /[A-ZÀ-Ý]/.test(out.last)) out.last = out.last.charAt(0) + out.last.slice(1).toLowerCase();
        const all = String(text ?? '');
        if (kind === 'wikitree' && !out.wikitree_id) { const m = all.match(/wikitree\.com\/wiki\/([\p{L}'_-]{1,40}-\d{1,9})/u) || all.match(/\b(?:WikiTree ID|ID WikiTree)\s*:?\s*([\p{L}'_-]{1,40}-\d{1,9})/iu); if (m) out.wikitree_id = m[1].replace(/_/g, ' '); }
        if (kind === 'origine' && !out.numero) { const m = all.match(/fichierorigine\.com\/recherche\?numero=(\d{1,7})/i) || all.match(/\bfiche\s*n[°o]?\s*(\d{1,7})\b/i); if (m) out.numero = m[1]; }
        if (kind === 'biographie') { // Maitron : « DUPONT Jean, Marie. Né le 3 mars 1880 à Lille (Nord), mort le … ; ouvrier… »
            const head = lines[0] || ''; const m = head.match(/^([A-ZÀ-ÝŒ' -]{2,40})\s+([^.,;]{1,60})/);
            if (m && !out.name) out.name = `${m[2].trim()} ${m[1].trim()}`;
            const b = all.match(/Né(?:e)? le ([^,;]{4,40}?) à ([^,;()]{2,60}(?:\([^)]{1,40}\))?)/); if (b) { out.birth_date ||= b[1].trim(); out.birth_place ||= b[2].trim(); }
            const d = all.match(/mort(?:e)? le ([^,;]{4,40}?) à ([^,;()]{2,60}(?:\([^)]{1,40}\))?)/i); if (d) { out.death_date ||= d[1].trim(); out.death_place ||= d[2].trim(); }
            if (!out.text) out.text = lines.join('\n').slice(0, 20000);
        }
        if (kind === 'photographe') { const p = photographerPeriod(all); if (p.from) { out.from = String(p.from); out.to = String(p.to || ''); } }
        return out;
    }
    /** devine la sorte d'un texte collé (sinon '') */
    function detectKind(text) {
        const raw = String(text ?? '').slice(0, 20000); const t = fold(raw);
        if (/фамилия|имя|отчество/i.test(raw)) return /расстрел|арест|реабилит|приговор/i.test(raw) ? 'repression' : 'pamyat';
        if (/wikitree/.test(t)) return 'wikitree';
        if (/fichier origine|fichierorigine|premiere mention au canada|lieu d'origine/.test(t)) return 'origine';
        if (/castle garden|port of departure|ship name|country of origin/.test(t)) return 'passager';
        if (/sainte-helene|ste-helene|stehelene|medaille de sainte/.test(t)) return 'medaille_sh';
        if (/registre du personnel|date d'entree|date d'embauche|matricule.*entree/.test(t)) return 'personnel';
        if (/mort en service|morts en service|tue en service/.test(t)) return 'mort_service';
        if (/maitron|dictionnaire biographique/.test(t) || (/^[A-ZÀ-ÝŒ' -]{3,40}\s+[A-ZÀ-Ý][a-zà-ÿ]/.test(raw.trim()) && /\bnée? le\b/i.test(raw.slice(0, 400)))) return 'biographie';
        if (/cote du document|dates extremes|lieu de conservation|calames|ccfr|presentation du contenu/.test(t)) return 'fonds';
        if (/photographe|atelier photographique/.test(t)) return 'photographe';
        if (/familysearch|event type|film number|given name/.test(t)) return 'acte';
        return '';
    }

    /** ce qu'un lien collé dit déjà */
    function parseLink(raw) {
        const u = cleanUrl(raw); const out = {url: u, site: '', fsId: '', fsArk: '', wikitreeId: '', numero: ''};
        if (!u) return out;
        let host = ''; try { host = new URL(u).hostname.toLowerCase(); } catch (_) { return out; }
        if (/(^|\.)familysearch\.org$/.test(host)) {
            out.site = 'fs_records';
            const t = u.match(/\/tree\/person\/(?:details\/|about\/)?([A-Z0-9]{4}-[A-Z0-9]{3,4})\b/i); if (t) { out.fsId = t[1].toUpperCase(); out.site = 'fs_tree'; }
            const a = u.match(/\/ark:\/61903\/([0-9]:[0-9]:[A-Z0-9-]+)/i); if (a) out.fsArk = a[1];
        } else if (/(^|\.)wikitree\.com$/.test(host)) {
            out.site = 'wikitree'; const m = u.match(/\/wiki\/([^/?#]+-\d{1,9})/); if (m) out.wikitreeId = decodeURIComponent(m[1]).replace(/_/g, ' ');
        } else if (/(^|\.)fichierorigine\.com$/.test(host)) {
            out.site = 'fichier_origine'; const m = u.match(/[?&]numero=(\d{1,7})/); if (m) out.numero = m[1];
        } else if (/(^|\.)castlegarden\.org$/.test(host)) out.site = 'castle_garden';
        else if (/(^|\.)stehelene\.org$/.test(host)) out.site = 'sainte_helene';
        else if (/archives-nationales-travail\.culture\.gouv\.fr$/.test(host)) out.site = 'anmt';
        else if (/(^|\.)maitron\.fr$/.test(host)) { out.site = 'maitron'; const m = u.match(/article(\d{1,9})/); if (m) out.numero = m[1]; }
        else if (/(^|\.)umoncton\.ca$/.test(host)) out.site = 'cea_acadie';
        else if (/(^|\.)diplomatie\.gouv\.fr$/.test(host)) out.site = 'consulaire_nantes';
        else if (/(^|\.)ccfr\.bnf\.fr$/.test(host)) out.site = 'ccfr';
        else if (/(^|\.)calames\.abes\.fr$/.test(host)) out.site = 'calames';
        else if (/(^|\.)geneawiki\.com$/.test(host)) out.site = 'geneawiki';
        else if (/(^|\.)pamyat-naroda\.ru$/.test(host)) out.site = 'pamyat_naroda';
        else if (/(^|\.)memo\.ru$/.test(host)) out.site = 'memorial_urss';
        return out;
    }

    /** la sorte d'import d'un site */
    const KIND_LABEL = {acte: 'Acte (archives en ligne)', wikitree: 'Fiche WikiTree', origine: 'Fiche du Fichier Origine', passager: 'Liste de passagers (Castle Garden)', medaille_sh: 'Médaillé de Sainte-Hélène',
        personnel: 'Registre du personnel (ANMT)', mort_service: 'Mort en service (mémorial)', biographie: 'Notice biographique (Maitron)', fonds: 'Fonds d’archives ou manuscrit (CCFr, Calames)',
        pamyat: 'Fiche Pamyat Naroda', repression: 'Victime de la répression politique (Memorial)', photographe: 'Photographe ancien'};
    const KINDS = Object.keys(KIND_LABEL).filter(k => k !== 'photographe');
    const ACT_TAGS = [[/naiss|birth|christening|nasc/, 'BIRT'], [/bapt|chr/, 'CHR'], [/mari|marriage/, 'MARR'], [/dec|death|mort|burial|inhum|sepult/, 'DEAT']];
    const SERVICE = {cheminot: 'cheminot', gendarme: 'gendarme', policier: 'policier'};
    /** les événements qui demandent du respect : une fiche qui en porte un n'entre dans aucun jeu (même règle que les déportés) */
    const RESPECT = {slugs: ['repression-politique-urss'], labels: ['Répression politique (URSS)']};

    /** ce qu'une fiche lue propose d'ajouter ; ctx : {has: {BIRT:true…}, gender} — seulement ce qui manque, chaque ajout avec sa raison */
    function proposals(kind, f = {}, ctx = {}) {
        const has = ctx.has || {}; const out = {events: [], voyage: null, award: null, employer: null, note: null, fsId: '', label: KIND_LABEL[kind] || 'Fiche'};
        const add = (tag, date, place, description, extra = {}) => {
            if (!date && !place && !description) return;
            const already = ['BIRT', 'CHR', 'DEAT', 'BURI'].includes(tag) && (has[tag] || (tag === 'BIRT' && has.CHR) || (tag === 'CHR' && has.BIRT));
            out.events.push({tag, date: clean(date), place: clean(place), description: clean(description).slice(0, 500), checked: !already, already: !!already, ...extra});
        };
        const who = [clean(f.first), clean(f.last)].filter(Boolean).join(' ');
        switch (kind) {
            case 'acte': {
                const t = fold(f.type || ''); const tag = (ACT_TAGS.find(([re]) => re.test(t)) || [null, ''])[1];
                if (tag === 'MARR') { out.note = {title: `Mariage${f.date ? ' — ' + clean(f.date) : ''}`, text: [`Mariage${f.date ? ' le ' + clean(f.date) : ''}${f.place ? ' à ' + clean(f.place) : ''}`, f.spouse && i18n('Conjoint : {nm}', {nm: clean(f.spouse)}), f.father && i18n('Père : {nm}', {nm: clean(f.father)}), f.mother && i18n('Mère : {nm}', {nm: clean(f.mother)}), f.cote && i18n('Cote : {nm}', {nm: clean(f.cote)})].filter(Boolean).join('\n')}; break; }
                if (tag) add(tag, f.date, f.place, [f.father && i18n('Père : {nm}', {nm: clean(f.father)}), f.mother && i18n('Mère : {nm}', {nm: clean(f.mother)})].filter(Boolean).join(' · '));
                else if (f.birth_date || f.birth_place) add('BIRT', f.birth_date, f.birth_place, '');
                else if (f.date || f.place) add('EVEN', f.date, f.place, clean(f.type) || 'Acte', {label: clean(f.type) || 'Acte'});
                break;
            }
            case 'wikitree':
                add('BIRT', f.birth_date, f.birth_place, '');
                add('DEAT', f.death_date, f.death_place, '');
                break;
            case 'origine':
                add('CHR', f.birth_date, f.birth_place, [f.father && `Parents : ${clean(f.father)}${f.mother ? ' et ' + clean(f.mother) : ''}`].filter(Boolean).join(''));
                if (f.job) add('OCCU', '', '', clean(f.job));
                out.voyage = {departure_port: '', destination: clean(f.marriage_place) || 'Québec (Nouvelle-France)', arrival_date: clean(f.arrival), departure_date: '',
                    reason: 'Établissement en Nouvelle-France', passenger_list_ref: f.numero ? i18n('Fichier Origine, fiche n° {nm}', {nm: clean(f.numero)}) : 'Fichier Origine',
                    notes: [f.marriage_date && `Mariage au Canada : ${clean(f.marriage_date)}${f.marriage_place ? ' à ' + clean(f.marriage_place) : ''}${f.spouse ? ' avec ' + clean(f.spouse) : ''}`, f.ref && i18n('Références : {nm}', {nm: clean(f.ref)})].filter(Boolean).join('\n'), checked: true};
                if (f.death_date || f.death_place) add('DEAT', f.death_date, f.death_place, '');
                break;
            case 'passager': {
                const by = (Number(f.age) && yearOf(f.arrival_date)) ? yearOf(f.arrival_date) - Number(f.age) : 0;
                out.voyage = {departure_port: clean(f.departure_port), ship_name: clean(f.ship), arrival_date: clean(f.arrival_date), arrival_port: clean(f.arrival_port) || 'New York (Castle Garden)',
                    destination: clean(f.destination) || clean(f.arrival_port) || 'New York', departure_date: '', reason: 'Émigration vers les États-Unis', passenger_list_ref: 'Castle Garden',
                    notes: [f.age && `Âge à l’arrivée : ${clean(f.age)}${by ? ` (né vers ${by})` : ''}`, f.job && i18n('Profession : {nm}', {nm: clean(f.job)}), f.origin && i18n('Origine déclarée : {nm}', {nm: clean(f.origin)})].filter(Boolean).join('\n'), checked: true};
                if (by && !has.BIRT && !has.CHR) add('BIRT', `vers ${by}`, '', 'D’après l’âge déclaré à l’arrivée à New York');
                if (f.job) add('OCCU', clean(f.arrival_date), '', clean(f.job));
                break;
            }
            case 'medaille_sh':
                out.award = {category: 'decoration', level: 'national', title: 'Médaille de Sainte-Hélène', date: '1857', org: 'Grande chancellerie de la Légion d’honneur',
                    grade: clean(f.rank), source: 'Médaillés de Sainte-Hélène' + (f.cote ? `, ${clean(f.cote)}` : ''),
                    notes: [f.unit && i18n('Corps : {nm}', {nm: clean(f.unit)}), f.service && i18n('Services : {nm}', {nm: clean(f.service)}), f.residence && i18n('Domicile vers 1857 : {nm}', {nm: clean(f.residence)})].filter(Boolean).join('\n'), checked: true};
                add('BIRT', f.birth_date, f.birth_place, '');
                if (f.residence) add('RESI', 'vers 1857', f.residence, 'Domicile lors de la remise de la médaille de Sainte-Hélène');
                break;
            case 'personnel': {
                const span = [clean(f.entry), clean(f.exit)].filter(Boolean); const date = span.length === 2 ? i18n('entre {nm} et {x2}', {nm: String(yearOf(span[0]) || span[0]), x2: String(yearOf(span[1]) || span[1])}) : (span[0] || '');
                if (f.employer || f.job) add('OCCU', date, f.address || '', [clean(f.job), f.employer && i18n('Employeur : {nm}', {nm: clean(f.employer)})].filter(Boolean).join(' — '));
                if (f.employer) out.employer = {name: clean(f.employer), line: `${who || 'Personne'} : ${[f.job && clean(f.job), f.entry && `entré(e) ${clean(f.entry)}`, f.exit && `sorti(e) ${clean(f.exit)}`, f.matricule && `matricule ${clean(f.matricule)}`].filter(Boolean).join(', ')} (registre du personnel${f.cote ? ', ' + clean(f.cote) : ''})`, date: clean(f.entry), checked: true};
                add('BIRT', f.birth_date, f.birth_place, '');
                break;
            }
            case 'mort_service': {
                const svc = SERVICE[fold(ctx.service || '')] || (/(chemin|sncf|gare|depot|reseau)/.test(fold(f.service)) ? 'cheminot' : /gendarm/.test(fold(f.service)) ? 'gendarme' : /(police|gardien de la paix|commissa)/.test(fold(f.service)) ? 'policier' : '');
                add('DEAT', f.death_date, f.death_place, [`Mort en service${svc ? ` (${svc})` : ''}`, clean(f.circumstances), clean(f.unit)].filter(Boolean).join(' — '));
                if (f.rank || svc) add('OCCU', '', '', [clean(f.rank) || svc, clean(f.unit)].filter(Boolean).join(' — '));
                add('BIRT', f.birth_date, f.birth_place, '');
                break;
            }
            case 'biographie':
                add('BIRT', f.birth_date, f.birth_place, ''); add('DEAT', f.death_date, f.death_place, '');
                if (f.text) out.note = {title: `Notice du Maitron${f.name ? ' — ' + clean(f.name) : ''}`, text: String(f.text).slice(0, 20000) + (f.author ? `\n\nNotice de ${clean(f.author)}.` : ''), checked: true};
                break;
            case 'fonds':
                if (f.description || f.title) out.note = {title: `Fonds d’archives : ${clean(f.title) || 'sans titre'}`, text: [f.title && i18n('Titre : {nm}', {nm: clean(f.title)}), f.repository && i18n('Conservé à : {nm}', {nm: clean(f.repository)}), f.cote && i18n('Cote : {nm}', {nm: clean(f.cote)}), f.dates && i18n('Dates : {nm}', {nm: clean(f.dates)}), f.description && String(f.description).slice(0, 4000)].filter(Boolean).join('\n'), checked: false};
                break;
            case 'pamyat':
                add('BIRT', f.birth_date, f.birth_place, '');
                if (f.unit || f.rank) add('MISE', '', '', [clean(f.rank), clean(f.unit)].filter(Boolean).join(' — '), {label: 'Service militaire'});
                if (f.death_date || /убит|умер|погиб|tue|mort|killed/.test(fold(f.fate))) add('DEAT', f.death_date, f.burial || '', [clean(f.fate), f.unit && `(${clean(f.unit)})`].filter(Boolean).join(' '));
                break;
            case 'repression':
                add('BIRT', f.birth_date, f.birth_place, '');
                add('EVEN', f.arrest_date, '', [f.arrest_date && i18n('Arrêté(e) le {nm}', {nm: clean(f.arrest_date)}), f.sentence && `Condamnation : ${clean(f.sentence)}${f.sentence_date ? ' (' + clean(f.sentence_date) + ')' : ''}`, f.rehabilitation && i18n('Réhabilité(e) : {nm}', {nm: clean(f.rehabilitation)})].filter(Boolean).join(' · '),
                    {label: RESPECT.labels[0], slug: RESPECT.slugs[0]});
                if (f.death_date) add('DEAT', f.death_date, '', 'Victime de la répression politique');
                break;
            default: break;
        }
        return out;
    }
    /** le titre de la source créée à l'import */
    function sourceTitle(kind, f = {}, siteKey = '') {
        const s = site(siteKey); const who = clean([f.first, f.last].filter(Boolean).join(' ') || f.name || f.title || '');
        const base = KIND_LABEL[kind] || (s ? s.label : 'Archives en ligne');
        return `${s && kind === 'mort_service' ? s.label : base}${who ? ` — ${who}` : ''}${f.numero ? ` (fiche n° ${clean(f.numero)})` : ''}${f.cote && kind !== 'acte' ? ` (${clean(f.cote)})` : ''}`.slice(0, 240);
    }

    /* ═════ 📷 Photographes : « actif de 1862 à 1895 », « 1870-1885 », « vers 1880 » → une période ═════ */
    function photographerPeriod(text) {
        const t = fold(text);
        let m = t.match(/(?:actif|active|activite|en activite|exerce|installe)?[^0-9]{0,30}(?:de|du|entre)\s+(?:\d{1,2}\s+\w+\s+)?(1[89]\d\d)\s+(?:a|au|et|jusqu'en|-)\s+(?:\d{1,2}\s+\w+\s+)?(1[89]\d\d|19\d\d)/);
        if (m) { const a = Number(m[1]), b = Number(m[2]); return a <= b ? {from: a, to: b} : {from: b, to: a}; }
        m = t.match(/\b(18[3-9]\d|19\d\d)\s*[-–]\s*(18[3-9]\d|19\d\d)\b/); if (m) { const a = Number(m[1]), b = Number(m[2]); return a <= b ? {from: a, to: b} : {from: b, to: a}; }
        m = t.match(/(?:depuis|a partir de|des)\s+(18[3-9]\d|19\d\d)/); if (m) return {from: Number(m[1]), to: 0};
        m = t.match(/(?:vers|circa|c\.)\s*(18[3-9]\d|19\d\d)/); if (m) return {from: Number(m[1]) - 5, to: Number(m[1]) + 5};
        return {from: 0, to: 0};
    }

    return {CHECKED, MENTION, SITES, GROUPS, KINDS, KIND_LABEL, RESPECT, DEFAULT_VISIBLE, CUSTOM_FIELDS, site, groupOf, url, fill, copyText, forPlace, webSites,
        customValues, fillCustom, checkCustom, cleanCustom, parseFields, detectKind, parseLink, proposals, sourceTitle, photographerPeriod, cleanUrl, fold, yearOf};
});
