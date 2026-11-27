/* LCNDA — Lot O, suite : 📖 textes rédigés (O5), ⛏ catastrophes minières et 🏰 fortifications de Vauban (O6, Wikidata CC0),
 * 📚 livres anciens du domaine public (O7, Internet Archive, licence de chaque volume relue), 📡 télégraphe Chappe et ⛴ bacs (O8,
 * OpenStreetMap ODbL, fabriqués sur GitHub : .github/workflows/telech-o.yml). Fichiers : assets/data/lo-*.json.gz (scripts/lot-o/*).
 * Un pack absent (pas encore fabriqué) ne montre rien : ni liste, ni calque, ni phrase.
 *  - la fiche : UNE phrase dans « 🌍 Le monde autour » (le texte qui touche son métier ou ses lieux pendant sa vie ; la catastrophe
 *    minière près de lui s'il était mineur ; la place forte de Vauban la plus proche s'il était soldat). Jamais d'exécution
 *    rapprochée d'une personne (tact) ; rien pour une personne vivante (lot_o_life ne rend rien).
 *  - la fiche d'un village : « 🏰 Autour, dans l'histoire » (Vauban ⭐, mines, télégraphe Chappe, bacs, livre ancien du département).
 *  - les cartes (LCNDA_EXT.mapLayerSources) et Listes → 🧰 Données (LCNDA_EXT.dataLists), chacun dans son thème.
 * Tout est lu sur l'ordinateur ; seuls les liens ↗ ouvrent une page, sur un clic. Essai : tests/test-lot-o-packs.js */
