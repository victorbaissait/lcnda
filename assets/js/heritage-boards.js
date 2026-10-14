/**
 * 🧩 Tableaux (Enquêtes → Tableaux), façon Freeform : une toile sans bord où l'on pose ce qu'on veut —
 * formes, notes, textes, traits et flèches (qui suivent ce qu'ils relient), dessin à main levée (stylo, marqueur,
 * surligneur, crayon, gomme), images (fichier, glisser-déposer, coller, adresse web), sons, vidéos, PDF, GIF,
 * médias de l'app, fiches de personnes, écrans de l'app (une liste, un village, un diagramme… avec aperçu vivant),
 * widgets à soi, recueils, étiquettes, liens web, et des dossiers (un dossier est un sous-tableau).
 * Verrouiller, grouper / dégrouper, devant / derrière, dupliquer, copier-coller, annuler / rétablir, zoom, enregistrement tout seul.
 * Un tableau est libre ou rangé dans une enquête, une battue, un projet de l'Atelier (avec une « partie » : piste 1, piste 2…).
 * Serveur : lib/boards.php (structure n°36). Chargé après app.js et les autres heritage-*.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const uid = () => Math.random().toString(36).slice(2, 10);
    const clone = v => JSON.parse(JSON.stringify(v));
    const OWNERS = {'': 'Libre', investigation: 'Enquête', battue: 'Battue', atelier_project: 'Atelier'};
    const OWNER_ICONS = {'': '🧩', investigation: '🔍', battue: '🐾', atelier_project: '📚'};
    const COLORS = ['#111111', '#555555', '#d0021b', '#f5a623', '#f8e71c', '#7ed321', '#2a7de1', '#9013fe', '#ff6fb5', '#ffffff'];
    const NOTE_COLORS = ['#fff3a3', '#ffd6a5', '#caffbf', '#bde0fe', '#e4c1f9', '#ffc6d9', '#f1f1f1'];
    const SHAPES = [['rect', '▭ Rectangle'], ['round', '▢ Arrondi'], ['ellipse', '◯ Ovale'], ['triangle', '△ Triangle'], ['diamond', '◇ Losange'], ['star', '☆ Étoile'], ['hexagon', '⬡ Hexagone'], ['bubble', '💬 Bulle'], ['cloud', '☁ Nuage']];
    // Pinceaux (façon Freeform, et plus) : [clé, nom, icône, épaisseur proposée]
    const BRUSHES = [['pen', 'Stylo', '🖊', 3], ['mono', 'Monoligne', '✒︎', 3], ['marker', 'Marqueur', '🖍', 8], ['pencil', 'Crayon', '✏️', 2], ['pastel', 'Pastel', '🖍️', 12], ['fountain', 'Stylo-plume', '🖋', 5],
        ['calligraphy', 'Calame', '🪶', 10], ['brushstroke', 'Pinceau', '🖌', 12], ['watercolor', 'Aquarelle', '💧', 16], ['fill', 'Remplissage', '🪣', 3], ['highlight', 'Surligneur', '🟨', 18], ['chalk', 'Craie', '🧱', 10],
        ['neon', 'Néon', '💡', 5], ['spray', 'Aérographe', '💨', 10], ['dotted', 'Pointillé', '┈', 4]];
    const WIDTHS = [1, 3, 6, 12, 24];
    /* ═════════ Tableur : cellules et formules (=SOMME(B2:B5), =A1*2…) ═════════ */
    const colName = c => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
    const cellRef = s => { const m = /^([A-Z]{1,2})(\d{1,3})$/.exec(String(s).toUpperCase()); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [Number(m[2]) - 1, c - 1]; };
    const toNum = v => { if (typeof v === 'number') return v; const t = String(v ?? '').trim().replace(/\s/g, '').replace(/€$/, '').replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : null; };
    const FUNCS = {SOMME: a => a.reduce((s, x) => s + x, 0), MOYENNE: a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0, MIN: a => a.length ? Math.min(...a) : 0, MAX: a => a.length ? Math.max(...a) : 0, NB: a => a.length, PRODUIT: a => a.reduce((s, x) => s * x, 1), ARRONDI: a => Math.round((a[0] || 0) * 10 ** (a[1] || 0)) / 10 ** (a[1] || 0), ABS: a => Math.abs(a[0] || 0)};
    Object.assign(FUNCS, {SUM: FUNCS.SOMME, AVERAGE: FUNCS.MOYENNE, MOY: FUNCS.MOYENNE, COUNT: FUNCS.NB, PRODUCT: FUNCS.PRODUIT, ROUND: FUNCS.ARRONDI});
    /** Les valeurs affichées d'une grille : les formules sont calculées (sans eval), les erreurs montrent #ERREUR */
    function tableValues(cells) {
        const memo = new Map(), busy = new Set();
        const raw = (r, c) => cells[r]?.[c] ?? '';
        const val = (r, c) => {
            const k = r + ':' + c; if (memo.has(k)) return memo.get(k);
            const s = String(raw(r, c));
            if (!s.startsWith('=')) { const n = toNum(s); memo.set(k, n ?? s); return n ?? s; }
            if (busy.has(k)) throw new Error('boucle'); busy.add(k);
            let out; try { out = formula(s.slice(1)); } finally { busy.delete(k); }
            memo.set(k, out); return out;
        };
        function formula(src) {
            const toks = src.match(/\s*([A-Za-z]{1,2}\d{1,3}:[A-Za-z]{1,2}\d{1,3}|[A-Za-zÀ-ÿ]+(?=\s*\()|[A-Za-z]{1,2}\d{1,3}|\d+(?:[.,]\d+)?%?|[-+*/^();]|"[^"]*")/g)?.map(t => t.trim()) || [];
            if (toks.join('').replace(/\s/g, '') !== src.replace(/\s/g, '')) throw new Error('syntaxe');
            let i = 0;
            const peek = () => toks[i], next = () => toks[i++];
            const range = t => { const [a, b] = t.split(':').map(cellRef); const out = []; for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++) for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) { const v = toNum(val(r, c)); if (v !== null) out.push(v); } return out; };
            const num = v => { const n = toNum(v); if (n === null) throw new Error('nombre'); return n; };
            function prim() {
                const t = next(); if (t === undefined) throw new Error('fin');
                if (t === '(') { const v = expr(); if (next() !== ')') throw new Error(')'); return v; }
                if (t === '-') return -prim(); if (t === '+') return prim();
                if (/^\d/.test(t)) return t.endsWith('%') ? Number(t.slice(0, -1).replace(',', '.')) / 100 : Number(t.replace(',', '.'));
                if (t.startsWith('"')) return t.slice(1, -1);
                if (t.includes(':')) throw new Error('plage');
                if (FUNCS[t.toUpperCase()] && peek() === '(') {
                    next(); const args = [];
                    if (peek() !== ')') for (;;) { const p = peek(); if (p?.includes(':')) { next(); args.push(...range(p)); } else { const v = toNum(expr()); if (v !== null) args.push(v); } if (peek() === ';') { next(); continue; } break; }
                    if (next() !== ')') throw new Error(')'); return FUNCS[t.toUpperCase()](args);
                }
                const ref = cellRef(t); if (ref) { const v = val(ref[0], ref[1]); return v === '' ? 0 : v; }
                throw new Error('inconnu');
            }
            function pow() { let v = prim(); while (peek() === '^') { next(); v = num(v) ** num(prim()); } return v; }
            function term() { let v = pow(); while (peek() === '*' || peek() === '/') { const op = next(), w = num(pow()); v = op === '*' ? num(v) * w : num(v) / w; } return v; }
            function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(), w = num(term()); v = op === '+' ? num(v) + w : num(v) - w; } return v; }
            const v = expr(); if (i < toks.length) throw new Error('reste'); return v;
        }
        return cells.map((row, r) => row.map((_, c) => { try { const v = val(r, c); return typeof v === 'number' ? (Number.isFinite(v) ? v : '#DIV/0') : v; } catch (_) { return '#ERREUR'; } }));
    }
    const showVal = v => typeof v === 'number' ? v.toLocaleString('fr-FR', {maximumFractionDigits: 6, useGrouping: Math.abs(v) >= 10000}) : String(v ?? ''); // 1905 reste 1905 (une année)
    /** Le contour d'un trait à largeur variable (stylo-plume, calame, pinceau) */
    function ribbon(pts, sw, kind) {
        if (pts.length < 2) return '';
        const n = pts.length, ws = [];
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
            let w = sw;
            if (kind === 'fountain') w = sw * Math.max(.35, Math.min(1.5, 1.5 - d / (sw * 6)));
            if (kind === 'calligraphy') w = sw * (.18 + .82 * Math.abs(Math.sin(Math.atan2(dy, dx) - Math.PI / 4)));
            if (kind === 'brushstroke') { const t = i / (n - 1); w = sw * Math.max(.15, Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), .6)) * Math.max(.6, Math.min(1.2, 1.2 - d / (sw * 8))); }
            ws.push(w);
        }
        for (let k = 0; k < 2; k++) for (let i = 1; i < n - 1; i++) ws[i] = (ws[i - 1] + ws[i] * 2 + ws[i + 1]) / 4; // adoucir
        const L = [], R = [];
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, h = ws[i] / 2;
            L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]); R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
        }
        return smooth(L) + ' L' + smooth(R.reverse()).slice(1) + ' Z';
    }
    const seeded = seed => { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) % 2147483647; s = s || 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
    /** Le dessin d'un trait à main levée, selon son pinceau */
    function drawSvg(it) {
        const pts = it.points || [], c = it.color || '#111', sw = it.sw || 3, b = it.brush || 'pen';
        const stroke = (d, extra = '', cap = 'round') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="${cap}" stroke-linejoin="round" ${extra}/>`;
        switch (b) {
            case 'mono': return stroke('M' + pts.map(p => p.join(',')).join(' L') + (pts.length === 1 ? ' l0.1,0' : ''));
            case 'marker': return stroke(smooth(pts), 'style="opacity:.9"', 'square');
            case 'pencil': return stroke(smooth(pts), 'filter="url(#bd-f-grain)" style="opacity:.85"');
            case 'pastel': return stroke(smooth(pts), 'filter="url(#bd-f-pastel)" style="opacity:.95"');
            case 'chalk': return stroke(smooth(pts), 'filter="url(#bd-f-chalk)"');
            case 'watercolor': return stroke(smooth(pts), 'filter="url(#bd-f-water)" style="opacity:.55;mix-blend-mode:multiply"');
            case 'highlight': return stroke(smooth(pts), 'style="opacity:.38;mix-blend-mode:multiply"', 'butt');
            case 'neon': return `<path d="${smooth(pts)}" fill="none" stroke="${c}" stroke-width="${sw * 1.6}" stroke-linecap="round" stroke-linejoin="round" filter="url(#bd-f-glow)"/><path d="${smooth(pts)}" fill="none" stroke="#fff" stroke-width="${Math.max(1, sw * .35)}" stroke-linecap="round" stroke-linejoin="round" style="opacity:.85"/>`;
            case 'dotted': return stroke(smooth(pts), `stroke-dasharray="0.1 ${sw * 2.2}"`);
            case 'fill': return `<path d="${smooth(pts)} Z" fill="${c}" stroke="${c}" stroke-width="${Math.min(sw, 3)}" stroke-linejoin="round" style="opacity:.9"/>`;
            case 'fountain': case 'calligraphy': case 'brushstroke': return pts.length < 2 ? `<circle cx="${pts[0]?.[0] || 0}" cy="${pts[0]?.[1] || 0}" r="${sw / 2}" fill="${c}"/>` : `<path d="${ribbon(pts, sw, b)}" fill="${c}"/>`;
            case 'spray': { const rnd = seeded(it.id), out = []; let budget = 3500; for (let i = 0; i < pts.length && budget > 0; i++) { const k = Math.min(14, budget); for (let j = 0; j < k; j++) { const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), .7) * sw * 1.6; out.push(`<circle cx="${(pts[i][0] + Math.cos(a) * r).toFixed(1)}" cy="${(pts[i][1] + Math.sin(a) * r).toFixed(1)}" r="${(.4 + rnd() * .7).toFixed(2)}"/>`); } budget -= k; } return `<g fill="${c}">${out.join('')}</g>`; }
            default: return stroke(smooth(pts));
        }
    }
    const BOARD_FILTERS = `<svg class="h-board-defs" width="0" height="0" aria-hidden="true"><defs>
        <filter id="bd-f-grain" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.25" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
        <filter id="bd-f-pastel" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.35" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>
        <filter id="bd-f-chalk" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 1.6" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
        <filter id="bd-f-water" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6" result="d"/><feGaussianBlur in="d" stdDeviation="1.6"/></filter>
        <filter id="bd-f-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs></svg>`;

    /* ═════════ Pointes des traits : forme et taille de chaque bout ═════════ */
    const headOf = (l, side) => { const v = side === 'start' ? l.headStart : l.headEnd; if (v) return v; return (side === 'start' ? l.arrowStart : l.arrowEnd) ? 'triangle' : 'none'; };
    const headSize = l => Math.max(10, (l.sw || 2) * 3);
    const HEAD_REF = {triangle: 8, open: 8, stealth: 8, double: 8, half: 8, circle: 5, ring: 5, dot: 5, square: 5, square_o: 5, diamond: 5, diamond_o: 5, bar: 5, fork: 9, tail: 3};
    const HEAD_SVG = {
        triangle: c => `<path d="M0,0 L10,5 L0,10 z" fill="${c}"/>`,
        open: c => `<path d="M1,1 L9,5 L1,9" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
        circle: c => `<circle cx="5" cy="5" r="4.2" fill="${c}"/>`,
        square: c => `<rect x="1" y="1" width="8" height="8" fill="${c}"/>`,
        diamond: c => `<path d="M0,5 L5,0 L10,5 L5,10 z" fill="${c}"/>`,
        bar: c => `<rect x="4" y="0" width="2" height="10" fill="${c}"/>`,
        stealth: c => `<path d="M0,0 L10,5 L0,10 L3,5 z" fill="${c}"/>`,
        double: c => `<path d="M0,0 L5,5 L0,10 z M5,0 L10,5 L5,10 z" fill="${c}"/>`,
        half: c => `<path d="M0,0 L10,5 L0,5 z" fill="${c}"/>`,
        ring: c => `<circle cx="5" cy="5" r="3.6" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
        dot: c => `<circle cx="5" cy="5" r="2.4" fill="${c}"/>`,
        square_o: c => `<rect x="1.6" y="1.6" width="6.8" height="6.8" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
        diamond_o: c => `<path d="M1,5 L5,1 L9,5 L5,9 z" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
        fork: c => `<path d="M10,5 L1,0 M10,5 L1,5 M10,5 L1,10" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
        tail: c => `<path d="M0,0 L4,5 L0,10 M3,0 L7,5 L3,10" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
    };
    const HEADS_LIST = [['none', 'aucune'], ['triangle', '▶ triangle'], ['stealth', '➤ flèche fine'], ['open', '› ouverte'], ['double', '⏩ double'], ['half', '◣ demi-flèche'], ['circle', '● rond'], ['ring', '○ rond vide'], ['dot', '• point'],
        ['square', '■ carré'], ['square_o', '□ carré vide'], ['diamond', '◆ losange'], ['diamond_o', '◇ losange vide'], ['bar', '| barre'], ['fork', '⋔ patte d’oie'], ['tail', '» plumes']];
    const LINE_PATHS = [['straight', '— droit'], ['curve', '⌒ courbe'], ['elbow', '⌐ coudé'], ['wave', '∿ vague'], ['zigzag', '⩘ zigzag']];
    const LINE_DASHES = [['', '──── plein'], ['dash', '- - - tirets'], ['long', '— — — longs tirets'], ['dot', '· · · points'], ['dashdot', '-·-· tiret-point']];
    const dashArray = (dash, sw) => ({dash: `${3 * sw + 4} ${2 * sw + 4}`, long: `${7 * sw + 10} ${3 * sw + 5}`, dot: `0.1 ${2 * sw + 4}`, dashdot: `${4 * sw + 6} ${2 * sw + 4} 0.1 ${2 * sw + 4}`}[dash] || '');
    /** Le chemin d'un trait de P à Q, selon sa forme (droit, courbe, coudé, vague, zigzag) */
    function linePath(kind, P, Q, sw) {
        const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy) || 1;
        if (kind === 'curve') return `M${P.join(',')} Q${(P[0] + Q[0]) / 2 + dy * .25},${(P[1] + Q[1]) / 2 - dx * .25} ${Q.join(',')}`;
        if (kind === 'elbow') return Math.abs(dx) >= Math.abs(dy) ? `M${P.join(',')} H${P[0] + dx / 2} V${Q[1]} H${Q[0]}` : `M${P.join(',')} V${P[1] + dy / 2} H${Q[0]} V${Q[1]}`;
        if (kind === 'wave' || kind === 'zigzag') {
            const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, step = Math.max(14, sw * 5), amp = Math.max(5, sw * 2), n = Math.max(2, Math.round(len / step));
            let d = `M${P.join(',')}`;
            for (let i = 1; i <= n; i++) {
                const t = i / n, x = P[0] + dx * t, y = P[1] + dy * t;
                if (i === n) { d += ` L${Q.join(',')}`; break; }
                const s = (i % 2 ? 1 : -1) * amp;
                if (kind === 'zigzag') d += ` L${x + nx * s},${y + ny * s}`;
                else { const tm = (i - .5) / n; d += ` Q${P[0] + dx * tm + nx * s * 1.4},${P[1] + dy * tm + ny * s * 1.4} ${x},${y}`; }
            }
            return d;
        }
        return `M${P.join(',')} L${Q.join(',')}`;
    }

    /* ═════════ Dessin d'un élément ═════════ */
    const shapePath = (s, w, h) => {
        const pts = arr => 'M' + arr.map(p => p.join(',')).join(' L') + ' Z';
        switch (s) {
            case 'ellipse': return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
            case 'triangle': return `<path d="${pts([[w / 2, 0], [w, h], [0, h]])}"/>`;
            case 'diamond': return `<path d="${pts([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])}"/>`;
            case 'hexagon': return `<path d="${pts([[w * .25, 0], [w * .75, 0], [w, h / 2], [w * .75, h], [w * .25, h], [0, h / 2]])}"/>`;
            case 'star': { const a = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? .4 : .5, t = -Math.PI / 2 + i * Math.PI / 5; a.push([w / 2 + Math.cos(t) * w * r, h / 2 + Math.sin(t) * h * r]); } return `<path d="${pts(a)}"/>`; }
            case 'bubble': return `<path d="M${w * .08},0 H${w * .92} Q${w},0 ${w},${h * .1} V${h * .7} Q${w},${h * .8} ${w * .92},${h * .8} H${w * .35} L${w * .18},${h} L${w * .22},${h * .8} H${w * .08} Q0,${h * .8} 0,${h * .7} V${h * .1} Q0,0 ${w * .08},0 Z"/>`;
            case 'cloud': return `<path d="M${w * .25},${h * .85} C${w * .02},${h * .85} 0,${h * .5} ${w * .2},${h * .45} C${w * .15},${h * .15} ${w * .5},${h * .05} ${w * .55},${h * .3} C${w * .65},${h * .1} ${w * .95},${h * .2} ${w * .85},${h * .5} C${w},${h * .55} ${w},${h * .85} ${w * .78},${h * .85} Z"/>`;
            case 'round': return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * .18}"/>`;
            default: return `<rect x="0" y="0" width="${w}" height="${h}"/>`;
        }
    };
    const smooth = pts => {
        if (!pts.length) return '';
        if (pts.length < 3) return 'M' + pts.map(p => p.join(',')).join(' L') + (pts.length === 1 ? ` l0.1,0` : '');
        let d = `M${pts[0][0]},${pts[0][1]}`;
        for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${pts[i][0]},${pts[i][1]} ${mx},${my}`; }
        const l = pts[pts.length - 1]; return d + ` L${l[0]},${l[1]}`;
    };
    const mediaUrl = m => m ? `media/${encodeURIComponent(m.filename)}` : '';
    const kindOfMedia = m => { const t = String(m?.media_type || ''), f = String(m?.filename || '').toLowerCase(); if (/^(audio|video|pdf)$/.test(t)) return t; if (/\.(mp3|m4a|wav|ogg|flac|aiff?)$/.test(f)) return 'audio'; if (/\.(mp4|mov|webm|m4v)$/.test(f)) return 'video'; if (/\.pdf$/.test(f)) return 'pdf'; return 'image'; };
    const personCache = new Map();
    async function personBrief(id) {
        if (personCache.has(id)) return personCache.get(id);
        const p = api('person', {id}).then(d => ({id, name: A().personName(d.person), years: A().years ? A().years(d.person) : '', portrait: d.person?.portrait || d.portrait?.filename || '', gender: d.person?.gender})).catch(() => ({id, name: 'Fiche #' + id, years: ''}));
        personCache.set(id, p); return p;
    }

    /* ═════════ L'éditeur ═════════ */
    async function openBoard(id, host) {
        let b; try { b = await api('board', {id}); } catch (error) { toast(error.message, 'error'); return; }
        const media = b.media || {};
        let items = (b.data?.items || []).map(it => ({...it}));
        const view = {x: 40, y: 40, k: 1, ...(b.data?.view || {})};
        let bg = b.data?.bg || 'dots', boardLocked = !!b.data?.locked;
        // tableau verrouillé : on regarde, on se déplace, on ouvre ; on ne change rien
        const ro = () => { if (!boardLocked) return false; toast('Tableau verrouillé : 🔒 en haut pour le déverrouiller.'); return true; };
        let tool = 'select', shapeKind = 'rect', brush = 'pen', penColor = '#111111', penWidth = 3, noteColor = NOTE_COLORS[0], eraserMode = 'pixel', eraserSize = 16;
        let links = Array.isArray(b.data?.links) ? b.data.links.map(l => ({...l})) : [], cellSel = null;
        let sel = new Set(), clipboard = null, editing = null, history = [], hpos = -1, dirty = false, saveT = 0, thumbT = 0;
        host.innerHTML = `<section class="h-board" tabindex="-1">
            <header class="h-board-head">
                <div class="h-board-title">${b.path?.length ? `<nav class="h-board-path"><button type="button" class="link-button" data-bd-open="${b.path[0].id}">${esc(b.path[0].title)}</button>${b.path.slice(1).map(p => ` › <button type="button" class="link-button" data-bd-open="${p.id}">${esc(p.title)}</button>`).join('')} › </nav>` : ''}
                    <input class="h-board-name" value="${esc(b.title)}" data-bd-title aria-label="Titre du tableau">
                    <span class="h-board-owner">${OWNER_ICONS[b.owner_type] || '🧩'} ${esc(b.owner_type ? `${OWNERS[b.owner_type]} : ${b.owner_label || '?'}` : 'Tableau libre')}${b.part ? ` · ${esc(b.part)}` : ''} <button type="button" class="link-button" data-bd-place>changer</button></span>
                    <span class="h-board-links" data-bd-links></span>
                    <select class="h-board-state" data-bd-state title="État du tableau">${Object.entries({open: '● En cours', paused: '⏸ En pause', closed: '✓ Terminé'}).map(([k, l]) => `<option value="${k}" ${(b.status || 'open') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                <span class="h-board-status" data-bd-status>Enregistré</span>
                <span class="h-board-headtools"><button type="button" class="button small secondary" data-bd-undo title="Annuler (⌘Z)">↶</button><button type="button" class="button small secondary" data-bd-redo title="Rétablir (⇧⌘Z)">↷</button>
                    <select data-bd-bg title="Fond">${[['dots', 'Fond à points'], ['grid', 'Quadrillé'], ['lines', 'Lignes'], ['plain', 'Uni'], ['paper', 'Papier'], ['cork', 'Liège'], ['dark', 'Sombre']].map(([k, l]) => `<option value="${k}" ${bg === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    <button type="button" class="button small secondary" data-bd-snaps title="Instantanés : figer l’état du tableau, y revenir, en faire un nouveau tableau">📸 Instantanés</button><button type="button" class="button small secondary" data-bd-copy title="Créer un nouveau tableau à partir de celui-ci">⧉ Copie</button><button type="button" class="button small secondary" data-bd-png title="Image du tableau">🖼 PNG</button><button type="button" class="button small secondary" data-bd-full title="Plein écran">⛶</button><button type="button" class="button small secondary" data-bd-lockall title="Verrouiller ou déverrouiller tout le tableau">🔓</button><button type="button" class="button small secondary danger" data-bd-delete title="Supprimer ce tableau (et ses dossiers)">🗑</button><button type="button" class="button small secondary" data-bd-close title="Revenir aux tableaux">✕</button></span>
            </header>
            <div class="h-board-toolbar" role="toolbar">
                ${[['select', '↖', 'Choisir, déplacer (V)'], ['hand', '✋', 'Se déplacer (H ou espace)'], ['text', 'T', 'Texte (T)'], ['note', '🗒', 'Note (N)'], ['shape', '⬠', 'Forme (S)'], ['line', '╱', 'Trait (L)'], ['arrow', '➝', 'Flèche (A)'], ['pen', '✍︎', 'Dessin à main levée (P)'], ['eraser', '⌫', 'Gomme à dessins (E)'], ['table', '▦', 'Tableur (G)']].map(([k, i, l]) => `<button type="button" class="h-bt" data-bd-tool="${k}" title="${esc(l)}"><span>${i}</span></button>`).join('')}
                <span class="h-bt-sep"></span>
                <button type="button" class="h-bt h-bt-add" data-bd-add title="Ajouter un fichier, un média, une fiche, un écran de l’app…"><span>＋</span> Ajouter</button>
                <span class="h-bt-sep"></span>
                <span class="h-bt-opts" data-bd-opts></span>
                <span class="spacer"></span>
                <span class="h-bt-zoom"><button type="button" class="h-bt" data-bd-zoom="-1" title="Dézoomer">−</button><output data-bd-zoomout>100 %</output><button type="button" class="h-bt" data-bd-zoom="1" title="Zoomer">+</button><button type="button" class="h-bt" data-bd-fit title="Tout voir">⤢</button><button type="button" class="h-bt" data-bd-groups title="Montrer ce qui est groupé">⧉</button></span>
            </div>
            <div class="h-board-main">
                <div class="h-board-stage" data-bd-stage data-bg="${bg}">${BOARD_FILTERS}<div class="h-board-world" data-bd-world></div><div class="h-board-marquee" data-bd-marquee hidden></div>
                    <div class="h-board-drop" data-bd-drop hidden>Lâche ici : images, sons, vidéos, PDF…</div>
                    ${items.length ? '' : '<div class="h-board-empty" data-bd-empty><strong>Un tableau vide.</strong><span>Choisis un outil en haut, ou glisse ici des photos, des sons, des PDF… « ＋ Ajouter » pose une fiche, un écran de l’app, un widget, un recueil, une étiquette ou un dossier. Double-clic pour écrire.</span></div>'}</div>
                <aside class="h-board-inspector" data-bd-inspector></aside>
            </div>
        </section>`;
        const root = host.querySelector('.h-board'), stage = root.querySelector('[data-bd-stage]'), world = root.querySelector('[data-bd-world]'), inspector = root.querySelector('[data-bd-inspector]');
        const status = t => { root.querySelector('[data-bd-status]').textContent = t; };
        const byId = id0 => items.find(i => i.id === id0);
        const topZ = () => items.reduce((m, i) => Math.max(m, i.z || 0), 0);
        const groupOf = it => it.group ? items.filter(x => x.group === it.group) : [it];
        // ── coordonnées ──
        const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k]; };
        const applyView = () => { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; stage.style.setProperty('--bk', view.k); stage.style.backgroundPosition = `${view.x}px ${view.y}px`; stage.style.backgroundSize = `${24 * view.k}px ${24 * view.k}px`; root.querySelector('[data-bd-zoomout]').textContent = Math.round(view.k * 100) + ' %'; };
        const zoomAt = (k, cx, cy) => { const r = stage.getBoundingClientRect(); cx ??= r.left + r.width / 2; cy ??= r.top + r.height / 2; const [wx, wy] = toWorld(cx, cy); view.k = Math.max(0.1, Math.min(6, k)); view.x = cx - r.left - wx * view.k; view.y = cy - r.top - wy * view.k; applyView(); queueSave(false); };
        const bbox = list => { if (!list.length) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const i of list) { x0 = Math.min(x0, i.x); y0 = Math.min(y0, i.y); x1 = Math.max(x1, i.x + i.w); y1 = Math.max(y1, i.y + i.h); } return {x: x0, y: y0, w: x1 - x0, h: y1 - y0}; };
        const fitAll = () => { const bb = bbox(items); const r = stage.getBoundingClientRect(); if (!bb) { view.x = 40; view.y = 40; view.k = 1; return applyView(); } const k = Math.max(0.1, Math.min(2, Math.min((r.width - 80) / bb.w, (r.height - 80) / bb.h))); view.k = k; view.x = (r.width - bb.w * k) / 2 - bb.x * k; view.y = (r.height - bb.h * k) / 2 - bb.y * k; applyView(); };
        // ── traits et flèches : bouts accrochés aux éléments ──
        const centerOf = it => [it.x + it.w / 2, it.y + it.h / 2];
        const edgePoint = (it, toward) => { const [cx, cy] = centerOf(it), dx = toward[0] - cx, dy = toward[1] - cy; if (!dx && !dy) return [cx, cy]; const sx = Math.abs(dx) / (it.w / 2 + 6), sy = Math.abs(dy) / (it.h / 2 + 6), s = Math.max(sx, sy); return [cx + dx / s, cy + dy / s]; };
        const lineEnds = l => {
            let [p, q] = [l.points?.[0] || [l.x, l.y], l.points?.[l.points.length - 1] || [l.x + l.w, l.y + l.h]];
            const f = l.from && byId(l.from), t = l.to && byId(l.to);
            if (f) p = edgePoint(f, t ? centerOf(t) : q); if (t) q = edgePoint(t, f ? centerOf(f) : p);
            return [p, q];
        };
        const fixLine = l => { const [p, q] = lineEnds(l); l.points = [p, q]; l.x = Math.min(p[0], q[0]); l.y = Math.min(p[1], q[1]); l.w = Math.max(4, Math.abs(q[0] - p[0])); l.h = Math.max(4, Math.abs(q[1] - p[1])); };
        // ── rendu ──
        const els = new Map(), sigs = new Map();
        const contentSig = it => { const {x, y, z, w, h, locked, ...rest} = it; return it.type === 'line' ? JSON.stringify(it) : JSON.stringify(rest) + (['shape', 'media', 'webimage'].includes(it.type) ? '' : ''); };
        function itemInner(it) {
            const txt = v => esc(v || '').replace(/\n/g, '<br>');
            const textStyle = `font-size:${it.fs || 18}px;color:${it.color || '#111'};font-weight:${it.bold ? 700 : 400};font-style:${it.italic ? 'italic' : 'normal'};text-align:${it.align || 'left'};font-family:${it.font || 'inherit'}`;
            switch (it.type) {
                case 'shape': return `<svg class="h-bi-svg" viewBox="0 0 ${it.w} ${it.h}" preserveAspectRatio="none" style="overflow:visible"><g fill="${it.fill || '#bde0fe'}" stroke="${it.stroke || '#1d3557'}" stroke-width="${it.sw ?? 2}" ${it.dash ? `stroke-dasharray="${dashArray(it.dash, it.sw ?? 2)}" stroke-linecap="round"` : ''} vector-effect="non-scaling-stroke" style="opacity:${it.opacity ?? 1}">${shapePath(it.shape, it.w, it.h)}</g></svg><div class="h-bi-text is-center" data-bd-text style="${textStyle};text-align:${it.align || 'center'}">${txt(it.text)}</div>`;
                case 'note': return `<div class="h-bi-note" style="background:${it.fill || NOTE_COLORS[0]}"><div class="h-bi-text" data-bd-text style="${textStyle}">${txt(it.text)}</div></div>`;
                case 'text': return `<div class="h-bi-text" data-bd-text style="${textStyle}">${txt(it.text) || '<span class="muted">Texte</span>'}</div>`;
                case 'draw': return `<svg class="h-bi-svg" viewBox="0 0 ${it.vw || it.w} ${it.vh || it.h}" preserveAspectRatio="none" style="overflow:visible">${drawSvg(it)}</svg>`;
                case 'table': {
                    const cells = it.cells?.length ? it.cells : [['']], vals = tableValues(cells), ncol = Math.max(...cells.map(r => r.length)), cw = Array.from({length: ncol}, (_, c) => it.colw?.[c] || 100), tot = cw.reduce((s, x) => s + x, 0);
                    return `<div class="h-bi-table${it.stripes ? ' is-striped' : ''}" style="font-size:${it.fs || 14}px;color:${it.color || '#111'};font-family:${it.font || 'inherit'};--hf:${it.hfill || '#e8eef7'}"><table><colgroup>${cw.map(w => `<col style="width:${(w / tot * 100).toFixed(2)}%">`).join('')}</colgroup><tbody>${cells.map((row, r) => `<tr style="height:${(100 / cells.length).toFixed(3)}%">${Array.from({length: ncol}, (_, c) => { const v = vals[r][c], isHead = (it.header && r === 0) || (it.hcol && c === 0), raw = String(row[c] ?? ''), shown = raw.startsWith('=') ? showVal(v) : raw; return `<td data-r="${r}" data-c="${c}" class="${isHead ? 'is-head' : ''}${typeof v === 'number' ? ' is-num' : ''}${raw.startsWith('=') ? ' is-formula' : ''}${String(v).startsWith('#') && raw.startsWith('=') ? ' is-err' : ''}"${it.cfill?.[r + ':' + c] ? ` style="background:${it.cfill[r + ':' + c]}"` : ''}>${esc(shown)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
                }
                case 'line': {
                    const [p, q] = lineEnds(it), pad = 30, x0 = Math.min(p[0], q[0]) - pad, y0 = Math.min(p[1], q[1]) - pad;
                    const P = [p[0] - x0, p[1] - y0], Q = [q[0] - x0, q[1] - y0], w = Math.abs(q[0] - p[0]) + pad * 2, h = Math.abs(q[1] - p[1]) + pad * 2;
                    const dPath = linePath(it.path || (it.curved ? 'curve' : 'straight'), P, Q, it.sw || 2), da = dashArray(it.dash, it.sw || 2);
                    const mk = `bdm-${it.id}`, hs = it.hs || headSize(it), c = it.color || '#111', hS = headOf(it, 'start'), hE = headOf(it, 'end');
                    const marker = (id0, shape) => shape === 'none' ? '' : `<marker id="${id0}" viewBox="0 0 10 10" refX="${HEAD_REF[shape]}" refY="5" markerWidth="${hs}" markerHeight="${hs}" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible">${HEAD_SVG[shape](c)}</marker>`;
                    return `<svg class="h-bi-line" style="left:${x0 - it.x}px;top:${y0 - it.y}px;width:${w}px;height:${h}px" viewBox="0 0 ${w} ${h}"><defs>${marker(mk + 's', hS)}${marker(mk + 'e', hE)}</defs>
                        <path class="h-bi-hit" d="${dPath}"/><path d="${dPath}" fill="none" stroke="${it.color || '#111'}" stroke-width="${it.sw || 2}" stroke-linecap="round" stroke-linejoin="round" ${da ? `stroke-dasharray="${da}"` : ''} ${hE !== 'none' ? `marker-end="url(#${mk}e)"` : ''} ${hS !== 'none' ? `marker-start="url(#${mk}s)"` : ''}/></svg>${it.text ? `<div class="h-bi-linelabel" style="left:${(p[0] + q[0]) / 2 - it.x}px;top:${(p[1] + q[1]) / 2 - it.y}px">${esc(it.text)}</div>` : ''}`;
                }
                case 'media': {
                    const m = media[it.media_id]; if (!m) return '<div class="h-bi-card">Média introuvable</div>';
                    const k = kindOfMedia(m), title = esc(m.title || m.filename);
                    if (k === 'image') return `<img class="h-bi-img" src="${esc(mediaUrl(m))}" alt="" draggable="false" loading="lazy">${it.text ? `<div class="h-bi-caption">${esc(it.text)}</div>` : ''}`;
                    if (k === 'video') return `<video class="h-bi-img" src="${esc(mediaUrl(m))}" controls preload="metadata"></video>`;
                    if (k === 'audio') return `<div class="h-bi-card h-bi-audio"><strong>🎧 ${title}</strong><audio src="${esc(mediaUrl(m))}" controls preload="none"></audio></div>`;
                    return it.preview ? `<iframe class="h-bi-frame" src="${esc(mediaUrl(m))}" title="${title}"></iframe>` : `<div class="h-bi-card h-bi-pdf"><span class="h-bi-big">📄</span><strong>${title}</strong><small>PDF · double-clic pour l’ouvrir</small></div>`;
                }
                case 'webimage': return `<img class="h-bi-img" src="${esc(it.url)}" alt="" draggable="false" referrerpolicy="no-referrer" loading="lazy">`;
                case 'weblink': { let host0 = ''; try { host0 = new URL(it.url).hostname; } catch (_) {} return `<div class="h-bi-card h-bi-web"><span class="h-bi-big">🌐</span><strong>${esc(it.title || host0 || it.url)}</strong><small>${esc(host0)}</small></div>`; }
                case 'tag': return `<span class="h-bi-tag" style="background:${it.fill || '#0066cc'};color:${it.color || '#fff'}">🏷 ${esc(it.text || 'étiquette')}</span>`;
                case 'folder': return `<div class="h-bi-card h-bi-folder" style="--fc:${it.fill || '#f5c542'}"><span class="h-bi-big">📁</span><strong>${esc(it.title || 'Dossier')}</strong><small>double-clic pour ouvrir</small></div>`;
                case 'recueil': return `<div class="h-bi-card h-bi-recueil"><span class="h-bi-big">📚</span><strong>${esc(it.title || 'Recueil')}</strong><small>Recueil · double-clic pour l’ouvrir</small></div>`;
                case 'person': return `<div class="h-bi-card h-bi-person" data-bd-person="${Number(it.person_id)}"><span class="h-bi-avatar">👤</span><strong>${esc(it.title || 'Fiche')}</strong><small></small></div>`;
                case 'widget': return `<div class="h-bi-widget" data-bd-widget="${esc(it.target)}"><p class="muted">Widget…</p></div>`;
                case 'link': case 'screen': {
                    const sc = ext.appScreen, label = it.title || sc?.label(it.target) || it.target;
                    if (it.preview && sc?.valid(it.target)) return `<div class="h-bi-screen"><header>📺 ${esc(label)}<button type="button" data-bd-openlink title="Ouvrir en grand">↗</button></header><iframe src="${esc(sc.url({target: it.target, sidebar: false, layout: it.layout}))}" title="${esc(label)}" loading="lazy"></iframe></div>`;
                    return `<div class="h-bi-card h-bi-link"><span class="h-bi-big">📺</span><strong>${esc(label)}</strong><small>Écran de l’app · double-clic pour l’ouvrir</small></div>`;
                }
            }
            return '';
        }
        function render(keepInspector = false) {
            items.forEach(it => { if (it.type === 'line') fixLine(it); });
            const seen = new Set();
            [...items].sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((it, i) => {
                seen.add(it.id);
                let el = els.get(it.id);
                if (!el) { el = document.createElement('div'); el.className = 'h-bi'; el.dataset.bi = it.id; world.appendChild(el); els.set(it.id, el); }
                const sig = contentSig(it);
                if (sigs.get(it.id) !== sig) { el.innerHTML = itemInner(it); sigs.set(it.id, sig); hydrate(el, it); }
                el.className = `h-bi is-type-${it.type}${sel.has(it.id) ? ' is-sel' : ''}${it.locked ? ' is-locked' : ''}${it.group ? ' is-grouped' : ''}`;
                Object.assign(el.style, {left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px', zIndex: String(10 + i), transform: it.rot ? `rotate(${it.rot}deg)` : '', opacity: it.opacity !== undefined && it.opacity < 1 ? String(it.opacity) : ''});
                el.querySelectorAll('td.is-cell').forEach(td => td.classList.remove('is-cell'));
                if (cellSel?.id === it.id && sel.has(it.id)) el.querySelector(`td[data-r="${cellSel.r}"][data-c="${cellSel.c}"]`)?.classList.add('is-cell');
            });
            for (const [k, el] of els) if (!seen.has(k)) { el.remove(); els.delete(k); sigs.delete(k); }
            drawGroups();
            drawSelection(keepInspector);
            root.querySelector('[data-bd-empty]')?.toggleAttribute('hidden', items.length > 0);
        }
        function hydrate(el, it) {
            if (it.type === 'person') personBrief(it.person_id).then(p => { const c = el.querySelector('.h-bi-person'); if (!c) return; c.querySelector('strong').textContent = it.title || p.name; c.querySelector('small').textContent = p.years || ''; if (p.portrait) c.querySelector('.h-bi-avatar').innerHTML = `<img src="media/${encodeURIComponent(p.portrait)}" alt="">`; c.classList.add('gender-' + (p.gender || 'unknown')); });
            if (it.type === 'widget' && ext.renderCustomWidgetInto) { const box = el.querySelector('[data-bd-widget]'); ext.renderCustomWidgetInto(box, it.target).catch?.(() => { box.innerHTML = '<p class="muted">Widget introuvable.</p>'; }); }
        }
        // cadre de sélection et poignées
        const selLayer = document.createElement('div'); selLayer.className = 'h-board-sel'; world.appendChild(selLayer);
        // ce qui est groupé : un cadre pointillé et une pastille « Groupe n » (clic : choisir le groupe)
        const grpLayer = document.createElement('div'); grpLayer.className = 'h-board-groups'; world.prepend(grpLayer);
        let showGroups = (() => { try { return localStorage.getItem('genealogie-board-groups') !== '0'; } catch (_) { return true; } })();
        const GROUP_COLORS = ['#7b2cbf', '#0a9396', '#e85d04', '#2b8a3e', '#c9184a', '#1d4ed8'];
        const groupNames = () => { const order = []; items.forEach(i => { if (i.group && !order.includes(i.group)) order.push(i.group); }); return order; };
        function drawGroups() {
            const names = groupNames().filter(g => items.filter(i => i.group === g).length > 1);
            grpLayer.hidden = !showGroups || !names.length;
            root.querySelector('[data-bd-groups]')?.classList.toggle('is-on', showGroups);
            if (grpLayer.hidden) { grpLayer.innerHTML = ''; return; }
            grpLayer.innerHTML = names.map((g, n) => { const l = items.filter(i => i.group === g), bb = bbox(l); return `<div class="h-bgrp${l.some(i => sel.has(i.id)) ? ' is-sel' : ''}" style="left:${bb.x - 8}px;top:${bb.y - 8}px;width:${bb.w + 16}px;height:${bb.h + 16}px;--g:${GROUP_COLORS[n % GROUP_COLORS.length]}"><button type="button" class="h-bgrp-tag" data-bd-grp="${esc(g)}" title="Choisir ce groupe">⧉ Groupe ${n + 1} · ${l.length}</button></div>`; }).join('');
        }
        function drawSelection(keepInspector = false) {
            const list = [...sel].map(byId).filter(Boolean);
            if (!list.length) { selLayer.hidden = true; if (!keepInspector) renderInspector(); return; }
            const single = list.length === 1 ? list[0] : null;
            if (single?.type === 'line') {
                const [p, q] = lineEnds(single);
                selLayer.hidden = false; Object.assign(selLayer.style, {left: '0px', top: '0px', width: '0px', height: '0px'}); selLayer.className = 'h-board-sel is-line';
                selLayer.innerHTML = single.locked ? '' : `<span class="h-bh" data-bd-end="0" style="left:${p[0]}px;top:${p[1]}px"></span><span class="h-bh" data-bd-end="1" style="left:${q[0]}px;top:${q[1]}px"></span>`;
            } else {
                const bb = bbox(list); selLayer.hidden = false; selLayer.className = 'h-board-sel';
                Object.assign(selLayer.style, {left: bb.x + 'px', top: bb.y + 'px', width: bb.w + 'px', height: bb.h + 'px'});
                selLayer.innerHTML = list.some(i => i.locked) ? '<span class="h-bsel-lock">🔒</span>' : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<span class="h-bh h-bh-${h}" data-bd-handle="${h}"></span>`).join('');
            }
            world.appendChild(selLayer); // toujours au-dessus
            if (!keepInspector) renderInspector(); // pas pendant qu'on glisse un curseur ou qu'on choisit une couleur
        }
        // ── historique et enregistrement ──
        const snap = () => JSON.stringify(items);
        const commit = () => { const s = snap(); if (hpos >= 0 && history[hpos] === s) return; history = history.slice(0, hpos + 1); history.push(s); if (history.length > 150) history.shift(); hpos = history.length - 1; queueSave(true); };
        const restore = i => { if (i < 0 || i >= history.length || ro()) return; hpos = i; items = JSON.parse(history[i]); sel = new Set([...sel].filter(byId)); render(); queueSave(true); };
        const ownerData = {owner_type: b.owner_type, owner_id: b.owner_id, part: b.part};
        function queueSave(changed) {
            if (changed) { dirty = true; status('Modifié…'); }
            clearTimeout(saveT); saveT = setTimeout(save, changed ? 900 : 2500);
        }
        async function save() {
            const title = root.querySelector('[data-bd-title]').value.trim() || 'Tableau sans titre';
            const body = {id: b.id, title, icon: b.icon, color: b.color, status: root.querySelector('[data-bd-state]').value, ...ownerData, data: {items, view, bg, locked: boardLocked, links}};
            clearTimeout(thumbT);
            if (Date.now() - (save.lastThumb || 0) > 8000) { try { body.thumb = await thumbnail(320, 200); save.lastThumb = Date.now(); } catch (_) {} }
            try { await api('save_board', {}, {method: 'POST', body}); dirty = false; status('Enregistré ✓'); } catch (error) { status('⚠ ' + error.message); }
        }
        // ── miniature (et image PNG) : les éléments redessinés sur un canevas ──
        async function thumbnail(W, H, scale0 = 0) {
            const bb = bbox(items) || {x: 0, y: 0, w: W, h: H};
            const k = scale0 || Math.min(W / (bb.w + 40), H / (bb.h + 40));
            const cw = scale0 ? Math.ceil((bb.w + 80) * k) : W, ch = scale0 ? Math.ceil((bb.h + 80) * k) : H;
            const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
            x.fillStyle = bg === 'dark' ? '#1e2227' : bg === 'cork' ? '#c9a46b' : bg === 'paper' ? '#fbf6ea' : '#ffffff'; x.fillRect(0, 0, cw, ch);
            const ox = scale0 ? (40 - bb.x) * k : (cw - bb.w * k) / 2 - bb.x * k, oy = scale0 ? (40 - bb.y) * k : (ch - bb.h * k) / 2 - bb.y * k;
            x.translate(ox, oy); x.scale(k, k);
            const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
            for (const it of [...items].sort((a, b2) => (a.z || 0) - (b2.z || 0))) {
                x.save(); x.globalAlpha = it.opacity ?? 1;
                if (it.type === 'table') {
                    const cells = it.cells || [['']], rows = cells.length, cols = Math.max(1, ...cells.map(r => r.length)), cw = Array.from({length: cols}, (_, c) => it.colw?.[c] || 100), tot = cw.reduce((s, v) => s + v, 0), rh = it.h / rows, vals = tableValues(cells);
                    x.fillStyle = '#ffffff'; x.fillRect(it.x, it.y, it.w, it.h);
                    if (it.header) { x.fillStyle = it.hfill || '#e8eef7'; x.fillRect(it.x, it.y, it.w, rh); }
                    x.strokeStyle = '#c9ced6'; x.lineWidth = 1; x.font = `${Math.min(it.fs || 14, rh * .7)}px sans-serif`; x.fillStyle = it.color || '#111'; x.textBaseline = 'middle';
                    let cx0 = it.x; cw.forEach((w0, c) => { const ww = it.w * w0 / tot; for (let r = 0; r < rows; r++) { x.strokeRect(cx0, it.y + r * rh, ww, rh); const v = vals[r][c]; if (v !== '') { x.save(); x.beginPath(); x.rect(cx0, it.y + r * rh, ww, rh); x.clip(); x.fillText(String(cells[r][c] ?? '').startsWith('=') ? showVal(v) : String(cells[r][c] ?? ''), cx0 + 4, it.y + r * rh + rh / 2); x.restore(); } } cx0 += ww; });
                    x.restore(); continue;
                }
                if (it.type === 'shape' || it.type === 'note' || it.type === 'tag' || ['folder', 'recueil', 'person', 'link', 'screen', 'weblink', 'widget'].includes(it.type) || (it.type === 'media' && kindOfMedia(media[it.media_id]) !== 'image')) {
                    x.fillStyle = it.type === 'note' ? (it.fill || NOTE_COLORS[0]) : it.type === 'shape' ? (it.fill || '#bde0fe') : it.type === 'tag' ? (it.fill || '#0066cc') : it.type === 'folder' ? (it.fill || '#f5c542') : '#f3f5f8';
                    x.strokeStyle = it.type === 'shape' ? (it.stroke || '#1d3557') : '#c9ced6'; x.lineWidth = it.type === 'shape' ? (it.sw ?? 2) : 1;
                    if (it.type === 'shape' && it.shape === 'ellipse') { x.beginPath(); x.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2); x.fill(); x.stroke(); }
                    else { x.fillRect(it.x, it.y, it.w, it.h); x.strokeRect(it.x, it.y, it.w, it.h); }
                    const label = it.text || it.title || ({folder: 'Dossier', recueil: 'Recueil', person: 'Fiche', link: 'Écran', screen: 'Écran'}[it.type] || '');
                    if (label) { x.fillStyle = it.type === 'tag' ? '#fff' : (it.color || '#111'); x.font = `${it.bold ? 'bold ' : ''}${Math.min(it.fs || 18, it.h * .5)}px sans-serif`; x.textBaseline = 'top'; String(label).split('\n').slice(0, 6).forEach((l, n) => x.fillText(l.slice(0, 60), it.x + 8, it.y + 8 + n * (it.fs || 18) * 1.2, it.w - 16)); }
                } else if (it.type === 'text') {
                    x.fillStyle = it.color || '#111'; x.font = `${it.bold ? 'bold ' : ''}${it.fs || 18}px sans-serif`; x.textBaseline = 'top';
                    String(it.text || '').split('\n').slice(0, 30).forEach((l, n) => x.fillText(l, it.x, it.y + n * (it.fs || 18) * 1.25, it.w));
                } else if (it.type === 'draw') {
                    const sx = it.w / (it.vw || it.w), sy = it.h / (it.vh || it.h);
                    x.translate(it.x, it.y); x.scale(sx, sy); x.strokeStyle = it.color || '#111'; x.lineWidth = it.sw || 3; x.lineCap = 'round'; x.lineJoin = 'round'; if (it.brush === 'highlight') x.globalAlpha = .38;
                    if (['fountain', 'calligraphy', 'brushstroke'].includes(it.brush) && (it.points || []).length > 1) { x.fillStyle = it.color || '#111'; x.fill(new Path2D(ribbon(it.points, it.sw || 3, it.brush))); }
                    else if (it.brush === 'fill') { x.fillStyle = it.color || '#111'; x.fill(new Path2D(smooth(it.points || []) + ' Z')); }
                    else { if (it.brush === 'watercolor') x.globalAlpha = .5; if (it.brush === 'dotted') x.setLineDash([0.1, (it.sw || 3) * 2.2]); x.stroke(new Path2D(smooth(it.points || []))); }
                } else if (it.type === 'line') {
                    const [p, q] = lineEnds(it); x.strokeStyle = it.color || '#111'; x.lineWidth = it.sw || 2; x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke();
                    const tip = (to, from) => { const a = Math.atan2(to[1] - from[1], to[0] - from[0]), s = it.hs || headSize(it); x.fillStyle = it.color || '#111'; x.beginPath(); x.moveTo(to[0], to[1]); x.lineTo(to[0] - s * Math.cos(a - .45), to[1] - s * Math.sin(a - .45)); x.lineTo(to[0] - s * Math.cos(a + .45), to[1] - s * Math.sin(a + .45)); x.fill(); };
                    if (headOf(it, 'end') !== 'none') tip(q, p); if (headOf(it, 'start') !== 'none') tip(p, q);
                } else if (it.type === 'media' || it.type === 'webimage') {
                    const src = it.type === 'media' ? mediaUrl(media[it.media_id]) : it.url; const im = src ? await loadImg(src) : null;
                    try { if (im) x.drawImage(im, it.x, it.y, it.w, it.h); else { x.fillStyle = '#ddd'; x.fillRect(it.x, it.y, it.w, it.h); } } catch (_) { x.fillStyle = '#ddd'; x.fillRect(it.x, it.y, it.w, it.h); }
                }
                x.restore();
            }
            try { return c.toDataURL(scale0 ? 'image/png' : 'image/jpeg', .8); } catch (_) { return ''; } // une image d'un autre site peut l'empêcher
        }
        // ── ajouter des éléments ──
        const place = (it, at) => { if (ro()) return null; const r = stage.getBoundingClientRect(); const [cx, cy] = at || toWorld(r.left + r.width / 2, r.top + r.height / 2); const n = {id: uid(), x: cx - (it.w || 160) / 2, y: cy - (it.h || 100) / 2, w: 160, h: 100, z: topZ() + 1, ...it};
            // posé au centre : on le décale tant qu'il couvre déjà quelque chose
            const covers = () => items.some(o => o.type !== 'line' && n.x < o.x + o.w && n.x + n.w > o.x && n.y < o.y + o.h && n.y + n.h > o.y);
            if (!at) { const x0 = n.x; for (let k = 1; k < 24 && covers(); k++) { n.x = x0 + (k % 5) * (n.w + 24); if (k % 5 === 0) n.y += n.h + 24; } }
            items.push(n); sel = new Set([n.id]); render(); commit(); return n; };
        async function uploadAndPlace(files, at) {
            if (ro()) return;
            const list = [...files].filter(f => f.size > 0); if (!list.length) return;
            status('Envoi des fichiers…');
            const fd = new FormData(); fd.append('collection_type', 'board'); fd.append('collection_id', b.id); fd.append('collection_role', ''); fd.append('csrf', S().csrf); list.forEach(f => fd.append('files[]', f));
            let ids = [];
            try { const r = await fetch('upload.php', {method: 'POST', body: fd}); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'Import impossible'); ids = j.media || []; }
            catch (error) { status('⚠ ' + error.message); toast(error.message, 'error'); return; }
            if (!ids.length) return;
            Object.assign(media, (await api('media_brief', {ids: ids.join(',')})).media || {});
            let [x0, y0] = at || toWorld(stage.getBoundingClientRect().left + 200, stage.getBoundingClientRect().top + 160);
            for (const mid of ids) {
                const m = media[mid], k = kindOfMedia(m);
                let w = 260, h = 190;
                if (k === 'image') { const im = new Image(); im.src = mediaUrl(m); try { await im.decode(); const r = im.naturalHeight / im.naturalWidth; w = Math.min(420, im.naturalWidth); h = w * r; } catch (_) {} }
                if (k === 'audio') { w = 300; h = 92; } if (k === 'pdf') { w = 200; h = 150; } if (k === 'video') { w = 400; h = 240; }
                items.push({id: uid(), type: 'media', media_id: Number(mid), x: x0, y: y0, w, h, z: topZ() + 1}); x0 += 30; y0 += 30;
            }
            render(); commit(); status('Enregistré ✓');
        }
        // ── outils et options ──
        const OPTS = {
            pen: () => `<span class="h-bd-brushpick"><button type="button" class="h-bt is-on" data-bd-brushmenu title="Choisir le pinceau">${BRUSHES.find(x => x[0] === brush)?.[2] || '🖊'} ${esc(BRUSHES.find(x => x[0] === brush)?.[1] || 'Stylo')} ▾</button></span>
                <span class="h-bd-widths">${WIDTHS.map(w => `<button type="button" class="h-bt ${penWidth === w ? 'is-on' : ''}" data-bd-penwidth="${w}" title="${w} px"><i style="height:${Math.max(1.5, Math.min(14, w / 1.6))}px"></i></button>`).join('')}</span>
                <label class="h-bt-label"><input type="range" min="1" max="60" value="${Math.min(60, penWidth)}" data-bd-penw><input type="number" class="h-bd-numbox" min="0.5" max="200" step="0.5" value="${penWidth}" data-bd-penw> px</label>
                ${COLORS.map(c => `<button type="button" class="h-sw ${penColor === c ? 'is-on' : ''}" style="background:${c}" data-bd-pencolor="${c}" aria-label="${c}"></button>`).join('')}<input type="color" class="h-bd-pencolor" value="${/^#[0-9a-f]{6}$/i.test(penColor) ? penColor : '#111111'}" data-bd-pencustom title="Autre couleur">`,
            eraser: () => `${[['pixel', '🩹 Gomme fine', 'efface seulement ce que tu touches'], ['stroke', '🧽 Gomme à traits', 'enlève le trait entier']].map(([k, l, h]) => `<button type="button" class="h-bt ${eraserMode === k ? 'is-on' : ''}" data-bd-erasemode="${k}" title="${h}">${l}</button>`).join('')}
                <label class="h-bt-label">Taille <input type="range" min="2" max="120" value="${eraserSize}" data-bd-erasesize><input type="number" class="h-bd-numbox" min="2" max="400" value="${eraserSize}" data-bd-erasesize> px</label><small class="muted">Les gommes n’effacent que les dessins à main levée.</small>`,
            shape: () => SHAPES.map(([k, l]) => `<button type="button" class="h-bt ${shapeKind === k ? 'is-on' : ''}" data-bd-shapekind="${k}">${l}</button>`).join(''),
            note: () => NOTE_COLORS.map(c => `<button type="button" class="h-sw ${noteColor === c ? 'is-on' : ''}" style="background:${c}" data-bd-notecolor="${c}"></button>`).join(''),
        };
        const setTool = t => { if (boardLocked && !['select', 'hand'].includes(t)) { ro(); t = 'select'; }
            tool = t; root.querySelectorAll('[data-bd-tool]').forEach(x => x.classList.toggle('is-on', x.dataset.bdTool === t));
            const HINTS = {text: 'Clique où écrire.', line: 'Tire un trait ; posé sur un élément, il s’y accroche.', arrow: 'Tire une flèche d’un élément à un autre : elle les suit quand on les déplace.', table: 'Clique où poser le tableur.', hand: 'Glisse pour te déplacer ; molette ou deux doigts aussi ; ⌘ + molette pour zoomer.', select: 'Clic : choisir · ⇧ + clic : en ajouter · glisser dans le vide : en choisir plusieurs · double-clic : écrire ou ouvrir.'};
            root.querySelector('[data-bd-opts]').innerHTML = OPTS[t]?.() || (HINTS[t] ? `<small class="muted">${HINTS[t]}</small>` : '');
            stage.dataset.tool = t;
        };
        root.querySelector('.h-board-toolbar').addEventListener('click', e => {
            const t = e.target.closest('[data-bd-tool]'); if (t) return setTool(t.dataset.bdTool);
            const br = e.target.closest('[data-bd-brush]'); if (br) { brush = br.dataset.bdBrush; penWidth = BRUSHES.find(x => x[0] === brush)?.[3] || penWidth; root.querySelector('.h-bd-brushmenu')?.remove(); setTool('pen'); return; }
            if (e.target.closest('[data-bd-brushmenu]')) { brushMenu(e.target.closest('[data-bd-brushmenu]')); return; }
            const pw = e.target.closest('[data-bd-penwidth]'); if (pw) { penWidth = Number(pw.dataset.bdPenwidth); setTool('pen'); return; }
            const em = e.target.closest('[data-bd-erasemode]'); if (em) { eraserMode = em.dataset.bdErasemode; setTool('eraser'); return; }
            const pc = e.target.closest('[data-bd-pencolor]'); if (pc) { penColor = pc.dataset.bdPencolor; setTool('pen'); return; }
            const sk = e.target.closest('[data-bd-shapekind]'); if (sk) { shapeKind = sk.dataset.bdShapekind; setTool('shape'); return; }
            const nc = e.target.closest('[data-bd-notecolor]'); if (nc) { noteColor = nc.dataset.bdNotecolor; setTool('note'); return; }
            const z = e.target.closest('[data-bd-zoom]'); if (z) return zoomAt(view.k * (z.dataset.bdZoom === '1' ? 1.25 : 0.8));
            if (e.target.closest('[data-bd-fit]')) { fitAll(); queueSave(false); return; }
            if (e.target.closest('[data-bd-groups]')) { showGroups = !showGroups; try { localStorage.setItem('genealogie-board-groups', showGroups ? '1' : '0'); } catch (_) {} drawGroups(); toast(showGroups ? 'Les groupes sont montrés.' : 'Groupes cachés.'); return; }
            if (e.target.closest('[data-bd-add]') && !ro()) addMenu();
        });
        root.querySelector('.h-board-toolbar').addEventListener('input', e => {
            const sync = sel0 => root.querySelectorAll(sel0).forEach(x => { if (x !== e.target) x.value = e.target.value; });
            if (e.target.matches('[data-bd-penw]') && e.target.value !== '') { penWidth = Number(e.target.value); sync('[data-bd-penw]'); root.querySelectorAll('[data-bd-penwidth]').forEach(x => x.classList.toggle('is-on', Number(x.dataset.bdPenwidth) === penWidth)); }
            if (e.target.matches('[data-bd-erasesize]') && e.target.value !== '') { eraserSize = Number(e.target.value); sync('[data-bd-erasesize]'); }
            if (e.target.matches('[data-bd-pencustom]')) { penColor = e.target.value; root.querySelectorAll('[data-bd-pencolor]').forEach(x => x.classList.remove('is-on')); }
        });
        // la liste des pinceaux, comme dans Freeform
        function brushMenu(btn) {
            const old = root.querySelector('.h-bd-brushmenu'); if (old) { old.remove(); return; }
            const m = document.createElement('div'); m.className = 'h-bd-brushmenu';
            m.innerHTML = `<div class="h-bd-brushwidths">${WIDTHS.map(w => `<button type="button" class="${penWidth === w ? 'is-on' : ''}" data-bd-penwidth="${w}" title="${w} px"><svg viewBox="0 0 40 24"><path d="M4,18 C10,4 18,4 20,12 S30,20 36,6" fill="none" stroke="currentColor" stroke-width="${Math.max(1, w / 2)}" stroke-linecap="round"/></svg></button>`).join('')}</div>
                ${BRUSHES.map(([k, l, i]) => `<button type="button" class="h-bd-brushrow ${brush === k ? 'is-on' : ''}" data-bd-brush="${k}"><span class="h-bd-check">${brush === k ? '✓' : ''}</span><span class="h-bd-bicon">${i}</span>${esc(l)}<svg class="h-bd-bsample" viewBox="0 0 60 20">${drawSvg({id: 'm' + k, brush: k, color: '#222', sw: Math.min(6, (BRUSHES.find(x => x[0] === k)[3]) / 2 + 1), points: [[4, 14], [14, 5], [24, 9], [34, 15], [44, 10], [56, 5]]})}</svg></button>`).join('')}
                <button type="button" class="h-bd-brushrow" data-bd-tool="eraser"><span class="h-bd-check"></span><span class="h-bd-bicon">🧽</span>Gomme</button>`;
            btn.closest('.h-bd-brushpick').appendChild(m);
            setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !btn.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
        }
        // ── la souris sur la toile ──
        let drag = null, spaceDown = false;
        stage.addEventListener('pointerdown', e => {
            if (e.target.closest('.h-bi-text[contenteditable="true"], audio, video, iframe, input, select, textarea, [data-bd-openlink]')) return;
            const [wx, wy] = toWorld(e.clientX, e.clientY);
            if (tool === 'hand' || spaceDown || e.button === 1) { drag = {kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y}; stage.setPointerCapture(e.pointerId); return; }
            if (boardLocked) { if (tool !== 'select' && ro()) return; const hit0 = e.target.closest('[data-bi]'); sel = hit0 ? new Set([hit0.dataset.bi]) : new Set(); render(); drag = {kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y}; stage.setPointerCapture(e.pointerId); return; }
            const handle = e.target.closest('[data-bd-handle]'), end = e.target.closest('[data-bd-end]');
            if (end) { const l = byId([...sel][0]); drag = {kind: 'end', line: l, i: Number(end.dataset.bdEnd)}; stage.setPointerCapture(e.pointerId); return; }
            if (handle) { const list = [...sel].map(byId); drag = {kind: 'resize', h: handle.dataset.bdHandle, bb: bbox(list), start: list.map(i => ({id: i.id, x: i.x, y: i.y, w: i.w, h: i.h, fs: i.fs})), wx, wy}; stage.setPointerCapture(e.pointerId); return; }
            const hitEl = e.target.closest('[data-bi]'), hit = hitEl && byId(hitEl.dataset.bi);
            const gt = e.target.closest('[data-bd-grp]');
            if (gt && tool === 'select') { sel = new Set(items.filter(i => i.group === gt.dataset.bdGrp).map(i => i.id)); render(); const mv = [...sel].map(byId).filter(i => i && !i.locked); drag = {kind: 'move', wx, wy, start: mv.map(i => ({id: i.id, x: i.x, y: i.y, pts: i.type === 'line' ? clone(i.points) : null})), moved: false}; stage.setPointerCapture(e.pointerId); return; }
            if (hit?.type === 'table' && tool === 'select') { const td = e.target.closest('td[data-r]'); cellSel = td ? {id: hit.id, r: Number(td.dataset.r), c: Number(td.dataset.c)} : null; }
            if (tool === 'eraser') { drag = {kind: 'erase'}; eraseAt(e); stage.setPointerCapture(e.pointerId); return; }
            if (tool === 'pen') { const d = {id: uid(), type: 'draw', brush, color: penColor, sw: penWidth, points: [[wx, wy]], x: wx, y: wy, w: 1, h: 1, z: topZ() + 1}; drag = {kind: 'draw', d, raw: [[wx, wy]]}; items.push(d); stage.setPointerCapture(e.pointerId); return; }
            if (tool === 'line' || tool === 'arrow') { const l = {id: uid(), type: 'line', points: [[wx, wy], [wx, wy]], color: penColor === '#ffffff' ? '#111111' : penColor, sw: 2.5, arrowEnd: tool === 'arrow', headEnd: tool === 'arrow' ? 'triangle' : 'none', from: hit && hit.type !== 'line' ? hit.id : '', x: wx, y: wy, w: 4, h: 4, z: topZ() + 1}; items.push(l); drag = {kind: 'end', line: l, i: 1, fresh: true}; stage.setPointerCapture(e.pointerId); return; }
            if (tool === 'text') { const t = place({type: 'text', text: '', w: 260, h: 40, fs: 20, color: '#111111'}, [wx + 130, wy + 20]); setTool('select'); setTimeout(() => editText(t), 0); return; }
            if (tool === 'note') { const n = place({type: 'note', text: '', w: 180, h: 160, fill: noteColor, fs: 18}, [wx, wy]); setTool('select'); setTimeout(() => editText(n), 0); return; }
            if (tool === 'table') { const t = place(newTable(), [wx + 180, wy + 70]); setTool('select'); sel = new Set([t.id]); cellSel = {id: t.id, r: 0, c: 0}; render(); return; }
            if (tool === 'shape') { drag = {kind: 'newshape', sx: wx, sy: wy, it: null}; stage.setPointerCapture(e.pointerId); return; }
            // choisir / déplacer
            if (hit) {
                const grp = groupOf(hit).map(i => i.id);
                if (e.shiftKey) { const has = sel.has(hit.id); grp.forEach(id0 => has ? sel.delete(id0) : sel.add(id0)); }
                else if (!sel.has(hit.id)) sel = new Set(grp);
                drawSelection(); render();
                const movable = [...sel].map(byId).filter(i => i && !i.locked);
                if (movable.length) drag = {kind: 'move', wx, wy, start: movable.map(i => ({id: i.id, x: i.x, y: i.y, pts: i.type === 'line' ? clone(i.points) : null})), moved: false};
                stage.setPointerCapture(e.pointerId); return;
            }
            if (!e.shiftKey) sel.clear();
            drag = {kind: 'marquee', wx, wy, sx: e.clientX, sy: e.clientY, base: new Set(sel)}; stage.setPointerCapture(e.pointerId); render();
        });
        stage.addEventListener('pointermove', e => {
            if (!drag) return;
            const [wx, wy] = toWorld(e.clientX, e.clientY);
            if (drag.kind === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); return; }
            if (drag.kind === 'move') {
                let dx = wx - drag.wx, dy = wy - drag.wy;
                if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
                drag.moved = drag.moved || Math.hypot(dx, dy) > 1;
                for (const s0 of drag.start) { const it = byId(s0.id); it.x = s0.x + dx; it.y = s0.y + dy; if (s0.pts) { it.points = s0.pts.map(p => [p[0] + dx, p[1] + dy]); } }
                render(); return;
            }
            if (drag.kind === 'resize') {
                const {bb, h} = drag; let x0 = bb.x, y0 = bb.y, x1 = bb.x + bb.w, y1 = bb.y + bb.h;
                if (h.includes('w')) x0 = Math.min(wx, x1 - 10); if (h.includes('e')) x1 = Math.max(wx, x0 + 10);
                if (h.includes('n')) y0 = Math.min(wy, y1 - 10); if (h.includes('s')) y1 = Math.max(wy, y0 + 10);
                if (e.shiftKey || drag.start.some(s0 => ['media', 'webimage'].includes(byId(s0.id).type))) { const r = bb.w / bb.h; if (h.length === 2 || h === 'e' || h === 'w') { const nh = (x1 - x0) / r; if (h.includes('n')) y0 = y1 - nh; else y1 = y0 + nh; } else { const nw = (y1 - y0) * r; if (h.includes('w')) x0 = x1 - nw; else x1 = x0 + nw; } }
                const sx = (x1 - x0) / bb.w, sy = (y1 - y0) / bb.h;
                for (const s0 of drag.start) { const it = byId(s0.id); it.x = x0 + (s0.x - bb.x) * sx; it.y = y0 + (s0.y - bb.y) * sy; it.w = Math.max(8, s0.w * sx); it.h = Math.max(8, s0.h * sy); if (it.type === 'text' && s0.fs && drag.start.length > 1) it.fs = Math.max(6, s0.fs * Math.min(sx, sy)); }
                render(); return;
            }
            if (drag.kind === 'end') {
                const l = drag.line, el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-bi]'), target = el && byId(el.dataset.bi);
                const key = drag.i === 0 ? 'from' : 'to';
                l[key] = target && target.type !== 'line' && target.id !== l.id ? target.id : '';
                l.points[drag.i] = [wx, wy]; render(); return;
            }
            if (drag.kind === 'draw') { const r0 = drag.raw[drag.raw.length - 1]; if (Math.hypot(wx - r0[0], wy - r0[1]) * view.k < 1.5) return; drag.raw.push([wx, wy]); const xs = drag.raw.map(p => p[0]), ys = drag.raw.map(p => p[1]); const x0 = Math.min(...xs), y0 = Math.min(...ys), d = drag.d; d.x = x0 - d.sw; d.y = y0 - d.sw; d.w = Math.max(...xs) - x0 + d.sw * 2; d.h = Math.max(...ys) - y0 + d.sw * 2; d.vw = d.w; d.vh = d.h; d.points = drag.raw.map(p => [p[0] - d.x, p[1] - d.y]); render(); return; }
            if (drag.kind === 'erase') { eraseAt(e); moveEraser(e); return; }
            if (drag.kind === 'newshape') {
                const x0 = Math.min(wx, drag.sx), y0 = Math.min(wy, drag.sy), w = Math.abs(wx - drag.sx), h = Math.abs(wy - drag.sy);
                if (!drag.it && w + h > 6) { drag.it = {id: uid(), type: 'shape', shape: shapeKind, fill: '#bde0fe', stroke: '#1d3557', sw: 2, text: '', fs: 18, color: '#111111', z: topZ() + 1}; items.push(drag.it); }
                if (drag.it) { Object.assign(drag.it, {x: x0, y: y0, w: Math.max(10, w), h: Math.max(10, e.shiftKey ? w : h)}); render(); }
                return;
            }
            if (drag.kind === 'marquee') {
                const m = root.querySelector('[data-bd-marquee]'), r = stage.getBoundingClientRect();
                const x0 = Math.min(e.clientX, drag.sx) - r.left, y0 = Math.min(e.clientY, drag.sy) - r.top;
                Object.assign(m.style, {left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - drag.sx) + 'px', height: Math.abs(e.clientY - drag.sy) + 'px'}); m.hidden = false;
                const X0 = Math.min(wx, drag.wx), Y0 = Math.min(wy, drag.wy), X1 = Math.max(wx, drag.wx), Y1 = Math.max(wy, drag.wy);
                sel = new Set(drag.base); items.forEach(i => { if (i.x < X1 && i.x + i.w > X0 && i.y < Y1 && i.y + i.h > Y0) groupOf(i).forEach(g => sel.add(g.id)); });
                render();
            }
        });
        const endDrag = () => {
            if (!drag) return;
            const d = drag; drag = null; root.querySelector('[data-bd-marquee]').hidden = true;
            if (d.kind === 'pan') { queueSave(false); return; }
            if (d.kind === 'draw') { if (d.raw.length < 2) { const p = d.d; p.points = [[p.sw, p.sw]]; p.w = p.h = p.vw = p.vh = p.sw * 2; } render(); commit(); return; }
            if (d.kind === 'end') { const l = d.line; if (d.fresh && Math.hypot(l.points[1][0] - l.points[0][0], l.points[1][1] - l.points[0][1]) < 6 && !l.to) { items = items.filter(i => i !== l); render(); return; } sel = new Set([l.id]); render(); commit(); if (d.fresh) setTool('select'); return; }
            if (d.kind === 'newshape') { if (!d.it) { place({type: 'shape', shape: shapeKind, fill: '#bde0fe', stroke: '#1d3557', sw: 2, text: '', fs: 18, color: '#111111', w: 160, h: 110}, [d.sx, d.sy]); } else { sel = new Set([d.it.id]); render(); commit(); } setTool('select'); return; }
            if (d.kind === 'move' && !d.moved) return;
            if (['move', 'resize', 'erase'].includes(d.kind)) commit();
        };
        stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
        function eraseAt(e) {
            if (eraserMode === 'stroke') {
                const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-bi]'), it = el && byId(el.dataset.bi);
                if (it && it.type === 'draw' && !it.locked) { items = items.filter(i => i !== it); render(); }
                return;
            }
            // gomme fine : les points touchés disparaissent, le trait est coupé en morceaux
            const [wx, wy] = toWorld(e.clientX, e.clientY), r = eraserSize / 2 / view.k;
            let changed = false;
            for (const it of items.filter(i => i.type === 'draw' && !i.locked && wx > i.x - r && wx < i.x + i.w + r && wy > i.y - r && wy < i.y + i.h + r)) {
                const sx = (it.vw || it.w) / it.w, sy = (it.vh || it.h) / it.h, lx = (wx - it.x) * sx, ly = (wy - it.y) * sy, rr = r * Math.max(sx, sy) + (it.sw || 3) / 2;
                // la gomme coupe aussi entre deux points éloignés (trait tiré vite) : on ajoute des points là où elle passe
                const segD = (a, b2) => { const dx = b2[0] - a[0], dy = b2[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((lx - a[0]) * dx + (ly - a[1]) * dy) / L)); return Math.hypot(a[0] + dx * t - lx, a[1] + dy * t - ly); };
                const src = it.points || [];
                if (!src.some((p, i) => (i ? segD(src[i - 1], p) : Math.hypot(p[0] - lx, p[1] - ly)) <= rr)) continue;
                const pts = [], step = Math.max(.75, rr / 2);
                src.forEach((p, i) => { if (i) { const a = src[i - 1], d = Math.hypot(p[0] - a[0], p[1] - a[1]); if (d > step && segD(a, p) <= rr * 2) { const n = Math.ceil(d / step); for (let j = 1; j < n; j++) pts.push([+(a[0] + (p[0] - a[0]) * j / n).toFixed(1), +(a[1] + (p[1] - a[1]) * j / n).toFixed(1)]); } } pts.push(p); });
                const keep = pts.map(p => Math.hypot(p[0] - lx, p[1] - ly) > rr);
                if (keep.every(Boolean)) continue;
                changed = true;
                const parts = []; let cur = [];
                pts.forEach((p, i) => { if (keep[i]) cur.push(p); else { if (cur.length > 1) parts.push(cur); cur = []; } });
                if (cur.length > 1) parts.push(cur);
                items = items.filter(i => i !== it);
                parts.forEach((pp, k) => items.push({...clone(it), id: k ? uid() : it.id, points: pp}));
            }
            if (changed) render();
        }
        // le rond de la gomme fine, sous la souris
        const ecur = document.createElement('div'); ecur.className = 'h-bd-ecursor'; ecur.hidden = true; stage.appendChild(ecur);
        function moveEraser(e) {
            if (tool !== 'eraser' || eraserMode !== 'pixel') { ecur.hidden = true; return; }
            const r = stage.getBoundingClientRect(); ecur.hidden = false;
            Object.assign(ecur.style, {left: e.clientX - r.left + 'px', top: e.clientY - r.top + 'px', width: eraserSize + 'px', height: eraserSize + 'px'});
        }
        stage.addEventListener('pointermove', e => { if (!drag) moveEraser(e); });
        stage.addEventListener('pointerleave', () => { ecur.hidden = true; });
        stage.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) { zoomAt(view.k * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY); return; }
            view.x -= e.deltaX; view.y -= e.deltaY; applyView(); queueSave(false);
        }, {passive: false});
        // ── écrire dans un élément ──
        function editText(it) {
            if (!it || it.locked || ro()) return;
            const el = els.get(it.id)?.querySelector('[data-bd-text]'); if (!el) return;
            editing = it.id; el.contentEditable = 'true'; el.innerText = it.text || ''; el.focus();
            const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
            const done = () => {
                el.removeEventListener('blur', done); el.contentEditable = 'false'; editing = null;
                it.text = el.innerText.replace(/\n$/, '');
                if (it.type === 'text') { if (!it.text.trim()) { items = items.filter(i => i !== it); sel.delete(it.id); } else { it.h = Math.max(it.h, el.scrollHeight + 4); } }
                if (it.type === 'note') it.h = Math.max(it.h, el.scrollHeight + 24);
                sigs.delete(it.id); render(); commit();
            };
            el.addEventListener('blur', done);
            el.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); el.blur(); } ev.stopPropagation(); });
        }
        stage.addEventListener('dblclick', e => {
            // la capture du pointeur renvoie le double-clic sur la toile : on cherche l'élément sous la souris
            const under = document.elementFromPoint(e.clientX, e.clientY), el = under?.closest('[data-bi]'), it = el && byId(el.dataset.bi);
            if (under?.closest('.h-board-sel') && sel.size === 1) { const one = byId([...sel][0]); if (one) { if (['text', 'note', 'shape'].includes(one.type)) return editText(one); if (one.type === 'table') { const td = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.matches?.('td[data-r]')); return editCell(one, td ? Number(td.dataset.r) : cellSel?.r || 0, td ? Number(td.dataset.c) : cellSel?.c || 0); } return openItem(one); } }
            if (!it) { if (tool === 'select' && !boardLocked) { const [wx, wy] = toWorld(e.clientX, e.clientY); const t = place({type: 'text', text: '', w: 260, h: 40, fs: 20, color: '#111111'}, [wx + 130, wy + 20]); setTimeout(() => editText(t), 0); } return; }
            if (['text', 'note', 'shape'].includes(it.type)) return editText(it);
            if (it.type === 'table') { const td = under.closest('td[data-r]'); return editCell(it, td ? Number(td.dataset.r) : 0, td ? Number(td.dataset.c) : 0); }
            openItem(it);
        });
        stage.addEventListener('click', e => { const o = e.target.closest('[data-bd-openlink]'); if (o) { const it = byId(o.closest('[data-bi]').dataset.bi); openItem(it); } });
        // ── tableur : écrire dans une cellule (Tab, Entrée pour passer à la suivante ; coller un bout de tableur) ──
        function newTable() { return {type: 'table', cells: [['Nom', 'Année', 'Lieu'], ['', '', ''], ['', '', ''], ['', '', '']], colw: [140, 90, 130], header: true, stripes: true, fs: 14, color: '#111111', hfill: '#e8eef7', w: 360, h: 140}; }
        function editCell(it, r, c) {
            if (!it || it.locked || ro()) return;
            const td = els.get(it.id)?.querySelector(`td[data-r="${r}"][data-c="${c}"]`); if (!td) return;
            sel = new Set([it.id]); cellSel = {id: it.id, r, c}; drawSelection();
            editing = it.id; td.contentEditable = 'true'; td.classList.add('is-editing'); td.textContent = it.cells[r]?.[c] ?? ''; td.focus();
            const rg = document.createRange(); rg.selectNodeContents(td); const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg);
            let cancelled = false, after = null;
            const done = () => {
                td.removeEventListener('blur', done); td.contentEditable = 'false'; editing = null;
                if (!cancelled) { while (it.cells.length <= r) it.cells.push([]); it.cells[r][c] = td.textContent.replace(/\n+$/, ''); }
                sigs.delete(it.id); render(); if (!cancelled) commit();
                if (after) setTimeout(after, 0);
            };
            td.addEventListener('blur', done);
            td.addEventListener('keydown', ev => {
                ev.stopPropagation();
                const rows = it.cells.length, cols = Math.max(...it.cells.map(x => x.length));
                if (ev.key === 'Escape') { ev.preventDefault(); cancelled = true; td.blur(); return; }
                if (ev.key === 'Tab') { ev.preventDefault(); let nr = r, nc = c + (ev.shiftKey ? -1 : 1); if (nc >= cols) { nc = 0; nr++; } if (nc < 0) { nc = cols - 1; nr = Math.max(0, nr - 1); } after = () => { if (nr >= it.cells.length) tableOp(it, 'row+', it.cells.length - 1, 0, true); editCell(it, nr, nc); }; td.blur(); return; }
                if (ev.key === 'Enter' && !ev.shiftKey && !ev.altKey) { ev.preventDefault(); const nr = ev.metaKey || ev.ctrlKey ? r : r + 1; if (nr < rows) after = () => editCell(it, nr, c); td.blur(); }
            });
            td.addEventListener('paste', ev => {
                const t = ev.clipboardData?.getData('text/plain') || '';
                if (!/[\t\n]/.test(t.trim())) return; // un seul mot : collage normal
                ev.preventDefault(); cancelled = true;
                const grid = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t')).slice(0, 100);
                grid.forEach((row, i) => row.slice(0, 30).forEach((v, j) => { const R = r + i, C = c + j; if (R >= 100 || C >= 30) return; while (it.cells.length <= R) it.cells.push([]); it.cells[R][C] = v; }));
                normTable(it); it.h = Math.max(it.h, it.cells.length * ((it.fs || 14) * 1.9)); it.w = Math.max(it.w, (it.colw || []).reduce((s, w) => s + w, 0));
                td.blur(); commit(); toast(`${grid.length} ligne${grid.length > 1 ? 's' : ''} collée${grid.length > 1 ? 's' : ''}.`);
            });
        }
        const normTable = it => { const cols = Math.min(30, Math.max(1, ...it.cells.map(r => r.length))); it.cells = it.cells.map(r => Array.from({length: cols}, (_, c) => r[c] ?? '')); it.colw = Array.from({length: cols}, (_, c) => it.colw?.[c] || 100); };
        function tableOp(it, op, r = cellSel?.r ?? it.cells.length - 1, c = cellSel?.c ?? 0, quiet = false) {
            if (!it || ro()) return;
            normTable(it);
            const rows = it.cells.length, cols = it.cells[0].length, rh = it.h / rows;
            const shiftFill = (fn) => { const nf = {}; Object.entries(it.cfill || {}).forEach(([k, v]) => { const [a, b2] = k.split(':').map(Number); const n = fn(a, b2); if (n) nf[n.join(':')] = v; }); it.cfill = nf; };
            if (op === 'row+' && rows < 100) { it.cells.splice(r + 1, 0, Array(cols).fill('')); it.h += rh; shiftFill((a, b2) => [a > r ? a + 1 : a, b2]); }
            if (op === 'row-' && rows > 1) { it.cells.splice(r, 1); it.h = Math.max(30, it.h - rh); shiftFill((a, b2) => a === r ? null : [a > r ? a - 1 : a, b2]); if (cellSel) cellSel.r = Math.min(cellSel.r, rows - 2); }
            if (op === 'col+' && cols < 30) { it.cells.forEach(row => row.splice(c + 1, 0, '')); it.colw.splice(c + 1, 0, 100); it.w += it.w / cols; shiftFill((a, b2) => [a, b2 > c ? b2 + 1 : b2]); }
            if (op === 'col-' && cols > 1) { it.cells.forEach(row => row.splice(c, 1)); const w0 = it.colw.splice(c, 1)[0]; it.w = Math.max(40, it.w - it.w * w0 / (it.colw.reduce((s, x) => s + x, 0) + w0)); shiftFill((a, b2) => b2 === c ? null : [a, b2 > c ? b2 - 1 : b2]); if (cellSel) cellSel.c = Math.min(cellSel.c, cols - 2); }
            if (op === 'wider' || op === 'narrower') { it.colw[c] = Math.max(30, Math.min(800, (it.colw[c] || 100) * (op === 'wider' ? 1.25 : 0.8))); }
            if (op === 'clear') { it.cells[r][c] = ''; }
            sigs.delete(it.id); render(); if (!quiet) commit();
        }
        function tableCsv(it) {
            const vals = tableValues(it.cells), q = v => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
            const csv = '\ufeff' + vals.map(r => r.map(v => q(typeof v === 'number' ? String(v).replace('.', ',') : String(v))).join(';')).join('\n');
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = (root.querySelector('[data-bd-title]').value.trim() || 'tableau') + ' - tableur.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
        async function openItem(it) {
            if (!it) return;
            if (it.type === 'folder') { if (dirty) await save(); return go(it.board_id); }
            if (it.type === 'recueil') return ext.openRecueil?.(it.recueil_id);
            if (it.type === 'person') { S().currentPersonId = Number(it.person_id); return A().setModule('personnes'); }
            if (it.type === 'link' || it.type === 'screen') return A().openCustomScreen(it.target);
            if (it.type === 'weblink' && it.url) return window.open(it.url, '_blank', 'noopener');
            if (it.type === 'media') { const m = media[it.media_id]; if (m) A().openLightbox?.([{...m, id: Number(it.media_id)}], 0, true); }
            if (it.type === 'webimage' && it.url) window.open(it.url, '_blank', 'noopener');
        }
        // ── déposer, coller ──
        stage.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.querySelector('[data-bd-drop]').hidden = false; } });
        stage.addEventListener('dragleave', e => { if (e.target === stage) root.querySelector('[data-bd-drop]').hidden = true; });
        stage.addEventListener('drop', e => {
            root.querySelector('[data-bd-drop]').hidden = true;
            if (!e.dataTransfer?.files?.length) { const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain'); if (/^https?:\/\//.test(url || '')) { e.preventDefault(); addUrl(url.trim(), toWorld(e.clientX, e.clientY)); } return; }
            e.preventDefault(); uploadAndPlace(e.dataTransfer.files, toWorld(e.clientX, e.clientY));
        });
        const onPaste = e => {
            if (!root.isConnected || editing || e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
            const files = [...(e.clipboardData?.files || [])];
            if (files.length) { e.preventDefault(); uploadAndPlace(files); return; }
            const text = e.clipboardData?.getData('text/plain') || '';
            if (clipboard && text === '') { e.preventDefault(); pasteInternal(); return; }
            if (/^https?:\/\/\S+$/.test(text.trim())) { e.preventDefault(); addUrl(text.trim()); return; }
            if (text.trim()) { e.preventDefault(); place({type: 'text', text, w: 320, h: Math.min(600, 28 + text.split('\n').length * 26), fs: 18, color: '#111111'}); }
        };
        document.addEventListener('paste', onPaste);
        function addUrl(url, at) {
            if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url)) place({type: 'webimage', url, w: 320, h: 220}, at);
            else place({type: 'weblink', url, title: '', w: 240, h: 120}, at);
        }
        // ── clavier ──
        const typing = e => e.target.closest?.('input, textarea, select, [contenteditable="true"]');
        const selItems = () => [...sel].map(byId).filter(Boolean);
        function pasteInternal() {
            if (!clipboard?.length) return;
            const map = new Map(), group = new Map();
            const copies = clipboard.map(i => { const n = {...clone(i), id: uid(), x: i.x + 30, y: i.y + 30, z: topZ() + 1}; map.set(i.id, n.id); if (i.group) { if (!group.has(i.group)) group.set(i.group, uid()); n.group = group.get(i.group); } if (n.points && n.type === 'line') n.points = n.points.map(p => [p[0] + 30, p[1] + 30]); return n; });
            copies.forEach(n => { if (n.from) n.from = map.get(n.from) || ''; if (n.to) n.to = map.get(n.to) || ''; });
            items.push(...copies); sel = new Set(copies.map(c => c.id)); clipboard = copies.map(clone); render(); commit();
        }
        const actions0 = {
            delete: () => { const ids = new Set(selItems().filter(i => !i.locked).map(i => i.id)); if (!ids.size) return; items = items.filter(i => !ids.has(i.id)); items.forEach(i => { if (ids.has(i.from)) i.from = ''; if (ids.has(i.to)) i.to = ''; }); sel.clear(); render(); commit(); },
            duplicate: () => { clipboard = selItems().map(clone); pasteInternal(); },
            copy: () => { clipboard = selItems().map(clone); toast(`${clipboard.length} élément${clipboard.length > 1 ? 's' : ''} copié${clipboard.length > 1 ? 's' : ''}.`); },
            group: () => { const l = selItems(); if (l.length < 2) return; const g = uid(); l.forEach(i => { i.group = g; }); render(); commit(); },
            ungroup: () => { selItems().forEach(i => { i.group = ''; }); render(); commit(); },
            lock: () => { const l = selItems(); const v = !l.every(i => i.locked); l.forEach(i => { i.locked = v; }); render(); commit(); },
            front: () => { let z = topZ(); selItems().forEach(i => { i.z = ++z; }); render(); commit(); },
            back: () => { let z = items.reduce((m, i) => Math.min(m, i.z || 0), 0); selItems().forEach(i => { i.z = --z; }); render(); commit(); },
            all: () => { sel = new Set(items.map(i => i.id)); render(); },
        };
        const actions = Object.fromEntries(Object.entries(actions0).map(([k, f]) => [k, (...a) => (['all', 'copy'].includes(k) || !ro()) && f(...a)]));
        const onKey = e => {
            if (!root.isConnected || document.querySelector('dialog[open]')) return;
            if (typing(e) || !root.contains(document.activeElement) && document.activeElement !== document.body) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            // nos raccourcis passent avant ceux de l'app (⌘Z annule ici, pas la dernière modification d'une fiche)
            const ours = mod ? ['z', 'y', 'd', 'g', 'l', 'a', ...(sel.size ? ['c'] : [])].includes(k) : ['delete', 'backspace', 'escape', ' ', ']', '[', 'v', 'h', 't', 'n', 's', 'l', 'a', 'p', 'e', 'g', '+', '=', '-', '0'].includes(k) || (k.startsWith('arrow') && sel.size);
            if (ours) e.stopImmediatePropagation();
            if (boardLocked && ours && !['escape', ' ', '+', '=', '-', '0', 'v', 'h'].includes(k) && !(mod && ['a', 'c'].includes(k)) && !k.startsWith('arrow')) { e.preventDefault(); ro(); return; }
            if (boardLocked && k.startsWith('arrow')) return;
            if (mod && k === 'z') { e.preventDefault(); restore(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (mod && k === 'y') { e.preventDefault(); restore(hpos + 1); return; }
            if (mod && k === 'd') { e.preventDefault(); actions.duplicate(); return; }
            if (mod && k === 'c') { if (sel.size) { actions.copy(); } return; }
            if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? actions.ungroup() : actions.group(); return; }
            if (mod && k === 'l') { e.preventDefault(); actions.lock(); return; }
            if (mod && k === 'a') { e.preventDefault(); actions.all(); return; }
            if (k === 'delete' || k === 'backspace') { if (sel.size) { e.preventDefault(); actions.delete(); } return; }
            if (k === 'escape') { sel.clear(); setTool('select'); render(); return; }
            if (k === ' ') { spaceDown = true; stage.dataset.tool = 'hand'; e.preventDefault(); return; }
            if (k === ']') { actions.front(); return; } if (k === '[') { actions.back(); return; }
            if (k.startsWith('arrow') && sel.size) { e.preventDefault(); const st = e.shiftKey ? 10 : 1; selItems().filter(i => !i.locked).forEach(i => { if (k === 'arrowleft') i.x -= st; if (k === 'arrowright') i.x += st; if (k === 'arrowup') i.y -= st; if (k === 'arrowdown') i.y += st; if (i.type === 'line') i.points = i.points.map(p => [p[0] + (k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0), p[1] + (k === 'arrowup' ? -st : k === 'arrowdown' ? st : 0)]); }); render(); commit(); return; }
            if (mod) return;
            const tk = {v: 'select', h: 'hand', t: 'text', n: 'note', s: 'shape', l: 'line', a: 'arrow', p: 'pen', e: 'eraser', g: 'table'}[k]; if (tk) setTool(tk);
            if (k === '+' || k === '=') zoomAt(view.k * 1.25); if (k === '-') zoomAt(view.k * 0.8); if (k === '0') { fitAll(); }
        };
        const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.dataset.tool = tool; } };
        window.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp);
        // ── propriétés de la sélection ──
        function renderInspector() {
            const l = selItems();
            if (!l.length) { inspector.innerHTML = `<h4>Tableau</h4><p class="muted">${fmt(items.length)} élément${items.length > 1 ? 's' : ''}. Choisis un élément pour le régler.</p>
                <p class="muted h-bd-keys">⌘Z annuler · ⌘D dupliquer · ⌘G grouper (⇧ pour dégrouper) · ⌘L verrouiller · ] [ devant / derrière · flèches pour pousser · espace pour se déplacer · ⌘ + molette pour zoomer · coller une image ou une adresse web.</p>`; return; }
            const one = l.length === 1 ? l[0] : null, t = one?.type, has = k => l.some(i => i[k] !== undefined || ({fill: ['shape', 'note', 'tag', 'folder'], stroke: ['shape'], color: ['text', 'note', 'shape', 'line', 'draw', 'tag', 'table'], fs: ['text', 'note', 'shape', 'table']}[k] || []).includes(i.type));
            const numField = (k, label, min, max, step, val, unit = 'px', boxMax = max) => `<label>${label}<span class="h-bd-num"><input type="range" min="${min}" max="${max}" step="${step}" value="${Math.min(max, val)}" data-bd-num="${k}"><input type="number" class="h-bd-numbox" min="${min}" max="${boxMax}" step="${step}" value="${val}" data-bd-num="${k}"><small>${unit}</small></span></label>`;
            const headSel = (k, cur) => `<select data-bd-sel="${k}">${HEADS_LIST.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
            const swatches = (k, list) => `<div class="h-bd-sws">${list.map(c => `<button type="button" class="h-sw" style="background:${c}" data-bd-set="${k}" data-v="${c}"></button>`).join('')}<input type="color" data-bd-setc="${k}" value="${/^#[0-9a-f]{6}$/i.test(one?.[k] || '') ? one[k] : '#111111'}"></div>`;
            const grp = !one && l[0].group && l.every(i => i.group === l[0].group) && items.filter(i => i.group === l[0].group).length === l.length ? groupNames().indexOf(l[0].group) + 1 : 0;
            const cs = one && t === 'table' && cellSel?.id === one.id ? cellSel : null;
            inspector.innerHTML = `<h4>${grp ? `⧉ Groupe ${grp} · ${l.length} éléments` : one ? ({table: 'Tableur', shape: 'Forme', note: 'Note', text: 'Texte', draw: 'Dessin', line: headOf(one, 'end') !== 'none' || headOf(one, 'start') !== 'none' ? 'Flèche' : 'Trait', media: 'Média', webimage: 'Image du web', weblink: 'Lien web', tag: 'Étiquette', folder: 'Dossier', recueil: 'Recueil', person: 'Fiche', widget: 'Widget', link: 'Écran de l’app', screen: 'Écran de l’app'}[t] || 'Élément') : `${l.length} éléments`}</h4>
                ${has('fill') ? `<label>Fond</label>${swatches('fill', t === 'note' ? NOTE_COLORS : ['transparent', ...COLORS.slice(2), '#bde0fe', '#fff3a3', '#caffbf'])}` : ''}
                ${has('stroke') ? `<label>Bord</label>${swatches('stroke', ['transparent', ...COLORS])}` : ''}
                ${has('color') ? `<label>${t === 'line' || t === 'draw' ? 'Couleur' : 'Texte'}</label>${swatches('color', COLORS)}` : ''}
                ${l.some(i => ['shape', 'line', 'draw'].includes(i.type)) ? `${numField('sw', 'Épaisseur', 0, 30, 0.5, one?.sw ?? 2, 'px', 60)}<label>Trait <select data-bd-sel="dash">${LINE_DASHES.map(([k, lb]) => `<option value="${k}" ${(one?.dash || '') === k ? 'selected' : ''}>${lb}</option>`).join('')}</select></label>` : ''}
                ${t === 'shape' ? `<label>Forme</label><div class="h-bd-row">${SHAPES.map(([k, lb]) => `<button type="button" class="h-bt ${one.shape === k ? 'is-on' : ''}" data-bd-set="shape" data-v="${k}" title="${esc(lb)}">${lb.split(' ')[0]}</button>`).join('')}</div>` : ''}
                ${has('fs') ? `${numField('fs', 'Taille du texte', 8, 120, 1, one?.fs || 18, 'px', 400)}<div class="h-bd-row"><button type="button" class="h-bt ${one?.bold ? 'is-on' : ''}" data-bd-toggle="bold"><b>G</b></button><button type="button" class="h-bt ${one?.italic ? 'is-on' : ''}" data-bd-toggle="italic"><i>I</i></button>${['left', 'center', 'right'].map(a => `<button type="button" class="h-bt" data-bd-set="align" data-v="${a}">${{left: '⟸', center: '≡', right: '⟹'}[a]}</button>`).join('')}</div>` : ''}
                ${t === 'line' ? `<div class="h-bd-heads"><label>Pointe au début ${headSel('headStart', headOf(one, 'start'))}</label><label>Pointe à la fin ${headSel('headEnd', headOf(one, 'end'))}</label></div>
                    ${numField('hs', 'Taille des pointes', 4, 80, 1, one.hs || headSize(one), 'px', 200)}
                    <label>Forme du trait <select data-bd-sel="path">${LINE_PATHS.map(([k, lb]) => `<option value="${k}" ${(one.path || (one.curved ? 'curve' : 'straight')) === k ? 'selected' : ''}>${lb}</option>`).join('')}</select></label><label>Légende <input data-bd-str="text" value="${esc(one.text || '')}" placeholder="frère de, a écrit à…"></label>` : ''}
                ${['folder', 'recueil', 'person', 'link', 'screen', 'weblink'].includes(t) ? `<label>Titre <input data-bd-str="title" value="${esc(one.title || '')}"></label>` : ''}
                ${t === 'table' ? `<div class="h-bd-tbl"><p class="muted">${cs ? `Cellule <strong>${colName(cs.c)}${cs.r + 1}</strong>${String(one.cells?.[cs.r]?.[cs.c] ?? '').startsWith('=') ? ` : <code>${esc(one.cells[cs.r][cs.c])}</code>` : ''}` : 'Clique une cellule pour la choisir'} · double-clic pour écrire</p>
                    <div class="h-bd-row"><button type="button" class="h-bt" data-bd-tbl="row+" title="Ajouter une ligne dessous">＋ ligne</button><button type="button" class="h-bt" data-bd-tbl="row-" title="Enlever la ligne">− ligne</button><button type="button" class="h-bt" data-bd-tbl="col+" title="Ajouter une colonne à droite">＋ colonne</button><button type="button" class="h-bt" data-bd-tbl="col-" title="Enlever la colonne">− colonne</button></div>
                    <div class="h-bd-row"><button type="button" class="h-bt" data-bd-tbl="narrower" title="Colonne plus étroite">⇤⇥ −</button><button type="button" class="h-bt" data-bd-tbl="wider" title="Colonne plus large">⇤⇥ ＋</button>${cs ? '<button type="button" class="h-bt" data-bd-tbl="clear" title="Vider la cellule">⌫ vider</button>' : ''}<button type="button" class="h-bt" data-bd-tbl="csv" title="Télécharger en CSV (Excel, Numbers…)">⬇ CSV</button></div>
                    <label class="checkbox-line"><input type="checkbox" data-bd-check="header" ${one.header ? 'checked' : ''}> <span>première ligne en titre</span></label><label class="checkbox-line"><input type="checkbox" data-bd-check="hcol" ${one.hcol ? 'checked' : ''}> <span>première colonne en titre</span></label><label class="checkbox-line"><input type="checkbox" data-bd-check="stripes" ${one.stripes ? 'checked' : ''}> <span>une ligne sur deux teintée</span></label>
                    <label>Fond des titres</label>${swatches('hfill', ['#e8eef7', '#fff3a3', '#caffbf', '#ffd6e0', '#e9d8fd', '#f1f3f5', 'transparent'])}
                    ${cs ? `<label>Fond de la cellule</label><div class="h-bd-sws">${['transparent', '#fff3a3', '#caffbf', '#bde0fe', '#ffd6e0', '#ffadad', '#e9d8fd', '#dee2e6'].map(c => `<button type="button" class="h-sw" style="background:${c}" data-bd-cellfill="${c}"></button>`).join('')}</div>` : ''}
                    <details class="h-bd-help"><summary>Formules</summary><p class="muted">Commence par <code>=</code> : <code>=B2+B3</code>, <code>=SOMME(B2:B9)</code>, <code>=MOYENNE(B2:B9)</code>, <code>=MIN(…)</code>, <code>=MAX(…)</code>, <code>=NB(…)</code>, <code>=PRODUIT(…)</code>, <code>=ARRONDI(B2;1)</code>, <code>=2026-B2</code> (âge). Colle un bout de tableur (Excel, Numbers) dans une cellule : il se range dans la grille.</p></details></div>` : ''}
                ${t === 'draw' ? `<label>Pinceau <select data-bd-sel="brush">${BRUSHES.map(([k, lb, ic]) => `<option value="${k}" ${(one.brush || 'pen') === k ? 'selected' : ''}>${ic} ${esc(lb)}</option>`).join('')}</select></label>` : ''}
                ${t === 'tag' ? `<label>Étiquette <input data-bd-str="text" value="${esc(one.text || '')}"></label>` : ''}
                ${t === 'media' && kindOfMedia(media[one.media_id]) === 'image' ? `<label>Légende <input data-bd-str="text" value="${esc(one.text || '')}"></label>` : ''}
                ${(t === 'link' || t === 'screen' || (t === 'media' && kindOfMedia(media[one.media_id]) === 'pdf')) ? `<label class="checkbox-line"><input type="checkbox" data-bd-check="preview" ${one.preview ? 'checked' : ''}> <span>aperçu vivant dans le tableau</span></label>` : ''}
                ${t === 'weblink' ? `<label>Adresse <input data-bd-str="url" value="${esc(one.url || '')}"></label>` : ''}
                <label>Opacité <input type="range" min="10" max="100" value="${Math.round((one?.opacity ?? 1) * 100)}" data-bd-num="opacity"></label>
                <div class="h-bd-actions">
                    ${['folder', 'recueil', 'person', 'link', 'screen', 'weblink', 'media'].includes(t) ? '<button type="button" class="button small" data-bd-act="open">↗ Ouvrir</button>' : ''}
                    <button type="button" class="button small secondary" data-bd-act="duplicate">Dupliquer</button>
                    <button type="button" class="button small secondary" data-bd-act="lock">${l.every(i => i.locked) ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button>
                    ${l.length > 1 ? '<button type="button" class="button small secondary" data-bd-act="group">⧉ Grouper</button>' : ''}${l.some(i => i.group) ? '<button type="button" class="button small secondary" data-bd-act="ungroup">Dégrouper</button>' : ''}
                    <button type="button" class="button small secondary" data-bd-act="front">Devant</button><button type="button" class="button small secondary" data-bd-act="back">Derrière</button>
                    <button type="button" class="button small secondary danger" data-bd-act="delete">Supprimer</button></div>`;
        }
        const setOnSel = (k, v, keep = false) => { if (ro()) return; selItems().forEach(i => { if (k === 'fill' && !['shape', 'note', 'tag', 'folder'].includes(i.type)) return; if (k === 'stroke' && i.type !== 'shape') return; i[k] = v; sigs.delete(i.id); }); render(keep); };
        inspector.addEventListener('click', e => {
            const s = e.target.closest('[data-bd-set]'); if (s) { setOnSel(s.dataset.bdSet, s.dataset.v); commit(); return; }
            const tg = e.target.closest('[data-bd-toggle]'); if (tg) { const k = tg.dataset.bdToggle, v = !selItems()[0]?.[k]; setOnSel(k, v); commit(); return; }
            const tb = e.target.closest('[data-bd-tbl]'); if (tb) { const it = selItems()[0]; if (it?.type !== 'table') return; if (tb.dataset.bdTbl === 'csv') return tableCsv(it); tableOp(it, tb.dataset.bdTbl); return; }
            const cf = e.target.closest('[data-bd-cellfill]'); if (cf && cellSel && !ro()) { const it = byId(cellSel.id); if (!it) return; it.cfill = {...(it.cfill || {})}; const k = cellSel.r + ':' + cellSel.c; if (cf.dataset.bdCellfill === 'transparent') delete it.cfill[k]; else it.cfill[k] = cf.dataset.bdCellfill; sigs.delete(it.id); render(true); commit(); return; }
            const a = e.target.closest('[data-bd-act]'); if (a) { if (a.dataset.bdAct === 'open') return openItem(selItems()[0]); actions[a.dataset.bdAct]?.(); }
        });
        inspector.addEventListener('input', e => {
            if (e.target.matches('[data-bd-num]')) {
                const k = e.target.dataset.bdNum, v = Number(e.target.value); if (!Number.isFinite(v) || e.target.value === '') return;
                inspector.querySelectorAll(`[data-bd-num="${k}"]`).forEach(x => { if (x !== e.target) x.value = v; });
                setOnSel(k, k === 'opacity' ? v / 100 : v, true);
            }
            if (e.target.matches('[data-bd-str]')) { setOnSel(e.target.dataset.bdStr, e.target.value, true); }
            if (e.target.matches('[data-bd-setc]')) { setOnSel(e.target.dataset.bdSetc, e.target.value, true); }
            if (e.target.matches('[data-bd-sel]')) { setOnSel(e.target.dataset.bdSel, e.target.value, true); }
        });
        inspector.addEventListener('change', e => { if (e.target.matches('[data-bd-check]')) setOnSel(e.target.dataset.bdCheck, e.target.checked, true); if (e.target.matches('[data-bd-sel]')) setOnSel(e.target.dataset.bdSel, e.target.value, true); if (e.target.matches('input, select')) commit(); });
        // ── « Ajouter » : tout ce qu'on peut poser ──
        function addMenu() {
            const sc = ext.appScreen;
            const own = Object.entries(ext.customWidgetDefs?.() || {});
            ext.openDialog({eyebrow: 'TABLEAU', title: 'Ajouter au tableau', wide: true, submitLabel: 'Fermer',
                body: `<div class="h-bd-add">
                    <section><h4>📎 Des fichiers</h4><p class="muted">Images, GIF, sons, vidéos, PDF (ou glisse-les sur le tableau, ou colle une image).</p><input type="file" multiple accept="image/*,audio/*,video/*,application/pdf,.aif,.aiff" data-bd-files></section>
                    <section><h4>🖼 Un média de l’app</h4><input type="search" placeholder="Titre, cote…" data-bd-msearch><div class="h-bd-results" data-bd-mres></div></section>
                    <section><h4>🌐 D’ailleurs</h4><label>Adresse d’une image ou d’un site<input data-bd-url placeholder="https://…"></label><button type="button" class="button small" data-bd-addurl>Poser</button></section>
                    <section><h4>👤 Une fiche</h4>${A().collectionPersonField('bd_person', null, 'Nom de la personne')}<button type="button" class="button small" data-bd-addperson>Poser la fiche</button></section>
                    <section><h4>📺 Un écran de l’app</h4><p class="muted">Une liste, un diagramme, une statistique, la carte, un village, une de tes listes…</p>${sc ? sc.select('list:villages', 'data-bd-screen') : ''}<label class="checkbox-line"><input type="checkbox" data-bd-screenprev checked> <span>avec l’aperçu vivant</span></label><button type="button" class="button small" data-bd-addscreen>Poser l’écran</button></section>
                    <section><h4>✨ Un de mes widgets</h4>${own.length ? `<select data-bd-widgetsel>${own.map(([k, d]) => `<option value="${esc(k)}">${esc((d.icon || '🧱') + ' ' + (d.name || 'Mon widget'))}</option>`).join('')}</select><button type="button" class="button small" data-bd-addwidget>Poser le widget</button>` : '<p class="muted">Crée d’abord un widget (Maintenance → Éditeur de widgets).</p>'}</section>
                    <section><h4>📚 Un recueil</h4><input type="search" placeholder="Titre du recueil" data-bd-rsearch><div class="h-bd-results" data-bd-rres></div></section>
                    <section><h4>🏷 Une étiquette</h4><input type="search" placeholder="Étiquette de l’app, ou un mot à toi" data-bd-tsearch><div class="h-bd-results" data-bd-tres></div><button type="button" class="button small" data-bd-addtag>Poser ce mot</button></section>
                    <section><h4>▦ Un tableur</h4><p class="muted">Une grille à remplir, avec des formules (=SOMME…) ; on peut y coller un bout d’Excel ou de Numbers.</p><button type="button" class="button small" data-bd-addtable>Poser un tableur</button></section>
                    <section><h4>📁 Un dossier</h4><p class="muted">Un tableau dans le tableau : double-clic pour y entrer.</p><input data-bd-foldername placeholder="Nom du dossier"><button type="button" class="button small" data-bd-addfolder>Créer le dossier</button></section>
                </div>`,
                onOpen: dlg => {
                    const close = () => dlg.close();
                    dlg.querySelector('[data-bd-files]').addEventListener('change', e => { uploadAndPlace(e.target.files); close(); });
                    const live = (input, box, fn, pick) => { let t = 0; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const q = input.value.trim(); if (q.length < 1) { box.innerHTML = ''; return; } const rows = await fn(q).catch(() => []); box.innerHTML = rows.slice(0, 12).map((r, i) => `<button type="button" data-i="${i}">${r.html}</button>`).join('') || '<small class="muted">Rien trouvé.</small>'; box.querySelectorAll('[data-i]').forEach(bt => bt.addEventListener('click', () => { pick(rows[Number(bt.dataset.i)]); close(); })); }, 250); }); };
                    live(dlg.querySelector('[data-bd-msearch]'), dlg.querySelector('[data-bd-mres]'), async q => ((await api('heritage_media_search', {q})).media || []).map(m => ({m, html: `${esc(m.title || m.filename)} <small class="muted">${esc(m.media_type || '')}</small>`})),
                        async r => { media[r.m.id] = r.m; const k = kindOfMedia(r.m); place({type: 'media', media_id: Number(r.m.id), w: k === 'audio' ? 300 : 280, h: k === 'audio' ? 92 : 200}); });
                    live(dlg.querySelector('[data-bd-rsearch]'), dlg.querySelector('[data-bd-rres]'), async q => ((await api('recueils', {q})).recueils || []).map(r => ({r, html: `${esc((r.icon || '📚') + ' ' + r.title)}`})), r => place({type: 'recueil', recueil_id: Number(r.r.id), title: r.r.title, w: 220, h: 130}));
                    let labels = null;
                    live(dlg.querySelector('[data-bd-tsearch]'), dlg.querySelector('[data-bd-tres]'), async q => { labels = labels || (await api('my_lists')).labels || []; return labels.filter(l => l.name.toLowerCase().includes(q.toLowerCase())).map(l => ({l, html: `<span class="h-bi-tag" style="background:${esc(l.color || '#0066cc')}">🏷 ${esc(l.name)}</span>`})); },
                        r => place({type: 'tag', text: r.l.name, label_id: Number(r.l.id), fill: r.l.color || '#0066cc', color: '#ffffff', w: 160, h: 38}));
                    dlg.querySelector('[data-bd-addtag]').addEventListener('click', () => { const v = dlg.querySelector('[data-bd-tsearch]').value.trim(); if (!v) return; place({type: 'tag', text: v, fill: '#0066cc', color: '#ffffff', w: Math.max(90, v.length * 10 + 50), h: 38}); close(); });
                    dlg.querySelector('[data-bd-addurl]').addEventListener('click', () => { const v = dlg.querySelector('[data-bd-url]').value.trim(); if (!/^https?:\/\//.test(v)) { toast('Une adresse qui commence par https://', 'error'); return; } addUrl(v); close(); });
                    dlg.querySelector('[data-bd-addtable]').addEventListener('click', () => { const t = place(newTable()); sel = new Set([t.id]); cellSel = {id: t.id, r: 0, c: 0}; render(); close(); });
                    dlg.querySelector('[data-bd-addperson]').addEventListener('click', () => { const id0 = Number(dlg.querySelector('[name=bd_person]')?.value) || 0; if (!id0) { toast('Choisis la personne.', 'error'); return; } place({type: 'person', person_id: id0, w: 230, h: 90}); close(); });
                    dlg.querySelector('[data-bd-addscreen]')?.addEventListener('click', () => { const target = dlg.querySelector('[data-bd-screen]').value; if (!sc?.valid(target)) { toast('Choisis un écran (pour une fiche ou une commune, passe par « Une fiche » ou l’Éditeur de widgets).', 'error'); return; } const prev = dlg.querySelector('[data-bd-screenprev]').checked; place({type: 'link', target, title: sc.label(target), preview: prev, w: prev ? 640 : 240, h: prev ? 440 : 110}); close(); });
                    dlg.querySelector('[data-bd-addwidget]')?.addEventListener('click', () => { const target = dlg.querySelector('[data-bd-widgetsel]').value; place({type: 'widget', target, w: 420, h: 320}); close(); });
                    dlg.querySelector('[data-bd-addfolder]').addEventListener('click', async () => {
                        const name = dlg.querySelector('[data-bd-foldername]').value.trim() || 'Dossier';
                        try { const r = await api('save_board', {}, {method: 'POST', body: {title: name, parent_id: b.id, icon: '📁'}}); place({type: 'folder', board_id: Number(r.result?.id || r.id), title: name, w: 200, h: 140, fill: '#f5c542'}); close(); } catch (error) { toast(error.message, 'error'); }
                    });
                },
                onSubmit: () => true,
            });
        }
        // ── en-tête ──
        root.querySelector('[data-bd-title]').addEventListener('input', () => queueSave(true));
        const showLock = () => { const bt = root.querySelector('[data-bd-lockall]'); bt.textContent = boardLocked ? '🔒' : '🔓'; bt.classList.toggle('is-on', boardLocked); bt.title = boardLocked ? 'Tableau verrouillé : clic pour le déverrouiller' : 'Verrouiller tout le tableau'; root.classList.toggle('is-locked', boardLocked); status(boardLocked ? '🔒 Verrouillé' : 'Enregistré ✓'); if (boardLocked) setTool('select'); };
        root.querySelector('[data-bd-lockall]').addEventListener('click', () => { boardLocked = !boardLocked; showLock(); save(); toast(boardLocked ? 'Tableau verrouillé : on peut le regarder et ouvrir ce qu’il contient, rien ne bouge.' : 'Tableau déverrouillé.'); });
        // ── associé à… (une fiche, une enquête, une partie d'enquête, une battue, un projet, un recueil, un autre tableau) ──
        const LINK_KINDS = {person: ['👤', 'Une personne'], investigation: ['🔎', 'Une enquête'], battue: ['🧭', 'Une battue'], atelier_project: ['🛠', 'Un projet de l’Atelier'], recueil: ['📚', 'Un recueil'], board: ['🧩', 'Un autre tableau']};
        function renderLinks() {
            root.querySelector('[data-bd-links]').innerHTML = links.map((l, i) => `<span class="h-bd-link"><button type="button" class="link-button" data-bd-linkgo="${i}" title="Ouvrir">${LINK_KINDS[l.kind]?.[0] || '🔗'} ${esc(l.label || '#' + l.id)}${l.part ? ` · ${esc(l.part)}` : ''}</button><button type="button" class="h-bd-unlink" data-bd-unlink="${i}" title="Ne plus associer" aria-label="Ne plus associer">×</button></span>`).join('')
                + `<button type="button" class="link-button h-bd-linkadd" data-bd-linkadd title="Associer ce tableau à une personne, une enquête (ou une de ses parties), une battue…">🔗 Associer…</button>`;
        }
        renderLinks();
        root.querySelector('[data-bd-links]').addEventListener('click', e => {
            const go0 = e.target.closest('[data-bd-linkgo]'); if (go0) return openLink(links[Number(go0.dataset.bdLinkgo)]);
            const un = e.target.closest('[data-bd-unlink]'); if (un) { if (ro()) return; links.splice(Number(un.dataset.bdUnlink), 1); renderLinks(); save(); return; }
            if (e.target.closest('[data-bd-linkadd]') && !ro()) linkDialog();
        });
        async function openLink(l) {
            if (!l) return; if (dirty) await save();
            const st = S();
            if (l.kind === 'person') { st.currentPersonId = Number(l.id); return A().setModule('personnes'); }
            if (l.kind === 'investigation') { Object.assign(st, {enquetesTab: 'enquetes', currentBattueId: 0, currentInvestigationId: Number(l.id)}); return A().setModule('enquetes'); }
            if (l.kind === 'battue') { Object.assign(st, {enquetesTab: 'battue', currentInvestigationId: 0, currentBattueId: Number(l.id)}); return A().setModule('enquetes'); }
            if (l.kind === 'atelier_project') { st.atelier = {...(st.atelier || {}), project: Number(l.id), sel: []}; Object.assign(st, {enquetesTab: 'atelier', currentInvestigationId: 0, currentBattueId: 0}); return A().setModule('enquetes'); }
            if (l.kind === 'recueil') return ext.openRecueil?.(l.id);
            if (l.kind === 'board') return go(l.id);
        }
        async function linkDialog() {
            const [inv, bat, ate, rec, brd] = await Promise.all([api('research_lists', {kind: 'investigations'}), api('research_lists', {kind: 'battues'}), api('research_lists', {kind: 'atelier'}), api('recueils', {q: ''}), api('boards', {owner_type: 'all'})].map(p => p.catch(() => ({}))));
            const opts = {investigation: inv.rows || [], battue: bat.rows || [], atelier_project: ate.rows || [], recueil: (rec.recueils || []).map(r => ({id: r.id, title: (r.icon || '📚') + ' ' + r.title})), board: (brd.boards || []).filter(r => Number(r.id) !== Number(b.id))};
            ext.openDialog({eyebrow: 'TABLEAU', title: 'Associer ce tableau', submitLabel: 'Associer',
                body: `<div class="form-grid"><label class="span-2">À quoi <select name="kind">${Object.entries(LINK_KINDS).map(([k, [i, lb]]) => `<option value="${k}">${i} ${lb}</option>`).join('')}</select></label>
                    <div class="span-2" data-bd-lperson>${A().collectionPersonField('bd_lperson', null, 'Nom de la personne')}</div>
                    <label class="span-2" data-bd-lother hidden>Laquelle <select name="target"></select></label>
                    <label class="span-2">Partie <small class="muted">(facultatif : piste 1, les témoins, la branche paternelle…)</small><input name="part" maxlength="120"></label>
                    <p class="muted span-2">Le tableau garde son rangement (${esc(b.owner_type ? OWNERS[b.owner_type] : 'libre')}) ; il apparaît en plus là où tu l’associes (sur la fiche de la personne, dans l’enquête…).</p></div>`,
                onOpen: d => {
                    const k = d.querySelector('[name=kind]'), s = d.querySelector('[name=target]');
                    const fill = () => { const isP = k.value === 'person'; d.querySelector('[data-bd-lperson]').hidden = !isP; d.querySelector('[data-bd-lother]').hidden = isP; if (!isP) s.innerHTML = (opts[k.value] || []).map(r => `<option value="${r.id}">${esc(r.title || '#' + r.id)}</option>`).join('') || '<option value="">(aucun pour l’instant)</option>'; };
                    k.addEventListener('change', fill); fill();
                },
                onSubmit: async form => {
                    const kind = form.elements.kind.value, part = form.elements.part.value.trim();
                    let id0 = 0, label = '';
                    if (kind === 'person') { id0 = Number(form.elements.bd_lperson?.value) || 0; if (id0) label = (await personBrief(id0)).name; }
                    else { id0 = Number(form.elements.target.value) || 0; label = (opts[kind] || []).find(r => Number(r.id) === id0)?.title || ''; }
                    if (!id0) { toast('Choisis à quoi associer le tableau.', 'error'); return false; }
                    if (links.some(l => l.kind === kind && Number(l.id) === id0 && (l.part || '') === part)) { toast('Déjà associé.'); return; }
                    links.push({kind, id: id0, label, part}); renderLinks(); await save(); toast('Tableau associé.');
                }});
        }
        // ── instantanés : figer l'état, y revenir, en faire un nouveau tableau ──
        async function snapsDialog() {
            if (dirty) await save();
            let list = []; try { list = (await api('board_snapshots', {board_id: b.id})).snapshots || []; } catch (error) { toast(error.message, 'error'); return; }
            ext.openDialog({eyebrow: 'TABLEAU', title: '📸 Instantanés', wide: true, submitLabel: 'Fermer',
                body: `<div class="h-bd-snaps"><div class="h-bd-snapnew"><input data-bd-snaplabel placeholder="Nom de l’instantané (ex. « avant la visite aux archives »)" maxlength="160"><button type="button" class="button small" data-bd-snaptake>📸 Prendre un instantané</button></div>
                    <p class="muted">Un instantané fige le tableau tel qu’il est. Tu peux y revenir plus tard (l’état actuel est gardé en instantané avant), ou en faire un nouveau tableau à part.</p>
                    <div class="h-bd-snaplist" data-bd-snaplist>${snapRows(list)}</div></div>`, onSubmit: () => true,
                onOpen: d => {
                    d.querySelector('[data-bd-snaptake]').addEventListener('click', async () => {
                        save.lastThumb = 0; await save();
                        try { await api('save_board_snapshot', {}, {method: 'POST', body: {board_id: b.id, label: d.querySelector('[data-bd-snaplabel]').value.trim()}}); d.querySelector('[data-bd-snaplabel]').value = ''; list = (await api('board_snapshots', {board_id: b.id})).snapshots || []; d.querySelector('[data-bd-snaplist]').innerHTML = snapRows(list); toast('Instantané pris.'); } catch (error) { toast(error.message, 'error'); }
                    });
                    d.querySelector('[data-bd-snaplist]').addEventListener('click', async e => {
                        const bt = e.target.closest('[data-bd-snap]'); if (!bt) return;
                        const sid = Number(bt.dataset.id), s0 = list.find(x => x.id === sid);
                        try {
                            if (bt.dataset.bdSnap === 'restore') { if (ro()) return; if (!confirm(`Revenir à « ${s0?.label} » ? L’état actuel est gardé en instantané.`)) return; clearTimeout(saveT); await api('restore_board_snapshot', {}, {method: 'POST', body: {id: sid}}); d.close(); dirty = false; toast('Tableau revenu à l’instantané.'); go(b.id); }
                            if (bt.dataset.bdSnap === 'copy') { d.close(); copyDialog(sid, s0?.label); }
                            if (bt.dataset.bdSnap === 'delete') { if (!confirm(`Supprimer l’instantané « ${s0?.label} » ?`)) return; await api('delete_board_snapshot', {}, {method: 'POST', body: {id: sid}}); list = list.filter(x => x.id !== sid); d.querySelector('[data-bd-snaplist]').innerHTML = snapRows(list); }
                        } catch (error) { toast(error.message, 'error'); }
                    });
                }});
        }
        const snapRows = list => list.length ? list.map(s0 => `<article class="h-bd-snap">${s0.thumb ? `<img src="${esc(s0.thumb)}" alt="">` : '<span class="h-bd-snapblank">🧩</span>'}<div><strong>${esc(s0.label)}</strong><small class="muted">${esc(String(s0.created_at || '').slice(0, 16).replace('T', ' '))} · ${fmt(s0.item_count)} élément${s0.item_count > 1 ? 's' : ''}</small>
            <span class="h-bd-snapacts"><button type="button" class="button small secondary" data-bd-snap="restore" data-id="${s0.id}">↺ Revenir à cet état</button><button type="button" class="button small secondary" data-bd-snap="copy" data-id="${s0.id}">⧉ En faire un tableau</button><button type="button" class="button small secondary danger" data-bd-snap="delete" data-id="${s0.id}" aria-label="Supprimer">🗑</button></span></div></article>`).join('') : '<p class="muted">Pas encore d’instantané.</p>';
        function copyDialog(snapshotId = 0, snapLabel = '') {
            const title0 = root.querySelector('[data-bd-title]').value.trim() || 'Tableau';
            ext.openDialog({eyebrow: 'TABLEAU', title: snapshotId ? 'Nouveau tableau depuis un instantané' : 'Nouveau tableau à partir de celui-ci', submitLabel: 'Créer le tableau',
                body: `<div class="form-grid"><label class="span-2">Nom du nouveau tableau<input name="title" value="${esc(snapshotId ? `${title0} — ${snapLabel}` : `${title0} (copie)`)}" maxlength="160" required></label>
                    <label class="checkbox-line span-2"><input type="checkbox" name="keep" checked> <span>même rangement (${esc(b.owner_type ? `${OWNERS[b.owner_type]} : ${b.owner_label || ''}` : 'libre')}) et mêmes associations</span></label>
                    <p class="muted span-2">${snapshotId ? 'Le contenu de l’instantané' : 'Tout le contenu actuel'} est recopié dans un tableau à part ; l’original ne change pas. Les dossiers posés dedans restent ceux de l’original.</p></div>`,
                onSubmit: async form => {
                    if (dirty) await save();
                    try { const r = await api('copy_board', {}, {method: 'POST', body: {id: b.id, snapshot_id: snapshotId || 0, title: form.elements.title.value.trim(), keep_owner: form.elements.keep.checked}}); const nid = Number(r.result?.id || r.id);
                        toast('Nouveau tableau créé.'); go(nid); } catch (error) { toast(error.message, 'error'); }
                }});
        }
        root.querySelector('[data-bd-snaps]').addEventListener('click', snapsDialog);
        root.querySelector('[data-bd-copy]').addEventListener('click', () => copyDialog());
        root.querySelector('[data-bd-state]').addEventListener('change', () => { save(); toast('État du tableau changé.'); });
        root.querySelector('[data-bd-delete]').addEventListener('click', () => deleteBoard(b.id, root.querySelector('[data-bd-title]').value, async () => { dirty = false; go(b.parent_id || 0); }));
        root.querySelector('[data-bd-bg]').addEventListener('change', e => { bg = e.target.value; stage.dataset.bg = bg; queueSave(true); });
        root.querySelector('[data-bd-undo]').addEventListener('click', () => restore(hpos - 1));
        root.querySelector('[data-bd-redo]').addEventListener('click', () => restore(hpos + 1));
        root.querySelector('[data-bd-full]').addEventListener('click', () => { root.classList.toggle('is-full'); setTimeout(applyView, 50); });
        root.querySelector('[data-bd-png]').addEventListener('click', async () => { const url = await thumbnail(0, 0, 2); if (!url) { toast('Image impossible (une image d’un autre site l’empêche).', 'error'); return; } const a = document.createElement('a'); a.href = url; a.download = (root.querySelector('[data-bd-title]').value || 'tableau') + '.png'; document.body.appendChild(a); a.click(); a.remove(); });
        root.querySelector('[data-bd-close]').addEventListener('click', async () => { if (dirty) await save(); go(0); });
        root.querySelectorAll('[data-bd-open]').forEach(x => x.addEventListener('click', async () => { if (dirty) await save(); go(Number(x.dataset.bdOpen)); }));
        root.querySelector('[data-bd-place]').addEventListener('click', () => placeDialog(ownerData, async () => { await save(); go(b.id); }));
        // quitter : on enregistre ; on enlève les écoutes du document
        const obs = new MutationObserver(() => { if (!root.isConnected) { obs.disconnect(); window.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('paste', onPaste); if (dirty) save(); } });
        obs.observe(document.getElementById('workspace') || document.body, {childList: true});
        window.addEventListener('beforeunload', () => { if (dirty) save(); });
        setTool('select'); applyView(); render(); history = [snap()]; hpos = 0; showLock();
        if (!b.data?.view && items.length) fitAll();
        root.focus();
        return {save};
    }

    /* ═════════ Supprimer un tableau (et ses dossiers) ═════════ */
    async function deleteBoard(id, title, done) {
        if (!confirm(`Supprimer le tableau « ${title || 'sans titre'} » et tous ses dossiers ? Les photos, sons et fiches posés dessus restent dans l’app.`)) return;
        try { const r = await api('delete_board', {}, {method: 'POST', body: {id}}); toast(Number(r.result?.deleted || r.deleted) > 1 ? 'Tableau et dossiers supprimés.' : 'Tableau supprimé.'); done?.(); }
        catch (error) { toast(error.message, 'error'); }
    }
    document.addEventListener('click', e => {
        const d = e.target.closest?.('[data-bd-del]'); if (!d) return;
        e.preventDefault(); e.stopPropagation();
        deleteBoard(Number(d.dataset.bdDel), d.dataset.title, () => { const host = d.closest('[data-board-host]'); if (host) { host.removeAttribute('data-bd-filled'); host.innerHTML = ''; } else if (S().module === 'listes') A().setModule('listes'); else ext.boards(++S().workspaceToken); });
    }, true);

    /* ═════════ Rangement d'un tableau : libre, enquête, battue, atelier, et sa partie ═════════ */
    async function placeDialog(o, done) {
        const [inv, bat, ate] = await Promise.all([api('research_lists', {kind: 'investigations'}), api('research_lists', {kind: 'battues'}), api('research_lists', {kind: 'atelier'})].map(p => p.catch(() => ({rows: []}))));
        const opts = {investigation: inv.rows, battue: bat.rows, atelier_project: ate.rows};
        ext.openDialog({eyebrow: 'TABLEAU', title: 'Ranger le tableau', submitLabel: 'Ranger',
            body: `<div class="form-grid"><label>Où <select name="owner_type">${Object.entries(OWNERS).map(([k, l]) => `<option value="${k}" ${o.owner_type === k ? 'selected' : ''}>${OWNER_ICONS[k]} ${l}</option>`).join('')}</select></label>
                <label data-bd-ownerbox>Laquelle <select name="owner_id"></select></label>
                <label class="span-2">Partie <small class="muted">(facultatif : pour avoir plusieurs tableaux, « Piste 1 », « Les témoins »…)</small><input name="part" value="${esc(o.part || '')}"></label></div>`,
            onOpen: d => {
                const t = d.querySelector('[name=owner_type]'), s = d.querySelector('[name=owner_id]'), box = d.querySelector('[data-bd-ownerbox]');
                const fill = () => { const rows = opts[t.value] || []; box.hidden = !t.value; s.innerHTML = rows.map(r => `<option value="${r.id}" ${Number(o.owner_id) === Number(r.id) ? 'selected' : ''}>${esc(r.title || '#' + r.id)}</option>`).join('') || '<option value="">(aucune)</option>'; };
                t.addEventListener('change', fill); fill();
            },
            onSubmit: form => { o.owner_type = form.elements.owner_type.value; o.owner_id = Number(form.elements.owner_id.value) || 0; o.part = form.elements.part.value.trim(); if (o.owner_type && !o.owner_id) o.owner_type = ''; done(); },
        });
    }

    /* ═════════ Enquêtes → Tableaux : la galerie, ou un tableau ouvert ═════════ */
    const TEMPLATES = [
        ['blank', '⬜', 'Vide', 'Une toile libre.', () => []],
        ['clues', '📌', 'Mur d’indices', 'Fond de liège, une question au centre, des notes autour.', () => [{type: 'note', text: 'La question', x: 300, y: 200, w: 240, h: 160, fill: '#ffd6a5', fs: 22, bold: true}, ...['Ce qu’on sait', 'Ce qui manque', 'Pistes', 'Sources à voir'].map((t, i) => ({type: 'note', text: t, x: [0, 600, 0, 600][i], y: [0, 0, 400, 400][i], w: 200, h: 160, fill: NOTE_COLORS[i + 1], fs: 18}))], 'cork'],
        ['mind', '🧠', 'Carte mentale', 'Une idée au centre, des branches.', () => { const c = {id: 'c', type: 'shape', shape: 'ellipse', text: 'Idée centrale', x: 320, y: 220, w: 240, h: 130, fill: '#bde0fe', stroke: '#1d3557', sw: 2, fs: 22, bold: true}; const kids = [[0, 0], [700, 0], [0, 460], [700, 460]].map(([x, y], i) => ({id: 'k' + i, type: 'shape', shape: 'round', text: 'Branche ' + (i + 1), x, y, w: 200, h: 90, fill: '#caffbf', stroke: '#2d6a4f', sw: 2, fs: 18})); return [c, ...kids, ...kids.map(k => ({type: 'line', from: 'c', to: k.id, points: [[0, 0], [0, 0]], color: '#555', sw: 2}))]; }],
        ['timeline', '🗓️', 'Frise', 'Une flèche du temps et des repères.', () => [{type: 'line', points: [[0, 300], [1400, 300]], color: '#111', sw: 4, arrowEnd: true}, ...[0, 1, 2, 3, 4].map(i => ({type: 'note', text: 'Date ' + (i + 1), x: 40 + i * 280, y: i % 2 ? 340 : 120, w: 200, h: 140, fill: NOTE_COLORS[i % NOTE_COLORS.length], fs: 17}))]],
        ['family', '👪', 'Arbre à la main', 'Des cases pour une famille, à relier.', () => [{type: 'text', text: 'Arbre à la main', x: 0, y: 0, w: 400, h: 40, fs: 28, bold: true}, ...[['Père', 100, 100], ['Mère', 420, 100], ['Enfant', 260, 330]].map(([t, x, y], i) => ({id: 'f' + i, type: 'shape', shape: 'round', text: t, x, y, w: 220, h: 90, fill: '#f1f1f1', stroke: '#444', sw: 2, fs: 18})), {type: 'line', from: 'f0', to: 'f2', points: [[0, 0], [0, 0]], color: '#444', sw: 2}, {type: 'line', from: 'f1', to: 'f2', points: [[0, 0], [0, 0]], color: '#444', sw: 2}]],
    ];
    async function newBoard(owner = {}) {
        ext.openDialog({eyebrow: 'TABLEAUX', title: 'Nouveau tableau', submitLabel: 'Créer',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" placeholder="Qui est le père de Marie ?" required></label>${owner.owner_type ? `<label class="span-2">Partie <small class="muted">(facultatif)</small><input name="part" placeholder="Piste 1, les témoins…"></label>` : ''}</div>
                <h4>Pour commencer</h4><div class="h-bd-templates">${TEMPLATES.map(([k, i, l, h], n) => `<label class="h-bd-tpl"><input type="radio" name="tpl" value="${k}" ${n ? '' : 'checked'}><span class="h-bd-tplicon">${i}</span><strong>${esc(l)}</strong><small>${esc(h)}</small></label>`).join('')}</div>`,
            onSubmit: async form => {
                const title = form.elements.title.value.trim() || 'Tableau sans titre';
                const tpl = TEMPLATES.find(t => t[0] === form.elements.tpl.value) || TEMPLATES[0];
                const its = tpl[4]().map((it, i) => ({id: it.id || uid(), z: i, w: 120, h: 80, x: 0, y: 0, ...it}));
                const r = await api('save_board', {}, {method: 'POST', body: {title, part: form.elements.part?.value?.trim() || '', owner_type: owner.owner_type || '', owner_id: owner.owner_id || 0, data: {items: its, bg: tpl[5] || 'dots'}}});
                go(Number(r.result?.id || r.id));
            },
        });
    }
    function go(id) {
        const st = S();
        st.currentBoardId = Number(id) || 0; st.enquetesTab = 'tableaux'; st.currentInvestigationId = 0; st.currentBattueId = 0;
        // colonne de gauche comprise (onglet Tableaux), même si on était déjà dans Enquêtes
        if (st.module !== 'enquetes' || document.querySelector('.enquetes-tab-btn.is-active[data-enquetes-tab]')?.dataset.enquetesTab !== 'tableaux') return A().setModule('enquetes');
        ext.boards(++st.workspaceToken);
    }
    ext.openBoardById = go;
    const STATES = {open: 'En cours', paused: 'En pause', closed: 'Terminé'};
    const cardHtml = r => `<div class="h-bd-cardwrap"><button type="button" class="h-bd-del" data-bd-del="${r.id}" data-title="${esc(r.title)}" title="Supprimer ce tableau">🗑</button><button type="button" class="h-bd-card ${r.status && r.status !== 'open' ? 'is-' + r.status : ''}" data-bd-go="${r.id}"><span class="h-bd-thumb">${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span>${esc(r.icon || '🧩')}</span>`}</span>
        <span class="h-bd-cardinfo"><strong>${esc(r.title)}</strong><small>${OWNER_ICONS[r.owner_type] || '🧩'} ${esc(r.owner_type ? (r.owner_label || OWNERS[r.owner_type]) : 'Libre')}${r.part ? ` · ${esc(r.part)}` : ''}</small><small class="muted">${r.status && r.status !== 'open' ? `<span class="h-bd-state is-${r.status}">${STATES[r.status]}</span> · ` : ''}${fmt(r.item_count)} élément${r.item_count > 1 ? 's' : ''}${Number(r.sub_count) ? ` · ${fmt(r.sub_count)} dossier${r.sub_count > 1 ? 's' : ''}` : ''}</small></span></button></div>`;
    ext.boards = async token => {
        const st = S(), ws = A().$('#workspace');
        if (st.currentBoardId) {
            ws.innerHTML = '<div class="h-board-host"></div>';
            await openBoard(st.currentBoardId, ws.querySelector('.h-board-host'));
            return;
        }
        let data; try { data = await api('boards', {owner_type: st.boardsFilter || 'all', q: st.boardsQ || '', status: st.boardsStatus && st.boardsStatus !== 'all' ? st.boardsStatus : undefined}); } catch (error) { toast(error.message, 'error'); return; }
        if (token !== st.workspaceToken || st.module !== 'enquetes') return;
        const rows = data.boards || [];
        ws.innerHTML = `<section class="page h-boards"><header class="page-header"><div><span class="eyebrow">ENQUÊTES</span><h2>Tableaux</h2><p>Une toile libre, comme un grand tableau de liège : on y pose des notes, des formes, des flèches, des dessins, des photos, des sons, des PDF, des fiches, des écrans de l’app… Chaque tableau peut être libre ou rangé dans une enquête, une battue ou un projet de l’Atelier.</p></div><div class="page-actions"><button type="button" class="button" data-bd-new>🧩 + Nouveau tableau</button></div></header>
            ${rows.length ? `<div class="h-bd-grid">${rows.map(cardHtml).join('')}</div>` : A().empty(st.boardsQ || (st.boardsFilter && st.boardsFilter !== 'all') ? 'Aucun tableau ici.' : 'Aucun tableau pour l’instant. « + Nouveau tableau » : vide, mur d’indices, carte mentale, frise…')}</section>`;
        ws.querySelector('[data-bd-new]').addEventListener('click', () => newBoard());
        ws.querySelectorAll('[data-bd-go]').forEach(x => x.addEventListener('click', () => go(Number(x.dataset.bdGo))));
    };
    ext.boardsSidebar = (content, footer, tabs, signal) => {
        const st = S();
        content.innerHTML = `${tabs}<p class="enquetes-tab-help">Des toiles libres pour chercher, relier, montrer : notes, flèches, photos, sons, fiches…</p>
            <div class="search-box"><label for="boards-search">Rechercher un tableau</label><div class="search-row"><input id="boards-search" value="${esc(st.boardsQ || '')}" placeholder="Titre, partie…"><button type="button">⌕</button></div></div>
            <div class="side-menu">${[['all', '01', 'Tous'], ['free', '02', 'Libres'], ['investigation', '03', 'Dans une enquête'], ['battue', '04', 'Dans une battue'], ['atelier_project', '05', 'Dans l’Atelier']].map(([v, i, l]) => `<button class="side-menu-item ${(st.boardsFilter || 'all') === v ? 'is-active' : ''}" data-bd-filter="${v}"><span class="side-number">${i}</span>${l}</button>`).join('')}</div>
            <div class="side-menu h-bd-statusmenu">${[['all', 'É1', 'Toutes les états'.replace('Toutes les états', 'Tous les états')], ['open', 'É2', 'En cours'], ['paused', 'É3', 'En pause'], ['closed', 'É4', 'Terminés']].map(([v, i, l]) => `<button class="side-menu-item ${(st.boardsStatus || 'all') === v ? 'is-active' : ''}" data-bd-status="${v}"><span class="side-number">${i}</span>${l}</button>`).join('')}</div>`;
        footer.innerHTML = '<button class="button small" id="new-board">+ Nouveau tableau</button>';
        footer.querySelector('#new-board').addEventListener('click', () => newBoard());
        content.addEventListener('click', e => { const s0 = e.target.closest('[data-bd-status]'); if (s0) { st.boardsStatus = s0.dataset.bdStatus; st.currentBoardId = 0; content.querySelectorAll('[data-bd-status]').forEach(x => x.classList.toggle('is-active', x === s0)); ext.boards(++st.workspaceToken); return; } }, {signal});
        content.addEventListener('click', e => { const f = e.target.closest('[data-bd-filter]'); if (f) { st.boardsFilter = f.dataset.bdFilter; st.currentBoardId = 0; content.querySelectorAll('[data-bd-filter]').forEach(x => x.classList.toggle('is-active', x === f)); ext.boards(++st.workspaceToken); } }, {signal});
        let t = 0; content.querySelector('#boards-search').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.boardsQ = e.target.value; st.currentBoardId = 0; ext.boards(++st.workspaceToken); }, 300); });
    };

    /* ═════════ Dans une enquête, une battue, un projet : ses tableaux ═════════ */
    async function fillHost(box) {
        box.dataset.bdFilled = '1';
        const owner_type = box.dataset.boardOwner, owner_id = Number(box.dataset.boardKey);
        // ses tableaux, et ceux qui lui sont associés depuis un autre rangement
        let rows = []; try { rows = (await api('boards_linked', {kind: owner_type, id: owner_id})).boards || []; } catch (_) {}
        box.innerHTML = `<section class="h-bd-host"><div class="h-panel-head"><h3>🧩 Tableaux <small class="muted">${rows.length || ''}</small></h3><button type="button" class="button small secondary" data-bd-hostnew>+ Nouveau tableau ici</button></div>
            ${rows.length ? `<div class="h-bd-grid is-small">${rows.map(cardHtml).join('')}</div>` : '<p class="muted">Un tableau libre pour cette recherche : notes, flèches, photos, fiches… Tu peux en faire plusieurs (une « partie » chacun).</p>'}</section>`;
        box.querySelector('[data-bd-hostnew]').addEventListener('click', () => newBoard({owner_type, owner_id}));
        box.querySelectorAll('[data-bd-go]').forEach(x => x.addEventListener('click', () => go(Number(x.dataset.bdGo))));
    }
    const placeHosts = () => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        // enquête et projet : à côté de leurs recueils ; battue : sous son en-tête
        ws.querySelectorAll('[data-rc-host][data-rc-type="investigation"], [data-rc-host][data-rc-type="atelier_project"]').forEach(rc => {
            const type = rc.dataset.rcType, key = rc.dataset.rcKey;
            if (!rc.parentElement.querySelector(`:scope > [data-board-host][data-board-key="${CSS.escape(key)}"]`)) rc.insertAdjacentHTML('beforebegin', `<div data-board-host data-board-owner="${type}" data-board-key="${esc(key)}"></div>`);
        });
        const bat = ws.querySelector('.battue-detail');
        if (bat && S().currentBattueId && !bat.querySelector('[data-board-host]')) bat.querySelector(':scope > header')?.insertAdjacentHTML('afterend', `<div data-board-host data-board-owner="battue" data-board-key="${Number(S().currentBattueId)}"></div>`);
        ws.querySelectorAll('[data-board-host]:not([data-bd-filled])').forEach(fillHost);
    };
    let hostT = 0;
    new MutationObserver(() => { clearTimeout(hostT); hostT = setTimeout(placeHosts, 120); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ Listes : Enquêtes, Battues, Projets de l'Atelier, Tableaux ═════════ */
    const STATUS = {open: 'En cours', paused: 'En pause', closed: 'Terminée', active: 'En cours', done: 'Terminé', archived: 'Archivé', promising: 'Prometteuse'};
    const listPage = async (token, kind) => {
        const st = S();
        const conf = {
            investigations_list: ['Enquêtes', 'investigations', [['Enquête', r => `<button type="button" class="table-link" data-bd-inv="${r.id}">${esc(r.title)}</button>`, r => r.title], ['Personne', r => r.person_id ? `<button type="button" class="table-link" data-h-person="${r.person_id}">${esc(r.person)}</button>` : '', r => r.person], ['État', r => esc(STATUS[r.status] || r.status), r => r.status], ['Pistes', r => fmt(r.items) + (Number(r.promising) ? ` <small class="muted">(${fmt(r.promising)} prometteuses)</small>` : ''), r => Number(r.items)], ['Médias', r => fmt(r.media), r => Number(r.media)], ['Tableaux', r => fmt(r.boards), r => Number(r.boards)], ['Modifiée', r => esc(String(r.updated_at || '').slice(0, 10)), r => r.updated_at]]],
            battues_list: ['Battues', 'battues', [['Battue', r => `<button type="button" class="table-link" data-bd-bat="${r.id}">${esc(r.title)}</button>`, r => r.title], ['Cherché', r => esc([r.target_type, r.target_text].filter(Boolean).join(' · ')), r => r.target_type], ['État', r => esc(STATUS[r.status] || r.status), r => r.status], ['Communes faites', r => `${fmt(r.done)} / ${fmt(r.communes)}`, r => Number(r.done)], ['Recherches', r => fmt(r.searches), r => Number(r.searches)], ['Tableaux', r => fmt(r.boards), r => Number(r.boards)], ['Modifiée', r => esc(String(r.updated_at || '').slice(0, 10)), r => r.updated_at]]],
            atelier_list: ['Projets de l’Atelier', 'atelier', [['Projet', r => `<button type="button" class="table-link" data-bd-ate="${r.id}">${esc((r.icon || '📚') + ' ' + r.title)}</button>`, r => r.title], ['Sorte', r => esc(r.kind), r => r.kind], ['État', r => esc(STATUS[r.status] || r.status), r => r.status], ['Éléments', r => fmt(r.items), r => Number(r.items)], ['Dossiers', r => fmt(r.folders), r => Number(r.folders)], ['Échéance', r => esc(r.deadline || ''), r => r.deadline], ['Tableaux', r => fmt(r.boards), r => Number(r.boards)]]],
        }[kind];
        let rows;
        if (kind === 'boards_list') { try { rows = (await api('boards', {owner_type: 'all'})).boards || []; } catch (e) { toast(e.message, 'error'); return; } }
        else { try { rows = (await api('research_lists', {kind: conf[1]})).rows || []; } catch (e) { toast(e.message, 'error'); return; } }
        if (token !== st.workspaceToken || st.module !== 'listes') return;
        const cols = kind === 'boards_list' ? [['Tableau', r => `<button type="button" class="table-link" data-bd-go="${r.id}">${esc((r.icon || '🧩') + ' ' + r.title)}</button>`, r => r.title], ['Rangé dans', r => `${OWNER_ICONS[r.owner_type] || '🧩'} ${esc(r.owner_type ? r.owner_label || OWNERS[r.owner_type] : 'Libre')}`, r => r.owner_label], ['Partie', r => esc(r.part), r => r.part], ['Éléments', r => fmt(r.item_count), r => Number(r.item_count)], ['Dossiers', r => fmt(r.sub_count), r => Number(r.sub_count)], ['Modifié', r => esc(String(r.updated_at || '').slice(0, 10)), r => r.updated_at]] : conf[2];
        const title = kind === 'boards_list' ? 'Tableaux' : conf[0];
        st.bdListSort = st.bdListSort || {};
        const sort = st.bdListSort[kind] || {i: -1, dir: 1};
        if (sort.i >= 0) { const f = cols[sort.i][2]; rows = [...rows].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'fr')) * sort.dir; }); }
        A().$('#workspace').innerHTML = `<section class="page"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>${esc(title)}</h2><p>${fmt(rows.length)} ligne${rows.length > 1 ? 's' : ''}. Un clic sur un titre l’ouvre ; un clic sur une colonne trie.</p></div></header>
            ${rows.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr>${cols.map(([h], i) => `<th><button type="button" data-bd-sort="${i}">${esc(h)}${sort.i === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : A().empty('Rien pour l’instant.')}</section>`;
        const ws = A().$('#workspace');
        A().bindTableLinks?.();
        ws.querySelectorAll('[data-bd-sort]').forEach(x => x.addEventListener('click', () => { const i = Number(x.dataset.bdSort); st.bdListSort[kind] = {i, dir: sort.i === i ? -sort.dir : 1}; listPage(++st.workspaceToken, kind); }));
        ws.querySelectorAll('[data-bd-go]').forEach(x => x.addEventListener('click', () => go(Number(x.dataset.bdGo))));
        ws.querySelectorAll('[data-bd-inv]').forEach(x => x.addEventListener('click', () => { Object.assign(st, {enquetesTab: 'enquetes', currentBattueId: 0, currentInvestigationId: Number(x.dataset.bdInv)}); A().setModule('enquetes'); }));
        ws.querySelectorAll('[data-bd-bat]').forEach(x => x.addEventListener('click', () => { Object.assign(st, {enquetesTab: 'battue', currentInvestigationId: 0, currentBattueId: Number(x.dataset.bdBat)}); A().setModule('enquetes'); }));
        ws.querySelectorAll('[data-bd-ate]').forEach(x => x.addEventListener('click', () => { st.atelier = {...(st.atelier || {}), project: Number(x.dataset.bdAte), sel: []}; Object.assign(st, {enquetesTab: 'atelier', currentInvestigationId: 0, currentBattueId: 0}); A().setModule('enquetes'); }));
    };
    for (const k of ['investigations_list', 'battues_list', 'atelier_list', 'boards_list']) ext.lists[k] = token => listPage(token, k);
    // bloc de la fiche d'une personne : les tableaux qui lui sont associés
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.boards = (index, detail) => {
        const list = detail.heritage?.boards || [];
        if (!list.length) return '';
        return A().card(index, '🧩 Tableaux', list.length, `<div class="h-bd-grid is-small h-bd-personblock">${list.map(r => cardHtml({...r, part: [r.part, ...(r.parts || [])].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ')}).replace('class="h-bd-del"', 'class="h-bd-del" hidden')).join('')}</div>`, 'span-12');
    };
    document.addEventListener('click', e => {
        const g = e.target.closest?.('.h-bd-personblock [data-bd-go]'); if (!g) return;
        go(Number(g.dataset.bdGo));
    });
    ext.boardsInternals = {shapePath, smooth, tableValues, drawSvg, ribbon}; // pour les essais
})();
