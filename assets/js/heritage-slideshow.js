/* LCNDA — 🎞️ Présentation et diaporama : des photos (avec un lent mouvement de caméra), des titres, des cartes où se dessine un
 * trajet (une migration, les lieux d'une vie), une voix enregistrée sur chaque diapositive, une musique qui baisse quand
 * la voix parle ; tout se lit ici en plein écran et s'exporte (vidéo, images, PDF, fichier). « ✨ Récit d'une vie » fabrique
 * tout seul le diaporama d'une vie à partir de la fiche (naissance sur une petite carte, baptême, mariage, enfants, métiers,
 * recensements, déménagements, photos liées, carte des lieux de vie, événements de l'époque, décès, sépulture, descendance).
 * Serveur : lib/slideshows.php. Listes → Outils de modification → « 🎞️ Présentation et diaporama », ou ✨ sur la fiche.
 * « ＋ Nouveau » propose aussi la présentation façon Keynote (heritage-keynote.js), enregistrée dans la même liste.
 * Barre du haut, panneau de droite, export, dépôt de fichiers, police : les éléments communs (app-ui.js, docs/UI.md).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let seq = 0; const sid = () => 's' + Date.now().toString(36) + (++seq);
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const plural = (n, one, many) => A().plural(n, one, many);
    const help = (txt, faq = '') => ` data-help="${esc(txt)}"${faq ? ` data-help-faq="${esc(faq)}"` : ''}`;
    const safeName = (n, d = 'diaporama') => (A().safeExportFilename ? A().safeExportFilename(n, d) : d);
    const download = (blob, filename) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    /** Un fichier (blob) dans les Médias de l'app : {media_id, filename} */
    async function toMedia(blob, filename, kind, title, extra = {}) {
        const fd = new FormData(); fd.append('file', blob, filename); fd.append('kind', kind); fd.append('title', title);
        Object.entries(extra).forEach(([k, v]) => fd.append(k, String(v))); fd.append('csrf', A().state.csrf);
        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
        const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
        return j.result;
    }

    const ASPECTS = {'16:9': [1280, 720], '4:3': [1024, 768], '1:1': [900, 900], '9:16': [720, 1280]};
    const THEMES = {classique: {label: 'Classique', bg: '#111111', fg: '#ffffff', accent: '#e8c27a', font: 'Georgia, serif'}, ancien: {label: 'Album ancien', bg: '#2a2117', fg: '#f3e6c8', accent: '#c9a25a', font: '"Palatino Linotype", Palatino, Georgia, serif'},
        clair: {label: 'Clair', bg: '#f5f2ea', fg: '#222222', accent: '#8a5a2b', font: 'Georgia, serif'}, moderne: {label: 'Moderne', bg: '#0e1a2b', fg: '#ffffff', accent: '#5ec2ff', font: 'Helvetica, Arial, sans-serif'}};
    const KB = [['in', 'Zoom avant lent'], ['out', 'Zoom arrière lent'], ['left', 'Glisser vers la gauche'], ['right', 'Glisser vers la droite'], ['up', 'Monter'], ['none', 'Immobile']];
    const TRANS = [['fade', 'Fondu'], ['slide', 'Glissement'], ['black', 'Fondu au noir'], ['none', 'Coupe nette']];
    const newShow = () => ({aspect: '16:9', theme: 'classique', music: null, musicVol: .5, slides: []});
    const newSlide = (type, o = {}) => ({id: sid(), type, dur: type === 'map' ? 10 : type === 'title' ? 5 : 6, trans: 'fade', kb: ['in', 'out', 'left', 'right'][seq % 4], text: '', textPos: 'bottom', ...o});
    const fontOf = (show, T) => (show.font ? `'${String(show.font).replace(/['"\\]/g, '')}', ${T.font}` : T.font);

    /* ═════════ Styles propres (injectés : la barre du haut commune, les sections, le récit) ═════════ */
    const CSS = `
.h-ss-dlg:not(.is-full){width:min(1500px,96vw);height:min(940px,92vh);max-height:92vh;padding:0!important}
.h-ss-dlg:not(.is-full) .h-ss{height:min(940px,92vh)}
.h-ss-top.ui-topbar{border-width:0 0 1px;border-color:#d6d6db;border-style:solid;padding:6px 10px}
.h-ss-extra{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.h-ss-extra label{display:flex;align-items:center;gap:4px;font-size:12px}
.h-ss-progress{font-size:12px;color:var(--muted,#6d6d6d)}
.h-ss-top .ui-topbar-name.ui-topbar-name{width:200px}
@media (max-width:1500px){.h-ss-hide-s{display:none}}
.h-ss-tgrp{display:flex;gap:6px;align-items:center}
.h-ss-music{gap:4px;flex-wrap:wrap}.h-ss-music input[type=range]{width:90px}
.h-ss-props .ui-section{margin:0}
.h-ss-f{display:grid;gap:2px;font-size:12px;min-width:0}
.h-ss-fl{display:flex;align-items:center;gap:4px;font-weight:600}
.h-ss-props .ui-section-body{display:grid;gap:6px}
.h-ss-portrait{display:flex;gap:8px;align-items:center}
.h-ss-portrait img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid #d6d6db}
.h-ss-fontbtn{justify-content:flex-start;text-align:left}
.h-ss-main.is-drag-over{outline:3px dashed #2a7de1;outline-offset:-6px}
.h-ss-notes-ico{color:#8a5a2b}
.h-st-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0}
.h-st-grid label{display:grid;gap:3px}
.h-st-photos{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0}
.h-st-thumbs{display:flex;gap:4px;flex-wrap:wrap}
.h-st-thumbs img{width:42px;height:42px;object-fit:cover;border-radius:4px;border:1px solid #d6d6db}
.h-st-opts{display:grid;gap:6px;margin:10px 0}
.h-st-sum{background:#f6f3ea;border:1px solid #e3dccb;border-radius:8px;padding:8px 10px;font-size:13px}
.h-ss-storybtn{font-size:16px;line-height:1}
:root[data-theme="dark"] .h-ss-top.ui-topbar{border-color:#3a3f46}
:root[data-theme="dark"] .h-st-sum{background:#2b2925;border-color:#4a4438}
:root[data-theme="dark"] .h-ss-portrait img,:root[data-theme="dark"] .h-st-thumbs img{border-color:#3a3f46}
@media (max-width:700px){.h-st-grid{grid-template-columns:1fr}.h-ss-main{grid-template-columns:minmax(0,1fr)!important;grid-auto-rows:max-content;overflow:auto}.h-ss-list{max-height:32vh}.h-ss-stage{min-height:200px}.h-ss-props{max-height:none!important;overflow:visible}.h-ss-extra label{font-size:11px}.h-ss-top .ui-topbar-name.ui-topbar-name{width:150px}}`;
    function injectCss() { if (document.getElementById('h-ss-css2')) return; const st = document.createElement('style'); st.id = 'h-ss-css2'; st.textContent = CSS; document.head.appendChild(st); }

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
        const g = canvas.getContext('2d'), T = THEMES[show.theme] || THEMES.classique, FONT = fontOf(show, T);
        const imgs = new Map(), maps = new Map();
        const starts = () => { let t = 0; return show.slides.map(s => { const a = t; t += Math.max(1, +s.dur || 5); return a; }); };
        const total = () => show.slides.reduce((a, s) => a + Math.max(1, +s.dur || 5), 0);
        async function prepare() {
            await Promise.all(show.slides.map(async s => {
                if ((s.type === 'photo' || s.type === 'title') && s.filename && !imgs.has(s.filename)) { const im = new Image(); im.decoding = 'async'; im.src = mediaUrl(s.filename); try { await im.decode(); imgs.set(s.filename, im); } catch (_) { imgs.set(s.filename, null); } }
                if (s.type === 'map') { const key = JSON.stringify([s.route, s.mapBg, W, H]); if (!maps.has(s.id) || maps.get(s.id).key !== key) maps.set(s.id, {key, m: await mapBackground(s.route || [], W, H, s.mapBg || 'offline')}); }
            }));
        }
        const wrapText = (text, maxW) => { const out = []; String(text || '').split('\n').forEach(par => { let line = ''; par.split(/\s+/).filter(Boolean).forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); out.push(line); }); return out; };
        function caption(s, alpha) {
            if (!s.text) return; const size = Math.round(H * .042); g.save(); g.globalAlpha = alpha; g.font = `${size}px ${FONT}`;
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
                const a = clamp(local / .9, 0, 1), fg = s.fg || T.fg, im = s.filename ? imgs.get(s.filename) : null;
                let cy = H * .44;
                if (im) { // le portrait dans un rond, au-dessus du titre (un zoom très doux)
                    const r = Math.min(W, H) * .17, px = W / 2, py = H * .27, k = Math.max(2 * r / im.naturalWidth, 2 * r / im.naturalHeight) * (1 + .06 * p);
                    g.save(); g.globalAlpha = alpha * a; g.beginPath(); g.arc(px, py, r, 0, 7); g.closePath(); g.save(); g.clip(); g.drawImage(im, px - im.naturalWidth * k / 2, py - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k); g.restore();
                    g.strokeStyle = T.accent; g.lineWidth = Math.max(2, H * .006); g.stroke(); g.restore(); cy = H * .6;
                }
                g.globalAlpha = alpha * a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
                const ts = Math.round(H * (im ? .07 : .085)); g.font = `${ts}px ${FONT}`;
                const lines = wrapText(s.title || '', W * .8).slice(0, 3); lines.forEach((l, i) => g.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * ts * 1.2));
                g.strokeStyle = T.accent; g.lineWidth = Math.max(1.5, H * .003); const ly = cy + lines.length * ts * .6 + ts * .35; g.beginPath(); g.moveTo(W / 2 - W * .12 * a, ly); g.lineTo(W / 2 + W * .12 * a, ly); g.stroke();
                if (s.sub) { const ss = Math.round(H * (im ? .036 : .042)); g.font = `italic ${ss}px ${FONT}`; g.fillStyle = T.accent; wrapText(s.sub, W * .78).slice(0, im ? 3 : 7).forEach((l, i) => g.fillText(l, W / 2, ly + H * .07 + i * ss * 1.3)); }
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
                        g.font = `600 ${fs}px ${FONT}`; const tw = g.measureText(lab).width, tx = clamp(x + H * .02, 6, W - tw - 14), ty = clamp(y - H * .03, fs, H - 8);
                        g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(tx - 5, ty - fs * .95, tw + 10, fs * 1.3); g.fillStyle = '#222'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(lab, tx, ty); });
                    if (prog < L && segs.length) { g.fillStyle = s.color || '#c0392b'; g.beginPath(); g.arc(head[0], head[1], H * .016 * (1 + .25 * Math.sin(local * 8)), 0, 7); g.fill(); }
                } else if (!route.length) { g.fillStyle = '#555'; g.font = `${Math.round(H * .04)}px ${FONT}`; g.textAlign = 'center'; g.fillText('Ajoute des lieux au trajet (panneau de droite)', W / 2, H / 2); }
                if (s.title) { const ts = Math.round(H * .05); g.font = `${ts}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top'; const tw = g.measureText(s.title).width; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(W / 2 - tw / 2 - 20, H * .04, tw + 40, ts * 1.5); g.fillStyle = '#fff'; g.fillText(s.title, W / 2, H * .04 + ts * .25); }
                caption(s, 1);
            }
            g.restore();
        }
        function frame(t) {
            const st = starts(), n = show.slides.length; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
            if (!n) { g.fillStyle = '#888'; g.font = `${Math.round(H * .04)}px ${FONT}`; g.textAlign = 'center'; g.fillText('Ajoute des photos, un titre ou une carte (à gauche)', W / 2, H / 2); return -1; }
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

    /* ═════════ ✨ Récit d'une vie : un diaporama écrit à partir de la fiche, sans rien inventer ═════════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
    const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
    const tagOf = e => String(e.gedcom_tag || '').toUpperCase();
    const isType = (e, tags, words = []) => tags.includes(tagOf(e)) || words.some(w => fold(e.type_label).startsWith(w));
    /** « le 1er mars 1894 », « en 1894 », « vers 1784 », « en mai 1925 » */
    function whenOf(e) {
        const d = clean(e.date_text);
        if (!d) return e.year ? `en ${e.year}` : '';
        if (/^(vers|avant|apr[eè]s|entre|environ|autour|circa|an )/i.test(d)) return d;
        if (/^\d{3,4}$/.test(d)) return `en ${d}`;
        if (/^1(er)?\s+\D/.test(d)) return `le 1er ${d.replace(/^1(er)?\s+/, '')}`;
        if (/^\d/.test(d)) return `le ${d}`;
        if (MONTHS.some(m => fold(d).startsWith(fold(m)))) return `en ${d}`;
        return d;
    }
    /** une date complète (« 7 mai 1925 », « 08/12/1960 ») → Date, sinon null (pour un âge exact) */
    function fullDate(txt) {
        const d = fold(clean(txt)).replace(/^le\s+/, '').replace(/^1er/, '1');
        let m = d.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{3,4})$/); if (m) { const mi = MONTHS.findIndex(x => fold(x).startsWith(m[2].slice(0, 3))); if (mi >= 0) return new Date(Number(m[3]), mi, Number(m[1])); }
        m = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return null;
    }
    const whereOf = e => { const pl = clean(e.place_name), co = clean(e.county); if (pl) return `à ${pl}${co && fold(co) !== fold(pl) ? ` (${co})` : ''}`; return clean(e.country) ? `en ${clean(e.country)}` : ''; };
    const placeShort = e => clean(e.place_name) || clean(e.country);
    const yearOfText = t => Number((String(t || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || [])[1]) || 0;
    const isImage = m => (m.media_type ? m.media_type === 'image' : true) && /\.(jpe?g|png|webp|gif)$/i.test(m.filename || '');
    const STORY_KEY = 'genealogie-story-options';

    /** Fabrique le récit. o = {pid, target (s, 0 = selon les textes), theme, aspect, siblings, sources, history, photoIds ([] = aucune, null = toutes), photoItems (Map id → {filename, title, year}), music} → {name, show} */
    async function lifeStory(o) {
        const pid = Number(o.pid); if (!pid) throw new Error('Choisis une personne.');
        const r = await api('person', {id: pid}), p = r.person || {}, AP = A();
        const nm = AP.personName(p), first = clean(p.first_name) || nm, yrs = AP.years?.(p) || '';
        const allMedia = (r.media || []).filter(isImage), byId = new Map(allMedia.map(m => [Number(m.id), m]));
        (o.photoItems || new Map()).forEach((v, k) => { if (!byId.has(k) && v?.filename) byId.set(k, {id: k, filename: v.filename, title: v.title || '', event_year: v.year || '', event_ids: ''}); });
        const portraitM = byId.get(Number(p.portrait_media_id)) || null, portraitFile = portraitM?.filename || (p.portrait && /\.(jpe?g|png|webp|gif)$/i.test(p.portrait) ? p.portrait : '');
        const chosen = (o.photoIds == null ? allMedia.map(m => Number(m.id)) : o.photoIds.map(Number)).filter(id => byId.has(id) && Number(id) !== Number(p.portrait_media_id));
        const unused = new Set(chosen);
        const takePhoto = eid => { const m = chosen.map(id => byId.get(id)).find(x => unused.has(Number(x.id)) && String(x.event_ids || '').split(',').map(Number).includes(Number(eid))); if (m) unused.delete(Number(m.id)); return m || null; };
        const srcByEvent = new Map(), srcPerson = [];
        if (o.sources) (r.sources || []).forEach(s => { const line = `📚 ${clean(s.title) || 'Source'}${clean(s.page) ? `, ${clean(s.page)}` : ''}${clean(s.note) ? ` — ${clean(s.note)}` : ''}`; if (s.entity_type === 'event') { const k = Number(s.entity_id); srcByEvent.set(k, [...(srcByEvent.get(k) || []), line]); } else srcPerson.push(line); });
        const notesOf = e => [...new Set(srcByEvent.get(Number(e?.id)) || [])].join('\n');
        const items = []; // {key (année pour ranger), order, slides[]}
        const words = t => String(t || '').split(/\s+/).filter(Boolean).length;
        const durFor = t => clamp(Math.round(4 + words(t) / 3), 5, 14);
        let kbI = 0; const nextKb = () => ['in', 'out', 'left', 'right'][kbI++ % 4];
        const add = (key, order, ...slides) => items.push({key: Number(key) || 0, order, slides: slides.filter(Boolean)});
        const titleSlide = (title, sub, notes = '') => newSlide('title', {title, sub, dur: durFor(`${title} ${sub}`), notes});
        const photoSlide = (m, text, notes = '') => newSlide('photo', {media_id: Number(m.id), filename: m.filename, text, dur: durFor(text) + 1, kb: nextKb(), notes});
        // 1. la diapositive titre : portrait, nom, dates
        const titleSub = [yrs, clean(p.occupation)].filter(Boolean).join(' — ');
        const opening = newSlide('title', {title: nm, sub: titleSub, dur: 6, notes: srcPerson.join('\n'), ...(portraitFile ? {filename: portraitFile, media_id: Number(p.portrait_media_id) || 0} : {})});
        // 2. les événements, dans l'ordre
        const evs = (r.events || []).filter(e => e && (Number(e.person_id) === pid || e.scope === 'family')).sort((a, b) => (a.year || 9999) - (b.year || 9999) || String(a.sort_date || '').localeCompare(String(b.sort_date || '')) || a.id - b.id);
        const birth = evs.find(e => isType(e, ['BIRT'], ['naissance']));
        const birthY = Number(p.birth_year || birth?.year) || 0, deathE = evs.find(e => isType(e, ['DEAT'], ['deces'])), deathY = Number(p.death_year || deathE?.year) || 0;
        const partnerOf = e => { const other = Number(e.partner1_id) === pid ? Number(e.partner2_id) : Number(e.partner1_id); const q = (r.partners || []).find(x => Number(x.id) === other); return q ? AP.personName(q) : ''; };
        const seenMarr = new Set(); let lastHome = '';
        const parents = (r.parents || []).map(q => AP.personName(q)).filter(Boolean);
        const kids = (r.children || []).slice().sort((a, b) => (a.birth_year || 9999) - (b.birth_year || 9999));
        evs.forEach(e => {
            const when = whenOf(e), where = whereOf(e), desc = clean(e.description || e.title), notes = notesOf(e), ph = () => takePhoto(e.id);
            const key = Number(e.year) || 0;
            if (isType(e, ['BIRT'], ['naissance'])) {
                if (!when && !where) return;
                const txt = clean(`${first} naît ${when} ${where}.`) + (parents.length ? ` ${parents.length > 1 ? 'Ses parents' : 'Parent connu'} : ${parents.join(' et ')}.` : '');
                const hasXY = e.latitude && e.longitude, m = ph();
                add(key, 0, hasXY ? newSlide('map', {title: 'Naissance', route: [{name: placeShort(e), label: placeShort(e), year: e.year || '', lat: +e.latitude, lon: +e.longitude}], mapBg: 'offline', text: txt, dur: Math.max(7, durFor(txt)), notes}) : null,
                    m ? photoSlide(m, hasXY ? clean(m.title) || txt : txt, hasXY ? '' : notes) : !hasXY ? titleSlide('Naissance', txt, notes) : null);
                if (o.siblings && (r.siblings || []).length) { const sib = r.siblings.map(q => `${AP.personName(q)}${q.birth_year ? ` (${q.birth_year})` : ''}`); add(key, 1, titleSlide(sib.length > 1 ? 'Ses frères et sœurs' : 'Son frère ou sa sœur', sib.join(', ') + '.')); }
                return;
            }
            if (isType(e, ['CHR', 'BAPM'], ['bapteme'])) {
                if (!when && !where) return;
                const w = (e.witnesses || []).map(x => `${AP.personName(x)}${clean(x.note) ? ` (${clean(x.note)})` : ''}`);
                const txt = clean(`${first} reçoit le baptême ${when} ${where}.`) + (w.length ? ` Présents : ${w.join(', ')}.` : ''), m = ph();
                add(key, 2, m ? photoSlide(m, txt, notes) : titleSlide('Baptême', txt, notes)); return;
            }
            if (isType(e, ['MARR', 'MRCI', 'MRRE'], ['mariage'])) {
                const fam = Number(e.family_id) || 0, again = fam && seenMarr.has(fam); seenMarr.add(fam);
                if (!when && !where && !partnerOf(e)) return;
                const who = partnerOf(e), txt = again ? clean(`Le mariage ${isType(e, ['MRRE']) ? 'religieux' : 'civil'} est célébré ${when} ${where}.`) : clean(`${first} se marie${who ? ` avec ${who}` : ''} ${when} ${where}.`), m = ph();
                add(key, 3, m ? photoSlide(m, txt, notes) : titleSlide(again ? cap(String(e.type_label || 'Mariage').toLowerCase()) : 'Mariage', txt, notes)); return;
            }
            if (isType(e, ['DEAT'], ['deces'])) {
                if (!when && !where) return;
                const b = fullDate(birth?.date_text), dd = fullDate(e.date_text); let age = '';
                if (b && dd && dd > b) { let n = dd.getFullYear() - b.getFullYear(); if (dd.getMonth() < b.getMonth() || (dd.getMonth() === b.getMonth() && dd.getDate() < b.getDate())) n--; if (n >= 1) age = `, à ${plural(n, 'an')}`; }
                const txt = clean(`${first} meurt ${when} ${where}${age}.`) + (clean(e.cause) ? ` Cause notée : ${clean(e.cause)}.` : ''), m = ph();
                add(key || 9998, 90, m ? photoSlide(m, txt, notes) : titleSlide('Décès', txt, notes)); return;
            }
            if (isType(e, ['BURI', 'CREM', 'FUNE'], ['inhumation', 'incineration', 'obseques', 'sepulture'])) {
                if (!when && !where) return;
                const kind = isType(e, ['CREM'], ['incineration']) ? 'Crémation' : isType(e, ['FUNE'], ['obseques']) ? 'Obsèques' : 'Sépulture';
                const txt = kind === 'Sépulture' ? clean(`${where ? `${first} repose ${where}` : `${first} est inhumé${p.gender === 'female' ? 'e' : ''}`}${when ? ` (inhumation ${when})` : ''}.`) : clean(`${kind} ${when} ${where}.`), m = ph();
                add(key || 9999, 91, m ? photoSlide(m, txt, notes) : titleSlide(kind, txt, notes)); return;
            }
            if (isType(e, ['OCCU'], ['profession', 'metier'])) {
                const job = desc || ''; if (!job) return;
                const txt = clean(`${when ? `${cap(when)}, ` : ''}${first} exerce le métier de ${job}${where ? ` ${where}` : ''}.`), m = ph();
                add(key, 5, m ? photoSlide(m, txt, notes) : titleSlide('Métier', txt, notes)); return;
            }
            if (isType(e, ['RESI'], ['domicile', 'lieu de residence'])) {
                if (!where) return; const moved = lastHome && fold(lastHome) !== fold(placeShort(e)); lastHome = placeShort(e);
                const txt = clean(`${when ? `${cap(when)}, ` : ''}${first} ${moved ? 's’installe' : 'habite'} ${where}${clean(e.address) ? `, ${clean(e.address)}` : ''}.`), m = ph();
                add(key, 6, m ? photoSlide(m, txt, notes) : titleSlide(moved ? 'Déménagement' : 'Domicile', txt, notes)); return;
            }
            if (isType(e, ['CENS'], ['recensement'])) {
                if (!when && !where) return; const y = Number(e.year) || 0;
                if ((r.census?.records || []).some(c => Number(c.year) === y)) return; // le relevé du recensement dit mieux
                const txt = clean(`${y ? `Au recensement de ${y}` : `Au recensement ${when}`}, ${first} vit ${where || ''}${desc ? ` (${desc})` : ''}.`), m = ph();
                add(key, 7, m ? photoSlide(m, txt, notes) : titleSlide(`Recensement${y ? ` de ${y}` : ''}`, txt, notes)); return;
            }
            // les autres événements : leur nom, leur date, leur lieu et ce que la fiche en dit
            if (!when && !where && !desc) return;
            const label = clean(e.type_label) || 'Événement';
            const txt = clean(`${cap(label.toLowerCase())} ${when} ${where}.`) + (desc && fold(desc) !== fold(label) ? ` ${cap(desc)}${/[.!?]$/.test(desc) ? '' : '.'}` : ''), m = ph();
            add(key, 8, m ? photoSlide(m, txt, notes) : titleSlide(label, txt, notes));
        });
        // les recensements relevés (foyer, adresse, métier noté)
        (r.census?.records || []).forEach(c => {
            const y = Number(c.year) || 0, pl = clean(c.place_name), ad = clean(c.address); if (!y || (!pl && !ad)) return;
            const n = (c.members || []).length, job = clean(c.occupation);
            const txt = clean(`Au recensement de ${y}, ${first} vit ${pl ? `à ${pl}${ad ? ` (${ad})` : ''}` : `à l’adresse « ${ad} »`}.`) + (job ? ` Métier noté : ${job}.` : '') + (n > 1 ? ` Le foyer compte ${plural(n, 'personne')}.` : '');
            const m = chosen.map(id => byId.get(id)).find(x => unused.has(Number(x.id)) && (r.media || []).some(rm => Number(rm.id) === Number(x.id) && String(rm.census_ids || '').split(',').map(Number).includes(Number(c.id))));
            if (m) unused.delete(Number(m.id));
            add(y, 7, m ? photoSlide(m, txt) : titleSlide(`Recensement de ${y}`, txt));
        });
        // les enfants : une diapositive, à la naissance du premier
        if (kids.length) {
            const list = kids.map(k => `${clean(k.first_name) || AP.personName(k)}${k.birth_year ? ` (${k.birth_year})` : ''}`);
            add(Number(kids[0].birth_year) || Number(p.marr_year) || 0, 4, titleSlide(kids.length > 1 ? 'Ses enfants' : 'Son enfant', `${kids.length > 1 ? `${plural(kids.length, 'enfant')} connus` : 'Un enfant connu'} : ${list.join(', ')}.`));
        }
        // les autres photos choisies : à leur année, sinon avant la fin
        chosen.filter(id => unused.has(id)).forEach(id => { const m = byId.get(id), y = Number(m.event_year) || yearOfText(m.date_text) || yearOfText(m.title); const txt = clean([clean(m.title), y && !String(m.title || '').includes(String(y)) ? String(y) : ''].filter(Boolean).join(' · ')); add(y || 9997, 9, photoSlide(m, txt)); unused.delete(id); });
        // les événements historiques de l'époque (Listes → Épidémies, guerres, hivers)
        if (o.history && birthY) {
            try {
                const h = await api('historical_context'), until = deathY || Math.min(new Date().getFullYear(), birthY + 100);
                const placesTxt = evs.map(e => fold([e.county, e.state, e.country].join(' '))).join(' '), inFrance = evs.some(e => !clean(e.country) || /france/i.test(e.country));
                const crises = (h.crises || []).filter(c => c.from <= until && c.to >= birthY && (c.scope === 'France' ? inFrance : !/^\d/.test(String(c.scope)) && String(c.scope).split(',').some(s => s.trim() && placesTxt.includes(fold(s.trim())))))
                    .sort((a, b) => a.from - b.from).slice(0, 5);
                if (crises.length) add(Math.max(crises[0].from, birthY), 8, newSlide('title', {title: 'Pendant sa vie', sub: crises.map(c => `${c.from === c.to ? c.from : `${c.from}–${c.to}`} · ${c.title}`).join('\n'), dur: clamp(5 + crises.length * 2, 6, 14), notes: crises.map(c => `${c.title} : ${c.description}`).join('\n')}));
            } catch (_) { /* la liste historique n'est pas là : pas de diapositive */ }
        }
        // la carte des lieux de vie, reliés dans l'ordre (seulement s'il y a au moins deux lieux)
        const route = []; [...evs, ...(r.census?.records || []).map(c => ({...c, type_label: `recensement ${c.year}`}))].filter(e => e.latitude && e.longitude).sort((a, b) => (a.year || 9999) - (b.year || 9999))
            .forEach(e => { const last = route[route.length - 1]; if (last && Math.abs(last.lat - e.latitude) < 1e-4 && Math.abs(last.lon - e.longitude) < 1e-4) return; route.push({name: e.place_name, label: `${e.place_name}${e.type_label ? ` (${String(e.type_label).toLowerCase()})` : ''}`, year: e.year || '', lat: +e.latitude, lon: +e.longitude}); });
        if (route.length > 1) add(deathY ? deathY - .5 : 9996, 89, newSlide('map', {title: 'Les lieux de sa vie', route, mapBg: 'offline', dur: Math.min(30, 6 + route.length * 2), text: route.map(q => q.name).filter((q, i, a) => q && q !== a[i - 1]).join(' → ')}));
        // la fin : la descendance connue
        let ending = null;
        if (kids.length) {
            try {
                const tr = await api('tree', {id: pid, mode: 'descendants', depth: 8}), gens = [];
                const walk = (n, d) => { (n?.children || []).forEach(c => { gens[d] = (gens[d] || 0) + 1; walk(c, d + 1); }); }; walk(tr.tree, 0);
                const names = [['enfant', 'enfants'], ['petit-enfant', 'petits-enfants'], ['arrière-petit-enfant', 'arrière-petits-enfants']];
                const parts = gens.slice(0, 3).map((n, i) => n ? plural(n, names[i][0], names[i][1]) : '').filter(Boolean), rest = gens.slice(3).reduce((a, b) => a + (b || 0), 0);
                if (rest) parts.push(plural(rest, 'autre descendant'));
                if (parts.length) ending = newSlide('title', {title: 'Sa descendance', sub: `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0]} dans la généalogie.`, dur: 7, trans: 'black'});
            } catch (_) {}
        }
        // ranger : par année, puis dans l'ordre de la vie (naissance, baptême, mariage, enfants…)
        items.sort((a, b) => a.key - b.key || a.order - b.order);
        const slides = [opening, ...items.flatMap(x => x.slides), ...(ending ? [ending] : [])];
        // la durée voulue : toutes les diapositives grandissent ou rétrécissent ensemble
        const tot = slides.reduce((a, s) => a + s.dur, 0), target = Number(o.target) || 0;
        if (target > 0 && tot > 0) { const f = target / tot; slides.forEach(s => { s.dur = clamp(Math.round(s.dur * f * 2) / 2, 3, 40); }); }
        slides.forEach((s, i) => { if (!s.trans || i === 0) s.trans = 'fade'; });
        const show = {...newShow(), aspect: ASPECTS[o.aspect] ? o.aspect : '16:9', theme: THEMES[o.theme] ? o.theme : 'classique', slides, musicVol: .4, story: {pid, made: new Date().toISOString().slice(0, 10)}};
        if (o.music?.filename) show.music = {media_id: Number(o.music.id || o.music.media_id) || 0, filename: o.music.filename, title: o.music.title || 'Musique'};
        return {name: `Récit d’une vie — ${nm}`, show, person: p, count: slides.length, skipped: !birth && !deathE};
    }

    /** La fenêtre des choix du récit → les options (ou null si Annuler) */
    function storyOptions({pid = 0, eyebrow = 'DIAPORAMA', submitLabel = '✨ Fabriquer le récit'} = {}) {
        const P = window.LCNDA_PICKER || A(), saved = readJ(STORY_KEY, {});
        pid = Number(pid) || Number(A().state.currentPersonId) || 0;
        let photoIds = null, photoItems = new Map(), music = saved.music?.filename ? saved.music : null, personMedia = [], done = false, loadSeq = 0;
        return new Promise(res => {
            ext.openDialog({eyebrow, title: '✨ Récit d’une vie', submitLabel, wide: true,
                body: `<p class="muted">Choisis une personne : un diaporama se prépare tout seul avec sa fiche (naissance, baptême, mariage, enfants, métiers, recensements, déménagements, décès, sépulture), ses photos, ses lieux sur une carte. Une information absente ne donne pas de diapositive ; tout reste modifiable ensuite.</p>
                    <div class="h-pk-solo"><span class="pk-lab">Personne</span>${P.pickerField({name: 'st_person', kind: 'person', value: pid || null, animals: false})}</div>
                    <div class="h-st-sum" data-st-sum hidden></div>
                    <div class="h-st-grid">
                        <label><span${help('Le récit prend à peu près cette durée : chaque diapositive grandit ou rétrécit un peu. « Selon les textes » laisse le temps de lire.', 'récit d’une vie')}>Durée souhaitée</span><select name="target">${[[0, 'Selon les textes'], [60, 'Environ 1 minute'], [120, 'Environ 2 minutes'], [180, 'Environ 3 minutes'], [300, 'Environ 5 minutes'], [480, 'Environ 8 minutes'], [600, 'Environ 10 minutes']].map(([v, l]) => `<option value="${v}" ${Number(saved.target || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label>Style<select name="theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${(saved.theme || 'ancien') === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
                        <label>Format<select name="aspect">${Object.keys(ASPECTS).map(k => `<option ${(saved.aspect || '16:9') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
                    <div class="h-st-photos"><button type="button" class="button small secondary" data-st-photos>🖼 Choisir les photos…</button><span class="muted" data-st-photocount>Choisis d’abord une personne.</span><span class="h-st-thumbs" data-st-thumbs></span></div>
                    <span class="pk-lab">🎵 Musique de fond (facultatif)</span>${P.mediaField ? P.mediaField({name: '', types: ['audio'], title: 'Une musique de fond', okLabel: 'Prendre ce son', value: music ? {id: music.id, title: music.title, filename: music.filename} : null}) : ''}
                    <div class="h-st-opts">
                        <label class="ui-toggle"><input type="checkbox" name="siblings" ${saved.siblings ? 'checked' : ''}><i></i>Inclure les frères et sœurs</label>
                        <label class="ui-toggle"><input type="checkbox" name="sources" ${saved.sources !== false ? 'checked' : ''}><i></i><span${help('Les sources de chaque événement (titre, page) sont écrites dans les notes de sa diapositive : on les voit en modifiant, pas pendant la lecture.')}>Mettre les sources dans les notes</span></label>
                        <label class="ui-toggle"><input type="checkbox" name="history" ${saved.history !== false ? 'checked' : ''}><i></i><span${help('Les épidémies, guerres et grands hivers que l’app connaît (Listes → Épidémies, guerres, hivers) et qui ont eu lieu pendant sa vie.')}>Ajouter les événements historiques de l’époque</span></label></div>`,
                onOpen: dg => {
                    const sum = dg.querySelector('[data-st-sum]'), cnt = dg.querySelector('[data-st-photocount]'), th = dg.querySelector('[data-st-thumbs]');
                    const paintPhotos = () => {
                        const ids = photoIds == null ? personMedia.map(m => Number(m.id)) : photoIds;
                        cnt.textContent = !pid ? 'Choisis d’abord une personne.' : ids.length ? `${plural(ids.length, 'photo choisie', 'photos choisies')}` : 'Aucune photo : le récit sera fait de titres et de cartes.';
                        th.innerHTML = ids.slice(0, 12).map(id => { const m = personMedia.find(x => Number(x.id) === id) || photoItems.get(id); return m?.filename ? `<img src="${esc(mediaUrl(m.thumbnail || m.filename))}" alt="" loading="lazy">` : ''; }).join('');
                    };
                    const load = async () => {
                        const my = ++loadSeq; photoIds = null; personMedia = []; sum.hidden = true; paintPhotos(); if (!pid) return;
                        try { const r = await api('person', {id: pid}); if (my !== loadSeq) return; const pp = r.person || {};
                            personMedia = (r.media || []).filter(isImage).filter(m => Number(m.id) !== Number(pp.portrait_media_id));
                            const n = (r.events || []).filter(e => Number(e.person_id) === pid || e.scope === 'family').length;
                            sum.hidden = false; sum.innerHTML = `<b>${esc(A().personName(pp))}</b> ${esc(A().years?.(pp) || '')} · ${esc(plural(n, 'événement'))} · ${esc(plural(personMedia.length, 'photo'))}${(r.children || []).length ? ` · ${esc(plural(r.children.length, 'enfant'))}` : ''}${pp.portrait_media_id || pp.portrait ? ' · portrait ✓' : ''}`;
                            paintPhotos(); } catch (e) { toast(e.message, 'error'); }
                    };
                    dg.addEventListener('picker-change', e => { if (e.detail?.name !== 'st_person') return; pid = Number(e.detail.value) || 0; load(); });
                    dg.addEventListener('media-change', e => { const it = e.detail?.item; music = it?.filename ? {id: Number(it.id), filename: it.filename, title: it.title || ''} : null; });
                    dg.querySelector('[data-st-photos]').addEventListener('click', async () => {
                        if (!pid) return toast('Choisis d’abord une personne.', 'error');
                        if (!P.openMediaPicker) return toast('La fenêtre des médias n’est pas encore prête.', 'error');
                        const ids = photoIds == null ? personMedia.map(m => Number(m.id)) : photoIds;
                        const list = await P.openMediaPicker({types: ['image'], multiple: true, person: pid, eyebrow: 'RÉCIT D’UNE VIE', title: 'Les photos du récit', okLabel: 'Prendre ces photos', value: ids.map(id => personMedia.find(x => Number(x.id) === id) || photoItems.get(id) || id)});
                        if (!list) return; photoIds = list.map(m => Number(m.id)).filter(Boolean);
                        const need = list.filter(m => !m.filename).map(m => Number(m.id)); let more = [];
                        if (need.length && P.loadMedia) { try { more = await P.loadMedia(need) || []; } catch (_) {} }
                        [...list, ...more].forEach(m => { if (m?.filename) photoItems.set(Number(m.id), {id: Number(m.id), filename: m.filename, thumbnail: m.thumb ? String(m.thumb).replace(/^media\//, '') : m.thumbnail, title: m.title || '', year: m.year || ''}); });
                        paintPhotos();
                    });
                    dg.addEventListener('close', () => { if (!done) res(null); }, {once: true});
                    load(); setTimeout(() => (dg.querySelector('.pk-search:not([hidden]) .pk-input') || dg.querySelector('[type=submit]'))?.focus(), 40);
                },
                onSubmit: f => {
                    if (!pid) { toast('Choisis une personne.', 'error'); return false; }
                    const o = {pid, target: Number(f.elements.target.value) || 0, theme: f.elements.theme.value, aspect: f.elements.aspect.value, siblings: f.elements.siblings.checked, sources: f.elements.sources.checked, history: f.elements.history.checked, photoIds, photoItems, music};
                    writeJ(STORY_KEY, {target: o.target, theme: o.theme, aspect: o.aspect, siblings: o.siblings, sources: o.sources, history: o.history, music});
                    done = true; res(o);
                }});
        });
    }
    ext.lifeStory = lifeStory;
    ext.storyOptions = storyOptions;

    /* ═════════ L'éditeur ═════════ */
    async function open(ctx = {}) {
        injectCss();
        let id = 0, name = 'Mon diaporama', show = newShow();
        if (ctx.id) { try { const r = await api('slideshow', {id: ctx.id}); if (r.show?.mode === 'keynote') return ext.openKeynote ? ext.openKeynote({...ctx, preload: r}) : toast('L’éditeur de présentation n’est pas chargé.', 'error'); id = r.id; name = r.name; show = {...newShow(), ...(r.show || {})}; show.slides = (Array.isArray(show.slides) ? show.slides : []).filter(x => x && typeof x === 'object').map(x => ({...x, dur: Math.min(600, Math.max(1, Number(x.dur) || 5))})); } catch (e) { return toast(e.message, 'error'); } }
        if (ctx.preset?.show) { show = {...newShow(), ...ctx.preset.show}; name = ctx.preset.name || name; }
        let cur = 0, dirty = !!ctx.preset, t = 0, playing = false, raf = 0, t0 = 0, p0 = 0, recording = null, hist = [], hi = -1, histT = 0;
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-ss-dlg';
        const ui = UI(), extra = `<span class="h-ss-extra" data-tbg="ss-top" data-tbg-label="Barre du haut (format, style, musique)">
                <label data-ss-fmtw title="Format de l’image (16:9 pour un écran, 9:16 pour un téléphone)"><span class="h-ss-hide-s">Format</span><select data-ss-g="aspect" aria-label="Format">${Object.keys(ASPECTS).map(k => `<option ${show.aspect === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
                <label data-ss-stylew title="Le style : couleurs et police des titres"><span class="h-ss-hide-s">Style</span><select data-ss-g="theme" aria-label="Style">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${show.theme === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
</span><span class="h-ss-progress" data-ss-progress aria-live="polite"></span>`;
        const top = ui.editorTopbar ? ui.editorTopbar({icon: '🎞️', name, nameAttrs: 'data-ss-name', undo: true, status: id ? 'saved' : '', extra,
            buttons: {customize: ext.tbButton ? {html: '⚙️ Personnaliser', attrs: 'data-tb-config="slideshow"'} : null, export: {attrs: 'data-ss-cmd="export"', title: 'Exporter : vidéo, images, PDF, impression, fichier'}, save: {attrs: 'data-ss-cmd="save"'}, full: ext.fullButton ? {attrs: 'data-full-toggle="slideshow"', title: 'Plein écran (⛶)'} : null, close: {attrs: 'data-ss-cmd="close"'}}}).replace('<header class="ui-topbar"', '<header class="ui-topbar h-ss-top"')
            : `<header class="h-ss-top"><span class="h-ss-logo">🎞️</span><input class="h-ss-name" data-ss-name value="${esc(name)}" maxlength="200">${extra}<span class="spacer"></span><span data-ui-status></span><button type="button" class="button small secondary" data-ss-cmd="export">⤓ Exporter ▾</button><button type="button" class="button small" data-ss-cmd="save">💾 Enregistrer</button><button type="button" class="icon-button" data-ss-cmd="close">×</button></header>`;
        dlg.innerHTML = `<div class="h-ss">${top}
            <div class="h-ss-main">
                <aside class="h-ss-list"><div class="h-ss-add" data-tbg="ss-add" data-tbg-label="Ajouter (à gauche)"><button type="button" data-ss-cmd="addphotos">＋ Photos</button><button type="button" data-ss-cmd="addtitle">＋ Titre</button><button type="button" data-ss-cmd="addmap">＋ Carte (trajet)</button><button type="button" class="is-story" data-ss-cmd="story" title="Un diaporama tout fait à partir de la fiche d’une personne">✨ Récit d’une vie</button></div><ol data-ss-slides></ol></aside>
                <section class="h-ss-center"><div class="h-ss-stage" data-ss-stage><canvas data-ss-canvas></canvas></div>
                    <div class="h-ss-transport"><span class="h-ss-tgrp" data-tbg="ss-transport" data-tbg-label="Lecture"><button type="button" class="button small" data-ss-cmd="play" data-shortcut="Espace">▶ Lire</button><button type="button" class="button small secondary" data-ss-cmd="watch" title="Regarder en plein écran (Échap pour revenir)">📺 Regarder</button></span><input type="range" data-ss-seek min="0" max="1000" value="0" aria-label="Avancer dans le diaporama" data-ui-done="other-scale"><output data-ss-time>0:00 / 0:00</output></div></section>
                <aside class="h-ss-props" data-ss-props></aside></div></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'slideshow', true); dlg.showModal();
        const $ = s => dlg.querySelector(s), canvas = $('[data-ss-canvas]');
        ext.tbApply?.(dlg, 'slideshow');
        let eng = makeEngine(show, canvas);
        const progress = s => { $('[data-ss-progress]').textContent = s || ''; };
        const state = st => (ui.savedStatus ? ui.savedStatus(dlg, st) : (($('[data-ui-status]') || {}).textContent = st === 'saved' ? '✓ Enregistré' : st === 'dirty' ? '• modifié' : ''));
        /* ─── annuler / rétablir : des photos de tout le diaporama ─── */
        const snap = () => JSON.stringify(show);
        const histBtns = () => { const u = $('[data-ui-cmd="undo"]'), r = $('[data-ui-cmd="redo"]'); if (u) u.disabled = hi <= 0; if (r) r.disabled = hi >= hist.length - 1; };
        const commit = () => { clearTimeout(histT); const s = snap(); if (hist[hi] === s) return; hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 80) hist.shift(); hi = hist.length - 1; histBtns(); };
        const touch = () => { dirty = true; state('dirty'); clearTimeout(histT); histT = setTimeout(commit, 350); };
        async function restore(s) { show = JSON.parse(s); cur = clamp(cur, 0, Math.max(0, show.slides.length - 1)); dirty = true; state('dirty'); syncTop(); histBtns(); await rebuild(); }
        const undo = async () => { if (playing) play(); if (hist[hi] !== snap()) commit(); if (hi > 0) { hi--; await restore(hist[hi]); } };
        const redo = async () => { if (playing) play(); if (hi < hist.length - 1) { hi++; await restore(hist[hi]); } };
        const syncTop = () => { const a = $('[data-ss-g="aspect"]'), th = $('[data-ss-g="theme"]'); if (a) a.value = show.aspect; if (th) th.value = show.theme; };
        const rebuild = async () => { eng = makeEngine(show, canvas); await eng.prepare(); paint(); };
        /* ─── la liste des diapositives ─── */
        const ICON = {photo: '🖼️', title: '🔤', map: '🗺️'};
        function paintList() {
            $('[data-ss-slides]').innerHTML = show.slides.map((s, i) => `<li class="h-ss-item${i === cur ? ' is-cur' : ''}" data-ss-i="${i}" draggable="true"><span class="h-ss-thumb">${(s.type === 'photo' || s.type === 'title') && s.filename ? `<img src="${esc(mediaUrl(s.filename))}" alt="" loading="lazy">` : ICON[s.type]}</span><span class="h-ss-lbl"><b>${i + 1}.</b> ${esc(s.type === 'photo' ? (s.text || s.title || 'Photo') : s.type === 'title' ? (s.title || (s.sub ? `« ${String(s.sub).slice(0, 40)}… »` : 'Titre')) : (s.title || 'Carte'))}<small>${s.dur}s${s.voice ? ' · 🎙' : ''}${s.notes ? ' · <span class="h-ss-notes-ico" title="Notes">📝</span>' : ''}</small></span><button type="button" class="icon-button small" data-ss-del="${i}" title="Retirer">×</button></li>`).join('') || `<li class="h-ss-empty">${A().emptyState ? A().emptyState({icon: '🎞️', text: 'Aucune diapositive pour l’instant', hint: 'Ajoute des photos, un titre, une carte, ou laisse « ✨ Récit d’une vie » tout préparer. Tu peux aussi glisser des photos ici.'}) : 'Aucune diapositive.'}</li>`;
            const tot = eng.total(); $('[data-ss-time]').textContent = `${fmt(t)} / ${fmt(tot)}`;
        }
        const F = (label, html, tip = '') => `<div class="h-ss-f"><span class="h-ss-fl"${tip ? help(tip) : ''}>${esc(label)}</span>${html}</div>`;
        const sec = (key, title, body, open = true) => (ui.panelSection ? ui.panelSection({title, key: `ss-${key}`, open, body}) : `<h4>${esc(title)}</h4>${body}`);
        function paintMusic() {
            $('[data-ss-music]').innerHTML = show.music ? `<button type="button" class="button small secondary" data-ss-cmd="music" title="Musique : ${esc(show.music.title || '')} (clic pour la changer)">🎵 ${esc(String(show.music.title || 'Musique').slice(0, 16))}</button><button type="button" class="icon-button small" data-ss-cmd="nomusic" title="Retirer la musique">✕</button><input type="range" min="0" max="100" value="${Math.round((show.musicVol ?? .5) * 100)}" data-ss-g="musicVol" data-unit="%" aria-label="Volume de la musique" title="Volume de la musique"><span${help('Le volume de la musique de fond. Elle baisse toute seule pendant qu’une voix enregistrée parle.')}></span>` : '<button type="button" class="button small secondary" data-ss-cmd="music" title="Une musique de fond, prise dans les sons des médias">🎵 Musique</button>';
        }
        function paintProps() {
            const s = show.slides[cur], box = $('[data-ss-props]'), th = THEMES[show.theme] || THEMES.classique;
            const doc = sec('doc', '🎞️ Tout le diaporama', `${F('Police des textes', `<button type="button" class="button small secondary h-ss-fontbtn" data-ss-cmd="font" style="font-family:${esc(fontOf(show, th))}">${esc(show.font || `Police du style (${th.label})`)} ▾</button>`, 'La police de tous les titres et légendes. Sans choix, c’est celle du style (Classique, Album ancien…).')}${show.font ? '<button type="button" class="link-button" data-ss-cmd="fontreset">↺ Revenir à la police du style</button>' : ''}${F('Musique de fond', '<span class="h-ss-music" data-ss-music></span>')}<p class="muted">${plural(show.slides.length, 'diapositive')} · ${fmt(eng.total())}</p><button type="button" class="button small secondary" data-ss-cmd="tokeynote" title="Une présentation façon Keynote faite de ces diapositives (textes, formes, animations, mode présentateur…) ; le diaporama reste tel quel">🎤 En faire une présentation…</button>`, true);
            if (!s) { box.innerHTML = `<p class="muted">Choisis une diapositive (à gauche) pour régler sa durée, sa transition, son texte, sa voix.</p>${doc}`; paintMusic(); return; }
            const h = [`<h4>${ICON[s.type]} Diapositive ${cur + 1}</h4>`];
            // Couleur
            if (s.type === 'title') h.push(sec('color', 'Couleur', `<div class="h-ss-grid">${F('Fond', `<input type="color" data-ss-p="bg" value="${esc(s.bg || th.bg)}">`)}${F('Texte', `<input type="color" data-ss-p="fg" value="${esc(s.fg || th.fg)}">`)}</div>`));
            if (s.type === 'map') h.push(sec('color', 'Couleur', F('Couleur du trajet', `<input type="color" data-ss-p="color" value="${esc(s.color || '#c0392b')}">`)));
            // Texte
            h.push(sec('text', 'Texte', `${s.type === 'title' ? `${F('Titre', `<textarea rows="2" data-ss-p="title">${esc(s.title || '')}</textarea>`)}${F('Sous-titre', `<textarea rows="3" data-ss-p="sub">${esc(s.sub || '')}</textarea>`)}` : ''}${s.type === 'map' ? F('Titre sur la carte', `<input data-ss-p="title" value="${esc(s.title || '')}" maxlength="120">`) : ''}
                ${F(s.type === 'map' ? 'Légende' : 'Texte (légende)', `<textarea rows="3" data-ss-p="text" placeholder="Ce que raconte cette diapositive…">${esc(s.text || '')}</textarea>`)}${F('Place du texte', `<select data-ss-p="textPos">${[['bottom', 'En bas'], ['top', 'En haut'], ['center', 'Au milieu']].map(([k, l]) => `<option value="${k}" ${s.textPos === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'Où se pose la légende sur l’image : en bas, en haut ou au milieu, dans un bandeau sombre pour bien se lire.')}`));
            // Effets
            h.push(sec('fx', 'Effets', `<div class="h-ss-grid">${F('Transition', `<select data-ss-p="trans">${TRANS.map(([k, l]) => `<option value="${k}" ${s.trans === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'Comment on passe de la diapositive d’avant à celle-ci : fondu, glissement, passage par le noir, ou coupe nette.')}${s.type === 'photo' ? F('Mouvement', `<select data-ss-p="kb">${KB.map(([k, l]) => `<option value="${k}" ${s.kb === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'Un lent mouvement de caméra sur la photo (effet « Ken Burns ») : elle s’approche, s’éloigne ou glisse doucement.') : ''}</div>
                ${s.type === 'photo' ? F('Cadrage', `<select data-ss-p="fit"><option value="cover" ${s.fit !== 'contain' ? 'selected' : ''}>Plein écran (recadrée)</option><option value="contain" ${s.fit === 'contain' ? 'selected' : ''}>Photo entière (fond flou)</option></select>`, '« Plein écran » remplit l’écran et coupe un peu les bords ; « Photo entière » la montre en entier sur un fond flou.') : ''}`));
            // Durée
            h.push(sec('time', 'Durée', `${F('Durée (secondes)', `<input type="number" min="1" max="120" step="0.5" value="${s.dur}" data-ss-p="dur">`)}${s.voice ? `<button type="button" class="link-button" data-ss-cmd="voicefit"${help('La diapositive dure exactement le temps de la voix enregistrée, plus un petit silence.')}>⇥ durée = voix</button>` : ''}`));
            // Photo / portrait
            if (s.type === 'photo') h.push(sec('photo', 'Photo', '<button type="button" class="button small secondary" data-ss-cmd="rephoto">🖼️ Changer la photo</button>'));
            if (s.type === 'title') h.push(sec('photo', 'Portrait', `<div class="h-ss-portrait">${s.filename ? `<img src="${esc(mediaUrl(s.filename))}" alt="">` : ''}<button type="button" class="button small secondary" data-ss-cmd="portrait">🖼 ${s.filename ? 'Changer' : 'Une photo ronde au-dessus du titre…'}</button>${s.filename ? '<button type="button" class="icon-button small" data-ss-cmd="noportrait" title="Retirer la photo">✕</button>' : ''}</div>`, !!s.filename));
            // Trajet
            if (s.type === 'map') h.push(sec('route', 'Trajet', `${F('Fond de carte', `<select data-ss-p="mapBg"><option value="offline">Hors ligne</option>${A().mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml(s.mapBg || '') : ''}</select>`)}
                <ol class="h-ss-route">${(s.route || []).map((q, i) => `<li><input data-ss-r="${i}:label" value="${esc(q.label || q.name || '')}" placeholder="Lieu" aria-label="Nom du lieu"><input data-ss-r="${i}:year" value="${esc(q.year || '')}" placeholder="Année" size="5" aria-label="Année"><button type="button" class="icon-button small" data-ss-rup="${i}" title="Monter">↑</button><button type="button" class="icon-button small" data-ss-rdel="${i}" title="Retirer">✕</button></li>`).join('')}</ol>
                <div class="h-ss-addplace" data-ss-addplace>${(window.LCNDA_PICKER || A()).pickerField({name: 'ss_place', kind: 'place'})}</div><button type="button" class="button small secondary" data-ss-cmd="routeperson">👤 Les lieux de la vie d’une personne…</button>`));
            // Voix
            h.push(sec('voice', '🎙 Voix', `${s.voice ? `<audio controls src="${esc(mediaUrl(s.voice.filename))}"></audio><div class="h-ss-row"><button type="button" class="link-button" data-ss-cmd="voicedel">retirer la voix</button></div>` : ''}
                <div class="h-ss-row"><button type="button" class="button small ${recording ? 'danger' : ''}" data-ss-cmd="rec">${recording ? '⏹ Arrêter' : '🎙 Enregistrer ma voix'}</button><button type="button" class="button small secondary" data-ss-cmd="voicepick">🔊 Un son de la base…</button></div>`, !!s.voice));
            // Notes
            h.push(sec('notes', '📝 Notes', F('Notes (sources, rappels)', `<textarea rows="3" data-ss-p="notes" placeholder="Pour toi : les sources, ce qu’il reste à vérifier…">${esc(s.notes || '')}</textarea>`, 'Les notes ne se voient pas pendant la lecture ; elles suivent la diapositive quand on en fait une présentation (notes de l’orateur).'), !!s.notes));
            box.innerHTML = h.join('') + doc; paintMusic();
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
        /** Photos ou son : la fenêtre unique des médias (un fichier de l'ordinateur y entre et se coche). Résout [{media_id, filename, title}] ([] si rien). */
        async function pickMedia({kind = 'image', multi = true, title = 'Choisir'} = {}) {
            const P = window.LCNDA_PICKER; if (!P?.openMediaPicker) { toast('La fenêtre des médias n’est pas encore prête. Réessaie dans un instant.', 'error'); return []; }
            const r = await P.openMediaPicker({types: [kind === 'image' ? 'image' : 'audio'], multiple: multi, eyebrow: 'DIAPORAMA', title, person: show.story?.pid || null});
            return (r ? (Array.isArray(r) ? r : [r]) : []).map(m => ({media_id: Number(m.id), filename: m.filename, title: m.title || ''}));
        }
        async function addPhotoList(list) { if (!list.length) return; list.forEach((m, k) => show.slides.splice(cur + 1 + k, 0, newSlide('photo', {media_id: m.media_id, filename: m.filename, text: m.title || ''}))); cur = Math.min(show.slides.length - 1, cur + 1); touch(); await rebuild(); }
        async function addPhotos() { await addPhotoList(await pickMedia({title: 'Ajouter des photos'})); }
        /* ─── E4 : une photo ou un son glissé (ou collé) entre dans les Médias puis dans le diaporama ─── */
        async function dropFiles(files) {
            const imgs = files.filter(f => /^image\//.test(f.type)), snd = files.filter(f => /^audio\//.test(f.type)), added = [];
            if (!imgs.length && !snd.length) return toast('Glisse des photos ou un son.', 'error');
            progress(`Envoi de ${plural(imgs.length + snd.length, 'fichier')}…`);
            try {
                for (const f of imgs.slice(0, 60)) { const r = await toMedia(f, f.name, 'image', f.name.replace(/\.[^.]+$/, '')); added.push({media_id: Number(r.media_id), filename: r.filename, title: f.name.replace(/\.[^.]+$/, '')}); }
                if (snd[0]) { const f = snd[0], r = await toMedia(f, f.name, 'audio', f.name.replace(/\.[^.]+$/, '')); show.music = {media_id: Number(r.media_id), filename: r.filename, title: f.name.replace(/\.[^.]+$/, '')}; music?.pause(); music = null; touch(); paintMusic(); }
                await addPhotoList(added); progress(''); toast(`${plural(imgs.length + (snd.length ? 1 : 0), 'fichier ajouté', 'fichiers ajoutés')} aux Médias${snd.length ? ' (le son devient la musique)' : ''}.`);
            } catch (e) { progress(''); toast(e.message, 'error'); }
        }
        ui.bindFileDrop?.($('.h-ss-main'), dropFiles, {accept: 'image/*,audio/*'});
        /* ─── ✨ le récit d'une vie ─── */
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
        async function story(pid0 = 0) {
            const o = await storyOptions({pid: pid0 || show.story?.pid || 0}); if (!o) return;
            if (playing) play();
            progress('✨ Préparation du récit…');
            try {
                const st = await lifeStory(o); progress('');
                if (!st.show.slides.length) return toast('Rien à raconter pour cette personne.', 'error');
                let replace = !show.slides.length;
                if (!replace) replace = await A().confirmBox(`${plural(st.count, 'diapositive est prête', 'diapositives sont prêtes')}. Elles peuvent remplacer celles du diaporama ou venir à la suite.`, {title: 'Remplacer le diaporama par le récit ?', okLabel: 'Remplacer', cancelLabel: 'Ajouter à la suite', danger: false});
                if (replace) { show = st.show; cur = 0; } else { show.slides.push(...st.show.slides); if (!show.music && st.show.music) show.music = st.show.music; show.story = st.show.story; cur = show.slides.length - st.show.slides.length; }
                if (replace || name === 'Mon diaporama') { name = st.name; $('[data-ss-name]').value = name; }
                music?.pause(); music = null; syncTop(); touch(); await rebuild(); drawAt(.9);
                toast(`✨ ${plural(st.count, 'diapositive')} : chaque texte vient de la fiche. Tout reste modifiable.`);
            } catch (e) { progress(''); toast(e.message, 'error'); }
        }
        /* ─── voix ─── */
        async function rec() {
            const s = show.slides[cur]; if (!s) return;
            if (recording) { recording.stop(); return; }
            let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (_) { return toast('Micro inaccessible (autorise-le dans le navigateur ou le système).', 'error'); }
            const chunks = [], mr = new MediaRecorder(stream); recording = mr; paintProps(); progress('🔴 Enregistrement… (⏹ pour arrêter)');
            mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
            mr.onstop = async () => { stream.getTracks().forEach(x => x.stop()); recording = null; const blob = new Blob(chunks, {type: mr.mimeType || 'audio/webm'});
                try { const j = await toMedia(blob, 'voix.webm', 'audio', `Voix — ${name} — diapositive ${cur + 1}`);
                    s.voice = {media_id: j.media_id, filename: j.filename}; const dur = await audioDur(mediaUrl(s.voice.filename)); if (dur && dur + 1 > s.dur) s.dur = Math.ceil(dur + 1); touch(); progress(''); paint(); }
                catch (e) { progress(''); toast(`Voix : ${e.message}`, 'error'); paintProps(); } };
            mr.start();
        }
        const audioDur = src => new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = src; });
        /* ─── E3 : exporter (une seule fenêtre) ─── */
        const curName = () => $('[data-ss-name]').value.trim() || name;
        const goBtn = txt => { const b = document.querySelector('dialog.ui-export[open] [data-ui-go]'); if (b) b.textContent = txt; };
        async function recordVideo() {
            if (typeof MediaRecorder !== 'function') throw new Error('ce navigateur ne sait pas enregistrer de vidéo');
            if (playing) play();
            await eng.prepare();
            const total = eng.total();
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
            mr.start(500); if (mus) { mus.gain.gain.value = show.musicVol ?? .5; mus.a.play().catch(() => {}); }
            const start = performance.now(); let lastI = -1;
            await new Promise(resolve => { const step = () => { const tt = (performance.now() - start) / 1000; if (tt >= total) { eng.frame(total); return resolve(); } const i = eng.frame(tt); if (i !== lastI) { voices.get(lastI)?.a.pause(); const v = voices.get(i); if (v) { v.a.currentTime = 0; v.a.play().catch(() => {}); } lastI = i; }
                if (mus) { const v = voices.get(i); mus.gain.gain.value = (show.musicVol ?? .5) * (v && !v.a.paused && !v.a.ended ? .3 : 1); } const pc = `⏺ ${Math.round(tt / total * 100)} % (${fmt(tt)} / ${fmt(total)})`; progress(pc); goBtn(pc); requestAnimationFrame(step); }; step(); });
            mr.stop(); mus?.a.pause(); voices.forEach(v => v.a.pause()); await done; ac.close(); progress('');
            const blob = new Blob(chunks, {type: 'video/webm'});
            if (!blob.size) throw new Error('la vidéo est vide : l’enregistrement n’a pas pu se faire dans ce navigateur');
            return {blob, total};
        }
        async function slideImage(i, type = 'image/png') { await eng.prepare(); const st = eng.starts(), s = show.slides[i]; eng.frame((st[i] || 0) + Math.min(Math.max(1, +s.dur || 5) * .6, Math.max(1, +s.dur || 5) - .05)); const url = canvas.toDataURL(type, .92); return url; }
        const dataBlob = url => fetch(url).then(r => r.blob());
        async function exportDialog() {
            if (!show.slides.length) return toast('Le diaporama est vide : ajoute une diapositive d’abord.', 'error');
            if (playing) play();
            const n = curName(), here = t;
            const imgRun = type => async o => { const url = await slideImage(cur, type === 'png' ? 'image/png' : 'image/jpeg'), blob = await dataBlob(url); download(blob, o.filename); if (o.saveCopy) await toMedia(blob, o.filename, 'image', `${n} — diapositive ${cur + 1}`); drawAt(here); };
            const pagesRun = async () => {
                const w = window.open('', '_blank'); if (!w) throw new Error('fenêtre bloquée par le navigateur');
                const urls = []; for (let i = 0; i < show.slides.length; i++) { goBtn(`Préparation ${i + 1} / ${show.slides.length}…`); urls.push(await slideImage(i, 'image/jpeg')); }
                const [W, H] = ASPECTS[show.aspect] || ASPECTS['16:9'];
                w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(n)}</title><style>@page{size:${W > H ? 'landscape' : 'portrait'};margin:8mm}body{margin:0;font:12px Georgia,serif}figure{margin:0 0 6mm;page-break-after:always;text-align:center}img{max-width:100%;max-height:170mm}figcaption{color:#555;margin-top:2mm;white-space:pre-line;text-align:left}</style>${urls.map((u, i) => `<figure><img src="${u}" alt=""><figcaption>${i + 1}. ${esc(show.slides[i].notes || '')}</figcaption></figure>`).join('')}<script>onload=()=>setTimeout(()=>print(),400)<\/script>`);
                w.document.close(); drawAt(here);
            };
            await ui.openExportDialog({title: n, defaultName: n, quality: false, saveCopy: true, info: `${plural(show.slides.length, 'diapositive')} · ${fmt(eng.total())} · ${show.aspect}`,
                preview: () => canvas.toDataURL('image/jpeg', .8),
                formats: [
                    {id: 'video', label: '🎬 Vidéo', hint: 'WebM, avec le son', ext: 'webm', run: async o => { const {blob, total} = await recordVideo(); download(blob, o.filename); if (o.saveCopy) await toMedia(blob, o.filename, 'video', n, {duration: total}); drawAt(here); toast(o.saveCopy ? 'Vidéo téléchargée et rangée dans les Médias.' : 'Vidéo téléchargée.'); }},
                    {id: 'png', hint: 'cette diapositive', run: imgRun('png')},
                    {id: 'jpg', hint: 'cette diapositive', run: imgRun('jpg')},
                    {id: 'pdf', hint: 'une diapositive par page (« Enregistrer en PDF »)', ext: '', run: pagesRun},
                    {id: 'print', hint: 'avec les notes', run: pagesRun},
                    {id: 'file', hint: 'pour le rouvrir ailleurs', ext: 'json', run: async o => download(new Blob([JSON.stringify({type: 'lcnda-diaporama', version: 1, name: n, show}, null, 1)], {type: 'application/json'}), o.filename)},
                ]});
        }
        async function save() {
            name = curName() || 'Mon diaporama'; state('saving');
            try { const r = await post('save_slideshow', {id, name, show}); id = r.result.id; dirty = false; state('saved'); ctx.onSaved?.(id); } catch (e) { state('error'); toast(e.message, 'error'); }
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
            const uc = e.target.closest('[data-ui-cmd]')?.dataset.uiCmd; if (uc === 'undo') return undo(); if (uc === 'redo') return redo();
            const c = e.target.closest('[data-ss-cmd]'); if (!c) return; const k = c.dataset.ssCmd;
            if (k === 'close') return close();
            if (k === 'save') return save();
            if (k === 'play') return play();
            if (k === 'watch') { const st = $('[data-ss-stage]'); if (document.fullscreenElement) document.exitFullscreen(); else st.requestFullscreen?.().catch(() => {}); return; }
            if (k === 'export') return exportDialog().catch(err => { progress(''); toast(err.message || 'Export impossible.', 'error'); });
            if (k === 'addphotos') return addPhotos();
            if (k === 'addtitle') { show.slides.splice(cur + 1, 0, newSlide('title', {title: 'Titre', sub: ''})); cur = Math.min(cur + 1, show.slides.length - 1); touch(); return rebuild(); }
            if (k === 'addmap') { show.slides.splice(cur + 1, 0, newSlide('map', {title: 'Le trajet', route: [], mapBg: 'offline'})); cur = Math.min(cur + 1, show.slides.length - 1); touch(); return rebuild(); }
            if (k === 'story') return story();
            if (k === 'tokeynote') { if (!ext.keynoteFromSlideshow) return toast('L’éditeur de présentation n’est pas chargé.', 'error'); if (playing) play(); return ext.keynoteFromSlideshow(show, curName(), {onSaved: ctx.onSaved, onClose: ctx.onClose}); }
            if (k === 'font') { if (!ui.openFontPicker) return; const f = await ui.openFontPicker({value: show.font || '', sample: show.slides.find(x => x.type === 'title')?.title || name}); if (f) { show.font = String(f).slice(0, 100); touch(); await rebuild(); } return; }
            if (k === 'fontreset') { delete show.font; touch(); return rebuild(); }
            if (k === 'rephoto' && s) { const l = await pickMedia({multi: false, title: 'Changer la photo'}); if (l[0]) { s.media_id = l[0].media_id; s.filename = l[0].filename; touch(); await rebuild(); } return; }
            if (k === 'portrait' && s) { const l = await pickMedia({multi: false, title: 'Une photo ronde au-dessus du titre'}); if (l[0]) { s.media_id = l[0].media_id; s.filename = l[0].filename; touch(); await rebuild(); } return; }
            if (k === 'noportrait' && s) { delete s.filename; delete s.media_id; touch(); return rebuild(); }
            if (k === 'music') { const l = await pickMedia({kind: 'audio', multi: false, title: 'Une musique'}); if (l[0]) { show.music = {media_id: l[0].media_id, filename: l[0].filename, title: l[0].title}; music?.pause(); music = null; touch(); paintMusic(); } return; }
            if (k === 'nomusic') { show.music = null; music?.pause(); music = null; touch(); paintMusic(); return; }
            if (k === 'rec') return rec();
            if (k === 'voicedel' && s) { delete s.voice; touch(); paint(); return; }
            if (k === 'voicefit' && s?.voice) { const d = await audioDur(mediaUrl(s.voice.filename)); if (d) { s.dur = Math.ceil(d + .8); touch(); paint(); } return; }
            if (k === 'voicepick' && s) { const l = await pickMedia({kind: 'audio', multi: false, title: 'Une voix, un son'}); if (l[0]) { s.voice = {media_id: l[0].media_id, filename: l[0].filename}; touch(); paint(); } return; }
            if (k === 'routeperson' && s) { const pid = await askPerson('Les lieux de la vie de qui ?'); if (!pid) return; try { const {route, p} = await placesOf(pid); if (!route.length) return toast('Aucun lieu avec des coordonnées pour cette personne (Lieux → coordonnées).', 'error'); s.route = [...(s.route || []), ...route]; if (!s.title || s.title === 'Le trajet') s.title = `Les lieux de la vie de ${p.first_name || ''}`.trim(); touch(); await rebuild(); } catch (err) { toast(err.message, 'error'); } return; }
        });
        dlg.addEventListener('input', async e => {
            const el = e.target, s = show.slides[cur];
            if (el.matches('[data-ss-seek]')) { if (playing) play(); drawAt(Number(el.value) / 1000 * eng.total()); const i = eng.starts().findIndex((a, k, arr) => t >= a && (k === arr.length - 1 || t < arr[k + 1])); if (i >= 0 && i !== cur) { cur = i; paintList(); paintProps(); } return; }
            if (el.dataset.ssP && s) { const k = el.dataset.ssP; s[k] = k === 'dur' ? clamp(Number(el.value) || 5, 1, 120) : el.value; touch(); if (['mapBg'].includes(k)) await rebuild(); else { drawAt(t); if (['dur', 'title', 'text', 'notes'].includes(k)) paintList(); } return; }
            if (el.dataset.ssR && s) { const [i, k] = el.dataset.ssR.split(':'); s.route[Number(i)][k] = el.value; touch(); drawAt(t); return; }
            if (el.dataset.ssG) { const k = el.dataset.ssG; if (k === 'musicVol') { show.musicVol = Number(el.value) / 100; if (music) music.volume = show.musicVol; touch(); return; } show[k] = el.value; touch(); await rebuild(); return; }
            if (el.matches('[data-ss-name]')) touch();
        });
        // ＋ un lieu au trajet : le menu de choix unique (sorte place) ; ses coordonnées viennent de la recherche des lieux
        dlg.addEventListener('picker-change', async e => {
            const it = e.detail.item, s = show.slides[cur], field = e.target.closest('[data-ss-addplace] .pk');
            if (!field || !it?.id || !s) return;
            const c = await (ext.placeCoords ? ext.placeCoords(it) : Promise.resolve({}));
            (window.LCNDA_PICKER || A()).pickerSet(field, null);
            if (c.lat === '' || c.lat == null) return toast(`« ${it.title} » n’a pas encore de position sur la carte.`, 'error');
            const nm = String(it.name || it.title).replace(/\s*\(.*\)$/, '');
            s.route = s.route || []; s.route.push({name: nm, label: nm, year: '', lat: +c.lat, lon: +c.lon}); touch(); await rebuild();
        });
        // glisser une diapositive pour changer l'ordre
        let dragI = -1;
        dlg.addEventListener('dragstart', e => { const li = e.target.closest('[data-ss-i]'); if (!li) return; dragI = Number(li.dataset.ssI); e.dataTransfer.effectAllowed = 'move'; });
        dlg.addEventListener('dragover', e => { if (dragI >= 0 && e.target.closest('[data-ss-i]')) e.preventDefault(); });
        dlg.addEventListener('drop', async e => { const li = e.target.closest('[data-ss-i]'); if (dragI < 0 || !li) return; e.preventDefault(); const to = Number(li.dataset.ssI); const [m] = show.slides.splice(dragI, 1); show.slides.splice(to, 0, m); cur = to; dragI = -1; touch(); await rebuild(); });
        dlg.addEventListener('dragend', () => { dragI = -1; });
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (document.fullscreenElement) return; close(); });
        dlg.addEventListener('keydown', e => {
            if ([...document.querySelectorAll('dialog[open]')].at(-1) !== dlg) return; // une fenêtre par-dessus garde ses touches
            const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
            if (mod && key === 's') { e.preventDefault(); save(); return; }
            if (e.target.closest('input, textarea, select, [contenteditable]')) return;
            if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
            if (mod && key === 'y') { e.preventDefault(); redo(); return; }
            if (e.key === ' ') { e.preventDefault(); play(); }
        });
        await rebuild(); goSlide(0); commit(); histBtns();
        if (ctx.story) story(Number(ctx.personId) || 0);
        return {get show() { return show; }, play, save, frame: tt => eng.frame(tt)};
    }

    ext.openSlideshow = open;
    ext.slideshowInternals = {makeEngine, mapBackground, whenOf, fullDate};
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
        extra: '<button type="button" class="button secondary" data-et-x="story" title="Les photos, les lieux et la vie d’une personne, en diaporama tout fait">✨ Récit d’une vie</button><button type="button" class="button secondary" data-et-x="kimport" title="PowerPoint (.pptx), OpenDocument (.odp), PDF, images, Markdown, texte, JSON">⤒ Importer une présentation</button>',
        onExtra: (k, again) => { if (k === 'story') open({story: true, onSaved: again, onClose: again}); if (k === 'kimport') ext.importPresentation ? ext.importPresentation({onSaved: again, onClose: again}) : toast('L’éditeur de présentation n’est pas chargé.', 'error'); }});

    /* ✨ sur la fiche d'une personne : un bouton dans la rangée du haut (ext.afterPerson, sans toucher app.js) */
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return;
        const row = document.querySelector('#workspace .person-hero-actions'); if (!row || row.querySelector('[data-ss-story-person]')) return;
        row.insertAdjacentHTML('afterbegin', `<button type="button" class="icon-action h-ss-storybtn" data-ss-story-person="${Number(p.id)}" title="✨ Récit d’une vie : un diaporama tout fait à partir de cette fiche" aria-label="Récit d’une vie en diaporama">✨</button>`);
    });
    injectCss();
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-ss-story-person]'); if (!b) return; e.preventDefault(); open({story: true, personId: Number(b.dataset.ssStoryPerson)}); });
})();
