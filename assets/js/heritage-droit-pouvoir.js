/**
 * ⚖️ Ce que la loi disait · 🎩 Les gens de pouvoir de sa vie · 🏛️ Sa paroisse sous l'Ancien Régime (style : assets/css/droit-pouvoir.css).
 * Données livrées (assets/data/, refaites par scripts/droit-pouvoir/) — tout est sourcé, avec un lien « ↗ source » vers la page exacte :
 *  - dp-lois.json : 74 règles de droit qui comptent en généalogie (mariage, majorité, divorce, service militaire, école, état civil,
 *    prénoms et noms, héritage, nationalité, droits des femmes, vote, Alsace-Moselle…), chacune avec ses dates, à qui elle s'applique,
 *    la phrase exacte de l'article de Wikipédia qui la dit (vérifiée mot pour mot à la fabrication) et les références que Wikipédia
 *    donne pour ce passage (Légifrance, Gallica…) — build-lois.py ;
 *  - dp-pouvoir.json.gz : chefs de l'État de la France (et P35 des autres pays), préfets de chaque département, évêques de chaque
 *    diocèse, de Wikidata (CC0) — build-pouvoir.py ; dp-maires-<dép>.json.gz : les maires connus de Wikidata, par commune ;
 *  - dp-ancien-regime.json.gz : pour chaque commune actuelle, en 1789 : généralité, bailliage ou sénéchaussée, diocèse, province,
 *    gouvernement, parlement (Atlas d'Ancien Régime de Th. Fressin, CC BY-SA 4.0, d'après Brette 1904 / Gay, Gobbi, Goñi 2024) —
 *    build-ancien-regime.py.
 * Ce que ça montre :
 *  - fiche d'une personne : « ⚖️ Ce que la loi disait » (son mariage, son service militaire, son école, sa naissance… et ▸ plus :
 *    toutes les règles de sa vie) et « 🎩 Les gens de pouvoir de sa vie » (à sa naissance, à son mariage, à son décès : chef de
 *    l'État, préfet, évêque, maire) ;
 *  - fiche d'un village et monographie de commune : « 🏛️ Sous l'Ancien Régime », « 🎩 Maires, préfets et évêques » ;
 *  - Où chercher ? : « 🏛️ Archives d'Ancien Régime » (bailliage → série B, notaires → série E…) ;
 *  - 🪙 Convertisseur d'autrefois : onglet « ⚖️ La loi en l'an… » ;
 *  - Listes (LCNDA_EXT.dataLists), données à la demande (LCNDA_EXT.dataSources), monographie (LCNDA_EXT.monographSections).
 * Réglages → « ⚖️ Droit et pouvoir » : chaque partie s'éteint (localStorage « genealogie-droit-pouvoir »).
 * Lecture seule : rien n'est écrit dans la généalogie. Serveur : lib/droit_pouvoir.php (code INSEE des lieux, action dp_places).
 *   window.LCNDA_EXT.droitPouvoir = {…}   (Node : module.exports, le calcul)   Essai : tests/test-droit-pouvoir.js
 */
