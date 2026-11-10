/* LCNDA — 🗂 Archives en ligne (suite) : monuments aux morts, cimetières, communes et noms, protestants et marins, archives
 * d'Europe, presse étrangère. Calculs purs, SANS RÉSEAU (window.LCNDA_SO4 ; aussi require() dans Node pour les tests).
 *
 * Même modèle que app-sources-ouvertes-core.js (Mémoire des hommes, Léonore, matricules, presse) et que SocFace : l'app
 * N'INTERROGE JAMAIS ces sites. Elle fabrique l'adresse d'une recherche, que le navigateur de la personne ouvre, puis lit ce
 * que la personne a téléchargé (image, PDF, page enregistrée, tableau) ou le texte / le lien qu'elle a copié.
 *
 *  - SITES / GROUPS                   les sites, rangés par pays et par thème (clé, nom, adresse modèle, vérifiée ou non, import)
 *  - url(key, p, custom)              l'adresse remplie (p : first, last, place, dept, deptCode, insee, country, y1, y2, birthYear, deathYear)
 *  - fill(modèle, p)                  remplit « {nom} {prénom} {lieu} {département} {insee} {de} {à} … » (encodé)
 *  - parseLink(adresse)               ce qu'un lien collé dit déjà (site, n° de fiche, date, page, journal, registre)
 *  - parseFields(texte, sorte)        le texte copié d'une fiche → champs (memorial, sepulture, acte)
 *  - guessEvent(texte)                la sorte d'acte d'après les mots (baptême, dåp, Taufe, burial…) → BIRT, CHR, DEAT, BURI, CENS, EMIG…
 *  - readDate(texte)                  « 12 mars 1850 », « 12.03.1850 », « 1850-03-12 », « 12 March 1850 », « 12. März 1850 » → {text, year}
 *  - parsePopulation(texte)           le tableau de population d'une commune (CSV, colonnes ou lignes) → {rows:[{year,pop}], names:[{year,name}]}
 *  - compareNames(noms, histoire)     rapproche les anciens noms (Cassini) des changements INSEE depuis 1943
 *
 * Adresses : AUCUNE n'a pu être vérifiée en ligne le jour où elles ont été écrites (pas d'accès au réseau) : verified:false
 * partout, sauf celles reprises telles quelles de « Chercher sur internet » (vérifiées le 2026-10-08). Elles sont construites
 * d'après la forme connue des sites et se changent dans « ⚙️ Adresses des sites » (docs/UI.md, « 🗂 Archives en ligne (suite) »).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SO4 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const i18n = (s, v) => (typeof window !== 'undefined' && window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js (dans Node : le français)
    const MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const placeOnly = s => clean(s).split(',')[0].trim();
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const years = p => { let a = Number(p.y1) || 0, b = Number(p.y2) || 0; if (a && b && b < a) [a, b] = [b, a]; return [a, b || a]; };
    const q = s => `"${clean(s).replace(/"/g, '')}"`;
    const nameOf = (p, withFirst = true) => [withFirst && p.withFirst !== false ? firstOnly(p.first) : '', clean(p.last)].filter(Boolean).join(' ');
    /** recherche Google limitée à un site (les sites qui ne gardent pas la recherche dans leur adresse) */
    const google = (site, p, words = '', withFirst = true) => `https://www.google.com/search?q=${encodeURIComponent([`site:${site}`, p.last ? q(p.last) : '', withFirst && p.first ? q(firstOnly(p.first)) : '', words].filter(Boolean).join(' '))}`;
    const qs = obj => Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== 0).map(([k, v]) => `${k}=${enc(v)}`).join('&');

    /* ═════ Les groupes : par pays, puis par thème (l'ordre est celui des réglages et de la fenêtre « Chercher sur… ») ═════ */
    const GROUPS = [
        {key: 'fr_guerres', icon: '🇫🇷', label: 'France · Guerres et monuments aux morts', country: 'France', theme: 'Guerres'},
        {key: 'fr_cimetieres', icon: '🇫🇷', label: 'France · Cimetières et tombes', country: 'France', theme: 'Cimetières'},
        {key: 'fr_lieux', icon: '🇫🇷', label: 'France · Communes et noms de famille', country: 'France', theme: 'Lieux et noms'},
        {key: 'fr_autres', icon: '🇫🇷', label: 'France · Protestants et gens de mer', country: 'France', theme: 'Religion et métiers'},
        {key: 'europe', icon: '🇪🇺', label: 'Europe · Registres et archives', country: 'Europe', theme: 'Registres'},
        {key: 'presse_etr', icon: '🌍', label: 'Presse étrangère', country: 'Monde', theme: 'Presse'},
    ];

    /* ═════ Les sites ═════
     * kind : la sorte d'import (memorial · sepulture · acte · presse · population · '' = lien seulement)
     * scope : 'person' (depuis une fiche), 'place' (depuis une commune), 'name' (un nom de famille)
     * verified : adresse vérifiée en ligne ; paid / account : payant, ou gratuit avec un compte (dit à l'écran). */
    const SITES = [
        // 🎖 MémorialGenWeb : relevés bénévoles des monuments aux morts (noms, photos, biographies). Recherche par nom dans le site,
        // qui ne garde pas les champs dans son adresse → Google limité au site.
        {key: 'memorialgenweb', group: 'fr_guerres', icon: '🎖', label: 'MémorialGenWeb — monuments aux morts', kind: 'memorial', scope: 'person', home: 'https://www.memorialgenweb.org/', verified: false,
            note: 'Relevés des monuments aux morts, avec photos et biographies des soldats.',
            build: p => google('memorialgenweb.org', p)},
        {key: 'memorialgenweb_commune', group: 'fr_guerres', icon: '🗿', label: 'MémorialGenWeb — le monument de la commune', kind: 'memorial', scope: 'place', home: 'https://www.memorialgenweb.org/', verified: false,
            note: 'Les monuments et plaques d’une commune, avec la liste des noms.',
            build: p => p.place ? `https://www.google.com/search?q=${encodeURIComponent(`site:memorialgenweb.org ${q(placeOnly(p.place))}${p.deptCode ? ' ' + clean(p.deptCode) : ''} monument`)}` : 'https://www.memorialgenweb.org/'},
        {key: 'morts_1870', group: 'fr_guerres', icon: '⚔', label: 'Morts de la guerre de 1870-1871', kind: 'memorial', scope: 'person', home: 'https://www.memorialgenweb.org/', verified: false,
            note: 'Soldats morts en 1870-1871 (relevés de MémorialGenWeb et du Souvenir français).',
            build: p => google('memorialgenweb.org', p, '1870')},
        {key: 'victimes_civiles_3945', group: 'fr_guerres', icon: '🕯', label: 'Victimes civiles 1939-1945', kind: 'memorial', scope: 'person', home: 'https://www.memoiredeshommes.sga.defense.gouv.fr/', verified: false,
            note: 'Civils morts du fait de la guerre (bombardements, déportation, fusillés) : Mémoire des hommes et MémorialGenWeb.',
            build: p => `https://www.google.com/search?q=${encodeURIComponent(`${p.last ? q(p.last) : ''} ${p.first ? q(firstOnly(p.first)) : ''} "victime civile" (site:memoiredeshommes.sga.defense.gouv.fr OR site:memorialgenweb.org)`.replace(/\s+/g, ' ').trim())}`},
        // 🪦 Cimetières
        {key: 'cimetieres_de_france', group: 'fr_cimetieres', icon: '🪦', label: 'Cimetières de France', kind: 'sepulture', scope: 'person', home: 'https://www.cimetieres-de-france.fr/', verified: false,
            note: 'Cimetières, tombes et concessions, commune par commune.',
            build: p => google('cimetieres-de-france.fr', p, p.place ? placeOnly(p.place) : '')},
        {key: 'billiongraves', group: 'fr_cimetieres', icon: '📸', label: 'BillionGraves — photos de tombes', kind: 'sepulture', scope: 'person', home: 'https://billiongraves.com/', verified: true,
            note: 'Photos de tombes prises par des bénévoles, avec leur position GPS.',
            build: p => { const [a] = years(p); const y = Number(p.birthYear) || a; return `https://billiongraves.com/search/results?${qs({given_names: firstOnly(p.first), family_names: clean(p.last), birth_year: y || '', year_range: y ? 5 : ''})}`; }},
        {key: 'geneanet_releves', group: 'fr_cimetieres', icon: '📋', label: 'Relevés de tombes (Geneanet, collaboratif)', kind: 'sepulture', scope: 'person', home: 'https://www.geneanet.org/cimetieres/', verified: false,
            note: 'Le projet « Sauvons nos tombes » : photos et relevés de cimetières par des bénévoles.',
            build: p => google('geneanet.org/cimetieres', p)},
        // 📍 Communes et noms
        {key: 'cassini', group: 'fr_lieux', icon: '🏘', label: 'Des villages de Cassini aux communes d’aujourd’hui (EHESS)', kind: 'population', scope: 'place', home: 'https://cassini.ehess.fr/', verified: false,
            note: 'La population de chaque commune depuis 1793 et ses changements de nom.',
            build: p => p.place ? `https://www.google.com/search?q=${encodeURIComponent(`site:cassini.ehess.fr ${q(placeOnly(p.place))}`)}` : 'https://cassini.ehess.fr/'},
        {key: 'geopatronyme', group: 'fr_lieux', icon: '🔤', label: 'Géopatronyme — où vivait ce nom (1891-1990)', kind: '', scope: 'name', home: 'https://www.geopatronyme.com/', verified: false,
            note: 'La répartition d’un nom de famille en France, par département, de 1891 à 1990 (naissances).',
            build: p => p.last ? `https://www.geopatronyme.com/nom/${encodeURIComponent(clean(p.last).toUpperCase())}` : 'https://www.geopatronyme.com/'},
        // ✝ Protestants, marins
        {key: 'huguenots', group: 'fr_autres', icon: '✝', label: 'Huguenots réfugiés (le Refuge huguenot)', kind: 'acte', scope: 'person', home: 'https://www.refuge-huguenot.fr/', verified: false,
            note: 'Les protestants français partis en Suisse, en Allemagne, aux Pays-Bas… après 1685.',
            build: p => `https://www.google.com/search?q=${encodeURIComponent([p.last ? q(p.last) : '', p.first ? q(firstOnly(p.first)) : '', '(huguenot OR réfugié OR refuge)', p.place ? placeOnly(p.place) : ''].filter(Boolean).join(' '))}`},
        {key: 'roles_equipage', group: 'fr_autres', icon: '⚓', label: 'Rôles d’équipage — marine marchande (Archives départementales, SHD)', kind: 'acte', scope: 'person', home: 'https://francearchives.gouv.fr/', verified: false,
            note: 'Les listes des marins de chaque navire, rangées par port (Archives départementales et Service historique de la Défense).',
            build: p => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(`"rôles d'équipage"${p.place ? ' ' + placeOnly(p.place) : ''}${p.last ? ' ' + clean(p.last) : ''}`)}`},
        // 🇪🇺 Europe
        {key: 'matricula', group: 'europe', icon: '⛪', label: 'Matricula — registres paroissiaux (Allemagne, Autriche, Pologne…)', kind: 'acte', scope: 'place', home: 'https://data.matricula-online.eu/', verified: false,
            note: 'Les registres des paroisses catholiques et protestantes, rangés par diocèse : on cherche par lieu.',
            build: p => `https://data.matricula-online.eu/fr/suchen/${p.place ? `?place=${enc(placeOnly(p.place))}` : ''}`},
        {key: 'digitalarkivet', group: 'europe', icon: '🇳🇴', label: 'Norvège — Digitalarkivet', kind: 'acte', scope: 'person', home: 'https://www.digitalarkivet.no/', verified: false,
            note: 'Recensements, registres paroissiaux et émigrants de Norvège, gratuits.',
            build: p => { const [a, b] = years(p); return `https://www.digitalarkivet.no/en/search/persons/advanced?${qs({firstname: firstOnly(p.first), lastname: clean(p.last), birth_year_from: a || '', birth_year_to: b || ''})}`; }},
        {key: 'riksarkivet', group: 'europe', icon: '🇸🇪', label: 'Suède — Riksarkivet', kind: 'acte', scope: 'person', home: 'https://sok.riksarkivet.se/', verified: false,
            note: 'Les archives nationales suédoises : recensements, registres de paroisse (husförhör), gratuits.',
            build: p => `https://sok.riksarkivet.se/?${qs({Sokord: nameOf(p) + (p.place ? ' ' + placeOnly(p.place) : ''), EndastDigitaliserat: 'false'})}`},
        {key: 'danishfamilysearch', group: 'europe', icon: '🇩🇰', label: 'Danemark — Danish Family Search', kind: 'acte', scope: 'person', home: 'https://www.danishfamilysearch.com/', verified: false,
            note: 'Recensements et registres paroissiaux danois transcrits.',
            build: p => `https://www.danishfamilysearch.com/search?${qs({firstname: firstOnly(p.first), lastname: clean(p.last), place: p.place ? placeOnly(p.place) : ''})}`},
        {key: 'irishgenealogy', group: 'europe', icon: '🇮🇪', label: 'Irlande — irishgenealogy.ie', kind: 'acte', scope: 'person', home: 'https://civilrecords.irishgenealogy.ie/', verified: false,
            note: 'Naissances, mariages et décès de l’état civil irlandais, et registres d’églises, gratuits.',
            build: p => { const [a, b] = years(p); return `https://civilrecords.irishgenealogy.ie/churchrecords/civil-perform-search.jsp?${qs({namefm: firstOnly(p.first), namel: clean(p.last), location: p.place ? placeOnly(p.place) : '', yyfrom: a || '', yyto: b || '', type: 'B', submit: 'Search'})}`; }},
        {key: 'portafontium', group: 'europe', icon: '🇨🇿', label: 'Porta fontium — Bohême, Bavière, Autriche', kind: 'acte', scope: 'place', home: 'https://www.portafontium.eu/', verified: false,
            note: 'Registres paroissiaux et livres terriers de part et d’autre de la frontière tchéco-bavaroise.',
            build: p => p.place ? `https://www.google.com/search?q=${encodeURIComponent(`site:portafontium.eu ${q(placeOnly(p.place))}`)}` : 'https://www.portafontium.eu/'},
        {key: 'hungaricana', group: 'europe', icon: '🇭🇺', label: 'Hongrie — Hungaricana', kind: 'acte', scope: 'person', home: 'https://hungaricana.hu/', verified: false,
            note: 'Archives, cadastres, livres et journaux hongrois numérisés.',
            build: p => `https://library.hungaricana.hu/en/search/results/?${qs({query: [p.last ? q(p.last) : '', p.place ? placeOnly(p.place) : ''].filter(Boolean).join(' ')})}`},
        {key: 'jewishgen', group: 'europe', icon: '✡', label: 'JewishGen — familles juives (gratuit avec un compte)', kind: 'acte', scope: 'person', home: 'https://www.jewishgen.org/databases/all/', verified: false, account: true,
            note: 'Gratuit, mais il faut créer un compte (adresse e-mail) avant de chercher.',
            build: () => 'https://www.jewishgen.org/databases/all/'},
        // 🌍 Presse étrangère (même import que Gallica : un passage dans « 📰 Dans les médias »)
        {key: 'chroniclingamerica', group: 'presse_etr', icon: '🇺🇸', label: 'Chronicling America (États-Unis)', kind: 'presse', scope: 'person', home: 'https://www.loc.gov/collections/chronicling-america/', verified: true,
            note: 'Journaux américains de 1756 à 1963 (Bibliothèque du Congrès), gratuits.',
            build: p => { const [a, b] = years(p); return `https://www.loc.gov/collections/chronicling-america/?q=${encodeURIComponent(q(nameOf(p)))}${a ? `&dates=${a}/${b}` : ''}`; }},
        {key: 'trove', group: 'presse_etr', icon: '🇦🇺', label: 'Trove (Australie)', kind: 'presse', scope: 'person', home: 'https://trove.nla.gov.au/', verified: true,
            note: 'Journaux australiens numérisés (Bibliothèque nationale d’Australie), gratuits.',
            build: p => { const [a, b] = years(p); return `https://trove.nla.gov.au/search/category/newspapers?keyword=${encodeURIComponent(q(nameOf(p)))}${a && Math.floor(a / 10) === Math.floor(b / 10) ? `&l-decade=${Math.floor(a / 10)}` : ''}`; }},
        {key: 'paperspast', group: 'presse_etr', icon: '🇳🇿', label: 'Papers Past (Nouvelle-Zélande)', kind: 'presse', scope: 'person', home: 'https://paperspast.natlib.govt.nz/', verified: false,
            note: 'Journaux néo-zélandais de 1839 à 1989, gratuits.',
            build: p => { const [a, b] = years(p); return `https://paperspast.natlib.govt.nz/newspapers?${qs({query: q(nameOf(p)), start_date: a ? `01-01-${a}` : '', end_date: b ? `31-12-${b}` : ''})}`; }},
        {key: 'delpher', group: 'presse_etr', icon: '🇳🇱', label: 'Delpher (Pays-Bas)', kind: 'presse', scope: 'person', home: 'https://www.delpher.nl/', verified: true,
            note: 'Journaux, livres et revues néerlandais numérisés, gratuits.',
            build: p => `https://www.delpher.nl/nl/kranten/results?query=${encodeURIComponent(q(nameOf(p)))}&coll=ddd`},
    ];
    const site = key => SITES.find(s => s.key === key) || null;
    const group = key => GROUPS.find(g => g.key === key) || null;
    /** les sites d'une sorte d'endroit (fiche, commune, nom) ou d'une sorte d'import, dans l'ordre des groupes */
    const sitesFor = ({scope = '', kind = '', groups = null} = {}) => GROUPS.flatMap(g => SITES.filter(s => s.group === g.key && (!scope || s.scope === scope || (scope === 'person' && s.scope === 'name')) && (!kind || s.kind === kind) && (!groups || groups.includes(g.key))));

    /** un modèle écrit par la personne : {nom} {prénom} {nom_complet} {lieu} {département} {insee} {pays} {de} {à} {naissance} {décès} */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: placeOnly(p.place), departement: p.deptCode || p.dept, insee: p.insee, pays: p.country,
            de: a || '', a: b || '', naissance: p.birthYear || '', deces: p.deathYear || ''};
        return String(template).replace(/\{([^{}]{1,20})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    /** l'adresse à ouvrir : celle écrite dans « ⚙️ Adresses des sites » si elle est sûre, sinon celle de l'app */
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p).replace(/'/g, '%27')); if (u) return u; }
        try { return cleanUrl(String(s.build(p)).replace(/'/g, '%27')) || s.home; } catch (_) { return s.home; }
    }

    /* ═════ Dates ═════ */
    const MONTHS = {janvier: 1, jan: 1, january: 1, januar: 1, januari: 1, fevrier: 2, fev: 2, february: 2, feb: 2, februar: 2, februari: 2, mars: 3, march: 3, mar: 3, marz: 3, maart: 3,
        avril: 4, avr: 4, april: 4, apr: 4, mai: 5, may: 5, mei: 5, maj: 5, juin: 6, june: 6, jun: 6, juni: 6, juillet: 7, juil: 7, july: 7, jul: 7, juli: 7, aout: 8, august: 8, aug: 8, augustus: 8, augusti: 8,
        septembre: 9, sept: 9, september: 9, sep: 9, octobre: 10, oct: 10, october: 10, oktober: 10, okt: 10, novembre: 11, nov: 11, november: 11, decembre: 12, dec: 12, december: 12, dezember: 12, dez: 12};
    const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const frDate = (d, m, y) => `${d ? (Number(d) === 1 ? '1er' : Number(d)) + ' ' : ''}${m ? MONTHS_FR[m - 1] + ' ' : ''}${y}`;
    /** une date écrite à la française, à l'anglaise, à l'allemande ou en chiffres → {text: « 12 mars 1850 », year} */
    function readDate(raw) {
        const s = fold(raw).replace(/\b(\d{1,2})(st|nd|rd|th|er|e)\b/g, '$1');
        let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); if (m && +m[2] >= 1 && +m[2] <= 12) return {text: frDate(+m[3], +m[2], +m[1]), year: +m[1]};
        m = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/); if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) return {text: frDate(+m[1], +m[2], +m[3]), year: +m[3]};
        m = s.match(/\b(\d{1,2})\.?\s+([a-z]{3,10})\.?,?\s+(\d{4})\b/); if (m && MONTHS[m[2]]) return {text: frDate(+m[1], MONTHS[m[2]], +m[3]), year: +m[3]};
        m = s.match(/\b([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})\b/); if (m && MONTHS[m[1]]) return {text: frDate(+m[2], MONTHS[m[1]], +m[3]), year: +m[3]};
        m = s.match(/\b([a-z]{3,10})\s+(\d{4})\b/); if (m && MONTHS[m[1]]) return {text: frDate(0, MONTHS[m[1]], +m[2]), year: +m[2]};
        m = s.match(/\b(1[5-9]\d\d|20\d\d)\b/); if (m) return {text: m[1], year: +m[1]};
        return {text: '', year: 0};
    }

    /* ═════ La sorte d'acte d'après les mots (plusieurs langues) ═════ */
    const EVENT_WORDS = [
        ['CHR', /\b(bapteme|baptise|baptism|baptized|christening|christened|dap|dopt|dobt|daab|dabt|taufe|getauft|doop|gedoopt|krest|pokrt|kereszt|chrzest)\w*/],
        ['BURI', /\b(inhum|sepult|enterr|burial|buried|begrav|begraf|beerdig|begrab|pohreb|temet|pogrzeb)\w*/],
        ['DEAT', /\b(deces|decede|mort|death|died|deceased|dod|dode|dod|tod|gestorb|overl|umrti|zemr|halal|meghalt|zgon)\w*/],
        ['BIRT', /\b(naissance|ne le|nee le|birth|born|fodt|fodd|fodelse|geburt|geboren|geboorte|narozen|szület|szulet|urodz)\w*/],
        ['CENS', /\b(recensement|census|folketelling|folketaelling|folkrakning|husforhor|volkszahl|volkstelling|scitani|nepszamlal)\w*/],
        ['EMIG', /\b(emigr|utvandr|udvandr|auswander|landverhuiz|vystehoval|kivandorl)\w*/],
        ['IMMI', /\b(immigr|innvandr|indvandr|einwander)\w*/],
        ['RESI', /\b(refugie|refuge|residence|domicile|wohnort|bosted)\w*/],
        ['OCCU', /\b(role d'equipage|roles d'equipage|matelot|mousse|capitaine|marin|navire|crew|sailor|seaman)\w*/],
    ];
    function guessEvent(text) { const s = fold(text); for (const [tag, re] of EVENT_WORDS) if (re.test(s)) return tag; return ''; }
    const EVENT_LABELS = {BIRT: 'Naissance', CHR: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation', CENS: 'Recensement', EMIG: 'Émigration', IMMI: 'Immigration', RESI: 'Lieu de résidence', OCCU: 'Profession', EVEN: 'Autre événement'};
    /** les sortes qu'une fiche n'a qu'une fois : si elle en a déjà une, on ne l'ajoute pas (rien n'est écrasé ni doublé) */
    const UNIQUE_EVENTS = ['BIRT', 'CHR', 'DEAT', 'BURI'];

    /* ═════ Ce qu'un lien collé dit déjà ═════ */
    function parseLink(raw) {
        const u = cleanUrl(raw); const out = {url: u, site: '', notice: '', date: '', page: '', journal: '', register: '', place: ''};
        if (!u) return out;
        let host = '', path = '', search = ''; try { const x = new URL(u); host = x.hostname.toLowerCase(); path = decodeURIComponent(x.pathname); search = x.search; } catch (_) { return out; }
        const iso = (y, m, d) => frDate(+d, +m, +y);
        if (/(^|\.)memorialgenweb\.org$/.test(host)) {
            out.site = 'memorialgenweb'; const m = u.match(/[?&](?:id|idsource|insee)=(\d+)/i); if (m) out.notice = m[1];
        } else if (/(^|\.)cimetieres-de-france\.fr$/.test(host)) { out.site = 'cimetieres_de_france'; const m = path.match(/\/([a-z0-9-]+)\/?$/i); if (m) out.notice = m[1]; }
        else if (/(^|\.)billiongraves\.com$/.test(host)) { out.site = 'billiongraves'; const m = path.match(/\/grave\/[^/]+\/(\d+)/i); if (m) out.notice = m[1]; }
        else if (/(^|\.)geneanet\.org$/.test(host) && /cimetieres|tombes/.test(path)) { out.site = 'geneanet_releves'; const m = path.match(/\/(\d+)\/?$/); if (m) out.notice = m[1]; }
        else if (/cassini\.ehess\.fr$/.test(host)) { out.site = 'cassini'; const m = u.match(/[?&](?:select_resultat|id)=(\d+)/i); if (m) out.notice = m[1]; }
        else if (/(^|\.)geopatronyme\.com$/.test(host)) { out.site = 'geopatronyme'; const m = path.match(/\/nom(?:carte)?\/([^/]+)/i); if (m) out.notice = m[1]; }
        else if (/(^|\.)refuge-huguenot\.fr$/.test(host)) { out.site = 'huguenots'; const m = u.match(/[?&]id=(\d+)/i); if (m) out.notice = m[1]; }
        else if (/(^|\.)matricula-online\.eu$/.test(host)) {
            out.site = 'matricula';
            const parts = path.split('/').filter(Boolean); const i = parts.findIndex(x => /^(de|en|fr|pl|it|sl|hu|cs|sk|hr|sr|es)$/.test(x));
            const rest = parts.slice(i + 1).filter(x => x !== 'suchen');
            if (rest.length >= 3) { out.place = rest[rest.length - 2].replace(/^\d+-/, '').replace(/-/g, ' '); out.register = rest[rest.length - 1]; }
            const pg = search.match(/[?&]pg=(\d+)/); if (pg) out.page = pg[1];
        } else if (/(^|\.)digitalarkivet\.no$/.test(host)) {
            out.site = 'digitalarkivet'; const m = path.match(/\/(?:view|census\/person|source)\/(?:\d+\/)?([a-z]{1,3}\d{6,}|\d{3,})/i); if (m) out.notice = m[1];
            const id = path.match(/\/(pf\d+|pc\d+|pa\d+)/i); if (id) out.notice = id[1];
        } else if (/(^|\.)riksarkivet\.se$/.test(host)) {
            out.site = 'riksarkivet'; const m = u.match(/bildid=([A-Z]\d{7}_\d{5})/i) || u.match(/[?&]postid=([\w-]+)/i); if (m) out.notice = m[1];
            const pg = u.match(/_(\d{5})\b/); if (pg) out.page = String(Number(pg[1]));
        } else if (/(^|\.)danishfamilysearch\.(com|dk)$/.test(host)) { out.site = 'danishfamilysearch'; const m = path.match(/\/(cid\d+|sid\d+|pid\d+)/i); if (m) out.notice = m[1]; }
        else if (/irishgenealogy\.ie$/.test(host)) {
            out.site = 'irishgenealogy'; const m = path.match(/\/details(?:-civil)?\/([\w-]+)/i) || path.match(/\/([a-z]{2,3}[-_]\d[\w-]*)\.pdf$/i); if (m) out.notice = m[1];
            const y = path.match(/\/(\d{4})\//); if (y) out.date = y[1];
        } else if (/(^|\.)portafontium\.eu$/.test(host)) { out.site = 'portafontium'; const m = path.match(/\/(?:iipimage|register|source)\/(\d+)/i); if (m) out.notice = m[1]; const pg = path.match(/\/(\d+)\/?$/); if (pg && m && pg[1] !== m[1]) out.page = pg[1]; }
        else if (/(^|\.)hungaricana\.hu$/.test(host)) { out.site = 'hungaricana'; const m = path.match(/\/view\/([^/?#]+)/i); if (m) out.notice = m[1]; const pg = u.match(/[?&]pg=(\d+)/); if (pg) out.page = pg[1]; }
        else if (/(^|\.)jewishgen\.org$/.test(host)) { out.site = 'jewishgen'; }
        else if (/chroniclingamerica\.loc\.gov$/.test(host) || (/(^|\.)loc\.gov$/.test(host) && /chronicling|\/resource\/sn\d|\/item\/sn\d/.test(path))) {
            out.site = 'chroniclingamerica';
            const m = path.match(/\/(?:lccn|resource|item)\/(sn\d+|\d{8,})\/(\d{4})-(\d{2})-(\d{2})\/ed-(\d+)(?:\/seq-(\d+))?/i);
            if (m) { out.notice = m[1]; out.date = iso(m[2], m[3], m[4]); if (m[6]) out.page = String(Number(m[6])); }
            const sp = search.match(/[?&]sp=(\d+)/); if (sp) out.page = sp[1];
        } else if (/(^|\.)trove\.nla\.gov\.au$/.test(host) || /(^|\.)nla\.gov\.au$/.test(host)) {
            out.site = 'trove'; const m = path.match(/\/newspaper\/article\/(\d+)/) || path.match(/nla\.news-article(\d+)/); if (m) out.notice = m[1];
        } else if (/paperspast\.natlib\.govt\.nz$/.test(host)) {
            out.site = 'paperspast';
            const m = path.match(/\/newspapers\/(?:[a-z-]+\/\d{4}\/\d{2}\/\d{2}\/\d+|([A-Z]{2,6})(\d{4})(\d{2})(\d{2})\.\d+\.(\d+))/i);
            if (m && m[2]) { out.journal = m[1]; out.date = iso(m[2], m[3], m[4]); out.notice = path.split('/').pop(); }
            const m2 = path.match(/\/newspapers\/([a-z-]+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)/i);
            if (m2) { out.journal = m2[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); out.date = iso(m2[2], m2[3], m2[4]); out.page = m2[5]; }
        } else if (/(^|\.)delpher\.nl$/.test(host)) {
            out.site = 'delpher'; const m = u.match(/urn(?:=|%3A|:)(?:ddd(?::|%3A))?([0-9]{9})/i) || u.match(/identifier=([^&]+)/i); if (m) out.notice = decodeURIComponent(m[1]);
            const pg = u.match(/(?:%3A|:)p0*(\d{1,3})\b/i); if (pg) out.page = pg[1];
        }
        return out;
    }

    /* ═════ Le texte copié d'une fiche : « Étiquette : valeur » ou « Étiquette » puis la valeur à la ligne ═════ */
    const LABELS = {
        memorial: {last: ['nom', 'name', 'surname'], first: ['prenoms', 'prenom', 'forenames', 'given names'], birth_date: ['date de naissance', 'ne le', 'naissance', 'nee le'], birth_place: ['lieu de naissance', 'ne a', 'commune de naissance'],
            death_date: ['date de deces', 'deces', 'decede le', 'mort le', 'date du deces'], death_place: ['lieu de deces', 'lieu du deces', 'decede a', 'mort a'], rank: ['grade'], unit: ['unite', 'regiment', 'corps', 'unite / corps', 'arme'],
            cause: ['genre de mort', 'cause du deces', 'circonstances', 'cause'], mention: ['mention', 'mort pour la france'], conflict: ['conflit', 'guerre'], monument: ['monument', 'commune du monument', 'lieu du monument', 'monument de'],
            bio: ['biographie', 'complement', 'informations complementaires', 'complements', 'notes']},
        sepulture: {last: ['nom', 'name', 'family name', 'last name'], first: ['prenoms', 'prenom', 'given names', 'first name'], cemetery: ['cimetiere', 'cemetery', 'nom du cimetiere'], city: ['commune', 'ville', 'city', 'location', 'lieu'],
            country: ['pays', 'country'], plot: ['emplacement', 'carre', 'plot', 'allee', 'concession', 'section', 'n° de tombe'], birth_date: ['naissance', 'date de naissance', 'birth', 'born'], death_date: ['deces', 'date de deces', 'death', 'died'],
            gps: ['gps', 'coordonnees', 'coordinates', 'position'], inscription: ['inscription', 'epitaphe', 'epitaph']},
        acte: {last: ['nom', 'name', 'surname', 'last name', 'etternavn', 'efternamn', 'efternavn', 'nachname', 'achternaam', 'prijmeni', 'vezeteknev'],
            first: ['prenoms', 'prenom', 'given name', 'first name', 'fornavn', 'fornamn', 'vorname', 'voornaam', 'jmeno', 'keresztnev', 'forename'],
            date: ['date', 'dato', 'datum', 'event date', 'date of event', 'year', 'annee', 'ar', 'år', 'jahr', 'jaar', 'rok', 'ev'],
            place: ['lieu', 'place', 'parish', 'paroisse', 'sogn', 'socken', 'prestegjeld', 'pfarre', 'pfarrei', 'parochie', 'farnost', 'plebania', 'location', 'district', 'registration district', 'bosted', 'hemort', 'commune'],
            event: ['type', 'event', 'record type', 'kildetype', 'kategori', 'type of record', 'evenement', 'source', 'kilde', 'kalla'],
            father: ['pere', 'father', 'far', 'vater', 'vader', 'otec', 'apja'], mother: ['mere', 'mother', 'mor', 'mutter', 'moeder', 'matka', 'anyja'],
            role: ['role', 'rolle', 'roll', 'funktion'], occupation: ['profession', 'occupation', 'yrke', 'erhverv', 'beruf', 'beroep', 'stilling'], ship: ['navire', 'ship', 'batiment', 'vessel'],
            cote: ['cote', 'reference', 'ref', 'signatur', 'call number', 'arkivreferanse', 'referenskod'], age: ['age', 'alder', 'alter', 'leeftijd']},
    };
    function parseFields(text, kind) {
        const map = LABELS[kind] || {}; const out = {}; const lines = String(text ?? '').slice(0, 40000).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const keyOf = lab => { const f = fold(lab).replace(/\s*:\s*$/, '').replace(/[.]+$/, ''); for (const [k, list] of Object.entries(map)) if (list.includes(f)) return k; return null; };
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^([^:\t]{2,40}?)\s*[:\t]\s*(.*)$/);
            let k = null, v = '';
            if (m) { k = keyOf(m[1]); v = m[2]; if (k && !v && lines[i + 1] && !/[:\t]/.test(lines[i + 1])) { v = lines[i + 1]; i++; } }
            else { k = keyOf(lines[i]); if (k && lines[i + 1] && !keyOf(lines[i + 1])) { v = lines[i + 1]; i++; } }
            if (k && v && !out[k]) out[k] = v.slice(0, 600);
        }
        if (out.last && out.last === out.last.toUpperCase() && out.last.length > 1) out.last = out.last.charAt(0) + out.last.slice(1).toLowerCase();
        const all = fold(text);
        if (kind === 'memorial') {
            if (/mort pour la france/.test(all) && !/non mort pour la france|n'est pas mort pour la france|sans mention/.test(all)) out.mpf = 'yes';
            if (!out.conflict) { if (/1870|1871/.test(all)) out.conflict = '1870-1871'; else if (/1914|1915|1916|1917|1918/.test(all)) out.conflict = '1914-1918'; else if (/1939|1940|1941|1942|1943|1944|1945/.test(all)) out.conflict = '1939-1945'; }
            if (/victime civile/.test(all)) out.civil = 'yes';
        }
        if (kind === 'sepulture') {
            const g = String(out.gps || text || '').match(/(-?\d{1,2}[.,]\d{3,})\s*[,; ]\s*(-?\d{1,3}[.,]\d{3,})/);
            if (g) { const lat = Number(g[1].replace(',', '.')), lon = Number(g[2].replace(',', '.')); if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { out.gps_lat = String(lat); out.gps_lon = String(lon); } }
        }
        if (kind === 'acte') { const t = guessEvent([out.event || '', text].join(' ')); if (t) out.tag = t; }
        ['date', 'birth_date', 'death_date'].forEach(k => { if (out[k]) { const d = readDate(out[k]); if (d.text) out[k] = d.text; } });
        return out;
    }

    /* ═════ Population d'une commune (Cassini / EHESS, ou recopiée) ═════
     * Formats lus : « Année ; Population » en colonnes (CSV, TSV, tableau collé), ou deux lignes (années, puis valeurs), ou
     * « 1793 : 512 habitants » ligne par ligne. Les noms (« 1793 : Saint-Martin-la-Montagne ») sont gardés à part. */
    const POP_MIN = 1789, POP_MAX = 2100;
    const numOf = s => { const t = String(s ?? '').replace(/[\s  '’]/g, '').replace(/\.(?=\d{3}\b)/g, ''); return /^\d{1,9}$/.test(t) ? Number(t) : NaN; };
    function parsePopulation(text) {
        const raw = String(text ?? '').slice(0, 400000).replace(/\r/g, '');
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const cells = l => l.split(/\t|;|\s*\|\s*|,(?=\s*\S)(?![^"]*"\s*$)/).map(c => c.replace(/^"|"$/g, '').trim());
        const isYear = c => /^\d{4}$/.test(c) && +c >= POP_MIN && +c <= POP_MAX;
        const rows = new Map(), names = [], notices = [];
        const put = (y, n) => { if (!Number.isFinite(n) || n < 0 || n > 20000000) return; if (rows.has(y) && rows.get(y) !== n) notices.push(i18n('Deux chiffres pour {nm} ({x2} et {x3}) : le premier est gardé.', {nm: String(y), x2: String(rows.get(y)), x3: String(n)})); if (!rows.has(y)) rows.set(y, n); };
        // 1. deux lignes : une d'années, la suivante de nombres (tableau « à l'horizontale »)
        for (let i = 0; i + 1 < lines.length; i++) {
            const a = cells(lines[i]), b = cells(lines[i + 1]);
            const ya = a.filter(isYear); if (ya.length < 3 || ya.length < a.length - 2) continue;
            const off = a.length - b.length; let ok = 0;
            a.forEach((c, j) => { if (isYear(c)) { const n = numOf(b[j - off] ?? b[j]); if (Number.isFinite(n)) { put(+c, n); ok++; } } });
            if (ok) i++;
        }
        // 2. une année et un nombre (ou un nom) par ligne
        if (!rows.size) for (const l of lines) {
            const c = cells(l); const yi = c.findIndex(isYear);
            if (yi >= 0) {
                const restCells = c.filter((_, j) => j !== yi && c[j] !== '');
                const n = restCells.map(numOf).find(Number.isFinite);
                if (Number.isFinite(n)) { put(+c[yi], n); continue; }
            }
            const m = l.match(/^\s*(?:en\s+)?(\d{4})\s*(?:[:\-–=]|\s)\s*([\d\s  .'’]{1,14})(?:\s*(?:hab(?:itants)?\.?|h\.?|personnes)?)\s*$/i);
            if (m && isYear(m[1]) && Number.isFinite(numOf(m[2]))) { put(+m[1], numOf(m[2])); continue; }
            const nm = l.match(/^\s*(\d{4})\s*[:\-–]\s*([A-Za-zÀ-ÿ’'][A-Za-zÀ-ÿ’' .\-()]{1,80})\s*$/);
            if (nm && isYear(nm[1])) names.push({year: +nm[1], name: nm[2].trim()});
        } else for (const l of lines) { const nm = l.match(/^\s*(\d{4})\s*[:\-–]\s*([A-Za-zÀ-ÿ’'][A-Za-zÀ-ÿ’' .\-()]{1,80})\s*$/); if (nm && isYear(nm[1])) names.push({year: +nm[1], name: nm[2].trim()}); }
        // noms écrits « Ancien nom : … » ou « Anciennement … »
        const an = raw.match(/(?:ancien(?:s)? nom(?:s)?|anciennement|nom r[ée]volutionnaire)\s*[:(]?\s*([^\n)]{2,80})/i);
        if (an) an[1].split(/\s*[,;/]\s*/).filter(Boolean).forEach(n => { if (!names.some(x => fold(x.name) === fold(n))) names.push({year: 0, name: n.replace(/[.)]$/, '').trim()}); });
        const list = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([year, pop]) => ({year, pop}));
        return {rows: list, names: names.slice(0, 40), notices: notices.slice(0, 10)};
    }
    /** rapproche les noms connus (Cassini, saisis) des changements INSEE depuis 1943 (frontières anciennes de l'app) */
    function compareNames(names = [], history = [], current = '') {
        const out = []; const seen = new Set([fold(current)]);
        (history || []).forEach(h => {
            const old = h.l || h.old || h.name || ''; const neu = h.nl || h.tl || h.new || '';
            if (!old) return; const k = fold(old);
            const inCassini = (names || []).some(n => fold(n.name) === k);
            out.push({name: old, newName: neu, date: h.d || h.date || '', kind: h.k || h.kind || '', from: 'insee', alsoCassini: inCassini}); seen.add(k);
        });
        (names || []).forEach(n => { const k = fold(n.name); if (!k || seen.has(k)) return; seen.add(k); out.push({name: n.name, year: n.year || 0, from: 'cassini', alsoInsee: false}); });
        return out;
    }

    /** « vivant » ou trop proche : jamais le nom d'un vivant dans une adresse ouverte sans qu'on le voie */
    function livingRisk(person = {}, now = new Date().getFullYear()) {
        if (String(person.living_status || '') === 'living') return true;
        if (String(person.living_status || '') === 'deceased' || Number(person.death_year) > 0) return false;
        const b = Number(person.birth_year) || 0;
        return b > 0 && now - b < 100;
    }

    /** ce qu'un import de presse étrangère donne à l'import « presse » commun (lib/sources_ouvertes.php) */
    const PRESS_AGENCY = {chroniclingamerica: 'Chronicling America (Bibliothèque du Congrès)', trove: 'Trove (Bibliothèque nationale d’Australie)', paperspast: 'Papers Past (Bibliothèque nationale de Nouvelle-Zélande)', delpher: 'Delpher (Bibliothèque royale des Pays-Bas)'};

    return {SITES, GROUPS, MENTION, EVENT_LABELS, UNIQUE_EVENTS, PRESS_AGENCY, site, group, sitesFor, url, fill, readDate, guessEvent, parseLink, parseFields, parsePopulation, compareNames, cleanUrl, livingRisk, fold};
});
