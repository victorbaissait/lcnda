/* LCNDA — 🌍 « Où chercher ? » : le moteur de pertinence. Calculs purs, SANS RÉSEAU (window.LCNDA_OU_CHERCHER ; aussi require()
 * dans Node pour les tests).
 *
 * Il ne connaît AUCUNE adresse de site : il reçoit la liste des sites de « Chercher sur internet » telle qu'elle est au moment
 * de l'appel (app.js, les lots « sources ouvertes », « Mes sites »), lue par heritage-ou-chercher.js, et range ces sites pour
 * une personne d'après ce que la base dit d'elle (lib/ou_chercher.php, GET ou_chercher_person) :
 *   pays / département des lieux de sa vie, époque (naissance, décès), événements et profils (soldat, marin, émigré, notaire
 *   ou héritage, déporté…), ce qui manque (naissance, décès, parents, mariage), ce qui a déjà été cherché.
 * Chaque proposition dit POURQUOI (« Né en 1890 en Corrèze : il a sans doute fait la guerre de 14 »).
 *
 * Règles de pertinence d'un site (toutes facultatives) — dans RULES (par clé de site), ou écrites par un lot dans la définition
 * de ses sites (champ `rel`, ou les champs qu'ils ont déjà : country / countries, years, where / on, place, region, paid) :
 *   {countries: ['fr', 'it'…]   pays où la personne doit avoir vécu (codes ou noms : « Italie », « États-Unis »…)
 *    from, to                   années couvertes par le site (sa vie doit les croiser)
 *    born: [a, b]               années de naissance qui comptent (soldats de 14-18 : 1865-1901)
 *    sex: 'male' | 'female'
 *    profiles: ['soldier'…]     profils qui le rendent utile (voir PROFILES) ; require: ['profile'] = seulement pour eux
 *    events: ['EMIG'…]          événements (balises GEDCOM) qui le rendent utile
 *    missing: ['birth'…]        ce qui manque et qu'il aide à trouver (birth, death, parents, father, mother, marriage)
 *    base: 0..3                 utilité générale (moteur de recherche 0, grand site de généalogie 2)
 *    why: (ctx) => 'phrase'     la phrase qui dit pourquoi (sinon elle est écrite d'après la règle)
 *    paid: true | 'partiel' | 'bibliotheque'}
 *  - context(brut)                 → ce qu'on garde de la personne (années, pays, départements, profils, manques…)
 *  - score(site, ctx)              → {score, reasons: [phrases], out: raison de l'écarter | ''}
 *  - rank(sites, ctx, {freeOnly, searched}) → {list: propositions rangées, searched: déjà cherchées, hidden: payantes cachées}
 *  - addRules({clé: règle}) : un lot ajouté plus tard peut écrire ses règles ici, sans toucher ce fichier
 *  - canonCountry(texte), isPaid(site), bornText(ctx), PROFILES, MISSING
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_OU_CHERCHER = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
    const NOW = new Date().getFullYear();

    /* ═════ pays : un code pour chaque façon de l'écrire ═════ */
    const COUNTRY_WORDS = {
        fr: ['france', 'fra', 'fr', 'republique francaise', 'empire francais', 'royaume de france'],
        it: ['italie', 'italia', 'italy', 'it', 'ita', 'sardaigne', 'piemont', 'savoie italienne', 'sicile', 'naples', 'toscane'],
        es: ['espagne', 'espana', 'spain', 'es', 'esp', 'catalogne'], pt: ['portugal', 'pt', 'prt'],
        de: ['allemagne', 'deutschland', 'germany', 'de', 'deu', 'prusse', 'baviere', 'saxe', 'wurtemberg', 'hesse', 'rfa', 'rda'],
        be: ['belgique', 'belgie', 'belgium', 'be', 'bel'], ch: ['suisse', 'schweiz', 'svizzera', 'switzerland', 'ch', 'che'], lu: ['luxembourg', 'lu', 'lux'],
        nl: ['pays bas', 'nederland', 'netherlands', 'hollande', 'nl', 'nld', 'flandre neerlandaise'],
        gb: ['royaume uni', 'angleterre', 'ecosse', 'pays de galles', 'uk', 'united kingdom', 'england', 'scotland', 'wales', 'grande bretagne', 'gb', 'gbr'],
        ie: ['irlande', 'ireland', 'eire', 'ie', 'irl'],
        us: ['etats unis', 'etats unis d amerique', 'usa', 'u s a', 'united states', 'united states of america', 'us', 'amerique du nord', 'new york', 'louisiane', 'californie'],
        ca: ['canada', 'quebec', 'acadie', 'nouvelle france', 'ca', 'can'], pl: ['pologne', 'polska', 'poland', 'pl', 'pol'],
        ru: ['russie', 'urss', 'russia', 'union sovietique', 'ru', 'rus'], ua: ['ukraine'], no: ['norvege', 'norge', 'norway', 'no'], se: ['suede', 'sverige', 'sweden', 'se'],
        dk: ['danemark', 'danmark', 'denmark', 'dk'], fi: ['finlande', 'suomi', 'finland', 'fi'], cz: ['tchequie', 'republique tcheque', 'boheme', 'moravie', 'czechia', 'cz', 'tchecoslovaquie'],
        sk: ['slovaquie'], at: ['autriche', 'osterreich', 'austria', 'at', 'autriche hongrie'], hu: ['hongrie', 'magyarorszag', 'hungary', 'hu'],
        dz: ['algerie', 'algeria', 'dz'], ma: ['maroc', 'morocco'], tn: ['tunisie', 'tunisia'], sn: ['senegal'], vn: ['indochine', 'vietnam', 'viet nam', 'cochinchine', 'tonkin', 'annam'],
        nc: ['nouvelle caledonie'], gf: ['guyane'], re: ['la reunion', 'ile bourbon'], gp: ['guadeloupe'], mq: ['martinique'], mg: ['madagascar'],
        au: ['australie', 'australia'], nz: ['nouvelle zelande', 'new zealand'], ar: ['argentine', 'argentina'], br: ['bresil', 'brasil', 'brazil'], il: ['israel'], lt: ['lituanie'], lv: ['lettonie'], ro: ['roumanie'],
    };
    const COUNTRY_NAME = {fr: 'France', it: 'Italie', es: 'Espagne', pt: 'Portugal', de: 'Allemagne', be: 'Belgique', ch: 'Suisse', lu: 'Luxembourg', nl: 'Pays-Bas', gb: 'Royaume-Uni', ie: 'Irlande',
        us: 'États-Unis', ca: 'Canada', pl: 'Pologne', ru: 'Russie', ua: 'Ukraine', no: 'Norvège', se: 'Suède', dk: 'Danemark', fi: 'Finlande', cz: 'Tchéquie', sk: 'Slovaquie', at: 'Autriche', hu: 'Hongrie',
        dz: 'Algérie', ma: 'Maroc', tn: 'Tunisie', sn: 'Sénégal', vn: 'Indochine', nc: 'Nouvelle-Calédonie', gf: 'Guyane', re: 'La Réunion', gp: 'Guadeloupe', mq: 'Martinique', mg: 'Madagascar',
        au: 'Australie', nz: 'Nouvelle-Zélande', ar: 'Argentine', br: 'Brésil', il: 'Israël', lt: 'Lituanie', lv: 'Lettonie', ro: 'Roumanie'};
    const WORD_TO_CODE = new Map();
    Object.entries(COUNTRY_WORDS).forEach(([c, ws]) => ws.forEach(w => WORD_TO_CODE.set(w, c)));
    const WORLD = /^(international|monde|world|europe.*|tous pays|partout)$/;
    /** « Italie », « ITALIA », « Torino, Piemonte, Italia » → 'it' ; « International » → '*' ; inconnu → '' */
    function canonCountry(t) {
        const f = fold(t); if (!f) return '';
        if (WORLD.test(f)) return '*';
        if (/^[a-z]{2}$/.test(f) && COUNTRY_NAME[f]) return f;
        if (WORD_TO_CODE.has(f)) return WORD_TO_CODE.get(f);
        const parts = f.split(/\s*[,;/()]\s*/).filter(Boolean).reverse();
        for (const p of parts) if (WORD_TO_CODE.has(p)) return WORD_TO_CODE.get(p);
        for (const [w, c] of WORD_TO_CODE) if (w.length > 4 && f.includes(w)) return c;
        return '';
    }
    const C_NAME = c => COUNTRY_NAME[c] || c;
    const deOf = w => (/^[aeiouyhàâéèêîôû]/i.test(w) ? `d’${w}` : `de ${w}`);
    const OVERSEAS = ['dz', 'ma', 'tn', 'sn', 'vn', 'nc', 'gf', 're', 'gp', 'mq', 'mg'];

    /* ═════ profils (ce que la fiche dit de sa vie) et manques ═════ */
    const PROFILES = {soldier: ['🎖', 'soldat'], mpf: ['🎖', 'mort pour la France'], pow: ['✚', 'prisonnier de guerre'], sailor: ['⚓', 'marin'], emigrant: ['🚢', 'émigré'], notary: ['✒', 'notaire'],
        inheritance: ['⚖️', 'héritage, testament'], deported: ['🕯', 'déporté'], shot: ['🕯', 'fusillé'], resistant: ['🕯', 'résistant'], placed: ['👶', 'enfant placé'], noble: ['🛡', 'noblesse'],
        protestant: ['✝', 'protestant'], jewish: ['✡', 'famille juive'], railway: ['🚂', 'cheminot'], police: ['👮', 'gendarme, policier'], elected: ['🏛', 'élu'], doctor: ['⚕', 'médecin'],
        photographer: ['📷', 'photographe'], clergy: ['⛪', 'religieux'], worker: ['🏭', 'ouvrier'], inventor: ['💡', 'inventeur, savant'], artist: ['🎨', 'artiste']};
    const MISSING = {birth: 'naissance inconnue', death: 'décès inconnu', parents: 'parents inconnus', father: 'père inconnu', mother: 'mère inconnue', marriage: 'mariage inconnu'};
    // les « endroits » des lots (where / on) → un profil
    const WHERE_PROFILE = {militaire: 'soldier', emigration: 'emigrant', voyage: 'emigrant', inventeur: 'inventor', medecin: 'doctor', elu: 'elected', placement: 'placed', employeur: 'worker',
        photo: 'photographer', artiste: 'artist', recompense: 'soldier', marin: 'sailor', notaire: 'notary', deportation: 'deported'};
    const GENERIC_WHERE = ['fiche', 'person', 'lieu', 'carte', 'departement'];

    /* ═════ ce qu'on garde de la personne ═════ */
    function context(raw = {}) {
        const p = raw.person || {}, events = Array.isArray(raw.events) ? raw.events : [];
        const female = p.gender === 'female', male = p.gender === 'male';
        const ev = tags => events.find(e => tags.includes(e.tag) && e.year);
        const birth = ev(['BIRT']) || ev(['CHR', 'BAPM']), death = ev(['DEAT']) || ev(['BURI', 'CREM']);
        let by = Number(p.birth_year || birth?.year) || 0, dy = Number(p.death_year || death?.year) || 0, estimated = false;
        const years = events.map(e => Number(e.year) || 0).filter(Boolean);
        if (!by && years.length) { by = Math.min(...years) - (events.some(e => e.tag === 'MARR' && Number(e.year) === Math.min(...years)) ? 25 : 30); estimated = true; }
        if (!dy && by) { dy = Math.min(NOW, Math.max(by + 75, years.length ? Math.max(...years) : 0)); if (p.living !== 'living') estimated = true; }
        if (p.living === 'living') dy = NOW;
        const countries = new Map(), depts = new Map(), places = [];
        events.forEach(e => {
            let c = canonCountry(e.country) || canonCountry(e.place);
            if (!c && e.dept?.code) c = 'fr';
            if (c && c !== '*') { const y = Number(e.year) || 0; const cur = countries.get(c) || {from: 0, to: 0, n: 0}; if (y) { cur.from = cur.from ? Math.min(cur.from, y) : y; cur.to = Math.max(cur.to, y); } cur.n++; countries.set(c, cur); }
            if (e.dept?.code && !depts.has(e.dept.code)) depts.set(e.dept.code, {...e.dept, place: String(e.place || '').split(',')[0].trim(), year: Number(e.year) || 0, tag: e.tag});
            const town = String(e.place || '').split(',')[0].trim(); if (town && !places.includes(town)) places.push(town);
        });
        const birthDept = birth?.dept || null, birthPlace = String(birth?.place || '').split(',')[0].trim();
        return {id: Number(p.id) || 0, name: p.name || [p.first, p.last].filter(Boolean).join(' '), first: p.first || '', last: p.last || '', female, male,
            by, dy, estimated, birthKnown: !!birth, deathKnown: !!death, birthPlace, birthDept, birthCountry: canonCountry(birth?.country) || (birthDept ? 'fr' : ''),
            countries, depts: [...depts.values()], places, tags: new Set(events.map(e => e.tag).filter(Boolean)),
            profiles: new Set(Array.isArray(raw.profiles) ? raw.profiles : []), missing: new Set(Array.isArray(raw.missing) ? raw.missing : []),
            searched: raw.searched && typeof raw.searched === 'object' ? raw.searched : {}, sosa: Number(p.sosa) || 0, living: p.living || '', private: !!p.private};
    }
    const alive = (ctx, a, b) => ctx.by && ctx.dy ? ctx.dy >= a && ctx.by <= b : null; // null : on ne sait pas
    const ne = ctx => (ctx.female ? 'Née' : 'Né');
    const il = ctx => (ctx.female ? 'elle' : 'il');
    const deptText = d => (d ? (/^[aeiouyhé]/i.test(d.name) ? `dans l’${d.name}` : `en ${d.name}`) : '');
    /** « Né en 1890 en Corrèze » (ce qu'on sait de la naissance) */
    function bornText(ctx) {
        if (!ctx.by) return '';
        const where = ctx.birthDept ? ` ${deptText(ctx.birthDept)}` : ctx.birthPlace ? ` à ${ctx.birthPlace}` : '';
        return `${ne(ctx)} ${ctx.estimated && !ctx.birthKnown ? 'vers' : 'en'} ${ctx.by}${where}`;
    }
    const lifeText = ctx => (ctx.by ? `${ctx.estimated && !ctx.birthKnown ? 'vers ' : ''}${ctx.by}–${ctx.deathKnown ? ctx.dy : '?'}` : '');
    const countryIn = (ctx, c) => { const n = COUNTRY_NAME[c] || c; return ['Algérie', 'Indochine', 'Italie', 'Espagne', 'Allemagne', 'Irlande', 'Australie', 'Argentine', 'Autriche', 'Ukraine', 'Écosse'].includes(n) ? `en ${n}` : /^[AEIOUÉ]/.test(n) ? `en ${n}` : n === 'États-Unis' || n === 'Pays-Bas' ? `aux ${n}` : `en ${n}`; };

    /* ═════ les règles des sites qu'on connaît (clés de « Chercher sur internet » et des lots) ═════ */
    const S = (o) => o;
    const war14 = ctx => (ctx.profiles.has('soldier') || ctx.profiles.has('mpf') ? `${bornText(ctx)} : ${il(ctx)} a fait la guerre de 14` : `${bornText(ctx)} : ${il(ctx)} a sans doute fait la guerre de 14`);
    const war39 = ctx => `${bornText(ctx)} : ${il(ctx)} avait l’âge d’être mobilisé en 1939-1945`;
    const RULES = {
        // moteurs de recherche : jamais en tête
        google: S({base: 0.5}), bing: S({base: 0.1}), duckduckgo: S({base: 0.2}), qwant: S({base: 0.2}), ecosia: S({base: 0}), brave: S({base: 0}), startpage: S({base: 0}), yahoo: S({base: 0}), yandex: S({base: 0}), baidu: S({base: 0}), mojeek: S({base: 0}),
        // grands sites de généalogie
        geneanet: S({base: 2.2, missing: ['birth', 'parents', 'father', 'mother', 'marriage', 'death'], why: ctx => ctx.countries.has('fr') ? 'Les arbres et relevés des généalogistes français : quelqu’un a peut-être déjà trouvé ses parents' : 'Des millions d’arbres et de relevés : quelqu’un a peut-être déjà cherché'}),
        familysearch: S({base: 2, missing: ['birth', 'parents', 'father', 'mother', 'marriage', 'death'], why: ctx => [...ctx.countries.keys()].some(c => c !== 'fr') ? `Actes indexés du monde entier, gratuits (${[...ctx.countries.keys()].filter(c => c !== 'fr').map(c => COUNTRY_NAME[c] || c).join(', ')})` : 'Actes indexés gratuits (un compte gratuit est demandé)'}),
        so5_fs_records: S({base: 1.6, missing: ['birth', 'parents', 'marriage', 'death']}),
        so5_fs_catalog: S({base: 1, missing: ['birth', 'parents', 'father', 'mother', 'marriage'], why: ctx => `Les registres filmés ${ctx.places[0] ? deOf(ctx.places[0]) : 'de ses communes'} (catalogue FamilySearch)`}),
        wikitree: S({base: 0.8}), geni: S({base: 0.6}), filae: S({base: 1.2, countries: ['fr'], paid: true}), myheritage: S({base: 1, paid: true}), ancestry: S({base: 1, paid: true}), findmypast: S({base: 0.6, countries: ['gb', 'ie', 'us'], paid: true}),
        // décès
        matchid: S({countries: ['fr'], from: 1970, to: NOW, missing: ['death'], base: 1, why: ctx => (ctx.deathKnown ? `Décès en ${ctx.dy} : le fichier des décès de l’INSEE (depuis 1970)` : `${bornText(ctx)} : ${ctx.female ? 'si elle est morte' : 's’il est mort'} après 1970, son décès est dans le fichier de l’INSEE`)}),
        findagrave: S({base: 0.6, missing: ['death'], why: () => 'Tombes photographiées par des bénévoles'}), billiongraves: S({base: 0.4, missing: ['death']}),
        // militaires
        memoiredeshommes: S({countries: ['fr'], born: [1865, 1901], sex: 'male', profiles: ['soldier', 'mpf', 'pow'], base: 1.2, why: war14}),
        so_mdh_mpf1418: S({countries: ['fr'], born: [1865, 1901], sex: 'male', profiles: ['soldier', 'mpf'], base: 1, why: war14}),
        so_mdh_mpf3945: S({countries: ['fr'], born: [1890, 1927], sex: 'male', profiles: ['soldier', 'mpf', 'resistant', 'deported'], base: 0.6, why: war39}),
        so_mdh_sepultures: S({countries: ['fr'], born: [1865, 1927], sex: 'male', profiles: ['soldier', 'mpf'], missing: ['death'], base: 0.4}),
        so_mdh_hors_mpf: S({countries: ['fr'], born: [1850, 1927], sex: 'male', profiles: ['soldier'], require: ['profile'], base: 0.4}),
        so_mdh_marins: S({countries: ['fr'], born: [1850, 1927], profiles: ['sailor'], require: ['profile'], base: 0.5}),
        so_mdh_jmo: S({countries: ['fr'], born: [1865, 1901], sex: 'male', profiles: ['soldier'], require: ['profile'], base: 0.5, why: () => 'Le journal de marche de son régiment : où il était, jour après jour'}),
        so_matricules_ad: S({countries: ['fr'], born: [1847, 1921], sex: 'male', base: 0.9, profiles: ['soldier'], why: ctx => `${bornText(ctx)} : sa fiche matricule (classe ${ctx.by + 20}) dit sa taille, son métier, ses adresses et ses parents`}),
        so_francearchives_noms: S({countries: ['fr'], born: [1847, 1921], sex: 'male', base: 1}),
        so_grand_memorial: S({countries: ['fr'], born: [1847, 1921], sex: 'male', base: 0.5}),
        so3_cicr_pg: S({born: [1860, 1902], sex: 'male', profiles: ['pow', 'soldier'], base: 0.3}),
        leonore: S({countries: ['fr'], profiles: ['soldier', 'elected', 'doctor', 'inventor', 'artist'], base: 0.5, to: 1977, why: () => 'Les dossiers de la Légion d’honneur (morts avant 1977)'}),
        so_leonore: S({countries: ['fr'], profiles: ['soldier', 'elected'], base: 0.3, to: 1977}),
        so5_sainte_helene: S({countries: ['fr'], born: [1765, 1800], sex: 'male', profiles: ['soldier'], base: 0.5, why: ctx => `${bornText(ctx)} : un soldat de Napoléon a peut-être reçu la médaille de Sainte-Hélène`}),
        so4_morts_1870: S({countries: ['fr'], born: [1835, 1853], sex: 'male', base: 0.6, why: ctx => `${bornText(ctx)} : ${il(ctx)} avait l’âge de faire la guerre de 1870`}),
        so4_memorialgenweb: S({countries: ['fr'], born: [1840, 1927], sex: 'male', profiles: ['soldier', 'mpf'], base: 0.4}),
        so2_shd_officiers: S({countries: ['fr'], profiles: ['soldier'], require: ['profile'], base: 0.4}),
        // gens de mer
        so2_shd_marins: S({countries: ['fr'], profiles: ['sailor'], require: ['profile'], base: 1, why: () => 'Un marin : l’inscription maritime suit chaque embarquement'}),
        so6_marins_shd: S({countries: ['fr'], profiles: ['sailor'], require: ['profile'], base: 1, why: () => 'Un marin : l’inscription maritime de son port (quartier maritime)'}),
        so4_roles_equipage: S({countries: ['fr'], profiles: ['sailor'], require: ['profile'], base: 0.8}),
        // émigration
        so2_ellis: S({profiles: ['emigrant'], events: ['EMIG', 'IMMI', 'NATU'], countries: ['us'], from: 1892, to: 1924, base: 0.5, why: ctx => (ctx.profiles.has('emigrant') ? `Parti${ctx.female ? 'e' : ''} en Amérique : les listes de passagers d’Ellis Island (1892-1924)` : `${ctx.female ? 'Elle a vécu' : 'Il a vécu'} aux États-Unis : les arrivées à Ellis Island (1892-1924)`)}),
        so5_castle_garden: S({profiles: ['emigrant'], events: ['EMIG', 'IMMI', 'NATU'], countries: ['us'], from: 1820, to: 1892, base: 0.5, why: () => 'Arrivées à New York avant Ellis Island (1820-1892)'}),
        so2_an_naturalisation: S({profiles: ['emigrant'], events: ['NATU', 'IMMI'], countries: ['fr'], from: 1883, to: 1930, base: 0.3, why: () => 'Venu d’ailleurs : les décrets de naturalisation (1883-1930)'}),
        so5_fichier_origine: S({countries: ['ca'], profiles: ['emigrant'], base: 0.5}), so5_cea_acadie: S({countries: ['ca'], base: 0.5}),
        // notaires et héritages
        so2_an_minutier: S({profiles: ['notary', 'inheritance'], events: ['WILL', 'PROB', 'DEED', 'MARC'], place: /\bparis\b/, missing: ['marriage'], base: 0.3, why: ctx => (ctx.places.some(x => /paris/i.test(x)) ? 'Il a vécu à Paris : les actes de ses notaires (contrats de mariage, inventaires, testaments)' : 'Un héritage, un testament : le Minutier central des notaires de Paris')}),
        so6_minutier: S({profiles: ['notary', 'inheritance'], events: ['WILL', 'PROB', 'DEED', 'MARC'], place: /\bparis\b/, base: 0.3}),
        so2_an_siv: S({profiles: ['notary', 'inheritance'], base: 0.2}),
        // déportation, répression : ton sobre
        yadvashem: S({profiles: ['deported', 'jewish'], require: ['profile'], from: 1933, to: 1945, base: 0.3, why: () => 'Sa fiche dit une déportation : les noms des victimes de la Shoah'}),
        arolsen: S({profiles: ['deported', 'pow', 'resistant'], require: ['profile'], from: 1933, to: 1950, base: 0.3, why: () => 'Les archives des persécutions nazies (déportés, travailleurs forcés, personnes déplacées)'}),
        so2_shoah_memorial: S({profiles: ['deported', 'jewish'], require: ['profile'], from: 1939, to: 1945, countries: ['fr'], base: 0.3, why: () => 'Le Mémorial de la Shoah : les noms des déportés de France'}),
        so2_fmd_livre: S({profiles: ['deported', 'resistant'], require: ['profile'], from: 1939, to: 1945, countries: ['fr'], base: 0.3, why: () => 'Le livre-mémorial des déportés de France'}),
        so2_maitron_fusilles: S({profiles: ['shot', 'resistant'], require: ['profile'], from: 1939, to: 1945, countries: ['fr'], base: 0.3, why: () => 'Le Maitron des fusillés et exécutés (1940-1944)'}),
        so7_cfyv_justes: S({profiles: ['resistant'], require: ['profile'], from: 1939, to: 1945, countries: ['fr'], base: 0.1}),
        // enfants placés, colonies, protestants, Paris
        so7_ap_paris: S({profiles: ['placed'], require: ['profile'], place: /\bparis\b/, base: 0.6}), so7_enfants_fa: S({profiles: ['placed'], require: ['profile'], base: 0.6}),
        so2_anom_ec: S({countries: OVERSEAS, base: 1.5, why: ctx => `${ctx.female ? 'Elle a vécu' : 'Il a vécu'} ${countryIn(ctx, [...ctx.countries.keys()].find(c => OVERSEAS.includes(c)))} : l’état civil des anciennes colonies (ANOM)`}),
        so2_anom_bagnards: S({countries: ['gf', 'nc'], base: 0.2}),
        so4_huguenots: S({profiles: ['protestant'], require: ['profile'], base: 0.8, why: () => 'Une famille protestante : les registres des réfugiés huguenots'}),
        so3_paris_ec: S({place: /\bparis\b/, missing: ['birth', 'marriage', 'death', 'parents'], base: 0.6, why: () => 'Il a vécu à Paris : l’état civil reconstitué (avant 1860)'}),
        // métiers
        so5_memorial_cheminots: S({profiles: ['railway'], require: ['profile'], base: 0.6}), so5_memorial_gendarmes: S({profiles: ['police'], require: ['profile'], base: 0.6}), so5_memorial_policiers: S({profiles: ['police'], require: ['profile'], base: 0.6}),
        so5_maitron: S({profiles: ['worker', 'railway', 'elected', 'resistant'], base: 0.2}), so5_anmt: S({profiles: ['worker', 'railway'], base: 0.2}),
        so3_sycomore: S({profiles: ['elected'], require: ['profile'], base: 0.6}), so3_senat_anciens: S({profiles: ['elected'], require: ['profile'], base: 0.5}),
        so3_biusante_bio: S({profiles: ['doctor'], require: ['profile'], base: 0.6}), so3_biusante_theses: S({profiles: ['doctor'], require: ['profile'], base: 0.5}),
        so5_daguerre: S({profiles: ['photographer'], require: ['profile'], base: 0.6}), so5_portraitsepia: S({profiles: ['photographer'], require: ['profile'], base: 0.5}),
        // recensements et presse
        socface: S({countries: ['fr'], from: 1836, to: 1936, base: 1.3, why: ctx => `${ctx.female ? 'Elle a vécu' : 'Il a vécu'} en France entre 1836 et 1936 : les recensements nominatifs (SocFace)`}),
        gallica: S({base: 0.8, countries: ['fr'], to: 1950}), retronews: S({base: 0.6, countries: ['fr'], from: 1780, to: 1950, paid: 'partiel'}), francearchives: S({base: 0.7, countries: ['fr']}),
        chroniclingamerica: S({countries: ['us'], to: 1963, base: 0.5}), trove: S({countries: ['au'], base: 0.5}), delpher: S({countries: ['nl'], base: 0.5}), anno: S({countries: ['at'], base: 0.5}),
        so4_trove: S({countries: ['au'], base: 0.5}), so4_paperspast: S({countries: ['nz'], base: 0.5}), so4_delpher: S({countries: ['nl'], base: 0.5}), so4_chroniclingamerica: S({countries: ['us'], base: 0.5}),
        newspapers: S({countries: ['us'], base: 0.4, paid: true}),
        // pays : l'état civil et les registres
        so3_antenati_nom: S({countries: ['it'], missing: ['birth', 'parents', 'father', 'mother', 'marriage', 'death'], base: 2, why: ctx => `${ctx.female ? 'Elle a vécu' : 'Il a vécu'} en Italie : l’état civil italien numérisé (Antenati)`}),
        so3_pares: S({countries: ['es'], base: 1.2}), so3_torre_tombo: S({countries: ['pt'], base: 1.2}), so3_geneteka: S({countries: ['pl'], base: 1.5}), so3_openarchives: S({countries: ['nl', 'be'], base: 1.5}),
        so3_freebmd: S({countries: ['gb'], from: 1837, to: 1990, base: 1.5}), so3_freecen: S({countries: ['gb'], from: 1841, to: 1911, base: 1}), so3_banq: S({countries: ['ca'], base: 1.5}), so3_bac_lac: S({countries: ['ca'], base: 1}), so3_nara: S({countries: ['us'], base: 1}),
        so2_be_arch: S({countries: ['be'], base: 1.5}), so2_ch_canton: S({countries: ['ch'], base: 1.5}),
        so4_matricula: S({countries: ['de', 'at', 'pl'], base: 1.2}), so4_digitalarkivet: S({countries: ['no'], base: 1.5}), so4_riksarkivet: S({countries: ['se'], base: 1.5}), so4_danishfamilysearch: S({countries: ['dk'], base: 1.5}),
        so4_irishgenealogy: S({countries: ['ie'], base: 1.5}), so4_portafontium: S({countries: ['cz', 'de'], base: 1}), so4_hungaricana: S({countries: ['hu'], base: 1}), so4_jewishgen: S({profiles: ['jewish'], require: ['profile'], base: 0.8}),
        so6_hiski: S({countries: ['fi'], base: 1.5}), so6_scotlandspeople: S({countries: ['gb'], base: 0.8, paid: true}), so6_oldbailey: S({countries: ['gb'], from: 1674, to: 1913, base: 0.2}),
        so7_ape: S({countries: ['de', 'it', 'es', 'be', 'nl', 'pl', 'cz', 'at', 'hu', 'pt', 'ch', 'lu', 'dk', 'se', 'no', 'fi', 'ie', 'gb'], base: 0.8}),
        so7_compgen_ofb: S({countries: ['de'], base: 1}), so7_archion: S({countries: ['de'], profiles: ['protestant'], base: 0.8, paid: true}), so7_archivni_mapy: S({countries: ['cz'], base: 0.5}), so7_mapire: S({countries: ['at', 'hu', 'cz'], base: 0.4}),
        so7_cercle_dept: S({countries: ['fr'], missing: ['birth', 'parents', 'father', 'mother', 'marriage', 'death'], base: 1.4, why: ctx => `Les bénévoles du cercle généalogique ${ctx.depts[0] ? deptText(ctx.depts[0]).replace(/^en |^dans l’/, 'de ') : 'du département'} relèvent les actes de leurs communes`}),
        so7_fs_wiki: S({base: 0.5, why: () => 'Le mode d’emploi des archives du pays ou de la région (FamilySearch Wiki)'}),
        so5_geneawiki: S({countries: ['fr'], base: 0.4}), so4_geopatronyme: S({countries: ['fr'], missing: ['parents', 'father', 'mother'], base: 0.4, why: ctx => `Où vivaient les ${ctx.last || 'gens de ce nom'} entre 1891 et 1990 : pour trouver d’où vient la famille`}),
        so4_cassini: S({countries: ['fr'], base: 0.1}), so4_geneanet_releves: S({countries: ['fr'], missing: ['death'], base: 0.6}), so4_cimetieres_de_france: S({countries: ['fr'], missing: ['death'], base: 0.5}),
        so3_cths: S({profiles: ['inventor', 'artist', 'doctor', 'elected'], base: 0.2}), so3_polytechnique: S({profiles: ['inventor', 'soldier'], require: ['profile'], born: [1775, 1925], sex: 'male', base: 0.1}),
    };
    // les mêmes règles sous l'autre forme de clé (lot 1 : « memoiredeshommes » de l'app = « so_… » du lot)
    const ALIAS = {so_gallica: 'gallica', so_retronews: 'retronews', so_europeana: 'europeana', so6_ancestry: 'ancestry', so6_myheritage: 'myheritage', so6_filae: 'filae', so5_wikitree: 'wikitree'};
    function addRules(map) { if (map && typeof map === 'object') Object.entries(map).forEach(([k, r]) => { if (r && typeof r === 'object') RULES[String(k)] = {...(RULES[k] || {}), ...r}; }); return RULES; }

    /* ═════ payant ? ═════ */
    function isPaid(site) {
        const r = ruleOf(site);
        const v = site?.paid ?? r?.paid;
        if (v === true || v === 'oui') return 'paid';
        if (v === 'partiel' || v === 'partly') return 'partly';
        if (v === 'bibliotheque') return 'library';
        return '';
    }
    function ruleOf(site) {
        if (!site) return null;
        const k = String(site.key || '');
        const own = site.rel && typeof site.rel === 'object' ? site.rel : null;
        const r = RULES[k] || RULES[ALIAS[k]] || (site.raw ? RULES[site.raw] : null) || (site.existing ? RULES[site.existing] : null) || null;
        return own ? {...(r || {}), ...own} : r;
    }

    /* ═════ la note d'un site pour une personne ═════ */
    function score(site, ctx) {
        const r = ruleOf(site) || {};
        const reasons = [];
        let s = Number(r.base ?? site.base ?? 0.4) || 0, out = '', strong = false;
        // pays
        // les pays de la règle passent devant ceux du lot (« Europe », « Monde » ne disent rien)
        const raw = r.countries?.length ? r.countries : [...(Array.isArray(site.countries) ? site.countries : []), site.country];
        const want = [...new Set(raw.map(c => (typeof c === 'string' && c.length === 2 && COUNTRY_NAME[c] ? c : canonCountry(c))).filter(c => c && c !== '*'))];
        let countryMiss = '';
        if (want.length) {
            const hit = want.find(c => ctx.countries.has(c));
            if (hit) { s += hit === 'fr' ? 1 : 4; strong = strong || hit !== 'fr'; if (hit !== 'fr' && !r.why) reasons.push(`${ctx.female ? 'Elle a vécu' : 'Il a vécu'} ${countryIn(ctx, hit)}`); }
            else if (ctx.countries.size) countryMiss = `pas de lieu ${want.length === 1 ? countryIn(ctx, want[0]) : 'dans ces pays'}`;
            else s -= 1; // aucun lieu connu : on ne peut pas dire
        }
        // époque couverte
        const yrs = Array.isArray(site.years) ? site.years : null;
        const from = Number(r.from ?? yrs?.[0]) || 0, to = Number(r.to ?? yrs?.[1]) || 0;
        if ((from || to) && ctx.by) {
            const a = alive(ctx, from || -9999, to || 9999);
            if (a === false) out = out || `sa vie (${lifeText(ctx)}) n’est pas dans les années du site (${from || '…'}–${to || '…'})`;
            else if (from && to && to - from < 120) { s += 1; reasons.push(`Ses années (${lifeText(ctx)}) sont dans celles du site (${from}–${to})`); }
        }
        // né dans la bonne tranche (soldats…)
        if (Array.isArray(r.born) && ctx.by) {
            if (ctx.by >= r.born[0] && ctx.by <= r.born[1]) { s += 3; strong = true; }
            else out = out || `${ne(ctx).toLowerCase()} en ${ctx.by}, hors des années ${r.born[0]}–${r.born[1]}`;
        } else if (Array.isArray(r.born) && !ctx.by) s -= 1;
        if (r.sex && ((r.sex === 'male' && ctx.female) || (r.sex === 'female' && ctx.male))) out = out || (ctx.female ? 'pour les hommes' : 'pour les femmes');
        // profils (règle, ou « where / on » des lots)
        const whereList = [...(Array.isArray(site.where) ? site.where : []), ...(Array.isArray(site.on) ? site.on : [])];
        const fromWhere = whereList.map(w => WHERE_PROFILE[w]).filter(Boolean);
        const profs = [...new Set([...(r.profiles || []), ...fromWhere])];
        const onlyFor = (r.require || []).includes('profile') || (whereList.length && !whereList.some(w => GENERIC_WHERE.includes(w)) && fromWhere.length);
        const ph = profs.find(k => ctx.profiles.has(k));
        if (ph) { s += 5; strong = true; reasons.push(`Sa fiche dit : ${PROFILES[ph]?.[1] || ph}`); }
        else if (onlyFor && profs.length) out = out || `seulement ${profs.slice(0, 2).map(k => `« ${PROFILES[k]?.[1] || k} »`).join(' ou ')}`;
        // événements
        const evh = (r.events || []).find(t => ctx.tags.has(t));
        if (evh) { s += 4; strong = true; if (!ph) reasons.push({EMIG: 'Sa fiche a une émigration', IMMI: 'Sa fiche a une immigration', NATU: 'Sa fiche a une naturalisation', WILL: 'Sa fiche a un testament', PROB: 'Sa fiche a une succession', DEED: 'Sa fiche a un acte notarié', MARC: 'Sa fiche a un contrat de mariage'}[evh] || `Sa fiche a l’événement ${evh}`); }
        // un site fait pour un profil ou un événement que la fiche n'a pas : en bas, et sans sa phrase (« Venu d'ailleurs… » pour un Corrézien)
        const offTopic = (profs.length || (r.events || []).length) && !ph && !evh && !(r.place instanceof RegExp && ctx.places.some(x => r.place.test(fold(x)))) && !(Array.isArray(r.born) && ctx.by >= r.born[0] && ctx.by <= r.born[1]);
        if (offTopic) { s -= 1.5; if (!Array.isArray(r.born)) reasons.length = 0; }
        // un pays qui ne va pas : écarté, sauf si son profil ou un événement le rend utile (un émigré sans lieu en Amérique)
        if (countryMiss && !ph && !evh) out = out || countryMiss;
        // un registre français par âge (soldats, matricules) : pas pour quelqu'un né à l'étranger, sauf si sa fiche le dit
        if (Array.isArray(r.born) && want.includes('fr') && ctx.birthCountry && ctx.birthCountry !== 'fr' && !ph) out = out || `${ne(ctx).toLowerCase()} hors de France (${C_NAME(ctx.birthCountry)})`;
        // lieu précis (Paris…)
        const placeRe = r.place instanceof RegExp ? r.place : site.place instanceof RegExp ? site.place : null;
        if (placeRe) { if (ctx.places.some(x => placeRe.test(fold(x)) || placeRe.test(String(x).toLowerCase()))) { s += 3; strong = true; } else if (!ph && !evh) out = out || 'pas de lieu qui convient'; }
        // région (bibliothèques régionales du lot 6)
        if (site.region) { if (ctx.regions?.includes(site.region)) { s += 2.5; reasons.push('Une bibliothèque de sa région'); } else out = out || 'pas dans sa région'; }
        // ce qui manque
        const miss = (r.missing || []).filter(m => ctx.missing.has(m));
        if (miss.length) { s += 1.5 + miss.length * 0.5; reasons.push(`${MISSING[miss[0]].replace(/^./, c => c.toUpperCase())}${miss.length > 1 ? ` (et ${miss.slice(1).map(m => MISSING[m]).join(', ')})` : ''}`); }
        // la phrase du pourquoi (en premier)
        const sayWhy = !out && !(offTopic && !Array.isArray(r.born));
        if (typeof r.why === 'function' && sayWhy) { try { const w = r.why(ctx); if (w) reasons.unshift(w); } catch (_) {} }
        else if (typeof r.why === 'string' && sayWhy) reasons.unshift(r.why);
        if (Array.isArray(r.born) && !out && typeof r.why !== 'function') reasons.unshift(bornText(ctx));
        if (!reasons.length && !out) reasons.push(offTopic ? `Utile surtout pour ${profs.length ? profs.slice(0, 2).map(k => `« ${PROFILES[k]?.[1] || k} »`).join(' ou ') : 'un autre cas'}` : site.note ? String(site.note).split(/(?<=[.!?])\s/)[0] : 'Un site général, à essayer');
        const paid = isPaid({...site, paid: site.paid ?? r.paid});
        if (paid === 'paid') s -= 2; else if (paid === 'library') s -= 1.5; else if (paid === 'partly') s -= 0.3;
        return {score: Math.round(s * 10) / 10, reasons: [...new Set(reasons.filter(Boolean))].slice(0, 3), out, strong, paid};
    }

    /**
     * rank(sites, ctx, {freeOnly, limit}) : les propositions, les plus utiles d'abord ; un site payant n'est jamais en premier.
     *  sites : [{key, label, group, icon, url(p), paid, country, countries, years, where, on, place, region, rel, note}]
     *  → {list: [{site, score, reasons, paid, searched}], searched: [...déjà cherchées], hidden: nombre de payants cachés, out: écartés}
     */
    function rank(sites, ctx, {freeOnly = false, minScore = 0.6} = {}) {
        const list = [], done = [], out = []; let hidden = 0;
        const seen = new Set();
        (sites || []).forEach(site => {
            if (!site || !site.key || seen.has(site.key)) return; seen.add(site.key);
            const sc = score(site, ctx);
            if (sc.out) { out.push({site, why: sc.out}); return; }
            if (freeOnly && sc.paid === 'paid') { hidden++; return; }
            const prev = ctx.searched?.[site.key] || null;
            const row = {site, score: sc.score, reasons: sc.reasons, paid: sc.paid, strong: sc.strong, searched: prev};
            if (prev && prev.status !== 'review') { done.push(row); return; }
            if (sc.score < minScore && !sc.strong) { out.push({site, why: 'peu utile pour cette fiche'}); return; }
            list.push(row);
        });
        list.sort((a, b) => b.score - a.score || String(a.site.label).localeCompare(String(b.site.label), 'fr'));
        // un payant n'est jamais en tête : le premier gratuit passe devant
        if (list.length > 1 && list[0].paid === 'paid') { const i = list.findIndex(x => x.paid !== 'paid'); if (i > 0) list.unshift(list.splice(i, 1)[0]); }
        done.sort((a, b) => String(b.searched?.date || '').localeCompare(String(a.searched?.date || '')));
        return {list, searched: done, hidden, out};
    }

    return {fold, canonCountry, COUNTRY_NAME, PROFILES, MISSING, RULES, ALIAS, WHERE_PROFILE, context, score, rank, addRules, isPaid, ruleOf, bornText, lifeText};
});
