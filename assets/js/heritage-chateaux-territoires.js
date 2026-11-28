/**
 * 🏰 Châteaux d'Europe et 👑 Territoires d'autrefois (style : assets/css/chateaux-territoires.css).
 * Données livrées (assets/data/, refaites par scripts/chateaux-territoires/) :
 *  - chateaux/index.json + chateaux/chateaux-<PAYS>.json.gz : les châteaux, châteaux forts, ruines, forteresses, manoirs,
 *    maisons fortes, tours et mottes de Wikidata (CC0), un fichier par pays, lu seulement quand il sert ;
 *  - territoires/territoires-europe.json.gz : royaumes, duchés, comtés, principautés, évêchés, électorats, marches, villes libres,
 *    seigneuries… de Wikidata (CC0) : dates, capitale, armoiries, « fait partie de », avant / après ;
 *  - territoires/territoires-contours.json.gz : les contours dessinés sur Wikimedia Commons (Data:*.map), licence de chaque fichier ;
 *  - territoires/territoires-cartes.json.gz : historical-basemaps (A. Ourednik, GPL-3.0), l'Europe à des dates choisies, avant 1816.
 * Ce que ça montre :
 *  - Carte : « 👑 Territoires d'autrefois » + l'année (suit la frise en mode « Dans le temps ») ; clic → petite fiche ;
 *  - fiche d'un village (et monographie de commune) : « 🏰 Châteaux de la commune et alentours » et « 👑 Territoires d'autrefois »
 *    (« Dans quel territoire était ce lieu en [année] ? ») ;
 *  - fiche d'une personne : dans « 🗺 Pays à l'époque », pour les dates d'avant 1816 (que CShapes ne couvre pas), le territoire de
 *    l'époque d'après les cartes anciennes, et le territoire Wikidata dessiné (duché, comté…) quand il y en a un ;
 *  - Listes : « 🏰 Châteaux d'Europe » et « 👑 Territoires d'autrefois » (LCNDA_EXT.dataLists) ; à la demande : LCNDA_EXT.dataSources.
 * Réglages → « 🏰 Châteaux et territoires » : chaque partie s'éteint (localStorage « genealogie-chateaux-territoires »).
 * Tout se calcule dans le navigateur, en lecture seule (rien n'est écrit dans la généalogie).
 *   window.LCNDA_EXT.chateauxTerritoires = {…}   (Node : module.exports, le calcul)
 * Essai : tests/test-chateaux-territoires.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const CSHAPES_FROM = 1816;
    const KINDS = {c: 'château fort', h: 'château', r: 'ruine ou site de château', f: 'forteresse', m: 'manoir', mf: 'maison forte', t: 'tour, donjon', o: 'motte castrale'};
    const KIND_ICON = {c: '🏰', h: '🏯', r: '🧱', f: '🛡', m: '🏠', mf: '🏠', t: '🗼', o: '⛰'};
    const TKINDS = {royaume: 'royaume', 'grand-duche': 'grand-duché', duche: 'duché', principaute: 'principauté', electorat: 'électorat',
        eveche: 'principauté épiscopale (évêché)', marche: 'marche, marquisat', landgraviat: 'landgraviat', palatinat: 'comté palatin',
        comte: 'comté', vicomte: 'vicomté', 'ville-libre': 'ville libre d’Empire', abbaye: 'abbaye d’Empire', seigneurie: 'seigneurie',
        province: 'province', etat: 'État'};
    const COUNTRY = {FR: 'France', DE: 'Allemagne', IT: 'Italie', ES: 'Espagne', GB: 'Royaume-Uni', IE: 'Irlande', PT: 'Portugal', BE: 'Belgique',
        NL: 'Pays-Bas', LU: 'Luxembourg', CH: 'Suisse', AT: 'Autriche', CZ: 'Tchéquie', SK: 'Slovaquie', PL: 'Pologne', HU: 'Hongrie', SI: 'Slovénie',
        HR: 'Croatie', BA: 'Bosnie-Herzégovine', RS: 'Serbie', ME: 'Monténégro', MK: 'Macédoine du Nord', AL: 'Albanie', GR: 'Grèce', BG: 'Bulgarie',
        RO: 'Roumanie', MD: 'Moldavie', UA: 'Ukraine', BY: 'Biélorussie', LT: 'Lituanie', LV: 'Lettonie', EE: 'Estonie', FI: 'Finlande', SE: 'Suède',
        NO: 'Norvège', DK: 'Danemark', IS: 'Islande', RU: 'Russie', MT: 'Malte', CY: 'Chypre', LI: 'Liechtenstein', MC: 'Monaco', SM: 'Saint-Marin',
        AD: 'Andorre', VA: 'Vatican', XK: 'Kosovo'};
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const km = (la1, lo1, la2, lo2) => {
        const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
        return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
    };
    /** l'état d'un château : 'ruine', 'disparu', 'restauré', 'debout' ou 'non précisé' (seulement ce que dit Wikidata) */
    function condition(c) {
        const st = fold(c.st);
        if (c.y1 != null || /detruit|disparu|demoli|rase/.test(st)) return 'disparu';
        if (c.k === 'r' || /ruin/.test(st)) return 'ruine';
        if (/restaur|reconstruit/.test(st)) return 'restauré';
        if (st) return 'debout';
        return 'non précisé';
    }
    const century = y => (y > 0 ? Math.floor((y - 1) / 100) + 1 : 0);
    const roman = n => { let s = ''; for (const [v, l] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += l; n -= v; } return s; };
    const centuryLabel = y => (century(y) ? `${roman(century(y))}e s.` : '');
    /** les siècles où il est attesté (de la construction à la destruction, ou jusqu'à aujourd'hui) */
    function centuries(c, now = 2026) {
        if (c.y0 == null) return [];
        const a = century(c.y0), b = century(c.y1 != null ? c.y1 : now), out = [];
        for (let i = a; i <= b && i > 0; i++) out.push(`${roman(i)}e s.`);
        return out;
    }
    const yr = y => (y == null ? '' : y < 0 ? T('{y} av. J.-C.', {y: String(-y)}) : String(y));
    const span = (a, b) => (a == null && b == null ? '' : a != null && b != null ? `${yr(a)}–${yr(b)}` : a != null ? T('dès {y}', {y: yr(a)}) : T('jusqu’en {y}', {y: yr(b)}));
    const ownerText = o => `${o[0]}${o.length > 2 && (o[2] != null || o[3] != null) ? ` (${span(o[2], o[3])})` : ''}`;

    /** une ligne de liste pour un château */
    function castleRow(c, code) {
        return {id: c.q, q: c.q, name: c.n, local: c.nl || '', commune: c.cn || '', region: c.rg || '', insee: c.ci || '', country: COUNTRY[code] || code, code,
            type: KINDS[c.k] || KINDS.c, kind: c.k, state: condition(c), from: c.y0 ?? null, to: c.y1 ?? null, centuries: centuries(c).join(', '),
            owners: (c.ow || []).map(ownerText).join(' ; '), protection: (c.hs || []).join(' ; '), visit: c.v ? T('oui') : '', photo: c.im ? T('oui') : T('non'),
            wikipedia: c.w ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(c.w.replace(/ /g, '_'))}` : c.wl ? `https://${c.wl[0]}.wikipedia.org/wiki/${encodeURIComponent(c.wl[1].replace(/ /g, '_'))}` : '',
            wikidata: `https://www.wikidata.org/wiki/${c.q}`, merimee: c.me || '', image: c.im || '', lat: c.la ?? null, lon: c.lo ?? null, raw: c};
    }
    /** les châteaux autour d'un point : [{c, code, d}] du plus proche au plus loin */
    function castlesNear(files, lat, lon, radius) {
        const out = [];
        for (const f of files) for (const c of f.items) {
            if (c.la == null) continue;
            if (Math.abs(c.la - lat) > radius / 100 || Math.abs(c.lo - lon) > radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))) continue;
            const d = km(lat, lon, c.la, c.lo); if (d <= radius) out.push({c, code: f.country, d});
        }
        return out.sort((a, b) => a.d - b.d);
    }
    /** les pays dont les châteaux peuvent être à moins de r km du point */
    function countriesNear(index, lat, lon, radius) {
        const m = radius / 100 + 0.05;
        return Object.entries(index.countries || {}).filter(([, c]) => c.box && lat >= c.box[0] - m && lat <= c.box[2] + m && lon >= c.box[1] - m * 1.6 && lon <= c.box[3] + m * 1.6).map(([k]) => k);
    }
    /** est-ce le même lieu ? (code INSEE, sinon le nom de la commune, à moins de 25 km) */
    function sameCommune(c, place, lat, lon) {
        if (place.insee && c.ci) return c.ci === place.insee;
        if (!c.cn || fold(c.cn) !== fold(place.name)) return false;
        return lat == null || c.la == null || km(lat, lon, c.la, c.lo) < 25;
    }

    /* ─────────── les contours ─────────── */
    function decodeRing(d, q) {
        const out = new Float64Array(d.length); let x = 0, y = 0;
        for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; out[i] = x * q; out[i + 1] = y * q; }
        return out;
    }
    function inRing(x, y, p) {
        let c = false;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
            const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) c = !c;
        }
        return c;
    }
    /** une forme : {polys:[[Float64Array…]], box:[x0,y0,x1,y1]} décodée à la demande */
    function shape(g, q, box) {
        let polys = null;
        const get = () => polys || (polys = g.map(poly => poly.map(r => decodeRing(r, q))));
        let b = box ? box.map(v => v * q) : null;
        if (!b) { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const poly of get()) { const r = poly[0]; for (let i = 0; i < r.length; i += 2) { b[0] = Math.min(b[0], r[i]); b[2] = Math.max(b[2], r[i]); b[1] = Math.min(b[1], r[i + 1]); b[3] = Math.max(b[3], r[i + 1]); } } }
        return {box: b, polys: get, has: (lon, lat) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && get().some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)))};
    }
    function prepareTerr(raw) {
        const items = raw.items.map(it => ({...it}));
        const byQ = new Map(items.map(it => [it.q, it]));
        return {raw, items, byQ};
    }
    function prepareShapes(raw) { return {raw, shapes: raw.shapes.map(s => ({...s, sh: shape(s.g, raw.q)}))}; }
    function prepareMaps(raw) {
        const snaps = {};
        for (const y of raw.years) snaps[y] = raw.snaps[String(y)].map(f => ({n: f.n, s: f.s || '', p: f.p || 0, sh: shape(f.g, raw.q, f.b)}));
        return {raw, years: raw.years.slice().sort((a, b) => a - b), snaps};
    }
    /** l'année de la carte ancienne à utiliser pour cette année : la plus proche avant (ou null) */
    function snapYear(Mp, year) {
        if (!Mp || year == null || year >= CSHAPES_FROM) return null;
        let best = null; for (const y of Mp.years) if (y <= year) best = y;
        return best;
    }
    function snapAt(Mp, year, lat, lon) {
        const sy = snapYear(Mp, year); if (sy == null) return null;
        const hits = Mp.snaps[sy].filter(f => f.sh.has(lon, lat));
        if (!hits.length) return null;
        const area = f => (f.sh.box[2] - f.sh.box[0]) * (f.sh.box[3] - f.sh.box[1]);
        const f = hits.sort((a, b) => area(a) - area(b))[0];
        return {name: f.n, subject: f.s, precision: f.p, year: sy};
    }
    /** ce territoire existait-il cette année-là ? (il faut au moins une date connue) */
    const active = (it, y) => (it.y0 != null || it.y1 != null) && (it.y0 == null || it.y0 <= y) && (it.y1 == null || y <= it.y1);
    /** les territoires Wikidata de ce lieu cette année-là : dessinés (contour qui contient le lieu) et « sièges » (le lieu est leur centre, < 4 km) */
    function terrAt(Tr, Sh, lat, lon, year) {
        const drawn = [], seats = [];
        if (Sh) for (const s of Sh.shapes) { const it = Tr.byQ.get(s.q); if (it && active(it, year) && s.sh.has(lon, lat)) drawn.push(it); }
        for (const it of Tr.items) if (it.la != null && !it.pc && active(it, year) && Math.abs(it.la - lat) < 0.05 && km(lat, lon, it.la, it.lo) < 4 && !drawn.includes(it)) seats.push(it);
        const area = it => { const s = Sh?.shapes[it.sh]?.sh.box; return s ? (s[2] - s[0]) * (s[3] - s[1]) : 1e9; };
        drawn.sort((a, b) => area(a) - area(b));
        return {drawn, seats};
    }
    /** la phrase : « Royaume de France (carte de 1700) · duché de Lorraine » */
    function placeAt(ctx, lat, lon, year) {
        const snap = snapAt(ctx.maps, year, lat, lon), wd = ctx.terr ? terrAt(ctx.terr, ctx.shapes, lat, lon, year) : {drawn: [], seats: []};
        return {snap, drawn: wd.drawn, seats: wd.seats, any: !!(snap || wd.drawn.length || wd.seats.length)};
    }
    /** une ligne de liste pour un territoire */
    function terrRow(it, Tr) {
        const pa = (it.pa || []).map(ownerText).join(' ; '), cap = (it.cap || []).map(ownerText).join(' ; ');
        return {id: it.q, q: it.q, name: it.n, kind: TKINDS[it.k] || it.k, from: it.y0 ?? null, to: it.y1 ?? null, capital: cap, parent: pa,
            limits: it.sh != null ? T('contour dessiné') : T('limites inconnues'), arms: it.arms || '',
            before: (it.pr || []).map(q => Tr?.byQ.get(q)?.n || q).join(' ; '), after: (it.su || []).map(q => Tr?.byQ.get(q)?.n || q).join(' ; '),
            wikipedia: it.w ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(it.w.replace(/ /g, '_'))}` : it.we ? `https://en.wikipedia.org/wiki/${encodeURIComponent(it.we.replace(/ /g, '_'))}` : '',
            wikidata: `https://www.wikidata.org/wiki/${it.q}`, lat: it.la ?? null, lon: it.lo ?? null, raw: it};
    }

    const core = {CSHAPES_FROM, KINDS, TKINDS, COUNTRY, fold, km, condition, centuries, centuryLabel, castleRow, castlesNear, countriesNear, sameCommune,
        decodeRing, shape, prepareTerr, prepareShapes, prepareMaps, snapYear, snapAt, active, terrAt, placeAt, terrRow, span};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    for (const k of ['mapSetup', 'mapDraw']) ext[k] = ext[k] || [];
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const S = () => A().state || {};
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const DATA_V = 1;
    const KEY = 'genealogie-chateaux-territoires';
    const TAB = ['chateaux_territoires', '25k6', '🏰 Châteaux et territoires'];
    const PARTS = [
        ['place_castles', '🏰 Châteaux de la commune et alentours', 'Fiche d’un village et monographie de commune : les châteaux, ruines, manoirs et maisons fortes connus de Wikidata.'],
        ['place_terr', '👑 Territoires d’autrefois (lieu)', 'Fiche d’un village et monographie : dans quel royaume, duché, comté… était ce lieu à une date choisie.'],
        ['person_terr', '👑 Territoires d’autrefois (fiche)', 'Dans « 🗺 Pays à l’époque » : le territoire de l’époque pour les dates d’avant 1816.'],
        ['map', '👑 Territoires d’autrefois (carte)', 'Le bouton de la Carte, avec l’année.']];
    const DEF = {...Object.fromEntries(PARTS.map(p => [p[0], true])), radius: 10, year: 1700, layer: false, castles: false};
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(p) { try { localStorage.setItem(KEY, JSON.stringify({...settings(), ...p})); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const safe = u => (A().safeUrl ? A().safeUrl(u) : u) || '#';
    const link = (url, label) => `<a href="${esc(safe(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
    const spinner = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers compressés.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    /* un téléchargement coupé (page rechargée, application arrêtée, réseau perdu) n'est pas une erreur à montrer : la partie reste vide, sans rien dans la console */
    const cutOff = e => e?.name === 'AbortError' || e?.network === true || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')));
    const report = e => { if (!cutOff(e)) console.error(e); };
    const memo = new Map();
    function getData(path, prep = x => x) {
        if (!memo.has(path)) memo.set(path, fetch(`assets/data/${path}?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: path})); return /\.gz$/.test(path) ? readMaybeGz(r) : r.json(); })
            .then(prep).catch(e => { memo.delete(path); throw e; }));
        return memo.get(path);
    }
    const loadIndex = () => getData('chateaux/index.json');
    const loadCountry = code => getData(`chateaux/chateaux-${code}.json.gz`);
    const loadTerr = () => getData('territoires/territoires-europe.json.gz', prepareTerr);
    const loadShapes = () => getData('territoires/territoires-contours.json.gz', prepareShapes);
    const loadMaps = () => getData('territoires/territoires-cartes.json.gz', prepareMaps);
    let terrCtx = null;
    async function loadAllTerr() {
        const [terr, shapes, maps] = await Promise.all([loadTerr(), loadShapes().catch(() => null), loadMaps().catch(() => null)]);
        return (terrCtx = {terr, shapes, maps});
    }
    async function castlesAround(lat, lon, radius) {
        const idx = await loadIndex();
        const files = await Promise.all(countriesNear(idx, lat, lon, radius).map(c => loadCountry(c).catch(() => null)));
        return castlesNear(files.filter(Boolean), lat, lon, radius);
    }

    /* ─────────── 🏰 la petite fiche d'un château ─────────── */
    const imgUrl = (f, w = 360) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f.replace(/ /g, '_'))}?width=${w}`;
    /** consultation (kiosque) ou invité du réseau local : aucune image chargée d'Internet (le lien reste) */
    const offline = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const fileUrl = f => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f.replace(/ /g, '_'))}`;
    function castleCardHtml(r) {
        const c = r.raw;
        const rows = [[T('Sorte'), r.type], [T('État'), r.state === 'non précisé' ? T('non précisé dans Wikidata') : r.state], [T('Construit'), c.y0 != null ? `${yr(c.y0)} (${centuryLabel(c.y0)})` : ''],
            [T('Détruit ou disparu'), yr(c.y1)], [T('Commune'), [r.commune, r.region, r.country].filter(Boolean).join(', ')], [T('Protection'), r.protection], [T('Se visite'), c.v ? T('oui (d’après Wikidata)') : '']].filter(x => x[1]);
        return `<div class="cht-card">${c.im && offline() ? `<p class="muted"><small>🖼 ${link(fileUrl(c.im), T('Image Wikimedia Commons (auteur et licence)'))}</small></p>` : c.im ? `<figure class="cht-img"><img src="${esc(imgUrl(c.im))}" alt="${esc(r.name)}" loading="lazy" onerror="this.closest('figure').hidden=true"><figcaption><small>${link(fileUrl(c.im), T('Image Wikimedia Commons (auteur et licence)'))}</small></figcaption></figure>` : ''}
            ${r.local && r.local !== r.name ? `<p class="muted">${esc(r.local)}</p>` : ''}
            <dl class="data-list">${rows.map(([k, v]) => `<div class="data-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            ${(c.ow || []).length ? `<h4>${esc(T('Propriétaires et seigneurs connus'))}</h4><ul>${c.ow.map(o => `<li>${esc(ownerText(o))}</li>`).join('')}</ul>` : ''}
            <p class="h-links">${[r.wikipedia ? link(r.wikipedia, T('Wikipédia')) : '', link(r.wikidata, 'Wikidata'), r.merimee ? link(`https://pop.culture.gouv.fr/notice/merimee/${r.merimee}`, T('Mérimée (Monuments historiques)')) : '',
            r.lat != null ? `<button type="button" class="link-button" data-cht-map="${r.lat},${r.lon}">${esc(T('🗺 Voir sur la carte'))}</button>` : ''].filter(Boolean).join(' · ')}</p>
            <p><small class="muted">${esc(T('Source : Wikidata (CC0), {q}.', {q: c.q}))}</small></p></div>`;
    }
    function dialog(title, body) {
        const d = document.createElement('dialog'); d.className = 'modal cht-dlg';
        d.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-button" data-cht-close aria-label="${esc(T('Fermer'))}" title="${esc(T('Fermer'))}">×</button></div><div class="modal-body">${body}</div>`;
        document.body.appendChild(d);
        d.addEventListener('close', () => d.remove());
        d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-cht-close]')) d.close(); if (e.target.closest('[data-cht-map]')) d.close(); });
        if (d.showModal) d.showModal(); else d.setAttribute('open', '');
        return d;
    }
    const openCastle = r => dialog(`${KIND_ICON[r.kind] || '🏰'} ${r.name}`, castleCardHtml(r));
    function terrCardHtml(r, extra = '') {
        const it = r.raw;
        const rows = [[T('Sorte'), r.kind], [T('Dates'), span(it.y0, it.y1)], [T('Capitale'), r.capital], [T('Faisait partie de'), r.parent], [T('Avant'), r.before], [T('Après'), r.after],
            [T('Limites'), it.sh != null ? T('contour dessiné (Wikimedia Commons)') : T('limites inconnues : seulement un point')]].filter(x => x[1]);
        return `<div class="cht-card">${it.arms && !offline() ? `<figure class="cht-arms"><img src="${esc(imgUrl(it.arms, 120))}" alt="${esc(T('Armoiries'))}" loading="lazy" onerror="this.closest('figure').hidden=true"></figure>` : ''}
            <dl class="data-list">${rows.map(([k, v]) => `<div class="data-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${extra}
            <p class="h-links">${[r.wikipedia ? link(r.wikipedia, T('Wikipédia')) : '', link(r.wikidata, 'Wikidata')].filter(Boolean).join(' · ')}</p>
            <p><small class="muted">${esc(T('Source : Wikidata (CC0), {q}.', {q: it.q}))}${it.sh != null && terrCtx?.shapes?.shapes[it.sh] ? ' ' + esc(T('Contour : {f}, licence {l}.', {f: terrCtx.shapes.shapes[it.sh].file, l: terrCtx.shapes.shapes[it.sh].licence})) : ''}</small></p></div>`;
    }
    const openTerr = r => dialog(`👑 ${r.name}`, terrCardHtml(r));
    document.addEventListener('click', e => {
        const m = e.target.closest?.('[data-cht-map]');
        if (m) { e.preventDefault(); const [lat, lon] = m.dataset.chtMap.split(',').map(Number); const st = S(); st.mapCenter = {lat, lon}; st.mapZoom = 13; save({castles: true}); A().persistUiState?.(); A().setModule?.('carte'); return; }
        const c = e.target.closest?.('[data-cht-castle]');
        if (c) { e.preventDefault(); const [code, q] = c.dataset.chtCastle.split(':'); loadCountry(code).then(f => { const it = f.items.find(x => x.q === q); if (it) openCastle(castleRow(it, code)); }).catch(report); return; }
        const t = e.target.closest?.('[data-cht-terr]');
        if (t) { e.preventDefault(); loadAllTerr().then(ctx => { const it = ctx.terr.byQ.get(t.dataset.chtTerr); if (it) openTerr(terrRow(it, ctx.terr)); }); }
    });

    /* ─────────── 🏰 Châteaux de la commune et alentours ─────────── */
    function castleLi(x) {
        const c = x.c, st = condition(c);
        return `<li><button type="button" class="link-button" data-cht-castle="${esc(x.code)}:${esc(c.q)}">${KIND_ICON[c.k] || '🏰'} ${esc(c.n)}</button>
            <small class="muted">${esc([KINDS[c.k], st !== 'non précisé' ? st : '', c.y0 != null ? centuryLabel(c.y0) : '', x.here ? '' : T('à {d} km', {d: String(Math.round(x.d * 10) / 10).replace('.', ',')})].filter(Boolean).join(' · '))}</small>
            ${(c.ow || []).length ? `<br><small>${esc(T('Seigneurs, propriétaires : {l}', {l: c.ow.slice(0, 3).map(ownerText).join(' ; ')}))}</small>` : ''}</li>`;
    }
    /** rend la partie dans host ; false = rien à montrer */
    async function castlesInto(host, place, {radius = settings().radius} = {}) {
        const lat = place.lat ?? place.latitude, lon = place.lon ?? place.longitude;
        if (lat == null || lat === '' || lon == null || lon === '' || !Number.isFinite(Number(lat))) return false;
        let list;
        try { list = await castlesAround(Number(lat), Number(lon), radius); } catch (e) { if (cutOff(e)) { host.innerHTML = ''; return false; } host.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return true; }
        list.forEach(x => { x.here = sameCommune(x.c, place, Number(lat), Number(lon)); });
        const here = list.filter(x => x.here), near = list.filter(x => !x.here);
        if (!list.length) { host.innerHTML = ''; return false; }
        const nm = place.name || T('cette commune');
        const first = here.length ? T('{n} à {c}, {m} à moins de {r} km.', {n: A().plural ? A().plural(here.length, T('château connu'), T('châteaux connus')) : here.length, c: nm, m: near.length, r: radius})
            : T('Aucun château connu à {c} même, mais {m} à moins de {r} km.', {c: nm, m: near.length, r: radius});
        host.innerHTML = `<p>${esc(first)}</p><ul class="cht-list">${[...here, ...near].slice(0, 6).map(castleLi).join('')}</ul>
            ${list.length > 6 ? `<details class="mp-more"><summary>${esc(T('▸ plus ({n})', {n: list.length - 6}))}</summary><ul class="cht-list">${[...here, ...near].slice(6, 120).map(castleLi).join('')}</ul></details>` : ''}
            <p class="cht-ctl"><label>${esc(T('Autour :'))} <select data-cht-radius>${[5, 10, 20, 30].map(k => `<option value="${k}" ${k === radius ? 'selected' : ''}>${k} km</option>`).join('')}</select></label>
            ${ext.dataLists ? ` · <button type="button" class="link-button" data-cht-list="chateaux">${esc(T('Tous les châteaux (Listes)'))}</button>` : ''}</p>
            <p><small class="muted">${esc(T('Source : Wikidata (CC0) — ce que les contributeurs y ont décrit ; un château absent n’a peut-être pas encore de fiche.'))}</small></p>`;
        host.querySelector('[data-cht-radius]').addEventListener('change', e => { const r = Number(e.target.value) || 10; save({radius: r}); castlesInto(host, place, {radius: r}); });
        return true;
    }
    document.addEventListener('click', e => { const l = e.target.closest?.('[data-cht-list]'); if (l) { e.preventDefault(); const id = l.dataset.chtList; if (ext.dataListsEngine?.open) ext.dataListsEngine.open(id); else { const st = S(); st.listType = 'data_' + id; A().setModule?.('listes'); } } });

    /* ─────────── 👑 Territoires d'autrefois (lieu) ─────────── */
    function terrLine(r, year) {
        const bits = [];
        if (r.drawn.length) bits.push(r.drawn.slice(0, 3).map(it => `<button type="button" class="link-button" data-cht-terr="${esc(it.q)}">${esc(it.n)}</button>`).join(', '));
        if (r.snap) bits.push(`${esc(r.snap.name)}${r.snap.subject && r.snap.subject !== r.snap.name ? ` <small class="muted">(${esc(r.snap.subject)})</small>` : ''} <small class="muted" title="${esc(T('Carte du monde de {y}, tracé approximatif (historical-basemaps)', {y: String(r.snap.year)}))}">${esc(T('carte de {y}', {y: yr(r.snap.year)}))}</small>`);
        if (r.seats.length) bits.push(esc(T('siège de : {l}', {l: ''})) + r.seats.slice(0, 3).map(it => `<button type="button" class="link-button" data-cht-terr="${esc(it.q)}">${esc(it.n)}</button>`).join(', '));
        return bits.join(' · ');
    }
    /** les étapes du lieu à travers les cartes anciennes : [{from, to, name}] */
    function steps(ctx, lat, lon) {
        const out = [];
        for (const y of ctx.maps?.years || []) {
            const s = snapAt(ctx.maps, y, lat, lon), n = s ? s.name : '';
            if (out.length && out[out.length - 1].name === n) out[out.length - 1].to = y; else out.push({from: y, to: y, name: n});
        }
        return out.filter(s => s.name);
    }
    async function terrInto(host, place, {year} = {}) {
        const lat = Number(place.lat ?? place.latitude), lon = Number(place.lon ?? place.longitude);
        if (place.lat == null && place.latitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
        let ctx; try { ctx = await loadAllTerr(); } catch (e) { return false; }
        const y = Number(year || settings().year) || 1700;
        const r = placeAt(ctx, lat, lon, y), st = steps(ctx, lat, lon);
        const seatsAll = ctx.terr.items.filter(it => it.la != null && !it.pc && Math.abs(it.la - lat) < 0.05 && km(lat, lon, it.la, it.lo) < 4);
        if (!r.any && !st.length && !seatsAll.length) { host.innerHTML = ''; return false; }
        host.innerHTML = `<p class="cht-ask"><label>${esc(T('Dans quel territoire était ce lieu en'))} <input type="number" data-cht-year min="-1" max="2025" step="1" value="${esc(String(y))}" aria-label="${esc(T('Année'))}"></label> ?</p>
            <p class="cht-answer">${r.any ? terrLine(r, y) : `<span class="muted">${esc(y >= CSHAPES_FROM ? T('Après 1815 : vois « 🗺 Le pays à l’époque ».') : T('Pas de territoire connu à cette date pour ce lieu.'))}</span>`}</p>
            ${st.length ? `<details class="mp-more"><summary>${esc(T('▸ plus : ce lieu sur les cartes anciennes'))}</summary><ul class="mc-rows">${st.map(s => `<li><b>${esc(s.from === s.to ? yr(s.from) : `${yr(s.from)}–${yr(s.to)}`)}</b> : ${esc(s.name)}</li>`).join('')}</ul></details>` : ''}
            ${seatsAll.length ? `<p>${esc(T('Ce lieu a été le siège de :'))} ${seatsAll.slice(0, 8).map(it => `<button type="button" class="link-button" data-cht-terr="${esc(it.q)}">${esc(it.n)}</button> <small class="muted">${esc(span(it.y0, it.y1))}</small>`).join(', ')}</p>` : ''}
            <p><small class="muted">${esc(T('Sources : Wikidata (CC0) ; cartes anciennes historical-basemaps (A. Ourednik, GPL-3.0), tracés approximatifs, à vérifier ; contours Wikimedia Commons (licence de chaque fichier).'))}</small></p>`;
        host.querySelector('[data-cht-year]').addEventListener('change', e => { const v = Math.round(Number(e.target.value)); if (!Number.isFinite(v)) return; save({year: v}); terrInto(host, place, {year: v}); });
        return true;
    }

    /* ─────────── la fiche d'un village (lieu) ─────────── */
    const panel = (id, title, sub = '') => `<section class="maintenance-panel cplus-panel cht-panel" data-cht-part="${id}"><h3>${esc(title)}${sub ? ` <small class="muted">${esc(sub)}</small>` : ''}</h3><div data-cht-body></div></section>`;
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        const name = pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim();
        return {id: Number(pli?.dataset.pliPlace) || 0, name, lat: pli?.dataset.pliLat !== '' && pli?.dataset.pliLat != null ? Number(pli.dataset.pliLat) : null,
            lon: pli?.dataset.pliLon !== '' && pli?.dataset.pliLon != null ? Number(pli.dataset.pliLon) : null, insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'cht_place', host: '[data-cht-host]', icon: '🏰', label: 'Châteaux et territoires d’autrefois', group: 'Son histoire', enabled: () => on('place_castles') || on('place_terr')});
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-cht])');
        if (!village) return;
        village.dataset.cht = '1';
        const place = villagePlace(village); if (!place.name || place.lat == null) return;
        const parts = [on('place_castles') ? panel('castles', T('🏰 Châteaux de la commune et alentours')) : '', on('place_terr') ? panel('terr', T('👑 Territoires d’autrefois')) : ''].join('');
        if (!parts) return;
        const box = `<div class="cht-place" data-cht-host>${parts}</div>`;
        const anchor = village.querySelector('[data-mr-host], .mr-place') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        village.querySelectorAll('[data-cht-host] [data-cht-part]').forEach(async sec => {
            const body = sec.querySelector('[data-cht-body]');
            const ok = sec.dataset.chtPart === 'castles' ? await castlesInto(body, place) : await terrInto(body, place);
            if (!ok) sec.remove();
        });
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); decoratePerson(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── la monographie de commune (registre commun) ─────────── */
    const MS = ext.monographSections = ext.monographSections || [];
    MS.push({id: 'chateaux', icon: '🏰', label: 'Châteaux de la commune et alentours', group: 'Le lieu', enabled: () => on('place_castles'), source: 'Wikidata (CC0)',
        render: async (place, host) => castlesInto(host, {...place, insee: ''})});
    MS.push({id: 'territoires', icon: '👑', label: 'Territoires d’autrefois', group: 'Le monde', enabled: () => on('place_terr'),
        source: 'Wikidata (CC0) · historical-basemaps (GPL-3.0) · Wikimedia Commons',
        render: async (place, host, ctx) => { const fy = await ctx?.years?.(); return terrInto(host, place, {year: fy ? Math.round((fy.from + fy.to) / 2) : undefined}); }});

    /* ─────────── la fiche d'une personne : dans « 🗺 Pays à l'époque » ─────────── */
    // Les lignes « trop tôt : les cartes commencent en 1816 » reçoivent le territoire de l'époque ; les autres, le territoire Wikidata dessiné.
    // (À défaut du crochet ext.mondeContexte.rowExtra, on relit les mêmes lignes, dans le même ordre, avec ext.mondeContexte.personRows.)
    async function personInto(host) {
        const M = ext.mondeContexte, pid = Number(host.dataset.mcHost);
        if (!M?.personRows || !pid) return;
        let detail, B, C, ctx;
        try { [detail, B, C, ctx] = await Promise.all([A().api('person', {id: pid}), M.load(), M.loadStats(), loadAllTerr()]); } catch (_) { return; }
        if (!host.isConnected) return;
        const {rows} = M.personRows(B, C, detail), lis = [...host.querySelectorAll('.mc-rows > li')];
        if (lis.length !== rows.length) return;
        const evs = (detail.events || []).filter(e => Number(e.year));
        rows.forEach((r, i) => {
            const e = evs.find(x => Number(x.year) === r.year && (x.place_name || T('Lieu sans nom')) === r.place); if (!e) return;
            const lat = Number(e.precise_lat ?? e.latitude), lon = Number(e.precise_lon ?? e.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            const res = placeAt(ctx, lat, lon, r.year);
            if (!res.any) return;
            const li = lis[i];
            if (!r.then && r.year < CSHAPES_FROM) {
                const m = [...li.querySelectorAll(':scope > span.muted')].pop(); // « trop tôt : … » (le premier .muted est « (Naissance, 1702) »)
                const html = `${esc(T('à cette date, ce lieu était dans :'))} <span class="mc-then">${terrLine({...res, seats: []}, r.year)}</span>`;
                if (m) m.outerHTML = html; else li.insertAdjacentHTML('beforeend', ' → ' + html);
            } else if (res.drawn.length) li.insertAdjacentHTML('beforeend', ` <small class="cht-in">👑 ${terrLine({snap: null, drawn: res.drawn, seats: []}, r.year)}</small>`);
            li.classList.add('cht-done');
        });
        if (host.querySelector('.cht-done') && !host.querySelector('.cht-src')) (host.querySelector('.mc-src') || host.lastElementChild)?.insertAdjacentHTML('afterend', `<small class="cht-src muted">${esc(T('👑 Avant 1816 : cartes anciennes historical-basemaps (GPL-3.0, tracés approximatifs) ; territoires Wikidata (CC0).'))}</small>`);
    }
    function decoratePerson() {
        if (!on('person_terr')) return;
        document.querySelectorAll('#workspace [data-mc-host]').forEach(h => { if (h.dataset.chtDone || !h.querySelector('.mc-rows')) return; h.dataset.chtDone = '1'; personInto(h); });
    }

    /* ─────────── 🗺 la Carte : « 👑 Territoires d'autrefois » ─────────── */
    const COLORS = ['#e9b872', '#8fb8de', '#b5d99c', '#e0aed0', '#f4d58d', '#a7d7cf', '#eba59b', '#c3b1e1', '#d5c39b', '#9fcdb3'];
    const colorOf = n => { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
    const layerYear = () => (S().mapMode === 'timeline' && Number(S().mapTimelineYear) ? Number(S().mapTimelineYear) : Number(settings().year) || 1700);
    let mapLast = null, mapPts = [];
    ext.mapSetup.push(() => {
        if (!on('map')) return;
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage || strip.querySelector('.cht-ctl') || document.getElementById('cht-layer')) return; // une seule fois par carte
        const layer = document.createElement('div'); layer.id = 'cht-layer'; layer.className = 'cht-layer'; layer.innerHTML = '<svg aria-hidden="true"></svg>';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        const p = settings(), ctl = document.createElement('span'); ctl.className = 'cht-ctl';
        ctl.innerHTML = `<label class="ui-toggle" title="${esc(T('Royaumes, duchés, comtés, principautés, évêchés… de l’année choisie (cartes anciennes avant 1816, et les territoires de Wikidata)'))}"><input type="checkbox" data-cht-layer ${p.layer ? 'checked' : ''}><i></i>${esc(T('👑 Territoires d’autrefois'))}</label>
            <input type="number" data-cht-myear min="-1" max="2025" step="1" value="${esc(String(p.year))}" aria-label="${esc(T('Année des territoires'))}">
            <label class="ui-toggle" title="${esc(T('Les châteaux de Wikidata (à partir d’un zoom assez proche)'))}"><input type="checkbox" data-cht-castles ${p.castles ? 'checked' : ''}><i></i>${esc(T('🏰 Châteaux'))}</label>`;
        strip.insertBefore(ctl, strip.querySelector('.spacer'));
        ctl.querySelector('[data-cht-layer]').addEventListener('change', e => { save({layer: e.target.checked}); A().drawMap?.(); });
        ctl.querySelector('[data-cht-castles]').addEventListener('change', e => { save({castles: e.target.checked}); A().drawMap?.(); });
        ctl.querySelector('[data-cht-myear]').addEventListener('change', e => { const y = Math.max(-1, Math.min(2025, Math.round(Number(e.target.value)) || 1700)); e.target.value = y; save({year: y}); A().drawMap?.(); });
        let down = null;
        stage.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
        stage.addEventListener('click', e => {
            if (!mapLast || !(settings().layer || settings().castles) || e.target.closest('#map-overlay > *, .map-zone-panel, .cht-pop, button, a, input, select')) return;
            if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
            const rect = stage.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
            const pt = mapPts.map(p => ({p, d: Math.hypot(p.x - x, p.y - y)})).filter(o => o.d < 9).sort((a, b) => a.d - b.d)[0];
            if (pt) { if (pt.p.castle) loadCountry(pt.p.code).then(f => { const it = f.items.find(c => c.q === pt.p.q); if (it) openCastle(castleRow(it, pt.p.code)); }).catch(report); else { const it = terrCtx?.terr.byQ.get(pt.p.q); if (it) openTerr(terrRow(it, terrCtx.terr)); } return; }
            if (!settings().layer || !terrCtx) return;
            const lon = A().xToLng(mapLast.left + x, mapLast.z), lat = A().yToLat(mapLast.top + y, mapLast.z), yr0 = layerYear();
            const r = placeAt(terrCtx, lat, lon, yr0); if (!r.any) return;
            popup(stage, x, y, `<p><b>${esc(T('En {y}, ici :', {y: yr(yr0)}))}</b></p><p>${terrLine(r, yr0)}</p>`);
        });
    });
    function popup(stage, x, y, html) {
        stage.querySelector('.cht-pop')?.remove();
        const d = document.createElement('div'); d.className = 'cht-pop'; d.style.left = Math.min(x, stage.clientWidth - 260) + 'px'; d.style.top = Math.min(y, stage.clientHeight - 120) + 'px';
        d.innerHTML = `<button type="button" class="icon-button small" aria-label="${esc(T('Fermer'))}" data-cht-popclose>×</button>${html}`;
        stage.appendChild(d);
        d.querySelector('[data-cht-popclose]').addEventListener('click', ev => { ev.stopPropagation(); d.remove(); });
    }
    const pathOf = (polys, toXY) => {
        let p = '';
        for (const poly of polys) for (const r of poly) {
            let seg = '', lx = NaN, ly = NaN;
            for (let i = 0; i < r.length; i += 2) { const [px, py] = toXY(r[i], r[i + 1]); if (seg && Math.abs(px - lx) < 1 && Math.abs(py - ly) < 1 && i + 2 < r.length) continue; seg += `${seg ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`; lx = px; ly = py; }
            p += seg + 'Z';
        }
        return p;
    };
    let castleIdx = null; const castleFiles = {};
    ext.mapDraw.push(({left, top, z, width, height}) => {
        mapLast = {left, top, z, width, height}; mapPts = [];
        const layer = document.getElementById('cht-layer'); if (!layer) return;
        const svg = layer.querySelector('svg'), p = settings();
        if (!p.layer && !p.castles) { svg.innerHTML = ''; return; }
        if (p.layer && !terrCtx) { if (!layer.dataset.loading) { layer.dataset.loading = '1'; loadAllTerr().then(() => { layer.dataset.loading = ''; A().drawMap?.(); }).catch(e => { layer.dataset.loading = ''; A().toast?.(e.message, 'error'); }); } }
        const lngToX = A().lngToX, latToY = A().latToY, toXY = (lo, la) => [lngToX(lo, z) - left, latToY(la, z) - top];
        const vis = b => { const x0 = lngToX(b[0], z) - left, x1 = lngToX(b[2], z) - left, y0 = latToY(b[3], z) - top, y1 = latToY(b[1], z) - top; return x1 >= 0 && x0 <= width && y1 >= 0 && y0 <= height ? [x0, y0, x1, y1] : null; };
        const y = layerYear(), out = [], labels = [], dots = [];
        const yEl = document.querySelector('[data-cht-myear]'); if (yEl && S().mapMode === 'timeline') yEl.value = y;
        let caption = '';
        if (p.layer && terrCtx) {
            const sy = snapYear(terrCtx.maps, y);
            if (sy != null) {
                for (const f of terrCtx.maps.snaps[sy]) {
                    const b = vis(f.sh.box); if (!b) continue;
                    out.push(`<path class="cht-snap" d="${pathOf(f.sh.polys(), toXY)}" fill="${colorOf(f.s || f.n)}" fill-rule="evenodd"><title>${esc(f.n)}</title></path>`);
                    if (b[2] - b[0] > 70 && b[3] - b[1] > 26) { const cx = Math.max(30, Math.min(width - 30, (b[0] + b[2]) / 2)), cy = Math.max(14, Math.min(height - 14, (b[1] + b[3]) / 2)); labels.push(`<text x="${cx.toFixed(0)}" y="${cy.toFixed(0)}">${esc(f.n)}</text>`); }
                }
                caption = T('Territoires en {y} : carte de {s} (historical-basemaps, GPL-3.0, approximative) · Wikidata (CC0)', {y: yr(y), s: yr(sy)});
            } else caption = y >= CSHAPES_FROM ? T('Territoires en {y} : Wikidata (CC0) — pour les frontières des pays, coche « 🗺 Frontières de »', {y: yr(y)}) : T('Territoires en {y} : Wikidata (CC0)', {y: yr(y)});
            const shapes = terrCtx.shapes?.shapes || [], drawnQ = new Set();
            for (const s of shapes) {
                const it = terrCtx.terr.byQ.get(s.q); if (!it || !active(it, y)) continue;
                const b = vis(s.sh.box); if (!b) continue;
                drawnQ.add(it.q);
                out.push(`<path class="cht-wd" d="${pathOf(s.sh.polys(), toXY)}"><title>${esc(`${it.n} (${span(it.y0, it.y1)})`)}</title></path>`);
                if (b[2] - b[0] > 50) labels.push(`<text class="cht-wdl" x="${((b[0] + b[2]) / 2).toFixed(0)}" y="${((b[1] + b[3]) / 2 + 14).toFixed(0)}">${esc(it.n)}</text>`);
            }
            // les territoires sans contour : un point (leur capitale ou leur centre), « limites inconnues »
            const minZ = z >= 9 ? 99 : z >= 7 ? 3 : 2;
            const rank = it => ['royaume', 'grand-duche', 'duche', 'principaute', 'electorat', 'eveche', 'etat'].includes(it.k) ? 1 : ['marche', 'landgraviat', 'palatinat', 'comte', 'ville-libre', 'abbaye', 'province', 'vicomte'].includes(it.k) ? 2 : 3;
            let n = 0;
            for (const it of terrCtx.terr.items) {
                if (it.la == null || drawnQ.has(it.q) || !active(it, y) || rank(it) > minZ) continue;
                const [px, py] = toXY(it.lo, it.la); if (px < 0 || py < 0 || px > width || py > height) continue;
                if (++n > 600) break;
                mapPts.push({x: px, y: py, q: it.q});
                dots.push(`<g class="cht-pt k-${esc(it.k)}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rank(it) === 1 ? 5 : 3.5}"><title>${esc(`${it.n} (${span(it.y0, it.y1)}) — ${T('limites inconnues')}`)}</title></circle>${z >= 7 || rank(it) === 1 ? `<text x="${(px + 7).toFixed(0)}" y="${(py + 4).toFixed(0)}">${esc(it.n)}</text>` : ''}</g>`);
            }
        }
        if (p.castles) {
            if (z < 9) { if (!p.layer) caption = T('🏰 Châteaux : rapproche-toi (zoom) pour les voir'); }
            else if (!castleIdx) { if (!layer.dataset.cload) { layer.dataset.cload = '1'; loadIndex().then(i => { castleIdx = i; layer.dataset.cload = ''; A().drawMap?.(); }).catch(() => { layer.dataset.cload = ''; }); } }
            else {
                const la = A().yToLat(top + height / 2, z), lo = A().xToLng(left + width / 2, z), r = Math.max(width, height) / 256 / Math.pow(2, z) * 360 * 111 * Math.cos(la * Math.PI / 180) * 0.75;
                for (const c of countriesNear(castleIdx, la, lo, r)) {
                    const f = castleFiles[c];
                    if (!f) { if (!(c in castleFiles)) { castleFiles[c] = null; loadCountry(c).then(d => { castleFiles[c] = d; A().drawMap?.(); }).catch(() => { delete castleFiles[c]; }); } continue; }
                    for (const it of f.items) {
                        if (it.la == null) continue; const [px, py] = toXY(it.lo, it.la); if (px < -5 || py < -5 || px > width + 5 || py > height + 5) continue;
                        mapPts.push({x: px, y: py, q: it.q, code: c, castle: true});
                        const st = condition(it);
                        dots.push(`<text class="cht-castle s-${st === 'ruine' ? 'r' : st === 'disparu' ? 'd' : 'o'}" x="${px.toFixed(0)}" y="${(py + 5).toFixed(0)}">${KIND_ICON[it.k] || '🏰'}<title>${esc(`${it.n} — ${KINDS[it.k]}${st !== 'non précisé' ? ' · ' + st : ''}`)}</title></text>`);
                    }
                }
                caption = (caption ? caption + ' · ' : '') + T('🏰 Wikidata (CC0)');
            }
        }
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.innerHTML = `${out.join('')}${labels.join('')}${dots.join('')}${caption ? `<text class="cht-cap" x="${width - 10}" y="${height - 24}">${esc(caption)}</text>` : ''}`;
    });

    /* ─────────── Réglages → « 🏰 Châteaux et territoires » ─────────── */
    ext.maintenance = ext.maintenance || {};
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let idx = null, tr = null; try { [idx, tr] = await Promise.all([loadIndex(), loadTerr()]); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line" data-cht-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const kinds = {}; Object.values(idx?.countries || {}).forEach(c => Object.entries(c.kinds || {}).forEach(([k, n]) => { kinds[k] = (kinds[k] || 0) + n; }));
        const tk = {}; (tr?.items || []).forEach(it => { tk[it.k] = (tk[it.k] || 0) + 1; });
        const src = [['Wikidata', T('Châteaux ({n}) : nom, commune, dates, état, propriétaires, protection, image', {n: nf(idx?.total)}), 'CC0 1.0', 'https://www.wikidata.org/'],
            ['Wikidata', T('Territoires ({n}) : dates, capitale, armoiries, rattachements', {n: nf(tr?.items.length)}), 'CC0 1.0', 'https://www.wikidata.org/'],
            ['Wikimedia Commons (Data:*.map)', T('Contours de certains territoires'), T('licence de chaque fichier (CC0, CC BY-SA, ODbL…)'), 'https://commons.wikimedia.org/wiki/Help:Map_Data'],
            ['historical-basemaps (André Ourednik)', T('L’Europe à des dates choisies, de l’an 1 à 1815 (tracés approximatifs)'), 'GPL-3.0', 'https://github.com/aourednik/historical-basemaps']];
        ws.innerHTML = `<section class="page cht-settings" data-cht-settings>${UI().pageHeader ? UI().pageHeader({title: T('Châteaux et territoires'), help: esc(T('Les châteaux d’Europe et les territoires d’autrefois (royaumes, duchés, comtés, évêchés…), livrés avec l’app. Rien ne part sur Internet, sauf les images des châteaux.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Ce qu’il y a dedans'))}</h3>
                <p>${esc(T('{n} châteaux dans {p} pays : {l}.', {n: nf(idx?.total), p: Object.keys(idx?.countries || {}).length, l: Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${nf(n)} ${KINDS[k] || k}`).join(', ')}))}</p>
                <p>${esc(T('{n} territoires : {l}.', {n: nf(tr?.items.length), l: Object.entries(tk).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${nf(n)} ${TKINDS[k] || k}`).join(', ')}))}</p>
                <p class="muted">${esc(T('Wikidata ne connaît pas tout : beaucoup de territoires n’ont pas de contour (on montre alors un point, « limites inconnues »), et les cartes anciennes sont approximatives.'))}</p></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Licence'))}</th></tr></thead>
                <tbody>${src.map(r => `<tr><td>${link(r[3], r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></div></section>`;
    }
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-cht-tg]'); if (!t || !e.target.matches('input')) return;
        const k = t.dataset.chtTg, before = settings()[k]; save({[k]: e.target.checked});
        A().undoToast?.(e.target.checked ? T('Partie montrée') : T('Partie masquée'), {undo: () => { save({[k]: before}); drawSettings(); }, redo: () => { save({[k]: !before}); drawSettings(); }});
    });
    function register() {
        const tabs = A().defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = ['metiers_rivieres', 'commune_plus', 'histoire', 'meteo'].map(k => tabs.findIndex(t => t[0] === k)).find(j => j >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    /* ─────────── 🧰 les registres communs : listes et données à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, insee: pl.insee || ''} : null);
    const emptyLine = (t, icon = '🏰') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'chateaux_autour', icon: '🏰', label: T('Châteaux de la commune et alentours'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const p = placeOfCtx(ctx.place); const ok = p && await castlesInto(host, p); if (!ok) host.innerHTML = emptyLine(T('Aucun château connu de Wikidata autour de ce lieu (ou le lieu n’est pas placé sur la carte).')); }},
        {id: 'territoire_lieu', icon: '👑', label: T('Dans quel territoire était ce lieu ?'), group: 'Le monde', needs: ['place', 'year'], installed: () => true,
            run: async (ctx, host) => { const p = placeOfCtx(ctx.place); const ok = p && await terrInto(host, p, {year: ctx.year}); if (!ok) host.innerHTML = emptyLine(T('Pas de territoire connu pour ce lieu (ou le lieu n’est pas placé sur la carte).'), '👑'); }},
        {id: 'territoires_annee', icon: '👑', label: T('Les territoires d’une année'), group: 'Le monde', needs: ['year'], installed: () => true,
            run: async (ctx, host) => {
                const c = await loadAllTerr(), y = Number(ctx.year) || 1700, list = c.terr.items.filter(it => active(it, y));
                host.innerHTML = `<p>${esc(T('{n} territoires de Wikidata existaient en {y}.', {n: nf(list.length), y: yr(y)}))}</p><ul class="cht-list">${list.slice(0, 200).map(it => `<li><button type="button" class="link-button" data-cht-terr="${esc(it.q)}">${esc(it.n)}</button> <small class="muted">${esc([TKINDS[it.k], span(it.y0, it.y1)].join(' · '))}</small></li>`).join('')}</ul>`;
            }});
    const L = ext.dataLists = ext.dataLists || [];
    L.push({id: 'chateaux', icon: '🏰', label: 'Châteaux d’Europe', group: 'Le lieu', source: 'Wikidata (CC0 1.0)', sourceUrl: 'https://www.wikidata.org/',
        load: async () => { const idx = await loadIndex(); const files = await Promise.all(Object.keys(idx.countries).map(c => loadCountry(c).catch(() => null))); return files.filter(Boolean).flatMap(f => f.items.map(c => castleRow(c, f.country))); },
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'commune', label: 'Commune', type: 'place'}, {key: 'region', label: 'Département, région', type: 'text'},
            {key: 'country', label: 'Pays', type: 'enum', values: [...new Set(Object.values(COUNTRY))].sort()}, {key: 'type', label: 'Sorte', type: 'enum', values: Object.values(KINDS)},
            {key: 'state', label: 'État', type: 'enum', values: ['debout', 'ruine', 'disparu', 'restauré', 'non précisé']}, {key: 'from', label: 'Construit', type: 'year'}, {key: 'to', label: 'Détruit', type: 'year'},
            {key: 'centuries', label: 'Siècles', type: 'text'}, {key: 'owners', label: 'Propriétaires et seigneurs', type: 'text'}, {key: 'protection', label: 'Protection', type: 'text'},
            {key: 'visit', label: 'Se visite', type: 'enum', values: [T('oui')]}, {key: 'photo', label: 'Photo', type: 'enum', values: [T('oui'), T('non')]},
            {key: 'local', label: 'Nom dans la langue du pays', type: 'text'}, {key: 'wikipedia', label: 'Wikipédia', type: 'url'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}],
        period: r => [r.from, r.to], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openCastle(r)});
    L.push({id: 'territoires', icon: '👑', label: 'Territoires d’autrefois', group: 'Le monde', source: 'Wikidata (CC0 1.0) · contours Wikimedia Commons', sourceUrl: 'https://www.wikidata.org/',
        load: async () => { const c = await loadAllTerr(); return c.terr.items.map(it => terrRow(it, c.terr)); },
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'kind', label: 'Sorte', type: 'enum', values: [...new Set(Object.values(TKINDS))]}, {key: 'from', label: 'Début', type: 'year'}, {key: 'to', label: 'Fin', type: 'year'},
            {key: 'capital', label: 'Capitale', type: 'text'}, {key: 'parent', label: 'Faisait partie de', type: 'text'}, {key: 'before', label: 'Avant', type: 'text'}, {key: 'after', label: 'Après', type: 'text'},
            {key: 'limits', label: 'Limites', type: 'enum', values: [T('contour dessiné'), T('limites inconnues')]}, {key: 'wikipedia', label: 'Wikipédia', type: 'url'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}],
        period: r => [r.from, r.to], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openTerr(r)});

    /* ─────────── 🗺 calques des diagrammes « Cartes » et du dessin vectoriel (heritage-carto-donnees.js) ─────────── */
    const inBox = (b, x0, y0, x1, y1) => !b || !(x1 < b[0] || x0 > b[2] || y1 < b[1] || y0 > b[3]);
    const ringsOf = polys => polys.flatMap(poly => poly.map(r => { const out = []; for (let i = 0; i < r.length; i += 2) out.push([r[i], r[i + 1]]); return out; }));
    const hitQ = (q, ...s) => !q || s.some(x => fold(x).includes(fold(q)));
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        {id: 'cht_territoires', icon: '👑', label: T('Territoires d’autrefois (contours)'), group: 'Le monde', kind: 'areas', needsYear: true,
            source: T('Cartes anciennes historical-basemaps (A. Ourednik, GPL-3.0, approximatives, avant 1816) ; contours Wikimedia Commons ; Wikidata (CC0)'),
            run: async ({q, year, bbox, max = 2000}) => {
                const c = await loadAllTerr(), y = Number(year) || 1700, features = [];
                const sy = snapYear(c.maps, y);
                if (sy != null) for (const f of c.maps.snaps[sy]) { const b = f.sh.box; if (features.length < max && inBox(bbox, b[0], b[1], b[2], b[3]) && hitQ(q, f.n, f.s)) features.push({type: 'area', rings: ringsOf(f.sh.polys()), label: f.n}); }
                for (const s of c.shapes?.shapes || []) { const it = c.terr.byQ.get(s.q), b = s.sh.box; if (it && active(it, y) && features.length < max && inBox(bbox, b[0], b[1], b[2], b[3]) && hitQ(q, it.n)) features.push({type: 'area', rings: ringsOf(s.sh.polys()), label: it.n}); }
                return {features, source: sy != null ? T('Carte de {s} (historical-basemaps, GPL-3.0) · Wikidata (CC0)', {s: yr(sy)}) : T('Wikidata (CC0) · contours Wikimedia Commons')};
            }},
        {id: 'cht_territoires_pts', icon: '👑', label: T('Territoires d’autrefois (centres, limites inconnues)'), group: 'Le monde', kind: 'points', needsYear: true, source: 'Wikidata (CC0)',
            run: async ({q, year, bbox, max = 2000}) => {
                const c = await loadAllTerr(), y = Number(year) || 1700;
                const features = c.terr.items.filter(it => it.la != null && active(it, y) && inBox(bbox, it.lo, it.la, it.lo, it.la) && hitQ(q, it.n, TKINDS[it.k])).slice(0, max).map(it => ({type: 'pt', lat: it.la, lon: it.lo, label: it.n}));
                return {features, source: 'Wikidata (CC0)'};
            }},
        {id: 'cht_chateaux', icon: '🏰', label: T('Châteaux d’Europe'), group: 'Le lieu', kind: 'points', source: 'Wikidata (CC0)',
            run: async ({q, from, to, bbox, max = 3000}) => {
                const idx = await loadIndex();
                const codes = Object.entries(idx.countries).filter(([, c]) => c.box && inBox(bbox, c.box[1], c.box[0], c.box[3], c.box[2])).map(([k]) => k);
                const features = [];
                for (const code of codes) {
                    const f = await loadCountry(code).catch(() => null); if (!f) continue;
                    for (const c of f.items) {
                        if (features.length >= max) break;
                        if (c.la == null || !inBox(bbox, c.lo, c.la, c.lo, c.la) || !hitQ(q, c.n, c.cn, KINDS[c.k])) continue;
                        if (from != null && c.y1 != null && c.y1 < from) continue;
                        if (to != null && c.y0 != null && c.y0 > to) continue;
                        features.push({type: 'pt', lat: c.la, lon: c.lo, label: c.n});
                    }
                }
                return {features, source: 'Wikidata (CC0)'};
            }});

    ext.chateauxTerritoires = {...core, settings, loadIndex, loadCountry, loadTerr, loadShapes, loadMaps, loadAllTerr, castlesAround, castlesInto, terrInto, openCastle, openTerr, decorate, drawSettings,
        openSettings: () => { const st = S(); st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
