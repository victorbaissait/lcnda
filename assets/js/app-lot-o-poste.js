/* LCNDA — 🐴 La poste aux chevaux, 1632-1833 (lot O3 ; idées 12 et 13 de docs/donnees-idees-lot-o.md).
 * Données : assets/data/lo-poste.json.gz, fabriqué par scripts/lot-o/build-poste.py depuis Zenodo 11196161
 * (N. Verdier, T. Giraud, C. Mimeur, A. Bretagnolle, 2024 ; ODbL 1.0, licence relue à chaque fabrication) : les relais et les routes
 * de poste à 7 dates (1632, 1708, 1733, 1758, 1783, 1810, 1833), avec le temps à cheval entre deux relais.
 * Tout est calculé ici : le plus court chemin (Dijkstra) depuis Paris sur le vrai réseau de l'année, jamais à vol d'oiseau.
 *  - la fiche : UNE phrase dans « 🌍 Le monde autour » (« En 1810, le relais le plus proche de Seilhac… Paris à 55 h de poste ») ;
 *  - la fiche d'un village : « 🐴 La poste aux chevaux » (le relais le plus proche et Paris, à chaque date) ;
 *  - les cartes : deux calques (routes de l'année, relais) ; Listes → 🧰 Données → 🚂 Routes : « 🐴 Relais de poste (1632-1833) ».
 * Rien ne sort de l'ordinateur ; le seul lien ↗ est la source. Essai : tests/test-lot-o-vie.js */
