/* LCNDA — 📜 Transcription d'actes : « 🎚️ Mieux voir » l'image de l'acte, et la barre d'outils réglable.
 *
 * 1. Les réglages de l'image (netteté, contraste local façon CLAHE, canal rouge / vert / bleu, seuil noir et blanc,
 *    niveaux, effacer le fond, redresser, miroir…) se calculent en local, dans un Web Worker (OffscreenCanvas) :
 *    l'écran ne fige jamais ; pendant qu'on bouge un curseur, un aperçu rapide (image réduite), puis l'image fine.
 * 2. La barre d'outils : disposition A (tout dans la barre) ou B (barre courte + panneau « 🎚️ Mieux voir »),
 *    boutons rangés, cachés, et (en B) placés dans la barre ou dans le panneau. Réglage :
 *    Maintenance → Montage, retouche, mise en page et son → « 📜 Transcription d'actes : barre d'outils »,
 *    ou « ⚙️ » dans l'outil. Gardé sur cet ordinateur (genealogie-transcribe-bar), avec ses « 💾 Réglages enregistrés ».
 * Utilisé par heritage-transcribe.js (ext.txView).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast(...a);

    /* ═════════ Les réglages de l'image ═════════ */
    const DEFAULT_VIEW = {contrast: 100, bright: 100, invert: false, rot: 0, gray: false, sharp: 0, sharpR: 1.5, clahe: 0, channel: '', thr: 0, lvB: 0, lvW: 255, lvG: 1, bg: false, tilt: 0, mirror: false};
    const viewOf = v => { const o = {...DEFAULT_VIEW, ...(v || {})}; ['contrast', 'bright', 'rot', 'sharp', 'sharpR', 'clahe', 'thr', 'lvB', 'lvW', 'lvG', 'tilt'].forEach(k => { o[k] = Number(o[k]); if (!Number.isFinite(o[k])) o[k] = DEFAULT_VIEW[k]; }); if (!['', 'r', 'g', 'b'].includes(o.channel)) o.channel = ''; return o; };
    /** ce qui demande un calcul pixel par pixel (sinon : l'image d'origine et un simple filtre CSS) */
    const needsPixels = v => v.sharp > 0 || v.clahe > 0 || !!v.channel || v.thr > 0 || !!v.bg || v.lvB > 0 || v.lvW < 255 || Math.abs(v.lvG - 1) > .001;
    const cssFilter = v => `contrast(${v.contrast}%) brightness(${v.bright}%)${v.invert ? ' invert(1)' : ''}${v.gray ? ' grayscale(1)' : ''}`;
    /** chaque réglage : est-il changé ? (pour la pastille « Mieux voir 3 ») */
    const CHANGED = {contrast: v => v.contrast !== 100, bright: v => v.bright !== 100, clahe: v => v.clahe > 0, sharp: v => v.sharp > 0, channel: v => !!v.channel, bg: v => !!v.bg, thr: v => v.thr > 0,
        levels: v => v.lvB > 0 || v.lvW < 255 || Math.abs(v.lvG - 1) > .001, tilt: v => Math.abs(v.tilt) > .001, mirror: v => !!v.mirror, invert: v => !!v.invert, gray: v => !!v.gray, rot: v => !!(v.rot % 360)};
    const changedCount = (v, keys) => keys.filter(k => CHANGED[k]?.(v)).length;

    /* ═════════ Le calcul (dans un Web Worker) ═════════ */
    function WORKER(self) {
        let src = null, small = null;
        const toF = (d, n) => { const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 4) { R[i] = d[j]; G[i] = d[j + 1]; B[i] = d[j + 2]; } return [R, G, B]; };
        /** flou en boîte (somme glissante), horizontal puis vertical ; 3 passes ≈ gaussien */
        function boxBlur(a, w, h, r, passes = 3) {
            r = Math.max(1, Math.round(r)); let s = a, t = new Float32Array(a.length);
            for (let p = 0; p < passes; p++) {
                const o = new Float32Array(a.length), k = 1 / (2 * r + 1);
                for (let y = 0; y < h; y++) { const row = y * w; let acc = 0; for (let x = -r; x <= r; x++) acc += s[row + Math.min(w - 1, Math.max(0, x))];
                    for (let x = 0; x < w; x++) { t[row + x] = acc * k; acc += s[row + Math.min(w - 1, x + r + 1)] - s[row + Math.max(0, x - r)]; } }
                for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += t[Math.min(h - 1, Math.max(0, y)) * w + x];
                    for (let y = 0; y < h; y++) { o[y * w + x] = acc * k; acc += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
                s = o;
            }
            return s;
        }
        /** le fond du papier (jaunissement, taches) : image réduite, « maximum » (l'encre fine disparaît), flou, agrandie */
        function background(a, w, h) {
            const f = Math.max(1, Math.ceil(Math.max(w, h) / 200)), sw = Math.ceil(w / f), sh = Math.ceil(h / f), sm = new Float32Array(sw * sh);
            for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let m = 0; for (let yy = y * f; yy < Math.min(h, y * f + f); yy++) for (let xx = x * f; xx < Math.min(w, x * f + f); xx++) { const v = a[yy * w + xx]; if (v > m) m = v; } sm[y * sw + x] = m; }
            const mx = new Float32Array(sm.length);
            for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = Math.min(sh - 1, Math.max(0, y + dy)), xx = Math.min(sw - 1, Math.max(0, x + dx)); const v = sm[yy * sw + xx]; if (v > m) m = v; } mx[y * sw + x] = m; }
            const bl = boxBlur(mx, sw, sh, 3), out = new Float32Array(w * h);
            for (let y = 0; y < h; y++) { const fy = Math.min(sh - 1.001, Math.max(0, (y + .5) / f - .5)), y0 = Math.floor(fy), ty = fy - y0, y1 = Math.min(sh - 1, y0 + 1);
                for (let x = 0; x < w; x++) { const fx = Math.min(sw - 1.001, Math.max(0, (x + .5) / f - .5)), x0 = Math.floor(fx), tx = fx - x0, x1 = Math.min(sw - 1, x0 + 1);
                    out[y * w + x] = (bl[y0 * sw + x0] * (1 - tx) + bl[y0 * sw + x1] * tx) * (1 - ty) + (bl[y1 * sw + x0] * (1 - tx) + bl[y1 * sw + x1] * tx) * ty; } }
            return out;
        }
        /** contraste local (CLAHE) sur la luminosité : 8 × 8 carreaux, histogramme écrêté, interpolation entre carreaux */
        function clahe(L, w, h, clip) {
            const T = 8, tw = w / T, th = h / T, luts = new Array(T * T);
            for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
                const hist = new Float32Array(256), x0 = Math.floor(tx * tw), x1 = Math.floor((tx + 1) * tw), y0 = Math.floor(ty * th), y1 = Math.floor((ty + 1) * th); let n = 0;
                for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[Math.max(0, Math.min(255, L[y * w + x] | 0))]++; n++; }
                const lim = Math.max(1, clip * n / 256); let ex = 0; for (let i = 0; i < 256; i++) if (hist[i] > lim) { ex += hist[i] - lim; hist[i] = lim; }
                const add = ex / 256, lut = new Float32Array(256); let c = 0; for (let i = 0; i < 256; i++) { c += hist[i] + add; lut[i] = n ? c / n * 255 : i; }
                luts[ty * T + tx] = lut;
            }
            const out = new Float32Array(w * h);
            for (let y = 0; y < h; y++) { const gy = Math.min(T - 1.0001, Math.max(0, y / th - .5)), a0 = Math.floor(gy), ay = gy - a0, a1 = Math.min(T - 1, a0 + 1);
                for (let x = 0; x < w; x++) { const gx = Math.min(T - 1.0001, Math.max(0, x / tw - .5)), b0 = Math.floor(gx), ax = gx - b0, b1 = Math.min(T - 1, b0 + 1), lv = Math.max(0, Math.min(254.999, L[y * w + x])), v = lv | 0, fv = lv - v;
                    // entre deux niveaux de gris aussi (sinon des cernes apparaissent sur les fonds dégradés)
                    const at = lut => lut[v] + (lut[v + 1] - lut[v]) * fv;
                    out[y * w + x] = (at(luts[a0 * T + b0]) * (1 - ax) + at(luts[a0 * T + b1]) * ax) * (1 - ay) + (at(luts[a1 * T + b0]) * (1 - ax) + at(luts[a1 * T + b1]) * ax) * ay; } }
            return out;
        }
        /** la chaîne complète ; p = les réglages, scale = taille de travail / taille de l'image (pour les rayons) */
        function run(img, p) {
            const {w, h, data} = img, n = w * h; let [R, G, B] = toF(data, n);
            if (p.channel) { const c = p.channel === 'r' ? R : p.channel === 'g' ? G : B; R = c; G = c.slice(); B = c.slice(); }
            if (p.bg) { const flat = c => { const bg = background(c, w, h); for (let i = 0; i < n; i++) c[i] = Math.min(255, c[i] / Math.max(8, bg[i]) * 245); return c; };
                if (p.channel) { flat(R); G.set(R); B.set(R); } else [R, G, B] = [R, G, B].map(flat); } // un seul canal : un seul calcul
            const lvl = p.lvB > 0 || p.lvW < 255 || Math.abs(p.lvG - 1) > .001, ct = p.contrast / 100, br = p.bright / 100;
            if (lvl || ct !== 1 || br !== 1) { const lb = p.lvB, span = Math.max(1, p.lvW - p.lvB), ig = 1 / Math.max(.05, p.lvG), lut = new Float32Array(256);
                for (let v = 0; v < 256; v++) { let x = lvl ? Math.pow(Math.min(1, Math.max(0, (v - lb) / span)), ig) * 255 : v; x = ((x / 255 - .5) * ct + .5) * 255 * br; lut[v] = x; }
                [R, G, B].forEach(c => { for (let i = 0; i < n; i++) { const v = c[i]; const v0 = Math.max(0, Math.min(255, v | 0)); c[i] = lut[v0]; } }); }
            let L = null; const lum = () => { L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = .299 * R[i] + .587 * G[i] + .114 * B[i]; return L; };
            if (p.clahe > 0) { lum(); const Lc = clahe(L, w, h, 1.5 + p.clahe / 40), k = Math.min(1, .25 + p.clahe / 80); for (let i = 0; i < n; i++) { const d = (Lc[i] - L[i]) * k; R[i] += d; G[i] += d; B[i] += d; } L = null; }
            if (p.sharp > 0) { lum(); const bl = boxBlur(L, w, h, Math.max(.5, p.sharpR * p.scale), 2), a = p.sharp / 100; for (let i = 0; i < n; i++) { const d = a * (L[i] - bl[i]); R[i] += d; G[i] += d; B[i] += d; } L = null; }
            const gray = p.gray || !!p.channel || p.thr > 0; if (gray) { lum(); R = G = B = L; }
            const out = new Uint8ClampedArray(n * 4), inv = !!p.invert, thr = p.thr;
            for (let i = 0, j = 0; i < n; i++, j += 4) {
                let r = R[i], g = G[i], b = B[i];
                if (thr > 0) r = g = b = r >= thr ? 255 : 0;
                if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; }
                out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = data[j + 3];
            }
            return out;
        }
        const read = (bm, w, h) => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d', {willReadFrequently: true}); g.imageSmoothingQuality = 'high'; g.drawImage(bm, 0, 0, w, h); return {w, h, data: g.getImageData(0, 0, w, h).data}; };
        const encode = async (img, out, type) => { const c = new OffscreenCanvas(img.w, img.h); c.getContext('2d').putImageData(new ImageData(out, img.w, img.h), 0, 0); return c.convertToBlob(type === 'jpeg' ? {type: 'image/jpeg', quality: .88} : {type: 'image/png'}); };
        self.onmessage = async e => {
            const m = e.data;
            try {
                if (m.type === 'src') { src = read(m.bitmap, m.w, m.h); small = read(m.small || m.bitmap, m.sw, m.sh); m.bitmap.close?.(); m.small?.close?.(); self.postMessage({type: 'ready', id: m.id}); return; }
                if (m.type === 'run') { const img = m.preview ? small : src; if (!img) return; const t0 = performance.now(), out = run(img, {...m.p, scale: img.w / m.natW}), ms = performance.now() - t0;
                    const blob = await encode(img, out, m.preview ? 'jpeg' : 'png'); self.postMessage({type: 'done', id: m.id, gen: m.gen, preview: m.preview, blob, w: img.w, h: img.h, ms}); return; }
                if (m.type === 'once') { const img = read(m.bitmap, m.w, m.h); m.bitmap.close?.(); const out = run(img, {...m.p, scale: 1}); self.postMessage({type: 'once', id: m.id, blob: await encode(img, out, 'png')}); }
            } catch (err) { self.postMessage({type: 'error', id: m.id, message: String(err?.message || err)}); }
        };
    }
    const WORK_MAX = 2400, PREVIEW_MAX = 800; // taille de travail (côté long) ; aperçu pendant qu'on bouge un curseur
    // l'image améliorée « pleine taille » (lecture, export) : au plus 8000 px de côté et 20 millions de pixels — une image énorme
    // (30 000 × 20 000…) demanderait plusieurs Go au calcul ; l'appelant la remet à la taille de l'image d'origine en la dessinant
    const FULL_MAX = 8000, FULL_AREA = 20e6;
    /** Un « développeur » par image : enhancer(imgElement, natW, natH, onImage(url, info)) */
    function enhancer(onImage) {
        let worker = null, ready = null, seq = 0, gen = 0, shownSeq = 0, lastShown = 0, busy = false, pending = null, fullTimer = 0, lastP = null, natW = 0, natH = 0, url = '', onceWait = new Map(), srcEl = null;
        let dead = false, workerUrl = ''; // dead : l'outil est fermé (stop) — plus rien ne se lance, les attentes se terminent
        const ok = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
        /** le calcul ne peut plus répondre (outil fermé, worker tombé) : chaque attente reçoit sa réponse au lieu d'attendre pour toujours */
        const failAll = message => { busy = false; pending = null; ready?.res?.(false); ready = null; onceWait.forEach(w => w.ko(new Error(message))); onceWait.clear(); };
        const start = () => {
            if (worker || !ok || dead) return worker;
            try { if (workerUrl) URL.revokeObjectURL(workerUrl); workerUrl = URL.createObjectURL(new Blob([`(${WORKER.toString()})(self)`], {type: 'text/javascript'})); worker = new Worker(workerUrl); } catch (_) { worker = null; return null; }
            // le worker tombe (mémoire…) : on le remplace au prochain calcul, et l'image est préparée de nouveau (hasSource)
            worker.onerror = e => { e.preventDefault?.(); console.warn('Mieux voir :', e.message || 'calcul interrompu'); try { worker?.terminate(); } catch (_) {} worker = null; failAll('Le calcul de l’image s’est arrêté (image trop grande ?).'); };
            worker.onmessage = e => {
                const m = e.data;
                if (m.type === 'ready') { if (ready && ready.id === m.id) ready.res(true); return; }
                if (m.type === 'error' && ready && ready.id === m.id) { console.warn('Mieux voir :', m.message); ready.res(false); ready = null; return; } // l'image n'a pas pu être préparée
                if (m.type === 'once' || (m.type === 'error' && onceWait.has(m.id))) { const w = onceWait.get(m.id); onceWait.delete(m.id); if (m.type === 'error') w?.ko(new Error(m.message)); else w?.ok(m.blob); return; }
                if (m.type === 'error') { busy = false; console.warn('Mieux voir :', m.message); next(); return; }
                if (m.type === 'done') {
                    busy = false;
                    { const u = URL.createObjectURL(m.blob), shown = ++shownSeq, pre = new Image(); pre.src = u;
                        // décodée hors du fil principal avant d'être montrée (sinon une grande image fige l'écran un instant)
                        pre.decode().catch(() => {}).then(() => { if (dead || shown < lastShown) { URL.revokeObjectURL(u); return; } lastShown = shown; const old = url; url = u; onImage(u, {preview: m.preview, ms: m.ms, w: m.w, h: m.h}); if (old && old !== u) setTimeout(() => URL.revokeObjectURL(old), 4000); }); }
                    next();
                }
            };
            return worker;
        };
        const next = () => { if (busy || !pending || !worker) return; const p = pending; pending = null; busy = true; worker.postMessage(p); };
        const api = {
            ok,
            /** l'image est-elle prête dans le worker (sinon : source() de nouveau, par exemple après un worker tombé) */
            hasSource: () => !dead && !!worker && !!ready,
            /** une nouvelle image : la taille de travail et l'aperçu sont préparés une fois ; false si c'est impossible (image cassée, outil fermé) */
            async source(imgEl, w, h) {
                natW = w; natH = h; srcEl = imgEl; lastP = null; if (!w || !h || !start()) return false;
                const k = Math.min(1, WORK_MAX / Math.max(w, h)), ks = Math.min(1, PREVIEW_MAX / Math.max(w, h));
                // le fichier est décodé et réduit hors du fil principal (createImageBitmap d'un Blob) : l'écran ne fige pas, même pour 6000 × 4000
                const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k)), SW = Math.max(1, Math.round(w * ks)), SH = Math.max(1, Math.round(h * ks));
                let bm, sbm;
                try { const blob = await (await fetch(imgEl.currentSrc || imgEl.src)).blob(); [bm, sbm] = await Promise.all([createImageBitmap(blob, {resizeWidth: W, resizeHeight: H, resizeQuality: 'high'}), createImageBitmap(blob, {resizeWidth: SW, resizeHeight: SH, resizeQuality: 'medium'})]); }
                catch (_) { try { bm = await createImageBitmap(imgEl); } catch (__) { return false; } sbm = null; }
                if (dead || !worker) { bm?.close?.(); sbm?.close?.(); return false; } // l'outil a été fermé pendant la préparation
                ready?.res?.(false); // une préparation plus ancienne qui attendait encore
                const r = ready = {id: ++seq}; r.p = new Promise(res => { r.res = res; });
                worker.postMessage({type: 'src', id: r.id, bitmap: bm, small: sbm, w: W, h: H, sw: SW, sh: SH}, sbm ? [bm, sbm] : [bm]);
                return r.p;
            },
            /** demander l'image pour ces réglages ; preview = pendant qu'on bouge (l'image fine suit 180 ms après) */
            async render(v, {preview = false} = {}) {
                if (!start() || !ready) return; if (!await ready.p || dead) return;
                const p = {...v}, g = ++gen; lastP = p; clearTimeout(fullTimer);
                // toujours d'abord l'aperçu (image réduite, quelques dizaines de ms), puis l'image fine : 180 ms après le dernier mouvement d'un curseur
                pending = {type: 'run', id: ++seq, gen: g, p, preview: true, natW}; next();
                fullTimer = setTimeout(() => { if (lastP === p) { pending = {type: 'run', id: ++seq, gen: g, p, preview: false, natW}; next(); } }, preview ? 180 : 0);
            },
            /** l'image améliorée en pleine taille (lecture, export) → Blob PNG */
            async full(v) {
                if (!start() || !srcEl || !natW || !natH) throw new Error('Calcul impossible ici.');
                const k = Math.min(1, FULL_MAX / Math.max(natW, natH), Math.sqrt(FULL_AREA / (natW * natH))), W = Math.max(1, Math.round(natW * k)), H = Math.max(1, Math.round(natH * k));
                let bm; try { bm = await createImageBitmap(await (await fetch(srcEl.currentSrc || srcEl.src)).blob(), {resizeWidth: W, resizeHeight: H, resizeQuality: 'high'}); } catch (_) { bm = await createImageBitmap(srcEl, {resizeWidth: W, resizeHeight: H, resizeQuality: 'high'}); }
                if (dead || !worker) { bm.close?.(); throw new Error('Outil fermé.'); }
                const id = ++seq;
                return new Promise((okp, ko) => { onceWait.set(id, {ok: okp, ko}); worker.postMessage({type: 'once', id, bitmap: bm, w: W, h: H, p: {...v, sharpR: v.sharpR * k}}, [bm]); });
            },
            /** l'outil se ferme : le worker s'arrête, les attentes se terminent, les images en mémoire sont rendues */
            stop() { dead = true; clearTimeout(fullTimer); worker?.terminate(); worker = null; failAll('Outil fermé.'); if (url) URL.revokeObjectURL(url); url = ''; if (workerUrl) URL.revokeObjectURL(workerUrl); workerUrl = ''; },
        };
        return api;
    }

    /* ═════════ La barre d'outils : A (tout dans la barre) ou B (barre courte + « 🎚️ Mieux voir ») ═════════ */
    const RUBRICS = [['ink', 'Faire ressortir l’encre'], ['bw', 'Noir et blanc'], ['pos', 'Position'], ['nav', 'Autres outils'], ['act', '']];
    const rg = (key, label, min, max, step, val, unit, def, extra = '') => `<label class="h-tx-rg" title="${esc(label)} — double-clic : valeur de départ"><span class="h-tx-rgl">${label}</span><input type="range" data-tx-view="${key}" min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit}" data-default="${def}" aria-label="${esc(label)}"${extra}></label>`;
    const ck = (key, label, v, title = '') => `<label class="checkbox-line h-tx-ck"${title ? ` title="${esc(title)}"` : ''}><input type="checkbox" data-tx-view="${key}" ${v[key] ? 'checked' : ''}>${label}</label>`;
    /** [clé, nom (Maintenance), rubrique, html(v, dansLePanneau)] — l'ordre est celui de départ */
    const ITEMS = [
        ['image', '🖼️ Image de l’acte', 'nav', () => `<button type="button" data-tx-cmd="image" title="Choisir l’image de l’acte (base ou ordinateur)">🖼️ Image…</button>`],
        ['tools', '✋ Déplacer · ▭ Zone', 'nav', () => `<button type="button" data-tx-tool="pan" title="Déplacer l’image, ou barre d’espace" data-shortcut="H">✋</button><button type="button" data-tx-tool="zone" title="Dessiner une zone (elle se relie au passage choisi dans le texte)" data-shortcut="Z" data-help="Choisis un passage dans le texte, puis dessine un rectangle sur l’image : les deux restent liés (un clic sur l’un montre l’autre). Une zone choisie a 8 poignées pour changer sa taille ; glisse-la pour la déplacer.">▭ Zone</button>`],
        ['zoom', '－ ⤢ ＋ Zoom', 'nav', () => `<button type="button" data-tx-cmd="zout" title="Zoom arrière (ou la molette, ou pincer)">－</button><button type="button" class="h-tx-zoomlab" data-tx-cmd="fit" data-tx-zoomlab title="Ajuster l’image : Toute l’image → Largeur → Taille réelle (100 %)"><span aria-hidden="true">⤢</span> <b data-tx-zoomtxt>Toute l’image</b></button><button type="button" data-tx-cmd="zin" title="Zoom avant (ou la molette, ou pincer)">＋</button>`],
        ['rot', '⟳ Tourner de 90°', 'pos', () => `<button type="button" data-tx-cmd="rot" title="Tourner de 90°">⟳</button>`],
        ['contrast', '◐ Contraste', 'ink', v => rg('contrast', '◐', 50, 300, 1, v.contrast, '%', 100)],
        ['bright', '☀ Luminosité', 'ink', v => rg('bright', '☀', 40, 220, 1, v.bright, '%', 100)],
        ['clahe', 'Contraste local', 'ink', v => rg('clahe', 'Contraste local', 0, 100, 1, v.clahe, '', 0)],
        ['sharp', 'Netteté (et son rayon)', 'ink', (v, inPanel) => `<span class="h-tx-pair">${rg('sharp', 'Netteté', 0, 300, 5, v.sharp, '%', 0)}${rg('sharpR', inPanel ? 'rayon' : 'r', .5, 5, .1, v.sharpR, 'px', 1.5)}</span>`],
        ['channel', 'Canal de couleur', 'ink', (v, inPanel) => `<span class="h-tx-chanw">${inPanel ? '<span class="h-tx-rgl">Canal de couleur</span>' : ''}<span class="segmented h-tx-seg" role="group" aria-label="Canal de couleur" title="Un seul canal : l’encre ferro-gallique ressort souvent mieux sur le rouge ou le bleu">${[['', inPanel ? 'Tout' : 'RVB', 'Toutes les couleurs'], ['r', inPanel ? 'Rouge' : 'R', 'Canal rouge seul'], ['g', inPanel ? 'Vert' : 'V', 'Canal vert seul'], ['b', inPanel ? 'Bleu' : 'B', 'Canal bleu seul']].map(([k, l, ti]) => `<button type="button" data-tx-chan="${k}" class="${v.channel === k ? 'is-active' : ''}" title="${ti}" aria-pressed="${v.channel === k}">${l}</button>`).join('')}</span></span>`],
        ['bg', 'Effacer le fond', 'ink', v => ck('bg', 'Effacer le fond', v, 'Jaunissement et taches : le papier redevient blanc, l’encre reste')],
        ['thr', 'Seuil noir et blanc', 'bw', v => rg('thr', 'Seuil', 0, 254, 1, v.thr, '', 0, ' title="Seuil noir et blanc (0 = sans)"')],
        ['levels', 'Niveaux (noir, blanc, gamma)', 'bw', (v, inPanel) => `<span class="h-tx-pair h-tx-levels">${inPanel ? '' : '<span class="h-tx-rgl">Niveaux</span>'}${rg('lvB', inPanel ? 'Point noir' : 'noir', 0, 200, 1, v.lvB, '', 0)}${rg('lvW', inPanel ? 'Point blanc' : 'blanc', 55, 255, 1, v.lvW, '', 255)}${rg('lvG', inPanel ? 'Gamma' : 'γ', .3, 3, .05, v.lvG, '', 1)}</span>`],
        ['tilt', 'Redresser (au degré près)', 'pos', v => rg('tilt', 'Redresser', -10, 10, .1, v.tilt, '°', 0)],
        ['invert', 'Négatif', 'pos', v => ck('invert', 'Négatif', v, 'Négatif : encre claire sur fond sombre')],
        ['gray', 'Gris', 'pos', v => ck('gray', 'Gris', v)],
        ['mirror', 'Miroir', 'pos', v => ck('mirror', 'Miroir', v, 'Retourner l’image : pour lire un texte vu par transparence (le verso)')],
        ['loupe', '🔍 Loupe', 'nav', () => `<button type="button" data-tx-cmd="loupe" title="Loupe qui suit la souris (la molette change le grossissement)" data-shortcut="L">🔍 Loupe</button>`],
        ['keep', '💾 Retenir pour cet acte', 'act', () => `<button type="button" data-tx-cmd="keepview" title="Ces réglages de l’image sont enregistrés avec l’acte et reviennent à la prochaine ouverture">💾 Retenir pour cet acte</button>`],
        ['reset', '↺ Image d’origine', 'act', (v, inPanel, layout) => `<button type="button" data-tx-cmd="resetview" title="Remettre l’image d’origine (tous les réglages de l’image à zéro)">↺ ${layout === 'B' && !inPanel ? 'Origine' : 'Image d’origine'}</button>`],
    ];
    const ITEM_KEYS = ITEMS.map(i => i[0]), itemOf = k => ITEMS.find(i => i[0] === k);
    const DEFAULT_PANEL = ['clahe', 'sharp', 'channel', 'bg', 'thr', 'levels', 'tilt', 'invert', 'gray', 'mirror', 'keep'];
    const BAR_KEY = 'genealogie-transcribe-bar', SETS_KEY = 'genealogie-toolbar-sets', SETS_ID = 'transcribe';
    const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast('Plus de place pour garder ce réglage.', 'error'); return false; } };
    /** {layout: 'A'|'B', order: [clés], hidden: [clés], panel: [clés dans « Mieux voir » en B]} */
    const cleanBar = v => { v = v && typeof v === 'object' ? v : {}; const keys = a => (Array.isArray(a) ? a : []).filter(k => ITEM_KEYS.includes(k));
        const order = [...new Set([...keys(v.order), ...ITEM_KEYS])]; return {layout: v.layout === 'B' ? 'B' : 'A', order, hidden: keys(v.hidden), panel: Array.isArray(v.panel) ? keys(v.panel) : [...DEFAULT_PANEL]}; };
    const barCfg = () => cleanBar(readJson(BAR_KEY, {}));
    const saveBar = cfg => { if (writeJson(BAR_KEY, cleanBar(cfg))) window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); };
    /** le HTML des outils de gauche, selon la disposition */
    function toolbarHtml(v, cfg = barCfg(), {narrow = false} = {}) {
        // un écran étroit (téléphone, fenêtre réduite) : la disposition A passerait sur toute la hauteur de l'image → les réglages vont dans « Mieux voir »
        if (narrow && cfg.layout !== 'B') cfg = {...cfg, layout: 'B', auto: true, panel: cfg.panel.length ? cfg.panel : [...DEFAULT_PANEL]};
        const shown = cfg.order.filter(k => !cfg.hidden.includes(k));
        const piece = (k, inPanel = false) => `<span class="h-tx-ctl" data-tx-item="${k}">${itemOf(k)[3](v, inPanel, cfg.layout)}</span>`;
        if (cfg.layout !== 'B') return `<div class="h-tx-tools h-tx-tools-a" data-tx-bar data-layout="A">${shown.map(k => piece(k)).join('')}<span class="h-tx-ctl h-tx-cfg">${cfgButton()}</span></div>`;
        const inBar = shown.filter(k => !cfg.panel.includes(k)), inPanel = shown.filter(k => cfg.panel.includes(k));
        const rubric = ([rk, rl]) => { const list = inPanel.filter(k => itemOf(k)[2] === rk); if (!list.length) return ''; return `<section class="h-tx-rub${rk === 'act' ? ' h-tx-rub-act' : ''}">${rl ? `<h4>${esc(rl)}</h4>` : ''}${list.map(k => piece(k, true)).join('')}</section>`; };
        const better = inPanel.length ? `<span class="h-tx-ctl h-tx-betterw" data-tx-item="better"><button type="button" class="h-tx-betterbtn" data-tx-cmd="better" aria-expanded="false" aria-haspopup="true" title="Les autres réglages de l’image : contraste local, netteté, canal, seuil, niveaux, redresser…">🎚️ Mieux voir ▾ <b class="h-tx-badge" data-tx-badge hidden></b></button>
            <div class="h-tx-better" data-tx-panel hidden role="dialog" aria-label="Mieux voir">${RUBRICS.map(rubric).join('')}</div></span>` : '';
        // « Mieux voir » prend la place du premier réglage rangé dans le panneau (après Contraste et Luminosité au départ)
        const firstPanelIdx = shown.findIndex(k => cfg.panel.includes(k)), before = inBar.filter(k => shown.indexOf(k) < firstPanelIdx || firstPanelIdx < 0), after = inBar.filter(k => !before.includes(k));
        return `<div class="h-tx-tools h-tx-tools-b" data-tx-bar data-layout="B"${cfg.auto ? ' data-auto="1" title="Écran étroit : les réglages sont rangés dans « 🎚️ Mieux voir »"' : ''}>${before.map(k => piece(k)).join('')}${better}${after.map(k => piece(k)).join('')}<span class="h-tx-ctl h-tx-cfg">${cfgButton()}</span></div>`;
    }
    const cfgButton = () => `<button type="button" class="h-tx-cfgbtn" data-tx-cmd="barcfg" title="Ranger, montrer ou cacher les boutons de cette barre ; disposition A ou B (aussi dans Maintenance → Montage, retouche, mise en page et son)" aria-label="Personnaliser la barre">⚙️</button>`;
    const panelKeys = (cfg = barCfg(), narrow = false) => (cfg.layout === 'B' || narrow ? cfg.order.filter(k => !cfg.hidden.includes(k) && cfg.panel.includes(k)) : []);
    const badgeKeys = (cfg = barCfg()) => panelKeys(cfg).flatMap(k => (k === 'sharp' ? ['sharp'] : [k]));

    /* ─── le réglage de la barre : Maintenance, et « ⚙️ » dans l'outil ─── */
    const setsList = () => { const v = readJson(SETS_KEY, {})[SETS_ID]; return Array.isArray(v) ? v.filter(x => x && x.name && x.v).map(x => ({...x, v: cleanBar(x.v)})) : []; };
    const setsSave = list => { const all = readJson(SETS_KEY, {}); all[SETS_ID] = list.slice(-60); return writeJson(SETS_KEY, all); };
    function prefsHtml(cfg = barCfg()) {
        const sets = setsList(), B = cfg.layout === 'B';
        const row = k => { const [, label, rub] = itemOf(k); return `<li class="h-pet-lrow h-txb-row" data-k="${k}"><input type="checkbox" ${cfg.hidden.includes(k) ? '' : 'checked'} title="👁 Montrer dans la barre" aria-label="Montrer ${esc(label)}"><span>${esc(label)}</span>
            ${B ? `<select data-txb-place aria-label="Où va ${esc(label)}" title="Dans la barre, ou dans le panneau « 🎚️ Mieux voir »"><option value="bar" ${cfg.panel.includes(k) ? '' : 'selected'}>Dans la barre</option><option value="panel" ${cfg.panel.includes(k) ? 'selected' : ''}>Dans « Mieux voir »${rub === 'nav' || rub === 'act' ? '' : ` · ${esc((RUBRICS.find(r => r[0] === rub) || [])[1] || '')}`}</option></select>` : ''}
            <button type="button" class="h-bt" data-txb-up title="Monter">↑</button><button type="button" class="h-bt" data-txb-down title="Descendre">↓</button></li>`; };
        return `<div class="h-txb">
            <div class="h-txb-layout"><span class="h-txb-lab">Disposition</span><span class="segmented h-txb-seg" role="group" aria-label="Disposition de la barre">
                <button type="button" data-txb-layout="A" class="${B ? '' : 'is-active'}" aria-pressed="${!B}" title="Tous les réglages dans la barre ; elle passe à la ligne s’il le faut">A · Tout dans la barre</button>
                <button type="button" data-txb-layout="B" class="${B ? 'is-active' : ''}" aria-pressed="${B}" title="Une barre courte ; les autres réglages dans le panneau « 🎚️ Mieux voir », rangés en trois rubriques">B · Barre courte + « 🎚️ Mieux voir »</button></span></div>
            <div class="h-pp-presets h-mtp-presets" data-txb-sets><strong>💾 Réglages enregistrés</strong>${sets.length ? `<select data-txb-pick aria-label="Réglages enregistrés">${sets.map((x, i) => `<option value="${i}">${esc(x.name)}${x.date ? ' — ' + esc(x.date) : ''}</option>`).join('')}</select><button type="button" class="button small" data-txb-apply>Appliquer</button><button type="button" class="button small secondary" data-txb-export title="Exporter ce réglage dans un fichier">⤓ Exporter</button><button type="button" class="button small secondary" data-txb-del title="Supprimer ces réglages enregistrés">🗑</button>` : '<span class="muted">Aucun pour l’instant.</span>'}
                <button type="button" class="button small secondary" data-txb-save title="Garder cette barre (disposition, ordre, boutons montrés) sous un nom">💾 Enregistrer sous ce nom…</button><button type="button" class="button small secondary" data-txb-import title="Un fichier .json exporté depuis LCNDA">⤒ Importer un réglage</button></div>
            <p class="muted">Coche ce qu’on montre (👁), range avec ↑ ↓ (ou en glissant ⠿)${B ? ', et choisis ce qui va dans la barre ou dans le panneau « 🎚️ Mieux voir »' : ''}. Gardé aussitôt ; l’outil ouvert suit tout de suite.</p>
            <ol class="h-pet-layout h-txb-list" data-txb-list>${cfg.order.map(row).join('')}</ol>
            <button type="button" class="button small secondary" data-txb-reset>↺ Réinitialiser</button></div>`;
    }
    function prefsBind(box, redraw) {
        const cur = () => { const lis = [...box.querySelectorAll('[data-txb-list] > li')], c = barCfg(); return cleanBar({layout: c.layout, order: lis.map(l => l.dataset.k), hidden: lis.filter(l => !l.querySelector('input[type=checkbox]').checked).map(l => l.dataset.k),
            panel: lis.some(l => l.querySelector('[data-txb-place]')) ? lis.filter(l => l.querySelector('[data-txb-place]')?.value === 'panel').map(l => l.dataset.k) : c.panel}); };
        const keep = () => saveBar(cur());
        box.addEventListener('click', async e => {
            const li = e.target.closest('li');
            if (e.target.closest('[data-txb-up]') && li?.previousElementSibling) { li.parentNode.insertBefore(li, li.previousElementSibling); keep(); return; }
            if (e.target.closest('[data-txb-down]') && li?.nextElementSibling) { li.parentNode.insertBefore(li.nextElementSibling, li); keep(); return; }
            const lay = e.target.closest('[data-txb-layout]'); if (lay) { const c = cur(); c.layout = lay.dataset.txbLayout; saveBar(c); redraw(); return; }
            if (e.target.closest('[data-txb-reset]')) { const before = readJson(BAR_KEY, null); try { localStorage.removeItem(BAR_KEY); } catch (_) {} window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); redraw();
                A().undoToast?.('Barre de la transcription remise comme au départ', {undo: () => { if (before) saveBar(before); redraw(); }, redo: () => { try { localStorage.removeItem(BAR_KEY); } catch (_) {} window.dispatchEvent(new CustomEvent('lcnda-txbar-change')); redraw(); }}); return; }
            const picked = () => setsList()[Number(box.querySelector('[data-txb-pick]')?.value)] || null;
            if (e.target.closest('[data-txb-apply]')) { const x = picked(); if (!x) return; saveBar(x.v); redraw(); toast(`Réglages « ${x.name} » appliqués.`); return; }
            if (e.target.closest('[data-txb-export]')) { const x = picked(); if (x) ext.reglageExport?.('boutons-transcribe', x.name, x.v); return; }
            if (e.target.closest('[data-txb-del]')) { const x = picked(); if (!x) return; A().undoLocalChange?.(`Réglages « ${x.name} » supprimés`, [SETS_KEY], () => setsSave(setsList().filter(y => y.name !== x.name)), () => redraw()); redraw(); return; }
            if (e.target.closest('[data-txb-save]')) { const name = String((await A().askText?.({title: 'Réglages enregistrés', message: 'Nom de cette barre (disposition, ordre, boutons montrés) :', value: '', okLabel: 'Enregistrer'})) ?? '').trim().slice(0, 60); if (!name) return;
                setsSave([...setsList().filter(y => y.name !== name), {name, date: new Date().toLocaleDateString('fr-FR'), v: cur()}]); redraw(); toast(`Réglages « ${name} » enregistrés.`); return; }
            if (e.target.closest('[data-txb-import]')) { const r = await ext.reglageImport?.('boutons-transcribe', {names: setsList().map(y => y.name), check: v => !!v && typeof v === 'object'}); if (!r) return;
                setsSave([...setsList().filter(y => y.name !== r.nom), {name: r.nom, date: new Date().toLocaleDateString('fr-FR'), v: cleanBar(r.donnees)}]); redraw(); toast(`Réglages « ${r.nom} » importés : « Appliquer » pour les utiliser.`); }
        });
        box.addEventListener('change', e => { if (e.target.closest('[data-txb-list]')) keep(); });
    }
    /** ⚙️ dans l'outil : la même liste, dans une fenêtre */
    function openBarDialog(parent) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-tbcfg h-txb-dlg';
        const paint = () => { dlg.querySelector('[data-txb-box]').innerHTML = prefsHtml(); };
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">PERSONNALISER</span><h2>⚙️ Barre de la transcription</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="h-tbcfg-body" data-txb-box></div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-x>Fermer</button></div>`;
        (parent || document.body).appendChild(dlg); paint(); prefsBind(dlg.querySelector('[data-txb-box]'), paint);
        dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
        dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }

    ext.txView = {DEFAULT_VIEW, viewOf, needsPixels, cssFilter, changedCount, CHANGED, enhancer, toolbarHtml, barCfg, saveBar, cleanBar, panelKeys, badgeKeys, openBarDialog, ITEMS, DEFAULT_PANEL};
    // Maintenance → Montage, retouche, mise en page et son → « 📜 Transcription d'actes : barre d'outils »
    ext.transcribePrefs = {html: () => prefsHtml(), bind: (box, redraw) => prefsBind(box, redraw)};
})();
