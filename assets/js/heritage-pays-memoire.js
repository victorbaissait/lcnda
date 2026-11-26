/* LCNDA — 🏡 Pays et mémoire (style : assets/css/pays-memoire.css ; en ligne : lib/pays_memoire.php ; données : assets/data/pm-*,
 * refaites par scripts/pays-memoire/build-data.py). Tout est sourcé : une ligne « Source » et un lien « ↗ source » vers la page exacte.
 *  · 💃 Musique et danses de sa région — Wikidata (CC0) : danses, instruments, chants liés à un pays de France, sons et vidéos libres
 *    de Wikimedia Commons (licence de chaque fichier) ;
 *  · 🎙️ Le parler de son coin — Atlas sonore des langues régionales de France (CNRS-LISN, CC BY-NC-SA 4.0) : le point d'enregistrement
 *    le plus proche ; le son s'écoute depuis le site de l'Atlas (l'app ne garde que le nom, la position et le nom du fichier) ;
 *  · ⛲ Fontaines et saints — Wikidata : fontaines à dévotion, sources « Saint-… », lieux de pèlerinage, le saint et ce pour quoi on
 *    l'invoque quand Wikidata le dit (P2925) ;
 *  · 🎞️ Films d'archives libres de sa ville — Wikimedia Commons et Internet Archive, EN LIGNE à la demande, gardés 30 jours ;
 *  · 📜 Cahiers de doléances de 1789 — transcription ouverte quand il y en a une (Wikisource), sinon les Archives du département
 *    (data.gouv.fr, Licence Ouverte) et la recherche FranceArchives pour la paroisse ;
 *  · 🪦 Le monument aux morts — Wikidata (photo Commons, date, sculpteur, lien vers la base de l'Université de Lille) ;
 *  · 🐺 Loups et bêtes sauvages — GBIF : « Répartition historique du loup en France métropolitaine » (INPN, CC BY 4.0) et autres jeux ;
 *  · 🎓 Grandes écoles — Wikidata (anciens élèves connus, CC0) ; les registres eux-mêmes : liens dans « Où chercher » (LCNDA_SO40).
 * Où : fiche (lignes dans « 🏘 Le lieu à son époque », crochet ext.histoireAfter ; 🪦 aussi sous « Peut-être dans Morts pour la
 * France »), fiche d'un village, monographie (LCNDA_EXT.monographSections), Listes (LCNDA_EXT.dataLists), 🧰 (LCNDA_EXT.dataSources),
 * Où chercher (window.LCNDA_SO40), Réglages → « 🏡 Pays et mémoire » (localStorage « genealogie-pays-memoire »).
 * Essai : tests/test-pays-memoire.js
 */
