/* LCNDA — 🧰 Listes → Données : une liste pour chaque jeu de données, avec la même façon de chercher partout.
 *
 * Chaque fichier qui apporte des données les ENREGISTRE (il ne fait pas sa propre page de liste) :
 *   (window.LCNDA_EXT.dataLists = window.LCNDA_EXT.dataLists || []).push({
 *     id: 'chateaux', icon: '🏰', label: 'Châteaux d’Europe', group: 'Le lieu' | 'La personne' | 'Le monde' | 'Chercher',
 *     source: 'Wikidata (CC0)', sourceUrl: 'https://…',
 *     load: async () => rows,                      // petites données : tout d'un coup (le moteur filtre lui-même)
 *     query: async query => ({rows, total}),       // grandes données : le serveur filtre (voir « query » plus bas)
 *     fields: [{key, label, type: 'text'|'number'|'year'|'enum'|'place'|'bool'|'date'|'url', values?: […]}],
 *     period: row => [de, à],                      // « 📅 Période » (à = null → une seule année)
 *     geo: row => [lat, lon],                      // « 📍 Autour de… » + 🗺 carte
 *     open: row => …,                              // un clic sur la ligne
 *     installed: () => bool | Promise, install: (hôte) => …,   // packs : sinon une offre « ⤓ Installer »
 *     enabled: () => bool,                         // facultatif : false = pas montrée (ex. fonction éteinte dans Réglages)
 *     facet: async (key, query) => [[valeur, n]…], // facultatif (query) : les choix d'un filtre « liste » avec leur nombre
 *     link: () => …                                // facultatif : une liste qui existe déjà ailleurs (on y va, pas de moteur)
 *     theme: 'seismes',                            // 🗂 son thème (un seul, LCNDA_EXT.dataListThemes, app-listes-themes.js) ; group reste pour les fiches
 *     merge: {into, rank, short, when?, row},      // 🔀 rejoint une liste réunie (LCNDA_EXT.dataListMerges, app-listes-reunies.js)
 *     rowKey: row => …, itemOf: (row, élément) => …,   // ☑ la clé d'une ligne ; ce qu'elle devient au panier / en 📎 (app-listes-choix.js)
 *     chips: [{id, icon, label, test(row, {d, geo}), prepare?(), on?}],   // 🏷 des pastilles à allumer d'un clic (au-dessus du tableau)
 *     views: [{id, icon, label, fields?, load?, period?, geo?, open?, sub?}],   // 👁 des vues (ex. Éditions | Étapes) + 🗺 Carte
 *     sub: row => ({view, preset, title, pickAll}),// ↳ la ligne ouvre une sous-liste (« ← titre · ☑ Toutes ses étapes »)
 *     familyColumn: true, familyKm, familyBefore,  // 👪 « Dans la famille » (app-listes-famille.js ; rayon : Réglages, 15 km au départ)
 *     hideCols: [...], defaultSort: [clé, 'asc'|'desc'], cards: true,   // colonnes cachées au départ ; tri de départ ; en cartes à 390 px
 *     painted: (res, page) => …                    // après chaque dessin du tableau (ex. « 4 doublons fondus »)
 *     cardTitle: row => …,                         // facultatif : le titre de la fiche d'un point de la 🗺 carte (app-carte-fiche.js), sinon le 1er texte
 *   });
 *   Une case peut contenir plusieurs valeurs (un tableau : ex. Sources) : le filtre « liste » en trouve une, l'export les joint.
 *   L'enregistrement marche avant ou après le chargement de ce fichier.
 *   query = {q, filters: [{key, op, value}], near: {lat, lon, km}, years: {from, to, mode}, sort, dir, offset, limit}
 *     op : 'contains' | 'starts' | 'eq' | 'in' (value = [..]) | 'gte' | 'lte' | 'true' | 'false' | 'empty' | 'notempty'
 *     years.mode : 'in' (en l'an X : from = to = X) | 'within' (tout entier entre from et to) | 'overlap' (touche from–to)
 *     sort '_km' = la distance (quand near).
 *
 * Ce que donne le moteur, pour chaque liste : critères combinés (ET) en pastilles, « 📅 Période », « 📍 Autour de [commune] à N km »
 * (colonne Distance), recherche libre, tri sur chaque colonne, nombre de lignes, Tableau | 🗺 Carte, ⤓ Exporter (CSV),
 * 📤 Envoyer vers… (Tableur…), 🖨 Imprimer, ★ recherches enregistrées (localStorage « genealogie-listes-donnees », ↶ Annuler).
 * Rangé dans Listes → 🧰 Données (app-listes.js : groupe g_data). Rien n'est écrit dans la généalogie : lecture seule, marche
 * en mode consultation. Les listes des données déjà dans l'app sont enregistrées en bas de ce fichier (lib/listes_donnees.php).
 * Essai : tests/test-listes-donnees.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const nf = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d}) : '');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const GROUPS = [['Mes listes', '📒'], ['La personne', '👤'], ['Le lieu', '📍'], ['Le monde', '🌍'], ['Chercher', '🔎']]; // 📒 Mes listes : les listes faites soi-même (app-listes-perso.js)
    const PAGE = 100, MAP_MAX = 1500, EXPORT_MAX = 20000;
    const OVERVIEW = 'donnees';

    /* ═════════════ l'annuaire : ce qui est enregistré, avant ou après nous ═════════════ */
    let changed = null, syncTries = 0;
    const schedule = () => { try { sync(false); } catch (_) {} clearTimeout(changed); changed = setTimeout(sync, 30); };
    const adopt = arr => {
        if (!Array.isArray(arr)) arr = [];
        if (arr.__ld) return arr;
        const push = Array.prototype.push;
        Object.defineProperty(arr, 'push', {value(...items) { const n = push.apply(this, items); schedule(); return n; }, configurable: true, writable: true});
        Object.defineProperty(arr, '__ld', {value: true});
        return arr;
    };
    let REG = adopt(ext.dataLists);
    Object.defineProperty(ext, 'dataLists', {get: () => REG, set: v => { REG = adopt(v); schedule(); }, configurable: true});
    const keyOf = d => 'data_' + String(d.id || '').replace(/[^a-z0-9_]/gi, '_');
    const all = () => { const seen = new Set(); return REG.filter(d => d && d.id && d.label && !seen.has(d.id) && seen.add(d.id)); };
    const shown = d => { try { return d.enabled ? d.enabled() !== false : true; } catch (_) { return true; } };
    const byKey = k => all().find(d => keyOf(d) === k);
    const groupOf = d => (GROUPS.some(g => g[0] === d.group) ? d.group : 'Le monde');

    /** range chaque liste dans Listes : le nom (app.js defaultListTypes), le groupe « 🧰 Données », la page */
    function sync(repaint = true) {
        const app = A(), L = app.defaultListTypes;
        if (repaint && (!Array.isArray(L) || (!ext.listGroupDefaults && syncTries < 50))) { syncTries++; setTimeout(sync, 200); }
        if (!Array.isArray(L)) return;
        ext.lists = ext.lists || {};
        if (!L.some(x => x[0] === OVERVIEW)) L.push([OVERVIEW, '90', T('🧰 Toutes les données')]);
        ext.lists[OVERVIEW] = token => (ext.dataHome?.mount ? ext.dataHome.mount(ws(), {door: 'listes', token}) : renderOverview(token)); // 📊 Récap d'abord (app-donnees-accueil.js), qui montre aussi cet écran (🧰 Thèmes)
        const ds = all().filter(d => !d.link).sort((a, b) => GROUPS.findIndex(g => g[0] === groupOf(a)) - GROUPS.findIndex(g => g[0] === groupOf(b)));
        const G = (ext.listGroupDefaults || []).find(g => g[0] === 'g_data');
        for (const d of ds) {
            const k = keyOf(d), lab = `${d.icon || '📋'} ${T(d.label)}`;
            const row = L.find(x => x[0] === k); if (row) row[2] = lab; else L.push([k, '91', lab]);
            ext.lists[k] = token => renderList(d, token);
        }
        if (G) G[3].splice(0, G[3].length, OVERVIEW, ...(ext.dataToolKeys || []).filter(k => ext.lists?.[k]), ...ds.map(keyOf)); // ext.dataToolKeys : les outils sur toutes les données (heritage-tout-sur.js)
        try { ext.listesThemes?.sync?.(L, G, ds); } catch (e) { console.error(e); } // 🗂 les 20 thèmes dans la colonne, à la place des listes (app-listes-themes.js)
        const st = app.state;
        if (repaint && st?.module === 'listes') { try { app.renderSidebar?.(); } catch (_) {} }
    }
    const prevShown = ext.listShown;
    ext.listShown = k => { if (String(k).startsWith('data_')) { const d = byKey(k); return !!d && shown(d); } return prevShown ? prevShown(k) : true; };

    /* ═════════════ ce qu'on cherche (une liste à la fois), retenu pour chaque liste ═════════════ */
    const SAVED = 'genealogie-listes-donnees';
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const blank = () => ({q: '', crit: [], period: null, near: null, sort: '', dir: 'asc', view: 'table', hide: [], gps: false, chips: [], dview: ''});
    /** d (facultatif) : ses colonnes cachées au départ (d.hideCols), sa vue et ses pastilles de départ (d.views[0], chips[].on) */
    const stateOf = (id, d = null) => { const d0 = d || all().find(x => x.id === id), saved = readJ('lcnda-ld:' + id, {}) || {};
        let dv0 = ''; try { dv0 = (typeof d0?.defaultView === 'function' ? d0.defaultView() : d0?.defaultView) || ''; } catch (_) {}
        const st = {...blank(), hide: [...(d0?.hideCols || [])], chips: (Array.isArray(d0?.chips) ? d0.chips : []).filter(c => c && c.on).map(c => c.id), dview: (viewsOf(d0).find(v => v.id === dv0) || viewsOf(d0)[0])?.id || '', sort: d0?.defaultSort?.[0] || '', dir: d0?.defaultSort?.[1] || 'asc', ...saved};
        if (!Array.isArray(st.chips)) st.chips = []; return st; };
    const saveState = (id, st) => writeJ('lcnda-ld:' + id, st);
    const savedAll = () => { const v = readJ(SAVED, {}); return v && typeof v === 'object' && v.saved && typeof v.saved === 'object' ? v : {saved: {}}; };
    const savedOf = id => (Array.isArray(savedAll().saved[id]) ? savedAll().saved[id] : []);
    const setSaved = (id, list) => { const v = savedAll(); if (list.length) v.saved[id] = list; else delete v.saved[id]; writeJ(SAVED, v); };

    /* ═════════════ les filtres : pastilles → demande ═════════════ */
    const fieldOf = (d, key) => (d.fields || []).find(f => f.key === key) || {key, label: key, type: 'text'};
    /** le titre d'une colonne : « Altitude (m) » — l'unité (f.unit) va dans la case des critères (K17), pas dans le libellé */
    const flab = f => `${T(f.label)}${f.unit ? ` (${T(f.unit)})` : ''}`;
    const kindOf = f => (['number', 'year'].includes(f.type) ? 'range' : f.type === 'date' ? 'daterange' : ['enum', 'place', 'bool'].includes(f.type) ? f.type : 'text'); // daterange : « du 1er au 30 juin 1859 » (AAAA-MM-JJ)
    /* 🧩 filtres en plus, apportés par d'autres fichiers (ex. « Dans le territoire », heritage-territoires.js) :
       LCNDA_EXT.dataListFilters = [{id, icon?, label, options() → [{value, label}], prepare?(), test([lat, lon], value) → bool}] ;
       offerts pour toute liste qui a geo() ; vérifiés ici, dans le navigateur (pas par le serveur). */
    const xfAll = () => (Array.isArray(ext.dataListFilters) ? ext.dataListFilters : []).filter(f => f && f.id && typeof f.test === 'function');
    const xfOf = id => xfAll().find(f => f.id === id);
    const xfCrit = st => st.crit.filter(c => c.kind === 'xf');
    async function xfPrepare(st) { for (const c of xfCrit(st)) { try { await xfOf(c.fid)?.prepare?.(); } catch (_) {} } }
    function xfOk(d, row, st) {
        const cs = xfCrit(st); if (!cs.length) return true;
        const g = geoOf(d, row); if (!g) return false;
        return cs.every(c => { const f = xfOf(c.fid); if (!f) return true; try { return !!f.test(g, c.value); } catch (_) { return false; } });
    }
    function critFilters(c) {
        if (c.kind === 'xf') return [];
        if (c.kind === 'daterange') return [c.from ? {key: c.key, op: 'gte', value: String(c.from)} : null, c.to ? {key: c.key, op: 'lte', value: String(c.to)} : null].filter(Boolean);
        if (c.kind === 'range') return [c.from !== '' && c.from != null ? {key: c.key, op: 'gte', value: Number(c.from)} : null, c.to !== '' && c.to != null ? {key: c.key, op: 'lte', value: Number(c.to)} : null].filter(Boolean);
        if (c.kind === 'enum') return c.values?.length ? [{key: c.key, op: 'in', value: c.values}] : [];
        if (c.kind === 'bool') return [{key: c.key, op: c.value ? 'true' : 'false'}];
        if (c.kind === 'place') return c.value ? [{key: c.key, op: 'contains', value: c.value}] : [];
        if (c.op === 'empty' || c.op === 'notempty') return [{key: c.key, op: c.op}];
        return c.value ? [{key: c.key, op: c.op || 'contains', value: c.value}] : [];
    }
    const PERIOD_MODES = () => [['in', T('en l’an')], ['within', T('entièrement entre')], ['overlap', T('qui touche la période')]];
    function critText(d, c) {
        if (c.kind === 'xf') { const x = xfOf(c.fid); return `${x?.icon || '🧩'} ${T(x?.label || c.fid)} : ${c.valueLabel || c.value}`; }
        const f = fieldOf(d, c.key), l = flab(f);
        if (c.kind === 'daterange') { const dt = v => (v ? new Date(v + 'T12:00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : ''); return c.from && c.to ? T('{l} : du {a} au {b}', {l, a: dt(c.from), b: dt(c.to)}) : c.from ? T('{l} : depuis le {a}', {l, a: dt(c.from)}) : T('{l} : jusqu’au {b}', {l, b: dt(c.to)}); }
        if (c.kind === 'range') return c.from !== '' && c.from != null && c.to !== '' && c.to != null ? `${l} : ${c.from} → ${c.to}` : c.from !== '' && c.from != null ? `${l} ≥ ${c.from}` : `${l} ≤ ${c.to}`;
        if (c.kind === 'enum') return `${l} : ${c.values.slice(0, 3).join(', ')}${c.values.length > 3 ? ` +${c.values.length - 3}` : ''}`;
        if (c.kind === 'bool') return `${l} : ${c.value ? T('oui') : T('non')}`;
        if (c.op === 'empty') return T('{l} : vide', {l});
        if (c.op === 'notempty') return T('{l} : rempli', {l});
        if (c.op === 'starts') return T('{l} commence par « {v} »', {l, v: c.value});
        if (c.op === 'eq') return `${l} = « ${c.value} »`;
        return T('{l} contient « {v} »', {l, v: c.value});
    }
    const periodText = p => (p.label ? String(p.label) : p.mode === 'in' ? T('📅 En {y}', {y: p.from}) : p.mode === 'within' ? T('📅 Entièrement entre {a} et {b}', {a: p.from, b: p.to}) : T('📅 Touche {a}–{b}', {a: p.from, b: p.to}));
    const nearText = n => T('📍 À {km} km autour de {p}', {km: nf(n.km, 1), p: n.title});
    function buildQuery(st, extra = {}) {
        const q = {q: st.q || '', filters: st.crit.flatMap(critFilters)};
        if (st.near) q.near = {lat: st.near.lat, lon: st.near.lon, km: st.near.km};
        if (st.period) q.years = {from: st.period.from, to: st.period.mode === 'in' ? st.period.from : st.period.to, mode: st.period.mode};
        if (st.sort) { q.sort = st.sort; q.dir = st.dir; }
        return {...q, ...extra};
    }

    /* ═════════════ le filtre fait ici (données « load ») ═════════════ */
    function rowMatch(row, f) {
        const x = row[f.key], v = f.value;
        if (Array.isArray(x)) return f.op === 'empty' ? !x.length : f.op === 'notempty' ? !!x.length : x.some(y => rowMatch({[f.key]: y}, f)); // une case à plusieurs valeurs (ex. Sources d'une liste réunie)
        if (f.op === 'in' || Array.isArray(v)) { const set = (Array.isArray(v) ? v : [v]).map(y => fold(y)); return set.includes(fold(x)); }
        const isNum = x !== null && x !== '' && x !== undefined && Number.isFinite(Number(x));
        if ((f.op === 'gte' || f.op === 'lte') && typeof v === 'string' && /^-?\d{4}-\d{2}/.test(v)) { const xs = String(x ?? '').slice(0, 10); if (!/^-?\d{4}/.test(xs)) return false; return f.op === 'gte' ? xs >= v.slice(0, xs.length) : xs.slice(0, v.length) <= v; } // une date AAAA-MM-JJ
        switch (f.op) {
            case 'eq': return isNum && Number.isFinite(Number(v)) ? Number(x) === Number(v) : fold(x) === fold(v);
            case 'gte': return isNum && Number(x) >= Number(v);
            case 'lte': return isNum && Number(x) <= Number(v);
            case 'starts': return fold(x).startsWith(fold(v));
            case 'true': return !!x && x !== 'non' && x !== '0';
            case 'false': return !x || x === 'non' || x === '0';
            case 'empty': return x == null || x === '';
            case 'notempty': return !(x == null || x === '');
            default: return fold(x).includes(fold(v));
        }
    }
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const geoOf = (d, row) => { try { const g = d.geo?.(row); return g && Number.isFinite(Number(g[0])) && Number.isFinite(Number(g[1])) && !(Number(g[0]) === 0 && Number(g[1]) === 0) ? [Number(g[0]), Number(g[1])] : null; } catch (_) { return null; } };
    const periodOf = (d, row) => { try { const p = d.period?.(row); if (!p) return null; const a = p[0] === '' || p[0] == null ? null : Number(p[0]), b = p[1] === '' || p[1] == null ? a : Number(p[1]); return Number.isFinite(a) ? [a, Number.isFinite(b) ? b : a] : null; } catch (_) { return null; } };
    function periodOk(d, row, p) {
        const r = periodOf(d, row); if (!r) return false;
        const from = Number(p.from), to = p.mode === 'in' ? from : Number(p.to);
        return p.mode === 'within' ? r[0] >= from && r[1] <= to : r[0] <= to && r[1] >= from;
    }
    function localFilter(d, rows, st, skipKey = '') {
        const q = fold(st.q || ''), fs = st.crit.filter(c => c.key !== skipKey).flatMap(critFilters), keys = (d.fields || []).filter(f => f.type !== 'url').map(f => f.key);
        const chips = chipsOn(d, st), out = [];
        for (const r0 of rows) {
            if (q && !keys.some(k => fold(r0[k]).includes(q))) continue;
            if (chips.length && !chips.every(c => { try { return !!c.test(r0, {d, geo: geoOf(d, r0)}); } catch (_) { return false; } })) continue;
            if (!fs.every(f => rowMatch(r0, f))) continue;
            if (st.period && !periodOk(d, r0, st.period)) continue;
            if (!xfOk(d, r0, st)) continue;
            let r = r0;
            if (st.near) { const g = geoOf(d, r0); if (!g) continue; const k = km(st.near.lat, st.near.lon, g[0], g[1]); if (k > st.near.km) continue; r = {...r0, _km: Math.round(k * 10) / 10}; }
            out.push(r);
        }
        return out;
    }
    /* 🏷 les pastilles d'une liste (d.chips : [{id, icon, label, test(row, {d, geo}) → bool, prepare?(), on?}]) : un clic les allume ou les éteint */
    const chipsOn = (d, st) => (Array.isArray(d.chips) ? d.chips.filter(c => c && c.id && typeof c.test === 'function' && (st.chips || []).includes(c.id)) : []);
    async function chipsPrepare(d, st) { for (const c of chipsOn(d, st)) { try { await c.prepare?.(); } catch (_) {} } }
    /* 👁 les vues d'une liste (d.views : [{id, icon, label, …ce qui change : fields, load, period, geo, open, sub…}]) : la liste « telle que vue » */
    /** les vues d'une liste, telles que déclarées ({id, label…} ou seulement 'etapes') ; « carte » / « map » = le bouton 🗺 Carte */
    const MAPV = new Set(['carte', 'map']);
    const viewsOf = d => (Array.isArray(d?.views) ? d.views : []).map(v => (typeof v === 'string' ? {id: v, label: v.charAt(0).toUpperCase() + v.slice(1)} : v)).filter(v => v && v.id && !MAPV.has(v.id));
    const wantsMap = d => !!d?.geo || (Array.isArray(d?.views) && d.views.some(v => MAPV.has(typeof v === 'string' ? v : v?.id)));
    /* 🏷 pastilles par valeur (d.chips = 'clé' : ex. une pastille par compétition) : un clic filtre sur cette valeur, un autre l'enlève */
    const valueChips = d => (typeof d?.chips === 'string' ? d.chips : '');
    const chipVals = new Map();
    async function valuePills(d) {
        const key = valueChips(d), ck = `${d._ck || d.id}|${key}`; if (!key || d.query) return [];
        if (!chipVals.has(ck)) chipVals.set(ck, loadAll(d).then(rows => { const n = new Map(); rows.forEach(r => [].concat(r[key] ?? []).forEach(v => { if (v != null && v !== '') n.set(String(v), (n.get(String(v)) || 0) + 1); })); return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14); }).catch(() => []));
        return chipVals.get(ck);
    }
    function viewDef(d, st) {
        const vs = viewsOf(d), v = vs.length ? (vs.find(x => x.id === st?.dview) || vs[0]) : null;
        return v ? {...d, ...v, id: d.id, icon: d.icon, label: d.label, views: d.views, chips: v.chips || d.chips, geo: v.geo || d.geo, _ck: `${d.id}~${v.id}`, _base: d, _view: v.id} : d;
    }
    function sortRows(rows, key, dir) {
        if (!key) return rows;
        const s = dir === 'desc' ? -1 : 1, empty = v => v == null || v === '';
        return [...rows].sort((a, b) => { const x = a[key], y = b[key]; if (empty(x)) return empty(y) ? 0 : 1; if (empty(y)) return -1;
            const nx = Number(x), ny = Number(y); return s * (Number.isFinite(nx) && Number.isFinite(ny) && typeof x !== 'boolean' ? nx - ny : String(x).localeCompare(String(y), 'fr', {numeric: true, sensitivity: 'base'})); });
    }

    /* ═════════════ les données d'une liste ═════════════ */
    const cache = new Map(); // id → Promise(rows) (données « load »)
    const loadAll = d => { const k = d._ck || d.id; if (!cache.has(k)) cache.set(k, Promise.resolve().then(() => d.load()).then(r => (Array.isArray(r) ? r : r?.rows || [])).catch(e => { cache.delete(k); throw e; })); return cache.get(k); };
    /** oublier les lignes gardées d'une liste (ex. une liste réunie après « ✂ Ce ne sont pas les mêmes ») */
    const forget = id => { for (const k of [...cache.keys()]) if (k === id || k.startsWith(id + '~')) cache.delete(k); };
    /** une page de résultats : {rows, total, more} */
    const XF_MAX = 10000;
    async function fetchPage(d, st, offset, limit) {
        if (st.inBase && ext.listesPersonnes?.fetchPage) return ext.listesPersonnes.fetchPage(d, st, offset, limit, (s, o, l) => fetchPage(d, {...s, inBase: false}, o, l)); // 👤 « Seulement les noms présents dans ma base » (app-listes-personnes.js)
        await xfPrepare(st); await chipsPrepare(d, st);
        if (d.query && xfCrit(st).length) { // un filtre 🧩 : on lit jusqu'à 10 000 lignes du serveur et on trie ici
            const got = []; let total = Infinity, truncated = false;
            while (got.length < Math.min(total, XF_MAX)) { const r = await d.query(buildQuery(st, {offset: got.length, limit: 2000})) || {}; const rows = Array.isArray(r) ? r : r.rows || []; total = Number.isFinite(Number(r.total)) ? Number(r.total) : rows.length; if (!rows.length) break; got.push(...rows); }
            if (total > XF_MAX) truncated = true;
            let rows = got.filter(r => xfOk(d, r, st));
            if (st.near) rows = rows.map(x => { if (x._km != null) return x; const g = geoOf(d, x); return g ? {...x, _km: Math.round(km(st.near.lat, st.near.lon, g[0], g[1]) * 10) / 10} : x; });
            if (st.sort === '_km') rows = sortRows(rows, '_km', st.dir);
            return {rows: rows.slice(offset, offset + limit), total: rows.length, more: truncated, all: rows};
        }
        if (d.query) {
            const r = await d.query(buildQuery(st, {offset, limit})) || {};
            let rows = Array.isArray(r) ? r : r.rows || [];
            if (st.near) rows = rows.map(x => { if (x._km != null) return x; const g = geoOf(d, x); return g ? {...x, _km: Math.round(km(st.near.lat, st.near.lon, g[0], g[1]) * 10) / 10} : x; });
            if (st.sort === '_km') rows = sortRows(rows, '_km', st.dir);
            return {rows, total: Number.isFinite(Number(r.total)) ? Number(r.total) : rows.length, more: !!(r.more || r.truncated)};
        }
        const rows = sortRows(localFilter(d, await loadAll(d), st), st.sort || (st.near ? '_km' : ''), st.sort ? st.dir : 'asc');
        return {rows: rows.slice(offset, offset + limit), total: rows.length, more: false, all: rows};
    }
    /** vrai / faux ; si la vérification elle-même échoue (serveur, réseau), l'erreur REMONTE : ce n'est pas « pas installé » (à montrer, pas à taire) */
    async function isInstalled(d) { if (!d.installed) return true; return !!(await d.installed()); }
    /** {ok, err} : err = la vérification elle-même a échoué (serveur, réseau) — ce n'est pas « pas installé » */
    async function installState(d) { if (!d.installed) return {ok: true}; try { return {ok: !!(await d.installed())}; } catch (e) { return {ok: false, err: e?.message || String(e)}; } }

    /* ═════════════ la page d'une liste ═════════════ */
    const cur = {d: null, base: null, st: null, rows: [], total: 0, more: false, token: 0, seq: 0};
    const ws = () => document.getElementById('workspace');
    const whereOf = d => { try { const w = ext.listesThemes?.whereOf?.(d); if (w) return w; } catch (_) {} return T(groupOf(d)); }; // 🗂 le thème (app-listes-themes.js), sinon le groupe
    /** le fil d'Ariane : « Listes · 🧰 Données », ou « 📊 Données » quand la page est ouverte dans l'onglet du haut (app-donnees-onglet.js) */
    const crumb = () => (A().state?.module === 'donnees' ? `📊 ${T('Données')}` : `${T('Listes')} · 🧰 ${T('Données')}`);
    const header = (d, extra = {}) => (UI().pageHeader ? UI().pageHeader({where: `${crumb()} · ${whereOf(d)}`, icon: d.icon || '📋', title: T(d.label), ...extra}) : `<h2>${esc(T(d.label))}</h2>`);
    const sourceLine = d => (d.source ? `<p class="ld-source muted"><small>${esc(T('Source :'))} ${/^https?:\/\/[^\s"'<>]+$/i.test(String(d.sourceUrl || '')) ? `<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${esc(d.source)}</a>` : esc(d.source)}</small></p>` : '');
    /** les colonnes : celles de la liste moins celles décochées dans « ⚙ Colonnes » (st.hide), + 📍 GPS (st.gps, listes avec positions), + Distance */
    const cols = (d, st) => {
        const base = (d.fields || []).filter(f => f.type !== 'url' && !f.hidden), hide = Array.isArray(st.hide) ? st.hide : [];
        const shownF = base.filter(f => !hide.includes(f.key));
        return [...(shownF.length ? shownF : base.slice(0, 1)), ...(st.gps && d.geo ? [{key: '_gps', label: T('📍 GPS'), gps: true}] : []), ...(st.near ? [{key: '_km', label: T('Distance (km)'), type: 'number', dist: true}] : [])];
    };
    /* 📍 GPS : « 48,3904 N · 4,4861 O » ; ⧉ copie « 48.3904, -4.4861 » (pour une appli GPS) */
    const gpsNum = v => Math.abs(v).toLocaleString('fr-FR', {minimumFractionDigits: 4, maximumFractionDigits: 4});
    const gpsText = g => `${T(g[0] >= 0 ? '{v} N' : '{v} S', {v: gpsNum(g[0])})} · ${T(g[1] >= 0 ? '{v} E' : '{v} O', {v: gpsNum(g[1])})}`;
    const gpsPlain = g => `${Number(g[0].toFixed(6))}, ${Number(g[1].toFixed(6))}`;
    const osmUrl = g => { const a = Number(g[0].toFixed(6)), b = Number(g[1].toFixed(6)); return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=15/${a}/${b}`; };
    function gpsCell(d, row, i) {
        const g = geoOf(d, row); if (!g) return '<td class="muted">—</td>';
        return `<td class="ld-gps-td"><span class="ld-gps"><button type="button" class="ld-gps-v" data-ld-gps-show="${i}" title="${esc(T('Les actions : copier, voir sur la carte, OpenStreetMap'))}">${esc(gpsText(g))}</button><span class="ld-gps-act"><button type="button" data-ld-gps-copy="${i}">⧉ ${esc(T('Copier'))}</button>${cur.d.geo ? `<button type="button" data-ld-gps-map="${i}">🗺 ${esc(T('Voir sur la carte'))}</button>` : ''}<a href="${esc(osmUrl(g))}" target="_blank" rel="noopener noreferrer">↗ OpenStreetMap</a></span></span></td>`;
    }
    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
        try { const a = document.createElement('textarea'); a.value = text; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch (_) { return false; }
    }
    const urlFields = d => (d.fields || []).filter(f => f.type === 'url');

    /** la feuille de style (ajoutée une fois, si index.php ne l'a pas déjà) */
    const ensureCss = () => { if (document.querySelector('link[href*="listes-donnees.css"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/listes-donnees.css?v=1'; document.head.appendChild(l); };
    async function renderList(d, token) {
        const app = A(), host = ws(); if (!host) return; ensureCss();
        cur.base = d; cur.st = stateOf(d.id, d); cur.d = viewDef(d, cur.st); cur.token = token; cur.parent = null;
        host.innerHTML = `<section class="page collection-page ld-page" data-ld-page="${esc(d.id)}">${header(d)}${UI().spinner ? UI().spinner(T('Chargement…')) : ''}</section>`;
        const chk = await installState(d), ok = chk.ok;
        if (token !== undefined && token !== app.state?.workspaceToken) return;
        if (!ok) {
            const why = chk.err ? `<p class="error" role="alert" data-ld-install-err>${esc(T('Impossible de vérifier si ces données sont installées : {e}', {e: chk.err}))} ${esc(T('Réessaie avec « ↻ C’est installé : recharger » ; si ça recommence, ferme puis rouvre l’app.'))}</p>` : '';
            host.innerHTML = `<section class="page collection-page ld-page" data-ld-page="${esc(d.id)}" data-ld-missing>${header(d, {help: esc(T(chk.err ? 'Impossible de vérifier si ces données sont sur cet ordinateur.' : 'Ces données ne sont pas encore sur cet ordinateur.'))})}
                <div class="ld-install" data-ld-install-host>${why}<p>${esc(T('Installe-les d’abord : ensuite, tu pourras chercher dedans par année, par lieu, autour d’une ville…'))}</p>
                ${d.install && !kiosk() ? `<button type="button" class="button" data-ld-install>⤓ ${esc(T('Installer'))}</button>` : ''}
                <button type="button" class="button secondary" data-ld-reload>↻ ${esc(T('C’est installé : recharger'))}</button></div>${sourceLine(d)}</section>`;
            // l'installation finie (un POST …_finish, …_apply) : forgetInstalls() puis la page se redessine toute seule (plus bas)
            host.querySelector('[data-ld-install]')?.addEventListener('click', () => { const fail = e => toast(T('L’installation n’a pas marché : {e}', {e: e?.message || String(e)}), 'error'); try { Promise.resolve(d.install(host.querySelector('[data-ld-install-host]'))).catch(fail); } catch (e) { fail(e); } });
            host.querySelector('[data-ld-reload]')?.addEventListener('click', () => { forgetInstalls(); renderList(d, A().state?.workspaceToken); }); // ↻ relit vraiment (rien de gardé en mémoire)
            return;
        }
        const exp = `<button type="button" class="button small secondary" data-ld-export title="${esc(T('Toutes les lignes trouvées, dans un fichier pour un tableur'))}">⤓ ${esc(T('Exporter'))}</button>`;
        const send = ext.sendTo ? `<button type="button" class="button small secondary" data-ld-send title="${esc(T('Les lignes trouvées dans le Tableur, une présentation, un document…'))}">📤 ${esc(T('Envoyer vers…'))}</button>` : '';
        const prn = `<button type="button" class="button small secondary" data-ld-print>🖨 ${esc(T('Imprimer'))}</button>`;
        host.innerHTML = `<section class="page collection-page ld-page" data-ld-page="${esc(d.id)}">${header(d, {actions: [exp, send, prn]})}${sourceLine(d)}
            <div class="ld-saved" data-ld-saved></div>
            <div class="ld-bar">
              <div class="ld-bar-row">
                <input type="search" class="ld-q" data-ld-q placeholder="${esc(T('Chercher dans cette liste…'))}" aria-label="${esc(T('Chercher dans cette liste'))}" value="${esc(cur.st.q)}">
                <button type="button" class="ui-listbar-btn" data-ld-add aria-haspopup="true">＋ ${esc(T('Ajouter un critère'))}</button>
                ${d.period ? `<button type="button" class="ui-listbar-btn" data-ld-period aria-haspopup="true">📅 ${esc(T('Période'))}</button>` : ''}
                ${d.geo ? `<button type="button" class="ui-listbar-btn" data-ld-near aria-haspopup="true">📍 ${esc(T('Autour de…'))}</button>` : ''}
                ${viewsOf(d).length ? `<span class="segmented ld-view" role="group" aria-label="${esc(T('Affichage'))}">${viewsOf(d).map(v => `<button type="button" data-ld-dview="${esc(v.id)}">${v.icon ? `${esc(v.icon)} ` : ''}${esc(T(v.label))}</button>`).join('')}${wantsMap(d) ? `<button type="button" data-ld-view="map">🗺 ${esc(T('Carte'))}</button>` : ''}</span>`
                    : d.geo ? `<span class="segmented ld-view" role="group" aria-label="${esc(T('Affichage'))}"><button type="button" data-ld-view="table">${esc(T('Tableau'))}</button><button type="button" data-ld-view="map">🗺 ${esc(T('Carte'))}</button></span>` : ''}
                <button type="button" class="ui-listbar-btn" data-ld-cols aria-haspopup="true" title="${esc(T('Choisir les colonnes du tableau'))}">⚙ ${esc(T('Colonnes'))}</button>
                <button type="button" class="ui-listbar-btn" data-ld-save title="${esc(T('Garder ces critères sous un nom, pour les retrouver d’un clic'))}">★ ${esc(T('Enregistrer cette recherche'))}</button>
              </div>
              ${d.chips?.length || valueChips(d) ? `<div class="ld-qchips" data-ld-qchips role="group" aria-label="${esc(T('Pastilles'))}"></div>` : ''}
              <div class="ld-editor" data-ld-editor hidden></div>
              <div class="ld-chips" data-ld-chips></div>
            </div>
            <div class="ld-results" data-ld-results></div>
            <div class="ld-more-host" data-ld-more-host></div></section>`;
        bindPage(host.querySelector('.ld-page'), d);
        try { ext.listesThemes?.pageTop?.(host.querySelector('.ld-page'), d); } catch (e) { console.error(e); } // 🗂 les onglets du thème : liste réunie · ses listes (app-listes-themes.js)
        try { ext.listesMaj?.header?.(host.querySelector('.ld-page'), d); } catch (e) { console.error(e); } // 🗂 « Données du … · ↻ Vérifier » (app-listes-maj.js)
        try { ext.listesPerso?.listBar?.(host.querySelector('.ld-page'), d); } catch (e) { console.error(e); } // ＋ Ma liste : ✎ Modifier, ＋ Ajouter une ligne, ⤒ Remplacer… (app-listes-perso.js)
        try { ext.listesPersonnes?.listBar?.(host.querySelector('.ld-page'), {d, state: () => cur.st, rerun}); } catch (e) { console.error(e); } // 👤 noms reliés aux fiches (app-listes-personnes.js)
        try { ext.connexions?.listBar?.(host.querySelector('.ld-page'), {d, state: () => cur.st, total: () => cur.total, rows: () => cur.rows, allRows, table2d, critSummary}); } catch (e) { console.error(e); } // 🧺 « Prendre… » (heritage-connexions.js)
        try { ext.listesChoix?.listBar?.(host.querySelector('.ld-page'), pageApi()); } catch (e) { console.error(e); } // ☑ choisir plusieurs lignes, la barre du bas (app-listes-choix.js)
        try { ext.guerresTemps?.listBar?.(host.querySelector('.ld-page'), pageApi()); } catch (e) { console.error(e); } // ▶ Dans le temps (d.timeMap : heritage-guerres-temps.js)
        try { ext.donneesPlus?.listBar?.(host.querySelector('.ld-page'), pageApi()); } catch (e) { console.error(e); } // ⭐ 👤 📶 📜 ➕ (app-donnees-plus.js)
        paintSaved(); paintChips(); await refresh();
    }

    const rerun = () => { saveState(cur.d.id, cur.st); paintChips(); refresh(); };
    function paintSaved() {
        const box = ws()?.querySelector('[data-ld-saved]'), d = cur.d; if (!box || !d) return;
        const list = savedOf(d.id);
        box.innerHTML = list.length ? `<span class="ld-saved-lab">★ ${esc(T('Mes recherches :'))}</span>${list.map((s, i) => `<span class="ld-saved-it"><button type="button" class="ld-saved-go" data-ld-saved-go="${i}" title="${esc(T('Rappeler cette recherche'))}">${esc(s.name)}</button><button type="button" class="ld-saved-x" data-ld-saved-x="${i}" title="${esc(T('Oublier cette recherche (↶ possible)'))}" aria-label="${esc(T('Oublier « {name} »', {name: s.name}))}">×</button></span>`).join('')}` : '';
        box.hidden = !list.length;
    }
    function paintChips() {
        const box = ws()?.querySelector('[data-ld-chips]'), d = cur.d, st = cur.st; if (!box) return;
        const chips = [...st.crit.map((c, i) => (c.chip ? null : [`crit:${i}`, critText(d, c)])), st.period ? ['period', periodText(st.period)] : null, st.near ? ['near', nearText(st.near)] : null].filter(Boolean);
        box.innerHTML = `<span class="ld-count" data-ld-count aria-live="polite"></span>${chips.map(([k, t]) => `<button type="button" class="ui-listbar-chip" data-ld-chip="${esc(k)}" title="${esc(T('Retirer ce critère'))}">${esc(t)} <span aria-hidden="true">×</span></button>`).join('')}${ext.listesPersonnes?.chip?.(d, st) || ''}${chips.length > 1 || (chips.length && st.q) ? `<button type="button" class="ui-listbar-clearall" data-ld-clear>${esc(T('Tout effacer'))}</button>` : ''}`;
        ws()?.querySelectorAll('[data-ld-view]').forEach(b => { const on = b.dataset.ldView === st.view; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        ws()?.querySelectorAll('[data-ld-dview]').forEach(b => { const on = st.view !== 'map' && b.dataset.ldDview === (cur.d?._view || ''); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        const qc = ws()?.querySelector('[data-ld-qchips]'), base = cur.base || d;
        if (qc && valueChips(base)) { // une pastille par valeur (les plus fréquentes)
            const key = valueChips(base), onV = st.crit.find(c => c.key === key && c.kind === 'enum' && c.chip)?.values?.[0];
            valuePills(cur.d || base).then(vals => { if (!qc.isConnected) return; qc.innerHTML = vals.map(([v, n]) => { const on = v === onV; return `<button type="button" class="ld-qchip${on ? ' is-on' : ''}" data-ld-vchip="${esc(v)}" aria-pressed="${on}">${esc(v)} <i>${nf(n)}</i>${on ? ' <span aria-hidden="true">×</span>' : ''}</button>`; }).join(''); });
        } else if (qc) qc.innerHTML = (base.chips || []).map(c => { const on = (st.chips || []).includes(c.id); return `<button type="button" class="ld-qchip${on ? ' is-on' : ''}" data-ld-qchip="${esc(c.id)}" aria-pressed="${on}">${c.icon ? `${esc(c.icon)} ` : ''}${esc(T(c.label))}${on ? ' <span aria-hidden="true">×</span>' : ''}</button>`; }).join('');
    }
    const countText = () => (cur.more ? T('plus de {n} lignes', {n: nf(cur.total)}) : cur.total === 1 ? T('1 ligne') : T('{n} lignes', {n: nf(cur.total)}));

    async function refresh() {
        if (cur.base) cur.d = viewDef(cur.base, cur.st);
        const d = cur.d, st = cur.st, res = ws()?.querySelector('[data-ld-results]'); if (!res) return;
        const self = st.view !== 'map' && typeof d.paint === 'function'; res.closest('.ld-page')?.classList.toggle('ld-self', self); // 👁 une vue qui se dessine elle-même (views[].paint : 🔎 Un nom → le lieu, noms-lieux-monde.js)
        if (self) { ++cur.seq; cur.rows = []; cur.total = 0; cur.more = false; paintMore(); try { d.paint(res, pageApi()); } catch (e) { console.error(e); } return; }
        const my = ++cur.seq;
        res.innerHTML = UI().spinner ? UI().spinner(T('On cherche…')) : '…';
        let page;
        const find = st.view !== 'map' ? cur.findRow : null; cur.findRow = null; // ☰ Voir la ligne (la fiche d'un point de la carte) : on lit assez loin pour la trouver
        try { page = await fetchPage(d, st, 0, st.view === 'map' || find ? MAP_MAX : PAGE); } catch (e) { if (my === cur.seq) res.innerHTML = A().empty ? A().empty(e.message || T('Liste impossible à lire.'), {icon: '⛔'}) : esc(e.message); return; }
        if (my !== cur.seq) return;
        let found = -1;
        if (find) { found = page.rows.findIndex(r => rowKeyOf(d, r) === find); const keep = Math.max(PAGE, Math.ceil((found + 1) / PAGE) * PAGE); if (page.rows.length > keep) page = {...page, rows: page.rows.slice(0, keep)}; }
        cur.rows = page.rows; cur.total = page.total; cur.more = page.more; cur.zone = null;
        const c = ws()?.querySelector('[data-ld-count]'); if (c) c.textContent = countText();
        try { if (ext.guerresTemps?.paint?.(res, pageApi())) return; } catch (e) { console.error(e); } // ▶ Dans le temps : la carte année après année (heritage-guerres-temps.js)
        if (st.view === 'map' && d.geo) { paintMap(res); try { ext.listesChoix?.rowsPainted?.(res, cur.rows, pageApi()); } catch (e) { console.error(e); } return; }
        paintTable(res);
        if (find) showFound(res, found);
    }
    /** ☰ Voir la ligne : la ligne en couleur, au milieu de l'écran, et « 🗺 Revenir à la carte » (même cadrage, la fiche rouverte) */
    function showFound(res, i) {
        const back = cur.backMap; let bar = ws()?.querySelector('[data-ld-back-map]');
        if (back && !bar) { bar = document.createElement('div'); bar.className = 'ld-back-map'; bar.dataset.ldBackMap = ''; res.before(bar); }
        if (bar) bar.innerHTML = `<button type="button" class="button small secondary" data-ld-back-map-go>🗺 ${esc(T('Revenir à la carte'))}</button>${i < 0 ? `<small class="muted">${esc(T('Cette ligne n’est pas dans les premières lignes du tableau : ajoute un critère pour la retrouver.'))}</small>` : ''}`;
        if (i < 0) return;
        const hl = first => { // encore une fois un peu après : un fichier branché peut redessiner le tableau (☑, 👪…)
            const tr = res.querySelector(`tr[data-ld-row="${i}"]`); if (!tr || (!first && tr.contains(document.activeElement))) return;
            tr.classList.add('ld-row-hl'); if (first) tr.scrollIntoView?.({block: 'center'});
            (tr.querySelector('[data-ld-open], button, a') || tr).focus?.({preventScroll: true});
            clearTimeout(tr.__hl); tr.__hl = setTimeout(() => tr.classList.remove('ld-row-hl'), 6000);
        };
        hl(true); setTimeout(hl, 150); setTimeout(hl, 600);
    }
    function cellHtml(f, row) {
        if (typeof f.html === 'function') { let h = ''; try { h = f.html(row); } catch (_) {} return h ? `<td class="ld-html">${h}</td>` : '<td class="muted">—</td>'; } // f.html(row) : du HTML déjà échappé par la liste (ex. Sources ↗)
        const v = Array.isArray(row[f.key]) ? row[f.key].join(' · ') : row[f.key];
        if (v == null || v === '') return '<td class="muted">—</td>';
        if (f.type === 'number' || f.dist) return `<td class="ld-num" data-sort-value="${esc(v)}">${esc(nf(v, 2))}</td>`;
        if (f.type === 'bool') return `<td>${esc(v && v !== 'non' && v !== '0' ? T('oui') : T('non'))}</td>`;
        const s = String(v);
        return `<td${s.length > 60 ? ` title="${esc(s)}"` : ''}>${esc(s.length > 140 ? s.slice(0, 137) + '…' : s)}</td>`;
    }
    function paintTable(res) {
        const d = cur.d, st = cur.st, cs = cols(d, st), urls = urlFields(d);
        if (!cur.rows.length) { res.innerHTML = A().emptyState ? A().emptyState({icon: '🔎', text: T('Rien ne correspond à ces critères.'), hint: T('Retire un critère, élargis la période ou la distance.'), size: 'small'}) : esc(T('Rien ne correspond à ces critères.')); paintMore(); return; }
        const CH = ext.listesChoix, fam = !!(d.familyColumn && ext.listesFamille && d.geo && d.period);
        const sortable = f => !f.gps && f.sort !== false;
        const famAt = fam ? cs.findIndex(f => f.key === d.familyBefore) : -1, famTh = `<th>${esc(T('Dans la famille'))}</th>`; // « Dans la famille » : avant d.familyBefore, sinon à la fin
        const head = cs.map((f, j) => (j === famAt ? famTh : '') + (!sortable(f) ? `<th>${esc(flab(f))}</th>` : `<th><button type="button" class="table-sort ld-sort" data-ld-sort="${esc(f.key)}">${esc(flab(f))}${st.sort === f.key ? `<span class="sort-mark">${st.dir === 'desc' ? ' ↓' : ' ↑'}</span>` : ''}</button></th>`)).join('') + (fam && famAt < 0 ? famTh : '');
        const firstTxt = (f, r) => (Array.isArray(r[f.key]) ? r[f.key].join(' · ') : r[f.key]) ?? '—';
        const openable = !!(d.open || d.sub);
        const famTd = i => `<td class="ld-fam" data-ld-fam="${i}"></td>`;
        const firstHtml = (f, r) => { if (typeof f.html === 'function') { try { const h = f.html(r); if (h) return h; } catch (_) {} } return esc(firstTxt(f, r)); };
        const ckIn = (html, ck) => (ck ? html.replace(/^<t([dh])([^>]*)>/, (m, t, a) => `<t${t}${a}>${ck}`) : html); // ☑ la case, au début de la 1re case (les colonnes ne bougent pas)
        const body = cur.rows.map((r, i) => `<tr data-ld-row="${i}">${ckIn(cs.map((f, j) => (j === famAt ? famTd(i) : '') + (f.gps ? gpsCell(d, r, i) : j === 0 && openable ? `<td><button type="button" class="table-link" data-ld-open="${i}" aria-expanded="false">${firstHtml(f, r)}</button></td>` : cellHtml(f, r))).join(''), CH?.cellBefore(i))}${fam && famAt < 0 ? famTd(i) : ''}${urls.length ? `<td class="ld-links">${urls.map(u => (r[u.key] ? `<a href="${esc(A().safeUrl ? A().safeUrl(r[u.key]) : r[u.key])}" target="_blank" rel="noopener" title="${esc(T(u.label))}">↗</a>` : '')).join(' ')}</td>` : ''}${CH ? CH.cellAfter(i) : ''}</tr>`).join('');
        res.innerHTML = `<div class="data-table-wrap ld-table-wrap"><table class="data-table ld-table${d.cards ? ' ld-table--cards' : ''}"><thead><tr>${ckIn(head, CH?.headBefore())}${urls.length ? '<th></th>' : ''}${CH ? CH.headAfter() : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
        paintMore();
        if (fam) { try { ext.listesFamille.fill(res, cur.rows, d); } catch (e) { console.error(e); } } // 👪 « Louis DURAND, 29 ans » (app-listes-famille.js)
        try { CH?.rowsPainted?.(res, cur.rows, pageApi()); } catch (e) { console.error(e); } // ☑ (app-listes-choix.js)
        try { d.painted?.(res, pageApi()); } catch (e) { console.error(e); } // une liste qui ajoute un mot sous son tableau (ex. 🔀 « 4 doublons fondus »)
        try { ext.connexions?.listRowsPainted?.(res, cur.rows, {d, total: cur.total}); } catch (e) { console.error(e); } // 📥 cases « Tu choisis des lignes… » (heritage-connexions.js)
        try { ext.listesPersonnes?.rowsPainted?.(res, cur.rows, {d}); } catch (e) { console.error(e); } // 👤 « dans ta base : … », 🔗 Relier à une fiche (app-listes-personnes.js)
        try { ext.donneesPlus?.rowsPainted?.(res, cur.rows, pageApi()); } catch (e) { console.error(e); } // 🔎 marques, 📝 ⚠️ 📖, ✋ mes lignes (app-donnees-plus.js)
    }
    function paintMore() {
        const host = ws()?.querySelector('[data-ld-more-host]'); if (!host) return;
        const rest = cur.total - cur.rows.length;
        host.innerHTML = cur.st.view !== 'map' && rest > 0 ? `<button type="button" class="ui-more" data-ld-more>${esc(T('Voir les {n} suivantes ↓', {n: nf(Math.min(PAGE, rest))}))}</button>` : '';
    }
    async function more(btn) {
        btn.disabled = true;
        try {
            const start = cur.rows.length, page = await fetchPage(cur.d, cur.st, start, PAGE);
            cur.rows.push(...page.rows);
            const res = ws()?.querySelector('[data-ld-results]'); if (!res) return;
            paintTable(res);
            res.querySelector(`[data-ld-row="${start}"] button, [data-ld-row="${start}"] td`)?.focus?.();
        } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    }
    /* 🗺 la carte : zoom, déplacement, points regroupés (heritage-mini-carte.js) ; au plus MAP_MAX points, et on dit combien */
    function paintMap(res) {
        const d = cur.d, st = cur.st, pts = [], rows = [];
        ws()?.querySelector('[data-ld-back-map]')?.remove();
        const was = ext.carteFiche?.of?.(res), oldCtl = was && ext.miniMapOf?.(res); // redessinée sur place (ex. 👪 les lieux arrivent) : même cadrage, la fiche reste ouverte
        if (oldCtl) { if (!cur.mapView) cur.mapView = oldCtl.getView?.() || null; const r0 = res.__ldMapRows?.[was.current()]; if (r0 && !cur.mapReopen) cur.mapReopen = rowKeyOf(d, r0); }
        cur.rows.forEach(r => { const g = geoOf(d, r); if (g) { rows.push(r); pts.push({lat: g[0], lon: g[1], label: pointLabel(d, r), color: '#0066cc'}); } }); // au survol : le titre et la date
        if (st.near) pts.push({lat: st.near.lat, lon: st.near.lon, label: st.near.title, color: '#d4380d', n: '★'});
        if (!rows.length) { res.innerHTML = A().empty ? A().empty(T('Aucune de ces lignes n’a de position sur la carte.'), {icon: '🗺'}) : ''; paintMore(); return; }
        const view = cur.mapView; cur.mapView = null;
        const circles = [...(st.near && Number(st.near.km) > 0 ? [{lat: st.near.lat, lon: st.near.lon, km: Number(st.near.km)}] : []), // + 👪 les cercles des lieux de la famille (app-listes-reunies-plus.js)
            ...(ext.listesCarteFamille?.(d, st, pts, () => { if (cur.st === st && st.view === 'map' && res.isConnected) paintMap(res); }) || [])];
        res.innerHTML = `${ext.miniMap ? ext.miniMap(pts, [], {height: 520, view, circles}) : `<p>${esc(T('La carte n’est pas chargée.'))}</p>`}<div class="ld-map-note" data-ld-map-note aria-live="polite"></div>`;
        const marks = [...res.querySelectorAll('.h-map-point')];
        const CF = ext.carteFiche;
        marks.forEach((m, i) => {
            if (!rows[i]) return; m.dataset.ldMapRow = String(i);
            if (CF) { m.dataset.cfI = String(i); m.style.cursor = 'pointer'; m.setAttribute('tabindex', '0'); m.setAttribute('role', 'button'); m.setAttribute('aria-label', T('Voir la fiche : {name}', {name: pts[i].label || '—'})); return; } // un clic : la fiche du point, sur la carte (app-carte-fiche.js)
            if (!d.open) return;
            m.style.cursor = 'pointer'; m.setAttribute('tabindex', '0'); m.setAttribute('role', 'button'); m.setAttribute('aria-label', T('Ouvrir : {name}', {name: pts[i].label || '—'}));
            const go = () => { try { d.open(rows[i]); } catch (e) { toast(e.message, 'error'); } };
            m.addEventListener('click', go); m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
        const noPos = cur.rows.length - rows.length, capped = !cur.zone && (cur.more || cur.total > cur.rows.length);
        const noteBox = res.querySelector('[data-ld-map-note]');
        const paintNote = zoomedIn => {
            if (!noteBox) return;
            const shown = rows.length === 1 ? T('1 point sur la carte') : T('{n} points sur la carte', {n: nf(rows.length)});
            const parts = [`<b>${esc(shown)}</b>`];
            if (cur.zone) parts.push(esc(cur.zone.total > rows.length ? T('les {n} premiers de cette zone (il y en a {t})', {n: nf(rows.length), t: nf(cur.zone.total)}) : T('tous ceux de cette zone')));
            else if (capped) parts.push(esc(T('sur {t} lignes : seulement les {n} premières sont placées.', {t: cur.more ? T('plus de {n}', {n: nf(cur.total)}) : nf(cur.total), n: nf(cur.rows.length)})));
            if (noPos > 0) parts.push(esc(noPos === 1 ? T('1 ligne sans position') : T('{n} lignes sans position', {n: nf(noPos)})));
            let act = '';
            if (cur.zone) act = `<button type="button" class="button small secondary" data-ld-zone-reset>↺ ${esc(T('Toute la recherche'))}</button>`;
            else if (capped) act = zoomedIn ? `<button type="button" class="button small" data-ld-zone>⤓ ${esc(T('Charger les points de cette zone'))}</button>` : `<small class="muted">${esc(T('Zoome sur une région pour charger ses points, ou ajoute un critère.'))}</small>`;
            noteBox.innerHTML = `<span>${parts.join(' · ')}</span>${act}`;
        };
        paintNote(false);
        res.querySelector('.h-map')?.addEventListener('minimap-view', e => { const z = e.detail || {}; paintNote(z.zoom > (z.fitZoom ?? 0) + 0.9); });
        const ctl = ext.miniMapOf?.(res);
        res.__ldMapRows = rows;
        const cf = CF?.attach(res, {card: i => (rows[i] ? pointCard(d, st, rows[i]) : null), label: i => (rows[i] ? pointTitle(d, rows[i]).title : ''), sub: i => (rows[i] ? pointDate(d, rows[i], true) : ''),
            onAct: (k, i, b) => pointAct(k, rows[i], b, res)});
        const reopen = cur.mapReopen; cur.mapReopen = null;
        if (reopen && cf) { const i = rows.findIndex(r => rowKeyOf(d, r) === reopen); if (i >= 0) setTimeout(() => { if (res.isConnected) cf.open(i); }, 0); }
        if (cur.mapFocus && ctl) { const g = cur.mapFocus, i = rows.findIndex(r => { const x = geoOf(d, r); return x && Math.abs(x[0] - g[0]) < 1e-9 && Math.abs(x[1] - g[1]) < 1e-9; }); if (marks[i]) { marks[i].focus({preventScroll: true}); } }
        cur.mapFocus = null;
        paintMore();
    }
    /* ── 🗺 la fiche d'un point (app-carte-fiche.js) : un titre, les colonnes montrées (au plus 6), 👪 Dans la famille, ↗ la source ── */
    const plain = h => { const t = document.createElement('template'); t.innerHTML = String(h ?? ''); return (t.content.textContent || '').replace(/\s+/g, ' ').trim(); };
    function valText(f, r) {
        if (typeof f.html === 'function') { try { const h = f.html(r); if (h) { const s = plain(h); return s === '—' ? '' : s; } } catch (_) {} }
        const v = Array.isArray(r[f.key]) ? r[f.key].join(' · ') : r[f.key]; if (v == null || v === '') return '';
        if (f.type === 'number' || f.dist) return nf(v, 2);
        if (f.type === 'bool') return v && v !== 'non' && v !== '0' ? T('oui') : T('non');
        return String(v);
    }
    function valHtml(f, r) {
        if (typeof f.html === 'function') { try { const h = f.html(r); const s = h ? plain(h) : ''; if (s && s !== '—') return h; } catch (_) {} }
        const s = valText({...f, html: null}, r); return s ? esc(s.length > 160 ? s.slice(0, 157) + '…' : s) : '';
    }
    const rowKeyOf = (d, r) => (ext.listesChoix?.rowKey ? ext.listesChoix.rowKey(d, r) : JSON.stringify((d.fields || []).map(f => r[f.key] ?? null)));
    /** le titre : d.cardTitle(row) (ex. « Naves, 30 septembre 2002 »), sinon le premier texte de la ligne, sinon le nom de la liste */
    function pointTitle(d, r) {
        for (const fn of [d.cardTitle, d._base?.cardTitle]) if (typeof fn === 'function') { try { const t = String(fn(r) ?? '').trim(); if (t) return {title: t, own: true}; } catch (_) {} }
        const f = (d.fields || []).find(x => x.type !== 'url' && !x.hidden && x.key !== 'sources' && ['text', 'place', 'enum', undefined].includes(x.type) && valText(x, r));
        return {title: f ? valText(f, r) : T(d.label), key: f?.key || ''};
    }
    /** la date de la ligne (le premier champ date, sinon année) ; notIn : rien si le titre la dit déjà */
    function pointDate(d, r, notIn) {
        const fs = d.fields || [], f = fs.find(x => x.type === 'date') || fs.find(x => x.type === 'year'); const s = f ? valText(f, r) : '';
        return s && notIn && pointTitle(d, r).title.includes(s) ? '' : s;
    }
    const pointLabel = (d, r) => { const t = pointTitle(d, r).title, s = pointDate(d, r, true); return s ? `${t} · ${s}` : t; };
    function pointSource(d, r) {
        const http = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''), a = (u, t) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>` : esc(t));
        const ms = Array.isArray(r._members) ? r._members : [];
        if (ms.length) { const seen = new Set(); return ms.filter(m => { const k = m.src?.short || ''; if (seen.has(k)) return false; seen.add(k); return true; }).map(m => a(http(m.rec?.url) || http(m.src?.url), m.src?.short || T('source'))).join(' · '); }
        return a(urlFields(d).map(f => http(r[f.key])).find(Boolean) || http(d.sourceUrl), d.source || T(d.label));
    }
    /** 👪 qui vivait près de là cette année-là (app-listes-famille.js : jamais une fiche confidentielle ; en consultation, pas les vivants) */
    function pointFamily(d, r) {
        const LF = ext.listesFamille, g = geoOf(d, r), p = periodOf(d, r); if (!d.familyColumn || !LF || !g || !p) return null;
        const max = Number(d.familyKm) > 0 ? Number(d.familyKm) : Number(LF.km?.()) || 15;
        return Promise.resolve(LF.ready?.()).then(() => {
            const pr = LF.presence(g[0], g[1], p[0], max);
            if (!pr.who.length) return pr.before ? `<span class="muted">${esc(T('avant la famille'))}</span>` : '';
            const one = w => (w.born ? T('{name} naît cette année-là', {name: w.n}) : w.age != null ? T('{name}, {age} ans', {name: w.n, age: w.age}) : w.n);
            return `${esc(pr.who.slice(0, 4).map(one).join(' · '))}${pr.who.length > 4 ? ` ${esc(T('+{n}', {n: pr.who.length - 4}))}` : ''} <small class="muted">${esc(T('à moins de {km} km', {km: nf(max)}))}</small>`;
        });
    }
    function pointCard(d, st, r) {
        const t = pointTitle(d, r), CH = ext.listesChoix, ro = kiosk() || document.documentElement.classList.contains('base-readonly');
        const lines = cols(d, st).filter(f => !f.gps && f.key !== 'sources' && (t.own || f.key !== t.key)).map(f => [flab(f), valHtml(f, r)]).filter(l => l[1]).slice(0, 6);
        return {title: t.title, lines, fam: pointFamily(d, r), src: pointSource(d, r), ins: !!CH, bk: !!(CH && ext.connexions), open: !!(d.open && !d.merged && !d.sub), line: true, roWhy: ro ? T('Mode consultation : rien ne peut être écrit.') : ''};
    }
    function pointAct(kind, r, btn, res) {
        if (!r) return;
        if (kind === 'ins' || kind === 'bk') return ext.listesChoix?.act?.(kind === 'ins' ? 'insert' : 'basket', [r], btn, pageApi());
        if (kind === 'open') { try { cur.d.open(r); } catch (e) { toast(e.message, 'error'); } return; } // ↗ Ouvrir : la page de la ligne (ex. la commune)
        if (kind === 'line') { const key = rowKeyOf(cur.d, r); cur.backMap = {view: ext.miniMapOf?.(res)?.getView?.() || null, key}; cur.findRow = key; cur.st.view = 'table'; rerun(); }
    }
    /** « Charger les points de cette zone » : les lignes dont la position est dans le cadre de la carte (filtre sur place ; ou le serveur
     *  cherche dans le cercle qui contient le cadre, et on garde ce qui est dans le cadre) */
    async function loadZone(btn) {
        const res = ws()?.querySelector('[data-ld-results]'), ctl = ext.miniMapOf?.(res), b = ctl?.bounds(); if (!b) return;
        const d = cur.d, st = cur.st, view = ctl.getView(), my = cur.seq;
        const inBox = g => { let lon = g[1]; while (lon < b.west) lon += 360; while (lon >= b.west + 360) lon -= 360; return g[0] >= b.south && g[0] <= b.north && lon <= b.east; };
        btn.disabled = true; btn.textContent = T('On cherche…');
        try {
            let found;
            if (!d.query) found = (await fetchPage(d, st, 0, MAP_MAX)).all.filter(r => { const g = geoOf(d, r); return g && inBox(g); });
            else {
                const lat = (b.north + b.south) / 2, lon = (b.west + b.east) / 2, r = Math.max(km(lat, lon, b.north, b.west), km(lat, lon, b.south, b.east), km(lat, lon, b.north, b.east), km(lat, lon, b.south, b.west));
                if (r > 3000) { toast(T('Zoome encore un peu : la zone est trop grande.')); btn.disabled = false; paintMap(res); return; }
                const zst = st.near ? st : {...st, near: {lat, lon, km: Math.ceil(r), title: ''}, sort: st.sort || ''};
                const page = await fetchPage(d, zst, 0, MAP_MAX);
                found = page.rows.filter(x => { const g = geoOf(d, x); return g && inBox(g); }).map(x => (st.near ? x : (({_km, ...o}) => o)(x)));
                if (page.total > page.rows.length) found.truncated = page.total;
            }
            if (my !== cur.seq) return;
            const total = found.truncated ? Math.max(found.length, found.truncated) : found.length;
            cur.zone = {total}; cur.rows = found.slice(0, MAP_MAX); cur.mapView = view;
            paintMap(res);
        } catch (e) {
            console.error(e); btn.disabled = false; btn.textContent = '⤓ ' + T('Charger les points de cette zone');
            toast(T('Cette liste ne sait pas chercher dans une zone de la carte : ajoute plutôt un critère (📍 Autour de…).'), 'error');
        }
    }
    /** ⚙ Colonnes : cocher celles à montrer (retenu avec la recherche de cette liste) ; 📍 GPS pour les listes avec positions */
    function openCols() {
        const d = cur.d, st = cur.st, base = (d.fields || []).filter(f => f.type !== 'url' && !f.hidden), hide = Array.isArray(st.hide) ? st.hide : [];
        editor(`<b>⚙ ${esc(T('Colonnes'))}</b><div class="ld-ed-list ld-cols-list">${base.map(f => `<label class="checkbox-line"><input type="checkbox" name="c" value="${esc(f.key)}" ${hide.includes(f.key) ? '' : 'checked'}> ${esc(flab(f))}</label>`).join('')}
            ${d.geo ? `<label class="checkbox-line"><input type="checkbox" name="gps" data-ld-col-gps ${st.gps ? 'checked' : ''}> ${esc(T('📍 GPS'))} <small class="muted">${esc(T('(latitude, longitude ; aussi dans l’export)'))}</small></label>` : ''}</div>`,
        form => {
            const on = [...form.querySelectorAll('input[name="c"]')].filter(i => i.checked).map(i => i.value);
            if (!on.length) { toast(T('Garde au moins une colonne.'), 'error'); return false; }
            st.hide = base.map(f => f.key).filter(k => !on.includes(k)); st.gps = !!form.querySelector('[data-ld-col-gps]')?.checked;
            if (st.hide.includes(st.sort)) st.sort = '';
            rerun();
        });
    }

    /* ═════════════ les petites fenêtres : un critère, la période, autour d'un lieu ═════════════ */
    function editor(html, onOk, focusSel) {
        const box = ws()?.querySelector('[data-ld-editor]'); if (!box) return null;
        box.innerHTML = `<form class="ld-ed-form">${html}<div class="ld-ed-actions"><button type="button" class="button small secondary" data-ld-ed-cancel>${esc(T('Annuler'))}</button><button type="submit" class="button small">${esc(T('Appliquer'))}</button></div></form>`;
        box.hidden = false;
        const form = box.querySelector('form');
        form.addEventListener('submit', e => { e.preventDefault(); if (onOk(form) !== false) { box.hidden = true; box.innerHTML = ''; } });
        form.querySelector('[data-ld-ed-cancel]').addEventListener('click', () => { box.hidden = true; box.innerHTML = ''; });
        form.addEventListener('keydown', e => { if (e.key === 'Escape') { box.hidden = true; box.innerHTML = ''; } });
        setTimeout(() => (form.querySelector(focusSel || 'input, select'))?.focus());
        return form;
    }
    const pickerHtml = (name, title) => (window.LCNDA_PICKER?.pickerField ? `<div class="pk-host ld-pk" data-ld-pk="${esc(name)}">${window.LCNDA_PICKER.pickerField({name, kind: 'place', inline: true, allowFree: false, allowCreate: false, value: null}).replace(` name="${name}"`, '')}</div>` : `<input name="${esc(name)}_txt" placeholder="${esc(title)}">`);
    async function enumValues(d, key, st) {
        const f = fieldOf(d, key);
        if (!d.query) { const rows = localFilter(d, await loadAll(d), st, key); const n = new Map(); rows.forEach(r => [].concat(r[key] ?? []).forEach(v => { if (v == null || v === '') return; n.set(String(v), (n.get(String(v)) || 0) + 1); })); (f.values || []).forEach(v => { if (!n.has(String(v))) n.set(String(v), 0); }); return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')); }
        if (d.facet) { try { const r = await d.facet(key, buildQuery({...st, crit: st.crit.filter(c => c.key !== key)})); if (Array.isArray(r) && r.length) return r.map(x => (Array.isArray(x) ? [String(x[0]), x[1]] : [String(x), null])); } catch (_) {} }
        return (f.values || []).map(v => [String(v), null]);
    }
    async function openCrit(key, editIndex = -1) {
        const d = cur.d, st = cur.st, f = fieldOf(d, key), kind = kindOf(f), old = editIndex >= 0 ? st.crit[editIndex] : null, lab = esc(T(f.label)), unitAttr = f.unit ? ` data-unit="${esc(T(f.unit))}"` : '';
        const done = c => { if (editIndex >= 0) st.crit.splice(editIndex, 1, c); else st.crit.push(c); rerun(); };
        if (kind === 'daterange') {
            editor(`<b>${lab}</b><div class="ld-ed-row"><label>${esc(T('du'))} <input name="from" type="date" value="${esc(old?.from ?? '')}"></label><label>${esc(T('au'))} <input name="to" type="date" value="${esc(old?.to ?? '')}"></label></div>`,
                form => { const a = form.elements.from.value, b = form.elements.to.value; if (!a && !b) { toast(T('Choisis au moins une date.'), 'error'); return false; } done({key, kind, from: a, to: b}); });
            return;
        }
        if (kind === 'range') {
            editor(`<b>${lab}</b><div class="ld-ed-row"><label>${esc(T('de'))} <input name="from" type="number" inputmode="numeric"${unitAttr} value="${esc(old?.from ?? '')}"></label><label>${esc(T('à'))} <input name="to" type="number" inputmode="numeric"${unitAttr} value="${esc(old?.to ?? '')}"></label></div><small class="muted">${esc(T('Une seule case suffit : « de 1850 » = 1850 et après.'))}</small>`,
                form => { const a = form.elements.from.value.trim(), b = form.elements.to.value.trim(); if (!a && !b) { toast(T('Écris au moins un nombre.'), 'error'); return false; } done({key, kind, from: a === '' ? '' : Number(a), to: b === '' ? '' : Number(b)}); });
            return;
        }
        if (kind === 'bool') { editor(`<b>${lab}</b><div class="ld-ed-row"><label class="checkbox-line"><input type="radio" name="v" value="1" ${old?.value !== false ? 'checked' : ''}> ${esc(T('oui'))}</label><label class="checkbox-line"><input type="radio" name="v" value="0" ${old?.value === false ? 'checked' : ''}> ${esc(T('non'))}</label></div>`, form => done({key, kind, value: form.elements.v.value === '1'})); return; }
        if (kind === 'place') {
            const form = editor(`<b>${lab}</b>${pickerHtml('ld_crit_place', T('Commune'))}<label>${esc(T('ou écris un nom'))} <input name="txt" value="${esc(old?.value || '')}"></label>`, form => { const v = (form.dataset.pick || form.elements.txt.value || '').trim(); if (!v) { toast(T('Choisis une commune.'), 'error'); return false; } done({key, kind, value: v}); });
            form?.addEventListener('picker-change', e => { const it = e.detail?.item; form.dataset.pick = it ? (it.name || String(it.title || '').replace(/\s*\(.*\)$/, '')) : ''; if (it) form.elements.txt.value = form.dataset.pick; });
            return;
        }
        if (kind === 'enum') {
            const form = editor(`<b>${lab}</b><input type="search" class="ld-ed-filter" data-ld-ed-filter placeholder="${esc(T('Chercher un choix…'))}"><div class="ld-ed-list" data-ld-ed-list>${UI().spinner ? UI().spinner(T('Chargement…'), {inline: true}) : '…'}</div>`,
                form => { const cl = form.querySelector('.ui-choice'), vals = cl ? cl.values : [...form.querySelectorAll('[data-ld-ed-list] input:checked')].map(i => i.value); if (!vals.length) { toast(T('Coche au moins un choix.'), 'error'); return false; } done({key, kind, values: vals}); }, '[data-ld-ed-filter]');
            if (!form) return;
            const vals = await enumValues(d, key, st).catch(() => []), have = new Set(old?.values || []);
            const list = form.querySelector('[data-ld-ed-list]'); if (!list) return;
            if (!vals.length) { list.innerHTML = `<label>${esc(T('Valeur'))} <input name="free" data-ld-free></label>`; form.addEventListener('submit', e => { const v = form.elements.free?.value.trim(); if (v) { e.stopImmediatePropagation(); e.preventDefault(); done({key, kind: 'text', op: 'eq', value: v}); ws().querySelector('[data-ld-editor]').hidden = true; } }, true); return; }
            // la liste de choix commune (app-ui.js) : 🔍 sans accents, cochés en haut, « 3 choix sur 214 », par nombre / A → Z, Entrée, ↓, toute la liste (par morceaux)
            list.classList.add('is-choice'); list.replaceChildren(UI().choiceList({items: vals.map(([v, n]) => [v, n, v]), checked: [...have], multiple: true, key: `ld:${d.id}:${key}`, label: T(f.label), search: form.querySelector('[data-ld-ed-filter]')}));
            return;
        }
        const ops = [['contains', T('contient')], ['starts', T('commence par')], ['eq', T('est exactement')], ['notempty', T('est rempli')], ['empty', T('est vide')]];
        editor(`<b>${lab}</b><div class="ld-ed-row"><select name="op" aria-label="${esc(T('Comment'))}">${ops.map(([v, l]) => `<option value="${v}" ${(old?.op || 'contains') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><input name="v" value="${esc(old?.value || '')}" aria-label="${esc(T('Texte'))}"></div>`,
            form => { const op = form.elements.op.value, v = form.elements.v.value.trim(); if (!v && !['empty', 'notempty'].includes(op)) { toast(T('Écris un texte.'), 'error'); return false; } done({key, kind: 'text', op, value: v}); }, 'input[name="v"]');
    }
    function openAdd(btn) {
        const d = cur.d, fs = (d.fields || []).filter(f => f.type !== 'url' && !f.hidden);
        const icon = f => ({year: '📅', date: '📅', number: '#', enum: '☰', place: '📍', bool: '☑'}[f.type] || '🔤');
        const xs = d.geo ? xfAll().filter(f => !f.needs || f.needs === 'geo') : [];
        UI().menuAt?.(btn, [...fs.map(f => ({icon: icon(f), label: flab(f), run: () => openCrit(f.key)})), xs.length ? '-' : null, ...xs.map(f => ({icon: f.icon || '🧩', label: T(f.label || f.id), run: () => openXf(f)}))], {title: T('Ajouter un critère')});
    }
    async function openXf(x, editIndex = -1) {
        const st = cur.st, old = editIndex >= 0 ? st.crit[editIndex] : null;
        const form = editor(`<b>${esc(x.icon || '🧩')} ${esc(T(x.label || x.id))}</b><select name="v" data-ld-xf="${esc(x.id)}" aria-label="${esc(T(x.label || x.id))}"><option value="">${esc(T('Chargement…'))}</option></select>`,
            form => { const sel = form.elements.v; if (!sel.value) { toast(T('Choisis dans la liste.'), 'error'); return false; }
                const c = {kind: 'xf', fid: x.id, value: sel.value, valueLabel: sel.selectedOptions[0]?.textContent || sel.value};
                if (editIndex >= 0) st.crit.splice(editIndex, 1, c); else st.crit.push(c); rerun(); }, 'select');
        if (!form) return;
        let opts = []; try { opts = (await x.options?.()) || []; } catch (_) {}
        const sel = form.elements.v; if (!sel) return;
        sel.innerHTML = opts.length ? opts.map(o => `<option value="${esc(o.value)}"${String(old?.value) === String(o.value) ? ' selected' : ''}>${esc(o.label ?? o.value)}</option>`).join('') : `<option value="">${esc(T('Rien à choisir pour l’instant.'))}</option>`;
    }
    function openPeriod() {
        const p = cur.st.period || {mode: 'in', from: '', to: ''};
        const form = editor(`<b>📅 ${esc(T('Période'))}</b><div class="ld-ed-row">${PERIOD_MODES().map(([v, l]) => `<label class="checkbox-line"><input type="radio" name="mode" value="${v}" ${p.mode === v ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
            <div class="ld-ed-row"><label data-ld-pa><span data-ld-pa-lab>${esc(T('année'))}</span> <input name="from" type="number" inputmode="numeric" value="${esc(p.from ?? '')}"></label><label data-ld-pb>${esc(T('et'))} <input name="to" type="number" inputmode="numeric" value="${esc(p.to ?? '')}"></label></div>
            <small class="muted">${esc(T('« En l’an » : ce qui existait cette année-là. « Entièrement entre » : commencé et fini dans la période. « Qui touche » : au moins une année dans la période.'))}</small>`,
        form => { const mode = form.elements.mode.value, a = form.elements.from.value.trim(), b = form.elements.to.value.trim();
            if (!a || (mode !== 'in' && !b)) { toast(T('Écris les années.'), 'error'); return false; }
            let from = Number(a), to = mode === 'in' ? Number(a) : Number(b); if (to < from) [from, to] = [to, from];
            cur.st.period = {mode, from, to}; rerun(); }, 'input[name="from"]');
        if (!form) return;
        const sync2 = () => { const m = form.elements.mode.value; form.querySelector('[data-ld-pb]').hidden = m === 'in'; form.querySelector('[data-ld-pa-lab]').textContent = m === 'in' ? T('année') : T('entre'); };
        form.addEventListener('change', sync2); sync2();
    }
    function openNear() {
        const n = cur.st.near;
        const form = editor(`<b>📍 ${esc(T('Autour d’une commune'))}</b>${pickerHtml('ld_near_place', T('Commune'))}${n ? `<small class="muted" data-ld-near-now>${esc(T('Maintenant : {p}', {p: n.title}))}</small>` : ''}<div class="ld-ed-row"><label>${esc(T('à'))} <input name="km" type="number" min="0.1" max="2000" step="any" inputmode="decimal" value="${esc(n?.km ?? 20)}"> km</label></div>`,
            form => { const it = form._pick || (n ? {lat: n.lat, lon: n.lon, title: n.title} : null); const k = Number(form.elements.km.value);
                if (!it) { toast(T('Choisis une commune.'), 'error'); return false; }
                if (!Number.isFinite(Number(it.lat)) || !Number.isFinite(Number(it.lon))) { toast(T('Cette commune n’a pas de position sur la carte.'), 'error'); return false; }
                if (!(k > 0)) { toast(T('Écris une distance en km.'), 'error'); return false; }
                cur.st.near = {lat: Number(it.lat), lon: Number(it.lon), km: Math.min(2000, k), title: it.title}; if (!cur.st.sort) cur.st.sort = '_km'; rerun(); }, '.pk-input');
        form?.addEventListener('picker-change', e => { const it = e.detail?.item; form._pick = it ? {lat: it.lat ?? it.latitude, lon: it.lon ?? it.longitude, title: it.name || it.title} : null; });
    }

    /* ═════════════ exporter, envoyer, imprimer ═════════════ */
    async function allRows() {
        const d = cur.d, st = cur.st;
        if (!d.query) return (await fetchPage(d, st, 0, EXPORT_MAX)).all.slice(0, EXPORT_MAX);
        const out = []; let total = Infinity;
        while (out.length < Math.min(total, EXPORT_MAX)) { const p = await fetchPage(d, st, out.length, 2000); total = p.total; if (!p.rows.length) break; out.push(...p.rows); }
        return out.slice(0, EXPORT_MAX);
    }
    const table2d = rows => {
        const d = cur.d, cs = [...cols(d, cur.st), ...urlFields(d)].flatMap(f => (f.gps ? [{key: '_lat', label: 'latitude', gi: 0}, {key: '_lon', label: 'longitude', gi: 1}] : [f])); // 📍 GPS → deux colonnes, en degrés décimaux (point)
        const val = (f, v) => (v == null ? '' : Array.isArray(v) ? v.join(' · ') : f.type === 'bool' ? (v && v !== 'non' && v !== '0' ? T('oui') : T('non')) : v);
        return [cs.map(f => (f.gi != null ? f.label : flab(f))), ...rows.map(r => cs.map(f => { if (f.gi == null) return val(f, r[f.key]); const g = geoOf(d, r); return g ? Number(g[f.gi].toFixed(6)) : ''; }))];
    };
    const critSummary = () => { const d = cur.d, st = cur.st; return [st.q ? `« ${st.q} »` : '', ...st.crit.map(c => critText(d, c)), st.period ? periodText(st.period) : '', st.near ? nearText(st.near) : ''].filter(Boolean).join(' · '); };
    async function exportCsv() {
        let rows; try { rows = await allRows(); } catch (e) { return toast(e.message, 'error'); }
        const cell = A().csvCell || (v => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)));
        const csv = '﻿' + table2d(rows).map(r => r.map(v => cell(v, {sep: ';'})).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
        a.download = `${(A().safeExportFilename ? A().safeExportFilename(T(cur.d.label), 'liste') : 'liste')}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(rows.length >= EXPORT_MAX ? T('Les {n} premières lignes sont exportées.', {n: nf(EXPORT_MAX)}) : T('{n} lignes exportées.', {n: nf(rows.length)}));
    }
    async function sendRows(btn) {
        if (!ext.sendTo) return toast(T('« Envoyer vers… » n’est pas chargé.'), 'error');
        let rows; try { rows = (await allRows()).slice(0, 5000); } catch (e) { return toast(e.message, 'error'); }
        const name = [T(cur.d.label), critSummary()].filter(Boolean).join(' — ');
        return ext.sendTo('rows', {rows: table2d(rows), name}, {anchor: btn, title: T(cur.d.label)});
    }
    async function print() {
        let rows; try { rows = (await allRows()).slice(0, 3000); } catch (e) { return toast(e.message, 'error'); }
        const t = table2d(rows), title = T(cur.d.label), sum = critSummary();
        const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#444;font-size:12px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}</style></head><body>
            <h1>${esc((cur.d.icon || '') + ' ' + title)}</h1><p>${esc([sum, countText()].filter(Boolean).join(' · '))}${cur.d.source ? `<br>${esc(T('Source :'))} ${esc(cur.d.source)}` : ''}</p>
            <table><thead><tr>${t[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.slice(1).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
        if (UI().openPrintDialog) return UI().openPrintDialog({title, html: doc, photos: false});
        toast(T('L’impression n’est pas chargée.'), 'error');
    }
    async function saveSearch() {
        const st = cur.st, d = cur.d;
        if (!st.q && !st.crit.length && !st.period && !st.near) return toast(T('Choisis d’abord une recherche ou un critère.'), 'error');
        const ask = A().askText ? A().askText({title: T('Enregistrer cette recherche'), message: T('Un nom pour la retrouver d’un clic, au-dessus de la liste.'), placeholder: T('ex. Autour de Tulle avant 1900'), okLabel: T('★ Enregistrer')}) : Promise.resolve(window.prompt(T('Nom de la recherche')));
        const name = String(await ask || '').trim().slice(0, 60); if (!name) return;
        const next = savedOf(d.id).filter(x => x.name !== name); next.push({name, st: {q: st.q, crit: st.crit, period: st.period, near: st.near, sort: st.sort, dir: st.dir}, at: new Date().toISOString()});
        setSaved(d.id, next); paintSaved(); toast(T('Recherche gardée sous « {name} ».', {name}));
    }

    /* ↳ une ligne qui ouvre une sous-liste (d.sub(row) → {view, preset: {crit…}, title, pickAll: 'Toutes ses étapes'}) :
     *  la même page, dans la vue donnée, filtrée ; un bandeau « ← titre · ☑ Toutes ses étapes (N) » (app-listes-choix.js coche tout) */
    function openSub(dv, row) {
        let s = null; try { s = dv.sub(row); } catch (e) { toast(e.message, 'error'); return; }
        if (!s) return;
        cur.parent = {title: s.title || '', pickAll: s.pickAll || '', back: {...cur.st}};
        cur.st = {...cur.st, ...(s.preset || {}), crit: [...(s.preset?.crit || [])], view: 'table', dview: s.view || cur.st.dview, sort: s.preset?.sort || ''};
        const q = ws()?.querySelector('[data-ld-q]'); if (q) q.value = cur.st.q || '';
        paintParent(); rerun();
    }
    function closeSub() { if (!cur.parent) return; cur.st = {...cur.parent.back}; cur.parent = null; const q = ws()?.querySelector('[data-ld-q]'); if (q) q.value = cur.st.q || ''; paintParent(); rerun(); }
    function paintParent() {
        const page = ws()?.querySelector('.ld-page'); if (!page) return; let box = page.querySelector('[data-ld-parent]');
        if (!cur.parent) { box?.remove(); return; }
        if (!box) { box = document.createElement('div'); box.className = 'ld-parent'; box.dataset.ldParent = ''; page.querySelector('.ld-bar')?.before(box); }
        box.innerHTML = `<button type="button" class="button small secondary" data-ld-parent-back>← ${esc(T('Revenir'))}</button><b>${esc(cur.parent.title)}</b>${cur.parent.pickAll && ext.listesChoix ? `<button type="button" class="button small secondary" data-ld-pickall>☑ ${esc(T(cur.parent.pickAll))}</button>` : ''}`;
    }
    /** ce que la page donne aux fichiers qui s'y branchent (☑ choix, 🗂 thèmes) */
    const pageApi = () => ({d: cur.d, base: cur.base, state: () => cur.st, rows: () => cur.rows, total: () => cur.total, more: () => cur.more, allRows, table2d, critSummary, rerun, refresh, parent: () => cur.parent, geoOf, periodOf, countText});
    function bindPage(host, d) {
        const q = host.querySelector('[data-ld-q]'); let tq = 0;
        q?.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { cur.st.q = q.value.trim(); rerun(); }, 300); });
        host.addEventListener('click', e => {
            const t = e.target; let b;
            if ((b = t.closest('[data-ld-add]'))) return openAdd(b);
            if (t.closest('[data-ld-period]')) return openPeriod();
            if (t.closest('[data-ld-near]')) return openNear();
            if ((b = t.closest('[data-ld-view]'))) { cur.st.view = b.dataset.ldView; return rerun(); }
            if ((b = t.closest('[data-ld-dview]'))) { cur.st.view = 'table'; if (cur.st.dview !== b.dataset.ldDview) { cur.st.dview = b.dataset.ldDview; cur.st.sort = ''; cur.parent = null; paintParent(); } return rerun(); }
            if ((b = t.closest('[data-ld-qchip]'))) { const id = b.dataset.ldQchip, on = new Set(cur.st.chips || []); if (on.has(id)) on.delete(id); else on.add(id); cur.st.chips = [...on]; rerun(); setTimeout(() => ws()?.querySelector(`[data-ld-qchip="${CSS.escape(id)}"]`)?.focus()); return; }
            if (t.closest('[data-ld-parent-back]')) return closeSub();
            if ((b = t.closest('[data-ld-vchip]'))) { const key = valueChips(cur.base || d), v = b.dataset.ldVchip, i = cur.st.crit.findIndex(c => c.key === key && c.chip), was = i >= 0 && cur.st.crit[i].values?.[0] === v;
                if (i >= 0) cur.st.crit.splice(i, 1); if (!was) cur.st.crit.push({key, kind: 'enum', values: [v], chip: true}); rerun(); setTimeout(() => ws()?.querySelector(`[data-ld-vchip="${CSS.escape(v)}"]`)?.focus(), 50); return; }
            if (t.closest('[data-ld-save]')) return saveSearch();
            if ((b = t.closest('[data-ld-export]'))) return exportCsv(b);
            if ((b = t.closest('[data-ld-send]'))) return sendRows(b);
            if (t.closest('[data-ld-print]')) return print();
            if ((b = t.closest('[data-ld-more]'))) return more(b);
            if (t.closest('[data-ld-clear]')) { cur.st = {...blank(), view: cur.st.view, hide: cur.st.hide, gps: cur.st.gps, chips: cur.st.chips, dview: cur.st.dview}; if (q) q.value = ''; return rerun(); }
            if (t.closest('[data-ld-cols]')) return openCols();
            if ((b = t.closest('[data-ld-zone]'))) return loadZone(b);
            if (t.closest('[data-ld-zone-reset]')) return refresh();
            if (t.closest('[data-ld-back-map-go]')) { const b0 = cur.backMap; cur.backMap = null; if (b0?.view) cur.mapView = b0.view; cur.mapReopen = b0?.key || null; cur.st.view = 'map'; return rerun(); }
            if ((b = t.closest('[data-ld-gps-copy]'))) { const g = geoOf(cur.d, cur.rows[Number(b.dataset.ldGpsCopy)] || {}); if (g) copyText(gpsPlain(g)).then(ok => toast(ok ? T('Coordonnées copiées : {v}', {v: gpsPlain(g)}) : T('Copie impossible : {v}', {v: gpsPlain(g)}), ok ? undefined : 'error')); return; }
            if ((b = t.closest('[data-ld-gps-map]'))) { const g = geoOf(cur.d, cur.rows[Number(b.dataset.ldGpsMap)] || {}); if (g) { cur.mapView = {lat: g[0], lon: g[1], zoom: 13}; cur.mapFocus = g; cur.st.view = 'map'; rerun(); } return; }
            if ((b = t.closest('[data-ld-chip]'))) {
                const k = b.dataset.ldChip;
                if (k === 'period') cur.st.period = null; else if (k === 'near') { cur.st.near = null; if (cur.st.sort === '_km') cur.st.sort = ''; } else cur.st.crit.splice(Number(k.slice(5)), 1);
                return rerun();
            }
            if ((b = t.closest('[data-ld-sort]'))) { const k = b.dataset.ldSort; if (cur.st.sort === k) cur.st.dir = cur.st.dir === 'asc' ? 'desc' : 'asc'; else { cur.st.sort = k; cur.st.dir = 'asc'; } return rerun(); }
            if ((b = t.closest('[data-ld-open]'))) { const i = Number(b.dataset.ldOpen), r = cur.rows[i], dv = cur.d; if (r) { try { if (dv.sub) openSub(dv, r); else dv.open(r, {tr: b.closest('tr'), i, page: host}); } catch (x) { toast(x.message, 'error'); } } return; }
            if ((b = t.closest('[data-ld-saved-go]'))) { const s = savedOf(d.id)[Number(b.dataset.ldSavedGo)]; if (s) { cur.st = {...blank(), ...s.st, view: cur.st.view, hide: cur.st.hide, gps: cur.st.gps, chips: cur.st.chips, dview: cur.st.dview}; if (q) q.value = cur.st.q || ''; rerun(); } return; }
            if ((b = t.closest('[data-ld-saved-x]'))) {
                const s = savedOf(d.id)[Number(b.dataset.ldSavedX)]; if (!s) return;
                const drop = () => setSaved(d.id, savedOf(d.id).filter(x => x.name !== s.name));
                if (A().undoLocalChange) A().undoLocalChange(T('Recherche « {name} » oubliée', {name: s.name}), [SAVED], drop, () => paintSaved()); else drop();
                return paintSaved();
            }
        });
    }

    /* ═════════════ « 🧰 Toutes les données » : le sommaire, par groupe ═════════════ */
    async function renderOverview(token) {
        const host = ws(); if (!host) return; ensureCss();
        if (ext.listesThemes?.overview && ext.listesThemes.mode?.() === 'themes') return ext.listesThemes.overview(host, token); // 🗂 par thème (app-listes-themes.js) ; les 4 groupes d'avant : Réglages
        const ds = all().filter(shown);
        const card = d => `<button type="button" class="ld-card" data-ld-go="${esc(d.link ? 'link:' + d.id : keyOf(d))}"><span class="ld-card-ico" aria-hidden="true">${esc(d.icon || '📋')}</span><span class="ld-card-txt"><b>${esc(T(d.label))}</b>${d.source ? `<small class="muted">${esc(d.source)}</small>` : ''}</span><span class="ld-card-state" data-ld-state="${esc(d.id)}">${d.link ? '↗' : ''}</span></button>`;
        host.innerHTML = `<section class="page collection-page ld-page ld-overview">${UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · 🧰 ${T('Données')}`, icon: '🧰', title: T('Toutes les données'), help: esc(T('Chaque jeu de données en liste : cherche par année, par lieu, autour d’une ville, combine les critères, vois-les sur la carte.'))}) : ''}
            <input type="search" class="ld-q" data-ld-ov-q placeholder="${esc(T('Chercher une liste…'))}" aria-label="${esc(T('Chercher une liste'))}">
            ${GROUPS.map(([g, ic]) => { const list = ds.filter(d => groupOf(d) === g); return list.length ? `<section class="ld-group" data-ld-group="${esc(g)}"><h3>${esc(ic)} ${esc(T(g))}</h3><div class="ld-cards">${list.map(card).join('')}</div></section>` : ''; }).join('')}</section>`;
        host.querySelector('[data-ld-ov-q]')?.addEventListener('input', e => { const v = fold(e.target.value); host.querySelectorAll('.ld-card').forEach(c => { c.hidden = !!v && !fold(c.textContent).includes(v); }); host.querySelectorAll('.ld-group').forEach(s => { s.hidden = ![...s.querySelectorAll('.ld-card')].some(c => !c.hidden); }); });
        host.querySelector('.ld-overview')?.addEventListener('click', e => { const b = e.target.closest('[data-ld-go]'); if (!b) return; const v = b.dataset.ldGo;
            if (v.startsWith('link:')) { const d = all().find(x => x.id === v.slice(5)); try { d?.link(); } catch (x) { toast(x.message, 'error'); } return; }
            openKey(v); });
        // pas encore installé : une petite pastille (sans attendre)
        ds.filter(d => d.installed && !d.link).forEach(async d => { let ok = true, err = ''; try { ok = await isInstalled(d); } catch (e) { err = e?.message || String(e); } const el = host.querySelector(`[data-ld-state="${CSS.escape(d.id)}"]`); if (!el) return;
            if (err) { el.innerHTML = UI().badge ? UI().badge('⚠ ' + T('Vérification impossible'), 'yellow') : esc('⚠ ' + T('Vérification impossible')); el.title = T('Impossible de vérifier si ces données sont installées : {e}', {e: err}); } // pas « à installer » : on ne sait pas
            else if (!ok) el.innerHTML = UI().badge ? UI().badge(T('à installer'), 'grey') : esc(T('à installer')); });
        void token;
    }
    function openKey(k, preset = null) {
        const app = A(), st = app.state; if (!st) return;
        const d = byKey(k); if (preset && d) saveState(d.id, {...blank(), ...preset});
        if (st.module === 'donnees' && ext.donneesOnglet?.open) return ext.donneesOnglet.open(k); // 📊 ouvert depuis l'onglet Données : on y reste (app-donnees-onglet.js)
        st.listType = k; st.precisePlaceKey = '';
        if (st.module === 'listes') { app.renderSidebar?.(); ext.lists[k]?.(++st.workspaceToken); } else app.setModule?.('listes');
    }
    /** ouvrir une liste de données d'ailleurs, déjà filtrée : LCNDA_EXT.dataListsEngine.open('hist_gares', {near: {lat, lon, km, title}}) */
    ext.dataListsEngine = {open: (id, preset) => { const d = all().find(x => x.id === id); if (d) openKey(d.link ? null : keyOf(d), preset); }, keyOf, list: () => all(), applyLocal: localFilter, fetchPage, stateOf, critText, periodText, nearText, buildQuery,
        render: (d, token) => renderList(d, token), crumb, overview: token => renderOverview(token), sync: () => sync(), openKey, forget, loadAll, isInstalled, installState, forgetInstalls, shown, groupOf, geoOf, periodOf, km, fold, page: () => (cur.d && ws()?.querySelector('.ld-page') ? pageApi() : null), blank, sortRows, viewDef};

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * Les données déjà dans l'app (packs, fichiers livrés) : leurs listes, sans toucher à leurs fichiers.
     * ═════════════════════════════════════════════════════════════════════════════════════════ */
    const api = (a, q) => A().api(a, q);
    let ldStatus = null, ldStatusAt = 0;
    // une erreur du serveur n'est pas « pas installé » : elle remonte (installState → le message), et rien n'est gardé
    const ldInstalled = async src => { if (!ldStatus || Date.now() - ldStatusAt > 15000) { ldStatusAt = Date.now(); const p = ldStatus = api('ld_status').catch(e => { if (ldStatus === p) ldStatus = null; throw e; }); } const r = await ldStatus; if (r.errors?.[src]) throw new Error(r.errors[src]); return !!r.installed?.[src]; }; // le pack ne s'ouvre pas : son erreur, pas « pas installé »
    /** ⤓ une installation finie, retirée ou ↶ : plus rien de gardé en mémoire (ici ; 🗂 thèmes, 📊 récap, 🗂 Données écoutent « lcnda:installs-changed ») */
    function forgetInstalls() { ldStatus = null; ldStatusAt = 0; try { window.dispatchEvent(new CustomEvent('lcnda:installs-changed')); } catch (_) {} }
    // chaque pack s'installe par un POST …_finish (hist_pack_finish, meteo_pack_finish, bo_dl_finish…), donnees_maj_apply, …_undo / _remove / _restore :
    // la page ouverte de 📊 Données (liste « pas encore installée », thèmes, récap) se redessine toute seule, sans recharger l'app
    let redrawT = 0;
    window.addEventListener('lcnda:data-changed', e => {
        if (!/_(finish|apply|undo|remove|restore)$|^donnees_maj_/.test(String(e.detail?.action || ''))) return;
        forgetInstalls();
        clearTimeout(redrawT); redrawT = setTimeout(() => {
            const st = A().state, host = ws(); if (!st || !host || !['donnees', 'listes'].includes(st.module)) return; // Réglages : relu en y revenant
            const page = host.querySelector('.ld-page');
            const gone = /_(undo|remove|restore)$/.test(String(e.detail?.action || '')); // un pack retiré (ou ↶) : une liste affichée peut ne plus l'être
            if (page ? !page.matches('[data-ld-missing]') && !(gone && cur.base?.installed) : st.module !== 'donnees' && !host.querySelector('.ldt-overview, .ldt-theme-page')) return; // une liste déjà affichée : rien à redessiner
            try { A().refreshScreen ? A().refreshScreen() : (page && cur.base && renderList(cur.base, st.workspaceToken)); } catch (err) { console.error(err); }
        }, 300);
    });
    const ldQuery = src => async query => { const r = await api('ld_query', {src, query: JSON.stringify(query || {})}); return {rows: r.rows || [], total: r.total || 0, more: !!r.more}; };
    const ldFacet = src => async (key, query) => (await api('ld_facet', {src, key, query: JSON.stringify(query || {})})).values || [];
    const goSettings = tab => { const st = A().state; if (!st) return; st.maintenanceTab = tab; A().persistUiState?.(); A().setModule?.('maintenance'); };
    const openUrl = u => { if (u) window.open(u, '_blank', 'noopener'); };
    const yr = s => { const m = String(s ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; };
    const geoLL = r => (r.lat != null && r.lon != null ? [r.lat, r.lon] : null);
    const pack = (src, o) => ({...o, query: ldQuery(src), facet: ldFacet(src), installed: () => ldInstalled(src)});
    const HIST = 'Histoire du lieu (pack LCNDA)';
    const histInstall = () => (ext.histoire?.dl ? goSettings('histoire') : goSettings('histoire'));
    const BUILT_IN = [
        /* 🏘 Histoire du lieu (lib/histoire.php) */
        pack('hist_vendanges', {id: 'hist_vendanges', icon: '🍇', label: 'Dates des vendanges (27 régions)', group: 'Le monde', source: 'Daux et al. (2012), NOAA / WDS-Paleo', sourceUrl: 'https://www.ncei.noaa.gov/access/paleo-search/study/13194',
            fields: [{key: 'region', label: 'Région viticole', type: 'enum'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'date', label: 'Début des vendanges', type: 'date'}, {key: 'diff', label: 'Écart à la moyenne', unit: 'jours', type: 'number'}, {key: 'kind', label: 'Vendanges', type: 'enum'}],
            period: r => [r.year, r.year], geo: geoLL, install: histInstall}),
        pack('hist_communes', {id: 'hist_communes', icon: '👥', label: 'Population des communes (1876 → 2023)', group: 'Le lieu', source: '©Insee, recensements de la population (Licence Ouverte)', sourceUrl: 'https://www.insee.fr/fr/statistiques/3698339',
            fields: [{key: 'commune', label: 'Commune', type: 'place'}, {key: 'dep', label: 'Département', type: 'enum'}, {key: 'code', label: 'Code Insee', type: 'text'}, {key: 'p1876', label: 'Habitants en 1876', type: 'number'}, {key: 'p1901', label: 'en 1901', type: 'number'},
                {key: 'p1936', label: 'en 1936', type: 'number'}, {key: 'p1968', label: 'en 1968', type: 'number'}, {key: 'p1999', label: 'en 1999', type: 'number'}, {key: 'p2023', label: 'en 2023', type: 'number'}, {key: 'max', label: 'Le plus d’habitants', type: 'number'}, {key: 'evolution', label: 'Évolution 1876 → 2023', unit: '%', type: 'number'}],
            geo: geoLL, install: histInstall, open: r => { const st = A().state; if (!st || !r.code) return; st.hVillage = r.code; st.listType = 'villages'; A().setModule?.('listes'); ext.lists?.villages?.(++st.workspaceToken); }}),
        pack('hist_gares', {id: 'hist_gares', icon: '🚂', label: 'Gares et ouverture du train', group: 'Le lieu', source: 'Wikidata (CC0) ; R. Jeansoulin, Un siècle de gares (ODbL)', sourceUrl: 'https://www.data.gouv.fr/datasets/un-siecle-de-gares-du-reseau-ferroviaire-francais-en-service-fermees-ou-disparues',
            fields: [{key: 'name', label: 'Gare', type: 'text'}, {key: 'year', label: 'Ouverture', type: 'year'}, {key: 'code', label: 'Code Insee', type: 'text'}, {key: 'source', label: 'Source', type: 'enum'}],
            period: r => [r.year, r.year == null ? null : 9999], geo: geoLL, install: histInstall}),
        pack('hist_seismes', {id: 'hist_seismes', icon: '🌋', label: 'Séismes d’Europe (1000 → 1899)', group: 'Le monde', source: 'EPICA v1.1, INGV (CC BY 4.0)', sourceUrl: 'https://emidius.eu/epica/',
            fields: [{key: 'zone', label: 'Lieu', type: 'text'}, {key: 'date', label: 'Date', type: 'date'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'intensity', label: 'Intensité à l’épicentre', type: 'number'}, {key: 'mw', label: 'Magnitude', type: 'number'}],
            period: r => [r.year, r.year], geo: geoLL, install: histInstall}),
        pack('hist_crues', {id: 'hist_crues', icon: '🌊', label: 'Inondations historiques (BDHI)', group: 'Le lieu', source: 'Géorisques, BDHI (Licence Ouverte)', sourceUrl: 'https://www.georisques.gouv.fr/base-de-donnees/BDHI',
            fields: [{key: 'title', label: 'Inondation', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'start', label: 'Début', type: 'date'}, {key: 'end', label: 'Fin', type: 'date'}, {key: 'communes', label: 'Communes touchées', type: 'text'}, {key: 'deps', label: 'Départements', type: 'text'}],
            period: r => [r.year, r.year], geo: geoLL, install: histInstall}),
        pack('hist_catnat', {id: 'hist_catnat', icon: '⚠️', label: 'Catastrophes naturelles reconnues (CatNat, depuis 1982)', group: 'Le lieu', source: 'Géorisques, base GASPAR (Licence Ouverte)', sourceUrl: 'https://www.georisques.gouv.fr/',
            fields: [{key: 'commune', label: 'Commune', type: 'place'}, {key: 'dep', label: 'Département', type: 'enum'}, {key: 'risk', label: 'Risque', type: 'enum'}, {key: 'start', label: 'Début', type: 'date'}, {key: 'end', label: 'Fin', type: 'date'}, {key: 'year', label: 'Année', type: 'year'}],
            period: r => [r.year, r.year], geo: geoLL, install: histInstall}),
        /* 📊 Prénoms d'ici et d'ailleurs (lib/prenoms_pays.php) */
        pack('pp_prenoms', {id: 'pp_prenoms', icon: '📊', label: 'Prénoms donnés, par pays, région et année', group: 'La personne', source: 'Insee, OFS, RRQ… (voir Prénoms d’ici et d’ailleurs)',
            fields: [{key: 'name', label: 'Prénom', type: 'text'}, {key: 'sex', label: 'Sexe', type: 'enum', values: ['fille', 'garçon']}, {key: 'year', label: 'Année', type: 'year'}, {key: 'zone', label: 'Zone', type: 'enum'}, {key: 'country', label: 'Pays', type: 'enum'},
                {key: 'n', label: 'Enfants', type: 'number'}, {key: 'rank', label: 'Rang', type: 'number'}, {key: 'permil', label: 'Pour mille', type: 'number'}],
            period: r => [r.year, r.year], install: host => (ext.prenomsPays?.panel && host ? ext.prenomsPays.panel(host) : toast(T('Installe le pack depuis Statistiques → Prénoms.'))),
            open: r => ext.prenomsPays?.openCurve?.({name: r.name, sex: r.sex === 'garçon' ? 1 : 2, zones: [r.zone_id].filter(Boolean), year: r.year})}),
        /* 🎖️ 🏅 Bases officielles (lib/bases_officielles.php) : la page « Chercher dans la base » reste là, la liste la complète */
        ...['mpf', 'leonore'].map(k => pack('bo_' + k, {id: 'bo_' + k, icon: k === 'mpf' ? '🎖️' : '🏅', label: k === 'mpf' ? 'Morts pour la France 1914–1918' : 'Légion d’honneur (base Léonore)', group: 'Chercher',
            source: k === 'mpf' ? 'Mémoire des hommes (ministère des Armées)' : 'Base Léonore (Archives nationales)', sourceUrl: k === 'mpf' ? 'https://www.memoiredeshommes.sga.defense.gouv.fr/' : 'https://www.leonore.archives-nationales.culture.gouv.fr/',
            fields: [{key: 'nom', label: 'Nom', type: 'text'}, {key: 'prenoms', label: 'Prénoms', type: 'text'}, {key: 'year', label: 'Né(e) en', type: 'year'}, {key: 'naiss', label: 'Naissance', type: 'text'}, {key: 'lieu', label: 'Lieu de naissance', type: 'place'}, {key: 'dep', label: 'Département', type: 'enum'},
                ...(k === 'mpf' ? [{key: 'deces', label: 'Décès', type: 'text'}, {key: 'lieu_deces', label: 'Lieu de décès', type: 'text'}, {key: 'unite', label: 'Unité', type: 'text'}, {key: 'grade', label: 'Grade', type: 'text'}] : [{key: 'cote', label: 'Cote', type: 'text'}]),
                {key: 'sexe', label: 'Sexe', type: 'enum'}, {key: 'url', label: 'La fiche en ligne', type: 'url'}],
            period: r => [r.year, r.year], install: () => (ext.officialBases?.openSettings ? ext.officialBases.openSettings() : goSettings('bases_officielles')), open: r => openUrl(r.url)})),
        /* 🏰 GOV (lib/gov.php) */
        pack('gov_noms', {id: 'gov_noms', icon: '🏰', label: 'Noms des lieux anciens (GOV)', group: 'Le lieu', source: 'GOV, gov.genealogy.net (CC BY-SA 3.0)', sourceUrl: 'https://gov.genealogy.net/',
            fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'lang', label: 'Langue', type: 'enum'}, {key: 'kind', label: 'Sorte', type: 'enum'}, {key: 'from', label: 'Depuis', type: 'year'}, {key: 'to', label: 'Jusqu’à', type: 'year'}, {key: 'gov', label: 'Identifiant GOV', type: 'text'}],
            period: r => [r.from ?? r.to, r.to ?? r.from], geo: geoLL, install: () => (ext.gov?.openSettings ? ext.gov.openSettings() : goSettings('gov')), open: r => ext.gov?.openObject?.(r.gov, r.from || '')}),
        /* 🗳 Élections d'autrefois (seulement si l'interrupteur est mis) */
        pack('elections', {id: 'elections', icon: '🗳', label: 'Élections, commune par commune', group: 'Le lieu', source: 'Élections d’autrefois (voir Réglages)', enabled: () => !!ext.elections?.isOn?.(),
            fields: [{key: 'commune', label: 'Commune', type: 'place'}, {key: 'dep', label: 'Département', type: 'enum'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'election', label: 'Élection', type: 'enum'}, {key: 'tour', label: 'Tour', type: 'number'},
                {key: 'first', label: 'En tête', type: 'text'}, {key: 'inscrits', label: 'Inscrits', type: 'number'}, {key: 'votants', label: 'Votants', type: 'number'}, {key: 'participation', label: 'Participation', unit: '%', type: 'number'}],
            period: r => [r.year, r.year], geo: geoLL, install: () => (ext.elections?.openSettings ? ext.elections.openSettings() : goSettings('elections'))}),
        /* 🌦 Stations météo des packs installés */
        pack('meteo_stations', {id: 'meteo_stations', icon: '🌦', label: 'Stations météo d’autrefois', group: 'Le lieu', source: 'Météo d’autrefois (packs installés)',
            fields: [{key: 'name', label: 'Station', type: 'text'}, {key: 'country', label: 'Pays', type: 'enum'}, {key: 'from', label: 'Relevés depuis', type: 'year'}, {key: 'to', label: 'jusqu’à', type: 'year'}, {key: 'alt', label: 'Altitude', unit: 'm', type: 'number'}, {key: 'source', label: 'Source', type: 'enum'}, {key: 'pack', label: 'Pack', type: 'enum'}],
            period: r => [r.from, r.to], geo: geoLL, install: () => (ext.meteo?.openSettings ? ext.meteo.openSettings() : goSettings('meteo'))}),

        /* 🗺 Frontières : les pays et leurs périodes (heritage-monde-contexte.js, CShapes) */
        {id: 'pays_frontieres', icon: '🗺', label: 'Pays et frontières, de 1816 à 2019', group: 'Le monde', source: 'CShapes 2.0 et CShapes-Europe, ETH Zürich (CC BY-NC-SA 4.0)', enabled: () => !!ext.mondeContexte?.load,
            fields: [{key: 'name', label: 'Pays', type: 'text'}, {key: 'from', label: 'De', type: 'year'}, {key: 'to', label: 'À', type: 'year'}, {key: 'status', label: 'Statut', type: 'enum'}, {key: 'today', label: 'Aujourd’hui (nom courant)', type: 'text'}],
            period: r => [r.from, r.to], geo: geoLL,
            load: async () => {
                const B = await ext.mondeContexte.load(), raw = B.raw, q = raw.q || 0.001, ST = {c: T('colonie'), p: T('protectorat'), o: T('occupé'), m: T('sous mandat'), l: T('territoire loué')};
                const nameAt = (gw, d) => { const per = raw.np?.[gw]; if (per) { const h = per.find(([a, b]) => d >= a && d < b); return (h || per[per.length - 1])[2]; } return raw.n?.[gw] || String(gw); };
                return raw.e.map(([gw, f, t, s, o, g]) => { const lab = raw.lab?.[g]; const own = s && o ? nameAt(o, f) : '';
                    return {name: nameAt(gw, f), from: Math.floor(f / 10000), to: t >= 20191231 ? 2019 : Math.floor(t / 10000), status: s ? `${ST[s] || s}${own ? ` (${own})` : ''}` : T('indépendant'), today: nameAt(gw, 20191231), lat: lab ? lab[1] * q : null, lon: lab ? lab[0] * q : null}; });
            }},
        /* 💶 Prix en Europe (heritage-prix-europe.js, Allen-Unger) */
        {id: 'prix_europe', icon: '💶', label: 'Prix des denrées dans les villes d’Europe', group: 'Le monde', source: 'Allen-Unger Global Commodity Prices Dataset, IISG (CC BY-SA 4.0)', sourceUrl: 'https://dataverse.nl/dataset.xhtml?persistentId=doi:10.34894/IPVXMW', enabled: () => !!ext.prixEurope?.load,
            fields: [{key: 'city', label: 'Ville', type: 'enum'}, {key: 'country', label: 'Pays', type: 'enum'}, {key: 'good', label: 'Denrée', type: 'enum'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'price', label: 'Prix (g d’argent fin)', type: 'number'}, {key: 'unit', label: 'Pour', type: 'enum'}],
            period: r => [r.year, r.year],
            load: async () => { const P = await ext.prixEurope.load(), out = [];
                Object.values(P.c || {}).forEach(c => Object.entries(c.g || {}).forEach(([g, ys]) => { const gd = P.goods?.[g] || {n: g, u: ''}; ys.forEach(([y, v]) => out.push({city: c.n, country: c.pays || '', good: gd.n, unit: gd.u ? `1 ${gd.u}` : '', year: y, price: v})); }));
                return out; }},
        /* ☄️ Comètes et aurores (heritage-ciel-heure.js) */
        {id: 'ciel_cometes', icon: '☄️', label: 'Grandes comètes et aurores', group: 'Le monde', source: 'Wikipédia (CC BY-SA 4.0), Wikidata (CC0)', enabled: () => !!ext.cielHeure?.loadSkyEvents,
            fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'kind', label: 'Sorte', type: 'enum', values: [T('comète'), T('aurore')]}, {key: 'from', label: 'Visible du', type: 'date'}, {key: 'to', label: 'au', type: 'date'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'desc', label: 'En bref', type: 'text'}, {key: 'url', label: 'Wikipédia', type: 'url'}],
            period: r => [yr(r.from), yr(r.to) ?? yr(r.from)],
            load: async () => ((await ext.cielHeure.loadSkyEvents()).events || []).map(e => ({name: e.name, kind: e.kind === 'comete' ? T('comète') : T('aurore'), from: e.from, to: e.to, year: yr(e.peak || e.from), desc: e.desc, url: e.url})),
            open: r => openUrl(r.url)},
        /* 🦴 ADN ancien (heritage-adn-livres.js, AADR) */
        {id: 'adn_ancien', icon: '🦴', label: 'Individus anciens (ADN ancien)', group: 'La personne', source: 'Allen Ancient DNA Resource, Harvard Dataverse (CC0 1.0)', sourceUrl: 'https://reich.hms.harvard.edu/allen-ancient-dna-resource-aadr-downloadable-genotypes-present-day-and-ancient-dna-data', enabled: () => !!ext.adnLivres?.load,
            fields: [{key: 'id', label: 'Individu', type: 'text'}, {key: 'date', label: 'Époque', type: 'text'}, {key: 'year', label: 'Vers l’an', type: 'year'}, {key: 'group', label: 'Groupe', type: 'text'}, {key: 'place', label: 'Lieu', type: 'text'}, {key: 'country', label: 'Pays', type: 'enum'},
                {key: 'sex', label: 'Sexe', type: 'enum'}, {key: 'y', label: 'Haplogroupe Y', type: 'text'}, {key: 'mt', label: 'Haplogroupe mt', type: 'text'}],
            period: r => [r.year, r.year], geo: geoLL,
            load: async () => { const D = await ext.adnLivres.load(), F = D.fields || [], ix = k => F.indexOf(k);
                return (D.rows || []).map(r => ({id: r[ix('id')], date: r[ix('date')], year: Number.isFinite(Number(r[ix('bp')])) ? 1950 - Number(r[ix('bp')]) : null, group: r[ix('grp')], place: r[ix('loc')], country: r[ix('cty')], sex: ({M: T('homme'), F: T('femme')})[r[ix('sex')]] || '', y: r[ix('yi')] || r[ix('y')] || '', mt: r[ix('mt')] || '', lat: r[ix('lat')], lon: r[ix('lon')]})); }},

        /* ↗ les listes qui existent déjà : on y va */
        ...[['world_events', '🌍', 'Le monde autour (événements)', 'Le monde'], ['historical_context', '🦠', 'Épidémies, guerres, hivers', 'Le monde'], ['grands_mouvements', '🚶', 'Ta famille dans les grands mouvements', 'Le monde'],
            ['pays_chiffres', '🌍', 'Les pays de ta famille en chiffres', 'Le monde'], ['lune_eclipses', '🌒', 'Éclipses vues par la famille', 'Le monde']]
            .map(([k, icon, label, group]) => ({id: 'link_' + k, icon, label, group, link: () => { const st = A().state; if (!st) return; st.listType = k; if (st.module === 'listes') { A().renderSidebar?.(); A().renderList?.(); } else A().setModule?.('listes'); }})),
        /* ⚰️ les décès INSEE installés, avec les critères du moteur (commune, nom, du… au…) : GET insee_search, 200 lignes à la fois */
        {id: 'insee_deces', icon: '⚰️', label: 'Décès INSEE (fichier installé)', group: 'La personne', source: 'Insee, fichier des personnes décédées (Licence Ouverte 2.0)', sourceUrl: 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/',
            installed: async () => { const r = await api('insee_stats'); return Number(r.count ?? r.total ?? 0) > 0; }, // une erreur remonte (pas « pas installé ») install: () => { const st = A().state; if (!st) return; st.researchKind = 'insee'; A().persistUiState?.(); A().setModule?.('recherche'); },
            fields: [{key: 'nom', label: 'Nom', type: 'text'}, {key: 'prenoms', label: 'Prénoms', type: 'text'}, {key: 'sexe', label: 'Sexe', type: 'enum', values: ['M', 'F']}, {key: 'naissance', label: 'Naissance', type: 'date'}, {key: 'commune_naissance', label: 'Lieu de naissance', type: 'place'},
                {key: 'deces', label: 'Décès', type: 'date'}, {key: 'annee', label: 'Année du décès', type: 'year'}, {key: 'commune_deces', label: 'Commune du décès', type: 'place'}, {key: 'code_deces', label: 'Code INSEE du lieu', type: 'text'}, {key: 'acte', label: 'N° d’acte', type: 'text'}],
            period: r => [r.annee, r.annee],
            query: async query => {
                const iso = v => (/^\d{8}$/.test(String(v || '')) ? `${String(v).slice(0, 4)}-${String(v).slice(4, 6)}-${String(v).slice(6, 8)}` : String(v || ''));
                const p = {limit: 200}, post = [];
                if (query.q) p.nom = query.q;
                for (const f of query.filters || []) {
                    const v = Array.isArray(f.value) ? f.value[0] : f.value;
                    if (f.key === 'nom' && v) p.nom = v; else if (f.key === 'prenoms' && v) p.prenom = v; else if (f.key === 'commune_deces' && v) p.commune_deces = v; else if (f.key === 'commune_naissance' && v) p.commune_naissance = v; else if (f.key === 'sexe' && v) p.sexe = v;
                    else if (f.key === 'code_deces' && v) p.departement = String(v).slice(0, 2);
                    if ((f.key === 'deces' || f.key === 'annee') && (f.op === 'gte' || f.op === 'lte')) { const y = parseInt(String(v), 10); if (y) p[f.op === 'gte' ? 'death_year_from' : 'death_year_to'] = y; }
                    post.push(f);
                }
                if (query.years) { p.death_year_from = query.years.from; p.death_year_to = query.years.to; }
                const out = []; let total = Infinity;
                for (let off = 0; off < Math.min(total, 5000); off += 200) {
                    const r = await api('insee_search', {...p, offset: off}); if (r.no_criteria) return {rows: [], total: 0};
                    total = Number(r.total || 0);
                    (r.rows || []).forEach(x => out.push({nom: x.nom, prenoms: x.prenoms || x.prenom, sexe: x.sexe === '1' ? 'M' : x.sexe === '2' ? 'F' : x.sexe, naissance: iso(x.date_naissance), commune_naissance: x.commune_naissance, deces: iso(x.date_deces), annee: Number(x.annee_deces) || null, commune_deces: x.commune_deces, code_deces: x.code_lieu_deces, acte: x.numero_acte_deces}));
                    if (!r.has_more) break;
                }
                const loc = ext.dataListsEngine?.applyLocal ? out.filter(r => post.every(f => ext.dataListsEngine.applyLocal({fields: [{key: f.key}]}, [r], {q: '', crit: [{key: f.key, kind: f.op === 'gte' || f.op === 'lte' ? (typeof f.value === 'string' ? 'daterange' : 'range') : 'text', op: f.op, value: f.value, from: f.op === 'gte' ? f.value : '', to: f.op === 'lte' ? f.value : ''}]}).length)) : out;
                const off = query.offset || 0, lim = query.limit || 100;
                return {rows: loc.slice(off, off + lim), total: loc.length};
            }},
        {id: 'link_insee', icon: '⚰️', label: 'Décès INSEE (1970 → aujourd’hui)', group: 'Chercher', link: () => { const st = A().state; if (!st) return; st.researchKind = 'insee'; A().persistUiState?.(); A().setModule?.('recherche'); }},
        {id: 'link_bo_search', icon: '🔎', label: 'Chercher un nom dans les bases officielles', group: 'Chercher', enabled: () => !!ext.officialBases?.openSearch, link: () => ext.officialBases.openSearch('mpf')},
        {id: 'link_gov_search', icon: '🏰', label: 'Trouver un lieu ancien (GOV)', group: 'Chercher', enabled: () => !!ext.gov?.openSearch, link: () => ext.gov.openSearch('')},
    ];
    BUILT_IN.forEach(d => { if (!REG.some(x => x?.id === d.id)) REG.push(d); });
    sync();
})();
