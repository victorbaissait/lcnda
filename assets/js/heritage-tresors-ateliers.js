/**
 * ✨ Trésors — les ateliers (lot 5, groupe Créer) :
 *  - 🧵 La broderie au point de croix : un « marquoir » à l'ancienne (le nom de la famille, un couple, une date, un arbre, une
 *    frise), la grille à symboles avec les couleurs de fils, le nombre de points et la taille sur toile Aïda.
 *  - 🔥 La gravure au laser : l'éventail des ancêtres en SVG aux vraies dimensions (en mm), noir = gravure, rouge = découpe.
 *  - 🖼️ La mosaïque de portraits : tous les visages de l'arbre en grille, ou une photo-mosaïque (un portrait refait avec les autres).
 *  - 👤 Le visage de la lignée : les visages d'une lignée (de père en père, de mère en mère) côte à côte, en fondu, et « le visage moyen ».
 *  - 📰 La gazette de l'année : une une de journal pour une année de la famille (naissances, mariages, décès, le prix du pain).
 *  - 🖥️ Le fond d'écran du jour : l'ancêtre du jour en image, aux dimensions d'un écran d'ordinateur, de tablette ou de téléphone.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const loadImg = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const slug = s => fold(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'famille';

    /* ── 🧵 La broderie au point de croix ── */
    // une police de 5 × 7 points : chaque lettre = 7 lignes de 5 points (bits)
    const FONT = {A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15],
        H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17],
        O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
        V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], 0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
        2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
        '-': [0, 0, 0, 31, 0, 0, 0], '&': [12, 18, 20, 8, 21, 18, 13], '.': [0, 0, 0, 0, 0, 12, 12], "'": [4, 4, 8, 0, 0, 0, 0], ',': [0, 0, 0, 0, 12, 4, 8], '♥': [0, 10, 31, 31, 14, 4, 0], ' ': [0, 0, 0, 0, 0, 0, 0]};
    const TREE = ['....111....', '..1111111..', '.111111111.', '11111111111', '.111111111.', '..1111111..', '....222....', '....222....', '....222....', '..2222222..'];
    // les fils (numéros DMC courants) : [nom, couleur, numéro, symbole]
    const THREADS = {rouge: ['Rouge', '#b8202e', '321', '×'], vert: ['Vert', '#2f7d3a', '701', '●'], brun: ['Brun', '#6e4524', '801', '▲'], bleu: ['Bleu', '#1f4e8c', '798', '■'], or: ['Or', '#c79a2c', '729', '◆'], rose: ['Rose', '#d46a8a', '3350', '♦']};
    // les motifs (11 points de large) : 1 = fil principal, 2 = fil secondaire
    const MOTIFS = {
        arbre: ['🌳 L’arbre', TREE, 'vert', 'brun'],
        maison: ['🏡 La maison', ['.....1.....', '....111....', '...11111...', '..1111111..', '.111111111.', '11111111111', '.222222222.', '.2..2.2..2.', '.2..2.2..2.', '.222222222.', '.222...222.', '.222...222.'], 'rouge', 'brun'],
        coeur: ['❤️ Le cœur', ['.111...111.', '11111.11111', '11111111111', '11111111111', '.111111111.', '..1111111..', '...11111...', '....111....', '.....1.....'], 'rouge', 'rose'],
        couronne: ['👑 Le cœur couronné', ['.2...2...2.', '.22.222.22.', '.222222222.', '...........', '..11...11..', '.1111.1111.', '.111111111.', '..1111111..', '...11111...', '....111....', '.....1.....'], 'rouge', 'or'],
        tulipes: ['🌷 Les tulipes', ['.1...1...1.', '.11.111.11.', '.111111111.', '..1111111..', '...11111...', '.....2.....', '..2..2..2..', '...2.2.2...', '....222....', '.....2.....'], 'rose', 'vert'],
        eglise: ['⛪ L’église', ['.....1.....', '....111....', '.....1.....', '....222....', '...22222...', '...2.2.2...', '...22222...', '..2222222..', '.222222222.', '.22.222.22.', '.22.2.2.22.', '.222...222.'], 'or', 'brun'],
        colombes: ['🕊️ Les colombes', ['11.......11', '.111...111.', '..1111111..', '...11111...', '....121....', '.....2.....', '....222....'], 'bleu', 'vert'],
        aucun: ['— Aucun motif', [], 'vert', 'brun']};
    const BORDERS = {points: '· Les points (à l’ancienne)', coeurs: '♥ La frise de cœurs', grecque: '⌇ La frise en zigzag', double: '▭ Le double trait', aucune: '— Sans bordure'};
    Object.assign(THREADS, {noir: ['Noir', '#1b1b1b', '310', '◼'], gris: ['Gris', '#7a7a7a', '414', '○'], violet: ['Violet', '#6a3d8f', '550', '✚'], orange: ['Orange', '#d9692a', '947', '★'], ciel: ['Bleu ciel', '#6fa8d6', '813', '◇'], blanc: ['Blanc', '#f7f7f2', 'B5200', '□']});
    const CLOTHS = {ecru: ['Écru', '#f4efe2'], blanc: ['Blanc', '#ffffff'], lin: ['Lin', '#d9cbb0'], noir: ['Noir', '#1c1c1c'], bleu: ['Bleu nuit', '#1f2a44']};
    const COUNTS = {11: 'Aïda 11', 14: 'Aïda 14', 16: 'Aïda 16', 18: 'Aïda 18', 28: 'Lin 28 fils (un point sur 2 fils)'};
    const textW = (s, k = 1) => [...s].length * 6 * k - k;
    function sampler({title, couple, date, place = '', color = 'rouge', coupleColor = 'bleu', motif = 'arbre', m1 = '', m2 = '', border = 'points', b1 = 'vert', b2 = 'or', big = false, hearts = true}) {
        const lines = [fold(title).toUpperCase(), fold(couple).toUpperCase(), fold(date).toUpperCase(), fold(place).toUpperCase()].map(l => l.replace(/[^A-Z0-9 &.,'\-♥]/g, '')).map((l, i) => ({l, k: big && i === 0 ? 2 : 1, c: i === 1 ? coupleColor : color})).filter(x => x.l);
        const M = MOTIFS[motif] || MOTIFS.arbre, art = M[1], pad = border === 'coeurs' || border === 'grecque' ? 6 : border === 'aucune' ? 3 : 4;
        const W = Math.max(41, ...lines.map(x => textW(x.l, x.k) + 2 * pad + 2)), H = pad + lines.reduce((n, x) => n + 10 * x.k, 0) + (art.length ? art.length + 4 : 0) + pad - 1, grid = [...Array(H)].map(() => Array(W).fill(null));
        const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c; };
        const edge = (f) => { for (let x = 0; x < W; x++) { f(x, 0, 'h', 0); f(x, H - 1, 'h', 1); } for (let y = 0; y < H; y++) { f(0, y, 'v', 0); f(W - 1, y, 'v', 1); } };
        if (border === 'points') { for (let x = 0; x < W; x++) { if (x % 4 !== 3) { put(x, 0, b1); put(x, H - 1, b1); } if (x % 4 === 1) { put(x, 1, b2); put(x, H - 2, b2); } } for (let y = 0; y < H; y++) if (y % 4 !== 3) { put(0, y, b1); put(W - 1, y, b1); } }
        if (border === 'double') edge((x, y, d) => { put(x, y, b1); if (d === 'h') put(x, y === 0 ? 2 : H - 3, b2); else put(x === 0 ? 2 : W - 3, y, b2); });
        if (border === 'grecque') { const z = [0, 1, 2, 1]; for (let x = 0; x < W; x++) { put(x, z[x % 4], b1); put(x, H - 1 - z[x % 4], b1); } for (let y = 0; y < H; y++) { put(z[y % 4], y, b2); put(W - 1 - z[y % 4], y, b2); } }
        if (border === 'coeurs') { const hz = [[1, 0, 1], [1, 1, 1], [0, 1, 0]], heart = (x0, y0, c) => hz.forEach((r, ry) => r.forEach((v, rx) => v && put(x0 + rx, y0 + ry, c)));
            for (let x = 1; x + 3 < W; x += 6) { heart(x, 1, b1); heart(x, H - 4, b1); } for (let y = 7; y + 3 < H - 4; y += 6) { heart(1, y, b2); heart(W - 4, y, b2); } }
        let y = pad; lines.forEach(({l, k, c}) => { let x = Math.floor((W - textW(l, k)) / 2); [...l].forEach(ch => { (FONT[ch] || FONT[' ']).forEach((row, ry) => { for (let b = 0; b < 5; b++) if (row & (16 >> b)) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) put(x + b * k + i, y + ry * k + j, c); }); x += 6 * k; }); y += 10 * k; });
        if (art.length) { const tx = Math.floor((W - 11) / 2); art.forEach((r, ry) => [...r].forEach((c, rx) => { if (c !== '.') put(tx + rx, y + ry, c === '1' ? (m1 || M[2]) : (m2 || M[3])); }));
            if (hearts && W > 30) [[pad, y + 4], [W - pad - 5, y + 4]].forEach(([hx, hy]) => FONT['♥'].forEach((row, ry) => { for (let b = 0; b < 5; b++) if (row & (16 >> b)) put(hx + b, hy + ry - 2, 'rose'); })); }
        return {grid, W, H};
    }
    function samplerSvg(sm, mode = 'grille', cloth = 'ecru') {
        const c = 12, used = {}; let cells = '';
        sm.grid.forEach((row, y) => row.forEach((t, x) => { if (!t) return; used[t] = (used[t] || 0) + 1; const th = THREADS[t], X = x * c, Y = y * c;
            cells += mode === 'apercu' ? `<path d="M${X + 2} ${Y + 2}L${X + c - 2} ${Y + c - 2}M${X + c - 2} ${Y + 2}L${X + 2} ${Y + c - 2}" stroke="${th[1]}" stroke-width="3" stroke-linecap="round"/>` : `<rect x="${X}" y="${Y}" width="${c}" height="${c}" fill="${th[1]}" opacity=".55"/><text x="${X + c / 2}" y="${Y + c - 3}" font-size="9" text-anchor="middle" fill="#111">${th[3]}</text>`; }));
        const lines = mode === 'apercu' ? '' : [...Array(sm.W + 1)].map((_, x) => `<line x1="${x * c}" y1="0" x2="${x * c}" y2="${sm.H * c}" stroke="${x % 10 ? '#ccc' : '#555'}" stroke-width="${x % 10 ? 0.5 : 1.2}"/>`).join('') + [...Array(sm.H + 1)].map((_, y) => `<line x1="0" y1="${y * c}" x2="${sm.W * c}" y2="${y * c}" stroke="${y % 10 ? '#ccc' : '#555'}" stroke-width="${y % 10 ? 0.5 : 1.2}"/>`).join('');
        const weave = mode === 'apercu' ? `<defs><pattern id="aida" width="${c}" height="${c}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.3" fill="#0002"/></pattern></defs><rect x="-1" y="-1" width="${sm.W * c + 2}" height="${sm.H * c + 2}" fill="url(#aida)"/>` : '';
        return {svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${sm.W * c + 2} ${sm.H * c + 2}" width="${sm.W * c + 2}" height="${sm.H * c + 2}"><rect x="-1" y="-1" width="${sm.W * c + 2}" height="${sm.H * c + 2}" fill="${mode === 'apercu' ? (CLOTHS[cloth] || CLOTHS.ecru)[1] : '#fff'}"/>${weave}${cells}${lines}</svg>`, used};
    }
    async function renderStitch(host, T) {
        const tr = await T.tree(), st = T.start(tr), f = tr.families.find(x => x.my && x.a && x.b && T.ancestors(tr, st?.id || 0, 30).some(a => a.id === x.a)) || tr.families.find(x => x.a && x.b);
        const a = f && tr.byId.get(f.a), b = f && tr.byId.get(f.b);
        const thr = (name, cur) => `<select name="${name}">${name === 'm1' || name === 'm2' ? '<option value="">celle du motif</option>' : ''}${Object.entries(THREADS).map(([k, t]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${T.esc(t[0])} (DMC ${t[2]})</option>`).join('')}</select>`;
        host.innerHTML = `<div class="h-tr-split"><form class="h-tr-panel" data-xs><label>Le titre<input name="title" maxlength="30" value="FAMILLE ${T.esc((st?.last || '').toUpperCase())}"></label><label>Le couple<input name="couple" maxlength="30" value="${T.esc([a?.first, b?.first].filter(Boolean).join(' & '))}"></label>
            <label>La date<input name="date" maxlength="30" value="${T.esc(f?.my ? String(f.my) : '')}"></label><label>Le lieu (facultatif)<input name="place" maxlength="30"></label><label>La couleur du titre${thr('color', 'rouge')}</label><label>La couleur du couple${thr('coupleColor', 'bleu')}</label>
            <label class="checkbox-line"><input type="checkbox" name="big"> Le titre en grandes lettres (double)</label>
            <label>Le motif<select name="motif">${Object.entries(MOTIFS).map(([k, [l]]) => `<option value="${k}">${T.esc(l)}</option>`).join('')}</select></label><label>Ses couleurs ${thr('m1', '')} ${thr('m2', '')}</label><label class="checkbox-line"><input type="checkbox" name="hearts" checked> Deux petits cœurs de chaque côté</label>
            <label>La bordure<select name="border">${Object.entries(BORDERS).map(([k, l]) => `<option value="${k}">${T.esc(l)}</option>`).join('')}</select></label><label>Ses couleurs ${thr('b1', 'vert')} ${thr('b2', 'or')}</label>
            <label>La toile<select name="count">${Object.entries(COUNTS).map(([k, l]) => `<option value="${k}"${k === '14' ? ' selected' : ''}>${T.esc(l)}</option>`).join('')}</select></label><label>Sa couleur (aperçu)<select name="cloth">${Object.entries(CLOTHS).map(([k, [l]]) => `<option value="${k}">${T.esc(l)}</option>`).join('')}</select></label>
            <label>Voir<select name="mode"><option value="apercu">l’aperçu brodé</option><option value="grille">la grille à symboles</option></select></label><div data-xs-info class="h-tr-muted"></div></form><div class="h-tr-view h-tr-xs-out" data-xs-out></div></div>`;
        const form = host.querySelector('[data-xs]'), out = host.querySelector('[data-xs-out]'), info = host.querySelector('[data-xs-info]'), e = n => form.elements[n];
        const cur = () => sampler({title: e('title').value, couple: e('couple').value, date: e('date').value, place: e('place').value, color: e('color').value, coupleColor: e('coupleColor').value, big: e('big').checked, motif: e('motif').value, m1: e('m1').value, m2: e('m2').value, hearts: e('hearts').checked, border: e('border').value, b1: e('b1').value, b2: e('b2').value});
        const legend = used => Object.entries(used).map(([k, n]) => `<span class="h-tr-pill">${THREADS[k][3]} ${THREADS[k][0]} DMC ${THREADS[k][2]} — ${n} points</span>`).join(' ');
        const draw = () => { const sm = cur(), r = samplerSvg(sm, e('mode').value, e('cloth').value); out.innerHTML = r.svg; const n = Number(e('count').value), per = n === 28 ? 14 : n, cm = v => (v / per * 2.54).toFixed(1).replace('.', ',');
            info.innerHTML = `${sm.W} × ${sm.H} points · sur ${T.esc(COUNTS[n])} : ${cm(sm.W)} × ${cm(sm.H)} cm (prévoir 5 cm de marge tout autour)<br>${legend(r.used)}`; };
        form.addEventListener('input', draw); form.addEventListener('change', draw);
        T.actions(host, {exports: [{icon: '✒️', label: 'La grille (dessin SVG)', name: () => `broderie-${slug(e('title').value)}.svg`, make: () => samplerSvg(cur(), 'grille').svg, media: false},
            {icon: '🖼', label: 'L’aperçu brodé (image PNG)', name: () => `broderie-${slug(e('title').value)}.png`, make: () => T.svgPng(samplerSvg(cur(), 'apercu', e('cloth').value).svg, 2000)}],
            layout: () => { const sm = cur(), r = samplerSvg(sm, 'apercu', e('cloth').value); return T.toLayout(`Broderie — ${e('title').value}`, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg), {w: 210, h: Math.max(120, Math.round(210 * sm.H / sm.W) + 20)}); },
            media: true, print: {attrs: 'data-xs-print', title: 'La grille à symboles et la liste des fils', run: () => { const r = samplerSvg(cur(), 'grille'); ext.tresorPrint('Grille de broderie', 'section{background:#fff;max-width:190mm;margin:8mm auto;padding:8mm;font-family:system-ui}section svg{width:100%;height:auto}.lg span{display:inline-block;margin:2mm;padding:1mm 3mm;border:1px solid #ccc;border-radius:3mm}', `<section><h1>${T.esc(form.elements.title.value)}</h1>${r.svg}<p class="lg">${legend(r.used)}</p><p>Un carré = un point de croix ; les traits épais tous les 10 points.</p></section>`); }}});
        draw();
    }
    F.push({key: 'broderie', group: 'creer', icon: '🧵', title: 'La broderie au point de croix', desc: 'Un marquoir à l’ancienne : le nom de la famille, un couple, une date, un arbre ; la grille et les fils.', render: renderStitch});
    ext.tresorStitch = {sampler, samplerSvg};

    /* ── 🔥 La gravure au laser (éventail des ancêtres) ── */
    function fanSvg(T, tr, rootId, gens = 5, D = 300) {
        const R = D / 2, cx = R, cy = R, r0 = R * 0.17, ring = (R - r0 - 4) / gens, root = tr.byId.get(rootId), pt = (r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
        const slots = new Map([[1, rootId]]); for (let n = 1; n < 2 ** (gens + 1); n++) { const p = tr.byId.get(slots.get(n)); if (!p) continue; if (p.father) slots.set(2 * n, p.father); if (p.mother) slots.set(2 * n + 1, p.mother); }
        let eng = '', txt = '', defs = '';
        for (let g = 1; g <= gens; g++) { const r1 = r0 + (g - 1) * ring, r2 = r1 + ring, n = 2 ** g;
            eng += `<path d="M${pt(r2, 180).join(' ')}A${r2} ${r2} 0 0 1 ${pt(r2, 360).join(' ')}"/>`;
            for (let k = 0; k <= n; k++) { const a = 180 + 180 * k / n; eng += `<path d="M${pt(r1, a).join(' ')}L${pt(r2, a).join(' ')}"/>`; }
            for (let k = 0; k < n; k++) { const p = tr.byId.get(slots.get(n + k)); if (!p) continue; const a1 = 180 + 180 * k / n, a2 = 180 + 180 * (k + 1) / n, am = (a1 + a2) / 2, rm = (r1 + r2) / 2, span = rm * (a2 - a1) * Math.PI / 180;
                const lines = [p.first || '', (p.last || '').toUpperCase(), T.life(p)].filter(Boolean);
                if (g <= 3) { const id = `arc${g}-${k}`, fs = Math.min(ring / 5, span / Math.max(...lines.map(l => l.length)) * 1.7, 7);
                    lines.forEach((l, j) => { const rr = rm + (1 - j) * fs * 1.15; defs += `<path id="${id}-${j}" d="M${pt(rr, a1 + 1).join(' ')}A${rr} ${rr} 0 0 1 ${pt(rr, a2 - 1).join(' ')}"/>`; txt += `<text font-size="${fs.toFixed(2)}"><textPath href="#${id}-${j}" startOffset="50%" text-anchor="middle">${T.esc(l)}</textPath></text>`; }); }
                else { const fs = Math.min(span * 0.4, ring / Math.max(...lines.map(l => l.length)) * 1.6, 5), rot = am; lines.forEach((l, j) => { const [x, y] = pt(rm, am + (j - (lines.length - 1) / 2) * fs * 1.1 / rm * 180 / Math.PI); txt += `<text font-size="${fs.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(rot > 270 ? rot : rot - 180).toFixed(1)})">${T.esc(l)}</text>`; }); } }
        }
        eng += `<path d="M${pt(r0, 180).join(' ')}A${r0} ${r0} 0 0 1 ${pt(r0, 360).join(' ')}"/>`;
        txt += `<text x="${cx}" y="${cy - r0 * 0.45}" font-size="${(r0 / 5).toFixed(2)}" text-anchor="middle">${T.esc(root?.first || '')}</text><text x="${cx}" y="${cy - r0 * 0.15}" font-size="${(r0 / 6).toFixed(2)}" text-anchor="middle">${T.esc((root?.last || '').toUpperCase())}</text>`;
        const cut = `<path d="M${pt(R - 1, 180).join(' ')}A${R - 1} ${R - 1} 0 0 1 ${pt(R - 1, 360).join(' ')}Z"/>`; // le demi-disque : l'arc puis la base
        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${D}mm" height="${R + 6}mm" viewBox="0 0 ${D} ${R + 6}"><defs>${defs}</defs><g fill="none" stroke="#000" stroke-width="0.25">${eng}</g><g fill="#000" font-family="Georgia, serif">${txt}</g><g fill="none" stroke="#ff0000" stroke-width="0.05">${cut}</g></svg>`;
    }
    async function renderLaser(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<div class="h-tr-split"><div class="h-tr-panel h-tr-noprint"><div><span class="pk-lab">Les ancêtres de</span>${T.personField('root', st?.id)}</div><label>Générations<select name="g"><option>3</option><option>4</option><option selected>5</option><option>6</option></select></label>
            <label>Largeur<input type="number" name="d" min="100" max="1000" value="300" data-unit="mm" style="width:6em"></label>
            <p class="h-tr-muted">Le fichier est aux vraies dimensions, en millimètres : <b>noir = gravure</b> (traits et noms), <b>rouge = découpe</b> (le contour, trait fin). Convient à LightBurn, Glowforge, xTool, Inkscape. Vérifie toujours la taille à l’import.</p></div><div class="h-tr-view h-tr-lz-out" data-lz-out></div></div>`;
        const svg = () => fanSvg(T, tr, Number(host.querySelector('[name=root]').value) || st.id, Number(host.querySelector('[name=g]').value), Math.max(100, Math.min(1000, Number(host.querySelector('[name=d]').value) || 300)));
        const draw = () => { host.querySelector('[data-lz-out]').innerHTML = svg(); }; host.addEventListener('change', draw); host.addEventListener('input', e => { if (e.target.name === 'd') draw(); });
        T.actions(host, {exports: [{icon: '🔥', label: 'Dessin SVG pour la graveuse', help: 'Aux vraies dimensions : noir = gravure, rouge = découpe', name: () => `eventail-${slug(T.name(tr.byId.get(Number(host.querySelector('[name=root]').value))))}.svg`, make: svg}], media: true});
        draw();
    }
    F.push({key: 'laser', group: 'creer', icon: '🔥', title: 'La gravure au laser', desc: 'L’éventail des ancêtres en fichier SVG aux vraies dimensions, prêt pour une graveuse laser (gravure et découpe).', render: renderLaser});
    ext.tresorLaser = {fanSvg};

    /* ── les visages : d'abord un visage encadré sur une photo, sinon le portrait de la fiche ── */
    let facesP = null;
    async function faceOf(T, tr, pid, size = 200) {
        facesP ||= T.api('tresor_faces').then(r => r.faces || []).catch(() => []);
        const faces = (await facesP).filter(f => f.person_id === pid), p = tr.byId.get(pid), c = document.createElement('canvas'); c.width = size; c.height = Math.round(size * 1.25); const x = c.getContext('2d');
        let img = null, box = null; for (const f of faces) { img = await loadImg(`media/${encodeURIComponent(f.filename)}`); if (img) { box = f; break; } }
        if (!img && p?.portrait) img = await loadImg(T.portraitUrl(p)); if (!img) return null;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (box) { sx = box.x / 100 * sw; sy = box.y / 100 * sh; const w = box.w / 100 * sw, h = box.h / 100 * sh; sw = w; sh = h; }
        const want = c.width / c.height; if (sw / sh > want) { const nw = sh * want; sx += (sw - nw) / 2; sw = nw; } else { const nh = sw / want; sy += (sh - nh) / 2; sh = nh; }
        x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
    }
    ext.tresorFaces = {faceOf, reset: () => { facesP = null; }};

    /* ── 🖼️ La mosaïque de portraits ── */
    const avg = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n]; };
    async function renderMosaic(host, T) {
        const tr = await T.tree(); host.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('Je rassemble les visages…') : '<p class="h-tr-muted">Je rassemble les visages…</p>';
        const tiles = []; for (const p of tr.people) { if (tiles.length >= 400) break; const c = await faceOf(T, tr, p.id, 120); if (c) tiles.push({p, c, col: avg(c)}); } // 400 visages au plus (un très grand arbre)
        if (!tiles.length) { host.innerHTML = T.empty('Aucun portrait dans l’arbre', {hint: 'Ajoute une photo de portrait sur les fiches, ou encadre les visages dans la visionneuse.'}); return; }
        host.innerHTML = `<div class="h-tr-split"><div class="h-tr-panel h-tr-noprint"><label>La mosaïque<select name="mode"><option value="grid">tous les visages, en grille</option><option value="photo">un portrait refait avec tous les autres</option></select></label>
            <label data-mo-t>Le portrait à refaire<select name="target">${tiles.map(t => `<option value="${t.p.id}">${T.esc(T.name(t.p))}</option>`).join('')}</select></label><label data-mo-t>Finesse<select name="n"><option value="24">24 × 24</option><option value="40" selected>40 × 40</option><option value="60">60 × 60</option></select></label>
            <span class="h-tr-muted">${tiles.length} visage${tiles.length > 1 ? 's' : ''}</span></div><div class="h-tr-view"><canvas class="h-tr-canvas" data-mo-c width="1600" height="1600" style="max-width:min(640px, 100%)"></canvas></div></div>`;
        const cv = host.querySelector('[data-mo-c]'), x = cv.getContext('2d'), el = n => host.querySelector(`[name=${n}]`);
        const draw = async () => { const mode = el('mode').value; host.querySelectorAll('[data-mo-t]').forEach(l => { l.hidden = mode !== 'photo'; });
            if (mode === 'grid') { const n = Math.ceil(Math.sqrt(tiles.length)), w = 1600 / n, h = w * 1.25; cv.width = 1600; cv.height = Math.ceil(tiles.length / n) * h + 0; x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, cv.width, cv.height);
                tiles.forEach((t, k) => { const tx = (k % n) * w, ty = Math.floor(k / n) * h; x.drawImage(t.c, tx + 3, ty + 3, w - 6, h - 6); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(tx + 3, ty + h - 3 - h * 0.16, w - 6, h * 0.16); x.fillStyle = '#fff'; x.font = `${Math.max(10, w / 11)}px system-ui`; x.textAlign = 'center'; x.fillText(T.name(t.p), tx + w / 2, ty + h - 3 - h * 0.05); }); x.textAlign = 'left'; return; }
            const target = tiles.find(t => t.p.id === Number(el('target').value)) || tiles[0], N = Number(el('n').value), small = document.createElement('canvas'); small.width = N; small.height = Math.round(N * 1.25); small.getContext('2d').drawImage(target.c, 0, 0, small.width, small.height);
            const d = small.getContext('2d').getImageData(0, 0, small.width, small.height).data, cw = 1600 / N, chh = cw; cv.width = 1600; cv.height = Math.round(small.height * chh); const R = T.rng(N * 31 + target.p.id);
            for (let yy = 0; yy < small.height; yy++) for (let xx = 0; xx < N; xx++) { const i = (yy * N + xx) * 4, c = [d[i], d[i + 1], d[i + 2]], best = tiles.map(t => [t, (t.col[0] - c[0]) ** 2 + (t.col[1] - c[1]) ** 2 + (t.col[2] - c[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 3), t = best[Math.floor(R() * best.length)][0];
                x.drawImage(t.c, xx * cw, yy * chh, cw, chh); x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},.45)`; x.fillRect(xx * cw, yy * chh, cw, chh); } };
        host.addEventListener('change', draw);
        T.actions(host, {exports: [{icon: '🖼', label: 'Image PNG', name: 'mosaique-de-portraits.png', make: () => T.canvasPng(cv)}], media: true});
        await draw();
    }
    F.push({key: 'mosaique', group: 'creer', icon: '🖼️', title: 'La mosaïque de portraits', desc: 'Tous les visages de l’arbre en une image, ou un portrait refait avec les visages de toute la famille.', render: renderMosaic});

    /* ── 👤 Le visage de la lignée ── */
    function lineage(tr, pid, side) { const out = []; let p = tr.byId.get(pid); while (p && out.length < 15) { out.push(p); p = tr.byId.get(side === 'mother' ? p.mother : p.father); } return out; }
    async function renderFace(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<div class="h-tr-split"><div class="h-tr-panel h-tr-noprint"><div><span class="pk-lab">À partir de</span>${T.personField('root', st?.id)}</div><label>La lignée<select name="side"><option value="father">de père en père</option><option value="mother">de mère en mère</option></select></label>
            <div class="h-tr-row"><button type="button" class="button secondary" data-fc-play>▶ Le fondu</button></div></div><div class="h-tr-view" data-fc-out></div></div>`;
        const out = host.querySelector('[data-fc-out]'); let faces = [], timer = 0;
        const draw = async () => { clearInterval(timer); const line = lineage(tr, Number(host.querySelector('[name=root]').value) || st.id, host.querySelector('[name=side]').value); faces = [];
            for (const p of line) { const c = await faceOf(T, tr, p.id, 240); if (c) faces.push({p, c}); }
            if (!faces.length) { out.innerHTML = T.empty('Aucun visage connu dans cette lignée', {icon: '👤', hint: `${line.map(p => p.first || T.name(p)).join(' → ')}. Ajoute des portraits ou encadre les visages sur les photos.`}); return; }
            const avgC = document.createElement('canvas'); avgC.width = 240; avgC.height = 300; const ax = avgC.getContext('2d'); faces.forEach((f, k) => { ax.globalAlpha = 1 / (k + 1); ax.drawImage(f.c, 0, 0); }); ax.globalAlpha = 1;
            out.innerHTML = `<div class="h-tr-faces">${faces.map(f => `<figure><span data-fc-slot="${f.p.id}"></span><figcaption><b>${T.esc(T.name(f.p))}</b><small>${T.esc(T.life(f.p))}</small></figcaption></figure>`).join('<span class="h-tr-arrow">←</span>')}</div>
                <div class="h-tr-row" style="align-items:start"><figure class="h-tr-avg"><span data-fc-avg></span><figcaption>Le visage moyen de ${faces.length} génération${faces.length > 1 ? 's' : ''}</figcaption></figure><figure class="h-tr-avg"><canvas data-fc-fade width="240" height="300"></canvas><figcaption data-fc-name>Le fondu</figcaption></figure></div>`;
            faces.forEach(f => out.querySelector(`[data-fc-slot="${f.p.id}"]`).appendChild(f.c)); out.querySelector('[data-fc-avg]').appendChild(avgC); out.querySelector('[data-fc-fade]').getContext('2d').drawImage(faces[0].c, 0, 0); };
        host.querySelector('[data-fc-play]').addEventListener('click', () => { clearInterval(timer); const cv = out.querySelector('[data-fc-fade]'); if (!cv || !faces.length) return; const x = cv.getContext('2d'), nm = out.querySelector('[data-fc-name]'); let k = 0, t = 0;
            timer = setInterval(() => { if (!host.isConnected) return clearInterval(timer); const a = faces[k % faces.length], b = faces[(k + 1) % faces.length]; x.globalAlpha = 1; x.drawImage(a.c, 0, 0); x.globalAlpha = t; x.drawImage(b.c, 0, 0); x.globalAlpha = 1; nm.textContent = t < 0.5 ? T.name(a.p) : T.name(b.p); t += 0.04; if (t >= 1) { t = 0; k++; } }, 50); });
        const facesPng = () => { if (!faces.length) return null; const c = document.createElement('canvas'), w = 240; c.width = faces.length * (w + 20) + 20; c.height = 380; const x = c.getContext('2d'); x.fillStyle = '#f6f0e1'; x.fillRect(0, 0, c.width, c.height);
            faces.forEach((f, k) => { x.drawImage(f.c, 20 + k * (w + 20), 20); x.fillStyle = '#2b2116'; x.font = '16px Georgia'; x.textAlign = 'center'; x.fillText(T.name(f.p), 20 + k * (w + 20) + w / 2, 345); x.font = '13px Georgia'; x.fillText(T.life(f.p), 20 + k * (w + 20) + w / 2, 365); }); return T.canvasPng(c); };
        T.actions(host, {exports: [{icon: '🖼', label: 'Les visages (image PNG)', name: 'visage-de-la-lignee.png', make: facesPng}], media: true});
        host.addEventListener('change', draw); await draw();
    }
    F.push({key: 'visage', group: 'creer', icon: '👤', title: 'Le visage de la lignée', desc: 'De père en père ou de mère en mère : les visages côte à côte, en fondu, et le visage moyen des générations.', render: renderFace});
    ext.tresorFace = {lineage};

    /* ── 📰 La gazette de l'année ── */
    function gazette(T, tr, Y) {
        const born = tr.people.filter(p => p.by === Y), dead = tr.people.filter(p => p.dy === Y), wed = tr.families.filter(f => f.my === Y), alive = tr.people.filter(p => p.by && p.by <= Y && (!p.dy || p.dy >= Y) && (p.dy || p.living || Y - p.by < 100));
        const other = tr.events.filter(e => e.y === Y && e.p && !['BIRT', 'DEAT', 'CHR', 'BAPM'].includes(e.tag)).map(e => ({e, p: tr.byId.get(e.p)})).filter(x => x.p);
        const round = alive.filter(p => p.by && (Y - p.by) >= 20 && (Y - p.by) % 10 === 0), gold = tr.families.filter(f => f.my && [25, 50, 60].includes(Y - f.my) && [f.a, f.b].every(x => { const q = tr.byId.get(x); return q && (!q.dy || q.dy >= Y); }));
        const bread = ext.tresorMoney ? 1 / ext.tresorMoney.worth(1, 'livre', Y).bread : null, unit = Y < 1795 ? 'livre' : Y < 1960 ? 'franc' : Y < 2002 ? 'franc' : 'euro';
        const headline = wed[0] ? `${[wed[0].a, wed[0].b].map(x => tr.byId.get(x)?.first).filter(Boolean).join(' et ')} se sont dit oui !` : born[0] ? `Bienvenue à ${born[0].first} !` : dead[0] ? `Adieu à ${T.name(dead[0])}` : other[0] ? `${other[0].p.first} : ${other[0].e.label.toLowerCase()}` : `Une année tranquille`;
        return {Y, born, dead, wed, alive, other, round, gold, bread, unit, headline};
    }
    const bestYear = tr => { const c = new Map(); tr.events.forEach(e => { if (e.y) c.set(e.y, (c.get(e.y) || 0) + (['BIRT', 'MARR', 'DEAT'].includes(e.tag) ? 2 : 1)); }); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] || new Date().getFullYear(); };
    /** les styles de la gazette : [nom, papier, encre, couleur, police du titre, police du texte] */
    const GZ_STYLES = {ancien: ['📜 Ancien (1900)', '#f6f1e3', '#1d1a14', '#1d1a14', '"Old English Text MT","UnifrakturMaguntia",Georgia,serif', 'Georgia,"Times New Roman",serif'],
        illustre: ['🎨 Supplément illustré (en couleurs)', '#fbf3df', '#1b1b2a', '#b3261e', 'Georgia,serif', 'Georgia,serif'], quotidien: ['🗞️ Le quotidien (papier journal)', '#e9e6dd', '#161616', '#161616', '"Times New Roman",Times,serif', '"Times New Roman",Times,serif'],
        annees30: ['🎩 Années 30', '#f3ead2', '#1a1a1a', '#7a1f1f', '"Didot","Bodoni MT",Georgia,serif', 'Georgia,serif'], moderne: ['◻️ Moderne', '#ffffff', '#1d2330', '#2a6fdb', '"Helvetica Neue",Arial,sans-serif', '"Helvetica Neue",Arial,sans-serif'],
        magazine: ['💖 Magazine', '#fff7fa', '#2b1a24', '#d03a7a', '"Futura","Century Gothic","Trebuchet MS",sans-serif', 'Georgia,serif'], tabloid: ['📣 À sensation (gros titres)', '#ffffff', '#111111', '#e10600', 'Impact,"Arial Black",sans-serif', 'Arial,sans-serif'],
        enfants: ['🧸 Le journal des enfants', '#fffbe9', '#24324a', '#2e8b57', '"Comic Sans MS","Chalkboard SE",cursive', '"Comic Sans MS","Chalkboard SE",cursive']};
    const GZ_PAPERS = {style: 'Celui du style', blanc: '#ffffff', creme: '#f6f1e3', jauni: '#ead9b0', gris: '#e4e2dc'};
    function gazetteHtml(T, tr, g, o = {}) {
        const fam = T.start(tr)?.last || '', plc = id => T.place(tr, id), price = g.Y < 1870 ? '1 sou' : g.Y < 1914 ? '5 centimes' : g.Y < 1960 ? '1 franc' : g.Y < 2002 ? '5 francs' : '1,50 €';
        const lead = g.wed[0] ? (() => { const f = g.wed[0], a = tr.byId.get(f.a), b = tr.byId.get(f.b); return `${f.mplace ? `${plc(f.mplace).toUpperCase()}. — ` : ''}C’est ${f.md ? `le ${T.dateFr(f.md)}` : `en ${g.Y}`} que ${T.name(a)}${a?.occ ? `, ${a.occ},` : ''} a épousé ${T.name(b)}${b?.occ ? `, ${b.occ}` : ''}. ${[a, b].filter(x => x?.father || x?.mother).map(x => `${x.first} est ${x.gender === 'female' ? 'la fille' : 'le fils'} de ${[tr.byId.get(x.father), tr.byId.get(x.mother)].filter(Boolean).map(T.name).join(' et de ')}`).join('. ')}${a || b ? '. Tous nos vœux de bonheur aux jeunes époux.' : ''}`; })()
            : g.born[0] ? `${g.born[0].bplace ? `${plc(g.born[0].bplace).toUpperCase()}. — ` : ''}${T.story(tr, g.born[0])[0] || ''} ${[tr.byId.get(g.born[0].father), tr.byId.get(g.born[0].mother)].filter(Boolean).length ? `Les heureux parents, ${[tr.byId.get(g.born[0].father), tr.byId.get(g.born[0].mother)].filter(Boolean).map(T.name).join(' et ')}, reçoivent les félicitations de toute la famille.` : ''}`
            : g.dead[0] ? T.story(tr, g.dead[0]).join(' ') : 'Rien de notable à signaler cette année dans la famille, ce qui est aussi une bonne nouvelle.';
        const st = GZ_STYLES[o.style] || GZ_STYLES.ancien, hide = o.hide || [], paper = o.paper && o.paper !== 'style' ? GZ_PAPERS[o.paper] : st[1], accent = o.accent || st[3];
        const vars = `--gz-paper:${paper};--gz-ink:${st[2]};--gz-accent:${accent};--gz-title:${st[4]};--gz-body:${st[5]}`;
        return `<article class="gz gz-${o.style && GZ_STYLES[o.style] ? o.style : 'ancien'} gz-c${[2, 3].includes(Number(o.cols)) ? o.cols : 3}${hide.map(h => ` gz-no-${h}`).join('')}" style='${vars}'><header><div class="gz-top"><span>${T.esc(o.edition || 'Édition unique')}</span><span>Prix : ${price}</span></div><h1>${T.esc(o.title || `La Gazette des ${fam || 'nôtres'}`)}</h1><div class="gz-top"><span>Année ${g.Y}</span><span>${g.alive.length} membre${g.alive.length > 1 ? 's' : ''} de la famille en vie</span></div></header>
            <h2>${T.esc(g.headline)}</h2><p class="gz-lead">${T.esc(lead)}</p><div class="gz-cols">
            <section class="gz-s-carnet"><h3>Carnet</h3>${g.born.length ? `<h4>Naissances</h4>${g.born.map(p => `<p>${T.esc(T.name(p))}${p.bd ? `, le ${T.esc(T.dateFr(p.bd).replace(/ \d+$/, ''))}` : ''}${p.bplace ? ` à ${T.esc(plc(p.bplace))}` : ''}.</p>`).join('')}` : ''}
                ${g.wed.length ? `<h4>Mariages</h4>${g.wed.map(f => `<p>${T.esc([f.a, f.b].map(x => T.name(tr.byId.get(x))).join(' et '))}${f.mplace ? ` à ${T.esc(plc(f.mplace))}` : ''}.</p>`).join('')}` : ''}
                ${g.dead.length ? `<h4>Décès</h4>${g.dead.map(p => `<p>${T.esc(T.name(p))}${p.by ? `, ${p.dy - p.by} ans` : ''}${p.dplace ? `, à ${T.esc(plc(p.dplace))}` : ''}.</p>`).join('')}` : ''}${!g.born.length && !g.wed.length && !g.dead.length ? '<p>Rien cette année.</p>' : ''}</section>
            <section class="gz-s-nouvelles"><h3>Nouvelles des nôtres</h3>${g.other.length ? g.other.slice(0, 8).map(x => `<p><b>${T.esc(T.name(x.p))}</b> : ${T.esc(x.e.label.toLowerCase())}${x.e.what ? ` (${T.esc(x.e.what)})` : ''}${x.e.place ? `, ${T.esc(plc(x.e.place))}` : ''}.</p>`).join('') : '<p>Pas d’autres nouvelles.</p>'}
                ${g.round.length || g.gold.length ? `<h4>Anniversaires</h4>${g.round.slice(0, 8).map(p => `<p>${T.esc(T.name(p))} fête ses ${g.Y - p.by} ans.</p>`).join('')}${g.gold.map(f => `<p>${T.esc([f.a, f.b].map(x => tr.byId.get(x)?.first).join(' et '))} : ${g.Y - f.my} ans de mariage !</p>`).join('')}` : ''}</section>
            <section class="gz-s-pratique"><h3>Le coin pratique</h3>${g.bread ? `<p>Le kilo de pain : environ <b>${g.bread < 1 ? (g.bread * (g.unit === 'livre' ? 20 : 100)).toFixed(0) + (g.unit === 'livre' ? ' sous' : ' centimes') : g.bread.toFixed(2).replace('.', ',') + ' ' + g.unit + (g.bread >= 2 && g.unit !== 'euro' ? 's' : '')}</b>.</p>` : ''}
                <h4>Qui fait quoi</h4>${g.alive.filter(p => p.occ && p.by && g.Y - p.by >= 16).slice(0, 8).map(p => `<p>${T.esc(p.first)} ${T.esc(p.last || '')}, ${T.esc(p.occ)}.</p>`).join('') || '<p>—</p>'}</section></div><footer>Composée à partir de l’arbre de famille · ${new Date().getFullYear()}</footer></article>`;
    }
    const GZ_CSS = `.gz{max-width:190mm;margin:8mm auto;padding:10mm 12mm;background:#f6f1e3;color:#1d1a14;font-family:Georgia,"Times New Roman",serif;box-shadow:0 2px 12px #0004}.gz header{border-bottom:3px double #1d1a14;text-align:center}.gz h1{font-family:"Old English Text MT","UnifrakturMaguntia",Georgia,serif;font-size:34pt;margin:2mm 0}.gz-top{display:flex;justify-content:space-between;font-size:9pt;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #1d1a14;border-bottom:1px solid #1d1a14;padding:1mm 0;margin:1mm 0}.gz h2{font-size:22pt;text-align:center;margin:5mm 0 2mm}.gz-lead{font-size:12pt;text-align:justify;column-count:2;column-gap:7mm}.gz-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;border-top:1px solid #1d1a14;padding-top:3mm}.gz-cols section{border-right:1px solid #bbb;padding-right:4mm}.gz-cols section:last-child{border:0}.gz h3{text-transform:uppercase;font-size:11pt;letter-spacing:.1em;border-bottom:1px solid #1d1a14}.gz h4{font-size:10pt;margin:3mm 0 1mm;font-style:italic}.gz p{margin:1mm 0;font-size:10pt;line-height:1.35;text-align:justify}.gz footer{margin-top:5mm;text-align:center;font-size:8pt;border-top:1px solid #1d1a14;padding-top:1mm}@media print{.gz{box-shadow:none;margin:0}}
        .gz{background:var(--gz-paper,#f6f1e3);color:var(--gz-ink,#1d1a14);font-family:var(--gz-body,Georgia,serif)}.gz h1{font-family:var(--gz-title);color:var(--gz-accent)}.gz h2,.gz h3{color:var(--gz-accent)}.gz header,.gz-top,.gz-cols,.gz footer{border-color:var(--gz-ink)!important}
        .gz-c2 .gz-cols{grid-template-columns:repeat(2,1fr)}.gz-no-carnet .gz-s-carnet,.gz-no-nouvelles .gz-s-nouvelles,.gz-no-pratique .gz-s-pratique,.gz-no-chapo .gz-lead{display:none}.gz-cols section:last-of-type{border:0}
        .gz-illustre header{background:var(--gz-accent);color:#fff;padding:2mm 3mm;border:0}.gz-illustre header h1{color:#fff}.gz-illustre .gz-top{border-color:#fff8!important}.gz-illustre h2{background:#1d4e89;color:#fff;padding:2mm;font-style:italic}
        .gz-quotidien h1{font-weight:900;letter-spacing:-.02em;font-size:40pt}.gz-quotidien .gz-cols section{border-right:1px solid #999}
        .gz-annees30 header{border-bottom:4px solid var(--gz-accent)}.gz-annees30 h1{font-weight:400;letter-spacing:.12em;text-transform:uppercase;font-size:28pt}.gz-annees30 h2{font-family:var(--gz-title);font-weight:400;font-style:italic}
        .gz-moderne{box-shadow:0 1px 6px #0002}.gz-moderne header{border-bottom:2px solid var(--gz-accent);text-align:left}.gz-moderne h1{font-weight:800;letter-spacing:-.03em}.gz-moderne h2{text-align:left;font-weight:800}.gz-moderne h3{text-transform:none;letter-spacing:0;border-left:4px solid var(--gz-accent);padding-left:2mm}.gz-moderne .gz-lead{column-count:1}
        .gz-magazine h1{font-weight:800;text-transform:uppercase;letter-spacing:.06em}.gz-magazine h2{font-style:italic;font-size:26pt}.gz-magazine .gz-cols section{background:#fff;border:0;border-radius:3mm;padding:3mm;box-shadow:0 1px 4px #0001}
        .gz-tabloid h1{font-size:48pt;text-transform:uppercase;background:var(--gz-accent);color:#fff;padding:1mm 3mm}.gz-tabloid h2{font-family:var(--gz-title);font-size:34pt;text-transform:uppercase;line-height:1}.gz-tabloid h3{background:#111;color:#fff;padding:.5mm 2mm}
        .gz-enfants{border:3mm dashed var(--gz-accent);border-radius:6mm}.gz-enfants h1{font-size:30pt}.gz-enfants h2{font-size:20pt}.gz-enfants .gz-cols section{border:0}`;
    async function renderGazette(host, T) {
        const tr = await T.tree(), years = [...new Set(tr.events.map(e => e.y).filter(Boolean))].sort((a, b) => a - b), Y0 = Number(ext.tresorGazette.pending) || bestYear(tr); ext.tresorGazette.pending = null; // pending : l'année demandée par un widget ou la liste
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><label>L’année<input type="number" name="y" value="${Y0}" min="${years[0] || 1700}" max="${new Date().getFullYear()}" style="width:6em"></label><button type="button" class="button secondary" data-gz-prev>◀</button><button type="button" class="button secondary" data-gz-next>▶</button><span class="h-tr-muted">Les années les plus riches : ${(() => { const c = new Map(); tr.events.forEach(e => e.y && c.set(e.y, (c.get(e.y) || 0) + 1)); return [...c].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([y]) => y).sort().join(', '); })()}</span></div>
            <details class="h-tr-panel h-tr-noprint" data-gz-opts open><summary><b>🎨 Le style du journal</b></summary><div class="h-tr-row">
                <label>Le style<select name="style">${Object.entries(GZ_STYLES).map(([k, v]) => `<option value="${k}">${T.esc(v[0])}</option>`).join('')}</select></label>
                <label>Le nom du journal<input name="title" placeholder="La Gazette des ${T.esc(T.start(tr)?.last || 'nôtres')}" maxlength="60"></label><label>Le bandeau<input name="edition" placeholder="Édition unique" maxlength="40"></label>
                <label>Le papier<select name="paper">${Object.keys(GZ_PAPERS).map(k => `<option value="${k}">${{style: 'Celui du style', blanc: 'Blanc', creme: 'Crème', jauni: 'Jauni', gris: 'Papier journal'}[k]}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" name="ownAccent"> Ma couleur <input type="color" name="accent" value="#7a1f1f"></label>
                <label>Les colonnes<select name="cols"><option value="3">3</option><option value="2">2</option></select></label></div>
                <div class="h-tr-row">${[['chapo', 'L’article de une'], ['carnet', 'Le carnet'], ['nouvelles', 'Les nouvelles'], ['pratique', 'Le coin pratique']].map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="show-${k}" checked> ${l}</label>`).join('')}</div></details>
            <style>${GZ_CSS}</style><div data-gz-out></div>`;
        const yEl = host.querySelector('[name=y]'), out = host.querySelector('[data-gz-out]'), op = host.querySelector('[data-gz-opts]'), KEY = 'lcnda-gazette-style';
        try { const sv = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.entries(sv).forEach(([k, v]) => { const el = op.querySelector(`[name="${k}"]`); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }); } catch (_) {}
        const opts = () => { const e = n => op.querySelector(`[name="${n}"]`); return {style: e('style').value, title: e('title').value.trim(), edition: e('edition').value.trim(), paper: e('paper').value, accent: e('ownAccent').checked ? e('accent').value : '', cols: e('cols').value, hide: ['chapo', 'carnet', 'nouvelles', 'pratique'].filter(k => !e('show-' + k).checked)}; };
        const keep = () => { const v = {}; op.querySelectorAll('[name]').forEach(el => { v[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
        const draw = () => { out.innerHTML = gazetteHtml(T, tr, gazette(T, tr, Number(yEl.value) || Y0), opts()); };
        op.addEventListener('input', () => { keep(); draw(); }); op.addEventListener('change', () => { keep(); draw(); });
        const step = d => { const y = Number(yEl.value), l = d > 0 ? years.find(v => v > y) : [...years].reverse().find(v => v < y); if (l) { yEl.value = l; draw(); } };
        yEl.addEventListener('input', draw); host.querySelector('[data-gz-prev]').addEventListener('click', () => step(-1)); host.querySelector('[data-gz-next]').addEventListener('click', () => step(1));
        // 📐 la une en image (HTML dans un SVG, à 190 mm de large) dans l'atelier de mise en page
        const toLayout = () => { const el = out.querySelector('.gz'); if (!el) return; const pxW = 760, h = Math.ceil(el.getBoundingClientRect().height * pxW / el.getBoundingClientRect().width) + 40;
            const html = gazetteHtml(T, tr, gazette(T, tr, Number(yEl.value)), opts()).replace(/<br>/g, '<br/>');
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${h}" viewBox="0 0 ${pxW} ${h}"><foreignObject x="0" y="0" width="${pxW}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${GZ_CSS}.gz{margin:0 auto;box-shadow:none}</style>${html}</div></foreignObject></svg>`;
            T.toLayout(`La Gazette ${yEl.value}`, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), {w: 210, h: Math.max(297, Math.round(210 * h / pxW))}); };
        T.actions(host, {print: {attrs: 'data-gz-print', run: () => ext.tresorPrint(`La Gazette ${yEl.value}`, GZ_CSS, gazetteHtml(T, tr, gazette(T, tr, Number(yEl.value)), opts()))}, layout: toLayout});
        draw();
    }
    F.push({key: 'gazette', group: 'creer', icon: '📰', title: 'La gazette de l’année', desc: 'La une d’un journal pour une année de la famille : mariages, naissances, nouvelles des nôtres, le prix du pain.', render: renderGazette});
    ext.tresorGazette = {gazette, gazetteHtml, bestYear, GZ_STYLES, pending: null};

    /* ── 🖥️ Le fond d'écran du jour ── */
    function ancestorOfDay(T, tr, day) {
        const md = day.slice(5), pool = tr.people.filter(p => !p.living && p.by), ann = pool.filter(p => p.bd?.slice(5) === md || p.dd?.slice(5) === md);
        const list = ann.length ? ann : pool; if (!list.length) return null; const p = list[Math.floor(T.rng(Number(day.replace(/-/g, '')) % 2147483646)() * list.length)];
        const why = p.bd?.slice(5) === md ? `Né${p.gender === 'female' ? 'e' : ''} il y a ${Number(day.slice(0, 4)) - p.by} ans, jour pour jour.` : p.dd?.slice(5) === md ? `Disparu${p.gender === 'female' ? 'e' : ''} il y a ${Number(day.slice(0, 4)) - p.dy} ans, jour pour jour.` : '';
        return {p, why};
    }
    const SIZES = {pc: ['Ordinateur', 1920, 1080], qhd: ['Grand écran (2K)', 2560, 1440], uhd: ['Écran 4K', 3840, 2160], ultra: ['Écran très large', 3440, 1440], mac: ['Mac Retina', 2880, 1800], tab: ['Tablette', 2048, 1536], tabv: ['Tablette debout', 1536, 2048], tel: ['Téléphone', 1179, 2556], android: ['Téléphone Android', 1080, 2400], perso: ['Sur mesure…', 0, 0]};
    const WP_PALETTES = {epoque: ['Selon l’époque de l’ancêtre'], nuit: ['Nuit bleue', '#14203f', '#e8e0cc'], sepia: ['Sépia', '#2e2112', '#d9c09a'], creme: ['Crème et encre', '#f3ead6', '#2a2016'], ardoise: ['Ardoise', '#2c3440', '#e9eef3'], sauge: ['Vert sauge', '#4f6650', '#f1ede0'], bordeaux: ['Bordeaux et or', '#3a0f1c', '#e3bb6a'], ocean: ['Océan', '#0f3b4f', '#f2e6c9'], rose: ['Poudre', '#e9c9c4', '#4a2a2e'], noir: ['Noir et blanc', '#0b0b0b', '#f4f4f4'], perso: ['Mes couleurs']};
    const WP_FONTS = {georgia: 'Georgia', didot: '"Didot","Bodoni MT","Times New Roman"', script: '"Brush Script MT","Segoe Script","Apple Chancery",cursive', baton: '"Futura","Century Gothic","Trebuchet MS",sans-serif', machine: '"Courier New",Courier,monospace'};
    const WP_DEFAULTS = {palette: 'epoque', c1: '#14203f', c2: '#e8e0cc', motif: 'diagonales', grad: 'diag', shape: 'rond', photoPos: 'auto', photoSize: 100, photoFx: 'aucun', blurBg: false, font: 'georgia', label: 'L’ANCÊTRE DU JOUR', showLife: true, showOcc: true, showStory: true, showParents: false, quote: '', cal: false, safe: 'aucune', align: 'auto'};
    async function drawWallpaper(T, tr, cv, a, size, face, o0 = {}) {
        const o = {...WP_DEFAULTS, ...o0}, [, W0, H0] = SIZES[size] || SIZES.pc, W = size === 'perso' ? Math.max(320, Math.min(7680, Number(o.w) || 1920)) : W0, H = size === 'perso' ? Math.max(320, Math.min(7680, Number(o.h) || 1080)) : H0;
        const x = cv.getContext('2d'), p = a.p, era = ext.tresorEra?.eraOf(p)?.[2] || 'sepia', portrait = H > W, FF = WP_FONTS[o.font] || 'Georgia';
        const eraPal = {ancien: ['#3b2a12', '#e2c98f'], empire: ['#14203f', '#c9a646'], sepia: ['#2e2112', '#d9c09a'], belle: ['#1f2a14', '#b9c98f'], deco: ['#0d0d0d', '#e8cf7a'], trente: ['#12352f', '#ffd9b8'], pop: ['#2a1406', '#f7b24a']}[era] || ['#14203f', '#e8e0cc'];
        const pal = o.palette === 'perso' ? [o.c1, o.c2] : o.palette === 'epoque' ? eraPal : WP_PALETTES[o.palette]?.slice(1) || eraPal;
        const light = (() => { const h = pal[0].replace('#', ''), n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; })();
        cv.width = W; cv.height = H;
        const g = o.grad === 'radial' ? x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7) : x.createLinearGradient(0, 0, o.grad === 'vertical' ? 0 : W, o.grad === 'horizontal' ? 0 : H);
        g.addColorStop(0, pal[0]); g.addColorStop(1, o.grad === 'aucun' ? pal[0] : light ? '#ffffff' : '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        if (o.blurBg && face) { x.save(); x.globalAlpha = 0.28; x.filter = `blur(${Math.round(Math.min(W, H) / 40)}px) grayscale(.4)`; const k = Math.max(W / face.width, H / face.height); x.drawImage(face, (W - face.width * k) / 2, (H - face.height * k) / 2, face.width * k, face.height * k); x.restore(); x.filter = 'none'; }
        const s = Math.min(W, H) / (portrait ? 820 : 1080);
        x.strokeStyle = pal[1]; x.fillStyle = pal[1]; x.globalAlpha = 0.08; x.lineWidth = 1.5 * s;
        if (o.motif === 'diagonales') for (let i = -H; i < W; i += 46 * s) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); }
        if (o.motif === 'points') for (let yy = 20 * s; yy < H; yy += 40 * s) for (let xx = 20 * s + ((yy / (40 * s)) % 2) * 20 * s; xx < W; xx += 40 * s) { x.beginPath(); x.arc(xx, yy, 3 * s, 0, 7); x.fill(); }
        if (o.motif === 'quadrillage') { for (let xx = 0; xx < W; xx += 60 * s) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); } for (let yy = 0; yy < H; yy += 60 * s) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); } }
        if (o.motif === 'vagues') for (let yy = 0; yy < H + 40 * s; yy += 36 * s) { x.beginPath(); for (let xx = 0; xx <= W; xx += 10 * s) x.lineTo(xx, yy + Math.sin(xx / (40 * s)) * 9 * s); x.stroke(); }
        if (o.motif === 'feuilles') for (let yy = 40 * s; yy < H; yy += 120 * s) for (let xx = 40 * s + ((yy / (120 * s)) % 2) * 60 * s; xx < W; xx += 120 * s) { x.beginPath(); x.ellipse(xx, yy, 10 * s, 24 * s, 0.7, 0, 7); x.fill(); }
        if (o.motif === 'arbre') { x.globalAlpha = 0.06; x.lineWidth = 6 * s; const br = (bx, by, len, ang, d) => { if (d > 7) return; const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len; x.beginPath(); x.moveTo(bx, by); x.lineTo(ex, ey); x.stroke(); br(ex, ey, len * 0.72, ang - 0.45, d + 1); br(ex, ey, len * 0.72, ang + 0.45, d + 1); }; br(W * 0.85, H, H * 0.28, -Math.PI / 2, 0); }
        x.globalAlpha = 1;
        // la place des icônes (bureau, à gauche) ou de l'heure (téléphone, en haut)
        const top = o.safe === 'horloge' ? H * 0.22 : 0, leftPad = o.safe === 'icones' ? W * 0.12 : 0;
        const pos = o.photoPos === 'auto' ? (portrait ? 'haut' : 'gauche') : o.photoPos, side = pos === 'gauche' || pos === 'droite';
        const r = (o.shape === 'aucune' ? 0 : 230) * s * (Number(o.photoSize) || 100) / 100;
        const cx = pos === 'gauche' ? leftPad + (W - leftPad) * 0.3 : pos === 'droite' ? W * 0.72 : leftPad + (W - leftPad) / 2, cy = side ? top + (H - top) / 2 : top + (H - top) * 0.32;
        if (r) {
            const clip = rr => { x.beginPath(); if (o.shape === 'carre') x.roundRect ? x.roundRect(cx - rr, cy - rr, 2 * rr, 2 * rr, 28 * s) : x.rect(cx - rr, cy - rr, 2 * rr, 2 * rr); else if (o.shape === 'arche') { x.moveTo(cx - rr * 0.8, cy + rr * 1.1); x.lineTo(cx - rr * 0.8, cy - rr * 0.3); x.arc(cx, cy - rr * 0.3, rr * 0.8, Math.PI, 0); x.lineTo(cx + rr * 0.8, cy + rr * 1.1); x.closePath(); } else if (o.shape === 'ovale') x.ellipse(cx, cy, rr * 0.8, rr, 0, 0, 7); else x.arc(cx, cy, rr, 0, 7); };
            x.save(); clip(r); x.clip();
            if (face) { x.filter = o.photoFx === 'nb' ? 'grayscale(1) contrast(1.08)' : o.photoFx === 'sepia' ? 'sepia(.7)' : 'none'; x.drawImage(face, cx - r, cy - r * 1.25, r * 2, r * 2.5); x.filter = 'none'; }
            else { x.fillStyle = pal[1]; x.globalAlpha = 0.2; x.fillRect(cx - r, cy - r * 1.2, 2 * r, 2.4 * r); x.globalAlpha = 1; x.fillStyle = pal[1]; x.font = `bold ${170 * s * r / (230 * s)}px ${FF}`; x.textAlign = 'center'; x.fillText(`${(p.first || '?')[0]}${(p.last || '')[0] || ''}`, cx, cy + 60 * s * r / (230 * s)); }
            x.restore(); x.strokeStyle = pal[1]; x.lineWidth = 6 * s; clip(r + 10 * s); x.stroke();
        }
        const align = o.align === 'auto' ? (side ? 'left' : 'center') : o.align;
        const tx = side ? (pos === 'gauche' ? Math.max(cx + r + 80 * s, W * 0.52) : leftPad + 90 * s) : align === 'left' ? leftPad + 90 * s : align === 'right' ? W - 90 * s : leftPad + (W - leftPad) / 2;
        const maxW = side ? (pos === 'gauche' ? W - tx - 80 * s : cx - r - 160 * s - leftPad) : (W - leftPad) * 0.82;
        let ty = side ? top + (H - top) * 0.36 : r ? cy + r + 150 * s : top + (H - top) * 0.4; x.textAlign = side && pos === 'droite' ? 'left' : align; x.fillStyle = pal[1];
        if (o.label) { x.font = `${30 * s}px ${o.font === 'script' ? 'system-ui' : FF}`; x.globalAlpha = 0.8; x.fillText(String(o.label).toUpperCase(), tx, ty - 70 * s); x.globalAlpha = 1; }
        x.font = `${o.font === 'baton' ? '' : 'italic '}${86 * s}px ${FF}`; x.fillText(T.name(p), tx, ty + 20 * s, maxW);
        const sub = [o.showLife && T.life(p), o.showOcc && p.occ].filter(Boolean).join(' · '); if (sub) { x.font = `${40 * s}px ${FF}`; x.fillText(sub, tx, ty + 90 * s, maxW); }
        let ly = ty + 170 * s; const para = (text, size, alpha = 0.85) => { x.font = `${size * s}px ${FF}`; x.globalAlpha = alpha; let line = ''; String(text).split(' ').forEach(w => { if (x.measureText(line + w).width > maxW && line) { x.fillText(line.trim(), tx, ly); line = ''; ly += size * 1.45 * s; } line += w + ' '; }); if (line.trim()) { x.fillText(line.trim(), tx, ly); ly += size * 1.45 * s; } x.globalAlpha = 1; ly += 14 * s; };
        if (o.showStory) para((a.why ? a.why + ' ' : '') + T.story(tr, p).slice(0, 2).join(' '), 32);
        if (o.showParents) { const par = [tr.byId.get(p.father), tr.byId.get(p.mother)].filter(Boolean); if (par.length) para(`${p.gender === 'female' ? 'Fille' : 'Fils'} de ${par.map(T.name).join(' et de ')}.`, 28, 0.7); }
        if (o.quote) { x.font = `italic ${36 * s}px ${FF}`; para(`« ${o.quote} »`, 36, 0.95); }
        if (o.cal) { // un petit calendrier du mois, dans un coin
            const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth(), first = (new Date(y0, m0, 1).getDay() + 6) % 7, days = new Date(y0, m0 + 1, 0).getDate(), cw = 44 * s, cxl = W - cw * 7 - 70 * s, cyl = portrait ? H - cw * 7 - 160 * s : H - cw * 7 - 40 * s;
            x.textAlign = 'center'; x.fillStyle = pal[1]; x.globalAlpha = 0.85; x.font = `bold ${26 * s}px ${FF}`; x.fillText(now.toLocaleDateString('fr-FR', {month: 'long', year: 'numeric'}), cxl + cw * 3.5, cyl);
            x.font = `${20 * s}px ${FF}`; 'LMMJVSD'.split('').forEach((d, i) => x.fillText(d, cxl + cw * (i + 0.5), cyl + cw));
            for (let d = 1; d <= days; d++) { const i = first + d - 1, cxx = cxl + cw * (i % 7 + 0.5), cyy = cyl + cw * (Math.floor(i / 7) + 2); if (d === now.getDate()) { x.globalAlpha = 0.25; x.beginPath(); x.arc(cxx, cyy - 7 * s, 18 * s, 0, 7); x.fill(); x.globalAlpha = 0.85; } x.fillText(String(d), cxx, cyy); }
            x.globalAlpha = 1; }
        x.textAlign = 'left';
    }
    async function renderWallpaper(host, T) {
        const tr = await T.tree(), day = new Date().toISOString().slice(0, 10), a = ancestorOfDay(T, tr, day);
        if (!a) { host.innerHTML = T.empty('Il faut des ancêtres avec une date de naissance'); return; }
        const KEY = 'lcnda-fond-ecran'; let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
        const o = {...WP_DEFAULTS, ...saved}, sel = (n, opts, cur) => `<select name="${n}">${Object.entries(opts).map(([k, l]) => `<option value="${k}"${String(cur) === k ? ' selected' : ''}>${T.esc(Array.isArray(l) ? l[0] : l)}</option>`).join('')}</select>`, chk = (n, l) => `<label class="checkbox-line"><input type="checkbox" name="${n}"${o[n] ? ' checked' : ''}> ${l}</label>`;
        host.innerHTML = `<div class="h-tr-split"><div class="h-tr-panel h-tr-noprint" data-wp-form><div class="h-tr-row"><label>Pour<select name="size">${Object.entries(SIZES).map(([k, [l, w, h]]) => `<option value="${k}"${saved.size === k ? ' selected' : ''}>${l}${w ? ` (${w} × ${h})` : ''}</option>`).join('')}</select></label><span data-wp-custom ${saved.size === 'perso' ? '' : 'hidden'}><label>Largeur<input type="number" name="w" min="320" max="7680" value="${o.w || 1920}" style="width:6em"></label> <label>Hauteur<input type="number" name="h" min="320" max="7680" value="${o.h || 1080}" style="width:6em"></label></span>
                <div style="min-width:240px"><span class="pk-lab">L’ancêtre (celui du jour par défaut)</span>${T.personField('who', a.p.id)}</div></div>
            <details open><summary><b>🎨 Couleurs et fond</b></summary><div class="h-tr-row"><label>Les couleurs${sel('palette', WP_PALETTES, o.palette)}</label><span data-wp-own ${o.palette === 'perso' ? '' : 'hidden'}><label>Fond <input type="color" name="c1" value="${o.c1}"></label> <label>Texte <input type="color" name="c2" value="${o.c2}"></label></span>
                <label>Le dégradé${sel('grad', {diag: 'En biais', vertical: 'De haut en bas', horizontal: 'De gauche à droite', radial: 'En rond', aucun: 'Aucun (uni)'}, o.grad)}</label><label>Le motif${sel('motif', {diagonales: 'Rayures fines', points: 'Pois', quadrillage: 'Quadrillage', vagues: 'Vagues', feuilles: 'Feuilles', arbre: 'Un arbre en filigrane', aucun: 'Aucun'}, o.motif)}</label>${chk('blurBg', 'La photo floutée en fond')}</div></details>
            <details open><summary><b>🖼️ La photo</b></summary><div class="h-tr-row"><label>La forme${sel('shape', {rond: 'Ronde', ovale: 'Ovale', carre: 'Carrée', arche: 'En arc', aucune: 'Sans photo'}, o.shape)}</label><label>La place${sel('photoPos', {auto: 'Automatique', gauche: 'À gauche', droite: 'À droite', haut: 'En haut, centrée'}, o.photoPos)}</label><label>La taille<input type="range" name="photoSize" min="50" max="160" value="${o.photoSize}"></label><label>Les couleurs${sel('photoFx', {aucun: 'D’origine', nb: 'Noir et blanc', sepia: 'Sépia'}, o.photoFx)}</label></div></details>
            <details open><summary><b>✏️ Les textes</b></summary><div class="h-tr-row"><label>L’écriture${sel('font', {georgia: 'Classique', didot: 'Élégante', script: 'À la plume', baton: 'Bâton', machine: 'Machine à écrire'}, o.font)}</label><label>L’alignement${sel('align', {auto: 'Automatique', left: 'À gauche', center: 'Centré', right: 'À droite'}, o.align)}</label><label>L’étiquette<input name="label" value="${T.esc(o.label)}" maxlength="40"></label>
                ${chk('showLife', 'Les dates')}${chk('showOcc', 'Le métier')}${chk('showStory', 'Sa vie en deux phrases')}${chk('showParents', 'Ses parents')}<label style="flex:1;min-width:16em">Une phrase à moi<input name="quote" value="${T.esc(o.quote)}" maxlength="140" placeholder="Une devise, un souvenir…"></label></div></details>
            <details open><summary><b>🧩 En plus</b></summary><div class="h-tr-row">${chk('cal', 'Le calendrier du mois')}<label>Laisser la place pour${sel('safe', {aucune: 'rien', icones: 'les icônes du bureau (à gauche)', horloge: 'l’heure du téléphone (en haut)'}, o.safe)}</label></div></details>
            <div class="h-tr-row"><button type="button" class="button secondary" data-wp-reset>↺ Remettre comme au départ</button></div>
            <p class="h-tr-muted">Chaque jour un autre ancêtre — en priorité celui dont c’est l’anniversaire de naissance ou de décès. Tes réglages sont gardés sur cet ordinateur.</p></div>
            <div class="h-tr-view"><canvas class="h-tr-canvas" data-wp-c style="max-width:100%;max-height:70vh"></canvas></div></div>`;
        const cv = host.querySelector('[data-wp-c]'), form = host.querySelector('[data-wp-form]');
        const read = () => { const v = {}; form.querySelectorAll('[name]').forEach(el => { if (el.name === 'who' || !el.name) return; v[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); return v; };
        let faceP = null, faceId = 0;
        const draw = async () => { const v = read(); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} form.querySelector('[data-wp-custom]').hidden = v.size !== 'perso'; form.querySelector('[data-wp-own]').hidden = v.palette !== 'perso';
            const pid = Number(host.querySelector('[name=who]').value), cur = pid === a.p.id ? a : {p: tr.byId.get(pid), why: ''}; if (!cur.p) return;
            if (faceId !== cur.p.id) { faceId = cur.p.id; faceP = faceOf(T, tr, cur.p.id, 600); } await drawWallpaper(T, tr, cv, cur, v.size, await faceP, v); };
        host.addEventListener('change', draw); form.addEventListener('input', e => { if (e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') draw(); });
        T.actions(host, {exports: [{icon: '🖼', label: 'Le fond d’écran (image PNG)', name: `fond-d-ecran-${day}.png`, make: () => T.canvasPng(cv)}], media: {title: 'Fond d’écran du jour', make: async () => ({blob: await T.canvasPng(cv), name: `fond-d-ecran-${day}.png`})},
            layout: () => T.toLayout('Fond d’écran', cv.toDataURL('image/png'), {w: 297, h: Math.round(297 * cv.height / cv.width)})});
        host.querySelector('[data-wp-reset]').addEventListener('click', () => { try { localStorage.removeItem(KEY); } catch (_) {} renderWallpaper(host, T); });
        await draw();
    }
    F.push({key: 'fond-ecran', group: 'creer', icon: '🖥️', title: 'Le fond d’écran du jour', desc: 'Chaque jour un ancêtre en image, aux dimensions de ton écran : couleurs, motif, photo, textes, calendrier… tout se règle.', render: renderWallpaper});
    ext.tresorWallpaper = {ancestorOfDay, drawWallpaper, SIZES, WP_DEFAULTS};
})();
