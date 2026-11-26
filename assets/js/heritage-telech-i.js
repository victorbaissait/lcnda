/**
 * LCNDA — ⚓ Le pays au travail et à l'école (lot I « téléchargements ») : chantiers, usines, sanatoriums, prisons, ponts romains,
 *   courses, sociétés, et ce qu'on lisait, chantait et écrivait à l'école.
 * Livré avec l'app (assets/data/ti-*.json.gz, refaits par scripts/telech-i/*.py et .github/workflows/telech-i.yml, lus à la demande) :
 *   ⚓ ti-navals      chantiers navals, corderies, arsenaux (Wikidata CC0) — plus loin pour un charpentier de marine, un cordier
 *   🚗 ti-autos       constructeurs automobiles fondés avant 1914 et leur ville (Wikidata CC0)
 *   🍬 ti-sucreries   sucreries (Wikidata CC0) — PROLONGE la catégorie « sucrerie » de « Métiers et rivières » (CASIAS, autre module)
 *   🏥 ti-sanas       sanatoriums (Wikidata CC0) — sur la fiche, seulement pour une personne décédée, lieu de décès tout près
 *   🔒 ti-centrales   maisons centrales (Wikidata CC0) + où chercher les registres d'écrou (liens) — PROLONGE les prisons et bagnes de
 *                     « 🧭 Histoire autour » (ha-institutions, non recopiés)
 *   🌊 ti-maregraphe  niveau moyen de la mer à Brest et Marseille (PSMSL ; à fabriquer sur GitHub, données libres à citer)
 *   🏛 ti-romains     ponts et aqueducs romains (Wikidata CC0) ; ceux déjà dans « 🕰 Son époque » (et-ouvrages) sont marqués
 *   🐎 ti-hippodromes hippodromes et leur date (Wikidata CC0)
 *   🧭 ti-tour        « Le Tour de la France par deux enfants » (G. Bruno, 1877 ; éd. 1904, Wikisource) : la phrase qui nomme la ville
 *   📕 ti-dico        les métiers dans le « Petit dictionnaire » de Soulice (1860, Wikisource) ; le Petit Larousse (1911, scan) en lien
 *   ✏️ ti-ecole       dictées et textes sur le certificat d'études (Wikisource, domaine public), recopiés tels quels
 *   🎶 ti-chansons    chansons de métier des recueils du domaine public (Wikisource) — PROLONGE « 🎼 Les chansons de son enfance »
 *   📖 ti-contexte    la première phrase des articles de Wikipédia sur chaque sujet (CC BY-SA 4.0)
 * Déjà dans l'app et RÉUTILISÉ (pas recopié) : les grottes ornées de « 🧺 Vie de tous les jours » (tq-sites : ici seulement une ligne
 *   sur la fiche), les phares de « 🧭 Histoire autour » (ha-phares : un lieu à moins de 15 km d'un phare est « au bord de la mer »).
 * Sociétés de secours mutuels, de tir, de gymnastique, orphéons : trop peu dans Wikidata (une ou deux chacune) → phrase + liens.
 * Tout est lu sur l'ordinateur : rien ne part sur Internet (ni nom, ni lieu), pour personne. Seuls les liens « ↗ » ouvrent une page.
 * localStorage : « genealogie-telech-i ».   window.LCNDA_EXT.telechI = {core…, load, personInto, placeInto, openSettings}
 * Essai : tests/test-telech-i.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || f.cols || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? b + 80 : ys.length ? Math.max(...ys) : null)};
    }
    const aliveIn = (life, a, b = a) => { const s = lifeSpan(life); return s.from !== null && s.to !== null && s.from <= b && s.to >= a; };
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase()}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    function nearLife(rows, life, radius, when = () => true, key = r => r.q || `${r.lat},${r.lon}`, evs = placedEvents(life)) {
        const out = new Map();
        for (const e of evs) for (const x of near(rows, e.lat, e.lon, radius, 200)) {
            if (!when(x.r, e)) continue;
            const k = key(x.r), cur = out.get(k); if (!cur || x.km < cur.km) out.set(k, {...x, place: e.name, year: e.year, tag: e.tag});
        }
        return [...out.values()].sort((a, b) => a.km - b.km);
    }
    const jobsText = life => fold([...(life?.jobs || []).map(j => j.text), life?.text || ''].join(' '));
    const jobsOnly = life => fold((life?.jobs || []).map(j => j.text).join(' ; '));
    const NAVAL_JOB = /\b(charpentier de (marine|navire|vaisseau)|calfat|calfateur|cordier|cordiere|voilier|perceur|ouvrier (de l |du port|de la marine)|arsenal|constructeur de navires|scieur de long de la marine)\b/;
    const SUGAR_JOB = /\b(sucrier|sucriere|ouvrier sucrier|raffineur|cuiseur|betteravier|ouvrier de sucrerie|fabricant de sucre|contremaitre de sucrerie)\b/;
    const AUTO_JOB = /\b(mecanicien|carrossier|chauffeur|ajusteur|tourneur|fraiseur|garagiste|constructeur d automobiles?|ouvrier d usine automobile|motoriste)\b/;
    const PRISON_WORD = /\b(detenu|detenue|prisonnier|prisonniere|condamne|condamnee|forcat|ecroue|ecrouee|incarcere|incarceree|reclusion|travaux forces|gardien de prison|surveillant de prison|maison centrale|maison d arret)\b/;
    /** un lieu de décès (ou d'inhumation) : la personne est donc décédée ; rien sinon */
    const deathEvents = life => placedEvents(life).filter(e => ['DEAT', 'BURI', 'CREM'].includes(e.tag));
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => ['DEAT', 'BURI', 'CREM'].includes(String(e.tag || '').toUpperCase()));
    /** ⚓ 🍬 lieux de travail proches pendant sa vie : plus loin quand il en avait le métier */
    function worksFor(rows, life, jobRe) {
        const s = lifeSpan(life), job = jobRe.test(jobsOnly(life));
        const list = nearLife(rows, life, job ? 25 : 6, r => (num(r.from) === null || s.to === null || r.from <= s.to) && (num(r.to) === null || s.from === null || r.to >= s.from));
        return {job, list};
    }
    /** 🚗 🐎 fondés près de chez lui quand il avait au moins 10 ans */
    function foundedFor(rows, life, radius) {
        const s = lifeSpan(life); if (s.from === null) return [];
        return nearLife(rows, life, radius, (r, e) => num(r.from) !== null && r.from >= (s.birth ?? s.from) + 10 && r.from <= s.to && (e.year === null || Math.abs(e.year - r.from) <= 30));
    }
    /** 🏥 un sanatorium à moins de 2 km de son lieu de décès (décédé seulement ; ouvert avant sa mort si la date est connue) */
    function sanasFor(rows, life) {
        if (!isDead(life)) return [];
        return nearLife(rows, life, 2, (r, e) => num(r.from) === null || e.year === null || r.from <= e.year, r => r.q, deathEvents(life));
    }
    /** 🔒 seulement si sa fiche parle de prison (détenu, condamné, gardien…), et décédé : les maisons centrales et prisons à moins de 30 km */
    function prisonFor(rows, life) { return isDead(life) && PRISON_WORD.test(jobsText(life)) ? nearLife(rows, life, 30) : []; }
    /** 🏛 ponts et aqueducs romains à moins de 10 km de ses lieux */
    const romansFor = (rows, life) => nearLife(rows, life, 10);
    /** 🎨 grottes ornées (tq-sites, sorte « grotte ») à moins de 15 km de son lieu de naissance (ou du premier lieu connu) */
    function cavesFor(rows, life) { const ev = placedEvents(life); const b = ev.filter(e => ['BIRT', 'BAPM', 'CHR'].includes(e.tag)); return nearLife(rows.filter(r => r.k === 'grotte'), life, 15, () => true, r => r.q, (b.length ? b : ev).slice(0, 1)); }
    /** 🧭 une ville du « Tour de la France » à moins de 10 km de ses lieux, s'il vivait après 1877 */
    function tourFor(rows, life) { return aliveIn(life, 1877, 2100) ? nearLife(rows, life, 10, () => true, r => `${r.insee}|${r.ch}`) : []; }
    /** 📕 les mots du dictionnaire qui sont ses métiers */
    function dicoFor(rows, life) {
        const jobs = (life?.jobs || []).map(j => fold(j.text)).filter(Boolean);
        const out = [];
        for (const r of rows) { const w = fold(r.w); if (jobs.some(j => j === w || j.split(' ')[0] === w || new RegExp(`\\b${w}\\b`).test(j)) && !out.some(x => x.w === r.w)) out.push(r); }
        return out;
    }
    /** 🎶 chansons de ses métiers */
    function songsFor(rows, life) {
        const jobs = jobsOnly(life); if (!jobs) return [];
        const keys = [...new Set(rows.map(r => r.job))].filter(k => new RegExp(`\\b${fold(k)}s?\\b`).test(jobs) || (k === 'berger' && /\bbergere?s?\b|\bpatre\b/.test(jobs)) || (k === 'marin' && /\bmatelot|marin pecheur|navigateur\b/.test(jobs)));
        return rows.filter(r => keys.includes(r.job));
    }
    /** ✏️ l'année de ses 12 ans, s'il avait 12 ans entre 1866 et 1936 (le certificat d'études) */
    function schoolYear(life) { const b = num(life?.person?.birth); return b !== null && b + 12 >= 1866 && b + 12 <= 1936 ? b + 12 : null; }
    /** 🌊 au bord de la mer : un phare (ha-phares) à moins de 15 km ; la station la plus proche (Brest ou Marseille) */
    function coastal(phares, lat, lon) { return near(phares, lat, lon, 15, 1).length > 0; }
    function stationFor(stations, lat, lon) { const med = lon > 2.9 && lat < 44.6; return stations.find(s => (med ? /marseille/i : /brest/i).test(s.name)) || null; }
    /** 🌊 le niveau d'une année (moyenne des années voisines s'il manque) et le dernier niveau connu */
    function seaLevel(rows, st, y) {
        const S = rows.filter(r => r.st === st);
        const exact = S.find(r => r.y === y); if (exact) return exact.mm;
        const nb = S.filter(r => Math.abs(r.y - y) <= 2); return nb.length ? Math.round(nb.reduce((a, r) => a + r.mm, 0) / nb.length) : null;
    }
    function seaFor(D, phares, life) {
        if (!D?.rows?.length) return null;
        const m = placedEvents(life).find(e => e.tag === 'MARR' && e.year !== null && coastal(phares, e.lat, e.lon)) || placedEvents(life).find(e => ['BIRT', 'BAPM'].includes(e.tag) && e.year !== null && coastal(phares, e.lat, e.lon));
        if (!m) return null;
        const st = stationFor(D.meta.stations || [], m.lat, m.lon); if (!st) return null;
        const S = D.rows.filter(r => r.st === st.id); if (!S.length) return null;
        const last = S.reduce((a, r) => (r.y > a.y ? r : a)), then = seaLevel(D.rows, st.id, m.year);
        if (then === null || m.year >= last.y - 5) return null;
        return {ev: m, station: st, year: m.year, last: last.y, cm: Math.round((last.mm - then) / 10)};
    }
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const core = {num, fold, table, km, lifeSpan, aliveIn, placedEvents, near, nearLife, jobsText, isDead, worksFor, foundedFor, sanasFor, prisonFor, romansFor, cavesFor, tourFor, dicoFor, songsFor, schoolYear, coastal, stationFor, seaLevel, seaFor, safeUrl,
        NAVAL_JOB, SUGAR_JOB, AUTO_JOB, PRISON_WORD};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-i';
    const TAB = ['telech_i', '25ti', '⚓ Le pays au travail et à l’école'];
    const BLOCK = 'telech_i';
    const PARTS = [
        ['navals', '⚓ Chantiers navals et corderies', 'Les chantiers navals, corderies et arsenaux près de chez eux (plus loin pour un charpentier de marine, un cordier).'],
        ['autos', '🚗 Les premiers constructeurs automobiles', 'Les constructeurs automobiles fondés avant 1914 près de chez eux, pendant leur vie.'],
        ['sucreries', '🍬 Sucreries de betterave', 'Les sucreries près de chez eux (plus loin pour un ouvrier sucrier).'],
        ['sanas', '🏥 Sanatoriums', 'Un sanatorium tout près du lieu de décès (personnes décédées seulement) ; sur la fiche d’un village.'],
        ['prisons', '🔒 Maisons centrales et registres d’écrou', 'Les maisons centrales et où chercher les registres d’écrou — sur la fiche seulement si elle parle de prison (personnes décédées).'],
        ['maree', '🌊 Le niveau de la mer', 'Au bord de la mer : de combien la mer était plus basse à Brest ou à Marseille le jour du mariage (PSMSL).'],
        ['grottes', '🎨 Grottes ornées', 'La grotte ornée la plus proche du village natal (données déjà dans « 🧺 Vie de tous les jours »).'],
        ['romains', '🏛 Ponts et aqueducs romains', 'Les ponts et aqueducs romains près de chez eux.'],
        ['hippodromes', '🐎 Hippodromes', 'Les hippodromes ouverts près de chez eux pendant leur vie.'],
        ['societes', '🎺 Sociétés d’autrefois', 'Secours mutuels, tir, gymnastique, orphéons : ce que c’était, et où chercher (liens).'],
        ['tour', '🧭 Le Tour de la France par deux enfants', 'Les villes où passent André et Julien (1877), avec la phrase du livre.'],
        ['dico', '📕 Son métier dans le dictionnaire', 'La définition de son métier en 1860 (Soulice), et le Petit Larousse de 1911 en lien.'],
        ['ecole', '✏️ Ce qu’il fallait savoir à 12 ans', 'Dictées et certificat d’études : quelques textes d’époque, recopiés tels quels.'],
        ['chansons', '🎶 Chansons de métier', 'Les chansons de son métier (forgeron, fileuse, marin…) dans les recueils anciens.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="ti-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row ti-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="ti-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const quote = t => (t ? `<q class="ti-quote">${esc(t)}</q>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const isQ = q => /^Q\d+$/.test(String(q || ''));
    const wd = q => (isQ(q) ? `https://www.wikidata.org/wiki/${q}` : '');
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (CC0)`,
        wp: (u, label = 'Wikipédia') => `${link(u || 'https://fr.wikipedia.org', label)} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs de Wikipédia'))})`,
        ws: (u, label) => `${link(u || 'https://fr.wikisource.org', label || 'Wikisource')} (${esc(T('texte du domaine public ; transcription CC BY-SA 4.0'))})`,
        psmsl: () => `${link('https://psmsl.org/data/obtaining/', 'PSMSL')} — Holgate et al. 2013 (${link('https://doi.org/10.2112/JCOASTRES-D-12-00175.1', 'doi')})`,
        tq: () => `${link('https://www.wikidata.org/wiki/Q11269813', 'Wikidata')} (CC0, ${esc(T('déjà dans « 🧺 Vie de tous les jours »'))})`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {navals: 'ti-navals', autos: 'ti-autos', sucreries: 'ti-sucreries', sanas: 'ti-sanas', centrales: 'ti-centrales', maregraphe: 'ti-maregraphe', romains: 'ti-romains',
        hippodromes: 'ti-hippodromes', tour: 'ti-tour', dico: 'ti-dico', ecole: 'ti-ecole', chansons: 'ti-chansons', contexte: 'ti-contexte', tq_sites: 'tq-sites', phares: 'ha-phares'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!FILES[kind]) return Promise.resolve(null);
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: kind === 'tq_sites' ? table(f).map(r => ({q: r.qid, n: r.nom, lat: r.lat, lon: r.lon, k: r.sorte, frwiki: r['wikipédia_fr']})) : table(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    const ctx = async key => (await rowsOf('contexte')).rows.find(r => r.key === key) || null;
    const ctxLine = c => (c ? `<p class="ti-ctx">${quote(c.q)} ${srcLink(c.url)}</p>` : '');
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));
    const lui = P => (P?.gender === 'female' ? T('elle') : T('lui'));

    /* ─────────── les morceaux ─────────── */
    const ICON = {'chantier naval': '⚓', corderie: '🪢', arsenal: '⚓', 'base navale': '⚓', 'constructeur automobile': '🚗', sucrerie: '🍬', sanatorium: '🏥', 'maison centrale': '🔒',
        prison: '🔒', 'pont romain': '🏛', 'aqueduc romain': '🏛', hippodrome: '🐎', grotte: '🎨'};
    const dates = r => (r.from || r.to ? `${r.from ? esc(String(r.from)) : '?'}${r.to ? `–${esc(String(r.to))}` : ''}` : '');
    const placeLi = x => { const r = x.r, bits = [esc(T(r.k || '')), dates(r), r.commune ? esc(r.commune) : '', x.km !== undefined ? esc(kmTxt(x.km)) : '', r.dup ? esc(T('aussi dans « 🕰 Son époque »')) : ''].filter(Boolean);
        return `<li>${ICON[r.k] || '📍'} <b>${link(wp(r.frwiki) || wd(r.q), r.n || T(r.k || ''))}</b> <small class="muted">(${bits.join(' · ')})</small> ${srcLink(wd(r.q) || wp(r.frwiki))}</li>`; };
    const nameKm = x => `<b>${esc(x.r.n)}</b> (${esc(kmTxt(x.km))})`;
    function listHtml(icon, list, lead, src, tail = '', max = 12) {
        return row(icon, `${lead} ${srcLink(wd(list[0].r.q) || wp(list[0].r.frwiki))}`, src, more(`<ul class="hist-ul ti-ul">${list.slice(0, max).map(placeLi).join('')}</ul>${tail}`, list.length));
    }
    const ECROU_LINKS = () => `<p class="muted ti-links">${esc(T('Les registres d’écrou (entrées et sorties des détenus) sont en général aux Archives départementales du lieu de la prison :'))} ${link('https://francearchives.gouv.fr/fr/search?q=registre%20d%27%C3%A9crou', T('↗ chercher « registre d’écrou » sur FranceArchives'))} · ${link('https://francearchives.gouv.fr/fr/service', T('↗ les services d’archives'))}</p>`;
    const LAROUSSE = w => `https://archive.org/details/petitlarousseillustre1911?q=${encodeURIComponent(String(w || '').toLowerCase())}`;
    const tourLi = (x, meta) => `<li>🧭 <b>${esc(x.r.commune)}</b> <small class="muted">(${esc(T('chapitre {c}', {c: x.r.roman}))}${x.km !== undefined ? ` · ${esc(kmTxt(x.km))}` : ''})</small><br><small class="muted">${esc(x.r.title)}</small>${quote(x.r.q)} ${link(String(meta.chapter_url || '').replace('{c}', String(x.r.ch).padStart(3, '0')), T('↗ lire le chapitre'))}</li>`;
    function tourHtml(list, lead, meta) {
        return row('🧭', `${lead} ${quote(list[0].r.q)} ${srcLink(String(meta.chapter_url || '').replace('{c}', String(list[0].r.ch).padStart(3, '0')))}`, LIC.ws(meta.url, T('G. Bruno, « Le Tour de la France par deux enfants » (éd. 1904)')),
            more(`<ul class="hist-ul ti-ul">${list.slice(1, 12).map(x => tourLi(x, meta)).join('')}</ul>${hyp(T('André et Julien quittent Phalsbourg, en Lorraine annexée, et font le tour de la France : le livre de lecture des écoles, publié en 1877 (ici l’édition de 1904).'))}`, list.length - 1));
    }
    const songLi = r => `<li>🎶 <b>${link(r.url, r.t)}</b> <small class="muted">(${esc(r.book)}${r.author ? ` · ${esc(r.author)}` : ''} · ${esc(String(r.y))})</small>${quote(r.first)}</li>`;
    const ecoleLi = r => `<li>✏️ <b>${esc(r.label)}</b> <small class="muted">(${esc(r.book)}, ${esc(String(r.y))})</small>${quote(r.q)} ${srcLink(r.url)}</li>`;

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['navals', 'autos', 'sucreries', 'sanas', 'prisons', 'maree', 'grottes', 'romains', 'hippodromes', 'tour', 'dico', 'ecole', 'chansons'];
    const JOBS = {
        navals: async life => { const D = await rowsOf('navals'); const {job, list} = worksFor(D.rows, life, NAVAL_JOB); if (!list.length) return '';
            const lead = job ? T('Son métier touchait aux navires : {l} près de ses lieux.', {l: list.slice(0, 2).map(nameKm).join(', ')}) : T('Près de chez {e} : {l}.', {e: esc(lui(life.person)), l: list.slice(0, 2).map(nameKm).join(', ')});
            return listHtml('⚓', list, lead, LIC.wd(), ctxLine(await ctx('navals'))); },
        autos: async life => { const D = await rowsOf('autos'); const job = AUTO_JOB.test(jobsOnly(life)); const list = foundedFor(D.rows, life, job ? 30 : 12); if (!list.length) return '';
            const x = list[0]; return listHtml('🚗', list, T('En {y}, à {c} ({k} de {p}), naît le constructeur automobile {n}.', {y: esc(String(x.r.from)), c: esc(x.r.commune || x.place), k: esc(kmTxt(x.km)), p: esc(x.place), n: `<b>${esc(x.r.n)}</b>`}), LIC.wd(), ctxLine(await ctx('autos'))); },
        sucreries: async life => { const D = await rowsOf('sucreries'); const {job, list} = worksFor(D.rows, life, SUGAR_JOB); if (!list.length) return '';
            const lead = job ? T('Son métier touchait au sucre : {l} près de ses lieux.', {l: list.slice(0, 2).map(nameKm).join(', ')}) : T('Près de chez {e} : {l}.', {e: esc(lui(life.person)), l: list.slice(0, 2).map(nameKm).join(', ')});
            return listHtml('🍬', list, lead, LIC.wd(), `${ctxLine(await ctx('sucreries'))}${hyp(T('Les anciennes sucreries recensées par l’État (CASIAS) sont aussi dans « ⛏️ Métiers et rivières ».'))}`); },
        sanas: async life => { const D = await rowsOf('sanas'); const list = sanasFor(D.rows, life); if (!list.length) return '';
            const x = list[0]; return listHtml('🏥', list, T('Le {n} se trouvait à {k} du lieu de son décès ({p}).', {n: `<b>${esc(x.r.n)}</b>`, k: esc(kmTxt(x.km)), p: esc(x.place)}), LIC.wd(),
                `${ctxLine(await ctx('sanas'))}${hyp(T('Cela ne dit pas qu’il y était soigné : seulement que le sanatorium était là. L’acte de décès le dit parfois (« décédé au sanatorium de … »).'))}`); },
        prisons: async life => { const [C, H] = await Promise.all([rowsOf('centrales'), quiet(loadHA())]);
            const rows = [...C.rows, ...((H?.rows) || []).filter(r => /prison/.test(r.kinds || '') && !C.rows.some(c => c.q === r.q)).map(r => ({...r, k: 'prison'}))];
            const list = prisonFor(rows, life); if (!list.length) return '';
            return listHtml('🔒', list, T('Sa fiche parle de prison : {l} près de ses lieux.', {l: list.slice(0, 2).map(nameKm).join(', ')}), LIC.wd(), `${ctxLine(await ctx('ecrou'))}${ECROU_LINKS()}`); },
        maree: async life => { const [D, P] = await Promise.all([quiet(load('maregraphe')), rowsOf('phares')]); const r = seaFor(D, P.rows, life); if (!r) return '';
            const lead = r.cm >= 0 ? T('En {y}, à {s}, la mer était {n} cm plus basse qu’en {l}.', {y: `<b>${esc(String(r.year))}</b>`, s: esc(r.station.name), n: `<b>${esc(String(r.cm))}</b>`, l: esc(String(r.last))})
                : T('En {y}, à {s}, la mer était {n} cm plus haute qu’en {l}.', {y: `<b>${esc(String(r.year))}</b>`, s: esc(r.station.name), n: `<b>${esc(String(-r.cm))}</b>`, l: esc(String(r.last))});
            return row('🌊', `${lead} ${esc(T('({e} à {p}, au bord de la mer.)', {e: r.ev.tag === 'MARR' ? T('Son mariage') : T('Sa naissance'), p: r.ev.name}))} ${srcLink('https://psmsl.org/data/obtaining/')}`, LIC.psmsl(),
                `${ctxLine(await ctx('maregraphe'))}${hyp(T('Niveau moyen de l’année, mesuré par le marégraphe de la station (référence locale révisée du PSMSL). Ailleurs sur la côte, la différence peut être un peu autre.'))}`); },
        grottes: async life => { const D = await rowsOf('tq_sites'); const list = cavesFor(D.rows, life); if (!list.length) return '';
            const x = list[0]; return row('🎨', `${T('À {k} de {p}, où {e} est né : la grotte ornée {n}.', {k: esc(kmTxt(x.km)), p: esc(x.place), e: esc(he(life.person)), n: `<b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b>`})} ${srcLink(wd(x.r.q))}`, LIC.tq(),
                more(`${list.length > 1 ? `<ul class="hist-ul ti-ul">${list.slice(1, 8).map(y => placeLi({...y, r: {...y.r, k: 'grotte'}})).join('')}</ul>` : ''}${ctxLine(await ctx('grottes'))}`, list.length - 1)); },
        romains: async life => { const D = await rowsOf('romains'); const list = romansFor(D.rows, life); if (!list.length) return '';
            return listHtml('🏛', list, T('Près de ses lieux, un ouvrage romain : {l}.', {l: list.slice(0, 2).map(nameKm).join(', ')}), LIC.wd(), ctxLine(await ctx('romains'))); },
        hippodromes: async life => { const D = await rowsOf('hippodromes'); const list = foundedFor(D.rows, life, 12); if (!list.length) return '';
            const x = list[0]; return listHtml('🐎', list, T('En {y}, on ouvre l’hippodrome {n} ({k} de {p}).', {y: esc(String(x.r.from)), n: `<b>${esc(x.r.n)}</b>`, k: esc(kmTxt(x.km)), p: esc(x.place)}), LIC.wd(), ctxLine(await ctx('hippodromes'))); },
        tour: async life => { const D = await quiet(load('tour')); if (!D) return ''; const list = tourFor(D.rows, life); if (!list.length) return '';
            return tourHtml(list, T('Dans « Le Tour de la France par deux enfants », André et Julien passent à {c}, près de {p} :', {c: `<b>${esc(list[0].r.commune)}</b>`, p: esc(list[0].place)}), D.meta); },
        dico: async life => { const D = await quiet(load('dico')); if (!D) return ''; const list = dicoFor(D.rows, life); if (!list.length) return '';
            const r = list[0];
            return row('📕', `${esc(T('En 1860, un petit dictionnaire d’école définissait son métier :'))} ${quote(r.def)} ${srcLink(r.url)}`, LIC.ws(D.meta.url, T('Th. Soulice, « Petit dictionnaire de la langue française » (1860)')),
                `${list.slice(1).map(x => quote(x.def)).join('')}<p class="muted ti-links">${link(LAROUSSE(r.w), T('↗ « {w} » dans le Petit Larousse illustré de 1911 (scan, Internet Archive)', {w: r.w.toLowerCase()}))}</p>`); },
        ecole: async life => { const D = await quiet(load('ecole')); if (!D) return ''; const y = schoolYear(life); if (y === null) return '';
            const dic = D.rows.filter(r => r.k === 'dictee'), oth = D.rows.filter(r => r.k !== 'dictee');
            return row('✏️', `${T('À 12 ans, vers {y}, {e} pouvait avoir à écrire une dictée comme celle-ci :', {y: `<b>${esc(String(y))}</b>`, e: esc(he(life.person))})} ${quote(dic[0]?.q)} ${srcLink(dic[0]?.url)}`, LIC.ws(D.meta.url, T('livres et revues d’école')),
                more(`<ul class="hist-ul ti-ul">${[...dic.slice(1), ...oth].map(ecoleLi).join('')}</ul>${ctxLine(await ctx('certif'))}<p class="muted ti-links">${(D.meta.links || []).map(l => link(l[1], `↗ ${T(l[0])}`)).join(' · ')}</p>`, dic.length - 1 + oth.length)); },
        chansons: async life => { const D = await quiet(load('chansons')); if (!D) return ''; const list = songsFor(D.rows, life); if (!list.length) return '';
            const r = list[0];
            return row('🎶', `${T('Une chanson de son métier ({j}) : {t}.', {j: esc(T(r.job)), t: `<b>${link(r.url, r.t)}</b>`})} ${quote(r.first)} ${srcLink(r.url)}`, LIC.ws(D.meta.url, T('recueils de chansons')),
                more(`<ul class="hist-ul ti-ul">${list.slice(1, 12).map(songLi).join('')}</ul>${hyp(T('Les chansons populaires datées de son enfance sont dans « 🎼 Les chansons de son enfance ».'))}`, list.length - 1)); }};
    let haMemo = null;
    const loadHA = () => (haMemo ||= fetch('assets/data/ha-institutions.json.gz?v=1', {credentials: 'same-origin'}).then(r => (r.ok ? readMaybeGz(r) : null)).then(f => (f ? {meta: f, rows: table(f).filter(r => r.country === 'France')} : null)).catch(() => { haMemo = null; return null; }));
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life ti-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        return A().card(index, T('⚓ Le pays au travail et à l’école'), '', `<div class="ti-block" data-ti-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-ti-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tiPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['navals', 'autos', 'sucreries', 'sanas', 'prisons', 'maree', 'romains', 'hippodromes', 'tour', 'societes'];
    const R = {navals: 12, autos: 12, sucreries: 12, sanas: 10, prisons: 10, romains: 10, hippodromes: 10};
    const LEAD = {navals: 'Chantiers navals, corderies et arsenaux à moins de {r} km : {l}.', autos: 'Constructeurs automobiles d’avant 1914 à moins de {r} km : {l}.', sucreries: 'Sucreries à moins de {r} km : {l}.',
        sanas: 'Sanatoriums à moins de {r} km : {l}.', prisons: 'Maisons centrales à moins de {r} km : {l}.', romains: 'Ponts et aqueducs romains à moins de {r} km : {l}.', hippodromes: 'Hippodromes à moins de {r} km : {l}.'};
    const PICON = {navals: '⚓', autos: '🚗', sucreries: '🍬', sanas: '🏥', prisons: '🔒', romains: '🏛', hippodromes: '🐎'};
    const CTXKEY = {navals: 'navals', autos: 'autos', sucreries: 'sucreries', sanas: 'sanas', prisons: 'centrales', romains: 'romains', hippodromes: 'hippodromes'};
    const fa = q => `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(q)}`;
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll && kind !== 'societes') return '';
        const name = place.name || '';
        if (R[kind]) {
            const D = await rowsOf(kind === 'prisons' ? 'centrales' : kind); const list = near(D.rows, ll.lat, ll.lon, R[kind], 15); if (!list.length) return '';
            const lead = T(LEAD[kind], {r: String(R[kind]), l: list.slice(0, 3).map(x => `<b>${esc(x.r.n)}</b>${x.km >= 1 ? ` (${esc(kmTxt(x.km))})` : ''}${x.r.from ? ` <small class="muted">${esc(String(x.r.from))}</small>` : ''}`).join(', ')});
            const tail = `${ctxLine(await ctx(CTXKEY[kind]))}${kind === 'prisons' ? `${ctxLine(await ctx('ecrou'))}${ECROU_LINKS()}${hyp(T('Les autres prisons et bagnes sont dans « 🧭 Histoire autour ».'))}` : ''}`;
            return listHtml(PICON[kind], list, lead, LIC.wd(), tail);
        }
        if (kind === 'maree') { const [D, P] = await Promise.all([quiet(load('maregraphe')), rowsOf('phares')]); if (!D?.rows?.length || !coastal(P.rows, ll.lat, ll.lon)) return '';
            const st = stationFor(D.meta.stations || [], ll.lat, ll.lon); if (!st) return ''; const S = D.rows.filter(r => r.st === st.id); if (!S.length) return '';
            const first = S.reduce((a, r) => (r.y < a.y ? r : a)), last = S.reduce((a, r) => (r.y > a.y ? r : a)), y1900 = seaLevel(D.rows, st.id, 1900);
            return row('🌊', `${T('Le village est au bord de la mer. À {s}, le niveau moyen de la mer est mesuré depuis {a} : il a monté de {n} cm entre {a} et {b}.', {s: esc(st.name), a: esc(String(first.y)), b: esc(String(last.y)), n: `<b>${esc(String(Math.round((last.mm - first.mm) / 10)))}</b>`})}${y1900 !== null ? ` ${esc(T('Depuis 1900 : {n} cm.', {n: String(Math.round((last.mm - y1900) / 10))}))}` : ''} ${srcLink('https://psmsl.org/data/obtaining/')}`, LIC.psmsl(), ctxLine(await ctx('maregraphe'))); }
        if (kind === 'tour') { const D = await quiet(load('tour')); if (!D) return ''; const list = near(D.rows, ll.lat, ll.lon, 10, 12); if (!list.length) return '';
            return tourHtml(list, T('Dans « Le Tour de la France par deux enfants » (1877), André et Julien passent à {c} :', {c: `<b>${esc(list[0].r.commune)}</b>`}), D.meta); }
        if (kind === 'societes') { const C = await rowsOf('contexte'); const pick = ['mutuelles', 'tir', 'gym', 'orpheons'].map(k => C.rows.find(r => r.key === k)).filter(Boolean); if (!pick.length) return '';
            const q = s => fa(`${s}${name ? ` ${name}` : ''}`);
            return row('🎺', `${esc(T('Au XIXe siècle, beaucoup de communes avaient leur société de secours mutuels, leur société de tir ou de gymnastique (après 1871), leur orphéon ou leur fanfare.'))}`, LIC.wp('https://fr.wikipedia.org/wiki/Soci%C3%A9t%C3%A9_de_secours_mutuel'),
                more(`${pick.map(c => `<p class="ti-ctx"><b>${esc(c.title)}</b> ${quote(c.q)} ${srcLink(c.url)}</p>`).join('')}<p class="muted ti-links">${esc(T('Leurs statuts, listes de membres et fêtes sont aux Archives départementales (séries M et X) :'))} ${link(q('société de secours mutuels'), T('↗ secours mutuels'))} · ${link(q('société de tir'), T('↗ sociétés de tir'))} · ${link(q('société de gymnastique'), T('↗ gymnastique'))} · ${link(q('orphéon'), T('↗ orphéons et fanfares'))} <small>(FranceArchives)</small></p>${hyp(T('Wikidata ne connaît presque aucune de ces sociétés (une ou deux par sorte) : pas de liste ici, seulement où chercher.'))}`, pick.length)); }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel ti-panel"><h3>${esc(T('⚓ Le pays au travail et à l’école'))}</h3><div class="hist-life ti-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'ti_place', host: '[data-ti-host]', icon: '⚓', label: 'Le pays au travail et à l’école', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-ti])'); if (!village) return;
        village.dataset.ti = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-tf-host]') || village.querySelector('[data-td-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="ti-place" data-ti-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-ti-host]'), villagePlace(village));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['navals', 'ti_navals', '⚓', 'Chantiers navals et corderies', 'Le lieu'], ['autos', 'ti_autos', '🚗', 'Constructeurs automobiles d’avant 1914', 'Le lieu'],
        ['sucreries', 'ti_sucreries', '🍬', 'Sucreries', 'Le lieu'], ['sanas', 'ti_sanas', '🏥', 'Sanatoriums', 'Le lieu'], ['prisons', 'ti_prisons', '🔒', 'Maisons centrales et registres d’écrou', 'Le lieu'],
        ['maree', 'ti_maree', '🌊', 'Le niveau de la mer', 'Le lieu'], ['romains', 'ti_romains', '🏛', 'Ponts et aqueducs romains', 'Le lieu'], ['hippodromes', 'ti_hippodromes', '🐎', 'Hippodromes', 'Le lieu'],
        ['tour', 'ti_tour', '🧭', 'Le Tour de la France par deux enfants', 'Le monde'], ['societes', 'ti_societes', '🎺', 'Sociétés d’autrefois', 'Le lieu']];
    const SRC_TXT = {navals: 'Wikidata (CC0)', autos: 'Wikidata (CC0)', sucreries: 'Wikidata (CC0)', sanas: 'Wikidata (CC0)', prisons: 'Wikidata (CC0) ; FranceArchives (liens)', maree: 'PSMSL (Holgate et al. 2013)',
        romains: 'Wikidata (CC0)', hippodromes: 'Wikidata (CC0)', tour: 'G. Bruno 1904 (domaine public) ; Wikisource', societes: 'Wikipédia (CC BY-SA 4.0) ; FranceArchives (liens)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, group]) => ({
        id, icon, label, group, defaultOn: kind !== 'societes', enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life ti-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const L = (id, pack, icon, label, group, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), group, source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); }, ...extra});
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    const placeFields = [F('name', 'Nom'), F('kind', 'Sorte', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’en', 'year'), F('commune', 'Commune', 'place'), F('src', 'Source', 'url')];
    const placeList = (kind, label, icon, partKey) => L(`ti_${kind}`, `ti-${kind}`, icon, label, 'Le lieu', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Wikidata:Copyright', partKey,
        async () => (await rowsOf(kind)).rows.map(r => ({name: r.n, kind: T(r.k), from: r.from, to: r.to, commune: r.commune || '', lat: r.lat, lon: r.lon, src: wd(r.q)})), placeFields,
        {period: r => [r.from, r.to], geo: r => [r.lat, r.lon]});
    (ext.dataLists = ext.dataLists || []).push(
        placeList('navals', 'Chantiers navals, corderies et arsenaux', '⚓', 'navals'), placeList('autos', 'Constructeurs automobiles fondés avant 1914', '🚗', 'autos'),
        placeList('sucreries', 'Sucreries et raffineries de sucre', '🍬', 'sucreries'), placeList('sanas', 'Sanatoriums', '🏥', 'sanas'), placeList('centrales', 'Maisons centrales', '🔒', 'prisons'),
        placeList('romains', 'Ponts et aqueducs romains', '🏛', 'romains'), placeList('hippodromes', 'Hippodromes', '🐎', 'hippodromes'),
        L('ti_maregraphe', 'ti-maregraphe', '🌊', 'Niveau moyen de la mer à Brest et Marseille', 'Le monde', 'PSMSL (Holgate et al. 2013)', 'https://psmsl.org/data/obtaining/', 'maree',
            async () => { const D = await rowsOf('maregraphe'); const st = Object.fromEntries((D.meta.stations || []).map(s => [s.id, s.name])); return D.rows.map(r => ({station: st[r.st] || String(r.st), year: r.y, mm: r.mm, src: 'https://psmsl.org/data/obtaining/'})); },
            [F('station', 'Station', 'enum'), F('year', 'Année', 'year'), F('mm', 'Niveau moyen (mm)', 'number'), F('src', 'Source', 'url')], {period: r => [r.year, r.year]}),
        L('ti_tour', 'ti-tour', '🧭', 'Le Tour de la France par deux enfants : les villes', 'Le monde', 'G. Bruno 1904 (domaine public) ; Wikisource', 'https://fr.wikisource.org/wiki/Le_Tour_de_la_France_par_deux_enfants', 'tour',
            async () => { const D = await rowsOf('tour'); return D.rows.map(r => ({ch: r.ch, commune: r.commune, title: r.title, quote: r.q, lat: r.lat, lon: r.lon, src: String(D.meta.chapter_url || '').replace('{c}', String(r.ch).padStart(3, '0'))})); },
            [F('ch', 'Chapitre', 'number'), F('commune', 'Ville', 'place'), F('title', 'Titre du chapitre'), F('quote', 'La phrase du livre'), F('src', 'Source', 'url')], {geo: r => [r.lat, r.lon]}),
        L('ti_dico', 'ti-dico', '📕', 'Les métiers dans le dictionnaire de 1860 (Soulice)', 'Le monde', 'Soulice 1860 (domaine public) ; Wikisource', 'https://fr.wikisource.org/wiki/Petit_dictionnaire_de_la_langue_fran%C3%A7aise_(1860)', 'dico',
            async () => (await rowsOf('dico')).rows.map(r => ({word: r.w, def: r.def, larousse: LAROUSSE(r.w), src: r.url})), [F('word', 'Mot'), F('def', 'Définition de 1860'), F('larousse', 'Petit Larousse 1911 (scan)', 'url'), F('src', 'Source', 'url')]),
        L('ti_ecole', 'ti-ecole', '✏️', 'Dictées et certificat d’études : textes d’époque', 'Le monde', 'Wikisource (domaine public)', 'https://fr.wikisource.org', 'ecole',
            async () => (await rowsOf('ecole')).rows.map(r => ({label: r.label, book: r.book, year: r.y, text: r.q, src: r.url})), [F('label', 'Titre'), F('book', 'Livre ou revue'), F('year', 'Année', 'year'), F('text', 'Le texte'), F('src', 'Source', 'url')], {period: r => [r.year, r.year]}),
        L('ti_chansons', 'ti-chansons', '🎶', 'Chansons de métier (recueils du domaine public)', 'Le monde', 'Wikisource (domaine public)', 'https://fr.wikisource.org', 'chansons',
            async () => (await rowsOf('chansons')).rows.map(r => ({job: T(r.job), title: r.t, book: r.book, author: r.author, year: r.y, first: r.first, src: r.url})),
            [F('job', 'Métier', 'enum'), F('title', 'Chanson'), F('book', 'Recueil'), F('author', 'Auteur'), F('year', 'Année', 'year'), F('first', 'Premier vers'), F('src', 'Source', 'url')], {period: r => [r.year, r.year]}));

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, label2 = r => r.n) => ({id, icon, label: T(label), group: 'Le lieu', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 2000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || num(r.to) === null || r.to >= from) && (!to || num(r.from) === null || r.from <= to) && (!q || fold(label2(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: label2(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        ...[['navals', '⚓', 'Chantiers navals, corderies et arsenaux'], ['autos', '🚗', 'Constructeurs automobiles d’avant 1914'], ['sucreries', '🍬', 'Sucreries'], ['sanas', '🏥', 'Sanatoriums'],
            ['centrales', '🔒', 'Maisons centrales'], ['romains', '🏛', 'Ponts et aqueducs romains'], ['hippodromes', '🐎', 'Hippodromes']].map(([k, i, l]) => layer(`ti_${k}`, i, l, async () => (await rowsOf(k)).rows, 'Wikidata (CC0)', r => (r.from ? `${r.n} (${r.from})` : r.n))),
        layer('ti_tour', '🧭', 'Le Tour de la France par deux enfants', async () => (await rowsOf('tour')).rows.map(r => ({...r, from: 1877, to: 1877})), 'G. Bruno 1904 ; Wikisource', r => `${r.commune} (ch. ${r.roman})`));

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = c => Number(c.person?.id || c.person?.person?.id || c.person) || 0;
    async function runPerson(parts, c, host, empty) {
        const id = personOfCtx(c); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, c, host) {
        const pl = placeOfCtx(c.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life ti-life">${html}</div>` : '';
        return !!html;
    }
    const DS = (id, icon, label, parts, empty) => ({id, icon, label: T(label), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (c, host) => runPerson(parts, c, host, empty)});
    (ext.dataSources = ext.dataSources || []).push(
        DS('tip_travail', '⚓', 'Chantiers navals, sucreries, automobiles près de chez lui', ['navals', 'sucreries', 'autos'], 'Rien de connu près de ses lieux.'),
        DS('tip_soin', '🏥', 'Sanatorium et prison (personnes décédées)', ['sanas', 'prisons'], 'Rien : seulement pour une personne décédée (lieu de décès près d’un sanatorium, ou fiche qui parle de prison).'),
        DS('tip_paysage', '🏛', 'Ponts romains, grottes ornées, hippodromes, la mer', ['romains', 'grottes', 'hippodromes', 'maree'], 'Rien de connu près de ses lieux.'),
        DS('tip_ecole', '✏️', 'Le Tour de la France, la dictée, le dictionnaire, les chansons de son métier', ['tour', 'ecole', 'dico', 'chansons'], 'Il faut sa date de naissance, un métier ou un lieu placé.'),
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (c, host) => runPlace(kind, c, host)})));

    /* ─────────── ⚙️ Réglages → ⚓ Le pays au travail et à l'école ─────────── */
    const FILE_LABEL = [['navals', '⚓ Chantiers navals'], ['autos', '🚗 Constructeurs automobiles'], ['sucreries', '🍬 Sucreries'], ['sanas', '🏥 Sanatoriums'], ['centrales', '🔒 Maisons centrales'],
        ['maregraphe', '🌊 Niveau de la mer (PSMSL)'], ['romains', '🏛 Ponts et aqueducs romains'], ['hippodromes', '🐎 Hippodromes'], ['tour', '🧭 Le Tour de la France'], ['dico', '📕 Dictionnaire de 1860'],
        ['ecole', '✏️ Dictées et certificat'], ['chansons', '🎶 Chansons de métier'], ['contexte', '📖 Phrases de Wikipédia']];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-ti-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(k === 'maregraphe' ? T('À fabriquer sur GitHub (Actions → « Le pays au travail et à l’école (lot I) », quoi = maregraphe) ; arrive ensuite par Réglages → 🗂 Données.') : T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings ti-settings" data-ti-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Le pays au travail et à l’école'), icon: '⚓', where: T('Réglages · Données'), help: esc(T('Chantiers navals, automobiles, sucreries, sanatoriums, maisons centrales, niveau de la mer, grottes ornées, ponts romains, hippodromes, sociétés, Tour de la France, dictionnaire, dictées et chansons de métier.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « ⚓ Le pays au travail et à l’école »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes, les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Seuls les liens « ↗ » ouvrent une page, quand on clique.'))}</p>
                <p class="muted">${esc(T('Déjà dans l’app et réutilisé : les grottes ornées (« 🧺 Vie de tous les jours »), les phares (« 🧭 Histoire autour », pour savoir si un lieu est au bord de la mer), les prisons et bagnes (« 🧭 Histoire autour »), les sucreries CASIAS (« ⛏️ Métiers et rivières »), les chansons datées (« 🎼 Les chansons de son enfance »).'))}</p>
                <p class="muted">${esc(T('Liens seulement : le Petit Larousse (scan de 1911, Internet Archive), les registres d’écrou et les sociétés (FranceArchives), les sujets de problèmes du certificat (Internet Archive, Gallica).'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-ti-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.tiTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '⚓'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_f'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_f'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '⚓ Le pays au travail et à l’école']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechI = {...core, load, settings, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
