/* LCNDA — 🎞️ Présentation et diaporama : des photos (avec un lent mouvement de caméra), des titres, des cartes où se dessine un
 * trajet (une migration, les lieux d'une vie), une voix enregistrée sur chaque diapositive, une musique qui baisse quand
 * la voix parle ; tout se lit ici en plein écran et s'exporte en vidéo. « ✨ Récit d'une personne » fabrique tout seul le
 * diaporama d'une vie (photos, lieux, carte du trajet, biographie). Plus simple que le montage vidéo.
 * Serveur : lib/slideshows.php. Listes → Outils de modification → « 🎞️ Présentation et diaporama ».
 * « ＋ Nouveau » propose aussi la présentation façon Keynote (heritage-keynote.js), enregistrée dans la même liste.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let seq = 0; const sid = () => 's' + Date.now().toString(36) + (++seq);
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    const ASPECTS = {'16:9': [1280, 720], '4:3': [1024, 768], '1:1': [900, 900], '9:16': [720, 1280]};
    const THEMES = {classique: {label: 'Classique', bg: '#111111', fg: '#ffffff', accent: '#e8c27a', font: 'Georgia, serif'}, ancien: {label: 'Album ancien', bg: '#2a2117', fg: '#f3e6c8', accent: '#c9a25a', font: '"Palatino Linotype", Palatino, Georgia, serif'},
        clair: {label: 'Clair', bg: '#f5f2ea', fg: '#222222', accent: '#8a5a2b', font: 'Georgia, serif'}, moderne: {label: 'Moderne', bg: '#0e1a2b', fg: '#ffffff', accent: '#5ec2ff', font: 'Helvetica, Arial, sans-serif'}};
    const KB = [['in', 'Zoom avant lent'], ['out', 'Zoom arrière lent'], ['left', 'Glisser vers la gauche'], ['right', 'Glisser vers la droite'], ['up', 'Monter'], ['none', 'Immobile']];
    const TRANS = [['fade', 'Fondu'], ['slide', 'Glissement'], ['black', 'Fondu au noir'], ['none', 'Coupe nette']];
    const newShow = () => ({aspect: '16:9', theme: 'classique', music: null, musicVol: .5, slides: []});
    const newSlide = (type, o = {}) => ({id: sid(), type, dur: type === 'map' ? 10 : type === 'title' ? 5 : 6, trans: 'fade', kb: ['in', 'out', 'left', 'right'][seq % 4], text: '', textPos: 'bottom', ...o});

    /* ═════════ Cartes : fond assemblé en tuiles autour d'un trajet ═════════ */
    const mercY = lat => { const r = clamp(lat, -85, 85) * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); };
    const wx = lon => (lon + 180) / 360, wy = lat => (1 - mercY(lat) / Math.PI) / 2;
    async function mapBackground(route, W, H, bg) {
        const pts = route.filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && (p.lat || p.lon)); if (!pts.length) return null;
        let x0 = Math.min(...pts.map(p => wx(+p.lon))), x1 = Math.max(...pts.map(p => wx(+p.lon))), y0 = Math.min(...pts.map(p => wy(+p.lat))), y1 = Math.max(...pts.map(p => wy(+p.lat)));
        // une marge, au moins un petit pays de large, aux proportions de l'écran
        let w = Math.max(x1 - x0, 0.004) * 1.5, h = Math.max(y1 - y0, 0.004) * 1.5; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        if (w / h > W / H) h = w * H / W; else w = h * W / H;
        x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
        const z = clamp(Math.round(Math.log2(W * 1.3 / (w * 256))), 2, 16), n = 2 ** z, tx0 = Math.floor(x0 * n), tx1 = Math.floor(x1 * n), ty0 = Math.floor(y0 * n), ty1 = Math.floor(y1 * n);
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, W, H);
        const sx = W / (w * n * 256);
        const url = (tx, ty) => bg === 'offline' || !A().mapTileUrl ? A().offlineTileUrl(z, tx, ty) : A().mapTileUrl(bg, z, tx, ty);
        if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 100) await Promise.all([...Array(tx1 - tx0 + 1)].flatMap((_, i) => [...Array(ty1 - ty0 + 1)].map(async (__, j) => {
            const tx = tx0 + i, ty = ty0 + j; if (ty < 0 || ty >= n) return;
            const im = await new Promise(res => { const m = new Image(); m.crossOrigin = 'anonymous'; m.onload = () => res(m); m.onerror = () => res(null); m.src = url(((tx % n) + n) % n, ty); });
            if (im) g.drawImage(im, (tx - x0 * n) * 256 * sx, (ty - y0 * n) * 256 * sx, 256 * sx + .5, 256 * sx + .5); })));
        // une couleur un peu passée, pour que le trajet ressorte
        g.fillStyle = 'rgba(245,238,220,.28)'; g.fillRect(0, 0, W, H);
        return {canvas: c, proj: (lat, lon) => [(wx(lon) - x0) / w * W, (wy(lat) - y0) / h * H]};
    }

    /* ═════════ Le moteur : dessiner l'image du temps t ═════════ */
    function makeEngine(show, canvas) {
        const [W, H] = ASPECTS[show.aspect] || ASPECTS['16:9'];
        canvas.width = W; canvas.height = H;
        const g = canvas.getContext('2d'), T = THEMES[show.theme] || THEMES.classique;
        const imgs = new Map(), maps = new Map();
        const starts = () => { let t = 0; return show.slides.map(s => { const a = t; t += Math.max(1, +s.dur || 5); return a; }); };
        const total = () => show.slides.reduce((a, s) => a + Math.max(1, +s.dur || 5), 0);
        async function prepare() {
            await Promise.all(show.slides.map(async s => {
                if (s.type === 'photo' && s.filename && !imgs.has(s.filename)) { const im = new Image(); im.decoding = 'async'; im.src = mediaUrl(s.filename); try { await im.decode(); imgs.set(s.filename, im); } catch (_) { imgs.set(s.filename, null); } }
                if (s.type === 'map') { const key = JSON.stringify([s.route, s.mapBg, W, H]); if (!maps.has(s.id) || maps.get(s.id).key !== key) maps.set(s.id, {key, m: await mapBackground(s.route || [], W, H, s.mapBg || 'offline')}); }
            }));
        }
        const wrapText = (text, maxW) => { const out = []; String(text || '').split('\n').forEach(par => { let line = ''; par.split(/\s+/).filter(Boolean).forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); out.push(line); }); return out; };
        function caption(s, alpha) {
            if (!s.text) return; const size = Math.round(H * .042); g.save(); g.globalAlpha = alpha; g.font = `${size}px ${T.font}`;
            const lines = wrapText(s.text, W * .82).slice(0, 5), lh = size * 1.3, bh = lines.length * lh + size * .9;
            const y = s.textPos === 'top' ? H * .05 : s.textPos === 'center' ? (H - bh) / 2 : H - bh - H * .05;
            g.fillStyle = 'rgba(0,0,0,.52)'; g.fillRect(W * .06, y, W * .88, bh);
            g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'top'; lines.forEach((l, i) => g.fillText(l, W / 2, y + size * .45 + i * lh)); g.restore();
        }
        function drawSlide(s, local, alpha = 1, dx = 0) {
            const d = Math.max(1, +s.dur || 5), p = clamp(local / d, 0, 1);
            g.save(); g.globalAlpha = alpha; if (dx) g.translate(dx, 0);
            if (s.type === 'photo') {
                g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
                const im = imgs.get(s.filename);
                if (im) { // l'image couvre l'écran (ou y tient, si « entière »), puis le mouvement lent
                    const cover = s.fit !== 'contain', k0 = cover ? Math.max(W / im.naturalWidth, H / im.naturalHeight) : Math.min(W / im.naturalWidth, H / im.naturalHeight);
                    let k = k0, ox = 0, oy = 0; const m = .12;
                    if (s.kb === 'in') k = k0 * (1 + m * p); if (s.kb === 'out') k = k0 * (1 + m * (1 - p));
                    if (['left', 'right', 'up'].includes(s.kb)) { k = k0 * (1 + m); const ex = (im.naturalWidth * k - W) / 2, ey = (im.naturalHeight * k - H) / 2; if (s.kb === 'left') ox = ex * (1 - 2 * p); if (s.kb === 'right') ox = -ex * (1 - 2 * p); if (s.kb === 'up') oy = ey * (1 - 2 * p); }
                    const iw = im.naturalWidth * k, ih = im.naturalHeight * k;
                    if (!cover) { g.save(); g.filter = 'blur(24px) brightness(.55)'; const kb2 = Math.max(W / im.naturalWidth, H / im.naturalHeight) * 1.1; g.drawImage(im, (W - im.naturalWidth * kb2) / 2, (H - im.naturalHeight * kb2) / 2, im.naturalWidth * kb2, im.naturalHeight * kb2); g.restore(); }
                    g.drawImage(im, (W - iw) / 2 + ox, (H - ih) / 2 + oy, iw, ih);
                }
                caption(s, 1);
            } else if (s.type === 'title') {
                g.fillStyle = s.bg || T.bg; g.fillRect(0, 0, W, H);
                const a = clamp(local / .9, 0, 1), fg = s.fg || T.fg;
                g.globalAlpha = alpha * a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
                const ts = Math.round(H * .085); g.font = `${ts}px ${T.font}`;
                const lines = wrapText(s.title || '', W * .8).slice(0, 3); lines.forEach((l, i) => g.fillText(l, W / 2, H * .44 + (i - (lines.length - 1) / 2) * ts * 1.2));
                g.strokeStyle = T.accent; g.lineWidth = Math.max(1.5, H * .003); const ly = H * .44 + lines.length * ts * .6 + ts * .35; g.beginPath(); g.moveTo(W / 2 - W * .12 * a, ly); g.lineTo(W / 2 + W * .12 * a, ly); g.stroke();
                if (s.sub) { g.font = `italic ${Math.round(H * .042)}px ${T.font}`; g.fillStyle = T.accent; wrapText(s.sub, W * .75).slice(0, 4).forEach((l, i) => g.fillText(l, W / 2, ly + H * .07 + i * H * .055)); }
            } else if (s.type === 'map') {
                const mp = maps.get(s.id)?.m;
                if (mp) g.drawImage(mp.canvas, 0, 0); else { g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, W, H); }
                const route = (s.route || []).filter(q => Number.isFinite(+q.lat) && Number.isFinite(+q.lon) && (q.lat || q.lon));
                if (mp && route.length) {
                    const P = route.map(q => mp.proj(+q.lat, +q.lon)), segs = P.slice(1).map((q, i) => Math.hypot(q[0] - P[i][0], q[1] - P[i][1])), L = segs.reduce((a, b) => a + b, 0) || 1;
                    const prog = clamp(local / (d * .82), 0, 1) * L; let acc = 0, head = P[0], reached = 1;
                    // le trajet se dessine : trait clair dessous, rouge dessus ; une courbe douce entre deux lieux
                    g.lineCap = 'round'; g.lineJoin = 'round';
                    const pathTo = () => { g.beginPath(); g.moveTo(P[0][0], P[0][1]); acc = 0; reached = 1; head = P[0]; for (let i = 0; i < segs.length; i++) { const a = P[i], b = P[i + 1]; if (acc + segs[i] <= prog) { g.lineTo(b[0], b[1]); acc += segs[i]; reached = i + 2; head = b; } else { const f = (prog - acc) / (segs[i] || 1); head = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; g.lineTo(head[0], head[1]); break; } } };
                    pathTo(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = H * .014; g.stroke();
                    pathTo(); g.strokeStyle = s.color || '#c0392b'; g.lineWidth = H * .007; g.setLineDash([H * .02, H * .012]); g.stroke(); g.setLineDash([]);
                    const fs = Math.round(H * .03);
                    P.slice(0, reached).forEach(([x, y], i) => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, H * .013, 0, 7); g.fill(); g.fillStyle = s.color || '#c0392b'; g.beginPath(); g.arc(x, y, H * .009, 0, 7); g.fill();
                        const lab = [route[i].label || route[i].name, route[i].year].filter(Boolean).join(' · '); if (!lab) return;
                        g.font = `600 ${fs}px ${T.font}`; const tw = g.measureText(lab).width, tx = clamp(x + H * .02, 6, W - tw - 14), ty = clamp(y - H * .03, fs, H - 8);
                        g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(tx - 5, ty - fs * .95, tw + 10, fs * 1.3); g.fillStyle = '#222'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(lab, tx, ty); });
                    if (prog < L) { g.fillStyle = s.color || '#c0392b'; g.beginPath(); g.arc(head[0], head[1], H * .016 * (1 + .25 * Math.sin(local * 8)), 0, 7); g.fill(); }
                } else if (!route.length) { g.fillStyle = '#555'; g.font = `${Math.round(H * .04)}px ${T.font}`; g.textAlign = 'center'; g.fillText('Ajoute des lieux au trajet (panneau de droite)', W / 2, H / 2); }
                if (s.title) { const ts = Math.round(H * .05); g.font = `${ts}px ${T.font}`; g.textAlign = 'center'; g.textBaseline = 'top'; const tw = g.measureText(s.title).width; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(W / 2 - tw / 2 - 20, H * .04, tw + 40, ts * 1.5); g.fillStyle = '#fff'; g.fillText(s.title, W / 2, H * .04 + ts * .25); }
                caption(s, 1);
            }
            g.restore();
        }
        function frame(t) {
            const st = starts(), n = show.slides.length; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
            if (!n) { g.fillStyle = '#888'; g.font = `${Math.round(H * .04)}px ${T.font}`; g.textAlign = 'center'; g.fillText('Ajoute des photos, un titre ou une carte (à gauche)', W / 2, H / 2); return -1; }
            let i = st.findIndex((a, k) => t >= a && (k === n - 1 || t < st[k + 1])); if (i < 0) i = t < 0 ? 0 : n - 1;
            const s = show.slides[i], local = t - st[i], td = .8;
            if (i > 0 && local < td && s.trans !== 'none') { // la transition depuis la précédente
                const prev = show.slides[i - 1], a = local / td, pl = (+prev.dur || 5) + local;
                if (s.trans === 'slide') { drawSlide(prev, pl, 1, -W * a); drawSlide(s, local, 1, W * (1 - a)); }
                else if (s.trans === 'black') { if (a < .5) drawSlide(prev, pl, 1 - a * 2); else drawSlide(s, local, (a - .5) * 2); }
                else { drawSlide(prev, pl, 1); drawSlide(s, local, a); }
            } else drawSlide(s, local, 1);
            return i;
        }
        return {W, H, prepare, frame, total, starts};
    }

    /* ═════════ L'éditeur ═════════ */
    async function open(ctx = {}) {
        let id = 0, name = 'Mon diaporama', show = newShow();
        if (ctx.id) { try { const r = await api('slideshow', {id: ctx.id}); if (r.show?.mode === 'keynote') return ext.openKeynote ? ext.openKeynote({...ctx, preload: r}) : toast('L’éditeur de présentation n’est pas chargé.', 'error'); id = r.id; name = r.name; show = {...newShow(), ...(r.show || {})}; show.slides = (Array.isArray(show.slides) ? show.slides : []).filter(x => x && typeof x === 'object').map(x => ({...x, dur: Math.min(600, Math.max(1, Number(x.dur) || 5))})); } catch (e) { return toast(e.message, 'error'); } }
        let cur = 0, dirty = false, t = 0, playing = false, raf = 0, t0 = 0, p0 = 0, recording = null;
        const dlg = document.createElement('dialog'); dlg.className = 'modal is-full h-ss-dlg';
        dlg.innerHTML = `<div class="h-ss">
            <header class="h-ss-top"><span class="h-ss-logo">🎞️</span><input class="h-ss-name" data-ss-name value="${esc(name)}" maxlength="200">
                <label>Format<select data-ss-g="aspect">${Object.keys(ASPECTS).map(k => `<option ${show.aspect === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
                <label>Style<select data-ss-g="theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${show.theme === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
                <span class="h-ss-music" data-ss-music></span><span class="spacer"></span><span class="muted" data-ss-status></span>
                <button type="button" class="button small secondary" data-ss-cmd="tokeynote" title="Une présentation façon Keynote faite de ces diapositives (textes, formes, animations, mode présentateur…) ; le diaporama reste tel quel">🎤 En présentation</button><button type="button" class="button small secondary" data-ss-cmd="export" title="Une vidéo (WebM) à garder ou partager">⏺ Exporter la vidéo</button><button type="button" class="button small" data-ss-cmd="save" data-shortcut="${esc(ext.shortcutLabel?.('⌘S') || '⌘S')}">💾 Enregistrer</button><button type="button" class="icon-button" data-ss-cmd="close">×</button></header>
            <div class="h-ss-main">
                <aside class="h-ss-list"><div class="h-ss-add"><button type="button" data-ss-cmd="addphotos">＋ Photos</button><button type="button" data-ss-cmd="addtitle">＋ Titre</button><button type="button" data-ss-cmd="addmap">＋ Carte (trajet)</button><button type="button" class="is-story" data-ss-cmd="story">✨ Récit d’une personne</button></div><ol data-ss-slides></ol></aside>
                <section class="h-ss-center"><div class="h-ss-stage" data-ss-stage><canvas data-ss-canvas></canvas></div>
                    <div class="h-ss-transport"><button type="button" class="button small" data-ss-cmd="play" data-shortcut="Espace">▶ Lire</button><button type="button" class="button small secondary" data-ss-cmd="full" title="Plein écran">⛶</button><input type="range" data-ss-seek min="0" max="1000" value="0"><output data-ss-time>0:00 / 0:00</output></div></section>
                <aside class="h-ss-props" data-ss-props></aside></div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s), canvas = $('[data-ss-canvas]');
        let eng = makeEngine(show, canvas);
        const status = s => { $('[data-ss-status]').textContent = s || ''; };
        const touch = () => { dirty = true; status('modifié'); };
        const rebuild = async () => { eng = makeEngine(show, canvas); await eng.prepare(); paint(); };
        /* ─── la liste des diapositives ─── */
        const ICON = {photo: '🖼️', title: '🔤', map: '🗺️'};
        function paintList() {
            $('[data-ss-slides]').innerHTML = show.slides.map((s, i) => `<li class="h-ss-item${i === cur ? ' is-cur' : ''}" data-ss-i="${i}" draggable="true"><span class="h-ss-thumb">${s.type === 'photo' && s.filename ? `<img src="${esc(mediaUrl(s.filename))}" alt="" loading="lazy">` : ICON[s.type]}</span><span class="h-ss-lbl"><b>${i + 1}.</b> ${esc(s.type === 'photo' ? (s.text || s.title || 'Photo') : s.type === 'title' ? (s.title || (s.sub ? `« ${String(s.sub).slice(0, 40)}… »` : 'Titre')) : (s.title || 'Carte'))}<small>${s.dur}s${s.voice ? ' · 🎙' : ''}</small></span><button type="button" class="icon-button" data-ss-del="${i}" title="Retirer">×</button></li>`).join('') || '<li class="muted h-ss-empty">Aucune diapositive : ajoute des photos, un titre, une carte, ou « ✨ Récit d’une personne ».</li>';
            const tot = eng.total(); $('[data-ss-time]').textContent = `${fmt(t)} / ${fmt(tot)}`;
        }
        const field = (k, label, html) => `<label>${label}${html}</label>`;
        function paintProps() {
            const s = show.slides[cur], box = $('[data-ss-props]');
            const mus = show.music ? `🎵 ${esc(show.music.title || 'Musique')} <button type="button" class="link-button" data-ss-cmd="music">changer</button> · <button type="button" class="link-button" data-ss-cmd="nomusic">retirer</button> <input type="range" min="0" max="100" value="${Math.round((show.musicVol ?? .5) * 100)}" data-ss-g="musicVol" title="Volume de la musique">` : '<button type="button" class="button small secondary" data-ss-cmd="music">🎵 Ajouter une musique</button>';
            $('[data-ss-music]').innerHTML = mus;
            if (!s) { box.innerHTML = '<p class="muted">Choisis une diapositive (à gauche) pour régler sa durée, sa transition, son texte, sa voix.</p>'; return; }
            let h = `<h4>${ICON[s.type]} Diapositive ${cur + 1}</h4><div class="h-ss-grid">${field('dur', 'Durée (s)', `<input type="number" min="1" max="120" step="0.5" value="${s.dur}" data-ss-p="dur">`)}${field('trans', 'Transition', `<select data-ss-p="trans">${TRANS.map(([k, l]) => `<option value="${k}" ${s.trans === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`;
            if (s.type === 'photo') h += `<div class="h-ss-grid">${field('kb', 'Mouvement', `<select data-ss-p="kb">${KB.map(([k, l]) => `<option value="${k}" ${s.kb === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}${field('fit', 'Cadrage', `<select data-ss-p="fit"><option value="cover" ${s.fit !== 'contain' ? 'selected' : ''}>Plein écran</option><option value="contain" ${s.fit === 'contain' ? 'selected' : ''}>Photo entière</option></select>`)}</div><button type="button" class="button small secondary" data-ss-cmd="rephoto">🖼️ Changer la photo</button>`;
            if (s.type === 'title') h += `${field('title', 'Titre', `<textarea rows="2" data-ss-p="title">${esc(s.title || '')}</textarea>`)}${field('sub', 'Sous-titre', `<textarea rows="2" data-ss-p="sub">${esc(s.sub || '')}</textarea>`)}<div class="h-ss-grid">${field('bg', 'Fond', `<input type="color" data-ss-p="bg" value="${esc(s.bg || (THEMES[show.theme] || THEMES.classique).bg)}">`)}${field('fg', 'Texte', `<input type="color" data-ss-p="fg" value="${esc(s.fg || (THEMES[show.theme] || THEMES.classique).fg)}">`)}</div>`;
            if (s.type === 'map') h += `${field('title', 'Titre sur la carte', `<input data-ss-p="title" value="${esc(s.title || '')}" maxlength="120">`)}<div class="h-ss-grid">${field('mapBg', 'Fond', `<select data-ss-p="mapBg"><option value="offline">Hors ligne</option>${A().mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml(s.mapBg || '') : ''}</select>`)}${field('color', 'Couleur du trajet', `<input type="color" data-ss-p="color" value="${esc(s.color || '#c0392b')}">`)}</div>
                <h4>Les étapes du trajet</h4><ol class="h-ss-route">${(s.route || []).map((q, i) => `<li><input data-ss-r="${i}:label" value="${esc(q.label || q.name || '')}" placeholder="Lieu"><input data-ss-r="${i}:year" value="${esc(q.year || '')}" placeholder="Année" size="5"><button type="button" class="icon-button" data-ss-rup="${i}" title="Monter">↑</button><button type="button" class="icon-button" data-ss-rdel="${i}" title="Retirer">×</button></li>`).join('')}</ol>
                <div class="h-ss-addplace" data-ss-addplace>${(window.LCNDA_PICKER || A()).pickerField({name: 'ss_place', kind: 'place'})}</div><button type="button" class="button small secondary" data-ss-cmd="routeperson">👤 Les lieux de la vie d’une personne…</button>`;
            h += `${field('text', s.type === 'map' ? 'Légende' : 'Texte (légende)', `<textarea rows="3" data-ss-p="text" placeholder="Ce que raconte cette diapositive…">${esc(s.text || '')}</textarea>`)}${field('textPos', 'Place du texte', `<select data-ss-p="textPos">${[['bottom', 'En bas'], ['top', 'En haut'], ['center', 'Au milieu']].map(([k, l]) => `<option value="${k}" ${s.textPos === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
                <h4>🎙 Voix</h4>${s.voice ? `<audio controls src="${esc(mediaUrl(s.voice.filename))}"></audio><div class="h-ss-row"><button type="button" class="link-button" data-ss-cmd="voicedel">retirer la voix</button><button type="button" class="link-button" data-ss-cmd="voicefit" title="La diapositive dure le temps de la voix">⇥ durée = voix</button></div>` : ''}
                <div class="h-ss-row"><button type="button" class="button small ${recording ? 'danger' : ''}" data-ss-cmd="rec">${recording ? '⏹ Arrêter' : '🎙 Enregistrer ma voix'}</button><button type="button" class="button small secondary" data-ss-cmd="voicepick">🔊 Un son de la base…</button></div>`;
            box.innerHTML = h;
        }
        function paint() { paintList(); paintProps(); drawAt(t); }
        function drawAt(tt) { t = clamp(tt, 0, eng.total()); const i = eng.frame(t); if (i >= 0 && playing && i !== cur) { cur = i; paintList(); paintProps(); } const tot = eng.total() || 1; $('[data-ss-seek]').value = Math.round(t / tot * 1000); $('[data-ss-time]').textContent = `${fmt(t)} / ${fmt(tot)}`; }
        const goSlide = i => { cur = clamp(i, 0, Math.max(0, show.slides.length - 1)); t = (eng.starts()[cur] || 0) + .9; paint(); };
        /* ─── son : musique et voix ─── */
        let music = null, voice = null, voiceFor = -1;
        const stopAudio = () => { music?.pause(); voice?.pause(); voice = null; voiceFor = -1; };
        function syncAudio(i, local) {
            if (show.music && !music) { music = new Audio(mediaUrl(show.music.filename)); music.loop = true; }
            if (music && show.music) { if (music.paused) { music.currentTime = t % (music.duration || 1e9); music.play().catch(() => {}); } }
            const s = show.slides[i];
            if (s?.voice && voiceFor !== i) { voice?.pause(); voice = new Audio(mediaUrl(s.voice.filename)); voiceFor = i; voice.currentTime = Math.max(0, local - .2); voice.play().catch(() => {}); }
            if (!s?.voice && voice) { voice.pause(); voice = null; voiceFor = -1; }
            if (music) music.volume = clamp((show.musicVol ?? .5) * (voice && !voice.paused && !voice.ended ? .3 : 1), 0, 1); // la musique baisse quand la voix parle
        }
        function play() {
            if (playing) { playing = false; cancelAnimationFrame(raf); stopAudio(); $('[data-ss-cmd="play"]').textContent = '▶ Lire'; return; }
            if (t >= eng.total() - .05) t = 0;
            playing = true; t0 = performance.now(); p0 = t; $('[data-ss-cmd="play"]').textContent = '⏸ Pause';
            const step = () => { if (!playing) return; const tt = p0 + (performance.now() - t0) / 1000; if (tt >= eng.total()) { drawAt(eng.total()); return play(); } drawAt(tt); const i = eng.starts().findIndex((a, k, arr) => tt >= a && (k === arr.length - 1 || tt < arr[k + 1])); syncAudio(i, tt - eng.starts()[i]); raf = requestAnimationFrame(step); };
            step();
        }
        /* ─── ajouter ─── */
        function pickMedia({kind = 'image', multi = true, title = 'Choisir'} = {}) {
            const rx = kind === 'image' ? /\.(jpe?g|png|webp|gif)$/i : /\.(mp3|m4a|wav|ogg|oga|webm|aiff?|aac|flac)$/i;
            return new Promise(res => {
                let done = false;
                ext.openDialog({eyebrow: 'DIAPORAMA', title, submitLabel: multi ? 'Ajouter' : 'Choisir',
                    body: `<label>Fichier${multi ? 's' : ''} de l’ordinateur (ils vont dans les médias)<input type="file" name="f" accept="${kind === 'image' ? 'image/*' : 'audio/*'}" ${multi ? 'multiple' : ''}></label><p class="muted">ou de la base :</p><div class="pk h-pick-q"><div class="pk-box"><span class="pk-ico" aria-hidden="true">${kind === 'image' ? '🖼' : '🎵'}</span><input type="text" class="pk-input" data-mq placeholder="Titre, nom du fichier…" autocomplete="off" spellcheck="false" aria-label="Chercher dans les médias"></div></div><div data-mres class="${kind === 'image' ? 'vx-mmedia h-ss-pick' : 'h-ss-picka'}"></div>`,
                    onOpen: dg => { const q = dg.querySelector('[data-mq]'), box = dg.querySelector('[data-mres]'); let tm = 0;
                        const go = async () => { const res = await api('list', {type: 'media', q: q.value.trim(), limit: 60}).catch(() => ({rows: []})), rows = (res.rows || res.data || []).filter(m => rx.test(m.filename || '')); box._rows = rows;
                            box.innerHTML = rows.map((m, i) => kind === 'image' ? `<label title="${esc(m.title || m.filename)}"><input type="${multi ? 'checkbox' : 'radio'}" name="mp" value="${i}"><img src="${esc(mediaUrl(m.thumbnail || m.filename))}" alt="" loading="lazy"></label>` : `<label class="checkbox-line"><input type="radio" name="mp" value="${i}"> 🎵 ${esc(m.title || m.filename)}</label>`).join('') || '<p class="muted">Rien trouvé.</p>'; };
                        q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(go, 250); }); go();
                        dg.addEventListener('close', () => { if (!done) res([]); }, {once: true}); },
                    onSubmit: async f => {
                        const out = [], files = [...(f.querySelector('[name=f]').files || [])], rows = f.querySelector('[data-mres]')._rows || [];
                        for (const file of files) { const fd = new FormData(); fd.append('file', file); fd.append('kind', kind === 'image' ? 'image' : 'audio'); fd.append('title', file.name.replace(/\.[^.]+$/, '')); fd.append('csrf', A().state.csrf);
                            const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) { toast(`${file.name} : ${j.error || 'envoi impossible'}`, 'error'); continue; }
                            out.push({media_id: j.result.media_id, filename: j.result.filename, title: file.name.replace(/\.[^.]+$/, '')}); }
                        [...f.querySelectorAll('[name=mp]:checked')].forEach(x => { const m = rows[Number(x.value)]; out.push({media_id: Number(m.id), filename: m.filename, title: m.title || ''}); });
                        if (!out.length) { toast('Choisis au moins un fichier.', 'error'); return false; }
                        done = true; res(out);
                    }});
            });
        }
        async function addPhotos() { const list = await pickMedia({title: 'Ajouter des photos'}); if (!list.length) return; list.forEach(m => show.slides.splice(cur + 1 + list.indexOf(m), 0, newSlide('photo', {media_id: m.media_id, filename: m.filename, text: m.title || ''}))); cur = Math.min(show.slides.length - 1, cur + 1); touch(); await rebuild(); }
        /* ─── ✨ le récit d'une personne : titre, photos, carte des lieux de sa vie, biographie ─── */
        async function placesOf(pid) {
            const r = await api('person', {id: pid}); const p = r.person || {};
            const ev = (r.events || []).filter(e => e.latitude && e.longitude).sort((a, b) => (a.year || 9999) - (b.year || 9999) || String(a.sort_date || '').localeCompare(String(b.sort_date || '')));
            const route = []; ev.forEach(e => { const last = route[route.length - 1]; if (last && Math.abs(last.lat - e.latitude) < 1e-4 && Math.abs(last.lon - e.longitude) < 1e-4) return; route.push({name: e.place_name, label: `${e.place_name}${e.type_label ? ` (${String(e.type_label).toLowerCase()})` : ''}`, year: e.year || '', lat: +e.latitude, lon: +e.longitude}); });
            return {r, p, route};
        }
        function askPerson(title) {
            const cp = Number(A().state.currentPersonId) || 0;
            return new Promise(res => { let done = false;
                ext.openDialog({eyebrow: 'DIAPORAMA', title, submitLabel: 'Choisir',
                    body: `<div class="h-pk-solo"><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'ss_pick', kind: 'person', value: cp || null})}</div>${cp ? '<p class="muted">La personne affichée en ce moment, ou × pour en chercher une autre.</p>' : ''}`,
                    onOpen: dg => { setTimeout(() => (dg.querySelector('.pk-search:not([hidden]) .pk-input') || dg.querySelector('.pk-chosen .go'))?.focus(), 30);
                        dg.addEventListener('close', () => { if (!done) res(0); }, {once: true}); },
                    onSubmit: f => { const chosen = Number(f.elements.ss_pick?.value) || 0; if (!chosen) { toast('Choisis une personne.', 'error'); return false; } done = true; res(chosen); }}); });
        }
        async function story() {
            const pid = await askPerson('✨ Le récit de quelle personne ?'); if (!pid) return;
            status('Préparation du récit…');
            try {
                const {r, p, route} = await placesOf(pid), nm = A().personName(p), yrs = A().years?.(p) || '';
                const slides = [newSlide('title', {title: nm, sub: [yrs, p.occupation].filter(Boolean).join(' — '), dur: 5})];
                const photos = (r.media || []).filter(m => /\.(jpe?g|png|webp|gif)$/i.test(m.filename || '')).slice(0, 16);
                // l'ordre : naissance, la vie, les photos, la carte du trajet, la fin
                const ev = (r.events || []).filter(e => e.year).sort((a, b) => a.year - b.year);
                const evText = e => `${e.year} · ${e.type_label || ''}${e.place_name ? ` à ${e.place_name}` : ''}`.trim();
                photos.forEach((m, i) => slides.push(newSlide('photo', {media_id: Number(m.id), filename: m.filename, text: m.title || (ev[i] ? evText(ev[i]) : ''), dur: 6})));
                if (route.length) slides.push(newSlide('map', {title: `Les lieux de la vie de ${p.first_name || nm}`, route, mapBg: 'offline', dur: Math.min(30, 6 + route.length * 2)}));
                const bio = String(r.biography || '').replace(/\s+/g, ' ').trim();
                if (bio) { const parts = bio.match(/[^.!?]+[.!?]+/g) || [bio]; let chunk = ''; const chunks = []; parts.forEach(sn => { if ((chunk + sn).length > 230 && chunk) { chunks.push(chunk.trim()); chunk = ''; } chunk += sn; }); if (chunk.trim()) chunks.push(chunk.trim()); chunks.slice(0, 4).forEach(c => slides.push(newSlide('title', {title: '', sub: c, dur: Math.max(6, Math.round(c.length / 18))}))); }
                if (!ev.length && !photos.length && !route.length && !bio) toast('Peu de choses sur cette personne : le récit est court, complète-le à la main.');
                show.slides.push(...slides); cur = show.slides.length - slides.length; if (name === 'Mon diaporama') { name = `Récit — ${nm}`; $('[data-ss-name]').value = name; }
                touch(); await rebuild(); status(`${A().plural(slides.length, 'diapositive ajoutée', 'diapositives ajoutées')}`);
            } catch (e) { status(''); toast(e.message, 'error'); }
        }
        /* ─── voix ─── */
        async function rec() {
            const s = show.slides[cur]; if (!s) return;
            if (recording) { recording.stop(); return; }
            let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (_) { return toast('Micro inaccessible (autorise-le dans le navigateur ou le système).', 'error'); }
            const chunks = [], mr = new MediaRecorder(stream); recording = mr; paintProps(); status('🔴 Enregistrement… (⏹ pour arrêter)');
            mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
            mr.onstop = async () => { stream.getTracks().forEach(x => x.stop()); recording = null; const blob = new Blob(chunks, {type: mr.mimeType || 'audio/webm'});
                const fd = new FormData(); fd.append('file', blob, 'voix.webm'); fd.append('kind', 'audio'); fd.append('title', `Voix — ${name} — diapositive ${cur + 1}`); fd.append('csrf', A().state.csrf);
                try { const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                    s.voice = {media_id: j.result.media_id, filename: j.result.filename}; const dur = await audioDur(mediaUrl(s.voice.filename)); if (dur && dur + 1 > s.dur) s.dur = Math.ceil(dur + 1); touch(); status('Voix enregistrée'); paint(); }
                catch (e) { toast(`Voix : ${e.message}`, 'error'); paintProps(); } };
            mr.start();
        }
        const audioDur = src => new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = src; });
        /* ─── exporter : la lecture enregistrée en vidéo (image et son) ─── */
        async function exportVideo() {
            if (!show.slides.length) return toast('Le diaporama est vide.', 'error');
            if (playing) play();
            await eng.prepare();
            const total = eng.total(); if (!await A().confirmBox(`L’export rejoue le diaporama en entier (${fmt(total)}) et l’enregistre en vidéo. Laisse la fenêtre ouverte.`, {title: 'Exporter en vidéo ?', okLabel: 'Exporter la vidéo'})) return;
            const ac = new AudioContext(), dest = ac.createMediaStreamDestination(), vstream = canvas.captureStream(30);
            const mk = src => { const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = src; const node = ac.createMediaElementSource(a), gain = ac.createGain(); node.connect(gain).connect(dest); return {a, gain}; };
            const mus = show.music ? mk(mediaUrl(show.music.filename)) : null; if (mus) mus.a.loop = true;
            const voices = new Map(); show.slides.forEach((s, i) => { if (s.voice) voices.set(i, mk(mediaUrl(s.voice.filename))); });
            // sans musique ni voix : une vidéo muette (une piste son vide bloquerait l'enregistrement) ; sinon un fond silencieux la garde vivante entre deux voix
            const withSound = !!mus || voices.size > 0;
            if (withSound) { const o = ac.createConstantSource(), z = ac.createGain(); z.gain.value = 0; o.connect(z).connect(dest); o.start(); await ac.resume().catch(() => {}); }
            const tracks = [...vstream.getVideoTracks(), ...(withSound ? dest.stream.getAudioTracks() : [])], mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
            const mr = new MediaRecorder(new MediaStream(tracks), mime ? {mimeType: mime, videoBitsPerSecond: 6e6} : {}), chunks = [];
            mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
            const done = new Promise(r => { mr.onstop = r; });
            status('⏺ Export en cours…'); mr.start(500); if (mus) { mus.gain.gain.value = show.musicVol ?? .5; mus.a.play().catch(() => {}); }
            const start = performance.now(); let lastI = -1;
            await new Promise(resolve => { const step = () => { const tt = (performance.now() - start) / 1000; if (tt >= total) { eng.frame(total); return resolve(); } const i = eng.frame(tt); if (i !== lastI) { voices.get(lastI)?.a.pause(); const v = voices.get(i); if (v) { v.a.currentTime = 0; v.a.play().catch(() => {}); } lastI = i; }
                if (mus) { const v = voices.get(i); mus.gain.gain.value = (show.musicVol ?? .5) * (v && !v.a.paused && !v.a.ended ? .3 : 1); } status(`⏺ Export : ${Math.round(tt / total * 100)} %`); requestAnimationFrame(step); }; step(); });
            mr.stop(); mus?.a.pause(); voices.forEach(v => v.a.pause()); await done; ac.close();
            const blob = new Blob(chunks, {type: 'video/webm'}); status('');
            if (!blob.size) return toast('La vidéo est vide : l’enregistrement n’a pas pu se faire dans ce navigateur.', 'error');
            const keep = await A().confirmBox('Tu peux l’ajouter aux Médias de l’app, ou seulement la télécharger.', {title: 'Vidéo prête', okLabel: 'Ajouter aux Médias', cancelLabel: 'Télécharger seulement', danger: false});
            if (keep) { const fd = new FormData(); fd.append('file', blob, 'diaporama.webm'); fd.append('kind', 'video'); fd.append('title', name); fd.append('duration', String(total)); fd.append('csrf', A().state.csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) toast(j.error || 'Envoi impossible.', 'error'); else toast('Vidéo ajoutée aux Médias.'); }
            else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(A().safeExportFilename ? A().safeExportFilename(name, 'diaporama') : 'diaporama')}.webm`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
        }
        async function save() {
            name = $('[data-ss-name]').value.trim() || 'Mon diaporama'; status('Enregistrement…');
            try { const r = await post('save_slideshow', {id, name, show}); id = r.result.id; dirty = false; status('✓ Enregistré'); toast('Diaporama enregistré (Listes → Outils de modification → Présentation et diaporama).'); ctx.onSaved?.(id); } catch (e) { status(''); toast(e.message, 'error'); }
        }
        async function close() { if (dirty && !await A().confirmBox('Les dernières modifications du diaporama seront perdues.', {title: 'Fermer sans enregistrer le diaporama ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; playing = false; cancelAnimationFrame(raf); stopAudio(); recording?.stop(); dlg.close(); dlg.remove(); ctx.onClose?.(); }
        /* ─── événements ─── */
        dlg.addEventListener('click', async e => {
            const li = e.target.closest('[data-ss-i]'), del = e.target.closest('[data-ss-del]');
            if (del) { show.slides.splice(Number(del.dataset.ssDel), 1); cur = clamp(cur, 0, show.slides.length - 1); touch(); await rebuild(); return; }
            if (li && !e.target.closest('button')) { if (playing) play(); goSlide(Number(li.dataset.ssI)); return; }
            const rdel = e.target.closest('[data-ss-rdel]'), rup = e.target.closest('[data-ss-rup]');
            const s = show.slides[cur];
            if (rdel && s) { s.route.splice(Number(rdel.dataset.ssRdel), 1); touch(); await rebuild(); return; }
            if (rup && s) { const i = Number(rup.dataset.ssRup); if (i > 0) { [s.route[i - 1], s.route[i]] = [s.route[i], s.route[i - 1]]; touch(); await rebuild(); } return; }
            const c = e.target.closest('[data-ss-cmd]'); if (!c) return; const k = c.dataset.ssCmd;
            if (k === 'close') return close();
            if (k === 'save') return save();
            if (k === 'play') return play();
            if (k === 'full') { const st = $('[data-ss-stage]'); if (document.fullscreenElement) document.exitFullscreen(); else st.requestFullscreen?.().catch(() => {}); return; }
            if (k === 'export') return exportVideo().catch(err => { status(''); toast(err.message || 'Export impossible.', 'error'); });
            if (k === 'addphotos') return addPhotos();
            if (k === 'addtitle') { show.slides.splice(cur + 1, 0, newSlide('title', {title: 'Titre', sub: ''})); cur = Math.min(cur + 1, show.slides.length - 1); touch(); return rebuild(); }
            if (k === 'addmap') { show.slides.splice(cur + 1, 0, newSlide('map', {title: 'Le trajet', route: [], mapBg: 'offline'})); cur = Math.min(cur + 1, show.slides.length - 1); touch(); return rebuild(); }
            if (k === 'story') return story();
            if (k === 'tokeynote') { if (!ext.keynoteFromSlideshow) return toast('L’éditeur de présentation n’est pas chargé.', 'error'); if (playing) play(); return ext.keynoteFromSlideshow(show, $('[data-ss-name]').value.trim() || name, {onSaved: ctx.onSaved, onClose: ctx.onClose}); }
            if (k === 'rephoto' && s) { const l = await pickMedia({multi: false, title: 'Changer la photo'}); if (l[0]) { s.media_id = l[0].media_id; s.filename = l[0].filename; touch(); await rebuild(); } return; }
            if (k === 'music') { const l = await pickMedia({kind: 'audio', multi: false, title: 'Une musique'}); if (l[0]) { show.music = {media_id: l[0].media_id, filename: l[0].filename, title: l[0].title}; music?.pause(); music = null; touch(); paintProps(); } return; }
            if (k === 'nomusic') { show.music = null; music?.pause(); music = null; touch(); paintProps(); return; }
            if (k === 'rec') return rec();
            if (k === 'voicedel' && s) { delete s.voice; touch(); paint(); return; }
            if (k === 'voicefit' && s?.voice) { const d = await audioDur(mediaUrl(s.voice.filename)); if (d) { s.dur = Math.ceil(d + .8); touch(); paint(); } return; }
            if (k === 'voicepick' && s) { const l = await pickMedia({kind: 'audio', multi: false, title: 'Une voix, un son'}); if (l[0]) { s.voice = {media_id: l[0].media_id, filename: l[0].filename}; touch(); paint(); } return; }
            if (k === 'routeperson' && s) { const pid = await askPerson('Les lieux de la vie de qui ?'); if (!pid) return; try { const {route, p} = await placesOf(pid); if (!route.length) return toast('Aucun lieu avec des coordonnées pour cette personne (Lieux → coordonnées).', 'error'); s.route = [...(s.route || []), ...route]; if (!s.title || s.title === 'Le trajet') s.title = `Les lieux de la vie de ${p.first_name || ''}`.trim(); touch(); await rebuild(); } catch (err) { toast(err.message, 'error'); } return; }
        });
        dlg.addEventListener('input', async e => {
            const el = e.target, s = show.slides[cur];
            if (el.matches('[data-ss-seek]')) { if (playing) play(); drawAt(Number(el.value) / 1000 * eng.total()); const i = eng.starts().findIndex((a, k, arr) => t >= a && (k === arr.length - 1 || t < arr[k + 1])); if (i >= 0 && i !== cur) { cur = i; paintList(); paintProps(); } return; }
            if (el.dataset.ssP && s) { const k = el.dataset.ssP; s[k] = k === 'dur' ? clamp(Number(el.value) || 5, 1, 120) : el.value; touch(); if (['mapBg'].includes(k)) await rebuild(); else { drawAt(t); if (k === 'dur' || k === 'title' || k === 'text') paintList(); } return; }
            if (el.dataset.ssR && s) { const [i, k] = el.dataset.ssR.split(':'); s.route[Number(i)][k] = el.value; touch(); drawAt(t); return; }
            if (el.dataset.ssG) { const k = el.dataset.ssG; if (k === 'musicVol') { show.musicVol = Number(el.value) / 100; if (music) music.volume = show.musicVol; touch(); return; } show[k] = el.value; touch(); await rebuild(); return; }
        });
        dlg.addEventListener('change', e => { if (e.target.matches('[data-ss-name]')) touch(); });
        // ＋ un lieu au trajet : le menu de choix unique (sorte place) ; ses coordonnées viennent de la recherche des lieux
        dlg.addEventListener('picker-change', async e => {
            const it = e.detail.item, s = show.slides[cur], field = e.target.closest('[data-ss-addplace] .pk');
            if (!field || !it?.id || !s) return;
            const c = await (ext.placeCoords ? ext.placeCoords(it) : Promise.resolve({}));
            (window.LCNDA_PICKER || A()).pickerSet(field, null);
            if (c.lat === '' || c.lat == null) return toast(`« ${it.title} » n’a pas encore de position sur la carte.`, 'error');
            const name = String(it.name || it.title).replace(/\s*\(.*\)$/, '');
            s.route = s.route || []; s.route.push({name, label: name, year: '', lat: +c.lat, lon: +c.lon}); touch(); await rebuild();
        });
        // glisser une diapositive pour changer l'ordre
        let dragI = -1;
        dlg.addEventListener('dragstart', e => { const li = e.target.closest('[data-ss-i]'); if (!li) return; dragI = Number(li.dataset.ssI); e.dataTransfer.effectAllowed = 'move'; });
        dlg.addEventListener('dragover', e => { if (dragI >= 0 && e.target.closest('[data-ss-i]')) e.preventDefault(); });
        dlg.addEventListener('drop', async e => { const li = e.target.closest('[data-ss-i]'); if (dragI < 0 || !li) return; e.preventDefault(); const to = Number(li.dataset.ssI); const [m] = show.slides.splice(dragI, 1); show.slides.splice(to, 0, m); cur = to; dragI = -1; touch(); await rebuild(); });
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (document.fullscreenElement) return; close(); });
        dlg.addEventListener('keydown', e => { if (e.target.closest('input, textarea, select')) return; if (e.key === ' ') { e.preventDefault(); play(); } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
        await rebuild(); goSlide(0);
        if (ctx.story) story();
        return {get show() { return show; }, play, save, frame: tt => eng.frame(tt)};
    }

    ext.openSlideshow = open;
    ext.slideshowInternals = {makeEngine, mapBackground};
    ext.editToolsExtra = ext.editToolsExtra || [];
    /* « ＋ Nouveau » : un diaporama (photos, titres, cartes, voix) ou une présentation façon Keynote (heritage-keynote.js) */
    const KIND_KEY = 'genealogie-slideshow-kind';
    function chooseKind(again) {
        if (!ext.newPresentation) return open({onSaved: again, onClose: again});
        let last = 'slideshow'; try { last = localStorage.getItem(KIND_KEY) === 'keynote' ? 'keynote' : 'slideshow'; } catch (_) {}
        ext.openDialog({eyebrow: 'NOUVEAU', title: 'Une présentation ou un diaporama ?', submitLabel: 'Commencer', wide: true,
            body: `<div class="kn-choice"><label class="kn-choice-card"><input type="radio" name="ss_kind" value="slideshow" ${last === 'slideshow' ? 'checked' : ''}><span class="kn-cc-ico">🎞️</span><b>Diaporama</b><span>Des photos qui défilent avec un lent mouvement de caméra, des titres, des cartes où se dessine un trajet, ta voix sur chaque photo, une musique. Simple, et s’exporte en vidéo.</span></label>
                <label class="kn-choice-card"><input type="radio" name="ss_kind" value="keynote" ${last === 'keynote' ? 'checked' : ''}><span class="kn-cc-ico">🎤</span><b>Présentation (façon Keynote)</b><span>Des diapositives libres : textes, photos, formes, tableaux, graphiques, fiches et petits arbres de la généalogie ; thèmes, animations, transitions, mode présentateur avec notes. Importe PowerPoint, OpenDocument, PDF, images, texte.</span></label></div>`,
            onSubmit: f => { const k = f.elements.ss_kind?.value === 'keynote' ? 'keynote' : 'slideshow'; try { localStorage.setItem(KIND_KEY, k); } catch (_) {} if (k === 'keynote') ext.newPresentation({onSaved: again, onClose: again}); else open({onSaved: again, onClose: again}); }});
    }
    ext.editToolsExtra.push({key: 'slideshow', icon: '🎞️', label: 'Présentation et diaporama', what: 'présentation ou de diaporama',
        load: async () => ((await api('slideshows')).items || []).map(r => ({id: r.id, name: r.name, date: r.updated_at, thumb: r.cover ? `<img src="${esc(mediaUrl(r.cover))}" alt="">` : `<span class="h-et-ico">${r.mode === 'keynote' ? '🎤' : '🎞️'}</span>`, info: `${r.mode === 'keynote' ? '🎤 Présentation' : '🎞️ Diaporama'} · ${r.slides} diapositive${r.slides > 1 ? 's' : ''}${r.mode === 'keynote' ? '' : ` · ${fmt(r.duration)}`}`})),
        open: (id, again) => open({id, onSaved: again, onClose: again}),
        create: again => chooseKind(again),
        rename: (id, name) => post('rename_slideshow', {id, name}),
        remove: id => post('delete_slideshow', {id}), createLabel: '＋ Nouveau',
        extra: '<button type="button" class="button secondary" data-et-x="story" title="Les photos, les lieux et la vie d’une personne, en diaporama tout fait">✨ Récit d’une personne</button><button type="button" class="button secondary" data-et-x="kimport" title="PowerPoint (.pptx), OpenDocument (.odp), PDF, images, Markdown, texte, JSON">⤒ Importer une présentation</button>',
        onExtra: (k, again) => { if (k === 'story') open({story: true, onSaved: again, onClose: again}); if (k === 'kimport') ext.importPresentation ? ext.importPresentation({onSaved: again, onClose: again}) : toast('L’éditeur de présentation n’est pas chargé.', 'error'); }});
})();
