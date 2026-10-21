/* LCNDA — 📊 Diagrammes du lot « ADN et chiffres » (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  ADN :     🧬 peinture des chromosomes (22 paires + X, côté père / côté mère, colorés par branche) ;
 *            📏 règle des cM (les cM partagés sur une échelle, avec les parentés possibles du Shared cM Project) ;
 *  Chiffres : 🏔 vagues (ridgeline : une répartition par groupe, en vagues superposées), ⚫ échelle de points
 *            (Cleveland), 🔁 tableau de mobilité (métier du père × métier de l'enfant) ;
 *  Parts :   🧱 mosaïque à largeur variable (Marimekko), 🌹 rose de Nightingale (aires polaires).
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, app | fromApp}.
 * Données de l'arbre : api.php?action=dna (lib/dna.php : tests, correspondances, segments, groupes),
 *   diagram_numbers (âges, métiers : lib/diagram_chiffres.php), diagram_adn_numbers (mobilité, mois, âges moyens :
 *   lib/diagram_adn_chiffres.php). Clic sur une personne (ou un groupe de personnes) : sa fiche, ou la liste.
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const A = () => window.LCNDA_APP;

    /* ─── Petits outils (les mêmes règles que le dessin commun) ─── */
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : R.num(v)), color = R.color, ticks = R.ticks;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number.isFinite(Number(n)) ? Number(n) : 0);
    const TAU = Math.PI * 2;
    const blank = v => v === undefined || v === null || String(v).trim() === '';
    const isNum = v => typeof v === 'number' ? Number.isFinite(v) : /^\s*[-+]?[\d\s  ]*[.,]?\d+\s*$/.test(String(v ?? ''));
    const BIG = 1e12, val = v => clamp(num(v), -BIG, BIG);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const FOLD = new Map();
    const fold = v => { const k = String(v ?? ''); let f = FOLD.get(k); if (f === undefined) { f = k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); if (FOLD.size > 5000) FOLD.clear(); FOLD.set(k, f); } return f; };
    const pal = spec => R.PALETTES[spec.o?.palette] || R.PALETTES.vive;
    const pick = (spec, i, c) => color(c, pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = '', op = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r2(x)} ${r2(y)})"` : ''}${style ? ` font-style="${style}"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'}), legend: [], desc: msg});
    const rowsOf = (spec, key = 'rows', max = 20000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return hex(a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1))); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const pidOf = r => { const n = Math.floor(num(r?.pid)); return n > 0 && n < 1e9 ? n : 0; };
    const pidsOf = list => [...new Set(list.map(Number).filter(n => Number.isInteger(n) && n > 0 && n < 1e9))].slice(0, 300);
    const MAX_SERIES = 40, MAX_CATS = 300;
    /** catégories × séries (comme les colonnes des autres types) */
    function table(spec) {
        const series = (Array.isArray(spec.series) && spec.series.length ? spec.series : [{name: 'Valeur'}]).slice(0, MAX_SERIES).map((s, j) => ({name: String(s?.name || `Série ${j + 1}`), color: pick(spec, j, s?.color)}));
        const cats = rowsOf(spec, 'rows', MAX_CATS).map((r, i) => ({label: String(r.label ?? ''), color: r.color, i, v: series.map((_, j) => isNum(r['s' + j]) ? val(r['s' + j]) : null)}));
        return {series, cats};
    }
    const unitOf = o => (o.unit ? ' ' + String(o.unit).slice(0, 30) : '');
    const quant = (sorted, p) => { if (!sorted.length) return 0; const h = (sorted.length - 1) * p, lo = Math.floor(h); return sorted[lo] + (sorted[Math.min(sorted.length - 1, lo + 1)] - sorted[lo]) * (h - lo); };
    /** courbe douce passant par les points, sans dépasser en hauteur entre deux points */
    function smooth(pts, move = true) {
        if (!pts.length) return '';
        let d = (move ? 'M' : 'L') + r2(pts[0][0]) + ' ' + r2(pts[0][1]);
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
            d += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(clamp(p1[1] + (p2[1] - p0[1]) / 6, lo, hi))} ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(clamp(p2[1] - (p3[1] - p1[1]) / 6, lo, hi))} ${r2(p2[0])} ${r2(p2[1])}`;
        }
        return d;
    }
    const P = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    function wedge(cx, cy, r0, r1, a0, a1) {
        if (a1 - a0 >= TAU - 1e-6) { const ring = r => `M${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(cx + r)} ${r2(cy)}Z`; return r0 > .5 ? ring(r1) + ring(r0) : ring(r1); }
        const lg = a1 - a0 > Math.PI ? 1 : 0, [x1, y1] = P(cx, cy, r1, a0), [x2, y2] = P(cx, cy, r1, a1);
        if (r0 <= .5) return `M${r2(cx)} ${r2(cy)}L${r2(x1)} ${r2(y1)}A${r2(r1)} ${r2(r1)} 0 ${lg} 1 ${r2(x2)} ${r2(y2)}Z`;
        const [x3, y3] = P(cx, cy, r0, a1), [x4, y4] = P(cx, cy, r0, a0);
        return `M${r2(x1)} ${r2(y1)}A${r2(r1)} ${r2(r1)} 0 ${lg} 1 ${r2(x2)} ${r2(y2)}L${r2(x3)} ${r2(y3)}A${r2(r0)} ${r2(r0)} 0 ${lg} 0 ${r2(x4)} ${r2(y4)}Z`;
    }
    /** une personne cliquable (sa fiche), ou un groupe de personnes (la liste) */
    const who1 = pid => pid ? ` data-dac-pid="${pid}" style="cursor:pointer"` : '';
    const whoN = (ids, title) => { const l = pidsOf(ids); return l.length ? ` data-dac-pids="${l.join(',')}" data-dac-title="${esc(String(title).slice(0, 160))}" style="cursor:pointer"` : ''; };

    /* ═════════ ADN : chromosomes et table des cM ═════════ */
    // longueurs en mégabases (GRCh37), comme le navigateur de chromosomes de l'onglet ADN
    const CHR = [['1', 249.25], ['2', 243.2], ['3', 198.02], ['4', 191.15], ['5', 180.92], ['6', 171.12], ['7', 159.14], ['8', 146.36], ['9', 141.21], ['10', 135.53], ['11', 135.01], ['12', 133.85],
        ['13', 115.17], ['14', 107.35], ['15', 102.53], ['16', 90.35], ['17', 81.2], ['18', 78.08], ['19', 59.13], ['20', 63.03], ['21', 48.13], ['22', 51.3], ['X', 155.27]];
    const CHR_LEN = new Map(CHR);
    const mb = v => { const n = Math.abs(num(v)); return n > 1e5 ? n / 1e6 : n; }; // positions en paires de bases ou en Mb
    const CHR_MEMO = new Map();
    const chrOf = v => { const key = typeof v === 'number' || typeof v === 'string' ? v : ''; let c = CHR_MEMO.get(key); if (c !== undefined) return c;
        c = String(key).trim().toUpperCase().replace(/^CHR(OMOSOME)?\s*/, ''); if (c === '23') c = 'X'; c = CHR_LEN.has(c) ? c : ''; if (CHR_MEMO.size < 500) CHR_MEMO.set(key, c); return c; };
    const f1 = n => String(Math.round(n * 10) / 10).replace('.', ','); // rapide, pour les milliers de bulles
    const sideOf = v => { const t = fold(v); if (!t) return ''; if (/^(p|pat|pere|paternal|paternel|father|cote pere|cote du pere)/.test(t)) return 'P'; if (/^(m|mat|mere|maternal|maternel|mother|cote mere|cote de la mere)/.test(t)) return 'M'; if (/^(both|les deux|deux|b)$/.test(t)) return 'B'; return ''; };
    const SIDE_NAME = {P: 'côté père', M: 'côté mère', B: 'des deux côtés', '': 'côté inconnu'};
    // Shared cM Project (Blaine Bettinger, v4, 2020) : relation, code, moyenne, minimum, maximum — comme l'onglet ADN
    const SCP_OWN = [['Parent / enfant', 'P', 3485, 2376, 3720], ['Frère ou sœur', 'FS', 2613, 1613, 3488], ['Demi-frère ou demi-sœur', 'HS', 1759, 1160, 2436], ['Grand-parent / petit-enfant', 'GP', 1754, 984, 2462],
        ['Oncle, tante / neveu, nièce', 'AU', 1741, 1201, 2282], ['Arrière-grand-parent', 'GGP', 887, 485, 1486], ['Grand-oncle, grand-tante', 'GAU', 850, 330, 1467], ['Demi-oncle, demi-tante', 'HAU', 871, 492, 1315],
        ['Cousin germain (1C)', '1C', 866, 396, 1397], ['Demi-cousin germain', 'H1C', 449, 156, 979], ['Cousin germain, une génération d’écart (1C1R)', '1C1R', 433, 102, 980], ['Cousin germain, deux générations d’écart (1C2R)', '1C2R', 221, 33, 471],
        ['Demi-cousin germain, une génération d’écart', 'H1C1R', 224, 57, 530], ['Cousin issu de germain (2C)', '2C', 229, 41, 592], ['Demi-cousin issu de germain', 'H2C', 120, 9, 397], ['Cousin issu de germain, une génération d’écart (2C1R)', '2C1R', 122, 14, 353],
        ['Cousin issu de germain, deux générations d’écart (2C2R)', '2C2R', 71, 0, 261], ['Cousin au 3e degré (3C, issu d’issu de germain)', '3C', 73, 0, 234], ['Demi-cousin au 3e degré', 'H3C', 48, 0, 168], ['3C1R', '3C1R', 48, 0, 192],
        ['Cousin au 4e degré (4C)', '4C', 35, 0, 139], ['Cousin au 5e degré (5C)', '5C', 25, 0, 117], ['Cousin au 6e degré ou plus', '6C', 20, 0, 86]];
    const SCP = () => (Array.isArray(ext.dnaInternals?.SCP) && ext.dnaInternals.SCP.length > 10 ? ext.dnaInternals.SCP : SCP_OWN);
    const MAIN_REL = new Set(['P', 'FS', 'HS', 'GP', 'AU', 'GGP', '1C', 'H1C', '1C1R', '2C', '2C1R', '3C', '4C', '5C', '6C']);
    /** les relations possibles pour un nombre de cM, de la plus probable à la moins probable (indicatif, comme l'onglet ADN) */
    function guess(cm) {
        cm = num(cm); if (cm <= 0) return [];
        const sc = SCP().filter(r => cm >= r[3] * .9 && cm <= r[4] * 1.05).map(r => { const sd = Math.max(8, (r[4] - r[3]) / 4); return {r, w: Math.exp(-(((cm - r[2]) / sd) ** 2) / 2) + 1e-6}; });
        const tot = sc.reduce((a, x) => a + x.w, 0) || 1;
        return sc.map(x => ({name: x.r[0], code: x.r[1], avg: x.r[2], min: x.r[3], max: x.r[4], p: x.w / tot})).sort((a, b) => b.p - a.p);
    }
    const hashColor = (spec, s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return pick(spec, h % 12); };

    /* ═════════ 🧬 Peinture des chromosomes ═════════ */
    /** longueur couverte (Mb) par une liste d'intervalles [a, b] (les chevauchements comptés une fois) */
    const covered = list => { const s = list.slice().sort((x, y) => x[0] - y[0]); let tot = 0, a = -1, b = -1; s.forEach(([x, y]) => { if (x > b) { if (b > a) tot += b - a; a = x; b = y; } else b = Math.max(b, y); }); if (b > a) tot += b - a; return tot; };
    function chromo(spec, W, fs) {
        const o = spec.o || {}, minCm = clamp(num(o.minCm), 0, 200), showX = o.showX !== false, by = o.colorBy || 'branch', pair = o.layout !== 'one';
        const given = new Map(rowsOf(spec, 'branches', 200).filter(b => str(b.name)).map(b => [fold(b.name), color(b.color, '')]));
        const order = new Map(rowsOf(spec, 'branches', 200).filter(b => str(b.name)).map((b, i) => [fold(b.name), i]));
        const segs = rowsOf(spec).map((r, i) => {
            const c = chrOf(r.chr), a0 = mb(r.start), b0 = mb(r.end); if (!c || !(b0 > a0) && !(a0 > b0)) return null;
            const L = CHR_LEN.get(c), a = clamp(Math.min(a0, b0), 0, L), b = clamp(Math.max(a0, b0), 0, L); if (!(b > a)) return null;
            return {i, c, a, b, cm: Math.max(0, num(r.cm)), match: str(r.match, 120) || 'Correspondance', side: sideOf(r.side), branch: str(r.branch, 120), col: color(r.color, ''), pid: pidOf(r)};
        }).filter(s => s && (!minCm || !s.cm || s.cm >= minCm) && (showX || s.c !== 'X'));
        const MAXSEG = 3000, hidden = Math.max(0, segs.length - MAXSEG); // au-delà, illisible : les plus longs d'abord
        if (hidden) { segs.sort((x, y) => (y.b - y.a) - (x.b - x.a)); segs.length = MAXSEG; }
        if (!segs.length) return empty(W, fs, rowsOf(spec).length ? 'Aucun segment à montrer (vérifie le chromosome, le début et la fin, ou le minimum de cM).' : 'Ajoute des segments : chromosome, début, fin (en Mb ou en paires de bases), cM, correspondance.');
        // couleur de chaque segment
        const branchIdx = new Map(); segs.forEach(s => { const k = fold(s.branch); if (s.branch && !branchIdx.has(k)) branchIdx.set(k, order.has(k) ? order.get(k) : 100 + branchIdx.size); });
        const bOrder = [...branchIdx.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k), bColor = new Map(bOrder.map((k, i) => [k, given.get(k) || pick(spec, i)]));
        const patC = color(o.patColor, '#4e79a7'), matC = color(o.matColor, '#e15759'), noneC = '#9aa3ad';
        const colOf = s => s.col || (by === 'match' ? hashColor(spec, s.match) : by === 'side' ? (s.side === 'P' ? patC : s.side === 'M' ? matC : s.side === 'B' ? '#8e6bb8' : noneC) : s.branch ? bColor.get(fold(s.branch)) : noneC);
        const list = CHR.filter(([c]) => showX || c !== 'X');
        const nCols = num(o.cols) >= 1 ? clamp(Math.round(num(o.cols)), 1, 2) : (W >= 760 ? 2 : 1);
        const per = Math.ceil(list.length / nCols), gapC = fs * 1.5, colW = (W - gapC * (nCols - 1)) / nCols, labW = fs * 1.9;
        const barH = clamp(num(o.barHeight) || fs * 1.05, 5, 40), inner = pair ? barH * 2 + 2 : barH, rowH = inner + clamp(fs * .7, 4, 14);
        const maxL = Math.max(...list.slice(0, per).map(c => c[1])), k = (colW - labW - 4) / maxL;
        const head = fs * 1.6;
        const byChr = new Map(); segs.forEach(s => { if (!byChr.has(s.c)) byChr.set(s.c, []); byChr.get(s.c).push(s); });
        // part du génome peinte, de chaque côté
        const genome = list.reduce((a, c) => a + c[1], 0);
        const cov = side => list.reduce((a, [c]) => a + covered((byChr.get(c) || []).filter(s => s.side === side || s.side === 'B' || (!pair && side === 'any')).map(s => [s.a, s.b])), 0) / genome * 100;
        const pP = cov('P'), pM = cov('M'), pAny = pair ? 0 : cov('any');
        let svg = T(0, fs * .6, (pair ? `Peint : ${fmt(pP)} % côté père · ${fmt(pM)} % côté mère` : `Peint : ${fmt(pAny)} % du génome`) + (hidden ? ` (${fmt(hidden, 0)} petits segments non montrés)` : ''), {size: fs * .85, op: .75})
            + (pair ? T(W, fs * .6, '▲ père  ▼ mère', {size: fs * .78, anchor: 'end', op: .6}) : '');
        const labels = o.labels !== false, wCache = new Map(), nameW = m => { let w = wCache.get(m); if (w === undefined) { w = textW(m, fs * .7); wCache.set(m, w); } return w; };
        list.forEach(([c, L], idx) => {
            const col = Math.floor(idx / per), row = idx % per, x0 = col * (colW + gapC), y0 = head + row * rowH, bx = x0 + labW, bw = L * k;
            svg += T(x0 + labW - 6, y0 + inner / 2, c, {size: fs * .85, anchor: 'end', weight: 600});
            const track = (y, h, t) => `<rect x="${r2(bx)}" y="${r2(y)}" width="${r2(bw)}" height="${r2(h)}" rx="${r2(Math.min(h / 2, 6))}" fill="currentColor" fill-opacity=".09" stroke="currentColor" stroke-opacity=".22" stroke-width=".7">${tip(t)}</rect>`;
            if (pair) svg += track(y0, barH, `Chromosome ${c} — copie reçue du père (${fmt(L)} Mb)`) + track(y0 + barH + 2, barH, `Chromosome ${c} — copie reçue de la mère`);
            else svg += track(y0, barH, `Chromosome ${c} (${fmt(L)} Mb)`);
            (byChr.get(c) || []).sort((x, y) => (y.b - y.a) - (x.b - x.a)).forEach(s => { // les plus longs dessous, les petits restent visibles
                const fill = colOf(s), x = bx + s.a * k, w = Math.max(1.5, (s.b - s.a) * k);
                const t = `${s.match} — chromosome ${c} : ${f1(s.a)} à ${f1(s.b)} Mb${s.cm ? `, ${f1(s.cm)} cM` : ''}${s.branch ? ' · ' + s.branch : ''} · ${SIDE_NAME[s.side]}${s.pid ? ' (clic : sa fiche)' : ''}`;
                const ys = !pair ? [[y0, barH, 1]] : s.side === 'P' ? [[y0, barH, 1]] : s.side === 'M' ? [[y0 + barH + 2, barH, 1]] : s.side === 'B' ? [[y0, barH, 1], [y0 + barH + 2, barH, 1]] : [[y0, barH * 2 + 2, .45]];
                svg += `<g${who1(s.pid)}>${ys.map(([y, h, op]) => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}" fill-opacity="${op === 1 ? .9 : op}"${op < 1 ? ` stroke="${fill}" stroke-dasharray="2 2" stroke-width=".8"` : ''}/>`).join('')}${tip(t)}`;
                if (labels && barH >= fs * .75 && w > fs * 2 && w > nameW(s.match) + 6) svg += T(x + w / 2, ys[0][0] + ys[0][1] / 2 + .5, s.match, {size: fs * .7, anchor: 'middle', fill: contrast(fill)});
                svg += '</g>';
            });
        });
        const h = head + per * rowH;
        let legend;
        if (by === 'side') legend = [{label: 'Côté père', color: patC}, {label: 'Côté mère', color: matC}, ...(segs.some(s => s.side === 'B') ? [{label: 'Les deux', color: '#8e6bb8'}] : []), ...(segs.some(s => !s.side) ? [{label: 'Côté inconnu', color: noneC}] : [])];
        else if (by === 'match') { const seen = new Map(); segs.forEach(s => { if (!seen.has(s.match) && seen.size < 20) seen.set(s.match, s.col || hashColor(spec, s.match)); }); legend = [...seen].map(([label, c]) => ({label, color: c})); }
        else legend = [...bOrder.slice(0, 20).map(k2 => ({label: segs.find(s => fold(s.branch) === k2).branch, color: bColor.get(k2)})), ...(segs.some(s => !s.branch) ? [{label: 'Branche inconnue', color: noneC}] : [])];
        const nMatch = new Set(segs.map(s => s.match)).size;
        return {h, svg, legend, desc: `Peinture des chromosomes : ${segs.length} segment${segs.length > 1 ? 's' : ''} de ${nMatch} correspondance${nMatch > 1 ? 's' : ''}${pair ? `, ${fmt(pP)} % du génome côté père et ${fmt(pM)} % côté mère` : ''}.`};
    }

    /* ═════════ 📏 Règle des cM ═════════ */
    function cmRuler(spec, W, fs) {
        const o = spec.o || {}, logS = o.scale !== 'lin';
        const matches = rowsOf(spec, 'rows', 3000).map((r, i) => ({i, name: str(r.name, 120) || `Correspondance ${i + 1}`, cm: clamp(num(r.cm), 0, 4000), side: sideOf(r.side), known: str(r.known, 120), pid: pidOf(r)})).filter(m => m.cm > 0);
        const rels = SCP().filter(r => o.set === 'all' || MAIN_REL.has(r[1]));
        const maxCm = clamp(num(o.maxCm) || 3720, 50, 4000), minLog = 5;
        const hl = fold(o.highlight), hm = hl ? matches.find(m => fold(m.name).includes(hl)) : null, probs = hm ? new Map(guess(hm.cm).map(g => [g.code, g.p])) : null;
        const narrow = W < 520, labW = Math.min(narrow ? W * .34 : W * .3, Math.max(...rels.map(r => textW(r[0], fs * .82))) + 10), plotW = Math.max(60, W - labW - (probs ? fs * 3 : fs * 1.5));
        const X = v => labW + (logS ? (Math.log10(Math.max(minLog, Math.min(maxCm, v))) - Math.log10(minLog)) / (Math.log10(maxCm) - Math.log10(minLog)) : Math.min(maxCm, v) / maxCm) * plotW;
        const tks = logS ? [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 3500].filter(v => v <= maxCm) : ticks(0, maxCm, narrow ? 4 : 7).ticks.filter(v => v <= maxCm);
        const patC = color(o.patColor, '#4e79a7'), matC = color(o.matColor, '#e15759'), oneC = color(o.dotColor, '#2e7d6b'), bandC = color(o.bandColor, '#8a94a6');
        const dotC = m => o.colorBy === 'one' ? oneC : m.side === 'P' ? patC : m.side === 'M' ? matC : m.side === 'B' ? '#8e6bb8' : oneC;
        // les correspondances : des points posés en essaim au-dessus de l'échelle
        const rad = clamp(num(o.dot) || fs * .38, 2, 12), sorted = matches.slice().sort((a, b) => b.cm - a.cm), placed = [];
        const maxUp = 14; let top = 0;
        sorted.forEach(m => { const x = X(m.cm); let lv = 0; while (lv < maxUp && placed.some(p => p.lv === lv && Math.abs(p.x - x) < rad * 2.05)) lv++; placed.push({m, x, lv}); top = Math.max(top, lv); });
        const nLab = clamp(Math.round(num(o.labels ?? 8)), 0, 40), labFs = fs * .72;
        const stripH = matches.length ? (top + 1) * rad * 2.1 + rad + (nLab ? fs * 1.2 : 0) : 0, axisY = stripH + fs * 1.4;
        let svg = '', labs = '';
        let lastX = -1e9; tks.filter(v => { const x = X(v), ok = x - lastX >= textW(fmt(v, 0), fs * .78) + fs * .6; if (ok) lastX = x; return ok; }).forEach(v => { const x = X(v); svg += `<line x1="${r2(x)}" y1="${r2(axisY)}" x2="${r2(x)}" y2="${r2(axisY + fs * .4 + rels.length * fs * 1.75)}" stroke="currentColor" stroke-opacity=".1"/>` + T(x, axisY - fs * .55, fmt(v, 0), {size: fs * .78, anchor: 'middle', op: .75}); });
        svg += `<line x1="${r2(labW)}" y1="${r2(axisY)}" x2="${r2(labW + plotW)}" y2="${r2(axisY)}" stroke="currentColor" stroke-opacity=".5"/>` + T(labW - 6, axisY - fs * .55, 'cM', {size: fs * .78, anchor: 'end', weight: 600, op: .75});
        const boxes = [];
        placed.forEach(({m, x, lv}, k) => {
            const y = stripH - rad - lv * rad * 2.1, c = dotC(m), g3 = guess(m.cm).slice(0, 3).map(g => `${g.name} ${fmt(g.p * 100, 0)} %`).join(' · ');
            const dim = hm && hm !== m;
            svg += `<g${who1(m.pid)}${dim ? ' opacity=".35"' : ''}><circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(rad)}" fill="${c}" stroke="#fff" stroke-width=".8">${tip(`${m.name} : ${fmt(m.cm)} cM${m.known ? ` — parenté connue : ${m.known}` : ''}${g3 ? ` — parentés possibles : ${g3}` : ''}${m.pid ? ' (clic : sa fiche)' : ''}`)}</circle></g>`;
            if (k < nLab || m === hm) { const w = textW(m.name, labFs), bx = Math.min(x - w / 2, W - w), by = y - rad - labFs * .75 - (lv ? 0 : 0);
                if (lv === top || m === hm) { const box = [bx, by - labFs * .6, w, labFs * 1.2]; if (!boxes.some(b => box[0] < b[0] + b[2] + 3 && box[0] + box[2] + 3 > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) { boxes.push(box); labs += T(Math.max(0, bx), by, cut(m.name, W, labFs), {size: labFs, weight: m === hm ? 700 : 400}); } }
                else { const box = [x + rad + 2, y - labFs * .6, w, labFs * 1.2]; if (box[0] + w < W && !boxes.some(b => box[0] < b[0] + b[2] + 3 && box[0] + box[2] + 3 > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1]) && !placed.some(p => p !== placed[k] && Math.abs(p.x - (x + rad + 2 + w / 2)) < w / 2 + rad && Math.abs((stripH - rad - p.lv * rad * 2.1) - y) < rad * 1.5)) { boxes.push(box); labs += T(box[0], y, m.name, {size: labFs}); } } }
        });
        // les parentés : une barre de la plus petite à la plus grande valeur observée, un trait à la moyenne
        let y = axisY + fs * .5; const bh = fs * 1.05;
        rels.forEach(r => {
            const p = probs?.get(r[1]) || 0, on = !probs || p > 0, x1 = X(Math.max(r[3], logS ? minLog : 0)), x2 = X(r[4]), xa = X(r[2]);
            const n = matches.filter(m => m.cm >= r[3] && m.cm <= r[4]).length, c = probs ? (on ? mix(bandC, '#1f6feb', .75) : bandC) : bandC;
            svg += `<g opacity="${on ? 1 : .35}">` + T(labW - 6, y + bh / 2, cut(r[0], labW - 8, fs * .82), {size: fs * .82, anchor: 'end', weight: probs && p >= .15 ? 700 : 400})
                + `<rect x="${r2(x1)}" y="${r2(y)}" width="${r2(Math.max(2, x2 - x1))}" height="${r2(bh)}" rx="${r2(bh / 2)}" fill="${c}" fill-opacity="${probs && on ? .45 + p * .5 : .3}">${tip(`${r[0]} : en moyenne ${fmt(r[2], 0)} cM, de ${fmt(r[3], 0)} à ${fmt(r[4], 0)} cM — ${n} de tes correspondances dans cette fourchette${probs ? ` — pour ${hm.name} : ${fmt(p * 100, 0)} %` : ''}`)}</rect>`
                + (o.showAvg !== false ? `<line x1="${r2(xa)}" y1="${r2(y - 1)}" x2="${r2(xa)}" y2="${r2(y + bh + 1)}" stroke="${mix(c, '#000000', .45)}" stroke-width="2"/>` : '')
                + (probs && p >= .01 ? T(labW + plotW + 4, y + bh / 2, `${fmt(p * 100, 0)} %`, {size: fs * .75, weight: 700}) : '') + '</g>';
            y += fs * 1.75;
        });
        if (hm) { const x = X(hm.cm); svg += `<line x1="${r2(x)}" y1="${r2(stripH - rad)}" x2="${r2(x)}" y2="${r2(y)}" stroke="#1f6feb" stroke-width="1.6" stroke-dasharray="4 3"/>`; }
        if (!matches.length) svg += T(labW + plotW / 2, fs * .4, 'Ajoute tes correspondances (nom, cM) : elles se placent sur la règle.', {size: fs * .85, anchor: 'middle', op: .6});
        const legend = o.colorBy === 'one' ? [] : [{label: 'Côté père', color: patC, s: 'P'}, {label: 'Côté mère', color: matC, s: 'M'}, {label: 'Les deux', color: '#8e6bb8', s: 'B'}, {label: 'Côté inconnu', color: oneC, s: ''}].filter(l => matches.some(m => m.side === l.s)).map(({label, color: c}) => ({label, color: c}));
        return {h: y + fs * .3, svg: `<g transform="translate(0 ${r2(fs * .2)})">${svg}${labs}</g>`, legend, desc: `Règle des cM : ${matches.length} correspondance${matches.length > 1 ? 's' : ''} placée${matches.length > 1 ? 's' : ''} sur une échelle ${logS ? 'logarithmique' : 'linéaire'} de ${rels.length} parentés (Shared cM Project).`};
    }

    /* ═════════ 🏔 Vagues (ridgeline) ═════════ */
    function groupsOf(spec, max = 40) {
        const groups = new Map();
        rowsOf(spec, 'rows', 20000).forEach((r, i) => { if (!isNum(r.value)) return; const g = str(r.group, 80) || 'Toutes'; if (!groups.has(g)) { if (groups.size >= max) return; groups.set(g, {name: g, vals: [], pids: [], color: '', i: groups.size}); }
            const G = groups.get(g); G.vals.push(val(r.value)); const p = pidOf(r); if (p) G.pids.push(p); if (!G.color && r.color) G.color = color(r.color, ''); });
        return [...groups.values()];
    }
    /** densité (noyau gaussien) sur une grille de points, par paquets : rapide même avec 20 000 valeurs */
    function density(vals, lo, hi, n, bw) {
        const step = (hi - lo) / (n - 1) || 1, bins = new Float64Array(n), out = new Array(n).fill(0);
        vals.forEach(v => { bins[clamp(Math.round((v - lo) / step), 0, n - 1)]++; });
        const reach = Math.min(n, Math.ceil(bw * 4 / step)), ker = new Float64Array(reach + 1), norm = vals.length * bw * Math.sqrt(TAU) || 1;
        for (let d = 0; d <= reach; d++) { const z = d * step / bw; ker[d] = Math.exp(-z * z / 2) / norm; } // le noyau calculé une fois
        for (let j = 0; j < n; j++) { const b = bins[j]; if (!b) continue; for (let k = Math.max(0, j - reach); k <= Math.min(n - 1, j + reach); k++) out[k] += b * ker[Math.abs(k - j)]; }
        return out;
    }
    function ridgeline(spec, W, fs) {
        const o = spec.o || {}, u = unitOf(o); let gs = groupsOf(spec).filter(g => g.vals.length);
        if (!gs.length) return empty(W, fs, 'Ajoute des valeurs avec leur groupe (siècle, sexe, branche…) : une vague par groupe.');
        gs.forEach(g => { g.sorted = g.vals.slice().sort((a, b) => a - b); g.md = quant(g.sorted, .5); });
        if (o.order === 'median') gs = gs.slice().sort((a, b) => a.md - b.md); else if (o.order === 'count') gs = gs.slice().sort((a, b) => b.vals.length - a.vals.length); else if (o.order === 'reverse') gs = gs.slice().reverse();
        const all = gs.flatMap(g => g.vals); let lo = Math.min(...all), hi = Math.max(...all);
        if (!blank(o.min) && isNum(o.min)) lo = val(o.min); if (!blank(o.max) && isNum(o.max)) hi = val(o.max); if (!(hi > lo)) hi = lo + 1;
        const tk = ticks(lo, hi, W < 500 ? 4 : 7); lo = tk.lo; hi = tk.hi;
        const n = clamp(Math.round(W / 4), 60, 240), sd = v => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); };
        const labW = Math.min(W * .3, Math.max(...gs.map(g => textW(g.name, fs))) + fs * .8), plotW = Math.max(60, W - labW - 8);
        const rowH = clamp(num(o.rowHeight) || fs * 3.2, 16, 160), over = clamp(num(o.overlap ?? 120), 0, 300) / 100, peakH = rowH * (1 + over);
        const X = v => labW + (v - lo) / (hi - lo) * plotW, top = peakH - rowH + fs * .4;
        gs.forEach(g => { const iqr = quant(g.sorted, .75) - quant(g.sorted, .25), spread = Math.min(sd(g.vals) || Infinity, iqr > 0 ? iqr / 1.34 : Infinity), bw = num(o.bw) > 0 ? num(o.bw) : Math.max((hi - lo) / 150, .9 * (Number.isFinite(spread) ? spread : (hi - lo) / 20) * g.vals.length ** -.2); g.bw = bw; g.d = density(g.vals, lo, hi, n, bw); g.peak = Math.max(...g.d) || 1; });
        const maxPeak = Math.max(...gs.map(g => g.peak)), maxN = Math.max(...gs.map(g => g.vals.length));
        const op = clamp(num(o.opacity ?? 75), 10, 100) / 100, grad = o.colors === 'gradient', c0 = color(o.lowColor, '#9ecae1'), c1 = color(o.highColor, '#08519c'), one = o.colors === 'one' ? color(o.oneColor, '#4e79a7') : '';
        let svg = '';
        tk.ticks.forEach(v => { const x = X(v); svg += `<line x1="${r2(x)}" y1="${r2(top - peakH + rowH)}" x2="${r2(x)}" y2="${r2(top + gs.length * rowH)}" stroke="currentColor" stroke-opacity=".08"/>` + T(x, top + gs.length * rowH + fs, fmt(v, 1), {size: fs * .85, anchor: 'middle'}); });
        gs.forEach((g, i) => {
            const base = top + (i + 1) * rowH, H = peakH * (o.scaleBy === 'count' ? g.vals.length / maxN : o.scaleBy === 'same' ? g.peak / maxPeak : 1);
            const pts = g.d.map((d, k) => [labW + plotW * k / (n - 1), base - d / g.peak * H]);
            const c = one || (grad ? mix(c0, c1, gs.length > 1 ? i / (gs.length - 1) : 1) : pick(spec, g.i, g.color));
            const mean = g.vals.reduce((a, b) => a + b, 0) / g.vals.length;
            svg += `<g${whoN(g.pids, `${g.name} — ${g.vals.length} personne${g.vals.length > 1 ? 's' : ''}`)}><path d="${smooth(pts)}L${r2(labW + plotW)} ${r2(base)}L${r2(labW)} ${r2(base)}Z" fill="${c}" fill-opacity="${op}" stroke="${o.bg === 'transparent' ? c : '#ffffff'}" stroke-width="1.4">${tip(`${g.name} : ${g.vals.length} valeur${g.vals.length > 1 ? 's' : ''}, médiane ${fmt(g.md)}${u}, moyenne ${fmt(mean)}${u}, de ${fmt(g.sorted[0])} à ${fmt(g.sorted[g.sorted.length - 1])}${u}${g.pids.length ? ' (clic : la liste)' : ''}`)}</path>`
                + `<path d="${smooth(pts)}" fill="none" stroke="${mix(c, '#000000', .35)}" stroke-width="1.2"/></g>`;
            if (o.median !== false) { const x = X(g.md), k = clamp(Math.round((g.md - lo) / (hi - lo) * (n - 1)), 0, n - 1), yTop = base - g.d[k] / g.peak * H; svg += `<line x1="${r2(x)}" y1="${r2(base)}" x2="${r2(x)}" y2="${r2(yTop)}" stroke="${contrast(c) === '#ffffff' ? '#ffffff' : '#1d1d1f'}" stroke-width="1.6" stroke-dasharray="3 2">${tip(`${g.name} : médiane ${fmt(g.md)}${u}`)}</line>`; }
            svg += T(labW - 6, base - fs * .45, cut(g.name, labW - 8, fs), {size: fs, anchor: 'end', weight: 600}) + (o.counts !== false ? T(labW - 6, base + fs * .45, `${fmt(g.vals.length, 0)}`, {size: fs * .7, anchor: 'end', op: .6}) : '');
        });
        let h = top + gs.length * rowH + fs * 1.8;
        if (o.xLabel) { svg += T(labW + plotW / 2, h + fs * .3, o.xLabel, {size: fs * .85, anchor: 'middle', weight: 600}); h += fs * 1.4; }
        return {h, svg, legend: [], desc: `Vagues : ${gs.length} groupe${gs.length > 1 ? 's' : ''}, ${all.length} valeurs, de ${fmt(Math.min(...all))} à ${fmt(Math.max(...all))}${u}.`};
    }

    /* ═════════ 🧱 Mosaïque à largeur variable (Marimekko) ═════════ */
    function marimekko(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec), u = unitOf(o);
        let cols = cats.map(c => ({...c, tot: c.v.reduce((a, v) => a + Math.max(0, v || 0), 0)})).filter(c => c.tot > 0);
        if (!cols.length) return empty(W, fs, 'Ajoute des colonnes (lignes du tableau) et leurs parts (séries) : la largeur suit le total.');
        if (o.sort === 'size') cols = cols.slice().sort((a, b) => b.tot - a.tot);
        const showV = o.values !== false && o.values !== 'false', grand = cols.reduce((a, c) => a + c.tot, 0), left = fs * 2.6, plotW = Math.max(60, W - left - 4), plotH = clamp(num(o.height) || W * .5, 120, 1600);
        const gap = clamp(num(o.gap ?? 2), 0, 20), usable = plotW - gap * (cols.length - 1);
        let svg = [0, 25, 50, 75, 100].map(p => { const y = plotH - p / 100 * plotH; return `<line x1="${r2(left)}" y1="${r2(y)}" x2="${r2(left + plotW)}" y2="${r2(y)}" stroke="currentColor" stroke-opacity="${p ? .1 : .4}"/>` + T(left - 5, y, `${p} %`, {size: fs * .78, anchor: 'end'}); }).join('');
        let x = left; const vf = fs * .75;
        cols.forEach(c => {
            const w = Math.max(1, c.tot / grand * usable); let y = plotH;
            series.forEach((s, j) => { const v = Math.max(0, c.v[j] || 0); if (!v) return; const h = v / c.tot * plotH; y -= h;
                svg += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${s.color}" stroke="${o.border === false ? 'none' : color(o.borderColor, '#ffffff')}" stroke-width=".8">${tip(`${c.label} · ${s.name} : ${fmt(v)}${u} (${fmt(v / c.tot * 100)} % de ${c.label}, ${fmt(v / grand * 100)} % du tout)`)}</rect>`;
                if (showV && w > textW('100 %', vf) + 4 && h > vf * 1.3) svg += T(x + w / 2, y + h / 2, o.values === 'num' ? fmt(v) : `${fmt(v / c.tot * 100, 0)} %`, {size: vf, anchor: 'middle', fill: contrast(s.color)});
                else if (showV && w > vf * 1.4 && h > textW('100 %', vf) + 4) svg += T(x + w / 2, y + h / 2, o.values === 'num' ? fmt(v) : `${fmt(v / c.tot * 100, 0)} %`, {size: vf, anchor: 'middle', fill: contrast(s.color), rotate: -90});
            });
            const lab = cut(c.label, w - 2, fs * .85);
            if (lab) svg += T(x + w / 2, plotH + fs * .9, lab, {size: fs * .85, anchor: 'middle', weight: 600});
            if (o.widths !== false && w > textW('100 %', fs * .72)) svg += T(x + w / 2, plotH + fs * 2.05, `${fmt(c.tot / grand * 100, 0)} %`, {size: fs * .72, anchor: 'middle', op: .6});
            x += w + gap;
        });
        return {h: plotH + fs * (o.widths !== false ? 2.8 : 1.8), svg, legend: series.map(s => ({label: s.name, color: s.color})), desc: `Mosaïque de ${cols.length} colonnes (largeur = part du total ${fmt(grand)}${u}) et ${series.length} séries.`};
    }

    /* ═════════ ⚫ Échelle de points (Cleveland) ═════════ */
    function dotplot(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec), u = unitOf(o);
        let list = cats.filter(c => c.v.some(v => v !== null));
        if (!list.length) return empty(W, fs, 'Ajoute des lignes et leurs valeurs (une colonne par série, ex. femmes et hommes).');
        const first = c => c.v.find(v => v !== null) ?? 0;
        if (o.sort === 'desc') list = list.slice().sort((a, b) => first(b) - first(a)); else if (o.sort === 'asc') list = list.slice().sort((a, b) => first(a) - first(b)); else if (o.sort === 'az') list = list.slice().sort((a, b) => a.label.localeCompare(b.label, 'fr', {numeric: true}));
        else if (o.sort === 'gap' && series.length > 1) list = list.slice().sort((a, b) => ((b.v[1] ?? 0) - (b.v[0] ?? 0)) - ((a.v[1] ?? 0) - (a.v[0] ?? 0)));
        const all = list.flatMap(c => c.v.filter(v => v !== null)); let lo = Math.min(...all), hi = Math.max(...all);
        if (o.fromZero) lo = Math.min(0, lo); if (!(hi > lo)) { hi = lo + 1; }
        const tk = ticks(lo, hi, W < 500 ? 4 : 6), hlt = fold(o.highlight);
        const labW = Math.min(W * .34, Math.max(...list.map(c => textW(c.label, fs * .92))) + 10), plotW = Math.max(60, W - labW - fs * 2.5), rowH = clamp(num(o.rowHeight) || fs * 2, 12, 60);
        const X = v => labW + (v - tk.lo) / (tk.hi - tk.lo || 1) * plotW, rad = clamp(num(o.dot) || fs * .42, 2, 16), top = fs * 1.2;
        let svg = tk.ticks.map(v => `<line x1="${r2(X(v))}" y1="${r2(top - fs * .4)}" x2="${r2(X(v))}" y2="${r2(top + list.length * rowH)}" stroke="currentColor" stroke-opacity="${v === 0 ? .4 : .1}"/>` + T(X(v), top - fs * .75, fmt(v, 1), {size: fs * .8, anchor: 'middle'}) + T(X(v), top + list.length * rowH + fs * .8, fmt(v, 1), {size: fs * .8, anchor: 'middle'})).join('');
        list.forEach((c, i) => {
            const y = top + (i + .5) * rowH, vs = c.v.map((v, j) => [v, j]).filter(([v]) => v !== null), dim = hlt && !fold(c.label).includes(hlt);
            let g = `<g${dim ? ' opacity=".25"' : ''}>`;
            if (i % 2 === 0 && o.stripes !== false) g += `<rect x="0" y="${r2(y - rowH / 2)}" width="${r2(W)}" height="${r2(rowH)}" fill="currentColor" fill-opacity=".035"/>`;
            if (o.guide !== 'none') { const a = o.guide === 'range' ? X(Math.min(...vs.map(x => x[0]))) : labW, b = o.guide === 'range' ? X(Math.max(...vs.map(x => x[0]))) : labW + plotW;
                g += `<line x1="${r2(a)}" y1="${r2(y)}" x2="${r2(b)}" y2="${r2(y)}" stroke="currentColor" stroke-opacity="${o.guide === 'range' ? .45 : .22}" stroke-width="${o.guide === 'range' ? 2 : 1}"${o.guide === 'range' ? '' : ' stroke-dasharray="1 3"'}/>`; }
            g += T(labW - 6, y, cut(c.label, labW - 8, fs * .92), {size: fs * .92, anchor: 'end', weight: dim ? 400 : 600});
            vs.forEach(([v, j]) => { const col = series.length === 1 ? color(c.color, color(o.dotColor, series[0].color)) : series[j].color;
                g += `<circle cx="${r2(X(v))}" cy="${r2(y)}" r="${r2(rad)}" fill="${col}" stroke="#ffffff" stroke-width="1">${tip(`${c.label}${series.length > 1 ? ' · ' + series[j].name : ''} : ${fmt(v)}${u}`)}</circle>`; });
            if (o.values !== false && vs.length) { const mx = vs.reduce((a, b) => (b[0] > a[0] ? b : a)); const tx = X(mx[0]) + rad + 4; const txt = vs.length === 2 && series.length === 2 && o.showGap !== false ? `${fmt(mx[0])}${u} (écart ${fmt(Math.abs(vs[1][0] - vs[0][0]))})` : `${fmt(mx[0])}${u}`;
                const mn = vs.reduce((a, b) => (b[0] < a[0] ? b : a)), lx = X(mn[0]) - rad - 4, tw = textW(txt, fs * .75);
                if (tx + tw < W) g += T(tx, y, txt, {size: fs * .75, op: .8}); else if (lx - tw > labW) g += T(lx, y, txt, {size: fs * .75, anchor: 'end', op: .8}); }
            svg += g + '</g>';
        });
        let h = top + list.length * rowH + fs * 1.5;
        if (o.xLabel) { svg += T(labW + plotW / 2, h + fs * .4, o.xLabel, {size: fs * .85, anchor: 'middle', weight: 600}); h += fs * 1.4; }
        return {h, svg, legend: series.length > 1 ? series.map(s => ({label: s.name, color: s.color})) : [], desc: `Échelle de points : ${list.length} lignes, ${series.length} série${series.length > 1 ? 's' : ''}.`};
    }

    /* ═════════ 🌹 Rose de Nightingale (aires polaires) ═════════ */
    function nightingale(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec), u = unitOf(o), list = cats.slice(0, 72);
        const totals = list.map(c => c.v.reduce((a, v) => a + Math.max(0, v || 0), 0)), stack = o.mode !== 'overlap';
        const vmax = stack ? Math.max(0, ...totals) : Math.max(0, ...list.flatMap(c => c.v.map(v => Math.max(0, v || 0))));
        if (!list.length || !(vmax > 0)) return empty(W, fs, 'Ajoute des parts (mois, saisons…) et leurs chiffres (une colonne par série).');
        const hMax = num(o.height) > 80 ? num(o.height) : 1e9, labR = o.labels !== false ? fs * 1.6 : 2;
        const Rm = Math.max(40, Math.min(W / 2 - labR - (W < 500 ? textW('Sept.', fs * .85) * .4 : textW('Sept.', fs * .85)), hMax / 2 - labR)), cx = W / 2, cy = Rm + labR + 2;
        const hole = Rm * clamp(num(o.hole ?? 8), 0, 60) / 100, areaS = o.area !== false;
        const rad = v => hole + (Rm - hole) * (areaS ? Math.sqrt(Math.max(0, v) / vmax) : Math.max(0, v) / vmax);
        const n = list.length, step = TAU / n, a0 = -Math.PI / 2 + clamp(num(o.start), -360, 360) * Math.PI / 180, padA = Math.min(step * .02, .008);
        let svg = '', ringLab = '';
        if (o.rings !== false) { const tk = ticks(0, vmax, 4).ticks.filter(v => v > 0 && v <= vmax * 1.0001); tk.forEach(v => { const r = rad(v); svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="none" stroke="currentColor" stroke-opacity=".14"/>`; ringLab += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-dasharray="2 3"/>` + T(cx + 3, cy - r - 2, fmt(v, 1), {size: fs * .68, weight: 600, baseline: 'auto'}); }); }
        list.forEach((c, i) => {
            const b0 = a0 + i * step + padA, b1 = a0 + (i + 1) * step - padA;
            if (stack) { let acc = 0; series.forEach((s, j) => { const v = Math.max(0, c.v[j] || 0); if (!v) return; const r0 = rad(acc), r1 = rad(acc + v); acc += v;
                svg += `<path d="${wedge(cx, cy, r0, r1, b0, b1)}" fill="${s.color}" fill-opacity=".88" stroke="${o.bg === 'transparent' && !o.lineColor ? 'none' : color(o.lineColor, '#ffffff')}" stroke-width=".8">${tip(`${c.label}${series.length > 1 ? ' · ' + s.name : ''} : ${fmt(v)}${u}${series.length > 1 ? ` (total ${fmt(totals[i])}${u})` : ''}`)}</path>`; }); }
            else series.map((s, j) => [s, Math.max(0, c.v[j] || 0)]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).forEach(([s, v]) => {
                svg += `<path d="${wedge(cx, cy, hole, rad(v), b0, b1)}" fill="${s.color}" fill-opacity=".62" stroke="${s.color}" stroke-width="1">${tip(`${c.label} · ${s.name} : ${fmt(v)}${u}`)}</path>`; });
            const am = (b0 + b1) / 2;
            if (o.labels !== false) { const [lx, ly] = P(cx, cy, Rm + fs * .9, am), ca = Math.cos(am); svg += T(lx, ly, cut(c.label, Math.max(fs * 3, step * Rm), fs * .85), {size: fs * .85, anchor: Math.abs(ca) < .25 ? 'middle' : ca > 0 ? 'start' : 'end', weight: 600}); }
            if (o.values && (stack ? totals[i] : 1) > 0) { const tv = stack ? totals[i] : Math.max(...c.v.map(v => v || 0)), [vx, vy] = P(cx, cy, Math.max(hole + fs, rad(tv) - fs * .8), am); if (step * rad(tv) > fs * 1.8) svg += T(vx, vy, fmt(tv, 0), {size: fs * .7, anchor: 'middle', weight: 700, fill: contrast(series[0].color)}); }
        });
        if (hole > fs) svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(hole)}" fill="currentColor" fill-opacity=".05"/>`;
        svg += ringLab;
        return {h: cy + Rm + labR + 2, svg, legend: series.length > 1 ? series.map(s => ({label: s.name, color: s.color})) : [], desc: `Rose de Nightingale : ${n} parts, ${series.length} série${series.length > 1 ? 's' : ''}${areaS ? ', l’aire de chaque part suit le chiffre' : ''}.`};
    }

    /* ═════════ 🔁 Tableau de mobilité (métier du père × métier de l'enfant) ═════════ */
    function mobility(spec, W, fs) {
        const o = spec.o || {}, kid = str(o.childWord, 30) || 'l’enfant', mode = o.mode || 'row';
        const groups = rowsOf(spec, 'groups', 300).filter(g => str(g.job) && str(g.group)).map(g => [fold(g.job), str(g.group, 60)]);
        const grp = s => { const f = fold(s); if (!f) return ''; const g = groups.find(([k]) => f === k) || groups.find(([k]) => f.includes(k)); return g ? g[1] : str(s, 60); };
        const cell = new Map(), names = new Map(), rowT = new Map(), colT = new Map(); let total = 0;
        rowsOf(spec, 'rows', 20000).forEach(r => { const a = grp(r.from), b = grp(r.to), c = blank(r.count) ? 1 : clamp(num(r.count), 0, 1e7); if (!a || !b || !(c > 0)) return;
            const ka = fold(a), kb = fold(b); if (!names.has(ka)) names.set(ka, a); if (!names.has(kb)) names.set(kb, b);
            const k = ka + '\u0001' + kb, x = cell.get(k) || {n: 0, pids: []}; x.n += c; if (Array.isArray(r.pids)) x.pids.push(...r.pids.slice(0, 300)); else if (pidOf(r)) x.pids.push(pidOf(r)); cell.set(k, x);
            rowT.set(ka, (rowT.get(ka) || 0) + c); colT.set(kb, (colT.get(kb) || 0) + c); total += c; });
        if (!total) return empty(W, fs, 'Ajoute des lignes : métier du père, métier de l’enfant, combien.');
        const topN = clamp(Math.round(num(o.top) || 10), 2, 40), weight = new Map([...names.keys()].map(k => [k, (rowT.get(k) || 0) + (colT.get(k) || 0)]));
        let keep = [...names.keys()].sort((a, b) => weight.get(b) - weight.get(a) || a.localeCompare(b, 'fr'));
        const rest = keep.slice(topN); keep = keep.slice(0, topN);
        const others = o.others !== false && rest.length, OTH = '\u0002autres';
        const map = k => (keep.includes(k) ? k : others ? OTH : null);
        if (o.sort === 'az') keep.sort((a, b) => names.get(a).localeCompare(names.get(b), 'fr'));
        const axis = [...keep, ...(others ? [OTH] : [])], label = k => (k === OTH ? `Autres (${rest.length})` : names.get(k));
        const M = new Map(); let shown = 0, same = 0;
        cell.forEach((x, k) => { const [ka, kb] = k.split('\u0001'), a = map(ka), b = map(kb); if (!a || !b) return; const kk = a + '\u0001' + b, y = M.get(kk) || {n: 0, pids: []}; y.n += x.n; if (y.pids.length < 300) y.pids.push(...x.pids.slice(0, 300 - y.pids.length)); M.set(kk, y); shown += x.n; if (ka === kb) same += x.n; });
        const rT = new Map(), cT = new Map(); M.forEach((x, k) => { const [a, b] = k.split('\u0001'); rT.set(a, (rT.get(a) || 0) + x.n); cT.set(b, (cT.get(b) || 0) + x.n); });
        const lf = fs * .85, labW = Math.min(W * .32, Math.max(...axis.map(k => textW(label(k), lf))) + 8), totW = o.totals !== false ? fs * 2.8 : 0;
        const n = axis.length, cs = clamp((W - labW - totW - 4) / n, 8, fs * 4), headH = Math.min(160, Math.max(...axis.map(k => textW(cut(label(k), 130, lf), lf))) * .72 + fs * 1.2);
        const lowC = color(o.lowColor, '#eef3fb'), highC = color(o.highColor, '#1f4e8c'), diagC = color(o.diagColor, '#e8a33d'), statY = fs * .7, y0 = statY + fs * 1.2 + headH, x0 = labW;
        const share = (x, a, b) => mode === 'row' ? x.n / (rT.get(a) || 1) : mode === 'col' ? x.n / (cT.get(b) || 1) : x.n / (shown || 1);
        let maxS = 0; M.forEach((x, k) => { const [a, b] = k.split('\u0001'); maxS = Math.max(maxS, mode === 'count' ? x.n : share(x, a, b)); });
        let svg = T(0, statY, `Même métier que le père : ${fmt(same, 0)} sur ${fmt(total, 0)} (${fmt(same / total * 100)} %)`, {size: fs * .85, weight: 600});
        axis.forEach((k, j) => { const x = x0 + (j + .5) * cs; svg += T(x, y0 - 6, cut(label(k), 130, lf), {size: lf, anchor: 'start', rotate: -45, weight: 600, fill: 'currentColor'}); });
        svg += T(x0 - 6, y0 - 6, 'Père ↓ · ' + kid + ' →', {size: fs * .72, anchor: 'end', op: .65});
        axis.forEach((a, i) => {
            const y = y0 + i * cs;
            svg += T(x0 - 6, y + cs / 2, cut(label(a), labW - 8, lf), {size: lf, anchor: 'end', weight: 600});
            axis.forEach((b, j) => {
                const x = x0 + j * cs, c = M.get(a + '\u0001' + b), diag = a === b && a !== OTH;
                if (!c) { svg += `<rect x="${r2(x + .5)}" y="${r2(y + .5)}" width="${r2(cs - 1)}" height="${r2(cs - 1)}" fill="currentColor" fill-opacity=".03"${diag ? ` stroke="${diagC}" stroke-width="1.5"` : ''}/>`; return; }
                const s = share(c, a, b), t = (mode === 'count' ? c.n : s) / (maxS || 1), fill = mix(lowC, highC, Math.sqrt(t));
                const txt = mode === 'count' ? fmt(c.n, 0) : `${fmt(s * 100, s < .1 ? 1 : 0)}`;
                svg += `<g${whoN(c.pids, `Père ${label(a)} → ${kid} ${label(b)}`)}><rect x="${r2(x + .5)}" y="${r2(y + .5)}" width="${r2(cs - 1)}" height="${r2(cs - 1)}" fill="${fill}"${diag ? ` stroke="${diagC}" stroke-width="2.2"` : ''}>${tip(`Père ${label(a)} → ${kid} ${label(b)} : ${fmt(c.n, 0)} — ${fmt(c.n / (rT.get(a) || 1) * 100)} % des enfants de ${label(a).toLowerCase()}, ${fmt(c.n / (shown || 1) * 100)} % du tout${c.pids.length ? ' (clic : la liste)' : ''}`)}</rect>`
                    + (o.values !== false && cs >= textW(txt, fs * .72) + 4 && cs >= fs * 1.2 ? T(x + cs / 2, y + cs / 2 + .5, txt, {size: fs * .72, anchor: 'middle', fill: contrast(fill)}) : '') + '</g>';
            });
            if (totW) svg += T(x0 + n * cs + 6, y + cs / 2, fmt(rT.get(a) || 0, 0), {size: fs * .75, op: .7});
        });
        let h = y0 + n * cs;
        if (totW) { axis.forEach((b, j) => { svg += T(x0 + (j + .5) * cs, h + fs * .8, fmt(cT.get(b) || 0, 0), {size: fs * .72, anchor: 'middle', op: .7}); }); svg += T(x0 + n * cs + 6, h + fs * .8, fmt(shown, 0), {size: fs * .75, weight: 700}) + T(x0 - 6, h + fs * .8, 'Total', {size: fs * .72, anchor: 'end', op: .7}); h += fs * 1.5; }
        const unitTxt = mode === 'row' ? `en % des enfants de chaque métier du père` : mode === 'col' ? `en % de chaque métier de ${kid}` : mode === 'all' ? 'en % du tout' : 'en nombre';
        const note = `Chiffres ${unitTxt} ; cadre de couleur : même métier que le père.`;
        if (textW(note, fs * .72) <= W) { svg += T(0, h + fs * .8, note, {size: fs * .72, op: .65}); h += fs * 1.5; }
        else { svg += T(0, h + fs * .8, cut(`Chiffres ${unitTxt}.`, W, fs * .72), {size: fs * .72, op: .65}) + T(0, h + fs * 1.8, 'Cadre de couleur : même métier que le père.', {size: fs * .72, op: .65}); h += fs * 2.5; }
        return {h, svg, legend: [], desc: `Tableau de mobilité : ${fmt(total, 0)} couples père et ${kid}, ${n} métiers ; ${fmt(same / total * 100)} % font le métier du père.`};
    }

    /* ═════════ Données prises dans l'arbre ═════════ */
    const api = (action, q) => A().api(action, q);
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${fmt(n, 0)} ${w}${n > 1 ? 's' : ''}`);
    const cents = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII'];
    const romanN = s => { const m = String(s).toUpperCase().match(/^([IVXLC]+)E?\b/); if (!m) return 999; const V = {I: 1, V: 5, X: 10, L: 50, C: 100}; let t = 0; [...m[1]].forEach((c, i, a) => { const v = V[c], nx = V[a[i + 1]] || 0; t += v < nx ? -v : v; }); return t; };
    async function fillWaves(spec, key) {
        const [what, by] = key.split(':'), r = await api('diagram_numbers', {what}), items = r.items || [];
        if (!items.length) throw new Error('Aucune donnée dans l’arbre pour ce choix (dates manquantes ?).');
        let rows = items.map(x => ({label: x.name, value: x.value, group: by === 'sex' ? x.group : x.century, pid: x.id}));
        if (by !== 'sex') rows.sort((a, b) => romanN(a.group) - romanN(b.group));
        const lbl = {ages_death: 'Âge au décès', ages_marriage: 'Âge au mariage'}[what] || '';
        spec.rows = rows; spec.o = {...(spec.o || {}), title: lbl + (by === 'sex' ? ', femmes et hommes' : what === 'ages_marriage' ? ', par siècle du mariage' : ', par siècle de naissance'), unit: 'ans', xLabel: lbl, min: 0, max: '', source: `D’après ${plural(r.total || items.length, 'personne')} de l’arbre`};
        return spec;
    }
    async function fillTableN(spec, key) {
        const [what, step] = key.split(':'), r = await api('diagram_numbers', {what, step});
        if (!r.rows?.length) throw new Error('Aucune donnée dans l’arbre pour ce choix.');
        const st = Number(r.step) || 100, cen = y => { const c = Math.floor((Number(y) - 1) / 100) + 2; return st === 100 && Number(y) % 100 === 0 ? `${cents[c] || c}e s.` : `${y}–${Number(y) + st - 1}`; };
        spec.series = r.series.map(name => ({name})); spec.rows = r.rows.map(x => ({...x, label: cen(x.label)}));
        spec.o = {...(spec.o || {}), title: {occupations: 'Les métiers de la famille, siècle par siècle', births_places: 'Les communes de naissance, siècle par siècle', births_surnames: 'Les noms de famille, siècle par siècle'}[what] || '', subtitle: 'largeur : le nombre de personnes de la période ; hauteur : la part de chacun', source: 'D’après les fiches de l’arbre'};
        return spec;
    }
    async function fillMeans(spec, by) {
        const r = await api('diagram_adn_numbers', {what: 'means', by});
        if (!r.rows?.length) throw new Error('Pas assez de dates de naissance et de décès (ou de mariage) pour ce choix.');
        spec.series = [{name: 'Femmes', color: spec.series?.[0]?.color || '#e15759'}, {name: 'Hommes', color: spec.series?.[1]?.color || '#4e79a7'}];
        spec.rows = r.rows.map(x => ({label: `${x.label}`, s0: x.s0, s1: x.s1}));
        spec.o = {...(spec.o || {}), unit: 'ans', title: {death_century: 'Âge moyen au décès, par siècle de naissance', marriage_century: 'Âge moyen au mariage, par siècle', death_place: 'Âge moyen au décès, par commune de naissance', death_surname: 'Âge moyen au décès, par nom de famille'}[by], subtitle: 'femmes et hommes', source: `D’après ${plural(r.rows.reduce((a, x) => a + (x.n || 0), 0), 'personne')} de l’arbre`, ...(by.endsWith('century') ? {sort: ''} : {sort: 'desc'})};
        return spec;
    }
    async function fillMonths(spec, key) {
        const [by, type] = key.split(':'), r = await api('diagram_adn_numbers', {what: 'months', by, type});
        if (!r.rows?.length) throw new Error('Aucune date au mois près dans l’arbre pour ce choix.');
        spec.series = r.series.map((name, j) => ({name, color: by === 'type' ? ['#59a14f', '#f28e2b', '#5f6b7a'][j] : spec.series?.[j]?.color})); spec.rows = r.rows;
        spec.o = {...(spec.o || {}), title: by === 'type' ? 'Naissances, mariages et décès, mois par mois' : {births: 'Les naissances, mois par mois', marriages: 'Les mariages, mois par mois', deaths: 'Les décès, mois par mois', conceptions: 'Les conceptions (naissance − 9 mois), mois par mois'}[type] + ', par siècle', source: `D’après ${plural(r.total, 'date')} au mois près`};
        return spec;
    }
    async function fillMobility(spec, who) {
        const r = await api('diagram_adn_numbers', {what: 'mobility', who});
        if (!r.rows?.length) throw new Error('Aucun couple père / enfant dont les deux métiers sont connus.');
        spec.rows = r.rows.map(x => ({from: x.from, to: x.to, count: x.count, pids: (x.pids || []).slice(0, 60)}));
        const w = {sons: 'le fils', daughters: 'la fille', children: 'l’enfant'}[who] || 'l’enfant';
        spec.o = {...(spec.o || {}), childWord: w, title: `Métier du père, métier ${w === 'l’enfant' ? 'de l’enfant' : w === 'le fils' ? 'du fils' : 'de la fille'}`, source: `D’après ${plural(r.pairs, 'couple')} père et ${w.replace(/^l[ea’]\s?/, '')} dont les deux métiers sont connus`};
        return spec;
    }
    const APP = {
        ridgeline: {sources: [['ages_death:century', 'Âge au décès, par siècle de naissance'], ['ages_death:sex', 'Âge au décès, femmes et hommes'], ['ages_marriage:century', 'Âge au mariage, par siècle'], ['ages_marriage:sex', 'Âge au mariage, femmes et hommes']], fill: fillWaves},
        marimekko: {sources: [['occupations:100', 'Métiers, siècle par siècle'], ['births_places:100', 'Communes de naissance, siècle par siècle'], ['births_surnames:100', 'Noms de famille, siècle par siècle'], ['occupations:50', 'Métiers, par 50 ans']], fill: fillTableN},
        dotplot: {sources: [['death_century', 'Âge moyen au décès (femmes, hommes), par siècle de naissance'], ['marriage_century', 'Âge moyen au mariage (femmes, hommes), par siècle'], ['death_place', 'Âge moyen au décès, par commune de naissance'], ['death_surname', 'Âge moyen au décès, par nom de famille']], fill: fillMeans},
        nightingale: {sources: [['type:', 'Naissances, mariages et décès, par mois'], ['century:births', 'Naissances par mois, par siècle'], ['century:conceptions', 'Conceptions par mois (naissance − 9 mois), par siècle'], ['century:marriages', 'Mariages par mois, par siècle'], ['century:deaths', 'Décès par mois, par siècle']], fill: fillMonths},
        mobility: {sources: [['sons', 'Métier du père → métier du fils'], ['daughters', 'Métier du père → métier de la fille'], ['children', 'Métier du père → métier de l’enfant (fils et filles)']], fill: fillMobility},
    };

    /* ── l'ADN : le test d'une personne (menu de choix unique), ses segments ou ses correspondances ── */
    let dnaCache = null;
    const dnaData = async (fresh = false) => { if (!dnaCache || fresh || Date.now() - dnaCache.t > 30000) dnaCache = {t: Date.now(), p: api('dna', {}).catch(e => { dnaCache = null; throw e; })}; return dnaCache.p; };
    const kitName = k => [k.label || k.person_name || 'Test', k.company].filter(Boolean).join(' · ');
    const dnaHtml = (title, intro, extra) => `<div class="h-dg-app dac-app"><h4>${title}</h4><p class="muted">${intro}</p>
        <span class="pk-lab">Personne testée</span>${A()?.pickerField ? A().pickerField({name: 'dac_person', kind: 'person', placeholder: 'La personne qui a fait le test…'}) : ''}
        <label>Test<select data-dac="kit"><option value="">Chargement…</option></select></label>${extra}
        <button type="button" class="button small" data-dac-go>Prendre ces données</button><p class="muted" data-dac-msg aria-live="polite"></p></div>`;
    function bindDna(pane, io, run) {
        const kitSel = pane.querySelector('[data-dac="kit"]'), msg = pane.querySelector('[data-dac-msg]'), btn = pane.querySelector('[data-dac-go]');
        let data = null;
        const personOf = () => Number(pane.querySelector('[name="dac_person"]')?.value) || 0;
        const fillKits = () => { if (!data) return; const pid = personOf(), mine = pid ? data.kits.filter(k => k.person_id === pid) : data.kits, list = mine.length ? mine : data.kits;
            kitSel.innerHTML = list.map(k => `<option value="${k.id}">${esc(kitName(k))}</option>`).join('') || '<option value="">Aucun test</option>';
            msg.textContent = !data.kits.length ? 'ℹ️ Aucun test ADN dans ta base : ajoute-le dans l’onglet ADN (🧬 Mes tests), ou remplis le tableau à la main.' : pid && !mine.length ? 'ℹ️ Cette personne n’a pas de test : voici tous les tests de ta base.' : ''; };
        dnaData().then(d => { data = d; const pid = personOf(); if (!pid && d.kits[0]?.person_id) { /* la personne du premier test */ } fillKits(); }).catch(e => { msg.textContent = '⚠️ ' + (e.message || e); });
        pane.addEventListener('picker-change', e => { if (e.detail?.name === 'dac_person') fillKits(); });
        btn?.addEventListener('click', async () => { btn.disabled = true; msg.innerHTML = '<span class="ui-spinner" aria-hidden="true"></span> Lecture de tes données ADN…';
            try { data = await dnaData(true); const kit = Number(kitSel.value) || data.kits[0]?.id || 0; if (!kit) throw new Error('Aucun test ADN dans ta base.');
                const s = io.spec(), t = run(s, data, kit, pane); io.apply(s); A()?.toast?.(t); }
            catch (e) { msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; if (msg.isConnected && msg.querySelector('.ui-spinner')) msg.textContent = ''; } });
    }
    const pv = (pane, k) => pane.querySelector(`[data-dac="${k}"]`)?.value || '';
    const chromoApp = {
        html: () => dnaHtml('🧬 Les segments d’un test', 'Les segments partagés avec chaque cousin (onglet ADN → 🧩 Chromosomes) sont peints sur ses chromosomes, colorés par branche (les groupes de l’onglet ADN, ou l’ancêtre noté sur le segment).',
            `<label>Segments d’au moins<select data-dac="min"><option value="0">tous</option><option value="5">5 cM</option><option value="7" selected>7 cM</option><option value="10">10 cM</option><option value="20">20 cM</option></select></label>`),
        bind: (pane, io) => bindDna(pane, io, (s, d, kit) => {
            const min = Number(pv(pane, 'min')) || 0, M = new Map(d.matches.map(m => [m.id, m])), G = new Map(d.groups.map(g => [g.id, g]));
            const segs = d.segments.filter(x => x.kit_id === kit && (!min || !x.cm || x.cm >= min));
            if (!segs.length) throw new Error('Ce test n’a pas encore de segments : importe-les dans l’onglet ADN (🧩 Chromosomes → ⤒ Importer des segments).');
            const used = new Map();
            s.rows = segs.slice(0, 20000).map(x => { const m = M.get(x.match_id), g = (m?.groups || []).map(id => G.get(id)).find(Boolean), branch = x.ancestor || g?.name || (g ? '' : '');
                if (g && !x.ancestor) used.set(g.name, g.color);
                return {chr: x.chromosome, start: fmt(mb(x.start), 2).replace(/\s/g, ''), end: fmt(mb(x.end), 2).replace(/\s/g, ''), cm: x.cm || '', match: m?.name || x.label || 'Correspondance', side: x.side || m?.side || '', branch, color: x.color || '', pid: m?.person_id || 0}; });
            s.branches = [...used].map(([name, c]) => ({name, color: c}));
            const k = d.kits.find(x => x.id === kit); s.o = {...s.o, title: `Peinture des chromosomes — ${kitName(k || {})}`, colorBy: s.branches.length || s.rows.some(r => r.branch) ? 'branch' : 'side', minCm: 0, source: 'D’après l’onglet ADN (segments partagés)'};
            return `${plural(s.rows.length, 'segment')} pris dans l’onglet ADN.`;
        }),
    };
    const cmApp = {
        html: () => dnaHtml('📏 Les correspondances d’un test', 'Chaque correspondance se place sur la règle d’après ses cM partagés ; survole un point pour voir les parentés possibles.',
            `<label>Correspondances d’au moins<select data-dac="min"><option value="0">toutes</option><option value="20" selected>20 cM</option><option value="50">50 cM</option><option value="90">90 cM</option></select></label><label>Combien au plus<select data-dac="max"><option value="50">50</option><option value="150" selected>150</option><option value="500">500</option><option value="3000">toutes</option></select></label>`),
        bind: (pane, io) => bindDna(pane, io, (s, d, kit) => {
            const min = Number(pv(pane, 'min')) || 0, max = Number(pv(pane, 'max')) || 150;
            const ms = d.matches.filter(m => m.kit_id === kit && m.shared_cm > 0 && m.shared_cm >= min).sort((a, b) => b.shared_cm - a.shared_cm).slice(0, max);
            if (!ms.length) throw new Error('Aucune correspondance avec des cM pour ce test (ou au-dessus du minimum choisi).');
            s.rows = ms.map(m => ({name: m.person_name || m.name, cm: m.shared_cm, side: m.side || '', known: m.relationship || m.data?.company_relationship || '', pid: m.person_id || 0}));
            const k = d.kits.find(x => x.id === kit); s.o = {...s.o, title: `Mes correspondances ADN — ${kitName(k || {})}`, source: 'Fourchettes : Shared cM Project (B. Bettinger, v4) — indicatives'};
            return `${plural(s.rows.length, 'correspondance')} prise${s.rows.length > 1 ? 's' : ''} dans l’onglet ADN.`;
        }),
    };

    /* ═════════ Exemples de la galerie ═════════ */
    const NAMES = ['Jean Martin', 'Marie Durand', 'Pierre Petit', 'Anne Moreau', 'Louis Garnier', 'Jeanne Roux', 'Joseph Fournier', 'Rose Girard', 'François Bonnet', 'Louise Lambert', 'Henri Leroy', 'Germaine Blanc'];
    const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    function sampleChromo() {
        const B = [['MARTIN × DURAND', 'P'], ['ROUX × PETIT', 'P'], ['LEROY × BLANC', 'M'], ['GIRARD × MOREL', 'M']], M2 = ['Claire D.', 'Paul R.', 'Hélène L.', 'Marc G.', 'Sophie M.', 'Yves P.', 'Lucie B.', 'Alain M.'];
        const rows = [];
        for (let i = 0; i < 46; i++) { const c = CHR[Math.floor(rnd(i) * 23)], L = c[1], len = 8 + rnd(i + 99) * 45, a = rnd(i + 7) * (L - len), b = B[i % 4], m = M2[(i * 3) % 8];
            rows.push({chr: c[0], start: fmt(a, 1).replace(/\s/g, ''), end: fmt(a + len, 1).replace(/\s/g, ''), cm: Math.round(len * (.9 + rnd(i + 3) * .5)), match: m, side: b[1] === 'P' ? 'Paternel' : 'Maternel', branch: b[0]}); }
        return {o: {title: 'Mes chromosomes peints', subtitle: 'segments partagés, colorés par branche', colorBy: 'branch'}, rows, branches: [{name: 'MARTIN × DURAND', color: '#4e79a7'}, {name: 'ROUX × PETIT', color: '#76b7b2'}, {name: 'LEROY × BLANC', color: '#e15759'}, {name: 'GIRARD × MOREL', color: '#f28e2b'}]};
    }
    const sampleCm = () => ({o: {title: 'Mes cousins ADN sur la règle des cM', labels: 8, highlight: ''}, rows: [['Maman', 3460, 'Maternel', 'Mère'], ['Lucie B.', 2610, 'Les deux', 'Sœur'], ['Paul R.', 1780, 'Paternel', ''], ['Claire D.', 890, 'Paternel', ''], ['Marc G.', 612, 'Maternel', ''], ['Hélène L.', 402, 'Maternel', ''], ['Sophie M.', 236, 'Paternel', ''], ['Yves P.', 198, 'Paternel', ''],
        ['Alain M.', 141, 'Maternel', ''], ['Odile T.', 112, '', ''], ['Bruno V.', 88, 'Paternel', ''], ['Agnès C.', 74, 'Maternel', ''], ['Denis F.', 61, '', ''], ['Émile H.', 52, 'Paternel', ''], ['Inès K.', 44, '', ''], ['Jules N.', 38, 'Maternel', ''], ['Karine S.', 31, '', ''], ['Léon W.', 27, 'Paternel', ''], ['Mona Z.', 22, '', ''], ['Noé A.', 18, '', ''], ['Olga E.', 14, '', ''], ['Pia I.', 11, '', '']].map(([name, cm, side, known]) => ({name, cm, side, known}))});
    const AGES = {'XVIIe s.': [0, 1, 0, 2, 5, 38, 45, 52, 33, 61, 27, 49, 0, 1, 57, 64, 40, 3, 0, 55, 46, 69, 30], 'XVIIIe s.': [0, 0, 1, 3, 48, 55, 62, 41, 70, 66, 35, 58, 1, 0, 72, 50, 44, 63, 2, 67, 59, 74, 39, 53], 'XIXe s.': [0, 1, 2, 58, 64, 71, 69, 45, 77, 73, 62, 80, 56, 0, 75, 68, 60, 83, 66, 70, 52, 79, 72, 65],
        'XXe s.': [72, 78, 81, 84, 69, 88, 76, 91, 80, 74, 86, 83, 67, 79, 90, 85, 77, 82, 73, 87, 89, 94, 75, 0]};
    const sampleRidge = () => ({o: {title: 'Âge au décès', subtitle: 'par siècle de naissance', unit: 'ans', xLabel: 'Âge au décès', min: 0, overlap: 120}, rows: Object.entries(AGES).flatMap(([group, vs], k) => vs.map((value, i) => ({group, value, label: NAMES[(i + k) % NAMES.length]})))});
    const sampleMari = () => { const jobs = ['Laboureur', 'Tisserand', 'Artisan', 'Ouvrier', 'Employé'], per = [['XVIIe s.', [48, 18, 10, 0, 1]], ['XVIIIe s.', [70, 30, 18, 2, 3]], ['XIXe s.', [62, 22, 30, 38, 12]], ['XXe s.', [12, 2, 20, 46, 40]]];
        return {o: {title: 'Les métiers, siècle par siècle', subtitle: 'largeur : nombre de personnes ; hauteur : part du métier'}, series: jobs.map(name => ({name})), rows: per.map(([label, v]) => { const row = {label}; v.forEach((x, j) => { row['s' + j] = x; }); return row; })}; };
    const sampleDot = () => ({o: {title: 'Âge moyen au décès', subtitle: 'par commune de naissance, femmes et hommes', unit: 'ans', sort: 'desc'}, series: [{name: 'Femmes', color: '#e15759'}, {name: 'Hommes', color: '#4e79a7'}],
        rows: [['Rennes', 64, 58], ['Vitré', 61, 59], ['Fougères', 57, 55], ['Redon', 66, 60], ['Nantes', 59, 52], ['Saint-Malo', 63, 57], ['Laval', 60, 61], ['Angers', 62, 54]].map(([label, s0, s1]) => ({label, s0, s1}))});
    const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
    const sampleRose = () => ({o: {title: 'Les mois de la vie', subtitle: 'naissances, mariages et décès'}, series: [{name: 'Naissances', color: '#59a14f'}, {name: 'Mariages', color: '#f28e2b'}, {name: 'Décès', color: '#5f6b7a'}],
        rows: MONTHS.map((label, i) => ({label, s0: [42, 45, 51, 39, 33, 30, 28, 31, 36, 40, 38, 44][i], s1: [28, 34, 4, 9, 12, 16, 14, 10, 8, 11, 26, 3][i], s2: [38, 36, 34, 30, 26, 22, 24, 31, 35, 28, 30, 37][i]}))});
    const sampleMob = () => ({o: {title: 'Métier du père, métier du fils', childWord: 'le fils', top: 8}, rows: [['Laboureur', 'Laboureur', 64], ['Laboureur', 'Journalier', 22], ['Laboureur', 'Tisserand', 9], ['Laboureur', 'Ouvrier', 14], ['Journalier', 'Journalier', 28], ['Journalier', 'Laboureur', 11], ['Journalier', 'Ouvrier', 19], ['Tisserand', 'Tisserand', 17],
        ['Tisserand', 'Ouvrier', 12], ['Tisserand', 'Laboureur', 4], ['Meunier', 'Meunier', 6], ['Meunier', 'Laboureur', 3], ['Ouvrier', 'Ouvrier', 21], ['Ouvrier', 'Employé', 9], ['Ouvrier', 'Cheminot', 7], ['Cheminot', 'Cheminot', 5], ['Cheminot', 'Employé', 6], ['Employé', 'Employé', 8], ['Employé', 'Instituteur', 4], ['Instituteur', 'Instituteur', 3], ['Forgeron', 'Forgeron', 5], ['Forgeron', 'Ouvrier', 4]].map(([from, to, count]) => ({from, to, count}))});

    /* ═════════ Les sortes : tableaux, réglages ═════════ */
    const TABLE = (label, first = 'Catégorie', n = true) => ({key: 'rows', label, series: n, cols: [C('label', first), C('color', 'Couleur', 'color')]});
    const H_OPT = C('height', 'Hauteur du dessin (px)', 'range', {min: 120, max: 1600, step: 10, def: 420});
    const KINDS = {
        chromo: {icon: '🧬', label: 'Peinture des chromosomes (segments ADN par branche)', group: 'ADN', render: chromo, legend: 'bottom', fromApp: chromoApp,
            grids: [{key: 'rows', label: 'Les segments partagés (un par ligne)', cols: [C('chr', 'Chromosome (1 à 22, X)'), C('start', 'Début (Mb ou paires de bases)', 'number'), C('end', 'Fin', 'number'), C('cm', 'cM', 'number'), C('match', 'Correspondance (cousin)'),
                C('side', 'Côté', 'select', {choices: [['', 'Inconnu'], ['Paternel', 'Côté père'], ['Maternel', 'Côté mère'], ['Les deux', 'Les deux']]}), C('branch', 'Branche (couple d’ancêtres)'), C('color', 'Couleur (sinon celle de la branche)', 'color')]},
                {key: 'branches', label: 'Les branches et leur couleur (facultatif)', cols: [C('name', 'Branche'), C('color', 'Couleur', 'color')]}],
            options: [C('layout', 'Dessin', 'select', {choices: [['', 'Deux copies par chromosome (père en haut, mère en bas)'], ['one', 'Une seule barre par chromosome']]}),
                C('colorBy', 'Couleur des segments', 'select', {choices: [['branch', 'Par branche'], ['match', 'Par correspondance'], ['side', 'Par côté (père, mère)']], def: 'branch'}),
                C('patColor', 'Couleur du côté père', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'side'}), C('matColor', 'Couleur du côté mère', 'color', {def: '#e15759', when: s => s.o?.colorBy === 'side'}),
                C('minCm', 'Cacher les segments de moins de (cM)', 'range', {min: 0, max: 50, def: 0}), C('barHeight', 'Épaisseur des chromosomes (px)', 'range', {min: 5, max: 40, def: 13}),
                C('cols', 'Colonnes (0 = selon la largeur)', 'range', {min: 0, max: 2, def: 0}), C('showX', 'Montrer le chromosome X', 'check', {def: true}), C('labels', 'Noms dans les segments (s’ils tiennent)', 'check', {def: true})],
            sample: sampleChromo},
        cmruler: {icon: '📏', label: 'Règle des cM (parentés possibles)', group: 'ADN', render: cmRuler, legend: 'bottom', fromApp: cmApp,
            grids: [{key: 'rows', label: 'Les correspondances', cols: [C('name', 'Nom'), C('cm', 'cM partagés', 'number'), C('side', 'Côté', 'select', {choices: [['', 'Inconnu'], ['Paternel', 'Côté père'], ['Maternel', 'Côté mère'], ['Les deux', 'Les deux']]}), C('known', 'Parenté connue (facultatif)')]}],
            options: [C('highlight', 'Montrer les parentés possibles de… (un nom)'), C('scale', 'Échelle', 'select', {choices: [['', 'Logarithmique (petits cM lisibles)'], ['lin', 'Régulière']]}),
                C('set', 'Parentés', 'select', {choices: [['', 'Les principales'], ['all', 'Toutes (demi-parentés, générations d’écart…)']]}), C('labels', 'Noms écrits (les plus proches d’abord)', 'range', {min: 0, max: 40, def: 8}),
                C('dot', 'Taille des points (px)', 'range', {min: 2, max: 12, def: 5}), C('showAvg', 'Trait à la moyenne de chaque parenté', 'check', {def: true}),
                C('colorBy', 'Couleur des points', 'select', {choices: [['', 'Par côté (père, mère)'], ['one', 'Une seule']]}), C('patColor', 'Couleur du côté père', 'color', {def: '#4e79a7', when: s => s.o?.colorBy !== 'one'}), C('matColor', 'Couleur du côté mère', 'color', {def: '#e15759', when: s => s.o?.colorBy !== 'one'}),
                C('dotColor', 'Couleur des autres points', 'color', {def: '#2e7d6b'}), C('bandColor', 'Couleur des fourchettes', 'color', {def: '#8a94a6'}), C('maxCm', 'Fin de l’échelle (cM)', 'range', {min: 100, max: 3720, step: 10, def: 3720})],
            sample: sampleCm},
        ridgeline: {icon: '🏔️', label: 'Vagues (une répartition par siècle…)', group: 'Chiffres', render: ridgeline, noLegend: true,
            grids: [{key: 'rows', label: 'Les valeurs et leur groupe (une vague par groupe)', cols: [C('label', 'Nom (personne…)'), C('value', 'Valeur', 'number'), C('group', 'Groupe (siècle, sexe…)'), C('color', 'Couleur du groupe', 'color')]}],
            options: [C('overlap', 'Chevauchement des vagues (%)', 'range', {min: 0, max: 300, def: 120}), C('rowHeight', 'Écart entre les vagues (px)', 'range', {min: 16, max: 160, def: 38}),
                C('bw', 'Lissage (0 = automatique)', 'range', {min: 0, max: 30, step: .5, def: 0}), C('scaleBy', 'Hauteur des vagues', 'select', {choices: [['', 'Chaque vague à sa hauteur'], ['same', 'Même échelle pour toutes'], ['count', 'Selon le nombre de valeurs']]}),
                C('order', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['reverse', 'À l’envers'], ['median', 'Par médiane'], ['count', 'Par nombre de valeurs']]}),
                C('colors', 'Couleurs', 'select', {choices: [['', 'Une par groupe'], ['gradient', 'Un dégradé'], ['one', 'Une seule']]}), C('lowColor', 'Dégradé : première couleur', 'color', {def: '#9ecae1', when: s => s.o?.colors === 'gradient'}), C('highColor', 'Dégradé : dernière couleur', 'color', {def: '#08519c', when: s => s.o?.colors === 'gradient'}),
                C('oneColor', 'Couleur', 'color', {def: '#4e79a7', when: s => s.o?.colors === 'one'}), C('opacity', 'Opacité (%)', 'range', {min: 10, max: 100, def: 75}), C('median', 'Montrer la médiane', 'check', {def: true}), C('counts', 'Écrire le nombre de valeurs', 'check', {def: true}),
                C('min', 'Début de l’axe (vide = automatique)', 'number'), C('max', 'Fin de l’axe (vide = automatique)', 'number'), C('unit', 'Unité (ex. : ans)'), C('xLabel', 'Nom de l’axe')],
            sample: sampleRidge},
        marimekko: {icon: '🧱', label: 'Mosaïque à largeur variable (Marimekko)', group: 'Parts', render: marimekko, legend: 'bottom', table: true,
            grids: [TABLE('Les colonnes (lignes) et leurs parts (séries)', 'Colonne')],
            options: [C('values', 'Dans les cases', 'select', {choices: [['', 'La part en %'], ['num', 'Le chiffre'], ['false', 'Rien']]}), C('widths', 'Part de chaque colonne sous l’axe', 'check', {def: true}),
                C('sort', 'Ordre des colonnes', 'select', {choices: [['', 'Comme dans le tableau'], ['size', 'Les plus larges d’abord']]}), C('gap', 'Écart entre les colonnes (px)', 'range', {min: 0, max: 20, def: 2}), C('border', 'Traits entre les cases', 'check', {def: true}), C('borderColor', 'Couleur des traits', 'color', {def: '#ffffff', when: s => s.o?.border !== false}), C('unit', 'Unité (ex. : personnes)'), H_OPT],
            sample: sampleMari},
        dotplot: {icon: '⚫', label: 'Échelle de points (Cleveland)', group: 'Chiffres', render: dotplot, legend: 'bottom', table: true, pairs: true,
            grids: [TABLE('Les lignes et leurs valeurs (une colonne par série)', 'Nom')],
            options: [C('sort', 'Ordre des lignes', 'select', {choices: [['', 'Comme dans le tableau'], ['desc', 'Du plus grand au plus petit'], ['asc', 'Du plus petit au plus grand'], ['az', 'A → Z'], ['gap', 'Par écart entre les deux séries']]}),
                C('guide', 'Trait de chaque ligne', 'select', {choices: [['', 'Pointillé sur toute la largeur'], ['range', 'Entre les points (écart)'], ['none', 'Aucun']]}), C('dot', 'Taille des points (px)', 'range', {min: 2, max: 16, def: 5}), C('dotColor', 'Couleur des points (une seule série)', 'color', {def: '#4e79a7', when: sp => !(sp.series?.length > 1)}), C('rowHeight', 'Hauteur d’une ligne (px)', 'range', {min: 12, max: 60, def: 24}),
                C('values', 'Écrire la valeur', 'check', {def: true}), C('showGap', 'Écrire l’écart (deux séries)', 'check', {def: true}), C('stripes', 'Une ligne sur deux grisée', 'check', {def: true}), C('fromZero', 'Axe à partir de zéro', 'check'),
                C('highlight', 'Mettre en avant (un nom ; les autres pâlissent)'), C('unit', 'Unité (ex. : ans)'), C('xLabel', 'Nom de l’axe')],
            sample: sampleDot},
        nightingale: {icon: '🌹', label: 'Rose de Nightingale (aires polaires)', group: 'Parts', render: nightingale, legend: 'bottom', table: true, pairs: true,
            grids: [TABLE('Les parts (mois, saisons…) et leurs chiffres', 'Part')],
            options: [C('mode', 'Plusieurs séries', 'select', {choices: [['', 'Empilées'], ['overlap', 'Superposées (comme Florence Nightingale)']]}), C('area', 'L’aire suit le chiffre (sinon : la longueur)', 'check', {def: true}),
                C('start', 'Départ (degrés, 0 = en haut)', 'range', {min: 0, max: 359, def: 0}), C('hole', 'Trou au centre (%)', 'range', {min: 0, max: 60, def: 8}), C('labels', 'Noms des parts', 'check', {def: true}), C('values', 'Écrire les chiffres', 'check'),
                C('rings', 'Cercles de l’échelle', 'check', {def: true}), C('lineColor', 'Couleur des traits entre les parts', 'color', {def: '#ffffff'}), C('unit', 'Unité'), H_OPT],
            sample: sampleRose},
        mobility: {icon: '🔁', label: 'Tableau de mobilité (métier du père × métier de l’enfant)', group: 'Chiffres', render: mobility, noLegend: true,
            grids: [{key: 'rows', label: 'Les couples de métiers', cols: [C('from', 'Métier du père'), C('to', 'Métier de l’enfant'), C('count', 'Combien', 'number')]},
                {key: 'groups', label: 'Regrouper des métiers (facultatif : un mot → une famille de métiers)', cols: [C('job', 'Métier (ou un morceau du mot)'), C('group', 'Famille de métiers')]}],
            options: [C('mode', 'Chiffres', 'select', {choices: [['row', 'En % des enfants de chaque métier du père'], ['col', 'En % de chaque métier de l’enfant'], ['all', 'En % du tout'], ['count', 'En nombre']], def: 'row'}),
                C('top', 'Combien de métiers', 'range', {min: 2, max: 40, def: 10}), C('others', 'Regrouper les autres dans « Autres »', 'check', {def: true}), C('sort', 'Ordre', 'select', {choices: [['', 'Les plus fréquents d’abord'], ['az', 'A → Z']]}),
                C('lowColor', 'Couleur des petites valeurs', 'color', {def: '#eef3fb'}), C('highColor', 'Couleur des grandes valeurs', 'color', {def: '#1f4e8c'}), C('diagColor', 'Cadre « même métier que le père »', 'color', {def: '#e8a33d'}),
                C('values', 'Écrire les chiffres', 'check', {def: true}), C('totals', 'Totaux', 'check', {def: true}), C('childWord', 'Le mot pour l’enfant (ex. : le fils)')],
            sample: sampleMob},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (R.KINDS[k]) continue; R.KINDS[k] = {...kind, ...(APP[k] ? {app: APP[k]} : {})}; }
    // l'échelle de points et la rose se dessinent aussi à partir des statistiques de l'app (Éditeur de graphiques, « D'un graphique »)
    ['dotplot', 'nightingale'].forEach(k => ext.diagramKindsInternals?.PAIR_KINDS?.add(k));

    /* ═════════ Clic : la fiche d'une personne, ou la liste des personnes concernées ═════════ */
    const GCOL = {male: '#4e79a7', female: '#e15759'};
    const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    const yearOf = d => (String(d || '').match(/-?\d{3,4}/) || [''])[0];
    const ava = p => { const old = `<span class="dac-ini" style="background:${GCOL[p.gender] || '#9aa3ad'}">${esc(initials(p.name))}</span>`; // K7 : le portrait commun si réglé
        try { return window.LCNDA_UI?.avatarOr ? window.LCNDA_UI.avatarOr(p, 34, old) : old; } catch (_) { return old; } };
    async function openPeople(ids, title) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal dac-people';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📊 DIAGRAMME</span><h2>${esc(title || 'Les personnes')}</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="dac-people-list" data-list><p class="muted"><span class="ui-spinner" aria-hidden="true"></span> Chargement…</p></div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button></div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) return dlg.close(); const b = e.target.closest('[data-open]'); if (b) { dlg.close(); document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (_) {} }); A()?.openPersonById?.(Number(b.dataset.open)); } });
        dlg.showModal();
        try {
            const r = await api('diagram_people', {ids: ids.join(',')}), list = r.people || [];
            dlg.querySelector('[data-list]').innerHTML = list.length ? `<p class="muted">${esc(plural(list.length, 'personne'))}${ids.length >= 300 ? ' (les 300 premières)' : ''} — clic : la fiche.</p><ul>${list.map(p => `<li><button type="button" class="dac-person" data-open="${Number(p.id)}">${ava(p)}<span class="dac-pname">${esc(p.name || '?')}</span><span class="dac-years">${esc([yearOf(p.birth) && '° ' + yearOf(p.birth), yearOf(p.death) && '† ' + yearOf(p.death)].filter(Boolean).join(' · '))}</span><span class="dac-go" aria-hidden="true">↗</span></button></li>`).join('')}</ul>`
                : (A()?.emptyState ? A().emptyState({icon: '👥', text: 'Ces personnes ne sont plus dans la base.'}) : '<p class="muted">Ces personnes ne sont plus dans la base.</p>');
        } catch (e) { dlg.querySelector('[data-list]').innerHTML = `<p class="ui-msg is-error">⛔ ${esc(e.message || e)}</p>`; }
    }
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
        const one = e.target.closest?.('[data-dac-pid]'), many = !one && e.target.closest?.('[data-dac-pids]'), c = one || many;
        if (!c || c.closest('.h-dg-mini')) return;
        if (c.closest('.h-dg-dlg')) { A()?.toast?.(`${(c.querySelector('title')?.textContent || 'Cette partie').split(' — ')[0].split(' : ')[0]} : ferme l’éditeur et clique à nouveau pour ${one ? 'ouvrir sa fiche' : 'voir la liste des personnes'}.`); return; }
        e.preventDefault();
        if (one) A()?.openPersonById?.(Number(c.dataset.dacPid));
        else openPeople(String(c.dataset.dacPids || '').split(',').map(Number).filter(n => n > 0).slice(0, 300), c.dataset.dacTitle || '');
    });
    ext.diagramAdnChiffres = {KINDS: Object.keys(KINDS), guess, density, covered, chrOf, sideOf, mb, openPeople, APP};
})();
