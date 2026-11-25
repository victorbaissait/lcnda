/* LCNDA — 👤 Listes → Données : les noms propres d'une liste (maires, préfets, évêques, seigneurs, Morts pour la France, Léonore,
 * annuaires, décès INSEE, auteurs…) reliés aux fiches de la base.
 *
 *  1. Dans le tableau, la case du nom reçoit une petite pastille quand la base a une fiche probable (même nom et prénom, accents
 *     et particules ignorés, variantes de nom ; plus sûr si même commune, même département, années compatibles) :
 *     « 👤 dans ta base : Jean MAZAUD (1781–1850) » (un clic ouvre la fiche), « 👤 2 possibles », ou « 🔗 Jean MAZAUD » (relié).
 *  2. 🔗 (au survol, au clavier, toujours visible sur écran tactile) : « 🔗 Relier à une fiche… » (le menu de choix des personnes,
 *     le nom déjà tapé), « ＋ Créer une fiche » (nom, et le rôle en événement : « Maire d’Ailleville (2014–2020) », cité avec la
 *     source de la liste et son lien ↗), « ✓ C'est bien lui », « ✗ Ce n'est pas lui » (retenu). Chaque fois ↶ Annuler.
 *  3. Le lien est gardé dans la base (table list_person_links, lib/listes_personnes.php) ; la fiche reçoit la source (titre de la
 *     liste, rôle, source et licence, ↗ lien) et « 🔎 Ce qui le concerne » montre la ligne (LCNDA_EXT.dataSources, id lpers_liens : lp_liens).
 *  4. Filtre « 👤 Seulement les noms présents dans ma base » : calculé ici, sur cet ordinateur (listes « load » : toutes les lignes ;
 *     listes du serveur de l'app : jusqu'à 10 000 lignes lues ; pas pour les listes en ligne).
 *  5. Rien ne part sur Internet : la base est lue une fois (lp_index), la comparaison se fait dans la page. Fiches confidentielles :
 *     pas de nom ni d'années dans la pastille ; personnes vivantes : pas d'années ; en consultation, ni l'une ni l'autre n'est proposée.
 *
 * Une liste se déclare « de personnes » par un champ {key, …, person: true} (+ facultatif sur la liste : personMatch {born, died,
 * period, place, role, event}). Les listes déjà dans l'app sont décrites dans CONF plus bas (le drapeau person est posé ici).
 * Branché par app-listes-donnees.js : ext.listesPersonnes.{listBar, chip, fetchPage, rowsPainted}. Essai : tests/test-listes-personnes.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/æ/g, 'ae').replace(/œ/g, 'oe');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const api = (a, q = {}) => A().api(a, q);
    const post = b => A().api('lp_write', {}, {method: 'POST', body: b}).then(r => { const x = r?.result || r; if (x?.error) throw new Error(x.error); return x; });
    const yr = v => { const m = String(v ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; };
    const isFr = () => !window.LCNDA_I18N || !window.LCNDA_I18N.lang || window.LCNDA_I18N.lang === 'fr';
    /** « Maire de Ailleville » → « Maire d’Ailleville » (en français seulement) */
    const elide = s => (isFr() ? String(s).replace(/\bde ([AEIOUYÂÀÉÈÊÎÏÔÛaeiouyâàéèêîïôû])/g, 'd’$1').replace(/\bde le /g, 'du ').replace(/\bde les /g, 'des ') : String(s));
    const span = (a, b) => { a = yr(a); b = yr(b); return a && b && a !== b ? `${a}–${b}` : a ? (b === a ? String(a) : `${a}–`) : b ? `–${b}` : ''; };
    const dateText = (a, b) => { a = yr(a); b = yr(b); return a && b && a !== b ? `de ${a} à ${b}` : a ? String(a) : b ? String(b) : ''; };
    const depOf = insee => (/^97/.test(insee || '') ? String(insee).slice(0, 3) : String(insee || '').slice(0, 2));

    /* ═════════════ les listes de personnes (celles de l'app) ═════════════
       name : le champ du nom complet (« Jean Mazaud ») ; ou last + first : nom et prénoms séparés (la pastille va dans « last »).
       also : d'autres champs de noms (auteurs…, plusieurs noms possibles : « A et B »).
       born / died (année), period → [de, à] (le rôle), place → {insee, name, dep}, role → le texte du rôle, event → {tags, slugs, …},
       scan : false = pas de filtre « dans ma base » (liste en ligne). */
    const placeOf = (insee, name, dep) => ({insee: /^\d[\dAB]\d{3}$/.test(String(insee || '')) ? String(insee) : '', name: name || '', dep: dep || ''});
    const occ = (title, r, extra = {}) => ({tags: ['OCCU'], title, ...extra});
    const CONF = {
        dp_maires: {name: 'name', period: r => [r.from, r.to], place: r => placeOf(r.insee, r.commune, r.depName), role: r => elide(T('Maire de {c}', {c: r.commune || '?'})),
            event: (r, role) => occ(role, r, {place_insee: r.insee, place_name: r.commune})},
        dp_prefets: {name: 'name', period: r => [r.from, r.to], place: r => placeOf('', '', r.depName), role: r => (r.depName ? `${T(r.post || 'Préfet')} (${r.depName})` : T(r.post || 'Préfet'))},
        dp_eveques: {name: 'name', period: r => [r.from, r.to], role: r => T('Évêque ({d})', {d: r.diocese || '?'}), event: (r, role) => occ(role, r, {tags: ['OCCU', 'ORDN']})},
        dp_chefs_etat: {name: 'name', period: r => [r.from, r.to], role: r => `${r.title || T('Chef de l’État')} (${r.country || ''})`.replace(/ \(\)$/, '')},
        l8c_seigneurs: {name: 'name', period: r => [r.from, r.to], place: r => placeOf('', r.commune), role: r => elide(`${r.title || T('Seigneur')} de ${r.commune || '?'}`.replace(/^(\S+) de \1\b/, '$1')),
            event: (r, role) => occ(role, r, {place_name: r.commune})},
        bo_mpf: {last: 'nom', first: 'prenoms', born: r => r.year, died: r => yr(r.deces), place: r => placeOf('', r.lieu, r.dep), role: () => T('Mort pour la France'),
            event: (r, role) => ({tags: ['DEAT'], title: role, date_text: String(r.deces || ''), place_name: r.lieu_deces || '', description: [r.grade, r.unite].filter(Boolean).join(', ')}), dated: false},
        bo_leonore: {last: 'nom', first: 'prenoms', born: r => r.year, place: r => placeOf('', r.lieu, r.dep), role: () => T('Légion d’honneur (dossier Léonore)'),
            event: (r, role) => ({slugs: ['decoration'], tags: ['MIAW', 'OCCU'], title: role, description: r.cote ? `${T('Cote')} ${r.cote}` : ''}), dated: false},
        insee_deces: {last: 'nom', first: 'prenoms', born: r => yr(r.naissance), died: r => r.annee || yr(r.deces), place: r => placeOf(r.code_deces, r.commune_deces), role: () => T('Décès (fichier INSEE)'),
            event: (r, role) => ({tags: ['DEAT'], title: role, date_text: String(r.deces || ''), place_insee: r.code_deces, place_name: r.commune_deces}), dated: false},
        ba_annuaires: {name: 'name', period: r => [r.year, r.year], place: () => placeOf('75056', 'Paris', 'Paris'), role: r => [r.act, r.address].filter(Boolean).join(', ') || T('Dans l’annuaire du commerce de Paris'),
            event: (r, role) => ({tags: ['OCCU'], title: role, place_name: 'Paris'})},
        pm_ecoles: {name: 'name', born: r => r.naissance, period: r => [r.entree, r.entree], place: r => placeOf('', r.lieu), role: r => T('Élève : {e}', {e: r.ecole || '?'}), event: (r, role) => ({tags: ['EDUC'], title: role})},
        wikidata_personnes: {name: 'name', born: r => r.born, died: r => r.died, place: r => placeOf('', r.place), role: r => r.occupation || T('Personne connue de Wikidata'), scan: false},
        l9_sejours: {name: 'name', period: r => [r.from, r.to], place: r => placeOf('', r.commune), role: r => elide(T('Séjour à {c}', {c: r.commune || r.where || '?'})), event: (r, role) => ({tags: ['RESI'], title: role, place_name: r.commune})},
        /* les auteurs, artistes, photographes… (plusieurs noms possibles dans la case) */
        et_livres: {also: ['author'], period: r => [r.year, r.year], role: r => T('Auteur de « {t} »', {t: r.title || '?'}), dated: true},
        cc_oeuvres: {also: ['by'], period: r => [r.year, r.year], place: r => placeOf('', r.commune), role: r => T('Auteur de « {t} »', {t: r.title || '?'})},
        l8c_spectacles: {also: ['by'], period: r => [r.year, r.year], role: r => T('Auteur de « {t} »', {t: r.title || '?'})},
        l10v_tableaux: {also: ['author'], period: r => [yr(r.from || r.date), yr(r.from || r.date)], place: r => placeOf('', r.commune), role: r => T('Peintre de « {t} »', {t: r.title || '?'})},
        l10v_photos: {also: ['author'], period: r => [yr(r.from || r.date), yr(r.from || r.date)], place: r => placeOf('', r.commune), role: r => T('Photographe de « {t} »', {t: r.title || '?'})},
        cplus_images: {also: ['author'], period: r => [r.year, r.year], place: r => placeOf('', r.commune), role: r => T('Auteur de « {t} »', {t: r.title || '?'})},
        pm_monuments: {also: ['sculpteur'], period: r => [r.annee, r.annee], place: r => placeOf(r.insee, r.commune), role: r => elide(T('Sculpteur du monument aux morts de {c}', {c: r.commune || '?'}))},
        l10o_contes: {also: ['who'], period: r => [r.year, r.year], place: r => placeOf('', r.commune), role: r => T('Folkloriste : « {t} »', {t: r.name || '?'})},
        l9a_chansons: {also: ['authors'], period: r => [r.year, r.year], role: r => T('Auteur de « {t} »', {t: r.name || '?'})},
        l9a_sons: {also: ['who'], period: r => [r.year, r.year], role: r => T('Interprète de « {t} »', {t: r.name || '?'})},
        l10r_ecritures: {also: ['who'], period: r => [r.year, r.year], role: r => T('Maître écrivain : « {t} »', {t: r.what || '?'})},
        l9_sommets: {also: ['who'], period: r => [r.year, r.year], role: r => T('Première ascension : {t}', {t: r.name || '?'})},
    };
    const ONLINE_LISTS = new Set(['wikidata_personnes']);
    /** la description d'une liste : CONF, ou ce que la liste déclare (champs person: true, personMatch) ; null = pas une liste de personnes */
    function confOf(d) {
        if (!d?.id) return null;
        if (d.__lp !== undefined) return d.__lp;
        let c = CONF[d.id] ? {...CONF[d.id]} : null;
        const flagged = (d.fields || []).filter(f => f.person);
        if (!c && flagged.length) c = {...(d.personMatch || {}), name: flagged[0].key, also: flagged.slice(1).map(f => f.key)};
        if (c) {
            const keys = [c.name, c.last, ...(c.also || [])].filter(Boolean);
            (d.fields || []).forEach(f => { if (keys.includes(f.key)) f.person = true; }); // 👤 le drapeau sur le champ
            if (c.period === undefined && d.period) c.period = d.period;
            if (c.scan === undefined) c.scan = !ONLINE_LISTS.has(d.id) && d.online !== true;
        }
        try { Object.defineProperty(d, '__lp', {value: c, configurable: true, writable: true}); } catch (_) {}
        return c;
    }
    const cellKeys = c => [c.name || c.last, ...(c.also || [])].filter(Boolean);

    /* ═════════════ la base, en bref (une fois ; relue après une écriture) ═════════════ */
    const PART = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'della', 'dos', 'das', 'ten', 'ter', 'zu']);
    const TITLES = new Set(['mgr', 'monseigneur', 'mme', 'madame', 'mlle', 'm', 'mr', 'monsieur', 'abbe', 'saint', 'sainte', 'st', 'ste', 'general', 'gal', 'comte', 'comtesse', 'baron', 'baronne', 'marquis', 'marquise',
        'duc', 'duchesse', 'vicomte', 'vicomtesse', 'chevalier', 'messire', 'sieur', 'sir', 'dr', 'docteur', 'pere', 'frere', 'soeur', 'cardinal', 'veuve', 'vve', 'vv', 'fils', 'freres', 'cie', 'compagnie', 'jeune', 'aine', 'cadet', 'pere', 'et', 'ainé', 'maitre', 'me', 'dom', 'prince', 'princesse', 'roi', 'reine']);
    const toks = s => fold(s).replace(/['’.]/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
    const surKey = s => { const t = toks(s).filter(x => !/^\d+$/.test(x)); while (t.length > 1 && PART.has(t[0])) t.shift(); return t.join('').replace(/(.)\1+/g, '$1'); };
    let IDX = null, idxAt = 0, idxP = null;
    function buildIndex(r) {
        const bySur = new Map(), people = new Map();
        const add = (key, p, first) => { if (!key || key.length < 2) return; let l = bySur.get(key); if (!l) bySur.set(key, l = []); if (!l.some(x => x.p === p && x.fk.join() === first.join())) l.push({p, fk: first}); };
        for (const [id, f, l, b, dd, lo, hi, flags, pl] of r.people || []) {
            const p = {id, first: f, last: l, by: b, dy: dd, lo, hi, flags, pl: pl || [], fk: toks(f)};
            people.set(id, p); add(surKey(l), p, p.fk);
        }
        for (const [id, f, l] of r.variants || []) { const p = people.get(id); if (p) add(surKey(l || p.last), p, f ? toks(f) : p.fk); }
        return {v: r.v, bySur, people, n: people.size};
    }
    async function loadIndex(force = false) {
        if (!force && IDX && Date.now() - idxAt < 120000) return IDX;
        if (!force && idxP) return idxP;
        idxP = api('lp_index').then(r => { IDX = buildIndex(r || {}); idxAt = Date.now(); memo = new WeakMap(); return IDX; }).catch(() => (IDX = IDX || buildIndex({}))).finally(() => { idxP = null; });
        return idxP;
    }

    /* ═════════════ les liens et les « ce n'est pas lui » d'une liste ═════════════ */
    const LINKS = new Map(); // list id → {byKey: Map(rowKey → {yes: [link], no: Map(pid → link)}), at}
    async function loadLinks(listId, force = false) {
        const c = LINKS.get(listId); if (c && !force && Date.now() - c.at < 60000) return c;
        let r = {links: []}; try { r = await api('lp_links', {list: listId}); } catch (_) {}
        const byKey = new Map();
        for (const l of r.links || []) { let e = byKey.get(l.row_key); if (!e) byKey.set(l.row_key, e = {yes: [], no: new Map()}); if (l.verdict === 'no') e.no.set(l.person_id, l); else e.yes.push(l); }
        const out = {byKey, at: Date.now()}; LINKS.set(listId, out); memo = new WeakMap(); return out;
    }
    let hashCache = new WeakMap();
    const djb = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    /** la clé durable d'une ligne : le nom + une empreinte de toute la ligne */
    function rowKey(d, row, c = confOf(d)) {
        let k = hashCache.get(row); if (k) return k;
        if (row.id != null && row.id !== '' && d.id.startsWith('bo_')) k = `id:${row.id}`;
        else { const vals = (d.fields || []).map(f => row[f.key] ?? '').join('|'); k = `${keyName(row[c?.name || c?.last || (c?.also || [])[0]])}#${djb(fold(vals))}`; }
        hashCache.set(row, k); return k;
    }

    /* ═════════════ reconnaître un nom ═════════════ */
    /** « Jean Mazaud », « MAZAUD (J.) », « Mazaud, épicier », « Charles de Gaulle » → [{first: [...], last, w}] (w : un petit malus) */
    function parseName(s) {
        const raw = String(s ?? '').trim(); if (!raw) return [];
        const paren = (raw.match(/\(([^)]*)\)/) || [])[1] || '';
        let main = raw.replace(/\([^)]*\)/g, ' '), tail = '';
        const ci = main.indexOf(','); if (ci >= 0) { tail = main.slice(ci + 1); main = main.slice(0, ci); }
        const words = main.replace(/[’']/g, '’ ').split(/\s+/).map(w => w.replace(/^[^\p{L}]+|[^\p{L}’]+$/gu, '')).filter(Boolean).filter(w => !TITLES.has(fold(w).replace(/[’.]/g, '')));
        if (!words.length) return [];
        const extra = [paren, tail].map(x => toks(x).filter(t => !TITLES.has(t))).find(x => x.length && x.length <= 3) || [];
        const up = w => w.length > 1 && w === w.toUpperCase() && /\p{Lu}/u.test(w);
        const out = [];
        const allUp = words.every(up), ups = words.filter(up);
        if (ups.length && !allUp) out.push({first: toks(words.filter(w => !up(w)).join(' ')), last: ups.join(' '), w: 0});
        if (words.length === 1 || allUp) out.push({first: extra, last: words.join(' '), w: extra.length ? 0 : 0});
        for (let k = words.length - 1; k >= 1; k--) { if (PART.has(fold(words[k - 1]).replace('’', '')) && k - 1 >= 1) continue; out.push({first: toks(words.slice(0, k).join(' ')), last: words.slice(k).join(' '), w: k === words.length - 1 ? 0 : 3}); }
        if (words.length === 2 && !ups.length) out.push({first: toks(words[1]), last: words[0], w: 6}); // « Mazaud Jean »
        return out;
    }
    const splitNames = s => String(s ?? '').split(/\s*(?:;|\s&\s|\set\s|\sand\s|\sund\s|,\s(?=\p{Lu}\p{Ll}+\s\p{Lu}))\s*/u).map(x => x.trim()).filter(Boolean).slice(0, 4);
    function firstScore(rf, pf) {
        if (!rf.length) return 25;
        if (!pf.length) return 25;
        if (rf[0] === pf[0]) return 50;
        if (rf.some(t => t.length > 1 && pf.includes(t))) return 42;
        if (rf[0].length === 1 && pf[0][0] === rf[0]) return 38;
        const j = x => x.join(''); if (j(rf) === j(pf)) return 48; // « jean baptiste » / « jean-baptiste »
        return 0;
    }
    /** le contexte de la ligne (années, lieu) → bonus ou refus (null) */
    function contextScore(p, ctx) {
        let s = 0;
        if (ctx.born) { if (p.by) { const g = Math.abs(p.by - ctx.born); if (g <= 1) s += 30; else if (g <= 3) s += 10; else return null; } else if (p.lo && p.lo < ctx.born - 1) return null; }
        if (ctx.died) { if (p.dy) { const g = Math.abs(p.dy - ctx.died); if (g <= 1) s += 25; else if (g <= 3) s += 5; else return null; } }
        if (ctx.from || ctx.to) {
            const a = ctx.from || ctx.to, b = ctx.to || ctx.from;
            if (p.by && a < p.by + (ctx.dated ? 5 : 12)) return null;
            if (p.dy && a > p.dy + 1) return null;
            if (p.by && b > p.by + 110) return null;
            if (p.by || p.dy) s += 15; else if (p.lo && p.hi && a >= p.lo - 70 && a <= p.hi + 70) s += 5; else if (p.lo && (a < p.lo - 90 || a > p.hi + 90)) return null;
        }
        const pl = ctx.place;
        if (pl && p.pl.length) {
            const nm = fold(pl.name || '').replace(/[^a-z0-9]+/g, ' ').trim(), dep = fold(pl.dep || '').replace(/[^a-z0-9]+/g, ' ').trim();
            if (pl.insee && p.pl.some(x => x[0] === pl.insee)) s += 20;
            else if (nm && p.pl.some(x => x[1] === nm)) s += 18;
            else if ((pl.insee && p.pl.some(x => x[0] && depOf(x[0]) === depOf(pl.insee))) || (dep && p.pl.some(x => x[2] === dep))) s += 8;
        }
        return s;
    }
    let memo = new WeakMap(); // ligne → résultat (relu quand la base ou les liens changent)
    const NONE = Object.freeze({cells: {}, any: false, key: ''});
    const ffold = s => { s = String(s ?? '').toLowerCase(); return /[^\x00-\x7f]/.test(s) ? s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/œ/g, 'oe') : s; };
    const keyName = (nm) => fold(String(nm ?? '').slice(0, 60)).replace(/\s+/g, ' ').trim();
    /** vite : un nom de famille de la base dans la case ? (ou la ligne a-t-elle un lien, un « pas lui » ?) */
    function quickHit(d, row, c) {
        const L = LINKS.get(d.id);
        if (L?.byKey.size) { if (!L.names) L.names = new Set([...L.byKey.keys()].map(k => k.split('#')[0])); if (L.names.has(keyName(row[c.name || c.last || (c.also || [])[0]])) || (row.id != null && L.names.has(`id:${row.id}`))) return true; }
        for (const k of cellKeys(c)) {
            const v = row[k]; if (v == null || v === '') continue;
            const t = ffold(v).split(/[^a-z0-9]+/).filter(Boolean);
            for (let i = 0; i < t.length; i++) { let j = ''; for (let e = i; e < t.length; e++) { j += t[e]; if (IDX.bySur.has(j.replace(/(.)\1+/g, '$1'))) return true; } }
        }
        return false;
    }
    /** pour une ligne : {cells: {champ: {cands: [{p, score}], linked: [link], key}}, any} */
    function matchRow(d, row) {
        const c = confOf(d); if (!c || !IDX) return null;
        const m = memo.get(row); if (m) return m;
        if (!quickHit(d, row, c)) { memo.set(row, NONE); return NONE; } // la plupart des lignes : aucun nom de la base, rien de relié
        const key = rowKey(d, row, c), L = LINKS.get(d.id)?.byKey.get(key);
        const per = c.period ? (() => { try { return c.period(row) || []; } catch (_) { return []; } })() : [];
        const ctx = {born: yr(c.born?.(row)), died: yr(c.died?.(row)), from: yr(per[0]), to: yr(per[1]), place: c.place ? c.place(row) : null, dated: !!c.dated};
        const cells = {}; let any = false;
        for (const k of cellKeys(c)) {
            const names = k === c.last ? [{last: row[c.last], first: row[c.first]}] : (k === c.name ? [row[k]] : splitNames(row[k]));
            const best = new Map();
            for (const nm of names) {
                const cands = typeof nm === 'object' ? [{first: toks(nm.first), last: String(nm.last ?? ''), w: 0}] : parseName(nm);
                for (const cd of cands) {
                    const hits = IDX.bySur.get(surKey(cd.last)); if (!hits) continue;
                    for (const h of hits) {
                        const f = firstScore(cd.first, h.fk); if (!f) continue;
                        const cx = contextScore(h.p, ctx); if (cx === null) continue;
                        const sc = f + cx - cd.w; if (sc < 45) continue;
                        if (L?.no.has(h.p.id)) continue;
                        if ((best.get(h.p.id)?.score || 0) < sc) best.set(h.p.id, {p: h.p, score: sc});
                    }
                }
            }
            let cands = [...best.values()].sort((a, b) => b.score - a.score);
            if (cands.length > 1 && cands[0].score - cands[1].score >= 20) cands = [cands[0]];
            const linked = k === (c.name || c.last) ? (L?.yes || []).filter(l => IDX.people.has(l.person_id) || l.name) : [];
            if (cands.length || linked.length) any = true;
            cells[k] = {cands, linked, key};
        }
        const out = {cells, any, key};
        memo.set(row, out); return out;
    }

    /* ═════════════ la pastille ═════════════ */
    const lifeOf = p => (p.flags & 2 ? '' : span(p.by, p.dy));
    const nameOf = p => (p.flags & 1 ? T('une fiche confidentielle') : `${p.first || ''} ${p.last || ''}`.trim() || T('Sans nom'));
    const fullOf = p => { const n = nameOf(p), y = p.flags & 1 ? '' : lifeOf(p); return y ? `${n} (${y})` : n; };
    function chipHtml(i, k, cell) {
        if (cell.linked.length) {
            const l = cell.linked[0], p = IDX.people.get(l.person_id), nm = p ? nameOf(p) : (l.flags & 1 ? T('une fiche confidentielle') : l.name);
            return `<button type="button" class="lp-chip is-linked" data-lp-open="${l.person_id}" title="${esc(T('Relié à cette fiche : un clic l’ouvre'))}">🔗 ${esc(nm)}${cell.linked.length > 1 ? ` +${cell.linked.length - 1}` : ''}</button>`;
        }
        if (cell.cands.length === 1) { const p = cell.cands[0].p; return `<button type="button" class="lp-chip" data-lp-open="${p.id}" title="${esc(T('Peut-être la même personne : un clic ouvre la fiche'))}">👤 ${esc(T('dans ta base : {p}', {p: fullOf(p)}))}</button>`; }
        if (cell.cands.length > 1) return `<button type="button" class="lp-chip is-many" data-lp-many="${i}" data-lp-k="${esc(k)}" aria-haspopup="true">👤 ${esc(T('{n} possibles', {n: cell.cands.length}))}</button>`;
        return '';
    }
    async function rowsPainted(res, rows, {d} = {}) {
        const c = confOf(d); if (!c || !res) return;
        const table = res.querySelector('.ld-table'); if (!table) return;
        table.dataset.lpList = d.id;
        await Promise.all([loadIndex(), loadLinks(d.id)]);
        if (!table.isConnected) return;
        const heads = [...table.querySelectorAll('thead th')].map(th => th.querySelector('[data-ld-sort]')?.dataset.ldSort || '');
        const keys = cellKeys(c), ro = kiosk();
        table.querySelectorAll('tbody tr[data-ld-row]').forEach(tr => {
            const i = Number(tr.dataset.ldRow), row = rows[i]; if (!row) return;
            const m = matchRow(d, row); if (!m) return;
            for (const k of keys) {
                const col = heads.indexOf(k); if (col < 0) continue;
                const td = tr.children[col]; if (!td || td.querySelector('.lp-cell')) continue;
                if (row[k] == null || row[k] === '') continue;
                const cell = m.cells[k] || {cands: [], linked: []};
                const box = document.createElement('span'); box.className = 'lp-cell';
                box.innerHTML = `${chipHtml(i, k, cell)}${ro ? '' : `<button type="button" class="lp-act" data-lp-menu="${i}" data-lp-k="${esc(k)}" aria-haspopup="true" title="${esc(T('Relier à une fiche…'))}" aria-label="${esc(T('Relier « {n} » à une fiche…', {n: String(row[k]).slice(0, 60)}))}">🔗</button>`}`;
                td.appendChild(box); td.classList.add('lp-td');
            }
        });
    }
    const refreshTable = () => { const res = document.querySelector('.ld-page [data-ld-results]'), d = curList(), rows = lastRows; if (res && d) { res.querySelectorAll('.lp-cell').forEach(x => x.remove()); rowsPainted(res, rows, {d}); } };
    let lastRows = [], lastD = null;
    const curList = () => lastD;

    /* ═════════════ les actions ═════════════ */
    function rowText(d, row) { return (d.fields || []).filter(f => f.type !== 'url' && f.type !== 'image' && row[f.key] != null && row[f.key] !== '').map(f => `${T(f.label)} : ${row[f.key]}`).join(' · ').slice(0, 1500); }
    const rowUrl = (d, row) => { const u = (d.fields || []).filter(f => f.type === 'url').map(f => row[f.key]).find(v => /^https?:\/\//.test(String(v || ''))); return u || d.sourceUrl || ''; };
    const licenceOf = d => d.licence || ((String(d.source || '').match(/\(([^()]*(?:CC|Licence|ODbL|domaine public|Etalab|0\.|BY)[^()]*)\)\s*$/i) || [])[1] || '');
    function roleOf(d, row, c = confOf(d)) {
        let r = ''; try { r = c.role ? c.role(row) : ''; } catch (_) {}
        const per = c.period ? (() => { try { return c.period(row) || []; } catch (_) { return []; } })() : [], y = c.dated === false ? '' : span(per[0], per[1]);
        return r && y && !r.includes(y) ? `${r} (${y})` : r;
    }
    function payload(d, row, k, extra = {}) {
        const c = confOf(d);
        return {list: d.id, row_key: rowKey(d, row, c), list_label: T(d.label), role: roleOf(d, row, c), source: d.source || '', licence: licenceOf(d), url: rowUrl(d, row), summary: rowText(d, row), ...extra};
    }
    const after = async (d, newPerson = false, pid = 0) => { if (newPerson) await loadIndex(true); await loadLinks(d.id, true); memo = new WeakMap(); scanCache.clear(); refreshTable(); if (pid) { try { ext.toutSur?.forget?.('lp_liens|p' + pid); } catch (_) {} } };
    async function linkTo(d, row, k, pid, name) {
        let r; try { r = await post({op: 'link', person_id: pid, ...payload(d, row, k)}); } catch (e) { toast(e.message, 'error'); return; }
        await after(d, false, pid);
        const undo = async () => { await post({op: 'unlink', id: r.id}); await after(d, false, pid); };
        A().undoToast ? A().undoToast(T('Relié à {p}, avec la source de la liste', {p: name}), {undo, icon: '🔗'}) : toast(T('Relié à {p}, avec la source de la liste', {p: name}));
    }
    async function pickAndLink(d, row, k) {
        const P = window.LCNDA_PICKER; if (!P?.openPicker) { toast(T('Le menu de choix des personnes n’est pas chargé.'), 'error'); return; }
        const name = String(k === confOf(d).last ? `${row[confOf(d).first] || ''} ${row[k] || ''}` : splitNames(row[k])[0] || row[k] || '').trim();
        const wait = P.openPicker({kind: 'person', title: T('Relier « {n} » à une fiche', {n: name.slice(0, 80)}), allowCreate: false});
        const inp = [...document.querySelectorAll('dialog.pk-dialog')].at(-1)?.querySelector('.pk-search:not([hidden]) .pk-input');
        if (inp) { const q = parseName(name)[0]; inp.value = q ? `${q.last} ${q.first.join(' ')}`.trim().slice(0, 80) : name.slice(0, 80); inp.dispatchEvent(new Event('input', {bubbles: true})); }
        const it = await wait; if (!it?.id) return;
        linkTo(d, row, k, Number(it.id), it.title || it.name || name);
    }
    async function reject(d, row, k, p) {
        let r; try { r = await post({op: 'reject', person_id: p.id, ...payload(d, row, k)}); } catch (e) { toast(e.message, 'error'); return; }
        await after(d);
        const undo = async () => { await post({op: 'unreject', id: r.id}); await after(d); };
        const msg = T('Ce n’est pas {p} : c’est noté, la pastille ne revient pas', {p: nameOf(p)});
        A().undoToast ? A().undoToast(msg, {undo, icon: '🔗'}) : toast(msg);
    }
    async function unlink(d, l) {
        try { await post({op: 'unlink', id: l.id}); } catch (e) { toast(e.message, 'error'); return; }
        await after(d, false, l.person_id);
        const redoP = {...l};
        const undo = async () => { await post({op: 'link', person_id: redoP.person_id, list: redoP.list_id, row_key: redoP.row_key, list_label: redoP.list_label, role: redoP.role, source: redoP.source, licence: redoP.licence, url: redoP.url, summary: redoP.summary}); await after(d); };
        A().undoToast ? A().undoToast(T('Lien retiré'), {undo, icon: '🔗'}) : toast(T('Lien retiré'));
    }
    /** ＋ Créer une fiche : le nom (modifiable), le rôle en événement, la source de la liste */
    function createDialog(d, row, k) {
        const c = confOf(d);
        let first = '', last = '';
        if (k === c.last) { last = String(row[c.last] || ''); first = String(row[c.first] || ''); }
        else { const nm = splitNames(row[k])[0] || String(row[k] || ''); const q = parseName(nm)[0]; if (q) { last = q.last; const ws = nm.replace(/\([^)]*\)|,.*$/g, ' ').trim().split(/\s+/); const lw = toks(q.last); first = ws.filter(w => !lw.includes(fold(w).replace(/[^a-z0-9]/g, '')) && !TITLES.has(fold(w).replace(/[’.]/g, ''))).join(' '); } else last = nm; }
        const lastUp = last.toUpperCase() === last ? last : last.replace(/(^|\s)((?:d’|d'|de |du |des |la |le )*)(\S+)$/i, (m, a, b, w) => `${a}${b}${w.toUpperCase()}`);
        const role = roleOf(d, row, c);
        let ev = null; try { ev = c.event ? c.event(row, role) : role ? occ(role, row) : null; } catch (_) {}
        if (ev) { const per = c.period ? (() => { try { return c.period(row) || []; } catch (_) { return []; } })() : []; if (!ev.date_text && c.dated !== false) ev.date_text = dateText(per[0], per[1]); }
        const url = rowUrl(d, row);
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal lp-create';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">＋ ${esc(T('NOUVELLE FICHE'))}</span><h2>${esc(T('Créer une fiche depuis la liste'))}</h2></div><button type="button" class="icon-button" data-lp-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="modal-body lp-create-body">
              <label>${esc(T('Prénom'))}<input name="first_name" value="${esc(first)}" autocomplete="off"></label>
              <label>${esc(T('Nom'))}<input name="last_name" value="${esc(lastUp)}" autocomplete="off"></label>
              ${ev ? `<label class="lp-create-ev"><input type="checkbox" name="with_event" checked> ${esc(T('Ajouter aussi : {r}', {r: ev.title}))}${ev.date_text ? ` <span class="muted">(${esc(ev.date_text)})</span>` : ''}</label>` : ''}
              <p class="muted lp-create-src"><small>${esc(T('Source citée :'))} ${esc(T(d.label))} — ${esc(d.source || '')}${url ? ` · <a href="${esc(A().safeUrl ? A().safeUrl(url) : url)}" target="_blank" rel="noopener">↗ ${esc(T('la ligne'))}</a>` : ''}</small></p>
            </div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-lp-x>${esc(T('Annuler'))}</button><button type="submit" class="button" data-lp-go>${esc(T('Créer la fiche'))}</button></div></form>`;
        document.body.appendChild(dlg);
        const close = () => { dlg.close(); };
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelectorAll('[data-lp-x]').forEach(b => b.addEventListener('click', close));
        dlg.querySelector('form').addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.target.elements, go = dlg.querySelector('[data-lp-go]');
            const fn = f.first_name.value.trim(), ln = f.last_name.value.trim();
            if (!fn && !ln) { toast(T('Indique au moins un prénom ou un nom'), 'error'); return; }
            go.disabled = true;
            let r; try { r = await post({op: 'create', first_name: fn, last_name: ln, event: ev && f.with_event?.checked ? ev : null, ...payload(d, row, k)}); } catch (x) { go.disabled = false; toast(x.message, 'error'); return; }
            close();
            await after(d, true);
            const undo = async () => { await post({op: 'uncreate', id: r.id}); await after(d, true); };
            A().undoToast ? A().undoToast(T('Fiche créée : {p}', {p: r.name}), {undo, icon: '🔗'}) : toast(T('Fiche créée : {p}', {p: r.name}));
        });
        dlg.showModal();
        dlg.querySelector('input[name="first_name"]')?.focus();
        return dlg;
    }
    const openFiche = pid => { if (!pid) return; A().openPersonById ? A().openPersonById(Number(pid)) : null; };
    function rowMenu(btn, d) {
        const i = Number(btn.dataset.lpMenu ?? btn.dataset.lpMany), k = btn.dataset.lpK, row = lastRows[i]; if (!row) return;
        const m = matchRow(d, row), cell = m?.cells[k] || {cands: [], linked: []}, ro = kiosk();
        const items = [];
        if (btn.dataset.lpMany != null || cell.cands.length > 1) {
            cell.cands.forEach(({p}) => { items.push({icon: '👤', label: fullOf(p), help: T('Ouvrir la fiche'), run: () => openFiche(p.id)}); if (!ro) { items.push({icon: '✓', label: T('C’est bien lui : relier à {p}', {p: nameOf(p)}), run: () => linkTo(d, row, k, p.id, nameOf(p))}); items.push({icon: '✗', label: T('Ce n’est pas {p}', {p: nameOf(p)}), run: () => reject(d, row, k, p)}); } items.push('-'); });
        } else if (cell.cands.length === 1 && !ro) {
            const p = cell.cands[0].p;
            items.push({icon: '✓', label: T('C’est bien lui : relier à {p}', {p: nameOf(p)}), run: () => linkTo(d, row, k, p.id, nameOf(p))});
            items.push({icon: '✗', label: T('Ce n’est pas lui'), help: nameOf(p), run: () => reject(d, row, k, p)});
            items.push('-');
        }
        if (!ro) {
            cell.linked.forEach(l => items.push({icon: '✕', label: T('Délier de {p}', {p: l.flags & 1 ? T('une fiche confidentielle') : l.name}), run: () => unlink(d, l)}));
            items.push({icon: '🔗', label: T('Relier à une fiche…'), run: () => pickAndLink(d, row, k)});
            items.push({icon: '＋', label: T('Créer une fiche'), help: roleOf(d, row) || '', run: () => createDialog(d, row, k)});
        }
        if (UI().menuAt) UI().menuAt(btn, items, {title: String(row[k] ?? '').slice(0, 80)});
    }

    /* ═════════════ le filtre « 👤 Seulement les noms présents dans ma base » ═════════════ */
    const SCAN_MAX = 10000;
    const okRow = (d, r) => { const m = matchRow(d, r); return !!m?.any; };
    const scanCache = new Map();
    async function fetchPage(d, st, offset, limit, inner) {
        const c = confOf(d), plain = {...st, inBase: false};
        if (!c) return inner(plain, offset, limit);
        await Promise.all([loadIndex(), loadLinks(d.id)]);
        if (!d.query) { const all = (await inner(plain, 0, 1)).all || []; const rows = all.filter(r => okRow(d, r)); return {rows: rows.slice(offset, offset + limit), total: rows.length, more: false, all: rows}; }
        if (c.scan === false) return inner(plain, offset, limit);
        const ck = `${d.id}|${JSON.stringify(ext.dataListsEngine?.buildQuery ? ext.dataListsEngine.buildQuery(plain) : plain)}|${IDX?.v}|${LINKS.get(d.id)?.at}`;
        let hit = scanCache.get(ck);
        if (!hit) {
            const got = []; let total = Infinity, read = 0;
            while (read < Math.min(total, SCAN_MAX)) { const pg = await inner(plain, read, 2000); const rows = pg.rows || []; total = Number.isFinite(Number(pg.total)) ? Number(pg.total) : rows.length; if (!rows.length) break; read += rows.length; got.push(...rows.filter(r => okRow(d, r))); if (pg.all) break; }
            hit = {rows: got, truncated: total > SCAN_MAX}; scanCache.clear(); scanCache.set(ck, hit);
        }
        return {rows: hit.rows.slice(offset, offset + limit), total: hit.rows.length, more: hit.truncated, all: hit.rows};
    }
    const LABEL = () => T('👤 Seulement les noms présents dans ma base');
    function chip(d, st) { try { document.querySelector('.ld-page')?.__lpPaint?.(); } catch (_) {} return confOf(d) && st?.inBase ? `<button type="button" class="ui-listbar-chip lp-inbase-chip" data-lp-inbase-off title="${esc(T('Retirer ce critère'))}">${esc(LABEL())} <span aria-hidden="true">×</span></button>` : ''; }
    function listBar(page, ctx) {
        const d = ctx?.d, c = confOf(d); lastD = d; if (!c || !page) return;
        if (!d.query || c.scan !== false) {
            const row = page.querySelector('.ld-bar-row');
            if (row && !row.querySelector('[data-lp-inbase]')) {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-listbar-btn lp-inbase'; b.dataset.lpInbase = '1';
                b.title = T('Seulement les lignes dont un nom est déjà dans ta généalogie (comparé sur cet ordinateur, rien ne part sur Internet)');
                const paint = () => { const on = !!ctx.state()?.inBase; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-active', on); b.textContent = LABEL(); };
                paint(); row.appendChild(b);
                b.addEventListener('click', () => { const st = ctx.state(); st.inBase = !st.inBase; paint(); ctx.rerun(); });
                page.__lpPaint = paint;
            }
        }
        if (!page.__lpBound) {
            page.__lpBound = true;
            page.addEventListener('click', e => {
                let b;
                if ((b = e.target.closest('[data-lp-inbase-off]'))) { const st = ctx.state(); st.inBase = false; page.__lpPaint?.(); ctx.rerun(); return; }
                if ((b = e.target.closest('[data-lp-open]'))) { e.preventDefault(); e.stopPropagation(); openFiche(Number(b.dataset.lpOpen)); return; }
                if ((b = e.target.closest('[data-lp-many], [data-lp-menu]'))) { e.preventDefault(); e.stopPropagation(); rowMenu(b, lastD); }
            }, true);
        }
        loadIndex(); loadLinks(d.id);
    }
    const prevPainted = rowsPainted;
    ext.listesPersonnes = {
        confOf, matchRow, parseName, rowKey, loadIndex, loadLinks, listBar, chip, fetchPage,
        rowsPainted: (res, rows, o) => { lastRows = rows; lastD = o?.d || lastD; return prevPainted(res, rows, o).catch(e => console.error(e)); },
        createDialog: (d, row, k) => createDialog(d, row, k || cellKeys(confOf(d))[0]),
        lists: () => (ext.dataLists || []).filter(d => d && confOf(d)).map(d => d.id),
    };

    /* ═════════════ 🔎 « Ce qui le concerne » : les lignes reliées à la fiche ═════════════ */
    (ext.dataSources = ext.dataSources || []).push({id: 'lpers_liens', icon: '🔗', label: 'Les listes où on l’a relié(e)', group: 'La personne', needs: ['person'], online: false, installed: () => true,
        run: async (ctx, host) => {
            const pid = Number(ctx?.person?.id ?? ctx?.person ?? 0); if (!pid || !host) return false;
            let r; try { r = await api('lp_person', {person_id: pid}); } catch (_) { return false; }
            const links = r?.links || []; if (!links.length) { host.innerHTML = ''; return false; }
            host.innerHTML = `<ul class="lp-person-links">${links.map(l => `<li data-lp-link="${l.id}"><b>${esc(l.role || l.list_label)}</b> <span class="muted">— ${esc(l.list_label)}</span><br><small class="muted">${esc(T('Source :'))} ${esc(l.source)}${l.licence && !String(l.source).includes(l.licence) ? ` (${esc(l.licence)})` : ''}${l.url ? ` · <a href="${esc(A().safeUrl ? A().safeUrl(l.url) : l.url)}" target="_blank" rel="noopener">↗ ${esc(T('voir la ligne'))}</a>` : ''}</small></li>`).join('')}</ul>`;
            return true;
        }});

    // les listes déjà enregistrées (et celles qui viendront) : le drapeau 👤 sur leur champ du nom
    const flagAll = () => { (ext.dataLists || []).forEach(d => { try { if (d && d.__lp === undefined) confOf(d); } catch (_) {} }); };
    flagAll(); setTimeout(flagAll, 0); document.addEventListener('DOMContentLoaded', flagAll, {once: true});
})();
