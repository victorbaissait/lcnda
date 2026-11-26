/**
 * 🏰 Fiche d'un château · ⛪ fiche d'un lieu de culte (maquette validée : docs/design/fiche-chateau-culte.html ; style : assets/css/fiche-edifice.css ;
 * serveur : lib/edifices.php, tables sites, site_people, site_registers, site_events).
 * Une fiche = un château (manoir, maison forte, tour…) ou un lieu de culte (église, chapelle, abbaye, prieuré, temple, synagogue, mosquée…),
 * rattachée à une commune, reliée aux personnes et aux actes de l'arbre. Elle s'ouvre par-dessus l'écran (pas de nouvel onglet).
 * Ce qu'elle montre : son histoire (Wikidata, Mérimée, territoires d'autrefois, ta note), seigneurs et propriétaires / curés, abbés,
 * pasteurs, rabbins, imams (proposés : Wikidata P127, seigneurs de la commune, métiers de l'arbre — gardés d'un clic), ta famille ici
 * (actes reliés + actes dont l'adresse parle de l'édifice, à relier d'un clic), les registres et archives, les objets (Palissy), l'image
 * (Commons), une petite carte et les sources. Chaque fait porte son « ↗ source ». Chaque changement : « ↶ Annuler ».
 * Où on y arrive :
 *  - fiche d'un village et monographie de commune : « 🏰⛪ Les édifices de la commune » (fiches d'abord, puis ce qui est connu :
 *    châteaux de Wikidata, églises disparues, monuments Mérimée, églises de Wikidata en ligne — « ＋ Faire une fiche ») ;
 *    dans « ⛪ Église et paroisse », le nom de l'église devient un lien vers sa fiche ;
 *  - la petite fiche d'un château (🏰 Châteaux d'Europe, Carte, Listes) : « ＋ Faire une fiche » ou « Ouvrir sa fiche » ;
 *  - fiche d'une personne : dans la ligne de l'acte, « ⛪ église Saint-Martin · curé … » ; un acte dont l'adresse dit « château »,
 *    « église »… : « 🔗 Relier à une fiche ? » ; bloc « 🏰 Ses châteaux » (seulement s'il est seigneur, curé… quelque part) ;
 *  - Carte : les édifices qui ont une fiche, mis en avant quand « 🏰 Châteaux » est allumé ; Listes : « 🏰⛪ Mes fiches d'édifices » ;
 *  - registres communs : LCNDA_EXT.dataLists, dataSources, monographSections, mapLayerSources, personBlocks.
 * Réglages → « 🏰⛪ Fiches des édifices » : chaque partie s'éteint (localStorage « genealogie-fiches-edifices ») ; toutes les fiches.
 *   window.LCNDA_EXT.ficheEdifice = {open, create, placeInto, …}   (Node : module.exports, le calcul)
 * Essai : tests/test-fiche-chateau-culte.js
 */
