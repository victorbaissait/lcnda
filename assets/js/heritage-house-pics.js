/* LCNDA — 🏠 Plan de maison : 🖼 les images des tableaux, des toiles et des cadres (complète heritage-house.js et heritage-house3d.js).
 *  - les objets qui portent une image (cadres photo, tableaux, mur de cadres — une image par cadre —, affiches, miroirs, chevalets,
 *    toiles posées au sol ou contre un mur, carte murale, diplôme, photo sur pied…) gardent seulement le numéro du média et ses réglages
 *    dans « pics » : [{m, fit, zoom, px, py, rot, matW, matColor, frameW, frameColor}] (une entrée par cadre) — jamais l'image elle-même ;
 *  - panneau Propriétés → section « 🖼 Image » : le champ standard (mediaField : pastille, « 🖼 Changer », ×, « ↗ Ouvrir ») qui ouvre la
 *    fenêtre unique openMediaPicker, filtrée sur le premier habitant de la maison ; ou un souvenir de l'objet ; réglages : remplir / ajuster /
 *    centrer, recadrage (glisser et molette dans l'aperçu), rotation de 90°, marie-louise et cadre (couleur, largeur) quand c'est utile ;
 *  - 📁 E4 : une image glissée sur l'objet (plan 2D ou vue 3D) entre dans les médias et se pose dessus ;
 *  - en 3D : une texture à la bonne proportion (1024 px au plus, mipmaps), éclairée comme le reste ; image introuvable → toile neutre ;
 *  - en 2D : un petit aperçu vu de dessus quand c'est lisible (chevalet, toile au sol), sinon une petite marque 🖼.
 * Les formes 3D posent leurs emplacements d'image avec ext.housePics.slot(T, groupe, {w, h, x, y, z, rx, ry, rz, i}).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const PK = () => window.LCNDA_PICKER || A();
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A()?.toast?.(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const num = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, a, b) : d; };
    const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    const MAX_SLOTS = 12, MAX_PX = 1024;

    /* ═════════ Quels objets portent une image ═════════
       forme 3D → {n: nombre d'images, est: taille de l'image (cm) d'après l'objet, mat: marie-louise utile, frame: cadre peint utile, flat: posée à plat} */
    const SHAPES = {
        frame: {n: 1, est: it => [it.w * .86, (it.h || 60) * .86], mat: true},
        mirror: {n: 1, est: it => [it.w * .86, (it.h || 60) * .86], mat: true},
        easel: {n: 1, est: it => [it.w * .8, (it.h || 180) * .35], frame: true},
        xpainting: {n: 1, est: it => [it.w * .88, (it.h || 60) * .85], mat: true},
        xframes: {n: 6, est: it => [it.w * .22, (it.h || 90) * .4], mat: true},
        xframestand: {n: 1, est: it => [it.w * .8, (it.h || 24) * .8], mat: true}
    };
    const register = (shape, o) => { if (typeof shape === 'string' && o && o.n > 0) SHAPES[shape] = {n: Math.min(MAX_SLOTS, o.n), est: o.est || (it => [it.w * .9, (it.h || 60) * .9]), mat: !!o.mat, frame: !!o.frame, flat: !!o.flat}; };
    const libOf = k => ext.houseLib?.libOf?.(k);
    const shapeOf = it => { if (!it || it.img || it.model) return ''; const L = libOf(it.kind); return it.s3 || L?.[8] || L?.[7] || ''; };
    const infoOf = it => { const k = shapeOf(it), x = SHAPES[k] || ext.housePicShapesX?.[k]; if (!x || !(x.n > 0)) return null; return {n: Math.min(MAX_SLOTS, x.n), est: x.est || (o => [o.w * .9, (o.h || 60) * .9]), mat: !!x.mat, frame: !!x.frame, flat: !!x.flat}; }; // ext.housePicShapesX : les formes des autres fichiers (heritage-house-metiers.js)
    const count = it => infoOf(it)?.n || 0;

    /* ═════════ Les réglages d'une image (nettoyés à chaque lecture) ═════════ */
    const FITS = [['fill', 'Remplir (recadrer)'], ['fit', 'Ajuster (toute l’image)'], ['center', 'Centrer (taille réelle)']];
    function clean(p) {
        if (!p || typeof p !== 'object') return null; const m = Math.round(Number(p.m)); if (!(m > 0 && m < 1e9)) return null;
        return {m, fit: FITS.some(f => f[0] === p.fit) ? p.fit : 'fill', zoom: num(p.zoom, 100, 400, 100), px: num(p.px, -100, 100, 0), py: num(p.py, -100, 100, 0), rot: [0, 90, 180, 270].includes(Number(p.rot)) ? Number(p.rot) : 0,
            matW: num(p.matW, 0, 30, 0), matColor: isHex(p.matColor) ? p.matColor : '#f4efe4', frameW: num(p.frameW, 0, 20, 0), frameColor: isHex(p.frameColor) ? p.frameColor : '#6a4026'};
    }
    const get = (it, i = 0) => clean(Array.isArray(it?.pics) ? it.pics[i] : null);
    const has = (it, i = 0) => !!get(it, i);
    function put(it, i, p) {
        const n = count(it); if (!it || i < 0 || i >= Math.max(1, n)) return;
        const list = Array.isArray(it.pics) ? it.pics.slice(0, MAX_SLOTS) : []; while (list.length <= i) list.push(null);
        list[i] = p ? clean(p) : null; while (list.length && !list[list.length - 1]) list.pop();
        if (list.length) it.pics = list; else delete it.pics;
    }

    /* ═════════ Les images des médias : lues une fois, réduites à 1024 px ═════════ */
    const fileOk = f => typeof f === 'string' && f.length < 300 && !/[\\/]/.test(f) && !/^\./.test(f) && !/[\0-\x1f]/.test(f);
    const isImage = it => it && (/^image/.test(String(it.media_type || '')) || it.sort === 'photo' || (!it.media_type && /\.(jpe?g|png|webp|gif)$/i.test(it.filename || '')));
    const urlOf = it => isImage(it) && fileOk(it.filename) ? `media/${encodeURIComponent(it.filename)}` : '';
    const thumbOf = it => { const t = String(it?.thumb || ''); return /^media\/[\w.%()-]+$/.test(t) ? t : urlOf(it); };
    const SRC = new Map(), META = new Map();
    const loadImg = src => new Promise((ok, ko) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = () => ko(new Error('Image illisible.')); im.src = src; });
    function source(id) {
        id = Math.round(Number(id)); if (!(id > 0)) return Promise.reject(new Error('Pas d’image.'));
        if (!SRC.has(id)) {
            const pr = (async () => {
                const [it] = await PK().loadMedia([id]); if (!it) throw new Error('introuvable'); META.set(id, it);
                const url = urlOf(it); if (!url) throw new Error('introuvable');
                const im = await loadImg(url), w0 = im.naturalWidth || 1, h0 = im.naturalHeight || 1, k = Math.min(1, MAX_PX / Math.max(w0, h0));
                const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
                const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
                return {canvas: c, w0, h0, item: it};
            })();
            pr.catch(() => {}); SRC.set(id, pr);
            if (SRC.size > 200) SRC.delete(SRC.keys().next().value);
        }
        return SRC.get(id);
    }
    const ready = new Map(); // id → {canvas…} une fois lue (pour le dessin 2D, qui ne peut pas attendre) ; false = introuvable
    const want = id => { if (ready.has(id)) return ready.get(id); ready.set(id, null); source(id).then(s => { ready.set(id, s); later2d(); }, () => { ready.set(id, false); later2d(); }); return null; };

    /* ═════════ Composer l'image dans son cadre : cadre peint, marie-louise, image (remplir, ajuster, centrer, zoom, décalage, rotation) ═════════ */
    const LINEN = '#e9e4da';
    function compose(src, p, wcm, hcm, maxPx, out = null) {
        const k = maxPx / Math.max(wcm, hcm, 1), CW = Math.max(16, Math.round(wcm * k)), CH = Math.max(16, Math.round(hcm * k));
        const c = out || document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d');
        const lim = Math.min(CW, CH) * .3, fw = Math.min(lim, p.frameW * k), mw = Math.min(lim, p.matW * k);
        g.fillStyle = LINEN; g.fillRect(0, 0, CW, CH);
        if (fw > .5) { g.fillStyle = p.frameColor; g.fillRect(0, 0, CW, CH); // le cadre peint, avec un léger relief
            g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(CW, 0); g.lineTo(CW - fw, fw); g.lineTo(fw, fw); g.lineTo(fw, CH - fw); g.lineTo(0, CH); g.fill();
            g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(CW, CH); g.lineTo(0, CH); g.lineTo(fw, CH - fw); g.lineTo(CW - fw, CH - fw); g.lineTo(CW - fw, fw); g.lineTo(CW, 0); g.fill(); }
        const x1 = fw, y1 = fw, w1 = CW - 2 * fw, h1 = CH - 2 * fw;
        g.fillStyle = mw > .5 ? p.matColor : LINEN; g.fillRect(x1, y1, w1, h1);
        const ix = x1 + mw, iy = y1 + mw, iw = Math.max(4, w1 - 2 * mw), ih = Math.max(4, h1 - 2 * mw);
        if (src) {
            const sw = src.canvas.width, sh = src.canvas.height, turned = p.rot % 180 !== 0, rw = turned ? sh : sw, rh = turned ? sw : sh;
            let s = p.fit === 'fill' ? Math.max(iw / rw, ih / rh) : Math.min(iw / rw, ih / rh);
            if (p.fit === 'center') { const realCm = (turned ? src.h0 : src.w0) / 150 * 2.54; s = Math.min(s, realCm * k / rw); } // à 150 ppp : une petite photo reste petite
            s *= p.zoom / 100;
            const dw = rw * s, dh = rh * s, cx = ix + iw / 2 + p.px / 100 * Math.max(iw, dw) / 2, cy = iy + ih / 2 + p.py / 100 * Math.max(ih, dh) / 2;
            g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip(); g.translate(cx, cy); g.rotate(p.rot * Math.PI / 180); g.imageSmoothingQuality = 'high'; g.drawImage(src.canvas, -sw * s / 2, -sh * s / 2, sw * s, sh * s); g.restore();
        }
        if (mw > .5) { g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, k * .15); g.strokeRect(ix, iy, iw, ih); } // le biseau de la marie-louise
        return c;
    }
    /** la toile neutre (en attendant l'image, ou si elle est introuvable) */
    function neutral(missing, W = 256, H = 192) {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = LINEN; g.fillRect(0, 0, W, H);
        for (let i = 0; i < W; i += 4) { g.fillStyle = 'rgba(0,0,0,.035)'; g.fillRect(i, 0, 1, H); } for (let j = 0; j < H; j += 4) { g.fillStyle = 'rgba(0,0,0,.03)'; g.fillRect(0, j, W, 1); }
        if (missing) { g.fillStyle = '#8a7d6a'; g.textAlign = 'center'; g.font = `${Math.round(H * .2)}px system-ui, sans-serif`; g.fillText('🖼', W / 2, H * .48); g.font = `${Math.round(H * .085)}px system-ui, sans-serif`; g.fillText('Image introuvable', W / 2, H * .7); }
        return c;
    }

    /* ═════════ 3D : une texture par image et par réglage (gardée, 120 au plus) ═════════ */
    const TEX = new Map(); let neutralMat = null, missingMat = null; const warned = new Set();
    const keyOf = (p, w, h) => [p.m, p.fit, p.zoom, p.px, p.py, p.rot, p.matW, p.matColor, p.frameW, p.frameColor, Math.round(w * 1000), Math.round(h * 1000)].join('|');
    const texOpts = (T, t) => { t.colorSpace = T.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.anisotropy = 4; return t; };
    const picMat = (T, t) => new T.MeshStandardMaterial({map: t, roughness: .82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    function matFor(T, p, wm, hm) {
        const key = keyOf(p, wm, hm); if (TEX.has(key)) { const e = TEX.get(key); TEX.delete(key); TEX.set(key, e); return e.pr; }
        const pr = source(p.m).then(src => { const maxPx = clamp(Math.round(Math.max(wm, hm) * 1100), 256, MAX_PX), c = compose(src, p, wm * 100, hm * 100, maxPx); return picMat(T, texOpts(T, new T.CanvasTexture(c))); });
        pr.catch(() => {}); TEX.set(key, {pr});
        while (TEX.size > 120) { const [k0, e0] = TEX.entries().next().value; TEX.delete(k0); e0.pr.then(m => { m.map?.dispose(); m.dispose(); }, () => {}); }
        return pr;
    }
    /** les emplacements d'image posés par les formes : un repère invisible, tourné comme la toile (l'image regarde son +z) */
    function slot(T, parent, {w, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, i = 0} = {}) {
        if (!T || !parent || !(w > 0) || !(h > 0)) return null;
        const o = new T.Object3D(); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.userData.picSlot = {w, h, i: Math.max(0, Math.min(MAX_SLOTS - 1, i | 0))}; parent.add(o); return o;
    }
    function decorate(T, g, it) {
        if (!Array.isArray(it?.pics) || !it.pics.length) return;
        const marks = []; g.traverse(o => { if (o.userData?.picSlot) marks.push(o); });
        marks.forEach(mk => { const {w, h, i} = mk.userData.picSlot, p = get(it, i); if (!p) return;
            neutralMat ??= picMat(T, texOpts(T, new T.CanvasTexture(neutral(false))));
            const me = new T.Mesh(new T.PlaneGeometry(w, h), neutralMat); me.position.z = .0012; me.receiveShadow = true; me.userData.picOf = i; mk.add(me);
            matFor(T, p, w, h).then(m => { me.material = m; }, () => { missingMat ??= picMat(T, texOpts(T, new T.CanvasTexture(neutral(true)))); me.material = missingMat;
                if (!warned.has(p.m)) { warned.add(p.m); toast(`L’image du média n° ${p.m} est introuvable : une toile neutre la remplace.`); } });
        });
    }

    /* ═════════ 2D : un aperçu vu de dessus (si l'objet est assez grand), sinon une marque 🖼 ═════════ */
    const THUMB = new Map();
    function thumbUrl(it, i, p) {
        const s = ready.get(p.m); if (!s) return s === false ? '' : (want(p.m), null);
        const [wcm, hcm] = (infoOf(it)?.est || (x => [x.w, x.d]))(it), key = keyOf(p, wcm, hcm);
        if (!THUMB.has(key)) { try { THUMB.set(key, compose(s, p, wcm, hcm, 128).toDataURL('image/jpeg', .8)); } catch (_) { THUMB.set(key, ''); } if (THUMB.size > 300) THUMB.delete(THUMB.keys().next().value); }
        return THUMB.get(key);
    }
    function sym2d(it) {
        const inf = infoOf(it); if (!inf || !Array.isArray(it.pics)) return '';
        const ps = it.pics.map((_, i) => get(it, i)).filter(Boolean); if (!ps.length) return '';
        const w = Number(it.w) || 10, d = Number(it.d) || 10;
        if (Math.min(w, d) >= 25 && inf.n === 1) { // lisible vu de dessus : l'image, à sa proportion, dans l'objet
            const p = ps[0], url = thumbUrl(it, 0, p); const [ew, eh] = inf.flat ? [w, d] : inf.est(it), r = Math.min(w * .84 / ew, d * .84 / eh), iw = ew * r, ih = eh * r;
            if (url) return `<image href="${esc(url)}" x="${-iw / 2}" y="${-ih / 2}" width="${iw}" height="${ih}" preserveAspectRatio="none" opacity=".95"/><rect x="${-iw / 2}" y="${-ih / 2}" width="${iw}" height="${ih}" fill="none" stroke="#3a3530" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
        }
        const fs = clamp(Math.min(w, 30) * .45, 7, 16); // la marque 🖼 (avec le nombre d'images d'un mur de cadres)
        return `<g class="h-hs-picmk" transform="translate(${w / 2 - fs * .3} ${-d / 2 - fs * .55})"><circle r="${fs * .62}" fill="#fff" stroke="#2a7de1" stroke-width="1.2" vector-effect="non-scaling-stroke"/><text font-size="${fs * .78}" text-anchor="middle" dominant-baseline="central">🖼</text>${ps.length > 1 ? `<text x="${fs * .8}" y="${-fs * .5}" font-size="${fs * .6}" fill="#2a7de1" font-weight="700">${ps.length}</text>` : ''}</g>`;
    }

    /* ═════════ Le panneau : section « 🖼 Image » ═════════ */
    let ED = null, busyF = false, slotSel = new Map(), r2d = 0;
    const later2d = () => { if (!ED || r2d) return; r2d = requestAnimationFrame(() => { r2d = 0; if (ED?.dlg?.isConnected && !ED.view3d()) ED.render(); }); };
    const curSlot = it => clamp(slotSel.get(it?.id) || 0, 0, Math.max(0, count(it) - 1));
    const memPics = it => (Array.isArray(it?.mem) ? it.mem : []).filter(m => m && m.type === 'media' && Number(m.mid) > 0 && (!m.kind || /^(image|photo)/.test(m.kind)));
    function section(o, {sec, name = 'Objet', person = null} = {}) {
        const inf = infoOf(o); if (!inf || typeof sec !== 'function') return '';
        const n = inf.n, i = curSlot(o), p = get(o, i), miss = p && ready.get(p.m) === false, mp = memPics(o);
        const meta = p ? META.get(p.m) : null, val = p ? (meta ? {id: p.m, title: meta.title, thumb: thumbOf(meta), year: meta.year || ''} : p.m) : null;
        const tabs = n > 1 ? `<div class="h-hs-picslots" role="group" aria-label="Le cadre">${Array.from({length: n}, (_, k) => `<button type="button" class="${k === i ? 'is-active' : ''}" data-hs-picslot="${k}" title="Cadre ${k + 1}${has(o, k) ? ' : une image' : ' : vide'}">${has(o, k) ? '🖼' : '▢'} ${k + 1}</button>`).join('')}</div>` : '';
        const field = `<div data-hs-picfield><span class="pk-lab">${n > 1 ? `Image du cadre ${i + 1}` : 'Prise dans les médias'}</span>${PK()?.mediaField ? PK().mediaField({name: '', types: ['image'], person: person && person.id ? person : null, value: val, eyebrow: 'MAISON · IMAGE', title: `L’image de « ${String(name).slice(0, 60)} »`, okLabel: 'Poser cette image'}) : ''}</div>`;
        const mems = mp.length ? `<div class="h-hs-picmem"><small class="muted">Ou un souvenir de cet objet :</small>${mp.slice(0, 8).map(m => `<button type="button" class="h-hs-picmemb${p && p.m === Number(m.mid) ? ' is-active' : ''}" data-hs-picmem="${Number(m.mid)}" title="${esc(m.title || 'Souvenir')}">${/^media\/[\w.%()-]+$/.test(m.src || '') ? `<img src="${esc(m.src)}" alt="">` : '🖼'}<span>${esc(String(m.title || 'Souvenir').slice(0, 40))}</span></button>`).join('')}</div>` : '';
        const keepMem = p && !mp.some(m => Number(m.mid) === p.m) ? '<button type="button" class="button small secondary" data-hs-piccmd="mem" title="La rattacher aussi aux souvenirs de cet objet">🏷 Garder aussi comme souvenir</button>' : '';
        const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
        const tune = p ? `${miss ? '<p class="h-hs-picwarn">⚠️ Cette image est introuvable dans les médias : une toile neutre la remplace. Choisis-en une autre.</p>' : ''}
            <div class="h-hs-picprev"><canvas data-hs-picprev width="240" height="180" aria-label="Aperçu : glisse pour déplacer l’image, molette pour zoomer"></canvas><small class="muted">Glisse pour déplacer l’image · molette pour zoomer</small></div>
            <label>Dans le cadre<select data-hs-pic="fit">${opt(FITS, p.fit)}</select></label>
            <label>Zoom<input type="range" min="100" max="400" step="5" data-unit="%" data-default="100" data-hs-pic="zoom" value="${p.zoom}"></label>
            <div class="h-hs-row"><button type="button" class="button small secondary" data-hs-piccmd="rot">⟳ Tourner de 90°</button><button type="button" class="button small secondary" data-hs-piccmd="reset" title="Remettre l’image au centre, sans zoom">↺ Recadrage de départ</button>${keepMem}</div>
            ${inf.mat || inf.frame ? `<div class="h-hs-picmat"><label>Marie-louise<input type="range" min="0" max="20" step="0.5" data-unit="cm" data-default="0" data-hs-pic="matW" value="${p.matW}"></label><label>Sa couleur<input type="color" data-hs-pic="matColor" value="${esc(p.matColor)}"></label></div>` : ''}
            ${inf.frame || inf.flat || !inf.mat ? `<div class="h-hs-picmat"><label>Cadre peint<input type="range" min="0" max="15" step="0.5" data-unit="cm" data-default="0" data-hs-pic="frameW" value="${p.frameW}"></label><label>Sa couleur<input type="color" data-hs-pic="frameColor" value="${esc(p.frameColor)}"></label></div>` : ''}` : '';
        return sec(n > 1 ? '🖼 Images des cadres' : '🖼 Image', 'p-pic', `<div data-hs-pic-sec>${tabs}${field}${mems}<p class="muted small">📁 Tu peux aussi glisser une image de l’ordinateur sur l’objet, dans le plan ou dans la vue 3D : elle entre dans les médias.</p>${tune}</div>`, true);
    }
    /** l'aperçu du panneau (le même dessin que la texture 3D) */
    function paintPrev(it) {
        const cv = ED?.pane.querySelector('[data-hs-picprev]'); if (!cv || !it) return; const i = curSlot(it), p = get(it, i); if (!p) return;
        const [wcm, hcm] = infoOf(it).est(it), s = ready.get(p.m);
        if (s === undefined || s === null) { want(p.m); source(p.m).then(() => paintPrev(ED?.selItem()), () => paintPrev(ED?.selItem())); }
        if (s) compose(s, p, wcm, hcm, 240, cv); else { const n0 = neutral(s === false, 240, Math.round(240 * hcm / Math.max(wcm, 1))); cv.width = n0.width; cv.height = n0.height; cv.getContext('2d').drawImage(n0, 0, 0); }
    }
    /** changer un réglage : l'image du cadre en cours */
    function edit(it, fn, label, quick = false) {
        const i = curSlot(it), p = get(it, i); if (!p) return; fn(p); put(it, i, p); paintPrev(it);
        ED.pane.querySelectorAll('[data-hs-pic-sec] [data-hs-pic]').forEach(el => { const v = get(it, i)?.[el.dataset.hsPic]; if (v != null && el !== document.activeElement && String(el.value) !== String(v)) el.value = String(v); });
        if (quick) ED.later(label); else ED.commit(label);
    }
    async function setImage(it, i, media, label = 'Image posée') {
        if (!it) return; const old = get(it, i);
        if (!media) { put(it, i, null); ED.commit('Image retirée'); return; }
        const id = Number(media.id); if (!(id > 0)) return; META.set(id, media); SRC.delete(id); ready.delete(id);
        put(it, i, {...(old || {}), m: id, zoom: 100, px: 0, py: 0, rot: 0}); slotSel.set(it.id, i); want(id); ED.commit(label);
    }

    /* ═════════ 📁 E4 : une image glissée sur l'objet (2D ou 3D) ═════════ */
    let pend = null, hiEl = null, tip = null;
    const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
    function under(e) {
        if (!ED) return null;
        const v3 = ED.view3d();
        if (v3?.itemAt) { const h = v3.itemAt(e.clientX, e.clientY); if (!h) return null; const it = ED.findItem(h.id); if (!count(it)) return null;
            let i = 0; if (count(it) > 1 && h.obj && h.point) { let best = Infinity; h.obj.traverse(o => { if (!o.userData?.picSlot) return; const wp = o.getWorldPosition(h.point.clone()); const dd = wp.distanceTo(h.point); if (dd < best) { best = dd; i = o.userData.picSlot.i; } }); }
            return {it, i}; }
        // en 2D : l'objet à image qui contient le point (une toile contre le mur est fine : on élargit un peu), le plus petit d'abord
        let g = null, it = null, best = Infinity;
        ED.stage.querySelectorAll('[data-hs^="item:"]').forEach(el => { const o = ED.findItem(el.dataset.hs.slice(5)); if (!count(o)) return; let q; try { q = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM().inverse()); } catch (_) { return; }
            const w = Number(o.w) || 0, d = Number(o.d) || 0, pad = 6; if (Math.abs(q.x) > w / 2 + pad || Math.abs(q.y) > Math.max(d / 2, 10) + pad) return; const a = w * Math.max(d, 10); if (a < best) { best = a; g = el; it = o; } });
        if (!it) return null;
        const i = ED.selItem() === it ? curSlot(it) : Math.max(0, Array.from({length: count(it)}, (_, k) => k).find(k => !has(it, k)) ?? 0);
        return {it, i, g};
    }
    function hilite(t, e) {
        if (hiEl && hiEl !== t?.g) { hiEl.classList.remove('is-picdrop'); hiEl = null; }
        if (t?.g) { hiEl = t.g; hiEl.classList.add('is-picdrop'); }
        if (!t) { tip?.remove(); tip = null; return; }
        if (!tip) { tip = document.createElement('div'); tip.className = 'h-hs-piptip'; ED.stage.appendChild(tip); }
        const r = ED.stage.getBoundingClientRect(), nm = t.it.name || libOf(t.it.kind)?.[1] || 'cet objet';
        tip.textContent = `🖼 Déposer sur « ${nm} »${count(t.it) > 1 ? ` (cadre ${t.i + 1})` : ''}`; tip.style.left = `${e.clientX - r.left + 14}px`; tip.style.top = `${e.clientY - r.top + 14}px`;
    }
    async function dropOn(file, iid, i = null) {
        const it = ED?.findItem(iid); if (!it || !count(it)) return false;
        const k = i ?? curSlot(it);
        try { ED.status?.('Import de l’image…'); const media = await PK().importMediaFile(file, ['image']); await setImage(it, k, media, 'Image déposée sur l’objet'); ED.select(it.id); ED.render(); toast('✓ L’image est rangée dans les médias et posée sur l’objet.'); }
        catch (err) { toast(err.message, 'error'); }
        return true;
    }
    /** appelé par heritage-house.js (onDropFiles) : l'image déposée vise-t-elle un tableau ? */
    function claimDrop(file) { const p = pend; pend = null; if (!p || performance.now() - p.t > 1500 || !/^image\//.test(file?.type || '')) return false; dropOn(file, p.id, p.i); return true; }

    function attach(api) {
        ED = api; slotSel = new Map(); injectCss();
        const {pane, stage} = api;
        pane.addEventListener('media-change', e => { if (!e.target.closest('[data-hs-picfield]')) return; e.stopPropagation(); const it = api.selItem(); if (!it) return; setImage(it, curSlot(it), e.detail?.item || null); });
        pane.addEventListener('click', e => {
            const b = e.target.closest('[data-hs-picslot],[data-hs-picmem],[data-hs-piccmd]'); if (!b || !pane.contains(b)) return; const it = api.selItem(); if (!it) return;
            if (b.dataset.hsPicslot !== undefined) { slotSel.set(it.id, Number(b.dataset.hsPicslot) || 0); api.paint(); paintPrev(it); return; }
            if (b.dataset.hsPicmem) { const mid = Number(b.dataset.hsPicmem), m = memPics(it).find(x => Number(x.mid) === mid); setImage(it, curSlot(it), {id: mid, title: m?.title || '', thumb: m?.src || ''}, 'Image prise dans les souvenirs'); return; }
            const c = b.dataset.hsPiccmd;
            if (c === 'rot') edit(it, p => { p.rot = (p.rot + 90) % 360; }, 'Image tournée');
            if (c === 'reset') edit(it, p => { p.zoom = 100; p.px = 0; p.py = 0; p.rot = 0; }, 'Recadrage de départ');
            if (c === 'mem') { const p = get(it, curSlot(it)); if (!p) return; const mt = META.get(p.m) || {}; const src = thumbOf(mt);
                it.mem = [...(Array.isArray(it.mem) ? it.mem : []), {id: 's' + Date.now().toString(36), type: 'media', mid: p.m, title: String(mt.title || 'Image').slice(0, 200), src: /^media\/[\w.%()-]+$/.test(src) ? src : '', kind: 'image', date: String(mt.year || mt.date_text || '').slice(0, 40)}];
                api.commit('Souvenir rattaché'); }
        });
        pane.addEventListener('input', e => {
            const el = e.target; if (!el.dataset?.hsPic) return; const it = api.selItem(); if (!it) return; const k = el.dataset.hsPic, v = el.value;
            edit(it, p => { p[k] = ['zoom', 'matW', 'frameW'].includes(k) ? Number(v) : v; }, 'Image réglée', true);
        });
        pane.addEventListener('pointerdown', e => { if (e.target.matches?.('[data-hs-pic-sec] input[type=range]')) { busyF = true; const end = () => { busyF = false; }; document.addEventListener('pointerup', end, {once: true}); document.addEventListener('pointercancel', end, {once: true}); } });
        // le recadrage dans l'aperçu : glisser = déplacer, molette = zoomer
        let drag = null, wheelT = 0;
        pane.addEventListener('pointerdown', e => { const cv = e.target.closest?.('[data-hs-picprev]'); if (!cv) return; const it = api.selItem(), p = get(it, curSlot(it)); if (!p) return; e.preventDefault(); busyF = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} drag = {x: e.clientX, y: e.clientY, px: p.px, py: p.py, cv}; });
        pane.addEventListener('pointermove', e => { if (!drag) return; const it = api.selItem(); if (!it) return; const r = drag.cv.getBoundingClientRect(), dx = (e.clientX - drag.x) / Math.max(20, r.width) * 200, dy = (e.clientY - drag.y) / Math.max(20, r.height) * 200;
            edit(it, p => { p.px = clamp(Math.round(drag.px + dx), -100, 100); p.py = clamp(Math.round(drag.py + dy), -100, 100); }, 'Image recadrée', true); });
        const stopDrag = () => { if (!drag) return; drag = null; busyF = false; };
        pane.addEventListener('pointerup', stopDrag); pane.addEventListener('pointercancel', stopDrag);
        pane.addEventListener('wheel', e => { if (!e.target.closest?.('[data-hs-picprev]')) return; const it = api.selItem(); if (!get(it, curSlot(it))) return; e.preventDefault(); busyF = true;
            edit(it, p => { p.zoom = clamp(Math.round(p.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)), 100, 400); }, 'Image zoomée', true); clearTimeout(wheelT); wheelT = setTimeout(() => { if (!drag) busyF = false; }, 300); }, {passive: false});
        new MutationObserver(() => { const it = api.selItem(); if (it && pane.querySelector('[data-hs-picprev]')) paintPrev(it); }).observe(pane, {childList: true});
        // 📁 E4 : glisser une image sur un tableau, une toile, un cadre (le reste : comme avant, heritage-house.js)
        stage.addEventListener('dragover', e => { if (!hasFiles(e)) return; const t = under(e); hilite(t, e); }, true);
        stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) hilite(null); }, true);
        stage.addEventListener('drop', e => { if (!hasFiles(e)) return; const t = under(e); hilite(null); pend = t ? {id: t.it.id, i: t.i, t: performance.now()} : null; }, true);
    }

    const CSS = `.h-hs-picslots{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px}.h-hs-picslots button{border:1px solid #c9ced6;background:#fff;border-radius:999px;padding:3px 10px;font:inherit;font-size:13px;cursor:pointer;color:#222}.h-hs-picslots button.is-active{background:#1f2328;border-color:#1f2328;color:#fff}
.h-hs-picmem{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:6px 0}.h-hs-picmem small{flex:1 0 100%}.h-hs-picmemb{display:inline-flex;align-items:center;gap:6px;max-width:100%;border:1px solid #c9ced6;background:#fff;border-radius:8px;padding:3px 8px 3px 3px;font:inherit;font-size:12px;cursor:pointer;color:#222}.h-hs-picmemb img{width:28px;height:28px;object-fit:cover;border-radius:5px}.h-hs-picmemb.is-active{border-color:#2a7de1;box-shadow:0 0 0 2px #2a7de133}
.h-hs-picprev{display:flex;flex-direction:column;align-items:center;gap:4px;margin:8px 0}.h-hs-picprev canvas{max-width:100%;max-height:200px;border-radius:4px;box-shadow:0 1px 4px #0003;cursor:grab;touch-action:none;background:#e9e4da}.h-hs-picprev canvas:active{cursor:grabbing}
.h-hs-picmat{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;margin:4px 0}.h-hs-picmat label{min-width:0}
.h-hs-picwarn{background:#fff6d6;border:1px solid #e6c65a;color:#5a4500;border-radius:8px;padding:6px 8px;font-size:13px;margin:6px 0}
.h-hs-item.is-picdrop{filter:drop-shadow(0 0 4px #2a7de1) drop-shadow(0 0 8px #2a7de1)}.h-hs-picmk{pointer-events:none}
.h-hs-piptip{position:absolute;z-index:30;pointer-events:none;background:#2a7de1;color:#fff;font-size:13px;padding:4px 9px;border-radius:999px;box-shadow:0 2px 8px #0004;white-space:nowrap}
:root[data-theme="dark"] .h-hs-picslots button,:root[data-theme="dark"] .h-hs-picmemb{background:#24272c;border-color:#3a3f46;color:#e6e6e6}:root[data-theme="dark"] .h-hs-picslots button.is-active{background:#e6e6e6;border-color:#e6e6e6;color:#111}
:root[data-theme="dark"] .h-hs-picwarn{background:#3a3218;border-color:#7a6420;color:#f2e6c0}`;
    function injectCss() { if (document.getElementById('h-hs-pics-css')) return; const st = document.createElement('style'); st.id = 'h-hs-pics-css'; st.textContent = CSS; document.head.appendChild(st); }

    ext.housePics = {SHAPES, register, count, get, has, put, clean, slot, decorate, sym2d, section, attach, claimDrop, dropOn: (file, iid) => dropOn(file, iid), busy: () => busyF, compose, FITS};
})();
