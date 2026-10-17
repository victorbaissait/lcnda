/* LCNDA — 📊 Mes diagrammes : le dessin (SVG), sans interface. Interface : heritage-diagrams.js.
 * Un diagramme = {kind, o: {réglages}, rows: [...], series: [...], roles: [...], events: [...], sets: [...]}.
 * ext.diagramRender.svg(spec) → '<svg …>' ; ext.diagramRender.KINDS : les types, leurs tableaux de données et réglages.
 * Types : parlement (hémicycle, arc, fer à cheval, Westminster, cercle, salle), frise des membres d'un groupe
 * (façon Wikipédia, aussi frise de vies et planning), frise chronologique, colonnes, barres, empilés, courbe, aire,
 * camembert, anneau, demi-anneau, mosaïque, radar, entonnoir, carte proportionnelle, pyramide, carte de chaleur,
 * nuage de points / bulles, flux (Sankey), organigramme, Venn, nuage de mots, jauges, pictogrammes.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#17becf', '#bcbd22'];
    const PALETTES = {vive: PALETTE, pastel: ['#8ab6e8', '#f2a97f', '#96d1a8', '#c0a8ec', '#ef9a9a', '#e6cf7a', '#86d0d8', '#f0a8c8', '#aab4be', '#c5e1a5', '#ffcc80', '#9fa8da'],
        terre: ['#8d5524', '#c68642', '#a0522d', '#6b8e23', '#556b2f', '#b8860b', '#7f4f24', '#936639', '#a68a64', '#656d4a', '#414833', '#c2a878'],
        mer: ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#2a9d8f', '#264653', '#457b9d', '#1d3557', '#a8dadc'],
        sepia: ['#4b3621', '#6f4e37', '#8b6f47', '#a0826d', '#b5967a', '#c8ad8d', '#d9c3a5', '#704214', '#5c4033', '#987654', '#c19a6b', '#e0cda9'],
        gris: ['#222222', '#444444', '#666666', '#888888', '#aaaaaa', '#cccccc']};
    const FONT = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    /* ─── Petits outils ─── */
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const n = parseFloat(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const fmt = (n, d = 2) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r2 = v => Math.round(v * 100) / 100;
    /** une couleur sûre (rien qui puisse sortir de l'attribut) */
    const color = (c, fb = '#888') => { const t = String(c || '').trim(); return /^#[0-9a-f]{3,8}$/i.test(t) || /^[a-z]{3,20}$/i.test(t) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(t) ? t : fb; };
    const pal = spec => PALETTES[spec.o?.palette] || PALETTE;
    const pick = (spec, i, c) => color(c, pal(spec)[i % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const contrast = c => { const m = String(c).match(/^#([0-9a-f]{6}|[0-9a-f]{3})\b/i); if (!m) return '#fff'; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d1d1f' : '#fff'; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = ''} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${rotate ? ` transform="rotate(${rotate} ${r2(x)} ${r2(y)})"` : ''}${style ? ` font-style="${style}"` : ''}>${esc(s)}</text>`;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s + '…'; };
    function ticks(min, max, count = 5) {
        if (!(max > min)) max = min + 1;
        const step0 = (max - min) / count, mag = 10 ** Math.floor(Math.log10(step0)), e = step0 / mag;
        const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
        const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, out = [];
        for (let v = lo, i = 0; v <= hi + step / 2 && i < 200; v += step, i++) out.push(+v.toFixed(10));
        return {lo, hi, step, ticks: out};
    }
    /** « 1987 », « 1987-05 », « 12/05/1987 », « mai 1987 », « auj. » → année décimale */
    const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    function when(v, now = true) {
        const t = String(v ?? '').trim().toLowerCase(); if (!t) return null;
        if (/^(auj|aujourd|présent|present|now|en cours|à ce jour|\.\.\.|…)/.test(t)) { const d = new Date(); return now ? d.getFullYear() + d.getMonth() / 12 + (d.getDate() - 1) / 365 : null; }
        let m;
        if ((m = t.match(/^(-?\d{1,4})-(\d{1,2})(?:-(\d{1,2}))?/))) return +m[1] + (clamp(+m[2], 1, 12) - 1) / 12 + (m[3] ? (clamp(+m[3], 1, 31) - 1) / 365 : 0);
        if ((m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{3,4})/))) return +m[3] + (clamp(+m[2], 1, 12) - 1) / 12 + (clamp(+m[1], 1, 31) - 1) / 365;
        if ((m = t.match(/^(\d{1,2})[/.](\d{3,4})/))) return +m[2] + (clamp(+m[1], 1, 12) - 1) / 12;
        const mi = MONTHS.findIndex(x => t.includes(x)); const y = t.match(/-?\d{3,4}/);
        if (y) return +y[0] + (mi >= 0 ? mi / 12 : 0);
        if ((m = t.match(/^-?\d+(?:[.,]\d+)?$/))) return num(t);
        return null;
    }
    const rows = (spec, key = 'rows') => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object');

    /* ─── Légende ─── */
    function legendSvg(items, x, y, maxW, fs, vertical = false) {
        let cx = x, cy = y, out = '', lineH = fs * 1.7, w = 0;
        for (const it of items) {
            const lw = fs * 1.3 + 6 + textW(it.label, fs);
            if (!vertical && cx > x && cx + lw > x + maxW) { cx = x; cy += lineH; }
            const mid = cy + lineH / 2;
            if (it.type === 'line' || it.type === 'dash') out += `<line x1="${r2(cx)}" y1="${r2(mid)}" x2="${r2(cx + fs * 1.3)}" y2="${r2(mid)}" stroke="${color(it.color, '#000')}" stroke-width="${it.width || 2}"${it.type === 'dash' ? ' stroke-dasharray="4 3"' : ''}/>`;
            else out += `<rect x="${r2(cx)}" y="${r2(mid - fs / 2)}" width="${r2(fs * 1.3)}" height="${r2(fs)}" rx="2" fill="${color(it.color)}"/>`;
            out += T(cx + fs * 1.3 + 6, mid, it.label, {size: fs});
            w = Math.max(w, cx - x + lw);
            if (vertical) cy += lineH; else cx += lw + fs * 1.2;
        }
        return {svg: out, h: items.length ? (vertical ? cy - y : cy - y + lineH) : 0, w};
    }

    /* ─── Assemblage : titre, sous-titre, dessin, légende, source ─── */
    function compose(spec, kind, W) {
        const o = spec.o || {}, fs = 12 * clamp(num(o.scale) || 1, .5, 3), pad = 16;
        const fg = color(o.fg, '#1d1d1f'), bgv = o.bg === 'transparent' ? '' : color(o.bg === 'custom' ? o.bgColor : '#ffffff', '#ffffff');
        let y = pad, head = '';
        if (o.title) { head += T(o.titleAlign === 'left' ? pad : W / 2, y + fs * .9, o.title, {size: fs * 1.6, weight: 700, anchor: o.titleAlign === 'left' ? 'start' : 'middle'}); y += fs * 2.2; }
        if (o.subtitle) { head += T(o.titleAlign === 'left' ? pad : W / 2, y + fs * .6, o.subtitle, {size: fs * 1.05, anchor: o.titleAlign === 'left' ? 'start' : 'middle', fill: fg, style: 'italic'}); y += fs * 1.8; }
        if (o.title || o.subtitle) y += fs * .4;
        const legPos = kind.noLegend ? 'none' : (o.legend || kind.legend || 'bottom');
        let body = kind.render(spec, W - pad * 2, fs);
        let legW = 0;
        if (legPos === 'right' && body.legend?.length) {
            legW = Math.min(W * .4, Math.max(...body.legend.map(it => fs * 1.3 + 8 + textW(it.label, fs))) + 10);
            body = kind.render(spec, W - pad * 3 - legW, fs);
        }
        let out = `<g transform="translate(${pad} ${r2(y)})">${body.svg}</g>`;
        let bottom = y + body.h;
        if (body.legend?.length && legPos !== 'none') {
            if (legPos === 'right') { const L = legendSvg(body.legend, W - pad - legW, y + Math.max(0, body.h / 2 - body.legend.length * fs * .85), legW, fs, true); out += L.svg; bottom = Math.max(bottom, y + L.h); }
            else { const L0 = legendSvg(body.legend, 0, 0, W - pad * 2, fs); const L = legendSvg(body.legend, Math.max(pad, (W - L0.w) / 2), bottom + fs * .8, W - pad * 2, fs); out += L.svg; bottom += fs * .8 + L.h; }
        }
        if (o.source) { out += T(pad, bottom + fs * 1.3, o.source, {size: fs * .85, fill: fg, style: 'italic'}); bottom += fs * 2; }
        const H = Math.ceil(bottom + pad);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(W)} ${H}" width="${Math.ceil(W)}" height="${H}" font-family="${FONT}" color="${fg}" style="color:${fg}">${bgv ? `<rect width="100%" height="100%" fill="${bgv}"/>` : ''}${head}${out}</svg>`;
    }

    /* ═════════ 🏛️ Parlements ═════════ */
    function seatsOf(spec) {
        let list = rows(spec).map((r, i) => ({name: String(r.name || `Groupe ${i + 1}`), n: clamp(Math.round(num(r.seats)), 0, 5000), color: pick(spec, i, r.color), side: r.side || '', i}));
        if (spec.o?.sort === 'desc') list = [...list].sort((a, b) => b.n - a.n);
        return list;
    }
    /** répartit n en parts proportionnelles aux poids (plus forts restes) */
    function apportion(n, weights) {
        const tot = weights.reduce((a, b) => a + b, 0) || 1, raw = weights.map(w => n * w / tot), out = raw.map(Math.floor);
        let left = n - out.reduce((a, b) => a + b, 0);
        raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
        return out;
    }
    /** sièges d'un arc (hémicycle 180°, arc élargi, cercle 360°) : rangées, places le long de chaque rangée */
    function arcSeats(N, deg, inner, rowsWanted) {
        const th = clamp(deg, 60, 360) * Math.PI / 180, full = deg >= 359;
        const cap = R => { const dr = (1 - inner) / Math.max(1, R - 1); let c = 0; for (let i = 0; i < R; i++) { const r = R === 1 ? 1 : inner + i * dr; c += Math.floor(th * r / (R === 1 ? (1 - inner) || .3 : dr)) + (full ? 0 : 1); } return c; };
        let R = clamp(Math.round(rowsWanted) || 0, 0, 60);
        if (!R) { R = 1; while (R < 60 && cap(R) < N) R++; }
        const radii = Array.from({length: R}, (_, i) => R === 1 ? 1 : inner + i * (1 - inner) / (R - 1));
        const per = apportion(N, radii);
        const seats = [];
        radii.forEach((r, i) => { const n = per[i]; for (let k = 0; k < n; k++) {
            const t = full ? k / n : n === 1 ? .5 : k / (n - 1);
            const a = full ? Math.PI / 2 - 2 * Math.PI * t : Math.PI / 2 + th / 2 - th * t;
            seats.push({x: r * Math.cos(a), y: -r * Math.sin(a), t, r});
        } });
        const dr = R === 1 ? .25 : (1 - inner) / (R - 1);
        let size = dr * .82; radii.forEach((r, i) => { if (per[i] > 1) size = Math.min(size, th * r / (per[i] - (full ? 0 : 1)) * .86); });
        seats.sort((a, b) => a.t - b.t || a.r - b.r);
        return {seats, size, rows: R};
    }
    /** fer à cheval : chaque rangée est un U (deux bancs droits et un arrondi), places espacées régulièrement */
    function horseshoeSeats(N, inner, arm, rowsWanted) {
        const len = r => 2 * arm + Math.PI * r;
        const cap = R => { const dr = (1 - inner) / Math.max(1, R - 1); let c = 0; for (let i = 0; i < R; i++) c += Math.floor(len(R === 1 ? 1 : inner + i * dr) / dr) + 1; return c; };
        let R = clamp(Math.round(rowsWanted) || 0, 0, 60);
        if (!R) { R = 1; while (R < 60 && cap(R) < N) R++; }
        const radii = Array.from({length: R}, (_, i) => R === 1 ? 1 : inner + i * (1 - inner) / (R - 1));
        const per = apportion(N, radii.map(len)), seats = [];
        radii.forEach((r, i) => { const n = per[i], L = len(r); for (let k = 0; k < n; k++) {
            const t = n === 1 ? .5 : k / (n - 1); let s = t * L, x, y;
            if (s <= arm) { x = -r; y = arm - s; } else if (s <= arm + Math.PI * r) { const a = Math.PI - (s - arm) / r; x = r * Math.cos(a); y = -r * Math.sin(a); } else { x = r; y = s - arm - Math.PI * r; }
            seats.push({x, y, t, r});
        } });
        const dr = R === 1 ? .25 : (1 - inner) / (R - 1);
        let size = dr * .82; radii.forEach((r, i) => { if (per[i] > 1) size = Math.min(size, len(r) / (per[i] - 1) * .86); });
        seats.sort((a, b) => a.t - b.t || a.r - b.r);
        return {seats, size, rows: R};
    }
    /** un bloc de sièges en grille, rempli colonne par colonne (les groupes forment des bandes) */
    function gridBlock(n, rowsN, x0, y0, s, fromBottom = false) {
        const out = [], R = Math.max(1, Math.min(rowsN, n || 1));
        for (let k = 0; k < n; k++) { const c = Math.floor(k / R), rr = k % R; out.push({x: x0 + c * s, y: y0 + (fromBottom ? R - 1 - rr : rr) * s}); }
        return {seats: out, w: Math.ceil(n / R) * s, h: R * s};
    }
    function parliament(spec, W, fs) {
        const o = spec.o || {}, parties = seatsOf(spec), N = parties.reduce((a, p) => a + p.n, 0);
        const layout = o.layout || 'hemicycle', gap = clamp(num(o.gap ?? 15), 0, 60) / 100;
        const shape = o.shape || 'circle';
        const colorAt = []; parties.forEach(p => { for (let k = 0; k < p.n; k++) colorAt.push(p); });
        const legend = parties.filter(p => p.n > 0 || o.showEmpty).map(p => ({label: o.legendSeats === false ? p.name : `${p.name} (${fmt(p.n, 0)})`, color: p.color}));
        if (!N) return {h: 60, svg: T(W / 2, 30, 'Ajoute des groupes et leur nombre de sièges.', {anchor: 'middle', size: fs, fill: '#888'}), legend};
        const seatSvg = (x, y, d, p, extra = '') => { const s = d * (1 - gap), tip = `<title>${esc(p.name)} — ${fmt(p.n, 0)} siège${p.n > 1 ? 's' : ''}</title>`;
            if (shape === 'square' || shape === 'rounded') return `<rect x="${r2(x - s / 2)}" y="${r2(y - s / 2)}" width="${r2(s)}" height="${r2(s)}" rx="${shape === 'rounded' ? r2(s * .25) : 0}" fill="${p.color}"${extra}>${tip}</rect>`;
            return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(s / 2)}" fill="${p.color}"${extra}>${tip}</circle>`; };
        const stroke = o.outline ? ` stroke="${color(o.outlineColor, '#333')}" stroke-width="1"` : '';
        const majority = Math.floor(N / 2) + 1;
        let svg = '', h;
        if (['hemicycle', 'arc', 'circle', 'horseshoe'].includes(layout)) {
            const deg = layout === 'hemicycle' ? 180 : layout === 'circle' ? 360 : clamp(num(o.angle) || 220, 60, 359);
            const inner = clamp(num(o.inner ?? (layout === 'circle' ? 45 : 38)), 5, 90) / 100;
            const L = layout === 'horseshoe' ? horseshoeSeats(N, inner, clamp(num(o.arm ?? 80), 10, 300) / 100, num(o.rows)) : arcSeats(N, deg, inner, num(o.rows));
            const xs = L.seats.map(s => s.x), ys = L.seats.map(s => s.y), half = L.size / 2;
            const minX = Math.min(...xs) - half, maxX = Math.max(...xs) + half, minY = Math.min(...ys) - half, maxY = Math.max(...ys) + half;
            const k = Math.min(W / (maxX - minX), (num(o.maxHeight) || W * 1.2) / (maxY - minY));
            const ox = (W - (maxX - minX) * k) / 2 - minX * k, oy = -minY * k;
            L.seats.forEach((s, i) => { svg += seatSvg(ox + s.x * k, oy + s.y * k, L.size * k, colorAt[i], stroke); });
            h = (maxY - minY) * k;
            const cx = ox, cy = layout === 'horseshoe' ? oy + (clamp(num(o.arm ?? 80), 10, 300) / 100) * k * .45 : layout === 'circle' ? oy : oy - L.size * k * .1;
            if (o.total !== false) {
                const big = Math.min(inner * k * (layout === 'circle' ? .9 : .75), fs * 6);
                svg += T(cx, layout === 'circle' ? cy : cy - big * .45, o.centerText || fmt(N, 0), {size: big, anchor: 'middle', weight: 800});
                if (o.centerSub) svg += T(cx, layout === 'circle' ? cy + big * .7 : cy + big * .25, o.centerSub, {size: fs, anchor: 'middle'});
            }
            if (o.majority === 'line' && layout !== 'circle') svg += `<line x1="${r2(cx)}" y1="${r2(oy - k * 1.04)}" x2="${r2(cx)}" y2="${r2(oy - inner * k * .95)}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>`;
        } else if (layout === 'westminster') {
            const lead = [...parties].sort((a, b) => b.n - a.n)[0]?.i, side = p => p.side || (p.i === lead ? 'gov' : 'opp');
            const groups = {speaker: [], gov: [], opp: [], cross: []};
            parties.forEach(p => { (groups[side(p)] || groups.opp).push(p); });
            const count = g => groups[g].reduce((a, p) => a + p.n, 0);
            const benchR = clamp(Math.round(num(o.rows)) || Math.max(1, Math.ceil(Math.sqrt(Math.max(count('gov'), count('opp')) / 6))), 1, 40);
            const crossC = Math.max(1, Math.ceil(Math.sqrt(count('cross') / 2)));
            const colsMain = Math.max(Math.ceil(count('gov') / benchR), Math.ceil(count('opp') / benchR), 1);
            const units = (count('speaker') ? 2 : 0) + colsMain + (count('cross') ? crossC + 1.5 : 0);
            const s = Math.min(W / units, fs * 3), sp = count('speaker') ? 2 * s : 0;
            const seq = g => { const a = []; groups[g].forEach(p => { for (let k = 0; k < p.n; k++) a.push(p); }); return a; };
            const gov = gridBlock(count('gov'), benchR, sp + s / 2, s / 2, s, true), oppY = gov.h + s * 1.6;
            const opp = gridBlock(count('opp'), benchR, sp + s / 2, oppY + s / 2, s);
            gov.seats.forEach((q, i) => { svg += seatSvg(q.x, q.y, s, seq('gov')[i], stroke); });
            opp.seats.forEach((q, i) => { svg += seatSvg(q.x, q.y, s, seq('opp')[i], stroke); });
            const totalH = oppY + opp.h;
            seq('speaker').forEach((p, i) => { svg += seatSvg(s / 2, totalH / 2 + (i - (count('speaker') - 1) / 2) * s, s, p, stroke); });
            if (count('cross')) { const cx0 = sp + colsMain * s + s * 1.5, cr = Math.ceil(count('cross') / crossC); seq('cross').forEach((p, i) => { svg += seatSvg(cx0 + (i % crossC) * s + s / 2, totalH / 2 - cr * s / 2 + Math.floor(i / crossC) * s + s / 2, s, p, stroke); }); }
            h = totalH;
            if (o.total !== false) svg += T(sp + colsMain * s / 2, gov.h + s * .8, o.centerText || `${fmt(N, 0)} sièges`, {size: fs * 1.1, anchor: 'middle', weight: 700});
        } else { // salle de classe / amphithéâtre droit, face à la tribune
            const R = clamp(Math.round(num(o.rows)) || Math.max(1, Math.round(Math.sqrt(N / 2.4))), 1, 80), C = Math.ceil(N / R);
            const s = Math.min(W / C, fs * 3), x0 = (W - C * s) / 2, top = s * 2.2;
            svg += `<rect x="${r2(W / 2 - s * 3)}" y="0" width="${r2(s * 6)}" height="${r2(s * 1.1)}" rx="${r2(s * .2)}" fill="none" stroke="currentColor" stroke-width="1.2"/>` + T(W / 2, s * .58, o.centerText || `Tribune · ${fmt(N, 0)} sièges`, {size: Math.min(fs, s * .55), anchor: 'middle'});
            for (let i = 0; i < N; i++) { const c = Math.floor(i / R), rr = i % R; svg += seatSvg(x0 + c * s + s / 2, top + rr * s + s / 2, s, colorAt[i], stroke); }
            h = top + R * s;
        }
        if (o.majority && o.majority !== 'none') { svg += T(W / 2, h + fs * 1.2, `Majorité absolue : ${fmt(majority, 0)} sièges`, {size: fs, anchor: 'middle'}); h += fs * 2; }
        return {h, svg, legend};
    }

    /* ═════════ 🎸 Frise des membres (façon Wikipédia), frise de vies, planning ═════════ */
    function memberTimeline(spec, W, fs) {
        const o = spec.o || {};
        const roles = rows(spec, 'roles').map((r, i) => ({name: String(r.role || '').trim(), color: pick(spec, i, r.color)})).filter(r => r.name);
        const roleOf = name => { const k = name.trim().toLowerCase(); let r = roles.find(x => x.name.toLowerCase() === k); if (!r) { r = {name: name.trim(), color: pick(spec, roles.length)}; roles.push(r); } return r; };
        const lines = [];
        for (const m of rows(spec)) {
            const name = String(m.name || '').trim(); if (!name) continue;
            const a = when(m.start), b = String(m.end || '').trim() ? when(m.end) : (o.openEnd === 'start' ? a : when('auj'));
            if (a === null) continue;
            const rl = String(m.roles || '').split(/[,;/+]/).map(s => s.trim()).filter(Boolean).map(roleOf);
            let line = lines.find(l => l.name === name); if (!line) lines.push(line = {name, stints: []});
            line.stints.push({a: Math.min(a, b ?? a), b: Math.max(a, b ?? a), roles: rl.length ? rl : [roleOf(o.defaultRole || 'Membre')], note: m.note || ''});
        }
        if (o.order === 'start') lines.sort((x, y) => Math.min(...x.stints.map(s => s.a)) - Math.min(...y.stints.map(s => s.a)));
        const evs = rows(spec, 'events').map(e => ({at: when(e.date, false), label: String(e.label || ''), kind: e.kind || 'album', color: e.color})).filter(e => e.at !== null);
        const all = [...lines.flatMap(l => l.stints.flatMap(s => [s.a, s.b])), ...evs.map(e => e.at)];
        if (!all.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des lignes : un nom, des rôles, une date de début et de fin.', {anchor: 'middle', size: fs, fill: '#888'}), legend: []};
        let from = when(o.from, false) ?? Math.floor(Math.min(...all)), to = when(o.to, false) ?? Math.ceil(Math.max(...all) + .001);
        if (to <= from) to = from + 1;
        const nameW = Math.min(W * .35, Math.max(...lines.map(l => textW(l.name, fs)), 20) + 12);
        const x0 = nameW, pw = W - nameW - 8, X = v => x0 + (clamp(v, from, to) - from) / (to - from) * pw;
        const bh = clamp(num(o.barHeight) || 18, 6, 60), rowH = bh + clamp(num(o.rowGap ?? 6), 0, 40);
        const topLabels = o.eventLabels && evs.some(e => e.label) ? Math.max(...evs.map(e => textW(e.label, fs * .85))) * .75 + 8 : 0;
        const y0 = topLabels + 4, plotH = lines.length * rowH;
        let svg = '';
        const tk = ticks(from, to, clamp(Math.round(pw / 70), 2, 30)); const step = num(o.step) > 0 ? num(o.step) : Math.max(1, tk.step);
        for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) {
            const x = X(v); svg += `<line x1="${r2(x)}" y1="${r2(y0)}" x2="${r2(x)}" y2="${r2(y0 + plotH)}" stroke="currentColor" stroke-opacity=".15"/>` + T(x, y0 + plotH + fs, String(Math.round(v * 100) / 100), {size: fs * .9, anchor: 'middle'});
        }
        lines.forEach((l, i) => {
            const y = y0 + i * rowH + (rowH - bh) / 2;
            svg += T(nameW - 8, y + bh / 2, cut(l.name, nameW - 10, fs), {size: fs, anchor: 'end'});
            for (const s of l.stints) {
                const xa = X(s.a), w = Math.max(1.5, X(s.b) - xa), tip = `<title>${esc(l.name)} — ${esc(s.roles.map(r => r.name).join(', '))} (${fmt(s.a, 1)} – ${fmt(s.b, 1)})${s.note ? ' — ' + esc(s.note) : ''}</title>`;
                svg += `<rect x="${r2(xa)}" y="${r2(y)}" width="${r2(w)}" height="${r2(bh)}" fill="${s.roles[0].color}">${tip}</rect>`;
                const extra = s.roles.slice(1);
                if (extra.length) { const sh = bh / (2 * extra.length + 1); extra.forEach((r, k) => { svg += `<rect x="${r2(xa)}" y="${r2(y + bh / 2 - extra.length * sh / 2 + k * sh)}" width="${r2(w)}" height="${r2(sh)}" fill="${r.color}">${tip}</rect>`; }); }
            }
        });
        const KIND = {album: ['#000', 1.6, ''], live: ['#888', 1.4, ''], single: ['#bbb', 1, ''], tour: ['#c33', 1.2, '4 3'], autre: ['#36c', 1.2, '2 3']};
        evs.forEach(e => { const [c, sw, dash] = KIND[e.kind] || KIND.autre, x = X(e.at);
            svg += `<line x1="${r2(x)}" y1="${r2(y0)}" x2="${r2(x)}" y2="${r2(y0 + plotH)}" stroke="${color(e.color, c)}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}><title>${esc(e.label)}</title></line>`;
            if (topLabels && e.label) svg += T(x, y0 - 4, e.label, {size: fs * .85, rotate: -45, baseline: 'auto'}); });
        const KL = {album: 'Album studio', live: 'Album live', single: 'Single', tour: 'Tournée', autre: 'Autre événement'};
        const legend = [...roles.filter(r => lines.some(l => l.stints.some(s => s.roles.includes(r)))).map(r => ({label: r.name, color: r.color})),
            ...[...new Set(evs.map(e => e.kind))].map(k => ({label: (o.kindLabels || {})[k] || KL[k] || k, color: (KIND[k] || KIND.autre)[0], type: (KIND[k] || KIND.autre)[2] ? 'dash' : 'line', width: 2}))];
        return {h: y0 + plotH + fs * 1.8, svg, legend};
    }

    /* ═════════ 📅 Frise chronologique ═════════ */
    function chrono(spec, W, fs) {
        const o = spec.o || {}, evs = rows(spec).map((e, i) => ({at: when(e.date, false), date: String(e.date || ''), label: String(e.label || ''), color: pick(spec, i, e.color)})).filter(e => e.at !== null).sort((a, b) => a.at - b.at);
        if (!evs.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des dates et ce qui s’est passé.', {anchor: 'middle', size: fs, fill: '#888'})};
        let from = evs[0].at, to = evs[evs.length - 1].at; if (to - from < 1) { from -= .5; to += .5; }
        const padX = Math.min(W * .12, 80), X = v => padX + (v - from) / (to - from) * (W - 2 * padX);
        const lanes = clamp(Math.round(num(o.lanes) || 3), 1, 8), laneH = fs * 3.2, mid = lanes * laneH + 10;
        let svg = `<line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="currentColor" stroke-width="2"/>`;
        const tk = ticks(from, to, clamp(Math.round(W / 90), 2, 20));
        tk.ticks.filter(v => v >= from && v <= to).forEach(v => { svg += `<line x1="${r2(X(v))}" y1="${mid - 4}" x2="${r2(X(v))}" y2="${mid + 4}" stroke="currentColor"/>` + T(X(v), mid + fs * 1.2, String(v), {size: fs * .85, anchor: 'middle', fill: '#888'}); });
        const lastEnd = [[], []]; let maxY = mid + fs * 2, minY = mid;
        evs.forEach((e, i) => {
            const up = o.side === 'below' ? 1 : o.side === 'above' ? 0 : i % 2, x = X(e.at), w = Math.max(textW(e.label, fs), textW(e.date, fs * .85)) + 10;
            let lane = 0; while (lane < lanes - 1 && (lastEnd[up][lane] ?? -1e9) > x - w / 2) lane++;
            lastEnd[up][lane] = x + w / 2;
            const ly = up ? mid + fs * 2.4 + lane * laneH : mid - fs * .8 - lane * laneH - fs * 1.4; maxY = Math.max(maxY, ly + fs * 1.8); minY = Math.min(minY, ly - fs);
            svg += `<line x1="${r2(x)}" y1="${mid}" x2="${r2(x)}" y2="${r2(up ? ly - fs * .5 : ly + fs * 1.6)}" stroke="${e.color}" stroke-width="1.2"/><circle cx="${r2(x)}" cy="${mid}" r="5" fill="${e.color}"/>`;
            svg += T(x, ly, e.date, {size: fs * .85, anchor: 'middle', weight: 700, fill: e.color}) + T(x, ly + fs * 1.1, e.label, {size: fs, anchor: 'middle'});
        });
        return {h: maxY - minY + 4, svg: `<g transform="translate(0 ${r2(4 - minY)})">${svg}</g>`};
    }

    /* ═════════ 📊 Tableaux de chiffres (catégories × séries) ═════════ */
    function table(spec) {
        const series = (Array.isArray(spec.series) && spec.series.length ? spec.series : [{name: 'Valeur'}]).map((s, j) => ({name: String(s?.name || `Série ${j + 1}`), color: pick(spec, j, s?.color)}));
        const cats = rows(spec).map((r, i) => ({label: String(r.label ?? ''), color: pick(spec, i, r.color), v: series.map((_, j) => num(r['s' + j]))}));
        return {series, cats};
    }
    const seriesLegend = (series, cats, single) => single ? cats.map(c => ({label: c.label, color: c.color})) : series.map(s => ({label: s.name, color: s.color}));
    function cartesian(spec, W, fs, mode) {
        const o = spec.o || {}, {series, cats} = table(spec), horiz = mode === 'bars', stacked = mode === 'stacked' || mode === 'stacked100', pct = mode === 'stacked100';
        if (!cats.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des lignes de chiffres.', {anchor: 'middle', size: fs, fill: '#888'})};
        const single = series.length === 1 && !['line', 'area'].includes(mode);
        const vals = cats.map(c => pct ? c.v.map(v => { const t = c.v.reduce((a, b) => a + Math.max(0, b), 0) || 1; return Math.max(0, v) / t * 100; }) : c.v);
        const sums = vals.map(v => v.reduce((a, b) => a + Math.max(0, b), 0)), negs = vals.map(v => v.reduce((a, b) => a + Math.min(0, b), 0));
        let lo = Math.min(0, ...(stacked ? negs : vals.flat())), hi = Math.max(0, ...(stacked ? sums : vals.flat()));
        if (num(o.min) || o.min === '0') lo = num(o.min); if (o.max !== undefined && o.max !== '') hi = num(o.max) || hi;
        if (pct) { lo = 0; hi = 100; }
        const tk = ticks(lo, hi, 5); lo = tk.lo; hi = tk.hi;
        const unit = o.unit ? ' ' + o.unit : '', tl = v => fmt(v) + (pct ? ' %' : '');
        const catLab = horiz ? Math.min(W * .32, Math.max(...cats.map(c => textW(c.label, fs))) + 10) : Math.max(...tk.ticks.map(v => textW(tl(v), fs * .85))) + 10;
        const plotW = W - catLab - 6, n = cats.length;
        const slot = (horiz ? 0 : plotW) / n;
        const rot = !horiz && Math.max(...cats.map(c => textW(c.label, fs * .9))) > slot * .95;
        const bottom = horiz ? fs * 1.6 : rot ? Math.min(140, Math.max(...cats.map(c => textW(c.label, fs * .9))) * .72 + fs) : fs * 1.8;
        const plotH = horiz ? n * clamp(fs * 2.2 * Math.max(1, stacked ? 1 : series.length * .7), 14, 80) : clamp(num(o.height) || W * .45, 120, 1600);
        const x0 = catLab, y0 = 6, V = v => (v - lo) / (hi - lo || 1);
        let svg = '';
        tk.ticks.forEach(v => { if (horiz) { const x = x0 + V(v) * plotW; svg += `<line x1="${r2(x)}" y1="${y0}" x2="${r2(x)}" y2="${r2(y0 + plotH)}" stroke="currentColor" stroke-opacity="${v === 0 ? .5 : .12}"/>` + T(x, y0 + plotH + fs, tl(v), {size: fs * .85, anchor: 'middle'}); }
            else { const y = y0 + plotH - V(v) * plotH; svg += `<line x1="${x0}" y1="${r2(y)}" x2="${r2(x0 + plotW)}" y2="${r2(y)}" stroke="currentColor" stroke-opacity="${v === 0 ? .5 : .12}"/>` + T(x0 - 6, y, tl(v), {size: fs * .85, anchor: 'end'}); } });
        const band = (horiz ? plotH : plotW) / n;
        const showV = o.values !== false;
        if (mode === 'line' || mode === 'area') {
            series.forEach((s, j) => {
                const pts = cats.map((c, i) => [x0 + band * (i + .5), y0 + plotH - V(vals[i][j]) * plotH]);
                const d = pts.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ' ' + r2(p[1])).join(' ');
                if (mode === 'area') svg += `<path d="${d} L${r2(pts[pts.length - 1][0])} ${r2(y0 + plotH - V(Math.max(lo, 0)) * plotH)} L${r2(pts[0][0])} ${r2(y0 + plotH - V(Math.max(lo, 0)) * plotH)} Z" fill="${s.color}" fill-opacity=".25"/>`;
                svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`;
                pts.forEach((p, i) => { svg += `<circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="3.5" fill="${s.color}"><title>${esc(cats[i].label)} — ${esc(s.name)} : ${fmt(vals[i][j])}${esc(unit)}</title></circle>`; if (showV && n <= 24) svg += T(p[0], p[1] - fs * .8, fmt(vals[i][j]), {size: fs * .8, anchor: 'middle'}); });
            });
        } else {
            cats.forEach((c, i) => {
                let accP = 0, accN = 0;
                const gw = band * .78, bw = stacked ? gw : gw / series.length;
                series.forEach((s, j) => {
                    const v = vals[i][j]; let a, b;
                    if (stacked) { if (v >= 0) { a = accP; b = accP += v; } else { a = accN; b = accN += v; } } else { a = 0; b = v; }
                    const pa = V(Math.max(lo, Math.min(a, b))), pb = V(Math.min(hi, Math.max(a, b))), fill = single ? c.color : s.color;
                    const tip = `<title>${esc(c.label)}${single ? '' : ' — ' + esc(s.name)} : ${fmt(c.v[j])}${esc(unit)}${pct ? ` (${fmt(v, 1)} %)` : ''}</title>`;
                    if (horiz) { const y = y0 + band * i + (band - gw) / 2 + (stacked ? 0 : j * bw); svg += `<rect x="${r2(x0 + pa * plotW)}" y="${r2(y)}" width="${r2(Math.max(0, (pb - pa) * plotW))}" height="${r2(bw * .92)}" fill="${fill}">${tip}</rect>`;
                        if (showV && !stacked && v) svg += T(x0 + pb * plotW + 4, y + bw * .46, fmt(v) + unit, {size: fs * .8}); }
                    else { const x = x0 + band * i + (band - gw) / 2 + (stacked ? 0 : j * bw); svg += `<rect x="${r2(x)}" y="${r2(y0 + plotH - pb * plotH)}" width="${r2(bw * .92)}" height="${r2(Math.max(0, (pb - pa) * plotH))}" fill="${fill}">${tip}</rect>`;
                        if (showV && v && (stacked ? (pb - pa) * plotH > fs * 1.2 : true) && bw > fs * 1.2) svg += stacked ? T(x + bw * .46, y0 + plotH - (pa + pb) / 2 * plotH, fmt(v, pct ? 0 : 2), {size: fs * .75, anchor: 'middle', fill: contrast(fill)}) : T(x + bw * .46, y0 + plotH - pb * plotH - fs * .6, fmt(v), {size: fs * .78, anchor: 'middle'}); }
                });
            });
        }
        cats.forEach((c, i) => { if (horiz) svg += T(x0 - 6, y0 + band * (i + .5), cut(c.label, catLab - 8, fs), {size: fs, anchor: 'end'});
            else svg += rot ? T(x0 + band * (i + .5), y0 + plotH + 8, cut(c.label, 130, fs * .9), {size: fs * .9, anchor: 'end', rotate: -40, baseline: 'hanging'}) : T(x0 + band * (i + .5), y0 + plotH + fs, cut(c.label, band, fs * .9), {size: fs * .9, anchor: 'middle'}); });
        if (o.yLabel) svg += T(horiz ? x0 + plotW / 2 : 2, horiz ? y0 + plotH + fs * 2.4 : y0 - 2, o.yLabel, {size: fs * .85, anchor: horiz ? 'middle' : 'start', weight: 600});
        return {h: y0 + plotH + bottom + (o.yLabel && horiz ? fs * 1.4 : 0), svg, legend: single ? [] : seriesLegend(series, cats, false)};
    }
    function pie(spec, W, fs, mode) {
        const o = spec.o || {}, {cats} = table(spec), items = cats.filter(c => c.v[0] > 0), tot = items.reduce((a, c) => a + c.v[0], 0);
        if (!tot) return {h: 60, svg: T(W / 2, 30, 'Ajoute des valeurs positives.', {anchor: 'middle', size: fs, fill: '#888'})};
        const half = mode === 'halfdonut', R = Math.min(W / 2 - 4, (num(o.height) || W * (half ? .3 : .42)) / (half ? 1 : 2)), cx = W / 2, cy = half ? R + 4 : R + 4;
        const hole = mode === 'pie' ? 0 : clamp(num(o.hole ?? 55), 10, 90) / 100 * R, span = half ? Math.PI : 2 * Math.PI;
        let a = half ? Math.PI : -Math.PI / 2, svg = '';
        const P = (ang, r) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
        items.forEach(c => {
            const d = c.v[0] / tot * span, b = a + d, large = d > Math.PI ? 1 : 0, [x1, y1] = P(a, R), [x2, y2] = P(b, R), [x3, y3] = P(b, hole), [x4, y4] = P(a, hole);
            const path = d >= 2 * Math.PI - 1e-6 ? `M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0${hole ? `M${cx - hole} ${cy}a${hole} ${hole} 0 1 1 ${2 * hole} 0a${hole} ${hole} 0 1 1 ${-2 * hole} 0` : ''}`
                : `M${r2(x1)} ${r2(y1)}A${r2(R)} ${r2(R)} 0 ${large} 1 ${r2(x2)} ${r2(y2)}` + (hole ? `L${r2(x3)} ${r2(y3)}A${r2(hole)} ${r2(hole)} 0 ${large} 0 ${r2(x4)} ${r2(y4)}Z` : `L${cx} ${cy}Z`);
            svg += `<path d="${path}" fill="${c.color}" fill-rule="evenodd" stroke="${o.bg === 'transparent' ? 'none' : '#fff'}" stroke-width="1.2"><title>${esc(c.label)} : ${fmt(c.v[0])} (${fmt(c.v[0] / tot * 100, 1)} %)</title></path>`;
            if (o.values !== false && d > .25) { const [lx, ly] = P(a + d / 2, hole ? (hole + R) / 2 : R * .64); svg += T(lx, ly, o.pieLabel === 'value' ? fmt(c.v[0]) : `${fmt(c.v[0] / tot * 100, 0)} %`, {size: fs * .9, anchor: 'middle', fill: contrast(c.color), weight: 600}); }
            a = b;
        });
        if (hole && o.total !== false) svg += T(cx, half ? cy - fs * 1.2 : cy, o.centerText || fmt(tot), {size: Math.min(hole * .6, fs * 2.6), anchor: 'middle', weight: 800});
        return {h: half ? R + 10 : 2 * R + 8, svg, legend: items.map(c => ({label: c.label, color: c.color}))};
    }
    function waffle(spec, W, fs) {
        const o = spec.o || {}, {cats} = table(spec), items = cats.filter(c => c.v[0] > 0), tot = items.reduce((a, c) => a + c.v[0], 0);
        if (!tot) return {h: 60, svg: T(W / 2, 30, 'Ajoute des valeurs positives.', {anchor: 'middle', size: fs, fill: '#888'})};
        const cols = clamp(Math.round(num(o.cols) || 10), 2, 50), cells = cols * clamp(Math.round(num(o.cellRows) || 10), 1, 50);
        const per = apportion(cells, items.map(c => c.v[0])), s = Math.min(W / cols, fs * 3.2);
        let k = 0, svg = '';
        items.forEach((c, i) => { for (let j = 0; j < per[i]; j++, k++) svg += `<rect x="${r2((k % cols) * s + (W - cols * s) / 2)}" y="${r2(Math.floor(k / cols) * s)}" width="${r2(s * .88)}" height="${r2(s * .88)}" rx="${r2(s * .15)}" fill="${c.color}"><title>${esc(c.label)} : ${fmt(c.v[0])} (${fmt(c.v[0] / tot * 100, 1)} %)</title></rect>`; });
        return {h: Math.ceil(cells / cols) * s, svg, legend: items.map(c => ({label: `${c.label} (${fmt(c.v[0] / tot * 100, 0)} %)`, color: c.color}))};
    }
    function radar(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec);
        if (cats.length < 3) return {h: 60, svg: T(W / 2, 30, 'Il faut au moins 3 lignes (les axes).', {anchor: 'middle', size: fs, fill: '#888'})};
        const max = num(o.max) || ticks(0, Math.max(...cats.flatMap(c => c.v)), 4).hi || 1;
        const labW = Math.max(...cats.map(c => textW(c.label, fs))), R = Math.min(W / 2 - labW - 10, num(o.height) / 2 || W * .3), cx = W / 2, cy = R + fs * 1.5;
        const ang = i => -Math.PI / 2 + i * 2 * Math.PI / cats.length;
        let svg = '';
        [.25, .5, .75, 1].forEach(f => { svg += `<polygon points="${cats.map((_, i) => `${r2(cx + R * f * Math.cos(ang(i)))},${r2(cy + R * f * Math.sin(ang(i)))}`).join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".15"/>` + T(cx + 3, cy - R * f, fmt(max * f), {size: fs * .75, fill: '#888'}); });
        cats.forEach((c, i) => { const x = cx + R * Math.cos(ang(i)), y = cy + R * Math.sin(ang(i)); svg += `<line x1="${cx}" y1="${cy}" x2="${r2(x)}" y2="${r2(y)}" stroke="currentColor" stroke-opacity=".2"/>` + T(cx + (R + 8) * Math.cos(ang(i)), cy + (R + 10) * Math.sin(ang(i)), c.label, {size: fs, anchor: Math.abs(Math.cos(ang(i))) < .2 ? 'middle' : Math.cos(ang(i)) > 0 ? 'start' : 'end'}); });
        series.forEach((s, j) => { svg += `<polygon points="${cats.map((c, i) => { const f = clamp(c.v[j] / max, 0, 1.2); return `${r2(cx + R * f * Math.cos(ang(i)))},${r2(cy + R * f * Math.sin(ang(i)))}`; }).join(' ')}" fill="${s.color}" fill-opacity=".22" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)}</title></polygon>`; });
        return {h: 2 * R + fs * 3, svg, legend: series.length > 1 ? seriesLegend(series) : []};
    }
    function funnel(spec, W, fs) {
        const {cats} = table(spec), max = Math.max(0, ...cats.map(c => c.v[0]));
        if (!max) return {h: 60, svg: T(W / 2, 30, 'Ajoute des valeurs.', {anchor: 'middle', size: fs, fill: '#888'})};
        const h = fs * 2.6, cx = W / 2; let svg = '';
        cats.forEach((c, i) => { const w = Math.max(4, c.v[0] / max * W * .9), nw = i < cats.length - 1 ? Math.max(4, cats[i + 1].v[0] / max * W * .9) : w * .8, y = i * (h + 3);
            svg += `<path d="M${r2(cx - w / 2)} ${r2(y)}H${r2(cx + w / 2)}L${r2(cx + nw / 2)} ${r2(y + h)}H${r2(cx - nw / 2)}Z" fill="${c.color}"><title>${esc(c.label)} : ${fmt(c.v[0])}</title></path>` ; const lab = `${c.label} — ${fmt(c.v[0])}${i ? ` (${fmt(c.v[0] / (cats[0].v[0] || 1) * 100, 0)} %)` : ''}`;
            svg += textW(lab, fs) < Math.min(w, nw) - 12 ? T(cx, y + h / 2, lab, {size: fs, anchor: 'middle', fill: contrast(c.color)}) : T(cx + Math.max(w, nw) / 2 + 8, y + h / 2, lab, {size: fs}); });
        return {h: cats.length * (h + 3), svg};
    }
    /** carte proportionnelle (« treemap ») : rectangles presque carrés */
    function squarify(items, x, y, w, h, out = []) {
        if (!items.length) return out;
        const tot = items.reduce((a, b) => a + b.v, 0); if (tot <= 0 || w <= 0 || h <= 0) return out;
        const scale = w * h / tot, side = Math.min(w, h), worst = (rowA, s) => { const sum = rowA.reduce((a, b) => a + b.v * scale, 0), mx = Math.max(...rowA.map(r => r.v * scale)), mn = Math.min(...rowA.map(r => r.v * scale)); return Math.max(side * side * mx / (sum * sum), sum * sum / (side * side * mn)); };
        let row = [items[0]], i = 1;
        while (i < items.length && worst([...row, items[i]]) <= worst(row)) row.push(items[i++]);
        const sum = row.reduce((a, b) => a + b.v * scale, 0), thick = sum / side;
        let off = 0;
        row.forEach(r => { const len = r.v * scale / thick; out.push(w >= h ? {...r, x, y: y + off, w: thick, h: len} : {...r, x: x + off, y, w: len, h: thick}); off += len; });
        return squarify(items.slice(i), w >= h ? x + thick : x, w >= h ? y : y + thick, w >= h ? w - thick : w, w >= h ? h : h - thick, out);
    }
    function treemap(spec, W, fs) {
        const o = spec.o || {}, {cats} = table(spec), items = cats.filter(c => c.v[0] > 0).map(c => ({...c, v: c.v[0]})).sort((a, b) => b.v - a.v), tot = items.reduce((a, b) => a + b.v, 0);
        if (!tot) return {h: 60, svg: T(W / 2, 30, 'Ajoute des valeurs positives.', {anchor: 'middle', size: fs, fill: '#888'})};
        const H = clamp(num(o.height) || W * .55, 100, 2000); let svg = '';
        squarify(items, 0, 0, W, H).forEach(r => { svg += `<rect x="${r2(r.x + 1)}" y="${r2(r.y + 1)}" width="${r2(Math.max(0, r.w - 2))}" height="${r2(Math.max(0, r.h - 2))}" fill="${r.color}"><title>${esc(r.label)} : ${fmt(r.v)} (${fmt(r.v / tot * 100, 1)} %)</title></rect>`;
            if (r.w > fs * 3 && r.h > fs * 2.4) svg += T(r.x + 6, r.y + fs, cut(r.label, r.w - 10, fs), {size: fs, weight: 600, fill: contrast(r.color)}) + T(r.x + 6, r.y + fs * 2.2, `${fmt(r.v)} · ${fmt(r.v / tot * 100, 0)} %`, {size: fs * .85, fill: contrast(r.color)}); });
        return {h: H, svg};
    }
    function pyramid(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec);
        if (!cats.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des tranches (âges…) et deux séries (hommes, femmes…).', {anchor: 'middle', size: fs, fill: '#888'})};
        const list = o.firstBottom === false ? cats : [...cats].reverse();
        const max = ticks(0, Math.max(1, ...cats.flatMap(c => [c.v[0], c.v[1] || 0])), 3).hi, labW = Math.max(...cats.map(c => textW(c.label, fs))) + 14;
        const half = (W - labW) / 2, bh = clamp(fs * 1.7, 10, 30); let svg = '';
        const colL = series[0]?.color, colR = series[1]?.color || pick(spec, 1);
        list.forEach((c, i) => { const y = i * (bh + 2), wl = c.v[0] / max * half, wr = (c.v[1] || 0) / max * half;
            svg += `<rect x="${r2(half - wl)}" y="${r2(y)}" width="${r2(wl)}" height="${r2(bh)}" fill="${colL}"><title>${esc(c.label)} — ${esc(series[0]?.name)} : ${fmt(c.v[0])}</title></rect>`;
            svg += `<rect x="${r2(half + labW)}" y="${r2(y)}" width="${r2(wr)}" height="${r2(bh)}" fill="${colR}"><title>${esc(c.label)} — ${esc(series[1]?.name || '')} : ${fmt(c.v[1] || 0)}</title></rect>`;
            svg += T(half + labW / 2, y + bh / 2, c.label, {size: fs * .9, anchor: 'middle'});
            if (o.values !== false) { if (c.v[0]) svg += T(half - wl - 4, y + bh / 2, fmt(c.v[0]), {size: fs * .78, anchor: 'end'}); if (c.v[1]) svg += T(half + labW + wr + 4, y + bh / 2, fmt(c.v[1]), {size: fs * .78}); } });
        return {h: list.length * (bh + 2), svg, legend: [{label: series[0]?.name || 'Gauche', color: colL}, {label: series[1]?.name || 'Droite', color: colR}]};
    }
    function heatmap(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec);
        if (!cats.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des lignes et des colonnes de chiffres.', {anchor: 'middle', size: fs, fill: '#888'})};
        const all = cats.flatMap(c => c.v), mn = Math.min(...all), mx = Math.max(...all);
        const hex = h => { const m = color(h, '#000').match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [0, 0, 0]; };
        const lo = hex(color(o.lowColor, '#eef3ff').length === 7 ? color(o.lowColor, '#eef3ff') : '#eef3ff'), hi = hex(color(o.highColor, '#1e4fd8').length === 7 ? color(o.highColor, '#1e4fd8') : '#1e4fd8');
        const mix = f => '#' + lo.map((c, i) => Math.round(c + (hi[i] - c) * f).toString(16).padStart(2, '0')).join('');
        const labW = Math.min(W * .3, Math.max(...cats.map(c => textW(c.label, fs))) + 10), cw = (W - labW) / series.length, ch = clamp(fs * 2.2, 14, 50), top = fs * 2;
        let svg = '';
        series.forEach((s, j) => { svg += T(labW + cw * (j + .5), top / 2, cut(s.name, cw - 4, fs * .9), {size: fs * .9, anchor: 'middle', weight: 600}); });
        cats.forEach((c, i) => { svg += T(labW - 6, top + ch * (i + .5), cut(c.label, labW - 8, fs), {size: fs, anchor: 'end'});
            c.v.forEach((v, j) => { const f = mx > mn ? (v - mn) / (mx - mn) : .5, col = mix(f); svg += `<rect x="${r2(labW + cw * j + 1)}" y="${r2(top + ch * i + 1)}" width="${r2(cw - 2)}" height="${r2(ch - 2)}" fill="${col}"><title>${esc(c.label)} × ${esc(series[j].name)} : ${fmt(v)}</title></rect>`;
                if (o.values !== false && cw > fs * 2) svg += T(labW + cw * (j + .5), top + ch * (i + .5), fmt(v), {size: fs * .85, anchor: 'middle', fill: contrast(col)}); }); });
        return {h: top + cats.length * ch, svg};
    }
    function scatter(spec, W, fs) {
        const o = spec.o || {}, pts = rows(spec).map((r, i) => ({label: String(r.label || ''), x: num(r.x), y: num(r.y), s: Math.max(0, num(r.size)), color: pick(spec, o.oneColor ? 0 : i, r.color)}));
        if (!pts.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des points : X, Y (et une taille pour des bulles).', {anchor: 'middle', size: fs, fill: '#888'})};
        const tx = ticks(Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x)), 6), ty = ticks(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y)), 5);
        const left = Math.max(...ty.ticks.map(v => textW(fmt(v), fs * .85))) + 12, H = clamp(num(o.height) || W * .5, 120, 1600), plotW = W - left - 10;
        const X = v => left + (v - tx.lo) / (tx.hi - tx.lo || 1) * plotW, Y = v => H - (v - ty.lo) / (ty.hi - ty.lo || 1) * H;
        const smax = Math.max(1e-9, ...pts.map(p => p.s)), rmax = clamp(num(o.maxBubble) || fs * 2.4, 4, 120);
        let svg = '';
        tx.ticks.forEach(v => { svg += `<line x1="${r2(X(v))}" y1="0" x2="${r2(X(v))}" y2="${H}" stroke="currentColor" stroke-opacity=".1"/>` + T(X(v), H + fs, fmt(v), {size: fs * .85, anchor: 'middle'}); });
        ty.ticks.forEach(v => { svg += `<line x1="${left}" y1="${r2(Y(v))}" x2="${r2(left + plotW)}" y2="${r2(Y(v))}" stroke="currentColor" stroke-opacity=".1"/>` + T(left - 6, Y(v), fmt(v), {size: fs * .85, anchor: 'end'}); });
        [...pts].sort((a, b) => b.s - a.s).forEach(p => { const r = p.s ? Math.max(3, Math.sqrt(p.s / smax) * rmax) : 5; svg += `<circle cx="${r2(X(p.x))}" cy="${r2(Y(p.y))}" r="${r2(r)}" fill="${p.color}" fill-opacity=".7" stroke="${p.color}"><title>${esc(p.label)} — X ${fmt(p.x)}, Y ${fmt(p.y)}${p.s ? `, taille ${fmt(p.s)}` : ''}</title></circle>`;
            if (o.values !== false && p.label) svg += T(X(p.x) + r + 3, Y(p.y), p.label, {size: fs * .85}); });
        if (o.xLabel) svg += T(left + plotW / 2, H + fs * 2.4, o.xLabel, {size: fs * .9, anchor: 'middle', weight: 600});
        if (o.yLabel) svg += T(10, H / 2, o.yLabel, {size: fs * .9, anchor: 'middle', weight: 600, rotate: -90});
        return {h: H + fs * (o.xLabel ? 3.2 : 2), svg};
    }
    /* ═════════ 🔀 Flux (Sankey) ═════════ */
    function sankey(spec, W, fs) {
        const o = spec.o || {}, links = rows(spec).map(r => ({s: String(r.from || '').trim(), t: String(r.to || '').trim(), v: Math.max(0, num(r.value)), color: r.color})).filter(l => l.s && l.t && l.v > 0 && l.s !== l.t).slice(0, 400);
        if (!links.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des flux : de, vers, combien.', {anchor: 'middle', size: fs, fill: '#888'})};
        const names = [...new Set(links.flatMap(l => [l.s, l.t]))], N = new Map(names.map((n, i) => [n, {name: n, i, col: 0, inV: 0, outV: 0, color: pick(spec, i)}]));
        links.forEach(l => { N.get(l.s).outV += l.v; N.get(l.t).inV += l.v; });
        for (let pass = 0; pass < names.length; pass++) { let moved = false; links.forEach(l => { const a = N.get(l.s), b = N.get(l.t); if (b.col < a.col + 1 && a.col + 1 < names.length) { b.col = a.col + 1; moved = true; } }); if (!moved) break; } // une boucle s'arrête d'elle-même
        const cols = Math.max(...[...N.values()].map(n => n.col)) + 1, H = clamp(num(o.height) || W * .55, 120, 2000), nodeW = clamp(fs * 1.1, 8, 24), gapY = fs * .9;
        const byCol = Array.from({length: cols}, (_, c) => [...N.values()].filter(n => n.col === c));
        const k = Math.min(...byCol.map(list => (H - gapY * (list.length - 1)) / (list.reduce((a, n) => a + Math.max(n.inV, n.outV), 0) || 1)));
        const labelRoom = Math.max(...names.map(n => textW(n, fs))) + 8, colX = c => cols === 1 ? 0 : c * (W - nodeW - labelRoom) / (cols - 1);
        byCol.forEach((list, c) => { let y = 0; list.forEach(n => { n.x = colX(c); n.y = y; n.h = Math.max(1, Math.max(n.inV, n.outV) * k); n.oy = 0; n.iy = 0; y += n.h + gapY; }); });
        let svg = '';
        links.forEach(l => { const a = N.get(l.s), b = N.get(l.t), w = l.v * k, y1 = a.y + a.oy + w / 2, y2 = b.y + b.iy + w / 2; a.oy += w; b.iy += w;
            const x1 = a.x + nodeW, x2 = b.x, mx = (x1 + x2) / 2;
            svg += `<path d="M${r2(x1)} ${r2(y1)}C${r2(mx)} ${r2(y1)} ${r2(mx)} ${r2(y2)} ${r2(x2)} ${r2(y2)}" fill="none" stroke="${color(l.color, a.color)}" stroke-opacity=".38" stroke-width="${r2(Math.max(1, w))}"><title>${esc(l.s)} → ${esc(l.t)} : ${fmt(l.v)}</title></path>`; });
        N.forEach(n => { svg += `<rect x="${r2(n.x)}" y="${r2(n.y)}" width="${nodeW}" height="${r2(n.h)}" fill="${n.color}"><title>${esc(n.name)} : ${fmt(Math.max(n.inV, n.outV))}</title></rect>`;
            const right = n.col < cols - 1 || cols === 1; svg += T(right ? n.x + nodeW + 5 : n.x - 5, n.y + n.h / 2, `${n.name}${o.values !== false ? ` (${fmt(Math.max(n.inV, n.outV))})` : ''}`, {size: fs * .9, anchor: right ? 'start' : 'end'}); });
        return {h: Math.max(...[...N.values()].map(n => n.y + n.h)), svg};
    }
    /* ═════════ 🧭 Organigramme / arbre ═════════ */
    function orgchart(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map((r, i) => ({name: String(r.name || '').trim(), parent: String(r.parent || '').trim(), detail: String(r.detail || ''), color: pick(spec, o.oneColor ? 0 : i, r.color), kids: []})).filter(n => n.name);
        if (!list.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des cases : un nom et, pour chacune, sa case « au-dessus ».', {anchor: 'middle', size: fs, fill: '#888'})};
        const by = new Map(); list.forEach(n => { if (!by.has(n.name)) by.set(n.name, n); });
        const roots = [];
        list.forEach(n => { const p = n.parent && n.parent !== n.name ? by.get(n.parent) : null; let a = p, safe = 0; while (a && a !== n && safe++ < 500) a = a.parent ? by.get(a.parent) : null; (p && a !== n ? p.kids : roots).push(n); });
        const horiz = o.direction === 'right', bw = clamp(num(o.boxWidth) || Math.max(...list.map(n => Math.max(textW(n.name, fs), textW(n.detail, fs * .85)))) + 18, 50, 320), bh = fs * (list.some(n => n.detail) ? 3.2 : 2.2);
        const gx = horiz ? bw + fs * 3 : bw + fs, gy = horiz ? bh + fs * .8 : bh + fs * 2.6;
        let leaf = 0; const seen = new Set();
        const place = (n, d) => { if (seen.has(n)) return; seen.add(n); n.d = d; if (!n.kids.length) { n.p = leaf++; return; } n.kids.forEach(k => place(k, d + 1)); n.p = (n.kids[0].p + n.kids[n.kids.length - 1].p) / 2; };
        roots.forEach(r => place(r, 0));
        const maxD = Math.max(...list.map(n => n.d || 0));
        const sx = horiz ? Math.min(1, W / ((maxD + 1) * gx)) : Math.min(1, W / (leaf * gx)), pos = n => horiz ? [n.d * gx * sx, n.p * gy] : [n.p * gx * sx + (W - leaf * gx * sx) / 2, n.d * gy];
        let svg = '';
        list.forEach(n => n.kids.forEach(k => { const [x1, y1] = pos(n), [x2, y2] = pos(k), w = bw * sx;
            svg += horiz ? `<path d="M${r2(x1 + w)} ${r2(y1 + bh / 2)}H${r2((x1 + w + x2) / 2)}V${r2(y2 + bh / 2)}H${r2(x2)}" fill="none" stroke="currentColor" stroke-opacity=".5"/>` : `<path d="M${r2(x1 + w / 2)} ${r2(y1 + bh)}V${r2((y1 + bh + y2) / 2)}H${r2(x2 + w / 2)}V${r2(y2)}" fill="none" stroke="currentColor" stroke-opacity=".5"/>`; }));
        list.forEach(n => { if (n.d === undefined) return; const [x, y] = pos(n), w = bw * sx, f = Math.min(fs, fs * sx * 1.1);
            svg += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(bh)}" rx="6" fill="${n.color}"/>` + T(x + w / 2, y + (n.detail ? bh * .36 : bh / 2), cut(n.name, w - 6, f), {size: f, anchor: 'middle', weight: 700, fill: contrast(n.color)});
            if (n.detail) svg += T(x + w / 2, y + bh * .7, cut(n.detail, w - 6, f * .85), {size: f * .85, anchor: 'middle', fill: contrast(n.color)}); });
        return {h: horiz ? leaf * gy : (maxD + 1) * gy - fs * 2.6 + 4, svg};
    }
    /* ═════════ ⭕ Venn ═════════ */
    function venn(spec, W, fs) {
        const o = spec.o || {}, sets = rows(spec, 'sets').map((s, i) => ({name: String(s.name || `Ensemble ${'ABC'[i]}`), color: pick(spec, i, s.color)})).slice(0, 3);
        if (sets.length < 2) return {h: 60, svg: T(W / 2, 30, 'Il faut 2 ou 3 ensembles.', {anchor: 'middle', size: fs, fill: '#888'})};
        const reg = {}; rows(spec).forEach(r => { reg[String(r.region || '').replace(/\s/g, '')] = String(r.value ?? ''); });
        const R = Math.min(W * (sets.length === 3 ? .24 : .3), num(o.height) / 3 || 220), cx = W / 2, three = sets.length === 3;
        const C = three ? [[cx - R * .55, R * 1.05], [cx + R * .55, R * 1.05], [cx, R * 1.95]] : [[cx - R * .6, R * 1.05], [cx + R * .6, R * 1.05]];
        let svg = sets.map((s, i) => `<circle cx="${r2(C[i][0])}" cy="${r2(C[i][1])}" r="${r2(R)}" fill="${s.color}" fill-opacity=".35" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)}</title></circle>`).join('');
        sets.forEach((s, i) => { const dx = C[i][0] - cx, dy = three ? C[i][1] - R * 1.35 : 0, d = Math.hypot(dx, dy) || 1; svg += T(C[i][0] + dx / d * R * .9, (three ? C[i][1] + dy / d * R * .9 : R * .02) + (three ? 0 : 0), s.name, {size: fs * 1.05, anchor: 'middle', weight: 700, baseline: three ? 'middle' : 'hanging'}); });
        const at = three ? {A: [C[0][0] - R * .35, C[0][1] - R * .2], B: [C[1][0] + R * .35, C[1][1] - R * .2], C: [C[2][0], C[2][1] + R * .4], AB: [cx, C[0][1] - R * .35], AC: [cx - R * .5, R * 1.65], BC: [cx + R * .5, R * 1.65], ABC: [cx, R * 1.38]}
            : {A: [C[0][0] - R * .4, C[0][1]], B: [C[1][0] + R * .4, C[1][1]], AB: [cx, C[0][1]]};
        Object.entries(at).forEach(([k, [x, y]]) => { const v = reg[k] ?? reg[k.split('').join('∩')] ?? ''; if (v !== '') svg += T(x, y, v, {size: fs * 1.05, anchor: 'middle', weight: 600}); });
        return {h: three ? R * 3.05 : R * 2.15, svg, legend: []};
    }
    /* ═════════ ☁️ Nuage de mots ═════════ */
    function wordcloud(spec, W, fs) {
        const o = spec.o || {}, words = rows(spec).map((r, i) => ({w: String(r.word || '').trim(), v: Math.max(0, num(r.weight) || 1), color: pick(spec, i, r.color)})).filter(x => x.w).sort((a, b) => b.v - a.v).slice(0, 200);
        if (!words.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des mots (noms, prénoms, lieux…) et leur poids.', {anchor: 'middle', size: fs, fill: '#888'})};
        const H = clamp(num(o.height) || W * .5, 100, 1600), max = words[0].v, min = words[words.length - 1].v, placed = []; let svg = '';
        const big = clamp(num(o.maxFont) || W / 9, 12, 140), small = Math.max(9, big / 7);
        words.forEach((x, i) => {
            const size = small + (big - small) * (max > min ? Math.sqrt((x.v - min) / (max - min)) : 1), w = textW(x.w, size), h = size * 1.05;
            for (let t = 0; t < 3000; t += 1) { const a = t * .35, rad = 2.2 * a, px = W / 2 + rad * Math.cos(a) * (W / H) - w / 2, py = H / 2 + rad * Math.sin(a) - h / 2;
                if (px < 0 || py < 0 || px + w > W || py + h > H) { if (rad > Math.max(W, H)) break; continue; }
                if (placed.some(b => px < b.x + b.w && px + w > b.x && py < b.y + b.h && py + h > b.y)) continue;
                placed.push({x: px, y: py, w, h}); svg += `<g><title>${esc(x.w)} : ${fmt(x.v)}</title>${T(px + w / 2, py + h / 2, x.w, {size, anchor: 'middle', weight: i < 5 ? 700 : 500, fill: x.color})}</g>`; break; }
        });
        return {h: H, svg};
    }
    /* ═════════ ⏱️ Jauges ═════════ */
    function gauges(spec, W, fs) {
        const list = rows(spec).map((r, i) => ({label: String(r.label || ''), v: num(r.value), max: num(r.max) || 100, color: pick(spec, i, r.color)})).slice(0, 24);
        if (!list.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute une jauge : un nom, une valeur, un maximum.', {anchor: 'middle', size: fs, fill: '#888'})};
        const per = clamp(Math.floor(W / Math.max(140, fs * 12)), 1, list.length), w = W / per, R = Math.min(w * .42, 140); let svg = '';
        list.forEach((g, i) => { const cx = w * (i % per) + w / 2, cy = Math.floor(i / per) * (R * 1.5 + fs * 2) + R + 4, f = clamp(g.v / g.max, 0, 1);
            const arc = (a0, a1, col, sw) => { const p = a => [cx + R * Math.cos(Math.PI + a * Math.PI), cy + R * Math.sin(Math.PI + a * Math.PI)], [x1, y1] = p(a0), [x2, y2] = p(a1); return `<path d="M${r2(x1)} ${r2(y1)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(x2)} ${r2(y2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`; };
            svg += arc(0, 1, '#8884', R * .22) + (f > 0 ? arc(0, Math.max(.001, f), g.color, R * .22) : '') + T(cx, cy - R * .3, `${fmt(g.v)}`, {size: R * .34, anchor: 'middle', weight: 800}) + T(cx, cy - R * .02, `${fmt(f * 100, 0)} % de ${fmt(g.max)}`, {size: fs * .8, anchor: 'middle', fill: '#888'}) + T(cx, cy + fs * 1.4, cut(g.label, w - 8, fs), {size: fs, anchor: 'middle', weight: 600}); });
        return {h: Math.ceil(list.length / per) * (R * 1.5 + fs * 2) - R * .4 + fs * 1.4, svg};
    }
    /* ═════════ 👤 Pictogrammes ═════════ */
    function pictogram(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map((r, i) => ({label: String(r.label || ''), v: Math.max(0, num(r.value)), icon: String(r.icon || '●').slice(0, 4), color: pick(spec, i, r.color)})).slice(0, 60);
        if (!list.length) return {h: 60, svg: T(W / 2, 30, 'Ajoute des lignes : un nom, un nombre, un symbole (👤, 👶, ⚓…).', {anchor: 'middle', size: fs, fill: '#888'})};
        const unit = num(o.unit) > 0 ? num(o.unit) : 1, s = clamp(num(o.iconSize) || fs * 1.8, 8, 60), labW = Math.min(W * .32, Math.max(...list.map(x => textW(x.label, fs))) + 12);
        const perRow = Math.max(1, Math.floor((W - labW - 60) / s)); let y = 0, svg = '';
        list.forEach(x => { const n = Math.min(2000, x.v / unit), whole = Math.floor(n), part = n - whole, lines = Math.max(1, Math.ceil(Math.ceil(n) / perRow));
            svg += T(labW - 8, y + s / 2, cut(x.label, labW - 10, fs), {size: fs, anchor: 'end'});
            for (let k = 0; k < Math.ceil(n); k++) { const px = labW + (k % perRow) * s + s / 2, py = y + Math.floor(k / perRow) * s + s / 2, frac = k === whole ? part : 1;
                svg += frac < 1 ? `<clipPath id="pc${r2(px)}_${r2(py)}"><rect x="${r2(px - s / 2)}" y="${r2(py - s / 2)}" width="${r2(s * frac)}" height="${r2(s)}"/></clipPath><g clip-path="url(#pc${r2(px)}_${r2(py)})">${T(px, py, x.icon, {size: s * .85, anchor: 'middle', fill: x.color})}</g>` : T(px, py, x.icon, {size: s * .85, anchor: 'middle', fill: x.color}); }
            svg += T(labW + Math.min(Math.ceil(n), perRow) * s + 8, y + s / 2, fmt(x.v), {size: fs * .9, weight: 600});
            y += lines * s + fs * .5; });
        return {h: y, svg, legend: unit !== 1 ? [{label: `1 symbole = ${fmt(unit)}`, color: '#8880'}] : []};
    }

    /* ═════════ Les types : leurs tableaux de données et leurs réglages ═════════ */
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const SIDES = [['', 'auto'], ['gov', 'Majorité (banc du haut)'], ['opp', 'Opposition (banc du bas)'], ['cross', 'Non-inscrits (bout)'], ['speaker', 'Présidence']];
    const TABLE_GRID = {key: 'rows', label: 'Les chiffres', series: true, cols: [C('label', 'Catégorie'), C('color', 'Couleur', 'color')]};
    const ONE_SERIES = {key: 'rows', label: 'Les chiffres', series: 1, cols: [C('label', 'Catégorie'), C('color', 'Couleur', 'color')]};
    const O = {
        values: C('values', 'Afficher les valeurs', 'check', {def: true}),
        height: C('height', 'Hauteur du dessin (px)', 'number', {min: 80, max: 2000}),
        unit: C('unit', 'Unité (ex. : personnes, €)'),
        yLabel: C('yLabel', 'Nom de l’axe des valeurs'),
        hole: C('hole', 'Trou au centre (%)', 'range', {min: 10, max: 90, def: 55}),
        centerText: C('centerText', 'Texte au centre (sinon le total)'),
        total: C('total', 'Total au centre', 'check', {def: true}),
    };
    const KINDS = {
        parliament: {icon: '🏛️', label: 'Parlement, assemblée, conseil', group: 'Assemblées', render: parliament, legend: 'bottom',
            grids: [{key: 'rows', label: 'Les groupes (de gauche à droite)', cols: [C('name', 'Groupe / parti'), C('seats', 'Sièges', 'number'), C('color', 'Couleur', 'color'), C('side', 'Côté (Westminster)', 'select', {choices: SIDES, when: s => s.o?.layout === 'westminster'})]}],
            options: [C('layout', 'Disposition', 'select', {choices: [['hemicycle', 'Hémicycle (demi-cercle)'], ['arc', 'Arc élargi (angle au choix)'], ['horseshoe', 'Fer à cheval'], ['westminster', 'Westminster (bancs face à face)'], ['circle', 'Cercle complet'], ['classroom', 'Salle (rangées face à la tribune)']], def: 'hemicycle'}),
                C('angle', 'Angle de l’arc (°)', 'range', {min: 90, max: 350, def: 220, when: s => s.o?.layout === 'arc'}), C('arm', 'Longueur des bancs droits (%)', 'range', {min: 10, max: 300, def: 80, when: s => s.o?.layout === 'horseshoe'}),
                C('inner', 'Trou au centre (%)', 'range', {min: 5, max: 90, def: 38, when: s => ['hemicycle', 'arc', 'horseshoe', 'circle', undefined].includes(s.o?.layout)}),
                C('rows', 'Nombre de rangées (0 = automatique)', 'number', {min: 0, max: 80, def: 0}), C('shape', 'Forme des sièges', 'select', {choices: [['circle', 'Ronds'], ['square', 'Carrés'], ['rounded', 'Carrés arrondis']], def: 'circle'}),
                C('gap', 'Espace entre les sièges (%)', 'range', {min: 0, max: 60, def: 15}), C('outline', 'Contour des sièges', 'check'), C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['desc', 'Du plus grand au plus petit']]}),
                O.total, C('centerText', 'Texte au centre (sinon le nombre de sièges)'), C('centerSub', 'Petit texte sous le nombre'), C('majority', 'Majorité absolue', 'select', {choices: [['none', 'Ne pas montrer'], ['text', 'En texte'], ['line', 'En texte et ligne au milieu']], def: 'none'}),
                C('legendSeats', 'Sièges dans la légende', 'check', {def: true})],
            sample: () => ({o: {layout: 'hemicycle', title: 'Assemblée', majority: 'text'}, rows: [['Gauche radicale', 22, '#dd0000'], ['Socialistes', 66, '#ff8080'], ['Écologistes', 23, '#00c000'], ['Centre gauche', 18, '#dda0dd'], ['Centre', 30, '#ffeb00'], ['Libéraux', 16, '#0000c0'], ['Majorité', 98, '#00ffff'], ['Droite', 62, '#0066cc'], ['Droite nationale', 11, '#0d378a'], ['Non-inscrits', 2, '#eeeeee']].map(([name, seats, color]) => ({name, seats, color}))})},
        timeline: {icon: '🎸', label: 'Frise des membres (groupe de musique, association…)', group: 'Frises', render: memberTimeline, legend: 'bottom',
            grids: [{key: 'rows', label: 'Les membres (une ligne par période ; même nom = même ligne)', cols: [C('name', 'Nom'), C('roles', 'Rôles (séparés par des virgules)'), C('start', 'Début', 'text', {ph: '1987 ou 03/1987'}), C('end', 'Fin (vide = aujourd’hui)'), C('note', 'Note')]},
                {key: 'roles', label: 'Les rôles et leur couleur', cols: [C('role', 'Rôle'), C('color', 'Couleur', 'color')]},
                {key: 'events', label: 'Les traits verticaux (albums, tournées, événements)', cols: [C('date', 'Date'), C('label', 'Nom'), C('kind', 'Sorte', 'select', {choices: [['album', 'Album studio (noir)'], ['live', 'Album live (gris)'], ['single', 'Single (gris clair)'], ['tour', 'Tournée (rouge, pointillés)'], ['autre', 'Autre (bleu, pointillés)']]}), C('color', 'Couleur', 'color')]}],
            options: [C('from', 'Début de la frise (vide = auto)'), C('to', 'Fin de la frise (vide = auto)'), C('step', 'Un repère tous les … ans (vide = auto)', 'number'), C('barHeight', 'Épaisseur des barres', 'range', {min: 6, max: 60, def: 18}), C('rowGap', 'Espace entre les lignes', 'range', {min: 0, max: 40, def: 6}),
                C('order', 'Ordre des lignes', 'select', {choices: [['', 'Comme dans le tableau'], ['start', 'Par date d’arrivée']]}), C('eventLabels', 'Écrire le nom des traits verticaux', 'check'), C('defaultRole', 'Rôle par défaut (si vide)')],
            sample: () => ({o: {title: 'Les Cousins — membres'}, rows: [{name: 'Paul', roles: 'Chant, Guitare rythmique', start: '1978', end: ''}, {name: 'Marc', roles: 'Guitare solo', start: '1978', end: '1986'}, {name: 'Marc', roles: 'Guitare solo, Chœurs', start: '1994', end: ''}, {name: 'Léa', roles: 'Basse', start: '1980', end: '2001'}, {name: 'Hugo', roles: 'Basse', start: '2001', end: ''}, {name: 'Jean', roles: 'Batterie', start: '1978', end: '1990'}, {name: 'Sam', roles: 'Batterie', start: '1990', end: ''}],
                roles: [{role: 'Chant', color: '#e15759'}, {role: 'Guitare rythmique', color: '#59a14f'}, {role: 'Guitare solo', color: '#76b7b2'}, {role: 'Chœurs', color: '#f2c94c'}, {role: 'Basse', color: '#4e79a7'}, {role: 'Batterie', color: '#b07aa1'}],
                events: [{date: '1981', label: 'Premier album', kind: 'album'}, {date: '1984', label: 'Deuxième', kind: 'album'}, {date: '1988', label: 'Live à l’Olympia', kind: 'live'}, {date: '1996', label: 'Retour', kind: 'album'}, {date: '2005', label: 'Tournée', kind: 'tour'}, {date: '2012', label: 'Dernier album', kind: 'album'}]})},
        chrono: {icon: '📅', label: 'Frise chronologique (dates clés)', group: 'Frises', render: chrono, noLegend: true,
            grids: [{key: 'rows', label: 'Les événements', cols: [C('date', 'Date'), C('label', 'Ce qui s’est passé'), C('color', 'Couleur', 'color')]}],
            options: [C('side', 'Textes', 'select', {choices: [['', 'En alternance dessus / dessous'], ['above', 'Tous au-dessus'], ['below', 'Tous en dessous']]}), C('lanes', 'Étages au plus (pour éviter les chevauchements)', 'range', {min: 1, max: 8, def: 3})],
            sample: () => ({o: {title: 'La famille Martin'}, rows: [{date: '1792', label: 'Naissance de Jean'}, {date: '1815', label: 'Mariage à Rennes'}, {date: '1832', label: 'Départ pour Nantes'}, {date: '1848', label: 'Achat de la ferme'}, {date: '1870', label: 'Guerre'}, {date: '1889', label: 'Décès de Jean'}]})},
        columns: {icon: '📊', label: 'Colonnes', group: 'Chiffres', render: (s, W, fs) => cartesian(s, W, fs, 'columns'), grids: [TABLE_GRID], options: [O.values, O.height, O.unit, O.yLabel, C('min', 'Axe : minimum'), C('max', 'Axe : maximum')], sample: () => sampleTable(true)},
        bars: {icon: '📶', label: 'Barres horizontales', group: 'Chiffres', render: (s, W, fs) => cartesian(s, W, fs, 'bars'), grids: [TABLE_GRID], options: [O.values, O.unit, O.yLabel], sample: () => sampleTable(false)},
        stacked: {icon: '🧱', label: 'Colonnes empilées', group: 'Chiffres', render: (s, W, fs) => cartesian(s, W, fs, 'stacked'), grids: [TABLE_GRID], options: [O.values, O.height, O.unit, O.yLabel], sample: () => sampleTable(true)},
        stacked100: {icon: '💯', label: 'Colonnes empilées à 100 %', group: 'Chiffres', render: (s, W, fs) => cartesian(s, W, fs, 'stacked100'), grids: [TABLE_GRID], options: [O.values, O.height], sample: () => sampleTable(true)},
        line: {icon: '📈', label: 'Courbe', group: 'Chiffres', render: (s, W, fs) => cartesian(s, W, fs, 'line'), grids: [TABLE_GRID], options: [O.values, O.height, O.unit, O.yLabel, C('min', 'Axe : minimum'), C('max', 'Axe : maximum')], sample: () => sampleTable(true)},
        area: {icon: '⛰️', label: 'Aire (courbe remplie)', group: 'Chiffres', render: (s, W, fs) => cartesian(s, W, fs, 'area'), grids: [TABLE_GRID], options: [O.values, O.height, O.unit, O.yLabel], sample: () => sampleTable(true)},
        pie: {icon: '🥧', label: 'Camembert', group: 'Parts', render: (s, W, fs) => pie(s, W, fs, 'pie'), grids: [ONE_SERIES], legend: 'right', options: [O.values, C('pieLabel', 'Sur les parts', 'select', {choices: [['', 'Pourcentage'], ['value', 'Valeur']]}), O.height], sample: () => sampleParts()},
        donut: {icon: '🍩', label: 'Anneau', group: 'Parts', render: (s, W, fs) => pie(s, W, fs, 'donut'), grids: [ONE_SERIES], legend: 'right', options: [O.values, O.hole, O.total, O.centerText, O.height], sample: () => sampleParts()},
        halfdonut: {icon: '🌗', label: 'Demi-anneau', group: 'Parts', render: (s, W, fs) => pie(s, W, fs, 'halfdonut'), grids: [ONE_SERIES], options: [O.values, O.hole, O.total, O.centerText, O.height], sample: () => sampleParts()},
        waffle: {icon: '🧇', label: 'Mosaïque (100 carrés)', group: 'Parts', render: waffle, grids: [ONE_SERIES], options: [C('cols', 'Carrés par ligne', 'range', {min: 2, max: 50, def: 10}), C('cellRows', 'Nombre de lignes', 'range', {min: 1, max: 50, def: 10})], sample: () => sampleParts()},
        treemap: {icon: '🟪', label: 'Carte proportionnelle (rectangles)', group: 'Parts', render: treemap, noLegend: true, grids: [ONE_SERIES], options: [O.height], sample: () => ({o: {title: 'Lieux de naissance'}, series: [{name: 'Naissances'}], rows: [['Rennes', 42], ['Nantes', 25], ['Vitré', 14], ['Fougères', 9], ['Redon', 7], ['Saint-Malo', 5], ['Paris', 3]].map(([label, s0]) => ({label, s0}))})},
        funnel: {icon: '🔻', label: 'Entonnoir', group: 'Parts', render: funnel, noLegend: true, grids: [ONE_SERIES], options: [], sample: () => ({o: {title: 'Où en sont mes recherches'}, series: [{name: 'Personnes'}], rows: [['Personnes trouvées', 820], ['Avec une date de naissance', 610], ['Avec un acte', 402], ['Acte vérifié', 255], ['Sourcées', 140]].map(([label, s0]) => ({label, s0}))})},
        radar: {icon: '🕸️', label: 'Radar (toile)', group: 'Chiffres', render: radar, grids: [TABLE_GRID], options: [C('max', 'Maximum de l’échelle (vide = auto)'), O.height], sample: () => ({o: {title: 'Complétude par branche'}, series: [{name: 'Paternelle'}, {name: 'Maternelle'}], rows: [['Naissances', 90, 70], ['Mariages', 80, 85], ['Décès', 60, 75], ['Recensements', 40, 55], ['Militaire', 30, 20], ['Photos', 50, 35]].map(([label, s0, s1]) => ({label, s0, s1}))})},
        pyramid: {icon: '🔺', label: 'Pyramide (des âges…)', group: 'Chiffres', render: pyramid, grids: [{...TABLE_GRID, series: 2}], options: [O.values, C('firstBottom', 'Première ligne en bas', 'check', {def: true})], sample: () => ({o: {title: 'Âge au décès'}, series: [{name: 'Hommes', color: '#4e79a7'}, {name: 'Femmes', color: '#e15759'}], rows: [['0-9', 31, 28], ['10-19', 6, 7], ['20-29', 9, 12], ['30-39', 10, 13], ['40-49', 11, 10], ['50-59', 13, 12], ['60-69', 15, 16], ['70-79', 12, 15], ['80+', 6, 9]].map(([label, s0, s1]) => ({label, s0, s1}))})},
        heatmap: {icon: '🟧', label: 'Carte de chaleur (tableau coloré)', group: 'Chiffres', render: heatmap, noLegend: true, grids: [TABLE_GRID], options: [O.values, C('lowColor', 'Couleur des petites valeurs', 'color', {def: '#eef3ff'}), C('highColor', 'Couleur des grandes valeurs', 'color', {def: '#1e4fd8'})],
            sample: () => ({o: {title: 'Naissances par mois et par siècle'}, series: ['XVIIe', 'XVIIIe', 'XIXe'].map(name => ({name})), rows: ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'].map((label, i) => ({label, s0: 3 + (i * 7) % 9, s1: 8 + (i * 5) % 11, s2: 12 + (i * 3) % 10}))})},
        scatter: {icon: '🫧', label: 'Nuage de points / bulles', group: 'Chiffres', render: scatter, noLegend: true, grids: [{key: 'rows', label: 'Les points', cols: [C('label', 'Nom'), C('x', 'X', 'number'), C('y', 'Y', 'number'), C('size', 'Taille (bulles)', 'number'), C('color', 'Couleur', 'color')]}],
            options: [O.values, O.height, C('xLabel', 'Nom de l’axe X'), C('yLabel', 'Nom de l’axe Y'), C('maxBubble', 'Taille de la plus grosse bulle', 'range', {min: 4, max: 120, def: 30}), C('oneColor', 'Une seule couleur', 'check')],
            sample: () => ({o: {title: 'Âge au mariage et nombre d’enfants', xLabel: 'Âge au mariage', yLabel: 'Enfants'}, rows: [['Jean', 24, 8, 3], ['Marie', 19, 11, 2], ['Pierre', 31, 4, 1], ['Anne', 22, 9, 4], ['Louis', 27, 6, 2], ['Rose', 35, 2, 1]].map(([label, x, y, size]) => ({label, x, y, size}))})},
        sankey: {icon: '🔀', label: 'Flux (Sankey) : migrations, métiers…', group: 'Liens', render: sankey, noLegend: true, grids: [{key: 'rows', label: 'Les flux', cols: [C('from', 'De'), C('to', 'Vers'), C('value', 'Combien', 'number'), C('color', 'Couleur', 'color')]}], options: [O.values, O.height],
            sample: () => ({o: {title: 'D’où venaient les conjoints'}, rows: [['Bretagne', 'Rennes', 30], ['Bretagne', 'Nantes', 12], ['Normandie', 'Rennes', 8], ['Normandie', 'Paris', 10], ['Anjou', 'Nantes', 9], ['Rennes', 'Paris', 6]].map(([from, to, value]) => ({from, to, value}))})},
        orgchart: {icon: '🧭', label: 'Organigramme / arbre', group: 'Liens', render: orgchart, noLegend: true, grids: [{key: 'rows', label: 'Les cases', cols: [C('name', 'Nom (unique)'), C('parent', 'Au-dessus (nom de la case)'), C('detail', 'Détail'), C('color', 'Couleur', 'color')]}],
            options: [C('direction', 'Sens', 'select', {choices: [['', 'De haut en bas'], ['right', 'De gauche à droite']]}), C('boxWidth', 'Largeur des cases (vide = auto)', 'number'), C('oneColor', 'Une seule couleur', 'check')],
            sample: () => ({o: {title: 'Association des Amis du village', oneColor: true}, rows: [['Présidente', '', 'Marie Durand'], ['Trésorier', 'Présidente', 'Paul Martin'], ['Secrétaire', 'Présidente', 'Anne Petit'], ['Archives', 'Secrétaire', '3 bénévoles'], ['Fêtes', 'Trésorier', '5 bénévoles']].map(([name, parent, detail]) => ({name, parent, detail}))})},
        venn: {icon: '⭕', label: 'Diagramme de Venn (2 ou 3 ensembles)', group: 'Liens', render: venn, noLegend: true,
            grids: [{key: 'sets', label: 'Les ensembles (2 ou 3)', max: 3, cols: [C('name', 'Nom'), C('color', 'Couleur', 'color')]}, {key: 'rows', label: 'Ce qu’on écrit dans chaque zone', fixed: ['A', 'B', 'C', 'AB', 'AC', 'BC', 'ABC'], cols: [C('region', 'Zone', 'readonly'), C('value', 'Texte ou nombre')]}],
            options: [O.height], sample: () => ({o: {title: 'Mes sources'}, sets: [{name: 'État civil'}, {name: 'Registres paroissiaux'}, {name: 'Notaires'}], rows: [['A', '120'], ['B', '85'], ['C', '30'], ['AB', '40'], ['AC', '12'], ['BC', '9'], ['ABC', '5']].map(([region, value]) => ({region, value}))})},
        wordcloud: {icon: '☁️', label: 'Nuage de mots', group: 'Liens', render: wordcloud, noLegend: true, grids: [{key: 'rows', label: 'Les mots', cols: [C('word', 'Mot'), C('weight', 'Poids', 'number'), C('color', 'Couleur', 'color')]}], options: [O.height, C('maxFont', 'Taille du plus gros mot', 'range', {min: 12, max: 140, def: 80})],
            sample: () => ({o: {title: 'Les noms de famille'}, rows: [['Martin', 40], ['Durand', 28], ['Petit', 22], ['Lefèvre', 18], ['Moreau', 15], ['Garnier', 12], ['Roux', 10], ['Fournier', 9], ['Girard', 8], ['Bonnet', 7], ['Lambert', 6], ['Fontaine', 5], ['Chevalier', 5], ['Robin', 4], ['Masson', 3]].map(([word, weight]) => ({word, weight}))})},
        gauge: {icon: '⏱️', label: 'Jauges (objectifs)', group: 'Parts', render: gauges, noLegend: true, grids: [{key: 'rows', label: 'Les jauges', cols: [C('label', 'Nom'), C('value', 'Valeur', 'number'), C('max', 'Maximum', 'number'), C('color', 'Couleur', 'color')]}], options: [],
            sample: () => ({o: {title: 'Mes objectifs'}, rows: [['Ancêtres trouvés (8 générations)', 180, 255], ['Actes numérisés', 320, 500], ['Photos légendées', 90, 120]].map(([label, value, max]) => ({label, value, max}))})},
        pictogram: {icon: '👤', label: 'Pictogrammes (symboles répétés)', group: 'Parts', render: pictogram, grids: [{key: 'rows', label: 'Les lignes', cols: [C('label', 'Nom'), C('value', 'Nombre', 'number'), C('icon', 'Symbole (👤 👶 ⚓ ✝…)'), C('color', 'Couleur', 'color')]}],
            options: [C('unit', 'Un symbole vaut', 'number', {def: 1}), C('iconSize', 'Taille des symboles', 'range', {min: 8, max: 60, def: 22})],
            sample: () => ({o: {title: 'Enfants par couple'}, rows: [['Jean et Marie', 11, '👶'], ['Pierre et Anne', 7, '👶'], ['Louis et Rose', 3, '👶']].map(([label, value, icon]) => ({label, value, icon}))})},
    };
    function sampleTable(time) {
        return time ? {o: {title: 'Baptêmes et sépultures'}, series: [{name: 'Baptêmes'}, {name: 'Sépultures'}], rows: [['1700', 32, 25], ['1710', 28, 41], ['1720', 35, 22], ['1730', 38, 27], ['1740', 30, 36], ['1750', 41, 24]].map(([label, s0, s1]) => ({label, s0, s1}))}
            : {o: {title: 'Métiers les plus fréquents'}, series: [{name: 'Personnes'}], rows: [['Laboureur', 64], ['Journalier', 41], ['Tisserand', 22], ['Meunier', 9], ['Charpentier', 7], ['Marchand', 6]].map(([label, s0]) => ({label, s0}))};
    }
    const sampleParts = () => ({o: {title: 'Femmes et hommes'}, series: [{name: 'Personnes'}], rows: [['Femmes', 512, '#e15759'], ['Hommes', 498, '#4e79a7'], ['Inconnu', 23, '#bab0ac']].map(([label, s0, color]) => ({label, s0, color}))});
    // réglages communs à tous
    const COMMON = [C('title', 'Titre'), C('subtitle', 'Sous-titre'), C('source', 'Source / note en bas'), C('titleAlign', 'Titre', 'select', {choices: [['', 'Centré'], ['left', 'À gauche']]}),
        C('legend', 'Légende', 'select', {choices: [['', 'Selon le type'], ['bottom', 'En bas'], ['right', 'À droite'], ['none', 'Aucune']]}), C('palette', 'Couleurs par défaut', 'select', {choices: [['', 'Vives'], ['pastel', 'Pastel'], ['terre', 'Terre'], ['mer', 'Mer'], ['sepia', 'Sépia (ancien)'], ['gris', 'Gris']]}),
        C('width', 'Largeur de l’image (px)', 'number', {min: 300, max: 4000, def: 900}), C('scale', 'Taille des textes', 'range', {min: .6, max: 2.5, step: .1, def: 1}),
        C('bg', 'Fond', 'select', {choices: [['', 'Blanc'], ['transparent', 'Transparent'], ['custom', 'Couleur…']]}), C('bgColor', 'Couleur du fond', 'color', {def: '#fdf8ee', when: s => s.o?.bg === 'custom'}), C('fg', 'Couleur des textes', 'color', {def: '#1d1d1f'})];

    function svg(spec, width) {
        const kind = KINDS[spec?.kind] || KINDS.columns, s = {...spec, o: {...(spec?.o || {})}};
        const W = clamp(num(width || s.o.width) || 900, 200, 4000);
        try { return compose(s, kind, W); } catch (e) { console.error(e); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 60" width="${W}" height="60"><text x="10" y="35" font-size="14" fill="#c00">Dessin impossible : ${esc(e.message)}</text></svg>`; }
    }
    ext.diagramRender = {svg, KINDS, COMMON, PALETTES, when, num, ticks, apportion, arcSeats, horseshoeSeats, squarify, color};
})();