(() => {
    'use strict';
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const C = () => ext.lotOCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const PARIS = 409, ZEN = 'https://zenodo.org/records/11196161';
    const srcLink = () => (UI().extLink ? UI().extLink(ZEN, 'Zenodo') : `<a href="${ZEN}" target="_blank" rel="noopener noreferrer">↗ Zenodo</a>`);
    const SOURCE = 'Verdier, Giraud, Mimeur, Bretagnolle (2024), Zenodo — ODbL 1.0';

    let pack = null;
    async function readGz(url) {
        const r = await fetch(url, {credentials: 'same-origin'}); if (!r.ok) throw new Error(T('Fichier introuvable : {f}', {f: url.split('?')[0]}));
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const load = () => (pack ||= readGz('assets/data/lo-poste.json.gz?v=1').catch(e => { pack = null; throw e; }));
    const TIMES = new Map();
    const timesOf = async y => { const P = await load(); if (!TIMES.has(y)) TIMES.set(y, C().posteTimes(P.roads[String(y)] || [], PARIS)); return TIMES.get(y); };
    /** travel(lat, lon, année) → {year, relay, km, minutes} ou null (avant 1632, après 1850, sans position) */
    async function travel(lat, lon, year) {
        if (lat == null || lon == null || !Number.isFinite(Number(lat))) return null;
        const P = await load(), y = C().posteYear(P.years, Number(year)); if (!y) return null;
        const t = await timesOf(y), n = C().nearestRelay(P.relays, t, Number(lat), Number(lon)); if (!n) return null;
        return {year: y, relay: P.relays[n.id][2], km: n.km, minutes: n.minutes, paris: n.id === PARIS};
    }
    const hours = m => (m < 60 ? T('{n} min', {n: Math.round(m)}) : T('{n} h', {n: nf(Math.round(m / 30) / 2, 1)}));
    function sentence(r, place) {
        if (r.paris || r.minutes < 1) return T('En {y}, {p} était sur la poste de Paris.', {y: r.year, p: place || T('ce lieu')});
        return T('En {y}, le relais de poste le plus proche de {p} était {r} ({k} km) ; de là, Paris était à {h} de cheval de poste, en changeant de chevaux à chaque relais (sans les nuits ni les arrêts).',
            {y: r.year, p: place || T('ce lieu'), r: r.relay, k: nf(r.km < 1 ? 0 : r.km, 0), h: hours(r.minutes)});
    }

    /* ═════ la fiche : une phrase dans « 🌍 Le monde autour » ═════ */
    async function decoratePerson() {
        const page = document.querySelector('#workspace .person-page'); if (!page) return;
        const wh = page.querySelector('[data-world-host]'), wl = wh?.querySelector('.h-world-lead'); if (!wl || wh.querySelector('[data-lop-line]')) return;
        const L = await ext.lotOVie?.life?.(Number(wh.dataset.worldHost)); if (!L?.ok || !wh.isConnected || wh.querySelector('[data-lop-line]')) return;
        const by = Number(String(L.birth || '').slice(0, 4)); if (!by) return;
        if (by > 1850) return; // après 1850, le train : pas de phrase
        const y = Math.max(1632, Math.min(by + 20, 1850, Number(String(L.death || '').slice(0, 4)) || 9999)); // à ses 20 ans (au plus tard 1850, ou à sa mort si avant)
        const r = await travel(L.bplace?.lat, L.bplace?.lon, y).catch(() => null); if (!r || !wh.isConnected || wh.querySelector('[data-lop-line]')) return;
        (wh.querySelector('[data-lov-line]') || wl).insertAdjacentHTML('afterend', `<p class="h-world-phrase lo-line" data-lop-line="poste">🐴 ${esc(sentence(r, L.bplace?.name))} ${srcLink()}</p>`);
    }
    /* ═════ la fiche d'un village : la poste à chaque date ═════ */
    async function decorateVillage() {
        const v = document.querySelector('#workspace .h-village:not([data-lop])'); if (!v) return;
        v.dataset.lop = '1';
        const pli = v.querySelector('[data-pli-host]'), lat = pli?.dataset.pliLat, lon = pli?.dataset.pliLon, name = pli?.dataset.pliName || '';
        if (lat == null || lon == null || lat === '') return;
        const P = await load().catch(() => null); if (!P) return;
        const rows = [];
        for (const y of P.years) { const r = await travel(lat, lon, y); if (r) rows.push(r); }
        if (!rows.length || !v.isConnected) return;
        const last = rows[rows.length - 1];
        const html = `<section class="maintenance-panel cplus-panel lo-poste" data-lop-panel><h3>🐴 ${esc(T('La poste aux chevaux'))}</h3><p class="cplus-lead">${esc(sentence(last, name))}</p>
            <details class="cplus-more"><summary>${esc(T('▸ plus ({n} dates)', {n: rows.length}))}</summary><div class="tw"><table class="data-table lo-table" data-cols-off><thead><tr><th>${esc(T('Année'))}</th><th>${esc(T('Relais le plus proche'))}</th><th>${esc(T('Paris'))}</th></tr></thead>
            <tbody>${rows.map(r => `<tr><td>${esc(r.year)}</td><td>${esc(r.relay)} <small class="muted">${esc(nf(r.km, 0))} km</small></td><td>${esc(r.paris ? '—' : hours(r.minutes))}</td></tr>`).join('')}</tbody></table></div></details>
            <p class="cplus-src">${esc(T('Source :'))} ${esc(SOURCE)} ${srcLink()}</p></section>`;
        const anchor = v.querySelector('[data-l10r-host]') || v.querySelector('[data-l9-host]') || v.querySelector('.h-village-grid');
        if (anchor) anchor.insertAdjacentHTML('afterend', html); else v.insertAdjacentHTML('beforeend', html);
    }
    let pending = 0;
    function schedule() { if (pending) return; pending = setTimeout(() => { pending = 0; decoratePerson().catch(() => {}); decorateVillage().catch(() => {}); }, 160); }
    new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════ les cartes : deux calques ═════ */
    const yearFor = (P, y) => C().posteYear(P.years, Number(y) || 1810) || (Number(y) > 1850 ? 1833 : P.years[0]);
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        {id: 'lo_poste_routes', icon: '🐴', label: T('Routes de la poste aux chevaux (1632-1833)'), group: 'Le monde', kind: 'lines', needsYear: true, source: SOURCE,
            run: async ({year, bbox, max = 4000}) => {
                const P = await load(), y = yearFor(P, year), f = P.roads[String(y)] || [], R = P.relays, features = [];
                const inBox = r => !bbox || (r[1] >= bbox[0] && r[0] >= bbox[1] && r[1] <= bbox[2] && r[0] <= bbox[3]);
                for (let i = 0; i + 2 < f.length && features.length < max; i += 3) { const a = R[f[i]], b = R[f[i + 1]]; if (a && b && (inBox(a) || inBox(b))) features.push({type: 'line', pts: [[a[1], a[0]], [b[1], b[0]]], label: `${a[2]} → ${b[2]} · ${hours(f[i + 2])}`}); }
                return {features, source: `${T('Routes de poste en {y}', {y})} · ${SOURCE}`};
            }},
        {id: 'lo_poste_relais', icon: '🐴', label: T('Relais de poste (1632-1833)'), group: 'Le monde', kind: 'points', needsYear: true, source: SOURCE,
            run: async ({year, bbox, max = 4000, q}) => {
                const P = await load(), y = yearFor(P, year), t = await timesOf(y), features = [];
                for (const [id, m] of t) { const r = P.relays[id]; if (!r || features.length >= max) continue; if (bbox && !(r[1] >= bbox[0] && r[0] >= bbox[1] && r[1] <= bbox[2] && r[0] <= bbox[3])) continue; if (q && !String(r[2]).toLowerCase().includes(String(q).toLowerCase())) continue;
                    features.push({type: 'pt', lat: r[0], lon: r[1], label: `${r[2]} · ${T('Paris à {h}', {h: hours(m)})}`}); }
                return {features, source: `${T('Relais de poste en {y}', {y})} · ${SOURCE}`};
            }});

    /* ═════ Listes → 🧰 Données : les relais ═════ */
    (ext.dataLists = ext.dataLists || []).push({id: 'lo_relais', icon: '🐴', label: 'Relais de poste (1632-1833)', group: 'Le monde', theme: 'routes', source: SOURCE, sourceUrl: ZEN,
        load: async () => {
            const P = await load(), t1810 = await timesOf(1810), seen = new Map();
            for (const y of P.years) { const f = P.roads[String(y)] || []; for (let i = 0; i < f.length; i += 3) { for (const id of [f[i], f[i + 1]]) { if (!seen.has(id)) seen.set(id, new Set()); seen.get(id).add(y); } } }
            return [...seen].map(([id, ys]) => { const r = P.relays[id]; if (!r) return null; const yy = [...ys].sort((a, b) => a - b); const m = t1810.get(id);
                return {name: r[2], insee: r[3], years: yy.join(', '), from: yy[0], to: yy[yy.length - 1], paris1810: m != null ? Math.round(m / 6) / 10 : null, lat: r[0], lon: r[1]}; }).filter(Boolean);
        },
        fields: [{key: 'name', label: 'Relais', type: 'text'}, {key: 'insee', label: 'Code INSEE', type: 'text'}, {key: 'years', label: 'Années', type: 'text'}, {key: 'paris1810', label: 'Paris en 1810 (h)', type: 'number'}],
        period: r => [r.from, r.to], geo: r => [r.lat, r.lon], defaultSort: ['name', 'asc']});

    ext.lotOPoste = {load, travel, sentence, timesOf};
})();
