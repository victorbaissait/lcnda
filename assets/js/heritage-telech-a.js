/* LCNDA — 🗺 Voir le village tel qu'il était (téléchargements, lot A). Serveur : lib/telech_a.php ; style : assets/css/telech-a.css.
 * Ce qui existait déjà n'est pas refait (docs/telechargements-lot-a.md) : fond « État-major » (toutes les cartes), photos de 1950 côte à côte
 * (heritage-lot10-voir-village.js), carte géologique et roche des communes, cavités (lot 10), rivières (Métiers et rivières), BAN (Plan des adresses).
 * Ici :
 *  ↔ Avant / après : un rideau à faire glisser sur le village — photos 1950-1965 ↔ aujourd'hui, carte d'État-major (1820-1866) ↔ plan
 *    d'aujourd'hui, CORINE 1990 ↔ 2018 (tuiles WMTS de la Géoplateforme, demandées seulement quand on ouvre « ▸ plus »).
 *  🌾 Ce qu'est devenue la terre autour du village : CORINE Land Cover 1990 → 2018 (Copernicus), lu par le serveur autour du lieu, gardé.
 *  🌊 Au bord de la mer : lien vers l'indicateur national de l'érosion côtière (Cerema ; lien seulement).  💧 Les marais de l'intérieur 1990 → 2018.
 *  🗺 Fonds de carte : CORINE 1990, CORINE 2018, cours d'eau (IGN, à superposer), « OpenStreetMap hors ligne » (packs régionaux, Réglages → 🗂 Données).
 * Où : fiche d'un village et monographie (LCNDA_EXT.monographSections), fiche d'une personne (bloc « 🗺 Le village tel qu'il était » : une
 * phrase, le rideau sous « ▸ plus »), 🧰 Données / Tout ce qui le concerne (LCNDA_EXT.dataSources), Listes (LCNDA_EXT.dataLists), menus « Fond »
 * (LCNDA_EXT.mapBackgrounds), Réglages → 🗂 Données (famille « 🗺 Cartes hors ligne ») et Réglages → « 🗺 Le village tel qu'il était ».
 * localStorage « genealogie-telech-a ». Rien ne part sur Internet pour une fiche confidentielle ou une personne vivante ; sinon seules des tuiles
 * d'un lieu public sont demandées. Pour Node : module.exports = le calcul. Essai : tests/test-telech-a.js
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const W = root || {};
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return W.LCNDA_I18N ? W.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const llOf = p => { const lat = num(p?.lat ?? p?.latitude), lon = num(p?.lon ?? p?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const inFrance = ll => !!ll && ll.lat >= 41.2 && ll.lat <= 51.2 && ll.lon >= -5.3 && ll.lon <= 9.7;
    const pct = n => `${String(Math.round(n)).replace('.', ',')} %`;
    const haTxt = h => T('{n} ha', {n: String(Math.round(h)).replace('.', ',')});

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const RAD = Math.PI / 180;
    function tileXY(lat, lon, z) { const n = 2 ** z; return {x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2 * n}; }
    /** les tuiles qui couvrent un cadre W×H centré sur le point : [{x, y, left, top}] */
    function mosaic(lat, lon, z, Wd, H) {
        const t = tileXY(lat, lon, z), px = t.x * 256, py = t.y * 256, out = [];
        for (let x = Math.floor((px - Wd / 2) / 256); x <= Math.floor((px + Wd / 2) / 256); x++) for (let y = Math.floor((py - H / 2) / 256); y <= Math.floor((py + H / 2) / 256); y++) out.push({x, y, left: Math.round(x * 256 - px + Wd / 2), top: Math.round(y * 256 - py + H / 2)});
        return out;
    }
    const CLC_STYLE = 'CORINE Land Cover - France métropolitaine';
    /** les couches de la Géoplateforme (noms lus dans GetCapabilities le 2026-11-25) */
    const LAYERS = {
        avion: {layer: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965', fmt: 'image/png', z: [6, 18], label: 'Photos aériennes 1950-1965 (IGN)'},
        today: {layer: 'HR.ORTHOIMAGERY.ORTHOPHOTOS', fmt: 'image/jpeg', z: [6, 19], label: 'Photos aériennes d’aujourd’hui (IGN)'},
        etatmajor: {layer: 'GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40', fmt: 'image/jpeg', z: [6, 15], label: 'Carte d’État-major (1820-1866, IGN)'},
        plan: {layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', fmt: 'image/png', z: [6, 18], label: 'Plan IGN d’aujourd’hui'},
        clc1990: {layer: 'LANDCOVER.CLC90_FR', fmt: 'image/png', z: [0, 16], style: CLC_STYLE, label: 'CORINE Land Cover 1990'},
        clc2018: {layer: 'LANDCOVER.CLC18_FR', fmt: 'image/png', z: [0, 16], style: CLC_STYLE, label: 'CORINE Land Cover 2018'},
        hydro: {layer: 'HYDROGRAPHY.HYDROGRAPHY', fmt: 'image/png', z: [6, 18], label: 'Cours d’eau et plans d’eau (IGN)'}};
    const wmts = (key, z, x, y) => { const L = LAYERS[key]; return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(L.layer)}&STYLE=${encodeURIComponent(L.style || 'normal')}&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=${encodeURIComponent(L.fmt)}`; };
    /** les rideaux : [avant, après, zoom de départ, zoom max, légende] */
    const PAIRS = {
        avion: ['avion', 'today', 16, 18, ['Vers 1950', 'Aujourd’hui']],
        etatmajor: ['etatmajor', 'plan', 15, 15, ['Vers 1850', 'Aujourd’hui']],
        clc: ['clc1990', 'clc2018', 14, 16, ['1990', '2018']]};
    /** le rideau qui parle à une vie : avant 1920 → la carte de 1850 ; sinon les photos de 1950 */
    const pairFor = (from, to) => (from !== null && from !== undefined && from < 1920 && (to ?? from) < 1945 ? 'etatmajor' : 'avion');

    /** les grands groupes de CORINE (même ordre que le serveur) */
    const GROUPS = {urbain: 'bâti, routes et zones d’activité', carrieres: 'carrières', champs: 'champs', vignes: 'vignes et vergers', pres: 'prés', mosaique: 'petites parcelles mêlées (bocage)',
        bois: 'bois', landes: 'landes et friches', nu: 'plages, rochers, sols nus', marais: 'marais', marais_mer: 'marais et vasières du bord de mer', eau: 'rivières et étangs', mer: 'mer'};
    /**
     * Le récit du paysage : {before: [[groupe, %]], after: [[groupe, %]], changes: [[groupe, avant, après]], stable, marsh: {a, b}|null, coast, quarry}
     * (les groupes de moins de 3 % sont tus ; un changement compte à partir de 3 points)
     */
    function landStory(R) {
        if (!R?.ok || R.empty || !R.years) return null;
        const A = R.years['1990']?.groups || {}, B = R.years['2018']?.groups || {};
        const top = G => Object.entries(G).filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
        const changes = keys.map(k => [k, A[k] || 0, B[k] || 0]).filter(([, a, b]) => Math.abs(b - a) >= 3).sort((x, y) => Math.abs(y[2] - y[1]) - Math.abs(x[2] - x[1])).slice(0, 3);
        const wa = R.years['1990']?.wet_ha || 0, wb = R.years['2018']?.wet_ha || 0;
        return {before: top(A), after: top(B), changes, stable: !changes.length, marsh: wa >= 5 || wb >= 5 ? {a: wa, b: wb} : null, coast: !!R.coast,
            quarry: Math.max(R.years['1990']?.quarry_ha || 0, R.years['2018']?.quarry_ha || 0)};
    }
    const RE_CARRIER = /\b(carrier|carri[èe]re|mineur|tailleur de pierre|perrier|ardoisier|pl[âa]trier|chaufournier|meulier|marbrier|caillouteur)\b/i;
    const core = {tileXY, mosaic, LAYERS, wmts, PAIRS, pairFor, landStory, GROUPS, RE_CARRIER, llOf, inFrance};
    if (!root || !root.document) return core;

    /* ═════════════ l'écran ═════════════ */
    const A = () => W.LCNDA_APP || {};
    // ⚠ la vérification « installé ? » a échoué (serveur) : on le DIT (pas « pas installé » en silence), une fois toutes les 30 s au plus
    const statusErr = e => { const now = Date.now(); if (now - (statusErr.at || 0) < 30000) return; statusErr.at = now; A().toast?.(T('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)}), 'error'); };
    const ext = W.LCNDA_EXT = W.LCNDA_EXT || {};
    const KEY = 'genealogie-telech-a';
    const TAB = ['telech_a', '25ta', '🗺 Le village tel qu’il était'];
    const BLOCK = ['ta_village', '🗺 Le village tel qu’il était'];
    const PARTS = [
        ['avantapres', '↔ Avant / après', 'Un rideau à faire glisser sur le village : photos de 1950 ↔ aujourd’hui, carte de 1850 ↔ aujourd’hui, CORINE 1990 ↔ 2018.'],
        ['paysage', '🌾 Ce qu’est devenue la terre autour', 'Champs, prés, bois, maisons à moins de 1 km, en 1990 et en 2018 (CORINE Land Cover, Copernicus).'],
        ['cote', '🌊 Le bord de mer', 'Pour un village près de la mer : le lien vers l’indicateur national de l’érosion côtière (Cerema).'],
        ['marais', '💧 Les marais', 'Les marais et tourbières à moins de 3 km, en 1990 et en 2018.'],
        ['personne', '👤 Sur la fiche d’une personne', 'Le bloc « 🗺 Le village tel qu’il était » pour le lieu où elle a vécu le plus longtemps.']];
    const settings = () => { let s = {}; try { s = JSON.parse(W.localStorage?.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const saveSettings = s => { try { W.localStorage?.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const on = k => settings()[k] !== false;
    const link = (url, label) => (url ? `${window.LCNDA_UI.extLink(/^\s*(?:javascript|data|vbscript|file):/i.test(String(url)) ? '#' : url, label)}` : esc(label)); // une adresse venue d’un site (Wikidata, loc.gov…) : jamais « javascript: »
    const srcLink = (url, label = T('↗ source')) => (url ? `${window.LCNDA_UI.extLink(url, label, {cls: 'ta-src', title: T('Ouvrir la source (internet)')})}` : '');
    const row = (icon, html, src, extra = '', attrs = '') => `<div class="hist-row ta-row"${attrs}><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, attrs = '') => (html ? `<details class="l10v-more ta-more"${attrs}><summary>${esc(T('▸ plus'))}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const kiosk = () => !!W.document.body?.classList.contains('is-kiosk');

    const URL = {
        clc: 'https://www.statistiques.developpement-durable.gouv.fr/corine-land-cover-0', copernicus: 'https://land.copernicus.eu/en/data-policy',
        ortho: 'https://www.data.gouv.fr/datasets/bd-ortho-r-historique', etatmajor: 'https://www.data.gouv.fr/datasets/scan-historique-etat-major-1-40-000',
        lo: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', inec: 'https://www.data.gouv.fr/datasets/6ad9eb466ec242fe5671d6fc',
        geolittoral: 'https://www.geolittoral.developpement-durable.gouv.fr/telechargement-en-ligne-donnees-geolittoral-a802.html', osm: 'https://www.openstreetmap.org/copyright', geofabrik: 'https://download.geofabrik.de/'};
    const SRC = {
        clc: () => `${link(URL.clc, T('CORINE Land Cover 1990 et 2018 (Union européenne, Copernicus ; SDES)'))} — ${link(URL.copernicus, T('accès libre et gratuit, source citée'))}`,
        avion: () => `${link(URL.ortho, T('IGN, photos aériennes 1950-1965 et d’aujourd’hui'))} (${link(URL.lo, T('Licence Ouverte 2.0'))})`,
        etatmajor: () => `${link(URL.etatmajor, T('IGN, carte d’État-major (1820-1866) et plan IGN'))} (${link(URL.lo, T('Licence Ouverte 2.0'))})`,
        inec: () => `${link(URL.inec, T('Cerema, indicateur national de l’érosion côtière'))} — ${esc(T('CC BY ; lien seulement'))}`};
    const SRC_TXT = {avantapres: 'IGN, Géoplateforme (Licence Ouverte 2.0) ; CORINE Land Cover (Copernicus)', paysage: 'CORINE Land Cover 1990 et 2018 (Copernicus, accès libre et gratuit)'};

    /* ─────────── le serveur (réponses gardées) ─────────── */
    const memo = new Map();
    function ask(action, params) {
        const k = action + JSON.stringify(params);
        if (!memo.has(k)) memo.set(k, A().api(action, params).catch(e => { memo.delete(k); return {ok: false, message: e.message}; }));
        return memo.get(k);
    }

    /* ─────────── ↔ le rideau avant / après ─────────── */
    const SW = 520, SH = 300;
    function swipeTiles(key, ll, z) {
        const L = LAYERS[key], zz = Math.max(L.z[0], Math.min(L.z[1], z));
        // au-delà du zoom de la couche (État-major : 15), on agrandit les tuiles du dernier zoom
        const f = 2 ** (z - zz), tl = mosaic(ll.lat, ll.lon, zz, SW / f, SH / f);
        return tl.map(t => `<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(wmts(key, zz, t.x, t.y))}" style="left:${t.left * f}px;top:${t.top * f}px;width:${256 * f}px;height:${256 * f}px" onerror="this.style.visibility='hidden'">`).join('');
    }
    function swipeHtml(ll, pair = 'avion', z = null, pos = 50) {
        const P = PAIRS[pair] || PAIRS.avion, zoom = z ?? P[2];
        const opts = Object.keys(PAIRS).map(k => `<option value="${k}"${k === pair ? ' selected' : ''}>${esc(T({avion: 'Photos 1950 ↔ aujourd’hui', etatmajor: 'Carte de 1850 ↔ aujourd’hui', clc: 'Occupation du sol 1990 ↔ 2018'}[k]))}</option>`).join('');
        return `<div class="ta-swipe-wrap" data-ta-swipe data-lat="${ll.lat}" data-lon="${ll.lon}" data-pair="${esc(pair)}" data-z="${zoom}">
            <div class="ta-swipe" style="--ta-pos:${pos}%">
                <div class="ta-layer ta-after">${swipeTiles(P[1], ll, zoom)}</div>
                <div class="ta-layer ta-before">${swipeTiles(P[0], ll, zoom)}</div>
                <span class="ta-bar" aria-hidden="true"></span><span class="ta-pin" aria-hidden="true">＋</span>
                <span class="ta-lab ta-lab-a">${esc(T(P[4][0]))}</span><span class="ta-lab ta-lab-b">${esc(T(P[4][1]))}</span>
                <input class="ta-range" type="range" min="0" max="100" value="${pos}" aria-label="${esc(T('Faire glisser le rideau entre avant et après'))}" data-ta-range>
            </div>
            <p class="muted ta-tools"><label>${esc(T('Comparer :'))} <select data-ta-pair>${opts}</select></label>
                <button type="button" class="button small secondary" data-ta-zoom="-1" aria-label="${esc(T('Zoom arrière'))}">−</button> <button type="button" class="button small secondary" data-ta-zoom="1" aria-label="${esc(T('Zoom avant'))}">＋</button>
                ${pair === 'clc' ? legendHtml() : ''}</p>
            <small class="hist-src">${esc(T('Source :'))} ${pair === 'clc' ? SRC.clc() : pair === 'etatmajor' ? SRC.etatmajor() : SRC.avion()}</small></div>`;
    }
    const LEG = [['#e6004d', 'bâti'], ['#ffffa8', 'champs'], ['#e6e64d', 'prés'], ['#ffe64d', 'bocage'], ['#e68000', 'vignes'], ['#00a600', 'bois'], ['#a6f200', 'landes'], ['#a6a6ff', 'marais'], ['#00ccf2', 'eau']];
    const legendHtml = () => `<span class="ta-legend">${LEG.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(T(l))}</span>`).join('')}</span>`;
    function paintSwipe(box, pair, z) { const ll = {lat: Number(box.dataset.lat), lon: Number(box.dataset.lon)}; const pos = Number(box.querySelector('[data-ta-range]')?.value || 50); box.outerHTML = swipeHtml(ll, pair, z, pos); }
    /** la ligne « ↔ » : une phrase ; le rideau sous « ▸ plus » (rien n'est demandé avant l'ouverture) */
    function swipeRow(ll, name, pair = 'avion', lead = '') {
        if (!ll || !inFrance(ll)) return '';
        const txt = lead || T('{c} avant / après : fais glisser le rideau entre la photo de 1950 (ou la carte de 1850) et aujourd’hui.', {c: esc(name || T('Le village'))});
        return row('↔', txt, '', more(`<div data-ta-lazy="${esc(pair)}" data-lat="${ll.lat}" data-lon="${ll.lon}"></div>`, ' data-ta-open'), ' data-ta-part="avantapres"');
    }

    /* ─────────── 🌾 la terre autour ─────────── */
    const gl = ([k, v]) => `${pct(v)} ${esc(T(GROUPS[k] || k))}`;
    const listFr = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${T('et')} ${arr[arr.length - 1]}`);
    function paysageHtml(R, name, opts = {}) {
        const S = landStory(R); if (!S || !S.before.length && !S.after.length) return '';
        const c = esc(name || T('du village'));
        let lead = T('Autour de {c} (1 km), en 1990 : {a}.', {c, a: listFr(S.before.map(gl))});
        if (S.stable) lead += ' ' + esc(T('En 2018, presque rien n’a changé.'));
        else lead += ' ' + T('En 2018 : {l}.', {l: listFr(S.changes.map(([k, a, b]) => T('{g} {verb} ({a} → {b})', {g: esc(T(GROUPS[k] || k)), verb: esc(T(b > a ? 'en hausse' : 'en baisse')), a: pct(a), b: pct(b)})))});
        const tr = (k) => `<tr><td>${esc(T(GROUPS[k] || k))}</td><td>${pct(R.years['1990'].groups[k] || 0)}</td><td>${pct(R.years['2018'].groups[k] || 0)}</td></tr>`;
        const keys = [...new Set([...Object.keys(R.years['1990'].groups || {}), ...Object.keys(R.years['2018'].groups || {})])];
        const table = `<table class="data-table ta-table"><thead><tr><th>${esc(T('à moins de 1 km'))}</th><th>1990</th><th>2018</th></tr></thead><tbody>${keys.map(tr).join('')}</tbody></table>`;
        const extra = more(`${table}${hyp(T('CORINE Land Cover cartographie des surfaces d’au moins 25 ha à partir d’images satellites : c’est le paysage d’ensemble, pas chaque champ. Pour le paysage plus ancien, ouvre le rideau « ↔ Avant / après » (1950, 1850).'))}`);
        let rows = row('🌾', `${lead} ${srcLink(URL.clc)}`, SRC.clc(), extra, ' data-ta-part="paysage"');
        if (S.coast && on('cote')) rows += row('🌊', `${esc(T('Au bord de la mer : le trait de côte a bougé depuis les années 1950. Le Cerema mesure son recul (ou son avancée) tous les 200 m.'))} ${srcLink(URL.geolittoral, T('↗ Géolittoral (télécharger)'))} · ${srcLink(URL.inec, T('↗ la fiche des données'))}`, SRC.inec(), hyp(T('Les données du Cerema ne sont pas reprises dans l’app : aucun service de carte vérifiable, seulement un téléchargement. Compare toi-même la côte avec le rideau 1950 ↔ aujourd’hui.')), ' data-ta-part="cote"');
        if (S.marsh && on('marais')) {
            const d = S.marsh.a - S.marsh.b;
            const t = Math.abs(d) >= 10 ? (d > 0 ? T('Des marais ont disparu autour de {c} : {a} en 1990, {b} en 2018 (à moins de 3 km).', {c, a: haTxt(S.marsh.a), b: haTxt(S.marsh.b)}) : T('Des marais autour de {c} : {a} en 1990, {b} en 2018 (à moins de 3 km).', {c, a: haTxt(S.marsh.a), b: haTxt(S.marsh.b)}))
                : T('{a} de marais ou de tourbières à moins de 3 km de {c}.', {c, a: haTxt(Math.max(S.marsh.a, S.marsh.b))});
            rows += row('💧', t, SRC.clc(), hyp(T('Les marais asséchés plus tôt (XIXᵉ siècle, remembrement) se voient sur la carte d’État-major : ouvre le rideau « carte de 1850 ↔ aujourd’hui ».')), ' data-ta-part="marais"');
        }
        if (opts.carrier && S.quarry > 0) rows += row('⛏', esc(T('Une carrière ou une mine à ciel ouvert à moins de 3 km ({h} d’après CORINE) : un lieu de travail possible.', {h: haTxt(S.quarry)})), SRC.clc(), '', ' data-ta-part="carriere"');
        return rows;
    }

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    async function placeHtml(place, opts = {}) {
        const ll = llOf(place); if (!ll || !inFrance(ll)) return '';
        const out = [];
        if (opts.swipe !== false && on('avantapres')) out.push(swipeRow(ll, place.name, opts.pair || 'avion'));
        if (opts.land !== false && on('paysage')) {
            const R = await ask('telech_a_clc', {lat: ll.lat, lon: ll.lon, name: place.name || '', ...(opts.pid ? {pid: opts.pid} : {}), ...(opts.cachedOnly ? {cached_only: 1} : {})});
            if (R?.private) return '';
            out.push(paysageHtml(R, place.name, opts));
        }
        return out.filter(Boolean).join('');
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]');
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null, country: pli?.dataset.pliCountry || ''};
    }
    const panel = inner => `<section class="maintenance-panel cplus-panel ta-panel"><h3>${esc(T('🗺 Le village tel qu’il était'))}</h3><div class="hist-life ta-life">${inner}</div></section>`;
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'ta_place', host: '[data-ta-host]', icon: '🗺', label: 'Le village tel qu’il était', group: 'Données téléchargées', enabled: () => ['avantapres', 'paysage'].some(on)});
    async function decorate() {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-ta])'); if (!village) return;
        village.dataset.ta = '1';
        if (!['avantapres', 'paysage'].some(on)) return;
        const anchor = village.querySelector('[data-l10v-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="ta-place" data-ta-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        const host = village.querySelector('[data-ta-host]'), where = villagePlace(village);
        // ⏱ le paysage CORINE vient d'Internet (plusieurs secondes, un PHP occupé) : demandé quand la partie arrive à l'écran (app-observateurs.js)
        if (window.LCNDA_PERF?.whenSeen) await new Promise(ok => window.LCNDA_PERF.whenSeen(host, ok));
        if (!host.isConnected) return;
        const html = await placeHtml(where);
        if (host.isConnected) host.innerHTML = html ? panel(html) : '';
    }
    let pending = 0;
    if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }) /* téléchargement coupé (page rechargée) : rien dans la console */; attrScan(); }); }).observe(W.document.documentElement, {childList: true, subtree: true});

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    function homeOf(life) {
        const VV = ext.voirVillage; if (VV?.homeOf) return VV.homeOf(life);
        return (life?.places || []).map(p => ({...p, ll: llOf(p)})).find(p => p.ll && inFrance(p.ll)) || null;
    }
    async function personInto(host, id) {
        let life; try { life = await lifeOf(id); } catch (_) { return 0; }
        const home = homeOf(life); if (!home) { host.innerHTML = ''; return 0; }
        const ll = home.ll || llOf(home), ys = (life.events || []).map(e => num(e.year)).filter(y => y !== null);
        const from = num(life.person?.birth) ?? (ys.length ? Math.min(...ys) : null), to = num(life.person?.death) ?? (ys.length ? Math.max(...ys) : null);
        const carrier = RE_CARRIER.test([...(life.jobs || []).map(j => j.name || j.title || j), life.person?.occupation || ''].join(' '));
        // la réponse du serveur dit si la fiche est confidentielle (ou la personne vivante) : rien ne part alors, pas même une tuile
        const R = on('paysage') ? await ask('telech_a_clc', {lat: ll.lat, lon: ll.lon, name: home.name || '', pid: id}) : await ask('telech_a_clc', {lat: ll.lat, lon: ll.lon, pid: id, cached_only: 1});
        if (R?.private || !host.isConnected) { host.innerHTML = ''; return 0; }
        const pair = pairFor(from, to);
        const lead = pair === 'etatmajor' ? (life.person?.gender === 'female' ? T('{c} comme elle l’a connu : la carte d’État-major (vers 1850) sous le plan d’aujourd’hui, avec un rideau à faire glisser.', {c: esc(home.name)}) : T('{c} comme il l’a connu : la carte d’État-major (vers 1850) sous le plan d’aujourd’hui, avec un rideau à faire glisser.', {c: esc(home.name)}))
            : T('{c} vu d’avion vers 1950 et aujourd’hui, avec un rideau à faire glisser.', {c: esc(home.name)});
        const html = [on('avantapres') ? swipeRow(ll, home.name, pair, lead) : '', on('paysage') ? paysageHtml(R, home.name, {carrier}) : ''].filter(Boolean);
        host.innerHTML = html.length ? `<div class="hist-life ta-life">${html.join('')}</div>` : '';
        return html.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !on('personne') || !['avantapres', 'paysage'].some(on)) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="ta-block" data-ta-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        W.document.querySelectorAll('#workspace [data-ta-person]').forEach(async h => {
            const id = Number(h.dataset.taPerson); lifeMemo.delete(id);
            const n = await personInto(h, id); const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── les clics : rideau (ouverture, glisser, zoom, choix) ─────────── */
    const ZMIN = 12;
    W.document.addEventListener('toggle', e => {
        const d = e.target; if (!d?.matches?.('details[data-ta-open]') || !d.open) return;
        d.querySelectorAll('[data-ta-lazy]').forEach(b => { const ll = {lat: Number(b.dataset.lat), lon: Number(b.dataset.lon)}; b.outerHTML = swipeHtml(ll, b.dataset.taLazy); });
    }, true);
    W.document.addEventListener('input', e => { const r = e.target.closest?.('[data-ta-range]'); if (r) r.closest('.ta-swipe').style.setProperty('--ta-pos', `${r.value}%`); });
    W.document.addEventListener('change', e => {
        const s = e.target.closest?.('[data-ta-pair]');
        if (s) { const b = s.closest('[data-ta-swipe]'); paintSwipe(b, s.value, PAIRS[s.value][2]); return; }
        const t = e.target.closest?.('[data-ta-tg]'); if (!t || !e.target.matches('input')) return;
        const st = settings(), k = t.dataset.taTg, was = st[k]; st[k] = e.target.checked; saveSettings(st);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    W.document.addEventListener('click', e => {
        const z = e.target.closest?.('[data-ta-zoom]');
        if (z) { const b = z.closest('[data-ta-swipe]'), P = PAIRS[b.dataset.pair]; const n = Math.max(ZMIN, Math.min(P[3] + 1, Number(b.dataset.z) + Number(z.dataset.taZoom))); paintSwipe(b, b.dataset.pair, n); return; }
        if (e.target.closest?.('[data-ta-clear]')) clearCache();
    });

    /* ─────────── 📜 Monographie de commune ─────────── */
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'ta_avantapres', icon: '↔', label: T('Avant / après (1850, 1950, aujourd’hui)'), group: 'Le lieu', defaultOn: true, enabled: () => on('avantapres'), source: SRC_TXT.avantapres,
            render: async (place, host) => { const ll = llOf(place); if (!ll || !inFrance(ll)) return false; host.innerHTML = swipeHtml(ll, 'avion'); return true; }},
        {id: 'ta_paysage', icon: '🌾', label: T('Ce qu’est devenue la terre autour (1990 → 2018)'), group: 'Le lieu', defaultOn: true, enabled: () => on('paysage'), source: SRC_TXT.paysage,
            render: async (place, host) => { const html = await placeHtml(place, {swipe: false}); if (!html) return false; host.innerHTML = `<div class="hist-life ta-life">${html}</div>`; return true; }});

    /* ─────────── 🧰 à la demande (Tout ce qui le concerne, Données) ─────────── */
    const ctxPlace = ctx => ctx?.place || (ctx?.person && null);
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'ta_avantapres', icon: '↔', label: T('Le village avant / après (1850, 1950, 1990, aujourd’hui)'), group: 'Le lieu', needs: ['place'], source: SRC_TXT.avantapres,
            run: async (ctx, host) => { const pl = ctxPlace(ctx), ll = llOf(pl); host.innerHTML = ll && inFrance(ll) ? swipeHtml(ll, pairFor(num(ctx?.year), num(ctx?.year))) : `<p class="muted">${esc(T('Seulement pour un lieu de France avec sa position.'))}</p>`; }},
        {id: 'ta_paysage', icon: '🌾', label: T('Ce qu’est devenue la terre autour (CORINE 1990 → 2018)'), group: 'Le lieu', needs: ['place'], source: SRC_TXT.paysage,
            run: async (ctx, host) => { const pl = ctxPlace(ctx); const html = pl ? await placeHtml(pl, {swipe: false, pid: ctx?.person?.id}) : ''; host.innerHTML = html ? `<div class="hist-life ta-life">${html}</div>` : `<p class="muted">${esc(T('Rien à dire pour ce lieu (hors de France, sans position, ou pas de connexion).'))}</p>`; }});

    /* ─────────── 📋 Listes : les lieux déjà regardés ─────────── */
    (ext.dataLists = ext.dataLists || []).push({id: 'ta_paysage', icon: '🌾', label: T('Le paysage autour des lieux déjà regardés (CORINE 1990 → 2018)'), group: 'Le lieu',
        source: 'CORINE Land Cover (Copernicus, accès libre et gratuit)', sourceUrl: URL.clc, enabled: () => on('paysage'),
        load: async () => ((await A().api('telech_a_list', {}).catch(() => ({rows: []})))?.rows || []).map(r => ({...r, coast: r.coast ? T('oui') : '', src: URL.clc})),
        fields: [{key: 'name', label: T('Lieu'), type: 'text'}, {key: 'urbain1990', label: T('Bâti 1990 (%)'), type: 'number'}, {key: 'urbain2018', label: T('Bâti 2018 (%)'), type: 'number'},
            {key: 'agri1990', label: T('Champs et prés 1990 (%)'), type: 'number'}, {key: 'agri2018', label: T('Champs et prés 2018 (%)'), type: 'number'},
            {key: 'bois1990', label: T('Bois 1990 (%)'), type: 'number'}, {key: 'bois2018', label: T('Bois 2018 (%)'), type: 'number'},
            {key: 'marais1990', label: T('Marais 1990 (ha)'), type: 'number'}, {key: 'marais2018', label: T('Marais 2018 (ha)'), type: 'number'}, {key: 'coast', label: T('Bord de mer'), type: 'enum'}, {key: 'at', label: T('Regardé le'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
        geo: r => (r.lat != null && r.lon != null ? [r.lat, r.lon] : null)});

    /* ─────────── 🗺 les fonds de carte ─────────── */
    const OSM_KEY = 'ta_osm_offline';
    ext.mapBackgrounds = ext.mapBackgrounds || {};
    ext.mapBackgrounds.ta_clc1990 = {label: 'CORINE Land Cover 1990 (occupation du sol)', url: (z, x, y) => (z <= 16 ? wmts('clc1990', z, x, y) : '')};
    ext.mapBackgrounds.ta_clc2018 = {label: 'CORINE Land Cover 2018 (occupation du sol)', url: (z, x, y) => (z <= 16 ? wmts('clc2018', z, x, y) : '')};
    ext.mapBackgrounds.ta_hydro = {label: 'Cours d’eau et plans d’eau (IGN, à superposer)', overlay: true, url: (z, x, y) => (z >= 6 && z <= 18 ? wmts('hydro', z, x, y) : '')};
    ext.mapBackgrounds[OSM_KEY] = {label: 'OpenStreetMap hors ligne (packs régionaux)', url: (z, x, y) => `api.php?action=telech_a_osm_tile&z=${z}&x=${x}&y=${y}`};
    ext.tileCategories = ext.tileCategories || [];
    if (!ext.tileCategories.some(c => c.id === 'telech_a')) ext.tileCategories.push({id: 'telech_a', label: 'Le village tel qu’il était (Copernicus, IGN, OSM hors ligne)',
        items: [['ta_clc1990', 'CORINE Land Cover 1990'], ['ta_clc2018', 'CORINE Land Cover 2018'], ['ta_hydro', 'Cours d’eau (IGN, à superposer)'], [OSM_KEY, 'OpenStreetMap hors ligne']]});
    /* l'attribution exacte sur chaque carte qui montre ces fonds */
    const ATTR = [[/action=telech_a_osm_tile/, () => `${link(URL.osm, T('© les contributeurs d’OpenStreetMap (ODbL)'))} · ${link('https://openmaptiles.org/schema/', 'OpenMapTiles (CC BY 4.0)')}`],
        [/LAYER=LANDCOVER\.CLC/, () => `${link(URL.clc, T('CORINE Land Cover — UE, Copernicus (SDES)'))}`]];
    let attrT = 0;
    function attrScan() {
        if (attrT) return; attrT = setTimeout(() => {
            attrT = 0;
            W.document.querySelectorAll('img[src*="telech_a_osm_tile"], img[src*="LANDCOVER.CLC"]').forEach(img => {
                const host = img.closest('.map-stage') || img.parentElement?.parentElement; if (!host || host.closest('.ta-swipe')) return;
                const html = ATTR.filter(([re]) => host.querySelector(`img[src]`) && [...host.querySelectorAll('img[src]')].some(i => re.test(i.getAttribute('src')))).map(([, f]) => f()).join(' · ');
                let el = host.querySelector(':scope > .ta-attr');
                if (!el) { if (getComputedStyle(host).position === 'static') return; el = W.document.createElement('div'); el.className = 'ta-attr'; host.appendChild(el); }
                if (el.dataset.k !== html) { el.innerHTML = html; el.dataset.k = html; }
            });
        }, 300);
    }

    /* ─────────── 🗂 Réglages → Données : les packs OSM hors ligne ─────────── */
    const FAMILY = {id: 'telech_a_osm', icon: '🗺', theme: 'Lieux et histoire', tab: TAB[0], status: 'telech_a_osm_status', info: 'telech_a_osm_dl_info', pre: 'telech_a_osm', finish: 'telech_a_osm_pack_finish', body: k => ({key: k}), multi: true,
        source: 'OpenStreetMap (extraits Geofabrik, tuiles tilemaker)', licence: 'ODbL 1.0 — © les contributeurs d’OpenStreetMap', url: URL.osm,
        installed: (s, k) => !!s?.packs?.[k], built: (s, k) => s?.packs?.[k]?.built || '', size: (s, k) => s?.packs?.[k]?.size || 0, online: (i, k) => i?.packs?.[k],
        itemsOf: (s, i) => {
            const keys = [...new Set([...Object.keys(s?.packs || {}), ...(s?.wanted || []), ...Object.keys(i?.packs || {}).filter(k => (s?.wanted || []).includes(k) || s?.packs?.[k])])];
            const label = k => s?.packs?.[k]?.label || i?.packs?.[k]?.label || s?.regions?.[k] || k;
            return keys.map(k => ({k, name: T('Carte hors ligne · {r}', {r: label(k)}), what: T('OpenStreetMap sans Internet : routes, chemins, rivières, bois, maisons, noms des lieux')}));
        }};
    function registerFamily() {
        const L = ext.listesMaj; if (!L || !Array.isArray(L.families)) return false;
        if (!L.families.some(f => f.id === FAMILY.id)) L.families.push(FAMILY);
        return true;
    }
    if (!registerFamily()) W.document.addEventListener('DOMContentLoaded', () => { if (!registerFamily()) setTimeout(registerFamily, 800); }, {once: true});

    /* ─────────── ⚙️ Réglages → « 🗺 Le village tel qu'il était » ─────────── */
    async function clearCache() {
        const post = a => A().api(a, {}, {method: 'POST', body: {}}).then(r => r?.result || r).catch(e => ({error: e.message}));
        const r = await post('telech_a_cache_clear'); memo.clear();
        if (r?.error) { A().toast?.(r.error, 'error'); return; }
        const msg = T('{n} réponses gardées oubliées.', {n: r?.removed ?? 0});
        if (A().undoToast) A().undoToast(msg, {undo: async () => { await post('telech_a_cache_restore'); memo.clear(); }, redo: async () => { await post('telech_a_cache_clear'); memo.clear(); }, icon: '🗑'}); else A().toast?.(msg, 'success');
    }
    async function drawSettings(token) {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        let about = null, st = null; try { [about, st] = await Promise.all([A().api('telech_a_about'), A().api('telech_a_osm_status')]); } catch (e) { statusErr(e); }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (token === undefined && !ws.querySelector('[data-ta-settings]')) return; // ré-affichage seulement si la page est encore ouverte
        const s = settings();
        const tg = p => `<label class="checkbox-line cplus-tg" data-ta-tg="${p[0]}"><input type="checkbox"${s[p[0]] ? ' checked' : ''}${kiosk() ? ' disabled' : ''}><span><b>${esc(T(p[1]))}</b><br><small class="muted">${esc(T(p[2]))}</small></span></label>`;
        const packs = Object.entries(st?.packs || {});
        const src = (about?.sources || []).map(x => `<tr><td>${esc(T(x.label))}</td><td>${link(x.licence_url, T(x.licence))}</td><td>${esc(T(x.how))}</td><td>${srcLink(x.url)}</td></tr>`).join('');
        const head = W.LCNDA_UI?.pageHeader ? W.LCNDA_UI.pageHeader({title: T('Le village tel qu’il était'), icon: '🗺', where: T('Réglages · Données'), help: esc(T('Avant / après sur le village (1850, 1950, aujourd’hui), ce qu’est devenue la terre autour (1990 → 2018) et les cartes OpenStreetMap sans Internet.'))}) : `<h2>${esc(T('🗺 Le village tel qu’il était'))}</h2>`;
        ws.innerHTML = `<section class="page cplus-settings ta-settings" data-ta-settings>${head}<div class="maintenance-grid">
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’un village, dans la monographie de commune et sur la fiche d’une personne. Rien n’est demandé pour une fiche confidentielle ou une personne vivante.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('🗺 Cartes OpenStreetMap hors ligne'))}</h3><p>${packs.length ? esc(T('Installées : {l}.', {l: packs.map(([, p]) => p.label).join(', ')})) : esc(T('Aucune région installée.'))} ${esc(T('Choisis le fond « OpenStreetMap hors ligne » dans le menu « Fond » d’une carte.'))}</p>
                <p><button type="button" class="button small" data-ta-goto-donnees>🗂 ${esc(T('Télécharger une région (Réglages → Données)'))}</button></p><small class="muted">${esc(T('© les contributeurs d’OpenStreetMap, ODbL 1.0. Packs fabriqués par un atelier GitHub (extraits Geofabrik, tilemaker).'))} ${srcLink(URL.osm)}</small></div>
            <div class="maintenance-panel"><h3>${esc(T('Réponses gardées sur l’ordinateur'))}</h3><p><button type="button" class="button small secondary" data-ta-clear>${esc(T('🗑 Effacer les réponses gardées'))}</button></p></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><p class="muted">${esc(T('Licences lues le {d} sur la page officielle de chaque source.', {d: about?.read || ''}))}</p><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Comment'))}</th><th></th></tr></thead><tbody>${src}</tbody></table></div></div></div></section>`;
    }
    W.document.addEventListener('click', e => {
        if (!e.target.closest?.('[data-ta-goto-donnees]')) return;
        const st = A().state; if (!st) return; st.maintenanceTab = 'donnees_installees'; A().persistUiState?.(); A().setModule?.('maintenance');
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs; if (!Array.isArray(tabs)) return false;
        if (!tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'lot10_voir_village'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        // le bloc de fiche : juste après « 🖼️ Son village comme il le voyait » (lot 10), sinon après le monde autour
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { let i = B.findIndex(b => b[0] === 'l10v_village'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, [...BLOCK]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '12';
        return true;
    }
    if (!register()) W.document.addEventListener('DOMContentLoaded', () => { if (!register()) setTimeout(register, 600); }, {once: true});

    ext.telechA = {...core, settings, on, swipeHtml, swipeRow, paysageHtml, placeHtml, personInto, drawSettings, FAMILY, registerFamily,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
    return ext.telechA;
});
