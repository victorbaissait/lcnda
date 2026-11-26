/**
 * LCNDA — 🌉 Le pays au XIXe siècle (lot F « téléchargements ») : ce qui se passait, se construisait et s'entendait autour d'eux.
 * Livré avec l'app (assets/data/tf-*.json.gz, refaits par scripts/telech-f/*.py et .github/workflows/telech-f.yml, lus à la demande) :
 *   🎈 tf-ballons   les 67 ballons montés du siège de Paris (1870-71) et leur lieu d'arrivée (Wikipédia CC BY-SA 4.0 ; Wikidata CC0)
 *   🌉 tf-ponts     les ponts suspendus (ponts Seguin…) et leur date (Wikidata CC0 ; « Liste de ponts de France », CC BY-SA 4.0)
 *   ⚒ tf-forges    forges, hauts fourneaux, martinets (Wikidata CC0) + tf-osm-forges (OpenStreetMap ODbL, fabriqué sur GitHub)
 *   🧂 tf-salines   salines et marais salants (Wikidata CC0) + tf-osm-salines (OpenStreetMap ODbL, sur GitHub)
 *   🪧 tf-osm-cocher plaques de cocher et bornes Michelin (OpenStreetMap ODbL, sur GitHub seulement)
 *   🥕 tf-potager   Vilmorin-Andrieux, « Les Plantes potagères » (1883, domaine public ; transcription Wikisource) : variétés au nom d'une commune
 *   🏅 tf-montyon   lauréats du prix de vertu Montyon connus de Wikidata (CC0 ; liste très incomplète — liens vers l'Académie, Wikisource)
 *   🌹 tf-rosieres  communes qui couronnent une rosière (Wikipédia CC BY-SA 4.0 : la phrase citée ; Wikidata CC0)
 *   🔔 tf-silence   ce qu'on entendait au village (phrases de Wikipédia vérifiées) ; le bruit d'aujourd'hui : liens seulement
 *   🌋 tf-volcans   PROLONGE « 🌅 Les ciels étranges » (lot 8) et « 🌋 Les volcans… récoltes » (lot 10) : l'épaisseur des aérosols volcaniques
 *                   année par année (NOAA : Crowley et Unterman 2013 ; Gao et al. 2008) et les éruptions que ces listes n'ont pas
 * Déjà dans l'app et RÉUTILISÉ (pas recopié) : les notices Mérimée du pack « Patrimoine » du département (lp_place, si installé) pour
 *   les forges, salines et ponts de la commune.
 * Tout est lu sur l'ordinateur : rien ne part sur Internet (ni nom, ni lieu), pour personne. Seuls les liens « ↗ » ouvrent une page.
 * Où : fiche d'une personne, bloc « 🌉 Le pays au XIXe siècle » ; fiche d'un village et Monographie de commune ; Listes ; Cartes ;
 *   à la demande (dataSources) ; Réglages → « 🌉 Le pays au XIXe siècle » (chaque sujet s'éteint ↶, À propos des données).
 * localStorage : « genealogie-telech-f ».   window.LCNDA_EXT.telechF = {core…, load, personInto, placeInto, openSettings}
 * Essai : tests/test-telech-f.js
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
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? b + 80 : ys.length ? Math.max(...ys) : null)};
    }
    /** vivant (au moins une partie de l'année) entre a et b ? */
    const aliveIn = (life, a, b = a) => { const s = lifeSpan(life); return s.from !== null && s.to !== null && s.from <= b && s.to >= a; };
    /** ses lieux placés avec l'année (naissance d'abord) */
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase()}));
    /** les lignes à moins de radius km d'un point, les plus proches d'abord */
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    /** le plus proche de ses lieux pour chaque ligne (une fois par ligne) ; when(r, ev) : garder ce couple ? */
    function nearLife(rows, life, radius, when = () => true, key = r => r.q || r.osm || `${r.lat},${r.lon}`) {
        const out = new Map();
        for (const e of placedEvents(life)) for (const x of near(rows, e.lat, e.lon, radius, 200)) {
            if (!when(x.r, e)) continue;
            const k = key(x.r), cur = out.get(k); if (!cur || x.km < cur.km) out.set(k, {...x, place: e.name});
        }
        return [...out.values()].sort((a, b) => a.km - b.km);
    }
    /** ses métiers (fiche, recensements, événements « métier ») en minuscules sans accents */
    const jobsText = life => fold([...(life?.jobs || []).map(j => j.text), life?.text || ''].join(' '));
    const FORGE_JOB = /\b(forgeron|forgeur|maitre de forges?|forges?|fondeur|charbonnier|marechal ferrant|taillandier|cloutier|affineur|puddleur|mineur de fer|ferronnier|serrurier)\b/;
    const SALT_JOB = /\b(saunier|sauniere|paludier|paludiere|salinier|saliniere|faux saunier|gabelou|ouvrier des salines|sel)\b/;
    /** 🎈 les ballons posés près de ses lieux, s'il était en vie pendant le siège (sept. 1870 – janv. 1871) */
    /*  (un lieu de sa vie autour de 1870 : de 1850 à 1890, ou sans date — « il vivait non loin » ne se dit pas d'un lieu où il n'est arrivé qu'en 1920) */
    function balloonsFor(rows, life, radius = 40) { return aliveIn(life, 1870, 1871) ? nearLife(rows.filter(r => num(r.lat) !== null), life, radius, (r, e) => e.year === null || (e.year >= 1850 && e.year <= 1890)) : []; }
    /** 🌉 les ponts suspendus construits près de chez lui pendant sa vie */
    function bridgesFor(rows, life, radius = 12) {
        const s = lifeSpan(life); if (s.from === null) return [];
        return nearLife(rows, life, radius, r => num(r.from) !== null && r.from >= s.from && r.from <= s.to);
    }
    /** ⚒ 🧂 les forges ou salines près de chez lui : plus loin quand il en avait le métier */
    function worksFor(rows, life, kind) {
        const job = (kind === 'forges' ? FORGE_JOB : SALT_JOB).test(jobsText(life));
        const list = nearLife(rows, life, job ? 25 : 6, r => { const s = lifeSpan(life); return (num(r.from) === null || s.to === null || r.from <= s.to) && (num(r.to) === null || s.from === null || r.to >= s.from); });
        return {job, list};
    }
    /** 🥕 les variétés de 1883 qui portent le nom d'une commune près de ses lieux (il vivait en 1883) */
    function veggiesFor(rows, life, radius = 25) { return aliveIn(life, 1883) ? nearLife(rows.filter(r => num(r.lat) !== null), life, radius, () => true, r => `${r.veg}|${r.v}`) : []; }
    /** 🏅 un lauréat du prix de vertu de sa commune (moins de 3 km), récompensé pendant sa vie */
    function montyonFor(rows, life) { return nearLife(rows.filter(r => r.insee), life, 3, r => num(r.y) === null || aliveIn(life, r.y)); }
    /** 🌹 la rosière de sa commune */
    function rosieresFor(rows, life) { return nearLife(rows, life, 3, (r, e) => !r.since || e.year === null || e.year >= r.since - 60 || !r.now, r => r.insee); }
    /** 🌋 les années de ciel voilé de sa vie (âgé d'au moins 5 ans) */
    function veiledYears(rows, life) {
        const s = lifeSpan(life); if (s.birth === null && s.from === null) return [];
        const a = (s.birth ?? s.from) + 5, b = s.to;
        return rows.filter(r => r.y >= a && r.y <= b).sort((x, y) => y.aod - x.aod);
    }
    /** 🌋 la courbe d'une vie : l'AOD année par année (tableau commençant à aod_from) */
    function aodSpan(meta, a, b) { const out = []; for (let y = Math.max(a, meta.aod_from); y <= Math.min(b, meta.aod_from + meta.aod.length - 1); y++) out.push([y, meta.aod[y - meta.aod_from]]); return out; }
    /** 🔔 les phrases d'une époque */
    const soundsOf = (rows, a, b) => rows.filter(r => r.from <= b && r.to >= a);
    /** Wikidata + OpenStreetMap d'un sujet en une liste : un point OSM à moins de maxKm d'un point Wikidata est le même.
     *  Une grille de carreaux de 0,01° : chaque point OSM n'est comparé qu'aux points Wikidata voisins (pas de n × m sur des milliers de lignes). */
    function mergeRows(wd, osm, maxKm) {
        const out = (wd || []).map(r => ({...r, via: 'wd'})), C = 0.01, grid = new Map(), key = (a, b) => `${a}|${b}`;
        for (const w of out) { if (num(w.lat) === null || num(w.lon) === null) continue; const k = key(Math.floor(w.lat / C), Math.floor(w.lon / C)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(w); }
        for (const o of osm || []) {
            let dup = false;
            if (num(o.lat) !== null && num(o.lon) !== null) {
                const a = Math.floor(o.lat / C), b = Math.floor(o.lon / C);
                for (let i = -1; i <= 1 && !dup; i++) for (let j = -1; j <= 1 && !dup; j++) dup = (grid.get(key(a + i, b + j)) || []).some(w => km(w.lat, w.lon, o.lat, o.lon) < maxKm);
            }
            if (!dup) out.push({...o, q: '', via: 'osm', from: num(o.from), to: null});
        }
        return out;
    }
    /** une adresse sûre : http(s) seulement */
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

    const core = {num, fold, table, km, mergeRows, lifeSpan, aliveIn, placedEvents, near, nearLife, jobsText, balloonsFor, bridgesFor, worksFor, veggiesFor, montyonFor, rosieresFor, veiledYears, aodSpan, soundsOf, safeUrl, FORGE_JOB, SALT_JOB};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-f';
    const TAB = ['telech_f', '25tf', '🌉 Le pays au XIXe siècle'];
    const BLOCK = 'telech_f';
    const PARTS = [
        ['ballons', '🎈 Les ballons du siège de Paris', 'Les 67 ballons partis de Paris assiégé en 1870-71 : celui qui s’est posé près de chez eux, avec ce qu’il emportait.'],
        ['ponts', '🌉 Les ponts suspendus', 'Les ponts suspendus (ponts Seguin…) construits près de chez eux pendant leur vie.'],
        ['forges', '⚒ Forges et hauts fourneaux', 'Les forges, hauts fourneaux et martinets anciens près de chez eux (plus loin pour un forgeron, un charbonnier, un fondeur).'],
        ['salines', '🧂 Salines et marais salants', 'Les salines et marais salants près de chez eux (plus loin pour un saunier ou un paludier).'],
        ['cocher', '🪧 Plaques de cocher et bornes Michelin', 'Les vieux panneaux de route autour du village (OpenStreetMap, à fabriquer sur GitHub).'],
        ['potager', '🥕 Le potager de 1883', 'Les légumes que Vilmorin décrit en 1883 et qui portent le nom d’une commune proche.'],
        ['montyon', '🏅 Le prix de vertu', 'Une personne de la commune honorée par le prix de vertu Montyon (Académie française).'],
        ['rosieres', '🌹 Les rosières', 'Les communes qui couronnent une rosière, et depuis quand.'],
        ['silence', '🔔 Le silence d’autrefois', 'Ce qu’on entendait au village (phrases de Wikipédia), et les cartes du bruit d’aujourd’hui (liens).'],
        ['volcans', '🌋 Le ciel des volcans lointains', 'Les années où les cendres de volcans lointains ont voilé le ciel pendant sa vie, mesurées dans les glaces (NOAA).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tf-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tf-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tf-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (q ? `https://www.wikidata.org/wiki/${encodeURIComponent(q)}` : '');
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const osmUrl = k => { const t = {n: 'node', w: 'way', r: 'relation'}[String(k || '')[0]]; return t ? `https://www.openstreetmap.org/${t}/${encodeURIComponent(String(k).slice(1))}` : ''; };
    const dateFr = d => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}) : String(d || ''); };
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (CC0)`, wp: (u, label = 'Wikipédia') => `${link(u || 'https://fr.wikipedia.org', label)} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs de Wikipédia'))})`,
        osm: () => `${link('https://www.openstreetmap.org/copyright', T('© les contributeurs d’OpenStreetMap'))} (ODbL)`, ws: () => `${link('https://fr.wikisource.org/wiki/Les_Plantes_potag%C3%A8res', 'Wikisource')} (${esc(T('livre de 1883, domaine public'))})`,
        noaa: () => `${link('https://www.ncei.noaa.gov/access/paleo-search/study/14168', 'NOAA NCEI')} — Crowley & Unterman 2013 (${link('https://doi.org/10.5194/essd-5-187-2013', 'doi')}) ; Gao, Robock & Ammann 2008 (${link('https://doi.org/10.1029/2008JD010239', 'doi')})`,
        mer: () => `${link('https://www.pop.culture.gouv.fr/', 'Mérimée')} (${esc(T('Licence Ouverte, pack « Patrimoine » installé'))})`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {ballons: 'tf-ballons', ponts: 'tf-ponts', forges: 'tf-forges', salines: 'tf-salines', osm_forges: 'tf-osm-forges', osm_salines: 'tf-osm-salines', osm_cocher: 'tf-osm-cocher',
        potager: 'tf-potager', montyon: 'tf-montyon', rosieres: 'tf-rosieres', silence: 'tf-silence', volcans: 'tf-volcans'};
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
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    /** Wikidata + OpenStreetMap d'un sujet en une liste (un point OSM à moins de 80 m d'un point Wikidata est le même) */
    const mergedMemo = {};
    async function merged(kind) {
        const [W, O] = await Promise.all([rowsOf(kind), rowsOf(`osm_${kind}`)]);
        const m = mergedMemo[kind]; if (m && m.w === W.rows && m.o === O.rows) return m.out; // une fois par fichier, pas à chaque fiche ouverte
        const out = mergeRows(W.rows, O.rows, 0.08); mergedMemo[kind] = {w: W.rows, o: O.rows, out}; return out;
    }
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

    /* ─────────── les morceaux ─────────── */
    const balloonLi = x => `<li>🎈 <b>${esc(x.r.n)}</b> <small class="muted">(${esc(dateFr(x.r.date))} · ${esc(x.r.to)}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}${x.place ? ` ${esc(T('de {p}', {p: x.place}))}` : ''}` : ''})</small>${x.r.fret ? `<br><small class="muted">${esc(T('Il emportait : {f}', {f: x.r.fret}))}</small>` : ''} ${srcLink(wp(x.r.to_wp) || wd(x.r.q))}</li>`;
    function balloonsHtml(list, lead, meta) {
        return row('🎈', `${lead} ${srcLink(meta.url)}`, LIC.wp(meta.url, T('Wikipédia, « Ballon monté »')) + ` · ${LIC.wd()}`,
            more(`<ul class="hist-ul tf-ul">${list.slice(0, 12).map(balloonLi).join('')}</ul>${hyp(T('Les ballons partaient de Paris encerclé avec le courrier, des pigeons voyageurs et parfois des passagers ; le vent décidait de l’arrivée. Liste de J. Le Pileur et G. L’Héritier, d’après Wikipédia.'))}`, list.length));
    }
    const bridgeLi = x => (x.r.via === 'mer' ? `<li>🏛 ${link(x.r.url, x.r.n)} <small class="muted">(${esc(x.r.k)}${x.r.siecle ? ` · ${esc(x.r.siecle)}` : ''})</small> ${srcLink(x.r.url)}</li>` : `<li>🌉 <b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${x.r.from ? esc(String(x.r.from)) : '?'}${x.r.to ? `–${esc(String(x.r.to))}` : ''}${x.r.river ? ` · ${esc(x.r.river)}` : ''}${x.r.commune ? ` · ${esc(x.r.commune)}` : ''}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''}${x.r.seguin ? ` · ${esc(T('pont Seguin'))}` : ''})</small> ${srcLink(wd(x.r.q) || wp(x.r.frwiki))}</li>`);
    const bridgeSentence = x => (x.r.replaces ? T('En {y}, un pont suspendu remplace {w} : {n}.', {y: esc(String(x.r.from)), w: `<b>${esc(x.r.replaces)}</b>`, n: `<b>${esc(x.r.n)}</b>`})
        : T('En {y}, on construit {n} ({k}).', {y: esc(String(x.r.from)), n: `<b>${esc(x.r.n)}</b>`, k: esc(kmTxt(x.km))}));
    function bridgesHtml(list, lead) {
        return row('🌉', `${lead} ${srcLink(list[0].r.via === 'mer' ? list[0].r.url : wd(list[0].r.q) || wp(list[0].r.frwiki))}`, `${list.some(x => x.r.via === 'mer') ? `${LIC.mer()} · ` : ''}${LIC.wd()} · ${LIC.wp('https://fr.wikipedia.org/wiki/Liste_de_ponts_de_France', T('Wikipédia, « Liste de ponts de France »'))}`,
            more(`<ul class="hist-ul tf-ul">${list.slice(0, 12).map(bridgeLi).join('')}</ul>${hyp(T('Avant les ponts suspendus, on passait souvent la rivière en bac ou à gué ; Marc Seguin et ses frères en construisent à partir de 1823. « Remplace un bac » n’est écrit que si Wikidata le dit.'))}`, list.length));
    }
    const WORK_WORD = {forge: 'forge', 'haut-fourneau': 'haut-fourneau', 'usine sidérurgique': 'usine sidérurgique', fonderie: 'fonderie', martinet: 'martinet', saline: 'saline', 'marais salant': 'marais salant', cocher: 'plaque de cocher', michelin: 'borne ou panneau Michelin'};
    const workLi = x => `<li>${x.r.k === 'saline' || x.r.k === 'marais salant' ? '🧂' : x.r.k === 'cocher' || x.r.k === 'michelin' ? '🪧' : '⚒'} <b>${link(x.r.via === 'osm' ? osmUrl(x.r.osm) : wp(x.r.frwiki) || wd(x.r.q), x.r.n || T(WORK_WORD[x.r.k] || x.r.k))}</b> <small class="muted">(${esc(T(WORK_WORD[x.r.k] || x.r.k))}${x.r.from ? `, ${esc(String(x.r.from))}${x.r.to ? `–${esc(String(x.r.to))}` : ''}` : ''}${x.r.commune ? ` · ${esc(x.r.commune)}` : ''}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small>${x.r.inscription ? `<br><q class="tf-quote">${esc(x.r.inscription)}</q>` : ''} ${srcLink(x.r.via === 'osm' ? osmUrl(x.r.osm) : wd(x.r.q))}</li>`;
    const worksSrc = list => [list.some(x => x.r.via === 'wd') ? LIC.wd() : '', list.some(x => x.r.via === 'osm') ? LIC.osm() : '', list.some(x => x.r.via === 'mer') ? LIC.mer() : ''].filter(Boolean).join(' · ');
    function worksHtml(kind, list, lead, extra = '') {
        const icon = kind === 'forges' ? '⚒' : kind === 'salines' ? '🧂' : '🪧';
        const first = list[0].r;
        return row(icon, `${lead} ${srcLink(first.via === 'osm' ? osmUrl(first.osm) : first.via === 'mer' ? first.url : wd(first.q))}`, worksSrc(list), more(`<ul class="hist-ul tf-ul">${list.slice(0, 15).map(x => (x.r.via === 'mer' ? `<li>🏛 ${link(x.r.url, x.r.n)} <small class="muted">(${esc(x.r.k)}${x.r.siecle ? ` · ${esc(x.r.siecle)}` : ''})</small> ${srcLink(x.r.url)}</li>` : workLi(x))).join('')}</ul>${extra}`, list.length));
    }
    const vegLi = x => `<li>🥕 <b>${esc(x.r.v)}</b> <small class="muted">(${esc(x.r.veg)} · ${esc(T('du nom de {c}', {c: x.r.commune}))}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''} · ${esc(T('page {p}', {p: String(x.r.page)}))})</small> ${link(String(rowsMeta.potager?.page_url || '').replace('{p}', encodeURIComponent(String(x.r.page))), T('↗ lire la page'))}${x.r.img ? ` · ${link(`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(x.r.img).replace(/ /g, '_'))}`, T('↗ la gravure'))}` : ''}</li>`;
    const rowsMeta = {};
    function veggiesHtml(list, lead) {
        return row('🥕', `${lead} ${srcLink(String(rowsMeta.potager?.page_url || '').replace('{p}', encodeURIComponent(String(list[0].r.page))))}`, LIC.ws(),
            more(`<ul class="hist-ul tf-ul">${list.slice(0, 12).map(vegLi).join('')}</ul>${hyp(T('Vilmorin-Andrieux, « Les Plantes potagères », Paris, 1883. Les gravures du livre sont sur Wikimedia Commons (domaine public) : elles s’ouvrent par un lien, rien n’est copié.'))}`, list.length));
    }
    const ACAD = 'https://www.academie-francaise.fr/prix-de-vertu';
    const WS_VERTU = 'https://fr.wikisource.org/w/index.php?search=%22prix+de+vertu%22+Montyon&ns0=1';
    const montyonLi = x => `<li>🏅 <b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${x.r.y ? esc(String(x.r.y)) : '?'} · ${esc(x.r.place)}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small>${x.r.d ? `<br><small class="muted">${esc(x.r.d)}</small>` : ''} ${srcLink(wd(x.r.q))}</li>`;
    function montyonHtml(list, lead) {
        return row('🏅', `${lead} ${srcLink(wd(list[0].r.q))}`, LIC.wd(), more(`<ul class="hist-ul tf-ul">${list.map(montyonLi).join('')}</ul>${hyp(T('Le prix de vertu, fondé par Montyon, est remis chaque année par l’Académie française depuis 1819. Wikidata ne connaît qu’une vingtaine de lauréats : les autres sont dans les rapports annuels de l’Académie.'))} ${link(ACAD, T('↗ Académie française'))} · ${link(WS_VERTU, T('↗ rapports sur Wikisource'))}`, list.length));
    }
    const rosiereLi = x => `<li>🌹 <b>${link(wp(x.r.wp), x.r.wp)}</b>${x.r.since ? ` <small class="muted">(${esc(x.r.now ? T('depuis {y}', {y: String(x.r.since)}) : String(x.r.since))}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small>` : x.km !== undefined ? ` <small class="muted">(${esc(kmTxt(x.km))})</small>` : ''}<br><q class="tf-quote">${esc(x.r.quote)}</q>${x.r.old ? `<q class="tf-quote">${esc(x.r.old)}</q>` : ''}</li>`;
    function rosieresHtml(list, lead, meta) {
        return row('🌹', `${lead} ${srcLink(meta.url)}`, LIC.wp(meta.url, T('Wikipédia, « Rosière »')) + ` · ${LIC.wd()}`,
            more(`<ul class="hist-ul tf-ul">${list.slice(0, 10).map(rosiereLi).join('')}</ul>${hyp(T('La rosière : une jeune fille du village couronnée de roses pour sa conduite, souvent grâce au legs d’un bienfaiteur. Liste non exhaustive.'))}`, list.length));
    }
    const volcanoName = r => (r.volcano ? T('{v} ({c}, {y})', {v: r.volcano, c: r.country || '?', y: String(r.ey ?? r.y)}) : T('une éruption non identifiée'));
    const ALREADY = {laki: 'lot 8 et lot 10', tambora: 'lot 8 et lot 10', krakatoa: 'lot 8 et lot 10', pinatubo: 'lot 8 et lot 10', huaynaputina: 'lot 10'};
    function spark(pts, marks) {
        if (pts.length < 3) return '';
        const W = 320, H = 46, max = Math.max(0.05, ...pts.map(p => p[1] || 0)), x = i => (i / (pts.length - 1)) * W, y = v => H - 2 - ((v || 0) / max) * (H - 6);
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
        return `<svg class="tf-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(T('Épaisseur des aérosols volcaniques, {a}–{b}', {a: String(pts[0][0]), b: String(pts.at(-1)[0])}))}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5"/>${marks.map(m => { const i = pts.findIndex(p => p[0] === m); return i < 0 ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(pts[i][1]).toFixed(1)}" r="2.5" fill="currentColor"/>`; }).join('')}</svg><small class="muted tf-spark-legend">${esc(String(pts[0][0]))} — ${esc(String(pts.at(-1)[0]))}</small>`;
    }
    const volcanoLi = r => `<li>🌋 <b>${esc(String(r.y))}</b> : ${esc(volcanoName(r))} <small class="muted">(${esc(T('épaisseur des aérosols {a}', {a: String(r.aod).replace('.', ',')}))}${r.tg ? ` · ${esc(T('{t} millions de tonnes de soufre', {t: String(r.tg).replace('.', ',')}))}` : ''}${r.vei ? ` · VEI ${esc(String(r.vei))}` : ''})</small>${r.known ? ` <small class="muted">— ${esc(T('raconté aussi dans « 🌅 Les ciels étranges de sa vie » et « 🌋 Les volcans qui ont gâché ses récoltes »'))}</small>` : ''}${r.noaa ? ` ${srcLink(`https://www.ngdc.noaa.gov/hazel/view/hazards/volcano/event-more-info/${encodeURIComponent(String(r.noaa))}`)}` : ''}</li>`;

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['ballons', 'ponts', 'forges', 'salines', 'potager', 'montyon', 'rosieres', 'silence', 'volcans'];
    const JOBS = {
        ballons: async life => { const D = await quiet(load('ballons')); if (!D) return ''; const list = balloonsFor(D.rows, life); if (!list.length) return '';
            const x = list[0], P = life.person;
            return balloonsHtml(list, T('Pendant le siège de Paris, le {d}, le ballon {n} parti de Paris s’est posé à {l} ({k} de {p}) : {e} vivait non loin.', {d: esc(dateFr(x.r.date)), n: `<b>« ${esc(x.r.n)} »</b>`, l: `<b>${esc(x.r.to)}</b>`, k: esc(kmTxt(x.km)), p: esc(x.place), e: esc(he(P))}), D.meta); },
        ponts: async life => { const D = await quiet(load('ponts')); if (!D) return ''; const list = bridgesFor(D.rows, life); if (!list.length) return '';
            return bridgesHtml(list, `${bridgeSentence(list[0])} ${esc(T('Près de {p}, pendant sa vie.', {p: list[0].place}))}`); },
        forges: async life => { const L = await merged('forges'); const {job, list} = worksFor(L, life, 'forges'); if (!list.length) return '';
            const lead = job ? T('Son métier touchait au fer : {l} près de ses lieux.', {l: list.slice(0, 2).map(x => `<b>${esc(x.r.n || T(WORK_WORD[x.r.k]))}</b> (${esc(kmTxt(x.km))})`).join(', ')})
                : T('Près de chez {e} : {l}.', {e: esc(he(life.person) === T('elle') ? T('elle') : T('lui')), l: list.slice(0, 2).map(x => `<b>${esc(x.r.n || T(WORK_WORD[x.r.k]))}</b> (${esc(kmTxt(x.km))})`).join(', ')});
            return worksHtml('forges', list, lead); },
        salines: async life => { const L = await merged('salines'); const {job, list} = worksFor(L, life, 'salines'); if (!list.length) return '';
            const lead = job ? T('Son métier touchait au sel : {l} près de ses lieux.', {l: list.slice(0, 2).map(x => `<b>${esc(x.r.n || T(WORK_WORD[x.r.k]))}</b> (${esc(kmTxt(x.km))})`).join(', ')})
                : T('Près de chez {e} : {l}.', {e: esc(he(life.person) === T('elle') ? T('elle') : T('lui')), l: list.slice(0, 2).map(x => `<b>${esc(x.r.n || T(WORK_WORD[x.r.k]))}</b> (${esc(kmTxt(x.km))})`).join(', ')});
            return worksHtml('salines', list, lead); },
        potager: async life => { const D = await quiet(load('potager')); if (!D) return ''; rowsMeta.potager = D.meta; const list = veggiesFor(D.rows, life); if (!list.length) return '';
            return veggiesHtml(list, T('Au potager de 1883, Vilmorin décrit {l}, du nom d’une commune proche de {p}.', {l: list.slice(0, 2).map(x => `<b>« ${esc(x.r.v)} »</b>`).join(T(' et ')), p: esc(list[0].place)})); },
        montyon: async life => { const D = await quiet(load('montyon')); if (!D) return ''; const list = montyonFor(D.rows, life); if (!list.length) return '';
            const x = list[0];
            return montyonHtml(list, T('Une personne de sa commune a été honorée : {n} reçoit le prix de vertu de l’Académie française en {y}.', {n: `<b>${esc(x.r.n)}</b>`, y: esc(String(x.r.y ?? '?'))})); },
        rosieres: async life => { const D = await quiet(load('rosieres')); if (!D) return ''; const list = rosieresFor(D.rows, life); if (!list.length) return '';
            const x = list[0];
            return rosieresHtml(list, x.r.since ? T('À {c}, on couronne une rosière ({s}).', {c: `<b>${esc(x.r.wp)}</b>`, s: esc(x.r.now ? T('depuis {y}', {y: String(x.r.since)}) : String(x.r.since))}) : T('À {c}, on couronne une rosière.', {c: `<b>${esc(x.r.wp)}</b>`}), D.meta); },
        silence: async life => { const D = await quiet(load('silence')); if (!D) return ''; const s = lifeSpan(life); if (s.birth === null || s.birth > 1940) return '';
            const list = soundsOf(D.rows, s.birth, s.birth + 20); if (!list.length) return '';
            return row('🔔', `${esc(T('Pendant sa jeunesse, au village, on entendait :'))} <q class="tf-quote">${esc(list[0].q)}</q> ${srcLink(list[0].url)}`, LIC.wp(list[0].url, T('Wikipédia, « {t} »', {t: list[0].title})),
                more(`<ul class="hist-ul tf-ul">${list.slice(1).map(r => `<li>${esc(r.icon)} <q class="tf-quote">${esc(r.q)}</q> ${srcLink(r.url)}</li>`).join('')}</ul>`, list.length - 1)); },
        volcans: async life => { const D = await quiet(load('volcans')); if (!D) return ''; const list = veiledYears(D.rows, life); if (!list.length) return '';
            const s = lifeSpan(life), fresh = list.filter(r => !r.known);
            const top = (fresh[0] || list[0]);
            const lead = T('En {y}, le ciel de sa vie a été voilé par les cendres d’un volcan lointain : {v}.', {y: `<b>${esc(String(top.y))}</b>`, v: esc(volcanoName(top))});
            const pts = aodSpan(D.meta, (s.birth ?? s.from), s.to);
            return row('🌋', `${lead} ${esc(T('{n} années de ciel voilé pendant sa vie.', {n: String(list.length)}))} ${srcLink(D.meta.url2 || D.meta.url)}`, LIC.noaa(),
                more(`${spark(pts, list.map(r => r.y))}<ul class="hist-ul tf-ul">${list.sort((a, b) => a.y - b.y).map(volcanoLi).join('')}</ul>${hyp(T('Mesuré dans les glaces du Groenland et de l’Antarctique : l’épaisseur des aérosols au-dessus de l’hémisphère nord (30° à 90° N). Au-dessus de 0,1, les couchers de soleil sont rougeoyants et le soleil pâlit ; les étés peuvent être plus frais.'))}`, list.length)); }};
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tf-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        return A().card(index, T('🌉 Le pays au XIXe siècle'), '', `<div class="tf-block" data-tf-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tf-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tfPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['ballons', 'ponts', 'forges', 'salines', 'cocher', 'potager', 'montyon', 'rosieres', 'silence'];
    /** 🏛 les notices Mérimée de la commune (pack « Patrimoine » installé : lu sur l'ordinateur) qui parlent de forges, salines, ponts */
    const MER = {forges: /forge|haut[- ]fourneau|fonderie|martinet|sid[ée]rurg/i, salines: /saline|salin|marais salant|saunerie/i, ponts: /pont suspendu/i};
    const merMemo = new Map();
    async function merimee(place, kind) {
        if (!place.id && !place.insee) return [];
        const k = `${place.id}|${place.insee}`;
        if (!merMemo.has(k)) merMemo.set(k, api('lp_place', place.insee ? {insee: place.insee} : {id: place.id}).catch(() => null));
        const r = await merMemo.get(k);
        return (r?.patrimoine?.installed ? r.patrimoine.list || [] : []).filter(o => o.base !== 'palissy' && MER[kind].test(`${o.deno || ''} ${o.nom || ''}`))
            .map(o => ({r: {via: 'mer', n: o.nom || o.deno, k: o.deno || '', siecle: o.siecle || '', url: safeUrl(o.url)}, km: 0}));
    }
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll && kind !== 'montyon') return '';
        const name = place.name || '';
        if (kind === 'ballons') { const D = await quiet(load('ballons')); if (!D) return ''; const list = near(D.rows, ll.lat, ll.lon, 30, 12); if (!list.length) return '';
            const x = list[0]; return balloonsHtml(list, T('Le {d}, pendant le siège de Paris, le ballon {n} s’est posé à {l} ({k}).', {d: esc(dateFr(x.r.date)), n: `<b>« ${esc(x.r.n)} »</b>`, l: `<b>${esc(x.r.to)}</b>`, k: esc(kmTxt(x.km))}), D.meta); }
        if (kind === 'ponts') { const D = await quiet(load('ponts')); const list = D ? near(D.rows, ll.lat, ll.lon, 15, 12) : []; const mer = await merimee(place, 'ponts'); if (!list.length && !mer.length) return '';
            const dated = list.find(x => x.r.from); return bridgesHtml([...list, ...mer].filter(x => x.r.n), dated ? `${bridgeSentence(dated)}` : T('Ponts suspendus à moins de 15 km : {l}.', {l: [...mer, ...list].slice(0, 2).map(x => `<b>${esc(x.r.n)}</b>`).join(', ')})); }
        if (kind === 'forges' || kind === 'salines') { const L = await merged(kind); const list = near(L, ll.lat, ll.lon, 12, 15); const mer = await merimee(place, kind); const all = [...mer, ...list]; if (!all.length) return '';
            return worksHtml(kind, all, T(kind === 'forges' ? 'Forges et hauts fourneaux à moins de 12 km : {l}.' : 'Salines et marais salants à moins de 12 km : {l}.', {l: all.slice(0, 3).map(x => `<b>${esc(x.r.n || T(WORK_WORD[x.r.k] || x.r.k))}</b>${x.km ? ` (${esc(kmTxt(x.km))})` : ''}`).join(', ')})); }
        if (kind === 'cocher') { const D = await quiet(load('osm_cocher')); if (!D) return ''; const list = near(D.rows.map(r => ({...r, via: 'osm'})), ll.lat, ll.lon, 6, 15); if (!list.length) return '';
            return worksHtml('cocher', list, T('Vieux panneaux de route à moins de 6 km : {l}.', {l: list.slice(0, 2).map(x => `<b>${esc(x.r.n || T(WORK_WORD[x.r.k]))}</b> (${esc(kmTxt(x.km))})`).join(', ')}),
                hyp(T('Plaques de cocher : poteaux et plaques indicatrices posés à partir de 1835 ; bornes Michelin : à partir des années 1910.'))); }
        if (kind === 'potager') { const D = await quiet(load('potager')); if (!D) return ''; rowsMeta.potager = D.meta; const list = near(D.rows.filter(r => num(r.lat) !== null), ll.lat, ll.lon, 25, 12); if (!list.length) return '';
            return veggiesHtml(list, T('Au potager de 1883, Vilmorin décrit {l}, du nom d’une commune proche.', {l: list.slice(0, 2).map(x => `<b>« ${esc(x.r.v)} »</b> (${esc(x.r.commune)})`).join(T(' et '))})); }
        if (kind === 'montyon') { const D = await quiet(load('montyon')); if (!D) return ''; const list = ll ? near(D.rows.filter(r => r.insee), ll.lat, ll.lon, 3, 6) : []; if (!list.length) return '';
            return montyonHtml(list, T('Une personne de {c} a été honorée : {n} reçoit le prix de vertu de l’Académie française en {y}.', {c: esc(name), n: `<b>${esc(list[0].r.n)}</b>`, y: esc(String(list[0].r.y ?? '?'))})); }
        if (kind === 'rosieres') { const D = await quiet(load('rosieres')); if (!D) return ''; const list = near(D.rows, ll.lat, ll.lon, 15, 10); if (!list.length) return '';
            const x = list[0]; const here = x.km < 3;
            return rosieresHtml(list, here ? (x.r.since ? T('À {c}, on couronne une rosière ({s}).', {c: `<b>${esc(x.r.wp)}</b>`, s: esc(x.r.now ? T('depuis {y}', {y: String(x.r.since)}) : String(x.r.since))}) : T('À {c}, on couronne une rosière.', {c: `<b>${esc(x.r.wp)}</b>`}))
                : T('Près d’ici, à {c} ({k}), on couronne une rosière.', {c: `<b>${esc(x.r.wp)}</b>`, k: esc(kmTxt(x.km))}), D.meta); }
        if (kind === 'silence') { const D = await quiet(load('silence')); if (!D) return ''; const list = soundsOf(D.rows, 1800, 1914); if (!list.length) return '';
            const N = D.meta.noise || {}, dep = String(place.insee || '').slice(0, 2);
            const mapU = String(N.map || '').replace('{lat}', String(ll.lat)).replace('{lon}', String(ll.lon));
            const cbsU = String(N.cbs || '').replace('{q}', encodeURIComponent(`carte de bruit stratégique ${dep && /^\d[\dAB]$/.test(dep) ? dep : ''}`.trim()));
            const today = `<p class="muted tf-noise">${esc(T('Et aujourd’hui ? Les cartes officielles du bruit (routes, voies ferrées, aéroports) sont publiées département par département :'))} ${link(cbsU, T('↗ cartes de bruit stratégiques (data.gouv.fr)'))} · ${link(mapU, T('↗ le village sur Géoportail'))}</p>`;
            return row('🔔', `${esc(T('Au XIXe siècle, au village, on entendait :'))} <q class="tf-quote">${esc(list.find(r => r.k === 'paysage')?.q || list[0].q)}</q> ${srcLink(list[0].url)}`, LIC.wp('https://fr.wikipedia.org/wiki/Cloche', T('Wikipédia (Angélus, Cloche, Tocsin)')),
                more(`<ul class="hist-ul tf-ul">${list.filter(r => r.k !== 'paysage').map(r => `<li>${esc(r.icon)} <q class="tf-quote">${esc(r.q)}</q> ${srcLink(r.url)}</li>`).join('')}</ul>${today}`, list.length - 1)); }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tf-panel"><h3>${esc(T('🌉 Le pays au XIXe siècle'))}</h3><div class="hist-life tf-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tf_place', host: '[data-tf-host]', icon: '🌉', label: 'Le pays au XIXe siècle', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tf])'); if (!village) return;
        village.dataset.tf = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-td-host]') || village.querySelector('[data-l10o-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tf-place" data-tf-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tf-host]'), villagePlace(village));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['ballons', 'tf_ballons', '🎈', 'Les ballons du siège de Paris', 'Le monde'], ['ponts', 'tf_ponts', '🌉', 'Les ponts suspendus', 'Le lieu'], ['forges', 'tf_forges', '⚒', 'Forges et hauts fourneaux', 'Le lieu'],
        ['salines', 'tf_salines', '🧂', 'Salines et marais salants', 'Le lieu'], ['cocher', 'tf_cocher', '🪧', 'Plaques de cocher et bornes Michelin', 'Le lieu'], ['potager', 'tf_potager', '🥕', 'Le potager de 1883', 'Le lieu'],
        ['montyon', 'tf_montyon', '🏅', 'Le prix de vertu', 'Le monde'], ['rosieres', 'tf_rosieres', '🌹', 'Les rosières', 'Le lieu'], ['silence', 'tf_silence', '🔔', 'Le silence d’autrefois', 'Le lieu']];
    const SRC_TXT = {ballons: 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', ponts: 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0)', forges: 'Wikidata (CC0) ; OpenStreetMap (ODbL) ; Mérimée', salines: 'Wikidata (CC0) ; OpenStreetMap (ODbL) ; Mérimée',
        cocher: 'OpenStreetMap (ODbL)', potager: 'Vilmorin 1883 (domaine public) ; Wikisource', montyon: 'Wikidata (CC0)', rosieres: 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', silence: 'Wikipédia (CC BY-SA 4.0)', volcans: 'NOAA NCEI (Crowley 2013 ; Gao 2008)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, group]) => ({
        id, icon, label, group, defaultOn: kind !== 'cocher', enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life tf-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const L = (id, pack, icon, label, group, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), group, source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); }, ...extra});
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    (ext.dataLists = ext.dataLists || []).push(
        L('tf_ballons', 'tf-ballons', '🎈', 'Ballons montés du siège de Paris (1870-1871)', 'Le monde', 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', 'https://fr.wikipedia.org/wiki/Ballon_mont%C3%A9', 'ballons',
            async () => (await rowsOf('ballons')).rows.map(r => ({num: r.num, date: r.date, name: r.n, from: r.from, to: r.to, km: r.km, fret: r.fret, lat: r.lat, lon: r.lon, src: wp(r.to_wp) || 'https://fr.wikipedia.org/wiki/Ballon_mont%C3%A9'})),
            [F('num', 'N°', 'number'), F('date', 'Départ', 'date'), F('name', 'Ballon'), F('from', 'Parti de'), F('to', 'Arrivé à', 'place'), F('km', 'Distance (km)', 'number'), F('fret', 'Il emportait'), F('src', 'Source', 'url')],
            {period: r => [Number(String(r.date).slice(0, 4)) || 1870, Number(String(r.date).slice(0, 4)) || 1871], geo: r => (r.lat !== null && r.lat !== undefined ? [r.lat, r.lon] : null)}),
        L('tf_ponts', 'tf-ponts', '🌉', 'Ponts suspendus de France', 'Le lieu', 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0)', 'https://www.wikidata.org/wiki/Q12570', 'ponts',
            async () => (await rowsOf('ponts')).rows.map(r => ({name: r.n, from: r.from, to: r.to, river: r.river, by: r.by, seguin: r.seguin ? T('oui') : '', replaces: r.replaces, commune: r.commune, lat: r.lat, lon: r.lon, src: wd(r.q) || wp(r.frwiki)})),
            [F('name', 'Nom'), F('from', 'Construit en', 'year'), F('to', 'Détruit en', 'year'), F('river', 'Rivière', 'enum'), F('by', 'Ingénieur'), F('seguin', 'Pont Seguin', 'enum'), F('replaces', 'Remplace'), F('commune', 'Commune', 'place'), F('src', 'Source', 'url')],
            {period: r => [r.from, r.to], geo: r => [r.lat, r.lon]}),
        ...['forges', 'salines', 'cocher'].map(k => L(`tf_${k}`, k === 'cocher' ? 'tf-osm-cocher' : `tf-${k}`, {forges: '⚒', salines: '🧂', cocher: '🪧'}[k], {forges: 'Forges, hauts fourneaux et martinets anciens', salines: 'Salines et marais salants', cocher: 'Plaques de cocher et bornes Michelin'}[k], 'Le lieu',
            k === 'cocher' ? 'OpenStreetMap (ODbL)' : 'Wikidata (CC0) ; OpenStreetMap (ODbL)', k === 'cocher' ? 'https://www.openstreetmap.org/copyright' : 'https://www.wikidata.org', k,
            async () => (k === 'cocher' ? (await rowsOf('osm_cocher')).rows.map(r => ({...r, via: 'osm'})) : await merged(k)).map(r => ({name: r.n, kind: T(WORK_WORD[r.k] || r.k), from: r.from, to: r.to, commune: r.commune || '', base: r.via === 'osm' ? 'OpenStreetMap' : 'Wikidata', lat: r.lat, lon: r.lon, src: r.via === 'osm' ? osmUrl(r.osm) : wd(r.q)})),
            [F('name', 'Nom'), F('kind', 'Sorte', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’en', 'year'), F('commune', 'Commune', 'place'), F('base', 'Base', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.from, r.to], geo: r => [r.lat, r.lon], ...(k === 'cocher' ? {} : {packs: [`tf-${k}`, `tf-osm-${k}`]})})),
        L('tf_potager', 'tf-potager', '🥕', 'Le potager de 1883 (Vilmorin) : légumes et variétés', 'Le lieu', 'Vilmorin-Andrieux 1883 (domaine public) ; Wikisource', 'https://fr.wikisource.org/wiki/Les_Plantes_potag%C3%A8res', 'potager',
            async () => { const D = await rowsOf('potager'); return D.rows.map(r => ({veg: r.veg, variety: r.v, page: r.page, commune: r.commune, lat: r.lat, lon: r.lon, src: String(D.meta.page_url || '').replace('{p}', encodeURIComponent(String(r.page)))})); },
            [F('veg', 'Légume', 'enum'), F('variety', 'Variété'), F('page', 'Page', 'number'), F('commune', 'Du nom de', 'place'), F('src', 'Source', 'url')], {geo: r => (r.lat !== null && r.lat !== undefined ? [r.lat, r.lon] : null)}),
        L('tf_montyon', 'tf-montyon', '🏅', 'Lauréats du prix de vertu Montyon (Wikidata)', 'Le monde', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q33139180', 'montyon',
            async () => (await rowsOf('montyon')).rows.map(r => ({name: r.n, year: r.y, place: r.place, what: r.d, lat: r.lat, lon: r.lon, src: wd(r.q)})),
            [F('name', 'Nom'), F('year', 'Année', 'year'), F('place', 'Lieu', 'place'), F('what', 'Description'), F('src', 'Source', 'url')], {period: r => [r.year, r.year], geo: r => (r.lat !== null && r.lat !== undefined ? [r.lat, r.lon] : null)}),
        L('tf_rosieres', 'tf-rosieres', '🌹', 'Communes qui couronnent une rosière', 'Le lieu', 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', 'https://fr.wikipedia.org/wiki/Rosi%C3%A8re', 'rosieres',
            async () => (await rowsOf('rosieres')).rows.map(r => ({commune: r.wp, since: r.since, now: r.now ? T('oui') : T('autrefois'), quote: r.quote, lat: r.lat, lon: r.lon, src: wp(r.wp)})),
            [F('commune', 'Commune', 'place'), F('since', 'Depuis', 'year'), F('now', 'Encore aujourd’hui', 'enum'), F('quote', 'La phrase de Wikipédia'), F('src', 'Source', 'url')], {period: r => [r.since, null], geo: r => [r.lat, r.lon]}),
        L('tf_volcans', 'tf-volcans', '🌋', 'Années de ciel voilé par les volcans (1600-2000)', 'Le monde', 'NOAA NCEI (Crowley 2013 ; Gao 2008)', 'https://www.ncei.noaa.gov/access/paleo-search/study/14168', 'volcans',
            async () => (await rowsOf('volcans')).rows.map(r => ({year: r.y, volcano: r.volcano || T('non identifié'), country: r.country, aod: r.aod, tg: r.tg, vei: r.vei, src: r.noaa ? `https://www.ngdc.noaa.gov/hazel/view/hazards/volcano/event-more-info/${r.noaa}` : 'https://www.ncei.noaa.gov/access/paleo-search/study/14168'})),
            [F('year', 'Année', 'year'), F('volcano', 'Volcan'), F('country', 'Pays', 'enum'), F('aod', 'Épaisseur des aérosols (30–90° N)', 'number'), F('tg', 'Soufre (Tg, hémisphère nord)', 'number'), F('vei', 'VEI', 'number'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.year]}));

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, label2 = r => r.n) => ({id, icon, label: T(label), group: 'Le lieu', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 2000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || num(r.to) === null || r.to >= from) && (!to || num(r.from) === null || r.from <= to) && (!q || fold(label2(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: label2(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('tf_ballons', '🎈', 'Arrivée des ballons du siège de Paris', async () => (await rowsOf('ballons')).rows.map(r => ({...r, from: 1870, to: 1871})), 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', r => `${r.n} (${r.date})`),
        layer('tf_ponts', '🌉', 'Ponts suspendus', async () => (await rowsOf('ponts')).rows, 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0)'),
        layer('tf_forges', '⚒', 'Forges et hauts fourneaux', () => merged('forges'), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', r => r.n || T(WORK_WORD[r.k] || r.k)),
        layer('tf_salines', '🧂', 'Salines et marais salants', () => merged('salines'), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', r => r.n || T(WORK_WORD[r.k] || r.k)),
        layer('tf_cocher', '🪧', 'Plaques de cocher et bornes Michelin', async () => (await rowsOf('osm_cocher')).rows, 'OpenStreetMap (ODbL)', r => r.n || T(WORK_WORD[r.k] || r.k)),
        layer('tf_potager', '🥕', 'Variétés potagères au nom d’une commune (1883)', async () => (await rowsOf('potager')).rows.map(r => ({...r, from: 1883, to: 1883})), 'Vilmorin 1883 ; Wikisource', r => r.v),
        layer('tf_rosieres', '🌹', 'Communes qui couronnent une rosière', async () => (await rowsOf('rosieres')).rows.map(r => ({...r, from: r.since, to: null})), 'Wikipédia (CC BY-SA 4.0)', r => r.wp));

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life tf-life">${html}</div>` : '';
        return !!html;
    }
    async function runYear(ctx, host) {
        const y = num(ctx.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        const D = await rowsOf('volcans'); const list = D.rows.filter(r => Math.abs(r.y - y) <= 1);
        const v = D.meta.aod ? D.meta.aod[y - D.meta.aod_from] : null;
        host.innerHTML = list.length || v !== null && v !== undefined ? `<div class="hist-life tf-life">${row('🌋', list.length ? `${esc(T('Autour de {y}, le ciel a été voilé par un volcan lointain :', {y: String(y)}))} ${esc(volcanoName(list[0]))}.` : esc(T('En {y}, l’épaisseur des aérosols volcaniques au-dessus de l’hémisphère nord était de {a} (au-dessus de 0,1 : ciel voilé).', {y: String(y), a: String(v ?? '?').replace('.', ',')})), LIC.noaa(), list.length ? `<ul class="hist-ul tf-ul">${list.map(volcanoLi).join('')}</ul>` : '')}</div>` : emptyLine(T('Pas de mesure pour cette année (1600 à 2000).'));
        return true;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'tfp_ballons', icon: '🎈', label: T('Le ballon du siège de Paris posé près de chez lui'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['ballons'], ctx, host, 'Pour une personne en vie en 1870-71, avec un lieu placé près de l’arrivée d’un ballon.')},
        {id: 'tfp_ponts', icon: '🌉', label: T('Les ponts suspendus construits pendant sa vie'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['ponts'], ctx, host, 'Aucun pont suspendu connu près de ses lieux pendant sa vie.')},
        {id: 'tfp_metiers', icon: '⚒', label: T('Forges et salines près de chez lui'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['forges', 'salines'], ctx, host, 'Aucune forge ni saline connue près de ses lieux.')},
        {id: 'tfp_potager', icon: '🥕', label: T('Le potager de 1883 près de chez lui'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['potager'], ctx, host, 'Pour une personne en vie en 1883 ; aucune variété au nom d’une commune proche.')},
        {id: 'tfp_village', icon: '🌹', label: T('Rosière et prix de vertu de sa commune'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['rosieres', 'montyon'], ctx, host, 'Rien de connu pour sa commune.')},
        {id: 'tfp_volcans', icon: '🌋', label: T('Les années de ciel voilé de sa vie'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['volcans', 'silence'], ctx, host, 'Il faut au moins une date de naissance.')},
        {id: 'tfy_volcans', icon: '🌋', label: T('Le ciel des volcans d’une année'), group: 'Le monde', needs: ['year'], online: false, installed: () => true, run: runYear},
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── ⚙️ Réglages → 🌉 Le pays au XIXe siècle ─────────── */
    const FILE_LABEL = [['ballons', '🎈 Ballons montés'], ['ponts', '🌉 Ponts suspendus'], ['forges', '⚒ Forges (Wikidata)'], ['osm_forges', '⚒ Forges (OpenStreetMap)'], ['salines', '🧂 Salines (Wikidata)'], ['osm_salines', '🧂 Salines (OpenStreetMap)'],
        ['osm_cocher', '🪧 Plaques de cocher (OpenStreetMap)'], ['potager', '🥕 Le potager de 1883'], ['montyon', '🏅 Prix de vertu'], ['rosieres', '🌹 Rosières'], ['silence', '🔔 Le silence d’autrefois'], ['volcans', '🌋 Ciel des volcans']];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tf-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(k.startsWith('osm_') ? T('À fabriquer sur GitHub (Actions → « Le pays au XIXe siècle (lot F) », quoi = osm) ; arrive ensuite par Réglages → 🗂 Données.') : T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings tf-settings" data-tf-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Le pays au XIXe siècle'), icon: '🌉', where: T('Réglages · Données'), help: esc(T('Ballons du siège de Paris, ponts suspendus, forges, salines, vieux panneaux de route, potager de 1883, prix de vertu, rosières, sons d’autrefois et ciel des volcans.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🌉 Le pays au XIXe siècle »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes, les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Seuls les liens « ↗ » ouvrent une page, quand on clique.'))}</p>
                <p class="muted">${esc(T('Déjà dans l’app et réutilisé : les notices Mérimée du pack « Patrimoine » (forges, salines, ponts de la commune) ; « 🌅 Les ciels étranges » et « 🌋 Les volcans… récoltes » (le récit de Laki, Tambora, Krakatoa) — ici seulement les mesures et les autres éruptions.'))}</p>
                <p class="muted">${esc(T('Liens seulement : les rapports du prix de vertu (Académie française, Wikisource), les cartes de bruit d’aujourd’hui (data.gouv.fr, par département), les gravures du potager (Wikimedia Commons).'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tf-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.tfTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🌉'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_d'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_d'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🌉 Le pays au XIXe siècle']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechF = {...core, load, settings, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