(function (root) {
    'use strict';
    /* un téléchargement coupé (page rechargée, application arrêtée, réseau perdu) n'est pas une erreur à montrer : la partie reste vide, sans rien dans la console */
    const cutOff = e => e?.name === 'AbortError' || e?.network === true || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')));
    const report = e => { if (!cutOff(e)) console.error(e); };
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const KINDS = {
        chateau: ['🏰', 'château', 'castle'], chateau_fort: ['🏰', 'château fort', 'castle'], forteresse: ['🛡', 'forteresse', 'castle'], manoir: ['🏠', 'manoir', 'castle'],
        maison_forte: ['🏠', 'maison forte', 'castle'], tour: ['🗼', 'tour, donjon', 'castle'], motte: ['⛰', 'motte castrale', 'castle'],
        eglise: ['⛪', 'église', 'church'], chapelle: ['⛪', 'chapelle', 'church'], collegiale: ['⛪', 'collégiale', 'church'], cathedrale: ['⛪', 'cathédrale', 'church'], basilique: ['⛪', 'basilique', 'church'],
        abbaye: ['🏛', 'abbaye', 'abbey'], prieure: ['🏛', 'prieuré', 'abbey'], monastere: ['🏛', 'monastère', 'abbey'], couvent: ['🏛', 'couvent', 'abbey'], commanderie: ['🏛', 'commanderie', 'abbey'],
        temple: ['🕍', 'temple protestant', 'temple'], synagogue: ['🕍', 'synagogue', 'synagogue'], mosquee: ['🕌', 'mosquée', 'mosquee']};
    const GROUPS = {
        castle: {people: '👑 Seigneurs et propriétaires', roles: ['seigneur', 'dame', 'propriétaire', 'châtelain', 'capitaine', 'régisseur'], regs: ['Chartrier', 'Terrier', 'Papiers de la seigneurie'], regTitle: '📚 Archives du château', cult: ''},
        church: {people: '👤 Les curés et les prêtres', roles: ['curé', 'vicaire', 'desservant', 'chapelain', 'prêtre', 'chanoine'], regs: ['Registres paroissiaux (baptêmes, mariages, sépultures)', 'Registres de catholicité', 'État civil'], regTitle: '📚 Les registres tenus ici', cult: 'catholique'},
        abbey: {people: '👤 Les abbés, prieurs et religieux', roles: ['abbé', 'abbesse', 'prieur', 'prieure', 'moine', 'moniale'], regs: ['Registres de vêtures et professions', 'Cartulaire'], regTitle: '📚 Les registres et le cartulaire', cult: 'catholique'},
        temple: {people: '👤 Les pasteurs', roles: ['pasteur', 'ancien du consistoire'], regs: ['Registres pastoraux', 'Registres « du Désert » (avant 1787)'], regTitle: '📚 Registres pastoraux', cult: 'protestant'},
        synagogue: {people: '👤 Les rabbins et ministres officiants', roles: ['rabbin', 'ministre officiant', 'mohel'], regs: ['Registres consistoriaux', 'Registres de circoncisions'], regTitle: '📚 Registres consistoriaux', cult: 'juif'},
        mosquee: {people: '👤 Les imams', roles: ['imam'], regs: ['État civil'], regTitle: '📚 Les registres (rares : voir l’état civil)', cult: 'musulman'}};
    const STATES = {'': 'non précisé', debout: 'debout', restaure: 'restauré', ruine: 'en ruine', disparu: 'disparu', transforme: 'transformé'};
    const CULTS = {'': '—', catholique: 'catholique', protestant: 'protestant', orthodoxe: 'orthodoxe', juif: 'juif', musulman: 'musulman', autre: 'autre'};
    const groupOf = k => (KINDS[k] || KINDS.eglise)[2];
    const iconOf = k => (KINDS[k] || KINDS.eglise)[0];
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte');
    const STOP = new Set(['eglise', 'chapelle', 'chateau', 'fort', 'manoir', 'maison', 'forte', 'abbaye', 'prieure', 'monastere', 'couvent', 'collegiale', 'cathedrale', 'basilique', 'temple', 'protestant', 'reforme',
        'synagogue', 'mosquee', 'paroissiale', 'tour', 'motte', 'castrale', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'et', 'a', 'au', 'aux', 'ancien', 'ancienne']);
    /** ce qui distingue le nom : « Église Saint-Martin » → « saint martin » (comme lib/edifices.php) */
    const keyOf = name => fold(name).split(' ').filter(w => w && !STOP.has(w)).join(' ');
    const hasKey = (txt, key) => !!key && key.split(' ').every(w => new RegExp(`\\b${w}\\b`).test(fold(txt)));
    const KIND_WORDS = [[/\bchateau fort\b|\bforteresse\b/, 'chateau_fort'], [/\bmaison forte\b/, 'maison_forte'], [/\bmanoir\b|\bgentilhommiere\b/, 'manoir'], [/\bdonjon\b|\btour\b/, 'tour'], [/\bmotte\b/, 'motte'],
        [/\bchateau\b|\bcastel\b/, 'chateau'], [/\bcathedrale\b/, 'cathedrale'], [/\bbasilique\b/, 'basilique'], [/\bcollegiale\b/, 'collegiale'], [/\babbaye\b|\babbatiale\b/, 'abbaye'], [/\bprieure\b/, 'prieure'],
        [/\bmonastere\b/, 'monastere'], [/\bcouvent\b/, 'couvent'], [/\bcommanderie\b/, 'commanderie'], [/\btemple\b/, 'temple'], [/\bsynagogue\b/, 'synagogue'], [/\bmosquee\b/, 'mosquee'], [/\bchapelle\b/, 'chapelle'], [/\beglise\b/, 'eglise']];
    /** la sorte d'après un texte (adresse d'un acte, dénomination Mérimée…) ; '' si rien */
    const kindFromText = txt => { const f = fold(txt); const k = KIND_WORDS.find(([re]) => re.test(f)); return k ? k[1] : ''; };
    const CASTLE_K = {c: 'chateau_fort', h: 'chateau', r: 'chateau', f: 'forteresse', m: 'manoir', mf: 'maison_forte', t: 'tour', o: 'motte'};
    const L8C_K = {'église': 'eglise', chapelle: 'chapelle', abbaye: 'abbaye', 'prieuré': 'prieure', 'monastère': 'monastere', couvent: 'couvent', 'collégiale': 'collegiale', 'cathédrale': 'cathedrale',
        basilique: 'basilique', commanderie: 'commanderie', temple: 'temple', synagogue: 'synagogue'};
    const wdUrl = q => (q ? `https://www.wikidata.org/wiki/${encodeURIComponent(q)}` : '');
    const wpUrl = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const popUrl = ref => (ref ? `https://pop.culture.gouv.fr/notice/${/^PM/i.test(ref) ? 'palissy' : 'merimee'}/${encodeURIComponent(ref)}` : '');
    const imgUrl = (f, w = 480) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(f).replace(/ /g, '_'))}?width=${w}`;
    const fileUrl = f => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(f).replace(/ /g, '_'))}`;
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    /** une fiche pré-remplie depuis un château de Wikidata (heritage-chateaux-territoires.js) ; c = l'élément du fichier, code = le pays */
    function siteFromCastle(c, code = 'FR') {
        const st = !c ? '' : c.y1 != null || /detruit|disparu|demoli|rase/.test(fold(c.st)) ? 'disparu' : c.k === 'r' || /ruin/.test(fold(c.st)) ? 'ruine' : /restaur|reconstruit/.test(fold(c.st)) ? 'restaure' : c.st ? 'debout' : '';
        return {kind: CASTLE_K[c.k] || 'chateau', name: cap(c.n), insee: code === 'FR' ? (c.ci || '') : '', commune: c.cn || '', lat: c.la ?? null, lon: c.lo ?? null, built_from: c.y0 ?? null, gone_year: c.y1 ?? null,
            state: st, protection: (c.hs || []).join(' ; '), visit: c.v ? 1 : 0, wikidata: c.q, merimee: c.me || '', image: c.im || '',
            wikipedia: c.w ? wpUrl(c.w) : c.wl ? `https://${c.wl[0]}.wikipedia.org/wiki/${encodeURIComponent(String(c.wl[1]).replace(/ /g, '_'))}` : '', origin: `cht:${code}`};
    }
    /** une fiche pré-remplie depuis un lieu de culte disparu (LCNDA_EXT.lot8MondeVillage.worshipPlaces) */
    function siteFromWorship(w, insee = '') {
        return {kind: L8C_K[w.kind] || 'eglise', name: cap(w.name), insee: String(insee || ''), lat: w.lat ?? null, lon: w.lon ?? null, built_from: w.from ?? null, gone_year: w.state === 'detruit' ? (w.to ?? null) : null,
            state: w.state === 'detruit' ? 'disparu' : w.state === 'partiel' ? 'ruine' : '', wikidata: w.q || '', merimee: /^(PA|IA)\d+/.test(w.mh || '') ? w.mh : '', image: w.image || '', wikipedia: w.wikipedia || '',
            cult: GROUPS[groupOf(L8C_K[w.kind] || 'eglise')].cult, origin: 'l8c'};
    }
    /** une fiche pré-remplie depuis un monument Mérimée (pack « Patrimoine », lib/lieux_patrimoine.php) */
    function siteFromMerimee(o, insee = '') {
        const kind = kindFromText(`${o.deno} ${o.nom}`) || 'eglise';
        return {kind, name: cap(o.nom), insee: String(o.insee || insee || ''), commune: o.commune || '', lat: o.lat ?? null, lon: o.lon ?? null, merimee: o.ref || '', protection: o.protection || '',
            patron_saint: groupOf(kind) === 'castle' ? '' : (o.vocable || ''), cult: GROUPS[groupOf(kind)].cult, origin: 'merimee'};
    }
    /** une fiche pré-remplie depuis une église de Wikidata (heritage-commune-plus.js, en ligne) */
    function siteFromCplus(c, insee = '') {
        const s = (c.saints || [])[0];
        return {kind: kindFromText(c.label) || 'eglise', name: cap(c.label), insee: String(insee || ''), wikidata: c.qid || '', image: c.image || '', patron_saint: s ? s.label : '', state: c.gone ? 'disparu' : '',
            cult: 'catholique', origin: 'cplus'};
    }
    const century = y => (y > 0 ? Math.floor((y - 1) / 100) + 1 : 0);
    const roman = n => { let s = ''; for (const [v, l] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += l; n -= v; } return s; };
    const centuryTxt = y => (century(y) ? `${roman(century(y))}e s.` : '');
    /** « XIIIe – XVIe s. », « XIIe s. », « 1820 » */
    function whenTxt(s) {
        const a = s.built_from, b = s.built_to;
        if (a == null) return b != null ? String(b) : '';
        if (b != null && century(b) !== century(a)) return `${roman(century(a))}e – ${roman(century(b))}e s.`;
        return a >= 1700 ? String(a) : centuryTxt(a);
    }
    const BAPT = new Set(['BIRT', 'BAPM', 'CHR']), MARR = new Set(['MARR', 'MARB', 'MARC', 'ENGA']), BURI = new Set(['BURI', 'DEAT', 'CREM']);
    /** les actes reliés : {bapt, marr, buri, other, decades:[[1740, n], …]} */
    function eventStats(events) {
        const o = {bapt: 0, marr: 0, buri: 0, other: 0, decades: []}, dec = new Map();
        for (const e of events || []) {
            if (BAPT.has(e.tag)) o.bapt++; else if (MARR.has(e.tag)) o.marr++; else if (BURI.has(e.tag)) o.buri++; else o.other++;
            if (e.year != null) { const d = Math.floor(e.year / 10) * 10; dec.set(d, (dec.get(d) || 0) + 1); }
        }
        o.decades = [...dec.entries()].sort((a, b) => a[0] - b[0]);
        return o;
    }
    /** les objets Palissy (cloches, fonts…) qui sont dans cet édifice, et sa notice Mérimée */
    function heritageOf(site, list) {
        const key = keyOf(site.name), kw = kindFromText(site.name);
        const mon = (list || []).filter(o => o.base !== 'palissy'), obj = (list || []).filter(o => o.base === 'palissy');
        const notice = mon.find(o => site.merimee && o.ref === site.merimee) || (key ? mon.find(o => hasKey(o.nom, key) && (!kw || groupOf(kindFromText(`${o.deno} ${o.nom}`) || kw) === groupOf(kw))) : null) || null;
        const objects = obj.filter(o => (key && hasKey(o.edifice || '', key)) || (notice && fold(o.edifice) && fold(o.edifice) === fold(notice.nom)));
        return {notice, objects};
    }
    /** qui était là cette année-là (curé pendant un baptême…) */
    const atYear = (rows, y) => (rows || []).filter(r => y != null && (r.year_from != null || r.year_to != null) && (r.year_from ?? -1e4) <= y && y <= (r.year_to ?? r.year_from ?? 1e4));
    const core = {KINDS, GROUPS, STATES, groupOf, iconOf, fold, keyOf, hasKey, kindFromText, siteFromCastle, siteFromWorship, siteFromMerimee, siteFromCplus, whenTxt, centuryTxt, eventStats, heritageOf, atYear};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const S = () => A().state || {};
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const plural = (n, one, many) => `${nf(n)} ${n > 1 ? many : one}`;
    const get = (action, params = {}) => A().api(action, params);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body}).then(r => r?.result || r);
    const toastErr = e => A().toast?.(e?.message || String(e), 'error');
    const KEY = 'genealogie-fiches-edifices';
    const TAB = ['fiches_edifices', '25k7', '🏰⛪ Fiches des édifices'];
    const BLOCK = ['fe_roles', '🏰 Ses châteaux et lieux de culte'];
    const PARTS = [
        ['place', '🏰⛪ Les édifices de la commune', 'Fiche d’un village et monographie : les fiches de la commune, puis les châteaux, églises et monuments connus, avec « ＋ Faire une fiche ».'],
        ['events', '🔗 Dans les actes', 'Fiche d’une personne : le nom de l’édifice dans la ligne de l’acte ; « Relier à une fiche ? » quand l’adresse parle d’un château ou d’une église.'],
        ['person', BLOCK[1], 'Fiche d’une personne : seigneur, curé, pasteur… d’un édifice qui a une fiche (seulement s’il y en a).'],
        ['castle', '＋ Faire une fiche (châteaux)', 'Dans la petite fiche d’un château de Wikidata : faire sa fiche, ou l’ouvrir.'],
        ['map', '🗺 Sur la Carte', 'Les édifices qui ont une fiche sont mis en avant quand « 🏰 Châteaux » est allumé.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const on = k => settings()[k] !== false;
    const kiosk = () => !!root.document?.body?.classList.contains('is-kiosk');
    /** consultation (kiosque) ou invité du réseau local : aucune image chargée d'Internet (le lien reste) */
    const offline = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const safe = u => (A().safeUrl ? A().safeUrl(u) : u) || '#';
    const link = (url, label) => (url ? `<a href="${esc(safe(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const src = (url, label = T('↗ source')) => (url ? `<a class="fe-src" href="${esc(safe(url))}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(label)}</a>` : '');
    const more = (html, n, label = T('▸ plus')) => (html ? `<details class="fe-more"><summary>${esc(label)}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const yrs = (a, b) => (a == null && b == null ? '' : a != null && b != null ? (a === b ? String(a) : `${a} – ${b}`) : a != null ? T('dès {y}', {y: String(a)}) : T('jusqu’en {y}', {y: String(b)}));
    const kindLabel = k => T((KINDS[k] || KINDS.eglise)[1]);
    const personBtn = (id, name) => (id ? `<button type="button" class="link-button fe-who" data-fe-pid="${Number(id)}">${esc(name)}</button>` : esc(name));
    const openPerson = id => A().openPersonById?.(Number(id));
    /** d'où vient une valeur gardée sur la fiche (son « ↗ source ») */
    const originSrc = s => (/^(cht|l8c|cplus)/.test(s.origin) && s.wikidata ? wdUrl(s.wikidata) : s.origin === 'merimee' && s.merimee ? popUrl(s.merimee) : '');
    const originLabel = s => (/^(cht|l8c|cplus)/.test(s.origin) ? 'Wikidata' : s.origin === 'merimee' ? 'Mérimée' : '');

    /* ─────────── les données en plus (livrées avec l'app ou packs) ─────────── */
    const memo = new Map();
    const once = (k, fn) => { if (!memo.has(k)) memo.set(k, Promise.resolve().then(fn).catch(() => null)); return memo.get(k); };
    async function castleItem(site) {
        const CT = ext.chateauxTerritoires; if (!CT?.loadCountry || !site.wikidata) return null;
        const code = /^cht:([A-Z]{2})$/.test(site.origin) ? site.origin.slice(4) : 'FR';
        const f = await once(`cht:${code}`, () => CT.loadCountry(code)); const it = f?.items?.find(c => c.q === site.wikidata);
        return it ? {c: it, code} : null;
    }
    async function worshipItem(site) {
        const L8 = ext.lot8MondeVillage; if (!L8?.worshipPlaces || !site.wikidata || !site.insee) return null;
        const list = await once(`l8c:${site.insee}`, () => L8.worshipPlaces(site.insee)); return (list || []).find(w => w.q === site.wikidata) || null;
    }
    const patrimoine = pl => once(`lp:${pl.id || 0}:${pl.insee || ''}`, async () => { const LP = ext.lieuxPatrimoine; if (!LP?.placeData || (!pl.id && !pl.insee)) return null; const d = await LP.placeData({id: pl.id || 0, insee: pl.insee || ''}); return d?.ok && d.patrimoine?.installed ? d.patrimoine : null; });
    const lordsOf = insee => once(`lords:${insee}`, async () => (ext.lot8MondeVillage?.lordsOf && insee ? ext.lot8MondeVillage.lordsOf(insee) : []));
    async function territoryAt(lat, lon, year) {
        const CT = ext.chateauxTerritoires; if (!CT?.loadAllTerr || !CT.placeAt || lat == null) return null;
        const ctx = await once('terr', () => CT.loadAllTerr()); if (!ctx) return null;
        const r = CT.placeAt(ctx, lat, lon, year); return r.any ? r : null;
    }
    let listCache = null;
    const allSites = (fresh = false) => { if (fresh || !listCache) listCache = get('ed_list').then(r => r.sites || []).catch(() => { listCache = null; return []; }); return listCache; };
    const forget = () => { listCache = null; personMemo.clear(); placeMemo.clear(); };

    /* ─────────── créer, effacer (↶ Annuler) ─────────── */
    /** crée une fiche (pré-remplie) et l'ouvre ; si l'élément Wikidata a déjà une fiche, l'ouvre */
    async function create(prefill, opts = {}) {
        let r; try { r = await post('ed_save', prefill); } catch (e) { toastErr(e); return null; }
        forget();
        const site = r.site;
        if (!r.existed) A().undoToast?.(T('Fiche créée : {n}', {n: site.name}), {icon: iconOf(site.kind), undo: async () => { await post('ed_delete', {id: site.id}); forget(); closeDialog(site.id); redrawAll(); }});
        redrawAll();
        if (opts.open !== false) await open(site.id);
        return site;
    }
    async function remove(id) {
        let r; try { r = await post('ed_delete', {id}); } catch (e) { toastErr(e); return; }
        forget(); closeDialog(id); redrawAll();
        A().undoToast?.(T('Fiche supprimée : {n}', {n: r.snapshot.site.name}), {icon: '🗑', undo: async () => { await post('ed_restore', {snapshot: r.snapshot}); forget(); redrawAll(); await open(Number(r.snapshot.site.id)); }});
    }
    async function saveSite(body, message) {
        let r; try { r = await post('ed_save', body); } catch (e) { toastErr(e); return null; }
        forget();
        const before = r.before;
        if (before) A().undoToast?.(message || T('Fiche enregistrée.'), {undo: async () => { await post('ed_save', before); forget(); await refresh(); redrawAll(); }});
        await refresh(); redrawAll();
        return r.site;
    }

    /* ─────────── 🏰⛪ la fiche ─────────── */
    let dlg = null, current = null;
    function closeDialog(id) { if (dlg && (id == null || current?.site?.id === id)) dlg.close(); }
    function dialog() {
        if (dlg?.isConnected) return dlg;
        dlg = document.createElement('dialog'); dlg.className = 'modal fe-dlg';
        dlg.innerHTML = `<div class="modal-head"><h2 data-fe-title></h2><button type="button" class="icon-button" data-fe-close aria-label="${esc(T('Fermer'))}" title="${esc(T('Fermer'))}">✕</button></div><div class="modal-body" data-fe-body></div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { current = null; });
        dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-fe-close]')) dlg.close(); });
        return dlg;
    }
    async function open(id) {
        const d = dialog();
        d.querySelector('[data-fe-title]').textContent = T('Fiche d’un édifice');
        d.querySelector('[data-fe-body]').innerHTML = UI().spinner ? UI().spinner(T('On ouvre la fiche…')) : `<p class="muted">${esc(T('On ouvre la fiche…'))}</p>`;
        if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
        let data; try { data = await get('ed_get', {id}); } catch (e) { d.querySelector('[data-fe-body]').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return null; }
        current = data;
        render();
        return data;
    }
    async function refresh() { if (!current || !dlg?.open) return; try { current = await get('ed_get', {id: current.site.id}); render(); } catch (_) { dlg.close(); } }

    function render() {
        const D = current, s = D.site, g = GROUPS[s.group] || GROUPS.church;
        dlg.querySelector('[data-fe-title]').textContent = `${iconOf(s.kind)} ${s.name}`;
        const body = dlg.querySelector('[data-fe-body]');
        body.innerHTML = sheetHtml(D);
        body.dataset.feSite = String(s.id);
        fillExtras(body, D).catch(report);
        return g;
    }
    function sheetHtml(D) {
        const s = D.site, g = GROUPS[s.group] || GROUPS.church, os = originSrc(s);
        const where = [s.commune || s.place_name, s.county, s.diocese ? T('diocèse de {d}', {d: s.diocese.replace(/^dioc[eè]se d[e’']\s*/i, '')}) : ''].filter(Boolean);
        const chips = [whenTxt(s) && [whenTxt(s), os], s.state && [T(STATES[s.state] || s.state) + (s.gone_year ? ` (${s.gone_year})` : ''), os], s.patron_saint && [T('saint patron : {s}', {s: s.patron_saint}), s.origin === 'merimee' || s.origin === 'cplus' ? os : ''],
            s.protection && [s.protection.split(' ; ')[0], os], s.visit && [T('se visite'), os]].filter(Boolean);
        const links = [s.wikipedia && link(s.wikipedia, 'Wikipédia ↗'), s.wikidata && link(wdUrl(s.wikidata), 'Wikidata ↗'), s.merimee && link(popUrl(s.merimee), 'Mérimée ↗')].filter(Boolean);
        const eyebrow = [cap(kindLabel(s.kind)), s.cult ? T(CULTS[s.cult]) : '', s.group === 'castle' ? (s.county || '') : ''].filter(Boolean).join(' · ');
        const st = eventStats(D.events);
        const edit = !kiosk();
        const peopleRows = D.people.map(p => `<li data-fe-prow="${p.id}"><span class="fe-yr">${esc(yrs(p.year_from, p.year_to) || '—')}</span><span>${p.person_id ? personBtn(p.person_id, p.person_name || p.name) : esc(p.name)}${p.role ? `, ${esc(p.role)}` : ''}${p.note ? ` <small class="muted">${esc(p.note)}</small>` : ''}</span>
            ${p.source_url ? src(p.source_url, p.source_label ? `↗ ${p.source_label}` : T('↗ source')) : `<small class="muted">${esc(p.source_label === 'arbre' ? T('(d’après ton arbre)') : T('(ta saisie)'))}</small>`}
            ${edit ? `<span class="fe-acts">${p.person_id ? '' : `<button type="button" class="button small secondary" data-fe-plink="${p.id}">${esc(T('＋ Relier à une personne'))}</button>`}<button type="button" class="icon-button small" data-fe-pdel="${p.id}" title="${esc(T('Retirer'))}" aria-label="${esc(T('Retirer'))}">✕</button></span>` : ''}</li>`).join('');
        const evRow = (e, proposed) => `<li><span class="fe-yr">${esc(e.year ?? '?')}</span><span>${esc(e.type)}${e.people.length ? ' — ' + e.people.map(p => personBtn(p.id, p.name)).join(` ${esc(T('et'))} `) : ''}${e.address ? ` <small class="muted">« ${esc(e.address)} »</small>` : ''}</span>
            ${edit ? (proposed ? `<button type="button" class="button small" data-fe-elink="${e.id}">${esc(T('✓ Relier'))}</button>` : `<button type="button" class="icon-button small" data-fe-eunlink="${e.id}" title="${esc(T('Ne plus relier cet acte'))}" aria-label="${esc(T('Ne plus relier cet acte'))}">✕</button>`) : ''}</li>`;
        const counts = [st.bapt && plural(st.bapt, T('baptême ou naissance'), T('baptêmes ou naissances')), st.marr && plural(st.marr, T('mariage'), T('mariages')), st.buri && plural(st.buri, T('sépulture ou décès'), T('sépultures ou décès')), st.other && plural(st.other, T('autre acte'), T('autres actes'))].filter(Boolean);
        const regRows = D.registers.map(r => `<li><span class="fe-yr">${esc(yrs(r.year_from, r.year_to) || '—')}</span><span>${esc(r.what)}${r.service_name ? ` → <button type="button" class="link-button" data-fe-service="${r.archive_service_id}">${esc(r.service_name)}</button>` : ''}${r.cote ? `, ${esc(r.cote)}` : ''}${r.note ? ` <small class="muted">${esc(r.note)}</small>` : ''}</span>
            ${r.url ? src(r.url, T('↗ en ligne')) : r.service_url ? src(r.service_url, T('↗ le service')) : ''}${edit ? `<button type="button" class="icon-button small" data-fe-rdel="${r.id}" title="${esc(T('Retirer'))}" aria-label="${esc(T('Retirer'))}">✕</button>` : ''}</li>`).join('');
        const sources = [s.wikidata && `${link(wdUrl(s.wikidata), `Wikidata ${s.wikidata}`)} ${esc(T('(CC0)'))}`, s.merimee && `${link(popUrl(s.merimee), `Mérimée ${s.merimee}`)} ${esc(T('(Licence Ouverte)'))}`,
            s.wikipedia && `${link(s.wikipedia, 'Wikipédia')} ${esc(T('(CC BY-SA 4.0)'))}`, s.image && `${link(fileUrl(s.image), T('Image : Wikimedia Commons'))} ${esc(T('(auteur et licence sur sa page)'))}`].filter(Boolean);
        return `<article class="fe-sheet k-${esc(s.group)}">
            <div class="fe-hero">${s.image && !offline() ? `<figure class="fe-ph"><a href="${esc(fileUrl(s.image))}" target="_blank" rel="noopener noreferrer"><img src="${esc(imgUrl(s.image, 360))}" alt="${esc(s.name)}" loading="lazy" onerror="this.closest('figure').classList.add('is-ico');this.remove()"></a><span aria-hidden="true">${iconOf(s.kind)}</span></figure>` : `<div class="fe-ph is-ico" aria-hidden="true"><span>${iconOf(s.kind)}</span></div>`}
                <div><div class="fe-eyebrow">${esc(eyebrow)}</div><h3>${esc(s.name)}</h3>
                ${chips.length ? `<div class="fe-chips">${chips.map(([c, u]) => `<span class="fe-chip">${esc(c)}${u ? ` ${src(u, '↗')}` : ''}</span>`).join('')}</div>` : ''}
                <small class="muted">${esc(where.join(' · '))}${links.length ? ` · ${links.join(' · ')}` : ''}</small></div></div>
            ${edit ? `<p class="fe-tools"><button type="button" class="button small secondary" data-fe-edit>${esc(T('✎ Modifier'))}</button><span data-fe-x="refresh"></span>${s.lat != null ? `<button type="button" class="button small secondary" data-fe-map="${s.lat},${s.lon}">${esc(T('🗺 Voir sur la carte'))}</button>` : ''}<button type="button" class="button small secondary" data-fe-del>${esc(T('🗑 Supprimer'))}</button></p>` : ''}
            <section class="fe-sec"><h4>${esc(T('📜 Son histoire'))}</h4><div data-fe-x="history">${s.history ? `<p>${esc(s.history)}</p><small class="muted">${esc(T('(ta saisie)'))}</small>` : ''}</div>${s.notes ? `<p class="fe-note"><b>${esc(T('Ta note :'))}</b> ${esc(s.notes)}</p>` : ''}</section>
            <section class="fe-sec"><h4>${esc(T(g.people))}</h4>${D.people.length ? `<ul class="fe-l">${peopleRows}</ul>` : ''}<div data-fe-x="people"></div>
                ${edit ? `<p><button type="button" class="button small secondary" data-fe-padd>${esc(T('＋ Ajouter'))}</button></p>` : ''}</section>
            <section class="fe-sec"><h4>${esc(T('👪 Ta famille ici'))}</h4>
                ${D.events.length ? `<p>${esc(counts.join(', '))} ${esc(T('de ta famille.'))}</p><ul class="fe-l">${D.events.slice(0, 8).map(e => evRow(e, false)).join('')}</ul>${D.events.length > 8 ? more(`<ul class="fe-l">${D.events.slice(8).map(e => evRow(e, false)).join('')}</ul>`, D.events.length - 8) : ''}
                    ${st.decades.length > 1 ? more(`<ul class="fe-dec">${st.decades.map(([d, n]) => `<li><span class="fe-yr">${d}</span><i style="width:${Math.round(n / Math.max(...st.decades.map(x => x[1])) * 100)}%"></i><span>${n}</span></li>`).join('')}</ul>`, 0, T('▸ par décennie')) : ''}` : ''}
                ${D.proposed.length ? `<div class="fe-prop"><p><b>${esc(T('À confirmer :'))}</b> ${esc(T('{n} acte(s) de la commune dont l’adresse parle de cet édifice.', {n: String(D.proposed.length)}))} ${edit && D.proposed.length > 1 ? `<button type="button" class="button small" data-fe-elink-all>${esc(T('✓ Tout relier'))}</button>` : ''}</p><ul class="fe-l">${D.proposed.slice(0, 12).map(e => evRow(e, true)).join('')}</ul>${D.proposed.length > 12 ? more(`<ul class="fe-l">${D.proposed.slice(12).map(e => evRow(e, true)).join('')}</ul>`, D.proposed.length - 12) : ''}</div>` : ''}
                ${!D.events.length && !D.proposed.length ? `<p class="muted">${esc(T('Aucun acte relié pour l’instant. Un acte se relie depuis cette fiche, ou depuis la fiche de la personne (« 🔗 Relier à une fiche ? »).'))}</p>` : ''}
                <p class="fe-note">${esc(T('La liste vient des actes reliés à la fiche, et des actes de la commune dont l’adresse parle de l’édifice (proposés, à confirmer d’un clic).'))}</p></section>
            <section class="fe-sec"><h4>${esc(T(g.regTitle))}</h4>${D.registers.length ? `<ul class="fe-l">${regRows}</ul>` : ''}<div data-fe-x="registers"></div>
                ${edit ? `<p><button type="button" class="button small secondary" data-fe-radd>${esc(T('＋ Ajouter des registres'))}</button></p>` : ''}</section>
            <section class="fe-sec" data-fe-x="objects" hidden></section>
            <section class="fe-sec"><h4>${esc(T('🖼 Photos et plans'))}</h4>${s.image && offline() ? `<p class="muted">🖼 ${link(fileUrl(s.image), s.image)}</p>` : s.image ? `<figure class="fe-fig"><a href="${esc(fileUrl(s.image))}" target="_blank" rel="noopener noreferrer"><img src="${esc(imgUrl(s.image, 640))}" alt="${esc(s.name)}" loading="lazy" onerror="this.remove()"></a><figcaption>${esc(s.image)} · ${link(fileUrl(s.image), T('↗ auteur et licence'))}</figcaption></figure>` : `<p class="muted">${esc(T('Pas encore d’image. « ✎ Modifier » → une image de Wikimedia Commons (son nom de fichier) : l’auteur et la licence restent sur sa page.'))}</p>`}</section>
            ${s.lat != null ? `<section class="fe-sec"><h4>${esc(T('🗺 Sur la carte'))}</h4>${miniMap(s)}</section>` : ''}
            <section class="fe-sec"><h4>${esc(T('📑 Sources'))}</h4>${sources.length ? `<ul class="fe-src-list">${sources.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}<div data-fe-x="sources"></div><p class="muted">${esc(T('Ce que tu as écrit toi-même est marqué « ta saisie ». Tes sources se citent comme partout dans l’app, sur les actes.'))}</p></section>
        </article>`;
    }
    function miniMap(s) {
        const app = A(); if (!app.lngToX || !app.mapTileUrl) return `<p>${link(`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=16/${s.lat}/${s.lon}`, T('Voir sur OpenStreetMap ↗'))}</p>`;
        const W = 520, H = 150, z = 15, px = app.lngToX(s.lon, z), py = app.latToY(s.lat, z), tiles = [];
        for (let x = Math.floor((px - W / 2) / 256); x <= Math.floor((px + W / 2) / 256); x++) for (let y = Math.floor((py - H / 2) / 256); y <= Math.floor((py + H / 2) / 256); y++)
            tiles.push(`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${esc(app.mapTileUrl('osm', z, x, y))}" style="left:${Math.round(x * 256 - px + W / 2)}px;top:${Math.round(y * 256 - py + H / 2)}px">`);
        return `<div class="fe-map" style="height:${H}px">${tiles.join('')}<span class="fe-pin" aria-hidden="true">${iconOf(s.kind)}</span></div><small class="muted">${esc(T('Fond : © les contributeurs d’OpenStreetMap'))} ${src('https://www.openstreetmap.org/copyright')}</small>`;
    }

    /* ── ce qui vient d'ailleurs (Wikidata, Mérimée, territoires), rempli après coup ── */
    async function fillExtras(body, D) {
        const s = D.site, g = GROUPS[s.group] || GROUPS.church;
        const slot = k => (body.isConnected ? body.querySelector(`[data-fe-x="${k}"]`) : null);
        const [ci, wi, pat, lords] = await Promise.all([s.group === 'castle' ? castleItem(s) : null, s.group !== 'castle' ? worshipItem(s) : null,
            patrimoine({id: s.place_id, insee: s.insee}), s.group === 'castle' && s.insee ? lordsOf(s.insee) : []]);
        if (!body.isConnected || current?.site?.id !== s.id) return;
        /* 📜 l'histoire : dates de Wikidata, notice Mérimée, territoire de l'époque */
        const hist = [];
        const c = ci?.c;
        if (c?.y0 != null) hist.push(`<p>${esc(T('Construit vers {y} ({s}).', {y: String(c.y0), s: centuryTxt(c.y0)}))} ${src(wdUrl(c.q))}</p>`);
        else if (s.built_from != null) hist.push(`<p>${esc(T('Construit vers {y} ({s}).', {y: String(s.built_from), s: centuryTxt(s.built_from)}))} ${originSrc(s) ? src(originSrc(s)) : `<small class="muted">${esc(T('(ta saisie)'))}</small>`}</p>`);
        if (c?.y1 != null) hist.push(`<p>${esc(T('Détruit ou disparu en {y}.', {y: String(c.y1)}))} ${src(wdUrl(c.q))}</p>`);
        if (wi) hist.push(`<p>${esc(cap(wi.stateText))}${wi.from != null && s.built_from == null ? ` ${esc(T('(attesté dès {y})', {y: String(wi.from)}))}` : ''}. ${src(wi.wikipedia || wi.wikidata)}</p>`);
        const H2 = pat ? heritageOf(s, pat.list) : {notice: null, objects: []};
        const fx = pat?.fixture ? ` <b>${esc(T('(données d’essai, inventées)'))}</b>` : '';
        if (H2.notice) {
            const n = H2.notice;
            hist.push(`<p>${esc(T('Monument historique : {p}', {p: n.protection || n.deno || ''}))}${n.siecle ? ` — ${esc(n.siecle)}` : ''}. ${src(n.url)}${fx}</p>`);
            if (n.resume) hist.push(more(`<p class="fe-quote">${esc(n.resume)}</p><small class="muted">${esc(T('Historique Mérimée (Ministère de la Culture, Licence Ouverte)'))} ${src(n.url)}</small>`, 0, T('▸ plus : l’historique Mérimée')));
            if (n.vocable && !s.patron_saint && s.group !== 'castle') hist.push(`<p>${esc(T('Vocable : {v}', {v: n.vocable}))} ${src(n.url)}</p>`);
        }
        if (s.lat != null) {
            const tr = await territoryAt(s.lat, s.lon, 1700).catch(() => null);
            if (tr && body.isConnected) {
                const bits = [...tr.drawn.slice(0, 2).map(it => `<button type="button" class="link-button" data-cht-terr="${esc(it.q)}">${esc(it.n)}</button> ${src(wdUrl(it.q))}`), ...tr.seats.slice(0, 2).map(it => `${esc(T('siège de : {n}', {n: it.n}))} ${src(wdUrl(it.q))}`)];
                if (bits.length) hist.push(`<p>${esc(T('En {y}, ce lieu était dans :', {y: '1700'}))} ${bits.join(' · ')} <small class="muted">${esc(T('(👑 Territoires d’autrefois)'))}</small></p>`);
            }
        }
        const h = slot('history'); if (h) h.insertAdjacentHTML('afterbegin', hist.join(''));
        if (h && !h.innerHTML.trim()) h.innerHTML = `<p class="muted">${esc(T('Rien encore. « ✎ Modifier » pour écrire son histoire.'))}</p>`;
        /* 👑 / 👤 les personnes proposées : propriétaires Wikidata (P127), seigneurs de la commune, métiers de l'arbre */
        const have = new Set(D.people.map(p => fold(p.person_name || p.name)));
        const sug = [];
        for (const o of c?.ow || []) if (!have.has(fold(o[0]))) sug.push({name: o[0], role: T('propriétaire'), year_from: o[2] ?? null, year_to: o[3] ?? null, source_url: wdUrl(o[1] || c.q), source_label: 'Wikidata', why: T('Wikidata (P127)')});
        for (const l of lords || []) if (l.kind === 'seigneur' && !have.has(fold(l.name))) sug.push({name: l.name, role: l.title || T('seigneur'), year_from: l.datesOf === 'titre' ? l.from : null, year_to: l.datesOf === 'titre' ? l.to : null, source_url: l.wikipedia || l.wikidata, source_label: 'Wikidata', why: T('seigneur de la commune (Wikidata)')});
        for (const hnt of D.clergy_hints || []) sug.push({person_id: hnt.person_id, name: hnt.name, role: (g.roles.find(r => fold(hnt.occupation).includes(fold(r))) || hnt.occupation).toLowerCase(), year_from: null, year_to: null, source_label: 'arbre',
            why: T('dans ton arbre : « {o} »', {o: hnt.occupation}) + (hnt.y0 != null ? ` · ${T('actes ici : {y}', {y: yrs(hnt.y0, hnt.y1)})}` : ''), tree: true});
        const ps = slot('people');
        if (ps && sug.length) {
            ps.__sug = sug;
            ps.innerHTML = more(`<ul class="fe-l">${sug.map((x, i) => `<li><span class="fe-yr">${esc(yrs(x.year_from, x.year_to) || '—')}</span><span>${x.person_id ? personBtn(x.person_id, x.name) : esc(x.name)}${x.role ? `, ${esc(x.role)}` : ''} <small class="muted">${esc(x.why)}</small></span>${x.source_url ? src(x.source_url) : ''}${kiosk() ? '' : `<button type="button" class="button small" data-fe-pkeep="${i}">${esc(T('＋ Garder'))}</button>`}</li>`).join('')}</ul>
                <p class="fe-note">${esc(s.group === 'castle' ? T('Les propriétaires de Wikidata ne deviennent des personnes de ton arbre que si tu cliques « Relier ».') : T('Proposés à partir des métiers notés dans ton arbre (curé, pasteur…) pour cette commune ; tu confirmes.'))}</p>`, sug.length, T('▸ Proposés'));
        }
        /* 🔔 les objets (Palissy) */
        const os = slot('objects');
        if (os && H2.objects.length) {
            const bap = eventStats(D.events).bapt, fonts = H2.objects.find(o => /fonts? baptism/i.test(fold(`${o.deno} ${o.nom}`)));
            os.hidden = false;
            os.innerHTML = `<h4>${esc(T('🔔 Objets protégés'))}</h4><ul class="fe-l">${H2.objects.map(o => `<li><span><b>${esc(o.nom)}</b> <small class="muted">${esc([o.deno, o.siecle || o.dates, o.protection].filter(Boolean).join(' · '))}</small></span>${src(o.url)}</li>`).join('')}</ul>
                ${fonts && bap ? `<p>${esc(T('Les fonts baptismaux sont protégés ; {n} baptême(s) de ta famille ont eu lieu dans cet édifice.', {n: String(bap)}))}</p>` : ''}<small class="muted">${esc(T('Source : Ministère de la Culture, POP (base Palissy), Licence Ouverte'))}${fx}</small>`;
        }
        /* 📑 les sources en plus */
        const ss = slot('sources'), extra = [];
        if (H2.notice && H2.notice.ref !== s.merimee) extra.push(`${link(H2.notice.url, `Mérimée ${H2.notice.ref}`)} ${esc(T('(Licence Ouverte)'))}`);
        if (H2.objects.length) extra.push(`${link('https://pop.culture.gouv.fr', T('POP, base Palissy'))} ${esc(T('(Licence Ouverte)'))}`);
        if (ss && extra.length) ss.innerHTML = `<ul class="fe-src-list">${extra.map(x => `<li>${x}</li>`).join('')}</ul>`;
        /* ↻ mettre à jour depuis Wikidata (seulement s'il y a de quoi comparer) */
        const rs = slot('refresh');
        if (rs && (c || wi) && diffWd(s, c ? siteFromCastle(c, ci.code) : siteFromWorship(wi, s.insee)).length) rs.innerHTML = `<button type="button" class="button small secondary" data-fe-wd>${esc(T('↻ Mettre à jour depuis Wikidata'))}</button>`;
        body.__wd = c ? siteFromCastle(c, ci.code) : wi ? siteFromWorship(wi, s.insee) : null;
    }
    const WD_FIELDS = [['name', 'Nom'], ['built_from', 'Construit'], ['gone_year', 'Disparu en'], ['state', 'État'], ['protection', 'Protection'], ['visit', 'Se visite'], ['merimee', 'Mérimée'], ['image', 'Image'], ['wikipedia', 'Wikipédia'], ['lat', 'Latitude'], ['lon', 'Longitude']];
    const diffWd = (s, w) => (w ? WD_FIELDS.filter(([k]) => w[k] != null && w[k] !== '' && String(w[k]) !== String(s[k] ?? '')).map(([k, l]) => ({k, l, from: s[k], to: w[k]})) : []);

    /* ── les petits formulaires (dans la fiche) ── */
    const P = () => root.LCNDA_PICKER || A();
    function formIn(host, html, onSubmit) {
        host.querySelector('.fe-form')?.remove();
        const f = document.createElement('form'); f.className = 'fe-form';
        f.innerHTML = `${html}<p class="fe-form-btns"><button type="submit" class="button small">${esc(T('Enregistrer'))}</button> <button type="button" class="button small secondary" data-fe-cancel>${esc(T('Annuler'))}</button></p>`;
        host.appendChild(f);
        f.addEventListener('click', e => { if (e.target.closest('[data-fe-cancel]')) f.remove(); });
        f.addEventListener('submit', async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(f).entries()); try { await onSubmit(data, f); } catch (x) { toastErr(x); } });
        f.querySelector('input,select,textarea')?.focus();
        return f;
    }
    const field = (label, inner) => `<label class="fe-field"><span>${esc(label)}</span>${inner}</label>`;
    const inp = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
    function peopleForm(sec, s) {
        const g = GROUPS[s.group] || GROUPS.church;
        formIn(sec, `<div class="fe-grid">${`<div class="fe-field"><span class="pk-lab">${esc(T('Personne de l’arbre'))}</span>${P().pickerField ? P().pickerField({name: 'person_id', kind: 'person', inline: true}) : inp('person_id', '', 'type="number"')}</div>`}
            ${field(T('ou un nom (pas dans l’arbre)'), inp('name'))}${field(T('Rôle'), `<input name="role" list="fe-roles-${s.id}" value="${esc(g.roles[0])}"><datalist id="fe-roles-${s.id}">${g.roles.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`)}
            ${field(T('De'), inp('year_from', '', 'type="number" min="-3000" max="2100"'))}${field(T('À'), inp('year_to', '', 'type="number" min="-3000" max="2100"'))}${field(T('Lien vers la source (facultatif)'), inp('source_url', '', 'type="url" placeholder="https://"'))}</div>`,
        async d => { const r = await post('ed_people_save', {...d, site_id: s.id}); A().undoToast?.(T('Ajouté à la fiche.'), {undo: async () => { await post('ed_people_delete', {id: r.id}); await refresh(); }}); await refresh(); });
    }
    function regForm(sec, s) {
        const g = GROUPS[s.group] || GROUPS.church;
        formIn(sec, `<div class="fe-grid">${field(T('Quels registres'), `<input name="what" list="fe-regs-${s.id}" value="${esc(g.regs[0])}" required><datalist id="fe-regs-${s.id}">${g.regs.map(r => `<option value="${esc(T(r))}">`).join('')}</datalist>`)}
            ${field(T('De'), inp('year_from', '', 'type="number"'))}${field(T('À'), inp('year_to', '', 'type="number"'))}
            <div class="fe-field"><span class="pk-lab">${esc(T('Où ils sont aujourd’hui (service d’archives)'))}</span>${P().pickerField ? P().pickerField({name: 'archive_service_id', kind: 'archive_service', inline: true}) : ''}</div>
            ${field(T('Cote'), inp('cote'))}${field(T('Lien (registres en ligne)'), inp('url', '', 'type="url" placeholder="https://"'))}</div>`,
        async d => { const r = await post('ed_reg_save', {...d, site_id: s.id}); A().undoToast?.(T('Registres ajoutés.'), {undo: async () => { await post('ed_reg_delete', {id: r.id}); await refresh(); }}); await refresh(); });
    }
    function editForm(body, s, onSave = null) {
        const kinds = ['castle', 'church', 'abbey', 'temple', 'synagogue', 'mosquee'].map(gr => `<optgroup label="${esc(gr === 'castle' ? T('Châteaux') : T('Lieux de culte'))}">${Object.entries(KINDS).filter(([, v]) => v[2] === gr).map(([k, v]) => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${v[0]} ${esc(T(v[1]))}</option>`).join('')}</optgroup>`).join('');
        const sel = (name, map, v) => `<select name="${name}">${Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === (v || '') ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select>`;
        body.innerHTML = `<div class="fe-edit"></div>`;
        formIn(body.firstElementChild, `<div class="fe-grid">${field(T('Sorte'), `<select name="kind">${kinds}</select>`)}${field(T('Nom'), inp('name', s.name, 'required'))}
            <div class="fe-field"><span class="pk-lab">${esc(T('Commune'))}</span>${P().pickerField ? P().pickerField({name: 'place_id', kind: 'place', value: s.place_id || null, inline: true}) : inp('place_id', s.place_id || '')}</div>
            ${field(T('Code INSEE'), inp('insee', s.insee, 'maxlength="5"'))}${field(T('Construit (année)'), inp('built_from', s.built_from, 'type="number"'))}${field(T('Remanié jusqu’en'), inp('built_to', s.built_to, 'type="number"'))}
            ${field(T('Disparu en'), inp('gone_year', s.gone_year, 'type="number"'))}${field(T('État'), sel('state', STATES, s.state))}${field(T('Culte'), sel('cult', CULTS, s.cult))}
            ${field(T('Saint patron'), inp('patron_saint', s.patron_saint))}${field(T('Diocèse'), inp('diocese', s.diocese))}${field(T('Protection'), inp('protection', s.protection))}
            ${field(T('Latitude'), inp('lat', s.lat, 'type="number" step="any"'))}${field(T('Longitude'), inp('lon', s.lon, 'type="number" step="any"'))}
            ${field(T('Wikidata (Q…)'), inp('wikidata', s.wikidata, 'pattern="Q[0-9]+"'))}${field(T('Mérimée (PA…)'), inp('merimee', s.merimee))}${field(T('Wikipédia (lien)'), inp('wikipedia', s.wikipedia, 'type="url"'))}
            ${field(T('Image de Wikimedia Commons (nom du fichier)'), inp('image', s.image))}<label class="checkbox-line"><input type="checkbox" name="visit" value="1" ${s.visit ? 'checked' : ''}> ${esc(T('Se visite'))}</label></div>
            ${field(T('Son histoire'), `<textarea name="history" rows="4">${esc(s.history)}</textarea>`)}${field(T('Ta note'), `<textarea name="notes" rows="3">${esc(s.notes)}</textarea>`)}`,
        async d => { if (onSave) return onSave(d); await saveSite({...d, id: s.id, visit: d.visit ? 1 : 0, origin: s.origin}, T('Fiche enregistrée.')); });
        if (!onSave) body.querySelector('[data-fe-cancel]')?.addEventListener('click', () => render());
    }
    function wdDialog(body, s, w) {
        const diff = diffWd(s, w);
        const box = document.createElement('div'); box.className = 'fe-wd';
        box.innerHTML = `<p><b>${esc(T('Ce qui a changé dans Wikidata'))}</b> ${src(wdUrl(s.wikidata))}</p><table class="data-table"><thead><tr><th>${esc(T('Champ'))}</th><th>${esc(T('Sur ta fiche'))}</th><th>${esc(T('Dans Wikidata'))}</th></tr></thead><tbody>${diff.map(x => `<tr><td>${esc(T(x.l))}</td><td>${esc(x.from ?? '—')}</td><td>${esc(x.to)}</td></tr>`).join('')}</tbody></table>
            <p><button type="button" class="button small" data-fe-wd-ok>${esc(T('Écrire ces changements'))}</button> <button type="button" class="button small secondary" data-fe-wd-no>${esc(T('Annuler'))}</button></p>`;
        body.querySelector('.fe-tools')?.after(box);
        box.querySelector('[data-fe-wd-no]').addEventListener('click', () => box.remove());
        box.querySelector('[data-fe-wd-ok]').addEventListener('click', () => saveSite({id: s.id, ...Object.fromEntries(diff.map(x => [x.k, x.to]))}, T('Fiche mise à jour depuis Wikidata.')));
    }

    /* ── les clics dans la fiche ── */
    async function linkEvents(ids, siteId) {
        const r = await post('ed_link', {event_ids: ids, site_id: siteId});
        forget();
        const before = r.before || {};
        A().undoToast?.(siteId ? T('{n} acte(s) relié(s) à la fiche.', {n: String(ids.length)}) : T('Acte délié de la fiche.'), {icon: '🔗', undo: async () => {
            const by = {}; for (const [eid, sid] of Object.entries(before)) (by[sid] ||= []).push(Number(eid));
            for (const [sid, list] of Object.entries(by)) await post('ed_link', {event_ids: list, site_id: Number(sid)});
            forget(); await refresh(); redrawPerson();
        }});
        await refresh(); redrawPerson();
    }
    if (root.document) document.addEventListener('click', async e => {
        const t = e.target.closest?.('[data-fe-open],[data-fe-make],[data-fe-relink],[data-fe-map],[data-fe-new],[data-fe-pid]');
        if (t) {
            e.preventDefault();
            if (t.dataset.fePid) { dlg?.close(); return openPerson(t.dataset.fePid); }
            if (t.dataset.feOpen) return open(Number(t.dataset.feOpen));
            if (t.dataset.feMake) { const pre = makeMemo.get(t.dataset.feMake); if (pre) { t.disabled = true; await create(pre); t.disabled = false; } return; }
            if (t.dataset.feRelink) return relinkDialog(Number(t.dataset.feRelink), t);
            if (t.dataset.feNew != null) return newSiteDialog(t.dataset.feNew ? JSON.parse(t.dataset.feNew) : {});
            if (t.dataset.feMap) { const [lat, lon] = t.dataset.feMap.split(',').map(Number); const st = S(); st.mapCenter = {lat, lon}; st.mapZoom = 15; A().persistUiState?.(); dlg?.close(); A().setModule?.('carte'); return; }
        }
        const body = e.target.closest?.('[data-fe-site]'); if (!body || !current) return;
        const s = current.site, b = e.target.closest('button'); if (!b) return;
        try {
            if (b.matches('[data-fe-edit]')) return editForm(body, s);
            if (b.matches('[data-fe-del]')) return remove(s.id);
            if (b.matches('[data-fe-wd]')) return body.__wd && wdDialog(body, s, body.__wd);
            if (b.matches('[data-fe-padd]')) return peopleForm(b.closest('.fe-sec'), s);
            if (b.matches('[data-fe-radd]')) return regForm(b.closest('.fe-sec'), s);
            if (b.dataset.fePkeep != null) {
                const x = b.closest('[data-fe-x="people"]').__sug[Number(b.dataset.fePkeep)];
                const r = await post('ed_people_save', {site_id: s.id, person_id: x.person_id || 0, name: x.person_id ? '' : x.name, role: x.role, year_from: x.year_from, year_to: x.year_to, source_url: x.source_url || '', source_label: x.source_label || ''});
                A().undoToast?.(T('« {n} » gardé sur la fiche.', {n: x.name}), {undo: async () => { await post('ed_people_delete', {id: r.id}); await refresh(); }});
                return refresh();
            }
            if (b.dataset.fePdel) {
                const r = await post('ed_people_delete', {id: Number(b.dataset.fePdel)});
                A().undoToast?.(T('Retiré de la fiche.'), {undo: async () => { await post('ed_people_save', r.row); await refresh(); }});
                return refresh();
            }
            if (b.dataset.fePlink) {
                const it = await (P().openPicker ? P().openPicker({kind: 'person', title: T('Relier à une personne de l’arbre')}) : null); if (!it) return;
                const row = current.people.find(p => p.id === Number(b.dataset.fePlink)); if (!row) return;
                const r = await post('ed_people_save', {...row, site_id: s.id, person_id: it.id});
                A().undoToast?.(T('Relié à {n}.', {n: it.title || it.name || ''}), {undo: async () => { await post('ed_people_save', {...r.before, site_id: s.id}); await refresh(); }});
                return refresh();
            }
            if (b.dataset.feRdel) {
                const r = await post('ed_reg_delete', {id: Number(b.dataset.feRdel)});
                A().undoToast?.(T('Registres retirés de la fiche.'), {undo: async () => { await post('ed_reg_save', r.row); await refresh(); }});
                return refresh();
            }
            if (b.dataset.feElink) return linkEvents([Number(b.dataset.feElink)], s.id);
            if (b.matches('[data-fe-elink-all]')) return linkEvents(current.proposed.map(x => x.id), s.id);
            if (b.dataset.feEunlink) return linkEvents([Number(b.dataset.feEunlink)], 0);
            if (b.dataset.feService && ext.archiveServices?.open) { dlg.close(); return ext.archiveServices.open(Number(b.dataset.feService)); }
        } catch (x) { toastErr(x); }
    });

    /* ─────────── ＋ nouvelle fiche, 🔗 relier un acte ─────────── */
    const makeMemo = new Map(); let makeN = 0;
    /** un bouton « ＋ Faire une fiche » pour une fiche pré-remplie */
    const makeBtn = (pre, label = T('＋ Faire une fiche')) => { const k = `m${++makeN}`; makeMemo.set(k, pre); return kiosk() ? '' : `<button type="button" class="button small secondary fe-make" data-fe-make="${k}">${esc(label)}</button>`; };
    function newSiteDialog(pre = {}) {
        const d = dialog(); current = null;
        d.querySelector('[data-fe-title]').textContent = T('Nouvelle fiche d’un édifice');
        const body = d.querySelector('[data-fe-body]'); delete body.dataset.feSite;
        const s = {kind: 'eglise', name: '', state: '', cult: '', visit: 0, history: '', notes: '', patron_saint: '', diocese: '', protection: '', wikidata: '', merimee: '', wikipedia: '', image: '', insee: '', place_id: null, lat: null, lon: null, ...pre};
        editForm(body, s, async data => { const site = await create({...pre, ...data, visit: data.visit ? 1 : 0}, {open: false}); if (site) { if (pre.event_id) await linkEvents([pre.event_id], site.id); await open(site.id); } });
        body.querySelector('[data-fe-cancel]')?.addEventListener('click', () => d.close());
        if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    }
    async function relinkDialog(eventId, btn) {
        const info = btn.closest('[data-event-id]')?.__feUnlinked || {};
        const list = (await allSites()).filter(x => !info.place_id || x.place_id === info.place_id);
        const kind = kindFromText(info.address) || 'eglise';
        const pre = {kind, name: cap(String(info.address || '').trim()).slice(0, 120), place_id: info.place_id || null, cult: GROUPS[groupOf(kind)].cult, origin: 'acte', event_id: eventId};
        const box = document.createElement('div'); box.className = 'fe-relink';
        box.innerHTML = `<p>${esc(T('L’adresse de cet acte : « {a} ». À quelle fiche le relier ?', {a: info.address || ''}))}</p>
            ${list.length ? `<ul class="fe-l">${list.map(x => `<li><button type="button" class="button small secondary" data-fe-pick="${x.id}">${iconOf(x.kind)} ${esc(x.name)}</button> <small class="muted">${esc(x.place_name || x.commune || '')}</small></li>`).join('')}</ul>` : ''}
            <p><button type="button" class="button small" data-fe-new='${esc(JSON.stringify(pre))}'>${esc(T('＋ Nouvelle fiche « {n} »', {n: pre.name || kindLabel(kind)}))}</button> <button type="button" class="button small secondary" data-fe-x-close>${esc(T('Annuler'))}</button></p>`;
        const host = btn.closest('.fe-evline'); host.querySelector('.fe-relink')?.remove(); host.appendChild(box);
        box.addEventListener('click', async e => {
            if (e.target.closest('[data-fe-x-close]')) return box.remove();
            const p = e.target.closest('[data-fe-pick]'); if (p) { box.remove(); try { await linkEvents([eventId], Number(p.dataset.fePick)); } catch (x) { toastErr(x); } }
        });
    }

    /* ─────────── 🏰⛪ les édifices d'une commune (fiche d'un village, monographie, à la demande) ─────────── */
    const placeMemo = new Map();
    const insOf = pl => String(pl?.insee || pl?.admin4_code || '');
    /** ce qui est connu ailleurs pour cette commune : [{icon, name, sub, src, pre}] (sans ce qui a déjà une fiche) */
    async function knownAt(pl, sites) {
        const ins = insOf(pl), lat = pl.lat ?? pl.latitude, lon = pl.lon ?? pl.longitude, out = [];
        const haveQ = new Set(sites.map(x => x.wikidata).filter(Boolean)), haveM = new Set(sites.map(x => x.merimee).filter(Boolean)), haveK = new Set(sites.map(x => `${groupOf(x.kind)}|${keyOf(x.name)}`));
        const seen = (pre) => (pre.wikidata && haveQ.has(pre.wikidata)) || (pre.merimee && haveM.has(pre.merimee)) || haveK.has(`${groupOf(pre.kind)}|${keyOf(pre.name)}`);
        const add = (icon, pre, sub, url) => { if (seen(pre)) return; haveK.add(`${groupOf(pre.kind)}|${keyOf(pre.name)}`); if (pre.wikidata) haveQ.add(pre.wikidata); if (pre.merimee) haveM.add(pre.merimee); out.push({icon, name: pre.name, sub, src: url, pre}); };
        const CT = ext.chateauxTerritoires;
        const [castles, worship, pat] = await Promise.all([
            CT?.castlesAround && lat != null && lat !== '' ? CT.castlesAround(Number(lat), Number(lon), 6).catch(() => []) : [],
            ext.lot8MondeVillage?.worshipPlaces && ins ? ext.lot8MondeVillage.worshipPlaces(ins).catch(() => []) : [],
            patrimoine({id: Number(pl.id) || 0, insee: ins})]);
        for (const x of castles || []) if (CT.sameCommune(x.c, {name: pl.name || '', insee: ins}, Number(lat), Number(lon))) add(iconOf(CASTLE_K[x.c.k] || 'chateau'), {...siteFromCastle(x.c, x.code), place_id: Number(pl.id) || null}, [T(KINDS[CASTLE_K[x.c.k] || 'chateau'][1]), centuryTxt(x.c.y0), T('Wikidata')].filter(Boolean).join(' · '), wdUrl(x.c.q));
        for (const w of worship || []) add(iconOf(L8C_K[w.kind] || 'eglise'), {...siteFromWorship(w, ins), place_id: Number(pl.id) || null}, [T(w.kind), w.stateText, T('Wikidata')].filter(Boolean).join(' · '), w.wikipedia || w.wikidata);
        for (const o of pat?.list || []) if (o.base !== 'palissy' && kindFromText(`${o.deno} ${o.nom}`)) add(iconOf(kindFromText(`${o.deno} ${o.nom}`)), {...siteFromMerimee(o, ins), place_id: Number(pl.id) || null}, [o.siecle, o.protection, T('Mérimée')].filter(Boolean).join(' · '), o.url);
        return out;
    }
    const siteLi = x => `<li><button type="button" class="link-button fe-who" data-fe-open="${x.id}">${iconOf(x.kind)} ${esc(x.name)}</button> <small class="muted">${esc([whenTxt(x), x.state ? T(STATES[x.state]) : '', x.n_events ? plural(x.n_events, T('acte de ta famille'), T('actes de ta famille')) : '', x.n_people ? plural(x.n_people, T('personne'), T('personnes')) : ''].filter(Boolean).join(' · '))}</small></li>`;
    const knownLi = k => `<li>${k.icon} ${esc(k.name)} <small class="muted">${esc(k.sub)} ${esc(T('(pas encore de fiche)'))}</small> ${src(k.src)} ${makeBtn(k.pre, '＋')}</li>`;
    /** remplit host ; renvoie false s'il n'y a rien du tout à dire (la partie est passée) */
    async function placeInto(host, pl, opts = {}) {
        if (!host || !pl) return false;
        const ins = insOf(pl), pid = Number(pl.id) || 0;
        if (!pid && !ins) { host.innerHTML = ''; return false; }
        const k = `${pid}|${ins}`;
        if (!placeMemo.has(k)) placeMemo.set(k, get('ed_list', {place_id: pid, insee: ins}).then(r => r.sites || []).catch(() => []));
        const sites = await placeMemo.get(k);
        const known = await knownAt(pl, sites);
        if (!host.isConnected && !opts.detached) return false;
        if (!sites.length && !known.length) { host.innerHTML = ''; return false; }
        const lead = sites.length ? T('{a} ; {b} autre(s) connu(s) (Wikidata, Mérimée).', {a: plural(sites.length, T('fiche d’édifice'), T('fiches d’édifices')), b: String(known.length)})
            : T('{n} édifice(s) connu(s) dans la commune (Wikidata, Mérimée), pas encore de fiche.', {n: String(known.length)});
        const firstKnown = known.slice(0, Math.max(0, 6 - sites.length));
        host.innerHTML = `<p>${esc(lead)}</p><ul class="fe-l fe-place">${sites.map(siteLi).join('')}${firstKnown.map(knownLi).join('')}</ul>
            ${known.length > firstKnown.length ? more(`<ul class="fe-l fe-place">${known.slice(firstKnown.length).map(knownLi).join('')}</ul>`, known.length - firstKnown.length) : ''}
            ${kiosk() ? '' : `<p><button type="button" class="link-button" data-fe-new='${esc(JSON.stringify({place_id: pid || null, insee: ins}))}'>${esc(T('＋ Faire la fiche d’un autre château ou lieu de culte'))}</button></p>`}
            <p><small class="muted">${esc(T('Sources : tes fiches ; Wikidata (CC0) ; Ministère de la Culture, Mérimée (Licence Ouverte) si le pack « Patrimoine » est installé.'))}</small></p>`;
        // ⛪ en ligne (Wikidata, heritage-commune-plus.js) : ajouté quand la réponse arrive
        if (ext.communePlus?.church && opts.online !== false && pl.name) ext.communePlus.church({id: pid, name: pl.name, insee: ins, lat: pl.lat ?? pl.latitude, lon: pl.lon ?? pl.longitude}).then(r => {
            if (!r?.ok || !host.isConnected) return;
            const extra = []; const haveQ = new Set([...sites.map(x => x.wikidata), ...known.map(x => x.pre.wikidata)].filter(Boolean));
            for (const c of r.churches || []) if (c.qid && !haveQ.has(c.qid)) extra.push({icon: iconOf(kindFromText(c.label) || 'eglise'), name: cap(c.label), sub: [c.when, (c.saints || [])[0] ? T('saint patron : {s}', {s: c.saints[0].label}) : '', T('Wikidata')].filter(Boolean).join(' · '), src: c.url, pre: {...siteFromCplus(c, ins), place_id: pid || null}});
            if (extra.length) host.querySelector('.fe-place')?.insertAdjacentHTML('beforeend', extra.map(knownLi).join(''));
        }).catch(() => {});
        return true;
    }
    const panel = () => `<section class="maintenance-panel cplus-panel fe-panel" data-fe-part="place"><h3>${esc(T('🏰⛪ Les édifices de la commune'))}</h3><div data-fe-body-place></div></section>`;
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'fe_place', host: '[data-fe-host]', icon: '🏰', label: 'Les édifices de la commune', group: 'Le village', enabled: () => on('place')});
    async function decorateVillage() {
        const ws = document.getElementById('workspace'); if (!ws || !on('place')) return;
        const village = ws.querySelector('.h-village:not([data-fe])'); if (!village) return;
        village.dataset.fe = '1';
        const pl = villagePlace(village); if (!pl.name) return;
        const anchor = village.querySelector('[data-cht-host]') || village.querySelector('[data-mr-host], .mr-place') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const wrap = document.createElement('div'); wrap.className = 'fe-place-box'; wrap.dataset.feHost = '1'; wrap.innerHTML = panel();
        if (anchor) anchor.after(wrap); else village.appendChild(wrap);
        const ok = await placeInto(wrap.querySelector('[data-fe-body-place]'), pl);
        if (!ok) wrap.remove();
        churchLink(village, pl);
    }
    /** « ⛪ Église et paroisse » : le nom de l'église devient un lien vers sa fiche (le texte reste s'il n'y en a pas) */
    async function churchLink(village, pl) {
        const dd = [...village.querySelectorAll('[data-vsec="church"] .data-row')].find(r => /^(Église|Church|Kirche|Iglesia|Chiesa|Kerk|Kościół|Igreja)$/i.test(r.querySelector('dt')?.textContent.trim() || ''))?.querySelector('dd');
        if (!dd || dd.querySelector('[data-fe-open]')) return;
        const sites = (await placeMemo.get(`${Number(pl.id) || 0}|${insOf(pl)}`)) || [];
        const worship = sites.filter(x => x.group !== 'castle'), txt = dd.textContent.trim();
        const hit = worship.find(x => hasKey(txt, keyOf(x.name)) && keyOf(x.name)) || (worship.length === 1 ? worship[0] : null);
        if (hit) dd.innerHTML = `<button type="button" class="link-button fe-who" data-fe-open="${hit.id}">${iconOf(hit.kind)} ${esc(txt)}</button>`;
    }
    function redrawAll() {
        placeMemo.clear();
        document.querySelectorAll('[data-fe-host]').forEach(h => h.remove());
        document.querySelectorAll('#workspace .h-village[data-fe]').forEach(v => { delete v.dataset.fe; });
        decorateVillage().catch(report);
        redrawPerson();
        document.querySelectorAll('[data-fe-settings-list]').forEach(h => drawMine(h));
    }

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const personMemo = new Map();
    const personData = id => { if (!personMemo.has(id)) personMemo.set(id, get('ed_person', {id}).catch(() => null)); return personMemo.get(id); };
    async function decoratePerson(id) {
        if (!id) return;
        const D = await personData(id); if (!D) return;
        if (on('events')) document.querySelectorAll('#workspace .event-row[data-event-id]').forEach(row => {
            row.querySelectorAll('.fe-evline').forEach(x => x.remove());
            const eid = row.dataset.eventId, l = D.events?.[eid], content = row.querySelector('.event-content'); if (!content) return;
            if (l) content.insertAdjacentHTML('beforeend', `<p class="fe-evline">${iconOf(l.kind)} <button type="button" class="link-button fe-who" data-fe-open="${l.site_id}">${esc(l.name)}</button>${l.people.map(p => ` · ${esc(p.role)} ${personBtn(p.person_id, p.name)}`).join('')}</p>`);
            else { const u = (D.unlinked || []).find(x => String(x.event_id) === eid); if (u && !kiosk()) { row.__feUnlinked = u; content.insertAdjacentHTML('beforeend', `<p class="fe-evline"><button type="button" class="link-button fe-relink" data-fe-relink="${u.event_id}">${esc(T('🔗 Relier à une fiche ?'))}</button></p>`); } }
        });
        document.querySelectorAll(`#workspace [data-fe-person="${id}"]`).forEach(h => { const n = rolesInto(h, D.roles || []); const card = h.closest('section.card'); if (card) card.hidden = !n; });
    }
    function rolesInto(host, roles) {
        if (!roles.length) { host.innerHTML = ''; return 0; }
        host.innerHTML = `<ul class="fe-l">${roles.map(r => `<li><span class="fe-yr">${esc(yrs(r.year_from, r.year_to) || '—')}</span><span>${esc(cap(r.role || T('lié à')))} — <button type="button" class="link-button fe-who" data-fe-open="${r.site_id}">${iconOf(r.kind)} ${esc(r.site_name)}</button></span>${r.source_url ? src(r.source_url) : ''}</li>`).join('')}</ul>`;
        return roles.length;
    }
    function redrawPerson() { personMemo.clear(); const id = Number(S().currentPersonId) || 0; if (S().module === 'personnes' && id) decoratePerson(id).catch(report); }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !on('person')) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="fe-block" data-fe-person="${Number(p.id)}"></div>`, 'span-6').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(detail => { const id = Number(detail?.person?.id) || 0; personMemo.delete(id); decoratePerson(id).catch(report); });

    /* ─────────── 🏰 la petite fiche d'un château : « ＋ Faire une fiche » / « Ouvrir sa fiche » ─────────── */
    let lastCastle = null;
    if (root.document) document.addEventListener('click', e => { const c = e.target.closest?.('[data-cht-castle]'); if (c) lastCastle = c.dataset.chtCastle; }, true);
    async function decorateCastleCard(card) {
        card.dataset.fe = '1';
        const a = card.querySelector('a[href*="wikidata.org/wiki/Q"]'); const q = (a?.getAttribute('href').match(/Q\d+/) || [])[0]; if (!q) return;
        const sites = await allSites(); const has = sites.find(x => x.wikidata === q);
        const where = card.querySelector('.h-links') || card;
        if (has) { where.insertAdjacentHTML('beforeend', ` · <button type="button" class="link-button fe-who" data-fe-open="${has.id}">${esc(T('🏰 Ouvrir sa fiche'))}</button>`); return; }
        let code = lastCastle && lastCastle.endsWith(`:${q}`) ? lastCastle.split(':')[0] : '';
        const CT = ext.chateauxTerritoires; if (!CT?.loadCountry) return;
        let it = null;
        for (const cc of [code, 'FR'].filter(Boolean)) { const f = await once(`cht:${cc}`, () => CT.loadCountry(cc)); it = f?.items?.find(c => c.q === q); if (it) { code = cc; break; } }
        if (!it) { const idx = await once('cht:index', () => CT.loadIndex()); for (const cc of Object.keys(idx?.countries || {})) { const f = await once(`cht:${cc}`, () => CT.loadCountry(cc)); it = f?.items?.find(c => c.q === q); if (it) { code = cc; break; } } }
        if (it && card.isConnected) where.insertAdjacentHTML('beforeend', ` · ${makeBtn(siteFromCastle(it, code))}`);
    }

    /* ─────────── le tout : un seul observateur ─────────── */
    let pending = 0;
    if (typeof MutationObserver !== 'undefined' && root.document) new MutationObserver(() => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            decorateVillage().catch(report);
            if (on('castle') && !kiosk()) document.querySelectorAll('dialog.cht-dlg .cht-card:not([data-fe])').forEach(c => decorateCastleCard(c).catch(report));
        });
    }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 🗺 la Carte : les édifices qui ont une fiche, mis en avant ─────────── */
    let mapSites = null;
    for (const k of ['mapSetup', 'mapDraw']) ext[k] = ext[k] || [];
    const chtOn = () => { try { return !!JSON.parse(localStorage.getItem('genealogie-chateaux-territoires') || '{}').castles; } catch (_) { return false; } };
    ext.mapSetup.push(() => {
        const stage = document.getElementById('map-stage'); if (!stage || document.getElementById('fe-layer')) return;
        const layer = document.createElement('div'); layer.id = 'fe-layer'; layer.className = 'fe-layer'; layer.innerHTML = '<svg aria-hidden="true"></svg>';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        allSites(true).then(l => { mapSites = l.filter(x => x.lat != null); A().drawMap?.(); });
        stage.addEventListener('click', e => {
            if (!on('map') || !chtOn() || !layer.__pts) return;
            const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
            const hit = layer.__pts.find(p => Math.hypot(p.x - x, p.y - y) < 12); if (hit) { e.stopPropagation(); open(hit.id); }
        }, true);
    });
    ext.mapDraw.push(({left, top, z, width, height}) => {
        const layer = document.getElementById('fe-layer'); if (!layer) return;
        const svg = layer.querySelector('svg'); layer.__pts = [];
        if (!on('map') || !chtOn() || !mapSites?.length || z < 8) { svg.innerHTML = ''; return; }
        const out = [];
        for (const x of mapSites) {
            const px = A().lngToX(x.lon, z) - left, py = A().latToY(x.lat, z) - top; if (px < -10 || py < -10 || px > width + 10 || py > height + 10) continue;
            layer.__pts.push({x: px, y: py, id: x.id});
            out.push(`<g class="fe-mk"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="12"></circle><text x="${px.toFixed(0)}" y="${(py + 5).toFixed(0)}">${iconOf(x.kind)}<title>${esc(`${x.name} — ${T('a une fiche')}`)}</title></text></g>`);
        }
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.innerHTML = out.join('');
    });

    /* ─────────── 📜 monographie, 📋 listes, 🧰 données à la demande, 🗺 calques ─────────── */
    (ext.monographSections = ext.monographSections || []).push({id: 'edifices', icon: '🏰⛪', label: 'Les édifices de la commune', group: 'Le lieu', defaultOn: true, enabled: () => on('place'),
        source: 'Tes fiches · Wikidata (CC0) · Mérimée (Licence Ouverte)',
        render: async (place, host, ctx) => {
            let pl = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon};
            if (!insOf(pl) && ctx?.village) { try { const v = await ctx.village(); if (v?.insee) pl = {...pl, insee: v.insee}; } catch (_) {} }
            return placeInto(host, pl, {online: false});
        }});
    const rowOf = x => ({...x, kind_label: kindLabel(x.kind), group_label: x.group === 'castle' ? T('château') : T('lieu de culte'), commune: x.place_name || x.commune, from: x.built_from, to: x.gone_year,
        state_label: x.state ? T(STATES[x.state]) : '', cult_label: x.cult ? T(CULTS[x.cult]) : '', wd: wdUrl(x.wikidata), mh: popUrl(x.merimee), wp: x.wikipedia});
    (ext.dataLists = ext.dataLists || []).push({id: 'fiches_edifices', icon: '🏰⛪', label: T('Mes fiches d’édifices (châteaux, lieux de culte)'), group: 'Le lieu', source: T('Tes fiches ; Wikidata (CC0) ; Mérimée (Licence Ouverte)'), sourceUrl: 'https://www.wikidata.org/',
        load: async () => (await allSites(true)).map(rowOf),
        fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind_label', label: T('Sorte'), type: 'enum', values: Object.values(KINDS).map(k => T(k[1]))}, {key: 'group_label', label: T('Château ou lieu de culte'), type: 'enum', values: [T('château'), T('lieu de culte')]},
            {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'from', label: T('Construit'), type: 'year'}, {key: 'to', label: T('Disparu en'), type: 'year'}, {key: 'state_label', label: T('État'), type: 'enum', values: Object.values(STATES).map(x => T(x))},
            {key: 'cult_label', label: T('Culte'), type: 'enum'}, {key: 'patron_saint', label: T('Saint patron'), type: 'text'}, {key: 'n_events', label: T('Actes de ta famille'), type: 'number'}, {key: 'n_people', label: T('Personnes'), type: 'number'},
            {key: 'wd', label: T('Wikidata'), type: 'url'}, {key: 'mh', label: T('Mérimée'), type: 'url'}, {key: 'wp', label: T('Wikipédia'), type: 'url'}],
        period: r => [r.built_from, r.gone_year], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => open(r.id), enabled: () => true});
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const emptyLine = (t, icon = '🏰') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'edifices_lieu', icon: '🏰⛪', label: T('Les édifices de la commune (châteaux, lieux de culte)'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const p = placeOfCtx(ctx.place); if (!p) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; } const ok = await placeInto(host, p, {detached: true}); if (!ok) host.innerHTML = emptyLine(T('Aucun château ni lieu de culte connu pour cette commune.')); return ok; }},
        {id: 'edifices_personne', icon: '🏰⛪', label: T('Ses châteaux et lieux de culte (rôles, actes reliés)'), group: 'La personne', needs: ['person'], installed: () => true,
            run: async (ctx, host) => {
                const id = Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0; if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.'), '👤'); return null; }
                const D = await get('ed_person', {id}).catch(() => null); const ev = Object.values(D?.events || {});
                const byS = new Map(); ev.forEach(l => byS.set(l.site_id, l));
                host.innerHTML = D && (D.roles.length || byS.size) ? `<div></div>${byS.size ? `<p>${esc(T('Ses actes reliés à un édifice :'))}</p><ul class="fe-l">${[...byS.values()].map(l => `<li><button type="button" class="link-button fe-who" data-fe-open="${l.site_id}">${iconOf(l.kind)} ${esc(l.name)}</button></li>`).join('')}</ul>` : ''}` : emptyLine(T('Aucun édifice relié à cette personne.'));
                if (D?.roles.length) rolesInto(host.firstElementChild, D.roles);
                return !!D;
            }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push({id: 'fe_sites', icon: '🏰⛪', label: T('Mes fiches d’édifices'), group: 'Le lieu', kind: 'points', source: T('Tes fiches d’édifices'),
        run: async ({q, from, to, bbox, max = 3000}) => {
            const list = (await allSites()).filter(x => x.lat != null && (!bbox || (x.lon >= bbox[0] && x.lon <= bbox[2] && x.lat >= bbox[1] && x.lat <= bbox[3])) && (!q || fold(x.name).includes(fold(q)))
                && (from == null || x.gone_year == null || x.gone_year >= from) && (to == null || x.built_from == null || x.built_from <= to));
            return {features: list.slice(0, max).map(x => ({type: 'pt', lat: x.lat, lon: x.lon, label: x.name})), source: T('Tes fiches d’édifices')};
        }});

    /* ─────────── ⚙️ Réglages → 🏰⛪ Fiches des édifices ─────────── */
    async function drawMine(host) {
        const list = await allSites(true);
        host.innerHTML = list.length ? `<ul class="fe-l">${list.map(siteLi).join('')}</ul>` : `<p class="muted">${esc(T('Aucune fiche pour l’instant. Elles se font depuis la fiche d’un village, la monographie, la petite fiche d’un château, ou un acte (« 🔗 Relier à une fiche ? »).'))}</p>`;
    }
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-fe-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        ws.innerHTML = `<section class="page cplus-settings fe-settings" data-fe-settings>${UI().pageHeader ? UI().pageHeader({title: T('Fiches des édifices'), icon: '🏰⛪', where: T('Réglages · Données'), help: esc(T('Une fiche pour un château ou un lieu de culte : son histoire, ses seigneurs ou ses curés, les actes de ta famille qui s’y sont passés, ses registres, ses objets, ses sources.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Mes fiches'))}</h3><div data-fe-settings-list></div>${kiosk() ? '' : `<p><button type="button" class="button small" data-fe-new="">${esc(T('＋ Nouvelle fiche'))}</button></p>`}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><p class="muted">${esc(T('Les fiches sont dans ta généalogie (sauvegardes et copies comme le reste). Ce qui vient d’ailleurs n’est pas recopié sans ton clic : Wikidata (CC0), Mérimée et Palissy (Ministère de la Culture, Licence Ouverte), images de Wikimedia Commons (licence sur la page de chaque image), territoires d’autrefois (Wikidata, historical-basemaps). Chaque fait porte son lien « ↗ source ».'))}</p></div></section>`;
        drawMine(ws.querySelector('[data-fe-settings-list]'));
    }
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-fe-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.feTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s); redrawAll();
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); redrawAll(); }});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'chateaux_territoires'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { let i = B.findIndex(b => b[0] === 'l8c_village'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, [...BLOCK]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '6';
        return !!tabs;
    }
    if (!register() && root.document) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.ficheEdifice = {...core, open, create, remove, placeInto, settings, allSites, newSite: newSiteDialog, decoratePerson, drawSettings,
        openSettings: () => { const st = S(); st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
