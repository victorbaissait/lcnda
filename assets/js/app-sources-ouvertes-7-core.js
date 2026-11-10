/* LCNDA — 🌍 Archives en ligne, septième lot : Archives Portal Europe (archives de 30 pays), Justes parmi les nations (Comité
 * français pour Yad Vashem), enfants trouvés et Assistance publique (Archives de Paris, archives des départements), monuments
 * aux morts (MonumentsMorts, université de Lille), relevés gratuits des cercles généalogiques (un lien par département, à
 * changer), aide par lieu (FamilySearch Wiki, GenWiki, GOV), Allemagne (CompGen, Archion — PAYANT), cadastres anciens tchèques
 * et autrichiens (Archivní mapy, Mapire), Hongrie (Arcanum ADT — en partie PAYANT) et Ancestry Library Edition (gratuit
 * seulement en bibliothèque). Calculs purs, SANS RÉSEAU (window.LCNDA_SOURCES_OUVERTES_7 ; aussi require() dans Node).
 *
 * Même modèle que les autres lots (app-sources-ouvertes-core.js … -5-core.js) et SocFace : l'app N'INTERROGE JAMAIS ces sites.
 * Elle fabrique l'adresse d'une recherche, que le navigateur de la personne ouvre ; quand le site ne garde pas la recherche dans
 * son adresse, elle ouvre sa page (ou une recherche Google limitée au site) et met le nom ou le lieu dans le presse-papiers.
 * Ensuite elle lit ce que la personne a téléchargé ou copié elle-même ; rien n'est écrit sans son clic, rien n'est écrasé, tout
 * se défait (↶ Annuler).
 *
 *  - SITES, GROUPS             les sites et leurs rubriques (par pays, puis par thème) ; paid : false · 'oui' · 'partiel' · 'bibliotheque'
 *  - url(key, p, custom)       l'adresse remplie (p : first, last, place, county, deptCode, country, y1, y2, birthYear, deathYear)
 *  - copyText(key, p)          ce qu'on colle dans la case d'un site sans recherche dans l'adresse
 *  - forPlace(where, ctx)      les sites à proposer à un endroit (fiche, lieu, placement, militaire, carte)
 *  - visible(réglages, ctx)    les sites montrés selon le réglage (cachés, « Gratuites seulement », pays)
 *  - paidBadge(site)           la pastille à montrer ('PAYANT', 'EN PARTIE PAYANT', 'GRATUIT EN BIBLIOTHÈQUE') ou null
 *  - fillCustom / checkCustom  un site ajouté par la personne (« Mes sites ») : {nom} {prenom} {lieu} {departement} …
 *  - cercleUrl(dept, mine)     le lien vers le cercle généalogique d'un département (le sien d'abord, sinon une recherche)
 *  - KINDS, parseFields(t, k)  les sortes d'import et le texte copié d'une fiche → champs ; detectKind(t) devine la sorte
 *  - parseLink(adresse)        ce qu'un lien collé dit déjà (site, n° de notice)
 *  - proposals(kind, f, ctx)   ce qu'un document propose d'ajouter (événement, récompense, placement) — jamais sans clic
 *  - RESPECT                   Justes parmi les nations : ton sobre, une fiche qui porte cette distinction n'entre dans aucun jeu
 *
 * Adresses : AUCUNE n'a pu être ouverte le jour où elles ont été écrites (le réseau n'était pas joignable) : verified 'non'
 * partout ; elles suivent la forme connue des sites (moteur MediaWiki pour les wikis, recherche Google limitée au site sinon)
 * et se changent dans « ⚙️ Adresses des sites » (docs/UI.md, « 🌍 Archives en ligne, 7e lot »).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES_7 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
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
    const gq = parts => `https://www.google.com/search?q=${encodeURIComponent(parts.filter(Boolean).join(' '))}`;
    const google = (site, p, words = '') => gq([`site:${site}`, p.last ? q(p.last) : '', p.first ? q(firstOnly(p.first)) : '', words]);
    const isFrance = p => !clean(p.country) || /^(france|fr)$/i.test(fold(p.country));

    /* ═════ Rubriques : par pays, puis par thème (ordre du réglage des sites) ═════ */
    const GROUPS = [
        {id: 'europe', icon: '🇪🇺', label: 'Europe — archives de 30 pays', country: 'Europe'},
        {id: 'fr_memoire', icon: '🇫🇷', label: 'France — Justes et monuments aux morts', country: 'France'},
        {id: 'fr_enfants', icon: '🇫🇷', label: 'France — enfants trouvés, Assistance publique', country: 'France'},
        {id: 'fr_cercles', icon: '🇫🇷', label: 'France — relevés des cercles généalogiques', country: 'France'},
        {id: 'aide', icon: '🧭', label: 'Aide pour chercher dans un lieu', country: 'Monde'},
        {id: 'allemagne', icon: '🇩🇪', label: 'Allemagne — CompGen, Archion', country: 'Allemagne'},
        {id: 'centre', icon: '🗺', label: 'Europe centrale — cadastres anciens, Hongrie', country: 'Europe centrale'},
        {id: 'bibliotheque', icon: '🏛', label: 'En bibliothèque', country: 'Monde'},
    ];
    const THEMES = {acte: 'Actes et registres', juste: 'Mémoire', monument: 'Mémoire', enfant: 'Enfants placés', carte: 'Cartes et cadastres', presse: 'Presse', aide: 'Aide'};

    /* ═════ Les sites ═════
     * build(p) : l'adresse remplie ; search : la page de recherche ; home : l'accueil ; copy : 'name' ou 'place' va dans le
     * presse-papiers ; where : endroits de l'app ; kind : la sorte d'import ('aide' : rien à importer) ; paid : false, 'oui',
     * 'partiel', 'bibliotheque' ; sensitive : ton sobre, jamais dans un jeu ; years : période couverte (écarte l'inutile). */
    const SITES = [
        // 🇪🇺 Archives Portal Europe : le portail commun des archives nationales et régionales de 30 pays (inventaires)
        {key: 'ape', group: 'europe', country: 'Europe (30 pays)', icon: '🇪🇺', label: 'Archives Portal Europe — inventaires des archives de 30 pays',
            home: 'https://www.archivesportaleurope.net/', search: 'https://www.archivesportaleurope.net/advanced-search/', verified: 'non', paid: false,
            note: 'Le portail européen cherche dans les inventaires (pas dans les actes eux-mêmes) des archives de 30 pays. Forme de l’adresse de recherche non confirmée ce jour.',
            build: p => `https://www.archivesportaleurope.net/advanced-search/search-in-archives/results-(archives)/?&term=${encodeURIComponent([clean(p.last), firstOnly(p.first), town(p.place)].filter(Boolean).join(' '))}`,
            where: ['fiche', 'lieu'], kind: 'acte'},
        // 🕯 Justes parmi les nations : le Comité français pour Yad Vashem (les Justes de France, commune par commune)
        {key: 'cfyv_justes', group: 'fr_memoire', country: 'France', icon: '🕯', label: 'Comité français pour Yad Vashem — les Justes de France',
            home: 'https://yadvashem-france.org/', search: 'https://yadvashem-france.org/', verified: 'non', paid: false, sensitive: true, copy: 'name',
            note: 'Les Justes reconnus en France, avec leur commune et l’histoire de ceux qu’ils ont cachés. Recherche Google limitée au site (la recherche du site ne garde pas le nom dans l’adresse) ; le nom est copié.',
            build: p => p.last ? google('yadvashem-france.org', p, 'Juste') : gq(['site:yadvashem-france.org', town(p.place) ? q(town(p.place)) : '', 'Justes']),
            where: ['fiche', 'lieu'], kind: 'juste', years: [1880, 1945], yearsOf: 'birthBefore'},
        // 🗿 MonumentsMorts (université de Lille) : photos et inscriptions des monuments aux morts, commune par commune
        {key: 'monumentsmorts', group: 'fr_memoire', country: 'France', icon: '🗿', label: 'MonumentsMorts — monuments aux morts (université de Lille)',
            home: 'https://monumentsmorts.univ-lille.fr/', search: 'https://monumentsmorts.univ-lille.fr/', verified: 'non', paid: false, copy: 'place',
            note: 'Base de l’université de Lille : photo, inscriptions, sculpteur et histoire du monument de chaque commune. Recherche Google limitée au site, avec la commune ; la commune est copiée.',
            build: p => gq(['site:monumentsmorts.univ-lille.fr', town(p.place) ? q(town(p.place)) : '', p.last && !town(p.place) ? q(p.last) : '']),
            where: ['lieu', 'fiche', 'militaire'], kind: 'monument', byPlace: true},
        // 👶 Enfants trouvés et assistés
        {key: 'ap_paris', group: 'fr_enfants', country: 'France', icon: '👶', label: 'Archives de Paris — enfants trouvés et assistés (Assistance publique)',
            home: 'https://archives.paris.fr/', search: 'https://archives.paris.fr/', verified: 'non', paid: false, copy: 'name',
            note: 'Les registres d’admission des enfants trouvés puis assistés de Paris (de 1742 aux années 1920) et les dossiers de pupilles. Recherche Google limitée au site ; le nom est copié pour la recherche du site.',
            build: p => google('archives.paris.fr', p, '"enfants trouvés" OR "enfants assistés" OR pupille'),
            where: ['fiche', 'placement'], kind: 'enfant', years: [1640, 1940]},
        {key: 'enfants_fa', group: 'fr_enfants', country: 'France', icon: '🏛', label: 'FranceArchives — enfants assistés du département',
            home: 'https://francearchives.gouv.fr/fr/', search: 'https://francearchives.gouv.fr/fr/search', verified: 'non', paid: false,
            note: 'Les inventaires des Archives départementales (série X, hospices, pupilles de l’État) publiés sur FranceArchives. Même forme d’adresse que le bouton « FranceArchives » de l’app.',
            build: p => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(['"enfants assistés"', clean(p.county) || town(p.place), clean(p.last)].filter(Boolean).join(' '))}`,
            where: ['fiche', 'placement'], kind: 'enfant', years: [1640, 1940]},
        // 📒 Cercles généalogiques : un lien par département (le sien d'abord, réglable)
        {key: 'cercle_dept', group: 'fr_cercles', country: 'France', icon: '📒', label: 'Le cercle généalogique du département (relevés gratuits)',
            home: 'https://www.genefede.eu/', search: '', verified: 'non', paid: false, needs: 'dept',
            note: 'Les cercles relèvent les actes de leurs communes et les mettent souvent en ligne gratuitement. Écris l’adresse de ton cercle pour chaque département dans « ⚙️ Adresses des sites » ; sinon l’app ouvre une recherche « cercle généalogique + département ».',
            build: p => cercleUrl(p.deptCode || p.county, null, p.county),
            where: ['fiche', 'lieu'], kind: 'acte'},
        {key: 'ffg_annuaire', group: 'fr_cercles', country: 'France', icon: '📇', label: 'Fédération française de généalogie — annuaire des cercles',
            home: 'https://www.genefede.eu/', search: 'https://www.genefede.eu/', verified: 'non', paid: false,
            note: 'L’annuaire des associations membres de la Fédération : pour trouver le cercle d’un département ou d’un pays.',
            build: () => 'https://www.genefede.eu/', where: ['lieu'], kind: 'aide'},
        // 🧭 Aide par lieu
        {key: 'fs_wiki', group: 'aide', country: 'Monde', icon: '🧭', label: 'FamilySearch Wiki — comment chercher dans ce lieu (paroisse, pays)',
            home: 'https://www.familysearch.org/fr/wiki/fr/Page_principale', search: 'https://www.familysearch.org/en/wiki/Main_Page', verified: 'non', paid: false, byPlace: true,
            note: 'Le wiki dit, pour chaque pays, région et souvent chaque paroisse, quels registres existent, où ils sont et lesquels sont en ligne. En français pour la France, en anglais ailleurs (plus complet). Recherche du moteur MediaWiki (« index.php?search= »).',
            build: p => { const t = town(p.place) || clean(p.country); if (!t) return isFrance(p) ? 'https://www.familysearch.org/fr/wiki/fr/Page_principale' : 'https://www.familysearch.org/en/wiki/Main_Page';
                return isFrance(p) ? `https://www.familysearch.org/fr/wiki/fr/index.php?search=${enc(t)}` : `https://www.familysearch.org/en/wiki/index.php?search=${encodeURIComponent([t, clean(p.country)].filter(Boolean).join(' '))}`; },
            where: ['lieu', 'fiche'], kind: 'aide'},
        {key: 'genwiki', group: 'aide', country: 'Allemagne', icon: '📖', label: 'GenWiki — aide pour un lieu d’Allemagne et des pays germanophones',
            home: 'https://wiki.genealogy.net/', search: 'https://wiki.genealogy.net/', verified: 'non', paid: false, byPlace: true,
            note: 'Le wiki de l’association CompGen : une page par village (paroisses, registres, état civil, relevés, livres de familles). Recherche MediaWiki.',
            build: p => `https://wiki.genealogy.net/index.php?search=${enc(town(p.place) || clean(p.last))}`, where: ['lieu', 'fiche'], kind: 'aide'},
        {key: 'gov', group: 'aide', country: 'Allemagne', icon: '🏘', label: 'GOV — répertoire historique des lieux (CompGen)',
            home: 'https://gov.genealogy.net/', search: 'https://gov.genealogy.net/search/index', verified: 'non', paid: false, byPlace: true,
            note: 'Les noms anciens d’un lieu, sa paroisse, son district et son pays à chaque époque (très utile pour l’Allemagne, la Pologne, la Bohême). Paramètre « name » non confirmé.',
            build: p => `https://gov.genealogy.net/search/name?name=${enc(town(p.place))}`, where: ['lieu'], kind: 'aide'},
        // 🇩🇪 Allemagne
        {key: 'compgen_ofb', group: 'allemagne', country: 'Allemagne', icon: '👪', label: 'CompGen — livres des familles d’un village (Online-OFB)',
            home: 'https://www.online-ofb.de/', search: 'https://www.online-ofb.de/', verified: 'non', paid: false,
            note: 'Les « Ortsfamilienbücher » : toutes les familles d’une paroisse, reconstituées par des bénévoles, gratuites. Recherche Google limitée au site.',
            build: p => google('online-ofb.de', p, town(p.place) ? q(town(p.place)) : ''), where: ['fiche'], kind: 'acte', years: [1550, 1920]},
        {key: 'archion', group: 'allemagne', country: 'Allemagne', icon: '⛪', label: 'Archion — registres paroissiaux protestants d’Allemagne',
            home: 'https://www.archion.de/', search: 'https://www.archion.de/', verified: 'non', paid: 'oui', copy: 'place',
            note: 'Les images des registres des Églises protestantes allemandes, rangées par Land puis par paroisse : abonnement payant pour les voir. Pas de recherche par nom : la page d’accueil s’ouvre et le nom de la paroisse est copié.',
            build: () => 'https://www.archion.de/', where: ['fiche', 'lieu'], kind: 'acte', years: [1550, 1950]},
        // 🗺 Europe centrale : cadastres anciens et Hongrie
        {key: 'archivni_mapy', group: 'centre', country: 'Tchéquie', icon: '🗺', label: 'Archivní mapy (ČÚZK) — cadastre ancien de Bohême, Moravie et Silésie',
            home: 'https://archivnimapy.cuzk.cz/', search: 'https://archivnimapy.cuzk.cz/', verified: 'non', paid: false, copy: 'place', byPlace: true,
            note: 'Les plans du cadastre stable (1824-1843) et leurs mises à jour, gratuits. On cherche par « katastrální území » (le nom tchèque de la commune) : ce nom est copié.',
            build: () => 'https://archivnimapy.cuzk.cz/', where: ['lieu', 'carte'], kind: 'carte', years: [1820, 1960]},
        {key: 'mapire', group: 'centre', country: 'Autriche, Hongrie', icon: '🧭', label: 'Mapire (Arcanum) — cartes anciennes et cadastre de l’Autriche-Hongrie',
            home: 'https://maps.arcanum.com/', search: 'https://maps.arcanum.com/', verified: 'non', paid: 'partiel', copy: 'place', byPlace: true,
            note: 'Les relevés militaires et le cadastre de l’empire des Habsbourg, superposés à la carte d’aujourd’hui. Une partie est gratuite, le reste demande un abonnement. Le nom du lieu est copié.',
            build: () => 'https://maps.arcanum.com/', where: ['lieu', 'carte'], kind: 'carte', years: [1760, 1920]},
        {key: 'arcanum_adt', group: 'centre', country: 'Hongrie', icon: '📰', label: 'Arcanum ADT — journaux, revues et livres hongrois',
            home: 'https://adt.arcanum.com/', search: 'https://adt.arcanum.com/hu/', verified: 'non', paid: 'partiel',
            note: 'La grande bibliothèque numérique hongroise (presse depuis 1780, annuaires, revues). La recherche est gratuite, la lecture des pages demande souvent un abonnement. Forme « search/results/?query= » non confirmée.',
            build: p => `https://adt.arcanum.com/hu/search/results/?query=${encodeURIComponent(q([clean(p.last), firstOnly(p.first)].filter(Boolean).join(' ')))}`,
            where: ['fiche'], kind: 'presse', years: [1780, 2000]},
        // 🏛 En bibliothèque
        {key: 'ancestry_library', group: 'bibliotheque', country: 'Monde', icon: '🏛', label: 'Ancestry Library Edition — gratuit seulement en bibliothèque',
            home: 'https://www.ancestrylibrary.com/', search: 'https://www.ancestrylibrary.com/search/', verified: 'non', paid: 'bibliotheque',
            note: 'La version d’Ancestry offerte par certaines bibliothèques et archives : gratuite, mais seulement sur leurs ordinateurs (ou leur réseau). Chez toi, le bouton « Ancestry » de l’app ouvre la version payante.',
            build: p => `https://www.ancestrylibrary.com/search/?name=${enc(firstOnly(p.first))}_${enc(p.last)}${p.birthYear ? `&birth=${Number(p.birthYear)}` : ''}`,
            where: ['fiche'], kind: 'acte'},
    ];
    const site = key => SITES.find(s => s.key === key) || null;
    const groupOf = id => GROUPS.find(g => g.id === id) || null;

    /** la pastille de prix d'un site (K8) : null s'il est gratuit */
    function paidBadge(s) {
        const v = s && typeof s === 'object' ? s.paid : site(s)?.paid;
        if (v === 'oui') return {text: 'Payant', kind: 'red', title: 'Il faut un abonnement payant pour voir les documents'};
        if (v === 'partiel') return {text: 'En partie payant', kind: 'yellow', title: 'Une partie est gratuite, le reste demande un abonnement'};
        if (v === 'bibliotheque') return {text: 'Gratuit en bibliothèque', kind: 'blue', title: 'Gratuit seulement sur les ordinateurs d’une bibliothèque ou d’un service d’archives abonné'};
        return null;
    }
    const isFree = s => !(s && s.paid);

    /* ═════ Cercles généalogiques : un lien par département ═════ */
    /** mine : {« 32 »: « https://… »} écrit dans le réglage ; sinon une recherche « cercle généalogique + département + relevés » */
    function cercleUrl(dept, mine = null, deptName = '') {
        const code = String(dept ?? '').trim().toUpperCase().replace(/^0(?=\d$)/, '0');
        const own = mine && typeof mine === 'object' ? cleanUrl(mine[code] || mine[fold(dept)] || '') : '';
        if (own) return own;
        const name = clean(deptName) && !/^\d/.test(clean(deptName)) ? clean(deptName) : '';
        if (!code && !name) return 'https://www.genefede.eu/';
        return gq(['"cercle généalogique"', name ? q(name) : code, 'relevés']);
    }

    /** l'adresse à ouvrir : celle écrite dans les réglages si elle est sûre, sinon celle de l'app, sinon la page de recherche */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: town(p.place), commune: town(p.place), de: a || '', a: b || '',
            naissance: p.birthYear || '', annee_naissance: p.birthYear || '', deces: p.deathYear || '', annee_deces: p.deathYear || '', departement: p.county || p.deptCode || '', pays: p.country || ''};
        return String(template).replace(/\{([^{}]{1,24})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        if (key === 'cercle_dept' && custom && typeof custom.cercles === 'object') { const u = cercleUrl(p.deptCode || p.county, custom.cercles, p.county); if (u) return u; }
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        let built = ''; try { built = s.build(p); } catch (_) { built = ''; }
        return cleanUrl(built) || cleanUrl(s.search) || cleanUrl(s.home);
    }
    /** ce qu'on met dans le presse-papiers pour un site sans recherche dans l'adresse */
    function copyText(key, p = {}) {
        const s = site(key); if (!s || !s.copy) return '';
        return s.copy === 'place' ? town(p.place) : [clean(p.last).toUpperCase(), firstOnly(p.first)].filter(Boolean).join(' ');
    }

    /** les sites à proposer à un endroit ; ctx : {y1, y2, birthYear, country} — les années écartent l'inutile */
    function forPlace(where, ctx = {}) {
        const [a, b] = years(ctx); const by = Number(ctx.birthYear) || 0;
        return SITES.filter(s => !where || (s.where || []).includes(where)).filter(s => {
            if (!s.years) return true;
            if (s.yearsOf === 'birthBefore') return !by || by <= s.years[1];
            return !(a && b && (b < s.years[0] || a > s.years[1]));
        });
    }
    /** les sites montrés : réglage {hidden: [clés], freeOnly, countries: [pays cachés]} */
    function visible(settings = {}, list = SITES) {
        const hidden = new Set(Array.isArray(settings.hidden) ? settings.hidden : []);
        const hiddenGroups = new Set(Array.isArray(settings.hiddenGroups) ? settings.hiddenGroups : []);
        const freeOnly = settings.freeOnly !== false; // « Gratuites seulement » coché au départ, comme les autres lots
        const l = list.filter(s => !hidden.has(s.key) && !hiddenGroups.has(s.group) && (!freeOnly || isFree(s)));
        return [...l.filter(isFree), ...l.filter(s => !isFree(s))]; // les payants à la fin, jamais en premier
    }
    /** les nombres par rubrique (filtres C5 « Tout (n) ») */
    function counts(list) { const out = {all: list.length}; list.forEach(s => { out[s.group] = (out[s.group] || 0) + 1; }); return out; }

    /* ═════ « Mes sites » : un site ajouté par la personne ═════ */
    const CUSTOM_FIELDS = ['nom', 'prenom', 'nom_complet', 'lieu', 'commune', 'de', 'a', 'naissance', 'annee_naissance', 'deces', 'annee_deces', 'departement', 'pays'];
    const fillCustom = (template, p = {}) => fill(template, p);
    function checkCustom(s = {}) {
        const out = []; const u = String(s.url || '').trim();
        if (!clean(s.label)) out.push('Donne un nom au site.');
        if (!u) out.push('Écris l’adresse de recherche du site.');
        else if (!/^https?:\/\//i.test(u)) out.push('L’adresse doit commencer par https:// (ou http://).');
        else if (/[\s<>"'`]/.test(u.replace(/\{[^{}]*\}/g, ''))) out.push('L’adresse contient une espace ou un signe interdit.');
        const unknown = [...u.matchAll(/\{([^{}]{1,40})\}/g)].map(m => m[1]).filter(k => !CUSTOM_FIELDS.includes(fold(k).replace(/[^a-z_]/g, '')));
        if (unknown.length) out.push(`Champ inconnu : ${unknown.map(k => `{${k}}`).join(', ')}. Champs possibles : {nom} {prénom} {nom_complet} {lieu} {de} {à} {naissance} {décès} {département} {pays}.`);
        return out;
    }
    function cleanCustom(s = {}) {
        const k = /^mine-[a-z0-9-]{1,40}$/.test(String(s.key || '')) ? s.key : `mine-${Math.random().toString(36).slice(2, 10)}`;
        return {key: k, label: clean(s.label).slice(0, 80), url: String(s.url || '').trim().slice(0, 600), group: GROUPS.some(g => g.id === s.group) ? s.group : 'europe',
            paid: ['oui', 'partiel', 'bibliotheque'].includes(s.paid) ? s.paid : false, icon: String(s.icon || '🔗').trim().slice(0, 4)};
    }

    /* ═════ Les sortes d'import ═════ */
    const KINDS = {
        acte: {icon: '📜', label: 'Acte ou document d’archives', person: true,
            fields: [['type', 'Sorte d’acte', 'choice', [['', '— (seulement le document et sa source)'], ['BIRT', 'Naissance'], ['CHR', 'Baptême'], ['DEAT', 'Décès'], ['BURI', 'Inhumation'], ['RESI', 'Domicile, recensement'], ['OCCU', 'Métier'], ['EVEN', 'Autre événement']]],
                ['date', 'Date de l’acte', 'date'], ['place', 'Lieu, paroisse', 'text'], ['father', 'Père', 'text'], ['mother', 'Mère', 'text'], ['archive', 'Archives, fonds', 'text'], ['cote', 'Cote, page, n°', 'text']]},
        juste: {icon: '🕯', label: 'Juste parmi les nations', person: true, respect: true,
            fields: [['date', 'Date de la reconnaissance', 'date'], ['file', 'N° du dossier Yad Vashem', 'text'], ['place', 'Commune où il ou elle a aidé', 'text'], ['saved', 'Personnes aidées ou cachées', 'long']]},
        enfant: {icon: '👶', label: 'Enfant trouvé ou assisté (Assistance publique)', person: true,
            fields: [['pkind', 'Situation', 'choice', [['abandon', 'Abandonné'], ['assistance', 'Pupille de l’Assistance publique'], ['hospice', 'Recueilli par l’hospice'], ['nourrice', 'Mis en nourrice']]],
                ['matricule', 'N° matricule', 'text'], ['admission', 'Date d’admission', 'date'], ['institution', 'Institution', 'text'], ['placed', 'Placé à (commune, nourrice)', 'text'], ['nurse', 'Nourrice, famille', 'text'], ['end', 'Fin du placement', 'date'], ['outcome', 'Ce qu’il est devenu', 'text']]},
        monument: {icon: '🗿', label: 'Monument aux morts (photo, inscription)', person: false, place: true,
            fields: [['commune', 'Commune', 'text'], ['monument', 'Monument (sorte, sculpteur)', 'text'], ['date', 'Date d’inauguration', 'date'], ['inscription', 'Ce qui est écrit pour la personne', 'long']]},
        carte: {icon: '🗺', label: 'Plan de cadastre ou carte ancienne', person: false, place: true,
            fields: [['territory', 'Commune cadastrale (nom ancien)', 'text'], ['date', 'Année du plan', 'date'], ['sheet', 'Feuille, section', 'text'], ['parcel', 'Parcelle(s)', 'text']]},
        presse: {icon: '📰', label: 'Article de presse', person: true, common: true,
            fields: [['journal', 'Journal', 'text'], ['date', 'Date', 'date'], ['page', 'Page', 'text'], ['title', 'Titre de l’article', 'text']]},
    };
    const KIND_ORDER = ['acte', 'juste', 'enfant', 'monument', 'carte', 'presse'];
    /** Justes parmi les nations : une fiche qui porte cette distinction n'entre dans aucun jeu (même règle que les déportés) */
    const RESPECT = {awardTitle: 'Juste parmi les nations', kinds: ['juste'],
        text: 'Cette distinction s’écrit sobrement sur la fiche. Une fiche reconnue « Juste parmi les nations » n’apparaît plus dans les jeux ni dans les Trésors à jouer.'};

    /* ═════ Texte copié d'une fiche ═════ */
    const LABELS = {
        acte: {type: ['type', 'type d\'acte', 'acte', 'record type', 'event type', 'art', 'ereignis'], date: ['date', 'date de l\'acte', 'event date', 'datum'], place: ['lieu', 'paroisse', 'commune', 'event place', 'ort', 'pfarrei'],
            last: ['nom', 'surname', 'last name', 'nachname', 'familienname'], first: ['prenom', 'prenoms', 'given name', 'first name', 'vorname', 'vornamen'], father: ['pere', 'father', 'vater'], mother: ['mere', 'mother', 'mutter'],
            archive: ['archives', 'fonds', 'archive', 'repository', 'institution', 'archiv'], cote: ['cote', 'reference', 'signatur', 'reference code', 'page', 'seite']},
        juste: {name: ['nom', 'noms', 'name', 'justes'], date: ['date de reconnaissance', 'reconnu le', 'date de la reconnaissance', 'date of recognition', 'annee de reconnaissance'], file: ['dossier', 'n° de dossier', 'numero de dossier', 'file number', 'file'],
            place: ['commune', 'lieu', 'lieu de l\'aide', 'ville', 'place'], saved: ['personnes sauvees', 'personnes cachees', 'sauves', 'rescued persons', 'ont ete sauves']},
        enfant: {last: ['nom', 'nom de l\'enfant'], first: ['prenom', 'prenoms'], matricule: ['matricule', 'n° matricule', 'numero matricule', 'numero d\'immatriculation', 'n°'], admission: ['date d\'admission', 'admis le', 'admission', 'date d\'entree', 'entree'],
            institution: ['hospice', 'institution', 'etablissement', 'service'], placed: ['placement', 'place a', 'lieu de placement', 'agence', 'commune de placement'], nurse: ['nourrice', 'nom de la nourrice', 'gardien', 'famille'],
            end: ['sortie', 'date de sortie', 'fin du placement', 'deces', 'decede le'], outcome: ['devenir', 'observations', 'issue'], birth_date: ['date de naissance', 'ne le', 'nee le', 'naissance']},
        monument: {commune: ['commune', 'localite', 'ville'], monument: ['monument', 'type', 'type de monument', 'sculpteur', 'auteur'], date: ['inauguration', 'date d\'inauguration', 'date'], inscription: ['inscription', 'inscriptions', 'texte']},
        carte: {territory: ['katastralni uzemi', 'commune cadastrale', 'territoire', 'katastralgemeinde', 'commune'], date: ['annee', 'date', 'rok', 'jahr'], sheet: ['feuille', 'list', 'blatt', 'section'], parcel: ['parcelle', 'parcelles', 'parcela', 'parzelle']},
        presse: {journal: ['journal', 'titre du journal', 'periodique', 'folyoirat', 'lap'], date: ['date', 'datum', 'datum'], page: ['page', 'oldal', 'seite'], title: ['titre', 'cim', 'article']},
    };
    function parseFields(text, kind) {
        const map = LABELS[kind] || {}; const out = {};
        const lines = String(text ?? '').slice(0, 40000).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const keyOf = lab => { const f = fold(lab).replace(/\s*:\s*$/, '').replace(/[.]+$/, ''); for (const [k, list] of Object.entries(map)) if (list.includes(f)) return k; return null; };
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^([^:]{1,60}?)\s*:\s*(.*)$/);
            let k = null, v = '';
            if (m) { k = keyOf(m[1]); v = m[2]; if (k && !v && lines[i + 1] && !/:/.test(lines[i + 1])) { v = lines[i + 1]; i++; } }
            else { k = keyOf(lines[i]); if (k && lines[i + 1] && !keyOf(lines[i + 1])) { v = lines[i + 1]; i++; } }
            if (k && v && !out[k]) out[k] = v.slice(0, ['saved', 'inscription'].includes(k) ? 4000 : 600);
        }
        if (out.last && out.last === out.last.toUpperCase() && out.last.length > 1 && /[A-ZÀ-Ý]/.test(out.last)) out.last = out.last.charAt(0) + out.last.slice(1).toLowerCase();
        if (kind === 'acte' && out.type) { const t = fold(out.type); const tag = /naiss|birth|geburt/.test(t) ? 'BIRT' : /bapt|chr|taufe/.test(t) ? 'CHR' : /inhum|sepult|burial|begrab|beerdig/.test(t) ? 'BURI' : /dec|death|tod|sterb|mort/.test(t) ? 'DEAT' : /recens|census|domicile/.test(t) ? 'RESI' : ''; out.tag_text = out.type; out.type = tag || 'EVEN'; }
        if (kind === 'juste' && !out.file) { const m = String(text ?? '').match(/\b(?:dossier|file)\s*(?:n[°o]\.?\s*)?:?\s*(\d{2,6}[a-z]?)\b/i); if (m) out.file = m[1]; }
        if (kind === 'juste' && !out.date) { const y = String(text ?? '').match(/reconnu(?:e|s|es)?\s+(?:comme\s+)?(?:juste[^,.;]{0,40}?)?\s*(?:le|en)\s+([^,.;\n]{4,30})/i); if (y) out.date = y[1].trim(); }
        if (kind === 'enfant' && !out.matricule) { const m = String(text ?? '').match(/\bmatricule\s*(?:n[°o]\.?\s*)?:?\s*([0-9]{1,7}(?:\s?[A-Z]{1,3})?)\b/i); if (m) out.matricule = m[1]; }
        return out;
    }
    /** devine la sorte d'un texte collé (sinon '') */
    function detectKind(text) {
        const t = fold(String(text ?? '').slice(0, 20000));
        if (/juste parmi les nations|justes parmi les nations|yad vashem|righteous/.test(t)) return 'juste';
        if (/enfants? (trouves?|assistes?)|assistance publique|pupille|hospice des enfants|tour d'abandon/.test(t)) return 'enfant';
        if (/monument aux morts|monumentsmorts|inauguration/.test(t)) return 'monument';
        if (/cadastre|katastr|parcelle|parcela|stabilni katastr/.test(t)) return 'carte';
        if (/arcanum|ujsag|folyoirat|journal du|gazette/.test(t)) return 'presse';
        if (/acte|registre|paroisse|kirchenbuch|taufe|baptism|archives/.test(t)) return 'acte';
        return '';
    }

    /** ce qu'un lien collé dit déjà */
    function parseLink(raw) {
        const u = cleanUrl(raw); const out = {url: u, site: '', kind: '', notice: ''};
        if (!u) return out;
        let host = '', path = ''; try { const x = new URL(u); host = x.hostname.toLowerCase(); path = x.pathname + x.search; } catch (_) { return out; }
        const set = (k) => { out.site = k; out.kind = site(k)?.kind || ''; };
        if (/(^|\.)archivesportaleurope\.net$/.test(host)) { set('ape'); const m = path.match(/\/(?:ead-display|advanced-search\/search-in-archives\/results-\(archives\))\/[^?]*?([A-Za-z0-9_.-]{6,})\/?$/); if (m) out.notice = m[1]; }
        else if (/(^|\.)yadvashem-france\.org$/.test(host)) set('cfyv_justes');
        else if (/(^|\.)monumentsmorts\.univ-lille\.fr$/.test(host)) { set('monumentsmorts'); const m = path.match(/\/monument\/(\d{1,7})/); if (m) out.notice = m[1]; }
        else if (/(^|\.)archives\.paris\.fr$/.test(host)) set('ap_paris');
        else if (/(^|\.)familysearch\.org$/.test(host) && /\/wiki\//.test(path)) set('fs_wiki');
        else if (host === 'wiki.genealogy.net') set('genwiki');
        else if (host === 'gov.genealogy.net') { set('gov'); const m = path.match(/\/item\/show\/([A-Z0-9_-]{4,})/i); if (m) out.notice = m[1]; }
        else if (/(^|\.)online-ofb\.de$/.test(host)) set('compgen_ofb');
        else if (/(^|\.)archion\.de$/.test(host)) set('archion');
        else if (host === 'archivnimapy.cuzk.cz') set('archivni_mapy');
        else if (/(^|\.)maps\.arcanum\.com$/.test(host) || /(^|\.)mapire\.eu$/.test(host)) set('mapire');
        else if (/(^|\.)adt\.arcanum\.com$/.test(host)) set('arcanum_adt');
        else if (/(^|\.)ancestrylibrary\.(com|ca)$/.test(host)) set('ancestry_library');
        else if (/(^|\.)genefede\.eu$/.test(host)) set('ffg_annuaire');
        return out;
    }

    /** ce qu'un document lu propose d'ajouter ; ctx : {has: {BIRT: true…}} — seulement ce qui manque, chaque ajout avec sa raison */
    const UNIQUE = ['BIRT', 'CHR', 'DEAT', 'BURI'];
    function proposals(kind, f = {}, ctx = {}) {
        const has = ctx.has || {}; const out = [];
        if (kind === 'acte') {
            const tag = String(f.type || '').toUpperCase();
            if (tag && (f.date || f.place)) {
                const already = UNIQUE.includes(tag) && !!has[tag];
                out.push({id: 'event', what: 'event', tag, label: {BIRT: 'Naissance', CHR: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation', RESI: 'Domicile', OCCU: 'Métier', EVEN: clean(f.tag_text) || 'Événement'}[tag] || 'Événement',
                    date: clean(f.date), place: clean(f.place), checked: !already, exists: already ? 'un événement de cette sorte' : '',
                    why: [f.father && `Père : ${clean(f.father)}`, f.mother && `Mère : ${clean(f.mother)}`].filter(Boolean).join(' · ')});
            }
        } else if (kind === 'juste') {
            out.push({id: 'award', what: 'award', label: '🕯 Distinction « Juste parmi les nations »', date: clean(f.date), place: clean(f.place), checked: !ctx.hasJuste,
                exists: ctx.hasJuste ? 'la distinction (gardée)' : '', why: 'Dans « 🏆 Concours et récompenses », avec le dossier et la mention « à vérifier ».'});
        } else if (kind === 'enfant') {
            out.push({id: 'placement', what: 'placement', label: '👶 Un placement dans le bloc « Enfant placé »', date: clean(f.admission), place: clean(f.placed), checked: !ctx.samePlacement,
                exists: ctx.samePlacement ? 'un placement avec ce matricule' : '', why: 'Ajouté à côté des placements déjà notés ; aucun n’est changé.'});
        }
        return out;
    }
    /** le titre de la source créée à l'import */
    function sourceTitle(kind, f = {}, siteKey = '') {
        const s = site(siteKey); const who = clean([f.first, f.last].filter(Boolean).join(' '));
        const base = kind === 'monument' ? `Monument aux morts${f.commune ? ' de ' + clean(f.commune) : ''}` : kind === 'carte' ? `Plan cadastral${f.territory ? ' — ' + clean(f.territory) : ''}${f.date ? ' (' + clean(f.date) + ')' : ''}`
            : kind === 'juste' ? 'Juste parmi les nations' : kind === 'enfant' ? `Enfant assisté${f.matricule ? ', matricule ' + clean(f.matricule) : ''}` : (KINDS[kind]?.label || 'Archives en ligne');
        return `${base}${who && !['monument', 'carte'].includes(kind) ? ` — ${who}` : ''}${s ? ` (${s.label.split(' — ')[0]})` : ''}`.slice(0, 240);
    }

    return {CHECKED, MENTION, SITES, GROUPS, THEMES, KINDS, KIND_ORDER, RESPECT, CUSTOM_FIELDS, site, groupOf, url, fill, copyText, forPlace, visible, counts, paidBadge, isFree,
        cercleUrl, fillCustom, checkCustom, cleanCustom, parseFields, detectKind, parseLink, proposals, sourceTitle, cleanUrl, fold, yearOf};
});