(function (root) {
    'use strict';
    // les nombres passent en texte : une année reste « 1830 » (pas « 1 830 »)
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? String(w[k]) : m)); };

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const INF = 99999999;
    /** '1792-09-20' → 17920920 ; '1792-09' → 17920901 ; '1792' → 17920101 ; vide → null */
    function dnum(s, end = false) {
        const m = String(s ?? '').match(/^(-?\d{1,4})(?:-(\d\d))?(?:-(\d\d))?/);
        if (!m) return null;
        const y = Number(m[1]), mo = m[2] ? Number(m[2]) : (end ? 12 : 1), d = m[3] ? Number(m[3]) : (end ? 31 : 1);
        return y * 10000 + (mo || 1) * 100 + (d || 1);
    }
    /** la date d'un événement : sort_date si complète, sinon le 1er juillet de l'année */
    function evNum(year, sortDate) {
        const m = String(sortDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m && Number(m[2]) >= 1 && Number(m[3]) >= 1) return Number(m[1] + m[2] + m[3]);
        const y = Number(year); return y ? y * 10000 + 701 : 0;
    }
    const yOf = d => Math.floor(d / 10000);
    const sexKey = g => (/^(m|male|h|homme|man)$/i.test(String(g || '')) ? 'm' : /^(f|female|femme|woman)$/i.test(String(g || '')) ? 'f' : '');
    const AM_DEPS = new Set(['57', '67', '68']);
    /** une règle vaut-elle à la date d (nombre AAAAMMJJ) ? */
    function lawActive(r, d) {
        const f = dnum(r.from) ?? -INF, t = r.to ? dnum(r.to) : INF;
        if (r.endUnknown && d > f + 50000) return false; // fin non dite par la source : on ne la montre que dans les 5 ans qui suivent
        return d >= f && d < t;
    }
    /** à qui : sexe (m, f, vide = tous), région (am = Alsace-Moselle seulement ; normandie = province de Normandie) */
    function lawFor(r, who = {}) {
        if (r.sex && who.sex && r.sex !== who.sex) return false;
        if (r.sex && !who.sex && who.strictSex) return false;
        if (r.region === 'am' && !who.am) return false;
        if (r.region === 'normandie' && !/^normandie/i.test(String(who.province || ''))) return false;
        return true;
    }
    function lawsAt(L, d, who = {}, ev = null) {
        return (L?.rows || []).filter(r => lawActive(r, d) && lawFor(r, who) && (!ev || (r.ev || []).includes(ev)));
    }
    /** la règle de calcul d'une sorte (consent, nubile, majority, school, military, divorce) à la date d */
    function calcAt(L, kind, d, who = {}) {
        const rs = lawsAt(L, d, who).filter(r => r.calc?.kind === kind);
        return rs.sort((a, b) => (dnum(b.from) ?? -INF) - (dnum(a.from) ?? -INF))[0] || null;
    }
    const ageAt = (birth, d) => (birth && d ? Math.floor((d - birth) / 10000) : null);
    const plusYears = (d, n) => d + n * 10000;

    /**
     * Ce que la loi disait pour une personne.
     * p = {sex: 'm'|'f'|'', birth: AAAAMMJJ|0, death: AAAAMMJJ|0, events: [{kind: birth|marriage|death|divorce, d, place, am, province}], am, province}
     * → {lines: [{icon, kind, d, text, rows: [règles]}], life: [règles de toute sa vie], from, to}
     */
    function personLaws(L, p) {
        const lines = [], who0 = {sex: p.sex, am: !!p.am, province: p.province || ''};
        const evs = (p.events || []).filter(e => e.d).sort((a, b) => a.d - b.d);
        const birthEv = evs.find(e => e.kind === 'birth');
        const birth = p.birth || birthEv?.d || 0;
        const whoAt = e => ({...who0, am: e?.am ?? who0.am, province: e?.province || who0.province});
        const sexWord = (m, f, x) => (p.sex === 'm' ? m : p.sex === 'f' ? f : x);
        // naissance : qui a écrit l'acte, quelles règles de prénoms
        if (birthEv) {
            const ec = lawsAt(L, birthEv.d, whoAt(birthEv), 'birth').filter(r => ['etat_civil', 'religion', 'noms'].includes(r.theme));
            const keeper = ec.filter(r => /^(registres-15|etat-civil-1792)/.test(r.id)).sort((a, b) => (dnum(b.from) ?? 0) - (dnum(a.from) ?? 0))[0];
            if (keeper) lines.push({icon: '👶', kind: 'birth', d: birthEv.d, text: T('Sa naissance ({y}) : {r}', {y: yOf(birthEv.d), r: keeper.rule}), rows: ec});
        }
        // école : à 6 ans
        if (birth) {
            const d6 = plusYears(birth, 6), sc = calcAt(L, 'school', d6, whoAt(birthEv));
            if (sc) lines.push({icon: '🏫', kind: 'school', d: d6, text: T('À 6 ans ({y}) : {t} — {r}', {y: yOf(d6), t: sc.title, r: sc.rule}), rows: [sc]});
        }
        // service militaire : à 20 ans, pour un homme
        if (birth && p.sex === 'm') {
            const d20 = plusYears(birth, 20), mi = lawsAt(L, d20, {...whoAt(birthEv), sex: 'm'}, 'military');
            const main = mi.filter(r => r.calc?.kind === 'military').sort((a, b) => (dnum(b.from) ?? 0) - (dnum(a.from) ?? 0))[0] || mi[0];
            if (main && p.sex === 'm') lines.push({icon: '🎖️', kind: 'military', d: d20, text: T('À 20 ans ({y}) : {t} — {r}', {y: yOf(d20), t: main.title, r: main.rule}), rows: mi});
        }
        // mariages : âge minimum, accord des parents, divorce, la femme mariée
        for (const e of evs.filter(x => x.kind === 'marriage')) {
            const w = whoAt(e), age = ageAt(birth, e.d), y = yOf(e.d), rows = [], bits = [];
            const cs = calcAt(L, 'consent', e.d, w), nb = calcAt(L, 'nubile', e.d, w);
            const norm = lawsAt(L, e.d, w, 'marriage').filter(r => r.region === 'normandie');
            if (cs) {
                rows.push(cs);
                const lim = p.sex ? cs.calc[p.sex] : null;
                if (lim != null && age != null) bits.push(age < lim ? T('à {a} ans, il fallait l’accord de ses parents (jusqu’à {l} ans pour {qui})', {a: age, l: lim, qui: sexWord(T('un homme'), T('une femme'), '')})
                    : T('à {a} ans, plus besoin de l’accord de ses parents (après {l} ans pour {qui})', {a: age, l: lim, qui: sexWord(T('un homme'), T('une femme'), '')}));
                else bits.push(cs.title);
            }
            rows.push(...norm);
            if (nb) {
                rows.push(nb);
                const min = p.sex ? nb.calc[p.sex] : null;
                if (min != null && age != null && age < min) bits.push(T('⚠️ moins que l’âge minimum ({m} ans) : vérifie la date, ou cherche une dispense', {m: min}));
            }
            const dv = calcAt(L, 'divorce', e.d, w);
            if (dv) { rows.push(dv); if (dv.calc.allowed === false) bits.push(T('le divorce était interdit')); }
            rows.push(...lawsAt(L, e.d, w, 'marriage').filter(r => !rows.includes(r) && ['mariage', 'etat_civil', 'femmes', 'nationalite'].includes(r.theme) && !r.calc));
            if (rows.length) lines.push({icon: '💍', kind: 'marriage', d: e.d, text: T('Son mariage ({y}) : {b}', {y, b: bits.join(' ; ') || rows[0].title}), rows});
        }
        // vote : de son vivant
        const end = p.death || (birth ? plusYears(birth, 90) : 0);
        if (birth) {
            const v = (L?.rows || []).find(r => r.calc?.kind === 'vote' && r.sex === (p.sex || 'x'));
            const vd = v ? dnum(v.from) : null;
            if (v && vd > birth && vd < end) lines.push({icon: '🗳️', kind: 'vote', d: vd, text: T('De son vivant, en {y} : {r}', {y: yOf(vd), r: v.rule}), rows: [v]});
        }
        // Alsace-Moselle
        const amEv = evs.find(e => e.am && lawsAt(L, e.d, {am: true}).some(r => r.region === 'am' && r.id === 'am-1871'));
        if (amEv) { const r = (L.rows || []).find(x => x.id === 'am-1871'); if (r) lines.push({icon: r.icon, kind: 'am', d: amEv.d, text: r.rule, rows: [r]}); }
        // toute sa vie
        const from = birth || evs[0]?.d || 0, to = end || evs[evs.length - 1]?.d || 0;
        const life = !from ? [] : (L?.rows || []).filter(r => {
            const f = dnum(r.from) ?? -INF, t = r.to ? dnum(r.to) : INF;
            return f < (to || INF) && t > from && lawFor(r, {...who0, am: who0.am || evs.some(e => e.am), strictSex: false});
        }).sort((a, b) => (dnum(a.from) ?? -INF) - (dnum(b.from) ?? -INF));
        return {lines, life, from, to};
    }

    /** titulaires à la date d dans [[nom, qid, début, fin]] (fin absente → début du suivant ; le dernier sans fin : seulement s'il a commencé il y a moins de 15 ans) */
    function holdersAt(list, d, now = 20261231) {
        const out = [];
        for (let i = 0; i < (list || []).length; i++) {
            const h = list[i], s = dnum(h[2]); if (s == null || s > d) continue;
            let e = h[3] ? dnum(h[3], true) : null;
            if (e == null) { const nx = list.slice(i + 1).map(x => dnum(x[2])).find(x => x != null && x > s); e = nx ?? (s > now - 150000 ? INF : null); }
            if (e != null && d < e) out.push(h);
        }
        return out;
    }
    const asList = arr => (arr || []).map(h => (Array.isArray(h) ? h : [h.n, h.q, h.s, h.e, h.t, h.w, h.r]));
    function headsFranceAt(P, d) {
        const hs = holdersAt(asList(P?.france), d);
        const people = hs.filter(h => !h[6]);
        return (people.length ? people : hs).slice(0, 2).map(h => ({n: h[0], q: h[1], s: h[2], e: h[3], t: h[4], w: h[5], regime: !!h[6]}));
    }
    function headsWorldAt(P, iso, d) {
        const c = P?.world?.[String(iso)]; if (!c) return [];
        return holdersAt(asList(c.h), d).slice(0, 2).map(h => ({n: h[0], q: h[1], s: h[2], e: h[3]}));
    }
    function prefetAt(P, dep, d) {
        const x = P?.prefets?.[dep]; if (!x) return null;
        const h = holdersAt(x.h, d); return h.length ? {pos: x.pos?.[0]?.[1] || '', posQ: x.pos?.[0]?.[0] || '', list: h.slice(0, 2)} : null;
    }
    const CONCORDAT_1822 = 18221001;
    /** le diocèse de la commune à la date : avant 1790 celui de 1789 (atlas), après 1822 ceux dont le siège est dans le département */
    function diocesesAt(P, AR, insee, dep, d) {
        if (d < 17900101) {
            const a = arOf(AR, insee); const nm = a?.diocese?.n; const q = nm ? P?.dioceses_1789?.[nm] : null;
            return q && P.dioceses[q] ? [P.dioceses[q]] : [];
        }
        if (d >= CONCORDAT_1822) return (P?.dioceses_dep?.[dep] || []).map(q => P.dioceses[q]).filter(Boolean);
        return [];
    }
    function bishopsAt(P, AR, insee, dep, d) {
        return diocesesAt(P, AR, insee, dep, d).map(x => ({dio: x, list: holdersAt(x.h, d).slice(0, 2)})).filter(x => x.list.length);
    }
    function maireAt(M, insee, d) { const l = M?.m?.[insee]; return l ? holdersAt(l, d).slice(0, 2) : []; }

    /** l'Ancien Régime d'une commune : {commune, royaume, levels: {g, b, d, p, gv, pa}, cert, principal} */
    function arOf(AR, insee) {
        const r = AR?.c?.[insee]; if (!r) return null;
        const out = {insee, commune: r[0], royaume: r[1], certs: String(r[2] || ''), levels: {}};
        AR.layers.forEach((k, i) => { const j = r[3 + i]; if (j >= 0) out.levels[k] = AR.ents[k][j]; });
        const b = out.levels.b; if (b?.pr) out.principal = AR.ents.b.find(x => x.id === b.pr) || null;
        out.generalite = out.levels.g; out.bailliage = out.levels.b; out.diocese = out.levels.d; out.province = out.levels.p; out.gouvernement = out.levels.gv; out.parlement = out.levels.pa;
        return out;
    }
    const depOf = insee => (!insee ? '' : /^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2));
    /** où chercher les archives d'Ancien Régime d'une commune : [{icon, text, archive}] */
    function arTips(AR, L, insee) {
        const a = arOf(AR, insee); if (!a || a.royaume === 0) return [];
        const dn = c => AR.deps?.[c] || c, out = [];
        const arch = id => (L?.archives || []).find(x => x.id === id) || null;
        const b = a.bailliage;
        if (b) {
            const dc = depOf(b.cli);
            out.push({icon: '⚖️', kind: 'b', archive: arch('serie-b'),
                text: T('Procès, tutelles, inventaires après décès : les fonds de la juridiction « {b} » (siège : {s}), série B des archives départementales de {d}.', {b: b.n, s: b.cl || '?', d: dn(dc) || '?'})});
            out.push({icon: '📜', kind: 'grosse', archive: arch('registres-bailliage'),
                text: T('Le double des registres paroissiaux d’avant 1792 (la « grosse ») allait au greffe de ce bailliage : utile quand l’exemplaire du curé est perdu.')});
        }
        out.push({icon: '✒️', kind: 'e', archive: arch('serie-e'),
            text: T('Notaires (contrats de mariage, testaments, ventes) : série E des archives départementales de {d} (souvent la sous-série 3 E ou 5 E).', {d: dn(depOf(insee))})});
        if (a.generalite) out.push({icon: '🏛️', kind: 'c', archive: arch('serie-c'), text: T('Impôts et administration de la généralité de {g} (intendance) : série C des archives départementales.', {g: a.generalite.n})});
        return out;
    }
    /** les règles en vigueur une année, pour le convertisseur : {date, who} → règles + les âges calculés */
    function yearSummary(L, year, who = {}) {
        const d = Number(year) * 10000 + 701, k = kind => calcAt(L, kind, d, who);
        return {d, rows: lawsAt(L, d, who), consent: k('consent'), nubile: k('nubile'), majority: k('majority'), school: k('school'), divorce: k('divorce'), military: calcAt(L, 'military', d, {...who, sex: 'm'})};
    }

    const core = {dnum, evNum, sexKey, lawActive, lawFor, lawsAt, calcAt, personLaws, holdersAt, headsFranceAt, headsWorldAt, prefetAt, diocesesAt, bishopsAt, maireAt, arOf, arTips, yearSummary, depOf, AM_DEPS};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    ext.personBlocks = ext.personBlocks || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const S = () => A().state || {};
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const DATA_V = 1;
    const KEY = 'genealogie-droit-pouvoir';
    const TAB = ['droit_pouvoir', '25k6', '⚖️ Droit et pouvoir'];
    const PARTS = [
        ['person_lois', '⚖️ Ce que la loi disait (fiche)', 'Sur la fiche d’une personne : les règles de son mariage, de son service militaire, de son école, de sa naissance…'],
        ['person_pouvoir', '🎩 Les gens de pouvoir de sa vie (fiche)', 'À sa naissance, à son mariage, à son décès : chef de l’État, préfet, évêque, maire (Wikidata).'],
        ['place_ar', '🏛️ Sous l’Ancien Régime (lieu)', 'Fiche d’un village et monographie : bailliage, généralité, diocèse, province, parlement en 1789.'],
        ['place_pouvoir', '🎩 Maires, préfets et évêques (lieu)', 'Monographie de commune : les maires connus de Wikidata, les préfets et évêques des années de ta famille.'],
        ['ouc_ar', '🏛️ Archives d’Ancien Régime (Où chercher)', 'Dans « Où chercher ? » : quel bailliage, quelle série des archives départementales.'],
        ['autrefois', '⚖️ La loi en l’an… (convertisseur)', 'Un onglet du « 🪙 Convertisseur d’autrefois ».']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(p) { try { localStorage.setItem(KEY, JSON.stringify({...settings(), ...p})); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const safe = u => (A().safeUrl ? A().safeUrl(u) : u) || '#';
    const link = (url, label = T('↗ source'), title = '') => (url ? `<a class="dp-src-link" href="${esc(safe(url))}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</a>` : '');
    const wdUrl = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const spinner = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const fmtD = s => { const m = String(s || '').match(/^(-?\d{1,4})(?:-(\d\d))?(?:-(\d\d))?/); if (!m) return ''; const MO = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']; const y = String(Number(m[1])); if (!m[2] || (m[2] === '01' && (!m[3] || m[3] === '01'))) return y; return `${m[3] && m[3] !== '01' ? Number(m[3]) + ' ' : m[3] === '01' ? '1er ' : ''}${MO[Number(m[2]) - 1]} ${y}`; };
    const span = (a, b) => (a && b ? `${fmtD(a)} – ${fmtD(b)}` : a ? T('depuis {d}', {d: fmtD(a)}) : b ? T('jusqu’à {d}', {d: fmtD(b)}) : '');

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers compressés.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    /* un téléchargement coupé (page rechargée, application arrêtée, réseau perdu) n'est pas une erreur à montrer : « réessaie », pas « Failed to fetch » */
    const cutOff = e => e?.name === 'AbortError' || e?.network === true || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')));
    const memo = new Map();
    function getData(path, opt = false) {
        if (!memo.has(path)) memo.set(path, fetch(`assets/data/${path}?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (!r.ok) { if (opt) return null; throw new Error(T('Le fichier {f} est introuvable.', {f: path})); } return /\.gz$/.test(path) ? readMaybeGz(r) : r.json(); })
            .catch(e => { memo.delete(path); throw e; }));
        return memo.get(path);
    }
    const loadLaws = () => getData('dp-lois.json');
    const loadPower = () => getData('dp-pouvoir.json.gz');
    const loadAR = () => getData('dp-ancien-regime.json.gz');
    const loadMairesIndex = () => getData('dp-maires-index.json', true).catch(() => null);
    async function loadMaires(dep) {
        if (!dep) return null;
        const idx = await loadMairesIndex(); if (!idx?.deps?.[dep]) return null;
        return getData(`dp-maires-${dep}.json.gz`, true).catch(() => null);
    }
    /** code INSEE et département des lieux de la base (lib/droit_pouvoir.php), gardés pour la session */
    const placeMemo = new Map();
    async function resolvePlaces(ids) {
        const need = [...new Set(ids.map(Number).filter(x => x > 0 && !placeMemo.has(x)))];
        for (let i = 0; i < need.length; i += 300) {
            try { const r = await A().api('dp_places', {ids: need.slice(i, i + 300).join(',')}); (r.places || []).forEach(p => placeMemo.set(Number(p.id), p)); } catch (_) { need.slice(i, i + 300).forEach(x => placeMemo.set(x, {id: x, insee: '', dep: ''})); }
        }
        return new Map(ids.map(Number).filter(x => placeMemo.has(x)).map(x => [x, placeMemo.get(x)]));
    }
    async function resolveOne(q) {
        const k = JSON.stringify(q); if (placeMemo.has(k)) return placeMemo.get(k);
        let p = {insee: '', dep: ''}; try { p = (await A().api('dp_places', q)).places?.[0] || p; } catch (_) {}
        placeMemo.set(k, p); return p;
    }

    /* ─────────── la personne : ses événements, leurs lieux ─────────── */
    const KIND = {BIRT: 'birth', CHR: 'birth', BAPM: 'birth', MARR: 'marriage', MRCI: 'marriage', MRRE: 'marriage', DEAT: 'death', BURI: 'death', DIV: 'divorce'};
    async function personCtx(detail, AR) {
        const p = detail.person || {};
        const evs = (detail.events || []).filter(e => KIND[String(e.gedcom_tag || '').toUpperCase()] && Number(e.year));
        const places = await resolvePlaces(evs.map(e => e.place_id).filter(Boolean));
        const out = evs.map(e => {
            const pl = places.get(Number(e.place_id)) || {}, a = pl.insee && AR ? arOf(AR, pl.insee) : null;
            return {kind: KIND[String(e.gedcom_tag).toUpperCase()], d: evNum(e.year, e.sort_date), y: Number(e.year), placeName: e.place_name || '', insee: pl.insee || '', dep: pl.dep || '',
                am: AM_DEPS.has(pl.dep || ''), province: a?.province?.n || '', country: e.country || '', lat: e.precise_lat ?? e.latitude, lon: e.precise_lon ?? e.longitude, raw: e};
        });
        // une seule naissance (la plus ancienne), un décès (le premier)
        const one = k => out.filter(e => e.kind === k).sort((a, b) => a.d - b.d)[0];
        const birth = one('birth'), death = one('death');
        const bY = Number(p.birth_year) || birth?.y || 0, dY = Number(p.death_year) || death?.y || 0;
        return {sex: sexKey(p.gender), birth: birth?.d || (bY ? bY * 10000 + 701 : 0), death: death?.d || (dY ? dY * 10000 + 701 : 0),
            events: out.filter(e => e.kind !== 'birth' || e === birth).filter(e => e.kind !== 'death' || e === death), am: out.some(e => e.am), province: (birth || out[0])?.province || '',
            first: p.first_name || T('cette personne')};
    }

    /* ─────────── ⚖️ Ce que la loi disait ─────────── */
    function srcHtml(r) {
        const s = r.src || {};
        const refs = (s.refs || []).filter(x => x.url).slice(0, 3).map(x => link(x.url, /legifrance/.test(x.url) ? T('↗ Légifrance') : /gallica/.test(x.url) ? T('↗ Gallica') : /wikisource/.test(x.url) ? T('↗ Wikisource') : T('↗ référence'), x.text)).join(' ');
        return `<details class="dp-quote"><summary><small>${esc(T('La source'))}</small></summary><blockquote>« ${esc(s.quote)} »</blockquote>
            <small class="muted">${esc(T('Wikipédia, « {t} »{s}', {t: s.title, s: s.section ? ' — ' + s.section : ''}))} ${link(s.url)} ${refs}</small></details>`;
    }
    function lawLi(r, extra = '') {
        return `<li class="dp-law"><span class="dp-ico" aria-hidden="true">${esc(r.icon || '⚖️')}</span><div><b>${esc(r.title)}</b> <small class="muted">${esc(span(r.from, r.to) || '')}</small>${extra}
            <br><span>${esc(r.rule)}</span> ${link(r.src?.url)}${srcHtml(r)}</div></li>`;
    }
    async function lawsInto(host, detail) {
        let L, AR;
        try { [L, AR] = await Promise.all([loadLaws(), loadAR().catch(() => null)]); } catch (e) { host.innerHTML = ''; return false; }
        const ctx = await personCtx(detail, AR);
        if (!host.isConnected) return false;
        const res = personLaws(L, ctx);
        if (!res.lines.length && !res.life.length) { host.innerHTML = ''; return false; }
        const top = res.lines.slice(0, 3), rest = res.lines.slice(3);
        const line = x => `<li class="dp-line"><span class="dp-ico" aria-hidden="true">${esc(x.icon)}</span><div>${esc(x.text)} ${link(x.rows[0]?.src?.url)}</div></li>`;
        host.innerHTML = `<p class="muted">${esc(T('Les règles de l’époque, pour {p} (d’après ses dates et ses lieux).', {p: ctx.first}))}</p>
            ${top.length ? `<ul class="dp-lines">${top.map(line).join('')}</ul>` : ''}
            <details class="dp-more"><summary>${esc(T('▸ plus : {n} règles pendant sa vie', {n: res.life.length}))}</summary>
                ${rest.length ? `<ul class="dp-lines">${rest.map(line).join('')}</ul>` : ''}
                <ul class="dp-laws">${res.life.map(r => lawLi(r)).join('')}</ul></details>
            <p><small class="muted">${esc(T('Sources : articles de Wikipédia (phrase exacte, CC BY-SA 4.0) et les textes qu’ils citent (Légifrance, Gallica…). Une règle peut avoir eu des exceptions : vérifie sur l’acte.'))}
            ${ext.dataLists ? ` · <button type="button" class="link-button" data-dp-list="lois">${esc(T('Toutes les règles (Listes)'))}</button>` : ''}</small></p>`;
        return true;
    }

    /* ─────────── 🎩 Les gens de pouvoir ─────────── */
    let mondeB = null;
    async function countryAt(e, d) {
        if (e.insee) return {fr: true};
        if (/^(fr|fra|france)$/i.test(String(e.country || '').trim())) return {fr: true};
        const M = ext.mondeContexte, lat = Number(e.lat), lon = Number(e.lon);
        if (!M?.load || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0) || e.lat == null || e.lat === '') return null;
        try { mondeB = mondeB || await M.load(); } catch (_) { return null; }
        const then = M.lookup(mondeB, lat, lon, d), now = M.today(mondeB, lat, lon);
        if (!now) return null;
        if (now.iso === 250 && (!then || then.name === now.name)) return {fr: true};
        return {iso: now.iso, same: !!(then && then.name === now.name), then: then?.label || '', now: now.name};
    }
    const pName = h => link(wdUrl(h.q || h[1]), h.n || h[0], T('Wikidata'));
    async function powerLine(P, AR, e, label) {
        const bits = [];
        const c = await countryAt(e, e.d);
        if (c?.fr) {
            const hs = headsFranceAt(P, e.d);
            if (hs.length) bits.push(hs.map(h => h.regime ? esc(h.n) + ' ' + link(wdUrl(h.q)) : `${esc(h.t)} ${pName(h)}`).join(' / '));
        } else if (c?.iso && c.same) {
            const hs = headsWorldAt(P, c.iso, e.d);
            if (hs.length) bits.push(`${esc(T('chef de l’État ({p})', {p: c.now}))} : ${hs.map(pName).join(' / ')}`);
        }
        if (e.dep) {
            const pf = prefetAt(P, e.dep, e.d);
            if (pf) bits.push(`${esc(pf.pos || T('préfet'))} : ${pf.list.map(pName).join(' / ')}`);
            for (const b of bishopsAt(P, AR, e.insee, e.dep, e.d)) bits.push(`${esc(T('évêque ({d})', {d: b.dio.n}))} : ${b.list.map(pName).join(' / ')}`);
            const M = await loadMaires(e.dep), ms = maireAt(M, e.insee, e.d);
            if (ms.length) bits.push(`${esc(T('maire de {c}', {c: arOf(AR, e.insee)?.commune || e.placeName}))} : ${ms.map(pName).join(' / ')}`);
        }
        if (!bits.length) return '';
        return `<li class="dp-line"><span class="dp-ico" aria-hidden="true">${esc(label[0])}</span><div><b>${esc(T(label[1], {y: yOf(e.d)}))}</b>${e.placeName ? ` <small class="muted">(${esc(e.placeName)})</small>` : ''} : ${bits.join(' ; ')}</div></li>`;
    }
    async function powerInto(host, detail) {
        let P, AR;
        try { [P, AR] = await Promise.all([loadPower(), loadAR().catch(() => null)]); } catch (e) { host.innerHTML = ''; return false; }
        const ctx = await personCtx(detail, AR);
        const LBL = {birth: ['👶', 'À sa naissance ({y})'], marriage: ['💍', 'À son mariage ({y})'], death: ['🕯️', 'À son décès ({y})']};
        const lines = [];
        for (const e of ctx.events.filter(x => LBL[x.kind]).sort((a, b) => a.d - b.d)) { const l = await powerLine(P, AR, e, LBL[e.kind]); if (l) lines.push(l); }
        if (!host.isConnected) return false;
        // les chefs de l'État de la France pendant sa vie (si elle a vécu en France)
        let life = '';
        if (ctx.birth && ctx.events.some(e => e.insee)) {
            const end = ctx.death || ctx.birth + 900000;
            const hs = asList(P.france).filter(h => { const s = dnum(h[2]), en = h[3] ? dnum(h[3], true) : INF; return s < end && en > ctx.birth; });
            if (hs.length) life = `<details class="dp-more"><summary>${esc(T('▸ plus : les {n} chefs de l’État (France) pendant sa vie', {n: hs.length}))}</summary><ul class="dp-heads">${hs.map(h => `<li>${h[6] ? esc(h[0]) : `${esc(h[4])} ${pName(h)}`} <small class="muted">${esc(span(h[2], h[3]))}</small></li>`).join('')}</ul></details>`;
        }
        if (!lines.length && !life) { host.innerHTML = ''; return false; }
        host.innerHTML = `${lines.length ? `<ul class="dp-lines">${lines.join('')}</ul>` : ''}${life}
            <p><small class="muted">${esc(T('Source : Wikidata (CC0), chaque nom mène à sa fiche ↗. Wikidata ne connaît pas tout : un préfet, un évêque ou un maire absent n’a peut-être pas encore de fiche. Évêques : le diocèse de 1789 avant 1790, celui du département après 1822.'))}
            ${ext.dataLists ? ` · <button type="button" class="link-button" data-dp-list="prefets">${esc(T('Préfets (Listes)'))}</button>` : ''}</small></p>`;
        return true;
    }

    const details = new Map();
    ext.personBlocks.droit_lois = (index, detail) => {
        const pid = Number(detail?.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal' || !on('person_lois')) return '';
        details.set(pid, detail);
        return A().card(index, T('⚖️ Ce que la loi disait'), '', `<div class="dp-block mc-block" data-dp-lois="${pid}">${spinner(T('On cherche les lois de l’époque…'))}</div>`, 'span-12');
    };
    ext.personBlocks.droit_pouvoir = (index, detail) => {
        const pid = Number(detail?.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal' || !on('person_pouvoir')) return '';
        details.set(pid, detail);
        return A().card(index, T('🎩 Les gens de pouvoir de sa vie'), '', `<div class="dp-block mc-block" data-dp-pouvoir="${pid}">${spinner(T('On cherche qui gouvernait…'))}</div>`, 'span-12');
    };
    const hideCard = h => { const c = h.closest('.card, section, article'); if (c && c !== document.body && !h.innerHTML.trim()) c.hidden = true; };
    function scanPerson() {
        document.querySelectorAll('[data-dp-lois]:not([data-dp-done])').forEach(h => { h.dataset.dpDone = '1'; const d = details.get(Number(h.dataset.dpLois)); if (!d) { h.innerHTML = ''; hideCard(h); return; } lawsInto(h, d).then(ok => { if (!ok) hideCard(h); }).catch(() => { h.innerHTML = ''; hideCard(h); }); });
        document.querySelectorAll('[data-dp-pouvoir]:not([data-dp-done])').forEach(h => { h.dataset.dpDone = '1'; const d = details.get(Number(h.dataset.dpPouvoir)); if (!d) { h.innerHTML = ''; hideCard(h); return; } powerInto(h, d).then(ok => { if (!ok) hideCard(h); }).catch(() => { h.innerHTML = ''; hideCard(h); }); });
    }

    /* ─────────── 🏛️ Sous l'Ancien Régime (lieu) ─────────── */
    const CERT_TXT = {1: 'confirmé par une source', 2: 'corrigé sur une source', 3: 'douteux (sources discordantes)'};
    function arLevels(a) {
        const L = [['g', T('Généralité'), a.generalite ? T('généralité de {n}', {n: a.generalite.n}) : '', 0],
            ['b', T('Bailliage ou sénéchaussée'), a.bailliage ? a.bailliage.n + (a.bailliage.cl ? ` (${T('siège : {s}', {s: a.bailliage.cl})})` : '') : '', 1],
            ['d', T('Diocèse'), a.diocese ? T('diocèse de {n}', {n: a.diocese.n}) + (a.diocese.pe ? ` (${T('province ecclésiastique de {p}', {p: a.diocese.pe})})` : '') : '', 2],
            ['p', T('Province'), a.province ? a.province.n : '', 3],
            ['gv', T('Gouvernement militaire'), a.gouvernement ? a.gouvernement.n : '', -1],
            ['pa', T('Parlement (cour d’appel)'), a.parlement ? a.parlement.n + (a.parlement.app ? ` (${T('appel : {a}', {a: a.parlement.app})})` : '') : '', -1]];
        return L.filter(x => x[2]).map(([k, lab, val, ci]) => ({k, lab, val, cert: ci >= 0 ? Number(a.certs[ci] || 0) : 0}));
    }
    async function arInto(host, place, {short = false} = {}) {
        let AR, L;
        try { [AR, L] = await Promise.all([loadAR(), loadLaws().catch(() => null)]); } catch (_) { return false; }
        let insee = place.insee || '';
        if (!insee) { const r = await resolveOne(place.id ? {id: place.id} : {name: place.name || '', county: place.county || '', lat: place.lat ?? place.latitude ?? '', lon: place.lon ?? place.longitude ?? ''}); insee = r.insee || ''; }
        const a = insee ? arOf(AR, insee) : null;
        if (!a) { host.innerHTML = ''; return false; }
        if (a.royaume === 0) {
            host.innerHTML = `<p>${esc(T('En 1789, {c} n’était pas dans le royaume de France (d’après Brette, 1907) : enclave ou terre étrangère.', {c: a.commune}))} ${link(AR.csv_url)}</p>${arCredit(AR)}`;
            return true;
        }
        const lv = arLevels(a), tips = L ? arTips(AR, L, insee) : [];
        const doubt = lv.filter(x => x.cert === 3);
        host.innerHTML = `<p>${esc(T('En 1789, {c} relevait de :', {c: a.commune}))} <b>${lv.filter(x => ['b', 'g', 'd', 'p', 'pa'].includes(x.k)).map(x => esc(x.val.replace(/ \(.*\)$/, ''))).join(' · ')}</b>.</p>
            ${doubt.length ? `<p class="dp-warn"><small>⚠️ ${esc(T('À vérifier : {l} (sources discordantes).', {l: doubt.map(x => x.lab.toLowerCase()).join(', ')}))}</small></p>` : ''}
            <details class="dp-more"${short ? '' : ''}><summary>${esc(T('▸ plus : le détail et où chercher'))}</summary>
                <dl class="data-list">${lv.map(x => `<div class="data-row"><dt>${esc(x.lab)}</dt><dd>${esc(x.val)}${x.cert ? ` <small class="muted">· ${esc(T(CERT_TXT[x.cert]))}</small>` : ''}</dd></div>`).join('')}
                ${a.principal ? `<div class="data-row"><dt>${esc(T('Bailliage principal'))}</dt><dd>${esc(a.principal.n)}</dd></div>` : ''}</dl>
                ${tips.length ? `<h4>${esc(T('🔎 Où chercher'))}</h4><ul class="dp-lines">${tips.map(t => `<li class="dp-line"><span class="dp-ico" aria-hidden="true">${esc(t.icon)}</span><div>${esc(t.text)} ${t.archive ? link(t.archive.src?.url) : ''}</div></li>`).join('')}</ul>` : ''}
                <p class="muted"><small>${esc(T('Pas dans cette source : l’élection, la coutume, la subdélégation, ni l’état d’avant 1789. Le rattachement est celui de la commune d’aujourd’hui : une paroisse réunie plus tard peut avoir relevé d’ailleurs.'))}</small></p></details>
            ${arCredit(AR)}`;
        return true;
    }
    const arCredit = AR => `<p><small class="muted">${esc(T('Source : Atlas d’Ancien Régime (Th. Fressin, 2026), d’après Brette (1904) et Gay, Gobbi et Goñi (2024) ; licence {l}.', {l: AR.licence}))} ${link(AR.url, T('↗ l’atlas'))} ${link(AR.csv_url, T('↗ le tableau des communes'))} ${link(AR.licence_url, T('↗ licence'))}</small></p>`;

    /* ─────────── 🎩 Maires, préfets et évêques (lieu, monographie) ─────────── */
    async function placePowerInto(host, place, years) {
        let P, AR;
        try { [P, AR] = await Promise.all([loadPower(), loadAR().catch(() => null)]); } catch (_) { return false; }
        let insee = place.insee || '';
        if (!insee) { const r = await resolveOne(place.id ? {id: place.id} : {name: place.name || '', county: place.county || '', lat: place.lat ?? place.latitude ?? '', lon: place.lon ?? place.longitude ?? ''}); insee = r.insee || ''; }
        if (!insee) return false;
        const dep = depOf(insee), M = await loadMaires(dep), maires = M?.m?.[insee] || [];
        const from = years?.from ? years.from * 10000 + 101 : 0, to = years?.to ? years.to * 10000 + 1231 : 0;
        const inYears = h => { if (!from) return true; const s = dnum(h[2]) ?? 0, e = h[3] ? dnum(h[3], true) : INF; return s <= to && e >= from; };
        const pf = (P.prefets?.[dep]?.h || []).filter(inYears);
        const dios = [...new Set([...(from && from < 17900101 ? diocesesAt(P, AR, insee, dep, from) : []), ...diocesesAt(P, AR, insee, dep, Math.max(to || 20261231, CONCORDAT_1822))])];
        const bis = dios.map(dd => ({dio: dd, list: dd.h.filter(inYears)})).filter(x => x.list.length);
        if (!maires.length && !pf.length && !bis.length) { host.innerHTML = ''; return false; }
        const li = h => `<li>${pName(h)} <small class="muted">${esc(span(h[2], h[3]))}</small></li>`;
        const nm = arOf(AR, insee)?.commune || place.name;
        host.innerHTML = `<p>${esc(maires.length ? T('{n} connus de Wikidata pour {c}.', {n: A().plural ? A().plural(maires.length, T('maire'), T('maires')) : maires.length + ' ' + T('maires'), c: nm}) : T('Wikidata ne connaît pas encore les maires de {c}.', {c: nm}))}${from ? ' ' + esc(T('Préfets et évêques : les années de ta famille ici ({a}–{b}).', {a: years.from, b: years.to})) : ''}</p>
            ${maires.length ? `<h4>${esc(T('Maires'))}</h4><ul class="dp-heads">${maires.slice(0, 8).map(li).join('')}</ul>${maires.length > 8 ? `<details class="dp-more"><summary>${esc(T('▸ plus ({n})', {n: maires.length - 8}))}</summary><ul class="dp-heads">${maires.slice(8).map(li).join('')}</ul></details>` : ''}` : ''}
            ${pf.length ? `<details class="dp-more"><summary>${esc(T('▸ {p} ({n})', {p: P.prefets[dep].pos?.[0]?.[1] || T('Préfets'), n: pf.length}))}</summary><ul class="dp-heads">${pf.map(li).join('')}</ul></details>` : ''}
            ${bis.map(b => `<details class="dp-more"><summary>${esc(T('▸ évêques ({d}) ({n})', {d: b.dio.n, n: b.list.length}))}</summary><ul class="dp-heads">${b.list.map(li).join('')}</ul></details>`).join('')}
            <p><small class="muted">${esc(T('Source : Wikidata (CC0), chaque nom mène à sa fiche ↗. Les curés ne sont pas dans Wikidata : cherche-les dans les registres paroissiaux (ils signent les actes).'))}</small></p>`;
        return true;
    }

    /* ─────────── la fiche d'un village ─────────── */
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        const name = pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim();
        return {id: Number(pli?.dataset.pliPlace) || 0, name, lat: pli?.dataset.pliLat !== '' && pli?.dataset.pliLat != null ? Number(pli.dataset.pliLat) : null,
            lon: pli?.dataset.pliLon !== '' && pli?.dataset.pliLon != null ? Number(pli.dataset.pliLon) : null, insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'dp_ancien_regime', host: '[data-dp-part="ar"]', icon: '🏛️', label: 'Sous l’Ancien Régime', group: 'Son histoire', enabled: () => on('place_ar')});
    function decorateVillage() {
        const ws = document.getElementById('workspace'); if (!ws || !on('place_ar')) return;
        const village = ws.querySelector('.h-village:not([data-dp])'); if (!village) return;
        village.dataset.dp = '1';
        const place = villagePlace(village); if (!place.name && !place.insee) return;
        const sec = document.createElement('section');
        sec.className = 'maintenance-panel cplus-panel dp-panel'; sec.dataset.vsec = 'dp_ancien_regime'; sec.dataset.dpPart = 'ar';
        sec.innerHTML = `<h3>${esc(T('🏛️ Sous l’Ancien Régime'))}</h3><div data-dp-body></div>`;
        const anchor = village.querySelector('[data-cht-host], .cht-place') || village.querySelector('[data-mr-host], .mr-place') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        if (anchor) anchor.insertAdjacentElement('afterend', sec); else village.appendChild(sec);
        arInto(sec.querySelector('[data-dp-body]'), place).then(ok => { if (!ok) sec.remove(); }).catch(() => sec.remove());
    }

    /* ─────────── 🔎 Où chercher : archives d'Ancien Régime ─────────── */
    async function oucInto(view, body) {
        if (!on('ouc_ar') || body.querySelector('[data-dp-ouc]')) return;
        const detail = view?.data?.detail; if (!detail?.person) return;
        let AR, L; try { [AR, L] = await Promise.all([loadAR(), loadLaws()]); } catch (_) { return; }
        const ctx = await personCtx(detail, AR);
        const old = ctx.events.filter(e => e.insee && e.d && e.d < 17920920);
        const seen = new Set(), blocks = [];
        for (const e of old) {
            if (seen.has(e.insee)) continue; seen.add(e.insee);
            const tips = arTips(AR, L, e.insee); if (!tips.length) continue;
            blocks.push(`<li><b>${esc(arOf(AR, e.insee)?.commune || e.placeName)}</b> <small class="muted">(${esc(T('avant 1792'))})</small><ul class="dp-lines">${tips.map(t => `<li class="dp-line"><span class="dp-ico" aria-hidden="true">${esc(t.icon)}</span><div>${esc(t.text)} ${t.archive ? link(t.archive.src?.url) : ''}</div></li>`).join('')}</ul></li>`);
        }
        if (!blocks.length || !body.isConnected || body.querySelector('[data-dp-ouc]')) return;
        const html = `<details class="ouc-guides dp-ouc" data-dp-ouc><summary>🏛️ ${esc(T('Archives d’Ancien Régime'))} <small class="muted">${esc(T('bailliage, notaires, intendance : où sont les papiers d’avant la Révolution'))}</small></summary>
            <ul class="dp-ouc-list">${blocks.join('')}</ul>${arCredit(AR)}</details>`;
        const after = body.querySelector('[data-ouc-plus]') || body.querySelector('.ouc-facts');
        if (after) after.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
    }
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => { oucInto(view, body).catch(() => {}); });

    /* ─────────── la monographie de commune (registre commun) ─────────── */
    const MS = ext.monographSections = ext.monographSections || [];
    MS.push({id: 'ancien_regime', icon: '🏛️', label: 'Sous l’Ancien Régime', group: 'Le lieu', enabled: () => on('place_ar'),
        source: 'Atlas d’Ancien Régime (Th. Fressin), CC BY-SA 4.0',
        render: async (place, host, ctx) => { const v = await ctx?.village?.().catch?.(() => null); return arInto(host, {...place, insee: v?.insee || place.insee || ''}); }});
    MS.push({id: 'gens_de_pouvoir', icon: '🎩', label: 'Maires, préfets et évêques', group: 'Le lieu', enabled: () => on('place_pouvoir'), source: 'Wikidata (CC0)',
        render: async (place, host, ctx) => { const [v, y] = await Promise.all([ctx?.village?.().catch?.(() => null), ctx?.years?.().catch?.(() => null)]); return placePowerInto(host, {...place, insee: v?.insee || place.insee || ''}, y); }});

    /* ─────────── 🪙 Convertisseur d'autrefois : « ⚖️ La loi en l'an… » ─────────── */
    function mountYear(pane, {year} = {}) {
        pane.innerHTML = `<div class="af-fields dp-af"><label class="af-field af-year"><span>${esc(T('L’année'))}</span><input type="number" data-dp-y min="1500" max="2030" step="1" value="${esc(String(Number(year) || 1850))}"></label>
            <label class="af-field"><span>${esc(T('Pour'))}</span><select data-dp-sex><option value="">${esc(T('tout le monde'))}</option><option value="m">${esc(T('un homme'))}</option><option value="f">${esc(T('une femme'))}</option></select></label>
            <label class="af-field"><span>${esc(T('Âge (facultatif)'))}</span><input type="number" data-dp-age min="0" max="110" step="1" placeholder="23"></label>
            <label class="checkbox-line"><input type="checkbox" data-dp-am> ${esc(T('en Alsace-Moselle'))}</label></div><div class="af-out" data-dp-out aria-live="polite"></div>`;
        const $ = s => pane.querySelector(s);
        const draw = async () => {
            let L; try { L = await loadLaws(); } catch (e) { $('[data-dp-out]').innerHTML = `<p class="muted">${esc(cutOff(e) ? T('Pas de connexion avec LCNDA : rien n’est perdu, réessaie.') : e.message)}</p>`; return; }
            const y = Math.round(Number($('[data-dp-y]').value)); if (!y) return;
            const sex = $('[data-dp-sex]').value, age = $('[data-dp-age]').value === '' ? null : Number($('[data-dp-age]').value);
            const s = yearSummary(L, y, {sex, am: $('[data-dp-am]').checked});
            const facts = [];
            if (s.majority) facts.push(T('Majeur à {a} ans.', {a: s.majority.calc.age}));
            if (s.consent) facts.push(sex ? T('Accord des parents pour se marier : jusqu’à {a} ans.', {a: s.consent.calc[sex]}) : T('Accord des parents pour se marier : jusqu’à {m} ans (hommes), {f} ans (femmes).', {m: s.consent.calc.m, f: s.consent.calc.f}));
            if (s.nubile) facts.push(sex ? T('Âge minimum du mariage : {a} ans.', {a: s.nubile.calc[sex]}) : T('Âge minimum du mariage : {m} ans (hommes), {f} ans (femmes).', {m: s.nubile.calc.m, f: s.nubile.calc.f}));
            if (s.divorce) facts.push(s.divorce.calc.allowed ? T('Le divorce est permis.') : T('Le divorce est interdit.'));
            if (s.school) facts.push(T('Instruction obligatoire de {a} à {b} ans.', {a: s.school.calc.from, b: s.school.calc.to}));
            if (age != null && s.consent && sex) facts.push(age < s.consent.calc[sex] ? T('→ À {a} ans, il faut l’accord des parents.', {a: age}) : T('→ À {a} ans, pas besoin de l’accord des parents.', {a: age}));
            $('[data-dp-out]').innerHTML = `${facts.length ? `<div class="af-big"><small>${esc(T('En {y}', {y}))}</small><ul class="dp-facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
                ${s.rows.length ? `<ul class="dp-laws">${s.rows.map(r => lawLi(r)).join('')}</ul>` : `<p class="muted">${esc(T('Aucune règle de la liste à cette date.'))}</p>`}
                <p class="ui-hint">${esc(T('Sources : articles de Wikipédia (phrase exacte) et les textes qu’ils citent. Liste choisie, pas tout le droit de l’époque.'))}</p>`;
        };
        pane.addEventListener('input', draw); pane.addEventListener('change', draw); draw();
    }
    ext.autrefoisTabs = ext.autrefoisTabs || [];
    if (!ext.autrefoisTabs.some(t => t.id === 'loi') && on('autrefois')) ext.autrefoisTabs.push({id: 'loi', label: T('⚖️ La loi en l’an…'), mount: mountYear});

    /* ─────────── Réglages → « ⚖️ Droit et pouvoir » ─────────── */
    ext.maintenance = ext.maintenance || {};
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let L = null, P = null, AR = null, MI = null; try { [L, P, AR, MI] = await Promise.all([loadLaws(), loadPower(), loadAR(), loadMairesIndex()]); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line" data-dp-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const nPf = Object.values(P?.prefets || {}).reduce((a, d) => a + d.h.length, 0), nBi = Object.values(P?.dioceses || {}).reduce((a, d) => a + d.h.length, 0);
        const nMa = Object.values(MI?.deps || {}).reduce((a, d) => a + d[1], 0), nMc = Object.values(MI?.deps || {}).reduce((a, d) => a + d[0], 0);
        const src = [['Wikipédia (fr)', T('{n} règles de droit, chacune avec la phrase exacte de l’article et ses références (Légifrance, Gallica…)', {n: nf(L?.rows?.length)}), 'CC BY-SA 4.0', 'https://fr.wikipedia.org/'],
            ['Wikidata', T('Chefs de l’État ({a}), préfets ({b}), évêques ({c}), maires ({d} mandats, {e} communes)', {a: nf(P?.france?.length), b: nf(nPf), c: nf(nBi), d: nf(nMa), e: nf(nMc)}), 'CC0 1.0', 'https://www.wikidata.org/'],
            [T('Atlas d’Ancien Régime (Th. Fressin)'), T('{n} communes : généralité, bailliage, diocèse, province, gouvernement, parlement en 1789', {n: nf(Object.keys(AR?.c || {}).length)}), 'CC BY-SA 4.0 (CC BY 4.0 pour généralités, bailliages, parlements)', AR?.url || 'https://github.com/t-fressin/atlas-ancien-regime'],
            ['INSEE', T('Noms des départements (Code officiel géographique 2025)'), 'Licence Ouverte 2.0', 'https://www.insee.fr/fr/information/8377252']];
        ws.innerHTML = `<section class="page dp-settings" data-dp-settings>${UI().pageHeader ? UI().pageHeader({title: T('Droit et pouvoir'), help: esc(T('Ce que la loi disait à l’époque (mariage, service militaire, école, état civil…), les gens de pouvoir (chef de l’État, préfet, évêque, maire) et la paroisse sous l’Ancien Régime. Livré avec l’app, rien ne part sur Internet.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Licence'))}</th></tr></thead>
                <tbody>${src.map(r => `<tr><td>${link(r[3], r[0] + ' ↗')}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
                ${AR ? `<p><small class="muted">${esc(T('Attribution de l’atlas : {a}', {a: AR.attribution}))}</small></p>` : ''}
                <p class="muted"><small>${esc(T('Ce qui manque : l’élection, la coutume et la subdélégation (aucune source ouverte complète) ; les curés ; les maires des petites communes (Wikidata est partiel) ; les évêques entre 1790 et 1822 ; les chefs d’État des pays dont les frontières ont changé.'))}</small></p></div></section>`;
    }
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-dp-tg]'); if (!t || !e.target.matches('input')) return;
        const k = t.dataset.dpTg, before = settings()[k]; save({[k]: e.target.checked});
        A().undoToast?.(e.target.checked ? T('Partie montrée') : T('Partie masquée'), {undo: () => { save({[k]: before}); drawSettings(); }, redo: () => { save({[k]: !before}); drawSettings(); }});
    });
    document.addEventListener('click', e => {
        const l = e.target.closest?.('[data-dp-list]'); if (!l) return;
        e.preventDefault(); const id = 'dp_' + l.dataset.dpList;
        if (ext.dataListsEngine?.open) ext.dataListsEngine.open(id); else { const st = S(); st.listType = 'data_' + id; A().setModule?.('listes'); }
    });

    /* ─────────── 🧰 les registres communs : listes et données à la demande ─────────── */
    const THEMES = {etat_civil: 'état civil', mariage: 'mariage', majorite: 'majorité', divorce: 'divorce', militaire: 'service militaire', ecole: 'école', noms: 'noms et prénoms',
        succession: 'héritage', filiation: 'enfants naturels', nationalite: 'nationalité', femmes: 'droits des femmes', vote: 'vote', religion: 'religion', alsace_moselle: 'Alsace-Moselle'};
    const L0 = ext.dataLists = ext.dataLists || [];
    const lawRow = r => ({title: r.title, theme: THEMES[r.theme] || r.theme, from: dnum(r.from) ? yOf(dnum(r.from)) : null, to: r.to ? yOf(dnum(r.to)) : null,
        who: r.sex === 'm' ? T('hommes') : r.sex === 'f' ? T('femmes') : T('tous'), region: r.region === 'am' ? 'Alsace-Moselle' : r.region === 'normandie' ? 'Normandie' : T('toute la France'),
        rule: r.rule, quote: r.src?.quote || '', article: r.src?.title || '', source: r.src?.url || '', texte: (r.src?.refs || []).map(x => x.url).find(u => /legifrance|gallica|wikisource/.test(u)) || '', raw: r});
    const openLaw = row => { const r = row.raw || row; const d = document.createElement('dialog'); d.className = 'modal dp-dlg'; d.innerHTML = `<div class="modal-head"><h2>${esc((r.icon || '⚖️') + ' ' + r.title)}</h2><button type="button" class="icon-button" data-dp-close aria-label="${esc(T('Fermer'))}">✕</button></div><div class="modal-body"><ul class="dp-laws">${lawLi(r)}</ul></div>`; document.body.appendChild(d); d.addEventListener('close', () => d.remove()); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-dp-close]')) d.close(); }); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); d.querySelector('details')?.setAttribute('open', ''); };
    L0.push({id: 'dp_lois', icon: '⚖️', label: 'Ce que la loi disait', group: 'Le monde', source: 'Wikipédia (citations, CC BY-SA 4.0) · textes cités (Légifrance, Gallica…)', sourceUrl: 'https://fr.wikipedia.org/',
        load: async () => (await loadLaws()).rows.map(lawRow),
        fields: [{key: 'title', label: 'Règle', type: 'text'}, {key: 'theme', label: 'Sujet', type: 'enum', values: Object.values(THEMES)}, {key: 'from', label: 'Depuis', type: 'year'}, {key: 'to', label: 'Jusqu’à', type: 'year'},
            {key: 'who', label: 'Pour', type: 'enum', values: [T('tous'), T('hommes'), T('femmes')]}, {key: 'region', label: 'Où', type: 'enum', values: [T('toute la France'), 'Alsace-Moselle', 'Normandie']},
            {key: 'rule', label: 'En clair', type: 'text'}, {key: 'quote', label: 'Phrase de la source', type: 'text'}, {key: 'article', label: 'Article', type: 'text'}, {key: 'source', label: 'Source (Wikipédia)', type: 'url'}, {key: 'texte', label: 'Texte (Légifrance, Gallica…)', type: 'url'}],
        period: r => [r.from, r.to], open: openLaw});
    L0.push({id: 'dp_chefs_etat', icon: '👑', label: 'Chefs de l’État', group: 'Le monde', source: 'Wikidata (CC0 1.0)', sourceUrl: 'https://www.wikidata.org/',
        load: async () => {
            const P = await loadPower(); let C = null; try { C = await ext.mondeContexte?.loadStats?.(); } catch (_) {}
            const fr = asList(P.france).map(h => ({name: h[0], title: h[6] ? T('régime') : h[4], country: 'France', from: yOf(dnum(h[2]) || 0) || null, to: h[3] ? yOf(dnum(h[3])) : null, wikidata: wdUrl(h[1])}));
            const wo = Object.entries(P.world || {}).flatMap(([iso, c]) => c.h.map(h => ({name: h.n, title: T('chef de l’État'), country: C?.c?.[iso]?.n || c.c, from: yOf(dnum(h.s) || 0) || null, to: h.e ? yOf(dnum(h.e)) : null, wikidata: wdUrl(h.q)})));
            return [...fr, ...wo];
        },
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'title', label: 'Titre', type: 'text'}, {key: 'country', label: 'Pays', type: 'enum'}, {key: 'from', label: 'Début', type: 'year'}, {key: 'to', label: 'Fin', type: 'year'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}],
        period: r => [r.from, r.to]});
    L0.push({id: 'dp_prefets', icon: '🎩', label: 'Préfets des départements', group: 'Le lieu', source: 'Wikidata (CC0 1.0)', sourceUrl: 'https://www.wikidata.org/',
        load: async () => { const [P, AR] = await Promise.all([loadPower(), loadAR().catch(() => null)]); return Object.entries(P.prefets || {}).flatMap(([dep, x]) => x.h.map(h => ({name: h[0], dep, depName: AR?.deps?.[dep] || '', post: x.pos?.[0]?.[1] || '', from: yOf(dnum(h[2]) || 0) || null, to: h[3] ? yOf(dnum(h[3])) : null, wikidata: wdUrl(h[1])}))); },
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'post', label: 'Fonction', type: 'text'}, {key: 'dep', label: 'Département (code)', type: 'text'}, {key: 'depName', label: 'Département', type: 'enum'}, {key: 'from', label: 'Début', type: 'year'}, {key: 'to', label: 'Fin', type: 'year'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}],
        period: r => [r.from, r.to]});
    L0.push({id: 'dp_eveques', icon: '⛪', label: 'Évêques des diocèses de France', group: 'Le lieu', source: 'Wikidata (CC0 1.0)', sourceUrl: 'https://www.wikidata.org/',
        load: async () => { const P = await loadPower(); return Object.values(P.dioceses || {}).flatMap(dd => dd.h.map(h => ({name: h[0], diocese: dd.n, seat: dd.seat || '', from: yOf(dnum(h[2]) || 0) || null, to: h[3] ? yOf(dnum(h[3])) : null, wikidata: wdUrl(h[1]), dioceseUrl: wdUrl(dd.q)}))); },
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'diocese', label: 'Diocèse', type: 'enum'}, {key: 'from', label: 'Début', type: 'year'}, {key: 'to', label: 'Fin', type: 'year'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}, {key: 'dioceseUrl', label: 'Le diocèse (Wikidata)', type: 'url'}],
        period: r => [r.from, r.to]});
    L0.push({id: 'dp_maires', icon: '🏛️', label: 'Maires (connus de Wikidata)', group: 'Le lieu', source: 'Wikidata (CC0 1.0)', sourceUrl: 'https://www.wikidata.org/',
        load: async () => {
            const [MI, AR] = await Promise.all([loadMairesIndex(), loadAR().catch(() => null)]); if (!MI) return [];
            const files = await Promise.all(Object.keys(MI.deps).map(d => loadMaires(d)));
            return files.filter(Boolean).flatMap(f => Object.entries(f.m).flatMap(([insee, l]) => l.map(h => ({name: h[0], commune: AR?.c?.[insee]?.[0] || insee, insee, dep: f.dep, depName: AR?.deps?.[f.dep] || '', from: yOf(dnum(h[2]) || 0) || null, to: h[3] ? yOf(dnum(h[3])) : null, wikidata: wdUrl(h[1])}))));
        },
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'commune', label: 'Commune', type: 'place'}, {key: 'insee', label: 'Code INSEE', type: 'text'}, {key: 'depName', label: 'Département', type: 'enum'}, {key: 'from', label: 'Début', type: 'year'}, {key: 'to', label: 'Fin', type: 'year'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}],
        period: r => [r.from, r.to]});
    L0.push({id: 'dp_ancien_regime', icon: '🏛️', label: 'Communes sous l’Ancien Régime (1789)', group: 'Le lieu', source: 'Atlas d’Ancien Régime (Th. Fressin), CC BY-SA 4.0', sourceUrl: 'https://github.com/t-fressin/atlas-ancien-regime',
        load: async () => { const AR = await loadAR(); const CERT = ['base', 'confirmé', 'corrigé', 'douteux']; return Object.keys(AR.c).map(insee => { const a = arOf(AR, insee); return {commune: a.commune, insee, depName: AR.deps?.[depOf(insee)] || depOf(insee), royaume: a.royaume === 1 ? T('oui') : a.royaume === 0 ? T('non') : '?',
            generalite: a.generalite?.n || '', bailliage: a.bailliage?.n || '', siege: a.bailliage?.cl || '', diocese: a.diocese?.n || '', province: a.province?.n || '', gouvernement: a.gouvernement?.n || '', parlement: a.parlement?.n || '',
            doute: /3/.test(a.certs) ? T('oui') : T('non'), source: AR.csv_url}; }); },
        fields: [{key: 'commune', label: 'Commune', type: 'place'}, {key: 'insee', label: 'Code INSEE', type: 'text'}, {key: 'depName', label: 'Département', type: 'enum'}, {key: 'royaume', label: 'Dans le royaume', type: 'enum', values: [T('oui'), T('non'), '?']},
            {key: 'generalite', label: 'Généralité', type: 'enum'}, {key: 'bailliage', label: 'Bailliage ou sénéchaussée', type: 'enum'}, {key: 'siege', label: 'Siège du bailliage', type: 'text'}, {key: 'diocese', label: 'Diocèse', type: 'enum'},
            {key: 'province', label: 'Province', type: 'enum'}, {key: 'gouvernement', label: 'Gouvernement', type: 'enum'}, {key: 'parlement', label: 'Parlement', type: 'enum'}, {key: 'doute', label: 'À vérifier', type: 'enum', values: [T('oui'), T('non')]}, {key: 'source', label: 'Source', type: 'url'}]});

    const personOfCtx = async p => { const id = Number(p?.id || p?.person_id || p) || 0; return id ? (details.get(id) || await A().api('person', {id})) : null; };
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || '', county: pl.county || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, insee: pl.insee || ''} : null);
    const emptyLine = (t, icon = '⚖️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'dp_lois_personne', icon: '⚖️', label: T('Ce que la loi disait pour lui ou elle'), group: 'La personne', needs: ['person'], installed: () => true,
            run: async (ctx, host) => { const d = await personOfCtx(ctx.person); const ok = d && await lawsInto(host, d); if (!ok) host.innerHTML = emptyLine(T('Ajoute des dates (naissance, mariage…) : l’app dira ce que la loi disait.')); }},
        {id: 'dp_lois_annee', icon: '⚖️', label: T('La loi en l’an…'), group: 'Le monde', needs: ['year'], installed: () => true, run: async (ctx, host) => mountYear(host, {year: ctx.year})},
        {id: 'dp_pouvoir_personne', icon: '🎩', label: T('Les gens de pouvoir de sa vie'), group: 'La personne', needs: ['person'], installed: () => true,
            run: async (ctx, host) => { const d = await personOfCtx(ctx.person); const ok = d && await powerInto(host, d); if (!ok) host.innerHTML = emptyLine(T('Ajoute des dates et des lieux : l’app dira qui gouvernait.'), '🎩'); }},
        {id: 'dp_pouvoir_lieu', icon: '🎩', label: T('Maires, préfets et évêques d’une commune'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const p = placeOfCtx(ctx.place); const y = Number(ctx.year) || 0; const ok = p && await placePowerInto(host, p, y ? {from: y, to: y} : null); if (!ok) host.innerHTML = emptyLine(T('Rien de connu de Wikidata pour cette commune.'), '🎩'); }},
        {id: 'dp_ancien_regime', icon: '🏛️', label: T('Sa paroisse sous l’Ancien Régime'), group: 'Le lieu', needs: ['place'], installed: () => true,
            run: async (ctx, host) => { const p = placeOfCtx(ctx.place); const ok = p && await arInto(host, p); if (!ok) host.innerHTML = emptyLine(T('Commune non retrouvée dans l’atlas de 1789 (seulement les communes de France métropolitaine).'), '🏛️'); }});

    /* ─────────── branchement : blocs de fiche, onglet de Réglages ─────────── */
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { scanPerson(); decorateVillage(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});
    function register() {
        const Bk = A()?.defaultPersonBlocks;
        if (Array.isArray(Bk)) {
            for (const [k, label, after] of [['droit_lois', '⚖️ Ce que la loi disait', 'monde_contexte'], ['droit_pouvoir', '🎩 Les gens de pouvoir de sa vie', 'droit_lois']]) {
                if (Bk.some(b => b[0] === k)) continue;
                let i = Bk.findIndex(b => b[0] === after); if (i < 0) i = Bk.findIndex(b => b[0] === 'histoire'); if (i < 0) i = Bk.findIndex(b => b[0] === 'bio');
                Bk.splice(i < 0 ? Bk.length : i + 1, 0, [k, label]);
            }
        }
        const tabs = A().defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = ['chateaux_territoires', 'commune_culture', 'histoire', 'meteo'].map(k => tabs.findIndex(t => t[0] === k)).find(j => j >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        return !!(Bk && tabs);
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.droitPouvoir = {...core, settings, loadLaws, loadPower, loadAR, loadMaires, lawsInto, powerInto, arInto, placePowerInto, mountYear, drawSettings, personCtx,
        openSettings: () => { const st = S(); st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
