/* LCNDA — 🌍 « Où chercher ? » : les SORTES de source (📜 actes, 📰 journaux, 🎖 militaire…) et les filtres de la page.
 * Calculs purs, SANS RÉSEAU (window.LCNDA_OUC_SORTES ; aussi require() dans Node pour les tests). Maquette validée :
 * docs/design/ou-chercher-filtres.html (pastilles toujours visibles ET dans « Filtrer ▾ », choix retenu pour toutes les
 * personnes, un site peut avoir plusieurs sortes, sortes écrites dans une table, « En français seulement » déduit du pays).
 *
 *  - SORTS                    les sortes, dans l'ordre fixe des pastilles (les 3 rares derrière « ＋3 »)
 *  - CATS                     la table des sortes des sites connus qui ne se rangent pas bien tout seuls (corrections à la
 *                             main) ; une règle du moteur (RULES[clé].cats), ou le site lui-même (site.cats, « Mes sites »),
 *                             passent devant
 *  - classify(site, règle)    le classeur : la sorte tirée des champs actuels (group, where, profils, diedIn, missing, nom)
 *  - catsOf(site)             les sortes d'un site (table, sinon classeur, sinon « autres »)
 *  - siteCountries(site)      ses pays (codes), [] = monde entier
 *  - inFrench(site)           a une page en français (pays francophone, ou la courte liste FR_PAGE)
 *  - applyFilters(rows, f)    garde les sites d'au moins une sorte cochée ET du pays ET gratuits ET en français
 *  - counts(rows, f)          le nombre de sites de chaque sorte (avec les autres filtres)
 *  - outGroups(out)           les écartés rangés par raison (pays, années, profil, sexe, peu utile, autre)
 *  - shortcuts(ctx, list)     les raccourcis de la fiche (la sorte de son profil d'abord, puis les plus fournies)
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_OUC_SORTES = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const core = () => (root && root.LCNDA_OU_CHERCHER) || (typeof require === 'function' ? require('./app-ou-chercher-core.js') : null);
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

    /** les sortes : id, icône, nom court (pastille), nom long (Filtrer ▾), rare (derrière « ＋3 ») */
    const SORTS = [
        {id: 'actes', icon: '📜', short: 'Actes', label: 'Actes (état civil, paroissiaux)'},
        {id: 'journaux', icon: '📰', short: 'Journaux', label: 'Journaux'},
        {id: 'militaire', icon: '🎖', short: 'Militaire', label: 'Militaire et guerres'},
        {id: 'recensements', icon: '👥', short: 'Recensements', label: 'Recensements et annuaires'},
        {id: 'marins', icon: '⚓', short: 'Marins, colonies', label: 'Marins et colonies'},
        {id: 'emigration', icon: '🚢', short: 'Émigration', label: 'Émigration'},
        {id: 'deces', icon: '⚰️', short: 'Cimetières, décès', label: 'Cimetières et décès'},
        {id: 'notaires', icon: '🏛', short: 'Notaires', label: 'Notaires, terres et justice'},
        {id: 'metiers', icon: '💼', short: 'Métiers', label: 'Métiers (élus, médecins, cheminots, photographes…)'},
        {id: 'arbres', icon: '🧬', short: 'Arbres', label: 'Arbres en ligne'},
        {id: 'bibliotheques', icon: '📚', short: 'Bibliothèques', label: 'Bibliothèques et livres'},
        {id: 'cartes', icon: '🗺', short: 'Cartes', label: 'Cartes et lieux'},
        {id: 'deportation', icon: '🕯', short: 'Déportation', label: 'Déportation et répression', rare: true},
        {id: 'guides', icon: '🧭', short: 'Guides', label: 'Guides et modes d’emploi', rare: true},
        {id: 'moteurs', icon: '🔎', short: 'Moteurs', label: 'Moteurs et encyclopédies', rare: true},
    ];
    const OTHER = {id: 'autres', icon: '•', short: 'Autres', label: 'Autres'};
    const SORT = Object.fromEntries([...SORTS, OTHER].map(s => [s.id, s]));
    /** le profil de la fiche → la sorte mise en avant dans les raccourcis (🕯 jamais mise en avant) */
    const PROFILE_SORT = {soldier: 'militaire', mpf: 'militaire', pow: 'militaire', sailor: 'marins', emigrant: 'emigration', doctor: 'metiers', elected: 'metiers', railway: 'metiers', police: 'metiers',
        photographer: 'metiers', inventor: 'metiers', worker: 'metiers', artist: 'metiers', notary: 'notaires', inheritance: 'notaires'};

    /**
     * La table des sortes : les sites que le classeur range mal (24 corrigés à la main) ou pas du tout (5 sans sorte), et
     * quelques retouches d'une sorte en plus ou en moins (maquette, écran 0b). Clé = clé du site dans « Où chercher ? ».
     */
    const CATS = {
        // sans sorte : rangés à la main
        francearchives: ['actes', 'bibliotheques'], wikipedia: ['moteurs'], wikidata: ['moteurs'],
        so7_ap_paris: ['actes'], so7_enfants_fa: ['actes'],
        // mal rangés par les champs
        so3_nara: ['actes', 'emigration', 'militaire'], so3_bac_lac: ['actes', 'emigration', 'militaire'],
        arolsen: ['deportation'], so3_arolsen_fr: ['deportation'], so3_yv_justes: ['deportation'], so7_cfyv_justes: ['deportation'], yadvashem: ['deportation'],
        so2_annuaires_gallica: ['recensements', 'metiers'], so2_bottin_gallica: ['recensements', 'metiers'], so5_gallica_annuaires: ['recensements', 'metiers'],
        so8_census_ie: ['recensements'], so8_automatedgenealogy: ['recensements'], so3_freecen: ['recensements'], socface: ['recensements'], so3_paris_electeurs: ['recensements'],
        so8_glo_records: ['notaires'], so6_oldbailey: ['notaires'], so2_an_minutier: ['notaires'], so6_minutier: ['notaires'], so2_an_siv: ['notaires', 'bibliotheques'],
        // retouches : une sorte en plus ou en moins
        so4_digitalarkivet: ['actes', 'recensements'], so4_riksarkivet: ['actes'], so4_danishfamilysearch: ['actes', 'recensements'], so4_irishgenealogy: ['actes'], so4_portafontium: ['actes'], so4_hungaricana: ['actes', 'bibliotheques'],
        archiveorg: ['bibliotheques'], googlebooks: ['bibliotheques'], so_mdh_jmo: ['militaire'], so_matricules_ad: ['militaire'], so_mdh_mpf3945: ['militaire', 'deces'],
        so3_pares: ['actes', 'emigration'], europeana: ['journaux', 'bibliotheques'], so8_abmc: ['militaire', 'deces'], so7_compgen_ofb: ['arbres', 'actes'],
        so2_jo_gallica: ['journaux'], gallica: ['journaux', 'bibliotheques'], retronews: ['journaux'], so7_arcanum_adt: ['journaux', 'bibliotheques'],
        leonore: ['militaire', 'metiers'], so_leonore: ['militaire', 'metiers'], so5_sainte_helene: ['militaire'], so2_shd_officiers: ['militaire'], so3_polytechnique: ['militaire', 'metiers'],
        so5_memorial_gendarmes: ['militaire', 'deces', 'metiers'], so5_memorial_policiers: ['deces', 'metiers'], so5_memorial_cheminots: ['deces', 'metiers'],
        so7_monumentsmorts: ['militaire', 'deces'], so4_memorialgenweb: ['militaire', 'deces'], so4_memorialgenweb_commune: ['militaire', 'deces'], so4_victimes_civiles_3945: ['deces', 'deportation'],
        so2_shd_marins: ['militaire', 'marins'], so6_marins_shd: ['militaire', 'marins'], so_mdh_marins: ['militaire', 'marins'], so4_roles_equipage: ['marins'],
        so2_anom_ec: ['actes', 'marins'], so2_anom_fa: ['marins', 'actes'], so2_anom_bagnards: ['marins', 'notaires'], so8_ghcaraibe: ['marins', 'actes'], so8_anchoukaj: ['marins'],
        so5_consulaire_nantes: ['actes', 'emigration'], so2_an_naturalisation: ['emigration'], so5_fichier_origine: ['emigration', 'actes'], so5_cea_acadie: ['emigration', 'actes'],
        so3_antenati_nom: ['actes'], so3_geneteka: ['actes'], so3_openarchives: ['actes'], so3_torre_tombo: ['actes'], so3_freebmd: ['actes'], so3_banq: ['actes'],
        so2_be_arch: ['actes'], so2_ch_canton: ['actes'], so3_paris_ec: ['actes'],
        so4_geopatronyme: ['cartes'], so4_cassini: ['cartes'], so7_gov: ['cartes', 'guides'], so7_mapire: ['cartes'], so7_archivni_mapy: ['cartes'], so2_pop_merimee: ['cartes'], so2_pop_palissy: ['bibliotheques'],
        so7_fs_wiki: ['guides'], so7_genwiki: ['guides'], so5_geneawiki: ['guides'], so8_geneawiki_releves: ['guides', 'actes'], so7_ffg_annuaire: ['guides'], so7_cercle_dept: ['actes'], so8_geneabank: ['actes'],
        so5_fs_tree: ['arbres'], so5_fs_catalog: ['actes'], so5_pamyat_naroda: ['militaire'], so5_memorial_urss: ['deportation'], so3_cicr_pg: ['militaire'],
        so8_francais_libres: ['militaire'], so8_cgj: ['arbres', 'deportation'], so4_jewishgen: ['arbres', 'actes'], so4_huguenots: ['actes'], so7_archion: ['actes'],
        so8_famn_ch: ['cartes'], so8_tna_discovery: ['bibliotheques'], so7_ape: ['bibliotheques'], so7_ancestry_library: ['arbres', 'actes'], so3_joconde: ['bibliotheques'],
        so4_cimetieres_de_france: ['deces'], so4_geneanet_releves: ['deces'], matchid: ['deces'], findagrave: ['deces'], billiongraves: ['deces'], so4_morts_1870: ['militaire', 'deces'],
        so8_usgenweb: ['actes'], so8_stevemorse: ['emigration'], so5_maitron: ['metiers'], so5_anmt: ['metiers'], so3_cths: ['metiers', 'bibliotheques'], so3_inpi_brevets19: ['metiers'],
        so5_daguerre: ['metiers'], so5_portraitsepia: ['metiers'], so3_sycomore: ['metiers'], so3_senat_anciens: ['metiers'], so3_biusante_bio: ['metiers'], so3_biusante_theses: ['metiers', 'bibliotheques'],
    };

    /** le classeur : la sorte d'un site d'après ses champs actuels (pour un site qui n'est pas dans la table) */
    function classify(site, rule) {
        const s = site || {}, r = rule || {}, out = new Set();
        const g = fold(s.group), n = fold(`${s.label || ''} ${s.kind || ''}`);
        const where = [...(Array.isArray(s.where) ? s.where : []), ...(Array.isArray(s.on) ? s.on : [])].map(String);
        const profs = new Set(Array.isArray(r.profiles) ? r.profiles : []);
        const miss = Array.isArray(r.missing) ? r.missing : [];
        if (/moteurs de recherche/.test(g)) out.add('moteurs');
        if (/^genealogie$/.test(g)) out.add(/tombe|grave|cimet/.test(n) ? 'deces' : 'arbres');
        if (/notices d.autorite|^fr_bn|bibliothe/.test(g) || /bibliothe|livres|manuscrit|revues|textes|catalogue/.test(n)) out.add('bibliotheques');
        if (/presse|journa/.test(g) || /journa|presse|newspaper|zeitung|gazette/.test(n)) out.add('journaux');
        if (where.some(w => /^(militaire|military|recompense)$/.test(w)) || /^(mdh|matricules|guerres|fr_guerres)$/.test(g) || ['soldier', 'pow', 'mpf'].some(p => profs.has(p)) || Array.isArray(r.diedIn)) out.add('militaire');
        if (Array.isArray(r.diedIn) || /tombe|cimetiere|deces|sepultur|grave|monument/.test(n) || (miss.length === 1 && miss[0] === 'death')) out.add('deces');
        if (miss.includes('birth') || miss.includes('marriage') || /registre|etat civil|\bactes?\b|paroiss|bmd|naissance/.test(n)) out.add('actes');
        if (/recensement|census|annuaire|electorale|bottin/.test(n)) out.add('recensements');
        if (profs.has('sailor') || /maritime|marins?\b|equipage|colonies|outre mer|bagn/.test(n) || /^anom/.test(g)) out.add('marins');
        if (profs.has('emigrant') || /passager|emigr|immigr|arrivees|naturalisation/.test(n)) out.add('emigration');
        if (profs.has('notary') || profs.has('inheritance') || /notaire|minutier|proces|concessions/.test(n)) out.add('notaires');
        if (where.some(w => /^(employeur|medecin|elu|photo|inventeur|artiste)$/.test(w)) || ['elected', 'doctor', 'photographer', 'inventor', 'railway', 'police', 'worker', 'artist'].some(p => profs.has(p))) out.add('metiers');
        if (['deported', 'jewish', 'shot'].some(p => profs.has(p)) || /shoah|deport|repression|justes|persecution|fusill/.test(n)) out.add('deportation');
        if (/^aide$/.test(g) || /\bwiki\b|mode d.emploi/.test(n)) out.add('guides');
        if (/\bcartes?\b|cadastre|cassini|geopatronyme|lieux/.test(n)) out.add('cartes');
        if (out.has('deportation') && !['soldier', 'pow', 'mpf'].some(p => profs.has(p))) out.delete('militaire');
        return SORTS.map(x => x.id).filter(id => out.has(id));
    }
    const valid = list => (Array.isArray(list) ? list.map(String).filter(id => SORT[id]) : []);
    /** les sortes d'un site : le site (« Mes sites »), sa règle, la table, puis le classeur ; sinon « autres » */
    function catsOf(site) {
        if (!site) return ['autres'];
        if (site._cats) return site._cats;
        const C = core(), rule = C ? C.ruleOf(site) : null;
        const key = String(site.key || ''), alias = C?.ALIAS?.[key];
        let c = valid(site.cats);
        if (!c.length) c = valid(rule?.cats);
        if (!c.length) c = valid(CATS[key] || (alias && CATS[alias]) || (site.raw && CATS[site.raw]) || (/^ouc_ad_/.test(key) ? ['actes'] : null));
        if (!c.length) c = classify(site, rule);
        const out = c.length ? c : ['autres'];
        try { Object.defineProperty(site, '_cats', {value: out, enumerable: false, configurable: true}); } catch (_) {}
        return out;
    }

    /* ═════ pays et langue ═════ */
    /** les pays d'un site (codes) : ceux de sa règle, sinon ses champs ; [] = monde entier */
    function siteCountries(site) {
        const C = core(); if (!C) return [];
        const r = C.ruleOf(site) || {};
        const raw = r.countries?.length ? r.countries : [...(Array.isArray(site.countries) ? site.countries : []), site.country];
        return [...new Set(raw.map(c => (typeof c === 'string' && c.length === 2 && C.COUNTRY_NAME[c] ? c : C.canonCountry(c))).filter(c => c && c !== '*'))];
    }
    /** les pays où l'on parle français (le site d'un de ces pays a une page en français) */
    const FR_COUNTRIES = ['fr', 'be', 'ch', 'lu', 'ca', 're', 'gp', 'mq', 'gf', 'nc', 'dz', 'ma', 'tn', 'sn', 'mg'];
    /** la courte liste des grands sites du monde qui ont une page en français (décision 5) */
    const FR_PAGE = ['familysearch', 'so5_fs_tree', 'so5_fs_catalog', 'so5_fs_records', 'so7_fs_wiki', 'geneanet', 'myheritage', 'so6_myheritage', 'ancestry', 'so6_ancestry', 'so7_ancestry_library', 'geni', 'wikitree', 'so5_wikitree',
        'findagrave', 'billiongraves', 'google', 'bing', 'qwant', 'ecosia', 'duckduckgo', 'startpage', 'yahoo', 'wikipedia', 'wikidata', 'europeana', 'googlebooks', 'so7_ape', 'yadvashem', 'so3_yv_justes', 'so3_cicr_pg', 'so8_cwgc'];
    function inFrench(site) {
        const k = String(site?.key || ''), C = core();
        if (FR_PAGE.includes(k) || (C?.ALIAS?.[k] && FR_PAGE.includes(C.ALIAS[k]))) return true;
        const cs = siteCountries(site);
        // un site sans pays (« Chercher sur internet ») : français s'il est rangé dans une rubrique française
        if (!cs.length) return /^(fr_|france|mdh|matricules|an$|anom|annuaires|patrimoine|photo$)/.test(fold(site?.group)) || /\(bnf\)|gallica|france|francais|^ouc_ad_/.test(fold(`${site?.label} ${k}`));
        return cs.some(c => FR_COUNTRIES.includes(c));
    }

    /* ═════ les filtres ═════
     * f : {cats: [ids] (l'un OU l'autre), country: '' | 'ses' (pas de filtre) | code | 'monde', fr: bool, q: texte}
     * Le prix (« Gratuites seulement ») reste fait par le moteur (rank(…, {freeOnly})) : un payant caché n'est jamais compté. */
    const siteOf = row => row?.site || row;
    function keep(row, f = {}, {skipCats = false} = {}) {
        const s = siteOf(row);
        if (!skipCats && f.cats?.length && !catsOf(s).some(c => f.cats.includes(c))) return false;
        if (f.country && f.country !== 'ses') {
            const cs = siteCountries(s);
            if (f.country === 'monde' ? cs.length : !cs.includes(f.country)) return false;
        }
        if (f.fr && !inFrench(s)) return false;
        if (f.q) { const q = fold(f.q).split(' ').filter(Boolean), t = fold(`${s.label} ${s.host || ''} ${s.group || ''}`); if (!q.every(w => t.includes(w))) return false; }
        return true;
    }
    const applyFilters = (rows, f) => (rows || []).filter(r => keep(r, f));
    /** le nombre de sites de chaque sorte dans ces lignes, avec les autres filtres (pays, langue, recherche) */
    function counts(rows, f = {}) {
        const n = Object.fromEntries([...SORTS, OTHER].map(s => [s.id, 0]));
        (rows || []).forEach(r => { if (!keep(r, f, {skipCats: true})) return; catsOf(siteOf(r)).forEach(c => { n[c] = (n[c] || 0) + 1; }); });
        return n;
    }
    /** les tris : utiles (le moteur), A → Z, gratuits d'abord */
    function sortRows(rows, how) {
        const l = [...(rows || [])];
        if (how === 'az') return l.sort((a, b) => String(siteOf(a).label).localeCompare(String(siteOf(b).label), 'fr', {sensitivity: 'base'}));
        if (how === 'free') { const w = x => ({paid: 2, library: 1.5, partly: 1}[x.paid] || 0); return l.sort((a, b) => w(a) - w(b)); }
        return l;
    }

    /* ═════ les écartés, rangés par raison ═════ */
    const OUT_KINDS = [
        {id: 'country', re: /^pas de lieu|^no place|pays/i, label: 'Pas de lieu dans ce pays'},
        {id: 'years', re: /années|ann[ée]es|hors des|pas pendant une guerre|pas dans les/i, label: 'Hors de ses années'},
        {id: 'profile', re: /^seulement/i, label: 'Seulement pour un autre cas (métier, profil)'},
        {id: 'sex', re: /^pour les (hommes|femmes)/i, label: 'Pour l’autre sexe'},
        {id: 'birthplace', re: /hors de France/i, label: 'Né hors de France'},
        {id: 'low', re: /peu utile/i, label: 'Peu utile pour cette fiche'},
    ];
    /** out : [{site, why, kind?}] (le moteur dit « why » en français ; kind, s'il est donné, passe devant) */
    function outKind(o) {
        if (o.kind) return o.kind;
        const w = String(o.why || '');
        return (OUT_KINDS.find(k => k.re.test(w)) || {id: 'other'}).id;
    }
    function outGroups(out) {
        const groups = new Map();
        (out || []).forEach(o => { const k = outKind(o); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); });
        const order = [...OUT_KINDS.map(k => k.id), 'other'];
        return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([id, rows]) => ({id, label: (OUT_KINDS.find(k => k.id === id) || {label: 'Autres raisons'}).label, rows}));
    }

    /* ═════ les raccourcis de la fiche ═════ */
    /** list : les propositions (rank().list) → [{id, icon, short, n, profile}] : la sorte de son profil d'abord, puis les plus fournies */
    function shortcuts(ctx, list, max = 99) {
        const n = counts(list);
        const prof = [...(ctx?.profiles || [])].map(p => PROFILE_SORT[p]).filter(Boolean);
        const ids = SORTS.filter(s => !s.rare && n[s.id] > 0).map(s => s.id);
        ids.sort((a, b) => (prof.includes(b) ? 1 : 0) - (prof.includes(a) ? 1 : 0) || n[b] - n[a] || SORTS.findIndex(s => s.id === a) - SORTS.findIndex(s => s.id === b));
        return ids.slice(0, max).map(id => ({...SORT[id], n: n[id], profile: prof.includes(id)}));
    }

    return {SORTS, SORT, OTHER, CATS, PROFILE_SORT, FR_PAGE, FR_COUNTRIES, classify, catsOf, siteCountries, inFrench, keep, applyFilters, counts, sortRows, outKind, outGroups, shortcuts, fold};
});
