/**
 * LCNDA — 🧺 Places, métiers et rivages (lot H « téléchargements ») : la place du village, les métiers du pays, l'eau et la mer.
 * Livré avec l'app (assets/data/th-*.json.gz, refaits par scripts/telech-h/*.py et .github/workflows/telech-h.yml, lus à la demande) :
 *   🎺 th-kiosques      kiosques à musique et sociétés de musique (Wikidata CC0) + th-osm-kiosques (OpenStreetMap ODbL, sur GitHub)
 *   🗽 th-marianne      monuments à la République, statues et bustes de Marianne (Wikidata CC0) ; e-monumen : lien seulement
 *   🏪 th-halles        halles et marchés couverts (Wikidata CC0) + th-osm-halles (OSM, sur GitHub) + notices Mérimée (pack « Patrimoine »)
 *   🍞 fours banals     RÉUTILISE les fours à pain du lot B (tb-wd-village, tb-osm-village) : ici sur la fiche d'une personne (boulanger…)
 *   🚡 th-funiculaires  funiculaires et ponts transbordeurs (Wikidata CC0)
 *   🛶 th-eclusieres    maisons éclusières et gares d'eau (Wikidata CC0) + th-osm-eclusieres (OSM, sur GitHub) ; marinier, éclusier…
 *   🚋 th-tramways      tramways et petits trains fermés avant 1975 (Wikidata CC0) + th-osm-traces : tracés disparus (OSM, sur GitHub)
 *   🗺 th-trudaine      Atlas de Trudaine (1745-1780) : planches déposées sur Wikimedia Commons (domaine public), par commune ; la
 *                       généralité vient de l'Atlas d'Ancien Régime déjà livré (dp-ancien-regime, lot « Droit et pouvoir »)
 *   🏰 th-bastides      bastides du Sud-Ouest : année et fondateur (« Liste de bastides », Wikipédia CC BY-SA 4.0 ; Wikidata CC0)
 *   🔪🧤🧺🍫🥫 th-ateliers coutelleries, ganteries, mégisseries, vanneries, chocolateries, biscuiteries, conserveries (Wikidata CC0)
 *   📖 th-textes        phrases de Wikipédia (CC BY-SA 4.0) qui nomment une commune : coutellerie, ganterie, vannerie, chocolat, conserves,
 *                       terre-neuvas, la mer nourricière (huîtres, goémon, pêche à pied), plantes à teinture (garance, pastel)
 * Tout est lu sur l'ordinateur : rien ne part sur Internet (ni nom, ni lieu), pour personne. Seuls les liens « ↗ » ouvrent une page.
 * Où : fiche d'une personne, bloc « 🧺 Places, métiers et rivages » ; fiche d'un village et Monographie de commune ; Listes ; Cartes ;
 *   à la demande (dataSources) ; Réglages → « 🧺 Places, métiers et rivages » (chaque sujet s'éteint ↶, À propos des données).
 * localStorage : « genealogie-telech-h ».   window.LCNDA_EXT.telechH = {core…, load, personInto, placeInto, openSettings}
 * Essai : tests/test-telech-h.js
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
    const aliveIn = (life, a, b = a) => { const s = lifeSpan(life); return s.from !== null && s.to !== null && s.from <= b && s.to >= a; };
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase()}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    function nearLife(rows, life, radius, when = () => true, key = r => r.q || r.osm || `${r.lat},${r.lon}`) {
        const out = new Map();
        for (const e of placedEvents(life)) for (const x of near(rows, e.lat, e.lon, radius, 200)) {
            if (!when(x.r, e)) continue;
            const k = key(x.r), cur = out.get(k); if (!cur || x.km < cur.km) out.set(k, {...x, place: e.name});
        }
        return [...out.values()].sort((a, b) => a.km - b.km);
    }
    const jobsText = life => fold([...(life?.jobs || []).map(j => j.text), life?.text || ''].join(' '));
    /** le métier qui correspond (le mot trouvé), ou '' */
    const jobOf = (life, re) => {
        if (!re) return '';
        for (const j of life?.jobs || []) if (re.test(fold(j.text))) return String(j.text || '').trim().slice(0, 60); // le mot tel qu'il est écrit
        const m = re.exec(fold(life?.text || '')); return m ? m[0] : '';
    };
    /** existait pendant sa vie (dates inconnues : oui) */
    const during = (life, r) => { const s = lifeSpan(life); return (num(r.from) === null || s.to === null || r.from <= s.to) && (num(r.to) === null || s.from === null || r.to >= s.from); };
    /** les métiers de chaque sujet (texte sans accents, en minuscules) */
    const JOBS_RE = {
        kiosques: /\b(musicien|musicienne|chef de musique|clairon|tambour|trompette|cornettiste|chef de fanfare|chef d orchestre|harmonie)\b/,
        halles: /\b(marchand|marchande|boucher|bouchere|poissonnier|poissonniere|regrattier|regrattiere|revendeur|revendeuse|forain|placier|mesureur|grainetier|fruitier|fruitiere|maraicher|maraichere)\b/,
        fours: /\b(boulanger|boulangere|fournier|fourniere|panetier|mitron|meunier)\b/,
        eclusieres: /\b(marinier|mariniere|batelier|bateliere|eclusier|eclusiere|haleur|flotteur|passeur|voiturier par eau|chalandier|gabarier|pontonnier|marchand de bois flotte)\b/,
        coutellerie: /\b(coutelier|couteliere|emouleur|remouleur|gagne petit|forgeur de lames|polisseur)\b/,
        ganterie: /\b(gantier|gantiere|megissier|megissiere|chamoiseur|peaussier|palissonneur|couseuse de gants|coupeur de gants)\b/,
        vannerie: /\b(vannier|vanniere|osierier|tresseur|faiseur de paniers|clissier|clisseuse)\b/,
        chocolat: /\b(chocolatier|chocolatiere|biscuitier|biscuitiere|confiseur|confiseuse)\b/,
        conserverie: /\b(sardinier|sardiniere|friturier|frituriere|conserveur|usiniere|soudeur de boites|ferblantier)\b/,
        terreneuvas: /\b(terre neuvas|terre neuvier|marin|matelot|marin pecheur|pecheur|mousse|novice|saleur|graviere|inscrit maritime|armateur|capitaine au long cours|maitre au cabotage)\b/,
        mer: /\b(ostreiculteur|ostreicultrice|parqueur|parqueuse|goemonier|goemoniere|pecheur a pied|pecheuse a pied|pecheuse|mareyeur|mareyeuse|mytiliculteur|boucholeur|varechier)\b/,
        teinture: /\b(teinturier|teinturiere|pastelier|garancier|garanciere|cocagnier|drapier)\b/};
    /** 📍 les objets d'un sujet près de ses lieux : {job, list} (plus loin quand il en avait le métier) */
    function pointsFor(rows, life, radius = [3, 15], re = null) {
        const job = jobOf(life, re);
        return {job, list: nearLife(rows, life, job ? radius[1] : radius[0], r => during(life, r))};
    }
    /** 📖 les phrases et ateliers d'un métier près de ses lieux (il vivait avant 1960) */
    function craftFor(textRows, atRows, life, re, rJob = 40, rAny = 10) {
        const s = lifeSpan(life); if (s.from === null || s.from > 1960) return {job: '', texts: [], ateliers: []};
        const job = jobOf(life, re), R = job ? rJob : rAny;
        return {job, texts: nearLife(textRows, life, R, () => true, r => `${r.insee}|${r.quote}`), ateliers: nearLife(atRows, life, R, r => during(life, r))};
    }
    /** 🏰 la bastide de sa commune (moins de 2 km) */
    const bastideFor = (rows, life) => nearLife(rows, life, 2, () => true, r => r.insee);
    /** 🗺 les planches de l'Atlas de Trudaine qui nomment sa commune (il vivait avant 1830) */
    function trudaineFor(rows, life) { const s = lifeSpan(life); return s.from !== null && s.from <= 1830 ? nearLife(rows, life, 3, () => true, r => r.file) : []; }
    /** 🚋 distance (km) d'un point à un tracé [lon, lat, lon, lat…] */
    function distLine(lat, lon, flat) {
        const cx = Math.cos(lat * Math.PI / 180) * 111, cy = 111; let best = Infinity;
        for (let i = 0; i + 3 < flat.length; i += 2) {
            const ax = (flat[i] - lon) * cx, ay = (flat[i + 1] - lat) * cy, bx = (flat[i + 2] - lon) * cx, by = (flat[i + 3] - lat) * cy;
            const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
            best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
        }
        return best;
    }
    /** les tracés à moins de radius km d'un point */
    function nearLines(rows, lat, lon, radius, max = 20) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) {
            const b = r.bbox || (r.bbox = bboxOf(r.line || []));
            if (!b || lat < b[1] - dLat || lat > b[3] + dLat || lon < b[0] - dLon || lon > b[2] + dLon) continue;
            const d = distLine(lat, lon, r.line); if (d <= radius) out.push({r, km: d});
        }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    function bboxOf(f) { if (f.length < 4) return null; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i + 1 < f.length; i += 2) { a = Math.min(a, f[i]); c = Math.max(c, f[i]); b = Math.min(b, f[i + 1]); d = Math.max(d, f[i + 1]); } return [a, b, c, d]; }
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const okQ = q => /^Q\d{1,12}$/.test(String(q || ''));
    const okOsm = k => /^[nwr]\d{1,15}$/.test(String(k || ''));

    const core = {num, fold, table, km, lifeSpan, aliveIn, placedEvents, near, nearLife, jobsText, jobOf, during, pointsFor, craftFor, bastideFor, trudaineFor, distLine, nearLines, safeUrl, okQ, okOsm, JOBS_RE};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-h';
    const TAB = ['telech_h', '25th', '🧺 Places, métiers et rivages'];
    const BLOCK = 'telech_h';
    const PARTS = [
        ['kiosques', '🎺 Kiosques à musique et fanfares', 'Les kiosques à musique et les sociétés de musique près de chez eux (plus loin pour un musicien).'],
        ['marianne', '🗽 Monuments à la République', 'Les statues de la République et les bustes de Marianne inaugurés près de chez eux.'],
        ['halles', '🏪 Halles et marchés couverts', 'Les halles anciennes du pays (plus loin pour un marchand, un boucher).'],
        ['fours', '🍞 Le four banal', 'Le four à pain du village (lot « Village et nature », réutilisé) sur la fiche d’un boulanger ou de ses voisins.'],
        ['funiculaires', '🚡 Funiculaires et ponts transbordeurs', 'Les funiculaires et les ponts transbordeurs ouverts près de chez eux pendant leur vie.'],
        ['eclusieres', '🛶 Maisons éclusières et gares d’eau', 'La vie des mariniers : maisons éclusières et gares d’eau (plus loin pour un marinier, un éclusier).'],
        ['tramways', '🚋 Tramways et petits trains disparus', 'Les tramways et petits trains d’autrefois, et les tracés disparus (OpenStreetMap, à fabriquer sur GitHub).'],
        ['trudaine', '🗺 L’Atlas de Trudaine', 'Les planches de l’Atlas des routes de France (1745-1780) qui nomment leur village, et la généralité.'],
        ['bastides', '🏰 Les bastides du Sud-Ouest', 'La bastide de leur commune : année de fondation et fondateur.'],
        ['coutellerie', '🔪 Coutellerie', 'Thiers, Nogent, Laguiole… (plus loin pour un coutelier).'],
        ['ganterie', '🧤 Ganterie et mégisserie', 'Millau, Grenoble, Annonay, Saint-Junien… (plus loin pour un gantier, un mégissier).'],
        ['vannerie', '🧺 Vannerie et osier', 'Les pays de l’osier et des vanniers.'],
        ['chocolat', '🍫 Biscuiteries et chocolateries', 'Les fabriques de chocolat et de biscuits fondées avant 1914.'],
        ['conserverie', '🥫 Sardineries et conserveries', 'Les conserveries de sardines et de poisson (plus loin pour une sardinière).'],
        ['terreneuvas', '🐟 Les terre-neuvas', 'Les ports d’armement pour la pêche à la morue (plus loin pour un marin, un pêcheur).'],
        ['mer', '🦪 La mer nourricière', 'Parcs à huîtres, goémoniers, pêche à pied (plus loin pour un ostréiculteur, un goémonier).'],
        ['teinture', '🌿 Plantes à teinture', 'La garance d’Avignon, le pastel du Lauragais (plus loin pour un teinturier).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    /** « à Thiers » ou « à 12 km de Thiers » */
    const nearTxt = (k, p) => (k < 1 ? T('à {p}', {p}) : T('à {n} km de {p}', {n: String(Math.round(k)), p}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="th-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row th-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="th-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (okQ(q) ? `https://www.wikidata.org/wiki/${q}` : '');
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const osmUrl = k => { if (!okOsm(k)) return ''; const t = {n: 'node', w: 'way', r: 'relation'}[k[0]]; return `https://www.openstreetmap.org/${t}/${k.slice(1)}`; };
    const commonsFile = f => (f ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(f).replace(/ /g, '_'))}` : '');
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (CC0)`,
        wp: (u, label = 'Wikipédia') => `${link(u || 'https://fr.wikipedia.org', label)} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs de Wikipédia'))})`,
        osm: () => `${link('https://www.openstreetmap.org/copyright', T('© les contributeurs d’OpenStreetMap'))} (ODbL)`,
        mer: () => `${link('https://www.pop.culture.gouv.fr/', 'Mérimée')} (${esc(T('Licence Ouverte, pack « Patrimoine » installé'))})`,
        commons: () => `${link('https://commons.wikimedia.org/wiki/Category:Atlas_de_Trudaine', 'Wikimedia Commons')} (${esc(T('domaine public'))})`,
        ar: () => `${link('https://github.com/t-fressin/atlas-ancien-regime', T('Atlas d’Ancien Régime (Th. Fressin)'))} (CC BY 4.0)`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {kiosques: 'th-kiosques', osm_kiosques: 'th-osm-kiosques', marianne: 'th-marianne', halles: 'th-halles', osm_halles: 'th-osm-halles', funiculaires: 'th-funiculaires',
        eclusieres: 'th-eclusieres', osm_eclusieres: 'th-osm-eclusieres', tramways: 'th-tramways', osm_traces: 'th-osm-traces', bastides: 'th-bastides', trudaine: 'th-trudaine',
        ateliers: 'th-ateliers', textes: 'th-textes', tb_wd: 'tb-wd-village', tb_osm: 'tb-osm-village'};
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
            .then(f => (f ? {meta: f, rows: table(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    /** Wikidata + OpenStreetMap d'un sujet (un point OSM à moins de 80 m d'un point Wikidata est le même) */
    async function merged(kind) {
        if (kind === 'fours') { // 🍞 les fours à pain du lot B, réutilisés tels quels
            const [W, O] = await Promise.all([rowsOf('tb_wd'), rowsOf('tb_osm')]);
            const out = W.rows.filter(r => r.k === 'four' && (!r.country || r.country === 'France')).map(r => ({q: r.src, n: r.n, k: 'four', lat: r.lat, lon: r.lon, from: num(r.from), to: num(r.to), commune: r.commune || '', insee: r.insee || '', frwiki: r.fr || '', via: 'wd'}));
            for (const o of O.rows.filter(r => r.k === 'four')) if (!out.some(w => Math.abs(w.lat - o.lat) < 0.002 && km(w.lat, w.lon, o.lat, o.lon) < 0.08)) out.push({q: '', osm: o.osm, n: o.n, k: 'four', lat: o.lat, lon: o.lon, from: num(o.from), to: null, via: 'osm'});
            return out;
        }
        const [W, O] = await Promise.all([rowsOf(kind), FILES[`osm_${kind}`] ? rowsOf(`osm_${kind}`) : {rows: []}]);
        const out = W.rows.map(r => ({...r, via: 'wd'}));
        for (const o of O.rows) if (!out.some(w => w.via === 'wd' && Math.abs(w.lat - o.lat) < 0.002 && km(w.lat, w.lon, o.lat, o.lon) < 0.08)) out.push({...o, q: '', via: 'osm', from: num(o.from), to: num(o.to)});
        return out;
    }
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const isShe = P => P?.gender === 'female';

    /* ─────────── les morceaux ─────────── */
    // sujets « points » : [fichier, icône, mots de chaque sorte, rayons fiche [sans, avec métier], rayon village, regex Mérimée]
    const PT = {
        kiosques: ['kiosques', '🎺', {kiosque: 'kiosque à musique', fanfare: 'société de musique'}, [3, 15], 8, /kiosque/i],
        marianne: ['marianne', '🗽', {marianne: 'Marianne', republique: 'monument à la République'}, [4, 4], 10, null],
        halles: ['halles', '🏪', {halle: 'halle'}, [2, 10], 6, /halle|march[ée] couvert/i],
        fours: ['fours', '🍞', {four: 'four à pain'}, [1, 5], 3, /four (banal|à pain|communal)/i],
        funiculaires: ['funiculaires', '🚡', {funiculaire: 'funiculaire', transbordeur: 'pont transbordeur'}, [12, 12], 15, /transbordeur|funiculaire/i],
        eclusieres: ['eclusieres', '🛶', {maison: 'maison éclusière', gare: 'gare d’eau'}, [2, 20], 6, /[ée]clus/i],
        tramways: ['tramways', '🚋', {tramway: 'tramway', ligne: 'petit train', secondaire: 'chemin de fer secondaire'}, [10, 10], 12, null]};
    const word = (kind, k) => T(PT[kind][2][k] || k || '');
    const urlOf = r => (r.via === 'osm' ? osmUrl(r.osm) : r.via === 'mer' ? safeUrl(r.url) : wp(r.frwiki) || wd(r.q));
    const srcOf = r => (r.via === 'osm' ? osmUrl(r.osm) : r.via === 'mer' ? safeUrl(r.url) : wd(r.q));
    const yearsTxt = r => (r.from ? `${r.from}${r.to ? `–${r.to}` : ''}` : r.to ? T('jusqu’en {y}', {y: String(r.to)}) : '');
    const ptLi = kind => x => (x.r.via === 'mer' ? `<li>🏛 ${link(x.r.url, x.r.n)} <small class="muted">(${esc(x.r.k)}${x.r.siecle ? ` · ${esc(x.r.siecle)}` : ''})</small> ${srcLink(x.r.url)}</li>`
        : `<li>${PT[kind][1]} <b>${link(urlOf(x.r), x.r.n || word(kind, x.r.k))}</b> <small class="muted">(${esc(word(kind, x.r.k))}${yearsTxt(x.r) ? `, ${esc(yearsTxt(x.r))}` : ''}${x.r.commune ? ` · ${esc(x.r.commune)}` : ''}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''}${x.r.mh ? ` · ${esc(T('monument historique'))}` : ''})</small> ${srcLink(srcOf(x.r))}</li>`);
    const ptSrc = list => [list.some(x => x.r.via === 'wd') ? LIC.wd() : '', list.some(x => x.r.via === 'osm') ? LIC.osm() : '', list.some(x => x.r.via === 'mer') ? LIC.mer() : ''].filter(Boolean).join(' · ');
    const NOTE = {kiosques: 'Les fanfares et harmonies municipales jouaient au kiosque le dimanche et pour les fêtes. Les sociétés de musique sont rarement dans Wikidata.',
        marianne: 'Sous la IIIe République, les communes inaugurent statues de la République et bustes de Marianne ; la liste de Wikidata est très incomplète. L’inventaire e-monumen (lien) en recense bien plus.',
        halles: 'La halle abritait le marché et souvent les poids et mesures ; beaucoup datent du Moyen Âge ou du XIXe siècle (halles en fer).',
        fours: 'Le four banal appartenait au seigneur (banalité) puis souvent à la commune : on y cuisait son pain contre une redevance. Données du lot « Village et nature ».',
        funiculaires: 'Le pont transbordeur faisait passer piétons et voitures d’une rive à l’autre dans une nacelle suspendue, sans gêner les bateaux.',
        eclusieres: 'L’éclusier logeait dans la maison éclusière, au bord du canal ; les mariniers attendaient le passage, s’approvisionnaient, échangeaient les nouvelles. La gare d’eau : un bassin où les bateaux se garaient.',
        tramways: 'Tramways et petits trains d’intérêt local desservaient les bourgs à la fin du XIXe et au début du XXe siècle ; la plupart ont fermé depuis. Seulement ceux qui ont fermé avant 1975.'};
    const EMON = 'https://e-monumen.net/';
    function pointsHtml(kind, list, lead) {
        const first = list[0].r;
        const extra = kind === 'marianne' ? ` ${link(EMON, T('↗ e-monumen (inventaire des monuments)'))}` : '';
        return row(PT[kind][1], `${lead} ${srcLink(srcOf(first))}`, ptSrc(list), more(`<ul class="hist-ul th-ul">${list.slice(0, 15).map(ptLi(kind)).join('')}</ul>${hyp(T(NOTE[kind]))}${extra}`, list.length));
    }
    const names2 = (kind, list) => list.slice(0, 2).map(x => `<b>${esc(x.r.n || word(kind, x.r.k))}</b> (${esc(kmTxt(x.km))})`).join(', ');
    const traceLi = x => `<li>🚋 <b>${link(osmUrl(x.r.osm), x.r.n || T('voie ferrée disparue'))}</b> <small class="muted">(${esc(T(x.r.k === 'razed' ? 'rasée' : x.r.k === 'disused' ? 'désaffectée' : 'abandonnée'))}${yearsTxt(x.r) ? `, ${esc(yearsTxt(x.r))}` : ''}${x.km !== undefined ? `, ${esc(x.km < 1 ? T('{n} m', {n: String(Math.max(10, Math.round(x.km * 100) * 10))}) : kmTxt(x.km))}` : ''})</small> ${srcLink(osmUrl(x.r.osm))}</li>`;
    // métiers : [icône, sortes d'ateliers, sorte de textes, rayon avec métier]
    const CR = {coutellerie: ['🔪', ['coutellerie'], 'coutellerie', 40], ganterie: ['🧤', ['ganterie', 'megisserie'], 'ganterie', 40], vannerie: ['🧺', ['vannerie'], 'vannerie', 40],
        chocolat: ['🍫', ['chocolaterie', 'biscuiterie'], 'chocolat', 30], conserverie: ['🥫', ['conserverie'], 'conserverie', 40], terreneuvas: ['🐟', [], 'terreneuvas', 60],
        mer: ['🦪', [], 'mer', 40], teinture: ['🌿', [], 'teinture', 40]};
    const AT_WORD = {coutellerie: 'coutellerie', ganterie: 'ganterie', megisserie: 'mégisserie', vannerie: 'vannerie', chocolaterie: 'chocolaterie', biscuiterie: 'biscuiterie', conserverie: 'conserverie'};
    const CR_NOTE = {chocolat: 'Seulement les fabriques fondées avant 1914.', terreneuvas: 'Les terre-neuvas partaient au printemps pêcher la morue sur les bancs de Terre-Neuve et revenaient à l’automne.',
        mer: 'Les zones conchylicoles d’aujourd’hui (Ifremer) se consultent en ligne : lien seulement.', teinture: 'La garance (rouge) et le pastel (bleu) ont fait la richesse du Comtat et du Lauragais avant les teintures chimiques.'};
    const IFREMER = 'https://www.data.gouv.fr/datasets/?q=zones%20conchylicoles';
    async function craftRows(kind) {
        const [X, W] = await Promise.all([rowsOf('textes'), rowsOf('ateliers')]);
        const c = CR[kind];
        return {texts: X.rows.filter(r => r.k === c[2] && num(r.lat) !== null), ateliers: W.rows.filter(r => c[1].includes(r.k) && (kind !== 'chocolat' || (num(r.from) !== null && r.from < 1914))), ctx: X.meta.ctx?.[c[2]] || [], arts: X.meta.articles || {}};
    }
    const textLi = x => `<li>📖 <b>${esc(x.r.commune)}</b>${x.km !== undefined ? ` <small class="muted">(${esc(kmTxt(x.km))})</small>` : ''}<q class="th-quote">${esc(x.r.quote)}</q> ${srcLink(wp(x.r.title))}</li>`;
    const atLi = x => `<li>🏭 <b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${esc(T(AT_WORD[x.r.k] || x.r.k))}${x.r.from ? `, ${esc(T('fondée en {y}', {y: String(x.r.from)}))}` : ''}${x.r.to ? `, ${esc(T('fermée en {y}', {y: String(x.r.to)}))}` : ''}${x.r.commune ? ` · ${esc(x.r.commune)}` : ''}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small> ${srcLink(wd(x.r.q))}</li>`;
    function craftHtml(kind, C, texts, ateliers, lead) {
        const c = CR[kind], src = [texts.length ? LIC.wp(wp(texts[0].r.title), T('Wikipédia, « {t} »', {t: texts[0].r.title})) : '', ateliers.length ? LIC.wd() : ''].filter(Boolean).join(' · ');
        const ctx = C.ctx[0] ? `<q class="th-quote">${esc(C.ctx[0].q)}</q> ${srcLink(C.ctx[0].url)}` : '';
        const tail = kind === 'mer' ? ` ${link(IFREMER, T('↗ zones conchylicoles (data.gouv.fr)'))}` : '';
        return row(c[0], lead, src, more(`<ul class="hist-ul th-ul">${texts.slice(0, 8).map(textLi).join('')}${ateliers.slice(0, 8).map(atLi).join('')}</ul>${ctx}${CR_NOTE[kind] ? hyp(T(CR_NOTE[kind])) : ''}${tail}`, texts.length + ateliers.length));
    }
    function craftLead(kind, texts, ateliers, where, job, P) {
        const pre = job ? `${esc(T(isShe(P) ? 'Elle était {j}.' : 'Il était {j}.', {j: job}))} ` : '';
        if (texts.length) { const x = texts[0], c = `<b>${esc(x.r.commune)}</b>`;
            return `${pre}${x.km < 1 ? T('À {c}, Wikipédia dit :', {c}) : T('À {c} ({k} de {p}), Wikipédia dit :', {c, k: esc(kmTxt(x.km)), p: esc(x.place || where)})}<q class="th-quote">${esc(x.r.quote)}</q> ${srcLink(wp(x.r.title))}`; }
        const x = ateliers[0];
        return `${pre}${T('{w} : {n} ({k}){y}.', {w: esc(T('Près de {p}', {p: x.place || where})), n: `<b>${esc(x.r.n)}</b>`, k: esc(kmTxt(x.km)), y: x.r.from ? ` — ${esc(T('fondée en {y}', {y: String(x.r.from)}))}` : ''})} ${srcLink(wd(x.r.q))}`;
    }
    const bastideTxt = r => (r.y && r.by ? T('{c} est une bastide, fondée en {y} par {b}.', {c: `<b>${esc(r.wp)}</b>`, y: esc(String(r.y)), b: esc(r.by)})
        : r.y ? T('{c} est une bastide, fondée en {y}.', {c: `<b>${esc(r.wp)}</b>`, y: esc(String(r.y))}) : r.by ? T('{c} est une bastide, fondée par {b}.', {c: `<b>${esc(r.wp)}</b>`, b: esc(r.by)}) : T('{c} est une bastide.', {c: `<b>${esc(r.wp)}</b>`}));
    const bastideLi = x => `<li>🏰 <b>${link(wp(x.r.wp), x.r.wp)}</b> <small class="muted">(${x.r.y ? esc(String(x.r.y)) : '?'}${x.r.by ? ` · ${esc(x.r.by)}` : ''}${x.r.dep ? ` · ${esc(x.r.dep)}` : ''}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small></li>`;
    function bastidesHtml(list, lead, meta) {
        return row('🏰', `${lead} ${srcLink(meta.url || wp('Liste de bastides'))}`, `${LIC.wp(meta.url, T('Wikipédia, « Liste de bastides »'))} · ${LIC.wd()}`,
            more(`<ul class="hist-ul th-ul">${list.slice(0, 12).map(bastideLi).join('')}</ul>${hyp(T('Une bastide est une ville neuve du Sud-Ouest fondée aux XIIIe et XIVe siècles, avec un plan régulier autour d’une place à cornières. Liste non exhaustive ; les dates varient selon les auteurs.'))}`, list.length));
    }
    const plateLi = x => `<li>🗺 ${link(commonsFile(x.r.file), String(x.r.file).replace(/\.[a-z]+$/i, ''))} <small class="muted">(${esc(x.r.commune)}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''} · ${esc(x.r.lic || T('domaine public'))})</small></li>`;
    const ARCHIM = 'https://www.culture.gouv.fr/documentation/archim/atlasdetrudaine.htm';
    const COMMONS_CAT = 'https://commons.wikimedia.org/wiki/Category:Atlas_de_Trudaine';
    function trudaineHtml(list, lead, gen) {
        const links = `${link(ARCHIM, T('↗ l’Atlas aux Archives nationales (Archim)'))} · ${link(COMMONS_CAT, T('↗ les planches sur Wikimedia Commons'))}`;
        return row('🗺', `${lead} ${list.length ? srcLink(commonsFile(list[0].r.file)) : srcLink(ARCHIM)}`, [list.length ? LIC.commons() : '', gen ? LIC.ar() : ''].filter(Boolean).join(' · ') || link(ARCHIM, 'Archim'),
            more(`${list.length ? `<ul class="hist-ul th-ul">${list.slice(0, 10).map(plateLi).join('')}</ul>` : ''}${hyp(T('L’Atlas des routes de France, dit de Trudaine (1745-1780, Archives nationales, CP/F/14/8443 à 8507) : plus de 3 000 planches aquarellées, généralité par généralité ; les pays d’États (Bretagne, Languedoc…) n’y sont pas.'))} ${links}`, list.length));
    }

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['kiosques', 'marianne', 'halles', 'fours', 'funiculaires', 'eclusieres', 'tramways', 'trudaine', 'bastides', 'coutellerie', 'ganterie', 'vannerie', 'chocolat', 'conserverie', 'terreneuvas', 'mer', 'teinture'];
    async function personPoints(kind, life) {
        const L = await merged(PT[kind][0]); if (!L.length) return '';
        const {job, list} = pointsFor(L, life, PT[kind][3], JOBS_RE[kind]);
        if (kind === 'tramways') { // + les tracés disparus (OpenStreetMap) à moins de 1,5 km
            const D = await quiet(load('osm_traces'));
            if (D) { const seen = new Set(); for (const e of placedEvents(life)) for (const x of nearLines(D.rows, e.lat, e.lon, 1.5, 5)) if (!seen.has(x.r.osm)) { seen.add(x.r.osm); list.push({...x, r: {...x.r, via: 'osm'}, place: e.name, trace: true}); } }
        }
        if (!list.length) return '';
        const P = life.person, pts = list.filter(x => !x.trace), x = pts[0] || list[0];
        const s = lifeSpan(life);
        let lead;
        if (x.trace) lead = T('Une voie ferrée aujourd’hui disparue passait {w} : {n}.', {w: esc(nearTxt(x.km, x.place)), n: `<b>${esc(x.r.n || T('voie ferrée disparue'))}</b>`});
        else if (job) lead = `${esc(T(isShe(P) ? 'Elle était {j}.' : 'Il était {j}.', {j: job}))} ${T('Près de ses lieux : {l}.', {l: names2(kind, pts)})}`;
        else if (num(x.r.from) !== null && s.from !== null && x.r.from >= s.from && x.r.from <= s.to) lead = T('En {y} : {n}, {w}.', {y: esc(String(x.r.from)), n: `<b>${esc(x.r.n || word(kind, x.r.k))}</b>`, w: esc(nearTxt(x.km, x.place))});
        else if (kind === 'tramways' && x.r.from && x.r.to) lead = T('De {a} à {b}, {n} passait {w}.', {a: esc(String(x.r.from)), b: esc(String(x.r.to)), n: `<b>${esc(x.r.n)}</b>`, w: esc(nearTxt(x.km, x.place))});
        else lead = T('Près de ses lieux : {l}.', {l: names2(kind, pts.length ? pts : list)});
        if (kind === 'tramways') {
            const tr = list.filter(y => y.trace), ps = list.filter(y => !y.trace);
            return row('🚋', `${lead} ${srcLink(x.trace ? osmUrl(x.r.osm) : srcOf(x.r))}`, ptSrc(list), more(`<ul class="hist-ul th-ul">${ps.slice(0, 10).map(ptLi('tramways')).join('')}${tr.slice(0, 5).map(traceLi).join('')}</ul>${hyp(T(NOTE.tramways))}`, list.length));
        }
        return pointsHtml(kind, list, lead);
    }
    const JOBS = {
        ...Object.fromEntries(Object.keys(PT).map(k => [k, life => personPoints(k, life)])),
        trudaine: async life => { const D = await quiet(load('trudaine')); if (!D) return ''; const list = trudaineFor(D.rows, life); if (!list.length) return '';
            return trudaineHtml(list, T('Son village figure sur une planche de l’Atlas de Trudaine (1745-1780) : {n}.', {n: `<b>${esc(list[0].r.commune)}</b>`}), null); },
        bastides: async life => { const D = await quiet(load('bastides')); if (!D) return ''; const list = bastideFor(D.rows, life); if (!list.length) return '';
            return bastidesHtml(list, bastideTxt(list[0].r), D.meta); },
        ...Object.fromEntries(Object.keys(CR).map(k => [k, async life => {
            const C = await craftRows(k); if (!C.texts.length && !C.ateliers.length) return '';
            const {job, texts, ateliers} = craftFor(C.texts, C.ateliers, life, JOBS_RE[k], CR[k][3], 10);
            if (!texts.length && !ateliers.length) return '';
            const where = (texts[0] || ateliers[0]).place || '';
            return craftHtml(k, C, texts, ateliers, craftLead(k, texts, ateliers, where, job, life.person));
        }]))};
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life th-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        return A().card(index, T('🧺 Places, métiers et rivages'), '', `<div class="th-block" data-th-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-th-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.thPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['kiosques', 'marianne', 'halles', 'funiculaires', 'eclusieres', 'tramways', 'trudaine', 'bastides', 'coutellerie', 'ganterie', 'vannerie', 'chocolat', 'conserverie', 'terreneuvas', 'mer', 'teinture'];
    /** 🏛 les notices Mérimée de la commune (pack « Patrimoine » installé : lu sur l'ordinateur) */
    const merMemo = new Map();
    async function merimee(place, re) {
        if (!re || (!place.id && !place.insee)) return [];
        const k = `${place.id}|${place.insee}`;
        if (!merMemo.has(k)) merMemo.set(k, api('lp_place', place.insee ? {insee: place.insee} : {id: place.id}).catch(() => null));
        const r = await merMemo.get(k);
        return (r?.patrimoine?.installed ? r.patrimoine.list || [] : []).filter(o => o.base !== 'palissy' && re.test(`${o.deno || ''} ${o.nom || ''}`))
            .map(o => ({r: {via: 'mer', n: o.nom || o.deno, k: o.deno || '', siecle: o.siecle || '', url: safeUrl(o.url)}, km: 0}));
    }
    const okInsee = s => /^(\d[\dAB]\d{3})$/.test(String(s || '')) ? String(s) : '';
    async function generaliteOf(insee) {
        const DP = ext.droitPouvoir; if (!okInsee(insee) || !DP?.loadAR || !DP?.arOf) return null;
        try { const AR = await DP.loadAR(); const a = DP.arOf(AR, insee); return a?.generalite?.n || null; } catch (_) { return null; }
    }
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll) return '';
        const name = place.name || '';
        if (PT[kind]) {
            const L = await merged(PT[kind][0]); const list = near(L, ll.lat, ll.lon, PT[kind][4], 15); const mer = await merimee(place, PT[kind][5]);
            let traces = [];
            if (kind === 'tramways') { const D = await quiet(load('osm_traces')); traces = D ? nearLines(D.rows, ll.lat, ll.lon, 3, 6).map(x => ({...x, r: {...x.r, via: 'osm'}})) : []; }
            const all = [...mer, ...list]; if (!all.length && !traces.length) return '';
            const dated = list.find(x => x.r.from && x.km < 3);
            const lead = traces.length && !all.length ? T('Une voie ferrée aujourd’hui disparue passait {w} : {n}.', {w: esc(nearTxt(traces[0].km, name)), n: `<b>${esc(traces[0].r.n || T('voie ferrée disparue'))}</b>`})
                : dated ? T('En {y} : {n}, {w}.', {y: esc(String(dated.r.from)), n: `<b>${esc(dated.r.n || word(kind, dated.r.k))}</b>`, w: esc(nearTxt(dated.km, name))})
                    : T('À moins de {r} km : {l}.', {r: String(PT[kind][4]), l: all.slice(0, 3).map(x => `<b>${esc(x.r.n || word(kind, x.r.k))}</b>${x.km ? ` (${esc(kmTxt(x.km))})` : ''}`).join(', ')});
            if (kind === 'tramways') return row('🚋', `${lead} ${srcLink(traces.length && !all.length ? osmUrl(traces[0].r.osm) : srcOf(all[0].r))}`, ptSrc([...all, ...traces]),
                more(`<ul class="hist-ul th-ul">${all.slice(0, 10).map(ptLi('tramways')).join('')}${traces.map(traceLi).join('')}</ul>${hyp(T(NOTE.tramways))}`, all.length + traces.length));
            return pointsHtml(kind, all, lead);
        }
        if (kind === 'trudaine') {
            const D = await quiet(load('trudaine')); const list = D ? near(D.rows, ll.lat, ll.lon, 10, 10) : [];
            const gen = await generaliteOf(place.insee);
            if (!list.length && !gen) return '';
            const here = list.find(x => x.km < 1.5);
            const lead = [gen ? esc(T('En 1789, {c} était dans la généralité de {g}.', {c: name, g: gen})) : '',
                here ? T('Une planche de l’Atlas de Trudaine (1745-1780) nomme {n}.', {n: `<b>${esc(here.r.commune)}</b>`}) : list.length ? T('Des planches de l’Atlas de Trudaine (1745-1780) nomment des lieux proches : {l}.', {l: list.slice(0, 2).map(x => `<b>${esc(x.r.commune)}</b> (${esc(kmTxt(x.km))})`).join(', ')}) : esc(T('L’Atlas de Trudaine (1745-1780) dessine les routes de chaque généralité : à chercher dans la base des Archives nationales.'))].filter(Boolean).join(' ');
            return trudaineHtml(list, lead, gen);
        }
        if (kind === 'bastides') {
            const D = await quiet(load('bastides')); if (!D) return ''; const list = near(D.rows, ll.lat, ll.lon, 15, 12); if (!list.length) return '';
            const x = list[0];
            return bastidesHtml(list, x.km < 2 ? bastideTxt(x.r) : T('Près d’ici, {b} ({k}).', {b: bastideTxt(x.r).replace(/\.$/, ''), k: esc(kmTxt(x.km))}), D.meta);
        }
        if (CR[kind]) {
            const C = await craftRows(kind);
            const texts = near(C.texts, ll.lat, ll.lon, 15, 20).filter((x, i, a) => a.findIndex(y => y.r.quote === x.r.quote) === i), ateliers = near(C.ateliers, ll.lat, ll.lon, 15, 10);
            if (!texts.length && !ateliers.length) return '';
            return craftHtml(kind, C, texts, ateliers, craftLead(kind, texts, ateliers, name, '', null));
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel th-panel"><h3>${esc(T('🧺 Places, métiers et rivages'))}</h3><div class="hist-life th-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'th_place', host: '[data-th-host]', icon: '🧺', label: 'Places, métiers et rivages', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-th])'); if (!village) return;
        village.dataset.th = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-tf-host]') || village.querySelector('[data-td-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="th-place" data-th-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-th-host]'), villagePlace(village));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = PLACE_KINDS.map(k => { const p = PARTS.find(x => x[0] === k); const [icon, ...rest] = p[1].split(' '); return [k, `th_${k}`, icon, rest.join(' '), ['trudaine', 'bastides'].includes(k) ? 'Le monde' : 'Le lieu']; });
    const SRC_TXT = {kiosques: 'Wikidata (CC0) ; OpenStreetMap (ODbL) ; Mérimée', marianne: 'Wikidata (CC0)', halles: 'Wikidata (CC0) ; OpenStreetMap (ODbL) ; Mérimée', funiculaires: 'Wikidata (CC0)',
        eclusieres: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', tramways: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', trudaine: 'Wikimedia Commons (domaine public) ; Atlas d’Ancien Régime (CC BY 4.0)',
        bastides: 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', fours: 'Wikidata (CC0) ; OpenStreetMap (ODbL) — lot « Village et nature »'};
    const srcTxt = k => SRC_TXT[k] || 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)';
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, group]) => ({
        id, icon, label, group, defaultOn: true, enabled: () => on(kind), source: srcTxt(kind),
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life th-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const L = (id, pack, icon, label, group, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), group, source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); }, ...extra});
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    const geo = r => (num(r.lat) !== null ? [r.lat, r.lon] : null);
    const ptList = (kind, label, url) => L(`th_${kind}`, `th-${kind}`, PT[kind][1], label, 'Le lieu', srcTxt(kind), url, kind,
        async () => (await merged(kind)).map(r => ({name: r.n || word(kind, r.k), kind: word(kind, r.k), from: r.from, to: r.to, commune: r.commune || '', mh: r.mh ? T('oui') : '', base: r.via === 'osm' ? 'OpenStreetMap' : 'Wikidata', lat: r.lat, lon: r.lon, src: srcOf(r)})),
        [F('name', 'Nom'), F('kind', 'Sorte', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’en', 'year'), F('commune', 'Commune', 'place'), F('mh', 'Monument historique', 'enum'), F('base', 'Base', 'enum'), F('src', 'Source', 'url')],
        {period: r => [r.from, r.to], geo, ...(FILES[`osm_${kind}`] ? {packs: [`th-${kind}`, `th-osm-${kind}`]} : {})});
    (ext.dataLists = ext.dataLists || []).push(
        ptList('kiosques', 'Kiosques à musique et sociétés de musique', 'https://www.wikidata.org/wiki/Q3126170'),
        ptList('marianne', 'Monuments à la République et bustes de Marianne', 'https://www.wikidata.org/wiki/Q325956'),
        ptList('halles', 'Halles et marchés couverts', 'https://www.wikidata.org/wiki/Q2080521'),
        ptList('funiculaires', 'Funiculaires et ponts transbordeurs', 'https://www.wikidata.org/wiki/Q142031'),
        ptList('eclusieres', 'Maisons éclusières et gares d’eau', 'https://www.wikidata.org/wiki/Q27685913'),
        ptList('tramways', 'Tramways et petits trains disparus (fermés avant 1975)', 'https://www.wikidata.org/wiki/Q32680449'),
        L('th_traces', 'th-osm-traces', '🛤', 'Tracés de voies ferrées disparues (OpenStreetMap)', 'Le lieu', 'OpenStreetMap (ODbL)', 'https://www.openstreetmap.org/copyright', 'tramways',
            async () => (await rowsOf('osm_traces')).rows.map(r => ({name: r.n || T('voie ferrée disparue'), state: T(r.k === 'razed' ? 'rasée' : r.k === 'disused' ? 'désaffectée' : 'abandonnée'), from: r.from, to: r.to, km: r.km, line: r.line, src: osmUrl(r.osm)})),
            [F('name', 'Nom'), F('state', 'État', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’en', 'year'), F('km', 'Longueur (km)', 'number'), F('src', 'Source', 'url')],
            {period: r => [r.from, r.to], geoShape: r => (Array.isArray(r.line) && r.line.length >= 4 ? {type: 'line', pts: Array.from({length: r.line.length / 2}, (_, i) => [r.line[2 * i], r.line[2 * i + 1]])} : null)}),
        L('th_bastides', 'th-bastides', '🏰', 'Bastides du Sud-Ouest (fondation, fondateur)', 'Le monde', 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', 'https://fr.wikipedia.org/wiki/Liste_de_bastides', 'bastides',
            async () => (await rowsOf('bastides')).rows.map(r => ({commune: r.wp, year: r.y, by: r.by, dep: r.dep, lat: r.lat, lon: r.lon, src: wp(r.wp)})),
            [F('commune', 'Commune', 'place'), F('year', 'Fondée en', 'year'), F('by', 'Fondateur', 'enum'), F('dep', 'Département', 'enum'), F('src', 'Source', 'url')], {period: r => [r.year, r.year], geo}),
        L('th_trudaine', 'th-trudaine', '🗺', 'Atlas de Trudaine : planches sur Wikimedia Commons', 'Le monde', 'Wikimedia Commons (domaine public)', COMMONS_CAT, 'trudaine',
            async () => (await rowsOf('trudaine')).rows.map(r => ({file: r.file, commune: r.commune, lic: r.lic, lat: r.lat, lon: r.lon, src: commonsFile(r.file)})),
            [F('file', 'Planche'), F('commune', 'Commune nommée', 'place'), F('lic', 'Licence', 'enum'), F('src', 'Source', 'url')], {period: () => [1745, 1780], geo}),
        L('th_ateliers', 'th-ateliers', '🏭', 'Coutelleries, ganteries, vanneries, chocolateries, conserveries…', 'Le lieu', 'Wikidata (CC0)', 'https://www.wikidata.org', 'coutellerie',
            async () => (await rowsOf('ateliers')).rows.map(r => ({name: r.n, kind: T(AT_WORD[r.k] || r.k), from: r.from, to: r.to, commune: r.commune, lat: r.lat, lon: r.lon, src: wd(r.q)})),
            [F('name', 'Nom'), F('kind', 'Sorte', 'enum'), F('from', 'Fondée en', 'year'), F('to', 'Fermée en', 'year'), F('commune', 'Commune', 'place'), F('src', 'Source', 'url')], {period: r => [r.from, r.to], geo}),
        L('th_textes', 'th-textes', '📖', 'Métiers et pays dans Wikipédia : couteliers, gantiers, vanniers, terre-neuvas, goémoniers, teinturiers…', 'Le lieu', 'Wikipédia (CC BY-SA 4.0)', 'https://fr.wikipedia.org', 'coutellerie',
            async () => { const D = await rowsOf('textes'); return D.rows.map(r => ({theme: T((PARTS.find(p => p[0] === r.k) || [, r.k])[1]), commune: r.commune, year: r.y, quote: r.quote, article: r.title, lat: r.lat, lon: r.lon, src: wp(r.title)})); },
            [F('theme', 'Sujet', 'enum'), F('commune', 'Commune', 'place'), F('year', 'Année citée', 'year'), F('quote', 'La phrase de Wikipédia'), F('article', 'Article'), F('src', 'Source', 'url')], {geo}));

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, label2 = r => r.n) => ({id, icon, label: T(label), group: 'Le lieu', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 2000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || num(r.to) === null || r.to >= from) && (!to || num(r.from) === null || r.from <= to) && (!q || fold(label2(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: label2(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        ...['kiosques', 'marianne', 'halles', 'funiculaires', 'eclusieres', 'tramways'].map(k => layer(`th_${k}`, PT[k][1], PARTS.find(p => p[0] === k)[1].replace(/^\S+ /, ''), () => merged(k), srcTxt(k), r => r.n || word(k, r.k))),
        layer('th_bastides', '🏰', 'Bastides du Sud-Ouest', async () => (await rowsOf('bastides')).rows.map(r => ({...r, from: r.y, to: null})), srcTxt('bastides'), r => `${r.wp}${r.y ? ` (${r.y})` : ''}`),
        layer('th_trudaine', '🗺', 'Atlas de Trudaine (planches)', async () => (await rowsOf('trudaine')).rows.map(r => ({...r, from: 1745, to: 1780})), srcTxt('trudaine'), r => r.commune),
        layer('th_metiers', '🏭', 'Métiers du pays (Wikipédia, Wikidata)', async () => [...(await rowsOf('textes')).rows.map(r => ({...r, n: `${r.commune} — ${r.title}`})), ...(await rowsOf('ateliers')).rows], 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)'),
        {id: 'th_traces', icon: '🛤', label: T('Voies ferrées disparues (tracés)'), group: 'Le lieu', kind: 'lines', source: 'OpenStreetMap (ODbL)',
            run: async ({q, bbox, max = 3000}) => { const rows = (await rowsOf('osm_traces')).rows; const features = [];
                for (const r of rows) { const b = r.bbox || (r.bbox = bboxOf(r.line || [])); if (!b || (bbox && (b[2] < bbox[0] || b[0] > bbox[2] || b[3] < bbox[1] || b[1] > bbox[3])) || (q && !fold(r.n).includes(fold(q)))) continue;
                    features.push({type: 'line', pts: Array.from({length: r.line.length / 2}, (_, i) => [r.line[2 * i], r.line[2 * i + 1]]), label: r.n || T('voie ferrée disparue')}); if (features.length >= max) break; }
                return {features, source: 'OpenStreetMap (ODbL)'}; }});

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: okInsee(pl.insee || pl.admin4_code), lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
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
        host.innerHTML = html ? `<div class="hist-life th-life">${html}</div>` : '';
        return !!html;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'thp_place', icon: '🎺', label: T('Kiosque, halle, four et monument de son village'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['kiosques', 'marianne', 'halles', 'fours'], ctx, host, 'Rien de connu près de ses lieux.')},
        {id: 'thp_transports', icon: '🚋', label: T('Tramways, funiculaires et écluses près de chez lui'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['tramways', 'funiculaires', 'eclusieres'], ctx, host, 'Rien de connu près de ses lieux.')},
        {id: 'thp_anciens', icon: '🏰', label: T('Bastide et Atlas de Trudaine de son village'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(['bastides', 'trudaine'], ctx, host, 'Rien de connu pour ses lieux.')},
        {id: 'thp_metiers', icon: '🧺', label: T('Les métiers du pays (couteliers, gantiers, terre-neuvas, goémoniers…)'), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (ctx, host) => runPerson(Object.keys(CR), ctx, host, 'Rien de connu près de ses lieux.')},
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── ⚙️ Réglages → 🧺 Places, métiers et rivages ─────────── */
    const FILE_LABEL = [['kiosques', '🎺 Kiosques (Wikidata)'], ['osm_kiosques', '🎺 Kiosques (OpenStreetMap)'], ['marianne', '🗽 Monuments à la République'], ['halles', '🏪 Halles (Wikidata)'], ['osm_halles', '🏪 Halles (OpenStreetMap)'],
        ['tb_wd', '🍞 Fours à pain (lot B, Wikidata)'], ['tb_osm', '🍞 Fours à pain (lot B, OpenStreetMap)'], ['funiculaires', '🚡 Funiculaires et transbordeurs'], ['eclusieres', '🛶 Maisons éclusières (Wikidata)'],
        ['osm_eclusieres', '🛶 Maisons éclusières (OpenStreetMap)'], ['tramways', '🚋 Tramways disparus'], ['osm_traces', '🛤 Tracés disparus (OpenStreetMap)'], ['trudaine', '🗺 Atlas de Trudaine'],
        ['bastides', '🏰 Bastides'], ['ateliers', '🏭 Ateliers (Wikidata)'], ['textes', '📖 Métiers et pays (Wikipédia)']];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-th-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(k.startsWith('osm_') ? T('À fabriquer sur GitHub (Actions → « Places, métiers et rivages (lot H) », quoi = osm) ; arrive ensuite par Réglages → 🗂 Données.') : T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source || m.title)}<br><small class="muted">${esc(m.what || m.title || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings th-settings" data-th-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Places, métiers et rivages'), icon: '🧺', where: T('Réglages · Données'), help: esc(T('Kiosques, monuments à la République, halles, fours, funiculaires, écluses, petits trains, Atlas de Trudaine, bastides, et les métiers du pays : couteliers, gantiers, vanniers, sardinières, terre-neuvas, goémoniers, teinturiers.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🧺 Places, métiers et rivages »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes, les points et les tracés dans Cartes.'))}</p><div class="th-toggles">${PARTS.map(tg).join('')}</div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Seuls les liens « ↗ » ouvrent une page, quand on clique.'))}</p>
                <p class="muted">${esc(T('Déjà dans l’app et réutilisé : les fours à pain du lot « Village et nature », les notices Mérimée du pack « Patrimoine » (halles, kiosques), la généralité de l’Atlas d’Ancien Régime (lot « Droit et pouvoir »).'))}</p>
                <p class="muted">${esc(T('Liens seulement : l’Atlas de Trudaine aux Archives nationales (Archim), l’inventaire e-monumen, les zones conchylicoles d’Ifremer (data.gouv.fr).'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-th-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.thTg, was = s[k];
        if (!PARTS.some(p => p[0] === k)) return;
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🧺'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_f'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_f'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🧺 Places, métiers et rivages']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechH = {...core, load, settings, personInto, placeInto, placePart, lifeOf, merged,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
