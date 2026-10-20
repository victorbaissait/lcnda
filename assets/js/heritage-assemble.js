/**
 * 🧩 Assembler des photos (visionneuse → « 🧩 Assembler », Médias → « 🧩 Assembler des photos », Recueils → une page).
 * Plusieurs photos d'un même document (une grande page prise en morceaux, un recto et un zoom…) posées sur un plan de
 * travail : chacune se déplace, se redimensionne, tourne librement, devient transparente ; le « mode différence » montre
 * en noir ce qui se superpose bien (pour aligner au pixel près). Le résultat est une nouvelle image : les originaux restent.
 * Enregistrement : copie rattachée aux mêmes fiches que la première photo de la base (lib/studio.php, retouch_media).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const url = f => `media/${encodeURIComponent(f)}`;
    const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible')); i.src = src; });
    const rad = d => d * Math.PI / 180;

    /* ═══ 🧩 Panorama : retrouver tout seul où une photo recouvre l'autre ═══
       Les deux photos réduites (gris), on cherche le décalage où leurs parties communes se ressemblent le plus (corrélation
       normalisée : insensible à une différence de lumière), d'abord en tout petit sur tous les décalages possibles, puis de
       plus en plus finement, avec une petite rotation et un petit changement d'échelle. */
    function grayOf(img, k) {
        const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height, W = Math.max(8, Math.round(w0 * k)), H = Math.max(8, Math.round(h0 * k));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', {willReadFrequently: true}); g.imageSmoothingQuality = 'high'; g.filter = 'blur(0.6px)'; g.drawImage(img, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data, a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        return {W, H, a};
    }
    /** Ressemblance (−1 à 1) de B posée sur A : centre de B en (cx, cy) dans A, échelle s, rotation th (radians) */
    function nccAt(A, B, cx, cy, s, th, stride) {
        const c = Math.cos(th) * s, sn = Math.sin(th) * s, bw = B.W / 2, bh = B.H / 2, W1 = A.W - 1, H1 = A.H - 1;
        let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (let v = 0; v < B.H; v += stride) { const dv = v - bh; for (let u = 0; u < B.W; u += stride) { const du = u - bw, x = cx + c * du - sn * dv, y = cy + sn * du + c * dv;
            if (x < 0 || y < 0 || x >= W1 || y >= H1) continue; const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, p = yi * A.W + xi;
            const a = A.a[p] * (1 - fx) * (1 - fy) + A.a[p + 1] * fx * (1 - fy) + A.a[p + A.W] * (1 - fx) * fy + A.a[p + A.W + 1] * fx * fy, b = B.a[v * B.W + u];
            n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; } }
        const frac = n * stride * stride / Math.min(A.W * A.H, B.W * B.H);
        if (frac < 0.08 || n < 30) return {score: -2, ncc: -2, frac};
        const va = n * saa - sa * sa, vb = n * sbb - sb * sb; if (va <= 1e-6 || vb <= 1e-6) return {score: -2, ncc: -2, frac};
        const ncc = (n * sab - sa * sb) / Math.sqrt(va * vb);
        return {score: ncc * (0.85 + 0.15 * Math.min(1, frac / 0.5)), ncc, frac};
    }
    const later = () => new Promise(r => setTimeout(r, 0));
    /** Où poser B sur A : {cx, cy (centre de B dans A, en points de A), s (échelle de B par rapport à A), rot (degrés), score} */
    async function alignPair(imgA, imgB, {s0 = 1} = {}) {
        const big = Math.max(imgA.naturalWidth || imgA.width, imgA.naturalHeight || imgA.height, (imgB.naturalWidth || imgB.width) * s0, (imgB.naturalHeight || imgB.height) * s0);
        const level = side => { const k = Math.min(1, side / big); return {k, A: grayOf(imgA, k), B: grayOf(imgB, k * s0)}; };
        // 1. en tout petit : tous les décalages
        let L = level(84); const cands = [];
        for (let cy = -L.B.H / 2; cy <= L.A.H + L.B.H / 2; cy++) for (let cx = -L.B.W / 2; cx <= L.A.W + L.B.W / 2; cx++) { const r = nccAt(L.A, L.B, cx, cy, 1, 0, 1); if (r.score > -1) cands.push({cx, cy, s: 1, th: 0, score: r.score}); }
        cands.sort((a, b) => b.score - a.score);
        const keep = []; for (const c of cands) { if (keep.every(k => Math.hypot(k.cx - c.cx, k.cy - c.cy) > 3)) keep.push(c); if (keep.length >= 6) break; }
        if (!keep.length) return null;
        await later();
        // 2. puis de plus en plus fin : décalage, rotation, échelle autour des meilleurs
        const refine = (Lv, c, R, step, ths, ss, stride) => { let best = {...c, score: -3};
            for (const s of ss) for (const th of ths) for (let dy = -R; dy <= R + 1e-9; dy += step) for (let dx = -R; dx <= R + 1e-9; dx += step) { const r = nccAt(Lv.A, Lv.B, c.cx + dx, c.cy + dy, c.s * s, c.th + th, stride); if (r.score > best.score) best = {cx: c.cx + dx, cy: c.cy + dy, s: c.s * s, th: c.th + th, score: r.score, ncc: r.ncc}; }
            return best; };
        const deg = d => d * Math.PI / 180, range = (a, b, st) => { const o = []; for (let v = a; v <= b + 1e-9; v += st) o.push(v); return o; };
        let prevK = L.k;
        const up = (c, k) => ({...c, cx: c.cx * k / prevK, cy: c.cy * k / prevK});
        L = level(220); let best = null;
        for (const c of keep) { const r = refine(L, up(c, L.k), 3, 1, range(deg(-4), deg(4), deg(1)), [0.97, 1, 1.03], 2); if (!best || r.score > best.score) best = r; }
        prevK = L.k; await later();
        L = level(600); best = refine(L, up(best, L.k), 2, 0.5, range(deg(-0.75), deg(0.75), deg(0.25)), [0.99, 0.995, 1, 1.005, 1.01], 3);
        prevK = L.k; await later();
        if (big > 600) { L = level(Math.min(1600, big)); best = refine(L, up(best, L.k), 1.5, 0.5, range(deg(-0.15), deg(0.15), deg(0.05)), [1], 4); prevK = L.k; }
        return {cx: best.cx / prevK, cy: best.cy / prevK, s: best.s * s0, rot: best.th * 180 / Math.PI, score: best.score, ncc: best.ncc};
    }
    /** Le plus grand rectangle entièrement couvert (pour rogner les coins vides d'un panorama) : grille de 0/1 → {x, y, w, h} */
    function maxRect(on, W, H) {
        const h = new Int32Array(W); let best = {x: 0, y: 0, w: 0, h: 0, a: 0};
        for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) h[x] = on[y * W + x] ? h[x] + 1 : 0;
            const st = []; for (let x = 0; x <= W; x++) { const cur = x < W ? h[x] : 0; let start = x; while (st.length && st[st.length - 1][1] >= cur) { const [sx, sh] = st.pop(); const a = sh * (x - sx); if (a > best.a) best = {x: sx, y: y - sh + 1, w: x - sx, h: sh, a}; start = sx; } st.push([start, cur]); } }
        return best;
    }
    ext.assembleAlign = alignPair;
    ext.assembleMaxRect = maxRect;

    /** Choisir des photos : la fenêtre unique des médias, en plusieurs (une photo de l'ordinateur y entre et se coche). */
    async function pickImages() {
        const P = window.LCNDA_PICKER; if (!P?.openMediaPicker) { toast('La fenêtre des images n’est pas encore prête. Réessaie dans un instant.', 'error'); return null; }
        const list = await P.openMediaPicker({types: ['image'], multiple: true, eyebrow: 'ASSEMBLER', title: 'Ajouter des photos'});
        return list ? list.map(r => ({src: url(r.filename), name: r.title || r.filename, media: {...r, thumbnail: r.thumbnail || r.filename}})) : null;
    }

    /**
     * Ouvre l'atelier d'assemblage. start : [{id, filename, title}] (médias de la base, facultatif).
     * opts.onSaved(newMediaId) : après l'enregistrement (ex. le recueil pose l'image sur sa page).
     */
    ext.openAssembler = async (start = [], opts = {}) => {
        const layers = [];
        let sel = -1, diff = false, z = 0.3, px = 40, py = 40, dirty = false;
        const addLayer = async (src, name, media = null) => {
            const img = await loadImg(src);
            const prev = layers[layers.length - 1];
            // panorama : les photos d'un même appareil gardent leur échelle ; sinon, la nouvelle prend la largeur de la précédente
            const s = prev ? (opts.pano ? prev.s : Math.min(4, (prev.img.naturalWidth * prev.s) / img.naturalWidth)) : 1;
            layers.push({img, name, media, x: prev ? prev.x + prev.img.naturalWidth * prev.s * 0.55 : img.naturalWidth / 2, y: prev ? prev.y : img.naturalHeight / 2, s, r: 0, o: layers.length ? 0.6 : 1, vis: true});
            sel = layers.length - 1; dirty = true;
        };
        for (const m of start) { try { await addLayer(url(m.filename), m.title || m.filename, m); } catch (e) { toast(e.message, 'error'); } }
        const dl = document.createElement('dialog');
        dl.className = 'modal h-modal h-modal-wide h-avx h-as';
        const UI = window.LCNDA_UI, sec = (title, key, body, open = true) => UI?.panelSection ? UI.panelSection({title, key, open, body}) : `<details ${open ? 'open' : ''}><summary>${esc(title)}</summary>${body}</details>`;
        // E1 : icône · nom · ↶ ↷ · … · ✓ Enregistré · ⚙️ Personnaliser · ⤓ Exporter · 💾 Enregistrer · ⛶ · ×
        dl.innerHTML = `<div class="h-as-head h-rt-topbar"><span class="ui-topbar-icon" aria-hidden="true">🧩</span><input class="ui-topbar-name" data-as-title maxlength="200" aria-label="Titre de l’image assemblée" title="Le titre de l’image assemblée (et le nom des fichiers exportés)" value="${esc(start[0]?.title ? start[0].title + ' (assemblage)' : 'Assemblage')}">
                <span class="ui-topbar-hist"><button type="button" class="icon-button small" data-as-undo disabled title="Annuler (⌘Z)" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-as-redo disabled title="Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z">↷</button></span>
                <span class="spacer"></span><span class="ui-status" data-ui-status data-as-status></span>${ext.tbButton ? ext.tbButton('assemble') : ''}
                <button type="button" class="button small secondary" data-as-export data-ui-cmd="export" title="L’image assemblée : PNG, JPG ou imprimer">⤓ Exporter</button>
                <button type="button" class="button small" data-as-save data-ui-cmd="save" data-shortcut="⌘S" title="Enregistrer l’image assemblée dans les médias, rattachée aux mêmes fiches que la première photo de la base">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('assemble') : ''}<button type="button" class="icon-button" data-as-close aria-label="Fermer" title="Fermer">×</button></div>
            <div class="h-as-body"><div class="h-as-stagewrap"><canvas data-as-canvas></canvas>
                <div class="h-as-hint muted">Clique une photo pour la choisir, glisse pour la déplacer · Maj + molette : taille · Alt + molette : rotation · molette : zoom · flèches : 1 px (Maj : 10 px) · glisse ici une photo de l’ordinateur pour l’ajouter</div></div>
                <aside class="h-as-side">
                    ${sec('Position et taille', 'as-pos', '<div data-as-props></div>')}
                    ${sec('Couleur', 'as-color', '<label class="checkbox-line" data-help="Coché : le fond autour des photos est blanc. Décoché, il reste transparent (seulement en PNG ; le JPG met toujours du blanc)."><input type="checkbox" data-as-bg checked> Fond blanc (sinon transparent en PNG)</label>', false)}
                    ${sec('Effets', 'as-fx', '<div data-as-fx></div><label class="checkbox-line" title="Ce qui se superpose bien devient noir : idéal pour aligner deux photos du même endroit" data-help="Les parties identiques des deux photos deviennent noires : quand l’écriture disparaît presque, elles sont parfaitement alignées."><input type="checkbox" data-as-diff> Mode différence</label>')}
                    ${sec('Photos', 'as-photos', `<div class="h-as-tools" data-tbg="as-tools" data-tbg-label="Boutons des photos"><button type="button" class="button small" data-as-add>＋ Photos</button><button type="button" class="button small secondary" data-as-fit>⤢ Tout voir</button></div>
                        <div class="h-as-autobar"><button type="button" class="button small" data-as-auto title="Panorama, page photographiée en deux fois : chaque photo est posée sur la précédente là où elles se recouvrent (décalage, petite rotation)">🪄 Aligner tout seul</button></div><div class="h-as-layers" data-as-layers></div>`)}
                    ${sec('Image enregistrée', 'as-out', `<div class="h-as-out"><label>Format<select data-as-fmt><option value="image/jpeg">JPEG (léger)</option><option value="image/png">PNG (sans perte)</option></select></label>
                        <label class="checkbox-line" data-help="Là où deux photos se recouvrent, le bord de celle du dessus s’efface en douceur : pas de marche visible au raccord."><input type="checkbox" data-as-feather ${opts.pano ? 'checked' : ''}> Fondre les raccords</label>
                        <label class="h-avx-row"><span>Largeur du fondu</span><input type="range" min="2" max="30" value="8" data-as-fw> <output data-as-fwo>8 %</output></label>
                        <label class="checkbox-line" data-help="Garde le plus grand rectangle entièrement couvert par les photos : plus de coins blancs autour d’un panorama."><input type="checkbox" data-as-crop ${opts.pano ? 'checked' : ''}> Rogner aux parties couvertes (sans coins vides)</label>
                        <p class="muted" data-as-msg></p></div>`, !!opts.pano)}
                </aside></div>`;
        document.body.appendChild(dl);
        const $ = s => dl.querySelector(s), cv = $('[data-as-canvas]'), g = cv.getContext('2d');
        ext.rtEnsureCss?.(); ext.tbApply?.(dl, 'assemble'); UI?.harmonizeTopbar?.(dl.querySelector('.h-as-head')); ext.fullInit?.(dl, 'assemble');
        const close = async () => { if (dirty && layers.length > 1 && !await A().confirmBox('L’assemblage non enregistré sera perdu.', {title: 'Fermer sans enregistrer l’assemblage ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; dl.close(); };
        $('[data-as-close]').addEventListener('click', close);
        dl.dataset.ownClose = '1'; // Échap : l'outil demande lui-même s'il faut (une seule question « Fermer sans enregistrer ? »)
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); close(); });
        dl.addEventListener('close', () => dl.remove());
        dl.showModal();

        // ↶ ↷ : chaque geste (déplacer, taille, rotation, ordre, ajout, retrait…) est une étape
        let steps = [], hpos = -1, tmH = 0;
        const statusEl = $('[data-as-status]');
        const shot = () => layers.map(L => ({L, x: L.x, y: L.y, s: L.s, r: L.r, o: L.o, vis: L.vis}));
        const same = (a, b) => a.length === b.length && a.every((e, i) => e.L === b[i].L && ['x', 'y', 's', 'r', 'o', 'vis'].every(k => e[k] === b[i][k]));
        const syncHist = () => { $('[data-as-undo]').disabled = hpos <= 0; $('[data-as-redo]').disabled = hpos >= steps.length - 1; if (dirty && hpos > 0) UI?.savedStatus?.(statusEl, 'dirty'); else statusEl.textContent = ''; };
        const commit = () => { clearTimeout(tmH); const s0 = shot(); if (hpos >= 0 && same(steps[hpos], s0)) return; steps = steps.slice(0, hpos + 1); steps.push(s0); if (steps.length > 120) steps.shift(); hpos = steps.length - 1; syncHist(); };
        const commitSoon = () => { clearTimeout(tmH); tmH = setTimeout(commit, 350); };
        const goHist = i => { if (i < 0 || i >= steps.length) return; hpos = i; layers.length = 0; steps[i].forEach(e => { Object.assign(e.L, {x: e.x, y: e.y, s: e.s, r: e.r, o: e.o, vis: e.vis}); layers.push(e.L); }); sel = Math.min(sel, layers.length - 1); dirty = true; $('[data-as-props]').dataset.for = ''; draw(); syncHist(); };
        $('[data-as-undo]').addEventListener('click', () => goHist(hpos - 1));
        $('[data-as-redo]').addEventListener('click', () => goHist(hpos + 1));
        const corners = L => { const w = L.img.naturalWidth * L.s / 2, h = L.img.naturalHeight * L.s / 2, c = Math.cos(rad(L.r)), s = Math.sin(rad(L.r));
            return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [L.x + x * c - y * s, L.y + x * s + y * c]); };
        const bounds = (only = layers.filter(l => l.vis)) => { const pts = only.flatMap(corners); if (!pts.length) return {x0: 0, y0: 0, x1: 1, y1: 1}; return {x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1]))}; };
        const drawLayers = (ctx, forExport = false) => layers.forEach((L, i) => { if (!L.vis) return;
            ctx.save(); ctx.globalAlpha = forExport ? (L.o >= 0.99 ? 1 : L.o) : L.o; ctx.globalCompositeOperation = !forExport && diff && i > 0 ? 'difference' : 'source-over';
            ctx.translate(L.x, L.y); ctx.rotate(rad(L.r)); ctx.scale(L.s, L.s); ctx.drawImage(L.img, -L.img.naturalWidth / 2, -L.img.naturalHeight / 2); ctx.restore(); });
        function draw() {
            const dpr = window.devicePixelRatio || 1, W = cv.clientWidth * dpr, H = cv.clientHeight * dpr; if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
            g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, W, H);
            g.setTransform(z * dpr, 0, 0, z * dpr, px * dpr, py * dpr);
            if (layers.length) { const b = bounds(); g.fillStyle = '#fff'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
            drawLayers(g);
            const L = layers[sel];
            if (L) { const c = corners(L); g.strokeStyle = '#2f8cff'; g.lineWidth = 2 / z; g.setLineDash([8 / z, 6 / z]); g.beginPath(); c.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); g.setLineDash([]); }
            paintLayers(); paintProps();
        }
        const fit = () => { if (!layers.length) return; const b = bounds(), W = cv.clientWidth, H = cv.clientHeight; z = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0)) * 0.9; px = (W - (b.x1 - b.x0) * z) / 2 - b.x0 * z; py = (H - (b.y1 - b.y0) * z) / 2 - b.y0 * z; draw(); };
        function paintLayers() {
            $('[data-as-layers]').innerHTML = layers.length ? layers.map((L, i) => `<div class="h-as-layer ${i === sel ? 'is-sel' : ''}" data-as-l="${i}"><button type="button" class="icon-button" data-as-vis title="${L.vis ? 'Cacher' : 'Montrer'}">${L.vis ? '👁' : '🚫'}</button>
                <span class="h-as-lname" title="${esc(L.name)}">${i + 1}. ${esc(L.name)}</span><span class="h-rb-tools"><button type="button" class="icon-button" data-as-up title="Mettre devant" ${i === layers.length - 1 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button" data-as-down title="Mettre derrière" ${i ? '' : 'disabled'}>↓</button><button type="button" class="icon-button danger" data-as-del title="Retirer">🗑</button></span></div>`).reverse().join('')
                : A().emptyState({icon: '🧩', text: 'Aucune photo à assembler pour l’instant', hint: '« ＋ Photos », ou glisse une photo de l’ordinateur sur le plan de travail.'});
        }
        function paintProps() {
            const L = layers[sel], box = $('[data-as-props]'), fx = $('[data-as-fx]');
            if (!L) { box.innerHTML = '<p class="muted">Clique une photo pour la régler.</p>'; fx.innerHTML = ''; box.dataset.for = ''; return; }
            const row = (k, label, min, max, step, val, unit, help = '') => `<label class="h-avx-row"><span${help ? ` data-help="${esc(help)}"` : ''}>${label}</span><input type="range" data-as-p="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" data-as-n="${k}" min="${min}" max="${max}" step="${step}" value="${Math.round(val * 100) / 100}" class="h-as-num">${unit}</label>`;
            if (box.dataset.for === String(sel) && (box.contains(document.activeElement) || fx.contains(document.activeElement))) { [box, fx].forEach(bx => bx.querySelectorAll('[data-as-p],[data-as-n]').forEach(el => { if (el !== document.activeElement) { const k = el.dataset.asP || el.dataset.asN; el.value = k === 'o' ? Math.round(L.o * 100) : k === 's' ? Math.round(L.s * 1000) / 10 : Math.round(L.r * 10) / 10; } })); return; }
            box.dataset.for = String(sel);
            box.innerHTML = `<h4>${esc(L.name)}</h4>${row('s', 'Taille', 2, 400, 0.1, Math.round(L.s * 1000) / 10, '%', 'La taille de la photo par rapport à ses vrais points : pour mettre deux photos à la même échelle.')}${row('r', 'Rotation', -180, 180, 0.1, Math.round(L.r * 10) / 10, '°')}
                <div class="h-avx-row"><button type="button" class="button small secondary" data-as-rot="-90">⟲ 90°</button><button type="button" class="button small secondary" data-as-rot="90">⟳ 90°</button></div>`;
            fx.innerHTML = `${row('o', 'Opacité', 5, 100, 1, Math.round(L.o * 100), '%', 'À moitié transparente, la photo du dessus laisse voir celle du dessous : on aligne les écritures.')}
                <div class="h-avx-row"><button type="button" class="button small secondary" data-as-opaque>Opaque</button><button type="button" class="button small secondary" data-as-half>À moitié transparente</button></div>
                <p class="muted">Pour mettre deux photos à la même échelle : rends celle du dessus à moitié transparente (ou coche « Mode différence »), puis ajuste sa taille et sa rotation jusqu’à ce que les écritures se superposent.</p>`;
        }
        const setProp = (k, v) => { const L = layers[sel]; if (!L || !isFinite(v)) return; if (k === 'o') L.o = Math.max(0.05, Math.min(1, v / 100)); if (k === 's') { L.s = Math.max(0.02, Math.min(4, v / 100)); } if (k === 'r') L.r = Math.max(-180, Math.min(180, v)); dirty = true; draw(); };
        const side = $('.h-as-side');
        side.addEventListener('input', e => { const k = e.target.dataset.asP || e.target.dataset.asN; if (k) { setProp(k, Number(e.target.value)); commitSoon(); } });
        side.addEventListener('click', e => { const L = layers[sel]; if (!L) return; const r = e.target.closest('[data-as-rot]');
            if (r) { L.r = ((L.r + Number(r.dataset.asRot) + 540) % 360) - 180; } if (e.target.closest('[data-as-opaque]')) L.o = 1; if (e.target.closest('[data-as-half]')) L.o = 0.5;
            if (r || e.target.closest('[data-as-opaque],[data-as-half]')) { $('[data-as-props]').dataset.for = ''; dirty = true; draw(); commit(); } });
        $('[data-as-layers]').addEventListener('click', e => { const row = e.target.closest('[data-as-l]'); if (!row) return; const i = Number(row.dataset.asL);
            if (e.target.closest('[data-as-vis]')) layers[i].vis = !layers[i].vis;
            else if (e.target.closest('[data-as-up]') && i < layers.length - 1) { [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]]; sel = i + 1; }
            else if (e.target.closest('[data-as-down]') && i > 0) { [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]]; sel = i - 1; }
            else if (e.target.closest('[data-as-del]')) { layers.splice(i, 1); sel = Math.min(sel, layers.length - 1); }
            else sel = i;
            $('[data-as-props]').dataset.for = ''; dirty = true; draw(); commit(); });
        $('[data-as-add]').addEventListener('click', async () => { const list = await pickImages(); if (!list) return; for (const it of list) { try { await addLayer(it.src, it.name, it.media); } catch (e) { toast(e.message, 'error'); } } fit(); commit(); if (opts.pano && layers.length > 1) autoAlign(); });
        // E4 : des photos glissées (ou collées) sur le plan de travail entrent dans les médias puis s'ajoutent
        UI?.bindFileDrop?.($('.h-as-stagewrap'), async files => {
            for (const f of files) { try { const r = await ext.rtImportImage(f); const t = f.name.replace(/\.[a-z0-9]{2,5}$/i, ''); await addLayer(url(r.filename), t, {id: r.media_id, filename: r.filename, title: t, thumbnail: r.filename}); } catch (e) { toast(e.message, 'error'); } }
            fit(); commit();
        }, {accept: 'image/*'});
        $('[data-as-fit]').addEventListener('click', fit);
        $('[data-as-diff]').addEventListener('change', e => { diff = e.target.checked; draw(); });
        // souris : choisir, déplacer ; molette : zoom, taille, rotation
        const world = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - px) / z, (e.clientY - r.top - py) / z]; };
        const hit = ([wx, wy]) => { for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; if (!L.vis) continue; const c = Math.cos(-rad(L.r)), s = Math.sin(-rad(L.r)), dx = wx - L.x, dy = wy - L.y, lx = (dx * c - dy * s) / L.s, ly = (dx * s + dy * c) / L.s; if (Math.abs(lx) <= L.img.naturalWidth / 2 && Math.abs(ly) <= L.img.naturalHeight / 2) return i; } return -1; };
        cv.addEventListener('pointerdown', e => {
            cv.setPointerCapture(e.pointerId); const p0 = world(e), i = hit(p0), sx = e.clientX, sy = e.clientY, opx = px, opy = py;
            if (i >= 0 && i !== sel) { sel = i; $('[data-as-props]').dataset.for = ''; draw(); }
            const L = layers[sel], ox = L?.x, oy = L?.y, moveLayer = i >= 0 && i === sel;
            const move = ev => { if (moveLayer) { const p = world(ev); L.x = ox + p[0] - p0[0]; L.y = oy + p[1] - p0[1]; dirty = true; } else { px = opx + ev.clientX - sx; py = opy + ev.clientY - sy; } draw(); };
            const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); if (moveLayer) commit(); };
            cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
        });
        cv.addEventListener('wheel', e => { e.preventDefault(); const L = layers[sel];
            if (e.shiftKey && L) { L.s = Math.max(0.02, Math.min(4, L.s * (e.deltaY > 0 ? 0.99 : 1.01))); dirty = true; }
            else if (e.altKey && L) { L.r = Math.max(-180, Math.min(180, L.r + (e.deltaY > 0 ? -0.1 : 0.1) * (e.ctrlKey ? 10 : 1))); dirty = true; }
            if ((e.shiftKey || e.altKey) && L) commitSoon();
            else { const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY > 0 ? 0.9 : 1.1; px = mx - (mx - px) * f; py = my - (my - py) * f; z *= f; }
            draw(); }, {passive: false});
        dl.addEventListener('keydown', e => { if (e.target.closest('input:not([type=range]):not([type=checkbox]), textarea, select')) return;
            const mod = (e.metaKey || e.ctrlKey) && !e.altKey, k = e.key.toLowerCase();
            if (mod && k === 'z') { e.preventDefault(); e.stopPropagation(); goHist(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (mod && k === 's') { e.preventDefault(); e.stopPropagation(); $('[data-as-save]').click(); return; }
            const L = layers[sel]; if (!L || e.target.closest('input')) return; const st = e.shiftKey ? 10 : 1;
            const mv = {ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st]}[e.key]; if (mv) { e.preventDefault(); L.x += mv[0]; L.y += mv[1]; dirty = true; draw(); commitSoon(); } });
        // résultat
        function renderCanvas(fmt = $('[data-as-fmt]').value) {
            const vis = layers.filter(l => l.vis); if (!vis.length) throw new Error('Aucune photo visible.');
            const b = bounds(vis), W = Math.ceil(b.x1 - b.x0), H = Math.ceil(b.y1 - b.y0);
            if (W * H > 140e6 || W > 16000 || H > 16000) throw new Error(`Image trop grande (${W} × ${H} points) : réduis la taille des photos.`);
            const out = document.createElement('canvas'); out.width = W; out.height = H; const c = out.getContext('2d');
            const feather = $('[data-as-feather]').checked && vis.length > 1, cropOn = $('[data-as-crop]').checked;
            const place = (ctx, L) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(-b.x0, -b.y0); ctx.translate(L.x, L.y); ctx.rotate(rad(L.r)); ctx.scale(L.s, L.s); };
            // ce que couvrent les photos (pour fondre les raccords et rogner les coins vides)
            const cov = document.createElement('canvas'); cov.width = W; cov.height = H; const cg = cov.getContext('2d', {willReadFrequently: true}); cg.fillStyle = '#000';
            if (!feather) { c.translate(-b.x0, -b.y0); drawLayers(c, true); c.setTransform(1, 0, 0, 1, 0, 0); }
            vis.forEach((L, i) => {
                const iw = L.img.naturalWidth, ih = L.img.naturalHeight;
                if (feather) {
                    const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d', {willReadFrequently: true});
                    place(tg, L); tg.globalAlpha = L.o >= 0.99 ? 1 : L.o; tg.drawImage(L.img, -iw / 2, -ih / 2);
                    if (i > 0) { // le bord de cette photo s'efface là où elle recouvre celles du dessous
                        const rk = Math.min(1, 400 / Math.max(iw, ih)), rw = Math.max(2, Math.round(iw * rk)), rh = Math.max(2, Math.round(ih * rk)), F = Math.max(1, Math.min(rw, rh) * Number($('[data-as-fw]').value) / 100);
                        const ramp = document.createElement('canvas'); ramp.width = rw; ramp.height = rh; const rg = ramp.getContext('2d'), rd = rg.createImageData(rw, rh);
                        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const d = Math.min(x + 0.5, rw - x - 0.5, y + 0.5, rh - y - 0.5); rd.data[(y * rw + x) * 4 + 3] = Math.round(255 * Math.min(1, d / F)); }
                        rg.putImageData(rd, 0, 0);
                        const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d', {willReadFrequently: true}); place(mg, L); mg.imageSmoothingQuality = 'high'; mg.drawImage(ramp, -iw / 2, -ih / 2, iw, ih);
                        const td = tg.getImageData(0, 0, W, H), md = mg.getImageData(0, 0, W, H).data, cd = cg.getImageData(0, 0, W, H).data;
                        for (let p = 3; p < td.data.length; p += 4) if (td.data[p] && cd[p]) td.data[p] = td.data[p] * md[p] / 255;
                        tg.setTransform(1, 0, 0, 1, 0, 0); tg.putImageData(td, 0, 0);
                    }
                    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(t, 0, 0);
                }
                place(cg, L); cg.fillRect(-iw / 2, -ih / 2, iw, ih);
            });
            if (feather && ($('[data-as-bg]').checked || fmt === 'image/jpeg')) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
            else if (!feather && ($('[data-as-bg]').checked || fmt === 'image/jpeg')) { c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
            if (cropOn && vis.length) { // le plus grand rectangle sans coin vide
                const k = Math.min(1, 600 / Math.max(W, H)), sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k));
                const s = document.createElement('canvas'); s.width = sw; s.height = sh; const sg = s.getContext('2d', {willReadFrequently: true}); sg.drawImage(cov, 0, 0, sw, sh);
                const sd = sg.getImageData(0, 0, sw, sh).data, on = new Uint8Array(sw * sh); for (let p = 0; p < on.length; p++) on[p] = sd[p * 4 + 3] > 250 ? 1 : 0;
                const r = maxRect(on, sw, sh);
                if (r.w > 2 && r.h > 2 && r.w * r.h < sw * sh * 0.999) {
                    const x0 = Math.ceil((r.x + 0.5) / k), y0 = Math.ceil((r.y + 0.5) / k), x1 = Math.floor((r.x + r.w - 0.5) / k), y1 = Math.floor((r.y + r.h - 0.5) / k);
                    const o2 = document.createElement('canvas'); o2.width = Math.max(1, x1 - x0); o2.height = Math.max(1, y1 - y0); o2.getContext('2d').drawImage(out, x0, y0, o2.width, o2.height, 0, 0, o2.width, o2.height); return o2;
                }
            }
            return out;
        }
        /** 🪄 Aligner tout seul : chaque photo (dans l'ordre de la liste) est posée sur la précédente */
        async function autoAlign() {
            if (layers.length < 2) return toast('Ajoute au moins deux photos qui se recouvrent (« ＋ Photos »).', 'error');
            const btn = $('[data-as-auto]'), msg = $('[data-as-msg]'); btn.disabled = true; const label = btn.textContent;
            let done = 0, weak = [];
            try {
                for (let i = 1; i < layers.length; i++) {
                    btn.textContent = `Recherche… (${i}/${layers.length - 1})`; await new Promise(r => setTimeout(r, 20));
                    const A0 = layers[i - 1], B = layers[i], r = await alignPair(A0.img, B.img, {s0: B.s / A0.s});
                    if (!r || r.ncc < 0.3) { weak.push(B.name); continue; }
                    const dx = (r.cx - A0.img.naturalWidth / 2) * A0.s, dy = (r.cy - A0.img.naturalHeight / 2) * A0.s, c = Math.cos(rad(A0.r)), s = Math.sin(rad(A0.r));
                    B.x = A0.x + dx * c - dy * s; B.y = A0.y + dx * s + dy * c; B.s = A0.s * r.s; B.r = A0.r + r.rot; B.o = 1; done++;
                    if (msg) msg.textContent = `« ${B.name} » : décalage ${Math.round(r.cx - A0.img.naturalWidth / 2)} × ${Math.round(r.cy - A0.img.naturalHeight / 2)} points, rotation ${r.rot.toFixed(2).replace('.', ',')}°, ressemblance ${Math.round(r.ncc * 100)} %.`;
                    dl.dataset.lastAlign = JSON.stringify({cx: r.cx, cy: r.cy, rot: r.rot, s: r.s, ncc: r.ncc});
                }
            } finally { btn.disabled = false; btn.textContent = label; }
            dirty = true; $('[data-as-props]').dataset.for = ''; fit(); commit();
            if (weak.length) toast(`Pas de partie commune sûre pour ${weak.map(n => `« ${n} »`).join(', ')} : place-la à la main (glisser, flèches ; « Mode différence » pour vérifier).`, 'error');
            else toast(`${done > 1 ? 'Photos alignées' : 'Photo alignée'} : vérifie (glisser, flèches pour ajuster). « Fondre les raccords » adoucit la jonction à l’enregistrement.`);
        }
        $('[data-as-auto]').addEventListener('click', autoAlign);
        $('[data-as-fw]').addEventListener('input', e => { $('[data-as-fwo]').textContent = e.target.value + ' %'; });
        async function render() {
            const fmt = $('[data-as-fmt]').value, out = renderCanvas(fmt), W = out.width, H = out.height;
            const blob = await new Promise(r => out.toBlob(r, fmt, 0.93)); if (!blob) throw new Error('Le navigateur n’a pas pu créer l’image.');
            return {blob, ext: fmt === 'image/png' ? 'png' : 'jpg', W, H};
        }
        // ⤓ Exporter (E3) : la fenêtre unique (PNG, JPG, imprimer) ; une copie peut aller dans les médias
        $('[data-as-export]').addEventListener('click', () => { if (!layers.some(l => l.vis)) return toast('Aucune photo visible.', 'error'); const title = $('[data-as-title]').value.trim() || 'Assemblage';
            ext.rtExportImage?.({title, mediaId: layers.find(l => l.media?.id)?.media.id || 0, copyTitle: title, png: !$('[data-as-bg]').checked, render: async () => renderCanvas('image/png')}); });
        $('[data-as-save]').addEventListener('click', async () => {
            const base = layers.find(l => l.media?.id);
            if (!base) return toast('Pour enregistrer dans la base, l’une des photos doit venir de la base (sinon : ⬇ Télécharger).', 'error');
            const msg = $('[data-as-msg]'), btn = $('[data-as-save]'); btn.disabled = true; msg.textContent = 'Création de l’image…'; UI?.savedStatus?.(statusEl, 'saving');
            try {
                const r = await render();
                msg.textContent = `Envoi (${r.W} × ${r.H} points, ${(r.blob.size / 1048576).toFixed(1)} Mo)…`;
                const fd = new FormData(); fd.append('file', r.blob, 'assemblage.' + r.ext); fd.append('media_id', base.media.id); fd.append('mode', 'copy'); fd.append('show', '0'); fd.append('title', $('[data-as-title]').value.trim() || 'Assemblage');
                const res = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
                const j = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!res.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                toast('Image assemblée enregistrée, rattachée aux mêmes fiches que « ' + base.name + ' ». Les photos d’origine restent.');
                dirty = false; dl.close();
                await opts.onSaved?.(j.result.media_id);
                if (!opts.onSaved) ext.refreshView?.();
            } catch (e) { toast(e.message, 'error'); msg.textContent = ''; btn.disabled = false; UI?.savedStatus?.(statusEl, 'error'); }
        });
        requestAnimationFrame(() => { fit(); draw(); commit(); });
        if (!layers.length || (opts.pano && layers.length < 2)) $('[data-as-add]').click();
        else if (opts.pano) setTimeout(autoAlign, 60);
    };

    // Visionneuse : « 🧩 Assembler » part de la photo affichée
    document.addEventListener('click', e => {
        if (!e.target.closest('#assemble-media')) return;
        const st = S(), item = st.lightboxMedia?.[st.lightboxIndex];
        if (!item) return;
        A().$('#lightbox')?.close();
        ext.openAssembler([item]);
    });
})();
