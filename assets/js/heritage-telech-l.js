/**
 * LCNDA — 🌐 Les équivalents d'ailleurs (lot L « téléchargements ») : ce que l'app avait pour la France, pour les autres pays.
 * Livré avec l'app (assets/data/tl-*.json.gz, refaits par scripts/telech-l/*.py et .github/workflows/telech-l.yml) :
 *   🌊 tl-crues       les grandes crues d'Europe depuis 1870 (HANZE, Zenodo, CC BY 4.0) → rejoignent « 🌊 Crues réunies »
 *   🗳 tl-elus        les membres du Congrès des États-Unis nés il y a plus de 110 ans (bioguide, CC0)
 *   💵 tl-prix        l'indice des prix des États-Unis depuis 1913 (BLS CPI-U, domaine public)
 *   📏 tl-mesures     des unités de mesure anciennes ou locales du monde, avec leur valeur (Wikidata, CC0)
 *   🎖 tl-memoriaux   les monuments aux morts du monde hors de France (Wikidata, CC0) → rejoignent « 🏛 Monuments réunis »
 *   ✝️ tl-cimetieres  les cimetières du monde hors de France (Wikidata, CC0)
 *   🏚 tl-villages    les villages désertés (Wüstungen, villages médiévaux désertés d'Angleterre…) (Wikidata, CC0)
 *   fabriqués seulement sur GitHub (sites injoignables ici ; le script relit la licence et s'arrête si elle n'est plus ouverte) :
 *   ⛏ tl-mines (USGS MRDS, domaine public), 🗺 tl-lieux_gb (OS Open Names, OGL), ⛓ tl-bagnards (State Library of Queensland, CC BY) ;
 *   et les prénoms des États-Unis depuis 1880 (SSA, domaine public) ajoutés au pack « Prénoms d'ici et d'ailleurs » (pp_prenoms).
 * Tout le reste (recensements transcrits, registres indexés, émigration, London Gazette, paroisses, annuaires, cartes et photos
 *   anciennes, géologie…) : en lien seulement, avec la raison (Réglages → 🌐 Les équivalents d'ailleurs).
 * Rien ne part sur Internet : tout est lu sur l'ordinateur, seulement pour une personne décédée (ou née il y a plus de 110 ans) et non
 *   confidentielle ; aucun nom de l'arbre n'est envoyé. Les liens « ↗ » s'ouvrent sur un clic ; en consultation (kiosque) et pour un
 *   invité du réseau local, les liens « en lien seulement » n'existent pas. Aucune tuile, aucune image n'est chargée par ce lot.
 * localStorage : « genealogie-telech-l » (sujets, km = rayon autour de ses lieux, kmc = rayon des crues).
 *   window.LCNDA_EXT.telechL = {core…, load, personInto, placeInto, placePart, settings, openSettings}
 * Essai : tests/test-telech-l.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    const NOW = new Date().getFullYear();
    const DEATH = ['DEAT', 'BURI', 'CREM'];
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => DEATH.includes(String(e.tag || '').toUpperCase()));
    /** une vie du passé : décédée ou née il y a plus de 110 ans */
    const past = life => isDead(life) || (num(life?.person?.birth) !== null && life.person.birth < NOW - 110);
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? Math.min(b + 85, NOW) : ys.length ? Math.max(...ys) : null)};
    }
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase(), country: e.country || ''}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    /** une adresse venue d'un fichier : seulement http(s), sinon rien */
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const isQ = q => /^Q\d+$/.test(String(q || ''));
    const wd = q => (isQ(q) ? `https://www.wikidata.org/wiki/${q}` : '');
    const isFrance = e => /^(france|fr)?$/i.test(String(e?.country || '').trim());

    /* ── 🌊 crues (HANZE) ── */
    function floodRows(f) {
        return table(f).map(r => ({id: r.id, date: r.d, end: r.d2, year: num(String(r.d || '').slice(0, 4)), lat: r.lat, lon: r.lon, region: r.reg, country: (f.countries || [])[r.cy] || '', kind: (f.kinds || [])[r.k] || '',
            river: r.riv || '', dead: r.dead, people: r.ppl, cause: r.cause || '', refs: r.src || ''}));
    }
    /** les crues de sa vie près de ses lieux (une par crue, le lieu le plus proche) */
    function floodsNear(rows, life, radius) {
        const s = lifeSpan(life), out = new Map();
        for (const e of placedEvents(life)) for (const x of near(rows, e.lat, e.lon, radius, 400)) {
            if (s.from !== null && x.r.year < s.from) continue; if (s.to !== null && x.r.year > s.to) continue;
            const cur = out.get(x.r.id); if (!cur || x.km < cur.km) out.set(x.r.id, {...x, place: e.name});
        }
        return [...out.values()].sort((a, b) => (b.r.dead ?? 0) - (a.r.dead ?? 0) || a.km - b.km);
    }
    const ZENODO = 'https://doi.org/10.5281/zenodo.23670886';

    /* ── 🗳 Congrès des États-Unis ── */
    const BIO = /^[A-Z]\d{6}$/;
    const bioUrl = id => (BIO.test(String(id || '')) ? `https://bioguide.congress.gov/search/bio/${id}` : '');
    function eluRows(f) {
        return table(f).map(r => ({name: r.n, born: r.b, year: num(String(r.b || '').slice(0, 4)), state: (f.states || [])[r.st] || '', chamber: r.ch, from: r.y1, to: r.y2, party: (f.parties || [])[r.pa] || '', bio: r.bio, q: r.q, g: r.g}));
    }
    /** un homonyme au Congrès : même prénom, même nom, née la même année (± 1) — une piste, jamais une preuve */
    function eluHomonyms(rows, first, last, birth) {
        const f = fold(String(first || '').split(/[\s,-]+/)[0]), l = fold(last); if (f.length < 2 || l.length < 2 || birth === null) return [];
        return rows.filter(r => r.year !== null && Math.abs(r.year - birth) <= 1 && fold(r.name).split(' ')[0] === f && (fold(r.name).endsWith(' ' + l) || fold(r.name).replace(/ (jr|sr|ii|iii)$/, '').endsWith(' ' + l)));
    }

    /* ── 💵 prix des États-Unis ── */
    const cpiRows = f => table(f).map(r => ({year: r.y, cpi: r.cpi}));
    /** combien valent `amount` dollars de `from` en dollars de `to` (CPI-U) : null hors des années connues */
    function dollarWorth(rows, amount, from, to) {
        const a = rows.find(r => r.year === from), b = rows.find(r => r.year === to); const x = num(amount);
        return a && b && x !== null && a.cpi > 0 ? Math.round(x * b.cpi / a.cpi * 100) / 100 : null;
    }

    /* ── 🎖 ✝️ 🏚 lieux (Wikidata) ── */
    function placeRows(f, kind) {
        return table(f).map(r => ({q: r.q, n: r.n, lat: r.lat, lon: r.lon, cy: (f.countries || [])[r.cy] || '', pl: (f.places || [])[r.pl] || '', y: r.y,
            war: kind === 'memoriaux' ? (f.wars || [])[r.war] || '' : '', end: r.end ?? null, nhle: /^\d{7}$/.test(String(r.nhle || '')) ? r.nhle : '', kind}));
    }
    const nhleUrl = id => (/^\d{7}$/.test(String(id || '')) ? `https://historicengland.org.uk/listing/the-list/list-entry/${id}` : '');
    function measureRows(f) { return table(f).map(r => ({q: r.q, n: r.n, cy: (f.countries || [])[r.cy] || '', k: (f.kinds || [])[r.k] || '', v: r.v, u: (f.units || [])[r.u] || ''})); }

    const core = {num, fold, table, km, past, isDead, lifeSpan, placedEvents, near, safeUrl, wd, floodRows, floodsNear, bioUrl, eluRows, eluHomonyms, cpiRows, dollarWorth, placeRows, nhleUrl, measureRows};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const KEY = 'genealogie-telech-l';
    const TAB = ['telech_l', '25tl', '🌐 Les équivalents d’ailleurs'];
    const BLOCK = 'telech_l';
    const PARTS = [
        ['crues', '🌊 Les grandes crues d’Europe', 'Les crues de HANZE (depuis 1870) près de ses lieux, de son vivant ; elles rejoignent la liste « Crues réunies ».'],
        ['memoriaux', '🎖 Les monuments aux morts du monde', 'Les mémoriaux de guerre hors de France près de ses lieux ; ils rejoignent « Monuments réunis ».'],
        ['cimetieres', '✝️ Les cimetières du monde', 'Le cimetière le plus proche de son lieu de décès hors de France : une piste pour chercher sa tombe.'],
        ['villages', '🏚 Les villages désertés', 'Les villages abandonnés près de ses lieux (Wüstungen, villages médiévaux désertés d’Angleterre…).'],
        ['elus', '🗳 Les élus du Congrès des États-Unis', 'Un homonyme au Congrès (même nom, née la même année) et la liste des élus depuis 1789.'],
        ['prix', '💵 Les prix aux États-Unis', 'Ce que valait un dollar de son temps, en dollars d’aujourd’hui (indice des prix depuis 1913).'],
        ['mesures', '📏 Les mesures d’ailleurs', 'Des unités de mesure anciennes ou locales du monde, avec leur valeur (dans les Listes).'],
        ['liens', '🔗 Où chercher ailleurs (liens)', 'Recensements transcrits, registres, émigration, London Gazette, paroisses, cartes anciennes… : des liens, sur un clic.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), km: 5, kmc: 50, ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const radius = () => { const k = Number(settings().km); return k >= 1 && k <= 50 ? k : 5; };
    const radiusC = () => { const k = Number(settings().kmc); return k >= 5 && k <= 200 ? k : 50; };
    const nf = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const kmA = k => T('{n} km', {n: String(Math.max(1, Math.round(k)))});
    const link = (url, label) => { const u = safeUrl(url); return u ? `${window.LCNDA_UI.extLink(u, label)}` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tlx-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tlx-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tlx-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', CCBY = 'https://creativecommons.org/licenses/by/4.0/deed.fr';
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (${link(CC0, 'CC0')})`,
        hanze: () => `${link(ZENODO, 'HANZE, Paprotny (Zenodo)')} (${link(CCBY, 'CC BY 4.0')})`,
        congress: () => `${link('https://github.com/unitedstates/congress-legislators', 'Biographical Directory of the U.S. Congress')} (${link(CC0, 'CC0')})`,
        cpi: () => `${link('https://www.bls.gov/cpi/', 'U.S. Bureau of Labor Statistics, CPI-U')} (${link('https://opendatacommons.org/licenses/pddl/1-0/', T('domaine public'))})`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {crues: 'tl-crues', elus: 'tl-elus', prix: 'tl-prix', mesures: 'tl-mesures', memoriaux: 'tl-memoriaux', cimetieres: 'tl-cimetieres', villages: 'tl-villages',
        mines: 'tl-mines', lieux_gb: 'tl-lieux_gb', bagnards: 'tl-bagnards'};
    const SHAPE = {crues: floodRows, elus: eluRows, prix: cpiRows, mesures: measureRows, memoriaux: f => placeRows(f, 'memoriaux'), cimetieres: f => placeRows(f, 'cimetieres'), villages: f => placeRows(f, 'villages')};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const okPack = n => /^tl-[a-z]+(_[a-z]{2,5})?$/.test(n);
    function load(kind) {
        const name = FILES[kind]; if (!name || !okPack(name)) return Promise.resolve(null);
        if (!data[name]) data[name] = fetch(`assets/data/${name}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: name})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: (SHAPE[kind] || table)(f)} : null))
            .catch(e => { delete data[name]; throw e; });
        return data[name];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    /** les packs livrés (le sommaire) : ceux fabriqués seulement sur GitHub n'apparaissent que s'ils sont là */
    const have = new Set();
    let packsMemo = null;
    // 📦 les grands packs (tl-cimetieres, tl-mines… : app-grands-packs.js) ne sont pas livrés : là s'ils sont installés, servis à la même adresse
    const installedBig = new Set();
    const packs = () => (packsMemo ||= Promise.all([fetch(`assets/data/manifest.json?v=${DATA_V}`, {credentials: 'same-origin'}).then(r => (r.ok ? r.json() : {packs: {}})).catch(() => ({packs: {}})),
        Promise.resolve(ext.grandsPacks?.installed?.(/^tl-/) || []).catch(() => [])])
        .then(([m, inst]) => { have.clear(); installedBig.clear(); Object.keys(m?.packs || {}).filter(okPack).forEach(id => have.add(id)); inst.filter(okPack).forEach(id => { if (!have.has(id)) installedBig.add(id); have.add(id); });
            try { ext.dataListsEngine?.sync?.(); } catch (_) {} return m; }));
    root.addEventListener?.('lcnda:installs-changed', () => { packsMemo = null; for (const k of Object.keys(data)) if (!have.has(k) || installedBig.has(k)) delete data[k]; packs(); });
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const floodLi = x => `<li>🌊 <b>${esc(x.r.date)}</b> — ${esc([x.r.region, x.r.country].filter(Boolean).join(', '))}${x.r.river ? ` (${esc(x.r.river)})` : ''} <small class="muted">(${esc([x.r.dead ? T('{n} morts', {n: nf(x.r.dead)}) : '', x.r.cause, kmTxt(x.km)].filter(Boolean).join(' · '))})</small></li>`;
    const placeLi = x => { const r = x.r || x; return `<li>${r.kind === 'memoriaux' ? '🎖' : r.kind === 'cimetieres' ? '✝️' : '🏚'} <b>${link(r.nhle ? nhleUrl(r.nhle) : wd(r.q), r.n)}</b> <small class="muted">(${esc([r.war, r.pl, r.cy, r.y ? String(r.y) : '', r.end ? T('déserté vers {y}', {y: String(r.end)}) : '', x.km !== undefined ? kmTxt(x.km) : ''].filter(Boolean).join(' · '))})</small> ${srcLink(wd(r.q))}</li>`; };
    const nearOf = (rows, life, rad, onlyAbroad) => { const out = new Map(); for (const e of placedEvents(life)) { if (onlyAbroad && isFrance(e)) continue; for (const x of near(rows, e.lat, e.lon, rad, 100)) { const cur = out.get(x.r.q); if (!cur || x.km < cur.km) out.set(x.r.q, {...x, place: e.name}); } } return [...out.values()].sort((a, b) => a.km - b.km); };
    const deathPlace = life => { const ev = placedEvents(life); return ev.find(e => DEATH.includes(e.tag)) || null; };
    const isUS = e => /^(etats unis|usa|us|united states|united states of america|etats unis d amerique|amerique)$/.test(fold(e?.country));
    const JOBS = {
        crues: async life => {
            const C = await rowsOf('crues'); if (!C.rows.length) return '';
            const list = floodsNear(C.rows, life, radiusC()); if (!list.length) return '';
            const x = list[0];
            const lead = T('De son vivant, {n} grande(s) crue(s) à moins de {r} km de ses lieux ; la plus meurtrière : {d}, {w}.', {n: String(list.length), r: String(radiusC()), d: `<b>${esc(x.r.date)}</b>`, w: esc([x.r.region, x.r.country].filter(Boolean).join(', '))});
            return row('🌊', `${lead} ${srcLink(ZENODO)}`, LIC.hanze(), `${more(`<ul class="hist-ul tlx-ul">${list.slice(0, 20).map(floodLi).join('')}</ul>`, list.length)}${hyp(T('HANZE situe chaque crue au centre de la région touchée (NUTS 3) : la distance est celle de ce point, pas du village.'))}`);
        },
        memoriaux: async life => {
            const M = await rowsOf('memoriaux'); if (!M.rows.length) return '';
            const list = nearOf(M.rows, life, radius(), true); if (!list.length) return '';
            const x = list[0];
            return row('🎖', `${T('Un monument aux morts à {k} de {p} : {m}.', {k: esc(kmA(x.km)), p: esc(x.place), m: `<b>${link(wd(x.r.q), x.r.n)}</b>`})} ${srcLink(wd(x.r.q))}`, LIC.wd(), more(list.length > 1 ? `<ul class="hist-ul tlx-ul">${list.slice(1, 15).map(placeLi).join('')}</ul>` : '', list.length - 1));
        },
        cimetieres: async life => {
            const dp = deathPlace(life); if (!dp || isFrance(dp)) return '';
            const C = await rowsOf('cimetieres'); if (!C.rows.length) return '';
            const list = near(C.rows, dp.lat, dp.lon, radius(), 8); if (!list.length) return '';
            return row('✝️', `${T('Le cimetière le plus proche de {p}, où {s} est mort(e) : {c} ({k}).', {p: esc(dp.name), s: esc(life.person?.first || ''), c: `<b>${link(wd(list[0].r.q), list[0].r.n)}</b>`, k: esc(kmTxt(list[0].km))})} ${srcLink(wd(list[0].r.q))}`, LIC.wd(),
                `${more(list.length > 1 ? `<ul class="hist-ul tlx-ul">${list.slice(1).map(placeLi).join('')}</ul>` : '', list.length - 1)}${hyp(T('Une piste pour chercher sa tombe, pas une preuve : il a pu être inhumé ailleurs.'))}`);
        },
        villages: async life => {
            const V = await rowsOf('villages'); if (!V.rows.length) return '';
            const list = nearOf(V.rows, life, Math.max(radius(), 5), false); if (!list.length) return '';
            const x = list[0];
            return row('🏚', `${T('Un village déserté à {k} de {p} : {v}.', {k: esc(kmA(x.km)), p: esc(x.place), v: `<b>${link(x.r.nhle ? nhleUrl(x.r.nhle) : wd(x.r.q), x.r.n)}</b>`})} ${srcLink(wd(x.r.q))}`, LIC.wd(), more(list.length > 1 ? `<ul class="hist-ul tlx-ul">${list.slice(1, 15).map(placeLi).join('')}</ul>` : '', list.length - 1));
        },
        elus: async life => {
            const E = await rowsOf('elus'); if (!E.rows.length) return '';
            const hits = eluHomonyms(E.rows, life.person?.first, life.person?.last, num(life.person?.birth)); if (!hits.length) return '';
            const h = hits[0];
            return row('🗳', `${T('Un homonyme au Congrès des États-Unis : {n}, né(e) le {b}, {c} de {s} ({y}).', {n: `<b>${link(bioUrl(h.bio), h.name)}</b>`, b: esc(h.born), c: esc(h.chamber.includes('S') ? T('sénateur') : T('représentant')), s: esc(h.state), y: esc(`${h.from}–${h.to}`)})} ${srcLink(bioUrl(h.bio))}`, LIC.congress(),
                hyp(T('Même prénom, même nom, née la même année : peut-être la même personne, peut-être pas. Comparé sur l’ordinateur, rien n’est envoyé.')));
        },
        prix: async life => {
            const us = placedEvents(life).find(isUS); if (!us) return '';
            const P = await rowsOf('prix'); if (!P.rows.length) return '';
            const s = lifeSpan(life), last = P.rows[P.rows.length - 1].year, y = [s.birth, s.from].find(v => v !== null && v >= 1913 && v <= last) ?? (s.to !== null && s.to >= 1913 ? Math.min(s.to, last) : null); if (y === null) return '';
            const w = dollarWorth(P.rows, 1, y, last); if (w === null) return '';
            return row('💵', `${T('En {y}, un dollar valait autant que {w} dollars de {l} (indice des prix des États-Unis).', {y: String(y), w: esc(nf(w, 2)), l: String(last)})} ${srcLink('https://www.bls.gov/cpi/')}`, LIC.cpi(), hyp(T('Un indice moyen pour tout le pays : les loyers, la nourriture et les salaires ne suivaient pas tous le même chemin.')));
        }};
    const PERSON_PARTS = ['crues', 'memoriaux', 'cimetieres', 'villages', 'elus', 'prix'];
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const priv = !!opts.private || life.person?.living_status === 'living' || Number(life.person?.is_private) === 1;
        if (priv || !past(life)) { host.innerHTML = ''; return 0; } // personne décédée (ou d'il y a plus de 110 ans) et non confidentielle seulement
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tlx-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        if (p.living_status === 'living' || Number(p.is_private) === 1) return '';
        return A().card(index, T('🌐 Les équivalents d’ailleurs'), '', `<div class="tlx-block" data-tlx-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tlx-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tlxPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['crues', 'memoriaux', 'cimetieres', 'villages'];
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll) return '';
        if (kind === 'crues') {
            const C = await rowsOf('crues'); const hits = near(C.rows, ll.lat, ll.lon, radiusC(), 200); if (!hits.length) return '';
            const top = [...hits].sort((a, b) => (b.r.dead ?? 0) - (a.r.dead ?? 0))[0];
            return row('🌊', `${T('{n} grandes crues depuis 1870 à moins de {r} km (HANZE) ; la plus meurtrière : {d} ({w}).', {n: String(hits.length), r: String(radiusC()), d: `<b>${esc(top.r.date)}</b>`, w: esc(top.r.region)})} ${srcLink(ZENODO)}`, LIC.hanze(), more(`<ul class="hist-ul tlx-ul">${hits.slice(0, 30).map(floodLi).join('')}</ul>`, hits.length));
        }
        if (isFrance(place) && !place.foreign && kind !== 'villages') return '';
        const D = await rowsOf(kind); const hits = near(D.rows, ll.lat, ll.lon, Math.max(radius(), 5), 40); if (!hits.length) return '';
        const icon = {memoriaux: '🎖', cimetieres: '✝️', villages: '🏚'}[kind];
        const what = {memoriaux: T('monuments aux morts'), cimetieres: T('cimetières'), villages: T('villages désertés')}[kind];
        return row(icon, `${T('{n} {w} à moins de {r} km ; le plus proche : {b} ({k}).', {n: String(hits.length), w: esc(what), r: String(Math.max(radius(), 5)), b: `<b>${link(wd(hits[0].r.q), hits[0].r.n)}</b>`, k: esc(kmTxt(hits[0].km))})} ${srcLink(wd(hits[0].r.q))}`, LIC.wd(), more(`<ul class="hist-ul tlx-ul">${hits.map(placeLi).join('')}</ul>`, hits.length));
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tlx-panel"><h3>${esc(T('🌐 Les équivalents d’ailleurs'))}</h3><div class="hist-life tlx-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null, foreign: !/INSEE/.test(head)};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tlx_place', host: '[data-tlx-host]', icon: '🌐', label: 'Les équivalents d’ailleurs', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tlx])'); if (!village) return;
        village.dataset.tlx = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-tkx-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tlx-place" data-tlx-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tlx-host]'), villagePlace(village));
    }
    let pending = 0;
    if (root.document) new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📋 Listes ─────────── */
    const F = (key, label, type = 'text', x = {}) => ({key, label: T(label), type, ...x});
    const openSrc = r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); };
    const L = (id, pack, icon, label, theme, source, sourceUrl, kind, load2, fields, x = {}) => ({id, pack, icon, label: T(label), theme, group: x.group || 'Le monde', source, sourceUrl, enabled: () => on(kind) && (!x.onlyIf || have.has(x.onlyIf)), load: load2, fields, open: openSrc, ...x});
    const wdRows = kind => async () => (await rowsOf(kind)).rows.map(r => ({name: r.n, war: r.war, place: r.pl, country: r.cy, year: r.y, end: r.end, official: nhleUrl(r.nhle), lat: r.lat, lon: r.lon, q: r.q, src: wd(r.q)}));
    (ext.dataLists = ext.dataLists || []).push(
        L('tl_crues', 'tl-crues', '🌊', 'Grandes crues d’Europe depuis 1870 (HANZE)', 'eaux', 'HANZE, Paprotny (Zenodo, CC BY 4.0)', ZENODO, 'crues',
            async () => (await rowsOf('crues')).rows.map(r => ({date: r.date, year: r.year, region: r.region, country: r.country, river: r.river, kind: T(r.kind), dead: r.dead, people: r.people, cause: r.cause, refs: r.refs, lat: r.lat, lon: r.lon, src: ZENODO, id: r.id})),
            [F('date', 'Date', 'date'), F('region', 'Régions touchées', 'place'), F('country', 'Pays', 'enum'), F('river', 'Rivières'), F('kind', 'Sorte', 'enum'), F('dead', 'Morts', 'number'), F('people', 'Personnes touchées', 'number'), F('cause', 'Cause'), F('refs', 'Sources citées par HANZE'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], familyColumn: true, defaultSort: ['date', 'desc'],
                merge: {into: 'crues', rank: 5, short: 'HANZE', row: r => ({key: `hanze${r.id}`, date: r.date, year: r.year, lat: r.lat, lon: r.lon, place: r.region, river: r.river, what: [r.kind, r.dead ? T('{n} morts', {n: String(r.dead)}) : '', r.cause].filter(Boolean).join(' · '), url: r.src})}}),
        L('tl_memoriaux', 'tl-memoriaux', '🎖', 'Monuments aux morts du monde (hors de France)', 'guerres', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q575759', 'memoriaux', wdRows('memoriaux'),
            [F('name', 'Monument'), F('war', 'Guerre', 'enum'), F('place', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('year', 'Année', 'year'), F('src', 'Source (Wikidata)', 'url')],
            {onlyIf: 'tl-memoriaux', period: r => [r.year, null], geo: r => [r.lat, r.lon], familyColumn: true,
                merge: {into: 'monuments', rank: 4, short: 'Wikidata · monuments aux morts', row: r => ({key: r.q, qid: r.q, name: r.name, kind: T('monument aux morts'), commune: [r.place, r.country].filter(Boolean).join(', '), from: r.year, lat: r.lat, lon: r.lon, url: r.src})}}),
        L('tl_cimetieres', 'tl-cimetieres', '✝️', 'Cimetières du monde (hors de France)', 'croire', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q39614', 'cimetieres', wdRows('cimetieres'),
            [F('name', 'Cimetière'), F('place', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('year', 'Ouvert en', 'year'), F('src', 'Source (Wikidata)', 'url')],
            {onlyIf: 'tl-cimetieres', period: r => [r.year, null], geo: r => [r.lat, r.lon], familyColumn: true}),
        L('tl_villages', 'tl-villages', '🏚', 'Villages désertés du monde (Wüstungen, villages médiévaux désertés…)', 'lieux', 'Wikidata (CC0) ; Historic England (liens)', 'https://www.wikidata.org/wiki/Q350895', 'villages', wdRows('villages'),
            [F('name', 'Village'), F('place', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('year', 'Fondé', 'year'), F('end', 'Déserté', 'year'), F('official', 'Fiche Historic England', 'url'), F('src', 'Source (Wikidata)', 'url')],
            {onlyIf: 'tl-villages', period: r => [r.year ?? r.end, r.end], geo: r => [r.lat, r.lon], familyColumn: true, open: r => { const u = safeUrl(r.official || r.src); if (u) window.open(u, '_blank', 'noopener'); }}),
        L('tl_elus', 'tl-elus', '🗳', 'Membres du Congrès des États-Unis (depuis 1789)', 'pouvoirs', 'Biographical Directory of the U.S. Congress (CC0)', 'https://github.com/unitedstates/congress-legislators', 'elus',
            async () => (await rowsOf('elus')).rows.map(r => ({name: r.name, born: r.born, year: r.year, state: r.state, chamber: [r.chamber.includes('S') ? T('Sénat') : '', r.chamber.includes('R') ? T('Chambre des représentants') : ''].filter(Boolean), from: r.from, to: r.to, party: r.party, src: bioUrl(r.bio)})),
            [F('name', 'Nom', 'text', {person: true}), F('born', 'Naissance', 'date'), F('state', 'État', 'enum'), F('chamber', 'Chambre', 'enum'), F('from', 'Premier mandat', 'year'), F('to', 'Dernier mandat', 'year'), F('party', 'Parti', 'enum'), F('src', 'Fiche officielle (bioguide)', 'url')],
            {period: r => [r.from, r.to], group: 'Chercher', personMatch: {born: r => r.year, died: () => null, historic: true}}),
        L('tl_prix', 'tl-prix', '💵', 'Prix aux États-Unis depuis 1913 (indice CPI-U)', 'prix', 'U.S. Bureau of Labor Statistics (domaine public)', 'https://www.bls.gov/cpi/', 'prix',
            async () => { const R = (await rowsOf('prix')).rows, last = R.length ? R[R.length - 1].year : null; return R.map(r => ({year: r.year, cpi: r.cpi, worth: last ? dollarWorth(R, 1, r.year, last) : null, src: 'https://www.bls.gov/cpi/'})); },
            [F('year', 'Année', 'year'), F('cpi', 'Indice (1982-84 = 100)', 'number'), F('worth', '1 $ de cette année en $ d’aujourd’hui', 'number'), F('src', 'Source', 'url')], {period: r => [r.year, r.year], defaultSort: ['year', 'asc']}),
        L('tl_mesures', 'tl-mesures', '📏', 'Mesures anciennes et locales du monde', 'prix', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Property:P2370', 'mesures',
            async () => (await rowsOf('mesures')).rows.map(r => ({name: r.n, country: r.cy, kind: r.k, value: r.v, unit: r.u, src: wd(r.q)})),
            [F('name', 'Mesure'), F('country', 'Pays', 'enum'), F('kind', 'Grandeur', 'enum'), F('value', 'Vaut', 'number'), F('unit', 'Unité', 'enum'), F('src', 'Source (Wikidata)', 'url')], {group: 'La personne'}),
        // fabriqués seulement sur GitHub (.github/workflows/telech-l.yml) : visibles seulement quand le pack est là
        L('tl_mines', 'tl-mines', '⛏', 'Mines et gisements du monde (USGS MRDS)', 'metiers', 'USGS, Mineral Resources Data System (domaine public)', 'https://mrdata.usgs.gov/mrds/', 'mines',
            async () => (await rowsOf('mines')).rows.map(r => ({name: r.n, commodity: r.c, country: r.cy, state: r.st, from: r.y1, to: r.y2, status: r.s, lat: r.lat, lon: r.lon, src: safeUrl(r.u)})),
            [F('name', 'Site'), F('commodity', 'Substance', 'enum'), F('country', 'Pays', 'enum'), F('state', 'Région', 'enum'), F('from', 'Exploitée dès', 'year'), F('to', 'jusqu’en', 'year'), F('status', 'État', 'enum'), F('src', 'Fiche (USGS)', 'url')],
            {onlyIf: 'tl-mines', period: r => [r.from, r.to], geo: r => [r.lat, r.lon], familyColumn: true}),
        L('tl_lieux_gb', 'tl-lieux_gb', '🗺', 'Hameaux et lieux-dits de Grande-Bretagne (OS Open Names)', 'lieux', 'Ordnance Survey, OS Open Names (OGL v3)', 'https://www.ordnancesurvey.co.uk/products/os-open-names', 'liens',
            async () => (await rowsOf('lieux_gb')).rows.map(r => ({name: r.n, kind: r.k, county: r.c, lat: r.lat, lon: r.lon, src: 'https://www.ordnancesurvey.co.uk/products/os-open-names'})),
            [F('name', 'Nom'), F('kind', 'Sorte', 'enum'), F('county', 'Comté', 'enum'), F('src', 'Source', 'url')], {onlyIf: 'tl-lieux_gb', geo: r => [r.lat, r.lon], familyColumn: true}),
        L('tl_bagnards', 'tl-bagnards', '⛓', 'Bagnards envoyés en Australie (State Library of Queensland)', 'personnes', 'State Library of Queensland (CC BY 4.0)', 'https://www.slq.qld.gov.au/', 'liens',
            async () => (await rowsOf('bagnards')).rows.map(r => ({name: r.n, ship: r.s, year: r.y, place: r.p, src: 'https://www.slq.qld.gov.au/'})),
            [F('name', 'Nom', 'text', {person: true}), F('ship', 'Navire', 'enum'), F('year', 'Départ', 'year'), F('place', 'Jugé à', 'place'), F('src', 'Source', 'url')], {onlyIf: 'tl-bagnards', group: 'Chercher', period: r => [r.year, r.year], personMatch: {born: () => null, died: () => null, historic: true}}));

    /* ─────────── 🗺 Cartes (points seulement : aucune tuile de ce lot) ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, lab, yr) => ({id, icon, label: T(label), group: 'Le monde', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 3000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || !yr || (yr(r) ?? from) >= from) && (!to || !yr || (yr(r) ?? to) <= to) && (!q || fold(lab(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: lab(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('tlx_crues', '🌊', 'Grandes crues d’Europe (HANZE, centre de la région)', async () => (await rowsOf('crues')).rows, 'HANZE (CC BY 4.0)', r => `${r.date} ${r.region}${r.dead ? ` (${r.dead} †)` : ''}`, r => r.year),
        layer('tlx_memoriaux', '🎖', 'Monuments aux morts du monde', async () => (await rowsOf('memoriaux')).rows, 'Wikidata (CC0)', r => r.n),
        layer('tlx_cimetieres', '✝️', 'Cimetières du monde', async () => (await rowsOf('cimetieres')).rows, 'Wikidata (CC0)', r => r.n),
        layer('tlx_villages', '🏚', 'Villages désertés', async () => (await rowsOf('villages')).rows, 'Wikidata (CC0)', r => `${r.n}${r.end ? ` (${r.end})` : ''}`));

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = c => Number(c.person?.id || c.person?.person?.id || c.person) || 0;
    const privOfCtx = c => { const p = c.person?.person || c.person; return !!(p && typeof p === 'object' && (p.living_status === 'living' || Number(p.is_private) === 1)); };
    async function runPerson(parts, c, host, empty) {
        const id = personOfCtx(c); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true, private: privOfCtx(c)});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, c, host) {
        const pl = placeOfCtx(c.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, {...pl, foreign: true});
        host.innerHTML = html ? `<div class="hist-life tlx-life">${html}</div>` : '';
        return !!html;
    }
    const DS = (id, icon, label, parts, empty) => ({id, icon, label: T(label), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (c, host) => runPerson(parts, c, host, empty)});
    (ext.dataSources = ext.dataSources || []).push(
        DS('tlxp_crues', '🌊', 'Les grandes crues d’Europe de sa vie', ['crues'], 'Aucune grande crue connue (HANZE) près de ses lieux, de son vivant.'),
        DS('tlxp_lieux', '🎖', 'Monuments aux morts, cimetières et villages désertés près de ses lieux (hors de France)', ['memoriaux', 'cimetieres', 'villages'], 'Rien de connu près de ses lieux hors de France.'),
        DS('tlxp_usa', '🗳', 'États-Unis : un homonyme au Congrès, le dollar de son temps', ['elus', 'prix'], 'Rien à dire (il faut une naissance connue, ou des lieux aux États-Unis).'),
        ...PLACE_KINDS.map(k => ({id: `tlx_${k}_lieu`, icon: {crues: '🌊', memoriaux: '🎖', cimetieres: '✝️', villages: '🏚'}[k], label: T(PARTS.find(p => p[0] === k)[1]), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (c, host) => runPlace(k, c, host)})));

    /* ─────────── ⚙️ Réglages → 🌐 Les équivalents d'ailleurs ─────────── */
    /** ce qui n'est qu'en lien, avec la raison (lu le 2026-11-26 ; « refusé » = site injoignable depuis l'atelier, licence pas relue) */
    const LINK_ONLY = [
        ['👶', 'Prénoms par année : Norvège (SSB), Angleterre et pays de Galles (ONS), Écosse (NRS), Irlande (CSO), Suède (SCB), Danemark (DST), Finlande (DVV), Espagne (INE), Nouvelle-Zélande (DIA), provinces du Canada, États d’Australie', 'Sites refusés par le réseau de l’atelier : licences et formats pas relus ; les États-Unis (SSA, domaine public) entrent dans le pack « Prénoms d’ici et d’ailleurs » par son atelier GitHub.', 'https://www.ssb.no/en/befolkning/navn/statistikk/navn'],
        ['🔤', 'Noms de famille : recensement des États-Unis 2000 et 2010, INE (Espagne, par province), offices statistiques nordiques', 'census.gov, ine.es, ssb.no… refusés : liens.', 'https://www.census.gov/topics/population/genealogy/data/2010_surnames.html'],
        ['🗺', 'Cartes anciennes : swisstopo (Dufour, Siegfried), NLS 6-inch, USGS topo — déjà dans les fonds de carte de l’app ; Kadaster TopoTijdreis, Danemark, Suède, Norvège, Espagne (minutes)', 'Fonds déjà livrés gardés ; pour les autres, conditions des tuiles pas relues (sites refusés) : liens, jamais de fond ajouté sans conditions lues.', 'https://www.topotijdreis.nl/'],
        ['📷', 'Photos aériennes anciennes : swisstopo, Danemark 1954, Pays-Bas 1945, USGS, Wallonie', 'Conditions des services de tuiles pas relues (sites refusés) : liens.', 'https://www.swisstopo.admin.ch/fr/photos-aeriennes-historiques'],
        ['🎖', 'Soldats : Online Cenotaph (Nouvelle-Zélande, CC BY), Mémorial virtuel de guerre du Canada, NAA (Australie)', 'Sites refusés ; pas de fichier en bloc lu : liens. Les soldats américains (ABMC) sont déjà dans Où chercher.', 'https://www.aucklandmuseum.com/war-memorial/online-cenotaph'],
        ['📰', 'London Gazette (OGL) : décorations, naturalisations, faillites', 'thegazette.co.uk refusé : la recherche s’ouvre sans aucun nom de l’arbre (tu tapes le nom toi-même).', 'https://www.thegazette.co.uk/all-notices/notice'],
        ['🏛', 'Registres des monuments aux morts d’Australie et de Nouvelle-Zélande', 'Sites refusés : liens ; les monuments de Wikidata sont dans la liste.', 'https://www.nzhistory.govt.nz/culture/the-memorials-register'],
        ['⛪', 'Paroisses d’Angleterre, du pays de Galles, d’Écosse et d’Irlande, et où trouver leurs registres', 'Contours ouverts pas relus (sites refusés) : liens vers FamilySearch Wiki, FreeREG, ScotlandsPeople, NLI.', 'https://www.freereg.org.uk/'],
        ['🏠', 'Recensements transcrits : Norvège 1801, 1865, 1910 ; Islande 1703 ; Danemark ; Canada 1851-1921', 'Fichiers et licences pas relus (sites refusés) : liens. Jamais de nom de l’arbre envoyé : tu cherches toi-même sur le site.', 'https://www.digitalarkivet.no/'],
        ['📚', 'Registres indexés : Riksarkivet (Suède, CC0), HisKi (Finlande), DDD (Danemark)', 'Sites refusés : liens.', 'https://sok.riksarkivet.se/'],
        ['🚢', 'Émigration : protocoles d’émigrants norvégiens, listes de passagers de Brême', 'Liens.', 'https://www.passagierlisten.de/'],
        ['⛓', 'Bagnards envoyés en Australie (State Library of Queensland, CC BY)', 'data.qld.gov.au refusé : fabriqué sur GitHub (Actions → « Les équivalents d’ailleurs (lot L) », quoi = bagnards) ; comparé sur l’ordinateur, seulement pour des personnes décédées.', 'https://www.slq.qld.gov.au/'],
        ['📊', 'Populations des communes : Suisse (OFS, depuis 1850), Norvège (SSB), Pays-Bas (CBS)', 'Sites refusés : liens.', 'https://www.bfs.admin.ch/'],
        ['🏚', 'Villages médiévaux désertés (Historic England, OGL)', 'Le registre est refusé ; Wikidata reprend les villages désertés avec leur numéro Historic England (lien vers la fiche officielle) : dans la liste.', 'https://historicengland.org.uk/listing/the-list/'],
        ['🧀', 'Indications géographiques de l’Union européenne (eAmbrosia)', 'Site refusé, conditions pas relues : lien (les AOC françaises restent dans l’app).', 'https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/'],
        ['🐄', 'Races animales du monde (FAO DAD-IS)', 'Licence pas relue (site refusé) : lien (les races de France restent dans l’app).', 'https://www.fao.org/dad-is/'],
        ['📒', 'Annuaires de commerce (Royaume-Uni, États-Unis)', 'Liens vers les collections numérisées (Internet Archive, université de Leicester).', 'https://specialcollections.le.ac.uk/digital/collection/p16445coll4'],
        ['🪨', 'Géologie : BGS (Grande-Bretagne, OGL), USGS (domaine public), Europe (OneGeology)', 'Conditions des services de cartes pas relues (sites refusés) : liens, pas de calque ajouté.', 'https://www.bgs.ac.uk/map-viewers/geoindex-onshore/'],
        ['⛏', 'Mines : USGS MRDS (domaine public), Coal Authority (OGL)', 'MRDS fabriqué sur GitHub (quoi = mines) ; Coal Authority : lien.', 'https://mrdata.usgs.gov/mrds/'],
        ['💷', 'Prix et salaires du monde (GPIH, UC Davis) ; prix des États-Unis avant 1913', 'Pas de licence ouverte lue : liens ; l’indice des prix des États-Unis depuis 1913 (BLS, domaine public) est dans l’app.', 'https://gpih.ucdavis.edu/'],
        ['🗺', 'Noms de lieux : OS Open Names (Grande-Bretagne, OGL), registres de Norvège, Suède, Finlande', 'OS Open Names fabriqué sur GitHub (quoi = lieux_gb) ; les registres nordiques : liens.', 'https://www.ordnancesurvey.co.uk/products/os-open-names']];
    let drawToken = 0;
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const mine = ++drawToken;
        await packs();
        const GP = ext.grandsPacks, gst = await (GP?.status?.() || Promise.resolve(null)).catch(() => null);
        // un grand pack installé n'est pas relu ici (des centaines de milliers de lignes) : sa fiche d'installation suffit
        const metas = await Promise.all(Object.keys(FILES).map(async k => [k, installedBig.has(FILES[k]) ? null : await quiet(load(k))]));
        if (mine !== drawToken || (token !== undefined && A().state && token !== A().state.workspaceToken)) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tlx-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const LAB = {crues: '🌊 Crues d’Europe', elus: '🗳 Congrès des États-Unis', prix: '💵 Prix des États-Unis', mesures: '📏 Mesures du monde', memoriaux: '🎖 Monuments aux morts', cimetieres: '✝️ Cimetières', villages: '🏚 Villages désertés',
            mines: '⛏ Mines (USGS)', lieux_gb: '🗺 Lieux-dits de Grande-Bretagne', bagnards: '⛓ Bagnards (Queensland)'};
        const fileRow = ([k, D]) => { const id = FILES[k], big = GP?.KNOWN?.includes(id), g = gst?.packs?.[id];
            if (!D && big && g) return `<tr data-tlx-pack="${esc(id)}"><td>${esc(T(LAB[k]))}</td><td>✓ ${esc(T('installé'))}${g.source ? ` · ${esc(g.source)}` : ''}</td><td>${esc(nf(g.rows || 0))}</td><td>${esc(g.licence || '')}</td><td>${esc(g.built || '')} ${GP.removeHtml(id)}</td></tr>`;
            if (!D && big) return `<tr data-tlx-pack="${esc(id)}"><td>${esc(T(LAB[k]))}</td><td colspan="4">${kiosk() ? `<span class="muted">${esc(T('Pas installé (trop gros pour être livré avec l’app).'))}</span>` : GP.offerHtml(id)}</td></tr>`;
            if (!D) return `<tr><td>${esc(T(LAB[k]))}</td><td colspan="4" class="muted">${esc(T('Pas encore fabriqué : sur GitHub, Actions → « Les équivalents d’ailleurs (lot L) ».'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(LAB[k]))}</td><td>${link(m.url, m.source)}</td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings tlx-settings" data-tlx-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Les équivalents d’ailleurs'), icon: '🌐', where: T('Réglages · Données'), help: esc(T('Pour les ancêtres hors de France : grandes crues d’Europe, monuments aux morts, cimetières, villages désertés, Congrès et prix des États-Unis, mesures du monde. Tout est lu sur l’ordinateur.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne décédée (bloc « 🌐 Les équivalents d’ailleurs »), sur la fiche d’un village, dans les Listes (crues réunies, monuments réunis, thèmes) et dans Cartes.'))}</p>${PARTS.map(tg).join('')}
                <div class="tlx-opts">
                    <label class="tlx-opt">${esc(T('Monuments, cimetières, villages : à combien de kilomètres ?'))} <input type="number" min="1" max="50" step="1" value="${esc(String(radius()))}" data-tlx-km="km" inputmode="numeric"> <span class="muted">${esc(T('km (5 par défaut)'))}</span></label>
                    <label class="tlx-opt">${esc(T('Crues : à combien de kilomètres ?'))} <input type="number" min="5" max="200" step="5" value="${esc(String(radiusC()))}" data-tlx-km="kmc" inputmode="numeric"> <span class="muted">${esc(T('km (50 par défaut)'))}</span></label>
                </div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${metas.map(fileRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Les prénoms des États-Unis depuis 1880 (SSA, domaine public) s’ajoutent au pack « Prénoms d’ici et d’ailleurs » (Statistiques → Prénoms) quand son atelier GitHub est relancé.'))}</p>
                ${on('liens') && !kiosk() ? `<h4>${esc(T('En lien seulement'))}</h4><ul class="hist-ul tlx-ul">${LINK_ONLY.map(([i, l, why, u]) => `<li>${esc(i)} <b>${esc(T(l))}</b> — ${esc(T(why))} ${link(u, T('↗ ouvrir'))}</li>`).join('')}</ul>` : ''}
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Les liens « ↗ » ouvrent une page seulement quand on clique ; en consultation, les liens « en lien seulement » ne sont pas montrés. Aucune tuile ni image n’est chargée par ce lot.'))}</p></div></section>`;
    }
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tlx-tg]');
        if (t && e.target.matches('input')) {
            const s = settings(), k = t.dataset.tlxTg, was = s[k];
            s[k] = e.target.checked; saveSettings(s);
            try { ext.dataListsEngine?.sync?.(); } catch (_) {}
            A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); try { ext.dataListsEngine?.sync?.(); } catch (_) {} drawSettings(); }, icon: '🌐'});
            return;
        }
        const kmIn = e.target.closest?.('[data-tlx-km]');
        if (kmIn) {
            const key = kmIn.dataset.tlxKm === 'kmc' ? 'kmc' : 'km', [lo, hi] = key === 'kmc' ? [5, 200] : [1, 50], s = settings(), was = s[key], v = Math.round(Number(kmIn.value));
            const cur = key === 'kmc' ? radiusC() : radius();
            if (!(v >= lo && v <= hi)) { kmIn.value = String(cur); return; }
            if (v === cur) return;
            s[key] = v; saveSettings(s);
            A().undoToast?.(T(key === 'kmc' ? 'Crues : {n} km.' : 'Autour de ses lieux : {n} km.', {n: String(v)}), {undo: () => { const x = settings(); x[key] = was; saveSettings(x); drawSettings(); }, icon: '🌐'});
        }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_k'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_k'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🌐 Les équivalents d’ailleurs']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    if (root.document) packs();

    ext.telechL = {...core, load, packs, settings, radius, radiusC, personInto, placeInto, placePart, lifeOf, LINK_ONLY,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
