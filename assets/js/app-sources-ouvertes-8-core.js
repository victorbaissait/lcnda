/* LCNDA — 🌍 Archives en ligne, huitième lot : des sites GRATUITS (ou en partie gratuits, marqués comme tels) pour « 🌍 Où
 * chercher ? » et la fenêtre « Archives en ligne » : relevés des cercles (Geneabank, annuaire Geneawiki), Français libres,
 * familles juives (CGJ), Antilles (GHC, Anchoukaj), morts des guerres hors de France (CWGC, Volksbund, Belgique, Italie,
 * Pays-Bas, Canada, États-Unis, Finlande, URSS), presse ancienne (Belgique, Luxembourg, Suisse, Espagne, Allemagne, pays de
 * Galles, Brésil), registres et recensements (Royaume-Uni, Irlande, Pays-Bas, Allemagne, Autriche, Pologne, pays baltes,
 * Tchéquie, Canada, États-Unis), émigration (Danemark, Norvège, Brême, Argentine). Calculs purs, SANS RÉSEAU
 * (window.LCNDA_SOURCES_OUVERTES_8 ; aussi require() dans Node).
 *
 * Même modèle que les autres lots (app-sources-ouvertes-core.js … -7-core.js) : l'app N'INTERROGE JAMAIS ces sites. Elle ouvre
 * leur page dans le navigateur de la personne et, pour un site qui cherche par nom, met le nom dans le presse-papiers
 * (copy : 'name') ou le lieu (copy : 'place'). Ce lot n'a pas d'import : on importe ce qu'on a trouvé par « Coller un lien » ou
 * l'import d'un autre lot.
 *
 *  - SITES, GROUPS             les sites et leurs rubriques ; paid : false · 'partiel' (une partie demande une adhésion ou un abonnement)
 *  - url(key, p, custom)       l'adresse (p : first, last, place…) ; custom = {clé: modèle} écrit dans « ⚙️ Adresses des sites »
 *  - copyText(key, p)          ce qu'on colle dans la case du site
 *  - paidBadge(site), isFree   la pastille de prix (null si gratuit)
 *  - forPlace(where, ctx)      les sites à proposer à un endroit (fiche, lieu)
 *
 * Adresses : chaque site a été retrouvé par une recherche sur internet le 19/11/2026 (son existence et son adresse), mais
 * aucune page n'a pu être ouverte depuis l'atelier (réseau fermé) : verified 'non' partout. Faute de forme d'adresse de recherche
 * confirmée, l'app ouvre la page d'accueil (ou la page de recherche) du site, jamais une adresse inventée. Les règles de
 * pertinence (pays, années, profils, morts des guerres) sont dans app-ou-chercher-core.js (RULES, clés « so8_… »).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES_8 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const CHECKED = '2026-11-19';
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const years = p => { let a = Number(p.y1) || Number(p.birthYear) || 0, b = Number(p.y2) || Number(p.deathYear) || 0; if (a && b && b < a) [a, b] = [b, a]; return [a, b || a]; };
    const town = s => clean(s).split(',')[0].replace(/\s*\(.*\)\s*$/, '').trim();
    const nameOf = p => [firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');

    /* ═════ Rubriques (les noms de pays sont déjà traduits dans l'app) ═════ */
    const GROUPS = [
        {id: 'france', icon: '🇫🇷', label: 'France', country: 'France'},
        {id: 'guerres', icon: '🕯', label: 'Morts des guerres', country: 'Monde'},
        {id: 'presse', icon: '📰', label: 'Presse ancienne', country: 'Europe'},
        {id: 'pays_bas', icon: '🇳🇱', label: 'Pays-Bas', country: 'Pays-Bas'},
        {id: 'allemagne', icon: '🇩🇪', label: 'Allemagne', country: 'Allemagne'},
        {id: 'autriche', icon: '🇦🇹', label: 'Autriche', country: 'Autriche'},
        {id: 'suisse', icon: '🇨🇭', label: 'Suisse', country: 'Suisse'},
        {id: 'royaume_uni', icon: '🇬🇧', label: 'Royaume-Uni', country: 'Royaume-Uni'},
        {id: 'irlande', icon: '🇮🇪', label: 'Irlande', country: 'Irlande'},
        {id: 'danemark', icon: '🇩🇰', label: 'Danemark', country: 'Danemark'},
        {id: 'norvege', icon: '🇳🇴', label: 'Norvège', country: 'Norvège'},
        {id: 'pologne', icon: '🇵🇱', label: 'Pologne', country: 'Pologne'},
        {id: 'estonie', icon: '🇪🇪', label: 'Estonie', country: 'Estonie'},
        {id: 'lettonie', icon: '🇱🇻', label: 'Lettonie', country: 'Lettonie'},
        {id: 'lituanie', icon: '🇱🇹', label: 'Lituanie', country: 'Lituanie'},
        {id: 'tchequie', icon: '🇨🇿', label: 'Tchéquie', country: 'Tchéquie'},
        {id: 'etats_unis', icon: '🇺🇸', label: 'États-Unis', country: 'États-Unis'},
        {id: 'canada', icon: '🇨🇦', label: 'Canada', country: 'Canada'},
        {id: 'argentine', icon: '🇦🇷', label: 'Argentine', country: 'Argentine'},
    ];

    /* ═════ Les sites ═════
     * home : l'accueil ; search : la page de recherche (on y colle le nom) ; copy : 'name' ou 'place' va dans le presse-papiers ;
     * where : endroits de l'app (fiche, lieu) ; paid : false ou 'partiel' ; account : un compte gratuit est demandé ; sensitive :
     * ton sobre (mémoire de la Shoah) ; years : période couverte (écarte l'inutile dans la fenêtre « Archives en ligne »). */
    const S = (o) => ({verified: 'non', paid: false, where: ['fiche'], kind: 'acte', ...o});
    const SITES = [
        // 🇫🇷 France
        S({key: 'geneabank', group: 'france', country: 'France', icon: '📒', label: 'Geneabank — relevés des cercles généalogiques (gratuit pour leurs adhérents)',
            home: 'https://www.geneabank.org/', paid: 'partiel', copy: 'name'}),
        S({key: 'geneawiki_releves', group: 'france', country: 'France', icon: '📖', label: 'Geneawiki — annuaire des relevés libres et gratuits',
            home: 'https://fr.geneawiki.com/wiki/Annuaire_des_relev%C3%A9s_collaboratifs_libres_et_gratuits', where: ['fiche', 'lieu'], kind: 'aide', byPlace: true}),
        S({key: 'francais_libres', group: 'france', country: 'France', icon: '🎖', label: 'Les Français libres — liste des FFL (1940-1943)',
            home: 'https://www.francaislibres.net/', copy: 'name', years: [1880, 1945]}),
        S({key: 'cgj', group: 'france', country: 'France', icon: '✡', label: 'Cercle de généalogie juive — bases et ressources par pays',
            home: 'https://www.genealoj.org/', copy: 'name'}),
        S({key: 'ghcaraibe', group: 'france', country: 'France', icon: '🏝', label: 'Généalogie et Histoire de la Caraïbe — articles et relevés (Antilles, Guyane)',
            home: 'https://www.ghcaraibe.org/', copy: 'name'}),
        S({key: 'anchoukaj', group: 'france', country: 'France', icon: '⛓', label: 'Anchoukaj — les noms des esclaves libérés en 1848 (Guadeloupe, Martinique)',
            home: 'https://www.anchoukaj.org/', copy: 'name', years: [1780, 1900]}),
        // 🕯 Morts des guerres (hors France)
        S({key: 'cwgc', group: 'guerres', country: 'Royaume-Uni', icon: '🕯', label: 'CWGC — morts du Commonwealth des deux guerres mondiales',
            home: 'https://www.cwgc.org/', search: 'https://www.cwgc.org/find-records/find-war-dead/', copy: 'name', years: [1914, 1947]}),
        S({key: 'volksbund', group: 'guerres', country: 'Allemagne', icon: '🕯', label: 'Volksbund — tombes des soldats allemands morts à la guerre',
            home: 'https://www.volksbund.de/', search: 'https://www.volksbund.de/erinnern-gedenken/graebersuche-online', copy: 'name', years: [1914, 1947]}),
        S({key: 'wardead_be', group: 'guerres', country: 'Belgique', icon: '🕯', label: 'War Dead Register — soldats belges morts à la guerre',
            home: 'https://www.wardeadregister.be/', copy: 'name', years: [1914, 1955]}),
        S({key: 'caduti_gg', group: 'guerres', country: 'Italie', icon: '🕯', label: 'Albo d’oro — soldats italiens morts en 1915-1918',
            home: 'https://www.cadutigrandeguerra.it/', copy: 'name', years: [1915, 1920]}),
        S({key: 'ogs_nl', group: 'guerres', country: 'Pays-Bas', icon: '🕯', label: 'Oorlogsgravenstichting — victimes néerlandaises de la guerre',
            home: 'https://oorlogsgravenstichting.nl/', copy: 'name', years: [1939, 1962]}),
        S({key: 'cvwm', group: 'guerres', country: 'Canada', icon: '🕯', label: 'Mémorial virtuel de guerre du Canada — soldats canadiens morts',
            home: 'https://www.veterans.gc.ca/', search: 'https://www.veterans.gc.ca/en/remembrance/memorials/canadian-virtual-war-memorial', copy: 'name', years: [1884, 2014]}),
        S({key: 'abmc', group: 'guerres', country: 'États-Unis', icon: '🕯', label: 'ABMC — soldats américains enterrés hors des États-Unis',
            home: 'https://www.abmc.gov/', search: 'https://www.abmc.gov/database-search', copy: 'name', years: [1917, 1975]}),
        S({key: 'sotasampo', group: 'guerres', country: 'Finlande', icon: '🕯', label: 'Sotasampo — soldats finlandais morts en 1939-1945',
            home: 'https://sotasampo.fi/en', copy: 'name', years: [1939, 1945]}),
        S({key: 'obd_memorial', group: 'guerres', country: 'Russie', icon: '🕯', label: 'OBD Memorial — soldats soviétiques morts ou disparus en 1941-1945',
            home: 'https://obd-memorial.ru/', copy: 'name', years: [1939, 1946]}),
        // 📰 Presse ancienne
        S({key: 'belgicapress', group: 'presse', country: 'Belgique', icon: '📰', label: 'BelgicaPress — journaux belges anciens (KBR)', home: 'https://www.belgicapress.be/', copy: 'name', kind: 'presse', years: [1814, 1989]}),
        S({key: 'eluxemburgensia', group: 'presse', country: 'Luxembourg', icon: '📰', label: 'eluxemburgensia — journaux luxembourgeois anciens (BnL)', home: 'https://eluxemburgensia.lu/', copy: 'name', kind: 'presse', years: [1840, 2007]}),
        S({key: 'e_newspaperarchives', group: 'presse', country: 'Suisse', icon: '📰', label: 'e-newspaperarchives.ch — journaux suisses anciens', home: 'https://www.e-newspaperarchives.ch/', copy: 'name', kind: 'presse', years: [1692, 2000]}),
        S({key: 'hemeroteca_bne', group: 'presse', country: 'Espagne', icon: '📰', label: 'Hemeroteca Digital — journaux espagnols anciens (BNE)', home: 'https://hemerotecadigital.bne.es/', copy: 'name', kind: 'presse', years: [1683, 1990]}),
        S({key: 'ddb_zeitungen', group: 'presse', country: 'Allemagne', icon: '📰', label: 'Deutsches Zeitungsportal — journaux allemands anciens', home: 'https://www.deutsche-digitale-bibliothek.de/newspaper', copy: 'name', kind: 'presse', years: [1671, 1994]}),
        S({key: 'welsh_newspapers', group: 'presse', country: 'Royaume-Uni', icon: '📰', label: 'Welsh Newspapers — journaux du pays de Galles (1804-1919)', home: 'https://newspapers.library.wales/', copy: 'name', kind: 'presse', years: [1804, 1919]}),
        S({key: 'hemeroteca_br', group: 'presse', country: 'Brésil', icon: '📰', label: 'Hemeroteca Digital Brasileira — journaux brésiliens anciens', home: 'https://memoria.bn.gov.br/', copy: 'name', kind: 'presse', years: [1740, 2000]}),
        // 🇳🇱 Pays-Bas
        S({key: 'wiewaswie', group: 'pays_bas', country: 'Pays-Bas', icon: '🔎', label: 'WieWasWie — actes des archives néerlandaises', home: 'https://www.wiewaswie.nl/', paid: 'partiel', copy: 'name'}),
        S({key: 'archieven_nl', group: 'pays_bas', country: 'Pays-Bas', icon: '🔎', label: 'Archieven.nl — personnes dans les archives néerlandaises', home: 'https://www.archieven.nl/', copy: 'name'}),
        S({key: 'joodsmonument', group: 'pays_bas', country: 'Pays-Bas', icon: '🕯', label: 'Joods Monument — les Juifs des Pays-Bas morts dans la Shoah', home: 'https://www.joodsmonument.nl/', copy: 'name', sensitive: true, years: [1880, 1945]}),
        // 🇩🇪 Allemagne
        S({key: 'verlustlisten', group: 'allemagne', country: 'Allemagne', icon: '🎖', label: 'Verlustlisten — listes des pertes allemandes de 1914-1919 (CompGen)', home: 'https://des.genealogy.net/', copy: 'name', years: [1914, 1919]}),
        S({key: 'passagierlisten', group: 'allemagne', country: 'Allemagne', icon: '🚢', label: 'Passagierlisten — départs de Brême (1920-1939)', home: 'https://www.passagierlisten.de/', copy: 'name', years: [1920, 1939]}),
        S({key: 'gedenkbuch', group: 'allemagne', country: 'Allemagne', icon: '🕯', label: 'Gedenkbuch (Bundesarchiv) — les Juifs d’Allemagne victimes de la Shoah', home: 'https://www.bundesarchiv.de/gedenkbuch/', copy: 'name', sensitive: true, years: [1933, 1945]}),
        // 🇦🇹 Autriche
        S({key: 'genteam', group: 'autriche', country: 'Autriche', icon: '🔎', label: 'GenTeam — index gratuits d’Autriche et d’Europe centrale (compte gratuit)', home: 'https://www.genteam.eu/', copy: 'name', account: true}),
        S({key: 'verlustlisten_at', group: 'autriche', country: 'Autriche', icon: '🎖', label: 'Verlustlisten Österreich-Ungarn — pertes de 1914-1919', home: 'https://des.genealogy.net/ou1wk/search', copy: 'name', years: [1914, 1919]}),
        // 🇨🇭 Suisse
        S({key: 'famn_ch', group: 'suisse', country: 'Suisse', icon: '🏔', label: 'Répertoire des noms de famille suisses — lieux d’origine (HLS)', home: 'https://hls-dhs-dss.ch/', copy: 'name', where: ['fiche', 'lieu']}),
        // 🇬🇧 Royaume-Uni
        S({key: 'freereg', group: 'royaume_uni', country: 'Royaume-Uni', icon: '⛪', label: 'FreeREG — registres paroissiaux britanniques relevés', home: 'https://www.freereg.org.uk/', copy: 'name', years: [1538, 1900]}),
        S({key: 'tna_discovery', group: 'royaume_uni', country: 'Royaume-Uni', icon: '🏛', label: 'The National Archives (Discovery) — catalogue des archives britanniques', home: 'https://discovery.nationalarchives.gov.uk/', copy: 'name'}),
        // 🇮🇪 Irlande
        S({key: 'census_ie', group: 'irlande', country: 'Irlande', icon: '🧾', label: 'Recensements d’Irlande de 1901 et 1911 (Archives nationales)', home: 'https://census.nationalarchives.ie/', copy: 'name', years: [1901, 1911]}),
        S({key: 'nli_registers', group: 'irlande', country: 'Irlande', icon: '⛪', label: 'Registres paroissiaux catholiques d’Irlande (NLI, sans index)', home: 'https://registers.nli.ie/', copy: 'place', byPlace: true, years: [1740, 1880]}),
        // 🇩🇰 🇳🇴 émigration
        S({key: 'ddd_emigrants', group: 'danemark', country: 'Danemark', icon: '🚢', label: 'Dansk Demografisk Database — émigrants danois', home: 'https://ddd.dda.dk/', copy: 'name', years: [1868, 1910]}),
        S({key: 'norwayheritage', group: 'norvege', country: 'Norvège', icon: '🚢', label: 'Norway Heritage — navires et passagers des émigrants norvégiens', home: 'https://www.norwayheritage.com/', copy: 'name', years: [1825, 1925]}),
        // 🇵🇱 Pologne
        S({key: 'szukajwarchiwach', group: 'pologne', country: 'Pologne', icon: '🏛', label: 'Szukaj w Archiwach — registres numérisés des archives polonaises', home: 'https://www.szukajwarchiwach.gov.pl/', copy: 'place', byPlace: true}),
        S({key: 'poznan_project', group: 'pologne', country: 'Pologne', icon: '💍', label: 'Poznan Project — mariages de la région de Poznań (1800-1899)', home: 'https://poznan-project.psnc.pl/', copy: 'name', years: [1800, 1899]}),
        S({key: 'basia', group: 'pologne', country: 'Pologne', icon: '🔎', label: 'BaSIA — actes indexés de Grande-Pologne', home: 'https://www.basia.famula.pl/', copy: 'name'}),
        // pays baltes
        S({key: 'saaga', group: 'estonie', country: 'Estonie', icon: '⛪', label: 'Saaga (Archives nationales d’Estonie) — registres paroissiaux numérisés', home: 'https://www.ra.ee/', copy: 'place', byPlace: true, account: true}),
        S({key: 'raduraksti', group: 'lettonie', country: 'Lettonie', icon: '⛪', label: 'Raduraksti — registres paroissiaux de Lettonie', home: 'https://raduraksti.arhivi.lv/', copy: 'place', byPlace: true, years: [1700, 1940]}),
        S({key: 'epaveldas', group: 'lituanie', country: 'Lituanie', icon: '⛪', label: 'Epaveldas — registres numérisés de Lituanie', home: 'https://www.epaveldas.lt/', copy: 'place', byPlace: true}),
        // 🇨🇿 Tchéquie
        S({key: 'actapublica', group: 'tchequie', country: 'Tchéquie', icon: '⛪', label: 'Acta Publica — registres paroissiaux de Moravie (archives de Brno)', home: 'https://www.mza.cz/actapublica/', copy: 'place', byPlace: true}),
        // 🇺🇸 États-Unis
        S({key: 'glo_records', group: 'etats_unis', country: 'États-Unis', icon: '🗺', label: 'BLM GLO Records — concessions de terres aux États-Unis', home: 'https://glorecords.blm.gov/', copy: 'name', years: [1788, 1970]}),
        S({key: 'usgenweb', group: 'etats_unis', country: 'États-Unis', icon: '🗂', label: 'USGenWeb — relevés gratuits par État et par comté', home: 'https://usgenweb.org/', where: ['fiche', 'lieu'], kind: 'aide', byPlace: true}),
        S({key: 'stevemorse', group: 'etats_unis', country: 'États-Unis', icon: '🧰', label: 'Steve Morse — formulaires de recherche en une étape (Ellis Island…)', home: 'https://stevemorse.org/', kind: 'aide'}),
        // 🇨🇦 Canada
        S({key: 'nosorigines', group: 'canada', country: 'Canada', icon: '⚜', label: 'Nos Origines — généalogie du Québec et de l’Amérique française', home: 'https://www.nosorigines.qc.ca/', copy: 'name'}),
        S({key: 'automatedgenealogy', group: 'canada', country: 'Canada', icon: '🧾', label: 'Automated Genealogy — index des recensements canadiens (1851-1911)', home: 'https://automatedgenealogy.com/', copy: 'name', years: [1851, 1911]}),
        // 🇦🇷 Argentine
        S({key: 'cemla', group: 'argentine', country: 'Argentine', icon: '🚢', label: 'CEMLA — arrivées des immigrants en Argentine', home: 'https://cemla.com/', search: 'https://cemla.com/buscador/', copy: 'name', years: [1800, 1960]}),
    ];
    const site = key => SITES.find(s => s.key === key) || null;

    /** la pastille de prix d'un site : null s'il est gratuit */
    function paidBadge(s) {
        const v = s && typeof s === 'object' ? s.paid : site(s)?.paid;
        if (v === 'oui') return {text: 'Payant', kind: 'red', title: 'Il faut un abonnement payant pour voir les documents'};
        if (v === 'partiel') return {text: 'En partie payant', kind: 'yellow', title: 'Une partie est gratuite, le reste demande un abonnement'};
        return null;
    }
    const isFree = s => !(s && s.paid);

    /** un modèle écrit dans « ⚙️ Adresses des sites » : {nom} {prenom} {lieu} {de} {a}… */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: town(p.place), commune: town(p.place), de: a || '', a: b || '',
            naissance: p.birthYear || '', annee_naissance: p.birthYear || '', deces: p.deathYear || '', annee_deces: p.deathYear || '', departement: p.county || p.deptCode || '', pays: p.country || ''};
        return String(template).replace(/\{([^{}]{1,24})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    /** l'adresse à ouvrir : celle de la personne si elle est sûre, sinon la page de recherche du site, sinon son accueil */
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        return cleanUrl(s.search) || cleanUrl(s.home);
    }
    /** ce qu'on met dans le presse-papiers (le site ne garde pas la recherche dans son adresse) */
    function copyText(key, p = {}) {
        const s = site(key); if (!s || !s.copy) return '';
        return s.copy === 'place' ? town(p.place) : [clean(p.last).toUpperCase(), firstOnly(p.first)].filter(Boolean).join(' ');
    }
    /** les sites à proposer à un endroit ; ctx : {y1, y2, birthYear} — les années écartent l'inutile */
    function forPlace(where, ctx = {}) {
        const [a, b] = years(ctx);
        return SITES.filter(s => !where || (s.where || []).includes(where)).filter(s => !s.years || !(a && b && (b < s.years[0] || a > s.years[1])));
    }

    return {CHECKED, GROUPS, SITES, site, url, copyText, paidBadge, isFree, forPlace, fill, cleanUrl, fold};
});
