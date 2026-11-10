/* LCNDA — 📚 Archives en ligne, sixième lot : bibliothèques numériques régionales (Numelyo, Lectura Plus, Rosalis, Mémoire vive,
 * Normannia, Yroise), auteurs (IdRef, data.bnf.fr) et textes (Wikisource), gens de mer (inscription maritime selon le port),
 * notaires de Paris (Minutier central, avec le lot « Archives nationales »), Finlande (HisKi), Londres (Old Bailey), et les
 * sites PAYANTS (ScotlandsPeople, Ancestry, MyHeritage, Filae, Geneanet Premium), jamais mis en avant.
 * Calculs purs, SANS RÉSEAU (window.LCNDA_SOURCES_OUVERTES_6 ; aussi require() dans Node pour les tests).
 *
 * Même modèle que les autres lots (app-sources-ouvertes-core.js, -2, -3…) et SocFace : l'app N'INTERROGE JAMAIS ces sites.
 * Elle fabrique l'adresse d'une recherche, que le navigateur de la personne ouvre ; quand le site garde sa recherche dans un
 * formulaire, elle ouvre sa page et met le nom dans le presse-papiers. Ensuite elle lit ce que la personne a téléchargé ou
 * copié elle-même ; rien n'est écrit sans son clic, rien n'est écrasé, tout se défait (↶ Annuler).
 *
 *  - SITES, GROUPS             les sites, rangés par pays puis par thème (clé, adresse modèle, vérifiée ou non, payant…)
 *  - url(key, p, custom)       l'adresse remplie (p : first, last, place, y1, y2, port) ; custom = { clé: modèle } de la personne
 *  - googleUrl(key, p)         la même recherche par Google, limitée au site (pour une adresse non vérifiée)
 *  - copyText(key, p)          ce qu'on colle dans la case d'un site sans recherche dans l'adresse (HisKi)
 *  - visible(list, freeOnly)   le filtre « Gratuites seulement » (les payants à la fin, jamais en premier)
 *  - regionOf(lieu)            la région d'un lieu (département, code INSEE, ancienne région) → bibliothèques à proposer
 *  - libraryFor(lieu)          les bibliothèques numériques de sa région (les autres ensuite)
 *  - maritime(port)            le quartier maritime d'un port → arrondissement, centre du SHD, département de ses archives
 *  - minutierCote(texte)       « MC/ET/XLVIII/312 » → étude 48, article 312
 *  - parseAuthority(texte)     une notice IdRef ou data.bnf (texte copié, page enregistrée, .xml UNIMARC, JSON) → dates, lieux, identifiants
 *  - parseOldBailey(texte)     le texte d'un procès de l'Old Bailey → date, référence, crime, verdict, peine
 *  - parseHisKi(texte)         le texte copié d'une page de résultats HisKi → lignes (baptêmes, sépultures, mariages, départs)
 *  - parseLink(adresse)        ce qu'un lien collé dit déjà (site, PPN IdRef, ark BnF, référence d'un procès…)
 *  - webSites()                les nouveaux sites au format de « Chercher sur internet » ; PAID / PARTLY_PAID : les sites payants
 *
 * Adresses : AUCUNE n'a pu être ouverte en ligne le jour où elles ont été écrites (pas d'accès au réseau). verified = 'oui'
 * (adresse déjà dans l'app, vérifiée le 08/10/2026), 'partiel' (forme connue du logiciel du site, paramètres pas confirmés) ou
 * 'non' (construite d'après la forme connue du site). Toutes se changent dans « ⚙️ Adresses des sites ».
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SOURCES_OUVERTES_6 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const CHECKED = '2026-11-09';
    const MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
    const FREE_KEY = 'genealogie-sources-gratuites';
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/\s+/g, ' ').trim();
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https?:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const yearOf = v => { const m = String(v ?? '').match(/\b(1[0-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : 0; };
    const town = s => clean(s).split(',')[0].replace(/\s*\(.*\)\s*$/, '').trim();
    const nameOf = p => [firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
    const q = s => `"${clean(s).replace(/"/g, '')}"`;
    const google = (domain, words) => `https://www.google.com/search?q=${encodeURIComponent([`site:${domain}`, ...words].filter(Boolean).join(' '))}`;
    /** les mots d'une recherche plein texte : le nom entre guillemets et le lieu (ou le lieu seul, depuis la fiche d'un lieu) */
    const fullText = p => [nameOf(p) ? q(nameOf(p)) : '', town(p.place)].filter(Boolean).join(' ');

    /* ═════ Les régions et leurs bibliothèques numériques ═════ */
    const REGIONS = {
        ara: {label: 'Auvergne-Rhône-Alpes', depts: {'01': 'Ain', '03': 'Allier', '07': 'Ardèche', '15': 'Cantal', '26': 'Drôme', '38': 'Isère', '42': 'Loire', '43': 'Haute-Loire', '63': 'Puy-de-Dôme', '69': 'Rhône', '73': 'Savoie', '74': 'Haute-Savoie'},
            old: ['rhone-alpes', 'auvergne', 'auvergne-rhone-alpes', 'lyonnais', 'dauphine', 'forez', 'bourbonnais', 'velay', 'vivarais', 'bresse', 'bugey']},
        occ: {label: 'Occitanie', depts: {'09': 'Ariège', '11': 'Aude', '12': 'Aveyron', '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '34': 'Hérault', '46': 'Lot', '48': 'Lozère', '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '81': 'Tarn', '82': 'Tarn-et-Garonne'},
            old: ['occitanie', 'midi-pyrenees', 'languedoc-roussillon', 'languedoc', 'roussillon', 'gascogne', 'rouergue', 'quercy', 'comminges', 'bigorre', 'comte de foix']},
        bfc: {label: 'Bourgogne-Franche-Comté', depts: {'21': 'Côte-d’Or', '25': 'Doubs', '39': 'Jura', '58': 'Nièvre', '70': 'Haute-Saône', '71': 'Saône-et-Loire', '89': 'Yonne', '90': 'Territoire de Belfort'},
            old: ['bourgogne-franche-comte', 'bourgogne', 'franche-comte', 'nivernais', 'morvan']},
        nor: {label: 'Normandie', depts: {'14': 'Calvados', '27': 'Eure', '50': 'Manche', '61': 'Orne', '76': 'Seine-Maritime'},
            old: ['normandie', 'basse-normandie', 'haute-normandie', 'seine-inferieure', 'pays de caux', 'cotentin']},
        bre: {label: 'Bretagne', depts: {'22': 'Côtes-d’Armor', '29': 'Finistère', '35': 'Ille-et-Vilaine', '56': 'Morbihan'},
            old: ['bretagne', 'cotes-du-nord', 'cotes du nord', 'cornouaille', 'leon', 'tregor', 'tregor-goelo', 'pays nantais'],
            near: {'44': 'Loire-Atlantique'}},
    };
    const DEPT_BY_NAME = {};
    Object.entries(REGIONS).forEach(([r, o]) => { Object.entries({...o.depts, ...(o.near || {})}).forEach(([code, name]) => { DEPT_BY_NAME[fold(name).replace(/[-’']/g, ' ')] = {code, region: r}; }); });
    Object.assign(DEPT_BY_NAME, {'seine inferieure': {code: '76', region: 'nor'}, 'cotes du nord': {code: '22', region: 'bre'}, 'loire inferieure': {code: '44', region: 'bre'}, 'basses pyrenees': null});
    /** la région d'un lieu : {county, state, insee, postcode, country} ou un texte « Tulle, Corrèze, France » → {key, label, dept, near} ou null */
    function regionOf(where = {}) {
        const o = typeof where === 'string' ? {text: where} : where || {};
        const country = fold(o.country || '');
        if (country && !/^(france|fr|fra)$/.test(country)) return null;
        const code = String(o.insee || o.postcode || '').trim().toUpperCase();
        const dc = /^(2A|2B)/.test(code) ? code.slice(0, 2) : /^\d{5}$/.test(code) ? code.slice(0, 2) : /^\d{2}$/.test(code) ? code : '';
        const byCode = c => { for (const [k, r] of Object.entries(REGIONS)) { if (r.depts[c]) return {key: k, label: r.label, dept: c, near: false}; if (r.near?.[c]) return {key: k, label: r.label, dept: c, near: true}; } return null; };
        if (dc) { const r = byCode(dc); if (r) return r; }
        const parts = [o.county, o.state, o.text].filter(Boolean).flatMap(t => String(t).split(/[,;()]/)).map(t => fold(t).replace(/[-’']/g, ' ').trim()).filter(Boolean);
        for (const t of parts) { const d = DEPT_BY_NAME[t]; if (d) { const r = REGIONS[d.region]; return {key: d.region, label: r.label, dept: d.code, near: !r.depts[d.code]}; } }
        for (const t of parts) { const m = t.match(/^(\d{2}|2a|2b)$/); if (m) { const r = byCode(m[1].toUpperCase()); if (r) return r; } }
        for (const t of parts) { const tt = t.replace(/ /g, '-'); for (const [k, r] of Object.entries(REGIONS)) { if (r.old.includes(tt) || r.old.includes(t) || fold(r.label).replace(/[-’']/g, ' ') === t) return {key: k, label: r.label, dept: '', near: false}; } }
        return null;
    }

    /* ═════ Les gens de mer : les quartiers maritimes et leur arrondissement (répartition indicative du XIXe siècle) ═════
     * Les registres de l'inscription maritime sont rangés par quartier ; ils sont au Service historique de la Défense (SHD) du
     * port-chef de l'arrondissement, ou ont été versés aux Archives départementales. À vérifier sur le site : les limites ont changé. */
    const SHD_CENTRES = {
        cherbourg: {label: 'SHD Cherbourg', arr: '1er arrondissement maritime (Cherbourg)', town: 'Cherbourg'},
        brest: {label: 'SHD Brest', arr: '2e arrondissement maritime (Brest)', town: 'Brest'},
        lorient: {label: 'SHD Lorient', arr: '3e arrondissement maritime (Lorient)', town: 'Lorient'},
        rochefort: {label: 'SHD Rochefort', arr: '4e arrondissement maritime (Rochefort)', town: 'Rochefort'},
        toulon: {label: 'SHD Toulon', arr: '5e arrondissement maritime (Toulon)', town: 'Toulon'},
    };
    const PORTS = [
        ['Dunkerque', '59', 'cherbourg'], ['Gravelines', '59', 'cherbourg'], ['Calais', '62', 'cherbourg'], ['Boulogne-sur-Mer', '62', 'cherbourg'], ['Étaples', '62', 'cherbourg'],
        ['Saint-Valery-sur-Somme', '80', 'cherbourg'], ['Abbeville', '80', 'cherbourg'], ['Le Tréport', '76', 'cherbourg'], ['Dieppe', '76', 'cherbourg'], ['Saint-Valery-en-Caux', '76', 'cherbourg'],
        ['Fécamp', '76', 'cherbourg'], ['Le Havre', '76', 'cherbourg'], ['Rouen', '76', 'cherbourg'], ['Honfleur', '14', 'cherbourg'], ['Trouville', '14', 'cherbourg'], ['Caen', '14', 'cherbourg'],
        ['Isigny', '14', 'cherbourg'], ['La Hougue', '50', 'cherbourg'], ['Cherbourg', '50', 'cherbourg'], ['Granville', '50', 'cherbourg'],
        ['Saint-Malo', '35', 'brest'], ['Dinan', '22', 'brest'], ['Saint-Brieuc', '22', 'brest'], ['Binic', '22', 'brest'], ['Paimpol', '22', 'brest'], ['Tréguier', '22', 'brest'], ['Lannion', '22', 'brest'],
        ['Morlaix', '29', 'brest'], ['Brest', '29', 'brest'], ['Le Conquet', '29', 'brest'], ['Camaret', '29', 'brest'], ['Douarnenez', '29', 'brest'], ['Audierne', '29', 'brest'], ['Quimper', '29', 'brest'],
        ['Concarneau', '29', 'lorient'], ['Lorient', '56', 'lorient'], ['Groix', '56', 'lorient'], ['Port-Louis', '56', 'lorient'], ['Auray', '56', 'lorient'], ['Vannes', '56', 'lorient'], ['Belle-Île', '56', 'lorient'],
        ['Le Croisic', '44', 'lorient'], ['Saint-Nazaire', '44', 'lorient'], ['Paimbœuf', '44', 'lorient'], ['Nantes', '44', 'lorient'], ['Noirmoutier', '85', 'lorient'],
        ['Les Sables-d’Olonne', '85', 'rochefort'], ['L’Île-d’Yeu', '85', 'rochefort'], ['La Rochelle', '17', 'rochefort'], ['Île de Ré', '17', 'rochefort'], ['Rochefort', '17', 'rochefort'],
        ['Marennes', '17', 'rochefort'], ['Île d’Oléron', '17', 'rochefort'], ['Royan', '17', 'rochefort'], ['Bordeaux', '33', 'rochefort'], ['Pauillac', '33', 'rochefort'], ['Libourne', '33', 'rochefort'],
        ['Arcachon', '33', 'rochefort'], ['Bayonne', '64', 'rochefort'], ['Saint-Jean-de-Luz', '64', 'rochefort'],
        ['Port-Vendres', '66', 'toulon'], ['Collioure', '66', 'toulon'], ['Agde', '34', 'toulon'], ['Sète', '34', 'toulon'], ['Marseille', '13', 'toulon'], ['Martigues', '13', 'toulon'], ['La Ciotat', '13', 'toulon'],
        ['Toulon', '83', 'toulon'], ['Saint-Tropez', '83', 'toulon'], ['Antibes', '06', 'toulon'], ['Nice', '06', 'toulon'], ['Ajaccio', '2A', 'toulon'], ['Bastia', '2B', 'toulon'], ['Calvi', '2B', 'toulon'],
    ];
    const PORT_ALIAS = {cette: 'sete', 'boulogne': 'boulogne-sur-mer', 'les sables': "les sables-d'olonne", 'sables d olonne': "les sables-d'olonne", 'oleron': "ile d'oleron", 're': 'ile de re', 'yeu': "l'ile-d'yeu", 'belle ile': 'belle-ile', 'saint vaast': 'la hougue', 'saint-vaast-la-hougue': 'la hougue'};
    const portKey = s => fold(s).replace(/œ/g, 'oe');
    /** le quartier maritime d'un port (ou d'une commune proche citée telle quelle) → où chercher son inscription maritime */
    function maritime(port) {
        let k = portKey(town(port)); if (!k) return null;
        k = PORT_ALIAS[k] || PORT_ALIAS[k.replace(/-/g, ' ')] || k;
        const row = PORTS.find(([n]) => portKey(n) === k) || PORTS.find(([n]) => portKey(n).replace(/-/g, ' ') === k.replace(/-/g, ' ')) || PORTS.find(([n]) => k.length >= 4 && portKey(n).startsWith(k));
        if (!row) return null;
        const c = SHD_CENTRES[row[2]];
        return {port: row[0], dept: row[1], centre: row[2], shd: c.label, arr: c.arr,
            text: `Quartier de ${row[0]} : ${c.arr}. Les registres des inscrits (matricules des gens de mer, rôles d’équipage) sont au ${c.label} — ou, pour beaucoup de quartiers, déjà versés aux Archives départementales (${row[1]}). Répartition indicative : vérifie sur le site.`};
    }
    const PORT_NAMES = PORTS.map(p => p[0]);

    /* ═════ Le Minutier central : les études des notaires de Paris sont numérotées en chiffres romains (MC/ET/XLVIII/312) ═════ */
    const ROMAN = {I: 1, V: 5, X: 10, L: 50, C: 100};
    const fromRoman = r => { const s = String(r || '').toUpperCase(); if (!/^[IVXLC]{1,9}$/.test(s)) return 0; let t = 0; for (let i = 0; i < s.length; i++) { const v = ROMAN[s[i]], n = ROMAN[s[i + 1]] || 0; t += v < n ? -v : v; } return t > 0 && t <= 150 ? t : 0; };
    const toRoman = n => { let x = Number(n) || 0; if (x <= 0 || x > 150) return ''; const t = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let o = ''; for (const [v, s] of t) while (x >= v) { o += s; x -= v; } return o; };
    function minutierCote(text) {
        const m = String(text ?? '').toUpperCase().match(/\bMC\s*\/\s*(?:ET|RE)\s*\/\s*([IVXLC]{1,9}|\d{1,3})(?:\s*\/\s*(\d{1,5}[A-Z]?))?/);
        if (!m) return null;
        const etude = /^\d+$/.test(m[1]) ? Number(m[1]) : fromRoman(m[1]); if (!etude) return null;
        const roman = toRoman(etude);
        return {etude, roman, article: m[2] || '', cote: `MC/ET/${roman}${m[2] ? '/' + m[2] : ''}`, text: `Étude ${etude} (${roman})${m[2] ? `, article ${m[2]}` : ''} du Minutier central des notaires de Paris.`};
    }

    /* ═════ Rubriques : par pays, puis par thème (ordre du réglage et de la fenêtre « Chercher sur… ») ═════ */
    const GROUPS = [
        {id: 'fr_bn', icon: '🇫🇷', label: 'France · Bibliothèques numériques régionales', country: 'France', theme: 'Livres, journaux, images'},
        {id: 'fr_auteurs', icon: '🇫🇷', label: 'France · Auteurs et textes', country: 'France', theme: 'Auteurs'},
        {id: 'fr_mer', icon: '🇫🇷', label: 'France · Gens de mer (inscription maritime)', country: 'France', theme: 'Marins'},
        {id: 'fr_notaires', icon: '🇫🇷', label: 'France · Notaires de Paris', country: 'France', theme: 'Notaires'},
        {id: 'fi', icon: '🇫🇮', label: 'Finlande · Actes des paroisses', country: 'Finlande', theme: 'Registres'},
        {id: 'uk', icon: '🇬🇧', label: 'Royaume-Uni · Justice et registres', country: 'Royaume-Uni', theme: 'Justice'},
        {id: 'payant', icon: '💶', label: 'Sites payants', country: 'Monde', theme: 'Payant'},
    ];
    const groupOf = id => GROUPS.find(g => g.id === id) || null;

    /* ═════ Les sites ═════
     * build(p) : l'adresse remplie ; home : l'accueil (toujours sûr) ; domain : pour la recherche Google de secours ;
     * copy : true quand le site garde sa recherche dans un formulaire (on colle le nom) ; kind : la sorte d'import ;
     * region : la région d'une bibliothèque ; paid : payant (pastille « PAYANT », caché par « Gratuites seulement ») ;
     * partlyPaid : gratuit en partie ; existing : clé du site déjà dans « Chercher sur internet » (pas ajouté deux fois). */
    const SITES = [
        // 📚 Bibliothèques numériques régionales : livres d'histoire locale, journaux de la région, cartes postales, estampes
        {key: 'numelyo', group: 'fr_bn', region: 'ara', icon: '📚', label: 'Numelyo — bibliothèque numérique de Lyon', kind: 'document', home: 'https://numelyo.bm-lyon.fr/', domain: 'numelyo.bm-lyon.fr', verified: 'non',
            note: 'Bibliothèque municipale de Lyon : livres, journaux lyonnais, estampes, photographies, cartes postales.', build: p => `https://numelyo.bm-lyon.fr/search?query=${encodeURIComponent(fullText(p))}`},
        {key: 'lectura', group: 'fr_bn', region: 'ara', icon: '📚', label: 'Lectura Plus — patrimoine écrit d’Auvergne-Rhône-Alpes', kind: 'document', home: 'https://www.lectura.plus/', domain: 'lectura.plus', verified: 'non',
            note: 'Les journaux anciens et les fonds des bibliothèques des villes de la région (Chambéry, Grenoble, Valence, Saint-Étienne…).', build: p => `https://www.lectura.plus/Presse/search/?query=${encodeURIComponent(fullText(p))}`},
        {key: 'rosalis', group: 'fr_bn', region: 'occ', icon: '📚', label: 'Rosalis — bibliothèque numérique de Toulouse', kind: 'document', home: 'https://rosalis.bibliotheque.toulouse.fr/', domain: 'rosalis.bibliotheque.toulouse.fr', verified: 'non',
            note: 'Bibliothèque de Toulouse : livres, manuscrits, journaux toulousains, affiches, photographies.', build: p => `https://rosalis.bibliotheque.toulouse.fr/s/rosalis/item?fulltext_search=${encodeURIComponent(fullText(p))}`},
        {key: 'memoirevive', group: 'fr_bn', region: 'bfc', icon: '📚', label: 'Mémoire vive — patrimoine numérisé de Besançon', kind: 'document', home: 'https://memoirevive.besancon.fr/', domain: 'memoirevive.besancon.fr', verified: 'non',
            note: 'Bibliothèques et archives de Besançon : livres comtois, journaux, cartes, plans, photographies.', build: p => `https://memoirevive.besancon.fr/search?q=${encodeURIComponent(fullText(p))}`},
        {key: 'normannia', group: 'fr_bn', region: 'nor', icon: '📚', label: 'Normannia — bibliothèque numérique normande', kind: 'document', home: 'https://www.normannia.info/', domain: 'normannia.info', verified: 'non',
            note: 'Livres et revues sur la Normandie, journaux régionaux, annuaires, ouvrages d’histoire locale.', build: p => `https://www.normannia.info/recherche?q=${encodeURIComponent(fullText(p))}`},
        {key: 'yroise', group: 'fr_bn', region: 'bre', icon: '📚', label: 'Yroise — bibliothèque numérique de Brest', kind: 'document', home: 'https://yroise.biblio.brest.fr/', domain: 'yroise.biblio.brest.fr', verified: 'non',
            note: 'Bibliothèque de Brest : livres et journaux sur Brest et la Bretagne, la marine, cartes, photographies.', build: p => `https://yroise.biblio.brest.fr/search?q=${encodeURIComponent(fullText(p))}`},
        // ✍️ Auteurs et textes
        {key: 'idref', group: 'fr_auteurs', icon: '✍️', label: 'IdRef — auteurs (notices d’autorité des universités)', kind: 'auteur', home: 'https://www.idref.fr/', domain: 'idref.fr', verified: 'oui', existing: 'idref', author: true,
            note: 'La fiche d’un auteur (livre, thèse, article) : ses dates, son lieu de naissance, ses autres noms. Recherche Google limitée au site, comme dans « Chercher sur internet ».',
            build: p => google('idref.fr', [p.last ? q(p.last) : '', p.first ? q(firstOnly(p.first)) : ''])},
        {key: 'databnf', group: 'fr_auteurs', icon: '✍️', label: 'data.bnf.fr — auteurs de la Bibliothèque nationale', kind: 'auteur', home: 'https://data.bnf.fr/', domain: 'data.bnf.fr', verified: 'oui', existing: 'databnf', author: true,
            note: 'La page d’un auteur à la BnF : dates et lieux de naissance et de mort, ses œuvres, ses autres noms.', build: p => `https://data.bnf.fr/search?term=${enc(nameOf(p))}`},
        {key: 'wikisource', group: 'fr_auteurs', icon: '📖', label: 'Wikisource — chercher dans les textes', kind: 'document', home: 'https://fr.wikisource.org/', domain: 'fr.wikisource.org', verified: 'partiel',
            note: 'Des milliers de textes anciens recopiés (livres, journaux, annuaires, dictionnaires) : un nom peut y apparaître en toutes lettres.',
            build: p => `https://fr.wikisource.org/w/index.php?search=${encodeURIComponent(fullText(p))}&title=Sp%C3%A9cial%3ARecherche&fulltext=1&ns0=1`},
        // ⚓ Gens de mer : le bon service d'archives selon le port
        {key: 'marins_shd', group: 'fr_mer', icon: '⚓', label: 'Inscription maritime — registres du SHD (FranceArchives)', kind: 'marin', home: 'https://www.servicehistorique.sga.defense.gouv.fr/', domain: 'francearchives.gouv.fr', verified: 'partiel', needs: 'port',
            note: 'Choisis le port d’attache : l’app dit quel centre du Service historique de la Défense (ou quelles Archives départementales) garde ses registres.',
            build: p => { const m = maritime(p.port); return `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent([p.last, firstOnly(p.first), 'inscription maritime', m ? m.port : town(p.port)].map(clean).filter(Boolean).join(' '))}&es_publisher=34577`; }},
        // ✒ Notaires de Paris : le Minutier central (lot « Archives nationales » quand il est là)
        {key: 'minutier', group: 'fr_notaires', icon: '✒', label: 'Minutier central des notaires de Paris (Archives nationales)', kind: 'notaire', home: 'https://www.siv.archives-nationales.culture.gouv.fr/siv/', domain: 'francearchives.gouv.fr', verified: 'partiel', lot2: 'an_minutier',
            note: 'Les actes des notaires parisiens (contrats de mariage, inventaires après décès, testaments). Cote : MC/ET/ + l’étude en chiffres romains + l’article.',
            build: p => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent([clean(p.last), firstOnly(p.first), 'minutier central'].filter(Boolean).join(' '))}&es_publisher=34633`},
        {key: 'siv', group: 'fr_notaires', icon: '🗄', label: 'Salle des inventaires virtuelle (Archives nationales)', kind: 'notaire', home: 'https://www.siv.archives-nationales.culture.gouv.fr/siv/', domain: 'siv.archives-nationales.culture.gouv.fr', verified: 'non', copy: true, lot2: 'an_siv',
            note: 'Les répertoires des notaires, étude par étude : colle le nom dans la recherche de la salle.', build: () => 'https://www.siv.archives-nationales.culture.gouv.fr/siv/'},
        // 🇫🇮 Finlande
        {key: 'hiski', group: 'fi', icon: '⛪', label: 'HisKi — actes des paroisses de Finlande', kind: 'hiski', home: 'https://hiski.genealogia.fi/hiski?fi', domain: 'hiski.genealogia.fi', verified: 'non', copy: true,
            note: 'Baptêmes, mariages, sépultures et départs relevés dans les registres luthériens (XVIIe–XIXe siècle). Choisis la paroisse, puis colle le nom. Les prénoms sont en suédois ou en finnois (Johan / Juho, Maria / Maija).',
            build: () => 'https://hiski.genealogia.fi/hiski?fi'},
        // 🇬🇧 Royaume-Uni
        {key: 'oldbailey', group: 'uk', icon: '⚖', label: 'Old Bailey Online — procès de Londres (1674-1913)', kind: 'oldbailey', home: 'https://www.oldbaileyonline.org/', domain: 'oldbaileyonline.org', verified: 'non',
            note: 'Près de 200 000 procès jugés à la cour criminelle de Londres : accusés, victimes et témoins, avec le texte du procès.',
            build: p => `https://www.oldbaileyonline.org/search/crime?text=${encodeURIComponent(nameOf(p))}`},
        {key: 'scotlandspeople', group: 'uk', icon: '🏴', label: 'ScotlandsPeople — état civil et paroisses d’Écosse', kind: 'document', home: 'https://www.scotlandspeople.gov.uk/', domain: 'scotlandspeople.gov.uk', verified: 'non', paid: true,
            note: 'Payant : la recherche dans les index est gratuite avec un compte, mais voir un acte demande d’acheter des crédits.', build: () => 'https://www.scotlandspeople.gov.uk/'},
        // 💶 Sites payants (déjà dans « Chercher sur internet » : la même adresse, avec la mention claire)
        {key: 'ancestry', group: 'payant', icon: '🌳', label: 'Ancestry', kind: 'document', home: 'https://www.ancestry.fr/', domain: 'ancestry.fr', verified: 'oui', paid: true, existing: 'ancestry',
            note: 'Payant : abonnement pour voir la plupart des actes et des arbres. La recherche est possible sans payer.',
            build: p => `https://www.ancestry.fr/search/?name=${enc(firstOnly(p.first))}_${enc(p.last)}${yearOf(p.y1) ? `&birth=${yearOf(p.y1)}` : ''}`},
        {key: 'myheritage', group: 'payant', icon: '🌳', label: 'MyHeritage', kind: 'document', home: 'https://www.myheritage.fr/', domain: 'myheritage.fr', verified: 'oui', paid: true, existing: 'myheritage',
            note: 'Payant : abonnement pour voir les actes et contacter les autres arbres.',
            build: p => { const slug = v => fold(v).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return `https://www.myheritage.fr/names/${slug(firstOnly(p.first))}_${slug(p.last)}`; }},
        {key: 'filae', group: 'payant', icon: '🌳', label: 'Filae', kind: 'document', home: 'https://www.filae.com/', domain: 'filae.com', verified: 'oui', paid: true, existing: 'filae',
            note: 'Payant : abonnement pour voir les relevés et les images des actes.', build: p => { const a = yearOf(p.y1), b = yearOf(p.y2); return `https://www.filae.com/search?ln=${enc(p.last)}&fn=${enc(firstOnly(p.first))}${a ? `&sy=${a}&ey=${b || a}` : ''}`; }},
        {key: 'geneanet_premium', group: 'payant', icon: '🌳', label: 'Geneanet (partie Premium)', kind: 'document', home: 'https://www.geneanet.org/', domain: 'geneanet.org', verified: 'oui', partlyPaid: true, existing: 'geneanet',
            note: 'Geneanet est gratuit : arbres, relevés collaboratifs, entraide. Seule une partie est payante (Premium : certains relevés, la recherche avancée, les alertes).',
            build: p => `https://www.geneanet.org/fonds/individus/?go=1&nom=${enc(p.last)}&prenom=${enc(firstOnly(p.first))}`},
    ];
    const site = key => SITES.find(s => s.key === key) || null;

    /** un modèle d'adresse écrit par la personne : {nom}, {prénom}, {nom_complet}, {lieu}, {de}, {à}, {port}, {requête} */
    function fill(template, p = {}) {
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: town(p.place), de: yearOf(p.y1) || '', a: yearOf(p.y2) || '', port: town(p.port), requete: fullText(p)};
        return String(template).replace(/\{([^{}]{1,20})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    /** l'adresse à ouvrir : celle écrite dans « ⚙️ Adresses des sites » si elle est sûre, sinon celle de l'app */
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        try { return cleanUrl(s.build(p)) || cleanUrl(s.home) || ''; } catch (_) { return cleanUrl(s.home) || ''; }
    }
    /** la même recherche par Google, limitée au site : le secours d'une adresse qui n'a pas pu être vérifiée */
    function googleUrl(key, p = {}) {
        const s = site(key); if (!s || !s.domain || s.verified === 'oui') return '';
        const words = [nameOf(p) ? q(nameOf(p)) : '', town(p.place) && s.group === 'fr_bn' ? q(town(p.place)) : ''];
        return words.some(Boolean) ? google(s.domain, words) : '';
    }
    /** ce qu'on colle dans la case d'un site qui ne garde pas la recherche dans son adresse */
    const copyText = (key, p = {}) => [clean(p.last).toUpperCase(), firstOnly(p.first)].filter(Boolean).join(' ');
    /** « Gratuites seulement » : enlève les payants ; sinon, les payants passent à la fin (jamais en premier) */
    function visible(list, freeOnly = true) {
        const l = (list || []).filter(s => !freeOnly || !s.paid);
        return [...l.filter(s => !s.paid && !s.partlyPaid), ...l.filter(s => s.partlyPaid && !s.paid), ...l.filter(s => s.paid)];
    }
    /** les bibliothèques numériques à proposer pour un lieu : celles de sa région d'abord */
    function libraryFor(where) {
        const r = regionOf(where); const all = SITES.filter(s => s.group === 'fr_bn');
        return {region: r, mine: r ? all.filter(s => s.region === r.key) : [], others: r ? all.filter(s => s.region !== r.key) : all,
            text: r ? `${r.label}${r.near ? ' (Bretagne historique)' : ''} : ${all.filter(s => s.region === r.key).map(s => s.label.split(' — ')[0]).join(', ')}.` : 'Ce lieu n’est dans aucune des régions qui ont une de ces bibliothèques : elles restent proposées, tu peux chercher dedans quand même.'};
    }

    /* ═════ Lire une date : « 12-03-1850 », « 1850-03-12 », « 18500312 », « 12 mars 1850 », « 3rd June 1780 » → C4 ═════ */
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTH_WORDS = {janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
        january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
        tammikuu: 1, helmikuu: 2, maaliskuu: 3, huhtikuu: 4, toukokuu: 5, kesakuu: 6, heinakuu: 7, elokuu: 8, syyskuu: 9, lokakuu: 10, marraskuu: 11, joulukuu: 12};
    const frDate = (d, m, y) => [d ? (d === 1 ? '1er' : String(d)) : '', m ? MOIS[m - 1] : '', y].filter(Boolean).join(' ');
    function readDate(s) {
        const t = fold(s).replace(/(\d)(st|nd|rd|th)\b/g, '$1');
        let m = t.match(/\b(1[0-9]\d\d)(\d\d)(\d\d)\b/); if (m && +m[2] <= 12 && +m[3] <= 31) return {text: frDate(+m[3], +m[2], +m[1]), year: +m[1]};
        m = t.match(/\b(1[0-9]\d\d|20\d\d)-(\d{1,2})-(\d{1,2})\b/); if (m && +m[2] >= 1 && +m[2] <= 12) return {text: frDate(+m[3], +m[2], +m[1]), year: +m[1]};
        m = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](1[0-9]\d\d|20\d\d)\b/); if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) return {text: frDate(+m[1], +m[2], +m[3]), year: +m[3]};
        m = t.match(/\b(\d{1,2})\.?\s+(?:of\s+)?([a-z]{3,10})\.?,?\s+(1[0-9]\d\d|20\d\d)\b/); if (m && MONTH_WORDS[m[2]]) return {text: frDate(+m[1], MONTH_WORDS[m[2]], +m[3]), year: +m[3]};
        m = t.match(/\b([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(1[0-9]\d\d|20\d\d)\b/); if (m && MONTH_WORDS[m[1]]) return {text: frDate(+m[2], MONTH_WORDS[m[1]], +m[3]), year: +m[3]};
        m = t.match(/\b(1[0-9]\d\d|20\d\d)-(\d{1,2})\b/); if (m && +m[2] >= 1 && +m[2] <= 12) return {text: frDate(0, +m[2], +m[1]), year: +m[1]};
        m = t.match(/\b(1[0-9]\d\d|20\d\d)\b/); if (m) return {text: m[1], year: +m[1]};
        return {text: '', year: 0};
    }
    const decodeEntities = s => String(s).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (x, e) => {
        if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
        return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '}[e.toLowerCase()] || x; });
    /** le texte d'une page enregistrée (sans balises) ; un .xml ou un .json est gardé tel quel pour les lecteurs ci-dessous */
    const stripHtml = s => decodeEntities(String(s).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th|\/dt|\/dd)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t ]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();

    /* ═════ Une notice d'auteur : IdRef (texte, .xml UNIMARC, .json) ou data.bnf.fr (texte, page, JSON-LD) ═════ */
    function parseAuthority(raw) {
        const s = String(raw ?? '').slice(0, 2_000_000); const out = {};
        const set = (k, v) => { const t = clean(v).replace(/^[,;:.\s]+|[,;:.\s]+$/g, ''); if (t && !out[k]) out[k] = t.slice(0, 300); };
        // 1. UNIMARC (IdRef : « Télécharger → UNIMARC XML ») : 001 PPN, 103 $a naissance $b mort, 200 $a nom $b prénom $f dates, 340 $a biographie
        if (/<record\b|<datafield\b/i.test(s)) {
            const sub = (tag, code) => { const f = s.match(new RegExp(`<datafield[^>]*tag=["']${tag}["'][^>]*>([\\s\\S]*?)</datafield>`, 'i')); if (!f) return ''; const m = f[1].match(new RegExp(`<subfield[^>]*code=["']${code}["'][^>]*>([\\s\\S]*?)</subfield>`, 'i')); return m ? decodeEntities(m[1]) : ''; };
            const ppn = s.match(/<controlfield[^>]*tag=["']001["'][^>]*>\s*([0-9]{8}[0-9X])\s*</i); if (ppn) { out.idref = ppn[1]; out.source = 'idref'; }
            set('last', sub('200', 'a')); set('first', sub('200', 'b'));
            const b = sub('103', 'a').replace(/[^0-9X?]/g, ''), d = sub('103', 'b').replace(/[^0-9X?]/g, '');
            if (/^1\d{3}/.test(b)) set('birth_date', readDate(b.length >= 8 ? b.slice(0, 8) : b.slice(0, 4)).text);
            if (/^1\d{3}|^20\d\d/.test(d)) set('death_date', readDate(d.length >= 8 ? d.slice(0, 8) : d.slice(0, 4)).text);
            const f = sub('200', 'f'); const fm = f.match(/(1\d{3})\s*-\s*(1\d{3}|20\d\d)?/); if (fm) { set('birth_date', fm[1]); if (fm[2]) set('death_date', fm[2]); }
            set('note', sub('340', 'a'));
            const isni = s.match(/<datafield[^>]*tag=["']010["'][^>]*>[\s\S]*?<subfield[^>]*code=["']a["'][^>]*>\s*([0-9 ]{16,19}X?)\s*</i); if (isni) set('isni', isni[1].replace(/\s/g, ''));
        }
        // 2. JSON / JSON-LD (data.bnf.fr, IdRef .json) : dateOfBirth, birth, placeOfBirth…
        if (/^\s*[[{]/.test(s) || /"@context"|"dateOfBirth"|"rdagroup2elements/.test(s)) {
            const pick = re => { const m = s.match(re); return m ? decodeEntities(m[1]) : ''; };
            const val = keyRe => pick(new RegExp(`"[\\w:]*(?:${keyRe})"\\s*:\\s*(?:\\{\\s*"@value"\\s*:\\s*)?(?:\\[\\s*)?"([^"]{1,200})"`, 'i'));
            const by = val('dateOfBirth|birthDate|birth'); if (by) set('birth_date', readDate(by).text || by);
            const dy = val('dateOfDeath|deathDate|death'); if (dy) set('death_date', readDate(dy).text || dy);
            set('birth_place', val('placeOfBirth|birthPlace')); set('death_place', val('placeOfDeath|deathPlace'));
            set('last', val('familyName|lastName')); set('first', val('givenName|firstName'));
            const ark = s.match(/ark:\/12148\/(cb\d{8}[0-9a-z])/i); if (ark) { out.ark = ark[1]; out.source = out.source || 'databnf'; }
            const ppn = s.match(/idref\.fr\/(\d{8}[\dX])\b/); if (ppn) { out.idref = out.idref || ppn[1]; out.source = out.source || 'idref'; }
        }
        // 3. Le texte de la page (copié ou page enregistrée) : « Naissance : Lyon, 12-03-1850 » · « Mort : 1920 » · « Né à … le … »
        const text = /<html|<body|<div|<p\b/i.test(s) ? stripHtml(s) : s;
        const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4000);
        const LAB = {birth: /^(naissance|ne\(e\)|ne|nee|date de naissance|birth|born|syntynyt)$/, death: /^(mort|deces|date de mort|date de deces|death|died|kuollut)$/,
            birth_place: /^(lieu de naissance|place of birth)$/, death_place: /^(lieu de deces|lieu de mort|place of death)$/, isni: /^isni$/, idref: /^(ppn|identifiant idref|idref)$/, note: /^(note|notes|biographie|note biographique|informations|activite|profession)$/,
            name: /^(nom|forme retenue|point d'acces autorise|nom de personne|forme internationale)$/};
        const keyOf = lab => { const f = fold(lab).replace(/\s*:\s*$/, ''); for (const [k, re] of Object.entries(LAB)) if (re.test(f)) return k; return null; };
        const datePlace = (k, v) => {
            const d = readDate(v); const rest = clean(v.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\s+[a-zéû]{3,10}\.?\s+\d{4}\b|\b1\d{3}\b|\b20\d\d\b/gi, ' ').replace(/^\s*(le|en|a|à|vers)\s+/i, '').replace(/[,;]\s*$/, '').replace(/^[,;\s]+/, ''));
            if (d.text) set(k + '_date', d.text);
            if (rest && /\p{L}{2,}/u.test(rest) && !/^(le|en|vers|avant|apres)$/i.test(rest)) set(k + '_place', rest.replace(/\s*\((.*)\)\s*$/, ', $1'));
        };
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^([^:]{2,40}?)\s*:\s*(.*)$/); let k = null, v = '';
            if (m) { k = keyOf(m[1]); v = m[2]; if (k && !v && lines[i + 1]) { v = lines[i + 1]; i++; } }
            else { k = keyOf(lines[i]); if (k && lines[i + 1] && !keyOf(lines[i + 1])) { v = lines[i + 1]; i++; } }
            if (!k || !v) continue;
            if (k === 'birth' || k === 'death') datePlace(k, v);
            else if (k === 'name') { const n = v.match(/^([^,(]+),\s*([^,(]+?)\s*(?:\((.*)\))?$/); if (n) { set('last', n[1]); set('first', n[2]); if (n[3]) { const y = n[3].match(/(1\d{3})\s*-\s*(1\d{3}|20\d\d)?/); if (y) { set('birth_date', y[1]); if (y[2]) set('death_date', y[2]); } } } }
            else if (k === 'isni') set('isni', v.replace(/\s/g, '').slice(0, 20));
            else if (k === 'idref') { const p = v.match(/\b(\d{8}[\dX])\b/); if (p) out.idref = out.idref || p[1]; }
            else set(k, v);
        }
        // « Né à Lyon le 12 mars 1850 », « morte à Paris en 1920 »
        const ne = text.match(/\bn[ée]e?\s+(?:à|a)\s+([A-ZÉÈÀ][\p{L}' -]{1,60}?)(?:\s*\(([^)]{2,40})\))?,?\s+(?:le|en)\s+([^.;,\n]{3,30})/u); if (ne) { set('birth_place', ne[2] ? `${ne[1]}, ${ne[2]}` : ne[1]); set('birth_date', readDate(ne[3]).text); }
        const mo = text.match(/\b(?:mort|morte|décédée?|decedee?)\s+(?:à|a)\s+([A-ZÉÈÀ][\p{L}' -]{1,60}?)(?:\s*\(([^)]{2,40})\))?,?\s+(?:le|en)\s+([^.;,\n]{3,30})/u); if (mo) { set('death_place', mo[2] ? `${mo[1]}, ${mo[2]}` : mo[1]); set('death_date', readDate(mo[3]).text); }
        // Le titre de la page : « Victor Hugo (1802-1885) - Auteur - Ressources de la Bibliothèque nationale de France »
        const head = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || lines[0] || '';
        const hy = decodeEntities(head).match(/^\s*([^()\n]{2,80}?)\s*\((1\d{3})\s*-\s*(1\d{3}|20\d\d)?\)/);
        if (hy) { if (!out.last && !out.first) { const parts = clean(hy[1]).split(/\s+/); if (parts.length > 1) { set('first', parts.slice(0, -1).join(' ')); set('last', parts[parts.length - 1]); } } set('birth_date', hy[2]); if (hy[3]) set('death_date', hy[3]); }
        if (!out.ark) { const a = s.match(/ark:\/12148\/(cb\d{8}[0-9a-z])/i); if (a) out.ark = a[1]; }
        if (!out.idref) { const p = s.match(/idref\.fr\/(\d{8}[\dX])\b/); if (p) out.idref = p[1]; }
        if (!out.source) out.source = /data\.bnf\.fr|bibliotheque nationale|bnf/i.test(s) ? 'databnf' : /idref/i.test(s) ? 'idref' : '';
        if (out.last && out.last === out.last.toUpperCase() && out.last.length > 1) out.last = out.last.charAt(0) + out.last.slice(1).toLowerCase();
        return out;
    }

    /* ═════ Un procès de l'Old Bailey : « Reference Number: t17800628-33 », « Offence: Theft > grand larceny », « Verdict: Guilty » ═════ */
    const OFFENCE_FR = {theft: 'vol', 'grand larceny': 'vol simple (grand larceny)', 'petty larceny': 'menu vol', 'pocketpicking': 'vol à la tire', burglary: 'cambriolage', 'highway robbery': 'vol sur la grand-route', robbery: 'vol avec violence',
        'killing': 'homicide', murder: 'meurtre', manslaughter: 'homicide involontaire', 'deception': 'escroquerie', forgery: 'faux', fraud: 'fraude', 'coining offences': 'fausse monnaie', 'violent theft': 'vol avec violence',
        'royal offences': 'crime contre le roi', 'sexual offences': 'atteinte aux mœurs', bigamy: 'bigamie', 'breaking peace': 'trouble à l’ordre public', assault: 'coups et blessures', riot: 'émeute', 'damage to property': 'dégradation', arson: 'incendie volontaire', 'receiving': 'recel'};
    const VERDICT_FR = {guilty: 'coupable', 'not guilty': 'non coupable', 'special verdict': 'verdict spécial', 'miscellaneous': 'autre décision', 'theft under 40s': 'coupable (vol de moins de 40 shillings)', 'lesser offence': 'coupable d’un délit moindre'};
    const PUNISH_FR = {death: 'peine de mort', transportation: 'déportation (transportation)', imprisonment: 'prison', 'corporal': 'peine corporelle', whipping: 'fouet', 'branding': 'marque au fer', 'pillory': 'pilori', 'fine': 'amende', 'military/naval duty': 'service dans l’armée ou la marine', 'no punishment': 'sans peine', 'respited': 'sursis', 'hard labour': 'travaux forcés', 'penal servitude': 'travaux forcés'};
    const tr = (dict, v) => { const f = fold(v); for (const [k, t] of Object.entries(dict)) if (f.includes(k)) return t; return ''; };
    function parseOldBailey(raw) {
        const s = /<html|<body/i.test(raw) ? stripHtml(raw) : String(raw ?? ''); const out = {};
        const ref = s.match(/\b([ts])(1[67]\d\d|18\d\d|19[01]\d)(\d\d)(\d\d)-(\d{1,4})\b/);
        if (ref) { out.ref = ref[0]; out.date = frDate(+ref[4], +ref[3], +ref[2]); out.year = +ref[2]; }
        const lab = re => { const m = s.match(re); return m ? clean(m[1]).slice(0, 300) : ''; };
        const off = lab(/\bOffen[cs]e\s*:\s*([^\n]+)/i), ver = lab(/\bVerdict\s*:\s*([^\n]+)/i), pun = lab(/\b(?:Punishment|Sentence)\s*:\s*([^\n]+)/i);
        if (off) { out.offence = off; out.offence_fr = tr(OFFENCE_FR, off.split('>').pop()) || tr(OFFENCE_FR, off); }
        if (ver) { out.verdict = ver; out.verdict_fr = tr(VERDICT_FR, ver.toLowerCase().startsWith('not guilty') ? 'not guilty' : ver); }
        if (pun) { out.punishment = pun; out.punishment_fr = tr(PUNISH_FR, pun); }
        if (!out.date) { const d = lab(/\b(?:Date|Session date|Trial date)\s*:\s*([^\n]+)/i); if (d) { const r = readDate(d); out.date = r.text; out.year = r.year; } }
        const def = s.match(/\b([A-Z][A-Z' -]{3,60}?)\s*,?\s+(?:was|were)\s+indicted\b/); if (def) out.defendant = clean(def[1]).replace(/\b(\w)(\w*)/g, (x, a, b) => a + b.toLowerCase());
        const vic = s.match(/\bindicted for [^,.\n]{0,80}?(?:of|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})/); if (vic) out.victim = clean(vic[1]);
        out.place = 'Londres (Old Bailey)';
        return out;
    }
    const ROLE_LABEL = {accuse: 'Accusé au procès', victime: 'Victime dans un procès', temoin: 'Témoin dans un procès'};

    /* ═════ HisKi : le texte copié d'une page de résultats (une ligne par acte) ═════ */
    const HISKI_SECTIONS = [[/kastetut|dopta|döpta|baptisms|baptised|christenings/i, 'CHR'], [/haudatut|begravda|burials|buried|deaths/i, 'BURI'], [/vihityt|vigda|marriages|married/i, 'MARR'], [/muuttaneet|flyttade|migration|moved/i, 'EVEN']];
    function parseHisKi(raw) {
        const s = /<html|<body/i.test(raw) ? stripHtml(raw) : String(raw ?? '');
        const rows = []; let tag = '', parish = '';
        for (const line0 of s.split(/\r?\n/).slice(0, 3000)) {
            const line = line0.replace(/\s+/g, ' ').trim(); if (!line) continue;
            const sec = HISKI_SECTIONS.find(([re]) => re.test(line) && !/\d{1,2}\.\d{1,2}\.\d{4}/.test(line)); if (sec) { tag = sec[1]; const p = line.match(/^([\p{L} -]{3,40}?)\s*[-–:]\s*(?:kastetut|haudatut|vihityt|muuttaneet|döpta|begravda|vigda|flyttade|baptisms|burials|marriages)/iu); if (p) parish = clean(p[1]); continue; }
            const dates = [...line.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(1[5-9]\d\d)\b/g)];
            if (!dates.length) continue;
            const d0 = dates[0], d1 = dates[1];
            const rest = clean(line.replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, ' ')).slice(0, 300);
            const row = {tag: tag || 'EVEN', date: frDate(+d0[1], +d0[2], +d0[3]), year: +d0[3], date2: d1 ? frDate(+d1[1], +d1[2], +d1[3]) : '', parish, text: rest, line: line.slice(0, 400)};
            if (row.tag === 'CHR') { row.birth = row.date; row.date = row.date2 || row.date; }
            if (row.tag === 'BURI') { row.death = row.date; row.date = row.date2 || row.date; }
            rows.push(row);
            if (rows.length >= 200) break;
        }
        return {ok: rows.length > 0, rows, error: rows.length ? '' : 'Je ne trouve pas de ligne d’acte (une date écrite 12.3.1780). Copie le tableau des résultats de HisKi, titres compris.'};
    }
    /** les événements proposés par une ligne HisKi (baptême → naissance + baptême, sépulture → décès + inhumation) */
    function hiskiEvents(row) {
        const place = row.parish ? `${row.parish}, Finlande` : 'Finlande';
        if (row.tag === 'CHR') return [{tag: 'BIRT', label: 'Naissance', date: row.birth || '', place, note: row.text}, {tag: 'CHR', label: 'Baptême', date: row.date, place, note: row.text}].filter(e => e.date);
        if (row.tag === 'BURI') return [{tag: 'DEAT', label: 'Décès', date: row.death || '', place, note: row.text}, {tag: 'BURI', label: 'Inhumation', date: row.date, place, note: row.text}].filter(e => e.date);
        if (row.tag === 'MARR') return [{tag: 'MARR', label: 'Mariage', date: row.date, place, note: row.text}];
        return [{tag: 'EVEN', label: 'Départ (HisKi)', date: row.date, place, note: row.text}];
    }

    /* ═════ Ce qu'un lien collé dit déjà ═════ */
    function parseLink(raw) {
        const u = cleanUrl(raw); const out = {url: u, site: '', kind: '', idref: '', ark: '', ref: '', date: '', title: ''};
        if (!u) return out;
        let host = '', path = ''; try { const x = new URL(u); host = x.hostname.toLowerCase(); path = decodeURIComponent(x.pathname); } catch (_) { return out; }
        if (/(^|\.)idref\.fr$/.test(host)) { out.site = 'idref'; out.kind = 'auteur'; const m = path.match(/\/(\d{8}[\dX])\b/); if (m) out.idref = m[1]; }
        else if (/(^|\.)data\.bnf\.fr$/.test(host)) { out.site = 'databnf'; out.kind = 'auteur'; const a = u.match(/ark:\/12148\/(cb\d{8}[0-9a-z])/i) || path.match(/\/(?:fr\/|en\/)?(\d{8})\//); if (a) out.ark = /^cb/i.test(a[1]) ? a[1] : 'cb' + a[1]; }
        else if (/(^|\.)catalogue\.bnf\.fr$/.test(host)) { out.site = 'databnf'; out.kind = 'auteur'; const a = u.match(/ark:\/12148\/(cb\d{8}[0-9a-z])/i); if (a) out.ark = a[1]; }
        else if (/(^|\.)oldbaileyonline\.org$/.test(host)) { out.site = 'oldbailey'; out.kind = 'oldbailey'; const m = u.match(/\b([ts])(1[67]\d\d|18\d\d|19[01]\d)(\d\d)(\d\d)-(\d{1,4})\b/); if (m) { out.ref = m[0]; out.date = frDate(+m[4], +m[3], +m[2]); } }
        else if (/(^|\.)hiski\.genealogia\.fi$/.test(host)) { out.site = 'hiski'; out.kind = 'hiski'; }
        else if (/(^|\.)wikisource\.org$/.test(host)) { out.site = 'wikisource'; out.kind = 'document'; const m = path.match(/^\/wiki\/(.+)$/); if (m) out.title = m[1].replace(/_/g, ' ').slice(0, 200); }
        else if (/siv\.archives-nationales\.culture\.gouv\.fr$/.test(host)) { out.site = 'siv'; out.kind = 'notaire'; }
        else { const s = SITES.find(x => x.domain && x.group !== 'payant' && (host === x.domain || host.endsWith('.' + x.domain))); if (s) { out.site = s.key; out.kind = s.kind; } }
        return out;
    }

    /* ═════ « Chercher sur internet » : les nouveaux sites, et ceux qui sont payants ═════ */
    /** les sites payants (pastille « PAYANT », cachés par « Gratuites seulement ») et ceux qui ne le sont qu'en partie */
    const PAID = ['ancestry', 'myheritage', 'filae', 'findmypast', 'newspapers', 'so6_scotlandspeople'];
    const PARTLY_PAID = {geneanet: 'Gratuit ; une partie (Premium) est payante', retronews: 'Gratuit en partie ; certains journaux et la lecture complète demandent un abonnement'};
    /** au format de « Chercher sur internet » (app.js) : [clé, nom, rubrique, adresse(p)] ; les sites déjà présents ne sont pas ajoutés */
    function webSites(custom = {}) {
        return SITES.filter(s => !s.existing && s.group !== 'fr_notaires').map(s => [`so6_${s.key}`, s.label, groupOf(s.group)?.label || 'Autres',
            p => url(s.key, {first: p.first, last: p.last, place: p.place, y1: p.y1, y2: p.y2, port: p.place}, custom)]);
    }
    const isPaidKey = k => PAID.includes(k);

    return {CHECKED, MENTION, FREE_KEY, SITES, GROUPS, REGIONS, PORTS, PORT_NAMES, SHD_CENTRES, PAID, PARTLY_PAID, ROLE_LABEL, site, groupOf, url, fill, googleUrl, copyText, visible, regionOf, libraryFor,
        maritime, minutierCote, fromRoman, toRoman, readDate, parseAuthority, parseOldBailey, parseHisKi, hiskiEvents, parseLink, webSites, isPaidKey, cleanUrl, fold, yearOf};
});
