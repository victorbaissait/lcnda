/* LCNDA — 📊 Mes rapports et 🧰 Traitements en lot (maquette validée : docs/design/rapports-scripts.html ; serveur : lib/rapports_traitements.php ;
 * style : assets/css/rapports.css).
 *  📊 Mes rapports : un constructeur en 5 étapes (qui ? — les critères de « Mes listes » ; colonnes ; tri et regroupement ; mise en forme ;
 *     vie privée et export) avec l'aperçu tel qu'il sera imprimé ; 🖨 imprimer / ⤓ PDF par l'impression de l'app (UI.openPrintDialog),
 *     ⤓ CSV, ⤓ HTML, → tableur ; des modèles prêts ; mes rapports enregistrés ; ⤓ / ⤒ un fichier .lcnda-rapport (des réglages, jamais du code).
 *     Vivants et fiches 🔒 retirés comme dans les exports (le serveur s'en charge, mode confidentialité compris).
 *  🧰 Traitements en lot : des gestes connus (lieux, dates « vers », noms en majuscules, nettoyage, étiquette), sur tout le monde ou sur des
 *     personnes choisies (critères de « Mes listes », une de mes listes, une recherche enregistrée) ; APERÇU ligne par ligne (avant → après,
 *     lignes à décocher) ; sauvegarde de la base juste avant ; « ↶ Annuler » qui remet tout ; recettes (plusieurs gestes enchaînés),
 *     enregistrées et échangeables comme les rapports.
 * Où : Listes → 🛠️ Outils de modification → onglets « 📊 Mes rapports » et « 🧰 Traitements en lot » ; « 🖨 En faire un rapport » dans le
 * menu ⋯ d'une de « Mes listes ». Pour d'autres fichiers : LCNDA_EXT.rapports. Essai : tests/test-rapports-traitements.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const escRaw = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════════════ les calculs (sans écran : aussi pour Node) ═════════════ */
    const fmtNum = n => { const r = Math.round(n * 10) / 10; return String(r).replace('.', ','); };
    /** un nombre lu dans une case : « 67 ans » → 67, « 12, 40 » → 12 ; rien → null */
    const num = v => { const m = String(v ?? '').replace(/\s| /g, '').match(/^-?\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; };
    const yearOf = v => { const m = String(v ?? '').match(/(?<!\d)(\d{3,4})(?!\d)/); return m ? Number(m[1]) : null; };
    /** la valeur qui sert à trier une colonne (années pour les dates, nombres pour les nombres, sinon le texte) */
    function sortValue(row, col) {
        const c = row.cells || {};
        if (col === 'birth') return num(c.birth_year) ?? yearOf(c.birth);
        if (col === 'death') return num(c.death_year) ?? yearOf(c.death);
        if (col === 'date' || col === 'century') return row.year ?? yearOf(c.date) ?? num(c.birth_year);
        if (['sosa', 'age', 'sources', 'children', 'marriages', 'generation', 'birth_year', 'death_year', 'year', 'id'].includes(col)) return num(c[col]);
        return String(c[col] ?? '');
    }
    function compare(a, b) {
        const an = a === null || a === '' || a === undefined, bn = b === null || b === '' || b === undefined;
        if (an || bn) return an && bn ? 0 : an ? 1 : -1; // les vides à la fin
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b), 'fr', {numeric: true, sensitivity: 'base'});
    }
    const AGG = {avg: 'Moyenne', median: 'Médiane', sum: 'Total', min: 'Minimum', max: 'Maximum'};
    function aggregate(values, fn) {
        const v = values.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
        if (!v.length) return null;
        if (fn === 'sum') return v.reduce((t, x) => t + x, 0);
        if (fn === 'min') return v[0];
        if (fn === 'max') return v[v.length - 1];
        if (fn === 'median') return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
        return v.reduce((t, x) => t + x, 0) / v.length;
    }
    /** Trie, regroupe, compte : {groups: [{label, rows, agg}], rows, total, agg} */
    function buildReport(def, rows) {
        const sort = (def.sort || []).filter(s => s && s.col), g = def.group || {}, gcol = g.col || '';
        const keys = [...(gcol ? [{col: gcol, dir: 'asc'}] : []), ...sort];
        if (!sort.length) keys.push({col: def.source === 'events' ? 'date' : 'name', dir: 'asc'});
        const sorted = rows.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => { for (const k of keys) { const d = compare(sortValue(a, k.col), sortValue(b, k.col)); if (d) return k.dir === 'desc' && k.col !== gcol ? -d : d; } return ia - ib; }).map(([r]) => r);
        const ag = g.agg && g.agg.col ? g.agg : null;
        const aggOf = list => (ag ? aggregate(list.map(r => num((r.cells || {})[ag.col])), ag.fn || 'avg') : null);
        const groups = [];
        if (gcol) { for (const r of sorted) { const label = String((r.cells || {})[gcol] ?? '').trim(); const last = groups[groups.length - 1]; if (last && last.label === label) last.rows.push(r); else groups.push({label, rows: [r]}); } }
        else groups.push({label: null, rows: sorted});
        groups.forEach(x => { x.agg = aggOf(x.rows); });
        return {groups, rows: sorted, total: sorted.length, agg: aggOf(sorted)};
    }
    const DOC_CSS = `.rt-doc{background:#fffdf8;color:#111;font:12.5px/1.45 Georgia,"Times New Roman",serif;padding:18px 22px}
.rt-doc.is-plain{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.rt-doc h1{font-size:19px;margin:0;text-align:center}
.rt-doc .rt-sub{text-align:center;font-size:11.5px;color:#555;margin:2px 0 12px}
.rt-doc .rt-runhead,.rt-doc .rt-runfoot{font-size:10.5px;color:#555;text-align:center}
.rt-doc .rt-runfoot{margin-top:14px;border-top:1px solid #ccc;padding-top:4px}
.rt-doc h2{font-size:14px;margin:14px 0 3px;border-bottom:1.5px solid #111;padding-bottom:2px;display:flex;justify-content:space-between;gap:8px}
.rt-doc h2 small{font-weight:400;font-size:11.5px;color:#555}
.rt-doc table{width:100%;border-collapse:collapse;font-size:12px}
.rt-doc th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:1.5px solid #111;padding:3px 6px}
.rt-doc td{padding:3px 6px;border-bottom:1px solid #e3e3e3;vertical-align:top}
.rt-doc td.n,.rt-doc th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rt-doc tr.rt-nosrc td{background:#fff3cd}
.rt-doc tr.rt-tot td{border-top:1px solid #111;border-bottom:0;font-style:italic}
.rt-doc .rt-grand{margin-top:12px;font-weight:700;border-top:2px solid #111;padding-top:4px;display:flex;justify-content:space-between;gap:8px}
.rt-doc a{color:#055dff}
.rt-doc .rt-no{color:#777;font-size:10px}
.rt-doc .rt-empty{text-align:center;color:#555;padding:20px}
@media print{.rt-doc{padding:0;background:#fff}.rt-doc .rt-group.is-break{break-before:page}.rt-doc tr{break-inside:avoid}.rt-doc h2{break-after:avoid}}`;
    const unitOf = (def, n) => (def.source === 'events' ? (n > 1 ? T('événements') : T('événement')) : (n > 1 ? T('personnes') : T('personne')));
    /**
     * Le corps du rapport (aperçu, impression, fichier HTML) : tout est échappé, aucun script.
     * o : {columns: {clé: nom}, appUrl: lien vers l'app (fichier HTML), print: numéros des fiches, now: Date}
     */
    function reportBody(def, data, o = {}) {
        const esc = escRaw, L = def.layout || {}, cols = (def.columns || []).filter(c => o.columns ? c in o.columns : true);
        const name = c => (o.columns && o.columns[c]) || c;
        const r = buildReport(def, data.rows || []);
        const g = def.group || {}, ag = g.agg && g.agg.col ? g.agg : null;
        const numeric = c => ['sosa', 'age', 'sources', 'children', 'marriages', 'generation', 'birth_year', 'death_year', 'year', 'id'].includes(c);
        const now = o.now || new Date();
        const dateTxt = now.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'});
        const sub = L.subtitle || [T('{n} {u}', {n: r.total, u: unitOf(def, r.total)}), g.col ? T('regroupés par {c}', {c: name(g.col).toLowerCase()}) : '', L.date !== false ? dateTxt : ''].filter(Boolean).join(' · ');
        const noSrc = row => L.color_nosource && String(row.cells?.sources ?? '') === '0' && !row.cells?.source_titles;
        const cell = (row, c) => {
            const v = String(row.cells?.[c] ?? '');
            if ((c === 'name' || c === 'who') && row.people?.length) {
                const ps = c === 'name' ? row.people.slice(0, 1) : row.people;
                return ps.map(p => (o.appUrl ? `<a href="${esc(o.appUrl + '#personnes/' + p.id)}">${esc(p.name)}</a>` : esc(p.name)) + (o.print && L.numbers ? ` <span class="rt-no">n° ${esc(p.id)}</span>` : '')).join(' &amp; ');
            }
            return esc(v) || (numeric(c) ? '' : '—');
        };
        const aggLine = (val, label) => (ag && val !== null ? `<tr class="rt-tot"><td colspan="${Math.max(1, cols.length - 1)}">${esc(T('{f} · {c}', {f: T(AGG[ag.fn] || AGG.avg), c: name(ag.col)}))}${label ? ` (${esc(label)})` : ''}</td><td class="n">${esc(fmtNum(val))}</td></tr>` : '');
        const table = (rows, grp) => `<table><thead><tr>${cols.map(c => `<th${numeric(c) ? ' class="n"' : ''}>${esc(name(c))}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr${noSrc(row) ? ' class="rt-nosrc"' : ''}>${cols.map(c => `<td${numeric(c) ? ' class="n"' : ''}>${cell(row, c)}</td>`).join('')}</tr>`).join('')}${grp && g.subtotal !== false ? aggLine(grp.agg, grp.label) : ''}</tbody></table>`;
        const head = `${L.header ? `<div class="rt-runhead">${esc(L.header)}</div>` : ''}<h1>${esc(L.title || o.name || T('Rapport'))}</h1><p class="rt-sub">${esc(sub)}</p>`;
        let body;
        if (!r.total) body = `<p class="rt-empty">${esc(T('Aucune ligne ne répond aux critères.'))}</p>`;
        else if (g.col) body = r.groups.map((x, i) => `<section class="rt-group${g.page_break && i ? ' is-break' : ''}"><h2><span>${esc(x.label || T('(non renseigné)'))}</span><small>${esc(T('{n} {u}', {n: x.rows.length, u: unitOf(def, x.rows.length)}))}</small></h2>${table(x.rows, x)}</section>`).join('');
        else body = table(r.rows, null);
        const grand = r.total && g.total !== false ? `<div class="rt-grand"><span>${esc(T('Total'))}</span><span>${esc(T('{n} {u}', {n: r.total, u: unitOf(def, r.total)}))}${ag && r.agg !== null ? ` · ${esc(T(AGG[ag.fn] || AGG.avg))} ${esc(fmtNum(r.agg))}` : ''}</span></div>` : '';
        return `<div class="rt-doc${L.font === 'plain' ? ' is-plain' : ''}">${head}${body}${grand}${L.footer ? `<div class="rt-runfoot">${esc(L.footer)}</div>` : ''}</div>`;
    }
    /** Le document complet (impression, fichier .html) : la page et son style, sans aucun script */
    function reportDoc(def, data, o = {}) {
        const L = def.layout || {};
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escRaw(L.title || o.name || T('Rapport'))}</title><style>@page{size:${L.paper || 'A4'} ${L.orientation === 'landscape' ? 'landscape' : 'portrait'};margin:14mm 12mm}body{margin:0;background:#fff}${DOC_CSS}</style></head><body>${reportBody(def, data, o)}</body></html>`;
    }
    /** Le CSV : la colonne du groupe d'abord (si elle n'est pas déjà là), puis les colonnes ; formules neutralisées */
    function reportCsv(def, data, o = {}) {
        const safe = o.csvSafe || (v => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(?:[.,]\d+)?$/.test(s) ? "'" + s : s; });
        const cols = [...(def.group?.col && !(def.columns || []).includes(def.group.col) ? [def.group.col] : []), ...(def.columns || [])].filter(c => (o.columns ? c in o.columns : true));
        const r = buildReport(def, data.rows || []);
        const q = v => '"' + safe(v).replace(/"/g, '""') + '"';
        return '﻿' + [cols.map(c => q((o.columns && o.columns[c]) || c)).join(';'), ...r.rows.map(row => cols.map(c => q(row.cells?.[c] ?? '')).join(';'))].join('\r\n');
    }
    /** La grille (tableur) : en-tête + lignes */
    function reportMatrix(def, data, columns) {
        const cols = [...(def.group?.col && !(def.columns || []).includes(def.group.col) ? [def.group.col] : []), ...(def.columns || [])].filter(c => c in columns);
        return [cols.map(c => columns[c]), ...buildReport(def, data.rows || []).rows.map(row => cols.map(c => String(row.cells?.[c] ?? '')))];
    }
    /** Vérification avant l'envoi (le serveur vérifie de nouveau, plus strictement) : la page refuse tout de suite ce qui n'est pas un rapport */
    const CODE_RX = /<\s*\/?\s*[a-z!?]|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=|\{\{|<%|\beval\s*\(|\bfunction\s*\(|=>|`/i;
    function checkFile(text) {
        if (String(text || '').length > 200000) return {ok: false, error: T('Fichier trop gros pour un rapport (200 Ko au plus).')};
        let pkg; try { pkg = JSON.parse(text); } catch (_) { return {ok: false, error: T('Ce fichier n’est pas un rapport LCNDA (.lcnda-rapport).')}; }
        if (!pkg || pkg.type !== 'lcnda-rapport' || !['report', 'recipe'].includes(pkg.kind)) return {ok: false, error: T('Ce fichier n’est pas un rapport LCNDA (.lcnda-rapport).')};
        let bad = '';
        const walk = v => { if (bad) return; if (typeof v === 'string') { if (CODE_RX.test(v)) bad = v; } else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (CODE_RX.test(k)) bad = k; walk(x); }); };
        walk(pkg);
        if (bad) return {ok: false, error: T('Fichier refusé : il contient du HTML ou du code (« {x} »). Un rapport ne contient que des réglages, jamais de code.', {x: bad.slice(0, 40)})};
        return {ok: true, pkg};
    }

    /* les modèles prêts (les types d'événements par leur code GEDCOM, retrouvés dans la base à l'ouverture) */
    const TEMPLATES = [
        {key: 'ancetres_sources', icon: '📜', name: 'Tous mes ancêtres avec leurs sources', desc: 'Sosa, nom, dates, lieux et les titres des sources ; en jaune, ceux qui n’en ont pas.',
            def: {source: 'persons', rules: [{field: 'sosa'}], columns: ['sosa', 'name', 'birth', 'birthplace', 'death', 'deathplace', 'source_titles'], sort: [{col: 'sosa', dir: 'asc'}], layout: {color_nosource: true, orientation: 'landscape'}}},
        {key: 'generations', icon: '🪜', name: 'Ancêtres par génération', desc: 'Un titre par génération, Sosa, dates et lieux.',
            def: {source: 'persons', rules: [{field: 'sosa'}], columns: ['sosa', 'name', 'birth', 'birthplace', 'death', 'deathplace'], sort: [{col: 'sosa', dir: 'asc'}], group: {col: 'generation'}}},
        {key: 'deces_commune', icon: '🏘', name: 'Décès par commune', desc: 'Les décès regroupés par commune, avec l’âge moyen au décès.',
            def: {source: 'events', rules: [{field: 'event_type', tags: ['DEAT']}], columns: ['date', 'who', 'age', 'description'], sort: [{col: 'date', dir: 'asc'}], group: {col: 'commune', agg: {col: 'age', fn: 'avg'}}}},
        {key: 'incompletes', icon: '🧭', name: 'Fiches incomplètes', desc: 'Sans source, sans parents ou sans date de naissance : ce qui manque à chacun.',
            def: {source: 'persons', match: 'any', rules: [{field: 'no_source'}, {field: 'no_parents'}, {field: 'year', from: 1, not: true}], columns: ['name', 'birth', 'death', 'parents', 'sources', 'missing'], sort: [{col: 'name', dir: 'asc'}]}},
        {key: 'sans_source', icon: '📚', name: 'Ce qui manque de sources', desc: 'Naissances, mariages, décès sans source, par sorte d’événement.',
            def: {source: 'events', rules: [{field: 'event_type', tags: ['BIRT', 'MARR', 'DEAT']}, {field: 'no_source'}], columns: ['date', 'who', 'place'], sort: [{col: 'date', dir: 'asc'}], group: {col: 'type'}}},
        {key: 'anniversaires', icon: '🎂', name: 'Anniversaires du mois', desc: 'Les ancêtres nés ce mois-ci.',
            def: {source: 'persons', rules: [{field: 'sosa'}, {field: 'birth_month', month: true}], columns: ['sosa', 'name', 'birth', 'birthplace'], sort: [{col: 'birth', dir: 'asc'}]}},
        {key: 'age_siecle', icon: '⏳', name: 'Âge au décès par siècle', desc: 'Regroupé par siècle de naissance, avec la médiane.',
            def: {source: 'persons', rules: [{field: 'lifespan', to: 130}], columns: ['name', 'gender', 'birth', 'death', 'age'], sort: [{col: 'birth', dir: 'asc'}], group: {col: 'century', agg: {col: 'age', fn: 'median'}}}},
        {key: 'poilus', icon: '🎖', name: 'Les Poilus de la famille', desc: 'Les hommes nés entre 1865 et 1900.',
            def: {source: 'persons', rules: [{field: 'gender', value: 'male'}, {field: 'year', from: 1865, to: 1900}], columns: ['name', 'birth', 'birthplace', 'death', 'deathplace', 'occupation'], sort: [{col: 'birth', dir: 'asc'}]}},
        {key: 'qui_ou', icon: '🗺', name: 'Qui vivait où', desc: 'Par commune : personnes, années, événements.',
            def: {source: 'events', rules: [], columns: ['year', 'type', 'who'], sort: [{col: 'date', dir: 'asc'}], group: {col: 'commune'}}},
        {key: 'eclair', icon: '⚡', name: 'Liste éclair', desc: 'Chaque nom de famille, ses lieux et ses années (forums, cousinades).',
            def: {source: 'persons', rules: [], columns: ['name', 'birth_year', 'birthplace', 'death_year', 'deathplace'], sort: [{col: 'birth', dir: 'asc'}], group: {col: 'last_name'}}},
    ];
    /** un modèle → des réglages pour cette base (types d'événements retrouvés, mois en cours) */
    function templateDef(tpl, eventTypes, now = new Date()) {
        const d = JSON.parse(JSON.stringify(tpl.def));
        d.rules = (d.rules || []).map(r => {
            const x = {...r};
            if (x.tags) { x.values = (eventTypes || []).filter(t => x.tags.includes(t.gedcom_tag)).map(t => Number(t.id)); delete x.tags; }
            if (x.month) { x.values = [now.getMonth() + 1]; delete x.month; }
            return x;
        });
        d.layout = {title: T(tpl.name), ...(d.layout || {})};
        return d;
    }

    /* les gestes des traitements en lot */
    const OPS = [
        {op: 'place_abbrev', icon: '📍', name: 'Développer une abréviation dans les lieux', desc: '« St » → « Saint », « Ste » → « Sainte »… (mot entier ; « St Martial » → « Saint-Martial »)', params: {find: 'St', replace: 'Saint'}},
        {op: 'place_text', icon: '🔁', name: 'Remplacer un texte dans les lieux', desc: 'Un mot ou un morceau de nom, partout où il est écrit ; deux lieux qui deviennent pareils sont fusionnés.', params: {find: '', replace: '', word: true, case: false}},
        {op: 'place_county', icon: '🗺', name: 'Compléter le département des lieux', desc: 'D’après un autre lieu du même nom, ou celui que tu écris.', params: {mode: 'auto', value: '', contains: '', country: ''}},
        {op: 'place_split', icon: '✂️', name: 'Découper un lieu', desc: '« Naves, Corrèze, France » → commune + département + pays.', params: {}},
        {op: 'place_merge', icon: '🔗', name: 'Fusionner les lieux écrits pareil', desc: '« Saint-Priest » et « saint priest » du même département : un seul lieu.', params: {}},
        {op: 'dates_vers', icon: '📅', name: 'Mettre d’accord les dates approximatives', desc: '« env. 1784 », « ca 1784 », « ~1784 », « ABT 1784 » → « vers 1784 ».', params: {before_after: true}},
        {op: 'names_case', icon: '🔠', name: 'Noms en majuscules', desc: '« Lavergne » → « LAVERGNE » ; ou prénoms en capitales : « jean-pierre » → « Jean-Pierre ».', params: {field: 'last_name', mode: 'upper'}},
        {op: 'clean', icon: '🧽', name: 'Nettoyer les espaces et la ponctuation', desc: 'Doubles espaces, virgules en double, champs qui ne contiennent que de la ponctuation.', params: {spaces: true, punct: true, empty: true}},
        {op: 'label', icon: '🏷', name: 'Étiqueter les personnes', desc: 'Une étiquette sur chaque personne choisie (ex. « Import Paul 2026 »).', params: {name: ''}},
    ];
    const opOf = k => OPS.find(o => o.op === k) || OPS[0];
    /** une étape en une phrase (la recette, le journal) */
    function stepText(s) {
        const p = s.params || {}, o = opOf(s.op);
        switch (s.op) {
            case 'place_abbrev': case 'place_text': return T('« {a} » → « {b} » dans les lieux', {a: p.find || '…', b: p.replace ?? ''});
            case 'place_county': return p.mode === 'value' ? T('département « {v} » pour les lieux sans département', {v: p.value || '…'}) : T('départements complétés d’après les lieux du même nom');
            case 'names_case': return p.field === 'first_name' ? T('prénoms en Capitales') : (p.mode === 'title' ? T('noms en Capitales') : T('noms en MAJUSCULES'));
            case 'label': return T('étiquette « {n} »', {n: p.name || '…'});
            default: return T(o.name);
        }
    }

    const api = {num, sortValue, aggregate, buildReport, reportBody, reportDoc, reportCsv, reportMatrix, checkFile, templateDef, TEMPLATES, OPS, stepText, DOC_CSS};
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : escRaw(v));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const toast = (m, k) => A().toast?.(m, k);
    const ws = () => document.querySelector('#workspace');
    const privacyQuery = () => { try { const pv = JSON.parse(localStorage.getItem('genealogie-export-privacy') || '{}'); return pv.enabled ? {privacy: '1', ...(pv.deathCutoffYear ? {death_cutoff_year: pv.deathCutoffYear} : {})} : {}; } catch (_) { return {}; } };
    const slug = s => String(s || 'rapport').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'rapport';
    const download = (text, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
    const pickText = accept => new Promise(res => { const inp = Object.assign(document.createElement('input'), {type: 'file', accept, hidden: true}); inp.dataset.uiOff = ''; inp.addEventListener('change', async () => { const f = inp.files?.[0]; inp.remove(); res(f ? await f.text() : null); }); document.body.appendChild(inp); inp.click(); });
    let META = null;
    const meta = async (fresh = false) => { if (!META || fresh) META = await get('rt_meta', privacyQuery()); return META; };
    const ensureCss = () => { if (document.getElementById('rt-doc-css')) return; const st = document.createElement('style'); st.id = 'rt-doc-css'; st.textContent = DOC_CSS; document.head.appendChild(st); };
    const appUrl = () => location.href.replace(/[#?].*$/, '');
    const openTab = key => (ext.openEditToolTab ? ext.openEditToolTab(key) : A().setModule?.('listes'));

    /* ── ce qui est enregistré : supprimer avec ↶ ── */
    async function removeSaved(id) { const r = await post('rt_saved_delete', {id}); META = null; return {undo: async () => { await post('rt_saved_restore', {row: r.row}); META = null; }}; }
    async function renameSaved(id, name) { const s = await get('rt_saved_get', {id}); await post('rt_saved_save', {...s, name}); META = null; }
    async function exportSaved(id) {
        const pkg = await get('rt_export', {id});
        download(JSON.stringify(pkg, null, 1), `${slug(pkg.name)}.lcnda-rapport`, 'application/json');
        toast(T('Fichier prêt : l’autre personne l’ouvre avec « ⤒ Importer un rapport… ». Il ne contient que des réglages.'));
    }
    async function importFile(again) {
        const text = await pickText('.lcnda-rapport,.json,application/json');
        if (text === null) return;
        const c = checkFile(text);
        if (!c.ok) { toast(c.error, 'error'); return; }
        try {
            const r = await post('rt_import', {json: text}); META = null;
            A().undoToast?.(r.kind === 'recipe' ? T('Recette importée.') : T('Rapport importé.'), {icon: '⤒', undo: async () => { await post('rt_saved_delete', {id: r.id}); META = null; again?.(); }});
            if (r.kind === 'recipe') openBatch({id: r.id}); else openBuilder({id: r.id});
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ═════════════ 🛠️ Outils de modification : deux onglets ═════════════ */
    const savedRows = async kind => (await meta(true)).saved.filter(s => s.kind === kind).map(s => ({id: s.id, name: s.name, date: s.updated_at, thumb: `<span class="h-et-ico">${esc(s.icon || (kind === 'recipe' ? '🧰' : '📊'))}</span>`,
        info: kind === 'recipe' ? (s.definition?.steps || []).map(stepText).join(' → ') : [s.definition?.source === 'events' ? T('événements') : T('personnes'), (s.definition?.columns || []).length ? T('{n} colonnes', {n: s.definition.columns.length}) : ''].filter(Boolean).join(' · ')}));
    ext.editToolsExtra = ext.editToolsExtra || [];
    if (!ext.editToolsExtra.some(t => t.key === 'rapports')) {
        ext.editToolsExtra.push({key: 'rapports', icon: '📊', label: 'Mes rapports', what: 'rapport',
            load: () => savedRows('report'), open: id => openBuilder({id}), create: () => chooseStart(), rename: renameSaved, remove: removeSaved, createLabel: '＋ Nouveau rapport',
            get extra() { return `<button type="button" class="button secondary" data-et-x="tpl">📚 ${esc(T('Modèles prêts'))}</button><button type="button" class="button secondary" data-et-x="import">⤒ ${esc(T('Importer un rapport…'))}</button>`; },
            onExtra: (k, again) => (k === 'import' ? importFile(again) : chooseStart())});
        ext.editToolsExtra.push({key: 'traitements', icon: '🧰', label: 'Traitements en lot', what: 'recette',
            load: () => savedRows('recipe'), open: id => openBatch({id}), create: () => openBatch({}), rename: renameSaved, remove: removeSaved, createLabel: '＋ Nouveau traitement',
            get extra() { return `<button type="button" class="button secondary" data-et-x="import">⤒ ${esc(T('Importer une recette…'))}</button>`; },
            onExtra: (k, again) => importFile(again)});
    }

    /* ── les critères de « Mes listes » (heritage-more.js), sinon un simple texte ── */
    function rulesHtml(rules, source, m) {
        const k = source === 'events' ? 'ev' : 'pe';
        const rows = ext.listRuleRowHtml ? rules.map((r, i) => ext.listRuleRowHtml(r, i, source, {event_types: m.event_types, labels: m.labels})).join('') : rules.map((r, i) => `<div class="h-lr-row" data-lr-i="${i}"><strong>${esc(r.field)}</strong> <input data-lr="value" value="${esc(r.value || '')}"><button type="button" class="icon-button danger" data-lr-del title="${esc(T('Retirer ce critère'))}">🗑</button></div>`).join('');
        return `<div data-rt-rules>${rows || `<p class="muted">${esc(T('Aucun critère : tout le monde.'))}</p>`}</div>
            <label class="rt-add">${esc(T('＋ condition'))} <select data-rt-addrule><option value="">${esc(T('choisir…'))}</option>${ext.ruleOptionsHtml ? ext.ruleOptionsHtml(k) : ['last_name', 'first_name', 'place', 'sosa', 'no_source'].map(f => `<option value="${f}">${esc(f)}</option>`).join('')}</select></label>`;
    }
    function bindRules(box, rules, onChange) {
        const read = row => { const r = rules[Number(row.dataset.lrI)]; if (!r) return; row.querySelectorAll('[data-lr]').forEach(el => { const f = el.dataset.lr; r[f] = f === 'not' ? el.checked : f === 'values' ? [...el.selectedOptions].map(o => Number(o.value)) : (f === 'from' || f === 'to') ? (el.value === '' ? null : Number(el.value)) : el.value; }); };
        box.addEventListener('input', e => { const row = e.target.closest('[data-lr-i]'); if (row && box.contains(row)) { read(row); onChange(false); } });
        box.addEventListener('change', e => {
            if (e.target.matches('[data-rt-addrule]')) { if (e.target.value) { rules.push({field: e.target.value, value: {gender: 'female', living: 'deceased', of_person: 'ancestors'}[e.target.value] || '', values: []}); onChange(true); } return; }
            const row = e.target.closest('[data-lr-i]'); if (row && box.contains(row)) { read(row); onChange(false); }
        });
        box.addEventListener('click', e => { const row = e.target.closest('[data-lr-i]'); if (row && e.target.closest('[data-lr-del]')) { rules.splice(Number(row.dataset.lrI), 1); onChange(true); } });
    }
    const dialog = o => (ext.openDialog ? ext.openDialog(o) : null);

    /* ═════════════ 📊 Le constructeur de rapports ═════════════ */
    function blankDef(source = 'persons') { return {source, match: 'all', rules: [], start: {search: 0, list: 0}, columns: source === 'events' ? ['date', 'type', 'who', 'place'] : ['name', 'birth', 'birthplace', 'death', 'deathplace'], sort: [], group: {col: '', page_break: false, subtotal: true, total: true, agg: {col: '', fn: 'avg'}}, layout: {title: '', subtitle: '', header: '', footer: '', orientation: 'portrait', paper: 'A4', font: 'book', color_nosource: false, date: true, numbers: true}, privacy: {keep_living: false}}; }
    const fullDef = d => { const b = blankDef(d.source === 'events' ? 'events' : 'persons'); return {...b, ...d, start: {...b.start, ...(d.start || {})}, group: {...b.group, ...(d.group || {}), agg: {...b.group.agg, ...(d.group?.agg || {})}}, layout: {...b.layout, ...(d.layout || {})}, privacy: {...b.privacy, ...(d.privacy || {})}, rules: d.rules || [], sort: d.sort || []}; };

    async function chooseStart() {
        const m = await meta();
        const card = (attr, icon, name, desc) => `<button type="button" class="h-template rt-tplcard" ${attr}><span>${esc(icon)}</span><strong>${esc(T(name))}</strong><small>${esc(T(desc))}</small></button>`;
        const body = `<h4>${esc(T('Modèles prêts'))}</h4><div class="h-templates rt-tpl">${TEMPLATES.map(t => card(`data-rt-tpl="${t.key}"`, t.icon, t.name, t.desc)).join('')}</div>
            <h4>${esc(T('Partir de zéro'))}</h4><div class="h-templates rt-tpl">${card('data-rt-blank="persons"', '👥', 'Des personnes', 'Une ligne par personne.')}${card('data-rt-blank="events"', '📅', 'Des événements', 'Une ligne par naissance, mariage, décès…')}</div>
            ${m.lists.length ? `<h4>${esc(T('Partir d’une de mes listes'))}</h4><div class="h-templates rt-tpl">${m.lists.map(l => card(`data-rt-list="${l.id}"`, l.icon || '📋', l.name, l.source === 'events' ? 'événements' : 'personnes')).join('')}</div>` : ''}`;
        const d = dialog({eyebrow: T('MES RAPPORTS'), title: `📊 ${T('Nouveau rapport')}`, body, wide: true, submitLabel: T('Fermer'), onSubmit: () => true,
            onOpen: dg => dg.addEventListener('click', e => {
                const b = e.target.closest('[data-rt-tpl],[data-rt-blank],[data-rt-list]'); if (!b) return;
                dg.close?.();
                if (b.dataset.rtTpl) { const t = TEMPLATES.find(x => x.key === b.dataset.rtTpl); openBuilder({def: templateDef(t, m.event_types), name: T(t.name), icon: t.icon}); }
                else if (b.dataset.rtBlank) openBuilder({def: blankDef(b.dataset.rtBlank)});
                else fromList(Number(b.dataset.rtList));
            })});
        if (!d && !ext.openDialog) openBuilder({def: blankDef()});
    }
    /** « 🖨 En faire un rapport » : les critères et les colonnes d'une de « Mes listes » */
    async function fromList(id) {
        try {
            const r = await get('my_lists'); const l = (r.lists || []).find(x => Number(x.id) === Number(id));
            if (!l) throw new Error(T('Cette liste n’existe plus.'));
            const source = l.source === 'events' ? 'events' : 'persons', d = l.definition || {};
            const def = fullDef({source, match: d.match, rules: d.rules || [], columns: (d.columns || []).length ? (source === 'persons' && !d.columns.includes('name') ? ['name', ...d.columns] : d.columns) : blankDef(source).columns,
                sort: d.sort === 'date' ? [{col: source === 'events' ? 'date' : 'birth', dir: 'asc'}] : d.sort === 'place' ? [{col: source === 'events' ? 'place' : 'birthplace', dir: 'asc'}] : [], layout: {title: l.name}});
            if (!['persons', 'events'].includes(l.source)) toast(T('Seules les listes de personnes ou d’événements deviennent un rapport : le rapport part de toutes les personnes.'), 'info');
            openBuilder({def, name: l.name, icon: l.icon || '📊'});
        } catch (e) { toast(e.message, 'error'); }
    }
    ext.rapports = {openBuilder: o => openBuilder(o), openBatch: o => openBatch(o), fromList, ...api};
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-lv-report]'); if (b) { e.preventDefault(); fromList(Number(b.dataset.lvReport)); } });

    async function openBuilder({id = 0, def = null, name = '', icon = '📊'} = {}) {
        const host = ws(); if (!host) return;
        const token = A().state ? ++A().state.workspaceToken : 0;
        host.innerHTML = `<section class="page rt-page">${UI().spinner ? UI().spinner(T('Le rapport se prépare…')) : ''}</section>`;
        let m;
        try { m = await meta(true); if (id) { const s = await get('rt_saved_get', {id}); def = s.definition; name = s.name; icon = s.icon || icon; } }
        catch (e) { toast(e.message, 'error'); return openTab('rapports'); }
        if (A().state && token !== A().state.workspaceToken) return;
        ensureCss();
        const st = {id, name, icon, def: fullDef(def || blankDef()), data: null, whoKey: '', loading: false, err: ''};
        if (!st.def.layout.title) st.def.layout.title = name || '';
        const cols = () => m.columns[st.def.source] || {};
        const colOpts = (sel, empty) => `${empty ? `<option value="">${esc(empty)}</option>` : ''}${Object.entries(cols()).map(([k, l]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(T(l))}</option>`).join('')}`;
        const whoKey = () => JSON.stringify([st.def.source, st.def.match, st.def.rules, st.def.start, st.def.privacy]);
        const header = () => (UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · ${T('Outils de modification')}`, icon: st.icon || '📊', title: st.name || T('Nouveau rapport'), detail: true,
            back: `<button type="button" class="link-button" data-rt-back>← ${esc(T('Mes rapports'))}</button>`,
            help: esc(T('Un rapport ne fait que lire ta base : choisis les personnes, les colonnes, le tri, la mise en page, puis imprime ou exporte.')),
            primary: `<button type="button" class="button" data-rt-save>💾 ${esc(T('Enregistrer'))}</button>`,
            actions: [`<button type="button" class="button secondary" data-rt-print>🖨 ${esc(T('Imprimer / PDF'))}</button>`, `<button type="button" class="button secondary" data-rt-export aria-haspopup="true">⤓ ${esc(T('Exporter ▾'))}</button>`]}) : `<h2>📊 ${esc(st.name)}</h2>`);
        const seg = (attr, value, choices) => `<div class="segmented rt-seg" role="radiogroup">${choices.map(([v, l]) => `<button type="button" role="radio" class="${v === value ? 'is-active' : ''}" aria-checked="${v === value}" ${attr}="${esc(v)}">${esc(T(l))}</button>`).join('')}</div>`;
        const side = () => {
            const d = st.def, g = d.group, L = d.layout;
            const startVal = d.start.search ? `s${d.start.search}` : d.start.list ? `l${d.start.list}` : '';
            return `<div class="rt-step"><h3><i>1</i> ${esc(T('Qui ?'))}</h3>
                    ${seg('data-rt-source', d.source, [['persons', 'personnes'], ['events', 'événements']])}
                    <label class="rt-lab">${esc(T('Partir de'))} <select data-rt-start><option value="">${esc(T('toute la base'))}</option>
                        ${m.searches.length ? `<optgroup label="${esc(T('🔎 Recherches enregistrées'))}">${m.searches.map(s => `<option value="s${s.id}"${startVal === 's' + s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>` : ''}
                        ${m.lists.length ? `<optgroup label="${esc(T('📋 Mes listes'))}">${m.lists.map(l => `<option value="l${l.id}"${startVal === 'l' + l.id ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>` : ''}</select></label>
                    <div class="rt-match"><label class="radio-line"><input type="radio" name="rt-match" value="all"${d.match !== 'any' ? ' checked' : ''}> ${esc(T('toutes les conditions (ET)'))}</label><label class="radio-line"><input type="radio" name="rt-match" value="any"${d.match === 'any' ? ' checked' : ''}> ${esc(T('au moins une (OU)'))}</label></div>
                    <div data-rt-rulebox>${rulesHtml(d.rules, d.source, m)}</div></div>
                <div class="rt-step"><h3><i>2</i> ${esc(T('Colonnes'))}</h3>
                    <ol class="rt-cols">${d.columns.map((c, i) => `<li data-rt-col="${i}"><span>${esc(T(cols()[c] || c))}</span><button type="button" class="icon-button small" data-rt-colup title="${esc(T('Monter'))}" aria-label="${esc(T('Monter'))}">↑</button><button type="button" class="icon-button small" data-rt-coldown title="${esc(T('Descendre'))}" aria-label="${esc(T('Descendre'))}">↓</button><button type="button" class="icon-button small" data-rt-coldel title="${esc(T('Retirer'))}" aria-label="${esc(T('Retirer'))}">×</button></li>`).join('')}</ol>
                    <label class="rt-add">${esc(T('＋ colonne'))} <select data-rt-addcol>${colOpts('', T('choisir…'))}</select></label></div>
                <div class="rt-step"><h3><i>3</i> ${esc(T('Tri et regroupement'))}</h3>
                    <label class="rt-lab">${esc(T('Regrouper par'))} <select data-rt-f="group.col">${colOpts(g.col, T('pas de groupes'))}</select></label>
                    ${[0, 1].map(i => `<div class="rt-sortrow"><label class="rt-lab">${esc(i ? T('puis par') : T('Trier par'))} <select data-rt-sort="${i}">${colOpts(d.sort[i]?.col || '', i ? T('rien d’autre') : T('ordre habituel'))}</select></label><select data-rt-sortdir="${i}" aria-label="${esc(T('Sens'))}"><option value="asc"${d.sort[i]?.dir !== 'desc' ? ' selected' : ''}>↑</option><option value="desc"${d.sort[i]?.dir === 'desc' ? ' selected' : ''}>↓</option></select></div>`).join('')}
                    <label class="rt-lab">${esc(T('Calculer'))} <select data-rt-f="group.agg.fn">${Object.entries(AGG).map(([k, l]) => `<option value="${k}"${g.agg.fn === k ? ' selected' : ''}>${esc(T(l))}</option>`).join('')}</select> ${esc(T('de'))} <select data-rt-f="group.agg.col">${colOpts(g.agg.col, T('rien'))}</select></label>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="group.subtotal"${g.subtotal ? ' checked' : ''}> ${esc(T('sous-total par groupe'))}</label>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="group.total"${g.total ? ' checked' : ''}> ${esc(T('total général'))}</label>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="group.page_break"${g.page_break ? ' checked' : ''}> ${esc(T('nouvelle page à chaque groupe'))}</label></div>
                <div class="rt-step"><h3><i>4</i> ${esc(T('Mise en forme'))}</h3>
                    <label class="rt-lab">${esc(T('Titre'))} <input data-rt-f="layout.title" value="${esc(L.title)}" maxlength="160" placeholder="${esc(T('Nos ancêtres corréziens'))}"></label>
                    <label class="rt-lab">${esc(T('Sous-titre'))} <input data-rt-f="layout.subtitle" value="${esc(L.subtitle)}" maxlength="300" placeholder="${esc(T('écrit tout seul si tu le laisses vide'))}"></label>
                    <label class="rt-lab">${esc(T('En-tête'))} <input data-rt-f="layout.header" value="${esc(L.header)}" maxlength="200"></label>
                    <label class="rt-lab">${esc(T('Pied de page'))} <input data-rt-f="layout.footer" value="${esc(L.footer)}" maxlength="200"></label>
                    <div class="rt-row">${seg('data-rt-orient', L.orientation, [['portrait', 'Portrait'], ['landscape', 'Paysage']])}<select data-rt-f="layout.paper" aria-label="${esc(T('Format du papier'))}">${['A4', 'A5', 'A3'].map(p => `<option${L.paper === p ? ' selected' : ''}>${p}</option>`).join('')}</select>
                        <select data-rt-f="layout.font" aria-label="${esc(T('Police'))}"><option value="book"${L.font !== 'plain' ? ' selected' : ''}>${esc(T('police « livre »'))}</option><option value="plain"${L.font === 'plain' ? ' selected' : ''}>${esc(T('police simple'))}</option></select></div>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="layout.color_nosource"${L.color_nosource ? ' checked' : ''}> ${esc(T('colorer les lignes sans source'))}</label>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="layout.date"${L.date !== false ? ' checked' : ''}> ${esc(T('la date du jour sous le titre'))}</label>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="layout.numbers"${L.numbers ? ' checked' : ''}> ${esc(T('le numéro de la fiche à côté du nom (PDF)'))}</label></div>
                <div class="rt-step"><h3><i>5</i> ${esc(T('Vie privée et export'))}</h3>
                    <p class="rt-priv" data-rt-priv>${privHtml()}</p>
                    <label class="checkbox-line"><input type="checkbox" data-rt-f="privacy.keep_living"${d.privacy.keep_living && !m.privacy_mode ? ' checked' : ''}${m.privacy_mode ? ' disabled' : ''}> ${esc(T('garder les vivants et les fiches 🔒 (pour moi seulement)'))}</label>
                    ${m.privacy_mode ? `<small class="muted">${esc(T('Le mode confidentialité est allumé (Réglages → Export) : ils sont toujours retirés.'))}</small>` : ''}</div>`;
        };
        function privHtml() {
            const r = st.data?.removed || {living: 0, private: 0};
            if (st.data?.kept_living) return esc(T('Vivants et fiches 🔒 : gardés. Ne partage pas ce rapport.'));
            return `${esc(T('Vivants : retirés · fiches 🔒 : retirées'))}${r.living + r.private ? ` <small class="muted">(${esc(T('{n} lignes retirées', {n: r.living + r.private}))})</small>` : ''}`;
        }
        const previewInfo = () => {
            if (st.loading) return esc(T('Calcul…'));
            if (st.err) return `<span class="rt-err">${esc(st.err)}</span>`;
            if (!st.data) return '';
            const r = buildReport(st.def, st.data.rows);
            return esc([T('Aperçu'), T('{n} {u}', {n: r.total, u: unitOf(st.def, r.total)}), st.def.group.col ? T('{n} groupes', {n: r.groups.length}) : '', T('calculé en {s} s', {s: fmtNum((st.data.ms || 0) / 1000)}), st.data.truncated ? T('liste coupée : les 3 000 premières lignes') : ''].filter(Boolean).join(' · '));
        };
        const paint = () => {
            host.innerHTML = `<section class="page rt-page" data-rt-builder>${header()}<div class="rt-builder"><aside class="rt-side">${side()}</aside>
                <div class="rt-main"><div class="rt-info" data-rt-info>${previewInfo()}</div><div class="rt-sheet" data-rt-sheet></div></div></div></section>`;
            paintPreview(); bind();
        };
        const paintPreview = () => {
            const sh = host.querySelector('[data-rt-sheet]'), info = host.querySelector('[data-rt-info]'), pv = host.querySelector('[data-rt-priv]');
            if (info) info.innerHTML = previewInfo();
            if (pv) pv.innerHTML = privHtml();
            if (!sh) return;
            if (!st.data) { sh.innerHTML = UI().spinner ? UI().spinner(T('Aperçu…')) : ''; return; }
            sh.classList.toggle('is-landscape', st.def.layout.orientation === 'landscape');
            sh.innerHTML = reportBody(st.def, st.data, {columns: cols(), name: st.name, print: true});
        };
        let seq = 0;
        const load = async () => {
            const my = ++seq; st.loading = true; st.err = ''; paintPreview();
            try { const r = await get('rt_report_rows', {def: JSON.stringify(st.def), ...privacyQuery()}); if (my !== seq) return; st.data = r; st.whoKey = whoKey(); }
            catch (e) { if (my !== seq) return; st.err = e.message; }
            st.loading = false; paintPreview();
        };
        let timer = 0;
        const changed = (repaint = false) => { if (repaint) paint(); clearTimeout(timer); timer = setTimeout(() => { if (whoKey() !== st.whoKey || !st.data) load(); else paintPreview(); }, 250); };
        const setPath = (path, v) => { const ks = path.split('.'); let o = st.def; ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks[ks.length - 1]] = v; };
        function bind() {
            const page = host.querySelector('[data-rt-builder]');
            bindRules(page.querySelector('[data-rt-rulebox]'), st.def.rules, rep => changed(rep));
            page.addEventListener('input', e => { const f = e.target.dataset.rtF; if (f && e.target.type !== 'checkbox' && e.target.tagName === 'INPUT') { setPath(f, e.target.value); changed(); } });
            page.addEventListener('change', e => {
                const t = e.target, d = st.def;
                if (t.dataset.rtF) { setPath(t.dataset.rtF, t.type === 'checkbox' ? t.checked : t.value); return changed(t.dataset.rtF === 'group.col'); }
                if (t.matches('[data-rt-start]')) { const v = t.value; d.start = {search: v[0] === 's' ? Number(v.slice(1)) : 0, list: v[0] === 'l' ? Number(v.slice(1)) : 0}; return changed(); }
                if (t.name === 'rt-match') { d.match = t.value; return changed(); }
                if (t.matches('[data-rt-addcol]')) { if (t.value && !d.columns.includes(t.value)) d.columns.push(t.value); return changed(true); }
                if (t.dataset.rtSort !== undefined || t.dataset.rtSortdir !== undefined) {
                    const s = [0, 1].map(i => ({col: page.querySelector(`[data-rt-sort="${i}"]`).value, dir: page.querySelector(`[data-rt-sortdir="${i}"]`).value})).filter(x => x.col);
                    d.sort = s; return changed();
                }
            });
            page.addEventListener('click', async e => {
                const b = e.target.closest('button'); if (!b) return; const d = st.def;
                if (b.dataset.rtSource) { if (b.dataset.rtSource !== d.source) { const nd = blankDef(b.dataset.rtSource); nd.layout = d.layout; nd.privacy = d.privacy; st.def = nd; st.data = null; } return changed(true); }
                if (b.dataset.rtOrient) { d.layout.orientation = b.dataset.rtOrient; return changed(true); }
                const li = b.closest('[data-rt-col]');
                if (li) { const i = Number(li.dataset.rtCol); if (b.hasAttribute('data-rt-coldel')) d.columns.splice(i, 1); else { const j = b.hasAttribute('data-rt-colup') ? i - 1 : i + 1; if (j >= 0 && j < d.columns.length) [d.columns[i], d.columns[j]] = [d.columns[j], d.columns[i]]; } return changed(true); }
                if (b.hasAttribute('data-rt-back')) return openTab('rapports');
                if (b.hasAttribute('data-rt-save')) return save();
                if (b.hasAttribute('data-rt-print')) return print();
                if (b.hasAttribute('data-rt-export')) return exportMenu(b);
            });
        }
        const ready = async () => { if (!st.data || whoKey() !== st.whoKey) await load(); if (st.err) { toast(st.err, 'error'); return false; } return true; };
        const title = () => st.def.layout.title || st.name || T('Rapport');
        async function save() {
            const nm = st.name || st.def.layout.title || (await A().askText?.({title: T('Nom du rapport'), message: T('Sous quel nom le retrouver dans « Mes rapports » ?'), value: '', okLabel: T('Enregistrer')}));
            if (!nm || !String(nm).trim()) return;
            try { const r = await post('rt_saved_save', {id: st.id, kind: 'report', name: String(nm).trim(), icon: st.icon, definition: st.def}); st.id = r.id; st.name = String(nm).trim(); META = null; toast(T('Rapport enregistré dans « Mes rapports ».')); const h = host.querySelector('.page-header h2'); if (h) h.lastChild.textContent = st.name; }
            catch (e) { toast(e.message, 'error'); }
        }
        async function print() {
            if (!await ready()) return;
            const o = {columns: cols(), name: st.name, print: true};
            if (UI().openPrintDialog) return UI().openPrintDialog({title: title(), icon: '📊', key: 'rapport', photos: false, paper: st.def.layout.paper, orientation: st.def.layout.orientation, html: reportDoc(st.def, st.data, o)});
            toast(T('L’impression n’est pas disponible ici.'), 'error');
        }
        async function exportMenu(btn) {
            const items = [
                {icon: '📄', label: T('CSV (tableur, Excel)'), run: async () => { if (await ready()) download(reportCsv(st.def, st.data, {columns: cols(), csvSafe: A().csvSafe}), `${slug(title())}.csv`, 'text/csv'); }},
                {icon: '🌐', label: T('Page HTML'), help: T('les noms restent des liens vers les fiches'), run: async () => { if (await ready()) download(reportDoc(st.def, st.data, {columns: cols(), name: st.name, appUrl: appUrl()}), `${slug(title())}.html`, 'text/html'); }},
                ...(ext.openRowsInSheet ? [{icon: '🧾', label: T('Ouvrir dans le tableur'), run: async () => { if (await ready()) ext.openRowsInSheet({name: title(), rows: reportMatrix(st.def, st.data, cols())}); }}] : []),
                {icon: '📤', label: T('Fichier .lcnda-rapport (pour un cousin)'), help: T('les réglages seulement, sans tes données'), run: async () => { if (!st.id) { toast(T('Enregistre d’abord le rapport (💾).'), 'info'); return; } try { await exportSaved(st.id); } catch (e) { toast(e.message, 'error'); } }},
            ];
            if (UI().menuAt) UI().menuAt(btn, items, {title: T('Exporter le rapport')}); else items[0].run();
        }
        paint(); load();
        host._rt = st; // pour les essais
    }

    /* ═════════════ 🧰 Traitements en lot ═════════════ */
    async function openBatch({id = 0} = {}) {
        const host = ws(); if (!host) return;
        const token = A().state ? ++A().state.workspaceToken : 0;
        host.innerHTML = `<section class="page rt-page">${UI().spinner ? UI().spinner(T('Chargement…')) : ''}</section>`;
        let m, saved = null;
        try { m = await meta(true); if (id) saved = await get('rt_saved_get', {id}); }
        catch (e) { toast(e.message, 'error'); return openTab('traitements'); }
        if (A().state && token !== A().state.workspaceToken) return;
        const st = {id, name: saved?.name || '', steps: saved?.definition?.steps || [], who: {mode: 'all', match: 'all', rules: [], list: 0, search: 0, ...(saved?.definition?.who || {})},
            cur: {op: 'place_abbrev', params: {...OPS[0].params}}, editing: -1, preview: null, skip: new Set(), done: null, loading: false};
        const recipe = () => ({steps: st.steps.length ? st.steps : [st.cur], who: st.who});
        const header = () => (UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · ${T('Outils de modification')}`, icon: '🧰', title: st.name || T('Traitements en lot'), detail: true,
            back: `<button type="button" class="link-button" data-rb-back>← ${esc(T('Traitements en lot'))}</button>`,
            help: esc(T('Des gestes connus, toujours montrés avant, ligne par ligne : régler → voir l’aperçu → décocher les exceptions → appliquer (sauvegarde automatique juste avant) → ↶ possible.')),
            more: st.id ? [`<button type="button" data-rb-export>⤓ ${esc(T('Fichier .lcnda-rapport (pour un cousin)'))}</button>`] : []}) : `<h2>🧰 ${esc(T('Traitements en lot'))}</h2>`);
        const chk = (k, label, p = st.cur.params) => `<label class="checkbox-line"><input type="checkbox" data-rb-p="${k}"${p[k] ? ' checked' : ''}> ${esc(T(label))}</label>`;
        const inp = (k, label, ph = '', p = st.cur.params) => `<label class="rt-lab">${esc(T(label))} <input data-rb-p="${k}" value="${esc(p[k] ?? '')}" placeholder="${esc(ph)}" maxlength="120"></label>`;
        const paramsHtml = () => {
            const p = st.cur.params;
            switch (st.cur.op) {
                case 'place_abbrev': return `<div class="rt-row">${inp('find', 'Remplacer', 'St')}${inp('replace', 'par', 'Saint')}</div><div class="rt-chips">${[['St', 'Saint'], ['Ste', 'Sainte'], ['Mt', 'Mont'], ['Gd', 'Grand']].map(([a, b]) => `<button type="button" class="button small secondary" data-rb-preset="${esc(a)}|${esc(b)}">${esc(a)} → ${esc(b)}</button>`).join('')}</div><small class="muted">${esc(T('mot entier, point facultatif (« St. ») ; suivi d’un nom, un tiret est mis : « St Martial » → « Saint-Martial »'))}</small>`;
                case 'place_text': return `<div class="rt-row">${inp('find', 'Remplacer')}${inp('replace', 'par')}</div>${chk('word', 'mot entier')}${chk('case', 'respecter les majuscules')}`;
                case 'place_county': return `<div class="rt-match"><label class="radio-line"><input type="radio" name="rb-cmode" value="auto"${p.mode !== 'value' ? ' checked' : ''}> ${esc(T('d’après un autre lieu du même nom (seulement s’il n’y a qu’un département possible)'))}</label><label class="radio-line"><input type="radio" name="rb-cmode" value="value"${p.mode === 'value' ? ' checked' : ''}> ${esc(T('celui que j’écris'))}</label></div>
                    ${p.mode === 'value' ? `<div class="rt-row">${inp('value', 'Département', 'Corrèze')}${inp('contains', 'pour les lieux dont le nom contient (facultatif)')}</div>` : ''}${inp('country', 'Pays à mettre s’il manque (facultatif)', 'France')}`;
                case 'place_split': return `<p class="muted">${esc(T('Seulement les lieux sans département dont le nom contient des virgules. Vérifie l’aperçu : « Rue Saint-Pierre, Tulle » serait aussi découpé (décoche-le).'))}</p>`;
                case 'place_merge': return `<p class="muted">${esc(T('Même nom (majuscules, tirets et espaces mis à part) et même département ; un lieu sans département rejoint le seul département connu pour ce nom. Deux lieux à plus de 10 km ne sont jamais fusionnés.'))}</p>`;
                case 'dates_vers': return chk('before_after', 'aussi « bef. », « av. » → « avant », « aft. », « ap. » → « après », « bet. … and … » → « entre … et … »');
                case 'names_case': return `<div class="rt-row"><label class="rt-lab">${esc(T('Quoi'))} <select data-rb-p="field"><option value="last_name"${p.field !== 'first_name' ? ' selected' : ''}>${esc(T('les noms de famille'))}</option><option value="first_name"${p.field === 'first_name' ? ' selected' : ''}>${esc(T('les prénoms'))}</option></select></label>
                    <label class="rt-lab">${esc(T('Comment'))} <select data-rb-p="mode"><option value="upper"${p.mode !== 'title' ? ' selected' : ''}>${esc(T('MAJUSCULES'))}</option><option value="title"${p.mode === 'title' ? ' selected' : ''}>${esc(T('Capitales (Jean-Pierre, de La Fontaine)'))}</option></select></label></div>`;
                case 'clean': return `${chk('spaces', 'doubles espaces, espaces au début et à la fin')}${chk('punct', 'ponctuation en double (« ,, », « Naves ,Corrèze »)')}${chk('empty', 'vider les champs qui ne contiennent que de la ponctuation')}`;
                case 'label': return inp('name', 'Étiquette', T('Import Paul 2026'));
                default: return '';
            }
        };
        const whoHtml = () => {
            const w = st.who;
            const r = (v, l) => `<label class="radio-line"><input type="radio" name="rb-who" value="${v}"${w.mode === v ? ' checked' : ''}> ${esc(T(l))}</label>`;
            return `${r('all', 'tout le monde')}${r('rules', 'les personnes qui répondent à des critères')}${w.mode === 'rules' ? `<div class="rt-match"><label class="radio-line"><input type="radio" name="rb-match" value="all"${w.match !== 'any' ? ' checked' : ''}> ${esc(T('toutes les conditions (ET)'))}</label><label class="radio-line"><input type="radio" name="rb-match" value="any"${w.match === 'any' ? ' checked' : ''}> ${esc(T('au moins une (OU)'))}</label></div><div data-rb-rulebox>${rulesHtml(w.rules, 'persons', m)}</div>` : ''}
                ${m.lists.length ? `${r('list', 'les personnes d’une de mes listes')}${w.mode === 'list' ? `<select data-rb-list>${m.lists.map(l => `<option value="${l.id}"${Number(w.list) === Number(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}` : ''}
                ${m.searches.length ? `${r('search', 'les personnes d’une recherche enregistrée')}${w.mode === 'search' ? `<select data-rb-search>${m.searches.map(s => `<option value="${s.id}"${Number(w.search) === Number(s.id) ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}` : ''}
                <small class="muted">${esc(T('Pour les lieux : ceux où ces personnes ont un événement.'))}</small>`;
        };
        const chainHtml = () => (st.steps.length ? `<ol class="rt-chain">${st.steps.map((s, i) => `<li data-rb-step="${i}"><span>${esc(opOf(s.op).icon)} ${esc(stepText(s))}</span><span class="rt-chain-act"><button type="button" class="icon-button small" data-rb-stepedit title="${esc(T('Modifier'))}" aria-label="${esc(T('Modifier'))}">✎</button><button type="button" class="icon-button small" data-rb-stepup title="${esc(T('Monter'))}" aria-label="${esc(T('Monter'))}">↑</button><button type="button" class="icon-button small" data-rb-stepdel title="${esc(T('Retirer'))}" aria-label="${esc(T('Retirer'))}">×</button></span></li>`).join('')}</ol>`
            : `<p class="muted">${esc(T('Une suite de traitements, rejouée en un clic : utile après chaque import d’un fichier GEDCOM d’un cousin. Ajoute le traitement réglé ci-dessus, puis d’autres.'))}</p>`);
        const previewHtml = () => {
            const pv = st.preview;
            if (st.loading) return UI().spinner ? UI().spinner(T('Aperçu…')) : '';
            if (st.done) {
                const d = st.done;
                return `<div class="rt-msg is-ok" data-rb-done>✓ ${esc(T('{n} changements faits', {n: d.count}))}${d.merges ? esc(T(', dont {n} fusions de lieux', {n: d.merges})) : ''}${d.labels ? esc(T(', {n} étiquettes posées', {n: d.labels})) : ''}.
                    ${d.locked ? `<br><small>${esc(T('{n} lignes de fiches verrouillées 🔒 laissées telles quelles.', {n: d.locked}))}</small>` : ''}<br><small>${esc(T('Copie de la base faite juste avant : {f}', {f: d.backup}))}</small>
                    <div class="rt-row">${d.undone ? `<span class="muted">${esc(T('Annulé.'))}</span>` : `<button type="button" class="button secondary" data-rb-undo>↶ ${esc(T('Tout annuler'))}</button>`}</div>
                    <small class="muted">${esc(T('« ↶ » remet exactement l’ancien texte, seulement là où personne n’a rien changé depuis. Une ligne déjà retouchée est signalée au lieu d’être écrasée.'))}</small></div>`;
            }
            if (!pv) return '';
            if (!pv.rows.length) return A().emptyState ? A().emptyState({icon: '✓', text: T('Rien à changer'), hint: T('Aucune ligne ne serait modifiée par ce traitement.'), size: 'small'}) : `<p>${esc(T('Rien à changer'))}</p>`;
            const n = pv.rows.filter(r => !r.locked && !st.skip.has(r.key)).length;
            const stepCol = recipe().steps.length > 1;
            return `<div class="rt-pv-bar"><span>${esc(T('{n} lignes seront changées', {n}))}${pv.stats.merges ? ` · ${esc(T('{n} fusions', {n: pv.stats.merges}))}` : ''}${pv.total > pv.shown ? ` · ${esc(T('{n} premières montrées', {n: pv.shown}))}` : ''}</span><span class="spacer"></span><button type="button" class="button small secondary" data-rb-all="1">${esc(T('Tout cocher'))}</button><button type="button" class="button small secondary" data-rb-all="0">${esc(T('Tout décocher'))}</button></div>
                <div class="data-table-wrap rt-pv-wrap"><table class="data-table rt-pv"><thead><tr><th></th>${stepCol ? `<th>${esc(T('Étape'))}</th>` : ''}<th>${esc(T('Où'))}</th><th>${esc(T('Actuel'))}</th><th>${esc(T('Deviendra'))}</th><th>${esc(T('Remarque'))}</th></tr></thead><tbody>
                ${pv.rows.map(r => { const off = r.locked || st.skip.has(r.key); const note = r.locked ? T('🔒 fiche verrouillée : laissée') : r.note === 'fusion' ? T('⚠ ce lieu existe déjà : les deux lieux seront fusionnés') : r.note ? T(r.note) : st.skip.has(r.key) ? T('décoché par toi') : '';
                    return `<tr class="${off ? 'is-off' : ''}" data-rb-row="${esc(r.key)}"><td><input type="checkbox" data-rb-key="${esc(r.key)}"${off ? '' : ' checked'}${r.locked ? ' disabled' : ''} aria-label="${esc(T('Appliquer à cette ligne'))}"></td>${stepCol ? `<td class="n">${r.step + 1}</td>` : ''}
                        <td>${r.person_id ? `<button type="button" class="table-link" data-person-id="${esc(r.person_id)}">${esc(r.who)}</button>` : esc(r.who || (r.events !== null && r.events !== undefined ? T('{n} événements', {n: r.events}) : ''))}</td><td><span class="rt-old">${esc(r.before)}</span></td><td><span class="rt-new">${esc(r.after)}</span></td><td class="muted">${esc(note)}</td></tr>`; }).join('')}</tbody></table></div>
                <div class="rt-msg">💾 ${esc(T('Une sauvegarde de la base est faite juste avant. Le traitement est noté dans le journal.'))}</div>
                <div class="page-actions rt-pv-actions"><button type="button" class="button secondary" data-rb-cancel>${esc(T('Annuler'))}</button><button type="button" class="button secondary" data-rb-keep>💾 ${esc(T('Garder comme recette'))}</button><button type="button" class="button" data-rb-apply${n ? '' : ' disabled'}>${esc(T('Appliquer à {n} lignes', {n}))}</button></div>`;
        };
        const paint = () => {
            const o = opOf(st.cur.op);
            host.innerHTML = `<section class="page rt-page" data-rt-batch>${header()}
                <div class="rt-step"><h3><i>1</i> ${esc(T('Choisir un traitement'))}</h3><div class="rt-ops">${OPS.map(x => `<button type="button" class="rt-op${x.op === st.cur.op ? ' is-on' : ''}" data-rb-op="${x.op}" aria-pressed="${x.op === st.cur.op}"><b>${esc(x.icon)} ${esc(T(x.name))}</b><small>${esc(T(x.desc))}</small></button>`).join('')}</div>
                    <div class="rt-params"><h4>${esc(o.icon)} ${esc(T(o.name))}</h4>${paramsHtml()}<div class="rt-row"><button type="button" class="button small secondary" data-rb-addstep>${st.editing >= 0 ? `✓ ${esc(T('Enregistrer l’étape {n}', {n: st.editing + 1}))}` : esc(T('＋ Ajouter à la recette'))}</button></div></div></div>
                <div class="rt-step"><h3>📋 ${esc(T('Recette'))} <span class="badge">${esc(T('{n} étapes', {n: st.steps.length}))}</span></h3>${chainHtml()}</div>
                <div class="rt-step"><h3><i>2</i> ${esc(T('Sur qui ?'))}</h3><div class="rt-who">${whoHtml()}</div></div>
                <div class="rt-step"><h3><i>3</i> ${esc(T('Aperçu ligne par ligne'))}</h3><div class="rt-row"><button type="button" class="button" data-rb-preview>👁 ${esc(st.steps.length ? T('Voir l’aperçu des {n} étapes', {n: st.steps.length}) : T('Voir l’aperçu'))}</button></div><div data-rb-pv>${previewHtml()}</div></div></section>`;
            bind();
        };
        const repaintPv = () => { const b = host.querySelector('[data-rb-pv]'); if (b) b.innerHTML = previewHtml(); };
        const stale = () => { if (st.preview || st.done) { st.preview = null; st.done = null; st.skip.clear(); repaintPv(); } };
        async function runPreview() {
            st.loading = true; st.done = null; st.skip.clear(); repaintPv();
            try { st.preview = await get('rt_batch_preview', {def: JSON.stringify(recipe())}); }
            catch (e) { st.preview = null; toast(e.message, 'error'); }
            st.loading = false; repaintPv();
        }
        async function apply() {
            const pv = st.preview; if (!pv) return;
            const btn = host.querySelector('[data-rb-apply]'); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>${esc(T('Sauvegarde puis traitement…'))}`; }
            try {
                const r = await post('rt_batch_apply', {def: recipe(), skip: [...st.skip]});
                st.preview = null; st.done = r; repaintPv();
                if (r.undo_id) {
                    A().undoToast?.(T('Traitement en lot : {n} changements.', {n: r.count}), {icon: '🧰', undo: async () => { const u = await post('rt_undo', {id: r.undo_id}); if (st.done === r) { r.undone = true; repaintPv(); } if (u?.kept) toast(T('{n} lignes retouchées depuis : laissées telles quelles.', {n: u.kept}), 'info'); return u?.already ? {already: true} : undefined; },
                        redo: async () => { await post('rt_redo', {id: r.undo_id}); if (st.done === r) { r.undone = false; repaintPv(); } }});
                } else toast(T('Rien n’a été changé.'));
            } catch (e) { toast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = T('Appliquer'); } }
        }
        async function keepRecipe() {
            const nm = st.name || (await A().askText?.({title: T('Nom de la recette'), message: T('Sous quel nom la rejouer plus tard ?'), value: T('Après un import'), okLabel: T('Enregistrer')}));
            if (!nm || !String(nm).trim()) return;
            try { const r = await post('rt_saved_save', {id: st.id, kind: 'recipe', name: String(nm).trim(), definition: recipe()}); st.id = r.id; st.name = String(nm).trim(); if (!st.steps.length) st.steps = [JSON.parse(JSON.stringify(st.cur))]; META = null; toast(T('Recette enregistrée : « {n} ».', {n: st.name})); const keepPv = st.preview, keepDone = st.done; paint(); st.preview = keepPv; st.done = keepDone; repaintPv(); }
            catch (e) { toast(e.message, 'error'); }
        }
        function bind() {
            const page = host.querySelector('[data-rt-batch]');
            const rb = page.querySelector('[data-rb-rulebox]'); if (rb) bindRules(rb, st.who.rules, rep => { stale(); if (rep) paint(); });
            page.addEventListener('input', e => { const k = e.target.dataset.rbP; if (k && e.target.type !== 'checkbox' && e.target.tagName === 'INPUT') { st.cur.params[k] = e.target.value; stale(); } });
            page.addEventListener('change', e => {
                const t = e.target;
                if (t.dataset.rbP) { st.cur.params[t.dataset.rbP] = t.type === 'checkbox' ? t.checked : t.value; stale(); return; }
                if (t.name === 'rb-cmode') { st.cur.params.mode = t.value; stale(); return paint(); }
                if (t.name === 'rb-who') { st.who.mode = t.value; if (t.value === 'list' && !st.who.list) st.who.list = Number(m.lists[0]?.id || 0); if (t.value === 'search' && !st.who.search) st.who.search = Number(m.searches[0]?.id || 0); stale(); return paint(); }
                if (t.name === 'rb-match') { st.who.match = t.value; stale(); return; }
                if (t.matches('[data-rb-list]')) { st.who.list = Number(t.value); stale(); return; }
                if (t.matches('[data-rb-search]')) { st.who.search = Number(t.value); stale(); return; }
                if (t.dataset.rbKey) { if (t.checked) st.skip.delete(t.dataset.rbKey); else st.skip.add(t.dataset.rbKey); const s = st.preview; const y = host.querySelector('[data-rb-pv]').scrollTop; repaintPv(); host.querySelector('[data-rb-pv]').scrollTop = y; void s; }
            });
            page.addEventListener('click', async e => {
                const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
                if (d.rbOp) { st.cur = {op: d.rbOp, params: {...opOf(d.rbOp).params}}; st.editing = -1; stale(); return paint(); }
                if (d.rbPreset) { const [a, c] = d.rbPreset.split('|'); st.cur.params.find = a; st.cur.params.replace = c; stale(); return paint(); }
                if (d.rbAddstep !== undefined) {
                    if (['place_abbrev', 'place_text'].includes(st.cur.op) && !String(st.cur.params.find || '').trim()) return UI().fail ? UI().fail(page.querySelector('[data-rb-p="find"]'), T('Tape le texte à remplacer.')) : toast(T('Tape le texte à remplacer.'), 'error');
                    if (st.cur.op === 'label' && !String(st.cur.params.name || '').trim()) return UI().fail ? UI().fail(page.querySelector('[data-rb-p="name"]'), T('Écris le nom de l’étiquette.')) : toast(T('Écris le nom de l’étiquette.'), 'error');
                    const step = JSON.parse(JSON.stringify(st.cur));
                    if (st.editing >= 0) st.steps[st.editing] = step; else st.steps.push(step);
                    st.editing = -1; stale(); return paint();
                }
                const li = b.closest('[data-rb-step]');
                if (li) { const i = Number(li.dataset.rbStep);
                    if (d.rbStepdel !== undefined) { const gone = st.steps.splice(i, 1)[0]; stale(); paint(); A().undoToast?.(T('Étape retirée de la recette.'), {undo: () => { st.steps.splice(i, 0, gone); paint(); }}); return; }
                    if (d.rbStepup !== undefined && i > 0) { [st.steps[i - 1], st.steps[i]] = [st.steps[i], st.steps[i - 1]]; stale(); return paint(); }
                    if (d.rbStepedit !== undefined) { st.cur = JSON.parse(JSON.stringify(st.steps[i])); st.editing = i; return paint(); }
                    return;
                }
                if (d.rbPreview !== undefined) return runPreview();
                if (d.rbAll !== undefined) { st.skip.clear(); if (d.rbAll === '0') st.preview?.rows.forEach(r => { if (!r.locked) st.skip.add(r.key); }); return repaintPv(); }
                if (d.rbApply !== undefined) return apply();
                if (d.rbCancel !== undefined) { st.preview = null; st.skip.clear(); return repaintPv(); }
                if (d.rbKeep !== undefined) return keepRecipe();
                if (d.rbUndo !== undefined && st.done?.undo_id) { try { const u = await post('rt_undo', {id: st.done.undo_id}); st.done.undone = true; repaintPv(); toast(u?.kept ? T('Annulé ; {n} lignes retouchées depuis : laissées telles quelles.', {n: u.kept}) : T('Tout est revenu comme avant.')); } catch (err) { toast(err.message, 'error'); } return; }
                if (d.rbBack !== undefined) return openTab('traitements');
                if (d.rbExport !== undefined) { try { await exportSaved(st.id); } catch (err) { toast(err.message, 'error'); } return; }
                if (d.personId) return A().openPersonById?.(Number(d.personId));
            });
        }
        paint();
        host._rb = st; // pour les essais
    }
})(typeof window !== 'undefined' ? window : globalThis);
