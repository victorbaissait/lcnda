/* LCNDA — 📊 Diagrammes D23 à D38 « vie, couples, lieux et recherche » (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  Vie et mort : 👶 mortalité des enfants, 👨‍👩‍👧 fratries qui survivent, 🗓 saisons des naissances et des décès ;
 *  Couples : 💔 veuvage et remariage, ⏳ durée des mariages, 👴 âge des parents à chaque naissance, 🤰 conceptions avant mariage,
 *            💑 écart d'âge entre époux ; Lieux : 🧭 loin du berceau ;
 *  Ma recherche : ✍️ savoir signer, ✅ ce que tu as prouvé, 📚 registres consultés.
 * Les D24 (« Naissances, décès et crises »), D32 (« Arbre des patronymes »), D33 (« Diagramme d'accord, mariages entre villages »)
 * et D38 (« Réseau de relations, témoins, parrains ») existaient déjà (heritage-diagram-more.js, heritage-diagram-genea.js).
 * Chaque sorte : {icon, label, group, help, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Données de l'arbre : api.php?action=diagram_vie (lib/diagram_vie.php). Un clic sur une barre ou une case reliée à des personnes
 * ouvre leur liste (data-dfa-pids : la fenêtre de heritage-diagram-famille.js). Tout texte passe par esc() ; tailles bornées.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const K = R.KINDS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : R.num(v));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number(n) || 0);
    const color = (c, d) => R.color(c, d);
    const pal = spec => R.PALETTES[spec.o?.palette] || R.PALETTES.vive;
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', op = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rows = (spec, key = 'rows', max = 20000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'}), legend: [], desc: msg});
    const pidList = v => String(v ?? '').split(',').map(x => Math.floor(Number(x))).filter(x => x > 0 && x < 1e9).slice(0, 400);
    const PIDS = (list, title) => (list.length ? ` data-dfa-pids="${list.join(',')}" data-dfa-t="${esc(title)}" style="cursor:pointer"` : '');
    const yearOf = v => { const m = String(v ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; };
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    const plural = (n, one, many = one + 's') => `${fmt(n, 0)} ${Math.abs(n) >= 2 ? many : one}`;
    const median = a => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return '#' + a.map((v, i) => clamp(Math.round(v + (b[i] - v) * clamp(t, 0, 1)), 0, 255).toString(16).padStart(2, '0')).join(''); };
    const inkOn = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };

    /* ═════════ Petits dessins communs ═════════ */
    /** l'axe des valeurs à gauche (lignes légères) : renvoie {svg, Y} */
    function vAxis(lo, hi, x0, x1, y0, h, fs, unit = '') {
        const tk = R.ticks(lo, hi, clamp(Math.round(h / 40), 2, 8)); const top = Math.max(hi, tk.hi), bot = Math.min(lo, tk.lo);
        const Y = v => y0 + h - (v - bot) / Math.max(1e-9, top - bot) * h; let s = '';
        tk.ticks.forEach(v => { if (v < bot - 1e-9 || v > top + 1e-9) return; const y = Y(v); s += `<line x1="${r2(x0)}" x2="${r2(x1)}" y1="${r2(y)}" y2="${r2(y)}" stroke="currentColor" stroke-opacity=".12"/>` + T(x0 - 4, y, fmt(v, 1) + unit, {size: fs * .78, anchor: 'end', op: .75}); });
        return {svg: s, Y};
    }
    /** colonnes (groupées ou empilées) sur des catégories : cats [{label, vals:[], ids:[[]], tips:[]}], series [{name, color}] */
    function columns(W, fs, cats, series, {stacked = false, unit = '', maxV = null, height = 0, values = false, line = false} = {}) {
        if (!cats.length) return {h: 0, svg: ''};
        const left = Math.max(30, ...[0, maxV ?? 0].map(v => textW(fmt(v, 1) + unit, fs * .78))) + 10, h = clamp(height || Math.max(160, W * .42), 120, 1400), top = 8, bottom = fs * 2.6;
        const hi = maxV ?? Math.max(1e-9, ...cats.map(c => stacked ? c.vals.reduce((a, b) => a + Math.max(0, b || 0), 0) : Math.max(0, ...c.vals.map(v => v || 0))));
        const ax = vAxis(0, hi, left, W - 4, top, h - top - bottom, fs, unit), bw = (W - left - 6) / cats.length, gw = bw * .78;
        let s = ax.svg, path = series.map(() => []);
        const every = Math.ceil(textW('0000', fs * .78) * 1.3 / Math.max(1, bw));
        cats.forEach((c, i) => {
            const x0 = left + i * bw + (bw - gw) / 2; let acc = 0;
            series.forEach((se, k) => {
                const v = Math.max(0, c.vals[k] || 0); if (c.vals[k] == null) return;
                const ids = c.ids?.[k] || [], t = c.tips?.[k] || `${c.label} — ${se.name} : ${fmt(v, 1)}${unit}`;
                if (line) { path[k].push([left + i * bw + bw / 2, ax.Y(v), ids, t]); return; }
                const x = stacked ? x0 : x0 + gw / series.length * k, w = stacked ? gw : gw / series.length, y1 = ax.Y(stacked ? acc + v : v), y0 = ax.Y(stacked ? acc : 0);
                s += `<rect x="${r2(x)}" y="${r2(y1)}" width="${r2(Math.max(1, w - 1))}" height="${r2(Math.max(0, y0 - y1))}" fill="${se.color}"${PIDS(ids, t)}>${tip(t)}</rect>`;
                if (values && v && y0 - y1 > fs) s += T(x + w / 2, y1 + fs * .7, fmt(v, 1), {size: fs * .7, anchor: 'middle', fill: inkOn(se.color)});
                acc += v;
            });
            if (i % every === 0) s += T(left + i * bw + bw / 2, h - bottom + fs * .9, cut(c.label, bw * every - 2, fs * .78), {size: fs * .78, anchor: 'middle'});
        });
        if (line) series.forEach((se, k) => {
            const p = path[k]; if (!p.length) return;
            s += `<polyline points="${p.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}" fill="none" stroke="${se.color}" stroke-width="2.4" stroke-linejoin="round"/>`;
            p.forEach(([x, y, ids, t]) => { s += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(fs * .32)}" fill="${se.color}"${PIDS(ids, t)}>${tip(t)}</circle>`; });
        });
        return {h, svg: s};
    }
    /** barres couchées : items [{label, parts:[{v, color, ids, tip}], note}] */
    function hbars(W, fs, items, {maxV = null, barH = 0, unit = '', labelW = 0} = {}) {
        const bh = clamp(barH || fs * 1.4, 6, 60), gap = Math.max(3, bh * .35), lw = labelW || Math.min(W * .38, Math.max(40, ...items.map(it => textW(it.label, fs * .85))) + 8);
        const noteW = Math.max(0, ...items.map(it => textW(it.note || '', fs * .8))) + 8, pw = Math.max(40, W - lw - noteW);
        const hi = maxV ?? Math.max(1e-9, ...items.map(it => it.parts.reduce((a, p) => a + Math.max(0, p.v || 0), 0)));
        let s = '';
        items.forEach((it, i) => {
            const y = i * (bh + gap); let x = lw;
            s += T(lw - 6, y + bh / 2, cut(it.label, lw - 8, fs * .85), {size: fs * .85, anchor: 'end'});
            it.parts.forEach(p => { const w = Math.max(0, p.v || 0) / hi * pw; if (w <= 0) return; s += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(bh)}" fill="${p.color}"${PIDS(p.ids || [], p.tip || it.label)}>${tip(p.tip || it.label)}</rect>`; x += w; });
            if (it.marker != null) { const mx = lw + clamp(it.marker / hi, 0, 1) * pw; s += `<line x1="${r2(mx)}" x2="${r2(mx)}" y1="${r2(y - 2)}" y2="${r2(y + bh + 2)}" stroke="currentColor" stroke-width="2"/>`; }
            if (it.note) s += T(x + 5, y + bh / 2, it.note, {size: fs * .8, op: .85});
        });
        return {h: items.length * (bh + gap), svg: s};
    }
    /** légende simple sous le dessin */
    const legendOf = list => list.map(([label, c]) => ({label, color: c}));
    const H = (spec, h) => { const m = num(spec.o?.height); return m > 0 ? Math.min(h, m) : h; };
    const sentence = (W, fs, y, t) => (t ? T(0, y, cut(t, W, fs * .85), {size: fs * .85, op: .85}) : '');

    /* ═════════ D23 👶 Mortalité des enfants ═════════ */
    function infant(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({label: str(r.label, 40), n: num(r.n), d1: num(r.d1), d5: num(r.d5), ids1: pidList(r.ids1), ids5: pidList(r.ids5)})).filter(r => r.label && r.n > 0);
        if (!list.length) return empty(W, fs, 'Ajoute des périodes : le nombre d’enfants nés, ceux morts avant 1 an et avant 5 ans.');
        const pct = o.show !== 'count', c1 = color(o.c1, '#c0392b'), c5 = color(o.c5, '#f0a35e');
        const series = [{name: 'Morts avant 1 an', color: c1}, ...(o.five !== false ? [{name: 'Morts avant 5 ans', color: c5}] : [])];
        const cats = list.map(r => ({label: r.label, vals: [pct ? r.d1 / r.n * 100 : r.d1, ...(o.five !== false ? [pct ? r.d5 / r.n * 100 : r.d5] : [])], ids: [r.ids1, r.ids5],
            tips: [`${r.label} : ${fmt(r.d1, 0)} sur ${fmt(r.n, 0)} enfants morts avant 1 an (${fmt(r.d1 / r.n * 100)} %)`, `${r.label} : ${fmt(r.d5, 0)} sur ${fmt(r.n, 0)} morts avant 5 ans (${fmt(r.d5 / r.n * 100)} %)`]}));
        const ch = columns(W, fs, cats, series, {unit: pct ? ' %' : '', line: o.chart === 'line', values: !!o.values, height: H(spec, Math.max(180, W * .42))});
        const tot = list.reduce((a, r) => ({n: a.n + r.n, d1: a.d1 + r.d1, d5: a.d5 + r.d5}), {n: 0, d1: 0, d5: 0});
        const sum = o.summary !== false ? `En tout : ${fmt(tot.d1 / tot.n * 100)} % des enfants morts avant 1 an, ${fmt(tot.d5 / tot.n * 100)} % avant 5 ans (${plural(tot.n, 'enfant')}).` : '';
        return {h: ch.h + (sum ? fs * 1.8 : 0), svg: ch.svg + sentence(W, fs, ch.h + fs, sum), legend: legendOf(series.map(x => [x.name, x.color])), desc: sum || 'Mortalité des enfants'};
    }
    /* ═════════ D25 👨‍👩‍👧 Fratries qui survivent ═════════ */
    function siblings(spec, W, fs) {
        const o = spec.o || {}, max = clamp(num(o.max) || 25, 3, 80);
        let list = rows(spec).map(r => ({couple: str(r.couple, 120), year: str(r.year, 12), born: num(r.born), adult: num(r.adult), young: num(r.young), unknown: num(r.unknown), ia: pidList(r.ids_adult), iy: pidList(r.ids_young)})).filter(r => r.couple && r.born > 0);
        if (!list.length) return empty(W, fs, 'Ajoute des couples : enfants nés, arrivés à l’âge adulte, morts jeunes.');
        if (o.sort === 'young') list.sort((a, b) => b.young - a.young || b.born - a.born); else if (o.sort === 'year') list.sort((a, b) => (yearOf(a.year) ?? 9999) - (yearOf(b.year) ?? 9999)); else if (o.sort !== 'given') list.sort((a, b) => b.born - a.born);
        list = list.slice(0, max);
        const ca = color(o.cAdult, '#59a14f'), cy = color(o.cYoung, '#5f6b7a'), cu = color(o.cUnknown, '#d5dae1');
        const items = list.map(r => ({label: `${r.couple}${r.year ? ' (' + r.year + ')' : ''}`, parts: [{v: r.adult, color: ca, ids: r.ia, tip: `${r.couple} : ${plural(r.adult, 'enfant')} adulte${r.adult > 1 ? 's' : ''}`}, {v: r.young, color: cy, ids: r.iy, tip: `${r.couple} : ${plural(r.young, 'enfant')} mort${r.young > 1 ? 's' : ''} jeune${r.young > 1 ? 's' : ''}`}, {v: r.unknown, color: cu, tip: `${r.couple} : ${plural(r.unknown, 'enfant')} sans date de décès`}],
            note: `${r.adult}/${r.born}`}));
        const hb = hbars(W, fs, items, {barH: num(o.barH)});
        const t = list.reduce((a, r) => ({b: a.b + r.born, a: a.a + r.adult}), {b: 0, a: 0});
        const sum = o.summary !== false ? `Sur ${plural(t.b, 'enfant')}, ${fmt(t.a / Math.max(1, t.b) * 100, 0)} % sont arrivés à l’âge adulte.` : '';
        return {h: H(spec, hb.h + (sum ? fs * 1.8 : 0)), svg: hb.svg + sentence(W, fs, hb.h + fs, sum), legend: legendOf([['Arrivés à l’âge adulte', ca], ['Morts jeunes', cy], ['On ne sait pas', cu]]), desc: sum || 'Fratries'};
    }
    /* ═════════ D26 🗓 Saisons des naissances et des décès ═════════ */
    function seasons(spec, W, fs) {
        const o = spec.o || {}, show = o.show || 'both';
        const list = rows(spec).map(r => ({label: str(r.label, 30), what: /d[ée]c/i.test(str(r.what)) ? 'd' : 'b', m: Array.from({length: 12}, (_, i) => num(r['m' + (i + 1)])), ids: Array.from({length: 12}, (_, i) => pidList(r['i' + (i + 1)]))})).filter(r => r.label);
        const parts = (show === 'both' ? ['b', 'd'] : [show === 'deaths' ? 'd' : 'b']).map(w => [w, list.filter(r => r.what === w)]).filter(([, l]) => l.length);
        if (!parts.length) return empty(W, fs, 'Ajoute des lignes : une période, « Naissances » ou « Décès », et les 12 mois.');
        const cols = parts.length, gapX = fs * 1.5, lw = Math.min(W * .2, Math.max(...list.map(r => textW(r.label, fs * .8))) + 8), cw = (W - gapX * (cols - 1)) / cols, cellW = (cw - lw) / 12;
        const cellH = clamp(num(o.cellH) || Math.max(fs * 1.4, Math.min(34, cellW * .8)), 8, 60);
        let s = '', hMax = 0;
        parts.forEach(([w, l], pi) => {
            const x0 = pi * (cw + gapX), hiCol = w === 'b' ? color(o.cBirth, '#2e7d4f') : color(o.cDeath, '#5f2a2a');
            s += T(x0 + lw, fs * .7, w === 'b' ? 'Naissances' : 'Décès', {size: fs * .9, weight: 700});
            MONTHS.forEach((m, i) => { s += T(x0 + lw + i * cellW + cellW / 2, fs * 2, cellW > fs * 2.2 ? m : m[0], {size: fs * .7, anchor: 'middle', op: .8}); });
            l.forEach((r, j) => {
                const y = fs * 2.8 + j * (cellH + 2), tot = r.m.reduce((a, b) => a + b, 0) || 1, vals = o.share === false ? r.m : r.m.map(v => v / tot * 100), hi = Math.max(1e-9, ...vals);
                s += T(x0 + lw - 6, y + cellH / 2, cut(r.label, lw - 8, fs * .8), {size: fs * .8, anchor: 'end'});
                vals.forEach((v, i) => { const c = mix('#f4f6f8', hiCol, v / hi), t = `${r.label} · ${MONTHS[i]} : ${fmt(r.m[i], 0)} ${w === 'b' ? 'naissances' : 'décès'}${o.share === false ? '' : ` (${fmt(v)} % de l’année)`}`;
                    s += `<rect x="${r2(x0 + lw + i * cellW)}" y="${r2(y)}" width="${r2(cellW - 1.5)}" height="${r2(cellH)}" rx="2" fill="${c}"${PIDS(r.ids[i], t)}>${tip(t)}</rect>`;
                    if (o.values && cellW > fs * 1.6) s += T(x0 + lw + i * cellW + cellW / 2, y + cellH / 2, fmt(r.m[i], 0), {size: fs * .65, anchor: 'middle', fill: inkOn(c)}); });
                hMax = Math.max(hMax, y + cellH + 4);
            });
        });
        return {h: H(spec, hMax), svg: s, legend: [], desc: 'Saisons des naissances et des décès (plus foncé = plus d’actes)'};
    }
    /* ═════════ D27 💔 Veuvage et remariage ═════════ */
    const WIDOW_BINS = [[0, 6, 'moins de 6 mois'], [6, 12, '6 mois à 1 an'], [12, 24, '1 à 2 ans'], [24, 60, '2 à 5 ans'], [60, 120, '5 à 10 ans'], [120, 1e9, '10 ans et plus']];
    function widow(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({name: str(r.name, 120), sex: /^f/i.test(str(r.sex)) ? 'f' : /^h|^m/i.test(str(r.sex)) ? 'h' : '', months: num(r.months), pid: pidList(r.pid)[0] || 0})).filter(r => r.months >= 0 && (r.name || r.months));
        if (!list.length) return empty(W, fs, 'Ajoute des remariages : le nom, le sexe et le délai en mois depuis la mort du premier conjoint.');
        const ch = color(o.cMen, '#4e79a7'), cf = color(o.cWomen, '#e15759');
        const cats = WIDOW_BINS.map(([a, b, label]) => { const inB = s => list.filter(r => r.sex === s && r.months >= a && r.months < b); const h = inB('h'), f = inB('f');
            return {label, vals: [h.length, f.length], ids: [h.map(r => r.pid).filter(Boolean), f.map(r => r.pid).filter(Boolean)], tips: [`Hommes remariés ${label} après : ${h.length}`, `Femmes remariées ${label} après : ${f.length}`]}; });
        const c = columns(W, fs, cats, [{name: 'Veufs (hommes)', color: ch}, {name: 'Veuves (femmes)', color: cf}], {values: !!o.values, height: H(spec, Math.max(180, W * .4))});
        const mh = median(list.filter(r => r.sex === 'h').map(r => r.months)), mf = median(list.filter(r => r.sex === 'f').map(r => r.months));
        const dur = m => (m == null ? '—' : m < 24 ? `${fmt(m, 0)} mois` : `${fmt(m / 12, 1)} ans`);
        const sum = o.summary !== false ? `Délai médian avant de se remarier : ${dur(mh)} pour les hommes, ${dur(mf)} pour les femmes.` : '';
        return {h: c.h + (sum ? fs * 1.8 : 0), svg: c.svg + sentence(W, fs, c.h + fs, sum), legend: legendOf([['Veufs (hommes)', ch], ['Veuves (femmes)', cf]]), desc: sum || 'Veuvage et remariage'};
    }
    /* ═════════ D28 ⏳ Durée des mariages ═════════ */
    function duration(spec, W, fs) {
        const o = spec.o || {}, step = clamp(num(o.step) || 5, 1, 20), list = rows(spec).map(r => ({couple: str(r.couple, 120), year: yearOf(r.year), years: num(r.years), pids: pidList(r.pids)})).filter(r => r.years >= 0 && r.years <= 90);
        if (!list.length) return empty(W, fs, 'Ajoute des couples : l’année du mariage et sa durée en années.');
        const split = o.split === 'century', cent = y => (y ? `${Math.floor((y - 1) / 100) + 1}e s.` : 'Sans date');
        const groups = split ? [...new Set(list.map(r => cent(r.year)))].sort() : ['Mariages'];
        const maxY = Math.min(90, Math.max(...list.map(r => r.years))), bins = Math.max(1, Math.ceil((maxY + 1e-9) / step));
        const cats = Array.from({length: bins}, (_, i) => { const a = i * step, b = a + step; const vals = groups.map(g => list.filter(r => r.years >= a && r.years < b && (!split || cent(r.year) === g)));
            return {label: `${a}–${b} ans`, vals: vals.map(v => v.length), ids: vals.map(v => v.flatMap(r => r.pids)), tips: vals.map((v, k) => `${groups[k]} : ${plural(v.length, 'mariage')} de ${a} à ${b} ans`)}; });
        const series = groups.map((g, i) => ({name: g, color: pal(spec)[i % pal(spec).length]}));
        const c = columns(W, fs, cats, series, {stacked: true, values: !!o.values, height: H(spec, Math.max(180, W * .4))});
        const med = median(list.map(r => r.years));
        const sum = o.summary !== false ? `Durée médiane : ${fmt(med, 1)} ans (${plural(list.length, 'mariage')} terminé${list.length > 1 ? 's' : ''} par un décès).` : '';
        return {h: c.h + (sum ? fs * 1.8 : 0), svg: c.svg + sentence(W, fs, c.h + fs, sum), legend: split ? legendOf(series.map(x => [x.name, x.color])) : [], desc: sum || 'Durée des mariages'};
    }
    /* ═════════ D29 👴 Âge des parents à chaque naissance ═════════ */
    function parentage(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec, 'rows', 6000).map(r => ({child: str(r.child, 120), year: yearOf(r.year), fa: str(r.fa) === '' ? null : num(r.fa), ma: str(r.ma) === '' ? null : num(r.ma), cid: pidList(r.cid)[0] || 0})).filter(r => r.year != null && (r.fa != null || r.ma != null));
        if (!list.length) return empty(W, fs, 'Ajoute des naissances : l’année, l’âge du père, l’âge de la mère.');
        const cf = color(o.cFather, '#4e79a7'), cm = color(o.cMother, '#e15759'), who = o.who || 'both';
        const ys = list.map(r => r.year), y0 = Math.min(...ys), y1 = Math.max(y0 + 1, ...ys), ages = list.flatMap(r => [who !== 'mother' ? r.fa : null, who !== 'father' ? r.ma : null]).filter(v => v != null);
        const h = H(spec, clamp(Math.max(220, W * .5), 160, 1200)), left = textW('80 ans', fs * .78) + 10, bottom = fs * 2.2, top = 6;
        const ax = vAxis(Math.min(10, ...ages), Math.max(50, ...ages), left, W - 4, top, h - top - bottom, fs, ' ans'), X = y => left + (y - y0) / (y1 - y0) * (W - left - 10);
        let s = ax.svg; const tk = R.ticks(y0, y1, clamp(Math.round(W / 90), 2, 12));
        tk.ticks.filter(v => v >= y0 && v <= y1).forEach(v => { s += T(X(v), h - bottom + fs * .9, String(Math.round(v)), {size: fs * .78, anchor: 'middle'}); });
        const dot = clamp(num(o.dot) || 3, 1, 8), dots = (k, c, label) => list.forEach(r => { const a = r[k]; if (a == null) return; const t = `${r.child} (${r.year}) : ${label} avait ${fmt(a, 1)} ans`; s += `<circle cx="${r2(X(r.year))}" cy="${r2(ax.Y(a))}" r="${dot}" fill="${c}" fill-opacity=".55"${PIDS(r.cid ? [r.cid] : [], t)}>${tip(t)}</circle>`; });
        if (who !== 'mother') dots('fa', cf, 'le père'); if (who !== 'father') dots('ma', cm, 'la mère');
        if (o.trend !== false) [['fa', cf], ['ma', cm]].forEach(([k, c]) => { if ((k === 'fa' && who === 'mother') || (k === 'ma' && who === 'father')) return;
            const by = new Map(); list.forEach(r => { if (r[k] == null) return; const d = Math.floor(r.year / 25) * 25; (by.get(d) || by.set(d, []).get(d)).push(r[k]); });
            const pts = [...by.entries()].sort((a, b) => a[0] - b[0]).filter(([, v]) => v.length >= 2).map(([d, v]) => `${r2(X(clamp(d + 12.5, y0, y1)))},${r2(ax.Y(v.reduce((a, b) => a + b, 0) / v.length))}`);
            if (pts.length > 1) s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2.6"/>`; });
        const mf = median(list.map(r => r.fa).filter(v => v != null)), mm = median(list.map(r => r.ma).filter(v => v != null));
        return {h, svg: s, legend: legendOf([[`Âge du père (médiane ${fmt(mf, 1)} ans)`, cf], [`Âge de la mère (médiane ${fmt(mm, 1)} ans)`, cm]]), desc: 'Âge des parents à chaque naissance'};
    }
    /* ═════════ D30 🤰 Conceptions avant mariage ═════════ */
    function prenup(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({label: str(r.label, 40), n: num(r.n), before: num(r.before), early: num(r.early), ib: pidList(r.ids_before), ie: pidList(r.ids_early)})).filter(r => r.label && r.n > 0);
        if (!list.length) return empty(W, fs, 'Ajoute des périodes : le nombre de couples, les premiers enfants nés avant le mariage et ceux nés moins de 8 mois après.');
        const cb = color(o.cBefore, '#b07aa1'), ce = color(o.cEarly, '#f28e2b'), pct = o.show !== 'count';
        const cats = list.map(r => ({label: r.label, vals: [pct ? r.before / r.n * 100 : r.before, pct ? r.early / r.n * 100 : r.early], ids: [r.ib, r.ie], tips: [`${r.label} : ${r.before} premier${r.before > 1 ? 's' : ''} enfant${r.before > 1 ? 's' : ''} né${r.before > 1 ? 's' : ''} avant le mariage, sur ${r.n}`, `${r.label} : ${r.early} né${r.early > 1 ? 's' : ''} moins de 8 mois après, sur ${r.n}`]}));
        const c = columns(W, fs, cats, [{name: 'Né avant le mariage', color: cb}, {name: 'Né moins de 8 mois après', color: ce}], {stacked: true, unit: pct ? ' %' : '', values: !!o.values, height: H(spec, Math.max(180, W * .4))});
        const t = list.reduce((a, r) => ({n: a.n + r.n, x: a.x + r.before + r.early}), {n: 0, x: 0});
        const sum = o.summary !== false ? `${fmt(t.x / t.n * 100)} % des premiers enfants ont été conçus avant le mariage (${plural(t.n, 'couple')}).` : '';
        return {h: c.h + (sum ? fs * 1.8 : 0), svg: c.svg + sentence(W, fs, c.h + fs, sum), legend: legendOf([['Né avant le mariage', cb], ['Né moins de 8 mois après', ce]]), desc: sum || 'Conceptions avant mariage'};
    }
    /* ═════════ D31 💑 Écart d'âge entre époux ═════════ */
    const GAP_BINS = [[0, 1, 'moins d’1 an'], [1, 3, '1 à 3 ans'], [3, 5, '3 à 5 ans'], [5, 10, '5 à 10 ans'], [10, 15, '10 à 15 ans'], [15, 99, '15 ans et plus']];
    function agegap(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({couple: str(r.couple, 160), gap: num(r.gap), pids: pidList(r.pids)})).filter(r => Number.isFinite(r.gap) && Math.abs(r.gap) < 60);
        if (!list.length) return empty(W, fs, 'Ajoute des couples : l’écart d’âge en années (positif = le mari est plus âgé).');
        const ch = color(o.cHusband, '#4e79a7'), cw = color(o.cWife, '#e15759');
        const bins = GAP_BINS.map(([a, b, label]) => { const hu = list.filter(r => r.gap >= a && r.gap < b && (r.gap > 0 || a === 0 && r.gap >= 0)), wi = list.filter(r => -r.gap >= a && -r.gap < b && r.gap < 0); return {label, hu, wi}; });
        const hi = Math.max(1, ...bins.flatMap(b => [b.hu.length, b.wi.length])), lw = Math.max(...bins.map(b => textW(b.label, fs * .8))) + 12, half = (W - lw) / 2, bh = clamp(num(o.barH) || fs * 1.5, 8, 50), gap = bh * .3;
        let s = T(half / 2, fs * .6, 'Le mari est plus âgé', {size: fs * .8, anchor: 'middle', weight: 600}) + T(half + lw + half / 2, fs * .6, 'La femme est plus âgée', {size: fs * .8, anchor: 'middle', weight: 600});
        bins.forEach((b, i) => {
            const y = fs * 1.6 + i * (bh + gap), wl = b.hu.length / hi * (half - 30), wr = b.wi.length / hi * (half - 30);
            s += T(half + lw / 2, y + bh / 2, b.label, {size: fs * .8, anchor: 'middle'});
            const tl = `Mari plus âgé de ${b.label} : ${plural(b.hu.length, 'couple')}`, tr = `Femme plus âgée de ${b.label} : ${plural(b.wi.length, 'couple')}`;
            s += `<rect x="${r2(half - wl)}" y="${r2(y)}" width="${r2(wl)}" height="${r2(bh)}" fill="${ch}"${PIDS(b.hu.flatMap(r => r.pids), tl)}>${tip(tl)}</rect>` + (b.hu.length ? T(half - wl - 4, y + bh / 2, String(b.hu.length), {size: fs * .75, anchor: 'end'}) : '');
            s += `<rect x="${r2(half + lw)}" y="${r2(y)}" width="${r2(wr)}" height="${r2(bh)}" fill="${cw}"${PIDS(b.wi.flatMap(r => r.pids), tr)}>${tip(tr)}</rect>` + (b.wi.length ? T(half + lw + wr + 4, y + bh / 2, String(b.wi.length), {size: fs * .75}) : '');
        });
        const h = fs * 1.6 + bins.length * (bh + gap), med = median(list.map(r => r.gap)), older = list.filter(r => r.gap < 0).length;
        const sum = o.summary !== false ? `Écart médian : ${fmt(Math.abs(med), 1)} an${Math.abs(med) >= 2 ? 's' : ''} ; la femme est plus âgée dans ${fmt(older / list.length * 100, 0)} % des couples.` : '';
        return {h: H(spec, h + (sum ? fs * 1.8 : 0)), svg: s + sentence(W, fs, h + fs, sum), legend: [], desc: sum || 'Écart d’âge entre époux'};
    }
    /* ═════════ D34 🧭 Loin du berceau ═════════ */
    function cradle(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({gen: Math.round(num(r.gen)), n: num(r.n), avg: num(r.avg), median: num(r.median), max: num(r.max), ids: pidList(r.ids)})).filter(r => r.gen > 0).sort((a, b) => a.gen - b.gen);
        if (!list.length) return empty(W, fs, 'Ajoute des générations : la distance moyenne (km) au lieu de référence.');
        const c = color(o.barColor, '#4e79a7'), val = o.value === 'median' ? 'median' : 'avg';
        const items = list.map(r => ({label: r.gen === 1 ? 'Personne de départ' : `Génération ${r.gen}`, parts: [{v: r[val], color: c, ids: r.ids, tip: `Génération ${r.gen} : ${fmt(r[val], 0)} km en ${val === 'median' ? 'médiane' : 'moyenne'} (${plural(r.n, 'lieu')} connu${r.n > 1 ? 's' : ''}, le plus loin à ${fmt(r.max, 0)} km)`}], note: `${fmt(r[val], 0)} km`, marker: o.showMax ? r.max : null}));
        const hb = hbars(W, fs, items, {barH: num(o.barH), maxV: o.showMax ? Math.max(...list.map(r => r.max), 1) : null});
        const sum = o.summary !== false && spec.ref ? `Distance au ${str(spec.ref, 120)}.` : '';
        return {h: H(spec, hb.h + (sum ? fs * 1.8 : 0)), svg: hb.svg + sentence(W, fs, hb.h + fs, sum), legend: [], desc: 'Loin du berceau'};
    }
    /* ═════════ D35 ✍️ Savoir signer ═════════ */
    function sign(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({label: str(r.label, 40), h1: num(r.h1), h0: num(r.h0), f1: num(r.f1), f0: num(r.f0), w1: num(r.w1), w0: num(r.w0)})).filter(r => r.label && (r.h1 + r.h0 + r.f1 + r.f0 + r.w1 + r.w0) > 0);
        if (!list.length) return empty(W, fs, 'Note qui a signé : dans « Modifier un événement », « ✍️ A signé » pour les époux et chaque témoin.');
        const S = [['h', 'Hommes (époux…)', color(o.cMen, '#4e79a7')], ['f', 'Femmes (épouses…)', color(o.cWomen, '#e15759')], ['w', 'Témoins', color(o.cWitness, '#59a14f')]].filter(([k]) => list.some(r => r[k + '1'] + r[k + '0'] > 0));
        const cats = list.map(r => ({label: r.label, vals: S.map(([k]) => (r[k + '1'] + r[k + '0'] ? r[k + '1'] / (r[k + '1'] + r[k + '0']) * 100 : null)), tips: S.map(([k, n]) => `${r.label} — ${n} : ${r[k + '1']} ont signé sur ${r[k + '1'] + r[k + '0']}`)}));
        const c = columns(W, fs, cats, S.map(([, name, col]) => ({name, color: col})), {unit: ' %', maxV: 100, line: o.chart !== 'columns', height: H(spec, Math.max(180, W * .4))});
        return {h: c.h, svg: c.svg, legend: legendOf(S.map(([, n, col]) => [n, col])), desc: 'Part de ceux qui savaient signer'};
    }
    /* ═════════ D36 ✅ Ce que tu as prouvé ═════════ */
    function proof(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({gen: Math.round(num(r.gen)), expected: num(r.expected), found: num(r.found), ...Object.fromEntries(['b', 'm', 'd'].flatMap(k => ['s', 'e', 'x'].flatMap(t => [[k + t, num(r[k + t])], ['i' + k + t, pidList(r['i' + k + t])]])))})).filter(r => r.gen > 0).sort((a, b) => a.gen - b.gen);
        if (!list.length) return empty(W, fs, 'Ajoute des générations : pour chaque acte, combien sont sourcés, sans source, manquants.');
        const cs = color(o.cSource, '#2e9e5b'), ce = color(o.cEvent, '#f2c94c'), cx = color(o.cMissing, '#d5dae1');
        const ACTS = [['b', 'Naissance'], ['m', 'Mariage'], ['d', 'Décès']], lw = textW('Génération 12', fs * .85) + 10, fw = textW('128 / 2 048', fs * .78) + 14, cw = (W - lw - fw) / 3, rowH = clamp(num(o.cellH) || fs * 1.9, 14, 60);
        let s = T(lw + fw / 2, fs * .6, 'Trouvés', {size: fs * .78, anchor: 'middle', weight: 700});
        ACTS.forEach(([, n], i) => { s += T(lw + fw + i * cw + cw / 2, fs * .6, n, {size: fs * .85, anchor: 'middle', weight: 700}); });
        list.forEach((r, j) => {
            const y = fs * 1.4 + j * (rowH + 3);
            s += T(lw - 6, y + rowH / 2, r.gen === 1 ? 'Départ' : `Génération ${r.gen}`, {size: fs * .85, anchor: 'end'}) + T(lw + fw / 2, y + rowH / 2, `${fmt(r.found, 0)} / ${fmt(r.expected, 0)}`, {size: fs * .78, anchor: 'middle', op: .85});
            ACTS.forEach(([k, n], i) => {
                const tot = r[k + 's'] + r[k + 'e'] + r[k + 'x'], x0 = lw + fw + i * cw + 3, w0 = cw - 8; let x = x0;
                if (!tot) { s += T(x0 + w0 / 2, y + rowH / 2, '—', {size: fs * .8, anchor: 'middle', op: .5}); return; }
                [['s', cs, 'sourcé'], ['e', ce, 'sans source'], ['x', cx, 'manquant']].forEach(([t, c, word]) => {
                    const v = r[k + t]; if (!v) return; const w = v / tot * w0, tt = `Génération ${r.gen} · ${n} : ${plural(v, 'acte')} ${word}${v > 1 && word !== 'sans source' ? 's' : ''}`;
                    s += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(rowH)}" fill="${c}"${PIDS(r['i' + k + t], tt)}>${tip(tt)}</rect>`;
                    if (w > textW(String(v), fs * .7) + 4) s += T(x + w / 2, y + rowH / 2, String(v), {size: fs * .7, anchor: 'middle', fill: inkOn(c)});
                    x += w;
                });
            });
        });
        const h = fs * 1.4 + list.length * (rowH + 3);
        const all = list.reduce((a, r) => { ACTS.forEach(([k]) => { a.s += r[k + 's']; a.t += r[k + 's'] + r[k + 'e'] + r[k + 'x']; }); return a; }, {s: 0, t: 0});
        const sum = o.summary !== false ? `${fmt(all.s / Math.max(1, all.t) * 100, 0)} % des actes attendus sont prouvés par une source.` : '';
        return {h: H(spec, h + (sum ? fs * 1.8 : 0)), svg: s + sentence(W, fs, h + fs, sum), legend: legendOf([['Sourcé', cs], ['Sans source', ce], ['Manquant', cx]]), desc: sum || 'Ce que tu as prouvé'};
    }
    /* ═════════ D37 📚 Registres consultés ═════════ */
    const REG_KINDS = {seen: ['Dépouillé', '#59a14f'], none: ['Vu, rien trouvé', '#f28e2b'], todo: ['À faire', '#c9ced6'], act: ['Acte trouvé (source)', '#1f5fa8']};
    function registers(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({place: str(r.place, 80), from: yearOf(r.from), to: yearOf(r.to) ?? yearOf(r.from), kind: REG_KINDS[str(r.kind)] ? str(r.kind) : 'seen'})).filter(r => r.place && r.from != null);
        if (!list.length) return empty(W, fs, 'Ajoute des lignes : la commune, les années vues (de… à…) et la sorte (dépouillé, vu sans rien, à faire, acte).');
        const places = [...new Set(list.map(r => r.place))].slice(0, clamp(num(o.max) || 25, 2, 60));
        const y0 = num(o.from) || Math.min(...list.map(r => r.from)), y1 = Math.max(y0 + 1, num(o.to) || Math.max(...list.map(r => r.to)));
        const lw = Math.min(W * .32, Math.max(...places.map(p => textW(p, fs * .85))) + 8), pw = W - lw - 6, X = y => lw + (clamp(y, y0, y1 + 1) - y0) / (y1 + 1 - y0) * pw, bh = clamp(num(o.barH) || fs * 1.3, 6, 40), gap = bh * .45;
        let s = '';
        places.forEach((p, i) => {
            const y = i * (bh + gap), mine = list.filter(r => r.place === p), lo = Math.min(...mine.map(r => r.from)), hi = Math.max(...mine.map(r => r.to));
            s += T(lw - 6, y + bh / 2, cut(p, lw - 8, fs * .85), {size: fs * .85, anchor: 'end'});
            if (o.gaps !== false) s += `<rect x="${r2(X(lo))}" y="${r2(y)}" width="${r2(X(hi + 1) - X(lo))}" height="${r2(bh)}" fill="#e15759" fill-opacity=".14"><title>${esc(`${p} : de ${lo} à ${hi} — en rouge pâle, les années pas encore vues`)}</title></rect>`;
            ['todo', 'seen', 'none', 'act'].forEach(k => mine.filter(r => r.kind === k).forEach(r => {
                const t = `${p} · ${r.from === r.to ? r.from : r.from + '–' + r.to} : ${REG_KINDS[k][0].toLowerCase()}`, c = color(o['c_' + k], REG_KINDS[k][1]);
                s += k === 'act' ? `<rect x="${r2(X(r.from))}" y="${r2(y + bh * .25)}" width="${r2(Math.max(2, X(r.to + 1) - X(r.from)))}" height="${r2(bh * .5)}" fill="${c}">${tip(t)}</rect>` : `<rect x="${r2(X(r.from))}" y="${r2(y)}" width="${r2(Math.max(2, X(r.to + 1) - X(r.from)))}" height="${r2(bh)}" fill="${c}">${tip(t)}</rect>`;
            }));
        });
        const h = places.length * (bh + gap); const tk = R.ticks(y0, y1, clamp(Math.round(pw / 70), 2, 14));
        tk.ticks.filter(v => v >= y0 && v <= y1).forEach(v => { s += `<line x1="${r2(X(v))}" x2="${r2(X(v))}" y1="0" y2="${r2(h)}" stroke="currentColor" stroke-opacity=".1"/>` + T(X(v), h + fs * .8, String(Math.round(v)), {size: fs * .78, anchor: 'middle'}); });
        return {h: H(spec, h + fs * 1.6), svg: s, legend: legendOf([...Object.entries(REG_KINDS).map(([k, [n, c]]) => [n, color(o['c_' + k], c)]), ...(o.gaps !== false ? [['Pas encore vu', '#f6d5d6']] : [])]), desc: 'Registres consultés'};
    }

    /* ═════════ Exemples ═════════ */
    const sampleInfant = () => [['1700', 220, 58, 92], ['1720', 240, 55, 88], ['1740', 251, 60, 95], ['1760', 263, 52, 84], ['1780', 270, 49, 80], ['1800', 281, 44, 70], ['1820', 290, 38, 60], ['1840', 300, 33, 52], ['1860', 296, 27, 41], ['1880', 284, 20, 30], ['1900', 260, 12, 17], ['1920', 230, 6, 8]].map(([label, n, d1, d5]) => ({label, n, d1, d5}));
    const sampleSiblings = () => [['Jean MARTIN & Marie DURAND', '1782', 11, 6, 4, 1], ['Pierre MARTIN & Rose LEROY', '1815', 8, 6, 2, 0], ['Louis BERNARD & Anne PETIT', '1798', 9, 4, 5, 0], ['Joseph MOREAU & Jeanne ROUX', '1840', 6, 5, 1, 0], ['Paul MARTIN & Léa FAURE', '1872', 4, 4, 0, 0]].map(([couple, year, born, adult, young, unknown]) => ({couple, year, born, adult, young, unknown}));
    const sampleSeasons = () => [['XVIIe s.', 'Naissances', [30, 34, 41, 38, 29, 24, 20, 18, 22, 27, 31, 29]], ['XVIIIe s.', 'Naissances', [52, 58, 66, 60, 49, 41, 36, 33, 41, 48, 51, 50]], ['XIXe s.', 'Naissances', [61, 60, 64, 62, 57, 52, 50, 48, 52, 56, 58, 60]],
        ['XVIIe s.', 'Décès', [40, 42, 39, 30, 22, 18, 24, 35, 38, 30, 28, 36]], ['XVIIIe s.', 'Décès', [55, 58, 52, 41, 30, 26, 33, 49, 52, 40, 37, 50]], ['XIXe s.', 'Décès', [58, 60, 55, 46, 37, 33, 36, 44, 45, 41, 43, 54]]]
        .map(([label, what, m]) => ({label, what, ...Object.fromEntries(m.map((v, i) => ['m' + (i + 1), v]))}));
    const sampleWidow = () => [['Jean', 'h', 4], ['Pierre', 'h', 7], ['Louis', 'h', 9], ['Joseph', 'h', 11], ['Paul', 'h', 14], ['Marc', 'h', 20], ['Henri', 'h', 30], ['Anne', 'f', 13], ['Marie', 'f', 18], ['Rose', 'f', 26], ['Jeanne', 'f', 40], ['Louise', 'f', 70], ['Léa', 'f', 22]].map(([name, sex, months]) => ({name, sex, months, year: ''}));
    const sampleDuration = () => [3, 8, 12, 15, 18, 21, 22, 25, 27, 30, 31, 34, 36, 38, 41, 44, 46, 50, 9, 14, 19, 24, 29, 33].map((years, i) => ({couple: `Couple ${i + 1}`, year: String(i % 2 ? 1760 + i * 3 : 1840 + i * 2), years}));
    const sampleParentage = () => Array.from({length: 60}, (_, i) => ({child: `Enfant ${i + 1}`, year: String(1700 + i * 4), fa: String(24 + (i * 7) % 20), ma: String(20 + (i * 5) % 18)}));
    const samplePrenup = () => [['XVIIe s.', 120, 1, 5], ['XVIIIe s.', 210, 4, 18], ['XIXe s.', 260, 14, 42], ['XXe s.', 180, 20, 30]].map(([label, n, before, early]) => ({label, n, before, early}));
    const sampleGap = () => [5, 3, 2, 8, 1, 0.5, 12, 4, -2, -1, 6, 3, 2, 7, -4, 9, 15, 2, 1, -0.5, 3, 4, 5, 11].map((gap, i) => ({couple: `Couple ${i + 1}`, gap, year: String(1750 + i * 6)}));
    const sampleCradle = () => [[1, 1, 0, 0, 0], [2, 2, 4, 4, 6], [3, 4, 9, 7, 22], [4, 8, 14, 11, 38], [5, 14, 21, 15, 64], [6, 22, 28, 18, 120], [7, 31, 35, 22, 210]].map(([gen, n, avg, median, max]) => ({gen, n, avg, median, max}));
    const sampleSign = () => [['1700', 30, 70, 8, 92, 40, 60], ['1750', 42, 58, 14, 86, 48, 52], ['1800', 55, 45, 25, 75, 60, 40], ['1850', 76, 24, 52, 48, 80, 20], ['1900', 96, 4, 92, 8, 97, 3]].map(([label, a, b, c, d, e, f]) => ({label, h1: a, h0: b, f1: c, f0: d, w1: e, w0: f}));
    const sampleProof = () => [[1, 1, 1, [1, 0, 0], [0, 0, 0], [0, 0, 0]], [2, 2, 2, [2, 0, 0], [1, 1, 0], [1, 1, 0]], [3, 4, 4, [3, 1, 0], [2, 1, 1], [2, 1, 1]], [4, 8, 7, [4, 2, 1], [3, 2, 2], [3, 2, 2]], [5, 16, 12, [5, 4, 3], [4, 4, 4], [3, 4, 5]], [6, 32, 15, [4, 6, 5], [3, 5, 7], [2, 6, 7]]]
        .map(([gen, expected, found, b, m, d]) => ({gen, expected, found, bs: b[0], be: b[1], bx: b[2], ms: m[0], me: m[1], mx: m[2], ds: d[0], de: d[1], dx: d[2]}));
    const sampleRegisters = () => [['Vitré', 1680, 1720, 'seen'], ['Vitré', 1721, 1740, 'none'], ['Vitré', 1760, 1792, 'seen'], ['Vitré', 1745, 1745, 'act'], ['Bais', 1700, 1730, 'seen'], ['Bais', 1731, 1790, 'todo'], ['Rennes', 1790, 1850, 'seen'], ['Rennes', 1815, 1815, 'act'], ['Fougères', 1810, 1830, 'none']]
        .map(([place, from, to, kind]) => ({place, from: String(from), to: String(to), kind}));

    /* ═════════ « Depuis l'app » ═════════ */
    const getV = q => A().api('diagram_vie', {...q, ...(window.LCNDA_EXT?.diagramAppOpts?.extra() || {})}); // + le groupe de personnes et la période communs
    const PK = (name, o = {}) => (window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name, kind: 'person', ...o}) : '');
    const startId = () => Number(A().state?.bootstrap?.startPersonId) || null;
    const rootField = (label = 'Personne de départ') => `<span class="pk-lab">${esc(label)}</span>${PK('dvi_root', {value: startId()})}`;
    const rootOf = pane => Number(pane.querySelector('[name="dvi_root"]')?.value) || startId() || 0;
    const val = (pane, k) => pane.querySelector(`[data-dvi="${k}"]`)?.value || '';
    const sel = (k, opts, def = '') => `<select data-dvi="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    // les classes h-dg-app / dfa-app / data-dfa-go : le même panneau que D1–D8 (le groupe de personnes et la période communs s'y ajoutent tout seuls)
    const box = (title, intro, inner, go = 'Prendre dans ma base') => `<div class="h-dg-app dfa-app"><h4>${title}</h4><p class="muted">${intro}</p>${inner}<button type="button" class="button small" data-dfa-go>${esc(go)}</button><p class="muted" data-dfa-msg aria-live="polite"></p></div>`;
    const SCOPE = `<label>Personnes comptées${sel('scope', [['', 'Toute ma base'], ['anc', 'Les ancêtres de la personne de départ'], ['desc', 'Les descendants de la personne de départ']])}</label>`;
    const STEP = (def = 10) => `<label>Par${sel('step', [[10, 'Décennie'], [25, 'Quart de siècle'], [50, 'Demi-siècle'], [100, 'Siècle']], def)}</label>`;
    const GENS = (def, min, max) => `<label>Générations${sel('gens', Array.from({length: max - min + 1}, (_, i) => [min + i, `${min + i} générations`]), def)}</label>`;
    function bindApp(pane, run) {
        const btn = pane.querySelector('[data-dfa-go]'), msg = pane.querySelector('[data-dfa-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = '<span class="ui-spinner" aria-hidden="true"></span> Lecture de ta généalogie…';
            try { const t = await run(); A().toast?.(t || 'Données prises dans ta base.'); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }
    const titleIf = (s, kind, t) => { s.o = s.o || {}; if (!s.o.title || s.o.title === K[kind].sample().o?.title) s.o.title = t; };
    const app = (kind, html, run) => ({html: () => html(), // le panneau est fabriqué à l'ouverture (la personne de départ du moment)
        bind: (pane, io) => bindApp(pane, async () => { const s = io.spec(); const msg = await run(pane, s); io.apply(s); return msg; })});
    const APPS = {
        vieenfants: app('vieenfants', () => box('👶 Les enfants de ma base', 'Chaque enfant né (ou baptisé) avec une date : mort avant 1 an, avant 5 ans, ou plus tard. Ceux dont on ne connaît pas le décès sont laissés de côté.', `${SCOPE}${rootField()}${STEP(25)}`),
            async (pane, s) => { const r = await getV({what: 'infant', step: val(pane, 'step'), scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun enfant avec une naissance et un décès connus.');
                s.rows = r.rows.map(x => ({label: x.label, n: String(x.n), d1: String(x.d1), d5: String(x.d5), ids1: x.ids1, ids5: x.ids5})); titleIf(s, 'vieenfants', 'Mortalité des enfants');
                return `${r.rows.length} périodes prises dans ta base${r.unknown ? ` (${r.unknown} personnes sans date de décès laissées de côté)` : ''}.`; }),
        viefratries: app('viefratries', () => box('👨‍👩‍👧 Les couples de ma base', 'Pour chaque couple : ses enfants, ceux arrivés à l’âge adulte et ceux morts jeunes.', `${SCOPE}${rootField()}<label>Adulte à partir de${sel('adult', [[15, '15 ans'], [18, '18 ans'], [20, '20 ans'], [21, '21 ans']], 15)}</label><label>Couples${sel('top', [[10, '10'], [20, '20'], [40, '40'], [60, '60']], 20)}</label>`),
            async (pane, s) => { const r = await getV({what: 'siblings', adult: val(pane, 'adult'), top: val(pane, 'top'), scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun couple avec des enfants.');
                s.rows = r.rows.map(x => ({couple: x.couple, year: x.year, born: String(x.born), adult: String(x.adult), young: String(x.young), unknown: String(x.unknown), ids_adult: x.ids_adult, ids_young: x.ids_young})); titleIf(s, 'viefratries', 'Les fratries qui ont survécu');
                return `${r.rows.length} couples pris dans ta base (sur ${r.couples}).`; }),
        viesaisons: app('viesaisons', () => box('🗓 Les naissances et les décès de ma base', 'Datés au mois près : combien chaque mois, période par période.', `${SCOPE}${rootField()}${STEP(100)}`),
            async (pane, s) => { const r = await getV({what: 'seasons', step: val(pane, 'step'), scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucune naissance ni aucun décès datés au mois près.');
                s.rows = [...r.rows.map(x => ({label: x.label, what: 'Naissances', ...Object.fromEntries(x.b.map((v, i) => ['m' + (i + 1), String(v)])), ...Object.fromEntries(x.ib.map((v, i) => ['i' + (i + 1), v]))})),
                    ...r.rows.map(x => ({label: x.label, what: 'Décès', ...Object.fromEntries(x.d.map((v, i) => ['m' + (i + 1), String(v)])), ...Object.fromEntries(x.id.map((v, i) => ['i' + (i + 1), v]))}))];
                titleIf(s, 'viesaisons', 'Saisons des naissances et des décès'); return `${r.rows.length} périodes prises dans ta base.`; }),
        vieveuvage: app('vieveuvage', () => box('💔 Les remariages de ma base', 'Les personnes mariées deux fois ou plus : le temps entre la mort du conjoint et le mariage suivant (les deux dates connues).', `${SCOPE}${rootField()}`),
            async (pane, s) => { const r = await getV({what: 'widow', scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun remariage avec la date du décès du conjoint et celle du nouveau mariage.');
                s.rows = r.rows.map(x => ({name: x.name, sex: x.sex, months: String(x.months), year: x.year, pid: String(x.pid)})); titleIf(s, 'vieveuvage', 'Combien de temps avant de se remarier');
                return `${r.rows.length} remariages pris dans ta base.`; }),
        viedurees: app('viedurees', () => box('⏳ Les mariages de ma base', 'De la date du mariage à la mort du premier des deux époux.', `${SCOPE}${rootField()}`),
            async (pane, s) => { const r = await getV({what: 'duration', scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun mariage daté dont un des époux a une date de décès.');
                s.rows = r.rows.map(x => ({couple: x.couple, year: x.year, years: String(x.years), pids: x.pids})); titleIf(s, 'viedurees', 'Durée des mariages');
                return `${r.rows.length} mariages pris dans ta base${r.open ? ` (${r.open} encore en cours ou sans date de décès)` : ''}.`; }),
        vieparents: app('vieparents', () => box('👴 Les naissances de ma base', 'Pour chaque enfant : l’âge de son père et de sa mère le jour de sa naissance.', `${SCOPE}${rootField()}`),
            async (pane, s) => { const r = await getV({what: 'parentage', scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun enfant dont un parent a une date de naissance.');
                s.rows = r.rows.map(x => ({child: x.child, year: x.year, fa: x.fa, ma: x.ma, cid: String(x.cid)})); titleIf(s, 'vieparents', 'Âge des parents à chaque naissance');
                return `${r.rows.length} naissances prises dans ta base.`; }),
        vieavant: app('vieavant', () => box('🤰 Les premiers enfants de ma base', 'Pour chaque mariage daté au mois près : le premier enfant est-il né avant, ou moins de 8 mois après ?', `${SCOPE}${rootField()}${STEP(100)}<label>« Tôt » : moins de${sel('limit', [[7, '7 mois'], [8, '8 mois'], [9, '9 mois']], 8)}</label>`),
            async (pane, s) => { const r = await getV({what: 'prenup', step: val(pane, 'step'), limit: val(pane, 'limit'), scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun mariage daté au mois près avec un enfant daté.');
                s.rows = r.rows.map(x => ({label: x.label, n: String(x.n), before: String(x.before), early: String(x.early), ids_before: x.ids_before, ids_early: x.ids_early})); titleIf(s, 'vieavant', 'Conceptions avant le mariage');
                return `${r.rows.reduce((a, x) => a + x.n, 0)} couples pris dans ta base.`; }),
        vieecart: app('vieecart', () => box('💑 Les couples de ma base', 'L’écart entre les dates de naissance du mari et de la femme.', `${SCOPE}${rootField()}`),
            async (pane, s) => { const r = await getV({what: 'agegap', scope: val(pane, 'scope'), root: rootOf(pane)}); if (!r.rows?.length) throw new Error('Aucun couple dont les deux époux ont une date de naissance.');
                s.rows = r.rows.map(x => ({couple: x.couple, gap: String(x.gap), year: x.year, pids: x.pids})); titleIf(s, 'vieecart', 'Écart d’âge entre époux'); return `${r.rows.length} couples pris dans ta base.`; }),
        vieberceau: app('vieberceau', () => box('🧭 L’ascendance d’une personne', 'Génération par génération : à quelle distance du lieu de référence sont nés ses ancêtres (les lieux ont besoin de leurs coordonnées).', `${rootField()}${GENS(8, 3, 14)}<label>Distance mesurée depuis${sel('ref', [['root', 'Le lieu de naissance de la personne'], ['oldest', 'Le centre des lieux de la génération la plus ancienne'], ['place', 'Un lieu que je choisis']], 'root')}</label><span class="pk-lab">Le lieu (si « un lieu que je choisis »)</span>${window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name: 'dvi_place', kind: 'place'}) : ''}`),
            async (pane, s) => { const ref = val(pane, 'ref'), place = Number(pane.querySelector('[name="dvi_place"]')?.value) || 0; if (ref === 'place' && !place) throw new Error('Choisis le lieu dans le menu.');
                const r = await getV({what: 'cradle', root: rootOf(pane), gens: val(pane, 'gens'), ref, place}); if (!r.rows?.length) throw new Error(r.missing ? 'Le lieu de référence n’a pas de coordonnées.' : 'Aucun ancêtre né dans un lieu situé.');
                s.rows = r.rows.map(x => ({gen: String(x.gen), n: String(x.n), avg: String(x.avg), median: String(x.median), max: String(x.max), ids: x.ids})); s.ref = r.ref; titleIf(s, 'vieberceau', `Loin du berceau — ${r.root_name}`);
                return `${r.rows.length} générations prises dans ta base.`; }),
        viesigner: app('viesigner', () => box('✍️ Les signatures notées dans ma base', 'Ceux qui ont signé l’acte, ou « ne sait pas signer » : à noter dans « Modifier un événement » (✍️ pour les époux, et pour chaque témoin).', `${STEP(25)}`),
            async (pane, s) => { const r = await getV({what: 'sign', step: val(pane, 'step')}); if (!r.rows?.length) throw new Error('Aucune signature notée pour l’instant : dans un événement, choisis « ✍️ A signé : oui / non » pour les époux et les témoins.');
                s.rows = r.rows.map(x => ({label: x.label, h1: String(x.h1), h0: String(x.h0), f1: String(x.f1), f0: String(x.f0), w1: String(x.w1), w0: String(x.w0)})); titleIf(s, 'viesigner', 'Savoir signer');
                return `${r.rows.length} périodes prises dans ta base.`; }),
        viepreuves: app('viepreuves', () => box('✅ L’ascendance d’une personne', 'Pour chaque génération d’ancêtres : les naissances, mariages et décès prouvés par une source, présents sans source, ou pas encore trouvés.', `${rootField()}${GENS(6, 2, 12)}`),
            async (pane, s) => { const r = await getV({what: 'proof', root: rootOf(pane), gens: val(pane, 'gens')}); if (!r.rows?.length) throw new Error('Aucun ancêtre trouvé pour cette personne.');
                s.rows = r.rows.map(x => ({...x, gen: String(x.gen), expected: String(x.expected), found: String(x.found)})); titleIf(s, 'viepreuves', `Ce que j’ai prouvé — ${r.root_name}`);
                return `${r.rows.length} générations prises dans ta base.`; }),
        vieregistres: app('vieregistres', () => box('📚 Mes dépouillements et mes actes', 'Pour chaque commune : les années des registres dépouillés (suivi des dépouillements) et des actes trouvés avec une source.', `<label>Communes${sel('top', [[8, '8'], [12, '12'], [20, '20'], [40, '40']], 12)}</label>`),
            async (pane, s) => { const r = await getV({what: 'registers', top: val(pane, 'top')}); if (!r.rows?.length) throw new Error('Aucun dépouillement avec des années, ni d’acte sourcé avec un lieu.');
                s.rows = r.rows; titleIf(s, 'vieregistres', 'Registres consultés'); return `${r.places} communes prises dans ta base.`; }),
    };

    /* ═════════ Les types ═════════ */
    const NEW = {
        vieenfants: {icon: '👶', label: 'Mortalité des enfants (avant 1 an, avant 5 ans)', group: 'Vie et mort', render: infant, legend: 'bottom', fromApp: APPS.vieenfants,
            help: 'La part des enfants morts avant 1 an et avant 5 ans, période par période.',
            grids: [{key: 'rows', label: 'Les périodes', cols: [C('label', 'Période (ex. 1780)'), C('n', 'Enfants nés', 'number'), C('d1', 'Morts avant 1 an', 'number'), C('d5', 'Morts avant 5 ans', 'number')]}],
            options: [C('show', 'Montrer', 'select', {choices: [['', 'La part en %'], ['count', 'Le nombre']]}), C('chart', 'Dessin', 'select', {choices: [['', 'Colonnes'], ['line', 'Courbe']]}), C('five', 'Aussi « avant 5 ans »', 'check', {def: true}),
                C('c1', 'Couleur « avant 1 an »', 'color', {def: '#c0392b'}), C('c5', 'Couleur « avant 5 ans »', 'color', {def: '#f0a35e'}), C('values', 'Écrire les nombres', 'check'), C('summary', 'Phrase de résumé', 'check', {def: true}), H_OPT],
            sample: () => ({o: {title: 'Mortalité des enfants'}, rows: sampleInfant()})},
        viefratries: {icon: '👨‍👩‍👧', label: 'Fratries qui survivent (enfants nés, arrivés adultes)', group: 'Vie et mort', render: siblings, legend: 'bottom', fromApp: APPS.viefratries,
            help: 'Pour chaque couple, ses enfants : arrivés à l’âge adulte, morts jeunes, ou dont on ne sait pas.',
            grids: [{key: 'rows', label: 'Les couples', cols: [C('couple', 'Couple'), C('year', 'Année'), C('born', 'Enfants nés', 'number'), C('adult', 'Arrivés adultes', 'number'), C('young', 'Morts jeunes', 'number'), C('unknown', 'On ne sait pas', 'number')]}],
            options: [C('sort', 'Ordre', 'select', {choices: [['', 'Le plus d’enfants d’abord'], ['young', 'Le plus de morts jeunes d’abord'], ['year', 'Par année'], ['given', 'Comme dans le tableau']]}), C('max', 'Couples au plus', 'range', {min: 3, max: 80, def: 25}),
                C('cAdult', 'Couleur « adultes »', 'color', {def: '#59a14f'}), C('cYoung', 'Couleur « morts jeunes »', 'color', {def: '#5f6b7a'}), C('cUnknown', 'Couleur « on ne sait pas »', 'color', {def: '#d5dae1'}), C('barH', 'Épaisseur des barres', 'range', {min: 8, max: 40, def: 18}), C('summary', 'Phrase de résumé', 'check', {def: true})],
            sample: () => ({o: {title: 'Les fratries de la famille'}, rows: sampleSiblings()})},
        viesaisons: {icon: '🗓', label: 'Saisons des naissances et des décès (mois × époque)', group: 'Vie et mort', render: seasons, noLegend: true, fromApp: APPS.viesaisons,
            help: 'Un damier : chaque mois de l’année, pour chaque époque. Plus c’est foncé, plus il y a de naissances (ou de décès).',
            grids: [{key: 'rows', label: 'Les lignes (une période et une sorte, puis les 12 mois)', cols: [C('label', 'Période'), C('what', 'Sorte', 'select', {choices: [['Naissances', 'Naissances'], ['Décès', 'Décès']]}), ...MONTHS.map((m, i) => C('m' + (i + 1), m, 'number'))]}],
            options: [C('show', 'Montrer', 'select', {choices: [['both', 'Naissances et décès'], ['births', 'Les naissances'], ['deaths', 'Les décès']], def: 'both'}), C('share', 'Comparer les mois (part de l’année, en %)', 'check', {def: true}), C('values', 'Écrire les nombres', 'check'),
                C('cBirth', 'Couleur des naissances', 'color', {def: '#2e7d4f'}), C('cDeath', 'Couleur des décès', 'color', {def: '#5f2a2a'}), C('cellH', 'Hauteur des cases', 'range', {min: 10, max: 50, def: 22}), H_OPT],
            sample: () => ({o: {title: 'Saisons des naissances et des décès'}, rows: sampleSeasons()})},
        vieveuvage: {icon: '💔', label: 'Veuvage et remariage (délai avant de se remarier)', group: 'Couples et familles', render: widow, legend: 'bottom', fromApp: APPS.vieveuvage,
            help: 'Combien de temps attendaient les veufs et les veuves avant de se remarier.',
            grids: [{key: 'rows', label: 'Les remariages', cols: [C('name', 'Personne'), C('sex', 'Sexe', 'select', {choices: [['h', 'Homme'], ['f', 'Femme']]}), C('months', 'Délai', 'number', {unit: 'mois'}), C('year', 'Année du veuvage')]}],
            options: [C('cMen', 'Couleur des hommes', 'color', {def: '#4e79a7'}), C('cWomen', 'Couleur des femmes', 'color', {def: '#e15759'}), C('values', 'Écrire les nombres', 'check'), C('summary', 'Phrase de résumé', 'check', {def: true}), H_OPT],
            sample: () => ({o: {title: 'Combien de temps avant de se remarier'}, rows: sampleWidow()})},
        viedurees: {icon: '⏳', label: 'Durée des mariages (jusqu’à la mort d’un époux)', group: 'Couples et familles', render: duration, legend: 'bottom', fromApp: APPS.viedurees,
            help: 'Combien d’années duraient les mariages, de la noce à la mort du premier des deux.',
            grids: [{key: 'rows', label: 'Les mariages', cols: [C('couple', 'Couple'), C('year', 'Année du mariage'), C('years', 'Durée', 'number', {unit: 'ans'})]}],
            options: [C('step', 'Tranches de', 'select', {choices: [['5', '5 ans'], ['10', '10 ans'], ['2', '2 ans']], def: '5'}), C('split', 'Couleurs', 'select', {choices: [['', 'Une seule'], ['century', 'Par siècle du mariage']]}), C('values', 'Écrire les nombres', 'check'), C('summary', 'Phrase de résumé', 'check', {def: true}), H_OPT],
            sample: () => ({o: {title: 'Durée des mariages', split: 'century'}, rows: sampleDuration()})},
        vieparents: {icon: '👴', label: 'Âge des parents à chaque naissance (nuage de points)', group: 'Couples et familles', render: parentage, legend: 'bottom', fromApp: APPS.vieparents,
            help: 'Chaque naissance est un point : l’âge du père (et celui de la mère) selon l’année.',
            grids: [{key: 'rows', label: 'Les naissances', cols: [C('child', 'Enfant'), C('year', 'Année de naissance'), C('fa', 'Âge du père', 'number', {unit: 'ans'}), C('ma', 'Âge de la mère', 'number', {unit: 'ans'})]}],
            options: [C('who', 'Montrer', 'select', {choices: [['both', 'Le père et la mère'], ['father', 'Le père'], ['mother', 'La mère']], def: 'both'}), C('trend', 'Moyenne par quart de siècle (ligne)', 'check', {def: true}),
                C('cFather', 'Couleur du père', 'color', {def: '#4e79a7'}), C('cMother', 'Couleur de la mère', 'color', {def: '#e15759'}), C('dot', 'Taille des points', 'range', {min: 1, max: 8, step: .5, def: 3}), H_OPT],
            sample: () => ({o: {title: 'Âge des parents à chaque naissance'}, rows: sampleParentage()})},
        vieavant: {icon: '🤰', label: 'Conceptions avant mariage (premier enfant « trop tôt »)', group: 'Couples et familles', render: prenup, legend: 'bottom', fromApp: APPS.vieavant,
            help: 'La part des premiers enfants nés avant le mariage, ou moins de 8 mois après.',
            grids: [{key: 'rows', label: 'Les périodes', cols: [C('label', 'Période'), C('n', 'Couples', 'number'), C('before', 'Né avant le mariage', 'number'), C('early', 'Né moins de 8 mois après', 'number')]}],
            options: [C('show', 'Montrer', 'select', {choices: [['', 'La part en %'], ['count', 'Le nombre']]}), C('cBefore', 'Couleur « avant »', 'color', {def: '#b07aa1'}), C('cEarly', 'Couleur « moins de 8 mois »', 'color', {def: '#f28e2b'}), C('values', 'Écrire les nombres', 'check'), C('summary', 'Phrase de résumé', 'check', {def: true}), H_OPT],
            sample: () => ({o: {title: 'Conceptions avant le mariage'}, rows: samplePrenup()})},
        vieecart: {icon: '💑', label: 'Écart d’âge entre époux (pyramide)', group: 'Couples et familles', render: agegap, noLegend: true, fromApp: APPS.vieecart,
            help: 'À gauche les couples où le mari est plus âgé, à droite ceux où la femme est plus âgée, par tranches d’écart.',
            grids: [{key: 'rows', label: 'Les couples', cols: [C('couple', 'Couple'), C('gap', 'Écart (ans, + = le mari est plus âgé)', 'number'), C('year', 'Année')]}],
            options: [C('cHusband', 'Couleur « mari plus âgé »', 'color', {def: '#4e79a7'}), C('cWife', 'Couleur « femme plus âgée »', 'color', {def: '#e15759'}), C('barH', 'Épaisseur des barres', 'range', {min: 8, max: 40, def: 20}), C('summary', 'Phrase de résumé', 'check', {def: true})],
            sample: () => ({o: {title: 'Écart d’âge entre époux'}, rows: sampleGap()})},
        vieberceau: {icon: '🧭', label: 'Loin du berceau (distance par génération)', group: 'Lieux', render: cradle, noLegend: true, fromApp: APPS.vieberceau,
            help: 'À chaque génération d’ancêtres, la distance moyenne entre leur lieu de naissance et le lieu de référence.',
            grids: [{key: 'rows', label: 'Les générations', cols: [C('gen', 'Génération (1 = la personne)', 'number'), C('n', 'Lieux connus', 'number'), C('avg', 'Distance moyenne', 'number', {unit: 'km'}), C('median', 'Distance médiane', 'number', {unit: 'km'}), C('max', 'Le plus loin', 'number', {unit: 'km'})]}],
            options: [C('value', 'Mesure', 'select', {choices: [['', 'Moyenne'], ['median', 'Médiane']]}), C('showMax', 'Trait : le plus loin', 'check'), C('barColor', 'Couleur des barres', 'color', {def: '#4e79a7'}), C('barH', 'Épaisseur des barres', 'range', {min: 8, max: 40, def: 20}), C('summary', 'Phrase sous le dessin', 'check', {def: true})],
            sample: () => ({o: {title: 'Loin du berceau'}, ref: 'lieu de naissance de la personne', rows: sampleCradle()})},
        viesigner: {icon: '✍️', label: 'Savoir signer (époux, épouses, témoins)', group: 'Ma recherche', render: sign, legend: 'bottom', fromApp: APPS.viesigner,
            help: 'La part de ceux qui ont signé l’acte (époux, épouses, témoins), période par période.',
            grids: [{key: 'rows', label: 'Les périodes', cols: [C('label', 'Période'), C('h1', 'Hommes : ont signé', 'number'), C('h0', 'Hommes : n’ont pas signé', 'number'), C('f1', 'Femmes : ont signé', 'number'), C('f0', 'Femmes : n’ont pas signé', 'number'), C('w1', 'Témoins : ont signé', 'number'), C('w0', 'Témoins : n’ont pas signé', 'number')]}],
            options: [C('chart', 'Dessin', 'select', {choices: [['', 'Courbes'], ['columns', 'Colonnes']]}), C('cMen', 'Couleur des hommes', 'color', {def: '#4e79a7'}), C('cWomen', 'Couleur des femmes', 'color', {def: '#e15759'}), C('cWitness', 'Couleur des témoins', 'color', {def: '#59a14f'}), H_OPT],
            sample: () => ({o: {title: 'Savoir signer'}, rows: sampleSign()})},
        viepreuves: {icon: '✅', label: 'Ce que tu as prouvé (actes sourcés par génération)', group: 'Ma recherche', render: proof, legend: 'bottom', fromApp: APPS.viepreuves,
            help: 'Pour chaque génération d’ancêtres : naissances, mariages et décès prouvés par une source (vert), sans source (jaune) ou manquants (gris).',
            grids: [{key: 'rows', label: 'Les générations', cols: [C('gen', 'Génération', 'number'), C('expected', 'Ancêtres possibles', 'number'), C('found', 'Trouvés', 'number'), ...[['b', 'Naissance'], ['m', 'Mariage'], ['d', 'Décès']].flatMap(([k, n]) => [C(k + 's', `${n} : sourcée`, 'number'), C(k + 'e', `${n} : sans source`, 'number'), C(k + 'x', `${n} : manquante`, 'number')])]}],
            options: [C('cSource', 'Couleur « sourcé »', 'color', {def: '#2e9e5b'}), C('cEvent', 'Couleur « sans source »', 'color', {def: '#f2c94c'}), C('cMissing', 'Couleur « manquant »', 'color', {def: '#d5dae1'}), C('cellH', 'Hauteur des lignes', 'range', {min: 14, max: 50, def: 24}), C('summary', 'Phrase de résumé', 'check', {def: true})],
            sample: () => ({o: {title: 'Ce que j’ai prouvé'}, rows: sampleProof()})},
        vieregistres: {icon: '📚', label: 'Registres consultés (années vues et trous)', group: 'Ma recherche', render: registers, legend: 'bottom', fromApp: APPS.vieregistres,
            help: 'Pour chaque commune, une frise des années : dépouillées, vues sans rien trouver, à faire, actes trouvés ; en rouge pâle, les trous.',
            grids: [{key: 'rows', label: 'Les registres', cols: [C('place', 'Commune'), C('from', 'De (année)'), C('to', 'À (année)'), C('kind', 'Sorte', 'select', {choices: Object.entries(REG_KINDS).map(([k, [n]]) => [k, n])})]}],
            options: [C('gaps', 'Montrer les trous (rouge pâle)', 'check', {def: true}), C('max', 'Communes au plus', 'range', {min: 2, max: 60, def: 25}), C('from', 'Début (année, vide = auto)', 'number'), C('to', 'Fin (année, vide = auto)', 'number'), C('barH', 'Épaisseur des bandes', 'range', {min: 6, max: 40, def: 16}),
                ...Object.entries(REG_KINDS).map(([k, [n, c]]) => C('c_' + k, `Couleur « ${n} »`, 'color', {def: c}))],
            sample: () => ({o: {title: 'Registres consultés'}, rows: sampleRegisters()})},
    };
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }
    ext.diagramVie = {infant, siblings, seasons, widow, duration, parentage, prenup, agegap, cradle, sign, proof, registers, KINDS: Object.keys(NEW), median};
})();
