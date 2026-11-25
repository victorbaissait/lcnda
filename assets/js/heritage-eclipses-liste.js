/* LCNDA — 🌘 Éclipses de soleil et de lune : la liste de toutes les éclipses, de l'an 1000 av. J.-C. à 2100.
 * Rien à télécharger : tout est calculé par assets/js/app-lune-core.js (Jean Meeus, « Astronomical Algorithms », ch. 54 ;
 * ΔT d'Espenak et Meeus, NASA). Le « Five Millennium Canon of Solar / Lunar Eclipses » de la NASA (Espenak et Meeus, domaine public
 * aux États-Unis, œuvre du gouvernement fédéral) sert de référence : chaque ligne a un lien ↗ vers sa page à la NASA.
 *
 *  - Listes → 🧰 Données → « 🌘 Éclipses de soleil et de lune » (registre LCNDA_EXT.dataLists, moteur app-listes-donnees.js) :
 *    une ligne par éclipse (date, Soleil / Lune, totale / annulaire / hybride / partielle / par la pénombre, grandeur,
 *    durée de la totalité, où on la voyait le mieux) ; 📅 Période ; 📍 Autour de… = « vue de ce lieu » : seulement les éclipses
 *    visibles de là, avec l'heure locale du maximum et la part cachée ; 🗺 Carte : le point où elle était la plus forte.
 *    La liste fait elle-même le tri (query) : le calcul « vue d'un lieu » (minute par minute) n'est fait que pour ce qui reste.
 *  - LCNDA_EXT.dataSources : « Les éclipses qu'il a pu voir » (une personne, de son vivant, d'où elle vivait),
 *    « Les éclipses vues de ce lieu » (les grandes, depuis 1500), « Les éclipses d'une année ».
 * Lecture seule. Essai : tests/test-liste-eclipses.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const X = () => window.LCNDA_LUNE;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const R = Math.PI / 180, RE = 6378.14;
    const Y1 = -999, Y2 = 2100;
    const ID = 'eclipses';
    const SOURCE = 'NASA, Five Millennium Canon (Espenak & Meeus, domaine public) ; calcul : J. Meeus, Astronomical Algorithms';
    const SOURCE_URL = 'https://eclipse.gsfc.nasa.gov/SEpubs/5MCSE.html';
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const pad = (n, k = 2) => String(Math.abs(n)).padStart(k, '0');
    /** « 11 août 1999 », « 28 mai 585 av. J.-C. » (calendrier julien avant le 15 octobre 1582, comme la NASA) */
    const dateText = c => { const d = `${c.d === 1 ? '1er' : c.d} ${T(MOIS[c.m - 1])}`; return c.y > 0 ? `${d} ${c.y}` : T('{d} {y} av. J.-C.', {d, y: 1 - c.y}); };
    const dur = s => { if (!(s > 0)) return ''; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.round(s % 60); return h ? T('{h} h {m} min', {h, m: pad(m)}) : m ? T('{m} min {s} s', {m, s: pad(r)}) : T('{s} s', {s: r}); };

    /* ─────────── les liens NASA ─────────── */
    const nasaYmd = c => `${c.y < 0 ? '-' : ''}${pad(c.y, 4)}${pad(c.m)}${pad(c.d)}`;
    const century = y => { const a = Math.floor((y - 1) / 100) * 100 + 1, b = a + 99, f = v => (v < 0 ? '-' + pad(v, 4) : pad(v, 4)); return `${f(a)}-${f(b)}`; };
    const nasaUrl = (e, c) => (e.kind === 'solar' ? `https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=${nasaYmd(c)}` : `https://eclipse.gsfc.nasa.gov/LEcat5/LE${century(c.y)}.html`);

    /* ─────────── où on la voyait le mieux ─────────── */
    const vec = p => [p.dist * Math.cos(p.dec * R) * Math.cos(p.ra * R), p.dist * Math.cos(p.dec * R) * Math.sin(p.ra * R), p.dist * Math.sin(p.dec * R)];
    const lonOf = (ra, jdUT) => { let l = ra - X().sidereal(jdUT); l = ((l + 180) % 360 + 360) % 360 - 180; return l; };
    /** Soleil : là où l'axe de l'ombre touche la Terre (ou en passe le plus près) ; Lune : le point qui a la Lune au zénith */
    function bestPoint(e) {
        const L = X();
        if (e.kind === 'lunar') { const m = L.moon(e.jde); return [m.dec, lonOf(m.ra, e.jd)]; }
        const S = vec(L.sun(e.jde)), M = vec(L.moon(e.jde)), D = [M[0] - S[0], M[1] - S[1], M[2] - S[2]], n = Math.hypot(...D), u = D.map(x => x / n);
        const b = M[0] * u[0] + M[1] * u[1] + M[2] * u[2], c = M[0] ** 2 + M[1] ** 2 + M[2] ** 2 - RE * RE, disc = b * b - c;
        const t = disc >= 0 ? -b - Math.sqrt(disc) : -b, P = [M[0] + t * u[0], M[1] + t * u[1], M[2] + t * u[2]], r = Math.hypot(...P);
        return [Math.asin(P[2] / r) / R, lonOf(Math.atan2(P[1], P[0]) / R, e.jd)];
    }
    // grandes zones (à quelques centaines de km près) : la première qui contient le point
    const ZONES = [['Antarctique', -90, -60, -180, 180], ['Arctique', 70, 90, -180, 180], ['Europe', 36, 70, -11, 40], ['Afrique du Nord', 15, 36, -18, 35],
        ['Moyen-Orient', 12, 42, 35, 63], ['Afrique', -35, 15, -18, 52], ['Inde', 5, 35, 63, 92], ['Asie du Sud-Est', -10, 25, 92, 140], ['Asie', 5, 70, 40, 180],
        ['Australie', -45, -10, 112, 155], ['Amérique centrale', 7, 23, -118, -60], ['Amérique du Nord', 15, 70, -170, -50], ['Amérique du Sud', -56, 13, -82, -34]];
    function zoneOf(lat, lon) {
        const z = ZONES.find(([, a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d); if (z) return T(z[0]);
        if (lon > -70 && lon < 20) return T('océan Atlantique');
        if (lon >= 20 && lon < 120 && lat < 25) return T('océan Indien');
        return T('océan Pacifique');
    }
    const latText = v => T(v >= 0 ? '{v}° N' : '{v}° S', {v: Math.abs(v).toFixed(0)});
    const lonText = v => T(v >= 0 ? '{v}° E' : '{v}° O', {v: Math.abs(v).toFixed(0)});

    /* ─────────── le catalogue (calculé une fois) ─────────── */
    const TYPES = {total: 'totale', annular: 'annulaire', hybrid: 'hybride', partial: 'partielle', penumbral: 'par la pénombre'};
    let CAT = null;
    function catalogue() {
        if (CAT) return CAT;
        const L = X(); if (!L) return [];
        const all = [...L.solarEclipses(Y1, Y2), ...L.lunarEclipses(Y1, Y2)].sort((a, b) => a.jd - b.jd);
        CAT = all.map(e => {
            const c = L.fromJd(e.jd), g = bestPoint(e), solar = e.kind === 'solar';
            const tot = !solar && e.contacts.u2 ? (e.contacts.u3 - e.contacts.u2) * 86400 : 0;
            const where = solar ? (e.central ? T('centrale ; au plus fort : {z} ({a}, {o})', {z: zoneOf(...g), a: latText(g[0]), o: lonText(g[1])}) : T('partielle partout ; au plus fort : {z} ({a}, {o})', {z: zoneOf(...g), a: latText(g[0]), o: lonText(g[1])}))
                : T('la moitié de la Terre où il fait nuit ; au centre : {z}', {z: zoneOf(...g)});
            return {_e: e, _jd: e.jd, _lat: g[0], _lon: g[1], id: e.id,
                date: dateText(c), year: c.y, body: solar ? T('Soleil') : T('Lune'), type: T(TYPES[e.type] || e.type),
                mag: solar ? (e.mag != null ? Math.round(e.mag * 1000) / 1000 : null) : Math.round((e.type === 'penumbral' ? e.magPen : e.magUmb) * 1000) / 1000,
                totality: dur(tot), _tot: tot, gamma: Math.round(e.gamma * 10000) / 10000, region: where,
                seen: '', local: '', pct: null, nasa: nasaUrl(e, c)};
        });
        return CAT;
    }
    /** les détails d'une éclipse de soleil centrale (grandeur et durée au point de plus grande éclipse) : seulement pour ce qui est montré */
    function detail(row) {
        if (row._det || row._e.kind !== 'solar' || !row._e.central) return row;
        row._det = true;
        try {
            const r = X().solarAt(row._e, row._lat, row._lon);
            if (r) { if (row.mag == null) row.mag = Math.round(r.mag * 1000) / 1000; if (r.duration > 0) { row._tot = r.duration; row.totality = dur(r.duration); } }
        } catch (_) {}
        return row;
    }

    /* ─────────── vue d'un lieu ─────────── */
    const seenCache = new Map();
    const visible = (e, r) => r && (e.kind === 'lunar' ? r.type !== 'penumbral' || e.magPen >= 0.6 : r.obscuration >= 1);
    const angDist = (a, b, c, d) => Math.acos(Math.max(-1, Math.min(1, Math.sin(a * R) * Math.sin(c * R) + Math.cos(a * R) * Math.cos(c * R) * Math.cos((d - b) * R)))) / R;
    /** ce qu'on en voyait de p = {lat, lon, name, country} : null (rien) ou {r, text, local, pct} */
    function seenFrom(row, p) {
        const e = row._e, L = X(), key = `${e.id}|${p.lat.toFixed(2)}|${p.lon.toFixed(2)}`;
        if (seenCache.has(key)) return seenCache.get(key);
        let out = null;
        // tri rapide : la Lune ne se lève pas pendant l'éclipse / le Soleil reste couché pendant 7 heures → rien
        let maybe = true;
        if (e.kind === 'lunar') { const half = (e.contacts.p4 - e.contacts.p1) / 2 * 24 * 15.04; maybe = angDist(p.lat, p.lon, row._lat, row._lon) < 90 + half + 2; }
        else { maybe = false; for (let h = -3.5; h <= 3.5 && !maybe; h += 1) maybe = L.topo('sun', e.jd + h / 24, p.lat, p.lon).alt > -2; }
        if (maybe) {
            const r = e.kind === 'solar' ? L.solarAt(e, p.lat, p.lon) : L.lunarAt(e, p.lat, p.lon);
            if (visible(e, r)) {
                const s = ext.lune?.seenText ? ext.lune.seenText(e, r, p) : null;
                const at = e.kind === 'solar' ? r.jd : r.maxVisible ? e.jd : (r.total || r.umbral || r.penumbral).from;
                const ck = L.localClock(at, p.lat, p.lon, p.country || '');
                const pct = e.kind === 'solar' ? Math.round(r.obscuration) : r.type === 'penumbral' ? 0 : Math.round(Math.min(1, e.magUmb) * 100);
                out = {r, pct, local: ck.legal ? ck.text : T('{h} (heure solaire)', {h: ck.text}), text: s ? `${s.label} : ${s.short}` : T(TYPES[r.type] || r.type)};
            }
        }
        if (seenCache.size > 50000) seenCache.clear();
        seenCache.set(key, out); return out;
    }

    /* ─────────── la demande du moteur des Listes ─────────── */
    const LOCAL = new Set(['seen', 'local', 'pct']);
    function rowMatch(row, f) {
        const x = row[f.key], v = f.value;
        if (f.op === 'in' || Array.isArray(v)) return (Array.isArray(v) ? v : [v]).map(fold).includes(fold(x));
        const isNum = x !== null && x !== '' && x !== undefined && Number.isFinite(Number(x));
        switch (f.op) {
            case 'eq': return isNum && Number.isFinite(Number(v)) ? Number(x) === Number(v) : fold(x) === fold(v);
            case 'gte': return isNum && Number(x) >= Number(v);
            case 'lte': return isNum && Number(x) <= Number(v);
            case 'starts': return fold(x).startsWith(fold(v));
            case 'true': return !!x; case 'false': return !x;
            case 'empty': return x == null || x === '';
            case 'notempty': return !(x == null || x === '');
            default: return fold(x).includes(fold(v));
        }
    }
    const yearsOk = (row, y) => { if (!y) return true; const a = Number(y.from), b = Number(y.to ?? y.from); return (!Number.isFinite(a) || row.year >= a) && (!Number.isFinite(b) || row.year <= b); };
    const pause = () => new Promise(r => setTimeout(r, 0));
    let last = null; // {key, rows} : la dernière demande (le moteur relit des pages de la même)
    async function run(query = {}) {
        const key = JSON.stringify({...query, offset: 0, limit: 0});
        if (last?.key === key) return last.rows;
        const fs = query.filters || [], base = fs.filter(f => !LOCAL.has(f.key)), loc = fs.filter(f => LOCAL.has(f.key));
        let rows = catalogue().filter(r => yearsOk(r, query.years) && base.every(f => rowMatch(r, f)));
        const near = query.near && Number.isFinite(Number(query.near.lat)) ? {lat: Number(query.near.lat), lon: Number(query.near.lon), name: query.near.title || '', country: query.near.country || ''} : null;
        if (near) {
            const out = []; let t0 = Date.now();
            for (const r of rows) {
                const s = seenFrom(r, near);
                if (s) out.push({...r, seen: s.text, local: s.local, pct: s.pct, _seenType: s.r.type, _km: Math.round(angDist(near.lat, near.lon, r._lat, r._lon) * 111.2)});
                if (Date.now() - t0 > 60) { await pause(); t0 = Date.now(); }
            }
            rows = out;
        }
        if (loc.length) rows = rows.filter(r => loc.every(f => rowMatch(r, f)));
        const q = fold(query.q || '').trim();
        if (q) rows = rows.filter(r => ['date', 'year', 'body', 'type', 'region', 'seen', 'totality'].some(k => fold(r[k]).includes(q)));
        if (query.sort) {
            const s = query.dir === 'desc' ? -1 : 1, k = {date: '_jd', totality: '_tot', year: '_jd'}[query.sort] || query.sort, empty = v => v == null || v === '';
            rows = [...rows].sort((a, b) => { const x = a[k], y = b[k]; if (empty(x)) return empty(y) ? 0 : 1; if (empty(y)) return -1; return s * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', {numeric: true})); });
        }
        last = {key, rows};
        return rows;
    }
    async function query(qr = {}) {
        if (!X()) throw new Error(T('Le calcul des éclipses n’est pas chargé.'));
        const rows = await run(qr), off = Number(qr.offset) || 0, lim = Number(qr.limit) || 100;
        return {rows: rows.slice(off, off + lim).map(detail), total: rows.length};
    }
    const types = () => [...new Set(Object.values(TYPES))].map(v => T(v));

    (ext.dataLists = ext.dataLists || []).push({
        id: ID, icon: '🌘', label: 'Éclipses de soleil et de lune', group: 'Le monde', source: SOURCE, sourceUrl: SOURCE_URL,
        query,
        facet: async key => { const n = new Map(); (await run({})).forEach(r => { const v = r[key]; if (v != null && v !== '') n.set(v, (n.get(v) || 0) + 1); }); return [...n.entries()]; },
        fields: [
            {key: 'date', label: 'Date', type: 'text'},
            {key: 'year', label: 'Année', type: 'year', hidden: true},
            {key: 'body', label: 'Soleil ou Lune', type: 'enum', values: ['Soleil', 'Lune'].map(v => T(v))},
            {key: 'type', label: 'Type', type: 'enum', get values() { return types(); }},
            {key: 'mag', label: 'Grandeur', type: 'number'},
            {key: 'totality', label: 'Durée de la totalité', type: 'text'},
            {key: 'region', label: 'Où on la voyait le mieux', type: 'text'},
            {key: 'seen', label: 'Vue du lieu choisi', type: 'text'},
            {key: 'local', label: 'Heure locale du maximum', type: 'text'},
            {key: 'pct', label: 'Part cachée (%)', type: 'number'},
            {key: 'gamma', label: 'Gamma', type: 'number', hidden: true},
            {key: 'nasa', label: 'La page de la NASA', type: 'url'}],
        period: r => [r.year, r.year],
        geo: r => [r._lat, r._lon],
        open: r => window.open(r.nasa, '_blank', 'noopener'),
        installed: () => !!X(),
    });

    /* ─────────── 🧰 Données : à la demande ─────────── */
    const placeOf = ev => (ev && ev.latitude != null && ev.longitude != null && ev.latitude !== '' && ev.longitude !== '' ? {lat: Number(ev.latitude), lon: Number(ev.longitude), name: ev.place_name || '', country: ev.country || ''} : null);
    const ctxPlace = pl => { if (!pl) return null; const lat = Number(pl.lat ?? pl.latitude), lon = Number(pl.lon ?? pl.lng ?? pl.longitude); return Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? {lat, lon, name: pl.name || pl.place_name || pl.title || '', country: pl.country || ''} : null; };
    const personDetail = async ctx => (ctx?.person?.events ? ctx.person : A().api('person', {id: Number(ctx?.person?.id ?? ctx?.person)}));
    const none = (host, txt) => { host.innerHTML = `<p class="muted">${esc(txt)}</p>`; return false; };
    const listHtml = (items, extra = '') => `<ul class="ecl-ds">${items.map(it => `<li><span aria-hidden="true">${it.row._e.kind === 'solar' ? '🌑' : '🌘'}</span> <b>${esc(it.row.date)}</b>${it.where ? ` · ${esc(it.where)}` : ''} — ${esc(it.s.text)} <a href="${esc(it.row.nasa)}" target="_blank" rel="noopener" title="${esc(T('La page de la NASA'))}">↗</a></li>`).join('')}</ul>${extra}`;
    const openBtn = (preset, label) => { const k = `ecl${Math.random().toString(36).slice(2, 8)}`; presets.set(k, preset); return `<p><button type="button" class="table-link" data-ecl-open="${k}">${esc(label)}</button></p>`; };
    const presets = new Map();
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-ecl-open]'); if (!b) return; const p = presets.get(b.dataset.eclOpen); if (p) ext.dataListsEngine?.open?.(ID, p); });

    /** les éclipses vues par une personne de son vivant (à partir de 5 ans), d'où elle vivait */
    async function personSeen(detail) {
        const L = X(), evs = (detail?.events || []).map(ev => {
            const c = L.dayOf(ev.date_text, ev.sort_date), y = Number(ev.year) || null, p = placeOf(ev);
            const jd = c ? L.jd(c.y, c.m, c.d, 12) : y ? L.jd(y, 7, 1) : null;
            return jd == null ? null : {jd, p, tag: ev.gedcom_tag || ''};
        }).filter(Boolean).sort((a, b) => a.jd - b.jd);
        const birth = evs.find(e => /^(BIRT|CHR|BAPM)$/.test(e.tag)), death = evs.find(e => /^(DEAT|BURI|CREM)$/.test(e.tag));
        const placed = evs.filter(e => e.p); if (!birth || !placed.length) return null;
        const now = Date.now() / 86400000 + 2440587.5, from = birth.jd + 5 * 365.25, to = Math.min(death ? death.jd : birth.jd + 90 * 365.25, now);
        const at = j => { let p = placed[0].p; for (const e of placed) { if (e.jd <= j) p = e.p; else break; } return p; };
        const out = []; let t0 = Date.now();
        for (const row of catalogue()) {
            if (row._jd < from || row._jd > to) continue;
            const p = at(row._jd), s = seenFrom(row, p); if (s) out.push({row, s, where: p.name, p});
            if (Date.now() - t0 > 60) { await pause(); t0 = Date.now(); }
        }
        return {items: out, from: L.fromJd(birth.jd).y, to: L.fromJd(to).y, home: placed[0].p};
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'eclipses-vues', icon: '🌘', label: 'Les éclipses qu’il a pu voir (Soleil et Lune)', group: 'La personne', needs: ['person'], installed: () => !!X(), source: SOURCE, sourceUrl: SOURCE_URL,
            run: async (ctx, host) => {
                const d = await personDetail(ctx), r = d && await personSeen(d);
                if (!r) return none(host, T('Il faut une naissance datée et un lieu placé sur la carte.'));
                if (!r.items.length) return none(host, T('Aucune éclipse visible de ses lieux de vie (à partir de ses 5 ans).'));
                const big = r.items.filter(it => it.s.pct >= 80 || ['total', 'annular'].includes(it.s.r.type));
                host.innerHTML = `<p>${esc(T('{n} éclipses visibles de ses lieux de vie, dont {b} grandes (totales, annulaires ou plus de 80 %).', {n: r.items.length, b: big.length}))}</p>${listHtml(big.length ? big : r.items.slice(0, 20))}
                    ${openBtn({near: {lat: r.home.lat, lon: r.home.lon, km: 1, title: r.home.name}, period: {mode: 'overlap', from: r.from, to: r.to}}, T('Voir toutes ces éclipses dans la liste →'))}`;
                return true;
            }},
        {id: 'eclipses-lieu', icon: '🌘', label: 'Les grandes éclipses vues de ce lieu (depuis 1500)', group: 'Le lieu', needs: ['place'], installed: () => !!X(), source: SOURCE, sourceUrl: SOURCE_URL,
            run: async (ctx, host) => {
                const p = ctxPlace(ctx?.place); if (!p) return none(host, T('Choisis un lieu placé sur la carte.'));
                const rows = await run({near: {lat: p.lat, lon: p.lon, km: 1, title: p.name, country: p.country}, years: {from: 1500, to: 2100, mode: 'overlap'}});
                const big = rows.filter(r => r.pct >= 90 || ['total', 'annular'].includes(r._seenType));
                if (!big.length) return none(host, T('Aucune grande éclipse vue d’ici depuis 1500.'));
                host.innerHTML = listHtml(big.map(row => ({row, s: {text: row.seen}, where: row.local})), openBtn({near: {lat: p.lat, lon: p.lon, km: 1, title: p.name}}, T('Voir toutes les éclipses vues d’ici →')));
                return true;
            }},
        {id: 'eclipses-annee', icon: '🌘', label: 'Les éclipses d’une année', group: 'Le monde', needs: ['year'], installed: () => !!X(), source: SOURCE, sourceUrl: SOURCE_URL,
            run: async (ctx, host) => {
                const y = Number(ctx?.year); if (!Number.isFinite(y)) return none(host, T('Choisis une année.'));
                const rows = (await run({years: {from: y, to: y, mode: 'in'}})).map(detail);
                if (!rows.length) return none(host, T('Aucune éclipse en {y}.', {y}));
                host.innerHTML = `<ul class="ecl-ds">${rows.map(r => `<li><span aria-hidden="true">${r._e.kind === 'solar' ? '🌑' : '🌘'}</span> <b>${esc(r.date)}</b> · ${esc(r.body)}, ${esc(r.type)}${r.totality ? ` (${esc(r.totality)})` : ''} — ${esc(r.region)} <a href="${esc(r.nasa)}" target="_blank" rel="noopener" title="${esc(T('La page de la NASA'))}">↗</a></li>`).join('')}</ul>${openBtn({period: {mode: 'in', from: y, to: y}}, T('Ouvrir la liste des éclipses →'))}`;
                return true;
            }});

    ext.eclipsesListe = {catalogue, run, query, seenFrom, bestPoint, zoneOf, nasaUrl, dateText, personSeen};
})();
