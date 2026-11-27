/**
 * LCNDA — 📊 Chiffres d'époque, mots des actes, lieux d'Europe (lot N2, docs/donnees-manquantes.md partie B, n° 11-25 et 28-38).
 * Livré avec l'app (assets/data/tn2-*.json.gz, refaits par scripts/telech-n2/*.py et .github/workflows/telech-n2.yml) :
 *   📚 tn2-sgf-ecole, 👥 tn2-sgf-recensements, 🗺 tn2-sgf-territoire  Statistique générale de la France (Insee, Licence Ouverte 2.0,
 *        « Source : Insee ») : l'école primaire 1829-1897, les recensements 1851-1921, territoire et population 1800-1890, par département
 *   🩺 tn2-maladies, 📜 tn2-formules, 🇨🇭 tn2-heimatort  rédigés pour LCNDA (CC BY-SA 4.0, d'après Littré 1873)
 *   ⏳ tn2-mortalite   ce que disaient les tables de Deparcieux et de Duvillard (phrases du XIXᵉ siècle, Wikisource) — pas de table inventée
 *   ✝️ tn2-ordres (PROLONGE ha-institutions : l'ordre religieux), ⛪ tn2-patrons, ⚔️ tn2-generaux, 🍁 tn2-quebec-paroisses : Wikidata (CC0)
 *   🗺 tn2-cadastres  le catalogue des cadastres napoléoniens ouverts (data.gouv.fr), pas les images ; 🛣 tn2-rues anciens noms des rues
 *   Fabriqués sur GitHub seulement s'ils existent (sinon un lien) : 📖 tn2-expilly/ (Expilly 1762-1770), 🇪🇺 tn2-lau (GISCO),
 *        🇮🇹 tn2-it-variazioni, 🇨🇭 tn2-ch-communes, 🍁 tn2-qc-toponymes, 🇱🇺 tn2-lu-communes (licence relue à chaque fabrication).
 * Ce que ça montre (personne décédée et non confidentielle seulement ; rien pour une fiche vivante) : la cause du décès en mots
 *   d'aujourd'hui, l'école et le recensement de son département à son époque, la paroisse du Québec où chercher, le lieu d'origine
 *   suisse ; pour un lieu : le saint patron et sa fête, les abbayes voisines et leur ordre, les généraux nés ici, le cadastre
 *   napoléonien ouvert, les anciens noms des rues, l'article d'Expilly. Listes (thèmes ✝️ 📚 💶 🗺 ⚔️), Cartes, ⌘K (un mot ancien).
 * Tout est lu sur l'ordinateur : rien ne part sur Internet. Seuls les liens « ↗ » ouvrent une page, sur un clic.
 * localStorage : « genealogie-lot-n2 » (sujets affichés).  window.LCNDA_EXT.lotN2 = {core…, load, personInto, placeInto, openSettings}
 * Essai : tests/test-lot-n2.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    const NOW = new Date().getFullYear();
    const DEATH = ['DEAT', 'BURI', 'CREM'];
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => DEATH.includes(String(e.tag || '').toUpperCase()));
    const past = life => isDead(life) || (num(life?.person?.birth) !== null && life.person.birth < NOW - 110);
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const depOf = ins => { const s = String(ins || '').toUpperCase(); return /^97\d/.test(s) ? s.slice(0, 3) : /^(\d\d|2[AB])/.test(s) ? s.slice(0, 2) : ''; };

    /* ── 🩺 📜 un dictionnaire de mots anciens : trouver ses mots dans un texte (le plus long d'abord, mots entiers) ── */
    function dictIndex(rows) {
        const forms = [];
        for (const r of rows) for (const f of [r.w, ...(r.alt || [])]) { const k = fold(f); if (k.length >= 3) forms.push({k, r}); }
        forms.sort((a, b) => b.k.length - a.k.length);
        return forms;
    }
    function findTerms(text, idx, max = 6) {
        let t = ` ${fold(text)} `; const out = [];
        for (const {k, r} of idx) {
            const i = t.indexOf(` ${k} `); if (i < 0) continue;
            if (!out.includes(r)) out.push(r);
            t = t.slice(0, i) + ' ' + '#'.repeat(k.length) + ' ' + t.slice(i + k.length + 2); // un mot trouvé n'est pas relu par un plus court
            if (out.length >= max) break;
        }
        return out;
    }
    /** chercher un mot (⌘K) : début de mot, puis contient */
    function lookup(q, idx, max = 5) {
        const k = fold(q); if (k.length < 3) return [];
        const a = [], b = [];
        for (const f of idx) { if (f.k === k || f.k.startsWith(k + ' ') || f.k.startsWith(k)) { if (!a.includes(f.r)) a.push(f.r); } else if (k.length >= 4 && f.k.includes(k) && !b.includes(f.r)) b.push(f.r); }
        return [...a, ...b.filter(r => !a.includes(r))].slice(0, max);
    }
    /** la cause de la mort : le texte du décès (cause, description, titre) ; jamais le texte des autres événements */
    function deathText(life) {
        return (life?.events || []).filter(e => DEATH.includes(String(e.tag || '').toUpperCase())).map(e => [e.cause, e.description, e.title].filter(Boolean).join(' ; ')).filter(Boolean).join(' ; ');
    }

    /* ── 📊 la SGF : les colonnes d'un département, une année ── */
    const yearOf = label => { const m = String(label || '').match(/\b(1[6-9]\d\d)\b/g); return m ? Number(m[m.length - 1]) : null; };
    /** les valeurs du département (code d'aujourd'hui) dont l'intitulé suit un motif, l'année la plus proche de `year` (± tol) */
    function sgfPick(meta, dep, pats, year, tol = 8) {
        if (!meta?.tables || !dep) return [];
        const units = new Set((meta.units || []).map((u, i) => (u[1] === 'D' && (u[2] || []).includes(dep) ? i : -1)).filter(i => i >= 0));
        if (!units.size) return [];
        const out = [];
        for (const tb of meta.tables) {
            const rows = (meta.data?.[tb.id] || []).filter(r => units.has(r[0])); if (!rows.length) continue;
            tb.cols.forEach((c, i) => {
                const p = pats.findIndex(rx => rx.test(c)); if (p < 0) return;
                const y = yearOf(c); if (year != null && (y === null || Math.abs(y - year) > tol)) return;
                const v = rows[0][i + 1]; if (v === null || v === undefined || v === '') return;
                out.push({t: tb.id, title: tb.title, file: tb.file, label: c, y, v, p, unit: meta.units[rows[0][0]][0], shared: (meta.units[rows[0][0]][2] || []).length > 1});
            });
        }
        // un motif à la fois, l'année la plus proche d'abord ; une seule valeur par intitulé
        const seen = new Set();
        return out.sort((a, b) => a.p - b.p || (year != null ? Math.abs(a.y - year) - Math.abs(b.y - year) : 0) || (a.y ?? 0) - (b.y ?? 0))
            .filter(x => (seen.has(fold(x.label)) ? false : seen.add(fold(x.label))));
    }
    const CENSUS = [1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921];
    /** l'année de recensement qui le concerne : une année de sa vie (≥ 15 ans) où il vivait, la plus proche du milieu de sa vie */
    function censusYear(life) {
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        const from = b !== null ? b + 15 : null, to = d ?? (b !== null ? b + 80 : null);
        if (from === null || to === null) return null;
        const mid = (from + to) / 2;
        const ok = CENSUS.filter(y => y >= from && y <= to);
        return ok.length ? ok.sort((a, c) => Math.abs(a - mid) - Math.abs(c - mid))[0] : null;
    }
    /** le département de sa vie : son lieu de naissance, sinon le premier lieu de France */
    function lifeDep(life) {
        const ev = life?.events || [];
        const e = ev.find(x => ['BIRT', 'BAPM', 'CHR'].includes(String(x.tag || '').toUpperCase()) && depOf(x.insee)) || ev.find(x => depOf(x.insee));
        return e ? {dep: depOf(e.insee), place: e.place || ''} : null;
    }

    /* ── 🍁 le Québec ── */
    const inQuebec = p => okLL(p) && p.lat >= 44.99 && p.lat <= 62.6 && p.lon >= -79.8 && p.lon <= -57.1 && !(p.lon > -66.5 && p.lat < 48) && !(p.lon < -74.4 && p.lat < 45.6);
    /** les paroisses ouvertes avant l'événement, à moins de `radius` km, les plus proches d'abord */
    function parishesFor(rows, e, radius = 25) {
        if (!inQuebec(e)) return [];
        const y = num(e.year);
        return rows.filter(r => okLL(r)).map(r => ({r, km: km(e.lat, e.lon, r.lat, r.lon)})).filter(x => x.km <= radius && (y === null || x.r.y === null || x.r.y <= y))
            .sort((a, b) => a.km - b.km).slice(0, 8);
    }
    const isSwiss = e => /^(suisse|switzerland|schweiz|svizzera|ch)$/i.test(String(e?.country || '').trim());

    /* ── 🏘 un lieu ── */
    const nearRows = (rows, lat, lon, radius) => rows.filter(okLL).map(r => ({r, km: km(lat, lon, r.lat, r.lon)})).filter(x => x.km <= radius).sort((a, b) => a.km - b.km);
    const ofCommune = (rows, ins) => (ins ? rows.filter(r => r.ins === ins) : []);
    /** les cadastres ouverts qui couvrent la commune : la ville d'abord, puis le département */
    const cadastresFor = (rows, ins) => { const d = depOf(ins); return rows.filter(r => r.ins === ins).concat(rows.filter(r => r.ins !== ins && !r.ins && (r.deps || []).includes(d))); };
    const ruesFor = (meta, ins) => ((meta?.cities || []).find(c => c.insee && c.insee === ins) || null);
    /** le volume d'Expilly qui couvre un nom (A-B, C-E…) ; après S : aucun (le dictionnaire s'arrête à S) */
    const EXPILLY = [['bub_gb_OPA2c3XRzxAC', 1, 'A', 'B'], ['bub_gb_EVk_AAAAcAAJ', 2, 'C', 'E'], ['bub_gb_LlpEAAAAcAAJ', 3, 'F', 'K'], ['bub_gb_UFpEAAAAcAAJ', 4, 'L', 'M'], ['bub_gb_T1Q_AAAAcAAJ', 5, 'N', 'Q'], ['bub_gb_U6xl_qMmSWgC', 6, 'R', 'S']];
    function expillyVolume(name) {
        const c = fold(name).toUpperCase()[0]; if (!c) return null;
        return EXPILLY.find(v => c >= v[2] && c <= v[3]) || null;
    }

    const core = {num, fold, table, km, isDead, past, safeUrl, depOf, dictIndex, findTerms, lookup, deathText, yearOf, sgfPick, censusYear, lifeDep, CENSUS, inQuebec, parishesFor, isSwiss,
        nearRows, ofCommune, cadastresFor, ruesFor, expillyVolume, EXPILLY};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-lot-n2';
    const TAB = ['lot_n2', '25tn2', '📊 Chiffres d’époque et mots des actes'];
    const BLOCK = 'lot_n2';
    const PARTS = [
        ['deces', '🩺 La cause du décès en mots d’aujourd’hui', '« Fièvre putride », « mal caduc », « suites de couches » : ce que voulait dire la cause écrite dans l’acte (environ 170 mots).'],
        ['ecole', '📚 L’école de son enfance', 'Dans son département, quand il avait de 6 à 13 ans : élèves inscrits, écoles (Statistique générale de la France, 1829-1897).'],
        ['recensement', '👥 Son département au recensement', 'Le recensement le plus proche du milieu de sa vie (1851-1921) : population, étrangers, et tout le tableau en dessous.'],
        ['ailleurs', '🍁 🇨🇭 Où chercher hors de France', 'La paroisse ouverte à l’époque, au Québec ; le lieu d’origine (Heimatort), en Suisse.'],
        ['mortalite', '⏳ Les tables de mortalité anciennes', 'Ce que disaient Deparcieux (1746) et Duvillard (1806), pour une personne née avant 1850.'],
        ['patron', '⛪ Le saint patron et sa fête', 'L’église du village, son saint patron et le jour de sa fête (Wikidata).'],
        ['ordres', '✝️ Les abbayes et couvents voisins', 'Leur ordre religieux (bénédictins, cisterciens, ursulines…), leur fondation et leur suppression.'],
        ['generaux', '⚔️ Les généraux nés ici', 'Généraux, maréchaux et amiraux de la Révolution et de l’Empire nés dans la commune.'],
        ['cadastre', '🗺 Le cadastre napoléonien ouvert', 'Quand un département ou une ville publie ses plans anciens en données ouvertes.'],
        ['rues', '🛣 Les anciens noms des rues', 'Hors de Paris (Boulogne-Billancourt pour l’instant ; Paris est dans la boussole des rues).'],
        ['expilly', '📖 Expilly (1762-1770)', 'L’article de la paroisse dans le dictionnaire d’Expilly, ou le volume où le chercher.'],
        ['chiffres', '📊 Le département en chiffres (1801-1836)', 'Superficie et population d’autrefois (Statistique générale de la France).']];
    const PERSON_PARTS = ['deces', 'ecole', 'recensement', 'ailleurs', 'mortalite'];
    const PLACE_PARTS = ['patron', 'ordres', 'generaux', 'cadastre', 'rues', 'expilly', 'chiffres', 'ailleurs'];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), km: 10, ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => (typeof n === 'number' ? n.toLocaleString('fr-FR') : String(n ?? ''));
    const kmTxt = k => (k < 1.5 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="ln2-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row ln2-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="ln2-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (/^Q\d+$/.test(String(q || '')) ? `https://www.wikidata.org/wiki/${q}` : '');
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (CC0)`,
        insee: (u, what) => `${link(u || 'https://www.insee.fr/fr/information/2008466', what || 'Insee')} — ${esc(T('Source : Insee'))} (${link('https://www.insee.fr/fr/information/2008466', T('Licence Ouverte 2.0'))})`,
        bysa: () => `${esc(T('rédigé pour LCNDA, d’après Littré (1873)'))} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')})`,
        meta: m => (m ? `${link(m.url, m.source || '')}${m.licence ? ` (${link(m.licence_url, m.licence)})` : ''}` : '')};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {maladies: 'tn2-maladies', formules: 'tn2-formules', heimatort: 'tn2-heimatort', mortalite: 'tn2-mortalite', ecole: 'tn2-sgf-ecole', recensements: 'tn2-sgf-recensements',
        territoire: 'tn2-sgf-territoire', ordres: 'tn2-ordres', patrons: 'tn2-patrons', generaux: 'tn2-generaux', quebec: 'tn2-quebec-paroisses', cadastres: 'tn2-cadastres', rues: 'tn2-rues',
        expillyIndex: 'tn2-expilly/index', lau: 'tn2-lau', it: 'tn2-it-variazioni', ch: 'tn2-ch-communes', qc: 'tn2-qc-toponymes', lu: 'tn2-lu-communes'};
    const SGF = new Set(['ecole', 'recensements', 'territoire']);
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const shape = {
        maladies: f => table(f).map(r => ({...r, alt: r.alt || []})), formules: f => table(f).map(r => ({...r, alt: r.alt || []})),
        heimatort: f => f.rows || [], mortalite: f => f.quotes || [], rues: f => f.rows || [], expillyIndex: f => f.rows || []};
    function fetchPack(name) {
        return fetch(`assets/data/${name}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: name})); return readMaybeGz(r); });
    }
    function load(kind) {
        if (!FILES[kind]) return Promise.resolve(null);
        if (!data[kind]) data[kind] = fetchPack(FILES[kind]).then(f => (f ? {meta: f, rows: SGF.has(kind) ? [] : (shape[kind] || table)(f)} : null)).catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: null, rows: []});
    const idxMemo = {};
    const dictOf = kind => (idxMemo[kind] ||= rowsOf(kind).then(D => ({D, idx: dictIndex(D.rows)})));
    const expDep = {};
    const expillyOf = dep => (expDep[dep] ||= quiet(fetchPack(`tn2-expilly/${dep}`)).then(f => (f ? table(f) : [])));
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const He = P => (P?.gender === 'female' ? T('Elle') : T('Il'));

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const termLi = (r, kinds) => `<li><b>${esc(r.w)}</b>${r.alt?.length ? ` <small class="muted">(${esc(r.alt.slice(0, 4).join(', '))})</small>` : ''} : ${esc(T(r.m))}${kinds?.[r.k] ? ` <small class="muted">· ${esc(T(kinds[r.k]))}</small>` : ''}${r.tip ? `<br><small class="muted">💡 ${esc(T(r.tip))}</small>` : ''}</li>`;
    const sgfLi = x => `<li>${esc(x.label)} : <b>${esc(nf(x.v))}</b> <small class="muted">(${esc(x.unit)}${x.shared ? ` · ${T('département d’alors')}` : ''})</small> ${srcLink(x.file)}</li>`;
    const JOBS = {
        deces: async life => {
            const txt = deathText(life); if (!txt) return '';
            const {D, idx} = await dictOf('maladies'); const hits = findTerms(txt, idx); if (!hits.length) return '';
            const h = hits[0];
            const lead = T('« {w} » : {m}.', {w: esc(h.w), m: esc(T(h.m))});
            return row('🩺', lead, LIC.bysa(), `${more(hits.length > 1 ? `<ul class="hist-ul ln2-ul">${hits.slice(1).map(r => termLi(r, D.meta?.kinds)).join('')}</ul>` : '', hits.length - 1)}${hyp(T('Le sens le plus fréquent du mot ancien : ce n’est pas un diagnostic.'))}`);
        },
        ecole: async life => {
            const b = num(life?.person?.birth), L = lifeDep(life); if (b === null || !L || b + 13 < 1829 || b + 6 > 1897) return '';
            const D = await rowsOf('ecole'); if (!D.meta) return '';
            const y = Math.min(1897, Math.max(1829, b + 9));
            const picks = sgfPick(D.meta, L.dep, [/^Nombre total d.élèves inscrits dans les écoles de toute nature/i, /^Nombre total des élèves reçus dans les écoles publiques/i, /élèves|écoles/i], y, 6);
            const sign = sgfPick(D.meta, L.dep, [/^Nombre des conjoints, sur 100, ayant sign/i], null).filter(x => x.y !== null && x.y >= 1786);
            if (!picks.length && !sign.length) return '';
            const x = picks[0] || sign[0];
            const lead = picks[0] ? T('Quand {he} avait 6 à 13 ans ({a}-{z}), dans son département ({d}) : {l}, {v}.', {he: He(life.person).toLowerCase(), a: String(b + 6), z: String(b + 13), d: esc(x.unit), l: esc(x.label), v: `<b>${esc(nf(x.v))}</b>`})
                : T('Dans son département ({d}) : {l}, {v}.', {d: esc(x.unit), l: esc(x.label), v: `<b>${esc(nf(x.v))}</b>`});
            const rest = [...picks.slice(1, 25), ...sign];
            return row('📚', `${lead} ${srcLink(x.file)}`, LIC.insee(D.meta.url, T('Enseignement primaire, 1829-1897')), more(rest.length ? `<ul class="hist-ul ln2-ul">${rest.map(sgfLi).join('')}</ul>` : '', rest.length));
        },
        recensement: async life => {
            const y = censusYear(life), L = lifeDep(life); if (y === null || !L) return '';
            const D = await rowsOf('recensements'); if (!D.meta) return '';
            const main = sgfPick(D.meta, L.dep, [/^Population totale du département|^Total général de la population, total|^Population totale, |^Population municipale totale|^Population présente totale.*total, \d{4}$/i, /^Étrangers, total|^Total des autres étrangers|^Étrangers.*total/i], y, 0);
            const all = sgfPick(D.meta, L.dep, [/./], y, 0);
            if (!main.length && !all.length) return '';
            const x = main[0] || all[0];
            const lead = T('Au recensement de {y}, son département ({d}) : {l}, {v}.', {y: String(y), d: esc(x.unit), l: esc(x.label), v: `<b>${esc(nf(x.v))}</b>`});
            const rest = [...main.slice(1), ...all.filter(a => !main.includes(a))].slice(0, 80);
            return row('👥', `${lead} ${srcLink(x.file)}`, LIC.insee(D.meta.url, T('Recensements de 1851 à 1921')), more(rest.length ? `<ul class="hist-ul ln2-ul">${rest.map(sgfLi).join('')}</ul>${hyp(T('Les intitulés sont ceux des tableaux de l’Insee, recopiés tels quels.'))}` : '', rest.length));
        },
        ailleurs: async life => {
            const out = [], ev = life?.events || [];
            const qc = ev.filter(e => inQuebec(e) && (num(e.year) === null || e.year < 1900));
            if (qc.length) {
                const Q = await rowsOf('quebec');
                const e = qc[0], list = parishesFor(Q.rows, e);
                if (list.length) {
                    const p = list[0];
                    out.push(row('🍁', `${esc(T('{p} ({y}) : la paroisse ouverte la plus proche était {n}{o}, à {k}.', {p: e.place || '', y: String(e.year ?? '?'), n: p.r.n, o: p.r.y ? ` (${T('ouverte en {y}', {y: String(p.r.y)})})` : '', k: kmTxt(p.km)}))} ${srcLink(wd(p.r.q))}`, LIC.wd(),
                        `${more(list.length > 1 ? `<ul class="hist-ul ln2-ul">${list.slice(1).map(x => `<li>${link(x.r.fr || wd(x.r.q), x.r.n)} <small class="muted">(${esc([x.r.y ? T('ouverte en {y}', {y: String(x.r.y)}) : T('date inconnue'), x.r.s, kmTxt(x.km)].filter(Boolean).join(' · '))})</small></li>`).join('')}</ul>` : '', list.length - 1)}${hyp(T('Avant 1900, l’acte se trouve dans la paroisse déjà ouverte à la date de l’événement.'))}`));
                }
            }
            if (ev.some(isSwiss)) {
                const H = await rowsOf('heimatort');
                if (H.meta) out.push(row('🇨🇭', esc(T(H.meta.paras[0])), LIC.bysa(), more(`${H.meta.paras.slice(1).map(p => `<p>${esc(T(p))}</p>`).join('')}<p class="ln2-links">${H.rows.map(l => link(l[1], `↗ ${T(l[0])}`)).join(' · ')}</p>`, 0)));
            }
            return out.join('');
        },
        mortalite: async life => {
            const b = num(life?.person?.birth); if (b === null || b >= 1850 || b < 1700) return '';
            const M = await rowsOf('mortalite'); if (!M.rows.length) return '';
            const q = M.rows[0];
            return row('⏳', `${esc(T('Né vers {y}, à une époque où, d’après les tables de mortalité :', {y: String(b)}))} <q class="ln2-quote">${esc(q.q)}</q> ${srcLink(q.url)}`, LIC.meta(M.meta),
                more(`<ul class="hist-ul ln2-ul">${M.rows.slice(1).map(x => `<li><q class="ln2-quote">${esc(x.q)}</q> <small class="muted">— ${esc(x.from)}</small> ${srcLink(x.url)}</li>`).join('')}</ul>${(M.meta.tables || []).map(t => `<p class="ln2-links">${link(t.url, `↗ ${t.n}`)} <small class="muted">(${esc(t.pop)})</small></p>`).join('')}${hyp(T(M.meta.note || ''))}`, M.rows.length - 1));
        }};
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const priv = !!opts.private || life.person?.living_status === 'living' || Number(life.person?.is_private) === 1;
        if (priv || !past(life)) { host.innerHTML = ''; return 0; }   // personne décédée (ou d'il y a plus de 110 ans) et non confidentielle seulement
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life ln2-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        if (p.living_status === 'living' || Number(p.is_private) === 1) return '';
        return A().card(index, T('📊 Son époque en chiffres et en mots'), '', `<div class="ln2-block" data-ln2-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-ln2-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.ln2Person));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const radius = () => { const k = Number(settings().km); return k >= 1 && k <= 50 ? k : 10; };
    async function placePart(kind, place) {
        const ins = String(place.insee || place.ins || ''), ll = placeLL(place), name = place.name || '';
        if (kind === 'patron') {
            const P = await rowsOf('patrons'); let list = ofCommune(P.rows, ins);
            if (!list.length && ll && !ins) list = nearRows(P.rows, ll.lat, ll.lon, 1).map(x => x.r);
            if (!list.length) return '';
            const p = list.find(r => /^(église|eglise)/i.test(r.n)) || list[0];
            const saints = (p.s || []).map(s => s[1]).join(', ');
            const lead = p.feast ? T('{e} : {s}, fêté le {f}. La fête patronale du village se tenait ce jour-là ou le dimanche le plus proche.', {e: `<b>${esc(p.n)}</b>`, s: esc(saints), f: esc(p.feast)})
                : T('{e} : {s}.', {e: `<b>${esc(p.n)}</b>`, s: esc(saints)});
            return row('⛪', `${lead} ${srcLink(wd(p.q))}`, LIC.wd(), `${more(list.length > 1 ? `<ul class="hist-ul ln2-ul">${list.filter(r => r !== p).slice(0, 20).map(r => `<li>${link(wd(r.q), r.n)} : ${esc((r.s || []).map(s => s[1]).join(', '))}${r.feast ? ` <small class="muted">(${esc(T('fête le {f}', {f: r.feast}))})</small>` : ''}</li>`).join('')}</ul>` : '', list.length - 1)}${hyp(T(P.meta?.note || ''))}`);
        }
        if (kind === 'ordres') {
            if (!ll) return ''; const O = await rowsOf('ordres'); const hits = nearRows(O.rows, ll.lat, ll.lon, radius()); if (!hits.length) return '';
            const x = hits[0], o = (x.r.o || []).map(z => z[1]).join(', ');
            const dates = [x.r.from ? T('fondée en {y}', {y: String(x.r.from)}) : '', x.r.to ? T('supprimée en {y}', {y: String(x.r.to)}) : ''].filter(Boolean).join(', ');
            const lead = T('{n} ({k}) : {o}{d}.', {n: `<b>${esc(x.r.n)}</b>`, k: esc(kmTxt(x.km)), o: esc(o), d: dates ? ` — ${esc(dates)}` : ''});
            return row('✝️', `${lead} ${srcLink(x.r.fr || wd(x.r.q))}`, LIC.wd(), more(hits.length > 1 ? `<ul class="hist-ul ln2-ul">${hits.slice(1, 30).map(h => `<li>${link(h.r.fr || wd(h.r.q), h.r.n)} <small class="muted">(${esc([(h.r.o || []).map(z => z[1]).join(', '), h.r.from ? `${h.r.from}${h.r.to ? `–${h.r.to}` : ''}` : '', kmTxt(h.km)].filter(Boolean).join(' · '))})</small></li>`).join('')}</ul>` : '', hits.length - 1));
        }
        if (kind === 'generaux') {
            const G = await rowsOf('generaux'); const list = ofCommune(G.rows, ins); if (!list.length) return '';
            const g = list[0];
            const lead = list.length > 1 ? T('{n} généraux de la Révolution et de l’Empire sont nés ici, dont {g}.', {n: String(list.length), g: `<b>${esc(g.n)}</b> (${esc([g.b, g.d].filter(Boolean).join('–'))})`})
                : T('Un général de la Révolution et de l’Empire est né ici : {g}.', {g: `<b>${esc(g.n)}</b> (${esc([g.b, g.d].filter(Boolean).join('–'))}, ${esc((g.r || []).join(', '))})`});
            return row('⚔️', `${lead} ${srcLink(g.fr || wd(g.q))}`, LIC.wd(), more(list.length > 1 ? `<ul class="hist-ul ln2-ul">${list.slice(1, 40).map(r => `<li>${link(r.fr || wd(r.q), r.n)} <small class="muted">(${esc([[r.b, r.d].filter(Boolean).join('–'), (r.r || []).join(', '), r.dp ? T('mort à {p}', {p: r.dp}) : ''].filter(Boolean).join(' · '))})</small></li>`).join('')}</ul>` : '', list.length - 1));
        }
        if (kind === 'cadastre') {
            if (!ins) return ''; const C = await rowsOf('cadastres'); const list = cadastresFor(C.rows, ins); if (!list.length) return '';
            const c = list[0];
            const res = r => (r.res || []).slice(0, 6).map(x => link(x[2], `↗ ${x[0] || x[1]}${x[1] ? ` (${x[1]})` : ''}`)).join(' · ');
            return row('🗺', `${esc(T('Le cadastre napoléonien de {z} est publié en données ouvertes : {n} ({o}).', {z: c.zone || c.org, n: c.n, o: c.org}))} ${srcLink(c.url)}`, `${link(c.url, 'data.gouv.fr')} (${link(c.licence_url, c.licence)})`,
                `<p class="ln2-links">${res(c)}</p>${more(list.length > 1 ? `<ul class="hist-ul ln2-ul">${list.slice(1).map(r => `<li>${link(r.url, r.n)} <small class="muted">(${esc([r.org, r.licence].join(' · '))})</small><br>${res(r)}</li>`).join('')}</ul>` : '', list.length - 1)}${hyp(T('Les images ne sont pas copiées dans l’app : un plan géoréférencé (WMS) peut être posé dans 🗺 Cartes anciennes.'))}`);
        }
        if (kind === 'rues') {
            if (!ins) return ''; const R = await rowsOf('rues'); const c = ruesFor(R.meta, ins); if (!c?.streets?.length) return '';
            const s = c.streets[0];
            return row('🛣', `${esc(T('{n} anciens noms de rues connus à {c}, par exemple « {o} », devenue « {w} ».', {n: String(c.streets.length), c: c.city, o: s.old, w: s.new}))} ${srcLink(c.url)}`, `${link(c.url, c.city)} (${link(c.licence_url, c.licence)})`,
                more(`<ul class="hist-ul ln2-ul">${c.streets.slice(1, 200).map(x => `<li>${esc(x.old)} → <b>${esc(x.new)}</b>${x.date ? ` <small class="muted">(${esc(x.date)})</small>` : ''}</li>`).join('')}</ul>`, c.streets.length - 1));
        }
        if (kind === 'expilly') {
            if (!name || (ins && !depOf(ins))) return '';
            const dep = depOf(ins);
            const list = dep ? await expillyOf(dep) : [];
            const a = list.find(r => r.ins === ins);
            if (a) return row('📖', `${esc(T('Expilly, vers 1762-1770 :'))} <q class="ln2-quote">${esc(a.t.slice(0, 420))}${a.t.length > 420 ? '…' : ''}</q> ${srcLink(`https://archive.org/details/${a.id}`)}`, `${link(`https://archive.org/details/${a.id}`, 'Internet Archive')} (${esc(T('domaine public'))})`,
                `${more(a.t.length > 420 ? `<p class="ln2-long">${esc(a.t)}</p>` : '', 0)}${hyp(T('Texte lu par la machine (OCR) et copié tel quel : des lettres peuvent être fausses (« f » pour le « s » long).'))}`);
            const v = expillyVolume(name); if (!v || !dep) return '';
            const u = `https://archive.org/details/${v[0]}?q=${encodeURIComponent(String(name).toUpperCase())}`;
            return row('📖', `${esc(T('Expilly (1762-1770) décrit chaque paroisse : {n} est dans le volume {v} ({a}-{b}).', {n: name, v: String(v[1]), a: v[2], b: v[3]}))} ${link(u, T('↗ chercher dans le livre'))}`, `${link('https://archive.org/details/' + v[0], 'Internet Archive')} (${esc(T('domaine public'))})`);
        }
        if (kind === 'chiffres') {
            const d = depOf(ins); if (!d) return '';
            const D = await rowsOf('territoire'); if (!D.meta) return '';
            const picks = sgfPick(D.meta, d, [/^Population totale.*(18[0-3]\d)/i, /^(Superficie|Étendue \(en hectares\))/i], null);
            if (!picks.length) return '';
            const pop = picks.filter(x => /^Population totale/i.test(x.label)).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
            const x = pop[0] || picks[0], z = pop.at(-1);
            const lead = pop.length > 1 ? T('Le département ({d}) avait {a} habitants en {ya} et {b} en {yb}.', {d: esc(x.unit), a: `<b>${esc(nf(x.v))}</b>`, ya: String(x.y), b: `<b>${esc(nf(z.v))}</b>`, yb: String(z.y)})
                : T('Le département ({d}) : {l}, {v}.', {d: esc(x.unit), l: esc(x.label), v: `<b>${esc(nf(x.v))}</b>`});
            return row('📊', `${lead} ${srcLink(x.file)}`, LIC.insee(D.meta.url, T('Territoire et population, 1800-1890')), more(`<ul class="hist-ul ln2-ul">${picks.filter(p => p !== x && p !== z).slice(0, 40).map(sgfLi).join('')}</ul>`, Math.max(0, picks.length - 2)));
        }
        if (kind === 'ailleurs') {
            if (!ll || !inQuebec(ll)) return '';
            const Q = await rowsOf('quebec'); const hits = nearRows(Q.rows, ll.lat, ll.lon, 20).slice(0, 12); if (!hits.length) return '';
            return row('🍁', `${esc(T('Paroisses et églises catholiques tout près, avec leur date d’ouverture :'))}`, LIC.wd(), `<ul class="hist-ul ln2-ul">${hits.map(x => `<li>${link(x.r.fr || wd(x.r.q), x.r.n)} <small class="muted">(${esc([x.r.y ? T('ouverte en {y}', {y: String(x.r.y)}) : T('date inconnue'), kmTxt(x.km)].join(' · '))})</small></li>`).join('')}</ul>`);
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_PARTS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel ln2-panel"><h3>${esc(T('📊 Le lieu autrefois : saints, abbayes, cadastre, chiffres'))}</h3><div class="hist-life ln2-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'ln2_place', host: '[data-ln2-host]', icon: '📊', label: 'Le lieu autrefois (saints, abbayes, cadastre, chiffres)', group: 'Données téléchargées', enabled: () => PLACE_PARTS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-ln2])'); if (!village) return;
        village.dataset.ln2 = '1';
        if (!PLACE_PARTS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-tsx-host]') || village.querySelector('[data-ti-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="ln2-place" data-ln2-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-ln2-host]'), villagePlace(village));
    }
    let pending = 0;
    if (root.MutationObserver && root.document) new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['patron', 'ln2_patron', '⛪', 'Le saint patron et la fête du village'], ['ordres', 'ln2_ordres', '✝️', 'Les abbayes et couvents voisins'], ['generaux', 'ln2_generaux', '⚔️', 'Les généraux nés ici'],
        ['cadastre', 'ln2_cadastre', '🗺', 'Le cadastre napoléonien ouvert'], ['expilly', 'ln2_expilly', '📖', 'La paroisse dans Expilly (1762-1770)'], ['chiffres', 'ln2_chiffres', '📊', 'Le département en chiffres (1801-1836)']];
    const SRC_TXT = {patron: 'Wikidata (CC0)', ordres: 'Wikidata (CC0)', generaux: 'Wikidata (CC0)', cadastre: 'data.gouv.fr (licence de chaque jeu)', expilly: 'Internet Archive (domaine public)', chiffres: 'Insee, SGF (Licence Ouverte 2.0)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life ln2-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    const openSrc = r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); };
    const L = (id, pack, icon, label, theme, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), theme, group: extra.group || 'Le monde', source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: openSrc, ...extra});
    async function sgfTableRows(kind) {
        const D = await rowsOf(kind); if (!D.meta) return [];
        return D.meta.tables.map(t => ({id: t.id, title: t.title, year: yearOf(t.title), cols: t.cols.length, rows: (D.meta.data[t.id] || []).length, sources: (t.src || []).join(' ; '), src: t.file}));
    }
    const sgfFields = [F('title', 'Tableau'), F('year', 'Année', 'year'), F('cols', 'Colonnes', 'number'), F('rows', 'Lignes', 'number'), F('sources', 'Sources imprimées'), F('src', 'Fichier de l’Insee', 'url')];
    (ext.dataLists = ext.dataLists || []).push(
        L('ln2_maladies', 'tn2-maladies', '🩺', 'Maladies et causes de mort d’autrefois', 'croire', 'Rédigé pour LCNDA (CC BY-SA 4.0), d’après Littré 1873', 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'toujours',
            async () => { const D = await rowsOf('maladies'); return D.rows.map(r => ({word: r.w, alt: (r.alt || []).join(', '), meaning: T(r.m), kind: T(D.meta?.kinds?.[r.k] || r.k)})); },
            [F('word', 'Mot ancien'), F('alt', 'Autres formes'), F('meaning', 'En mots d’aujourd’hui'), F('kind', 'Sorte', 'enum')], {chips: 'kind', group: 'La personne'}),
        L('ln2_formules', 'tn2-formules', '📜', 'Formules des actes en français ancien', 'livres', 'Rédigé pour LCNDA (CC BY-SA 4.0), d’après Littré 1873', 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'toujours',
            async () => { const D = await rowsOf('formules'); return D.rows.map(r => ({word: r.w, alt: (r.alt || []).join(', '), meaning: T(r.m), kind: T(D.meta?.kinds?.[r.k] || r.k), tip: T(r.tip || '')})); },
            [F('word', 'Formule'), F('alt', 'Autres formes'), F('meaning', 'Ce que ça veut dire'), F('kind', 'Sorte', 'enum'), F('tip', 'Pour la recherche')], {chips: 'kind', group: 'La personne'}),
        L('ln2_ordres', 'tn2-ordres', '✝️', 'Abbayes et couvents : leur ordre religieux', 'croire', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Property:P611', 'ordres',
            async () => (await rowsOf('ordres')).rows.map(r => ({name: r.n, order: (r.o || []).map(o => o[1]).join(', '), from: r.from, to: r.to, commune: r.commune, country: r.country, lat: r.lat, lon: r.lon, src: r.fr || wd(r.q)})),
            [F('name', 'Abbaye, couvent'), F('order', 'Ordre', 'enum'), F('from', 'Fondation', 'year'), F('to', 'Suppression', 'year'), F('commune', 'Commune', 'place'), F('country', 'Pays', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.from, r.to ?? r.from], geo: r => [r.lat, r.lon], group: 'Le lieu'}),
        L('ln2_patrons', 'tn2-patrons', '⛪', 'Églises et leur saint patron (fête patronale)', 'croire', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Property:P825', 'patron',
            async () => (await rowsOf('patrons')).rows.map(r => ({name: r.n, saint: (r.s || []).map(s => s[1]).join(', '), feast: r.feast, commune: r.commune, ins: r.ins, lat: r.lat, lon: r.lon, src: wd(r.q)})),
            [F('name', 'Église'), F('saint', 'Saint patron'), F('feast', 'Fête'), F('commune', 'Commune', 'place'), F('src', 'Source', 'url')], {geo: r => [r.lat, r.lon], group: 'Le lieu'}),
        L('ln2_generaux', 'tn2-generaux', '⚔️', 'Généraux de la Révolution et de l’Empire, par commune de naissance', 'guerres', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q152956', 'generaux',
            async () => (await rowsOf('generaux')).rows.map(r => ({name: r.n, born: r.b, died: r.d, rank: (r.r || []).join(', '), commune: r.commune, lat: r.lat, lon: r.lon, src: r.fr || wd(r.q)})),
            [F('name', 'Nom', 'text', {person: true}), F('born', 'Naissance', 'year'), F('died', 'Mort', 'year'), F('rank', 'Grade', 'enum'), F('commune', 'Né à', 'place'), F('src', 'Source', 'url')],
            {period: r => [r.born, r.died ?? r.born], geo: r => [r.lat, r.lon], personMatch: {born: r => r.born, died: r => r.died, historic: true}}),
        L('ln2_quebec', 'tn2-quebec-paroisses', '🍁', 'Québec : paroisses et églises catholiques, date d’ouverture', 'croire', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q16970', 'ailleurs',
            async () => (await rowsOf('quebec')).rows.map(r => ({name: r.n, year: r.y, saint: r.s, where: r.where, lat: r.lat, lon: r.lon, src: r.fr || wd(r.q)})),
            [F('name', 'Paroisse, église'), F('year', 'Ouverte en', 'year'), F('saint', 'Saint patron'), F('where', 'Où', 'place'), F('src', 'Source', 'url')], {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], group: 'Le lieu'}),
        L('ln2_cadastres', 'tn2-cadastres', '🗺', 'Cadastres napoléoniens en données ouvertes', 'lieux', 'data.gouv.fr (licence de chaque jeu)', 'https://www.data.gouv.fr/datasets/?q=cadastre%20napol%C3%A9onien', 'cadastre',
            async () => (await rowsOf('cadastres')).rows.map(r => ({name: r.n, org: r.org, zone: r.zone, kind: r.kind, licence: r.licence, files: (r.res || []).map(x => x[1]).filter(Boolean).join(', '), date: r.upd, src: r.url})),
            [F('name', 'Jeu de données'), F('org', 'Publié par'), F('zone', 'Où', 'place'), F('kind', 'Contenu', 'enum'), F('licence', 'Licence', 'enum'), F('files', 'Fichiers'), F('date', 'Mis à jour', 'date'), F('src', 'Lien', 'url')], {group: 'Le lieu'}),
        L('ln2_rues', 'tn2-rues', '🛣', 'Anciens noms des rues (hors de Paris)', 'lieux', 'data.gouv.fr (Licence Ouverte)', 'https://www.data.gouv.fr/datasets/historique-des-denominations-des-voies-de-boulogne-billancourt', 'rues',
            async () => { const D = await rowsOf('rues'); return (D.meta?.cities || []).flatMap(c => c.streets.map(s => ({old: s.old, now: s.new, date: s.date, note: s.note, city: c.city, src: c.url}))); },
            [F('old', 'Ancien nom'), F('now', 'Nom actuel'), F('date', 'Date'), F('city', 'Ville', 'place'), F('note', 'Note'), F('src', 'Source', 'url')], {group: 'Le lieu'}),
        L('ln2_sgf_ecole', 'tn2-sgf-ecole', '📚', 'Enseignement primaire 1829-1897 (SGF) : les tableaux', 'prix', 'Insee — Source : Insee (Licence Ouverte 2.0)', 'https://www.insee.fr/fr/statistiques/2659830', 'ecole', () => sgfTableRows('ecole'), sgfFields),
        L('ln2_sgf_rec', 'tn2-sgf-recensements', '👥', 'Recensements de 1851 à 1921 (SGF) : les tableaux', 'prix', 'Insee — Source : Insee (Licence Ouverte 2.0)', 'https://www.insee.fr/fr/statistiques/2653233', 'recensement', () => sgfTableRows('recensements'), sgfFields),
        L('ln2_sgf_terr', 'tn2-sgf-territoire', '🗺', 'Territoire et population 1800-1890 (SGF) : les tableaux', 'prix', 'Insee — Source : Insee (Licence Ouverte 2.0)', 'https://www.insee.fr/fr/statistiques/2591293', 'chiffres', () => sgfTableRows('territoire'), sgfFields));

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const LAYER_ON = {ordres: 'ordres', patrons: 'patron', generaux: 'generaux', quebec: 'ailleurs'};
    const layer = (id, icon, label, kind, src, lab, yr) => ({id, icon, label: T(label), group: 'Le monde', kind: 'points', source: src, enabled: () => on(LAYER_ON[kind] || kind),
        run: async ({q, bbox, from, to, max = 3000}) => { const rows = (await rowsOf(kind)).rows; const features = rows.filter(r => okLL(r) && inBox(bbox, r.lat, r.lon) && (!from || (yr(r) ?? from) >= from) && (!to || (yr(r) ?? to) <= to) && (!q || fold(lab(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: lab(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('ln2_ordres', '✝️', 'Abbayes et couvents (leur ordre)', 'ordres', 'Wikidata (CC0)', r => `${r.n} — ${(r.o || []).map(o => o[1]).join(', ')}`, r => r.from),
        layer('ln2_patrons', '⛪', 'Églises et leur saint patron', 'patrons', 'Wikidata (CC0)', r => `${r.n} — ${(r.s || []).map(s => s[1]).join(', ')}${r.feast ? ` (${r.feast})` : ''}`, () => null),
        layer('ln2_generaux', '⚔️', 'Généraux de la Révolution et de l’Empire (lieu de naissance)', 'generaux', 'Wikidata (CC0)', r => `${r.n} (${r.b || ''}–${r.d || ''})`, r => r.b),
        layer('ln2_quebec', '🍁', 'Québec : paroisses et leur date d’ouverture', 'quebec', 'Wikidata (CC0)', r => `${r.n}${r.y ? ` (${r.y})` : ''}`, r => r.y));

    /* ─────────── ⌘K : un mot ancien (« mal caduc », « feu », « honnête femme ») ─────────── */
    let dicts = null;
    const warm = () => { if (!dicts) dicts = Promise.all([dictOf('maladies'), dictOf('formules')]).then(([m, f]) => { dicts = {m, f}; return dicts; }).catch(() => { dicts = null; }); return dicts; };
    function provider(q) {
        const text = String(q || '').trim(); if (text.length < 3 || text.length > 40) return [];
        if (!dicts || typeof dicts.then === 'function') { warm(); return []; }   // chargé à la première frappe, répondu à la suivante
        const out = [];
        for (const [D, icon, list] of [[dicts.m, '🩺', 'ln2_maladies'], [dicts.f, '📜', 'ln2_formules']]) for (const r of lookup(text, D.idx, 2)) {
            out.push({label: `${icon} ${r.w} : ${T(r.m)}`.slice(0, 160), hint: T(icon === '🩺' ? 'Maladies d’autrefois · ouvrir la liste' : 'Formules des actes · ouvrir la liste'), go: () => ext.dataListsEngine?.open(list, {q: r.w})});
        }
        return out.slice(0, 3);
    }
    ext.quickSearchProviders = ext.quickSearchProviders || [];
    if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
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
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life ln2-life">${html}</div>` : '';
        return !!html;
    }
    const DS = (id, icon, label, parts, empty) => ({id, icon, label: T(label), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (c, host) => runPerson(parts, c, host, empty)});
    (ext.dataSources = ext.dataSources || []).push(
        DS('ln2p_deces', '🩺', 'La cause de son décès en mots d’aujourd’hui', ['deces'], 'Aucune cause de décès reconnue dans la fiche (personne décédée seulement).'),
        DS('ln2p_epoque', '📚', 'L’école et le recensement de son département', ['ecole', 'recensement'], 'Il faut sa date de naissance et un lieu de France (personne décédée).'),
        DS('ln2p_ailleurs', '🍁', 'Où chercher au Québec ou en Suisse', ['ailleurs'], 'Aucun lieu au Québec (avant 1900) ni en Suisse dans la fiche.'),
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (c, host) => runPlace(kind, c, host)})));

    /* ─────────── ⚙️ Réglages → 📊 Chiffres d'époque et mots des actes ─────────── */
    const FILE_LABEL = [['ecole', '📚 Enseignement primaire 1829-1897'], ['recensements', '👥 Recensements 1851-1921'], ['territoire', '🗺 Territoire et population 1800-1890'],
        ['maladies', '🩺 Maladies d’autrefois'], ['formules', '📜 Formules des actes'], ['heimatort', '🇨🇭 Le lieu d’origine suisse'], ['mortalite', '⏳ Tables de mortalité anciennes'],
        ['ordres', '✝️ Ordres religieux'], ['patrons', '⛪ Saints patrons'], ['generaux', '⚔️ Généraux 1715-1800'], ['quebec', '🍁 Paroisses du Québec'], ['cadastres', '🗺 Cadastres napoléoniens ouverts'],
        ['rues', '🛣 Anciens noms des rues'], ['expillyIndex', '📖 Expilly 1762-1770'], ['lau', '🇪🇺 Communes d’Europe (GISCO LAU)'], ['it', '🇮🇹 Communes d’Italie (ISTAT)'], ['ch', '🇨🇭 Communes de Suisse (OFS)'],
        ['qc', '🍁 Noms de lieux du Québec'], ['lu', '🇱🇺 Anciennes communes du Luxembourg']];
    /* ce qui reste un lien (licence non ouverte, non lue, ou pas de fichier) : la raison, en clair */
    const LINK_ONLY = [
        ['👑', 'Élections et subdélégations fiscales de 1789', 'Aucune couche ouverte vérifiée : les cartes de l’atlas Ancien Régime n’ont pas ces limites.', 'https://fr.wikipedia.org/wiki/%C3%89lection_(Ancien_R%C3%A9gime)'],
        ['🇪🇸', 'Espagne : changements de communes depuis 1842 (INE)', 'Licence de l’INE non lue d’ici, pas de fichier ouvert trouvé : lien seulement (les fusions sont aussi dans « Communes disparues », Wikidata).', 'https://www.ine.es/intercensal/'],
        ['🇳🇱', 'Pays-Bas : communes depuis 1812 (Repertorium, DANS)', 'Licence non lue d’ici : lien seulement (les fusions sont aussi dans « Communes disparues », Wikidata).', 'https://www.dans.knaw.nl/'],
        ['🇧🇪', 'Belgique : population des communes depuis 1831', 'Statbel ne publie en données ouvertes que depuis 1992 ; les recensements anciens sont en lien.', 'https://statbel.fgov.be/fr/open-data'],
        ['🎪', 'Foires et marchés des almanachs du XIXᵉ siècle', 'Pas de liste ouverte fiable : la lecture des almanachs par la machine mélangerait les dates et les communes. Les almanachs sont en lien dans « Foires ».', 'https://archive.org/search?query=almanach%20foires'],
        ['🛡', 'Gardes nationales et levées de 1792-1793', 'Pas de base nominative ouverte : les cotes de la série R des archives départementales sont dans « Où chercher ».', ''],
        ['🌾', 'Prix du blé par département (mercuriales)', 'Aucun fichier ouvert trouvé dans les séries de la SGF : à chercher dans l’Annuaire statistique sur Gallica.', 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=(gallica%20all%20%22prix%20du%20bl%C3%A9%22%20and%20gallica%20all%20%22mercuriales%22)']];
    let drawToken = 0;
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const mine = ++drawToken, metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (mine !== drawToken || (token !== undefined && A().state && token !== A().state.workspaceToken)) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-ln2-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const count = D => (D.meta?.tables ? D.meta.tables.length : D.rows.length);
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T(['lau', 'it', 'ch', 'qc', 'lu', 'expillyIndex', 'rues'].includes(k) ? 'Pas encore fabriqué : il se fabrique sur GitHub, si la licence lue est ouverte.' : 'Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(count(D)))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        const lo = LINK_ONLY.map(([icon, label, why, url]) => `<li>${esc(icon)} <b>${esc(T(label))}</b> — ${esc(T(why))} ${url ? link(url, T('↗ ouvrir')) : ''}</li>`).join('');
        ws.innerHTML = `<section class="page cplus-settings ln2-settings" data-ln2-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Chiffres d’époque et mots des actes'), icon: '📊', where: T('Réglages · Données'), help: esc(T('Les chiffres de la Statistique générale de la France, les maladies et les formules des actes d’autrefois, les saints patrons, les abbayes, les généraux, les cadastres ouverts. Tout est livré avec l’app.'))}) : `<h2>📊 ${esc(T('Chiffres d’époque et mots des actes'))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne décédée (bloc « 📊 Son époque en chiffres et en mots »), sur la fiche d’un village et dans la monographie. Les listes sont dans Listes (✝️ Croire, 📚 Livres, 💶 Chiffres, 🗺 Lieux, ⚔️ Guerres), les points dans Cartes ; un mot ancien se cherche dans ⌘K.'))}</p>
                <p class="muted">${esc(T('La personne :'))}</p>${PARTS.filter(p => PERSON_PARTS.includes(p[0])).map(tg).join('')}
                <details class="ln2-more"><summary>⚙️ ${esc(T('Personnaliser'))}</summary><p class="muted">${esc(T('Le lieu :'))}</p>${PARTS.filter(p => !PERSON_PARTS.includes(p[0])).map(tg).join('')}
                <label class="ln2-opt">${esc(T('Abbayes voisines : à combien de kilomètres ?'))} <input type="number" min="1" max="50" step="1" value="${esc(String(radius()))}" data-ln2-km inputmode="numeric"> <span class="muted">${esc(T('km (10 par défaut)'))}</span></label></details>
</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                <h4>${esc(T('En lien seulement'))}</h4><ul class="hist-ul ln2-ul">${lo}</ul>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu. Seuls les liens « ↗ » ouvrent une page, quand on clique.'))}</p></div></section>`;
    }
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-ln2-tg]');
        if (t && e.target.matches('input')) {
            const s = settings(), k = t.dataset.ln2Tg, was = s[k];
            s[k] = e.target.checked; saveSettings(s);
            const label = T(PARTS.find(p => p[0] === k)?.[1] || k);
            A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: label}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '📊'});
            return;
        }
        const kmIn = e.target.closest?.('[data-ln2-km]');
        if (kmIn) {
            const s = settings(), was = s.km, v = Math.round(Number(kmIn.value));
            if (!(v >= 1 && v <= 50)) { kmIn.value = String(radius()); return; }
            if (v === radius()) return;
            s.km = v; saveSettings(s);
            A().undoToast?.(T('Abbayes voisines : {n} km.', {n: String(v)}), {undo: () => { const x = settings(); x.km = was; saveSettings(x); drawSettings(); }, icon: '📊'});
        }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_m'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_m'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '📊 Son époque en chiffres et en mots']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register() && root.document) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.lotN2 = {...core, load, settings, personInto, placeInto, placePart, lifeOf, provider,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