(() => {
    'use strict';
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const UI = () => window.LCNDA_UI || {};
    const C = () => ext.lotOCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: 0});
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const link = (url, label) => (url && /^https:\/\//.test(url) ? (UI().extLink ? UI().extLink(url, label) : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(label)}</a>`) : '');
    const wd = q => (q ? `https://www.wikidata.org/wiki/${encodeURIComponent(q)}` : '');

    /* ═════ les packs (lus une fois, à la demande ; absents → null) ═════ */
    const P = {};
    async function readGz(url) {
        const r = await fetch(url, {credentials: 'same-origin'}); if (!r.ok) return null;
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const table = d => (d?.rows || []).map(r => Object.fromEntries((d.fields || []).map((k, i) => [k, r[i] ?? null])));
    // seulement les packs que le sommaire des données connaît (assets/data/manifest.json) : un pack pas encore fabriqué n'est jamais demandé (pas de 404)
    let shipped = null;
    const packIds = () => (shipped ||= fetch('assets/data/manifest.json?v=1', {credentials: 'same-origin'}).then(r => (r.ok ? r.json() : {packs: {}})).catch(() => ({packs: {}})).then(m => new Set(Object.keys(m?.packs || {}))));
    const pack = name => (P[name] ||= packIds().then(ids => (ids.has(`lo-${name}`) ? readGz(`assets/data/lo-${name}.json.gz?v=1`) : null)).then(d => (d ? {...d, list: table(d)} : null)).catch(() => null));
    const near = (list, lat, lon, km) => (list || []).map(r => ({...r, km: C().km(lat, lon, r.lat, r.lon)})).filter(r => Number.isFinite(r.km) && r.km <= km).sort((a, b) => a.km - b.km);

    /* ═════ 📖 le texte qui touche une vie ═════ */
    function textFor(texts, L) {
        const by = Number(String(L.birth || '').slice(0, 4)), dy = Number(String(L.death || '').slice(0, 4)) || by + 80; if (!by) return null;
        const jobs = (L.jobs || []).map(fold), places = [L.bplace?.name, L.dplace?.name, ...(L.events || []).map(e => e.place)].filter(Boolean).map(fold);
        const live = t => t.from <= dy && t.to >= by;
        const cand = texts.filter(t => t.id !== 'executions' && live(t)); // jamais une exécution rapprochée d'une personne
        return cand.find(t => (t.jobs || []).some(j => jobs.some(x => x.includes(fold(j))))) || cand.find(t => (t.places || []).some(p => places.some(x => x && x.includes(fold(p))))) || null;
    }
    const firstSentence = s => { const m = String(s).match(/^.+?[.!?](\s|$)/); return m ? m[0].trim() : String(s); };

    /* ═════ la fiche : une phrase dans 🌍 ═════ */
    async function decoratePerson() {
        const page = document.querySelector('#workspace .person-page'); if (!page) return;
        const wh = page.querySelector('[data-world-host]'), wl = wh?.querySelector('.h-world-lead'); if (!wl || wh.querySelector('[data-lopk-line]')) return;
        const L = await ext.lotOVie?.life?.(Number(wh.dataset.worldHost)); if (!L?.ok || !wh.isConnected || wh.querySelector('[data-lopk-line]')) return;
        const by = Number(String(L.birth || '').slice(0, 4)), dy = Number(String(L.death || '').slice(0, 4)) || by + 80, lines = [];
        const jobs = (L.jobs || []).map(fold).join(' '), home = L.bplace;
        if (/\b(mineur|houilleur|porion|galibot|herscheur|abatteur)\b/.test(jobs) && home?.lat != null) {
            const M = await pack('mines'); const hit = M && near(M.list.filter(r => r.year >= by + 12 && r.year <= dy), home.lat, home.lon, 25)[0];
            if (hit) lines.push(`⛏ ${esc(T('En {y}, la catastrophe minière « {n} » a eu lieu à {k} km de {p}{d}.', {y: hit.year, n: hit.name, k: nf(hit.km), p: home.name, d: hit.dead ? ` (${T('{n} morts', {n: hit.dead})})` : ''}))} ${link(hit.wp || wd(hit.q), hit.wp ? 'Wikipédia' : 'Wikidata')}`);
        }
        if (L.military && home?.lat != null) {
            const V = await pack('vauban'); const hit = V && near(V.list, home.lat, home.lon, 60)[0];
            if (hit) lines.push(`🏰 ${esc(T('{n}, fortification de Vauban{u}, était la place forte la plus proche de {p} ({k} km).', {n: hit.name, u: String(hit.how).includes('unesco') ? ` (${T('patrimoine mondial')})` : '', p: home.name, k: nf(hit.km)}))} ${link(hit.wp || wd(hit.q), hit.wp ? 'Wikipédia' : 'Wikidata')}`);
        }
        if (!lines.length) {
            const X = await pack('textes'); const t = X && textFor(X.list, L);
            if (t) lines.push(`${esc(t.icon)} <b>${esc(T(t.title))}</b> — ${esc(firstSentence(t.text))} <details class="lo-more"><summary>${esc(T('▸ plus'))}</summary><p>${esc(t.text)}</p></details> ${link(t.url, 'Wikipédia')}`);
        }
        if (!lines.length || !wh.isConnected || wh.querySelector('[data-lopk-line]')) return;
        const after = wh.querySelector('[data-lop-line]') || wh.querySelector('[data-lov-line]') || wl;
        after.insertAdjacentHTML('afterend', `<div class="h-world-phrase lo-line" data-lopk-line="pack">${lines[0]}</div>`); // un <div> : le « ▸ plus » (<details>) ne peut pas être dans un <p>
    }

    /* ═════ la fiche d'un village ═════ */
    async function decorateVillage() {
        const v = document.querySelector('#workspace .h-village:not([data-lopk])'); if (!v) return;
        v.dataset.lopk = '1';
        const pli = v.querySelector('[data-pli-host]'), lat = Number(pli?.dataset.pliLat), lon = Number(pli?.dataset.pliLon), name = pli?.dataset.pliName || '';
        if (!pli || pli.dataset.pliLat == null || pli.dataset.pliLat === '' || !Number.isFinite(lat)) return;
        const head = v.querySelector('.page-header p, header p')?.textContent || '', insee = (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || v.querySelector('[data-cad-insee]')?.dataset.cadInsee || pli.dataset.pliInsee || '';
        const dep = insee ? (/^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2)) : '';
        const [V, M, CH, B, LV] = await Promise.all(['vauban', 'mines', 'chappe', 'bacs', 'livres'].map(pack));
        const out = [];
        const vb = V && near(V.list, lat, lon, 30)[0];
        if (vb) out.push(`${String(vb.how).includes('unesco') ? '⭐' : '🏰'} ${esc(T('{n} ({c}), fortification de Vauban{u}, à {k} km.', {n: vb.name, c: vb.commune || '—', u: String(vb.how).includes('unesco') ? ` — ${T('patrimoine mondial')}` : '', k: nf(vb.km)}))}${vb.role ? ` <small class="muted">${esc(T('Wikidata : « {r} »', {r: vb.role}))}</small>` : ''} ${link(vb.wp || wd(vb.q), vb.wp ? 'Wikipédia' : 'Wikidata')}`);
        const mn = M && near(M.list, lat, lon, 15);
        if (mn?.length) out.push(`⛏ ${esc(T('{n} catastrophe(s) minière(s) à moins de 15 km : {l}.', {n: mn.length, l: mn.slice(0, 3).map(x => `${x.name} (${x.year})`).join(' ; ')}))} ${link(mn[0].wp || wd(mn[0].q), mn[0].wp ? 'Wikipédia' : 'Wikidata')}`);
        const ch = CH && near(CH.list, lat, lon, 20)[0];
        if (ch) out.push(`📡 ${esc(T('Une station du télégraphe Chappe à {k} km : {n}.', {k: nf(ch.km), n: ch.name}))} ${link(`https://www.openstreetmap.org/${{n: 'node', w: 'way', r: 'relation'}[ch.id[0]]}/${ch.id.slice(1)}`, 'OpenStreetMap')}`);
        const bc = B && near(B.list, lat, lon, 5)[0];
        if (bc) out.push(`⛴ ${esc(T(bc.kind === 'ancien' ? 'Un ancien bac à {k} km : {n}{r}.' : 'Un bac traverse {r0} à {k} km : {n}.', {k: nf(bc.km), n: bc.name, r: bc.river ? ` (${bc.river})` : '', r0: bc.river || T('la rivière')}))} ${link(`https://www.openstreetmap.org/${{n: 'node', w: 'way', r: 'relation'}[bc.id[0]]}/${bc.id.slice(1)}`, 'OpenStreetMap')}`);
        const lv = LV && dep && LV.list.filter(x => x.dep === dep);
        if (lv?.length) out.push(`📚 ${esc(T('Un livre ancien sur son département : {t} ({y}).', {t: lv[0].title, y: lv[0].year || '?'}))} ${link(lv[0].url, 'Internet Archive')} <small class="muted">${esc(T('domaine public, notice du volume relue'))}</small>`);
        if (!out.length || !v.isConnected) return;
        const html = `<section class="maintenance-panel cplus-panel lo-autour" data-lopk-panel><h3>🏰 ${esc(T('Autour, dans l’histoire'))}</h3>${out.map(h => `<p class="cplus-lead">${h}</p>`).join('')}
            <p class="cplus-src">${esc(T('Sources : Wikidata (CC0), OpenStreetMap (ODbL, © les contributeurs), Internet Archive (domaine public).'))} ${esc(name)}</p></section>`;
        const anchor = v.querySelector('[data-lop-panel]') || v.querySelector('[data-l10r-host]') || v.querySelector('.h-village-grid');
        if (anchor) anchor.insertAdjacentHTML('afterend', html); else v.insertAdjacentHTML('beforeend', html);
    }
    let pending = 0;
    function schedule() { if (pending) return; pending = setTimeout(() => { pending = 0; decoratePerson().catch(() => {}); decorateVillage().catch(() => {}); }, 180); }
    new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════ cartes et Listes : seulement pour les packs présents ═════ */
    const LISTS = [
        {name: 'textes', id: 'lo_textes', icon: '📖', label: 'Textes d’histoire', theme: 'evenements', fields: [{key: 'title', label: 'Sujet', type: 'text'}, {key: 'from', label: 'De', type: 'year'}, {key: 'to', label: 'À', type: 'year'}, {key: 'text', label: 'Texte', type: 'text'}, {key: 'url', label: 'Source', type: 'url'}], period: r => [r.from, r.to]},
        {name: 'mines', id: 'lo_mines', icon: '⛏', label: 'Catastrophes minières en France', theme: 'metiers', fields: [{key: 'name', label: 'Catastrophe', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'place', label: 'Lieu', type: 'place'}, {key: 'dead', label: 'Morts', type: 'number'}, {key: 'wp', label: 'Wikipédia', type: 'url'}], period: r => [r.year, null], geo: r => [r.lat, r.lon]},
        {name: 'vauban', id: 'lo_vauban', icon: '🏰', label: 'Fortifications de Vauban (au complet)', theme: 'guerres', fields: [{key: 'name', label: 'Site', type: 'text'}, {key: 'commune', label: 'Commune', type: 'place'}, {key: 'year', label: 'Construit', type: 'year'}, {key: 'unesco', label: 'Patrimoine mondial', type: 'bool'}, {key: 'role', label: 'Ce que dit Wikidata', type: 'text'}, {key: 'wp', label: 'Wikipédia', type: 'url'}], geo: r => [r.lat, r.lon], map: row => ({...row, unesco: String(row.how).includes('unesco')})},
        {name: 'chappe', id: 'lo_chappe', icon: '📡', label: 'Télégraphe Chappe (stations)', theme: 'routes', fields: [{key: 'name', label: 'Station', type: 'text'}, {key: 'city', label: 'Commune', type: 'place'}], geo: r => [r.lat, r.lon]},
        {name: 'bacs', id: 'lo_bacs', icon: '⛴', label: 'Bacs et passeurs', theme: 'eaux', fields: [{key: 'name', label: 'Bac', type: 'text'}, {key: 'river', label: 'Rivière', type: 'text'}, {key: 'kind', label: 'Sorte', type: 'enum'}], geo: r => [r.lat, r.lon]},
        {name: 'livres', id: 'lo_livres', icon: '📚', label: 'Livres anciens du domaine public (départements)', theme: 'livres', fields: [{key: 'title', label: 'Titre', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'dep', label: 'Département', type: 'text'}, {key: 'url', label: 'Internet Archive', type: 'url'}], period: r => [r.year, null]}];
    async function register() {
        for (const L of LISTS) {
            const d = await pack(L.name); if (!d?.list?.length) continue;
            (ext.dataLists = ext.dataLists || []).push({id: L.id, icon: L.icon, label: L.label, group: 'Le monde', theme: L.theme, source: `${d.source || ''} — ${d.licence || ''}`, sourceUrl: d.url || '',
                load: async () => (await pack(L.name)).list.map(r => (L.map ? L.map(r) : r)), fields: L.fields, ...(L.period ? {period: L.period} : {}), ...(L.geo ? {geo: L.geo} : {})});
            if (L.geo) (ext.mapLayerSources = ext.mapLayerSources || []).push({id: L.id, icon: L.icon, label: T(L.label), group: 'Le monde', kind: 'points', source: `${d.source || ''} (${d.licence || ''})`,
                run: async ({bbox, max = 4000, q}) => {
                    const rows = (await pack(L.name)).list.filter(r => r.lat != null && (!bbox || (r.lon >= bbox[0] && r.lat >= bbox[1] && r.lon <= bbox[2] && r.lat <= bbox[3])) && (!q || fold(r.name).includes(fold(q))));
                    return {features: rows.slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: `${L.name === 'vauban' && String(r.how).includes('unesco') ? '⭐ ' : ''}${r.name}${r.year ? ` (${r.year})` : ''}`})), source: `${d.source || ''} (${d.licence || ''})`};
                }});
        }
    }
    register().catch(() => {});

    ext.lotOPacks = {pack, textFor, near, register};
})();
