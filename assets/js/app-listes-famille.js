/* LCNDA — 👪 « Dans la famille » pour les listes de données (moteur commun : app-listes-donnees.js).
 *
 *  Tout se calcule ICI, dans le navigateur, avec les lieux placés et les dates de la généalogie (GET ld_famille,
 *  lib/listes_famille.php : jamais une fiche ni un événement confidentiel ; en consultation, pas les vivants). Rien ne part sur Internet.
 *  - une colonne « Dans la famille » : une liste qui a geo() et period() le demande par `familyColumn: true` (rayon : `familyKm`,
 *    sinon Réglages → 🧰 Listes de données, 15 km au départ) → « Louis DURAND, 29 ans », « Jean MAZAUD naît cette année-là »,
 *    « avant la famille » (personne n'était encore né près de là), vide sinon ;
 *  - un critère pour toute liste placée : « 👪 Près des lieux de la famille, à N km » (LCNDA_EXT.dataListFilters) ;
 *  - une pastille toute faite pour une liste (d.chips) : LCNDA_EXT.listesFamille.chip({km}) → « 👪 Seulement près de la famille ».
 *  Rapide : les lieux sont rangés par cases d'un degré ; une ligne ne regarde que les cases autour d'elle.
 *  API : LCNDA_EXT.listesFamille = {ready(), nearKm(lat, lon, max), presence(lat, lon, year, km), fill(res, rows, d), chip(o), km()}
 *  Essai : tests/test-listes-themes.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const R = Math.PI / 180;
    const km = (a, b, c, d) => { const x = Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const kmSetting = () => { let n = 15; try { n = Number(localStorage.getItem('genealogie-listes-famille-km') || 15); } catch (_) {} return Number.isFinite(n) && n > 0 ? Math.min(500, n) : 15; };

    /* ═════════ les données, une fois (gardées 10 minutes) ═════════ */
    let F = null, loading = null, at = 0;
    function ready() {
        if (F && Date.now() - at < 600000) return Promise.resolve(F);
        if (loading) return loading;
        loading = Promise.resolve(A().api ? A().api('ld_famille') : {places: [], people: []}).then(r => { F = build(r || {}); at = Date.now(); return F; })
            .catch(() => { F = build({}); at = Date.now(); return F; }).finally(() => { loading = null; });
        return loading;
    }
    /** {places: [[lat, lon, nom]], people: [[nom, naissance, décès, [[lieu, année]]]]} → cases d'un degré, et pour chaque lieu : qui, quand */
    function build(r) {
        const places = (r.places || []).map(([lat, lon, name]) => ({lat: Number(lat), lon: Number(lon), name: String(name || '')}));
        const people = (r.people || []).map(([n, b, d, pl]) => ({n: String(n), b: b == null ? null : Number(b), d: d == null ? null : Number(d), pl: pl || []}));
        const at = places.map(() => []), grid = new Map();
        people.forEach((p, i) => p.pl.forEach(([pl, y]) => { if (at[pl]) at[pl].push([i, y == null ? null : Number(y)]); }));
        places.forEach((p, i) => { const k = `${Math.floor(p.lat)}:${Math.floor(p.lon)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
        return {places, people, at, grid};
    }
    /** les lieux de la famille à moins de max km : [[index, km]] */
    function placesNear(lat, lon, max) {
        if (!F || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        const dl = Math.ceil(max / 111) + 0, dn = Math.ceil(max / (111 * Math.max(0.05, Math.cos(lat * R)))), la = Math.floor(lat), lo = Math.floor(lon), out = [];
        for (let i = la - dl; i <= la + dl; i++) for (let j = lo - dn; j <= lo + dn; j++) {
            const c = F.grid.get(`${i}:${j}`); if (!c) continue;
            for (const pi of c) { const p = F.places[pi], k = km(lat, lon, p.lat, p.lon); if (k <= max) out.push([pi, k]); }
        }
        return out.sort((a, b) => a[1] - b[1]);
    }
    /** la distance au lieu de la famille le plus proche (Infinity : aucun à moins de max km) */
    const nearKm = (lat, lon, max = 500) => { const n = placesNear(Number(lat), Number(lon), max); return n.length ? n[0][1] : Infinity; };
    /** qui vivait près d'ici cette année-là : [{n, age, km, place, born}] (les plus proches d'abord) */
    function presence(lat, lon, year, max) {
        const y = Number(year); if (!F || !Number.isFinite(y)) return {who: [], before: false, near: false};
        const near = placesNear(Number(lat), Number(lon), max), seen = new Set(), who = []; let firstBirth = Infinity, any = false;
        for (const [pi, k] of near) {
            for (const [ix, ey] of F.at[pi]) {
                const p = F.people[ix]; any = true;
                if (p.b != null && p.b < firstBirth) firstBirth = p.b;
                if (seen.has(ix)) continue;
                const b = p.b, d = p.d;
                const alive = (b == null || b <= y) && (d != null ? y <= d : b != null ? y - b <= 100 : true);
                const then = ey == null || Math.abs(ey - y) <= 50;
                if (!alive || !then || (b == null && d == null && ey == null)) continue;
                seen.add(ix); who.push({n: p.n, age: b != null ? y - b : null, km: k, place: F.places[pi].name, born: b === y});
            }
        }
        return {who, near: any, before: any && !who.length && Number.isFinite(firstBirth) && y < firstBirth};
    }
    const textOf = pr => {
        if (!pr.who.length) return pr.before ? T('avant la famille') : '';
        const w = pr.who[0], one = w.born ? T('{name} naît cette année-là', {name: w.n}) : w.age != null ? T('{name}, {age} ans', {name: w.n, age: w.age}) : w.n;
        return pr.who.length > 1 ? `${one} ${T('+{n}', {n: pr.who.length - 1})}` : one;
    };
    const yearOf = (d, row) => { try { const p = d.period?.(row); const y = Array.isArray(p) ? Number(p[0]) : NaN; return Number.isFinite(y) ? y : null; } catch (_) { return null; } };
    const geoOf = (d, row) => { try { const g = d.geo?.(row); return g && Number.isFinite(Number(g[0])) && Number.isFinite(Number(g[1])) ? [Number(g[0]), Number(g[1])] : null; } catch (_) { return null; } };
    const kmOf = d => Number(d?.familyKm) > 0 ? Number(d.familyKm) : kmSetting();
    /** la colonne « Dans la famille » d'une page (≤ 100 lignes) */
    async function fill(res, rows, d) {
        await ready(); if (!res.isConnected) return;
        const max = kmOf(d);
        res.querySelectorAll('td[data-ld-fam]').forEach(td => {
            const r = rows[Number(td.dataset.ldFam)], g = r && geoOf(d, r), y = r && yearOf(d, r); if (!g || y == null) return;
            const pr = presence(g[0], g[1], y, max), t = textOf(pr); if (!t) return;
            td.innerHTML = pr.who.length ? `<span class="ldf-who"${pr.who.length > 1 ? ` title="${esc(pr.who.slice(0, 12).map(w => w.age != null ? T('{name}, {age} ans', {name: w.n, age: w.age}) : w.n).join(' · '))}"` : ''}>${esc(t)}</span>` : `<span class="muted">${esc(t)}</span>`;
        });
    }
    /** une pastille toute faite : « 👪 Seulement près de la famille » (rayon : o.km, sinon le réglage) */
    const chip = (o = {}) => ({id: o.id || 'famille', icon: '👪', label: o.label || 'Seulement près de la famille', on: !!o.on, prepare: ready,
        test: (row, {geo} = {}) => !!geo && nearKm(geo[0], geo[1], Number(o.km) > 0 ? Number(o.km) : kmSetting()) <= (Number(o.km) > 0 ? Number(o.km) : kmSetting())});

    /* 🧩 le critère « Près des lieux de la famille » pour toute liste placée */
    (ext.dataListFilters = ext.dataListFilters || []).push({id: 'famille', icon: '👪', label: 'Près des lieux de la famille', needs: 'geo',
        options: async () => { await ready(); const n = F.places.length, mine = kmSetting(); return [...new Set([5, mine, 15, 50, 150].sort((a, b) => a - b))].map(k => ({value: String(k), label: T('à {km} km ({n} lieux placés)', {km: k, n})})); },
        prepare: ready, test: ([lat, lon], v) => nearKm(lat, lon, Number(v) || 15) <= (Number(v) || 15)});

    ext.listesFamille = {ready, nearKm, presence, fill, chip, km: kmSetting, text: textOf, placesCount: () => F?.places.length || 0, reset: () => { F = null; }};
})();
