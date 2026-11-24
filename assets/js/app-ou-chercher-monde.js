/* LCNDA — 🌍 « Où chercher ? » : le MONDE et le PLAN DE RECHERCHE. Calculs purs, SANS RÉSEAU (window.LCNDA_OUC_MONDE ; aussi
 * require() dans Node pour les tests).
 *
 *  - SITES        des sites en plus (lus par heritage-ou-chercher.js comme ceux de « Chercher sur internet ») : FamilySearch filtré
 *                 sur le pays de sa vie (Belgique, Suisse, Italie, Espagne, Portugal, Allemagne, Pays-Bas, Luxembourg, Royaume-Uni,
 *                 Irlande, États-Unis, Canada…), le PRDH (Québec 1621-1849), la bibliothèque protestante (SHPF), la noblesse dans
 *                 Gallica. Chaque site porte sa règle (`rel` : pays, années, profils), sa sorte (`cats`), sa période et s'il est
 *                 en ligne ou sur place (`period`, `access`).
 *  - GUIDES       pour chaque pays : les registres qui existent, leur période, en ligne ou sur place, et où ; ceux qui croisent
 *                 la vie de la personne passent devant (guide(ctx)).
 *  - tips(ctx)    le PLAN : ce qui manque sur la fiche → le registre qui a le plus de chances de le dire, pourquoi, sa période,
 *                 en ligne ou sur place ; rangé du plus probable au moins probable (décès inconnu → fichier INSEE ; homme né
 *                 1847-1901 → registre matricule ; protestant → registres pastoraux ; émigré aux États-Unis → passagers,
 *                 recensements…).
 * Les dates des registres sont les dates générales (elles varient selon les régions) : chaque guide a un lien vers le mode
 * d'emploi détaillé du pays (FamilySearch Wiki) pour vérifier.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_OUC_MONDE = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const NOW = new Date().getFullYear();
    const I18 = () => (typeof window !== 'undefined' && window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr' ? window.LCNDA_I18N : null);
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); const I = I18(); return I ? I.t(s, v) : String(s).replace(/\{([a-z_]+)\}/gi, (m, k) => (v && k in v ? String(v[k]) : m)); };
    const enc = s => encodeURIComponent(String(s ?? '').trim());

    /* ═════ les pays : le nom anglais que FamilySearch attend (f.recordCountry) et la page de son mode d'emploi ═════ */
    const FS_COUNTRY = {be: 'Belgium', ch: 'Switzerland', it: 'Italy', es: 'Spain', pt: 'Portugal', de: 'Germany', nl: 'Netherlands', lu: 'Luxembourg', gb: 'England', ie: 'Ireland',
        us: 'United States', ca: 'Canada', pl: 'Poland', at: 'Austria', hu: 'Hungary', dk: 'Denmark', se: 'Sweden', no: 'Norway', ar: 'Argentina', br: 'Brazil', dz: 'Algeria'};
    const WIKI = {fr: 'France', be: 'Belgium', nl: 'Netherlands', lu: 'Luxembourg', ch: 'Switzerland', it: 'Italy', es: 'Spain', pt: 'Portugal', de: 'Germany', gb: 'England', ie: 'Ireland',
        us: 'United_States', ca: 'Quebec', dz: 'Algeria', pl: 'Poland', at: 'Austria'};
    const wikiUrl = c => (WIKI[c] ? `https://www.familysearch.org/en/wiki/${WIKI[c]}_Genealogy` : 'https://www.familysearch.org/en/wiki/');
    const FLAG = {be: '🇧🇪', ch: '🇨🇭', it: '🇮🇹', es: '🇪🇸', pt: '🇵🇹', de: '🇩🇪', nl: '🇳🇱', lu: '🇱🇺', gb: '🇬🇧', ie: '🇮🇪', us: '🇺🇸', ca: '🇨🇦', pl: '🇵🇱', at: '🇦🇹', hu: '🇭🇺', dk: '🇩🇰', se: '🇸🇪', no: '🇳🇴', ar: '🇦🇷', br: '🇧🇷', dz: '🇩🇿', fr: '🇫🇷'};
    const NAME = {fr: 'France', be: 'Belgique', ch: 'Suisse', it: 'Italie', es: 'Espagne', pt: 'Portugal', de: 'Allemagne', nl: 'Pays-Bas', lu: 'Luxembourg', gb: 'Royaume-Uni', ie: 'Irlande',
        us: 'États-Unis', ca: 'Canada', pl: 'Pologne', at: 'Autriche', hu: 'Hongrie', dk: 'Danemark', se: 'Suède', no: 'Norvège', ar: 'Argentine', br: 'Brésil', dz: 'Algérie'};
    const IN = {fr: 'en France', be: 'en Belgique', ch: 'en Suisse', it: 'en Italie', es: 'en Espagne', pt: 'au Portugal', de: 'en Allemagne', nl: 'aux Pays-Bas', lu: 'au Luxembourg', gb: 'au Royaume-Uni', ie: 'en Irlande',
        us: 'aux États-Unis', ca: 'au Canada', pl: 'en Pologne', at: 'en Autriche', hu: 'en Hongrie', dk: 'au Danemark', se: 'en Suède', no: 'en Norvège', ar: 'en Argentine', br: 'au Brésil', dz: 'en Algérie'};
    const inC = c => (I18() ? T('en {country}', {country: T(NAME[c] || c)}) : IN[c] || `en ${NAME[c] || c}`);
    const lived = ctx => (ctx.female ? 'Elle a vécu' : 'Il a vécu');

    /* ═════ les sites en plus ═════
     * {key, label, icon, group, url(p), cats, period: [de, à] | null, access: 'online' | 'onsite' | 'both', paid?, rel: règle du moteur} */
    const fsYears = p => { const a = Number(p.birthFrom) || (Number(p.birthYear) ? Number(p.birthYear) - 5 : 0), b = Number(p.birthTo) || (Number(p.birthYear) ? Number(p.birthYear) + 5 : 0); return a && b ? `&q.birthLikeDate.from=${a}&q.birthLikeDate.to=${b}` : ''; };
    const SITES = Object.entries(FS_COUNTRY).map(([c, en]) => ({
        key: `ocm_fs_${c}`, icon: FLAG[c] || '🌐', group: 'Monde', label: T('FamilySearch — actes et recensements : {country}', {country: T(NAME[c])}), cats: ['actes', 'recensements'], period: null, access: 'online',
        url: p => `https://www.familysearch.org/search/record/results?q.givenName=${enc(p.first)}&q.surname=${enc(p.last)}${fsYears(p)}&f.recordCountry=${enc(en)}`,
        rel: {countries: [c], base: 1.4, missing: ['birth', 'parents', 'father', 'mother', 'marriage', 'death'],
            why: ctx => T(ctx.female ? 'Elle a vécu {where} : les actes et recensements de ce pays déjà indexés par FamilySearch (gratuit, compte demandé)' : 'Il a vécu {where} : les actes et recensements de ce pays déjà indexés par FamilySearch (gratuit, compte demandé)', {where: inC(c)})},
    })).concat([
        {key: 'ocm_prdh', icon: '⚜️', group: 'Monde', label: 'PRDH — tous les actes catholiques du Québec (1621-1849)', cats: ['actes'], period: [1621, 1849], access: 'online', paid: 'partiel',
            url: () => 'https://www.prdh-igd.com/',
            rel: {countries: ['ca'], from: 1621, to: 1860, base: 1.8, missing: ['birth', 'parents', 'father', 'mother', 'marriage', 'death'],
                why: ctx => T(ctx.female ? 'Elle a vécu au Québec avant 1850 : le PRDH (Université de Montréal) a relevé tous les baptêmes, mariages et sépultures catholiques' : 'Il a vécu au Québec avant 1850 : le PRDH (Université de Montréal) a relevé tous les baptêmes, mariages et sépultures catholiques')}},
        {key: 'ocm_shpf', icon: '✝', group: 'Monde', label: 'Bibliothèque du protestantisme français (SHPF) — registres et généalogies protestantes', cats: ['actes', 'bibliotheques'], period: [1559, 1905], access: 'both',
            url: () => 'https://www.shpf.fr/',
            rel: {countries: ['fr'], profiles: ['protestant'], require: ['profile'], base: 1.2, why: () => T('Une famille protestante : registres pastoraux, registres du « Désert » et généalogies réunis par la bibliothèque protestante de Paris')}},
        {key: 'ocm_gallica_noblesse', icon: '🛡', group: 'Monde', label: 'Gallica — son nom dans les nobiliaires et armoriaux', cats: ['bibliotheques'], period: null, access: 'online',
            url: p => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${enc(`(gallica all "${p.last}") and (gallica all "noblesse")`)}`,
            rel: {countries: ['fr'], profiles: ['noble'], require: ['profile'], base: 1.4, why: ctx => T('Une famille noble : les nobiliaires, armoriaux et preuves de noblesse numérisés citent souvent les {name} sur plusieurs générations', {name: ctx.last || '…'})}},
    ]);
    const SITE = Object.fromEntries(SITES.map(s => [s.key, s]));

    /* ═════ les guides par pays : les registres, leur période, en ligne ou sur place ═════
     * {name, from, to (0 = aujourd'hui), access: 'online' | 'onsite' | 'both', where, who?: 'male' | profil, note} */
    const G = (name, from, to, access, where, extra = {}) => ({name, from, to, access, where, ...extra});
    const GUIDES = {
        fr: {url: 'https://francearchives.gouv.fr/fr/', items: [
            G('Registres paroissiaux (baptêmes, mariages, sépultures)', 1539, 1792, 'online', 'Archives du département (en ligne presque partout)'),
            G('État civil (naissances, mariages, décès)', 1792, 0, 'both', 'Archives du département en ligne pour les actes anciens ; les naissances et mariages de moins de 75 ans : à la mairie'),
            G('Tables décennales (index des actes par commune, tous les 10 ans)', 1793, 0, 'online', 'Archives du département : pour trouver une date sans lire tout un registre'),
            G('Recensements nominatifs (tous les 5 ans)', 1836, 1936, 'online', 'Archives du département (souvent en ligne)'),
            G('Registres matricules militaires (classes 1867 à 1921)', 1867, 1940, 'online', 'Archives du département où il vivait à 20 ans', {who: 'male', born: [1847, 1921]}),
            G('Contrôle des actes (index des actes notariés)', 1693, 1790, 'both', 'Archives du département (série C) : pour trouver chez quel notaire chercher'),
            G('Minutes des notaires (contrats de mariage, inventaires, testaments)', 1500, 0, 'onsite', 'Archives du département (sous-série 3 E), surtout sur place'),
            G('Tables des successions et absences (Enregistrement)', 1791, 1960, 'both', 'Archives du département (série Q) : la date et le lieu d’un décès, les héritiers'),
            G('Fichier des décès de l’INSEE', 1970, 0, 'online', 'En ligne (matchID)'),
        ]},
        be: {url: 'https://search.arch.be/', items: [
            G('Registres paroissiaux', 1550, 1796, 'online', 'Archives de l’État (search.arch.be)'),
            G('État civil (depuis le régime français)', 1796, 0, 'online', 'Archives de l’État : naissances de plus de 100 ans, mariages de plus de 75 ans, décès de plus de 50 ans'),
            G('Registres de population', 1846, 0, 'both', 'Commune ou Archives de l’État'),
        ]},
        nl: {url: 'https://www.openarchieven.nl/', items: [
            G('Registres paroissiaux (DTB : doop, trouw, begraven)', 1550, 1811, 'online', 'Archives régionales, index sur Open Archives et WieWasWie'),
            G('État civil (Burgerlijke Stand ; Limbourg et Zélande dès 1796)', 1811, 0, 'online', 'Naissances de plus de 100 ans, mariages de plus de 75 ans, décès de plus de 50 ans : index sur Open Archives'),
            G('Registres de population (Bevolkingsregister)', 1850, 1920, 'both', 'Archives de la commune, en partie sur Open Archives'),
        ]},
        lu: {url: wikiUrl('lu'), items: [
            G('Registres paroissiaux', 1600, 1796, 'online', 'Images sur FamilySearch ; originaux aux Archives nationales de Luxembourg'),
            G('État civil', 1796, 0, 'both', 'Images sur FamilySearch pour les actes anciens ; les récents à la commune'),
        ]},
        ch: {url: wikiUrl('ch'), items: [
            G('Registres paroissiaux (gardés par les cantons)', 1550, 1875, 'both', 'Archives cantonales, en partie en ligne'),
            G('État civil fédéral', 1876, 0, 'onsite', 'Office de l’état civil'),
            G('Registre des familles de la commune d’origine (« lieu d’origine »)', 1876, 0, 'onsite', 'Office de l’état civil du lieu d’origine (pas le lieu de naissance)'),
        ]},
        it: {url: 'https://antenati.cultura.gov.it/', items: [
            G('État civil napoléonien', 1806, 1815, 'online', 'Antenati (images IIIF des Archivi di Stato)'),
            G('État civil de la Restauration', 1816, 1865, 'online', 'Antenati (selon les régions)'),
            G('État civil italien', 1866, 0, 'both', 'Antenati pour les actes anciens ; la commune (Comune) pour les récents'),
            G('Registres paroissiaux', 1563, 0, 'onsite', 'Archives du diocèse ou de la paroisse (une partie sur FamilySearch)'),
        ]},
        es: {url: 'https://pares.cultura.gob.es/', items: [
            G('Registres paroissiaux', 1563, 0, 'both', 'Archives du diocèse (beaucoup sur FamilySearch)'),
            G('Registro Civil', 1871, 0, 'onsite', 'Registro Civil de la commune, sur demande'),
            G('PARES : émigration, militaires, cadastre de l’Ensenada (1749-1756)', 1500, 0, 'online', 'PARES (archives d’État espagnoles)'),
        ]},
        pt: {url: 'https://digitarq.arquivos.pt/', items: [
            G('Registres paroissiaux', 1563, 1911, 'online', 'Archives de district (digitarq)'),
            G('État civil (registo civil)', 1911, 0, 'both', 'Archives de district pour les actes anciens ; Conservatória pour les récents'),
        ]},
        de: {url: 'https://data.matricula-online.eu/', items: [
            G('Registres paroissiaux catholiques (Kirchenbücher)', 1563, 0, 'online', 'Matricula (gratuit), ou l’archive du diocèse'),
            G('Registres paroissiaux protestants', 1540, 0, 'online', 'Archion (payant), ou l’archive de l’Église régionale'),
            G('État civil (Standesamt : Prusse 1874, tout l’Empire 1876 ; Rhénanie dès 1798)', 1874, 0, 'both', 'Archives de la ville (Stadtarchiv) ; en partie en ligne'),
            G('Livres de familles d’un village (Ortsfamilienbücher)', 1600, 1900, 'online', 'CompGen et sociétés locales'),
        ]},
        gb: {url: 'https://www.freebmd.org.uk/', items: [
            G('Registres paroissiaux (parish registers)', 1538, 0, 'both', 'Archives du comté (County Record Office) ; relevés sur FreeREG'),
            G('État civil Angleterre et pays de Galles (index GRO)', 1837, 0, 'online', 'Index gratuit sur FreeBMD ; copie de l’acte payante (GRO)'),
            G('État civil Écosse', 1855, 0, 'online', 'ScotlandsPeople (payant)'),
            G('Recensements (tous les 10 ans ; 1931 détruit)', 1841, 1921, 'online', 'FreeCEN (en partie), sites payants'),
        ]},
        ie: {url: 'https://www.irishgenealogy.ie/', items: [
            G('Registres paroissiaux catholiques (surtout avant 1880)', 1740, 1880, 'online', 'Bibliothèque nationale d’Irlande (images gratuites)'),
            G('État civil (mariages non catholiques dès 1845, tout dès 1864)', 1845, 0, 'online', 'irishgenealogy.ie (gratuit)'),
            G('Recensements de 1901 et 1911', 1901, 1911, 'online', 'Archives nationales d’Irlande (gratuit)'),
            G('Griffith’s Valuation (qui occupait quelle terre)', 1847, 1864, 'online', 'askaboutireland.ie'),
        ]},
        us: {url: 'https://www.archives.gov/research/genealogy', items: [
            G('Recensements fédéraux (tous les 10 ans ; tout le foyer nommé dès 1850 ; 1890 presque tout brûlé)', 1790, 1950, 'online', 'FamilySearch (gratuit), Archives nationales (NARA)'),
            G('Listes de passagers (arrivées)', 1820, 1957, 'online', 'Ellis Island, Castle Garden, FamilySearch'),
            G('Naturalisations', 1790, 0, 'both', 'Tribunaux, NARA, FamilySearch'),
            G('État civil (selon l’État, souvent au XXᵉ siècle)', 1850, 0, 'both', 'Service de l’État (Vital Records)'),
            G('Cartes d’enregistrement militaire de 1917-1918', 1917, 1918, 'online', 'FamilySearch', {who: 'male', born: [1872, 1900]}),
        ]},
        ca: {url: 'https://www.banq.qc.ca/', items: [
            G('Registres paroissiaux du Québec (copie remise à l’État)', 1621, 0, 'online', 'BAnQ (gratuit) ; index du PRDH jusqu’en 1849'),
            G('Recensements canadiens', 1851, 1931, 'online', 'Bibliothèque et Archives Canada (gratuit)'),
        ]},
        dz: {url: 'http://anom.archivesnationales.culture.gouv.fr/caomec2/', items: [
            G('État civil des Européens d’Algérie et des colonies', 1830, 1962, 'both', 'ANOM (en ligne pour les actes anciens) ; les plus récents : Service central d’état civil (Nantes), sur demande'),
            G('Registres matricules d’Algérie', 1867, 1940, 'both', 'ANOM', {who: 'male', born: [1847, 1921]}),
        ]},
    };
    ['ma', 'tn', 'sn', 'vn', 'nc', 'gf', 're', 'gp', 'mq', 'mg'].forEach(c => { GUIDES[c] = {url: GUIDES.dz.url, items: [GUIDES.dz.items[0]]}; });
    const ACCESS = {online: ['🌐', 'En ligne'], onsite: ['🏛', 'Sur place'], both: ['🌐🏛', 'En ligne et sur place']};
    const periodText = (a, b) => (a ? `${a}–${b || T('aujourd’hui')}` : '');

    /** les guides des pays de sa vie : les registres qui croisent sa vie d'abord (et pour qui ils comptent) */
    function guide(ctx) {
        const by = ctx.by || 0, dy = ctx.deathKnown ? ctx.dy : (ctx.by ? Math.min(NOW, ctx.by + 100) : 0);
        const codes = [...(ctx.countries?.keys?.() || [])].filter(c => GUIDES[c]);
        return codes.map(c => {
            const g = GUIDES[c];
            const items = g.items.map(it => {
                if (it.who === 'male' && ctx.female) return null;
                const inLife = by ? (it.from <= dy && (it.to || NOW) >= by) : null;
                const forHim = it.born ? (by ? by >= it.born[0] && by <= it.born[1] : null) : true;
                if (it.born && forHim === false) return null;
                return {...it, period: periodText(it.from, it.to), inLife, access: it.access, accessText: ACCESS[it.access]};
            }).filter(Boolean);
            items.sort((a, b) => (b.inLife === true) - (a.inLife === true));
            return {code: c, flag: FLAG[c] || '🌐', name: NAME[c] || c, url: g.url, wiki: wikiUrl(c), items};
        });
    }

    /* ═════ le plan de recherche : ce qui manque → où le trouver ═════ */
    const has = (ctx, k) => ctx.profiles?.has?.(k);
    const miss = (ctx, k) => ctx.missing?.has?.(k);
    const inCountry = (ctx, c) => ctx.countries?.has?.(c);
    /** [{id, icon, title, why, period, access, score, site?: clé d'un site à ouvrir, oa?: true}] du plus probable au moins probable */
    function tips(ctx) {
        const out = [];
        const add = (score, id, icon, title, why, from, to, access, extra = {}) => out.push({id, icon, title: T(title, extra.tv), why, period: periodText(from, to), access, accessText: ACCESS[access], score, ...extra});
        const fr = inCountry(ctx, 'fr') || (!ctx.countries?.size && !!ctx.birthDept);
        const by = ctx.by || 0, est = ctx.estimated && !ctx.birthKnown;
        const il = ctx.female ? 'elle' : 'il';
        const born = by ? T(est ? (ctx.female ? 'Née vers {y}' : 'Né vers {y}') : (ctx.female ? 'Née en {y}' : 'Né en {y}'), {y: by}) : '';
        const lastPlace = ctx.places?.[ctx.places.length - 1] || '';
        const living = ctx.living === 'living';
        // 1. décès inconnu
        if (miss(ctx, 'death') && !living) {
            if (fr && by && by + 100 >= 1970 && by <= NOW - 18) add(9, 'insee', '⚰️', 'Le fichier des décès de l’INSEE', T(ctx.female ? '{born} et décès inconnu : si elle est morte après 1970, elle y est, avec sa date et son lieu' : '{born} et décès inconnu : s’il est mort après 1970, il y est, avec sa date et son lieu', {born}), 1970, 0, 'online', {site: 'matchid'});
            if (fr) add(7, 'tables_deces', '📇', 'Les tables décennales du dernier lieu connu', lastPlace ? T('Décès inconnu : les tables de {place} (une ligne par décès, par période de 10 ans) avant de lire les registres', {place: lastPlace}) : T('Décès inconnu : les tables de sa dernière commune, par période de 10 ans'), 1793, 0, 'online');
            if (fr && by && by < 1930) add(5, 'successions', '⚖️', 'Les tables des successions et absences', T('Décès inconnu : l’Enregistrement notait chaque décès (date, lieu, héritiers), même sans fortune'), 1791, 1960, 'both');
            if (inCountry(ctx, 'us')) add(6, 'us_death', '⚰️', 'Tombes et décès aux États-Unis', T('Décès inconnu {where} : les tombes photographiées (Find a Grave) et les index de décès des États', {where: inC('us')}), 1850, 0, 'online', {site: 'findagrave'});
        }
        // 2. parents ou naissance inconnus
        const parentsMissing = miss(ctx, 'parents') || miss(ctx, 'father') || miss(ctx, 'mother');
        if (parentsMissing && ctx.tags?.has?.('MARR')) add(8.5, 'mariage_parents', '💍', 'Son acte de mariage', T('Parents inconnus mais mariage connu : l’acte de mariage donne le nom de ses parents (et s’ils vivent encore)'), 1792, 0, 'online');
        else if (parentsMissing && fr) add(6.5, 'mariage_chercher', '💍', 'Trouver son mariage dans les tables décennales', T('Parents inconnus : son acte de mariage les nomme ; cherche-le dans les tables de la commune de la mariée'), 1793, 0, 'online');
        if (miss(ctx, 'birth') && ctx.tags?.has?.('MARR')) add(8, 'mariage_naissance', '💍', 'Son acte de mariage, pour sa naissance', T('Naissance inconnue : depuis 1792, l’acte de mariage dit son âge et où {il} est {ne_e}', {il, ne_e: ctx.female ? 'née' : 'né'}), 1792, 0, 'online');
        if (miss(ctx, 'birth') && ctx.tags?.has?.('DEAT')) add(6, 'deces_naissance', '⚰️', 'Son acte de décès, pour sa naissance', T('Naissance inconnue : l’acte de décès dit souvent son âge, son lieu de naissance et le nom de ses parents'), 1792, 0, 'online');
        // 3. militaire (hommes)
        if (!ctx.female && fr && by >= 1847 && by <= 1921) add(has(ctx, 'soldier') ? 8.8 : 7.5, 'matricule', '🎖', 'Son registre matricule (classe {y})',
            T('{born} : tous les hommes avaient une fiche matricule à 20 ans (taille, métier, adresses, parents, campagnes) aux Archives du département où {il} vivait', {born, il}), by + 20, by + 20, 'online', {site: 'so_matricules_ad', tv: {y: by + 20}});
        if (!ctx.female && fr && by >= 1865 && by <= 1901) add(has(ctx, 'mpf') ? 9 : 6, 'mdh', '🎖', 'Mémoire des hommes (guerre de 1914-1918)', T('{born} : {il} avait l’âge de faire la guerre de 14 ; les morts pour la France y sont tous', {born, il}), 1914, 1918, 'online', {site: 'memoiredeshommes'});
        // 4. religion, noblesse
        if (has(ctx, 'protestant') && fr) add(8, 'protestant', '✝', 'Les registres pastoraux et du « Désert »', T('Une famille protestante : avant 1787 ses actes sont dans les registres des pasteurs (souvent clandestins), pas dans ceux du curé ; de 1787 à 1792, dans l’« état civil des non-catholiques »'), 1559, 1792, 'both', {site: 'ocm_shpf'});
        if (has(ctx, 'jewish') && fr) add(6, 'juif_1808', '✡', 'Les déclarations de noms de 1808', T('Une famille juive : en 1808, chacun a déclaré un nom de famille fixe à la mairie ; ces registres relient l’ancien et le nouveau nom'), 1808, 1809, 'both');
        if (has(ctx, 'noble')) add(7, 'noblesse', '🛡', 'Les preuves de noblesse et nobiliaires', T('Une famille noble : les nobiliaires imprimés et les preuves de noblesse (Cabinet des titres de la BnF) remontent souvent plusieurs générations'), 1600, 1789, 'both', {site: 'ocm_gallica_noblesse'});
        // 5. émigration
        if (has(ctx, 'emigrant') || ctx.tags?.has?.('EMIG') || ctx.tags?.has?.('IMMI')) {
            if (inCountry(ctx, 'us')) {
                add(8, 'us_passagers', '🚢', 'Les listes de passagers', T('Parti aux États-Unis : chaque arrivée est notée (nom, âge, village d’origine à partir de 1907 environ)'), 1820, 1957, 'online', {site: 'so2_ellis'});
                add(7.5, 'us_census', '👥', 'Les recensements américains', T('{lived} aux États-Unis : tous les 10 ans, chaque foyer y est nommé (année d’arrivée, naturalisation, pays de naissance)', {lived: lived(ctx)}), 1850, 1950, 'online', {site: 'ocm_fs_us'});
            }
            if (inCountry(ctx, 'ca')) add(7.5, 'quebec', '⚜️', 'Les registres du Québec', T('{lived} au Canada : registres paroissiaux du Québec (BAnQ) et, avant 1850, le PRDH', {lived: lived(ctx)}), 1621, 0, 'online', {site: by && by < 1850 ? 'ocm_prdh' : 'so3_banq'});
            if (inCountry(ctx, 'ar')) add(6.5, 'argentine', '🚢', 'Les arrivées en Argentine (CEMLA)', T('{lived} en Argentine : les arrivées au port de Buenos Aires', {lived: lived(ctx)}), 1882, 1960, 'online', {site: 'so8_cemla'});
            if (fr && !inCountry(ctx, 'us') && !inCountry(ctx, 'ca')) add(4, 'passeports', '🛂', 'Passeports et registres de départ', T('Une émigration : les registres de passeports de la préfecture ou de la mairie (XIXᵉ siècle) disent où {il} allait', {il}), 1800, 1900, 'onsite');
        }
        // 6. colonies, Algérie
        if (['dz', 'ma', 'tn', 'sn', 'vn', 'nc', 'gf', 're', 'gp', 'mq', 'mg'].some(c => inCountry(ctx, c))) add(8.5, 'anom', '🌍', 'L’état civil des colonies (ANOM)', T('{lived} dans une ancienne colonie ou en Algérie : les registres sont aux Archives nationales d’outre-mer', {lived: lived(ctx)}), 1830, 1962, 'both', {site: 'so2_anom_ec'});
        // 7. notaires, héritage
        if (has(ctx, 'inheritance') || has(ctx, 'notary') || (miss(ctx, 'marriage') && fr && by && by < 1900)) add(has(ctx, 'inheritance') ? 7 : 4.5, 'notaires', '✒', 'Les actes de notaire', T('{what} : le contrôle des actes (1693-1790) dit chez quel notaire ; contrats de mariage, inventaires et testaments sont dans ses minutes', {what: has(ctx, 'inheritance') ? T('Un héritage, un testament') : T('Mariage inconnu')}), 1693, 0, 'both');
        // 8. marins
        if (has(ctx, 'sailor') && fr) add(8, 'inscription_maritime', '⚓', 'L’inscription maritime', T('Un marin : chaque embarquement est noté au quartier maritime de son port (Service historique de la Défense)'), 1670, 1965, 'both', {site: 'so2_shd_marins'});
        // 9. recensements, vie dans le temps
        if (fr && by && by <= 1936 && (by + 90) >= 1836) add(5, 'recensements', '👥', 'Les recensements', T('{lived} en France entre 1836 et 1936 : tous les 5 ans, son foyer (âges, métiers, voisins) ; utile pour trouver un lieu ou des frères et sœurs', {lived: lived(ctx)}), 1836, 1936, 'online', {site: 'socface'});
        // 10. Pays-Bas, Belgique : Open Archives en direct
        if (['nl', 'be'].some(c => inCountry(ctx, c))) add(8.7, 'openarch', '🇳🇱', 'Open Archives (Pays-Bas, Belgique)', T('{lived} {where} : des millions d’actes indexés ; cherche ici même, dans « Open Archives » plus bas', {lived: lived(ctx), where: inC(['nl', 'be'].find(c => inCountry(ctx, c)))}), 1550, 0, 'online', {oa: true});
        if (inCountry(ctx, 'it')) add(8, 'antenati', '🇮🇹', 'Antenati : l’état civil italien', T('{lived} en Italie : les registres d’état civil (1806 →) des Archivi di Stato sont en images sur Antenati', {lived: lived(ctx)}), 1806, 0, 'online', {site: 'so3_antenati_nom'});
        // l'ordre : le plus probable d'abord ; un seul conseil par sujet
        const seen = new Set();
        return out.sort((a, b) => b.score - a.score).filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    }

    return {SITES, SITE, GUIDES, FS_COUNTRY, ACCESS, guide, tips, periodText, wikiUrl};
});
