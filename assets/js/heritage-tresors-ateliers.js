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
    const textW = s => [...s].length * 6 - 1;
    function sampler({title, couple, date, color = 'rouge'}) {
        const lines = [fold(title).toUpperCase(), fold(couple).toUpperCase(), fold(date).toUpperCase()].map(l => l.replace(/[^A-Z0-9 &.,'\-♥]/g, '')).filter(Boolean);
        const W = Math.max(41, ...lines.map(l => textW(l) + 10)), H = 10 + lines.length * 10 + 14, grid = [...Array(H)].map(() => Array(W).fill(null));
        const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c; };
        for (let x = 0; x < W; x++) { if (x % 4 !== 3) { put(x, 0, 'vert'); put(x, H - 1, 'vert'); } if (x % 4 === 1) { put(x, 1, 'or'); put(x, H - 2, 'or'); } }
        for (let y = 0; y < H; y++) { if (y % 4 !== 3) { put(0, y, 'vert'); put(W - 1, y, 'vert'); } }
        let y = 4; lines.forEach((l, k) => { let x = Math.floor((W - textW(l)) / 2); [...l].forEach(ch => { (FONT[ch] || FONT[' ']).forEach((row, ry) => { for (let b = 0; b < 5; b++) if (row & (16 >> b)) put(x + b, y + ry, k === 1 ? 'bleu' : color); }); x += 6; }); y += 10; });
        const tx = Math.floor((W - 11) / 2); TREE.forEach((r, ry) => [...r].forEach((c, rx) => { if (c !== '.') put(tx + rx, y + ry, c === '1' ? 'vert' : 'brun'); }));
        [[4, y + 4], [W - 9, y + 4]].forEach(([hx, hy]) => FONT['♥'].forEach((row, ry) => { for (let b = 0; b < 5; b++) if (row & (16 >> b)) put(hx + b, hy + ry - 2, 'rose'); }));
        return {grid, W, H};
    }
    function samplerSvg(sm, mode = 'grille') {
        const c = 12, used = {}; let cells = '';
        sm.grid.forEach((row, y) => row.forEach((t, x) => { if (!t) return; used[t] = (used[t] || 0) + 1; const th = THREADS[t], X = x * c, Y = y * c;
            cells += mode === 'apercu' ? `<path d="M${X + 2} ${Y + 2}L${X + c - 2} ${Y + c - 2}M${X + c - 2} ${Y + 2}L${X + 2} ${Y + c - 2}" stroke="${th[1]}" stroke-width="3" stroke-linecap="round"/>` : `<rect x="${X}" y="${Y}" width="${c}" height="${c}" fill="${th[1]}" opacity=".55"/><text x="${X + c / 2}" y="${Y + c - 3}" font-size="9" text-anchor="middle" fill="#111">${th[3]}</text>`; }));
        const lines = mode === 'apercu' ? '' : [...Array(sm.W + 1)].map((_, x) => `<line x1="${x * c}" y1="0" x2="${x * c}" y2="${sm.H * c}" stroke="${x % 10 ? '#ccc' : '#555'}" stroke-width="${x % 10 ? 0.5 : 1.2}"/>`).join('') + [...Array(sm.H + 1)].map((_, y) => `<line x1="0" y1="${y * c}" x2="${sm.W * c}" y2="${y * c}" stroke="${y % 10 ? '#ccc' : '#555'}" stroke-width="${y % 10 ? 0.5 : 1.2}"/>`).join('');
        return {svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${sm.W * c + 2} ${sm.H * c + 2}" width="${sm.W * c + 2}" height="${sm.H * c + 2}"><rect x="-1" y="-1" width="${sm.W * c + 2}" height="${sm.H * c + 2}" fill="${mode === 'apercu' ? '#f4efe2' : '#fff'}"/>${cells}${lines}</svg>`, used};
    }
    async function renderStitch(host, T) {
        const tr = await T.tree(), st = T.start(tr), f = tr.families.find(x => x.my && x.a && x.b && T.ancestors(tr, st?.id || 0, 30).some(a => a.id === x.a)) || tr.families.find(x => x.a && x.b);
        const a = f && tr.byId.get(f.a), b = f && tr.byId.get(f.b);
        host.innerHTML = `<div class="h-tr-split"><form class="h-tr-panel" data-xs><label>Le titre<input name="title" maxlength="30" value="FAMILLE ${T.esc((st?.last || '').toUpperCase())}"></label><label>Le couple<input name="couple" maxlength="30" value="${T.esc([a?.first, b?.first].filter(Boolean).join(' & '))}"></label>
            <label>La date<input name="date" maxlength="30" value="${T.esc(f?.my ? String(f.my) : '')}"></label><label>La couleur du titre<select name="color">${Object.entries(THREADS).map(([k, t]) => `<option value="${k}">${T.esc(t[0])} (DMC ${t[2]})</option>`).join('')}</select></label>
            <label>Voir<select name="mode"><option value="apercu">l’aperçu brodé</option><option value="grille">la grille à symboles</option></select></label><p class="h-tr-row"><button type="button" class="button" data-xs-print>🖨 Imprimer la grille</button><button type="button" class="button secondary" data-xs-svg>⬇ SVG</button></p><div data-xs-info class="h-tr-muted"></div></form><div class="h-tr-xs-out" data-xs-out></div></div>`;
        const form = host.querySelector('[data-xs]'), out = host.querySelector('[data-xs-out]'), info = host.querySelector('[data-xs-info]');
        const cur = () => sampler({title: form.elements.title.value, couple: form.elements.couple.value, date: form.elements.date.value, color: form.elements.color.value});
        const legend = used => Object.entries(used).map(([k, n]) => `<span class="h-tr-pill">${THREADS[k][3]} ${THREADS[k][0]} DMC ${THREADS[k][2]} — ${n} points</span>`).join(' ');
        const draw = () => { const sm = cur(), r = samplerSvg(sm, form.elements.mode.value); out.innerHTML = r.svg; const cm = n => (n / 14 * 2.54).toFixed(1).replace('.', ',');
            info.innerHTML = `${sm.W} × ${sm.H} points · sur Aïda 14 : ${cm(sm.W)} × ${cm(sm.H)} cm<br>${legend(r.used)}`; };
        form.addEventListener('input', draw);
        host.querySelector('[data-xs-svg]').addEventListener('click', () => T.download(`broderie-${slug(form.elements.title.value)}.svg`, new Blob([samplerSvg(cur(), 'grille').svg], {type: 'image/svg+xml'})));
        host.querySelector('[data-xs-print]').addEventListener('click', () => { const r = samplerSvg(cur(), 'grille'); ext.tresorPrint('Grille de broderie', 'section{background:#fff;max-width:190mm;margin:8mm auto;padding:8mm;font-family:system-ui}section svg{width:100%;height:auto}.lg span{display:inline-block;margin:2mm;padding:1mm 3mm;border:1px solid #ccc;border-radius:3mm}', `<section><h1>${T.esc(form.elements.title.value)}</h1>${r.svg}<p class="lg">${legend(r.used)}</p><p>Un carré = un point de croix ; les traits épais tous les 10 points.</p></section>`); });
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
        host.innerHTML = `<div class="h-tr-panel h-tr-row h-tr-noprint"><div style="min-width:240px"><span class="pk-lab">Les ancêtres de</span>${T.personField('root', st?.id)}</div><label>Générations<select name="g"><option>3</option><option>4</option><option selected>5</option><option>6</option></select></label>
            <label>Largeur<input type="number" name="d" min="100" max="1000" value="300" data-unit="mm" style="width:6em"></label><button type="button" class="button" data-lz-svg>⬇ SVG pour la graveuse</button></div>
            <p class="h-tr-muted">Le fichier est aux vraies dimensions, en millimètres : <b>noir = gravure</b> (traits et noms), <b>rouge = découpe</b> (le contour, trait fin). Convient à LightBurn, Glowforge, xTool, Inkscape. Vérifie toujours la taille à l’import.</p><div class="h-tr-lz-out" data-lz-out></div>`;
        const svg = () => fanSvg(T, tr, Number(host.querySelector('[name=root]').value) || st.id, Number(host.querySelector('[name=g]').value), Math.max(100, Math.min(1000, Number(host.querySelector('[name=d]').value) || 300)));
        const draw = () => { host.querySelector('[data-lz-out]').innerHTML = svg(); }; host.addEventListener('change', draw); host.addEventListener('input', e => { if (e.target.name === 'd') draw(); });
        host.querySelector('[data-lz-svg]').addEventListener('click', () => T.download(`eventail-${slug(T.name(tr.byId.get(Number(host.querySelector('[name=root]').value))))}.svg`, new Blob([svg()], {type: 'image/svg+xml'})));
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
        const tr = await T.tree(); host.innerHTML = '<p class="h-tr-muted">Je rassemble les visages…</p>';
        const tiles = []; for (const p of tr.people) { if (tiles.length >= 400) break; const c = await faceOf(T, tr, p.id, 120); if (c) tiles.push({p, c, col: avg(c)}); } // 400 visages au plus (un très grand arbre)
        if (!tiles.length) { host.innerHTML = '<p class="h-tr-muted">Aucun portrait dans l’arbre : ajoute une photo de portrait sur les fiches, ou encadre les visages dans la visionneuse.</p>'; return; }
        host.innerHTML = `<div class="h-tr-panel h-tr-row h-tr-noprint"><label>La mosaïque<select name="mode"><option value="grid">tous les visages, en grille</option><option value="photo">un portrait refait avec tous les autres</option></select></label>
            <label data-mo-t>Le portrait à refaire<select name="target">${tiles.map(t => `<option value="${t.p.id}">${T.esc(T.name(t.p))}</option>`).join('')}</select></label><label data-mo-t>Finesse<select name="n"><option value="24">24 × 24</option><option value="40" selected>40 × 40</option><option value="60">60 × 60</option></select></label>
            <button type="button" class="button" data-mo-png>⬇ PNG</button><span class="h-tr-muted">${tiles.length} visage${tiles.length > 1 ? 's' : ''}</span></div><canvas class="h-tr-canvas" data-mo-c width="1600" height="1600" style="max-width:640px"></canvas>`;
        const cv = host.querySelector('[data-mo-c]'), x = cv.getContext('2d'), el = n => host.querySelector(`[name=${n}]`);
        const draw = async () => { const mode = el('mode').value; host.querySelectorAll('[data-mo-t]').forEach(l => { l.hidden = mode !== 'photo'; });
            if (mode === 'grid') { const n = Math.ceil(Math.sqrt(tiles.length)), w = 1600 / n, h = w * 1.25; cv.width = 1600; cv.height = Math.ceil(tiles.length / n) * h + 0; x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, cv.width, cv.height);
                tiles.forEach((t, k) => { const tx = (k % n) * w, ty = Math.floor(k / n) * h; x.drawImage(t.c, tx + 3, ty + 3, w - 6, h - 6); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(tx + 3, ty + h - 3 - h * 0.16, w - 6, h * 0.16); x.fillStyle = '#fff'; x.font = `${Math.max(10, w / 11)}px system-ui`; x.textAlign = 'center'; x.fillText(T.name(t.p), tx + w / 2, ty + h - 3 - h * 0.05); }); x.textAlign = 'left'; return; }
            const target = tiles.find(t => t.p.id === Number(el('target').value)) || tiles[0], N = Number(el('n').value), small = document.createElement('canvas'); small.width = N; small.height = Math.round(N * 1.25); small.getContext('2d').drawImage(target.c, 0, 0, small.width, small.height);
            const d = small.getContext('2d').getImageData(0, 0, small.width, small.height).data, cw = 1600 / N, chh = cw; cv.width = 1600; cv.height = Math.round(small.height * chh); const R = T.rng(N * 31 + target.p.id);
            for (let yy = 0; yy < small.height; yy++) for (let xx = 0; xx < N; xx++) { const i = (yy * N + xx) * 4, c = [d[i], d[i + 1], d[i + 2]], best = tiles.map(t => [t, (t.col[0] - c[0]) ** 2 + (t.col[1] - c[1]) ** 2 + (t.col[2] - c[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 3), t = best[Math.floor(R() * best.length)][0];
                x.drawImage(t.c, xx * cw, yy * chh, cw, chh); x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},.45)`; x.fillRect(xx * cw, yy * chh, cw, chh); } };
        host.addEventListener('change', draw); host.querySelector('[data-mo-png]').addEventListener('click', () => cv.toBlob(b => b && T.download('mosaique-de-portraits.png', b), 'image/png'));
        await draw();
    }
    F.push({key: 'mosaique', group: 'creer', icon: '🖼️', title: 'La mosaïque de portraits', desc: 'Tous les visages de l’arbre en une image, ou un portrait refait avec les visages de toute la famille.', render: renderMosaic});

    /* ── 👤 Le visage de la lignée ── */
    function lineage(tr, pid, side) { const out = []; let p = tr.byId.get(pid); while (p && out.length < 15) { out.push(p); p = tr.byId.get(side === 'mother' ? p.mother : p.father); } return out; }
    async function renderFace(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<div class="h-tr-panel h-tr-row h-tr-noprint"><div style="min-width:240px"><span class="pk-lab">À partir de</span>${T.personField('root', st?.id)}</div><label>La lignée<select name="side"><option value="father">de père en père</option><option value="mother">de mère en mère</option></select></label>
            <button type="button" class="button" data-fc-play>▶ Le fondu</button><button type="button" class="button secondary" data-fc-png>⬇ Les visages (PNG)</button></div><div data-fc-out></div>`;
        const out = host.querySelector('[data-fc-out]'); let faces = [], timer = 0;
        const draw = async () => { clearInterval(timer); const line = lineage(tr, Number(host.querySelector('[name=root]').value) || st.id, host.querySelector('[name=side]').value); faces = [];
            for (const p of line) { const c = await faceOf(T, tr, p.id, 240); if (c) faces.push({p, c}); }
            if (!faces.length) { out.innerHTML = `<p class="h-tr-muted">Aucun visage connu dans cette lignée (${line.map(p => T.esc(p.first || T.name(p))).join(' → ')}). Ajoute des portraits ou encadre les visages sur les photos.</p>`; return; }
            const avgC = document.createElement('canvas'); avgC.width = 240; avgC.height = 300; const ax = avgC.getContext('2d'); faces.forEach((f, k) => { ax.globalAlpha = 1 / (k + 1); ax.drawImage(f.c, 0, 0); }); ax.globalAlpha = 1;
            out.innerHTML = `<div class="h-tr-faces">${faces.map(f => `<figure><span data-fc-slot="${f.p.id}"></span><figcaption><b>${T.esc(T.name(f.p))}</b><small>${T.esc(T.life(f.p))}</small></figcaption></figure>`).join('<span class="h-tr-arrow">←</span>')}</div>
                <div class="h-tr-row" style="align-items:start"><figure class="h-tr-avg"><span data-fc-avg></span><figcaption>Le visage moyen de ${faces.length} génération${faces.length > 1 ? 's' : ''}</figcaption></figure><figure class="h-tr-avg"><canvas data-fc-fade width="240" height="300"></canvas><figcaption data-fc-name>Le fondu</figcaption></figure></div>`;
            faces.forEach(f => out.querySelector(`[data-fc-slot="${f.p.id}"]`).appendChild(f.c)); out.querySelector('[data-fc-avg]').appendChild(avgC); out.querySelector('[data-fc-fade]').getContext('2d').drawImage(faces[0].c, 0, 0); };
        host.querySelector('[data-fc-play]').addEventListener('click', () => { clearInterval(timer); const cv = out.querySelector('[data-fc-fade]'); if (!cv || !faces.length) return; const x = cv.getContext('2d'), nm = out.querySelector('[data-fc-name]'); let k = 0, t = 0;
            timer = setInterval(() => { if (!host.isConnected) return clearInterval(timer); const a = faces[k % faces.length], b = faces[(k + 1) % faces.length]; x.globalAlpha = 1; x.drawImage(a.c, 0, 0); x.globalAlpha = t; x.drawImage(b.c, 0, 0); x.globalAlpha = 1; nm.textContent = t < 0.5 ? T.name(a.p) : T.name(b.p); t += 0.04; if (t >= 1) { t = 0; k++; } }, 50); });
        host.querySelector('[data-fc-png]').addEventListener('click', () => { if (!faces.length) return; const c = document.createElement('canvas'), w = 240; c.width = faces.length * (w + 20) + 20; c.height = 380; const x = c.getContext('2d'); x.fillStyle = '#f6f0e1'; x.fillRect(0, 0, c.width, c.height);
            faces.forEach((f, k) => { x.drawImage(f.c, 20 + k * (w + 20), 20); x.fillStyle = '#2b2116'; x.font = '16px Georgia'; x.textAlign = 'center'; x.fillText(T.name(f.p), 20 + k * (w + 20) + w / 2, 345); x.font = '13px Georgia'; x.fillText(T.life(f.p), 20 + k * (w + 20) + w / 2, 365); }); c.toBlob(b => b && T.download('visage-de-la-lignee.png', b), 'image/png'); });
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
    function gazetteHtml(T, tr, g) {
        const fam = T.start(tr)?.last || '', plc = id => T.place(tr, id), price = g.Y < 1870 ? '1 sou' : g.Y < 1914 ? '5 centimes' : g.Y < 1960 ? '1 franc' : g.Y < 2002 ? '5 francs' : '1,50 €';
        const lead = g.wed[0] ? (() => { const f = g.wed[0], a = tr.byId.get(f.a), b = tr.byId.get(f.b); return `${f.mplace ? `${plc(f.mplace).toUpperCase()}. — ` : ''}C’est ${f.md ? `le ${T.dateFr(f.md)}` : `en ${g.Y}`} que ${T.name(a)}${a?.occ ? `, ${a.occ},` : ''} a épousé ${T.name(b)}${b?.occ ? `, ${b.occ}` : ''}. ${[a, b].filter(x => x?.father || x?.mother).map(x => `${x.first} est ${x.gender === 'female' ? 'la fille' : 'le fils'} de ${[tr.byId.get(x.father), tr.byId.get(x.mother)].filter(Boolean).map(T.name).join(' et de ')}`).join('. ')}${a || b ? '. Tous nos vœux de bonheur aux jeunes époux.' : ''}`; })()
            : g.born[0] ? `${g.born[0].bplace ? `${plc(g.born[0].bplace).toUpperCase()}. — ` : ''}${T.story(tr, g.born[0])[0] || ''} ${[tr.byId.get(g.born[0].father), tr.byId.get(g.born[0].mother)].filter(Boolean).length ? `Les heureux parents, ${[tr.byId.get(g.born[0].father), tr.byId.get(g.born[0].mother)].filter(Boolean).map(T.name).join(' et ')}, reçoivent les félicitations de toute la famille.` : ''}`
            : g.dead[0] ? T.story(tr, g.dead[0]).join(' ') : 'Rien de notable à signaler cette année dans la famille, ce qui est aussi une bonne nouvelle.';
        return `<article class="gz"><header><div class="gz-top"><span>Édition unique</span><span>Prix : ${price}</span></div><h1>La Gazette des ${T.esc(fam || 'nôtres')}</h1><div class="gz-top"><span>Année ${g.Y}</span><span>${g.alive.length} membre${g.alive.length > 1 ? 's' : ''} de la famille en vie</span></div></header>
            <h2>${T.esc(g.headline)}</h2><p class="gz-lead">${T.esc(lead)}</p><div class="gz-cols">
            <section><h3>Carnet</h3>${g.born.length ? `<h4>Naissances</h4>${g.born.map(p => `<p>${T.esc(T.name(p))}${p.bd ? `, le ${T.esc(T.dateFr(p.bd).replace(/ \d+$/, ''))}` : ''}${p.bplace ? ` à ${T.esc(plc(p.bplace))}` : ''}.</p>`).join('')}` : ''}
                ${g.wed.length ? `<h4>Mariages</h4>${g.wed.map(f => `<p>${T.esc([f.a, f.b].map(x => T.name(tr.byId.get(x))).join(' et '))}${f.mplace ? ` à ${T.esc(plc(f.mplace))}` : ''}.</p>`).join('')}` : ''}
                ${g.dead.length ? `<h4>Décès</h4>${g.dead.map(p => `<p>${T.esc(T.name(p))}${p.by ? `, ${p.dy - p.by} ans` : ''}${p.dplace ? `, à ${T.esc(plc(p.dplace))}` : ''}.</p>`).join('')}` : ''}${!g.born.length && !g.wed.length && !g.dead.length ? '<p>Rien cette année.</p>' : ''}</section>
            <section><h3>Nouvelles des nôtres</h3>${g.other.length ? g.other.slice(0, 8).map(x => `<p><b>${T.esc(T.name(x.p))}</b> : ${T.esc(x.e.label.toLowerCase())}${x.e.what ? ` (${T.esc(x.e.what)})` : ''}${x.e.place ? `, ${T.esc(plc(x.e.place))}` : ''}.</p>`).join('') : '<p>Pas d’autres nouvelles.</p>'}
                ${g.round.length || g.gold.length ? `<h4>Anniversaires</h4>${g.round.slice(0, 8).map(p => `<p>${T.esc(T.name(p))} fête ses ${g.Y - p.by} ans.</p>`).join('')}${g.gold.map(f => `<p>${T.esc([f.a, f.b].map(x => tr.byId.get(x)?.first).join(' et '))} : ${g.Y - f.my} ans de mariage !</p>`).join('')}` : ''}</section>
            <section><h3>Le coin pratique</h3>${g.bread ? `<p>Le kilo de pain : environ <b>${g.bread < 1 ? (g.bread * (g.unit === 'livre' ? 20 : 100)).toFixed(0) + (g.unit === 'livre' ? ' sous' : ' centimes') : g.bread.toFixed(2).replace('.', ',') + ' ' + g.unit + (g.bread >= 2 && g.unit !== 'euro' ? 's' : '')}</b>.</p>` : ''}
                <h4>Qui fait quoi</h4>${g.alive.filter(p => p.occ && p.by && g.Y - p.by >= 16).slice(0, 8).map(p => `<p>${T.esc(p.first)} ${T.esc(p.last || '')}, ${T.esc(p.occ)}.</p>`).join('') || '<p>—</p>'}</section></div><footer>Composée à partir de l’arbre de famille · ${new Date().getFullYear()}</footer></article>`;
    }
    const GZ_CSS = `.gz{max-width:190mm;margin:8mm auto;padding:10mm 12mm;background:#f6f1e3;color:#1d1a14;font-family:Georgia,"Times New Roman",serif;box-shadow:0 2px 12px #0004}.gz header{border-bottom:3px double #1d1a14;text-align:center}.gz h1{font-family:"Old English Text MT","UnifrakturMaguntia",Georgia,serif;font-size:34pt;margin:2mm 0}.gz-top{display:flex;justify-content:space-between;font-size:9pt;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #1d1a14;border-bottom:1px solid #1d1a14;padding:1mm 0;margin:1mm 0}.gz h2{font-size:22pt;text-align:center;margin:5mm 0 2mm}.gz-lead{font-size:12pt;text-align:justify;column-count:2;column-gap:7mm}.gz-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;border-top:1px solid #1d1a14;padding-top:3mm}.gz-cols section{border-right:1px solid #bbb;padding-right:4mm}.gz-cols section:last-child{border:0}.gz h3{text-transform:uppercase;font-size:11pt;letter-spacing:.1em;border-bottom:1px solid #1d1a14}.gz h4{font-size:10pt;margin:3mm 0 1mm;font-style:italic}.gz p{margin:1mm 0;font-size:10pt;line-height:1.35;text-align:justify}.gz footer{margin-top:5mm;text-align:center;font-size:8pt;border-top:1px solid #1d1a14;padding-top:1mm}@media print{.gz{box-shadow:none;margin:0}}`;
    async function renderGazette(host, T) {
        const tr = await T.tree(), years = [...new Set(tr.events.map(e => e.y).filter(Boolean))].sort((a, b) => a - b), Y0 = Number(ext.tresorGazette.pending) || bestYear(tr); ext.tresorGazette.pending = null; // pending : l'année demandée par un widget ou la liste
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><label>L’année<input type="number" name="y" value="${Y0}" min="${years[0] || 1700}" max="${new Date().getFullYear()}" style="width:6em"></label><button type="button" class="button secondary" data-gz-prev>◀</button><button type="button" class="button secondary" data-gz-next>▶</button><button type="button" class="button" data-gz-print>🖨 Imprimer</button><span class="h-tr-muted">Les années les plus riches : ${(() => { const c = new Map(); tr.events.forEach(e => e.y && c.set(e.y, (c.get(e.y) || 0) + 1)); return [...c].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([y]) => y).sort().join(', '); })()}</span></div><style>${GZ_CSS}</style><div data-gz-out></div>`;
        const yEl = host.querySelector('[name=y]'), out = host.querySelector('[data-gz-out]');
        const draw = () => { out.innerHTML = gazetteHtml(T, tr, gazette(T, tr, Number(yEl.value) || Y0)); };
        const step = d => { const y = Number(yEl.value), l = d > 0 ? years.find(v => v > y) : [...years].reverse().find(v => v < y); if (l) { yEl.value = l; draw(); } };
        yEl.addEventListener('input', draw); host.querySelector('[data-gz-prev]').addEventListener('click', () => step(-1)); host.querySelector('[data-gz-next]').addEventListener('click', () => step(1));
        host.querySelector('[data-gz-print]').addEventListener('click', () => ext.tresorPrint(`La Gazette ${yEl.value}`, GZ_CSS, gazetteHtml(T, tr, gazette(T, tr, Number(yEl.value)))));
        draw();
    }
    F.push({key: 'gazette', group: 'creer', icon: '📰', title: 'La gazette de l’année', desc: 'La une d’un journal pour une année de la famille : mariages, naissances, nouvelles des nôtres, le prix du pain.', render: renderGazette});
    ext.tresorGazette = {gazette, gazetteHtml, bestYear, pending: null};

    /* ── 🖥️ Le fond d'écran du jour ── */
    function ancestorOfDay(T, tr, day) {
        const md = day.slice(5), pool = tr.people.filter(p => !p.living && p.by), ann = pool.filter(p => p.bd?.slice(5) === md || p.dd?.slice(5) === md);
        const list = ann.length ? ann : pool; if (!list.length) return null; const p = list[Math.floor(T.rng(Number(day.replace(/-/g, '')) % 2147483646)() * list.length)];
        const why = p.bd?.slice(5) === md ? `Né${p.gender === 'female' ? 'e' : ''} il y a ${Number(day.slice(0, 4)) - p.by} ans, jour pour jour.` : p.dd?.slice(5) === md ? `Disparu${p.gender === 'female' ? 'e' : ''} il y a ${Number(day.slice(0, 4)) - p.dy} ans, jour pour jour.` : '';
        return {p, why};
    }
    const SIZES = {pc: ['Ordinateur', 1920, 1080], tab: ['Tablette', 2048, 1536], tel: ['Téléphone', 1179, 2556]};
    async function drawWallpaper(T, tr, cv, a, size, face) {
        const [, W, H] = SIZES[size] || SIZES.pc, x = cv.getContext('2d'), p = a.p, era = ext.tresorEra?.eraOf(p)?.[2] || 'sepia', portrait = H > W;
        const pal = {ancien: ['#3b2a12', '#e2c98f'], empire: ['#14203f', '#c9a646'], sepia: ['#2e2112', '#d9c09a'], belle: ['#1f2a14', '#b9c98f'], deco: ['#0d0d0d', '#e8cf7a'], trente: ['#12352f', '#ffd9b8'], pop: ['#2a1406', '#f7b24a']}[era] || ['#14203f', '#e8e0cc'];
        cv.width = W; cv.height = H; const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, pal[0]); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.strokeStyle = pal[1]; x.globalAlpha = 0.08; for (let i = -H; i < W; i += 46) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); } x.globalAlpha = 1;
        const s = Math.min(W, H) / 1080, cx = portrait ? W / 2 : W * 0.3, cy = portrait ? H * 0.36 : H / 2, r = 230 * s;
        x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip(); if (face) x.drawImage(face, cx - r, cy - r * 1.25, r * 2, r * 2.5); else { x.fillStyle = pal[1]; x.globalAlpha = 0.2; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); x.globalAlpha = 1; x.fillStyle = pal[1]; x.font = `bold ${170 * s}px Georgia`; x.textAlign = 'center'; x.fillText(`${(p.first || '?')[0]}${(p.last || '')[0] || ''}`, cx, cy + 60 * s); } x.restore();
        x.strokeStyle = pal[1]; x.lineWidth = 6 * s; x.beginPath(); x.arc(cx, cy, r + 10 * s, 0, 7); x.stroke();
        const tx = portrait ? W / 2 : W * 0.56, ty = portrait ? cy + r + 150 * s : H * 0.38; x.textAlign = portrait ? 'center' : 'left'; x.fillStyle = pal[1];
        x.font = `${30 * s}px system-ui`; x.globalAlpha = 0.8; x.fillText('L’ANCÊTRE DU JOUR', tx, ty - 70 * s); x.globalAlpha = 1; x.font = `italic ${86 * s}px Georgia`; x.fillText(T.name(p), tx, ty + 20 * s);
        x.font = `${40 * s}px Georgia`; x.fillText([T.life(p), p.occ].filter(Boolean).join(' · '), tx, ty + 90 * s);
        const words = (a.why ? a.why + ' ' : '') + (T.story(tr, p).slice(0, 2).join(' ')), maxW = portrait ? W * 0.82 : W * 0.38; x.font = `${32 * s}px Georgia`; x.globalAlpha = 0.85; let line = '', ly = ty + 170 * s;
        words.split(' ').forEach(w => { if (x.measureText(line + w).width > maxW && line) { x.fillText(line.trim(), tx, ly); line = ''; ly += 46 * s; } line += w + ' '; }); x.fillText(line.trim(), tx, ly); x.globalAlpha = 1; x.textAlign = 'left';
    }
    async function renderWallpaper(host, T) {
        const tr = await T.tree(), day = new Date().toISOString().slice(0, 10), a = ancestorOfDay(T, tr, day);
        if (!a) { host.innerHTML = '<p class="h-tr-muted">Il faut des ancêtres avec une date de naissance.</p>'; return; }
        host.innerHTML = `<div class="h-tr-panel h-tr-row h-tr-noprint"><label>Pour<select name="size">${Object.entries(SIZES).map(([k, [l, w, h]]) => `<option value="${k}">${l} (${w} × ${h})</option>`).join('')}</select></label><div style="min-width:240px"><span class="pk-lab">L’ancêtre (celui du jour par défaut)</span>${T.personField('who', a.p.id)}</div><button type="button" class="button" data-wp-png>⬇ Le fond d’écran (PNG)</button></div>
            <p class="h-tr-muted">Chaque jour un autre ancêtre — en priorité celui dont c’est l’anniversaire de naissance ou de décès.</p><canvas class="h-tr-canvas" data-wp-c style="max-width:100%;max-height:70vh"></canvas>`;
        const cv = host.querySelector('[data-wp-c]');
        const draw = async () => { const pid = Number(host.querySelector('[name=who]').value), cur = pid === a.p.id ? a : {p: tr.byId.get(pid), why: ''}; if (!cur.p) return; const face = await faceOf(T, tr, cur.p.id, 400); await drawWallpaper(T, tr, cv, cur, host.querySelector('[name=size]').value, face); };
        host.addEventListener('change', draw); host.querySelector('[data-wp-png]').addEventListener('click', () => cv.toBlob(b => b && T.download(`fond-d-ecran-${day}.png`, b), 'image/png'));
        await draw();
    }
    F.push({key: 'fond-ecran', group: 'creer', icon: '🖥️', title: 'Le fond d’écran du jour', desc: 'Chaque jour un ancêtre en image, aux dimensions de ton ordinateur, de ta tablette ou de ton téléphone.', render: renderWallpaper});
    ext.tresorWallpaper = {ancestorOfDay};
})();
