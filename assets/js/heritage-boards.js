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
    /** Une police sûre pour le style (lettres, chiffres, espaces, virgules, tirets, apostrophes) */
    const cssFont = f => { const v = String(f || '').replace(/[^\w\s,'\-À-ÿ.]/g, '').trim(); return v ? (v.includes(',') || /^(serif|sans-serif|monospace|cursive|system-ui|inherit)$/.test(v) ? v : `'${v.replace(/'/g, '')}', sans-serif`) : 'inherit'; };
    /** Un PDF d'une page avec une image JPEG (taille A4 ou A4 paysage, image ajustée) */
    function jpegPdf(dataUrl, w, h, title) {
        const bin = atob(dataUrl.split(',')[1]), land = w > h, PW = land ? 842 : 595, PH = land ? 595 : 842, m = 28, k = Math.min((PW - 2 * m) / w, (PH - 2 * m) / h), dw = w * k, dh = h * k, dx = (PW - dw) / 2, dy = (PH - dh) / 2;
        const enc = new TextEncoder(), parts = [], offs = [];
        let len = 0; const push = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
        const img = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
        const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q`;
        const safeTitle = String(title || 'Tableau').replace(/[^\x20-\x7e]/g, '_').replace(/[()\\]/g, '');
        push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
        const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
        obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
        obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
        obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
        obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
        obj(6, () => push(`<< /Title (${safeTitle}) /Producer (LCNDA) >>`));
        const xref = len;
        push(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
        return new Blob(parts, {type: 'application/pdf'});
    }
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
            const noSp = t => t.replace(/"[^"]*"|\s+/g, m => m.startsWith('"') ? m : '');
            if (noSp(toks.join('')) !== noSp(src)) throw new Error('syntaxe');
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
    /** La grille d'un tableur, avec les cellules fusionnées (rowspan / colspan) */
    function tableHtml(it) {
        const cells = it.cells?.length ? it.cells : [['']], vals = tableValues(cells), nrow = cells.length, ncol = Math.max(...cells.map(r => r.length)), cw = Array.from({length: ncol}, (_, c) => it.colw?.[c] || 100), tot = cw.reduce((s0, x) => s0 + x, 0);
        const cover = new Map(); // "r:c" → la fusion qui commence ici, ou true si la cellule est couverte
        for (const m of it.merges || []) { if (m.r >= nrow || m.c >= ncol) continue; const rs = Math.min(m.rs, nrow - m.r), cs = Math.min(m.cs, ncol - m.c); for (let r = m.r; r < m.r + rs; r++) for (let c = m.c; c < m.c + cs; c++) cover.set(r + ':' + c, r === m.r && c === m.c ? {rs, cs} : true); }
        return `<div class="h-bi-table${it.stripes ? ' is-striped' : ''}" style="font-size:${it.fs || 14}px;color:${it.color || '#111'};font-family:${esc(cssFont(it.font))};font-weight:${it.weight || (it.bold ? 700 : 400)};font-style:${it.italic ? 'italic' : 'normal'};text-decoration:${[it.underline && 'underline', it.strike && 'line-through'].filter(Boolean).join(' ') || 'none'};${['left', 'center', 'right', 'justify'].includes(it.align) ? `--ta:${it.align};` : ''}--hf:${it.hfill || '#e8eef7'}"><table><colgroup>${cw.map(w => `<col style="width:${(w / tot * 100).toFixed(2)}%">`).join('')}</colgroup><tbody>${cells.map((row, r) => `<tr style="height:${(100 / nrow).toFixed(3)}%">${Array.from({length: ncol}, (_, c) => {
            const cv = cover.get(r + ':' + c); if (cv === true) return '';
            const v = vals[r][c], isHead = (it.header && r === 0) || (it.hcol && c === 0), raw = String(row[c] ?? ''), shown = raw.startsWith('=') ? showVal(v) : raw;
            return `<td data-r="${r}" data-c="${c}"${cv ? ` rowspan="${cv.rs}" colspan="${cv.cs}"` : ''} class="${isHead ? 'is-head' : ''}${typeof v === 'number' ? ' is-num' : ''}${raw.startsWith('=') ? ' is-formula' : ''}${String(v).startsWith('#') && raw.startsWith('=') ? ' is-err' : ''}${cv ? ' is-merged' : ''}"${it.cfill?.[r + ':' + c] ? ` style="background:${it.cfill[r + ':' + c]}"` : ''}>${esc(shown)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
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
        const hard = it.hard ?? 100;
        if (hard < 100 && (it.sw || 3) > 0) { const sd = ((it.sw || 3) * (100 - hard) / 220).toFixed(2), fid = 'bdh-' + String(it.id || 'x').replace(/[^\w-]/g, ''); return `<defs><filter id="${fid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}"/></filter></defs><g filter="url(#${fid})">${drawSvg({...it, hard: 100})}</g>`; }
        const pts = it.points || [], c = it.color || '#111', sw = it.sw || 3, b = it.brush || 'pen';
        const da = it.dash ? `stroke-dasharray="${dashArray(it.dash, sw)}"` : '';
        const stroke = (d, extra = '', cap = 'round') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="${cap}" stroke-linejoin="round" ${da} ${extra}/>`;
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
    const headOf = (l, side) => { const v = side === 'start' ? l.headStart : l.headEnd; if (v) return (KIT().headExists ? KIT().headExists(v) : v === 'none' || v === 'triangle') ? v : 'triangle'; return (side === 'start' ? l.arrowStart : l.arrowEnd) ? 'triangle' : 'none'; };
    const headSize = l => Math.max(10, (l.sw || 2) * 3);
    // les pointes viennent des réglages des tableaux (heritage-board-kit.js) : celles de l'app et celles qu'on a créées
    const HEAD_SVG = new Proxy({}, {get: (_, k) => c => KIT().headSvg ? KIT().headSvg(String(k), c) : `<path d="M0,0 L10,5 L0,10 z" fill="${c}"/>`});
    const HEAD_REF = new Proxy({}, {get: (_, k) => KIT().headRef ? KIT().headRef(String(k)) : 8});
    // pistes d'enquête : une note à vérifier, confirmée ou fausse
    const HYP = {todo: ['❓', 'À vérifier', '#ffe8a3', '#e0a100'], ok: ['✅', 'Confirmée', '#c7f0c2', '#2b8a3e'], no: ['❌', 'Fausse', '#f6c3c3', '#c92a2a']};
    const HEADS_LIST = new Proxy([], {get: (t, k) => { const l = (KIT().allHeads?.() || ['none', 'triangle']).map(h => [h, KIT().headName?.(h) || h]); const v = l[k]; return typeof v === 'function' ? v.bind(l) : v; }});
    const LINE_PATHS = [['straight', '— droit'], ['curve', '⌒ courbe'], ['elbow', '⌐ coudé'], ['wave', '∿ vague'], ['zigzag', '⩘ zigzag'], ['avoid', '⤳ contourne les éléments']];
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
    const KIT = () => ext.boardKit || {prefs: () => ({}), palette: () => [], shapeByKey: () => null};
    const pal = cat => { const l = KIT().palette?.(cat) || []; return l.length ? l : ({note: NOTE_COLORS, fill: ['transparent', ...COLORS.slice(2), '#bde0fe', '#fff3a3', '#caffbf'], stroke: ['transparent', ...COLORS]}[cat] || COLORS); };
    const P = () => KIT().prefs();
    /** Le dessin d'une forme dans sa boîte w × h : formes de la bibliothèque (chemins 100 × 100), formes à soi, arrondi réglable */
    const shapePath = (s, w, h, it = {}) => {
        const pts = arr => 'M' + arr.map(p => p.join(',')).join(' L') + ' Z';
        const r = it.radius !== undefined ? Math.min(Number(it.radius) || 0, w / 2, h / 2) : null;
        if (s === 'rect' && r) return `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}"/>`;
        if (s === 'round') return `<rect x="0" y="0" width="${w}" height="${h}" rx="${r ?? Math.min(w, h) * .18}"/>`;
        const lib = it.svgpath ? {d: it.svgpath, eo: it.eo} : (['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'bubble', 'cloud'].includes(s) ? null : KIT().shapeByKey?.(s));
        if (lib?.d) { const bx = lib.s || 100; return `<path d="${lib.d}" transform="scale(${w / bx} ${h / bx})" ${lib.eo ? 'fill-rule="evenodd"' : ''} vector-effect="non-scaling-stroke"/>`; }
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
    /* Les fiches posées : lues ensemble (une requête pour toutes), relues à chaque ouverture du tableau (elles suivent les fiches) */
    const personCache = new Map(), fullCache = new Map(), pq = new Map();
    let pqT = 0;
    const missingPerson = id => ({id, name: 'Fiche #' + id, missing: true, parents: [], partners: [], children: [], events: []});
    function personData(id, full = false) {
        id = Number(id); const cache = full ? fullCache : personCache;
        if (cache.has(id)) return cache.get(id);
        if (full) { const pr = api('board_people', {ids: String(id), events: '1'}).then(d => d.people?.[id] || missingPerson(id)).catch(() => missingPerson(id)); cache.set(id, pr); return pr; }
        let res; const pr = new Promise(r => { res = r; }); cache.set(id, pr); pq.set(id, res);
        clearTimeout(pqT); pqT = setTimeout(async () => {
            const batch = new Map(pq); pq.clear(); let data = {};
            try { data = (await api('board_people', {ids: [...batch.keys()].join(',')})).people || {}; } catch (_) {}
            for (const [i, r] of batch) r(data[i] || missingPerson(i));
        }, 15);
        return pr;
    }
    const yearsOf = d => { const b = d.birth?.year || (d.birth?.date || '').match(/\d{4}/)?.[0] || '', x = d.death?.year || (d.death?.date || '').match(/\d{4}/)?.[0] || ''; return b || x ? `${b || '?'} – ${x || (d.living === 'living' ? '' : '?')}`.replace(/ – $/, '') : ''; };
    const personBrief = id => personData(id).then(d => ({...d, years: yearsOf(d)}));
    const peopleFull = ids => Promise.all(ids.map(i => personData(i, true)));

    // mes modèles de tableaux (gardés dans les réglages, comme le reste)
    const TPL_KEY = 'genealogie-board-templates';
    const myTemplates = () => { try { const l = JSON.parse(localStorage.getItem(TPL_KEY) || '[]'); return Array.isArray(l) ? l.filter(t => t && t.id && Array.isArray(t.items)) : []; } catch (_) { return []; } };

    /* ═════════ L'éditeur ═════════ */
    async function openBoard(id, host) {
        personCache.clear(); fullCache.clear(); // les fiches ont pu changer depuis la dernière fois
        let b; try { b = await api('board', {id}); } catch (error) { toast(error.message, 'error'); return; }
        const media = b.media || {};
        let items = (b.data?.items || []).map(it => ({...it}));
        const view = {x: 40, y: 40, k: 1, ...(b.data?.view || {})};
        let bg = b.data?.bg || 'dots', boardLocked = !!b.data?.locked;
        // tableau verrouillé : on regarde, on se déplace, on ouvre ; on ne change rien
        const ro = () => { if (!boardLocked) return false; toast('Tableau verrouillé : 🔒 en haut pour le déverrouiller.'); return true; };
        let tool = 'select', shapeKind = 'rect', brush = 'pen', penColor = '#111111', penWidth = 3, noteColor = NOTE_COLORS[0], eraserMode = 'pixel', eraserSize = 16, penHard = 100, brushPreset = null;
        // la couleur de ce qu'on va poser avec les outils Texte, Trait / Flèche et Formes (pastilles + « autre couleur » dans la barre)
        const toolColor = {text: '#111111', line: '#111111', shape: '#bde0fe', head: ''}; // head vide : pointes de la couleur du trait
        const toolSw = (k, list, hint = '') => `${list.map(c => `<button type="button" class="h-sw ${toolColor[k] === c ? 'is-on' : ''}" style="background:${c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/8px 8px' : c}" data-bd-toolcolor="${k}" data-v="${c}" title="${c}"></button>`).join('')}<input type="color" class="h-bd-pencolor" value="${/^#[0-9a-f]{6}$/i.test(toolColor[k]) ? toolColor[k] : '#111111'}" data-bd-toolcustom="${k}" title="Autre couleur">${hint ? `<small class="muted h-bd-tooltip">${hint}</small>` : ''}`;
        let links = Array.isArray(b.data?.links) ? b.data.links.map(l => ({...l})) : [], cellSel = null;
        let sel = new Set(), clipboard = null, editing = null, history = [], hpos = -1, dirty = false, saveT = 0, thumbT = 0;
        let bgColor = b.data?.bgColor || '#ffffff', bgPattern = b.data?.bgPattern || '';
        // calques, étapes de présentation, grille aimantée
        let layers = Array.isArray(b.data?.layers) ? b.data.layers.map(l => ({...l})) : [], steps = Array.isArray(b.data?.steps) ? b.data.steps.map(x => ({...x})) : [], snapOn = !!b.data?.snap, activeLayer = '';
        const boardExtra = () => ({bgColor, bgPattern, layers, steps, snap: snapOn});
        // barre d'outils et en-tête : dans l'ordre choisi (Maintenance → Réglages des tableaux → Menus et options)
        const TOOL_DEFS = {select: ['↖', 'Choisir, déplacer (V)'], hand: ['✋', 'Se déplacer (H ou espace)'], text: ['T', 'Texte (T)'], note: ['🗒', 'Note (N)'], shape: ['⬠', 'Formes (S)'], line: ['╱', 'Trait (L)'], arrow: ['➝', 'Flèche (A)'], pen: ['✍︎', 'Dessin à main levée (P)'], eraser: ['⌫', 'Gomme (E)'], table: ['▦', 'Tableur (G)']};
        const ordered = (order, hidden, all) => [...(order || []).filter(k => all.includes(k)), ...all.filter(k => !(order || []).includes(k))].filter(k => !(hidden || []).includes(k));
        const toolButtons = () => { const p = P(); return ordered(p.toolsOrder, (p.toolsHidden || []).filter(k => k !== 'select'), Object.keys(TOOL_DEFS)).map(k => `<button type="button" class="h-bt" data-bd-tool="${k}" title="${esc(TOOL_DEFS[k][1])}"><span>${TOOL_DEFS[k][0]}</span></button>`).join(''); };
        const BG_LIST = [['dots', 'Fond à points'], ['grid', 'Quadrillé'], ['lines', 'Lignes'], ['plain', 'Uni'], ['paper', 'Papier'], ['cork', 'Liège'], ['dark', 'Sombre'], ['custom', 'Couleur à choisir…']];
        const HEAD_DEFS = {
            undo: () => '<button type="button" class="button small secondary" data-bd-undo title="Annuler (⌘Z)">↶</button>', redo: () => '<button type="button" class="button small secondary" data-bd-redo title="Rétablir (⇧⌘Z)">↷</button>',
            bg: () => `<span class="h-bd-bgpick"><select data-bd-bg title="Fond">${BG_LIST.map(([k, l]) => `<option value="${k}" ${bg === k ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="color" data-bd-bgcolor value="${esc(bgColor)}" title="Couleur du fond" ${bg === 'custom' ? '' : 'hidden'}><select data-bd-bgpattern title="Motif sur la couleur" ${bg === 'custom' ? '' : 'hidden'}>${[['', 'sans motif'], ['dots', 'points'], ['grid', 'quadrillé'], ['lines', 'lignes']].map(([k, l]) => `<option value="${k}" ${bgPattern === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span>`,
            snaps: () => '<button type="button" class="button small secondary" data-bd-snaps title="Instantanés : figer l’état du tableau, y revenir, en faire un nouveau tableau">📸 Instantanés</button>',
            copy: () => '<button type="button" class="button small secondary" data-bd-copy title="Créer un nouveau tableau à partir de celui-ci">⧉ Copie</button>',
            export: () => '<span class="h-bd-menuwrap"><button type="button" class="button small secondary" data-bd-export title="Image PNG ou JPG, PDF, impression, fichier du tableau">⬇ Exporter</button></span>',
            hyp: () => '<button type="button" class="button small secondary h-bd-hypcount" data-bd-hypcount title="Les pistes à vérifier : clic pour aller à la suivante" hidden>❓ 0</button>',
            search: () => '<span class="h-bd-menuwrap"><button type="button" class="button small secondary" data-bd-search title="Chercher dans le tableau (⌘F)">🔍</button></span>',
            layers: () => '<span class="h-bd-menuwrap"><button type="button" class="button small secondary" data-bd-layers title="Calques : montrer, cacher, verrouiller">🗂</button></span>',
            snapgrid: () => `<button type="button" class="button small secondary ${snapOn ? 'is-on' : ''}" data-bd-snapgrid title="Grille aimantée et guides d’alignement">🧲</button>`,
            minimap: () => '<button type="button" class="button small secondary" data-bd-minimap title="Mini-carte du tableau (montrer ou cacher)">🗺</button>',
            present: () => '<span class="h-bd-menuwrap"><button type="button" class="button small secondary" data-bd-present title="Présenter : un parcours d’étapes">▶ Présenter</button></span>',
            full: () => '<button type="button" class="button small secondary" data-bd-full title="Plein écran">⛶</button>', lockall: () => '<button type="button" class="button small secondary" data-bd-lockall title="Verrouiller ou déverrouiller tout le tableau">🔓</button>',
            delete: () => '<button type="button" class="button small secondary danger" data-bd-delete title="Supprimer ce tableau (et ses dossiers)">🗑</button>', close: () => '<button type="button" class="button small secondary" data-bd-close title="Revenir aux tableaux">✕</button>',
        };
        // les boutons dont le tableau a besoin (fermer, verrou…) restent dans la page même cachés : on les cache seulement
        const headTools = () => { const p = P(), shown = ordered(p.headerOrder, p.headerHidden, Object.keys(HEAD_DEFS)); return [...shown.map(k => HEAD_DEFS[k]()), ...Object.keys(HEAD_DEFS).filter(k => !shown.includes(k)).map(k => HEAD_DEFS[k]().replace(/^<(\w+)/, '<$1 hidden'))].join(''); };
        host.innerHTML = `<section class="h-board" tabindex="-1">
            <header class="h-board-head">
                <div class="h-board-title">${b.path?.length ? `<nav class="h-board-path"><button type="button" class="link-button" data-bd-open="${b.path[0].id}">${esc(b.path[0].title)}</button>${b.path.slice(1).map(p => ` › <button type="button" class="link-button" data-bd-open="${p.id}">${esc(p.title)}</button>`).join('')} › </nav>` : ''}
                    <input class="h-board-name" value="${esc(b.title)}" data-bd-title aria-label="Titre du tableau">
                    <span class="h-board-owner">${OWNER_ICONS[b.owner_type] || '🧩'} ${esc(b.owner_type ? `${OWNERS[b.owner_type]} : ${b.owner_label || '?'}` : 'Tableau libre')}${b.part ? ` · ${esc(b.part)}` : ''} <button type="button" class="link-button" data-bd-place>changer</button></span>
                    <span class="h-board-links" data-bd-links></span>
                    <select class="h-board-state" data-bd-state title="État du tableau">${Object.entries({open: '● En cours', paused: '⏸ En pause', closed: '✓ Terminé'}).map(([k, l]) => `<option value="${k}" ${(b.status || 'open') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                <span class="h-board-status" data-bd-status>Enregistré</span>
                <span class="h-board-headtools">${headTools()}</span>
            </header>
            <div class="h-board-toolbar" role="toolbar">
                ${toolButtons()}
                <span class="h-bt-sep"></span>
                <button type="button" class="h-bt h-bt-add" data-bd-add title="Ajouter un fichier, un média, une fiche, un écran de l’app…"><span>＋</span> Ajouter</button>
                <span class="h-bt-sep"></span>
                <span class="h-bt-opts" data-bd-opts></span>
                <span class="spacer"></span>
                <span class="h-bt-zoom"><button type="button" class="h-bt" data-bd-zoom="-1" title="Dézoomer">−</button><span class="h-bd-menuwrap"><button type="button" class="h-bt h-bd-zoomout" data-bd-zoomout title="Zoom : ajuster à la sélection, adapter à la fenêtre…">100 %</button></span><button type="button" class="h-bt" data-bd-zoom="1" title="Zoomer">+</button><button type="button" class="h-bt" data-bd-fit title="Tout voir">⤢</button><button type="button" class="h-bt" data-bd-groups title="Montrer ce qui est groupé">⧉</button></span>
            </div>
            <div class="h-board-main">
                <div class="h-board-stage" data-bd-stage data-bg="${bg}" data-pattern="${esc(bgPattern)}" style="--bgc:${esc(bgColor)}">${BOARD_FILTERS}<div class="h-board-world" data-bd-world></div><div class="h-board-marquee" data-bd-marquee hidden></div>
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
        const items0 = () => items;
        const fitTo = list => { const bb = bbox(list); if (!bb) return; const r = stage.getBoundingClientRect(); const k = Math.max(0.1, Math.min(4, Math.min((r.width - 80) / Math.max(bb.w, 1), (r.height - 80) / Math.max(bb.h, 1)))); view.k = k; view.x = (r.width - bb.w * k) / 2 - bb.x * k; view.y = (r.height - bb.h * k) / 2 - bb.y * k; applyView(); };
        const fitAll = () => { const bb = bbox(items); const r = stage.getBoundingClientRect(); if (!bb) { view.x = 40; view.y = 40; view.k = 1; return applyView(); } const k = Math.max(0.1, Math.min(2, Math.min((r.width - 80) / bb.w, (r.height - 80) / bb.h))); view.k = k; view.x = (r.width - bb.w * k) / 2 - bb.x * k; view.y = (r.height - bb.h * k) / 2 - bb.y * k; applyView(); };
        // ── traits et flèches : bouts accrochés aux éléments ──
        const centerOf = it => [it.x + it.w / 2, it.y + it.h / 2];
        const edgePoint = (it, toward) => { const [cx, cy] = centerOf(it), dx = toward[0] - cx, dy = toward[1] - cy; if (!dx && !dy) return [cx, cy]; const sx = Math.abs(dx) / (it.w / 2 + 6), sy = Math.abs(dy) / (it.h / 2 + 6), s = Math.max(sx, sy); return [cx + dx / s, cy + dy / s]; };
        const lineEnds = l => {
            let [p, q] = [l.points?.[0] || [l.x, l.y], l.points?.[l.points.length - 1] || [l.x + l.w, l.y + l.h]];
            const f = l.from && byId(l.from), t = l.to && byId(l.to), bd = l.bends || [];
            if (f) p = edgePoint(f, bd[0] || (t ? centerOf(t) : q)); if (t) q = edgePoint(t, bd[bd.length - 1] || (f ? centerOf(f) : p));
            return [p, q];
        };
        // les points du milieu d'un trait : ses coudes, ou le chemin qui contourne les éléments
        const routeCache = new Map(), lastRoute = new Map();
        function avoidRoute(l, p, q) {
            const pad = 14, obs = items.filter(o => o.id !== l.from && o.id !== l.to && !['line', 'draw', 'frame'].includes(o.type) && !hiddenIds.has(o.id)).map(o => [o.x - pad, o.y - pad, o.x + o.w + pad, o.y + o.h + pad]);
            const segHits = (a, b2) => obs.some(([x0, y0, x1, y1]) => { // le segment coupe-t-il ce rectangle ?
                let t0 = 0, t1 = 1; const dx = b2[0] - a[0], dy = b2[1] - a[1];
                for (const [pp, qq] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) { if (pp === 0) { if (qq < 0) return false; } else { const r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
                return t0 < t1; });
            if (!segHits(p, q)) { lastRoute.set(l.id, []); return []; }
            if (drag && ['move', 'resize', 'end', 'bend'].includes(drag.kind) && lastRoute.has(l.id) && !drag.start?.some(s0 => s0.id === l.id)) return lastRoute.get(l.id); // recalculé au lâcher
            const near = obs.filter(r => r[2] > Math.min(p[0], q[0]) - 400 && r[0] < Math.max(p[0], q[0]) + 400 && r[3] > Math.min(p[1], q[1]) - 400 && r[1] < Math.max(p[1], q[1]) + 400);
            const key = JSON.stringify([p.map(Math.round), q.map(Math.round), near.map(r => r.map(Math.round))]);
            if (routeCache.has(key)) { lastRoute.set(l.id, routeCache.get(key)); return routeCache.get(key); }
            const X0 = Math.min(p[0], q[0], ...obs.map(r => r[0])) - 60, Y0 = Math.min(p[1], q[1], ...obs.map(r => r[1])) - 60, X1 = Math.max(p[0], q[0], ...obs.map(r => r[2])) + 60, Y1 = Math.max(p[1], q[1], ...obs.map(r => r[3])) + 60;
            const cell = Math.max(16, Math.ceil(Math.max(X1 - X0, Y1 - Y0) / 140)), C = Math.ceil((X1 - X0) / cell) + 1, R = Math.ceil((Y1 - Y0) / cell) + 1;
            const blocked = new Uint8Array(C * R);
            obs.forEach(([x0, y0, x1, y1]) => { for (let r = Math.max(0, Math.floor((y0 - Y0) / cell)); r <= Math.min(R - 1, Math.floor((y1 - Y0) / cell)); r++) for (let c = Math.max(0, Math.floor((x0 - X0) / cell)); c <= Math.min(C - 1, Math.floor((x1 - X0) / cell)); c++) blocked[r * C + c] = 1; });
            const toC = pt => [Math.max(0, Math.min(C - 1, Math.round((pt[0] - X0) / cell))), Math.max(0, Math.min(R - 1, Math.round((pt[1] - Y0) / cell)))];
            const [sc, sr] = toC(p), [gc, gr] = toC(q), S0 = sr * C + sc, G = gr * C + gc; blocked[S0] = 0; blocked[G] = 0;
            // A* sur la grille, avec une pénalité pour chaque virage (des chemins nets)
            const N = C * R, cost = new Float64Array(N * 4).fill(Infinity), from = new Int32Array(N * 4).fill(-1), heap = [];
            const push = (f, s0) => { heap.push([f, s0]); let i = heap.length - 1; while (i) { const pi = (i - 1) >> 1; if (heap[pi][0] <= heap[i][0]) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; } };
            const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l0 = 2 * i + 1, r0 = l0 + 1; let m = i; if (l0 < heap.length && heap[l0][0] < heap[m][0]) m = l0; if (r0 < heap.length && heap[r0][0] < heap[m][0]) m = r0; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
            const D = [[1, 0], [-1, 0], [0, 1], [0, -1]], h0 = n => Math.abs(n % C - gc) + Math.abs(Math.floor(n / C) - gr);
            for (let d = 0; d < 4; d++) { cost[S0 * 4 + d] = 0; push(h0(S0), S0 * 4 + d); }
            let end = -1, guard = 0;
            while (heap.length && guard++ < 200000) {
                const [, st] = pop(), n = st >> 2, d = st & 3, c0 = cost[st];
                if (n === G) { end = st; break; }
                const c = n % C, r = Math.floor(n / C);
                for (let nd = 0; nd < 4; nd++) { const nc = c + D[nd][0], nr = r + D[nd][1]; if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue; const m = nr * C + nc; if (blocked[m]) continue; const ns = m * 4 + nd, v = c0 + 1 + (nd !== d ? 4 : 0); if (v < cost[ns]) { cost[ns] = v; from[ns] = st; push(v + h0(m), ns); } }
            }
            let out = [];
            if (end >= 0) {
                const cells = []; for (let st = end; st >= 0; st = from[st]) cells.unshift(st);
                for (let i = 1; i < cells.length - 1; i++) if ((cells[i] & 3) !== (cells[i + 1] & 3)) { const n = cells[i] >> 2; out.push([X0 + (n % C) * cell, Y0 + Math.floor(n / C) * cell]); }
                // le premier et le dernier coude alignés sur les bouts (traits bien droits)
                if (out.length) { const d1 = cells[1] & 3; if (d1 < 2) out[0][1] = p[1]; else out[0][0] = p[0]; const dn = cells[cells.length - 1] & 3, L = out[out.length - 1]; if (dn < 2) L[1] = q[1]; else L[0] = q[0]; }
            }
            if (routeCache.size > 300) routeCache.clear(); routeCache.set(key, out); lastRoute.set(l.id, out);
            return out;
        }
        const routePts = l => { const [p, q] = lineEnds(l); const mid = l.bends?.length ? l.bends : l.path === 'avoid' ? avoidRoute(l, p, q) : []; return [p, ...mid, q]; };
        const fixLine = l => { const pts = routePts(l), xs = pts.map(v => v[0]), ys = pts.map(v => v[1]); l.points = [pts[0], pts[pts.length - 1]]; l.x = Math.min(...xs); l.y = Math.min(...ys); l.w = Math.max(4, Math.max(...xs) - l.x); l.h = Math.max(4, Math.max(...ys) - l.y); };
        // ── rendu ──
        const els = new Map(), sigs = new Map();
        let hiddenIds = new Set(), lockedIds = new Set(); // calques cachés ou verrouillés, cadres repliés
        // ce qui change le dessin d'un élément (pas sa place) ; un trait qui contourne change aussi quand un obstacle bouge
        const contentSig = it => { const {x, y, z, w, h, locked, ...rest} = it; if (it.type === 'line') return JSON.stringify(it) + (it.path === 'avoid' && !it.bends?.length ? JSON.stringify(routePts(it)) : ''); return ['timeline', 'map', 'frame'].includes(it.type) ? JSON.stringify({...rest, w, h}) : JSON.stringify(rest); };
        function itemInner(it) {
            const LIST_CSS = {bullet: 'disc', num: 'decimal', roman: 'upper-roman', alpha: 'lower-alpha', ALPHA: 'upper-alpha', dash: '"– "', check: '"☐ "'};
            const txt = v => { if (!it.list || !LIST_CSS[it.list] || !v) return esc(v || '').replace(/\n/g, '<br>'); const tag = ['num', 'roman', 'alpha', 'ALPHA'].includes(it.list) ? 'ol' : 'ul'; return `<${tag} class="h-bi-list" style="list-style-type:${LIST_CSS[it.list]}">${String(v).split('\n').map(li => `<li>${esc(li) || '&nbsp;'}</li>`).join('')}</${tag}>`; };
            const textStyle = `font-size:${it.fs || 18}px;color:${it.color || '#111'};font-weight:${it.weight || (it.bold ? 700 : 400)};font-style:${it.italic ? 'italic' : 'normal'};text-decoration:${[it.underline && 'underline', it.strike && 'line-through'].filter(Boolean).join(' ') || 'none'};text-align:${['left', 'center', 'right', 'justify'].includes(it.align) ? it.align : 'left'};font-family:${esc(cssFont(it.font))}`;
            switch (it.type) {
                case 'shape': if (it.mask) return `<div class="h-bi-mask" style="background:${it.fill || '#bde0fe'};-webkit-mask-image:url(${it.mask});mask-image:url(${it.mask})"></div><div class="h-bi-text is-center" data-bd-text style="${textStyle};text-align:${it.align || 'center'}">${txt(it.text)}</div>`;
                    return `<svg class="h-bi-svg" viewBox="0 0 ${it.w} ${it.h}" preserveAspectRatio="none" style="overflow:visible"><g fill="${it.fill || '#bde0fe'}" stroke="${it.stroke || '#1d3557'}" stroke-width="${it.sw ?? 2}" ${it.dash ? `stroke-dasharray="${dashArray(it.dash, it.sw ?? 2)}" stroke-linecap="round"` : ''} vector-effect="non-scaling-stroke">${shapePath(it.shape, it.w, it.h, it)}</g></svg><div class="h-bi-text is-center" data-bd-text style="${textStyle};text-align:${it.align || 'center'}">${txt(it.text)}</div>`;
                case 'note': return `<div class="h-bi-note${it.hyp ? ' is-hyp-' + it.hyp : ''}" style="background:${it.fill || NOTE_COLORS[0]}">${it.hyp ? `<span class="h-bi-hyp">${HYP[it.hyp]?.[0] || ''} ${esc(HYP[it.hyp]?.[1] || '')}</span>` : ''}<div class="h-bi-text" data-bd-text style="${textStyle}">${txt(it.text)}</div></div>`;
                case 'text': return `<div class="h-bi-text" data-bd-text style="${textStyle}">${txt(it.text) || '<span class="muted">Texte</span>'}</div>`;
                case 'draw': return `<svg class="h-bi-svg" viewBox="0 0 ${it.vw || it.w} ${it.vh || it.h}" preserveAspectRatio="none" style="overflow:visible">${drawSvg(it)}</svg>`;
                case 'table': return tableHtml(it);
                case 'line': {
                    // la légende : position le long du trait, côté, décalage, angle, police, taille, cadre
                    const lineLabel = (it, dPath, x0, y0, P, Q) => {
                        const t = Math.max(0, Math.min(100, it.lbPos ?? 50)) / 100;
                        let at = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t], ang = Math.atan2(Q[1] - P[1], Q[0] - P[0]);
                        try { const pe = document.createElementNS('http://www.w3.org/2000/svg', 'path'); pe.setAttribute('d', dPath); const L = pe.getTotalLength(); if (L > 0) { const a = pe.getPointAtLength(L * t), b = pe.getPointAtLength(Math.min(L, L * t + 1)), c0 = pe.getPointAtLength(Math.max(0, L * t - 1)); at = [a.x, a.y]; ang = Math.atan2(b.y - c0.y, b.x - c0.x); } } catch (_) {}
                        const side = it.lbSide || 'on', off = side === 'on' ? 0 : (it.lbOffset ?? 14) * (side === 'above' ? -1 : 1);
                        let rot = it.lbRotate ? ang * 180 / Math.PI : 0; if (rot > 90) rot -= 180; if (rot < -90) rot += 180;
                        const nx = -Math.sin(it.lbRotate ? rot * Math.PI / 180 : 0), ny = Math.cos(it.lbRotate ? rot * Math.PI / 180 : 0);
                        const cx = at[0] + x0 - it.x + nx * off, cy = at[1] + y0 - it.y + ny * off;
                        const bg = it.lbBg ?? '#ffffff', bw = it.lbBw ?? 0, pad = it.lbPad ?? 4;
                        const st = [`left:${cx}px`, `top:${cy}px`, `font-size:${it.lbSize || 13}px`, `color:${it.lbColor || '#111111'}`, `font-family:${esc(cssFont(it.lbFont))}`, `font-weight:${it.lbBold ? 700 : 400}`, `font-style:${it.lbItalic ? 'italic' : 'normal'}`,
                            `background:${bg}`, `border:${bw}px solid ${it.lbBorder || '#111111'}`, `padding:${Math.round(pad * .5)}px ${pad + 2}px`, `border-radius:${it.lbRadius ?? 4}px`, `transform:translate(-50%,-50%)${rot ? ` rotate(${rot.toFixed(1)}deg)` : ''}`, bg === 'transparent' ? 'box-shadow:none' : ''].join(';');
                        return `<div class="h-bi-linelabel" style="${st}">${esc(it.text)}</div>`;
                    };
                    const all = routePts(it), p = all[0], q = all[all.length - 1], pad = 30, xs = all.map(v => v[0]), ys = all.map(v => v[1]), x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
                    const P = [p[0] - x0, p[1] - y0], Q = [q[0] - x0, q[1] - y0], w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
                    const loc = all.map(v => [+(v[0] - x0).toFixed(1), +(v[1] - y0).toFixed(1)]);
                    const dPath = all.length > 2 ? (it.path === 'curve' ? smooth(loc) : 'M' + loc.map(v => v.join(',')).join(' L')) : linePath(it.path === 'avoid' ? 'straight' : it.path || (it.curved ? 'curve' : 'straight'), P, Q, it.sw || 2), da = dashArray(it.dash, it.sw || 2);
                    const mk = `bdm-${it.id}`, hs = it.hs || headSize(it), c = it.color || '#111', hS = headOf(it, 'start'), hE = headOf(it, 'end');
                    const marker = (id0, shape) => shape === 'none' ? '' : `<marker id="${id0}" viewBox="0 0 10 10" refX="${HEAD_REF[shape]}" refY="5" markerWidth="${hs}" markerHeight="${hs}" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible">${HEAD_SVG[shape](it.headColor || c)}</marker>`;
                    return `<svg class="h-bi-line" style="left:${x0 - it.x}px;top:${y0 - it.y}px;width:${w}px;height:${h}px" viewBox="0 0 ${w} ${h}"><defs>${marker(mk + 's', hS)}${marker(mk + 'e', hE)}</defs>
                        <path class="h-bi-hit" d="${dPath}"/><path d="${dPath}" fill="none" stroke="${it.color || '#111'}" stroke-width="${it.sw || 2}" stroke-linecap="round" stroke-linejoin="round" ${da ? `stroke-dasharray="${da}"` : ''} ${hE !== 'none' ? `marker-end="url(#${mk}e)"` : ''} ${hS !== 'none' ? `marker-start="url(#${mk}s)"` : ''}/></svg>${it.text ? lineLabel(it, dPath, x0, y0, P, Q) : ''}`;
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
                case 'person': return `<div class="h-bi-card h-bi-person" data-bd-person="${Number(it.person_id)}"><span class="h-bi-avatar">👤</span><span class="h-bi-pinfo"><strong>${esc(it.title || 'Fiche')}</strong><small></small></span></div>`;
                case 'timeline': return `<div class="h-bi-timeline"><header>🗓 ${esc(it.title || 'Frise')}</header><div class="h-bi-tlbody" data-bd-tl><p class="muted">Chargement…</p></div></div>`;
                case 'map': return `<div class="h-bi-mapbox"><header>🗺 ${esc(it.title || 'Carte')}</header><div class="h-bi-mapbody" data-bd-map><p class="muted">Chargement…</p></div></div>`;
                case 'frame': return `<div class="h-bi-section${it.collapsed ? ' is-collapsed' : ''}" style="--fc:${it.fill || '#eef4ff'};--fb:${it.stroke || '#9fb7d9'}"><header><button type="button" class="h-bi-fold" data-bd-fold title="${it.collapsed ? 'Déplier' : 'Replier'}">${it.collapsed ? '▸' : '▾'}</button><span>${esc(it.title || 'Cadre')}</span>${it.collapsed ? `<small>${framed(it).length} élément${framed(it).length > 1 ? 's' : ''}</small>` : ''}</header></div>`;
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
            const hiddenL = new Set(layers.filter(l => l.hidden).map(l => l.id)), lockedL = new Set(layers.filter(l => l.locked).map(l => l.id));
            hiddenIds = new Set(items.filter(i => i.layer && hiddenL.has(i.layer)).map(i => i.id)); lockedIds = new Set(items.filter(i => i.layer && lockedL.has(i.layer)).map(i => i.id));
            items.filter(f => f.type === 'frame' && f.collapsed).forEach(f => framed(f).forEach(i => hiddenIds.add(i.id)));
            items.forEach(i => { if (i.type === 'line' && (hiddenIds.has(i.from) || hiddenIds.has(i.to))) hiddenIds.add(i.id); });
            if (hiddenIds.size || lockedIds.size) sel = new Set([...sel].filter(k => !hiddenIds.has(k) && !lockedIds.has(k))); // caché ou verrouillé par son calque : ni choisi, ni bougé, ni supprimé
            items.forEach(it => { if (it.type === 'line') fixLine(it); });
            const seen = new Set();
            [...items].sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((it, i) => {
                seen.add(it.id);
                let el = els.get(it.id);
                if (!el) { el = document.createElement('div'); el.className = 'h-bi'; el.dataset.bi = it.id; world.appendChild(el); els.set(it.id, el); }
                const sig = contentSig(it);
                if (sigs.get(it.id) !== sig) { el.innerHTML = itemInner(it) + cmtBubble(it); sigs.set(it.id, sig); hydrate(el, it); }
                el.className = `h-bi is-type-${it.type}${sel.has(it.id) ? ' is-sel' : ''}${it.locked ? ' is-locked' : ''}${it.group ? ' is-grouped' : ''}${lockedIds.has(it.id) ? ' is-layerlocked' : ''}`;
                el.hidden = hiddenIds.has(it.id);
                Object.assign(el.style, {left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px', zIndex: String(10 + i), transform: it.rot ? `rotate(${it.rot}deg)` : '', opacity: it.opacity !== undefined && it.opacity < 1 ? String(it.opacity) : ''});
                // arrondi (notes, médias, tableurs, étiquettes) et contour des médias
                if (it.radius !== undefined && it.type !== 'shape') el.style.setProperty('--r', it.radius + 'px'); else el.style.removeProperty('--r');
                if ((it.bw || 0) > 0 && ['media', 'webimage'].includes(it.type)) { el.style.setProperty('--bw', it.bw + 'px'); el.style.setProperty('--bc', it.stroke || '#111111'); } else { el.style.removeProperty('--bw'); el.style.removeProperty('--bc'); }
                el.querySelectorAll('td.is-cell').forEach(td => td.classList.remove('is-cell'));
                if (cellSel?.id === it.id && sel.has(it.id)) { const r0 = Math.min(cellSel.r, cellSel.r2 ?? cellSel.r), r1 = Math.max(cellSel.r, cellSel.r2 ?? cellSel.r), c0 = Math.min(cellSel.c, cellSel.c2 ?? cellSel.c), c1 = Math.max(cellSel.c, cellSel.c2 ?? cellSel.c); el.querySelectorAll('td[data-r]').forEach(td => { const r = Number(td.dataset.r), c = Number(td.dataset.c); if (r >= r0 && r <= r1 && c >= c0 && c <= c1) td.classList.add('is-cell'); }); }
            });
            for (const [k, el] of els) if (!seen.has(k)) { el.remove(); els.delete(k); sigs.delete(k); }
            drawGroups();
            drawSelection(keepInspector);
            root.querySelector('[data-bd-empty]')?.toggleAttribute('hidden', items.length > 0);
            afterRender();
        }
        // ── fiche posée : ce qu'elle montre (photo, dates, années, lieux, métier, âge, parents), lu dans la fiche ──
        const PSHOW = [['photo', 'Photo'], ['dates', 'Dates complètes'], ['years', 'Années'], ['places', 'Lieux'], ['job', 'Métier'], ['age', 'Âge'], ['parents', 'Parents']];
        function fillPersonCard(c, it, p) {
            const show = (it.pshow ?? 'photo,years').split(',');
            c.classList.add('gender-' + (p.gender || 'unknown')); c.classList.toggle('is-missing', !!p.missing);
            c.querySelector('strong').textContent = it.title || p.name;
            const av = c.querySelector('.h-bi-avatar'); av.hidden = !show.includes('photo');
            if (show.includes('photo') && p.portrait) av.innerHTML = `<img src="media/${encodeURIComponent(p.portrait)}" alt="">`;
            const age = (() => { const b = p.birth?.year, d = p.death?.year || (p.living === 'living' ? new Date().getFullYear() : null); return b && d && d >= b ? `${d - b} ans` : ''; })();
            const lines = [
                show.includes('dates') ? [p.birth?.date && `° ${p.birth.date}`, p.death?.date && `† ${p.death.date}`].filter(Boolean).join('  ') : show.includes('years') ? yearsOf(p) : '',
                show.includes('places') ? [p.birth?.place && `° ${p.birth.place}`, p.death?.place && `† ${p.death.place}`].filter(Boolean).join(' · ') : '',
                show.includes('job') ? p.occupation : '', show.includes('age') && age ? `${p.death?.year ? 'mort à ' : ''}${age}` : '',
            ].filter(Boolean);
            c.querySelector('small').innerHTML = lines.map(esc).join('<br>');
            if (show.includes('parents') && p.parents?.length) { const slot = document.createElement('em'); slot.className = 'h-bi-pparents'; c.querySelector('small').append(slot); Promise.all(p.parents.map(personBrief)).then(ps => { slot.innerHTML = `<br>${ps.map(x => esc(x.name)).join(' et ')}`; }); }
        }
        // ── frise vivante : les événements d'une personne (ou de sa famille) sur une ligne du temps ──
        async function fillTimeline(el, it) {
            const box = el.querySelector('[data-bd-tl]'); if (!box) return;
            if (!it.person_id) { box.innerHTML = '<p class="muted">Choisis la personne à droite.</p>'; return; }
            const me = await personData(it.person_id, true);
            let evs = me.events.map(e => ({...e, who: ''}));
            if (it.tlMode === 'family') {
                const others = [...me.partners.map(x => x.id), ...me.children].filter(Boolean);
                const ps = await peopleFull(others);
                ps.forEach(o => o.events.filter(e => e.scope === 'person').forEach(e => evs.push({...e, who: o.first_name || o.name})));
            }
            const seen = new Set(); evs = evs.filter(e => e.year && !seen.has(e.id + e.scope) && seen.add(e.id + e.scope)).sort((a, b) => a.year - b.year);
            if (!evs.length) { box.innerHTML = '<p class="muted">Aucun événement daté.</p>'; return; }
            const W = Math.max(200, it.w - 16), H = Math.max(80, it.h - 34), y0 = Math.round(H / 2), pad = 30;
            const minY = evs[0].year, maxY = Math.max(evs[evs.length - 1].year, minY + 1), X = yr => pad + (yr - minY) / (maxY - minY) * (W - pad * 2);
            const step = [1, 2, 5, 10, 20, 25, 50, 100].find(s0 => (maxY - minY) / s0 <= 12) || 200;
            let ticks = ''; for (let yr = Math.ceil(minY / step) * step; yr <= maxY; yr += step) ticks += `<line x1="${X(yr)}" y1="${y0 - 5}" x2="${X(yr)}" y2="${y0 + 5}" stroke="#888"/><text x="${X(yr)}" y="${y0 + 18}" text-anchor="middle" font-size="10" fill="#777">${yr}</text>`;
            // étiquettes au-dessus et au-dessous, sur plusieurs rangs pour ne pas se chevaucher
            const lanes = {up: [], down: []}, fs = Math.max(9, Math.min(13, (it.fs || 12)));
            const marks = evs.map((e, n) => {
                const x = X(e.year), side = n % 2 ? 'down' : 'up', label = `${e.year} · ${e.kind}${e.who ? ' (' + e.who + ')' : ''}`, sub = e.place || '', wTxt = Math.max(label.length, sub.length) * fs * .55;
                const L = lanes[side]; let lane = 0; while (L[lane] !== undefined && L[lane] > x - wTxt / 2 - 6) lane++; L[lane] = x + wTxt / 2;
                const dy = (26 + lane * (fs * 2.6)) * (side === 'up' ? -1 : 1), ty = y0 + dy;
                return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${ty + (side === 'up' ? 4 : -fs)}" stroke="${esc(e.color || '#2a7de1')}" stroke-opacity=".5"/><circle cx="${x}" cy="${y0}" r="5" fill="${esc(e.color || '#2a7de1')}" stroke="#fff" stroke-width="1.5"/>
                    <text x="${x}" y="${ty}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="currentColor">${esc(label)}</text>${sub ? `<text x="${x}" y="${ty + fs * 1.15}" text-anchor="middle" font-size="${fs - 1}" fill="#777">${esc(sub)}</text>` : ''}`;
            }).join('');
            box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="${pad / 2}" y1="${y0}" x2="${W - pad / 2}" y2="${y0}" stroke="#333" stroke-width="2"/>${ticks}${marks}</svg>`;
        }
        // ── carte : les lieux d'une personne, de sa famille ou d'une enquête, et des repères posés à la main ──
        // la liste des enquêtes : lue une fois par tableau ouvert
        let invP = null;
        const invList = () => (invP ||= api('research_lists', {kind: 'investigations'}).then(r => r.rows || []).catch(() => { invP = null; return []; }));
        async function mapPoints(it) {
            let pid = 0, family = false;
            const [kind, val] = String(it.mapSrc || '').split(':');
            if (kind === 'person' || kind === 'family') { pid = Number(val); family = kind === 'family'; }
            if (kind === 'investigation') { try { const r = await invList(); pid = Number(r.find(x => Number(x.id) === Number(val))?.person_id) || 0; } catch (_) {} }
            const pts = [], paths = [];
            if (pid) {
                const me = await personData(pid, true), ppl = [me];
                if (family) ppl.push(...await peopleFull([...me.partners.map(x => x.id), ...me.children, ...me.parents].filter(Boolean)));
                ppl.forEach((p, n) => {
                    const evs = p.events.filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lon));
                    evs.forEach(e => pts.push({lat: e.lat, lon: e.lon, label: `${p.first_name || p.name} — ${e.kind}${e.year ? ' ' + e.year : ''} — ${e.place}`, color: e.color || '#2a7de1'}));
                    if (it.mapPath && evs.length > 1) paths.push({coords: evs.map(e => [e.lat, e.lon]), color: n ? '#999' : '#b5523b', dashed: true, width: 2});
                });
            }
            (it.pins || []).forEach(pn => pts.push({lat: pn.lat, lon: pn.lon, label: pn.label || 'Repère', color: pn.color || '#d0021b'}));
            return {pts, paths};
        }
        async function fillMap(el, it) {
            const box = el.querySelector('[data-bd-map]'); if (!box) return;
            const {pts, paths} = await mapPoints(it);
            if (!ext.miniMap) { box.innerHTML = '<p class="muted">Carte indisponible.</p>'; return; }
            box.innerHTML = ext.miniMap(pts, paths, {height: Math.round(1000 * Math.max(60, it.h - 30) / Math.max(60, it.w)), emptyText: it.mapSrc || (it.pins || []).length ? 'Aucun lieu avec ses coordonnées.' : 'Choisis à droite une personne, une famille ou une enquête, ou pose des repères.'});
        }
        // ── cadres : ce qui est dedans (entièrement) bouge avec eux ──
        const framed = f => items.filter(i => i !== f && i.type !== 'frame' && i.x >= f.x - 1 && i.y >= f.y - 1 && i.x + i.w <= f.x + f.w + 1 && i.y + i.h <= f.y + (f.collapsed ? (f.fh || f.h) : f.h) + 1);
        function hydrate(el, it) {
            if (it.type === 'person') personBrief(it.person_id).then(p => { const c = el.querySelector('.h-bi-person'); if (c) fillPersonCard(c, it, p); });
            if (it.type === 'timeline') fillTimeline(el, it);
            if (it.type === 'map') fillMap(el, it);
            if (it.type === 'widget' && ext.renderCustomWidgetInto) { const box = el.querySelector('[data-bd-widget]'); ext.renderCustomWidgetInto(box, it.target).catch?.(() => { box.innerHTML = '<p class="muted">Widget introuvable.</p>'; }); }
        }
        // cadre de sélection et poignées
        const selLayer = document.createElement('div'); selLayer.className = 'h-board-sel'; world.appendChild(selLayer);
        // ce qui est groupé : un cadre pointillé et une pastille « Groupe n » (clic : choisir le groupe)
        const grpLayer = document.createElement('div'); grpLayer.className = 'h-board-groups'; world.prepend(grpLayer);
        let showGroups = (() => { try { return localStorage.getItem('genealogie-board-groups') !== '0'; } catch (_) { return true; } })();
        const GROUP_COLORS = ['#7b2cbf', '#0a9396', '#e85d04', '#2b8a3e', '#c9184a', '#1d4ed8'];
        const groupNames = () => { const order = []; items.forEach(i => { if (i.group && !order.includes(i.group)) order.push(i.group); }); return order.filter(g => items.filter(i => i.group === g).length > 1); };
        function drawGroups() {
            const names = groupNames();
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
                const all = routePts(single), bends = single.bends || [];
                selLayer.innerHTML = single.locked ? '' : `<span class="h-bh" data-bd-end="0" style="left:${p[0]}px;top:${p[1]}px"></span><span class="h-bh" data-bd-end="1" style="left:${q[0]}px;top:${q[1]}px"></span>`
                    + bends.map((v, i) => `<span class="h-bh h-bh-bend" data-bd-bend="${i}" style="left:${v[0]}px;top:${v[1]}px" title="Glisser pour plier · double-clic pour enlever ce coude"></span>`).join('')
                    + all.slice(1).map((v, i) => `<span class="h-bh h-bh-addbend" data-bd-addbend="${i}" style="left:${(v[0] + all[i][0]) / 2}px;top:${(v[1] + all[i][1]) / 2}px" title="Glisser pour ajouter un coude">+</span>`).join('');
            } else {
                const bb = bbox(list); selLayer.hidden = false; selLayer.className = 'h-board-sel';
                Object.assign(selLayer.style, {left: bb.x + 'px', top: bb.y + 'px', width: bb.w + 'px', height: bb.h + 'px'});
                selLayer.innerHTML = list.some(i => i.locked) ? '<span class="h-bsel-lock">🔒</span>' : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<span class="h-bh h-bh-${h}" data-bd-handle="${h}"></span>`).join('');
            }
            world.appendChild(selLayer); // toujours au-dessus
            if (!keepInspector) renderInspector(); // pas pendant qu'on glisse un curseur ou qu'on choisit une couleur
        }
        // ── historique et enregistrement ──
        const snap = () => JSON.stringify({items, layers, steps});
        const commit = () => { const s = snap(); if (hpos >= 0 && history[hpos] === s) return; history = history.slice(0, hpos + 1); history.push(s); if (history.length > 150) history.shift(); hpos = history.length - 1; queueSave(true); };
        const restore = i => { if (i < 0 || i >= history.length || ro()) return; hpos = i; { const h0 = JSON.parse(history[i]); if (Array.isArray(h0)) items = h0; else { items = h0.items || []; layers = h0.layers || []; steps = h0.steps || []; } } sel = new Set([...sel].filter(byId)); clampCell(); render(); queueSave(true); };
        const ownerData = {owner_type: b.owner_type, owner_id: b.owner_id, part: b.part};
        function queueSave(changed) {
            if (changed) { dirty = true; changes++; status('Modifié…'); }
            clearTimeout(saveT); saveT = setTimeout(save, changed ? 900 : 2500);
        }
        // les enregistrements passent l'un après l'autre (un ancien ne peut pas écraser un plus récent)
        let saveChain = Promise.resolve(), changes = 0;
        function save() { saveChain = saveChain.then(save1, save1); return saveChain; }
        async function save1() {
            clearTimeout(thumbT);
            let thumb = '';
            if (Date.now() - (save.lastThumb || 0) > 8000) { try { thumb = await thumbnail(320, 200); save.lastThumb = Date.now(); } catch (_) {} }
            const at = changes;
            const title = root.querySelector('[data-bd-title]').value.trim() || 'Tableau sans titre';
            const body = {id: b.id, title, icon: b.icon, color: b.color, status: root.querySelector('[data-bd-state]').value, ...ownerData, data: {items, view, bg, locked: boardLocked, links, ...boardExtra()}};
            if (thumb) body.thumb = thumb;
            try { const res = await api('save_board', {}, {method: 'POST', body}); const sl = (res.result || res).links; if (Array.isArray(sl) && sl.length === links.length) { links = sl; renderLinks(); } if (at === changes) { dirty = false; status(boardLocked ? '🔒 Verrouillé' : 'Enregistré ✓'); } } catch (error) { status('⚠ ' + error.message); }
        }
        // ── miniature (et image PNG) : les éléments redessinés sur un canevas ──
        async function thumbnail(W, H, scale0 = 0, type = 'image/png', onlySel = false) {
            const items = onlySel && sel.size ? items0().filter(i => sel.has(i.id)) : items0();
            const bb = bbox(items) || {x: 0, y: 0, w: W, h: H};
            const k = scale0 || Math.min(W / (bb.w + 40), H / (bb.h + 40));
            const cw = scale0 ? Math.ceil((bb.w + 80) * k) : W, ch = scale0 ? Math.ceil((bb.h + 80) * k) : H;
            const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
            x.fillStyle = bg === 'custom' ? bgColor : bg === 'dark' ? '#1e2227' : bg === 'cork' ? '#c9a46b' : bg === 'paper' ? '#fbf6ea' : '#ffffff'; x.fillRect(0, 0, cw, ch);
            const ox = scale0 ? (40 - bb.x) * k : (cw - bb.w * k) / 2 - bb.x * k, oy = scale0 ? (40 - bb.y) * k : (ch - bb.h * k) / 2 - bb.y * k;
            x.translate(ox, oy); x.scale(k, k);
            const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
            for (const it of [...items].sort((a, b2) => (a.z || 0) - (b2.z || 0))) {
                if (hiddenIds.has(it.id)) continue; // calque caché, cadre replié
                x.save(); x.globalAlpha = it.opacity ?? 1;
                if (it.type === 'table') {
                    const cells = it.cells || [['']], rows = cells.length, cols = Math.max(1, ...cells.map(r => r.length)), cw = Array.from({length: cols}, (_, c) => it.colw?.[c] || 100), tot = cw.reduce((s, v) => s + v, 0), rh = it.h / rows, vals = tableValues(cells);
                    x.fillStyle = '#ffffff'; x.fillRect(it.x, it.y, it.w, it.h);
                    if (it.header) { x.fillStyle = it.hfill || '#e8eef7'; x.fillRect(it.x, it.y, it.w, rh); }
                    x.strokeStyle = '#c9ced6'; x.lineWidth = 1; x.font = `${Math.min(it.fs || 14, rh * .7)}px sans-serif`; x.fillStyle = it.color || '#111'; x.textBaseline = 'middle';
                    let cx0 = it.x; cw.forEach((w0, c) => { const ww = it.w * w0 / tot; for (let r = 0; r < rows; r++) { x.strokeRect(cx0, it.y + r * rh, ww, rh); const v = vals[r][c]; if (v !== '') { x.save(); x.beginPath(); x.rect(cx0, it.y + r * rh, ww, rh); x.clip(); x.fillText(String(cells[r][c] ?? '').startsWith('=') ? showVal(v) : String(cells[r][c] ?? ''), cx0 + 4, it.y + r * rh + rh / 2); x.restore(); } } cx0 += ww; });
                    x.restore(); continue;
                }
                if (it.type === 'shape' || it.type === 'note' || it.type === 'tag' || ['folder', 'recueil', 'person', 'link', 'screen', 'weblink', 'widget', 'timeline', 'map', 'frame'].includes(it.type) || (it.type === 'media' && kindOfMedia(media[it.media_id]) !== 'image')) {
                    x.fillStyle = it.type === 'note' ? (it.fill || NOTE_COLORS[0]) : it.type === 'shape' ? (it.fill || '#bde0fe') : it.type === 'tag' ? (it.fill || '#0066cc') : it.type === 'folder' ? (it.fill || '#f5c542') : it.type === 'frame' ? (it.fill || '#eef4ff') : '#f3f5f8';
                    x.strokeStyle = it.type === 'shape' ? (it.stroke || '#1d3557') : '#c9ced6'; x.lineWidth = it.type === 'shape' ? (it.sw ?? 2) : 1;
                    if (it.type === 'shape' && it.shape === 'ellipse') { x.beginPath(); x.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2); x.fill(); x.stroke(); }
                    else if (it.type === 'shape' && it.mask) { const im = await loadImg(it.mask); if (im) { const c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(it.w)); c2.height = Math.max(1, Math.round(it.h)); const x2 = c2.getContext('2d'); x2.drawImage(im, 0, 0, c2.width, c2.height); x2.globalCompositeOperation = 'source-in'; x2.fillStyle = it.fill || '#bde0fe'; x2.fillRect(0, 0, c2.width, c2.height); x.drawImage(c2, it.x, it.y); } }
                    else if (it.type === 'shape' && (it.svgpath || (KIT().shapeByKey?.(it.shape)?.d && !['rect', 'round'].includes(it.shape)))) {
                        const d0 = it.svgpath || KIT().shapeByKey(it.shape).d, eo = it.svgpath ? it.eo : KIT().shapeByKey(it.shape).eo, bx = it.svgpath ? 100 : (KIT().shapeByKey(it.shape).s || 100);
                        x.save(); x.translate(it.x, it.y); x.scale(it.w / bx, it.h / bx); const p2 = new Path2D(d0); x.fill(p2, eo ? 'evenodd' : 'nonzero'); x.restore();
                        x.save(); x.translate(it.x, it.y); x.scale(it.w / bx, it.h / bx); x.lineWidth = (it.sw ?? 2) * bx / Math.max(1, Math.min(it.w, it.h)); if ((it.sw ?? 2) > 0 && it.stroke !== 'transparent') x.stroke(p2); x.restore();
                    }
                    else if (it.radius || (it.type === 'shape' && it.shape === 'round')) { const r0 = Math.min(it.radius ?? Math.min(it.w, it.h) * .18, it.w / 2, it.h / 2); x.beginPath(); x.roundRect(it.x, it.y, it.w, it.h, r0); x.fill(); x.stroke(); }
                    else { x.fillRect(it.x, it.y, it.w, it.h); x.strokeRect(it.x, it.y, it.w, it.h); }
                    const label = it.text || it.title || els.get(it.id)?.querySelector('.h-bi-pinfo strong')?.textContent || ({folder: 'Dossier', recueil: 'Recueil', person: 'Fiche', link: 'Écran', screen: 'Écran', timeline: 'Frise', map: 'Carte', frame: 'Cadre'}[it.type] || '');
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
                    const all = routePts(it), p = all[all.length - 2], q = all[all.length - 1], p0 = all[0], q0 = all[1]; x.strokeStyle = it.color || '#111'; x.lineWidth = it.sw || 2; x.beginPath(); x.moveTo(all[0][0], all[0][1]); all.slice(1).forEach(v => x.lineTo(v[0], v[1])); x.stroke();
                    const tip = (to, from) => { const a = Math.atan2(to[1] - from[1], to[0] - from[0]), s = it.hs || headSize(it); x.fillStyle = it.headColor || it.color || '#111'; x.beginPath(); x.moveTo(to[0], to[1]); x.lineTo(to[0] - s * Math.cos(a - .45), to[1] - s * Math.sin(a - .45)); x.lineTo(to[0] - s * Math.cos(a + .45), to[1] - s * Math.sin(a + .45)); x.fill(); };
                    if (headOf(it, 'end') !== 'none') tip(q, p); if (headOf(it, 'start') !== 'none') tip(p0, q0);
                } else if (it.type === 'media' || it.type === 'webimage') {
                    const src = it.type === 'media' ? mediaUrl(media[it.media_id]) : it.url; const im = src ? await loadImg(src) : null;
                    try { if (im) x.drawImage(im, it.x, it.y, it.w, it.h); else { x.fillStyle = '#ddd'; x.fillRect(it.x, it.y, it.w, it.h); } } catch (_) { x.fillStyle = '#ddd'; x.fillRect(it.x, it.y, it.w, it.h); }
                }
                x.restore();
            }
            try { return c.toDataURL(scale0 ? type : 'image/jpeg', scale0 ? .92 : .8); } catch (_) { return ''; } // une image d'un autre site peut l'empêcher
        }
        // ── ajouter des éléments ──
        const place = (it, at, quiet = false) => { if (ro()) return null; const r = stage.getBoundingClientRect(); const [cx, cy] = at || toWorld(r.left + r.width / 2, r.top + r.height / 2); const n = {id: uid(), x: cx - (it.w || 160) / 2, y: cy - (it.h || 100) / 2, w: 160, h: 100, z: topZ() + 1, ...(activeLayer ? {layer: activeLayer} : {}), ...it};
            // posé au centre : on le décale tant qu'il couvre déjà quelque chose
            const covers = () => items.some(o => o.type !== 'line' && n.x < o.x + o.w && n.x + n.w > o.x && n.y < o.y + o.h && n.y + n.h > o.y);
            if (!at) { const x0 = n.x; for (let k = 1; k < 24 && covers(); k++) { n.x = x0 + (k % 5) * (n.w + 24); if (k % 5 === 0) n.y += n.h + 24; } }
            items.push(n); sel = new Set([n.id]); render(); if (!quiet) commit(); return n; }; // quiet : un texte vide n'entre dans l'historique qu'une fois écrit
        async function uploadAndPlace(files, at, audioOnly = false) {
            if (ro()) return;
            const list = [...files].filter(f => f.size > 0); if (!list.length) return;
            status('Envoi des fichiers…');
            const fd = new FormData(); fd.append('collection_type', 'board'); fd.append('collection_id', b.id); fd.append('collection_role', ''); fd.append('csrf', S().csrf); if (audioOnly) fd.append('audio_only', '1'); list.forEach(f => fd.append('files[]', f));
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
            pen: () => `<span class="h-bd-brushpick"><button type="button" class="h-bt is-on" data-bd-brushmenu title="Choisir le pinceau">${brushPreset ? esc(brushPreset.icon + ' ' + brushPreset.name) : `${BRUSHES.find(x => x[0] === brush)?.[2] || '🖊'} ${esc(BRUSHES.find(x => x[0] === brush)?.[1] || 'Stylo')}`} ▾</button></span>
                <span class="h-bd-widths">${WIDTHS.map(w => `<button type="button" class="h-bt ${penWidth === w ? 'is-on' : ''}" data-bd-penwidth="${w}" title="${w} px"><i style="height:${Math.max(1.5, Math.min(14, w / 1.6))}px"></i></button>`).join('')}</span>
                <label class="h-bt-label"><input type="range" min="${P().strokeMin ?? 0.5}" max="${P().strokeMax ?? 60}" step="0.5" value="${Math.min(P().strokeMax ?? 60, penWidth)}" data-bd-penw><input type="number" class="h-bd-numbox" min="0.5" max="500" step="0.5" value="${penWidth}" data-bd-penw> px</label>
                ${pal('pen').map(c => `<button type="button" class="h-sw ${penColor === c ? 'is-on' : ''}" style="background:${c}" data-bd-pencolor="${c}" aria-label="${c}"></button>`).join('')}<label class="h-bt-label" title="Dureté du bord : 100 % net, moins = flou">Dureté <input type="range" min="0" max="100" value="${penHard}" data-bd-penhard><output>${penHard} %</output></label><input type="color" class="h-bd-pencolor" value="${/^#[0-9a-f]{6}$/i.test(penColor) ? penColor : '#111111'}" data-bd-pencustom title="Autre couleur">`,
            eraser: () => `${[['pixel', '🩹 Gomme fine', 'efface seulement ce que tu touches'], ['stroke', '🧽 Gomme à traits', 'enlève le trait entier']].map(([k, l, h]) => `<button type="button" class="h-bt ${eraserMode === k ? 'is-on' : ''}" data-bd-erasemode="${k}" title="${h}">${l}</button>`).join('')}
                <label class="h-bt-label">Taille <input type="range" min="2" max="120" value="${eraserSize}" data-bd-erasesize><input type="number" class="h-bd-numbox" min="2" max="400" value="${eraserSize}" data-bd-erasesize> px</label><small class="muted">Les gommes n’effacent que les dessins à main levée.</small>`,
            text: () => toolSw('text', pal('text'), 'Clique où écrire.'),
            line: () => toolSw('line', pal('text'), 'Tire un trait ; posé sur un élément, il s’y accroche.'),
            arrow: () => `<label class="h-bt-label" title="Un lien tout prêt : légende, couleur et style">Lien <select data-bd-connector><option value="">libre</option>${CONNECTORS.map(([k, l]) => `<option value="${k}" ${connector === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><span class="h-bt-sep"></span>${toolSw('line', pal('text'))}<span class="h-bt-sep"></span><span class="h-bt-label">Pointes</span><button type="button" class="h-bt ${toolColor.head ? '' : 'is-on'}" data-bd-toolcolor="head" data-v="" title="Pointes de la même couleur que le trait">=</button>${toolSw('head', pal('text'), 'Tire une flèche d’un élément à un autre : elle les suit.')}`,
            shape: () => `${toolSw('shape', pal('fill'))}<span class="h-bt-sep"></span><span class="h-bd-shquick">${quickShapes().map(sh => `<button type="button" class="h-bt ${shapeKind === sh.k ? 'is-on' : ''}" data-bd-shapekind="${esc(sh.k)}" title="${esc(sh.n)}">${KIT().shapeSvg ? KIT().shapeSvg(sh, 18) : esc(sh.n)}</button>`).join('')}</span><button type="button" class="h-bt" data-bd-shapeall title="Toutes les formes, et créer la sienne">Toutes les formes ▾</button>`,
            note: () => pal('note').map(c => `<button type="button" class="h-sw ${noteColor === c ? 'is-on' : ''}" style="background:${c}" data-bd-notecolor="${c}"></button>`).join('') + `<input type="color" class="h-bd-pencolor" value="${/^#[0-9a-f]{6}$/i.test(noteColor) ? noteColor : '#fff3a3'}" data-bd-notecustom title="Autre couleur pour les notes">`,
        };
        const setTool = t => { if (boardLocked && !['select', 'hand'].includes(t)) { ro(); t = 'select'; }
            tool = t; root.querySelectorAll('[data-bd-tool]').forEach(x => x.classList.toggle('is-on', x.dataset.bdTool === t));
            const HINTS = {text: 'Clique où écrire.', line: 'Tire un trait ; posé sur un élément, il s’y accroche.', arrow: 'Tire une flèche d’un élément à un autre : elle les suit quand on les déplace.', table: 'Clique où poser le tableur.', hand: 'Glisse pour te déplacer ; molette ou deux doigts aussi ; ⌘ + molette pour zoomer.', select: 'Clic : choisir · ⇧ + clic : en ajouter · ⌥ / Alt + glisser : dupliquer · glisser dans le vide : en choisir plusieurs · double-clic : écrire ou ouvrir.'};
            root.querySelector('[data-bd-opts]').innerHTML = OPTS[t]?.() || (HINTS[t] ? `<small class="muted">${HINTS[t]}</small>` : '');
            stage.dataset.tool = t;
        };
        root.querySelector('.h-board-toolbar').addEventListener('click', e => {
            const t = e.target.closest('[data-bd-tool]'); if (t) return setTool(t.dataset.bdTool);
            const br = e.target.closest('[data-bd-brush]'); if (br) { brush = br.dataset.bdBrush; brushPreset = null; penHard = 100; penWidth = BRUSHES.find(x => x[0] === brush)?.[3] || penWidth; root.querySelector('.h-bd-brushmenu')?.remove(); setTool('pen'); return; }
            const cb = e.target.closest('[data-bd-cbrush]'); if (cb) { const b0 = (P().brushes || []).find(x => x.id === cb.dataset.bdCbrush); if (b0) { brushPreset = b0; brush = b0.base; penWidth = b0.sw; penHard = b0.hardness; if (b0.color) penColor = b0.color; } root.querySelector('.h-bd-brushmenu')?.remove(); setTool('pen'); return; }
            if (e.target.closest('[data-bd-brushmenu]')) { brushMenu(e.target.closest('[data-bd-brushmenu]')); return; }
            const pw = e.target.closest('[data-bd-penwidth]'); if (pw) { penWidth = Number(pw.dataset.bdPenwidth); setTool('pen'); return; }
            const em = e.target.closest('[data-bd-erasemode]'); if (em) { eraserMode = em.dataset.bdErasemode; setTool('eraser'); return; }
            const pc = e.target.closest('[data-bd-pencolor]'); if (pc) { penColor = pc.dataset.bdPencolor; setTool('pen'); return; }
            const tc = e.target.closest('[data-bd-toolcolor]'); if (tc) { toolColor[tc.dataset.bdToolcolor] = tc.dataset.v; setTool(tool); return; }
            const sk = e.target.closest('[data-bd-shapekind]'); if (sk) { shapeKind = sk.dataset.bdShapekind; setTool('shape'); return; }
            if (e.target.closest('[data-bd-shapeall]')) { shapeLibrary(e.target.closest('[data-bd-shapeall]'), k => { shapeKind = k; setTool('shape'); }); return; }
            const nc = e.target.closest('[data-bd-notecolor]'); if (nc) { noteColor = nc.dataset.bdNotecolor; setTool('note'); return; }
            const z = e.target.closest('[data-bd-zoom]'); if (z) return zoomAt(view.k * (z.dataset.bdZoom === '1' ? 1.25 : 0.8));
            if (e.target.closest('[data-bd-fit]')) { fitAll(); queueSave(false); return; }
            if (e.target.closest('[data-bd-groups]')) { showGroups = !showGroups; try { localStorage.setItem('genealogie-board-groups', showGroups ? '1' : '0'); } catch (_) {} drawGroups(); toast(showGroups ? 'Les groupes sont montrés.' : 'Groupes cachés.'); return; }
            if (e.target.closest('[data-bd-add]') && !ro()) addMenu();
        });
        root.querySelector('.h-board-toolbar').addEventListener('input', e => {
            const sync = sel0 => root.querySelectorAll(sel0).forEach(x => { if (x !== e.target) x.value = e.target.value; });
            if (e.target.matches('[data-bd-penw]') && e.target.value !== '') { penWidth = Number(e.target.value); sync('[data-bd-penw]'); root.querySelectorAll('[data-bd-penwidth]').forEach(x => x.classList.toggle('is-on', Number(x.dataset.bdPenwidth) === penWidth)); }
            if (e.target.matches('[data-bd-penhard]')) { penHard = Number(e.target.value); e.target.nextElementSibling.textContent = penHard + ' %'; }
            if (e.target.matches('[data-bd-erasesize]') && e.target.value !== '') { eraserSize = Number(e.target.value); sync('[data-bd-erasesize]'); }
            if (e.target.matches('[data-bd-toolcustom]')) { toolColor[e.target.dataset.bdToolcustom] = e.target.value; root.querySelectorAll(`[data-bd-toolcolor="${e.target.dataset.bdToolcustom}"]`).forEach(x => x.classList.remove('is-on')); }
            if (e.target.matches('[data-bd-notecustom]')) { noteColor = e.target.value; root.querySelectorAll('[data-bd-notecolor]').forEach(x => x.classList.remove('is-on')); }
            if (e.target.matches('[data-bd-pencustom]')) { penColor = e.target.value; root.querySelectorAll('[data-bd-pencolor]').forEach(x => x.classList.remove('is-on')); }
            if (e.target.matches('[data-bd-connector]')) connector = e.target.value;
        });
        // la liste des pinceaux, comme dans Freeform
        function brushMenu(btn) {
            const old = root.querySelector('.h-bd-brushmenu'); if (old) { old.remove(); return; }
            const m = document.createElement('div'); m.className = 'h-bd-brushmenu';
            m.innerHTML = `<div class="h-bd-brushwidths">${WIDTHS.map(w => `<button type="button" class="${penWidth === w ? 'is-on' : ''}" data-bd-penwidth="${w}" title="${w} px"><svg viewBox="0 0 40 24"><path d="M4,18 C10,4 18,4 20,12 S30,20 36,6" fill="none" stroke="currentColor" stroke-width="${Math.max(1, w / 2)}" stroke-linecap="round"/></svg></button>`).join('')}</div>
                ${(P().brushes || []).map(b0 => `<button type="button" class="h-bd-brushrow ${brushPreset?.id === b0.id ? 'is-on' : ''}" data-bd-cbrush="${esc(b0.id)}"><span class="h-bd-check">${brushPreset?.id === b0.id ? '✓' : ''}</span><span class="h-bd-bicon">${esc(b0.icon)}</span>${esc(b0.name)}<svg class="h-bd-bsample" viewBox="0 0 60 20">${drawSvg({id: 'mc' + b0.id, brush: b0.base, color: b0.color || '#222', sw: Math.min(6, b0.sw / 2 + 1), hard: b0.hardness, dash: b0.dash, points: [[4, 14], [14, 5], [24, 9], [34, 15], [44, 10], [56, 5]]})}</svg></button>`).join('')}${(P().brushes || []).length ? '<hr>' : ''}
                ${BRUSHES.map(([k, l, i]) => `<button type="button" class="h-bd-brushrow ${brush === k && !brushPreset ? 'is-on' : ''}" data-bd-brush="${k}"><span class="h-bd-check">${brush === k && !brushPreset ? '✓' : ''}</span><span class="h-bd-bicon">${i}</span>${esc(l)}<svg class="h-bd-bsample" viewBox="0 0 60 20">${drawSvg({id: 'm' + k, brush: k, color: '#222', sw: Math.min(6, (BRUSHES.find(x => x[0] === k)[3]) / 2 + 1), points: [[4, 14], [14, 5], [24, 9], [34, 15], [44, 10], [56, 5]]})}</svg></button>`).join('')}
                <button type="button" class="h-bd-brushrow" data-bd-tool="eraser"><span class="h-bd-check"></span><span class="h-bd-bicon">🧽</span>Gomme</button>`;
            btn.closest('.h-bd-brushpick').appendChild(m);
            setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !btn.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
        }
        // ── la souris sur la toile ──
        let drag = null, spaceDown = false;
        stage.addEventListener('pointerdown', e => {
            if (e.target.closest('.h-bi-text[contenteditable="true"], audio, video, iframe, input, select, textarea, [data-bd-openlink]')) return;
            // un clic sur la toile quitte le champ du panneau où l'on écrivait (sinon les raccourcis du tableau ne marchent plus)
            const ae = document.activeElement; if (ae && ae !== document.body && root.contains(ae) && !stage.contains(ae) && ae.matches('input, select, textarea')) ae.blur();
            const [wx, wy] = toWorld(e.clientX, e.clientY);
            if (tool === 'hand' || spaceDown || e.button === 1) { drag = {kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y}; stage.setPointerCapture(e.pointerId); return; }
            if (boardLocked) { if (tool !== 'select' && ro()) return; const hit0 = e.target.closest('[data-bi]'); sel = hit0 ? new Set([hit0.dataset.bi]) : new Set(); render(); drag = {kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y}; stage.setPointerCapture(e.pointerId); return; }
            const fold = e.target.closest('[data-bd-fold]'); if (fold) { const f = byId(fold.closest('[data-bi]').dataset.bi); if (f) toggleFrame(f); return; }
            const cb = e.target.closest('[data-bd-cmt]'); if (cb && tool === 'select') { const it0 = byId(cb.closest('[data-bi]').dataset.bi); if (it0) { sel = new Set([it0.id]); render(); commentsDialog(it0); } return; }
            const bh = e.target.closest('[data-bd-bend], [data-bd-addbend]');
            if (bh) { const l = byId([...sel][0]); if (!l || l.type !== 'line' || l.locked) return;
                if (bh.dataset.bdAddbend !== undefined) { if (!l.bends?.length) l.bends = routePts(l).slice(1, -1).map(v => [...v]); l.bends.splice(Number(bh.dataset.bdAddbend), 0, [wx, wy]); drag = {kind: 'bend', line: l, i: Number(bh.dataset.bdAddbend)}; }
                else drag = {kind: 'bend', line: l, i: Number(bh.dataset.bdBend)};
                stage.setPointerCapture(e.pointerId); render(); return; }
            const handle = e.target.closest('[data-bd-handle]'), end = e.target.closest('[data-bd-end]');
            if (end) { const l = byId([...sel][0]); drag = {kind: 'end', line: l, i: Number(end.dataset.bdEnd)}; stage.setPointerCapture(e.pointerId); return; }
            if (handle) { const list = [...sel].map(byId); drag = {kind: 'resize', h: handle.dataset.bdHandle, bb: bbox(list), start: list.map(i => ({id: i.id, x: i.x, y: i.y, w: i.w, h: i.h, fs: i.fs})), wx, wy}; stage.setPointerCapture(e.pointerId); return; }
            const hitEl = e.target.closest('[data-bi]'), hit = hitEl && byId(hitEl.dataset.bi);
            const gt = e.target.closest('[data-bd-grp]');
            if (gt && tool === 'select') { sel = new Set(items.filter(i => i.group === gt.dataset.bdGrp).map(i => i.id)); render(); const mv = [...sel].map(byId).filter(i => i && !i.locked); drag = {kind: 'move', wx, wy, start: moveStart(mv), moved: false}; stage.setPointerCapture(e.pointerId); return; }
            if (hit?.type === 'table' && tool === 'select') { const td = e.target.closest('td[data-r]'); if (td && e.shiftKey && cellSel?.id === hit.id && sel.has(hit.id)) { cellSel = {...cellSel, r2: Number(td.dataset.r), c2: Number(td.dataset.c)}; render(); return; } cellSel = td ? {id: hit.id, r: Number(td.dataset.r), c: Number(td.dataset.c)} : null; }
            if (tool === 'eraser') { drag = {kind: 'erase'}; eraseAt(e); stage.setPointerCapture(e.pointerId); return; }
            if (tool === 'pen') { const d = {id: uid(), type: 'draw', brush, color: penColor, sw: penWidth, ...(penHard < 100 ? {hard: penHard} : {}), ...(brushPreset ? {opacity: brushPreset.opacity < 1 ? brushPreset.opacity : undefined, dash: brushPreset.dash || undefined} : {}), points: [[wx, wy]], x: wx, y: wy, w: 1, h: 1, z: topZ() + 1, ...(activeLayer ? {layer: activeLayer} : {})}; drag = {kind: 'draw', d, raw: [[wx, wy]]}; items.push(d); stage.setPointerCapture(e.pointerId); return; }
            if (tool === 'line' || tool === 'arrow') { const l = {id: uid(), type: 'line', points: [[wx, wy], [wx, wy]], color: toolColor.line, ...(toolColor.head && tool === 'arrow' ? {headColor: toolColor.head} : {}), sw: 2.5, arrowEnd: tool === 'arrow', headEnd: tool === 'arrow' ? (P().headEnd && P().headEnd !== 'none' ? P().headEnd : 'triangle') : 'none', headStart: tool === 'arrow' ? (P().headStart || 'none') : 'none', from: hit && hit.type !== 'line' ? hit.id : '', x: wx, y: wy, w: 4, h: 4, z: topZ() + 1, ...(activeLayer ? {layer: activeLayer} : {}), ...(connector && tool === 'arrow' ? connectorProps(connector) : {})}; items.push(l); drag = {kind: 'end', line: l, i: 1, fresh: true}; stage.setPointerCapture(e.pointerId); return; }
            if (tool === 'text') { const t = place({type: 'text', text: '', w: 260, h: 40, fs: 20, color: toolColor.text}, [wx + 130, wy + 20], true); setTool('select'); setTimeout(() => editText(t), 0); return; }
            if (tool === 'note') { const n = place({type: 'note', text: '', w: 180, h: 160, fill: noteColor, fs: 18}, [wx, wy], true); setTool('select'); setTimeout(() => editText(n), 0); return; }
            if (tool === 'table') { const t = place(newTable(), [wx + 180, wy + 70]); setTool('select'); sel = new Set([t.id]); cellSel = {id: t.id, r: 0, c: 0}; render(); return; }
            if (tool === 'shape') { drag = {kind: 'newshape', sx: wx, sy: wy, it: null}; stage.setPointerCapture(e.pointerId); return; }
            // choisir / déplacer
            if (hit) {
                const grp = groupOf(hit).map(i => i.id);
                if (e.shiftKey) { const has = sel.has(hit.id); grp.forEach(id0 => has ? sel.delete(id0) : sel.add(id0)); }
                else if (!sel.has(hit.id)) sel = new Set(grp);
                // ⌥ / Alt + glisser : on emporte une copie (comme dans Photoshop), l'original reste en place
                let dupOrig = null;
                if (e.altKey && !e.shiftKey && !boardLocked) {
                    const base = selItems().filter(i => !i.locked), src = [...new Set([...base, ...base.filter(i => i.type === 'frame').flatMap(f => framed(f).filter(i => !i.locked && !lockedIds.has(i.id)))])]; // un cadre emporte la copie de ce qu'il contient
                    if (src.length) { dupOrig = [...sel]; const copies = duplicateInPlace(src); sel = new Set(copies.map(c => c.id)); }
                }
                drawSelection(); render();
                const movable = [...sel].map(byId).filter(i => i && !i.locked);
                if (movable.length) drag = {kind: 'move', wx, wy, start: dupOrig ? movable.map(i => ({id: i.id, x: i.x, y: i.y, pts: i.type === 'line' ? clone(i.points) : null})) : moveStart(movable), moved: false, dupOrig};
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
                if (snapOn && !e.altKey) [dx, dy] = snapMove(drag, dx, dy);
                for (const s0 of drag.start) { const it = byId(s0.id); if (s0.bends === undefined) s0.bends = it.bends ? clone(it.bends) : null; it.x = s0.x + dx; it.y = s0.y + dy; if (s0.pts) { it.points = s0.pts.map(p => [p[0] + dx, p[1] + dy]); } if (s0.bends) it.bends = s0.bends.map(p => [p[0] + dx, p[1] + dy]); }
                render(); return;
            }
            if (drag.kind === 'resize') {
                const {bb, h} = drag; let x0 = bb.x, y0 = bb.y, x1 = bb.x + bb.w, y1 = bb.y + bb.h;
                if (h.includes('w')) x0 = Math.min(wx, x1 - 10); if (h.includes('e')) x1 = Math.max(wx, x0 + 10);
                if (h.includes('n')) y0 = Math.min(wy, y1 - 10); if (h.includes('s')) y1 = Math.max(wy, y0 + 10);
                if (snapOn && !e.altKey) { const g = v => Math.round(v / 24) * 24; if (h.includes('w')) x0 = Math.min(g(x0), x1 - 10); if (h.includes('e')) x1 = Math.max(g(x1), x0 + 10); if (h.includes('n')) y0 = Math.min(g(y0), y1 - 10); if (h.includes('s')) y1 = Math.max(g(y1), y0 + 10); }
                if (e.shiftKey || drag.start.some(s0 => ['media', 'webimage'].includes(byId(s0.id).type))) { const r = bb.w / bb.h; if (h.length === 2 || h === 'e' || h === 'w') { const nh = (x1 - x0) / r; if (h.includes('n')) y0 = y1 - nh; else y1 = y0 + nh; } else { const nw = (y1 - y0) * r; if (h.includes('w')) x0 = x1 - nw; else x1 = x0 + nw; } }
                const sx = (x1 - x0) / bb.w, sy = (y1 - y0) / bb.h;
                for (const s0 of drag.start) { const it = byId(s0.id); it.x = x0 + (s0.x - bb.x) * sx; it.y = y0 + (s0.y - bb.y) * sy; it.w = Math.max(8, s0.w * sx); it.h = Math.max(8, s0.h * sy); if (it.type === 'text' && s0.fs && drag.start.length > 1) it.fs = Math.max(6, s0.fs * Math.min(sx, sy)); }
                render(); return;
            }
            if (drag.kind === 'bend') { const l = drag.line; if (l.bends?.[drag.i]) { let v = [wx, wy]; if (snapOn && !e.altKey) v = v.map(c => Math.round(c / 24) * 24); l.bends[drag.i] = v; render(); } return; }
            if (drag.kind === 'end') {
                const l = drag.line, el = document.elementsFromPoint(e.clientX, e.clientY).map(x => x.closest?.('[data-bi]')).find(x => x && x.dataset.bi !== l.id), target = el && byId(el.dataset.bi);
                const key = drag.i === 0 ? 'from' : 'to';
                l[key] = target && target.type !== 'line' && target.id !== l.id ? target.id : '';
                l.points[drag.i] = [wx, wy]; render(); return;
            }
            if (drag.kind === 'draw') { const r0 = drag.raw[drag.raw.length - 1]; if (Math.hypot(wx - r0[0], wy - r0[1]) * view.k < 1.5) return; drag.raw.push([wx, wy]); const xs = drag.raw.map(p => p[0]), ys = drag.raw.map(p => p[1]); const x0 = Math.min(...xs), y0 = Math.min(...ys), d = drag.d; d.x = x0 - d.sw; d.y = y0 - d.sw; d.w = Math.max(...xs) - x0 + d.sw * 2; d.h = Math.max(...ys) - y0 + d.sw * 2; d.vw = d.w; d.vh = d.h; d.points = drag.raw.map(p => [p[0] - d.x, p[1] - d.y]); render(); return; }
            if (drag.kind === 'erase') { eraseAt(e); moveEraser(e); return; }
            if (drag.kind === 'newshape') {
                const x0 = Math.min(wx, drag.sx), y0 = Math.min(wy, drag.sy), w = Math.abs(wx - drag.sx), h = Math.abs(wy - drag.sy);
                if (!drag.it && w + h > 6) { drag.it = {id: uid(), ...newShape(), z: topZ() + 1, ...(activeLayer ? {layer: activeLayer} : {})}; items.push(drag.it); }
                if (drag.it) { Object.assign(drag.it, {x: x0, y: y0, w: Math.max(10, w), h: Math.max(10, e.shiftKey ? w : h)}); render(); }
                return;
            }
            if (drag.kind === 'marquee') {
                const m = root.querySelector('[data-bd-marquee]'), r = stage.getBoundingClientRect();
                const x0 = Math.min(e.clientX, drag.sx) - r.left, y0 = Math.min(e.clientY, drag.sy) - r.top;
                Object.assign(m.style, {left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - drag.sx) + 'px', height: Math.abs(e.clientY - drag.sy) + 'px'}); m.hidden = false;
                const X0 = Math.min(wx, drag.wx), Y0 = Math.min(wy, drag.wy), X1 = Math.max(wx, drag.wx), Y1 = Math.max(wy, drag.wy);
                sel = new Set(drag.base); items.forEach(i => { if (hiddenIds.has(i.id) || lockedIds.has(i.id)) return; if (i.x < X1 && i.x + i.w > X0 && i.y < Y1 && i.y + i.h > Y0) groupOf(i).forEach(g => sel.add(g.id)); });
                render();
            }
        });
        const endDrag = () => {
            if (!drag) return;
            const d = drag; drag = null; root.querySelector('[data-bd-marquee]').hidden = true; guides.innerHTML = '';
            if (d.kind === 'bend') { commit(); return; }
            if (d.kind === 'pan') { queueSave(false); return; }
            if (d.kind === 'draw') { if (d.raw.length < 2) { const p = d.d; p.points = [[p.sw, p.sw]]; p.w = p.h = p.vw = p.vh = p.sw * 2; } render(); commit(); return; }
            if (d.kind === 'end') { const l = d.line; if (d.fresh && Math.hypot(l.points[1][0] - l.points[0][0], l.points[1][1] - l.points[0][1]) < 6 && !l.to) { items = items.filter(i => i !== l); render(); return; } sel = new Set([l.id]); render(); commit(); if (d.fresh) setTool('select'); return; }
            if (d.kind === 'newshape') { if (!d.it) { place(newShape({w: 160, h: 110}), [d.sx, d.sy]); } else { sel = new Set([d.it.id]); render(); commit(); } setTool('select'); return; }
            if (d.kind === 'move' && !d.moved) { if (d.dupOrig) { const ids = new Set(d.start.map(s0 => s0.id)); items = items.filter(i => !ids.has(i.id)); sel = new Set(d.dupOrig); render(); } return; } // ⌥ + clic sans glisser : pas de copie
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
            for (const it of items.filter(i => i.type === 'draw' && !i.locked && !hiddenIds.has(i.id) && !lockedIds.has(i.id) && wx > i.x - r && wx < i.x + i.w + r && wy > i.y - r && wy < i.y + i.h + r)) {
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
            if (under?.closest('[data-bd-fold], [data-bd-cmt]')) return;
            const bend = under?.closest('[data-bd-bend]'); if (bend && sel.size === 1) { const l = byId([...sel][0]); if (l?.bends && !ro()) { l.bends.splice(Number(bend.dataset.bdBend), 1); if (!l.bends.length) delete l.bends; render(); commit(); } return; }
            if (under?.closest('.h-board-sel') && sel.size === 1) { const one = byId([...sel][0]); if (one) { if (['text', 'note', 'shape'].includes(one.type)) return editText(one); if (one.type === 'table') { const td = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.matches?.('td[data-r]')); return editCell(one, td ? Number(td.dataset.r) : cellSel?.r || 0, td ? Number(td.dataset.c) : cellSel?.c || 0); } return openItem(one); } }
            if (!it) { if (tool === 'select' && !boardLocked) { const [wx, wy] = toWorld(e.clientX, e.clientY); const t = place({type: 'text', text: '', w: 260, h: 40, fs: 20, color: toolColor.text}, [wx + 130, wy + 20], true); setTimeout(() => editText(t), 0); } return; }
            if (['text', 'note', 'shape'].includes(it.type)) return editText(it);
            if (it.type === 'table') { const td = under.closest('td[data-r]'); return editCell(it, td ? Number(td.dataset.r) : 0, td ? Number(td.dataset.c) : 0); }
            openItem(it);
        });
        stage.addEventListener('click', e => { const o = e.target.closest('[data-bd-openlink]'); if (o) { const it = byId(o.closest('[data-bi]').dataset.bi); openItem(it); } });
        // ── tableur : écrire dans une cellule (Tab, Entrée pour passer à la suivante ; coller un bout de tableur) ──
        function newTable() { // comme réglé dans Maintenance → Réglages des tableaux → Tableur
            const t0 = {rows: 4, cols: 3, header: true, hcol: false, stripes: true, hfill: '#e8eef7', fs: 14, headers: 'Nom;Année;Lieu', ...(P().table || {})};
            const heads = String(t0.headers || '').split(';').map(x => x.trim()), cols = Math.max(1, Math.min(30, t0.cols)), rows = Math.max(1, Math.min(100, t0.rows));
            const cells = Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => r === 0 && t0.header ? heads[c] || '' : ''));
            const rh = t0.fs * 2.2;
            return {type: 'table', cells, colw: Array(cols).fill(120), header: !!t0.header, hcol: !!t0.hcol, stripes: !!t0.stripes, fs: t0.fs, color: '#111111', hfill: t0.hfill, w: Math.min(1400, cols * 120), h: Math.min(2400, rows * rh), ...(P().radius ? {} : {})};
        }
        function newShape(extra = {}) { const p = P(), o = shapeItem(shapeKind); Object.keys(o).forEach(k => o[k] === undefined && delete o[k]); return {type: 'shape', fill: toolColor.shape, stroke: '#1d3557', sw: 2, text: '', fs: 18, color: '#111111', ...(shapeKind === 'round' ? {radius: p.radius ?? 14} : {}), ...o, ...extra}; }
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
        function tableOp(it, op, r, c, quiet = false) {
            if (!it || ro()) return;
            normTable(it);
            const mine = cellSel?.id === it.id;
            r = Math.max(0, Math.min(it.cells.length - 1, r ?? (mine ? cellSel.r : it.cells.length - 1)));
            c = Math.max(0, Math.min(it.cells[0].length - 1, c ?? (mine ? cellSel.c : 0)));
            const rows = it.cells.length, cols = it.cells[0].length, rh = it.h / rows;
            let changed = false;
            const shiftFill = (fn) => { const nf = {}; Object.entries(it.cfill || {}).forEach(([k, v]) => { const [a, b2] = k.split(':').map(Number); const n = fn(a, b2); if (n) nf[n.join(':')] = v; }); it.cfill = nf; };
            if (op === 'row+' && rows < 100) { changed = true; it.cells.splice(r + 1, 0, Array(cols).fill('')); it.h += rh; shiftFill((a, b2) => [a > r ? a + 1 : a, b2]); }
            if (op === 'row-' && rows > 1) { changed = true; it.cells.splice(r, 1); it.h = Math.max(30, it.h - rh); shiftFill((a, b2) => a === r ? null : [a > r ? a - 1 : a, b2]); if (cellSel) cellSel.r = Math.min(cellSel.r, rows - 2); }
            if (op === 'col+' && cols < 30) { changed = true; it.cells.forEach(row => row.splice(c + 1, 0, '')); it.colw.splice(c + 1, 0, 100); it.w += it.w / cols; shiftFill((a, b2) => [a, b2 > c ? b2 + 1 : b2]); }
            if (op === 'col-' && cols > 1) { changed = true; it.cells.forEach(row => row.splice(c, 1)); const w0 = it.colw.splice(c, 1)[0]; it.w = Math.max(40, it.w - it.w * w0 / (it.colw.reduce((s, x) => s + x, 0) + w0)); shiftFill((a, b2) => b2 === c ? null : [a, b2 > c ? b2 - 1 : b2]); if (cellSel) cellSel.c = Math.min(cellSel.c, cols - 2); }
            if (op === 'wider' || op === 'narrower') { it.colw[c] = Math.max(30, Math.min(800, (it.colw[c] || 100) * (op === 'wider' ? 1.25 : 0.8))); }
            if (op === 'clear') { it.cells[r][c] = ''; }
            if (op === 'merge' && mine && cellSel.r2 !== undefined) {
                cellSel.r2 = Math.min(cellSel.r2, it.cells.length - 1); cellSel.c2 = Math.min(cellSel.c2, it.cells[0].length - 1);
                const r0 = Math.min(cellSel.r, cellSel.r2), c0 = Math.min(cellSel.c, cellSel.c2), rs = Math.abs(cellSel.r2 - cellSel.r) + 1, cs = Math.abs(cellSel.c2 - cellSel.c) + 1;
                // on retire les fusions qui chevauchent, on garde les textes en les mettant bout à bout dans la première cellule
                it.merges = (it.merges || []).filter(m => m.r + m.rs <= r0 || m.r >= r0 + rs || m.c + m.cs <= c0 || m.c >= c0 + cs);
                const texts = []; for (let rr = r0; rr < r0 + rs; rr++) for (let cc = c0; cc < c0 + cs; cc++) { const v = String(it.cells[rr]?.[cc] ?? '').trim(); if (v) texts.push(v); if (rr !== r0 || cc !== c0) it.cells[rr][cc] = ''; }
                it.cells[r0][c0] = texts.join(' ');
                it.merges.push({r: r0, c: c0, rs, cs}); cellSel = {id: it.id, r: r0, c: c0};
            }
            if (op === 'unmerge') it.merges = (it.merges || []).filter(m => !(r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs));
            // lignes et colonnes ajoutées ou enlevées : les fusions suivent
            if (changed && it.merges?.length) it.merges = it.merges.map(m => {
                const n = {...m};
                if (op === 'row+') { if (m.r > r) n.r++; else if (m.r + m.rs - 1 > r) n.rs++; }
                if (op === 'row-') { if (m.r > r) n.r--; else if (m.r + m.rs - 1 >= r) n.rs--; }
                if (op === 'col+') { if (m.c > c) n.c++; else if (m.c + m.cs - 1 > c) n.cs++; }
                if (op === 'col-') { if (m.c > c) n.c--; else if (m.c + m.cs - 1 >= c) n.cs--; }
                return n;
            }).filter(m => m.rs >= 1 && m.cs >= 1 && m.rs * m.cs > 1);
            clampCell();
            sigs.delete(it.id); render(); if (!quiet) commit();
        }
        // la cellule (ou la plage) choisie reste dans la grille après une ligne/colonne enlevée ou un retour en arrière
        function clampCell() {
            if (!cellSel) return; const t0 = byId(cellSel.id); if (!t0?.cells?.length) { cellSel = null; return; }
            const R = t0.cells.length - 1, C = Math.max(0, ...t0.cells.map(x => x.length)) - 1, cl = (v, m) => Math.max(0, Math.min(m, v));
            cellSel = {...cellSel, r: cl(cellSel.r, R), c: cl(cellSel.c, C), ...(cellSel.r2 !== undefined ? {r2: cl(cellSel.r2, R), c2: cl(cellSel.c2, C)} : {})};
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
            if (it.type === 'person' || (it.type === 'timeline' && it.person_id)) { S().currentPersonId = Number(it.person_id); return A().setModule('personnes'); }
            if (it.type === 'map' && /^(person|family|investigation):/.test(it.mapSrc || '')) { const [k, v] = it.mapSrc.split(':'); if (k === 'investigation') { Object.assign(S(), {enquetesTab: 'enquetes', currentBattueId: 0, currentInvestigationId: Number(v)}); return A().setModule('enquetes'); } S().currentPersonId = Number(v); return A().setModule('personnes'); }
            if (it.type === 'frame') return toggleFrame(it);
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
            if (clipboard && (text === '' || text === clipMark)) { e.preventDefault(); pasteInternal(); return; }
            if (ro()) { e.preventDefault(); return; }
            if (/^https?:\/\/\S+$/.test(text.trim())) { e.preventDefault(); addUrl(text.trim()); return; }
            if (text.trim()) { e.preventDefault(); if (/[\t\n]/.test(text.trim())) return pasteDialog(text); place({type: 'text', text, w: 320, h: Math.min(600, 28 + text.split('\n').length * 26), fs: 18, color: '#111111'}); }
        };
        document.addEventListener('paste', onPaste);
        // ⌘C sur le tableau : on marque le presse-papiers du système, pour que ⌘V recolle nos éléments (et pas un vieux texte)
        let clipMark = '';
        const onCopy = e => {
            if (!root.isConnected || editing || !sel.size || e.target.closest?.('input, textarea, [contenteditable="true"]') || !(root.contains(document.activeElement) || document.activeElement === document.body)) return;
            clipboard = selItems().map(clone); clipMark = '⟦LCNDA-tableau ' + uid() + '⟧';
            e.clipboardData?.setData('text/plain', clipMark); e.preventDefault();
        };
        document.addEventListener('copy', onCopy);
        function addUrl(url, at) {
            if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url)) place({type: 'webimage', url, w: 320, h: 220}, at);
            else place({type: 'weblink', url, title: '', w: 240, h: 120}, at);
        }
        // ── clavier ──
        const typing = e => e.target.closest?.('input, textarea, select, [contenteditable="true"]');
        const selItems = () => [...sel].map(byId).filter(Boolean);
        // des copies posées au même endroit (traits entre copies raccrochés, groupes recréés)
        function duplicateInPlace(list) {
            const zTop = topZ() + 1, z0 = Math.min(...list.map(i => i.z || 0)), map = new Map(), group = new Map();
            const copies = list.map(i => { const n = {...clone(i), id: uid(), z: zTop + (i.z || 0) - z0}; map.set(i.id, n.id); if (i.group) { if (!group.has(i.group)) group.set(i.group, uid()); n.group = group.get(i.group); } delete n.cmt; return n; });
            // un trait copié seul garde sa forme mais ne reste pas accroché aux originaux (sinon il retomberait dessus)
            copies.forEach(n => { if (n.type !== 'line') return; if (n.from) n.from = map.get(n.from) || ''; if (n.to) n.to = map.get(n.to) || ''; });
            items.push(...copies); return copies;
        }
        function pasteInternal() {
            if (!clipboard?.length || ro()) return;
            const z0 = Math.min(...clipboard.map(i => i.z || 0)), zTop = topZ() + 1;
            const map = new Map(), group = new Map();
            const copies = clipboard.map(i => { const n = {...clone(i), id: uid(), x: i.x + 30, y: i.y + 30, z: zTop + (i.z || 0) - z0}; map.set(i.id, n.id); if (i.group) { if (!group.has(i.group)) group.set(i.group, uid()); n.group = group.get(i.group); } if (n.points && n.type === 'line') n.points = n.points.map(p => [p[0] + 30, p[1] + 30]); if (n.bends) n.bends = n.bends.map(p => [p[0] + 30, p[1] + 30]); return n; });
            copies.forEach(n => { if (n.from) n.from = map.get(n.from) || ''; if (n.to) n.to = map.get(n.to) || ''; });
            items.push(...copies); sel = new Set(copies.map(c => c.id)); clipboard = copies.map(clone); render(); commit();
        }
        const actions0 = {
            delete: () => { const ids = new Set(selItems().filter(i => !i.locked).map(i => i.id)); if (!ids.size) return; items = items.filter(i => !ids.has(i.id)); items.forEach(i => { if (ids.has(i.from)) i.from = ''; if (ids.has(i.to)) i.to = ''; }); sel.clear(); render(); commit(); },
            duplicate: () => { clipboard = selItems().map(clone); pasteInternal(); },
            copy: () => { clipboard = selItems().map(clone); toast(`${clipboard.length} élément${clipboard.length > 1 ? 's' : ''} copié${clipboard.length > 1 ? 's' : ''}.`); },
            toshape: () => shapeMaker(null, selItems().filter(i => i.type === 'draw')),
            group: () => { const l = selItems(); if (l.length < 2) return; const g = uid(); l.forEach(i => { i.group = g; }); render(); commit(); },
            ungroup: () => { selItems().forEach(i => { i.group = ''; }); render(); commit(); },
            lock: () => { const l = selItems(); const v = !l.every(i => i.locked); l.forEach(i => { i.locked = v; }); render(); commit(); },
            front: () => { let z = topZ(); selItems().forEach(i => { i.z = ++z; }); render(); commit(); },
            back: () => { let z = items.reduce((m, i) => Math.min(m, i.z || 0), 0); selItems().forEach(i => { i.z = --z; }); render(); commit(); },
            all: () => { sel = new Set(items.map(i => i.id)); render(); },
        };
        const actions = Object.fromEntries(Object.entries(actions0).map(([k, f]) => [k, (...a) => (['all', 'copy'].includes(k) || !ro()) && f(...a)]));
        const onKey = e => {
            if (!root.isConnected || document.querySelector('dialog[open]') || root.classList.contains('is-present')) return; // en présentation, ses propres touches
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
            if (k.startsWith('arrow') && sel.size) { e.preventDefault(); const st = e.shiftKey ? 10 : 1; moveStart(selItems().filter(i => !i.locked)).map(s0 => byId(s0.id)).forEach(i => { if (k === 'arrowleft') i.x -= st; if (k === 'arrowright') i.x += st; if (k === 'arrowup') i.y -= st; if (k === 'arrowdown') i.y += st; const ddx = k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0, ddy = k === 'arrowup' ? -st : k === 'arrowdown' ? st : 0; if (i.type === 'line') { i.points = i.points.map(p => [p[0] + ddx, p[1] + ddy]); if (i.bends) i.bends = i.bends.map(p => [p[0] + ddx, p[1] + ddy]); } }); render(); commit(); return; }
            if (mod) return;
            const tk = {v: 'select', h: 'hand', t: 'text', n: 'note', s: 'shape', l: 'line', a: 'arrow', p: 'pen', e: 'eraser', g: 'table'}[k]; if (tk) setTool(tk);
            if (k === '+' || k === '=') zoomAt(view.k * 1.25); if (k === '-') zoomAt(view.k * 0.8); if (k === '0') { fitAll(); }
        };
        const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.dataset.tool = tool; } };
        window.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp);
        // ── propriétés de la sélection ──
        // les réglages d'une légende, dans l'ordre choisi (Maintenance → Réglages des tableaux → Menus et options)
        function legendParts(one) {
            const p = P(), tMin = p.textMin ?? 6, tMax = p.textMax ?? 200;
            const numField = (k, label, min, max, step, val, unit = 'px', boxMin = min, boxMax = max) => `<label>${label}<span class="h-bd-num"><input type="range" min="${min}" max="${max}" step="${step}" value="${Math.max(min, Math.min(max, val))}" data-bd-num="${k}"><input type="number" class="h-bd-numbox" min="${boxMin}" max="${boxMax}" step="${step}" value="${+Number(val).toFixed(2)}" data-bd-num="${k}"><small>${unit}</small></span></label>`;
            const sw = (k, list) => `<div class="h-bd-sws">${list.map(c => `<button type="button" class="h-sw ${one[k] === c ? 'is-on' : ''}" style="background:${c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/8px 8px' : c}" data-bd-set="${k}" data-v="${c}" title="${c}"></button>`).join('')}<input type="color" data-bd-setc="${k}" value="${/^#[0-9a-f]{6}$/i.test(one[k] || '') ? one[k] : '#111111'}" title="Autre couleur"></div>`;
            const parts = {
                lbSize: () => numField('lbSize', 'Taille du texte', tMin, Math.min(tMax, 120), 1, one.lbSize || 13, 'px', 2, 500),
                lbFont: () => `<label>Police <select data-bd-sel="lbFont"><option value="">Police du thème</option>${(p.fontLists || []).map(L => `<optgroup label="${esc(L.name)}">${L.fonts.map(f => `<option value="${esc(f)}" ${one.lbFont === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>`).join('')}${one.lbFont && !(p.fontLists || []).some(L => L.fonts.includes(one.lbFont)) ? `<option selected value="${esc(one.lbFont)}">${esc(one.lbFont)}</option>` : ''}</select></label>`,
                lbStyle: () => `<div class="h-bd-row">${[['lbBold', '<b>G</b>', 'Gras'], ['lbItalic', '<i>I</i>', 'Italique']].map(([k, h, lb]) => `<button type="button" class="h-bt ${one[k] ? 'is-on' : ''}" data-bd-toggle="${k}" title="${lb}">${h}</button>`).join('')}</div>`,
                lbColor: () => `<label>Couleur du texte</label>${sw('lbColor', pal('label'))}`,
                lbBg: () => `<label>Fond du cadre</label>${sw('lbBg', pal('labelbg'))}`,
                lbBorder: () => `<label>Bord du cadre</label>${sw('lbBorder', pal('labelborder').filter(c => c !== 'transparent'))}`,
                lbBw: () => numField('lbBw', 'Épaisseur du bord', 0, 10, 0.5, one.lbBw ?? 0, 'px', 0, 20),
                lbPad: () => numField('lbPad', 'Marge dans le cadre', 0, 30, 1, one.lbPad ?? 4, 'px', 0, 40),
                lbRadius: () => numField('lbRadius', 'Arrondi du cadre', 0, 30, 1, one.lbRadius ?? 4, 'px', 0, 40),
                lbPos: () => numField('lbPos', 'Position le long du trait', 0, 100, 1, one.lbPos ?? 50, '%', 0, 100),
                lbSide: () => `<label>Côté <select data-bd-sel="lbSide">${[['on', 'sur le trait'], ['above', 'au-dessus'], ['below', 'en dessous']].map(([k, l]) => `<option value="${k}" ${(one.lbSide || 'on') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`,
                lbOffset: () => numField('lbOffset', 'Écart avec le trait', 0, 80, 1, one.lbOffset ?? 14, 'px', 0, 200),
                lbRotate: () => `<label class="checkbox-line"><input type="checkbox" data-bd-check="lbRotate" ${one.lbRotate ? 'checked' : ''}> <span>suivre l’angle du trait</span></label>`,
            };
            return ordered(p.legendOrder, p.legendHidden, Object.keys(parts)).map(k => parts[k]()).join('');
        }
        function renderInspector() {
            const p = P(), l = selItems();
            if (!l.length) {
                inspector.innerHTML = `<h4>Tableau</h4><p class="muted">${fmt(items.length)} élément${items.length > 1 ? 's' : ''}. Choisis un élément pour le régler.</p>
                    <label>Fond du tableau</label><div class="h-bd-sws">${pal('bg').map(c => `<button type="button" class="h-sw" style="background:${c}" data-bd-bgset="${c}" title="${c}"></button>`).join('')}<input type="color" data-bd-bgset2 value="${esc(bgColor)}" title="Autre couleur"></div>
                    <p class="muted h-bd-keys">⌘Z annuler · ⌘D dupliquer · ⌘G grouper (⇧ pour dégrouper) · ⌘L verrouiller · ] [ devant / derrière · flèches pour pousser · espace pour se déplacer · ⌘ + molette pour zoomer · coller une image ou une adresse web.</p>
                    <p class="muted"><small>Couleurs, formes, polices, tailles, ordre des menus : Maintenance → Réglages des tableaux.</small></p>`;
                return;
            }
            const one = l.length === 1 ? l[0] : null, t = one?.type, types = new Set(l.map(i => i.type)), any = (...ts) => ts.some(x => types.has(x));
            const numField = (k, label, min, max, step, val, unit = 'px', boxMin = min, boxMax = max) => `<label>${label}<span class="h-bd-num"><input type="range" min="${min}" max="${max}" step="${step}" value="${Math.max(min, Math.min(max, val))}" data-bd-num="${k}"><input type="number" class="h-bd-numbox" min="${boxMin}" max="${boxMax}" step="${step}" value="${+Number(val).toFixed(2)}" data-bd-num="${k}"><small>${unit}</small></span></label>`;
            const heads = (p.heads || HEADS_LIST.map(h => h[0])).filter(h => !(p.headsHidden || []).includes(h) || h === headOf(one || {}, 'start') || h === headOf(one || {}, 'end'));
            const headSel = (k, cur) => `<select data-bd-sel="${k}">${[...new Set([...heads, cur])].map(v => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(HEADS_LIST.find(h => h[0] === v)?.[1] || v)}</option>`).join('')}</select>`;
            const swatches = (k, list) => `<div class="h-bd-sws">${list.map(c => `<button type="button" class="h-sw ${one?.[k] === c ? 'is-on' : ''}" style="background:${c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/8px 8px' : c}" data-bd-set="${k}" data-v="${c}" title="${c}"></button>`).join('')}<input type="color" data-bd-setc="${k}" value="${/^#[0-9a-f]{6}$/i.test(one?.[k] || '') ? one[k] : '#111111'}" title="Autre couleur"></div>`;
            const grp = !one && l[0].group && l.every(i => i.group === l[0].group) && items.filter(i => i.group === l[0].group).length === l.length ? groupNames().indexOf(l[0].group) + 1 : 0;
            const cs = one && t === 'table' && cellSel?.id === one.id ? cellSel : null;
            const sMin = p.strokeMin ?? 0.5, sMax = p.strokeMax ?? 60, tMin = p.textMin ?? 6, tMax = p.textMax ?? 200;
            const textTypes = ['text', 'note', 'shape', 'table', 'tag'];
            const fontOpts = () => { const lists = p.fontLists || [], cur = one?.font || ''; const inLists = lists.some(L => L.fonts.includes(cur)); return `<option value="">Police du thème</option>${lists.map(L => `<optgroup label="${esc(L.name)}">${L.fonts.map(f => `<option value="${esc(f)}" ${cur === f ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</optgroup>`).join('')}${cur && !inLists ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}`; };
            const merged = cs ? (one.merges || []).find(m => cs.r >= m.r && cs.r < m.r + m.rs && cs.c >= m.c && cs.c < m.c + m.cs) : null;
            const range = cs && (cs.r2 !== undefined) ? {r: Math.min(cs.r, cs.r2), c: Math.min(cs.c, cs.c2), rs: Math.abs(cs.r2 - cs.r) + 1, cs: Math.abs(cs.c2 - cs.c) + 1} : null;
            const SECTIONS = {
                fill: () => any('shape', 'note', 'tag', 'folder', 'frame') ? `<label>Fond</label>${swatches('fill', t === 'note' ? pal('note') : pal('fill'))}` : '',
                stroke: () => any('shape', 'frame') ? `<label>Bord</label>${swatches('stroke', pal('stroke'))}`
                    : any('media', 'webimage') ? `<label>Contour</label>${swatches('stroke', pal('stroke'))}${numField('bw', 'Épaisseur du contour', 0, Math.min(sMax, 60), 0.5, one?.bw || 0, 'px', 0, 200)}` : '',
                color: () => any('text', 'note', 'shape', 'line', 'draw', 'tag', 'table') ? `<label>${t === 'line' || t === 'draw' ? 'Couleur' : 'Texte'}</label>${swatches('color', t === 'draw' ? pal('pen') : pal('text'))}` : '',
                sw: () => any('shape', 'line', 'draw') ? `${numField('sw', 'Épaisseur', sMin, sMax, 0.5, one?.sw ?? 2, 'px', 0, 500)}<label>Trait <select data-bd-sel="dash">${LINE_DASHES.map(([k, lb]) => `<option value="${k}" ${(one?.dash || '') === k ? 'selected' : ''}>${lb}</option>`).join('')}</select></label>` : '',
                shape: () => t === 'shape' ? `<label>Forme</label><div class="h-bd-row h-bd-shrow">${quickShapes().map(sh => `<button type="button" class="h-bt ${one.shape === sh.k ? 'is-on' : ''}" data-bd-setshape="${esc(sh.k)}" title="${esc(sh.n)}">${KIT().shapeSvg ? KIT().shapeSvg(sh, 18) : esc(sh.n)}</button>`).join('')}<button type="button" class="h-bt" data-bd-shapelib title="Toutes les formes">⋯</button>${!one.mask ? '<button type="button" class="h-bt" data-bd-shapefrom title="Créer une forme à partir de celle-ci">✏️</button>' : ''}</div>` : '',
                radius: () => (one && ((t === 'shape' && ['rect', 'round'].includes(one.shape)) || ['note', 'media', 'webimage', 'table', 'tag', 'folder', 'recueil', 'person', 'link', 'screen', 'weblink', 'widget'].includes(t))) ? numField('radius', 'Arrondi des coins', 0, 120, 1, one.radius ?? (t === 'shape' && one.shape === 'round' ? Math.round(Math.min(one.w, one.h) * .18) : 0), 'px', 0, 400) : '',
                text: () => any(...textTypes) ? `${numField('fs', 'Taille du texte', tMin, tMax, 1, one?.fs || 18, 'px', 2, 500)}<div class="h-bd-row">${[['bold', '<b>G</b>', 'Gras'], ['italic', '<i>I</i>', 'Italique'], ['underline', '<u>S</u>', 'Souligné'], ['strike', '<s>B</s>', 'Barré']].map(([k, h, lb]) => `<button type="button" class="h-bt ${one?.[k] ? 'is-on' : ''}" data-bd-toggle="${k}" title="${lb}">${h}</button>`).join('')}<span class="h-bt-sep"></span>${[['left', '⇤', 'Aligner à gauche'], ['center', '↔', 'Centrer'], ['right', '⇥', 'Aligner à droite'], ['justify', '☰', 'Justifier']].map(([a, h, lb]) => `<button type="button" class="h-bt ${(one?.align || (t === 'shape' ? 'center' : 'left')) === a ? 'is-on' : ''}" data-bd-set="align" data-v="${a}" title="${lb}">${h}</button>`).join('')}</div>` : '',
                list: () => any('text', 'note', 'shape') ? `<label>Puces et numéros <select data-bd-sel="list">${[['', 'Aucune'], ['bullet', '• Puce'], ['num', '1. Nombres'], ['roman', 'I. Chiffres romains'], ['alpha', 'a. Lettres'], ['ALPHA', 'A. Lettres capitales'], ['dash', '– Tiret'], ['check', '☐ Cases à cocher']].map(([k, lb]) => `<option value="${k}" ${(one?.list || '') === k ? 'selected' : ''}>${lb}</option>`).join('')}</select></label>` : '',
                font: () => any(...textTypes) ? `<label>Police <select data-bd-sel="font">${fontOpts()}</select></label>${(() => { const own = fontWeights(one?.font), cur = Number(one?.weight || (one?.bold ? 700 : 400)), list = own ? own.map(([w, s]) => [w, `${s} (${w})`]) : WEIGHTS; return `<label>Graisse <select data-bd-weight>${list.map(([w, l]) => `<option value="${w}" ${cur === w ? 'selected' : ''}>${esc(l)}</option>`).join('')}${list.some(x => x[0] === cur) ? '' : `<option value="${cur}" selected>${cur}</option>`}</select></label>${own ? '' : '<small class="muted">Les graisses exactes de la police : 🖥 ci-dessous (polices de l’ordinateur).</small>'}`; })()}<div class="h-bd-fontfree"><input list="bd-fonts-${b.id}" placeholder="ou tape un nom de police…" data-bd-fontfree value=""><button type="button" class="h-bt" data-bd-localfonts title="Les polices de l’ordinateur">🖥</button><datalist id="bd-fonts-${b.id}">${(localFonts || []).map(f => `<option value="${esc(f)}">`).join('')}</datalist></div>` : '',
                heads: () => t === 'line' ? `<label>Couleur des pointes ${one.headColor ? '<button type="button" class="link-button" data-bd-headsame>même couleur que le trait</button>' : '<small class="muted">(comme le trait)</small>'}</label>${swatches('headColor', pal('text'))}<div class="h-bd-heads"><label>Pointe au début ${headSel('headStart', headOf(one, 'start'))}</label><label>Pointe à la fin ${headSel('headEnd', headOf(one, 'end'))}</label></div>${numField('hs', 'Taille des pointes', 4, 80, 1, one.hs || headSize(one), 'px', 2, 200)}` : '',
                linepath: () => t === 'line' ? `<label>Forme du trait <select data-bd-sel="path">${LINE_PATHS.map(([k, lb]) => `<option value="${k}" ${(one.path || (one.curved ? 'curve' : 'straight')) === k ? 'selected' : ''}>${lb}</option>`).join('')}</select></label><label>Légende <input data-bd-str="text" value="${esc(one.text || '')}" placeholder="frère de, a écrit à…"></label>
                    <details class="h-bd-lbopts" ${one.text ? 'open' : ''}><summary>Réglages de la légende</summary>${legendParts(one)}</details>` : '',
                table: () => t === 'table' ? `<div class="h-bd-tbl"><p class="muted">${cs ? `Cellule <strong>${colName(cs.c)}${cs.r + 1}</strong>${range && range.rs * range.cs > 1 ? ` à <strong>${colName(range.c + range.cs - 1)}${range.r + range.rs}</strong>` : ''}${String(one.cells?.[cs.r]?.[cs.c] ?? '').startsWith('=') ? ` : <code>${esc(one.cells[cs.r][cs.c])}</code>` : ''}` : 'Clique une cellule pour la choisir'} · ⇧ + clic : plusieurs · double-clic : écrire</p>
                    <div class="h-bd-row"><button type="button" class="h-bt" data-bd-tbl="row+" title="Ajouter une ligne dessous">＋ ligne</button><button type="button" class="h-bt" data-bd-tbl="row-" title="Enlever la ligne">− ligne</button><button type="button" class="h-bt" data-bd-tbl="col+" title="Ajouter une colonne à droite">＋ colonne</button><button type="button" class="h-bt" data-bd-tbl="col-" title="Enlever la colonne">− colonne</button></div>
                    <div class="h-bd-row">${range && range.rs * range.cs > 1 ? '<button type="button" class="h-bt" data-bd-tbl="merge" title="Fusionner les cellules choisies">⊞ Fusionner</button>' : ''}${merged ? '<button type="button" class="h-bt" data-bd-tbl="unmerge" title="Séparer les cellules">⊟ Séparer</button>' : ''}<button type="button" class="h-bt" data-bd-tbl="narrower" title="Colonne plus étroite">⇤⇥ −</button><button type="button" class="h-bt" data-bd-tbl="wider" title="Colonne plus large">⇤⇥ ＋</button>${cs ? '<button type="button" class="h-bt" data-bd-tbl="clear" title="Vider la cellule">⌫ vider</button>' : ''}<button type="button" class="h-bt" data-bd-tbl="csv" title="Télécharger en CSV (Excel, Numbers…)">⬇ CSV</button></div>
                    <label class="checkbox-line"><input type="checkbox" data-bd-check="header" ${one.header ? 'checked' : ''}> <span>première ligne en titre</span></label><label class="checkbox-line"><input type="checkbox" data-bd-check="hcol" ${one.hcol ? 'checked' : ''}> <span>première colonne en titre</span></label><label class="checkbox-line"><input type="checkbox" data-bd-check="stripes" ${one.stripes ? 'checked' : ''}> <span>une ligne sur deux teintée</span></label>
                    <label>Fond des titres</label>${swatches('hfill', ['#e8eef7', ...pal('fill').filter(c => c !== '#e8eef7')])}
                    ${cs ? `<label>Fond de la cellule${range && range.rs * range.cs > 1 ? ' (les cellules choisies)' : ''}</label><div class="h-bd-sws">${pal('fill').map(c => `<button type="button" class="h-sw" style="background:${c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/8px 8px' : c}" data-bd-cellfill="${c}"></button>`).join('')}<input type="color" data-bd-cellfill2 value="#fff3a3" title="Autre couleur"></div>` : ''}
                    <details class="h-bd-help"><summary>Formules</summary><p class="muted">Commence par <code>=</code> : <code>=B2+B3</code>, <code>=SOMME(B2:B9)</code>, <code>=MOYENNE(B2:B9)</code>, <code>=MIN(…)</code>, <code>=MAX(…)</code>, <code>=NB(…)</code>, <code>=PRODUIT(…)</code>, <code>=ARRONDI(B2;1)</code>, <code>=2026-B2</code> (âge), <code>="texte"</code>. Colle un bout de tableur (Excel, Numbers) dans une cellule : il se range dans la grille.</p></details></div>` : '',
                brush: () => t === 'draw' ? `<label>Pinceau <select data-bd-sel="brush">${BRUSHES.map(([k, lb, ic]) => `<option value="${k}" ${(one.brush || 'pen') === k ? 'selected' : ''}>${ic} ${esc(lb)}</option>`).join('')}</select></label>${numField('hard', 'Dureté', 0, 100, 1, one.hard ?? 100, '%')}` : '',
                title: () => [['folder', 'recueil', 'person', 'link', 'screen', 'weblink', 'frame'].includes(t) ? `<label>Titre <input data-bd-str="title" value="${esc(one.title || '')}"></label>` : '',
                    t === 'tag' ? `<label>Étiquette <input data-bd-str="text" value="${esc(one.text || '')}"></label>` : '',
                    t === 'media' && kindOfMedia(media[one.media_id]) === 'image' ? `<label>Légende <input data-bd-str="text" value="${esc(one.text || '')}"></label>` : '',
                    t === 'weblink' ? `<label>Adresse <input data-bd-str="url" value="${esc(one.url || '')}"></label>` : ''].join(''),
                preview: () => (t === 'link' || t === 'screen' || (t === 'media' && kindOfMedia(media[one.media_id]) === 'pdf')) ? `<label class="checkbox-line"><input type="checkbox" data-bd-check="preview" ${one.preview ? 'checked' : ''}> <span>aperçu vivant dans le tableau</span></label>` : '',
                pshow: () => t === 'person' ? `<label>La fiche montre</label><div class="h-bd-checks">${PSHOW.map(([k, lb]) => `<label class="checkbox-line"><input type="checkbox" data-bd-pshow="${k}" ${(one.pshow ?? 'photo,years').split(',').includes(k) ? 'checked' : ''}> <span>${lb}</span></label>`).join('')}</div><p class="muted"><small>Lu dans la fiche à chaque ouverture du tableau : si la fiche change, la carte suit.</small></p>` : '',
                hyp: () => any('note') ? `<label>Piste d’enquête</label><div class="h-bd-row">${[['', '—', 'Simple note'], ...Object.entries(HYP).map(([k, v]) => [k, v[0] + ' ' + v[1], v[1]])].map(([k, h, lb]) => `<button type="button" class="h-bt ${(one?.hyp || '') === k ? 'is-on' : ''}" data-bd-hyp="${k}" title="${lb}">${h}</button>`).join('')}</div>` : '',
                tl: () => t === 'timeline' ? `<label>Titre <input data-bd-str="title" value="${esc(one.title || '')}" placeholder="Frise"></label><label>Événements <select data-bd-sel="tlMode"><option value="person" ${(one.tlMode || 'person') === 'person' ? 'selected' : ''}>de la personne</option><option value="family" ${one.tlMode === 'family' ? 'selected' : ''}>de la personne, son couple et ses enfants</option></select></label><button type="button" class="button small secondary" data-bd-pickperson>👤 Changer de personne</button>${numField('fs', 'Taille du texte', 9, 13, 1, one.fs || 12)}` : '',
                map: () => t === 'map' ? `<label>Titre <input data-bd-str="title" value="${esc(one.title || '')}" placeholder="Carte"></label>
                    <label>Lieux de… <select data-bd-mapkind>${[['', 'aucune fiche (seulement mes repères)'], ['person', 'une personne'], ['family', 'une personne et sa famille'], ['investigation', 'la personne d’une enquête']].map(([k, l]) => `<option value="${k}" ${String(one.mapSrc || '').split(':')[0] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    ${one.mapSrc ? `<p class="muted"><small data-bd-mapsrclabel>…</small></p>` : ''}${String(one.mapSrc || '').startsWith('investigation') ? '' : '<button type="button" class="button small secondary" data-bd-mapperson>👤 Choisir la personne</button>'}<label data-bd-mapinvbox ${String(one.mapSrc || '').startsWith('investigation') ? '' : 'hidden'}>Enquête <select data-bd-mapinv><option value="">…</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" data-bd-check="mapPath" ${one.mapPath ? 'checked' : ''}> <span>relier les lieux dans l’ordre (le parcours)</span></label>
                    <label>Poser un repère</label><input type="search" placeholder="Une commune, un lieu…" data-bd-pinq><div class="h-bd-results" data-bd-pinres></div>
                    ${(one.pins || []).length ? `<ul class="h-bd-pins">${one.pins.map((pn, i) => `<li><span class="h-sw" style="background:${esc(pn.color || '#d0021b')}"></span><input data-bd-pinlabel="${i}" value="${esc(pn.label || '')}"><button type="button" class="h-bd-unlink" data-bd-pindel="${i}" title="Enlever ce repère">×</button></li>`).join('')}</ul>` : ''}` : '',
                connector: () => t === 'line' ? `<label>Lien tout prêt <select data-bd-conn><option value="">—</option>${CONNECTORS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>${one.bends?.length ? `<button type="button" class="button small secondary" data-bd-unbend>Enlever les ${one.bends.length} coude${one.bends.length > 1 ? 's' : ''}</button>` : '<p class="muted"><small>Glisse un « + » sur le trait pour le plier en plusieurs segments.</small></p>'}` : '',
                align: () => l.filter(i => i.type !== 'line').length > 1 ? `<label>Aligner</label><div class="h-bd-row">${[['left', '⇤', 'À gauche'], ['hcenter', '↔', 'Centrés (de gauche à droite)'], ['right', '⇥', 'À droite'], ['top', '⤒', 'En haut'], ['vcenter', '↕', 'Centrés (de haut en bas)'], ['bottom', '⤓', 'En bas']].map(([k, h, lb]) => `<button type="button" class="h-bt" data-bd-align="${k}" title="${lb}">${h}</button>`).join('')}</div>
                    <label>Répartir</label><div class="h-bd-row"><button type="button" class="h-bt" data-bd-align="dh" title="Même écart de gauche à droite">⇹ en largeur</button><button type="button" class="h-bt" data-bd-align="dv" title="Même écart de haut en bas">⇳ en hauteur</button><button type="button" class="h-bt" data-bd-align="sw" title="Même largeur que le premier choisi">═ même largeur</button><button type="button" class="h-bt" data-bd-align="sh" title="Même hauteur que le premier choisi">‖ même hauteur</button></div>` : '',
                layer: () => layers.length ? `<label>Calque <select data-bd-layersel><option value="">Calque principal</option>${layers.map(L => `<option value="${esc(L.id)}" ${l.every(i => (i.layer || '') === L.id) ? 'selected' : ''}>${esc(L.name)}</option>`).join('')}</select></label>` : '',
                comments: () => one ? `<button type="button" class="button small secondary" data-bd-comments>💬 ${(one.cmt || []).length ? `Commentaires (${one.cmt.filter(c => !c.done).length} ouvert${one.cmt.filter(c => !c.done).length > 1 ? 's' : ''} / ${one.cmt.length})` : 'Commenter'}</button>` : '',
                opacity: () => numField('opacity', 'Opacité', 5, 100, 1, Math.round((one?.opacity ?? 1) * 100), '%', 5, 100),
                actions: () => `<div class="h-bd-actions">
                    ${['folder', 'recueil', 'person', 'link', 'screen', 'weblink', 'media', 'timeline'].includes(t) || (t === 'map' && one.mapSrc) ? '<button type="button" class="button small" data-bd-act="open">↗ Ouvrir</button>' : ''}
                    <button type="button" class="button small secondary" data-bd-act="duplicate">Dupliquer</button>
                    <button type="button" class="button small secondary" data-bd-act="lock">${l.every(i => i.locked) ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button>
                    ${l.length > 1 ? '<button type="button" class="button small secondary" data-bd-act="group">⧉ Grouper</button>' : ''}${l.some(i => i.group) ? '<button type="button" class="button small secondary" data-bd-act="ungroup">Dégrouper</button>' : ''}
                    ${l.some(i => i.type === 'draw') ? '<button type="button" class="button small secondary" data-bd-act="toshape" title="Faire de ce dessin une forme à toi (réutilisable)">✏️ En faire une forme</button>' : ''}
                    <button type="button" class="button small secondary" data-bd-act="front">Devant</button><button type="button" class="button small secondary" data-bd-act="back">Derrière</button>
                    <button type="button" class="button small secondary danger" data-bd-act="delete">Supprimer</button></div>`,
            };
            const order = ordered(p.inspectorOrder, p.inspectorHidden, Object.keys(SECTIONS));
            inspector.innerHTML = `<h4>${grp ? `⧉ Groupe ${grp} · ${l.length} éléments` : one ? ({table: 'Tableur', shape: 'Forme', note: 'Note', text: 'Texte', draw: 'Dessin', line: headOf(one, 'end') !== 'none' || headOf(one, 'start') !== 'none' ? 'Flèche' : 'Trait', media: 'Média', webimage: 'Image du web', weblink: 'Lien web', tag: 'Étiquette', folder: 'Dossier', recueil: 'Recueil', person: 'Fiche', widget: 'Widget', timeline: 'Frise vivante', map: 'Carte', frame: 'Cadre', link: 'Écran de l’app', screen: 'Écran de l’app'}[t] || 'Élément') : `${l.length} éléments`}</h4>
                ${order.map(k => { const h = SECTIONS[k](); return h ? `<div class="h-bd-isec" data-isec="${k}">${h}</div>` : ''; }).join('')}`;
        }
        const setOnSel = (k, v, keep = false) => { if (ro()) return; selItems().forEach(i => { if (k === 'fill' && !['shape', 'note', 'tag', 'folder', 'frame'].includes(i.type)) return; if (k === 'stroke' && !['shape', 'media', 'webimage', 'frame'].includes(i.type)) return; if (k === 'shape' && i.type !== 'shape') return; i[k] = v; sigs.delete(i.id); }); render(keep); };
        inspector.addEventListener('click', e => {
            const s = e.target.closest('[data-bd-set]'); if (s) { setOnSel(s.dataset.bdSet, s.dataset.v); commit(); return; }
            const tg = e.target.closest('[data-bd-toggle]'); if (tg) { const k = tg.dataset.bdToggle, v = !selItems()[0]?.[k]; if (k === 'bold') selItems().forEach(i => { delete i.weight; }); setOnSel(k, v); commit(); return; }
            const bs = e.target.closest('[data-bd-bgset]'); if (bs) { setBg(bs.dataset.bdBgset); return; }
            if (e.target.closest('[data-bd-headsame]')) { if (ro()) return; selItems().forEach(i => { delete i.headColor; sigs.delete(i.id); }); render(); commit(); return; }
            const ss = e.target.closest('[data-bd-setshape]'); if (ss) { applyShape(ss.dataset.bdSetshape); return; }
            if (e.target.closest('[data-bd-shapelib]')) { shapeLibrary(e.target.closest('[data-bd-shapelib]'), k => applyShape(k)); return; }
            if (e.target.closest('[data-bd-localfonts]')) { loadLocalFonts(); return; }
            if (e.target.closest('[data-bd-shapefrom]')) { const one = selItems()[0]; if (!one) return; KIT().openComposer?.({base: one.shape, onSave: k => applyShape(k)}); return; }
            const tb = e.target.closest('[data-bd-tbl]'); if (tb) { const it = selItems()[0]; if (it?.type !== 'table') return; if (tb.dataset.bdTbl === 'csv') return tableCsv(it); tableOp(it, tb.dataset.bdTbl); return; }
            const cf = e.target.closest('[data-bd-cellfill]'); if (cf && cellSel && !ro()) { const it = byId(cellSel.id); if (!it) return; it.cfill = {...(it.cfill || {})}; const k = cellSel.r + ':' + cellSel.c; setCellFill(it, cf.dataset.bdCellfill); return; }
            const a = e.target.closest('[data-bd-act]'); if (a) { if (a.dataset.bdAct === 'open') return openItem(selItems()[0]); actions[a.dataset.bdAct]?.(); }
            inspectorMore(e);
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
            if (e.target.matches('[data-bd-bgset2]')) { setBg(e.target.value, true); }
            if (e.target.matches('[data-bd-cellfill2]') && cellSel) { const it = byId(cellSel.id); if (it) setCellFill(it, e.target.value, true); }
            inspectorInput(e);
        });
        inspector.addEventListener('change', e => { if (inspectorChange(e)) return; if (e.target.matches('[data-bd-fontfree]') && e.target.value.trim()) { setOnSel('font', e.target.value.trim()); commit(); renderInspector(); return; } if (e.target.matches('[data-bd-check]')) setOnSel(e.target.dataset.bdCheck, e.target.checked, true); if (e.target.matches('[data-bd-sel]')) setOnSel(e.target.dataset.bdSel, e.target.value, true); if (e.target.matches('input, select')) commit(); });
        // fond du tableau choisi depuis le panneau (couleur de la palette ou autre)
        function setBg(c, keep = false) {
            const sel0 = root.querySelector('[data-bd-bg]'); bg = 'custom'; bgColor = /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff';
            stage.dataset.bg = 'custom'; stage.style.setProperty('--bgc', bgColor); sel0.value = 'custom';
            const ci = root.querySelector('[data-bd-bgcolor]'); ci.hidden = false; ci.value = bgColor; root.querySelector('[data-bd-bgpattern]').hidden = false;
            if (!keep) renderInspector(); queueSave(true);
        }
        function setCellFill(it, c, keep = false) {
            if (ro() || !cellSel || cellSel.id !== it.id) return;
            it.cfill = {...(it.cfill || {})};
            const r0 = Math.min(cellSel.r, cellSel.r2 ?? cellSel.r), r1 = Math.max(cellSel.r, cellSel.r2 ?? cellSel.r), c0 = Math.min(cellSel.c, cellSel.c2 ?? cellSel.c), c1 = Math.max(cellSel.c, cellSel.c2 ?? cellSel.c);
            for (let r = r0; r <= r1; r++) for (let c2 = c0; c2 <= c1; c2++) { const k = r + ':' + c2; if (c === 'transparent') delete it.cfill[k]; else it.cfill[k] = c; }
            sigs.delete(it.id); render(true); if (!keep) commit(); else queueSave(true);
        }
        // ── formes : accès rapide, bibliothèque, formes à soi ──
        const quickShapes = () => { const p = P(), K = KIT(); const list = (p.quickShapes || []).map(k => K.shapeByKey?.(k)).filter(Boolean).filter(sh => !(p.shapesHidden || []).includes(sh.k)); return list.length ? list : SHAPES.map(([k, n]) => ({k, n, d: K.shapeByKey?.(k)?.d || ''})); };
        const shapeItem = k => { const sh = KIT().shapeByKey?.(k); const o = {shape: k}; if (k.startsWith('my_') && sh) { if (sh.mask) { o.mask = sh.mask; o.svgpath = undefined; } else { o.svgpath = sh.d; o.eo = !!sh.eo; o.mask = undefined; } } else { o.svgpath = undefined; o.mask = undefined; } return o; };
        function applyShape(k) {
            if (ro()) return;
            const o = shapeItem(k);
            selItems().filter(i => i.type === 'shape').forEach(i => { Object.entries(o).forEach(([kk, v]) => { if (v === undefined) delete i[kk]; else i[kk] = v; }); sigs.delete(i.id); });
            shapeKind = k; render(); commit();
        }
        function shapeLibrary(anchor, onPick) {
            root.querySelector('.h-bd-shapelib')?.remove();
            const K = KIT(), p = P(), cats = (K.CATS || []).filter(c => (p.shapeCats || []).includes(c[0]) && !(p.shapesHidden || []).includes('cat:' + c[0]));
            const ord = c => [...(p.shapeCats || [])].indexOf(c);
            cats.sort((a, b2) => ord(a[0]) - ord(b2[0]));
            const m = document.createElement('div'); m.className = 'h-bd-shapelib';
            const grid = (list) => list.length ? list.map(sh => `<button type="button" class="h-bd-shcell ${shapeKind === sh.k ? 'is-on' : ''}" data-shk="${esc(sh.k)}" title="${esc(sh.n)}">${K.shapeSvg(sh, 40)}</button>`).join('') : '<p class="muted">Aucune forme.</p>';
            const visible = c => K.shapesOf(c).filter(sh => !(p.shapesHidden || []).includes(sh.k));
            let cur = 'all';
            const body = q => {
                if (q) { const n = q.toLowerCase(); const l = K.allShapes().filter(sh => !(p.shapesHidden || []).includes(sh.k) && (sh.n + ' ' + sh.tags).toLowerCase().includes(n)); return `<div class="h-bd-shgrid">${grid(l)}</div>`; }
                return cats.filter(c => cur === 'all' || c[0] === cur).map(c => `<h5>${c[2]} ${esc(c[1])}</h5><div class="h-bd-shgrid">${grid(visible(c[0]))}${c[0] === 'mine' ? '<button type="button" class="h-bd-shcell h-bd-shnew" data-shnew title="Créer une forme">＋</button>' : ''}</div>`).join('');
            };
            m.innerHTML = `<div class="h-bd-shhead"><input type="search" placeholder="Rechercher une forme" data-shq><button type="button" class="button small" data-shnew>＋ Créer une forme</button><button type="button" class="button small secondary" data-shfrom title="Créer une forme à partir d’une autre (retourner, tourner, étirer, ajouter, percer)">🧩 À partir d’une forme</button></div>
                <div class="h-bd-shcats"><button type="button" class="is-on" data-shc="all">Toutes</button>${cats.map(c => `<button type="button" data-shc="${c[0]}">${c[2]} ${esc(c[1])}</button>`).join('')}</div><div class="h-bd-shbody">${body('')}</div>`;
            (anchor.closest('.h-bd-menuwrap, .h-bd-isec, .h-bt-opts') || root).appendChild(m);
            const bodyEl = m.querySelector('.h-bd-shbody');
            m.addEventListener('input', e => { if (e.target.matches('[data-shq]')) bodyEl.innerHTML = body(e.target.value.trim()); });
            m.addEventListener('click', e => {
                const c = e.target.closest('[data-shc]'); if (c) { cur = c.dataset.shc; m.querySelectorAll('[data-shc]').forEach(x => x.classList.toggle('is-on', x === c)); m.querySelector('[data-shq]').value = ''; bodyEl.innerHTML = body(''); return; }
                if (e.target.closest('[data-shnew]')) { m.remove(); shapeMaker(onPick); return; }
                if (e.target.closest('[data-shfrom]')) { m.remove(); KIT().openComposer?.({base: shapeKind, onSave: onPick}); return; }
                const sh = e.target.closest('[data-shk]'); if (sh) { m.remove(); onPick(sh.dataset.shk); }
            });
            setTimeout(() => { m.querySelector('[data-shq]').focus(); document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !anchor.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true); }, 0);
        }
        /** Créer sa forme : en traçant (traits et courbes), à partir d'un dessin du tableau, ou à partir d'une image */
        function shapeMaker(onDone, fromDraw = null) {
            const draws = fromDraw || selItems().filter(i => i.type === 'draw');
            let pen = null, imgMask = '', mode = draws.length ? 'draw' : 'trace';
            const drawPath = () => { const bb = bbox(draws); if (!bb) return ''; const s0 = 100 / Math.max(bb.w, bb.h, 1), ox = (100 - bb.w * s0) / 2, oy = (100 - bb.h * s0) / 2;
                return draws.map(d => { const sx = d.w / (d.vw || d.w), sy = d.h / (d.vh || d.h); const P0 = (d.points || []).map(q => [+(ox + (d.x + q[0] * sx - bb.x) * s0).toFixed(1), +(oy + (d.y + q[1] * sy - bb.y) * s0).toFixed(1)]); return P0.length > 2 ? smooth(P0) + ' Z' : ''; }).join(' '); };
            const tracePath = () => pen?.path() || '';
            const preview = () => { const d = mode === 'draw' ? drawPath() : mode === 'trace' ? tracePath() : ''; return mode === 'image' ? (imgMask ? `<span class="h-bk-shmask" style="width:200px;height:200px;-webkit-mask-image:url(${imgMask});mask-image:url(${imgMask})"></span>` : '<p class="muted">Choisis une image.</p>') : `<svg viewBox="0 0 100 100" width="200" height="200"><path d="${d}" fill="#2a7de1" fill-opacity=".8" ${mode === 'trace' ? 'fill-rule="evenodd"' : ''} stroke="#1d3557" stroke-width="1"/></svg>`; };
            ext.openDialog({eyebrow: 'TABLEAU', title: 'Créer une forme', wide: true, submitLabel: 'Enregistrer la forme',
                body: `<div class="h-bd-maker"><div class="h-bd-makertabs">${[['trace', '✒️ Plume (tracé)'], ['draw', '✍︎ À partir de mon dessin'], ['image', '🖼 À partir d’une image']].map(([k, l]) => `<button type="button" class="${mode === k ? 'is-on' : ''}" data-mk="${k}">${l}</button>`).join('')}<button type="button" data-mkfrom>🧩 À partir d’une forme</button></div>
                    <div class="h-bd-makerbody"><div class="h-bd-makerpane" data-mkpane="trace"><details class="h-bd-penhelp" open><summary>Comment tracer avec la plume</summary><ul class="muted"><li><strong>Clic</strong> : un point d’angle (trait droit).</li><li><strong>Cliquer-glisser</strong> : un point arrondi ; tire pour régler la courbe.</li><li><strong>Clic sur le premier point</strong> (jaune) : la forme se ferme.</li><li>Glisser un point pour le <strong>déplacer</strong> ; glisser une poignée (rond rouge) pour <strong>courber</strong> ; avec <kbd>⌥</kbd> / <kbd>Alt</kbd>, les deux poignées deviennent indépendantes.</li><li><kbd>⌥</kbd> / <kbd>Alt</kbd> + clic sur un point : angle ↔ arrondi ; <strong>double-clic</strong> : le supprimer.</li><li>Une forme fermée, puis un nouveau tracé à l’intérieur : un <strong>trou</strong>.</li></ul></details>
                        <svg class="h-bd-tracer" viewBox="0 0 100 100" data-tracer></svg>
                        <div class="h-bd-row"><button type="button" class="h-bt" data-pen="close" title="Fermer le tracé en cours">◯ Fermer</button><button type="button" class="h-bt" data-pen="newPath" title="Commencer un autre tracé (un trou s’il est dans la forme)">＋ Nouveau tracé</button><button type="button" class="h-bt" data-pen="delSel" title="Supprimer le point choisi">✕ Point</button><button type="button" class="h-bt" data-pen="undo" title="Annuler le dernier point">↶ Annuler</button><button type="button" class="h-bt" data-pen="clear">Tout effacer</button></div></div>
                    <div class="h-bd-makerpane" data-mkpane="draw" hidden><p class="muted">${draws.length ? `${draws.length} dessin${draws.length > 1 ? 's' : ''} choisi${draws.length > 1 ? 's' : ''} sur le tableau : chaque trait devient une partie remplie de la forme.` : 'Choisis d’abord un ou plusieurs dessins à main levée sur le tableau (outil ✍︎), puis reviens ici.'}</p></div>
                    <div class="h-bd-makerpane" data-mkpane="image" hidden><p class="muted">Une image PNG avec un fond transparent donne sa silhouette. Sinon, coche : ce qui est sombre devient la forme.</p><input type="file" accept="image/*" data-mkfile><label class="checkbox-line"><input type="checkbox" data-mkdark checked> <span>le sombre devient la forme (images sans transparence)</span></label></div>
                    <div class="h-bd-makerprev"><div data-mkprev>${preview()}</div><label>Nom de la forme<input data-mkname value="Ma forme" maxlength="60"></label></div></div></div>`,
                onOpen: d => {
                    const prev = () => { d.querySelector('[data-mkprev]').innerHTML = preview(); };
                    const show = () => { d.querySelectorAll('[data-mk]').forEach(x => x.classList.toggle('is-on', x.dataset.mk === mode)); d.querySelectorAll('[data-mkpane]').forEach(x => { x.hidden = x.dataset.mkpane !== mode; }); prev(); };
                    d.querySelector('.h-bd-makertabs').addEventListener('click', e => { if (e.target.closest('[data-mkfrom]')) { d.close(); KIT().openComposer?.({base: shapeKind, onSave: onDone}); return; } const k = e.target.closest('[data-mk]'); if (k) { mode = k.dataset.mk; show(); } });
                    pen = KIT().penEditor?.(d.querySelector('[data-tracer]'), () => { if (d.querySelector('[data-mkprev]')) prev(); });
                    d.querySelectorAll('[data-pen]').forEach(bt => bt.addEventListener('click', () => pen?.[bt.dataset.pen]?.()));
                    const readImg = async () => {
                        const f = d.querySelector('[data-mkfile]').files[0]; if (!f) return;
                        const url = URL.createObjectURL(f), im = await new Promise((res, rej) => { const i0 = new Image(); i0.onload = () => res(i0); i0.onerror = rej; i0.src = url; });
                        const S0 = 256, k = S0 / Math.max(im.width, im.height), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                        const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
                        const id0 = x.getImageData(0, 0, c.width, c.height), px = id0.data;
                        let transparent = false; for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { transparent = true; break; }
                        if (!transparent && d.querySelector('[data-mkdark]').checked) for (let i = 0; i < px.length; i += 4) { const lum = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2]; px[i + 3] = Math.max(0, Math.min(255, (230 - lum) * 1.6)); px[i] = px[i + 1] = px[i + 2] = 0; }
                        x.putImageData(id0, 0, 0); imgMask = c.toDataURL('image/png'); prev();
                    };
                    d.querySelector('[data-mkfile]').addEventListener('change', readImg); d.querySelector('[data-mkdark]').addEventListener('change', readImg);
                    show();
                },
                onSubmit: form => {
                    const name = form.querySelector('[data-mkname]').value.trim() || 'Ma forme';
                    let dpath = mode === 'draw' ? drawPath() : mode === 'trace' ? tracePath() : '';
                    // un chemin trop long (grand dessin) : moins de décimales, puis on refuse
                    if (dpath.length > 29000) dpath = dpath.replace(/-?\d+\.\d+/g, m => String(Math.round(Number(m))));
                    if (dpath.length > 29000) { toast('Ce dessin est trop détaillé pour devenir une forme : prends un dessin plus simple (ou moins de traits).', 'error'); return false; }
                    if (mode !== 'image' && !dpath) { toast(mode === 'draw' ? 'Choisis d’abord un dessin sur le tableau.' : 'Ferme la forme : au moins trois points, puis clic sur le premier (ou « ◯ Fermer »).', 'error'); return false; }
                    if (mode === 'image' && !imgMask) { toast('Choisis une image.', 'error'); return false; }
                    const p = JSON.parse(JSON.stringify(P())), k = 'my_' + Date.now().toString(36);
                    p.customShapes.push({k, n: name, c: 'mine', d: dpath, eo: mode === 'trace' && (pen?.count() || 0) > 1, mask: mode === 'image' ? imgMask : ''});
                    if (!p.quickShapes.includes(k)) p.quickShapes.push(k);
                    KIT().savePrefs?.(p);
                    toast(`Forme « ${name} » créée : elle est dans « Mes formes ».`);
                    shapeKind = k; onDone?.(k); if (tool === 'shape') setTool('shape');
                }});
        }
        let localFonts = null, fontStyles = null;
        // les graisses : celles que la police a vraiment (lues sur l'ordinateur), sinon les neuf graisses habituelles
        const WEIGHTS = [[100, 'Thin (100)'], [200, 'ExtraLight (200)'], [300, 'Light (300)'], [400, 'Regular (400)'], [500, 'Medium (500)'], [600, 'SemiBold (600)'], [700, 'Bold (700)'], [800, 'ExtraBold (800)'], [900, 'Black (900)']];
        const styleWeight = s => { const t = String(s).toLowerCase().replace(/[\s_-]/g, ''); return /hairline|thin/.test(t) ? 100 : /extralight|ultralight/.test(t) ? 200 : /light/.test(t) ? 300 : /semibold|demibold|demi/.test(t) ? 600 : /extrabold|ultrabold/.test(t) ? 800 : /black|heavy/.test(t) ? 900 : /bold/.test(t) ? 700 : /medium/.test(t) ? 500 : 400; };
        const fontWeights = fam => { const st = fam && fontStyles?.get(fam); if (!st) return null; const m = new Map(); [...st].forEach(s => { const w = styleWeight(s); if (!m.has(w) || !/italic|oblique/i.test(s)) m.set(w, s.replace(/\b(italic|oblique)\b/ig, '').trim() || s); }); return [...m.entries()].sort((x, y) => x[0] - y[0]); };
        async function loadLocalFonts() {
            if (!window.queryLocalFonts) { toast('Ce navigateur ne lit pas les polices de l’ordinateur : tape le nom de la police (ou fais des listes dans Maintenance → Réglages des tableaux).', 'error'); return; }
            try { const all = await window.queryLocalFonts(); localFonts = [...new Set(all.map(f => f.family))].sort((a, b2) => a.localeCompare(b2, 'fr')); fontStyles = new Map(); all.forEach(f => { if (!fontStyles.has(f.family)) fontStyles.set(f.family, new Set()); fontStyles.get(f.family).add(f.style); }); renderInspector(); inspector.querySelector('[data-bd-fontfree]')?.focus(); toast(`${localFonts.length} polices de l’ordinateur : tape le début du nom.`); }
            catch (error) { toast('Lecture des polices refusée : ' + error.message, 'error'); }
        }
        // ── importer un tableau exporté (fichier .lcnda-tableau.json) : un nouveau tableau ──
        async function importBoard(f) {
            let j; try { j = JSON.parse(await f.text()); } catch (_) { toast('Ce fichier n’est pas un tableau exporté.', 'error'); return; }
            if (j?.format !== 'lcnda-board' || !j.data || !Array.isArray(j.data.items)) { toast('Ce fichier n’est pas un tableau exporté de l’app.', 'error'); return; }
            // les numéros (fiches, médias, recueils, dossiers) viennent peut-être d'une autre base : on les vérifie, sinon l'élément devient une note
            status('Import : vérification des fiches et médias…');
            const asNote = (it, txt) => ({id: it.id, type: 'note', text: txt, x: it.x, y: it.y, w: Math.max(180, it.w), h: Math.max(90, Math.min(it.h, 200)), z: it.z, fill: '#f1f1f1', fs: 16, group: it.group || ''});
            let lost = 0;
            const out = [], toUpload = [];
            for (const it of j.data.items) {
                if (!it || typeof it !== 'object') continue;
                try {
                    if (it.type === 'media') {
                        const m0 = j.media?.[it.media_id], fname = m0?.filename || '';
                        const hit = fname ? ((await api('heritage_media_search', {q: m0.title || fname})).media || []).find(m => m.filename === fname) : null;
                        if (hit) { out.push({...it, media_id: Number(hit.id)}); media[hit.id] = hit; }
                        else if (j.files?.[it.media_id]) { const n = {...it}; out.push(n); toUpload.push([n, it.media_id]); } // le fichier est dedans : ajouté à la base après
                        else { lost++; out.push(asNote(it, `🖼 Média absent ici : ${m0?.title || fname || '#' + it.media_id}`)); }
                    } else if (it.type === 'person') {
                        const name = j.people?.[it.person_id]; let ok = false;
                        if (name) { try { const d = await api('person', {id: it.person_id}); ok = A().personName(d.person) === name; } catch (_) {} }
                        if (ok) out.push(it); else { lost++; out.push(asNote(it, `👤 ${name || it.title || 'Fiche'} (fiche absente ici)`)); }
                    } else if (it.type === 'recueil') {
                        const hit = ((await api('recueils', {q: it.title || ''})).recueils || []).find(r => r.title === it.title);
                        if (hit) out.push({...it, recueil_id: Number(hit.id)}); else { lost++; out.push(asNote(it, `📚 ${it.title || 'Recueil'} (absent ici)`)); }
                    } else if (it.type === 'folder') { lost++; out.push(asNote(it, `📁 ${it.title || 'Dossier'} (dossier non importé)`)); }
                    else out.push(it);
                } catch (_) { out.push(it); }
            }
            try {
                // associations : gardées quand elles visent la même chose ici (même numéro et même nom, donc la même base)
                let keptLinks = []; const want = (j.data.links || []).length;
                if (want) { try { keptLinks = (await api('board_links_check', {links: JSON.stringify(j.data.links)})).links || []; } catch (_) {} }
                const r = await api('save_board', {}, {method: 'POST', body: {title: (j.title || 'Tableau importé') + ' (importé)', owner_type: '', data: {...j.data, items: out, links: keptLinks, locked: false}}});
                const linkMsg = !want ? '' : keptLinks.length === want ? ' Associations reprises.' : keptLinks.length ? ` ${keptLinks.length} association${keptLinks.length > 1 ? 's' : ''} sur ${want} reprise${keptLinks.length > 1 ? 's' : ''} (les autres visent une autre base).` : ' Les associations visent une autre base : non reprises.';
                const nid = Number(r.result?.id || r.id);
                // les photos contenues dans le fichier : ajoutées à la base (rangées avec ce tableau), une fois chacune
                if (toUpload.length) {
                    const done = new Map(); let n = 0;
                    for (const [item, oldId] of toUpload) {
                        status(`Import des photos : ${++n} / ${toUpload.length}…`);
                        if (!done.has(oldId)) {
                            let newId = 0;
                            try {
                                const url = j.files[oldId], mime = (/^data:([^;,]+)/.exec(url) || [])[1] || 'application/octet-stream', bin = atob(url.split(',')[1] || ''), u8 = new Uint8Array(bin.length);
                                for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
                                const m0 = j.media?.[oldId] || {}, fd = new FormData();
                                fd.append('collection_type', 'board'); fd.append('collection_id', nid); fd.append('collection_role', ''); fd.append('csrf', S().csrf);
                                fd.append('files[]', new File([u8], String(m0.filename || 'photo').split('/').pop(), {type: mime}));
                                const res = await fetch('upload.php', {method: 'POST', body: fd}), jj = await res.json();
                                if (res.ok && !jj.error) newId = Number((jj.media || [])[0]) || 0;
                            } catch (_) {}
                            done.set(oldId, newId);
                        }
                        const nm = done.get(oldId);
                        if (nm) item.media_id = nm; else { lost++; Object.assign(item, asNote(item, `🖼 Média non importé : ${j.media?.[oldId]?.title || '#' + oldId}`)); delete item.media_id; }
                    }
                    const nb = await api('board', {id: nid});
                    await api('save_board', {}, {method: 'POST', body: {id: nid, title: nb.title, status: nb.status, data: {...nb.data, items: out}}});
                }
                toast((lost ? `Tableau importé. ${lost} élément${lost > 1 ? 's' : ''} (fiche, média, recueil ou dossier) absent${lost > 1 ? 's' : ''} ici devenu${lost > 1 ? 's' : ''} des notes.` : 'Tableau importé.') + linkMsg);
                go(nid);
            } catch (error) { toast(error.message, 'error'); status('⚠ ' + error.message); }
        }
        // ── « Ajouter » : tout ce qu'on peut poser ──
        function addMenu() {
            const sc = ext.appScreen;
            const own = Object.entries(ext.customWidgetDefs?.() || {});
            ext.openDialog({eyebrow: 'TABLEAU', title: 'Ajouter au tableau', wide: true, submitLabel: 'Fermer',
                body: `<div class="h-bd-add">
                    <section data-k="files"><h4>📎 Des fichiers</h4><p class="muted">Images, GIF, sons, vidéos, PDF (ou glisse-les sur le tableau, ou colle une image).</p><input type="file" multiple accept="image/*,audio/*,video/*,application/pdf,.aif,.aiff" data-bd-files></section>
                    <section data-k="media"><h4>🖼 Un média de l’app</h4><input type="search" placeholder="Titre, cote…" data-bd-msearch><div class="h-bd-results" data-bd-mres></div></section>
                    <section data-k="web"><h4>🌐 D’ailleurs</h4><label>Adresse d’une image ou d’un site<input data-bd-url placeholder="https://…"></label><button type="button" class="button small" data-bd-addurl>Poser</button></section>
                    <section data-k="person"><h4>👤 Une fiche</h4>${A().collectionPersonField('bd_person', null, 'Nom de la personne')}<button type="button" class="button small" data-bd-addperson>Poser la fiche</button></section>
                    <section data-k="screen"><h4>📺 Un écran de l’app</h4><p class="muted">Une liste, un diagramme, une statistique, la carte, un village, une de tes listes…</p>${sc ? sc.select('list:villages', 'data-bd-screen') : ''}<label class="checkbox-line"><input type="checkbox" data-bd-screenprev checked> <span>avec l’aperçu vivant</span></label><button type="button" class="button small" data-bd-addscreen>Poser l’écran</button></section>
                    <section data-k="widget"><h4>✨ Un de mes widgets</h4>${own.length ? `<select data-bd-widgetsel>${own.map(([k, d]) => `<option value="${esc(k)}">${esc((d.icon || '🧱') + ' ' + (d.name || 'Mon widget'))}</option>`).join('')}</select><button type="button" class="button small" data-bd-addwidget>Poser le widget</button>` : '<p class="muted">Crée d’abord un widget (Maintenance → Éditeur de widgets).</p>'}</section>
                    <section data-k="recueil"><h4>📚 Un recueil</h4><input type="search" placeholder="Titre du recueil" data-bd-rsearch><div class="h-bd-results" data-bd-rres></div></section>
                    <section data-k="tag"><h4>🏷 Une étiquette</h4><input type="search" placeholder="Étiquette de l’app, ou un mot à toi" data-bd-tsearch><div class="h-bd-results" data-bd-tres></div><button type="button" class="button small" data-bd-addtag>Poser ce mot</button></section>
                    <section data-k="table"><h4>▦ Un tableur</h4><p class="muted">Une grille à remplir, avec des formules (=SOMME…) ; on peut y coller un bout d’Excel ou de Numbers.</p><button type="button" class="button small" data-bd-addtable>Poser un tableur</button></section>
                    <section data-k="folder"><h4>📁 Un dossier</h4><p class="muted">Un tableau dans le tableau : double-clic pour y entrer.</p><input data-bd-foldername placeholder="Nom du dossier"><button type="button" class="button small" data-bd-addfolder>Créer le dossier</button></section>
                    <section data-k="tree"><h4>🌳 Un arbre automatique</h4><p class="muted">Une personne, et ses parents, grands-parents ou enfants posés en fiches reliées par des flèches.</p>${A().collectionPersonField('bd_tree', null, 'Nom de la personne')}
                        <div class="h-bd-row"><label>Montrer <select data-bd-treemode><option value="up">ses ancêtres</option><option value="down">ses descendants</option><option value="near">sa famille proche</option></select></label><label>Générations <input type="number" min="1" max="6" value="3" data-bd-treegens class="h-bd-numbox"></label></div>
                        <label class="checkbox-line"><input type="checkbox" data-bd-treespouse checked> <span>avec les conjoints</span></label><label class="checkbox-line"><input type="checkbox" data-bd-treearrow checked> <span>flèches (sinon des traits)</span></label><button type="button" class="button small" data-bd-addtree>Poser l’arbre</button></section>
                    <section data-k="timeline"><h4>🗓 Une frise vivante</h4><p class="muted">Les événements d’une personne (ou de sa famille) placés tout seuls sur une ligne du temps ; elle suit la fiche.</p>${A().collectionPersonField('bd_tl', null, 'Nom de la personne')}<label>Événements <select data-bd-tlmode><option value="person">de la personne</option><option value="family">de la personne, son couple et ses enfants</option></select></label><button type="button" class="button small" data-bd-addtl>Poser la frise</button></section>
                    <section data-k="map"><h4>🗺 Une carte</h4><p class="muted">Les lieux d’une personne, de sa famille ou d’une enquête ; tu peux y poser tes repères.</p>${A().collectionPersonField('bd_map', null, 'Nom de la personne (facultatif)')}<label>Lieux de <select data-bd-mapmode><option value="person">la personne</option><option value="family">la personne et sa famille</option><option value="">personne : seulement mes repères</option></select></label><button type="button" class="button small" data-bd-addmap>Poser la carte</button></section>
                    <section data-k="frame"><h4>▭ Un cadre</h4><p class="muted">Une zone nommée (« Branche paternelle », « Sources à voir ») : ce qui est dedans bouge avec elle ; on peut la replier.</p><input data-bd-framename placeholder="Nom du cadre"><button type="button" class="button small" data-bd-addframe>Poser le cadre</button></section>
                    <section data-k="memo"><h4>🎙 Un mémo vocal</h4><p class="muted">Enregistre ta voix ici : le son est rangé avec le tableau et posé dessus.</p><button type="button" class="button small" data-bd-addmemo>🎙 Enregistrer</button></section>
                    <section data-k="import"><h4>💾 Importer un tableau</h4><p class="muted">Un fichier « .lcnda-tableau.json » (⬇ Exporter → Fichier du tableau) : il devient un nouveau tableau.</p><input type="file" accept=".json,application/json" data-bd-import></section>
                </div>`,
                onOpen: dlg => {
                    const close = () => dlg.close();
                    // dans l'ordre choisi (Maintenance → Réglages des tableaux → Menus et options)
                    { const p = P(), box = dlg.querySelector('.h-bd-add'), secs = [...box.querySelectorAll(':scope > section[data-k]')]; ordered(p.addOrder, [], secs.map(x => x.dataset.k)).forEach(k => box.appendChild(secs.find(x => x.dataset.k === k))); secs.forEach(x => { x.hidden = (p.addHidden || []).includes(x.dataset.k); }); }
                    dlg.querySelector('[data-bd-import]').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; close(); importBoard(f); });
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
                    addMenuMore(dlg, close);
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
        const LINK_KINDS = {person: ['👤', 'Une personne'], investigation: ['🔎', 'Une enquête'], battue: ['🧭', 'Une battue'], atelier_project: ['🛠', 'Un projet de l’Atelier'], recueil: ['📚', 'Un recueil'], place: ['📍', 'Un lieu (sa commune)'], media: ['🖼', 'Un média (photo, acte, son…)'], label: ['🏷', 'Une étiquette'], family: ['💑', 'Une famille (un couple)'], event: ['📅', 'Un événement'], pet: ['🐾', 'Un animal'], board: ['🧩', 'Un autre tableau']};
        const SEARCH_KINDS = {place: async q => ((await api('quick_search', {q})).places || []).map(r => ({id: r.id, title: r.name + (r.county ? ` (${r.county})` : ''), key: 'n:' + String(r.name || '').toLowerCase().trim() + '|' + String(r.county || '').toLowerCase().trim()})),
            media: async q => ((await api('heritage_media_search', {q})).media || []).map(m => ({id: m.id, title: m.title || m.filename})),
            family: async q => (await api('board_family_search', {q})).families || [],
            event: async q => ((await api('list', {type: 'events', q})).rows || []).slice(0, 15).map(e => ({id: e.id, title: [e.type, e.date_text || e.year, e.person && '— ' + e.person, e.place && '(' + e.place + ')'].filter(Boolean).join(' ')}))};
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
            if (l.kind === 'place') { let key = l.key || ''; try { key = (await api('board_place_key', {id: l.id})).key || key; } catch (_) {} st.listType = 'villages'; st.hVillage = key; return A().setModule('listes'); }
            if (l.kind === 'label') { st.listType = 'labels'; return A().setModule('listes'); }
            if (l.kind === 'pet') return ext.openPet ? ext.openPet(Number(l.id)) : null;
            if (l.kind === 'family' || l.kind === 'event') { try { const pid = (await api('board_link_person', {kind: l.kind, id: l.id})).person_id; if (pid) { st.currentPersonId = Number(pid); return A().setModule('personnes'); } } catch (_) {} toast('Introuvable.', 'error'); return; }
            if (l.kind === 'media') { try { const m = (await api('media_brief', {ids: String(l.id)})).media?.[l.id]; if (m) A().openLightbox?.([{...m, id: Number(l.id)}], 0, true); else toast('Média introuvable.', 'error'); } catch (error) { toast(error.message, 'error'); } }
        }
        async function linkDialog() {
            const [inv, bat, ate, rec, brd, lab, pts] = await Promise.all([api('research_lists', {kind: 'investigations'}), api('research_lists', {kind: 'battues'}), api('research_lists', {kind: 'atelier'}), api('recueils', {q: ''}), api('boards', {owner_type: 'all'}), api('my_lists'), api('pets', {})].map(p => p.catch(() => ({}))));
            const opts = {investigation: inv.rows || [], battue: bat.rows || [], atelier_project: ate.rows || [], recueil: (rec.recueils || []).map(r => ({id: r.id, title: (r.icon || '📚') + ' ' + r.title})), board: (brd.boards || []).filter(r => Number(r.id) !== Number(b.id)), label: (lab.labels || []).map(l0 => ({id: l0.id, title: l0.name})), pet: (pts.pets || []).map(x => ({id: x.id, title: x.title + (x.breed ? ' (' + x.breed + ')' : '')}))};
            let found = null;
            ext.openDialog({eyebrow: 'TABLEAU', title: 'Associer ce tableau', submitLabel: 'Associer',
                body: `<div class="form-grid"><label class="span-2">À quoi <select name="kind">${Object.entries(LINK_KINDS).map(([k, [i, lb]]) => `<option value="${k}">${i} ${lb}</option>`).join('')}</select></label>
                    <div class="span-2" data-bd-lperson>${A().collectionPersonField('bd_lperson', null, 'Nom de la personne')}</div>
                    <label class="span-2" data-bd-lother hidden>Laquelle <select name="target"></select></label>
                    <div class="span-2" data-bd-lsearch hidden><input type="search" placeholder="Chercher…" data-bd-lq><div class="h-bd-results" data-bd-lres></div><small class="muted" data-bd-lpicked></small></div>
                    <label class="span-2">Partie <small class="muted">(facultatif : piste 1, les témoins, la branche paternelle…)</small><input name="part" maxlength="120"></label>
                    <p class="muted span-2">Le tableau garde son rangement (${esc(b.owner_type ? OWNERS[b.owner_type] : 'libre')}) ; il apparaît en plus là où tu l’associes (sur la fiche de la personne, dans l’enquête…).</p></div>`,
                onOpen: d => {
                    const k = d.querySelector('[name=kind]'), s = d.querySelector('[name=target]');
                    let t0 = 0; const q = d.querySelector('[data-bd-lq]'), res = d.querySelector('[data-bd-lres]');
                    q.addEventListener('input', () => { clearTimeout(t0); t0 = setTimeout(async () => { const fn = SEARCH_KINDS[k.value]; if (!fn || q.value.trim().length < 2) { res.innerHTML = ''; return; } const rows = await fn(q.value.trim()).catch(() => []); res.innerHTML = rows.slice(0, 12).map((r, i) => `<button type="button" data-i="${i}">${esc(r.title)}</button>`).join('') || '<small class="muted">Rien trouvé.</small>'; res.querySelectorAll('[data-i]').forEach(bt => bt.addEventListener('click', () => { found = rows[Number(bt.dataset.i)]; d.querySelector('[data-bd-lpicked]').textContent = '✓ ' + found.title; res.innerHTML = ''; })); }, 250); });
                    const fill = () => { const isP = k.value === 'person', isS = !!SEARCH_KINDS[k.value]; found = null; d.querySelector('[data-bd-lpicked]').textContent = ''; d.querySelector('[data-bd-lsearch]').hidden = !isS; d.querySelector('[data-bd-lperson]').hidden = !isP; d.querySelector('[data-bd-lother]').hidden = isP || isS; if (!isP && !isS) s.innerHTML = (opts[k.value] || []).map(r => `<option value="${r.id}">${esc(r.title || '#' + r.id)}</option>`).join('') || '<option value="">(aucun pour l’instant)</option>'; };
                    k.addEventListener('change', fill); fill();
                },
                onSubmit: async form => {
                    const kind = form.elements.kind.value, part = form.elements.part.value.trim();
                    let id0 = 0, label = '';
                    if (kind === 'person') { id0 = Number(form.elements.bd_lperson?.value) || 0; if (id0) label = (await personBrief(id0)).name; }
                    else if (SEARCH_KINDS[kind]) { id0 = Number(found?.id) || 0; label = found?.title || ''; }
                    else { id0 = Number(form.elements.target.value) || 0; label = (opts[kind] || []).find(r => Number(r.id) === id0)?.title || ''; }
                    if (!id0) { toast('Choisis à quoi associer le tableau.', 'error'); return false; }
                    if (links.some(l => l.kind === kind && Number(l.id) === id0 && (l.part || '') === part)) { toast('Déjà associé.'); return; }
                    links.push({kind, id: id0, label, part, ...(found?.key ? {key: found.key} : {})}); renderLinks(); await save(); toast('Tableau associé.');
                }});
        }
        // ── instantanés : figer l'état, y revenir, en faire un nouveau tableau ──
        async function snapsDialog() {
            if (dirty) await save();
            let list = []; try { list = (await api('board_snapshots', {board_id: b.id})).snapshots || []; } catch (error) { toast(error.message, 'error'); return; }
            ext.openDialog({eyebrow: 'TABLEAU', title: '📸 Instantanés', wide: true, submitLabel: 'Fermer',
                body: `<div class="h-bd-snaps"><div class="h-bd-snapnew"><input data-bd-snaplabel placeholder="Nom de l’instantané (ex. « avant la visite aux archives »)" maxlength="160"><button type="button" class="button small" data-bd-snaptake>📸 Prendre un instantané</button></div>
                    <p class="muted">Un instantané fige le tableau tel qu’il est. Tu peux y revenir plus tard (l’état actuel est gardé en instantané avant), ou en faire un nouveau tableau à part.</p>
                    <div class="h-bd-snaplist" data-bd-snaplist>${snapList(list)}</div></div>`, onSubmit: () => true,
                onOpen: d => {
                    d.querySelector('[data-bd-snaptake]').addEventListener('click', async () => {
                        save.lastThumb = 0; await save();
                        try { await api('save_board_snapshot', {}, {method: 'POST', body: {board_id: b.id, label: d.querySelector('[data-bd-snaplabel]').value.trim()}}); d.querySelector('[data-bd-snaplabel]').value = ''; list = (await api('board_snapshots', {board_id: b.id})).snapshots || []; d.querySelector('[data-bd-snaplist]').innerHTML = snapList(list); toast('Instantané pris.'); } catch (error) { toast(error.message, 'error'); }
                    });
                    d.querySelector('[data-bd-snaplist]').addEventListener('click', async e => {
                        const bt = e.target.closest('[data-bd-snap]'); if (!bt) return;
                        const sid = Number(bt.dataset.id), s0 = list.find(x => x.id === sid);
                        try {
                            if (bt.dataset.bdSnap === 'restore') { if (ro()) return; if (!confirm(`Revenir à « ${s0?.label} » ? L’état actuel est gardé en instantané.`)) return; clearTimeout(saveT); await api('restore_board_snapshot', {}, {method: 'POST', body: {id: sid}}); d.close(); dirty = false; toast('Tableau revenu à l’instantané.'); go(b.id); }
                            if (bt.dataset.bdSnap === 'copy') { d.close(); copyDialog(sid, s0?.label); }
                            if (bt.dataset.bdSnap === 'delete') { if (!confirm(`Supprimer l’instantané « ${s0?.label} » ?`)) return; await api('delete_board_snapshot', {}, {method: 'POST', body: {id: sid}}); list = list.filter(x => x.id !== sid); d.querySelector('[data-bd-snaplist]').innerHTML = snapList(list); }
                        } catch (error) { toast(error.message, 'error'); }
                    });
                }});
        }
        const snapRows = list => list.length ? list.map(s0 => `<article class="h-bd-snap">${s0.thumb ? `<img src="${esc(s0.thumb)}" alt="">` : '<span class="h-bd-snapblank">🧩</span>'}<div><strong>${esc(s0.label)}</strong><small class="muted">${esc(String(s0.created_at || '').slice(0, 16).replace('T', ' '))} · ${fmt(s0.item_count)} élément${s0.item_count > 1 ? 's' : ''}</small>
            <span class="h-bd-snapacts"><button type="button" class="button small secondary" data-bd-snap="restore" data-id="${s0.id}">↺ Revenir à cet état</button><button type="button" class="button small secondary" data-bd-snap="copy" data-id="${s0.id}">⧉ En faire un tableau</button><button type="button" class="button small secondary danger" data-bd-snap="delete" data-id="${s0.id}" aria-label="Supprimer">🗑</button></span></div></article>`).join('') : '<p class="muted">Pas encore d’instantané.</p>';
        const snapList = list => { const auto = list.filter(x => String(x.label || '').startsWith('⏱')), mine = list.filter(x => !String(x.label || '').startsWith('⏱'));
            return snapRows(mine) + (auto.length ? `<details class="h-bd-autosnaps"><summary>⏱ Versions automatiques (${auto.length}) <small class="muted">une par jour de travail au plus, les 30 dernières gardées</small></summary>${snapRows(auto)}</details>` : ''); };
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
        root.querySelector('[data-bd-bg]').addEventListener('change', e => { bg = e.target.value; stage.dataset.bg = bg; root.querySelector('[data-bd-bgcolor]').hidden = root.querySelector('[data-bd-bgpattern]').hidden = bg !== 'custom'; queueSave(true); });
        root.querySelector('[data-bd-bgcolor]').addEventListener('input', e => { bgColor = e.target.value; stage.style.setProperty('--bgc', bgColor); queueSave(true); });
        root.querySelector('[data-bd-bgpattern]').addEventListener('change', e => { bgPattern = e.target.value; stage.dataset.pattern = bgPattern; queueSave(true); });
        // ── exporter : images, PDF, impression, fichier du tableau ──
        const fileBase = () => (root.querySelector('[data-bd-title]').value.trim() || 'tableau').replace(/[\\/:*?"<>|]+/g, '-');
        const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
        function popMenu(anchor, rows, onPick) {
            root.querySelector('.h-bd-pop')?.remove();
            const m = document.createElement('div'); m.className = 'h-bd-pop'; m.setAttribute('role', 'menu');
            m.innerHTML = rows.map(r => r === '-' ? '<hr>' : `<button type="button" role="menuitem" data-k="${r[0]}" ${r[2] ? 'disabled' : ''}>${r[1]}</button>`).join('');
            (anchor.closest('.h-bd-menuwrap') || anchor.parentElement).appendChild(m);
            m.addEventListener('click', ev => { const bt = ev.target.closest('[data-k]'); if (!bt) return; m.remove(); onPick(bt.dataset.k); });
            setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
        }
        // le fichier du tableau : léger (sans les photos) ou complet (photos, sons, PDF dedans)
        function exportFile() {
            const used = [...new Set(items.filter(i => i.type === 'media' && media[i.media_id]).map(i => Number(i.media_id)))];
            ext.openDialog({eyebrow: 'TABLEAU', title: '💾 Fichier du tableau', submitLabel: 'Enregistrer le fichier',
                body: `<div class="h-bd-expopt">
                    <label class="h-bd-expchoice"><input type="radio" name="with" value="0" checked><span><strong>Léger, sans les photos</strong>
                        <small>✓ petit fichier, vite fait, facile à envoyer par courriel.<br>✓ parfait pour garder une copie ou le rouvrir dans <em>cette</em> base : les photos y sont déjà.<br>✗ dans une autre base (un cousin, un autre ordinateur), les photos qui n’y sont pas deviennent des notes « média absent ».</small></span></label>
                    <label class="h-bd-expchoice"><input type="radio" name="with" value="1"><span><strong>Complet, avec les photos${used.length ? ` (${used.length} fichier${used.length > 1 ? 's' : ''})` : ''}</strong>
                        <small>✓ le tableau est complet partout : à l’import, les photos, sons et PDF absents sont ajoutés à la base.<br>✗ fichier bien plus lourd (le poids de toutes les photos), plus long à faire et à envoyer.<br>✗ les photos sont copiées : dans la même base, celles déjà présentes ne sont pas recopiées, mais le fichier les contient quand même.</small></span></label>
                    ${used.length ? '' : '<p class="muted">Ce tableau n’a pas de photo de l’app : les deux fichiers seront pareils.</p>'}</div>`,
                onSubmit: async form => {
                    const withFiles = form.querySelector('[name=with]:checked')?.value === '1';
                    const people = {}; for (const it of items.filter(i => i.type === 'person')) people[it.person_id] = (await personBrief(it.person_id)).name;
                    const data = {format: 'lcnda-board', version: 3, title: root.querySelector('[data-bd-title]').value.trim(), exported_at: new Date().toISOString(), data: {items, view, bg, bgColor, bgPattern, links, layers, steps, snap: snapOn}, people,
                        media: Object.fromEntries(Object.entries(media).map(([id0, m]) => [id0, {title: m.title, filename: m.filename, media_type: m.media_type}]))};
                    if (withFiles && used.length) {
                        data.files = {}; let n = 0, failed = 0;
                        for (const mid of used) {
                            status(`Photos : ${++n} / ${used.length}…`);
                            try { const r = await fetch(mediaUrl(media[mid])); if (!r.ok) throw new Error(); const blob = await r.blob();
                                data.files[mid] = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }); }
                            catch (_) { failed++; }
                        }
                        status(dirty ? 'Modifié…' : 'Enregistré ✓');
                        if (failed) toast(`${failed} fichier${failed > 1 ? 's' : ''} n’${failed > 1 ? 'ont' : 'a'} pas pu être mis dedans (introuvable${failed > 1 ? 's' : ''} sur le disque).`, 'error');
                    }
                    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
                    download(URL.createObjectURL(blob), fileBase() + (withFiles && used.length ? ' (avec photos)' : '') + '.lcnda-tableau.json');
                    toast(`Fichier du tableau enregistré (${blob.size > 1048576 ? (blob.size / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(blob.size / 1024)) + ' ko'}) : « ＋ Ajouter → Importer un tableau » le rouvre.`);
                }});
        }
        async function exportMenu(btn) {
            popMenu(btn, [['png', '🖼 Image PNG'], ['jpg', '🖼 Image JPG'], ['pdf', '📄 PDF'], ['print', '🖨 Imprimer…'], '-', ['selpng', '✂ La sélection en PNG', !sel.size], '-', ['file', '💾 Fichier du tableau (pour le garder ou le donner)'], ['tpl', '⭐ En faire un modèle (pour les nouveaux tableaux)']], async k => {
                if (k === 'file') return exportFile();
                if (k === 'tpl') return saveTemplate();
                status('Préparation…');
                // l'échelle est réduite pour un grand tableau (un navigateur ne fait pas d'image de plus de ~16 millions de points)
                const bb0 = bbox(k === 'selpng' && sel.size ? selItems() : items) || {w: 800, h: 600}, scale = Math.max(0.1, Math.min(2, Math.sqrt(16e6 / Math.max(1, (bb0.w + 80) * (bb0.h + 80))), 16000 / (bb0.w + 80), 16000 / (bb0.h + 80)));
                const url = await thumbnail(0, 0, scale, k === 'jpg' || k === 'pdf' || k === 'print' ? 'image/jpeg' : 'image/png', k === 'selpng');
                status(dirty ? 'Modifié…' : 'Enregistré ✓');
                if (!url || url.length < 40) { toast('Image impossible (une image d’un autre site l’empêche, ou le tableau est trop grand).', 'error'); return; }
                if (k === 'png' || k === 'selpng') return download(url, fileBase() + (k === 'selpng' ? ' (sélection)' : '') + '.png');
                if (k === 'jpg') return download(url, fileBase() + '.jpg');
                const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
                if (!img) { toast('Image impossible.', 'error'); return; }
                if (k === 'pdf') return download(URL.createObjectURL(jpegPdf(url, img.width, img.height, fileBase())), fileBase() + '.pdf');
                // imprimer : une page avec l'image, ajustée à la feuille
                const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(fr);
                fr.contentDocument.write(`<!doctype html><title>${esc(fileBase())}</title><style>@page{size:${img.width > img.height ? 'landscape' : 'portrait'};margin:10mm}html,body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style><img src="${url}">`); fr.contentDocument.close();
                setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); }, 300);
            });
        }
        // le menu du zoom (comme Freeform) : ajuster à la sélection, adapter le contenu à la fenêtre…
        root.querySelector('[data-bd-zoomout]').addEventListener('click', e => popMenu(e.currentTarget, [['sel', 'Ajuster à la sélection', !sel.size], ['fit', 'Adapter le contenu à la fenêtre'], '-', ['50', '50 %'], ['100', '100 %'], ['200', '200 %']], k => {
            if (k === 'fit') { fitAll(); queueSave(false); return; }
            if (k === 'sel') { fitTo(selItems()); queueSave(false); return; }
            zoomAt(Number(k) / 100);
        }));
        root.querySelector('[data-bd-undo]').addEventListener('click', () => restore(hpos - 1));
        root.querySelector('[data-bd-redo]').addEventListener('click', () => restore(hpos + 1));
        root.querySelector('[data-bd-full]').addEventListener('click', () => { root.classList.toggle('is-full'); setTimeout(applyView, 50); });
        root.querySelector('[data-bd-export]').addEventListener('click', e => exportMenu(e.currentTarget));
        root.querySelector('[data-bd-close]').addEventListener('click', async () => { if (dirty) await save(); go(0); });
        root.querySelectorAll('[data-bd-open]').forEach(x => x.addEventListener('click', async () => { if (dirty) await save(); go(Number(x.dataset.bdOpen)); }));
        root.querySelector('[data-bd-place]').addEventListener('click', () => placeDialog(ownerData, async () => { await save(); go(b.id); }));
        // quitter : on enregistre ; on enlève les écoutes du document
        const obs = new MutationObserver(() => { if (!root.isConnected) { obs.disconnect(); window.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('paste', onPaste); document.removeEventListener('copy', onCopy); window.removeEventListener('beforeunload', onUnload); if (dirty) save(); } });
        obs.observe(document.getElementById('workspace') || document.body, {childList: true});
        const onUnload = () => { if (dirty) save(); };
        window.addEventListener('beforeunload', onUnload);
        /* ═════ Arbre, frise, carte, cadres, calques, guides, recherche, mini-carte, présentation, commentaires, liens tout prêts, collage, modèles, mémo vocal ═════ */
        const guides = document.createElement('div'); guides.className = 'h-board-guides'; world.appendChild(guides);
        const pickPerson = (title, cb) => ext.openDialog({eyebrow: 'TABLEAU', title, submitLabel: 'Choisir', body: `<div class="form-grid"><div class="span-2">${A().collectionPersonField('bd_pp', null, 'Nom de la personne')}</div></div>`,
            onSubmit: form => { const id0 = Number(form.elements.bd_pp?.value) || 0; if (!id0) { toast('Choisis la personne.', 'error'); return false; } cb(id0); }});
        // centrer la vue sur des éléments, sans trop zoomer
        function focusOn(list, maxK = 1.2) {
            const bb = bbox(list); if (!bb) return; const r = stage.getBoundingClientRect();
            view.k = Math.max(0.1, Math.min(maxK, (r.width - 120) / Math.max(bb.w, 1), (r.height - 120) / Math.max(bb.h, 1)));
            view.x = r.width / 2 - (bb.x + bb.w / 2) * view.k; view.y = r.height / 2 - (bb.y + bb.h / 2) * view.k;
            world.classList.add('is-gliding'); applyView(); setTimeout(() => world.classList.remove('is-gliding'), 450); queueSave(false);
            list.forEach(i => { const el = els.get(i.id); if (el) { el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); } });
        }
        // où poser un ensemble (arbre, collage) : au milieu de la vue, ou à droite de tout s'il couvrirait quelque chose ; renvoie le décalage
        function freeSpot(bb) {
            const r = stage.getBoundingClientRect(), [cx, cy] = toWorld(r.left + r.width / 2, r.top + r.height / 2);
            let ox = cx - bb.x - bb.w / 2, oy = cy - bb.y - bb.h / 2;
            const vis = items.filter(i => !hiddenIds.has(i.id) && i.type !== 'line');
            if (vis.some(o => o.x < bb.x + ox + bb.w + 20 && o.x + o.w + 20 > bb.x + ox && o.y < bb.y + oy + bb.h + 20 && o.y + o.h + 20 > bb.y + oy)) { const all0 = bbox(vis); ox = all0.x + all0.w + 160 - bb.x; oy = all0.y - bb.y; }
            return [ox, oy];
        }
        // ── cadres : ce qu'ils contiennent bouge avec eux ; repliés, ils le cachent ──
        function moveStart(list) {
            const ids = new Set(list.map(i => i.id));
            list.filter(i => i.type === 'frame').forEach(f => framed(f).forEach(i => { if (!i.locked && !lockedIds.has(i.id)) ids.add(i.id); }));
            return [...ids].map(byId).filter(Boolean).map(i => ({id: i.id, x: i.x, y: i.y, pts: i.type === 'line' ? clone(i.points) : null}));
        }
        function toggleFrame(f) {
            if (ro()) return;
            if (f.collapsed) { f.h = f.fh || f.h; delete f.fh; f.collapsed = false; } else { f.fh = f.h; f.h = 44; f.collapsed = true; }
            sigs.delete(f.id); render(); commit();
        }
        // ── grille aimantée et guides : on s'aligne sur les bords et les milieux des autres éléments ──
        function snapMove(d, dx, dy) {
            if (!d.bb0) {
                const moving = new Set(d.start.map(s0 => s0.id)), boxes = d.start.map(s0 => ({...byId(s0.id), x: s0.x, y: s0.y})), solid = boxes.filter(i => i.type !== 'line');
                d.bb0 = bbox(solid.length ? solid : boxes); d.others = items.filter(i => !moving.has(i.id) && i.type !== 'line' && !hiddenIds.has(i.id));
            }
            const tol = 7 / view.k, bb = d.bb0, nx = bb.x + dx, ny = bb.y + dy;
            let bx = null, by = null;
            for (const o of d.others) {
                [o.x, o.x + o.w / 2, o.x + o.w].forEach(ox => [nx, nx + bb.w / 2, nx + bb.w].forEach(v => { const dd = ox - v; if (Math.abs(dd) < tol && (!bx || Math.abs(dd) < Math.abs(bx.d))) bx = {d: dd, at: ox, o}; }));
                [o.y, o.y + o.h / 2, o.y + o.h].forEach(oy => [ny, ny + bb.h / 2, ny + bb.h].forEach(v => { const dd = oy - v; if (Math.abs(dd) < tol && (!by || Math.abs(dd) < Math.abs(by.d))) by = {d: dd, at: oy, o}; }));
            }
            dx = bx ? dx + bx.d : Math.round(nx / 24) * 24 - bb.x;
            dy = by ? dy + by.d : Math.round(ny / 24) * 24 - bb.y;
            const fy = bb.y + dy, fx = bb.x + dx;
            guides.innerHTML = (bx ? `<i class="is-v" style="left:${bx.at}px;top:${Math.min(bx.o.y, fy) - 10}px;height:${Math.max(bx.o.y + bx.o.h, fy + bb.h) - Math.min(bx.o.y, fy) + 20}px"></i>` : '')
                + (by ? `<i class="is-h" style="top:${by.at}px;left:${Math.min(by.o.x, fx) - 10}px;width:${Math.max(by.o.x + by.o.w, fx + bb.w) - Math.min(by.o.x, fx) + 20}px"></i>` : '');
            return [dx, dy];
        }
        root.querySelector('[data-bd-snapgrid]').addEventListener('click', e => { snapOn = !snapOn; e.currentTarget.classList.toggle('is-on', snapOn); stage.classList.toggle('is-snap', snapOn); queueSave(true); toast(snapOn ? 'Grille aimantée : les éléments s’alignent sur la grille et sur les autres (⌥ / Alt en glissant pour s’en passer).' : 'Grille aimantée enlevée.'); });
        stage.classList.toggle('is-snap', snapOn);
        // ── aligner et répartir ──
        function alignSel(k) {
            if (ro()) return; const l = selItems().filter(i => i.type !== 'line' && !i.locked); if (l.length < 2) return; const bb = bbox(l);
            const sorted = (axis) => [...l].sort((a, b2) => a[axis] - b2[axis]);
            if (k === 'left') l.forEach(i => { i.x = bb.x; }); if (k === 'right') l.forEach(i => { i.x = bb.x + bb.w - i.w; }); if (k === 'hcenter') l.forEach(i => { i.x = bb.x + (bb.w - i.w) / 2; });
            if (k === 'top') l.forEach(i => { i.y = bb.y; }); if (k === 'bottom') l.forEach(i => { i.y = bb.y + bb.h - i.h; }); if (k === 'vcenter') l.forEach(i => { i.y = bb.y + (bb.h - i.h) / 2; });
            if (k === 'dh' && l.length > 2) { const s0 = sorted('x'), gap = (bb.w - s0.reduce((t, i) => t + i.w, 0)) / (s0.length - 1); let x0 = bb.x; s0.forEach(i => { i.x = x0; x0 += i.w + gap; }); }
            if (k === 'dv' && l.length > 2) { const s0 = sorted('y'), gap = (bb.h - s0.reduce((t, i) => t + i.h, 0)) / (s0.length - 1); let y0 = bb.y; s0.forEach(i => { i.y = y0; y0 += i.h + gap; }); }
            if (k === 'sw') l.forEach(i => { i.w = l[0].w; sigs.delete(i.id); }); if (k === 'sh') l.forEach(i => { i.h = l[0].h; sigs.delete(i.id); });
            if ((k === 'dh' || k === 'dv') && l.length < 3) toast('Pour répartir, choisis au moins trois éléments.');
            render(); commit();
        }
        // ── liens tout prêts (frère de, épouse de…) ──
        const CONNECTORS = [['brother', 'frère de', '#2b8a3e', '', 'none'], ['sister', 'sœur de', '#2b8a3e', '', 'none'], ['husband', 'époux de', '#c2185b', '', 'none'], ['wife', 'épouse de', '#c2185b', '', 'none'],
            ['father', 'père de', '#1d4ed8', '', 'triangle'], ['mother', 'mère de', '#1d4ed8', '', 'triangle'], ['son', 'fils de', '#1d4ed8', '', 'triangle'], ['daughter', 'fille de', '#1d4ed8', '', 'triangle'],
            ['cousin', 'cousin de', '#0a9396', 'dash', 'none'], ['cousine', 'cousine de', '#0a9396', 'dash', 'none'], ['godfather', 'parrain de', '#7b2cbf', 'dot', 'triangle'], ['godmother', 'marraine de', '#7b2cbf', 'dot', 'triangle'],
            ['witness', 'témoin de', '#e85d04', 'dash', 'triangle'], ['neighbor', 'voisin de', '#6c757d', 'dash', 'none'], ['work', 'a travaillé pour', '#8d6e63', '', 'triangle'], ['wrote', 'a écrit à', '#555555', 'long', 'stealth'], ['same', 'même personne ?', '#c92a2a', 'dot', 'none']];
        let connector = '';
        const connectorProps = k => { const c = CONNECTORS.find(x => x[0] === k); return c ? {text: c[1], color: c[2], dash: c[3], headEnd: c[4], headStart: 'none', arrowEnd: c[4] !== 'none', lbBg: '#ffffff', lbColor: c[2], lbBold: true} : {}; };
        // ── pistes à vérifier : le compteur en haut, clic pour aller à la suivante ──
        let hypAt = -1, mmRaf = 0;
        function afterRender() {
            const bt = root.querySelector('[data-bd-hypcount]');
            if (bt && !P().headerHidden?.includes('hyp')) {
                const all = items.filter(i => i.hyp), todo = all.filter(i => i.hyp === 'todo');
                bt.hidden = !all.length; bt.textContent = `❓ ${todo.length} à vérifier`; bt.classList.toggle('is-done', !todo.length);
                bt.title = `${todo.length} à vérifier · ${all.filter(i => i.hyp === 'ok').length} confirmée${all.filter(i => i.hyp === 'ok').length > 1 ? 's' : ''} · ${all.filter(i => i.hyp === 'no').length} fausse${all.filter(i => i.hyp === 'no').length > 1 ? 's' : ''} — clic : aller à la suivante à vérifier`;
            }
            cancelAnimationFrame(mmRaf); mmRaf = requestAnimationFrame(drawMinimap);
        }
        root.querySelector('[data-bd-hypcount]').addEventListener('click', () => {
            const todo = items.filter(i => i.hyp === 'todo' && !hiddenIds.has(i.id)).sort((a, b2) => a.y - b2.y || a.x - b2.x);
            if (!todo.length) { toast('Plus rien à vérifier : bravo !'); return; }
            hypAt = (hypAt + 1) % todo.length; const it = todo[hypAt]; sel = new Set([it.id]); render(); focusOn([it]);
        });
        // ── commentaires : une petite bulle sur l'élément, avec un mot choisi (« À vérifier », « Question »…) ──
        function cmtBubble(it) {
            const l = it.cmt || []; if (!l.length) return '';
            const open = l.filter(c => !c.done);
            return `<button type="button" class="h-bi-cmt ${open.length ? '' : 'is-done'}" data-bd-cmt title="${esc(l.map(c => (c.done ? '✓ ' : '') + (c.w ? c.w + ' : ' : '') + c.t).join('\n'))}">💬 ${open.length ? `${esc(open[0].w || 'Note')}${open.length > 1 ? ` +${open.length - 1}` : ''}` : '✓'}</button>`;
        }
        function commentsDialog(it) {
            const words = () => P().cmtWords || ['À vérifier', 'Question', 'Idée'];
            const list = () => (it.cmt || []).length ? (it.cmt || []).map((c, i) => `<article class="h-bd-cmtrow ${c.done ? 'is-done' : ''}"><label class="checkbox-line" title="Réglé"><input type="checkbox" data-cdone="${i}" ${c.done ? 'checked' : ''}></label><div>${c.w ? `<span class="h-bd-cmtword">${esc(c.w)}</span>` : ''} ${esc(c.t)}<small class="muted">${esc(String(c.at || '').slice(0, 16).replace('T', ' '))}</small></div><button type="button" class="h-bd-unlink" data-cdel="${i}" title="Supprimer" aria-label="Supprimer">×</button></article>`).join('') : '<p class="muted">Pas encore de commentaire sur cet élément.</p>';
            const wordSel = () => `<select data-cword>${words().map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('')}<option value="">(sans mot)</option><option value="__new">＋ un autre mot…</option></select>`;
            const save0 = () => { sigs.delete(it.id); render(); commit(); };
            ext.openDialog({eyebrow: 'TABLEAU', title: '💬 Commentaires', submitLabel: 'Fermer', onSubmit: () => true,
                body: `<div class="h-bd-cmts"><div data-clist>${list()}</div><div class="h-bd-cmtnew"><span data-cwordbox>${wordSel()}</span><input data-cnewword placeholder="Ton mot (ex. « Piste », « Archives »)" maxlength="30" hidden><textarea data-ctext rows="2" placeholder="Ton commentaire…" maxlength="2000"></textarea><button type="button" class="button small" data-cadd>Ajouter</button></div>
                    <details class="h-bd-cmtwords"><summary>Mes mots</summary><p class="muted">Les mots proposés pour les bulles (tu en ajoutes avec « ＋ un autre mot… »).</p><div data-cwords></div></details></div>`,
                onOpen: d => {
                    const refresh = () => { d.querySelector('[data-clist]').innerHTML = list(); d.querySelector('[data-cwords]').innerHTML = words().map(w => `<span class="h-bd-chip">${esc(w)}<button type="button" data-cwdel="${esc(w)}" title="Retirer ce mot" aria-label="Retirer">×</button></span>`).join(''); };
                    refresh();
                    d.addEventListener('change', e => {
                        if (e.target.matches('[data-cword]')) d.querySelector('[data-cnewword]').hidden = e.target.value !== '__new';
                        if (e.target.matches('[data-cdone]')) { if (ro()) return; it.cmt[Number(e.target.dataset.cdone)].done = e.target.checked; save0(); refresh(); }
                    });
                    d.addEventListener('click', e => {
                        const del = e.target.closest('[data-cdel]'); if (del) { if (ro()) return; it.cmt.splice(Number(del.dataset.cdel), 1); if (!it.cmt.length) delete it.cmt; save0(); refresh(); return; }
                        const wd = e.target.closest('[data-cwdel]'); if (wd) { const p = JSON.parse(JSON.stringify(P())); p.cmtWords = (p.cmtWords || []).filter(w => w !== wd.dataset.cwdel); KIT().savePrefs?.(p); refresh(); d.querySelector('[data-cwordbox]').innerHTML = wordSel(); return; }
                        if (e.target.closest('[data-cadd]')) {
                            if (ro()) return;
                            let w = d.querySelector('[data-cword]').value; const t = d.querySelector('[data-ctext]').value.trim();
                            if (w === '__new') { w = d.querySelector('[data-cnewword]').value.trim(); if (w && !words().includes(w)) { const p = JSON.parse(JSON.stringify(P())); p.cmtWords = [...(p.cmtWords || []), w]; KIT().savePrefs?.(p); } }
                            if (!t && !w) { toast('Écris un commentaire ou choisis un mot.', 'error'); return; }
                            it.cmt = [...(it.cmt || []), {id: uid(), w, t, done: false, at: new Date().toISOString()}];
                            d.querySelector('[data-ctext]').value = ''; d.querySelector('[data-cnewword]').value = ''; d.querySelector('[data-cwordbox]').innerHTML = wordSel(); d.querySelector('[data-cnewword]').hidden = true;
                            save0(); refresh();
                        }
                    });
                }});
        }
        // ── le panneau de droite : réglages en plus ──
        let pinT = 0;
        function inspectorMore(e) {
            const one = selItems()[0];
            const hy = e.target.closest('[data-bd-hyp]'); if (hy) { if (ro()) return; const k = hy.dataset.bdHyp; selItems().filter(i => i.type === 'note').forEach(i => { if (k) { i.hyp = k; i.fill = HYP[k][2]; } else delete i.hyp; sigs.delete(i.id); }); render(); commit(); return; }
            const al = e.target.closest('[data-bd-align]'); if (al) { alignSel(al.dataset.bdAlign); return; }
            if (e.target.closest('[data-bd-comments]') && one) { commentsDialog(one); return; }
            if (e.target.closest('[data-bd-unbend]') && one && !ro()) { delete one.bends; render(); commit(); return; }
            if (e.target.closest('[data-bd-pickperson]') && one && !ro()) { pickPerson('La personne de la frise', id0 => { one.person_id = id0; sigs.delete(one.id); render(); commit(); }); return; }
            if (e.target.closest('[data-bd-mapperson]') && one && !ro()) { pickPerson('Les lieux de…', id0 => { const k = String(one.mapSrc || '').split(':')[0]; one.mapSrc = `${k === 'family' ? 'family' : 'person'}:${id0}`; sigs.delete(one.id); render(); commit(); }); return; }
            const pd = e.target.closest('[data-bd-pindel]'); if (pd && one && !ro()) { one.pins.splice(Number(pd.dataset.bdPindel), 1); sigs.delete(one.id); render(); commit(); return; }
            const pa = e.target.closest('[data-bd-pinadd]'); if (pa && one && !ro()) { const r = JSON.parse(pa.dataset.bdPinadd); one.pins = [...(one.pins || []), {lat: r.lat, lon: r.lon, label: r.name, color: '#d0021b'}]; sigs.delete(one.id); render(); commit(); toast(`Repère « ${r.name} » posé.`); }
        }
        function inspectorChange(e) {
            const one = selItems()[0];
            if (e.target.matches('[data-bd-weight]')) { if (ro()) return true; const w = Number(e.target.value) || 400; selItems().forEach(i => { i.weight = w; i.bold = w >= 600; sigs.delete(i.id); }); render(true); commit(); return true; }
            if (e.target.matches('[data-bd-pshow]')) { if (ro()) return true; const ks = [...inspector.querySelectorAll('[data-bd-pshow]:checked')].map(x => x.dataset.bdPshow).join(','); selItems().filter(i => i.type === 'person').forEach(i => { i.pshow = ks; sigs.delete(i.id); }); render(true); commit(); return true; }
            if (e.target.matches('[data-bd-conn]')) { if (ro() || !e.target.value) return true; const pr = connectorProps(e.target.value); selItems().filter(i => i.type === 'line').forEach(i => { Object.assign(i, pr); sigs.delete(i.id); }); render(); commit(); return true; }
            if (e.target.matches('[data-bd-layersel]')) { if (ro()) return true; selItems().forEach(i => { if (e.target.value) i.layer = e.target.value; else delete i.layer; }); render(); commit(); return true; }
            if (e.target.matches('[data-bd-pinlabel]') && one) { one.pins[Number(e.target.dataset.bdPinlabel)].label = e.target.value; sigs.delete(one.id); render(true); commit(); return true; }
            if (e.target.matches('[data-bd-mapkind]') && one) {
                if (ro()) return true; const k = e.target.value, [k0, v0] = String(one.mapSrc || '').split(':');
                if (!k) { one.mapSrc = ''; sigs.delete(one.id); render(); commit(); return true; }
                if (k === 'investigation') { one.mapSrc = ''; sigs.delete(one.id); render(); const box = inspector.querySelector('[data-bd-mapinvbox]'); if (box) box.hidden = false; loadInv(); return true; }
                if (v0 && k0 !== 'investigation') { one.mapSrc = `${k}:${v0}`; sigs.delete(one.id); render(); commit(); }
                else pickPerson('Les lieux de…', id0 => { one.mapSrc = `${k}:${id0}`; sigs.delete(one.id); render(); commit(); });
                return true;
            }
            if (e.target.matches('[data-bd-mapinv]') && one) { if (ro() || !e.target.value) return true; one.mapSrc = 'investigation:' + Number(e.target.value); sigs.delete(one.id); render(); commit(); return true; }
            return false;
        }
        async function loadInv() {
            const s0 = inspector.querySelector('[data-bd-mapinv]'); if (!s0) return;
            const rows = (await invList()).filter(r => r.person_id);
            const cur = String(selItems()[0]?.mapSrc || '').split(':')[1];
            s0.innerHTML = '<option value="">…</option>' + rows.map(r => `<option value="${r.id}" ${String(r.id) === cur ? 'selected' : ''}>${esc(r.title)}${r.person ? ' — ' + esc(r.person) : ''}</option>`).join('') + (rows.length ? '' : '<option value="" disabled>(aucune enquête sur une personne)</option>');
        }
        function inspectorInput(e) {
            if (!e.target.matches('[data-bd-pinq]')) return;
            clearTimeout(pinT); const q = e.target.value.trim(), box = inspector.querySelector('[data-bd-pinres]');
            pinT = setTimeout(async () => { if (q.length < 2) { box.innerHTML = ''; return; } const rows = ((await api('board_place_search', {q}).catch(() => ({}))).places || []); box.innerHTML = rows.map(r => `<button type="button" data-bd-pinadd="${esc(JSON.stringify({name: r.name, lat: r.lat, lon: r.lon}))}">📍 ${esc(r.name)} <small class="muted">${esc(r.detail || '')}</small></button>`).join('') || '<small class="muted">Aucun lieu avec ses coordonnées.</small>'; }, 250);
        }
        const inspObs = new MutationObserver(async () => {
            if (inspector.querySelector('[data-bd-mapinvbox]:not([hidden])') && (inspector.querySelector('[data-bd-mapinv]')?.options.length || 0) <= 1) loadInv();
            const lb = inspector.querySelector('[data-bd-mapsrclabel]'), one = selItems()[0]; if (!lb || !one?.mapSrc) return;
            const [k, v] = one.mapSrc.split(':'); if (k !== 'investigation') { const p = await personBrief(v); lb.textContent = (k === 'family' ? 'Famille de ' : '') + p.name; }
            else lb.textContent = 'Enquête n° ' + v;
        });
        inspObs.observe(inspector, {childList: true});
        // ── « Ajouter » : arbre, frise, carte, cadre, mémo vocal ──
        function addMenuMore(dlg, close) {
            const pid = name => Number(dlg.querySelector(`[name=${name}]`)?.value) || 0;
            dlg.querySelector('[data-bd-addtree]').addEventListener('click', async () => {
                const id0 = pid('bd_tree'); if (!id0) { toast('Choisis la personne.', 'error'); return; }
                close(); await buildTree(id0, dlg.querySelector('[data-bd-treemode]').value, Math.max(1, Math.min(6, Number(dlg.querySelector('[data-bd-treegens]').value) || 3)), dlg.querySelector('[data-bd-treespouse]').checked, dlg.querySelector('[data-bd-treearrow]').checked);
            });
            dlg.querySelector('[data-bd-addtl]').addEventListener('click', async () => { const id0 = pid('bd_tl'); if (!id0) { toast('Choisis la personne.', 'error'); return; } const p = await personBrief(id0); place({type: 'timeline', person_id: id0, tlMode: dlg.querySelector('[data-bd-tlmode]').value, title: 'Frise de ' + p.name, w: 960, h: 300, fs: 12}); close(); });
            dlg.querySelector('[data-bd-addmap]').addEventListener('click', async () => { const id0 = pid('bd_map'), mode = dlg.querySelector('[data-bd-mapmode]').value; if (mode && !id0) { toast('Choisis la personne (ou « seulement mes repères »).', 'error'); return; } const p = id0 ? await personBrief(id0) : null; place({type: 'map', mapSrc: mode && id0 ? `${mode}:${id0}` : '', pins: [], title: p ? 'Les lieux de ' + p.name : 'Carte', w: 640, h: 460}); close(); });
            dlg.querySelector('[data-bd-addframe]').addEventListener('click', () => {
                const name = dlg.querySelector('[data-bd-framename]').value.trim() || 'Cadre', z0 = items.reduce((m, i) => Math.min(m, i.z || 0), 0) - 1, inside = selItems().filter(i => !hiddenIds.has(i.id));
                if (inside.length) { const bb = bbox(inside); if (ro()) return; const f = {id: uid(), type: 'frame', title: name, x: bb.x - 30, y: bb.y - 64, w: bb.w + 60, h: bb.h + 94, z: z0, fill: '#eef4ff', stroke: '#9fb7d9', ...(activeLayer ? {layer: activeLayer} : {})}; items.push(f); sel = new Set([f.id]); render(); commit(); }
                else place({type: 'frame', title: name, w: 640, h: 420, z: z0, fill: '#eef4ff', stroke: '#9fb7d9'});
                close();
            });
            dlg.querySelector('[data-bd-addmemo]').addEventListener('click', () => { close(); memoDialog(); });
        }
        /** L'arbre automatique : des fiches reliées (ancêtres, descendants ou famille proche), groupées */
        async function buildTree(rootId, mode, gens, withSp, arrows) {
            if (ro()) return;
            status('Arbre : lecture des fiches…');
            const CW = 220, CH = 92, GX = 34, GY = 96, nodes = new Map(), edges = [], spouseEdges = [], MAX = 250;
            const add = (pid, x, y) => { const k = pid + '@' + nodes.size; nodes.set(k, {pid, x, y}); return k; };
            const sexSort = async ids => { const ps = await Promise.all(ids.map(personBrief)); return ids.map((id0, i) => [id0, ps[i]]).sort((a, b2) => (a[1].gender === 'male' ? 0 : 1) - (b2[1].gender === 'male' ? 0 : 1)).map(x => x[0]); };
            if (mode === 'up') {
                const W = Math.pow(2, gens) * (CW + GX);
                const rec = async (id0, g, slot) => {
                    if (nodes.size >= MAX) return null;
                    const k = add(id0, (slot + .5) * W / Math.pow(2, g) - CW / 2, (gens - g) * (CH + GY));
                    if (g < gens) { const ps = await sexSort((await personData(id0)).parents.slice(0, 2)); for (const [i, par] of ps.entries()) { const pk = await rec(par, g + 1, slot * 2 + i); if (pk) edges.push([pk, k]); } if (withSp && ps.length === 2) spouseEdges.push([[...nodes.keys()].find(x => x.startsWith(ps[0] + '@')), [...nodes.keys()].find(x => x.startsWith(ps[1] + '@'))]); }
                    return k;
                };
                await rec(rootId, 0, 0);
            } else if (mode === 'down') {
                const seen = new Set([rootId]);
                const tree = async (id0, g) => {
                    const p = await personData(id0), sp = withSp ? p.partners.map(x => x.id).filter(x => x && !seen.has(x)) : [];
                    sp.forEach(x => seen.add(x));
                    const kids = [];
                    if (g < gens) for (const c of p.children) { if (seen.has(c) || seen.size >= MAX) continue; seen.add(c); kids.push(await tree(c, g + 1)); }
                    const own = (1 + sp.length) * (CW + GX), w = Math.max(own, kids.reduce((t, k0) => t + k0.w, 0));
                    return {id: id0, sp, kids, w, own};
                };
                const lay = (n, x0, g) => {
                    const k = add(n.id, x0 + (n.w - n.own) / 2, g * (CH + GY)); let sx = x0 + (n.w - n.own) / 2 + CW + GX;
                    n.sp.forEach(s0 => { const sk = add(s0, sx, g * (CH + GY)); spouseEdges.push([k, sk]); sx += CW + GX; });
                    let cx = x0 + (n.w - n.kids.reduce((t, k0) => t + k0.w, 0)) / 2; n.kids.forEach(c => { const ck = lay(c, cx, g + 1); edges.push([k, ck]); cx += c.w; });
                    return k;
                };
                lay(await tree(rootId, 0), 0, 0);
            } else {
                const me = await personData(rootId), pars = await sexSort(me.parents.slice(0, 2));
                const sibs = [...new Set((await Promise.all(pars.map(personData))).flatMap(p => p.children))].filter(x => x !== rootId).slice(0, 14);
                const sp = withSp ? me.partners.map(x => x.id).filter(Boolean).slice(0, 4) : [], kids = me.children.slice(0, 16);
                const row = (ids, y) => { const w = ids.length * (CW + GX); return ids.map((id0, i) => add(id0, -w / 2 + i * (CW + GX), y)); };
                const pk = row(pars, 0), mid = row([...sibs, rootId, ...sp], CH + GY), ck = row(kids, 2 * (CH + GY));
                const meK = mid[sibs.length];
                pk.forEach(p0 => mid.slice(0, sibs.length + 1).forEach(m => edges.push([p0, m])));
                if (pk.length === 2 && withSp) spouseEdges.push([pk[0], pk[1]]);
                mid.slice(sibs.length + 1).forEach(s0 => spouseEdges.push([meK, s0]));
                ck.forEach(c => edges.push([meK, c]));
            }
            if (!nodes.size) { status('Enregistré ✓'); return; }
            // posé au milieu de la vue, groupé
            const r = stage.getBoundingClientRect(), [cx, cy] = toWorld(r.left + r.width / 2, r.top + r.height / 2), all = [...nodes.values()];
            const bb = {x: Math.min(...all.map(n => n.x)), y: Math.min(...all.map(n => n.y)), w: Math.max(...all.map(n => n.x)) - Math.min(...all.map(n => n.x)) + CW, h: Math.max(...all.map(n => n.y)) - Math.min(...all.map(n => n.y)) + CH};
            const [ox, oy] = freeSpot(bb);
            const grp = uid(), ids = new Map(), out = []; let z = topZ() + 1;
            for (const [k, n] of nodes) { const id0 = uid(); ids.set(k, id0); out.push({id: id0, type: 'person', person_id: n.pid, x: n.x + ox, y: n.y + oy, w: CW, h: CH, z: z++, group: grp, pshow: 'photo,years', ...(activeLayer ? {layer: activeLayer} : {})}); }
            const line = (a, b2, extra) => ({id: uid(), type: 'line', from: ids.get(a), to: ids.get(b2), points: [[0, 0], [0, 0]], x: 0, y: 0, w: 4, h: 4, z: z++, group: grp, color: '#555555', sw: 2, headStart: 'none', ...(activeLayer ? {layer: activeLayer} : {}), ...extra});
            edges.forEach(([a, b2]) => { if (ids.has(a) && ids.has(b2)) out.push(line(a, b2, {path: 'elbow', headEnd: arrows ? 'triangle' : 'none', arrowEnd: arrows})); });
            spouseEdges.forEach(([a, b2]) => { if (ids.has(a) && ids.has(b2)) out.push(line(a, b2, {path: 'straight', headEnd: 'none', color: '#c2185b', dash: 'dash'})); });
            items.push(...out); sel = new Set(out.map(i => i.id)); render(); commit(); focusOn(out.filter(i => i.type === 'person'), 1);
            toast(`Arbre posé : ${nodes.size} fiche${nodes.size > 1 ? 's' : ''}${nodes.size >= MAX ? ' (limite atteinte)' : ''}. Chaque carte reste liée à sa fiche (double-clic pour l’ouvrir).`);
        }
        // ── mémo vocal : enregistré ici, rangé avec le tableau ──
        function memoDialog() {
            if (ro()) return;
            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Pas de micro disponible ici.', 'error'); return; }
            let rec = null, chunks = [], blob = null, t0 = 0, tick = 0, stream = null;
            const stopAll = () => { clearInterval(tick); try { rec?.state === 'recording' && rec.stop(); } catch (_) {} stream?.getTracks().forEach(t => t.stop()); };
            const d0 = ext.openDialog({eyebrow: 'TABLEAU', title: '🎙 Mémo vocal', submitLabel: 'Poser sur le tableau',
                body: `<div class="h-bd-memo"><button type="button" class="button" data-mrec>⏺ Enregistrer</button><span class="h-bd-memotime" data-mtime>0:00</span><audio controls data-maudio hidden></audio><label>Titre du mémo<input data-mtitle value="Mémo du ${new Date().toLocaleDateString('fr-FR')}" maxlength="160"></label><p class="muted">Le son est rangé avec ce tableau (et dans les médias de l’app).</p></div>`,
                onOpen: d => {
                    const bt = d.querySelector('[data-mrec]'), tm = d.querySelector('[data-mtime]'), au = d.querySelector('[data-maudio]');
                    bt.addEventListener('click', async () => {
                        if (rec?.state === 'recording') { rec.stop(); return; }
                        try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (_) { toast('Micro refusé : autorise-le dans les réglages de l’ordinateur.', 'error'); return; }
                        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
                        rec = new MediaRecorder(stream, mime ? {mimeType: mime} : {}); chunks = []; blob = null; au.hidden = true;
                        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
                        rec.onstop = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); blob = new Blob(chunks, {type: rec.mimeType || 'audio/webm'}); au.src = URL.createObjectURL(blob); au.hidden = false; bt.textContent = '⏺ Recommencer'; bt.classList.remove('is-rec'); };
                        rec.start(250); t0 = Date.now(); bt.textContent = '⏹ Arrêter'; bt.classList.add('is-rec');
                        tick = setInterval(() => { const s0 = Math.round((Date.now() - t0) / 1000); tm.textContent = `${Math.floor(s0 / 60)}:${String(s0 % 60).padStart(2, '0')}`; if (s0 >= 1800) rec.stop(); }, 250);
                    });
                    d.addEventListener('close', stopAll);
                },
                onSubmit: async form => {
                    if (rec?.state === 'recording') { toast('Arrête d’abord l’enregistrement.', 'error'); return false; }
                    if (!blob || !blob.size) { toast('Enregistre d’abord ton mémo.', 'error'); return false; }
                    const ext0 = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm', title = form.querySelector('[data-mtitle]').value.trim() || 'Mémo vocal';
                    await uploadAndPlace([new File([blob], title.replace(/[\\/:*?"<>|]+/g, '-') + '.' + ext0, {type: blob.type})], null, true);
                    stopAll();
                }});
            return d0;
        }
        // ── coller plusieurs lignes ou un bout de tableur : choisir ce que ça devient ──
        function pasteDialog(text) {
            const lines = text.replace(/\r/g, '').split('\n').map(l => l.trimEnd()).filter(l => l.trim()), tabs = lines.some(l => l.includes('\t'));
            ext.openDialog({eyebrow: 'TABLEAU', title: 'Coller', submitLabel: 'Poser',
                body: `<div class="h-bd-expopt"><p class="muted">${lines.length} ligne${lines.length > 1 ? 's' : ''}${tabs ? ', en colonnes (un bout de tableur)' : ''}.</p>
                    ${tabs ? '<label class="h-bd-expchoice"><input type="radio" name="as" value="table" checked><span><strong>▦ Un tableur</strong><small>Les lignes et les colonnes gardées, avec les formules possibles.</small></span></label>' : ''}
                    <label class="h-bd-expchoice"><input type="radio" name="as" value="notes" ${tabs ? '' : 'checked'}><span><strong>🗒 Une note par ligne</strong><small>Chaque ligne devient une note, rangées en grille.</small></span></label>
                    ${tabs ? '<label class="h-bd-expchoice"><input type="radio" name="as" value="rows"><span><strong>🗂 Une note par ligne du tableur</strong><small>Les colonnes d’une ligne dans la même note.</small></span></label>' : ''}
                    <label class="h-bd-expchoice"><input type="radio" name="as" value="text"><span><strong>T Un seul texte</strong><small>Tout le texte collé, d’un bloc.</small></span></label>
                    <label class="checkbox-line"><input type="checkbox" name="grp" checked> <span>grouper ce qui est posé</span></label></div>`,
                onSubmit: form => {
                    if (ro()) return;
                    const as = form.querySelector('[name=as]:checked')?.value || 'notes', grp = form.elements.grp.checked ? uid() : '';
                    if (as === 'text') { place({type: 'text', text, w: 360, h: Math.min(900, 28 + lines.length * 26), fs: 18, color: '#111111'}); return; }
                    if (as === 'table') {
                        const grid = lines.slice(0, 100).map(l => l.split('\t').slice(0, 30)), cols = Math.max(...grid.map(r => r.length));
                        const t = newTable(); t.cells = grid.map(r => Array.from({length: cols}, (_, c) => r[c] ?? '')); t.colw = Array(cols).fill(120); t.w = Math.min(3600, cols * 120); t.h = Math.min(4000, grid.length * (t.fs || 14) * 2.2);
                        place(t); return;
                    }
                    const texts = lines.map(l => l.split('\t').map(c => c.trim()).filter(Boolean).join(as === 'rows' ? ' · ' : '\n')).slice(0, 200), per = Math.ceil(Math.sqrt(texts.length));
                    const W = 200, H = 140, G = 24, [x0, y0] = freeSpot({x: 0, y: 0, w: per * (W + G) - G, h: Math.ceil(texts.length / per) * (H + G) - G});
                    let z = topZ() + 1; const out = texts.map((t, i) => ({id: uid(), type: 'note', text: t, x: x0 + (i % per) * (W + G), y: y0 + Math.floor(i / per) * (H + G), w: W, h: H, z: z++, fill: pal('note')[i % pal('note').length] || NOTE_COLORS[0], fs: 16, ...(grp ? {group: grp} : {}), ...(activeLayer ? {layer: activeLayer} : {})}));
                    items.push(...out); sel = new Set(out.map(i => i.id)); render(); commit(); toast(`${out.length} note${out.length > 1 ? 's' : ''} posée${out.length > 1 ? 's' : ''}.`);
                }});
        }
        // ── mes modèles : un tableau (ou la sélection) gardé pour en commencer d'autres ──
        function saveTemplate() {
            ext.openDialog({eyebrow: 'TABLEAU', title: '⭐ En faire un modèle', submitLabel: 'Enregistrer le modèle',
                body: `<div class="form-grid"><label class="span-2">Nom du modèle<input name="name" value="${esc(root.querySelector('[data-bd-title]').value.trim() || 'Mon modèle')}" maxlength="60" required></label><label>Icône<input name="icon" value="⭐" maxlength="4"></label>
                    <label class="span-2">Décris-le <small class="muted">(facultatif)</small><input name="hint" maxlength="120" placeholder="Pour une enquête sur un enfant trouvé…"></label>
                    ${sel.size ? '<label class="checkbox-line span-2"><input type="checkbox" name="only"> <span>seulement la sélection</span></label>' : ''}
                    <label class="checkbox-line span-2"><input type="checkbox" name="empty"> <span>sans les textes (garder les cases vides, les titres des cadres restent)</span></label>
                    <p class="muted span-2">Il apparaît dans « Nouveau tableau », avec les modèles de l’app. Les fiches, photos et sons posés sont gardés tels quels (ils pointent vers ta base).</p></div>`,
                onSubmit: form => {
                    const its = (form.elements.only?.checked ? selItems() : items).map(clone).map(i => { if (form.elements.empty.checked && i.type !== 'frame' && 'text' in i && ['note', 'text', 'shape'].includes(i.type)) i.text = ''; delete i.cmt; return i; });
                    const tpl = {id: 't' + Date.now().toString(36), name: form.elements.name.value.trim() || 'Mon modèle', icon: form.elements.icon.value.trim() || '⭐', hint: form.elements.hint.value.trim(), items: its, bg, bgColor, bgPattern, layers: clone(layers)};
                    const list = myTemplates(); list.push(tpl);
                    try { localStorage.setItem(TPL_KEY, JSON.stringify(list)); } catch (_) { toast('Modèle trop lourd pour être gardé (des formes faites d’une image ?).', 'error'); return false; }
                    toast(`Modèle « ${tpl.name} » enregistré : il est dans « Nouveau tableau ».`);
                }});
        }
        // ── calques : montrer, cacher, verrouiller ; les nouveaux éléments vont sur le calque choisi ──
        function layersPanel(btn) {
            const old = root.querySelector('.h-bd-layers'); if (old) { old.remove(); return; }
            const m = document.createElement('div'); m.className = 'h-bd-pop h-bd-layers';
            const count = id0 => items.filter(i => (i.layer || '') === id0).length;
            const row = (L, main = false) => `<div class="h-bd-layrow ${activeLayer === (main ? '' : L.id) ? 'is-active' : ''}"><label title="Les nouveaux éléments vont sur ce calque"><input type="radio" name="bdact" data-lact="${main ? '' : esc(L.id)}" ${activeLayer === (main ? '' : L.id) ? 'checked' : ''}></label>
                ${main ? `<span class="h-bd-layname">Calque principal</span>` : `<input class="h-bd-layname" data-lname="${esc(L.id)}" value="${esc(L.name)}" maxlength="60">`}<small class="muted">${count(main ? '' : L.id)}</small>
                ${main ? '' : `<button type="button" class="h-bt ${L.hidden ? '' : 'is-on'}" data-lhide="${esc(L.id)}" title="${L.hidden ? 'Montrer' : 'Cacher'}">${L.hidden ? '🙈' : '👁'}</button><button type="button" class="h-bt ${L.locked ? 'is-on' : ''}" data-llock="${esc(L.id)}" title="${L.locked ? 'Déverrouiller' : 'Verrouiller'}">${L.locked ? '🔒' : '🔓'}</button><button type="button" class="h-bt" data-lup="${esc(L.id)}" title="Monter">↑</button><button type="button" class="h-bt" data-lsel="${esc(L.id)}" title="Choisir ce qu’il contient">⬚</button><button type="button" class="h-bd-unlink" data-ldel="${esc(L.id)}" title="Supprimer le calque (ses éléments vont sur le calque principal)">×</button>`}</div>`;
            const draw = () => { m.innerHTML = `<h5>🗂 Calques</h5>${[...layers].reverse().map(L => row(L)).join('')}${row({}, true)}<div class="h-bd-row"><button type="button" class="button small" data-lnew>＋ Nouveau calque</button>${sel.size ? `<button type="button" class="button small secondary" data-lmove>Mettre la sélection sur le calque choisi</button>` : ''}</div><p class="muted"><small>Un calque caché ne s’affiche pas (ni dans les images exportées) ; verrouillé, on ne peut plus le choisir ni le bouger.</small></p>`; };
            draw();
            btn.closest('.h-bd-menuwrap').appendChild(m);
            const changed = () => { render(); queueSave(true); draw(); };
            m.addEventListener('click', e => {
                if (e.target.closest('[data-lnew]')) { if (ro()) return; const L = {id: 'l' + uid(), name: 'Calque ' + (layers.length + 1), hidden: false, locked: false}; layers.push(L); activeLayer = L.id; changed(); return; }
                if (e.target.closest('[data-lmove]')) { if (ro()) return; selItems().forEach(i => { if (activeLayer) i.layer = activeLayer; else delete i.layer; }); render(); commit(); draw(); return; }
                const L = id0 => layers.find(x => x.id === id0);
                const h = e.target.closest('[data-lhide]'); if (h) { const l0 = L(h.dataset.lhide); l0.hidden = !l0.hidden; changed(); return; }
                const lk = e.target.closest('[data-llock]'); if (lk) { const l0 = L(lk.dataset.llock); l0.locked = !l0.locked; changed(); return; }
                const up = e.target.closest('[data-lup]'); if (up) { const i = layers.findIndex(x => x.id === up.dataset.lup); if (i < layers.length - 1) { [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]]; restackLayers(); } changed(); return; }
                const ls = e.target.closest('[data-lsel]'); if (ls) { sel = new Set(items.filter(i => i.layer === ls.dataset.lsel && !hiddenIds.has(i.id)).map(i => i.id)); render(); draw(); return; }
                const dl = e.target.closest('[data-ldel]'); if (dl) { if (ro()) return; const id0 = dl.dataset.ldel; if (!confirm('Supprimer ce calque ? Ses éléments restent, sur le calque principal.')) return; items.forEach(i => { if (i.layer === id0) delete i.layer; }); layers = layers.filter(x => x.id !== id0); if (activeLayer === id0) activeLayer = ''; render(); commit(); draw(); }
            });
            m.addEventListener('change', e => { const a = e.target.closest('[data-lact]'); if (a) { activeLayer = a.dataset.lact; draw(); } const n = e.target.closest('[data-lname]'); if (n) { const l0 = layers.find(x => x.id === n.dataset.lname); if (l0) { l0.name = n.value.trim() || l0.name; queueSave(true); } } });
            setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !btn.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
        }
        // l'ordre des calques : ceux d'en haut de la liste passent devant
        function restackLayers() { const rank = id0 => id0 ? layers.findIndex(x => x.id === id0) + 1 : 0; [...items].sort((a, b2) => rank(a.layer) - rank(b2.layer) || (a.z || 0) - (b2.z || 0)).forEach((i, n) => { i.z = n; }); commit(); }
        root.querySelector('[data-bd-layers]').addEventListener('click', e => layersPanel(e.currentTarget));
        // ── chercher dans le tableau : textes, titres, noms des fiches ──
        function searchPanel(btn) {
            const old = root.querySelector('.h-bd-search'); if (old) { old.remove(); return; }
            const m = document.createElement('div'); m.className = 'h-bd-pop h-bd-search';
            m.innerHTML = '<input type="search" placeholder="Chercher un mot, un nom…" data-sq><div class="h-bd-results" data-sres></div>';
            btn.closest('.h-bd-menuwrap').appendChild(m);
            const q = m.querySelector('[data-sq]'), res = m.querySelector('[data-sres]'); let hits = [], at = -1;
            const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            const textOf = i => [i.text, i.title, ...(i.cmt || []).map(c => c.w + ' ' + c.t), i.type === 'table' ? (i.cells || []).flat().join(' ') : '', els.get(i.id)?.textContent || '', i.type === 'media' ? media[i.media_id]?.title : '', (i.pins || []).map(p => p.label).join(' ')].join(' ');
            const go0 = n => { const it = hits[n]; if (!it) return; at = n; if (hiddenIds.has(it.id)) { items.filter(f => f.type === 'frame' && f.collapsed && framed(f).includes(it)).forEach(f => toggleFrame(f)); const L = layers.find(x => x.id === it.layer); if (L?.hidden) { L.hidden = false; render(); } } sel = new Set([it.id]); render(); focusOn([it]); res.querySelectorAll('[data-sn]').forEach(x => x.classList.toggle('is-on', Number(x.dataset.sn) === n)); };
            q.addEventListener('input', () => {
                const n = norm(q.value.trim()); at = -1;
                hits = n.length < 2 ? [] : items.filter(i => i.type !== 'draw' && norm(textOf(i)).includes(n));
                res.innerHTML = hits.slice(0, 40).map((i, k) => { const t = textOf(i).replace(/\s+/g, ' ').trim(), p0 = norm(t).indexOf(n); return `<button type="button" data-sn="${k}"><small class="muted">${esc(({note: '🗒', text: 'T', shape: '⬠', person: '👤', table: '▦', frame: '▭', timeline: '🗓', map: '🗺', media: '🖼', line: '➝', tag: '🏷'}[i.type]) || '•')}</small> ${esc(t.slice(Math.max(0, p0 - 20), p0 + 60))}</button>`; }).join('') || (n.length >= 2 ? '<small class="muted">Rien trouvé.</small>' : '');
            });
            q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && hits.length) { e.preventDefault(); go0((at + (e.shiftKey ? -1 + hits.length : 1)) % hits.length); } if (e.key === 'Escape') m.remove(); });
            res.addEventListener('click', e => { const b0 = e.target.closest('[data-sn]'); if (b0) go0(Number(b0.dataset.sn)); });
            setTimeout(() => { q.focus(); document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target) && !btn.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true); }, 0);
        }
        root.querySelector('[data-bd-search]').addEventListener('click', e => searchPanel(e.currentTarget));
        window.addEventListener('keydown', function onFind(e) { if (!root.isConnected) { window.removeEventListener('keydown', onFind, true); return; } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]') && (root.contains(document.activeElement) || document.activeElement === document.body)) { e.preventDefault(); e.stopImmediatePropagation(); const bt = root.querySelector('[data-bd-search]'); if (!root.querySelector('.h-bd-search')) searchPanel(bt); else root.querySelector('.h-bd-search [data-sq]').focus(); } }, true);
        // ── mini-carte : tout le tableau en petit, la vue en cadre ; on la cache, on la déplace où on veut ──
        const MM_KEY = 'genealogie-board-minimap';
        const mmPref = (() => { try { return {hidden: true, x: null, y: null, ...JSON.parse(localStorage.getItem(MM_KEY) || '{}')}; } catch (_) { return {hidden: true, x: null, y: null}; } })();
        const mm = document.createElement('div'); mm.className = 'h-bd-minimap'; mm.innerHTML = '<header data-mmdrag title="Glisser pour déplacer la mini-carte">🗺 <span>Mini-carte</span><button type="button" data-mmhide title="Cacher la mini-carte">×</button></header><canvas width="220" height="150"></canvas>'; stage.appendChild(mm);
        const mmSave = () => { try { localStorage.setItem(MM_KEY, JSON.stringify(mmPref)); } catch (_) {} };
        const mmPlace = () => { mm.hidden = mmPref.hidden; root.querySelector('[data-bd-minimap]')?.classList.toggle('is-on', !mmPref.hidden); if (mmPref.x !== null) { mm.style.left = mmPref.x + '%'; mm.style.top = mmPref.y + '%'; mm.style.right = 'auto'; mm.style.bottom = 'auto'; } };
        mmPlace();
        let mmMap = null;
        function drawMinimap() {
            if (mm.hidden) return;
            const c = mm.querySelector('canvas'), x = c.getContext('2d'), r = stage.getBoundingClientRect(), vis = items.filter(i => !hiddenIds.has(i.id));
            const vw = {x: -view.x / view.k, y: -view.y / view.k, w: r.width / view.k, h: r.height / view.k}, bb = bbox([...vis, vw]) || vw;
            const k = Math.min((c.width - 8) / bb.w, (c.height - 8) / bb.h), ox = 4 - bb.x * k + (c.width - 8 - bb.w * k) / 2, oy = 4 - bb.y * k + (c.height - 8 - bb.h * k) / 2;
            mmMap = {k, ox, oy};
            x.clearRect(0, 0, c.width, c.height);
            vis.forEach(i => { x.fillStyle = i.type === 'note' ? (i.fill || NOTE_COLORS[0]) : i.type === 'frame' ? 'rgba(80,120,200,.18)' : i.type === 'line' ? 'transparent' : i.type === 'shape' ? (i.fill && i.fill !== 'transparent' ? i.fill : '#9fb7d9') : '#b8c2cf'; x.fillRect(ox + i.x * k, oy + i.y * k, Math.max(1.5, i.w * k), Math.max(1.5, i.h * k)); });
            x.strokeStyle = '#d0021b'; x.lineWidth = 1.5; x.strokeRect(ox + vw.x * k, oy + vw.y * k, vw.w * k, vw.h * k);
        }
        mm.addEventListener('pointerdown', e => {
            e.stopPropagation();
            if (e.target.closest('[data-mmhide]')) { mmPref.hidden = true; mmSave(); mmPlace(); return; }
            const r = stage.getBoundingClientRect();
            if (e.target.closest('[data-mmdrag]')) { const m0 = mm.getBoundingClientRect(), sx = e.clientX - m0.left, sy = e.clientY - m0.top; const mv = ev => { mmPref.x = Math.max(0, Math.min(100 - m0.width / r.width * 100, (ev.clientX - r.left - sx) / r.width * 100)); mmPref.y = Math.max(0, Math.min(100 - m0.height / r.height * 100, (ev.clientY - r.top - sy) / r.height * 100)); mmPlace(); }; const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); mmSave(); }; document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); return; }
            const c = mm.querySelector('canvas'), goTo = ev => { if (!mmMap) return; const cr = c.getBoundingClientRect(), wx = ((ev.clientX - cr.left) * c.width / cr.width - mmMap.ox) / mmMap.k, wy = ((ev.clientY - cr.top) * c.height / cr.height - mmMap.oy) / mmMap.k; view.x = r.width / 2 - wx * view.k; view.y = r.height / 2 - wy * view.k; applyView(); drawMinimap(); };
            goTo(e); const up = () => { document.removeEventListener('pointermove', goTo); document.removeEventListener('pointerup', up); queueSave(false); }; document.addEventListener('pointermove', goTo); document.addEventListener('pointerup', up);
        });
        mm.addEventListener('wheel', e => e.stopPropagation(), {passive: true});
        root.querySelector('[data-bd-minimap]').addEventListener('click', () => { mmPref.hidden = !mmPref.hidden; mmSave(); mmPlace(); drawMinimap(); });
        stage.addEventListener('wheel', () => { cancelAnimationFrame(mmRaf); mmRaf = requestAnimationFrame(drawMinimap); }, {passive: true});
        stage.addEventListener('pointermove', () => { if (drag?.kind === 'pan') { cancelAnimationFrame(mmRaf); mmRaf = requestAnimationFrame(drawMinimap); } });
        // ── présenter : un parcours d'étapes (des vues gardées) que le tableau suit en zoomant ──
        const stepRect = () => { const r = stage.getBoundingClientRect(); return {x: -view.x / view.k, y: -view.y / view.k, w: r.width / view.k, h: r.height / view.k}; };
        function presentMenu(btn) {
            popMenu(btn, [['play', `▶ Lancer la présentation${steps.length ? ` (${steps.length} étape${steps.length > 1 ? 's' : ''})` : ''}`], '-', ['addview', '＋ La vue actuelle comme étape'], ['addsel', '＋ La sélection comme étape', !sel.size], ['frames', '＋ Une étape par cadre', !items.some(i => i.type === 'frame')], '-', ['manage', '☰ Les étapes (renommer, ordre…)', !steps.length]], k => {
                if (k === 'play') return present();
                if (k === 'manage') return stepsDialog();
                if (ro()) return;
                if (k === 'addview') steps.push({id: uid(), name: 'Étape ' + (steps.length + 1), ...stepRect()});
                if (k === 'addsel') { const bb = bbox(selItems()); steps.push({id: uid(), name: selItems()[0]?.title || String(selItems()[0]?.text || '').split('\n')[0].slice(0, 60) || 'Étape ' + (steps.length + 1), x: bb.x - 40, y: bb.y - 40, w: bb.w + 80, h: bb.h + 80}); }
                if (k === 'frames') items.filter(i => i.type === 'frame').sort((a, b2) => a.y - b2.y || a.x - b2.x).forEach(f => steps.push({id: uid(), name: f.title || 'Cadre', x: f.x - 30, y: f.y - 30, w: f.w + 60, h: (f.collapsed ? f.fh || f.h : f.h) + 60}));
                queueSave(true); toast(`${steps.length} étape${steps.length > 1 ? 's' : ''} dans la présentation.`);
            });
        }
        function stepsDialog() {
            const rows = () => steps.map((st, i) => `<div class="h-bd-steprow"><span class="h-bd-stepn">${i + 1}</span><input data-sname="${i}" value="${esc(st.name)}" maxlength="80"><button type="button" class="h-bt" data-sgo="${i}" title="Y aller">👁</button><button type="button" class="h-bt" data-sset="${i}" title="Remplacer par la vue actuelle">⟳ vue</button><button type="button" class="h-bt" data-sup="${i}" title="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="h-bt" data-sdown="${i}" title="Descendre" ${i < steps.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="h-bd-unlink" data-sdel="${i}" title="Enlever">×</button></div>`).join('') || '<p class="muted">Aucune étape.</p>';
            ext.openDialog({eyebrow: 'TABLEAU', title: '▶ Les étapes de la présentation', submitLabel: 'Fermer', onSubmit: () => true, body: `<div class="h-bd-steps" data-slist>${rows()}</div>`,
                onOpen: d => {
                    const re = () => { d.querySelector('[data-slist]').innerHTML = rows(); queueSave(true); };
                    d.addEventListener('input', e => { const n = e.target.closest('[data-sname]'); if (n) { steps[Number(n.dataset.sname)].name = n.value; queueSave(true); } });
                    d.addEventListener('click', e => {
                        const g = (a) => e.target.closest(`[${a}]`); let b0;
                        if ((b0 = g('data-sgo'))) { glideTo(steps[Number(b0.dataset.sgo)]); return; }
                        if (ro()) return;
                        if ((b0 = g('data-sset'))) { Object.assign(steps[Number(b0.dataset.sset)], stepRect()); re(); toast('Étape remplacée par la vue actuelle.'); return; }
                        if ((b0 = g('data-sup'))) { const i = Number(b0.dataset.sup); [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; re(); return; }
                        if ((b0 = g('data-sdown'))) { const i = Number(b0.dataset.sdown); [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; re(); return; }
                        if ((b0 = g('data-sdel'))) { steps.splice(Number(b0.dataset.sdel), 1); re(); }
                    });
                }});
        }
        function glideTo(st) {
            const r = stage.getBoundingClientRect(), k = Math.max(0.05, Math.min(6, r.width / st.w, r.height / st.h));
            view.k = k; view.x = r.width / 2 - (st.x + st.w / 2) * k; view.y = r.height / 2 - (st.y + st.h / 2) * k;
            world.classList.add('is-gliding'); applyView(); setTimeout(() => world.classList.remove('is-gliding'), 750); drawMinimap();
        }
        function present() {
            const list = steps.length ? steps : items.filter(i => i.type === 'frame').sort((a, b2) => a.y - b2.y || a.x - b2.x).map(f => ({name: f.title || 'Cadre', x: f.x - 30, y: f.y - 30, w: f.w + 60, h: f.h + 60}));
            if (!list.length) { toast('Ajoute d’abord des étapes (▶ Présenter → ＋ La vue actuelle comme étape) ou des cadres.', 'error'); return; }
            const saved = {...view}; let n = 0;
            sel.clear(); render(); root.classList.add('is-present');
            const bar = document.createElement('div'); bar.className = 'h-bd-presentbar'; stage.appendChild(bar);
            const show = () => { bar.innerHTML = `<button type="button" data-pv="-1" ${n ? '' : 'disabled'} title="Étape d’avant (←)">◀</button><span><strong>${esc(list[n].name || '')}</strong> <small>${n + 1} / ${list.length}</small></span><button type="button" data-pv="1" ${n < list.length - 1 ? '' : 'disabled'} title="Étape suivante (→ ou espace)">▶</button><button type="button" data-pend title="Quitter (Échap)">✕</button>`; setTimeout(() => glideTo(list[n]), 30); };
            let over = false;
            const onFs = () => { if (!document.fullscreenElement) end(); }; // Échap quitte d'abord le plein écran : la présentation s'arrête aussi
            const end = () => { if (over) return; over = true; document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', key, true); bar.remove(); root.classList.remove('is-present'); Object.assign(view, saved); setTimeout(applyView, 30); try { document.fullscreenElement && document.exitFullscreen(); } catch (_) {} };
            const key = e => { if (!root.isConnected) return end(); const k = e.key; if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); if (n < list.length - 1) { n++; show(); } } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); if (n) { n--; show(); } } else if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); } else e.stopImmediatePropagation(); };
            bar.addEventListener('click', e => { const b0 = e.target.closest('[data-pv]'); if (b0) { n = Math.max(0, Math.min(list.length - 1, n + Number(b0.dataset.pv))); show(); } if (e.target.closest('[data-pend]')) end(); });
            bar.addEventListener('pointerdown', e => e.stopPropagation());
            window.addEventListener('keydown', key, true);
            try { root.requestFullscreen?.().then(() => document.addEventListener('fullscreenchange', onFs)).catch(() => {}); } catch (_) {}
            show();
        }
        root.querySelector('[data-bd-present]').addEventListener('click', e => presentMenu(e.currentTarget));
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
        const mine = myTemplates();
        ext.openDialog({eyebrow: 'TABLEAUX', title: 'Nouveau tableau', submitLabel: 'Créer',
            body: `<div class="form-grid"><label class="span-2">Titre<input name="title" placeholder="Qui est le père de Marie ?" required></label>${owner.owner_type ? `<label class="span-2">Partie <small class="muted">(facultatif)</small><input name="part" placeholder="Piste 1, les témoins…"></label>` : ''}</div>
                <h4>Pour commencer</h4><div class="h-bd-templates">${TEMPLATES.map(([k, i, l, h], n) => `<label class="h-bd-tpl"><input type="radio" name="tpl" value="${k}" ${n ? '' : 'checked'}><span class="h-bd-tplicon">${i}</span><strong>${esc(l)}</strong><small>${esc(h)}</small></label>`).join('')}</div>
                ${mine.length ? `<h4>Mes modèles</h4><div class="h-bd-templates" data-bd-mytpl>${mine.map(t => `<label class="h-bd-tpl"><input type="radio" name="tpl" value="my:${esc(t.id)}"><span class="h-bd-tplicon">${esc(t.icon || '⭐')}</span><strong>${esc(t.name)}</strong><small>${esc(t.hint || `${t.items.length} élément${t.items.length > 1 ? 's' : ''}`)}</small><button type="button" class="h-bd-tpldel" data-bd-tpldel="${esc(t.id)}" title="Supprimer ce modèle" aria-label="Supprimer ce modèle">×</button></label>`).join('')}</div>` : '<p class="muted"><small>Pour faire tes propres modèles : dans un tableau, ⬇ Exporter → ⭐ En faire un modèle.</small></p>'}`,
            onOpen: d => d.querySelector('[data-bd-mytpl]')?.addEventListener('click', e => { const x = e.target.closest('[data-bd-tpldel]'); if (!x) return; e.preventDefault(); const t = myTemplates().find(t0 => t0.id === x.dataset.bdTpldel); if (!t || !confirm(`Supprimer le modèle « ${t.name} » ?`)) return; try { localStorage.setItem(TPL_KEY, JSON.stringify(myTemplates().filter(t0 => t0.id !== t.id))); } catch (_) {} x.closest('.h-bd-tpl').remove(); }),
            onSubmit: async form => {
                const title = form.elements.title.value.trim() || 'Tableau sans titre', v = form.elements.tpl.value;
                let data;
                if (v.startsWith('my:')) {
                    const t = myTemplates().find(t0 => 'my:' + t0.id === v); if (!t) { toast('Modèle introuvable.', 'error'); return false; }
                    // de nouveaux numéros pour les éléments (les traits et les groupes suivent)
                    const map = new Map(t.items.map(i => [i.id, uid()])), grp = new Map();
                    const its = t.items.map(i => ({...clone(i), id: map.get(i.id), ...(i.from ? {from: map.get(i.from) || ''} : {}), ...(i.to ? {to: map.get(i.to) || ''} : {}), ...(i.group ? {group: grp.get(i.group) || (grp.set(i.group, uid()), grp.get(i.group))} : {})}));
                    data = {items: its, bg: t.bg || 'dots', bgColor: t.bgColor, bgPattern: t.bgPattern, layers: t.layers || []};
                } else {
                    const tpl = TEMPLATES.find(t => t[0] === v) || TEMPLATES[0];
                    data = {items: tpl[4]().map((it, i) => ({id: it.id || uid(), z: i, w: 120, h: 80, x: 0, y: 0, ...it})), bg: tpl[5] || 'dots'};
                }
                const r = await api('save_board', {}, {method: 'POST', body: {title, part: form.elements.part?.value?.trim() || '', owner_type: owner.owner_type || '', owner_id: owner.owner_id || 0, data}});
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
        const g2 = e.target.closest?.('[data-bd-goto-board]'); if (g2) { go(Number(g2.dataset.bdGotoBoard)); return; }
        const g = e.target.closest?.('.h-bd-personblock [data-bd-go]'); if (!g) return;
        go(Number(g.dataset.bdGo));
    });
    ext.boardsInternals = {shapePath, smooth, tableValues, drawSvg, ribbon}; // pour les essais
})();
