/**
 * 🧭 La boussole de son époque · 🗞️ Ce jour-là dans le monde · 📍 Les anciens noms des rues
 * (serveur : lib/boussole_rues.php ; style : assets/css/boussole-rues.css ; données : assets/data/br-*.json.gz,
 *  refaites par scripts/boussole-rues/build-boussole-rues.py)
 *  1. 🧭 la déclinaison magnétique d'un lieu une année donnée, calculée ici : modèle gufm1 (Jackson, Jonkers et Walker, 2000)
 *     de 1590 à 1890, passage en douceur de 1890 à 1900 (comme l'« IGRF+ » du NOAA), puis IGRF-14 (1900-2030).
 *     « En 1810 à Tulle, l'aiguille de la boussole pointait à 22° à l'ouest du vrai nord. » — fiche de personne, fiche d'un
 *     village, monographie, onglet « 🧭 Boussole » du convertisseur d'autrefois, et « 🧭 Nord magnétique de [année] » dans
 *     l'éditeur de cartes (mode Plan : la rose des vents tourne).
 *  2. 🗞️ ce jour-là dans le monde : Wikipédia en français (pages « Février 1852 », « 12 février », « 1852 en France »),
 *     lu en ligne à la demande et gardé — « Le jour de son mariage (12 février 1852) : … ».
 *  3. 📍 les anciens noms des rues de Paris (Ville de Paris, nomenclature officielle, ODbL) : « Sa rue s'appelait passage
 *     Ornano jusqu'en 1965 » — fiche de personne, plan des adresses d'une commune (Paris), liste « 📍 Rues de Paris renommées ».
 * Tout se règle dans Réglages → « 🧭 Boussole, jours et rues » (localStorage « genealogie-boussole-rues »).
 * Registres communs : LCNDA_EXT.personBlocks, .autrefoisTabs, .monographSections, .dataSources, .dataLists.
 *   window.LCNDA_EXT.boussoleRues = {declination, …}   (Node : module.exports, les calculs seulement)
 * Essai : tests/test-boussole-rues.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ 🧭 le calcul du champ magnétique (sans écran : aussi pour Node) ═════════════ */
    const RAD = Math.PI / 180, A_KM = 6371.2;
    const GUFM_FROM = 1590, BLEND_FROM = 1890, IGRF_FROM = 1900;
    /** B-splines cubiques de gufm1 (même calcul que gufm.f, interv + bspline, de Boor) : les coefficients de Gauss à la date t, en nT */
    function gufmAt(G, t) {
        const kn = G.knots, nspl = G.nspl, n = G.lmax * (G.lmax + 2);
        if (!(t >= kn[3] && t <= kn[nspl])) return null;
        const tk = i => kn[i - 1]; // indices à partir de 1, comme le Fortran
        let nleft = 0;
        for (let i = 5; i <= nspl + 1; i++) if (t <= tk(i)) { nleft = i - 1; break; }
        if (!nleft) return null;
        const spl = [0, 1, 0, 0, 0], dl = [0, 0, 0, 0, 0], dr = [0, 0, 0, 0, 0];
        for (let j = 1; j <= 3; j++) {
            dr[j] = tk(nleft + j) - t; dl[j] = t - tk(nleft + 1 - j);
            let saved = 0;
            for (let i = 1; i <= j; i++) { const term = spl[i] / (dr[i] + dl[j + 1 - i]); spl[i] = saved + dr[i] * term; saved = dl[j + 1 - i] * term; }
            spl[j + 1] = saved;
        }
        const g = new Float64Array(n);
        for (let j = 1; j <= 4; j++) {
            const row = G.spl[j + nleft - 4 - 1], w = spl[j] / 10; // le fichier est en dixièmes de nT
            for (let k = 0; k < n; k++) g[k] += w * row[k];
        }
        return g;
    }
    /** IGRF : interpolation linéaire entre deux époques (tous les 5 ans), puis la variation séculaire après la dernière */
    function igrfAt(I, t) {
        const E = I.epochs, last = E.length - 1;
        if (t < E[0] || t > (I.sv_to || E[last] + 5)) return null;
        if (t >= E[last]) return I.g[last].map((v, k) => v + I.sv[k] * (t - E[last]));
        let i = Math.min(last - 1, Math.floor((t - E[0]) / (E[1] - E[0])));
        while (i > 0 && E[i] > t) i--;
        const w = (t - E[i]) / (E[i + 1] - E[i]);
        return I.g[i].map((v, k) => v + (I.g[i + 1][k] - v) * w);
    }
    /** les coefficients d'une date : {g, nmax, model} ou null (avant 1590, après 2030) */
    function coeffsAt(G, I, t) {
        if (t < GUFM_FROM) return null;
        if (t < BLEND_FROM) { const g = G && gufmAt(G, t); return g ? {g, nmax: G.lmax, model: 'gufm1'} : null; }
        if (t < IGRF_FROM) {
            const a = G && gufmAt(G, t), b = I && I.g[0]; if (!a || !b) return null;
            const w = (t - BLEND_FROM) / (IGRF_FROM - BLEND_FROM), g = new Float64Array(a.length);
            for (let k = 0; k < a.length; k++) g[k] = a[k] * (1 - w) + (k < b.length ? b[k] : 0) * w;
            return {g, nmax: G.lmax, model: 'gufm1+IGRF'};
        }
        const g = I && igrfAt(I, t); return g ? {g, nmax: I.nmax, model: 'IGRF-14'} : null;
    }
    /** du géodésique (WGS84, comme gufm.f « coords ») au géocentrique : [colatitude (rad), rayon (km), sin, cos de l'écart] */
    function geocentric(latDeg, altKm) {
        const b1 = 40680925, b2 = 40408585, lat = latDeg * RAD, clat = Math.cos(lat), slat = Math.sin(lat);
        const one = b1 * clat * clat, two = b2 * slat * slat, three = one + two, four = Math.sqrt(three);
        const r = Math.sqrt(altKm * (altKm + 2 * four) + (b1 * one + b2 * two) / three);
        const cd = (altKm + four) / r, sd = (b1 - b2) / four * slat * clat / r;
        const sinth = slat * cd - clat * sd, costh = clat * cd + slat * sd;
        return [Math.PI / 2 - Math.atan2(sinth, costh), r, sd, cd];
    }
    /** X (nord), Y (est), Z (bas) en nT, D (déclinaison, degrés, positive vers l'est), I (inclinaison) */
    function fieldAt(g, nmax, latDeg, lonDeg, altKm = 0) {
        const [theta, r, sd, cd] = geocentric(latDeg, altKm), phi = lonDeg * RAD;
        const ct = Math.cos(theta), st = Math.max(1e-10, Math.sin(theta));
        const P = [], dP = [];
        for (let n = 0; n <= nmax; n++) { P.push(new Float64Array(n + 1)); dP.push(new Float64Array(n + 1)); }
        P[0][0] = 1; dP[0][0] = 0;
        for (let n = 1; n <= nmax; n++) {
            for (let m = 0; m <= n; m++) {
                if (n === m) {
                    if (n === 1) { P[1][1] = st; dP[1][1] = ct; }
                    else { const k = Math.sqrt((2 * n - 1) / (2 * n)); P[n][n] = k * st * P[n - 1][n - 1]; dP[n][n] = k * (st * dP[n - 1][n - 1] + ct * P[n - 1][n - 1]); }
                } else {
                    const a = Math.sqrt(n * n - m * m), b = n >= 2 && m <= n - 2 ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
                    const p2 = n >= 2 && m <= n - 2 ? P[n - 2][m] : 0, d2 = n >= 2 && m <= n - 2 ? dP[n - 2][m] : 0;
                    P[n][m] = ((2 * n - 1) * ct * P[n - 1][m] - b * p2) / a;
                    dP[n][m] = ((2 * n - 1) * (ct * dP[n - 1][m] - st * P[n - 1][m]) - b * d2) / a;
                }
            }
        }
        let X = 0, Y = 0, Z = 0, k = 0;
        for (let n = 1; n <= nmax; n++) {
            const bb = Math.pow(A_KM / r, n + 2);
            for (let m = 0; m <= n; m++) {
                const gnm = g[k++] || 0, hnm = m ? (g[k++] || 0) : 0;
                const c = Math.cos(m * phi), s = Math.sin(m * phi);
                X += bb * (gnm * c + hnm * s) * dP[n][m];
                Y += bb * m * (gnm * s - hnm * c) * P[n][m] / st;
                Z -= bb * (n + 1) * (gnm * c + hnm * s) * P[n][m];
            }
        }
        const xs = X; X = X * cd + Z * sd; Z = Z * cd - xs * sd; // retour au géodésique
        const H = Math.hypot(X, Y);
        return {X, Y, Z, H, F: Math.hypot(H, Z), D: Math.atan2(Y, X) / RAD, I: Math.atan2(Z, H) / RAD};
    }
    /** 🧭 la déclinaison : {d (degrés, + = est), model, year} ou null */
    function declination(G, I, lat, lon, year) {
        const y = Number(year), la = Number(lat), lo = Number(lon);
        if (!Number.isFinite(y) || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 89.9) return null;
        const c = coeffsAt(G, I, y + (Number.isInteger(y) ? 0.5 : 0)); // une année entière : son milieu
        if (!c) return null;
        const f = fieldAt(c.g, c.nmax, la, lo, 0);
        return {d: f.D, inc: f.I, model: c.model, year: y};
    }
    const DECL_RANGE = {from: GUFM_FROM, to: 2030};
    const round = d => Math.round(Math.abs(d));
    /** « 22° à l'ouest », « 3° à l'est », « presque exactement vers le vrai nord » */
    function declText(d) {
        if (Math.abs(d) < 0.5) return T('presque exactement vers le vrai nord');
        return T(d < 0 ? '{n}° à l’ouest du vrai nord' : '{n}° à l’est du vrai nord', {n: String(round(d))});
    }
    function declSentence(r, place) {
        if (!r) return '';
        const where = place ? T('à {lieu}', {lieu: place}) : '';
        return Math.abs(r.d) < 0.5 ? T('En {y} {where}, l’aiguille de la boussole pointait presque exactement vers le vrai nord.', {y: String(Math.floor(r.year)), where}).replace(/\s+,/, ',').replace(/\s{2,}/g, ' ')
            : T('En {y} {where}, l’aiguille de la boussole pointait à {n}° {dir} du vrai nord.', {y: String(Math.floor(r.year)), where, n: String(round(r.d)), dir: r.d < 0 ? T('à l’ouest') : T('à l’est')}).replace(/\s+,/, ',').replace(/\s{2,}/g, ' ');
    }

    /* ═════════════ 📍 les rues (sans écran : aussi pour Node) ═════════════ */
    const ABBR = {r: 'rue', av: 'avenue', bd: 'boulevard', bld: 'boulevard', boul: 'boulevard', pl: 'place', imp: 'impasse', pass: 'passage', fg: 'faubourg', fbg: 'faubourg', faub: 'faubourg',
        st: 'saint', ste: 'sainte', sq: 'square', all: 'allee', ch: 'chemin', crs: 'cours', gd: 'grand', gde: 'grande'};
    const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'et']);
    const fold = s => String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
    /** « R. de la Paix » = « rue Paix » (même clé que scripts/boussole-rues/build-boussole-rues.py) */
    function streetKey(s) {
        const w = fold(s).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
        return w.map((x, i) => (ABBR[x] && (i === 0 || ['st', 'ste', 'gd', 'gde', 'fg', 'fbg', 'faub'].includes(x)) ? ABBR[x] : x)).filter(x => !STOP.has(x)).join(' ');
    }
    const STREET_WORDS = /^(rue|ruelle|avenue|boulevard|place|impasse|passage|quai|cours|chemin|cite|villa|square|allee|faubourg|carrefour|pont|port|galerie|sentier|cul de sac|chaussee|route|porte|parvis|promenade|esplanade|rond point|cour|hameau|barriere|marche|enclos|clos|petite rue|grande rue|vieille rue|r|av|bd|bld|boul|pl|imp|pass|fg|fbg|faub|sq|all|ch|crs)\b/;
    /** « 12 bis, rue de la Paix, Paris 2e » → {house: '12 bis', street: 'rue de la Paix', arr: 2} ; null si on n'y voit pas de rue */
    function parseAddress(text) {
        let s = String(text || '').replace(/\s+/g, ' ').trim();
        if (!s) return null;
        let arr = 0;
        const am = fold(s).match(/\bparis\s*(?:,\s*)?(\d{1,2})\s*(?:e|eme|er|ème)?\b|\b(\d{1,2})(?:e|eme|er)\s+arr/);
        if (am) arr = Number(am[1] || am[2]) || 0;
        const parts = s.split(/\s*[,;]\s*/);
        let carry = '';
        for (let p of parts) {
            if (/^\d+\s*(?:bis|ter|quater|[a-d])?\.?$/i.test(p)) { carry = p.replace(/\s+/g, ' ').replace(/\.$/, '').trim(); continue; } // « 12 bis, rue … »
            const hm = p.match(/^(\d+\s*(?:bis|ter|quater|[a-d])?)\s*,?\s+(.+)$/i);
            let house = carry; carry = '';
            if (hm) { house = hm[1].replace(/\s+/g, ' ').trim(); p = hm[2]; }
            const f = fold(p).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (STREET_WORDS.test(f)) return {house, street: p.replace(/\.$/, '').trim(), arr};
        }
        return null;
    }
    const isParisText = s => /\bparis\b/.test(fold(s));
    /** un événement est-il à Paris ? (lieu « Paris », code INSEE 75056 ou 751xx, ou l'adresse dit « Paris ») */
    function inParis(e) {
        const insee = String(e?.insee || '');
        if (/^751\d\d$/.test(insee) || insee === '75056') return true;
        const name = fold(e?.place || e?.place_name || '');
        if (/^paris\b/.test(name) && !/\b(texas|tennessee|illinois|kentucky|ontario|arkansas|idaho|missouri|maine)\b/.test(name)) return true;
        return isParisText(e?.address) && !/\b(texas|tennessee|illinois|kentucky|ontario)\b/.test(fold(e?.address));
    }
    /** l'index des rues de Paris (une fois) */
    function prepareParis(P) {
        if (P._k) return P;
        P._k = new Map(); P._o = new Map(); P._to = new Map();
        P.streets.forEach((s, i) => { const k = streetKey(s.n); if (!P._k.has(k)) P._k.set(k, []); P._k.get(k).push(i); });
        P.old.forEach((o, i) => {
            const k = streetKey(o.n); if (!P._o.has(k)) P._o.set(k, []); P._o.get(k).push(i);
            if (o.to != null) { if (!P._to.has(o.to)) P._to.set(o.to, []); P._to.get(o.to).push(i); }
        });
        return P;
    }
    const yearOf = d => (/^\d{4}/.test(d || '') ? Number(String(d).slice(0, 4)) : 0);
    const arrMatch = (a, arr) => !arr || !a || String(a).split(',').map(Number).includes(Number(arr));
    /**
     * le nom d'une rue de Paris à une date : {kind, street, ...} ou null
     *  - 'renamed' : la rue d'aujourd'hui avait un autre nom cette année-là (« s'appelait passage Ornano jusqu'en 1965 ») ;
     *  - 'old'     : le nom écrit est un ancien nom (« s'appelle aujourd'hui rue X ») ;
     *  - 'named'   : rue d'aujourd'hui, nommée après cette année-là sans ancien nom connu (« ce nom date de 1930 », avec l'historique) ;
     *  - 'same'    : rue d'aujourd'hui, déjà ce nom (rien à dire : pas de ligne).
     */
    function parisStreetAt(P, street, year, arr = 0) {
        prepareParis(P);
        const k = streetKey(street); if (!k) return null;
        const y = Number(year) || 0;
        const cur = (P._k.get(k) || []).map(i => [i, P.streets[i]]);
        const pick = list => list.find(([, s]) => arrMatch(s.a, arr)) || list[0];
        if (cur.length) {
            const [i, s] = pick(cur);
            const named = yearOf(s.d);
            const olds = (P._to.get(i) || []).map(j => P.old[j]).filter(o => !o.part && yearOf(o.d));
            if (y) {
                // l'ancien nom de cette année-là : celui qui a cessé le plus tôt après elle
                const before = olds.filter(o => yearOf(o.d) > y).sort((a, b) => yearOf(a.d) - yearOf(b.d))[0];
                if (before) return {kind: 'renamed', street: s, index: i, old: before, until: yearOf(before.d)};
                if (named && named > y) return {kind: 'named', street: s, index: i, since: named};
            }
            return {kind: 'same', street: s, index: i, since: named || 0, olds};
        }
        const old = (P._o.get(k) || []).map(j => P.old[j]).filter(o => arrMatch(o.a, arr));
        const o = old.find(x => x.to != null) || old[0];
        if (!o) return null;
        const now = o.to != null ? P.streets[o.to] : null;
        return {kind: 'old', old: o, street: now, index: o.to, until: yearOf(o.d), part: !!o.part, stillThen: !!(y && yearOf(o.d) && y < yearOf(o.d))};
    }
    const parisUrl = (P, which, name) => `${which === 'old' ? P.url_old : P.url_cur}table/?q=${encodeURIComponent(`"${name}"`)}`;

    const core = {gufmAt, igrfAt, coeffsAt, fieldAt, declination, declText, declSentence, DECL_RANGE, streetKey, parseAddress, inParis, prepareParis, parisStreetAt, parisUrl, fold};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════════════════════════ l'écran ═════════════════════════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-boussole-rues';
    const TAB = ['boussole_rues', '25k7', '🧭 Boussole, jours et rues'];
    const PARTS = [
        ['jour', '🗞️ Ce jour-là dans le monde', 'Fiche de personne : ce qui s’est passé dans le monde le jour de sa naissance, de son mariage, de son décès (Wikipédia, en ligne).'],
        ['boussole', '🧭 La boussole de son époque', 'Fiche de personne, fiche d’un village et monographie : de combien l’aiguille de la boussole s’écartait du vrai nord.'],
        ['rues', '📍 Les anciens noms des rues', 'Fiche de personne et plan des adresses : le nom qu’avait sa rue à l’époque (Paris).']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    const fmtDate = ts => { try { return new Date(ts * 1000).toLocaleDateString('fr-FR'); } catch (_) { return ''; } };
    const wait = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const more = (inner, n) => `<details class="cplus-more br-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const srcLine = inner => `<p class="cplus-src br-src">${inner}</p>`;
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayLabel = iso => { const [y, m, d] = String(iso).split('-').map(Number); return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`; };
    const placeShort = s => String(s || '').replace(/\s*[,(].*$/, '').trim();

    /* ─────────── les fichiers livrés (chargés une fois, à la demande) ─────────── */
    const files = {};
    async function readGz(url) {
        const r = await fetch(url, {credentials: 'same-origin'});
        if (!r.ok) throw new Error(T('Fichier introuvable : {f}', {f: url.split('?')[0]}));
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf)); // déjà décompressé en route
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ce fichier.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const load = name => (files[name] ||= readGz(`assets/data/br-${name}.json.gz?v=1`).catch(e => { delete files[name]; throw e; }));
    const loadField = () => Promise.all([load('gufm1'), load('igrf')]);
    const loadParis = () => load('paris').then(prepareParis);
    async function decl(lat, lon, year) { const [G, I] = await loadField(); return declination(G, I, lat, lon, year); }

    /* ─────────── 🧭 les phrases et la source ─────────── */
    const FIELD_SRC = () => srcLine(`${esc(T('Calcul fait ici avec le modèle gufm1 (Jackson, Jonkers et Walker, 2000 : bâti sur les relevés des marins et des observatoires — plus de 83 000 mesures rien qu’avant 1800 —, 1590-1990) puis l’IGRF-14 (depuis 1900). Précision : environ un demi-degré à un degré avant 1800.'))} ${esc(T('gufm1 : aucun texte de licence trouvé ; modèle diffusé librement par ses auteurs, retiré sur simple demande.'))}
        ${link('https://doi.org/10.1098/rsta.2000.0569', T('gufm1 ↗'))} · ${link('https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field', T('IGRF ↗'))} · ${link('https://www.ngdc.noaa.gov/geomag/faqgeom.shtml', T('NOAA : modèles historiques ↗'))}`);
    const WHY = () => T('Le nord de la boussole (le nord magnétique) n’est pas le vrai nord (le pôle) : l’écart change d’un lieu à l’autre et d’un siècle à l’autre, parce que le champ magnétique de la Terre bouge lentement.');
    function needle(d, size = 46) {
        const a = Math.max(-60, Math.min(60, d));
        return `<svg class="br-needle" viewBox="-25 -25 50 50" width="${size}" height="${size}" role="img" aria-label="${esc(declText(d))}"><circle r="23" class="br-n-ring"/><line x1="0" y1="-21" x2="0" y2="21" class="br-n-true"/><text x="0" y="-13.5" class="br-n-n">N</text>
            <g transform="rotate(${a.toFixed(1)})"><path d="M0 -19 L3.5 0 L-3.5 0Z" class="br-n-north"/><path d="M0 19 L3.5 0 L-3.5 0Z" class="br-n-south"/></g><circle r="2" class="br-n-pin"/></svg>`;
    }
    /** un bloc « 🧭 » pour une liste de [lieu, année, lat, lon] : la première phrase, les autres dans ▸ plus */
    async function compassHtml(points, {lead = true} = {}) {
        const rows = [];
        for (const p of points) { const r = await decl(p.lat, p.lon, p.year); if (r) rows.push({...p, r}); }
        if (!rows.length) return '';
        const [first, ...rest] = rows;
        const line = x => `<li>${needle(x.r.d, 26)} <span>${esc(declSentence(x.r, x.place))}${x.what ? ` <small class="muted">(${esc(x.what)})</small>` : ''}</span></li>`;
        return `<div class="br-compass">${needle(first.r.d)}<div><p class="cplus-lead">🧭 ${esc(declSentence(first.r, first.place))}</p>${lead ? `<p class="br-why">${esc(WHY())}</p>` : ''}</div></div>
            ${rest.length ? more(`<ul class="br-list">${rest.map(line).join('')}</ul>`, rest.length) : ''}${FIELD_SRC()}`;
    }
    /** le lieu à travers les siècles (fiche d'un village, monographie) */
    async function placeCompassHtml(pl) {
        const lat = Number(pl.lat ?? pl.latitude), lon = Number(pl.lon ?? pl.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return '';
        const now = new Date().getFullYear(), ys = [1600, 1650, 1700, 1750, 1800, 1850, 1900, 1950, 2000, now];
        const rows = []; for (const y of ys) { const r = await decl(lat, lon, y); if (r) rows.push(r); }
        if (!rows.length) return '';
        const max = rows.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a));
        const name = placeShort(pl.name);
        const lead = T('À {lieu}, l’aiguille de la boussole pointait à {a} en {y1}, à {b} en {y2}, et aujourd’hui à {c}.', {lieu: name, a: declText(rows[0].d), y1: String(rows[0].year), b: declText(max.d), y2: String(max.year), c: declText(rows.at(-1).d)});
        return `<div class="br-compass">${needle(rows.at(-1).d)}<div><p class="cplus-lead">🧭 ${esc(lead)}</p><p class="br-why">${esc(WHY())}</p></div></div>
            ${more(`<table class="data-table br-table"><thead><tr><th>${esc(T('Année'))}</th><th>${esc(T('Écart de la boussole'))}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.year)}</td><td>${needle(r.d, 22)} ${esc(declText(r.d))}</td></tr>`).join('')}</tbody></table>`)}${FIELD_SRC()}`;
    }

    /* ─────────── 🗞️ ce jour-là ─────────── */
    const memo = new Map();
    window.addEventListener('lcnda:data-changed', () => memo.clear()); // une fiche modifiée (date, lieu, lien…) : ses blocs sont redemandés, pas repris de la mémoire
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }
    const EV_LEAD = {BIRT: 'Le jour de sa naissance ({d})', CHR: 'Le jour de son baptême ({d})', BAPM: 'Le jour de son baptême ({d})', MARR: 'Le jour de son mariage ({d})', DEAT: 'Le jour de son décès ({d})', BURI: 'Le jour de son inhumation ({d})'};
    const itemText = it => `${it.t}${it.subs?.length ? ` ${it.subs.slice(0, 3).join(' ; ')}` : ''}`.replace(/\s+/g, ' ').trim();
    const cutText = (s, n = 260) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);
    function wpSource(r) {
        const pages = (r.sources || []).filter((s, i, a) => a.findIndex(x => x.title === s.title) === i);
        const when = pages[0]?.fetched_at ? ` · ${esc(pages[0].stale ? T('hors ligne : réponse gardée du {d}', {d: fmtDate(pages[0].fetched_at)}) : pages[0].cached ? T('gardé sur l’ordinateur le {d}', {d: fmtDate(pages[0].fetched_at)}) : T('lu en ligne le {d}', {d: fmtDate(pages[0].fetched_at)}))}` : '';
        return srcLine(`${esc(T('Source : Wikipédia en français, les contributeurs —'))} ${pages.map(s => `${link(s.url, `« ${s.title} » ↗`)} (${link(s.history_url, T('historique'))})`).join(', ')} — ${link(r.licence_url || 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', r.licence || 'CC BY-SA 4.0')}${when}`);
    }
    const itemLi = it => `<li>${esc(cutText(itemText(it), 420))} <small>${link(it.url, it.from === 'france' ? T('{p} ↗', {p: it.page}) : T('{p}, {s} ↗', {p: it.page, s: it.section}))}</small></li>`;
    /** le bloc d'un jour : {html, has} ; lead = « Le jour de son mariage (12 février 1852) » ou rien */
    function dayHtml(r, lead = '') {
        if (!r?.ok) return '';
        const day = r.day || [], month = r.month || [];
        if (!day.length && !month.length) return '';
        const head = lead || T('Le {d}', {d: r.label});
        if (day.length) {
            const [f, ...rest] = day;
            return `<p class="cplus-lead">🗞️ ${esc(head)} : ${esc(cutText(itemText(f)))} <small>${link(f.url, T('↗ source'))}</small></p>
                ${rest.length || month.length ? more(`${rest.length ? `<ul class="br-list">${rest.map(itemLi).join('')}</ul>` : ''}${month.length ? `<h5>${esc(T('Le même mois ({m})', {m: r.month_label}))}</h5><ul class="br-list">${month.slice(0, 8).map(itemLi).join('')}</ul>` : ''}`, rest.length + Math.min(8, month.length)) : ''}`;
        }
        const [f, ...rest] = month;
        return `<p class="cplus-lead">🗞️ ${esc(T('{lead} — rien de noté ce jour-là, mais ce mois-là ({m}) : {t}', {lead: head, m: r.month_label, t: cutText(itemText(f))}))} <small>${link(f.url, T('↗ source'))}</small></p>
            ${rest.length ? more(`<ul class="br-list">${rest.slice(0, 8).map(itemLi).join('')}</ul>`, Math.min(8, rest.length)) : ''}`;
    }
    const offline = what => `<p class="cplus-off">📴 ${esc(T('Pas de connexion à Internet : {what} s’afficheront quand tu seras connecté.', {what}))}</p>`;

    /* ─────────── 📍 les rues ─────────── */
    function parisLine(P, x, ev) {
        const r = x.r, srcCur = s => link(parisUrl(P, 'cur', s.n), T('↗ source')), srcOld = o => link(parisUrl(P, 'old', o.n), T('↗ source'));
        const when = ev.year ? T('en {y}', {y: String(ev.year)}) : '';
        if (r.kind === 'renamed') return {lead: T('Sa rue ({rue}, Paris) s’appelait {old} jusqu’en {y}.', {rue: r.street.n, old: r.old.n, y: String(r.until)}), src: srcOld(r.old), detail: r.old.h, detail2: r.street.h};
        if (r.kind === 'old' && r.street) return {lead: r.part ? T('Sa rue ({old}, Paris) fait aujourd’hui partie de {now}{y}.', {old: r.old.n, now: r.street.n, y: r.until ? T(' (changement en {y})', {y: String(r.until)}) : ''}) : T('Sa rue ({old}, Paris) s’appelle aujourd’hui {now}{y}.', {old: r.old.n, now: r.street.n, y: r.until ? T(' (depuis {y})', {y: String(r.until)}) : ''}), src: srcOld(r.old), detail: r.old.h, detail2: r.street.h};
        if (r.kind === 'old') return {lead: T('Sa rue ({old}, Paris) n’existe plus sous ce nom : {h}', {old: r.old.n, h: r.old.h || T('voir la nomenclature de Paris')}), src: srcOld(r.old)};
        if (r.kind === 'named' && r.street.h) return {lead: T('Sa rue ({rue}, Paris) n’avait pas encore ce nom {when} : il date de {y}.', {rue: r.street.n, when, y: String(r.since)}), src: srcCur(r.street), detail: r.street.h};
        return null;
    }
    async function ruesHtml(events) {
        const items = [];
        for (const e of events) {
            const a = parseAddress(e.address) || (e.address ? null : parseAddress(e.place));
            if (!a || !inParis(e)) continue;
            items.push({e, a});
        }
        if (!items.length) return '';
        let P; try { P = await loadParis(); } catch (_) { return ''; }
        const lines = [], seen = new Set();
        for (const {e, a} of items) {
            const r = parisStreetAt(P, a.street, e.year, a.arr);
            if (!r) continue;
            const l = parisLine(P, {r}, e); if (!l) continue;
            if (seen.has(l.lead)) continue; seen.add(l.lead);
            lines.push({...l, ev: e, a});
        }
        if (!lines.length) return '';
        const li = l => `<li><span>📍 ${esc(l.lead)} ${l.src}</span>${l.detail || l.detail2 ? `<small class="muted">${esc([l.detail, l.detail2].filter(Boolean).join(' — '))}</small>` : ''}<small class="muted">${esc(T('{t}, {y} : « {adr} »', {t: l.ev.type || '', y: String(l.ev.year || ''), adr: [l.a.house, l.a.street].filter(Boolean).join(' ')}))}</small></li>`;
        const [f, ...rest] = lines;
        return `<p class="cplus-lead">📍 ${esc(f.lead)} ${f.src}</p>${more(`<ul class="br-list br-rues">${[f, ...rest].map(li).join('')}</ul>`, rest.length || '')}
            ${srcLine(`${esc(T('Source :'))} ${link(P.url_old, T('Ville de Paris, nomenclature officielle des voies (dénominations actuelles et caduques)'))} — ${link(P.licence_url, P.licence)}`)}`;
    }

    /* ═════════ la fiche d'une personne : un bloc « 🧭 Ses jours, sa boussole, ses rues » ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    const anyPart = () => PARTS.some(p => on(p[0]));
    ext.personBlocks.boussole_rues = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !anyPart()) return '';
        return A().card(index, T('🧭 Ses grands jours, sa boussole, ses rues'), '', `<div class="br-block" data-br-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    const MAIN = ['BIRT', 'CHR', 'BAPM', 'MARR', 'DEAT', 'BURI'];
    async function fillPerson(host, id, only = null) {
        const want = k => (only ? only.includes(k) : on(k));
        const r = await ask('br_person', {id});
        if (!host.isConnected || !r?.ok) return r;
        const evs = r.events || [];
        const out = [];
        if (want('jour')) {
            // naissance (ou baptême), mariages, décès (ou inhumation), au jour près
            const pick = [], has = t => pick.some(e => e.tag === t);
            for (const e of evs) {
                if (!e.date || !MAIN.includes(e.tag)) continue;
                if ((e.tag === 'CHR' || e.tag === 'BAPM') && (has('BIRT') || evs.some(x => x.tag === 'BIRT' && x.date))) continue;
                if (e.tag === 'BURI' && evs.some(x => x.tag === 'DEAT' && x.date)) continue;
                if (pick.some(x => x.date === e.date)) continue;
                pick.push(e);
            }
            if (pick.length) out.push(`<div class="cc-line br-line" data-br-line="jour" data-br-dates="${esc(JSON.stringify(pick.slice(0, 5).map(e => [e.date, e.tag])))}" hidden></div>`);
        }
        if (want('boussole')) {
            const pts = [], seen = new Set();
            for (const e of evs) {
                if (e.lat == null || !e.year || e.year < DECL_RANGE.from || e.year > DECL_RANGE.to) continue;
                const k = `${e.place_id || e.place}|${Math.round(e.year / 10)}`; if (seen.has(k)) continue; seen.add(k);
                pts.push({lat: e.lat, lon: e.lon, year: e.year, place: placeShort(e.place), what: e.type});
            }
            const birth = pts.findIndex(p => evs.some(e => e.tag === 'BIRT' && e.year === p.year));
            if (birth > 0) pts.unshift(...pts.splice(birth, 1));
            if (pts.length) { const html = await compassHtml(pts.slice(0, 8)); if (html) out.push(`<div class="cc-line br-line" data-br-line="boussole">${html}</div>`); }
        }
        if (want('rues')) { const html = await ruesHtml(evs); if (html) out.push(`<div class="cc-line br-line" data-br-line="rues">${html}</div>`); }
        if (!host.isConnected) return r;
        host.innerHTML = out.join('');
        const card = host.closest('section.card');
        const show = () => { if (card && host.querySelector('.br-line:not([hidden])')) card.hidden = false; };
        show();
        const jb = host.querySelector('[data-br-line="jour"]');
        if (jb) {
            let dates = []; try { dates = JSON.parse(jb.dataset.brDates || '[]'); } catch (_) {}
            const parts = []; let off = false;
            for (const [date, tag] of dates) {
                const d = await ask('br_day', {date});
                if (d?.offline) { off = true; continue; }
                const h = dayHtml(d, T(EV_LEAD[tag] || 'Le {d}', {d: dayLabel(date)}));
                if (h) parts.push({h, d});
            }
            if (!jb.isConnected) return r;
            if (parts.length) { jb.innerHTML = parts.map(p => `<div class="br-day">${p.h}</div>`).join('') + wpSource({...parts[0].d, sources: parts.flatMap(p => p.d.sources || [])}); jb.hidden = false; show(); }
            else if (off && dates.length) { jb.innerHTML = offline(T('les événements du monde de ses grands jours')); jb.hidden = false; show(); }
            else jb.remove();
        }
        return r;
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-br-person]').forEach(h => fillPerson(h, Number(h.dataset.brPerson))); });

    /* ═════════ la fiche d'un village : « 🧭 La boussole à travers le temps » ═════════ */
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]');
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null};
    }
    async function decorateVillage() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-br])'); if (!village) return;
        village.dataset.br = '1';
        if (!on('boussole')) return;
        const pl = villagePlace(village); if (pl.lat == null || pl.lon == null) return;
        const html = await placeCompassHtml(pl).catch(() => ''); if (!html || !village.isConnected) return;
        const anchor = village.querySelector('[data-cc-host]') || village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = `<section class="maintenance-panel cplus-panel br-panel" data-br-place><h3>${esc(T('🧭 La boussole à travers le temps'))}</h3>${html}</section>`;
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
    }

    /* ═════════ 🪙 Convertisseur d'autrefois → onglet « 🧭 Boussole » ═════════ */
    const PREF = 'genealogie-boussole-rues-convert';
    const pref = () => { try { return {lat: '48.8566', lon: '2.3522', year: '1810', name: 'Paris', ...(JSON.parse(localStorage.getItem(PREF) || '{}') || {})}; } catch (_) { return {lat: '48.8566', lon: '2.3522', year: '1810', name: 'Paris'}; } };
    const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...p})); } catch (_) {} };
    const numIn = s => Number(String(s ?? '').replace(',', '.').trim());
    async function mountCompass(pane, {year = ''} = {}) {
        const st = pref(); if (year && /^\d{3,4}$/.test(String(year).trim())) st.year = String(year).trim();
        let places = [];
        try { places = (await ask('br_places', {})).places || []; } catch (_) {}
        if (!pane.isConnected) return;
        pane.innerHTML = `<div class="af-fields">
                <label class="af-field"><span>${esc(T('Le lieu'))}</span><select data-br-pl><option value="">${esc(T('— une position à la main —'))}</option>${places.slice(0, 1500).map(p => `<option value="${p.id}" ${String(p.id) === String(st.pid || '') ? 'selected' : ''}>${esc(placeShort(p.name))}${p.county ? ` (${esc(p.county)})` : ''}</option>`).join('')}</select></label>
                <label class="af-field"><span>${esc(T('Latitude'))}</span><input type="text" inputmode="decimal" data-br-lat value="${esc(st.lat)}"></label>
                <label class="af-field"><span>${esc(T('Longitude'))}</span><input type="text" inputmode="decimal" data-br-lon value="${esc(st.lon)}"></label>
                <label class="af-field af-year"><span>${esc(T('L’année'))}</span><input type="number" min="${DECL_RANGE.from}" max="${DECL_RANGE.to}" data-br-year value="${esc(st.year)}"></label></div>
            <p class="af-examples">${esc(T('Exemples :'))} ${[['Paris', 48.8566, 2.3522, 1660], ['Paris', 48.8566, 2.3522, 1814], ['Tulle', 45.2667, 1.7667, 1810], ['Brest', 48.39, -4.486, 1750], ['Strasbourg', 48.5734, 7.7521, 1900]].map(([n, la, lo, y]) => `<button type="button" class="link-button" data-br-ex="${esc([n, la, lo, y].join('~'))}">${esc(`${n} ${T('en')} ${y}`)}</button>`).join(' · ')}</p>
            <div class="af-out" data-br-out aria-live="polite"></div>`;
        const $ = s => pane.querySelector(s);
        let name = st.name || '';
        async function draw() {
            const lat = numIn($('[data-br-lat]').value), lon = numIn($('[data-br-lon]').value), y = Number($('[data-br-year]').value), out = $('[data-br-out]');
            setPref({lat: $('[data-br-lat]').value, lon: $('[data-br-lon]').value, year: $('[data-br-year]').value, name, pid: $('[data-br-pl]').value});
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 89.9 || Math.abs(lon) > 180) { out.innerHTML = emptyLine(T('Choisis un lieu, ou écris sa latitude et sa longitude (exemple : 48,85 et 2,35).'), '🧭'); return; }
            if (!(y >= DECL_RANGE.from && y <= DECL_RANGE.to)) { out.innerHTML = emptyLine(T('Écris une année entre {a} et {b}.', {a: String(DECL_RANGE.from), b: String(DECL_RANGE.to)}), '🧭'); return; }
            let r; try { r = await decl(lat, lon, y); } catch (e) { out.innerHTML = emptyLine(e.message, '⚠️'); return; }
            if (!r) { out.innerHTML = emptyLine(T('Pas de calcul possible pour cette année.'), '🧭'); return; }
            const now = await decl(lat, lon, new Date().getFullYear());
            out.innerHTML = `<div class="af-big br-big">${needle(r.d, 64)}<div><small>${esc(T('Écart de la boussole'))}</small><strong>${esc(declText(r.d))}</strong>
                <small>${esc(T('{v}° exactement ({m})', {v: r.d.toFixed(1).replace('.', ','), m: r.model}))}</small></div></div>
                <p class="cplus-lead">🧭 ${esc(declSentence(r, name))}</p><p class="br-why">${esc(WHY())}</p>
                ${now ? `<p class="muted">${esc(T('Aujourd’hui au même endroit : {x}.', {x: declText(now.d)}))}</p>` : ''}
                <p class="muted">${esc(T('Sur un plan ancien orienté avec une boussole, le nord dessiné est le nord magnétique : pour le caler sur une carte d’aujourd’hui, tourne-le de {n}° dans le sens {sens}.', {n: String(round(r.d)), sens: r.d < 0 ? T('des aiguilles d’une montre') : T('inverse des aiguilles d’une montre')}))}</p>${FIELD_SRC()}`;
        }
        pane.addEventListener('input', e => { if (e.target.matches('[data-br-lat], [data-br-lon], [data-br-year]')) { if (!e.target.matches('[data-br-year]')) { $('[data-br-pl]').value = ''; name = ''; } draw(); } });
        pane.addEventListener('change', e => {
            if (!e.target.matches('[data-br-pl]')) return;
            const p = places.find(x => String(x.id) === e.target.value); if (!p) return;
            $('[data-br-lat]').value = String(p.lat); $('[data-br-lon]').value = String(p.lon); name = placeShort(p.name);
            if (p.y0 && !$('[data-br-year]').value) $('[data-br-year]').value = String(p.y0);
            draw();
        });
        pane.addEventListener('click', e => {
            const x = e.target.closest('[data-br-ex]'); if (!x) return;
            const [n, la, lo, y] = x.dataset.brEx.split('~');
            $('[data-br-lat]').value = la; $('[data-br-lon]').value = lo; $('[data-br-year]').value = y; $('[data-br-pl]').value = ''; name = n; draw();
        });
        draw();
    }
    ext.autrefoisTabs = ext.autrefoisTabs || [];
    if (!ext.autrefoisTabs.some(t => t.id === 'boussole')) ext.autrefoisTabs.push({id: 'boussole', label: T('🧭 Boussole'), mount: mountCompass});

    /* ═════════ 🗺️ éditeur de cartes (mode Plan) : « 🧭 Nord magnétique de [année] » ═════════ */
    // crochet posé sur ext.vectorMap.attach (heritage-vector-map.js) : un bouton dans l'onglet Plan, qui tourne la rose des vents
    function hookVectorMap() {
        const VM = ext.vectorMap; if (!VM?.attach || VM.attach._br) return !!VM;
        const orig = VM.attach;
        VM.attach = function (ed) {
            const mp = orig.apply(this, arguments); if (!mp) return mp;
            const ph = mp.paneHtml, pe = mp.onPaneEvent;
            const center = () => { const m = ed.doc()?.map || {}; const g = m.geo || m.bm || null; const lat = Number(g?.lat), lon = Number(g?.lon); return Number.isFinite(lat) && Number.isFinite(lon) ? {lat, lon, name: g.name || m.bm?.name || ''} : null; };
            mp.paneHtml = () => {
                const h = ph(); const m = ed.doc()?.map || {};
                if (!m.on || !on('boussole')) return h;
                const c = center();
                const box = `<div class="vx-row br-vm"><button type="button" class="button small secondary" data-vm-cmd="br_north" ${c ? '' : 'disabled'} title="${esc(c ? T('Tourne la rose des vents vers le nord de la boussole de l’année choisie (calcul gufm1 / IGRF)') : T('Situe d’abord la carte (🗺️ Fond de carte d’un lieu…) : le calcul a besoin du lieu.'))}">${esc(T('🧭 Tourner la rose des vents : nord magnétique de…'))}</button></div>`;
                return h.replace(/<\/div>\s*$/, `${box}</div>`);
            };
            mp.onPaneEvent = e => {
                const b = e.type === 'click' && e.target.closest?.('[data-vm-cmd="br_north"]');
                if (b) { northDialog(ed, center()); return true; }
                return pe(e);
            };
            return mp;
        };
        VM.attach._br = true;
        return true;
    }
    function northDialog(ed, c) {
        if (!c) return A().toast?.(T('Situe d’abord la carte (🗺️ Fond de carte d’un lieu…) : le calcul a besoin du lieu.'), 'error');
        const y0 = ed.doc()?.map?.year || 1800;
        const run = async year => {
            const r = await decl(c.lat, c.lon, year);
            if (!r) return A().toast?.(T('Écris une année entre {a} et {b}.', {a: String(DECL_RANGE.from), b: String(DECL_RANGE.to)}), 'error');
            const d = ed.doc(); d.objs = d.objs || [];
            const all = []; const walk = arr => (arr || []).forEach(o => { if (o.type === 'mdeco' && o.map?.k === 'compass') all.push(o); if (o.children) walk(o.children); }); walk(d.objs);
            const before = all.map(o => [o, o.rot]);
            let added = null;
            if (all.length) all.forEach(o => { o.rot = Math.round(r.d * 10) / 10; o.map.note = T('Nord magnétique de {y} ({x})', {y: String(year), x: declText(r.d)}); });
            else { added = {id: ed.uid(), type: 'mdeco', name: T('Rose des vents (nord magnétique de {y})', {y: String(year)}), x: d.w - 150, y: 30, w: 120, h: 120, rot: Math.round(r.d * 10) / 10, map: {k: 'compass', note: T('Nord magnétique de {y} ({x})', {y: String(year), x: declText(r.d)})}}; d.objs.push(added); }
            ed.commit(T('Rose des vents : nord magnétique de {y}', {y: String(year)}));
            const undo = () => { if (added) { const i = d.objs.indexOf(added); if (i >= 0) d.objs.splice(i, 1); } before.forEach(([o, rot]) => { if (rot == null) delete o.rot; else o.rot = rot; }); ed.commit(T('Rose des vents remise comme avant')); };
            A().undoToast ? A().undoToast(T('Rose des vents tournée : en {y}, la boussole pointait à {x}.', {y: String(year), x: declText(r.d)}), {undo, icon: '🧭'}) : A().toast?.(T('Rose des vents tournée.'));
        };
        if (!ext.openDialog) { const y = Number(prompt(T('Quelle année ?'), String(y0))); if (y) run(y); return; }
        ext.openDialog({eyebrow: '🧭 ' + T('Boussole'), title: T('Le nord magnétique de quelle année ?'), submitLabel: T('Tourner la rose des vents'),
            body: `<p class="muted">${esc(T('Les plans anciens étaient souvent orientés à la boussole : leur nord est le nord magnétique de l’époque. La rose des vents de ta carte tourne de l’écart calculé pour ce lieu ({lieu}).', {lieu: c.name || `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`}))}</p>
                <div class="form-grid"><label>${esc(T('Année'))}<input type="number" name="y" min="${DECL_RANGE.from}" max="${DECL_RANGE.to}" value="${esc(y0)}"></label></div>`,
            onSubmit: f => { const y = Number(f.querySelector('[name=y]').value); if (!(y >= DECL_RANGE.from && y <= DECL_RANGE.to)) return false; setTimeout(() => run(y), 0); return true; }});
    }

    /* ═════════ 🗺️ plan des adresses d'une commune (Paris) : l'ancien nom officiel des rues ═════════ */
    function hookAddrMap() {
        if (!ext.addrMap || ext.addrMap._br) return !!ext.addrMap;
        const orig = ext.addrMap;
        ext.addrMap = function (box, o = {}) { try { if (box) box.dataset.brInsee = String(o.insee || ''); } catch (_) {} return orig.apply(this, arguments); };
        ext.addrMap._br = true;
        return true;
    }
    async function decorateAddrMap() {
        if (!on('rues')) return;
        const sides = [...document.querySelectorAll('[data-br-insee^="75"] .h-am-side')];
        if (!sides.length) return;
        let P; try { P = await loadParis(); } catch (_) { return; }
        for (const side of sides) {
            side.querySelectorAll('.h-am-st > h4:not([data-br-done])').forEach(h => {
                h.dataset.brDone = '1';
                const name = (h.firstChild?.textContent || '').trim(); if (!name) return;
                const r = parisStreetAt(P, name, 0);
                if (!r) return;
                let txt = '';
                if (r.kind === 'old' && r.street) txt = T('aujourd’hui {now}{y}', {now: r.street.n, y: r.until ? T(' (depuis {y})', {y: String(r.until)}) : ''});
                else if (r.kind === 'same' && r.olds?.length) { const o = r.olds.slice().sort((a, b) => yearOf(b.d) - yearOf(a.d))[0]; txt = T('avant {y} : {old}', {y: String(yearOf(o.d)), old: o.n}); }
                else if (r.kind === 'same' && r.since) txt = T('ce nom depuis {y}', {y: String(r.since)});
                if (!txt) return;
                h.insertAdjacentHTML('beforeend', ` <small class="h-rc-chip br-chip" title="${esc(T('Nomenclature officielle des voies de Paris (Ville de Paris, ODbL)'))}">🏛 ${esc(txt)}</small>`);
            });
        }
    }

    let pending = 0;
    new MutationObserver(() => {
        if (pending) return;
        pending = requestAnimationFrame(() => { pending = 0; try { hookVectorMap(); hookAddrMap(); decorateVillage(); decorateAddrMap(); } catch (e) { console.error(e); } });
    }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ 📜 Monographie de commune ═════════ */
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'br_boussole', icon: '🧭', label: T('La boussole à travers le temps'), group: 'Le lieu', defaultOn: true, enabled: () => on('boussole'),
            source: T('Calcul gufm1 (Jackson et al., 2000) et IGRF-14'),
            render: async (place, host) => { const html = await placeCompassHtml({name: place?.name, lat: place?.latitude ?? place?.lat, lon: place?.longitude ?? place?.lon}).catch(() => ''); host.innerHTML = html; return !!html; }});

    /* ═════════ 🧰 à la demande : le registre commun des données ═════════ */
    const personId = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    const ctxPlace = pl => (pl ? {name: pl.name || pl.place_name || pl.title || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    async function runDay(ctx, host) {
        let date = String(ctx.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const y = Number(ctx.year) || 1850;
            host.innerHTML = `<div class="form-grid br-ask"><label>${esc(T('Quel jour ?'))}<input type="date" data-br-askdate value="${String(y).padStart(4, '0')}-01-01"></label><button type="button" class="button small" data-br-askgo>${esc(T('Voir ce jour-là'))}</button></div><div data-br-askout></div>`;
            host.querySelector('[data-br-askgo]').addEventListener('click', () => { const v = host.querySelector('[data-br-askdate]').value; if (v) showDay(v, host.querySelector('[data-br-askout]')); });
            return null;
        }
        return showDay(date, host);
    }
    async function showDay(date, host) {
        host.innerHTML = wait(T('On lit Wikipédia…'));
        const r = await ask('br_day', {date});
        if (!host.isConnected) return r;
        if (r?.offline) { host.innerHTML = offline(T('les événements de ce jour-là')); return r; }
        const h = dayHtml(r);
        host.innerHTML = h ? `<div class="br-block">${h}${wpSource(r)}</div>` : emptyLine(r?.message || T('Wikipédia ne note rien ce jour-là ni ce mois-là.'), '🗞️');
        return r;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'br_boussole', icon: '🧭', label: T('La boussole de son époque (écart du nord magnétique)'), group: 'Le lieu', needs: ['place', 'year'], installed: () => true,
            run: async (ctx, host) => {
                const pl = ctxPlace(ctx.place); if (!pl || pl.lat == null) { host.innerHTML = emptyLine(T('Choisis un lieu placé sur la carte.'), '📍'); return null; }
                const y = Number(ctx.year);
                const html = y ? await compassHtml([{lat: pl.lat, lon: pl.lon, year: y, place: placeShort(pl.name)}]) : await placeCompassHtml(pl);
                host.innerHTML = html ? `<div class="br-block">${html}</div>` : emptyLine(T('Pas de calcul possible (avant 1590 ou après 2030).'), '🧭');
                return true;
            }},
        {id: 'br_jour', icon: '🗞️', label: T('Ce jour-là dans le monde'), group: 'Le monde', needs: ['year'], online: true, run: runDay},
        {id: 'br_personne', icon: '🧭', label: T('Ses grands jours, sa boussole, ses rues'), group: 'La personne', needs: ['person'], online: true,
            run: async (ctx, host) => { const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; } host.innerHTML = '<div class="br-block"></div>'; const r = await fillPerson(host.firstElementChild, id, ['jour', 'boussole', 'rues']); if (!host.textContent.trim()) host.innerHTML = emptyLine(T('Rien à montrer : il faut des dates au jour près, des lieux placés sur la carte ou des adresses à Paris.'), '🧭'); return r; }});

    /* ═════════ 🧰 Listes → « 📍 Rues de Paris renommées » ═════════ */
    async function parisRows() {
        const P = await loadParis();
        const rows = [];
        P.old.forEach(o => {
            const s = o.to != null ? P.streets[o.to] : null, y = yearOf(o.d);
            rows.push({old: o.n, now: s ? s.n : '', how: o.part ? T('partie de') : s ? T('renommée') : T('disparue ou sans suite connue'), year: y || null, arr: (o.a || s?.a || '').split(',').filter(Boolean).map(a => `${a}${a === '1' ? 'er' : 'e'}`).join(', '),
                city: 'Paris', hist: o.h, lat: s?.p?.[0] ?? null, lon: s?.p?.[1] ?? null, url: parisUrl(P, 'old', o.n)});
        });
        return rows;
    }
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'br_rues_paris', icon: '📍', label: T('Rues de Paris renommées (anciens noms)'), group: 'Le lieu', source: T('Ville de Paris, nomenclature officielle des voies (ODbL)'), sourceUrl: 'https://opendata.paris.fr/explore/dataset/denominations-des-voies-caduques/', enabled: () => on('rues'),
            load: parisRows,
            fields: [{key: 'old', label: T('Ancien nom'), type: 'text'}, {key: 'now', label: T('Nom d’aujourd’hui'), type: 'text'}, {key: 'how', label: T('Changement'), type: 'enum', values: [T('renommée'), T('partie de'), T('disparue ou sans suite connue')]},
                {key: 'year', label: T('Année du changement'), type: 'year'}, {key: 'arr', label: T('Arrondissement'), type: 'text'}, {key: 'city', label: T('Ville'), type: 'enum', values: ['Paris']},
                {key: 'hist', label: T('Historique (Ville de Paris)'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}],
            period: r => [null, r.year || null], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => { if (r.url) window.open(r.url, '_blank', 'noopener'); }});

    /* ═════════ Réglages → 🧭 Boussole, jours et rues ═════════ */
    async function clearCache() {
        try {
            const res = await post('br_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('br_cache_restore', {token: res.token}); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {cache: {count: 0, bytes: 0}, sizes: {}};
        try { about = await api('br_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-br-settings]')) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-br-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const sz = about.sizes || {};
        const rows = [
            [link('https://doi.org/10.1098/rsta.2000.0569', 'gufm1 — Jackson, Jonkers et Walker (2000)'), T('Le champ magnétique de 1590 à 1990 (relevés des marins et des observatoires)'), T('dans l’app ({s})', {s: fmtSize(sz.gufm1 || 38000)}), T('modèle publié, fichier diffusé librement par les auteurs') + ' — ' + T('aucun texte de licence trouvé : retiré sur simple demande des auteurs'), T('Jackson et al., Phil. Trans. R. Soc. A 358 (2000)')],
            [link('https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field', 'IGRF-14 (IAGA)'), T('Le champ magnétique depuis 1900'), T('dans l’app ({s})', {s: fmtSize(sz.igrf || 7000)}), T('données publiques (NOAA NCEI)'), 'IAGA, IGRF-14'],
            [link('https://opendata.paris.fr/explore/dataset/denominations-des-voies-caduques/', T('Ville de Paris — nomenclature des voies')), T('Rues de Paris : nom, date du nom, anciens noms'), T('dans l’app ({s})', {s: fmtSize(sz.paris || 800000)}), 'ODbL 1.0', T('Ville de Paris')],
            [link('https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia', T('Wikipédia en français, en ligne')), T('Les événements d’un jour, d’un mois, d’une année'), T('en ligne, gardé'), 'CC BY-SA 4.0', T('les contributeurs de Wikipédia, lien vers la page')]];
        ws.innerHTML = `<section class="page cplus-settings br-settings" data-br-settings>${UI().pageHeader ? UI().pageHeader({title: T('Boussole, jours et rues'), icon: '🧭', where: T('Réglages · Données'), help: esc(T('L’écart de la boussole à l’époque, ce qui s’est passé dans le monde ses grands jours, et le nom qu’avait sa rue.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les pages Wikipédia lues pour « Ce jour-là » : {n} gardées ({k} Ko).', {n: about.cache?.count || 0, k: Math.max(1, Math.round((about.cache?.bytes || 0) / 1024))}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-br-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td>${i ? esc(c) : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : seulement la date (le titre d’une page Wikipédia, par exemple « 12 février »), jamais un nom. La boussole et les rues se calculent ici, sans Internet.'))}</p>
                <p class="muted">${esc(T('Les anciens noms de rues ne sont connus que pour Paris : Lyon et Bordeaux publient seulement les noms d’aujourd’hui.'))}</p></div></section>`;
    }
    document.addEventListener('click', e => { if (e.target.closest?.('[data-br-clear]')) clearCache(); });
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-br-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.brTg] = e.target.checked; save(s); memo.clear(); } });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'commune_culture'); if (i < 0) i = tabs.findIndex(t => t[0] === 'meteo'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'boussole_rues')) {
            // dans la zone « contexte » de la fiche, après « 🏷️ Son nom et ses villages » et ses voisins
            const after = ['commune_culture', 'mr_metier', 'histoire', 'cplus_newspapers', 'world'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['boussole_rues', '🧭 Ses grands jours, sa boussole, ses rues']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.boussole_rues ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.boussoleRues = {...core, settings, load, decl, compassHtml, placeCompassHtml, dayHtml, ruesHtml, fillPerson, mountCompass, hookVectorMap, northDialog, parisRows,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
