/* LCNDA — 🌅 Le ciel, la mer et le métier (lot 8). Serveur : lib/lot8_ciel_metier.php (🌍 villes du même nom, 🗺️ vieux plans) ;
 * style : assets/css/lot8-ciel-metier.css ; données livrées : assets/data/l8a-*.json(.gz), refaites par scripts/lot8-ciel-metier/*.
 *  🌅 Les ciels étranges de sa vie (Laki, Tambora, Krakatoa, Toungouska, Pinatubo…)   🌊 La marée du jour (calculée : constantes UHSLC)
 *  🌍 Les villes du monde au même nom (GeoNames, sans Internet)                         🗺️ Les vieux plans de sa ville (Commons, en ligne)
 *  ♨️ Les villes d'eaux (Wikidata)                                                       🏞️ Parcs et jardins historiques (Wikidata)
 *  🖼️ Son métier en images   🛠️ Les outils de son métier   😇 Le saint patron de son métier (Wikidata, Commons)
 *  🦠 Les maladies de son métier (Wikipédia, phrase exacte)   💰 🍽️ Le budget et les repas d'une famille comme la sienne (Le Play)
 * Où ça s'affiche : deux blocs de fiche « 🌅 Ciel et mer de sa vie » et « 🛠️ Son métier autrefois » (une phrase par sujet, ▸ plus),
 * la fiche d'un village, la monographie (LCNDA_EXT.monographSections), 🔎 Ce qui le concerne / 🧰 Données (LCNDA_EXT.dataSources),
 * Listes → Données (LCNDA_EXT.dataLists), « Où chercher » (les sources non libres : SHOM, Gallica) et Réglages → « 🌅 Ciel, mer et
 * métier » (localStorage « genealogie-lot8-ciel-metier »). Pour d'autres fichiers : LCNDA_EXT.cielMetier.
 * Essai : tests/test-lot8-ciel-metier.js
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const W = root || {};
    const T = (s, v) => (W.LCNDA_I18N ? W.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/œ/g, 'oe').replace(/æ/g, 'ae').trim();
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const RAD = Math.PI / 180;
    const km = (a, b, c, d) => { const x = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries(f.fields.map((k, i) => [k, r[i] ?? null])) : r));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */

    /* ── la vie d'une personne (réponse de ha_life) ── */
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (ys.length ? Math.max(...ys) : b)};
    }
    const geoEvents = life => (life?.events || []).filter(e => num(e.lat) !== null && num(e.lon) !== null && !(Number(e.lat) === 0 && Number(e.lon) === 0));
    const inEurope = (lat, lon) => lat >= 34 && lat <= 72 && lon >= -25 && lon <= 45;
    const EUROPE_COUNTRY = /^(france|belgique|suisse|luxembourg|monaco|allemagne|italie|espagne|portugal|royaume-uni|angleterre|ecosse|irlande|pays-bas|hollande|autriche|pologne|tchequie|boheme|hongrie|danemark|suede|norvege|finlande|russie|grece|roumanie|bulgarie|croatie|slovenie|serbie|andorre|liechtenstein|belgium|germany|italy|spain|switzerland|united kingdom|netherlands|austria)$/;

    /** 🌅 les ciels étranges : ceux qu'il a pu voir de ses yeux (en vie, 5 ans ou plus, en Europe à ce moment) */
    function skiesForLife(events, life) {
        const {birth, death, from, to} = lifeSpan(life);
        if (birth === null && from === null) return [];
        const born = birth ?? from, end = death ?? (to !== null && to !== born ? to : born + 100);
        const geo = geoEvents(life);
        const out = [];
        for (const ev of events || []) {
            const y0 = Number(String(ev.from).slice(0, 4)), y1 = Number(String(ev.to || ev.from).slice(0, 4));
            if (y1 < born + 5 || y0 > end) continue;
            if (death === null && birth !== null && y0 > birth + 105) continue;
            // où vivait-il à ce moment ? le lieu daté le plus proche de l'événement
            let where = null, gap = Infinity;
            for (const e of geo) { const g = e.year != null ? Math.abs(Number(e.year) - y0) : 50; if (g < gap) { gap = g; where = e; } }
            const box = ev.bbox || [34, 72, -25, 45];
            if (where) {
                const lat = Number(where.lat), lon = Number(where.lon);
                if (!(lat >= box[0] && lat <= box[1] && lon >= box[2] && lon <= box[3])) continue;
            } else {
                const cs = (life.places || []).map(p => fold(p.country)).filter(Boolean);
                if (cs.length && !cs.some(c => EUROPE_COUNTRY.test(c))) continue;
                if (ev.bbox && !cs.length) { /* sans lieu placé : on ne sait pas s'il était au nord */ if (ev.north) continue; }
            }
            out.push({ev, age: Math.max(5, y0 - born), place: where?.place || '', exact: !!where && gap <= 10});
        }
        return out;
    }

    /* ── 🌊 la marée : prédiction harmonique (mêmes formules que scripts/lot8-ciel-metier/build_marees.py) ── */
    function jdOf(y, m, d, h = 0) { // jour julien (grégorien) d'une date UTC
        const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
        return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 - 0.5 + h / 24;
    }
    function astro(jd) {
        const T = (jd - 2415020.0) / 36525.0;
        return {s: 270.434164 + 481267.8831 * T, h: 279.696678 + 36000.768925 * T, p: 334.329556 + 4069.0340329 * T, N: 259.183275 - 1934.142008 * T, p1: 281.220833 + 1.719175 * T};
    }
    function nodal(kind, N) {
        const n = N * RAD, c1 = Math.cos(n), c2 = Math.cos(2 * n), c3 = Math.cos(3 * n), s1 = Math.sin(n), s2 = Math.sin(2 * n), s3 = Math.sin(3 * n);
        switch (kind) {
            case 'M2': return [1.0004 - 0.0373 * c1 + 0.0002 * c2, -2.14 * s1];
            case 'O1': return [1.0089 + 0.1871 * c1 - 0.0147 * c2 + 0.0014 * c3, 10.80 * s1 - 1.34 * s2 + 0.19 * s3];
            case 'K1': return [1.0060 + 0.1150 * c1 - 0.0088 * c2 + 0.0006 * c3, -8.86 * s1 + 0.68 * s2 - 0.07 * s3];
            case 'K2': return [1.0241 + 0.2863 * c1 + 0.0083 * c2 - 0.0015 * c3, -17.74 * s1 + 0.68 * s2 - 0.04 * s3];
            case 'Mf': return [1.043 + 0.414 * c1, -23.7 * s1 + 2.7 * s2 - 0.4 * s3];
            case 'Mm': return [1.0 - 0.130 * c1, 0];
            case 'J1': return [1.1029 + 0.1676 * c1 - 0.0170 * c2 + 0.0016 * c3, -12.94 * s1 + 1.34 * s2 - 0.19 * s3];
            case 'OO1': return [1.1027 + 0.6504 * c1 + 0.0317 * c2 - 0.0014 * c3, -36.68 * s1 + 4.02 * s2 - 0.57 * s3];
            default: return [1, 0];
        }
    }
    function fu(spec, N) {
        if (spec === 'M2-') { const [f, u] = nodal('M2', N); return [f, -u]; }
        if (spec === 'M3') { const [f, u] = nodal('M2', N); return [f ** 1.5, 1.5 * u]; }
        let f = 1, u = 0; for (const k of String(spec).split('*')) { const [a, b] = nodal(k, N); f *= a; u += b; }
        return [f, u];
    }
    /** une fonction t (jour julien) → hauteur (mm) pour une station ; f et u pris au milieu de la période (ils changent sur 18,6 ans) */
    function tideFn(st, constituents, jdMid) {
        const N0 = astro(jdMid).N;
        const parts = [];
        for (const c of constituents) {
            const k = st.cons[c[0]]; if (!k) continue;
            const [f, u] = fu(c[8], N0);
            parts.push([c[1], c[2], c[3], c[4], c[5], c[6], c[7] + u - k[1], f * k[0]]);
        }
        return jd => {
            const a = astro(jd), Tsun = 15 * (((jd + 0.5) % 1 + 1) % 1) * 24 + 180;
            let z = st.z0;
            for (const p of parts) z += p[7] * Math.cos((p[0] * Tsun + p[1] * a.s + p[2] * a.h + p[3] * a.p + p[4] * a.N + p[5] * a.p1 + p[6]) * RAD);
            return z;
        };
    }
    /** pleines et basses mers entre jd0 et jd1 : [{jd, h, high}] */
    function extremes(st, constituents, jd0, jd1) {
        const f = tideFn(st, constituents, (jd0 + jd1) / 2), step = 1 / 144; // 10 minutes
        const out = []; let a = f(jd0 - step), b = f(jd0);
        for (let t = jd0; t < jd1; t += step) {
            const c = f(t + step);
            if ((b > a && b >= c) || (b < a && b <= c)) {
                const den = a - 2 * b + c, off = den ? 0.5 * (a - c) / den : 0;
                out.push({jd: t + off * step, h: b - 0.25 * (a - c) * off, high: b > a});
            }
            a = b; b = c;
        }
        return out;
    }
    const coastKm = (st, lat, lon) => { let best = Infinity; const c = st.coast || []; for (let i = 0; i + 1 < c.length; i += 2) { const k = km(lat, lon, c[i], c[i + 1]); if (k < best) best = k; } return best; };
    /** la station à utiliser pour un lieu : à moins de radius_km de la station ET à moins de coast_km de la mer ; sinon null */
    function stationFor(D, lat, lon) {
        if (lat === null || lon === null) return null;
        let best = null;
        for (const st of D.stations || []) {
            const d = km(lat, lon, st.lat, st.lon); if (d > (D.radius_km || 30)) continue;
            const c = coastKm(st, lat, lon); if (c > (D.coast_km || 10)) continue;
            if (!best || d < best.km) best = {st, km: d, coast: c};
        }
        return best;
    }
    /** faible marée (Méditerranée, Antilles) ou calcul peu fiable : on ne donne pas d'heure */
    const weakTide = st => (st.range_mm?.vive_eau || 0) < 800 || (st.check && st.check.median_min > 20);
    /** la marée d'un jour (date « AAAA-MM-JJ ») pour un lieu : {station, km, list: [{jd, h, high}] du jour local (±14 h autour du jour UTC)} */
    function tideOfDay(D, lat, lon, date, toLocal) {
        const m = String(date || '').match(/^(\d{3,4})-(\d\d)-(\d\d)/); if (!m) return null;
        const s = stationFor(D, num(lat), num(lon)); if (!s) return null;
        const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
        if (y < 1700 || y > 2100) return null;
        const jd0 = jdOf(y, mo, d), all = extremes(s.st, D.constituents, jd0 - 0.6, jd0 + 1.6);
        const loc = toLocal || (j => ({min: Math.round(((j - jd0) * 1440 + Number(lon) * 4)), kind: 'soleil'}));
        const list = all.map(e => ({...e, local: loc(e.jd)})).filter(e => e.local.min >= 0 && e.local.min < 1440);
        return {station: s.st, km: s.km, coast: s.coast, list, weak: weakTide(s.st)};
    }

    /* ── 🛠️ le métier : le même rapprochement que lib/metiers_anciens.php (trade_match) ── */
    const tFold = s => fold(s).replace(/ſ/g, 's').replace(/[^a-z0-9]+/g, ' ').trim();
    function tradeIndex(dict) {
        const ix = new Map();
        for (const t of dict?.trades || []) [t.name, t.fem, ...(t.variants || [])].forEach((n, i) => { if (!n) return; const k = tFold(n); if (k && (!ix.has(k) || i === 0)) ix.set(k, t.key); });
        return ix;
    }
    function tradeMatch(ix, text) {
        const f = tFold(text); if (!f) return null;
        const tryK = s => ix.get(s) || ix.get(s.replace(/(?<=[a-z])[sx]\b/g, '')) || null;
        let k = tryK(f); if (k) return k;
        const g = f.replace(/^(maitre|maistre|mtre|me|compagnon|apprenti|garcon|aide|ouvrier|ancien|ex|veuve de|veuf de|fils de|fille de|femme de)\s+/, '').trim();
        if (g !== f && (k = tryK(g))) return k;
        const w = g.split(' ');
        for (let len = Math.min(5, w.length); len >= 1; len--) for (let i = 0; i + len <= w.length; i++) { const part = w.slice(i, i + len).join(' '); if (part.length < 4) continue; if ((k = tryK(part))) return k; }
        return null;
    }
    /** les métiers de sa vie → [{text, key, occ}] (occ = l'élément Wikidata relié, s'il y en a un) */
    function jobsOf(life, dict, M) {
        const ix = dict ? tradeIndex(dict) : new Map(), out = [], seen = new Set();
        for (const j of life?.jobs || []) {
            const key = tradeMatch(ix, j.text); const q = key ? M?.trades?.[key] : null;
            const id = key || tFold(j.text); if (seen.has(id)) continue; seen.add(id);
            out.push({text: String(j.text).trim(), key, trade: key ? (dict.trades.find(t => t.key === key) || null) : null, q, occ: q ? M.occ[q] : null, year: j.year ?? null});
        }
        return out;
    }

    /* ── 🦠 les maladies du métier ── */
    function diseasesForLife(rows, life) {
        const {birth, death, from, to} = lifeSpan(life);
        const a = birth !== null ? birth + 12 : from, z = death ?? to ?? (birth !== null ? birth + 80 : null);
        const out = [];
        for (const r of rows || []) {
            const re = new RegExp(r.jobs, 'i');
            const j = (life?.jobs || []).find(x => re.test(fold(x.text)));
            if (!j) continue;
            if (a !== null && z !== null && (r.to < a || r.from > z)) continue;
            out.push({r, job: String(j.text).trim()});
        }
        return out;
    }

    /* ── 💰 🍽️ Le Play : la famille la plus proche de la sienne ── */
    function budgetFor(D, life) {
        const {birth, death} = lifeSpan(life);
        const mid = birth !== null ? birth + 35 : death !== null ? death - 25 : null;
        const places = (life?.places || []).map(p => fold([p.name, p.full].join(' ')));
        const countries = new Set((life?.places || []).map(p => fold(p.country || 'france')));
        let best = null;
        for (const r of D?.rows || []) {
            const re = new RegExp(r.jobs, 'i');
            const j = (life?.jobs || []).find(x => re.test(fold(x.text)));
            if (!j) continue;
            const dy = mid !== null ? Math.abs(r.year - mid) : 30;
            if (dy > 60) continue;
            const pl = fold(r.place).replace(/^(le |la |les |l')/, '').replace(/\s*\(.*$/, '');
            const samePlace = pl.length > 3 && places.some(p => p.includes(pl));
            const sameCountry = countries.has(fold(r.country)) || (!countries.size && r.country === 'France');
            const score = (samePlace ? 40 : 0) + (sameCountry ? 25 : 0) - dy * 0.5;
            if (!best || score > best.score) best = {r, job: String(j.text).trim(), score, samePlace, sameCountry, meal: (D.meals || []).find(m => m.n === r.n) || null};
        }
        return best;
    }

    /* ── ♨️ 🏞️ autour d'un lieu ── */
    const near = (rows, lat, lon, radius) => (lat === null || lon === null ? [] : rows.map(r => ({r, km: km(lat, lon, r.lat, r.lon)})).filter(x => x.km <= radius).sort((a, b) => a.km - b.km));

    const core = {km, fold, lifeSpan, skiesForLife, jdOf, astro, nodal, fu, tideFn, extremes, coastKm, stationFor, weakTide, tideOfDay, tradeIndex, tradeMatch, jobsOf, diseasesForLife, budgetFor, near, table};
    if (!root || !root.document) return core;

    /* ═════════════ l'écran ═════════════ */
    const A = () => W.LCNDA_APP || {};
    const UI = () => W.LCNDA_UI || {};
    const ext = W.LCNDA_EXT = W.LCNDA_EXT || {};
    const api = (...a) => A().api(...a);
    const KEY = 'genealogie-lot8-ciel-metier';
    const TAB = ['lot8_ciel_metier', '25l8a', '🌅 Ciel, mer et métier'];
    const PARTS = [
        ['ciel', '🌅 Les ciels étranges de sa vie', 'Brouillard sec du Laki (1783), ciels jaunes de 1816, couchers de soleil rouges du Krakatoa (1883), nuits claires de 1908… s’il était en Europe, en vie et âgé d’au moins 5 ans.'],
        ['maree', '🌊 La marée du jour', 'Pour un événement daté au bord de la mer (à moins de 10 km, près d’un port de mesure) : l’heure de la mer haute et basse, calculée.'],
        ['homonymes', '🌍 Les villes du monde au même nom', 'Sur la fiche d’un village : les autres lieux du même nom dans le monde (répertoire GeoNames de l’app, sans Internet).'],
        ['plans', '🗺️ Les vieux plans de sa ville', 'Sur la fiche d’un village : les cartes et plans d’avant 1950 de Wikimedia Commons (avec Internet), à garder dans les médias.'],
        ['eaux', '♨️ Les villes d’eaux', 'Les stations thermales et établissements de bains à moins de 50 km.'],
        ['jardins', '🏞️ Parcs et jardins historiques', 'Les jardins remarquables et les parcs protégés à moins de 10 km.'],
        ['images', '🖼️ Son métier en images', 'Des tableaux et gravures anciens qui montrent son métier (Wikimedia Commons, avec Internet pour les images).'],
        ['outils', '🛠️ Les outils de son métier', 'Les outils que Wikidata relie à son métier.'],
        ['saint', '😇 Le saint patron de son métier', 'Le saint patron de son métier et le jour de sa fête.'],
        ['maladies', '🦠 Les maladies de son métier', 'Les maladies connues de certains métiers (plomb, silice, phosphore, mercure…), avec la phrase de la source.'],
        ['budget', '💰 Le budget d’une famille comme la sienne', 'Ce que gagnait une famille du même métier, et la part de la nourriture (monographies de Le Play).'],
        ['repas', '🍽️ Ce qu’on mangeait', 'Les repas d’une famille du même métier, recopiés des monographies de Le Play.']];
    const settings = () => { let s = {}; try { s = JSON.parse(W.localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { W.localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const nf = n => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: 0});
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const dateTxt = d => { const m = String(d || '').match(/^(\d{3,4})(?:-(\d\d))?(?:-(\d\d))?/); if (!m) return ''; const mo = Number(m[2] || 0), dd = Number(m[3] || 0); return `${dd ? `${dd === 1 ? '1er' : dd} ` : ''}${mo ? `${T(MONTHS[mo - 1])} ` : ''}${m[1]}`; };
    const kmTxt = k => (k < 1 ? T('moins d’1 km') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = url => (url ? `<a class="l8a-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const wdUrl = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const wpUrl = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const row = (icon, html, src, extra = '') => `<div class="hist-row l8a-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="l8a-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const quote = (q, url) => (q ? `<blockquote class="l8a-quote">« ${esc(q)} » ${srcLink(url)}</blockquote>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const he = life => (life?.person?.gender === 'female' ? T('elle') : life?.person?.gender === 'male' ? T('il') : T('cette personne'));
    const nameOf = life => (life?.person?.first ? esc(life.person.first) : esc(cap(he(life))));
    const pl1 = x => (/[sxz]$/.test(x) || !/[a-zé]$/i.test(x) ? x : /(eau|eu)$/.test(x) ? x + 'x' : /al$/.test(x) ? x.replace(/al$/, 'aux') : x + 's');
    /** « tailleur d’habits » → « tailleurs d’habits », « maréchal-ferrant » → « maréchaux-ferrants », « pêcheur côtier » → « pêcheurs côtiers » */
    const plural = w => { let stop = false; return String(w || '').trim().split(' ').map(x => { if (stop) return x; if (/^(de|du|des|à|au|aux|en|et|ou)$/i.test(x) || /^(d|l)[’']/i.test(x) || /^\(/.test(x)) { stop = true; return x; } return x.split('-').map(pl1).join('-'); }).join(' '); };

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {ciels: 'l8a-ciels.json', marees: 'l8a-marees.json.gz', metiers: 'l8a-metiers.json.gz', maladies: 'l8a-maladies.json', leplay: 'l8a-leplay.json.gz', eaux: 'l8a-eaux.json.gz', jardins: 'l8a-jardins.json.gz', dict: 'metiers-anciens.json'};
    const DATA_V = 1;
    const cache = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers compressés.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!cache[kind]) cache[kind] = fetch(`assets/data/${FILES[kind]}?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => { if (f && (kind === 'eaux' || kind === 'jardins')) f.list = table(f); return f; })
            .catch(e => { delete cache[kind]; throw e; });
        return cache[kind];
    }
    const soft = kind => load(kind).catch(() => null);
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };

    /* ─────────── 🌊 l'heure de l'époque (règles de 🕰️ ciel-heure si elles sont là ; sinon l'heure du soleil) ─────────── */
    let TZ = null;
    async function tz() { if (TZ !== null) return TZ; try { TZ = (await ext.cielHeure?.loadTz?.()) || false; } catch (_) { TZ = false; } return TZ; }
    function toLocalFn(place, date, Z) {
        const lat = num(place.lat), lon = num(place.lon);
        return jd => {
            const u = (jd - 2440587.5) * 1440, jd0 = core.jdOf(...String(date).slice(0, 10).split('-').map(Number));
            const base = (jd0 - 2440587.5) * 1440;
            if (Z && ext.cielHeure?.zoneFor) {
                const zone = ext.cielHeure.zoneFor({lat, lng: lon, country: place.country || '', county: place.county || ''}, String(date).slice(0, 10)), rows = Z.zones?.[zone];
                if (rows) {
                    let r = rows[0]; for (const x of rows) { if (x[0] == null || x[0] <= u) r = x; else break; }
                    if (r[3] !== 'LMT') return {min: Math.round(u - base + r[1] / 60), kind: 'legal', abbr: r[3]};
                }
            }
            return {min: Math.round(u - base + (lon ?? 0) * 4), kind: 'soleil'};
        };
    }
    const hm = min => { const m = ((Math.round(min / 5) * 5) % 1440 + 1440) % 1440; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`; };
    const EV_WORD = {BIRT: 'Le jour de sa naissance', CHR: 'Le jour de son baptême', BAPM: 'Le jour de son baptême', MARR: 'Le jour de son mariage', DEAT: 'Le jour de sa mort', BURI: 'Le jour de son enterrement'};

    /* ─────────── les phrases de la fiche d'une personne ─────────── */
    function skyHtml(list, life, D) {
        if (!list.length) return '';
        const top = list[0], e = top.ev;
        const lead = T('{who} avait {a} ans {when} : {what}', {who: nameOf(life), a: String(top.age), when: e.when ? T(e.when) : T('en {y}', {y: String(e.from).slice(0, 4)}), what: esc(T(e.what))});
        const li = list.map(x => `<li>${esc(x.ev.icon)} <b>${esc(T(x.ev.name))}</b> (${esc(T(x.ev.when || String(x.ev.from).slice(0, 4)))}) — ${esc(T('à {a} ans', {a: String(x.age)}))}${x.place ? ` · ${esc(x.place)}` : ''}${quote(x.ev.quote, x.ev.url)}</li>`).join('');
        return row(e.icon || '🌅', cap(lead), `${link(e.url, e.title || 'Wikipédia')} (CC BY-SA 4.0)`, more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Il fallait être en Europe, et en vie : on prend le lieu de sa fiche le plus proche de cette date. Les comètes et les aurores sont dans « ☄️ Il a pu voir… ».'))}</small>`, list.length > 1 ? list.length : null));
    }
    async function tideHtml(life, D) {
        const Z = await tz();
        const evs = geoEvents(life).filter(e => /^\d{3,4}-\d\d-\d\d/.test(e.date || '') && EV_WORD[e.tag]);
        const out = [];
        for (const e of evs) {
            const t = core.tideOfDay(D, e.lat, e.lon, e.date, toLocalFn(e, e.date, Z));
            if (!t) continue;
            out.push({e, t});
            if (out.length >= 3) break;
        }
        if (!out.length) return '';
        const one = ({e, t}) => {
            const highs = t.list.filter(x => x.high), lows = t.list.filter(x => !x.high), st = t.station;
            const kind = t.list[0]?.local.kind === 'soleil' ? T('heure du soleil') : T('heure de l’époque');
            const where = T('à {s} (port de mesure le plus proche, {k})', {s: esc(st.name), k: kmTxt(t.km)});
            if (t.weak) return T('{w} ({d}), la marée était faible {where} : environ {r} cm entre la mer haute et la mer basse.', {w: T(EV_WORD[e.tag]), d: dateTxt(e.date), where, r: String(Math.round((st.range_mm.vive_eau || 0) / 10))});
            return T('{w} ({d}), la mer était haute vers {h} {where}, et basse vers {b} ({k}).', {w: T(EV_WORD[e.tag]), d: dateTxt(e.date), h: highs.map(x => hm(x.local.min)).join(T(' et vers ')) || '—', where, b: lows.map(x => hm(x.local.min)).join(T(' et ')) || '—', k: kind});
        };
        const s = out[0].t.station;
        const acc = s.check ? T('Contrôle : sur l’année {y} (mesures de {s} mises de côté), l’heure calculée de la pleine mer tombe à {m} minutes près la moitié du temps.', {y: String(s.check.year), s: s.name, m: String(Math.round(s.check.median_min))}) : '';
        return row('🌊', `${one(out[0])} <span class="l8a-badge">${esc(T('estimation calculée'))}</span>`, `${link(s.url, `UHSLC — ${s.name}`)} · ${esc(T('constantes calculées par LCNDA'))}`,
            more(`${out.length > 1 ? `<ul class="hist-ul">${out.slice(1).map(x => `<li>${one(x)}</li>`).join('')}</ul>` : ''}<small class="muted hist-hyp">${esc(T('Marée calculée avec les mesures horaires du port (University of Hawaii Sea Level Center) : la marée astronomique, sans le vent ni la pression, qui pouvaient la décaler. Un autre port, même proche, peut avoir sa mer haute une heure plus tôt ou plus tard.'))} ${esc(acc)}</small>`, out.length > 1 ? out.length : null));
    }
    const artName = x => x.n || x.title || String(x.img || '').replace(/\.\w+$/, '');
    const thumbFig = (x, cls = '') => `<figure class="l8a-fig ${cls}"><a href="${esc(x.page)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Voir sur Wikimedia Commons'))}"><img loading="lazy" alt="${esc(artName(x))}" src="${esc(x.thumb)}" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('l8a-off')"></a><figcaption>${esc(artName(x))}${x.y ? ` (${esc(String(x.y))})` : ''}<br><small class="muted">${esc(x.artist || '')}${x.artist ? ' · ' : ''}${link(x.lic_url || x.page, x.lic || x.licence || '')}</small></figcaption></figure>`;
    function metierHtml(jobs, parts) {
        const html = [];
        const withOcc = jobs.filter(j => j.occ);
        const label = j => esc(j.trade?.name ? j.trade.name.toLowerCase() : j.text);
        if (parts.includes('saint')) {
            const j = withOcc.find(x => x.occ.saints?.length);
            if (j) {
                const s = j.occ.saints[0], f = s.feasts?.[0];
                const lead = f ? T('{s}, patron des {m}, fêté le {d}.', {s: `<b>${esc(s.n)}</b>`, m: esc(plural(j.trade?.name?.toLowerCase() || j.text)), d: esc(f)}) : T('{s}, patron des {m}.', {s: `<b>${esc(s.n)}</b>`, m: esc(plural(j.trade?.name?.toLowerCase() || j.text))});
                const others = withOcc.flatMap(x => x.occ.saints.map(y => [x, y])).filter(([, y]) => y !== s);
                html.push(row('😇', lead + ' ' + link(s.wp || wdUrl(s.q), '↗'), `${link(wdUrl(j.q), 'Wikidata')} (CC0)`, others.length ? more(`<ul class="hist-ul">${others.map(([x, y]) => `<li>${esc(y.n)} — ${esc(label(x))}${y.feasts?.length ? ` · ${esc(y.feasts.join(', '))}` : ''} ${link(y.wp || wdUrl(y.q), '↗')}</li>`).join('')}</ul>`, others.length) : ''));
            }
        }
        if (parts.includes('outils')) {
            const j = withOcc.find(x => x.occ.tools?.length);
            if (j) {
                const tools = j.occ.tools, imgs = tools.filter(t => t.thumb);
                html.push(row('🛠️', T('Les outils de son métier ({m}) : {t}.', {m: label(j), t: tools.slice(0, 6).map(t => esc(t.n)).join(', ')}), `${link(wdUrl(j.q), 'Wikidata')} (CC0)${imgs.length ? ' · ' + link('https://commons.wikimedia.org', 'Wikimedia Commons') : ''}`,
                    more(`${imgs.length ? `<div class="l8a-figs">${imgs.slice(0, 6).map(t => thumbFig({...t, n: t.n})).join('')}</div>` : ''}<ul class="hist-ul">${tools.map(t => `<li>${esc(t.n)} ${link(wdUrl(t.q), '↗')}</li>`).join('')}</ul>`, tools.length > 6 ? tools.length : null)));
            }
        }
        if (parts.includes('images')) {
            const j = withOcc.find(x => x.occ.art?.length);
            if (j) {
                const art = j.occ.art;
                html.push(row('🖼️', T('Son métier en images ({m}) : {n} œuvre(s) anciennes du domaine public ou sous licence libre.', {m: label(j), n: String(art.length)}), `${link(wdUrl(j.q), 'Wikidata')} · ${link(j.occ.cat ? `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(j.occ.cat.replace(/ /g, '_'))}` : 'https://commons.wikimedia.org', 'Wikimedia Commons')} — ${esc(T('auteur et licence sous chaque image'))}`,
                    `<div class="l8a-figs">${art.slice(0, 4).map(a => thumbFig(a)).join('')}</div>${art.length > 4 ? more(`<div class="l8a-figs">${art.slice(4).map(a => thumbFig(a)).join('')}</div>`, art.length - 4) : ''}`));
            }
        }
        return html;
    }
    function diseaseHtml(list) {
        if (!list.length) return '';
        const top = list[0].r;
        const lead = T('Dans son métier ({j}), {what}', {j: esc(list[0].job), what: esc(T(top.what))});
        return row('🦠', lead, `${link(top.url, top.title)} (Wikipédia, CC BY-SA 4.0)`, more(`${quote(top.quote, top.url)}${list.length > 1 ? `<ul class="hist-ul">${list.slice(1).map(x => `<li>${esc(T(x.r.what))} ${quote(x.r.quote, x.r.url)}</li>`).join('')}</ul>` : ''}<small class="muted hist-hyp">${esc(T('Ce sont des risques connus du métier à cette époque, pas un diagnostic : rien ne dit qu’il en a souffert.'))}</small>`, list.length > 1 ? list.length : null));
    }
    function budgetHtml(b, D, parts) {
        if (!b) return [];
        const r = b.r, out = [];
        const fam = T('Une famille de {j} {p} en {y}', {j: esc(plural(r.job)), p: esc(r.place.match(/^(le |la |les |l’)/i) ? T('de {p}', {p: r.place}).replace(/de le /i, 'du ').replace(/de les /i, 'des ') : T('de {p}', {p: r.place})), y: String(r.year)});
        if (parts.includes('budget')) {
            const lead = T('{f} gagnait environ {t} F par an ; la nourriture faisait {n} % des dépenses (dont {c} % pour le pain et les céréales).', {f: fam, t: nf(r.total), n: String(r.food_pct).replace('.', ','), c: String(r.cereals_pct).replace('.', ',')});
            out.push(row('💰', `${lead} ${link(r.page, T('(Le Play ↗)'))}`, `${link(D.url, 'É. Cheysson et A. Toqué, Les Budgets comparés des cent monographies (1890)')} — ${esc(T('domaine public'))}`,
                more(`<p>${esc(T('Monographie n° {n} : « {t} », observée en {y} ({ed}). Recettes de l’année : {tot} F (en argent et en nature) ; nourriture : {f} F.', {n: String(r.n), t: r.title, y: String(r.year), ed: r.ed, tot: nf(r.total), f: nf(r.food)}))} ${link(r.page, T('page des recettes'))} · ${link(r.page_d, T('page des dépenses'))}</p><small class="muted hist-hyp">${esc(T('Une famille réelle observée par Le Play ou ses élèves, choisie parce qu’elle avait le même métier que lui ({j}) : elle ne dit pas ce que gagnait sa famille à lui. Francs de l’époque.', {j: b.job}))}</small>`)));
        }
        if (parts.includes('repas') && b.meal) {
            out.push(row('🍽️', `${T('Ce qu’on mangeait chez des {j} : « {q} »', {j: esc(plural(r.job)), q: esc(b.meal.quote) + (b.meal.cut ? '…' : '')})} ${link(b.meal.url, T('(Le Play ↗)'))}`, esc(b.meal.src)));
        }
        return out;
    }

    /** remplit un élément avec les lignes « ciel et mer » (kind = 'ciel') ou « métier » (kind = 'metier') ; renvoie le nombre de lignes */
    async function personInto(host, id, kind, opts = {}) {
        const s = settings(), want = (opts.parts || (kind === 'ciel' ? ['ciel', 'maree'] : ['images', 'outils', 'saint', 'maladies', 'budget', 'repas'])).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok && !life?.person || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const html = [];
        if (kind === 'ciel') {
            if (want.includes('ciel')) { const D = await soft('ciels'); if (D) html.push(skyHtml(core.skiesForLife(D.events, life), life, D)); }
            if (want.includes('maree')) { const D = await soft('marees'); if (D) html.push(await tideHtml(life, D).catch(e => { console.error(e); return ''; })); }
        } else {
            if (!(life.jobs || []).length) { host.innerHTML = ''; return 0; }
            const [M, dict, mal, lp] = await Promise.all([want.some(k => ['images', 'outils', 'saint'].includes(k)) ? soft('metiers') : null, soft('dict'), want.includes('maladies') ? soft('maladies') : null, want.some(k => k === 'budget' || k === 'repas') ? soft('leplay') : null]);
            if (M && dict) html.push(...metierHtml(core.jobsOf(life, dict, M), want));
            if (mal) html.push(diseaseHtml(core.diseasesForLife(mal.rows, life)));
            if (lp) html.push(...budgetHtml(core.budgetFor(lp, life), lp, want));
        }
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life l8a-life">${out.join('')}</div>` : '';
        return out.length;
    }
    const BLOCKS = [['l8a_ciel', '🌅 Ciel et mer de sa vie', 'ciel', ['ciel', 'maree']], ['l8a_metier', '🛠️ Son métier autrefois', 'metier', ['images', 'outils', 'saint', 'maladies', 'budget', 'repas']]];
    ext.personBlocks = ext.personBlocks || {};
    for (const [bid, title, kind, parts] of BLOCKS) {
        ext.personBlocks[bid] = (index, detail) => {
            const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
            if (!parts.some(on)) return '';
            return A().card(index, T(title), '', `<div class="l8a-block" data-l8a-person="${Number(p.id)}" data-l8a-kind="${kind}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
        };
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        const hs = [...W.document.querySelectorAll('#workspace [data-l8a-person]')];
        const ids = new Set(hs.map(h => Number(h.dataset.l8aPerson))); ids.forEach(i => lifeMemo.delete(i));
        hs.forEach(async h => { const n = await personInto(h, Number(h.dataset.l8aPerson), h.dataset.l8aKind).catch(() => 0); const card = h.closest('section.card'); if (card) card.hidden = !n; });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const placeName = pl => String(pl?.name || '').replace(/\s*\(.*$/, '').replace(/,.*$/, '').trim();
    const homCache = new Map();
    async function homonymsHtml(place) {
        const name = placeName(place); if (!name) return '';
        const k = `${name}|${place.country || ''}`;
        if (!homCache.has(k)) homCache.set(k, api('l8a_homonyms', {name, country: place.country || '', lat: place.lat ?? place.latitude ?? '', lon: place.lon ?? place.longitude ?? ''}).catch(() => null));
        const r = await homCache.get(k); if (!r?.ok || !r.items?.length) return '';
        const where = x => [x.state, x.country].filter(Boolean).join(', ');
        const top = r.items[0];
        const lead = r.items.length === 1 ? T('Il existe un autre {n} dans le monde : {w}.', {n: `<b>${esc(name)}</b>`, w: esc(where(top))})
            : T('Il existe {k} autres {n} dans le monde, par exemple {w}.', {k: String(r.total), n: `<b>${esc(name)}</b>`, w: r.items.slice(0, 3).map(x => esc(where(x))).join(', ')});
        const li = r.items.map(x => `<li>${esc(x.name)} — ${esc(where(x))}${x.population ? ` <small class="muted">${esc(T('{n} habitants', {n: nf(x.population)}))}</small>` : ''} ${link(x.url, '↗ GeoNames')}</li>`).join('');
        return row('🌍', lead, `${link('https://www.geonames.org/', 'GeoNames')} (CC BY 4.0)`, more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Même nom exact, dans un autre pays. Des émigrants ont parfois donné à leur nouveau village le nom de celui qu’ils avaient quitté.'))}</small>`, r.items.length > 1 ? r.items.length : null));
    }
    const mapCache = new Map();
    async function mapsHtml(place, {fresh = false} = {}) {
        const q = {place_id: place.id || '', name: placeName(place), lat: place.lat ?? place.latitude ?? '', lon: place.lon ?? place.longitude ?? '', insee: place.insee || '', country: place.country || '', ...(fresh ? {fresh: 1} : {})};
        const k = JSON.stringify(q);
        if (!mapCache.has(k) || fresh) mapCache.set(k, api('l8a_maps', q).catch(e => ({ok: false, message: e.message})));
        const r = await mapCache.get(k);
        if (!r?.ok) return r?.offline ? row('🗺️', esc(T('Les vieux plans viennent de Wikimedia Commons : il faut Internet.')), '', `<button type="button" class="button small secondary" data-l8a-maps-retry>${esc(T('↻ Réessayer'))}</button>`) : '';
        if (!r.items?.length) return '';
        const key = 'm' + (mapCache.size);
        mapItems.set(key, {items: r.items, place: placeName(place)});
        const card = (it, i) => `<figure class="l8a-fig l8a-map"><a href="${esc(it.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(it.title)}" src="${esc(it.thumb)}" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('l8a-off')"></a>
            <figcaption>${esc(it.title)}${it.year ? ` (${it.year})` : ''}<br><small class="muted">${esc(it.author || '')}${it.author ? ' · ' : ''}${link(it.licence_url || it.page, it.licence)}</small>
            ${it.free ? `<br><button type="button" class="link-button" data-l8a-keep="${i}" data-l8a-key="${key}">${esc(T('＋ Garder dans les médias'))}</button>` : ''}</figcaption></figure>`;
        const cards = r.items.map(card);
        const old = r.items.filter(x => x.year).sort((a, b) => a.year - b.year)[0];
        const lead = old ? T('{n} cartes et plans anciens de la commune, le plus ancien de {y}.', {n: String(r.items.length), y: String(old.year)}) : T('{n} cartes et plans anciens de la commune.', {n: String(r.items.length)});
        return row('🗺️', lead, `${link(r.source?.url, 'Wikimedia Commons')} — ${esc(T('auteur et licence sous chaque image'))}${r.cached ? ` · <small>${esc(T('réponse gardée sur l’ordinateur'))}</small>` : ''}`,
            `<div class="l8a-figs">${cards.slice(0, 4).join('')}</div>${cards.length > 4 ? more(`<div class="l8a-figs">${cards.slice(4).join('')}</div>`, cards.length - 4) : ''}`);
    }
    const mapItems = new Map();
    async function keepMap(btn) {
        const g = mapItems.get(btn.dataset.l8aKey), it = g?.items?.[Number(btn.dataset.l8aKeep)]; if (!it) return;
        btn.disabled = true; const label = btn.textContent; btn.textContent = '…';
        try {
            const r = await api('cplus_keep', {}, {method: 'POST', body: {file: it.file, place_name: g.place}});
            const res = r.result || r;
            btn.textContent = T('✓ Dans les médias');
            const undo = async () => { await api('cplus_keep_undo', {}, {method: 'POST', body: {batch: res.batch}}); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
            A().undoToast ? A().undoToast(T('Plan rangé dans les médias, avec son auteur et sa licence ({l}).', {l: res.licence || it.licence}), {undo, icon: '🗺️'}) : A().toast?.(T('Plan rangé dans les médias.'));
        } catch (e) { btn.disabled = false; btn.textContent = label; A().toast?.(e.message, 'error'); }
    }
    const KIND_EAU = {station: 'station thermale', spa: 'établissement thermal', thermes: 'thermes'};
    async function eauxHtml(place) {
        const ll = placeLL(place); if (!ll) return '';
        const D = await soft('eaux'); if (!D) return '';
        const list = core.near(D.list, ll.lat, ll.lon, 50); if (!list.length) return '';
        const nm = x => `${esc(x.r.n)}${x.r.y ? ` (${esc(T('depuis {y}', {y: String(x.r.y)}))})` : ''}`;
        const lead = list.length === 1 ? T('Une ville d’eaux à moins de 50 km : {e}, à {k}.', {e: `<b>${nm(list[0])}</b>`, k: kmTxt(list[0].km)}) : T('{n} villes d’eaux ou bains à moins de 50 km ; la plus proche : {e}, à {k}.', {n: String(list.length), e: `<b>${nm(list[0])}</b>`, k: kmTxt(list[0].km)});
        const li = list.slice(0, 40).map(x => `<li>${nm(x)} <small class="muted">${esc([T((x.r.kind || []).map(k => KIND_EAU[k] || k).join(', ')), x.r.com, kmTxt(x.km)].filter(Boolean).join(' · '))}</small> ${x.r.wp ? link(wpUrl(decodeURIComponent(x.r.wp)), '↗ Wikipédia') : ''} ${link(wdUrl(x.r.q), '↗ Wikidata')}</li>`).join('');
        return row('♨️', lead, `${link(D.url, 'Wikidata')} (CC0)`, more(`<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('Les familles aisées y allaient « prendre les eaux » ; beaucoup de gens du pays y travaillaient l’été (baigneurs, porteurs, hôteliers).'))}</small>`, list.length > 1 ? list.length : null));
    }
    async function jardinsHtml(place) {
        const ll = placeLL(place); if (!ll) return '';
        const D = await soft('jardins'); if (!D) return '';
        const list = core.near(D.list, ll.lat, ll.lon, 10); if (!list.length) return '';
        const tag = r => ((r.kind || []).includes('jr') ? T('jardin remarquable') : T('parc ou jardin protégé'));
        const nm = x => `${esc(x.r.n)}${x.r.y ? ` (${esc(String(x.r.y))})` : ''}`;
        const lead = list.length === 1 ? T('{j}, {t}, à {k}.', {j: `<b>${nm(list[0])}</b>`, t: tag(list[0].r), k: kmTxt(list[0].km)}) : T('{n} parcs et jardins historiques à moins de 10 km ; le plus proche : {j} ({t}), à {k}.', {n: String(list.length), j: `<b>${nm(list[0])}</b>`, t: tag(list[0].r), k: kmTxt(list[0].km)});
        const li = list.map(x => `<li>${nm(x)} <small class="muted">${esc([tag(x.r), x.r.com, kmTxt(x.km)].filter(Boolean).join(' · '))}</small> ${x.r.wp ? link(wpUrl(decodeURIComponent(x.r.wp)), '↗ Wikipédia') : ''} ${link(wdUrl(x.r.q), '↗ Wikidata')}</li>`).join('');
        return row('🏞️', cap(lead), `${link(D.url, 'Wikidata')} (CC0)${D.official ? ` · ${link(D.official.url, T('liste du ministère de la Culture'))}` : ''}`, more(`<ul class="hist-ul">${li}</ul>`, list.length > 1 ? list.length : null));
    }
    const PLACE_PARTS = {homonymes: homonymsHtml, plans: mapsHtml, eaux: eauxHtml, jardins: jardinsHtml};
    async function placePart(kind, place, opts = {}) { try { return await PLACE_PARTS[kind](place, opts); } catch (e) { console.error(e); return ''; } }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || ['homonymes', 'eaux', 'jardins']).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts)));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        const mapsBtn = !opts.parts && s.plans ? `<p class="l8a-maps-ask"><button type="button" class="button small secondary" data-l8a-maps>${esc(T('🗺️ Voir les vieux plans de la commune (Internet)'))}</button></p><div data-l8a-maps-host></div>` : '';
        host.innerHTML = html.length || mapsBtn ? `<section class="maintenance-panel cplus-panel l8a-panel"><h3>${esc(T('🌍 Ailleurs et autrefois'))}</h3><div class="hist-life l8a-life">${html.join('')}</div>${mapsBtn}</section>` : '';
        if (mapsBtn) host._l8aPlace = place;
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || '', country: /france/i.test(head) || /INSEE/.test(head) ? 'France' : ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'l8a_place', host: '[data-l8a-host]', icon: '🌅', label: 'Le ciel, la mer et le métier', group: 'Autour', enabled: () => ['homonymes', 'plans', 'eaux', 'jardins'].some(on)});
    async function decorate() {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l8a])'); if (!village) return;
        village.dataset.l8a = '1';
        if (!['homonymes', 'plans', 'eaux', 'jardins'].some(on)) return;
        const anchor = village.querySelector('[data-et-host]') || village.querySelector('[data-ha-host]') || village.querySelector('[data-mr-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="l8a-place" data-l8a-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l8a-host]'), villagePlace(village));
    }
    let pending = 0;
    new W.MutationObserver(() => { if (pending) return; pending = W.requestAnimationFrame(() => { pending = 0; decorate().catch(e => console.error(e)); }); }).observe(W.document.documentElement, {childList: true, subtree: true});
    W.document.addEventListener('click', async e => {
        const k = e.target.closest?.('[data-l8a-keep]'); if (k) { e.preventDefault(); keepMap(k); return; }
        const m = e.target.closest?.('[data-l8a-maps], [data-l8a-maps-retry]'); if (!m) return;
        e.preventDefault();
        const panel = m.closest('[data-l8a-host]') || m.closest('.l8a-host-any'); const place = panel?._l8aPlace || m.closest('[data-l8a-mono]')?._l8aPlace; if (!place) return;
        const host = panel?.querySelector('[data-l8a-maps-host]') || m.parentElement;
        m.disabled = true; host.innerHTML = `<p class="muted">${esc(T('On cherche sur Wikimedia Commons…'))}</p>`;
        const html = await mapsHtml(place, {fresh: m.matches('[data-l8a-maps-retry]')});
        host.innerHTML = html ? `<div class="hist-life l8a-life">${html}</div>` : emptyLine(T('Pas de plan ancien de cette commune sur Wikimedia Commons (ou pas de catégorie de cartes).'), '🗺️');
        m.closest('.l8a-maps-ask')?.remove();
    });

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['homonymes', 'l8a_homonymes', '🌍', 'Les villes du monde au même nom', 'GeoNames (CC BY 4.0)'], ['plans', 'l8a_plans', '🗺️', 'Les vieux plans', 'Wikimedia Commons (licence de chaque image)'],
        ['eaux', 'l8a_eaux', '♨️', 'Les villes d’eaux des environs', 'Wikidata (CC0)'], ['jardins', 'l8a_jardins', '🏞️', 'Parcs et jardins historiques', 'Wikidata (CC0)']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, source]) => ({
        id, icon, label: T(label), group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source,
        render: async (place, host, ctx) => {
            let pl = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon};
            if (kind === 'plans' && ctx?.village) { try { const v = await ctx.village(); if (v?.insee) pl.insee = v.insee; } catch (_) {} }
            const html = await placePart(kind, pl); if (!html) return false;
            host.innerHTML = `<div class="hist-life l8a-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const sourceOf = {ciels: ['Wikipédia (CC BY-SA 4.0), phrase exacte de chaque article', 'https://fr.wikipedia.org/wiki/Ann%C3%A9e_sans_%C3%A9t%C3%A9'],
        marees: ['UHSLC (University of Hawaii Sea Level Center), constantes calculées par LCNDA', 'https://uhslc.soest.hawaii.edu/data/'], eaux: ['Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q4946461'],
        jardins: ['Wikidata (CC0), label « Jardin remarquable » du ministère de la Culture', 'https://www.wikidata.org/wiki/Q498842'], metiers: ['Wikidata (CC0) ; images Wikimedia Commons', 'https://www.wikidata.org/wiki/Property:P417'],
        maladies: ['Wikipédia (CC BY-SA 4.0), phrase exacte de chaque article', 'https://fr.wikipedia.org/wiki/Maladie_professionnelle'], leplay: ['Cheysson et Toqué, Les Budgets comparés des cent monographies (1890), domaine public', 'https://archive.org/details/sc_0000871518_00000000631821']};
    const occRows = async kind => {
        const [M, dict] = await Promise.all([load('metiers'), load('dict')]); if (!M || !dict) return [];
        const byQ = {}; for (const [k, q] of Object.entries(M.trades || {})) (byQ[q] = byQ[q] || []).push(dict.trades.find(t => t.key === k)?.name || k);
        const out = [];
        for (const [q, o] of Object.entries(M.occ || {})) {
            const trade = (byQ[q] || []).join(', ');
            if (kind === 'saints') for (const s of o.saints || []) out.push({trade, occupation: o.label, saint: s.n, feast: (s.feasts || []).join(', '), src: s.wp || wdUrl(s.q), wd: wdUrl(q)});
            if (kind === 'outils') for (const t of o.tools || []) out.push({trade, occupation: o.label, tool: t.n, img: t.thumb || '', src: wdUrl(t.q)});
            if (kind === 'images') for (const a of o.art || []) out.push({trade, occupation: o.label, name: artName(a), year: a.y, artist: a.artist, licence: a.lic, img: a.thumb, src: a.page});
        }
        return out;
    };
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l8a_ciels', icon: '🌅', label: T('Ciels étranges (volcans, Toungouska…)'), group: 'Le monde', source: sourceOf.ciels[0], sourceUrl: sourceOf.ciels[1], enabled: () => on('ciel'),
            load: async () => ((await load('ciels'))?.events || []).map(e => ({name: `${e.icon} ${T(e.name)}`, from: Number(String(e.from).slice(0, 4)), to: Number(String(e.to || e.from).slice(0, 4)), when: T(e.when || ''), what: T(e.what), where: T(e.where || ''), quote: e.quote, src: e.url})),
            fields: [{key: 'name', label: T('Événement'), type: 'text'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'when', label: T('Quand'), type: 'text'}, {key: 'where', label: T('Où on l’a vu'), type: 'text'}, {key: 'what', label: T('Ce qu’on voyait'), type: 'text'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.from, r.to]},
        {id: 'l8a_marees', icon: '🌊', label: T('Ports de mesure des marées (calcul de la marée du jour)'), group: 'Le lieu', source: sourceOf.marees[0], sourceUrl: sourceOf.marees[1], enabled: () => on('maree'),
            load: async () => ((await load('marees'))?.stations || []).map(s => ({name: s.name, country: s.country, lat: s.lat, lon: s.lon, years: `${s.fit[0]}–${s.fit[1]}`, range: Math.round((s.range_mm?.vive_eau || 0) / 10), check: s.check ? s.check.median_min : null, checkYear: s.check?.year ?? null, src: s.url})),
            fields: [{key: 'name', label: T('Port'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'years', label: T('Années mesurées pour le calcul'), type: 'text'}, {key: 'range', label: T('Marnage de vive-eau (cm)'), type: 'number'}, {key: 'check', label: T('Écart typique de l’heure (minutes)'), type: 'number'}, {key: 'checkYear', label: T('Année de contrôle'), type: 'year'}, {key: 'src', label: T('Source'), type: 'url'}],
            geo: r => [r.lat, r.lon]},
        {id: 'l8a_homonymes', icon: '🌍', label: T('Les lieux de ma base qui ont un homonyme ailleurs dans le monde'), group: 'Le lieu', source: 'GeoNames (CC BY 4.0)', sourceUrl: 'https://www.geonames.org/', enabled: () => on('homonymes'),
            load: async () => { const r = await api('l8a_homonyms_base', {}); return (r?.rows || []).map(x => ({...x, where: [x.state, x.country].filter(Boolean).join(', '), src: x.url})); },
            fields: [{key: 'commune', label: T('Lieu de ma base'), type: 'text'}, {key: 'name', label: T('Homonyme'), type: 'text'}, {key: 'state', label: T('Région'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'population', label: T('Habitants'), type: 'number'}, {key: 'src', label: T('Source'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null)},
        {id: 'l8a_eaux', icon: '♨️', label: T('Villes d’eaux et établissements thermaux'), group: 'Le lieu', source: sourceOf.eaux[0], sourceUrl: sourceOf.eaux[1], enabled: () => on('eaux'),
            load: async () => ((await load('eaux'))?.list || []).map(r => ({...r, name: r.n, year: r.y, country: r.cc, commune: r.com, kind: (r.kind || []).map(k => T(KIND_EAU[k] || k)).join(', '), src: r.wp ? wpUrl(decodeURIComponent(r.wp)) : wdUrl(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Genre'), type: 'enum'}, {key: 'year', label: T('Créé ou ouvert'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, null], geo: r => [r.lat, r.lon]},
        {id: 'l8a_jardins', icon: '🏞️', label: T('Parcs et jardins historiques'), group: 'Le lieu', source: sourceOf.jardins[0], sourceUrl: sourceOf.jardins[1], enabled: () => on('jardins'),
            load: async () => ((await load('jardins'))?.list || []).map(r => ({...r, name: r.n, year: r.y, country: r.cc, commune: r.com, label: (r.kind || []).includes('jr') ? T('jardin remarquable') : T('parc ou jardin protégé'), src: r.wp ? wpUrl(decodeURIComponent(r.wp)) : wdUrl(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'label', label: T('Genre'), type: 'enum', values: [T('jardin remarquable'), T('parc ou jardin protégé')]}, {key: 'year', label: T('Créé'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, null], geo: r => [r.lat, r.lon]},
        {id: 'l8a_saints', icon: '😇', label: T('Saints patrons des métiers'), group: 'La personne', source: sourceOf.metiers[0], sourceUrl: sourceOf.metiers[1], enabled: () => on('saint'), load: () => occRows('saints'),
            fields: [{key: 'trade', label: T('Métier (dictionnaire de l’app)'), type: 'text'}, {key: 'occupation', label: T('Métier (Wikidata)'), type: 'text'}, {key: 'saint', label: T('Saint patron'), type: 'text'}, {key: 'feast', label: T('Fête'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}]},
        {id: 'l8a_outils', icon: '🛠️', label: T('Les outils des métiers'), group: 'La personne', source: sourceOf.metiers[0], sourceUrl: sourceOf.metiers[1], enabled: () => on('outils'), load: () => occRows('outils'),
            fields: [{key: 'trade', label: T('Métier (dictionnaire de l’app)'), type: 'text'}, {key: 'occupation', label: T('Métier (Wikidata)'), type: 'text'}, {key: 'tool', label: T('Outil'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}]},
        {id: 'l8a_images', icon: '🖼️', label: T('Les métiers en images (œuvres anciennes)'), group: 'La personne', source: sourceOf.metiers[0], sourceUrl: 'https://www.wikidata.org/wiki/Property:P180', enabled: () => on('images'), load: () => occRows('images'),
            fields: [{key: 'name', label: T('Œuvre'), type: 'text'}, {key: 'trade', label: T('Métier'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'artist', label: T('Auteur'), type: 'text'}, {key: 'licence', label: T('Licence'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year]},
        {id: 'l8a_maladies', icon: '🦠', label: T('Maladies de certains métiers'), group: 'La personne', source: sourceOf.maladies[0], sourceUrl: sourceOf.maladies[1], enabled: () => on('maladies'),
            load: async () => ((await load('maladies'))?.rows || []).map(r => ({name: T(r.disease), trades: T(r.trades), from: r.from, to: r.to, what: T(r.what), quote: r.quote, src: r.url})),
            fields: [{key: 'name', label: T('Maladie'), type: 'text'}, {key: 'trades', label: T('Métiers'), type: 'text'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.from, r.to]},
        {id: 'l8a_budgets', icon: '💰', label: T('Budgets de familles ouvrières (Le Play, 1844–1886)'), group: 'La personne', source: sourceOf.leplay[0], sourceUrl: sourceOf.leplay[1], enabled: () => on('budget'),
            load: async () => { const D = await load('leplay'); return (D?.rows || []).map(r => ({name: r.title, job: r.job, place: r.place, country: r.country, year: r.year, total: r.total, food: r.food, foodPct: r.food_pct, cereals: r.cereals_pct, meal: (D.meals || []).find(m => m.n === r.n)?.quote || '', src: r.page})); },
            fields: [{key: 'name', label: T('Monographie'), type: 'text'}, {key: 'job', label: T('Métier'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'total', label: T('Recettes de l’année (F)'), type: 'number'}, {key: 'food', label: T('Nourriture (F)'), type: 'number'}, {key: 'foodPct', label: T('Nourriture (%)'), type: 'number'}, {key: 'cereals', label: T('Pain et céréales (%)'), type: 'number'}, {key: 'meal', label: T('Les repas (citation)'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year]});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', county: pl.county || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPerson(kind, parts, ctx, host) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, kind, {parts, force: true, detached: true});
        if (!n) host.innerHTML = '';
        return n > 0;
    }
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life l8a-life">${html}</div>` : '';
        return !!html;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'l8a_ciel', icon: '🌅', label: T('Les ciels étranges de sa vie'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('ciel', ['ciel'], ctx, host)},
        {id: 'l8a_maree', icon: '🌊', label: T('La marée du jour (naissance, mariage, décès au bord de la mer)'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('ciel', ['maree'], ctx, host)},
        {id: 'l8a_images', icon: '🖼️', label: T('Son métier en images'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('metier', ['images'], ctx, host)},
        {id: 'l8a_outils', icon: '🛠️', label: T('Les outils de son métier'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('metier', ['outils'], ctx, host)},
        {id: 'l8a_saint', icon: '😇', label: T('Le saint patron de son métier'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('metier', ['saint'], ctx, host)},
        {id: 'l8a_maladies', icon: '🦠', label: T('Les maladies de son métier'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('metier', ['maladies'], ctx, host)},
        {id: 'l8a_budget', icon: '💰', label: T('Le budget et les repas d’une famille comme la sienne (Le Play)'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson('metier', ['budget', 'repas'], ctx, host)},
        ...MONO.map(([kind, id, icon, label]) => ({id, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── 🔎 Où chercher : les sources non libres (pas dans l'app : un lien) ─────────── */
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
        const pid = Number(view?.pid) || 0; if (!pid || !body) return;
        body.querySelector('.l8a-ouc')?.remove();
        lifeOf(pid).then(async life => {
            if (!body.isConnected || body.querySelector('.l8a-ouc')) return;
            const items = [];
            const D = await soft('marees');
            const coastal = geoEvents(life).some(e => (D?.stations || []).some(st => km(Number(e.lat), Number(e.lon), st.lat, st.lon) < 400) && inEurope(Number(e.lat), Number(e.lon)));
            if (coastal && on('maree')) items.push(['🌊', T('Annuaire des marées du SHOM'), T('Les heures officielles des marées des ports français (données du SHOM, non libres : pas dans l’app). L’app calcule seulement pour quelques ports aux mesures libres.'), 'https://maree.shom.fr/']);
            if ((life.jobs || []).length && (on('budget') || on('repas'))) items.push(['💰', T('Les monographies de Le Play sur Gallica'), T('Les Ouvriers européens et Les Ouvriers des deux mondes : les budgets complets, page à page (Gallica, BnF).'), 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=%28gallica%20all%20%22ouvriers%20des%20deux%20mondes%22%29']);
            if (!items.length) return;
            const html = `<section class="ouc-plan l8a-ouc"><h3>🌊 ${esc(T('Marées et budgets d’autrefois'))} <small class="muted">${esc(T('sources hors de l’app'))}</small></h3><ul class="ouc-list">${items.map(([i, n, w, u]) => `<li class="ouc-tip"><span class="ouc-ico" aria-hidden="true">${i}</span><div class="ouc-main"><div class="ouc-name"><b>${esc(n)}</b></div><div class="ouc-why">${esc(w)}</div></div><div class="ouc-acts"><a class="button small secondary" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(T('↗ Ouvrir'))}</a></div></li>`).join('')}</ul></section>`;
            const at = body.querySelector('.ba-ouc') || body.querySelector('.bo-ouc') || body.querySelector('.ouc-plus') || body.querySelector('.ouc-facts');
            if (at) at.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        }).catch(() => {});
    });

    /* ─────────── ⚙️ Réglages → 🌅 Ciel, mer et métier ─────────── */
    async function drawSettings(token) {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(['ciels', 'marees', 'metiers', 'maladies', 'leplay', 'eaux', 'jardins'].map(async k => { const D = await soft(k); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l8a-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const count = (k, D) => k === 'ciels' ? D.events?.length : k === 'marees' ? D.stations?.length : k === 'metiers' ? Object.keys(D.trades || {}).length : (D.rows || D.list || []).length;
        const NAMES = {ciels: '🌅 Ciels étranges', marees: '🌊 Marées', metiers: '🖼️🛠️😇 Métiers (images, outils, saints)', maladies: '🦠 Maladies des métiers', leplay: '💰🍽️ Budgets et repas (Le Play)', eaux: '♨️ Villes d’eaux', jardins: '🏞️ Parcs et jardins'};
        const rows = Object.keys(NAMES).map(k => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(NAMES[k]))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            return `<tr><td>${esc(T(NAMES[k]))}</td><td>${link(D.url, D.source || D.title)}${D.note ? `<br><small class="muted">${esc(D.note)}</small>` : ''}</td><td>${esc(nf(count(k, D)))}</td><td>${esc(D.licence || '')}</td><td>${esc(D.built || D.checked || '')}</td></tr>`; }).join('');
        ws.innerHTML = `<section class="page cplus-settings l8a-settings" data-l8a-settings>${UI().pageHeader ? UI().pageHeader({title: T('Ciel, mer et métier'), icon: '🌅', where: T('Réglages · Données'), help: esc(T('Les ciels étranges, la marée du jour, les villes du même nom, les vieux plans, les villes d’eaux, les jardins, et le métier : images, outils, saint patron, maladies, budget et repas. Les données sont livrées avec l’app ; seuls les images et les vieux plans viennent d’Internet.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (blocs « 🌅 Ciel et mer de sa vie » et « 🛠️ Son métier autrefois »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('La marée est calculée par l’app (constantes harmoniques tirées des mesures libres de l’UHSLC) : c’est une estimation. Le SHOM, qui publie les marées officielles des ports français, n’a pas de licence libre : ses données ne sont pas dans l’app.'))}</p></div></section>`;
    }
    W.document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-l8a-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.l8aTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'epoque_travail'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B)) for (const [bid, title] of BLOCKS) if (!B.some(b => b[0] === bid)) { let i = B.findIndex(b => b[0] === 'epoque_travail'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, [bid, title]); }
        if (app.defaultPersonBlockSpans) BLOCKS.forEach(([bid]) => { app.defaultPersonBlockSpans[bid] ||= '12'; });
        return !!tabs;
    }
    if (!register()) W.document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.cielMetier = {...core, load, settings, personInto, placeInto, placePart, lifeOf, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
    return ext.cielMetier;
});