(function (root) {
    'use strict';
    // les nombres passent en texte : une année reste « 1907 » (pas « 1 907 »)
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); };

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    function km(a, b, c, d) { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.sqrt(x * x + y * y); }
    const depOf = insee => ((String(insee || '').toUpperCase().match(/^(97\d|2[AB]|\d{2})/) || [])[1] || '');
    const okInsee = s => /^(\d{5}|2[AB]\d{3})$/.test(String(s || '').toUpperCase());
    /** l'index des communes (cc-communes.json.gz) : grille de 0,1° et noms */
    function communeIndex(raw) {
        const c = raw.c || raw, grid = new Map(), names = new Map();
        for (const [code, [n, lat, lon]] of Object.entries(c)) {
            const k = `${Math.floor(lat * 10)}|${Math.floor(lon * 10)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(code);
            const f = fold(n); if (!names.has(f)) names.set(f, []); names.get(f).push(code);
        }
        return {c, grid, names};
    }
    function nearestCommune(I, lat, lon, maxKm = 5) {
        let best = null;
        const a = Math.floor(lat * 10), b = Math.floor(lon * 10);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const code of I.grid.get(`${a + i}|${b + j}`) || []) {
            const [, la, lo] = I.c[code], d = km(lat, lon, la, lo); if (!best || d < best.km) best = {insee: code, km: d};
        }
        return best && best.km <= maxKm ? best.insee : '';
    }
    /** un lieu → {insee, name, lat, lon, dep} (code INSEE donné, sinon la commune la plus proche, sinon le nom s'il est unique) */
    function resolvePlace(I, p) {
        if (!p) return null;
        let insee = okInsee(p.insee) ? String(p.insee).toUpperCase() : '';
        const lat = Number.isFinite(Number(p.lat ?? p.latitude)) && (p.lat ?? p.latitude) !== null && (p.lat ?? p.latitude) !== '' ? Number(p.lat ?? p.latitude) : null;
        const lon = Number.isFinite(Number(p.lon ?? p.longitude)) && (p.lon ?? p.longitude) !== null && (p.lon ?? p.longitude) !== '' ? Number(p.lon ?? p.longitude) : null;
        const hasPos = lat != null && lon != null && !(lat === 0 && lon === 0);
        const country = fold(p.country || '');
        if (country && !['france', 'fr', 'fra'].includes(country)) return null;
        if (!insee && hasPos) insee = nearestCommune(I, lat, lon, 5);
        const name = String(p.name || p.place_name || '').replace(/\s*[,(].*$/, '').trim();
        if (!insee && name) { const l = I.names.get(fold(name)) || []; if (l.length === 1) insee = l[0]; }
        if (!insee || !I.c[insee]) return hasPos ? {insee: '', name, lat, lon, dep: ''} : null;
        const [cn, la, lo] = I.c[insee];
        return {insee, name: cn || name, lat: hasPos ? lat : la, lon: hasPos ? lon : lo, dep: depOf(insee)};
    }
    const musicFor = (M, dep) => (dep ? (M.rows || []).filter(r => (r.deps || []).includes(dep)) : []);
    function parlersNear(P, lat, lon, n = 3, maxKm = 60) {
        if (lat == null || lon == null) return [];
        return (P.rows || []).map(r => ({name: r[0], lat: r[1], lon: r[2], file: r[3], group: r[4], km: km(lat, lon, r[1], r[2])})).filter(r => r.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, n);
    }
    function fontainesNear(F, pl, maxKm = 5) {
        return (F.rows || []).map(r => ({...r, km: r.lat != null && pl.lat != null ? km(pl.lat, pl.lon, r.lat, r.lon) : null}))
            .filter(r => (pl.insee && r.insee === pl.insee) || (r.km != null && r.km <= maxKm)).sort((a, b) => (a.insee === pl.insee ? 0 : 1) - (b.insee === pl.insee ? 0 : 1) || (a.km ?? 99) - (b.km ?? 99));
    }
    function monumentsOf(MO, insee) {
        if (!insee) return [];
        return (MO.rows || []).filter(r => r[1] === insee).map(r => ({q: 'Q' + r[0], insee: r[1], lat: r[2], lon: r[3], name: r[4], img: r[5], year: r[6] || null, creators: (r[7] || []).map(i => (MO.creators[i] || [])[1]).filter(Boolean), lille: r[8] || '', approx: !!r[9]}));
    }
    const faunaOf = (FA, dep) => (dep ? (FA.rows || []).filter(r => r.dep === dep) : []);
    /** « Quand il est né, il y avait encore des loups » : la dernière mention du loup dans son département, comparée à sa naissance */
    function wolfLine(FA, dep, birth) {
        const w = faunaOf(FA, dep).find(r => r.sp === 'loup'); if (!w || !birth) return null;
        return {last: w.last, first: w.first, n: w.n, still: birth <= w.last, dep, depName: (FA.deps?.[dep] || [])[0] || dep};
    }
    function doleancesOf(D, pl) {
        if (!pl?.insee) return null;
        return {ws: (D.wikisource || []).filter(w => w.insee === pl.insee), ad: (D.deps || []).find(d => d.dep === pl.dep) || null};
    }
    /** les anciens élèves de Wikidata qui ont le même nom, le même premier prénom, nés à un an près */
    function ecolesMatch(E, first, last, birth) {
        const f = fold(first).split(' ')[0], l = fold(last);
        if (!f || !l || !birth) return [];
        return (E.rows || []).filter(r => Math.abs(r[2] - birth) <= 1).filter(r => { const n = ` ${fold(r[1])} `; return n.includes(` ${f} `) && n.includes(` ${l} `) && n.trim().endsWith(l); })
            .map(r => ({q: 'Q' + r[0], name: r[1], birth: r[2], school: E.schools[r[3]] || {}, start: r[4] || null, birthplace: r[5] || ''}));
    }
    const core = {fold, km, depOf, communeIndex, nearestCommune, resolvePlace, musicFor, parlersNear, fontainesNear, monumentsOf, faunaOf, wolfLine, doleancesOf, ecolesMatch};
    if (typeof module === 'object' && module.exports) module.exports = core;
    if (typeof document === 'undefined') return;

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-pays-memoire';
    const TAB = ['pays_memoire', '25k6', '🏡 Pays et mémoire'];
    const DATA_V = 1;
    const WD = q => `https://www.wikidata.org/wiki/${q}`;
    const COMMONS = f => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(f).replace(/ /g, '_'))}`;
    const FILEPATH = (f, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(f).replace(/ /g, '_'))}${w ? `?width=${w}` : ''}`;
    const WP = t => `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;
    const FA_SEARCH = q => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(q)}`;
    const PARTS = [
        ['musique', '💃', 'Musique et danses de sa région', 'Les danses, instruments et chants de son pays (Wikidata), avec un son ou une vidéo libre quand il y en a.', 'Le lieu'],
        ['parler', '🎙️', 'Écouter le parler de ton coin', 'La même fable lue dans le parler du point d’enregistrement le plus proche (Atlas sonore des langues régionales).', 'Le lieu'],
        ['fontaines', '⛲', 'Fontaines et saints guérisseurs', 'Fontaines à dévotion, sources des saints et lieux de pèlerinage de la commune et tout près.', 'Le lieu'],
        ['films', '🎞️', 'Films d’archives libres de sa ville', 'Vieux films (jusqu’en 1970) libres de droits où paraît la commune : Wikimedia Commons et Internet Archive (en ligne).', 'Le lieu'],
        ['doleances', '📜', 'Les cahiers de doléances de 1789', 'Ce que le village demandait au roi en 1789 : la transcription quand elle est libre, sinon où la trouver.', 'Le lieu'],
        ['monument', '🪦', 'Le monument aux morts', 'Le monument aux morts de la commune : photo, date, sculpteur, lien vers la base de l’Université de Lille.', 'Le lieu'],
        ['faune', '🐺', 'Les loups et bêtes sauvages', 'Les loups (et ours, castors, lynx) mentionnés dans le département, par décennie (GBIF).', 'Le lieu'],
        ['person', '🏡', 'Sur la fiche : son pays', 'Dans « 🏘 Le lieu à son époque » : la danse de son pays, le parler de son coin, les derniers loups, le monument aux morts, les grandes écoles, les cahiers de 1789.', 'La personne']];
    const PLACE_PARTS = PARTS.filter(p => p[4] === 'Le lieu');
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = (url, label = T('↗ source')) => (url ? ` <a class="pm-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '');
    const srcLine = (txt, url) => `<p class="cplus-src pm-src">${esc(T('Source :'))} ${esc(txt)}${srcLink(url)}</p>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text: t, icon, size: 'small'}) : `<p class="muted">${esc(t)}</p>`);
    const wait = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const fmtKm = d => (d < 1 ? T('moins d’1 km') : T('{n} km', {n: String(Math.round(d))}));
    const more = (n, body) => `<details class="pm-more"><summary>${esc(T('plus ({n})', {n}))}</summary>${body}</details>`;
    const he = P => (P.gender === 'female' ? T('Elle') : P.gender === 'male' ? T('Il') : esc(P.first || T('Cette personne')));
    const listJoin = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' ' + T('et') + ' ' + a[a.length - 1] : a[0] || '');

    /* ─────────── les données livrées (lues une fois, à la demande) ─────────── */
    const FILES = {musique: 'pm-musique.json', parlers: 'pm-parlers.json', fontaines: 'pm-fontaines.json.gz', monuments: 'pm-monuments.json.gz', faune: 'pm-faune.json.gz', doleances: 'pm-doleances.json', ecoles: 'pm-ecoles.json.gz', communes: 'cc-communes.json.gz'};
    const loaded = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers compressés.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function data(name) {
        if (!loaded[name]) loaded[name] = fetch(`assets/data/${FILES[name]}?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (!r.ok) throw new Error(T('Fichier de données introuvable : {f}', {f: FILES[name]})); return readMaybeGz(r); })
            .then(d => (name === 'communes' ? communeIndex(d) : d)).catch(e => { delete loaded[name]; throw e; });
        return loaded[name];
    }
    const depName = async dep => { try { return ((await data('faune')).deps?.[dep] || [])[0] || dep; } catch (_) { return dep; } };
    async function placeOf(p) { if (!p) return null; const I = await data('communes'); return resolvePlace(I, p); }

    /* ═════════════ les parties d'un lieu ═════════════ */
    function mediaHtml(m) {
        const by = m.by ? ` · ${esc(m.by)}` : '';
        const tag = m.t === 'video' ? `<video class="pm-video" controls preload="none" src="${esc(FILEPATH(m.f))}"></video>` : `<audio class="pm-audio" controls preload="none" src="${esc(FILEPATH(m.f))}"></audio>`;
        return `<div class="pm-media">${tag}<small class="muted">${esc(m.lic)}${by} — ${link(COMMONS(m.f), T('fichier sur Commons ↗'))}</small></div>`;
    }
    const KIND_TXT = {danse: 'danse', instrument: 'instrument', chant: 'chant', musique: 'musique', tradition: 'tradition'};
    async function partMusique(pl, host) {
        const M = await data('musique'); const rows = musicFor(M, pl.dep); if (!rows.length) return false;
        const dn = await depName(pl.dep), regions = [...new Set(rows.flatMap(r => r.regions))].slice(0, 4);
        const names = rows.slice(0, 6).map(r => `<b>${esc(r.n)}</b>`);
        const li = r => `<li><b>${esc(r.n)}</b> <small class="muted">(${esc(T(KIND_TXT[r.k] || r.k))}${r.regions.length ? ` · ${esc(r.regions.join(', '))}` : ''})</small>${r.pci ? ` <span class="pm-badge">${esc(T('patrimoine immatériel de France'))}</span>` : ''}
            ${r.wp ? link(WP(r.wp), T('Wikipédia ↗')) : ''}${srcLink(WD(r.q))}${(r.media || []).map(mediaHtml).join('')}</li>`;
        host.innerHTML = `<p>${T('Dans son pays ({where}), on connaît {list}.', {where: esc(regions.length ? regions.join(', ') : dn), list: listJoin(names)})}</p>
            ${more(rows.length, `<ul class="pm-list">${rows.map(li).join('')}</ul>`)}
            ${srcLine(T('Wikidata (CC0) — le pays d’une danse ou d’un instrument est celui que dit Wikidata ; sons et vidéos : Wikimedia Commons, licence sous chacun'), 'https://www.wikidata.org/wiki/Q107357104')}`;
        return true;
    }
    async function partParler(pl, host) {
        const P = await data('parlers'); const near = parlersNear(P, pl.lat, pl.lon, 3, 60); if (!near.length) return false;
        const player = r => `<audio class="pm-audio" controls preload="none" src="${esc(P.sound_base + encodeURIComponent(r.file))}"></audio>`;
        const [a, ...rest] = near;
        host.innerHTML = `<p>${T('Le point d’enregistrement le plus proche : {p}, à {d}. On y lit la fable « La bise et le soleil » dans le parler de là-bas.', {p: `<b>${esc(a.name)}</b>`, d: esc(fmtKm(a.km))})}</p>${player(a)}
            ${rest.length ? more(rest.length, `<ul class="pm-list">${rest.map(r => `<li><b>${esc(r.name)}</b> <small class="muted">${esc(fmtKm(r.km))}</small>${player(r)}</li>`).join('')}</ul>`) : ''}
            <p class="cplus-src pm-src">${esc(T('Source :'))} ${esc(P.attr)} — ${link(P.licence_url, P.licence)}${srcLink(P.url)} · <small>${esc(T('Le son est écouté sur le site de l’Atlas : l’app ne le copie pas.'))}</small></p>`;
        return true;
    }
    async function partFontaines(pl, host) {
        const F = await data('fontaines'); const rows = fontainesNear(F, pl, 5); if (!rows.length) return false;
        const saint = r => (r.saint ? T('dédiée à {s}', {s: r.saint}) + (r.dom.length ? ` — ${T('patron(ne) des métiers : {d}', {d: r.dom.join(', ')})}` : '') : r.in_name ? T('le nom dit {s}', {s: r.in_name}) : '');
        const li = r => `<li><b>${esc(r.n)}</b>${r.kind === 'pelerinage' ? ` <span class="pm-badge">${esc(T('pèlerinage'))}</span>` : ''}${saint(r) ? ` <small class="muted">(${esc(saint(r))})</small>` : ''}${r.insee !== pl.insee && r.km != null ? ` <small class="muted">${esc(fmtKm(r.km))}</small>` : ''}${r.wp ? ' ' + link(WP(r.wp), T('Wikipédia ↗')) : ''}${srcLink(WD(r.q))}</li>`;
        const here = rows.filter(r => r.insee === pl.insee).length;
        const lead = here ? T(here > 1 ? '{n} fontaines saintes ou lieux de pèlerinage à {p}' : '{n} fontaine sainte ou lieu de pèlerinage à {p}', {n: `<b>${here}</b>`, p: esc(pl.name)}) + (rows.length > here ? ` ${T('et {n} tout près', {n: rows.length - here})}` : '')
            : T(rows.length > 1 ? '{n} fontaines saintes ou lieux de pèlerinage à moins de 5 km' : '{n} fontaine sainte ou lieu de pèlerinage à moins de 5 km', {n: `<b>${rows.length}</b>`});
        host.innerHTML = `<p>${lead} : ${esc(rows.slice(0, 3).map(r => r.n).join(', '))}.</p>${more(rows.length, `<ul class="pm-list">${rows.map(li).join('')}</ul>`)}
            ${srcLine(T('Wikidata (CC0) — fontaines à dévotion, sources et lieux de pèlerinage ; « patron des métiers » : propriété P2925 du saint'), 'https://www.wikidata.org/wiki/Q1371047')}`;
        return true;
    }
    async function partFilms(pl, host) {
        if (!pl.name) return false;
        host.innerHTML = wait(T('On cherche de vieux films de {p}…', {p: pl.name}));
        let r; try { r = await api('pm_films', {name: pl.name, insee: pl.insee || ''}); } catch (e) { r = {ok: false, message: e.message}; }
        if (!host.isConnected && !host.dataset.pmDetached) return false;
        if (!r?.ok) { if (r?.offline) { host.innerHTML = `<p class="cplus-off">📴 ${esc(T('Pas de connexion à Internet : les films s’afficheront quand tu seras connecté.'))}</p>`; return true; } host.innerHTML = ''; return false; }
        if (!r.items?.length) { host.innerHTML = ''; return false; }
        const card = (it, i) => `<figure class="cplus-img pm-film" data-pm-film="${i}"><button type="button" class="pm-film-play" data-pm-play="${i}" title="${esc(T('Regarder'))}">${it.thumb ? `<img loading="lazy" alt="" src="${esc(it.thumb)}" onerror="this.remove()">` : ''}<span>▶</span></button>
            <figcaption><b>${esc(it.year)}</b><span class="cplus-img-t">${esc(it.title)}</span><small>${esc(it.licence)}${it.by ? ` · ${esc(it.by)}` : ''}</small><small>${link(it.page, it.src === 'commons' ? T('Wikimedia Commons ↗') : T('Internet Archive ↗'))}</small></figcaption></figure>`;
        host.innerHTML = `<p>${esc(T('{n} films libres où paraît {p} (jusqu’en 1970).', {n: r.items.length, p: r.name}))}</p><div class="cplus-strip pm-films">${r.items.map(card).join('')}</div>
            <p class="cplus-src pm-src">${esc(T('Source :'))} ${r.sources.map(s => link(s.url, s.mention)).join(' · ')} — ${esc(T('seulement les films du domaine public ou sous licence libre ; la licence est écrite sous chacun.'))}${r.cached ? ` · <small>${esc(T('gardé sur l’ordinateur'))}</small>` : ''}${r.stale ? ` · <small class="cplus-stale">${esc(T('hors ligne : réponse gardée'))}</small>` : ''}</p>`;
        host._pmFilms = r.items;
        return true;
    }
    function playFilm(btn) {
        const host = btn.closest('[data-pm-body]') || btn.closest('.pm-part'); const it = (host?._pmFilms || [])[Number(btn.dataset.pmPlay)]; if (!it) return;
        const fig = btn.closest('figure');
        const player = it.src === 'commons' ? `<video class="pm-video" controls autoplay src="${esc(it.video)}"></video>` : `<iframe class="pm-video" src="${esc(it.embed)}" allow="fullscreen" loading="lazy" title="${esc(it.title)}"></iframe>`;
        btn.outerHTML = player; fig?.classList.add('is-playing');
    }
    async function partDoleances(pl, host) {
        if (!pl.insee) return false;
        const D = await data('doleances'); const d = doleancesOf(D, pl); if (!d) return false;
        const dn = await depName(pl.dep), out = [];
        d.ws.forEach(w => out.push(`<p>${T('Le cahier de doléances de {p} est transcrit et libre de lecture : {t}', {p: `<b>${esc(pl.name)}</b>`, t: link(w.url, '« ' + w.title + ' » ↗')})}</p><p class="muted"><small>${esc(T('Édition : {b}', {b: w.book}))}</small></p>`));
        if (d.ad) out.push(`<p>${T('Les cahiers de doléances du département ({d}) sont en ligne aux {s}.', {d: esc(dn), s: link(d.ad.url, d.ad.service + ' ↗')})}</p>`);
        out.push(`<p>${T('Chercher le cahier de {p} : {l}', {p: esc(pl.name), l: link(FA_SEARCH(`cahier de doléances ${pl.name}`), T('FranceArchives ↗'))})}${d.ws.length || d.ad ? '' : ` <small class="muted">${esc(T('(pas de transcription libre connue pour cette paroisse)'))}</small>`}</p>`);
        host.innerHTML = `<p class="pm-lead">${esc(T('Ce que son village demandait au roi en 1789.'))}</p>${out.join('')}
            ${srcLine(T('data.gouv.fr — « Principaux corpus d’archives numérisés et mis en ligne par les archives départementales » (Licence Ouverte 2.0) ; Wikisource (CC BY-SA)'), D.url)}`;
        return true;
    }
    async function partMonument(pl, host) {
        if (!pl.insee) return false;
        const MO = await data('monuments'); const rows = monumentsOf(MO, pl.insee); if (!rows.length) return false;
        const lille = id => (MO.lille_url && id ? MO.lille_url.replace('$1', encodeURIComponent(id)) : '');
        const fig = m => `<figure class="cplus-img pm-mon">${m.img ? `<a href="${esc(COMMONS(m.img))}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(m.name || T('Monument aux morts'))}" src="${esc(FILEPATH(m.img, 320))}" onerror="this.closest('figure').classList.add('is-noimg')"></a>` : ''}
            <figcaption><b>${esc(m.name || T('Monument aux morts de {p}', {p: pl.name}))}</b>${m.year ? `<span>${esc(T('élevé en {y}', {y: m.year}))}</span>` : ''}${m.creators.length ? `<span>${esc(T('par {c}', {c: m.creators.join(', ')}))}</span>` : ''}
            <small>${srcLink(WD(m.q), T('↗ Wikidata'))}${lille(m.lille) ? ` · ${link(lille(m.lille), T('base de Lille ↗'))}` : ''}${m.img ? ` · ${esc(T('photo : Wikimedia Commons'))}` : ''}</small></figcaption></figure>`;
        const m0 = rows[0];
        const lead = rows.length > 1 ? T('{n} monuments aux morts à {p}.', {n: rows.length, p: esc(pl.name)}) : T('Le monument aux morts de {p}{y}{c}.', {p: esc(pl.name), y: m0.year ? ' ' + esc(T('a été élevé en {y}', {y: m0.year})) : '', c: m0.creators.length ? ', ' + esc(T('par {c}', {c: m0.creators.join(', ')})) : ''});
        host.innerHTML = `<p>${lead}</p><div class="cplus-strip">${rows.map(fig).join('')}</div>
            ${srcLine(T('Wikidata (CC0) ; photos : Wikimedia Commons (licence sur la page du fichier) ; base « Monuments aux morts » de l’Université de Lille (lien seulement)'), WD(m0.q))}`;
        return true;
    }
    const SP = {loup: ['🐺', 'loups', 'loup'], ours: ['🐻', 'ours', 'ours'], castor: ['🦫', 'castors', 'castor'], lynx: ['🐈', 'lynx', 'lynx']};
    function decadeBars(dec) {
        const ks = Object.keys(dec).map(Number).sort((a, b) => a - b); if (!ks.length) return '';
        const max = Math.max(...ks.map(k => dec[k]));
        return `<ul class="pm-bars">${ks.map(k => `<li><span>${k}</span><i style="width:${Math.max(2, Math.round(dec[k] / max * 100))}%"></i><small>${dec[k]}</small></li>`).join('')}</ul>`;
    }
    async function partFaune(pl, host) {
        if (!pl.dep) return false;
        const FA = await data('faune'); const rows = faunaOf(FA, pl.dep); if (!rows.length) return false;
        const dn = (FA.deps[pl.dep] || [])[0] || pl.dep;
        const ord = ['loup', 'ours', 'lynx', 'castor'], sorted = rows.slice().sort((a, b) => ord.indexOf(a.sp) - ord.indexOf(b.sp));
        const line = r => `<p>${SP[r.sp][0]} ${T(r.n > 1 ? '{s} : {n} mentions de {a} à {b} ; la dernière en {b}.' : '{s} : une mention, en {b}.', {s: `<b>${esc(T(SP[r.sp][1]).replace(/^./, c => c.toUpperCase()))}</b>`, n: r.n, a: r.first, b: r.last})}</p>`;
        const cites = [...new Set(rows.flatMap(r => Object.keys(r.ds)))].map(i => FA.datasets[i]).filter(Boolean);
        host.innerHTML = `<p class="pm-lead">${esc(T('Dans le département ({d}) :', {d: dn}))}</p>${sorted.map(line).join('')}
            ${more(T('par décennie'), sorted.map(r => `<p><b>${esc(T(SP[r.sp][1]))}</b></p>${decadeBars(r.dec)}`).join(''))}
            <p class="cplus-src pm-src">${esc(T('Source :'))} ${cites.map(c => `${esc(c.citation || c.title)} (${esc(c.licence)})${srcLink(c.doi ? `https://doi.org/${c.doi}` : `https://www.gbif.org/dataset/${c.key}`)}`).join(' · ')}<br><small>${esc(T(FA.note))}</small></p>`;
        return true;
    }
    const RENDER = {musique: partMusique, parler: partParler, fontaines: partFontaines, films: partFilms, doleances: partDoleances, monument: partMonument, faune: partFaune};
    /** une partie dans un hôte ; false = rien pour ce lieu (l'hôte reste vide) */
    async function renderPart(id, place, host) {
        try {
            const pl = place?.insee !== undefined && place?.dep !== undefined ? place : await placeOf(place);
            if (!pl) { host.innerHTML = ''; return false; }
            const ok = await RENDER[id](pl, host);
            if (!ok) host.innerHTML = '';
            return !!ok;
        } catch (e) { console.error(e); host.innerHTML = ''; return false; }
    }

    /* ─────────── la fiche d'un village : les parties allumées, dans le style des voisines ─────────── */
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    async function placeInto(host, place, opts = {}) {
        const pl = await placeOf(place); if (!pl || !host) return null;
        const ids = (opts.parts || PLACE_PARTS.map(p => p[0])).filter(id => opts.force || on(id));
        host.innerHTML = ids.map(id => { const P = PARTS.find(x => x[0] === id); return `<section class="maintenance-panel cplus-panel pm-panel" data-pm-part="${id}" hidden><h3>${P[1]} ${esc(T(P[2]))}</h3><div class="pm-part" data-pm-body></div></section>`; }).join('');
        host.classList.add('pm-place');
        await Promise.all(ids.map(async id => {
            const sec = host.querySelector(`[data-pm-part="${id}"]`), body = sec?.querySelector('[data-pm-body]'); if (!body) return;
            if (opts.detached) body.dataset.pmDetached = '1';
            const ok = await renderPart(id, pl, body);
            if (ok) sec.hidden = false; else sec.remove();
        }));
        return pl;
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'pm_place', host: '[data-pm-host]', icon: '🏡', label: 'Pays et mémoire', group: 'Son histoire'});
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-pm])');
        if (village) {
            village.dataset.pm = '1';
            const place = villagePlace(village); if (!place.id && !place.insee) return;
            const anchor = village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
            const box = '<div class="pm-place" data-pm-host></div>';
            if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
            placeInto(village.querySelector('[data-pm-host]'), place);
        }
        decorateMpf();
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── la monographie : une partie par donnée (heritage-monographie-plus.js) ─────────── */
    (ext.monographSections = ext.monographSections || []).push(...PLACE_PARTS.map(([id, icon, label, , group]) => ({
        id: `pm_${id}`, icon, label: T(label), group, defaultOn: true, enabled: () => on(id),
        render: async (place, host) => { host.classList.add('pm-part'); if (id === 'films') host.dataset.pmDetached = '1'; return renderPart(id, {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''}, host); },
    })));

    /* ═════════════ la fiche : des lignes dans « 🏘 Le lieu à son époque » ═════════════ */
    const details = new Map();
    (ext.afterPerson = ext.afterPerson || []).push(detail => { const id = Number(detail?.person?.id); if (id) details.set(id, detail); });
    const row = (icon, html, src, url, extra = '') => `<div class="hist-row pm-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${esc(src)}${srcLink(url)}</small>` : ''}</div></div>`;
    const evYear = e => Number(e.year) || Number(String(e.sort_date || '').slice(0, 4)) || null;
    /** sa vie : prénom, nom, naissance, décès, et les lieux (en France) avec leur commune */
    async function lifeOf(detail) {
        const p = detail.person || {}, evs = detail.events || [];
        const pick = tags => evs.find(e => tags.includes(String(e.gedcom_tag || '').toUpperCase()) && (evYear(e) || e.place_name));
        const b = pick(['BIRT', 'BAPM', 'CHR']), d = pick(['DEAT', 'BURI']);
        const I = await data('communes');
        const at = e => (e ? resolvePlace(I, {name: e.place_name, lat: e.precise_lat || e.latitude, lon: e.precise_lon || e.longitude, country: e.country}) : null);
        const places = [];
        for (const e of evs) { const pl = at(e); if (pl?.insee && !places.some(x => x.insee === pl.insee)) places.push({...pl, tag: String(e.gedcom_tag || '').toUpperCase(), year: evYear(e)}); }
        return {id: Number(p.id), first: String(p.first_name || '').trim(), last: String(p.last_name || '').trim(), gender: p.gender || '', birth: b ? evYear(b) : Number(p.birth_year) || null, death: d ? evYear(d) : Number(p.death_year) || null,
            birthPlace: at(b), deathPlace: at(d), places};
    }
    async function personLines(detail) {
        const L = await lifeOf(detail), P = {first: L.first, gender: L.gender}, out = [];
        const bp = L.birthPlace?.insee ? L.birthPlace : L.places[0] || null;
        const safe = async f => { try { const r = await f(); if (r) out.push(r); } catch (e) { console.error(e); } };
        await safe(async () => { // 💃
            if (!bp?.dep) return '';
            const M = await data('musique'), rows = musicFor(M, bp.dep).filter(r => r.regions.length); if (!rows.length) return '';
            const regions = [...new Set(rows.flatMap(r => r.regions))].slice(0, 2);
            const top = rows.slice(0, 3).map(r => `<b>${esc(r.n)}</b>`);
            return row('💃', T('Dans son pays ({r}), on connaissait {l}.', {r: esc(regions.join(', ')), l: listJoin(top)}), T('Wikidata (CC0)'), WD(rows[0].q),
                rows.length > 3 || rows.some(r => r.media?.length) ? more(rows.length, `<ul class="pm-list">${rows.map(r => `<li>${esc(r.n)} <small class="muted">(${esc(T(KIND_TXT[r.k] || r.k))})</small>${srcLink(WD(r.q))}${(r.media || []).slice(0, 1).map(mediaHtml).join('')}</li>`).join('')}</ul>`) : '');
        });
        await safe(async () => { // 🎙️
            if (bp?.lat == null) return '';
            const Pp = await data('parlers'), n = parlersNear(Pp, bp.lat, bp.lon, 1, 40)[0]; if (!n) return '';
            return row('🎙️', T('Écoute le parler de son coin : {p}, à {d} de {b}.', {p: `<b>${esc(n.name)}</b>`, d: esc(fmtKm(n.km)), b: esc(bp.name)}), T('Atlas sonore des langues régionales de France (CNRS-LISN, CC BY-NC-SA 4.0)'), Pp.url,
                `<audio class="pm-audio" controls preload="none" src="${esc(Pp.sound_base + encodeURIComponent(n.file))}"></audio>`);
        });
        await safe(async () => { // 🐺
            if (!bp?.dep || !L.birth) return '';
            const FA = await data('faune'), w = wolfLine(FA, bp.dep, L.birth); if (!w) return '';
            const c = FA.datasets[Object.keys(FA.rows.find(r => r.sp === 'loup' && r.dep === bp.dep).ds).sort((a, b) => Number(a) - Number(b))[0]] || FA.datasets[0];
            const txt = w.still ? T(L.gender === 'female' ? 'Quand elle est née, il y avait encore des loups dans son département ({d} : dernière mention en {y}).' : 'Quand il est né, il y avait encore des loups dans son département ({d} : dernière mention en {y}).', {d: esc(w.depName), y: w.last})
                : T('Les derniers loups de son département ({d}) sont mentionnés en {y}, avant sa naissance.', {d: esc(w.depName), y: w.last});
            return row('🐺', txt, `${c.title} — INPN, GBIF (${c.licence})`, c.doi ? `https://doi.org/${c.doi}` : 'https://www.gbif.org/');
        });
        await safe(async () => { // 🪦
            const war = L.death && ((L.death >= 1914 && L.death <= 1919) || (L.death >= 1939 && L.death <= 1945)) && (!L.birth || (L.death - L.birth >= 16 && L.death - L.birth <= 55));
            if (!war) return '';
            const MO = await data('monuments');
            const cand = [L.birthPlace, ...L.places].filter(x => x?.insee).filter((x, i, a) => a.findIndex(y => y.insee === x.insee) === i);
            const hit = cand.map(pl => ({pl, m: monumentsOf(MO, pl.insee)[0]})).find(x => x.m); if (!hit) return '';
            return row('🪦', T('Mort pendant la guerre : son nom est peut-être gravé sur le monument aux morts de {p}{y}.', {p: `<b>${esc(hit.pl.name)}</b>`, y: hit.m.year ? ` (${esc(T('élevé en {y}', {y: hit.m.year}))})` : ''}), T('Wikidata (CC0)'), WD(hit.m.q),
                hit.m.img ? `<a href="${esc(COMMONS(hit.m.img))}" target="_blank" rel="noopener noreferrer"><img class="pm-thumb" loading="lazy" alt="" src="${esc(FILEPATH(hit.m.img, 240))}" onerror="this.remove()"></a>` : '');
        });
        await safe(async () => { // 🎓
            if (!L.birth || L.birth > 1960) return '';
            const E = await data('ecoles'), m = ecolesMatch(E, L.first, L.last, L.birth); if (!m.length) return '';
            const x = m[0];
            return row('🎓', T('Peut-être {p} : Wikidata connaît {n}, né(e) en {b}{w}, ancien(ne) élève de {s}{e}.', {p: he(P).toLowerCase() === 'il' ? T('lui') : he(P).toLowerCase() === 'elle' ? T('elle') : T('cette personne'), n: `<b>${esc(x.name)}</b>`, b: x.birth, w: x.birthplace ? ` ${T('à {l}', {l: esc(x.birthplace)})}` : '', s: esc(x.school.n || ''), e: x.start ? ` ${T('(entré en {y})', {y: x.start})}` : ''}),
                T('Wikidata (CC0) — même nom, même prénom, né(e) à un an près : compare avec tes actes'), WD(x.q));
        });
        await safe(async () => { // 📜
            if (!L.birth || L.birth > 1789 || (L.death && L.death < 1789)) return '';
            const pl = L.places.find(x => x.year && x.year <= 1795) || bp; if (!pl?.insee) return '';
            const D = await data('doleances'), d = doleancesOf(D, pl); if (!d) return '';
            const ws = d.ws[0];
            if (ws) return row('📜', T('En 1789, sa paroisse ({p}) a écrit son cahier de doléances : il est transcrit, {l}.', {p: esc(pl.name), l: link(ws.url, T('le lire sur Wikisource ↗'))}), 'Wikisource (CC BY-SA)', ws.url);
            return row('📜', T('En 1789, sa paroisse ({p}) a écrit ce qu’elle demandait au roi : {l}.', {p: esc(pl.name), l: d.ad ? link(d.ad.url, T('les cahiers du département aux Archives ↗')) : link(FA_SEARCH(`cahier de doléances ${pl.name}`), T('le chercher sur FranceArchives ↗'))}),
                d.ad ? T('data.gouv.fr — corpus numérisés des archives départementales (Licence Ouverte)') : 'FranceArchives', d.ad ? D.url : FA_SEARCH(`cahier de doléances ${pl.name}`));
        });
        return {life: L, html: out.join('')};
    }
    async function histoireAfter(host) {
        if (!on('person') || !host?.isConnected) return;
        const pid = Number(host.dataset.histLife); if (!pid) return;
        let detail = details.get(pid);
        if (!detail) { try { detail = await api('person', {id: pid}); details.set(pid, detail); } catch (_) { return; } }
        if (detail?.person?.kind === 'animal') return;
        const {html} = await personLines(detail);
        if (!host.isConnected || !html) return;
        host.querySelector('[data-pm-hist]')?.remove();
        // une fiche « rien à dire » : on enlève la petite boîte vide d'avant
        if (host.children.length === 1 && host.firstElementChild?.matches?.('.empty-state, .ui-empty')) host.innerHTML = '';
        host.insertAdjacentHTML('beforeend', `<div class="pm-hist" data-pm-hist>${html}</div>`);
    }
    (ext.histoireAfter = ext.histoireAfter || []).push(histoireAfter);

    /* 🪦 sous « Peut-être dans Morts pour la France » (heritage-bases-officielles.js) : le monument de sa commune */
    function decorateMpf() {
        document.querySelectorAll('.bo-person[data-bo-person] .bo-hit[data-bo-base="mpf"]:not([data-pm-mpf])').forEach(async hit => {
            hit.dataset.pmMpf = '1'; if (!on('monument')) return;
            const pid = Number(hit.closest('[data-bo-person]').dataset.boPerson), detail = details.get(pid); if (!detail) return;
            try {
                const L = await lifeOf(detail), MO = await data('monuments');
                const cand = [L.birthPlace, L.deathPlace, ...L.places].filter(x => x?.insee).filter((x, i, a) => a.findIndex(y => y.insee === x.insee) === i);
                const x = cand.map(pl => ({pl, m: monumentsOf(MO, pl.insee)[0]})).find(y => y.m); if (!x || !hit.isConnected) return;
                hit.insertAdjacentHTML('beforeend', `<p class="pm-mpf">🪦 ${T('Son nom est peut-être sur le monument aux morts de {p}.', {p: `<b>${esc(x.pl.name)}</b>`})}${srcLink(WD(x.m.q), T('↗ voir le monument (Wikidata)'))}</p>`);
            } catch (e) { console.error(e); }
        });
    }

    /* ═════════════ 🔎 Où chercher : les registres des grandes écoles et les cahiers (liens seulement) ═════════════
     * Les adresses : site officiel de chaque école lu sur Wikidata (P856) le 25/11/2026 ; FranceArchives : page de recherche vérifiée. */
    const SO40_SITES = [
        {key: 'polytechnique', group: 'ecoles', country: 'France', icon: '🎓', label: 'École polytechnique — bibliothèque (registres matricules des élèves, « famille polytechnicienne »)', home: 'https://www.polytechnique.edu/', years: [1794, 1950], copy: 'name',
            rel: {countries: ['fr'], from: 1794, to: 1990, base: 0.6, profiles: ['officer', 'inventor'], why: () => T('Ingénieur ou officier ? Les registres des élèves de l’École polytechnique (depuis 1794) se consultent à sa bibliothèque')}},
        {key: 'saint_cyr', group: 'ecoles', country: 'France', icon: '⚔️', label: 'Saint-Cyr — École spéciale militaire (registres des élèves officiers)', home: 'http://www.st-cyr.terre.defense.gouv.fr/', years: [1802, 1950], copy: 'name',
            rel: {countries: ['fr'], from: 1802, to: 1990, base: 0.6, profiles: ['officer'], require: ['profile'], why: () => T('Officier ? Les registres des élèves de Saint-Cyr (depuis 1802) : au Service historique de la Défense')}},
        {key: 'ens', group: 'ecoles', country: 'France', icon: '📚', label: 'École normale supérieure — archives et annuaire des anciens élèves', home: 'https://www.ens.psl.eu/', years: [1794, 1950], copy: 'name',
            rel: {countries: ['fr'], from: 1794, to: 1990, base: 0.4, why: () => T('Professeur ou savant ? Les archives de l’École normale supérieure gardent les dossiers des élèves')}},
        {key: 'doleances', group: 'ecoles', country: 'France', icon: '📜', label: 'FranceArchives — cahiers de doléances de 1789 de sa paroisse', home: 'https://francearchives.gouv.fr/', where: ['fiche', 'lieu'],
            search: '', rel: {countries: ['fr'], from: 1700, to: 1789, base: 0.5, why: () => T('Vivant en 1789 : le cahier de doléances de sa paroisse dit ce que le village demandait au roi')}},
    ];
    root.LCNDA_SO40 = root.LCNDA_SO40 || {
        GROUPS: [{id: 'ecoles', icon: '🎓', label: 'Grandes écoles et 1789', country: 'France'}], SITES: SO40_SITES,
        site: k => SO40_SITES.find(s => s.key === k) || null,
        url: (key, p = {}) => { const s = SO40_SITES.find(x => x.key === key); if (!s) return ''; if (key === 'doleances' && p.place) return FA_SEARCH(`cahier de doléances ${String(p.place).split(',')[0]}`); return s.home; },
        copyText: (key, p = {}) => [String(p.last || '').toUpperCase(), String(p.first || '').split(/\s+/)[0]].filter(Boolean).join(' '),
        paidBadge: () => null, isFree: () => true, forPlace: where => SO40_SITES.filter(s => !where || (s.where || ['fiche']).includes(where)),
    };

    /* ═════════════ 🧰 le registre commun : à la demande ═════════════ */
    const ctxPlace = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, country: pl.country || ''} : null);
    (ext.dataSources = ext.dataSources || []).push(...PLACE_PARTS.map(([id, icon, label]) => ({id: `pm_${id}`, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, online: id === 'films',
        run: async (ctx, host) => { const pl = ctxPlace(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
            host.innerHTML = '<div class="pm-part" data-pm-detached="1"></div>'; const ok = await renderPart(id, pl, host.firstElementChild);
            if (!ok) host.innerHTML = emptyLine(T('Rien de connu pour ce lieu (il faut une commune de France).'), icon); return ok; }})),
    {id: 'pm_personne', icon: '🏡', label: T('Son pays : danse, parler, loups, monument, écoles, 1789'), group: 'La personne', needs: ['person'], installed: () => true,
        run: async (ctx, host) => { const id = Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
            const detail = details.get(id) || await api('person', {id}); const {html} = await personLines(detail);
            host.innerHTML = html ? `<div class="hist-life pm-hist">${html}</div>` : emptyLine(T('Rien à dire : il faut un lieu de naissance en France et des dates.'), '🏡'); return !!html; }});

    /* ═════════════ 📋 Listes (moteur commun, LCNDA_EXT.dataLists) ═════════════ */
    const openUrl = r => { if (r.url) window.open(r.url, '_blank', 'noopener'); };
    const geo = r => (r.lat != null && r.lon != null ? [r.lat, r.lon] : null);
    const communeName = async insee => { try { return ((await data('communes')).c[insee] || [])[0] || ''; } catch (_) { return ''; } };
    const DEPF = {key: 'dep', label: T('Département'), type: 'enum'}, SRCF = {key: 'url', label: T('Source'), type: 'url'};
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'pm_musique', icon: '💃', label: T('Musique et danses des pays de France'), group: 'Le lieu', source: 'Wikidata (CC0) ; Wikimedia Commons', sourceUrl: 'https://www.wikidata.org/wiki/Q107357104',
            load: async () => { const M = await data('musique'), FA = await data('faune'); return M.rows.map(r => ({name: r.n, sorte: r.k, regions: r.regions.join(', '), departements: r.deps.map(d => (FA.deps[d] || [d])[0]).join(', '), pci: r.pci ? 'oui' : 'non', son: r.media.length ? 'oui' : 'non', url: WD(r.q)})); },
            open: openUrl, period: () => null,
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'sorte', label: T('Sorte'), type: 'enum', values: ['danse', 'instrument', 'chant', 'musique', 'tradition']}, {key: 'regions', label: T('Pays, région'), type: 'text'}, {key: 'departements', label: T('Départements'), type: 'text'},
                {key: 'pci', label: T('Patrimoine immatériel'), type: 'enum', values: ['oui', 'non']}, {key: 'son', label: T('Son ou vidéo libre'), type: 'enum', values: ['oui', 'non']}, SRCF]},
        {id: 'pm_parlers', icon: '🎙️', label: T('Atlas sonore : points d’enregistrement'), group: 'Le lieu', source: 'Atlas sonore des langues régionales de France, CNRS-LISN (CC BY-NC-SA 4.0)', sourceUrl: 'https://atlas.lisn.upsaclay.fr/',
            load: async () => { const P = await data('parlers'); return P.rows.map(r => ({name: r[0], groupe: r[4], lat: r[1], lon: r[2], son: P.sound_base + encodeURIComponent(r[3]), url: P.url})); },
            geo, open: r => window.open(r.son, '_blank', 'noopener'), period: () => null,
            fields: [{key: 'name', label: T('Point'), type: 'text'}, {key: 'groupe', label: T('Carte de l’Atlas'), type: 'enum'}, {key: 'son', label: T('Écouter (site de l’Atlas)'), type: 'url'}, SRCF]},
        {id: 'pm_fontaines', icon: '⛲', label: T('Fontaines saintes et lieux de pèlerinage'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q1371047',
            load: async () => { const F = await data('fontaines'), I = await data('communes'); return F.rows.map(r => ({name: r.n, sorte: r.kind === 'pelerinage' ? 'lieu de pèlerinage' : 'fontaine', saint: r.saint || r.in_name, invoque: r.dom.join(', '), commune: (I.c[r.insee] || [''])[0], insee: r.insee, dep: depOf(r.insee), lat: r.lat, lon: r.lon, url: WD(r.q)})); },
            geo, open: openUrl, period: () => null,
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'sorte', label: T('Sorte'), type: 'enum', values: ['fontaine', 'lieu de pèlerinage']}, {key: 'saint', label: T('Saint'), type: 'text'}, {key: 'invoque', label: T('Patron de'), type: 'text'},
                {key: 'commune', label: T('Commune'), type: 'place'}, DEPF, {key: 'insee', label: T('Code INSEE'), type: 'text'}, SRCF]},
        {id: 'pm_monuments', icon: '🪦', label: T('Monuments aux morts'), group: 'Le lieu', source: 'Wikidata (CC0) ; photos Wikimedia Commons', sourceUrl: 'https://www.wikidata.org/wiki/Q575759',
            load: async () => { const MO = await data('monuments'), I = await data('communes'); return MO.rows.map(r => ({name: r[4] || T('Monument aux morts de {p}', {p: (I.c[r[1]] || [''])[0]}), commune: (I.c[r[1]] || [''])[0], insee: r[1], dep: depOf(r[1]), annee: r[6] || null, sculpteur: (r[7] || []).map(i => (MO.creators[i] || [])[1]).join(', '), photo: r[5] ? 'oui' : 'non', lat: r[2], lon: r[3], image: r[5] ? FILEPATH(r[5], 240) : '', url: WD('Q' + r[0])})); },
            geo, open: openUrl, period: r => (r.annee ? [r.annee, r.annee] : null),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, DEPF, {key: 'insee', label: T('Code INSEE'), type: 'text'}, {key: 'annee', label: T('Élevé en'), type: 'year'}, {key: 'sculpteur', label: T('Sculpteur'), type: 'text'},
                {key: 'photo', label: T('Photo'), type: 'enum', values: ['oui', 'non']}, {key: 'image', label: T('Image'), type: 'image'}, SRCF]},
        {id: 'pm_faune', icon: '🐺', label: T('Loups et bêtes sauvages par département'), group: 'Le lieu', source: 'GBIF — Répartition historique du loup en France métropolitaine (INPN, CC BY 4.0) et autres jeux', sourceUrl: 'https://doi.org/10.15468/dosqyf',
            load: async () => { const FA = await data('faune'); return FA.rows.map(r => ({espece: r.sp, dep: r.dep, departement: (FA.deps[r.dep] || [r.dep])[0], premiere: r.first, derniere: r.last, mentions: r.n, lat: (FA.deps[r.dep] || [])[1], lon: (FA.deps[r.dep] || [])[2], url: `https://www.gbif.org/occurrence/search?country=FR&taxon_key=${FA.species[r.sp].key}`})); },
            geo, open: openUrl, period: r => [r.premiere, r.derniere],
            fields: [{key: 'espece', label: T('Bête'), type: 'enum', values: ['loup', 'ours', 'lynx', 'castor']}, {key: 'departement', label: T('Département'), type: 'text'}, DEPF, {key: 'premiere', label: T('Première mention'), type: 'year'}, {key: 'derniere', label: T('Dernière mention'), type: 'year'}, {key: 'mentions', label: T('Mentions'), type: 'number'}, SRCF]},
        {id: 'pm_doleances', icon: '📜', label: T('Cahiers de doléances de 1789 en ligne'), group: 'Chercher', source: 'data.gouv.fr (Licence Ouverte 2.0) ; Wikisource (CC BY-SA)', sourceUrl: 'https://www.data.gouv.fr/datasets/principaux-corpus-darchives-numerises-et-mis-en-ligne-par-les-archives-departementales',
            load: async () => { const D = await data('doleances'); return [...D.wikisource.map(w => ({ou: w.commune, dep: depOf(w.insee), sorte: 'transcription (Wikisource)', service: w.book, url: w.url})), ...D.deps.map(d => ({ou: d.name, dep: d.dep, sorte: 'cahiers du département (archives)', service: d.service, url: d.url}))]; },
            open: openUrl, period: () => [1789, 1789],
            fields: [{key: 'ou', label: T('Paroisse ou département'), type: 'text'}, DEPF, {key: 'sorte', label: T('Sorte'), type: 'enum', values: ['transcription (Wikisource)', 'cahiers du département (archives)']}, {key: 'service', label: T('Où'), type: 'text'}, SRCF]},
        {id: 'pm_ecoles', icon: '🎓', label: T('Anciens élèves des grandes écoles (Wikidata)'), group: 'La personne', source: 'Wikidata (CC0) — P69', sourceUrl: 'https://www.wikidata.org/wiki/Property:P69',
            load: async () => { const E = await data('ecoles'); return E.rows.map(r => ({name: r[1], naissance: r[2], ecole: (E.schools[r[3]] || {}).n || '', entree: r[4] || null, lieu: r[5], url: WD('Q' + r[0])})); },
            open: openUrl, period: r => [r.naissance, r.naissance],
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'naissance', label: T('Né(e) en'), type: 'year'}, {key: 'ecole', label: T('École'), type: 'enum'}, {key: 'entree', label: T('Entrée'), type: 'year'}, {key: 'lieu', label: T('Lieu de naissance'), type: 'text'}, SRCF]},
        {id: 'pm_films', icon: '🎞️', label: T('Films d’archives libres (gardés)'), group: 'Le lieu', source: 'Wikimedia Commons ; Internet Archive (domaine public ou licence libre)', sourceUrl: 'https://commons.wikimedia.org/', online: true,
            query: async query => { const r = await api('pm_list_films', {query: JSON.stringify(query || {})}); return {rows: r.rows || [], total: r.total || 0, message: r.message || ''}; },
            open: openUrl, period: r => [r.annee, r.annee],
            fields: [{key: 'titre', label: T('Titre'), type: 'text'}, {key: 'annee', label: T('Année'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'text'}, {key: 'source', label: T('Site'), type: 'enum', values: ['Wikimedia Commons', 'Internet Archive']}, {key: 'licence', label: T('Licence'), type: 'text'}, {key: 'auteur', label: T('Auteur'), type: 'text'}, SRCF]});

    /* ═════════════ Réglages → 🏡 Pays et mémoire ═════════════ */
    const ABOUT = [
        ['Wikidata', 'https://www.wikidata.org/', 'danses, instruments, chants ; fontaines et saints ; monuments aux morts ; anciens élèves des grandes écoles', 'CC0 1.0', 'Wikidata', 'pm-musique.json, pm-fontaines.json.gz, pm-monuments.json.gz, pm-ecoles.json.gz'],
        ['Wikimedia Commons', 'https://commons.wikimedia.org/', 'sons, vidéos et photos (montrés depuis Commons) ; vieux films de la commune (en ligne)', T('licence libre de chaque fichier'), 'Wikimedia Commons', ''],
        ['Atlas sonore des langues régionales de France', 'https://atlas.lisn.upsaclay.fr/', 'points d’enregistrement de « La bise et le soleil » (nom, position, fichier son)', 'CC BY-NC-SA 4.0', 'P. Boula de Mareüil, A. Rilliard, F. Vernier — CNRS, LISN', 'pm-parlers.json'],
        ['GBIF — Répartition historique du loup en France métropolitaine', 'https://doi.org/10.15468/dosqyf', 'mentions de loups (et ours, castors, lynx d’autres jeux) par département et décennie', 'CC BY 4.0', 'INPN, UAR PatriNat (OFB-MNHN-CNRS-IRD), via GBIF.org', 'pm-faune.json.gz'],
        ['data.gouv.fr — corpus numérisés des archives départementales', 'https://www.data.gouv.fr/datasets/principaux-corpus-darchives-numerises-et-mis-en-ligne-par-les-archives-departementales', 'départements dont les cahiers de doléances sont en ligne', 'Licence Ouverte 2.0', 'data.gouv.fr', 'pm-doleances.json'],
        ['Wikisource', 'https://fr.wikisource.org/', 'transcriptions de cahiers de doléances (lien)', 'CC BY-SA 4.0', 'Wikisource', 'pm-doleances.json'],
        ['Internet Archive', 'https://archive.org/details/movies', 'vieux films du domaine public ou sous licence libre (en ligne)', T('domaine public ou licence libre'), 'Internet Archive', ''],
        ['Université de Lille — Monuments aux morts', 'https://www.wikidata.org/wiki/Property:P6238', T('liens seulement (le site n’a pas pu être ouvert pour lire sa licence)'), '—', 'Université de Lille', ''],
        ['FranceArchives', 'https://francearchives.gouv.fr/', T('liens de recherche seulement'), '—', 'Service interministériel des Archives de France', '']];
    async function clearCache() {
        try {
            const res = await post('pm_cache_clear', {}); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('pm_cache_restore', {token: res.token}); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {cache: {count: 0, bytes: 0}};
        try { about = await api('pm_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-pm-settings]')) return;
        const s = settings();
        const tg = ([k, icon, label, sub]) => `<label class="checkbox-line cplus-tg" data-pm-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${icon} ${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = ABOUT.map(x => `<tr><td>${link(x[1], x[0])}</td><td>${esc(T(x[2]))}</td><td>${esc(x[5] ? T('dans l’app') : T('en ligne'))}${x[5] ? `<br><small class="muted">${esc(x[5])}</small>` : ''}</td><td>${esc(x[3])}</td><td>${esc(x[4])}</td></tr>`).join('');
        const kb = Math.max(1, Math.round((about.cache?.bytes || 0) / 1024));
        ws.innerHTML = `<section class="page cplus-settings pm-settings" data-pm-settings>${UI().pageHeader ? UI().pageHeader({title: T('Pays et mémoire'), icon: '🏡', where: T('Réglages · Données'), help: esc(T('La musique et les danses du pays, le parler du coin, les fontaines des saints, les vieux films, les cahiers de 1789, le monument aux morts, les loups, les grandes écoles.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les films viennent d’Internet, une fois par commune : {n} réponses gardées ({k} Ko).', {n: about.cache?.count || 0, k: kb}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-pm-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Pas de transcription libre des cahiers de doléances en dehors de Wikisource ; les registres de Polytechnique, Saint-Cyr et de l’ENS ne sont pas en données ouvertes : l’app donne seulement les liens (Où chercher).'))}</p>
                <p class="muted">${esc(T('Ce qui part sur Internet : le nom de la commune (films). Les sons et photos sont lus sur Wikimedia Commons et sur le site de l’Atlas sonore. Jamais de nom de personne.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const tabs = A().defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'metiers_rivieres'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    document.addEventListener('click', e => {
        const pb = e.target.closest?.('[data-pm-play]'); if (pb) { e.preventDefault(); playFilm(pb); return; }
        if (e.target.closest?.('[data-pm-clear]')) clearCache();
    });
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-pm-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.pmTg] = e.target.checked; save(s); } });

    ext.paysMemoire = {...core, data, settings, renderPart, placeInto, personLines, histoireAfter, decorate, PARTS, openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
