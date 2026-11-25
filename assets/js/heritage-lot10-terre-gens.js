/* LCNDA — ⛰️👥 Sa terre et ses gens (lot 10). Serveur : lib/lot10_terre_gens.php ; style : assets/css/lot10-terre-gens.css ;
 * données livrées : assets/data/l10t-*.json.gz (refaites par scripts/lot10-terre-gens/*.py). Tout est sourcé, avec « ↗ » vers la source.
 *  ⛰️ Les dangers de sa terre : 🏔️ avalanches historiques (Wikidata) · 🪨 glissements et éboulements (BDMvt) · 🕳️ carrières et cavités
 *     (Géorisques, en ligne, gardé) · 🌋 les volcans lointains qui ont gâché ses récoltes (Wikipédia + NOAA) · ⚓ les épaves au large de son port
 *  👥 Les gens et les lieux autour de lui : 👥 la carte de son nom (décès INSEE déjà importés) · 🐴 les relais de poste sur sa route et le
 *     temps en diligence · 🚶 le temps de marche entre deux villages, relief compris (altitudes IGN) · 🗺️ la parcelle d'un lieu-dit sur le
 *     cadastre d'aujourd'hui (à la demande) · 🏘️ les villages de colonisation en Algérie · ⚜️ le patrimoine du Québec · 📖 le Dictionnaire
 *     historique de la Suisse (lien) · 🇺🇸 le recensement américain de 1950 (lien de recherche, « Où chercher »).
 * Où ça s'affiche : un bloc de fiche « ⛰️ Sa terre et ses gens » (une phrase par sujet, ▸ plus), la fiche d'un village, la monographie
 * (LCNDA_EXT.monographSections), 🔎 Ce qui le concerne / 🧰 Données (LCNDA_EXT.dataSources), Listes → Données (LCNDA_EXT.dataLists),
 * les cartes (LCNDA_EXT.mapLayerSources), « Où chercher » (LCNDA_OUC_MONDE.SITES) et Réglages → « ⛰️ Sa terre et ses gens »
 * (localStorage « genealogie-terre-gens »). Pour d'autres fichiers : LCNDA_EXT.terreGens. Essai : tests/test-lot10-terre-gens.js
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const W = root || {};
    const A = () => W.LCNDA_APP || {};
    const UI = () => W.LCNDA_UI || {};
    const ext = W.LCNDA_EXT = W.LCNDA_EXT || {};
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return W.LCNDA_I18N ? W.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const nf = (n, d = 0) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d, minimumFractionDigits: 0});
    const link = (url, label = T('↗ source'), title = '') => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</a>` : esc(label));
    const more = (inner, n) => `<details class="cplus-more l10-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const srcLine = (label, licence, url, extra = '') => `<p class="cplus-src l10-src">${esc(T('Source :'))} ${url ? link(url, label) : esc(label)}${licence ? ` — ${esc(licence)}` : ''}${url ? ` · ${link(url)}` : ''}${extra}</p>`;
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateFr = s => { const m = String(s || '').match(/^(-?\d{1,4})(?:-(\d\d))?(?:-(\d\d))?/); if (!m) return ''; const y = Number(m[1]), mo = Number(m[2] || 0), d = Number(m[3] || 0); return `${d ? `${d === 1 ? '1er' : d} ` : ''}${mo ? `${T(MONTHS[mo - 1])} ` : ''}${y}`; };
    const kmTxt = k => (k < 1 ? T('sur place') : T('à {n} km', {n: nf(k < 10 ? Math.round(k * 10) / 10 : Math.round(k), 1)}));
    const hoursTxt = h => { const m = Math.max(5, Math.round(h * 60 / 5) * 5); const hh = Math.floor(m / 60), mm = m % 60; return hh ? (mm ? T('{h} h {m}', {h: hh, m: String(mm).padStart(2, '0')}) : T('{h} h', {h: hh})) : T('{m} min', {m: mm}); };
    const listFr = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${T('et')} ${arr[arr.length - 1]}`);
    const fmtDate = ts => new Date(ts * 1000).toLocaleDateString('fr-FR');

    /* ═════════════ les réglages ═════════════ */
    const KEY = 'genealogie-terre-gens';
    const TAB = ['terre_gens', '25l10t', '⛰️ Sa terre et ses gens'];
    const PARTS = [
        ['avalanches', '🏔️ Les avalanches historiques', 'Les grandes avalanches datées (Wikidata) à moins de 15 km de ses villages, de son vivant.'],
        ['mvt', '🪨 Glissements, éboulements, effondrements', 'Les mouvements de terrain datés de sa commune pendant sa vie (BRGM, Géorisques, en ligne : on n’envoie que le code de la commune).'],
        ['cavites', '🕳️ Carrières et cavités souterraines', 'S’il était carrier, mineur ou tailleur de pierre : les carrières et caves recensées dans sa commune (Géorisques, en ligne).'],
        ['volcans', '🌋 Les volcans qui ont gâché ses récoltes', 'Tambora et l’« année sans été » (1816), le Laki (1783)… s’il était en vie, avec ce qu’en dit Wikipédia.'],
        ['epaves', '⚓ Les épaves au large de son port', 'S’il était marin ou pêcheur : les épaves et naufrages connus à moins de 30 km de son port (Wikidata).'],
        ['nom', '👥 La carte de son nom', 'Où sont nés les porteurs de son nom, d’après les décès INSEE déjà importés dans l’app (rien n’est envoyé).'],
        ['relais', '🐴 Les relais de poste sur sa route', 'Pour un grand trajet de sa vie : les relais de poste connus près de la route et le temps en diligence.'],
        ['marche', '🚶 Le temps de marche jusqu’à son conjoint', '« Sa femme habitait à 3 h de marche » : la distance à pied, relief compris (altitudes IGN, en ligne). Jamais pour une personne vivante.'],
        ['parcelle', '🗺️ La parcelle d’un lieu-dit', 'À la demande : le lieu-dit de sa ferme retrouvé sur le cadastre d’aujourd’hui (IGN, en ligne).'],
        ['algerie', '🏘️ Les villages de colonisation en Algérie', 'Si un parent est parti en Algérie : la date de création de son village et son ancien nom (Wikidata).'],
        ['quebec', '⚜️ Le patrimoine du Québec', 'Pour les ancêtres partis en Nouvelle-France : les églises, maisons et moulins de leur temps près de chez eux.'],
        ['suisse', '📖 Le Dictionnaire historique de la Suisse', 'Pour une commune suisse : le lien vers son article (lien seulement).'],
        ['census', '🇺🇸 Le recensement américain de 1950', 'Dans « Où chercher » : un lien de recherche direct si un parent vivait aux États-Unis en 1950.']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(W.localStorage?.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { W.localStorage?.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => !!W.document?.body?.classList.contains('is-kiosk') || !!W.document?.body?.classList.contains('ms-on');

    /* ═════════════ les fichiers livrés (chargés une fois, à la demande) ═════════════ */
    const FILES = ['avalanches', 'volcans', 'epaves', 'relais', 'algerie', 'quebec', 'suisse'];
    const files = {};
    async function readGz(url) {
        const r = await fetch(url, {credentials: 'same-origin'});
        if (!r.ok) throw new Error(T('Fichier introuvable : {f}', {f: url.split('?')[0]}));
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ce fichier.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const load = name => (files[name] ||= readGz(`assets/data/l10t-${name}.json.gz?v=1`).catch(e => { delete files[name]; throw e; }));
    const tryLoad = name => load(name).catch(() => null);
    const api = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const memo = new Map();
    W.addEventListener?.('lcnda:data-changed', () => memo.clear()); // une fiche modifiée (date, lieu, lien…) : ses blocs sont redemandés, pas repris de la mémoire
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }

    /* ═════════════ les calculs (sans écran : aussi pour Node) ═════════════ */
    /** la vie d'une personne (depuis l10t_person) */
    function lifeOf(P) {
        const ev = P?.events || [], first = kinds => ev.filter(e => kinds.includes(e.kind) && e.year).sort((a, b) => a.year - b.year)[0] || null;
        const b = first(['birth']) || first(['bapt']), d = first(['death']) || first(['burial']);
        const by = b?.year || null, dy = d?.year || null, now = new Date().getFullYear();
        const end = dy || (by ? Math.min(by + 85, now) : null);
        const placeOf = e => (e?.place ? P.places?.[e.place] || null : null);
        const places = Object.values(P?.places || {});
        const jobs = (P?.jobs || []).join(' ; ');
        return {P, by, dy, end, unsure: !dy, birthEv: b, deathEv: d, birthPlace: placeOf(b), deathPlace: placeOf(d), places, placeOf, jobs, fem: P?.gender === 'female', first: P?.first || '', last: P?.last || ''};
    }
    const inLife = (L, y) => !!(L.by && y && y >= L.by && y <= L.end);
    const ageAt = (L, y) => (L.by && y ? y - L.by : null);
    const ageTxt = (L, y) => { const a = ageAt(L, y); return a == null ? '' : a <= 0 ? T(L.fem ? 'elle venait de naître' : 'il venait de naître') : T(L.fem ? 'elle avait {n} ans' : 'il avait {n} ans', {n: a}); };
    const pname = p => p?.commune || p?.name || '';
    const withXY = arr => arr.filter(p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && p.lat !== null);
    const RE_MARIN = /\b(marin|matelot|p[êe]cheur|navigateur|capitaine|mousse|novice|timonier|ma[îi]tre d.?[ée]quipage|officier de marine|armateur|caboteur|terre.?neuvas|marinier|pilote|ma[îi]tre de barque|patron de barque|inscrit maritime|marine)\b/i;
    const RE_CARRIER = /\b(carrier|carri[èe]re|mineur|tailleur de pierre|perrier|ardoisier|pl[âa]trier|champignonniste|chaufournier|meulier|marbrier|caillouteur)\b/i;
    const isMarin = L => RE_MARIN.test(L.jobs);
    const isCarrier = L => RE_CARRIER.test(L.jobs);
    /** les points d'un fichier à moins de r km d'un lieu, du plus près au plus loin */
    const near = (rows, p, r) => (p && p.lat != null ? rows.map(x => ({...x, km: km(Number(p.lat), Number(p.lon), x.lat, x.lon)})).filter(x => x.km <= r).sort((a, b) => a.km - b.km) : []);

    /** 🏔️ les avalanches de son vivant près de ses lieux */
    function avalanchesPerson(D, L, r = 15) {
        const out = []; const seen = new Set();
        for (const p of withXY(L.places)) for (const a of near(D?.rows || [], p, r)) { if (!seen.has(a.q) && inLife(L, a.y)) { seen.add(a.q); out.push({...a, place: pname(p)}); } }
        return out.sort((a, b) => a.y - b.y);
    }
    /** 🌋 les éruptions dont l'effet tombe pendant sa vie (hémisphère nord) */
    function volcansPerson(D, L) {
        if (!L.by) return [];
        const north = withXY(L.places).some(p => p.lat > 15) || L.places.some(p => p.cc === 'fr') || !L.places.length;
        if (!north) return [];
        return (D?.rows || []).filter(e => e.effect[1] >= L.by && e.effect[0] <= L.end).map(e => ({...e, y: Math.max(e.effect[0], L.by)}));
    }
    /** ⚓ les épaves près de ses ports (s'il était marin) */
    function epavesPerson(D, L, r = 30) {
        if (!isMarin(L)) return null;
        let best = null;
        for (const p of withXY(L.places)) {
            const all = near(D?.rows || [], p, r); if (!all.length) continue;
            const dated = all.filter(w => inLife(L, w.y));
            if (!best || dated.length > best.dated.length || (dated.length === best.dated.length && all.length > best.all.length)) best = {place: p, all, dated: dated.sort((a, b) => a.y - b.y)};
        }
        return best;
    }
    /** 🐴 les relais de poste à moins de w km de la ligne droite entre deux lieux */
    function relaisOnRoute(rows, a, b, w = 8) {
        const out = [];
        const d = km(a.lat, a.lon, b.lat, b.lon); if (!d) return out;
        const lat0 = (a.lat + b.lat) / 2 * Math.PI / 180, X = (lat, lon) => [lon * 111.32 * Math.cos(lat0), lat * 110.57];
        const [ax, ay] = X(a.lat, a.lon), [bx, by] = X(b.lat, b.lon), vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        for (const r of rows || []) {
            const [px, py] = X(r.lat, r.lon); let t = ((px - ax) * vx + (py - ay) * vy) / L2; if (t < -0.02 || t > 1.02) continue; t = Math.max(0, Math.min(1, t));
            const dist = Math.hypot(px - (ax + t * vx), py - (ay + t * vy)); if (dist <= w) out.push({...r, t, off: dist});
        }
        return out.sort((x, y) => x.t - y.t);
    }
    /** 🐴 le grand trajet de sa vie : de sa naissance au lieu le plus loin (mariage, résidence, décès) */
    function bigJourney(L, minKm = 25) {
        const a = withXY([L.birthPlace])[0] || withXY(L.places)[0]; if (!a) return null;
        let best = null;
        for (const e of L.P.events || []) {
            const p = L.placeOf(e); if (!p || p.lat == null || p === a) continue;
            const d = km(a.lat, a.lon, p.lat, p.lon); if (d >= minKm && (!best || d > best.km)) best = {from: a, to: p, km: d, year: e.year || L.by, kind: e.kind};
        }
        return best;
    }
    /** 🚶 son lieu et celui de son conjoint les plus proches (1 à 40 km), pour le temps de marche */
    function spouseWalk(L) {
        const mine = withXY([L.birthPlace, ...L.places.filter(p => p.cc === 'fr' || p.insee)]);
        let best = null;
        for (const s of L.P.spouses || []) {
            if (s.living || s.private) continue;
            const ev = s.events || [], b = ev.find(e => e.kind === 'birth') || ev.find(e => e.kind === 'bapt') || ev.find(e => e.kind === 'resi');
            const theirs = withXY([b ? s.places?.[b.place] : null, ...Object.values(s.places || {})]);
            for (const a of mine) for (const p of theirs) {
                const d = km(a.lat, a.lon, p.lat, p.lon);
                if (d >= 1 && d <= 40 && (!best || d < best.km)) best = {me: a, them: p, km: d, spouse: s};
            }
        }
        return best;
    }
    /** un lieu → le village d'Algérie / la commune suisse : par le nom (ou l'ancien nom), sinon le plus proche à moins de r km */
    function matchPlace(rows, p, r = 4) {
        if (!p) return null;
        const n = fold(p.name || p.commune), byName = (rows || []).find(x => fold(x.n) === n || (x.alt || []).some(a => fold(a) === n));
        if (byName) return {...byName, km: p.lat != null ? km(Number(p.lat), Number(p.lon), byName.lat, byName.lon) : null, via: fold(byName.n) === n ? 'nom' : 'ancien'};
        const c = near(rows || [], p, r)[0]; return c ? {...c, via: 'proche'} : null;
    }
    const inBox = (p, [la0, la1, lo0, lo1]) => p && p.lat != null && p.lat >= la0 && p.lat <= la1 && p.lon >= lo0 && p.lon <= lo1;
    const BOX = {dz: [18.9, 37.2, -8.7, 12], ch: [45.8, 47.85, 5.9, 10.5], qc: [44.9, 62.6, -79.8, -57]};
    const isDZ = p => p?.cc === 'dz' || inBox(p, BOX.dz);
    const isCH = p => p?.cc === 'ch' || (p?.cc !== 'fr' && !p?.insee && inBox(p, BOX.ch));
    const isQC = p => (p?.cc === 'ca' || /qu[ée]bec/i.test(`${p?.county} ${p?.full}`) || (!p?.insee && inBox(p, BOX.qc))) && (p?.lat == null || inBox(p, BOX.qc));
    /** ⚜️ le patrimoine près d'un lieu du Québec, qui existait de son vivant (ou sans date) */
    function quebecNear(D, p, L = null, r = 3) {
        return near(D?.rows || [], p, r).filter(x => !L || !x.y || x.y <= L.end).sort((a, b) => (a.y || 9999) - (b.y || 9999));
    }
    /** 👥 la carte du nom : les parts par département */
    function nomShares(N) {
        if (!N?.total) return [];
        const fr = (N.deps || []).reduce((s, d) => s + d.n, 0) || 1;
        return (N.deps || []).map(d => ({...d, pct: Math.round(d.n * 1000 / fr) / 10}));
    }
    /** 🚶 le temps à pied, règle de Tobler (aussi dans le serveur) : profil [[lat, lon, z]…], chemins = 1,3 × la ligne droite */
    function walkTime(pts, detour = 1.3) {
        let h = 0, d = 0, up = 0;
        for (let i = 1; i < pts.length; i++) {
            const seg = km(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) * detour; if (!seg) continue;
            const dz = pts[i][2] - pts[i - 1][2], v = 6 * Math.exp(-3.5 * Math.abs(dz / (seg * 1000) + 0.05));
            h += seg / Math.max(0.5, v); d += seg; if (dz > 0) up += dz;
        }
        return {hours: Math.round(h * 100) / 100, km: Math.round(d * 10) / 10, up: Math.round(up)};
    }
    const calc = {lifeOf, avalanchesPerson, volcansPerson, epavesPerson, relaisOnRoute, bigJourney, spouseWalk, matchPlace, quebecNear, nomShares, walkTime, near, isMarin, isCarrier, isQC, isCH, isDZ};
    if (!W.document) return calc;
    if (ext.terreGens?.fillPerson) return ext.terreGens; // déjà chargé (index.php + un essai, ou deux balises) : pas de doubles écouteurs

    /* ═════════════ les morceaux de texte ═════════════ */
    const WD = (q, label = 'Wikidata') => link(`https://www.wikidata.org/wiki/${q}`, label);
    const wdLinks = r => [r.wp ? link(r.wp, T('Wikipédia ↗')) : '', WD(r.q, T('Wikidata ↗'))].filter(Boolean).join(' · ');
    const rowLi = (main, sub, links) => `<li class="tr-item l10-item"><div><span>${main}</span>${sub ? `<small class="muted">${sub}</small>` : ''}${links ? `<small>${links}</small>` : ''}</div></li>`;
    const ul = items => `<ul class="tr-list l10-list">${items.join('')}</ul>`;
    const list = (items, fn, N = 3) => (items.length ? `${ul(items.slice(0, N).map(fn))}${items.length > N ? more(ul(items.slice(N, 60).map(fn)), items.length - N) : ''}` : '');
    const metaSrc = (D, extra = '') => (D ? srcLine(D.source === 'Wikidata' ? 'Wikidata' : D.source, D.licence, D.url, extra) : '');
    const EPA = 'https://www.avalanches.fr/';
    const GR_MVT = 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/base-de-donnees-mouvements-de-terrain';
    const GR_CAV = 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/inventaire-des-cavites-souterraines';

    /* ── 🏔️ avalanches ── */
    const avaRow = a => rowLi(`🏔️ <b>${esc(a.n)}</b> — ${esc(dateFr(a.d))}`, [a.place ? esc(T('{k} de {p}', {k: kmTxt(a.km), p: a.place})) : esc(kmTxt(a.km)), a.deaths ? esc(T('{n} morts', {n: a.deaths})) : '', esc(a.country || '')].filter(Boolean).join(' · '), wdLinks(a));
    const epaLine = () => `<p class="muted"><small>${esc(T('Toutes les avalanches observées commune par commune depuis le XIXᵉ siècle sont dans l’Enquête permanente sur les avalanches (INRAE) : à consulter sur leur site, elles ne sont pas copiées dans l’app.'))} ${link(EPA, T('avalanches.fr ↗'))}</small></p>`;
    function avalanchesHtml(D, items, {L = null, place = ''} = {}) {
        if (!items?.length) return '';
        const f = items[0];
        const lead = L ? T('De son vivant, {k} de {p} : {n}, le {d}{m} — {a}.', {k: kmTxt(f.km), p: f.place, n: f.n, d: dateFr(f.d), m: f.deaths ? T(' ({x} morts)', {x: f.deaths}) : '', a: ageTxt(L, f.y)})
            : items.length === 1 ? T('Une grande avalanche {k} de {p} : {n}, le {d}.', {k: kmTxt(f.km), p: place, n: f.n, d: dateFr(f.d)}) : T('{x} grandes avalanches à moins de 15 km de {p}, dont {n} ({d}).', {x: items.length, p: place, n: f.n, d: dateFr(f.d)});
        return `<p class="cplus-lead">🏔️ ${esc(lead)} ${wdLinks(f)}</p>${items.length > 1 ? more(ul(items.map(avaRow)), items.length) : ''}${more(epaLine())}${metaSrc(D, ` · <small>${esc(T('seulement les avalanches que Wikidata date et place'))}</small>`)}`;
    }

    /* ── 🪨 glissements, 🕳️ cavités (Géorisques, en ligne) ── */
    const MVT_ICON = t => (/chute|boul/i.test(t) ? '🪨' : /effondr|affaiss/i.test(t) ? '🕳️' : /coul/i.test(t) ? '🌊' : /rosion/i.test(t) ? '🌊' : '⛰️');
    const mvtRow = m => rowLi(`${MVT_ICON(m.type)} <b>${esc(m.type)}</b>${m.date ? ` — ${esc(m.prec === 'Jour' ? dateFr(m.date) : String(m.y))}` : ''}`, [m.lieu, m.note, m.fiab ? T('fiabilité : {f}', {f: m.fiab.toLowerCase()}) : ''].filter(Boolean).map(esc).join(' · '), '');
    const grSrc = (r, which) => srcLine(which === 'cav' ? T('BRGM, Géorisques — inventaire des cavités souterraines') : T('BRGM, Géorisques — base des mouvements de terrain (BDMvt)'), T('Licence Ouverte 2.0'), which === 'cav' ? GR_CAV : GR_MVT,
        ` · ${link(which === 'cav' ? r.url_cav : r.url_mvt, T('la réponse exacte (code INSEE {c}) ↗', {c: r.insee}))}${r.fetched_at ? ` · <small>${esc(T(r.cached ? 'gardé le {d}' : 'lu en ligne le {d}', {d: fmtDate(r.fetched_at)}))}</small>` : ''}`);
    function mvtHtml(r, {L = null, place = ''} = {}) {
        if (!r?.ok || !r.mvt?.length) return '';
        const dated = r.mvt.filter(m => m.y), life = L ? dated.filter(m => inLife(L, m.y)) : [];
        if (L && !life.length) return '';
        const items = L ? life : r.mvt, f = items[0];
        const what = m => `${m.type.toLowerCase()}${m.lieu ? ` (${m.lieu.replace(/\.$/, '')})` : ''}`;
        const lead = L ? T('De son vivant, à {p} : {w} en {y} — {a}.', {p: place, w: what(f), y: f.prec === 'Jour' ? dateFr(f.date) : f.y, a: ageTxt(L, f.y)})
            : dated.length ? T('{n} mouvements de terrain connus à {p}, le plus ancien en {y} : {w}.', {n: r.mvt_total, p: place, y: dated[0].y, w: what(dated[0])}) : T('{n} mouvements de terrain connus à {p} (sans date).', {n: r.mvt_total, p: place});
        return `<p class="cplus-lead">${MVT_ICON(f.type)} ${esc(lead)}</p>${items.length > 1 || !L ? more(ul(items.slice(0, 80).map(mvtRow)), items.length) : ''}${grSrc(r, 'mvt')}`;
    }
    function cavitesHtml(r, {L = null, place = ''} = {}) {
        if (!r?.ok || !r.cav?.length) return '';
        const by = {}; r.cav.forEach(c => { by[c.type || 'indéterminé'] = (by[c.type || 'indéterminé'] || 0) + 1; });
        const kinds = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k === 'indéterminé' ? T('de sorte inconnue') : k}${n > 1 && !/s$/.test(k) && k !== 'indéterminé' ? 's' : ''}`);
        const lead = L ? T('{c} cavités souterraines sont recensées à {p} ({k}) : peut-être là où {il} travaillait.', {c: r.cav_total, p: place, k: listFr(kinds.slice(0, 3)), il: L.fem ? 'elle' : 'il'})
            : T('{c} cavités souterraines recensées à {p} : {k}.', {c: r.cav_total, p: place, k: listFr(kinds.slice(0, 3))});
        const named = r.cav.filter(c => c.nom && !/^(ind|site_|cave_?)\s*\d/i.test(c.nom));
        const cavRow = c => rowLi(`🕳️ <b>${esc(c.nom || T('sans nom'))}</b>`, esc(c.type), c.lat != null ? link(`https://www.geoportail.gouv.fr/carte?c=${c.lon},${c.lat}&z=17&permalink=yes`, T('voir sur la carte (Géoportail) ↗')) : '');
        return `<p class="cplus-lead">🕳️ ${esc(lead)}</p>${named.length ? more(ul(named.slice(0, 80).map(cavRow)), named.length) : ''}${grSrc(r, 'cav')}`;
    }

    /* ── 🌋 volcans ── */
    function volcansHtml(D, items, {L = null, year = null} = {}) {
        if (!items?.length) return '';
        const qBox = e => `<details class="l10-quote"><summary><small>${esc(T('Ce que dit la source'))}</small></summary>${e.quotes.map(q => `<blockquote>« ${esc(q.q)} » <small>${esc(q.title)} ${link(q.url)}</small></blockquote>`).join('')}</details>`;
        const head = e => `${e.vei ? ` <small class="muted">${esc(T('(indice d’explosivité {v} sur 8, NOAA)', {v: e.vei}))}</small>` : ''}`;
        const one = e => `<p class="cplus-lead">🌋 ${esc(L ? T('En {w}, {a} : {x}.', {w: e.when, a: ageTxt(L, e.y), x: e.what}) : T('En {w} : {x}.', {w: e.when, x: e.what}))}${head(e)} ${link(e.quotes[0].url)}</p>${qBox(e)}`;
        return `${items.slice(0, 2).map(one).join('')}${items.length > 2 ? more(items.slice(2).map(one).join(''), items.length - 2) : ''}
            ${srcLine(T('Wikipédia (une phrase exacte par fait)'), 'CC BY-SA 4.0', D.url, ` · ${items.filter(e => e.noaa_url).map(e => link(e.noaa_url, T('NOAA : {v} ↗', {v: e.volcano}))).join(' · ')} — ${esc(T('domaine public'))}`)}
            ${ext.lot8CielMetier || ext.cielMetier ? `<p class="muted"><small>${esc(T('Les ciels étranges de ces années (brouillard sec, couchers de soleil rouges) sont dans « 🌅 Les ciels étranges de sa vie ».'))}</small></p>` : ''}`;
    }

    /* ── ⚓ épaves ── */
    const wreckRow = w => rowLi(`⚓ <b>${esc(w.n)}</b>${w.y ? ` — ${esc(w.k === 'naufrage' || w.d?.length > 4 ? dateFr(w.d) : String(w.y))}` : ''}`, esc(kmTxt(w.km)), wdLinks(w));
    function epavesHtml(D, E, {L = null, place = ''} = {}) {
        if (!E || !E.all?.length) return '';
        const p = place || pname(E.place), f = E.dated[0];
        const lead = L && f ? T('De son vivant, {k} de {p} : {n} ({d}) — {a}.', {k: kmTxt(f.km), p, n: f.n, d: f.d?.length > 4 ? dateFr(f.d) : f.y, a: ageTxt(L, f.y)})
            : E.all.length === 1 ? T('Une épave connue au large de {p} : {n} ({k}).', {p, n: E.all[0].n, k: kmTxt(E.all[0].km)}) : T('{x} épaves connues au large de {p}, la plus proche : {n} ({k}).', {x: E.all.length, p, n: E.all[0].n, k: kmTxt(E.all[0].km)});
        const rest = L && f ? [...E.dated.slice(1), ...E.all.filter(w => !E.dated.includes(w))] : E.all;
        return `<p class="cplus-lead">⚓ ${esc(lead)} ${wdLinks(f || E.all[0])}</p>${rest.length ? more(ul(rest.slice(0, 60).map(wreckRow)), rest.length) : ''}${metaSrc(D, ` · <small>${esc(T('épaves et naufrages placés sur Wikidata : la liste n’est pas complète ; les fichiers du DRASSM ne sont pas copiés'))}</small>`)}`;
    }

    /* ── 👥 la carte du nom ── */
    function nomMap(N) {
        const pts = (N.deps || []).filter(d => d.lat != null && d.lat > 41 && d.lat < 52 && d.lon > -5.5 && d.lon < 10); if (!pts.length) return '';
        const max = Math.max(...pts.map(d => d.n)), X = lon => ((lon + 5.2) / 15) * 300, Y = lat => ((51.2 - lat) / 9.9) * 300;
        return `<svg class="l10-nommap" viewBox="0 0 300 300" role="img" aria-label="${esc(T('Carte : où sont nés les {n}', {n: N.name}))}"><rect x="0" y="0" width="300" height="300" rx="8" class="l10-nommap-bg"/>
            ${pts.map(d => `<circle cx="${X(d.lon).toFixed(1)}" cy="${Y(d.lat).toFixed(1)}" r="${(3 + 13 * Math.sqrt(d.n / max)).toFixed(1)}" class="l10-dot"><title>${esc(`${d.name} (${d.dep}) : ${d.n}`)}</title></circle>`).join('')}</svg>`;
    }
    function nomHtml(N, {L = null} = {}) {
        if (!N?.ok || !N.total) return '';
        const S = nomShares(N), top = S.slice(0, 3);
        const fr = S.reduce((s, d) => s + d.n, 0);
        const range = N.deaths?.[0] ? T(' (morts entre {a} et {b})', {a: N.deaths[0], b: N.deaths[1]}) : '';
        const lead = top.length ? T('Les {n} du fichier des décès de l’INSEE{r} sont nés surtout {w}.', {n: N.name, r: range, w: listFr(top.map(d => T('dans le département {d} ({p} %)', {d: `${d.name}`, p: nf(d.pct, 1)})))})
            : T('Les {n} du fichier des décès de l’INSEE{r} sont tous nés hors de France.', {n: N.name, r: range});
        const tr = d => `<tr><td>${esc(d.name)} <small class="muted">${esc(d.dep)}</small></td><td>${esc(nf(d.n))}</td><td>${esc(nf(d.pct, 1))} %</td></tr>`;
        const dec = (N.decades || []).map(d => `<span class="l10-bar" title="${esc(`${d.decade} : ${d.n}`)}" style="--h:${Math.round(100 * d.n / Math.max(...N.decades.map(x => x.n)))}%"><i></i><small>${esc(String(d.decade).slice(2))}</small></span>`).join('');
        const inner = `<div class="l10-nom-grid">${nomMap(N)}<div class="cplus-scroll"><table class="data-table l10-nom"><thead><tr><th>${esc(T('Né dans le département'))}</th><th>${esc(T('Personnes'))}</th><th>${esc(T('Part'))}</th></tr></thead><tbody>${S.slice(0, 30).map(tr).join('')}</tbody></table></div></div>
            ${dec ? `<p><small>${esc(T('Années de naissance, par décennie :'))}</small></p><div class="l10-bars">${dec}</div>` : ''}
            ${N.abroad_total ? `<p><small>${esc(T('Nés hors de France : {n} ({l}).', {n: N.abroad_total, l: N.abroad.slice(0, 6).map(a => `${a.country} ${a.n}`).join(', ')}))}</small></p>` : ''}
            <p class="muted"><small>${esc(T('Seulement les personnes mortes en France depuis 1970 dont le fichier est importé dans l’app ({t} porteurs du nom, {f} nés en France) : ce n’est pas toute l’histoire du nom. Même nom ne veut pas dire même famille.', {t: N.total, f: fr}))}</small></p>
            ${ext.sourcesOuvertes4?.geopatronymeUrl ? `<p><small>${link(ext.sourcesOuvertes4.geopatronymeUrl(N.name), T('🔤 Le même nom de 1891 à 1990 (Géopatronyme) ↗'))}</small></p>` : ''}`;
        return `<p class="cplus-lead">👥 ${esc(lead)}</p>${more(inner)}${srcLine(T('INSEE, fichier des personnes décédées (importé dans l’app)'), T('Licence Ouverte 2.0'), 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/', ` · <small>${esc(T('calculé sur ton ordinateur, rien n’est envoyé'))}</small>`)}`;
    }
    const nomOffer = () => `<p class="cplus-lead l10-offer" data-l10-offer="nom">👥 ${esc(T('Pour voir où sont nés les porteurs de son nom, importe le fichier des décès de l’INSEE (Réglages → Décès INSEE).'))} <button type="button" class="link-button" data-l10-dismiss="nom">${esc(T('✕ Ne plus proposer'))}</button></p>`;

    /* ── 🐴 relais de poste ── */
    function relaisHtml(D, J, rel, {L = null} = {}) {
        if (!J) return '';
        const C = W.LCNDA_CARTES_OUTILS, y = J.year || L?.by;
        const t = C?.travel?.(J.km, y, y && y >= 1850 && J.km >= 25 ? 'train' : 'diligence') || null;
        const dil = C?.travel?.(J.km, y, 'diligence') || null;
        if (!rel.length && !dil) return '';
        const from = pname(J.from), to = pname(J.to);
        const timeTxt = dil ? T('en diligence, {d}', {d: dil.text.replace(/^≈ /, '≈ ')}) : '';
        const lead = rel.length ? T('De {a} à {b} ({k} km), {r} : {n}. {t}', {a: from, b: to, k: Math.round(J.km), r: rel.length === 1 ? T('un relais de poste connu sur la route') : T('{x} relais de poste connus sur la route', {x: rel.length}), n: rel[0].n, t: timeTxt ? `${timeTxt[0].toUpperCase()}${timeTxt.slice(1)}.` : ''})
            : T('De {a} à {b} ({k} km) : {t}.', {a: from, b: to, k: Math.round(J.km), t: timeTxt});
        const relRow = r => rowLi(`🐴 <b>${esc(r.n)}</b>${r.com ? ` — ${esc(r.com)}` : ''}`, esc(T('{k} de la route', {k: kmTxt(r.off)})), [wdLinks(r), r.mh ? link(`https://pop.culture.gouv.fr/notice/merimee/${r.mh}`, T('Mérimée ↗')) : ''].filter(Boolean).join(' · '));
        const live = t && t.mode === 'train' && dil ? `<p><small>${esc(T('En {y}, le train existait peut-être déjà : {t}.', {y, t: t.text}))}</small></p>` : '';
        return `<p class="cplus-lead">🐴 ${esc(lead)}</p>${more(`${rel.length ? ul(rel.map(relRow)) : ''}${live}
            <p class="muted"><small>${esc(T('Les relais connus de Wikidata à moins de 8 km de la ligne droite : la liste n’est pas complète. Tous les relais de chaque route sont dans le Livre de poste (domaine public).'))} ${link(D?.livre?.url, T('Livre de poste de 1841 ↗'))}</small></p>
            ${dil ? `<p class="muted"><small>${esc(T('Le temps vient du calcul des trajets de l’app (vitesse des diligences selon l’époque, routes 1,3 fois plus longues que la ligne droite).'))}</small></p>` : ''}`)}
            ${rel.length ? metaSrc(D) : ''}`;
    }

    /* ── 🚶 temps de marche ── */
    const spark = prof => { if (!prof?.length) return ''; const mn = Math.min(...prof), mx = Math.max(...prof), h = Math.max(1, mx - mn); const pts = prof.map((z, i) => `${(i * 300 / Math.max(1, prof.length - 1)).toFixed(1)},${(58 - 50 * (z - mn) / h).toFixed(1)}`).join(' ');
        return `<svg class="l10-profil" viewBox="0 0 300 62" role="img" aria-label="${esc(T('Profil du chemin : de {a} à {b} m', {a: mn, b: mx}))}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/><text x="2" y="10" font-size="9">${esc(`${mx} m`)}</text><text x="2" y="60" font-size="9">${esc(`${mn} m`)}</text></svg>`; };
    function marcheHtml(r, {a = '', b = '', who = ''} = {}) {
        if (!r?.ok || !r.walk) return '';
        const w = r.walk;
        const lead = who ? T('{w} habitait à {b} : environ {h} de marche depuis {a} ({k} km, {u} m de montée).', {w: who, b, a, h: hoursTxt(w.hours), k: nf(w.km, 1), u: w.up})
            : T('De {a} à {b} : environ {h} de marche ({k} km, {u} m de montée).', {a, b, h: hoursTxt(w.hours), k: nf(w.km, 1), u: w.up});
        return `<p class="cplus-lead">🚶 ${esc(lead)}</p>${more(`${spark(r.profile)}<p class="muted"><small>${esc(T('Comment c’est calculé : on suit la ligne droite ({d} km) en relevant l’altitude tous les 250 m environ, on compte les chemins 1,3 fois plus longs, et on applique la règle de Tobler : 5 km/h sur le plat, moins vite en montée et en descente raide. Sur le plat, ce trajet prendrait {f}. C’est un ordre de grandeur : les vrais chemins contournaient les ravins.', {d: nf(r.direct_km, 1), f: hoursTxt(w.flat_hours)}))}</small></p>`)}
            ${srcLine(T('IGN, Géoplateforme — altitudes RGE ALTI®'), T('Licence Ouverte 2.0'), 'https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie', ` · ${link(r.url, T('la réponse exacte ↗'))}${r.fetched_at ? ` · <small>${esc(T(r.cached ? 'gardé le {d}' : 'lu en ligne le {d}', {d: fmtDate(r.fetched_at)}))}</small>` : ''}`)}`;
    }

    /* ── 🗺️ parcelle d'un lieu-dit ── */
    const parcelForm = (pl, ld = '', pid = 0) => `<form class="l10-parcel-form" data-l10-parcel-form data-insee="${esc(pl.insee)}" data-place="${esc(pl.id || '')}" data-commune="${esc(pname(pl))}" data-pid="${pid || ''}">
        <label>${esc(T('Lieu-dit à {c}', {c: pname(pl)}))} <input name="lieudit" value="${esc(ld)}" maxlength="80" placeholder="${esc(T('ex. La Combe'))}" autocomplete="off"></label>
        <button type="submit" class="button small secondary">${esc(T('🗺️ Trouver la parcelle'))}</button></form><div class="l10-parcel-out" aria-live="polite"></div>`;
    function parcelleHtml(r, {pid = 0, place = null} = {}) {
        if (!r) return '';
        if (!r.ok) return `<p class="muted">${esc(r.message || T('Pas de connexion à Internet : réessaie quand tu seras connecté.'))}</p>`;
        if (!r.places?.length) return `<p class="muted">${esc(T('Ce lieu-dit n’est pas dans la liste des lieux-dits de l’IGN pour cette commune : essaie une autre orthographe.'))}</p>`;
        const g = r.places[0], P = r.parcels || [];
        const gp = `https://www.geoportail.gouv.fr/carte?c=${g.lon},${g.lat}&z=17&l0=CADASTRALPARCELS.PARCELLAIRE_EXPRESS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`;
        const parcRow = (x, i) => `<li class="tr-item l10-item"><div><span>▦ <b>${esc(T('Section {s}, parcelle {n}', {s: x.section.replace(/^0+/, ''), n: x.numero.replace(/^0+/, '')}))}</b>${x.surface_m2 ? ` — ${esc(T('{m} m²', {m: nf(x.surface_m2)}))}` : ''}</span>
            <small class="muted">${esc(x.idu)}${x.existing_id ? ` · ${esc(T('déjà dans ton cadastre'))}` : ''}</small>
            <span class="page-actions">${ext.cadastre && !x.existing_id && !kiosk() ? `<button type="button" class="button small secondary" data-l10-keep-parcel="${i}">${esc(T('➕ Garder dans le cadastre'))}</button>` : ''}${x.existing_id && ext.cadastre ? `<button type="button" class="link-button" data-l10-open-parcel="${x.existing_id}">${esc(T('Ouvrir'))}</button>` : ''}</span></div></li>`;
        const html = `<p class="cplus-lead">🗺️ ${esc(T('« {l} » ({c}) : {p}', {l: g.name, c: g.cat, p: P.length ? T('le point du lieu-dit tombe dans la parcelle {s} {n} du cadastre d’aujourd’hui.', {s: P[0].section.replace(/^0+/, ''), n: P[0].numero.replace(/^0+/, '')}) : T('trouvé, mais pas de parcelle à cet endroit.')}))} ${link(gp, T('voir sur Géoportail ↗'))}</p>
            ${P.length ? ul(P.map(parcRow)) : r.cadastre_error ? `<p class="muted"><small>${esc(r.cadastre_error)}</small></p>` : ''}
            <p class="muted"><small>${esc(T('Le point du lieu-dit est celui de l’IGN (centre du hameau) : la ferme peut être sur une parcelle voisine. Le plan cadastral de son époque (napoléonien) est aux Archives du département.'))}</small></p>
            ${srcLine(T('IGN, lieux-dits de la BD TOPO® (géocodage) et Parcellaire Express (PCI)'), T('Licence Ouverte 2.0'), r.url, r.attribution ? ` · <small>${esc(r.attribution)}</small>` : '')}`;
        PARCELS.set(r.url, {r, pid, place});
        return `<div data-l10-parcel-key="${esc(r.url)}">${html}</div>`;
    }
    const PARCELS = new Map();

    /* ── 🏘️ Algérie, ⚜️ Québec, 📖 Suisse ── */
    function algerieHtml(D, m, {L = null, place = ''} = {}) {
        if (!m) return '';
        const old = (m.alt || []).filter(a => !/^[A-Z]{2,4}$/.test(a) && fold(a) !== fold(m.n)).slice(0, 2);
        const nm = m.via === 'ancien' ? T('{p} (aujourd’hui {n})', {p: place, n: m.n}) : old.length ? T('{n} (autrefois {o})', {n: m.n, o: listFr(old)}) : m.n;
        const lead = L ? T('{w} a été créée en {y}{a}.', {w: nm, y: m.y, a: L.by && m.y ? (m.y > L.by && m.y <= L.end ? T(' — {x}', {x: ageTxt(L, m.y)}) : m.y <= L.by ? T(', avant sa naissance') : '') : ''}) : T('{w} a été créée en {y}.', {w: nm, y: m.y});
        return `<p class="cplus-lead">🏘️ ${esc(lead)} ${wdLinks(m)}</p>${srcLine('Wikidata', 'CC0 1.0', `https://www.wikidata.org/wiki/${m.q}`, ` · <small>${esc(T('date de création (P571) notée sur Wikidata ; pour les registres, voir les Archives nationales d’outre-mer'))}</small>`)}`;
    }
    function quebecHtml(D, items, {L = null, place = ''} = {}) {
        if (!items?.length) return '';
        const url = r => D.rpcq_url.replace('{id}', encodeURIComponent(r.rpcq));
        const f = items.find(r => r.y) || items[0];
        const lead = L ? T('Près de {p}, de son temps : {n}{y}.', {p: place, n: f.n, y: f.y ? T(' (depuis {y})', {y: f.y}) : ''}) : items.length === 1 ? T('Un bien du patrimoine du Québec à {p} : {n}.', {p: place, n: f.n}) : T('{x} biens du patrimoine du Québec autour de {p}, dont {n}.', {x: items.length, p: place, n: f.n});
        const r0 = r => rowLi(`⚜️ <b>${esc(r.n)}</b>${r.y ? ` — ${esc(T('depuis {y}', {y: r.y}))}` : ''}`, [r.k, kmTxt(r.km)].filter(Boolean).map(esc).join(' · '), [link(url(r), T('Répertoire du patrimoine ↗')), wdLinks(r)].join(' · '));
        return `<p class="cplus-lead">⚜️ ${esc(lead)} ${link(url(f), T('↗ Répertoire'))}</p>${items.length > 1 ? more(ul(items.slice(0, 60).map(r0)), items.length) : ''}${srcLine('Wikidata', 'CC0 1.0', D.url, ` · <small>${esc(T('chaque bien renvoie à sa fiche du Répertoire du patrimoine culturel du Québec (non copiée)'))}</small>`)}`;
    }
    function suisseHtml(D, m, {place = ''} = {}) {
        if (!m) return '';
        const url = D.hls_url.replace('{id}', encodeURIComponent(m.hls));
        return `<p class="cplus-lead">📖 ${esc(T('{c} dans le Dictionnaire historique de la Suisse : son histoire, ses familles, sa population.', {c: m.n || place}))} ${link(url, T('Lire l’article ↗'))}</p>${srcLine(T('Lien de Wikidata (P902)'), 'CC0 1.0', `https://www.wikidata.org/wiki/${m.q}`, ` · <small>${esc(T('le texte du Dictionnaire n’est pas copié : lien seulement'))}</small>`)}`;
    }

    /* ═════════════ la fiche d'une personne : « ⛰️ Sa terre et ses gens » ═════════════ */
    const PERSON_ORDER = ['volcans', 'avalanches', 'mvt', 'cavites', 'epaves', 'algerie', 'quebec', 'suisse', 'nom', 'relais', 'marche', 'parcelle'];
    const line = (k, html) => (html ? `<div class="tr-line l10-line" data-l10-line="${k}">${html}</div>` : '');
    const frCommunes = L => { const seen = new Set(), out = []; for (const p of [L.birthPlace, L.deathPlace, ...L.places]) { if (p?.insee && !seen.has(p.insee)) { seen.add(p.insee); out.push(p); } } return out.slice(0, 4); };
    async function personParts(P, want) {
        const L = lifeOf(P), out = {};
        const need = want;
        const [AV, VO, EP, RE, AL, QC, CH] = await Promise.all([need('avalanches') && tryLoad('avalanches'), need('volcans') && tryLoad('volcans'), need('epaves') && isMarin(L) && tryLoad('epaves'), need('relais') && tryLoad('relais'),
            need('algerie') && L.places.some(isDZ) && tryLoad('algerie'), need('quebec') && L.places.some(isQC) && tryLoad('quebec'), need('suisse') && L.places.some(isCH) && tryLoad('suisse')]);
        if (AV) out.avalanches = avalanchesHtml(AV, avalanchesPerson(AV, L), {L});
        if (VO) out.volcans = volcansHtml(VO, volcansPerson(VO, L), {L});
        if (EP) out.epaves = epavesHtml(EP, epavesPerson(EP, L), {L});
        if (AL) { for (const p of L.places.filter(isDZ)) { const m = matchPlace(AL.rows, p); if (m) { out.algerie = algerieHtml(AL, m, {L, place: pname(p)}); break; } } }
        if (QC) { for (const p of withXY(L.places.filter(isQC))) { const items = quebecNear(QC, p, L); if (items.length) { out.quebec = quebecHtml(QC, items, {L, place: pname(p)}); break; } } }
        if (CH) { for (const p of L.places.filter(isCH)) { const m = matchPlace(CH.rows, p, 3); if (m) { out.suisse = suisseHtml(CH, m, {place: pname(p)}); break; } } }
        if (RE !== false && need('relais')) { const J = bigJourney(L); if (J) out.relais = relaisHtml(RE, J, RE ? relaisOnRoute(RE.rows, J.from, J.to) : [], {L}); }
        if (need('parcelle')) { const p = L.places.find(x => x.lieudit && x.insee); if (p && !kiosk()) out.parcelle = `<p class="cplus-lead">🗺️ ${esc(T('« {l} » ({c}) sur le cadastre d’aujourd’hui :', {l: p.lieudit, c: pname(p)}))} <button type="button" class="link-button" data-l10-parcel-go="${esc(p.insee)}" data-ld="${esc(p.lieudit)}" data-pid="${P.id}" data-place="${p.id}">${esc(T('🗺️ Trouver la parcelle (en ligne)'))}</button></p><div class="l10-parcel-out" aria-live="polite"></div>`; }
        return {L, out};
    }
    async function onlineParts(host, P, L, want) {
        const jobs = [];
        if (P.online && (want('mvt') || (want('cavites') && isCarrier(L)))) {
            for (const p of frCommunes(L)) jobs.push(ask('l10t_risques', {insee: p.insee}).then(r => ({p, r})));
            const res = await Promise.all(jobs);
            if (want('mvt')) { for (const {p, r} of res) { const h = mvtHtml(r, {L, place: pname(p)}); if (h) { setLine(host, 'mvt', h); break; } } }
            if (want('cavites') && isCarrier(L)) { const best = res.filter(x => x.r?.ok && x.r.cav?.length).sort((a, b) => b.r.cav_total - a.r.cav_total)[0]; if (best) setLine(host, 'cavites', cavitesHtml(best.r, {L, place: pname(best.p)})); }
        }
        if (want('nom') && L.last) {
            const N = await ask('l10t_nom', {last: L.last});
            if (N?.ok && N.total) setLine(host, 'nom', nomHtml(N, {L}));
            else if (N?.ok && !N.base && !dismissed('nom')) setLine(host, 'nom', nomOffer());
        }
        if (want('marche') && P.online) {
            const S = spouseWalk(L);
            if (S) {
                const r = await ask('l10t_marche', {lat1: S.me.lat, lon1: S.me.lon, lat2: S.them.lat, lon2: S.them.lon});
                const who = S.spouse.first ? T(S.spouse.gender === 'female' ? 'Sa femme, {f},' : S.spouse.gender === 'male' ? 'Son mari, {f},' : '{f}', {f: S.spouse.first}) : T(S.spouse.gender === 'female' ? 'Sa femme' : 'Son conjoint');
                const h = marcheHtml(r, {a: pname(S.me), b: pname(S.them), who});
                if (h) setLine(host, 'marche', h);
            }
        }
    }
    function setLine(host, k, html) {
        if (!host.isConnected && host.parentNode) return;
        let el = host.querySelector(`[data-l10-line="${k}"]`);
        if (!el) { el = W.document.createElement('div'); el.className = 'tr-line l10-line'; el.dataset.l10Line = k; const after = PERSON_ORDER.slice(PERSON_ORDER.indexOf(k) + 1).map(x => host.querySelector(`[data-l10-line="${x}"]`)).find(Boolean); host.insertBefore(el, after || null); }
        el.innerHTML = html; showCard(host);
    }
    const showCard = host => { const card = host.closest?.('section.card'); if (card) card.hidden = !host.querySelector('.l10-line:not(:empty)'); };
    function dismissed(k) { try { return W.localStorage?.getItem(`${KEY}-offre-${k}`) === '1'; } catch (_) { return false; } }
    async function fillPerson(host, id, only = null) {
        const want = k => (only ? only.includes(k) : on(k));
        delete host.dataset.l10Ready;
        try {
            const P = await ask('l10t_person', {id});
            if (!P?.ok || P.kind === 'animal') { host.innerHTML = ''; return P; }
            const {L, out} = await personParts(P, want);
            host.innerHTML = PERSON_ORDER.map(k => line(k, out[k])).join('');
            showCard(host);
            await onlineParts(host, P, L, want).catch(() => {});
            showCard(host);
            return P;
        } finally { host.dataset.l10Ready = '1'; } // fini, en ligne compris (les essais attendent ce signal)
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.terre_gens = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !PARTS.some(x => x[0] !== 'census' && on(x[0]))) return '';
        return A().card(index, T('⛰️ Sa terre et ses gens'), '', `<div class="tr-block l10-block" data-l10-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => { W.document.querySelectorAll('#workspace [data-l10-person]:not([data-l10-done])').forEach(h => { h.dataset.l10Done = '1'; fillPerson(h, Number(h.dataset.l10Person)).catch(() => {}); }); });

    /* ═════════════ un lieu : fiche d'un village, monographie, 🧰 Données ═════════════ */
    const PLACE_PARTS = {avalanches: '🏔️ Les grandes avalanches autour', risques: '🪨 Glissements, éboulements, cavités', epaves: '⚓ Les épaves au large', relais: '🐴 Les relais de poste autour',
        algerie: '🏘️ Village de colonisation', quebec: '⚜️ Le patrimoine du Québec', suisse: '📖 Le Dictionnaire historique de la Suisse', parcelle: '🗺️ La parcelle d’un lieu-dit'};
    const PART_SETTING = {risques: ['mvt', 'cavites']};
    const partOn = (k, want) => (PART_SETTING[k] || [k]).some(want);
    async function resolvePlace(pl) {
        if (pl?.lat != null && (pl.insee || pl.cc)) return pl;
        const q = Object.fromEntries(Object.entries({place_id: Number(pl?.id) || '', name: pl?.name || '', insee: pl?.insee || '', lat: pl?.lat ?? '', lon: pl?.lon ?? '', county: pl?.county || '', country: pl?.country || ''}).filter(([, v]) => v !== '' && v != null));
        const r = await ask('l10t_place', q);
        return r?.place ? {...pl, ...r.place, name: pl?.name || r.place.name} : pl;
    }
    async function placePart(k, pl) {
        const place = pname(pl);
        if (k === 'avalanches') { const D = await tryLoad('avalanches'); return avalanchesHtml(D, near(D?.rows || [], pl, 15), {place}); }
        if (k === 'risques') {
            if (!pl?.insee) return '';
            const r = await ask('l10t_risques', {insee: pl.insee});
            if (!r?.ok) return r?.offline ? `<p class="muted"><small>${esc(r.message || T('Pas de connexion à Internet : réessaie quand tu seras connecté.'))}</small></p>` : '';
            return [on('mvt') ? mvtHtml(r, {place}) : '', on('cavites') ? cavitesHtml(r, {place}) : ''].join('');
        }
        if (k === 'epaves') { const D = await tryLoad('epaves'); const all = near(D?.rows || [], pl, 15); return all.length ? epavesHtml(D, {place: pl, all, dated: []}, {place}) : ''; }
        if (k === 'relais') { const D = await tryLoad('relais'); const all = near(D?.rows || [], pl, 10); return all.length ? `<p class="cplus-lead">🐴 ${esc(all.length === 1 ? T('Un relais de poste connu {k} : {n}.', {k: kmTxt(all[0].km), n: all[0].n}) : T('{x} relais de poste connus à moins de 10 km, dont {n} ({k}).', {x: all.length, n: all[0].n, k: kmTxt(all[0].km)}))} ${wdLinks(all[0])}</p>${metaSrc(D)}` : ''; }
        if (k === 'algerie') { if (!isDZ(pl)) return ''; const D = await tryLoad('algerie'); return algerieHtml(D, matchPlace(D?.rows, pl), {place}); }
        if (k === 'quebec') { if (!isQC(pl) || pl.lat == null) return ''; const D = await tryLoad('quebec'); return quebecHtml(D, quebecNear(D, pl), {place}); }
        if (k === 'suisse') { if (!isCH(pl)) return ''; const D = await tryLoad('suisse'); return suisseHtml(D, matchPlace(D?.rows, pl, 3), {place}); }
        if (k === 'parcelle') { if (!pl?.insee || kiosk()) return ''; return parcelForm(pl); }
        return '';
    }
    const panel = (id, title, body) => `<section class="maintenance-panel cplus-panel tr-panel l10-panel" data-l10-part="${id}"><h3>${esc(title)}</h3>${body}</section>`;
    async function placeInto(host, place, {parts = null} = {}) {
        const want = k => (parts ? parts.includes(k) : on(k));
        const pl = await resolvePlace(place);
        const keys = Object.keys(PLACE_PARTS).filter(k => partOn(k, want));
        const html = await Promise.all(keys.map(k => placePart(k, pl).catch(() => '')));
        if (host.isConnected === false) return pl;
        host.innerHTML = keys.map((k, i) => (html[i] ? panel(k, T(PLACE_PARTS[k]), html[i]) : '')).join('');
        return pl;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    function decorate() {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l10])'); if (!village) return;
        village.dataset.l10 = '1';
        if (!Object.keys(PLACE_PARTS).some(k => partOn(k, on))) return;
        const place = villagePlace(village); if (!place.id && !place.insee && !place.name) return;
        const anchor = village.querySelector('[data-l9-host]') || village.querySelector('[data-tr-host]') || village.querySelector('[data-cc-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tr-place l10-place" data-l10-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l10-host]'), place).catch(() => {});
    }
    if (typeof MutationObserver !== 'undefined') {
        let pending = 0;
        new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(W.document.documentElement, {childList: true, subtree: true});
    }

    /* ═════════════ les clics ═════════════ */
    async function findParcel(out, insee, lieudit, pid, placeId) {
        out.innerHTML = `<p class="muted">${esc(T('Recherche en ligne…'))}</p>`;
        const r = await api('l10t_parcelle', {insee, lieudit}).catch(e => ({ok: false, message: e.message}));
        out.innerHTML = parcelleHtml(r, {pid, place: placeId ? {id: placeId} : null});
    }
    async function keepParcel(btn) {
        const box = btn.closest('[data-l10-parcel-key]'), saved = box && PARCELS.get(box.dataset.l10ParcelKey); if (!saved || !ext.cadastre?.edit) return;
        const x = saved.r.parcels[Number(btn.dataset.l10KeepParcel)]; if (!x) return;
        const prefill = {parcel: x, insee: x.insee, section: x.section, numero: x.numero};
        if (saved.pid) prefill.person = {id: saved.pid};
        if (saved.place?.id) prefill.place = {id: saved.place.id};
        await ext.cadastre.edit(null, prefill);
    }
    W.document.addEventListener('click', e => {
        const g = e.target.closest?.('[data-l10-parcel-go]');
        if (g) { e.preventDefault(); const out = g.closest('.l10-line, .tr-panel, [data-l10-line]')?.querySelector('.l10-parcel-out') || g.parentNode.nextElementSibling; if (out) findParcel(out, g.dataset.l10ParcelGo, g.dataset.ld, Number(g.dataset.pid) || 0, Number(g.dataset.place) || 0); return; }
        const k = e.target.closest?.('[data-l10-keep-parcel]'); if (k) { e.preventDefault(); keepParcel(k).catch(err => A().toast?.(err.message, 'error')); return; }
        const o = e.target.closest?.('[data-l10-open-parcel]'); if (o) { e.preventDefault(); ext.cadastre?.open?.(Number(o.dataset.l10OpenParcel)); return; }
        const d = e.target.closest?.('[data-l10-dismiss]');
        if (d) {
            e.preventDefault(); const key = `${KEY}-offre-${d.dataset.l10Dismiss}`, row = d.closest('[data-l10-offer]'), hostLine = row?.closest('.l10-line');
            try { W.localStorage?.setItem(key, '1'); } catch (_) {}
            const html = hostLine?.innerHTML; if (hostLine) { hostLine.innerHTML = ''; showCard(hostLine.closest('.l10-block') || hostLine); }
            A().undoToast?.(T('Cette proposition ne s’affichera plus.'), {undo: () => { try { W.localStorage?.removeItem(key); } catch (_) {} if (hostLine && html) { hostLine.innerHTML = html; showCard(hostLine.closest('.l10-block') || hostLine); } }, icon: '👥'});
            return;
        }
        if (e.target.closest?.('[data-l10-clear]')) clearCache();
    });
    W.document.addEventListener('submit', e => {
        const f = e.target.closest?.('[data-l10-parcel-form]'); if (!f) return;
        e.preventDefault(); const ld = f.querySelector('input[name="lieudit"]')?.value.trim(); if (!ld) return;
        findParcel(f.nextElementSibling, f.dataset.insee, ld, Number(f.dataset.pid) || 0, Number(f.dataset.place) || 0);
    });
    W.document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-l10-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.l10Tg, was = s[k]; s[k] = e.target.checked; save(s); registerOuChercher();
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affichera.' : '« {p} » ne s’affichera plus.', {p: T((PARTS.find(p => p[0] === k) || [])[1] || k)}), {undo: () => { const s2 = settings(); s2[k] = was; save(s2); registerOuChercher(); drawSettings(); }, icon: '⛰️'});
    });

    /* ═════════════ 📜 Monographie de commune ═════════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = part => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        const pl = await resolvePlace({...monoPlace(place), insee});
        const html = await placePart(part, pl);
        if (!html) { host.innerHTML = ''; return false; }
        host.innerHTML = html; return true;
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'l10t_avalanches', icon: '🏔️', label: T('Les grandes avalanches autour'), group: 'Le lieu', defaultOn: true, enabled: () => on('avalanches'), render: monoRun('avalanches')},
        {id: 'l10t_risques', icon: '🪨', label: T('Glissements, éboulements et cavités'), group: 'Le lieu', defaultOn: true, enabled: () => on('mvt') || on('cavites'), source: 'BRGM, Géorisques (Licence Ouverte 2.0)', render: monoRun('risques')},
        {id: 'l10t_epaves', icon: '⚓', label: T('Les épaves au large'), group: 'Le lieu', defaultOn: true, enabled: () => on('epaves'), render: monoRun('epaves')},
        {id: 'l10t_relais', icon: '🐴', label: T('Les relais de poste'), group: 'Le lieu', defaultOn: true, enabled: () => on('relais'), render: monoRun('relais')},
        {id: 'l10t_algerie', icon: '🏘️', label: T('Village de colonisation (Algérie)'), group: 'Le lieu', defaultOn: true, enabled: () => on('algerie'), render: monoRun('algerie')},
        {id: 'l10t_quebec', icon: '⚜️', label: T('Le patrimoine du Québec'), group: 'Le lieu', defaultOn: true, enabled: () => on('quebec'), render: monoRun('quebec')},
        {id: 'l10t_suisse', icon: '📖', label: T('Dictionnaire historique de la Suisse'), group: 'Chercher', defaultOn: true, enabled: () => on('suisse'), render: monoRun('suisse')});

    /* ═════════════ 🧰 à la demande : le registre commun des données ═════════════ */
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, county: pl.county || '', country: pl.country || ''} : null);
    const personId = ctx => Number(ctx?.person?.id || ctx?.person?.person?.id || ctx?.person) || 0;
    async function runPerson(ctx, host, only) {
        const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return false; }
        host.innerHTML = '<div class="tr-block l10-block"></div>';
        await fillPerson(host.firstElementChild, id, only);
        if (!host.textContent.trim()) { host.innerHTML = ''; return false; }
        return true;
    }
    async function runPlace(part, ctx, host) {
        const pl = placeOfCtx(ctx?.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return false; }
        const html = await placePart(part, await resolvePlace(pl));
        host.innerHTML = html || ''; return !!html;
    }
    /** 🚶 entre deux lieux au choix */
    async function runWalk(ctx, host) {
        const pl = placeOfCtx(ctx?.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return false; }
        const Pk = W.LCNDA_PICKER || A();
        host.innerHTML = `<form class="l10-walk-form"><span class="pk-lab">${esc(T('De {p} jusqu’à :', {p: pl.name}))}</span><div data-l10-walk-to>${Pk.pickerField ? Pk.pickerField({name: 'l10_to', kind: 'place'}) : `<input name="l10_to" placeholder="${esc(T('numéro du lieu'))}">`}</div>
            <button type="submit" class="button small secondary">${esc(T('🚶 Calculer'))}</button></form><div class="l10-walk-out" aria-live="polite"></div>`;
        host.querySelector('form').addEventListener('submit', async ev => {
            ev.preventDefault();
            const v = new FormData(ev.target).get('l10_to'); const to = await resolvePlace({id: Number(v) || 0}); const from = await resolvePlace(pl);
            const out = host.querySelector('.l10-walk-out');
            if (from?.lat == null || to?.lat == null) { out.innerHTML = emptyLine(T('Ces deux lieux doivent être placés sur la carte.'), '📍'); return; }
            const r = await api('l10t_marche', {lat1: from.lat, lon1: from.lon, lat2: to.lat, lon2: to.lon}).catch(e => ({ok: false, message: e.message}));
            out.innerHTML = r?.too_far ? emptyLine(T('Plus de 60 km : regarde plutôt « Le lieu à son époque » (diligence, train).'), '🐴') : r?.ok ? marcheHtml(r, {a: pname(from), b: pname(to)}) : emptyLine(r?.message || T('Pas de connexion à Internet.'), '📡');
        });
        return true;
    }
    async function runYear(ctx, host) {
        const y = Number(ctx?.year); if (!y) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return false; }
        const D = await tryLoad('volcans'); const items = (D?.rows || []).filter(e => y >= e.effect[0] && y <= e.effect[1]);
        const html = items.length ? volcansHtml(D, items) : ''; host.innerHTML = html; return !!html;
    }
    const PDS = [['avalanches', '🏔️', 'Les avalanches de son vivant'], ['mvt', '🪨', 'Glissements et éboulements de son vivant'], ['cavites', '🕳️', 'Les carrières de sa commune (carrier)'], ['volcans', '🌋', 'Les volcans qui ont gâché ses récoltes'],
        ['epaves', '⚓', 'Les épaves au large de son port (marin)'], ['nom', '👥', 'La carte de son nom (décès INSEE)'], ['relais', '🐴', 'Les relais de poste sur sa route'], ['marche', '🚶', 'Le temps de marche jusqu’à son conjoint'],
        ['algerie', '🏘️', 'Son village d’Algérie'], ['quebec', '⚜️', 'Le patrimoine du Québec de son temps'], ['suisse', '📖', 'Sa commune suisse dans le DHS']];
    (ext.dataSources = ext.dataSources || []).push(
        ...PDS.map(([k, icon, label]) => ({id: `l10t_p_${k}`, icon, label: T(label), group: k === 'suisse' ? 'Chercher' : 'La personne', needs: ['person'], online: ['mvt', 'cavites', 'marche'].includes(k), installed: () => true, enabled: () => on(k), run: (ctx, host) => runPerson(ctx, host, [k])})),
        ...Object.keys(PLACE_PARTS).map(k => ({id: `l10t_lieu_${k}`, icon: PLACE_PARTS[k].split(' ')[0], label: T(PLACE_PARTS[k].replace(/^\S+\s/, '')), group: k === 'suisse' || k === 'parcelle' ? 'Chercher' : 'Le lieu', needs: ['place'], online: ['risques', 'parcelle'].includes(k), installed: () => true, enabled: () => partOn(k, on), run: (ctx, host) => runPlace(k, ctx, host)})),
        {id: 'l10t_lieu_marche', icon: '🚶', label: T('Le temps de marche vers un autre lieu'), group: 'Le lieu', needs: ['place'], online: true, installed: () => true, enabled: () => on('marche'), run: runWalk},
        {id: 'l10t_annee_volcans', icon: '🌋', label: T('Un volcan a-t-il gâché les récoltes cette année-là ?'), group: 'Le monde', needs: ['year'], installed: () => true, enabled: () => on('volcans'), run: runYear});

    /* ═════════════ 🧰 Listes → Données ═════════════ */
    const openUrl = u => { if (u) W.open?.(u, '_blank', 'noopener'); };
    const rowsOf = async (name, map) => { const D = await tryLoad(name); return D ? map(D) : []; };
    const wdUrl = q => `https://www.wikidata.org/wiki/${q}`;
    /** Géorisques autour d'un point (en ligne) : il faut « autour de [commune] » */
    const grQuery = which => async query => {
        const n = query?.near; if (!n || n.lat == null) return {rows: [], total: 0, message: T('Choisis « autour de [une commune] » (10 km au plus) : la liste est lue en ligne sur Géorisques.')};
        const r = await ask('l10t_risques_near', {lat: n.lat, lon: n.lon, km: Math.min(10, Number(n.km) || 5), which});
        if (!r?.ok) return {rows: [], total: 0, message: r?.message || ''};
        let rows = r.rows.map(x => ({...x, url: r.url}));
        if (query.q) rows = rows.filter(x => fold(Object.values(x).join(' ')).includes(fold(query.q)));
        return {rows: rows.slice(query.offset || 0, (query.offset || 0) + (query.limit || 200)), total: rows.length};
    };
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l10t_avalanches', icon: '🏔️', label: T('Avalanches historiques datées'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q7935', enabled: () => on('avalanches'),
            load: () => rowsOf('avalanches', D => D.rows.map(r => ({name: r.n, date: r.d, year: r.y, deaths: r.deaths, country: r.country, lat: r.lat, lon: r.lon, url: wdUrl(r.q), wp: r.wp}))),
            fields: [{key: 'name', label: T('Avalanche'), type: 'text'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'deaths', label: T('Morts'), type: 'number'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.year, r.year], geo: r => [r.lat, r.lon], open: r => openUrl(r.wp || r.url)},
        {id: 'l10t_mvt', icon: '🪨', label: T('Mouvements de terrain (Géorisques, en ligne)'), group: 'Le lieu', source: T('BRGM, Géorisques — BDMvt (Licence Ouverte 2.0)'), sourceUrl: GR_MVT, enabled: () => on('mvt'), query: grQuery('mvt'),
            fields: [{key: 'type', label: T('Sorte'), type: 'enum'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'lieu', label: T('Lieu-dit'), type: 'text'}, {key: 'insee', label: T('Commune (INSEE)'), type: 'text'}, {key: 'fiab', label: T('Fiabilité'), type: 'enum'}, {key: 'url', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.url)},
        {id: 'l10t_cavites', icon: '🕳️', label: T('Cavités souterraines (Géorisques, en ligne)'), group: 'Le lieu', source: T('BRGM, Géorisques — cavités (Licence Ouverte 2.0)'), sourceUrl: GR_CAV, enabled: () => on('cavites'), query: grQuery('cav'),
            fields: [{key: 'nom', label: T('Nom'), type: 'text'}, {key: 'type', label: T('Sorte'), type: 'enum'}, {key: 'insee', label: T('Commune (INSEE)'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.url)},
        {id: 'l10t_volcans', icon: '🌋', label: T('Volcans qui ont gâché les récoltes'), group: 'Le monde', source: T('Wikipédia (CC BY-SA 4.0), NOAA (domaine public)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Ann%C3%A9e_sans_%C3%A9t%C3%A9', enabled: () => on('volcans'),
            load: () => rowsOf('volcans', D => D.rows.map(e => ({name: e.volcano, where: e.where, date: e.date, year: Number(e.date.slice(0, 4)), from: e.effect[0], to: e.effect[1], what: e.what, vei: e.vei ?? null, quote: e.quotes[0].q, url: e.quotes[0].url, noaa: e.noaa_url || ''}))),
            fields: [{key: 'name', label: T('Volcan'), type: 'text'}, {key: 'where', label: T('Pays'), type: 'enum'}, {key: 'date', label: T('Éruption'), type: 'text'}, {key: 'from', label: T('Effet de'), type: 'year'}, {key: 'to', label: T('à'), type: 'year'}, {key: 'what', label: T('Ce qui s’est passé'), type: 'text'}, {key: 'vei', label: 'VEI', type: 'number'}, {key: 'quote', label: T('Phrase de la source'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}, {key: 'noaa', label: 'NOAA', type: 'url'}],
            period: r => [r.from, r.to], open: r => openUrl(r.url)},
        {id: 'l10t_epaves', icon: '⚓', label: T('Épaves et naufrages (côtes d’Europe)'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q852190', enabled: () => on('epaves'),
            load: () => rowsOf('epaves', D => D.rows.map(r => ({name: r.n, kind: r.k === 'naufrage' ? T('naufrage') : T('épave'), date: r.d || '', year: r.y ?? null, lat: r.lat, lon: r.lon, url: wdUrl(r.q), wp: r.wp || ''}))),
            fields: [{key: 'name', label: T('Navire'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.year, r.year], geo: r => [r.lat, r.lon], open: r => openUrl(r.wp || r.url)},
        {id: 'l10t_relais', icon: '🐴', label: T('Relais de poste aux chevaux'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q28532565', enabled: () => on('relais'),
            load: () => rowsOf('relais', D => D.rows.map(r => ({name: r.n, commune: r.com, year: r.y, mh: r.mh ? `https://pop.culture.gouv.fr/notice/merimee/${r.mh}` : '', lat: r.lat, lon: r.lon, url: wdUrl(r.q), wp: r.wp}))),
            fields: [{key: 'name', label: T('Relais'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'year', label: T('Construit'), type: 'year'}, {key: 'mh', label: T('Monument historique'), type: 'url'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.year, null], geo: r => [r.lat, r.lon], open: r => openUrl(r.wp || r.url)},
        {id: 'l10t_algerie', icon: '🏘️', label: T('Villes et villages d’Algérie créés de 1830 à 1962'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q262', enabled: () => on('algerie'),
            load: () => rowsOf('algerie', D => D.rows.map(r => ({name: r.n, old: (r.alt || []).join(', '), year: r.y, date: r.d, kind: r.k, lat: r.lat, lon: r.lon, url: wdUrl(r.q), wp: r.wp}))),
            fields: [{key: 'name', label: T('Commune'), type: 'text'}, {key: 'old', label: T('Autres noms'), type: 'text'}, {key: 'year', label: T('Créée en'), type: 'year'}, {key: 'kind', label: T('Sorte'), type: 'text'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.year, null], geo: r => [r.lat, r.lon], open: r => openUrl(r.wp || r.url)},
        {id: 'l10t_quebec', icon: '⚜️', label: T('Patrimoine culturel du Québec'), group: 'Le lieu', source: T('Wikidata (CC0), liens vers le Répertoire du patrimoine culturel du Québec'), sourceUrl: 'https://www.wikidata.org/wiki/Property:P633', enabled: () => on('quebec'),
            load: () => rowsOf('quebec', D => D.rows.map(r => ({name: r.n, kind: r.k, year: r.y, rpcq: D.rpcq_url.replace('{id}', r.rpcq), lat: r.lat, lon: r.lon, url: wdUrl(r.q), wp: r.wp}))),
            fields: [{key: 'name', label: T('Bien'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum'}, {key: 'year', label: T('Depuis'), type: 'year'}, {key: 'rpcq', label: T('Répertoire du patrimoine'), type: 'url'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.year, null], geo: r => [r.lat, r.lon], open: r => openUrl(r.rpcq)},
        {id: 'l10t_suisse', icon: '📖', label: T('Communes suisses et leur article du DHS'), group: 'Chercher', source: T('Wikidata (CC0), liens vers le Dictionnaire historique de la Suisse'), sourceUrl: 'https://www.wikidata.org/wiki/Property:P902', enabled: () => on('suisse'),
            load: () => rowsOf('suisse', D => D.rows.map(r => ({name: r.n, until: r.e ?? null, hls: D.hls_url.replace('{id}', r.hls), lat: r.lat, lon: r.lon, url: wdUrl(r.q), wp: r.wp}))),
            fields: [{key: 'name', label: T('Commune'), type: 'text'}, {key: 'until', label: T('Ancienne commune jusqu’en'), type: 'year'}, {key: 'hls', label: T('Article du DHS'), type: 'url'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}],
            geo: r => [r.lat, r.lon], open: r => openUrl(r.hls)},
        {id: 'l10t_nom', icon: '👥', label: T('Où sont nés les porteurs d’un nom (décès INSEE)'), group: 'La personne', source: T('INSEE, fichier des personnes décédées (importé dans l’app)'), sourceUrl: 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/', enabled: () => on('nom'),
            query: async query => { if (!query?.q) return {rows: [], total: 0, message: T('Tape un nom de famille dans la recherche.')}; const N = await ask('l10t_nom', {last: query.q}); const rows = nomShares(N).map(d => ({dep: d.dep, name: d.name, n: d.n, pct: d.pct, lat: d.lat, lon: d.lon})); return {rows, total: rows.length}; },
            fields: [{key: 'name', label: T('Département de naissance'), type: 'text'}, {key: 'dep', label: T('Numéro'), type: 'text'}, {key: 'n', label: T('Personnes'), type: 'number'}, {key: 'pct', label: T('Part (%)'), type: 'number'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null)});

    /* ═════════════ 🗺 sur les cartes ═════════════ */
    const ptLayer = (id, icon, label, name, src, color, map) => ({id, icon, label: T(label), group: 'Le lieu', kind: 'points', source: T(src),
        run: async ({q, from, to, bbox, max = 4000}) => {
            const D = await load(name); const features = [];
            for (const r of D.rows) {
                if (features.length >= max) break;
                if (bbox && !(r.lon >= bbox[0] && r.lat >= bbox[1] && r.lon <= bbox[2] && r.lat <= bbox[3])) continue;
                if (q && !fold(r.n).includes(fold(q))) continue;
                if ((from || to) && r.y && ((from && r.y < from) || (to && r.y > to))) continue;
                features.push({type: 'pt', lat: r.lat, lon: r.lon, label: map(r), color});
            }
            return {features, source: T(src)};
        }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        ptLayer('l10t_relais', '🐴', 'Relais de poste aux chevaux', 'relais', 'Wikidata (CC0)', '#9c755f', r => r.n),
        ptLayer('l10t_epaves', '⚓', 'Épaves et naufrages', 'epaves', 'Wikidata (CC0)', '#4e79a7', r => `${r.n}${r.y ? ` (${r.y})` : ''}`),
        ptLayer('l10t_avalanches', '🏔️', 'Avalanches historiques', 'avalanches', 'Wikidata (CC0)', '#76b7b2', r => `${r.n} (${r.y})`),
        ptLayer('l10t_quebec', '⚜️', 'Patrimoine culturel du Québec', 'quebec', 'Wikidata (CC0) · Répertoire du patrimoine culturel du Québec', '#b07aa1', r => `${r.n}${r.y ? ` (${r.y})` : ''}`));

    /* ═════════════ 🌍 « Où chercher » : recensement américain de 1950, familles suisses, patrimoine du Québec ═════════════ */
    const OUC = () => [
        ['census', {key: 'l10t_us1950', icon: '🇺🇸', group: 'Monde', label: T('Recensement des États-Unis de 1950 (Archives nationales, NARA) — recherche par nom'), cats: ['recensements'], period: [1950, 1950], access: 'online',
            url: p => `https://1950census.archives.gov/search/?name=${encodeURIComponent(`${p.first || ''} ${p.last || ''}`.trim())}`,
            rel: {countries: ['us'], from: 1950, to: 1950, base: 1.6, missing: ['death', 'birth', 'parents'],
                why: ctx => T(ctx.female ? 'Elle vivait sans doute aux États-Unis en 1950 : le recensement de 1950 est ouvert (images gratuites, recherche par nom)' : 'Il vivait sans doute aux États-Unis en 1950 : le recensement de 1950 est ouvert (images gratuites, recherche par nom)')}}],
        ['suisse', {key: 'l10t_hls_familles', icon: '📖', group: 'Monde', label: T('Dictionnaire historique de la Suisse — familles et personnes'), cats: ['bibliotheques'], period: null, access: 'online',
            url: p => `https://hls-dhs-dss.ch/fr/search/?text=${encodeURIComponent(p.last || '')}`,
            rel: {countries: ['ch'], base: 0.9, why: () => T('Une famille suisse : le Dictionnaire historique de la Suisse a des articles sur les familles anciennes de chaque canton')}}],
        ['quebec', {key: 'l10t_rpcq', icon: '⚜️', group: 'Monde', label: T('Répertoire du patrimoine culturel du Québec — maisons, églises, personnages'), cats: ['bibliotheques'], period: null, access: 'online',
            url: () => 'https://www.patrimoine-culturel.gouv.qc.ca/rpcq/',
            rel: {countries: ['ca'], base: 0.6, why: () => T('Une famille du Québec : le Répertoire du patrimoine culturel a des fiches sur les maisons, églises et personnages anciens')}}]];
    /** les sites « Où chercher » de ce lot, selon les réglages (enlevés quand la partie est éteinte) */
    function registerOuChercher() {
        const M = W.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES)) return false;
        for (const [k, site] of OUC()) {
            const i = M.SITES.findIndex(s => s.key === site.key);
            if (on(k) && i < 0) M.SITES.push(site); else if (!on(k) && i >= 0) M.SITES.splice(i, 1);
        }
        return true;
    }

    /* ═════════════ Réglages → ⛰️ Sa terre et ses gens ═════════════ */
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const READ = '25/11/2026';
    const ABOUT = [
        ['avalanches', 'Wikidata', 'Avalanches historiques datées et placées', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q7935'],
        ['volcans', 'Wikipédia (phrases exactes) et NOAA NCEI', 'Les éruptions qui ont gâché les récoltes', 'CC BY-SA 4.0 ; domaine public', 'https://fr.wikipedia.org/wiki/Ann%C3%A9e_sans_%C3%A9t%C3%A9'],
        ['epaves', 'Wikidata', 'Épaves et naufrages des côtes d’Europe', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q852190'],
        ['relais', 'Wikidata', 'Relais de poste aux chevaux (incomplet)', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q28532565'],
        ['algerie', 'Wikidata', 'Villes et villages d’Algérie créés de 1830 à 1962', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q262'],
        ['quebec', 'Wikidata (liens vers le Répertoire du patrimoine culturel du Québec)', 'Biens patrimoniaux du Québec : nom, position, date', 'CC0 1.0', 'https://www.wikidata.org/wiki/Property:P633'],
        ['suisse', 'Wikidata (liens vers le Dictionnaire historique de la Suisse)', 'Communes suisses et leur article du DHS', 'CC0 1.0', 'https://www.wikidata.org/wiki/Property:P902']];
    const ONLINE = [
        ['https://www.georisques.gouv.fr/mentions-legales', 'BRGM, Géorisques (BDMvt, cavités souterraines), en ligne', 'Mouvements de terrain et cavités d’une commune', T('en ligne, gardé 90 jours'), T('Licence Ouverte 2.0 (« Sauf mention contraire, tous les contenus de ce site sont sous licence etalab-2.0 », lu le {d})', {d: READ})],
        ['https://geoservices.ign.fr/', 'IGN, Géoplateforme (altitudes RGE ALTI®, lieux-dits BD TOPO®, Parcellaire Express)', 'Le relief pour le temps de marche ; le lieu-dit et sa parcelle', T('en ligne, gardé'), 'Licence Ouverte 2.0'],
        ['https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/', 'INSEE, fichier des personnes décédées (déjà importé dans l’app)', 'La carte de son nom', T('dans l’app (rien n’est envoyé)'), 'Licence Ouverte 2.0'],
        ['https://archive.org/details/livredeposteout00frangoog', 'Livre de poste (1841), Internet Archive', 'Tous les relais de chaque route (lien)', T('lien seulement'), T('domaine public')]];
    const LINKS_ONLY = [
        ['https://www.avalanches.fr/', 'Enquête permanente sur les avalanches (INRAE)', 'Site injoignable depuis l’atelier de construction (réseau refusé) : licence non vérifiée, rien n’est copié ; lien seulement.'],
        ['https://www.patrimoine-culturel.gouv.qc.ca/rpcq/', 'Répertoire du patrimoine culturel du Québec', 'Site et données ouvertes (donneesquebec.ca) injoignables : licence non vérifiée ; les fiches ne sont pas copiées, chaque bien renvoie à sa fiche.'],
        ['https://hls-dhs-dss.ch/', 'Dictionnaire historique de la Suisse (DHS)', 'Site injoignable : licence non vérifiée ; lien seulement.'],
        ['https://1950census.archives.gov/', 'Recensement des États-Unis de 1950 (NARA)', 'Domaine public, mais rien n’est copié : lien de recherche dans « Où chercher ».'],
        ['https://www.culture.gouv.fr/', 'DRASSM (archéologie sous-marine)', 'Pas de données ouvertes trouvées : non utilisé.'],
        ['https://volcano.si.edu/', 'Smithsonian, Global Volcanism Program', 'Site injoignable : licence non vérifiée ; la base de la NOAA (domaine public) est utilisée à la place.']];
    async function sizes() { const out = {}; await Promise.all(FILES.map(async f => { try { const r = await fetch(`assets/data/l10t-${f}.json.gz`, {method: 'HEAD'}); out[f] = Number(r.headers.get('content-length')) || 0; } catch (_) { out[f] = 0; } })); return out; }
    async function clearCache() {
        try {
            const res = await post('l10t_cache_clear', {}); memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('l10t_cache_restore', {token: res.token}); memo.clear(); drawSettings(); }, icon: '🗑'});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    async function drawSettings(token) {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        let about = {cache: {count: 0, bytes: 0}, insee: {rows: 0}}; try { about = await api('l10t_about'); } catch (_) {}
        const sz = await sizes();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l10-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = ABOUT.map(([k, label, what, lic, url]) => `<tr><td>${link(url, T(label))}</td><td>${esc(T(what))}</td><td>${esc(sz[k] ? T('dans l’app ({s})', {s: fmtSize(sz[k])}) : T('pas encore là'))}</td><td>${esc(T(lic))} <small class="muted">${esc(T('lu le {d}', {d: READ}))}</small></td></tr>`).join('');
        const online = ONLINE.map(([url, label, what, where, lic]) => `<tr><td>${link(url, T(label))}</td><td>${esc(T(what))}</td><td>${esc(where)}</td><td>${esc(lic)}</td></tr>`).join('');
        ws.innerHTML = `<section class="page cplus-settings l10-settings" data-l10-settings>${UI().pageHeader ? UI().pageHeader({title: T('Sa terre et ses gens'), icon: '⛰️', where: T('Réglages · Données'), help: esc(T('Les dangers de sa terre (avalanches, glissements, carrières, volcans, épaves) et les gens et les lieux autour de lui (son nom, les relais de poste, le temps de marche, le cadastre, l’Algérie, le Québec, la Suisse, les États-Unis).'))}) : `<h2>⛰️ ${esc(T('Sa terre et ses gens'))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les réponses de Géorisques et de l’IGN : {n} réponses gardées ({k} Ko).', {n: about.cache?.count || 0, k: Math.max(1, Math.round((about.cache?.bytes || 0) / 1024))}))}</p>
                <p>${esc(about.insee?.rows ? T('Décès INSEE importés : {n} personnes ({a}–{b}).', {n: nf(about.insee.rows), a: about.insee.from || '?', b: about.insee.to || '?'}) : T('Aucun décès INSEE importé : « 👥 La carte de son nom » restera vide.'))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-l10-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th></tr></thead><tbody>${rows}${online}</tbody></table></div>
                <h4>${esc(T('Seulement un lien (licence non vérifiée ou données non ouvertes)'))}</h4><ul class="l10-links">${LINKS_ONLY.map(([url, label, why]) => `<li>${link(url, T(label))} — <small class="muted">${esc(T(why))}</small></li>`).join('')}</ul>
                <p class="muted">${esc(T('Ce qui part sur Internet : le code INSEE d’une commune (Géorisques), la position de deux lieux (altitudes IGN), le nom d’un lieu-dit et le code de sa commune (IGN, cadastre). Jamais un nom de personne, et rien pour une personne vivante ou confidentielle. Tout le reste est dans l’app.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = ['monde_coutumes', 'terroir', 'commune_culture', 'commune_plus'].map(k => tabs.findIndex(t => t[0] === k)).find(j => j >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'terre_gens')) {
            const after = ['monde_coutumes', 'terroir', 'sky_seen', 'world', 'histoire'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['terre_gens', '⛰️ Sa terre et ses gens']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.terre_gens ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register()) W.document.addEventListener('DOMContentLoaded', register, {once: true});

    const pub = {...calc, settings, fillPerson, placeInto, load, decorate, nomHtml, marcheHtml, registerOuChercher,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
    ext.terreGens = pub;
    return pub;
});
