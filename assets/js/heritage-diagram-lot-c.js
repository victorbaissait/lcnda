/* LCNDA — 📊 Trois diagrammes de recherche (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  🗓️ censusgrid : grille des recensements — une ligne par personne, une colonne par recensement (1836 → 1936) : trouvé,
 *     non trouvé, à chercher, pas encore né, déjà décédé, hors de France ; un clic sur une case ouvre la fiche ; « liste de
 *     travail » à imprimer (ce qui reste à chercher) ;
 *  ⚖️ proofmap : schéma de preuve — la question, les indices pour et contre (poids, source), les recherches et les conflits,
 *     la conclusion et sa certitude ; un dossier de preuve (heritage-preuve.js) ou une hypothèse à comparer (ses réponses) ;
 *  🌿 wordtree : arbre de mots des actes — ce qui suit (ou précède) « fils de », « veuve de »… dans les transcriptions.
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Le tableau des données reste à la main (saisie, tableau collé, CSV) ; « Depuis l'app » le remplit une fois (api.php?action=
 * diagram_lot_c, lib/diagram_lot_c.php) avec le groupe de personnes, la période et les critères « ＋ Critère » communs
 * (heritage-diagram-options.js), puis chaque ligne se corrige, s'ajoute ou se retire sans être écrasée.
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => { const n = typeof v === 'number' ? v : R.num ? R.num(v) : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const color = (c, d) => R.color(c, d);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}), fmt = n => NF.format(Number(n) || 0);
    const pl = (n, one, many = '') => A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', op = 0, style = '', rot = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${esc(fill)}"${op ? ` fill-opacity="${op}"` : ''}${style ? ` font-style="${esc(style)}"` : ''}${rot ? ` transform="rotate(${r2(rot)} ${r2(x)} ${r2(y)})"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rowsOf = (spec, max = 4000) => (Array.isArray(spec.rows) ? spec.rows : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, max);
    const str = (v, n = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, '\'').trim();
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => { msg = i18n(msg); return {h: 60, svg: T(W / 2, 30, cut(msg, W - 8, fs), {anchor: 'middle', size: fs, fill: '#888888'}), legend: [], desc: msg}; };
    const yearOf = v => { const m = String(v ?? '').match(/(?:^|\D)(\d{3,4})(?!\d)/); return m ? Number(m[1]) : null; };
    /** un texte coupé en lignes qui tiennent dans max pixels (au plus n lignes, la dernière avec « … ») */
    function wrap(s, max, fs, n = 4) {
        const words = str(s, 600).split(' ').filter(Boolean), out = []; let line = '';
        for (const w of words) { const t = line ? line + ' ' + w : w; if (textW(t, fs) <= max || !line) line = t; else { out.push(line); line = w; if (out.length >= n) break; } }
        if (line && out.length < n) out.push(line);
        if (out.length === n && words.join(' ') !== out.join(' ')) out[n - 1] = cut(out[n - 1] + ' …', max, fs);
        return out.map(l => cut(l, max, fs));
    }

    /* ═════════ 🗓️ La grille des recensements ═════════ */
    const CENSUS_YEARS = [1801, 1806, 1811, 1821, 1826, 1831, 1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936, 1946, 1954, 1962, 1968, 1975, 1982, 1990, 1999];
    // statut → [nom, signe, couleur par défaut, option de couleur]
    const ST = {found: ['Trouvé', '✓', '#59a14f', 'foundColor'], not_found: ['Non trouvé', '✗', '#e15759', 'missColor'], todo: ['À chercher', '?', '#f2b447', 'todoColor'],
        abroad: ['Hors de France', '✈', '#76b7b2', 'abroadColor'], not_born: ['Pas encore né', '·', '#c9ccd1', 'outColor'], dead: ['Déjà décédé', '†', '#c9ccd1', 'outColor']};
    const ST_ORDER = ['found', 'not_found', 'todo', 'abroad', 'not_born', 'dead'];
    const ST_WORDS = {found: ['found', 'trouve', 'trouvé', 'ok', 'oui', 'x', '✓', 'v'], not_found: ['not_found', 'non trouve', 'non trouvé', 'pas trouve', 'pas trouvé', 'absent', 'non', '✗'],
        todo: ['todo', 'a chercher', 'à chercher', '?', ''], abroad: ['abroad', 'not_in_france', 'not_france', 'left_france', 'hors de france', 'pas en france', 'plus en france', 'pas encore en france', '✈'],
        not_born: ['not_born', 'pas ne', 'pas né', 'pas encore ne', 'pas encore né', '·'], dead: ['dead', 'decede', 'décédé', 'deja decede', 'déjà décédé', '†']};
    const statusOf = v => { const f = fold(v); return ST_ORDER.find(k => ST_WORDS[k].some(w => fold(w) === f) || fold(i18n(ST[k][0])) === f) || 'todo'; };
    /** les années montrées : la liste écrite à la main, sinon les recensements officiels entre « de » et « à » (plus les années du tableau) */
    function censusYears(o, explicit) {
        const own = String(o.years ?? '').split(/[\s,;]+/).map(Number).filter(y => Number.isInteger(y) && y >= 1500 && y <= 2100);
        if (own.length) return [...new Set(own)].sort((a, b) => a - b).slice(0, 60);
        const a = clamp(num(o.from) || 1836, 1500, 2100), b = clamp(num(o.to) || 1936, 1500, 2100), lo = Math.min(a, b), hi = Math.max(a, b);
        return [...new Set([...CENSUS_YEARS.filter(y => y >= lo && y <= hi), ...explicit.filter(y => y >= lo && y <= hi)])].sort((x, y) => x - y).slice(0, 60);
    }
    /** les personnes du tableau, dans l'ordre : {name, born, died, pid, note, cells: Map(année → {st, note, cid})} */
    function censusPeople(spec) {
        const by = new Map();
        rowsOf(spec).forEach(r => {
            const name = str(r.person, 80); if (!name) return;
            const p = by.get(name) || {name, born: null, died: null, pid: 0, note: '', cells: new Map()}; by.set(name, p);
            const b = yearOf(r.born), d = yearOf(r.died), pid = Math.round(num(r.pid)); if (b !== null && p.born === null) p.born = b; if (d !== null && p.died === null) p.died = d; if (pid > 0 && !p.pid) p.pid = pid;
            const y = yearOf(r.year);
            if (y === null) { if (r.note && !p.note) p.note = str(r.note, 60); return; }
            p.cells.set(y, {st: statusOf(r.status), note: str(r.note, 100), cid: Math.round(num(r.cid)) || 0});
        });
        return [...by.values()].slice(0, 400);
    }
    const cellOf = (p, y) => p.cells.get(y) || {st: p.born !== null && y < p.born ? 'not_born' : p.died !== null && y > p.died ? 'dead' : 'todo', note: '', auto: true};
    function censusgrid(spec, W, fs) {
        const o = spec.o || {}; let people = censusPeople(spec);
        if (!people.length) return empty(W, fs, 'Ajoute des personnes (nom, naissance, décès), puis leurs recensements (année, statut).');
        const years = censusYears(o, [...new Set(people.flatMap(p => [...p.cells.keys()]))]);
        if (!years.length) return empty(W, fs, 'Aucune année de recensement entre ces deux dates.');
        const todoN = p => years.filter(y => cellOf(p, y).st === 'todo').length;
        if (o.only === 'todo') people = people.filter(p => todoN(p) > 0);
        if (o.sort === 'todo') people = [...people].sort((a, b) => todoN(b) - todoN(a)); else if (o.sort === 'name') people = [...people].sort((a, b) => a.name.localeCompare(b.name, 'fr')); else if (o.sort === 'birth') people = [...people].sort((a, b) => (a.born ?? 9999) - (b.born ?? 9999));
        const colOf = k => color(o[ST[k][3]], ST[k][2]), counts = Object.fromEntries(ST_ORDER.map(k => [k, 0]));
        people.forEach(p => years.forEach(y => { counts[cellOf(p, y).st]++; }));
        const legend = ST_ORDER.filter(k => counts[k]).map(k => ({label: `${i18n(ST[k][0])} (${counts[k]})`, color: colOf(k)}));
        const life = p => p.born !== null || p.died !== null ? `${p.born ?? '?'}–${p.died ?? ''}` : '';
        if (!people.length) return {...empty(W, fs, 'Plus rien à chercher : tous les recensements sont trouvés ou sans objet.'), legend};
        // ── la liste de travail (à imprimer) : ce qui reste à chercher, personne par personne
        if (o.layout === 'list') {
            const lh = fs * 1.55; let y = fs, svg = '';
            people.forEach(p => { const todo = years.filter(yy => cellOf(p, yy).st === 'todo'), miss = years.filter(yy => cellOf(p, yy).st === 'not_found'); if (!todo.length && !miss.length) return;
                svg += `<rect x="2" y="${r2(y - fs * .45)}" width="${r2(fs * .9)}" height="${r2(fs * .9)}" rx="2" fill="none" stroke="currentColor" stroke-opacity=".6"/>`
                    + T(fs * 1.5, y, cut(`${p.name}${life(p) ? ` (${life(p)})` : ''}`, W * .42, fs * .92), {size: fs * .92, weight: 700});
                const rest = [todo.length ? i18n('à chercher : {list}', {list: todo.join(', ')}) : '', miss.length ? i18n('non trouvés : {list}', {list: miss.join(', ')}) : ''].filter(Boolean).join(' · ');
                wrap(rest, W * .56, fs * .85, 3).forEach((l, i) => { svg += T(W * .44, y + i * fs * 1.15, l, {size: fs * .85, fill: i ? 'currentColor' : colOf('todo') === '#f2b447' ? 'currentColor' : colOf('todo')}); });
                y += Math.max(lh, wrap(rest, W * .56, fs * .85, 3).length * fs * 1.15 + fs * .4); });
            return {h: Math.max(40, y), svg, legend, desc: i18n('Liste de travail des recensements : {n}.', {n: pl(people.length, 'personne')})};
        }
        // ── la grille
        const nameFs = fs * .85, labW0 = Math.max(...people.map(p => textW(p.name, nameFs))) + fs * (o.lifeYears !== false ? 4.6 : 1);
        let labW = clamp(labW0, fs * 5, W * .42), colW = (W - labW - 4) / years.length;
        const minCol = fs * 1.05; if (colW < minCol) { labW = Math.max(fs * 4, W - 4 - minCol * years.length); colW = Math.max(fs * .6, (W - labW - 4) / years.length); }
        colW = Math.min(colW, fs * 3.4);
        const rowH = clamp(num(o.rowHeight) || fs * 1.75, fs * 1.1, 60), gap = clamp(num(o.gap ?? 2), 0, 8), rotate = colW < textW('1836', fs * .72) + 6;
        const top = rotate ? textW('1836', fs * .72) + fs * .8 : fs * 1.6, x0 = labW + 2;
        let svg = '';
        years.forEach((y, j) => { const cx = x0 + j * colW + colW / 2; svg += rotate ? T(cx + fs * .2, top - fs * .3, String(y), {size: fs * .72, anchor: 'start', rot: -60, op: .8}) : T(cx, top - fs * .7, String(y), {size: fs * .72, anchor: 'middle', op: .8, weight: 600}); });
        const symbols = o.symbols !== false && colW >= fs * 1.05 && rowH >= fs * 1.05;
        people.forEach((p, i) => {
            const y = top + i * rowH;
            if (o.stripes !== false && i % 2) svg += `<rect x="0" y="${r2(y)}" width="${r2(x0 + years.length * colW)}" height="${r2(rowH)}" fill="currentColor" fill-opacity=".04"/>`;
            const lf = life(p), nameMax = labW - (o.lifeYears !== false && lf ? textW(lf, fs * .68) + fs * .7 : fs * .5);
            svg += `<g${p.pid ? ` data-lotc-pid="${p.pid}"` : ''}>${tip(`${p.name}${lf ? ' · ' + lf : ''}${p.note ? ' · ' + p.note : ''}`)}${T(2, y + rowH / 2, cut(p.name, nameMax, nameFs), {size: nameFs, weight: 600})}</g>`;
            if (o.lifeYears !== false && lf) svg += T(labW - 2, y + rowH / 2, lf, {size: fs * .68, anchor: 'end', op: .6});
            years.forEach((yy, j) => {
                const c = cellOf(p, yy), col = colOf(c.st), x = x0 + j * colW, out = c.st === 'not_born' || c.st === 'dead';
                const lab = `${p.name} · ${i18n('Recensement {yr}', {yr: String(yy)})} : ${i18n(ST[c.st][0])}${c.note ? ' — ' + c.note : ''}`;
                svg += `<g class="lotc-cell"${p.pid ? ` data-lotc-pid="${p.pid}" data-lotc-year="${yy}" style="cursor:pointer"` : ''}>${tip(lab)}<rect x="${r2(x + gap / 2)}" y="${r2(y + gap / 2)}" width="${r2(Math.max(1, colW - gap))}" height="${r2(Math.max(1, rowH - gap))}" rx="${r2(Math.min(4, colW / 5))}" fill="${col}" fill-opacity="${out ? .45 : c.auto ? .55 : .95}"${c.auto && c.st === 'todo' ? ` stroke="${col}" stroke-dasharray="2 2"` : ''}/>`
                    + (symbols ? T(x + colW / 2, y + rowH / 2, ST[c.st][1], {size: Math.min(fs * .85, rowH * .6), anchor: 'middle', weight: 700, fill: out ? '#55606e' : contrast(col)}) : '') + '</g>';
            });
        });
        const H = top + people.length * rowH + 4, done = counts.found + counts.not_found + counts.abroad, all = done + counts.todo;
        return {h: Math.max(num(o.height) || 0, H), svg, legend,
            desc: i18n('Grille des recensements : {n}, {y} recensements, {d} sur {t} cherchés.', {n: pl(people.length, 'personne'), y: years.length, d: done, t: all})};
    }
    const sampleCensus = () => {
        const P = [['Jean MAZAUD', 1818, 1884, {1836: 'found', 1841: 'found', 1846: 'not_found', 1851: 'found', 1856: 'found', 1872: 'found'}], ['Marie LACOMBE', 1822, 1899, {1841: 'found', 1846: 'found', 1851: 'found', 1881: 'not_found'}],
            ['Pierre MAZAUD', 1845, 1916, {1846: 'found', 1851: 'found', 1866: 'not_in_france', 1872: 'found', 1886: 'found', 1906: 'found'}], ['Louise FAURIE', 1850, 1931, {1851: 'found', 1872: 'found', 1876: 'found', 1911: 'found'}],
            ['Henri MAZAUD', 1876, 1944, {1876: 'found', 1881: 'found', 1886: 'found', 1906: 'found', 1911: 'found', 1921: 'found', 1926: 'not_found'}], ['Jeanne BESSE', 1880, 1962, {1881: 'found', 1901: 'found', 1906: 'found', 1931: 'found'}]];
        const rows = []; P.forEach(([person, born, died, cells]) => { rows.push({person, born, died}); Object.entries(cells).forEach(([year, status]) => rows.push({person, year, status})); });
        return {o: {title: i18n('Les recensements de la famille {name}', {name: 'MAZAUD'}), from: 1836, to: 1936}, rows};
    };

    /* ═════════ ⚖️ Le schéma de preuve ═════════ */
    const PARTS = {for: ['Pour', '#59a14f', 'forColor'], against: ['Contre', '#e15759', 'againstColor'], research: ['Recherche', '#8b8f97', 'todoColor'], conflict: ['Conflit', '#f28e2b', 'conflictColor'], answer: ['Réponse', '#4e79a7', 'answerColor']};
    const PART_WORDS = {for: ['for', 'pour', 'oui', '+', 'confirme'], against: ['against', 'contre', 'non', '-', '−', 'contredit'], research: ['research', 'recherche', 'recherches', 'a chercher', 'à chercher', 'todo'],
        conflict: ['conflict', 'conflit', 'conflits'], answer: ['answer', 'reponse', 'réponse', 'option', 'hypothese', 'hypothèse']};
    const partOf = v => { const f = fold(v); return Object.keys(PART_WORDS).find(k => PART_WORDS[k].some(w => fold(w) === f) || fold(i18n(PARTS[k][0])) === f) || 'for'; };
    const CERT = {proved: ['Prouvé', '#2e7d32'], probable: ['Probable', '#59a14f'], possible: ['Possible', '#f28e2b'], refuted: ['Réfuté', '#c62828'], tocheck: ['À vérifier', '#8b8f97']};
    const CERT_WORDS = {proved: ['proved', 'prouve', 'prouvé'], probable: ['probable'], possible: ['possible'], refuted: ['refuted', 'refute', 'réfuté'], tocheck: ['tocheck', 'a verifier', 'à vérifier', '']};
    const certOf = v => { const f = fold(v); return Object.keys(CERT).find(k => CERT_WORDS[k].some(w => fold(w) === f) || fold(i18n(CERT[k][0])) === f) || 'tocheck'; };
    /** une boîte : fond, bord, lignes de texte (titre gras, source en italique, poids en points) ; rend {svg, h} */
    function box(x, y, w, {text, sub = '', col, fs, weight = 0, bold = false, fill = '', dashed = false, title = '', lines = 4}) {
        const pad = fs * .5, tl = wrap(text, w - pad * 2 - (weight ? fs * 2.2 : 0), fs * (bold ? 1 : .85), lines), sl = sub ? wrap(sub, w - pad * 2, fs * .72, 2) : [];
        const h = pad * 2 + tl.length * fs * (bold ? 1.2 : 1.05) + sl.length * fs * .9 + (sl.length ? fs * .15 : 0);
        const bg = fill || col, ink = fill ? contrast(fill) : 'currentColor';
        let s = `<g>${tip(title || [text, sub].filter(Boolean).join(' — '))}<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(fs * .45)}" fill="${bg}" fill-opacity="${fill ? 1 : .12}" stroke="${col}" stroke-width="${bold ? 2 : 1.3}"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
        let ty = y + pad + fs * (bold ? .6 : .52);
        tl.forEach(l => { s += T(x + pad, ty, l, {size: fs * (bold ? 1 : .85), weight: bold ? 700 : 500, fill: ink}); ty += fs * (bold ? 1.2 : 1.05); });
        sl.forEach(l => { s += T(x + pad, ty + fs * .05, l, {size: fs * .72, style: 'italic', fill: ink, op: .75}); ty += fs * .9; });
        if (weight) { for (let i = 0; i < 3; i++) s += `<circle cx="${r2(x + w - pad - (2 - i) * fs * .62 - fs * .25)}" cy="${r2(y + pad + fs * .45)}" r="${r2(fs * .24)}" fill="${col}" fill-opacity="${i < weight ? 1 : .2}"/>`; }
        return {svg: s + '</g>', h};
    }
    function proofmap(spec, W, fs) {
        const o = spec.o || {}, rows = rowsOf(spec, 300).map(r => ({part: partOf(r.part), text: str(r.text, 400), source: str(r.source, 200), weight: clamp(Math.round(num(r.weight)), 0, 3), answer: str(r.answer, 80), note: str(r.note, 300)})).filter(r => r.text || r.part === 'answer' && r.answer);
        const question = str(o.question || o.title, 300);
        if (!rows.length && !question) return empty(W, fs, 'Écris la question (Réglages), puis les indices : pour, contre, recherches, conflits.');
        const colOf = k => color(o[PARTS[k][2]], PARTS[k][1]), todo = o.todo !== false;
        const answers = [...new Set(rows.filter(r => r.part === 'answer').map(r => r.answer || r.text).concat(rows.filter(r => r.part !== 'answer' && r.answer).map(r => r.answer)))].filter(Boolean).slice(0, 8);
        // les colonnes : une par réponse (hypothèse), sinon Pour | Contre | (Recherches et conflits)
        let cols;
        if (answers.length) cols = answers.map(a => ({key: a, head: a, items: rows.filter(r => r.part !== 'answer' && r.answer === a && (todo || (r.part !== 'research' && r.part !== 'conflict'))).sort((p, q) => (p.part === 'for' ? 0 : 1) - (q.part === 'for' ? 0 : 1) || q.weight - p.weight), answer: true}));
        else {
            cols = [{key: 'for', head: i18n('Indices pour'), items: rows.filter(r => r.part === 'for')}, {key: 'against', head: i18n('Indices contre'), items: rows.filter(r => r.part === 'against')}];
            if (todo && rows.some(r => r.part === 'research' || r.part === 'conflict')) cols.push({key: 'todo', head: i18n('Recherches et conflits'), items: rows.filter(r => r.part === 'research' || r.part === 'conflict')});
            if (!cols[1].items.length && !cols[0].items.length && cols.length === 2) cols = cols.slice(0, 1);
        }
        cols.forEach(c => { c.items = c.items.slice(0, 30); });
        const score = c => c.items.reduce((s, r) => s + (r.part === 'for' ? r.weight || 1 : r.part === 'against' ? -(r.weight || 1) : 0), 0);
        const cert = certOf(o.certainty), certC = color(o.certColor, CERT[cert][1]), concl = str(o.conclusion, 300), chosen = fold(concl);
        const side = o.dir === 'right' && W >= 520, gapX = fs * .9, gapY = fs * .7, qCol = color(o.questionColor, '#1d1d1f');
        const itemBox = (r, x, y, w) => { const c = colOf(r.part), resolved = r.part === 'conflict' && r.note;
            return box(x, y, w, {text: r.text || i18n(PARTS[r.part][0]), sub: [r.source, r.part === 'conflict' ? (resolved ? i18n('Résolu : {note}', {note: r.note}) : i18n('À résoudre')) : r.note].filter(Boolean).join(' · '), col: c, fs, weight: r.part === 'for' || r.part === 'against' ? r.weight : 0, dashed: r.part === 'research' || (r.part === 'conflict' && !resolved),
                title: `${i18n(PARTS[r.part][0])} : ${r.text}${r.source ? ' — ' + r.source : ''}${r.weight ? ' (' + i18n('poids {n} sur 3', {n: r.weight}) + ')' : ''}${r.note ? ' — ' + r.note : ''}`}); };
        const headOf = c => c.answer ? `${c.head}  (${score(c) > 0 ? '+' : ''}${score(c)})` : `${c.head} (${c.items.length})`;
        const headCol = c => c.answer ? (chosen && fold(c.head) === chosen ? certC : colOf('answer')) : c.key === 'todo' ? colOf('research') : colOf(c.key);
        let svg = '', H = 0;
        const conclText = concl || i18n('Pas encore de conclusion');
        const certLabel = `${i18n('Certitude')} : ${i18n(CERT[cert][0])}`;
        if (!side) {
            // ── de haut en bas : la question, les colonnes, la conclusion
            const qw = Math.min(W - 4, Math.max(W * .6, 260)), qx = (W - qw) / 2;
            const q = box(qx, 2, qw, {text: question || i18n('La question'), col: qCol, fill: qCol, fs: fs * 1.05, bold: true, lines: 3}); svg += q.svg;
            const n = cols.length, cw = (W - gapX * (n - 1) - 4) / n, y0 = 2 + q.h + fs * 2.2; let yMax = y0, links = '';
            cols.forEach((c, i) => {
                const x = 2 + i * (cw + gapX), hc = headCol(c), hb = box(x, y0, cw, {text: headOf(c), col: hc, fs, bold: c.answer && chosen && fold(c.head) === chosen, lines: 2, fill: c.answer ? '' : ''});
                links += `<path d="M${r2(W / 2)} ${r2(2 + q.h)}C${r2(W / 2)} ${r2(y0 - fs)} ${r2(x + cw / 2)} ${r2(2 + q.h + fs)} ${r2(x + cw / 2)} ${r2(y0)}" fill="none" stroke="${hc}" stroke-opacity=".55" stroke-width="1.6"/>`;
                svg += hb.svg; let y = y0 + hb.h + gapY;
                c.items.forEach(r => { const b = itemBox(r, x + fs * .5, y, cw - fs * .5); svg += b.svg; links += `<path d="M${r2(x + fs * .2)} ${r2(y - gapY)}V${r2(y + b.h / 2)}H${r2(x + fs * .5)}" fill="none" stroke="${colOf(r.part)}" stroke-opacity=".5"/>`; y += b.h + gapY; });
                if (!c.items.length) { svg += T(x + cw / 2, y + fs * .4, i18n('rien pour l’instant'), {size: fs * .78, anchor: 'middle', op: .55, style: 'italic'}); y += fs * 1.4; }
                c.bottom = y; c.cx = x + cw / 2; yMax = Math.max(yMax, y);
            });
            const cy = yMax + fs * 1.6, cb = box(qx, cy, qw, {text: conclText, sub: certLabel, col: certC, fs, bold: true, lines: 3, dashed: !concl});
            cols.forEach(c => { links += `<path d="M${r2(c.cx)} ${r2(c.bottom - gapY)}C${r2(c.cx)} ${r2(cy - fs)} ${r2(W / 2)} ${r2(c.bottom)} ${r2(W / 2)} ${r2(cy)}" fill="none" stroke="${certC}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="3 3"/>`; });
            svg = links + svg + cb.svg; H = cy + cb.h + 4;
        } else {
            // ── de gauche à droite : la question, les groupes l'un sous l'autre, la conclusion
            const qw = W * .24, mw = W - qw * 2 - gapX * 4, mx = qw + gapX * 2, cx = mx + mw + gapX * 2; let y = 2, links = '';
            const mids = [];
            cols.forEach(c => { const hc = headCol(c), hb = box(mx, y, mw, {text: headOf(c), col: hc, fs, lines: 2, bold: c.answer && chosen && fold(c.head) === chosen}); svg += hb.svg; const top = y; y += hb.h + gapY * .6;
                const iw = (mw - fs * .6 - gapX) / 2; let yl = y, yr = y; // les indices sur deux colonnes
                c.items.forEach((r, k) => { const left = c.items.length < 3 || k % 2 === 0 || yl <= yr, b = itemBox(r, left ? mx + fs * .6 : mx + fs * .6 + iw + gapX, left ? yl : yr, c.items.length < 3 ? mw - fs * .6 : iw); svg += b.svg; if (left || c.items.length < 3) yl += b.h + gapY * .6; else yr += b.h + gapY * .6; });
                y = Math.max(yl, yr) + gapY; mids.push({c, y: (top + y) / 2, col: hc, top}); });
            H = Math.max(y, fs * 8);
            const q = box(2, 0, qw, {text: question || i18n('La question'), col: qCol, fill: qCol, fs: fs * 1.05, bold: true, lines: 6}), qy = (H - q.h) / 2;
            const cb = box(cx, 0, qw - 2, {text: conclText, sub: certLabel, col: certC, fs, bold: true, lines: 6, dashed: !concl}), cyy = (H - cb.h) / 2;
            mids.forEach(m => { links += `<path d="M${r2(2 + qw)} ${r2(qy + q.h / 2)}C${r2(mx - gapX)} ${r2(qy + q.h / 2)} ${r2(qw + gapX)} ${r2(m.top + fs)} ${r2(mx)} ${r2(m.top + fs)}" fill="none" stroke="${m.col}" stroke-opacity=".55" stroke-width="1.6"/>`
                + `<path d="M${r2(mx + mw)} ${r2(m.y)}C${r2(cx - gapX)} ${r2(m.y)} ${r2(mx + mw + gapX)} ${r2(cyy + cb.h / 2)} ${r2(cx)} ${r2(cyy + cb.h / 2)}" fill="none" stroke="${certC}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="3 3"/>`; });
            svg = links + svg + q.svg.replace(/<g>/, `<g transform="translate(0 ${r2(qy)})">`) + cb.svg.replace(/<g>/, `<g transform="translate(0 ${r2(cyy)})">`);
        }
        const nf = rows.filter(r => r.part === 'for').length, na = rows.filter(r => r.part === 'against').length;
        const legend = [{label: i18n('Pour'), color: colOf('for')}, {label: i18n('Contre'), color: colOf('against')}, ...(todo ? [{label: i18n('Recherche'), color: colOf('research')}, {label: i18n('Conflit'), color: colOf('conflict')}] : []), {label: i18n(CERT[cert][0]), color: certC}];
        return {h: Math.max(num(o.height) || 0, H), svg, legend, desc: i18n('Schéma de preuve : {a} pour, {b} contre ; certitude : {c}.', {a: nf, b: na, c: i18n(CERT[cert][0]).toLowerCase()})};
    }
    const sampleProof = () => ({o: {title: i18n('Qui est le père de {name} ?', {name: 'Jean MAZAUD'}), question: i18n('Antoine MAZAUD est-il le père de Jean MAZAUD (né vers 1818) ?'), conclusion: i18n('Oui : Antoine MAZAUD est le père de Jean.'), certainty: 'probable'},
        rows: [['for', i18n('Acte de mariage de Jean (1842) : « fils d’Antoine MAZAUD, cultivateur »'), i18n('Registre paroissial, original'), 3], ['for', i18n('Recensement 1836 : Jean, 18 ans, au foyer d’Antoine'), i18n('Recensement 1836, original'), 2],
            ['for', i18n('Antoine est parrain du premier fils de Jean'), i18n('Baptême 1844'), 1], ['against', i18n('Un autre Jean MAZAUD, né en 1817 au village voisin'), i18n('Table décennale'), 2],
            ['research', i18n('Acte de naissance de Jean : registre lacunaire 1815-1820'), i18n('Archives départementales'), 0], ['conflict', i18n('Âge au décès : 64 ans (né vers 1820) au lieu de 66'), i18n('Acte de décès 1884'), 0, i18n('l’âge déclaré au décès est souvent approximatif')]]
            .map(([part, text, source, weight, note]) => ({part, text, source, weight, note: note || ''}))});

    /* ═════════ 🌿 L'arbre de mots des actes ═════════ */
    const TOK = /[\p{L}\p{N}][\p{L}\p{N}'’-]*|[.;:!?]/gu, STOP = /^[.;:!?]$/;
    const tokens = s => String(s ?? '').slice(0, 20000).match(TOK) || [];
    const wfold = w => fold(w).replace(/’/g, '\'');
    /** l'arbre : {w, n, forms, kids: Map} ; dir = 'after' (ce qui suit) ou 'before' (ce qui précède) */
    function wordTrie(list, rootToks, dir, depth, {lower = true} = {}) {
        const rt = rootToks.map(wfold), n = rt.length, top = {w: rootToks.join(' '), n: 0, kids: new Map()};
        list.forEach(text => {
            const tk = tokens(text), f = tk.map(wfold);
            for (let i = 0; i + n <= tk.length; i++) {
                let ok = true; for (let k = 0; k < n; k++) if (f[i + k] !== rt[k]) { ok = false; break; } if (!ok) continue;
                top.n++; let node = top;
                for (let d = 1; d <= depth; d++) {
                    const j = dir === 'before' ? i - d : i + n - 1 + d; if (j < 0 || j >= tk.length || STOP.test(tk[j])) break;
                    const key = lower ? f[j] : tk[j]; let ch = node.kids.get(key);
                    if (!ch) { ch = {w: tk[j], n: 0, kids: new Map(), forms: new Map()}; node.kids.set(key, ch); }
                    ch.n++; ch.forms.set(tk[j], (ch.forms.get(tk[j]) || 0) + 1); node = ch;
                }
            }
        });
        const best = node => { if (node.forms) node.w = [...node.forms].sort((a, b) => b[1] - a[1])[0][0]; node.kids.forEach(best); };
        top.kids.forEach(best);
        return top;
    }
    function wordtree(spec, W, fs) {
        const o = spec.o || {}, root = str(o.root || 'fils de', 60), rt = tokens(root).filter(t => !STOP.test(t));
        if (!rt.length) return empty(W, fs, 'Écris le mot de départ (Réglages), par exemple « fils de » ou « veuve de ».');
        const place = fold(o.place || ''), from = yearOf(o.from), to = yearOf(o.to);
        const list = rowsOf(spec, 6000).filter(r => { if (place && !fold(`${r.place ?? ''} ${r.source ?? ''}`).includes(place)) return false; const y = yearOf(r.year); if ((from !== null || to !== null) && (y === null || (from !== null && y < from) || (to !== null && y > to))) return false; return true; }).map(r => str(r.text, 20000)).filter(Boolean);
        if (!list.length) return empty(W, fs, 'Colle des transcriptions (une par ligne) ou prends-les « Depuis l’app ».');
        const dir = o.dir === 'before' ? 'before' : 'after', depth = clamp(Math.round(num(o.depth) || 3), 1, 6), maxKids = clamp(Math.round(num(o.branches) || 6), 1, 20), minN = clamp(Math.round(num(o.minCount) || 1), 1, 1000);
        const top = wordTrie(list, rt, dir, depth, {lower: o.caseFold !== false});
        if (!top.n) return empty(W, fs, i18n('« {w} » n’est dans aucun de ces textes.', {w: root}));
        // l'arbre gardé : les branches les plus fréquentes, « … » pour les autres
        const keep = (node, d) => { const kids = [...node.kids.values()].filter(k => k.n >= minN).sort((a, b) => b.n - a.n || a.w.localeCompare(b.w, 'fr')); const shown = kids.slice(0, maxKids), rest = kids.slice(maxKids).reduce((s, k) => s + k.n, 0);
            node.show = shown; shown.forEach(k => keep(k, d + 1)); if (rest && o.others !== false) node.show = [...shown, {w: i18n('… {n} autres', {n: kids.length - maxKids}), n: rest, show: [], other: true}]; };
        keep(top, 0);
        let leaves = 0; const count = node => { if (!node.show?.length) { node.leaves = 1; leaves++; return 1; } node.leaves = node.show.reduce((s, k) => s + count(k), 0); return node.leaves; }; count(top);
        const cap = 120; if (leaves > cap) return empty(W, fs, 'Trop de branches : baisse la profondeur ou le nombre de branches (Réglages).');
        const maxN = Math.max(1, ...top.show.map(k => k.n)), sizeOf = n => fs * clamp(.72 + .75 * Math.sqrt(n / maxN), .72, 1.5);
        // la largeur de chaque niveau : le mot le plus long de ce niveau
        const widths = [textW(root, fs * 1.4) + fs]; const walk = (node, d) => (node.show || []).forEach(k => { widths[d] = Math.max(widths[d] || 0, textW(k.w, sizeOf(k.n)) + fs * (o.counts !== false ? 2.4 : 1.2)); walk(k, d + 1); }); walk(top, 1);
        const total = widths.reduce((s, w) => s + w, 0) + fs * 1.6 * (widths.length - 1), k = Math.min(1, (W - 8) / total), lineH = clamp(num(o.lineHeight) || fs * 1.55, fs * 1.1, 60) * Math.max(.75, k);
        const xs = []; let acc = 4; widths.forEach((w, i) => { xs[i] = acc; acc += w * k + fs * 1.6 * k; });
        const H = Math.max(fs * 3, leaves * lineH + fs), col = color(o.color, '#4e79a7'), ink = color(o.rootColor, '#1d1d1f');
        let y = fs * .5, svg = '', lines = '';
        const X = (d, wpx) => dir === 'before' ? W - xs[d] - wpx : xs[d];
        const place2 = (node, d) => { if (!node.show?.length) { node.y = y + lineH / 2; y += lineH; return; } node.show.forEach(ch => place2(ch, d + 1)); node.y = (node.show[0].y + node.show[node.show.length - 1].y) / 2; };
        place2(top, 0);
        const draw = (node, d) => {
            const fsz = d === 0 ? fs * 1.4 * Math.max(.7, k) : sizeOf(node.n) * Math.max(.7, k), label = d === 0 ? root : node.w, wpx = textW(label, fsz), x = X(d, wpx);
            const cnt = d > 0 && o.counts !== false ? ` ${node.n}` : '';
            svg += `<g>${tip(d === 0 ? i18n('« {w} » : {n} fois', {w: root, n: top.n}) : `${node.w} : ${node.n}`)}${T(x, node.y, cut(label, widths[d] * k, fsz), {size: fsz, weight: d === 0 ? 800 : node.other ? 400 : 600, fill: d === 0 ? ink : node.other ? '#888888' : col, style: node.other ? 'italic' : ''})}`
                + (cnt ? T(dir === 'before' ? x - 3 : x + wpx + 3, node.y, cnt.trim(), {size: fs * .62, anchor: dir === 'before' ? 'end' : 'start', op: .55}) : '') + '</g>';
            (node.show || []).forEach(ch => {
                const cw = textW(ch.w, sizeOf(ch.n) * Math.max(.7, k)), sx = dir === 'before' ? x - fs * .35 - (d > 0 && o.counts !== false ? textW(String(node.n), fs * .62) + 3 : 0) : x + wpx + fs * .35 + (d > 0 && o.counts !== false ? textW(String(node.n), fs * .62) + 3 : 0);
                const ex = dir === 'before' ? X(d + 1, cw) + cw + fs * .25 : X(d + 1, cw) - fs * .25, mx = (sx + ex) / 2;
                lines += `<path d="M${r2(sx)} ${r2(node.y)}C${r2(mx)} ${r2(node.y)} ${r2(mx)} ${r2(ch.y)} ${r2(ex)} ${r2(ch.y)}" fill="none" stroke="${col}" stroke-opacity="${r2(clamp(.2 + .6 * ch.n / maxN, .2, .8))}" stroke-width="${r2(clamp(1 + 4 * ch.n / maxN, 1, 5))}"/>`;
                draw(ch, d + 1);
            });
        };
        draw(top, 0);
        return {h: Math.max(num(o.height) || 0, H), svg: lines + svg, legend: [], desc: i18n('Arbre de mots : « {w} » trouvé {n} fois dans {t}.', {w: root, n: top.n, t: pl(list.length, 'texte')})};
    }
    const sampleWords = () => ({o: {title: i18n('Ce qui suit « {w} » dans les actes', {w: 'fils de'}), root: 'fils de', depth: 3},
        rows: ['fils de Jean MAZAUD, cultivateur, et de Marie LACOMBE', 'fils de Jean MAZAUD et de Louise FAURIE', 'fils de feu Pierre BESSE, laboureur', 'fils de feu Pierre BESSE et de Jeanne ROUX', 'fils de Antoine MAZAUD, tisserand',
            'fils de feu Antoine LACOMBE, meunier', 'fils de Jean LACOMBE, meunier', 'fils légitime de Jean MAZAUD', 'fils de Jean MAZAUD, cultivateur', 'fils de feu Jean ROUX', 'fils de Pierre BESSE, laboureur', 'fils de Jean MAZAUD, tisserand']
            .map((text, i) => ({text, place: i % 3 ? 'Naves' : 'Chanteix', year: String(1780 + i * 4)}))});

    /* ═════════ « Depuis l'app » : le groupe de personnes, la période et les critères communs, puis nos propres choix ═════════ */
    const O = () => ext.diagramAppOpts;
    const dgoHtml = (kind, fields) => O()?.html ? `<div data-lotc-dgo>${O().html({...O().DEF, limit: 0}, {fields, kind, period: 'event'})}</div>` : '';
    const dgoBox = pane => pane.querySelector('[data-lotc-dgo] [data-dgo-box]');
    const dgoParams = box => { if (!box || !O()) return {}; const q = O().read(box); return {...O().dgParams(q), ...(q.rules?.length ? {rules: JSON.stringify(q.rules), match: q.match} : {})}; };
    const sel = (k, label, opts, def) => `<label>${esc(i18n(label))}<select data-lotc="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>`;
    const val = (pane, k) => pane.querySelector(`[data-lotc="${k}"]`)?.value ?? '';
    function appPanel(kind, title, intro, fields, dgoFields, run, {btn = 'Prendre dans mon arbre'} = {}) {
        return {html: () => `<div class="h-dg-app lotc-app"><h4>${esc(i18n(title))}</h4><p class="muted">${esc(i18n(intro))}</p>${fields}${dgoHtml(kind, dgoFields)}
                <button type="button" class="button small" data-lotc-go>${esc(i18n(btn))}</button><p class="muted" data-lotc-msg aria-live="polite"></p></div>`,
            bind: (pane, io) => {
                const box = dgoBox(pane); if (box && O()?.bind) O().bind(box, {cfg: {fields: dgoFields, kind, period: 'event'}});
                const go = pane.querySelector('[data-lotc-go]'), msg = pane.querySelector('[data-lotc-msg]'); if (!go) return;
                kind === 'proofmap' && proofList(pane, box); // la liste des dossiers suit le groupe de personnes
                if (kind === 'proofmap' && box) box.addEventListener('change', () => proofList(pane, box));
                go.addEventListener('click', async () => {
                    if (box && O()?.check && !O().check(box)) return;
                    go.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(i18n('Lecture de ta généalogie…'), {inline: true}) : esc(i18n('Lecture de ta généalogie…'));
                    try { const s = io.spec(), r = await run(pane, dgoParams(box), s); if (!r.rows.length) throw new Error(r.empty || i18n('Rien trouvé dans l’arbre pour ce choix.'));
                        s.rows = r.rows; s.o = {...(s.o || {}), ...r.o}; io.apply(s); if (msg) msg.textContent = '';
                        A()?.toast?.(r.done || i18n('{n} lignes prises dans l’arbre : tu peux les corriger dans l’onglet Données.', {n: r.rows.length})); }
                    catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { go.disabled = false; }
                });
            }};
    }
    const api = q => A().api('diagram_lot_c', q);
    const yearOpts = CENSUS_YEARS.filter(y => y >= 1801 && y <= 1999).map(y => [y, String(y)]);
    const sampleTitle = k => { try { return R.KINDS[k].sample().o.title; } catch (_) { return ''; } };
    const FROM = {
        censusgrid: appPanel('censusgrid', '🗓️ Les recensements de mon arbre', 'Une ligne par personne, une case par recensement : ce qui est relevé sur les fiches (trouvé, non trouvé…), et « à chercher » pour le reste. Sans groupe choisi : tes ancêtres.',
            `<div class="lotc-two">${sel('from', 'Du recensement de', yearOpts, 1836)}${sel('to', 'à celui de', yearOpts, 1936)}</div>${sel('max', 'Au plus', [20, 40, 60, 100, 200, 400].map(n => [n, pl(n, 'personne')]), 60)}`,
            ['rules', 'pop'],
            async (pane, dg, s) => { const r = await api({what: 'census', from: val(pane, 'from'), to: val(pane, 'to'), max: val(pane, 'max'), ...dg});
                const o = {from: r.from, to: r.to}; if (!s.o?.title || s.o.title === sampleTitle('censusgrid')) o.title = i18n('Les recensements de {n}', {n: pl(r.people || 0, 'personne')});
                return {rows: r.rows || [], o, empty: i18n('Personne dans ce groupe ne vivait entre ces deux recensements (il faut au moins une date de naissance ou de décès).'),
                    done: r.total > r.people ? i18n('{n} sur {t} prises (les premières) : change « Au plus » pour en voir davantage.', {n: r.people, t: r.total}) : ''}; }),
        proofmap: appPanel('proofmap', '⚖️ Un dossier de preuve ou une hypothèse', 'Choisis un dossier : sa question, ses indices pour et contre, ses recherches et ses conflits, sa conclusion. Une hypothèse à comparer donne une colonne par réponse possible.',
            `<label>${esc(i18n('Le dossier'))}<select data-lotc="case"><option value="">${esc(i18n('Chargement…'))}</option></select></label>`, ['rules', 'pop'],
            async pane => { const v = val(pane, 'case'), m = v.match(/^(proof|hyp):(\d+)$/); if (!m) throw new Error(i18n('Choisis d’abord un dossier.'));
                const r = await api({what: m[1], id: m[2]});
                return {rows: r.rows || [], o: {question: r.question || '', conclusion: r.conclusion || '', certainty: r.certainty || 'tocheck', title: str(r.question, 90) || i18n('Schéma de preuve')}, empty: i18n('Ce dossier n’a encore aucune ligne : ajoute des indices dans le dossier, ou ici à la main.')}; },
            {btn: 'Prendre ce dossier'}),
        wordtree: appPanel('wordtree', '🌿 Les mots de mes transcriptions', 'Les transcriptions des actes (atelier de transcription) et des médias : ce qui suit (ou précède) le mot de départ. Seuls les bouts de phrase utiles sont pris.',
            `<label>${esc(i18n('Le mot de départ'))}<input type="text" data-lotc="root" maxlength="60" value="fils de" list="lotc-roots"><datalist id="lotc-roots">${['fils de', 'fille de', 'veuve de', 'veuf de', 'épouse de', 'époux de', 'natif de', 'demeurant à', 'parrain', 'marraine', 'feu'].map(w => `<option value="${esc(w)}">`).join('')}</datalist></label>
            <div class="lotc-two">${sel('dir', 'Ce qu’on montre', [['after', 'Ce qui suit'], ['before', 'Ce qui précède']], 'after')}${sel('depth', 'Profondeur', [2, 3, 4, 5].map(n => [n, pl(n, 'mot')]), 3)}</div>
            <label>${esc(i18n('Commune (dans le lieu ou le titre de l’acte)'))}<input type="text" data-lotc="place" maxlength="60" placeholder="${esc(i18n('Toutes'))}"></label>
            <fieldset class="lotc-kinds"><legend>${esc(i18n('Actes pris'))}</legend>${[['naissance', 'Naissances'], ['bapteme', 'Baptêmes'], ['mariage', 'Mariages'], ['deces', 'Décès'], ['sepulture', 'Sépultures'], ['notarial', 'Actes notariés'], ['recensement', 'Recensements'], ['militaire', 'Militaires'], ['lettre', 'Lettres'], ['autre', 'Autres'], ['media', 'Transcriptions des médias']]
                .map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-lotc-kind="${k}" checked> ${esc(i18n(l))}</label>`).join('')}</fieldset>`,
            ['rules', 'pop', 'period'],
            async (pane, dg) => { const root = str(val(pane, 'root'), 60); if (!tokens(root).length) throw new Error(i18n('Écris le mot de départ (par exemple « fils de »).'));
                const all = [...pane.querySelectorAll('[data-lotc-kind]')], on = all.filter(x => x.checked).map(x => x.dataset.lotcKind); if (!on.length) throw new Error(i18n('Coche au moins une sorte d’acte.'));
                const r = await api({what: 'words', root, dir: val(pane, 'dir'), depth: 5, place: val(pane, 'place'), ...(on.length < all.length ? {kinds: on.join(',')} : {}), ...dg});
                return {rows: r.rows || [], o: {root, dir: val(pane, 'dir'), depth: Number(val(pane, 'depth')) || 3, title: i18n(val(pane, 'dir') === 'before' ? 'Ce qui précède « {w} » dans les actes' : 'Ce qui suit « {w} » dans les actes', {w: root})},
                    empty: i18n('« {w} » n’est dans aucune transcription de ce choix ({n} lues).', {w: root, n: r.docs || 0}), done: i18n('« {w} » : {n} fois, dans {a}.', {w: root, n: (r.rows || []).length, a: pl(r.acts || 0, 'acte')})}; }),
    };
    async function proofList(pane, box) {
        const s = pane.querySelector('[data-lotc="case"]'); if (!s) return; const cur = s.value;
        try { const r = await api({what: 'proofs', ...dgoParams(box)});
            const CW = Object.fromEntries(Object.entries(CERT).map(([k, [l]]) => [k, i18n(l)]));
            const g1 = (r.cases || []).map(c => `<option value="proof:${Number(c.id)}">${esc(str(c.question, 90) || i18n('Dossier sans question'))}${c.person ? ' — ' + esc(c.person) : ''} (${esc(CW[c.certainty] || '')})</option>`).join('');
            const g2 = (r.hypotheses || []).map(h => `<option value="hyp:${Number(h.id)}">${esc(str(h.title, 90))}${h.person ? ' — ' + esc(h.person) : ''}</option>`).join('');
            s.innerHTML = g1 || g2 ? `${g1 ? `<optgroup label="${esc(i18n('Dossiers de preuve'))}">${g1}</optgroup>` : ''}${g2 ? `<optgroup label="${esc(i18n('Hypothèses à comparer'))}">${g2}</optgroup>` : ''}` : `<option value="">${esc(i18n('Aucun dossier pour ce groupe de personnes'))}</option>`;
            if (cur && s.querySelector(`option[value="${CSS?.escape ? CSS.escape(cur) : cur}"]`)) s.value = cur;
        } catch (e) { s.innerHTML = `<option value="">⚠️ ${esc(e.message || e)}</option>`; }
    }
    // un clic sur une case (ou un nom) de la grille : la fiche de la personne (hors de l'éditeur)
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
        const t = e.target.closest?.('[data-lotc-pid]'); if (!t || t.closest('.h-dg-mini, .h-dg-gallery')) return;
        const id = Number(t.dataset.lotcPid) || 0, yr = Number(t.dataset.lotcYear) || 0; if (!id) return;
        if (t.closest('.h-dg-dlg, dialog[open]')) { A()?.toast?.(i18n('Ferme l’éditeur, puis clique sur la case pour ouvrir la fiche (bloc « Recensements »).')); return; }
        A()?.openPersonById?.(id); if (yr) A()?.toast?.(i18n('Recensement {yr} : dans le bloc « Recensements » de la fiche.', {yr: String(yr)}));
    });

    /* ═════════ Les sortes : tableaux, réglages ═════════ */
    const H_OPT = C('height', 'Hauteur du dessin (0 = automatique)', 'range', {unit: 'px', min: 0, max: 2400, step: 10, def: 0});
    const STATUS_CHOICES = [['todo', 'À chercher'], ['found', 'Trouvé'], ['not_found', 'Non trouvé'], ['not_born', 'Pas encore né'], ['dead', 'Déjà décédé'], ['not_in_france', 'Pas encore en France'], ['not_france', 'Pas en France'], ['left_france', 'Plus en France']];
    const KINDS = {
        censusgrid: {icon: '🗓️', label: 'Grille des recensements (personnes × années)', group: 'Ma recherche', render: censusgrid, legend: 'bottom',
            help: 'Une ligne par personne, une colonne par recensement : ce qui est trouvé, pas trouvé, et ce qui reste à chercher.',
            grids: [{key: 'rows', label: 'Les personnes (une ligne sans année : naissance, décès) et leurs recensements (une ligne par année)', cols: [C('person', 'Personne'), C('born', 'Naissance (année)', 'number'), C('died', 'Décès (année)', 'number'),
                C('year', 'Recensement (année)', 'number'), C('status', 'Statut', 'select', {choices: STATUS_CHOICES}), C('note', 'Note (lieu, adresse…)'), C('pid', 'N° de fiche', 'number')]}],
            options: [C('layout', 'Forme', 'select', {choices: [['', 'Grille (une case par recensement)'], ['list', 'Liste de travail à imprimer (ce qui reste à chercher)']]}),
                C('from', 'Du recensement de', 'number', {min: 1500, max: 2100, def: 1836}), C('to', 'À celui de', 'number', {min: 1500, max: 2100, def: 1936}), C('years', 'Ou mes années (ex. 1846, 1851, 1872)'),
                C('only', 'Personnes montrées', 'select', {choices: [['', 'Toutes'], ['todo', 'Seulement celles qui ont encore un recensement à chercher']]}),
                C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['todo', 'Le plus à chercher d’abord'], ['birth', 'Par naissance'], ['name', 'Par nom']]}),
                C('foundColor', 'Couleur « Trouvé »', 'color', {def: '#59a14f'}), C('missColor', 'Couleur « Non trouvé »', 'color', {def: '#e15759'}), C('todoColor', 'Couleur « À chercher »', 'color', {def: '#f2b447'}),
                C('abroadColor', 'Couleur « Hors de France »', 'color', {def: '#76b7b2'}), C('outColor', 'Couleur « Pas né / déjà décédé »', 'color', {def: '#c9ccd1'}),
                C('rowHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 12, max: 60, def: 21, when: s => s.o?.layout !== 'list'}), C('gap', 'Écart entre les cases', 'range', {unit: 'px', min: 0, max: 8, def: 2, when: s => s.o?.layout !== 'list'}),
                C('symbols', 'Signes dans les cases (✓ ✗ ?)', 'check', {def: true, when: s => s.o?.layout !== 'list'}), C('lifeYears', 'Années de vie à côté du nom', 'check', {def: true, when: s => s.o?.layout !== 'list'}),
                C('stripes', 'Une ligne sur deux grisée', 'check', {def: true, when: s => s.o?.layout !== 'list'}), H_OPT],
            sample: sampleCensus},
        proofmap: {icon: '⚖️', label: 'Schéma de preuve (question, indices pour et contre, conclusion)', group: 'Ma recherche', render: proofmap, legend: 'bottom',
            help: 'La question en haut, les indices pour et contre (avec leur poids et leur source), les recherches et les conflits, puis la conclusion et sa certitude.',
            grids: [{key: 'rows', label: 'Les lignes du dossier (pour, contre, recherche, conflit ; « réponse » pour une hypothèse à plusieurs réponses)', cols: [C('part', 'Sorte', 'select', {choices: [['for', 'Pour'], ['against', 'Contre'], ['research', 'Recherche'], ['conflict', 'Conflit'], ['answer', 'Réponse']]}),
                C('text', 'Indice (ou réponse)'), C('source', 'Source'), C('weight', 'Poids (1 à 3)', 'number', {min: 0, max: 3}), C('answer', 'Pour la réponse… (hypothèse)'), C('note', 'Note (résolution d’un conflit)')]}],
            options: [C('question', 'La question'), C('conclusion', 'La conclusion'), C('certainty', 'Certitude', 'select', {choices: [['tocheck', 'À vérifier'], ['proved', 'Prouvé'], ['probable', 'Probable'], ['possible', 'Possible'], ['refuted', 'Réfuté']]}),
                C('dir', 'Sens', 'select', {choices: [['', 'De haut en bas'], ['right', 'De gauche à droite']]}), C('todo', 'Montrer les recherches et les conflits (ce qui reste à chercher)', 'check', {def: true}),
                C('forColor', 'Couleur « confirme »', 'color', {def: '#59a14f'}), C('againstColor', 'Couleur « contredit »', 'color', {def: '#e15759'}), C('todoColor', 'Couleur des recherches', 'color', {def: '#8b8f97'}),
                C('conflictColor', 'Couleur des conflits', 'color', {def: '#f28e2b'}), C('answerColor', 'Couleur des réponses', 'color', {def: '#4e79a7'}), C('questionColor', 'Couleur de la question', 'color', {def: '#1d1d1f'}), H_OPT],
            sample: sampleProof},
        wordtree: {icon: '🌿', label: 'Arbre de mots des actes (ce qui suit « fils de »…)', group: 'Ma recherche', render: wordtree, noLegend: true,
            help: 'Un mot de départ à gauche ; à droite, les mots qui le suivent dans les actes, plus gros quand ils reviennent souvent.',
            grids: [{key: 'rows', label: 'Les textes (une transcription ou un bout de phrase par ligne)', cols: [C('text', 'Texte'), C('place', 'Lieu'), C('year', 'Année', 'number'), C('source', 'Acte ou source')]}],
            options: [C('root', 'Le mot de départ (ex. fils de, veuve de)', 'text', {def: 'fils de'}), C('dir', 'Ce qu’on montre', 'select', {choices: [['', 'Ce qui suit'], ['before', 'Ce qui précède']]}),
                C('depth', 'Profondeur (mots)', 'range', {min: 1, max: 6, def: 3}), C('branches', 'Branches par mot', 'range', {min: 1, max: 20, def: 6}), C('minCount', 'Seulement les mots vus au moins', 'range', {min: 1, max: 50, def: 1, unit: '×'}),
                C('others', 'Le reste dans « … autres »', 'check', {def: true}), C('counts', 'Écrire le nombre de fois', 'check', {def: true}), C('caseFold', 'Sans tenir compte des capitales ni des accents', 'check', {def: true}),
                C('place', 'Seulement les actes de (lieu)'), C('from', 'De l’année', 'number'), C('to', 'À l’année', 'number'),
                C('color', 'Couleur des mots', 'color', {def: '#4e79a7'}), C('rootColor', 'Couleur du mot de départ', 'color', {def: '#1d1d1f'}), C('lineHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 12, max: 60, def: 19}), H_OPT],
            sample: sampleWords},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (FROM[k]) kind.fromApp = FROM[k]; if (!R.KINDS[k]) R.KINDS[k] = kind; }
    ext.diagramLotC = {KINDS: Object.keys(KINDS), censusPeople, censusYears, statusOf, partOf, certOf, wordTrie, tokens};
})();
