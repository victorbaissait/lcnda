/**
 * LCNDA — 🔎 Noms de lieux d'autrefois, tous pays : « un nom → le lieu d'aujourd'hui ».
 * Maquette validée telle quelle, avec toutes ses recommandations : docs/design/noms-de-lieux-monde.html (décisions du 2026-11-26).
 *
 *  Où : une vue « 🔎 Un nom → le lieu » de la liste réunie « 🗺 Anciens noms de lieux » (anciens_noms, déclarée par heritage-telech-j.js ;
 *    vues : 🔎 Un nom → le lieu · Tableau · 🗺 Carte, moteur commun app-listes-donnees.js : une vue qui a `paint` se dessine elle-même) ;
 *    et la même recherche dans « 🧰 Toutes les données » : la boîte de question du 📊 Récap (app-donnees-accueil.js, une carte en tête de
 *    la réponse quand on tape un nom) et ⌘K (une ligne « 🗺 Presbourg → Bratislava » quand l'index est prêt).
 *  On tape « Presbourg », « Breslau », « Lutetia », « Burdigala »… : le lieu d'aujourd'hui, TOUS ses noms (dates, sorte, langue, une barre
 *    de temps), la source de chaque nom ↗ (plusieurs sources pour le même nom : registre national > GOV > World Historical Gazetteer >
 *    Pleiades > Wikidata), une petite carte (fond de l'app : pays de Natural Earth, sans tuiles, sans Internet — donc aussi en
 *    consultation et pour un invité), les lieux de la famille tout près (👪 → la monographie du lieu ; GET ld_famille : jamais une fiche
 *    confidentielle, pas les vivants en consultation), et 📍 Voir sur la carte · 📋 Tous les noms de ce lieu (la liste réunie, autour
 *    du lieu) · ＋ Ajouter ce nom à mon lieu (ancien nom sur la fiche du lieu de l'arbre, avec ses dates et sa source : so4_place_import,
 *    ↶ Annuler) · ↗ OpenHistoricalMap à la date (un lien seulement ; jamais en consultation ni pour un invité) · 📎 🧺 et plusieurs
 *    noms à la fois (cases, barre du bas, app-listes-choix.js).
 *  « Même lieu » : même identifiant Wikidata, sinon même nom d'aujourd'hui à moins de 15 km ; un nom antique de Pleiades prend le nom
 *    d'aujourd'hui du lieu à moins de 5 km (marqué « ≈ »). Les autres noms sans date sont montrés, avec « sans date ».
 *  Rapide : l'index (noms pliés et triés, cases d'un degré, identifiants, noms d'aujourd'hui) est fait UNE fois, à la première recherche ;
 *    une recherche = une recherche par dichotomie + quelques cases autour. GOV (paquet installé) est lu sur TON serveur, au besoin.
 *  Rien ne part sur Internet (ni nom, ni lieu) : seuls les liens « ↗ » ouvrent une page, sur un clic. Mode consultation : lecture seule
 *    (＋ et 📎 🧺 éteints, avec la raison), aucun lien vers un site de cartes ni « Chercher ailleurs ».
 *  API : LCNDA_EXT.nomsLieuxMonde = {ensure(), search(q, max), open(q), answer(page, q), provider(q), core} ; Node : module.exports = core.
 *  Essai : tests/test-noms-lieux-monde.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const RAD = Math.PI / 180;
    const km = (a, b, c, d) => { const x = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const okLL = r => num(r?.lat) !== null && num(r?.lon) !== null && !(Number(r.lat) === 0 && Number(r.lon) === 0);
    /** l'ordre des sources quand deux disent le même nom (décision 4) : registre national, GOV, World Historical Gazetteer, Pleiades, Wikidata */
    const RANK = {Registre: 1, GOV: 2, WHG: 3, Pleiades: 4, Wikidata: 5};
    const rankOf = src => RANK[String(src || '').split(/[\s(]/)[0]] || 9;
    const NOT_TOWN = /^(place|rue|quartier|pont|jardin|port|square|avenue|boulevard|cours|gare|r[ée]gion|d[ée]partement|arrondissement|canton|province|[ée]glise|ch[aâ]teau|parc|[îi]le)\b/i;
    const cell = (lat, lon) => `${Math.floor(lat)}:${Math.floor(lon)}`;
    const half = (lat, lon) => (num(lat) === null ? 'x' : `${Math.round(Number(lat) * 2) / 2},${Math.round(Number(lon) * 2) / 2}`);

    /** recs : [{name, now, from, to, lat, lon, q, kind, lang, src, url, cc}] → l'index (une fois) */
    function buildIndex(recs) {
        const n = recs.length, f = new Array(n), nowF = new Array(n), grid = new Map(), byQ = new Map(), byNow = new Map();
        const put = (m, k, i) => { const a = m.get(k); if (a) a.push(i); else m.set(k, [i]); };
        const memo = new Map(), ff = s => { let v = memo.get(s); if (v === undefined) memo.set(s, v = fold(s)); return v; }; // les mêmes noms reviennent souvent : pliés une fois
        for (let i = 0; i < n; i++) {
            const r = recs[i]; f[i] = /^https?:\/\//i.test(String(r.name || '')) ? '' : ff(r.name); nowF[i] = r.now ? ff(r.now) : ''; // un « nom » qui est une adresse (identifiant vide de Wikidata) : écarté
            if (okLL(r)) { r.lat = Number(r.lat); r.lon = Number(r.lon); put(grid, cell(r.lat, r.lon), i); }
            if (r.q) put(byQ, r.q, i);
            if (nowF[i]) put(byNow, nowF[i], i);
        }
        const order = []; for (let i = 0; i < n; i++) if (f[i]) order.push(i);
        order.sort((a, b) => (f[a] < f[b] ? -1 : f[a] > f[b] ? 1 : 0));
        return {recs, f, nowF, grid, byQ, byNow, order};
    }
    /** les noms qui commencent par q (plié) : une recherche par dichotomie dans les noms triés */
    function prefix(I, q, cap = 4000) {
        const o = I.order, f = I.f; let lo = 0, hi = o.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (f[o[m]] < q) lo = m + 1; else hi = m; }
        const out = []; for (let k = lo; k < o.length && out.length < cap && f[o[k]].startsWith(q); k++) out.push(o[k]);
        return out;
    }
    /** les noms à moins de r km : [{i, km}] (les cases d'un degré autour, jamais tout l'index) */
    function near(I, lat, lon, r) {
        const out = [], dl = Math.ceil(r / 111), dn = Math.ceil(r / (111 * Math.max(0.05, Math.cos(lat * RAD)))), la = Math.floor(lat), lo = Math.floor(lon);
        for (let a = la - dl; a <= la + dl; a++) for (let b = lo - dn; b <= lo + dn; b++) {
            const c = I.grid.get(`${a}:${b}`); if (!c) continue;
            for (const i of c) { const x = I.recs[i], k = km(lat, lon, x.lat, x.lon); if (k <= r) out.push({i, km: k}); }
        }
        return out.sort((a, b) => a.km - b.km);
    }
    /** le nom d'aujourd'hui le plus porté à moins de 5 km (une ville, pas une rue ni un château) */
    function nowNear(I, lat, lon) {
        const n = new Map();
        for (const x of near(I, lat, lon, 5)) { const r = I.recs[x.i]; if (!r.now || !/^\p{Lu}/u.test(r.now) || NOT_TOWN.test(r.now)) continue; const c = n.get(r.now) || {s: 0, cc: r.cc || ''}; c.s += 1 + 1 / (1 + x.km); if (!c.cc && r.cc) c.cc = r.cc; n.set(r.now, c); }
        const best = [...n.entries()].sort((a, b) => b[1].s - a[1].s)[0];
        return best ? {name: best[0], cc: best[1].cc} : null;
    }
    const better = (a, b) => (a.rank !== b.rank ? a.rank < b.rank : (a.r.from != null || a.r.to != null) && b.r.from == null && b.r.to == null);
    /** entrées [{r, hit}] → un nom par ligne (le même nom de deux sources : une ligne, la meilleure source d'abord), du plus ancien au plus récent ; sans date à la fin */
    function namesOf(entries) {
        const by = new Map();
        for (const e of entries) {
            const k = /^https?:\/\//i.test(String(e.r.name || '')) ? '' : fold(e.r.name); if (!k) continue;
            const x = {...e, rank: rankOf(e.r.src)}, cur = by.get(k);
            if (!cur) by.set(k, {best: x, all: [x]}); else { cur.all.push(x); if (better(x, cur.best)) cur.best = x; }
        }
        return [...by.values()].map(({best, all}) => {
            const r = best.r, srcs = [];
            [...all].sort((a, b) => a.rank - b.rank).forEach(x => { if (!srcs.some(s => s.src === x.r.src && s.url === (x.r.url || ''))) srcs.push({src: x.r.src, url: x.r.url || ''}); });
            const lang = [...new Set(all.flatMap(x => String(x.r.lang || '').split(/[\s,;]+/)).filter(Boolean))].join(' ');
            return {name: r.name, from: num(r.from), to: num(r.to), kind: r.kind || '', lang, src: r.src, url: r.url || '', srcs, hit: all.some(x => x.hit), now: r.now || ''};
        }).sort((a, b) => (a.from ?? a.to ?? 9999) - (b.from ?? b.to ?? 9999));
    }
    /** « Presbourg » → [{now, guessed, cc, lat, lon, q, hit, exact, names}] : les lieux d'aujourd'hui qui portent (ou ont porté) ce nom */
    function search(I, query, max = 20) {
        const q = fold(query); if (q.length < 2 || !I) return [];
        const R = I.recs, hits = prefix(I, q).filter(i => I.f[i] === q || I.f[i].startsWith(q + ' ') || q.length >= 4);
        const by = new Map();
        for (const i of hits) {
            const h = R[i], k = h.q || h.now ? `${h.q || ''}|${I.nowF[i]}` : `${I.f[i]}|${half(h.lat, h.lon)}`;
            let g = by.get(k); if (!g) by.set(k, g = {now: h.now || '', lat: h.lat, lon: h.lon, q: h.q || '', cc: h.cc || '', hits: []});
            g.hits.push(i); if (!g.now && h.now) g.now = h.now; if (!g.cc && h.cc) g.cc = h.cc; if (!okLL(g) && okLL(h)) { g.lat = h.lat; g.lon = h.lon; }
        }
        const isExact = g => g.hits.some(i => I.f[i] === q);
        const out = [...by.values()].sort((a, b) => isExact(b) - isExact(a) || b.hits.length - a.hits.length).slice(0, max * 3).map(g => {
            let now = g.now, guessed = false, cc = g.cc, own = [];
            if (!now && okLL(g)) { // un lieu antique : son nom moderne quand il est parmi ses noms (Burdigala → Bordeaux), sinon le nom d'aujourd'hui le plus porté à moins de 5 km
                own = near(I, g.lat, g.lon, 3).map(x => x.i);
                const nows = new Set(near(I, g.lat, g.lon, 15).filter(x => I.nowF[x.i] && !NOT_TOWN.test(R[x.i].now)).map(x => I.nowF[x.i]));
                const o = own.find(i => nows.has(I.f[i])), best = o !== undefined ? {name: R[o].name, cc: ''} : nowNear(I, g.lat, g.lon);
                if (best?.name) { now = best.name; guessed = true; cc = cc || best.cc || ''; }
            }
            const set = new Set(g.hits), nf = now ? fold(now) : '';
            if (g.q) (I.byQ.get(g.q) || []).forEach(i => set.add(i));
            if (nf && okLL(g)) (I.byNow.get(nf) || []).forEach(i => { if (okLL(R[i]) && km(R[i].lat, R[i].lon, g.lat, g.lon) < 15) set.add(i); });
            own.forEach(i => { if (!I.nowF[i] || I.nowF[i] === nf) set.add(i); });
            if (!cc) for (const i of set) if (R[i].cc) { cc = R[i].cc; break; }
            const hs = new Set(g.hits), names = namesOf([...set].map(i => ({r: R[i], hit: hs.has(i)})));
            const hitName = (g.hits.find(i => I.f[i] === q) ?? g.hits[0]);
            return {now: now || R[hitName].name, guessed, cc, lat: okLL(g) ? Number(g.lat) : null, lon: okLL(g) ? Number(g.lon) : null, q: g.q, hit: R[hitName].name, exact: isExact(g), names, _e: [...set].map(i => ({r: R[i], hit: hs.has(i)}))};
        }).sort((a, b) => b.exact - a.exact || b.names.length - a.names.length) // le lieu le mieux connu d'abord (Lutetia → Paris avant Lučenec)
            .filter((g, i, a) => !a.slice(0, i).some(o => fold(o.now) === fold(g.now) && okLL(o) && okLL(g) && km(o.lat, o.lon, g.lat, g.lon) < 15)); // le même lieu d'aujourd'hui une fois
        return out.slice(0, max);
    }
    /** GOV (paquet installé) : ses lignes {name, lang, kind, from, to, gov, lat, lon} rejoignent le lieu du même nom à moins de 15 km, sinon un lieu à part */
    function mergeGov(I, groups, rows, query) {
        const q = fold(query), objs = new Map();
        (rows || []).forEach(r => { if (!r || !r.name) return; const k = r.gov || `${fold(r.name)}|${half(r.lat, r.lon)}`; if (!objs.has(k)) objs.set(k, []); objs.get(k).push(r); });
        for (const [gov, rs] of objs) {
            const at = rs.find(okLL); if (!at) continue;
            const url = /^[A-Za-z0-9_-]+$/.test(gov) ? `https://gov.genealogy.net/item/show/${gov}` : '';
            const es = rs.map(r => ({r: {name: r.name, now: '', from: num(r.from), to: num(r.to), lat: Number(at.lat), lon: Number(at.lon), q: '', kind: r.kind ? String(r.kind) : T('nom (GOV)'), lang: r.lang || '', src: 'GOV', url, cc: ''}, hit: fold(r.name).startsWith(q)}));
            const g = groups.find(x => okLL(x) && km(x.lat, x.lon, Number(at.lat), Number(at.lon)) < 15 && x.names.some(n => es.some(e => fold(e.r.name) === fold(n.name))));
            if (g) { g._e = [...(g._e || []), ...es]; g.names = namesOf(g._e); continue; }
            const nn = I ? nowNear(I, Number(at.lat), Number(at.lon)) : null, latest = [...rs].sort((a, b) => (num(b.to) ?? 9999) - (num(a.to) ?? 9999))[0];
            const hit = es.find(e => e.hit)?.r.name || rs[0].name;
            groups.push({now: nn?.name || latest.name, guessed: !!nn, cc: nn?.cc || '', lat: Number(at.lat), lon: Number(at.lon), q: '', hit, exact: es.some(e => fold(e.r.name) === q), names: namesOf(es), _e: es});
        }
        return groups.sort((a, b) => b.exact - a.exact || b.names.length - a.names.length);
    }
    /** les dates d'un nom : « 1350 – 1945 », « depuis 1898 », « jusqu'en 1920 », « 330 av. J.-C. – 640 », « sans date » */
    const yr = v => (v < 0 ? T('{n} av. J.-C.', {n: String(-v)}) : String(v));
    const whenTxt = (a, b) => (a != null && b != null ? `${yr(a)} – ${yr(b)}` : a != null ? T('depuis {y}', {y: yr(a)}) : b != null ? T('jusqu’en {y}', {y: yr(b)}) : T('sans date'));

    const core = {fold, km, num, buildIndex, prefix, near, nowNear, namesOf, search, mergeGov, rankOf, RANK, whenTxt};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const J = () => ext.telechJ || null;
    const E = () => ext.dataListsEngine || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const offline = () => kiosk() || !!root.LCNDA_GUEST;
    const safeUrl = u => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const LIST = 'reunie_anciens_noms', VIEW = 'nom';
    const NOW = new Date().getFullYear();
    const EXAMPLES = ['Presbourg', 'Breslau', 'Lutetia', 'Lemberg', 'Königsberg', 'Burdigala', 'Danzig', 'Reval', 'Fiume', 'Kristiania'];
    const SHOW_PLACES = 8, SHOW_NAMES = 16;
    const loc = () => { try { return root.LCNDA_I18N?.intlLocale?.() || root.LCNDA_I18N?.lang || document.documentElement.lang || 'fr'; } catch (_) { return 'fr'; } };
    const dn = type => { try { return new Intl.DisplayNames([loc(), 'fr'], {type}); } catch (_) { return null; } };
    const langName = c => { const s = String(c || '').trim(); if (!s) return ''; try { const n = dn('language')?.of(s.replace(/_/g, '-')); return n && n !== s ? n : s; } catch (_) { return s; } };
    const ccName = c => { const s = String(c || '').trim(); if (!/^[A-Za-z]{2}$/.test(s)) return s; try { return dn('region')?.of(s.toUpperCase()) || s; } catch (_) { return s; } };

    /* ─────────── l'index : une fois, à la première recherche ─────────── */
    let IDX = null, idxP = null;
    async function records() {
        const tj = J(); if (!tj?.gazetteer) return [];
        const [G, N, P] = await Promise.all([tj.gazetteer(), tj.load('noms').catch(() => null), tj.load('pleiades').catch(() => null)]);
        const ln = new Map(), lp = new Map();
        (N?.rows || []).forEach(r => { if (r.langs) ln.set(`${r.q}|${r.name}`, r.langs); });
        (P?.rows || []).forEach(r => { if (r.lang) lp.set(`${Number(r.id)}|${r.name}`, r.lang); });
        return G.map(r => ({...r, lang: r.src === 'Pleiades' ? lp.get(`${String(r.url).split('/').pop()}|${r.name}`) || '' : ln.get(`${r.q}|${r.name}`) || ''}));
    }
    const ensure = () => (idxP ||= records().then(recs => (IDX = buildIndex(recs))).catch(e => { idxP = null; throw e; }));
    const ready = () => !!IDX;
    /** GOV, s'il est installé : lu sur ton serveur (le paquet), jamais sur Internet */
    async function govRows(q) {
        const d = (ext.dataLists || []).find(x => x && x.id === 'gov_noms'); if (!d?.query || fold(q).length < 3) return [];
        try { if (d.installed && !(await d.installed())) return []; } catch (_) { return []; }
        try {
            const r = await d.query({q: '', filters: [{key: 'name', op: 'starts', value: q}], offset: 0, limit: 60}) || {};
            const rows = Array.isArray(r) ? r : r.rows || [], ids = [...new Set(rows.map(x => x.gov).filter(Boolean))].slice(0, 5);
            for (const id of ids) { try { const m = await d.query({q: '', filters: [{key: 'gov', op: 'eq', value: id}], offset: 0, limit: 80}) || {}; rows.push(...(Array.isArray(m) ? m : m.rows || [])); } catch (_) {} }
            return rows;
        } catch (_) { return []; }
    }
    async function find(q, max = 20) {
        const I = await ensure();
        const out = search(I, q, max);
        const gv = await govRows(q);
        return gv.length ? mergeGov(I, out, gv, q).slice(0, max) : out;
    }

    /* ─────────── la petite carte : le fond de l'app (Natural Earth, livré avec l'app), sans tuiles ─────────── */
    let WORLD = null, worldP = null;
    function decodeTopo(f) {
        const t = f?.topo; if (!t?.arcs) return [];
        const tr = t.transform, sx = tr?.scale?.[0] ?? 1, sy = tr?.scale?.[1] ?? 1, tx = tr?.translate?.[0] ?? 0, ty = tr?.translate?.[1] ?? 0;
        return t.arcs.map(a => { let x = 0, y = 0; const c = new Float32Array(a.length * 2); let w = 180, s = 90, e = -180, n = -90;
            a.forEach((p, i) => { let lon, lat; if (tr) { x += p[0]; y += p[1]; lon = x * sx + tx; lat = y * sy + ty; } else { lon = p[0]; lat = p[1]; } c[2 * i] = lon; c[2 * i + 1] = lat; if (lon < w) w = lon; if (lon > e) e = lon; if (lat < s) s = lat; if (lat > n) n = lat; });
            return {c, b: [w, s, e, n]}; });
    }
    const world = () => (worldP ||= fetch('assets/data/geo/monde-110m.json', {credentials: 'same-origin'}).then(r => (r.ok ? r.json() : null)).then(f => (WORLD = decodeTopo(f))).catch(() => (WORLD = [])));
    function miniSvg(lat, lon) {
        const W = 200, H = 120, k = 7, cl = Math.max(0.2, Math.cos(lat * RAD));
        const X = x => (W / 2 + (x - lon) * cl * k), Y = y => (H / 2 - (y - lat) * k);
        const dLon = W / 2 / (cl * k) + 1, dLat = H / 2 / k + 1;
        let land = '';
        for (const a of WORLD || []) {
            if (a.b[2] < lon - dLon || a.b[0] > lon + dLon || a.b[3] < lat - dLat || a.b[1] > lat + dLat) continue;
            let d = '', px = 1e9, py = 1e9;
            for (let i = 0; i < a.c.length; i += 2) { const x = X(a.c[i]), y = Y(a.c[i + 1]); if (Math.abs(x - px) < 0.6 && Math.abs(y - py) < 0.6 && i + 2 < a.c.length) continue; d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; px = x; py = y; }
            if (d) land += `<path d="${d}"/>`;
        }
        let g = ''; const step = 5;
        for (let v = Math.ceil((lon - dLon) / step) * step; v <= lon + dLon; v += step) g += `<line x1="${X(v).toFixed(1)}" y1="0" x2="${X(v).toFixed(1)}" y2="${H}"/>`;
        for (let v = Math.ceil((lat - dLat) / step) * step; v <= lat + dLat; v += step) g += `<line x1="0" y1="${Y(v).toFixed(1)}" x2="${W}" y2="${Y(v).toFixed(1)}"/>`;
        return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('Position : {lat}, {lon}', {lat: lat.toFixed(3), lon: lon.toFixed(3)}))}"><g class="nlm-gl">${g}</g><g class="nlm-land">${land}</g><circle class="nlm-ring" cx="${W / 2}" cy="${H / 2}" r="9"/><circle class="nlm-dot" cx="${W / 2}" cy="${H / 2}" r="4.5"/></svg>`;
    }

    /* ─────────── une réponse : les lieux, leurs noms ─────────── */
    function bar(a, b) {
        if (a == null && b == null) return '';
        const lo = -800, hi = NOW, x = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)), s = x(a ?? (b - 40)), e = x(b ?? hi);
        return `<span class="nlm-bar" aria-hidden="true"><i style="left:${s.toFixed(1)}%;width:${Math.max(1.2, e - s).toFixed(1)}%"></i></span>`;
    }
    const chip = s => { const u = safeUrl(s.url); return u ? `<a class="nlm-srcchip" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('La source de ce nom (ouvre un site)'))}">${esc(s.src)} ↗</a>` : `<span class="nlm-srcchip">${esc(s.src)}</span>`; };
    const kindLang = n => [n.kind, n.lang ? n.lang.split(' ').map(langName).filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ');
    const ohmYear = g => { const h = g.names.find(n => n.hit) || g.names[0]; const y = h ? (h.to ?? h.from) : null; return Math.max(1, Math.min(NOW, y != null && y > 0 ? (h.to != null ? h.to - 1 : y) : 1850)); };
    function placeHtml(g, gi, sel) {
        const ro = kiosk(), off = offline(), ll = g.lat != null;
        const names = g.names.map((n, ni) => `<li class="${n.hit ? 'is-hit' : ''}${ni >= SHOW_NAMES ? ' nlm-more-n' : ''}"${ni >= SHOW_NAMES ? ' hidden' : ''}><label class="nlm-ck"><input type="checkbox" data-nlm-ck="${gi}:${ni}" ${sel.has(`${gi}:${ni}`) ? 'checked' : ''} aria-label="${esc(T('Choisir : {t}', {t: n.name}))}"></label><span class="nlm-nm">${esc(n.name)}</span><span class="nlm-when">${esc(whenTxt(n.from, n.to))}${kindLang(n) ? ` · <span class="nlm-k">${esc(kindLang(n))}</span>` : ''}${bar(n.from, n.to)}</span><span class="nlm-srcs">${n.srcs.map(chip).join('')}</span></li>`).join('');
        const more = g.names.length > SHOW_NAMES ? `<button type="button" class="nlm-link" data-nlm-allnames="${gi}" aria-expanded="false">${esc(T('▸ les {n} autres noms', {n: nf(g.names.length - SHOW_NAMES)}))}</button>` : '';
        const why = T('« {n} » : un nom de ce lieu', {n: '\u0001'}).split('\u0001');
        const dis = (on, why2) => (on ? ` disabled title="${esc(why2)}"` : '');
        const RO = T('Mode consultation : rien ne peut être écrit.');
        const ohm = !off && ll && J()?.settings?.().ohm !== false ? `<a class="button small secondary" href="https://www.openhistoricalmap.org/#map=12/${g.lat.toFixed(4)}/${g.lon.toFixed(4)}&amp;date=${String(ohmYear(g)).padStart(4, '0')}-01-01" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvre OpenHistoricalMap (un site), à cette date'))}">${esc(T('↗ OpenHistoricalMap en {y}', {y: String(ohmYear(g))}))}</a>` : '';
        return `<article class="nlm-place" data-nlm-g="${gi}"${gi >= SHOW_PLACES ? ' hidden' : ''}>
            <div class="nlm-ph"><h3>📍 ${esc(g.now)}</h3>${g.cc ? `<small>${esc(ccName(g.cc))}</small>` : ''}<span class="nlm-why">${esc(why[0])}<b>${esc(g.hit)}</b>${esc(why[1] || '')}</span>${g.guessed ? `<small class="nlm-guess" title="${esc(T('Nom d’aujourd’hui du lieu le plus proche (moins de 5 km) : à vérifier'))}">≈ ${esc(T('lieu d’aujourd’hui le plus proche'))}</small>` : ''}</div>
            <ul class="nlm-names">${names}</ul>${more ? `<p class="nlm-morep">${more}</p>` : ''}
            ${ll ? `<div class="nlm-mini" data-nlm-mini="${gi}">${miniSvg(g.lat, g.lon)}<small>${g.lat.toFixed(3)}, ${g.lon.toFixed(3)}<br>${esc(T('Fond de l’app (sans tuiles, sans Internet)'))}</small></div>` : ''}
            <div class="nlm-fam" data-nlm-fam="${gi}" hidden></div>
            <div class="nlm-acts">${ll ? `<button type="button" class="button small secondary" data-nlm-map="${gi}">📍 ${esc(T('Voir sur la carte'))}</button><button type="button" class="button small secondary" data-nlm-table="${gi}">📋 ${esc(T('Tous les noms de ce lieu'))}</button>` : ''}
                <button type="button" class="button small secondary" data-nlm-add="${gi}"${dis(ro || !!root.LCNDA_GUEST || !ll, ro || root.LCNDA_GUEST ? RO : T('Ce lieu n’a pas de position.'))}>＋ ${esc(T('Ajouter ce nom à mon lieu'))}</button>${ohm}
                <button type="button" class="button small secondary nlm-ib" data-nlm-ins="${gi}"${dis(ro, RO)} aria-label="${esc(T('Insérer les noms de ce lieu'))}" ${ro ? '' : `title="${esc(T('Insérer les noms de ce lieu (avec leurs sources)'))}"`}>📎</button>${ext.connexions ? `<button type="button" class="button small secondary nlm-ib" data-nlm-bk="${gi}"${dis(ro, RO)} aria-label="${esc(T('Mettre les noms de ce lieu au panier'))}" ${ro ? '' : `title="${esc(T('Mettre les noms de ce lieu au panier'))}"`}>🧺</button>` : ''}</div></article>`;
    }
    function elsewhereHtml(q) {
        const L = id => (J()?.LINK_ONLY || []).find(x => x[0] === id);
        const lk = (u, label) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
        const one = id => { const x = L(id); return x ? lk(x[2], T(x[1])) : ''; };
        const reg = ['bfs', 'ine', 'hisgis', 'logainm', 'domesday', 'slownik', 'gemeinde', 'quebec', 'cgndb', 'gnis'].map(one).filter(Boolean).join(' · ');
        const gov = `https://gov.genealogy.net/search/name?name=${encodeURIComponent(String(q || '').trim())}`;
        const links = offline() ? '' : `<ul>${L('whg') ? `<li>${lk(L('whg')[2], `🌐 ${T('World Historical Gazetteer — noms anciens du monde entier')} ↗`)}</li>` : ''}<li>${lk(String(q || '').trim() ? gov : 'https://gov.genealogy.net/', `🏰 ${T('GOV (gov.genealogy.net) — Europe centrale, Prusse, Autriche-Hongrie')} ↗`)}</li>${reg ? `<li>${esc(T('Registres de chaque pays :'))} ${reg} ↗</li>` : ''}</ul>`;
        return `<section class="card nlm-else"><div class="card-head"><h3>${esc(T('Pas trouvé ? Chercher ailleurs (en ligne, sur un clic)'))}</h3></div><div class="card-body">${links}<p class="nlm-kiosk-note">${esc(T('En consultation (borne) et pour un invité du réseau local : ces liens et le lien OpenHistoricalMap ne s’affichent pas.'))}</p></div></section>`;
    }

    /* ─────────── la vue « 🔎 Un nom → le lieu » (moteur des listes : views[].paint) ─────────── */
    let lastQ = '';
    const S = {groups: [], sel: new Set(), q: '', seq: 0, host: null, api: null};
    function paint(res, api) {
        const st = api?.state?.() || {};
        const q0 = String(st.nlq ?? lastQ ?? '');
        S.api = api; S.sel = new Set(); S.groups = [];
        const field = `<span class="ui-search nlm-search-box is-block"><span class="ui-search-ico" aria-hidden="true">🔍</span><input type="search" class="ui-search-input" data-ui-done="1" data-nlm-q enterkeyhint="search" autocomplete="off" spellcheck="false" value="${esc(q0)}" placeholder="${esc(T('Un nom ancien : Presbourg, Breslau, Lutetia…'))}" aria-label="${esc(T('Un nom ancien'))}"><kbd class="ui-search-kbd" title="${esc(T('Touche « / » : aller dans la case de recherche'))}">/</kbd></span>`;
        res.innerHTML = `<div class="nlm" data-nlm>
            <p class="nlm-source">${esc(T('Sources :'))} GOV · Wikidata (CC0) · Pleiades (CC BY 3.0) · ${esc(T('fusions de communes (Wikidata)'))} · ${offline() ? esc(T('World Historical Gazetteer (lien)')) : `<a href="https://whgazetteer.org/" target="_blank" rel="noopener noreferrer">↗ ${esc(T('World Historical Gazetteer (lien)'))}</a>`} — ${esc(T('sans doublons'))}</p>
            <div class="nlm-big">${field}</div>
            <div class="nlm-ex" role="group" aria-label="${esc(T('Exemples'))}"><span>${esc(T('Exemples :'))}</span>${EXAMPLES.map(x => `<button type="button" class="ui-listbar-chip" data-nlm-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
            <div class="nlm-res" data-nlm-res aria-live="polite"></div>
            <div data-nlm-else>${elsewhereHtml(q0)}</div>
            <p class="nlm-lock muted"><small>${esc(T('🔒 Tout est dans l’app : la recherche se fait sur l’ordinateur, rien ne part sur Internet, sauf si l’on clique un lien « ↗ ».'))}</small></p>
            <div class="ldc-bar nlm-selbar" data-nlm-bar role="region" aria-label="${esc(T('Noms choisis'))}" hidden><span class="ldc-n" data-nlm-n aria-live="polite"></span><span class="ldc-acts"><button type="button" class="ldc-b" data-nlm-sins${kiosk() ? ` disabled title="${esc(T('Mode consultation : rien ne peut être écrit.'))}"` : ''}>📎 <span>${esc(T('Insérer…'))}</span></button>${ext.connexions ? `<button type="button" class="ldc-b" data-nlm-sbk${kiosk() ? ` disabled title="${esc(T('Mode consultation : rien ne peut être écrit.'))}"` : ''}>🧺 <span>${esc(T('Mettre dans un panier…'))}</span></button>` : ''}<button type="button" class="ldc-b" data-nlm-sexp>⤓ <span>${esc(T('Exporter'))}</span></button></span><button type="button" class="ldc-x" data-nlm-sx aria-label="${esc(T('Tout décocher (Échap)'))}" title="${esc(T('Tout décocher (Échap)'))}">✕</button></div>
        </div>`;
        const host = S.host = res.querySelector('[data-nlm]');
        bind(host);
        run(host, q0);
        if (q0 === '' && !A().state?.nlmNoFocus) setTimeout(() => { if (host.isConnected && !document.activeElement?.closest?.('input,textarea,select,[contenteditable]')) host.querySelector('[data-nlm-q]')?.focus({preventScroll: true}); }, 0);
    }
    async function run(host, q) {
        const my = ++S.seq, out = host.querySelector('[data-nlm-res]'), t = String(q || '').trim();
        S.q = t; lastQ = t; S.sel.clear(); paintSel(host);
        try { const st = S.api?.state?.(); if (st) st.nlq = t; } catch (_) {}
        const els = host.querySelector('[data-nlm-else]'); if (els) els.innerHTML = elsewhereHtml(t);
        if (fold(t).length < 2) { out.innerHTML = `<p class="nlm-hint muted">${esc(T('Tape un nom ancien (au moins deux lettres) : le lieu d’aujourd’hui, tous ses noms avec leurs dates, et la source de chaque nom.'))}</p>`; S.groups = []; return; }
        if (!ready()) out.innerHTML = UI().spinner ? UI().spinner(T('On prépare les noms (une seule fois)…')) : `<p class="muted">${esc(T('On prépare les noms (une seule fois)…'))}</p>`;
        let groups;
        try { groups = await find(t, 20); } catch (e) { if (my === S.seq) out.innerHTML = `<div class="nlm-none">${esc(e.message || T('Les noms d’autrefois n’ont pas pu être lus.'))}</div>`; return; }
        if (my !== S.seq || !host.isConnected) return;
        if (!WORLD) world().then(() => { if (my === S.seq && host.isConnected) host.querySelectorAll('[data-nlm-mini]').forEach(m => { const g = S.groups[Number(m.dataset.nlmMini)]; const s = m.querySelector('svg'); if (g && s) s.outerHTML = miniSvg(g.lat, g.lon); }); });
        S.groups = groups;
        if (!groups.length) { out.innerHTML = `<div class="nlm-none">${esc(offline() ? T('Aucun lieu connu sous ce nom dans les paquets installés.') : T('Aucun lieu connu sous ce nom dans les paquets installés. Chercher ailleurs : voir plus bas (liens).'))}</div>`; return; }
        const rest = groups.length - SHOW_PLACES;
        out.innerHTML = `<div class="nlm-list">${groups.map((g, i) => placeHtml(g, i, S.sel)).join('')}</div>${rest > 0 ? `<p class="nlm-morep"><button type="button" class="button small secondary" data-nlm-allplaces>${esc(T('▸ {n} autres lieux portent ce nom', {n: nf(rest)}))}</button></p>` : ''}`;
        family(host, my);
    }
    /* 👪 la famille tout près : les lieux placés de la généalogie (ld_famille : jamais une fiche confidentielle, pas les vivants en consultation) */
    async function family(host, my) {
        const LF = ext.listesFamille; if (!LF?.ready) return;
        try { await LF.ready(); } catch (_) { return; }
        if (my !== S.seq || !host.isConnected) return;
        const F = LF.data?.(); if (!F?.places?.length) return;
        host.querySelectorAll('[data-nlm-fam]').forEach(box => {
            const g = S.groups[Number(box.dataset.nlmFam)]; if (!g || g.lat == null) return;
            const hits = F.places.map((p, i) => ({p, i, k: km(g.lat, g.lon, p.lat, p.lon)})).filter(x => x.k <= 10).sort((a, b) => a.k - b.k).slice(0, 4);
            if (!hits.length) return;
            box.innerHTML = `<span class="nlm-fam-lab">👪 ${esc(T('Ta famille ici (moins de 10 km) :'))}</span>${hits.map(x => { const who = [...new Set((F.at[x.i] || []).map(([pi]) => F.people[pi]?.n).filter(Boolean))];
                return `<button type="button" class="nlm-famb" data-nlm-famgo="${x.i}" title="${esc(T('La monographie de ce lieu : les actes et les événements de la famille'))}">📍 ${esc(x.p.name.split(',')[0])}${who.length ? ` <small>· ${esc(who.slice(0, 2).join(', '))}${who.length > 2 ? ` ${esc(T('+{n}', {n: who.length - 2}))}` : ''}</small>` : ''}</button>`; }).join('')}`;
            box.hidden = false;
        });
    }
    /** un lieu de la famille → sa fiche (monographie) : le lieu de l'arbre au même endroit (vector_map_places, ton serveur) */
    async function treePlacesNear(lat, lon, r) {
        const d = r / 111, e = r / (111 * Math.max(0.2, Math.cos(lat * RAD)));
        const res = await A().api('vector_map_places', {n: (lat + d).toFixed(5), s: (lat - d).toFixed(5), w: (lon - e).toFixed(5), e: (lon + e).toFixed(5)});
        return (res?.places || []).map(p => ({...p, km: km(lat, lon, p.lat, p.lon)})).filter(p => p.km <= r).sort((a, b) => a.km - b.km);
    }
    function openMonograph(p) {
        const st = A().state; if (!st || !p) return;
        st.graphPlaceMonograph = {...(st.graphPlaceMonograph || {}), id: Number(p.id), name: p.label || p.name || '', county: '', country: '', showEvents: true, showDigests: true, showBattues: true, showCemetery: true};
        st.graphMode = 'place_monograph'; A().setModule?.('graphiques');
    }
    async function famGo(i) {
        const p = ext.listesFamille?.data?.()?.places?.[i]; if (!p) return;
        try { const ps = await treePlacesNear(p.lat, p.lon, 0.5); const m = ps.find(x => fold(x.label) === fold(p.name)) || ps[0]; if (m) openMonograph(m); else toast(T('Ce lieu n’a pas été retrouvé dans l’arbre.'), 'error'); }
        catch (e) { toast(e.message, 'error'); }
    }
    /* ＋ Ajouter ce nom à mon lieu : un ancien nom sur la fiche du lieu de l'arbre, avec ses dates et sa source (↶ Annuler) */
    async function addName(gi, anchor) {
        if (kiosk() || root.LCNDA_GUEST) return toast(T('Mode consultation : rien ne peut être écrit.'));
        const g = S.groups[gi]; if (!g || g.lat == null) return;
        const n = g.names.find(x => x.hit) || g.names[0]; if (!n) return;
        let ps = []; try { ps = (await treePlacesNear(g.lat, g.lon, 10)).slice(0, 8); } catch (e) { return toast(e.message, 'error'); }
        if (!ps.length) return toast(T('Aucun lieu de ton arbre à moins de 10 km de {p}.', {p: g.now}), 'error');
        const go = async p => {
            const origin = [n.srcs.map(s => s.src).join(', '), whenTxt(n.from, n.to), n.srcs.map(s => safeUrl(s.url)).find(Boolean) || ''].filter(Boolean).join(' · ');
            const y = n.to ?? n.from;
            try {
                const r0 = await A().api('so4_place_import', {}, {method: 'POST', body: {place_id: p.id, site: 'saisie', rows: [], names: [{name: n.name, year: y != null && y >= 1700 && y <= 2100 ? y : 0, origin}]}});
                const r = r0?.result ?? r0;
                if (!r?.batch) return toast(T('« {n} » est déjà sur la fiche de {p}.', {n: n.name, p: p.label}));
                const msg = T('« {n} » ajouté aux anciens noms de {p}', {n: n.name, p: p.label});
                if (A().undoToast) A().undoToast(msg, {icon: '＋', undo: async () => { await A().api('so4_undo', {}, {method: 'POST', body: {batch: r.batch}}); }}); else toast(msg);
            } catch (e) { toast(e.message, 'error'); }
        };
        if (ps.length === 1 || !UI().menuAt) return go(ps[0]);
        UI().menuAt(anchor, ps.map(p => ({icon: '📍', label: `${p.label}${p.detail ? ` — ${p.detail}` : ''} (${T('{n} km', {n: p.km < 1 ? '< 1' : String(Math.round(p.km))})})`, run: () => go(p)})), {title: T('Ajouter « {n} » à quel lieu de l’arbre ?', {n: n.name})});
    }

    /* 📎 🧺 ⤓ : une ligne = un nom, avec SA source (app-listes-choix.js) */
    const FIELDS = [{key: 'name', label: 'Nom d’autrefois', type: 'text'}, {key: 'now', label: 'Nom d’aujourd’hui', type: 'place'}, {key: 'when', label: 'Dates', type: 'text'}, {key: 'kind', label: 'Sorte', type: 'text'}, {key: 'country', label: 'Pays', type: 'text'}, {key: 'src', label: 'Source', type: 'text'}];
    const rowOf = (g, n) => ({name: n.name, now: g.now, when: whenTxt(n.from, n.to), from: n.from, to: n.to, kind: kindLang(n), country: g.cc ? ccName(g.cc) : '', src: n.srcs.map(s => s.src).join(', '), url: n.srcs.map(s => safeUrl(s.url)).find(Boolean) || '', lat: g.lat, lon: g.lon, _k: `${fold(n.name)}|${fold(g.now)}`});
    const pseudo = () => ({id: LIST, icon: '🗺', label: T('Anciens noms de lieux'), source: 'Wikidata (CC0) · Pleiades (CC BY 3.0) · GOV (CC BY-SA 3.0)', sourceUrl: '', fields: FIELDS.map(f => ({...f, label: T(f.label)})), rowKey: r => r._k,
        itemOf: (r, it) => ({...it, title: T('{a} → {b}', {a: r.name, b: r.now}).slice(0, 200), value: [r.when, r.kind, r.country, `${T('Source :')} ${r.src}`].filter(Boolean).join(' · ').slice(0, 2000), origin: {...(it.origin || {}), label: `${T('Listes')} · ${T('Anciens noms de lieux')} — ${r.src}`, url: r.url}})});
    const ansApi = rows => { const d = pseudo(); return {d, base: d, state: () => ({}), rows: () => rows, total: () => rows.length, more: () => false, table2d: rs => [d.fields.map(f => f.label), ...rs.map(r => d.fields.map(f => r[f.key] ?? ''))]}; };
    function act(kind, rows, anchor) {
        if (!rows.length) return toast(T('Aucun nom choisi.'));
        if ((kind === 'insert' || kind === 'basket') && kiosk()) return toast(T('Mode consultation : rien ne peut être écrit.'));
        const CH = ext.listesChoix; if (!CH?.act) return toast(T('« Insérer une info » n’est pas chargé.'), 'error');
        return CH.act(kind, rows, anchor, ansApi(rows));
    }
    const selRows = () => [...S.sel].map(k => { const [gi, ni] = k.split(':').map(Number); const g = S.groups[gi], n = g?.names[ni]; return g && n ? rowOf(g, n) : null; }).filter(Boolean);
    function paintSel(host) {
        const bar = host?.querySelector('[data-nlm-bar]'); if (!bar) return;
        bar.hidden = !S.sel.size;
        const n = bar.querySelector('[data-nlm-n]'); if (n) n.textContent = S.sel.size === 1 ? T('1 choisi') : T('{n} choisis', {n: nf(S.sel.size)});
        host.querySelectorAll('[data-nlm-ck]').forEach(c => { c.checked = S.sel.has(c.dataset.nlmCk); c.closest('li')?.classList.toggle('is-picked', c.checked); });
    }
    /** 📍 Voir sur la carte · 📋 Tous les noms de ce lieu : la liste réunie, autour du lieu (moteur commun) */
    function openAround(g, view) {
        if (!g || g.lat == null) return;
        const near = {lat: g.lat, lon: g.lon, km: 15, title: g.now};
        if (E().open) E().open(LIST, view === 'map' ? {view: 'map', near, dview: VIEW, nlq: S.q} : {view: 'table', dview: 'table', near, nlq: S.q});
    }
    function bind(host) {
        const inp = host.querySelector('[data-nlm-q]'); let tq = 0;
        const box = inp.closest('.ui-search'), sync = () => box?.classList.toggle('has-value', !!inp.value);
        inp.addEventListener('input', () => { sync(); clearTimeout(tq); tq = setTimeout(() => run(host, inp.value), 160); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tq); run(host, inp.value); } else if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ''; sync(); run(host, ''); } });
        sync();
        host.addEventListener('change', e => { const c = e.target.closest?.('[data-nlm-ck]'); if (!c) return; if (c.checked) S.sel.add(c.dataset.nlmCk); else S.sel.delete(c.dataset.nlmCk); paintSel(host); });
        host.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sel.size && !e.target.closest('input[type=search], dialog, .ui-actmenu')) { e.preventDefault(); S.sel.clear(); paintSel(host); } });
        host.addEventListener('click', e => {
            const t = e.target; let b;
            if ((b = t.closest('[data-nlm-ex]'))) { inp.value = b.dataset.nlmEx; sync(); return run(host, inp.value); }
            if ((b = t.closest('[data-nlm-allplaces]'))) { host.querySelectorAll('.nlm-place[hidden]').forEach(x => { x.hidden = false; }); const f = host.querySelector(`[data-nlm-g="${SHOW_PLACES}"] h3`); b.closest('p')?.remove(); if (f) { f.tabIndex = -1; f.focus(); } return; }
            if ((b = t.closest('[data-nlm-allnames]'))) { const art = b.closest('.nlm-place'); const open = b.getAttribute('aria-expanded') !== 'true'; art.querySelectorAll('.nlm-more-n').forEach(x => { x.hidden = !open; }); b.setAttribute('aria-expanded', String(open)); b.textContent = open ? T('▾ moins de noms') : T('▸ les {n} autres noms', {n: nf(art.querySelectorAll('.nlm-more-n').length)}); return; }
            if ((b = t.closest('[data-nlm-map]'))) return openAround(S.groups[Number(b.dataset.nlmMap)], 'map');
            if ((b = t.closest('[data-nlm-table]'))) return openAround(S.groups[Number(b.dataset.nlmTable)], 'table');
            if ((b = t.closest('[data-nlm-add]'))) return addName(Number(b.dataset.nlmAdd), b);
            if ((b = t.closest('[data-nlm-famgo]'))) return famGo(Number(b.dataset.nlmFamgo));
            if ((b = t.closest('[data-nlm-ins]'))) { const g = S.groups[Number(b.dataset.nlmIns)]; return g && act('insert', g.names.map(n => rowOf(g, n)), b); }
            if ((b = t.closest('[data-nlm-bk]'))) { const g = S.groups[Number(b.dataset.nlmBk)]; return g && act('basket', g.names.map(n => rowOf(g, n)), b); }
            if ((b = t.closest('[data-nlm-sins]'))) return act('insert', selRows(), b);
            if ((b = t.closest('[data-nlm-sbk]'))) return act('basket', selRows(), b);
            if ((b = t.closest('[data-nlm-sexp]'))) return act('export', selRows(), b);
            if (t.closest('[data-nlm-sx]')) { S.sel.clear(); paintSel(host); }
        });
    }

    /* ─────────── la liste réunie « 🗺 Anciens noms de lieux » : ses vues 🔎 Un nom → le lieu · Tableau (· 🗺 Carte, le moteur) ─────────── */
    const VIEWS = [{id: VIEW, icon: '🔎', label: 'Un nom → le lieu', paint}, {id: 'table', label: 'Tableau'}];
    function attach() {
        const M = (ext.dataListMerges || []).find(m => m && m.id === 'anciens_noms');
        if (M && !M.views) M.views = VIEWS;
        const d = (ext.dataLists || []).find(x => x && x.id === LIST);
        if (d && d.views !== VIEWS) { d.views = VIEWS; d.defaultView = VIEW; }
        return !!d;
    }
    if (!attach()) { document.addEventListener('DOMContentLoaded', () => { if (!attach()) setTimeout(attach, 400); }, {once: true}); }
    root.addEventListener?.('load', () => attach(), {once: true});

    /** ouvrir la recherche, la question posée (⌘K, 📊 Récap) */
    function open(q) { lastQ = String(q || '').trim(); attach(); if (E().open) E().open(LIST, {dview: VIEW, nlq: lastQ}); }

    /* ─────────── 📊 Récap : « Presbourg » posé comme une question → une carte en tête de la réponse ─────────── */
    const looksLikeName = q => { const s = String(q || '').trim(); return s.length >= 3 && s.length <= 48 && !/\d/.test(s) && s.split(/\s+/).length <= 4 && /^\p{L}/u.test(s); };
    async function answer(page, q) {
        if (!page || !looksLikeName(q)) return;
        let gs; try { gs = await find(q, 3); } catch (_) { return; }
        const ans = page.querySelector('.dr-ans'); if (!ans || !page.isConnected || !gs.length || page.querySelector('[data-nlm-ans]')) return;
        const box = document.createElement('section'); box.className = 'nlm-ans'; box.dataset.nlmAns = '';
        box.innerHTML = `<h4>🗺 ${esc(T('« {q} » : un ancien nom de lieu', {q: String(q).trim()}))}</h4><ul>${gs.map(g => { const h = g.names.find(n => n.hit); return `<li><b>📍 ${esc(g.now)}</b>${g.cc ? ` <small>${esc(ccName(g.cc))}</small>` : ''}${h ? ` — ${esc(h.name)} <small class="muted">(${esc(whenTxt(h.from, h.to))})</small>` : ''} <small class="muted">· ${esc(T(g.names.length > 1 ? '{n} noms' : '{n} nom', {n: nf(g.names.length)}))}</small></li>`; }).join('')}</ul>
            <button type="button" class="button small" data-nlm-ans-go>🔎 ${esc(T('Tous ses noms, la carte et les sources'))}</button>`;
        box.querySelector('[data-nlm-ans-go]').addEventListener('click', () => open(q));
        (ans.querySelector('.dr-backp') || ans.firstChild)?.after?.(box);
    }

    /* ─────────── ⌘K : « 🗺 Presbourg → Bratislava » (l'index, une fois prêt ; jamais calculé pour rien) ─────────── */
    function provider(q) {
        const s = String(q || '').trim(); if (!looksLikeName(s) || fold(s).length < 4) return [];
        if (!ready()) { if (/^\p{Lu}/u.test(s) && J()?.gazetteer) (root.requestIdleCallback || setTimeout)(() => { ensure().catch(() => {}); }); return []; }
        return search(IDX, s, 2).filter(g => g.exact).map(g => ({label: `🗺 ${g.hit} → ${g.now}${g.cc ? ` (${ccName(g.cc)})` : ''}`, hint: T('Ancien nom de lieu · tous ses noms et leurs sources'), go: () => open(s)}));
    }
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);

    ext.nomsLieuxMonde = {ensure, search: (q, max) => find(q, max), open, answer, provider, attach, core, state: () => S};
})(typeof window !== 'undefined' ? window : globalThis);
