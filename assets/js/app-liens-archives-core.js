/* LCNDA — 🔗 Archives à consulter en lien (docs/donnees-manquantes.md, partie C, et B-26 / B-27 en lien de secours). Calculs purs,
 * SANS RÉSEAU (window.LCNDA_SO27 ; aussi require() dans Node pour les tests).
 *
 * Même modèle que les lots « sources ouvertes » (app-sources-ouvertes-8-core.js) : l'app N'INTERROGE JAMAIS ces sites. Elle ouvre
 * leur page dans le navigateur de la personne (↗) et, quand un site cherche par formulaire, met le nom dans le presse-papiers.
 * Découvert tout seul par « 🌍 Où chercher ? » (heritage-ou-chercher.js, nom de fenêtre LCNDA_SO27 → clés « so27_… ») et par la
 * fenêtre « Archives en ligne » (lot 27, app-archives-en-ligne-core.js). heritage-liens-archives.js s'en sert aussi pour Listes →
 * 🧰 Données (une carte « lien » par site, rangée dans son thème), la monographie de commune (liens du lieu), ⌘K et « 🧭 Je veux… ».
 *
 *  - SITES, GROUPS             les sites et leurs rubriques ; chaque site : source (le nom à citer), home, build(p) si une forme
 *                              d'adresse est connue, placeUrl(lieu) si le site cherche par commune, rel (règle de « Où chercher »),
 *                              theme (thème des Listes de données), words (mots de ⌘K et de « Je veux… »)
 *  - url(key, p, custom)       l'adresse pour une personne (p : first, last, place, y1, y2) ; custom = {clé: modèle} de « ⚙️ Adresses des sites »
 *  - placeLinks(place)         les liens d'une commune : [{key, label, source, href}] (France seulement, sauf HathiTrust)
 *  - match(q)                  ⌘K : les sites dont un mot est dans la question (≥ 2 lettres utiles), le meilleur d'abord
 *  - copyText(key, p), forPlace(where, ctx), paidBadge(s)
 *
 * Adresses : les formes Gallica (services/engine/search/sru) et FranceArchives (/fr/search?q=) sont celles déjà employées par
 * l'app ; HathiTrust (cgi/ls?q1=…) est la forme publique de sa recherche plein texte ; les autres sites ouvrent leur page
 * d'accueil ou de recherche (aucune page n'a pu être ouverte depuis l'atelier le 26/11/2026 : verified 'non' ou 'partiel').
 * Personnes vivantes : « Où chercher » et les liens partent seulement du navigateur, sur un clic ; le STO n'est proposé qu'aux
 * personnes décédées (rel.deadOnly, vérifié par heritage-liens-archives.js).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_SO27 = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const CHECKED = '2026-11-26';
    const T = x => (typeof window !== 'undefined' && window.LCNDA_I18N ? window.LCNDA_I18N.t(x) : x);
    const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const enc = v => encodeURIComponent(clean(v));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const firstOnly = s => clean(s).split(/\s+/)[0] || '';
    const cleanUrl = u => { const s = String(u ?? '').trim(); return /^https:\/\/[^\s<>"'`]+$/i.test(s) && s.length <= 2000 ? s : ''; };
    const years = p => { let a = Number(p.y1) || Number(p.birthYear) || 0, b = Number(p.y2) || Number(p.deathYear) || 0; if (a && b && b < a) [a, b] = [b, a]; return [a, b || a]; };
    const town = s => clean(s).split(',')[0].replace(/\s*\(.*\)\s*$/, '').trim();
    const nameOf = p => [firstOnly(p.first), clean(p.last)].filter(Boolean).join(' ');
    const q = s => String(s).replace(/"/g, '');
    /** une recherche Gallica (la forme déjà employée dans l'app) : tous les mots, ET */
    const gallica = parts => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(parts.filter(Boolean).map(x => `(gallica all "${q(x)}")`).join(' and '))}`;
    const francearchives = words => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(words.filter(Boolean).join(' '))}`;
    const hathi = text => `https://babel.hathitrust.org/cgi/ls?q1=${encodeURIComponent(`"${q(text)}"`)}&anyall1=phrase&lmt=ft`;

    const GROUPS = [
        {id: 'france', icon: '🇫🇷', label: 'France', country: 'France'},
        {id: 'guerres', icon: '⚔️', label: 'Soldats et guerres', country: 'France'},
        {id: 'emigration', icon: '🚢', label: 'Émigration', country: 'Monde'},
        {id: 'allemagne', icon: '🇩🇪', label: 'Allemagne', country: 'Allemagne'},
        {id: 'quebec', icon: '🇨🇦', label: 'Québec', country: 'Canada'},
        {id: 'livres', icon: '📚', label: 'Livres numérisés', country: 'Monde'},
    ];

    /* ═════ Les sites ═════
     * source : le nom du site, cité partout (« ↗ … — Gallica ») ; years : période couverte ; rel : la règle de « Où chercher »
     * (pays, années de naissance, profils, événements, une phrase « pourquoi ») ; theme / words : Listes de données, ⌘K, Je veux… */
    const S = o => ({verified: 'non', paid: false, where: ['fiche'], kind: 'acte', ...o});
    const SITES = [
        S({key: 'bulletin_lois', group: 'france', country: 'France', icon: '📜', label: 'Bulletin des lois — naturalisations, pensions, changements de nom (1789-1931)', source: 'Gallica (BnF)',
            home: 'https://gallica.bnf.fr/', verified: 'partiel', years: [1789, 1931], theme: 'pouvoirs', words: 'bulletin des lois naturalisation naturalise pension changement de nom decret',
            build: p => gallica([nameOf(p) || p.last, 'Bulletin des lois']),
            rel: {countries: ['fr'], from: 1789, to: 1931, events: ['NATU'], profiles: ['emigrant', 'soldier'], base: 0.6, why: () => T('Le Bulletin des lois publiait les naturalisations, les pensions et les changements de nom : une recherche plein texte dans Gallica')}}),
        S({key: 'cie_indes', group: 'france', country: 'France', icon: '⚓', label: 'Compagnie des Indes — rôles d’équipage (1720-1794)', source: 'Mémoire des hommes (SHD Lorient)',
            home: 'https://www.memoiredeshommes.sga.defense.gouv.fr/', copy: 'name', years: [1700, 1794], where: ['fiche', 'marin'], theme: 'routes', words: 'compagnie des indes lorient role d equipage marin matelot navire',
            rel: {countries: ['fr'], born: [1680, 1780], profiles: ['sailor'], base: 0.3, why: () => T('Un marin du XVIIIᵉ siècle : les rôles d’équipage des navires de la Compagnie des Indes (Lorient)')}}),
        S({key: 'sto', group: 'guerres', country: 'France', icon: '🏭', label: 'STO, requis du travail obligatoire (1942-1945)', source: 'FranceArchives · SHD Caen (DAVCC)',
            home: 'https://francearchives.gouv.fr/', verified: 'partiel', years: [1900, 1945], where: ['fiche', 'militaire'], theme: 'guerres', words: 'sto service du travail obligatoire requis travail obligatoire allemagne 1943 refractaire',
            build: p => francearchives(['STO', 'travail obligatoire', clean(p.last)]),
            rel: {countries: ['fr'], born: [1905, 1927], sex: 'male', base: 0.4, why: () => T('Né entre 1905 et 1927 : peut-être requis du STO ; dossiers au SHD de Caen et dans les archives des départements')}}),
        S({key: 'medaille_resistance', group: 'guerres', country: 'France', icon: '🎖', label: 'Médaille de la Résistance — base des médaillés', source: 'Ordre de la Libération',
            home: 'https://www.ordredelaliberation.fr/', copy: 'name', years: [1870, 1945], where: ['fiche', 'militaire', 'recompense'], theme: 'guerres', sensitive: true, words: 'medaille de la resistance medaille resistant resistance decoration ordre de la liberation',
            rel: {countries: ['fr'], born: [1870, 1930], profiles: ['resistant'], require: ['profile'], base: 0.3, why: () => T('Un résistant : la base des médaillés de la Résistance (Ordre de la Libération)')}}),
        S({key: 'emigres', group: 'france', country: 'France', icon: '🏰', label: 'Liste générale des émigrés de la Révolution (1793-1800)', source: 'Gallica · Archives nationales (F⁷)',
            home: 'https://gallica.bnf.fr/', verified: 'partiel', years: [1700, 1800], theme: 'pouvoirs', words: 'emigre emigres revolution liste generale des emigres f7 noblesse fuite',
            build: p => gallica([clean(p.last), 'liste générale des émigrés']),
            rel: {countries: ['fr'], born: [1710, 1785], profiles: ['noble', 'clergy', 'emigrant'], base: 0.3, why: () => T('Vivant sous la Révolution : la liste générale des émigrés (Gallica) et la série F⁷ des Archives nationales')}}),
        S({key: 'conscription', group: 'guerres', country: 'France', icon: '🎲', label: 'Tirage au sort et listes de conscription (an VII - 1872)', source: 'FranceArchives · série R des Archives départementales',
            home: 'https://francearchives.gouv.fr/', verified: 'partiel', years: [1778, 1852], where: ['fiche', 'militaire', 'lieu'], byPlace: true, theme: 'guerres', words: 'tirage au sort conscription conscrit listes de conscription serie r recrutement an vii',
            build: p => francearchives(['tirage au sort', 'conscription', town(p.place)]),
            placeUrl: pl => francearchives(['tirage au sort', 'conscription', town(pl.name)]),
            rel: {countries: ['fr'], born: [1778, 1852], sex: 'male', base: 0.5, why: () => T('Un homme né entre 1778 et 1852 : les listes du tirage au sort de son canton (série R des Archives départementales), en plus des matricules')}}),
        S({key: 'gardes_mobiles', group: 'guerres', country: 'France', icon: '🪖', label: 'Gardes mobiles et armée de la Loire (1870-1871)', source: 'FranceArchives · Mémoire des hommes · SHD',
            home: 'https://francearchives.gouv.fr/', verified: 'partiel', years: [1825, 1851], build: p => francearchives(['garde mobile', '1870', clean(p.last)]), where: ['fiche', 'militaire'], theme: 'guerres', words: 'garde mobile gardes mobiles armee de la loire 1870 1871 guerre franco prussienne',
            rel: {countries: ['fr'], born: [1825, 1851], sex: 'male', base: 0.4, why: () => T('Un homme en âge de servir en 1870 : la garde mobile et l’armée de la Loire')}}),
        S({key: 'gedbas', group: 'allemagne', country: 'Allemagne', icon: '🌳', label: 'GEDBAS — arbres de généalogistes allemands', source: 'genealogy.net (Verein für Computergenealogie)',
            home: 'https://gedbas.genealogy.net/', copy: 'name', kind: 'arbre', theme: 'personnes', words: 'gedbas genealogy net allemand allemagne arbre deutsch',
            rel: {countries: ['de', 'at'], base: 0.6, missing: ['birth', 'parents', 'father', 'mother'], why: () => T('Une famille d’Allemagne : les arbres déposés par les généalogistes allemands (GEDBAS)')}}),
        S({key: 'hambourg', group: 'emigration', country: 'Allemagne', icon: '🚢', label: 'Listes de passagers de Hambourg (1850-1934)', source: 'Staatsarchiv Hamburg',
            home: 'https://www.hamburg.de/staatsarchiv/', copy: 'name', years: [1850, 1934], where: ['fiche', 'emigration'], theme: 'routes', words: 'hambourg hamburg passagers liste de passagers emigration amerique bateau',
            note: 'Les listes sont indexées chez un site payant : ici seulement le lien du Staatsarchiv.',
            rel: {countries: ['de', 'pl', 'cz', 'at', 'hu', 'ru', 'ua'], from: 1850, to: 1934, profiles: ['emigrant'], events: ['EMIG', 'IMMI'], base: 0.3, why: () => T('Une émigration par Hambourg : les listes de passagers (1850-1934)')}}),
        S({key: 'red_star_line', group: 'emigration', country: 'Belgique', icon: '⭐', label: 'Red Star Line — passagers partis d’Anvers (1873-1934)', source: 'Musée Red Star Line (Anvers)',
            home: 'https://www.redstarline.be/', copy: 'name', years: [1873, 1934], where: ['fiche', 'emigration'], theme: 'routes', words: 'red star line anvers antwerpen passagers emigration amerique bateau',
            rel: {countries: ['be', 'nl', 'us', 'ca'], from: 1873, to: 1934, profiles: ['emigrant'], events: ['EMIG', 'IMMI'], base: 0.3, why: () => T('Une émigration par Anvers : la base des passagers du musée Red Star Line')}}),
        S({key: 'drouin', group: 'quebec', country: 'Canada', icon: '⛪', label: 'Collection Drouin — registres du Québec (site payant)', source: 'Généalogie Québec (Institut Drouin)',
            home: 'https://www.genealogiequebec.com/', copy: 'name', paid: 'oui', kind: 'acte', theme: 'personnes', words: 'drouin quebec registres paroissiaux canada francais genealogie quebec',
            rel: {countries: ['ca'], base: 0.8, missing: ['birth', 'parents', 'marriage', 'death'], paid: true, why: () => T('Une famille du Québec : les registres de la collection Drouin (payant)')}}),
        S({key: 'hathitrust', group: 'livres', country: 'Monde', icon: '📚', label: 'HathiTrust — livres anciens numérisés (généalogies, annuaires américains)', source: 'HathiTrust Digital Library',
            home: 'https://www.hathitrust.org/', verified: 'partiel', kind: 'livre', where: ['fiche', 'lieu'], byPlace: true, theme: 'livres', words: 'hathitrust livres anciens numerises genealogie annuaire americain bibliotheque',
            build: p => hathi(nameOf(p) || p.last), placeUrl: pl => hathi(town(pl.name)),
            rel: {countries: ['us', 'ca', 'gb', 'ie'], base: 0.4, why: () => T('Des livres anciens numérisés (généalogies de familles, annuaires américains) : une recherche plein texte')}}),
        S({key: 'pages1418', group: 'guerres', country: 'France', icon: '💬', label: 'Forum Pages 14-18 — historiques des régiments, entraide', source: 'Pages 14-18',
            home: 'https://forum.pages14-18.com/', kind: 'aide', years: [1914, 1918], where: ['fiche', 'militaire'], theme: 'guerres', words: 'pages 14 18 forum regiment historique poilu entraide grande guerre',
            rel: {countries: ['fr'], born: [1865, 1901], profiles: ['soldier', 'mpf'], base: -0.6, why: () => T('Un soldat de 1914-1918 : l’historique de son régiment et l’entraide du forum Pages 14-18')}}), // un guide (years = années couvertes) : après sa fiche matricule et le JMO
        S({key: 'chtimiste', group: 'guerres', country: 'France', icon: '📖', label: 'Chtimiste — parcours des régiments 1914-1918', source: 'Chtimiste',
            home: 'https://www.chtimiste.com/', kind: 'aide', years: [1914, 1918], where: ['fiche', 'militaire'], theme: 'guerres', words: 'chtimiste regiment parcours historique poilu grande guerre 14 18',
            rel: {countries: ['fr'], born: [1865, 1901], profiles: ['soldier', 'mpf'], base: -0.6, why: () => T('Un soldat de 1914-1918 : le parcours de son régiment, jour après jour (Chtimiste)')}}), // un guide (years = années couvertes) : après sa fiche matricule et le JMO
        S({key: 'mercuriales', group: 'france', country: 'France', icon: '🌾', label: 'Prix du blé (mercuriales) et salaires — Annuaire statistique de la France', source: 'Gallica (BnF) · SGF',
            home: 'https://gallica.bnf.fr/', verified: 'partiel', kind: 'livre', where: ['lieu'], byPlace: true, theme: 'prix', words: 'prix du ble mercuriale mercuriales salaire salaires annuaire statistique sgf cout de la vie',
            build: () => gallica(['Annuaire statistique de la France', 'prix du blé']), placeUrl: pl => gallica(['mercuriales', town(pl.name)]),
            rel: {countries: ['fr'], base: 0.1, why: () => T('Le prix du blé et les salaires de son époque (Annuaire statistique de la France, Gallica)')}}),
        S({key: 'plaques_antibes', group: 'france', country: 'France', icon: '🪧', label: 'Plaques commémoratives d’Antibes (données ouvertes)', source: 'Ville d’Antibes · data.gouv.fr (Licence Ouverte)',
            home: 'https://www.data.gouv.fr/fr/datasets/?q=plaques%20comm%C3%A9moratives%20Antibes', verified: 'partiel', kind: 'lieu', where: ['lieu'], byPlace: true, theme: 'monuments',
            words: 'plaques commemoratives plaque antibes memoire rue', place: /antibes/, onlyPlace: /^antibes$/,
            placeUrl: () => 'https://www.data.gouv.fr/fr/datasets/?q=plaques%20comm%C3%A9moratives%20Antibes',
            rel: {countries: ['fr'], place: /antibes/, base: 0.2, why: () => T('Un lieu de sa vie est Antibes : les plaques commémoratives de la ville (données ouvertes)')}}),
    ];
    const BY = Object.fromEntries(SITES.map(s => [s.key, s]));
    const site = key => BY[key] || null;

    /** un modèle écrit dans « ⚙️ Adresses des sites » : {nom} {prenom} {nom_complet} {lieu} {de} {a} */
    function fill(template, p = {}) {
        const [a, b] = years(p);
        const vals = {nom: p.last, prenom: firstOnly(p.first), nom_complet: nameOf(p), lieu: town(p.place), commune: town(p.place), de: a || '', a: b || ''};
        return String(template).replace(/\{([^{}]{1,24})\}/g, (m, k) => { const key = fold(k).replace(/[^a-z_]/g, ''); return key in vals ? enc(vals[key]) : m; });
    }
    /** l'adresse : un modèle choisi, sinon la forme connue du site (avec le nom), sinon sa page de recherche ou d'accueil */
    function url(key, p = {}, custom = {}) {
        const s = site(key); if (!s) return '';
        const tpl = custom && typeof custom[key] === 'string' ? custom[key].trim() : '';
        if (tpl) { const u = cleanUrl(fill(tpl, p)); if (u) return u; }
        if (s.build && (clean(p.last) || !s.copy)) { const u = cleanUrl(s.build(p)); if (u) return u; }
        return cleanUrl(s.search) || cleanUrl(s.home);
    }
    function copyText(key, p = {}) {
        const s = site(key); if (!s || !s.copy) return '';
        return [clean(p.last).toUpperCase(), firstOnly(p.first)].filter(Boolean).join(' ');
    }
    function forPlace(where, ctx = {}) {
        const [a, b] = years(ctx);
        return SITES.filter(s => !where || (s.where || []).includes(where)).filter(s => !s.years || !(a && b && (b < s.years[0] || a > s.years[1])));
    }
    /** les liens d'une commune (monographie) : ceux qui cherchent par lieu ; les sites français seulement pour un lieu en France */
    function placeLinks(place = {}) {
        const name = town(place.name || place.title || ''); if (!name) return [];
        const c = fold(place.country || ''), fr = !c || /^(france|fr)$/.test(c);
        return SITES.filter(s => s.placeUrl && (s.country !== 'France' || fr) && (!s.onlyPlace || s.onlyPlace.test(fold(name))))
            .map(s => ({key: s.key, icon: s.icon, label: s.label, source: s.source, href: cleanUrl(s.placeUrl({...place, name}))})).filter(x => x.href);
    }
    function paidBadge(s) {
        const v = s && typeof s === 'object' ? s.paid : site(s)?.paid;
        if (v === 'oui' || v === true) return {text: 'Payant', kind: 'red', title: 'Il faut un abonnement payant pour voir les documents'};
        if (v === 'partiel') return {text: 'En partie payant', kind: 'yellow', title: 'Une partie est gratuite, le reste demande un abonnement'};
        return null;
    }
    const STOP = new Set('les des une un le la de du et en au aux pour sur dans avec par'.split(' '));
    /** ⌘K : les sites dont les mots couvrent la question (les mots de 3 lettres et plus ; un nom de site suffit) */
    function match(text) {
        const ws = fold(text).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length >= 3 && !STOP.has(w));
        if (!ws.length) return [];
        return SITES.map(s => {
            const hay = ` ${fold(`${s.label} ${s.source} ${s.words || ''}`).replace(/[^a-z0-9 ]+/g, ' ')} `;
            const hit = ws.filter(w => hay.includes(` ${w}`)).length;
            return {s, n: hit, all: hit === ws.length};
        }).filter(x => x.all || x.n >= 2).sort((a, b) => b.n - a.n || (b.all - a.all)).map(x => x.s);
    }

    return {CHECKED, GROUPS, SITES, site, url, copyText, paidBadge, forPlace, placeLinks, match, fill, cleanUrl, fold, gallica, francearchives, hathi};
});
