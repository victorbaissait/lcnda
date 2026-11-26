/**
 * LCNDA — 🌍 Partir et nommer (lot J « téléchargements ») : la mer, les cyclones, les Français partis ailleurs, et les noms de lieux
 *   d'autrefois de tous les pays.
 * Livré avec l'app (assets/data/tj-*.json.gz, refaits par scripts/telech-j/*.py et .github/workflows/telech-j.yml, lus à la demande) :
 *   🌀 tj-cyclones  cyclones depuis 1848 près des Antilles, de la Louisiane, de la Réunion, de Madagascar, de la Nouvelle-Calédonie, de
 *                   la Polynésie… (NOAA NCEI IBTrACS v04r01 : données publiques, citation demandée) — points toutes les 6 heures
 *   🏷 tj-noms      noms officiels datés et autres noms des lieux hors de France (Wikidata CC0 : Pressburg, Breslau, Presbourg…)
 *   🔀 tj-fusions   communes disparues dans une fusion, 18 pays d'Europe (Wikidata CC0) — les registres nationaux restent en lien
 *   🏺 tj-pleiades  noms antiques (Pleiades, CC BY 3.0 : Lutetia, Burdigala…)
 *   🏡 tj-villages  villages fondés par des Français ailleurs (Pigüé, San Rafael…) (Wikipédia CC BY-SA 4.0 ; Wikidata CC0)
 *   ⚜️ tj-cajuns    les 64 paroisses de Louisiane, les 22 de l'Acadiane (Wikipédia, Wikidata CC0)
 *   🧊 tj-charcot   membres des expéditions de Charcot connus de Wikidata (CC0)
 *   📘 tj-oberamt   les Oberämter du Wurtemberg et leur description (1824-1886, domaine public, Wikisource en allemand)
 * Déjà dans l'app et RÉUNI (pas recopié) : GOV (gov_noms) et les anciens noms officiels déjà livrés (wikidata_anciens_noms, wikidata/oldnames) entrent dans la liste
 *   réunie « 🗺 Anciens noms de lieux » (LCNDA_EXT.dataListMerges, id anciens_noms), avec tj-fusions, tj-pleiades et tj-noms.
 * Liens seulement (licence non ouverte, ou page de licence illisible d'ici, ou trop lourd) : ICOADS (météo en mer), CLIWOC (livres de
 *   bord), l'indemnité de Saint-Domingue (1826), SlaveVoyages, le Dictionnaire biographique du Canada, OpenHistoricalMap (jamais en
 *   consultation ni pour un invité), World Historical Gazetteer, Open Domesday, Logainm, INE, OFS, Ferraris, HisGIS, Statistical
 *   Accounts, registres scandinaves, Słownik geograficzny, Gemeindelexikon, Québec, Canada, GNIS.
 * Tout est lu sur l'ordinateur : rien ne part sur Internet (ni nom, ni lieu). Une personne vivante ou confidentielle : rien. En
 *   consultation (kiosque) ou pour un invité du réseau local : aucune comparaison de noms, aucun lien de carte. Seuls les liens « ↗ »
 *   ouvrent une page, sur un clic.
 * localStorage : « genealogie-telech-j ».   window.LCNDA_EXT.telechJ = {core…, load, personInto, placeInto, oldNames, openSettings}
 * Maquette de la recherche « Noms de lieux d'autrefois, tous pays » : docs/design/noms-de-lieux-monde.html (à valider).
 * Essai : tests/test-telech-j.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const NOW = new Date().getFullYear();
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || f.cols || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? b + 80 : ys.length ? Math.max(...ys) : null)};
    }
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', country: e.country || '', tag: String(e.tag || '').toUpperCase()}));
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => ['DEAT', 'BURI', 'CREM'].includes(String(e.tag || '').toUpperCase()));
    /** décédée, ou née il y a plus de 110 ans */
    const past = life => isDead(life) || (num(life?.person?.birth) !== null && life.person.birth < NOW - 110);
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const isQ = q => /^Q\d+$/.test(String(q || ''));

    /* 🌀 les cyclones : un point (AAAAMMJJHH, lat, lon, vent) → la tempête au plus près d'un lieu */
    function closest(storm, lat, lon) {
        let best = null;
        for (const p of storm.pts || []) { if (Math.abs(p[1] - lat) > 6 || Math.abs(p[2] - lon) > 7) continue; const k = km(lat, lon, p[1], p[2]); if (!best || k < best.km) best = {km: k, t: String(p[0]), wind: p[3]}; }
        return best;
    }
    /** les tempêtes passées à moins de radius km d'un lieu (entre deux années), les plus proches et les plus fortes d'abord */
    function stormsNear(storms, lat, lon, radius = 100, from = -1e9, to = 1e9) {
        const out = [];
        for (const s of storms) { if (s.season < from - 1 || s.season > to + 1) continue; const c = closest(s, lat, lon); if (c && c.km <= radius) out.push({s, ...c}); }
        return out.sort((a, b) => a.km - b.km || (b.s.wmax || 0) - (a.s.wmax || 0));
    }
    /** les tempêtes de sa vie près de ses lieux (dans les 15 ans autour de l'événement, s'il est daté) */
    function stormsOfLife(storms, life, radius = 100) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const out = new Map();
        for (const e of placedEvents(life)) {
            const a = e.year !== null ? Math.max(s.from, e.year - 15) : s.from, b = e.year !== null ? Math.min(s.to ?? e.year + 15, e.year + 15) : s.to;
            for (const x of stormsNear(storms, e.lat, e.lon, radius, a, b)) { const d = dateOfT(x.t); if (d.y < s.from || (s.to !== null && d.y > s.to)) continue; const cur = out.get(x.s.sid); if (!cur || x.km < cur.km) out.set(x.s.sid, {...x, place: e.name}); }
        }
        return [...out.values()].sort((a, b) => a.t.localeCompare(b.t));
    }
    const dateOfT = t => ({y: Number(String(t).slice(0, 4)), m: Number(String(t).slice(4, 6)), d: Number(String(t).slice(6, 8))});
    /** échelle de Saffir-Simpson (vent soutenu, nœuds) */
    const category = w => (w === null || w === undefined ? null : w >= 137 ? 5 : w >= 113 ? 4 : w >= 96 ? 3 : w >= 83 ? 2 : w >= 64 ? 1 : 0);

    /* 🏷 les noms de lieux d'autrefois : un index de tous les noms (toutes sources), une recherche « Presbourg » → Bratislava */
    const cell = (lat, lon) => (num(lat) === null ? 'x' : `${Math.round(Number(lat) * 2) / 2},${Math.round(Number(lon) * 2) / 2}`);
    /** la clé de « même nom, même lieu » des anciens noms réunis : le nom sans accents et la case d'un demi-degré */
    const nameKey = (name, lat, lon) => `${fold(name)}|${cell(lat, lon)}`;
    /** recs : [{name, now, from, to, lat, lon, src, url, q}] → les lieux d'aujourd'hui qui portent (ou ont porté) ce nom */
    /** le nom d'aujourd'hui le plus porté par les noms à moins de 5 km (pour un lieu antique de Pleiades : Lutetia → Paris) */
    const NOT_TOWN = /^(place|rue|quartier|pont|jardin|port|square|avenue|boulevard|cours|gare|r[ée]gion|d[ée]partement|arrondissement|canton|province|[ée]glise|ch[aâ]teau|parc|[îi]le)\b/i;
    function nowNear(recs, lat, lon) {
        if (num(lat) === null) return '';
        const n = new Map();
        for (const x of near(recs.filter(r => r.now && /^\p{Lu}/u.test(r.now) && !NOT_TOWN.test(r.now)), lat, lon, 5, 400)) n.set(x.r.now, (n.get(x.r.now) || 0) + 1 + 1 / (1 + x.km));
        return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    }
    function searchNames(recs, query, max = 20) {
        const q = fold(query); if (q.length < 2) return [];
        const hits = recs.filter(r => { const f = fold(r.name); return f === q || f.startsWith(q + ' ') || (q.length >= 4 && f.startsWith(q)); });
        const by = new Map();
        for (const h of hits) { const k = h.q || h.now ? `${h.q || ''}|${fold(h.now)}` : nameKey(h.name, h.lat, h.lon); const cur = by.get(k) || {now: h.now, lat: h.lat, lon: h.lon, q: h.q, hits: []}; cur.hits.push(h); if (!cur.now && h.now) cur.now = h.now; by.set(k, cur); }
        const exact = g => (g.hits.some(h => fold(h.name) === q) ? 0 : 1);
        const same = (g, r) => (g.q && r.q === g.q) || (g.now && fold(r.now) === fold(g.now) && num(r.lat) !== null && num(g.lat) !== null && km(r.lat, r.lon, g.lat, g.lon) < 15);
        return [...by.values()].sort((a, b) => exact(a) - exact(b) || b.hits.length - a.hits.length).slice(0, max).map(g => {
            // un lieu antique : son nom moderne quand il est parmi ses noms (Burdigala → Bordeaux), sinon le nom d'aujourd'hui le plus porté autour
            const own = g.now ? [] : namesAt(recs, g.lat, g.lon, 3), nows = g.now ? null : new Set(near(recs.filter(r => r.now && !NOT_TOWN.test(r.now)), g.lat, g.lon, 15, 400).map(x => fold(x.r.now)));
            const guess = g.now ? '' : (own.find(r => nows.has(fold(r.name)))?.name || nowNear(recs, g.lat, g.lon)), now = g.now || guess;
            const all = [...g.hits, ...recs.filter(r => same(g, r) || (guess && fold(r.now) === fold(guess) && num(r.lat) !== null && km(r.lat, r.lon, g.lat, g.lon) < 15)), ...own.filter(r => !r.now || fold(r.now) === fold(now))];
            const names = all.filter((r, i) => all.findIndex(x => fold(x.name) === fold(r.name) && x.src === r.src) === i).sort((a, b) => (a.from ?? a.to ?? 9999) - (b.from ?? b.to ?? 9999));
            return {...g, now, guessed: !!guess, names};
        }).filter((g, i, a) => !a.slice(0, i).some(o => o.now && fold(o.now) === fold(g.now) && num(o.lat) !== null && km(o.lat, o.lon, g.lat, g.lon) < 15)); // le même lieu d'aujourd'hui une fois
    }
    /** les noms d'autrefois d'un lieu (à moins de r km : même lieu) */
    const namesAt = (recs, lat, lon, r = 3) => near(recs, lat, lon, r, 200).map(x => x.r);

    /* ⚜️ la paroisse de Louisiane d'un lieu : son nom dans le texte du lieu, sinon le centre le plus proche (≤ 35 km) */
    const LOUISIANA = {s: 28.8, n: 33.1, w: -94.1, e: -88.8};
    function parishOf(rows, ev) {
        const txt = fold(`${ev.name} ${ev.country}`);
        const inLa = /\blouisian/.test(txt) || (ev.lat >= LOUISIANA.s && ev.lat <= LOUISIANA.n && ev.lon >= LOUISIANA.w && ev.lon <= LOUISIANA.e);
        if (!inLa) return null;
        const byName = rows.find(r => new RegExp(`\\b${fold(r.n).replace(/\bst\b/, 'st(?:e|\\.)?|saint')}\\b(?: parish| paroisse)`).test(txt) || (fold(r.fr) && txt.includes(`paroisse ${fold(r.fr).replace(/^paroisse (de la |de l |de |d )?/, '')}`)));
        if (byName) return {r: byName, how: 'name'};
        const x = near(rows, ev.lat, ev.lon, 35, 1)[0];
        return x ? {r: x.r, how: 'near', km: x.km} : null;
    }

    /* 🧊 un homonyme dans les expéditions (même premier prénom et même nom, sans accents) */
    const nameParts = n => { const w = fold(n).split(' ').filter(x => x.length > 1 && !['de', 'du', 'la', 'le', 'des', 'van', 'von'].includes(x)); return {first: w[0] || '', last: w[w.length - 1] || ''}; };
    function homonyms(rows, life) {
        const f = fold(life?.person?.first).split(' ')[0] || '', l = fold(life?.person?.last).split(' ').filter(x => !['de', 'du', 'la', 'le', 'des'].includes(x)).pop() || '';
        if (!f || !l) return [];
        return rows.filter(r => { const p = nameParts(r.n); return p.first === f && p.last === l; });
    }

    /* 📘 l'Oberamt d'un lieu du Wurtemberg : le chef-lieu le plus proche (≤ 15 km) */
    const WURT = {s: 47.5, n: 49.8, w: 8.1, e: 10.6};
    const oberamtOf = (rows, lat, lon) => (lat >= WURT.s && lat <= WURT.n && lon >= WURT.w && lon <= WURT.e ? near(rows, lat, lon, 15, 1)[0] || null : null);

    /* 🌊 a-t-il traversé la mer ? un lieu en Europe, puis un lieu hors d'Europe (ou l'inverse) */
    const inEurope = e => e.lat >= 34 && e.lat <= 72 && e.lon >= -25 && e.lon <= 45;
    function crossing(life) {
        const ev = placedEvents(life).filter(e => e.year !== null).sort((a, b) => a.year - b.year);
        for (let i = 1; i < ev.length; i++) if (inEurope(ev[i - 1]) !== inEurope(ev[i])) return {from: ev[i - 1], to: ev[i], year: ev[i].year, out: inEurope(ev[i - 1])};
        return null;
    }
    /* ⛓ la mémoire de la traite et de l'esclavage : Saint-Domingue avant 1804 ; un port de traite et un métier de la mer, 1700-1830 */
    const SAINT_DOMINGUE = {s: 17.5, n: 20.2, w: -74.6, e: -68.2};
    const inSD = e => (e.lat >= SAINT_DOMINGUE.s && e.lat <= SAINT_DOMINGUE.n && e.lon >= SAINT_DOMINGUE.w && e.lon <= SAINT_DOMINGUE.e) || /saint domingue|haiti|cap francais|port au prince|jeremie|les cayes|jacmel|leogane/.test(fold(`${e.name} ${e.country}`));
    const PORTS = [['Nantes', 47.2184, -1.5536], ['La Rochelle', 46.1603, -1.1511], ['Bordeaux', 44.8378, -0.5792], ['Le Havre', 49.4944, 0.1079], ['Saint-Malo', 48.6493, -2.0257],
        ['Lorient', 47.7483, -3.3702], ['Honfleur', 49.4190, 0.2330], ['Marseille', 43.2965, 5.3698], ['Dunkerque', 51.0343, 2.3768], ['Vannes', 47.6582, -2.7608]];
    const SEA_JOB = /\b(armateur|capitaine|marin|matelot|negociant|officier de marine|navigateur|chirurgien de navire|mousse|pilote|maitre d equipage|second capitaine)\b/;
    function memory(life) {
        const ev = placedEvents(life), s = lifeSpan(life), jobs = fold((life?.jobs || []).map(j => j.text).join(' ; '));
        const sd = ev.find(e => inSD(e) && (e.year === null || e.year <= 1830));
        const port = SEA_JOB.test(jobs) && s.from !== null && s.from <= 1830 && (s.to ?? s.from) >= 1700 ? ev.map(e => ({e, p: PORTS.find(p => km(e.lat, e.lon, p[1], p[2]) <= 15)})).find(x => x.p) : null;
        return sd || port ? {sd, port: port ? {name: port.p[0], ev: port.e} : null} : null;
    }

    /* 📍 les pays et leurs registres de noms (liens seulement) : une boîte approximative, et les mots du pays */
    const COUNTRIES = [
        ['ie', 'Irlande', /\b(irlande|ireland|eire)\b/, [51.4, 55.4, -10.7, -5.9]], ['sct', 'Écosse', /\b(ecosse|scotland)\b/, [54.6, 60.9, -8.0, -0.7]],
        ['eng', 'Angleterre', /\b(angleterre|england)\b/, [49.9, 55.8, -5.8, 1.8]], ['es', 'Espagne', /\b(espagne|spain|espana)\b/, [36.0, 43.8, -9.3, 3.3]],
        ['ch', 'Suisse', /\b(suisse|switzerland|schweiz|svizzera)\b/, [45.8, 47.8, 5.95, 10.5]], ['be', 'Belgique', /\b(belgique|belgium|belgie)\b/, [49.5, 51.5, 2.5, 6.4]],
        ['nl', 'Pays-Bas', /\b(pays bas|netherlands|nederland|hollande)\b/, [50.75, 53.6, 3.3, 7.2]], ['wurt', 'Wurtemberg', /\b(wurtemberg|wurttemberg|baden wurttemberg)\b/, [WURT.s, WURT.n, WURT.w, WURT.e]],
        ['pl', 'Pologne', /\b(pologne|poland|polska)\b/, [49.0, 54.9, 14.1, 24.2]], ['ah', 'Autriche-Hongrie', /\b(autriche|austria|osterreich|hongrie|hungary|boheme|moravie|galicie|bukovine|tcheque|slovaquie|croatie|slovenie)\b/, [44.0, 51.1, 9.5, 26.6]],
        ['no', 'Norvège', /\b(norvege|norway|norge)\b/, [57.9, 71.2, 4.5, 31.1]], ['se', 'Suède', /\b(suede|sweden|sverige)\b/, [55.3, 69.1, 11.0, 24.2]], ['fi', 'Finlande', /\b(finlande|finland|suomi)\b/, [59.7, 70.1, 20.5, 31.6]],
        ['qc', 'Québec', /\b(quebec)\b/, [45.0, 62.6, -79.8, -57.1]], ['ca', 'Canada', /\b(canada|acadie|nouveau brunswick|nouvelle ecosse|ontario|manitoba)\b/, [41.7, 70, -141, -52.6]],
        ['us', 'États-Unis', /\b(etats unis|usa|united states|louisiane|louisiana)\b/, [24.5, 49.4, -125, -66.9]]];
    /** les pays de ses lieux (le premier qui convient : la boîte du Québec avant celle du Canada) */
    function countriesOf(evs) {
        const out = new Set();
        for (const e of evs) { const t = fold(`${e.name} ${e.country}`); const hit = COUNTRIES.find(([, , re]) => re.test(t)) || COUNTRIES.find(([, , , b]) => e.lat >= b[0] && e.lat <= b[1] && e.lon >= b[2] && e.lon <= b[3] && !/\bfrance\b/.test(t)); if (hit) out.add(hit[0]); }
        if (out.has('qc')) out.add('ca');
        return [...out];
    }

    const core = {num, fold, table, km, lifeSpan, placedEvents, isDead, past, near, safeUrl, closest, stormsNear, stormsOfLife, dateOfT, category, nameKey, searchNames, namesAt, nowNear,
        parishOf, homonyms, oberamtOf, crossing, memory, countriesOf, inSD, COUNTRIES, PORTS};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-j';
    const TAB = ['telech_j', '25tj', '🌍 Partir et nommer'];
    const BLOCK = 'telech_j';
    const PARTS = [
        ['noms', '🏷 Les anciens noms de ses lieux', 'Comment s’appelaient ses lieux autrefois (Wikidata, Pleiades, fusions de communes), et où chercher ailleurs (registres de chaque pays, en lien).'],
        ['cyclones', '🌀 Cyclones', 'Les cyclones passés près de ses lieux (Antilles, Louisiane, Réunion, Madagascar, Nouvelle-Calédonie, Polynésie…), depuis 1848 (NOAA IBTrACS).'],
        ['mer', '🌊 La traversée : météo en mer et livres de bord', 'Quand il a traversé la mer : où lire la météo et les livres de bord de l’époque (ICOADS, CLIWOC : liens).'],
        ['memoire', '⛓ Saint-Domingue, la traite, l’indemnité', 'Un lieu à Saint-Domingue avant 1804, ou un métier de la mer dans un port de traite : le contexte, dit sobrement, et où chercher (liens).'],
        ['villages', '🏡 Villages fondés par des Français', 'Pigüé, San Rafael, Sainte-Geneviève… : quand un de ses lieux en est tout près.'],
        ['cajuns', '⚜️ Louisiane : les paroisses et l’Acadiane', 'La paroisse de Louisiane de ses lieux, et si elle est en Acadiane (le pays cadien).'],
        ['canada', '📖 Dictionnaire biographique du Canada', 'Pour une famille du Canada : où chercher son nom (lien).'],
        ['charcot', '🧊 Les expéditions de Charcot', 'Les membres des expéditions de Jean-Baptiste Charcot ; un homonyme (comparé sur l’ordinateur, personne décédée seulement).'],
        ['oberamt', '📘 Wurtemberg : l’Oberamtsbeschreibung', 'Pour un lieu du Wurtemberg : la description de son Oberamt (1824-1886, Wikisource en allemand).'],
        ['ohm', '🗺 OpenHistoricalMap', 'Un lien « voir ce lieu sur OpenHistoricalMap à cette date » (jamais en consultation ni pour un invité).']];
    const RADII = [50, 100, 200];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), km: 100, ...s}; };
    const on = k => settings()[k] !== false;
    const radius = () => (RADII.includes(Number(settings().km)) ? Number(settings().km) : 100);
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tj-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tj-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tj-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const quote = t => (t ? `<q class="tj-quote">${esc(t)}</q>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (isQ(q) ? `https://www.wikidata.org/wiki/${q}` : '');
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.document?.documentElement?.classList.contains('base-readonly') || root.LCNDA_GUEST);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayTxt = t => { const d = dateOfT(t); return `${d.d === 1 ? '1er' : d.d} ${T(MONTHS[d.m - 1])} ${d.y}`; };
    const ago = (a, b) => (a !== null && a !== undefined && b !== null && b !== undefined ? `${a < 0 ? T('{n} av. J.-C.', {n: String(-a)}) : a}–${b < 0 ? T('{n} av. J.-C.', {n: String(-b)}) : b}` : a !== null && a !== undefined ? T('depuis {y}', {y: a < 0 ? T('{n} av. J.-C.', {n: String(-a)}) : String(a)}) : b !== null && b !== undefined ? T('jusqu’en {y}', {y: b < 0 ? T('{n} av. J.-C.', {n: String(-b)}) : String(b)}) : '');

    /* les sources, citées ; les liens seulement (adresses lues le 26 novembre 2026 ; voir docs/telechargements-lot-j.md) */
    const URL_ = {
        ibtracs: 'https://www.ncei.noaa.gov/products/international-best-track-archive', ibtracsDoi: 'https://doi.org/10.25921/82ty-9e16',
        icoads: 'https://www.ncei.noaa.gov/products/international-comprehensive-ocean-atmosphere-data-set', cliwoc: 'https://projects.knmi.nl/cliwoc/download/cliwoc21.htm',
        pleiades: 'https://pleiades.stoa.org/', pleiadesLic: 'https://creativecommons.org/licenses/by/3.0/', wdLic: 'https://www.wikidata.org/wiki/Wikidata:Copyright',
        gallicaSD: 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=%28gallica%20all%20%22indemnit%C3%A9%20attribu%C3%A9e%20aux%20anciens%20colons%20de%20Saint-Domingue%22%29',
        iaSD: 'https://archive.org/search?query=%22anciens+colons+de+Saint-Domingue%22', dette: 'https://fr.wikipedia.org/wiki/Dette_de_l%27ind%C3%A9pendance_d%27Ha%C3%AFti',
        repairs: 'https://esclavage-indemnites.fr/', slave: 'https://www.slavevoyages.org/', dbc: 'https://www.biographi.ca/fr/',
        ohm: 'https://www.openhistoricalmap.org/', whg: 'https://whgazetteer.org/', domesday: 'https://opendomesday.org/', logainm: 'https://www.logainm.ie/', townlands: 'https://www.townlands.ie/',
        ine: 'https://www.ine.es/intercensal/', bfs: 'https://www.agvchapp.bfs.admin.ch/fr', ferraris: 'https://fr.wikipedia.org/wiki/Carte_de_Ferraris', kbr: 'https://www.kbr.be/',
        hisgis: 'https://hisgis.nl/', statacc: 'https://stataccscot.edina.ac.uk/', kartverket: 'https://www.kartverket.no/', isof: 'https://www.isof.se/', nls: 'https://www.maanmittauslaitos.fi/',
        slownik: 'https://dir.icm.edu.pl/pl/Slownik_geograficzny/', gemeindelexikon: 'https://archive.org/search?query=Gemeindelexikon', quebec: 'https://toponymie.gouv.qc.ca/',
        cgndb: 'https://geonames.nrcan.gc.ca/', gnis: 'https://edits.nationalmap.gov/apps/gaz-domestic/public/search/names', acadiana: 'https://en.wikipedia.org/wiki/Acadiana',
        wsde: 'https://de.wikisource.org/wiki/Oberamtsbeschreibung'};
    const LIC = {wd: () => `${link(URL_.wdLic, 'Wikidata')} (CC0)`,
        wp: (u, label = 'Wikipédia') => `${link(u || 'https://fr.wikipedia.org', label)} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs de Wikipédia'))})`,
        ibtracs: () => `${link(URL_.ibtracs, 'NOAA NCEI — IBTrACS v04r01')} (${esc(T('données publiques ; citation demandée'))} : ${link(URL_.ibtracsDoi, 'doi:10.25921/82ty-9e16')})`,
        pleiades: () => `${link(URL_.pleiades, 'Pleiades')} (${link(URL_.pleiadesLic, 'CC BY 3.0')}, ${esc(T('les contributeurs de Pleiades'))})`};
    /** [id, libellé, adresse, ce que c'est, pourquoi en lien seulement] — Réglages → « En lien seulement » */
    const LINK_ONLY = [
        ['icoads', '🌊 ICOADS — observations des navires (météo en mer)', URL_.icoads, 'Relevés des navires depuis 1662 ; résumés mensuels par cases de 2°.', 'Les résumés mensuels sont 1 812 archives binaires pour 1800-1950 : trop lourd pour un paquet léger ; la météo d’un jour de traversée ne se reconstruit pas sûrement.'],
        ['cliwoc', '⛵ CLIWOC — livres de bord 1750-1854 (KNMI)', URL_.cliwoc, 'Positions et temps relevés dans 1 624 livres de bord anglais, néerlandais, espagnols et français.', 'La page de licence du KNMI n’a pas pu être lue d’ici : en lien seulement.'],
        ['sd', '⛓ Indemnité de Saint-Domingue (1826) — « État détaillé des liquidations »', URL_.gallicaSD, 'Les noms des anciens colons indemnisés après la reconnaissance de l’indépendance d’Haïti.', 'Pas de texte reconnu fiable (OCR) trouvé en accès libre d’ici : recherche dans Gallica et Internet Archive.'],
        ['slave', '⛓ SlaveVoyages — les voyages de traite', URL_.slave, 'Navires, armateurs, capitaines et ports de départ de la traite atlantique.', 'Site et licence illisibles d’ici (et usage commercial non garanti) : en lien seulement.'],
        ['dbc', '📖 Dictionnaire biographique du Canada', URL_.dbc, 'Biographies de personnes mortes avant 1940 environ.', 'Textes protégés : on y cherche soi-même un nom.'],
        ['ohm', '🗺 OpenHistoricalMap', URL_.ohm, 'Carte du monde à une date choisie (données CC0).', 'La politique d’usage des tuiles n’a pas pu être lue d’ici : pas de fond de carte dans l’app, un lien seulement (jamais en consultation).'],
        ['whg', '🌐 World Historical Gazetteer', URL_.whg, 'Noms anciens des lieux du monde, réunis de nombreux jeux de données.', 'Chaque jeu de données a sa propre licence, et le site est illisible d’ici : en lien seulement.'],
        ['domesday', '📜 Open Domesday (1086)', URL_.domesday, 'Les villages anglais du Domesday Book.', 'Site et licence illisibles d’ici : en lien seulement.'],
        ['logainm', '☘️ Logainm et townlands (Irlande)', URL_.logainm, 'Noms de lieux irlandais et townlands.', 'Accès aux données sur clé et licence illisible d’ici : en lien seulement.'],
        ['ine', '🇪🇸 INE — changements de municipios depuis 1842', URL_.ine, 'Fusions, créations et changements de nom des communes d’Espagne.', 'Site illisible d’ici ; les fusions connues de Wikidata sont dans « Communes disparues ».'],
        ['bfs', '🇨🇭 OFS — répertoire historisé des communes', URL_.bfs, 'Toutes les mutations des communes suisses depuis 1848.', 'Site illisible d’ici ; les fusions connues de Wikidata sont dans « Communes disparues ».'],
        ['ferraris', '🗺 Carte de Ferraris (1777)', URL_.ferraris, 'La carte des Pays-Bas autrichiens (Belgique), conservée à la KBR.', 'Scans protégés par la KBR ; lien vers l’article et la KBR.'],
        ['hisgis', '🇳🇱 HisGIS — cadastre de 1832', URL_.hisgis, 'Les parcelles et propriétaires du premier cadastre des Pays-Bas.', 'Site et licence illisibles d’ici : en lien seulement.'],
        ['statacc', '🏴 Statistical Accounts of Scotland (1791-1845)', URL_.statacc, 'La description de chaque paroisse d’Écosse par son pasteur.', 'Lecture en ligne seulement.'],
        ['nord', '🇳🇴 🇸🇪 🇫🇮 Noms de lieux de Norvège, de Suède, de Finlande', URL_.kartverket, 'Kartverket (CC BY 4.0), Isof, Maanmittauslaitos (CC BY 4.0).', 'Sites refusés par le réseau de l’atelier : à fabriquer plus tard ; en lien pour l’instant.'],
        ['slownik', '🇵🇱 Słownik geograficzny Królestwa Polskiego (1880-1902)', URL_.slownik, 'Dictionnaire géographique des terres polonaises (domaine public).', 'Texte reconnu (OCR) inégal : en lien seulement.'],
        ['gemeinde', '🇦🇹 Gemeindelexikon (Autriche-Hongrie, 1900-1910)', URL_.gemeindelexikon, 'Les répertoires des communes de chaque pays de la couronne (domaine public).', 'Des scans : en lien seulement (Internet Archive).'],
        ['quebec', '⚜️ Banque de noms de lieux du Québec', URL_.quebec, 'Origine et histoire des noms de lieux du Québec.', 'Licence illisible d’ici : en lien seulement.'],
        ['cgndb', '🍁 Noms géographiques du Canada', URL_.cgndb, 'Base des noms officiels du Canada (Licence du gouvernement ouvert).', 'Site refusé par le réseau de l’atelier : en lien pour l’instant.'],
        ['gnis', '🇺🇸 GNIS — lieux historiques des États-Unis', URL_.gnis, 'Noms officiels et lieux disparus des États-Unis (domaine public).', 'Site refusé par le réseau de l’atelier : en lien pour l’instant.']];
    /** les registres de noms d'un pays (pour la fiche) */
    const COUNTRY_LINKS = {ie: ['logainm'], sct: ['statacc'], eng: ['domesday'], es: ['ine'], ch: ['bfs'], be: ['ferraris'], nl: ['hisgis'], pl: ['slownik'], ah: ['gemeinde'], no: ['nord'], se: ['nord'], fi: ['nord'],
        qc: ['quebec'], ca: ['cgndb'], us: ['gnis']};
    const linkOnly = id => LINK_ONLY.find(x => x[0] === id);
    const linkLine = id => { const x = linkOnly(id); return x ? `${link(x[2], `↗ ${T(x[1])}`)}` : ''; };

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {cyclones: 'tj-cyclones', noms: 'tj-noms', fusions: 'tj-fusions', pleiades: 'tj-pleiades', villages: 'tj-villages', cajuns: 'tj-cajuns', charcot: 'tj-charcot', oberamt: 'tj-oberamt'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!FILES[kind]) return Promise.resolve(null);
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: table(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    let gazMemo = null;
    /** tous les noms d'autrefois (paquets de ce lot + les anciens noms de France déjà dans l'app), une forme commune */
    function gazetteer() {
        return (gazMemo ||= Promise.all([rowsOf('noms'), rowsOf('fusions'), rowsOf('pleiades'), quiet(fetch('assets/data/wikidata/oldnames.json.gz', {credentials: 'same-origin'}).then(r => (r.ok ? readMaybeGz(r) : null)))]).then(([N, F, P, O]) => [
            ...N.rows.map(r => ({name: r.name, now: r.now, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: r.q, kind: r.k === 'o' ? T('nom officiel') : T('autre nom'), src: 'Wikidata', url: wd(r.q), cc: r.cc})),
            ...F.rows.map(r => ({name: r.name, now: r.succ, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: r.sq, kind: T('commune disparue'), src: 'Wikidata', url: wd(r.q), cc: r.cc})),
            ...P.rows.map(r => ({name: r.name, now: '', ancient: r.place, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: '', kind: T('nom antique'), src: 'Pleiades', url: `https://pleiades.stoa.org/places/${Number(r.id)}`, cc: ''})),
            ...(O ? Object.values(O.n || {}).flat().map(r => ({name: r[2], now: r[1], from: num(String(r[4]).slice(0, 4)), to: num(String(r[5]).slice(0, 4)), lat: r[6], lon: r[7], q: `Q${r[0]}`, kind: T('ancien nom officiel'), src: 'Wikidata', url: wd(`Q${r[0]}`), cc: ''})) : [])]).catch(e => { gazMemo = null; throw e; }));
    }
    /** « Presbourg » → [{now, names}] (sur l'ordinateur ; pour les essais et la maquette) */
    const oldNames = async (q, max) => searchNames(await gazetteer(), q, max);
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));

    /* ─────────── les morceaux ─────────── */
    const stormName = s => (s.name ? s.name : T('sans nom'));
    const short = n => String(n || '').replace(/\s*\([^)]*\)$/, '');
    const catTxt = w => { const c = category(w); return c === null ? '' : c === 0 ? T('tempête tropicale') : T('catégorie {c}', {c: String(c)}); };
    const stormLi = x => `<li>🌀 <b>${esc(dayTxt(x.t))}</b> · ${esc(stormName(x.s))} <small class="muted">(${esc([kmTxt(x.km), x.place ? T('de {p}', {p: x.place}) : '', catTxt(x.s.wmax) ? T('au plus fort : {c}', {c: catTxt(x.s.wmax)}) : ''].filter(Boolean).join(' · '))})</small></li>`;
    const nameLi = r => `<li>🏷 <b>${esc(r.name)}</b> <small class="muted">(${esc([r.kind, ago(r.from, r.to), r.now ? T('aujourd’hui {n}', {n: r.now}) : r.ancient ? T('lieu antique : {n}', {n: r.ancient}) : ''].filter(Boolean).join(' · '))})</small> ${srcLink(r.url)}</li>`;
    function ohmLink(lat, lon, year) {
        if (kiosk() || !on('ohm') || num(lat) === null) return '';
        const y = Math.max(1, Math.min(NOW, Number(year) || 1900));
        const u = `https://www.openhistoricalmap.org/#map=12/${Number(lat).toFixed(4)}/${Number(lon).toFixed(4)}&date=${String(y).padStart(4, '0')}-01-01`;
        return link(u, T('↗ ce lieu sur OpenHistoricalMap en {y}', {y: String(y)}));
    }

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['noms', 'cyclones', 'mer', 'memoire', 'villages', 'cajuns', 'canada', 'charcot', 'oberamt'];
    const JOBS = {
        noms: async life => {
            const G = await gazetteer(), evs = placedEvents(life), seen = new Set(), hits = [];
            for (const e of evs) for (const r of namesAt(G, e.lat, e.lon, 3)) { const k = `${fold(r.name)}|${fold(e.name)}`; if (seen.has(k) || fold(r.name) === fold(e.name.split(',')[0])) continue; seen.add(k); hits.push({...r, at: e}); }
            const cs = countriesOf(evs).filter(c => COUNTRY_LINKS[c]);
            if (!hits.length && !cs.length) return '';
            const dated = hits.filter(r => r.from !== null || r.to !== null).sort((a, b) => (a.to ?? a.from ?? 0) - (b.to ?? b.from ?? 0));
            const x = dated[0] || hits[0];
            const lead = x ? T('Autrefois, {p} s’appelait aussi {n}.', {p: `<b>${esc(x.at.name.split(',')[0])}</b>`, n: `<b>${esc(x.name)}</b>${ago(x.from, x.to) ? ` <small class="muted">(${esc(ago(x.from, x.to))})</small>` : ''}`}) : esc(T('Où chercher les noms anciens de ses lieux, pays par pays :'));
            const links = cs.length ? `<p class="muted tj-links">${esc(T('Registres de noms de lieux de ses pays (en ligne) :'))} ${[...new Set(cs.flatMap(c => COUNTRY_LINKS[c]))].map(linkLine).join(' · ')}</p>` : '';
            const ohm = evs.length ? `<p class="muted tj-links">${ohmLink(evs[0].lat, evs[0].lon, evs[0].year)}</p>` : '';
            const srcs = [...new Set(hits.map(h => h.src))];
            return row('🏷', `${lead} ${x ? srcLink(x.url) : ''}`, srcs.map(s => (s === 'Pleiades' ? LIC.pleiades() : LIC.wd())).join(' ; ') || esc(T('liens seulement')),
                `${hits.length > 1 ? more(`<ul class="hist-ul tj-ul">${hits.slice(0, 20).map(nameLi).join('')}</ul>`, hits.length) : ''}${links}${ohm}`);
        },
        cyclones: async life => {
            const D = await rowsOf('cyclones'); const list = stormsOfLife(D.rows, life, radius()); if (!list.length) return '';
            const x = list.reduce((a, b) => ((b.s.wmax || 0) - b.km / 10 > (a.s.wmax || 0) - a.km / 10 ? b : a));
            const lead = T('Le {d}, le cyclone {n} passe à {k} de {p}.', {d: esc(dayTxt(x.t)), n: `<b>${esc(stormName(x.s))}</b>`, k: esc(kmTxt(x.km)), p: esc(x.place)});
            return row('🌀', `${lead}${catTxt(x.s.wmax) ? ` <small class="muted">(${esc(T('au plus fort : {c}', {c: catTxt(x.s.wmax)}))})</small>` : ''} ${srcLink(URL_.ibtracs)}`, LIC.ibtracs(),
                `${list.length > 1 ? more(`<ul class="hist-ul tj-ul">${list.slice(0, 15).map(stormLi).join('')}</ul>`, list.length) : ''}${hyp(T('Le centre de la tempête (relevé toutes les 6 heures) est passé à cette distance ; les vents et les pluies portent bien plus loin. Les tempêtes anciennes sont moins bien connues.'))}`);
        },
        mer: async life => {
            const c = crossing(life); if (!c) return '';
            const y = c.year, lead = c.out ? T('Entre {a} ({ya}) et {b} ({yb}), {e} a traversé la mer.', {a: esc(c.from.name.split(',')[0]), ya: esc(String(c.from.year)), b: esc(c.to.name.split(',')[0]), yb: esc(String(y)), e: esc(he(life.person))})
                : T('Entre {a} ({ya}) et {b} ({yb}), {e} est revenu par la mer.', {a: esc(c.from.name.split(',')[0]), ya: esc(String(c.from.year)), b: esc(c.to.name.split(',')[0]), yb: esc(String(y)), e: esc(he(life.person))});
            return row('🌊', lead, `${link(URL_.icoads, 'NOAA ICOADS')} · ${link(URL_.cliwoc, 'CLIWOC (KNMI)')} (${esc(T('liens seulement'))})`,
                `<p class="muted tj-links">${esc(T('Le temps en mer cette année-là, relevé par les navires :'))} ${linkLine('icoads')}${y >= 1750 && y <= 1854 ? ` · ${esc(T('les livres de bord de 1750 à 1854 :'))} ${linkLine('cliwoc')}` : ''}</p>${hyp(T('On ne sait pas sur quel navire ni quel jour : ces bases donnent le temps relevé par les navires de l’époque, pas celui de sa traversée.'))}`);
        },
        memoire: async life => {
            const m = memory(life); if (!m) return '';
            const parts = [];
            if (m.sd) parts.push(row('⛓', `${esc(T('{p} était à Saint-Domingue, la colonie française devenue Haïti en 1804.', {p: m.sd.name.split(',')[0] || T('Un de ses lieux')}))}`, `${link(URL_.dette, 'Wikipédia')} · Gallica · Internet Archive (${esc(T('liens seulement'))})`,
                `<p class="tj-ctx">${esc(T('Saint-Domingue vivait du travail de centaines de milliers de personnes réduites en esclavage. En 1825, la France exigea d’Haïti une indemnité pour les anciens colons ; la liste des colons indemnisés (« État détaillé des liquidations », 1828-1834) donne leurs noms et leurs biens.'))}</p>
                <p class="muted tj-links">${link(URL_.gallicaSD, T('↗ chercher l’« État détaillé des liquidations » dans Gallica'))} · ${link(URL_.iaSD, T('↗ dans Internet Archive'))} · ${link(URL_.repairs, T('↗ les indemnités de 1849 (esclavage-indemnites.fr)'))}</p>${hyp(T('Un lieu à Saint-Domingue ne dit pas qui était cette personne : colon, libre de couleur, esclave affranchi, soldat, marin… Les registres le disent.'))}`));
            if (m.port) parts.push(row('⛓', `${esc(T('Son métier touchait à la mer, à {p}, au temps où des navires de traite partaient de ce port.', {p: m.port.name}))}`, `${link(URL_.slave, 'SlaveVoyages')} (${esc(T('lien seulement'))})`,
                `<p class="muted tj-links">${link(URL_.slave, T('↗ chercher un navire, un armateur ou un capitaine dans SlaveVoyages'))}</p>${hyp(T('Cela ne dit pas qu’il y a pris part : la plupart des navires de ces ports faisaient d’autres voyages.'))}`));
            return parts.join('');
        },
        villages: async life => {
            const D = await rowsOf('villages'), out = new Map();
            for (const e of placedEvents(life)) for (const x of near(D.rows, e.lat, e.lon, 25, 3)) if (!out.has(x.r.q || x.r.n)) out.set(x.r.q || x.r.n, {...x, place: e.name});
            const list = [...out.values()]; if (!list.length) return '';
            const x = list[0], K = D.meta.kinds || {};
            return row('🏡', `${T('{v}, à {k} de {p} : {w}.', {v: `<b>${link(x.r.url, short(x.r.n))}</b>`, k: esc(kmTxt(x.km)), p: esc(x.place.split(',')[0]), w: esc([T(K[x.r.k] || x.r.k), x.r.from].filter(Boolean).join(' — '))})} ${srcLink(x.r.url)}`, LIC.wp(x.r.url), `${quote(x.r.intro)}${list.length > 1 ? more(`<ul class="hist-ul tj-ul">${list.slice(1).map(y => `<li>🏡 ${link(y.r.url, short(y.r.n))} <small class="muted">(${esc(kmTxt(y.km))})</small></li>`).join('')}</ul>`, list.length - 1) : ''}`);
        },
        cajuns: async life => {
            const D = await rowsOf('cajuns'); if (!D.rows.length) return '';
            const seen = new Set(), list = [];
            for (const e of placedEvents(life)) { const p = parishOf(D.rows, e); if (p && !seen.has(p.r.q)) { seen.add(p.r.q); list.push({...p, ev: e}); } }
            if (!list.length) return '';
            const x = list[0], n = x.r.fr || T('paroisse de {n}', {n: x.r.n});
            const lead = x.how === 'name' ? T('{p} est dans la {n}', {p: esc(x.ev.name.split(',')[0]), n: `<b>${esc(n)}</b>`}) : T('{p} est sans doute dans la {n} (le centre de la paroisse est à {k})', {p: esc(x.ev.name.split(',')[0]), n: `<b>${esc(n)}</b>`, k: esc(kmTxt(x.km))});
            return row('⚜️', `${lead}${x.r.acadiana ? esc(T(', en Acadiane : le pays des Cadiens, descendants des Acadiens chassés du Canada en 1755.')) : '.'} ${srcLink(x.r.url)}`, `${LIC.wd()} · ${link(x.r.url, 'Wikipédia (en)')}`,
                `${x.r.from ? `<p class="muted">${esc(T('Paroisse créée en {y}', {y: String(x.r.from)}))}${x.r.seat ? esc(T(' ; chef-lieu : {s}', {s: x.r.seat})) : ''}.</p>` : ''}${x.r.acadiana ? `<p class="muted tj-links">${link(URL_.acadiana, T('↗ l’Acadiane (Wikipédia)'))}</p>` : ''}`);
        },
        canada: async life => {
            const cs = countriesOf(placedEvents(life)); if (!cs.includes('ca')) return '';
            const name = [life.person?.first, life.person?.last].filter(Boolean).join(' ');
            return row('📖', esc(T('Une famille du Canada : le Dictionnaire biographique du Canada raconte la vie de milliers de personnes mortes avant 1940 environ — on peut y chercher « {n} ».', {n: name})), `${link(URL_.dbc, 'Dictionnaire biographique du Canada')} (${esc(T('lien seulement'))})`,
                `<p class="muted tj-links">${linkLine('dbc')}${cs.includes('qc') ? ` · ${linkLine('quebec')}` : ''}</p>`);
        },
        charcot: async life => {
            if (kiosk()) return '';
            const D = await rowsOf('charcot'); const h = homonyms(D.rows, life); if (!h.length) return '';
            const r = h[0], same = r.b && num(life.person?.birth) !== null && Math.abs(r.b - life.person.birth) <= 3;
            return row('🧊', `${T('Même nom : {n} ({e}).', {n: `<b>${esc(r.n)}</b>${r.b ? ` <small class="muted">(${esc([r.b, r.d].filter(Boolean).join('–'))})</small>` : ''}`, e: esc(r.exp)})} ${srcLink(wd(r.q))}`, LIC.wd(),
                hyp(same ? T('Même nom, et né à peu près la même année : c’est peut-être lui. À vérifier dans les registres.') : T('Seulement le même nom : rien ne dit que ce soit la même personne.')));
        },
        oberamt: async life => {
            const D = await rowsOf('oberamt'); if (!D.rows.length) return '';
            for (const e of placedEvents(life)) { const x = oberamtOf(D.rows, e.lat, e.lon); if (x) return row('📘', `${T('{p} était dans l’Oberamt {o} : sa description (« Beschreibung des Oberamts {o} ») est sur Wikisource.', {p: esc(e.name.split(',')[0]), o: `<b>${esc(x.r.n)}</b>`})} ${srcLink(x.r.ws || x.r.search)}`,
                `${link(URL_.wsde, 'Wikisource (de)')} (${esc(T('domaine public'))}) · ${LIC.wd()}`, `<p class="muted tj-links">${link(x.r.ws || x.r.search, T('↗ lire la description de l’Oberamt {o}', {o: x.r.n}))}</p>${hyp(T('L’Oberamt est celui dont le chef-lieu est le plus proche (à {k}) : à vérifier, les limites ont changé.', {k: kmTxt(x.km)}))}`); }
            return '';
        }};
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const priv = !!opts.private || life.person?.living_status === 'living' || Number(life.person?.is_private) === 1;
        if (priv || !past(life)) { host.innerHTML = ''; return 0; } // personne décédée (ou d'il y a plus de 110 ans) et non confidentielle seulement
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tj-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        if (p.living_status === 'living' || Number(p.is_private) === 1) return '';
        return A().card(index, T('🌍 Partir et nommer'), '', `<div class="tj-block" data-tj-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tj-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tjPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['noms', 'cyclones', 'villages', 'cajuns', 'oberamt'];
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll) return '';
        const ev = {lat: ll.lat, lon: ll.lon, name: place.name || '', country: place.country || '', year: null, tag: ''};
        if (kind === 'noms') {
            const list = namesAt(await gazetteer(), ll.lat, ll.lon, 3).filter(r => fold(r.name) !== fold(String(place.name || '').split(',')[0]));
            const cs = countriesOf([ev]).filter(c => COUNTRY_LINKS[c]);
            if (!list.length && !cs.length) return '';
            const srt = list.sort((a, b) => (a.from ?? a.to ?? 9999) - (b.from ?? b.to ?? 9999));
            return row('🏷', list.length ? `${T('Les noms d’autrefois de ce lieu : {l}.', {l: srt.slice(0, 4).map(r => `<b>${esc(r.name)}</b>${ago(r.from, r.to) ? ` <small class="muted">(${esc(ago(r.from, r.to))})</small>` : ''}`).join(', ')})} ${srcLink(srt[0].url)}` : esc(T('Où chercher les noms anciens de ce lieu :')),
                [...new Set(list.map(r => r.src))].map(s => (s === 'Pleiades' ? LIC.pleiades() : LIC.wd())).join(' ; ') || esc(T('liens seulement')),
                `${list.length > 4 ? more(`<ul class="hist-ul tj-ul">${srt.map(nameLi).join('')}</ul>`, list.length) : ''}${cs.length ? `<p class="muted tj-links">${[...new Set(cs.flatMap(c => COUNTRY_LINKS[c]))].map(linkLine).join(' · ')}</p>` : ''}<p class="muted tj-links">${ohmLink(ll.lat, ll.lon, 1900)}</p>`);
        }
        if (kind === 'cyclones') {
            const D = await rowsOf('cyclones'); const list = stormsNear(D.rows, ll.lat, ll.lon, Math.min(radius(), 100)); if (!list.length) return '';
            const strong = [...list].sort((a, b) => (b.s.wmax || 0) - (a.s.wmax || 0))[0], first = [...list].sort((a, b) => a.t.localeCompare(b.t))[0];
            return row('🌀', `${T('{n} cyclones et tempêtes tropicales sont passés à moins de {r} km d’ici depuis {y} ; le plus fort : {s} ({d}).', {n: nf(list.length), r: String(Math.min(radius(), 100)), y: String(dateOfT(first.t).y), s: `<b>${esc(stormName(strong.s))}</b>`, d: esc(dayTxt(strong.t))})} ${srcLink(URL_.ibtracs)}`, LIC.ibtracs(),
                more(`<ul class="hist-ul tj-ul">${[...list].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 30).map(stormLi).join('')}</ul>`, list.length));
        }
        if (kind === 'villages') {
            const D = await rowsOf('villages'); const x = near(D.rows, ll.lat, ll.lon, 10, 1)[0]; if (!x) return '';
            return row('🏡', `${T('{v} : {w}.', {v: `<b>${link(x.r.url, short(x.r.n))}</b>`, w: esc([T((D.meta.kinds || {})[x.r.k] || x.r.k), x.r.from].filter(Boolean).join(' — '))})} ${srcLink(x.r.url)}`, LIC.wp(x.r.url), quote(x.r.intro));
        }
        if (kind === 'cajuns') {
            const D = await rowsOf('cajuns'); const p = parishOf(D.rows, ev); if (!p) return '';
            return row('⚜️', `${esc(p.r.fr || T('paroisse de {n}', {n: p.r.n}))}${p.r.acadiana ? esc(T(', en Acadiane : le pays des Cadiens, descendants des Acadiens chassés du Canada en 1755.')) : '.'} ${srcLink(p.r.url)}`, `${LIC.wd()} · ${link(p.r.url, 'Wikipédia (en)')}`);
        }
        if (kind === 'oberamt') {
            const D = await rowsOf('oberamt'); const x = oberamtOf(D.rows, ll.lat, ll.lon); if (!x) return '';
            return row('📘', `${T('Oberamt {o} : sa description est sur Wikisource.', {o: `<b>${esc(x.r.n)}</b>`})} ${srcLink(x.r.ws || x.r.search)}`, `${link(URL_.wsde, 'Wikisource (de)')} (${esc(T('domaine public'))})`);
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tj-panel"><h3>${esc(T('🌍 Partir et nommer'))}</h3><div class="hist-life tj-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]');
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tj_place', host: '[data-tj-host]', icon: '🌍', label: 'Partir et nommer', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tj])'); if (!village) return;
        village.dataset.tj = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-ti-host]') || village.querySelector('[data-tf-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tj-place" data-tj-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tj-host]'), villagePlace(village));
    }
    let pending = 0;
    if (root.document) new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['noms', 'tj_noms', '🏷', 'Les noms d’autrefois de ce lieu', 'Le lieu'], ['cyclones', 'tj_cyclones', '🌀', 'Cyclones passés près d’ici', 'Le lieu'],
        ['villages', 'tj_villages', '🏡', 'Village fondé par des Français', 'Le lieu'], ['cajuns', 'tj_cajuns', '⚜️', 'Paroisse de Louisiane', 'Le lieu'], ['oberamt', 'tj_oberamt', '📘', 'Oberamtsbeschreibung (Wurtemberg)', 'Le lieu']];
    const SRC_TXT = {noms: 'Wikidata (CC0) ; Pleiades (CC BY 3.0)', cyclones: 'NOAA NCEI IBTrACS (données publiques)', villages: 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', cajuns: 'Wikidata (CC0) ; Wikipédia (en)', oberamt: 'Wikisource (domaine public) ; Wikidata (CC0)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, group]) => ({
        id, icon, label, group, defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life tj-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes (thèmes de docs/design/listes-categories.html) ─────────── */
    const openSrc = r => { const u = safeUrl(r.src || r.url); if (u) window.open(u, '_blank', 'noopener'); };
    const L = (id, pack, icon, label, theme, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), theme, group: extra.group || 'Le lieu', source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: openSrc, ...extra});
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    const CC = {DE: 'Allemagne', PL: 'Pologne', CZ: 'Tchéquie', SK: 'Slovaquie', AT: 'Autriche', HU: 'Hongrie', CH: 'Suisse', IT: 'Italie', ES: 'Espagne', PT: 'Portugal', BE: 'Belgique', NL: 'Pays-Bas', LU: 'Luxembourg',
        GB: 'Royaume-Uni', IE: 'Irlande', DK: 'Danemark', NO: 'Norvège', SE: 'Suède', FI: 'Finlande', RU: 'Russie', UA: 'Ukraine', RO: 'Roumanie', HR: 'Croatie', SI: 'Slovénie', GR: 'Grèce', TR: 'Turquie',
        DZ: 'Algérie', TN: 'Tunisie', MA: 'Maroc', VN: 'Viêt Nam', CA: 'Canada', US: 'États-Unis', AR: 'Argentine', BR: 'Brésil', MX: 'Mexique', HT: 'Haïti', FR: 'France'};
    const ccName = c => T(CC[c] || c || '');
    const key = r => nameKey(r.name, r.lat, r.lon);
    (ext.dataLists = ext.dataLists || []).push(
        L('tj_noms', 'tj-noms', '🏷', 'Noms de lieux d’autrefois dans le monde (Wikidata)', 'lieux', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Property:P1448', 'noms',
            async () => (await rowsOf('noms')).rows.map(r => ({name: r.name, now: r.now, kind: r.k === 'o' ? T('nom officiel daté') : T('autre nom (sans date)'), from: r.from, to: r.to, country: ccName(r.cc), langs: r.langs || '', lat: r.lat, lon: r.lon, src: wd(r.q), q: r.q})),
            [F('name', 'Nom d’autrefois'), F('now', 'Nom d’aujourd’hui', 'place'), F('kind', 'Sorte', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’à', 'year'), F('country', 'Pays', 'enum'), F('langs', 'Langues'), F('src', 'Source', 'url')],
            {period: r => [r.from ?? r.to, r.to ?? r.from], geo: r => [r.lat, r.lon], merge: {into: 'anciens_noms', rank: 5, short: 'Wikidata', row: r => ({k: key(r), name: r.name, now: r.now, from: r.from, to: r.to, country: r.country, lat: r.lat, lon: r.lon, url: r.src})}}),
        L('tj_fusions', 'tj-fusions', '🔀', 'Communes disparues dans une fusion (Europe)', 'lieux', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Property:P1366', 'noms',
            async () => (await rowsOf('fusions')).rows.map(r => ({name: r.name, now: r.succ, from: r.from, to: r.to, country: ccName(r.cc), lat: r.lat, lon: r.lon, src: wd(r.q)})),
            [F('name', 'Commune disparue'), F('now', 'Reprise par', 'place'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’à', 'year'), F('country', 'Pays', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.from ?? r.to, r.to], geo: r => [r.lat, r.lon], merge: {into: 'anciens_noms', rank: 5, short: 'Wikidata (fusions)', row: r => ({k: key(r), name: r.name, now: r.now, from: r.from, to: r.to, country: r.country, lat: r.lat, lon: r.lon, url: r.src})}}),
        L('tj_pleiades', 'tj-pleiades', '🏺', 'Noms antiques des lieux (Pleiades)', 'lieux', 'Pleiades (CC BY 3.0)', 'https://pleiades.stoa.org/', 'noms',
            async () => (await rowsOf('pleiades')).rows.map(r => ({name: r.name, place: r.place, kind: r.kind, from: r.from, to: r.to, lat: r.lat, lon: r.lon, rough: r.rough ? T('position approximative') : '', src: `https://pleiades.stoa.org/places/${Number(r.id)}`})),
            [F('name', 'Nom antique'), F('place', 'Lieu (Pleiades)', 'place'), F('kind', 'Sorte', 'enum'), F('from', 'Attesté après', 'year'), F('to', 'Attesté avant', 'year'), F('rough', 'Précision', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.from ?? r.to, r.to ?? r.from], geo: r => [r.lat, r.lon], merge: {into: 'anciens_noms', rank: 4, short: 'Pleiades', row: r => ({k: key(r), name: r.name, now: '', from: r.from, to: r.to, country: '', lat: r.lat, lon: r.lon, url: r.src})}}),
        L('tj_cyclones', 'tj-cyclones', '🌀', 'Cyclones près des Antilles, de la Louisiane, de la Réunion… (depuis 1848)', 'ciel', 'NOAA NCEI IBTrACS (données publiques)', URL_.ibtracs, 'cyclones',
            async () => { const D = await rowsOf('cyclones'), Z = Object.fromEntries((D.meta.zones || []).map(z => [z[0], z[1]])); return D.rows.map(s => { const top = s.pts.reduce((a, p) => ((p[3] || 0) > (a[3] || 0) ? p : a), s.pts[0]);
                return {date: `${String(s.pts[0][0]).slice(0, 4)}-${String(s.pts[0][0]).slice(4, 6)}-${String(s.pts[0][0]).slice(6, 8)}`, year: s.season, name: stormName(s), zones: String(s.zones || '').split(' ').map(z => T(Z[z] || z)).join(', '), wind: s.wmax, cat: catTxt(s.wmax), lat: top[1], lon: top[2], src: URL_.ibtracs}; }); },
            [F('date', 'Date', 'date'), F('name', 'Nom'), F('zones', 'Passé près de', 'enum'), F('wind', 'Vent max (nœuds)', 'number'), F('cat', 'Force', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], group: 'Le monde', familyColumn: true, familyKm: 100}),
        L('tj_villages', 'tj-villages', '🏡', 'Villages fondés par des Français ailleurs dans le monde', 'lieux', 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', 'https://fr.wikipedia.org/wiki/Pig%C3%BC%C3%A9', 'villages',
            async () => { const D = await rowsOf('villages'); return D.rows.map(r => ({name: short(r.n), kind: T((D.meta.kinds || {})[r.k] || r.k), from: r.from, intro: r.intro, lat: r.lat, lon: r.lon, src: r.url})); },
            [F('name', 'Lieu', 'place'), F('kind', 'Fondé par', 'enum'), F('from', 'Venus de'), F('intro', 'Ce qu’en dit Wikipédia'), F('src', 'Source', 'url')], {geo: r => [r.lat, r.lon], group: 'Le monde'}),
        L('tj_cajuns', 'tj-cajuns', '⚜️', 'Paroisses de Louisiane et Acadiane', 'lieux', 'Wikidata (CC0) ; Wikipédia (en)', 'https://en.wikipedia.org/wiki/List_of_parishes_in_Louisiana', 'cajuns',
            async () => (await rowsOf('cajuns')).rows.map(r => ({name: r.fr || r.n, en: r.n, acadiana: r.acadiana ? T('Acadiane') : '', from: r.from, seat: r.seat, lat: r.lat, lon: r.lon, src: r.url})),
            [F('name', 'Paroisse', 'place'), F('en', 'Nom anglais'), F('acadiana', 'Acadiane', 'enum'), F('from', 'Créée en', 'year'), F('seat', 'Chef-lieu'), F('src', 'Source', 'url')], {period: r => [r.from, null], geo: r => [r.lat, r.lon], group: 'Le monde'}),
        L('tj_charcot', 'tj-charcot', '🧊', 'Les expéditions de Charcot : leurs membres', 'personnes', 'Wikidata (CC0)', 'https://fr.wikipedia.org/wiki/Jean-Baptiste_Charcot', 'charcot',
            async () => (await rowsOf('charcot')).rows.map(r => ({name: r.n, exp: r.exp, born: r.b, died: r.d, birthplace: r.born, job: r.job, src: wd(r.q)})),
            [F('name', 'Nom', 'text', {person: true}), F('exp', 'Expédition ou navire', 'enum'), F('born', 'Naissance', 'year'), F('died', 'Mort', 'year'), F('birthplace', 'Né à'), F('job', 'Métier'), F('src', 'Source', 'url')],
            {period: r => [r.born, r.died ?? r.born], group: 'Le monde', personMatch: {born: r => r.born, died: r => r.died, historic: true}}),
        L('tj_oberamt', 'tj-oberamt', '📘', 'Oberamtsbeschreibungen du Wurtemberg (Wikisource)', 'livres', 'Wikisource (domaine public) ; Wikidata (CC0)', URL_.wsde, 'oberamt',
            async () => (await rowsOf('oberamt')).rows.map(r => ({name: r.n, seat: r.seat, to: r.end, lat: r.lat, lon: r.lon, src: r.ws || r.search})),
            [F('name', 'Oberamt', 'place'), F('seat', 'Chef-lieu'), F('to', 'Jusqu’en', 'year'), F('src', 'La description (Wikisource)', 'url')], {geo: r => [r.lat, r.lon]}));
    // la liste réunie « 🗺 Anciens noms de lieux » (thème 🗺 Lieux) : un nom par ligne, même nom à moins d'un demi-degré = la même ligne ;
    // rang : registre national (à venir) 1 > GOV 2 > WHG 3 (lien) > Pleiades 4 > Wikidata 5 — déclarée ici seulement si le moteur ne l'a pas déjà
    const MERGE = {id: 'anciens_noms', theme: 'lieux', icon: '🗺', label: T('Anciens noms de lieux'), noun: ['nom', 'noms'], columns: ['name', 'now', 'from', 'to', 'country'],
        fields: [F('name', 'Nom d’autrefois'), F('now', 'Nom d’aujourd’hui', 'place'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’à', 'year'), F('country', 'Pays', 'enum'), {key: 'sources', label: T('Sources')}],
        same: {by: 'k'}, keep: ['k'], period: r => [r.from ?? r.to, r.to ?? r.from], geo: r => [r.lat, r.lon],
        sources: [{list: 'gov_noms', rank: 2, short: 'GOV', row: r => ({k: key(r), name: r.name, now: '', from: num(r.from), to: num(r.to), country: '', lat: r.lat, lon: r.lon, url: /^[A-Za-z0-9_-]+$/.test(r.gov || '') ? `https://gov.genealogy.net/item/show/${r.gov}` : ''})},
            {list: 'wikidata_anciens_noms', rank: 5, short: 'Wikidata (anciens noms)', row: r => ({k: key({name: r.old, lat: r.lat, lon: r.lon}), name: r.old, now: r.now, from: r.from, to: r.to, country: '', lat: r.lat, lon: r.lon, url: r.url})}]};
    const addMerge = () => { const M = ext.dataListMerges = ext.dataListMerges || []; if (!M.some(m => m.id === MERGE.id)) M.push(MERGE); };
    addMerge();
    if (root.document) document.addEventListener('DOMContentLoaded', () => { const M = ext.dataListMerges || []; if (M.filter(m => m.id === MERGE.id).length > 1 && M.includes(MERGE)) M.splice(M.indexOf(MERGE), 1); }, {once: true});

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, lab, yr = () => null, group = 'Le monde') => ({id, icon, label: T(label), group, kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 3000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || (yr(r) ?? from) >= from) && (!to || (yr(r) ?? to) <= to) && (!q || fold(lab(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: lab(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('tj_cyclones', '🌀', 'Cyclones (points toutes les 6 heures)', async () => (await rowsOf('cyclones')).rows.flatMap(s => s.pts.map(p => ({lat: p[1], lon: p[2], n: stormName(s), t: p[0], y: s.season}))), 'NOAA NCEI IBTrACS', r => `${r.n} — ${dayTxt(r.t)}`, r => r.y),
        layer('tj_villages', '🏡', 'Villages fondés par des Français', async () => (await rowsOf('villages')).rows, 'Wikipédia ; Wikidata', r => short(r.n)),
        layer('tj_pleiades', '🏺', 'Noms antiques (Pleiades)', async () => (await rowsOf('pleiades')).rows, 'Pleiades (CC BY 3.0)', r => `${r.name} (${r.place})`, r => r.from, 'Le lieu'),
        layer('tj_noms', '🏷', 'Noms de lieux d’autrefois (monde)', async () => (await rowsOf('noms')).rows, 'Wikidata (CC0)', r => `${r.name} → ${r.now}`, r => r.to, 'Le lieu'),
        layer('tj_cajuns', '⚜️', 'Paroisses de Louisiane', async () => (await rowsOf('cajuns')).rows, 'Wikidata ; Wikipédia', r => `${r.fr || r.n}${r.acadiana ? ' ⚜️' : ''}`),
        layer('tj_oberamt', '📘', 'Oberämter du Wurtemberg', async () => (await rowsOf('oberamt')).rows, 'Wikidata ; Wikisource', r => `Oberamt ${r.n}`, () => null, 'Le lieu'));

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = c => Number(c.person?.id || c.person?.person?.id || c.person) || 0;
    const privOfCtx = c => { const p = c.person?.person || c.person; return !!(p && typeof p === 'object' && (p.living_status === 'living' || Number(p.is_private) === 1)); };
    async function runPerson(parts, c, host, empty) {
        const id = personOfCtx(c); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true, private: privOfCtx(c)});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, c, host) {
        const pl = placeOfCtx(c.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life tj-life">${html}</div>` : '';
        return !!html;
    }
    const DS = (id, icon, label, parts, empty) => ({id, icon, label: T(label), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (c, host) => runPerson(parts, c, host, empty)});
    (ext.dataSources = ext.dataSources || []).push(
        DS('tjp_noms', '🏷', 'Les anciens noms de ses lieux, et où chercher dans chaque pays', ['noms'], 'Aucun ancien nom connu pour ses lieux (personne décédée seulement).'),
        DS('tjp_cyclones', '🌀', 'Les cyclones de sa vie près de ses lieux', ['cyclones'], 'Aucun cyclone connu près de ses lieux, de son vivant (Antilles, Louisiane, Réunion, Madagascar, Pacifique).'),
        DS('tjp_partir', '🌊', 'Partir : la traversée, Saint-Domingue, Louisiane, Canada, villages fondés ailleurs', ['mer', 'memoire', 'cajuns', 'canada', 'villages', 'oberamt'], 'Rien : ses lieux sont tous en Europe, ou sans position.'),
        DS('tjp_charcot', '🧊', 'Un homonyme dans les expéditions de Charcot', ['charcot'], 'Aucun homonyme (comparé sur l’ordinateur, seulement pour une personne décédée et non confidentielle).'),
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (c, host) => runPlace(kind, c, host)})));

    /* ─────────── ⚙️ Réglages → 🌍 Partir et nommer ─────────── */
    const FILE_LABEL = [['noms', '🏷 Noms d’autrefois (monde)'], ['fusions', '🔀 Communes disparues'], ['pleiades', '🏺 Noms antiques'], ['cyclones', '🌀 Cyclones'], ['villages', '🏡 Villages fondés par des Français'],
        ['cajuns', '⚜️ Paroisses de Louisiane'], ['charcot', '🧊 Expéditions de Charcot'], ['oberamt', '📘 Oberämter du Wurtemberg']];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-tj-tg="${esc(k)}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('À fabriquer sur GitHub (Actions → « Partir et nommer (lot J) ») ; arrive ensuite par Réglages → 🗂 Données.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings tj-settings" data-tj-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Partir et nommer'), icon: '🌍', where: T('Réglages · Données'), help: esc(T('La mer et les cyclones, les Français partis ailleurs, et les noms de lieux d’autrefois de tous les pays.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne décédée (bloc « 🌍 Partir et nommer »), sur la fiche d’un village et dans la monographie. Les listes sont dans Listes (🗺 Lieux et noms de lieux, ⛅ Climat, 🔎 Retrouver une personne, 📚 Livres), les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}
                <div class="tj-opts"><label class="tj-opt">${esc(T('Cyclones : « près de ses lieux » = à moins de'))} <select data-tj-km>${RADII.map(r => `<option value="${r}" ${r === radius() ? 'selected' : ''}>${esc(T('{n} km', {n: String(r)}))}</option>`).join('')}</select></label></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Seuls les liens « ↗ » ouvrent une page, quand on clique. Rien pour une personne vivante ou confidentielle ; en consultation et pour un invité du réseau local, ni comparaison de noms ni lien de carte.'))}</p>
                <p class="muted">${esc(T('Déjà dans l’app et réuni : les noms de GOV et les anciens noms officiels déjà livrés (Wikidata) entrent avec ceux-ci dans la liste réunie « 🗺 Anciens noms de lieux ».'))}</p></div>
            <div class="maintenance-panel"><h3>${esc(T('En lien seulement'))}</h3><ul class="hist-ul tj-ul">${LINK_ONLY.map(([, l, u, what, why]) => `<li>${link(u, `↗ ${T(l)}`)}<br><small class="muted">${esc(T(what))} — ${esc(T(why))}</small></li>`).join('')}</ul></div></section>`;
    }
    const undo = (msg, k, was) => A().undoToast?.(msg, {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🌍'});
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tj-tg]');
        if (t && e.target.matches('input')) {
            const s = settings(), k = t.dataset.tjTg, was = s[k];
            s[k] = e.target.checked; saveSettings(s);
            undo(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), k, was);
            return;
        }
        if (e.target.matches?.('[data-tj-km]')) {
            const s = settings(), was = s.km, v = Number(e.target.value); if (!RADII.includes(v)) return;
            s.km = v; saveSettings(s); undo(T('Cyclones « près de ses lieux » : {n} km.', {n: String(v)}), 'km', was);
        }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_m'); if (i < 0) i = tabs.findIndex(t => t[0] === 'telech_i'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_m'); if (i < 0) i = B.findIndex(b => b[0] === 'telech_i'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🌍 Partir et nommer']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register() && root.document) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechJ = {...core, load, settings, radius, personInto, placeInto, placePart, lifeOf, oldNames, gazetteer, LINK_ONLY,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
