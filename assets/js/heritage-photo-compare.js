/* LCNDA — 🔍 Comparer deux photos (F15) : poser deux portraits côte à côte, en fondu (curseur) ou en rideau, pour chercher
 * une ressemblance (même personne à deux âges, parenté…). Zoom et déplacement synchronisés (ou chacun le sien), alignement
 * des yeux (tout seul avec le modèle local de visages de heritage-faces.js s'il est là, sinon deux clics par photo), noir et
 * blanc, contraste, luminosité, ressemblance des visages (empreintes du modèle local, jamais envoyées ailleurs) avec une phrase
 * prudente, notes, et « 💾 Enregistrer » : la comparaison reste reliée aux deux médias et aux personnes.
 * Un seul outil, plusieurs portes : la visionneuse (« 🔍 Comparer avec… »), Listes → Médias (« 🔍 Comparer deux photos »),
 * la fiche (bloc Médias, 🔍), Comparaison → Images (deux photos : l'outil s'ouvre dans la page), Listes → Outils de
 * modification (les comparaisons enregistrées). Serveur : lib/photo_compare.php.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m))); // 🌐 docs/I18N.md
    const TEST = () => (window.LCNDA_FACES_TEST && typeof window.LCNDA_FACES_TEST === 'object' ? window.LCNDA_FACES_TEST : null);
    const MODES = [['side', '◫', 'Côte à côte'], ['fade', '◐', 'Fondu'], ['curtain', '⇹', 'Rideau']];
    const FACE_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/';
    const mediaSrc = m => (m?.filename ? `media/${encodeURIComponent(m.filename)}` : '');

    /** un média (numéro ou objet) → l'item du menu de choix {id, title, filename, thumb, people_ids, …} */
    async function mediaInfo(x) {
        if (!x) return null;
        const id = Number(typeof x === 'object' ? x.id : x); if (!id) return null;
        if (typeof x === 'object' && x.filename && Array.isArray(x.people_ids)) return x;
        try { const r = await api('picker_search', {kind: 'media', ids: String(id)}); const it = (r.groups || []).flatMap(g => g.items || []).find(i => Number(i.id) === id); if (it) return it; } catch (_) {}
        return typeof x === 'object' && x.filename ? {...x, id, people_ids: x.people_ids || (x.people_links || []).map(p => Number(p.id))} : null;
    }
    const isPhoto = m => !m || !m.media_type || m.media_type === 'image';

    /* ═════════ La ressemblance : distance entre deux empreintes (128 nombres) → une phrase prudente ═════════ */
    const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
    const dist = (a, b) => { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
    const CAUTION = 'ce n’est pas une preuve';
    function verdictOf(d) {
        const score = Math.round(clamp(1 - d / 0.8, 0, 1) * 100);
        const level = d < 0.4 ? 'ressemblance très forte' : d < 0.5 ? 'ressemblance forte' : d < 0.6 ? 'ressemblance moyenne' : 'ressemblance faible';
        const text = `${level.charAt(0).toUpperCase()}${level.slice(1)} — ${CAUTION}`;
        const kind = d < 0.5 ? 'green' : d < 0.6 ? 'yellow' : 'grey';
        return {d, score, level, text, kind};
    }
    ext.photoCompareVerdict = verdictOf; // pour les tests

    /* ═════════ Le modèle de visages (heritage-faces.js) : là, téléchargeable, ou absent ═════════ */
    async function modelState() {
        if (typeof TEST()?.photoDetect === 'function') return 'ready';
        if (!ext.faceInternals?.loadModel) return 'absent';
        if (window.faceapi) return 'ready';
        try { const c = await caches.open('lcnda-face-model'); if (await c.match(FACE_CDN + ext.faceInternals.FILES.lib[0])) return 'ready'; } catch (_) {}
        return 'download';
    }
    /** repère le visage le plus grand d'une image : ses yeux (en fraction de l'image) et son empreinte */
    async function detectFace(img, side, onStep) {
        const t = TEST(); if (typeof t?.photoDetect === 'function') return t.photoDetect(side);
        const F = await ext.faceInternals.loadModel(onStep);
        const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, 1280 / Math.max(W, H));
        const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        onStep?.('Recherche du visage…');
        const res = await F.detectAllFaces(c, new F.SsdMobilenetv1Options({minConfidence: 0.4, maxResults: 20})).withFaceLandmarks().withFaceDescriptors();
        if (!res.length) return null;
        const best = res.sort((x, y) => y.detection.box.area - x.detection.box.area)[0];
        const mean = pts => pts.reduce((s, p) => [s[0] + p.x / pts.length, s[1] + p.y / pts.length], [0, 0]);
        const eyes = [mean(best.landmarks.getLeftEye()), mean(best.landmarks.getRightEye())].map(([x, y]) => [x / c.width, y / c.height]).sort((p, q) => p[0] - q[0]);
        return {eyes, d: best.descriptor};
    }

    /* ═════════ L'outil, posé dans une fenêtre (plein écran) ou dans la page Comparaison ═════════ */
    function mount(root, opts = {}) {
        // 📍 « Hier et aujourd'hui » (images de lieux, heritage-place-photos.js) : le même outil, sans visages ; deux repères
        // par photo (clocher, coin de toit…) calent la photo d'aujourd'hui sur l'ancienne, puis on l'ajuste à la main.
        const place = opts.purpose === 'place' || opts.record?.settings?.purpose === 'place';
        const st = {
            id: Number(opts.record?.id || 0), title: opts.record?.title || '', notes: opts.record?.notes || '', mode: opts.record?.mode || (place ? 'curtain' : 'side'),
            adjX: 0, adjY: 0, adjK: 100, adjR: 0, moveB: false,
            mix: 50, sync: true, aligned: false, gray: false, contrast: 100, bright: 100,
            a: {item: null, img: null, eyes: null, desc: null, faces: null}, b: {item: null, img: null, eyes: null, desc: null, faces: null},
            views: [{s: 1, tx: 0, ty: 0}, {s: 1, tx: 0, ty: 0}], placing: null, beforePlacing: '', verdict: null, people: (opts.record?.people || []).map(p => Number(p.id)),
            dirty: false, saving: false, scoreNote: '',
        };
        const S0 = opts.record?.settings || {};
        Object.assign(st, {mix: Number(S0.mix ?? 50), sync: S0.sync !== false, aligned: !!S0.aligned, gray: !!S0.gray, contrast: Number(S0.contrast ?? 100), bright: Number(S0.bright ?? 100)});
        if (S0.eyes?.a) st.a.eyes = S0.eyes.a; if (S0.eyes?.b) st.b.eyes = S0.eyes.b;
        if (S0.adj && typeof S0.adj === 'object') Object.assign(st, {adjX: Number(S0.adj.x) || 0, adjY: Number(S0.adj.y) || 0, adjK: clamp(Number(S0.adj.k) || 100, 20, 300), adjR: clamp(Number(S0.adj.r) || 0, -180, 180)});
        if (!MODES.some(m => m[0] === st.mode)) st.mode = 'side';
        const U = UI(), inline = !!opts.inline;
        root.classList.add('h-pc');
        const top = U.editorTopbar ? U.editorTopbar({icon: place ? '🏘' : '🔍', name: st.title || (place ? i18n('Hier et aujourd’hui') : i18n('Comparer deux photos')), nameAttrs: `data-pc-name placeholder="${esc(i18n('Nom de la comparaison'))}"`, undo: false, status: st.id ? 'saved' : '',
            buttons: {save: {attrs: 'data-pc-cmd="save"', title: i18n('Enregistrer la comparaison (reliée aux deux photos et aux personnes)')}, full: inline ? null : (ext.fullButton ? {html: '⛶', attrs: 'data-full-toggle="photocmp"', title: 'Plein écran'} : null), close: inline ? null : {attrs: 'data-pc-cmd="close"', title: 'Fermer'}}})
            : `<header class="ui-topbar"><span>🔍</span><input class="ui-topbar-name" data-pc-name value="${esc(st.title)}"><span class="ui-topbar-spacer"></span><span data-ui-status></span><button type="button" class="button small" data-pc-cmd="save">💾 Enregistrer</button>${inline ? '' : '<button type="button" class="icon-button" data-pc-cmd="close">×</button>'}</header>`;
        const sec = (title, key, body, open = true) => (U.panelSection ? U.panelSection({title, key, open, body}) : `<details open><summary>${esc(title)}</summary><div>${body}</div></details>`);
        root.innerHTML = `${top}
            <div class="h-pc-main">
                <section class="h-pc-left">
                    <div class="h-pc-bar">
                        <div class="segmented h-pc-modes" role="group" aria-label="Affichage des deux photos">${MODES.map(([k, i, l]) => `<button type="button" data-pc-mode="${k}" title="${esc(l)}"><span aria-hidden="true">${i}</span> ${esc(l)}</button>`).join('')}</div>
                        <span class="h-pc-mixwrap" data-pc-mixwrap></span>
                        <label class="ui-toggle h-pc-sync" title="Zoomer et déplacer les deux photos ensemble"><input type="checkbox" data-pc-sync ${st.sync ? 'checked' : ''}><i></i>Zoom ensemble</label>
                        <span class="spacer"></span>
                        <button type="button" class="icon-button small" data-pc-zoom="out" title="Dézoomer" aria-label="Dézoomer">−</button><button type="button" class="icon-button small" data-pc-zoom="in" title="Zoomer" aria-label="Zoomer">＋</button><button type="button" class="button small secondary" data-pc-zoom="fit" title="Toute la photo (double-clic)">Toute la photo</button>
                    </div>
                    <p class="h-pc-hint" data-pc-hint hidden aria-live="polite"></p>
                    <div class="h-pc-stage" data-pc-stage tabindex="0" aria-label="Les deux photos : molette pour zoomer, glisser pour déplacer, double-clic pour revoir toute la photo"><canvas data-pc-canvas></canvas>
                        <div class="h-pc-empty" data-pc-empty hidden></div></div>
                </section>
                <aside class="h-pc-side">
                    ${sec('Les deux photos', 'pc-photos', `<div class="h-pc-pick"><span class="pk-lab">${place ? i18n('A — l’image ancienne') : i18n('Photo A')}</span><div data-pc-mf="a"></div></div><div class="h-pc-pick"><span class="pk-lab">${place ? i18n('B — la photo d’aujourd’hui') : i18n('Photo B')}</span><div data-pc-mf="b"></div></div><button type="button" class="button small secondary" data-pc-swap title="Mettre A à la place de B et B à la place de A">⇄ Échanger A et B</button>`)}
                    ${place ? sec('Caler la photo d’aujourd’hui', 'pc-recal', `<p class="muted small">Clique deux mêmes repères sur chaque photo (le haut du clocher, le coin d’un toit…) : la photo d’aujourd’hui est tournée et mise à la même taille.</p>
                        <div class="h-pc-row"><button type="button" class="button small" data-pc-place title="Deux clics sur la photo A, puis les deux mêmes repères sur la photo B">📌 Poser 2 repères par photo</button></div>
                        <label class="ui-toggle"><input type="checkbox" data-pc-aligned ${st.aligned ? 'checked' : ''}><i></i>Caler sur les repères</label>
                        <div class="h-pc-row"><button type="button" class="link-button" data-pc-clear-eyes>✕ Retirer les repères</button></div>
                        <span class="pk-lab">Ajuster à la main</span>
                        <label class="ui-toggle" title="Glisser sur l’image déplace seulement la photo d’aujourd’hui"><input type="checkbox" data-pc-moveb ${st.moveB ? 'checked' : ''}><i></i>Glisser déplace la photo B</label>
                        <div data-pc-adj></div><div class="h-pc-row"><button type="button" class="link-button" data-pc-adj-reset>↺ Remettre comme au départ</button></div>`) : ''}
                    ${place ? '' : sec('Les yeux (alignement)', 'pc-eyes', `<p class="muted small">Les deux visages sont mis à la même taille, les yeux à la même hauteur : la comparaison est bien plus juste.</p>
                        <div class="h-pc-row"><button type="button" class="button small" data-pc-auto>✨ Repérer les yeux tout seul</button><button type="button" class="button small secondary" data-pc-place title="Clique l’œil gauche puis l’œil droit sur chaque photo">👁 Poser les yeux (2 clics par photo)</button></div>
                        <div data-pc-modelinfo class="h-pc-modelinfo"></div>
                        <label class="ui-toggle"><input type="checkbox" data-pc-aligned ${st.aligned ? 'checked' : ''}><i></i>Aligner sur les yeux</label>
                        <div class="h-pc-row"><button type="button" class="link-button" data-pc-clear-eyes>✕ Retirer les yeux posés</button></div>`)}
                    ${sec('Couleur', 'pc-color', `<label class="ui-toggle"><input type="checkbox" data-pc-gray ${st.gray ? 'checked' : ''}><i></i>Noir et blanc</label><div data-pc-ranges></div>`)}
                    ${place ? '' : sec('Ressemblance', 'pc-score', '<div data-pc-score class="h-pc-score"></div>')}
                    ${place ? '' : sec('Personnes', 'pc-people', '<div data-pc-people></div><p class="muted small">Prises sur les deux photos ; ajoute ou retire qui tu veux.</p>')}
                    ${sec('Notes', 'pc-notes', `<textarea data-pc-notes rows="5" placeholder="Ce que tu remarques : forme du nez, des oreilles, implantation des cheveux, grain de beauté, âge supposé…">${esc(st.notes)}</textarea>`)}
                </aside>
            </div>`;
        const $ = s => root.querySelector(s), canvas = $('[data-pc-canvas]'), stage = $('[data-pc-stage]'), ctx = canvas.getContext('2d');
        const ac = new AbortController(), sig = {signal: ac.signal};
        const status = s => { const el = root.querySelector('[data-ui-status]'); if (el && U.savedStatus) U.savedStatus(el, s); };
        const touch = () => { st.dirty = true; status('dirty'); };

        /* ─── les curseurs (C3) ─── */
        const ranges = $('[data-pc-ranges]');
        const addRange = (key, label, min, max, unit, host = ranges, dflt = key === 'mix' ? 50 : 100) => {
            if (!U.rangeField) { host.insertAdjacentHTML('beforeend', `<label>${esc(label)} <input type="range" min="${min}" max="${max}" value="${st[key]}" data-pc-r="${key}"></label>`); return; }
            const f = U.rangeField({label, min, max, value: st[key], unit, default: dflt}); f.input.dataset.pcR = key; return f;
        };
        const adjHost = $('[data-pc-adj]');
        const adjF = adjHost ? [addRange('adjR', 'Tourner', -180, 180, '°', adjHost, 0), addRange('adjK', 'Taille', 20, 300, '%', adjHost, 100)] : [];
        adjF.forEach(f => f && adjHost.append(f));
        ranges.append(addRange('contrast', 'Contraste', 20, 300, '%') || '', addRange('bright', 'Luminosité', 20, 300, '%') || '');
        const mixF = addRange('mix', 'B', 0, 100, '%'); if (mixF) { mixF.classList.add('h-pc-mix'); mixF.title = 'Fondu : part de la photo B ; rideau : place du rideau'; $('[data-pc-mixwrap]').append(mixF); }
        root.addEventListener('input', e => { const k = e.target.dataset?.pcR; if (!k) return; st[k] = Number(e.target.value); touch(); draw(); }, sig);

        /* ─── les photos A et B : la fenêtre unique des médias, dans un champ ─── */
        const field = (side, value) => { $(`[data-pc-mf="${side}"]`).innerHTML = P().mediaField ? P().mediaField({name: '', types: ['image'], value: value ? {id: value.id, title: value.title, filename: value.filename, thumb: value.thumb || mediaSrc(value)} : null, title: side === 'a' ? i18n('La photo A') : i18n('La photo B'), okLabel: i18n('Comparer'), person: st.people[0] || null}) : ''; };
        async function setSide(side, it, {quiet = false, keepEyes = false} = {}) {
            const S = st[side]; S.item = it ? await mediaInfo(it) : null; S.img = null; S.desc = null; S.faces = null; if (!keepEyes) S.eyes = null;
            if (!keepEyes) st.aligned = st.aligned && !!(st.a.eyes && st.b.eyes);
            if (S.item && !isPhoto(S.item)) { toast('Choisis une photo (image).', 'error'); S.item = null; }
            if (S.item) {
                S.img = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = mediaSrc(S.item); });
                if (!S.img) toast(i18n('La photo « {name} » n’a pas pu être ouverte.', {name: S.item.title || ''}), 'error');
                // les personnes de la photo rejoignent la comparaison
                (S.item.people_ids || []).map(Number).filter(Boolean).forEach(id => { if (!st.people.includes(id)) st.people.push(id); });
                drawPeople();
            }
            if (!quiet) { touch(); st.verdict = null; }
            resetViews(); syncUi(); draw(); computeScore();
        }
        root.addEventListener('media-change', e => { const side = e.target.closest('[data-pc-mf]')?.dataset.pcMf; if (!side) return; const it = e.detail?.item; const other = st[side === 'a' ? 'b' : 'a'].item; if (it && other && Number(it.id) === Number(other.id)) { toast('C’est déjà l’autre photo : choisis-en une autre.', 'error'); field(side, st[side].item); return; } setSide(side, it); }, sig);
        $('[data-pc-swap]').addEventListener('click', () => { [st.a, st.b] = [st.b, st.a]; field('a', st.a.item); field('b', st.b.item); touch(); resetViews(); draw(); computeScore(); }, sig);
        const drawPeople = () => { const box = $('[data-pc-people]'); if (!box) return; box.innerHTML = P().pickerField ? `<span class="pk-lab">Personnes reliées</span>${P().pickerField({name: 'pc_people', kind: 'person', multiple: true, allowCreate: false, value: st.people.slice()})}` : ''; };
        root.addEventListener('picker-change', e => { if (e.detail?.name !== 'pc_people') return; const v = e.detail.value; st.people = (Array.isArray(v) ? v : String(v || '').split(',')).map(Number).filter(Boolean); touch(); }, sig);

        /* ─── la vue : chaque photo posée dans sa case (ou alignée sur les yeux), puis zoom et déplacement ─── */
        let W = 0, H = 0, dpr = 1;
        const rects = () => (st.mode === 'side' ? [{x: 0, y: 0, w: W / 2 - 3, h: H}, {x: W / 2 + 3, y: 0, w: W / 2 - 3, h: H}] : [{x: 0, y: 0, w: W, h: H}, {x: 0, y: 0, w: W, h: H}]);
        const viewOf = i => (st.sync || st.mode !== 'side' ? st.views[0] : st.views[i]);
        const canAlign = () => st.aligned && st.a.eyes && st.b.eyes && st.a.img && st.b.img;
        const fitM = (img, r) => { const s = Math.min(r.w / img.naturalWidth, r.h / img.naturalHeight) * 0.96; return new DOMMatrix().translate(r.x + (r.w - img.naturalWidth * s) / 2, r.y + (r.h - img.naturalHeight * s) / 2).scale(s); };
        function baseM(S, r) {
            const img = S.img; if (!img) return new DOMMatrix();
            const iw = img.naturalWidth, ih = img.naturalHeight;
            if (place) {
                // A : posée dans sa case ; B : calée sur les repères de A (même case en fondu / rideau), puis l'ajustement à la main
                let m = fitM(img, r);
                if (S === st.b && canAlign() && st.mode !== 'side') {
                    const am = fitM(st.a.img, r), [a1, a2] = st.a.eyes.map(([x, y]) => am.transformPoint(new DOMPoint(x * st.a.img.naturalWidth, y * st.a.img.naturalHeight)));
                    const [b1, b2] = S.eyes.map(([x, y]) => [x * iw, y * ih]);
                    const la = Math.hypot(a2.x - a1.x, a2.y - a1.y) || 1, lb = Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) || 1;
                    const ang = (Math.atan2(a2.y - a1.y, a2.x - a1.x) - Math.atan2(b2[1] - b1[1], b2[0] - b1[0])) * 180 / Math.PI;
                    m = new DOMMatrix().translate(a1.x, a1.y).rotate(ang).scale(la / lb).translate(-b1[0], -b1[1]);
                }
                if (S === st.b && (st.adjX || st.adjY || st.adjK !== 100 || st.adjR)) {
                    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
                    m = new DOMMatrix().translate(cx + st.adjX, cy + st.adjY).rotate(st.adjR).scale(st.adjK / 100).translate(-cx, -cy).multiply(m);
                }
                return m;
            }
            if (canAlign()) {
                const [p1, p2] = S.eyes.map(([x, y]) => [x * iw, y * ih]), L = Math.min(r.w, r.h) * 0.22;
                const q1 = [r.x + r.w / 2 - L / 2, r.y + r.h * 0.42];
                const vx = p2[0] - p1[0], vy = p2[1] - p1[1], len = Math.hypot(vx, vy) || 1, s = L / len, ang = -Math.atan2(vy, vx) * 180 / Math.PI;
                return new DOMMatrix().translate(q1[0], q1[1]).rotate(ang).scale(s).translate(-p1[0], -p1[1]);
            }
            const s = Math.min(r.w / iw, r.h / ih) * 0.96;
            return new DOMMatrix().translate(r.x + (r.w - iw * s) / 2, r.y + (r.h - ih * s) / 2).scale(s);
        }
        const viewM = (v, r) => new DOMMatrix().translate(r.x + r.w / 2 + v.tx, r.y + r.h / 2 + v.ty).scale(v.s).translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
        const fullM = (i, S) => { const r = rects()[i]; return viewM(viewOf(i), r).multiply(baseM(S, r)); };
        const resetViews = () => { st.views = [{s: 1, tx: 0, ty: 0}, {s: 1, tx: 0, ty: 0}]; };
        function resize() {
            const b = stage.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
            W = Math.max(50, Math.round(b.width)); H = Math.max(50, Math.round(b.height));
            canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; draw();
        }
        const filter = () => [st.gray ? 'grayscale(1)' : '', st.contrast !== 100 ? `contrast(${st.contrast}%)` : '', st.bright !== 100 ? `brightness(${st.bright}%)` : ''].filter(Boolean).join(' ') || 'none';
        const dark = () => { // le fond réel de l'app (le thème « auto » peut rester clair quand l'Apparence fixe les couleurs)
            const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
            if (m && m.length >= 3 && !(m.length > 3 && +m[3] === 0)) return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
            return document.documentElement.dataset.theme === 'dark'; };
        function drawImg(i, S) { if (!S.img) return; ctx.save(); ctx.setTransform(new DOMMatrix().scale(dpr).multiply(fullM(i, S))); ctx.filter = filter(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(S.img, 0, 0); ctx.restore(); }
        function drawEyes(i, S, color) {
            if (!S.img || !S.eyes) return; const m = fullM(i, S), iw = S.img.naturalWidth, ih = S.img.naturalHeight;
            ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = color; ctx.lineWidth = 2;
            S.eyes.forEach(([x, y]) => { const p = m.transformPoint(new DOMPoint(x * iw, y * ih)); ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y + 11); ctx.stroke(); });
            ctx.restore();
        }
        function draw() {
            if (!W) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = dark() ? '#15171b' : '#e9eaee'; ctx.fillRect(0, 0, W, H);
            const R = rects(), both = st.a.img && st.b.img;
            const empty = $('[data-pc-empty]');
            if (!st.a.item && !st.b.item) { empty.hidden = false; empty.innerHTML = A().emptyState ? A().emptyState({icon: '🔍', text: 'Choisis les deux photos à comparer', hint: 'Deux portraits : la même personne à deux âges, deux personnes qu’on croit parentes…', action: {label: '🖼 Choisir la photo A', attrs: 'data-pc-pick-a'}}) : ''; return; }
            empty.hidden = true;
            if (st.mode === 'side' || !both) {
                [st.a, st.b].forEach((S, i) => {
                    const r = st.mode === 'side' ? R[i] : R[0]; if (st.mode !== 'side' && !S.img) return;
                    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
                    if (!S.img) { ctx.fillStyle = dark() ? '#9aa3b5' : '#5b6474'; ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i ? i18n('Choisis la photo B à droite →') : i18n('Choisis la photo A à droite →'), r.x + r.w / 2, r.y + r.h / 2); }
                    else { drawImg(st.mode === 'side' ? i : 0, S); drawEyes(st.mode === 'side' ? i : 0, S, i ? '#f59ab0' : '#7cc4f0'); }
                    ctx.restore();
                    if (st.mode === 'side') { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(r.x + 8, r.y + 8, 26, 22); ctx.fillStyle = '#fff'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i ? 'B' : 'A', r.x + 21, r.y + 24); }
                });
            } else if (st.mode === 'fade') {
                drawImg(0, st.a); ctx.save(); ctx.globalAlpha = st.mix / 100; drawImg(1, st.b); ctx.restore();
            } else {
                const x = R[0].x + R[0].w * st.mix / 100;
                drawImg(0, st.b); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, H); ctx.clip(); drawImg(0, st.a); ctx.restore();
                ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, 0, 3, H); ctx.beginPath(); ctx.arc(x, H / 2, 14, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1f6feb'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⇹', x, H / 2 + 5);
                ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, 8, 26, 22); ctx.fillRect(W - 34, 8, 26, 22); ctx.fillStyle = '#fff'; ctx.fillText('A', 21, 24); ctx.fillText('B', W - 21, 24); ctx.restore();
            }
            if (canAlign() && !place) { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = 'rgba(31,111,235,.55)'; ctx.setLineDash([6, 6]); const v = viewOf(0), r = R[0], y = r.y + r.h / 2 + v.ty + (r.h * 0.42 - r.h / 2) * v.s; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.restore(); }
        }

        /* ─── souris, molette, clavier ─── */
        const sideAt = x => (st.mode === 'side' ? (x > W / 2 ? 1 : 0) : 0);
        const local = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
        const zoomAt = (i, f, cx, cy) => { const r = rects()[i], v = viewOf(i), ns = clamp(v.s * f, 0.2, 12); const k = ns / v.s; const ox = cx - (r.x + r.w / 2) - v.tx, oy = cy - (r.y + r.h / 2) - v.ty; v.tx -= ox * (k - 1); v.ty -= oy * (k - 1); v.s = ns; draw(); };
        canvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(sideAt(x), e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y); }, {passive: false, signal: ac.signal});
        let drag = null;
        canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0) return; const [x, y] = local(e);
            if (st.placing) { placeAt(x, y); return; }
            if (st.mode === 'curtain' && st.a.img && st.b.img && Math.abs(x - W * st.mix / 100) < 16) { drag = {curtain: true}; }
            else if (place && st.moveB && st.b.img && (st.mode !== 'side' || sideAt(x) === 1)) drag = {b: true, x, y, ax: st.adjX, ay: st.adjY};
            else { const i = sideAt(x), v = viewOf(i); drag = {i, x, y, tx: v.tx, ty: v.ty}; }
            canvas.setPointerCapture(e.pointerId); stage.classList.add('is-dragging');
        }, sig);
        canvas.addEventListener('pointermove', e => {
            const [x, y] = local(e);
            if (!drag) { canvas.style.cursor = st.placing ? 'crosshair' : st.mode === 'curtain' && Math.abs(x - W * st.mix / 100) < 16 ? 'ew-resize' : 'grab'; return; }
            if (drag.curtain) { st.mix = Math.round(clamp(x / W * 100, 0, 100)); if (mixF) { mixF.input.value = st.mix; mixF.input.dispatchEvent(new Event('input', {bubbles: true})); } else draw(); return; }
            if (drag.b) { const v = viewOf(st.mode === 'side' ? 1 : 0); st.adjX = drag.ax + (x - drag.x) / v.s; st.adjY = drag.ay + (y - drag.y) / v.s; st.dirty = true; draw(); return; }
            const v = viewOf(drag.i); v.tx = drag.tx + x - drag.x; v.ty = drag.ty + y - drag.y; draw();
        }, sig);
        const endDrag = () => { if (drag?.curtain || drag?.b) touch(); drag = null; stage.classList.remove('is-dragging'); };
        canvas.addEventListener('pointerup', endDrag, sig); canvas.addEventListener('pointercancel', endDrag, sig);
        canvas.addEventListener('dblclick', () => { resetViews(); draw(); }, sig);
        stage.addEventListener('keydown', e => {
            if (e.key === 'Escape' && st.placing) { e.preventDefault(); e.stopPropagation(); stopPlacing(true); return; }
            const c = [W / 2, H / 2];
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(0, 1.2, ...c); if (st.mode === 'side' && !st.sync) zoomAt(1, 1.2, ...c); }
            else if (e.key === '-') { e.preventDefault(); zoomAt(0, 1 / 1.2, ...c); if (st.mode === 'side' && !st.sync) zoomAt(1, 1 / 1.2, ...c); }
            else if (e.key === '0') { e.preventDefault(); resetViews(); draw(); }
            else if (/^Arrow/.test(e.key)) { e.preventDefault(); const d = e.shiftKey ? 60 : 20; [0, 1].forEach(i => { const v = st.views[i]; if (e.key === 'ArrowLeft') v.tx += d; if (e.key === 'ArrowRight') v.tx -= d; if (e.key === 'ArrowUp') v.ty += d; if (e.key === 'ArrowDown') v.ty -= d; }); draw(); }
        }, sig);
        root.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
            if (b.dataset.pcMode) { st.mode = b.dataset.pcMode; if (st.placing) stopPlacing(true); touch(); syncUi(); resetViews(); draw(); }
            else if (b.dataset.pcZoom) { const c = [W / 2, H / 2]; if (b.dataset.pcZoom === 'fit') { resetViews(); draw(); } else { const f = b.dataset.pcZoom === 'in' ? 1.25 : 0.8; zoomAt(0, f, ...c); if (st.mode === 'side' && !st.sync) zoomAt(1, f, ...c); } }
            else if (b.hasAttribute('data-pc-pick-a')) root.querySelector('[data-pc-mf="a"] [data-mf="pick"], [data-pc-mf="a"] [data-mf="change"]')?.click();
            else if (b.hasAttribute('data-pc-place')) startPlacing();
            else if (b.hasAttribute('data-pc-auto')) autoEyes();
            else if (b.hasAttribute('data-pc-clear-eyes')) { st.a.eyes = st.b.eyes = null; st.aligned = false; touch(); syncUi(); resetViews(); draw(); computeScore(); }
            else if (b.hasAttribute('data-pc-score-run')) autoEyes();
            else if (b.hasAttribute('data-pc-adj-reset')) { Object.assign(st, {adjX: 0, adjY: 0, adjK: 100, adjR: 0}); adjF.forEach(f => { if (f) { f.input.value = f.input.dataset.pcR === 'adjK' ? 100 : 0; f.input.dispatchEvent(new Event('input', {bubbles: true})); } }); touch(); draw(); }
            else if (b.dataset.pcCmd === 'save') save();
            else if (b.dataset.pcCmd === 'close') opts.onRequestClose?.();
        }, sig);
        root.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-pc-sync]')) { st.sync = t.checked; if (st.sync) st.views[1] = {...st.views[0]}; touch(); draw(); }
            else if (t.matches('[data-pc-gray]')) { st.gray = t.checked; touch(); draw(); }
            else if (t.matches('[data-pc-moveb]')) { st.moveB = t.checked; }
            else if (t.matches('[data-pc-aligned]')) { if (t.checked && !(st.a.eyes && st.b.eyes)) { t.checked = false; toast(place ? 'Pose d’abord deux repères sur chaque photo (📌).' : 'Pose d’abord les yeux sur les deux photos (✨ tout seul, ou 👁 deux clics par photo).', 'error'); return; } st.aligned = t.checked; touch(); resetViews(); draw(); }
        }, sig);
        $('[data-pc-notes]').addEventListener('input', e => { st.notes = e.target.value; touch(); }, sig);
        $('[data-pc-name]')?.addEventListener('input', e => { st.title = e.target.value; touch(); }, sig);
        root.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }, sig);

        /* ─── poser les yeux : deux clics par photo (côte à côte le temps de les poser) ─── */
        const STEPS = (place ? [['a', 'le repère 1 sur l’image ancienne (A)'], ['a', 'le repère 2 sur l’image ancienne (A)'], ['b', 'le même repère 1 sur la photo d’aujourd’hui (B)'], ['b', 'le même repère 2 sur la photo d’aujourd’hui (B)']]
            : [['a', 'l’œil de gauche de la photo A'], ['a', 'l’œil de droite de la photo A'], ['b', 'l’œil de gauche de la photo B'], ['b', 'l’œil de droite de la photo B']]).map(([s, t]) => [s, i18n(t)]);
        const order = pts => (place ? pts.slice() : pts.slice().sort((p1, p2) => p1[0] - p2[0])); // les repères gardent leur ordre
        const hint = txt => { const h = $('[data-pc-hint]'); h.hidden = !txt; h.innerHTML = txt || ''; };
        function startPlacing() {
            if (!st.a.img || !st.b.img) return toast('Choisis d’abord les deux photos.', 'error');
            st.beforePlacing = st.mode; st.mode = 'side'; st.aligned = false; st.placing = {n: 0, pts: {a: [], b: []}}; syncUi(); resetViews(); draw();
            hint(`${place ? '📌' : '👁'} ${i18n('Clique <b>{what}</b> (à ta gauche sur l’écran).', {what: STEPS[0][1]})} <span class="muted">${i18n('Échap pour arrêter.')}</span>`); stage.focus();
        }
        function stopPlacing(cancel = false) { if (!st.placing) return; st.mode = st.beforePlacing || 'side'; st.placing = null; hint(''); syncUi(); resetViews(); draw(); if (cancel) toast(place ? 'Repères non posés : rien n’a changé.' : 'Yeux non posés : rien n’a changé.'); }
        function placeAt(x, y) {
            const [side] = STEPS[st.placing.n], i = side === 'a' ? 0 : 1;
            if (sideAt(x) !== i) { hint(`${place ? '📌' : '👁'} ${i18n('Clique sur la photo <b>{side}</b> : {what}.', {side: side.toUpperCase(), what: STEPS[st.placing.n][1]})} <span class="muted">${i18n('Échap pour arrêter.')}</span>`); return; }
            const S = st[side], p = fullM(i, S).inverse().transformPoint(new DOMPoint(x, y));
            const fx = p.x / S.img.naturalWidth, fy = p.y / S.img.naturalHeight; if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
            st.placing.pts[side].push([fx, fy]); S.eyes = st.placing.pts[side].length === 2 ? order(st.placing.pts[side]) : null;
            st.placing.n++; draw();
            if (st.placing.n >= STEPS.length) { st.a.eyes = order(st.placing.pts.a); st.b.eyes = order(st.placing.pts.b); st.aligned = true; stopPlacing(); touch(); toast(place ? 'Repères posés : la photo d’aujourd’hui est calée sur l’ancienne.' : 'Yeux posés : les deux visages sont alignés.'); computeScore(); return; }
            hint(`${place ? '📌' : '👁'} Clique <b>${STEPS[st.placing.n][1]}</b>. <span class="muted">Échap pour arrêter.</span>`);
        }

        /* ─── tout seul : le modèle local de visages ─── */
        async function paintModelInfo() {
            const box = $('[data-pc-modelinfo]'), btn = $('[data-pc-auto]'); if (!box) return;
            const m = await modelState();
            if (m === 'absent') { btn.disabled = true; box.innerHTML = U.notice ? U.notice('info', 'Le modèle de visages n’est pas disponible ici : pose les yeux en deux clics par photo.') : ''; }
            else if (m === 'download') box.innerHTML = '<small class="muted">Le modèle de visages (≈ 13 Mo, sur cet ordinateur seulement) se charge une fois, au premier clic.</small>';
            else box.innerHTML = '';
        }
        async function autoEyes() {
            if (!st.a.img || !st.b.img) return toast('Choisis d’abord les deux photos.', 'error');
            const btn = $('[data-pc-auto]'), label = btn.textContent; btn.disabled = true;
            try {
                for (const side of ['a', 'b']) {
                    btn.textContent = `Photo ${side.toUpperCase()}…`;
                    const r = await detectFace(st[side].img, side, s => { btn.textContent = `${s}`; });
                    if (!r) { toast(i18n('Aucun visage trouvé sur la photo {side} : pose les yeux en deux clics.', {side: side.toUpperCase()}), 'error'); return; }
                    st[side].eyes = r.eyes; st[side].desc = r.d ? (r.d instanceof Float32Array ? r.d : Float32Array.from(r.d)) : null;
                }
                st.aligned = true; touch(); syncUi(); resetViews(); draw(); computeScore(); toast('Visages trouvés : les yeux sont alignés.');
            } catch (err) {
                toast(`${err.message || i18n('Le modèle de visages n’a pas pu être chargé.')} ${i18n('Pose les yeux en deux clics par photo.')}`, 'error');
                const box = $('[data-pc-modelinfo]'); if (box && U.notice) box.innerHTML = U.notice('warn', 'Le modèle de visages n’a pas pu être chargé (il faut internet la première fois) : pose les yeux en deux clics par photo.');
            } finally { btn.disabled = false; btn.textContent = label; paintModelInfo(); }
        }

        /* ─── la ressemblance ─── */
        let scoreSeq = 0;
        async function computeScore() {
            const box = $('[data-pc-score]'), n = ++scoreSeq; if (!box) return;
            if (!st.a.item || !st.b.item) { box.innerHTML = '<p class="muted small">Choisis les deux photos.</p>'; st.verdict = null; return; }
            let d = null, from = '';
            if (st.a.desc && st.b.desc) { d = dist(st.a.desc, st.b.desc); from = 'model'; }
            else {
                try {
                    const f = await api('photo_compare_faces', {a: st.a.item.id, b: st.b.item.id}); if (n !== scoreSeq) return;
                    const pick = (faces, S) => {
                        const ok = (faces || []).filter(x => x.d); if (!ok.length) return null;
                        if (S.eyes) { const mx = (S.eyes[0][0] + S.eyes[1][0]) / 2 * 100, my = (S.eyes[0][1] + S.eyes[1][1]) / 2 * 100; const inside = ok.find(x => mx >= x.x && mx <= x.x + x.w && my >= x.y && my <= x.y + x.h); if (inside) return inside; }
                        return ok.slice().sort((p, q) => q.w * q.h - p.w * p.h)[0];
                    };
                    const fa = pick(f.a, st.a), fb = pick(f.b, st.b);
                    if (fa && fb) { d = dist(unb64(fa.d), unb64(fb.d)); from = 'prints'; }
                } catch (_) {}
            }
            if (n !== scoreSeq) return;
            if (d == null) {
                st.verdict = null;
                box.innerHTML = `<p class="small">${i18n('Pas encore de ressemblance calculée pour ces deux photos.')}</p><p class="muted small">${i18n('« ✨ Repérer les yeux tout seul » la calcule (modèle de visages sur cet ordinateur), ou lance <b>👤 Visages</b> sur ces photos (Listes → Médias).')}</p>`;
                return;
            }
            st.verdict = verdictOf(d);
            const v = st.verdict, badge = U.badge ? U.badge(`${v.score} %`, v.kind) : `<b>${v.score} %</b>`;
            box.innerHTML = `<div class="h-pc-verdict" data-pc-verdict="${v.level}">${badge} <b>${esc(i18n(v.text))}</b></div>
                <div class="h-pc-meter" aria-hidden="true"><i style="width:${v.score}%"></i></div>
                <p class="muted small">${i18n('Calculée par le modèle de visages, sur cet ordinateur ({from}). L’âge, la lumière, l’angle et la qualité des photos changent beaucoup le résultat ; un air de famille (parent, frère, sœur) peut aussi donner une ressemblance forte. À confirmer par les actes.', {from: from === 'model' ? i18n('visages repérés à l’instant') : i18n('visages trouvés par 👤 Visages')})}</p>`;
        }

        /* ─── enregistrer ─── */
        async function save() {
            if (st.saving) return;
            if (!st.a.item || !st.b.item) return toast('Choisis les deux photos avant d’enregistrer.', 'error');
            st.saving = true; status('saving');
            try {
                const body = {op: 'save', id: st.id, title: st.title, media_a: st.a.item.id, media_b: st.b.item.id, people: st.people, notes: st.notes, mode: st.mode,
                    settings: {eyes: {...(st.a.eyes ? {a: st.a.eyes} : {}), ...(st.b.eyes ? {b: st.b.eyes} : {})}, gray: st.gray, contrast: st.contrast, bright: st.bright, mix: st.mix, sync: st.sync, aligned: st.aligned,
                        ...(place ? {purpose: 'place', adj: {x: Math.round(st.adjX * 10) / 10, y: Math.round(st.adjY * 10) / 10, k: st.adjK, r: st.adjR}} : {})},
                    score: st.verdict ? st.verdict.score : null, verdict: st.verdict ? st.verdict.text : ''};
                const r = await post('photo_comparison_write', body), c = r.comparison;
                st.id = c.id; if (!st.title) { st.title = c.title; const n = $('[data-pc-name]'); if (n) n.value = c.title; }
                st.dirty = false; status('saved'); opts.onSaved?.(c);
            } catch (err) { status('error'); toast(err.message || 'Enregistrement impossible.', 'error', {retry: save}); }
            finally { st.saving = false; }
        }

        function syncUi() {
            root.querySelectorAll('[data-pc-mode]').forEach(b => { const on = b.dataset.pcMode === st.mode; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            const both = st.a.img && st.b.img;
            const mw = $('[data-pc-mixwrap]'); if (mw) mw.hidden = st.mode === 'side';
            if (mixF) { const lab = mixF.querySelector('.ui-range-lab'); if (lab) lab.textContent = st.mode === 'curtain' ? i18n('Rideau') : i18n('Part de B'); }
            const al = $('[data-pc-aligned]'); if (al) al.checked = !!st.aligned;
            const sy = $('[data-pc-sync]'); if (sy) sy.closest('label').hidden = st.mode !== 'side';
            ['[data-pc-place]', '[data-pc-auto]'].forEach(s => { const b = $(s); if (b && !b.dataset.busy) b.disabled = !both || (s === '[data-pc-auto]' && b.dataset.absent === '1'); });
        }
        const ro = new ResizeObserver(() => resize()); ro.observe(stage);
        const mq = matchMedia('(prefers-color-scheme: dark)'); const onScheme = () => draw(); mq.addEventListener?.('change', onScheme);
        new MutationObserver(() => draw()).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

        // départ
        (async () => {
            const a = opts.record?.media_a || opts.a, b = opts.record?.media_b || opts.b;
            if (opts.person) st.people.includes(Number(opts.person)) || st.people.push(Number(opts.person));
            drawPeople();
            await Promise.all([a ? setSide('a', a, {quiet: true, keepEyes: true}) : null, b ? setSide('b', b, {quiet: true, keepEyes: true}) : null]);
            if (!st.a.eyes || !st.b.eyes) st.aligned = false;
            field('a', st.a.item); field('b', st.b.item); drawPeople();
            syncUi(); resize(); computeScore(); paintModelInfo();
            if (st.id) { st.dirty = false; status('saved'); }
            opts.onReady?.(api_);
        })();
        const api_ = {
            root, state: st, save, draw, isDirty: () => st.dirty,
            destroy: () => { ac.abort(); ro.disconnect(); mq.removeEventListener?.('change', onScheme); },
        };
        return api_;
    }

    /** ouvre l'outil dans une fenêtre (plein écran par défaut, ⛶ pour la réduire) : {a, b} (médias), {id} (une comparaison enregistrée), {person} */
    async function open(opts = {}) {
        let record = null;
        if (opts.id) { try { record = (await api('photo_comparison', {id: opts.id})).comparison; } catch (e) { return toast(e.message, 'error'); } }
        document.querySelector('dialog.h-pc-dlg')?.close();
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-pc-dlg'; dlg.dataset.noFoot = '1';
        dlg.innerHTML = '<div class="h-pc-host"></div>';
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'photocmp', true); dlg.showModal();
        let tool = null;
        const close = async () => {
            if (tool?.isDirty() && !await A().confirmBox('Les derniers changements de la comparaison ne sont pas enregistrés.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: false})) return;
            tool?.destroy(); dlg.close();
        };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (dlg.querySelector('[data-pc-hint]:not([hidden])')) return; close(); });
        dlg.addEventListener('close', () => { tool?.destroy(); dlg.remove(); opts.onClose?.(); });
        tool = mount(dlg.querySelector('.h-pc-host'), {...opts, record, onRequestClose: close, onSaved: c => opts.onSaved?.(c)});
        return tool;
    }

    /** « Comparer avec… » : la photo de départ est A, on choisit B dans la fenêtre unique des médias */
    async function compareWith(a, {person = null} = {}) {
        const item = await mediaInfo(a);
        if (!item) return open({person});
        const pid = Number(person || (item.people_ids || [])[0] || 0) || null;
        const b = await P().openMediaPicker?.({types: ['image'], person: pid, eyebrow: 'COMPARER DEUX PHOTOS', title: i18n('Comparer avec…'), intro: i18n('La photo B, à poser à côté de « {name} ».', {name: item.title || i18n('la photo A')}), okLabel: i18n('Comparer'), portraits: true});
        if (!b) return null;
        if (Number(b.id) === Number(item.id)) { toast('C’est la même photo : choisis-en une autre.', 'error'); return null; }
        return open({a: item, b, person: pid});
    }
    ext.openPhotoCompare = open;
    ext.photoCompareWith = compareWith;
    ext.mountPhotoCompare = mount;

    /* ═════════ Les portes d'entrée ═════════ */
    // la visionneuse : « 🔍 Comparer avec… » ; sur une photo, c'est cet outil (un PDF garde l'ancien comparateur de documents)
    document.addEventListener('click', e => {
        const b = e.target.closest?.('#compare-media'); if (!b) return;
        const S = A()?.state, it = S?.lightboxMedia?.[S.lightboxIndex];
        if (!it || (A().normalizedMediaType?.(it) || it.media_type) !== 'image') return; // documents : le comparateur de documents
        e.preventDefault(); e.stopImmediatePropagation();
        compareWith(it, {person: S.currentPersonId || null});
    }, true);
    // la fiche : 🔍 dans le bloc Médias (posé tout seul à côté de « Ajouter des médias »)
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-photo-compare-person]'); if (!b) return;
        e.preventDefault(); const pid = Number(b.dataset.photoComparePerson) || null;
        (async () => {
            const a = await P().openMediaPicker?.({types: ['image'], person: pid, portraits: true, eyebrow: 'COMPARER DEUX PHOTOS', title: i18n('La photo A'), intro: i18n('Une photo de cette personne ; ensuite, la photo à comparer.'), okLabel: i18n('Suivant')});
            if (a) compareWith(a, {person: pid});
        })();
    });
    const addPersonButton = () => {
        const S = A()?.state; if (!S || S.module !== 'personnes' || !S.currentPersonId) return;
        document.querySelectorAll('[data-add-media-inline]').forEach(add => {
            const head = add.parentElement; if (!head || head.querySelector('[data-photo-compare-person]')) return;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-action'; b.dataset.photoComparePerson = add.dataset.addMediaInline || S.currentPersonId;
            b.title = i18n('Comparer deux photos (ressemblance, même personne à deux âges…)'); b.setAttribute('aria-label', b.title); b.textContent = '🔍';
            add.before(b);
        });
    };
    const watchWs = () => { const ws = document.getElementById('workspace'); if (!ws) return setTimeout(watchWs, 400); new MutationObserver(() => addPersonButton()).observe(ws, {childList: true, subtree: true}); addPersonButton(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchWs); else watchWs();

    // Listes → Outils de modification : les comparaisons enregistrées
    ext.editToolsExtra = ext.editToolsExtra || [];
    const thumbOf = m => (m?.filename ? `<img src="media/${esc(encodeURIComponent(m.thumbnail || m.filename))}" alt="">` : '<span class="h-et-ico">🖼</span>');
    ext.editToolsExtra.push({key: 'photocmp', icon: '🔍', label: 'Comparer deux photos', what: 'comparaison de photos',
        load: async () => ((await api('photo_comparisons')).items || []).map(c => ({id: c.id, name: c.title || 'Comparaison', date: c.updated_at,
            thumb: `<span class="h-pc-pair">${thumbOf(c.media_a)}${thumbOf(c.media_b)}</span>`,
            info: [c.people.map(p => p.name).filter(Boolean).join(', '), c.verdict].filter(Boolean).join(' · ') || 'Deux photos'})),
        open: (id, again) => open({id, onClose: again}),
        create: again => open({onClose: again}),
        rename: (id, name) => post('photo_comparison_write', {op: 'rename', id, title: name}),
        remove: id => post('photo_comparison_write', {op: 'delete', id}), createLabel: '＋ Nouvelle comparaison'});
})();
