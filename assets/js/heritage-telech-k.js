/**
 * LCNDA — 🌍 Le monde à côté (lot K « téléchargements ») : le patrimoine protégé du monde, les musées et leurs collections ouvertes,
 *   et quelques séries du monde (cerisiers de Kyoto, langues, prénoms garçon ici et fille ailleurs).
 * Livré avec l'app (assets/data/tk-*.json.gz, refaits par scripts/telech-k/*.py et .github/workflows/telech-k.yml) :
 *   🏛 tk-patrimoine_monde   le patrimoine mondial de l'UNESCO (Wikidata CC0 ; lien vers la fiche UNESCO, rien n'en est copié)
 *   🏛 tk-patrimoine_<pays>  les biens protégés d'un pays d'Europe, du Canada, des États-Unis (Wikidata CC0, avec l'identifiant du
 *                            registre officiel → lien vers sa fiche) — un pack par pays, fabriqué sur GitHub, dans Réglages → 🗂 Données
 *   🖼 tk-musees_<continent> l'annuaire des musées (Wikidata CC0) — un pack par continent, fabriqué sur GitHub
 *   🖼 tk-collections        un petit index des œuvres du domaine public du Metropolitan Museum (CC0) sur la vie des gens
 *   🗣 tk-langues            les langues du monde (Glottolog, CC BY 4.0)
 *   🌸 tk-cerisiers          les cerisiers de Kyoto en fleur depuis 812 (Aono et al., NOAA/NCEI, libre à citer)
 *   👶 tk-prenoms            les prénoms d'homme ici et de femme ailleurs (WGND 2.0, CC0)
 *   🌌 tk-ciel, 🌾 tk-secheresses : PROLONGENT le lot E (heritage-telech-e.js lit te-ciel + tk-ciel, te-secheresses + tk-secheresses)
 * La liste réunie « 🏛 Patrimoine du monde » (thème monuments) : Mérimée (France, rang 1), le Répertoire du Québec (l10t_quebec,
 *   rang 1) et Wikidata (rang 2) ; un même bien = même identifiant de registre (Mérimée P380, RPCQ P633, NHLE P1216…) ou même Q….
 * Rien ne part sur Internet : tout est lu sur l'ordinateur, seulement pour une personne décédée (ou née il y a plus de 110 ans) et non
 *   confidentielle. Seuls les liens « ↗ » ouvrent une page, sur un clic ; « 🔍 Chercher ce lieu dans les collections en ligne » donne des
 *   liens (le nom du lieu part seulement quand on clique) et n'existe pas en consultation (kiosque) ni pour un invité du réseau local.
 *   Aucune image n'est chargée toute seule.
 * localStorage : « genealogie-telech-k » (sujets, km = rayon du patrimoine, kmm = rayon des musées).
 *   window.LCNDA_EXT.telechK = {core…, load, packs, personInto, placeInto, placePart, settings, openSettings}
 * Essai : tests/test-telech-k.js
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
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? Math.min(b + 85, NOW) : ys.length ? Math.max(...ys) : null)};
    }
    const DEATH = ['DEAT', 'BURI', 'CREM'];
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => DEATH.includes(String(e.tag || '').toUpperCase()));
    /** une vie du passé : décédée ou née il y a plus de 110 ans */
    const past = life => isDead(life) || (num(life?.person?.birth) !== null && life.person.birth < NOW - 110);
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase(), country: e.country || ''}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    /** une adresse venue d'un fichier : seulement http(s), sinon rien */
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const isQ = q => /^Q\d+$/.test(String(q || ''));

    /* ── 🏛 le patrimoine ── */
    /** un pack tk-patrimoine_* → lignes {q, n, lat, lon, h (protection), y, pl (commune), reg, cy, key} */
    function patRows(f) {
        const H = Object.fromEntries((f?.designations || []).map(([q, l]) => [q, l])), D = (f?.designations || []).map(d => d[1]);
        return table(f).map(r => ({q: r.q, n: r.n, lat: r.lat, lon: r.lon, h: D[r.h] ?? H[r.h] ?? '', hq: (f.designations[r.h] || [])[0] || '', y: r.y, pl: r.pl >= 0 ? (f.places || [])[r.pl] || '' : '',
            reg: r.reg || '', cy: r.cy !== undefined && r.cy !== null && r.cy >= 0 ? (f.countries || [])[r.cy] || '' : f?.country_label && f.country !== 'monde' ? f.country_label : '', pack: f?.country || '', key: patKey(r)}));
    }
    /** la clé qui réunit un même bien : l'identifiant du registre officiel (« P1216:1234567 »), sinon le Q de Wikidata */
    const patKey = r => (/^P\d+:[^\s"<>]{1,60}$/.test(String(r?.reg || '')) ? r.reg : isQ(r?.q) ? r.q : '');
    /** l'adresse de la fiche officielle : le « formatter URL » de la propriété (lu sur Wikidata), http(s) seulement */
    function regUrl(reg, registers) {
        const m = /^(P\d+):(.{1,60})$/.exec(String(reg || '')); if (!m) return '';
        const f = (registers || {})[m[1]]; if (!f || !/\$1/.test(f[1] || '')) return '';
        return safeUrl(f[1].replace('$1', encodeURIComponent(m[2]).replace(/%2F/g, '/')));
    }
    const regName = (reg, registers) => { const m = /^(P\d+):/.exec(String(reg || '')); return m ? ((registers || {})[m[1]] || [])[0] || '' : ''; };
    /** les biens protégés près de ses lieux (un par bien, le lieu le plus proche) */
    function heritageNear(rows, life, radius, max = 40) {
        const out = new Map();
        for (const e of placedEvents(life)) for (const x of near(rows, e.lat, e.lon, radius, 200)) {
            const k = x.r.key || x.r.q, cur = out.get(k); if (!cur || x.km < cur.km) out.set(k, {...x, place: e.name});
        }
        return [...out.values()].sort((a, b) => Number(/Q9259/.test(b.r.hq)) - Number(/Q9259/.test(a.r.hq)) || a.km - b.km).slice(0, max);
    }
    /** pour la liste réunie : une ligne de Mérimée (lp_merimee) et du Répertoire du Québec (l10t_quebec) → la même clé */
    const merimeeKey = ref => (/^[A-Z]{2}\d{8}$/.test(String(ref || '')) ? `P380:${ref}` : '');
    const rpcqKey = url => { const m = /[?&]id=(\d{1,10})(?:&|$)/.exec(String(url || '')); return m ? `P633:${m[1]}` : ''; };

    /* ── 🖼 musées et œuvres ── */
    function museumRows(f) {
        return table(f).map(r => ({q: r.q, n: r.n, lat: r.lat, lon: r.lon, t: (f.kinds || [])[r.t] || '', pl: r.pl >= 0 ? (f.places || [])[r.pl] || '' : '', cy: (f.countries || [])[r.cy] || '', y: r.y, web: safeUrl(r.web), pack: f.continent || ''}));
    }
    function workRows(f) {
        return table(f).map(r => ({id: r.id, t: r.t, y0: r.y0, y1: r.y1, pl: r.pl || '', cu: (f.cultures || [])[r.cu] || '', k: (f.kinds || [])[r.k] || '', s: (r.s || []).map(i => (f.subjects || [])[i]).filter(Boolean)}));
    }
    const workUrl = (r, meta) => (Number.isInteger(r?.id) && r.id > 0 ? safeUrl(String(meta?.object_url || 'https://www.metmuseum.org/art/collection/search/{id}').replace('{id}', String(r.id))) : '');
    /** les métiers de la fiche → les mots anglais des titres du Met (« Blacksmith », « Washerwoman »…) */
    const TRADES = [[/forgeron|marechal ferrant|serrurier/, ['blacksmith', 'smith', 'forge', 'farrier']], [/tisserand|tisseur|tisseuse/, ['weaver', 'weaving', 'loom']], [/fileuse|fileur/, ['spinner', 'spinning']],
        [/blanchisseu|lavandiere|laveuse/, ['laundress', 'washerwoman', 'washing']], [/meunier/, ['miller', 'mill']], [/cordonnier|savetier|sabotier/, ['shoemaker', 'cobbler']],
        [/boulanger/, ['baker', 'bakery', 'bread']], [/pecheur|marin pecheur/, ['fisherman', 'fishermen', 'fishing']], [/marin|matelot|navigateur/, ['sailor', 'sailors', 'seaman']],
        [/berger|bergere|patre/, ['shepherd', 'shepherdess']], [/cultivateur|laboureur|agriculteur|paysan|fermier|metayer|journalier|menager/, ['farmer', 'peasant', 'plough', 'harvest', 'reaper']],
        [/vigneron/, ['vintage', 'grape harvest', 'vineyard']], [/charpentier|menuisier|ebeniste/, ['carpenter', 'joiner', 'cabinetmaker']], [/macon|tailleur de pierre/, ['mason', 'stonecutter', 'bricklayer']],
        [/tailleur|couturiere|lingere|modiste/, ['tailor', 'seamstress', 'milliner', 'sewing']], [/domestique|servante|cuisiniere/, ['servant', 'maid', 'cook']], [/cocher|voiturier|charretier/, ['coachman', 'carter', 'cart']],
        [/soldat|militaire|fusilier|grenadier|cavalier|sergent|caporal/, ['soldier', 'soldiers']], [/sage femme|accoucheuse/, ['midwife']], [/instituteur|institutrice|maitre d ecole/, ['schoolmaster', 'teacher', 'school']],
        [/cure|pretre|vicaire|abbe/, ['priest', 'curate']], [/marchand|negociant|commercant|epicier/, ['merchant', 'shop', 'grocer']], [/tonnelier/, ['cooper']], [/potier/, ['potter']],
        [/horloger/, ['clockmaker', 'watchmaker']], [/imprimeur|typographe/, ['printer', 'printing press']], [/mineur/, ['miner', 'mine']], [/bucheron|scieur de long/, ['woodcutter', 'sawyer']],
        [/boucher/, ['butcher']], [/aubergiste|cabaretier|cafetier/, ['inn', 'tavern', 'innkeeper']], [/nourrice/, ['wet nurse', 'nurse']], [/colporteur/, ['peddler', 'pedlar']],
        [/ramoneur/, ['chimney sweep']], [/vannier/, ['basket maker', 'basketmaker']], [/chapelier/, ['hatter']], [/brodeuse|dentelliere/, ['lacemaker', 'embroiderer']]];
    const jobText = life => fold((life?.jobs || []).map(j => j.text).join(' ; '));
    function tradeWords(life) { const t = jobText(life); return TRADES.filter(([re]) => re.test(t)).flatMap(([, w]) => w); }
    const wordRe = words => new RegExp(`\\b(${words.map(w => fold(w).replace(/[^a-z0-9 ]/g, '')).join('|')})s?\\b`);
    /** les œuvres dont le titre dit son métier, faites pendant sa vie (± 30 ans) */
    function worksForTrade(rows, life) {
        const words = tradeWords(life); if (!words.length) return [];
        const s = lifeSpan(life), re = wordRe(words), a = (s.from ?? 1500) - 30, b = (s.to ?? 1950) + 30;
        return rows.filter(r => r.y1 >= a && r.y0 <= b && re.test(fold(r.t))).sort((p, q) => Math.abs((p.y0 + p.y1) / 2 - ((s.from ?? 0) + (s.to ?? 0)) / 2) - Math.abs((q.y0 + q.y1) / 2 - ((s.from ?? 0) + (s.to ?? 0)) / 2));
    }
    /** les œuvres dont le titre ou le lieu nomme un lieu (mot entier, au moins 4 lettres) */
    function worksForPlace(rows, name, from = 1500, to = 1950) {
        const k = fold(String(name || '').split(/[,(]/)[0]); if (k.length < 4) return [];
        const re = new RegExp(`\\b${k.replace(/ /g, '\\s')}\\b`);
        return rows.filter(r => r.y1 >= from && r.y0 <= to && (re.test(fold(r.t)) || re.test(fold(r.pl))));
    }

    /* ── 🗣 langues ── */
    function langRows(f) { return table(f).map(r => ({g: r.g, n: r.n, lat: r.lat, lon: r.lon, f: (f.families || [])[r.f] || '', iso: r.iso || '', area: r.area || '', cc: r.cc || '', y1: r.y1, x: r.x === 1})); }
    const glottoUrl = g => (/^[a-z]{4}\d{4}$/.test(String(g || '')) ? `https://glottolog.org/resource/languoid/id/${g}` : '');

    /* ── 🌸 cerisiers de Kyoto ── */
    function cherry(rows, y) {
        const r = rows.find(x => x.y === y); if (!r) return null;
        const ref = rows.filter(x => x.y >= y - 50 && x.y <= y + 50 && x.doy), mean = ref.reduce((a, x) => a + x.doy, 0) / ref.length;
        return {...r, mean: Math.round(mean), diff: Math.round(r.doy - mean), n: ref.length};
    }
    /* ── 👶 prénoms ── */
    function nameGender(rows, first) {
        const k = fold(String(first || '').split(/[\s,-]+/)[0]); if (k.length < 2) return null;
        const r = rows.find(x => x.n === k); return r ? {n: r.n, m: String(r.m || '').split(' ').filter(Boolean), f: String(r.f || '').split(' ').filter(Boolean)} : null;
    }
    const core = {num, fold, table, km, lifeSpan, isDead, past, placedEvents, near, safeUrl, patRows, patKey, regUrl, regName, heritageNear, merimeeKey, rpcqKey,
        museumRows, workRows, workUrl, tradeWords, worksForTrade, worksForPlace, langRows, glottoUrl, cherry, nameGender};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const KEY = 'genealogie-telech-k';
    const TAB = ['telech_k', '25tk', '🌍 Le monde à côté'];
    const BLOCK = 'telech_k';
    const PARTS = [
        ['patrimoine', '🏛 Le patrimoine protégé près de chez lui', 'Les monuments et sites protégés du monde (patrimoine mondial, registres d’Europe et d’Amérique du Nord) près de ses lieux.'],
        ['musees', '🖼 Les musées du monde', 'Le musée le plus proche de ses lieux, et l’annuaire des musées du monde dans les Listes.'],
        ['collections', '🎨 Les œuvres qui montrent sa vie', 'Des œuvres du domaine public sur son métier et ses lieux (index du Metropolitan Museum), et des liens pour chercher dans les autres collections ouvertes.'],
        ['langues', '🗣 Les langues autour', 'Les langues du monde dont le point (Glottolog) est près de ses lieux, hors de France.'],
        ['cerisiers', '🌸 Les cerisiers de Kyoto', 'Le jour où les cerisiers de Kyoto fleurirent l’année de sa naissance, d’après les chroniques depuis 812.'],
        ['prenoms', '👶 Son prénom ailleurs', 'Quand son prénom est d’homme dans un pays et de femme dans un autre (Andrea, Simone, Nicola…).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), km: 5, kmm: 25, ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const radius = () => { const k = Number(settings().km); return k >= 1 && k <= 50 ? k : 5; };
    const radiusM = () => { const k = Number(settings().kmm); return k >= 1 && k <= 100 ? k : 25; };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const kmA = k => T('{n} km', {n: String(Math.max(1, Math.round(k)))}); // dans « à {k} de… » : jamais « à sur place »
    const link = (url, label) => { const u = safeUrl(url); return u ? `${window.LCNDA_UI.extLink(u, label)}` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tkx-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tkx-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tkx-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (isQ(q) ? `https://www.wikidata.org/wiki/${q}` : '');
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr', CCBY = 'https://creativecommons.org/licenses/by/4.0/deed.fr';
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (${link(CC0, 'CC0')})`,
        met: () => `${link('https://github.com/metmuseum/openaccess', 'The Metropolitan Museum of Art, Open Access')} (${link(CC0, 'CC0')})`,
        glotto: () => `${link('https://glottolog.org', 'Glottolog')} (${link(CCBY, 'CC BY 4.0')})`,
        kyoto: () => `${link('https://www.ncei.noaa.gov/access/paleo-search/study/26430', 'Aono et al., NOAA/NCEI')} (${esc(T('libre, à citer'))})`,
        wgnd: () => `${link('https://doi.org/10.7910/DVN/MSEGSJ', 'WGND 2.0, Harvard Dataverse')} (${link(CC0, 'CC0')})`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {monde: 'tk-patrimoine_monde', collections: 'tk-collections', langues: 'tk-langues', cerisiers: 'tk-cerisiers', prenoms: 'tk-prenoms'};
    const SHAPE = {monde: patRows, collections: workRows, langues: langRows};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const okPack = n => /^tk-[a-z]+(_[a-z]{2,5})?$/.test(n);
    function loadFile(name, shape) {
        if (!okPack(name)) return Promise.resolve(null);
        if (!data[name]) data[name] = fetch(`assets/data/${name}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: name})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: (shape || table)(f)} : null))
            .catch(e => { delete data[name]; throw e; });
        return data[name];
    }
    const load = kind => (FILES[kind] ? loadFile(FILES[kind], SHAPE[kind]) : Promise.resolve(null));
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    /** les packs par pays et par continent : ceux que le sommaire des données connaît (livrés), et ceux installés à la demande
     *  (📦 grands packs, app-grands-packs.js : servis à la même adresse assets/data/… par le routeur) */
    let packsMemo = null;
    const packs = () => (packsMemo ||= Promise.all([fetch(`assets/data/manifest.json?v=${DATA_V}`, {credentials: 'same-origin'}).then(r => (r.ok ? r.json() : {packs: {}})).catch(() => ({packs: {}})),
        Promise.resolve(ext.grandsPacks?.installed?.(/^tk-/) || []).catch(() => [])])
        .then(([m, inst]) => { const shipped = Object.keys(m?.packs || {}), ids = [...new Set([...shipped, ...inst])];
            return {pat: ids.filter(i => /^tk-patrimoine_[a-z]{2,5}$/.test(i) && i !== FILES.monde).sort(), mus: ids.filter(i => /^tk-musees_[a-z]{2}$/.test(i)).sort(), man: m, installed: inst.filter(i => !shipped.includes(i))}; }));
    // 📦 un pack installé, retiré ou ↶ : relire la liste des packs et oublier ce qui était gardé
    root.addEventListener?.('lcnda:installs-changed', () => { packsMemo = null; heritageMemo = null; museumMemo = null; for (const k of Object.keys(atMemo)) delete atMemo[k];
        for (const k of Object.keys(data)) if (/^tk-(patrimoine_(?!monde$)|musees_)/.test(k)) delete data[k]; });
    let heritageMemo = null, museumMemo = null;
    /** tous les biens protégés installés (patrimoine mondial + les pays), un par clé */
    const mergeHeritage = ([W, ...list]) => {
        const all = [W, ...list].filter(Boolean), seen = new Map(), regs = {};
        for (const D of all) { Object.assign(regs, D.meta.registers || {}); for (const r of D.rows) { const k = r.key || r.q; const cur = seen.get(k); if (!cur || (cur.pack === 'monde' && r.pack !== 'monde')) seen.set(k, cur ? {...r, hq: cur.hq || r.hq, h: cur.pack === 'monde' && r.pack !== 'monde' ? `${r.h} · ${cur.h}` : r.h} : r); } }
        return {rows: [...seen.values()], registers: regs, files: all.map(D => D.meta)};
    };
    const heritage = () => (heritageMemo ||= Promise.all([quiet(load('monde')), packs().then(P => Promise.all(P.pat.map(n => quiet(loadFile(n, patRows)))))]).then(([W, list]) => mergeHeritage([W, ...list])));
    /** près de quelques points seulement (la fiche d'une personne, d'un lieu) : le pack du monde + les pays dont le cadre touche ces points
     *  (500 000 biens pour le seul Royaume-Uni : tout charger pour une fiche de Corrèze remplissait la mémoire de la page) */
    const PAT_BOX = {ad: [42.4, 42.7, 1.4, 1.8], at: [46.3, 49.1, 9.5, 17.2], be: [49.5, 51.6, 2.5, 6.5], bg: [41.2, 44.3, 22.3, 28.7], ch: [45.8, 47.9, 5.9, 10.6], cz: [48.5, 51.1, 12.1, 18.9],
        de: [47.2, 55.1, 5.8, 15.1], dk: [54.5, 57.8, 8, 15.2], ee: [57.5, 59.7, 21.7, 28.3], es: [27.6, 43.8, -18.2, 4.4], fi: [59.7, 70.1, 20.5, 31.6], gb: [49.8, 60.9, -8.7, 1.8],
        gr: [34.8, 41.8, 19.3, 29.7], hr: [42.3, 46.6, 13.4, 19.5], hu: [45.7, 48.6, 16.1, 22.9], ie: [51.4, 55.4, -10.7, -5.9], is: [63.2, 66.6, -24.6, -13.4], it: [35.4, 47.1, 6.6, 18.6],
        li: [47, 47.3, 9.4, 9.7], lt: [53.9, 56.5, 20.9, 26.9], lu: [49.4, 50.2, 5.7, 6.6], lv: [55.6, 58.1, 20.9, 28.3], mc: [43.7, 43.8, 7.4, 7.5], mt: [35.8, 36.1, 14.1, 14.6],
        nl: [50.7, 53.6, 3.3, 7.3], no: [57.9, 71.2, 4.5, 31.2], pl: [49, 54.9, 14.1, 24.2], pt: [32.6, 42.2, -31.3, -6.1], ro: [43.6, 48.3, 20.2, 29.8], se: [55.3, 69.1, 10.9, 24.2],
        si: [45.4, 46.9, 13.3, 16.7], sk: [47.7, 49.7, 16.8, 22.6]};
    const touches = (id, pts, r) => { const b = PAT_BOX[id.replace(/^tk-patrimoine_/, '')]; if (!b) return true; // un pays sans cadre connu : chargé (comme avant)
        return pts.some(({lat, lon}) => { const dLat = r / 111, dLon = r / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180))); return lat >= b[0] - dLat && lat <= b[1] + dLat && lon >= b[2] - dLon && lon <= b[3] + dLon; }); };
    const heritageAt = (pts, r) => packs().then(P => { const ids = P.pat.filter(id => touches(id, pts, r)); if (ids.length === P.pat.length) return heritage();
        const key = ids.join(','); return (atMemo[key] ||= Promise.all([quiet(load('monde')), ...ids.map(n => quiet(loadFile(n, patRows)))]).then(mergeHeritage)); });
    const atMemo = {};
    const museums = () => (museumMemo ||= packs().then(P => Promise.all(P.mus.map(n => quiet(loadFile(n, museumRows))))).then(list => ({rows: list.filter(Boolean).flatMap(D => D.rows), files: list.filter(Boolean).map(D => D.meta)})));
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const He = P => (P?.gender === 'female' ? T('Elle') : T('Il'));

    /* ─────────── les morceaux ─────────── */
    const heritageLi = (x, regs) => { const r = x.r || x, u = regUrl(r.reg, regs); return `<li>🏛 <b>${link(u || wd(r.q), r.n)}</b> <small class="muted">(${esc([r.h, r.y ? String(r.y) : '', r.pl, r.cy, x.km !== undefined ? kmTxt(x.km) : ''].filter(Boolean).join(' · '))})</small>${u ? ` ${link(u, T('↗ {r}', {r: regName(r.reg, regs) || T('fiche officielle')}))}` : ''} ${srcLink(wd(r.q))}</li>`; };
    const museumLi = x => { const r = x.r || x; return `<li>🖼 <b>${link(r.web || wd(r.q), r.n)}</b> <small class="muted">(${esc([r.t, r.pl, r.cy, r.y ? T('depuis {y}', {y: String(r.y)}) : '', x.km !== undefined ? kmTxt(x.km) : ''].filter(Boolean).join(' · '))})</small> ${srcLink(wd(r.q))}</li>`; };
    const workLi = (r, meta) => `<li>🎨 ${link(workUrl(r, meta), r.t)} <small class="muted">(${esc([r.y0 === r.y1 ? String(r.y0) : `${r.y0}–${r.y1}`, T(r.k), r.pl || r.cu].filter(Boolean).join(' · '))})</small></li>`;
    const COLLECTIONS = [ // chercher EN LIGNE, sur un clic : le nom du lieu part seulement à ce moment-là (jamais en consultation)
        ['Metropolitan Museum (CC0)', 'https://www.metmuseum.org/art/collection/search?showOnly=openAccess&q={q}'],
        ['Smithsonian Open Access (CC0)', 'https://www.si.edu/search/collection-images?edan_q={q}&edan_fq[]=media_usage:CC0'],
        ['Art Institute of Chicago (CC0)', 'https://www.artic.edu/collection?q={q}&is_public_domain=1'],
        ['Cleveland Museum of Art (CC0)', 'https://www.clevelandart.org/art/collection/search?search={q}&open_access=1'],
        ['National Gallery of Art (CC0)', 'https://www.nga.gov/collection-search-result.html?keyword={q}'],
        ['Rijksmuseum (CC0)', 'https://www.rijksmuseum.nl/en/search?q={q}&imgonly=True'],
        ['SMK — Statens Museum for Kunst (CC0)', 'https://open.smk.dk/en/art?q={q}'],
        ['Nationalmuseum Sweden (PD)', 'https://collection.nationalmuseum.se/eMP/eMuseumPlus?service=search&q={q}'],
        ['Paris Musées (CC0)', 'https://www.parismuseescollections.paris.fr/fr/recherche?keys={q}&filters%5Bacces_ouvert%5D=1'],
        ['Musée de Bretagne', 'https://www.collections.musee-bretagne.fr/recherche/?q={q}'],
        ['Wellcome Collection', 'https://wellcomecollection.org/search/works?query={q}&availabilities=online'],
        ['Te Papa (PD)', 'https://collections.tepapa.govt.nz/search/{q}'],
        ['Europeana', 'https://www.europeana.eu/fr/search?query={q}&reusability=open'],
        ['Racinet, « Le costume historique » 1888 (Wikimedia Commons)', 'https://commons.wikimedia.org/w/index.php?search=Racinet+%22costume+historique%22+{q}&ns6=1&ns14=1']];
    const collLinks = name => (kiosk() || !name ? '' : `<details class="tkx-more tkx-online"><summary>${esc(T('🔍 Chercher « {p} » dans les collections ouvertes (en ligne)', {p: name}))}</summary><p class="muted">${esc(T('Chaque lien ouvre le site du musée et y envoie le nom du lieu, seulement quand on clique. Aucune image n’est chargée ici.'))}</p><p class="tkx-links">${COLLECTIONS.map(([l, u]) => link(u.replace('{q}', encodeURIComponent(name)), `↗ ${l}`)).join(' · ')}</p></details>`);

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['patrimoine', 'musees', 'collections', 'langues', 'cerisiers', 'prenoms'];
    const birthOf = life => placedEvents(life).find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.tag)) || placedEvents(life)[0] || null;
    const isFrance = e => /^(france|fr)?$/i.test(String(e?.country || '').trim());
    const JOBS = {
        patrimoine: async life => {
            const pts = placedEvents(life); if (!pts.length) return '';
            const H = await heritageAt(pts, radius()); if (!H.rows.length) return '';
            const list = heritageNear(H.rows, life, radius()); if (!list.length) return '';
            const x = list[0];
            const lead = T('{n}, à {k} de {p} : {h}.', {n: `<b>${link(regUrl(x.r.reg, H.registers) || wd(x.r.q), x.r.n)}</b>`, k: esc(kmA(x.km)), p: esc(x.place), h: esc(x.r.h)});
            return row('🏛', `${lead} ${srcLink(wd(x.r.q))}`, LIC.wd(), more(list.length > 1 ? `<ul class="hist-ul tkx-ul">${list.slice(1).map(y => heritageLi(y, H.registers)).join('')}</ul>${hyp(T('Biens protégés aujourd’hui (Wikidata), à moins de {r} km de ses lieux : protégés souvent bien après sa vie.', {r: String(radius())}))}` : '', list.length - 1));
        },
        musees: async life => {
            const M = await museums(), bp = birthOf(life); if (!M.rows.length || !bp) return '';
            const list = near(M.rows, bp.lat, bp.lon, radiusM(), 12); if (!list.length) return '';
            const x = list[0];
            return row('🖼', `${T('Le musée le plus proche de {p} aujourd’hui : {m} ({k}).', {p: esc(bp.name), m: `<b>${link(x.r.web || wd(x.r.q), x.r.n)}</b>`, k: esc(kmTxt(x.km))})} ${srcLink(wd(x.r.q))}`, LIC.wd(), more(list.length > 1 ? `<ul class="hist-ul tkx-ul">${list.slice(1).map(museumLi).join('')}</ul>` : '', list.length - 1));
        },
        collections: async life => {
            const C = await rowsOf('collections'); if (!C.rows.length) return '';
            const trade = worksForTrade(C.rows, life), s = lifeSpan(life), bp = birthOf(life);
            const placed = bp ? worksForPlace(C.rows, bp.name, (s.from ?? 1500) - 30, (s.to ?? 1950) + 30) : [];
            if (!trade.length && !placed.length) return bp && !isFrance(bp) && !kiosk() ? row('🎨', esc(T('Chercher {p} dans les musées du monde :', {p: bp.name})), '', collLinks(bp.name)) : '';
            const out = [];
            if (trade.length) out.push(row('🎨', `${T('Son métier ({j}) dans les musées : {n} œuvres du domaine public le montrent, par exemple {t}.', {j: esc((life.jobs || [])[0]?.text || ''), n: String(trade.length), t: link(workUrl(trade[0], C.meta), trade[0].t)})} ${srcLink(workUrl(trade[0], C.meta))}`, LIC.met(),
                more(`<ul class="hist-ul tkx-ul">${trade.slice(1, 15).map(r => workLi(r, C.meta)).join('')}</ul>${hyp(T('Trouvé par le titre de l’œuvre (en anglais), de son temps à trente ans près : un métier montré, pas votre ancêtre.'))}`, trade.length - 1)));
            if (placed.length) out.push(row('🎨', `${T('{p} dans les musées : {n} œuvres du domaine public de son temps.', {p: esc(bp.name), n: String(placed.length)})} ${srcLink(workUrl(placed[0], C.meta))}`, LIC.met(),
                `${more(`<ul class="hist-ul tkx-ul">${placed.slice(0, 15).map(r => workLi(r, C.meta)).join('')}</ul>`, placed.length)}${collLinks(bp.name)}`));
            return out.join('');
        },
        langues: async life => {
            const ev = placedEvents(life).filter(e => !isFrance(e)); if (!ev.length) return '';
            const L = await rowsOf('langues'); if (!L.rows.length) return '';
            const e = ev[0], list = near(L.rows.filter(r => !r.x), e.lat, e.lon, 150, 8); if (!list.length) return '';
            const x = list[0];
            return row('🗣', `${T('Autour de {p} : le {l} ({f}), dont le point est à {k}.', {p: esc(e.name), l: `<b>${link(glottoUrl(x.r.g), x.r.n)}</b>`, f: esc(x.r.f || T('langue isolée')), k: esc(kmA(x.km))})} ${srcLink(glottoUrl(x.r.g))}`, LIC.glotto(),
                `${more(list.length > 1 ? `<ul class="hist-ul tkx-ul">${list.slice(1).map(y => `<li>🗣 ${link(glottoUrl(y.r.g), y.r.n)} <small class="muted">(${esc([y.r.f, kmTxt(y.km)].filter(Boolean).join(' · '))})</small></li>`).join('')}</ul>` : '', list.length - 1)}${hyp(T('Le point d’une langue est un point au milieu de là où elle se parle, pas une frontière : une piste, pas une preuve.'))}`);
        },
        cerisiers: async life => {
            const b = lifeSpan(life).birth; if (b === null) return '';
            const K = await rowsOf('cerisiers'), c = cherry(K.rows, b); if (!c || !c.m) return '';
            const when = c.diff <= -5 ? T('en avance de {d} jours sur les années de son siècle', {d: String(-c.diff)}) : c.diff >= 5 ? T('en retard de {d} jours sur les années de son siècle', {d: String(c.diff)}) : T('à la date habituelle de son siècle');
            return row('🌸', `${T('L’année de sa naissance ({y}), les cerisiers de Kyoto fleurirent le {d} : {w}.', {y: String(b), d: `${c.d === 1 ? '1er' : c.d} ${T(MONTHS[c.m - 1])}`, w: esc(when)})} ${srcLink(LINKS.kyoto)}`, LIC.kyoto(), hyp(T('Notée dans les journaux et chroniques de la cour depuis 812 : un printemps tardif au Japon disait souvent un printemps froid ailleurs aussi.')));
        },
        prenoms: async life => {
            const P = await rowsOf('prenoms'), g = nameGender(P.rows, life?.person?.first); if (!g) return '';
            const C = n => T(PAYS[n] || n);
            return row('👶', esc(T('Son prénom ({n}) est un prénom d’homme en {m}, mais de femme en {f}. Dans un relevé ou un arbre venu d’ailleurs, le genre peut s’être trompé.', {n: life.person.first.split(/[\s,-]+/)[0], m: g.m.slice(0, 4).map(C).join(', '), f: g.f.slice(0, 4).map(C).join(', ')})), LIC.wgnd());
        }};
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const PAYS = {AT: 'Autriche', BE: 'Belgique', BG: 'Bulgarie', CA: 'Canada', CH: 'Suisse', CZ: 'Tchéquie', DE: 'Allemagne', DK: 'Danemark', EE: 'Estonie', ES: 'Espagne', FI: 'Finlande', FR: 'France', GB: 'Royaume-Uni',
        GR: 'Grèce', HR: 'Croatie', HU: 'Hongrie', IE: 'Irlande', IS: 'Islande', IT: 'Italie', LT: 'Lituanie', LU: 'Luxembourg', LV: 'Lettonie', MT: 'Malte', NL: 'Pays-Bas', NO: 'Norvège', PL: 'Pologne', PT: 'Portugal',
        RO: 'Roumanie', SE: 'Suède', SI: 'Slovénie', SK: 'Slovaquie', US: 'États-Unis'};
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
        host.innerHTML = out.length ? `<div class="hist-life tkx-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        if (p.living_status === 'living' || Number(p.is_private) === 1) return '';
        return A().card(index, T('🌍 Le monde à côté'), '', `<div class="tkx-block" data-tkx-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tkx-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tkxPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['patrimoine', 'musees', 'collections', 'langues'];
    async function placePart(kind, place) {
        const ll = placeLL(place), name = place?.name || ''; if (!ll) return '';
        if (kind === 'patrimoine') {
            const H = await heritageAt([ll], Math.max(radius(), 10)); const hits = near(H.rows, ll.lat, ll.lon, Math.max(radius(), 10), 60); if (!hits.length) return '';
            const w = hits.find(x => /Q9259/.test(x.r.hq)) || hits[0];
            const lead = hits.length > 1 ? T('{n} biens protégés à moins de {r} km, dont {b} ({k}).', {n: String(hits.length), r: String(Math.max(radius(), 10)), b: `<b>${link(regUrl(w.r.reg, H.registers) || wd(w.r.q), w.r.n)}</b>`, k: esc(kmTxt(w.km))}) : T('Un bien protégé à {k} : {b} ({h}).', {k: esc(kmA(w.km)), b: `<b>${link(regUrl(w.r.reg, H.registers) || wd(w.r.q), w.r.n)}</b>`, h: esc(w.r.h)});
            return row('🏛', `${lead} ${srcLink(wd(w.r.q))}`, LIC.wd(), more(`<ul class="hist-ul tkx-ul">${hits.map(x => heritageLi(x, H.registers)).join('')}</ul>`, hits.length));
        }
        if (kind === 'musees') {
            const M = await museums(); const hits = near(M.rows, ll.lat, ll.lon, radiusM(), 30); if (!hits.length) return '';
            return row('🖼', `${T('{n} musées à moins de {r} km ; le plus proche : {m} ({k}).', {n: String(hits.length), r: String(radiusM()), m: `<b>${link(hits[0].r.web || wd(hits[0].r.q), hits[0].r.n)}</b>`, k: esc(kmTxt(hits[0].km))})} ${srcLink(wd(hits[0].r.q))}`, LIC.wd(), more(`<ul class="hist-ul tkx-ul">${hits.map(museumLi).join('')}</ul>`, hits.length));
        }
        if (kind === 'collections') {
            const C = await rowsOf('collections'), hits = C.rows.length ? worksForPlace(C.rows, name) : [];
            if (!hits.length) return kiosk() || !name ? '' : row('🎨', esc(T('Chercher {p} dans les musées du monde :', {p: name})), '', collLinks(name));
            return row('🎨', `${T('{p} dans les musées : {n} œuvres du domaine public la nomment, par exemple {t}.', {p: esc(name), n: String(hits.length), t: link(workUrl(hits[0], C.meta), hits[0].t)})} ${srcLink(workUrl(hits[0], C.meta))}`, LIC.met(), `${more(`<ul class="hist-ul tkx-ul">${hits.slice(0, 40).map(r => workLi(r, C.meta)).join('')}</ul>`, hits.length)}${collLinks(name)}`);
        }
        if (kind === 'langues') {
            if (isFrance(place) && !place.foreign) return '';
            const L = await rowsOf('langues'); const hits = near(L.rows.filter(r => !r.x), ll.lat, ll.lon, 150, 10); if (!hits.length) return '';
            return row('🗣', `${T('Les langues dont le point est le plus proche : {l}.', {l: hits.slice(0, 3).map(x => `<b>${link(glottoUrl(x.r.g), x.r.n)}</b> (${esc(kmTxt(x.km))})`).join(', ')})} ${srcLink(glottoUrl(hits[0].r.g))}`, LIC.glotto(), hyp(T('Le point d’une langue est un point au milieu de là où elle se parle, pas une frontière : une piste, pas une preuve.')));
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tkx-panel"><h3>${esc(T('🌍 Le monde à côté'))}</h3><div class="hist-life tkx-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null, foreign: !/INSEE/.test(head)};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tkx_place', host: '[data-tkx-host]', icon: '🌍', label: 'Le monde à côté', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tkx])'); if (!village) return;
        village.dataset.tkx = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-tsx-host]') || village.querySelector('[data-ti-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tkx-place" data-tkx-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tkx-host]'), villagePlace(village));
    }
    let pending = 0;
    if (root.document) new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['patrimoine', 'tkx_patrimoine', '🏛', 'Le patrimoine protégé autour (monde)'], ['musees', 'tkx_musees', '🖼', 'Les musées autour'], ['collections', 'tkx_collections', '🎨', 'Le lieu dans les musées (œuvres du domaine public)']];
    const SRC_TXT = {patrimoine: 'Wikidata (CC0)', musees: 'Wikidata (CC0)', collections: 'The Metropolitan Museum of Art, Open Access (CC0)', langues: 'Glottolog (CC BY 4.0)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life tkx-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const F = (key, label, type = 'text', x = {}) => ({key, label: T(label), type, ...x});
    const openSrc = r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); };
    const L = (id, pack, icon, label, theme, source, sourceUrl, kind, load2, fields, x = {}) => ({id, pack, icon, label: T(label), theme, group: x.group || 'Le monde', source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: openSrc, ...x});
    const heritageListRows = async () => { const H = await heritage(); return H.rows.map(r => ({name: r.n, kind: r.h, year: r.y, place: r.pl, country: r.cy, register: regName(r.reg, H.registers), official: regUrl(r.reg, H.registers), lat: r.lat, lon: r.lon, src: wd(r.q), key: r.key, q: r.q})); };
    const museumListRows = async () => (await museums()).rows.map(r => ({name: r.n, kind: r.t, place: r.pl, country: r.cy, year: r.y, web: r.web, lat: r.lat, lon: r.lon, src: wd(r.q)}));
    const workListRows = async () => { const C = await rowsOf('collections'); return C.rows.map(r => ({title: r.t, from: r.y0, to: r.y1, kind: T(r.k), subjects: r.s.map(x => T(x)), place: r.pl, culture: r.cu, museum: 'Met', src: workUrl(r, C.meta)})); };
    (ext.dataLists = ext.dataLists || []).push(
        L('tk_patrimoine', 'tk-patrimoine_monde', '🏛', 'Patrimoine protégé du monde (Wikidata)', 'monuments', 'Wikidata (CC0) ; liens vers les registres officiels', 'https://www.wikidata.org/wiki/Property:P1435', 'patrimoine', heritageListRows,
            [F('name', 'Bien'), F('kind', 'Protection', 'enum'), F('year', 'Année', 'year'), F('place', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('register', 'Registre', 'enum'), F('official', 'Fiche officielle', 'url'), F('src', 'Source (Wikidata)', 'url')],
            {period: r => [r.year, null], geo: r => [r.lat, r.lon], familyColumn: true, heavy: true, open: r => { const u = safeUrl(r.official || r.src); if (u) window.open(u, '_blank', 'noopener'); },
                merge: {into: 'patrimoine_monde', rank: 2, short: 'Wikidata', row: r => ({key: r.key, year: r.year, lat: r.lat, lon: r.lon, name: r.name, kind: r.kind, place: r.place, country: r.country, register: r.register, url: r.official || r.src})}}),
        L('tk_musees', 'tk-collections', '🖼', 'Musées du monde', 'images', 'Wikidata (CC0) ; The Metropolitan Museum of Art, Open Access (CC0)', 'https://www.wikidata.org/wiki/Q33506', 'musees', museumListRows,
            [F('name', 'Musée'), F('kind', 'Sorte', 'enum'), F('place', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('year', 'Depuis', 'year'), F('web', 'Site', 'url'), F('src', 'Source (Wikidata)', 'url')],
            {period: r => [r.year, null], geo: r => [r.lat, r.lon], familyColumn: true, defaultView: () => 'musees', open: r => { const u = safeUrl(r.web || r.src); if (u) window.open(u, '_blank', 'noopener'); },
                views: [{id: 'musees', label: 'Musées'}, {id: 'oeuvres', label: 'Œuvres du domaine public', load: workListRows, open: openSrc, period: r => [r.from, r.to],
                    fields: [F('title', 'Œuvre'), F('from', 'De', 'year'), F('to', 'À', 'year'), F('kind', 'Sorte', 'enum'), F('subjects', 'Sujets', 'enum'), F('place', 'Lieu'), F('culture', 'Culture', 'enum'), F('museum', 'Musée', 'enum'), F('src', 'Fiche du musée', 'url')]}]}),
        L('tk_langues', 'tk-langues', '🗣', 'Langues du monde (Glottolog)', 'livres', 'Glottolog (CC BY 4.0)', 'https://glottolog.org', 'langues',
            async () => (await rowsOf('langues')).rows.map(r => ({name: r.n, family: r.f, iso: r.iso, area: r.area, countries: r.cc.split(' ').filter(Boolean), first: r.y1, state: r.x ? T('langue éteinte') : '', lat: r.lat, lon: r.lon, src: glottoUrl(r.g)})),
            [F('name', 'Langue'), F('family', 'Famille', 'enum'), F('iso', 'Code ISO 639-3'), F('area', 'Grande région', 'enum'), F('countries', 'Pays (codes)', 'enum'), F('first', 'Écrite dès', 'year'), F('state', 'État', 'enum'), F('src', 'Glottolog', 'url')],
            {geo: r => [r.lat, r.lon]}),
        L('tk_cerisiers', 'tk-cerisiers', '🌸', 'Cerisiers de Kyoto en fleur, depuis 812', 'ciel', 'Aono et al., NOAA/NCEI (libre, à citer)', 'https://www.ncei.noaa.gov/access/paleo-search/study/26430', 'cerisiers',
            async () => (await rowsOf('cerisiers')).rows.filter(r => r.m).map(r => ({year: r.y, date: `${r.d === 1 ? '1er' : r.d} ${T(MONTHS[r.m - 1])}`, doy: r.doy, ref: r.ref, src: 'https://www.ncei.noaa.gov/access/paleo-search/study/26430'})),
            [F('year', 'Année', 'year'), F('date', 'Pleine floraison'), F('doy', 'Jour de l’année', 'number'), F('ref', 'Document ancien'), F('src', 'Source', 'url')], {period: r => [r.year, r.year]}),
        L('tk_prenoms', 'tk-prenoms', '👶', 'Prénoms : garçon ici, fille ailleurs', 'noms', 'WGND 2.0 (CC0)', 'https://doi.org/10.7910/DVN/MSEGSJ', 'prenoms',
            async () => (await rowsOf('prenoms')).rows.map(r => ({name: r.n, male: String(r.m).split(' ').map(c => T(PAYS[c] || c)), female: String(r.f).split(' ').map(c => T(PAYS[c] || c)), src: 'https://doi.org/10.7910/DVN/MSEGSJ'})),
            [F('name', 'Prénom'), F('male', 'D’homme en', 'enum'), F('female', 'De femme en', 'enum'), F('src', 'Source', 'url')], {group: 'La personne'}));
    // 🔀 la liste réunie « Patrimoine du monde » : Mérimée et le Répertoire du Québec (rang 1), Wikidata (rang 2, par merge ci-dessus)
    const MERGE = {id: 'patrimoine_monde', theme: 'monuments', icon: '🏛', label: T('Patrimoine du monde'), noun: ['bien', 'biens'], columns: ['name', 'kind', 'year', 'place', 'country', 'register'],
        same: {by: 'key'}, keep: ['name'], familyColumn: true, heavy: true, period: r => [r.year, null], geo: r => [r.lat, r.lon], // heavy : les packs par pays font plus d’un million de biens, pas lus à chaque fiche (app-donnees-plus.js)
        sources: [{list: 'lp_merimee', rank: 1, short: 'Mérimée', row: r => ({key: merimeeKey(r.ref) || `merimee:${r.ref || r.name}`, year: num(r.from), lat: r.lat, lon: r.lon, name: r.name, kind: T(/class/i.test(r.protection || '') ? 'monument historique classé' : 'monument historique inscrit'), place: r.commune, country: 'France', register: 'Mérimée', url: safeUrl(r.url)})},
            {list: 'l10t_quebec', rank: 1, short: 'RPCQ', row: r => ({key: rpcqKey(r.rpcq) || r.url, year: r.year, lat: r.lat, lon: r.lon, name: r.name, kind: r.kind, place: '', country: 'Canada', register: T('Répertoire du patrimoine culturel du Québec'), url: safeUrl(r.rpcq)})}]};
    { const M = ext.dataListMerges = ext.dataListMerges || []; if (!M.some(m => m.id === MERGE.id)) M.push(MERGE); }

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, lab) => ({id, icon, label: T(label), group: 'Le monde', kind: 'points', source: src,
        run: async ({q, bbox, max = 3000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!q || fold(lab(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: lab(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('tkx_patrimoine', '🏛', 'Patrimoine protégé du monde', async () => (await heritage()).rows, 'Wikidata (CC0)', r => `${r.n}${r.h ? ` (${r.h})` : ''}`),
        layer('tkx_musees', '🖼', 'Musées du monde', async () => (await museums()).rows, 'Wikidata (CC0)', r => r.n),
        layer('tkx_langues', '🗣', 'Langues du monde (point Glottolog)', async () => (await rowsOf('langues')).rows, 'Glottolog (CC BY 4.0)', r => r.n));

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
        host.innerHTML = html ? `<div class="hist-life tkx-life">${html}</div>` : '';
        return !!html;
    }
    const DS = (id, icon, label, parts, empty) => ({id, icon, label: T(label), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (c, host) => runPerson(parts, c, host, empty)});
    (ext.dataSources = ext.dataSources || []).push(
        DS('tkxp_patrimoine', '🏛', 'Le patrimoine protégé et les musées près de ses lieux', ['patrimoine', 'musees'], 'Rien de connu près de ses lieux (installer les packs des pays dans Réglages → 🗂 Données).'),
        DS('tkxp_oeuvres', '🎨', 'Son métier et ses lieux dans les musées', ['collections'], 'Aucune œuvre trouvée pour son métier ou son lieu de naissance.'),
        DS('tkxp_monde', '🌸', 'Cerisiers de Kyoto, langues, son prénom ailleurs', ['cerisiers', 'langues', 'prenoms'], 'Rien à dire (il faut une année de naissance, ou des lieux hors de France).'),
        ...[...MONO, ['langues', 'tkx_langues', '🗣', 'Les langues autour (Glottolog)']].map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (c, host) => runPlace(kind, c, host)})));

    /* ─────────── ⚙️ Réglages → 🌍 Le monde à côté ─────────── */
    const LINKS = {kyoto: 'https://www.ncei.noaa.gov/access/paleo-search/study/26430'};
    /** ce qui n'est qu'en lien (pas de licence ouverte lue, ou site injoignable depuis l'atelier), avec la raison */
    const LINK_ONLY = [
        ['🏛', 'Registres nationaux (Historic England, HES, Cadw, NIAH, Rijksmonumenten, Onroerend Erfgoed, BDA, NRHP, Québec…)', 'Leurs fichiers n’ont pas été recopiés : chaque bien de Wikidata ouvre sa fiche officielle (identifiant du registre).', 'https://www.wikidata.org/wiki/Property:P1435'],
        ['🌐', 'UNESCO, Liste du patrimoine mondial (textes et images)', 'whc.unesco.org refusé par le réseau de l’atelier : licence (annoncée CC BY-SA 3.0 IGO) pas relue ; rien n’en est copié, chaque site a son lien.', 'https://whc.unesco.org/fr/list/'],
        ['🎨', 'Smithsonian, Art Institute of Chicago, Cleveland, National Gallery of Art, Rijksmuseum, SMK, Paris Musées, Wellcome, Te Papa…', 'Cherchés en ligne, sur un clic, par le nom du lieu ; Paris Musées, le Smithsonian et Europeana demandent une clé pour leur API : pas de clé dans l’app.', 'https://www.si.edu/openaccess'],
        ['👗', 'Racinet, « Le costume historique » (1888, domaine public)', 'Les planches sont sur Wikimedia Commons et Internet Archive : liens (pas d’images copiées).', 'https://commons.wikimedia.org/w/index.php?search=Racinet+%22Le+costume+historique%22&ns14=1'],
        ['🪙', 'Nomisma (types de monnaies antiques, CC BY)', 'nomisma.org refusé par le réseau de l’atelier ; les pièces de l’app (« La pièce dans sa poche ») sont des XIXe-XXe siècles, que Nomisma ne couvre pas : lien.', 'https://nomisma.org'],
        ['🧊', 'Glace du lac Suwa (depuis 1443) et du Torne à Tornio (depuis 1693)', 'NSIDC refusé par le réseau de l’atelier : licence pas relue, lien seulement.', 'https://nsidc.org/data/g01377'],
        ['🌊', 'Crues du Nil au nilomètre de Roda (622-1922)', 'Pas de fichier ouvert trouvé avec sa licence : lien.', 'https://fr.wikipedia.org/wiki/Nilom%C3%A8tre'],
        ['🏙', 'Populations des villes du monde, 3700 av. J.-C.-2000 (Reba et al. 2016, CC0)', 'SEDAC et figshare refusés par le réseau de l’atelier : licence pas relue ici, lien (à fabriquer plus tard).', 'https://doi.org/10.1038/sdata.2016.34'],
        ['📏', 'Taille des adultes par pays depuis 1896 (NCD-RisC, CC BY 4.0)', 'ncdrisc.org refusé par le réseau de l’atelier : lien.', 'https://www.ncdrisc.org/data-downloads-height.html'],
        ['💷', 'Bank of England, « A millennium of macroeconomic data » (OGL)', 'bankofengland.co.uk refusé par le réseau de l’atelier : lien (change livre-franc, prix anglais).', 'https://www.bankofengland.co.uk/statistics/research-datasets'],
        ['🇪🇸', 'Noms de famille par province (INE, Espagne)', 'ine.es refusé par le réseau de l’atelier : lien.', 'https://www.ine.es/widgets/nombApell/index.shtml'],
        ['🇩🇪', 'Digitales Familiennamenwörterbuch Deutschlands (DFD)', 'Licence pas ouverte pour une copie : lien.', 'https://www.namenforschung.net/dfd/'],
        ['🇺🇸', 'ABMC, soldats américains enterrés en France', 'Déjà dans l’app (Où chercher → sources ouvertes) ; abmc.gov refusé par le réseau de l’atelier : lien.', 'https://www.abmc.gov/database-search'],
        ['🇨🇳', 'Travailleurs chinois de la Grande Guerre (cimetière de Noyelles-sur-Mer…)', 'Lien vers l’article et les tombes (CWGC).', 'https://fr.wikipedia.org/wiki/Cimeti%C3%A8re_chinois_de_Nolette'],
        ['🎵', 'Alan Lomax, Global Jukebox', 'Lien.', 'https://theglobaljukebox.org'],
        ['⛪', 'Missions étrangères de Paris, IRFA (notices des missionnaires)', 'Lien.', 'https://irfa.paris/fr/notices'],
        ['🇮🇪', 'Griffith’s Valuation (Irlande, 1847-1864)', 'Déjà dans l’app (Où chercher) : lien.', 'https://www.askaboutireland.ie/griffith-valuation/']];
    const PAT_COUNTRIES = 'gb ie nl be lu de ch at it es pt dk no se fi is ee lv lt pl cz sk hu si hr ro bg gr mt mc ad li ca us'.split(' ');
    let drawToken = 0;
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const mine = ++drawToken;
        const [P, metas] = await Promise.all([packs(), Promise.all(Object.keys(FILES).map(async k => [k, await quiet(load(k))]))]);
        const gst = await (ext.grandsPacks?.status?.() || Promise.resolve(null)).catch(() => null);
        // les packs installés à la demande ne sont pas relus ici (des centaines de milliers de lignes) : leur fiche suffit
        const pats = await Promise.all(P.pat.filter(n => !P.installed.includes(n)).map(async n => [n, await quiet(loadFile(n, patRows))])), muss = await Promise.all(P.mus.map(async n => [n, await quiet(loadFile(n, museumRows))]));
        if (mine !== drawToken || (token !== undefined && A().state && token !== A().state.workspaceToken)) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tkx-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = (label, D) => { if (!D) return `<tr><td>${esc(label)}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(label)}</td><td>${link(m.url, m.source)}</td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        const LAB = {monde: '🏛 Patrimoine mondial', collections: '🎨 Œuvres (Met)', langues: '🗣 Langues', cerisiers: '🌸 Cerisiers de Kyoto', prenoms: '👶 Prénoms'};
        const GP = ext.grandsPacks;
        const shippedPat = new Set(P.pat.filter(n => !P.installed.includes(n)).map(n => n.split('_')[1]));
        const countries = PAT_COUNTRIES.filter(c => !shippedPat.has(c));
        const missing = countries.filter(c => !gst?.packs?.[`tk-patrimoine_${c}`]);
        const gpRow = c => { const id = `tk-patrimoine_${c}`, m = gst?.packs?.[id];
            return `<tr data-tkx-pack="${esc(id)}"><td>${esc(GP ? GP.nameOf(id) : id)}</td><td>${m ? `✓ ${esc(T('installé'))} · ${esc(nf(m.rows || 0))} ${esc(T('lignes'))}${m.built ? ` · ${esc(m.built)}` : ''}` : GP ? GP.offerHtml(id) : ''}</td><td>${esc(m?.licence || '')}</td><td>${m && GP ? GP.removeHtml(id) : ''}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings tkx-settings" data-tkx-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Le monde à côté'), icon: '🌍', where: T('Réglages · Données'), help: esc(T('Le patrimoine protégé du monde, les musées et leurs œuvres du domaine public, les langues, les cerisiers de Kyoto, les prénoms d’ailleurs. Tout est lu sur l’ordinateur.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne décédée (bloc « 🌍 Le monde à côté »), sur la fiche d’un village et dans la monographie. Les listes sont dans Listes → 🏛 Monuments (liste réunie « Patrimoine du monde ») et 🖼 Musées ; les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}
                <div class="tkx-opts">
                    <label class="tkx-opt">${esc(T('Patrimoine « près de chez lui » : à combien de kilomètres ?'))} <input type="number" min="1" max="50" step="1" value="${esc(String(radius()))}" data-tkx-km="km" inputmode="numeric"> <span class="muted">${esc(T('km (5 par défaut)'))}</span></label>
                    <label class="tkx-opt">${esc(T('Musées : à combien de kilomètres ?'))} <input type="number" min="1" max="100" step="1" value="${esc(String(radiusM()))}" data-tkx-km="kmm" inputmode="numeric"> <span class="muted">${esc(T('km (25 par défaut)'))}</span></label>
                </div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${Object.keys(FILES).map(k => fileRow(T(LAB[k]), metas.find(m => m[0] === k)?.[1])).join('')}
                ${pats.map(([n, D]) => fileRow(`🏛 ${D?.meta.country_label || n}`, D)).join('')}${muss.map(([n, D]) => fileRow(`🖼 ${D?.meta.title || n}`, D)).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Les biens protégés de chaque pays ne sont pas livrés avec l’app (trop gros) : chacun s’installe une fois, ici ou dans Réglages → 🗂 Données, puis il est lu sans Internet. La France garde la base Mérimée, réunie dans la même liste.'))}</p>
                ${GP && countries.length ? `${missing.length > 1 && !kiosk() ? `<p>${GP.offerHtml(missing.map(c => `tk-patrimoine_${c}`), {label: T('Tout installer (≈ {s})', {s: GP.fmtSize(missing.reduce((n, c) => n + GP.approx(`tk-patrimoine_${c}`), 0))})})}</p>` : ''}
                <div class="cplus-scroll"><table class="data-table tkx-gp"><thead><tr><th>${esc(T('Pack'))}</th><th>${esc(T('État'))}</th><th>${esc(T('Licence'))}</th><th></th></tr></thead><tbody>${countries.map(gpRow).join('')}</tbody></table></div>` : ''}
                ${P.mus.length ? '' : `<p class="muted">${esc(T('L’annuaire des musées n’est pas encore fabriqué : la liste « 🖼 Musées du monde » montre déjà les œuvres du domaine public.'))}</p>`}
                <p class="muted">${esc(T('Le ciel la nuit et les étés secs du monde entier prolongent « 🌌 Ciel, climat et mémoire » (lot E) : ils s’y affichent.'))}</p>
                <h4>${esc(T('En lien seulement'))}</h4><ul class="hist-ul tkx-ul">${LINK_ONLY.map(([i, l, why, u]) => `<li>${esc(i)} <b>${esc(T(l))}</b> — ${esc(T(why))} ${link(u, T('↗ ouvrir'))}</li>`).join('')}</ul>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Les liens « ↗ » et « 🔍 Chercher dans les collections » ouvrent une page seulement quand on clique, jamais en consultation ; aucune image n’est chargée toute seule.'))}</p></div></section>`;
    }
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tkx-tg]');
        if (t && e.target.matches('input')) {
            const s = settings(), k = t.dataset.tkxTg, was = s[k];
            s[k] = e.target.checked; saveSettings(s);
            A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🌍'});
            return;
        }
        const kmIn = e.target.closest?.('[data-tkx-km]');
        if (kmIn) {
            const key = kmIn.dataset.tkxKm === 'kmm' ? 'kmm' : 'km', max = key === 'kmm' ? 100 : 50, s = settings(), was = s[key], v = Math.round(Number(kmIn.value));
            const cur = key === 'kmm' ? radiusM() : radius();
            if (!(v >= 1 && v <= max)) { kmIn.value = String(cur); return; }
            if (v === cur) return;
            s[key] = v; saveSettings(s);
            A().undoToast?.(T(key === 'kmm' ? 'Musées : {n} km.' : 'Patrimoine : {n} km.', {n: String(v)}), {undo: () => { const x = settings(); x[key] = was; saveSettings(x); drawSettings(); }, icon: '🌍'});
        }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_m'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_m'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🌍 Le monde à côté']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechK = {...core, load, loadFile, packs, heritage, museums, settings, radius, radiusM, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
