/**
 * LCNDA — 🌌 Ciel, climat et mémoire (lot E « téléchargements ») : le ciel noir d'autrefois, les étoiles filantes de sa naissance,
 * les étés secs et humides de sa vie, les hivers terribles, les fossiles, les puits, les inscriptions romaines, les arbres de la
 * Liberté, les guerres de Religion et les Camisards, et les bases de Jean-Claude Farcy (1848, 1851 : liens seulement).
 * Livré avec l'app (assets/data/te-*.json.gz, refaits par scripts/telech-e/*.py et .github/workflows/telech-e.yml, lus à la demande) :
 *   🌌 te-ciel          clarté du ciel la nuit aujourd'hui (Hotham 2026, Zenodo, CC BY 4.0 ; lumières VIIRS 2023) — l'atlas de Falchi
 *                       et al. 2016 (CC BY-NC, redistribution interdite) : lien seulement
 *   🌾 te-secheresses   l'été de chaque année, sec ou humide (Old World Drought Atlas, Cook et al. 2015, NOAA/NCEI, libre à citer)
 *   ❄️ te-hivers        chaque hiver et chaque été depuis 1500 (Luterbacher et al. 2004, NOAA/NCEI, libre à citer)
 *   🏛 te-inscriptions  inscriptions romaines (Epigraphic Database Heidelberg, Zenodo, CC BY-SA 4.0)
 *   🦴 te-fossiles      gisements de fossiles (Paleobiology Database, CC BY 4.0 — fabriqué sur GitHub)
 *   🌳 te-libertes      arbres de la Liberté (Wikidata CC0 ; OpenStreetMap ODbL — fabriqué sur GitHub)
 *   ⚔️ te-religion      guerres de Religion, Camisards (Wikidata CC0)
 * Calculé ici, sans fichier : ☄️ les essaims d'étoiles filantes (dates fixes en longitude solaire, liste de l'IMO) et les grandes
 *   pluies d'étoiles (1799, 1833, 1866, 1872, 1885, 1933, 1999).
 * Liens seulement : 🕳 Banque du sous-sol (BRGM : pas d'export ouvert, service refusé aux programmes) ; ⚖️ bases de J.-C. Farcy
 *   (inculpés de juin 1848, poursuivis de décembre 1851 : pas de licence ouverte) — « Chercher ce nom » copie le nom sur
 *   l'ordinateur et ouvre la page du site : RIEN n'est envoyé, et jamais pour une fiche vivante ou confidentielle, ni en consultation.
 * Rien ne part sur Internet : tout est lu sur l'ordinateur (aucun appel au serveur hors les fichiers assets/data).
 * Où : fiche d'une personne (bloc « 🌌 Ciel, climat et mémoire »), fiche d'un village, monographie, Listes, Cartes, à la demande,
 *   « Où chercher », Réglages → « 🌌 Ciel, climat et mémoire » (chaque sujet s'éteint ↶, À propos des données).
 * localStorage : « genealogie-telech-e ».   window.LCNDA_EXT.telechE = {core…, load, personInto, placeInto}
 * Essai : tests/test-telech-e.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (ys.length ? Math.max(...ys) : null)};
    }
    /** le lieu de naissance placé (sinon le premier lieu placé) */
    function homeOf(life) {
        const ev = (life?.events || []).find(e => ['BIRT', 'BAPM', 'CHR'].includes(String(e.tag || '').toUpperCase()) && okLL(e));
        if (ev) return {lat: Number(ev.lat), lon: Number(ev.lon), name: ev.place || '', date: String(ev.date || '')};
        const p = (life?.places || []).find(okLL);
        return p ? {lat: Number(p.lat), lon: Number(p.lon), name: p.name || '', date: ''} : null;
    }
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase()}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [];
        for (const r of rows) { if (num(r.lat) === null) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    /** la date (AAAA-MM-JJ) de naissance quand elle est complète */
    function birthDate(life) {
        const e = (life?.events || []).find(x => ['BIRT', 'BAPM', 'CHR'].includes(String(x.tag || '').toUpperCase()) && /^\d{4}-\d\d-\d\d/.test(String(x.date || '')));
        const m = e && String(e.date).match(/^(\d{4})-(\d\d)-(\d\d)/);
        return m && Number(m[2]) >= 1 && Number(m[3]) >= 1 ? {y: Number(m[1]), m: Number(m[2]), d: Number(m[3])} : null;
    }

    /* 🌌 le ciel : la clarté artificielle B (µcd/m²) → magnitude du ciel, étoiles visibles, Voie lactée (seuils de Falchi et al. 2016) */
    const SKY = {lo: 0.5, hi: 20000, natural: 174, polluted: 13.9, milky: 688};
    function skyGrid(meta) {
        if (!meta?.grid) return null;
        const bin = typeof atob === 'function' ? atob(meta.grid) : Buffer.from(meta.grid, 'base64').toString('binary');
        const g = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) g[i] = bin.charCodeAt(i);
        return {g, top: meta.top, left: meta.left, cell: meta.cell, w: meta.w, h: meta.h};
    }
    function skyAt(G, lat, lon) {
        if (!G) return null;
        const r = Math.floor((G.top - lat) / G.cell), c = Math.floor((lon - G.left) / G.cell);
        if (r < 0 || c < 0 || r >= G.h || c >= G.w) return null;
        const v = G.g[r * G.w + c];
        return v === 0 ? 0 : 10 ** (Math.log10(SKY.lo) + (v - 1) * (Math.log10(SKY.hi) - Math.log10(SKY.lo)) / 254);
    }
    const STARS = [[0, 4], [1, 15], [2, 48], [3, 171], [4, 513], [5, 1602], [6, 4800], [6.5, 9100], [7, 14000]];
    /** les étoiles qu'on voit à l'œil nu d'un coup (la moitié du ciel, moins le bas de l'horizon) jusqu'à la magnitude m */
    function starsFor(m) {
        if (m <= 0) return 0;
        let i = STARS.findIndex(s => s[0] >= m); if (i <= 0) i = i < 0 ? STARS.length - 1 : 1;
        const [a, na] = STARS[i - 1], [b, nb] = STARS[i], n = 10 ** (Math.log10(na) + (Math.log10(nb) - Math.log10(na)) * (m - a) / (b - a));
        return Math.round(n * 0.3);
    }
    function skyInfo(B) {
        const sqm = 12.58 - 2.5 * Math.log10((SKY.natural + B) * 1e-6), nelm = 7.93 - 5 * Math.log10(10 ** (4.316 - sqm / 5) + 1);
        return {B, ratio: (SKY.natural + B) / SKY.natural, sqm, nelm, stars: starsFor(nelm), milky: B < SKY.milky, polluted: B > SKY.polluted};
    }
    const NATURAL = skyInfo(0);

    /* ☄️ les étoiles filantes : essaims de la liste de l'IMO (activité, maximum en longitude solaire J2000, taux horaire zénithal) */
    const SHOWERS = [
        {id: 'QUA', n: 'Quadrantides', from: [12, 28], to: [1, 12], peak: 283.15, zhr: 110, since: 1835, w: 'Quadrantides'},
        {id: 'LYR', n: 'Lyrides', from: [4, 14], to: [4, 30], peak: 32.32, zhr: 18, w: 'Lyrides'},
        {id: 'ETA', n: 'Êta Aquarides', from: [4, 19], to: [5, 28], peak: 45.5, zhr: 50, low: true, w: 'Êta_Aquarides'},
        {id: 'SDA', n: 'Delta Aquarides', from: [7, 12], to: [8, 23], peak: 127, zhr: 25, low: true, w: 'Delta_Aquarides'},
        {id: 'PER', n: 'Perséides', from: [7, 17], to: [8, 24], peak: 140.0, zhr: 100, w: 'Perséides'},
        {id: 'DRA', n: 'Draconides', from: [10, 6], to: [10, 10], peak: 195.4, zhr: 10, w: 'Draconides'},
        {id: 'ORI', n: 'Orionides', from: [10, 2], to: [11, 7], peak: 208, zhr: 20, w: 'Orionides'},
        {id: 'LEO', n: 'Léonides', from: [11, 6], to: [11, 30], peak: 235.27, zhr: 15, w: 'Léonides'},
        {id: 'GEM', n: 'Géminides', from: [12, 4], to: [12, 20], peak: 262.2, zhr: 150, since: 1862, w: 'Géminides'},
        {id: 'URS', n: 'Ursides', from: [12, 17], to: [12, 26], peak: 270.7, zhr: 10, w: 'Ursides'}];
    /** les grandes pluies d'étoiles (« tempêtes ») ; eu : vue d'Europe */
    const STORMS = [
        {d: '1799-11-12', s: 'LEO', eu: true, t: 'pluie d’étoiles des Léonides, vue par Humboldt en Amérique du Sud et jusqu’en Europe'},
        {d: '1833-11-13', s: 'LEO', eu: false, t: 'la grande pluie d’étoiles des Léonides, vue en Amérique du Nord (en Europe, il faisait déjà jour)'},
        {d: '1866-11-14', s: 'LEO', eu: true, t: 'pluie d’étoiles des Léonides, vue dans toute l’Europe dans la nuit du 13 au 14 novembre'},
        {d: '1872-11-27', s: 'AND', eu: true, t: 'pluie d’étoiles des Andromédides (débris de la comète de Biela), vue en Europe'},
        {d: '1885-11-27', s: 'AND', eu: true, t: 'nouvelle pluie d’étoiles des Andromédides (comète de Biela), vue en Europe'},
        {d: '1933-10-09', s: 'DRA', eu: true, t: 'pluie d’étoiles des Draconides, vue en Europe le soir du 9 octobre'},
        {d: '1999-11-18', s: 'LEO', eu: true, t: 'tempête des Léonides, vue d’Europe avant l’aube du 18 novembre'}];
    const STORM_WIKI = {LEO: 'Léonides', AND: 'Andromédides', DRA: 'Draconides'};
    /** longitude du Soleil (degrés, équinoxe J2000) le jour y-m-d à 0 h TU (Meeus, à 0,01° près) */
    function solarLongitude(y, m, d) {
        const jd = Date.UTC(y, m - 1, d) / 864e5 + 2440587.5, n = jd - 2451545.0, r = Math.PI / 180;
        const L = 280.460 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * r;
        return (((L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360) + 360) % 360;
    }
    const md = (m, d) => m * 100 + d;
    const inWindow = (s, m, d) => { const x = md(m, d), a = md(...s.from), b = md(...s.to); return a <= b ? x >= a && x <= b : x >= a || x <= b; };
    /** le jour du maximum d'un essaim une année donnée */
    function peakDay(s, y) {
        let best = null;
        for (let k = -40; k <= 40; k++) {
            const t = new Date(Date.UTC(y, s.from[0] - 1, s.from[1] + 20 + k)); const l = solarLongitude(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
            const dl = Math.abs(((l - s.peak + 540) % 360) - 180); if (!best || dl < best.dl) best = {dl, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate()};
        }
        return best;
    }
    /** ☄️ l'essaim d'étoiles filantes actif une nuit donnée (le plus fort s'il y en a deux) → {s, peak, dl} */
    function showerOn(y, m, d) {
        const l = solarLongitude(y, m, d); let best = null;
        for (const s of SHOWERS) {
            if (!inWindow(s, m, d) || (s.since && y < s.since)) continue;
            const dl = Math.abs(((l - s.peak + 540) % 360) - 180), score = s.zhr * 10 ** (-dl / 4);
            if (!best || score > best.score) best = {s, dl, score};
        }
        if (!best) return null;
        let p = peakDay(best.s, y); if (Math.abs(p.y - y) > 0 && best.s.from[0] === 12 && m === 1) p = peakDay(best.s, y - 1);
        return {s: best.s, dl: best.dl, peak: p, atPeak: best.dl < 1.2};
    }
    /** les grandes pluies d'étoiles vues de son vivant (vue d'Europe, à 5 ans ou plus) */
    function stormsSeen(life) {
        const {birth, death, to} = lifeSpan(life); if (birth === null) return [];
        const end = death ?? to ?? birth + 80;
        return STORMS.filter(s => s.eu).map(s => ({...s, y: Number(s.d.slice(0, 4))})).filter(s => s.y >= birth + 5 && s.y <= end).map(s => ({...s, age: s.y - birth}));
    }

    /* 🌾 ❄️ les carreaux de 0,5° (sécheresses, hivers) */
    function cellAt(rows, lat, lon) {
        let best = null;
        for (const r of rows) { const d = Math.max(Math.abs(r.lat - lat), Math.abs(r.lon - lon) * Math.cos(lat * Math.PI / 180)); if (d <= 0.5 && (!best || d < best.d)) best = {r, d}; }
        return best ? best.r : null;
    }
    const pdsiAt = (cell, y) => { const i = y - cell.y0; return i >= 0 && i < cell.v.length ? cell.v[i] : null; };
    const DRY = v => (v <= -40 ? 'extrême' : v <= -30 ? 'sévère' : v <= -20 ? 'modérée' : '');
    /** 🌾 les étés de sa vie : le plus sec, le plus humide, les années de grande sécheresse (indice ≤ −3) */
    function droughtLife(cell, life) {
        const {birth, death, to} = lifeSpan(life); if (!cell || birth === null) return null;
        const a = Math.max(birth, cell.y0), b = Math.min(death ?? to ?? birth + 80, cell.y0 + cell.v.length - 1); if (b < a) return null;
        const ys = []; for (let y = a; y <= b; y++) { const v = pdsiAt(cell, y); if (v !== null) ys.push({y, v, age: y - birth}); }
        if (ys.length < 3) return null;
        const dry = ys.reduce((m, x) => (x.v < m.v ? x : m)), wet = ys.reduce((m, x) => (x.v > m.v ? x : m));
        return {dry, wet, severe: ys.filter(x => x.v <= -30), years: ys};
    }
    /** les étés les plus secs (ou humides) depuis une année, au carreau */
    function droughtExtremes(cell, from = 1500, n = 5) {
        if (!cell) return {dry: [], wet: []};
        const ys = []; for (let y = Math.max(from, cell.y0); y < cell.y0 + cell.v.length; y++) { const v = pdsiAt(cell, y); if (v !== null) ys.push({y, v}); }
        return {dry: [...ys].sort((p, q) => p.v - q.v).slice(0, n), wet: [...ys].sort((p, q) => q.v - p.v).slice(0, n)};
    }
    const Y0_TEMP = 1500;
    const tAt = (cell, key, y) => { const v = cell?.[key]?.[y - Y0_TEMP]; return v === undefined || v === null ? null : v / 10; };
    /** le rang d'une saison dans son siècle (1 = la plus froide, ou la plus chaude avec hot) */
    function centuryRank(cell, key, y, hot = false) {
        const c = Math.ceil(y / 100), from = Math.max(Y0_TEMP, (c - 1) * 100 + 1), to = Math.min(Y0_TEMP + cell[key].length - 1, c * 100);
        const v = tAt(cell, key, y); let r = 1;
        for (let k = from; k <= to; k++) { const x = tAt(cell, key, k); if (x !== null && (hot ? x > v : x < v)) r++; }
        return {rank: r, century: c, partial: to - from < 99};
    }
    /** ❄️ l'hiver le plus froid et l'été le plus chaud de sa vie, au carreau de son lieu de naissance */
    function seasonsLife(cell, life) {
        const {birth, death, to} = lifeSpan(life); if (!cell || birth === null) return null;
        const a = Math.max(birth + 1, Y0_TEMP), b = Math.min(death ?? to ?? birth + 80, Y0_TEMP + cell.wi.length - 1); if (b - a < 2) return null;
        let cold = null, hot = null;
        for (let y = a; y <= b; y++) { const w = tAt(cell, 'wi', y), s = tAt(cell, 'su', y); if (w !== null && (!cold || w < cold.v)) cold = {y, v: w}; if (s !== null && (!hot || s > hot.v)) hot = {y, v: s}; }
        if (cold) Object.assign(cold, {age: cold.y - birth}, centuryRank(cell, 'wi', cold.y));
        if (hot) Object.assign(hot, {age: hot.y - birth}, centuryRank(cell, 'su', hot.y, true));
        return {cold, hot};
    }
    function seasonExtremes(cell, n = 5) {
        if (!cell) return {cold: [], hot: []};
        const ys = cell.wi.map((v, i) => ({y: Y0_TEMP + i, w: v / 10, s: cell.su[i] / 10}));
        return {cold: [...ys].sort((p, q) => p.w - q.w).slice(0, n), hot: [...ys].sort((p, q) => q.s - p.s).slice(0, n)};
    }

    /* 🏛 🦴 🌳 ⚔️ des lieux autour */
    function inscriptionsNear(rows, place, radius = 10) {
        if (!okLL(place)) return {here: [], around: []};
        const all = near(rows, Number(place.lat), Number(place.lon), radius, 400);
        const here = all.filter(x => (place.insee && x.r.insee === place.insee) || x.km <= 2);
        return {here, around: all.filter(x => !here.includes(x))};
    }
    /** 🌳 les arbres de la Liberté plantés de son vivant près d'un de ses lieux (3 km) */
    function libertyLife(rows, life, radius = 3) {
        const {birth, death, to} = lifeSpan(life); if (birth === null) return [];
        const end = death ?? to ?? birth + 80, evs = placedEvents(life), out = new Map();
        for (const r of rows) {
            if (r.y === null || r.y < birth || r.y > end) continue;
            for (const e of evs) { const k = km(e.lat, e.lon, r.lat, r.lon); if (k <= radius && (!out.has(r.id) || k < out.get(r.id).km)) out.set(r.id, {r, km: k, place: e.name, age: r.y - birth}); }
        }
        return [...out.values()].sort((a, b) => a.r.y - b.r.y);
    }
    /** ⚔️ les événements des guerres de Religion et des Camisards près de ses lieux (40 km), de son vivant */
    function religionLife(rows, life, radius = 40) {
        const {birth, death, to} = lifeSpan(life); if (birth === null || birth > 1715) return [];
        const end = death ?? to ?? birth + 80, evs = placedEvents(life), out = new Map();
        for (const r of rows) {
            if (r.y < birth || r.y > end) continue;
            for (const e of evs) { const k = km(e.lat, e.lon, r.lat, r.lon); if (k <= radius && (!out.has(r.q) || k < out.get(r.q).km)) out.set(r.q, {r, km: k, place: e.name, age: r.y - birth}); }
        }
        return [...out.values()].sort((a, b) => a.r.y - b.r.y);
    }
    /** ⚖️ les bases de J.-C. Farcy qui peuvent le concerner (1848 : à Paris ; 1851 : en France), seulement l'âge et les lieux */
    const PARIS = {lat: 48.8566, lon: 2.3522};
    function farcyFor(life) {
        const {birth, death} = lifeSpan(life); if (birth === null) return [];
        const alive = y => y - birth >= 15 && y - birth <= 80 && (death === null || death >= y);
        const evs = placedEvents(life), out = [];
        if (alive(1848) && evs.some(e => km(e.lat, e.lon, PARIS.lat, PARIS.lon) <= 25)) out.push('1848');
        if (alive(1851) && (evs.length === 0 || evs.some(e => e.lat > 41 && e.lat < 51.5 && e.lon > -5.5 && e.lon < 10))) out.push('1851');
        return out;
    }
    const FARCY = {
        1848: {url: 'https://inculpes-juin-1848.fr/index.php', label: 'Inculpés de l’insurrection de juin 1848', what: '11 662 personnes jugées par les commissions militaires après les journées de Juin à Paris'},
        1851: {url: 'https://poursuivis-decembre-1851.fr/index.php', label: 'Poursuivis à la suite du coup d’État de décembre 1851', what: '26 848 personnes poursuivies après le coup d’État de Louis-Napoléon Bonaparte, partout en France'}};
    /** une adresse venue d'un fichier ou d'un site : seulement http(s), sinon rien */
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

    const core = {num, fold, table, km, lifeSpan, homeOf, near, birthDate, SKY, skyGrid, skyAt, starsFor, skyInfo, NATURAL, SHOWERS, STORMS, solarLongitude, showerOn, peakDay, stormsSeen,
        cellAt, pdsiAt, droughtLife, droughtExtremes, tAt, centuryRank, seasonsLife, seasonExtremes, inscriptionsNear, libertyLife, religionLife, farcyFor, FARCY, safeUrl};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const KEY = 'genealogie-telech-e';
    const TAB = ['telech_e', '25te', '🌌 Ciel, climat et mémoire'];
    const BLOCK = 'telech_e';
    const PARTS = [
        ['ciel', '🌌 Le ciel noir d’autrefois', 'Combien d’étoiles on voit aujourd’hui au lieu de naissance, et ce que voyaient les ancêtres (modèle ouvert, lumières de 2023).'],
        ['etoiles', '☄️ Les étoiles filantes', 'L’essaim d’étoiles filantes de la nuit de sa naissance, et les grandes pluies d’étoiles vues de son vivant.'],
        ['secheresses', '🌾 Les étés secs et humides', 'L’été le plus sec et le plus humide de sa vie, d’après les cernes des arbres (Old World Drought Atlas).'],
        ['hivers', '❄️ Les hivers terribles', 'L’hiver le plus froid et l’été le plus chaud de sa vie, comparés à son siècle (depuis 1500).'],
        ['fossiles', '🦴 Les fossiles du pays', 'Sur la fiche d’une commune : les gisements de fossiles connus autour (Paleobiology Database).'],
        ['puits', '🕳 Puits et forages anciens', 'Sur la fiche d’une commune : le lien vers la carte de la Banque du sous-sol (BRGM).'],
        ['inscriptions', '🏛 Inscriptions romaines', 'Les inscriptions latines trouvées dans la commune et autour, avec leur texte (EDH).'],
        ['libertes', '🌳 Arbres de la Liberté', 'Les arbres de la Liberté plantés près de chez lui de son vivant (1792, 1848, 1889…).'],
        ['religion', '⚔️ Guerres de Religion, Camisards', 'Batailles, sièges et massacres des guerres de Religion et des Camisards près de chez lui, de son vivant.'],
        ['farcy', '⚖️ Insurgés de 1848, poursuivis de 1851', 'Pour une personne décédée qui vivait alors : le lien vers les bases de Jean-Claude Farcy (rien n’est envoyé).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {minimumFractionDigits: d, maximumFractionDigits: d});
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="te-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row te-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="te-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (/^Q\d+$/.test(String(q)) ? `https://www.wikidata.org/wiki/${q}` : '');
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const ageTxt = a => (a <= 0 ? T('l’année de sa naissance') : a === 1 ? T('à 1 an') : T('à {n} ans', {n: String(a)}));
    const ROMAN = n => { const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, l] of r) while (n >= v) { s += l; n -= v; } return s; };
    const centuryTxt = c => T('{r}e siècle', {r: ROMAN(c)});
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayTxt = (d, m) => `${d === 1 ? '1er' : d} ${T(MONTHS[m - 1])}`;

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {ciel: 'te-ciel', secheresses: 'te-secheresses', hivers: 'te-hivers', inscriptions: 'te-inscriptions', fossiles: 'te-fossiles', libertes: 'te-libertes', religion: 'te-religion'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: table(f), grid: kind === 'ciel' ? skyGrid(f) : null} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null); // un fichier absent (pas encore fabriqué sur GitHub) : la partie se tait
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };

    const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', CC_BY = 'https://creativecommons.org/licenses/by/4.0/deed.fr';
    const NOAA_README = 'https://www.ncei.noaa.gov/pub/data/paleo/aar/readme-ncei-wds-paleoclimatology.txt';
    const URLS = {ciel: 'https://doi.org/10.5281/zenodo.23757708', falchi: 'https://doi.org/10.5880/GFZ.1.4.2016.001', owda: 'https://www.ncei.noaa.gov/access/paleo-search/study/19419',
        hivers: 'https://www.ncei.noaa.gov/pub/data/paleo/historical/europe-seasonal.txt', edh: 'https://doi.org/10.5281/zenodo.3575155', pbdb: 'https://paleobiodb.org/',
        bss: 'https://infoterre.brgm.fr/viewer/MainTileForward.do', imo: 'https://www.imo.net/resources/calendar/', farcy: 'https://lir3s.ube.fr/bases-de-donnees/', osm: 'https://www.openstreetmap.org/copyright'};
    const SRC = {
        ciel: () => `${link(URLS.ciel, 'Hotham 2026, Darkest Skies')} (${link(CC_BY, 'CC BY 4.0')} ; ${esc(T('lumières VIIRS 2023, WorldPop'))})`,
        etoiles: () => `${link(URLS.imo, T('calendrier des essaims (IMO)'))} · ${esc(T('calculé sur l’ordinateur'))} · ${link('https://fr.wikipedia.org/wiki/L%C3%A9onides', 'Wikipédia')}`,
        owda: () => `${link(URLS.owda, 'Old World Drought Atlas, Cook et al. 2015')} — ${link(NOAA_README, 'NOAA/NCEI')} (${esc(T('libre, à citer'))})`,
        hivers: () => `${link(URLS.hivers, 'Luterbacher et al. 2004')} — ${link(NOAA_README, 'NOAA/NCEI')} (${esc(T('libre, à citer'))})`,
        edh: () => `${link(URLS.edh, 'Epigraphic Database Heidelberg')} (${link(CC_BY_SA, 'CC BY-SA 4.0')})`,
        pbdb: () => `${link(URLS.pbdb, 'Paleobiology Database')} (${link(CC_BY, 'CC BY 4.0')})`,
        lib: osm => `${link('https://www.wikidata.org/wiki/Q55100046', 'Wikidata')} (CC0)${osm ? ` · ${link(URLS.osm, T('© les contributeurs d’OpenStreetMap'))} (ODbL)` : ''}`,
        rel: () => `${link('https://www.wikidata.org/wiki/Q673175', 'Wikidata')} (CC0)`,
        bss: () => `${link(URLS.bss, 'BRGM, InfoTerre')} (${esc(T('lien seulement'))})`,
        farcy: () => `${link(URLS.farcy, 'LIR3S, Université Bourgogne Europe')} (${esc(T('lien seulement'))})`};
    const SRC_TXT = {ciel: 'Hotham 2026 (CC BY 4.0)', etoiles: 'IMO (calculé)', secheresses: 'Old World Drought Atlas, NOAA/NCEI', hivers: 'Luterbacher et al. 2004, NOAA/NCEI', fossiles: 'Paleobiology Database (CC BY 4.0)',
        puits: 'BRGM (lien)', inscriptions: 'EDH (CC BY-SA 4.0)', libertes: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', religion: 'Wikidata (CC0)'};

    /* ─────────── les morceaux ─────────── */
    const lpmap = (lat, lon) => `https://www.lightpollutionmap.info/#zoom=10.00&lat=${Number(lat).toFixed(4)}&lon=${Number(lon).toFixed(4)}`;
    function skyRowHtml(place, B, lead) {
        const S = skyInfo(B), today = S.milky
            ? T('Aujourd’hui, à {p}, le ciel de la nuit est {r} fois plus clair que le ciel naturel : on y voit encore environ {n} étoiles et la Voie lactée.', {p: place.name || '', r: nf(S.ratio, S.ratio < 10 ? 1 : 0), n: nf(Math.round(S.stars / 100) * 100 || S.stars)})
            : T('Aujourd’hui, à {p}, le ciel de la nuit est {r} fois plus clair que le ciel naturel : on n’y voit plus qu’environ {n} étoiles, et la Voie lactée a disparu.', {p: place.name || '', r: nf(S.ratio, S.ratio < 10 ? 1 : 0), n: nf(S.stars > 200 ? Math.round(S.stars / 50) * 50 : Math.round(S.stars / 10) * 10)});
        const det = `<ul class="hist-ul te-ul"><li>${esc(T('Ciel naturel : magnitude {m} par seconde d’arc carrée, étoiles jusqu’à la magnitude {e} (environ {n} étoiles à la fois).', {m: nf(NATURAL.sqm, 1), e: nf(NATURAL.nelm, 1), n: nf(Math.round(NATURAL.stars / 100) * 100)}))}</li>
            <li>${esc(T('Aujourd’hui : magnitude {m}, étoiles jusqu’à la magnitude {e}.', {m: nf(S.sqm, 1), e: nf(S.nelm, 1)}))}</li></ul>
            ${hyp(T('Modèle de la clarté du ciel au zénith à partir des lumières vues par satellite en 2023, carreaux de 9 km : le centre des villes est encore plus clair, la campagne autour un peu plus noire. Avant l’éclairage électrique (vers 1900), le ciel de presque toute la France était naturel ; seules les grandes villes éclairées au gaz pâlissaient un peu le ciel.'))}
            <p class="muted">${link(lpmap(place.lat, place.lon), T('↗ La carte de la pollution lumineuse à cet endroit'))} · ${link(URLS.falchi, T('↗ Atlas de Falchi et al. 2016 (lien seulement)'))}</p>`;
        return row('🌌', `${lead ? `${lead} ` : ''}${esc(today)} ${srcLink(URLS.ciel)}`, SRC.ciel(), more(det));
    }
    async function skyForPerson(life) {
        const home = homeOf(life), {birth} = lifeSpan(life); if (!home || birth === null || birth > 1950) return '';
        const D = await quiet(load('ciel')); const B = skyAt(D?.grid, home.lat, home.lon); if (B === null) return '';
        const lead = T(life.person?.gender === 'female' ? 'Née à {p} en {y}, elle voyait la nuit un ciel noir : environ {n} étoiles et la Voie lactée.' : 'Né à {p} en {y}, il voyait la nuit un ciel noir : environ {n} étoiles et la Voie lactée.', {p: home.name, y: String(birth), n: nf(Math.round(NATURAL.stars / 100) * 100)});
        return skyRowHtml(home, B, esc(lead));
    }
    const wikiFr = t => `https://fr.wikipedia.org/wiki/${encodeURIComponent(t)}`;
    function meteorHtml(life) {
        const bd = birthDate(life), storms = stormsSeen(life); const parts = [];
        const sh = bd ? showerOn(bd.y, bd.m, bd.d) : null;
        if (sh) {
            const n = T(sh.s.n);
            parts.push(sh.atPeak ? T('La nuit de sa naissance ({d}), c’étaient les {s}, à leur maximum : jusqu’à {z} étoiles filantes à l’heure sous un ciel noir.', {d: dayTxt(bd.d, bd.m), s: n, z: String(sh.s.zhr)})
                : T('La nuit de sa naissance ({d}), c’étaient les {s} (maximum vers le {p}).', {d: dayTxt(bd.d, bd.m), s: n, p: dayTxt(sh.peak.d, sh.peak.m)}));
            if (sh.s.low) parts.push(T('(bas sur l’horizon, depuis la France)'));
        }
        if (storms.length) parts.push(T('{e} a pu voir {l}.', {e: cap(he(life.person)), l: storms.slice(0, 2).map(s => T('la {t} ({y}, {a})', {t: T(s.t), y: String(s.y), a: ageTxt(s.age)})).join(T(' et '))}));
        if (!parts.length) return '';
        const li = s => `<li>${esc(s.d.slice(0, 4))} — ${esc(T(s.t))} ${srcLink(wikiFr(STORM_WIKI[s.s]))}</li>`;
        const det = `${sh ? `<p class="muted">${esc(T('{s} : actifs du {a} au {b}, environ {z} étoiles filantes à l’heure au maximum (taux idéal, ciel noir, radiant au zénith).', {s: T(sh.s.n), a: dayTxt(sh.s.from[1], sh.s.from[0]), b: dayTxt(sh.s.to[1], sh.s.to[0]), z: String(sh.s.zhr)}))} ${srcLink(wikiFr(sh.s.w))}</p>` : ''}
            <p class="muted">${esc(T('Les grandes pluies d’étoiles :'))}</p><ul class="hist-ul te-ul">${STORMS.map(li).join('')}</ul>${hyp(T('Les dates des essaims sont fixes par rapport au Soleil (longitude solaire, liste de l’Organisation internationale des météores) : l’app les calcule pour chaque année. Le nombre d’étoiles filantes varie d’une année à l’autre.'))}`;
        return row('☄️', `${esc(parts.join(' '))} ${srcLink(sh ? wikiFr(sh.s.w) : wikiFr(STORM_WIKI[storms[0].s]))}`, SRC.etoiles(), more(det));
    }
    const PDSI_WORD = v => (v <= -40 ? 'sécheresse extrême' : v <= -30 ? 'grande sécheresse' : v <= -20 ? 'sécheresse' : v < 0 ? 'un peu sec' : v >= 40 ? 'très humide' : v >= 20 ? 'humide' : 'un peu humide');
    const pdsiTxt = v => `${nf(v / 10, 1)} · ${T(PDSI_WORD(v))}`;
    /** une petite bande : un trait par été (brun = sec, vert = humide) */
    function spark(years) {
        if (!years.length) return '';
        const w = Math.max(160, Math.min(560, years.length * 4)), bw = w / years.length, h = 40, mid = h / 2;
        const bars = years.map((x, i) => { const v = Math.max(-60, Math.min(60, x.v)), bh = Math.max(1, Math.abs(v) / 60 * (mid - 2)); return `<rect x="${(i * bw).toFixed(1)}" y="${(v < 0 ? mid : mid - bh).toFixed(1)}" width="${Math.max(1, bw - 0.6).toFixed(1)}" height="${bh.toFixed(1)}" class="${v < 0 ? 'te-dry' : 'te-wet'}"><title>${x.y} : ${esc(pdsiTxt(x.v))}</title></rect>`; }).join('');
        return `<svg class="te-spark" viewBox="0 0 ${w.toFixed(0)} ${h}" role="img" aria-label="${esc(T('Les étés de {a} à {b}', {a: String(years[0].y), b: String(years.at(-1).y)}))}"><line x1="0" x2="${w.toFixed(0)}" y1="${mid}" y2="${mid}" class="te-axis"/>${bars}</svg><small class="muted te-spark-legend">${years[0].y} — ${years.at(-1).y} · <span class="te-dry-txt">▮ ${esc(T('sec'))}</span> <span class="te-wet-txt">▮ ${esc(T('humide'))}</span></small>`;
    }
    async function droughtForPerson(life) {
        const home = homeOf(life); if (!home) return '';
        const D = await quiet(load('secheresses')); if (!D) return '';
        const cell = cellAt(D.rows, home.lat, home.lon), L = droughtLife(cell, life); if (!L) return '';
        const lead = T('Les étés de sa vie à {p}, d’après les cernes des arbres : le plus sec fut celui de {d} ({a}, {w}), le plus humide celui de {h}.', {p: home.name, d: String(L.dry.y), a: ageTxt(L.dry.age), w: T(PDSI_WORD(L.dry.v)), h: String(L.wet.y)})
            + (L.severe.length ? ' ' + T('{n} étés de grande sécheresse en tout.', {n: String(L.severe.length)}) : '');
        const det = `${spark(L.years)}<ul class="hist-ul te-ul">${[...L.years].sort((a, b) => a.v - b.v).slice(0, 5).map(x => `<li>${x.y} (${esc(ageTxt(x.age))}) : ${esc(pdsiTxt(x.v))}</li>`).join('')}</ul>${hyp(T('Indice de Palmer de l’été (juin à août) reconstruit par les cernes des arbres, au carreau de 50 km qui contient le lieu : 0 = normal, −3 et moins = grande sécheresse, +3 et plus = été très humide.'))}`;
        return row('🌾', `${esc(lead)} ${srcLink(URLS.owda)}`, SRC.owda(), more(det, L.years.length));
    }
    const degTxt = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 1)} °C`;
    const winterTxt = y => `${y - 1}-${y}`;
    async function seasonsForPerson(life) {
        const home = homeOf(life); if (!home) return '';
        const D = await quiet(load('hivers')); if (!D) return '';
        const cell = cellAt(D.rows, home.lat, home.lon), S = seasonsLife(cell, life); if (!S?.cold) return '';
        const rk = (r, hot) => (r.rank <= 3 && !r.partial ? T(hot ? 'l’un des trois plus chauds du {c}' : 'l’un des trois plus froids du {c}', {c: centuryTxt(r.century)}) : r.rank <= 10 && !r.partial ? T(hot ? 'l’un des dix plus chauds du {c}' : 'l’un des dix plus froids du {c}', {c: centuryTxt(r.century)}) : '');
        const cold = T('L’hiver {w} ({a}) fut le plus froid de sa vie à {p} : {d} par rapport à la moyenne du XXe siècle', {w: winterTxt(S.cold.y), a: ageTxt(S.cold.age), p: home.name, d: degTxt(S.cold.v)}) + (rk(S.cold) ? `, ${rk(S.cold)}` : '') + '.';
        const hot = S.hot && S.hot.v > 0.5 ? ' ' + T('L’été le plus chaud : {y} ({d}){r}.', {y: String(S.hot.y), d: degTxt(S.hot.v), r: rk(S.hot, true) ? `, ${rk(S.hot, true)}` : ''}) : '';
        const det = `${hyp(T('Température moyenne de l’hiver (décembre à février) et de l’été (juin à août) au carreau de 50 km qui contient le lieu : reconstruite de 1500 à 1900 (documents anciens, premiers thermomètres), mesurée ensuite ; écart à la moyenne 1901-2000 du même carreau.'))}`;
        return row('❄️', `${esc(cold + hot)} ${srcLink(URLS.hivers)}`, SRC.hivers(), more(det));
    }
    const libLi = x => `<li>🌳 <b>${link(wp(x.r.frwiki) || (x.r.src === 'wd' ? wd(x.r.id) : ''), x.r.n)}</b> <small class="muted">(${x.r.y ? esc(String(x.r.y)) : esc(T('année inconnue'))}${x.r.commune ? ` · ${esc(x.r.commune)}` : ''} · ${esc(kmTxt(x.km))})</small> ${srcLink(x.r.src === 'wd' ? wd(x.r.id) : osmUrl(x.r.id))}</li>`;
    const osmUrl = id => { const m = /^([nwr])(\d+)$/.exec(String(id || '')); return m ? `https://www.openstreetmap.org/${{n: 'node', w: 'way', r: 'relation'}[m[1]]}/${m[2]}` : ''; };
    async function libertyForPerson(life) {
        const D = await rowsOf('libertes'); if (!D.rows.length) return '';
        const list = libertyLife(D.rows, life); if (!list.length) return '';
        const f = list[0];
        const lead = T('En {y}, {a}, on planta un arbre de la Liberté près de chez {e}, à {p}.', {y: String(f.r.y), a: ageTxt(f.age), e: T(life.person?.gender === 'female' ? 'elle' : 'lui'), p: f.r.commune || f.place});
        return row('🌳', `${esc(lead)} ${srcLink(f.r.src === 'wd' ? wd(f.r.id) : osmUrl(f.r.id))}`, SRC.lib(list.some(x => x.r.src === 'osm')), more(`<ul class="hist-ul te-ul">${list.map(libLi).join('')}</ul>`, list.length));
    }
    const KIND_REL = {guerres: 'guerres de Religion', dragonnades: 'dragonnades', camisards: 'guerre des Camisards'};
    const relDate = r => (r.date ? dayTxt(Number(r.date.slice(8, 10)), Number(r.date.slice(5, 7))) + ' ' + r.y : String(r.y));
    const relLi = x => `<li>⚔️ <b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${esc(relDate(x.r))} · ${esc(T(KIND_REL[x.r.k] || x.r.k))} · ${esc(x.r.place || '')}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small> ${srcLink(wd(x.r.q))}</li>`;
    async function religionForPerson(life) {
        const D = await rowsOf('religion'); if (!D.rows.length) return '';
        const list = religionLife(D.rows, life); if (!list.length) return '';
        const lead = T('De son vivant, près de chez {e} : {l}.', {e: T(life.person?.gender === 'female' ? 'elle' : 'lui'), l: list.slice(0, 2).map(x => `${x.r.n} (${x.r.y}, ${ageTxt(x.age)}, ${kmTxt(x.km)})`).join(', ')});
        return row('⚔️', `${esc(lead)} ${srcLink(wd(list[0].r.q))}`, SRC.rel(), more(`<ul class="hist-ul te-ul">${list.map(relLi).join('')}</ul>${hyp(T('Des lieux et des dates (Wikidata) : les registres protestants, les listes de nouveaux convertis et les dossiers de la Régie des biens des religionnaires sont aux Archives départementales et à la Société de l’histoire du protestantisme français.'))}`, list.length));
    }
    function farcyHtml(life, priv) {
        if (priv || kiosk()) return '';
        const {birth, death} = lifeSpan(life); if (death === null && (birth === null || birth > 1900)) return ''; // seulement une personne décédée
        const which = farcyFor(life); if (!which.length) return '';
        const btn = k => `<button type="button" class="button small secondary" data-te-farcy="${k}" data-te-farcy-pid="${Number(life.person?.id) || 0}">${esc(T(k === '1848' ? '📋 Chercher ce nom — juin 1848' : '📋 Chercher ce nom — décembre 1851'))}</button>`;
        const lead = T('Une piste : s’il a été arrêté après les journées de Juin 1848 ou poursuivi après le coup d’État de décembre 1851, son nom est dans les bases de Jean-Claude Farcy.');
        return row('⚖️', `${esc(lead)}`, SRC.farcy(), `<p class="te-actions">${which.map(btn).join(' ')}</p>${more(`<ul class="hist-ul te-ul">${which.map(k => `<li>${link(FARCY[k].url, T(FARCY[k].label))} <small class="muted">— ${esc(T(FARCY[k].what))}</small></li>`).join('')}</ul>${hyp(T('Le bouton copie le nom sur l’ordinateur et ouvre le site : tu colles le nom dans sa recherche. Rien n’est envoyé par l’app. Ces bases n’ont pas de licence ouverte : rien n’en est copié.'))}`)}`);
    }
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-te-farcy]'); if (!b) return;
        const k = b.dataset.teFarcy, F = FARCY[k]; if (!F || kiosk()) return;
        let life = null; try { life = await lifeOf(Number(b.dataset.teFarcyPid)); } catch (_) {}
        const name = [String(life?.person?.last || '').toUpperCase(), life?.person?.first || ''].filter(Boolean).join(' ').trim();
        if (name) { try { await navigator.clipboard.writeText(name); A().toast?.(T('Nom copié : {n} — colle-le dans la recherche du site.', {n: name}), 'success'); } catch (_) { A().toast?.(T('Nom à chercher : {n}', {n: name})); } }
        root.open(F.url, '_blank', 'noopener');
    });

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['ciel', 'etoiles', 'secheresses', 'hivers', 'libertes', 'religion', 'farcy'];
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const priv = !!opts.private;
        const jobs = {ciel: () => skyForPerson(life), etoiles: () => meteorHtml(life), secheresses: () => droughtForPerson(life), hivers: () => seasonsForPerson(life),
            libertes: () => libertyForPerson(life), religion: () => religionForPerson(life), farcy: () => farcyHtml(life, priv)};
        const html = await Promise.all(want.filter(k => jobs[k]).map(k => Promise.resolve().then(jobs[k]).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life te-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        const priv = p.living_status === 'living' || Number(p.is_private) === 1 ? '1' : '';
        return A().card(index, T('🌌 Ciel, climat et mémoire'), '', `<div class="te-block" data-te-person="${Number(p.id)}" data-te-priv="${priv}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-te-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tePerson), {private: h.dataset.tePriv === '1'});
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['ciel', 'secheresses', 'hivers', 'fossiles', 'puits', 'inscriptions', 'libertes', 'religion'];
    const FOSSIL_GROUP = {Cephalopoda: 'ammonites et bélemnites', Bivalvia: 'coquillages', Gastropoda: 'escargots de mer', Brachiopoda: 'brachiopodes', Echinoidea: 'oursins', Anthozoa: 'coraux', Trilobita: 'trilobites',
        Mammalia: 'mammifères', Reptilia: 'reptiles', Ornithischia: 'dinosaures', Saurischia: 'dinosaures', Aves: 'oiseaux', Actinopteri: 'poissons', Chondrichthyes: 'requins et raies', Insecta: 'insectes',
        Crinoidea: 'crinoïdes', Ostracoda: 'ostracodes', Foraminifera: 'foraminifères', Globothalamea: 'foraminifères', Malacostraca: 'crabes et crevettes', Amphibia: 'amphibiens', Ichthyosauria: 'ichtyosaures', Plesiosauria: 'plésiosaures'};
    const groupsOf = list => { const c = new Map(); for (const x of list) for (const [, k] of (x.r.taxa || [])) { const g = FOSSIL_GROUP[k]; if (g) c.set(g, (c.get(g) || 0) + 1); } return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g); };
    const maTxt = r => { const a = num(r.max_ma), b = num(r.min_ma); if (a === null) return ''; const m = b === null ? a : (a + b) / 2; return m >= 1 ? T('≈ {n} millions d’années', {n: nf(Math.round(m))}) : T('≈ {n} ans', {n: nf(Math.round(m * 1e6 / 1000) * 1000)}); };
    const PBDB_COLL = no => `https://paleobiodb.org/classic/basicCollectionSearch?collection_no=${Number(no)}`;
    const fosLi = x => `<li>🦴 <b>${esc(x.r.name || T('gisement n° {n}', {n: String(x.r.no)}))}</b> <small class="muted">(${esc([x.r.early, x.r.late && x.r.late !== x.r.early ? x.r.late : ''].filter(Boolean).join(' – '))}${maTxt(x.r) ? ` · ${esc(maTxt(x.r))}` : ''} · ${esc(kmTxt(x.km))})</small>${(x.r.taxa || []).length ? `<br><small><i>${esc(x.r.taxa.map(t => t[0]).join(', '))}</i></small>` : ''} ${srcLink(PBDB_COLL(x.r.no))}</li>`;
    const kindTxt = k => (String(k || '').endsWith(' (?)') ? `${T(String(k).slice(0, -4))} (?)` : T(k || 'inscription'));
    const insLi = x => `<li>🏛 <b>${esc(kindTxt(x.r.kind))}</b> <small class="muted">(${esc([x.r.spot, x.r.anc ? `${T('antique :')} ${x.r.anc}` : '', x.r.from !== null ? `${x.r.from}–${x.r.to}` : '', x.km !== undefined ? kmTxt(x.km) : ''].filter(Boolean).join(' · '))}${x.r.approx ? ` · ${esc(T('position approchée'))}` : ''})</small><br><q class="te-latin" lang="la">${esc(x.r.text)}</q> ${srcLink(`https://edh.ub.uni-heidelberg.de/edh/inschrift/${encodeURIComponent(x.r.hd)}`)}</li>`;
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll && kind !== 'puits') return '';
        const P = {...place, ...ll};
        if (kind === 'ciel') { const D = await quiet(load('ciel')); const B = skyAt(D?.grid, ll.lat, ll.lon); if (B === null) return ''; return skyRowHtml(P, B, esc(T('Autrefois, le ciel noir : environ {n} étoiles et la Voie lactée.', {n: nf(Math.round(NATURAL.stars / 100) * 100)}))); }
        if (kind === 'secheresses') {
            const D = await quiet(load('secheresses')); if (!D) return ''; const cell = cellAt(D.rows, ll.lat, ll.lon); if (!cell) return '';
            const X = droughtExtremes(cell, 1500, 6), yrs = []; for (let y = Math.max(1700, cell.y0); y < cell.y0 + cell.v.length; y++) { const v = pdsiAt(cell, y); if (v !== null) yrs.push({y, v}); }
            const lead = T('Les étés les plus secs autour de {p} depuis 1500, d’après les cernes des arbres : {l}.', {p: place.name || '', l: X.dry.slice(0, 3).map(x => String(x.y)).join(', ')});
            return row('🌾', `${esc(lead)} ${srcLink(URLS.owda)}`, SRC.owda(), more(`${spark(yrs)}<ul class="hist-ul te-ul">${X.dry.map(x => `<li>☀️ ${x.y} : ${esc(pdsiTxt(x.v))}</li>`).join('')}${X.wet.map(x => `<li>🌧 ${x.y} : ${esc(pdsiTxt(x.v))}</li>`).join('')}</ul>${hyp(T('Indice de Palmer de l’été (juin à août) reconstruit par les cernes des arbres, au carreau de 50 km qui contient le lieu : 0 = normal, −3 et moins = grande sécheresse, +3 et plus = été très humide.'))}`));
        }
        if (kind === 'hivers') {
            const D = await quiet(load('hivers')); if (!D) return ''; const cell = cellAt(D.rows, ll.lat, ll.lon); if (!cell) return '';
            const X = seasonExtremes(cell, 5);
            const lead = T('Les hivers les plus froids autour de {p} depuis 1500 : {l}.', {p: place.name || '', l: X.cold.slice(0, 3).map(x => `${winterTxt(x.y)} (${degTxt(x.w)})`).join(', ')});
            return row('❄️', `${esc(lead)} ${srcLink(URLS.hivers)}`, SRC.hivers(), more(`<ul class="hist-ul te-ul">${X.cold.map(x => `<li>❄️ ${esc(winterTxt(x.y))} : ${esc(degTxt(x.w))}</li>`).join('')}${X.hot.map(x => `<li>☀️ ${esc(T('été {y}', {y: String(x.y)}))} : ${esc(degTxt(x.s))}</li>`).join('')}</ul>${hyp(T('Écart à la moyenne 1901-2000 du carreau de 50 km qui contient le lieu ; reconstruit de 1500 à 1900, mesuré ensuite (jusqu’en 2002).'))}`));
        }
        if (kind === 'fossiles') {
            const D = await rowsOf('fossiles'); if (!D.rows.length) return ''; const list = near(D.rows, ll.lat, ll.lon, 10, 40); if (!list.length) return '';
            const g = groupsOf(list), n = list.reduce((s, x) => s + (x.r.n || 0), 0);
            const lead = T('À moins de 10 km : {k} gisements de fossiles connus ({n} fossiles){g}.', {k: String(list.length), n: nf(n), g: g.length ? ` — ${g.slice(0, 3).map(x => T(x)).join(', ')}` : ''});
            return row('🦴', `${esc(lead)} ${srcLink(PBDB_COLL(list[0].r.no))}`, SRC.pbdb(), more(`<ul class="hist-ul te-ul">${list.slice(0, 15).map(fosLi).join('')}</ul>${hyp(T('Les noms sont ceux des espèces (en latin) ; l’âge est celui des couches de roche où ils ont été trouvés.'))}`, list.length));
        }
        if (kind === 'puits') {
            const lead = T('Les puits, forages et sondages anciens de la commune (profondeur, date, eau trouvée) sont sur la carte de la Banque du sous-sol du BRGM : cliquer sur un point ouvre sa fiche.');
            return row('🕳', `${esc(lead)} ${link(URLS.bss, T('↗ Carte InfoTerre (BRGM)'))}`, SRC.bss(), hyp(T('Lien seulement : le BRGM ne propose pas de fichier ouvert à télécharger et son service de cartes refuse les programmes ; rien n’est copié.')));
        }
        if (kind === 'inscriptions') {
            const D = await rowsOf('inscriptions'); if (!D.rows.length) return ''; const {here, around} = inscriptionsNear(D.rows, P, 10); if (!here.length && !around.length) return '';
            const list = [...here, ...around], f = list[0];
            const lead = here.length ? T('{n} inscriptions romaines trouvées à {c}', {n: String(here.length), c: place.name || f.r.spot}) : T('{n} inscriptions romaines trouvées à moins de 10 km', {n: String(around.length)});
            const q = `<q class="te-latin" lang="la">${esc(String(f.r.text).slice(0, 160))}${String(f.r.text).length > 160 ? '…' : ''}</q>`;
            return row('🏛', `${esc(lead)} : ${q} ${srcLink(`https://edh.ub.uni-heidelberg.de/edh/inschrift/${encodeURIComponent(f.r.hd)}`)}`, SRC.edh(), more(`<ul class="hist-ul te-ul">${list.slice(0, 25).map(insLi).join('')}</ul>${hyp(T('Texte tel que l’a transcrit l’Epigraphic Database Heidelberg : entre parenthèses les mots abrégés sur la pierre, entre crochets ce qui manque. « D(is) M(anibus) » = « aux dieux Mânes » (début des épitaphes). L’aide à la lecture latine de l’app aide à les lire.'))}`, list.length));
        }
        if (kind === 'libertes') {
            const D = await rowsOf('libertes'); if (!D.rows.length) return ''; const list = near(D.rows, ll.lat, ll.lon, 5, 20); if (!list.length) return '';
            const f = list[0], lead = f.r.y ? T('L’arbre de la Liberté de {c}, planté en {y} ({k}).', {c: f.r.commune || place.name || '', y: String(f.r.y), k: kmTxt(f.km)}) : T('Un arbre de la Liberté à {k} : {n}.', {k: kmTxt(f.km), n: f.r.n});
            return row('🌳', `${esc(lead)} ${srcLink(f.r.src === 'wd' ? wd(f.r.id) : osmUrl(f.r.id))}`, SRC.lib(list.some(x => x.r.src === 'osm')), more(`<ul class="hist-ul te-ul">${list.map(libLi).join('')}</ul>${hyp(T('On plantait des arbres de la Liberté sous la Révolution (1790-1794), en 1830, en 1848, pour le centenaire de 1889 et le bicentenaire de 1989 ; beaucoup ont été abattus sous l’Empire ou en 1850-1851.'))}`, list.length));
        }
        if (kind === 'religion') {
            const D = await rowsOf('religion'); if (!D.rows.length) return ''; const list = near(D.rows, ll.lat, ll.lon, 30, 20).sort((a, b) => a.r.y - b.r.y); if (!list.length) return '';
            const lead = T('Autour de {p} (30 km), pendant les guerres de Religion et la guerre des Camisards : {l}.', {p: place.name || '', l: list.slice(0, 2).map(x => `${x.r.n} (${x.r.y})`).join(', ')});
            return row('⚔️', `${esc(lead)} ${srcLink(wd(list[0].r.q))}`, SRC.rel(), more(`<ul class="hist-ul te-ul">${list.map(relLi).join('')}</ul>`, list.length));
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel te-panel"><h3>${esc(T('🌌 Ciel, climat et mémoire'))}</h3><div class="hist-life te-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'te_place', host: '[data-te-host]', icon: '🌌', label: 'Ciel, climat et mémoire', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-te])'); if (!village) return;
        village.dataset.te = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const place = villagePlace(village);
        const anchor = village.querySelector('[data-td-host]') || village.querySelector('[data-l10o-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="te-place" data-te-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-te-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['ciel', 'te_ciel', '🌌', 'Le ciel la nuit, hier et aujourd’hui', 'Le lieu'], ['secheresses', 'te_secheresses', '🌾', 'Les étés secs et humides depuis 1500', 'Le monde'], ['hivers', 'te_hivers', '❄️', 'Les hivers terribles depuis 1500', 'Le monde'],
        ['fossiles', 'te_fossiles', '🦴', 'Les fossiles du pays', 'Le lieu'], ['puits', 'te_puits', '🕳', 'Puits et forages anciens (lien)', 'Chercher'], ['inscriptions', 'te_inscriptions', '🏛', 'Inscriptions romaines', 'Le lieu'],
        ['libertes', 'te_libertes', '🌳', 'Arbres de la Liberté', 'Le lieu'], ['religion', 'te_religion', '⚔️', 'Guerres de Religion et Camisards', 'Le monde']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, group]) => ({
        id, icon, label, group, defaultOn: kind !== 'puits', enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life te-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'te_inscriptions', pack: 'te-inscriptions', icon: '🏛', label: T('Inscriptions romaines (France, Belgique, Suisse)'), group: 'Le lieu', source: 'Epigraphic Database Heidelberg (CC BY-SA 4.0)', sourceUrl: URLS.edh, enabled: () => on('inscriptions'),
            load: async () => (await rowsOf('inscriptions')).rows.map(r => ({hd: r.hd, kind: kindTxt(r.kind), spot: r.spot, ancient: r.anc, province: r.prov, from: r.from, to: r.to, text: r.text, approx: r.approx ? T('oui') : '', lat: r.lat, lon: r.lon, src: `https://edh.ub.uni-heidelberg.de/edh/inschrift/${r.hd}`})),
            fields: [{key: 'hd', label: T('N° EDH'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum'}, {key: 'spot', label: T('Lieu de découverte'), type: 'place'}, {key: 'ancient', label: T('Nom antique'), type: 'text'}, {key: 'province', label: T('Province romaine'), type: 'enum'},
                {key: 'from', label: T('Datée après'), type: 'year'}, {key: 'to', label: T('Datée avant'), type: 'year'}, {key: 'text', label: T('Texte latin'), type: 'text'}, {key: 'approx', label: T('Position approchée'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.from, r.to], geo: r => [r.lat, r.lon], open: r => root.open(r.src, '_blank', 'noopener')},
        {id: 'te_fossiles', pack: 'te-fossiles', icon: '🦴', label: T('Gisements de fossiles'), group: 'Le lieu', source: 'Paleobiology Database (CC BY 4.0)', sourceUrl: URLS.pbdb, enabled: () => on('fossiles'),
            load: async () => (await rowsOf('fossiles')).rows.map(r => ({name: r.name, formation: r.formation, early: r.early, late: r.late, ma: num(r.max_ma), n: r.n, taxa: (r.taxa || []).map(t => t[0]).join(', '), lat: r.lat, lon: r.lon, src: PBDB_COLL(r.no)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'formation', label: T('Formation'), type: 'text'}, {key: 'early', label: T('Étage'), type: 'enum'}, {key: 'ma', label: T('Âge (millions d’années)'), type: 'number'}, {key: 'n', label: T('Fossiles'), type: 'number'}, {key: 'taxa', label: T('Espèces'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            geo: r => [r.lat, r.lon], open: r => root.open(r.src, '_blank', 'noopener')},
        {id: 'te_libertes', pack: 'te-libertes', icon: '🌳', label: T('Arbres de la Liberté'), group: 'Le lieu', source: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', sourceUrl: 'https://www.wikidata.org/wiki/Q55100046', enabled: () => on('libertes'),
            load: async () => (await rowsOf('libertes')).rows.map(r => ({name: r.n, year: r.y, commune: r.commune, base: r.src === 'osm' ? 'OpenStreetMap' : 'Wikidata', lat: r.lat, lon: r.lon, src: r.src === 'osm' ? osmUrl(r.id) : wd(r.id)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'year', label: T('Planté en'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'base', label: T('Base'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, null], geo: r => [r.lat, r.lon], open: r => root.open(r.src, '_blank', 'noopener')},
        {id: 'te_religion', pack: 'te-religion', icon: '⚔️', label: T('Guerres de Religion, dragonnades, Camisards'), group: 'Le monde', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q673175', enabled: () => on('religion'),
            load: async () => (await rowsOf('religion')).rows.map(r => ({name: r.n, kind: T(KIND_REL[r.k] || r.k), what: r.kind, place: r.place, year: r.y, date: r.date, wikipedia: wp(r.frwiki), lat: r.lat, lon: r.lon, src: wd(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Conflit'), type: 'enum'}, {key: 'what', label: T('Sorte'), type: 'enum'}, {key: 'place', label: T('Lieu'), type: 'place'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'wikipedia', label: 'Wikipédia', type: 'url'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], geo: r => [r.lat, r.lon], open: r => root.open(r.wikipedia || r.src, '_blank', 'noopener')},
        {id: 'te_etoiles', icon: '☄️', label: T('Essaims d’étoiles filantes (calendrier)'), group: 'Le monde', source: 'IMO (calculé)', sourceUrl: URLS.imo, enabled: () => on('etoiles'),
            load: async () => SHOWERS.map(s => ({name: T(s.n), from: dayTxt(s.from[1], s.from[0]), to: dayTxt(s.to[1], s.to[0]), peak: (p => dayTxt(p.d, p.m))(peakDay(s, new Date().getFullYear())), zhr: s.zhr, src: wikiFr(s.w)})),
            fields: [{key: 'name', label: T('Essaim'), type: 'text'}, {key: 'from', label: T('Début'), type: 'text'}, {key: 'to', label: T('Fin'), type: 'text'}, {key: 'peak', label: T('Maximum (cette année)'), type: 'text'}, {key: 'zhr', label: T('Étoiles à l’heure (maximum)'), type: 'number'}, {key: 'src', label: T('Source'), type: 'url'}],
            open: r => root.open(r.src, '_blank', 'noopener')});

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, kind, src, name, filter = () => true) => ({id, icon, label: T(label), group: 'Le lieu', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 2000}) => { const D = await rowsOf(kind); const features = D.rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && filter(r, from, to) && (!q || fold(name(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: name(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('te_inscriptions', '🏛', 'Inscriptions romaines', 'inscriptions', 'EDH (CC BY-SA 4.0)', r => `${r.spot} : ${String(r.text).slice(0, 60)}`),
        layer('te_fossiles', '🦴', 'Gisements de fossiles', 'fossiles', 'Paleobiology Database (CC BY 4.0)', r => r.name || r.early),
        layer('te_libertes', '🌳', 'Arbres de la Liberté', 'libertes', 'Wikidata (CC0) ; OpenStreetMap (ODbL)', r => `${r.n}${r.y ? ` (${r.y})` : ''}`, (r, from, to) => !to || r.y === null || r.y <= to),
        layer('te_religion', '⚔️', 'Guerres de Religion et Camisards', 'religion', 'Wikidata (CC0)', r => `${r.n} (${r.y})`, (r, from, to) => (!to || r.y <= to) && (!from || r.y >= from)));

    /* ─────────── 🧰 le registre commun : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    const privOfCtx = ctx => { const p = ctx.person?.person || ctx.person; return !!(p && typeof p === 'object' && (p.living_status === 'living' || Number(p.is_private) === 1)); };
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true, private: privOfCtx(ctx)});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life te-life">${html}</div>` : '';
        return !!html;
    }
    const PERSON_DS = [['ciel', '🌌', 'Le ciel noir de sa naissance', 'Il faut un lieu de naissance placé sur la carte (France et pays voisins), avant 1950.'], ['etoiles', '☄️', 'Les étoiles filantes de sa naissance', 'Il faut une date de naissance complète (jour et mois).'],
        ['secheresses', '🌾', 'Les étés secs et humides de sa vie', 'Il faut un lieu de naissance placé (France et pays voisins) et une année.'], ['hivers', '❄️', 'Les hivers terribles de sa vie', 'Il faut un lieu de naissance placé (France et pays voisins), entre 1500 et 2002.'],
        ['libertes', '🌳', 'Les arbres de la Liberté de son vivant', 'Aucun arbre de la Liberté daté connu près de ses lieux, de son vivant.'], ['religion', '⚔️', 'Les guerres de Religion près de chez lui', 'Rien de connu près de ses lieux de son vivant (avant 1715).'],
        ['farcy', '⚖️', 'Insurgés de 1848, poursuivis de 1851 (lien)', 'Pour une personne décédée, adulte en 1848 ou 1851 (jamais pour une fiche vivante ou confidentielle).']];
    (ext.dataSources = ext.dataSources || []).push(
        ...PERSON_DS.map(([k, icon, label, empty]) => ({id: `tep_${k}`, icon, label: T(label), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson([k], ctx, host, empty)})),
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── 🌍 Où chercher : des sites en plus (liens seulement) ─────────── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES) || M.SITES.some(s => s.key === 'te_farcy_1851')) return !!M;
        M.SITES.push(
            {key: 'te_farcy_1848', icon: '⚖️', group: 'Monde', label: T('Inculpés de l’insurrection de juin 1848 (base de J.-C. Farcy)'), cats: ['justice'], period: [1848, 1849], access: 'online',
                url: () => FARCY[1848].url, rel: {countries: ['fr'], from: 1848, to: 1849, base: 0.05, why: () => T('Les 11 662 personnes jugées après les journées de Juin à Paris')}},
            {key: 'te_farcy_1851', icon: '⚖️', group: 'Monde', label: T('Poursuivis à la suite du coup d’État de décembre 1851 (base de J.-C. Farcy)'), cats: ['justice'], period: [1851, 1853], access: 'online',
                url: () => FARCY[1851].url, rel: {countries: ['fr'], from: 1851, to: 1853, base: 0.08, why: () => T('Les 26 848 personnes poursuivies après le coup d’État, dans toute la France')}},
            {key: 'te_bss', icon: '🕳', group: 'Monde', label: T('Banque du sous-sol (BRGM) — puits et forages anciens'), cats: ['cartes'], period: [1800, 2025], access: 'online',
                url: () => URLS.bss, rel: {countries: ['fr'], from: 1800, to: 2025, base: 0.03, why: () => T('Les puits et forages de la commune, avec leur profondeur et leur date')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🌌 Ciel, climat et mémoire ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(Object.keys(FILES).map(async k => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-te-tg="${key}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = (k, label) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Pas encore fabriqué : il arrive par Réglages → 🗂 Données après le passage de l’atelier GitHub.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}${m.quote ? `<br><small class="muted">« ${esc(m.quote)} »</small>` : ''}</td><td>${esc(nf(D.rows.length || (m.w * m.h) || 0))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings te-settings" data-te-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Ciel, climat et mémoire'), icon: '🌌', where: T('Réglages · Données'), help: esc(T('Le ciel noir d’autrefois, les étoiles filantes, les étés secs et les hivers terribles, les fossiles, les puits, les inscriptions romaines, les arbres de la Liberté, les guerres de Religion, les insurgés de 1848 et 1851.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🌌 Ciel, climat et mémoire »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes, les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${fileRow('ciel', '🌌 Le ciel la nuit')}${fileRow('secheresses', '🌾 Sécheresses')}${fileRow('hivers', '❄️ Hivers et étés')}${fileRow('inscriptions', '🏛 Inscriptions romaines')}${fileRow('fossiles', '🦴 Fossiles')}${fileRow('libertes', '🌳 Arbres de la Liberté')}${fileRow('religion', '⚔️ Guerres de Religion')}
                <tr><td>${esc(T('☄️ Étoiles filantes'))}</td><td colspan="4" class="muted">${esc(T('Calculées sur l’ordinateur : dates des essaims fixes par rapport au Soleil (liste de l’IMO), grandes pluies d’étoiles connues.'))} ${link(URLS.imo, 'IMO')}</td></tr></tbody></table></div>
                <p class="muted">${esc(T('Rien ne part sur Internet : tout est lu sur l’ordinateur. Seuls les liens « ↗ » ouvrent une page, sur un clic.'))}</p>
                <p class="muted">${esc(T('Liens seulement (licence pas ouverte ou pas de fichier ouvert) : l’atlas du ciel de Falchi et al. 2016 (CC BY-NC, redistribution interdite), la Banque du sous-sol du BRGM, les bases de Jean-Claude Farcy (1848, 1851). « Chercher ce nom » copie le nom sur l’ordinateur, seulement pour une personne décédée, jamais en consultation.'))}</p>
                <p class="muted">${link(URLS.falchi, T('↗ Atlas de Falchi et al. 2016 (lien seulement)'))} · ${link(URLS.bss, T('↗ Carte InfoTerre (BRGM)'))} · ${link(FARCY[1848].url, '1848')} · ${link(FARCY[1851].url, '1851')}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-te-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.teTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🌌'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_d'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_d'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🌌 Ciel, climat et mémoire']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechE = {...core, load, settings, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
