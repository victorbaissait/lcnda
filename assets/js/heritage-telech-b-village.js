/**
 * LCNDA — 🐑 La vie du village et la nature (téléchargements, lot B).
 * Ce qui est NEUF ici (le reste existe déjà dans l'app et n'est pas refait — voir docs/telechargements-lot-b.md) :
 *   ✝️ croix     calvaires, croix de chemin, oratoires                    tb-wd-croix   (+ tb-osm-croix)
 *   ⛲ eau       lavoirs, puits, fontaines                                tb-wd-eau     (+ tb-osm-eau)
 *   🍞 village   fours à pain (fours banaux), pigeonniers                 tb-wd-village (+ tb-osm-village)
 *   🪨 bornes    bornes frontières, octrois, douanes                      tb-wd-bornes  (+ tb-osm-bornes)
 *   🐑 berger    drailles (transhumance), burons, cabanes de berger       tb-wd-berger  (+ tb-osm-berger)
 *   🕍 cultes    temples protestants et synagogues                         tb-wd-cultes  (+ tb-osm-cultes)
 *   🍇 cepages   cépages et leur pays / lieu d'origine (Listes)            tb-cepages
 *   🍇 vendanges la date des vendanges près du village, année par année : PAS de fichier ici — on lit le jeu « hist_vendanges »
 *                du pack « Histoire du lieu » (lib/histoire.php, Daux et al. 2012), par la liste déjà enregistrée dans Listes
 * Sources : Wikidata (CC0 1.0) ; OpenStreetMap (ODbL 1.0, « © les contributeurs d'OpenStreetMap », fichiers tb-osm-* fabriqués sur
 *   GitHub : .github/workflows/telech-b.yml) ; Daux et al. 2012 / NOAA NCEI (données libres, à citer). Tout est lu sur l'ordinateur :
 *   rien ne part sur Internet (ni nom, ni lieu), pour personne. Seuls les liens « ↗ » ouvrent une page, sur un clic.
 * Où : fiche d'un village et Monographie de commune (une phrase par sujet, la liste sous « ▸ plus ») ; fiche d'une personne, bloc
 *   « 🐑 Son village et la nature » (le petit patrimoine près de chez lui ; les vendanges de sa naissance et de son mariage sont déjà
 *   dans « 🏘 Le lieu à son époque », heritage-histoire.js : pas refait ici) ;
 *   Listes (LCNDA_EXT.dataLists) ; Cartes (mapLayerSources) ; à la demande (LCNDA_EXT.dataSources) ;
 *   Réglages → « 🐑 Village et nature » (chaque sujet s'éteint ↶, À propos des données, liens seulement).
 * localStorage : « genealogie-telech-b ».   window.LCNDA_EXT.telechB = {core…, load, placeInto, personInto, openSettings}
 * Essai : tests/test-telech-b.js
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

    /** les lignes Wikidata et OpenStreetMap d'un sujet, en une liste : un point OSM à moins de 40 m d'un point Wikidata de la même
     *  sorte est le même objet (on garde Wikidata, qui a souvent la date et l'article) */
    function merge(wd, osm) {
        const out = (wd || []).map(r => ({...r, from: num(r.from), to: num(r.to), via: 'wd', url: r.src ? `https://www.wikidata.org/wiki/${r.src}` : ''}));
        const grid = new Map(), cell = (lat, lon) => `${Math.round(lat * 500)}|${Math.round(lon * 500)}`;
        for (const r of out) { const k = cell(r.lat, r.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r); }
        for (const o of osm || []) {
            if (!okLL(o)) continue;
            const la = Math.round(o.lat * 500), lo = Math.round(o.lon * 500);
            let dup = false;
            for (let i = -1; i <= 1 && !dup; i++) for (let j = -1; j <= 1 && !dup; j++) dup = (grid.get(`${la + i}|${lo + j}`) || []).some(w => w.k === o.k && km(w.lat, w.lon, o.lat, o.lon) < 0.04);
            if (dup) continue;
            const t = {n: 'node', w: 'way', r: 'relation'}[String(o.osm || '')[0]];
            out.push({k: o.k, n: o.n || '', lat: o.lat, lon: o.lon, from: num(o.from), to: null, commune: '', insee: '', country: 'France', mh: '', fr: '', via: 'osm',
                url: t ? `https://www.openstreetmap.org/${t}/${String(o.osm).slice(1)}` : ''});
        }
        return out;
    }
    /** les points à moins de radius km ; « year » : seulement ce qui existait cette année-là (construit avant, pas encore détruit) */
    function near(rows, ll, radius, year = null) {
        const out = [];
        if (!okLL(ll)) return out;
        const dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(ll.lat * Math.PI / 180)));
        for (const r of rows) {
            if (Math.abs(r.lat - ll.lat) > dLat || Math.abs(r.lon - ll.lon) > dLon) continue;
            if (year !== null && ((r.from !== null && r.from > year) || (r.to !== null && r.to < year))) continue;
            const d = km(ll.lat, ll.lon, r.lat, r.lon); if (d <= radius) out.push({r, km: d});
        }
        return out.sort((a, b) => a.km - b.km);
    }
    /** 🍇 les lignes de hist_vendanges ({code, region, year, days, diff, lat, lon…}) → la série la plus proche (≤ maxKm) :
     *  {code, region, km, rows (triées par année), mean (jours après le 31 août, la moyenne de la série), first, last} */
    function harvestSeries(rows, ll, maxKm = 150) {
        if (!okLL(ll)) return null;
        let best = null;
        for (const r of rows || []) { if (!okLL(r)) continue; const d = km(ll.lat, ll.lon, Number(r.lat), Number(r.lon)); if (d <= maxKm && (!best || d < best.km)) best = {code: r.code, region: r.region, km: d}; }
        if (!best) return null;
        const list = rows.filter(r => r.code === best.code).sort((x, y) => x.year - y.year);
        const means = list.filter(r => num(r.days) !== null && num(r.diff) !== null).map(r => r.days - r.diff);
        return {...best, rows: list, mean: means.length ? means.reduce((x, y) => x + y, 0) / means.length : null, first: list[0]?.year ?? null, last: list.at(-1)?.year ?? null};
    }
    /** jours après le 31 août → {m, d} (mois 8–11, jour) */
    function ghdDay(d) { const t = new Date(Date.UTC(2001, 7, 31 + Math.round(d))); return {m: t.getUTCMonth() + 1, d: t.getUTCDate()}; }
    const core = {num, fold, table, km, merge, near, harvestSeries, ghdDay};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-b';
    const TAB = ['telech_b', '25tb', '🐑 Village et nature'];
    const BLOCK = 'telech_b_village';
    // [sujet, icône, titre, rayon autour d'un lieu (km), mots de chaque sorte]
    const THEMES = [
        ['croix', '✝️', 'Calvaires et croix de chemin', 3, {croix: 'croix de chemin', calvaire: 'calvaire', oratoire: 'oratoire'}],
        ['eau', '⛲', 'Lavoirs, puits et fontaines', 3, {lavoir: 'lavoir', puits: 'puits', fontaine: 'fontaine'}],
        ['village', '🍞', 'Fours à pain et pigeonniers', 3, {four: 'four à pain', pigeonnier: 'pigeonnier'}],
        ['bornes', '🪨', 'Bornes, octrois et douanes', 10, {borne: 'borne', octroi: 'octroi', douane: 'douane'}],
        ['berger', '🐑', 'Transhumance et cabanes de berger', 20, {draille: 'draille', buron: 'buron', cabane: 'cabane de berger', orri: 'orri'}],
        ['cultes', '🕍', 'Temples protestants et synagogues', 15, {temple: 'temple protestant', synagogue: 'synagogue'}]];
    const TH = Object.fromEntries(THEMES.map(t => [t[0], t]));
    const PARTS = [...THEMES.map(([k, i, l]) => [k, `${i} ${l}`]), ['vendanges', '🍇 Les dates des vendanges'], ['cepages', '🍇 Les cépages (Listes)']];
    const SUBS = {croix: 'Les calvaires, croix de chemin et oratoires autour du village.', eau: 'Les lavoirs, puits et fontaines où l’on allait chercher l’eau et laver le linge.',
        village: 'Les fours à pain du village et les pigeonniers.', bornes: 'Les bornes des anciennes limites, les bureaux d’octroi et les douanes.',
        berger: 'Les chemins de transhumance (drailles), les burons et les cabanes de berger.', cultes: 'Les temples protestants et les synagogues de la région, avec leur date.',
        vendanges: 'Le jour où l’on vendangeait près du village, année par année (1354–2007), d’après le pack « Histoire du lieu ».', cepages: 'La liste des cépages et de leur pays ou lieu d’origine.'};
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const lang = () => root.LCNDA_I18N?.lang || document.documentElement.lang || 'fr';
    const kmTxt = k => (k < 1 ? T('{n} m', {n: String(Math.max(10, Math.round(k * 100) * 10))}) : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = url => (url ? `<a class="tb-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const row = (icon, html, src, extra = '') => `<div class="hist-row tb-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tb-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const pop = mh => (mh ? `https://pop.culture.gouv.fr/notice/merimee/${encodeURIComponent(mh)}` : '');
    const dayTxt = ({m, d}) => new Date(Date.UTC(2001, m - 1, d)).toLocaleDateString(lang(), {day: 'numeric', month: 'long', timeZone: 'UTC'});
    const SRC = {
        wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Licensing', 'Wikidata')} (CC0)`,
        osm: () => `${link('https://www.openstreetmap.org/copyright', T('© les contributeurs d’OpenStreetMap'))} (ODbL)`,
        ghd: () => `${link('https://doi.org/10.5194/cp-8-1403-2012', 'Daux et al. 2012, Climate of the Past')} · ${link('https://www.ncei.noaa.gov/access/paleo-search/study/13194', 'NOAA / WDS-Paleo')} (${esc(T('données libres, à citer'))}) — ${esc(T('pack « Histoire du lieu »'))}`
    };

    /* ─────────── chargement (une fois, à la demande ; un fichier absent = rien) ─────────── */
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function file(name) {
        if (!data[name]) data[name] = fetch(`assets/data/tb-${name}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => (r.ok ? readMaybeGz(r) : null)).catch(() => { delete data[name]; return null; });
        return data[name];
    }
    const merged = {};
    /** un sujet : {rows (Wikidata + OSM), wd, osm (les deux fichiers, ou null)} */
    function load(theme) {
        if (!merged[theme]) merged[theme] = Promise.all([file(`wd-${theme}`), file(`osm-${theme}`)])
            .then(([w, o]) => ({wd: w, osm: o, rows: merge(table(w), table(o))}));
        return merged[theme];
    }
    /** 🍇 le jeu « hist_vendanges » du pack « Histoire du lieu » (une seule source dans l'app), par la liste de Listes ;
     *  null quand le pack n'est pas installé (rien n'est affiché : l'installation se propose dans Réglages → Histoire du lieu) */
    async function harvestNear(ll, km = 150) {
        const d = (ext.dataListsEngine?.list?.() || ext.dataLists || []).find(x => x.id === 'hist_vendanges');
        if (!d?.query) return null;
        try { if (d.installed && !(await d.installed())) return null; } catch (_) { return null; }
        const r = await d.query({near: {lat: ll.lat, lon: ll.lon, km}, sort: 'year', dir: 'asc', offset: 0, limit: 5000}).catch(() => null);
        return harvestSeries(r?.rows || [], ll, km);
    }

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const kindWord = (theme, k) => T(TH[theme]?.[4]?.[k] || k);
    const label = (theme, r) => r.n || kindWord(theme, r.k);
    function itemLi(theme, x) {
        const r = x.r, bits = [r.n ? kindWord(theme, r.k) : '', r.commune, r.from !== null ? T('depuis {y}', {y: String(r.from)}) : '', r.to !== null ? T('jusqu’en {y}', {y: String(r.to)}) : '', kmTxt(x.km)].filter(Boolean);
        const links = [link(r.url, r.via === 'osm' ? '↗ OpenStreetMap' : '↗ Wikidata'), r.mh ? link(pop(r.mh), T('↗ Mérimée')) : '', r.fr ? link(wp(r.fr), '↗ Wikipédia') : ''].filter(Boolean).join(' ');
        return `<li><b>${esc(label(theme, r))}</b> <small class="muted">(${esc(bits.join(' · '))})</small> ${links}</li>`;
    }
    const srcOf = D => [D?.wd ? SRC.wd() : '', D?.osm ? SRC.osm() : ''].filter(Boolean).join(' · ');
    /** une phrase + la liste pliée ; '' quand il n'y a rien */
    function themeHtml(theme, D, list, lead) {
        if (!list.length) return '';
        const [, icon] = TH[theme];
        const hint = !D.osm ? hyp(T('Les points d’OpenStreetMap (beaucoup plus nombreux) arriveront avec la mise à jour des données : Réglages → 🗂 Données.')) : '';
        const extra = theme === 'cultes' ? hyp(T('Les registres protestants et juifs : voir « Où chercher » (SHPF, état civil).')) : theme === 'bornes' ? hyp(T('Une borne marque souvent une limite de paroisse, de seigneurie ou de commune : les actes d’un village voisin peuvent être de l’autre côté.')) : '';
        return row(icon, `${lead} ${srcLink(list[0].r.url)}`, srcOf(D), more(`<ul class="hist-ul tb-ul">${list.slice(0, 40).map(x => itemLi(theme, x)).join('')}</ul>${extra}${hint}`, list.length));
    }
    const shortList = (theme, list) => list.slice(0, 3).map(x => `<b>${esc(label(theme, x.r))}</b>${x.r.from !== null ? ` (${esc(x.r.from)})` : ''}`).join(', ');
    async function themePlace(theme, ll) {
        const D = await load(theme); const list = near(D.rows, ll, TH[theme][3]);
        return themeHtml(theme, D, list, T('{t} à moins de {r} km ({n}) : {l}.', {t: esc(T(TH[theme][2])), r: String(TH[theme][3]), n: nf(list.length), l: shortList(theme, list)}));
    }
    async function harvestPlace(ll, years) {
        const S = await harvestNear(ll); if (!S || !S.rows.length) return '';
        const mid = S.mean === null ? null : ghdDay(S.mean);
        const lead = T('Les vendanges ({r}, série à {k}) : d’habitude vers le {d} ; dates connues de {a} à {b}.', {r: esc(T(S.region)), k: esc(kmTxt(S.km)), d: esc(mid ? dayTxt(mid) : '?'), a: String(S.first), b: String(S.last)});
        const mine = S.rows.filter(x => years && x.year >= years.from - 5 && x.year <= years.to + 5);
        const byDays = S.rows.filter(x => num(x.days) !== null).sort((a, b) => a.days - b.days);
        const when = x => `${x.year} (${esc(dayTxt(ghdDay(x.days)))})`;
        const li = x => `<li>${esc(x.year)} : ${esc(dayTxt(ghdDay(x.days)))}${num(x.diff) !== null ? ` <small class="muted">(${esc(diffTxt(Number(x.diff)))})</small>` : ''}</li>`;
        const body = `${byDays.length ? `<p>${esc(T('Les plus précoces :'))} ${byDays.slice(0, 3).map(when).join(', ')}<br>${esc(T('Les plus tardives :'))} ${byDays.slice(-3).reverse().map(when).join(', ')}</p>` : ''}
            ${mine.length ? `<p>${esc(T('Les années de ta famille ici :'))}</p><ul class="hist-ul tb-ul tb-cols">${mine.slice(0, 120).map(li).join('')}</ul>` : ''}
            ${hyp(T('Une série régionale mêle plusieurs vignobles : la date est celle du « ban des vendanges » ou du début de la récolte. Une vendange tardive dit un été froid ; une précoce, un été chaud.'))}`;
        return row('🍇', lead, SRC.ghd(), more(body, mine.length || null));
    }
    const diffTxt = d => (d === 0 ? T('comme d’habitude') : d > 0 ? T('{n} jours plus tard que d’habitude', {n: String(d)}) : T('{n} jours plus tôt que d’habitude', {n: String(-d)}));
    async function placePart(kind, place, opts = {}) {
        const ll = placeLL(place); if (!ll) return '';
        if (kind === 'vendanges') return harvestPlace(ll, opts.years);
        if (TH[kind]) return themePlace(kind, ll);
        return '';
    }
    const PLACE_KINDS = [...THEMES.map(t => t[0]), 'vendanges'];
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tb-panel"><h3>${esc(T('🐑 La vie du village et la nature'))}</h3><div class="hist-life tb-life">${html.join('')}</div>${linksHtml()}</section>` : '';
        return html.length;
    }
    /* 🔗 les sources qu'on ne copie pas (licence pas ouverte, pas vérifiable, ou il faut un compte) : un lien, plié */
    const LINKS = [
        ['🗺', 'Atlas linguistique de la France (Gilliéron et Edmont, 1902–1910) — CartoDialect', 'https://lig-tdcge.imag.fr/cartodialect5/', 'cartes numérisées : licence de la numérisation non publiée, lien seulement'],
        ['🏷', 'Blason populaire de la France (Gaidoz et Sébillot, 1884) : les sobriquets des habitants', 'https://archive.org/search?query=%22blason+populaire+de+la+France%22', 'livre du domaine public, scans à lire en ligne'],
        ['🗣', 'Proverbes bretons (Wiktionnaire)', 'https://fr.wiktionary.org/wiki/Annexe:Liste_de_proverbes_bretons', 'CC BY-SA 4.0 ; trop peu de proverbes régionaux pour un fichier'],
        ['🌸', 'PEP725 — dates de floraison en Europe', 'http://www.pep725.eu/', 'compte obligatoire, pas de redistribution'],
        ['🌱', 'Observatoire des saisons (ODS)', 'https://www.obs-saisons.fr/', 'observations récentes (depuis 2006), pas l’histoire']];
    const linksHtml = () => `<details class="tb-more tb-links"><summary>${esc(T('🔗 Pour aller plus loin (liens seulement)'))}</summary><ul class="hist-ul tb-ul">${LINKS.map(([i, l, u, w]) => `<li>${i} ${link(u, `${T(l)} ↗`)} <small class="muted">— ${esc(T(w))}</small></li>`).join('')}</ul></details>`;

    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]');
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tb_place', host: '[data-tb-host]', icon: '🐑', label: 'La vie du village et la nature', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tbv])'); if (!village) return;
        village.dataset.tbv = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const place = villagePlace(village); if (!placeLL(place)) return;
        const anchor = village.querySelector('[data-l10o-host]') || village.querySelector('[data-l9a-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tb-place" data-tb-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tb-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => console.error(e)); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const evOf = (life, tags) => (life?.events || []).find(x => tags.includes(String(x.tag || '').toUpperCase()));
    function birthPlace(life) {
        const e = evOf(life, ['BIRT', 'BAPM', 'CHR']), pls = (life?.places || []).filter(okLL);
        if (e && okLL(e)) return {lat: Number(e.lat), lon: Number(e.lon), name: e.place || ''};
        const p = e?.place_id ? pls.find(x => x.id === e.place_id) : pls[0];
        return p ? {lat: Number(p.lat), lon: Number(p.lon), name: p.name || ''} : null;
    }
    const yearOf = e => num(e?.year) ?? num(String(e?.date || '').slice(0, 4));
    async function smallHeritageForPerson(life) {
        const home = birthPlace(life); if (!home) return '';
        const birth = yearOf(evOf(life, ['BIRT', 'BAPM', 'CHR'])) ?? num(life?.person?.birth);
        const all = [];
        for (const theme of ['eau', 'village', 'croix'].filter(on)) {
            const D = await load(theme);
            for (const x of near(D.rows, home, 1.5, birth)) all.push({theme, ...x, D});
        }
        if (!all.length) return '';
        all.sort((a, b) => a.km - b.km);
        const lead = T('Près de {p}, là où {e} est né(e) : {l}.', {p: esc(home.name || T('son lieu de naissance')), e: esc(he(life.person)), l: all.slice(0, 3).map(x => `<b>${esc(label(x.theme, x.r))}</b> (${esc(kmTxt(x.km))})`).join(', ')});
        const srcs = [...new Set(all.map(x => srcOf(x.D)))].join(' · ');
        return row('⛲', `${lead} ${srcLink(all[0].r.url)}`, srcs, more(`<ul class="hist-ul tb-ul">${all.slice(0, 20).map(x => itemLi(x.theme, x)).join('')}</ul>${hyp(T('La distance est mesurée depuis la position du lieu (souvent le centre du village), pas depuis sa maison.'))}`, all.length));
    }
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));
    const PERSON_PARTS = ['eau'];
    async function personInto(host, id, opts = {}) {
        const s = settings();
        const jobs = {eau: () => (s.eau || s.village || s.croix || opts.force ? smallHeritageForPerson : null)};
        const want = (opts.parts || PERSON_PARTS).map(k => jobs[k]?.()).filter(Boolean);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const html = await Promise.all(want.map(f => Promise.resolve().then(() => f(life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tb-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!['eau', 'village', 'croix'].some(on)) return '';
        return A().card(index, T('🐑 Son village et la nature'), '', `<div class="tb-block" data-tb-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tb-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tbPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 📜 Monographie de commune : une partie par sujet ─────────── */
    (ext.monographSections = ext.monographSections || []).push(...PLACE_KINDS.map(kind => ({
        id: `tb_${kind}`, icon: kind === 'vendanges' ? '🍇' : TH[kind][1], label: kind === 'vendanges' ? T('Les dates des vendanges') : T(TH[kind][2]), group: 'Le lieu', defaultOn: true, enabled: () => on(kind),
        source: kind === 'vendanges' ? 'Daux et al. 2012 ; NOAA / WDS-Paleo — pack « Histoire du lieu »' : 'Wikidata (CC0) ; © les contributeurs d’OpenStreetMap (ODbL)',
        render: async (place, host, ctx) => {
            let years = null; try { years = ctx?.years ? await ctx.years() : null; } catch (_) {}
            const html = await placePart(kind, place, {years}); if (!html) return false;
            host.innerHTML = `<div class="hist-life tb-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const F = (key, lbl, type = 'text', extra = {}) => ({key, label: T(lbl), type, ...extra});
    const openUrl = r => (r.src ? window.open(r.src, '_blank', 'noopener') : null);
    (ext.dataLists = ext.dataLists || []).push(
        ...THEMES.map(([theme, icon, lbl, , words]) => ({id: `tb_${theme}`, icon, label: T(lbl), group: 'Le lieu', source: 'Wikidata (CC0) · OpenStreetMap (ODbL)', sourceUrl: 'https://www.openstreetmap.org/copyright', enabled: () => on(theme),
            load: async () => (await load(theme)).rows.map(r => ({name: label(theme, r), kind: kindWord(theme, r.k), commune: r.commune || '', country: r.country || '', from: r.from, to: r.to,
                merimee: pop(r.mh), wikipedia: wp(r.fr), via: r.via === 'osm' ? 'OpenStreetMap (ODbL)' : 'Wikidata (CC0)', lat: r.lat, lon: r.lon, src: r.url})),
            fields: [F('name', 'Nom'), F('kind', 'Sorte', 'enum', {values: Object.values(words).map(w => T(w))}), F('commune', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’en', 'year'),
                F('merimee', 'Mérimée', 'url'), F('wikipedia', 'Wikipédia', 'url'), F('via', 'Base', 'enum'), F('src', 'Source', 'url')],
            period: r => [r.from, r.to], geo: r => [r.lat, r.lon], open: openUrl})),
        {id: 'tb_cepages', icon: '🍇', label: T('Cépages et leur origine'), group: 'Le monde', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q958314', enabled: () => on('cepages'),
            load: async () => table(await file('cepages')).map(r => ({name: r.n, country: r.country || '', origin: r.origin || '', from: num(r.from), color: r.color || '', wikipedia: wp(r.fr), lat: r.lat, lon: r.lon, src: `https://www.wikidata.org/wiki/${r.src}`})),
            fields: [F('name', 'Cépage'), F('country', 'Pays d’origine', 'enum'), F('origin', 'Lieu d’origine'), F('color', 'Couleur', 'enum'), F('from', 'Connu depuis', 'year'), F('wikipedia', 'Wikipédia', 'url'), F('src', 'Source', 'url')],
            period: r => [r.from, null], geo: r => (r.lat !== null && r.lat !== undefined ? [r.lat, r.lon] : null), open: openUrl});

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    (ext.mapLayerSources = ext.mapLayerSources || []).push(...THEMES.map(([theme, icon, lbl]) => ({id: `tb_${theme}`, icon, label: T(lbl), group: 'Le lieu', kind: 'points', source: 'Wikidata (CC0) · © OpenStreetMap (ODbL)',
        run: async ({q, bbox, to, max = 3000}) => {
            const D = await load(theme);
            const features = D.rows.filter(r => inBox(bbox, r.lat, r.lon) && (!q || fold(`${r.n} ${r.commune}`).includes(fold(q))) && (!to || r.from === null || r.from <= to)).slice(0, max)
                .map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: `${label(theme, r)}${r.from !== null ? ` (${r.from})` : ''}`}));
            return {features, source: srcOf(D).replace(/<[^>]+>/g, '')};
        }})));

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl || !placeLL(pl)) { host.innerHTML = emptyLine(T('Choisis un lieu placé sur la carte.'), '📍'); return null; }
        const html = await placePart(kind, pl, {years: ctx.year ? {from: Number(ctx.year), to: Number(ctx.year)} : null});
        host.innerHTML = html ? `<div class="hist-life tb-life">${html}</div>` : '';
        return !!html;
    }
    (ext.dataSources = ext.dataSources || []).push(
        ...PLACE_KINDS.map(kind => ({id: `tb_${kind}_lieu`, icon: kind === 'vendanges' ? '🍇' : TH[kind][1], label: kind === 'vendanges' ? T('Les dates des vendanges') : T(TH[kind][2]), group: 'Le lieu', needs: ['place'], online: false,
            installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})),
        {id: 'tb_personne', icon: '🐑', label: T('Son village et la nature'), group: 'La personne', needs: ['person'], online: false, installed: () => true,
            run: async (ctx, host) => {
                const id = Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
                host.innerHTML = '<div></div>';
                const n = await personInto(host.firstElementChild, id, {force: true, detached: true});
                if (!n) host.innerHTML = emptyLine(T('Rien près de son lieu de naissance (il faut un lieu placé sur la carte).'));
                return n;
            }});

    /* ─────────── ⚙️ Réglages → 🐑 Village et nature ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const files = ['cepages', ...THEMES.flatMap(t => [`wd-${t[0]}`, `osm-${t[0]}`])];
        const metas = {};
        await Promise.all(files.map(async f => { metas[f] = await file(f); }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, lbl]) => `<label class="checkbox-line cplus-tg" data-tb-tg="${key}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(lbl))}</b><br><small class="muted">${esc(T(SUBS[key]))}</small></span></label>`;
        const fileRow = (f, lbl) => { const m = metas[f]; if (!m) return `<tr><td>${esc(T(lbl))}</td><td colspan="4" class="muted">${esc(f.startsWith('osm-') ? T('Pas encore fabriqué (sur GitHub) : arrivera avec la mise à jour des données.') : T('Fichier absent.'))}</td></tr>`;
            return `<tr><td>${esc(T(lbl))}</td><td>${link(m.url, m.source)}${m.note ? `<br><small class="muted">${esc(m.note)}</small>` : ''}</td><td>${esc(nf((m.rows || []).length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings tb-settings" data-tb-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Village et nature'), icon: '🐑', where: T('Réglages · Données'), help: esc(T('Calvaires, lavoirs, fours à pain, bornes, transhumance, temples et synagogues autour de chaque village ; les dates des vendanges ; les cépages. Tout est lu sur l’ordinateur.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’un village, dans la monographie de commune et sur la fiche d’une personne (bloc « 🐑 Son village et la nature »). Les listes sont dans Listes, les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${THEMES.map(([k, i, l]) => fileRow(`wd-${k}`, `${i} ${l} (Wikidata)`) + fileRow(`osm-${k}`, `${i} ${l} (OpenStreetMap)`)).join('')}
                ${fileRow('cepages', '🍇 Cépages')}<tr><td>${esc(T('🍇 Dates des vendanges'))}</td><td colspan="4">${SRC.ghd()}<br><small class="muted">${esc(T('Pas de copie ici : la liste « Dates des vendanges (27 régions) » du pack « Histoire du lieu » (Réglages → Histoire du lieu).'))}</small></td></tr></tbody></table></div>
                <p class="muted">${esc(T('Rien ne part sur Internet : les fichiers sont dans l’app (mis à jour par Réglages → 🗂 Données). Seuls les liens « ↗ » ouvrent une page, quand tu cliques.'))}</p>
                <p class="muted">${esc(T('Déjà ailleurs dans l’app : les lieux de pèlerinage (« 🔔 Objets et traces »), les fontaines saintes et les loups, ours, castors et lynx (« Pays et mémoire »), les dictons du jour (« Règles de vie »), les gentilés (« Terre et mots »), les monuments protégés (pack « Patrimoine »).'))}</p>
                ${linksHtml().replace('<details class="tb-more tb-links">', '<details class="tb-more tb-links" open>')}</div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tb-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.tbTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🐑'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'lot10_objets_traces'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'lot10_objets_traces'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🐑 Son village et la nature']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechB = {...core, load, harvestNear, settings, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
