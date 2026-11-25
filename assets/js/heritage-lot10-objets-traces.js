/**
 * LCNDA — 🔔 Objets et traces : ce qui reste de sa vie et de son village dans les cloches, les musées, les herbiers, les plaques,
 * les contes, les couvents, les pèlerinages et les hospices (lot 10).
 * Livré avec l'app (assets/data/l10o-*.json.gz, refaits par scripts/lot10-objets-traces/*.py, lus à la demande) :
 *   🎻 l10o-folklore     contes et chansons recueillis par Luzel, Sébillot, Bladé, Carnoy, George Sand, La Villemarqué (Wikisource,
 *                        domaine public) : titre, recueil, la phrase « Conté par …, de … » et la commune quand le texte la donne
 *   🕯️ l10o-pelerinages  lieux de pèlerinage, sanctuaires, pardons, basiliques mineures (Wikidata, CC0)
 * Déjà dans l'app et RÉUTILISÉ (rien en double) : ⛪ couvents et 🏥 hospices, hôpitaux, asiles = ha-institutions (🧭 Histoire autour,
 *   Wikidata) ; 🗞️ les journaux de sa ville = « 🌍 Monde et coutumes » (BnF) ; 🖼️ les tableaux et photos du village = « Ton village
 *   au musée » et « Voir son village » (ici : seulement les OBJETS — outils, costumes, ex-voto) ; ⛲ fontaines et pèlerinages tout près
 *   de la commune = « 🏡 Pays et mémoire » (ici : la région, à 50 km).
 * En ligne, à la demande, gardé (lib/lot10_objets_traces.php ; jamais pour une fiche vivante ou confidentielle ; aucun nom de
 *   personne n'est envoyé) : 🔔 inscriptions des cloches (pack « Patrimoine » installé + POP), 🧺 objets de Joconde (POP),
 *   🌿 spécimens d'herbier (GBIF, CC0 / CC BY), 🪧 plaques et stèles (OpenStreetMap, ODbL).
 * Où : fiche d'une personne, bloc « 🔔 Objets et traces » (une phrase par sujet, le détail sous « ▸ plus ») ; fiche d'un village
 *   et Monographie de commune ; Listes (LCNDA_EXT.dataLists) ; Cartes (mapLayerSources : 🕯️, 🎻) ; à la demande
 *   (LCNDA_EXT.dataSources) ; « Où chercher » (un site) ; Réglages → « 🔔 Objets et traces » (chaque sujet s'éteint ↶, À propos).
 * localStorage : « genealogie-lot10-objets-traces ».   window.LCNDA_EXT.objetsTraces = {load, core…, personInto, placeInto}
 * Essai : tests/test-lot10-objets-traces.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (ys.length ? Math.max(...ys) : null)};
    }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    /** ses lieux (3 au plus) : naissance d'abord, puis décès, puis les plus cités ; seulement ceux qui ont une position */
    function homePlaces(life, max = 3) {
        const pls = (life?.places || []).filter(okLL), ev = life?.events || [];
        const byTag = tags => { const e = ev.find(x => tags.includes(String(x.tag || '').toUpperCase()) && x.place_id); return e && pls.find(p => p.id === e.place_id); };
        const out = [];
        for (const p of [byTag(['BIRT', 'BAPM', 'CHR']), byTag(['DEAT', 'BURI']), ...pls]) if (p && !out.includes(p)) out.push(p);
        return out.slice(0, max);
    }
    const deathPlace = life => { const e = (life?.events || []).find(x => /^(DEAT|BURI)$/.test(String(x.tag || '').toUpperCase()) && okLL(x)); return e ? {lat: e.lat, lon: e.lon, name: e.place, year: num(e.year)} : null; };
    /** 🎻 les contes et chansons recueillis près de ses lieux (≤ radius km) ; les plus proches de sa vie d'abord */
    function talesNear(rows, places, span = {}, radius = 15) {
        const out = [];
        for (const r of rows) {
            if (num(r.lat) === null) continue;
            let best = null;
            for (const p of places) { const k = km(p.lat, p.lon, r.lat, r.lon); if (k <= radius && (!best || k < best.km)) best = {km: k, place: p}; }
            if (best) out.push({r, ...best});
        }
        const inLife = x => (x.r.y !== null && span.from !== null && span.from !== undefined && x.r.y >= span.from && x.r.y <= (span.to ?? span.from + 80));
        return out.sort((a, b) => (inLife(b) - inLife(a)) || a.km - b.km);
    }
    /** 🎻 le recueil de sa région : un folkloriste qui recueillait à moins de 60 km de chez lui, de son vivant */
    function regionalWorks(rows, works, places, span = {}) {
        const out = [];
        for (const w of works) {
            const placed = rows.filter(r => r.w === w.w && num(r.lat) !== null);
            let best = null;
            for (const r of placed) for (const p of places) { const k = km(p.lat, p.lon, r.lat, r.lon); if (k <= 60 && (!best || k < best)) best = k; }
            if (best === null) continue;
            const overlap = span.from === null || span.from === undefined ? null : (span.from <= w.to && (span.to ?? span.from + 80) >= w.from);
            if (overlap === false) continue;
            out.push({w, km: best});
        }
        return out.sort((a, b) => a.km - b.km);
    }
    /** 🎻 un conteur qui porte son nom, tout près (≤ 20 km) : « Conté par Marie-Yvonne Guézennec, de Plouaret » */
    function tellersNamed(rows, last, places, radius = 20) {
        const L = fold(last); if (L.length < 3) return [];
        return talesNear(rows.filter(r => r.q && ` ${fold(r.q)} `.includes(` ${L} `)), places, {}, radius);
    }
    const PIL_RANK = {pelerinage: 0, pardon: 0, marial: 1, sanctuaire: 2, basilique: 3};
    /** 🕯️ les pèlerinages de sa région (≤ radius km) ; un sanctuaire fondé après sa mort est écarté (une basilique, non : son
     *  année est celle du bâtiment d'aujourd'hui, le pèlerinage est souvent bien plus ancien) */
    function pilgrimagesNear(rows, places, span = {}, radius = 50) {
        const end = span.to ?? null, out = new Map();
        for (const r of rows) {
            if (end !== null && r.from !== null && r.kind !== 'basilique' && r.from > end) continue;
            for (const p of places) {
                const k = km(p.lat, p.lon, r.lat, r.lon); if (k > radius) continue;
                const cur = out.get(r.q); if (!cur || k < cur.km) out.set(r.q, {r, km: k});
            }
        }
        return [...out.values()].sort((a, b) => (PIL_RANK[a.r.kind] - PIL_RANK[b.r.kind]) || a.km - b.km);
    }
    /** ⛪ / 🏥 les institutions (ha-institutions) de ces sortes près d'un point, ouvertes l'année y (date inconnue : gardée, signalée) */
    function institutionsAt(rows, lat, lon, kinds, y, radius) {
        return rows.filter(i => i.kinds.some(k => kinds.includes(k)) && (y === null || ((i.from === null || i.from <= y) && (i.to === null || i.to >= y))))
            .map(i => ({i, km: km(lat, lon, i.lat, i.lon)})).filter(x => x.km <= radius).sort((a, b) => (a.i.from === null) - (b.i.from === null) || a.km - b.km);
    }
    const RELIGIOUS = /religieu|soeur|sœur|nonne|moniale|novice|carmel|ursuline|clarisse|benedictin|visitandine|couvent|abbesse|prieure|chanoinesse|frere|moine/;
    /** ⛪ une femme (ou une personne dont la fiche parle de vie religieuse) : les couvents près de chez elle à ses 20 ans */
    function conventsFor(rows, life, radius = 15) {
        const {birth} = lifeSpan(life); if (birth === null) return null;
        const rel = RELIGIOUS.test(fold(`${life.text || ''} ${(life.jobs || []).map(j => j.text).join(' ')}`));
        if (life?.person?.gender !== 'female' && !rel) return null;
        const home = homePlaces(life, 1)[0]; if (!home) return null;
        const y = birth + 20;
        const list = institutionsAt(rows, home.lat, home.lon, ['couvent'], y, radius);
        return list.length ? {home, year: y, list, rel} : null;
    }
    // un établissement d'aujourd'hui sans date de fondation : pas « de son temps »
    const MODERN = /centre hospitalier|clinique|\bchu\b|\bchr\b|polyclinique|ehpad|centre de soins|maison de retraite|hopital prive/;
    /** 🏥 où il a pu être soigné ou mourir : hospices, hôtels-Dieu, hôpitaux, asiles ouverts l'année de sa mort près du lieu */
    function hospicesFor(rows, life, radius = 10) {
        const d = deathPlace(life); if (!d || d.year === null) return null;
        const list = institutionsAt(rows, d.lat, d.lon, ['hospice', 'hoteldieu', 'hopital', 'asile'], d.year, radius)
            .filter(x => x.i.from !== null || !MODERN.test(fold(x.i.n)));
        return list.length ? {place: d, list} : null;
    }
    /** 🌿 les spécimens cueillis de son vivant (la liste du serveur : déjà la commune et ses années) */
    function herbsInLife(items, span) {
        if (span.from === null) return [];
        const to = span.to ?? span.from + 80;
        return (items || []).filter(x => x.year !== null && x.year >= span.from && x.year <= to);
    }

    const core = {num, fold, table, km, lifeSpan, homePlaces, deathPlace, talesNear, regionalWorks, tellersNamed, pilgrimagesNear, institutionsAt, conventsFor, hospicesFor, herbsInLife};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const DATA_V = 1;
    const KEY = 'genealogie-lot10-objets-traces';
    const TAB = ['lot10_objets_traces', '25l10o', '🔔 Objets et traces'];
    const BLOCK = 'lot10_objets_traces';
    const PARTS = [
        ['cloches', '🔔 Son nom sur les cloches', 'Les inscriptions des cloches de sa commune (base Palissy, pack « Patrimoine ») : parrain, marraine, curé, maire… quand on y lit le nom d’un ancêtre.'],
        ['musee', '🧺 Les objets de son village au musée', 'Outils, costumes, ex-voto faits, utilisés ou collectés dans la commune (base Joconde des musées de France).'],
        ['herbier', '🌿 Les plantes cueillies dans sa commune', 'Les spécimens d’herbier cueillis dans la commune de son vivant (GBIF, jeux CC0 et CC BY).'],
        ['plaques', '🪧 Plaques et stèles', 'Les plaques et stèles de la commune (OpenStreetMap) ; son nom quand il y est écrit.'],
        ['contes', '🎻 Contes et chansons de son pays', 'Les contes et chansons recueillis près de chez lui par Luzel, Sébillot, Bladé… (Wikisource, domaine public).'],
        ['couvents', '⛪ Couvents et abbayes près de chez elle', 'Pour une femme : les couvents ouverts près de chez elle à ses 20 ans, où elle a pu entrer (Wikidata).'],
        ['pelerinages', '🕯️ Les pèlerinages de sa région', 'Les lieux de pèlerinage et sanctuaires à moins de 50 km (Wikidata).'],
        ['hospices', '🏥 Hospices et hôpitaux de son temps', 'Les hospices, hôtels-Dieu, hôpitaux et asiles près du lieu de sa mort, ouverts cette année-là (Wikidata).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = url => (url ? `<a class="l10o-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const row = (icon, html, src, extra = '') => `<div class="hist-row l10o-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="l10o-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {folklore: 'l10o-folklore', pelerinages: 'l10o-pelerinages'};
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
            .then(f => (f ? {meta: f, rows: table(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    /** ha-institutions de « 🧭 Histoire autour » (pas de doublon : on lit le même fichier, par son module quand il est là) */
    async function institutions() {
        const H = ext.histoireAutour;
        if (H?.load) { const D = await H.load('institutions').catch(() => null); if (D) return D.rows; }
        if (!data.inst) data.inst = fetch('assets/data/ha-institutions.json.gz', {credentials: 'same-origin'}).then(readMaybeGz)
            .then(f => table(f).map(r => ({...r, kinds: String(r.kinds || '').split(',').filter(Boolean)}))).catch(e => { delete data.inst; throw e; });
        return data.inst;
    }
    const memo = new Map();
    const ask = (action, q) => { const k = `${action}|${JSON.stringify(q)}`; if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); };

    const SRC = {
        palissy: () => `${link('https://pop.culture.gouv.fr/', 'POP — base Palissy')} (${esc(T('Ministère de la Culture, Licence Ouverte Etalab 2.0'))})`,
        joconde: () => `${link('https://pop.culture.gouv.fr/', 'POP — base Joconde')} (${esc(T('notices : Licence Ouverte Etalab 2.0 ; images : droits de chaque musée'))})`,
        gbif: () => `${link('https://www.gbif.org', 'GBIF.org')} — ${esc(T('spécimens des jeux CC0 et CC BY 4.0 ; licence de chaque jeu'))}`,
        osm: () => `${link('https://www.openstreetmap.org/copyright', '© les contributeurs d’OpenStreetMap')} (ODbL)`,
        wikisource: () => `${link('https://fr.wikisource.org', 'Wikisource')} (${esc(T('textes du domaine public'))})`,
        wikidata: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        inst: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) — ${esc(T('liste de « 🧭 Histoire autour »'))}`
    };
    const SRC_TXT = {cloches: 'POP, base Palissy (Licence Ouverte Etalab 2.0) — pack « Patrimoine »', musee: 'POP, base Joconde (notices : Licence Ouverte Etalab 2.0)', herbier: 'GBIF.org (jeux CC0 et CC BY 4.0)',
        plaques: '© les contributeurs d’OpenStreetMap (ODbL)', contes: 'Wikisource (textes du domaine public)', couvents: 'Wikidata (CC0)', pelerinages: 'Wikidata (CC0)', hospices: 'Wikidata (CC0)'};

    /* ─────────── les morceaux communs (fiche, village, monographie) ─────────── */
    const nameBadge = n => `<span class="l10o-name${n.full ? ' l10o-full' : ''}">${esc(`${n.first} ${n.last}`.trim())}${n.from ? ` <small>(${esc(n.from)}${n.to && n.to !== n.from ? `–${esc(n.to)}` : ''})</small>` : ''}</span>`;
    const bellText = b => [b.pins, b.hist, b.pers ? `${T('Personnes citées :')} ${b.pers}` : ''].filter(Boolean).join(' — ');
    function bellLi(b, withNames = true) {
        const txt = bellText(b);
        return `<li><b>${esc(cap(b.title || T('cloche')))}</b>${b.year ? ` (${esc(b.year)})` : b.siecle ? ` (${esc(b.siecle)})` : ''}${b.edifice ? ` — ${esc(b.edifice)}` : ''} ${link(b.url, T('↗ POP'))}
            ${txt ? `<blockquote class="l10o-quote">${esc(txt)}</blockquote>` : !b.read ? `<br><small class="muted">${esc(T('Le texte de la notice n’a pas pu être lu (pas d’Internet) : il est sur POP.'))}</small>` : ''}
            ${withNames && b.names?.length ? `<br><small>${esc(T('Noms de ta base dans ce texte :'))} ${b.names.map(nameBadge).join(' ')}</small>` : ''}</li>`;
    }
    function bellsPlaceHtml(res) {
        if (!res?.ok || !res.bells?.length) return '';
        const named = res.bells.filter(b => b.names?.length);
        const withText = res.bells.filter(b => bellText(b));
        const lead = named.length ? T('{n} cloche(s) de {p} portent un nom de ta base : {who}.', {n: String(named.length), p: esc(res.commune), who: [...new Map(named.flatMap(b => b.names).map(n => [n.id, n])).values()].slice(0, 4).map(nameBadge).join(', ')})
            : T('{n} cloche(s) protégée(s) à {p}{t}.', {n: String(res.bells.length), p: esc(res.commune), t: withText.length ? T(' : leurs inscriptions (parrain, marraine, curé…)') : ''});
        return row('🔔', lead, SRC.palissy(), more(`<ul class="hist-ul l10o-ul">${res.bells.map(b => bellLi(b)).join('')}</ul>${hyp(T('Un même nom peut être celui d’un homonyme : vérifie le texte de la cloche et les dates. Les noms de ta base sont cherchés seulement ici, sur ton ordinateur.'))}`, res.bells.length));
    }
    function museeHtml(res) {
        if (!res?.ok || !res.items?.length) return '';
        const it = res.items, first = it[0];
        const kinds = [...new Set(it.map(x => (x.deno || '').split(',')[0].trim()).filter(Boolean))].slice(0, 4);
        const lead = T('{n} objet(s) de {p} dans les musées de France{k}.', {n: String(it.length), p: esc(res.place?.name || ''), k: kinds.length ? ` (${esc(kinds.join(', '))}…)` : ''});
        const li = x => `<li>${x.thumb ? `<img class="l10o-mini" loading="lazy" alt="" src="${esc(x.thumb)}" onerror="this.remove()"> ` : ''}<b>${esc(x.title)}</b>${x.when ? ` <small class="muted">(${esc(x.when)})</small>` : ''}${x.role ? ` — ${esc(x.role)}` : ''}${x.museum ? `<br><small>${esc(x.museum)}</small>` : ''}
            <br><small class="muted">${esc(x.free ? T('image sous licence libre') : T('image : droits du musée (seulement la notice ici)'))}</small> ${link(x.url, T('↗ notice POP'))}</li>`;
        return row('🧺', `${lead} ${srcLink(first.url)}`, SRC.joconde(), more(`<ul class="hist-ul l10o-ul">${it.map(li).join('')}</ul><p class="muted">${link(res.search, T('Chercher d’autres objets sur POP ↗'))}</p>${hyp(T('Les tableaux et photos de la commune sont dans « Ton village au musée » et « Voir son village » ; ici, les objets de la vie de tous les jours.'))}`, it.length));
    }
    const herbLi = x => `<li><i>${esc(x.sci)}</i> — ${esc(x.date || x.year || '')}${x.who ? `, ${esc(T('cueilli par {w}', {w: x.who}))}` : ''}${x.where ? `<br><small class="muted">« ${esc(x.where)} »</small>` : ''}
        <br><small>${esc(x.inst || x.dsname || '')} · ${link(x.licurl || x.dsurl, x.lic)} · ${link(x.url, T('↗ GBIF'))}</small></li>`;
    function herbierPlaceHtml(res) {
        if (!res?.ok || !res.items?.length) return '';
        const it = res.items, f = it[0];
        const lead = T('{n} plante(s) cueillie(s) à {p} et gardée(s) dans des herbiers, la première en {y}{w}.', {n: String(it.length), p: esc(res.place?.name || ''), y: String(f.year || '?'), w: f.who ? T(' par {w}', {w: esc(f.who)}) : ''});
        return row('🌿', `${lead} ${srcLink(f.url)}`, SRC.gbif(), more(`<ul class="hist-ul l10o-ul">${it.slice(0, 40).map(herbLi).join('')}</ul><p class="muted">${link(res.search, T('Tous les spécimens sur GBIF ↗'))}</p>`, it.length));
    }
    const KIND_OSM = {plaque: 'plaque', stele: 'stèle', stone: 'pierre gravée', obelisk: 'obélisque', blue_plaque: 'plaque', memorial: 'mémorial', bust: 'buste'};
    const plaqueLi = x => `<li><b>${esc(x.name || T(KIND_OSM[x.kind] || 'mémorial'))}</b> <small class="muted">(${esc(T(KIND_OSM[x.kind] || x.kind))}${x.date ? `, ${esc(x.date)}` : ''})</small> ${link(x.url, T('↗ OpenStreetMap'))}${x.wd ? ` ${link(wd(x.wd), '↗ Wikidata')}` : ''}
        ${x.insc ? `<blockquote class="l10o-quote">${esc(x.insc)}</blockquote>` : ''}${x.names?.length ? `<small>${esc(T('Noms de ta base dans ce texte :'))} ${x.names.map(nameBadge).join(' ')}</small>` : ''}</li>`;
    function plaquesPlaceHtml(res) {
        if (!res?.ok || !res.items?.length) return '';
        const it = res.items, named = it.filter(x => x.names?.length);
        const lead = named.length ? T('{n} plaque(s) ou stèle(s) à {p}, dont {m} avec un nom de ta base.', {n: String(it.length), p: esc(res.place?.name || ''), m: String(named.length)})
            : T('{n} plaque(s) ou stèle(s) à {p}{f}.', {n: String(it.length), p: esc(res.place?.name || ''), f: it[0].name ? ` : ${esc(it[0].name)}${it.length > 1 ? '…' : ''}` : ''});
        return row('🪧', `${lead} ${srcLink(it[0].url)}`, SRC.osm(), more(`<ul class="hist-ul l10o-ul">${[...named, ...it.filter(x => !x.names?.length)].map(plaqueLi).join('')}</ul>${hyp(T('Le monument aux morts est dans « 🪦 Le monument aux morts » ; les calvaires n’y sont pas.'))}`, it.length));
    }
    const workOf = (D, w) => (D.meta.works || []).find(x => x.w === w) || {w, who: ''};
    const taleLi = (D, x) => { const W = workOf(D, x.r.w); return `<li><b>${link(x.r.url, x.r.t)}</b> <small class="muted">(${esc(W.who)}, ${esc(T({conte: 'conte', légende: 'légende', chanson: 'chanson'}[x.r.k] || x.r.k))}${x.km !== undefined ? ` · ${esc(x.r.p)}, ${esc(kmTxt(x.km))}` : ''})</small>${x.r.q ? `<br><small class="muted">« ${esc(x.r.q)} »</small>` : ''}</li>`; };
    function contesPlaceHtml(D, place) {
        if (!D || !okLL(place)) return '';
        const near = talesNear(D.rows, [{lat: num(place.lat), lon: num(place.lon)}], {}, 10);
        if (!near.length) return '';
        const f = near[0], W = workOf(D, f.r.w);
        const lead = T('{n} conte(s) ou chanson(s) recueilli(s) à {p} ou tout près au XIXe siècle : « {t} » ({w}).', {n: String(near.length), p: esc(place.name || f.r.p), t: esc(f.r.t), w: esc(W.who)});
        return row('🎻', `${lead} ${srcLink(f.r.url)}`, SRC.wikisource(), (f.r.q ? `<blockquote class="l10o-quote">« ${esc(f.r.q)} »</blockquote>` : '') + more(`<ul class="hist-ul l10o-ul">${near.slice(1, 40).map(x => taleLi(D, x)).join('')}</ul>`, near.length - 1 || null));
    }
    const PIL_WORD = {pelerinage: 'lieu de pèlerinage', pardon: 'pardon', marial: 'sanctuaire marial', sanctuaire: 'sanctuaire', basilique: 'basilique'};
    const pilLi = x => `<li><b>${esc(x.r.n)}</b> <small class="muted">(${esc(T(PIL_WORD[x.r.kind]))}${x.r.commune ? `, ${esc(x.r.commune)}` : ''}, ${esc(kmTxt(x.km))}${x.r.ded ? ` · ${esc(T('dédié à {d}', {d: x.r.ded}))}` : ''}${x.r.from ? ` · ${esc(x.r.kind === 'basilique' ? T('bâtiment de {y}', {y: String(x.r.from)}) : T('depuis {y}', {y: String(x.r.from)}))}` : ''})</small> ${link(wd(x.r.q), '↗ Wikidata')}${x.r.frwiki ? ` ${link(wp(x.r.frwiki), '↗ Wikipédia')}` : ''}</li>`;
    function pilgrimagesHtml(list, lead) {
        if (!list.length) return '';
        return row('🕯️', `${lead} ${srcLink(wd(list[0].r.q))}`, SRC.wikidata(), more(`<ul class="hist-ul l10o-ul">${list.slice(0, 20).map(pilLi).join('')}</ul>${hyp(T('Les fontaines saintes et pèlerinages de la commune même sont dans « ⛲ Fontaines et saints ». Une basilique mineure est le plus souvent une église de pèlerinage, pas toujours.'))}`, list.length));
    }
    const pilShort = l => l.slice(0, 3).map(x => `<b>${esc(x.r.n)}</b> (${esc(kmTxt(x.km))})`).join(', ');
    const instLi = x => `<li><b>${esc(x.i.n)}</b> <small class="muted">(${esc(x.i.commune || '')}${x.i.commune ? ', ' : ''}${esc(kmTxt(x.km))}${x.i.from !== null ? ` · ${esc(T('depuis {y}', {y: String(x.i.from)}))}` : ` · ${esc(T('date de fondation inconnue'))}`}${x.i.to !== null ? ` · ${esc(T('jusqu’en {y}', {y: String(x.i.to)}))}` : ''})</small> ${link(wd(x.i.q), '↗ Wikidata')}${x.i.frwiki ? ` ${link(wp(x.i.frwiki), '↗ Wikipédia')}` : ''}</li>`;

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const PERSON_PARTS = ['cloches', 'plaques', 'herbier', 'contes', 'couvents', 'pelerinages', 'hospices'];
    async function bellsForPerson(life, places, pid) {
        const P = life.person, hits = [];
        for (const pl of places) {
            if (!pl.id) continue;
            const res = await ask('l10o_cloches', {id: pl.id, pid});
            if (!res?.ok) continue;
            for (const b of res.bells || []) { const n = (b.names || []).find(x => x.id === P.id); if (n) hits.push({b, n, commune: res.commune}); }
        }
        if (!hits.length) return '';
        hits.sort((a, b) => (b.n.full - a.n.full) || ((b.n.era ? 1 : 0) - (a.n.era ? 1 : 0)));
        const h = hits[0], when = h.b.year ? T('la cloche de {y}', {y: String(h.b.year)}) : T('une cloche');
        const lead = h.n.full
            ? T('Son nom est peut-être gravé sur {c} de {e} ({p}) : on y lit « {n} ».', {c: when, e: esc(h.b.edifice || T('l’église')), p: esc(h.commune), n: esc(`${P.first} ${P.last}`.trim())})
            : T('Le nom {n} est écrit sur {c} de {e} ({p}) : un parent ?', {n: `<b>${esc(P.last)}</b>`, c: when, e: esc(h.b.edifice || T('l’église')), p: esc(h.commune)});
        return row('🔔', `${lead} ${srcLink(h.b.url)}`, SRC.palissy(), more(`<ul class="hist-ul l10o-ul">${hits.map(x => bellLi(x.b, false)).join('')}</ul>${hyp(h.n.era === false ? T('Attention : la cloche date d’une autre époque que celle qu’on connaît de sa vie — sans doute un homonyme ou un ancêtre du même nom.') : T('Parrain, marraine, curé, maire… : vérifie le texte, un homonyme est possible.'))}`, hits.length));
    }
    async function plaquesForPerson(life, places, pid) {
        const P = life.person, hits = [];
        for (const pl of places) {
            if (!pl.id) continue;
            const res = await ask('l10o_plaques', {id: pl.id, pid});
            if (!res?.ok) continue;
            for (const x of res.items || []) { const n = (x.names || []).find(y => y.id === P.id); if (n) hits.push({x, n, place: res.place?.name || pl.name}); }
        }
        if (!hits.length) return '';
        const h = hits.find(z => z.n.full) || hits[0];
        const lead = h.n.full ? T('Son nom est peut-être sur une plaque à {p} : « {t} ».', {p: esc(h.place), t: esc(h.x.name || h.x.insc.slice(0, 80))})
            : T('Le nom {n} est sur une plaque à {p} : « {t} ».', {n: `<b>${esc(P.last)}</b>`, p: esc(h.place), t: esc(h.x.name || h.x.insc.slice(0, 80))});
        return row('🪧', `${lead} ${srcLink(h.x.url)}`, SRC.osm(), more(`<ul class="hist-ul l10o-ul">${hits.map(z => plaqueLi({...z.x, names: []})).join('')}</ul>${hyp(T('Un homonyme est possible : vérifie le texte et les dates.'))}`, hits.length));
    }
    async function herbsForPerson(life, home, pid) {
        const span = lifeSpan(life); if (!home?.id || span.from === null) return '';
        const res = await ask('l10o_herbier', {id: home.id, pid, from: Math.max(1700, span.from), to: Math.min(2025, span.to ?? span.from + 80)});
        const list = herbsInLife(res?.items, span); if (!list.length) return '';
        const f = list[0], age = span.birth !== null ? f.year - span.birth : null;
        const lead = T('Un botaniste est passé à {p} en {y}{a} : {w} y a cueilli {s}.', {p: esc(res.place?.name || home.name), y: String(f.year), a: age !== null && age >= 0 ? T(' ({e} avait {n} ans)', {e: he(life.person), n: String(age)}) : '', w: esc(f.who || T('un botaniste')), s: `<i>${esc(f.sci)}</i>`});
        return row('🌿', `${lead} ${srcLink(f.url)}`, SRC.gbif(), more(`<ul class="hist-ul l10o-ul">${list.slice(0, 30).map(herbLi).join('')}</ul>${hyp(T('La plante séchée est encore dans un herbier ; la notice dit où, par qui et quand elle a été cueillie.'))}`, list.length));
    }
    function contesForPerson(D, life, places) {
        if (!D) return '';
        const span = lifeSpan(life), near = talesNear(D.rows, places, span, 15), P = life.person;
        const tell = tellersNamed(D.rows, P.last || '', places);
        const tellHtml = tell.length ? `<p>${T('Un conteur de son nom, tout près : {q}', {q: `« ${esc(tell[0].r.q)} » — ${link(tell[0].r.url, tell[0].r.t)}`})} ${hyp(T('Peut-être un parent : le nom seul ne suffit pas.'))}</p>` : '';
        if (near.length) {
            const f = near[0], W = workOf(D, f.r.w);
            const lead = T('Un conte recueilli à {p} ({k} de chez {h}){y} : « {t} » ({w}).', {p: esc(f.r.p), k: esc(kmTxt(f.km)), h: T(life.person?.gender === 'female' ? 'elle' : 'lui'), y: f.r.y ? T(' en {y}', {y: String(f.r.y)}) : '', t: esc(f.r.t), w: esc(W.who)});
            return row('🎻', `${lead} ${srcLink(f.r.url)}`, SRC.wikisource(), (f.r.q ? `<blockquote class="l10o-quote">« ${esc(f.r.q)} »</blockquote>` : '') + more(`${tellHtml}<ul class="hist-ul l10o-ul">${near.slice(1, 30).map(x => taleLi(D, x)).join('')}</ul>`, near.length - 1 || null));
        }
        const reg = regionalWorks(D.rows, D.meta.works || [], places, span);
        if (!reg.length) return tell.length ? row('🎻', tellHtml, SRC.wikisource()) : '';
        const w = reg[0].w;
        const lead = T('Les contes et chansons de son pays, recueillis par {who} ({a}–{b}) : « {t} ».', {who: esc(w.who), a: String(w.from), b: String(w.to), t: link(w.url, w.w)});
        const rows = D.rows.filter(r => r.w === w.w).slice(0, 20);
        return row('🎻', lead, SRC.wikisource(), more(`${tellHtml}${w.note ? `<p class="muted">${esc(w.note)}</p>` : ''}<ul class="hist-ul l10o-ul">${rows.map(r => `<li>${link(r.url, r.t)}${r.p ? ` <small class="muted">(${esc(r.p)})</small>` : ''}</li>`).join('')}</ul>`, rows.length));
    }
    async function conventsForPerson(life) {
        const rows = await institutions().catch(() => null); if (!rows) return '';
        const c = conventsFor(rows, life); if (!c) return '';
        const P = life.person;
        const lead = T('Les couvents et abbayes à moins de 15 km de chez {h} quand {e} avait 20 ans ({y}) : {l}.', {h: T(P.gender === 'female' ? 'elle' : 'lui'), e: he(P), y: String(c.year), l: c.list.slice(0, 3).map(x => `<b>${esc(x.i.n)}</b> (${esc(kmTxt(x.km))})`).join(', ')});
        return row('⛪', `${lead} ${srcLink(wd(c.list[0].i.q))}`, SRC.inst(), more(`<ul class="hist-ul l10o-ul">${c.list.slice(0, 15).map(instLi).join('')}</ul>${hyp(c.rel ? T('Sa fiche parle de vie religieuse : les registres de prise d’habit et de profession sont souvent aux Archives départementales (série H) ou au couvent.') : T('Une piste seulement : si elle est entrée en religion, c’est souvent dans un couvent proche ; les registres de profession sont aux Archives départementales (série H).'))}`, c.list.length));
    }
    async function pilgrimagesForPerson(life, places) {
        const D = await load('pelerinages').catch(() => null); if (!D) return '';
        const list = pilgrimagesNear(D.rows, places, lifeSpan(life), 50); if (!list.length) return '';
        return pilgrimagesHtml(list, T('Les pèlerinages de sa région : {l}.', {l: pilShort(list)}));
    }
    async function hospicesForPerson(life) {
        const rows = await institutions().catch(() => null); if (!rows) return '';
        const h = hospicesFor(rows, life); if (!h) return '';
        // déjà dit par « 🧭 Histoire autour » quand l'acte de décès nomme l'institution : rien en double
        const H = ext.histoireAutour; if (H?.institutionsForLife) { try { if (H.institutionsForLife(rows, life).acts.some(a => a.what === 'death')) return ''; } catch (_) {} }
        const P = life.person, f = h.list[0];
        const lead = T('En {y}, près de {p}, il y avait {l} : {e} a pu y être soigné(e) ou y mourir.', {y: String(h.place.year), p: esc(h.place.name || ''), l: h.list.slice(0, 2).map(x => `<b>${esc(x.i.n)}</b> (${esc(kmTxt(x.km))})`).join(', '), e: he(P)});
        return row('🏥', `${lead} ${srcLink(wd(f.i.q))}`, SRC.inst(), more(`<ul class="hist-ul l10o-ul">${h.list.slice(0, 10).map(instLi).join('')}</ul>${hyp(T('Ce n’est qu’une possibilité : l’acte de décès le dit (« décédé à l’hospice », l’adresse). Les registres d’entrée des hospices sont aux Archives (série X ou H-dépôt).'))}`, h.list.length));
    }
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const places = homePlaces(life), priv = !!opts.private;
        const D = want.includes('contes') ? await load('folklore').catch(() => null) : null;
        const jobs = {
            cloches: () => (priv ? '' : bellsForPerson(life, places, id)),
            plaques: () => (priv ? '' : plaquesForPerson(life, places, id)),
            herbier: () => (priv ? '' : herbsForPerson(life, places[0], id)),
            contes: () => contesForPerson(D, life, places),
            couvents: () => conventsForPerson(life),
            pelerinages: () => pilgrimagesForPerson(life, places),
            hospices: () => hospicesForPerson(life)};
        const html = await Promise.all(want.map(k => Promise.resolve().then(jobs[k]).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life l10o-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        const priv = p.living_status === 'living' || Number(p.is_private) === 1 ? '1' : '';
        return A().card(index, T('🔔 Objets et traces'), '', `<div class="l10o-block" data-l10o-person="${Number(p.id)}" data-l10o-priv="${priv}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-l10o-person]').forEach(async h => {
            const id = Number(h.dataset.l10oPerson);
            const n = await personInto(h, id, {private: h.dataset.l10oPriv === '1'});
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['cloches', 'musee', 'herbier', 'plaques', 'contes', 'pelerinages'];
    async function placePart(kind, place, opts = {}) {
        const ll = placeLL(place), q = {id: Number(place.id) || 0, insee: place.insee || '', name: place.name || '', ...(ll || {})};
        if (!q.id && !q.insee && !q.name && !ll) return '';
        if (kind === 'cloches') return q.id || q.insee ? bellsPlaceHtml(await ask('l10o_cloches', q)) : '';
        if (kind === 'musee') return museeHtml(await ask('l10o_musee', q));
        if (kind === 'herbier') { const y = opts.years; return herbierPlaceHtml(await ask('l10o_herbier', {...q, from: y?.from ? Math.max(1700, y.from - 20) : 1750, to: y?.to ? Math.min(2025, y.to + 10) : 1950})); }
        if (kind === 'plaques') return plaquesPlaceHtml(await ask('l10o_plaques', q));
        if (kind === 'contes') return ll ? contesPlaceHtml(await load('folklore').catch(() => null), {...ll, name: place.name}) : '';
        if (kind === 'pelerinages') {
            if (!ll) return ''; const D = await load('pelerinages').catch(() => null); if (!D) return '';
            const list = pilgrimagesNear(D.rows, [ll], {}, 30);
            return pilgrimagesHtml(list, T('Les lieux de pèlerinage à moins de 30 km : {l}.', {l: pilShort(list)}));
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel l10o-panel"><h3>${esc(T('🔔 Objets et traces du village'))}</h3><div class="hist-life l10o-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l10o])'); if (!village) return;
        village.dataset.l10o = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const place = villagePlace(village);
        const anchor = village.querySelector('[data-l9a-host]') || village.querySelector('[data-lp-host]') || village.querySelector('[data-ha-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="l10o-place" data-l10o-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l10o-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => console.error(e)); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune : une partie par sujet ─────────── */
    const MONO = [['cloches', 'l10o_cloches', '🔔', 'Les cloches et leurs inscriptions'], ['musee', 'l10o_musee', '🧺', 'Les objets du village au musée'], ['herbier', 'l10o_herbier', '🌿', 'Les plantes cueillies ici (herbiers)'],
        ['plaques', 'l10o_plaques', '🪧', 'Plaques et stèles'], ['contes', 'l10o_contes', '🎻', 'Contes et chansons recueillis ici'], ['pelerinages', 'l10o_pelerinages', '🕯️', 'Les pèlerinages autour']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: kind === 'cloches' ? 'Ta famille' : 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host, ctx) => {
            let years = null; try { years = ctx?.years ? await ctx.years() : null; } catch (_) {}
            const html = await placePart(kind, {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon}, {years}); if (!html) return false;
            host.innerHTML = `<div class="hist-life l10o-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const rowsOf = kind => load(kind).then(D => D || {meta: {}, rows: []});
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l10o_pelerinages', icon: '🕯️', label: T('Lieux de pèlerinage et sanctuaires'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q15135589', enabled: () => on('pelerinages'),
            load: async () => (await rowsOf('pelerinages')).rows.map(r => ({name: r.n, kind: T(PIL_WORD[r.kind]), commune: r.commune, country: r.country, from: r.from, dedie: r.ded, lat: r.lat, lon: r.lon, wikipedia: wp(r.frwiki), src: wd(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum', values: Object.values(PIL_WORD).map(x => T(x))}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'country', label: T('Pays'), type: 'enum'},
                {key: 'from', label: T('Fondé (ou bâti) en'), type: 'year'}, {key: 'dedie', label: T('Dédié à'), type: 'text'}, {key: 'wikipedia', label: 'Wikipédia', type: 'url'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.from, null], geo: r => [r.lat, r.lon], open: r => window.open(r.src, '_blank', 'noopener')},
        {id: 'l10o_contes', icon: '🎻', label: T('Contes et chansons recueillis au XIXe siècle'), group: 'Le lieu', source: 'Wikisource (domaine public)', sourceUrl: 'https://fr.wikisource.org', enabled: () => on('contes'),
            load: async () => { const D = await rowsOf('folklore'); const W = Object.fromEntries((D.meta.works || []).map(w => [w.w, w])); return D.rows.map(r => ({name: r.t, kind: r.k, book: r.w, who: W[r.w]?.who || '', commune: r.p || '', year: r.y || null, from: W[r.w]?.from, to: W[r.w]?.to, quote: r.q || '', lat: r.lat, lon: r.lon, src: r.url})); },
            fields: [{key: 'name', label: T('Titre'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum', values: ['conte', 'légende', 'chanson']}, {key: 'book', label: T('Recueil'), type: 'enum'}, {key: 'who', label: T('Folkloriste'), type: 'enum'},
                {key: 'commune', label: T('Recueilli à'), type: 'place'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'quote', label: T('La phrase du texte'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year ?? r.from, r.year ?? r.to], geo: r => (r.lat !== null && r.lat !== undefined ? [r.lat, r.lon] : null), open: r => window.open(r.src, '_blank', 'noopener')});

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        {id: 'l10o_pelerinages', icon: '🕯️', label: T('Lieux de pèlerinage et sanctuaires'), group: 'Le lieu', kind: 'points', source: 'Wikidata (CC0)',
            run: async ({q, bbox, to, max = 2000}) => { const D = await rowsOf('pelerinages'); const features = D.rows.filter(r => inBox(bbox, r.lat, r.lon) && (!q || fold(r.n).includes(fold(q))) && (!to || r.kind === 'basilique' || r.from === null || r.from <= to)).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: r.n})); return {features, source: 'Wikidata (CC0)'}; }},
        {id: 'l10o_contes', icon: '🎻', label: T('Contes et chansons recueillis (XIXe siècle)'), group: 'Le lieu', kind: 'points', source: 'Wikisource (domaine public)',
            run: async ({q, bbox, max = 2000}) => { const D = await rowsOf('folklore'); const features = D.rows.filter(r => r.lat !== null && inBox(bbox, r.lat, r.lon) && (!q || fold(`${r.t} ${r.p}`).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: `${r.t} (${r.p})`})); return {features, source: 'Wikisource (domaine public)'}; }});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
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
        const html = await placePart(kind, pl, {});
        host.innerHTML = html ? `<div class="hist-life l10o-life">${html}</div>` : '';
        return !!html;
    }
    const PDS = [['cloches', '🔔', 'Son nom sur une cloche de sa commune', 'Rien : il faut le pack « Patrimoine » du département et un nom lisible dans l’inscription.'],
        ['plaques', '🪧', 'Son nom sur une plaque ou une stèle', 'Aucune plaque de ses communes ne porte son nom (OpenStreetMap).'],
        ['herbier', '🌿', 'Les plantes cueillies dans sa commune de son vivant', 'Aucun spécimen d’herbier daté de son vivant pour sa commune.'],
        ['contes', '🎻', 'Les contes et chansons de son pays', 'Aucun conte recueilli près de ses lieux (Bretagne, Gascogne, Picardie, Berry surtout).'],
        ['couvents', '⛪', 'Les couvents près de chez elle à ses 20 ans', 'Pour une femme avec une date de naissance et un lieu placé.'],
        ['pelerinages', '🕯️', 'Les pèlerinages de sa région', 'Aucun lieu de pèlerinage connu à moins de 50 km.'],
        ['hospices', '🏥', 'Les hospices près du lieu de sa mort', 'Il faut un lieu et une année de décès.']];
    (ext.dataSources = ext.dataSources || []).push(
        ...PDS.map(([k, icon, label, empty]) => ({id: `l10op_${k}`, icon, label: T(label), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson([k], ctx, host, empty)})),
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── 🌍 Où chercher : un site en plus (registre des sites du monde) ─────────── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES) || M.SITES.some(s => s.key === 'l10o_conteurs')) return !!M;
        const enc = encodeURIComponent;
        M.SITES.push({key: 'l10o_conteurs', icon: '🎻', group: 'Monde', label: T('Wikisource — son nom parmi les conteurs et chanteurs des folkloristes'), cats: ['bibliotheques'], period: [1830, 1914], access: 'online',
            url: p => `https://fr.wikisource.org/w/index.php?search=${enc(`"${p.last || ''}" conté OR chanté OR dicté`)}&ns0=1`,
            rel: {countries: ['fr'], from: 1790, to: 1914, base: 0.3, why: () => T('Luzel, Sébillot, Bladé… notaient le nom de la personne qui leur contait ou chantait : cherche son nom dans leurs recueils (domaine public)')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🔔 Objets et traces ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(Object.keys(FILES).map(async k => { try { const D = await load(k); if (D) metas[k] = D; } catch (_) {} }));
        let about = null; try { about = await api('l10o_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-l10o-tg="${key}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = (k, label) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}${m.note ? `<br><small class="muted">${esc(m.note)}</small>` : ''}</td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        const S = about?.sources || {};
        const onl = (k, label, what) => `<tr><td>${esc(T(label))}</td><td>${link(S[k]?.url, S[k]?.label || k)}<br><small class="muted">${esc(T(what))}</small></td><td>${esc(T('en ligne'))}</td><td>${esc(S[k]?.licence || '')}</td><td>${esc(T('licence lue le {d}', {d: S[k]?.read || '2026-11-25'}))}</td></tr>`;
        ws.innerHTML = `<section class="page cplus-settings l10o-settings" data-l10o-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Objets et traces'), icon: '🔔', where: T('Réglages · Données'), help: esc(T('Les cloches et leurs inscriptions, les objets des musées, les plantes des herbiers, les plaques et stèles, les contes recueillis, les couvents, les pèlerinages et les hospices de son temps.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🔔 Objets et traces »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes, les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${fileRow('folklore', '🎻 Contes et chansons')}${fileRow('pelerinages', '🕯️ Pèlerinages')}
                <tr><td>${esc(T('⛪🏥 Couvents, hospices'))}</td><td>${link('https://www.wikidata.org', 'Wikidata')}<br><small class="muted">${esc(T('le fichier de « 🧭 Histoire autour » (ha-institutions), lu ici sans copie'))}</small></td><td></td><td>CC0 1.0</td><td></td></tr>
                ${onl('palissy', '🔔 Cloches', 'inscriptions relues sur POP ; la liste des cloches vient du pack « Patrimoine » (Réglages → 🏘️ Lieux-dits et patrimoine)')}
                ${onl('joconde', '🧺 Objets de musée', 'objets (pas les tableaux ni les photos) ; l’image seulement quand la notice la dit libre, sinon la notice et le lien')}
                ${onl('gbif', '🌿 Herbiers', 'spécimens d’herbier des jeux CC0 et CC BY 4.0 seulement')}
                ${onl('osm', '🪧 Plaques et stèles', 'historic=memorial (plaques, stèles, pierres) de la commune')}
                <tr><td>${esc(T('🗞️ Journaux'))}</td><td colspan="4" class="muted">${esc(T('Déjà dans « 🌍 Monde et coutumes » : les journaux de son département (BnF), avec le lien vers Gallica.'))}</td></tr></tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : le code INSEE, la position ou le nom de la commune, et les références POP. Jamais un nom de personne, et rien pour une fiche vivante ou confidentielle.'))}</p>
                <p class="muted">${esc(T('Pas copiés (licence pas ouverte ou site pas lisible) : les collections du MuCEM (lien seulement), les images des musées (droits de chaque musée), Gallica (lecture libre, pas de copie).'))}</p>
                <p class="muted">${esc(T('Réponses gardées sur l’ordinateur : {n}.', {n: nf(about?.cache?.count || 0)}))} <button type="button" class="button small secondary" data-l10o-cache-clear>${esc(T('🗑 Vider'))}</button></p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-l10o-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.l10oTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🔔'});
    });
    document.addEventListener('click', async e => {
        if (!e.target.closest?.('[data-l10o-cache-clear]')) return;
        try {
            const res = await post('l10o_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: String(res.removed)}), {undo: async () => { await post('l10o_cache_restore', {token: res.token}); drawSettings(); }, icon: '🗑'});
        } catch (err) { A().toast?.(err.message, 'error'); }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'lot9_sons_enfance'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'lot9_sons_enfance'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🔔 Objets et traces']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.objetsTraces = {...core, load, settings, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
