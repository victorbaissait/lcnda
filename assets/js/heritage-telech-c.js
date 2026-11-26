/**
 * LCNDA — 📊 La vie en chiffres et 📚 la commune dans les livres d'époque (téléchargements, lot C).
 * Ce qui est NEUF ici (le reste existe déjà dans l'app et n'est pas refait — voir docs/telechargements-lot-c.md) :
 *   ⚰️ tc-sgf-deces.json.gz  les décès de chaque département, année par année, de l'an IX (1800-1801) à 1855 : Statistique générale
 *                            de la France, tableaux publiés par l'Insee (Licence Ouverte 2.0, « Source : Insee ») ; refait par
 *                            scripts/telech-c/build_sgf_deces.py. Sert aux années de choléra (1832, 1849, 1854) : « +56 % de décès
 *                            dans l'Aisne en 1832 par rapport aux années voisines » — un rapport aux années voisines, pas un nombre
 *                            de morts du choléra (les tableaux ne donnent pas la cause).
 *   📖 tc-joanne/<dép>.json.gz  (pack, fabriqué sur GitHub : .github/workflows/telech-c-joanne.yml) l'article de chaque commune dans
 *                            le Dictionnaire géographique d'Adolphe Joanne (1869), texte OCR d'Internet Archive (domaine public) avec
 *                            le lien vers la page ; sans le pack : le lien « chercher dans le livre » de la commune.
 *   🧮 Human Mortality Database / 👶 Human Fertility Database (CC BY 4.0, mais il faut un compte pour télécharger) : la personne
 *                            télécharge elle-même le fichier sur mortality.org / humanfertility.org et l'ouvre ici ; il est lu sur
 *                            l'ordinateur (rien n'est envoyé) et gardé dans le navigateur (localStorage « genealogie-telech-c-tables »).
 *   🔗 des liens seulement (licence pas ouverte ou pas vérifiable, ou scans seulement) : Joanne 1890-1905, Guides Joanne, Baedeker,
 *                            statistiques des préfets (an IX-XIII), Livret Chaix, catalogues Manufrance, menus de la NYPL.
 * Où : fiche d'une personne, bloc « 📊 Sa vie en chiffres » ; fiche d'un village et Monographie de commune (« 📚 La commune dans
 *   les livres d'époque », « ⚰️ Les années de choléra ») ; Listes ; à la demande (LCNDA_EXT.dataSources) ;
 *   Réglages → « 📊 La vie en chiffres » (chaque sujet s'éteint ↶, tables HMD/HFD, À propos avec les licences).
 * window.LCNDA_EXT.telechC = {core…, personInto, placeInto, openSettings}.   Essai : tests/test-telech-c.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    /** les départements d'aujourd'hui (pour lire un nom écrit dans un lieu) ; les anciens noms aussi */
    const DEPS = {'01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège',
        10: 'Aube', 11: 'Aude', 12: 'Aveyron', 13: 'Bouches-du-Rhône', 14: 'Calvados', 15: 'Cantal', 16: 'Charente', 17: 'Charente-Maritime', 18: 'Cher', 19: 'Corrèze', '2A': 'Corse-du-Sud',
        '2B': 'Haute-Corse', 21: 'Côte-d’Or', 22: 'Côtes-d’Armor', 23: 'Creuse', 24: 'Dordogne', 25: 'Doubs', 26: 'Drôme', 27: 'Eure', 28: 'Eure-et-Loir', 29: 'Finistère', 30: 'Gard',
        31: 'Haute-Garonne', 32: 'Gers', 33: 'Gironde', 34: 'Hérault', 35: 'Ille-et-Vilaine', 36: 'Indre', 37: 'Indre-et-Loire', 38: 'Isère', 39: 'Jura', 40: 'Landes', 41: 'Loir-et-Cher',
        42: 'Loire', 43: 'Haute-Loire', 44: 'Loire-Atlantique', 45: 'Loiret', 46: 'Lot', 47: 'Lot-et-Garonne', 48: 'Lozère', 49: 'Maine-et-Loire', 50: 'Manche', 51: 'Marne', 52: 'Haute-Marne',
        53: 'Mayenne', 54: 'Meurthe-et-Moselle', 55: 'Meuse', 56: 'Morbihan', 57: 'Moselle', 58: 'Nièvre', 59: 'Nord', 60: 'Oise', 61: 'Orne', 62: 'Pas-de-Calais', 63: 'Puy-de-Dôme',
        64: 'Pyrénées-Atlantiques', 65: 'Hautes-Pyrénées', 66: 'Pyrénées-Orientales', 67: 'Bas-Rhin', 68: 'Haut-Rhin', 69: 'Rhône', 70: 'Haute-Saône', 71: 'Saône-et-Loire', 72: 'Sarthe',
        73: 'Savoie', 74: 'Haute-Savoie', 75: 'Paris', 76: 'Seine-Maritime', 77: 'Seine-et-Marne', 78: 'Yvelines', 79: 'Deux-Sèvres', 80: 'Somme', 81: 'Tarn', 82: 'Tarn-et-Garonne',
        83: 'Var', 84: 'Vaucluse', 85: 'Vendée', 86: 'Vienne', 87: 'Haute-Vienne', 88: 'Vosges', 89: 'Yonne', 90: 'Territoire de Belfort', 91: 'Essonne', 92: 'Hauts-de-Seine',
        93: 'Seine-Saint-Denis', 94: 'Val-de-Marne', 95: 'Val-d’Oise'};
    const OLD_NAMES = {'Basses-Alpes': '04', 'Charente-Inférieure': '17', 'Côtes-du-Nord': '22', 'Loire-Inférieure': '44', 'Meurthe': '54', 'Basses-Pyrénées': '64', 'Seine-Inférieure': '76',
        'Seine': '75', 'Seine-et-Oise': '78', 'Corse': '2A'};
    const DEP_BY_NAME = (() => { const m = new Map(); for (const [c, n] of Object.entries(DEPS)) m.set(fold(n), String(c).padStart(2, '0')); for (const [n, c] of Object.entries(OLD_NAMES)) m.set(fold(n), c); return m; })();
    /** le code du département d'un lieu : par son code INSEE, sinon par un nom de département écrit dans le lieu (« Allanche, Cantal, France ») */
    function depOf(place) {
        if (!place) return null;
        const ins = String(place.insee || '').trim().toUpperCase();
        if (/^97\d{3}$/.test(ins)) return null;
        if (/^(2A|2B|\d{2})\d{3}$/.test(ins)) return ins.slice(0, 2);
        const country = fold(place.country || '');
        if (country && !/^(france|fr|fra)$/.test(country)) return null;
        const parts = [place.county, place.state, ...String(place.full || place.place_full || '').split(',')].map(fold).filter(Boolean);
        for (const p of parts) if (DEP_BY_NAME.has(p)) return DEP_BY_NAME.get(p);
        return null;
    }
    /** la ligne de la SGF qui couvre ce département d'aujourd'hui (Seine → 75, 92, 93, 94 ; Meurthe → 54…) */
    const sgfRow = (D, dep) => (D && dep ? (D.rows || []).find(r => (r.deps || []).includes(dep)) || null : null);
    const yearOfLabel = l => { const m = String(l).match(/(1[89]\d\d)\)?$/); return m ? Number(m[1]) : null; };
    /** les années « civiles » de la série (1806 →) : {année: index} — les ans IX à XIV ne sont pas des années civiles */
    const civilIndex = D => { const out = {}; (D?.years || []).forEach((l, i) => { if (/^\d{4}$/.test(l)) out[Number(l)] = i; }); return out; };
    const CHOLERA = [1832, 1849, 1854];
    /** les décès d'une année comparés à la moyenne des années voisines (jusqu'à 3 de chaque côté, sans les autres années de choléra) */
    function crisis(D, row, year, around = 3) {
        if (!D || !row) return null;
        const idx = civilIndex(D), i = idx[year]; if (i === undefined) return null;
        const n = num(row.v[i]); if (n === null) return null;
        const base = [];
        for (let d = 1; d <= around; d++) for (const y of [year - d, year + d]) {
            if (CHOLERA.includes(y) || idx[y] === undefined) continue;
            const v = num(row.v[idx[y]]); if (v !== null) base.push([y, v]);
        }
        if (base.length < 2) return null;
        const mean = base.reduce((s, [, v]) => s + v, 0) / base.length;
        return {year, n, mean: Math.round(mean), ratio: n / mean, pct: Math.round((n / mean - 1) * 100), baseYears: base.map(([y]) => y).sort((a, b) => a - b)};
    }
    /** les années de choléra (1832, 1849, 1854) de sa vie dans son département, avec son âge */
    function choleraInLife(D, row, birth, death) {
        if (!row || birth === null || birth === undefined) return [];
        const end = death ?? birth + 90;
        return CHOLERA.filter(y => y >= birth && y <= end).map(y => ({...crisis(D, row, y), age: y - birth})).filter(x => x.n !== undefined && x.ratio !== undefined);
    }

    /* ─────────── 🧮 Human Mortality Database : une table de mortalité (fichier texte du site) ─────────── */
    /** lit un fichier « fltper_1x1.txt », « mltper_1x1.txt », « bltper_1x1.txt » (du moment) ou « fltcoh_1x1.txt »… (génération) */
    function parseHMD(text) {
        const lines = String(text || '').replace(/\r/g, '').split('\n');
        const head = lines[0] || '';
        const m = head.match(/^\s*(.+?),\s*Life tables?\s*\((period|cohort)\s*1x1\)\s*,\s*([^\t]+?)\s*(?:\t|Last modified|$)/i);
        if (!m) return null;
        const sexW = m[3].toLowerCase(), sex = /female/.test(sexW) ? 'F' : /male/.test(sexW) ? 'M' : 'T';
        const hi = lines.findIndex(l => /^\s*Year\s+Age\s+/i.test(l)); if (hi < 0) return null;
        const cols = lines[hi].trim().split(/\s+/).map(c => c.toLowerCase()), iy = cols.indexOf('year'), ia = cols.indexOf('age'), il = cols.indexOf('lx'), ie = cols.indexOf('ex');
        if (iy < 0 || ia < 0 || il < 0) return null;
        const years = {};
        for (const l of lines.slice(hi + 1)) {
            const c = l.trim().split(/\s+/); if (c.length < cols.length) continue;
            const y = parseInt(c[iy], 10), a = parseInt(c[ia], 10); if (!Number.isFinite(y) || !Number.isFinite(a) || a > 110) continue;
            const lx = num(c[il]); const Y = years[y] = years[y] || {lx: [], e0: null};
            Y.lx[a] = lx; if (a === 0 && ie >= 0) Y.e0 = num(c[ie]);
        }
        const ys = Object.keys(years).map(Number);
        if (!ys.length) return null;
        return {db: 'hmd', country: m[1].trim(), kind: m[2].toLowerCase(), sex, from: Math.min(...ys), to: Math.max(...ys), years};
    }
    /** les chances d'atteindre chaque âge pour un enfant né en birth : la table de génération d'abord, sinon celle du moment */
    function survival(tables, birth, sex, ages = [1, 5, 20, 40, 60, 80]) {
        if (birth === null || birth === undefined) return null;
        const pick = kind => ['F', 'M'].includes(sex) && tables.find(t => t.kind === kind && t.sex === sex && t.years[birth]) || tables.find(t => t.kind === kind && t.sex === 'T' && t.years[birth]) || tables.find(t => t.kind === kind && t.years[birth]);
        const t = pick('cohort') || pick('period'); if (!t) return null;
        const lx = t.years[birth].lx, l0 = num(lx[0]); if (!l0) return null;
        const at = a => (num(lx[a]) === null ? null : Math.round(lx[a] / l0 * 100));
        return {table: t, year: birth, e0: t.years[birth].e0, ages: ages.map(a => ({age: a, per100: at(a)})).filter(x => x.per100 !== null), at};
    }
    /* ─────────── 👶 Human Fertility Database : une série par année (fichier texte du site) ─────────── */
    const HFD_MEASURES = {tfr: 'Indicateur conjoncturel de fécondité (enfants par femme)', mab: 'Âge moyen des mères à la naissance', ccf: 'Descendance finale (enfants par femme, selon l’année de naissance de la femme)'};
    function parseHFD(text) {
        const lines = String(text || '').replace(/\r/g, '').split('\n');
        const head = (lines[0] || '').split('\t')[0].trim();
        const hi = lines.findIndex(l => /^\s*(Code\s+)?(Year|Cohort)\s+/i.test(l)); if (hi < 0) return null;
        const cols = lines[hi].trim().split(/\s+/).map(c => c.toLowerCase());
        const ic = cols.indexOf('code'), iy = cols.findIndex(c => c === 'year' || c === 'cohort');
        const im = cols.findIndex(c => /^(tfr|mab|ccf)/.test(c)); if (iy < 0 || im < 0) return null;
        const measure = cols[im].replace(/\d+$/, '').slice(0, 3);
        const out = {};
        for (const l of lines.slice(hi + 1)) {
            const c = l.trim().split(/\s+/); if (c.length <= Math.max(iy, im)) continue;
            const y = parseInt(c[iy], 10), v = num(c[im]); if (!Number.isFinite(y) || v === null) continue;
            const code = ic >= 0 ? c[ic] : (head.split(',')[0] || '').trim();
            (out[code] = out[code] || {})[y] = v;
        }
        const codes = Object.keys(out); if (!codes.length) return null;
        return codes.map(code => { const ys = Object.keys(out[code]).map(Number); return {db: 'hfd', country: code, measure, by: cols[iy] === 'cohort' ? 'cohort' : 'year', from: Math.min(...ys), to: Math.max(...ys), years: out[code]}; });
    }
    const isFrance = c => /^(france|fra|fratnp)$/i.test(String(c || '').trim());

    /* ─────────── 🔗 les liens (livres d'époque) : seulement une adresse, rien n'est envoyé ─────────── */
    const enc = encodeURIComponent;
    const LINKS = {
        joanne1869: c => `https://archive.org/details/dictionnairego00joanuoft?q=${enc(`"${c}"`)}`,
        joanne1890: () => 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=%28dc.title%20all%20%22Dictionnaire%20g%C3%A9ographique%20et%20administratif%20de%20la%20France%22%29',
        guides: c => `https://archive.org/search?query=${enc(`"${c}" AND (creator:(Joanne) OR creator:(Baedeker))`)}&sin=TXT`,
        baedeker: () => `https://archive.org/search?query=${enc('creator:(Baedeker) AND title:(France)')}`,
        prefets: d => `https://archive.org/search?query=${enc(`title:("statistique du département" AND "${d}") AND date:[1799 TO 1815]`)}`,
        prefetsGallica: d => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${enc(`(dc.title all "statistique du département" and dc.title all "${d}")`)}`,
        chaix: () => 'https://archive.org/details/livret-chaix-continental-1869',
        chaixGallica: () => 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=%28dc.title%20all%20%22Livret-Chaix%22%29',
        manufrance: () => 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=%28gallica%20all%20%22Manufacture%20fran%C3%A7aise%20d%27armes%20et%20cycles%22%29',
        menus: () => 'https://menus.nypl.org/',
        hmd: () => 'https://www.mortality.org/Country/Country?cntr=FRATNP',
        hfd: () => 'https://www.humanfertility.org/Country/Country?cntr=FRATNP'
    };

    const core = {num, fold, DEPS, depOf, sgfRow, yearOfLabel, civilIndex, CHOLERA, crisis, choleraInLife, parseHMD, survival, parseHFD, HFD_MEASURES, isFrance, LINKS};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const KEY = 'genealogie-telech-c', TKEY = 'genealogie-telech-c-tables';
    const TAB = ['telech_c', '25tc', '📊 La vie en chiffres'];
    const BLOCK = 'telech_c';
    const PARTS = [
        ['cholera', '⚰️ Les années de choléra', 'Sur la fiche d’une personne et d’un village : les décès de son département en 1832, 1849 et 1854, comparés aux années voisines (Statistique générale de la France, Insee).'],
        ['survie', '🧮 Ses chances de vivre jusqu’à…', 'Sur 100 enfants nés la même année que lui, combien atteignaient 1, 20, 60 ans (Human Mortality Database, si tu as ouvert sa table ici).'],
        ['fecondite', '👶 Le nombre d’enfants par femme', 'L’indicateur de fécondité de l’année de sa naissance ou de son mariage (Human Fertility Database, si tu as ouvert sa table ici).'],
        ['livres', '📚 La commune dans les livres d’époque', 'Sur la fiche d’un village et dans la monographie : l’article du dictionnaire de Joanne (1869), les guides de voyage, la statistique du préfet.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = url => (url ? `<a class="tc-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const row = (icon, html, src, extra = '') => `<div class="hist-row tc-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tc-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const data = {};
    const getJson = (key, url) => {
        if (!data[key]) data[key] = fetch(url, {credentials: 'same-origin'}).then(r => (r.status === 404 ? null : r.ok ? readMaybeGz(r) : Promise.reject(new Error(r.status)))).catch(e => { delete data[key]; throw e; });
        return data[key];
    };
    const loadDeaths = () => getJson('deaths', 'assets/data/tc-sgf-deces.json.gz?v=1');
    const loadJoanne = dep => (/^(\d\d|2A|2B)$/.test(dep || '') ? getJson(`joanne-${dep}`, `assets/data/tc-joanne/${dep}.json.gz`).catch(() => null) : Promise.resolve(null));

    /* ─────────── les tables HMD / HFD ouvertes par la personne (gardées dans le navigateur) ─────────── */
    const tables = () => { try { const t = JSON.parse(localStorage.getItem(TKEY) || '[]'); return Array.isArray(t) ? t : []; } catch (_) { return []; } };
    const saveTables = list => { try { localStorage.setItem(TKEY, JSON.stringify(list)); return true; } catch (_) { return false; } };
    const tableId = t => `${t.db}|${t.country}|${t.kind || t.measure}|${t.sex || t.by || ''}`;
    /** un fichier texte → les tables reconnues, ajoutées (ou remplacées) ; rien n'est envoyé sur Internet */
    function addTableText(text) {
        const h = parseHMD(text); const list = h ? [h] : (parseHFD(text) || []);
        if (!list.length) return {ok: false, added: []};
        const cur = tables().filter(t => !list.some(n => tableId(n) === tableId(t)));
        const ok = saveTables([...cur, ...list]);
        return {ok, added: list};
    }
    const tableLabel = t => (t.db === 'hmd'
        ? T('{c} — table de mortalité {k}, {s} ({a}–{b})', {c: t.country, k: T(t.kind === 'cohort' ? 'par génération' : 'du moment'), s: T({F: 'femmes', M: 'hommes', T: 'ensemble'}[t.sex]), a: String(t.from), b: String(t.to)})
        : T('{c} — {m} ({a}–{b})', {c: t.country, m: T(HFD_MEASURES[t.measure] || t.measure), a: String(t.from), b: String(t.to)}));

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    /** son département : celui de sa naissance, sinon de son décès, sinon du premier lieu français */
    function depOfLife(life) {
        const ev = life?.events || [];
        const by = tags => ev.find(e => tags.includes(String(e.tag || '').toUpperCase()) && depOf({insee: e.insee, country: e.country, full: e.place_full}));
        const e = by(['BIRT', 'BAPM', 'CHR']) || by(['DEAT', 'BURI']) || ev.find(x => depOf({insee: x.insee, country: x.country, full: x.place_full}));
        return e ? {dep: depOf({insee: e.insee, country: e.country, full: e.place_full}), place: e.place} : null;
    }
    const SRC_SGF = D => `${link(D?.url || 'https://www.insee.fr/fr/statistiques/2659665?sommaire=2591397', 'Insee — Statistique générale de la France, mouvement de la population')} (${esc(T('Licence Ouverte 2.0, « Source : Insee »'))})`;
    function choleraHtml(D, dr, list, who) {
        if (!list.length) return '';
        const top = list.slice().sort((a, b) => b.ratio - a.ratio)[0];
        const word = top.pct >= 0 ? T('{p} % de décès en plus', {p: String(top.pct)}) : T('{p} % de décès en moins', {p: String(-top.pct)});
        const lead = who
            ? T('En {y}, année du choléra, {d} a compté {n} décès : {w} que les années voisines. {e} avait {a} ans.', {y: String(top.year), d: `<b>${esc(dr.n)}</b>`, n: nf(top.n), w: word, e: esc(who.he), a: String(top.age)})
            : T('En {y}, année du choléra, {d} a compté {n} décès : {w} que les années voisines.', {y: String(top.year), d: `<b>${esc(dr.n)}</b>`, n: nf(top.n), w: word});
        const li = x => `<li>${esc(T('{y} : {n} décès, moyenne des années {b} : {m} ({p})', {y: String(x.year), n: nf(x.n), b: x.baseYears.join(', '), m: nf(x.mean), p: `${x.pct >= 0 ? '+' : ''}${x.pct} %`}))}</li>`;
        return row('⚰️', `${lead} ${srcLink(D.url)}`, SRC_SGF(D), more(`<ul class="hist-ul tc-ul">${list.map(li).join('')}</ul>${hyp(T('Les tableaux donnent tous les décès de l’année, sans leur cause : l’écart avec les années voisines donne l’ampleur de la crise, pas le nombre exact de morts du choléra. Département d’alors : {d}.', {d: dr.n}))}`, list.length));
    }
    async function choleraForPerson(life) {
        const P = life.person; if (num(P.birth) === null) return '';
        const D = await loadDeaths().catch(() => null); if (!D) return '';
        const where = depOfLife(life); const r = sgfRow(D, where?.dep); if (!r) return '';
        const list = choleraInLife(D, r, num(P.birth), num(P.death)).filter(x => x.pct >= 5);
        return choleraHtml(D, r, list, {he: cap(he(P))});
    }
    const srcHmd = t => `${link(LINKS.hmd(), 'Human Mortality Database')} (${esc(T('CC BY 4.0 ; fichier ouvert ici par toi, le {d}', {d: t.added || ''}))})`;
    function survieForPerson(life) {
        const P = life.person, b = num(P.birth); if (b === null) return '';
        const ts = tables().filter(t => t.db === 'hmd'); if (!ts.length) return '';
        // le pays : celui de sa naissance (France si rien n'est dit)
        const fr = ts.filter(t => isFrance(t.country)), use = fr.length ? fr : ts;
        const s = survival(use, b, P.gender === 'female' ? 'F' : P.gender === 'male' ? 'M' : 'T'); if (!s) return '';
        const pick = s.ages.filter(x => [1, 20, 60].includes(x.age));
        if (!pick.length) return '';
        const t = s.table, kindTxt = t.kind === 'cohort' ? T('table de génération') : T('table du moment de {y}', {y: String(b)});
        const lead = T('Sur 100 enfants nés en {y} ({c}), {l}.', {y: String(b), c: esc(t.country), l: pick.map(x => T(x.age === 1 ? '{n} atteignaient 1 an' : '{n} atteignaient {a} ans', {n: String(x.per100), a: String(x.age)})).join(', ')});
        const age = num(P.death) !== null ? num(P.death) - b : null;
        const own = age !== null && age >= 0 && age <= 110 && s.at(age) !== null ? T('{e} a vécu {a} ans : {n} sur 100 de sa génération sont allés aussi loin.', {e: cap(he(P)), a: String(age), n: String(s.at(age))}) : '';
        return row('🧮', `${lead} ${own} ${srcLink(LINKS.hmd())}`, srcHmd(t), more(`<ul class="hist-ul tc-ul">${s.ages.map(x => `<li>${esc(T(x.age === 1 ? '1 an : {n} sur 100' : '{a} ans : {n} sur 100', {a: String(x.age), n: String(x.per100)}))}</li>`).join('')}</ul>${s.e0 !== null && s.e0 !== undefined ? `<p>${esc(T('Espérance de vie à la naissance : {e} ans.', {e: s.e0.toLocaleString('fr-FR', {maximumFractionDigits: 1})}))}</p>` : ''}${hyp(T('{k}, {s}. Une table « du moment » suppose que les risques de mourir de cette année-là restent les mêmes toute la vie ; une table « par génération » suit vraiment les enfants nés cette année-là.', {k: kindTxt, s: T({F: 'femmes', M: 'hommes', T: 'ensemble'}[t.sex])}))}`));
    }
    function fecondForPerson(life) {
        const P = life.person; const ts = tables().filter(t => t.db === 'hfd' && t.measure === 'tfr' && t.by === 'year'); if (!ts.length) return '';
        const t = ts.find(x => isFrance(x.country)) || ts[0];
        const marr = (life.events || []).find(e => String(e.tag || '').toUpperCase() === 'MARR' && num(e.year) !== null);
        const cand = [[marr ? num(marr.year) : null, 'marr'], [num(P.birth), 'birth']].filter(([y]) => y !== null && t.years[y] !== undefined);
        if (!cand.length) return '';
        const [y, why] = cand[0], v = t.years[y];
        const lead = T(why === 'marr' ? 'En {y}, l’année de son mariage, une femme avait en moyenne {v} enfants ({c}).' : 'En {y}, l’année de sa naissance, une femme avait en moyenne {v} enfants ({c}).', {y: String(y), v: v.toLocaleString('fr-FR', {maximumFractionDigits: 2}), c: esc(t.country)});
        return row('👶', `${lead} ${srcLink(LINKS.hfd())}`, `${link(LINKS.hfd(), 'Human Fertility Database')} (${esc(T('CC BY 4.0 ; fichier ouvert ici par toi'))})`, hyp(T('Indicateur conjoncturel de fécondité : le nombre d’enfants qu’aurait une femme qui vivrait toute sa vie avec les naissances de cette année-là.')));
    }
    const PERSON_PARTS = ['cholera', 'survie', 'fecondite'];
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const jobs = {cholera: () => choleraForPerson(life), survie: () => survieForPerson(life), fecondite: () => fecondForPerson(life)};
        const html = await Promise.all(want.map(k => Promise.resolve().then(jobs[k]).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tc-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        return A().card(index, T('📊 Sa vie en chiffres'), '', `<div class="tc-block" data-tc-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tc-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tcPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const SRC_IA = `${link('https://archive.org/details/dictionnairego00joanuoft', 'Internet Archive — Joanne, Dictionnaire géographique… de la France (1869)')} (${esc(T('domaine public ; scan de l’Université de Toronto'))})`;
    async function livresHtml(place) {
        const name = String(place.name || '').trim(); if (!name) return '';
        const dep = depOf(place), depName = dep ? (DEPS[dep] || DEPS[Number(dep)] || '') : '';
        const J = await loadJoanne(dep);
        const art = J ? (J.rows || []).find(r => fold(r.n) === fold(name)) : null;
        const items = [
            [LINKS.joanne1869(name), T('Joanne, Dictionnaire géographique (1869) — chercher « {c} » dans le livre', {c: name}), T('Internet Archive, domaine public')],
            [LINKS.joanne1890(), T('Joanne, Dictionnaire géographique et administratif de la France (1890-1905, 7 volumes)'), T('Gallica (BnF) : lecture libre ; réutilisation non commerciale avec la mention « Source gallica.bnf.fr / BnF » — lien seulement')],
            [LINKS.guides(name), T('Guides Joanne et Baedeker : ce qu’en disait le voyageur (recherche dans le texte)'), T('Internet Archive, livres du domaine public')],
            depName ? [LINKS.prefets(depName), T('La statistique du département par son préfet (an IX – an XIII) : {d}', {d: depName}), T('Internet Archive (domaine public)')] : null,
            depName ? [LINKS.prefetsGallica(depName), T('… la même sur Gallica'), T('Gallica (BnF) — lien seulement')] : null,
            [LINKS.chaix(), T('Livret Chaix (horaires des trains, 1869)'), T('Internet Archive')]].filter(Boolean);
        const list = `<ul class="hist-ul tc-ul">${items.map(([u, l, s]) => `<li>${link(u, `${l} ↗`)} <small class="muted">(${esc(s)})</small></li>`).join('')}</ul>`;
        if (art) {
            const page = art.p ? `https://archive.org/details/dictionnairego00joanuoft/page/n${Number(art.p)}/mode/1up` : LINKS.joanne1869(name);
            return row('📖', `${T('Ce qu’en disait Adolphe Joanne en 1869 :')} ${srcLink(page)}`, SRC_IA, `<blockquote class="tc-quote">${esc(art.t)}</blockquote>${hyp(T('Texte lu par OCR sur le scan : quelques lettres peuvent être fausses ; la page du livre fait foi.'))}${more(list, items.length)}`);
        }
        return row('📚', T('{c} dans les livres d’époque : le dictionnaire de Joanne, les guides de voyage, la statistique du préfet.', {c: `<b>${esc(name)}</b>`}), SRC_IA, more(`${list}${hyp(T('Des liens seulement : ces livres sont lus sur le site qui les garde. Le temps de voyage en train entre ses lieux est déjà calculé dans « 🌍 Le monde autour ».'))}`, items.length));
    }
    async function choleraPlaceHtml(place) {
        const dep = depOf(place); if (!dep) return '';
        const D = await loadDeaths().catch(() => null); const r = sgfRow(D, dep); if (!r) return '';
        const list = CHOLERA.map(y => crisis(D, r, y)).filter(Boolean);
        return choleraHtml(D, r, list, null);
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || ['livres', 'cholera']).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => (k === 'livres' ? livresHtml(place) : choleraPlaceHtml(place)).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tc-panel"><h3>${esc(T('📚 La commune dans les livres et les chiffres d’époque'))}</h3><div class="hist-life tc-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tc_place', host: '[data-tc-host]', icon: '📊', label: 'La vie en chiffres et la commune dans les livres d’époque', group: 'Données téléchargées', enabled: () => on('livres') || on('cholera')});
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tc])'); if (!village) return;
        village.dataset.tc = '1';
        if (!on('livres') && !on('cholera')) return;
        const anchor = village.querySelector('[data-l10o-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tc-place" data-tc-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tc-host]'), villagePlace(village)).catch(e => console.error(e));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate(); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    async function monoPlace(place, ctx) {
        let v = null; try { v = ctx?.village ? await ctx.village() : null; } catch (_) {}
        return {...place, insee: place.insee || v?.insee || ''};
    }
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'tc_livres', icon: '📚', label: T('La commune dans les livres d’époque'), group: 'Le lieu', defaultOn: true, enabled: () => on('livres'), source: 'Internet Archive, Gallica (liens) ; Joanne 1869 (domaine public)',
            render: async (place, host, ctx) => { const html = await livresHtml(await monoPlace(place, ctx)); if (!html) return false; host.innerHTML = `<div class="hist-life tc-life">${html}</div>`; return true; }},
        {id: 'tc_cholera', icon: '⚰️', label: T('Les années de choléra dans le département'), group: 'Le lieu', defaultOn: true, enabled: () => on('cholera'), source: 'Insee, Statistique générale de la France (Licence Ouverte 2.0)',
            render: async (place, host, ctx) => { const html = await choleraPlaceHtml(await monoPlace(place, ctx)); if (!html) return false; host.innerHTML = `<div class="hist-life tc-life">${html}</div>`; return true; }});

    /* ─────────── 📋 Listes ─────────── */
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'tc_sgf_deces', icon: '⚰️', label: T('Décès par département et par année (an IX – 1855)'), group: 'Le monde', source: 'Insee, Statistique générale de la France (Licence Ouverte 2.0)', sourceUrl: 'https://www.insee.fr/fr/statistiques/2659665?sommaire=2591397',
            load: async () => {
                const D = await loadDeaths(); if (!D) return [];
                const out = [];
                for (const r of D.rows) D.years.forEach((l, i) => {
                    if (r.v[i] === null || r.v[i] === undefined) return;
                    const y = yearOfLabel(l), c = /^\d{4}$/.test(l) ? crisis(D, r, Number(l)) : null;
                    out.push({dep: r.n, codes: r.deps.join(', '), period: l, year: y, deaths: r.v[i], vs: c ? c.pct : null, table: D.tables?.[l]?.t || '', src: D.url});
                });
                return out;
            },
            fields: [{key: 'dep', label: T('Département'), type: 'enum'}, {key: 'codes', label: T('Codes d’aujourd’hui'), type: 'text'}, {key: 'period', label: T('Année'), type: 'text'}, {key: 'year', label: T('Année (nombre)'), type: 'year'},
                {key: 'deaths', label: T('Décès'), type: 'number'}, {key: 'vs', label: T('Écart aux années voisines (%)'), type: 'number'}, {key: 'table', label: T('Tableau SGF'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], open: r => window.open(r.src, '_blank', 'noopener'), enabled: () => true});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', county: pl.county || '', state: pl.state || '', country: pl.country || ''} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(parts, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        host.innerHTML = '<div></div>';
        const n = await placeInto(host.firstElementChild, pl, {parts, force: true, detached: true});
        if (!n) host.innerHTML = '';
        return !!n;
    }
    const linksHtml = () => `<ul class="hist-ul tc-ul">${[
        [LINKS.menus(), T('Menus anciens de la New York Public Library (« What’s on the menu? »), dont des banquets et restaurants français'), T('licence des données pas vérifiable : lien seulement')],
        [LINKS.manufrance(), T('Catalogues de la Manufacture française d’armes et cycles (Manufrance) : les prix 1900-1914'), T('Gallica : lien seulement')],
        [LINKS.chaixGallica(), T('Livret Chaix : horaires des trains'), T('Gallica : lien seulement')],
        [LINKS.baedeker(), T('Les guides Baedeker de la France'), T('Internet Archive, domaine public')],
        [LINKS.hmd(), T('Human Mortality Database (tables de mortalité depuis 1816)'), T('CC BY 4.0, compte gratuit pour télécharger')],
        [LINKS.hfd(), T('Human Fertility Database (fécondité)'), T('CC BY 4.0, compte gratuit pour télécharger')]].map(([u, l, s]) => `<li>${link(u, `${l} ↗`)} <small class="muted">(${esc(s)})</small></li>`).join('')}</ul>`;
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'tc_p_cholera', icon: '⚰️', label: T('Les années de choléra de sa vie, dans son département'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['cholera'], ctx, host, 'Pas d’année de choléra (1832, 1849, 1854) dans sa vie, ou son département n’est pas connu.')},
        {id: 'tc_p_survie', icon: '🧮', label: T('Ses chances de vivre jusqu’à 20, 60 ans (HMD)'), group: 'La personne', needs: ['person'], installed: () => tables().some(t => t.db === 'hmd'), install: () => openSettings(), run: (ctx, host) => runPerson(['survie'], ctx, host, 'Ouvre d’abord une table de la Human Mortality Database dans Réglages → 📊 La vie en chiffres.')},
        {id: 'tc_p_fecondite', icon: '👶', label: T('Le nombre d’enfants par femme de son temps (HFD)'), group: 'La personne', needs: ['person'], installed: () => tables().some(t => t.db === 'hfd'), install: () => openSettings(), run: (ctx, host) => runPerson(['fecondite'], ctx, host, 'Ouvre d’abord une table de la Human Fertility Database dans Réglages → 📊 La vie en chiffres.')},
        {id: 'tc_livres', icon: '📚', label: T('La commune dans les livres d’époque'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(['livres'], ctx, host)},
        {id: 'tc_cholera_lieu', icon: '⚰️', label: T('Les années de choléra dans le département'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(['cholera'], ctx, host)},
        {id: 'tc_liens', icon: '🔗', label: T('Menus, catalogues, horaires de trains d’époque (liens)'), group: 'Chercher', needs: [], installed: () => true, run: (ctx, host) => { host.innerHTML = linksHtml(); return true; }});

    /* ─────────── ⚙️ Réglages → 📊 La vie en chiffres ─────────── */
    const ABOUT = [ // [sujet, ce qu’on en fait, licence lue, où] — le détail et les citations des licences : docs/telechargements-lot-c.md
        ['Joanne, dictionnaire géographique (1869)', 'fait ici', 'Domaine public', 'village, monographie'],
        ['Joanne, dictionnaire (1890-1905)', 'lien seulement', 'Gallica : réutilisation non commerciale', 'village, monographie'],
        ['Statistiques des préfets (an IX – XIII)', 'lien seulement', 'Domaine public', 'village, monographie'],
        ['Guides Joanne et Baedeker', 'lien seulement', 'Domaine public', 'village, monographie'],
        ['Indicateur Chaix', 'lien seulement', 'Domaine public', 'à la demande'],
        ['Catalogues Manufrance', 'lien seulement', 'Gallica : réutilisation non commerciale', 'à la demande'],
        ['Tarifs postaux', 'déjà dans l’app', 'CC BY-SA 4.0', '✉️ Vie de tous les jours'],
        ['Menus de la NYPL', 'lien seulement', 'pas vérifiable', 'à la demande'],
        ['Livres de cuisine Belle Époque', 'déjà dans l’app', 'Domaine public', '🌍 Monde et coutumes'],
        ['Human Mortality Database', 'fait ici', 'CC BY 4.0 (compte obligatoire)', 'fiche d’une personne'],
        ['Human Fertility Database', 'fait ici', 'CC BY 4.0 (compte obligatoire)', 'fiche d’une personne'],
        ['Taille des conscrits par département', 'rien de plus', 'pas de jeu ouvert trouvé', '—'],
        ['Choléra 1832, 1849, 1854', 'fait ici', 'Licence Ouverte 2.0', 'fiche, village, monographie, Listes'],
        ['Noms de famille 1891-1990', 'déjà dans l’app', 'pas de fichier ouvert', 'lien Géopatronyme'],
        ['Salaires et prix (SGF)', 'déjà dans l’app', 'pas de série ouverte trouvée', 'prix et salaires sourcés'],
        ['Convertisseur franc → euro (Insee)', 'déjà dans l’app', 'Licence Ouverte 2.0', '🪙 Convertisseur d’autrefois']];
    function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings(), ts = tables();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tc-tg="${key}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const tRow = t => `<li>${esc(tableLabel(t))} <button type="button" class="button small secondary" data-tc-del="${esc(tableId(t))}">🗑 ${esc(T('Retirer'))}</button></li>`;
        ws.innerHTML = `<section class="page cplus-settings tc-settings" data-tc-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('La vie en chiffres'), icon: '📊', where: T('Réglages · Données'), help: esc(T('Les années de choléra dans son département, ses chances de vivre jusqu’à 20 ou 60 ans, le nombre d’enfants par femme de son temps, et sa commune dans les livres d’époque.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Tables de mortalité et de fécondité'))}</h3>
                <p class="muted">${esc(T('La Human Mortality Database et la Human Fertility Database sont libres (CC BY 4.0), mais il faut un compte gratuit pour télécharger. Télécharge le fichier texte sur leur site (par exemple « fltper_1x1.txt » ou « FRATNPtfrRR.txt »), puis ouvre-le ici : il est lu sur ton ordinateur, rien n’est envoyé.'))}</p>
                <p>${link(LINKS.hmd(), 'mortality.org — France ↗')} · ${link(LINKS.hfd(), 'humanfertility.org — France ↗')}</p>
                <label class="button small">📂 ${esc(T('Ouvrir un fichier HMD ou HFD'))}<input type="file" accept=".txt,text/plain" multiple hidden data-tc-file></label>
                ${ts.length ? `<ul class="hist-ul tc-ul" data-tc-tables>${ts.map(tRow).join('')}</ul>` : `<p class="muted">${esc(T('Aucune table ouverte.'))}</p>`}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3>
                <p class="muted">${esc(T('Pour chaque idée : ce que l’app avait déjà, la licence lue sur le site officiel (le 2026-11-25), et ce qui en est fait. Le détail : docs/telechargements-lot-c.md.'))}</p>
                <div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Ici'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Où'))}</th></tr></thead><tbody>
                ${ABOUT.map(([a, b, c, d]) => `<tr><td>${esc(T(a))}</td><td>${esc(T(b))}</td><td>${esc(T(c))}</td><td>${esc(T(d))}</td></tr>`).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Rien de personnel ne part sur Internet : les liens s’ouvrent seulement quand tu cliques ; les tables HMD / HFD restent dans ce navigateur.'))}</p></div></section>`;
    }
    document.addEventListener('change', async e => {
        const t = e.target.closest?.('[data-tc-tg]');
        if (t && e.target.matches('input')) {
            const s = settings(), k = t.dataset.tcTg, was = s[k];
            s[k] = e.target.checked; saveSettings(s);
            A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '📊'});
            return;
        }
        if (!e.target.matches?.('[data-tc-file]')) return;
        const files = [...(e.target.files || [])]; let n = 0, bad = 0;
        for (const f of files) {
            const r = addTableText(await f.text());
            if (r.ok) { n += r.added.length; const day = new Date().toISOString().slice(0, 10); saveTables(tables().map(t => (r.added.some(a => tableId(a) === tableId(t)) ? {...t, added: day, file: f.name} : t))); } else bad++;
        }
        drawSettings();
        if (n) A().toast?.(T('{n} table(s) ouverte(s).', {n: String(n)}), 'success');
        if (bad) A().toast?.(T('{n} fichier(s) pas reconnu(s) : il faut un fichier texte de la HMD (table de mortalité 1x1) ou de la HFD (TFR, MAB, CCF).', {n: String(bad)}), 'error');
    });
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tc-del]'); if (!b) return;
        const before = tables(), id = b.dataset.tcDel;
        saveTables(before.filter(t => tableId(t) !== id)); drawSettings();
        A().undoToast?.(T('Table retirée.'), {undo: () => { saveTables(before); drawSettings(); }, icon: '🗑'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'lot10_objets_traces'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'lot10_objets_traces'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '📊 Sa vie en chiffres']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechC = {...core, loadDeaths, loadJoanne, tables, addTableText, personInto, placeInto, livresHtml, choleraPlaceHtml, depOfLife, openSettings};
})(typeof window !== 'undefined' ? window : globalThis);
