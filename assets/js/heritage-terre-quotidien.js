/**
 * 🌍 Terre au quotidien : la vie de tous les jours autour d'une personne et d'un lieu, d'après des données livrées avec l'app
 * (assets/data/tq-*.json, refaites par scripts/terre-quotidien/build-terre-quotidien.py ; chaque ligne affichée dit sa source).
 *  - ☄️ Météorites tombées près de chez lui (NASA / Meteoritical Society) : des lignes en plus dans le bloc « ☄️ Il a pu voir… »
 *    (heritage-ciel-heure.js) ; sans ce bloc, dans le nôtre ;
 *  - 🌡️ Le climat de son année (HadCET, Berkeley Earth) : une ligne dans « 🌦 Météo de sa vie » (heritage-meteo.js) ; sans ce bloc,
 *    dans le nôtre ;
 *  - bloc de fiche « 🧺 Sa vie de tous les jours » : 🏔️ le glacier de son enfance (WGMS), 🌳 l'arbre qui l'a vu naître (Wikidata),
 *    🪙 la pièce dans sa poche à 20 ans (Wikipédia + image Commons), ⏳ l'espérance de vie à son âge (Insee) ;
 *  - fiche d'un village (et monographie) : 🏺 sites préhistoriques et antiques à moins de 10 km, 🌳 arbres remarquables tout près ;
 *  - Documents → ✉️ Lettres : « ✉️ 20 c le timbre » sous chaque lettre datée ; 🪙 Convertisseur d'autrefois : onglet « 🪙 Pièces et timbres » ;
 *  - Réglages → « 🧺 Vie de tous les jours » : chaque partie s'éteint (localStorage « genealogie-terre-quotidien ») + À propos des données ;
 *  - 🧰 LCNDA_EXT.dataSources : chaque partie utilisable quand on veut, pour n'importe quelle personne, lieu ou année.
 * Lecture seule : rien n'est écrit dans la généalogie. Calculs sans écran exportés pour Node (tests/test-terre-quotidien.js).
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };

    /* ═════════════ les calculs (sans écran : aussi pour Node) ═════════════ */
    const RAD = Math.PI / 180;
    /** la distance en km entre deux points */
    function km(a1, o1, a2, o2) {
        const s = Math.sin((a2 - a1) * RAD / 2) ** 2 + Math.cos(a1 * RAD) * Math.cos(a2 * RAD) * Math.sin((o2 - o1) * RAD / 2) ** 2;
        return 12742 * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    const nf = (v, d = 0) => Number(v).toLocaleString('fr-FR', {maximumFractionDigits: d, minimumFractionDigits: d});
    const kmTxt = k => (k < 1 ? T('moins d’1 km') : T('{n} km', {n: nf(k, k < 10 ? 1 : 0)}));
    const lenTxt = m => (Math.abs(m) >= 1000 ? T('{n} km', {n: nf(Math.abs(m) / 1000, 1)}) : T('{n} m', {n: nf(Math.round(Math.abs(m) / 10) * 10)}));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    const BIRTH = ['BIRT', 'CHR', 'BAPM'], DEATH = ['DEAT', 'BURI', 'CREM'];
    const fem = g => /^(f|female|femme)$/i.test(String(g || ''));
    const evPlace = e => {
        const lat = e.precise_lat != null && e.precise_lat !== '' ? e.precise_lat : e.latitude, lon = e.precise_lon != null && e.precise_lon !== '' ? e.precise_lon : e.longitude;
        return lat != null && lat !== '' && lon != null && lon !== '' && !(Number(lat) === 0 && Number(lon) === 0) && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) ? {lat: Number(lat), lon: Number(lon)} : null;
    };
    const yearOf = e => { const y = Number(e?.year) || Number(String(e?.sort_date || '').slice(0, 4)) || 0; return y > 0 ? y : 0; };
    /** ce qu'il faut savoir d'une fiche : années de naissance et de décès, sexe, lieux (avec position) */
    function lifeOf(detail, nowYear = new Date().getFullYear()) {
        const ev = detail?.events || [];
        const pick = tags => { for (const t of tags) { const e = ev.find(x => x.gedcom_tag === t && yearOf(x)); if (e) return e; } return null; };
        const b = pick(BIRTH), d = pick(DEATH), by = b ? yearOf(b) : 0, dy = d ? yearOf(d) : 0;
        const places = ev.map(e => { const p = evPlace(e); return p ? {...p, name: e.place_name || '', year: yearOf(e), tag: e.gedcom_tag || '', country: e.country || '', county: e.county || ''} : null; }).filter(Boolean);
        const bp = b ? evPlace(b) : null;
        const end = dy || (by ? Math.min(by + 90, nowYear) : 0);
        return {by, dy, end, alive: !dy, gender: detail?.person?.gender || '', first: detail?.person?.first_name || '', places,
            birthPlace: bp ? {...bp, name: b.place_name || '', country: b.country || '', county: b.county || ''} : null};
    }
    const he = life => (fem(life?.gender) ? T('Elle') : T('Il'));
    const ageTxt = n => (n <= 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n}));

    /* le pays d'un lieu : le nom écrit, sinon la position (pour les pays proches) */
    const COUNTRY_RE = [['FR', /^(france|fr|republique francaise|royaume de france|empire francais)$/], ['BE', /^(belgique|belgium|belgie|be)$/], ['CH', /^(suisse|switzerland|schweiz|svizzera|ch)$/],
        ['LU', /^(luxembourg|lu)$/], ['DE', /^(allemagne|germany|deutschland|de|prusse|baviere|wurtemberg|saxe|bade)$/], ['IT', /^(italie|italy|italia|it|piemont|sardaigne)$/],
        ['ES', /^(espagne|spain|espana|es)$/], ['NL', /^(pays bas|hollande|netherlands|nederland|nl)$/], ['AT', /^(autriche|austria|osterreich|at)$/], ['PT', /^(portugal|pt)$/],
        ['DK', /^(danemark|denmark|danmark|dk)$/], ['GB', /^(royaume uni|united kingdom|uk|gb|angleterre|england|ecosse|scotland|pays de galles|wales|grande bretagne|great britain)$/]];
    function countryOf(pl) {
        const c = fold(pl?.country);
        for (const [k, re] of COUNTRY_RE) if (re.test(c)) return k;
        if (c) return '';
        const lat = Number(pl?.lat), lng = Number(pl?.lon ?? pl?.lng); if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
        if (lat >= 49.44 && lat <= 50.19 && lng >= 5.73 && lng <= 6.53) return 'LU';
        if (lat >= 45.8 && lat <= 47.81 && lng >= 6.0 && lng <= 10.5 && !(lng < 7.0 && lat > 47.5)) return 'CH';
        if (lat >= 50.1 && lat <= 51.51 && lng >= 2.55 && lng <= 6.4 && lat > 50.75 - (lng - 2.55) * 0.12) return 'BE';
        if (lat >= 41.3 && lat <= 51.1 && lng >= -5.2 && lng <= 9.6) return 'FR';
        return '';
    }

    /* ─────────── ☄️ météorites ─────────── */
    /** les chutes observées pendant sa vie, à moins de `radius` km d'un de ses lieux : [{name, y, mass, km, place, age}] */
    function meteorites(M, life, radius = 100) {
        if (!M?.rows || !life?.by || !life.places.length) return [];
        const out = [];
        for (const [name, y, lat, lon, mass] of M.rows) {
            if (y < life.by || y > life.end) continue;
            let best = null;
            for (const p of life.places) { const k = km(lat, lon, p.lat, p.lon); if (k <= radius && (!best || k < best.km)) best = {km: k, place: p.name}; }
            if (best) out.push({name, y, mass, lat, lon, km: best.km, place: best.place, age: y - life.by});
        }
        return out.sort((a, b) => a.y - b.y);
    }
    const massTxt = g => (g == null ? '' : g >= 1000 ? T('{n} kg', {n: nf(g / 1000, g < 10000 ? 1 : 0)}) : T('{n} g', {n: nf(g)}));
    function meteoriteText(m, life) {
        const where = m.place ? T('à {d} de {p}', {d: kmTxt(m.km), p: m.place}) : T('à {d}', {d: kmTxt(m.km)});
        return T('En {y}, une météorite tombe du ciel {where} : celle de « {n} »{mass}.', {y: m.y, where, n: m.name, mass: m.mass ? ` (${massTxt(m.mass)})` : ''})
            + ' ' + (m.age <= 0 ? T('C’est l’année de sa naissance.') : T('{Il} avait {age}.', {Il: he(life), age: ageTxt(m.age)})) + (life.alive && m.age >= 60 ? ' ' + T('(s’il vivait encore)') : '');
    }

    /* ─────────── 🌡️ climat ─────────── */
    const ROMAN = n => { const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, l] of r) while (n >= v) { s += l; n -= v; } return s; };
    /** le siècle d'une année : 1816 → {from: 1801, to: 1900, label: 'XIXe siècle'} */
    const centuryOf = y => { const c = Math.ceil(y / 100); return {c, from: (c - 1) * 100 + 1, to: c * 100, label: T('{r}e siècle', {r: ROMAN(c)})}; };
    const NAMED_YEARS = {1816: 'l’année sans été', 1709: 'le grand hiver'};
    const SERIES_OF = cc => (cc === 'GB' ? ['CET', 'GB'] : [cc]);
    /** une année comparée à la moyenne de son siècle (au moins 30 années connues dans le siècle) */
    function climateYear(C, cc, y) {
        for (const key of SERIES_OF(cc)) {
            const s = C?.series?.[key]; if (!s) continue;
            const v = s.v[y - s.y0]; if (v == null) continue;
            const cen = centuryOf(y), vals = []; let kFrom = 0, kTo = 0;
            for (let k = cen.from; k <= cen.to; k++) { const x = s.v[k - s.y0]; if (x != null) { vals.push(x); kFrom ||= k; kTo = k; } }
            if (vals.length < 30) continue;
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            return {y, d: Math.round((v - mean) * 10) / 10, n: vals.length, century: cen, key, name: s.n, src: s.src, url: s.url, licence: s.licence, partial: vals.length < 100, kFrom, kTo};
        }
        return null;
    }
    const inName = n => (/^(Angleterre)/.test(n) ? `en ${n}` : /^(Pays-Bas)$/.test(n) ? `aux ${n}` : /^(Portugal|Danemark|Royaume-Uni|Luxembourg)$/.test(n) ? `au ${n}` : `en ${n}`);
    function climateText(r, what = 'birth') {
        const lead = what === 'birth' ? T('L’année de sa naissance ({y})', {y: r.y}) : T('L’année {y}', {y: r.y});
        const cen = r.partial ? T('des années {a}–{b}', {a: r.kFrom, b: r.kTo}) : T('du {s}', {s: r.century.label});
        const body = Math.abs(r.d) < 0.3 ? T('{lead} a été proche de la moyenne {cen} {pays}', {lead, cen, pays: inName(r.name)})
            : T('{lead} a été {d} °C plus {mot} que la moyenne {cen} {pays}', {lead, d: nf(Math.abs(r.d), 1), mot: r.d < 0 ? T('froide') : T('chaude'), cen, pays: inName(r.name)});
        return body + (NAMED_YEARS[r.y] ? ` — « ${T(NAMED_YEARS[r.y])} »` : '') + '.';
    }
    /** les années les plus froide et la plus chaude de sa vie (écart au siècle) */
    function climateExtremes(C, cc, life) {
        if (!life?.by) return null; let lo = null, hi = null;
        for (let y = life.by; y <= life.end; y++) { const r = climateYear(C, cc, y); if (!r) continue; if (!lo || r.d < lo.d) lo = r; if (!hi || r.d > hi.d) hi = r; }
        return lo && hi && lo.y !== hi.y ? {lo, hi} : null;
    }
    function climateFor(C, life) {
        const pl = life?.birthPlace || life?.places?.[0]; if (!pl || !life.by) return null;
        const cc = countryOf(pl); if (!cc) return null;
        const r = climateYear(C, cc, life.by); return r ? {...r, cc, extremes: climateExtremes(C, cc, life)} : null;
    }

    /* ─────────── 🏔️ glaciers ─────────── */
    /** le glacier le plus proche (moins de `radius` km d'un lieu de sa vie) avec un relevé de son vivant, au plus près de ses 10 ans */
    function glacierFor(G, life, radius = 50) {
        if (!G?.glaciers || !life?.by || !life.places.length) return null;
        let best = null;
        for (const g of G.glaciers) {
            let near = null;
            for (const p of life.places) { const k = km(g.lat, g.lon, p.lat, p.lon); if (k <= radius && (!near || k < near.km)) near = {km: k, place: p.name}; }
            if (!near) continue;
            const pts = g.p.filter(([y]) => y >= life.by && y <= life.end && y < g.last); if (!pts.length) continue;
            const want = life.by + 10, pt = pts.reduce((a, b) => (Math.abs(b[0] - want) < Math.abs(a[0] - want) ? b : a));
            const c = {g, ...near, y: pt[0], m: pt[1], age: pt[0] - life.by};
            if (!best || c.km < best.km) best = c;
        }
        return best;
    }
    function glacierText(r, life) {
        const when = r.age <= 0 ? T('l’année de sa naissance') : T('à {age}', {age: ageTxt(r.age)});
        const what = Math.abs(r.m) < 30 ? T('le front du glacier « {n} » était à peu près au même endroit qu’en {last}', {n: r.g.n, last: r.g.last})
            : r.m > 0 ? T('le front du glacier « {n} » descendait {l} plus bas qu’en {last}', {n: r.g.n, l: lenTxt(r.m), last: r.g.last})
                : T('le front du glacier « {n} » s’arrêtait {l} plus haut qu’en {last}', {n: r.g.n, l: lenTxt(r.m), last: r.g.last});
        return T('En {y} ({when}), {what}', {y: r.y, when, what}) + (r.place ? T(' — à {d} de {p}.', {d: kmTxt(r.km), p: r.place}) : '.');
    }

    /* ─────────── 🌳 arbres et 🏺 sites ─────────── */
    /** les lignes d'un fichier (arbres ou sites) à moins de `radius` km : [{row, km}] du plus proche au plus loin */
    function near(D, lat, lon, radius) {
        if (!D?.rows || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        const dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * RAD))), out = [];
        for (const r of D.rows) { if (Math.abs(r[2] - lat) > dLat || Math.abs(r[3] - lon) > dLon) continue; const k = km(lat, lon, r[2], r[3]); if (k <= radius) out.push({row: r, km: k}); }
        return out.sort((a, b) => a.km - b.km);
    }
    /** l'âge d'un arbre une année donnée : {age, min (au moins)} ou null (pas de date, ou planté plus tard) */
    function treeAge(row, y) {
        const ty = row[4], pr = row[5]; if (ty == null || !y) return null;
        if (pr >= 9) return y >= ty ? {age: y - ty, min: false} : null;
        if (pr === 8) { const end = Math.floor(ty / 10) * 10 + 9; return y >= end ? {age: y - end, min: true} : null; }
        if (pr === 7) { const c = Math.ceil(ty / 100) || 1, end = c * 100; return y >= end ? {age: y - end, min: true} : null; }
        return null;
    }
    const plantedTxt = row => { const ty = row[4], pr = row[5]; if (ty == null) return ''; if (pr >= 9) return String(ty); if (pr === 8) return T('les années {d}', {d: Math.floor(ty / 10) * 10}); if (pr === 7) return T('le {s}', {s: centuryOf(ty === Math.ceil(ty / 100) * 100 ? ty : ty).label}); return ''; };
    /** l'arbre daté le plus proche de son lieu de naissance (10 km) qui existait déjà à sa naissance */
    function treeFor(TR, life, radius = 10) {
        if (!life?.by) return null;
        const spots = life.birthPlace ? [life.birthPlace] : life.places.filter(p => p.year && p.year <= life.by + 5);
        for (const pl of spots) {
            const hit = near(TR, pl.lat, pl.lon, radius).map(x => ({...x, a: treeAge(x.row, life.by)})).find(x => x.a && x.a.age >= 1);
            if (hit) return {row: hit.row, km: hit.km, place: pl.name, age: hit.a.age, min: hit.a.min};
        }
        return null;
    }
    const capital = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    function treeText(r, life) {
        const ag = r.min ? T('au moins {n} ans', {n: r.age}) : T('{n} ans', {n: r.age});
        return T('{arbre}{ou} avait déjà {ag} quand {il} est {ne}.', {arbre: capital(r.row[1]), ou: r.km >= 1 ? ` (${T('à {d} de {p}', {d: kmTxt(r.km), p: r.place || T('son lieu de naissance')})})` : '',
            ag, il: fem(life.gender) ? T('elle') : T('il'), ne: fem(life.gender) ? T('née') : T('né')});
    }
    const SITE_ICON = {grotte: '🎨', abri: '🪨', prehist: '🦴', dolmen: '🪨', menhir: '🗿', tumulus: '⛰️', oppidum: '🏰', villa: '🏛️', romain: '🏛️', necropole: '⚱️', gravure: '🪨', site: '🏺'};
    const SITE_WORD = {grotte: ['grotte ornée', 'grottes ornées'], abri: ['abri sous roche', 'abris sous roche'], prehist: ['site préhistorique', 'sites préhistoriques'], dolmen: ['dolmen', 'dolmens'],
        menhir: ['menhir ou pierre dressée', 'menhirs ou pierres dressées'], tumulus: ['tumulus', 'tumulus'], oppidum: ['oppidum ou enceinte', 'oppidums ou enceintes'], villa: ['villa romaine', 'villas romaines'],
        romain: ['site romain', 'sites romains'], necropole: ['nécropole', 'nécropoles'], gravure: ['roche gravée', 'roches gravées'], site: ['site archéologique', 'sites archéologiques']};
    const SITE_ORDER = ['grotte', 'abri', 'prehist', 'dolmen', 'menhir', 'tumulus', 'oppidum', 'villa', 'romain', 'necropole', 'gravure', 'site'];
    function sitesSummary(list) {
        const by = new Map(); list.forEach(x => by.set(x.row[4], (by.get(x.row[4]) || 0) + 1));
        return SITE_ORDER.filter(k => by.has(k)).map(k => { const n = by.get(k), w = SITE_WORD[k] || [k, k]; return `${n} ${T(n > 1 ? w[1] : w[0])}`; });
    }

    /* ─────────── 🪙 pièces, ✉️ timbres, ⏳ espérance de vie ─────────── */
    /** les pièces d'usage courant une année (pays FR par défaut) */
    const coinsAt = (P, y, cc = 'FR') => (P?.items || []).filter(c => (c.cc || 'FR') === cc && y >= c.from && y <= c.to);
    /** le tarif de la lettre simple à une date (AAAA-MM-JJ, ou une année) */
    function stampAt(R, date) {
        const s = typeof date === 'number' ? String(date) : String(date || ''); if (!/^\d{4}/.test(s)) return null;
        const exact = /^\d{4}-\d{2}-\d{2}/.test(s), d = exact ? s.slice(0, 10) : null, y = s.slice(0, 4);
        // les tarifs connus : des périodes [from, to] (les trous restent des trous : pas de tarif deviné)
        const rates = R?.rates || [];
        const hits = exact ? rates.filter(r => r.from <= d && d <= r.to) : rates.filter(r => r.from.slice(0, 4) <= y && r.to.slice(0, 4) >= y);
        if (!hits.length) return null;
        const hit = hits[hits.length - 1];
        // à l'année près, une année de changement : deux tarifs possibles
        const other = !exact && hits.length > 1 && hits[0].label !== hit.label ? hits[0] : null;
        // à l'année près, l'année où ce tarif commence (pas au 1er janvier) : celui d'avant valait peut-être encore
        const midYear = !exact && hit.from.slice(0, 4) === y && hit.from.slice(5) !== '01-01';
        return {...hit, unsure: !!other || midYear || (!exact && !!hit.yearOnly), other, midYear};
    }
    /** l'espérance de vie restante à un âge, une année, pour un sexe ('M' | 'F') : {e, year, age} ou null */
    function lifeExpAt(E, sex, age, year) {
        const t = E?.tables; if (!t?.length) return null;
        const ages = E.ages || []; let a = null; for (const x of ages) if (x <= age) a = x; if (a == null) return null;
        let best = null; for (const r of t) if (Math.abs(r.y - year) <= (E.gap || 0) && (!best || Math.abs(r.y - year) < Math.abs(best.y - year))) best = r;
        if (!best) return null;
        const v = best[sex === 'F' ? 'f' : 'm']?.[ages.indexOf(a)]; return v == null ? null : {e: v, year: best.y, age: a, src: best.src || E.src};
    }
    function lifeExpFor(E, life) {
        if (!life?.by) return null; const sex = fem(life.gender) ? 'F' : /^(m|male|homme)$/i.test(String(life.gender || '')) ? 'M' : ''; if (!sex) return null;
        const ages = (E?.ages || []).filter(a => a >= 20).slice().reverse();
        for (const a of ages) {
            const y = life.by + a; if (life.dy && y > life.dy) continue; if (y > life.end) continue;
            const r = lifeExpAt(E, sex, a, y); if (r && r.age === a) return {...r, sex, lived: life.dy ? life.dy - y : null};
        }
        return null;
    }
    function lifeExpText(r) {
        const who = r.sex === 'F' ? T('une femme') : T('un homme');
        let s = T('À {a} ans, en {y}, {qui} pouvait espérer vivre encore {e} ans en moyenne.', {a: r.age, y: r.year, qui: who, e: nf(r.e, 1)});
        if (r.lived != null) s += ' ' + (r.lived <= 0 ? T('Cette année-là fut la dernière.') : T('{Il} en a vécu {n}.', {Il: r.sex === 'F' ? T('Elle') : T('Il'), n: r.lived}));
        return s;
    }

    const core = {km, lifeOf, countryOf, meteorites, meteoriteText, centuryOf, climateYear, climateText, climateFor, climateExtremes, glacierFor, glacierText,
        near, treeAge, treeFor, treeText, plantedTxt, sitesSummary, coinsAt, stampAt, lifeExpAt, lifeExpFor, lifeExpText, SITE_ORDER};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const link = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>` : esc(text));
    const wd = q => `https://www.wikidata.org/wiki/${q}`;
    const wp = t => `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;
    const commonsThumb = (f, w = 96) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(f).replace(/ /g, '_'))}?width=${w}`;
    const commonsPage = f => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(f).replace(/ /g, '_'))}`;

    /* réglages : chaque partie s'éteint (allumée au départ) */
    const KEY = 'genealogie-terre-quotidien';
    const PARTS = [['meteorites', '☄️ Météorites tombées près de chez lui', 'Dans « ☄️ Il a pu voir… » : les chutes de météorites observées à moins de 100 km d’un de ses lieux, de son vivant.'],
        ['climat', '🌡️ Le climat de son année', 'Dans « 🌦 Météo de sa vie » : l’année de sa naissance, plus froide ou plus chaude que la moyenne de son siècle.'],
        ['glacier', '🏔️ Le glacier de son enfance', 'Quand un glacier suivi des Alpes ou des Pyrénées est à moins de 50 km d’un lieu de sa vie.'],
        ['arbre', '🌳 L’arbre qui l’a vu naître', 'Un arbre remarquable daté, à moins de 10 km de son lieu de naissance ; et les arbres remarquables sur la fiche d’un village.'],
        ['sites', '🏺 Sites préhistoriques et antiques', 'Sur la fiche d’un village : dolmens, menhirs, grottes ornées, oppidums, villas romaines… à moins de 10 km.'],
        ['poche', '🪙 La pièce dans sa poche', 'Les pièces de monnaie de tous les jours quand il avait 20 ans (France).'],
        ['timbre', '✉️ Le prix d’un timbre', 'Dans Documents → ✉️ Lettres : ce qu’a coûté l’envoi d’une lettre simple en France.'],
        ['esperance', '⏳ Espérance de vie à son âge', 'Les années qu’un homme ou une femme de son âge pouvait espérer vivre encore (France, Insee).']];
    const settings = () => { const d = Object.fromEntries(PARTS.map(p => [p[0], true])); try { return {...d, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {})}; } catch (_) { return d; } };
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };

    /* les données : chargées une fois, au besoin */
    const DATA_V = 1, once = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ce fichier de données.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const FILES = {meteorites: 'tq-meteorites.json', climat: 'tq-climat.json', glaciers: 'tq-glaciers.json', arbres: 'tq-arbres.json.gz', sites: 'tq-sites.json.gz', poche: 'tq-poche.json', timbre: 'tq-timbre.json', esperance: 'tq-esperance.json'};
    const load = k => (once[k] ||= fetch(`assets/data/${FILES[k]}?v=${DATA_V}`, {credentials: 'same-origin'})
        .then(r => { if (!r.ok) throw new Error(T('Fichier de données introuvable : {f}', {f: FILES[k]})); return readMaybeGz(r); }).catch(e => { delete once[k]; throw e; }));
    const tryLoad = k => load(k).catch(() => null);

    const row = (icon, html, src, more = '') => `<div class="tq-row"><span class="tq-i" aria-hidden="true">${icon}</span><div class="tq-t"><p>${html}</p>${more}${src ? `<small class="tq-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const fold1 = (inner, label = T('▸ plus')) => (inner ? `<details class="tq-more"><summary>${esc(label)}</summary>${inner}</details>` : '');
    const emptyLine = (text, icon = 'ℹ️') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${icon}</span><span class="empty-line-text">${esc(text)}</span></p>`;
    const personDetail = async p => (p?.person && p?.events ? p : (Number(p?.id || p) ? await A().api('person', {id: Number(p?.id || p)}) : null));

    /* ─────────── les morceaux (réutilisés par 🧰 Données) ─────────── */
    async function meteoritesHtml(life) {
        const M = await tryLoad('meteorites'); const list = meteorites(M, life); if (!list.length) return '';
        const src = link(M.url, T('NASA, Meteorite Landings (The Meteoritical Society)'));
        const lui = fem(life.gender) ? T('elle') : T('lui');
        const lead = list.length === 1 ? `🌠 ${meteoriteText(list[0], life)}`
            : T('🌠 Des météorites sont tombées près de chez {lui} : {l}.', {lui, l: list.map(m => T('« {n} » ({y}, à {age})', {n: m.name, y: m.y, age: ageTxt(m.age)})).join(', ')});
        const items = list.map(m => `<li data-kind="meteorite"><span class="ch-seen-ico" aria-hidden="true">🌠</span><div><strong>${esc(meteoriteText(m, life))}</strong>
            <small class="ch-src">${esc(T('Source :'))} ${src} · ${esc(T('classe {c}', {c: M.rows.find(r => r[0] === m.name)?.[5] || '?'}))} · ${link(`https://www.lpi.usra.edu/meteor/metbull.php?sea=${encodeURIComponent(m.name)}&srt=name&lrec=50&map=ge`, T('Meteoritical Bulletin'))}</small></div></li>`).join('');
        return `<div class="tq-met"><p class="ch-seen-lead">${esc(lead)}</p>${fold1(`<ul class="ch-seen-list">${items}</ul><p class="muted"><small>${esc(T('Chutes observées à moins de 100 km d’un de ses lieux, de son vivant. La base donne l’année, pas le jour.'))}</small></p>`)}</div>`;
    }
    async function climateHtml(life, {compact = false} = {}) {
        const C = await tryLoad('climat'); const r = C && climateFor(C, life); if (!r) return '';
        const ex = r.extremes, src = `${link(r.url, r.key === 'CET' ? 'Met Office HadCET' : 'Berkeley Earth')} (${esc(r.licence)})`;
        const more = ex ? `<p class="muted">${esc(T('Pendant sa vie, l’année la plus froide : {a} ({da} °C) ; la plus chaude : {b} (+{db} °C), par rapport à la moyenne de leur siècle {pays}.', {a: ex.lo.y, da: nf(ex.lo.d, 1), b: ex.hi.y, db: nf(ex.hi.d, 1), pays: inName(r.name)}))}</p>` : '';
        const note = `<p class="muted"><small>${esc(T('Moyenne de l’année entière (12 mois), comparée à la moyenne des années du même siècle. Série : {s}.', {s: r.src}))}</small></p>`;
        if (compact) return `<div class="tq-clim" data-tq-clim>🌡️ ${esc(climateText(r))}${fold1(more + note + `<small class="tq-src">${esc(T('Source :'))} ${src}</small>`)}</div>`;
        return row('🌡️', esc(climateText(r)), src, fold1(more + note));
    }
    async function glacierHtml(life) {
        const G = await tryLoad('glaciers'); const r = glacierFor(G, life); if (!r) return '';
        const pts = r.g.p.filter(([y]) => y >= life.by && y <= life.end);
        const more = pts.length > 1 ? `<p class="muted">${esc(T('Relevés de son vivant : {l}.', {l: pts.filter((_, i) => i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1).map(([y, m]) => `${y} : ${m >= 0 ? '+' : '−'}${lenTxt(m)}`).join(' · ')}))}</p><p class="muted"><small>${esc(T('« + » : le glacier descendait plus bas que lors du dernier relevé ({last}). Calculé en additionnant les variations de longueur mesurées ou reconstituées.', {last: r.g.last}))}</small></p>` : '';
        return row('🏔️', esc(glacierText(r, life)), `${link(`https://wgms.ch/products_fog/`, 'WGMS, Fluctuations of Glaciers')} · ${esc(T('glacier n° {id}', {id: r.g.id}))}`, fold1(more));
    }
    async function treeHtml(life) {
        const TR = await tryLoad('arbres'); const r = TR && treeFor(TR, life); if (!r) return '';
        const extra = [r.row[6], plantedTxt(r.row) && T('planté ou né : {p}', {p: plantedTxt(r.row)})].filter(Boolean).join(' · ');
        return row('🌳', esc(treeText(r, life)), `${link(wd(r.row[0]), 'Wikidata')}${r.row[8] ? ` · ${link(wp(r.row[8]), 'Wikipédia')}` : ''} (CC0)`, extra ? `<p class="muted"><small>${esc(extra)}</small></p>` : '');
    }
    const coinImg = c => (c.img ? `<a class="tq-coin" href="${esc(commonsPage(c.img))}" target="_blank" rel="noopener noreferrer" title="${esc(T('Image : {c}', {c: c.credit || 'Wikimedia Commons'}))}"><img src="${esc(commonsThumb(c.img))}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('a').remove()"></a>` : '');
    const coinSrc = c => `${link(c.url, c.src || 'Wikipédia')}${c.img ? ` · ${esc(T('image'))} ${link(commonsPage(c.img), c.credit || 'Wikimedia Commons')}${c.licence ? ` (${esc(c.licence)})` : ''}` : ''}`;
    async function pocheHtml(life) {
        if (!life?.by) return ''; const y = life.by + 20; if (y > life.end) return '';
        const P = await tryLoad('poche'); const list = coinsAt(P, y); if (!list.length) return '';
        const main = list[0];
        const more = list.length > 1 ? `<ul class="tq-coins">${list.slice(1).map(c => `<li>${coinImg(c)}<span><b>${esc(c.name)}</b> <small class="muted">${esc(T('frappée de {a} à {b}', {a: c.from, b: c.to}))}</small><br><small class="tq-src">${coinSrc(c)}</small></span></li>`).join('')}</ul>` : '';
        return `<div class="tq-row"><span class="tq-i" aria-hidden="true">🪙</span><div class="tq-t tq-pocket">${coinImg(main)}<div><p>${esc(T('Dans sa poche, à 20 ans ({y}) : {c} (frappée de {a} à {b}).', {y, c: main.name, a: main.from, b: main.to}))}</p>
            ${fold1(more, T('▸ les autres pièces de l’époque'))}<small class="tq-src">${esc(T('Source :'))} ${coinSrc(main)}</small></div></div></div>`;
    }
    async function esperanceHtml(life) {
        const E = await tryLoad('esperance'); const r = E && lifeExpFor(E, life); if (!r) return '';
        return row('⏳', esc(lifeExpText(r)), `${link(E.url, E.srcShort || 'Insee')} (${esc(E.licence)})`, fold1(`<p class="muted"><small>${esc(E.note || '')}</small></p>`));
    }

    /* ─────────── 🧺 le bloc de la fiche ─────────── */
    const details = new Map();
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.terre_quotidien = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        const s = settings(); if (!['glacier', 'arbre', 'poche', 'esperance', 'climat', 'meteorites'].some(k => s[k])) return '';
        details.set(Number(p.id), detail);
        return A().card(index, T('🧺 Sa vie de tous les jours'), '', `<div class="tq-life" data-tq-life="${Number(p.id)}"></div>`, 'span-6');
    };
    /** tout le contenu du bloc pour une fiche ('' : rien à dire) ; `skip` : les parties montrées ailleurs (climat, météorites) */
    async function personHtml(detail, {skip = [], only = null} = {}) {
        const s = settings(), life = lifeOf(detail), on = k => (only ? only.includes(k) : s[k] && !skip.includes(k));
        const parts = await Promise.all([on('climat') ? climateHtml(life) : '', on('glacier') ? glacierHtml(life) : '', on('arbre') ? treeHtml(life) : '',
            on('poche') ? pocheHtml(life) : '', on('esperance') ? esperanceHtml(life) : '',
            on('meteorites') ? meteoritesHtml(life) : '']);
        return parts.filter(Boolean).join('');
    }
    const hostOf = pid => document.querySelector(`#workspace [data-tq-life="${pid}"]`);
    // les blocs voisins où vont le climat et les météorites (s'ils sont sur la fiche)
    const skyHost = pid => document.querySelector(`#workspace [data-ch-seen="${pid}"]`);
    const wxHost = pid => document.querySelector(`#workspace [data-wx-life="${pid}"]`);
    async function fillPerson(detail) {
        const pid = Number(detail?.person?.id); if (!pid) return;
        const s = settings(), skip = [];
        if (s.meteorites && skyHost(pid)) { skip.push('meteorites'); intoSky(detail); }
        if (s.climat && wxHost(pid)) { skip.push('climat'); intoWeather(detail); }
        const host = hostOf(pid); if (!host) return;
        const card = host.closest('section.card') || host;
        let html = ''; try { html = await personHtml(detail, {skip}); } catch (e) { console.error(e); }
        if (!host.isConnected) return;
        if (!html) { card.hidden = true; return; } // rien à dire : pas de bloc vide
        card.hidden = false; host.innerHTML = html;
    }
    /* ☄️ dans « Il a pu voir… » : nos lignes après les comètes ; quand il n'y a pas de comète (bloc caché), le bloc revient avec nos lignes */
    function intoSky(detail) {
        const pid = Number(detail.person.id), host = skyHost(pid); if (!host) return;
        const life = lifeOf(detail);
        meteoritesHtml(life).then(html => {
            if (!html || !host.isConnected) return;
            const put = () => {
                if (!host.isConnected || host.querySelector('.tq-met')) return;
                const card = host.closest('section.card');
                if (card?.hidden || !host.textContent.trim()) { if (card) card.hidden = false; host.insertAdjacentHTML('beforeend', html); }
                else host.insertAdjacentHTML('beforeend', `<div class="tq-sky">${html}</div>`);
            };
            put();
            // « Il a pu voir… » se remplit peut-être après nous : on se remet en place
            const mo = new MutationObserver(() => { if (!host.isConnected) { mo.disconnect(); return; } if (!host.querySelector('.tq-met')) { mo.disconnect(); put(); watch(); } });
            const watch = () => { mo.observe(host, {childList: true}); const card = host.closest('section.card'); if (card) mo.observe(card, {attributes: true, attributeFilter: ['hidden']}); };
            const cardMo = new MutationObserver(() => { const card = host.closest('section.card'); if (card?.hidden && host.querySelector('.tq-met')) card.hidden = false; });
            const card = host.closest('section.card'); if (card) cardMo.observe(card, {attributes: true, attributeFilter: ['hidden']});
            watch(); setTimeout(() => { mo.disconnect(); cardMo.disconnect(); }, 15000);
        });
    }
    /* 🌡️ dans « Météo de sa vie » : une ligne sous les jours de sa vie */
    function intoWeather(detail) {
        const pid = Number(detail.person.id), host = wxHost(pid); if (!host) return;
        climateHtml(lifeOf(detail), {compact: true}).then(html => {
            if (!html) return;
            const put = () => { if (host.isConnected && !host.querySelector('[data-tq-clim]')) host.insertAdjacentHTML('beforeend', html); };
            put();
            const mo = new MutationObserver(() => { if (!host.isConnected) return mo.disconnect(); put(); });
            mo.observe(host, {childList: true}); setTimeout(() => mo.disconnect(), 20000);
        });
    }
    (ext.afterPerson = ext.afterPerson || []).push(detail => { const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return; details.set(pid, detail); setTimeout(() => fillPerson(detail), 0); });

    /* ─────────── 🏺 🌳 la fiche d'un village (et la monographie) ─────────── */
    async function placeHtml(place, {only = null} = {}) {
        const s = settings(), on = k => (only ? only.includes(k) : s[k]);
        const lat = Number(place?.lat), lon = Number(place?.lon); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
        const out = [];
        if (on('sites')) {
            const S = await tryLoad('sites'), list = near(S, lat, lon, 10);
            if (list.length) {
                const sum = sitesSummary(list);
                out.push(`<section class="maintenance-panel tq-panel" data-tq-part="sites"><h3>${esc(T('🏺 Préhistoire et Antiquité autour du village'))} <small class="muted">${esc(T('à moins de 10 km'))}</small></h3>
                    <p>${esc(list.length > 1 ? T('{n} sites anciens à moins de 10 km : {l}.', {n: list.length, l: sum.join(', ')}) : T('Un site ancien à moins de 10 km : {l}.', {l: sum.join(', ')}))} ${esc(T('Le plus proche : {n}, à {d}.', {n: list[0].row[1], d: kmTxt(list[0].km)}))}</p>
                    ${fold1(`<ul class="tq-sites">${list.slice(0, 60).map(x => `<li><span aria-hidden="true">${SITE_ICON[x.row[4]] || '🏺'}</span> <b>${esc(x.row[1])}</b> <small class="muted">${esc(T((SITE_WORD[x.row[4]] || ['site'])[0]))} · ${esc(kmTxt(x.km))}</small> ${x.row[5] ? link(wp(x.row[5]), 'Wikipédia') : link(wd(x.row[0]), 'Wikidata')}</li>`).join('')}</ul>${list.length > 60 ? `<p class="muted">${esc(T('… et {n} autres.', {n: list.length - 60}))}</p>` : ''}`)}
                    <small class="tq-src">${esc(T('Source :'))} ${link('https://www.wikidata.org/', 'Wikidata')} (CC0) — ${esc(T('les sites décrits sur Wikidata, pas tous les sites connus.'))}</small></section>`);
            }
        }
        if (on('arbre')) {
            const TR = await tryLoad('arbres'), list = near(TR, lat, lon, 10).slice(0, 12);
            if (list.length) {
                const dated = list.find(x => x.row[4] != null), now = new Date().getFullYear(), a = dated && treeAge(dated.row, now);
                const lead = dated && a ? T('{n} : {age} aujourd’hui ({d}).', {n: capital(dated.row[1]), age: a.min ? T('au moins {n} ans', {n: a.age}) : T('{n} ans', {n: a.age}), d: kmTxt(dated.km)})
                    : T('{n} arbre(s) remarquable(s) à moins de 10 km ; le plus proche : {a}, à {d}.', {n: list.length, a: list[0].row[1], d: kmTxt(list[0].km)});
                out.push(`<section class="maintenance-panel tq-panel" data-tq-part="arbres"><h3>${esc(T('🌳 Arbres remarquables'))} <small class="muted">${esc(T('à moins de 10 km'))}</small></h3><p>${esc(lead)}</p>
                    ${fold1(`<ul class="tq-sites">${list.map(x => `<li><span aria-hidden="true">🌳</span> <b>${esc(x.row[1])}</b> <small class="muted">${esc([x.row[6], plantedTxt(x.row) && T('planté ou né : {p}', {p: plantedTxt(x.row)}), kmTxt(x.km)].filter(Boolean).join(' · '))}</small> ${x.row[8] ? link(wp(x.row[8]), 'Wikipédia') : link(wd(x.row[0]), 'Wikidata')}</li>`).join('')}</ul>`)}
                    <small class="tq-src">${esc(T('Source :'))} ${link('https://www.wikidata.org/', 'Wikidata')} (CC0)</small></section>`);
            }
        }
        return out.length ? `<div class="tq-place">${out.join('')}</div>` : '';
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tq_place', host: '.tq-place', icon: '🌍', label: 'Terre au quotidien', group: 'Autour'});
    function decoratePlace() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tq])');
        if (village) {
            const pli = village.querySelector('[data-pli-host]'); if (!pli) return;
            village.dataset.tq = '1';
            const place = {lat: pli.dataset.pliLat, lon: pli.dataset.pliLon, name: pli.dataset.pliName || ''};
            if (place.lat === '' || place.lon === '') return;
            placeHtml(place).then(html => {
                if (!html || !village.isConnected) return;
                const anchor = village.querySelector('.cplus-place') || village.querySelector('.h-village-grid') || village.querySelector('[data-vsec="stats"]');
                if (anchor) anchor.insertAdjacentHTML('afterend', html); else village.insertAdjacentHTML('beforeend', html);
            });
            return;
        }
        // la Monographie de commune : des parties déclarées (LCNDA_EXT.monographSections, plus bas), pas d'insertion ici
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decoratePlace(); decorateLetters(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune : deux parties (registre commun, heritage-monographie-plus.js) ─────────── */
    const monoRender = k => async (place, host) => {
        const html = await placeHtml({lat: place?.latitude ?? place?.lat, lon: place?.longitude ?? place?.lon, name: place?.name}, {only: [k]});
        if (!html) return false;
        const box = document.createElement('div'); box.innerHTML = html;
        const sec = box.querySelector('section.tq-panel'); if (!sec) return false;
        sec.querySelector('h3')?.remove();
        host.replaceChildren(...sec.childNodes);
        return true;
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'tq_sites', icon: '🏺', label: T('Préhistoire et Antiquité autour du village'), group: 'Le lieu', defaultOn: true, enabled: () => settings().sites, source: 'Wikidata (CC0)', render: monoRender('sites')},
        {id: 'tq_arbres', icon: '🌳', label: T('Arbres remarquables'), group: 'Le lieu', defaultOn: true, enabled: () => settings().arbre, source: 'Wikidata (CC0)', render: monoRender('arbre')});

    /* ─────────── ✉️ Documents → Lettres : le prix du timbre ─────────── */
    const stampTxt = r => T('✉️ {p} le timbre', {p: r.label}) + (r.other ? ' ' + T('(ou {n} : le tarif a changé cette année-là)', {n: r.other.label}) : r.midYear ? ' ' + T('(à partir du {d})', {d: r.from.split('-').reverse().join('/')}) : '');
    const sinceTxt = r => (r.yearOnly ? T('tarif connu pour {y}', {y: r.from.slice(0, 4)}) : T('tarif du {d}', {d: r.from.split('-').reverse().join('/')}));
    let timbre = null;
    function decorateLetters() {
        if (!settings().timbre) return;
        const rows = document.querySelectorAll('#workspace .ong-fil .ong-piece-main[data-ong-doc]:not([data-tq-stamp])'); if (!rows.length) return;
        if (!timbre) { tryLoad('timbre').then(R => { timbre = R || {rates: []}; decorateLetters(); }); return; }
        const dayOf = root.LCNDA_CORRESP?.dayOf;
        rows.forEach(b => {
            b.dataset.tqStamp = '1';
            const small = b.querySelector('.ong-txt small'); if (!small) return;
            const [date, sort] = small.textContent.split(' · ');
            if (/carte|t[ée]l[ée]gramme|colis|faire-part/i.test(sort || '')) return; // le tarif de la lettre seulement
            const d = dayOf ? dayOf(date) : null; if (!d) return;
            const iso = d.precision === 'day' ? new Date(d.day * 864e5).toISOString().slice(0, 10) : d.year;
            const r = stampAt(timbre, iso); if (!r) return;
            small.insertAdjacentHTML('afterend', `<small class="tq-stamp" title="${esc(T('Lettre simple pour la France, {t} — source : {s}', {t: sinceTxt(r), s: r.src}))}">${esc(stampTxt(r))}</small>`);
        });
    }

    /* ─────────── 🪙 Convertisseur d'autrefois : onglet « Pièces et timbres » ─────────── */
    function mountPocket(pane, {year} = {}) {
        pane.innerHTML = `<div class="af-fields"><label class="af-field af-year"><span>${esc(T('L’année'))}</span><input type="number" min="1600" max="2030" data-tq-year value="${esc(String(Number(year) || 1900))}"></label></div>
            <p class="af-examples">${esc(T('Exemples :'))} ${[1789, 1815, 1868, 1900, 1925, 1945, 1965, 1995].map(y => `<button type="button" class="link-button" data-tq-ex="${y}">${y}</button>`).join(' · ')}</p><div class="af-out" data-tq-out aria-live="polite"></div>`;
        const draw = async () => {
            const y = Math.round(Number(pane.querySelector('[data-tq-year]').value)) || 0, out = pane.querySelector('[data-tq-out]');
            const [P, R] = await Promise.all([tryLoad('poche'), tryLoad('timbre')]);
            const coins = coinsAt(P, y), st = stampAt(R, y);
            out.innerHTML = `<h4 class="af-h">${esc(T('🪙 Les pièces de tous les jours en {y}', {y}))}</h4>${coins.length ? `<ul class="tq-coins">${coins.map(c => `<li>${coinImg(c)}<span><b>${esc(c.name)}</b> <small class="muted">${esc(T('frappée de {a} à {b}', {a: c.from, b: c.to}))}</small><br><small class="tq-src">${coinSrc(c)}</small></span></li>`).join('')}</ul>` : emptyLine(T('Pas de pièce dans la liste pour cette année.'), '🪙')}
                <h4 class="af-h">${esc(T('✉️ Envoyer une lettre en {y}', {y}))}</h4>${st ? `<p>${esc(T('Une lettre simple pour la France coûtait {p}', {p: st.label}))}${st.other ? esc(' ' + T('(ou {n} : le tarif a changé cette année-là)', {n: st.other.label})) : ''}. <small class="muted">${esc(capital(sinceTxt(st)) + '.')}</small></p><small class="tq-src">${esc(T('Source :'))} ${link(st.url, st.src)}</small>` : emptyLine(T('Pas de tarif connu pour cette année (les timbres commencent en 1849).'), '✉️')}`;
        };
        pane.addEventListener('input', e => { if (e.target.matches('[data-tq-year]')) draw(); });
        pane.addEventListener('click', e => { const x = e.target.closest('[data-tq-ex]'); if (x) { pane.querySelector('[data-tq-year]').value = x.dataset.tqEx; draw(); } });
        draw();
    }
    ext.autrefoisTabs = ext.autrefoisTabs || [];
    if (!ext.autrefoisTabs.some(t => t.id === 'poche')) ext.autrefoisTabs.push({id: 'poche', label: T('🪙 Pièces et timbres'), mount: mountPocket});

    /* ─────────── Réglages → « 🧺 Vie de tous les jours » ─────────── */
    const TAB = ['terre_quotidien', '25k3', '🧺 Vie de tous les jours'];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const infos = await Promise.all(Object.keys(FILES).map(k => tryLoad(k).then(d => [k, d])));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => (UI().toggleHtml ? `<div class="tq-tg">${UI().toggleHtml(T(label), {checked: !!s[k], attrs: `data-tq-tg="${k}"`, sub: T(sub)})}</div>`
            : `<label class="checkbox-line"><input type="checkbox" data-tq-tg="${k}" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`);
        const what = {meteorites: '☄️ Météorites', climat: '🌡️ Climat', glaciers: '🏔️ Glaciers', arbres: '🌳 Arbres', sites: '🏺 Sites anciens', poche: '🪙 Pièces', timbre: '✉️ Timbres', esperance: '⏳ Espérance de vie'};
        const srcRow = ([k, d]) => { if (!d) return `<tr><td>${esc(T(what[k]))}</td><td colspan="3" class="muted">${esc(T('fichier absent'))}</td></tr>`;
            const lic = d.licence || (d.series ? [...new Set(Object.values(d.series).map(x => x.licence))].join(' ; ') : '');
            const src = d.src || (d.series ? [...new Set(Object.values(d.series).map(x => x.key === 'CET' ? x.src : 'Berkeley Earth'))].join(' ; ') : '');
            const n = d.rows?.length || d.glaciers?.length || d.items?.length || d.rates?.length || d.tables?.length || (d.series ? Object.keys(d.series).length : 0);
            return `<tr><td>${esc(T(what[k]))}</td><td>${esc(src)} ${d.url ? link(d.url, T('voir')) : ''}</td><td>${esc(lic)}</td><td>${esc(nf(n))}</td></tr>`; };
        ws.innerHTML = `<section class="page tq-settings" data-tq-settings>${UI().pageHeader ? UI().pageHeader({title: T('Vie de tous les jours'), icon: '🧺', where: T('Réglages · Données'), help: T('Des petites phrases sur la vie de tous les jours, sur la fiche des personnes et des villages : le climat de leur année, les météorites, les glaciers, les arbres, les sites anciens, les pièces, le prix d’un timbre, l’espérance de vie. Tout est livré avec l’app, sans Internet (sauf les images des pièces).')}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>${esc(T('Partie'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Lignes'))}</th></tr></thead><tbody>${infos.map(srcRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Rien n’est envoyé sur Internet, sauf les petites images des pièces, lues sur Wikimedia Commons (puis gardées par le navigateur). Les données sont refaites par scripts/terre-quotidien/build-terre-quotidien.py ; le détail des licences est dans assets/data/tq-LICENCES.txt.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tq-tg]'); if (!t) return;
        const k = t.dataset.tqTg, input = t.matches('input') ? t : t.querySelector('input'); if (!input) return;
        const before = settings(), after = {...before, [k]: input.checked}; saveSettings(after);
        const label = T((PARTS.find(p => p[0] === k) || [k, k])[1]);
        A().undoToast ? A().undoToast(input.checked ? T('« {x} » allumé', {x: label}) : T('« {x} » éteint', {x: label}), {undo: async () => { saveSettings(before); drawSettings(); }, redo: async () => { saveSettings(after); drawSettings(); }}) : A().toast?.(label);
    });
    const openSettings = () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); };

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'meteo'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'terre_quotidien')) { let i = B.findIndex(b => b[0] === 'meteo'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); B.splice(i < 0 ? B.length : i + 1, 0, ['terre_quotidien', '🧺 Sa vie de tous les jours (climat, glacier, arbre, pièces…)']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.terre_quotidien ||= '6';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    /* ─────────── 🧰 Données : chaque partie, quand on veut ─────────── */
    const placeOfCtx = pl => (pl ? {name: pl.name || pl.place_name || pl.title || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, country: pl.country || ''} : null);
    const none = (host, text, icon) => { host.innerHTML = emptyLine(text, icon); };
    const forPerson = (k, emptyText, icon) => async (ctx, host) => {
        const d = await personDetail(ctx?.person); if (!d) return none(host, T('Choisis une personne.'), icon);
        const html = await personHtml(d, {only: [k]}); if (html) host.innerHTML = `<div class="tq-life">${html}</div>`; else none(host, emptyText, icon);
    };
    const forPlace = (k, emptyText, icon) => async (ctx, host) => {
        const pl = placeOfCtx(ctx?.place); if (!pl || pl.lat == null || pl.lon == null) return none(host, T('Choisis un lieu placé sur la carte.'), icon);
        const html = await placeHtml(pl, {only: [k]}); if (html) host.innerHTML = html; else none(host, emptyText, icon);
    };
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'tq_meteorites', icon: '🌠', label: T('Météorites tombées près de chez lui'), group: 'La personne', needs: ['person'], installed: () => true, run: forPerson('meteorites', T('Aucune chute de météorite observée à moins de 100 km de ses lieux, de son vivant.'), '🌠')},
        {id: 'tq_meteorites_place', icon: '🌠', label: T('Météorites tombées près d’un lieu'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const pl = placeOfCtx(ctx?.place), M = await tryLoad('meteorites'); if (!pl || pl.lat == null || !M) return none(host, T('Choisis un lieu placé sur la carte.'), '🌠');
                const list = M.rows.map(r => ({r, k: km(Number(pl.lat), Number(pl.lon), r[2], r[3])})).filter(x => x.k <= 100).sort((a, b) => a.r[1] - b.r[1]);
                host.innerHTML = list.length ? `<ul class="ch-seen-list">${list.map(({r, k}) => `<li><span class="ch-seen-ico" aria-hidden="true">🌠</span><div><strong>${esc(T('{y} : « {n} » ({m}), à {d}', {y: r[1], n: r[0], m: massTxt(r[4]) || '?', d: kmTxt(k)}))}</strong></div></li>`).join('')}</ul><small class="tq-src">${esc(T('Source :'))} ${link(M.url, 'NASA, Meteorite Landings')}</small>` : emptyLine(T('Aucune chute de météorite observée à moins de 100 km.'), '🌠'); }},
        {id: 'tq_climat', icon: '🌡️', label: T('Le climat de son année'), group: 'La personne', needs: ['person'], installed: () => true, run: forPerson('climat', T('Il faut l’année de naissance et le pays (France, Belgique, Suisse, Angleterre…).'), '🌡️')},
        {id: 'tq_climat_annee', icon: '🌡️', label: T('Le climat d’une année (France et voisins)'), group: 'Le monde', needs: ['year'], installed: () => true,
            run: async (ctx, host) => { const y = Math.round(Number(ctx?.year)), C = await tryLoad('climat'); if (!C || !y) return none(host, T('Choisis une année.'), '🌡️');
                const rows = Object.keys(C.series).map(cc => climateYear(C, cc, y)).filter(Boolean);
                host.innerHTML = rows.length ? `<div class="tq-life">${rows.map(r => row('🌡️', esc(climateText(r, 'year')), link(r.url, r.key === 'CET' ? 'Met Office HadCET' : 'Berkeley Earth'))).join('')}</div>` : emptyLine(T('Pas de série de température pour cette année.'), '🌡️'); }},
        {id: 'tq_glacier', icon: '🏔️', label: T('Le glacier de son enfance'), group: 'La personne', needs: ['person'], installed: () => true, run: forPerson('glacier', T('Pas de glacier suivi à moins de 50 km de ses lieux, ou pas de relevé de son vivant.'), '🏔️')},
        {id: 'tq_arbre', icon: '🌳', label: T('L’arbre qui l’a vu naître'), group: 'La personne', needs: ['person'], installed: () => true, run: forPerson('arbre', T('Pas d’arbre remarquable daté à moins de 10 km de son lieu de naissance.'), '🌳')},
        {id: 'tq_arbres_lieu', icon: '🌳', label: T('Arbres remarquables près d’un lieu'), group: 'Le lieu', needs: ['place'], installed: () => true, run: forPlace('arbre', T('Pas d’arbre remarquable connu de Wikidata à moins de 10 km.'), '🌳')},
        {id: 'tq_sites', icon: '🏺', label: T('Sites préhistoriques et antiques près d’un lieu'), group: 'Le lieu', needs: ['place'], installed: () => true, run: forPlace('sites', T('Pas de site ancien connu de Wikidata à moins de 10 km.'), '🏺')},
        {id: 'tq_poche', icon: '🪙', label: T('La pièce dans sa poche'), group: 'La personne', needs: ['person'], installed: () => true, run: forPerson('poche', T('Il faut son année de naissance (et qu’il ait vécu jusqu’à 20 ans).'), '🪙')},
        {id: 'tq_poche_annee', icon: '🪙', label: T('Pièces et prix d’un timbre une année'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => { host.innerHTML = '<div class="af"></div>'; mountPocket(host.firstElementChild, {year: ctx?.year}); }},
        {id: 'tq_esperance', icon: '⏳', label: T('Espérance de vie à son âge'), group: 'La personne', needs: ['person'], installed: () => true, run: forPerson('esperance', T('Pas de table de mortalité pour ses années (les tables livrées commencent en 1994).'), '⏳')});

    /* ─────────── 📋 Listes : chaque jeu de données en liste (moteur commun app-listes-donnees.js) ─────────── */
    const COUNTRY_NAME = {FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', DE: 'Allemagne', IT: 'Italie', ES: 'Espagne', NL: 'Pays-Bas', AT: 'Autriche', PT: 'Portugal', DK: 'Danemark', GB: 'Royaume-Uni', SI: 'Slovénie', AD: 'Andorre', LI: 'Liechtenstein'};
    const openUrl = url => { if (url) root.open(url, '_blank', 'noopener'); };
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'tq_meteorites', icon: '🌠', label: T('Chutes de météorites observées'), group: 'Le monde', source: 'NASA Open Data Portal — The Meteoritical Society', sourceUrl: 'https://data.nasa.gov/dataset/meteorite-landings',
            load: async () => ((await load('meteorites')).rows || []).map(([name, year, lat, lon, mass, cls]) => ({name, year, mass_kg: mass == null ? null : Math.round(mass / 100) / 10, cls, lat, lon})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'mass_kg', label: T('Masse (kg)'), type: 'number'}, {key: 'cls', label: T('Classe'), type: 'enum'}],
            period: r => [r.year, r.year], geo: r => [r.lat, r.lon], open: r => openUrl(`https://www.lpi.usra.edu/meteor/metbull.php?sea=${encodeURIComponent(r.name)}&srt=name&lrec=50&map=ge`)},
        {id: 'tq_climat', icon: '🌡️', label: T('Climat de chaque année (France et voisins)'), group: 'Le monde', source: 'Met Office HadCET (OGL) ; Berkeley Earth (CC BY-NC 4.0)', sourceUrl: 'https://berkeleyearth.org/data/',
            load: async () => { const C = await load('climat'), out = []; for (const [k, s] of Object.entries(C.series)) for (let i = 0; i < s.v.length; i++) { const y = s.y0 + i, r = s.v[i] != null && climateYear(C, k, y); if (!r || r.key !== k) continue;
                out.push({year: y, country: s.n, gap: r.d, word: Math.abs(r.d) < 0.3 ? T('normale') : r.d < 0 ? T('plus froide') : T('plus chaude'), century: r.century.label, series: k === 'CET' ? 'HadCET' : 'Berkeley Earth'}); } return out; },
            fields: [{key: 'year', label: T('Année'), type: 'year'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'gap', label: T('Écart à la moyenne du siècle (°C)'), type: 'number'}, {key: 'word', label: T('L’année'), type: 'enum', values: [T('plus froide'), T('normale'), T('plus chaude')]},
                {key: 'century', label: T('Siècle'), type: 'enum'}, {key: 'series', label: T('Série'), type: 'enum'}],
            period: r => [r.year, r.year]},
        {id: 'tq_glaciers', icon: '🏔️', label: T('Glaciers des Alpes et des Pyrénées (position du front)'), group: 'Le lieu', source: 'WGMS, Fluctuations of Glaciers Database', sourceUrl: 'https://doi.org/10.5904/wgms-fog-2026-02-10',
            load: async () => { const G = await load('glaciers'), out = []; for (const g of G.glaciers) for (const [y, m] of g.p) out.push({name: g.n, country: COUNTRY_NAME[g.cc] || g.cc, year: y, front_m: m, last: g.last, id: g.id, lat: g.lat, lon: g.lon}); return out; },
            fields: [{key: 'name', label: T('Glacier'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'year', label: T('Année du relevé'), type: 'year'},
                {key: 'front_m', label: T('Front par rapport au dernier relevé (m, + = plus bas)'), type: 'number'}, {key: 'last', label: T('Dernier relevé'), type: 'year'}],
            period: r => [r.year, r.year], geo: r => [r.lat, r.lon], open: () => openUrl('https://wgms.ch/products_fog/')},
        {id: 'tq_arbres', icon: '🌳', label: T('Arbres remarquables'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/',
            load: async () => ((await load('arbres')).rows || []).map(r => ({name: r[1], species: r[6] || '', planted: r[4], planted_txt: plantedTxt(r), country: COUNTRY_NAME[r[7]] || r[7] || '', qid: r[0], wiki: r[8], lat: r[2], lon: r[3]})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'species', label: T('Espèce'), type: 'enum'}, {key: 'planted', label: T('Planté ou né (année)'), type: 'year'}, {key: 'planted_txt', label: T('Date'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}],
            period: r => (r.planted != null ? [r.planted, new Date().getFullYear()] : null), geo: r => [r.lat, r.lon], open: r => openUrl(r.wiki ? wp(r.wiki) : wd(r.qid))},
        {id: 'tq_sites', icon: '🏺', label: T('Sites préhistoriques et antiques'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/',
            load: async () => ((await load('sites')).rows || []).map(r => ({name: r[1], kind: T((SITE_WORD[r[4]] || [r[4]])[0]), qid: r[0], wiki: r[5], lat: r[2], lon: r[3]})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum', values: SITE_ORDER.map(k => T(SITE_WORD[k][0]))}],
            geo: r => [r.lat, r.lon], open: r => openUrl(r.wiki ? wp(r.wiki) : wd(r.qid))},
        {id: 'tq_poche', icon: '🪙', label: T('Pièces de monnaie de tous les jours (France)'), group: 'Le monde', source: 'Wikipédia (CC BY-SA 4.0), images Wikimedia Commons', sourceUrl: 'https://fr.wikipedia.org/wiki/Franc_fran%C3%A7ais',
            load: async () => ((await load('poche')).items || []).map(c => ({name: c.name, from: c.from, to: c.to, metal: c.metal || '', value: c.value || '', country: COUNTRY_NAME[c.cc || 'FR'], url: c.url})),
            fields: [{key: 'name', label: T('Pièce'), type: 'text'}, {key: 'from', label: T('Depuis'), type: 'year'}, {key: 'to', label: T('Jusqu’à'), type: 'year'}, {key: 'metal', label: T('Métal'), type: 'enum'}, {key: 'value', label: T('Valeur'), type: 'text'}],
            period: r => [r.from, r.to], open: r => openUrl(r.url)},
        {id: 'tq_timbre', icon: '✉️', label: T('Prix d’un timbre (lettre simple, France)'), group: 'Le monde', source: 'Wikipédia (CC BY-SA 4.0)', sourceUrl: 'https://fr.wikipedia.org/wiki/%C3%89volution_du_prix_du_timbre_en_France',
            load: async () => { const R = await load('timbre'); return (R.rates || []).map((r, i) => ({from: r.from, label: r.label, year_from: Number(r.from.slice(0, 4)), year_to: R.rates[i + 1] ? Number(R.rates[i + 1].from.slice(0, 4)) : new Date().getFullYear(), source: r.src, url: r.url})); },
            fields: [{key: 'from', label: T('Depuis le'), type: 'text'}, {key: 'year_from', label: T('Année'), type: 'year'}, {key: 'label', label: T('Prix'), type: 'text'}, {key: 'source', label: T('Source'), type: 'text'}],
            period: r => [r.year_from, r.year_to], open: r => openUrl(r.url)},
        {id: 'tq_esperance', icon: '⏳', label: T('Espérance de vie à divers âges (France)'), group: 'Le monde', source: 'Insee (Licence ouverte 2.0)', sourceUrl: 'https://www.insee.fr/fr/statistiques/2416631',
            load: async () => { const E = await load('esperance'), out = []; for (const t of E.tables || []) E.ages.forEach((a, i) => { for (const [sx, k] of [[T('Femmes'), 'f'], [T('Hommes'), 'm']]) if (t[k]?.[i] != null) out.push({year: t.y, sex: sx, age: a, years_left: t[k][i]}); }); return out; },
            fields: [{key: 'year', label: T('Année'), type: 'year'}, {key: 'sex', label: T('Sexe'), type: 'enum'}, {key: 'age', label: T('Âge'), type: 'number'}, {key: 'years_left', label: T('Années à vivre en moyenne'), type: 'number'}],
            period: r => [r.year, r.year]});

    ext.terreQuotidien = {...core, load, settings, personHtml, placeHtml, openSettings, decorateLetters, mountPocket};
})(typeof window !== 'undefined' ? window : globalThis);
